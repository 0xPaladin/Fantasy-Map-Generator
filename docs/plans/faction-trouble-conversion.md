# Plan — Runtime Trouble→Faction Conversion: Trouble Shrinks, Dangerous Factions Spawn, Lairs Die

**Status:** Phase 1 delivered; Phases 2–4 pending
**Goal:** Finish what PR #30 started. Trouble becomes only natural/environmental hazards; organizational pressure spawns as **dangerous factions** in `pack.factions`; lairs disappear as a separate system because the faction tick now owns raiding, clearing and ascension. One opponent engine: the faction tick.

---

## 1. What exists today (audit)

| Piece | State |
|---|---|
| `TROUBLE_CATALOG` (46) | 20 marked `isHazard`, 19 `canPromoteToState`, 7 neither (`angry_dead`, `dark_wizards`, `monsters`, `murderous_heirs`, `relic_golems`, `things_from_below`, `blight_spawn`) |
| `FACTIONS_CATALOG` (57) | All 20 lairs absorbed; only 14 trouble IDs present as archetypes; 32 trouble IDs missing, incl. 10 promotable organizational ones |
| `spawnTrouble` | Draws from all 46 IDs (`BURG_/RUIN_/RESOURCE_TROUBLE_IDS`); every spawn is a `ProvinceTrouble` |
| `isHazard` / `attractsFactionTypes` | Defined in data, asserted in `factions-catalog.test.ts`, **zero runtime consumers** |
| `clear_hazard` | Union member only (`src/types/factions.ts:28`), no handler |
| `promoteTroubleToState` | Trouble → **state** directly (lair template); never creates a faction |
| `ProvinceLair` / `stepLairs` / `tickLairRaid` / `metastasizeTroubleToLair` / `ascendLairToState` | Fully live: `stepFactions()` calls `stepLairs()` every tick; lairs raid, escalate and ascend on their own path |
| Faction tick | `stepFactionAgendas` (patron severance + turf clashes) and `stepFactionMilitaryAndRaids` (ascension only) — **hostile factions do not raid today**; lair raids are the only raids |
| Faction runtime spawn | `Factions.add()` exists but is only used by `generate()`; nothing spawns factions mid-sim |

---

## 2. Locked decisions

1. **Trouble = hazards + hazardous customs.** `TROUBLE_CATALOG` keeps 28 passive afflictions: the 20 environmental/economic/site hazards (flooding, barren surroundings, recurrent sickness, no workers, inaccessible, ancient curse, leyline blight, contaminated land, harsh conditions, hazardous resource, pervasive hunger, severe damage, taboo land, toxic process, undeveloped, wasted production, crushed spirits, destructive customs, failed settlement, exceptional poverty) **plus** 8 hazardous customs that are grievances, not organizations — `bad_reputation`, `class_hatred`, `covetous_polity`, `disputed_possession`, `disunity`, `cultural_feuding`, `mercenary_populace`, `xenophobia`. Customs stay trouble forever: they never act autonomously. The other 18 entries leave the catalog.
2. **"Dangerous faction" = the 18 trouble-derived archetypes** (hostile *or* clandestine/autonomous derivatives of retired troubles: cults, secret societies, brigands, exiled lords, demagogues, corrupt leadership, mutinous elements, monster/undead hosts). Spawn pool is `ORGANIZATIONAL_TROUBLE_IDS` mapped through `TROUBLE_TO_FACTION` — the allegiance comes from the archetype. Spawned factions always set the host state relation to `"Enemy"`. (Amended during Phase 1: hostile-only would have orphaned five absorbed troubles that no other system spawns; customs were then returned to trouble by follow-up — they are not organizations.)
3. **Spawn split at the existing spawn trigger**, not a new one: when the seasonal/post-conquest spawn fires, roll hazard-trouble vs dangerous-faction (≈50/50, theme-weighted — ruins/burgs lean faction, resource leans hazard).
4. **`isHazard` / `attractsFactionTypes` are deleted** (fields, catalog test, plan references). No hooks: the spawn itself is the attraction.
5. **Clear trouble = production clock.** `clear_hazard` → `clear_trouble`. A faction with that agenda banks its node's Production each season toward `required = 40 + 20 × level` (the same shape as the burg trouble work order and building costs), and clears the hazard on completion — like a building, not a dice roll and not a fixed season count. A tick is a season (4 months), so `required = 2 + level` seasons stretched a level-10 hazard to ~4 years; production scales with city size instead, so a strong city finishes in 2–3 seasons and a weak outpost takes longer. `agenda.progress` holds banked Production points, mirroring `productionProgress`. The state's existing `resolve_trouble` domain check stays as the state-side path.
6. **Promotion only via `ascendFactionToState()`.** `promoteTroubleToState()` and `ascendLairToState()` are deleted with their call sites. Dangerous factions ascend through the existing `stepFactionMilitaryAndRaids` gate (hostile + `seasonsActive ≥ 8` + ≥ 2 techs + no-burgs/collapsed-order/state-turmoil).
7. **Lairs are deleted as a system.** `ProvinceLair`, `pSim.lair`, `living.activeLairs`, `stepLairs`, `tickLairRaid`, `escalateLair`, `metastasizeTroubleToLair`, `spawnLair`, `clearLair`, `assaultLair`/`sendAdventurersToLair` lair paths, `clear_lair` agenda, and all lair HUD/editor UI go. The faction tick absorbs raiding and clearing (Phase 3).

