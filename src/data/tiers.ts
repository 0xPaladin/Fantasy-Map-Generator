/**
 * Settlement and region tier thresholds. These are pack-level constants
 * (changing them changes contentHash) — pure data, no behavior.
 */

/** Max minor settlements allowed for any region. */
export const MAX_MINOR_SETTLEMENTS = 3;

/** Settlement tier thresholds, in thousands of people. */
export const SETTLEMENT_TIER_STEPS = [1, 2, 4, 8, 16] as const;

/** Highest reachable settlement tier. */
export const MAX_SETTLEMENT_TIER = SETTLEMENT_TIER_STEPS.length;

/** Region tier thresholds, in thousands of people. */
export const REGION_TIER_STEPS = [100, 200, 400, 800, 1600] as const;

/** Highest reachable region tier. */
export const MAX_REGION_TIER = REGION_TIER_STEPS.length;

const POI_CAPACITY: Record<string, "m" | "w" | "s" | "c"> = {
  battlefields: "m",
  "hill-monsters": "m",
  mines: "m",
  brigands: "m",
  "lake-monsters": "m",
  "sea-monsters": "m",
  volcanoes: "m",
  necropolises: "w",
  statues: "w",
  ruins: "c",
  dungeons: "c",
  caves: "c",
  "disturbed-burials": "c",
  rifts: "c",
  portals: "c",
  libraries: "c"
};

/** POI type -> capacity pool, or undefined when the marker grants nothing. */
export function poiCapacityType(poiType: string): "m" | "w" | "s" | "c" | undefined {
  return POI_CAPACITY[poiType];
}
