import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoricalFigure } from "@/types/history";
import { figureBias } from "./figure-bias";
import {
  AUDIT_CORRUPTION_CUT,
  auditRecovery,
  rulerEconomyModifiers,
  stateCorruption,
  stateEconomyModifiers
} from "./living-rulers";

const identity = { corruption: 0, court: 1, administration: 1, upkeep: 1, siege: 1 };

describe("Ruler economy modifiers (economy alignment Phase 5 §5.2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("rulerEconomyModifiers", () => {
    it("is close to identity for a plain figure", () => {
      const modifiers = rulerEconomyModifiers({ martial: 0, civic: 0, pious: 0, cruel: 0 });
      expect(modifiers).toEqual(identity);
    });

    it("cuts official corruption for a civic ruler and raises it for a cruel one", () => {
      expect(rulerEconomyModifiers({ martial: 0, civic: 0.6, pious: 0, cruel: 0 }).corruption).toBe(-3);
      expect(rulerEconomyModifiers({ martial: 0, civic: 0, pious: 0, cruel: 0.5 }).corruption).toBe(3);
      expect(rulerEconomyModifiers({ martial: 0, civic: 0.8, pious: 0, cruel: 0.8 }).corruption).toBeGreaterThan(0);
    });

    it("gets more out of a pious court, a civic administration and a martial army", () => {
      const modifiers = rulerEconomyModifiers({ martial: 0.5, civic: 0.5, pious: 0.5, cruel: 0 });
      expect(modifiers.court).toBeGreaterThan(1);
      expect(modifiers.administration).toBeGreaterThan(1);
      expect(modifiers.upkeep).toBeGreaterThan(1);
      expect(modifiers.siege).toBeGreaterThan(modifiers.upkeep); // a siege rewards a martial ruler most
    });
  });

  describe("stateEconomyModifiers", () => {
    const ruler: HistoricalFigure = {
      i: 5,
      name: "Queen Alenna",
      culture: 1,
      birth: 980,
      alignment: "lawful",
      virtues: ["just", "diligent"],
      vices: [],
      roles: [{ type: "ruler", target: { kind: "state", id: 1 }, from: 1000 }]
    };

    beforeEach(() => {
      globalThis.pack = {
        states: [undefined, { i: 1, culture: 1, economy: { budget: { corruption: 20 } } }],
        cultures: [undefined, { i: 1, values: ["investment"] }],
        history: {
          figures: [ruler],
          living: { states: { 1: { stateId: 1, rulerId: 5 } } }
        }
      } as unknown as typeof pack;
    });

    it("is identity without a Living World state", () => {
      globalThis.pack = {
        states: [undefined, { i: 1, economy: { budget: { corruption: 20 } } }]
      } as unknown as typeof pack;
      expect(stateEconomyModifiers(1)).toEqual(identity);
    });

    it("reads the ruler's traits", () => {
      const bias = figureBias(ruler, ["investment"]);
      expect(stateEconomyModifiers(1).corruption).toBeLessThan(0);
      expect(stateEconomyModifiers(1).administration).toBeCloseTo(1 + 0.2 * bias.civic, 2);
    });

    it("adds half of a magistrate's traits to the ruler's", () => {
      const rulerOnly = stateEconomyModifiers(1);
      pack.history.figures!.push({
        i: 6,
        name: "Magistrate Vell",
        culture: 1,
        birth: 970,
        virtues: ["just", "prudent", "methodical"],
        vices: [],
        roles: [{ type: "specialist", specialty: "magistrate", target: { kind: "state", id: 1 }, from: 1000 }]
      } as HistoricalFigure);

      const withCouncil = stateEconomyModifiers(1);
      expect(withCouncil.corruption).toBeLessThan(rulerOnly.corruption);
      expect(withCouncil.administration).toBeGreaterThan(rulerOnly.administration);
    });

    it("leaves a state without a ruler at identity", () => {
      pack.history.living!.states = {};
      expect(stateEconomyModifiers(1)).toEqual(identity);
    });

    it("moves the official corruption budget within 0..100", () => {
      const state = pack.states[1];
      expect(stateCorruption(state)).toBeCloseTo(20 + stateEconomyModifiers(1).corruption, 6);

      state.economy.budget.corruption = 2;
      expect(stateCorruption(state)).toBeGreaterThanOrEqual(0);

      pack.history.figures![0].virtues = [];
      pack.history.figures![0].alignment = "evil";
      pack.history.figures![0].vices = ["cruel", "greedy", "selfish", "merciless"];
      state.economy.budget.corruption = 99;
      expect(stateCorruption(state)).toBe(100);
    });
  });

  describe("audit", () => {
    it("recovers more graft for a civic ruler", () => {
      expect(auditRecovery(0, null)).toBe(0);
      expect(auditRecovery(10, null)).toBeLessThan(auditRecovery(10, { martial: 0, civic: 0.8, pious: 0, cruel: 0 }));
      expect(auditRecovery(10, { martial: 0, civic: 0.8, pious: 0, cruel: 0 })).toBe(14);
    });

    it("cuts a few points of the budget", () => {
      expect(AUDIT_CORRUPTION_CUT).toBeGreaterThan(0);
    });
  });
});
