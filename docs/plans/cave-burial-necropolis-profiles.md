# Plan — Cave, Disturbed Burial and Necropolis Profiles

Updated: 2026-11-19. Status: **steps 1–5 shipped** (cave/burial data tables, shared context types and
headings; cave profiles; disturbed-burial profiles; tiered necropolis profiles; history fall
metadata and lifecycle verification). Step 6 remains. Companions:
[dungeon-profiles.md](dungeon-profiles.md) and [ruin-profiles.md](ruin-profiles.md). This plan
extends the same lazy generated-content model to the three remaining underground/burial marker
kinds:

- **Caves** — populated cells at height 50 and above.
- **Disturbed burials** — populated land cells; Fantasy culture sets only.
- **Necropolises** — land cells with almost no population.

## Problem

These markers are currently one-line legends, even though they are danger markers, living-world
threat anchors, history echoes and provincial POIs:

| Marker | Today |
|---|---|
| `caves` | `${culture} ${formation}` and a status claim; impact reads keywords in the short note |
| `disturbed-burials` | Generic “Disturbed Burial” and one fixed undead legend; Fantasy-gated |
| `necropolises` | `${culture} ${type}` and one of ten long necropolis legends |
| History fall markers | Can place `necropolises` and `disturbed-burials`, but only `ruins` get generated metadata |
| Cleared threats | All danger markers become generic ruins through `convertThreatToRuin` |

A cave, a disturbed barrow and a city of the dead should not read like the same site. They also
should not all become ruins or dungeons by default. The map already knows their type, formation,
status, culture, height, population and history; the generated profile should use those facts.

## Locked decisions

1. **Keep three distinct marker types.** Do not fold caves, disturbed burials or necropolises into
   `ruins` or `dungeons` while they are active.
2. **Reuse the lazy site machinery.** `generated`, notes splitting, exports, reroll, the five
   1–10 ratings, inhabitant groups and the four-category treasure mix stay generic.
3. **Separate generated kinds, shared helpers.** Register `cave`, `burial` and `necropolis` kinds
   with their own headings, but reuse `site-profile.ts`, `treasure.ts` and the dungeon override
   API where a sub-dungeon is warranted.
4. **Caves are surveys first.** A cave profile describes entrances, passages, hazards and claims.
   Only a lair-like or deep cave gets an optional capped dungeon draft.
5. **Disturbed burials are active hazards.** They are short, dangerous burial profiles, not ruined
   settlements. A barrow/crypt/ossuary may get one small crypt draft; open graves do not.
6. **Necropolises are tiered burial complexes.** They use a burial-specific site table and can
   embed a few capped crypt/temple sub-dungeons, like ruins but undead-focused.
7. **History facts win.** Fallen seats and burgs pass original identity, year, cause and tier.
   Random markers invent a plausible past from the seed.
8. **Cleared threats keep the shipped ruin conversion.** Clearing a cave/burial/necropolis still
   produces a ruin marker with `clearedFrom`; these profiles describe the active site.
9. **Preserve existing semantics.** Marker type, icon, impact, `threatId`, lock, chronicle,
   fantasy gating, living-threat mapping and astral readings stay intact.
10. **Lazy and capped.** No eager profile generation. Sub-dungeons stay small/medium; note size
    is tested.
11. **Original generic vocabulary.** All table strings are written for this generator; no source
    text is copied.

## Generated kinds and metadata

| Kind | Marker types | Heading | Typical meta |
|---|---|---|---|
| `cave` | `caves`, `cave` | Cave profile | `formation`, `status`, optional `extent` |
| `burial` | `disturbed-burials`, `disturbed-burial` | Burial profile | `burialKind`, optional `disturbance`, history keys |
| `necropolis` | `necropolises`, `necropolis` | Necropolis profile | `burialType`, `tier`, history keys |

Shared history/clearing keys remain the ruin-style ones where relevant:
`originalName`, `originalPolity`, `fallYear`, `cause`, `looted`, `clearedBy`, `clearedFrom`.
`meta` values stay strings, numbers or booleans.

