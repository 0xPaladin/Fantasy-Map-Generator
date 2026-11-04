## Living World
The _Living World_ is a seasonal 4X simulation layered on top of a finished map. Underneath FMG's editors and `.map` format it now runs an **OpenCiv-style empire engine**: Voronoi tiles produce seven yields, major burgs work their land and run production queues, states research technologies, coin money and keep their people content, armies fight as culture-unique combined-arms stacks, and faith spreads city to city. Rulers age, borders move, wars begin and end, and the chronicle grows — one season at a time.

Open it from _Options_ → _Tools_ → _Living World_, or type "living world" in the omnibar. The simulation is optional: old maps initialize it lazily the first time you open the HUD or step a season, and every OpenCiv field defaults safely on an existing save.

### The HUD
The HUD is a compact bar at the bottom of the map. It can be dragged anywhere on screen.

* **Pause** stops the clock.
* **Step +1 Season** advances one season and redraws the political map.
* **Step +1 Year** advances four seasons.
* **Play 1× / Play 4×** runs the simulation automatically at a leisurely or brisk pace.
* The **date badge** shows the current season and year. Clicking it opens the _Legends browser_ and its time slider.
* The **news ticker** lists the latest dispatches — wars, battles, conquests, musters, constructions, technologies, religious conversions, successions and revolts. Click any headline to zoom the map to where it happened.

Each tick writes to the map itself: borders, burg ownership, regiments, battle markers, the **Religions layer**, and chronicle events all change as the simulation runs. On the map, every army box carries a **capability bar**, a stack badge and a composition strip; wounded armies are tinted, and battlefields, besieged cities and headline events get markers.

The optional **Trouble** layer draws a pin for every active provincial trouble and lair: hover a pin to read its level, theme, save and garrison (or pin the note open), and the native danger markers on the markers layer resolve to the same lair notes. Cleared lairs leave explorable **ruins** behind instead of vanishing.

### The inspector
While the HUD is open, click a state or a burg on the map to open its diorama card.

A **state** card leads with the **OpenCiv Empire** panel:

* **Yields per season** — 🌾 Food, 🔨 Production, 🪙 Gold, 🔬 Science, 🎭 Culture and ✨ Faith, plus the state's **net Happiness** and treasury.
* **Happiness breakdown** — base, luxuries, buildings, religion and relics, minus city, citizen and occupation-unrest unhappiness.
* **Research** — the technology being studied, its banked Science, and how many technologies the state already knows.
* **Faith** — the state religion, its pantheon, its Holy City and the Faith cost of the next Great Prophet.
* **Armies** — every field army with its capability %, nominal men, block count, mean experience and stance; adjacent enemies show win odds, a compact card reports the last battle, and the composition drill-down lists each block's roster unit, `hp` and `exp`.

Below that the card keeps the familiar **ruler & traits**, **agenda**, **stability** (unravel and war-exhaustion meters), **claims & grudges**, restive burgs, provincial troubles and lairs, plus quick buttons for the _States Editor_ and _Regiments Overview_. The **capability** meter (`M`, `W`, `S`, `C`) is displayed at the bottom, directly reflecting constructed OpenCiv buildings via `civBuildingCapacity` (e.g. barracks and walls for Military, markets and banks for Wealth, monuments and temples for Social, libraries and universities for Cunning) alongside province levies and trade goods. While unit upkeep is managed via OpenCiv Gold maintenance, these scores drive the domain check modifiers `(+N)` used by units, specialists and rulers to resolve Provincial Troubles and delve lairs.

A **burg** card shows its owner, tier and population, its unrest and standing assets, and the **OpenCiv City** panel:

* **City yields** for the seven OpenCiv resources, plus citizens, stored Food, acquired tiles and City HP.
* **Production** — the queue with each item's banked Production and cost.
* **Religion** — the city's majority faith and its per-religion pressure.
* **Province** — public order, stability, development, active **Trouble** (with its save bane and specialist role) and active **Lair** (threat level, raid threshold, defenders and fortifications).

