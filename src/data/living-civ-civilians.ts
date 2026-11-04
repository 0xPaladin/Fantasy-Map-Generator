import type { CivUnitDef } from "@/types/living";

/**
 * The **civilian** OpenCiv units that survive the armies migration
 * (living-openciv-armies.md §6.5). Combat is roster-only now, so this catalog
 * exists solely for the mechanics that are still Civ-shaped: expansion,
 * improvements, trade and religion. Each one keeps a `UnitSimState`.
 */
export const CIV_CIVILIANS: readonly CivUnitDef[] = [
  {
    id: "settler",
    name: "Settler",
    cost: 106,
    isUtility: true,
    capturedAs: "builder"
  },
  {
    id: "builder",
    name: "Builder",
    cost: 50,
    isUtility: true,
    capturedAs: "builder"
  },
  {
    id: "work_boat",
    name: "Work Boat",
    cost: 30,
    requiredTech: "sailing",
    domain: "sea",
    isUtility: true
  },
  {
    id: "caravan",
    name: "Caravan",
    cost: 75,
    requiredTech: "animal_husbandry",
    isUtility: true
  },
  {
    id: "cargo_ship",
    name: "Cargo Ship",
    cost: 100,
    requiredTech: "sailing",
    domain: "sea",
    isUtility: true
  },
  {
    id: "missionary",
    name: "Missionary",
    isUtility: true,
    defaultMoveDistance: 4,
    faithCost: 200,
    spreadCharges: 2,
    entersForeignLands: true
  },
  {
    id: "inquisitor",
    name: "Inquisitor",
    isUtility: true,
    defaultMoveDistance: 3,
    faithCost: 200,
    entersForeignLands: true
  },
  {
    id: "great_prophet",
    name: "Great Prophet",
    isUtility: true,
    defaultMoveDistance: 2,
    spreadCharges: 4,
    entersForeignLands: true
  }
];

export const CIV_CIVILIAN_BY_ID: Record<string, CivUnitDef> = Object.fromEntries(
  CIV_CIVILIANS.map(unit => [unit.id, unit] as const)
);

export function getCivCivilian(id: string): CivUnitDef | undefined {
  return CIV_CIVILIAN_BY_ID[id];
}
