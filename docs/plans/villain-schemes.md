# Plan — Villain Masterminds: A Roster of Villains and Their World-Altering Schemes

**Status:** In progress — Phases 1–2 delivered
**Goal:** On map generation, a **mastermind process** elects 3–5 villains from the people and powers already on the map (state rulers, cult hierarchs, living gods, factions, lair masters), materializes them as figures in `pack.history.figures`, and compiles for each a **scheme**: one of seven generic goals instantiated with 8–12 steps whose targets — relics, victims, provinces, ruins — are all drawn from the map. Schemes advance on the Living World tick by hybrid push (villains spend treasury to work the active step through existing systems) and world-match (a step completes when the world reaches its predicate), opposed by adventurers, suppression, heroes and each other. Completing a scheme alters the world through machinery that already exists: new religions, successions, conquests, emergent states, blights.

---

## 1. What exists today (audit)

| Piece | State |
|---|---|
| Figures | `pack.history.figures` — roles `ruler/general/prophet/rebel/adventurer/specialist/agent`; `agent` already carries `assassin/diplomat/bodyguard` specialties (`src/types/history.ts:81-97`); virtues/vices 0–3 ("an evil one is all vices"), alignment, relations matrix, `seedKey` determinism, `manual`/`lock` protection |
| Character creation | `src/model/society/characters.ts`; living systems push figures directly (`living-threats.ts:783,1134`) |
| Factions | 10 epic archetypes incl. Apocalyptic Cult, Shadow Brotherhood, Claimant Confederacy, Dread Sovereign Host; `sovereignAmbition`, `expansionism`, `secrecy`, treasury, hostile diplomacy; agendas `expand_network/build_work/subvert/crusade_or_raid/ascend` |
| Religions | Folk/Organized/Cult/Heresy with a supreme `deity` **name only** — no living demigod entity exists |
| Lairs & troubles | 37 trouble types; troubles metastasize to lairs; polity-capable lairs ascend to states (`docs/plans/lair-ascension.md`, delivered); `Living.spawnTrouble(provinceId, id, severity)` |
| War & diplomacy | `Living.declareWar` (`living-generator.ts:6306`), treaties, claims/grudges, defensive call-to-arms |
| Rulers | Rulers age and are succeeded on the tick; fiscal policy and temperament already steer states |
| Story surfaces | `src/model/story/`: markers (ruins, battlefields, dungeons, caves), `Lore` model, journeys, notes |
| Chronicle | `HistoryEvent` types `war/battle/conquest/sack/schism/coronation/succession/deed`; fallen `Realm`s with `successors` and `remnantCulture`; dispatches/news |
| Tick phases | Phase A silent sync; Phase B scores and executes world beats — the natural seam for scheme advancement |
| Gaps | No schemes, no relics, no villain concept, no Issues-panel hook for any of it |

---

## 2. Locked decisions

1. **Omniscient god view** — schemes are a world-building tool first: all schemes and steps visible in the Issues panel from day one. `secrecy` gates *consequences* (coalitions, suppression), never the player's sight.
2. **Hybrid advancement** — every step has a completion predicate read from world state; villains also *push* the active step each season by spending treasury through existing systems (agents, agendas, subversion). Opposition pushes back.
3. **Small relic generator** — new catalog-driven generator naming relics from culture/religion lore, anchored to ruin/tomb markers. The only new content system.
4. **All seven goals ship** — Divine Ascension, Undying, Universal Empire, Extinguish the Faith, Usurp the Throne, The Puppeteer, Unseal the Doom.
5. **Schemes orchestrate, never simulate** — no new economic or military rails; steps act through war, trouble, religion, succession, faction-agenda and agent systems that already exist.
6. **Determinism** — election and instantiation run off the map seed (seeded RNG, `seedKey`), so the same map yields the same villains.

---

## 3. The mastermind election

Runs once, after religions, factions and history figures exist.

**Candidate pools and scores:**

| Pool | Candidate | Score additions |
|---|---|---|
| Crowned | living `ruler` figures | +2 per vice, +2 evil alignment, + state expansionism |
| Religious | `prophet` figures; hierarch of a Cult/Heresy (minted if absent) | +1 Cult/Heresy, + vices/alignment |
| Living god | a Cult's supreme deity incarnated as a figure (birth deep in the past, `tags: ["living_god"]`) | only eligible when the cult itself is strong (believer count) |
| Faction | the villainous archetypes plus any hostile, high-`expansionism` faction | + `expansionism`, +2 `sovereignAmbition`, + hostile diplomacy |
| Lair master | polity-capable lairs (warlords, cabals, fiendish/undead courts) at level ≥ 4 | + lair level |

