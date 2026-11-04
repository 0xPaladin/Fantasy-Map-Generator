# Astral Cartographer

> **Science fiction star-sector cartography and interstellar worldbuilding for Azgaar's Fantasy Map Generator.**

---

## Overview

**Astral Cartographer** reimagines Azgaar's Fantasy Map Generator as a procedural science-fiction star sector map tool. Rather than replacing FMG's proven generator and editing workflows, Astral Cartographer maps the core domain into interstellar space:

| Fantasy Map Generator | Astral Cartographer |
|---|---|
| Landmass & coastlines | Sector dust, starfields, and void rifts |
| Elevation & mountains | Star density, nebulae, and stellar hazards |
| Rivers & routes | Hyperspace lanes, trade corridors, and warp gates |
| Burgs | **Star systems** |
| States & polities | Interstellar empires, federations, and syndicates |
| Cultures & religions | Species, civilizations, and philosophical creeds |
| Provinces | Galactic sectors |
| Relief & parchment styles | Star charts, sensor scans, and astrophysics overlays |

## Integrated Content

### Name Bases
12 science-fiction name bases built directly into core data (`src/data/name-bases.ts`):
- **AstralTrek**: `Trek Core`, `Trek Terran`, `Trek Continental`, `Trek Synthetic`
- **AstralJammer**: `Jammer Deep`, `Jammer Ethereal`, `Jammer Stoneborn`, `Jammer Wild`
- **Grimdark**: `Grimdark Core`, `Grimdark Gothic`, `Grimdark Iron`, `Grimdark Machine`

Each base provides rich pools of star system designations, planetary bodies, and polity names.

### Culture Sets
Three dedicated culture sets available directly from the Cultures generator dropdown:
- **AstralTrek** (`astralTrek`): Space-opera civilizations, high-tech federations, and exploratory fleets.
- **AstralJammer** (`astralJammer`): Planar voyagers, void sailors, and spell-jammer astral factions.
- **Grimdark** (`grimdark`): Feudal hive-worlds, gothic crusaders, iron legions, and machine cults.

Each set generates 8 distinct cultures with habitat scoring callbacks mapped to star-map preferences (`temperate`, `harsh`, `remote`, `any`). All three sets are fully supported by options schema validation and persistent option pinning.

## The mapping — polities, sectors and star systems

The content is only half the mapping. The other half is what FMG's own words become on a star map, and it is applied **on demand**, not during generation: a world stays a fantasy world until the author asks for it.

### Applying the naming

_Options_ → _Tools_ → **Astral Names** (or the "Apply Astral Naming" command in the omnibar) does three things:

- **the polities get their words** — a state's word comes from the `polities` group of its own culture's base, so a Trek state becomes a "United Federation" and a Grimdark one a "Compact". A state whose culture names from a stock base keeps FMG's own word, so a mixed map keeps each people's register.
- **the polities are named by the system that holds them** — a state takes the name of its capital, with no fantasy suffix. "Gant", not "Gantia".
- **the provinces become sectors** — "Gant Sector", "Yaxford Reach", "Aulacurus Belt".

The words are picked by a hash of the name, so a polity keeps its word between regenerations, and applying the naming twice changes nothing the second time.

### The star classes

A burg is a star system: a star with a class, a population, and the installations that make it what it is. The class is not a ladder rung but a **roll**: seeded by the map and the burg, drawn from the standard spectral distribution, so a system keeps its star across opens, edits and save/load.

- **Under 10 000 people** the roll is the standard astro distribution — a red-dwarf galaxy, with the comfortable stars behind it and the exotic ones rare:

| Class | Star | Chance |
|---|---|---|
| M | red dwarf — flare-lit, tidal-locked, nobody's idea of a home | 76.6% |
| K | orange dwarf — hardy, long-lived | 12.0% |
| G | yellow dwarf — the Sun-like homeworld, the most habitable there is | 7.6% |
| F | white-yellow star — bright and comfortable | 3.0% |
| A | white star — hot and brilliant | 0.6% |
| B | blue giant — spectacular, and short-lived | 0.13% |