The state card also lists its **Provinces** as clickable chips, and each one opens a **province card**: public order, stability and development, the province capital and its faith, the active Trouble and Lair, and buttons to jump to the Provinces Editor or back to the state.

The native editors surface the same live data. The **Burgs Editor** adds a *Living World* summary for the selected burg (citizens, city yields, City HP, majority faith and the current production item) with an **Inspect** button that opens its city card. The **Provinces Editor** adds a **Living** column — public order with ⚠️ trouble and 💀 lair markers — and a **Province Details** dialog (the castle button on each row) with the province's order, stability and development, its M/W/S/C domain checks, standing assets and burg feature toggles; the Living column opens the province card, which links back to that dialog.

### What the simulation does
The Living World reads and mutates FMG's live `pack`, so the native editors stay authoritative: editing a burg's walls, a state's treasury, cell ownership, goods or regiments is adopted on the next tick.

#### Seasons and years
One tick is one season; four seasons make a year. Rulers age and the world's chronicle advances at each spring boundary.

#### Tiles, yields and resources
Every land tile produces seven OpenCiv yields, shown by the inspector and summed by the cities that work it.

* **Terrain & elevation** — grassland feeds `2 Food`, plains and savanna `1 Food + 1 Production`, hills `2 Production`, desert only yields with fresh water, tundra `1 Food`, marsh `1 Food` at double movement cost, mountains are impassable and unworkable. Freshwater lakes give `2 Food`; coasts `1 Food + 1 Gold`; deep ocean `1 Food`.
* **Forest & jungle canopy** — deciduous and boreal forest `1 Food + 1 Production`, rainforest `2 Food`; both cost `2` movement and grant `+25%` defence.
* **Rivers** — a river tile or a bordering freshwater lake counts as fresh water; an unbridged river crossing drains a unit's remaining movement, and the defender gets the river bonus in battle.
* **Trade goods become resources** — every `pack.goods` entry is classified as **Bonus** (Food, Construction, Utilities), **Strategic** (Military/Ore, hidden until its reveal technology) or **Luxury** (`+4` Empire Happiness per unique improved luxury). Their bonus yield scales from `+1` to `+2` once improved.
* **Tile improvements** — Builders construct `farm`, `mine`, `quarry`, `pasture`, `plantation`, `camp`, `lumber_mill`, `trading_post` and `fishing_boats`. The OpenCiv catalog's technology tile bonuses then upgrade them (Civil Service farms, Chemistry mines, Fertilizer farms/pastures, Scientific Theory lumber mills, Economics camps, …) and appear in the inspector as a separate *Technology* source.
* **Minor burgs are villages** — every non-capital settlement inside a province acts as an innate village improvement on its cell: `+1 Food, +2 Gold`, plus plaza/temple/walls/port bonuses, and it auto-connects its underlying trade good. Pillaging or a burg trouble disables those bonuses until repaired.

#### Major burgs (cities)
State capitals, province capitals and major Free City-States run the full OpenCiv city loop. Other settlements are villages.

* **Citizens & worked cells** — citizens derive from burg population. The centre is worked for free (minimum `2 Food`); remaining citizens work owned tiles within three hops. A **Food floor** assignment fills growth first, then a ruler-weighted assignment (martial rulers favour Production, civic rulers Gold/Science, pious rulers Faith/Culture). Pinned cells are always honoured, and one city never steals another's tiles.
* **Food & growth** — each citizen eats `2 Food`. Surplus fills a `15 + 8 × citizens` bucket; filling it adds a citizen. An Aqueduct keeps `40%` of the bucket (Hospital `+25%`), and Fertility Rites, Swords into Plowshares, Temple of Artemis and Empire Happiness multiply growth. Negative food starves a citizen away. A queued **Settler** converts all food surplus into Production.
* **Culture borders** — Culture fills a `⌊20 + (10 × tiles)¹·¹⌋` bucket (Angkor Wat discount, Religious Settlements speed-up). The city then claims the best unowned neighbouring tile: visible luxuries, strategic resources, Free Burgs, rivers and bonus goods score best, mountains worst. The claimed tile joins the burg's province, and a claimed Free Burg is annexed peacefully if it shares culture or faith, or taken by force otherwise.
* **Production** — a seasonal Production queue builds units, buildings and wonders. The autonomous governor raises **Walls** when at war or restive, then the economy/science core (Monument, Granary, Library, Market, Shrine, Workshop, Aqueduct, University, Bank, Public School, Factory), then a **Builder** while owned tiles sit unimproved, a **Settler** when the empire is happy enough, a melee unit when at war without an army, and finally the cheapest available National or World Wonder.
* **World Wonders** — a wonder can only be raised once per world. When one city completes it, every rival city that had it queued drops the project and is refunded **1 Gold per invested Production**.
* **FMG flags stay in sync** — Palace ↔ capital, Walls/Castle/Arsenal/Military Base ↔ `burg.walls`/`citadel`, Market/Bank ↔ `burg.plaza`, Shrine/Temple/Cathedral ↔ `burg.temple`, Lighthouse/Harbor/Seaport ↔ `burg.port`. Editing those flags in the _Burgs Editor_ demolishes or raises the matching OpenCiv buildings on the next tick.

