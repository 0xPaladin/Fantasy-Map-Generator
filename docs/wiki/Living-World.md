## Living World

The _Living World_ is a seasonal simulation layered on top of a finished map. It is no longer a parallel game economy: the map's own [economy](Economy.md) is the engine, and the simulation bends its levers — budgets, taxes, markets, development, prosperity, stability and armies — one season at a time.

Open it from _Options_ → _Tools_ → _Living World_, or type "living world" in the omnibar. The simulation is optional: old maps initialize it lazily the first time you open the HUD or step a season, and retired OpenCiv fields are dropped on load.

### The HUD

The HUD is a compact bar at the bottom of the map. It can be dragged anywhere on screen.

- **Pause** stops the clock.
- **Step +1 Season** advances one season and redraws the political map.
- **Step +1 Year** advances four seasons.
- **Play 1× / Play 4×** runs the simulation automatically.
- The **date badge** shows the season and year; clicking it opens the _Legends browser_ and its time slider.
- The **news ticker** lists the latest dispatches — wars, battles, conquests, musters, fiscal changes, works, technologies-by-era, conversions and revolts. Click a headline to zoom the map to where it happened.

Each tick writes to the map itself: borders, burg ownership, regiments, battle markers, religions, `simAdjustments` lines and chronicle events change as the simulation runs. Armies show capability bars, stack badges and composition strips; battlefields, besieged cities and headline events get markers. The optional **Trouble** layer draws every hazard and dangerous faction, with its level, save and garrison.

### The inspector

While the HUD is open, click a state or burg for its card, and alt-click any cell (or click unowned land) for the cell's card.

A **state** card shows:

- **Ruler** — name, culture, alignment, virtues and vices.
- **Fiscal policy** — the ruler's target for each budget line, corruption and the sales/head tax, with the current value (`45→62`). Each line can be pinned (🔒) so the ruler cannot drift it; God mode does this by clicking a chip.
- **Public works** — the work under construction and each finished work with its daily line (e.g. `Aqueduct +3/day`).
- **Upstream economy** — treasury (opens the State Budget), prosperity (opens the Economy dialog), stability (opens the Stability overview), the people's mean development with its era, and the forces' upkeep with its battle multiplier.
- **Provinces** — order and stability chips with hazard/danger marks.
- **Agenda**, **suppression targets**, and the **Unravel** and **Exhaustion** clocks.
- **Claims, grudges, restive burgs, troubles** (with their daily drain) and **dangerous factions**.
- **Sandbox God Mode** — spark rebellion, smite ruler, force war, assault/smite factions, spawn factions.

A **burg** card shows its owner, tier and population, unrest, upstream prosperity and trade balance, the asset under construction, its province's order/stability/development/trouble and the resident faction outposts with their influence.

A **cell** card shows biome, owner state/province/burg, development with its era, prosperity, deposit, the Builder improvement (or pillage), and what its people produce a day by good.

The native editors show the same data: the **Burgs Editor** adds a Living World summary (unrest/HP, faith, construction, outposts); the **Factions Editor** shows Treasury, Trade and Forces and an Outposts & Assets dialog with Trade and Lines columns; the **Provinces Editor** shows public order with hazard marks and a province details dialog.

### What the simulation does

The Living World reads and mutates the live `pack`, so every native editor stays authoritative: editing a burg's walls, a state's treasury, cell ownership, goods or regiments is adopted on the next tick.

#### Seasons

One tick is one season; four seasons make a year. At each spring boundary rulers age and succeed, the fiscal policy drifts, faith drifts, grudges fade, and the political map is captured for the Legends time slider.

#### Rulers and fiscal policy

Every ruler (plus half their magistrate) has a temperament read from traits and culture: **martial**, **civic**, **pious** and **cruel**. It sets a fiscal target each spring:

- martial → a larger army share of the budget and a heavier head tax;
- civic → more administration and infrastructure, a lighter corruption budget, more sales tax;
- pious → a richer court;
- cruel → tolerance of graft.

