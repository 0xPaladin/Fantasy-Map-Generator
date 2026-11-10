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

The optional **Trouble** layer draws a pin for every active provincial hazard and dangerous faction: hover a pin to read its level, theme, save and garrison (or pin the note open), and the native danger markers on the markers layer resolve to the same faction notes. Cleared hazards and factions leave explorable **ruins** behind instead of vanishing.

### The inspector
While the HUD is open, click a state or a burg on the map to open its diorama card, and alt-click any cell (or click land nobody owns) for the cell's own card.

A **state** card leads with the **OpenCiv Empire** panel:

* **Yields per season** — 🌾 Food, 🔨 Production, 🪙 Gold, 🔬 Science, 🎭 Culture and ✨ Faith, plus the state's **net Happiness** and treasury; the treasury chip also shows the season's net Gold and opens the **State Budget**.
* **Happiness breakdown** — base, luxuries, buildings and religion, minus city, citizen and occupation-unrest unhappiness.
* **Research** — the technology being studied, its banked Science, and how many technologies the state already knows.
* **Faith** — the state religion, its pantheon, its Holy City and the Faith cost of the next Great Prophet.
* **Armies** — every field army with its capability %, nominal men, block count, mean experience and stance; adjacent enemies show win odds, a compact card reports the last battle, and the composition drill-down lists each block's roster unit, `hp` and `exp`.
* **Upstream economy** — the state's **prosperity** (opens the state's Economy dialog), **stability** (opens the Stability overview), a **Budget** button, the people's **development** with its era, and the forces' **upkeep** with the power multiplier it gives them in battle.

Below that the card keeps the familiar **ruler & traits**, **agenda**, **stability** (unravel and war-exhaustion meters), **claims & grudges**, restive burgs, provincial troubles and dangerous factions, plus quick buttons for the _States Editor_ and _Regiments Overview_. The **capability** meter (`M`, `W`, `S`, `C`) is displayed at the bottom, directly reflecting constructed OpenCiv buildings via `civBuildingCapacity` (e.g. barracks and walls for Military, markets and banks for Wealth, monuments and temples for Social, libraries and universities for Cunning) alongside province levies and trade goods. While unit upkeep is managed via OpenCiv Gold maintenance, these scores drive the domain check modifiers `(+N)` used by units, specialists and rulers to resolve Provincial Troubles and delve dangerous factions.

A **burg** card shows its owner, tier and population, its unrest and standing assets, the **OpenCiv City** panel, and the city's **upstream economy**: its **prosperity** (opens the burg's Economy Overview) and its **trade balance**, what it sold less what it bought in the last run.

* **City yields** for the seven OpenCiv resources, plus citizens, stored Food, acquired tiles and City HP.
* **Production** — the queue with each item's banked Production and cost.
* **Religion** — the city's majority faith and its per-religion pressure.
* **Province** - public order, stability, development, active **Trouble** (with its save bane and specialist role) and hostile **dangerous factions** (threat level, raid threshold, military and fortifications).

A **cell** card shows the cell's biome, owner state, province and burg, its derived seasonal yields, its **development** with its era, its **prosperity**, its deposit, the Builder improvement standing on it (or that it was pillaged), and what its people produce a day by good. Alt-click works on any cell; a plain click picks a cell only where nobody owns the land and no burg or marker stands.

The state card also lists its **Provinces** as clickable chips, and each one opens a **province card**: public order, stability and development, the province capital and its faith, the active Trouble and dangerous factions, and buttons to jump to the Provinces Editor or back to the state.

