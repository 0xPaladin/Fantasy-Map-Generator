import { beforeEach, describe, expect, it } from "vitest";
import type { State } from "@/model/political/states-generator";
import type { HistoricalFigure } from "@/types/history";
import type { LivingWorldState } from "@/types/living";
import {
  ensureCommanders,
  ensureHeroGuildState,
  ensureHeroSheet,
  getHeroState,
  setHeroDoctrine,
  setHeroesHost,
  setHeroPush,
  spawnProtege
} from "./living-heroes";

describe("living-heroes", () => {
  let mockLiving: LivingWorldState;

  beforeEach(() => {
    mockLiving = {
      seed: "heroes-seed",
      tick: 1
    } as unknown as LivingWorldState;

    setHeroesHost({
      getState: () => mockLiving,
      pushNews: () => {}
    });

    globalThis.options = {
      map: { lore: { calendar: { year: 1000 } } }
    } as unknown as typeof options;

    globalThis.pack = {
      history: { figures: [] },
      cultures: [{ i: 0 }, { i: 1, name: "Aeloran" }],
      states: [
        { i: 0 },
        {
          i: 1,
          name: "Aeloria",
          military: [
            {
              i: 1,
              name: "1st Sages",
              crew: [],
              units: [{ type: "sage_coven", hp: 10, exp: 0 }]
            }
          ]
        } as unknown as State
      ]
    } as unknown as typeof pack;
  });

  function makeFigure(i: number, overrides: Partial<HistoricalFigure> = {}): HistoricalFigure {
    return {
      i,
      name: `Adventurer ${i}`,
      culture: 1,
      birth: 970,
      roles: [{ type: "adventurer", target: { kind: "culture", id: 1 }, from: 990 }],
      alignment: "neutral",
      virtues: [],
      vices: [],
      skills: { m: 2, w: 1, s: 1, c: 0 },
      xp: 0,
      archetype: "warden",
      disciplines: ["melee"],
      progression: { appliedLevel: 1, pendingChoices: 0, picks: [] },
      ...overrides
    };
  }

  it("initializes and retrieves hero vital state", () => {
    const fig = makeFigure(1);
    pack.history.figures!.push(fig);

    const state = ensureHeroGuildState(fig);
    expect(state).toBeDefined();
    expect(state.resolve).toBeGreaterThan(0);
    expect(state.stamina).toBeGreaterThan(0);
    expect(state.doctrine).toBeDefined();

    expect(getHeroState(1)).toBe(state);
    expect(setHeroDoctrine(1, "hunt_troubles")).toBe(true);
    expect(state.doctrine).toBe("hunt_troubles");
    expect(setHeroPush(1, true)).toBe(true);
    expect(state.push).toBe(true);
  });

  it("stores vitals on the hero sheet", () => {
    const fig = makeFigure(4);
    pack.history.figures!.push(fig);

    const state = ensureHeroGuildState(fig);
    expect(ensureHeroSheet(fig).condition?.resolve).toBe(state.resolve);

    state.stamina = 3;
    expect(ensureHeroSheet(fig).condition?.stamina).toBe(3);
  });

  it("spawns a protege carrying one skill point forward", () => {
    const veteran = makeFigure(2);
    pack.history.figures!.push(veteran);

    const protege = spawnProtege(mockLiving, veteran);
    expect(protege).toBeDefined();
    expect(protege!.i).not.toBe(veteran.i);
    expect(protege!.skills?.m ?? 0).toBeGreaterThanOrEqual(veteran.skills!.m);
  });

  it("ensures commanders for fielded specialist units", () => {
    ensureCommanders();
    const regiment = pack.states[1].military![0];
    expect(regiment.crew?.length).toBeGreaterThan(0);
    const commander = pack.history.figures!.find(f => f.i === regiment.crew![0]);
    expect(commander).toBeDefined();
    expect(commander?.roles.some(r => r.type === "specialist" && r.specialty === "sage")).toBe(true);
  });
});
