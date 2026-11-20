import { describe, expect, it } from "vitest";
import { DEFAULT_DELVE_CONFIG } from "@/data/delve-config";
import { generateDungeonProfile } from "@/model/story/dungeon-generator";
import { ACTIONS, type ActionId, type Die } from "@/types/character-actions";
import type { DelveHero, DelveOptions } from "@/types/delves";
import { runDelve } from "./engine";
import { alertFromInhabitants } from "./progress";

const context = {
  seed: "engine-test",
  cell: 42,
  cultureName: "Aeloran",
  alignment: "neutral" as const,
  biomeName: "forest",
  height: 12
};

const profile = generateDungeonProfile(context, "", { areaCount: 6, size: "small" });

function actions(die: Die): Record<ActionId, Die> {
  return Object.fromEntries(ACTIONS.map(action => [action, die])) as Record<ActionId, Die>;
}

function hero(figureId: number, overrides: Partial<DelveHero> = {}): DelveHero {
  return {
    figureId,
    name: `Hero ${figureId}`,
    actions: actions("d8"),
    attributes: { might: 1, agility: 1, wits: 1, presence: 1 },
    resolve: 14,
    maxResolve: 14,
    stamina: 2,
    maxStamina: 2,
    ...overrides
  };
}

const party = [
  hero(1, {
    actions: actions("d12"),
    attributes: { might: 2, agility: 2, wits: 2, presence: 2 },
    resolve: 20,
    maxResolve: 20,
    stamina: 3,
    maxStamina: 3
  }),
  hero(2, { actions: actions("d10"), resolve: 16, maxResolve: 16 }),
  hero(3, { actions: actions("d8"), resolve: 12, maxResolve: 12 })
];

const options: DelveOptions = { seed: "delve-seed", leaderId: 1, order: "swift", retainers: 1 };

describe("runDelve", () => {
  it("is deterministic for the same seed, party and season", () => {
    expect(runDelve(profile, party, options)).toEqual(runDelve(profile, party, options));
  });

  it("reports a valid outcome and bounded objectives", () => {
    const result = runDelve(profile, party, options);

    expect(["triumph", "retreat", "defeat"]).toContain(result.outcome);
    expect(result.objectives.length).toBeGreaterThanOrEqual(2);
    expect(result.objectives.length).toBeLessThanOrEqual(8);
    expect(result.objectivesTotal).toBe(result.objectives.length);
    expect(result.objectivesDone).toBeLessThanOrEqual(result.objectivesTotal);
    expect(result.heroes).toHaveLength(party.length);
  });

  it("starts the alert from the inhabitants rating", () => {
    const result = runDelve(profile, party, options);
    expect(result.startingAlert).toBe(alertFromInhabitants(profile.inhabitants.rating));
  });

  it("keeps the party's condition inside its bounds", () => {
    const result = runDelve(profile, party, options);
    for (const heroResult of result.heroes) {
      expect(heroResult.resolve).toBeGreaterThanOrEqual(0);
      expect(heroResult.stamina).toBeGreaterThanOrEqual(0);
      expect(heroResult.injuries).toBeGreaterThanOrEqual(0);
      expect(heroResult.injuries).toBeLessThanOrEqual(DEFAULT_DELVE_CONFIG.challenge.injuryLimit);
    }
    expect(result.supplies).toBeGreaterThanOrEqual(0);
  });

  it("awards the XP formula", () => {
    const result = runDelve(profile, party, options);
    const expected = Math.max(
      0,
      DEFAULT_DELVE_CONFIG.xp.base +
        result.objectivesDone * DEFAULT_DELVE_CONFIG.alerts[result.startingAlert].xp -
        result.escalation * DEFAULT_DELVE_CONFIG.xp.escalationPenalty
    );
    expect(result.xp).toBe(expected);
  });

  it("logs the delve from start to end", () => {
    const result = runDelve(profile, party, options);
    expect(result.events[0].type).toBe("delve_start");
    expect(result.events.at(-1)?.type).toBe("delve_end");
    expect(result.events.some(event => event.type === "challenge")).toBe(true);
  });

  it("honours the objective cap", () => {
    const result = runDelve(profile, party, { ...options, maxObjectives: 2 });
    expect(result.objectives.length).toBeLessThanOrEqual(2);
  });

  it("does not let a weak party walk away with a triumph", () => {
    const weak = [
      hero(1, {
        actions: actions("d4"),
        attributes: { might: -1, agility: -1, wits: -1, presence: -1 },
        resolve: 3,
        maxResolve: 3,
        stamina: 0,
        maxStamina: 0
      }),
      hero(2, {
        actions: actions("d4"),
        attributes: { might: -1, agility: -1, wits: -1, presence: -1 },
        resolve: 3,
        maxResolve: 3,
        stamina: 0,
        maxStamina: 0
      })
    ];
    expect(runDelve(profile, weak, { seed: "weak-party", order: "swift" }).outcome).not.toBe("triumph");
  });

  it("rejects an empty or oversized party", () => {
    expect(() => runDelve(profile, [], options)).toThrow("1–6 heroes");
    expect(() =>
      runDelve(
        profile,
        Array.from({ length: 7 }, (_, index) => hero(index)),
        options
      )
    ).toThrow("1–6 heroes");
  });
});
