## Factions: Non-State Organizations, Outposts and Emergent Power

The **Factions** system introduces first-class, non-territorial organizations that operate across, within, and beneath the borders of sovereign states. While states claim Voronoi cells and draw colored borders, factions project power through **Headquarters (HQs)**, a network of **Outposts** in settlements, upgradeable **Assets**, and their own **Militaries** and **Advancement**.

Factions unify peaceful commercial guilds, religious inquisitions, knightly orders, and state agencies with underworld syndicates, rebel fronts, and hostile wild lairs under a single simulation engine.

---

### Categories and Archetypes

Factions span six broad categories and 24 archetypes:

| Category | Archetypes | Typical Legality | Typical HQ | Primary Focus |
| :--- | :--- | :--- | :--- | :--- |
| **1. Commercial & Civic** | `merchant_company`, `bank_consortium`, `craft_guild`, `smuggler_free_traders` | Autonomous or Chartered | Port or Market Burg | Wealth accumulation, trade expansion, market infrastructure |
| **2. Martial & Adventuring** | `adventurer_guild`, `mercenary_company`, `knightly_order`, `ranger_wardens` | Autonomous or Chartered | Citadel Burg or Border Keep | Monster hunting, expeditions, mercenary contracts, relic recovery |
| **3. Underworld & Illicit** | `thieves_guild`, `assassin_brotherhood`, `brigand_band`, `pirate_fleet`, `gang_syndicate` | Clandestine or Hostile | Burg Shanty or Coastal Haven | Siphoning wealth, smuggling, shadow contracts, increasing unrest |
| **4. Religious & Occult** | `monastic_order`, `inquisition`, `heretical_sect`, `sinister_cult`, `doomsday_cult`, `arcane_cabal`, `necromantic_circle` | State-Arm, Autonomous, or Clandestine | Temple Burg or Ruin Marker | Faith, arcane research, heresy suppression, forbidden rituals |
| **5. Political & State-Arm** | `royal_agency`, `colonial_governorate`, `noble_faction`, `rebel_front`, `exiled_claimant`, `peasant_commune`, `mutinous_garrison` | State-Arm or Insurgent | Capital Burg or Provincial Castle | Internal order, political influence, state coups, succession wars |
| **6. Warlord & Wilder Lair** | `rogue_warlord`, `marauder_horde`, `exiled_clan_hold`, `xenophobic_enclave`, `ancient_evil`, `planar_rift`, `monster_brood` | Hostile or Sovereign-Aspirant | Wilderness Marker or Dungeon Cell | Plunder raids, territorial expansion, emergent state ascension |

---

### Operational Scales and Reach

Unlike sovereign states whose power scales with tile count, a faction's operational reach is governed by its **Scale**:

* **`burg`** — Local footprint (HQ plus up to 1 outpost, 1 military regiment). Solitary bandit camps, town craft guilds, local cult cells, and solitary wizard towers.
* **`province`** — Regional footprint (2–4 outposts, 1–2 regiments). Regional merchant leagues, provincial brigand bands, and border knight chapters.
* **`state`** — Realm-wide footprint (5–10 outposts, 2–4 regiments). Chartered national companies, royal inquisitions, and prominent noble leagues.
* **`world`** — Continental or global footprint (10+ outposts, 4–8 regiments). International banking houses, grand adventurers' guilds, and world-spanning shadow cabals.

> **Dynamic Scale Calculation:** Scale is not statically assigned; it is dynamically calculated from the faction's real footprint: active outposts, geographic span across provinces and states, number and tier of constructed assets, researched technologies, and accumulated treasury.

---

### Headquarters and Outposts

