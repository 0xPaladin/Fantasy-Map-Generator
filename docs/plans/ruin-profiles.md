# Plan — Ruin Profiles and Multi-Site Ruins

Updated: 2026-11-18. Status: **phases 1–4 shipped** (shared site plumbing; the single-site
ruin data, deterministic generator, renderer and lazy `ruin` kind; tiered multi-site ruins and
capped sub-dungeons; random placement, history fall markers and cleared danger markers). Phase 5,
docs and migration, is next. Builds on the shipped dungeon profile infrastructure: lazy marker
content, the full/short notes split, reroll and exports, the five 1–10 ratings, inhabitant groups
and the four-category treasure mix. The dungeon plan is
[dungeon-profiles.md](dungeon-profiles.md).

## Problem

Ruins are currently one-line markers. Three different systems place them:

| Source | What it creates today |
|---|---|
| Random markers (`addRuins`) | `Ruined <type>` and “Ruins of an ancient … Untold riches may lie within.” |
| History (`placeFallRemains`) | `Ruins of <polity or burg>` with a causal note and `year` |
| Cleared danger markers (`convertDangerMarkerToRuins`) | A former lair renamed `Ruins of …` with an appended resolution note |

They all share the same problem: a former capital, a provincial town and a lone watchtower get
the same single-line treatment. The map already knows which sites were important; the ruin
profile should too.

## Locked decisions

1. **Ruins are tiered.** An outpost is a single small site; a fallen capital is a multi-site
   complex. Not every ruin is a mega-site.
2. **A capital ruin is a mega-site, not one mega-dungeon.** The parent ruin is the gazetteer and
   surface overview. A few of its sites are full dungeons; the rest are descriptive zones.
3. **Reuse the dungeon infrastructure.** Lazy content, notes, exports, ratings, inhabitants,
   treasure mix and reroll all stay generic.
4. **History-first.** When history knows the original polity, burg, year and cause, those facts
   win. Random ruins invent a plausible past; converted threat sites remember what was cleared.
5. **Lazy, capped sub-dungeons.** Parent and sub-dungeon content are generated on demand. Sub-
   dungeons are capped at small/medium so a capital does not become a 100-area note.
6. **One marker in v1.** The ruin is one pin with a site list. Child pins or separate dungeon
   markers are a later extension if note size or map clutter demands it.
7. **No forced mega-dungeon.** Random ruins are weighted toward outposts and villages. Only
   capitals and major cities routinely get several dungeon sites.

## Tier model

| Tier | Original settlement | Sites | Dungeon sites | Scale |
|---|---|---:|---:|---:|
| **Outpost** | watchtower, fortlet, shrine, road station | 1 | 0 | 1–3 |
| **Village** | hamlet or village | 1–2 | 0–1 | 4–5 |
| **Town** | town or small city | 2–3 | 1 | 6–7 |
| **City** | major town or city | 3–5 | 1–3 | 8–9 |
| **Capital** | fallen capital or metropolis | 4–6 | 2–4 | 10 |

Random ruin tier weights:

| Tier | Weight |
|---|---:|
| Outpost | 40 |
| Village | 30 |
| Town | 20 |
| City | 8 |
| Capital | 2 |

History overrides the roll:

- a fallen capital seat becomes **capital** or **city**
- a fallen provincial burg becomes **town** or **village**
- a cleared danger marker becomes **outpost** or **village**, depending on the old threat

## Profile shape

```ts
export type RuinTier = "outpost" | "village" | "town" | "city" | "capital";

export type RuinSiteKind =
  | "palace"
  | "temple"
  | "crypt"
  | "undercroft"
  | "academy"
  | "market"
  | "walls"
  | "harbor"
  | "residential"
  | "other";

export interface RuinSite {
  id: string;
  name: string;
  kind: RuinSiteKind;
  /** true when this site gets a full dungeon profile */
  dungeon: boolean;
  /** the dungeon site's own deterministic seed */
  dungeonSeed?: string;
  /** the dungeon type the site uses */
  dungeonType?: DungeonTypeId;
  /** the rendered sub-dungeon profile, generated with the parent */
  dungeonProfile?: DungeonProfile;
  /** short description for non-dungeon sites */
  summary: string;
}

export interface RuinZone {
  number: number;
  type: string;
  condition: string;
  discovery?: string;
  danger?: string;
  exits?: string[];
}

export interface RuinProfile {
  name: string;
  originalName: string;
  tier: RuinTier;
  originalPurpose: string;
  culture: string;
  age: string;
  cause: string;
  condition: string;
  accessibility: string;
  ratings: SiteRatings;
  inhabitants: SiteInhabitants;
  treasure: { shares: TreasureShares };
  sites: RuinSite[];
  zones: RuinZone[];
  remains: string[];
  secrets: string[];
  rumors: string[];
}
```

