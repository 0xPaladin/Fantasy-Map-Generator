# PRD — Assistant: OpenRouter & Z.ai providers, and user customization (AGENTS, Skills, Prompts)

Updated: 2026-11-09. Inputs: [assistant.md](assistant.md) (the parent PRD),
[Assistant.md](../wiki/Assistant.md), the provider family under `src/services/assistant/provider/`,
and live API checks of `openrouter.ai/api/v1` and `api.z.ai/api/paas/v4` (2026-11-09).

## Goal

Two upgrades to the Azgaar Assistant, in three shippable phases:

1. **Two new providers** — OpenRouter and Z.ai — reusing the existing OpenAI-compatible
   adapter. Both are OpenAI-compatible chat APIs, so this is provider specs plus discovery
   filtering, not new adapters.
2. **Customization** — the user teaches the Assistant their own conventions:
   - **AGENTS instructions**: one standing markdown document (the AGENTS.md convention) that
     rides the system prompt of every question.
   - **Skills**: named markdown documents the model fetches on demand, like `read_docs` topics.
   - **Prompts**: reusable prompt templates the user inserts into the composer.

## Non-negotiables

- **No new adapters.** Both providers go through `completeOpenAI`. The native Anthropic path is
  untouched.
- **No new production dependencies.**
- **Prompt-cache stability.** The built-in instructions stay byte-identical; custom content is
  appended after them, and the cache mark moves to the last system block. Custom content only
  changes when the user edits it.
- **Browser-only storage.** Customization lives in LocalDB (IndexedDB) like chats — never in the
  `.map` file, never on a server. Import/export as markdown for sharing.
- **The built-in rules stay authoritative.** Custom instructions are introduced as the user's
  preferences, subordinate to the app's own rules (read-only scripts, proposals, answer format).
- **Key-tier only in effect.** The Azgaar server cannot use user content, so customization
  changes what the Provider answerer sends; free tiers keep their answers. The UI says so.

## Part 1 — Providers

### Specs

`ProviderSpec["id"]` gains `"openrouter" | "zai"`; two entries in `PROVIDERS`:

```ts
{
  id: "openrouter",
  label: "OpenRouter",
  fallbackModel: "anthropic/claude-sonnet-4.5",
  keyLink: "https://openrouter.ai/settings/keys",
  baseUrl: "https://openrouter.ai/api/v1"
},
{
  id: "zai",
  label: "Z.ai",
  fallbackModel: "glm-4.6",
  keyLink: "https://z.ai/manage-apikey/apikey-list",
  baseUrl: "https://api.z.ai/api/paas/v4"
}
```

- `anthropic/claude-sonnet-4.5` verified present on OpenRouter today; `DEFAULT_PROVIDER` stays
  OpenAI and all connection semantics (`get`/`save`/`clear`, per-provider key and model storage,
  `fmg-ai-kl-openrouter`, `fmg-ai-kl-zai`) work unchanged.
- The key-sheet provider `<select>` is built from `PROVIDERS`; no markup change.

### Model discovery

- **OpenRouter** — `GET /api/v1/models` is public (462 models at check time; no key needed, so
  discovery works before a key is typed). It returns rich metadata, so a regex filter is wrong
  here. A special case `fetchOpenRouterModelIds` (the precedent is `fetchQwenModelIds`) keeps a
  model when:
  - `supported_parameters` includes `"tools"` — the Assistant is tool-bound; a model that cannot
    call tools is unusable, and 398 of 462 pass;
  - `architecture.output_modalities` includes `"text"`;
  - the id has no variant suffix `:batch` (asynchronous) or `:online` (billed web search).
    `:free`, `:thinking`, `:nitro` and friends stay.
- **Z.ai** — `GET /models` with the bearer key; route confirmed to exist (401 without a key).
  The generic `json.data[].id` path plus a `FILTERS.zai = { include: /^glm/ }` guard. If the
  endpoint's shape differs for a real key, discovery fails inline and the typed-id path applies
  (PRD: discovery errors never block Connect).
- The model `<datalist>` absorbs a few hundred OpenRouter ids fine; ids stay in API order.

### Request handling

- **Attribution headers.** OpenRouter reads optional `HTTP-Referer` and `X-Title` headers (its
  own convention for app attribution). One helper in `providers.ts`:

  ```ts
  const extraHeaders = (providerId: ProviderSpec["id"]): Record<string, string> =>
    providerId === "openrouter"
      ? { "HTTP-Referer": location.origin, "X-Title": "Fantasy Map Generator" }
      : {};
  ```

  spread into `completeOpenAI`'s headers. (`HTTP-Referer` is a custom header name, not the
  forbidden `Referer`.)
