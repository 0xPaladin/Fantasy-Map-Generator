/**
 * Pure helpers extracted from src/conquest/engine/game/saves.ts for Phase A
 * of the conquest retirement plan. Only the functions actually consumed by
 * non-conquest (civ/living) code are retained here; the rest of saves.ts
 * (rollSave, rollValueCheck, regionValues, domainValue, regionActivity,
 * effectiveValue) stays in conquest until Phase E retires them.
 */

import type { BuildingDef } from "@/data/roster-content";

export const DEFAULT_BANDS = [6, 11, 16, 21] as const;
export const DEFAULT_BAND_STEP = 5;

export function valueModifier(
  value: number,
  bands: readonly number[] = DEFAULT_BANDS,
  bandStep: number = DEFAULT_BAND_STEP
): number {
  let mod = 0;
  for (const band of bands) if (value >= band) mod++;
  const top = bands[bands.length - 1];
  if (top !== undefined && bandStep > 0 && value >= top) {
    mod += Math.floor((value - top) / bandStep);
  }
  return mod;
}

export function assetCheckDifficulties(
  building: BuildingDef,
  pityBonus = 0,
  domainAtrocity = 0
): { m: number; w: number; s: number } {
  const pools = ["m", "w", "s"] as const;
  const out = { m: 12, w: 12, s: 12 };
  if (building.id === "scapegoat") {
    const baseDc = 5 + domainAtrocity;
    for (const p of pools) {
      out[p] = Math.max(2, baseDc - pityBonus);
    }
    return out;
  }
  for (const p of pools) {
    const gen = building.effects.capacity?.[p] ?? 0;
    const up = building.effects.upkeep?.[p] ?? 0;
    const mag = Math.max(gen, up);
    out[p] = Math.max(2, 12 + mag - pityBonus);
  }
  return out;
}