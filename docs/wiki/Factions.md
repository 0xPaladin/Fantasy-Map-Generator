## Factions: Non-State Organizations, Outposts and Emergent Power

The **Factions** system introduces first-class, non-territorial organizations that operate across, within, and beneath the borders of sovereign states. While states claim Voronoi cells and draw colored borders, factions project power through **Headquarters (HQs)**, a network of **Outposts** in settlements, upgradeable **Assets**, and their own **Militaries** and **Advancement**.

Factions unify peaceful commercial guilds, religious inquisitions, knightly orders, and state agencies with underworld syndicates, rebel fronts, and hostile dangerous factions under a single simulation engine.

---

### Categories and Archetypes

Factions span six broad categories and 59 archetypes:

| Category | Archetypes | Typical Legality | Typical HQ | Primary Focus |
| :--- | :--- | :--- | :--- | :--- |
| **1. Commercial & Civic** | `merchant_company`, `bank_consortium`, `craft_guild`, `smuggler_free_traders` | Autonomous or Chartered | Port or Market Burg | Wealth accumulation, trade expansion, market infrastructure |
| **2. Martial & Adventuring** | `adventurer_guild`, `mercenary_company`, `knightly_order`, `ranger_wardens` | Autonomous or Chartered | Citadel Burg or Border Keep | Monster hunting, expeditions, mercenary contracts, relic recovery |
| **3. Underworld & Illicit** | `thieves_guild`, `assassin_brotherhood`, `brigand_band`, `pirate_fleet`, `gang_syndicate` | Clandestine or Hostile | Burg Shanty or Coastal Haven | Siphoning wealth, smuggling, shadow contracts, increasing unrest |
| **4. Religious & Occult** | `monastic_order`, `inquisition`, `heretical_sect`, `sinister_cult`, `doomsday_cult`, `arcane_cabal`, `necromantic_circle` | State-Arm, Autonomous, or Clandestine | Temple Burg or Ruin Marker | Faith, arcane research, heresy suppression, forbidden rituals |
| **5. Political & State-Arm** | `royal_agency`, `colonial_governorate`, `noble_faction`, `rebel_front`, `exiled_claimant`, `peasant_commune`, `mutinous_garrison` | State-Arm or Insurgent | Capital Burg or Provincial Castle | Internal order, political influence, state coups, succession wars |
| **6. Warlord & Wilder Lair** | `rogue_warlord`, `marauder_horde`, `exiled_clan_hold`, `xenophobic_enclave`, `ancient_evil`, `planar_rift`, `monster_brood` | Hostile or Sovereign-Aspirant | Wilderness Marker or Dungeon Cell | Plunder raids, territorial expansion, emergent state ascension |

---

### Reach and Ambition

A faction carries no scale of its own; what it wants and how far it reaches are data it keeps, and its real footprint is read from the map:

* **Expansion scope** (`expansionScope`) â€” `local`, `province`, `state`, `culture`, `religion` or `global`: the ground it seeks and where it plants outposts.
* **Expansionism** (`expansionism`, 0.2â€“2.0) â€” how hard it pushes, folded into its agenda odds.
* **Sovereign ambition** (`sovereignAmbition`) â€” whether a successful siege can ascend it to a state, with the `stateForm` and culture roster it takes then.
* **Its real footprint** â€” active outposts and their tiers, constructed assets, known technologies and treasury. The _Faction Outposts_ dialog lists them, and nothing is asserted beyond what the map holds.

Rival factions and their host states watch that footprint: a busy faction draws suppression, a weak one loses its outposts to rivals.

---

### Headquarters and Outposts

Every HQ and outpost is an anchor on the map: a `FactionHq` or `FactionOutpost` with a `cell`, optional `burgId`, `tier`, `influence`, `secrecy`, `assets` and a `sim` record for siege HP and unrest. Wilderness HQs simulate in place without creating a `pack.burgs` entry until ascension promotes them to a sovereign burg/state. Every faction maintains a single primary base:
* **Urban Headquarters**: Situated in a populated burg or capital, benefiting from local commerce and population.
* **Wilderness Headquarters**: Anchored to a danger marker (`dungeon`, `lair`, `ruins`, `cave`, `volcano`, etc.), serving as a stronghold for hostile warbands, cults, or outcasts.

A faction expands into settlements within its reach by establishing **Burg Outposts**. Multiple factions can co-exist within the same settlement, competing for influence:
* **Outpost Tier**: Tiers 1 through 3, unlocking additional asset slots and resilience.
* **Influence (0â€“100%)**: The faction's share of local political, economic, or shadow leverage in the burg.
* **Secrecy**: Clandestine outposts operate covertly to avoid detection and state crackdowns.

---

### Faction Assets

Factions build works at their HQ and outposts from a catalog of faction assets ([faction-assets.ts](../../src/data/faction-assets.ts)): commercial depots and counting houses, underworld safe houses and smuggler warrens, shrines and temples, muster camps and chapter lodges. Each asset has a **treasury cost**, an era gate (its equiredTech reads as a development threshold) and node rules (hq_only, urg, wilderness).

A work is **commissioned**, not bought: the faction pays the cost up front and builds it over a number of seasons equal to the asset's tier. On completion the asset joins the node, and its money bite becomes a daily line in the host burg's simAdjustments - a consortium enriches its town (+1 to +4 a day per commercial asset), a thieves' den drains it. Order and unrest bites apply to the host province and burg at completion. God mode and the editor commission specific works via Living.commissionFactionAsset(factionId, assetId, nodeKey?).

