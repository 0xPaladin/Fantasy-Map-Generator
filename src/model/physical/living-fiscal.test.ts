import { beforeEach, describe, expect, it } from "vitest";
import type { HistoricalFigure } from "@/types/history";
import { type FiscalEvents, fiscalProfile, fiscalStride, fiscalTarget, fiscalValue } from "./living-fiscal";

const calm: FiscalEvents = { war: false, rebellion: false, hazard: false, bankrupt: false };

const martialRuler: HistoricalFigure = {
  i: 5,
  name: "Warlord Kesh",
  culture: 1,
  birth: 980,
  alignment: "evil",
  virtues: ["brave", "decisive", "wrathful"],
  vices: ["cruel", "greedy"],
  roles: [{ type: "ruler", target: { kind: "state", id: 1 }, from: 1000 }]
};

const civicRuler: HistoricalFigure = {
  i: 7,
  name: "Consul Vell",
  culture: 1,
  birth: 980,
  alignment: "lawful",
  virtues: ["just", "diligent", "temperate"],
  vices: [],
  roles: [{ type: "ruler", target: { kind: "state", id: 1 }, from: 1000 }]
};

function stateFixture(form: string) {
  return {
    i: 1,
    culture: 1,
    form,
    economy: {
      budget: { court: 20, administration: 10, infrastructure: 8, military: 25, corruption: 15 },
      salesTax: 0.08,
      pollTax: 0.07
    }
  };
}

describe("Fiscal policy (living-fmg-native Phase 3)", () => {
  beforeEach(() => {
    globalThis.pack = {
      states: [undefined, stateFixture("Monarchy")],
      cultures: [undefined, { i: 1, values: ["power"] }],
      history: { figures: [martialRuler], living: { states: { 1: { stateId: 1, rulerId: 5 } } } }
    } as unknown as typeof pack;
  });

  it("lets a senate resist and an anarchy levy nothing", () => {
    expect(fiscalStride(stateFixture("Anarchy") as never)).toBe(0);
    expect(fiscalStride(stateFixture("Republic") as never)).toBe(1);
    expect(fiscalStride(stateFixture("Union") as never)).toBe(1);
    expect(fiscalStride(stateFixture("Monarchy") as never)).toBe(2);
  });

  it("returns null without a Living ruler", () => {
    pack.history.living!.states = {};
    expect(fiscalProfile(stateFixture("Monarchy") as never, calm)).toBeNull();
  });

  it("leans a martial ruler toward the army and the head tax", () => {
    const profile = fiscalProfile(stateFixture("Monarchy") as never, calm)!;
    expect(profile.budget.military).toBeGreaterThan(25);
    expect(profile.budget.court).toBeGreaterThanOrEqual(20);
    expect(profile.pollTax).toBeGreaterThan(0.07);
    expect(profile.corruption).toBeGreaterThan(15);
  });

  it("leans a civic ruler toward the chancery, works and honest books", () => {
    pack.history.figures = [civicRuler];
    pack.history.living!.states = { 1: { stateId: 1, rulerId: 7 } } as never;
    const profile = fiscalProfile(stateFixture("Republic") as never, calm)!;
    expect(profile.budget.administration).toBeGreaterThan(10);
    expect(profile.budget.infrastructure).toBeGreaterThan(8);
    expect(profile.corruption).toBeLessThan(15);
    expect(profile.salesTax).toBeGreaterThan(0.08);
  });

  it("re-targets the purse for war, rebellion, hazards and bankruptcy", () => {
    const base = fiscalProfile(stateFixture("Monarchy") as never, calm)!;
    const war = fiscalProfile(stateFixture("Monarchy") as never, { ...calm, war: true })!;
    const rebellion = fiscalProfile(stateFixture("Monarchy") as never, { ...calm, rebellion: true })!;
    const hazard = fiscalProfile(stateFixture("Monarchy") as never, { ...calm, hazard: true })!;
    const bankrupt = fiscalProfile(stateFixture("Monarchy") as never, { ...calm, bankrupt: true })!;

    expect(war.budget.military - base.budget.military).toBe(20);
    expect(war.budget.court).toBeLessThan(base.budget.court);
    expect(rebellion.budget.administration - base.budget.administration).toBe(10);
    expect(hazard.budget.infrastructure - base.budget.infrastructure).toBe(10);
    expect(bankrupt.budget.court).toBeLessThan(base.budget.court);
    expect(bankrupt.corruption).toBeGreaterThan(base.corruption);
  });

  it("clamps every line and keeps taxes near their form's base", () => {
    pack.states[1]!.economy.budget = {
      court: 100,
      administration: 100,
      infrastructure: 100,
      military: 100,
      corruption: 100
    };
    const profile = fiscalProfile(stateFixture("Monarchy") as never, {
      war: true,
      rebellion: true,
      hazard: true,
      bankrupt: true
    })!;
    for (const value of Object.values(profile.budget)) expect(value).toBeLessThanOrEqual(100);
    expect(profile.corruption).toBeLessThanOrEqual(100);
    expect(profile.salesTax).toBeLessThanOrEqual(0.24);
    expect(profile.pollTax).toBeLessThanOrEqual(0.21);
  });

  it("reads and aims lines through the same accessors", () => {
    const state = stateFixture("Monarchy") as never as Parameters<typeof fiscalValue>[0];
    const profile = fiscalProfile(state, calm)!;
    expect(fiscalValue(state, "military")).toBe(25);
    expect(fiscalTarget(profile, "military")).toBe(profile.budget.military);
    expect(fiscalValue(state, "salesTax")).toBe(0.08);
    expect(fiscalTarget(profile, "salesTax")).toBe(profile.salesTax);
  });
});