#### Science and technology
States research the 80-technology OpenCiv tree, and the tree adapts to the map.

* **Adaptive era cap** — Fantasy maps stop at the **Renaissance / Arcane-Clockwork** era; maps set in a Steam/Industrial/Modern era (or after year 1800), and the Astral Cartographer view, unlock the full tree through the **Information** era.
* **Science** — every city contributes its tile and building Science. Libraries add `+0.5` per citizen, Public Schools `+0.5` per citizen plus `3`, Universities `+33%` and `+2` per worked jungle, Observatories `+50%`, and National Colleges `+50%` plus `3`. Beliefs and leased **tome** relics add more.
* **Research** — Science banks into the current technology. When it completes, the state immediately starts the cheapest reachable technology it has not yet learned; players and Sandbox tools can steer the queue. **Great Library** and **Oxford University** grant free technologies.
* **Unlocks** — technologies gate buildings and units, reveal strategic resources, add tile-improvement bonuses, and unlock bridge-building, upgraded units and the rest of the OpenCiv vocabulary.

#### Gold, treasury and happiness
* **Treasury per season** — `Σ city Gold − building maintenance − army upkeep + leased-relic tribute` is banked into `state.treasury`, where army upkeep is `Σ roster.upkeep × block.hp`, less a 0.6 Gold free allowance, plus `0.1` per civilian regiment. Three baseline blocks are free.
* **Gold hurry** — a state with a comfortable reserve (100 Gold above the price) can buy the current production item outright; units cost `20%` more, Big Ben discounts `15%`.
* **Bankruptcy** — a treasury below zero resets to `0` and disbands the newest **block**; a regiment disappears only when its last block goes.
* **Happiness** — `9 + 4 × unique improved luxuries + buildings + wonders + religion + relics − 3 × major burgs − Σ citizens − Σ ⌈unrest / 2⌉` for conquered cities. Local city happiness (Colosseum, Zoo, Stadium, Circus, Stone Works) is capped by that city's citizens; wonder, luxury, belief and regalia happiness is not.
* **Happiness tiers** — Content empires grow at `100%` and slowly pacify (`−2` unravel per season, more when very happy); Unhappy empires grow at `25%` and add `+2` unravel; Very Unhappy empires stop growing entirely, fight at two thirds strength (`−33%` combat) and add `+6` unravel. A full unravel meter still breaks a burg away.

#### Armies: culture-unique combined-arms stacks
Every **1 FMG regiment = 1 army** made of up to 20 **blocks**, and every block is one roster unit. A block stores `{ type, hp, exp }`: **`hp` is its current capability (0–1)**, not a headcount. `UnitType.quantity` is only the fiction's nominal size — 100 levy or one dragon — so a damaged block fights proportionally worse without tracking individual soldiers.

