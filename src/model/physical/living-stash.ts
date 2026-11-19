// Accumulated patrimony: crown jewels, art, relics and vaults, separate from the
// daily treasury. A soft stock that follows a nature-driven multiple of surplus.

import { EXPENSES } from "@/data/expenses";
import type { State } from "@/model/political/states-generator";
import type { Faction, FactionCategory } from "@/types/factions";
import { minmax } from "@/utils/number-utils";

export const STASH_MONTH_DAYS = 30;
export const STASH_GROWTH = 0.25;
export const STASH_DECAY = 0.05;
export const INITIAL_STASH_SHARE = 0.5;
export const MIN_STASH_MONTHS = 3;
export const MAX_STASH_MONTHS = 36;

const STATE_BASE_MONTHS: Record<string, number> = {
  Monarchy: 18,
  Theocracy: 18,
  Republic: 12,
  Union: 9,
  Anarchy: 0
};

const FACTION_BASE_MONTHS: Record<FactionCategory, number> = {
  commercial: 18,
  underworld: 15,
  religious: 15,
  political: 12,
  martial: 6,
  adventuring: 6
};

const STATE_STASH_LABELS: Record<string, string> = {
  Monarchy: "Royal collection",
  Theocracy: "Temple treasure",
  Republic: "Civic collection",
  Union: "Common treasury",
  Anarchy: "No patrimony"
};

const FACTION_STASH_LABELS: Record<FactionCategory, string> = {
  commercial: "Commercial reserves",
  underworld: "Hidden vaults",
  religious: "Temple treasure",
  political: "Crown regalia",
  martial: "War chest",
  adventuring: "Relics and curios"
};

export type StashPart = "bullion" | "art" | "regalia" | "relics";
export type StashMix = Record<StashPart, number>;
export type StashComposition = Record<StashPart, number>;

const STATE_STASH_MIX: Record<string, StashMix> = {
  Monarchy: { bullion: 30, art: 30, regalia: 35, relics: 5 },
  Theocracy: { bullion: 10, art: 20, regalia: 20, relics: 50 },
  Republic: { bullion: 30, art: 40, regalia: 20, relics: 10 },
  Union: { bullion: 40, art: 30, regalia: 20, relics: 10 },
  Anarchy: { bullion: 0, art: 0, regalia: 0, relics: 0 }
};

const FACTION_STASH_MIX: Record<FactionCategory, StashMix> = {
  commercial: { bullion: 60, art: 20, regalia: 15, relics: 5 },
  underworld: { bullion: 70, art: 15, regalia: 10, relics: 5 },
  religious: { bullion: 10, art: 20, regalia: 20, relics: 50 },
  political: { bullion: 20, art: 30, regalia: 40, relics: 10 },
  martial: { bullion: 45, art: 10, regalia: 30, relics: 15 },
  adventuring: { bullion: 20, art: 20, regalia: 15, relics: 45 }
};

const DEFAULT_STATE_MIX: StashMix = { bullion: 30, art: 30, regalia: 25, relics: 15 };
const DEFAULT_FACTION_MIX: StashMix = { bullion: 40, art: 25, regalia: 20, relics: 15 };

/** How much of a beaten polity's stash a capture or pillage can carry off */
export const STASH_LOOT_SHARE = { loot: 0.1, sack: 0.2, raze: 0.3 } as const;

/** Months-of-surplus crossings worth a hoard dispatch */
export const STASH_NEWS_TIERS = [24, 36] as const;

/** A quarter of the stash is sold at half its appraised value */
export const STASH_SALE_SHARE = 0.25;
export const STASH_SALE_RATE = 0.5;