- **Output limit.** GLM 4.5+ are reasoning hybrids: add `api\.z\.ai` to `outputLimit`'s 8192
  group in `openai.ts`. OpenRouter keeps the 4096 default; `max_tokens` (not OpenAI's
  `max_completion_tokens`) is sent because the base URL is not `api.openai.com`.
- **Usage.** Both report standard `usage.prompt_tokens` / `completion_tokens`; OpenRouter's
  per-provider cached reads arrive as `prompt_tokens_details.cached_tokens`, already read by
  `fromChatResponse`. OpenRouter's `usage.cost` is ignored — the chat footer counts tokens.
- Everything else (timeout, image retry, tool-call round-trip, empty-turn filtering) already
  routes through the shared path.

### Docs

- [Assistant.md](../wiki/Assistant.md): the provider sentence gains OpenRouter and Z.ai.
- Knowledge Base: one entry on picking a provider, mentioning OpenRouter as the one-key-many-
  models option (its `:free` models) and Z.ai's free `glm-4.5-flash`.

### Tests

- `providers.test.ts`: both specs resolve; `endpoint()` and `keyStorageForProvider` correct.
- `models.test.ts`: OpenRouter metadata filter (drops a model without `tools`, keeps `:free`,
  drops `:batch`/`:online`); Z.ai include filter; mocked fetch.
- `openai.test.ts`: OpenRouter request carries attribution headers; Z.ai gets `max_tokens`
  8192.
- `discovery.test.ts` (DOM): the key sheet lists OpenRouter models from a mocked response.

## Part 2 — Customization

### Vocabulary

- **Custom instructions** — the AGENTS document: one markdown text the user writes or imports;
  the AGENTS.md convention in a single field, not a file system.
- **Skill** — a named markdown document with a one-line description, enabled or disabled. Its
  body is fetched by the model through `read_skill`, never carried in the system prompt.
- **Prompt** — a named text template the user picks from the composer; it fills the box, it is
  not sent by itself.

### Data model and storage

New service `src/services/assistant/customization.ts` (no world state, no DOM — service layer):

```ts
export interface CustomInstructions {
  text: string; // markdown, capped
  updated: number;
}
export interface Skill {
  id: string;
  name: string; // unique, <= 40 chars
  description: string; // one line, <= 120 chars
  body: string; // markdown, capped
  enabled: boolean;
  updated: number;
}
export interface Prompt {
  id: string;
  name: string; // <= 40 chars
  text: string;
  updated: number;
}
```

- LocalDB keys `fmg-assistant-instructions`, `fmg-assistant-skills`, `fmg-assistant-prompts`;
  one JSON array each, loaded lazily like `chats.ts`.
