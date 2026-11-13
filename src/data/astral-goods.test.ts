import { describe, expect, it } from "vitest";
import { ASTRAL_GOODS_DATA, isAstralGoodsCatalogue } from "@/data/astral-goods";

describe("astral goods data", () => {
  it("defines 36 sci-fi & post-scarcity commodities with valid properties, deposits, TL gating, and recipes", () => {
    expect(ASTRAL_GOODS_DATA).toHaveLength(36);

    for (let i = 0; i < ASTRAL_GOODS_DATA.length; i++) {
      const good = ASTRAL_GOODS_DATA[i];
      expect(good.i).toBe(i + 1);
      expect(good.name).toBeTruthy();
      expect(good.unit).toBe("ton");
      expect(good.value).toBeGreaterThan(0);
      expect(good.carriage).toBeGreaterThan(0);
      expect(good.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(good.icon).toBeTruthy();
      expect(good.tags.length).toBeGreaterThan(0);

      if (good.recipes) {
        expect(good.recipes.length).toBeGreaterThan(0);
        for (const recipe of good.recipes) {
          const ingredientIds = Object.keys(recipe).map(Number);
          expect(ingredientIds.length).toBeGreaterThan(0);
          for (const ingId of ingredientIds) {
            expect(ingId).toBeGreaterThanOrEqual(1);
            expect(ingId).toBeLessThanOrEqual(36);
            expect(recipe[ingId]).toBeGreaterThan(0);
          }
        }
      } else {
        expect(good.deposits).toBeDefined();
        expect(good.distribution).toBeTruthy();
      }
    }

    const compiler = ASTRAL_GOODS_DATA.find(g => g.name === "Matter Compiler Matrix");
    expect(compiler?.development).toBe(90);
    expect(compiler?.tags).toContain("post-scarcity");

    const colonialSupplies = ASTRAL_GOODS_DATA.find(g => g.name === "Colonial Supplies");
    expect(colonialSupplies?.development).toBe(54);
    expect(colonialSupplies?.recipes?.length).toBe(2); // biological + fusion synthesis
  });

  it("identifies astral goods catalogue", () => {
    expect(isAstralGoodsCatalogue(ASTRAL_GOODS_DATA)).toBe(true);
    expect(isAstralGoodsCatalogue([])).toBe(false);
    expect(
      isAstralGoodsCatalogue([
        {
          i: 1,
          name: "Wood",
          tags: ["construction"],
          value: 1,
          carriage: 1,
          unit: "pile",
          icon: "goods-wood",
          color: "#000"
        }
      ])
    ).toBe(false);
  });
});