Random placement should store the facts already shown in the marker name/note:

- `addCave` rolls a formation and status; the recipe carries both so the profile agrees with the
  pin and keeps the existing impact keywords.
- `addNecropolis` rolls a `NECROPOLIS_TYPES` entry; the recipe carries it as `burialType`.
- `addDisturbedBurial` may keep its current generic name; the recipe carries a rolled
  `burialKind` for the profile.

Old markers backfill through the reroll button. When meta is absent, the `create` handler can
infer a cave formation or necropolis type from the marker name suffix; otherwise it rolls from
the seed. The short note and marker name are not rewritten.

## Caves

### Identity

A cave is a natural or partly worked hollow in a populated highland cell. It is not automatically
a dungeon. The profile keeps the existing formation and status, then adds a survey.

Suggested extent table:

| Extent | Scale | Zones | Optional dungeon |
|---|---:|---:|---|
| Pocket | 2 | 3–4 | no |
| Passage | 4 | 4–5 | rarely |
| Cavern | 6 | 4–6 | if monster/lair status |
| Deep | 8 | 5–7 | yes, small/medium |
| Abyssal | 10 | 6–8 | yes, medium cap |

The existing `CAVE_FORMATIONS` and `CAVE_STATUSES` remain the short-note source. The profile reads
them from meta when present. Glacial caves keep the glacial prefix and add ice/flood hazards.

### What the profile covers

- Formation, status, extent, entrances and depth.
- Water/lava state: dry, stream, flooded, lava tube, ice.
- 3–8 cave zones: entrance, passage, chamber, shaft, stream, crystal vein, collapsed gallery,
  lava tube, ice chamber, old working, shrine niche.
- Discoveries and dangers; treasure caches tagged from the mix.
- Inhabitants, treasure mix, ratings, rumors and one or two secrets.
- Optional inline dungeon draft when the cave is a lair or deep system.

### Ratings, inhabitants and treasure

- **Danger** rises with hazards, depth, monsters and lava/flood.
- **Treasure** rises with the treasure status, caches and old workings; empty caves stay low.
- **Scale** follows extent.
- **Mystery** rises with unexplored depth, hidden entrances and strange status.
- **Weirdness** rises with lava, ice, crystal, planar or monster claims.

Inhabitants use the shared 1–6 encounter rating. Empty caves are common when the status says
empty; otherwise beasts, vermin, monsters, humanoids and outlaws dominate. Deep caves can add
constructs, undead or outsiders.

Treasure starts from the status/extent: hidden treasure leans bullion; monster lairs lean mixed
loot; old workings lean bullion/art; shrines lean relics. Flood/lava reduces art and bullion.

### Optional sub-dungeon

Only a cave that is monster-haunted, endlessly deep, or a deep/abyssal extent gets a dungeon
draft. Use `generateDungeonProfile` with a `caves` or `lair` type override, small/medium size and
the cave's own seed. The parent survey remains the main note.

## Disturbed burials

### Identity

A disturbed burial is an active undead hazard in a populated land cell. It is not a ruined town.
The profile should answer: who was buried, what disturbed them, what rises, and what still wards
or binds the place.

Suggested burial kinds:

| Kind | Scale | Notes |
|---|---:|---|
| Single grave | 2 | one disturbed interment |
| Cairn | 3 | stones, markers, old bones |
| Barrow | 4 | mound, chamber, grave goods |
| Graveyard | 4 | many graves, open ground |
| Crypt | 6 | sealed chamber, small dungeon possible |
| Ossuary | 6 | stacked bones, small dungeon possible |
| Mass grave | 8 | war/plague dead, high danger |

Fantasy gating stays unchanged: these markers only generate when the Fantasy culture set is on.

### What the profile covers

- Burial kind, who was buried, age and custom.
- Disturbance cause: grave robbery, war, plague, construction, flood, curse, necromancy,
  broken ward, unknown.