Every HQ and outpost is an embedded [`BurgSimState`](#) city-node (`citizens`, `workedCells`, `foodStored`/`cultureStored`, `productionQueue`, `civBuildings`, `cityYields`, `hp`/`maxHp`): wilderness HQs simulate in place without creating a `pack.burgs` entry until ascension promotes them to a sovereign burg/state. Every faction maintains a single primary base:
* **Urban Headquarters**: Situated in a populated burg or capital, benefiting from local commerce and population.
* **Wilderness Headquarters**: Anchored to a danger marker (`dungeon`, `lair`, `ruins`, `cave`, `volcano`, etc.), serving as a stronghold for hostile warbands, cults, or outcasts.

A faction expands into settlements within its reach by establishing **Burg Outposts**. Multiple factions can co-exist within the same settlement, competing for influence:
* **Outpost Tier**: Tiers 1 through 3, unlocking additional asset slots and resilience.
* **Influence (0–100%)**: The faction's share of local political, economic, or shadow leverage in the burg.
* **Secrecy**: Clandestine outposts operate covertly to avoid detection and state crackdowns.

---

### Faction Assets

Factions construct buildings at their HQ and outposts across six tracks (18 distinct structures) using the unified OpenCiv production system. The old `FACTION_ASSETS_CATALOG` is now a backward-compatible view over `CIV_BUILDINGS`: every faction asset is a standard `CivBuildingDef` with production `cost`, gold `maintenance`, `requiredTech` and yield `stats`, and factions build them alongside OpenCiv staples (`walls`, `market`, `library`, `workshop`, `forge`, `temple`):

| Track | Tier 1 | Tier 2 | Tier 3 | Primary Benefits |
| :--- | :--- | :--- | :--- | :--- |
| **Commerce** | Counting House | Trading Enclave | Merchant Bank | +Gold per season, boost to burg trade yields |
| **Underworld** | Safehouse | Smuggler Den | Shadow Syndicate | +Gold (siphoned), +Influence, +Burg unrest |
| **Holy** | Chapel | Sanctuary | Cathedral Chapter | +Faith, +Influence, +Burg public order |
| **Martial** | Training Yard | Armory | Citadel Bastion | +Regiment muster capacity, +Burg defense |
| **Arcane** | Scriptorium | Laboratory | Arcane Sanctum | +Science per season, tech research speed |
| **Statecraft** | Embassy | Chancery | Grand Chancellery | +Diplomatic influence, patron state stability |

Buildings are produced from city-node `production` (Production queue), not bought outright with treasury; `hurryProduction()` can rush them for gold.

---

### The Living World Simulation

Factions run on the same OpenCiv engine as states and burgs. Every **HQ and outpost is a city-node** (`BurgSimState`) that works cells, gathers the seven yields, grows citizens, and produces buildings and units.

When the Living World advances each season (`Living.tick()`):

1. **City-Node Loop** — Each HQ/outpost competes for worked cells with the host burg and rival factions within 3 hops. Allegiance decides the draft: `state_arm` works after the state (cooperative), `chartered` alternates after the state's food floor and pays a 15% tithe, `autonomous` interleaves by local `influence` vs state `order`, `clandestine`/`hostile` pre-draft and siphon up to 50% of the host burg's centre gold. Food surplus grows citizens (`15 + 8 × citizens`), culture raises `influence` (urban) or claims wilderness territory (wilderness HQ), and production completes buildings/units.
2. **Empire Rollup** — Yields are summed across HQ + outposts (science via library/university multipliers), minus building maintenance and army upkeep, banked into the faction treasury (negative treasury disbands the newest block). Happiness is `9 + 4 × unique worked luxuries + buildings − 3 per node − citizens`. Research advances on the 80-tech OpenCiv tree with +25% host-state spillover, plus free technologies.
3. **Tactical Layer** — Utility and combat regiments use the same 1UPT / `ArmyBlock[]` system as states, keyed `f{id}-{regimentId}`:
   * **Builders** improve unimproved cells worked by the faction.
   * **Settlers/Envoys** march to target burgs and found outposts on arrival (no teleport expansion).
   * **Combat armies** engage enemy State or rival Faction armies (`resolveArmyBattle()`), pillage tiles, and siege burgs — a successful sovereign-ambition siege triggers state ascension.
   * State-arm agencies defect when their patron's `unravel >= 60`; rival outposts still clash for turf influence.

The legacy flat economy (`outpost.tier * 2`, instant gold asset purchases, teleport raids, `u: { spear: 50 }` musters) is retired — assets, units and outposts all flow through the production/tactical queues.

---

### State Suppression of Hostile Factions

States counter hostile or clandestine factions in-world instead of only through editor removal. A state whose burgs host a hostile faction node — or whose territory contains a wilderness HQ — can run a **suppression campaign**: the `suppress_faction` agenda, picked in `chooseAgenda()` after lair/trouble emergencies, or started from the Inspector's **Suppress faction** button.

Auditing one node at a time:

* **Urban nodes** are pressured through a `faction-suppression` production operation queued in the host burg (`6 + tier × 4` Production, never Gold; gold only hurries via `hurryProduction()`, keeping its reserve). Each completed operation deals `max(1, floor((provinceOrder − nodeSecrecy) / 20))` influence damage, raises province order, burg unrest and state unravel. A defending faction guard pauses pressure (and repeated stalls strain the state); unguarded low-influence (≤ 25) or fortified nodes can be stormed directly by the field army through the shared battle engine — victory pillages, failure retreats and delays the campaign.
* **Wilderness strongholds** (HQ with no burg on a state-owned cell) are military-only: there is no host city to queue in, so the field army marches to the HQ cell and storms it once adjacent, under the same guard-first and pillage rules.
* **Pillage consequences:** a razed outpost is skipped from yields/production/culture; a razed HQ relocates to the faction's strongest surviving outpost or dissolves the faction when none remain. Pillaged nodes show a slate crest with a 💀 badge and a "Pillaged" tooltip; the Outposts & Assets dialog shows per-node influence and suppression progress.

Lawful `state_arm`, `chartered` and non-hostile factions are never eligible. Schedules, tuning and tests: [`faction-suppression.md`](../../plans/faction-suppression.md).

---

### Sovereign State Ascension & Remnants

Factions can evolve into recognized sovereign nations:

* **Urban Coup**: An insurgent faction (rebel front, demagogue, or sinister cult) with overwhelming influence in a restive burg can seize control and proclaim a new State.
* **Wilderness Ascension**: An entrenched warlord or wilder lair active for eight or more seasons can overpower nearby settlements or build a fresh capital burg, graduating into a sovereign nation on the map with its own borders, banner, and chronicle entries.
* **State Collapse Remnants**: When an existing State collapses or is conquered, loyalist generals, nobles, or partisans form remnant insurgencies that fight on as clandestine factions.

---

### User Interface and Tools

* **Factions Overview** (_Tools_ → _Factions_): The primary table for viewing, sorting, filtering, editing, and exporting factions to CSV. Columns show yields (Food/Prod/Gold/Sci/Cult/Faith/Hap), total citizens, worked cells, and the HQ production queue head.
* **State Inspector suppression**: for a state, the _Suppression_ section lists every eligible hostile faction node (with influence and a wilderness tag for burg-less HQs) and a **Suppress faction** command; the agenda reads "Suppressing {faction} in {burg or the wildlands}".
* **Faction Editor Dialog**: Inspect or customize an organization's emblem, category, archetype, alignment, values, patron state, outposts, and military regiments. The Outposts & Assets dialog shows per-node citizens, worked cells, city yields and the full production queue for the HQ and each outpost.
* **Burg Editor Outposts Inspector**: In the Burgs Editor, inspect all resident faction HQs/outposts at that burg — citizens, worked cells, city yields and production queue, plus local influence and secrecy.
* **Map Layer (`#factions`, Hotkey: `Shift+F`)**: Displays faction HQ badges, outpost pins, and field regiments on the SVG map.
* **Living HUD**: The god-mode inspector intervenes in the simulation — spark rebellions, smite rulers, resolve troubles, assault lairs, promote emergent states — and the **Suppression** section orders a state to campaign against a hostile faction.
