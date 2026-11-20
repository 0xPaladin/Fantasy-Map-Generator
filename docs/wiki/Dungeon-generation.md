## Dungeon generation

Dungeon markers sit on isolated, sparsely populated cells. Each one keeps its Watabou one-page dungeon preview and adds an **alternate text profile** generated from the map itself: a name, size, themes, origin, area draft, dangers, discoveries and rumors.

The text profile is not a battle map and not a stat block. It is a prompt sheet for running the place: enough structure to start describing rooms and choosing what lives there, with the mechanical details left to the table.

### What a dungeon marker contains

A generated dungeon marker has two layers:

* **Watabou preview** — the familiar link and iframe. Its seed is the map seed plus the marker's cell, so the same map keeps the same one-page dungeon.
* **Alternate profile** — generated text stored in the marker's note. It is built on demand, not during map generation.

The short note stays small. Hovering a dungeon shows only the Watabou preview; the full profile appears when the note is opened. The generated text is cached on the marker after the first read, so a map only grows for dungeons whose notes were actually opened. Marker CSV and GeoJSON exports do not grow the save.

### What the profile covers

| Section | What it gives you |
| --- | --- |
| Name | A dungeon name built from a place, adjective and noun table, with the local culture name as one possible element |
| Size | Small, medium, large or huge; the number of areas and themes follows from it |
| Alignment and safety | The dungeon's moral character and a safety tag. Safety shifts the creature danger roll |
| Ratings | Five 1–10 summaries: Danger, Treasure, Scale, Mystery and Weirdness |
| Treasure mix | Four shares of the hoard: Bullion, Regalia, Art and Relics |
| Themes | One to five motifs, depending on size: greed, transformation, forbidden knowledge or cosmic alignment. Themes are prompts for connecting rooms and occupants |
| Overview | Dungeon type, accessibility, builder, situation, condition and cause of ruin |
| Type details | The special overview for the dungeon type: occupant and defenses, cave type, mined resource, prisoners, crypt occupant, temple dedication, laboratory focus and so on |
| Areas | A numbered node map of rooms and passages, each with an area type, dressing, discoveries, dangers and exits |
| Inhabitants | A 1–6 encounter rating and one or two inhabitant groups, with a relation when there are two |
| Rumors | Two or three local claims about the place, ready to be true, false or somewhere in between |

### What it looks like

A profile reads as a short gazetteer entry followed by a numbered draft:

* **The House of Aeloran** — medium, 14 areas, two themes: elemental magic (stars or cosmos), forbidden knowledge
* **Ratings:** Danger 5/10 · Treasure 5/10 · Scale 5/10 · Mystery 5/10 · Weirdness 3/10
* **Treasure mix:** Bullion 6% · Regalia 24% · Art 35% · Relics 35%
* **Inhabitants:** 4/6 (d6 ≤ 4 each turn) · Aeloran humanoids + Outsiders (predator and prey)
* **Overview:** neutral, unsafe, temple or sanctuary; clear and obvious; built by a sorcerer-king or queen; belowground; a decayed skeleton of a structure; being overrun by monsters
* **Area 3:** antechamber or vestry — an echo. **Find:** evidence of a creature. **Exits:** unexplored (left, locked door)
* **Danger in area 9:** a pale elemental
* **Rumors:** “Hunters avoid the forest around The House of Aeloran.” “Someone has offered coin for a map to The House of Aeloran.”

The exact rolls differ by map and cell; this only shows the shape of the result.

### Dungeon types

The type roll decides which overview tables are used. Every type then borrows the same area and danger machinery.

| Type | What the overview rolls |
| --- | --- |
| Lair, den or hideout | Main occupant, entrance and defenses. The area layout is borrowed from another dungeon type |
| Caves or caverns | Cave origin, number of entrances and the main entrance form |
| Mine | Resource mined, mine entrance and extraction method |
| Prison | Prisoner type, perimeter and security |
| Stronghold or fortress | Approach, defenses and the threat it was built against |
| Crypt or tomb | Occupant, exterior marker and entrance |
| Temple or sanctuary | Religion, dedication and primary role |
| Laboratory or remote retreat | Practitioner, focus of study and method |
| Place of unknown origin | Entrance, current inhabitants and legendary foe |

### How the area draft works

Areas are generated as a connected graph, not a grid:

1. The entrance leads to area 1.
2. Each area rolls its type, contents, dressing and number of exits.
3. An exit rolls a direction and a form: a tunnel, locked door, stair, shaft, secret passage or something stranger.
4. A “back” exit connects to an area that already exists. Other exits become open connections.
5. The next area is attached to one of the open connections. Connections left at the end are listed as unexplored exits.