---

## 3. Phase 1 — Reshape trouble and split the spawn

**Files:** `src/data/living-troubles.ts`, `src/data/factions-catalog.ts`, `src/model/physical/living-threats.ts`, `src/model/physical/living-generator.ts`, `src/data/factions-catalog.test.ts`, `src/model/physical/living-generator.test.ts`

1. **Close the catalog gap first:** add the missing archetypes so every non-hazard trouble ID has a faction counterpart — `monsters` → `monster_nest` alias, `murderous_heirs` → new archetype (or alias to `conquering_heirs`), and the 10 missing promotable IDs (`bad_reputation`, `class_hatred`, `corrupt_leadership`, `covetous_polity`, `disputed_possession`, `disunity`, `cultural_feuding`, `mercenary_populace`, `recalcitrant_locals`, `xenophobia`) as hostile/clandestine archetypes under political/underworld categories. Result: 26 trouble IDs ≡ 26 faction archetypes (same `type` string where possible).
2. **Prune `TROUBLE_CATALOG`** to the 20 hazard IDs. Fix the three spawn tables (`BURG_/RUIN_/RESOURCE_TROUBLE_IDS`) to reference only surviving IDs. Delete `isHazard`, `attractsFactionTypes`, `canPromoteToState` from `TroubleDef`; delete `isTroubleStatePromotable()` and the catalog test that asserted them (replace with: every pruned ID resolves to a faction archetype).
3. **`spawnTrouble()` split** (`living-threats.ts:417`): at the existing trigger, after theme/level roll, branch:
   - *Hazard* → current behavior unchanged (mint the 80-Production trouble work order).
   - *Faction* → `spawnDangerousFaction(provinceId, theme, level)`: pick a hostile archetype (lair-absorbed IDs prefer ruin/marker provinces), create via `Factions.add()` with HQ at the province's capital burg or a danger marker, military instantiated from the matching lair template (`LairDef.raidUnits`/`defenderUnits` scaled by level), `seasonsActive: 0`, `stateRelations[host] = "Enemy"`, news + chronicle entry. No `pSim.trouble` is set.
4. **Save migration** (`Living.init()` / load path): any legacy `pSim.trouble` whose ID is no longer in the catalog becomes the corresponding dangerous faction (same mapping as §1); hazards pass through. Any legacy `pSim.lair` / `living.activeLairs` becomes a faction of the lair ID (§Phase 3, but the migration lands here so saves never strand).
5. **Delete `promoteTroubleToState()`** and its call sites: the `canCoup` branch in `stepProvinces()` (`living-generator.ts:9376`) and the failure-promotion branch in `resolveTrouble()` (`living-threats.ts:1180`). `resolveTrouble()` keeps the check, drops the promotion outcome.

