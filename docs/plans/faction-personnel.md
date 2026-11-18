# Plan — Faction Personnel: State-Style Per-Head Expenses

**Status:** Phases 1–2 delivered; Phases 3–4 pending
**Goal:** Replace the faction expense model's abstract `nodeScale` footprint with **personnel** — the faction analog of state population. Each HQ and outpost employs **staff** (management and workers, paid through administration / court / infrastructure) and **guards** (garrison and enforcers, paid through military). Assets define the personnel they require; nodes hold **extra** staff and guards beyond that. Nodes also gain flat **hostAdjustments** to the host burg's economy and province's stability, over and above the influence-scaled core presence. Factions gain free-hand **notes**, edited from the manage dialog. Required expenses become per-head rates × heads, exactly how states derive their needs (`PROVISION_NEED`, `ADMINISTRATION_NEED`, `UPKEEP_COST`).

---

## 1. What exists today (audit)

| Piece | State side | Faction side today |
|---|---|---|
| Scale driver | People: `state.urban + state.rural` (population points) | `factionNodeScale()` (`living-faction-economy.ts:378`): HQ `1.5 × (0.5 + inf/100)`, outpost `0.5 + inf/100` |
| Administration need | `0.1 🪙/person/day`, curbs corruption up to 50% (`corruption.ts:21`) | `0.45 × nodeScale + 0.25 × outposts^1.2` |
| Court need | `0.08 🪙/person/day` (`PROVISION_NEED`, `state-orders.ts:26`) | `(0.35 × nodeScale + 0.12 × assets) × 1.2` for religious/political |
| Infrastructure need | `0.05 🪙/person/day`, distributed per province | `0.25 × nodeScale + 0.003 × assetCostSum` |
| Military need | `20 🪙 × army power` (`UPKEEP_COST`, `military-generator.ts:21`) — actual forces kept | `max(0.2 × nodeScale, regiment block upkeep/90)` |
| Host impact | Province/burg `adjustments` (user lines) beside computed flows | Core presence only: `factionNodeHostPresence()` (`living-faction-economy.ts:402`), scaled by influence/HQ weight/prosperity, written consolidated per faction by `syncFactionLines()` (`living-generator.ts:2605`) into `burg.simAdjustments` / `province.simStabilityAdjustments` (`Faction: <name>`) |
| Who the people are | `pack.states` population, visible everywhere | Nobody: influence and assets imply an anonymous footprint |
| Free-hand notes | Notes on burgs/markers via NotesEditor | `Faction.note?: string` (`types/factions.ts:134`) exists but has **zero** consumers — not shown, not edited anywhere |

Touchpoints of the current formulas: `requiredMap` (`living-faction-economy.ts:567`), `FactionEconomyBreakdown.nodeScale` (`types/factions.ts:234`), ledger line `factions-editor.ts:167`, tick call `living-generator.ts:2749`, tests `living-faction-economy.test.ts`.

---

## 2. Locked decisions

1. **Personnel is stored per node as extras: `personnel: { extraStaff, extraGuards }`** on `FactionHq` and `FactionOutpost` — headcount the organization keeps **over and above what its assets require**. Assets own the requirement; the node owns the surplus. `FactionPersonnel` type: both fields `number`, ≥ 0.
2. **Assets define required personnel:** `FactionAssetDef` gains `crew?: number` (staff) and `garrison?: number` (guards). Defaults by tier: crew 1/2/3; garrison set per asset in the catalog pass (muster camp 4, chapter lodge 3, smuggler warren / safe house 2, most others 0–1). A node's:
   - **effective staff** = Σ crew of its completed assets + `extraStaff`
   - **effective guards** = Σ garrison of its completed assets + `extraGuards`

   Requirements are computed from effective headcounts, never stored — building or dismantling a work resizes payroll automatically.