- Present activity: restless dead, rising at night, bound guardians, quiet but wrong.
- Wards, markers or bindings that remain.
- 3–6 burial zones: grave, mound, crypt door, ossuary niche, ward stone, disturbed earth,
  memorial, bone pit.
- Inhabitants, treasure mix, ratings, rumors and secrets.
- Optional one small crypt draft for barrow/crypt/ossuary/mass grave; not for open graves.

### Ratings, inhabitants and treasure

- **Danger** is high by default because the dead are active; it rises with mass graves, curses
  and broken wards.
- **Treasure** comes from grave goods: regalia and relics dominate, with some bullion and art.
  A grave-robbery disturbance can apply the looted modifier.
- **Scale** stays small to medium.
- **Mystery** rises with unknown dead, lost records and hidden chambers.
- **Weirdness** rises with necromancy, curses and unnatural activity.

Undead dominate the inhabitant weights. Constructs, vermin, cultists and grave robbers appear as
secondary groups. Empty results are rare; a “quiet” burial still has a low encounter rating.

## Necropolises

### Identity

A necropolis is a burial complex in a nearly empty land cell. It can be a graveyard, a cemetery,
a crypt complex, a necropolis proper or a city of the dead. It is not a living settlement and not
just a ruin, though history can make it the remains of a fallen polity.

Suggested tier table:

| Tier | Scale | Sites | Dungeon sites | Random weight |
|---|---:|---:|---:|---:|
| Graveyard | 2 | 1 | 0 | 35 |
| Cemetery | 4 | 1–2 | 0–1 | 30 |
| Crypt complex | 6 | 2–3 | 1 | 20 |
| Necropolis | 8 | 3–5 | 1–2 | 12 |
| City of the dead | 10 | 4–6 | 2–3 | 3 |

The existing `NECROPOLIS_TYPES` entry is carried as `burialType` and biases the tier: graveyard
and cemetery stay small; crypt, tomb, mausoleum and sepulchre lean medium; “Necropolis” can reach
the larger tiers. History overrides the roll.

### Sites and sub-dungeons

Necropolis sites use a burial-specific table:

| Site | Dungeon type when selected |
|---|---|
| Mausoleum or sepulchre | Crypt |
| Catacomb or ossuary | Crypt or caves |
| Mortuary temple | Temple |
| Tomb district | Crypt |
| Grave field, gate, walls, memorial | No dungeon; descriptive site only |

Sub-dungeons reuse `generateDungeonProfile` with type/size/name overrides and their own seeds.
They stay small/medium and never exceed the dungeon area cap. The parent profile is the surface
gazetteer; only a few sites become full drafts.

### What the profile covers

- Tier, burial type, original name/polity when history knows them, culture and age.
- Interment custom: inhumation, cremation, exposure, ossuary stacking, royal tomb, plague pit.
- Cause of silence: war, plague, curse, abandonment, necromancy, unknown.
- Surface state: overgrown, collapsed, flooded, burned, quiet, occupied by cults, picked clean.
- Site list, 4–8 surface zones, remains, secrets and rumors.
- Ratings, inhabitants and treasure mix.
- Inline sub-dungeon profiles for selected sites.

### Ratings, inhabitants and treasure

- **Danger** rises with undead activity, tomb density, curses and cult occupation.
- **Treasure** leans regalia, relics and art; bullion is lower than in a living ruin.
- **Scale** follows tier.
- **Mystery** rises with age, lost records, sealed tombs and unknown dead.
- **Weirdness** rises with necromancy, curses and planar burial customs.

Undead and constructs dominate; cults, vermin, outsiders and spirits appear by tier and cause.
Larger necropolises are less likely to be empty, but a quiet graveyard can still have only
wandering vermin.

## Placement and lifecycle