- **At 10 000 and above** the roll narrows to the habitable band, and the busy worlds sit on the comfortable stars: **G 45%, K 30%, F 25%**.

Every reading of a burg — the chart marker, the tooltip, the editor, the generated readout — asks the same seeded question, so they can never disagree. A population edit within a band changes nothing; crossing the 10 000 threshold rerolls the star.

The installations become the system's own: a port is a **shipyard**, a citadel a **bastion**, a plaza a **civic core**, a shanty a **drift**, a temple a **shrine**, walls are **shielding**.

### Astral Goods & Trade

The economy and commodities model aligns with the *Stars Without Number: Suns of Gold* interstellar trade rules:

- **System-level resources**: Interstellar commodities are situated and produced at the **star system** level (`burg.cell`), eliminating scattered rural land deposits and empty-space biome harvesting. Empty space cells produce zero goods.
- **8 World Types**: Every system has one of 8 World Types (`Agricultural`, `Alien`, `Cosmopolitan`, `Decadent`, `Industrial`, `Primitive`, `Savage`, `Tyrannical`), deterministically derived from system traits and spectral class, and customizable in the System Editor via `world-<type>` tags.
- **1d10 Trade Tables**: Each World Type features a 10-commodity trade table governing local export supply bonuses and import demands. Systems roll twice on their trade table to establish their primary and secondary export specialties.
- **34 Standard Commodities**: Measured in metric tons (`ton`), spanning raw planetary resources (`Metawheat`, `Common Metal Ingots`, `Rare Alloys`, `Raw Drugs`, `Pretech Junk`) and manufactured technologies (`Fusion Plants`, `Postech Building Materials`, `Medical Supplies`, `Starship Maintenance Parts`, `Immortality Tech`).
- **On-demand toggle**: The Goods Editor includes an on-demand button to switch between the standard fantasy catalogue and the Astral sci-fi catalogue, recalculating markets and trade lanes without breaking map serialization.

### The Star Systems overview

_Options_ → _Tools_ → **Star Systems** lists every system on the map with its class, its people and its traits; clicking a row zooms to it. In the browser console, `Astral.systems()` returns the same list as data.

### The System Editor

Clicking a star on the chart opens the **System Editor** — the burg read as a system. Rename it,
grow or shrink its population (the class and the star follow), toggle its installations — shipyard,
bastion, shielding, civic core, shrine, drift — make it an empire's capital, move it, or strike it
from the chart. In the Astral view it is the only dialog a system has; the Burg Editor stays where
it belongs, in Standard view. Every write is a burg write, so the world stays one world.

#### What the dialog shows

Below the form, two tables present the system's generated astronomy.

**Star** — one row per star: the primary first, then any companions, each with its spectral class
and luminosity class (`G V` reads as a main-sequence yellow dwarf; companions, which the source
never rolls a class for, show `—`), mass in solar masses, luminosity in solar luminosities and —
companions only — the binary separation in AU and the orbital period in years. A colour dot beside
each class matches the chart's marker colour, and a companion's tooltip carries its mass ratio.
Under the table one line sums the system up: the total mass, the **snow line** — the radius beyond
which water condenses as ice, `2.7 · √L` AU, the divide between the rocky inner worlds and the gas
giants — the planet count, and a "Habitable candidate" tag when a lone F/G/K main-sequence star
earns it.

**Planets** — one row per planet, named by Roman numeral ("Kessel I"), with its type, orbit,
radius, surface gravity, temperature band, atmosphere, water cover, habitability and moon count.
The tooltips carry the units and the details: the orbital period in days, the temperature in °C,
the habitability index (`HI 1` earthlike … `HI 5` inimical) and the moons' names ("Kessel I a",
"Kessel I b", …). The table scrolls inside the dialog, and a system with no planets is a valid
reading — one "No planets detected" row, while the star table above still renders. Every row ends
with a globe button that materializes that world and opens its surface as the active FMG map; gas
giants, which have no surface to map, are refused with a tip.

#### How the readout is generated

The readout is computed when the dialog opens — never during map generation, never at draw time —
by the astro port in `src/generators/astral-system/`. It is a pure function of four inputs: the map
seed, the burg id, the burg's name and its population class.

