## Characters

Every person on the map is a **Character**. Characters are the rulers, generals, prophets, adventurers and specialists of the chronicle, and the same record backs the Living World's heroes. There is one registry, `pack.history.figures`; there is no separate hero store.

Open the editor from _Tools_ → _Characters_, the **Characters** tool button, or **Shift+I**. The Characters layer is off by default and switches on with the editor. Click a marker on the map to open that character's sheet.

### Background characters

A background character carries identity and story, but no stat block:

* name, culture, birth and death;
* dated roles (`ruler`, `general`, `prophet`, `rebel`, `adventurer`, `specialist`, `agent`) with a target;
* alignment, virtues and vices;
* last known cell, captor, tags and notes;
* a relationship matrix toward factions, states and other characters.

A background character can be promoted to a hero at any time.

### The hero sheet

Promoting a character adds the compact **hero sheet**:

* **Attributes** — `might`, `agility`, `wits` and `presence`, each rated `-1..+2`; every point is a flat `+1`;
* **Actions** — all twelve actions rated `d4`, `d6`, `d8`, `d10` or `d12`;
* **Abilities** and **inventory**;
* **XP** and **progression**;
* **Condition** — Resolve, Stamina, maximums, injuries, down state and Push;
* **Doctrine**, temperament and cooldown.

The sheet lives on `Character.hero`. Hero vitals live on `hero.condition`. A character without `hero` is a background character.

### Checks

A heroic task resolves as one **action check**:

`action die + the action's attribute + modifiers` against a DC.

The ladder is easy `4`, standard `6`, hard `8`, extreme `10`.

* **Advantage** rolls two action dice and keeps the best.
* **Disadvantage** rolls two and keeps the worst.
* A `1` is a **complication**; the die's maximum is a **critical**.

Advantage and disadvantage never step the die; they add or remove a die. Provincial trouble and lair domain resolution uses the same check.

### Archetypes and abilities

Ten archetypes — Warden, Ranger, Scholar, Priest, Shadow, Factor, Envoy, Alchemist, Warlock and Freeblade — set a hero's starting attributes, action dice, one ability, temperament and default doctrine.

An archetype is a **starting package**, not a permanent class. Abilities such as `melee`, `barter` or `arcana_divination` are labels and tags; a matching ability grants up to `+2` on a check. They are not a second numeric skill list.

### Aspects

Each hero's first virtue and first vice are mechanically active. A virtue matched to the task gives `+1`; a matching vice gives `-1`; the net bonus is clamped to `[-1, +1]`. The remaining traits stay flavour.

### Growth and paths

Each level steps action dice, and levels 3 and 6 present two small path choices that add an action step or an ability. Ignored choices are resolved after two idle seasons using the hero's doctrine.

### Vitals and injuries

Heroes have **Resolve** (staying power) and **Stamina** (extra effort) in `hero.condition`.

* At 0 Resolve the hero is **downed** for two seasons.
* Resolve recovers `+1` per season (`+2` with a healer); a healer can clear one injury per season.

### Stamina

Before a check a hero may spend Stamina for `+1` per point.

* Below level 5 that is capped at **1 Stamina per task**; at level 5+ it is capped at **2**.
* The hero inspector's **Push** toggle spends up to that cap from the hero's current Stamina.

### Relationships

Standing toward factions, states and other characters uses the same tiers as factions: `Ally`, `Friendly`, `Neutral`, `Suspicion`, `Rival`, `Enemy`.

Characters have no `renown`; standing is the relationship matrix on the sheet. Faction membership is derived from `memberIds` / `candidateIds`, never stored on the character.

### Where to read more

* [Living World](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Living-World) — the seasonal simulation and god-mode inspector.
* [Legends browser](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Legends) — the chronicle's figures.
* [Character plan](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/characters.md) and [data model](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/architecture/data-model.md).