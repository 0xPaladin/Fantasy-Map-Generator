// Shared treasure categories for generated site profiles

export const TREASURE_CATEGORIES = ["bullion", "regalia", "art", "relics"] as const;
export type TreasureCategory = (typeof TREASURE_CATEGORIES)[number];
export type TreasureShares = Record<TreasureCategory, number>;
export type TreasureWeights = TreasureShares;

export interface TreasureModifier {
  pattern: RegExp;
  weights: Partial<TreasureWeights>;
}
