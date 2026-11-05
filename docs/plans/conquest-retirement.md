# Plan — Retiring OpenConquest: Folding the Campaign Engine into Civ/Living

**Status:** Draft for review
**Goal:** Delete `src/conquest/` entirely. The Living World (OpenCiv economy + PR-27 factions + combined-arms armies) becomes the single simulation. No more "documented exception" vertical — one engine, one tick, one history.

---

## 1. Locked-in constraints (from the author)

| # | Rule | Where it lands |
|---|------|----------------|
| 1 | **AI applies to states / factions** — no separate campaign AI | Phase C (goals) |
| 2 | **Retire MWSC.** Factions have absorbed most Trouble/Lairs and already tick like states in living. Remaining environmental trouble becomes **burg actions with progress** (like building assets) | Phase E |
| 3 | **Characters deferred** — the `characters` branch owns that makeover | §4 DEFER |
| 4 | **Commands happen through "goal" guidance** in States/Factions — no command dispatch loop | Phase C |
| 5 | **Retire the conquest construction/building economy** — the Civ engine (production queues, Gold) owns all construction | §3 DROP |
| 6 | **No victory.** Everything rolls on with living history (chronicle/epochs) | §3 DROP |
| 7 | **No big extra UI.** Enhance the living HUD, state/burg/faction editors; delete the conquest rail/panels | Phase G |

---

## 2. Current dependency map (what must be re-homed before deletion)

`living-generator.ts` and friends already import from conquest:

```ts
// living-generator.ts (today)
import { currentContent } from "@/conquest/content/store";
import type { ArmyBlock, ArmyUnit, CapacityPoints } from "@/conquest/engine/common/types";
import { REGION_TIER_STEPS, SETTLEMENT_TIER_STEPS } from "@/conquest/engine/compiler";
import { initBattleSession, stepBattleRound, finalizeBattle, estimateOdds } from "@/conquest/engine/game/battle";
import { garrisonUnits, minorGarrisonUnits } from "@/conquest/engine/game/units";
import { assetCheckDifficulties, valueModifier } from "@/conquest/engine/game/saves";   // dies with MWSC (Phase E)
```

Also: `living-armies.ts` (hp↔count bridge over `ArmyUnit`), `military-generator.ts` (roster binding, `Military.getUnitTypes()`), `living-hud.ts`, `draw-military.ts`, `battle-screen.ts`, `factions-generator.ts` (roster/tier lookups).

**You cannot delete `src/conquest/` until every one of these has a new home.**

---

## 3. Disposition of every conquest module

### PORT (move code, keep behavior)

| Conquest file | New home | Notes |
|---|---|---|
| `engine/game/battle.ts` (+ its tests) | `src/model/battle/battle.ts` | Pure Lanchester engine, unchanged. Its consumers: living, `battle-screen.ts` |
| `engine/game/units.ts` (`garrisonUnits`, `minorGarrisonUnits`, `regimentToUnits`) | `src/model/battle/garrisons.ts` | |
| `engine/common/types.ts` → `ArmyBlock`, `ArmyUnit` | `src/types/battle.ts` | `CapacityPoints` **dies** with MWSC |
| `engine/common/content.ts` (UnitType, parseContent, categories) | `src/data/roster-content.ts` | The UnitType/roster parser |
| `content/docs/rosters/*.json` (28 files) | `src/data/rosters/` | Shipped roster data |
| `content/store.ts` + `bundled.ts` | `src/data/roster-store.ts` | `currentContent()`/`Military.getUnitTypes()` keep working |
| `engine/game/config.ts` → battle/military knobs (`terrainDefenseBonus`, `maxRounds`, `routThreshold`, `maxUnitsPerArmy`, `replenishFraction`, `encampReplenishBonus`) + trimmed `game.json` | `src/data/battle-config.ts` | `capacity.*` keys die with MWSC |
| `engine/compiler` → `REGION_TIER_STEPS`, `SETTLEMENT_TIER_STEPS` | `src/data/tiers.ts` | Pure ladders |
| `engine/game/sieges.ts` → siege progression + capture policies | absorbed into `living-generator.ts` siege path | Phase B |
| `engine/game/diplomacy.ts` → treaties, acceptance, confederation | absorbed into living diplomacy | Phase D |
| `engine/game/state.ts` → `Stance` union | merged with living `ArmyStance` | Phase F |
| `engine/game/world.ts` → `checkRebellions` heuristics (order-driven uprisings) | cross-checked against living unrest; adopt only gaps | Phase D/E |
| `engine/game/ai.ts` → defend-radius + odds-checked targeting heuristics | absorbed into the goals evaluator | Phase C |
| `engine/game/movement.ts` → stance multipliers, `riverCrossing` | absorbed into `armyMovementCost`/`stepArmyOrders` | Phase F |
| `engine/game/events.ts` → `CapturePolicy` only | into the siege path | Phase B |