An area can roll a special area such as a burial vault, underground lake, sealed cellblock or summoning circle. It can also redirect into another dungeon type's tables. Redirects stop after two levels, so the draft always terminates.

Contents decide how many discoveries and dangers an area holds. Discoveries are either **features** (a pit, a slope, a ledge, a carved wall) or **finds** (supplies, a key, a body, a treasure cache). Dangers are leaders, creatures or hazards. Safety shifts the creature roll: safer dungeons lean toward ordinary animals and people, while perilous ones leave more room for monsters. Treasure is left as dice notation, such as `treasure cache (1d8+1)`, scaled to the dungeon's Treasure rating rather than converted into a made-up value; each cache is also tagged with its mix category.

### Ratings

Five **1–10 ratings** summarize the finished draft. They are derived from what was generated, not rolled independently, so they always agree with the rooms and dangers below them.

| Rating | What it measures | Derived from |
| --- | --- | --- |
| **Danger** | How likely the place is to kill or drive off a party | safety, danger density, leaders and monstrous creatures |
| **Treasure** | Value and quality of what can be taken | treasure caches, dungeon type, special vaults and size |
| **Scale** | Size and campaign importance | size, area count and the importance of the builder |
| **Mystery** | Secrets, lore, hidden paths and unanswered questions | accessibility, secretive themes, clues, hidden areas and type |
| **Weirdness** | Supernatural, alien or impossible content | magic, element and strange results, strange areas, type and alignment |

A rating of **1** is a bumbling-commoner problem in that category; **10** is world-shattering. The ratings are the quickest way to answer “is this a cellar, a regional problem or a campaign centrepiece?”

### Treasure mix

The **Treasure** rating is the total value; the **treasure mix** says what form it takes. The four categories are the same ones used by the state and faction stash:

| Category | Meaning | Examples |
| --- | --- | --- |
| **Bullion** | vaults, ingots and coin; easy to loot, low prestige | coin, silver ingots, plate, raw metal |
| **Regalia** | crown jewels and ceremonial objects; legitimacy | crown, sceptre, seal, ceremonial sword, throne |
| **Art** | commissioned works, museums and collections; culture and prestige | paintings, tapestries, illuminated books, sculpture |
| **Relics** | sacred or historical objects; faith and influence | saint's relic, founder's blade, sacred vessel, dynastic standard |

The shares always add up to 100%. They start from the dungeon type and then shift for the builder, lair occupant, themes and special areas. Mines and bandit lairs lean bullion; temples and crypts lean relics; strongholds lean regalia and art; laboratories lean art and relics.

```text
Treasure mix — Bullion 6% · Regalia 24% · Art 35% · Relics 35%
```

A generated `treasure cache` is tagged with one of the categories from the mix, so a chest is not just "treasure"; it is bullion, regalia, art or relics. The dice notation, scaled to the Treasure rating, remains the total value. Regalia, art and relics may need the right buyer, and they can carry political or religious consequences that coin does not.

### Inhabitants

**Inhabitants 1–6** is the encounter rating. Each dungeon turn, roll a `d6`; an encounter happens on a result **less than or equal to** the rating.

| Rating | Meaning | Chance |
| --- | --- | --- |
| 1 | abandoned or one hidden squatter | 1-in-6 |
| 2 | one small group, rare patrols | 2-in-6 |
| 3 | one settled group, occasional traffic | 3-in-6 |
| 4 | one large group or two groups, regular patrols | 4-in-6 |
| 5 | two active groups, frequent traffic | 5-in-6 |
| 6 | swarming, encounter nearly every turn | always |

The rating starts from the dungeon's size, then rises for two inhabitant groups, for at least one danger per area, and for a leader. It is clamped to 1–6.

The inhabitants themselves are one top-level group half the time, and two distinct groups the other half. Each dungeon type weights the possibilities: crypts lean undead, caves lean beasts and vermin, laboratories lean constructs and outsiders, and so on.

| Group | Examples |
| --- | --- |
| Humans | local people, soldiers, bandits, cultists, prisoners |
| Humanoids | dwarves, halflings, goblins, orcs, giant-kin |
| Beasts | natural animals and giant animals |
| Monsters | dragons, chimeras, magical predators, aberrations |
| Undead | skeletons, zombies, ghouls, wraiths, vampires |
| Constructs | golems, animated armour, machines |
| Outsiders | demons, celestials, elementals, extraplanar beings |
| Fey & spirits | fey, nature spirits, local supernatural powers |
| Plants & fungi | moulds, carnivorous plants, fungal colonies |
| Vermin & swarms | insects, rats, bats, crawling swarms |

