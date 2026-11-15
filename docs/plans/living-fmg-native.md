# Plan — Living World on FMG Rails (OpenCiv removal & native dynamism)

**Status:** In progress — Phase 0 done (scope locked), Phase 1 done (OpenCiv civilians, city loop, queues, wonders, yields, happiness and religion engine stripped; interim bridges in place), **Phase 2 done** (tech tree removed; the era ladder from development now gates unit tiers, and development moves by diffusion and develop projects).
**Companions:** [upstream-economy-alignment.md](upstream-economy-alignment.md) (the bridge this plan builds on), [living-world.md](living-world.md) (original vision), [living-openciv.md](living-openciv.md) (superseded), [living-openciv-armies.md](living-openciv-armies.md) (partially superseded), [factions-civ-engine.md](factions-civ-engine.md) (partially superseded), [remove-living-guild.md](remove-living-guild.md)

## Execution policy

Each phase lands as its own commit: **update this plan (completion record), commit, push**. No phase merges without `tsc`, Biome and the unit suite green.

---

## 1. Thesis

The OpenCiv layer duplicates what stock FMG v1.157.0 now does natively: an economy, population, development, budgets, prosperity, corruption, stability, and a goods-equipped military with upkeep. The Living World keeps its parallel tile economy running beside the real one and pays for it in complexity, save size, UI clutter and constant re-alignment work.

This plan removes the parallel economy and turns the Living World into a **thin seasonal driver that bends stock levers**:

- **Rulers govern**: traits and agendas drift the real budget lines, taxes and corruption of their state.
- **States and provinces build**: a small catalog of projects, paid for with real money and real goods bought on the map's markets, whose effects are recorded in adjustments and development.
- **Neglect costs**: unrest and low stability breed troubles and hostile factions that write negative adjustment lines until they are cleared.
- **Factions ride the economy**: no city loops; income from the existing upstream hooks, spent on forces, raids and ascension.

The result: every state ends up with a different fiscal profile, a different portfolio of standing works, different troubles, a different era — unique and alive, expressed entirely through data the stock UI already knows how to display.

### Locked scoping decisions

| Question | Decision |
| :--- | :--- |
| Armies & battles | **Keep** cultural-roster `ArmyBlock[]` regiments, sieges and the Lanchester engine. Musters/upkeep re-anchored on stock `Military` (alert, budget, goods equipping, battle upkeep). |
| Technology | **No 80-tech tree.** A coarse **era ladder** derived from the state's mean development gates projects and roster unit tiers. |
| Religion | **No prophet/missionary/belief units.** A unitless religious drift: court spending, prosperity and zeal push province conversions through the stock religions layer. |
| Factions | **No HQ/outpost city-node loop.** Factions keep forces, raids, suppression, assault, ascension and their existing upstream income hooks. |
| Projects | **Royal Road and Market Charter are in** (not stretch): routes drawn for real carriage gains, and market centers founded by charter. |

---

## 2. What is removed, what is kept

### Removed (the OpenCiv engine)

- Citizens, worked cells (3-hop assignment), `globalWorkedCells` pool.
- Food buckets, population growth by surplus, culture-border tile claims.
- The 7-yield tile system (`Food/Production/Gold/Science/Culture/Faith/Happiness`), luxuries-happiness, empire happiness and its combat modifier (stock **stability** already drives battle morale).
- Production queues for buildings/wonders/units, hurry production, world wonders and their one-per-world races.
- `CIV_TECHS` research, research queues, spillover, the Phase 2 tech→development uplift path.
- Civilian units: Settlers, Builders, Work Boats, Caravans Cargo Ships, Missionaries, Inquisitors, Great Prophets, Envoys; faction Builders/Settlers.
- Pantheon/founder/follower/enhancer beliefs and Faith as a spendable resource.
- Faction node city loops: node citizens, node yields, node queues, `FactionYieldBreakdown` tile half.
- `CIV_BUILDINGS` construction as a per-burg tech tree (a curated subset survives as **projects**, §5).

### Kept (the politics and war layer, re-anchored)

