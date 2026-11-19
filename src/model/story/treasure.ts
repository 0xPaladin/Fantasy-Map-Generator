// Shared treasure-mix helpers for generated site profiles
import {
  TREASURE_CATEGORIES,
  type TreasureCategory,
  type TreasureModifier,
  type TreasureShares,
  type TreasureWeights
} from "@/data/treasure";
import type { Rng } from "@/utils/rng";
import { capitalize } from "@/utils/string-utils";

export function applyTreasureModifiers(
  weights: TreasureWeights,
  modifiers: readonly TreasureModifier[],
  values: readonly string[]
): void {
  for (const { pattern, weights: changes } of modifiers) {
    if (!values.some(value => pattern.test(value))) continue;
    for (const [category, amount] of Object.entries(changes) as [TreasureCategory, number][]) {
      weights[category] = Math.max(0, weights[category] + amount);
    }
  }
}

export function normalizeTreasureShares(weights: TreasureWeights): TreasureShares {
  const total = TREASURE_CATEGORIES.reduce((sum, category) => sum + Math.max(0, weights[category]), 0);
  if (!total) return { bullion: 25, regalia: 25, art: 25, relics: 25 };

  const exact = TREASURE_CATEGORIES.map((category, order) => {
    const value = (Math.max(0, weights[category]) / total) * 100;
    return { category, order, floor: Math.floor(value), fraction: value - Math.floor(value) };
  });
  const shares = {} as TreasureShares;
  let assigned = 0;
  for (const { category, floor } of exact) {
    shares[category] = floor;
    assigned += floor;
  }

  const order = [...exact].sort((a, b) => b.fraction - a.fraction || a.order - b.order);
  for (let index = 0; index < 100 - assigned; index++) shares[order[index].category]++;
  return shares;
}

export function pickTreasureCategory(rng: Rng, shares: TreasureShares): TreasureCategory {
  const entries = TREASURE_CATEGORIES.filter(category => shares[category] > 0).map(category => ({
    value: category,
    weight: shares[category]
  }));
  if (!entries.length) return "bullion";
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.int(1, total);
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}

/** Tag each treasure cache in a set of areas with a category from the mix */
export function annotateTreasureCaches<T extends { discoveries: string[] }>(
  rng: Rng,
  areas: T[],
  shares: TreasureShares
): void {
  for (const area of areas) {
    area.discoveries = area.discoveries.map(discovery =>
      /treasure cache/i.test(discovery) ? `${discovery} [${capitalize(pickTreasureCategory(rng, shares))}]` : discovery
    );
  }
}