**Exit:** `spawnTrouble` never emits an organizational ID; `grep -r "isHazard\|attractsFactionTypes\|promoteTroubleToState" src/` is clean; a trouble-spawn test asserts the hazard/faction split.

### 3.1 Phase 1 delivery notes

- Catalog: archetypes added for organizational troubles (`corrupt_leadership`, `recalcitrant_locals`); `monsters`→`monster_nest` and `murderous_heirs`→`conquering_heirs` are aliases in `TROUBLE_TO_FACTION`. `TROUBLE_CATALOG` holds exactly the 28 passive afflictions (20 hazards + 8 hazardous customs, which stay trouble — they are grievances, not organizations, and never act autonomously); `TroubleDef.canPromoteToState/stateLairId/stateForm/isHazard/attractsFactionTypes` deleted; `TROUBLE_TO_LAIR` preserves the old `stateLairId` templates for military seeding.
- Spawn: explicit trouble IDs are honored (catalog = hazard, anything else = faction); implicit spawns roll faction at 0.6 (ruin) / 0.55 (burg) / 0.4 (resource). `spawnDangerousFaction()` builds HQ/military/news/chronicle via `Factions.add()` + lair template.
- Promotion removed everywhere except the deleted function itself: stepProvinces coup branch, `resolveTrouble` failure branch, `Living.promoteTroubleToState()`, HUD promote buttons/cases, guild incite-coup branch + `pretenders_bribe` petition + `promoteTrouble` petition effect, province-dialog badge, draw-trouble note. A courtesy `flood_relief` petition was added so trouble-anchored petitions keep three dilemmas. Hazards now provably never promote (tests assert collapsed-order and critical-failure spawns end in lairs, never states).
- Migration: `Living.init()` runs `migrateLegacyThreats()` once per save, guarded by `LivingWorldState.threatsMigrated` (required: `tick()` re-calls `init()` every season). Legacy organizational trouble *and* lairs become factions; runtime-spawned lairs after migration are unaffected until Phase 3 deletes the system.
- Tests: spawn/migration/ascension suite rewritten around factions; suite 243/246, remaining 4 failures pre-existing (hero-diversity ×3, solar-system ×1).

---

## 4. Phase 2 — Clear trouble as a faction progression clock

**Files:** `src/types/factions.ts`, `src/model/physical/living-generator.ts`, `src/model/physical/living-threats.ts`

