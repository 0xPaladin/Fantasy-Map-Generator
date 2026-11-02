import { describe, expect, it } from "vitest";
import { activeAspects, aspectBonus, HERO_ASPECTS } from "@/data/hero-aspects";

describe("hero aspects", () => {
  it("uses only the first virtue and first vice", () => {
    const figure = { virtues: ["brave", "observant"], vices: ["greedy", "cowardly"] };
    expect(activeAspects(figure).virtue?.trait).toBe("brave");
    expect(activeAspects(figure).vice?.trait).toBe("greedy");
  });

  it("maps representative virtues and vices to mission tags", () => {
    expect(HERO_ASPECTS.observant?.tags).toContain("ruin");
    expect(HERO_ASPECTS.observant?.note).toContain("+1");
    expect(HERO_ASPECTS.cowardly?.modifier).toBe(-1);
    expect(HERO_ASPECTS.cowardly?.tags).toContain("combat");
  });

  it("adds one for a matching virtue and subtracts one for a matching vice", () => {
    expect(aspectBonus({ virtues: ["brave"], vices: [] }, ["combat"])).toBe(1);
    expect(aspectBonus({ virtues: [], vices: ["cowardly"] }, ["lair"])).toBe(-1);
    expect(aspectBonus({ virtues: ["observant"], vices: [] }, ["combat"])).toBe(0);
  });

  it("clamps a matching virtue and vice to zero", () => {
    expect(aspectBonus({ virtues: ["brave"], vices: ["greedy"] }, ["combat", "social"])).toBe(0);
  });

  it("treats unmapped traits as flavour", () => {
    expect(aspectBonus({ virtues: ["bold"], vices: [] }, ["combat"])).toBe(0);
  });
});