`SiteRatings`, `SiteInhabitants` and `TreasureShares` are the shared site-profile types. The
dungeon generator should be refactored to use the same types rather than duplicating them.

### Generated content metadata

Chronicle ruins need more context than seed and cell. Extend the marker content record with a
small, serialized `meta` payload:

```ts
export interface MarkerGeneratedContent {
  kind: string;
  version: number;
  seed: string;
  /** small generator input, e.g. history context; never html */
  meta?: Record<string, string | number | boolean>;
  html?: string;
}
```

Ruin meta may carry:

```ts
{
  originalName?: string;
  originalPolity?: string;
  fallYear?: number;
  cause?: string;
  tier?: RuinTier;
  clearedBy?: string;
  clearedFrom?: string;
  looted?: boolean;
}
```

Random ruins can omit `meta`; the renderer rolls a past from the seed. Chronicle and cleared
ruins pass what the map already knows.

## Generation

### 1. Tier and identity

- Choose or derive the tier.
- Pick the current name and the original name. History markers keep their existing current name
  and use the fallen polity or burg as the original identity.
- Roll the original purpose from the ruin origin table: settlement, fortress, temple, tomb,
  academy, palace, mine/workshop, harbor, monastery, road station, unknown.
- Record culture, age/era and original size.

### 2. Fall

- Cause of ruin: war, siege, plague, famine, fire, earthquake, flood, curse, arcane disaster,
  overrun, resource depletion, abandonment, unknown.
- History markers use the event's year and cause; random ruins roll them.
- Cleared threat markers record the clearing and treat the site as recently looted.
- Decide what survived: a bloodline, a cult, an order, a hidden vault, a record, a monster.

### 3. Present state

- Condition: vestiges, skeletal, partial ruin, largely intact, preserved, restored.
- Accessibility: sealed, hidden, buried, partly uncovered, obvious.
- Surface state: overgrown, burned, flooded, collapsed, occupied, picked clean.
- Overall ratings:
  - **Danger** — surface hazards plus the worst known site
  - **Treasure** — total remaining value
  - **Scale** — original size and importance, driven by tier
  - **Mystery** — age, lost records, hidden vaults and unanswered questions
  - **Weirdness** — curses, relics, old magic and the nature of the fall

### 4. Sites

Each tier rolls its site count and which sites are dungeons.

Site selection:

- Parent sites should reflect the original settlement. A capital can have a palace, a grand
  temple, a royal undercroft, a market, walls and a residential district.
- Only a subset become dungeons. The rest stay as scene-level zones.
- A capital should not have more than four dungeon sites in v1.
- Site names use the local culture and the ruin's original identity.

Natural dungeon mapping:

| Site | Dungeon type |
|---|---|
| Palace or keep | Stronghold/fortress |
| Grand temple or sanctuary | Temple |
| Crypt, royal tomb or necropolis | Crypt/tomb |
| Undercroft, sewers or cellars | Caves |
| Academy, library or archive | Laboratory/archive |
| Guild hall or treasury | Stronghold or vault |
| Harbor or sea cave | Caves or lair |

### 5. Surface zones

Single-site ruins and non-dungeon sites use a zone list rather than a full dungeon draft.
Reuse the dungeon area-graph engine with ruin zone tables:

- approach, gate, courtyard, collapsed hall, overgrown street, well, shrine, market, walls,
  undercroft entrance, residential shell, tower
- each zone has a condition, a discovery or danger, and exits where relevant

Sub-dungeons use the full dungeon generator with overrides:

```ts
generateDungeonProfile(context, {
  salt: site.dungeonSeed,
  name: site.name,
  type: site.dungeonType,
  size: "small" | "medium",
  // the area count is capped to 6–15
});
```

The exact override API can be a backward-compatible options object. The important rule is:
**parent Scale may be 10 while each sub-dungeon stays small/medium.**

### 6. Inhabitants

Reuse the 1–6 encounter rating and group table with ruin-specific behaviour:

- allow `groups: []` for an empty ruin; the line reads “none (wandering vermin or scavengers)”
- rating 1 covers empty, one hidden squatter or transient vermin
- weight undead, vermin, beasts, constructs, humanoids and outlaws by origin and cause
- a cleared danger marker defaults to empty or transient scavengers
- two groups still roll a relation: rival scavengers, cult and undead, beasts and vermin, etc.
- parent inhabitants describe the ruin as a whole; each dungeon site can have its own group

### 7. Treasure

Reuse the four-category mix and normalizer:

| Origin | Bullion | Regalia | Art | Relics |
|---|---:|---:|---:|---:|
| Settlement | 2 | 1 | 3 | 2 |
| Fortress | 2 | 3 | 1 | 2 |
| Temple | 1 | 2 | 3 | 5 |
| Tomb/crypt | 1 | 4 | 1 | 5 |
| Academy/library | 1 | 1 | 5 | 3 |
| Palace/manor | 2 | 4 | 3 | 2 |
| Mine/workshop | 5 | 0 | 0 | 1 |
| Unknown | 1 | 1 | 1 | 1 |

Modifiers:

- original culture, cause of ruin and age
- original builder/occupant
- current occupants
- `looted` or cleared: bullion down, hidden relics/art up
- special remains: reliquary, archive, throne room, vault

The parent mix is the overall remaining value. Sub-dungeon mixes are local shares of that total.
Do not add the parent and sub-site values as if they were separate hoards.

### 8. Rumors and secrets

Generate two or three rumors in the local voice, plus one or two secrets:

- what the locals call the place
- what they claim it was
- what they say happened
- what they warn against
- a hidden vault, surviving heir, sealed undercroft, record or curse

## Placement and lifecycle

| Source | Integration |
|---|---|
| Random `addRuins` | Set `generated` kind `ruin` and seed; the generator rolls the tier from weights. Keep the short note |
| History `placeFallRemains` | Extend `Markers.place`/`MarkerDetails` to accept generated metadata. Pass original polity, fallen year, cause, culture and tier from the seat burg |
| Cleared danger marker | Set generated metadata with `clearedBy`, `clearedFrom` and `looted`; keep the resolution note |
| Old maps | Ruin markers without `generated` backfill through the reroll button |
| Locked markers | Keep the generated profile through marker regeneration |
| History regeneration | Chronicle ruins are cleared and replaced; their generated content goes with them |

`convertDangerMarkerToRuins` is pure data code. It should accept a generated-content payload or a
`RuinContext` from its caller, so `living-threats` supplies the map seed and clearing context.

## Shared infrastructure changes

Before the ruin generator:

1. **Generic reroll**
   - Replace the dungeon-specific `Markers.regenerateDungeonProfile` with a generic
     `regenerateGeneratedContent(markerId, salt?)`, dispatching by `generated.kind` or marker
     type.
   - Keep a dungeon wrapper if existing callers need it.
   - The marker editor button appears for any marker with `generated`, or for `dungeons`/`ruins`
     without one. Label it “Reroll generated profile”.
   - Add `ruin: "Ruin profile"` to the generated headings.

2. **Placement support**
   - Extend `MarkerDetails` with `generated` (seed, kind, version, meta) and let `Markers.place`
     accept it.
   - History placement passes generated metadata for ruin markers.

3. **Shared site types and treasure helpers**
   - Extract `TreasureCategory`, `TreasureShares`, `TreasureWeights`, `TreasureModifier`,
     `normalizeTreasureShares`, `applyTreasureModifiers`, `pickTreasureCategory` and the cache
     tagging into shared modules.
   - Move the rating/inhabitant types to a shared `site-profile.ts` and keep `DungeonRatings` /
     `DungeonInhabitants` as aliases, or rename call sites.
   - The dungeon data keeps its own weights; ruin data gets its own.

## Data and module layout

| File | Purpose |
|---|---|
| `src/data/ruins.ts` | tier weights, origins, causes, conditions, site kinds, zone types, remains, secrets, rumors, ruin treasure weights/modifiers, inhabitant weights |
| `src/model/story/ruin-generator.ts` | deterministic ruin profile, site selection, zone/site generation, renderer |
| `src/model/story/ruin-marker.ts` | cell/history context, `ruin` renderer registration, generated recipe |
| `src/model/story/site-profile.ts` | shared rating/inhabitant types and site helpers |
| `src/data/treasure.ts` / `src/model/story/treasure.ts` | shared treasure categories, normalization and cache tagging |
| `src/model/story/dungeon-generator.ts` | accept type/size/name overrides for sub-sites |
| `src/model/story/marker-content.ts` | `ruin` heading and optional `meta` |
| `src/model/story/markers-generator.ts` | random ruin generated recipe, generic reroll |
| `src/model/physical/history-generator.ts` | tier and history metadata on fall markers |
| `src/data/danger-markers.ts` | cleared ruin payload |
| `src/controllers/story/markers/markers-editor.ts` | generic reroll button |

## Build order

1. **Shared site plumbing — shipped 2026-11-18**
   - Add `meta` to `MarkerGeneratedContent`.
   - Extract shared rating/inhabitant/treasure types and helpers.
   - Generalize reroll and editor button.
   - Extend `Markers.place`/`MarkerDetails` for generated content.
   - Add `ruin` heading.
   - Tests: existing dungeon tests still pass; generic reroll works for a fake kind.