3. **Requirements are per-head rates, mirroring state constants:**

   ```
   FACTION_NEED = { administration: 0.06, court: 0.05, infrastructure: 0.03, guard: 0.05 } // 🪙/head/day
   administration required  = 0.06 × effective staff
   court required           = 0.05 × effective staff   (× 1.2 religious/political, kept)
   infrastructure required  = 0.03 × effective staff
   military required        = max(0.05 × effective guards, regiment block upkeep / 90)
   ```

   Military mirrors the state's "actual forces kept" reading (`UPKEEP_COST × power` = what the standing army costs); the guards term is the weaponless-faction floor, replacing `0.2 × nodeScale`.
4. **`hostAdjustments?: { gold?: number; stability?: number }` on every node** — flat 🪙/day and stability Δ the user sets per HQ/outpost, applied to the host burg's economy and host province's stability. Over and above the **core** computed presence (which keeps scaling with influence, HQ weight and prosperity — unchanged): the extras are flat, never scaled, zero by default, stored on the node so they survive regeneration and save/load. Folded into `factionNodeHostPresence()`'s return, so the consolidated `Faction: <name>` write in `syncFactionLines()` carries them with no structural change. Wilderness nodes (no burg) apply stability only, as today.
5. **Revenue side untouched.** Income stays % of host economies scaled by influence (`0.5×–1.5×`); influence keeps driving revenue, expansion and suppression — it just stops inflating upkeep. The Exaction Burden, charter tithe and adjustments stay.
6. **Provision, corruption, prosperity and stability formulas unchanged.** Only `requiredMap` and `nodeScale` change; provisions shift automatically. The faction corruption curb (admin provision × −50%) stays as-is — factions keep the un-skimmed-admin simplification, so the state's self-consistent `Corruption.curb()` solve is not needed.
7. **`nodeScale` is deleted** — `factionNodeScale()`, `FactionEconomyBreakdown.nodeScale` — replaced by `personnel: { staff, guards }` effective totals in the breakdown.
8. **Notes use the existing `Faction.note` field**, wired to a free-hand `<textarea>` at the bottom of the manage dialog (below the tabs, before the dialog buttons). Plain text, saved on input like the other inline fields; shown in the overview row tooltip. The rich-text NotesEditor is a separate system (burgs, markers, routes) — a `type: "faction"` integration stays out of scope.

**Calibration target** (a stock faction: HQ ~60 influence + 3 outposts ~35, 4 starter tier-1 assets; seeded extras ≈ 45 staff / 18 guards, asset requirements ≈ 4 crew / 2 garrison → **effective ≈ 49 staff / 20 guards**):

| Bucket | Today (nodeScale 4.2) | Proposed (49 staff / 20 guards) |
|---|---|---|
| Administration | 2.88 | 2.94 |
| Court | 1.95 | 2.45 (commercial; 2.94 religious) |
| Infrastructure | 1.65 | 1.47 |
| Military | 0.84 | 1.00 (or block upkeep) |

Stock category budgets should keep landing provisions in the same 50–80% band; verify on real maps with the calibration suite (`living-faction-economy.test.ts` + a spot-check via `FMG` on `public/Verse`).

---

## 3. Phase 1 — Personnel, hostAdjustments types, seeding and migration

**Files:** `src/types/factions.ts`, `src/data/faction-assets.ts`, `src/model/political/factions-generator.ts`, `src/services/io/auto-update.ts`, tests `factions-generator.test.ts`, `factions-save.test.ts`

1. Types: `FactionPersonnel { extraStaff, extraGuards }` (required on `FactionHq` and `FactionOutpost`); `FactionAssetDef.crew?` / `garrison?`; `hostAdjustments?: { gold?, stability? }` on both node types.
2. **Asset catalog pass** (`faction-assets.ts`): crew/garrison numbers on the 20 assets (defaults by tier; martial-track works get garrison 2–4, commercial/religious 0–1, extraction delves crew 2).
3. **Seeding in `factions-generator.ts`** where nodes are built (outposts at :422, HQ construction, `Factions.add()` at :907) — extras only, assets add their own requirement on top:
   - HQ: `extraStaff = 16 + round(influence/100 × 14)` (×0.75 wilderness), `extraGuards = 4 + round(influence/100 × 8)` (×1.5 martial, ×2 dread hosts).
   - Outpost: `extraStaff = 4 + tier × 2 + round(influence/100 × 4)`, `extraGuards = 2 + round(influence/100 × 3)` (×1.5 martial).
   - `hostAdjustments` seeds as `{}` (zero) — user-entered only.