* **Rosters** — the 32 shipped culture rosters supply every stat: `attack`, `defense`, `charge`, `missile`, category (melee, ranged, cavalry, artillery, monster, spellcaster), powers, `resistArcane` and `quantity`. Two authored economies: `cost` is **Production** to raise a block, and `upkeep` is **Gold per tick** at full capability.
* **Recruitment** — a city queues a roster unit and finishes it with Production; completion appends a block at `hp = 1`, either to the army at that city or to a new regiment. Barracks-style buildings add training experience. Technologies gate which roster units are recruitable through a derived category ladder.
* **Upkeep** — `Σ roster.upkeep × block.hp`, less the 0.6 Gold free allowance, plus `0.1` per civilian regiment. A block at half capability pays half.
* **Movement & stacking** — one combat army plus one utility unit per state and cell; foreign armies never share a cell. The **slowest block** sets the pace: cavalry `4`, everything else `2`, roads `1/3`, hills/forest/jungle/marsh `2`, unbridged rivers drain the remainder, mountains and wrong-domain water are impassable. Missionaries and prophets ignore closed borders.
* **Combat** — armies fight through the OpenConquest Lanchester engine: a 6×6 category matchup, combined-arms power, tactical orders (`balanced`, `skirmish`, `press`, `charge`, `brace`), magic (ward, hex, heal, terror, arcane siege) and a **25% rout** line. Terrain (`+25%`), river crossings (`+15%` defender), city walls (per tier), encampment (`+10%`), ambush, empire happiness and the weapon relic all apply.
* **Veterancy** — surviving blocks of the winning side gain `+1 exp` per battle; `exp 0..9` multiplies power (`0.85 + 0.03 × exp`). Refits follow `upgradesTo` (or the category ladder), cost Gold, require the target's technology and **preserve `hp` and `exp`**.
* **Replenishment** — a block that did not fight recovers `+0.25 hp` in a friendly city, `+0.125` in friendly land and nothing in neutral or enemy territory; `encamp` doubles the rate. There is no separate healing pool.
* **Sieges** — a city is defended by its **roster garrison**, which grows with walls and settlement tier. The attacking army fights that garrison as a normal battle; a win captures the city (half the citizens, reset HP, cleared queue, national/world wonders destroyed, Palace relocated, occupation unrest seeded). A loss retreats the survivors one cell and leaves the city standing.
* **City strikes** — each major city removes **one block step** (`0.1 hp`) from the weakest hostile army within two cells, once per season.
* **Civilians** — Settler, Builder, Work Boat, Caravan, Cargo Ship, Missionary, Inquisitor and Great Prophet keep their single-unit simulation and all their old behaviour; they never carry blocks.
* **Determinism** — battle rounds and casualty jitter draw from the Living World PRNG, so the same map, seed and season reproduce the same survivors.

#### Religion
Faith is a real resource, and the **Religions layer is live**.

* **Pantheons** — a state that banks `10 + 5 × founded-pantheon` Faith adopts one of 26 pantheon beliefs, whose yields join its empire totals.
* **Great Prophets** — costing `200 + 100 × prophets` Faith (Messiah belief discounts to `75%`) with a `5% + excess-Faith` chance each season. The first prophet links the capital's native `pack.religions` entry — or founds a new Organized faith — declares the capital its **Holy City**, converts the city, and picks one Founder and one Follower belief. The second enhances the faith with another Follower and an Enhancer belief.
* **Pressure** — every citizen represents `60` pressure. Cities with a majority faith radiate `6` pressure (`12` from the Holy City) within 10 hops (13 with Itinerant Preachers), boosted by Religious Texts and the Grand Temple. When a city's majority flips, the province's `pack.cells.religion` is repainted and a dispatch is posted.
* **Missionaries & Inquisitors** — Missionaries spread `180` pressure and carry two charges; Inquisitors halve rival pressure in their own cities. Both ignore closed borders.

#### Diplomacy
* **Closed borders** — regiments may not enter another state's territory at peace; units that ignore borders (missionaries, prophets) may.
* **Wars last at least 10 seasons** before peace can be signed. Peace locks both states into a **10-season truce** during which neither may declare war again, and exhausted states (war exhaustion ≥ 50 or a seasonal chance) sue for peace on their own.
* **Peace expels trespassers** — any regiment left in foreign land is moved to the nearest friendly or unowned cell. Claims and grudges still shape whom a state attacks next.