- Rulers, succession, traits, councilors/spawned leaders, figures registry.
- Agendas, claims, grudges, war exhaustion, unravel/rebellions, breakaways, giant-empire fracture.
- Wars, diplomacy matrix, treaties, truces; cell-by-cell colonization drift; province/burg capture under policy.
- `ArmyBlock[]` rosters, movement, stances, battles (`battle.ts`), sieges, city strikes, replenishment, refits.
- Chronicle, epochs, snapshots, news, eschaton; God mode interventions.
- Hazards & dangerous factions (`living-threats.ts`), suppression campaigns, ruins.
- Seasonal economy execution: spring/`economyDirty` regen, 90-day flow banking onto treasuries (Phase 3 of the alignment plan stands).
- Development diffusion (`stepDevelopmentDiffusion`) — now the *only* knowledge-spread mechanism.
- Mobile burgs' live wandering and carried-stock trading (independent feature; verify no citizen coupling in Phase 1).

---

## 3. The rails being driven (all stock, all existing)

| Rail | Seam | Sim's use |
| :--- | :--- | :--- |
| Budget lines & corruption | `States.setBudget`, `States.setCorruption` | Rulers drift them each season (§4) |
| Taxes & fees | `state.economy.salesTax/pollTax/marketFee` | Rulers shift them slowly; market fee changes re-space markets on regen |
| Adjustments | `state.economy.adjustments`, `burg.adjustments` (user-owned) **+ new `simAdjustments`** (§6) | Projects and troubles write named daily lines |
| Treasury accumulation | `state.economy.treasury` (banked seasonal flows) | Funds projects, musters, suppression |
| State orders | `StateOrders` buying baskets on markets | Projects consume **real goods** (construction/military baskets) |
| Development | `pack.cells.development`, `Development.getAverages` | Era ladder, project effects, diffusion |
| Prosperity / Stability / Corruption | `Prosperity`, `Stability`, `Corruption` | Read for hazard spawning, religious drift, combat morale |
| Military | `Military.getEquipped`, `getEquipmentSpare`, `getLivingBattleUpkeep`, `defineAlert` | Musters, equipment gates, battle power |
| Religions layer | `pack.cells.religion`, `Religions` | Unitless conversions |
| FMG burg flags | `burg.walls/citadel/plaza/temple/port` | Projects raise them; sieges raze them |

---

## 4. Pillar 1 — Rulers govern the budget

Every ruler (and their magistrate, at half weight) already produces `figureBias`. New: a **fiscal profile** derived from traits + culture values, expressed as a *target* budget vector, tax preference and corruption tendency:

| Driver | Leans toward |
| :--- | :--- |
| `ambitious`/`wrathful`/`martial` culture | military ↑, alert ↑, poll tax ↑ |
| `just`/`diligent`/`commerce` | administration & infrastructure ↑, sales tax over poll tax |
| `zealous`/`pious`/`tradition` | court ↑, temple/cathedral projects, conversion pressure |
| `greedy`/`cruel` | corruption drifts up, market fee up, court skim |
| `temperate`/`civic` | corruption down, fees down |

Mechanics:

- On **succession**, the new ruler's profile becomes the state's target; each spring the actual `budget` lines drift **±1–2 points/season** toward it via `States.setBudget` (forms resist: a Republic's senate halves drift; an Anarchy levies nothing regardless).
- **Events re-target**: declared war spikes military target (+20), bankruptcy forces austerity (court/military cuts, corruption tolerated), a rebellion spikes administration, a hazard epidemic spikes infrastructure.
- **Corruption**: the ruler's transient trait modifier (`stateCorruption` in `living-rulers.ts` read through `Corruption.effectiveBudget`) is **replaced** by slow drift of the stored `budget.corruption` number — one mechanism, no double count.
- Every drift past a threshold logs a dispatch ("The young king starves the army to gild his court"), making fiscal personality visible in the news ticker.
- The stock State Budget dialog shows the sliders as they actually are — the player sees the ruler's hand moving them. God mode can pin a line ("lock budget") to veto drift.

Why this makes states unique: two neighbors with identical geography diverge within a decade because their kings spend differently — one over-militarizes into bankruptcy and rebellion, the other builds aqueducts into prosperity.

---

## 5. Pillar 2 — Projects (the surviving OpenCiv assets)

A curated, data-driven **PROJECTS catalog** (~15 entries) replaces `CIV_BUILDINGS`, tech-gated by **era** instead of research. Projects are one-per-target unless noted, visible in a new *State Projects* tab of the Budget dialog and summarized on the state card.

Sketch of the catalog:

| Project | Scale | Era | Cost (goods via orders + treasury) | Effect (rails it writes) |
| :--- | :--- | :--- | :--- | :--- |
| Granary | province | Bronze | construction basket ×N | famine hazard resistance; hazard drain on that province −50% |
| Aqueduct | burg | Classical | construction ×N | `burg.simAdjustments` "Aqueduct" +proportional daily line; local prosperity ↑ via infrastructure seam |
| Royal Road | state | Classical | treasury; stretch: actually draws a route link | lower carriage on its lanes (real `pack.cells.routes` seam); stretch goal — flag if route drawing proves heavy |
| Mint | state | Iron | military basket (tools) | +share of sales tax collected; small corruption risk |
| Courthouse | province | Iron | construction | −2 corruption tendency in that province (extends `Corruption` province factor seam) |
| Harbor Works | burg/port | Iron | construction | +burg trade; raises market attractiveness (stock market scoring seam) |
| Market Charter | burg | any | treasury | converts a burg into a market center (stock `Markets` seam) — the *direct* way a ruler reshapes trade |
| Walls / Citadel | burg | any | construction ×N | `burg.walls`/`citadel` flags (existing sync), siege defense |
| Temple Works | burg | any | court basket | `burg.temple` flag, conversion pressure ↑ |
| College | burg | Medieval | court basket ×N | development +2 in the burg's cells (uplift seam, no decay) |
| Guild Hall | burg | Medieval | treasury | manufacturing boost via `buildingModifierFor` (existing seam) |
| Land Improvement | province | any | utilities basket | drives `Output.getSimMultiplier` farm/mine/quarry boosts for the province's cells (existing seam, now fed by projects instead of Builders) |
| Standing Army Camp | state | any | military basket | muster capacity +, replenishment rate + |

Rules:

- **Funding is real**: the state spends banked treasury *and* places actual `order` deals for the baskets (a granary consumes Wood/Stone/Clay from the map's markets — competing with everyone else, moving prices). Cost scales with distance/development.
- **Effects are honest**: monetary effects are `simAdjustments` lines; structural effects write development, flags, corruption or output seams. Nothing is a hidden parallel stat.
- Province projects are chosen by the ruler's profile and the province's pain (low prosperity → aqueduct; unrest → courthouse; the agenda `develop`/`build` drives selection).
- Construction takes seasons (progress tracked on the living state); completion chronicles and news; captured works change owner, razed works are lost (siege policy already razes flags).

---

## 6. Sim-owned adjustment lines (`simAdjustments`)

`state.economy.adjustments` and `burg.adjustments` are user-owned and kept on regeneration; the sim must not stomp them. New optional field, serialized inside the living state:

```ts
// on StateFinance and Burg, optional; merged wherever adjustments are summed
simAdjustments?: { name: string; value: number }[];
```

- Merged at the same seams adjustments already apply: dawn treasury, `Taxes.collect` opening, accounts. Read-only rendering in the Budget/Burg economy dialogs ("of which: Aqueduct +2.1, Brigandage −4.0"), with a one-click "clear" where a player wants to cheat a trouble away (God mode).
- Alternative considered and rejected: prefix-marked lines inside the user array — collides with user edits and regeneration semantics.

---

## 7. Pillar 3 — Unrest → troubles → adjustments

The existing hazards/dangerous-faction system (`living-threats.ts`) keeps its spawning, levels, ruins and suppression campaigns, and gains the economic loop:

- Each active hazard writes a **negative `simAdjustments` line** on its state (or host burg for local trouble): "Brigands on the roads −4/day", scaled by hazard level and the province's trade volume.
- Low province stability and burg unrest raise spawn rate (already partly true); **conquered and far provinces are more susceptible** (corruption/prosperity rails feed the roll).
- Clearing paths, all existing: `pacify`/`clear_faction` agendas, administration provision above threshold decays the hazard, `hire_adventurers` (party resolves it), or a regiment marching on it. Cleared hazards leave ruins (existing) and can drop a small one-off treasure into the clearer's treasury.
- The loop closes on itself: hazard drains treasury → military upkeep falls (stock `getUpkeep`) → army weakens → stability falls → more hazards. A state either governs or bleeds.

---

## 8. Pillar 4 — Factions on the rails

Factions lose their node economies, keep their soul:

- **Income**: existing upstream hooks stand unchanged (commercial commissions on host market turnover, underworld graft siphon + tariff/embargo smuggling, martial retainers, religious/political court tithes, charter tithes into `"Chartered Faction Tithes"`).
- **Spending**: income funds forces (mustering through the same goods gates as states), HQ relocation, and a small faction project list (counting house, smugglers' den, fortified HQ) written as burg `simAdjustments` — a friendly consortium literally enriches its host town, a thieves' guild drains it.
- **Hostility**: raiding plunder stays; an active hostile faction in a province is a hazard-class negative line until suppressed (existing suppression/assault machinery).
- **Ascension** (`ascendFactionToState`) stays: a sufficient faction mints a state with an aggressive fiscal profile.

---

## 9. Pillar 5 — Era ladder

- A state's era = the stock era containing its population-weighted mean development (`Development.getAverages`, `options.map.eras`) — no new data.
- Era gates: project tiers (§5) and roster unit tiers (replacing `requiredTechFor`; a unit's era is its roster's `minEra`, else the category ladder's). Roster JSONs still name a tech per unit, so Phase 2 froze each tech id's old development band (`UNIT_TECH_DEVELOPMENT`) as its threshold; rosters gain explicit eras later and the frozen table goes.
- Development changes only through: diffusion (kept), project effects, ruler `develop` agenda targets, razing/pillage (kept), and plain map editing. The Phase 2 seeding/uplift code is deleted with the tech tree.
- The HUD/badges show "Medieval (mean 34)" — one number, stock-derived.

## 10. Pillar 6 — War & armies on stock rails

- Muster size follows the stock **war alert** (already `defineAlert`) × budget military share; equipment via `getEquipmentSpare` (unequipped → levy blocks, existing); ongoing musters spend treasury + real goods orders.
- Combat power = roster power × `getLivingBattleUpkeep` (kept); stability replaces happiness as the morale modifier (stock battle morale already follows stability — delete the happiness multiplier).
- Bankruptcy: keep `settleDebt` demotions; peace demobilizes toward alert baseline.
- Sieges, city strikes, stances, replenishment, refits: unchanged.

## 11. Pillar 7 — Unitless religious drift

- Per province, per spring: conversion pressure = court provision × ruler (and culture) zeal × adjacency to co-religionist provinces; a roll above the majority's resistance flips rural cells' `pack.cells.religion` progressively (province capital last), using the existing repaint seam.
- Chronicle entries and news on majority flips; a zealous conquering state assimilates its conquests over decades, a tolerant one carries the stability cost of diversity (stock minorities corruption/stability parts already encode this).
- Holy sites: a captured capital of a faith gives its holder bonus pressure (cheap, no new data).

---

## 12. Data model & save migration

`LivingWorldState` slims drastically:

- **Deleted**: citizens/foodStored/cultureStored/workedCells/locked cells, `productionQueue`, `researchedTechs`/`currentTechId`/`researchQueue`/`researchedProgress`, faith/pantheon/prophet fields, world-wonder records, faction node sim city fields, yieldsPerTurn/happiness (state & faction), tile improvement state per builder.
- **Added**: `policy` (fiscal target vector + drift locks), `projects` (built + under construction, keyed by target), `lines` (sim adjustment mirror), `era` (cached, derived).
- `BurgSimState` reduces to: unrest, conqueredBy/originalOwner, assets (project records), treasury ledger, religion drift bookkeeping.
- Migration: bump the living-state version in `auto-update`; strip removed fields, derive `policy` from the current ruler, keep treasuries/agendas/armies/figures/chronicle intact. Old saves must load and tick.

## 13. Code & UI inventory

**Deleted/shrunk modules**: `living-civ-techs.ts` (→ tiny `era.ts`), `living-civ-buildings.ts` + improvement catalogs (→ `projects.ts`), the city loop, builder/settler/civilian steps, religion unit steps, faction node economy (`living-faction-economy.ts` keeps only the income half), yields/happiness breakdowns.

**Untouched**: `battle.ts`, `living-armies.ts` (roster/goods mapping stands), `living-threats.ts` (gains lines), `living-rulers.ts` (gains fiscal profile), `living-heroes.ts`, chronicle/snapshot machinery, mobile burgs.

**UI**: state card rebuilt around stock figures (budget sliders live, treasury + season net, prosperity/stability/corruption, era, projects, troubles) + politics (ruler/agenda/grudges/armies); burg card slims to stock economy + assets + unrest; cell card keeps upstream reads, drops tile yields; Faction dialog loses Yields/Citizens/Worked/Queue columns, keeps Trade/Forces/Assets; State Cities & Yields dialog becomes *State Projects & Economy*; new *Projects* tab in the Budget editor (list, progress, fund). Omnibar/hotkeys unchanged.

**Docs**: rewrite `docs/wiki/Living-World.md`; mark `living-openciv.md`, `living-openciv-armies.md`, `factions-civ-engine.md` superseded; update `data-model.md` and `economy.md` bridge sections.

## 14. Execution phases

| # | Phase | Exit criteria |
| :--- | :--- | :--- |
| 0 | This plan reviewed, seams agreed (`simAdjustments`, projects catalog list) | plan merged |
| 1 | **Strip civilians**: delete city loop, civilians, queues, wonders, yields/happiness; slim HUD cards; build/lint/tests green; mobile burgs verified | tick runs without OpenCiv fields |
| 2 | **Era ladder**: delete `CIV_TECHS`; era from `Development.getAverages`; roster/project gates switched; save migration | old saves load, era shown ✅ |
| 3 | **Fiscal policy**: profiles from traits, spring drift through `setBudget`/`setCorruption`, event re-targets, news, God-mode locks; replace transient corruption modifier | two seeded states diverge measurably |
| 4 | **Projects**: catalog, funding via orders + treasury, effects into `simAdjustments`/flags/development/output seams, Projects tab UI; Royal Road draws real route links and Market Charter converts a burg into a market center. | a granary consumes real stone and shows as a line |
| 5 | **Trouble economics**: hazard → negative lines, clearing paths wired, ruins rewards | a hazard drains a treasury and is cleared |
| 6 | **Factions re-anchored**: delete node loop; income/forces/raids/suppression/ascension on rails; faction project lines | faction sheet shows income & lines, no city fields |
| 7 | **Religious drift**: unitless conversions, chronicle, holy-site pressure | province flips over ~decades on a test map |
| 8 | **Polish & docs**: HUD/card rebuild final pass, wiki/data-model/economy docs, test refresh, save compat sweep, delete superseded plan docs | full suite green, docs current |

Each phase lands independently buildable with its completion record appended here, mirroring `upstream-economy-alignment.md`.

## 15. Risks & open questions

- **Treasury scale**: projects priced against 90-day banked flows can be huge vs. day-scale stock numbers; price in "seasons of net" units, display both.
- **Market fee drift**: rulers moving `marketFee` re-spaces markets on regen (placement reads fees) — feature or bug? Propose: cap drift, chronicle the market reshuffle.
- **KPI drift**: hazard drains and project income shift economy KPIs 11/14 (states' cut, treasury concentration) — re-measure with the tuner after phases 4–5.
- **Mobile burgs**: verified in Phase 1 — live wandering reads `pack.cells`/`Burgs.move`/`Routes`, never the stripped fields.
- **Astral mode**: post-scarcity hooks read development/prosperity, not OpenCiv fields — audited in Phase 2: the astral regime still shapes diffusion caps (`ANCIENT_SUPPRESSED_CAP`) and `Output`/`Prosperity` read development unchanged.

### Phase 2 completion record (done)

**Shipped:** `src/data/living-eras.ts` (new), `src/model/physical/living-armies.ts`, `src/model/physical/living-generator.ts`, `src/model/physical/living-threats.ts`, `src/model/political/factions-generator.ts`, `src/model/economy/output.ts`, `src/controllers/living-hud.ts`, `src/types/living.ts`, `src/types/factions.ts`, `src/data/rosters` untouched. Deleted `living-civ-techs.ts`, `living-civ-techs.test.ts`, `living-civ-themes.ts`. `tsc` clean, Biome clean, unit suite green, Vite build green.

- **The era ladder** (`living-eras.ts`): wrappers over the stock `Development.eras` — `eraIndex`, `eraName`, `eras()` — plus `SOVEREIGN_DEVELOPMENT = 18` (the Iron Age band). A polity's era is now simply the stock era its population-weighted mean development falls in; the HUD chip already shows `mean · era`.
- **Tech tree removed**: `CIV_TECHS`/`CIV_TECH_BY_ID`, themes, `setResearch`/`grantTech`, state and faction research (`applyResearch`, `completeTech`, `applyFactionResearch`, seeding, uplift), and their sim fields. Old saves have `currentTechId`/`researchQueue`/`researchedTechs`/`researchedProgress`/`freeTechs` pruned from states and factions in `Living.init()`.
- **Unit gating by era**: `requiredTechFor` became `requiredDevelopmentFor(unit, roster)`, returning a development threshold; `pickRosterUnit(roster, category, development)` takes a development level. Authored roster `requiredTech` ids resolve through the frozen `UNIT_TECH_DEVELOPMENT` map (tech id → its old development band) so **no roster JSON changed**; derived gates use per-category development ladders. State musters gate on mean development, faction musters/garrisons on the faction's node mean, and refits compare the same thresholds.
- **Development moves on stock rails**: diffusion eases peopled cells toward their state's mean (with the land's biome/river/harbor ceiling), and a completed `develop` project now raises the province's peopled cells by +2 development (`raiseProvinceDevelopment`, marks the economy dirty) instead of only a sim counter. Razing, pillage and map editing still lower/raise it; nothing researches.
- **Factions**: ascension and the eschaton now require `factionDevelopment ≥ SOVEREIGN_DEVELOPMENT` (was 2 techs); the HUD's ascendable hint reads the HQ cell's development. Faction data lost `science`/research fields.
- **Improvements**: the old tech boosts on `Output` become development thresholds (farm +0.15 at ≥29, pasture +0.15 at ≥67, mine +0.2 at ≥56); pillage and the base boosts are unchanged.
- **Tests**: research/tech/theme suites removed; era-gating tests added for `requiredDevelopmentFor`, `pickRosterUnit`, diffusion-toward-mean, develop-project uplift and development-gated ascension; catalogs/assets/save fixtures pruned of tech fields.

### Phase 1 completion record (done)

**Shipped:** `src/model/physical/living-generator.ts`, `src/types/living.ts`, `src/types/factions.ts`, `src/model/political/factions-generator.ts`, `living-threats.ts`, `living-hud.ts`, `state-cities-dialog.ts`, `factions-editor.ts`, `burg-editor.ts`, `draw-living-overlay.ts` and their tests. `tsc` clean, Biome clean, **3,711 unit tests passing**, Vite build green.

- **Removed**: the OpenCiv tile-yield system and every cell/resource/improvement yield source; the Major Burg city loop (citizens, worked cells, food buckets, culture-border claims, free-burg encounter via borders); production queues, city governors, wonders and hurry; civilians (`spawnUnit`, `recruitUnit`, Settlers/Builders/Work Boats/Caravans/Missionaries/Inquisitors/Prophets/Envoys) with old-save utility regiments disbanded in `syncArmies`; the entire religion engine (faith, pantheons, Great Prophets, pressure, missionaries, belief yields); empire happiness and state/faction yield rollups; faction node city loops, their queues and their citizens. Deleted data catalogs: `living-civ-beliefs.ts`, `living-civ-civilians.ts`, `living-calibration.test.ts`.
- **Interim bridges** (documented in code): research is kept until Phase 2 with science = `mean development / 30` (state) and node mean development (faction, +25% host spillover); treasury banking stays in `stepEconomy`; faction income is upstream-only (`getFactionYieldBreakdown` now returns nodes/upstreamGold/charterTithe/patron/influence) minus block upkeep, and factions muster one roster block per season when funded; administrative suppression is now treasury-funded seasons (`FACTION_SUPPRESSION_SEASONS = 3`, `factionSuppressionProductionCost` per season, guarded nodes stall it) instead of a production operation; trouble clearing is a flat caretaker-faction clock.
- **Kept intact**: rulers/succession, agendas, claims/grudges, wars, diplomacy/treaties/confederation, battles/sieges/city strikes/armies (roster `ArmyBlock[]`), suppression/assault/ascension, raids, trouble spawning, development diffusion and the tech→development uplift, upstream economy regeneration/banking, charters/audit/sabotage, chronicle/epochs/snapshots, mobile burgs, eschaton, heroes. Burg `civBuildings` survives only as the flag-synced asset families feeding siege HP and the native wall/plaza/temple/port flags.
- **Save migration**: `Living.init()` prunes retired OpenCiv fields (`worldWonders`, `religions`, `units`, and per-state/per-burg city fields) from older saves; no `.map` record changes.
- **UI**: Living HUD state/burg/cell cards now show stock economy figures (treasury, prosperity, stability, development + era, upkeep multiplier, budget/economy/stability links), unrest, assets, politics and armies — no yields, happiness, research, faith or city panels. The *State Cities & Yields* dialog became **State Cities & Economy** (Cities/Assets/Forces; city add/remove toggles `isMajor`). Factions editor lost Citizens/Cells columns and yield panels, keeps Trade (upstream gold) and Forces. Burg editor's Living summary shows unrest/HP, stock faith, construction and outpost influence.
- **Assistant context** regenerated (`npm run generate:assistant-context`).