The real budget lines, corruption and the two taxes drift toward that target by a form-dependent stride: **2 points a season** under a monarchy or theocracy, **1** under a republic or union, **0** under an anarchy. The state's world re-targets the purse too: war raises the army, rebellion the chancery, provincial trouble the works, and a negative treasury forces austerity and tolerates graft. Once a line has moved far enough, the news carries a dispatch ("Aeloria gilds its court while the provinces wait."). God mode can pin any line.

#### Public works

Rulers commission one work at a time from a 13-work catalog: Granary, Aqueduct, Royal Road, Market Charter, Mint, Courthouse, Harbor Works, Walls, Temple Works, College, Guild Hall, Land Improvement and Army Camp. Each has a development gate, a treasury price, sometimes a bill of real goods, and a scale (state, province or burg).

- **Funding is real**: the treasury cost is paid up front, and completion draws its goods (wood, stone, clay, marble, iron, copper, tools, paper, books) from the town's market stock. A market that cannot supply the work abandons it.
- **The ruler chooses** by temperament and need: war favours walls and camps, corruption favours courthouses, low development favours land improvements and colleges, trouble favours granaries and courts.
- **Effects land on the rails**: works write daily `simAdjustments` lines, raise native burg flags (walls, citadel, plaza, temple, port), add development to the province's peopled cells, cut stored corruption, lay farms/mills/mines, connect disconnected towns to the road network (Royal Road), charter a town as a market center (Market Charter) and let resting forces recover faster (Army Camp).

God mode can commission a specific work.

#### The economy underneath

The simulation sits on the map's own economy: goods, markets, prices, taxes, budgets, prosperity, corruption and stability. It reads them, bends them, and writes a little back.

- **The run feeds the sim.** Improvements and pillage change rural output; buildings change manufacturing; prosperity sways the court's happiness and a well-served court adds culture and faith to the Living World's own tallies; a burg's scholarly goods support its research-free era.
- **The sim feeds the run.** Each spring, or when the map changes, the economy is regenerated, and a season of its flows — **ninety days** — is banked onto a lasting reserve: a state's collected taxes less corruption and spending, a burg's product less its poll tax. Upkeep, works, military musters and deficits draw on that reserve.
- **Sim-owned lines.** Projects and troubles write named `simAdjustments` on states and burgs — separate from the player's own adjustment lines, which are never touched. The economy merges them wherever it reads adjustments, so a mint's income or a brigand's toll is real money in the next run.
- **Rulers lean on the run.** Their traits drift the stored corruption, court, administration and infrastructure budgets, and their martial bent keeps troops keen; audits cut graft into the treasury, and sabotage spoils a deposit's output.

#### Technology and development

There is no research tree. A people's **development** (1–100) is the technology: it gates goods tiers (a good needs its development level), unlocks unit tiers (each roster unit opens at a development threshold) and raises productivity (`development / 30`).

- Development comes from the map, diffusion and policy: peopled cells ease toward their state's mean with the land's biome/river/harbor ceiling, a completed `develop` project raises its province's peopled cells, and pillage, razing and the Development brush move it directly.
- A state's **era** is the stock era its population-weighted mean development falls in. Faction ascension needs an Iron-Age people (development 18+).
- The Development editor paints development; the eras come from the map options.

#### Armies

Armies stay culture-unique combined-arms stacks: every FMG regiment is up to 20 roster blocks (`{ type, hp, exp }`), and `hp` is a block's capability (0–1), not a headcount.

- **Mustering is gated twice.** A unit opens at a development threshold (plus buildings/goods where the roster asks), and a state can equip only as many blocks of a type as its markets supply of the required goods (arms, horses and harnesses, artillery and gunpowder). Blocks beyond the equipment take the field as levies.
- **Upkeep is the stock military budget**: a state's battle power is multiplied by `Military.getLivingBattleUpkeep` — fully funded forces hold the line, a bankrupt state's melt toward nothing.
- Movement, stances, terrain, walls, sieges, city strikes, replenishment, refits and the shared battle engine are unchanged. Army camps improve replenishment.

#### Factions

Factions are map polities without a city loop: every HQ and outpost is an anchor with assets, a garrison and economic lines.