#### Provincial troubles, lairs and ancient ruins
The 46 fantasy **Provincial Troubles** (19 of them state-promotable) and 20 **Provincial Lairs** (15 state-capable) still drive the roleplay layer, with their domain resolution checks powered by OpenCiv capability generation.

* **Troubles** — each season (or upon restless conquest) a local obstacle can crop up from a province's burgs, ruins or resources. Trouble adds $\lceil \text{level} / 2 \rceil$ to the state's `M`, `W` and `S` load, drains order by $\text{level} \times 2$, floors burg unrest, freezes garrison stability and suppresses resource trade goods. If unchecked it escalates every two seasons. States address it through the `resolve_trouble` agenda, rolling $1\text{d}20 + \text{valueModifier}(\text{pool.gen}) - \text{unit.disruption}$ against one of six saves (`disorder`, `uprising`, `poverty`, `ignorance`, `despair`, `corruption`); matching specialists roll at normal DC, mismatched units suffer penalties, failures inflict unit Disruption, and successes reduce severity.
* **Lairs** — troubles left lingering (≥ 3 seasons or level ≥ 5) metastasize into permanent fortified lairs (or spawn from wilderness perils). Lairs place a marker, keep an entrenched garrison, add $\lceil \text{level} / 2 \rceil$ load, drain order, freeze stability, and roll each season to launch raids against nearby settlements. Raiders clash with garrisons, then tear down buildings or pillage development. Lairs block civic resolution and demand either a **military expedition** (`clear_lair`: +15 order, +2 stability, −2 war exhaustion on victory) or an **adventurer delve** (`hire_adventurers`: roll vs $14 + \text{level}$; full success clears it, near misses weaken it, failures can kill heroes).
* **Emergent sovereign realms** — promotional troubles (19 of 37) and state-capable lairs (15 of 20) can become new states: a coup when order collapses (≤ 25) or a realm is in turmoil, or a lair ascension after eight seasons at level ≥ 8 (or by capturing a settlement during a raid). Emergent states seize or found a capital, scaffold walls/barracks/market/temple, reset province order and stability, receive 150 Gold, field a first regiment, mint an aggressive ruler and enter war with claims and grudges against their former sovereign.
* **Ancient ruins** — a regiment stepping onto an unexcavated `ruins` marker claims a bonus (`+75 Gold`, a citizen, or research progress); the Guild can excavate them for relics.

#### Agendas, unrest and chronicle
* **Agendas** — states still choose one realm-level project at a time: `muster`, `develop`, `build`, `colonize`, `conquer`, `reclaim`, `pacify`, `resolve_trouble`, `clear_lair` or `hire_adventurers`. Ruler traits and culture values weight that choice. City **production** itself is autonomous and no longer consumes an agenda.
* **Development & assets** — provinces spend stability and wealth to raise development; the legacy construction path still exists for AER assets, while city buildings come from the OpenCiv production queue.
* **Unrest** — occupied burgs carry unrest, which drains order, raises unhappiness and contributes to the owner's unravel clock. Garrisoning a burg or building a temple helps it decay; a `pacify` agenda speeds it up and may assimilate the burg's culture or faith.
* **Rulers, grudges, rebellion** — rulers age and are succeeded; weak courts can trigger succession crises. Wars, sacks, slain rulers and breakaways become weighted grudges, and lost burgs become claims. A full unravel meter still breaks a burg away — rejoin its homeland, defect to kin, restore independence, or found a secessionist state.
* **Epochs** — every `snapshotIntervalYears` (ten years by default) the political map is captured for the _Legends browser_ time slider.

The simulation is deterministic: the same starting map and seed, stepped the same number of seasons, produce the same yields, city growth, borders, research, wonder winners, battles, conversions and chronicle events. Its state lives in `pack.history.living`, so a saved `.map` file keeps rulers, cities, technologies, religions, units, agendas, unrest and snapshots when it is loaded again.

### God mode
The inspector's _God Mode_ section lets you intervene without waiting for the simulation to reach a result.

