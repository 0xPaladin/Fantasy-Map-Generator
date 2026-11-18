# Plan — Lazy Alternate Dungeon Profiles in Marker Notes

Updated: 2026-11-18. Status: **slices 1–3 shipped** (lazy marker content plumbing; the
genericized dungeon data and deterministic profile/area generator; marker integration and the
dungeon renderer). Slice 4, reroll and exports, is next. Source procedure: *Freebooters on the
Frontier 2e,
Vol. III — Overland & Underworld* (`FotF2e - 03 Overland & Underworld.md`, dungeon procedure
lines 1237–3083). The source is a **procedure reference only**: every table string in the
implementation is rewritten in the generator’s own generic vocabulary. See
[Licensing and generic vocabulary](#licensing-and-generic-vocabulary).

## Problem

Dungeon markers are the thinnest stories on the map. Every one is named “Dungeon” and its note
contains only the Watabou link and iframe, seeded by map seed and cell. A full text profile
would add several KB per dungeon, which is the wrong thing to generate eagerly for every marker
on every map.

The feature therefore needs two parts:

1. A deterministic dungeon profile generator.
2. A generic **lazy content** slot on markers, so the text is produced only when someone actually
   reads the dungeon. The same slot can later hold ruins, monster lairs, and other generated
   descriptions.

## Review: what exists today

| Piece | State |
|---|---|
| `docs/wiki/Markers.md` | “Special markers” (lines 30–34) documents the Watabou link and iframe, the seed URL and the HTML used for previews |
| `Markers` config | `dungeons` entry in `src/model/story/markers-generator.ts` (lines 677–687) |
| `listDungeons` | `src/model/story/markers-generator.ts` (lines 1344–1346): unoccupied cells with population 1–2 |
| `addDungeon` | `src/model/story/markers-generator.ts` (lines 1348–1354): name `Dungeon`; note is the Watabou link + iframe |
| Notes | `note` is HTML on the marker (`docs/architecture/data-model.md`, line 383). The generator writes `marker.note` directly because the iframe is outside the notes subset |
| Hover | `MapTooltip.showNotes` uses `Notes.get` (`src/ui/map/map-tooltip.ts:66`), so a huge generated note would render in the hover box |
| Notes editor | `NotesEditor` uses `Notes.get` / `Notes.set` and opens iframe notes in HTML source mode (`notes-editor.ts:223–290`) |
| Notes list | `Notes.list()` drives the editor dropdown, CSV note export and the font scan in `save.ts:98` |
| Marker exports | `markers-overview.ts:551` and `services/io/export.ts:878` read `marker.note` directly |
| Save format | `save.ts:141` serializes `pack.markers` wholesale; any cached marker field is saved with the map |
| Astral conversion | `astral-markers.ts` prepends an anomaly legend to `marker.note`; it does not know about generated content |
| Tests | `markers-generator.test.ts` covers encounters, rename and mines; no dungeon tests |

Two small fixes worth doing while this area is touched:

- Add the documented `rel="noopener"` to the Watabou link.
- Keep the existing Watabou seed string (`${options.map.seed}${cell}`) for compatibility, but use
  a namespaced key for the profile seed (`${seed}:dungeon:${cell}`).

## The lazy model

### Marker field

Add one optional, generic field to `Marker`:

```ts
export interface MarkerGeneratedContent {
  /** the generator that owns this content: "dungeon" first, later "ruin", "monster", … */
  kind: string;
  /** bump when the generator output changes; lets a migration invalidate cached html */
  version: number;
  /** stable input for the generator; enough to rebuild the content */
  seed: string;
  /** rendered notes-subset HTML; absent until the content is first read */
  html?: string;
}

export interface Marker {
  // …
  generated?: MarkerGeneratedContent;
}
```

Why a generic field instead of a dungeon-specific one:

- One mechanism for every future generated note (ruins, lairs, monster encounters, etc.).
- The field is serialized only when present; a new dungeon costs a `kind`, `version` and `seed`
  (roughly 60–100 bytes), not a full note.
- `html` is a cache, not the source of truth. If it is missing, the renderer rebuilds it from
  `seed`.

### When content is produced

| Event | Effect |
|---|---|
| Marker generation (`addDungeon`) | Writes `generated = { kind: "dungeon", version: 1, seed }` and the short Watabou note. No profile is generated |
| Marker name | Only the name is rolled eagerly (one cheap name table lookup) so the overview can show a real dungeon name; the rest stays lazy |
| Notes editor opens a marker | `ensureGenerated(marker)` fills `generated.html` and the editor shows the combined note |
| Marker editor reroll | Rebuilds `generated.html` with a new salt |
| Markers overview / CSV / GeoJSON export | Renders on demand; `cache: false` so exporting does not grow the save |
| Hover / notes preview | Uses the short `note` only; never materializes generated content |
| Save after a profile was opened | Serializes the cached `generated.html` for that marker only |

The map grows only for dungeons whose notes were actually opened (or whose content was edited),
not for every dungeon on the map. If zero persistence is required later, a save option can strip
`generated.html` and rebuild from `seed` on load; the cost is losing manual edits to the
generated section.

### Generic content module

Create `src/model/story/marker-content.ts`:

```ts
export type GeneratedRenderer = (marker: Marker, content: MarkerGeneratedContent) => string;

export function ensureGenerated(marker: Marker, options?: { cache?: boolean }): string | undefined;
export function fullNote(marker: Marker, options?: { cache?: boolean }): string;
export function setFullNote(marker: Marker, html: string): void;
```

- `ensureGenerated` looks up a renderer by `content.kind`, renders if `html` is absent, and caches
  when `cache !== false`.
- `fullNote` returns `marker.note + <hr><h3>Dungeon profile</h3> + html` for the dungeon kind.
  The divider is a stable, plain-markup replace point.
- `setFullNote` splits at the divider: the prefix is written to `marker.note`, the suffix to
  `generated.html`. That keeps the note editor editable without duplicating the profile in the
  note. If the divider or content is missing, the whole text goes to `note` and the generated
  recipe is dropped; the next reroll rebuilds it.
- The renderer registry starts with `dungeon`; a later `ruin` or `monster` renderer registers
  alongside it. No dungeon code needs to live in the marker generator.

`src/model/story/dungeon-marker.ts` is the bridge for the first kind: it reads the cell's culture,
alignment, biome and place names into a `DungeonContext`, produces the eager name and registers
the `dungeon` renderer with the registry.

### Notes API

Add a full/short split to `Notes` so hover stays cheap:

| Method | Purpose |
|---|---|
| `Notes.get(ref)` | Short note only; used by hover and tooltips. Unchanged behavior |
| `Notes.getFull(ref)` | Short note + lazily generated section; used by the notes editor and assistant |
| `Notes.set(ref, note)` | Writes the short note; used by generators and simple edits |
| `Notes.setFull(ref, html)` | Splits generated content via `setFullNote`; used by the notes editor and notes CSV upload |
| `Notes.list()` | Non-materializing list; includes markers that have `generated` even if `note` is empty. Used by the editor dropdown and the font scan |
| `Notes.listFull()` | Materializes for CSV note export only; never called during save |

Consumers to update:

- `notes-editor.ts`: `showNote`, `updateLegend`, `updateNotesBox` and `current()` use the full
  methods; source mode already handles the iframe.
- `save.ts:98`: keep using `Notes.list()` so saving does not materialize every profile.
- `markers-overview.ts`: CSV export uses `Notes.getFull(ref, { cache: false })`.
- `services/io/export.ts`: GeoJSON marker export uses `Notes.getFull(ref, { cache: false })`.
- `map-tooltip.ts`: unchanged; hover stays on the short note.
- `astral-markers.ts`: unchanged; it edits `note`, and `fullNote` still appends the generated
  section.
- Assistant note context: use `getFull` when the assistant reads a marker, so the profile is
  available to it without changing the stored note.

## What gets generated

The source’s sequence is followed, with all prose rewritten generically.

### 1. Big picture (source lines 1517–1853)

- **Name**: template + place/adjective/noun rolls. `[Name]` uses the local culture name.
  This is the only eager roll; `marker.name` stores it.
- **Size**: 1d20 → small/medium/large/huge; total areas and theme count from the size table.
- **Alignment and safety**: 1d12 through the local culture’s prevailing alignment column;
  fallback `neutral` when the traits layer is off.
- **Themes**: 1d20 category → 1d12 theme, count from size. Resolve element, magic, strange-feature
  and “turn it up” results inline. Draw distinct themes where possible.
- **Overview**: dungeon type, situation, accessibility, condition, builder, cause of ruin.
- **Type-specific overview**:
  - lair/den/hideout: main occupant, entrance, defenses
  - caves/caverns: cave type, entrances, entrance type
  - mine: resource, entrance, method
  - prison: prisoner type, perimeter, security
  - stronghold/fortress: approach, defenses, threat
  - crypt/tomb: occupant, marker, entrance
  - temple/sanctuary: religion, dedication, primary role
  - laboratory/retreat: practitioner, focus of study, method
  - origin unknown: entrance, inhabitants, legendary foe

### 2. Area draft (source lines 1855–2835)

Generate exactly the rolled number of areas.

For each area roll:

- **Area type** (1d20)
- **Contents** (1d12 → number of discoveries and dangers)
- **Dressing** (1d10; `10` combines two rolls)
- **Exits** (1d8 → 1, 2, 3, 4, 1d4+1 or 1d6+5)

Then resolve each exit with the type’s connection table: direction (1d20) and form (1d12).
“Back” exits prefer an existing area; other exits become open connections.

Build the draft as a graph:

- The entrance leads to area 1.
- After each area, pick a random open connection and attach the next area.
- Remaining open connections become unexplored exits.
- Cross-type redirects (`roll AREA for random type`, `roll SPECIAL AREA for random type`) follow
  at most two levels, then fall back to a plain chamber.

Each area records number, area type, dressing, discoveries, dangers and exits. `BOOTY STASH`
becomes **Treasure cache** with the same dice notation (`1d4+1`, etc.); do not invent values.

### 3. Dangers (source lines 2837–2920)

- Leader: 1d12 → monstrous / humanoid / human, then the matching 1d10 prompt.
- Creature: 1d12 + safety modifier → monster / animal / humanoid, then resolve element, magic,
  strange-feature or ability prompts.
- Hazard: 1d12 → unnatural / natural / trap, then the matching 1d10 prompt.

For flavor, attach at most one descriptor (activity, adjective, condition, aberration). Do not
generate HP, armor, damage or treasure values.

### 4. Rumors (source lines 1349–1365)

Generate 2–3 short rumors from established facts, not new mechanics:

- local culture and alignment
- biome/terrain
- dungeon name, type, builder and cause of ruin
- one theme

Use the existing `RUMOR_SOURCES` voice in `src/data/markers.ts` where it fits. Mark them as
rumors so the user can decide what is true.

## Data and module layout

### `src/data/dungeons.ts`

Pure tables, no `pack` or `options` access. Group tables by dungeon type so the generator does not
need a 200-case switch.

```ts
export type DungeonSize = "small" | "medium" | "large" | "huge";
export type DungeonTypeId =
  | "lair"
  | "caves"
  | "mine"
  | "prison"
  | "stronghold"
  | "crypt"
  | "temple"
  | "laboratory"
  | "unknown";

export interface DungeonTypeTables {
  label: string;
  overview: readonly OverviewField[];
  areaTypes: readonly AreaTypeRow[];
  contents: readonly ContentsRow[];
  dressing: readonly string[];
  exits: readonly ExitsRow[];
  connections: { direction: readonly string[]; form: readonly string[] };
  specialAreas: readonly string[];
  discoveries: { feature: readonly string[]; find: readonly string[] };
}
```

Plus name, size, alignment/safety, theme, overview, danger, creature and detail tables.

Use `1dN`-sized readonly arrays wherever possible. Weighted tables get explicit
`{ value, weight }` rows.

### `src/model/story/dungeon-generator.ts`

Pure functions over an injected context and RNG:

```ts
export interface DungeonContext {
  seed: string;
  cell: number;
  cultureName: string;
  alignment: Alignment;
  biomeName: string;
  height: number;
  stateName?: string;
  provinceName?: string;
  religionName?: string;
}

export interface DungeonArea {
  number: number;
  type: string;
  kind: DungeonTypeId;
  dressing: string;
  discoveries: string[];
  dangers: string[];
  exits: { to: number | "open"; direction: string; form: string }[];
}

export interface DungeonProfile {
  name: string;
  size: DungeonSize;
  areaCount: number;
  themes: string[];
  alignment: Alignment;
  safety: string;
  type: DungeonTypeId;
  overview: { label: string; value: string }[];
  areas: DungeonArea[];
  rumors: string[];
}

export function generateDungeonName(context: DungeonContext): string;
export function generateDungeonProfile(context: DungeonContext, salt = ""): DungeonProfile;
export function renderDungeonProfile(profile: DungeonProfile): string;
```

`generateDungeonName` uses the same seed and RNG as the profile, so `marker.name` and the profile
title agree. The profile generator takes the marker’s current name as an override so a user rename
wins.

RNG: `createRng(`${context.seed}:dungeon:${context.cell}${salt}`)` from `src/utils/rng.ts`.
Use `salt` only for manual rerolls.

`renderDungeonProfile` returns only notes-subset HTML (`h3`, `h4`, `p`, `ul`, `ol`, `li`,
`strong`, `em`, `hr`). Escape every context string with `escapeHtml`.

### `markers-generator.ts` integration

`addDungeon` builds the context and writes:

```ts
const watabou = `<div>Undiscovered dungeon. See <a href="…" rel="noopener" target="_blank">One page dungeon</a></div><iframe …></iframe>`;
marker.name = generateDungeonName(context);
marker.note = watabou;
marker.generated = { kind: "dungeon", version: 1, seed: context.seed };
```

No profile HTML is written until `ensureGenerated` is called. `addDungeon` should not overwrite an
existing `generated.html` if a marker of the same type is added twice by the marker creator.

Context fields:

- `seed`: `options.map.seed`
- `cell`: marker cell
- `cultureName`: `pack.cultures[cells.culture[cell]]?.name`, fallback to `Names.getCulture`
- `alignment`: culture alignment or `neutral`
- `biomeName`: `pack.biomes[cells.biome[cell]]?.name` or `wilderness`
- `height`: `cells.h[cell]`
- `stateName`, `provinceName`: names when the cell belongs to one
- `religionName`: cell religion when present

## Licensing and generic vocabulary

The procedure (roll a die, pick from a list, connect areas) is functional and not the thing to
worry about. The table prose is. Do **not** paste the source document into TS. Write new table
strings in the generator’s voice, keep only the dice ranges and generic category data, and remove
product-specific terms.

Required substitutions in code, output and wiki:

| Source term | Generic output |
|---|---|
| `BOOTY STASH` | `Treasure cache` |
| `bd` / booty dice | `treasure roll` |
| `CREATURE` | `Creature` |
| `PERSONAL ITEM` | `Personal item` |
| `ODDITY` | `Strange feature` |
| `MAGIC TYPE` | `Magic theme` |
| `ELEMENT` | `Element` |
| `seclusium` | `remote laboratory` / `wizard’s retreat` |
| `Underlands` | `deep caverns` / `underworld` |
| `GONZO` | `Strange` / `wild` |
| `BEAST` | `Animal` |
| `WILD HUMANOID` | `Savage humanoid` |
| `CLASSIC FOE` | `Legendary foe` |
| `DUNGEON DANGER` | `Dangers` |
| `Judge`, `Freebooters` | omit from generated text |

Keep source attribution in this plan and a short code comment (“procedure adapted from …; all
table text rewritten”), not in the user-facing note. Add a data test that rejects the banned terms
(`booty`, `seclusium`, `gonzo`, `freebooters`, `underlands`, `bd `) in generated table strings.

## Build order

Each slice should leave the app working.

1. **Lazy content plumbing — shipped 2026-11-18**
   - Add `MarkerGeneratedContent` and `Marker.generated`.
   - Add `src/model/story/marker-content.ts` with the renderer registry, `ensureGenerated`,
     `fullNote` and `setFullNote`.
   - Add `Notes.getFull`, `Notes.setFull` and `Notes.listFull`; keep `Notes.get` and `Notes.list`
     short and non-materializing.
   - Update `notes-editor.ts`, save font scan and the data-model docs.
   - Tests: short note vs full note, split/merge, save does not materialize.
2. **Dungeon data + generator — shipped 2026-11-18**
   - Genericized `src/data/dungeons.ts`.
   - Big-picture generator, area draft, dangers, rumors.
   - Tests for determinism, counts, redirect limits, escaping and banned terms.
3. **Marker integration — shipped 2026-11-18**
   - `addDungeon` writes name, Watabou note and the lazy `generated` seed.
   - Register the dungeon renderer in `dungeon-marker.ts`.
   - Tests: no profile html before first read; profile present after `ensureGenerated`; Watabou
     prefix preserved.
4. **Reroll and exports**
   - `Markers.regenerateDungeonProfile(markerId, salt?)` on top of `generated.html`.
   - Marker-editor reroll button, visible for dungeons only.
   - Markers overview, CSV and GeoJSON use `getFull(..., { cache: false })`.
   - Tests: reroll replaces html, not the Watabou note; export does not cache.
5. **Docs and manual check**
   - Update `docs/wiki/Markers.md` with the lazy behavior, the profile sections and the reroll
     button.
   - Update `docs/architecture/data-model.md` with the `generated` field.
   - Open a dungeon on an old map, verify the profile appears and the save grows only after that.

## Tests

- `src/model/story/marker-content.test.ts`
  - no `generated` → `undefined`
  - seed-only → first `ensureGenerated` fills html; second call reuses it
  - `cache: false` renders without setting html
  - `fullNote` merges; `setFullNote` splits; missing divider falls back safely
- `src/model/story/dungeon-generator.test.ts`
  - same seed + context → same name and profile
  - different seeds → different output
  - size rolls map to the correct area/theme ranges
  - culture alignment honored; neutral fallback
  - area graph closes, exits resolve, recursive redirects stop
  - 100 seeds produce no `undefined`, `NaN` or empty headings
  - rendered profile passes `isSafeHtml` and escapes `<script>` in culture names
  - generated table strings contain none of the banned source terms
- `src/model/story/markers-generator.test.ts`
  - `addDungeon` sets `generated.kind/seed/version`, no `html`, and keeps the Watabou URL/iframe
  - marker name matches the eager name roll
  - `regenerateDungeonProfile` replaces html and preserves the Watabou note
- `src/model/story/notes.test.ts`
  - `Notes.get` returns the short note; `Notes.getFull` returns note + profile
  - `Notes.setFull` writes user text to `note` and generated text to `generated.html`
  - `Notes.list` does not materialize; `Notes.listFull` does
- `src/controllers/story/markers/markers-editor.test.ts`
  - reroll button appears for dungeons only
  - clicking it updates the generated html without closing the dialog

## Risks and open questions

- **Cache persistence**: opened profiles are cached in the marker and saved. That is the intended
  lazy-load behavior, but a user who opens every dungeon still gets the KB-per-dungeon cost. A
  later “strip generated html on save” option can make the cache purely transient, at the cost of
  losing edits to generated text.
- **Map edits between generation and first open**: the profile is derived from the current
  culture/biome/state context. If those are regenerated first, the profile may differ from what
  the map implied at marker creation. The eager name roll is stored on the marker, so at least
  the name stays.
- **Divider edits**: if a user removes or rewrites the profile heading, `setFullNote` treats the
  whole text as the short note and drops the generated recipe. The next reroll restores a clean
  section.
- **HTML mode**: the Watabou iframe keeps the note in source mode. That is existing behavior.
- **Megadungeon** (1d20 = 20): first slice treats it as a huge dungeon. Nested wings multiply
  note size, so they are a follow-up.
- **Astral view**: the fantasy profile stays under the anomaly legend. A separate derelict
  profile is a different feature.
- **Source terms**: the banned-term test is a guardrail, not a legal review. The prose still
  needs a read-through before release.