import { afterEach, describe, expect, it, vi } from "vitest";
import type { State } from "@/model/political/states-generator";
import type { Faction } from "@/types/factions";
import {
  advanceStash,
  dominantStashPart,
  factionBaseHoardMonths,
  factionStashLabel,
  factionStashMix,
  factionStashSplendor,
  factionStashSummary,
  factionStashTarget,
  INITIAL_STASH_SHARE,
  MAX_STASH_MONTHS,
  MIN_STASH_MONTHS,
  STASH_DECAY,
  STASH_GROWTH,
  STASH_LOOT_SHARE,
  STASH_MONTH_DAYS,
  STASH_SALE_SHARE,
  seizeStash,
  sellStash,
  stashComposition,
  stashCorruptionTemptation,
  stashMonths,
  stashMonthsHeld,
  stashMultiplier,
  stashPartLabel,
  stashPrestigeInfluence,
  stashSplendor,
  stashStabilityBonus,
  stashTarget,
  stateBaseHoardMonths,
  stateDailySurplus,
  stateHasMuseum,
  stateStashLabel,
  stateStashMix,
  stateStashSplendor,
  stateStashSummary,
  stateStashTarget
} from "./living-stash";

const state = (overrides: Partial<State> = {}): State =>
  ({
    form: "Monarchy",
    culture: 1,
    economy: {
      collected: 100,
      pocketed: 10,
      spent: { court: 20, administration: 10, infrastructure: 5, military: 5 }
    },
    ...overrides
  }) as State;

const faction = (overrides: Partial<Faction> = {}): Faction =>
  ({ category: "commercial", values: [], ...overrides }) as Faction;

afterEach(() => vi.unstubAllGlobals());

