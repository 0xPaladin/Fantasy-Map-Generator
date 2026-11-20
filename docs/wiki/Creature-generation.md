## Creature generation

Beasts, monsters and bandits are the living threat markers. They use the same lazy generated-content model as dungeons, ruins and underground sites, but they describe a creature or a gang rather than a place. Each keeps its familiar short note and adds an **alternate text profile** under its own heading.

These profiles are **prompt sheets, not stat blocks**. They give size, quantity, nature, tags, attack and defense prompts, a want and moves, plus ratings, inhabitants and treasure — enough to run an encounter, with hit points, armor values and damage left to the table.

### What the three kinds cover

| Marker | Generated kind | Profile focus |
| --- | --- | --- |
| **Lake monsters**, **sea monsters** | `beast` | Aquatic territory, hunting signs, inherent harvest, optional lair draft |
| **Hill monsters** | `monster` | Species and habit, lair and territory, hoard, optional curio and lair draft |
| **Brigands**, **pirates** | `bandit` | Gang and leader, base and raids, carried/stashed loot, optional base draft |

All three share the five 1–10 ratings, the 1–6 inhabitant encounter rating and the four-category treasure mix. See [Dungeon generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Dungeon-generation) and [Ruin generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Ruin-generation) for the shared rating, inhabitant and treasure rules.

### The shared creature core

Every creature profile rolls a common identity:

- **Size and quantity** — tiny to huge; solitary, group, mob or throng, with a number appearing prompt.
- **Nature** — the creature's role, such as an ambush hunter, apex predator, brute, caster or undead horror.
- **Alignment** — rolled from the cell culture's prevailing alignment.
- **Tags** — a few descriptive prompts such as flying, stealthy, toxic, armored, magical, hoarder or leader.
- **Attack and defense** — descriptive forms (bite, venom, breath, weapon; thick hide, scales, worn armor), not numbers.
- **Want and moves** — one attainable goal and 3–5 short moves that cue how the creature acts.

### Beasts

Lake and sea monsters are aquatic beasts. The profile keeps the rolled length and the lake/sea name, then adds a territory survey: habitat, form, lair and signs such as gnawed bones, missing boats or disturbed water.

Beasts yield **inherent harvest**, not coin: hide, meat, organs, teeth/claws, venom, bone. The treasure mix biases toward Art (decorative or functional parts) and Relics (charms, curative organs); Bullion and Regalia stay near zero. Meat and rations are supplies, not counted in the mix. A hoarder beast can also keep a small stash of victims' gear.

The treasure rating is driven by size and hoarding, and sets how much harvest there is. A large, huge or hoarder beast can get one small cave/lair draft; gentle herd beasts and tiny creatures get none.

### Monsters

Hill monsters keep the species, adjective and habit from their legend, then add a lair and territory: a cave, barrow, ruined keep or hollow hill, with a hunting range and the signs or tribute the locals know.

Monsters **hoard**. The loot context is in-lair: gems, jewelry, art objects, rare items, coin from victims, and possibly one curio. The mix biases toward Regalia, Art and Relics with some Bullion; a hoarder rolls more loot.

A magical, hoarder or huge monster can roll one **curio**: a named item with a single power prompt and a drawback. This is a prompt, not a full magic item — no enchantment math or silver value.

A substantial monster lair can get one capped dungeon draft (small or medium), with the type chosen from the nature: crypt for undead, stronghold for brutes and giant-kin, caves for beastly predators and aberrations, laboratory for casters and hags, lair for dragon-kin. Tiny monsters get none.

### Bandits

Brigands and pirates are humanoid raider gangs. The profile keeps the locality and gang identity, then adds a named leader with a trait, a base, prey and a raid tactic. Pirates are flagged maritime and get a seaborne base.

Bandits **carry and stash** raid loot. Wealth is rolled (penniless to fabulous) and drives the treasure rating; the mix biases toward Bullion, with Regalia and Art for wealthy crews. Loot prompts include coin, trade goods, gems, jewelry, personal items and contraband. A wealthy leader can carry one curio.

