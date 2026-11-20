# Plan — Dungeon Delves: Send a Party, Resolve the Dungeon

**Status:** In progress — phase 1 (engine core) delivered 2026-11-20
**Goal:** Let the player form a **party of heroes** and send it to explore or clean out a **dungeon marker**. A delve is resolved by a seeded, high-level mission engine — one opposed-dice challenge per situation, a Mythic-style scene framer, a progress roll between objectives and an alert ladder — adapted from the author's `solo-engine` `run-mission` runner. No room-by-room tactics and no new stat blocks: the dungeon's existing profile is the opposition's stat sheet, the heroes' existing sheets are the party's, and every outcome lands on systems that already exist (hero condition, XP, marker state, chronicle, news).

---

## 1. What exists today (audit)

| Piece | State |
|---|---|
| Dungeon profiles | `generateDungeonProfile` (`src/model/story/dungeon-generator.ts`): name, size, areaCount, type, themes, alignment, safety, five 1–10 ratings, inhabitants (rating 1–6 + groups), treasure mix, the area graph, rumors. Deterministic per `${seed}:dungeon:${cell}`, cached on `marker.generated` |
| Area draft | `DungeonArea { number, type, kind, dressing, discoveries[], dangers[], exits[] }`; discoveries are features/finds (finds include tagged treasure caches), dangers are leaders/creatures/hazards; unexplored exits listed at the end |
| Hero sheets | `HeroSheet` on `Character.hero` (`src/types/character.ts`): twelve actions rated `d4–d12`, four attributes `-1..+2`, abilities, inventory, XP, condition (Resolve/Stamina/injuries/down), doctrine, archetype |
| The action check | `actionCheck` (`src/data/character-actions.ts`): action die + attribute vs DC 4/6/8/10, advantage/disadvantage, complication on 1, critical on max |
| Tag matching | `ACTION_DEFS` maps the twelve actions to `MissionTag`s; `heroMissionFit` (`src/model/physical/living-heroes.ts`) grants up to `+2` discipline and `+1` aspect vs a tag set; virtues/vices clamp to ±1; injuries already penalize |
| Hero lifecycle | `LivingHeroes` in `living-heroes.ts`: XP levels, path picks, `recoverHeroes` (Resolve +1/season, healer clears injuries), downed-for-two-seasons rule, Push/Stamina |
| Marker lazy content | `marker-content.ts` registry: `generated` slot with heading/divider helpers, `ensureGenerated`/`fullNote` render-on-demand, reroll support in the marker editor |
| Treasure mix | `TREASURE_CATEGORIES` (`src/data/treasure.ts`): bullion/regalia/art/relics — the same four parts as the state and faction `stash` |
| Chronicle & news | `pack.history` events (`deed` fits delves), `pushHistory`, `pushNews` host seam, Legends browser |
| Steppable dialog precedent | `src/controllers/political/military/battle-screen.ts` — round-by-round simulator |
| One-roll delve precedent | `living-threats.ts` "Send Adventurers": a single d20+mods vs DC against a *faction*, three outcome bands, news + chronicle + marker conversion |
| Gaps | No party-of-heroes activity loop; dungeon profiles are read-only prompt sheets; markers carry no delve outcome state; treasure caches are notation text with no sink |

## 2. Locked decisions

1. **Player-formed parties in v1** — the player picks heroes (and can promote background characters first), chooses a leader and orders. Sim-dispatched expeditions are a later phase reusing the same engine.
2. **Hybrid cadence** — the engine is a pure, seeded function; v1 resolves instantly from the marker with a steppable screen that replays the log. A Living World tick driver (states/factions dispatching their own heroes) is a later phase on the same contract.
3. **Dungeon markers only** — the profile machinery is complete there. Ruins, caves, burials and necropolises follow once the pattern is proven.
4. **Dice engine, not attrition curves** — resolution is opposed dice + progress rolls + consequences, not Lanchester math. The heroes' real action dice drive it; the log is a first-class output.
5. **Port, don't vendor** — `solo-engine` is a Node CLI with top-level `readFileSync`; FMG is browser Vite/TS. Port the state-machine shape with FMG-native inputs; solo-engine stays the design reference (§11). No runtime dependency.
6. **Determinism** — a delve's seed is `${mapSeed}:delve:${cell}:${figureIds}:${tick}`; the same party, dungeon and season always produce the same delve.
7. **Consequences only through existing systems** — hero condition/XP/inventory, marker state, chronicle, news. No parallel economy.