* **Spark Rebellion** — sets a state's most restive burg (or the selected burg) on the path to secession and fills the state's unravel clock.
* **Smite Ruler** — kills the current ruler and immediately plays out the succession.
* **Force War** — declares war on a neighbouring rival.
* **Pacify Unrest** — clears a burg's unrest at once, eases its owner's unravel and begins assimilation.
* **Complete Asset** — finishes the burg's current construction, or starts and finishes the best available asset.
* **Spawn Trouble** — seeds a procedural trouble crisis in the selected province.
* **Quell Trouble** — immediately quashes an active provincial trouble.
* **Resolve Trouble** — triggers a domain saving throw attempt by the province's owning state.
* **Promote to State** — immediately promotes an eligible political or factional trouble into an emergent sovereign state.
* **Spawn Lair** — creates an entrenched lair stronghold with defenders and a map marker in the province.
* **Assault Lair** — orders the state's field army to launch an immediate assault on the lair.
* **Send Adventurers** — dispatches an adventuring party to delve into the lair.
* **Ascend Lair** — immediately ascends a state-capable lair into an emergent sovereign state.
* **Smite Lair** — strikes down the lair and its defenders by divine intervention.

Every intervention is written to the same chronicle and news ticker as a normal seasonal step.

### The Grand Guild
_Open the Living World HUD in **Guild Mode** (the default) to play as an independent Adventurers' Guild. **Sandbox God Mode** keeps every free intervention above for worldbuilders._

* **Wallet and renown** — heroes earn gold, renown and experience from missions; chapterhouses pay passive dues; renown promotes the Guild through five tiers (larger roster, more vault slots, better checks).
* **Relics & archaeology** — heroes excavate ruins, battlefields, dungeons, necropolises, statues and libraries. Chronicle sites always yield a named `HistoricalRelic` minted from the nearest fallen realm, dead hero or site (e.g. _Crown of the Vhaelen Emperors_). Relics can be **equipped** on a hero (one each), **enshrined** in the vault (up to one per tier, granting +10% contract gold/renown/xp per point) or **leased** to a state. A leased relic pays the Guild **10 Gold** and the state **10 Gold** per season, and grants a category perk to the state: **regalia** `+4` Happiness and `−2` unravel, **charter** `+15%` capital Gold, **tome** `+15%` capital Science, **idol** `+4` Faith and `+2` Culture, **weapon** `+15%` combat strength. If a leased state's capital falls, its relics are buried in a fresh ruin and must be excavated again.
* **Petitions** — every ~5 seasons a ruler, burg or frightened priesthood asks the Guild to pick a side in an active crisis. Click the ⚖️ popup (or its chip in the guild bar) to open a two-choice dilemma card trading gold and renown against real outcomes: coups birth states, crackdowns quell troubles, tithes purge — or enrich — lairs.

