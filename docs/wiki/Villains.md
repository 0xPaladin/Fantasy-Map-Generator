## Villains

A generated world can raise **3 to 5 villain masterminds**: rulers, prophets, living gods or faction leaders whose designs unfold over the Living World's seasons. They are elected from the map at generation, compiled into **schemes** of 8 to 12 steps, and advanced by the same systems that move states, faiths and factions. Nothing is invented from outside the map except the relics a scheme hunts.

### Who becomes a mastermind

The election runs after the chronicle, so rulers, faction leaders and religions already exist. Candidates come from five pools:

* **Crowned** — a living state ruler. Scored by vices, evil or chaotic alignment and the state's expansionism.
* **Religious** — the prophet of a `Heresy`, minted into the registry when the heresy has no head figure.
* **Living god** — a `Cult`'s supreme deity incarnated as a figure named after the deity. Only strong cults can produce one.
* **Faction** — the villainous epic archetypes (Apocalyptic Cult, Shadow Brotherhood, Claimant Confederacy, Dread Sovereign Host and kin), scored by `expansionism`, `sovereignAmbition`, hostile allegiance and vices. Leaderless factions get a minted leader.
* **Wild** — a wilderness faction with no burg HQ. Lair masters belong here: the lair→faction migration already turned them into factions.

Election keeps **one scheme per mastermind and institution**, at most two per culture, and requires at least one crowned villain and one hidden schemer when the map allows. No two schemes share their ultimate target — the same crown, faith or sealed ruin.

Every elected mastermind is a real figure in `pack.history.figures`, with a role targeting the state, faith or faction they lead. A cult deity is tagged `living_god`; other minted faces are tagged `mastermind`.

### Goals and end states

Each scheme is one of seven goals, compiled from a goal template into 8–12 ordered steps:

| Goal | What completing it means |
| :--- | :--- |
| **Divine Ascension** | The villain becomes a faith's living deity (`Religions.setDeity`, raised to `Organized`) or founds a new faith in their own name. A `schism` enters the chronicle |
| **Undying** | The villain is tagged `immortal`; the spring ruler-aging pass will not take them |
| **Universal Empire** | A state absorbs its conquest targets — cells, burgs and provinces pass over, a restoration faction rises — or an ambitious faction ascends into a sovereign state. A matching fallen `Realm` can be restored |
| **Extinguish the Faith** | The target religion is removed; its cells lose their faith and a `schism` records the last congregation |
| **Usurp the Throne** | The sitting ruler's role closes, the villain takes the crown, and a `-10` “Usurpation” stability line settles over the realm |
| **The Puppeteer** | Levered rulers' states are tagged `puppet:<scheme>`; a faction mastermind gains allied state relations. The shadow court rules without a crown |
| **Unseal the Doom** | The seal breaks: up to three surrounding provinces take `leyline_blight` or `ancient_curse` drain troubles and the eschaton rises |

The ultimate target is kept as the scheme's **keystone** (`state:<id>`, `religion:<id>` or `marker:<id>`), so the end state knows exactly which crown, faith or ruin the design was about.

### Steps, relics and progress

Every step is a verb with map-real targets:

`seize_relic`, `assassinate`, `conquer`, `occupy_site`, `perform_ritual`, `convert`, `corrupt_official`, `engineer_war`, `infiltrate`, `build`, `research_lore`, `breach_seal`.

The scheme carries the ordered list and exactly one **active** step. On activation a channel step gets `progress` (seasons of work left); each paid push removes one. Event steps complete when the world answers: the victim dies, the war starts, the relic is held, the cell changes faith, the official is tagged as a puppet, the capital falls. A step can also complete without a push when the world already matches. `attempts` counts how many paid pushes a step has taken.

**Relics** are the one new content system: fifteen kinds (crown, blade, tome, phylactery, seal, key, ledger…) seeded at ruins, necropolises, rifts, caves, battlefields or sacred sites, and named from the deity, the culture or a generated founder.

### What a season does

Once a season each active scheme works its single active step:

1. **World-match** completes the step for free if its predicate already holds.
2. Otherwise the mastermind may **push** once. A push posts a one-season daily expense line, `Scheme N: <goal>`, on the state's `economy.simAdjustments` or the faction's `simAdjustments` (`seasonal cost / 90`) and increments `attempts`; channel verbs also lose a season of `progress`. There is no treasury debit: states report a daily balance, not savings, and factions compute one from their economy. A mastermind whose day balance cannot absorb the line stalls. The line is cleared at the start of the next scheme tick, so each push costs exactly one season.
3. A push risks **secrecy**. At zero the scheme becomes `exposed` and the reveal is dispatched. Covert work also stalls inside the land of a state at war with a state mastermind.
4. Dead or destroyed targets are **retargeted** from the map. A step with no replacement fails and reroutes; failing the last one collapses the scheme. A dead villain hands the design to the best agent or general serving the same mastermind at 70% channel progress — or the scheme dies with them.

Completions and setbacks appear in the seasonal news and the chronicle (`deed`, `schism`, `conquest`, `coronation`, `founding`).

### The god view

The Living World HUD's 🗡 **Villain Schemes** button opens the world god view. Every scheme shows its villain (linked to the character sheet), goal and template, mastermind seat, `done/total` steps, secrecy meter and the full step list with status icons, targets, seasons left and push counts. The god actions are:

* **Force step** — completes the active step without payment or a roll;
* **Expose** — sets secrecy to 0 and dispatches the reveal;
* **Abort** — collapses the design;
* **Re-roll** — compiles a new goal and step order around the same mastermind, reusing a living villain and dropping the old scheme's relics.

### In the Characters editor

The Characters table has a **Villain** column. It reads **Yes** for a character elected as a mastermind and **No** otherwise. Clicking **Yes** opens that villain's scheme sheet with the same goal, step, secrecy and god-action controls. The scheme sheet is a stable dialog, so it can be opened from the Characters editor or from the god view without losing the rest of the table.

### Where to read more

* [Plan](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/plans/villain-schemes.md) — election, goal grammar, runtime and delivery notes.
* [Data model](https://github.com/0xPaladin/Fantasy-Map-Generator/blob/master/docs/architecture/data-model.md#villain-schemes) — `history.schemes`, `history.relics`, steps, keystones.
* [Characters](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Characters) — the registry, roles and traits villains are drawn from.
* [Living World](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Living-World) — the seasonal simulation that advances schemes.
* [Factions](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Factions) — the faction pools, treasuries and agendas schemes borrow.