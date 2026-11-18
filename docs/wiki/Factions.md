## Factions: Non-State Organizations, Outposts and Emergent Power

The **Factions** system introduces major non-territorial organizations that operate across, within, and beneath the borders of sovereign states. While states claim Voronoi cells and draw colored borders, factions project power through **Headquarters (HQs)**, a network of **Outposts** in settlements, queueable **Assets**, and their own **Militaries**.

Factions unify commercial consortiums, adventuring enclaves, religious orders, political leagues, underworld syndicates, and martial warhosts under a single simulation engine.

---

### Categories and the 10 Major Archetypes

Rather than generating dozens of minor guilds, procedural generation spawns only **major factions**—at most one of each of **10 curated epic archetypes** (`EPIC_FACTION_IDS` in [factions-catalog.ts](../../src/data/factions-catalog.ts)) across **6 categories** (legacy petty/lair types map to these 10 via `LEGACY_FACTION_ALIASES`):

| Category | Archetypes | Typical Allegiance | Typical HQ |
| :--- | :--- | :--- | :--- |
| **1. Commercial** | `merchant_consortium` (Grand Merchant Consortium) | Chartered | Major Port or Trade Hub |
| **2. Adventuring** | `adventurer_guild` (Adventurers' Conclave), `arcane_college` (Arcane Conclave), `ranger_wardens` (Frontier Warden Order) | Autonomous or Chartered | Major or Frontier Burg |
| **3. Underworld** | `shadow_syndicate` (Shadow Brotherhood) | Clandestine | Port or Major Burg |
| **4. Religious** | `holy_order` (Crusader Knightly Order), `heretical_cult` (Apocalyptic Cult) | Chartered or Clandestine | Temple Burg or Ruin Marker |
| **5. Political** | `noble_league` (Claimant Confederacy) | Autonomous | Secondary Capital or Major Burg |
| **6. Martial** | `mercenary_company` (Iron Free Company), `dread_host` (Dread Sovereign Host) | Autonomous or Hostile | Prominent Burg or Wilderness Marker |

---

### Reach and Ambition

A faction carries no scale of its own; what it wants and how far it reaches are data it keeps, and its real footprint is read from the map:

* **Expansion scope** (`expansionScope`) — `local`, `province`, `state`, `culture`, `religion` or `global`: the ground it seeks and where it plants outposts.
* **Expansionism** (`expansionism`, 0.2–2.0) — how hard it pushes, folded into its agenda odds.
* **Sovereign ambition** (`sovereignAmbition`) — whether a successful siege can ascend it to a state, with the `stateForm` and culture roster it takes then.
* **Its real footprint** — active outposts and their influence, constructed and queued assets, host development, and daily revenue. The _Manage Outposts & Assets_ dialog lists them, and nothing is asserted beyond what the map holds.

Rival factions and their host states watch that footprint: a busy faction draws suppression, a weak one loses its outposts to rivals.

---

### Headquarters and Outposts

Every HQ and outpost is an anchor on the map: a `FactionHq` or `FactionOutpost` with a `cell`, optional `burgId`, `influence`, `secrecy`, `assets` and a `sim` record for siege HP. Wilderness HQs simulate in place without creating a `pack.burgs` entry until ascension promotes them to a sovereign burg/state. Every faction maintains a single primary base:
* **Urban Headquarters**: Situated in a populated burg or capital, benefiting from local commerce and population.
* **Wilderness Headquarters**: Anchored to a danger marker (`dungeon`, `lair`, `ruins`, `cave`, `volcano`, etc.), serving as a stronghold for hostile warbands or cults.

A faction expands into settlements within its reach by establishing **Burg Outposts**. On initial generation, every epic faction receives a scope-appropriate network of 1–4 outposts (avoiding overcrowding on top capitals and falling back outside scope only if its home scope has no eligible towns), with tiered starting **Influence** (`60–85%` at HQs, `20–60%` at outposts) and a starter asset per outpost so no faction begins HQ-only. Multiple factions can co-exist within the same settlement, competing for influence:
* **Influence (0–100%)**: The faction's share of local political, economic, or shadow leverage in the burg, directly adjustable in the **HQ & Outposts** table.
* **Secrecy**: Clandestine outposts operate covertly to avoid detection and state crackdowns.
* **Personnel**: Each node employs **staff** and **guards** — completed assets require their `crew` and `garrison`, and nodes keep `personnel` extras on top (seeded from influence, tier and category). Personnel headcount drives the faction's required expenses.
* **Host adjustments**: A node can add a flat `hostAdjustments` gold/stability impact on its host, over and above the influence-scaled core presence.

---

### Means of Income (Daily Economy & Levers)

Factions draw **daily** revenue directly from the host state, province, market, and burg economy ([living-faction-economy.ts](../../src/model/physical/living-faction-economy.ts)) rather than abstract cell yields. Every non-pillaged node's income scales uniformly with its **Influence (`0–100%`)** (`0.5×` at `0%`, `1.0×` at `50%`, `1.5×` at `100%`), and both revenue streams per category are directly adjustable as `%` rates in the ledger:

| Category | Lever 1 (Primary Rate %) | Lever 2 (Secondary Rate %) |
| :--- | :--- | :--- |
| **Commercial** | **Guild dues**: `20%` default of host burg `product` | **Market commissions**: `5%` default (`+3%` per commercial asset) of market turnover (scaled by leader bias) |
| **Underworld** | **Graft siphon**: `25%` default of host province pocketed graft | **Smuggling & tariffs**: `50%` default of host state tariffs (`×1.5` under embargo) |
| **Martial** | **Military retainers**: `5%` default of `Friendly`/`Ally` host state `military` spending | **Raiding & tribute / Protection levy**: `5%` default when `hostile` (`0%` otherwise) of host burg `product` |
| **Religious** | **Court & clergy tithe**: `5%` default of host state `court` spending × `(0.5 + prosperity)` | **Shrine offerings**: `0%` default of host burg `product` × `(0.5 + prosperity)` |
| **Political** | **Court patronage**: `5%` default of host state `court` spending × `(0.5 + prosperity)` | **Admin appropriation**: `5%` default of host state `administration` spending × `(0.5 + prosperity)` |
| **Adventuring** | **Guild charters**: `3%` default of host state `administration` spending × `(0.5 + prosperity)` | **Bounties & contracts**: `8%` default of host burg `product` |

In addition:
* **Exaction Burden Tradeoff**: Pushing a faction's revenue rates above its category defaults raises daily income, but adds an internal **Exaction Burden** penalty to faction stability and drains the host burg's daily economy and provincial stability; lowering rates below defaults eases host pressure.
* **Charter Tithe**: `chartered` and `state_arm` factions pay a configurable tithe (`15%` default) daily to their `patronStateId`.
* **Asset Extraction & Adjustments**: Wilderness/extraction works such as `subterranean_delve` generate direct daily output (`+3 🪙/day`), and custom daily **Adjustments** (`faction.adjustments`) can be edited in the ledger.

---

### Faction Assets

Factions build works at their HQ and outposts from a catalog of 20 faction assets ([faction-assets.ts](../../src/data/faction-assets.ts)): commercial depots and counting houses, underworld safe houses and smuggler warrens, shrines and temples, muster camps and chapter lodges. Each asset has a work cost funded from daily revenue, an era gate (`requiredTech` reads as a development threshold), and node rules (`hq_only`, `burg`, `wilderness`).

Assets function like state public works: selecting one places it into the faction's build queue (`faction.project` when idle, or `faction.projectQueue` when a work is already underway) rather than charging lump-sum gold from treasury. Selectable assets are listed by **projected seasons based upon daily infrastructure revenue** (`projectDaily`). On completion (and when dismantled), assets apply current-architecture effects:
* **Host Burg Economy** (`burg.simAdjustments`): daily `+🪙/day Host` (or drain for underworld dens).
* **Host Province Stability** (`province.simStabilityAdjustments`): `% Host Stability` modifiers.
* **Market Commissions**: commercial assets raise the node's market turnover cut (`+3% Market Cut`, up to 15%).
* **Military, Secrecy, Development & Influence**: `+Force Cap` expands standing guard regiments, `+Secrecy` hardens nodes against suppression, `+Development` raises host province development, and `+Influence` strengthens faction reach (plus `+🪙/day Revenue` for extraction delves).

God mode and the editor queue specific works via `Living.commissionFactionAsset(factionId, assetId, nodeKey?)` and cancel queued works via `Living.dequeueFactionProject(...)`.

---

### Living World Simulation, Upkeep, Prosperity & Stability

Factions ride the same rails as states — no city loop, no citizens, worked cells, or yields. Each season (`Living.tick()`):

1. **Revenue & Configurable Expenses (`Day Balance`)** — every HQ and outpost earns its category-specific daily revenue streams combined with any custom **Adjustments**. Users can adjust the `%` shares for all four expense buckets (**Court and patronage**, **Administration**, **Infrastructure**, **Military**—which still covers regiment block upkeep) or reset them to category defaults. Each bucket computes a **Required Daily Cost** per head of the faction's **personnel** — its staff and guards (asset `crew`/`garrison` plus each node's `personnel` extras), at `0.06` / `0.05` / `0.03` 🪙 a head for administration / court / infrastructure and `0.05` a guard, floored at the regiment block upkeep — and a **Provision (`0–100%`)** score:
   * **Administration**: curbs base corruption by up to `50%`; remaining buckets lose `corruptionRate%` to skimming before fulfilling their need.
   * **Court & Patronage**: supports internal cohesion and seasonal node influence drift.
   * **Infrastructure**: maintains assets and drives daily construction funding (`projectDaily`).
   * **Military**: maintains standing forces and scales faction combat strength (`0.5×–1.0×`).
