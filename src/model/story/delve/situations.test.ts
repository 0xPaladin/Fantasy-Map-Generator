import { describe, expect, it } from "vitest";
import type { DungeonProfile } from "@/model/story/dungeon-generator";
import type { Rng } from "@/utils/rng";
import { alterSituation, buildObjectives, objectiveCount, situationStrength } from "./situations";

const ratings = { danger: 6, treasure: 5, scale: 1, mystery: 4, weirdness: 3 };

const profile: DungeonProfile = {
  name: "Test Keep",
  size: "small",
  areaCount: 4,
  themes: ["forbidden knowledge"],
  alignment: "neutral",
  safety: "unsafe",
  type: "unknown",
  overview: [],
  ratings,
  inhabitants: { rating: 2, groups: [{ id: "undead", label: "Undead" }] },
  treasure: { shares: { bullion: 25, regalia: 25, art: 25, relics: 25 } },
  areas: [
    {
      number: 1,
      type: "cell",
      kind: "prison",
      dressing: "straw",
      discoveries: ["Find: a key (1d6)"],
      dangers: ["Creature: a giant rat"],
      exits: []
    },
    {
      number: 2,
      type: "sanctum",
      kind: "crypt",
      dressing: "bones",
      discoveries: [],
      dangers: ["Leader: the bone priest"],
      exits: []
    },
    {
      number: 3,
      type: "hall",
      kind: "crypt",
      dressing: "dust",
      discoveries: ["Feature: a carved wall"],
      dangers: [],
      exits: []
    },
    {
      number: 4,
      type: "vault",
      kind: "crypt",
      dressing: "coins",
      discoveries: [],
      dangers: [],
      exits: []
    }
  ],
  rumors: []
};

function scripted(...faces: number[]): Rng {
  let index = 0;
  return {
    next: () => 0.5,
    range: lo => lo,
    int: lo => lo,
    d: sides => {
      const face = faces[index++] ?? 1;
      return Math.max(1, Math.min(sides, face));
    },
    choice: items => items[0],
    chance: () => false
  };
}

describe("objectiveCount", () => {
  const count = (scale: number, areaCount: number) => objectiveCount({ ratings: { ...ratings, scale }, areaCount });

  it("rises with Scale", () => {
    expect(count(1, 10)).toBe(2);
    expect(count(5, 10)).toBe(3);
    expect(count(10, 30)).toBe(7);
  });

  it("adjusts for the draft and never exceeds the area count", () => {
    expect(count(10, 9)).toBe(5);
    expect(count(5, 2)).toBe(2);
  });
});

describe("buildObjectives", () => {
  const objectives = buildObjectives(profile);

  it("splits the draft into Scale-driven objectives", () => {
    expect(objectives).toHaveLength(2);
    expect(objectives[0].title).toBe("Breach the cell");
    expect(objectives[1].title).toMatch(/^Reach the /);
    expect(objectives.every(objective => objective.situations.length > 0)).toBe(true);
  });

  it("puts the leader last in the final objective", () => {
    const last = objectives[1].situations.at(-1);
    expect(last?.title).toBe("The bone priest");
    expect(last?.kind).toBe("fight");
  });

  it("assigns kinds, actions and ratings from the area contents", () => {
    const fight = objectives[0].situations.find(situation => situation.kind === "fight");
    expect(fight?.action).toBe("strike");
    expect(fight?.rating).toBe("danger");
    expect(fight?.tags).toContain("undead");

    const clue = objectives.flatMap(objective => objective.situations).find(situation => situation.kind === "clue");
    expect(clue?.action).toBe("investigate");
    expect(clue?.rating).toBe("mystery");

    const setpiece = objectives
      .flatMap(objective => objective.situations)
      .find(situation => situation.kind === "setpiece");
    expect(setpiece?.rating).toBe("weirdness");
  });

  it("derives strength from the matching rating", () => {
    expect(situationStrength("fight", ratings)).toBe(3);
    expect(situationStrength("trap", ratings)).toBe(2);
    expect(situationStrength("clue", ratings)).toBe(2);
    expect(situationStrength("find", ratings)).toBe(1);
    expect(situationStrength("setpiece", ratings)).toBe(2);
  });
});

describe("alterSituation", () => {
  it("moves to another kind and recomputes its action, rating and strength", () => {
    const original = {
      id: "a1:fight:test",
      area: 1,
      kind: "fight" as const,
      title: "A giant rat",
      tags: ["combat" as const],
      action: "strike" as const,
      rating: "danger" as const,
      strength: 3
    };
    const altered = alterSituation(original, scripted(0), ratings);

    expect(altered.kind).toBe("trap");
    expect(altered.action).toBe("scout");
    expect(altered.rating).toBe("danger");
    expect(altered.strength).toBe(2);
  });
});
