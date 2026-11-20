// Tunables for dungeon delves. Engine: src/model/story/delve/.
// See docs/plans/dungeon-delves.md.

import type { DelveAlert, DelveOrder } from "@/types/delves";

export interface DelveOrderConfig {
  /** die steps applied to both threat dice */
  threatStep: number;
  /** added to success ranks, floor 1 */
  rankBonus: number;
  lootMultiplier: number;
  /** rerolls that do not spend Stamina */
  freeRerolls: number;
  breakThreshold: number;
}

export interface DelveConfig {
  alerts: Record<DelveAlert, { die: number; freeTurns: number; xp: number }>;
  ratingDice: readonly number[];
  objectives: { min: number; max: number; areasPerObjective: number; hugeAreas: number };
  challenge: { rerollsPerSituation: number; supportBonus: number; injuryPenaltyCap: number; injuryLimit: number };
  pressure: { resolvePerRank: number; breakThreshold: number };
  supply: { baseTurns: number; perRetainer: number; outOfSupplyResolve: number };
  chaos: { min: number; max: number };
  turns: { min: number; max: number };
  loot: { cacheMultiplier: number };
  xp: { base: number; escalationPenalty: number };
  twists: readonly { id: string; text: string; resolve: number; alertStep: boolean }[];
  orders: Record<DelveOrder, DelveOrderConfig>;
}

export const DEFAULT_DELVE_CONFIG: DelveConfig = {
  alerts: {
    quiet: { die: 6, freeTurns: 4, xp: 10 },
    uneasy: { die: 8, freeTurns: 3, xp: 15 },
    alerted: { die: 10, freeTurns: 2, xp: 20 },
    hunting: { die: 12, freeTurns: 1, xp: 30 }
  },
  /** 1-2 → d4, 3-4 → d6, 5-6 → d8, 7-8 → d10, 9-10 → d12 */
  ratingDice: [4, 6, 8, 10, 12],
  objectives: { min: 2, max: 8, areasPerObjective: 3, hugeAreas: 25 },
  challenge: { rerollsPerSituation: 2, supportBonus: 1, injuryPenaltyCap: 2, injuryLimit: 3 },
  pressure: { resolvePerRank: 1, breakThreshold: 0.25 },
  supply: { baseTurns: 12, perRetainer: 6, outOfSupplyResolve: 1 },
  chaos: { min: 1, max: 9 },
  turns: { min: 1, max: 4 },
  loot: { cacheMultiplier: 25 },
  xp: { base: 20, escalationPenalty: 3 },
  twists: [
    { id: "hazard", text: "The hazard springs early.", resolve: 1, alertStep: false },
    { id: "reinforcements", text: "A second group arrives.", resolve: 0, alertStep: true },
    { id: "trapped_find", text: "The find is a trap.", resolve: 1, alertStep: false },
    { id: "opening", text: "An unexplored exit opens.", resolve: 0, alertStep: false }
  ],
  orders: {
    swift: { threatStep: 0, rankBonus: 1, lootMultiplier: 1, freeRerolls: 0, breakThreshold: 0.25 },
    cautious: { threatStep: -1, rankBonus: -1, lootMultiplier: 1, freeRerolls: 1, breakThreshold: 0.25 },
    greedy: { threatStep: 0, rankBonus: 0, lootMultiplier: 1.5, freeRerolls: 0, breakThreshold: 0.4 }
  }
};

/** Step a threat die through d4 → d12. */
export function stepDieSides(sides: number, steps: number): number {
  const dice: readonly number[] = DEFAULT_DELVE_CONFIG.ratingDice;
  const index = dice.indexOf(sides);
  if (index < 0) return sides;
  return dice[Math.max(0, Math.min(dice.length - 1, index + steps))];
}

/** The 1-10 rating as a threat die: 1-2 d4, 3-4 d6, 5-6 d8, 7-8 d10, 9-10 d12. */
export function ratingDie(rating: number, config: DelveConfig = DEFAULT_DELVE_CONFIG): number {
  const index = Math.min(config.ratingDice.length - 1, Math.max(0, Math.floor((rating - 1) / 2)));
  return config.ratingDice[index];
}
