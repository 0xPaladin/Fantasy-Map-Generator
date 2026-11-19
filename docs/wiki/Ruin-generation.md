## Ruin generation

Ruin markers describe fallen places: a watchtower, a village, a town or a capital complex. Each one adds an **alternate text profile** generated from the map itself: its original identity, fall, present state, sites, surface zones, ratings, inhabitants, treasure mix, secrets and rumors.

The profile is not a battle map and not a stat block. It is a gazetteer entry for running the place, with the mechanical details left to the table.

### What a ruin marker contains

A generated ruin marker has two layers:

* **Short note** — the familiar one-line legend, such as “Ruins of an ancient city. Untold riches may lie within.”
* **Alternate profile** — generated text appended under a **Ruin profile** heading. It is built on demand, not during map generation.

The profile is cached on the marker after the first read, so a map only grows for ruins whose notes were actually opened. Marker CSV and GeoJSON exports render the profile without caching it.

### Ruin tiers

A ruin's tier decides how large the place was and how many sites it has. Random ruins are weighted toward small sites; history can override the roll.

| Tier | Original settlement | Sites | Dungeon sites | Scale | Random weight |
| --- | --- | ---: | ---: | ---: | ---: |
| **Outpost** | watchtower, fortlet, shrine, road station | 1 | 0 | 2 | 40 |
| **Village** | hamlet or village | 1–2 | 0–1 | 4 | 30 |
| **Town** | town or small city | 2–3 | 1 | 6 | 20 |
| **City** | major town or city | 3–5 | 1–3 | 8 | 8 |
| **Capital** | fallen capital or metropolis | 4–6 | 2–4 | 10 | 2 |

A capital ruin is a **multi-site complex, not one mega-dungeon**. The parent profile is the surface overview and gazetteer; only a few of its sites get a full dungeon draft.

### Sites and sub-dungeons

The main site follows the ruin's original purpose. Later sites are drawn from the site table and named from the local adjectives, such as *The Weeping Undercroft*.

| Site | Dungeon type when selected |
| --- | --- |
| Palace or keep | Stronghold |
| Temple | Temple |
| Crypt | Crypt |
| Undercroft, cellar or sewer | Caves |
| Academy or library | Laboratory |
| Unknown site | Place of unknown origin |
| Market, walls, harbor or residential district | No dungeon; descriptive site only |

A dungeon site is generated with the normal dungeon procedure, using the site's own deterministic seed and a type override. Sub-dungeons are capped at **small or medium** and never exceed 15 areas, so a capital does not become a hundred-area note. Their profiles are rendered inline beneath the parent ruin.

### What the profile covers

| Section | What it gives you |
| --- | --- |
| Name and tier | The current name, the original name, the tier and the site count |
| Ratings | Five 1–10 summaries: Danger, Treasure, Scale, Mystery and Weirdness |
| Treasure mix | Four shares of the remaining hoard: Bullion, Regalia, Art and Relics |
| Inhabitants | A 1–6 encounter rating and zero, one or two inhabitant groups |
| What it was | Original purpose, original polity when history knows it, culture and age |
| Fall | Cause, year and who cleared it when known |
| Present state | Condition, accessibility and surface state |
| Sites | The site list, marking which sites are dungeons |
| Zones | 4–8 surface zones, each with a condition, discoveries, dangers and exits |
| Sub-dungeons | Full dungeon drafts for the selected sites |
| What remains | Two or three surviving features |
| Secrets and rumors | One or two secrets and two or three local claims |

### Origins, causes and present state

The original purpose is rolled from a ruin origin table: settlement, fortress, temple, tomb, academy, palace, mine, harbor, monastery, road station or a place of unknown purpose. The origin also supplies the surface zone vocabulary, inhabitant weights and treasure bias.

The fall rolls a cause: war, siege, plague, famine, fire, earthquake, flood, curse, arcane disaster, overrun by monsters, resource depletion, abandonment or unknown. History can replace it with a known event.

The present state rolls three independent facts:

* **Condition** — vestiges and foundations, a skeletal shell, a partial ruin, largely intact, well preserved or restored by later hands.
* **Accessibility** — sealed, hidden, concealed by terrain, buried, partly uncovered or clear and obvious.
* **Surface state** — overgrown, burned, flooded, collapsed, occupied, picked clean, half-buried or quiet.

### Surface zones

Zones are a scene-level map, not a room-by-room dungeon draft. Each zone rolls a type from the ruin's origin, a condition, an optional discovery, an optional danger and one or two exits. Discoveries can be features, finds or a treasure cache; a cache is tagged with one of the four treasure categories.

### Ratings

Five **1–10 ratings** summarize the finished profile. They are derived from what was generated, not rolled independently.

| Rating | What it measures | Derived from |
| --- | --- | --- |
| **Danger** | How likely the place is to harm a party | danger zones, dungeon sites, inhabitants, condition and surface state |
| **Treasure** | Value and quality of what remains | tier, treasure caches, rich origins and whether the site was looted |
| **Scale** | Original size and campaign importance | the ruin tier |
| **Mystery** | Lost records, hidden paths and unanswered questions | accessibility, age, secrets, dungeon sites and origin |
| **Weirdness** | Curses, relics and old magic | the cause of ruin, relic share and certain secrets |

