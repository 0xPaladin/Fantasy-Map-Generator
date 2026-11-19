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

Each tick writes to the map itself: borders, burg ownership, regiments, battle markers, religions, `simAdjustments` / `simStabilityAdjustments` lines and chronicle events change as the simulation runs. Armies show capability bars, stack badges and composition strips; `#livingOverlay` highlights active war vectors, pending raids, besieged cities and the season's 1–2 notable outcome badges.

### The inspector

While the HUD is open, click a state, province, or burg for its card, and alt-click any cell (or click unowned land) for the cell's card.

A **state** card shows:

- **Ruler** — name, culture, alignment, virtues and vices.
- **Fiscal policy** — the ruler's target for each budget line, corruption and the sales/head tax, with the current value (`45→62`). Each line can be pinned (🔒) so the ruler cannot drift it; God mode does this by clicking a chip.
- **Public works** — the work under construction and each finished work with its daily line (e.g. `Aqueduct +3/day`).
- **Upstream economy** — treasury (stock Day Balance; opens the State Budget), prosperity (opens the Economy dialog), stability (opens the Stability overview), the people's mean development with its era, and the forces' upkeep with its battle multiplier.
- **Agenda** and **suppression targets**.
- **Manage** — opens the stock Provinces, Burgs and Regiments editors filtered to this state.
- **Issues & Crises** — **Instability** (provinces at or below 55% stability, each marked `⚠️`, with `🔥[seasons]` beside a rebelling province), dangerous factions, troubles (with daily drain), casus belli claims and grudges.
- **Sandbox God Mode** — spark rebellion, smite ruler, force war, assault/delve/ascend/smite/spawn factions.

A **province** or **burg** card shows stock stability (`Stability N%`), active rebellion status (`Rebellion: <Name>`), silent trouble flavor (`Flavor` or `Drain`), resident faction presence and quick links to the native editors (`Provinces Editor`, `Burg Editor`, `Regiments`).

A **cell** card shows biome, owner state/province/burg, development with its era, prosperity, deposit, the Builder improvement (or pillage), and what its people produce a day by good.

The native editors show the same data: the **Stability Overview** (for a state, and for each province from the Provinces Editor) exposes user-owned `stabilityAdjustments` alongside sim-owned `simStabilityAdjustments` (`Of which the Living World`); clicking a province's stability in the **Provinces Editor** opens that province's own breakdown, listing its burgs where the state overview lists its provinces; the **Burgs Editor** adds a Living World summary (construction, buildings, outposts); the **Factions Editor** shows Treasury, Trade and Forces; and the **Provinces Editor** displays stability and trouble flavor/drain status.

### What the simulation does

The Living World reads and mutates the live `pack`, so every native editor stays authoritative: editing a burg's walls, a state's treasury, stability adjustments, cell ownership, goods or regiments is adopted on the next tick.

#### Seasons & the 1–2 Beat Tick Director

One tick is one season; four seasons make a year. Each tick runs in two phases:

