import { beforeEach, describe, expect, it } from "vitest";
import type { HistoricalFigure } from "@/types/history";
import type { GuildState, LivingWorldState } from "@/types/living";
import type { State } from "@/types/subdivided-pack";
import {
  ensureCommanders,
  ensureHeroGuildState,
  ensureHeroSheet,
  getHeroState,
  recruitCandidate,
  recruitCost,
  retireHero,
  setHeroDoctrine,
  setHeroesHost,
  setHeroPush
} from "./living-heroes";

describe("living-heroes", () => {
  let mockLiving: LivingWorldState;
  let mockGuild: GuildState;

  beforeEach(() => {
    mockGuild = {
      tier: 1,
      gold: 200,
      renown: 20,
      ageCount: 0,
      sandboxGodMode: false,
      doctrine: "auto_bounties",
      chapterBurgIds: [1],
      roster: [],
      candidates: [],
      heroes: {},
      missions: [],
      relics: [],
      cooldowns: {},
      excavatedMarkers: [],
      popups: []
    };

    mockLiving = {
      seed: "heroes-seed",
      tick: 1,
      guild: mockGuild
    } as unknown as LivingWorldState;

    setHeroesHost({
      getState: () => mockLiving,
      getGuild: () => mockGuild,
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
    pack.history.figures.push(fig);

    const state = ensureHeroGuildState(mockGuild, fig);
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

  it("stores vitals on the hero sheet instead of the guild", () => {
    const fig = makeFigure(4);
    pack.history.figures.push(fig);

    const state = ensureHeroGuildState(mockGuild, fig);
    expect(mockGuild.heroes).toEqual({});
    expect(ensureHeroSheet(fig).condition?.resolve).toBe(state.resolve);

    state.stamina = 3;
    expect(ensureHeroSheet(fig).condition?.stamina).toBe(3);
  });

  it("recruits candidate when guild has gold and roster capacity", () => {
    const fig = makeFigure(2);
    pack.history.figures.push(fig);
    mockGuild.candidates = [2];

    const cost = recruitCost(2);
    expect(cost).toBeGreaterThan(0);
    expect(mockGuild.gold).toBeGreaterThanOrEqual(cost);

    const recruited = recruitCandidate(2);
    expect(recruited).toBe(true);
    expect(mockGuild.roster).toContain(2);
    expect(mockGuild.candidates).not.toContain(2);
    expect(mockGuild.gold).toBe(200 - cost);
  });

  it("retires veteran hero aged 50 or older", () => {
    const fig = makeFigure(3, { birth: 940 }); // age 60 in year 1000
    pack.history.figures.push(fig);
    mockGuild.roster = [3];

    const _retired = retireHero(3);
    expect(mockGuild.roster).not.toContain(3);
    expect(fig.roles[0]?.to).toBe(1000);
  });

  it("ensures commanders for fielded specialist units", () => {
    ensureCommanders();
    const regiment = pack.states[1].military![0];
    expect(regiment.crew?.length).toBeGreaterThan(0);
    const commander = pack.history.figures.find(f => f.i === regiment.crew![0]);
    expect(commander).toBeDefined();
    expect(commander?.roles.some(r => r.type === "specialist" && r.specialty === "sage")).toBe(true);
  });
});