Humans and Humanoids borrow the local culture name, so a result can read **Aeloran humans**. When there are two groups, the profile also rolls a relation: hostile, uneasy truce, master and servants, predator and prey, competing for the same resource, or unaware of each other.

### Determinism and map context

The profile is rolled from its own seeded stream, keyed by the map seed and the marker's cell. The same map and cell produce the same dungeon name and profile. The profile also reads the local map context:

* the cell's **culture** supplies the culture name and, when culture traits are enabled, the prevailing alignment column
* the **biome** supplies place flavour and rumor text

The Watabou preview and the text profile are separate. The text can describe a different layout from the Watabou map; it is an alternate reading of the same site, not a key to the picture.

### Reading, editing and rerolling

Open a dungeon marker and then its note. The profile is appended to the Watabou note under a **Dungeon profile** heading. Because the Watabou preview is an iframe, the notes editor keeps dungeon notes in HTML source mode; the profile is ordinary notes-subset HTML and can be edited there.

Use the **reroll** button in the marker editor to rebuild the profile. Rerolling:

* keeps the Watabou link and iframe
* keeps a custom marker name
* replaces the cached profile
* gives an older dungeon marker its first profile, and replaces the old generic `Dungeon` name with a generated one

Older maps do not backfill profiles during load. Their dungeons get one when the reroll button is used.

Marker CSV and GeoJSON exports include the full profile, including the Watabou note. They render the profile on demand without caching it, so exporting a map does not make its save larger.

### Delving

A dungeon can be explored. Open the marker and press **Delve**, or press **Delve** on a hero's sheet to choose the dungeon from there.

* **Party** — pick one to six living characters. Background characters get a hero sheet when they first delve. Choose a leader, an order and up to four retainers; retainers extend the supply clock and never make checks.
* **Orders** — **Swift** speeds progress but the dungeon reacts to critical failures; **Cautious** softens both threat dice and grants one free reroll per objective; **Greedy** takes half again the loot but the party breaks at 40% Resolve.
* **The run** — the party faces objectives drawn from the area draft. Each situation is one opposed roll: the acting hero's action die plus a support die against one **alert** die and one **rating** die — Danger for fights and traps, Mystery for clues and finds, Weirdness for special set pieces. Alert starts from the inhabitants rating and climbs as the party makes noise; the dungeon also answers failed rolls with Resolve loss and injuries.
* **The report** — the delve resolves atomically and opens a report. **Step** reveals the chronicle one event at a time, **Show all** shows the outcome and the loot.
* **Outcomes** — a triumph clears the dungeon: the profile shows a depleted Treasure rating and plundered caches, and the state persists. A retreat keeps what the party carries. A defeat downs the heroes for two seasons and loses the bag. Standing heroes earn XP, loot lands in their inventories as coin and named pieces, the marker note gains a **Delve record** section, and the chronicle records a deed.
* **Cleared and weakened** — a cleared dungeon can be delved again, but finds only a picked-over shell. Slaying the leader without finishing the place leaves it **weakened**: its alert starts one step lower.

### Limits

* The profile is system-agnostic. Creatures, hazards and treasure are prompts; hit points, damage and exact treasure values are not generated.
* The ratings are summaries derived from the table results, not a challenge-rating formula. They describe the draft, not a guaranteed difficulty for a particular party.
* The treasure mix describes the split of value, not item counts or prices. Regalia, art and relics may need the right buyer; the shares are not automatic coin values.
* Inhabitant groups are top-level categories, not specific factions. Two human groups are still “humans” at this level.
* A roll of a megadungeon is treated as a huge dungeon in this version. Nested megadungeon wings are a possible later extension.
* The profile follows the map context at the moment it is generated. If the culture or biome changes before the first read, the profile uses the changed map; the eager marker name stays.
* Astral view keeps the fantasy profile under the anomaly legend. A separate derelict profile is not generated.

### Where the rules come from

The procedure is adapted from the dungeon chapter of *Freebooters on the Frontier 2e, Vol. III — Overland & Underworld*. The dice ranges and table structure follow that procedure; the table wording, terminology and presentation here are the generator's own. The implementation lives in `src/data/dungeons.ts`, `src/model/story/dungeon-generator.ts`, `src/model/story/dungeon-marker.ts` and the lazy marker content registry in `src/model/story/marker-content.ts`. The design notes are in `docs/plans/dungeon-profiles.md`.

See also: [Markers](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Markers) · [Ruin generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Ruin-generation) · [Creature generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Creature-generation).