const AVARICE_VICES = ["greedy", "stingy", "selfish", "boastful", "domineering", "paranoid"];
const STEWARD_VIRTUES = ["thrifty", "temperate", "prudent", "methodical", "disciplined", "meticulous"];
const OPEN_HAND_VIRTUES = ["generous", "charitable", "selfless", "compassionate", "kind"];
const SPENDTHRIFT_VICES = ["wasteful", "reckless", "negligent", "slothful", "haphazard"];
const HOARDING_VALUES = ["greed", "control", "power", "subjugation"];
const GENEROUS_VALUES = ["generosity", "empathy", "cooperation", "love"];

/** A figure's traits, or the less specific shape tests and old saves provide */
export interface StashFigure {
  virtues?: string[];
  vices?: string[];
}

/** The state or faction's own culture-like values */
export type StashValues = readonly string[];

function countWords(words: Set<string>, list: readonly string[]): number {
  return list.reduce((count, word) => count + (words.has(word) ? 1 : 0), 0);
}

function countValues(values: Set<string>, list: readonly string[]): number {
  return list.reduce((count, value) => count + (values.has(value) ? 1 : 0), 0);
}

/** How strongly a figure's traits and values stretch the base hoard horizon (0.5..1.75) */
export function stashMultiplier(figure?: StashFigure, values: StashValues = []): number {
  const words = new Set([...(figure?.virtues ?? []), ...(figure?.vices ?? [])]);
  const held = new Set(values);
  const multiplier =
    1 +
    0.15 * countWords(words, AVARICE_VICES) +
    0.1 * countWords(words, STEWARD_VIRTUES) -
    0.15 * countWords(words, OPEN_HAND_VIRTUES) -
    0.15 * countWords(words, SPENDTHRIFT_VICES) +
    0.1 * countValues(held, HOARDING_VALUES) -
    0.1 * countValues(held, GENEROUS_VALUES);
  return Math.round(minmax(multiplier, 0.5, 1.75) * 100) / 100;
}

/** The nature-driven horizon in months; anarchy and other zero-base natures keep nothing */
export function stashMonths(baseMonths: number, figure?: StashFigure, values: StashValues = []): number {
  if (baseMonths <= 0) return 0;
  return Math.round(minmax(baseMonths * stashMultiplier(figure, values), MIN_STASH_MONTHS, MAX_STASH_MONTHS));
}

export function stateBaseHoardMonths(form: string | undefined): number {
  return STATE_BASE_MONTHS[form ?? ""] ?? 12;
}

export function factionBaseHoardMonths(category: FactionCategory): number {
  return FACTION_BASE_MONTHS[category] ?? FACTION_BASE_MONTHS.commercial;
}

/** A state's stash shares; a museum moves ten points from bullion into art */
export function stateStashMix(form: string | undefined, hasMuseum = false): StashMix {
  const base = STATE_STASH_MIX[form ?? ""] ?? DEFAULT_STATE_MIX;
  const mix = { ...base };
  if (hasMuseum && mix.bullion > 0) {
    const shift = Math.min(10, mix.bullion);
    mix.bullion -= shift;
    mix.art += shift;
  }
  return mix;
}

export function factionStashMix(category: FactionCategory): StashMix {
  return { ...(FACTION_STASH_MIX[category] ?? DEFAULT_FACTION_MIX) };
}

/** Split a total into the four kinds of treasure */
export function stashComposition(value: number, mix: StashMix): StashComposition {
  const total = Math.max(0, value);
  const weight = mix.bullion + mix.art + mix.regalia + mix.relics || 1;
  const part = (share: number) => Math.round(((total * share) / weight) * 100) / 100;
  return {
    bullion: part(mix.bullion),
    art: part(mix.art),
    regalia: part(mix.regalia),
    relics: part(mix.relics)
  };
}

export function dominantStashPart(mix: StashMix): StashPart {
  return (Object.keys(mix) as StashPart[]).reduce((best, part) => (mix[part] > mix[best] ? part : best), "bullion");
}

export function stashPartLabel(part: StashPart): string {
  switch (part) {
    case "art":
      return "commissioned art";
    case "regalia":
      return "crown regalia";
    case "relics":
      return "sacred relics";
    default:
      return "vaults of bullion";
  }
}