### DROP (delete without porting)

| Conquest piece | Why |
|---|---|
| `engine/game/victory.ts` | Rule 6: no victory — living history rolls on |
| `engine/game/economy.ts` (3-check `advanceConstructionStep`, `salesTaxFactor`, `economyTick`) | Rule 5: Civ engine owns construction |
| `engine/game/capacity.ts` (whole MWSC ledger) | Rule 2 |
| `engine/game/saves.ts` (`valueModifier`, `rollSave`, `rollValueCheck`, `assetCheckDifficulties`, region activity) | Dies with MWSC + construction |
| Treasure & Atrocity state/commands | Dies with MWSC; revisit with the characters branch if ever |
| `engine/game/commands.ts`, `commandTypes.ts`, `context.ts` | Rule 4: goals replace commands |
| `engine/game/turn.ts` (`endTurn`) | The living seasonal tick **is** the turn |
| `engine/game/state.ts` (`Campaign`, `Army`, `RegionState`, `Truce`, `Siege`, `Character`, `stateHash`) | Living has its own state on `pack` + `living` |
| `engine/game/graph.ts` (A* `findPath`, `GraphIndex`) | Living uses hop-distance descent; optionally keep `regionDistance` for goal scoring |
| `engine/compiler/` + `engine/compile/` (pack→MapPack compilation) | Campaign-only; living works directly on `pack` |
| `host/` (Web Worker compiler) | Campaign-only |
| `store/` (campaign sessions, command log/replay, mirror, mod-slot, config-store) | Campaign-only; `.map` stays clean, living persists in `pack.history.living` |
| `ui/` (⚔ button, campaign rail, panels, layers, config/state editors, fmg seam, presets, rebase, log) | Rule 7: delete; enhance existing UI instead |
| `content/docs/victory/`, `content/docs/events/` | Rules 4 & 6 |
| Militia-defense injection (`getMilitiaDefenseUnits` / `temporaryMilitia`) | Folded into `cityGarrisonBlocks` if wanted; otherwise drop |

### DEFER (do not touch in this plan)

| Conquest piece | Owner |
|---|---|
| `engine/game/characters.ts` (lords, agents, skills) | `characters` branch (Rule 3) |
| `engine/game/figures.ts` (figure minting/sync) | `characters` branch |
| Interactive Battle Screen enhancements (round-by-round replay) | Later; `battle-screen.ts` keeps working off the moved core |

---

## 4. The Goals system (Phases C) — replacing commands + AI

### 4.1 Shape

Goals live on the state and faction sims; the living tick evaluates them. No dispatch loop, no `EngineCtx`.

```ts
// src/types/living.ts (additions)
type StateGoal =
  | { kind: "defend"; targetCell: number }              // hold/relieve (absorbs ai.ts defend-radius)
  | { kind: "conquer"; targetProvince: number }         // siege + capture (Phase B policies apply)
  | { kind: "raid"; targetState: number }               // plunder: Gold + unrest (stance "raid")
  | { kind: "reclaim"; targetProvince: number }         // retake lost core province
  | { kind: "settle"; targetCell: number };             // Settler founding (existing behavior, re-expressed)

type FactionGoal =
  | { kind: "expand"; targetBurg: number }              // new outpost (PR-27 stepFactions already does this)
  | { kind: "clash"; targetFaction: number }
  | { kind: "raid"; targetState: number }
  | { kind: "ascend" };                                 // sovereign ascension path (exists)
```

### 4.2 Evaluation

- `stepGoals(living)` runs inside the seasonal tick after `stepEmpire`, before `stepTactical`.
- Goal generation comes from **ruler agendas** (already in living) + war state + unraveled provinces + faction drives (PR-27 behavioral drivers).
- Odds discipline from `ai.ts` is absorbed: a `conquer`/`defend` goal only commits armies when `estimateOdds(...).attackerWinPct` clears a threshold; otherwise it gathers/replenishes.
- `tacticalTarget()`'s ad-hoc heuristics are replaced by: goal → nearest available army → order. Armies without goals hold/fortify (existing `restStance`).
- Factions: PR-27 `stepFactions()` already musters, raids, clashes, ascends — goals simply name its targets so the HUD/news can explain them.

### 4.3 Acceptance

- Deleting `ai.ts`, `commands.ts`, `commandTypes.ts`, `context.ts` breaks nothing.
- Army behavior is explainable from the owning state's goal list (shown in the state card).

---