**Selection rules:** pick **3–5** (base 3; +1 at ≥ 12 states, +1 at ≥ 24). Require at least one *crowned* and one *hidden* (cult/faction/lair) villain when pools allow. At most one villain per pool unless the map is thin. Geographic and cultural spread — no two from the same state. No two schemes may share an ultimate target entity (same religion, same crown); prefer rivalries: a villain seated inside another scheme's target state.

**Materialization:** elected entities without a face get one via the Characters model, with a role targeting their office (`ruler`/`prophet`/`agent` master). Existing `manual`/`lock` figures are elected as-is — election never edits a figure, it only attaches a scheme.

---

## 4. Goal catalog

Seven goals; each maps to an end state the existing machinery can express, and carries 2–3 step-ordering templates (e.g. Godhood-by-crusade vs Godhood-by-infiltration).

| Goal | Affinity | Completion (reuses) |
|---|---|---|
| `divine_ascension` | living gods, cult heads, prophets | new religion founded with the villain as deity, or `setDeity` on an Organized faith after its heartland converts |
| `undying` | necromancers, undead courts | villain tagged immortal (aging never reapplies); may leave an undead lair-court behind |
| `universal_empire` | ambitious rulers, Dread Sovereign Host, Claimant Confederacy | N rivals absorbed via conquest — or a fallen `Realm` restored by its `remnantCulture` |
| `extinguish_faith` | heresiarchs, hostile religions | target religion holds no provinces → removed; `schism`/`conquest` events |
| `usurp_throne` | claimants, siblings, magistrates | a specific crown passes to the villain (succession + coronation) |
| `puppeteer` | Shadow Brotherhood, Grand Merchant Consortium | K rulers levered into puppet standing (relations + treaties); wars engineered between others |
| `unseal_doom` | Apocalyptic Cult, fiendish lairs | the doom ruin breached: blight-trouble zone, hostile emergent state (lair ascension), or map plague |

Uniqueness recipe: **goal × template × targets × culture/religion flavor**. The same `extinguish_faith` reads as purge-by-fire under a Steppe horde and as framed heresies under an urban brotherhood.

---

## 5. Step grammar

Every step is `verb + target slots + completion predicate + push action`. 8–12 per scheme, sequenced gather → weaken → channel → finale.

| Verb | Slots from the map | Completes when | Push action |
|---|---|---|---|
| `seize_relic` | relic at a ruins/battlefield/cave marker or temple burg | villain holds the relic (or the marker is cleared) | hire agents / raid the site |
| `assassinate` | target figure (heir, general, inquisitor) | target dies | send an `assassin`-specialty agent; resolve vs. guards |
| `conquer` | province / burg / state | cell ownership flips | steer the mastermind's state to `conquer` agenda / faction `crusade_or_raid` |
| `occupy_site` | marker cell, D seasons | held to term | lair/node presence at the cell |
| `perform_ritual` | location + prerequisite relics, N-season channel | timer expires with site held | guard the site |
| `convert` | province's religion | province religion flips | subversion + missionary pressure |
| `corrupt_official` | ruler / magistrate | relations flip to the villain | bribes (treasury) |
| `engineer_war` | two victim states | the victims fight each other | inject grudge/claim between them |
| `infiltrate` / `build` | burg node / faction asset | node or asset exists | reuse `expand_network` / `build_work` verbatim |
| `research_lore` | library, tomb, sage | lore note recovered | agents dig — a hero on `excavate` doctrine can preempt |
| `breach_seal` | the doom ruin | finale verb; triggers the end state | channel under attack |

**Retargeting rule:** a step whose target dies or is destroyed first retargets (assassinate → the new heir), fails-and-reroutes, or collapses the scheme — per verb. This rule is where the emergent storytelling lives.

---

## 6. Relic generator (the one new system)