2. **Faction Prosperity & Stability (`0–100%`)** — derived from bucket provision scores, host burg prosperity, corruption, and daily solvency:
   * **Prosperity** contributes to outpost expansion readiness (`≥ 40%`), asset build efficiency, and host economic footprint.
   * **Stability** drives seasonal influence drift (`+1` when `≥ 70%`, `-2` when `< 40%`), and severe instability (`< 25%`) can collapse weak (`≤ 15%` influence) outposts.
3. **Host Economy & Stability Presence (`simAdjustments`)** — every active HQ and outpost writes **one consolidated line per faction** into its host burg's `burg.simAdjustments` and its host province's `province.simStabilityAdjustments` (`Faction: <Name>`), combining its category/allegiance presence (scaled by node **Influence `0–100%`**, HQ weight, and **Faction Prosperity**) with local completed assets and the node's flat **host adjustments**. For example, chartered commercial guilds enrich hosts (`+🪙/day`, `+stab`) while underworld syndicates drain them (`-🪙/day`, `-stab`), and hostile warbands destabilize borderlands.
4. **Treasury** — `Day Balance × 90` (`SEASON_DAYS`) is banked into `faction.treasury`; a negative balance disbands the newest block.
5. **Works** — the faction advances its active queued asset using its daily infrastructure revenue (`projectDaily × SEASON_DAYS`), promotes the next item from `projectQueue` on completion, or picks the next eligible work when idle.
6. **Muster & Influence** — a faction under strength and funded musters one roster block per season up to its node + `+Force Cap` limit (gated on goods like a state's); chartered factions pay `15%` daily tithes to their patron.

**Tactically** the factions use the same `ArmyBlock[]` regiments, keyed `f{id}-{regimentId}`, as states: they engage enemy state or rival faction armies, siege burgs, strike cities in range, and replenish in their own towns. A successful sovereign-ambition siege or an entrenched hostile faction ascends into a sovereign state; state-arm agencies defect when their patron's unravel passes 60, and rival outposts clash for turf influence.

---

### State Suppression of Hostile Factions

States counter hostile or clandestine factions in-world instead of only through editor removal. A state whose burgs host a hostile faction node — or whose territory contains a wilderness HQ — can run a **suppression campaign**: the `suppress_faction` agenda, picked in `chooseAgenda()` after lair/trouble emergencies, or started from the Inspector's **Suppress faction** button.

Auditing one node at a time:

* **Urban nodes** are pressured administratively: each funded season costs the suppressing state `6 + tier × 4` gold from its treasury and, after three funded seasons, deals influence damage based on province order vs the node's secrecy, raises province order, burg unrest and state unravel. A defending faction guard pauses pressure (and repeated stalls strain the state); unguarded low-influence (≤ 25) or fortified nodes can be stormed directly by the field army through the shared battle engine — victory pillages, failure retreats and delays the campaign.
* **Wilderness strongholds** (HQ with no burg on a state-owned cell) are military-only: there is no host city to queue in, so the field army marches to the HQ cell and storms it once adjacent, under the same guard-first and pillage rules.
* **Pillage consequences:** a razed outpost is skipped from economy/influence; a razed HQ relocates to the faction's strongest surviving outpost or dissolves the faction when none remain. Pillaged nodes show a slate crest with a 💀 badge and a "Pillaged" tooltip; the Outposts & Assets dialog shows per-node influence while the campaign runs.

Lawful `state_arm`, `chartered` and non-hostile factions are never eligible. Schedules, tuning and tests: [`faction-suppression.md`](../plans/faction-suppression.md).

---

### Sovereign State Ascension & Remnants

Factions can evolve into recognized sovereign nations:

* **Urban Coup**: An insurgent faction (rebel front, demagogue, or sinister cult) with overwhelming influence in a restive burg can seize control and proclaim a new State.
* **Wilderness Ascension**: An entrenched hostile faction active for eight or more seasons can overpower nearby settlements or build a fresh capital burg, graduating into a sovereign nation on the map with its own borders, banner, and chronicle entries.
* **State Collapse Remnants**: When an existing State collapses or is conquered, loyalist generals, nobles, or partisans form remnant insurgencies that fight on as clandestine factions.

---

### User Interface and Tools

* **Factions Overview** (_Tools_ → _Factions_): The primary table for viewing, sorting, filtering, editing, and exporting factions to CSV. Columns show Faction, Category, Allegiance, Alignment, HQ, Outposts, daily **Income**, **Prosperity**, **Stability**, and Forces, with footer totals for **Avg daily income** and **Outposts**.
* **State Inspector suppression**: for a state, the _Suppression_ section lists every eligible hostile faction node (with influence and a wilderness tag for burg-less HQs) and a **Suppress faction** command; the agenda reads `"Suppressing {faction} in {burg or the wildlands}"`.
* **Faction Editor & Manage Dialog**: Inspect or customize an organization's emblem, category, archetype, alignment, values, patron state, outposts, and military regiments. The **Manage Outposts & Assets** dialog displays daily income, prosperity, and stability badges and a state-style daily **Revenue | Expenses** ledger (inline editable `%` revenue rates, collapsible **Adjustments**, editable `%` shares with **Required** cost and `% met` indicators across the 4 buckets — each tipped with the staff or guards headcount driving it, plus a **Personnel** payroll line, reset to defaults for both Revenue and Expenses, **Day Balance**, **Corruption**, and adjustable **Charter tithe**) above the **HQ & Outposts** (Burg, editable **Influence**, **Personnel** — asset crew/garrison plus editable extras and flat host adjustments per node, daily **Income**, **Host Impact**), **Assets** (queued/active/completed works listed by projected seasons from daily revenue, with current-architecture benefits), and **Forces** tabs, with a free-hand **notes** box at the bottom (excerpted in the overview's HQ tooltip).
* **Burg Editor Outposts Inspector**: In the Burgs Editor, inspect resident faction HQs and outposts at that burg alongside local influence and secrecy.
* **Map Layer (`#factions`, Hotkey: `Shift+F`)**: Displays faction HQ badges, outpost pins, and field regiments on the SVG map.
* **Living HUD**: The god-mode inspector intervenes in the simulation — spark rebellions, smite rulers, resolve troubles, assault lairs, promote emergent states — and the **Suppression** section orders a state to campaign against a hostile faction.
