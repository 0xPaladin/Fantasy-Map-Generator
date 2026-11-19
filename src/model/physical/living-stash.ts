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

/** What a stable polity's patrimony is worth at its current daily surplus */
export function stashTarget(dailySurplus: number, months: number): number {
  const daily = Number.isFinite(dailySurplus) ? Math.max(0, dailySurplus) : 0;
  return Math.round(daily * STASH_MONTH_DAYS * Math.max(0, months) * 100) / 100;
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

/** A state's day balance before any later treasury edits */
export function stateDailySurplus(state: Pick<State, "economy">): number {
  const economy = state.economy;
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