`src/data/relics.ts` + `src/model/story/schemes-generator.ts`: a name/nature catalog keyed by culture and religion lore (`Lore` model), instantiated onto ruin/tomb/battlefield markers and temple burgs at generation. Relics are `pack.history.relics` entries: `{ i, name, kind, at: { cell, marker? }, holder?: HistRef, tags }` — scheme steps reference them; seizing moves `holder`. Map surface v1: the marker's note, no new layer.

---

## 7. Runtime

- **Tick seam:** a schemes pass beside Phase B. For each active scheme: evaluate the active step's predicate (world-match, free); else the villain pushes if treasury allows (cost per verb); pushing risks **exposure** (`secrecy` falls; failed assassinations fall hard). Exposed schemes draw suppression campaigns and coalition grudges — never player blindness (§2.1).
- **Opposition:** suppression vs. exposed villain factions; adventurers and specialists clear scheme-spawned troubles; `hunt_lairs`/`excavate` heroes preempt `seize_relic`/`research_lore`; rival villains contest the same relic; a state at war with the mastermind stalls every step inside its borders.
- **Pacing:** each push ≈ 1–3 seasons; rituals channel 3–6; a full scheme runs ~20–60 seasons. The final two steps **telegraph**: omens dispatches and a matching trouble at the site.
- **Failure & succession:** mastermind death → `collapsed`, or the top `agent`/`general` lieutenant inherits at ~70% progress with a chronicle note. Scheme completion → end state (§4), history events, Issues entry retires the scheme.
- **Stalls:** a broke villain pauses — sieging their treasury is a legitimate counter-scheme.

---

## 8. Data model & save

`src/types/schemes.ts`:

```ts
type SchemeGoalId = "divine_ascension" | "undying" | "universal_empire" | "extinguish_faith"
  | "usurp_throne" | "puppeteer" | "unseal_doom";
type SchemeStepStatus = "pending" | "active" | "done" | "failed";

interface SchemeStep { verb: SchemeVerb; targets: HistRef[]; cell?: number; duration?: number; status: SchemeStepStatus; }
interface Scheme { i: number; goal: SchemeGoalId; mastermind: HistRef; villainFigure: number;
  template: string; secrecy: number; steps: SchemeStep[]; status: "active" | "complete" | "collapsed"; }
```

Stored on `pack.history.schemes` (and `pack.history.relics`) beside `figures`; `auto-update.ts` backfills empty arrays. No economy/stability fields are serialized — end states act through existing systems.

## 9. Player surface

- **Issues & Crises → Schemes section**: villain (linked to the figure sheet), goal, template flavor, step list with statuses, exposure meter.
- **Dispatches & chronicle**: step completions write `deed`/`schism`/`conquest`/`sack` events and news lines ("A courier drowned crossing the Weep…").
- **God tool**: from the Issues entry — force-advance, expose, abort, re-roll scheme; smite remains the ultimate counter.
- No new map layer in v1; geography shows through markers and notes.

---

## 10. Implementation phases

1. **Data & election** — `src/types/schemes.ts`, `src/data/scheme-goals.ts` (goals, templates, flavor tables), `src/data/relics.ts`, `src/model/story/schemes-generator.ts` (election, figure materialization, step instantiation, relic seeding); tests: pool scoring, diversity constraints, determinism, relic anchoring.
2. **Runtime** — `src/model/physical/living-schemes.ts` (predicates, pushes, exposure, opposition hooks) wired beside Phase B; tests: world-match completion, treasury stall, assassination resolution, retargeting.
3. **End states** — religion founding/`setDeity`, succession/coronation for usurpers, conquest absorption, lair-ascension doom, blight troubles, chronicle events; tests per goal.
4. **UI** — Issues panel Schemes section, god-tool actions, dispatch lines, locales; jsdom tests as in the factions editor.
5. **Docs** — wiki page (Schemes or a Living-World section), `data-model.md`, Changelog entry; regenerate assistant context; full suite green.

**Exit:** any seed elects 3–5 villains including crowned and hidden; each scheme's steps reference only map-real targets; same seed → same schemes; suite green.

---

## 11. Delivery notes

### Phase 1 — data & election (delivered)