- **The seed is the storage.** A system's bodies derive from
  `${map seed}/astral/system/${burg id}`, so the same system always reads the same — on every
  open, after every save and load — while nothing at all is persisted: no burg field, no `.map`
  record, no cache. Close the dialog and the generated bodies are garbage-collected with it.
- **The chart's class wins.** The primary's spectral class is the class already rolled for the
  burg, forced onto the generated star and pinned to a main-sequence `V`, so the marker, the
  class line and the star table can never disagree. The astro tables' own spectral weights still
  shape the companions, whose masses, separations (Kepler's third law) and periods roll off the
  star stream.
- **The orbits ride a Titius–Bode ladder** scaled to the system's total mass, capped at ten
  planets. The smalls take the inner slots and the giants the outer ones, with the occasional hot
  giant tucked in close; each world's coarse type — rocky, super-Earth/sub-Neptune, Neptune-like
  or gas giant — comes from its radius.
- **Each world rolls its own detail off its own seed stream** — planet `${seed}/${i}`, moon
  `${seed}/${i}/${j}` — so radius, density, atmosphere, hydrographics and habitability (rough
  black-body physics) never shift because a neighbour was added or changed. The coarse rocky/giant
  split drives each world's physical roll; the generator's own finer pre-classification is what the
  table shows as its type.

Renaming the system relabels its planets without moving a single orbit. A population edit within
the same class changes nothing; crossing a class threshold changes the primary's class and rerolls
the system — exactly as it already recolours and resizes the marker. The full design, port map and
test list are in [`docs/plans/astral-system-details.md`](../plans/astral-system-details.md).

#### Opening worlds

The readout is not just a table. The dialog footer carries a **3D System** button, and every planet
row carries a smaller globe button of its own — both roll the generated system into a place you
can map.

- **The 3D System button** opens the whole system in a Three.js orrery: the star tinted by its
  spectral class, every planet on its Kepler orbit line with sprite labels carrying archetype
  badges and controlling-state colours, and rings on the gas giants. A click focuses a body and
  opens an inspector — classification, gravity, temperature, atmosphere, hydrographics,
  habitability, and for a settled world its population, settlements, spaceports and states.
  A double-click generates that world and lands on its surface.
- **A planet's own globe button** materializes just that world — the full generation pipeline runs
  off the planet's seed with its archetype's climate — and leaves its surface as the active FMG
  map, ready to edit, label and save like any other. Gas giants are refused with a tip, having no
  surface to map.

Both buttons roll the registry from the same seed as the readout (`${map
seed}/astral/system/${burg id}`, the burg's spectral class forced onto the primary), so the table
and the worlds agree one to one. Re-rolling the same system keeps every already materialized
world.

#### Moving between views

The Astral view is a three-level hierarchy, and every level has a way back:

1. **Sector View** — the Astral star chart itself. The top of the hierarchy: entering the Astral
   view always lands here, and the chart always draws over the **origin map** — the FMG world the
   session started from, no matter how many planets were visited since.
2. **System View** — the 3D orrery, opened from the System Editor's **3D System** button.
3. **Planet View** — a single world's surface as the standard, editable FMG flat map. Both ways
   down (the orrery's double-click and its **Open globe** button, and the dialog's planet row
   button) land in the standard view so the world is immediately editable. Moons are listed in
   the readout but not drawn in the orrery.

While a system or planet view is open, the view-mode area under the layers panel shows two back
buttons:

- **Back to Sector** — restores the origin map and returns to the star chart. Available at every
  level below the Sector View; there is always a way home.
- **Back to System** — from a planet, re-opens the orrery for its system without regenerating
  anything (already materialized worlds come back as they were).

The **Astral** button hides itself while the chart is on — the **Standard** button is the exit
back to the flat map, and it brings the Astral button back with it. Leaving the chart in any way
resets the hierarchy to the Sector View, and `FMG.SolarSystem.returnToOrigin()` does the same
restore from the console.

#### The colonized solar system

The System Editor's readout describes the system; the colonized solar system makes it a set of
places. Each rocky planet and moon can be materialized as a full FMG world — a pure fantasy map
in every byte — and the whole system can be toured in the orrery. `SolarSystem` (also on the
console as `FMG.SolarSystem`) is the registry that holds it all: one body per world with its
designation name, surface archetype, Kepler orbit readouts and a snapshot once materialized.

**Archetypes & climate.** Every rocky body resolves to a surface archetype from its
astrophysics — `HI 1` is terran; hot or corrosive worlds are volcanic; cold, wet and toxic worlds
are titan; cold worlds are icy moons; airless rock is lunar; everything else is martian. The
archetype rides on `options.map.geography`, and its absence means terran, so every existing map
and `.map` file behaves exactly as before. Materializing a body syncs the climate to it:
full-globe coordinates, pole-to-equator temperatures that spread narrow under a thick atmosphere
and wide under a trace one, and precipitation scaled from hydrographics. Rivers form everywhere
except the airless, icy and volcanic worlds; enclosed lakes default to lava on volcanic worlds
and to ice under icy moon shells.

**Exo-biomes.** When the archetype is not terran, generation appends fifteen planetary biomes at
`pack.biomes` 13..27 — Basalt Mare, Anorthosite Highlands, Crater Ejecta Ridge, Shadowed Polar
Ice Crater, Ferric Regolith Plains, Oxide Dune Sea, Tharsis Basalt Shield, Polar CO₂/Water Ice
Cap, Smooth Ice Shell, Chaos Ice Matrix, Thermal Lineae Rift, Hydrocarbon Dune Band,
Cryo-Bedrock Plains, Basalt Flood Plain, Sulfur Fumarole/Caldera — classified per cell by
height, moisture, temperature and latitude. Wet, warm martian basins fall through to the
terrestrial matrix, so terraformed coasts grow green inside the red. Biomes 0..12 stay untouched,
and the tables round-trip through vanilla save and load byte for byte.

**Planetary heightmaps.** Five templates materialize the archetypes: `lunarWorld` (cratered
regolith over dry maria), `martianWorld` (southern highlands, a Valles Marineris-style rift and
Tharsis shields), `icyMoon` (lineae rifts over a smooth shell), `titanWorld` (dune bands and
polar hydrocarbon lakes) and `volcanicWorld` (flood basalts and calderas). A new `Crater`
template tool composes a raised ejecta rim, an excavated bowl and — for deep impacts — a central
rebound peak, and `smoothSeam` blends the map edges so dry globes stay continuous across the
antimeridian. All five carry probability 0: standard fantasy rolls never pick them.

**What the orrery draws.** The star, the planets, their orbit lines and rings; moons stay in the
readout table and out of the 3D scene, keeping the system view readable at compressed orbital
scales. The scene is presentation-only — the one mutation is the switch you asked for.

The full design is in [`docs/plans/solar-system-colonization.md`](../plans/solar-system-colonization.md).

### The anomalies

Markers become **anomalies** on the chart: a volcano is read as **nova remnants**, an inn as a
**way station**, a dungeon as a **derelict**, a sea monster as a **void kraken**. Every reading is
either a phenomenon of space or of a scale that matters to multi-system polities — the Anomalies
layer shows what an empire would mark, claim, garrison or fear, never a planetary micro-feature.

The reading is a view: in the Astral view the pins take their anomaly icons, the tooltips name
the reading, and the note box tells the anomaly's own legend instead of the fantasy prose; leaving
restores the map exactly, and the marker keeps its type. A renamed kind gets a new icon — a bridge
is a **lane span** 🏗️, a lighthouse a **beacon relay** 📡 — while a kind that keeps its word keeps
its icon. A marker with a hand-picked icon keeps it in both views.

_Options_ → _Tools_ → **Astral Anomalies** is the conversion: it rewrites every marker's legend in
the sector register and sets its anomaly icon in the record. The original text is kept below a
divider, authored names survive, and applying it twice changes nothing the second time. It is
one-way — the converted icon lives in the marker, so Standard view shows it too.

## The Astral view

_Options_ → _Layers_ → **View mode** → **Astral** turns the map into a star chart of one chosen
sector. The fantasy layer buttons are replaced by the Astral list — Sector Dust, Nebulae, Star
Density, Systems, Empires, Sectors, Borders, Hyperlanes, Anomalies and Labels — and the map takes the
Astral style: the void becomes deep space, the land becomes a starry dust sheet, nebulae and a
stellar-density heatmap appear, and every burg is drawn as a class-coloured star. There is no
galactic core or spiral arm. Leaving the mode restores the previous layers and style.

The full design is in [`docs/plans/astral-ui-overhaul.md`](../plans/astral-ui-overhaul.md).

## In-Tree Roadmap

As detailed in [`docs/plans/mod-merge-plan.md`](../plans/mod-merge-plan.md):
- **Phase A (Shipped)**: Core name bases, culture sets, and schema validation.
- **Phase D (Shipped)**: The mapping — polity and sector naming, the star classes and traits, and the Star Systems overview.
- **Shipped (Phase 1)**: The Astral view button, the mode-aware layer list and presets, the
  `options.map.astral` mode flag, and the three Astral layer slots.
- **Shipped (Phase 2)**: The `astral` style preset, the sector-dust and void starfields, and the
  nebula/density/system style sections.
- **Shipped (Phase 3)**: The nebula renderer (seeded cloud clusters) and the stellar-density
  heatmap (a population-weighted kernel over the burgs, banded on the cell graph).
- **Shipped (Phase 4)**: The star systems drawn as class-coloured markers on the chart, with the
  tooltip, click-to-edit, reveal and highlight seams, capital rings and port orbit ticks.
- **Shipped (Phase 5)**: Polish and docs — the e2e coverage, the one-per-session "apply Astral
  naming" hint, the second `astralSchematic` blueprint preset, and the README, wiki and merge
  checklist. The design is in [`docs/plans/astral-ui-overhaul.md`](../plans/astral-ui-overhaul.md).
- **Shipped (terrain layers)**: the terrain reads — Dust Density, Composition, Core–Rim (Remnants removed).
  The design is in [`docs/plans/astral-terrain-layers.md`](../plans/astral-terrain-layers.md).
- **Removed (currents)**: the rivers are not drawn in Astral — the currents re-read was dropped on
  2026-10-26 so the chart reads as a chart, not a river map.
- **Shipped (system dialog)**: clicking a star opens the System Editor — the burg read as a system,
  edited in the astral vocabulary, every write a burg write. The design is in
  [`docs/plans/astral-system-dialog.md`](../plans/astral-system-dialog.md).
- **Shipped (system readout)**: the System Editor shows the generated stars and planets — a lazy,
  stateless astro port seeded by the map and the burg. The design is in
  [`docs/plans/astral-system-details.md`](../plans/astral-system-details.md).
- **Shipped (anomalies)**: the markers read as anomalies — space phenomena and interstellar-scale
  concerns — with anomaly icons and a conversion action that rewrites legends and icons in state,
  keeping the original text. The design is in
  [`docs/plans/astral-anomalies.md`](../plans/astral-anomalies.md).
- **Shipped (colonized solar system)**: the Crater primitive and the five planetary heightmap
  templates, the planetary archetypes with climate sync and the 13..27 exo-biomes, the
  `SolarSystem` multi-body registry with `switchBody` and the Sol preset, and the 3D orrery —
  opened from the System Editor, with per-planet FMG access and a pure-FMG compatibility
  guarantee on every world. The design is in
  [`docs/plans/solar-system-colonization.md`](../plans/solar-system-colonization.md).
- **Shipped (view hierarchy)**: the Astral view is a three-level hierarchy — Sector (star chart,
  always over the origin map) → System (orrery) → Planet (standard editable flat map) — with
  Back to Sector / Back to System buttons under the layers panel, the Astral button hiding while
  the chart is on, and every planet view landing in the standard editable map. The design is in
  [`docs/plans/solar-system-colonization.md`](../plans/solar-system-colonization.md).

---
*For upstream merge tracking, see [MERGING.md](../../MERGING.md).*
