import { describe, expect, it } from "vitest";
import {
  heroInjuryTags,
  heroMaxVitals,
  heroTemperamentFor,
  heroTemperamentTags,
  heroVitalsBudget,
  injuryPenalty,
  recoverInjuries
} from "@/data/hero-vitals";

describe("hero vitals", () => {
  it("scales the budget by level band", () => {
    expect(heroVitalsBudget(1)).toBe(20);
    expect(heroVitalsBudget(2)).toBe(20);
    expect(heroVitalsBudget(3)).toBe(26);
    expect(heroVitalsBudget(4)).toBe(26);
    expect(heroVitalsBudget(5)).toBe(30);
    expect(heroVitalsBudget(8)).toBe(36);
  });

  it("shifts the split by archetype", () => {
    expect(heroMaxVitals("warden", 1)).toEqual({ maxResolve: 12, maxStamina: 8 });
    expect(heroMaxVitals("scholar", 1)).toEqual({ maxResolve: 8, maxStamina: 12 });
    expect(heroMaxVitals("ranger", 1)).toEqual({ maxResolve: 9, maxStamina: 11 });
    expect(heroMaxVitals("priest", 1)).toEqual({ maxResolve: 10, maxStamina: 10 });
  });

  it("adds path grants to the maximums", () => {
    expect(heroMaxVitals("warden", 3, ["warden_shieldwall"])).toEqual({ maxResolve: 16, maxStamina: 11 });
    expect(heroMaxVitals("ranger", 3, ["ranger_pathfinder"])).toEqual({ maxResolve: 12, maxStamina: 15 });
  });

  it("maps archetypes to temperament knobs and display tags", () => {
    expect(heroTemperamentFor("warden")).toMatchObject({ boldness: 0.7, teamplay: 0.85 });
    expect(heroTemperamentTags(heroTemperamentFor("warden"))).toEqual(["Bold", "Loyal"]);
    expect(heroTemperamentTags(heroTemperamentFor("factor"))).toEqual(["Cautious", "Grasping"]);
  });

  it("maps injuries to tags and counts only active matches", () => {
    expect(heroInjuryTags("wounded")).toEqual(["combat"]);
    expect(heroInjuryTags("lost")).toEqual(["travel", "wild"]);

    const injuries = [
      { kind: "wounded" as const, untilTick: 5 },
      { kind: "shaken" as const, untilTick: 10 },
      { kind: "lost" as const }
    ];
    expect(injuryPenalty(injuries, ["combat", "social"], 4)).toBe(2);
    expect(injuryPenalty(injuries, ["combat"], 6)).toBe(0);
    expect(injuryPenalty(injuries, ["wild"], 100)).toBe(1);
  });

  it("expires timed injuries and lets a healer clear one per season", () => {
    const injuries = [
      { kind: "wounded" as const, untilTick: 3 },
      { kind: "shaken" as const, untilTick: 9 },
      { kind: "lost" as const }
    ];
    expect(recoverInjuries(injuries, 4, false)).toEqual([injuries[1], injuries[2]]);
    expect(recoverInjuries(injuries, 4, true)).toEqual([injuries[2]]);
  });
});