- **Types** in `src/types/schemes.ts`: `Scheme`, `SchemeStep`, `Relic`, the seven goal ids, the twelve verbs, `MastermindPool`. `History` carries the optional `schemes` and `relics` arrays (same chronicle record 57, no save migration needed).
- **Catalogs** in `src/data/scheme-goals.ts` (seven goals, two 8–9-step templates each, pool affinities, preferred relic kinds) and `src/data/relics.ts` (fifteen relic nouns, per-goal marker site types).
- **`Schemes.generate()`** in `src/model/story/schemes-generator.ts`:
  - election from the five pools — crowned rulers, `Cult` living gods, `Heresy` prophets, factions (wilderness factions form the wild pool; the lair→faction migration means lairs are already factions), scoring vices, alignment, expansionism, `sovereignAmbition` and villainous archetypes;
  - 3–5 picks (one more at 12 and 24 states), at most two per culture, one per pool when the map allows, at least one crowned and one hidden, no duplicate figures or institutions;
  - materialization through `Characters.add`: existing rulers and faction leaders are reused; a cult deity is incarnated as a `living_god`-tagged prophet figure named after the deity; leaderless factions get a minted face and their `leaderId` set; the figure is reused on regeneration;
  - goal weighted by pool affinity, template chosen at random, every step filled from map data — rival states (neighbours first, other masterminds preferred), figures, religions, burgs and danger markers — with distinct victims/officials/conquests where the template repeats a verb;
  - no two schemes share a keystone target (a usurped or last-conquered state, a purged religion, a breached ruin);
  - relics are seeded at ruins, necropolises, rifts, caves and sacred sites (temple-burg fallback), named from the deity, the culture adjective or a generated founder (`The Crown of Nerath`), and linked by `relicId` to their `seize_relic` step.
- **Pipeline**: a `schemes` step runs after `history` in both `GenerationPipeline` and `ErasePipeline`, so the chronicle's figures exist first; `legends` follows.
- **Tests**: seven cases in `schemes-generator.test.ts` — crowned+hidden election, vice weighting, living-god incarnation and reuse, leaderless faction materialization, step shape (8–12, one active) with map-real targets, relic anchoring to danger markers, and deterministic output for the same map and random stream. Full suite **3781/3781**; real-map scenario suites **50/50**; `tsc --noEmit` clean.

### Phase 2 — runtime (delivered)

- **`src/model/physical/living-schemes.ts`** advances every active scheme once a season. `Living.tick()` calls it right after the silent background sync and before the notable-events phase, so scheme dispatches fall under the usual per-tick news cap. Two new `SchemeStep` fields are runtime-owned: `progress` (channel seasons left) and `Scheme.exposed`.
- **World-match first**: a step whose predicate already holds completes for free — a dead assassination target, a removed/conquered state (a faith counts its capital's religion), a war already raging, a relic already held, a flipped conversion cell, a puppet tag, or an ordinary channel at zero.
- **Pushes**: when the world has not caught up, the mastermind pays a per-verb cost from its purse (state treasury, faction treasury, or the host faction/state of a religion; a faith with no patron lives on a 50% donation roll). A broke mastermind simply stalls. Attempts use the Living seed's per-tick RNG: assassination `0.30 + secrecy/400`, war-making and relic theft `0.55`, conversion and corruption `0.55–0.60`; channel verbs lose one season of progress per paid tick. `conquer` declares war (state), flags a raid (faction) or takes the target capital's faith (religion).
- **Opposition**: each push costs 1–2 secrecy; at zero the scheme sets `exposed`, writes one dispatch and one chronicle `deed`. Covert verbs also stall inside the land of a state at war with the mastermind's own state.
- **Retargeting**: dead figures, destroyed states, lost burgs and missing faiths are replaced from the map; an assassinate target or removed conquest is completion instead. A step with no replacement fails and reroutes to the next pending step; failing the last collapses the scheme.
- **Succession**: a dead villain hands the design to the best agent/general serving the same mastermind, at 70% channel progress (or collapses when none serves). `Living.killFigure` handles scheme assassinations: a reigning state ruler passes the crown through the existing `succeedRuler`, a faction leader gets a minted successor and `leaderId`, everyone else gets a dated death, dispatch and `deed`.
- **Tests**: ten cases in `living-schemes.test.ts` — world-match completion, final-step completion, treasury stall/funding, pushed assassination, retargeting, one-time exposure, lieutenant inheritance, heirless collapse, closed-border stall and pushed war. Full suite **3791/3791**; scenarios **50/50**; `tsc --noEmit` clean.
