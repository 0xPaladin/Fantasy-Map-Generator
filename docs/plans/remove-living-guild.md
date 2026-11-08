# Plan — Remove the Grand Guild (`living-guild`)

**Status:** Phase 3 complete — Phase 4 (docs & wiki) next.
**Branch:** `factions`
**Touchpoints:** `src/model/physical/living-guild.ts`, `src/model/physical/living-guild.test.ts`, `src/model/physical/living-heroes.ts`, `src/model/physical/living-generator.ts`, `src/model/physical/living-generator.test.ts`, `src/controllers/living-hud.ts`, `src/controllers/living-hud.test.ts`, `src/renderers/draw-living-overlay.ts`, `src/renderers/draw-living-overlay.test.ts`, `src/services/io/characters-migration.ts`, `src/types/living.ts`, `src/types/factions.ts`, `src/data/guild-operations.ts`, `src/data/living-petitions.ts`, `src/data/living-relics.ts`, `src/data/mission-phases.ts`, `src/data/mission-tags.ts`, and the Living World wiki/docs.

## Confirmed decisions

1. `Faction.missions` / `Faction.relics` are deleted; the faction sim never reads them.
2. Existing saved maps are not migrated — old `living.guild` / `living.playerFactionId` are ignored on load.
3. The whole relic economy is deleted, including state lease perks in yields, happiness and battle modifiers.
4. The Living World goes to unconditional Sandbox God Mode: free `data-god=` interventions only.
5. `living-heroes` and `Characters` stay: figures remain sim entities, and hero progression/vitals/paths stay. The guild-exclusive hero roster, candidates, recruitment, retirement and mission layers are removed.

## Phase 1 — Model: strip the engine

- Delete `src/model/physical/living-guild.ts` and its test.
- Move `figureCheckRoll()`, `figureCheck()`, `heroAlignmentModifier()`, `heroMissionFit()` and `heroScore()` to `living-heroes.ts`; re-export them from `living-generator.ts` so existing tests keep working.
- Remove the guild lifecycle from `living-heroes.ts`: `getGuild` dependency, `ensureHeroGuildState(guild, figure)` guild parameter, recruitment (`recruitCost`, `recruitCandidate`), `retireHero`, tavern candidates (`refreshCandidates`, `mintCandidate`), `GUILD_MAX_HEROES`, `maxHeroesForTier`, and the roster iteration in `recoverHeroes` / `autoPickPendingPaths` (they switch to all living heroes).
- Remove from `LivingWorldState`: `guild`, `playerFactionId`. Prune types: `GuildState`, `IdleDoctrine`, `ActiveGuildMission`, `HistoricalRelic`, `RelicHolder`, `RelicCategory`, `LivingPopup`, `LivingPopupKind`, `GuildMissionKind`, `MissionPhase`, `MissionPhaseResult`, `MissionPhaseInput`, `MissionOutcome`, `StateYieldBreakdown.relicTribute`, and `Faction.missions` / `Faction.relics`.
- Remove relic economy: `stateRelicCount`, `stepRelics`, `placeRelic`, `mintRelicFromMarker`, `recoverRelicsFromMarker`, `dropStateRelicsToRuin`, `REGALIA_HAPPINESS`, `IDOL_FAITH`, `IDOL_CULTURE`, `RELIC_YIELD_PERCENT`, `WEAPON_RELIC_COMBAT_PERCENT`, `RELIC_LEASE_TRIBUTE`, leased-relic yield/happiness/combat perks, and the State Cities relic line.
- Remove the player-faction bridge from `living-generator.ts`: `getPlayerFaction`, `setPlayerFaction`, `syncPlayerFaction`, all `dispatch*` / `equipRelic` / `enshrineRelic` / `leaseRelic` / `recallRelic` / `excavateMarker` / `guild*` wrappers, popup and petition calls, and the `turnAge()` guild carryover (scion spawning and legacy tier).
- Tick pipeline: remove `syncPlayerFaction`, `stepPlayerFactionMissions`, `stepRelics`, `expirePopups`, `refreshPopups` and the battle-side `queuePopup` call.
- Delete data modules: `src/data/guild-operations.ts` (+test), `src/data/living-petitions.ts` (+test), `src/data/living-relics.ts` (+test), `src/data/mission-phases.ts` (+test), `src/data/mission-tags.ts` (+test/eventual HUD consumer cleanup).
- Update model tests: delete guild blocks in `living-generator.test.ts`, fix `living-heroes.test.ts`, keep `hero-diversity.test.ts` green via the relocated checks.

## Phase 2 — HUD: remove the Guild Bar

- Rewrite `src/controllers/living-hud.ts` guild-free: clock/news/eschaton header only; inspector cards (state, burg, province, marker, figure) with unconditional Sandbox God Mode buttons; hero sheet keeps vitals, doctrine, push and path choices; faction suppression stays.
- Delete `mission-tags.ts` (its HUD consumer is gone; `mission-phases.ts` was already deleted in Phase 1).
- Rewrite `draw-living-overlay.ts` (moved up from Phase 3 — its guild types broke with Phase 1): raid/war vectors and outcome badges only; popups, quest lines and `showMarkerToast` removed; `showLivingToast` remains.
- Rewrite `characters-migration.ts` per decision 2: legacy `living.guild` reads dropped; seedKey/sheet backfill for legacy figures stays.
- Replace `living-hud.test.ts`, `draw-living-overlay.test.ts`, `characters-migration.test.ts` with guild-free suites.

## Phase 3 — Saves & misc wiring

- ~~`draw-living-overlay.ts`~~ done in Phase 2.
- ~~`characters-migration.ts`~~ done in Phase 2 (legacy guild reads dropped per decision 2).
- ~~Assistant context regeneration~~ done: `context.generated.ts` regenerated via `npm run generate:assistant-context`; `context.test.ts` green (Factions field list now reflects the missions/relics removal).

## Phase 4 — Docs & wiki

- Rewrite `docs/wiki/Living-World.md` Grand Guild section (keep God Mode), `docs/wiki/Characters.md`, `docs/wiki/Factions.md`, `docs/wiki/Changelog.md`, `docs/domain/glossary.md`, `module-guide.md`, and mark `docs/plans/living-idle-guild.md` superseded.

## Phase 5 — Tests

- Delete `living-guild.test.ts`, `guild-operations.test.ts`, `living-petitions.test.ts`, `living-relics.test.ts`, `mission-phases.test.ts`, guild blocks in `living-generator.test.ts` / `living-hud.test.ts` / `draw-living-overlay.test.ts` / `characters-migration.test.ts`.
- Keep `hero-diversity.test.ts`, `living-heroes.test.ts`, `living-threats.test.ts`. Full suite green apart from the pre-existing baseline failures.
