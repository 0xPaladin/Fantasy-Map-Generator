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
  description: string;
  scale: ProjectScale;
  /** the people's mean development that unlocks the work */
  minDevelopment: number;
  /** seasons of construction */
  seasons: number;
  /** banked treasury paid when construction starts */
  treasury: number;
  goods?: ProjectGoodCost[];
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
    description: "Stores the province's harvest against a lean season.",
    scale: "province",
    minDevelopment: 6,
    seasons: 2,
    treasury: 80,
    goods: [
      { name: "Wood", units: 6 },
      { name: "Clay", units: 4 }
    ],
    effect: { line: { label: "Granary", value: 2 } },
    affinity: { civic: 1, pious: 0.5 }
  },
  {
    id: "aqueduct",
    name: "Aqueduct",
    description: "Brings clean water into the streets and workshops.",
    scale: "burg",
    minDevelopment: 9,
    seasons: 2,
    treasury: 90,
    goods: [
      { name: "Stone", units: 8 },
      { name: "Clay", units: 5 }
    ],
    effect: { line: { label: "Aqueduct", value: 3 } },
    affinity: { civic: 1.2, pious: 0.3 }
  },
  {
    id: "royal_road",
    name: "Royal Road",
    description: "Links the realm's towns to the road network.",
    scale: "state",
    minDevelopment: 12,
    seasons: 2,
    treasury: 120,
    goods: [
      { name: "Wood", units: 6 },
      { name: "Stone", units: 6 }
    ],
    effect: { line: { label: "Royal roads", value: 2 }, route: true },
    affinity: { civic: 1, martial: 0.6 }
  },
  {
    id: "market_charter",
    name: "Market Charter",
    description: "Charters the town as a market in its own right.",
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
    description: "Strikes the realm's coin and takes its seigniorage.",
    scale: "state",
    minDevelopment: 18,
    seasons: 2,
    treasury: 140,
    goods: [
      { name: "Copper", units: 4 },
      { name: "Tools", units: 2 }
    ],
    effect: { line: { label: "Mint", value: 4 } },
    affinity: { civic: 0.8, cruel: 0.4 }
  },
  {
    id: "courthouse",
    name: "Courthouse",
    description: "Judges and clerks cut the officials' graft.",
    scale: "province",
    minDevelopment: 18,
    seasons: 2,
    treasury: 90,
    goods: [{ name: "Stone", units: 5 }],
    effect: { line: { label: "Courthouse", value: 1 }, corruption: 2 },
    affinity: { civic: 1.2, pious: 0.3 }
  },
  {
    id: "harbor_works",
    name: "Harbor Works",
    description: "Docks, cranes and a lighthouse open the town to the sea.",
    scale: "burg",
    minDevelopment: 12,
    seasons: 2,
    treasury: 100,
    goods: [
      { name: "Wood", units: 8 },
      { name: "Stone", units: 5 }
    ],
    needsCoast: true,
    effect: { line: { label: "Harbor works", value: 2 }, burgFlag: "port" },
    affinity: { civic: 1, martial: 0.4 }
  },
  {
    id: "walls",
    name: "Walls",
    description: "Raises the town's walls a tier.",
    scale: "burg",
    minDevelopment: 6,
    seasons: 2,
    treasury: 90,
    goods: [{ name: "Stone", units: 6 }],
    effect: { burgFlag: "walls" },
    affinity: { martial: 1.4, cruel: 0.3 }
  },
  {
    id: "temple_works",
    name: "Temple Works",
    description: "A house for the gods, and the pilgrims who follow.",
    scale: "burg",
    minDevelopment: 6,
    seasons: 2,
    treasury: 80,
    goods: [
      { name: "Marble", units: 3 },
      { name: "Stone", units: 4 }
    ],
    effect: { line: { label: "Temple works", value: 2 }, burgFlag: "temple" },
    affinity: { pious: 1.5 }
  },
  {
    id: "college",
    name: "College",
    description: "Scholars and their books raise the people's craft.",
    scale: "burg",
    minDevelopment: 27,
    seasons: 3,
    treasury: 160,
    goods: [
      { name: "Books", units: 4 },
      { name: "Paper", units: 4 }
    ],
    effect: { line: { label: "College", value: 1 }, development: 3 },
    affinity: { civic: 1 }
  },
  {
    id: "guild_hall",
    name: "Guild Hall",
    description: "The town's trades keep their charters, dues and standards here.",
    scale: "burg",
    minDevelopment: 27,
    seasons: 2,
    treasury: 120,
    goods: [
      { name: "Wood", units: 4 },
      { name: "Tools", units: 2 }
    ],
    effect: { line: { label: "Guild hall", value: 3 } },
    affinity: { civic: 0.8, cruel: 0.4 }
  },
  {
    id: "land_improvement",
    name: "Land Improvement",
    description: "Farms, mills and mines laid out across the province.",
    scale: "province",
    minDevelopment: 6,
    seasons: 2,
    treasury: 70,
    goods: [{ name: "Wood", units: 4 }],
    effect: { line: { label: "Land improvement", value: 2 }, improvement: true },
    affinity: { civic: 0.9, martial: 0.3 }
  },
  {
    id: "army_camp",
    name: "Army Camp",
    description: "A permanent camp keeps the realm's forces in the field.",
    scale: "state",
    minDevelopment: 6,
    seasons: 2,
    treasury: 80,
    goods: [
      { name: "Iron", units: 3 },
      { name: "Tools", units: 2 }
    ],
    effect: { line: { label: "Army camp", value: 1 }, militaryCamp: true },
    affinity: { martial: 1.3 }
  }
];

export const PROJECT_BY_ID: Readonly<Record<string, ProjectDef>> = Object.fromEntries(
  PROJECTS.map(project => [project.id, project])
);

/** The extra daily line a project pays, before the target's name is prefixed. */
export function projectLineLabel(project: ProjectDef): string | undefined {
  return project.effect.line?.label;
}