describe("living stash", () => {
  it("reads a state's daily surplus and ignores debt", () => {
    expect(stateDailySurplus(state())).toBe(50);
    expect(
      stateDailySurplus(
        state({ economy: { ...state().economy, collected: 5, pocketed: 2, spent: state().economy.spent } })
      )
    ).toBe(0);
  });

  it("sets base horizons by nature", () => {
    expect(stateBaseHoardMonths("Monarchy")).toBe(18);
    expect(stateBaseHoardMonths("Theocracy")).toBe(18);
    expect(stateBaseHoardMonths("Republic")).toBe(12);
    expect(stateBaseHoardMonths("Union")).toBe(9);
    expect(stateBaseHoardMonths("Anarchy")).toBe(0);
    expect(stateBaseHoardMonths(undefined)).toBe(12);

    expect(factionBaseHoardMonths("commercial")).toBe(18);
    expect(factionBaseHoardMonths("underworld")).toBe(15);
    expect(factionBaseHoardMonths("religious")).toBe(15);
    expect(factionBaseHoardMonths("political")).toBe(12);
    expect(factionBaseHoardMonths("martial")).toBe(6);
    expect(factionBaseHoardMonths("adventuring")).toBe(6);
  });

  it("bends the horizon with vices, virtues and values", () => {
    expect(stashMultiplier()).toBe(1);
    expect(stashMultiplier({ vices: ["greedy"] })).toBe(1.15);
    expect(stashMultiplier({ virtues: ["thrifty"] })).toBe(1.1);
    expect(stashMultiplier({ virtues: ["generous"] })).toBe(0.85);
    expect(stashMultiplier({ vices: ["greedy"], virtues: ["generous"] })).toBe(1);
    expect(stashMultiplier({}, ["greed"])).toBe(1.1);
    expect(stashMultiplier({}, ["generosity"])).toBe(0.9);
    expect(stashMultiplier({ vices: ["greedy", "stingy", "selfish", "boastful"] }, ["greed", "power"])).toBe(1.75);
  });

  it("clamps months and keeps anarchy at zero", () => {
    expect(stashMonths(0, { vices: ["greedy"] })).toBe(0);
    expect(stashMonths(1)).toBe(MIN_STASH_MONTHS);
    expect(stashMonths(30, { vices: ["greedy", "stingy", "selfish", "boastful"] }, ["greed", "power"])).toBe(
      MAX_STASH_MONTHS
    );
    expect(stashMonths(18, { vices: ["greedy"] })).toBe(21);
  });

  it("targets a multiple of the daily surplus", () => {
    expect(stashTarget(10, 12)).toBe(10 * STASH_MONTH_DAYS * 12);
    expect(stashTarget(-10, 12)).toBe(0);
    expect(stashTarget(10, 0)).toBe(0);
  });

  it("seeds at half the target and then eases toward it", () => {
    expect(advanceStash(undefined, 1000)).toBe(1000 * INITIAL_STASH_SHARE);
    expect(advanceStash(500, 1000)).toBe(625);
    expect(advanceStash(1000, 1000)).toBe(1000);
    expect(advanceStash(1000, 0)).toBe(1000 * (1 - STASH_DECAY));
    expect(advanceStash(-5, 100)).toBe(100 * STASH_GROWTH);
    expect(advanceStash(undefined, 0)).toBe(0);
  });

  it("combines a state's form, surplus and culture", () => {
    expect(stateStashTarget(state())).toBe(50 * STASH_MONTH_DAYS * 18);
    expect(stateStashTarget(state(), { vices: ["greedy"] }, ["greed"])).toBe(50 * STASH_MONTH_DAYS * 23);
  });

  it("combines a faction's category, surplus and values", () => {
    expect(factionStashTarget(faction(), 8)).toBe(8 * STASH_MONTH_DAYS * 18);
    expect(factionStashTarget(faction({ values: ["greed"] }), 8)).toBe(8 * STASH_MONTH_DAYS * 20);
  });

  it("labels the nature that shapes a stash", () => {
    expect(stateStashLabel("Monarchy")).toBe("Royal collection");
    expect(stateStashLabel("Theocracy")).toBe("Temple treasure");
    expect(stateStashLabel("Anarchy")).toBe("No patrimony");
    expect(stateStashLabel(undefined)).toBe("Patrimony");
    expect(factionStashLabel("commercial")).toBe("Commercial reserves");
    expect(factionStashLabel("underworld")).toBe("Hidden vaults");
    expect(factionStashLabel("martial")).toBe("War chest");
  });

  it("splits a stash into bullion, art, regalia and relics", () => {
    expect(stateStashMix("Monarchy")).toEqual({ bullion: 30, art: 30, regalia: 35, relics: 5 });
    expect(stateStashMix("Monarchy", true)).toEqual({ bullion: 20, art: 40, regalia: 35, relics: 5 });
    expect(factionStashMix("commercial")).toEqual({ bullion: 60, art: 20, regalia: 15, relics: 5 });
    expect(factionStashMix("religious")).toEqual({ bullion: 10, art: 20, regalia: 20, relics: 50 });

    expect(stashComposition(1000, { bullion: 60, art: 20, regalia: 15, relics: 5 })).toEqual({
      bullion: 600,
      art: 200,
      regalia: 150,
      relics: 50
    });
    expect(dominantStashPart(factionStashMix("underworld"))).toBe("bullion");
    expect(dominantStashPart(factionStashMix("religious"))).toBe("relics");
    expect(stashPartLabel("regalia")).toBe("crown regalia");
  });

  it("seizes a share of a stash, keeping half and losing the rest", () => {
    expect(seizeStash(1000, STASH_LOOT_SHARE.sack)).toEqual({
      seized: 200,
      kept: 100,
      lost: 100,
      remaining: 800
    });
    expect(seizeStash(undefined, 0.5)).toEqual({ seized: 0, kept: 0, lost: 0, remaining: 0 });
    expect(seizeStash(100, 2)).toEqual({ seized: 100, kept: 50, lost: 50, remaining: 0 });
  });

  it("finds a museum in the state capital", () => {
    vi.stubGlobal("pack", {
      states: [{ i: 0 }, { i: 1, capital: 1 }],
      history: { living: { burgs: { 1: { civBuildings: ["museum"] } } } }
    });
    expect(stateHasMuseum(1)).toBe(true);
    expect(stateHasMuseum(0)).toBe(false);
  });

  it("derives splendor and its small prestige effects", () => {
    expect(stashSplendor(18000, 18000)).toBe(1);
    expect(stashSplendor(9000, 18000)).toBe(0.5);
    expect(stashSplendor(undefined, 18000)).toBe(0);
    expect(stateStashSplendor(state({ economy: { ...state().economy, stash: 18000 } }))).toBe(1);
    expect(factionStashSplendor({ stash: 18000 }, 50)).toBe(1);

    expect(stashPrestigeInfluence(0.9)).toBe(0);
    expect(stashPrestigeInfluence(1)).toBe(1);
    expect(stashStabilityBonus(0.4)).toBe(0);
    expect(stashStabilityBonus(0.5)).toBe(1);
    expect(stashStabilityBonus(1)).toBe(2);
    expect(stashStabilityBonus(2)).toBe(3);
    expect(stashCorruptionTemptation(0.5)).toBe(1.5);
    expect(stashCorruptionTemptation(2)).toBe(3);
  });

  it("sells a quarter of the stash at half its value", () => {
    expect(sellStash(1000, STASH_SALE_SHARE)).toEqual({ sold: 250, proceeds: 125, remaining: 750 });
    expect(sellStash(undefined)).toEqual({ sold: 0, proceeds: 0, remaining: 0 });
  });

  it("summarizes a stock in months of its current surplus", () => {
    const kingdom = state();
    kingdom.economy.stash = 27000;
    const summary = stateStashSummary(kingdom);
    expect(summary).toMatchObject({
      value: 27000,
      hasStash: true,
      months: 18,
      targetMonths: 18,
      nature: "Royal collection",
      splendor: 1.5
    });
    expect(summary.composition).toEqual({ bullion: 8100, art: 8100, regalia: 9450, relics: 1350 });

    const company = faction({ stash: 4320 });
    const companySummary = factionStashSummary(company, 8);
    expect(companySummary).toMatchObject({
      value: 4320,
      hasStash: true,
      months: 18,
      targetMonths: 18,
      nature: "Commercial reserves",
      splendor: 1.5
    });
    expect(companySummary.composition).toEqual({ bullion: 2592, art: 864, regalia: 648, relics: 216 });

    expect(stateStashSummary(state()).hasStash).toBe(false);
    expect(stashMonthsHeld(27000, 50)).toBe(18);
  });
});
