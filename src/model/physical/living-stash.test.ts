import { describe, expect, it } from "vitest";
import type { State } from "@/model/political/states-generator";
import type { Faction } from "@/types/factions";
import {
  advanceStash,
  factionBaseHoardMonths,
  factionStashTarget,
  INITIAL_STASH_SHARE,
  MAX_STASH_MONTHS,
  MIN_STASH_MONTHS,
  STASH_DECAY,
  STASH_GROWTH,
  STASH_MONTH_DAYS,
  stashMonths,
  stashMultiplier,
  stashTarget,
  stateBaseHoardMonths,
  stateDailySurplus,
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
});
