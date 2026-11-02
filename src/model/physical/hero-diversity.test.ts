// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { HERO_ARCHETYPES } from "@/data/hero-archetypes";
import type { HistoricalFigure } from "@/types/history";
import { createRng } from "@/utils/rng";
import {
  applyHeroLevels,
  ensureHeroIdentity,
  figureCheckRoll,
  heroAlignmentModifier,
  xpForHeroLevel
} from "./living-generator";

function makeHero(overrides: Partial<HistoricalFigure> = {}): HistoricalFigure {
  return {
    i: 1,
    name: "Test Hero",
    culture: 1,
    birth: 980,
    roles: [{ type: "adventurer", target: { kind: "culture", id: 1 }, from: 1000 }],
    virtues: [],
    vices: [],
    skills: { m: 0, w: 0, s: 0, c: 0 },
    xp: 0,
    ...overrides
  };
}

describe("hero progression", () => {
  it("maps levels onto xp thresholds", () => {
    expect(xpForHeroLevel(1)).toBe(0);
    expect(xpForHeroLevel(2)).toBe(60);
    expect(xpForHeroLevel(3)).toBe(140);
  });

  it("applies exactly one deterministic growth point per level", () => {
    const figure = makeHero({
      archetype: "warden",
      skills: { ...HERO_ARCHETYPES.warden.baseSkills },
      progression: { appliedLevel: 1 }
    });

    figure.xp = xpForHeroLevel(2);
    expect(applyHeroLevels(figure)).toBe(true);
    expect(figure.skills?.m).toBe(3);
    expect(figure.progression?.appliedLevel).toBe(2);

    expect(applyHeroLevels(figure)).toBe(false);
    expect(figure.skills?.m).toBe(3);
  });

  it("turns levels 3 and 6 into pending choices instead of points", () => {
    const figure = makeHero({
      archetype: "warden",
      skills: { ...HERO_ARCHETYPES.warden.baseSkills },
      progression: { appliedLevel: 2 }
    });

    figure.xp = xpForHeroLevel(3);
    applyHeroLevels(figure);
    expect(figure.progression?.pendingChoices).toBe(1);
    expect(figure.skills).toEqual({ m: 2, w: 0, s: 1, c: 0 });

    figure.xp = xpForHeroLevel(4);
    applyHeroLevels(figure);
    expect(figure.skills?.s).toBe(2);
  });

  it("caps pool ratings at five", () => {
    const figure = makeHero({
      archetype: "warden",
      skills: { m: 5, w: 0, s: 5, c: 5 },
      progression: { appliedLevel: 1 }
    });

    figure.xp = xpForHeroLevel(20);
    applyHeroLevels(figure);
    expect(figure.skills?.m).toBe(5);
    expect(figure.skills?.s).toBe(5);
    expect(figure.skills?.c).toBe(5);
  });

  it("gives old figures an identity without retroactive points", () => {
    const figure = makeHero({
      roles: [{ type: "specialist", target: { kind: "state", id: 1 }, from: 1000, specialty: "sage" }],
      skills: { m: 1, w: 4, s: 1, c: 0 },
      xp: xpForHeroLevel(5)
    });
    const skills = { ...figure.skills };

    ensureHeroIdentity(figure);

    expect(figure.archetype).toBe("scholar");
    expect(figure.disciplines).toEqual([...HERO_ARCHETYPES.scholar.disciplines]);
    expect(figure.progression?.appliedLevel).toBe(5);
    expect(figure.skills).toEqual(skills);
    expect(applyHeroLevels(figure)).toBe(false);
  });

  it("leaves an existing identity alone", () => {
    const figure = makeHero({
      archetype: "shadow",
      disciplines: ["stealth", "perception", "artifice"],
      progression: { appliedLevel: 4, pendingChoices: 1, picks: [] }
    });
    ensureHeroIdentity(figure);
    expect(figure.archetype).toBe("shadow");
    expect(figure.disciplines).toEqual(["stealth", "perception", "artifice"]);
    expect(figure.progression?.appliedLevel).toBe(4);
  });

  it("clamps the alignment modifier to one point", () => {
    expect(heroAlignmentModifier(makeHero({ virtues: ["a", "b", "c"] }))).toBe(1);
    expect(heroAlignmentModifier(makeHero({ vices: ["a", "b", "c"] }))).toBe(-1);
    expect(heroAlignmentModifier(makeHero({ virtues: ["a", "b"], vices: ["c"] }))).toBe(1);
  });

  it("bounds the discipline and aspect advantage of a matched hero", () => {
    const matched = makeHero({
      skills: { m: 3, w: 0, s: 0, c: 0 },
      virtues: ["brave"],
      vices: [],
      disciplines: ["melee", "tactics", "ride"]
    });
    const unmatched = makeHero({
      skills: { m: 3, w: 0, s: 0, c: 0 },
      virtues: ["just"],
      vices: [],
      disciplines: ["healing"]
    });
    const tags = ["combat", "lair"] as const;

    const good = figureCheckRoll(createRng("fit-check"), matched, "m", 0, 12, 0, 0, tags);
    const poor = figureCheckRoll(createRng("fit-check"), unmatched, "m", 0, 12, 0, 0, tags);

    expect(good.matchedDisciplines).toEqual(["melee", "tactics", "ride"]);
    expect(good.aspect).toBe(1);
    expect(good.total - poor.total).toBe(3);
    expect(good.total - poor.total).toBeLessThanOrEqual(3);
  });
});