A large gang — a company or a crew — can get one small base draft (stronghold on land, lair at sea). A small roadside gang gets none.

### Ratings

| Rating | Derived from |
| --- | --- |
| **Danger** | size, quantity, nature, attack forms, tags and leader |
| **Treasure** | size or wealth, hoarder tag and loot context |
| **Scale** | size and quantity, or gang size |
| **Mystery** | magical/aberrant tags, hidden lair, cunning leader |
| **Weirdness** | magical/undead tags, strange features, breath, curio |

### Treasure contexts

The four-category mix describes the value split; the **context** describes where the loot comes from:

| Context | Used by | Typical forms |
| --- | --- | --- |
| **Harvest** | beasts | hide, meat, organs, teeth/claws, venom, bone |
| **Carried** | bandits | coin, personal items, trade goods, gems, contraband |
| **Stashed** | bandits | coin chests, trade goods, gems, jewelry, rare items |
| **Lair** | monsters | coin, gems, jewelry, art objects, rare items, curios, victims' gear |

The treasure rating sets the haul's magnitude — from a pittance to a legendary fortune — and how many loot entries appear. Values stay as the normalized mix; the profiles do not introduce a silver economy. The same rating scales the dice on treasure caches in dungeons and ruins.

### Cleared threats

Active beasts, monsters and bandits carry their own profiles. When an army, an adventuring band, a smiting or an emergent state clears the threat, the marker becomes `Ruins of …` and gains a looted **ruin** profile that remembers the old threat type (`clearedFrom`) and, when known, who cleared it. The creature profile is replaced by the ruin profile. See [Ruin generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Ruin-generation).

### Determinism, rerolling and old maps

Each profile is rolled from its own seeded stream, keyed by the map seed, the marker's cell and the kind. Rerolling adds a salt, and any lair/base draft carries that salt into its own seed. The profile reads the local culture, alignment, biome, height and population; marker meta (species, habitat, length, locality, maritime flag) wins when present.

Open the marker and then its note. The profile is appended under a **Beast profile**, **Monster profile** or **Bandit profile** heading and can be edited in the notes editor. Use the **reroll** button in the marker editor to rebuild it; the short note and marker name stay as they are. Older maps do not backfill during load — a creature gains its first recipe when the reroll button is used, inferring species/habitat/locality from the existing name and note where it can. Locked markers keep their generated content through marker regeneration, and marker CSV/GeoJSON exports render the profile without caching it.

### Limits

- The profiles are system-agnostic prompts, not stat blocks or challenge ratings.
- A curio is a single named power prompt with a drawback, not a full magic item.
- Treasure shares describe the split of value, not item counts or prices.
- Inhabitant groups are top-level categories, not specific factions.
- v1 keeps one marker per creature or gang; lair/base drafts are capped to small/medium.
- Astral view keeps the anomaly legend first and the fantasy profile beneath it; no separate astral profile is generated.
- Living-world threat mappings and faction military are unchanged; profile inhabitants are narrative, not the simulation's source of truth.

### Where the rules come from

The creature-and-loot procedure is adapted from *Freebooters on the Frontier 2e, Vol. IV — Beasts & Booty* as a **procedure reference only**; every table string is rewritten in the generator's own generic vocabulary. The implementation lives in `src/data/creatures.ts`, `src/data/bandits.ts`, `src/model/story/creature-generator.ts`, `src/model/story/beast-generator.ts`, `src/model/story/monster-generator.ts`, `src/model/story/bandit-generator.ts` and their marker modules. Shared context types are in `src/model/story/creature-profile.ts`; lazy content is registered in `src/model/story/marker-content.ts`. The design notes are in `docs/plans/beast-monster-bandit-profiles.md`.

See also: [Markers](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Markers) · [Dungeon generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Dungeon-generation) · [Ruin generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Ruin-generation) · [Underground site generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Underground-site-generation) · [Living World](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Living-World).