## 5. Phase B design — Sieges & capture policies

Living today: assault battle vs `cityGarrisonBlocks`, win → `captureCity` (fixed effects), lose → retreat. Port from `sieges.ts`:

1. **Siege progression** — an army with a `conquer` goal adjacent to a defended city may *besiege* instead of assaulting: each season `garrisonWeakenFactor` −15% (floor 40%) applied as garrison block `hp` attrition. Any season it may still assault (odds improve as the garrison weakens).
2. **Capture policies** — on a successful assault, policy chosen from ruler personality/goal:
   - `occupy` — current `captureCity` behavior (default)
   - `loot` — +2× booty Gold, unrest 20
   - `sack` — +4× booty Gold, unrest 15, one building destroyed
   - `raze` — +3× booty, citizens halved (already), all buildings cleared, unrest 5
3. **Siege supplies** — optional: a Walls-tier building grants supply HD that buffers the 15%/season attrition; skipped if unwanted (rule 5 says no new construction economy — read from existing Civ walls buildings only).

---

## 6. Phase E design — MWSC retirement & burg actions

### 6.1 MWSC removal checklist

- Delete from `living-generator.ts`: `emptyCapacityLedger`, `recomputeStateCapacity`, `freeCapacity`, `hasFreeCapacity`, `freeGarrisonWaiver` logic, `valueModifier`/`assetCheckDifficulties` imports, all `config.capacity.*` reads (`developWPerTurn`, `constructionWPerTurn`, `stabilityPerGarrison`, `growthPerHabitability`).
- Delete `sSim.capacity` from `StatePolitySim` (+ migration on load: drop the field).
- Delete `CapacityPoints` from `src/types/battle.ts` (never ported).
- Upkeep/recruitment already run on the Civ economy (`Σ upkeep × hp`, Production queues) — no replacement needed.
- Factions keep their own PR-27 income/upkeep — untouched.
- HUD: replace the legacy M/W/S/C meter with a Gold/Production/Army-upkeep summary strip (rule 7: enhance existing).

### 6.2 Environmental trouble → burg actions

Troubles that survive the PR-27 faction absorption (pure environmental: blight, flood, drought, unrest-storms…) stop being MWSC-resolved entities:

- A trouble manifests as a **work order** queued in the province's major burg: `{ kind: "trouble", troubleId, productionCost }` — visually and mechanically identical to a building item in the Civ production queue.
- Progress in Production/season (existing `stepCities` machinery); completion clears the trouble, seeds a chronicle event, awards order/stability.
- `living-troubles.ts` shrinks to: catalog + spawn + the action mint. Lair logic is already faction territory (PR-27).

### 6.3 Phase E delivery notes

- Deleted from `living-generator.ts`: `emptyCapacityLedger`, `recomputeStateCapacity`, `recomputeAllCapacities`, `freeCapacity`, `hasFreeCapacity`, the `freeGarrisonWaiver` math, and the `valueModifier`/`assetCheckDifficulties` imports. `CapacityLedger`/`CapacityPoolEntry` are gone from `src/types/living.ts`; `CapacityPoints` is now a private type inside `roster-content.ts` (roster parsing only).
- `StatePolitySim.capacity` is deleted; the load path simply drops the field from old saves.
- Recruitment and development add **no new gate**: the Civ economy already bounds both (upkeep `Σ upkeep × hp` drained from the treasury, `settleDebt` disbanding the newest block on bankruptcy, and the production queue for buildings). Development keeps its existing stability cost only.
- Autonomous construction no longer rolls the 3-check dice; a roster building completes when its turn count elapses (the Civ production queue owns buildings).
- Environmental trouble is minted as `{ kind: "trouble", id }` in the province's burg production queue (80 Production); completion clears it, awards order/stability and writes a chronicle entry.
- The state card's M/W/S/C meter is replaced by an **Economy** strip (Gold/season + banked, Production, Science, Culture, Faith).
- Guild/trouble/lair check modifiers now read the state's **Gold income** as the domain value instead of the retired MWSC pool generation.
- Stale capacity tests were removed; a new test covers the trouble-to-production-action flow.

### 6.4 Phase F delivery notes