| Source | Integration |
|---|---|
| Random `addCave` | Attach a `cave` recipe with formation/status meta; keep the existing short note and impact keywords |
| Random `addDisturbedBurial` | Attach a `burial` recipe with a rolled burial kind; keep Fantasy gating |
| Random `addNecropolis` | Attach a `necropolis` recipe with burial type; keep the existing name/legend |
| History seat | A fallen capital necropolis gets a high-tier necropolis recipe with original polity, year and cause |
| History province | Necropolises get tier from burg population; disturbed burials get a small burial recipe with the burg/polity/year |
| Cleared threats | Keep `convertThreatToRuin`: the marker becomes a ruin with `clearedFrom`; the active profile is replaced |
| Old maps | No eager backfill. The reroll button creates the first recipe; name/note stay |
| Locked markers | Keep generated content through marker regeneration |
| History regeneration | Chronicle markers are cleared and replaced; generated content goes with them |
| Living threats | `syncDangerMarkers` and lair mappings stay unchanged; profile inhabitants are narrative prompts, not faction military |
| Astral view | Keep the anomaly legend first and the fantasy profile beneath it; no separate astral profile in v1 |

### Impact compatibility

Cave impact currently reads the short note for “hid treasure”, “monsters” and “lava”. Do not
remove those keywords in v1. The generated profile is additive. If a later slice moves impact to
meta, it must preserve the same defaults and tests.

Disturbed burial and necropolis impacts stay type-based:
`disturbed-burials: -1.5 economy / -6 stability`, `necropolises: 0 / -3`.

## Shared infrastructure changes

Most plumbing already exists. The expected additions are:

1. Add the three headings in `marker-content.ts`; each kind registers when its generator lands.
2. Add `create` handlers that can infer formation/burial type from an old marker name when meta
   is absent.
3. Reuse `Markers.regenerateGeneratedContent`; no kind-specific reroll wrapper is needed.
4. Reuse `fullNote`, notes splitting, CSV/GeoJSON export and the marker-editor reroll button.
5. Reuse `DungeonOverrides` for optional sub-dungeons.
6. Keep `Markers.place` generated-recipe validation unchanged.

## Data and module layout

| File | Purpose |
|---|---|
| `src/data/caves.ts` | extents, formations/status reuse, cave zones, hazards, discoveries, exits, inhabitant/treasure weights, rumors/secrets |
| `src/data/burials.ts` | burial kinds, disturbance causes, wards, burial zones, undead weights, grave-goods treasure, necropolis tiers/sites, rumors/secrets |
| `src/model/story/underworld-profile.ts` | shared cave/burial/necropolis context and meta types |
| `src/model/story/cave-generator.ts` | deterministic cave survey, optional dungeon draft, renderer |
| `src/model/story/burial-generator.ts` | deterministic disturbed-burial profile, optional small crypt draft, renderer |
| `src/model/story/necropolis-generator.ts` | tiered necropolis profile, sites/sub-dungeons, renderer |
| `src/model/story/cave-marker.ts` | cave context, recipe, lazy kind registration |
| `src/model/story/burial-marker.ts` | burial context, recipe, lazy kind registration |
| `src/model/story/necropolis-marker.ts` | necropolis context, recipe, lazy kind registration |
| `src/model/story/markers-generator.ts` | random placement recipes for the three types |
| `src/model/physical/history-generator.ts` | history meta for fall necropolises and disturbed burials |
| `src/model/story/marker-content.ts` | headings and kind registration support |

The exact split can collapse burial/necropolis data into one module if the tables stay small, but
the three generated kinds and renderers should remain distinct.

## Build order

1. **Data and shared variant plumbing — shipped 2026-11-19**
   - Cave and burial tables, tier/extent/site tables, treasure/inhabitant weights.
   - Added headings and shared context/meta types; each kind registers when its generator lands.
   - Tests: table completeness, weights, no banned source terms, heading entries.
2. **Cave profiles — shipped 2026-11-19**
   - Cave generator, renderer, lazy kind, random placement meta.
   - Optional capped dungeon draft for lair/deep caves.
   - Tests: determinism, formation/status agreement, impact keywords, note size, optional dungeon.