4. **Migration in `auto-update.ts`** (the only place old shapes are handled): backfill `personnel` extras from the same sizing rules read off the saved node (influence, tier, category) and `hostAdjustments` as `{}`. Assets need no migration (crew/garrison are computed).

**Exit:** every node on a fresh or migrated map has personnel and hostAdjustments; save round-trip test passes; `factionNodeScale` still compiles (removed in Phase 2).

### 3.1 Phase 1 delivery notes

- `personnel` and `hostAdjustments` are **optional** fields (`personnel?: FactionPersonnel`), matching the existing `influence?` convention — required fields would have churned ~60 test fixtures with meaningless zeros; Phase 2 readers use `?? { extraStaff: 0, extraGuards: 0 }` and the migration guarantees presence on real maps.
- Seeding helper `factionPersonnelSeed()` + fill helper `seedNodeFactionPersonnel()` live in `living-faction-economy.ts`; called from `createFaction` and `Factions.add()` (covers epic spawns, danger-faction spawns and editor adds), the editor's add-outpost, the living tick's runtime outpost, and the `auto-update.ts` migration (guarded per node, idempotent).
- HQ relocation (`relocateOrDissolveFaction`) carries the survivor outpost's personnel and host adjustments onto the new HQ — the same people move.
- Asset `crew`/`garrison` added to all 20 catalog assets (crew = tier; martial-track garrison 2–4, chapter lodge 3, war citadel 3) and the civ-building fallback (crew = tier, garrison 1 at tier 3).
- Tests: seeding/shape assertions on generated factions, `factionPersonnelSeed` sizing cases (urban/wilderness/dread-host/martial outpost), and personnel + hostAdjustments round-trip in `factions-save.test.ts`. Full unit suite 3741/3741 green.

---

## 4. Phase 2 — Per-head requirements and host extras in the economy

**Files:** `src/model/physical/living-faction-economy.ts`, `src/types/factions.ts`, tests `living-faction-economy.test.ts`

1. `factionPersonnel(faction): { staff, guards }` — effective totals (asset requirements + extras) over non-pillaged nodes; replaces `factionNodeScale()`.
2. Rewrite `requiredMap` (`:567`) to the §2 formulas. `FactionEconomyBreakdown`: drop `nodeScale`, add `personnel: { staff: number; guards: number }`; `requiredTotalDaily` stays.
3. `factionNodeHostPresence()` (`:402`): add the node's `hostAdjustments` to `goldDaily` / `stabilityDelta` after presence and asset impact (flat, unscaled). `syncFactionLines()` needs no change.
4. Update tests: per-bucket required cases (asset crew/garrison growing requirements, extras on top), guards floor vs block upkeep, religious/political court multiplier, pillaged nodes dropping out, hostAdjustments landing in the consolidated line unscaled by influence.

**Exit:** `grep -r "factionNodeScale\|nodeScale" src/` is clean; calibration table in §2 reproduced as test assertions.

### 4.1 Phase 2 delivery notes

- `factionNodeScale()` deleted; `factionPersonnel(faction)` sums effective headcount (asset crew/garrison + `personnel` extras) over non-pillaged nodes. `FactionEconomyBreakdown.nodeScale` → `personnel: { staff, guards }`.
- `requiredMap` is per-head: `FACTION_NEED = { administration: 0.06, court: 0.05, infrastructure: 0.03, guard: 0.05 }` 🪙/head/day, court ×1.2 for religious/political, military `max(0.05 × guards, blockUpkeep/90)`. The asset-cost infrastructure term is gone — assets pay in heads.
- `factionNodeHostPresence()` adds `hostAdjustments` gold/stability flat after presence and asset impact (host burg/host state only; pillaged nodes stay at zero); `syncFactionLines()` carries them into the consolidated `Faction: <name>` line unchanged.
- Tests: the stock-faction calibration (49 staff / 23 guards → 2.94 / 2.45 / 1.47 / 1.15, total 8.01), religious court ×1.2, regiment floor over guards floor, pillaged-node drop, crew/garrison growth, and flat host adjustments (exact delta, stateless nodes skipped). One tithe test now reads the pre-tick breakdown: the court-provision influence drift mutates income inside `stepFactionEmpire`, so the stored line reflects tick-time income, not the post-tick recomputation.