2. **Single-site ruin profile — shipped 2026-11-18**
   - `src/data/ruins.ts` with tier/origin/fall/present/zone/remains/secrets/rumors tables.
   - `src/model/story/ruin-generator.ts` for outpost/village/town with one site or no dungeon.
   - Ratings, inhabitants, treasure mix and renderer.
   - `src/model/story/ruin-marker.ts` registers the lazy `ruin` kind.
   - Existing ruin markers can backfill through the generic reroll; automatic placement and
     history tier wiring remain phase 4.
   - Tests: determinism, tier/site counts, empty inhabitants, treasure sum, escaping.
3. **Tiered multi-site ruins and sub-dungeons — shipped 2026-11-18**
   - City/capital site counts.
   - Dungeon overrides on `generateDungeonProfile` (type, size cap, name, seed).
   - Parent profile renders sub-dungeon profiles inline.
   - Site type table and tier site/dungeon ranges.
   - Tests: site counts, dungeon caps, no double treasure, note size sanity.
4. **Placement and history — shipped 2026-11-18**
   - Random `addRuins` generated recipe with tier weights.
   - History `placeSeatMarker`/`placeBurgMarker` pass tier and meta.
   - Cleared danger markers get cleared/looted meta.
   - Tests: all three sources get `generated`; history tier is right; locked/chronicle lifecycle.
5. **Docs and migration**
   - New `docs/wiki/Ruin-generation.md`, linked from Markers and History.
   - Update `docs/wiki/Living-World.md` for cleared-threat ruins.
   - Update `docs/architecture/data-model.md` for `generated.meta`.
   - Backfill old-map ruins through reroll.

## Tests

- `src/data/ruins.test.ts`
  - every table is non-empty and die-sized
  - tier weights sum as expected
  - site-kind and treasure tables are complete
  - no banned source terms in ruin data
- `src/model/story/ruin-generator.test.ts`
  - same seed + context → same profile
  - tier/site counts stay in range
  - dungeon-site count respects the cap
  - sub-dungeon sizes stay small/medium
  - ratings 1–10; inhabitant rating 1–6 or empty
  - treasure shares sum to 100; site mixes do not double-count
  - renderer escapes names and produces notes-subset HTML
- `src/model/story/ruin-marker.test.ts`
  - map context reads culture, biome, tier and history meta
  - first read materializes the profile and caches it
- `src/model/story/markers-generator.test.ts`
  - random ruins get generated recipes
  - generic reroll replaces the cached html and keeps the short note
- `src/model/physical/history-generator.test.ts`
  - fallen capital gets a capital/city tier and original polity meta
  - fallen provincial town gets a town/village tier
- `src/data/danger-markers.test.ts` / `living-threats` tests
  - cleared danger markers get cleared/looted ruin metadata
- `src/controllers/story/markers/markers-editor.test.ts`
  - reroll button appears for ruins
- `notes` and export tests already cover any generated kind; add a ruin note case.

## Docs

- New `docs/wiki/Ruin-generation.md`: tiers, parent sites, sub-dungeons, ratings, inhabitants,
  treasure, history and cleared-threat behaviour.
- Link it from `docs/wiki/Markers.md`, `docs/wiki/History.md` and `docs/wiki/Living-World.md`.
- Update `docs/architecture/data-model.md` for `generated.meta`.
- Update `docs/plans/dungeon-profiles.md` to point at this plan as the next generated kind.

## Risks and open questions

- **Note size.** A capital ruin with four embedded dungeon profiles may reach 20–40 KB. Cap
  dungeon sites and sub-dungeon sizes; if it is still too large, split sites into child markers
  or dialogs later.
- **Inline sub-dungeons vs child markers.** v1 embeds them in the parent note. Child pins would
  keep each note smaller but add map clutter and parent/child lifecycle.
- **History context.** `meta` must stay small and validated. If history regenerates, the
  generated content must be replaced with it.
- **Empty inhabitants.** Decide whether `groups: []` is the empty state, or add an explicit
  `empty`/`transient` field. The plan currently recommends empty groups with a 1-in-6
  wanderer/vermin encounter.
- **Random tier distribution.** Most random ruins should be outposts/villages; tune the weights
  after seeing real maps.
- **Necropolises and disturbed burials.** They are adjacent kinds. Keep them separate until the
  ruin generator proves itself; do not force every burial site into the ruin profile.
- **Existing consumers.** Ruins are used by factions, living threats, the HUD and history. Keep
  their `type`, `threatId`, lock and chronicle semantics intact; only add generated content.