- Caps with an inline warning, not a block: instructions 16,000 chars (≈ 4k tokens — the built-in
  prompt's own budget); each skill body 32,000 chars; at most 50 skills, 50 prompts.
- Import accepts `.md`; optional YAML front matter sets `name`/`description` (a skill file is
  plain markdown without it: the file name becomes the name, the first heading line the
  description). Export writes the front matter back, so files round-trip; `AGENTS.md` imports as
  instructions, everything else as a skill. Prompts import/export the same way.

### Prompt assembly and caching

`context.ts` replaces the single `SYSTEM_PROMPT` export with an assembly:

```ts
export function systemBlocks(custom: {
  instructions: string;
  skills: { name: string; description: string }[]; // enabled only
}): SystemBlock[];
```

- Block 1: today's static prompt, unchanged byte-for-byte.
- Block 2 (only when instructions are set): `# The user's instructions` + the text + one closing
  line: these are the user's preferences for their worlds; the rules above still hold when they
  conflict.
- Block 3 (only when a skill is enabled): a `# Skills` index — one `- name: description` line
  each — and one line saying to call `read_skill("<name>")` before a task that matches. Bodies
  never ride the prompt.
- `cache_control` moves from block 1 to **the last block**, so Anthropic caches the whole prefix
  including custom content; OpenAI-compatible providers cache by their own prefix match.
- An edit invalidates the provider prompt cache for the next question — one-time cost, disclosed
  in the sheet. It does **not** start a new chat: history shape is unchanged.
- `answerer.ts` passes the blocks from `customization` state at question start; mid-question
  consistency is automatic (blocks are read once per question).

### The read_skill tool

Registered next to the Knowledge tools in the Provider answerer, but only when at least one
skill is enabled:

```ts
{
  status: "Reading skill",
  definition: {
    name: "read_skill",
    description: "Read one of the user's skills by name: a workflow or convention they want followed. The Skills list in the system prompt names them.",
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] }
  }
}
```

- Returns the body as-is; an unknown name returns the available names (the `read_docs` pattern).
- Free tiers never see it — the Azgaar server answerer has no local tools.

### UI

One new in-panel view, **Customize**, beside the key sheet and chat list (same pattern as
`key-sheet.ts`, a `customize.ts` controller). Opened from a small edit/pencil button in the
panel's title bar.

- **Instructions section**: monospace textarea, char counter against the cap, Import / Export
  buttons, Save. Saving while an answer runs is allowed — it applies from the next question.
- **Skills section**: rows of name, description, enabled checkbox, Edit, Delete; `+ New skill`
  and Import (multi-select `.md`). The editor is name, description, body. Export per skill.
- **Prompts section**: rows of name and a text preview; `+ New`, Edit, Delete, Export. No
  placeholders in v1 — the map context already carries the open note and selection.
- **Composer prompt menu**: a small `✦` button beside the send button, disabled while
  answering, listing prompts by name; a click inserts the text into the box (replacing empty
  content, appending on a new line otherwise) and focuses it.
- The sheet carries the tier note: _Custom content is used when your own key answers._ In
  Guest/Member the sections stay editable but inert, so the user can prepare before connecting.
- Locale strings added to `en.json`; other languages fall back until translated.

### Security

- Instructions ride the system prompt and skills return as tool results — the same trust class
  as the user's own notes and questions. Imported files from someone else are called out in the
  sheet's intro line (one sentence), matching the key-sheet warning style.
- The built-in subordination line is the guard against imported instructions that try to
  override the app's rules (read-only scripts, proposals before changes). `Notes.write`'s
  safe-HTML rule is unaffected: skills only steer text.
- No scripts in skills. `read_map` already runs model-written JavaScript under the existing,
  disclosed risk; adding a second execution path would widen it for no gain.

### Tests

- `customization.test.ts`: CRUD and caps; front-matter import/export round-trip; AGENTS.md
  imports as instructions.
- `context.test.ts`: assembly adds nothing when empty; block order and the subordination line;
  `cache_control` sits on the last block only; built-in block unchanged (byte-compare).
- `answerer.test.ts`: `read_skill` resolves, unknown name lists names; the tool is absent when
  no skill is enabled; blocks come from the store.
- DOM (assistant controller suite): Customize view renders, saves, imports; the composer menu
  inserts text and is disabled while answering.

## Implementation phases

Each phase is additive and independently shippable; rollback is reverting the phase's commits.

**Phase 1 — Providers (small).**
`providers.ts`, `models.ts`, `openai.ts`; tests above; wiki sentence + KB entry.
~1 day. No UI code beyond the auto-populated provider list.

**Phase 2 — Customization core (medium).**
`customization.ts` (new), `context.ts`, `answerer.ts`; tests above. The feature works invisibly
(no editing UI yet) once instructions are seeded by hand — acceptable mid-point, not shipped
alone.
~1–2 days.

**Phase 3 — Customize UI and prompts (medium).**
`controllers/assistant/customize.ts` (new), `index.ts` (title-bar button, view markup, composer
menu), `en.json`; DOM tests; wiki section + KB entry + Policy line about imported content.
~2 days.

## Out of scope

- Custom providers with user-typed base URLs (a general "OpenAI-compatible" provider entry) —
  the `local` provider already covers self-hosted; a named entry keeps discovery honest.
- Skills that ship with the app. If wanted later, they are data files under `src/data/`, listed
  read-only beside the user's own.
- Placeholders in prompts (`{selection}`, `{state}`), scheduled/automatic prompts, prompt
  sharing beyond file export.
- Sending customization to the Azgaar server, or storing it in the `.map` file.
- Streaming, per-model provider overrides, and cost display from OpenRouter's `usage.cost`.

## Open questions

- OpenRouter's default model (`anthropic/claude-sonnet-4.5` today) is reviewed each release like
  every fallback model; the review note belongs in release notes, not code.
- If Z.ai's `/models` shape turns out nonstandard with a real key, the tolerant parser (accept
  `data[].id` or a flat string array) is a five-line fix inside `fetchModelIds`; typed ids
  already cover the user meanwhile.
