# Plan — Beast, Monster and Bandit Profiles

Updated: 2026-11-19. Status: **planned**. Companions:
[dungeon-profiles.md](dungeon-profiles.md), [ruin-profiles.md](ruin-profiles.md) and
[cave-burial-necropolis-profiles.md](cave-burial-necropolis-profiles.md). This plan extends the
same lazy generated-content model to the living threat markers:

- **Beasts** — `lake-monsters` and `sea-monsters`: aquatic animals and relic creatures.
- **Monsters** — `hill-monsters`: ogres, trolls, dragons, undead and beastly predators.
- **Bandits** — `brigands` and `pirates`: humanoid raider gangs and crews.

Source procedure: *Freebooters on the Frontier 2e, Vol. IV — Beasts & Booty* (creature creation,
creature tags, want/moves, and the loot/treasure procedures). The source is a **procedure
reference only**: every table string in the implementation is rewritten in the generator's own
generic vocabulary. See [Licensing and generic vocabulary](#licensing-and-generic-vocabulary).

## Problem

These five markers are danger markers, living-world threat anchors and provincial POIs, but they
are still one-line legends:

| Marker | Today |
|---|---|
| `lake-monsters` | `${lake} Monster` and a rumor about a relic creature of a rolled length |
| `sea-monsters` | `${culture} Monster` and a sailor rumor about a gigantic creature |
| `hill-monsters` | `${culture} ${species}` and a rumor with an adjective and a habit |
| `brigands` | `${culture} ${animal}` and “A gang of ${locality} ${type}.” |
| `pirates` | Generic “Pirates” and “Pirate ships have been spotted in these waters.” |

A lake beast, a hill ogre and a pirate crew should not read like the same site. The map already
knows their type, species, locality, culture, biome, height and routes; the generated profile
should use those facts. The source volume gives a useful creature-and-loot procedure to adapt,
but its prose and stat blocks must not be copied.

## Locked decisions

1. **Three distinct generated kinds.** Register `beast`, `monster` and `bandit`. Do not fold them
   into ruins or dungeons while they are active.
   - `lake-monsters`, `sea-monsters` → `beast`
   - `hill-monsters` → `monster` (can roll a beastly nature)
   - `brigands`, `pirates` → `bandit`
2. **Reuse the lazy site machinery.** `generated`, notes splitting, exports, reroll, the five
   1–10 ratings, the 1–6 inhabitant encounter rating and the four-category treasure mix stay
   generic.
3. **Prompt sheets, not stat blocks.** No hit points, armor values or damage numbers. Size,
   quantity, attack and defense are descriptive prompts; the Danger rating and encounter rating
   carry the mechanical summary. This matches the dungeon/ruin/underworld philosophy.
4. **Creature core, kind-specific shells.** A shared creature core rolls size/quantity, nature,
   tags, attack/defense prompts, want and moves. Beast/monster/bandit generators add territory,
   lair/camp/ship and treasure forms.
5. **Loot has context.** Adapt the source's inherent / carried / stashed / in-lair distinction:
   beasts yield harvest from their bodies; bandits carry and stash raid loot; monsters hoard.
   The four-category mix still describes the value split; the forms are prompts.
6. **A loot die, not silver math.** Keep a size/wealth-driven loot die as a dice prompt
   (d4–d12), like dungeon treasure caches. Do not convert to exact coin values.
7. **Optional curio, not full magic items.** Wealthy monsters and bandit leaders can roll one
   named curio with a single power prompt and a drawback. Full enchantment math is out of scope.
8. **History does not place these.** No chronicle wiring is needed. Cleared threats keep the
   shipped ruin conversion (`clearedFrom`).
9. **Preserve existing semantics.** Marker type, icon, impact, `threatId`, lock, living-threat
   mappings, faction military and astral readings stay intact.
10. **Lazy and capped.** No eager generation. One marker per creature/gang; no child pins in v1.
11. **Original generic vocabulary.** All table strings are written for this generator; no source
    prose, stat blocks or name tables are copied. The banned-term guard is extended.

## Generated kinds and metadata

| Kind | Marker types | Heading | Typical meta |
|---|---|---|---|
| `beast` | `lake-monsters`, `lake-monster`, `sea-monsters`, `sea-monster` | Beast profile | `species`, `habitat`, `length` |
| `monster` | `hill-monsters`, `hill-monster`, `monsters`, `monster` | Monster profile | `species`, `nature`, `habit` |
| `bandit` | `brigands`, `brigand`, `bandits`, `bandit`, `highwaymen`, `robbers`, `pirates`, `pirate` | Bandit profile | `gang`, `locality`, `leader`, `maritime` |

`meta` values stay strings, numbers or booleans. Random placement stores the facts already shown
in the marker name/note so the profile agrees with the pin:

- `addLakeMonster`/`addSeaMonster` store the rolled length and a habitat/species hint.
- `addHillMonster` stores the species, adjective and habit already used in the legend.
- `addBrigands` stores the locality and gang type; `addPirates` stores a maritime flag.

Old markers backfill through the reroll button. When meta is absent, the `create` handler can
infer species/locality from the marker name or note; otherwise it rolls from the seed. The short
note and marker name are not rewritten.

## Shared creature core

The core adapts the source's creature-creation sequence into prompts:

1. **Category and nature.** Beast, monster or humanoid is fixed by the kind. A nature table picks
   the creature's role: ambush hunter, apex predator, behemoth, herd animal, pack opportunist,
   scavenger, stalker, brute, caster, undead, aberration, etc. Hill monsters can roll a beastly
   nature; bandits are organized humanoids.
2. **Size and quantity.** Descriptive size (tiny, small, medium, large, huge) and quantity
   (solitary, group, mob, throng). These drive the Scale rating, the loot die and the encounter
   rating. No HP is generated.
3. **Alignment.** Read the cell culture's prevailing alignment, then roll the creature's
   alignment from a generic column table. Bandits lean chaotic/evil; beasts lean neutral.
4. **Tags.** A small set of descriptive tags (flying, stealthy, toxic, armored, magical, undead,
   terrifying, hoarder, leader, organized, etc.). Tags are prompts, not mechanical modifiers.
5. **Attack and defense prompts.** One or two attack forms (bite, claw, trample, venom, grasp,
   breath, weapon) and a defense description (hide, scales, carapace, armor, aura). No numbers.
6. **Want and moves.** One attainable want and 3–5 short moves that express the creature's
   character. These are the GM's cues for how it acts.
7. **Details.** A few sensory prompts: color, texture, age, condition, activity, terrain,
   strange feature. Used sparingly to avoid noise.

The core returns a `CreatureCore` consumed by the three kind generators. Ratings, inhabitants and
treasure are derived from the core plus the kind's territory/loot context.

### Ratings

| Rating | Derived from |
|---|---|
| **Danger** | size, quantity, nature, attack forms, tags (terrifying/toxic/magical), leader |
| **Treasure** | loot die, loot context, hoarder tag, wealth (bandits), caches |
| **Scale** | size and quantity; a throng or huge creature scales high |
| **Mystery** | magical/aberrant tags, hidden lair, unknown species, curio |
| **Weirdness** | magical/undead/aberrant tags, strange features, breath/element |

### Inhabitants

Reuse the shared 1–6 encounter rating. A solitary creature can still have a high rating if it is
large or terrifying; a group/mob/throng raises it. The inhabitant group is the creature itself
(beast/monster) or the gang (bandit). A second group can appear for bandits (rivals, captives,
allies) or monsters with servants. Empty results are rare for active threats.

## Beasts

### Identity

Aquatic beasts on lakes and connected sea cells. The profile keeps the rolled length and the
lake/sea name, then adds a territory survey.

- **Habitat:** lake, river mouth, coastal shallows, deep sea, reef, trench.
- **Nature:** ambush hunter, apex predator, behemoth, herd animal, pack opportunist, scavenger.
- **Territory:** hunting grounds, depth, lair (cave, wreck, trench, island), signs (tracks,
  bones, missing boats, disturbed water).
- **Quantity:** usually solitary or a small group; herds for gentle beasts.

### Treasure forms

Beasts yield **inherent harvest**, not coin: hide/fur/shell, meat/rations, organs/glands,
teeth/claws/horns, venom/ichor, bone/sinew. The four-category mix biases toward Art (decorative
or functional parts) and Relics (charms, curative organs, talismans); Bullion and Regalia are
near zero. Meat/rations are supplies, not counted in the mix. A hoarder beast can also have a
small stash of victims' gear in its lair.

The loot die is driven by size. Body-part prompts roll a part and a property (ingredient,
decorative, protective, poison, curative, charm) as descriptive text, not silver values.

### Optional lair draft

A large or hoarder beast can get one small cave/lair draft via `generateDungeonProfile` with a
`caves` or `lair` type override. Gentle herd beasts and tiny creatures get none.

## Monsters

### Identity

Hill monsters on populated highland cells. The profile keeps the species, adjective and habit
from the legend, then adds a lair and territory.

- **Nature:** beastly predator, brute, ogre/troll-like, dragon-like, undead, hag/caster,
  aberration, giant-kin. The species hint biases the nature.
- **Lair:** cave, barrow, ruined keep, hollow hill, grove, wreck; entrance and approach.
- **Territory:** hunting range, signs, victims, tribute or fear the locals pay.
- **Tags:** flying, magical, undead, terrifying, hoarder, leader, etc.

### Treasure forms

Monsters **hoard**. The loot context is in-lair: gems, jewelry, art objects, rare items, coin
from victims, and possibly one curio. The four-category mix biases toward Regalia/Art/Relics
with some Bullion. A hoarder tag rolls the loot twice (cache + lair) as prompts. Victims' gear
can appear as personal items.

The loot die is driven by size, raised for hoarder/wealthy natures.

### Optional curio

A wealthy or magical monster can roll one **curio**: a name from a generic template
(property/adjective + item, or item of property), one power prompt, and a drawback. This is a
prompt, not a full magic item. No enchantment math or silver value.

### Optional lair draft

A monster with a substantial lair can get one capped dungeon draft (small/medium) via
`generateDungeonProfile`, type chosen from the nature (crypt for undead, stronghold for brutes,
caves for beastly, laboratory for casters). Solitary wanderers get none.

## Bandits

### Identity

Humanoid raider gangs on roads (`brigands`) and sea routes (`pirates`). The profile keeps the
locality and gang type, then adds a leader, camp/ship and raid pattern.

- **Gang:** size (a handful, a band, a company, a crew), composition (locals, outcasts,
  deserters, cultists, mixed), and a named leader with a trait.
- **Locality:** highlander, desert, mounted, forest, swamp, angry (from the existing brigand
  logic); maritime for pirates.
- **Base:** camp, hideout, wreck, island, fortlet; for pirates a ship or anchorage.
- **Raid pattern:** prey (traffic, markets, routes), tactics (ambush, blockade, boarding,
  extortion), and what they take.
- **Tags:** organized, leader, stealthy, devious, mounted, maritime.

### Treasure forms

Bandits **carry and stash** raid loot. The loot context is carried/stashed: coin, trade goods,
contraband, personal items, gems/jewelry, and possibly one curio for the leader. The four-category
mix biases toward Bullion and Art/Regalia depending on wealth. Wealth is rolled (penniless, poor,
mediocre, comfortable, wealthy, fabulous) and drives the loot die. Captives or prisoners can
appear as a secondary inhabitant group.

### Optional base draft

A large gang with a fortified camp or ship can get one small dungeon draft via
`generateDungeonProfile` (stronghold or lair type). A small roadside gang gets none.

## Placement and lifecycle

| Source | Integration |
|---|---|
| Random `addLakeMonster`/`addSeaMonster` | Attach a `beast` recipe with habitat/length meta; keep the existing rumor note |
| Random `addHillMonster` | Attach a `monster` recipe with species/nature/habit meta; keep the legend |
| Random `addBrigands`/`addPirates` | Attach a `bandit` recipe with gang/locality/maritime meta; keep the short note |
| Cleared threats | Keep `convertThreatToRuin`: the marker becomes a ruin with `clearedFrom`; the active profile is replaced |
| Old maps | No eager backfill. The reroll button creates the first recipe; name/note stay |
| Locked markers | Keep generated content through marker regeneration |
| Living threats | `syncDangerMarkers` and lair/faction mappings stay unchanged; profile inhabitants are narrative prompts, not faction military |
| Astral view | Keep the anomaly legend first and the fantasy profile beneath it; no separate astral profile in v1 |

### Impact compatibility

Impacts stay type-based and unchanged:
`lake-monsters -1.5/-3`, `sea-monsters -2/-2`, `hill-monsters -2/-6`,
`brigands -3/-5`, `pirates -3/-3`. The generated profile is additive; short-note keywords and
names are not rewritten.

## Shared infrastructure changes

Most plumbing already exists. The expected additions are:

1. Add the three headings in `marker-content.ts`; each kind registers when its generator lands.
2. Add a shared creature core and context/meta types.
3. Add loot-context and loot-die helpers alongside the existing treasure helpers; reuse
   `normalizeTreasureShares`, `applyTreasureModifiers` and `pickTreasureCategory`.
4. Add `create` handlers that infer species/locality from an old marker name/note when meta is
   absent.
5. Reuse `Markers.regenerateGeneratedContent`, `fullNote`, notes splitting, CSV/GeoJSON export
   and the marker-editor reroll button.
6. Reuse `DungeonOverrides` for optional lair/base drafts.

## Data and module layout

| File | Purpose |
|---|---|
| `src/data/creatures.ts` | size/quantity, natures, tags, attack/defense prompts, wants/moves, details, alignment columns, loot-die and wealth tables, loot-context forms, body-part/trinket/gem/jewelry/rarity prompts, curio name templates |
| `src/data/bandits.ts` | gang sizes, composition, leaders/traits, locality, bases, raid patterns, tactics, contraband |
| `src/model/story/creature-profile.ts` | shared creature context/meta types and `CreatureCore` |
| `src/model/story/creature-generator.ts` | shared creature core: size/quantity/nature/tags/attack/want/moves/ratings/inhabitants |
| `src/model/story/beast-generator.ts` | beast territory, inherent harvest, optional lair draft, renderer |
| `src/model/story/monster-generator.ts` | monster lair, hoard, optional curio/lair draft, renderer |
| `src/model/story/bandit-generator.ts` | gang/leader/base, carried/stashed loot, optional base draft, renderer |
| `src/model/story/beast-marker.ts` | beast context, recipe, lazy kind registration |
| `src/model/story/monster-marker.ts` | monster context, recipe, lazy kind registration |
| `src/model/story/bandit-marker.ts` | bandit context, recipe, lazy kind registration |
| `src/model/story/markers-generator.ts` | random placement recipes for the five types |
| `src/model/story/marker-content.ts` | headings and kind registration support |

The exact split can collapse the three generators into one module if the shells stay small, but
the three generated kinds and renderers should remain distinct.

## Build order

1. **Data and shared creature plumbing**
   - Creature and bandit tables, loot-die/wealth/loot-context tables, curio prompts.
   - Add headings and shared context/core types; each kind registers when its generator lands.
   - Tests: table completeness, weights, no banned source terms, heading entries.
2. **Beast profiles**
   - Beast generator, renderer, lazy kind, random placement meta for lake/sea monsters.
   - Inherent harvest, optional small lair draft.
   - Tests: determinism, length/habitat agreement, harvest mix, note size, optional lair.
3. **Monster profiles**
   - Monster generator, renderer, lazy kind, random placement meta for hill monsters.
   - Hoard, optional curio and capped lair draft.
   - Tests: species/nature agreement, hoard mix, curio prompt, note size, optional lair.
4. **Bandit profiles**
   - Bandit generator, renderer, lazy kind, random placement meta for brigands/pirates.
   - Leader/gang/base, carried/stashed loot, optional base draft.
   - Tests: locality/maritime agreement, wealth/loot mix, leader, note size, optional base.
5. **Lifecycle and integration**
   - Verify cleared threats still become ruins with `clearedFrom`.
   - Verify living-threat mappings, astral readings, locked markers and old-map reroll.
   - Tests: cleared conversion, locked markers, old-map backfill, exports render without caching.
6. **Docs and migration**
   - Wiki coverage for beasts, monsters and bandits; link from Markers and Living World.
   - Update `docs/architecture/data-model.md` for the new meta keys.
   - Document old-map reroll backfill; no eager migration.

## Tests

- Data tests for every new table: non-empty, die-sized where relevant, weights sum as expected,
  no banned source terms.
- Generator tests for each kind:
  - same seed + context → same profile
  - ratings stay 1–10; inhabitant rating 1–6
  - treasure shares sum to 100; loot forms are prompts, not silver values
  - renderer escapes names and produces notes-subset HTML
  - note size stays within the kind's budget
- Beast tests:
  - length/habitat meta agrees with the short note
  - inherent harvest biases Art/Relics, near-zero Bullion/Regalia
  - gentle/tiny beasts do not force a lair draft; large/hoarder beasts can
- Monster tests:
  - species/nature agreement; hoard mix; hoarder rolls loot twice
  - curio is a single named prompt with a drawback, not a full magic item
  - optional lair draft stays small/medium
- Bandit tests:
  - locality/maritime agreement; wealth drives the loot die
  - leader present for organized gangs; captives can be a secondary group
  - optional base draft stays small
- Marker/lifecycle tests:
  - all five random sources attach `generated`
  - old markers backfill through reroll without rewriting the short note
  - cleared threats still become ruins with `clearedFrom`
  - exports render profiles without caching them

## Docs

- Add user-facing coverage for the three profiles, either one combined
  `Creature-generation.md` page or separate beast/monster/bandit pages.
- Link from `Markers.md` and `Living-World.md`.
- Update `docs/architecture/data-model.md` with the new `generated.meta` keys.
- State that old maps backfill through the marker editor reroll button, not during load.
- Keep the cleared-threat rule explicit: active beasts/monsters/bandits have their own profiles;
  cleared ones become ruins.

## Licensing and generic vocabulary

The procedure (roll a die, pick from a list, derive tags/want/moves, roll loot by context) is
functional and not the thing to worry about. The table prose is. Do **not** paste the source
document into TS. Write new table strings in the generator's voice, keep only the dice ranges and
generic category data, and remove product-specific terms. Do not copy the bestiary stat blocks,
the d100 name tables, or the example creatures.

Required substitutions in code, output and wiki:

| Source term | Generic output |
|---|---|
| `BOOTY` / booty | `loot`, `treasure`, `spoils`, `harvest` |
| `bd` / booty die | `loot die` / `treasure roll` |
| `SEIZE BOOTY` | `Loot` |
| `INHERENT` | `Harvest` |
| `CARRIED` / `STASHED` / `IN LAIR` | `Carried` / `Stashed` / `Lair` |
| `BODY PART` | `Body part` / `harvest part` |
| `RARITY` | `Rare item` |
| `MAGIC ITEM` | `Curio` (prompt only) |
| `ODDITY` | `Strange feature` |
| `Judge`, `Freebooters` | omit from generated text |

Keep source attribution in this plan and a short code comment (“procedure adapted from …; all
table text rewritten”), not in the user-facing note. Extend the data test that rejects the banned
terms (`booty`, `seclusium`, `gonzo`, `freebooters`, `underlands`, `bd `) in generated table
strings. The word “beast” is a generic English term and is allowed as a kind name; table prose
still uses the generator's own vocabulary.

## Risks and open questions

- **Stat blocks vs prompts.** The source generates HP/armor/damage. FMG profiles are prompt
  sheets; keep numbers out and let Danger/encounter ratings carry the summary. If a later slice
  wants light combat prompts, add them as descriptive text, not a stat block.
- **Beast vs monster overlap.** Hill monsters include beastly species. The `monster` kind can roll
  a beastly nature; lake/sea stay `beast`. If the split feels wrong on real maps, revisit the
  type→kind mapping rather than adding a fourth kind.
- **Loot value.** The source computes silver. Keep dice prompts and the four-category mix; do not
  introduce a silver economy into marker notes.
- **Magic items.** A full enchantment procedure is a separate feature. v1 rolls one curio prompt
  for wealthy monsters/bandit leaders only.
- **Note size.** A monster or bandit with a lair/base draft can grow. Cap drafts to small/medium
  and test note size; child markers remain a later extension.
- **Living threats.** Narrative inhabitants must not override faction military or lair mappings.
  The profile is a prompt sheet, not the simulation's source of truth.
- **Source terms.** The banned-term test is a guardrail, not a legal review. The prose still must
  be rewritten; do not rely on the regex alone.