/** Whether the state's capital has a museum among its completed works */
export function stateHasMuseum(stateId: number): boolean {
  if (!stateId || typeof pack === "undefined") return false;
  const capital = pack.states?.[stateId]?.capital;
  const civ = capital ? pack.history?.living?.burgs?.[capital]?.civBuildings : undefined;
  return Boolean(civ?.includes("museum"));
}

/** What a stable polity's patrimony is worth at its current daily surplus */
export function stashTarget(dailySurplus: number, months: number): number {
  const daily = Number.isFinite(dailySurplus) ? Math.max(0, dailySurplus) : 0;
  return Math.round(daily * STASH_MONTH_DAYS * Math.max(0, months) * 100) / 100;
}

/** How many months of the current daily surplus a stock is worth */
export function stashMonthsHeld(stash: number | undefined, dailySurplus: number): number {
  const value = Math.max(0, Number(stash ?? 0));
  const daily = Number.isFinite(dailySurplus) ? Math.max(0, dailySurplus) : 0;
  return daily > 0 ? Math.round((value / (daily * STASH_MONTH_DAYS)) * 10) / 10 : 0;
}

/** Years of annual surplus the stash is worth: the splendor readout and effect input */
export function stashSplendor(stash: number | undefined, annualSurplus: number): number {
  const annual = Number.isFinite(annualSurplus) ? Math.max(0, annualSurplus) : 0;
  if (!annual) return 0;
  return Math.round((Math.max(0, Number(stash ?? 0)) / annual) * 100) / 100;
}

export function stateStashSplendor(state: { economy?: State["economy"] }): number {
  return stashSplendor(state.economy?.stash, stateDailySurplus(state) * 360);
}

export function factionStashSplendor(faction: { stash?: number }, dailySurplus: number): number {
  return stashSplendor(faction.stash, Math.max(0, dailySurplus) * 360);
}

/** Influence a faction gains each season from a hoard worth at least a year of surplus */
export function stashPrestigeInfluence(splendor: number): number {
  return splendor >= 1 ? 1 : 0;
}

/** Stability points a state gains from a hoard: half a year, a year, two years */
export function stashStabilityBonus(splendor: number): number {
  if (splendor >= 2) return 3;
  if (splendor >= 1) return 2;
  return splendor >= 0.5 ? 1 : 0;
}

/** Corruption points a visible hoard tempts officials with, up to three */
export function stashCorruptionTemptation(splendor: number): number {
  return Math.round(Math.min(1, Math.max(0, splendor)) * 3 * 10) / 10;
}

export interface StashSale {
  sold: number;
  proceeds: number;
  remaining: number;
}

/** Sell a share of the stash at a loss: the treasury gets `rate` of the appraised value */
export function sellStash(stash: number | undefined, share = STASH_SALE_SHARE, rate = STASH_SALE_RATE): StashSale {
  const value = Math.max(0, Number(stash ?? 0));
  const sold = Math.round(value * minmax(share, 0, 1) * 100) / 100;
  const proceeds = Math.round(sold * minmax(rate, 0, 1) * 100) / 100;
  return { sold, proceeds, remaining: Math.round((value - sold) * 100) / 100 };
}

/**
 * One season of accumulation. A missing stash seeds at half its target; a target
 * below the current stock only draws it down slowly.
 */
export function advanceStash(current: number | undefined, target: number): number {
  const safeTarget = Number.isFinite(target) ? Math.max(0, target) : 0;
  if (!Number.isFinite(current)) return Math.round(safeTarget * INITIAL_STASH_SHARE * 100) / 100;

  const stash = Math.max(0, current as number);
  const response = safeTarget > stash ? STASH_GROWTH : STASH_DECAY;
  return Math.round((stash + (safeTarget - stash) * response) * 100) / 100;
}

