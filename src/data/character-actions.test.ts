import { describe, expect, it } from "vitest";
import {
  ACTION_DEFS,
  ACTIONS,
  actionCheck,
  attributesFromSkills,
  dieForRating,
  HERO_STARTING_PACKAGES,
  heroStartingPackage,
  legacyActionForPool
} from "@/data/character-actions";
import { HERO_ARCHETYPE_IDS } from "@/data/hero-archetypes";
import { DICE, type Die } from "@/types/character-actions";
import type { Rng } from "@/utils/rng";

function diceOf(): Rng {
  let index = 0;
  const values = [2, 5, 6, 1];
  return { d: () => values[index++] ?? 1 } as unknown as Rng;
}

describe("character actions", () => {
  it("defines the twelve actions once", () => {
    expect(ACTIONS).toHaveLength(12);
    for (const action of ACTIONS) {
      expect(ACTION_DEFS[action].id).toBe(action);
      expect(ACTION_DEFS[action].label.length).toBeGreaterThan(0);
      expect(ACTION_DEFS[action].tags.length).toBeGreaterThan(0);
    }
  });

  it("gives every archetype a starting package with one d10, one d8, two d6 and eight d4", () => {
    for (const id of HERO_ARCHETYPE_IDS) {
      const pkg = heroStartingPackage(id);
      const dice = Object.values(pkg.actions);

      expect(Object.keys(pkg.actions)).toHaveLength(ACTIONS.length);
      expect(dice.filter(die => die === "d10")).toHaveLength(1);
      expect(dice.filter(die => die === "d8")).toHaveLength(1);
      expect(dice.filter(die => die === "d6")).toHaveLength(2);
      expect(dice.filter(die => die === "d4")).toHaveLength(8);

      for (const attribute of Object.values(pkg.attributes)) {
        expect(attribute).toBeGreaterThanOrEqual(-1);
        expect(attribute).toBeLessThanOrEqual(2);
      }

      expect(pkg.ability.length).toBeGreaterThan(0);
      expect(HERO_STARTING_PACKAGES[id]).toBeDefined();
    }
  });

  it("returns a copy so editor changes do not mutate the catalogue", () => {
    const first = heroStartingPackage("warden");
    first.actions.strike = "d12";
    first.attributes.might = -1;

    const second = heroStartingPackage("warden");
    expect(second.actions.strike).not.toBe("d12");
    expect(second.attributes.might).toBe(2);
  });

  it("maps legacy ratings into dice and attributes", () => {
    expect(dieForRating(0)).toBe("d4");
    expect(dieForRating(1)).toBe("d6");
    expect(dieForRating(2)).toBe("d8");
    expect(dieForRating(3)).toBe("d10");
    expect(dieForRating(4)).toBe("d12");

    expect(attributesFromSkills({ m: 0, w: 1, s: 2, c: 3 })).toEqual({
      might: -1,
      agility: 2,
      wits: 0,
      presence: 1
    });
  });

  it("maps legacy pools to a default action", () => {
    expect(legacyActionForPool("m")).toBe("strike");
    expect(legacyActionForPool("w")).toBe("investigate");
    expect(legacyActionForPool("s")).toBe("command");
    expect(legacyActionForPool("c")).toBe("scout");
  });

  it("rolls one die and adds the attribute", () => {
    const result = actionCheck(
      diceOf(),
      {
        actions: { ...HERO_STARTING_PACKAGES.warden.actions, strike: "d6" },
        attributes: { might: 2, agility: 0, wits: 0, presence: 0 }
      },
      { action: "strike" }
    );

    expect(result.roll).toBe(2);
    expect(result.total).toBe(4);
    expect(result.critical).toBe(false);
    expect(result.complication).toBe(false);
    expect(result.success).toBeUndefined();
  });

  it("takes the best die with advantage and the worst with disadvantage", () => {
    const hero = {
      actions: { ...HERO_STARTING_PACKAGES.warden.actions, strike: "d6" as Die },
      attributes: { might: 2, agility: 0, wits: 0, presence: 0 }
    };

    const advantage = actionCheck(diceOf(), hero, { action: "strike", advantage: true });
    expect(advantage.roll).toBe(5);
    expect(advantage.total).toBe(7);

    const disadvantage = actionCheck(diceOf(), hero, { action: "strike", disadvantage: true });
    expect(disadvantage.roll).toBe(2);
    expect(disadvantage.total).toBe(4);
  });

  it("marks criticals, complications and success", () => {
    const hero = {
      actions: { ...HERO_STARTING_PACKAGES.warden.actions, strike: "d6" as Die },
      attributes: { might: 1, agility: 0, wits: 0, presence: 0 }
    };

    const critical = actionCheck({ d: () => 6 } as unknown as Rng, hero, { action: "strike", dc: 7 });
    expect(critical.critical).toBe(true);
    expect(critical.success).toBe(true);

    const complication = actionCheck({ d: () => 1 } as unknown as Rng, hero, { action: "strike", dc: 4 });
    expect(complication.complication).toBe(true);
    expect(complication.success).toBe(false);
  });

  it("keeps every die in the ladder", () => {
    for (const die of Object.values(HERO_STARTING_PACKAGES).flatMap(pkg => Object.values(pkg.actions))) {
      expect(DICE).toContain(die);
    }
  });
});