## 3. The delve is a mission

`run-mission` (`solo-engine/src/mission/gameLoop.js`) resolves Mission → objectives → situations → scenes with a journal and an After Action Report. The delve is the same machine with FMG inputs:

| solo-engine | FMG delve |
|---|---|
| `MissionContext` (archetype, location, patron) | The dungeon profile: type, marker cell, optional patron state/faction |
| Crew roster / away team | Player-formed hero party; support picks per situation (`excursion.js` pattern) |
| WAC challenge roll — 2 officer dice vs 2 threat dice, max vs max, doubles = crits, tie = twist | Action dice + support die vs the dungeon's threat dice (§4.1) |
| Alert ladder GREEN→BLACK, threat die d6/d8/d10/d12, free actions, VP award | Dungeon alert `quiet→hunting` starting from the inhabitants rating (§4.3) |
| Objectives 1–5, injected on Upheaval/Interrupt | Depth milestones from the area graph; "delve too deep" is native objective injection |
| Mythic Chaos Factor, Expected/Altered/Interrupt scenes | Scene framing seeded from Weirdness; Altered = the room is not what the profile said (§4.2) |
| Progress roll d6: Upheaval / Setback / Compromised / Advance | The noise mechanic between objectives (§4.3) |
| Resource rerolls (Stamina/Power/Crew) | Stamina as reroll — a strict upgrade of Push inside delves |
| Crew relationship web, stress reactions | The heroes' existing relationship matrix |
| Retainers (torchbearer, cook, sapper, scout) | Optional support staff extending the supply clock |
| `totalDeltaT` in 10-minute exploration turns | The supply/torch clock (§4.4) |
| VP / Renown, status snapshots, compiled AAR | Mission XP for heroes, before/after snapshots, "Delve record" on the marker note |
| `fast` / `detailed` fidelity | Resolve-now vs steppable replay — the hybrid cadence |

Not ported: ships, the 21 Cepheus skills (FMG has twelve actions + disciplines), genres, NPC generation, tier/party-size generation (parties are player-formed), the asset-die economy (inventory exists).

## 4. The resolution engine

Pure, seeded, host-agnostic. `runDelve(profile, party, options)` returns a full result and event log; nothing is mutated until the caller applies it (§7).

### 4.1 The opposed challenge roll

Each situation is one challenge, ported from `solo-engine/src/sim/challengeRoll.js`:

```text
officer dice = acting hero's action die
             + one support die: the best matching action die among the rest of the party
threat dice  = one alert die: quiet d6 → uneasy d8 → alerted d10 → hunting d12
             + one rating die from the situation's kind (§4.2)
net DM       = attribute + heroMissionFit (discipline/aspect vs the situation's tags)
             + virtue/vice (±1) − injuries + order stance
result       = max(officer) + DM  vs  max(threat)
```

The rating die steps with the profile's 1–10 summary: **1–2 → d4, 3–4 → d6, 5–6 → d8, 7–8 → d10, 9–10 → d12**. Fights and traps read **Danger**, clues and finds read **Mystery**, and special or arcane set pieces read **Weirdness** — so a safe-but-mysterious dungeon frightens through its secrets, and a weird one through its set pieces, even when its alert is low. Alert is the noise the party makes; the rating die is what the place *is*.

