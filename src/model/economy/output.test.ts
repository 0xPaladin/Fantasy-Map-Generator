import { beforeEach, describe, expect, it } from "vitest";
import type { Good } from "@/types/economy";
import { Output, TRADING_POST_EARNINGS } from "./output";

const makeGood = (name: string): Good => ({ i: 1, name }) as Good;

function seedLiving(cells: Record<number, { improvement?: string; pillaged?: boolean }>, techs: string[] = []): void {
  pack.history.living = {
    enabled: true,
    tick: 4,
    season: 0,
    seed: "seed",
    snapshotIntervalYears: 10,
    promptOnPlayerBattles: false,
    states: { 1: { researchedTechs: techs } },
    provinces: {},
    burgs: {},
    cells: Object.fromEntries(Object.entries(cells).map(([cell, state]) => [Number(cell), state])),
    recentNews: []
  } as unknown as typeof pack.history.living;
  pack.cells.state = new Uint16Array(16);
  pack.cells.state[5] = 1;
  pack.cells.state[6] = 1;
}

describe("Output Living World sim multipliers (economy alignment Phase 3)", () => {
  beforeEach(() => {
    globalThis.pack = {
      cells: {
        i: Array.from({ length: 16 }, (_, cell) => cell),
        state: new Uint16Array(16),
        biome: new Uint8Array(16)
      },
      history: {}
    } as unknown as typeof pack;
  });

  it("leaves the economy alone without a simulation", () => {
    expect(Output.getSimMultiplier(makeGood("Grain"), 5)).toBe(1);
    expect(Output.getSimEarningsMultiplier(5)).toBe(1);
  });

  it("collapses output on pillaged land", () => {
    seedLiving({ 5: { pillaged: true } });
    expect(Output.getSimMultiplier(makeGood("Grain"), 5)).toBe(0.25);
    expect(Output.getSimEarningsMultiplier(5)).toBe(1);
  });

  it("boosts the goods each Builder improvement tends", () => {
    seedLiving({ 5: { improvement: "farm" }, 6: { improvement: "mine" } });
    expect(Output.getSimMultiplier(makeGood("Grain"), 5)).toBeCloseTo(1.35);
    expect(Output.getSimMultiplier(makeGood("Wine"), 5)).toBeCloseTo(1.35);
    expect(Output.getSimMultiplier(makeGood("Iron"), 5)).toBe(1); // farms do not dig
    expect(Output.getSimMultiplier(makeGood("Iron"), 6)).toBeCloseTo(1.4);
    expect(Output.getSimMultiplier(makeGood("Fish"), 6)).toBe(1);
  });

  it("raises farm and mine output further with the right technologies", () => {
    seedLiving({ 5: { improvement: "farm" }, 6: { improvement: "mine" } }, ["fertilizer", "chemistry"]);
    expect(Output.getSimMultiplier(makeGood("Grain"), 5)).toBeCloseTo(1.5);
    expect(Output.getSimMultiplier(makeGood("Cattle"), 5)).toBe(1); // techs boost only tended goods
    expect(Output.getSimMultiplier(makeGood("Iron"), 6)).toBeCloseTo(1.6);
  });

  it("does not boost goods for an unknown improvement", () => {
    seedLiving({ 5: { improvement: "road" } });
    expect(Output.getSimMultiplier(makeGood("Grain"), 5)).toBe(1);
  });

  it("lets a trading post lift rural earnings in its cell", () => {
    seedLiving({ 5: { improvement: "trading_post" } });
    expect(Output.getSimEarningsMultiplier(5)).toBe(TRADING_POST_EARNINGS);
    expect(Output.getSimEarningsMultiplier(6)).toBe(1);
  });
});