export interface StashSeizure {
  seized: number;
  kept: number;
  lost: number;
  remaining: number;
}

/** Take a share of a stash; the victor keeps half by default and the rest is destroyed */
export function seizeStash(stash: number | undefined, share: number, keepShare = 0.5): StashSeizure {
  const value = Math.max(0, Number(stash ?? 0));
  const seized = Math.round(value * minmax(share, 0, 1) * 100) / 100;
  const kept = Math.round(seized * minmax(keepShare, 0, 1) * 100) / 100;
  return {
    seized,
    kept,
    lost: Math.round((seized - kept) * 100) / 100,
    remaining: Math.round((value - seized) * 100) / 100
  };
}

/** A state's day balance before any later treasury edits */
export function stateDailySurplus(state: { economy?: State["economy"] }): number {
  const economy = state.economy;
  if (!economy) return 0;
  const spent = EXPENSES.reduce((total, expense) => total + Number(economy.spent?.[expense] ?? 0), 0);
  const balance = Number(economy.collected ?? 0) - Number(economy.pocketed ?? 0) - spent;
  return Math.round(Math.max(0, balance) * 100) / 100;
}

export function stateStashTarget(
  state: Pick<State, "economy" | "form">,
  figure?: StashFigure,
  values: StashValues = []
): number {
  const months = stashMonths(stateBaseHoardMonths(state.form), figure, values);
  return stashTarget(stateDailySurplus(state), months);
}

export function factionStashTarget(
  faction: Pick<Faction, "category" | "values">,
  dailySurplus: number,
  figure?: StashFigure
): number {
  const months = stashMonths(factionBaseHoardMonths(faction.category), figure, faction.values ?? []);
  return stashTarget(dailySurplus, months);
}

export function stateStashLabel(form: string | undefined): string {
  return STATE_STASH_LABELS[form ?? ""] ?? "Patrimony";
}

export function factionStashLabel(category: FactionCategory): string {
  return FACTION_STASH_LABELS[category] ?? "Patrimony";
}

/** Everything a readout needs: the stock, its months of surplus, and the nature that sets it */
export interface StashSummary {
  value: number;
  hasStash: boolean;
  /** How many months of its current daily surplus the stock is worth */
  months: number;
  /** The nature-driven target in months */
  targetMonths: number;
  nature: string;
  /** Years of annual surplus the stock is worth */
  splendor: number;
  mix: StashMix;
  composition: StashComposition;
}

function summarize(
  stash: number | undefined,
  dailySurplus: number,
  targetMonths: number,
  nature: string,
  mix: StashMix
): StashSummary {
  const value = Math.max(0, Number(stash ?? 0));
  return {
    value,
    hasStash: stash !== undefined,
    months: stashMonthsHeld(value, dailySurplus),
    targetMonths,
    nature,
    splendor: stashSplendor(value, Math.max(0, dailySurplus) * 360),
    mix,
    composition: stashComposition(value, mix)
  };
}

export function stateStashSummary(
  state: Pick<State, "form"> & { i?: number; economy?: State["economy"] },
  figure?: StashFigure,
  values: StashValues = []
): StashSummary {
  const targetMonths = stashMonths(stateBaseHoardMonths(state.form), figure, values);
  const hasMuseum = state.i ? stateHasMuseum(state.i) : false;
  return summarize(
    state.economy?.stash,
    stateDailySurplus(state),
    targetMonths,
    stateStashLabel(state.form),
    stateStashMix(state.form, hasMuseum)
  );
}

export function factionStashSummary(
  faction: Pick<Faction, "category" | "values" | "stash">,
  dailySurplus: number,
  figure?: StashFigure
): StashSummary {
  const targetMonths = stashMonths(factionBaseHoardMonths(faction.category), figure, faction.values ?? []);
  return summarize(
    faction.stash,
    dailySurplus,
    targetMonths,
    factionStashLabel(faction.category),
    factionStashMix(faction.category)
  );
}