- **Phase A (Silent Background Sync)**: Advances the season and calendar year, updates `Production.regenerate()` in Spring or when `economyDirty`, silently drifts ruler fiscal sliders each Spring, fades grudges, captures Legends snapshots, smooths cell development toward the polity mean, updates silent provincial trouble labels/drain lines, and ticks army movement and multi-season build countdowns.
- **Phase B (1–2 Notable Beats)**: Scores all ripe world beats across **Rebellions**, **Border Shifts**, **Ruler Succession**, **State Agendas**, **Epic Faction Agendas**, **Diplomacy** and **Religious/Fiscal turns**, executing at most **2 notable events** and emitting **1–2 headlines and map badges per tick** so every season stays readable.

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
- **The sim feeds the run.** Each spring, or when `economyDirty` is set, the economy is regenerated while `state.economy.treasury` and `burg.treasury` remain honest stock Day Balances (never overwritten with a 90-day reserve).
- **Patrimony.** States and factions also accumulate a `stash` of crown jewels, art, relics and bullion from positive daily surpluses. It is separate from the treasury and is not spent; its target horizon comes from the state form or faction category, bent by ruler traits and culture values. See [Economy](Economy.md#treasuries).
- **Sim-owned lines.** Public works, drain troubles, rebellions, pacification and hostile raids write named `simAdjustments` (economy) and `simStabilityAdjustments` (state/province stability) — separate from the player's own adjustment lines, which are never touched. The economy and stability calculations merge them automatically.
- **Rulers lean on the run.** Their traits drift the stored corruption, court, administration and infrastructure budgets, and their martial bent keeps troops keen; audits cut graft into the treasury, and sabotage spoils a deposit's output.

#### Technology and development

There is no research tree. A people's **development** (1–100) is the technology: it gates goods tiers (a good needs its development level), unlocks unit tiers (each roster unit opens at a development threshold) and raises productivity (`development / 30`).

- Development comes from the map, diffusion and policy: peopled cells ease toward their state's mean with the land's biome/river/harbor ceiling, a completed `develop` project raises its province's peopled cells, and pillage, razing and the Development brush move it directly.
- A state's **era** is the stock era its population-weighted mean development falls in. Faction ascension needs an Iron-Age people (development 18+).
- The Development editor paints development; the eras come from the map options.

#### Armies

Armies stay culture-unique combined-arms stacks: every FMG regiment is up to 20 roster blocks (`{ type, hp, exp }`), and `hp` is a block's capability (0–1), not a headcount.

- **Mustering is gated twice.** A unit opens at a development threshold (plus buildings/goods where the roster asks), and a state can equip only as many blocks of a type as its markets supply of the required goods (arms, horses and tack, artillery and gunpowder). Blocks beyond the equipment take the field as levies.
- **Upkeep is the stock military budget**: a state's battle power is multiplied by `Military.getLivingBattleUpkeep` — fully funded forces hold the line, a bankrupt state's melt toward nothing.
- Movement, stances, terrain, walls, sieges, city strikes, replenishment, refits and the shared battle engine are unchanged. Army camps improve replenishment.

#### Factions (10 Epic Archetypes & 5 Agendas)

Map generation produces at most 10 unique epic archetypes (*Grand Merchant Consortium, Adventurers' Conclave, Arcane Conclave, Frontier Warden Order, Crusader Knightly Order, Apocalyptic Cult, Shadow Brotherhood, Claimant Confederacy, Iron Free Company, Dread Sovereign Host*).

- **Income** comes from the economy underneath: commercial factions take a commission on their host market's trade, underworld ones siphon provincial graft and smuggle past tariffs, martial ones draw retainers, religious and political ones take court tithes, and charters pay a tithe to their patron as a named budget line. Burg-less wilderness nodes live off the land instead, taking **hinterland dues** from the rural earnings within their reach.
- **5 Unified Faction Agendas**: factions act via `expand_network` (found/upgrade outposts), `build_work` (commission HQ/outpost assets), `subvert` (write negative provincial `Subversion:` stability lines), `crusade_or_raid` (clear troubles / strike hostiles or raid vulnerable burgs), and `ascend` (seize a collapsing province at development 18+ to found a new sovereign state).

#### Religion

Faith drifts without prophets or missionaries. Each spring, a province whose majority is not its state's faith may convert:

- Pressure comes from court spending, the ruler's zeal, the share of co-religionists already there and a held **holy site**; resistance from the holdout share.
- A success converts a slice of holdout cells — rural first, the province capital last — and a majority flip is chronicled. Conversions repaint the stock religions layer, so the next run's diversity, corruption and stability follow.
- A zealous conqueror assimilates over decades; a tolerant one carries the diversity cost.

#### Troubles, rebellions & border drift

Instability acts directly through stock **Stability** and **Corruption**:

- **Troubles as Silent Flavor & Drain**: Below `55%` stability, a province silently receives a cause-matched `"flavor"` trouble name (zero mechanical penalty). Below `40%` stability for 2+ seasons, it silently steps up to `"drain"` (`-3/day` economy, `-5` provincial stability) without generating headline notifications; recovering above `55%` clears it silently.
- **Provincial Rebellions**: Below `30%` stability without a full-upkeep garrison (and outside a pacification grace window), a province ignites a **Rebellion** (`-15` provincial stability, `-5/day` economy). Checked by a `pacify` agenda, full-upkeep garrison, or recovery to `>= 45%`, the rebellion is crushed and grants a temporary `+10` `"Pacified"` stabilization bonus. Left unchecked, it spreads to restive adjacent same-state provinces, defects to a stable kin/former-owner neighbor or secedes after 2+ seasons below `25%`, or collapses on its own when surrounded by calm provinces.
- **Border Drift**: Border provinces with high corruption (`> 35`) and low stability (`< 35%`) drift frontier cells (and non-capital burgs on them) toward adjacent high-stability (`> 70%`) neighbors.

#### Agendas, diplomacy and the chronicle

- States choose one unified realm-level agenda at a time from **5 State Agendas** (`conquer`, `pacify`, `build_work`, `muster`, `suppress_faction`); ruler traits and culture weight the choice.
- Wars last at least ten seasons; peace locks a ten-season truce. Treaties (non-aggression, trade, defensive alliance, military access) layer on the native diplomacy matrix; confederation merges friendly kin states.
- Rulers age and are succeeded, grudges fade, and rebellions or border drift reshape state boundaries dynamically.
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