---

## 5. Phase 3 — Editor, ledger, notes and localization

**Files:** `src/controllers/political/factions-editor.ts`, `src/locales/en.json` (+ other locales as translated), test `factions-editor.test.ts`

1. **Ledger** (Revenue | Expenses card): under the required-upkeep line (`:167`) add `Personnel: {{staff}} staff · {{guards}} guards`; per-bucket tooltip (`:125`) gains the effective headcount driving that bucket.
2. **HQ & Outposts tab** (`:1182`): a Personnel column showing `required + extra → effective` (e.g. `4+7=11`), tipped with the split; node edit fields for extraStaff / extraGuards (number inputs, min 0) and hostAdjustments gold/stability (signed number inputs) — god mode resizes payroll and host impact per node.
3. **Notes:** free-hand `<textarea>` at the bottom of the manage dialog, below the tab panels and before the dialog buttons — bound to `faction.note`, saved on input like the other inline fields. The overview row tooltip shows a short note excerpt when set.
4. **Factions Overview:** no new column; personnel and notes stay in the manage dialog.

**Exit:** personnel and host extras visible and editable per node; notes editable and persisted; budget rows show who is being paid.

---

## 6. Phase 4 — Docs and context

**Files:** `docs/wiki/Factions.md`, `docs/architecture/data-model.md`, `src/locales/glossary/*.md`, `scripts/generate-assistant-context.mjs` output

1. Wiki: new **Personnel** paragraph in *Headquarters and Outposts* (staff/guards, asset-required vs extra, per-head upkeep); rewrite the `Required Daily Cost` sentence in *Living World Simulation* step 1 to per-head rates; drop the `nodeScale` mention. Document node **hostAdjustments** beside the Host Impact column and **notes** under *User Interface and Tools*.
2. `data-model.md`: `personnel` and `hostAdjustments` on faction nodes, `crew`/`garrison` on asset defs; note the state-model parity (`PROVISION_NEED` analog).
3. Glossary: "personnel (factions)" entry; regenerate the assistant context.

**Exit:** docs match the code; `npm run lint` and the unit suite green.

---

## 7. Build order and risks

| Phase | Size | Exit |
|---|---|---|
| 1 — types + seeding + migration | medium | ✅ done |
| 2 — per-head requirements + host extras | small-medium | ✅ done |
| 3 — editor + notes + localization | medium | personnel, host extras and notes visible/editable |
| 4 — docs + context | small | wiki/data-model current |

**Risks:**
- *Balance drift:* provisions move for factions whose influence-inflated upkeep diverged from headcount (high-influence minimal-node factions get cheaper; many-outpost low-influence ones dearer). The §2 calibration band guards the stock case; if drift is wide, tune per-head rates, not the structure.
- *Requirement shocks on existing maps:* migrated extras reproduce today's upkeep closely, but any assets a player built will now also demand crew/garrison their budget never paid for — accept (it is the point of the model) and let provision dip one season.
- *Save compatibility:* `personnel` and `hostAdjustments` must exist before any economy read — the migration runs in `auto-update.ts` on load, per repo rule; generators and the tick then assume the fields.
- *Character guild checks (PR #28)* read revenue income only — untouched.

**Out of scope (follow-ups if wanted):** guards capping musterable blocks (replacing the node + Force Cap muster limit); personnel drift with influence/prosperity over seasons; personnel seeding the burg population when a faction ascends to a state; guards feeding suppression storm checks; rich-text NotesEditor integration (`type: "faction"`).