The native editors surface the same live data. The **Burgs Editor** adds a *Living World* summary for the selected burg (citizens, city yields, City HP, majority faith and the current production item) with an **Inspect** button that opens its city card, plus the resident faction HQ/outposts with their citizens, worked cells, city yields and production queue. The **Factions Editor** adds Yields, Citizens, Worked Cells and Production columns (Food/Prod/Gold/Sci/Cult/Faith/Hap from `yieldsPerTurn`/`happiness`), and the Outposts & Assets dialog shows per-node citizens, worked cells, yields, upstream trade and the full queue. The **Provinces Editor** adds a **Living** column — public order with ⚠️ hazard and 💀 dangerous-faction markers — and a **Province Details** dialog (the castle button on each row) with the province's order, stability and development, standing assets and burg feature toggles; the Living column opens the province card, which links back to that dialog. The **State Cities & Yields** dialog shows the state's treasury, prosperity, stability and development beside its cities, each city's prosperity and a button to its own Economy dialog.

### What the simulation does
The Living World reads and mutates FMG's live `pack`, so the native editors stay authoritative: editing a burg's walls, a state's treasury, cell ownership, goods or regiments is adopted on the next tick.

#### Seasons and years
One tick is one season; four seasons make a year. Rulers age and the world's chronicle advances at each spring boundary.

#### Tiles, yields and resources
Every land tile produces seven OpenCiv yields, shown by the inspector and summed by the cities that work it.