### Heroes
* **Identity** — recruit seekers from the tavern each spring. Every hero has an archetype, three disciplines, an active virtue and vice, vitals and a personal doctrine. The idle doctrine dispatches them (`Hunt Troubles`, `Hunt Lairs`, `Excavate Ruins`, `Patrol`, `Support`, or `Manual`). Veterans of age 55+ can **Retire & Mentor** a protege.
* **Archetypes & disciplines** — ten archetypes (Warden, Ranger, Scholar, Priest, Shadow, Factor, Envoy, Alchemist, Warlock and Freeblade) set a hero's favoured pools, starting skills, disciplines, temperament and default doctrine. Disciplines such as `melee`, `barter` or `arcana_divination` give up to `+2` when their tags match a mission.
* **Aspects** — each hero's first virtue and first vice are mechanically active. A virtue matched to the mission gives `+1`; a matching vice gives `-1`; the net bonus is never more than one point either way. Other traits remain flavour.
* **Growth and paths** — missions award XP; pool growth is deterministic each level. Levels 3 and 6 present two small path choices instead of an automatic point. Ignored choices are resolved after two idle seasons using the hero's doctrine.
* **Vitals and injuries** — heroes have **Resolve** (staying power) and **Stamina** (extra effort). A failed mission costs 2 Resolve; a fumble costs 4, forces a DC 12 survival save, and can leave a **wounded**, **shaken** or **lost** injury instead of killing the hero outright. At 0 Resolve the hero is **downed** for two seasons. Resolve recovers +1 per season at the Guild Hall (+2 with a healer), and a healer can clear one injury per season.
* **Stamina** — before a mission check a hero may spend Stamina for `+1` per point spent. Below level 5 that is capped at **1 Stamina per mission**; at level 5+ it is capped at **2**. The hero inspector's **Push** toggle spends up to that cap from the hero's current Stamina. Auto-dispatch only pushes when the expected success is below 60% and the hero stays above their archetype's Stamina reserve. A level 5+ hero with Push enabled therefore spends 2 when they have at least 2 Stamina, and 1 if only 1 remains. Stamina spent is shown on the mission card and in the news log.
* **Party expeditions** — dispatching auto-fills a party: up to two heroes at Guild tiers 1-2, up to three from tier 3. Missions run through two or three phases (Approach/Breach, Survey/Delve/Extraction, and so on); level 5+ lairs and chronicle ruins add a third phase. The best hero for each phase is chosen automatically, no hero takes more than two phases, and missing pool coverage applies an untrained `-2` penalty with no discipline bonus. Full success resolves the target, partial success halves rewards and weakens it, and failure costs each survivor 2 Resolve. Pin a leader from the burg party panel to keep them in front and auto-fill the rest.
* **Guild operations** — paid, hero-led interventions in Guild Mode. **Pacify & Mediate** (40g, Priest/Envoy) clears burg unrest and adds +10 province order. **Rush Asset Charter** (50g, Factor/Scholar) finishes a construction at once. **Incite Uprising** (75g, Shadow) starts a revolt or promotes a state-capable trouble. **Assassinate Ruler** (100g, Shadow, C vs DC 15) forces a succession. **War Broker** (80g, Envoy, S/C vs DC 15) brokers a truce or provokes a border war. The chosen operator is busy for a season; failed checks leave them busy for two.

### The Wheel of Ages
The **eschaton clock** (⏳ in the guild bar) measures how close the age is to its finale. It rises each season for every level 8+ lair, when an evil sovereign conquers a burg, and when a major state collapses; purging lairs winds it back by 5.

Once the clock reaches **100** — or the Guild reaches **tier 5** — the **Turn the Wheel of Ages** button illuminates. Turning it plays out the epoch bake:

1. **Bake the epoch** — the current borders are cloned into `pack.history.snapshots` and recorded as a `HistoryEpoch`, so the Legends browser' year slider can scrub back through every age you played.
2. **Fallen empires** — every state whose unravel clock passed 50 is retired into `pack.history.realms`, its lands go wild, and a `chronicle` ruins marker seeded with a realm-named relic appears at its capital.
3. **A new era** — the calendar leaps forward 150 years into a freshly named era; giant empires (more than 3 provinces) shatter into successor states and free burgs; all unravel and war exhaustion resets; every state crowns a fresh young ruler.
4. **Prestige carryover** — the Guild keeps its tier, vault, leased relics and chapterhouses, and `ageCount` rises. Living heroes pass into legend, and each hero of level 3+ is succeeded by a **scion** carrying the ancestor's best skill plus one permanent point per prestige age and their signature virtue.

### Where to read more
The OpenCiv economy design is in [`docs/plans/living-openciv.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/living-openciv.md), the army model in [`docs/plans/living-openciv-armies.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/living-openciv-armies.md), alongside the older [`living-world.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/living-world.md), [`lair-ascension.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/lair-ascension.md), [`living-idle-guild.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/living-idle-guild.md) and [`hero-diversity.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/hero-diversity.md) plans.

The simulation code lives in `src/model/physical/living-generator.ts`; the army helpers and the roster bridge live in `src/model/physical/living-armies.ts`; the OpenCiv catalogs (technologies, buildings, civilians, beliefs, improvements, themes) live in `src/data/living-civ-*.ts`; the HUD and inspector live in `src/controllers/living-hud.ts`; the map overlay lives in `src/renderers/draw-living-overlay.ts`; hero catalogs live in `src/data/hero-*.ts`.