- **Income** comes from the economy underneath: commercial factions take a commission on their host market's trade, underworld ones siphon provincial graft and smuggle past tariffs, martial ones draw retainers, religious and political ones take court tithes, and charters pay a tithe to their patron as a named budget line.
- **Works** are commissioned from treasury and built over seasons within the faction's track, era and node rules. A finished work writes a daily line into its host town (a consortium enriches it, a den drains it) and can add order or unrest.
- **Hostility**: factions raid, hold provinces, and are suppressed by states through administration (treasury-funded campaigns) or stormed with armies; a corrupted province can let a faction ascend into a new state. Sovereign ambition needs development 18+.

#### Religion

Faith drifts without prophets or missionaries. Each spring, a province whose majority is not its state's faith may convert:

- Pressure comes from court spending, the ruler's zeal, the share of co-religionists already there and a held **holy site**; resistance from the holdout share.
- A success converts a slice of holdout cells — rural first, the province capital last — and a majority flip is chronicled. Conversions repaint the stock religions layer, so the next run's diversity, corruption and stability follow.
- A zealous conqueror assimilates over decades; a tolerant one carries the diversity cost.

#### Troubles, unrest and dangerous factions

Unrest and weak provinces breed hazards. A neglected hazard grows, drains the treasury through a negative line, and can fester into a dangerous faction.

- **Hazards** (environmental, economic and site afflictions) lower order and freeze stability. A funded administration grinds them down; armies, adventurers or a magistrate's quelling end them, and a cleared hazard pays a small treasure to the clearer and leaves a ruin.
- **Dangerous factions** raid nearby settlements, drain order and can ascend. States clear them with `clear_faction` campaigns, hired adventurers or a march on the stronghold.
- Burg unrest decays with a garrison, temple works or a `pacify` agenda; conquered burgs may adopt their conqueror's faith and culture over time.

#### Agendas, diplomacy and the chronicle

- States choose one realm-level agenda at a time (`muster`, `develop`, `build`, `colonize`, `conquer`, `reclaim`, `pacify`, `clear_faction`, `hire_adventurers`, `defend`, `raid`, `suppress_faction`); ruler traits and culture weight the choice.
- Wars last at least ten seasons; peace locks a ten-season truce. Treaties (non-aggression, trade, defensive alliance, military access) layer on the native diplomacy matrix; confederation merges friendly kin states.
- Rulers age and are succeeded, grudges and claims persist, and a full unravel meter breaks a burg away.
- Every `snapshotIntervalYears` (ten by default) the political map is captured for the Legends browser.

The simulation is deterministic: the same map, seed and seasons produce the same yields, growth, borders, research (development), works, battles, conversions and chronicle events. Its state lives in `pack.history.living`, so a saved `.map` keeps rulers, treasuries, works, armies, unrest, faith and snapshots.

### God mode

The inspector's _God Mode_ section intervenes without waiting for the simulation:

- **Pin fiscal lines** — click a Fiscal policy chip to lock the ruler out of that line.
- **Commission works** — `Living.commissionProject(stateId, projectId, targetId?)` and faction works via `Living.commissionFactionAsset(factionId, assetId, nodeKey?)`.
- **Spark Rebellion**, **Smite Ruler**, **Force War**.
- **Pacify Unrest**, **Complete Asset**, **Quell Trouble**, **Spawn Trouble**.
- **Assault Faction**, **Send Adventurers**, **Ascend Faction**, **Smite Faction**, **Spawn Faction**.
- **Audit corruption** and **sabotage a deposit** from the console API.

### Console API

`window.FMG.Living` (or `Living` in `read_map` scripts) exposes: `init`, `tick`, `turnAge`, `fiscalPolicy`, `toggleFiscalLock`, `commissionProject`, `commissionFactionAsset`, `religiousPressure`, `convertProvince`, `auditCorruption`, `sabotageDeposit`, `startFactionSuppression`, `assaultFactionNode`, `spawnTrouble`, `quellTrouble`, `assaultFaction`, `sendAdventurersToFaction`, `smiteFaction`, `spawnDangerousFaction`, `ascendFactionToState`, `spawnRemnantFaction`, `sparkRebellion`, `smiteRuler`, `forceWar`, `pacifyBurg`, `completeAsset`, `muster`, `upgradeRegiment`, `colonize`, `conquerBurg`, `reclaimBurg`, `offerTreaty`, `offerConfederation`, `signPeace`, and the hero/suppression helpers.