- `stanceMovementMultiplier` reads `config.movement.stanceMultipliers`: **march ×1.5**, **encamp/ambush ×0.7**, everything else ×1. `stepTactical` grants `maxMovement × multiplier` before orders run, so a marching army genuinely covers more ground.
- A **forced march cannot open a battle**: `stepArmyOrders` skips the engagement branch entirely while the stance is `march`.
- **Ambush** is the attacker's bonus, not the defender's: `armyBattleModifiers` now sources `defenderAmbushed` from the *attacker's* stance (the field name is legacy in `battle.ts`; conquest's own `commands.ts` does the same). An army that rests in the open outside its own land while at war becomes `ambush`, so the next attack it opens lands `+30%`.
- **Raid plunder** (already wired in Phase C) pays `citizens × 2 + 10` Gold into the treasury, seeds `+8` burg unrest, declares war and files a chronicle entry.
- **River crossing** already drains the remainder of an army's movement (`armyMovementCost`) and gives the defender `+15%` (`attackerCrossedRiver`).
- Tests: march/encamp/fortify grant compared on identical paths; a marching army does not attack; a war army resting on hostile soil conceals itself.

---

## 7. Phase G — the deletion itself

After A–F, `src/conquest/` contains only the campaign shell. Remove in one commit:

- `src/conquest/**` (engine remnants, host, store, ui, content leftovers, tests that did not move)
- `src/controllers/conquest-mode.ts`, `viewConquest` button, `tw*` layer toggles, conquest layer presets
- `map-commands.ts`: `openConquest` + campaign commands
- The `import "@/conquest/entry"` bootstrap line
- `MERGING.md`: conquest touch-point section
- `docs/openconquest/README.md` → replaced by a short `docs/wiki/Battle-Engine.md` (the moved `battle.ts` + rosters)
- `docs/plans/mod-merge-plan.md`: strike the "documented exception" paragraph (architecture.md too)

**Exit:** `grep -r "conquest" src/` returns nothing outside historical docs/plans; suite green; bundle measurably smaller.

---

## 8. Build order

| Phase | Slice | Size | Exit criteria |
|---|---|---|---|
| **A** | Move the battle core: `src/model/battle/`, `src/types/battle.ts`, `src/data/{roster-content,roster-store,battle-config,tiers}.ts`, `src/data/rosters/`. Re-point **all** importers (living, armies, military-generator, HUD, draw-military, battle-screen, conquest internals). Conquest still runs off the moved core | medium | No non-conquest file imports `@/conquest/**`; conquest campaign still playable; suite green |
| **B** | Siege progression + capture policies in living | medium | Besieging weakens garrisons seasonally; policies alter capture outcomes; tests |
| **C** | Goals for states & factions; absorb ai.ts heuristics; delete `tacticalTarget` ad-hoc path | large | Armies act from goals; state card shows goals; ai/commands files unreferenced |
| **D** | Treaties (peace/nonAggression/trade/defensiveAlliance/militaryAccess), acceptance thresholds, confederation, calls-to-arms; rebellion gap-check vs `checkRebellions` | medium | Treaties appear/expire in the chronicle; alliances drag allies into wars |
| **E** ✅ | Delete MWSC (checklist §6.1); trouble → burg production actions (§6.2); HUD meter swap | medium | No `CapacityPoints`/capacity ledger in civ code; troubles resolve via queues |
| **F** ✅ | Stance polish: march ×1.5 (no attack), ambush +30% initiation, raid plunder → Gold + unrest; `riverCrossing` modifier | small | Stances measurably change movement/combat |
| **G** | Delete `src/conquest/` + seams (§7) | medium | grep clean; suite green; MERGING/architecture updated |
| **H** | Docs: wiki battle-engine page, README fork blurb, data-model updates, this plan marked done | small | — |

Order rationale: A unlocks everything (G cannot happen while living imports conquest). B–F are independent enough to land serially in this order (C is largest; E removes imports B/C might otherwise trip over). Characters (Rule 3) are untouched throughout.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Moving battle.ts changes module shape and breaks `battle-screen.ts`/tests | Phase A is a pure file move + import rewrite; no behavior edits; battle tests move with it |
| Roster JSONs are also loaded by conquest's own content pipeline during transition | `roster-store.ts` becomes the single loader; conquest reads through it until Phase G deletes its pipeline |
| Removing `sSim.capacity` breaks old saves | Migration on load drops the field (established pattern: `living.units` combat migration in the armies plan) |
| Goals make army behavior worse than the current heuristics | C keeps `tacticalTarget` as fallback for one release behind the goal evaluator; remove once parity tests pass |
| Siege attrition makes cities fall too fast/slow | Reuse `CITY_STRIKE_HP` calibration pattern: measure on generated maps before tuning |
| Deleting the ⚔ button strands in-progress campaigns | Announce deprecation; `store/` exports a JSON dump path in the release prior to Phase G |

---

## 10. What deliberately never moves

- Victory conditions, campaign sessions/replay, the Web Worker compiler, A* pathfinding (living's descent is sufficient), sales tax, Treasure/Atrocity, the 3-check asset system, militia injection, and all conquest UI. Characters wait for their own branch.