1. Rename `FactionAgendaKind "clear_hazard"` → `"clear_trouble"`.
2. **`stepFactionAgendas()` handler**: a faction with `clear_trouble` targeting a province banks Production each season — `agenda.progress += nodeSim.cityYields.production` (+ any faction bonus production, reusing `applyFactionProduction`'s inputs) toward `required = 40 + 20 × level` (level read from `pSim.trouble.level` at assignment, stored on the agenda so escalation doesn't move the goal). On completion it clears the trouble with the standard rewards (`+10` order, `+1` stability, news, chronicle `deed`). The agenda requires a faction node (HQ/outpost) in the province; the production comes from that node's sim. Adventuring/religious/commercial factions take it — the same posture as today's state `resolve_trouble` picker, minus the dice. This mirrors the burg-side clock exactly: the state-side trouble work order is 80 Production flat, so a faction node and a burg race the same hazard on the same currency.
3. **States keep their check:** `resolve_trouble` agenda → `resolveTrouble()` domain check, unchanged (minus Phase 1's promotion removal). Both paths and the 80-Production burg work order remain valid ways to clear a hazard.

**Exit:** a faction clears a hazard by clock with a test; no `clear_hazard` string remains.

---

## 5. Phase 3 — Delete lairs; the faction tick raids and clears

**Files:** `src/types/living.ts`, `src/model/physical/living-threats.ts`, `src/model/physical/living-generator.ts`, `src/controllers/living-hud.ts`, `src/controllers/political/province-dialog.ts`, `src/controllers/political/provinces-editor.ts`, `src/renderers/draw-trouble.ts`, tests

1. **Port `tickLairRaid()` → `tickFactionRaid(faction, living)`** (`living-generator.ts`): same target selection (local burgs, then nearest 3), same plausibility filter (walls/defenders vs raid men), same `initBattleSession` resolution against `burgDefenders()`, same pillage outcome. Raid units come from the faction's `military` regiments (falling back to the lair template for newly spawned factions); `raidThreshold`/`raidPending` move onto the faction (fields already exist).
2. **Port lair clearing:** `clear_lair` state agenda → march on the hostile faction's HQ/outpost cell and fight its military there; `hire_adventurers` → guild mission against that faction. `assaultLair()`/`sendAdventurersToLair()` lair branches are re-pointed at factions or deleted.
3. **Port ascension:** lair's `seasonsActive ≥ 8 && level ≥ 8` gate is already mirrored by the faction gate in `stepFactionMilitaryAndRaids()` (§2.6) — delete `ascendLairToState()` and the `stepLairs` ascension block.
4. **Delete:** `ProvinceLair` type, `ProvinceSimState.lair`, `LivingWorldState.activeLairs`, `stepLairs`, `escalateLair`, `metastasizeTroubleToLair()` (trouble no longer festers into lairs — unchecked hazards just escalate level/order damage), `spawnLair`, `clearLair`, `syncDangerMarkers` lair sync, `living.activeLairs` save/load handling. Faction danger markers continue to come from `Factions.generate()`'s marker seeding and faction HQ markers.
5. **UI:** HUD province rows, province dialog and provinces editor swap lair display for the hostile faction(s) present (name, HQ, military, raid threat); `draw-trouble.ts` renders hazards plus danger markers from factions. `clear_lair` strings in UI copy become faction wording.
6. **Migration** (extends Phase 1 §4): legacy `pSim.lair`/`activeLairs` → `Factions.add()` of the lair ID at its marker/cell with its level folded into military scale; fields dropped on save.

**Exit:** `grep -r "ProvinceLair\|stepLairs\|activeLairs\|metastasize" src/` is clean; hostile factions raid burgs in tests without any lair object existing.

---

## 6. Phase 4 — Docs and suite

- `docs/wiki/Living-World.md`, `docs/wiki/Factions.md`, `docs/architecture/data-model.md`: trouble = hazards only; dangerous factions spawn from the trouble trigger; lairs are factions; ascension only via `ascendFactionToState()`.
- `docs/plans/factions.md`: mark Option B delivered; remove the `isHazard`/`attractsFactionTypes` spec.
- Rewrite lair/trouble tests in `living-generator.test.ts` around factions; suite green except the pre-existing `solar-system` failure.

---

## 7. Build order and risks

| Phase | Size | Exit |
|---|---|---|
| 1 — catalog prune + spawn split + delete trouble promotion | medium | ✅ done |
| 2 — faction clear-trouble clock | small | clock test passes |
| 3 — delete lairs, faction raid/clear tick | large | lair grep clean; raid tests pass |
| 4 — docs + suite | small | suite green |

**Risks:**
- *Save compatibility:* legacy saves carry `pSim.lair`, `activeLairs` and organizational troubles. The Phase 1/3 migrations must run on `Living.init()` before any tick, or old maps strand entities.
- *Raid balance:* lair raid templates are tuned against garrisons; faction military must inherit the same templates or raids become trivial/impossible.
- *Spawn rate:* the 12% seasonal trigger now feeds two systems; watch faction count growth (cap active dangerous factions per map, e.g. reuse `faction.scale` caps).
- *Characters (PR #28) are untouched throughout* — guild hero checks read Gold income, which this plan does not change.
