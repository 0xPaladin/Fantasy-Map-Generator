// Rulers govern: traits and events set a fiscal target that the real budget,
// taxes and corruption drift toward each spring (living-fmg-native.md phase 3).
// A leaf module: no import cycle back into the Living generator.

import { EXPENSES, type Expense } from "@/data/expenses";
import type { State } from "@/model/political/states-generator";
import { classifyAstralRegime } from "@/model/society/development-generator";
import type { FiscalLock } from "@/types/living";
import { minmax } from "@/utils/number-utils";
import { rulerBias } from "./living-rulers";

/** What the spring's political weather asks of the purse. */
export interface FiscalEvents {
  war: boolean;
  rebellion: boolean;
  hazard: boolean;
  bankrupt: boolean;
}

/** The spending, graft and tax posture a ruler steers toward. */
export interface FiscalProfile {
  budget: Record<Expense, number>;
  corruption: number;
  salesTax: number;
  pollTax: number;
}

/** Whole budget points a season at full stride. */
export const FISCAL_DRIFT = 2;
/** Corruption points a season. */
export const CORRUPTION_DRIFT = 2;
/** Tax-rate points (a share, not a percent) a season. */
export const TAX_DRIFT = 0.005;
/** A line's move this far from accession is worth a dispatch. */
export const FISCAL_NEWS_THRESHOLD = 8;
/** Corruption drift speaks at this many points. */
export const CORRUPTION_NEWS_THRESHOLD = 4;

/** How far a form of government lets its ruler move the purse each season. */
export function fiscalStride(state: State): number {
  if (state.form === "Anarchy") return 0; // levies nothing, spends nothing
  if (state.form === "Republic" || state.form === "Union") return 1; // a senate or council resists
  return 2;
}

const FORM_TAXES: Record<string, { salesTax: number; pollTax: number }> = {
  Monarchy: { salesTax: 0.08, pollTax: 0.07 },
  Theocracy: { salesTax: 0.05, pollTax: 0.07 },
  Republic: { salesTax: 0.05, pollTax: 0.05 },
  Union: { salesTax: 0.1, pollTax: 0 },
  Anarchy: { salesTax: 0, pollTax: 0 }
};

const normalize = (value: number) => minmax((value - 0.1) / 0.7, 0, 1);

/**
 * The season's fiscal target: the ruler's traits and the state's form, bent
 * by war, rebellion, hazards and bankruptcy. Null when no Living ruler sits.
 */
export function fiscalProfile(state: State, events: FiscalEvents): FiscalProfile | null {
  if (!state?.i || state.removed || state.form === "Anarchy") return null;
  const bias = rulerBias(state.i);
  if (!bias) return null;

  const budget = state.economy.budget;
  const martial = normalize(bias.martial);
  const civic = normalize(bias.civic);
  const pious = normalize(bias.pious);
  const cruel = normalize(bias.cruel);

  const target: FiscalProfile = {
    budget: {
      military: budget.military + 35 * martial,
      court: budget.court + 25 * pious,
      administration: budget.administration + 20 * civic,
      infrastructure: budget.infrastructure + 18 * civic
    },
    corruption: budget.corruption + 18 * cruel - 15 * civic,
    salesTax: state.economy.salesTax * (1 + 0.6 * civic - 0.25 * martial),
    pollTax: state.economy.pollTax * (1 + 0.5 * martial - 0.25 * civic)
  };

  // The state of the world re-targets the purse, whatever the ruler prefers.
  if (events.war) {
    target.budget.military += 20;
    target.budget.court -= 5;
  }
  if (events.rebellion) {
    target.budget.administration += 10;
    target.budget.court -= 5;
  }
  if (events.hazard) target.budget.infrastructure += 10;
  if (events.bankrupt) {
    target.budget.court -= 10;
    target.budget.military -= 10;
    target.corruption += 5; // graft tolerated to make ends meet
  }

  if (options.map?.astral) {
    const culture = pack?.cultures?.[state.culture ?? 0];
    const regime = classifyAstralRegime(culture);
    if (regime === "postScarcity") {
      // Post-scarcity polities run on VI audit cores and compiler surplus rather than poll levies.
      target.corruption *= 0.5;
      target.pollTax *= 0.2;
      target.salesTax *= 0.5;
      target.budget.administration += 12;
      target.budget.infrastructure += 12;
    } else if (regime === "ancientBimodal") {
      target.pollTax *= 1.35;
      target.budget.court += 12;
      target.corruption += 8;
    }
  }

  for (const expense of EXPENSES) target.budget[expense] = Math.round(minmax(target.budget[expense], 0, 100));
  target.corruption = Math.round(minmax(target.corruption, 0, 100));
  const form = FORM_TAXES[state.form || ""] ?? FORM_TAXES.Monarchy;
  target.salesTax = Math.round(minmax(target.salesTax, 0, form.salesTax * 3) * 10000) / 10000;
  target.pollTax = Math.round(minmax(target.pollTax, 0, form.pollTax * 3) * 10000) / 10000;

  return target;
}

/** One line's current value on the state. */
export function fiscalValue(state: State, line: FiscalLock): number {
  if (line === "corruption") return state.economy.budget.corruption;
  if (line === "salesTax") return state.economy.salesTax;
  if (line === "pollTax") return state.economy.pollTax;
  return state.economy.budget[line] ?? 0;
}

/** One line's target value. */
export function fiscalTarget(profile: FiscalProfile, line: FiscalLock): number {
  if (line === "corruption") return profile.corruption;
  if (line === "salesTax") return profile.salesTax;
  if (line === "pollTax") return profile.pollTax;
  return profile.budget[line] ?? 0;
}
