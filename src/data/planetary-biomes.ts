// Planetary biomes for colonized solar-system bodies, appended to pack.biomes at the fixed
// indices 13..27 whenever the map has a non-terran archetype. The indices are part of the data
// contract: saved .map files stay 100% vanilla-FMG compatible and IDs are stable across
// archetypes, so a martian body classifies into 17..20 even though 13..16 (lunar) also exist
// in its biome table. See docs/plans/solar-system-colonization.md §4.3.
import type { Biome } from "@/model/physical/biomes-generator";

/** first planetary biome index; 0..12 are the built-in terrestrial biomes */
export const PLANETARY_BIOMES_START = 13;

type PlanetaryBiomeData = Omit<Biome, "iconsDensity" | "icons"> & { iconsDensity?: number; icons?: Biome["icons"] };

const weight = (pool: Record<string, number>): Biome["icons"] =>
  Object.fromEntries(Object.entries(pool).map(([entry, value]) => [entry, { weight: value }]));

const data: PlanetaryBiomeData[] = [
  // lunar: airless cratered regolith (Luna, Mercury, Callisto)
  { i: 13, archetype: "lunar", name: "Basalt Mare", color: "#3d3c42", habitability: 18, cost: 40 },
  {
    i: 14,
    archetype: "lunar",
    name: "Anorthosite Highlands",
    color: "#8c8b90",
    habitability: 5,
    cost: 90,
    iconsDensity: 40,
    icons: weight({ dune: 1 })
  },
  { i: 15, archetype: "lunar", name: "Crater Ejecta Ridge", color: "#b5b4bc", habitability: 2, cost: 200 },
  { i: 16, archetype: "lunar", name: "Shadowed Polar Ice Crater", color: "#99c5d6", habitability: 85, cost: 60 },
  // martian: cold ferric desert (Mars)
  {
    i: 17,
    archetype: "martian",
    name: "Ferric Regolith Plains",
    color: "#c16641",
    habitability: 16,
    cost: 50,
    iconsDensity: 35,
    icons: weight({ dune: 2 })
  },
  {
    i: 18,
    archetype: "martian",
    name: "Oxide Dune Sea",
    color: "#a34828",
    habitability: 6,
    cost: 120,
    iconsDensity: 20,
    icons: weight({ dune: 8 })
  },
  { i: 19, archetype: "martian", name: "Tharsis Basalt Shield", color: "#6e3524", habitability: 3, cost: 250 },
  { i: 20, archetype: "martian", name: "Polar CO₂ / Water Ice Cap", color: "#e8ded5", habitability: 45, cost: 150 },
  // icy_moon: fractured ice shell (Europa, Enceladus, Ganymede)
  { i: 21, archetype: "icy_moon", name: "Smooth Ice Shell", color: "#d8e8f0", habitability: 6, cost: 70 },
  { i: 22, archetype: "icy_moon", name: "Chaos Ice Matrix", color: "#9bb8c9", habitability: 14, cost: 140 },
  { i: 23, archetype: "icy_moon", name: "Thermal Lineae Rift", color: "#4f86a6", habitability: 80, cost: 40 },
  // titan: cryogenic hydrocarbon world (Titan)
  {
    i: 24,
    archetype: "titan",
    name: "Hydrocarbon Dune Band",
    color: "#7a5c38",
    habitability: 8,
    cost: 100,
    iconsDensity: 20,
    icons: weight({ dune: 6 })
  },
  { i: 25, archetype: "titan", name: "Cryo-Bedrock Plains", color: "#9e9589", habitability: 22, cost: 60 },
  // volcanic: caldera and lava world (Io, Venusian)
  { i: 26, archetype: "volcanic", name: "Basalt Flood Plain", color: "#2b2626", habitability: 12, cost: 80 },
  { i: 27, archetype: "volcanic", name: "Sulfur Fumarole / Caldera", color: "#d4b838", habitability: 4, cost: 200 }
];

/** biome table entries 13..27, kept immutable; the generator stores shallow copies in pack.biomes */
export const PLANETARY_BIOMES: Biome[] = data.map(({ iconsDensity, icons, ...biome }) => ({
  ...biome,
  iconsDensity: iconsDensity ?? 0,
  icons: icons ?? {}
}));