The _Faction Outposts_ dialog lists each node's **Income** (its season's upstream income) and **Lines** (what the faction's works write into the host town); its header shows the empire's income a season, charter tithes, and a two-column **Revenue | Expenses** daily ledger above the tabs.

---

### The Living World Simulation

Factions ride the same rails as states - no city loop, no citizens, worked cells, queues or yields. Each season (`Living.tick()`):

1. **Revenue & Expenses (`Day Balance`)** - every HQ and outpost earns category-specific daily revenue streams (commercial manufacturing & market commissions, underworld graft & smuggling, martial retainers & hostile tribute, religious/political court & admin shares, adventuring guild charters & bounties). Each faction automatically allocates shares across four expense buckets (**Court and patronage**, **Administration**, **Infrastructure**, **Military**—at least covering regiment block upkeep) plus **Corruption** and **Charter tithe** (15% for `chartered`/`state_arm`).
2. **Treasury** - `Day Balance × 90` (`SEASON_DAYS`) is banked into `faction.treasury`; a negative balance disbands the newest block.
3. **Works** - the faction advances its commissioned asset, or commissions the best one its track, era and purse allow (see above).
4. **Muster** - a faction under strength and funded musters one roster block per season, gated on goods like a state's.
5. **Influence** - temples and chanceries grow influence with the court's spending; charters pay their patron.

**Tactically** the factions use the same ArmyBlock[] regiments, keyed {id}-{regimentId}, as states: they engage enemy state or rival faction armies, siege burgs, strike cities in range, and replenish in their own towns. A successful sovereign-ambition siege or an entrenched hostile faction ascends into a sovereign state; state-arm agencies defect when their patron's unravel passes 60, and rival outposts clash for turf influence.

The legacy flat economy (instant asset purchases, teleport raids) is retired - assets, musters and raids all flow through treasury, goods and the shared battle engine.

### State Suppression of Hostile Factions

States counter hostile or clandestine factions in-world instead of only through editor removal. A state whose burgs host a hostile faction node â€” or whose territory contains a wilderness HQ â€” can run a **suppression campaign**: the `suppress_faction` agenda, picked in `chooseAgenda()` after lair/trouble emergencies, or started from the Inspector's **Suppress faction** button.

Auditing one node at a time:

* **Urban nodes** are pressured administratively: each funded season costs the suppressing state `6 + tier × 4` gold from its treasury and, after three funded seasons, deals influence damage based on province order vs the node's secrecy, raises province order, burg unrest and state unravel. A defending faction guard pauses pressure (and repeated stalls strain the state); unguarded low-influence (= 25) or fortified nodes can be stormed directly by the field army through the shared battle engine — victory pillages, failure retreats and delays the campaign.
* **Wilderness strongholds** (HQ with no burg on a state-owned cell) are military-only: there is no host city to queue in, so the field army marches to the HQ cell and storms it once adjacent, under the same guard-first and pillage rules.
* **Pillage consequences:** a razed outpost is skipped from yields/production/culture; a razed HQ relocates to the faction's strongest surviving outpost or dissolves the faction when none remain. Pillaged nodes show a slate crest with a ðŸ’€ badge and a "Pillaged" tooltip; the Outposts & Assets dialog shows per-node influence while the campaign runs.

Lawful `state_arm`, `chartered` and non-hostile factions are never eligible. Schedules, tuning and tests: [`faction-suppression.md`](../plans/faction-suppression.md).

---

### Sovereign State Ascension & Remnants

Factions can evolve into recognized sovereign nations:

* **Urban Coup**: An insurgent faction (rebel front, demagogue, or sinister cult) with overwhelming influence in a restive burg can seize control and proclaim a new State.
* **Wilderness Ascension**: An entrenched hostile faction active for eight or more seasons can overpower nearby settlements or build a fresh capital burg, graduating into a sovereign nation on the map with its own borders, banner, and chronicle entries.
* **State Collapse Remnants**: When an existing State collapses or is conquered, loyalist generals, nobles, or partisans form remnant insurgencies that fight on as clandestine factions.

---

### User Interface and Tools

* **Factions Overview** (_Tools_ â†’ _Factions_): The primary table for viewing, sorting, filtering, editing, and exporting factions to CSV. Columns show yields (Food/Prod/Gold/Sci/Cult/Faith/Hap), total citizens, worked cells, and the HQ production queue head.
* **State Inspector suppression**: for a state, the _Suppression_ section lists every eligible hostile faction node (with influence and a wilderness tag for burg-less HQs) and a **Suppress faction** command; the agenda reads "Suppressing {faction} in {burg or the wildlands}".
* **Faction Editor & Manage Dialog**: Inspect or customize an organization's emblem, category, archetype, alignment, values, patron state, outposts, and military regiments. The **Manage Outposts & Assets** dialog displays a state-style daily **Revenue | Expenses** ledger (category revenue streams, 4 expense buckets, **Day Balance**, **Corruption**, and **Charter tithe**) above the **HQ & Outposts**, **Assets** (with FMG-native host town, market-cut, order, and unrest effects), and **Forces** tabs.
* **Burg Editor Outposts Inspector**: In the Burgs Editor, inspect all resident faction HQs/outposts at that burg â€” citizens, worked cells, city yields and production queue, plus local influence and secrecy.
* **Map Layer (`#factions`, Hotkey: `Shift+F`)**: Displays faction HQ badges, outpost pins, and field regiments on the SVG map.
* **Living HUD**: The god-mode inspector intervenes in the simulation â€” spark rebellions, smite rulers, resolve troubles, assault lairs, promote emergent states â€” and the **Suppression** section orders a state to campaign against a hostile faction.
