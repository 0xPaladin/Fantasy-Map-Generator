// The public works a ruler can fund (living-fmg-native.md phase 4): a small,
// era-gated catalog paid in treasury and real goods from the map's markets.

import type { ProjectScale } from "@/types/living";

export interface ProjectGoodCost {
  name: string;
  units: number;
}

/** What a finished work writes into the rails. */
export interface ProjectEffect {
  /** a daily line on the target (burg) or state; name gets the target's name */
  line?: { label: string; value: number };
  /** development added to the target province's peopled cells */
  development?: number;
  /** percentage points taken off the state's stored corruption */
  corruption?: number;
  /** a native burg flag raised on the target burg */
  burgFlag?: "walls" | "citadel" | "plaza" | "temple" | "port";
  /** sets land improvements on the province's peopled cells */
  improvement?: boolean;
  /** links the state's disconnected burgs to the route network */
  route?: boolean;
  /** charters the target burg as a market center */
  market?: boolean;
  /** the state's forces replenish faster */
  militaryCamp?: boolean;
}

export interface ProjectDef {
  id: string;
  name: string;
  astralName?: string;
  description: string;
  astralDescription?: string;
  scale: ProjectScale;
  /** the people's mean development that unlocks the work */
  minDevelopment: number;
  /** seasons of construction */
  seasons: number;
  /** banked treasury paid when construction starts */
  treasury: number;
  goods?: ProjectGoodCost[];
  astralGoods?: ProjectGoodCost[];
  /** burg-scale work that needs the sea at its door */
  needsCoast?: boolean;
  effect: ProjectEffect;
  /** how a ruler's temperament favours commissioning it */
  affinity?: Partial<Record<"martial" | "civic" | "pious" | "cruel", number>>;
}

