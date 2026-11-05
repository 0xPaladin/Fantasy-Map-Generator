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

The sheet lives on `Character.hero`. Hero vitals live on `hero.condition`; `GuildState.heroes` is a deprecated migration source only. A character without `hero` is a background character.

### Checks

A mission phase is one **action check**:

`action die + the action's attribute + modifiers` against a DC.

The mission ladder is easy `4`, standard `6`, hard `8`, extreme `10`.

* **Advantage** rolls two action dice and keeps the best.
* **Disadvantage** rolls two and keeps the worst.
* A `1` is a **complication**; the die's maximum is a **critical**.

Advantage and disadvantage never step the die; they add or remove a die.

### Archetypes and abilities

Ten archetypes — Warden, Ranger, Scholar, Priest, Shadow, Factor, Envoy, Alchemist, Warlock and Freeblade — set a hero's starting attributes, action dice, one ability, temperament and default doctrine.

An archetype is a **starting package**, not a permanent class. Abilities such as `melee`, `barter` or `arcana_divination` are labels and tags; a matching ability gives up to `+2` on a mission check. They are not a second numeric skill list.

### Aspects

Each hero's first virtue and first vice are mechanically active. A virtue matched to the mission gives `+1`; a matching vice gives `-1`; the net bonus is clamped to `[-1, +1]`. The remaining traits stay flavour.

### Growth and paths

Missions award XP. Each level steps action dice, and levels 3 and 6 present two small path choices that add an action step or an ability. Ignored choices are resolved after two idle seasons using the hero's doctrine.

### Vitals and injuries

Heroes have **Resolve** (staying power) and **Stamina** (extra effort) in `hero.condition`.

* A failed mission costs 2 Resolve; a fumble costs 4, forces a survival save, and can leave a **wounded**, **shaken** or **lost** injury instead of killing the hero outright.
* At 0 Resolve the hero is **downed** for two seasons.
* Resolve recovers `+1` per season at the Guild Hall (`+2` with a healer); a healer can clear one injury per season.

### Stamina

Before a mission check a hero may spend Stamina for `+1` per point.

* Below level 5 that is capped at **1 Stamina per mission**; at level 5+ it is capped at **2**.
* The hero inspector's **Push** toggle spends up to that cap from the hero's current Stamina.
* Auto-dispatch only pushes when the expected success is below 60% and the hero stays above their archetype's Stamina reserve.

Stamina spent is shown on the mission card and in the news log.

### Party expeditions

Dispatching auto-fills a party: up to two heroes at Guild tiers 1–2, up to three from tier 3.

* Missions run through two or three action phases (Approach/Breach, Survey/Delve/Extraction, and so on); level 5+ lairs and chronicle ruins add a third phase.
* The best hero for each phase is chosen automatically; no hero takes more than two phases.
* An untrained action applies a `-2` penalty with no ability bonus.
* Full success resolves the target; partial success halves rewards and weakens it; failure costs each survivor 2 Resolve.

Pin a leader from the burg party panel to keep them in front and auto-fill the rest.

### Guild operations

Paid, hero-led interventions in Guild Mode:

* **Pacify & Mediate** (40g, Priest/Envoy) clears burg unrest and adds `+10` province order.
* **Rush Asset Charter** (50g, Factor/Scholar) finishes a construction at once.
* **Incite Uprising** (75g, Shadow) starts a revolt or promotes a state-capable trouble.
* **Assassinate Ruler** (100g, Shadow) forces a succession.
* **War Broker** (80g, Envoy) brokers a truce or provokes a border war.

The chosen operator is busy for a season; failed checks leave them busy for two. These legacy operations still use the deprecated d20 pool adapter until the progress conversion.

### Relationships

Standing toward factions, states and other characters uses the same tiers as factions: `Ally`, `Friendly`, `Neutral`, `Suspicion`, `Rival`, `Enemy`.

Characters have no `renown`; standing is the relationship matrix on the sheet. Faction membership is derived from `memberIds` / `candidateIds`, never stored on the character.

### Where to read more

* [Living World](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Living-World) — the seasonal simulation and the Grand Guild.
* [Legends browser](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Legends) — the chronicle's figures.
* [Character plan](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/characters.md) and [data model](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/architecture/data-model.md).