- **Officer doubles** above the threat → **critical success**: success ranks equal the officer max.
- **Threat doubles** above the officer → **critical failure**: Resolve hit plus an injury roll.
- **Cross-side tie on the maxes** → **twist**: the situation mutates from a small table (the hazard triggers early, a second occupant group arrives, a discovery turns out to be trapped, an unexplored exit opens).
- Success ranks chip the situation's **strength** (set from danger density); the situation is overcome when strength reaches 0. Failure margin costs **Resolve** — the acting hero first, then the support hero.
- **Stamina**: `+1` per point (the existing Push rule) or **one reroll per point, max 2** — the reroll is new to delves and is the port of resource rerolls.

### 4.2 Situations and scene framing

Objectives are built from the area draft; each carries 2–4 situations derived from the areas' contents:

| Area content | Situation | Tags (→ action) | Second threat die |
|---|---|---|---|
| creature/leader danger | a fight | `combat` → strike/guard/command | Danger |
| hazard danger | a trap or gauntlet | `trap`/`wild` → scout/craft | Danger |
| feature discovery | a clue or strange find | `ruin`/`arcane` → investigate | Mystery |
| find (supplies, key, body, cache) | a loot tick, rolled with craft | `ruin` → craft/infiltrate | Mystery |
| special area (vault, lake, circle…) | a themed set piece | typed by the area kind (`undead`, `curse`, `plague`, `intrigue`…) | Weirdness |

The leader, when present, is always the final situation of its objective and carries the highest strength.

**Scene framing** (ported from `frameScene`): each situation rolls `d10` against the delve's **chaos factor** — a value seeded from the profile's Weirdness, clamped 1–9:

- roll **above** chaos → **Expected**: the profile text plays out as written;
- roll **below** chaos → **Altered**: the situation mutates — the danger belongs to the other inhabitant group, the find is something else, the room is flooded (one reroll on the situation's table, logged);
- roll **equal** → **Interrupt**: a complication spills in — 50/50 the alert steps up or a new objective is injected into the chain (the delve-too-deep hook), and chaos +1.

Chaos drifts: +1 on critical failures and escapes, −1 on a controlled objective completion (the `progressEngine` bookkeeping).

### 4.3 The progress roll and the alert ladder

After each objective, a `d6` progress roll (ported from `progressEngine.js`):

| Roll | Result |
|---|---|
| 1 | **Upheaval** — the dungeon reasserts: inhabitants +1 (clamp 6), context reframed ("the deep halls answer"), a new objective inserted |
| 2 | **Setback** — a blocked path: a new objective inserted from an unexplored exit |
| 3 | **Compromised advance** — 50/50: alert steps up **or** +3 complications attach to the next objective |
| 4–6 | **Clean advance** |

The **alert ladder** `quiet → uneasy → alerted → hunting` starts from the inhabitants rating (1 → quiet, 2–3 → uneasy, 4–5 → alerted, 6 → hunting) and steps up on progress 1/3, interrupts and swift-order critical failures. It sets the **alert threat die** (`d6/d8/d10/d12`) — the first of the two in every challenge — plus free delve turns per objective (`4/3/2/1`) and the XP award multiplier (`×1/×1.5/×2/×3`). This replaces a flat encounter roll: the dungeon escalates because the party is loud, not because a clock said so.

### 4.4 Supply and exploration turns

Each situation costs 1–4 exploration turns (10 minutes each, the `deltaT` analog). The delve has a **supply clock** — `12 + 6 per hired retainer` turns, extendable by finds. Out of supply: every further turn costs 1 Resolve per hero and Stamina no longer refreshes between objectives; the party must retreat. Retainers are hired in the party picker from a fixed pool (torchbearer, cook, porter, scout — the `partyBuilder` retainer list, reworded); they never make checks.

### 4.5 Outcomes

| Outcome | Trigger | Consequences |
|---|---|---|
| **Triumph** | every objective overcome | marker cleared, full loot bag, full XP, chronicle `deed`, news |
| **Retreat** | party Resolve below the break threshold (25% of starting total), supplies out, player order, or two failed objectives in a row | carried bag kept, objectives missed, reduced XP, dispatch |
| **Defeat** | every hero downed | death roll per hero (50%), bag lost, dungeon weakened only if the leader was overcome, dispatch |

Retreat is the rout analog: a party almost always escapes with something rather than annihilating. Downed heroes use the existing rules — `downUntilTick` two seasons, recovery on the tick.

## 5. Dungeon-side derivation

Nothing is re-rolled; the profile is read as a stat block:

| Profile field | Engine parameter |
|---|---|
| `ratings.danger` | second threat die for fights and traps; threat strength; failure pressure |
| `ratings.treasure` + `treasure.shares` | cache count released on triumph and the loot bag's split |
| `ratings.scale` | base objective count: 1–2 → 2, 3–4 → 3, 5–6 → 4, 7–8 → 5, 9–10 → 6 |
| `ratings.mystery` | second threat die for clues and finds; clue situations carry an extra success requirement but award XP |
| `ratings.weirdness` | second threat die for special set pieces; chaos factor (clamped 1–9); twist frequency |
| `inhabitants.rating` | starting alert level — and so the alert threat die |
| `inhabitants.groups` | situation flavor and tag source (undead → `undead`, constructs → `trap`/`arcane`, beasts → `wild`, outsiders → `curse`/`arcane`, humans → `combat`/`intrigue`); when two groups exist, their relation seeds the twist table |
| `areas[].dangers/discoveries` | the situations themselves, in draft order |
| `themes`, `rumors` | the AAR's framing text; rumors are quoted in the log as hearsay that may or may not have held |
| `alignment`/`safety` | safer dungeons tilt twists toward social finds, perilous ones toward monsters (the generator's own safety shift, mirrored) |

**Objective count** is `base = 2 + floor((scale − 1) / 2)` (2–6), adjusted by the draft: subtract one when `areaCount < base × 3`, add one at `25+` areas, then clamp to `2–8` and to the area count. Scale says how much of a campaign problem the place is; the draft says how much ground it has; the party faces the larger of the two intents, never more rooms than exist. Upheaval, Setback and interrupt injections can push past the base only to the 8 cap.

The one new derivation: a **weakened** dungeon (leader overcome, partial clear) drops one alert level for future delves.

## 6. The party

- **Formation**: from the dungeon marker's *Send Party* button or the Characters editor; a stable picker dialog lists hero-sheet figures with their action dice, condition and archetype, allows promoting background characters inline, and enforces 1–6 picks with a leader.
- **Acting vs support**: each situation's tags pick the acting hero (best matching action die, tie → leader's doctrine choice); one other member with a matching action contributes the support die. `excursion.js`'s planned-vs-surprise split ports as: normal situations are planned (the leader assigns), **twist** situations are surprise (the nearest hero acts — highest-Resolve support hero).
- **Orders** (stances, one per delve): **swift** — progress per objective +1, threat die steps up on any critical failure; **cautious** — threat die steps down, one free reroll per objective, progress −1; **greedy** — loot multiplier ×1.5, break threshold 40%.
- **Relationships**: the party's internal tiers modulate support — an Ally support grants `+1` DM, a Rival support `−1`; the existing matrix is read, never written.
- **Snapshots**: before/after condition snapshots in the result, the `status.js` pattern.

## 7. Consequences that stick

- **Marker state** — `Marker.delve?: { status: "undisturbed" | "weakened" | "cleared", lastDelve?: number, clearedYear?: number }`. The renderer takes the state as an argument: a cleared dungeon renders with caches struck through and the Treasure rating shown depleted; regeneration from seed stays intact, the state overlays it. A cleared dungeon can still be delved — it finds a picked-over shell (loot ×0, one objective).
- **Loot** — each find's dice notation (e.g. `1d6+1`) is rolled at delve time × a config multiplier into its tagged category. Bullion becomes coin lines in the heroes' inventories; regalia/art/relics become named inventory items drawn from the category's flavor tables. A later slice adds patron delivery: deposit into a state/faction `stash` via `stashComposition` and a relations bump.
- **XP** — `max(0, 20 + objectivesDone × alertAward − escalation × 3)` (the VP formula) to each surviving hero; `applyHeroLevels` handles level-ups and path picks.
- **Chronicle & news** — a `deed` event linking the party figures and the marker cell; one news headline per outcome tier; the Legends browser picks it up for free.
- **AAR** — the journal compiles a **Delve record** section (notes-subset HTML via `generatedDivider`) appended to the marker note beside the profile: the objective chain, framing moments, critical rolls, the loot bag, the outcome. The delve screen shows the same events; the save stores only the compact record.

## 8. Data model & save

```ts
// src/types/delves.ts
export type DelveAlert = "quiet" | "uneasy" | "alerted" | "hunting";
export type DelveOutcome = "triumph" | "retreat" | "defeat";
export type DelveOrder = "swift" | "cautious" | "greedy";

export interface DelveSituation {
  id: string;
  area: number;              // area number in the draft
  title: string;             // the danger or discovery text
  tags: MissionTag[];
  action: ActionId;          // the resolved action
  strength: number;          // chipped by success ranks
}

export interface DelveObjective {
  index: number;
  title: string;
  situations: DelveSituation[];
  status: "pending" | "active" | "done" | "failed";
}

export interface DelveLoot { bullion: number; regalia: number; art: number; relics: number }

export interface DelveRecord {
  i: number;
  marker: number;
  cell: number;
  year: number;
  tick: number;
  party: number[];           // figure ids, leader first
  order: DelveOrder;
  outcome: DelveOutcome;
  objectivesDone: number;
  objectivesTotal: number;
  turns: number;
  finalAlert: DelveAlert;
  escalation: number;
  loot: DelveLoot;
  xp: number;
}
```

`pack.history.delves: DelveRecord[]` beside `figures` (same record shape as `schemes`); `Marker.delve` for the state; `auto-update.ts` backfills the array. The event log is never serialized — it lives in the note's Delve record and the screen.

## 9. Player surface

- **Party picker** — stable dialog (Characters editor styling): hero list with dice, condition and fit preview, leader selection, retainers, orders, patron field (informational in v1).
- **Delve screen** — `src/controllers/story/delve-screen.ts`, a battle-screen sibling: left, the dungeon stat block (ratings, treasure mix, alert meter, chaos, supply clock); right, the party strip (per-hero action dice, Resolve/Stamina bars, injuries) and the event log; footer, **Resolve now** (runs all and replays) / **Step** (walk events) / **Retreat**.
- **Entry points** — *Send Party* in the dungeon marker editor; a Delve action in the Characters editor; a *Delve again* line on a delved marker.
- **After** — news headline, chronicle `deed`, the marker note's new section, hero sheets updated in place.
- No new map layer in v1; no HUD changes (the tick driver is a later phase).

## 10. Implementation phases

1. **Engine core** — `src/types/delves.ts`, `src/data/delve-config.ts` (alert ladder, alert and rating threat dice, objective count formula, pressure, supply, loot multiplier, twist table), `src/model/story/delve/`: `challenge.ts` (opposed roll), `progress.ts` (progress roll, alert, chaos), `situations.ts` (profile → objectives/situations), `engine.ts` (the loop), `journal.ts` (log + AAR html). Tests: determinism (same seed/party/tick), ladder steps, rating-die steps, objective counts, twist/crit frequencies, injection caps.
2. **Application** — `delve/apply.ts`: marker state and depleted rendering, hero condition/XP/inventory, loot parsing, note append, chronicle/news through a `DelveHost` adapter (the `HeroesHost` pattern). Scenario tests: outcome distributions across seeds on real generated profiles; triumph clears, retreat keeps the bag, defeat downs heroes.
3. **UI** — party picker, delve screen, marker and Characters editor entry points, locales; jsdom tests as in the characters editor.
4. **Docs** — a Delving section in `docs/wiki/Dungeon-generation.md` (or a `Dungeon-delves.md` page linked from it, `Characters.md` and `Living-World.md`), `data-model.md`, Changelog; regenerate the assistant context; full suite green.
5. **Later (not v1)** — tick-driven sim expeditions (states/factions dispatch heroes as a Phase B beat; the existing "Send Adventurers" faction delve migrates onto this engine), patron stash delivery, rumor resolution rolls, delvable ruins/caves/burials/necropolises, megadungeon wings.

**Exit:** any generated dungeon marker plus 1–6 heroes resolves deterministically; triumph weakens or clears the marker and pays out; retreat and defeat leave real condition, injuries and losses; the note carries the story; the same seed reproduces the same delve; the suite is green.

## 11. Source and lineage

The resolution design is a port of the author's `solo-engine` (`C:\Users\susta\code\AstrumAurumPub\solo-engine`, MIT, same author as this fork):

- `bin/run-mission.js` and `src/mission/gameLoop.js` — the mission loop, fidelity split, VP formula;
- `src/mission/progressEngine.js` — the d6 progress roll, alert ladder, chaos bookkeeping;
- `src/mission/sceneFramer.js` — Expected/Altered/Interrupt framing;
- `src/sim/challengeRoll.js` — the opposed dice, crits, twists, resource rerolls;
- `src/actor/partyBuilder.js` — retainer staffing.

FMG's hero dice ladder already descends from the same engine's WAC character model (`src/data/character-actions.ts`), so the challenge roll plugs into existing sheets with no new character math. All table wording here is FMG's own; nothing is imported at runtime. See also [dungeon-profiles.md](dungeon-profiles.md) for the profile generator this builds on, [characters.md](characters.md) for the hero sheet, and [villain-schemes.md](villain-schemes.md) for the tick-beat pattern the later sim phase follows.

## 12. Delivery notes

### Phase 1 — engine core (delivered 2026-11-20)

- **Types** (`src/types/delves.ts`): `DelveHero`, `DelveSituation`, `DelveObjective`, `DelveLoot`, `DelveEvent`, `DelveResult`, `DelveRecord`, `MarkerDelveState`, the alert/order/outcome unions and the four treasure parts.
- **Config** (`src/data/delve-config.ts`): the alert ladder (die, free turns, XP award), the rating-die bands (1–2 d4 … 9–10 d12), the objective-count constants, pressure/supply/chaos/turn/loot/XP tunables, the twist table and the three orders. `ratingDie` and `stepDieSides` live here.
- **Challenge** (`challenge.ts`): the opposed roll — acting action die + support action die vs the alert die + the situation's rating die, max vs max; officer doubles crit, threat doubles crit-fail, ties twist; DM from attribute + discipline/aspect + support fit − injuries; Stamina rerolls (free rerolls first).
- **Progress** (`progress.ts`): inhabitants → starting alert; the `quiet→hunting` ladder; the d10 scene framer (equal interrupts, below alters, above plays straight) with chaos drift; the d6 progress roll (upheaval/setback/compromised/advance).
- **Situations** (`situations.ts`): Scale-first objective count with draft adjustments (`2 + floor((scale − 1) / 2)`, ±1 for thin or 25+ area drafts, clamp 2–8 and to the area count); area contents → situations with action, tag, rating and strength; leaders forced last; altered scenes re-roll the kind; injected objectives.
- **Engine** (`engine.ts`): the mission loop — supplies and exploration turns, alert escalation after the free turns, scene framing, acting/support selection, loot release, twists, break threshold, objective progress effects, objective injections, XP formula and the event log.
- **Journal** (`journal.ts`): the log as a Markdown AAR and as the notes-subset HTML "Delve record".
- **Tests**: 32 cases across `challenge.test.ts`, `progress.test.ts`, `situations.test.ts` and `engine.test.ts` — determinism, crit/twist/failure bands, reroll economics, DM sources, alert and rating die steps, scene framing, progress mapping, objective counts and leader placement, loot-free invariants, XP formula, objective caps and party validation. Suite green; `tsc --noEmit` clean; Biome clean.

No persisted fields yet: `pack.history.delves` and `Marker.delve` are typed but land with the application layer in phase 2, together with the marker-note append, hero-condition write-back and chronicle/news.
