## Underground site generation

Caves, disturbed burials and necropolises use the same lazy generated-content model as dungeons and ruins, but they keep their own identities. A cave is a natural survey, a disturbed burial is an active undead hazard, and a necropolis is a tiered city of the dead. None of them is forced into a ruin or dungeon profile while it is active.

Each marker keeps its familiar short note and adds an **alternate text profile** under its own heading. The profile is built on first read, cached on the marker, and included in marker exports without caching. It is a prompt sheet for running the place, not a stat block.

### What the three kinds cover

| Marker | Generated kind | Profile focus |
| --- | --- | --- |
| **Caves** | `cave` | Entrance, passages, water/lava, hazards, claims and optional lair draft |
| **Disturbed burials** | `burial` | Who was buried, what disturbed them, wards, rising dead and grave goods |
| **Necropolises** | `necropolis` | Tiered burial complex, sites, catacombs, tombs and the silent dead |

All three share the five 1–10 ratings, the 1–6 inhabitant encounter rating, the four-category treasure mix, secrets and rumors. See [Dungeon generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Dungeon-generation) and [Ruin generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Ruin-generation) for the shared rating, inhabitant and treasure rules.

### Caves

Caves appear on populated cells at height 50 and above. The profile keeps the formation and status already shown in the marker name and short note, then adds a survey.

| Extent | Scale | Zones | Dungeon draft |
| --- | ---: | ---: | --- |
| Pocket | 2 | 3–4 | no |
| Passage | 4 | 4–5 | rarely |
| Cavern | 6 | 4–6 | if monster-haunted |
| Deep | 8 | 5–7 | yes, capped |
| Abyssal | 10 | 6–8 | yes, capped |

A cave profile rolls an entrance form, water/lava state, 3–8 zones, discoveries, dangers, exits, inhabitants, treasure, secrets and rumors. Empty, flooded and lava-filled caves do not get a forced dungeon. A monster-haunted or deep cave can get one inline dungeon draft, capped to small or medium.

The existing cave impact keywords stay in the short note: treasure claims, monsters and lava still resolve the same provincial economy/stability defaults. The generated profile is additive.

### Disturbed burials

Disturbed burials appear on populated land cells and only generate when a Fantasy culture set is used. They are active hazards, not ruined settlements. The marker keeps its generic “Disturbed Burial” name and short note; the profile supplies the burial's identity.

| Burial kind | Scale | Zones | Crypt draft |
| --- | ---: | ---: | --- |
| Single grave | 2 | 3–4 | no |
| Cairn | 3 | 3–4 | no |
| Barrow | 4 | 4–5 | small |
| Graveyard | 4 | 4–6 | no |
| Crypt | 6 | 4–6 | small |
| Ossuary | 6 | 4–6 | small |
| Mass grave | 8 | 5–7 | small |

The profile rolls who was buried, the burial custom, the disturbance, present activity and any remaining ward. Grave robbery or a `looted` flag shifts the treasure mix away from coin and regalia. Danger starts high because the dead are active. Inhabitants are undead-weighted, with constructs, vermin, cultists and grave robbers as secondary groups.

Open graves, cairns and graveyards do not get a dungeon draft. Enclosed burials can get one small crypt draft.

### Necropolises

Necropolises appear on land cells with almost no population. They are tiered burial complexes, not living settlements and not just ruins.

| Tier | Scale | Sites | Dungeon sites | Random weight |
| --- | ---: | ---: | ---: | ---: |
| Graveyard | 2 | 1 | 0 | 35 |
| Cemetery | 4 | 1–2 | 0–1 | 30 |
| Crypt complex | 6 | 2–3 | 1 | 20 |
| Necropolis | 8 | 3–5 | 1–2 | 12 |
| City of the dead | 10 | 4–6 | 2–3 | 3 |

The marker's burial type biases the tier: graveyard and cemetery stay small; crypt, tomb, mausoleum and sepulchre lean medium; “Necropolis” can reach the larger tiers. History overrides the roll.

Sites are drawn from a burial-specific table: mausoleums, sepulchres, catacombs, ossuaries, mortuary temples, tomb districts, grave fields, gates, walls and memorials. A few sites become full dungeon drafts, capped to small or medium and rendered inline. The parent profile is the surface gazetteer: interment custom, cause of silence, surface state, zones, remains, secrets and rumors.

### History and cleared threats

History fall markers pass what the chronicle knows:

- A fallen capital **necropolis** becomes a **city of the dead** with its original polity, fall year and cause of war.
- A fallen province **necropolis** becomes a **necropolis** at population 20+, otherwise a **cemetery**.
- A fallen province **disturbed burial** gets a small **graveyard** burial recipe with the burg, polity, year and cause.

Cleared threats keep the existing ruin conversion. When an army, adventuring band, smiting or emergent state ends a danger-marker stronghold, the marker becomes `Ruins of …` and gains a looted ruin profile. A cleared necropolis remembers `clearedFrom: "necropolises"`; a cleared cave remembers `clearedFrom: "caves"`. The active cave/burial/necropolis profile is replaced by the ruin profile.

### Determinism and map context

Each profile is rolled from its own seeded stream, keyed by the map seed, the marker's cell and the kind. Rerolling adds a salt, and sub-dungeons carry that salt into their own seeds. The profile reads the local culture, alignment, biome, height and population. History meta wins when present: original name, original polity, fall year, cause, tier and burial type/formation/status.

Older markers can infer some identity from their existing name/note: a cave formation or status, or a necropolis burial type. If the name was edited, the profile may roll a different identity; the marker name still wins as the heading.

### Reading, editing and rerolling

Open the marker and then its note. The profile is appended under a **Cave profile**, **Burial profile** or **Necropolis profile** heading. It is ordinary notes-subset HTML and can be edited in the notes editor.

Use the **reroll** button in the marker editor to rebuild the profile. Rerolling keeps the short note and marker name, replaces the cached profile, and rerolls any sub-dungeons with it. Older maps do not backfill during load; a cave, disturbed burial or necropolis gains its first recipe when the reroll button is used. Locked markers keep their generated content through marker regeneration, and chronicle markers are replaced when history regenerates.

### Limits

- The profiles are system-agnostic prompts, not stat blocks or challenge ratings.
- Treasure shares describe the split of value, not item counts or prices.
- Inhabitant groups are top-level categories, not specific factions.
- A cave is not automatically a dungeon; a disturbed burial is not a ruined town.
- Necropolis sub-dungeons are capped; v1 keeps one marker per complex rather than child pins.
- Astral view keeps the anomaly legend first and the fantasy profile beneath it; no separate astral profile is generated.
- Living-world threat mappings and faction military are unchanged; profile inhabitants are narrative, not the simulation's source of truth.

### Where the rules come from

The implementation lives in `src/data/caves.ts`, `src/data/burials.ts`, `src/model/story/cave-generator.ts`, `src/model/story/burial-generator.ts`, `src/model/story/necropolis-generator.ts` and their marker modules. Shared context types are in `src/model/story/underworld-profile.ts`; lazy content is registered in `src/model/story/marker-content.ts`. Placement is wired through `src/model/story/markers-generator.ts` and `src/model/physical/history-generator.ts`. The design notes are in `docs/plans/cave-burial-necropolis-profiles.md`.

See also: [Markers](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Markers) · [Dungeon generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Dungeon-generation) · [Ruin generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Ruin-generation) · [History](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/History) · [Living World](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Living-World).