A rating of **1** is a local nuisance; **10** is a regional or campaign centrepiece.

### Treasure mix

The **Treasure** rating is the total value; the **treasure mix** says what form it takes. The four categories are shared with dungeons, states and factions:

| Category | Meaning | Examples |
| --- | --- | --- |
| **Bullion** | coin, ingots and easy loot | coin, silver ingots, plate, raw metal |
| **Regalia** | crown jewels and ceremonial objects | crown, sceptre, seal, ceremonial sword, throne |
| **Art** | commissioned works and collections | paintings, tapestries, illuminated books, sculpture |
| **Relics** | sacred or historical objects | saint's relic, founder's blade, sacred vessel, dynastic standard |

The shares always add up to 100%. They start from the ruin's origin and shift for the cause of ruin. A **looted** site loses bullion, regalia and art but keeps a larger share of relics. Temples and tombs lean relics; academies lean art; mines lean bullion; palaces lean regalia.

The parent mix describes the complex as a whole. Each sub-dungeon also rolls its own local mix; treat both as shares of the same site, not as separate hoards to add together.

### Inhabitants

**Inhabitants 1–6** is the encounter rating. Each ruin turn, roll a `d6`; an encounter happens on a result **less than or equal to** the rating, using the same scale as dungeons.

An empty ruin is a real result. The chance of no inhabitants falls with tier: 45% for an outpost, 35% for a village, 25% for a town, 15% for a city and 10% for a capital. An empty profile still reads “none (wandering vermin or scavengers)”.

A populated ruin rolls one group half the time and two groups the other half, with a relation when there are two. Groups are weighted by the ruin's origin: crypts lean undead, temples lean undead and outsiders, mines lean vermin and constructs, settlements lean people. Humans and humanoids borrow the local culture name, such as **Aeloran humans**.

### Random ruins, history and cleared threats

All three ruin sources use the same profile:

| Source | What the profile knows |
| --- | --- |
| **Random ruins** | The marker's short note, the map seed and the cell. The tier is rolled from the weights and the past is invented |
| **History fall markers** | A fallen capital seat becomes a **capital** ruin with its original polity, fall year and cause of war. A fallen province burg becomes a **town** ruin at population 20+, otherwise a **village** ruin |
| **Cleared danger markers** | The former marker name and type, the clearing, and that the site was looted. Dungeons, necropolises and rifts become **village** ruins; other threats become **outpost** ruins |

History facts win when they exist: the original name, original polity, fall year and cause come from the chronicle rather than the random tables. Chronicle ruins are replaced when history is regenerated.

When a danger-marker stronghold is cleared by an army, adventurers, a smiting or an emergent state, its marker becomes `Ruins of …`, keeps the resolution note and gains a **looted** ruin profile with the original threat and, when known, the name of whoever cleared it.

### Determinism and map context

The profile is rolled from its own seeded stream, keyed by the map seed and the marker's cell. The same map and cell produce the same ruin. The parent and each sub-dungeon have separate deterministic seeds.

The profile also reads the local map context:

* the cell's **culture** supplies the culture name and the alignment column
* the **biome** supplies place flavour and rumor text
* the cell's **height** is passed to sub-dungeons

A marker's current name is the profile heading. The original name comes from history when known, otherwise from the ruin name tables.

### Reading, editing and rerolling

Open a ruin marker and then its note. The profile is appended under a **Ruin profile** heading. It is ordinary notes-subset HTML and can be edited in the notes editor's HTML source view.

Use the **reroll** button in the marker editor to rebuild the profile. Rerolling:

* keeps the short note and the marker name
* replaces the cached profile
* rerolls the ruin's sub-dungeons with it
* gives an older ruin marker its first profile

Older maps do not backfill ruin profiles during load. Their ruins keep the one-line note until the reroll button is used. A marker of another type does not gain a ruin profile, and a locked marker keeps its generated content through marker regeneration.

### Limits

* The profile is system-agnostic. Creatures, hazards and treasure are prompts; hit points, damage and exact treasure values are not generated.
* The ratings are summaries derived from the table results, not a challenge-rating formula.
* The treasure mix describes the split of value, not item counts or prices.
* Inhabitant groups are top-level categories, not specific factions.
* Not every ruin has a dungeon. Only a subset of sites becomes a full dungeon, and v1 keeps one marker per ruin rather than child pins.
* Necropolises and disturbed burials remain separate marker types; they are not forced into the ruin profile.
* The profile follows the map context at the moment it is generated. If the culture or biome changes before the first read, the profile uses the changed map.

### Where the rules come from

The implementation lives in `src/data/ruins.ts`, `src/model/story/ruin-generator.ts`, `src/model/story/ruin-marker.ts` and the lazy marker content registry in `src/model/story/marker-content.ts`. Placement is wired through `src/model/story/markers-generator.ts`, `src/model/physical/history-generator.ts`, `src/data/danger-markers.ts` and `src/model/physical/living-threats.ts`. The design notes are in `docs/plans/ruin-profiles.md`.

See also: [Markers](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Markers) · [Dungeon generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Dungeon-generation) · [Underground site generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Underground-site-generation) · [Creature generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Creature-generation) · [History](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/History) · [Living World](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Living-World).