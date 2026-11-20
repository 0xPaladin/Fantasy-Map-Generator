import { describe, expect, it } from "vitest";
import { ACTIONS, type ActionId, type Die } from "@/types/character-actions";
import type { DelveHero } from "@/types/delves";
import type { Rng } from "@/utils/rng";
import { resolveChallenge } from "./challenge";

function hero(figureId: number, overrides: Partial<DelveHero> = {}): DelveHero {
  const actions = Object.fromEntries(ACTIONS.map(action => [action, "d8"])) as Record<ActionId, Die>;
  return {
    figureId,
    name: `Hero ${figureId}`,
    actions,
    attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
    resolve: 10,
    maxResolve: 10,
    stamina: 2,
    maxStamina: 2,
    ...overrides
  };
}

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

const base = {
  action: "strike" as const,
  tags: ["combat"] as const,
  alertDie: 6,
  ratingDie: 4
};

describe("resolveChallenge", () => {
  it("wins when the officer max beats the threat max", () => {
    const result = resolveChallenge({
      ...base,
      rng: scripted(6, 4, 2, 1),
      acting: hero(1),
      support: hero(2)
    });

    expect(result.kind).toBe("success");
    expect(result.officerMax).toBe(6);
    expect(result.threatMax).toBe(2);
    expect(result.successRanks).toBe(1);
    expect(result.resolveLoss).toBe(0);
  });

  it("critically succeeds on officer doubles above the threat", () => {
    const result = resolveChallenge({
      ...base,
      rng: scripted(5, 5, 2, 1),
      acting: hero(1),
      support: hero(2)
    });

    expect(result.kind).toBe("critical_success");
    expect(result.successRanks).toBe(5);
  });

  it("twists when the two maxes tie", () => {
    const result = resolveChallenge({
      ...base,
      rng: scripted(4, 2, 4, 1),
      acting: hero(1),
      support: hero(2)
    });

    expect(result.kind).toBe("twist");
    expect(result.successRanks).toBe(0);
    expect(result.failureRanks).toBe(0);
  });

  it("scores failure ranks from the margin", () => {
    const result = resolveChallenge({
      ...base,
      rng: scripted(1, 2, 6, 4),
      acting: hero(1),
      support: hero(2)
    });

    expect(result.kind).toBe("failure");
    expect(result.failureRanks).toBe(2);
    expect(result.resolveLoss).toBe(2);
  });

  it("critically fails on threat doubles above the officer", () => {
    const result = resolveChallenge({
      ...base,
      ratingDie: 6,
      rng: scripted(1, 1, 6, 6),
      acting: hero(1),
      support: hero(2)
    });

    expect(result.kind).toBe("critical_failure");
    expect(result.failureRanks).toBe(2);
    expect(result.injured).toBe(true);
  });

  it("spends Stamina to reroll a failed attempt", () => {
    const result = resolveChallenge({
      ...base,
      rng: scripted(1, 2, 6, 4, 8, 1, 1, 1),
      acting: hero(1),
      support: hero(2),
      maxRerolls: 2
    });

    expect(result.kind).toBe("success");
    expect(result.staminaSpent).toBe(1);
    expect(result.rerolls).toBe(1);
  });

  it("uses free rerolls before Stamina", () => {
    const result = resolveChallenge({
      ...base,
      rng: scripted(1, 2, 6, 4, 8, 1, 1, 1),
      acting: hero(1),
      support: hero(2),
      maxRerolls: 2,
      freeRerolls: 1
    });

    expect(result.kind).toBe("success");
    expect(result.staminaSpent).toBe(0);
    expect(result.freeRerollsUsed).toBe(1);
  });

  it("adds attribute, discipline and aspect, then subtracts injuries", () => {
    const result = resolveChallenge({
      ...base,
      rng: scripted(3, 1, 1),
      acting: hero(1, {
        attributes: { might: 2, agility: 0, wits: 0, presence: 0 },
        disciplines: ["melee"],
        injuries: 1
      })
    });

    expect(result.dm).toBe(2);
    expect(result.officerMax).toBe(5);
    expect(result.kind).toBe("success");
  });

  it("adds at most the support bonus for a matching support", () => {
    const result = resolveChallenge({
      ...base,
      rng: scripted(3, 2, 1, 1),
      acting: hero(1),
      support: hero(2, { disciplines: ["melee", "athletics"] }),
      supportBonus: 1
    });

    expect(result.dm).toBe(1);
  });
});