* **Terrain & elevation** — grassland feeds `2 Food`, plains and savanna `1 Food + 1 Production`, hills `2 Production`, desert only yields with fresh water, tundra `1 Food`, marsh `1 Food` at double movement cost, mountains are impassable and unworkable. Freshwater lakes give `2 Food`; coasts `1 Food + 1 Gold`; deep ocean `1 Food`.
* **Forest & jungle canopy** — deciduous and boreal forest `1 Food + 1 Production`, rainforest `2 Food`; both cost `2` movement and grant `+25%` defence.
* **Rivers** — a river tile or a bordering freshwater lake counts as fresh water; an unbridged river crossing drains a unit's remaining movement, and the defender gets the river bonus in battle.
* **Trade goods become resources** — every `options.map.goods` entry is classified as **Bonus** (Food, Construction, Utilities), **Strategic** (Military/Ore, hidden until its reveal technology) or **Luxury** (`+4` Empire Happiness per unique improved luxury). Their bonus yield scales from `+1` to `+2` once improved.
* **Tile improvements** — Builders construct `farm`, `mine`, `quarry`, `pasture`, `plantation`, `camp`, `lumber_mill`, `trading_post` and `fishing_boats`. The OpenCiv catalog's technology tile bonuses then upgrade them (Civil Service farms, Chemistry mines, Fertilizer farms/pastures, Scientific Theory lumber mills, Economics camps, …) and appear in the inspector as a separate *Technology* source. They also raise the cell's output in the underlying [economy](Economy.md#the-living-world-economy): a farm or pasture `+35%` for its goods, a mine `+40%`, more with the matching technology.
* **Minor burgs are villages** — every non-capital settlement inside a province acts as an innate village improvement on its cell: `+1 Food, +2 Gold`, plus plaza/temple/walls/port bonuses, and it auto-connects its underlying trade good. Pillaging or a burg trouble disables those bonuses until repaired.

#### The economy underneath
The simulation sits on FMG's own [economy](Economy.md): the goods, markets, prices, taxes, budgets and prosperity of the last run. It reads them, bends them, and writes a little back.

* **The run feeds the sim.** Improvements and buildings raise what the land and the workshops produce; a pillaged cell keeps a quarter of its output. A burg's people eating well (prosperity) makes the court happier, the books and paper it buys add to its Science, and a well-served court adds Culture and Faith.
* **The sim feeds the run.** Each spring, or when the map changes, the economy is regenerated and a season of its flows — **ninety days** — is banked onto a lasting reserve: a state's collected taxes less corruption and spending, a burg's product less its poll tax. Upkeep, hurry costs, gifts and deficits draw on that reserve, so treasuries grow and shrink over the seasons instead of resetting each day. Charters' tithes appear in the state's budget as **Chartered Faction Tithes**.
* **Rulers lean on it.** Ruler traits curb or raise official corruption, get more out of the court, administration and infrastructure, and keep troops keen; a state's **magistrate** specialist helps with graft and works. An **audit** cuts corruption and recovers graft into the treasury, while **sabotage** spoils a deposit's output.
* **Goods equip the armies.** A roster unit asks for goods — arms, horses and harnesses, artillery and gunpowder — and a state musters only as many blocks as it can equip; the rest take the field as levies. Underfunded armies fight worse. See [Military Forces](Military-Forces.md#living-world-musters-and-upkeep).
* **Factions earn like states.** A commercial faction takes a commission on its host market's trade, an underworld one siphons the province's graft and smuggles past tariffs, a mercenary company draws a retainer, and temples and chanceries take a share of the court's spending. See [Factions](Factions.md#upstream-economy-income).

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
* **Science** — every city contributes its tile and building Science. Libraries add `+0.5` per citizen, Public Schools `+0.5` per citizen plus `3`, Universities `+33%` and `+2` per worked jungle, Observatories `+50%`, and National Colleges `+50%` plus `3`. Beliefs add more.
* **Research** — Science banks into the current technology. When it completes, the state immediately starts the cheapest reachable technology it has not yet learned; players and Sandbox tools can steer the queue. **Great Library** and **Oxford University** grant free technologies.
* **Unlocks** — technologies gate buildings and units, reveal strategic resources, add tile-improvement bonuses, and unlock bridge-building, upgraded units and the rest of the OpenCiv vocabulary.

#### Gold, treasury and happiness
* **Treasury per season** — `Σ city Gold − building maintenance − army upkeep` is banked into `state.treasury`, where army upkeep is `Σ roster.upkeep × block.hp`, less a 0.6 Gold free allowance, plus `0.1` per civilian regiment. Three baseline blocks are free. The same season also banks the [upstream economy](#the-economy-underneath)'s own net cash onto the reserve.
* **Gold hurry** — a state with a comfortable reserve (100 Gold above the price) can buy the current production item outright; units cost `20%` more, Big Ben discounts `15%`.
* **Bankruptcy** — a treasury below zero resets to `0` and disbands the newest **block**; a regiment disappears only when its last block goes.
* **Happiness** — `9 + 4 × unique improved luxuries + buildings + wonders + religion − 3 × major burgs − Σ citizens − Σ ⌈unrest / 2⌉` for conquered cities. Local city happiness (Colosseum, Zoo, Stadium, Circus, Stone Works) is capped by that city's citizens; wonder, luxury and belief happiness is not.
* **Happiness tiers** — Content empires grow at `100%` and slowly pacify (`−2` unravel per season, more when very happy); Unhappy empires grow at `25%` and add `+2` unravel; Very Unhappy empires stop growing entirely, fight at two thirds strength (`−33%` combat) and add `+6` unravel. A full unravel meter still breaks a burg away.

#### Armies: culture-unique combined-arms stacks
Every **1 FMG regiment = 1 army** made of up to 20 **blocks**, and every block is one roster unit. A block stores `{ type, hp, exp }`: **`hp` is its current capability (0–1)**, not a headcount. `UnitType.quantity` is only the fiction's nominal size — 100 levy or one dragon — so a damaged block fights proportionally worse without tracking individual soldiers.

* **Rosters** — the 32 shipped culture rosters supply every stat: `attack`, `defense`, `charge`, `missile`, category (melee, ranged, cavalry, artillery, monster, spellcaster), powers, `resistArcane` and `quantity`. Two authored economies: `cost` is **Production** to raise a block, and `upkeep` is **Gold per tick** at full capability.
* **Recruitment** — a city queues a roster unit and finishes it with Production; completion appends a block at `hp = 1`, either to the army at that city or to a new regiment. Barracks-style buildings add training experience. Technologies gate which roster units are recruitable through a derived category ladder. A block also asks for goods — arms, horses and harnesses, artillery and gunpowder — and the state musters only what it can equip; the rest fall back to levies ([Military Forces](Military-Forces.md#living-world-musters-and-upkeep)).
* **Upkeep** — `Σ roster.upkeep × block.hp`, less the 0.6 Gold free allowance, plus `0.1` per civilian regiment. A block at half capability pays half.
* **Movement & stacking** — one combat army plus one utility unit per state and cell; foreign armies never share a cell. The **slowest block** sets the pace: cavalry `4`, everything else `2`, roads `1/3`, hills/forest/jungle/marsh `2`, unbridged rivers drain the remainder, mountains and wrong-domain water are impassable. Missionaries and prophets ignore closed borders.
* **Combat** — armies fight through the shared battle engine (`src/model/battle/battle.ts`): a 6×6 category matchup, combined-arms power, tactical orders (`balanced`, `skirmish`, `press`, `charge`, `brace`), magic (ward, hex, heal, terror, arcane siege) and a **25% rout** line. Terrain (`+25%`), river crossings (`+15%` defender), city walls (per tier), encampment (`+10%`), ambush (`+30%` attacker) and empire happiness all apply. **Stances** change the march: `march` grants ×1.5 movement but cannot open a battle, `encamp`/`ambush` grant ×0.7, and a war army resting in the open outside its own land conceals itself for the next attack.
* **Veterancy** — surviving blocks of the winning side gain `+1 exp` per battle; `exp 0..9` multiplies power (`0.85 + 0.03 × exp`). Refits follow `upgradesTo` (or the category ladder), cost Gold, require the target's technology and **preserve `hp` and `exp`**.
* **Replenishment** — a block that did not fight recovers `+0.25 hp` in a friendly city, `+0.125` in friendly land and nothing in neutral or enemy territory; `encamp` doubles the rate. There is no separate healing pool.
* **Sieges** — a city is defended by its **roster garrison**, which grows with walls and settlement tier. A besieger with a supply buffer wears the garrison down **15% per season** (floored at 40%), then either assaults when the defenders weaken or the odds reach 40%, or starves the city out. A win captures it under a **policy** — `occupy`, `loot`, `sack` or `raze` — changing citizens, treasury plunder, unrest and whether the city survives. A loss retreats the survivors one cell and leaves the city standing.
* **City strikes** — each major city removes **one block step** (`0.1 hp`) from the weakest hostile army within two cells, once per season.
* **Civilians** — Settler, Builder, Work Boat, Caravan, Cargo Ship, Missionary, Inquisitor and Great Prophet keep their single-unit simulation and all their old behaviour; they never carry blocks.
* **Determinism** — battle rounds and casualty jitter draw from the Living World PRNG, so the same map, seed and season reproduce the same survivors.

#### Factions on the same engine
Factions are first-class OpenCiv polities ([Factions wiki](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Factions)). Every HQ and outpost is a `BurgSimState` city-node that works cells, gathers the seven yields, grows citizens, and queues buildings/units. Host burgs, faction nodes and rival factions share one `globalWorkedCells` pool within 3 hops: `state_arm` works after the state, `chartered` alternates after the food floor and pays 15% tithe, `autonomous` interleaves by influence vs order, `clandestine`/`hostile` pre-draft and siphon up to 50% of the host centre gold. Empire rollup sums city yields (science via `citySciencePerTick()`), minus maintenance/upkeep, banks net gold, computes happiness (`9 + 4 × luxuries + buildings − 3 per node − citizens`), and researches on the OpenCiv tree with +25% host spillover. On top of the worked cells they also earn from the [economy underneath](#the-economy-underneath) — trade commissions, graft, smuggling, retainers and court tithes ([Factions](Factions.md#upstream-economy-income)). Tactically, faction Builders improve worked cells, Settlers march to burgs and found outposts, and `ArmyBlock[]` armies — keyed `f{id}-{regimentId}` — use the same `resolveArmyBattle()`/siege/pillage machinery, triggering `ascendFactionToState()` for sovereign ambitions. State city strikes and replenishment now cover faction armies; faction nodes strike enemy armies in range 2 in turn. Against hostile factions, states run a production-funded `suppress_faction` agenda (influence damage per completed operation, guard stalls, pillage, HQ relocation/dissolution) and storm wilderness strongholds — HQs with no burg on state-owned cells — as a military-only assault ([Factions wiki](Factions.md)).

#### Religion
Faith is a real resource, and the **Religions layer is live**.

* **Pantheons** — a state that banks `10 + 5 × founded-pantheon` Faith adopts one of 26 pantheon beliefs, whose yields join its empire totals.
* **Great Prophets** — costing `200 + 100 × prophets` Faith (Messiah belief discounts to `75%`) with a `5% + excess-Faith` chance each season. The first prophet links the capital's native `pack.religions` entry — or founds a new Organized faith — declares the capital its **Holy City**, converts the city, and picks one Founder and one Follower belief. The second enhances the faith with another Follower and an Enhancer belief.
* **Pressure** — every citizen represents `60` pressure. Cities with a majority faith radiate `6` pressure (`12` from the Holy City) within 10 hops (13 with Itinerant Preachers), boosted by Religious Texts and the Grand Temple. When a city's majority flips, the province's `pack.cells.religion` is repainted and a dispatch is posted.
* **Missionaries & Inquisitors** — Missionaries spread `180` pressure and carry two charges; Inquisitors halve rival pressure in their own cities. Both ignore closed borders.

#### Diplomacy
* **Closed borders** — regiments may not enter another state's territory at peace; units that ignore borders (missionaries, prophets) may.
* **Wars last at least 10 seasons** before peace can be signed. Peace locks both states into a **10-season truce** during which neither may declare war again, and exhausted states (war exhaustion ≥ 50 or a seasonal chance) sue for peace on their own.
* **Treaties** layer positive agreements on FMG's native diplomacy matrix: **non-aggression**, **trade**, **defensive alliance** and **military access**. A defensive alliance drags its signatories into a war when an ally is attacked; a rejected offer cools the relation one rung. Confederation merges two friendly states when the smaller accepts.
* **Peace expels trespassers** — any regiment left in foreign land is moved to the nearest friendly or unowned cell. Claims and grudges still shape whom a state attacks next.

#### Provincial troubles, hazards and dangerous factions
The fantasy **Provincial Troubles** split into 20 environmental/economic/site **hazards** plus 8 hazardous *customs* (`bad_reputation`, `class_hatred`, `covetous_polity`, `disputed_possession`, `disunity`, `cultural_feuding`, `mercenary_populace`, `xenophobia`) that are grievances, never actors. Hazards are cleared by production or adventurers, never by a saving throw. Everything organizational becomes a **dangerous faction** — the 18 former lair archetypes and the organizational trouble types now spawn as hostile/clandestine factions with HQ, military, raid threshold and raidPending flag, seeded from danger markers or emergent from neglected hazards.

* **Hazards** — environmental/economic/site afflictions that drain order, freeze stability, and raise unrest. States clear them via burg production, a caretaker faction's clear-trouble production clock, or an adventuring party. They never metastasize into lairs; unchecked hazards escalate level/order damage and can spawn a dangerous faction.
* **Dangerous factions** — hostile/clandestine factions anchored to a province or danger marker. They raid nearby settlements, drain order, freeze stability, and can ascend into sovereign states after 8+ seasons with sovereign ambition, sufficient tech, and collapsed local order. States respond with `clear_faction` (march on the HQ) or `hire_adventurers` (adventuring party).
* **Emergent sovereign realms** — sovereign-ambition factions can become new states: a coup when order collapses (≤ 25) or a realm is in turmoil, or a faction ascension after eight seasons at sufficient level (or by capturing a settlement during a raid). Emergent states seize or found a capital, scaffold walls/barracks/market/temple, reset province order and stability, receive 150 Gold, field a first regiment, mint an aggressive ruler and enter war with claims and grudges against their former sovereign.
* **Ancient ruins** — a regiment stepping onto an unexcavated `ruins` marker claims a bonus (`+75 Gold`, a citizen, or research progress); a hero party can excavate them.

#### Agendas, unrest and chronicle
* **Agendas** — states choose one realm-level goal at a time: `muster`, `develop`, `build`, `colonize`, `conquer`, `reclaim`, `pacify`, `clear_faction`, `hire_adventurers`, `defend`, `raid` or `suppress_faction`. Ruler traits and culture values weight that choice, and the goal tells armies where to march. City **production** itself is autonomous and no longer consumes an agenda.
* **Development & buildings** — provinces spend stability to raise development. Roster buildings and wonders come from the city's **production queue**, not a separate construction economy; environmental trouble is minted into that queue as a work order.
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
* **Spawn Trouble** — seeds a procedural hazard or dangerous faction in the selected province.
* **Quell Trouble** — immediately quashes an active provincial hazard.
* **Spawn Faction** - creates an entrenched hostile faction with defenders and a map marker in the province.
* **Assault Faction** - orders the state's field army to launch an immediate assault on the faction.
* **Send Adventurers** - dispatches an adventuring party to delve into the faction.
* **Ascend Faction** - immediately ascends a sovereign-ambition faction into an emergent sovereign state.
* **Smite Faction** - strikes down the faction and its defenders by divine intervention.

Every intervention is written to the same chronicle and news ticker as a normal seasonal step. All interventions are free — there is no separate paid mode.

### Characters and heroes
Characters, hero sheets and checks have their own page: **[Characters](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Characters)**.

The Living World still recruits rulers, generals and specialists into `pack.history.figures`; their identity, stats and condition live on the character sheet, and the inspector shows a hero's vitals, doctrine, Push toggle and pending path choices.

### The Wheel of Ages
The **eschaton clock** (⏳ in the HUD) measures how close the age is to its finale. It rises each season for every level 8+ dangerous faction, when an evil sovereign conquers a burg, and when a major state collapses; purging dangerous factions winds it back by 5.

Once the clock reaches **100**, turning the **Wheel of Ages** plays out the epoch bake:

1. **Bake the epoch** — the current borders are cloned into `pack.history.snapshots` and recorded as a `HistoryEpoch`, so the Legends browser' year slider can scrub back through every age you played.
2. **Fallen empires** — every state whose unravel clock passed 50 is retired into `pack.history.realms`, its lands go wild, and a `chronicle` ruins marker appears at its capital.
3. **A new era** — the calendar leaps forward 150 years into a freshly named era; giant empires (more than 3 provinces) shatter into successor states and free burgs; all unravel and war exhaustion resets; every state crowns a fresh young ruler.

### Where to read more
The OpenCiv economy design is in [`docs/plans/living-openciv.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/living-openciv.md), the army model in [`docs/plans/living-openciv-armies.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/living-openciv-armies.md), the economy bridge in [`docs/plans/upstream-economy-alignment.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/upstream-economy-alignment.md), and the battle math in [`Battle-Engine.md`](Battle-Engine.md), alongside the older [`living-world.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/living-world.md), [`lair-ascension.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/lair-ascension.md) and [`hero-diversity.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/hero-diversity.md) plans. The current character contract is [`characters.md`](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/characters.md).

The simulation code lives in `src/model/physical/living-generator.ts`; the army helpers live in `src/model/physical/living-armies.ts`; the upstream bridge in `living-faction-economy.ts` and `living-rulers.ts` beside it; battles resolve in `src/model/battle/battle.ts`; the OpenCiv catalogs (technologies, buildings, civilians, beliefs, improvements, themes) live in `src/data/living-civ-*.ts`; the HUD and inspector live in `src/controllers/living-hud.ts`; the map overlay lives in `src/renderers/draw-living-overlay.ts`; hero catalogs live in `src/data/hero-*.ts`.
