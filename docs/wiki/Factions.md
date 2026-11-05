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

Every faction maintains a single primary base:
* **Urban Headquarters**: Situated in a populated burg or capital, benefiting from local commerce and population.
* **Wilderness Headquarters**: Anchored to a danger marker (`dungeon`, `lair`, `ruins`, `cave`, `volcano`, etc.), serving as a stronghold for hostile warbands, cults, or outcasts.

A faction expands into settlements within its reach by establishing **Burg Outposts**. Multiple factions can co-exist within the same settlement, competing for influence:
* **Outpost Tier**: Tiers 1 through 3, unlocking additional asset slots and resilience.
* **Influence (0–100%)**: The faction's share of local political, economic, or shadow leverage in the burg.
* **Secrecy**: Clandestine outposts operate covertly to avoid detection and state crackdowns.

---

### Faction Assets

Factions construct and upgrade specialized assets at their HQ and outposts across six tracks (18 distinct structures):

| Track | Tier 1 | Tier 2 | Tier 3 | Primary Benefits |
| :--- | :--- | :--- | :--- | :--- |
| **Commerce** | Counting House | Trading Enclave | Merchant Bank | +Gold per season, boost to burg trade yields |
| **Underworld** | Safehouse | Smuggler Den | Shadow Syndicate | +Gold (siphoned), +Influence, +Burg unrest |
| **Holy** | Chapel | Sanctuary | Cathedral Chapter | +Faith, +Influence, +Burg public order |
| **Martial** | Training Yard | Armory | Citadel Bastion | +Regiment muster capacity, +Burg defense |
| **Arcane** | Scriptorium | Laboratory | Arcane Sanctum | +Science per season, tech research speed |
| **Statecraft** | Embassy | Chancery | Grand Chancellery | +Diplomatic influence, patron state stability |

---

### The Living World Simulation

When the Living World advances each season (`Living.tick()`):

1. **Economy & Yields**: Factions collect seasonal revenue (`Gold`, `Science`, `Influence`) from their HQ, outposts, built assets, and patron subsidies.
2. **Civic Tech Advancement**: Factions research technologies from the OpenCiv tech tree. Host burgs receive a `+25%` science spillover bonus from scholarly faction assets.
3. **Autonomous Agendas**: Factions autonomously pursue agendas based on their category, alignment, and expansionism:
   * **Outpost Expansion**: Spreading along trade routes to prosperous or vulnerable settlements.
   * **Asset Upgrades**: Investing treasury into higher-tier structures.
   * **Turf Clashes**: Clashing with rival outposts sharing the same burg for dominance.
   * **State Defection**: State-arm agencies or noble factions may defect and turn insurgent if their patron state's unravel exceeds threshold (`unravel >= 60`).
4. **Seasonal Raids**: Hostile warlords and wilder lairs launch raids against neighboring provinces and trade roads, resolved through the combined-arms battle simulator.

---

### Sovereign State Ascension & Remnants

Factions can evolve into recognized sovereign nations:

* **Urban Coup**: An insurgent faction (rebel front, demagogue, or sinister cult) with overwhelming influence in a restive burg can seize control and proclaim a new State.
* **Wilderness Ascension**: An entrenched warlord or wilder lair active for eight or more seasons can overpower nearby settlements or build a fresh capital burg, graduating into a sovereign nation on the map with its own borders, banner, and chronicle entries.
* **State Collapse Remnants**: When an existing State collapses or is conquered, loyalist generals, nobles, or partisans form remnant insurgencies that fight on as clandestine factions.

---

### User Interface and Tools

* **Factions Overview** (_Tools_ → _Factions_): The primary table for viewing, sorting, filtering, editing, and exporting factions to CSV.
* **Faction Editor Dialog**: Inspect or customize an organization's emblem, category, archetype, alignment, values, patron state, outposts, and military regiments.
* **Burg Editor Outposts Inspector**: In the Burgs Editor, inspect all resident faction outposts, their local influence, secrecy, and built assets.
* **Map Layer (`#factions`, Hotkey: `Shift+F`)**: Displays faction HQ badges, outpost pins, and field regiments on the SVG map.
* **Living HUD & Player Guild**: Choose any faction as your **Player Faction** to guide its contracts, hero missions, relic vaults, and expeditions, or observe autonomously in God Mode.