3. **Disturbed burial profiles — shipped 2026-11-19**
   - Burial generator, renderer, lazy kind, random placement.
   - Optional small crypt draft; Fantasy gating unchanged.
   - Tests: active undead danger, grave-goods mix, disturbance causes, note size.
4. **Necropolis profiles — shipped 2026-11-19**
   - Tiered necropolis generator, burial site table, capped sub-dungeons, renderer, lazy kind.
   - Tests: tier/site counts, dungeon caps, treasure sums, note size, history-ready context.
5. **History and lifecycle — shipped 2026-11-19**
   - History seat/province necropolis and disturbed-burial meta.
   - Verified cleared threats still become ruins with `clearedFrom`.
   - Tests: history tiers, chronicle replacement, locked markers, old-map reroll.
6. **Docs and migration**
   - Wiki coverage for caves, disturbed burials and necropolises; link from Markers, History and
     Living World.
   - Update `docs/architecture/data-model.md` for the new meta keys.
   - Document old-map reroll backfill; no eager migration.

## Tests

- Data tests for every new table: non-empty, die-sized where relevant, weights sum as expected,
  no banned source terms.
- Generator tests for each kind:
  - same seed + context → same profile
  - ratings stay 1–10; inhabitant rating 1–6 or empty
  - treasure shares sum to 100; sub-dungeon mixes are not added to the parent as separate hoards
  - renderer escapes names and produces notes-subset HTML
  - note size stays within the kind's budget
- Cave tests:
  - formation/status meta agrees with the short note
  - existing impact keywords still resolve the same defaults
  - empty/flooded caves do not force a dungeon; deep/monster caves can
- Burial tests:
  - Fantasy gating unchanged
  - disturbed burials are dangerous and undead-weighted
  - grave robbery can apply the looted modifier
- Necropolis tests:
  - tier/site/dungeon counts stay in range
  - sub-dungeons stay small/medium
  - history meta overrides tier and identity
- Marker/lifecycle tests:
  - all three random sources attach `generated`
  - old markers backfill through reroll without rewriting the short note
  - history necropolises/burials get meta; chronicle regeneration replaces them
  - cleared threats still become ruins with `clearedFrom`
  - exports render profiles without caching them

## Docs

- Add user-facing coverage for the three profiles, either one combined
  `Underground-site-generation.md` page or separate cave/burial/necropolis pages.
- Link from `Markers.md`, `History.md` and `Living-World.md`.
- Update `docs/architecture/data-model.md` with the new `generated.meta` keys.
- State that old maps backfill through the marker editor reroll button, not during load.
- Keep the cleared-threat rule explicit: active caves/burials/necropolises have their own
  profiles; cleared ones become ruins.

## Risks and open questions

- **Caves vs dungeons.** A cave can be a natural feature, a lair or a mine-like working. The
  optional dungeon draft must not turn every empty cave into a room-by-room dungeon.
- **Disturbed burial scope.** These are active hazards, not ruined settlements. Keep them short
  and dangerous; do not give them capital-scale site lists.
- **Necropolis scale.** A city of the dead can become large. Cap sub-dungeons and test note size;
  child markers remain a later extension if needed.
- **Cleared necropolis scale.** The shipped clearing rule turns a necropolis into a village-tier
  ruin. A later refinement could inherit the former necropolis tier, but v1 keeps the existing
  conversion.
- **Impact keywords.** Cave impact currently depends on short-note text. Moving it to meta is a
  separate compatibility slice.
- **Old-marker inference.** Inferring formation/type from a name is best-effort. If the name was
  edited, the profile may roll a different identity; the marker name still wins as the heading.
- **Astral view.** These kinds already have anomaly readings. v1 keeps the fantasy profile under
  the anomaly legend rather than inventing separate derelict/burial anomaly profiles.
- **Living threats.** Narrative inhabitants must not override faction military or lair mappings.
  The profile is a prompt sheet, not the simulation's source of truth.