export const PROJECTS: readonly ProjectDef[] = [
  {
    id: "granary",
    name: "Granary",
    astralName: "Biosilo & Hydroponics Array",
    description: "Stores the province's harvest against a lean season.",
    astralDescription: "Stores the sector's synth-yields against orbital blockades or lean cycles.",
    scale: "province",
    minDevelopment: 6,
    seasons: 2,
    treasury: 80,
    goods: [
      { name: "Wood", units: 6 },
      { name: "Clay", units: 4 }
    ],
    astralGoods: [
      { name: "Colonial Materials", units: 6 },
      { name: "Metawheat", units: 4 }
    ],
    effect: { line: { label: "Granary", value: 2 } },
    affinity: { civic: 1, pious: 0.5 }
  },
  {
    id: "aqueduct",
    name: "Aqueduct",
    astralName: "Atmospheric & Life-Support Grid",
    description: "Brings clean water into the streets and workshops.",
    astralDescription: "Distributes scrubbed air, water and thermal power across habitats.",
    scale: "burg",
    minDevelopment: 9,
    seasons: 2,
    treasury: 90,
    goods: [
      { name: "Stone", units: 8 },
      { name: "Clay", units: 5 }
    ],
    astralGoods: [
      { name: "Postech Building Material", units: 6 },
      { name: "Colonial Materials", units: 4 }
    ],
    effect: { line: { label: "Aqueduct", value: 3 } },
    affinity: { civic: 1.2, pious: 0.3 }
  },
  {
    id: "royal_road",
    name: "Royal Road",
    astralName: "Hyperlane Relay & Transit Corridor",
    description: "Links the realm's towns to the road network.",
    astralDescription: "Links the polity's settlements to the orbital and hyperlane transit grid.",
    scale: "state",
    minDevelopment: 12,
    seasons: 2,
    treasury: 120,
    goods: [
      { name: "Wood", units: 6 },
      { name: "Stone", units: 6 }
    ],
    astralGoods: [
      { name: "Postech Building Material", units: 5 },
      { name: "Colonial Materials", units: 5 }
    ],
    effect: { line: { label: "Royal roads", value: 2 }, route: true },
    affinity: { civic: 1, martial: 0.6 }
  },
  {
    id: "market_charter",
    name: "Market Charter",
    astralName: "Freeport Exchange Charter",
    description: "Charters the town as a market in its own right.",
    astralDescription: "Charters the starport as a recognized interstellar exchange hub.",
    scale: "burg",
    minDevelopment: 6,
    seasons: 2,
    treasury: 150,
    effect: { line: { label: "Market charter", value: 3 }, market: true },
    affinity: { civic: 1.2, cruel: 0.3 }
  },
  {
    id: "mint",
    name: "Mint",
    astralName: "Quantum Clearinghouse",
    description: "Strikes the realm's coin and takes its seigniorage.",
    astralDescription: "Clears interstellar credits and energy-compute ledgers.",
    scale: "state",
    minDevelopment: 18,
    seasons: 2,
    treasury: 140,
    goods: [
      { name: "Copper", units: 4 },
      { name: "Tools", units: 2 }
    ],
    astralGoods: [
      { name: "Metal Ingots, Rare Alloys", units: 3 },
      { name: "Tools, Industrial", units: 2 }
    ],
    effect: { line: { label: "Mint", value: 4 } },
    affinity: { civic: 0.8, cruel: 0.4 }
  },
  {
    id: "courthouse",
    name: "Courthouse",
    astralName: "Sector Tribunal & Audit Core",
    description: "Judges and clerks cut the officials' graft.",
    astralDescription: "Arbiters and VI audit cores curb administrative graft.",
    scale: "province",
    minDevelopment: 18,
    seasons: 2,
    treasury: 90,
    goods: [{ name: "Stone", units: 5 }],
    astralGoods: [{ name: "Postech Building Material", units: 4 }],
    effect: { line: { label: "Courthouse", value: 1 }, corruption: 2 },
    affinity: { civic: 1.2, pious: 0.3 }
  },
  {
    id: "harbor_works",
    name: "Harbor Works",
    astralName: "Orbital Starport Berths",
    description: "Docks, cranes and a lighthouse open the town to the sea.",
    astralDescription: "Docking gantries, fuel manifolds and beacon arrays open orbital traffic.",
    scale: "burg",
    minDevelopment: 12,
    seasons: 2,
    treasury: 100,
    goods: [
      { name: "Wood", units: 8 },
      { name: "Stone", units: 5 }
    ],
    astralGoods: [
      { name: "Postech Building Material", units: 6 },
      { name: "Metal Ingots, Common", units: 5 }
    ],
    needsCoast: true,
    effect: { line: { label: "Harbor works", value: 2 }, burgFlag: "port" },
    affinity: { civic: 1, martial: 0.4 }
  },
  {
    id: "walls",
    name: "Walls",
    astralName: "Planetary Defense & Shield Grid",
    description: "Raises the town's walls a tier.",
    astralDescription: "Upgrades the settlement's orbital point-defense and shield bastions.",
    scale: "burg",
    minDevelopment: 6,
    seasons: 2,
    treasury: 90,
    goods: [{ name: "Stone", units: 6 }],
    astralGoods: [{ name: "Postech Building Material", units: 5 }],
    effect: { burgFlag: "walls" },
    affinity: { martial: 1.4, cruel: 0.3 }
  },
  {
    id: "temple_works",
    name: "Temple Works",
    astralName: "Resonance Sanctum & Archive",
    description: "A house for the gods, and the pilgrims who follow.",
    astralDescription: "A doctrinal sanctum and cultural archive drawing pilgrims across sectors.",
    scale: "burg",
    minDevelopment: 6,
    seasons: 2,
    treasury: 80,
    goods: [
      { name: "Marble", units: 3 },
      { name: "Stone", units: 4 }
    ],
    astralGoods: [
      { name: "Exotic Jewels", units: 2 },
      { name: "Postech Building Material", units: 4 }
    ],
    effect: { line: { label: "Temple works", value: 2 }, burgFlag: "temple" },
    affinity: { pious: 1.5 }
  },
  {
    id: "college",
    name: "College",
    astralName: "Research Nexus & VI Datacore",
    description: "Scholars and their books raise the people's craft.",
    astralDescription: "Research labs and databanks elevate the settlement's tech level.",
    scale: "burg",
    minDevelopment: 27,
    seasons: 3,
    treasury: 160,
    goods: [
      { name: "Books", units: 4 },
      { name: "Paper", units: 4 }
    ],
    astralGoods: [
      { name: "Tools, Astronautic", units: 3 },
      { name: "Parts, Starship Maintenance", units: 3 }
    ],
    effect: { line: { label: "College", value: 1 }, development: 3 },
    affinity: { civic: 1 }
  },
  {
    id: "guild_hall",
    name: "Guild Hall",
    astralName: "Industrial Syndicate Complex",
    description: "The town's trades keep their charters, dues and standards here.",
    astralDescription: "Fabricator syndicates standardize tooling, charters and output here.",
    scale: "burg",
    minDevelopment: 27,
    seasons: 2,
    treasury: 120,
    goods: [
      { name: "Wood", units: 4 },
      { name: "Tools", units: 2 }
    ],
    astralGoods: [
      { name: "Colonial Materials", units: 4 },
      { name: "Tools, Industrial", units: 2 }
    ],
    effect: { line: { label: "Guild hall", value: 3 } },
    affinity: { civic: 0.8, cruel: 0.4 }
  },
  {
    id: "land_improvement",
    name: "Land Improvement",
    astralName: "Planetary Terraforming & Extractors",
    description: "Farms, mills and mines laid out across the province.",
    astralDescription: "Hydroponic domes, strip extractors and refineries deployed across the sector.",
    scale: "province",
    minDevelopment: 6,
    seasons: 2,
    treasury: 70,
    goods: [{ name: "Wood", units: 4 }],
    astralGoods: [{ name: "Colonial Materials", units: 4 }],
    effect: { line: { label: "Land improvement", value: 2 }, improvement: true },
    affinity: { civic: 0.9, martial: 0.3 }
  },
  {
    id: "army_camp",
    name: "Army Camp",
    astralName: "Orbital Fleet Anchorage",
    description: "A permanent camp keeps the realm's forces in the field.",
    astralDescription: "A permanent fleet anchorage speeds ship refit and troop replenishment.",
    scale: "state",
    minDevelopment: 6,
    seasons: 2,
    treasury: 80,
    goods: [
      { name: "Iron", units: 3 },
      { name: "Tools", units: 2 }
    ],
    astralGoods: [
      { name: "Metal Ingots, Common", units: 3 },
      { name: "Small Arms, Energy", units: 2 }
    ],
    effect: { line: { label: "Army camp", value: 1 }, militaryCamp: true },
    affinity: { martial: 1.3 }
  }
];

export const PROJECT_BY_ID: Readonly<Record<string, ProjectDef>> = Object.fromEntries(
  PROJECTS.map(project => [project.id, project])
);

const isAstral = () => typeof options !== "undefined" && Boolean(options.map?.astral);

export function projectName(project: ProjectDef): string {
  return isAstral() && project.astralName ? project.astralName : project.name;
}

export function projectDescription(project: ProjectDef): string {
  return isAstral() && project.astralDescription ? project.astralDescription : project.description;
}

export function projectGoods(project: ProjectDef): ProjectGoodCost[] | undefined {
  return isAstral() && project.astralGoods ? project.astralGoods : project.goods;
}

/** The extra daily line a project pays, before the target's name is prefixed. */
export function projectLineLabel(project: ProjectDef): string | undefined {
  if (!project.effect.line) return undefined;
  return isAstral() && project.astralName ? project.astralName : project.effect.line.label;
}
