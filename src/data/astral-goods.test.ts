import { beforeEach, describe, expect, it } from "vitest";
import {
  ASTRAL_GOODS_DATA,
  ASTRAL_WORLD_TYPE_KEYS,
  ASTRAL_WORLD_TYPES,
  isAstralGoodsCatalogue
} from "@/data/astral-goods";
import { setWorldTypeFor, toSystem, tradeGoodsFor, worldTypeFor } from "@/model/physical/astral-naming";

describe("astral goods and world types data", () => {
  it("defines all 8 world types with 10 trade goods and 6 troubles", () => {
    expect(ASTRAL_WORLD_TYPE_KEYS).toHaveLength(8);
    for (const key of ASTRAL_WORLD_TYPE_KEYS) {
      const spec = ASTRAL_WORLD_TYPES[key];
      expect(spec.name).toBe(key);
      expect(spec.summary).toBeTruthy();
      expect(spec.tradeTable).toHaveLength(10);
      expect(spec.troubles).toHaveLength(6);
      expect(spec.troubleChance).toBeGreaterThanOrEqual(1);

      // Verify every trade good id is within 1..34
      for (const goodId of spec.tradeTable) {
        expect(goodId).toBeGreaterThanOrEqual(1);
        expect(goodId).toBeLessThanOrEqual(34);
        const good = ASTRAL_GOODS_DATA.find(g => g.i === goodId);
        expect(good).toBeDefined();
      }
    }
  });

  it("defines exactly 34 standard commodities with valid properties and recipes", () => {
    expect(ASTRAL_GOODS_DATA).toHaveLength(34);

    for (let i = 0; i < ASTRAL_GOODS_DATA.length; i++) {
      const good = ASTRAL_GOODS_DATA[i];
      expect(good.i).toBe(i + 1);
      expect(good.name).toBeTruthy();
      expect(good.unit).toBe("ton");
      expect(good.value).toBeGreaterThan(0);
      expect(good.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(good.icon).toBeTruthy();
      expect(good.tags.length).toBeGreaterThan(0);
      expect(good.biomeOutput).toEqual({});

      if (good.recipes) {
        expect(good.recipes.length).toBeGreaterThan(0);
        for (const recipe of good.recipes) {
          const ingredientIds = Object.keys(recipe).map(Number);
          expect(ingredientIds.length).toBeGreaterThan(0);
          for (const ingId of ingredientIds) {
            expect(ingId).toBeGreaterThanOrEqual(1);
            expect(ingId).toBeLessThanOrEqual(34);
            expect(recipe[ingId]).toBeGreaterThan(0);
          }
        }
      }
    }
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
          unit: "pile",
          icon: "goods-wood",
          color: "#000"
        }
      ])
    ).toBe(false);
  });
});

describe("system world type and trade rolls", () => {
  beforeEach(() => {
    globalThis.options = {
      map: {
        seed: "astral-trade-seed",
        cultures: { set: "astralTrek" },
        units: { population: { scale: 1000, urbanization: { rate: 0.1 } } }
      }
    } as unknown as typeof options;
    globalThis.pack = {
      burgs: [
        0,
        { i: 1, cell: 10, x: 50, y: 50, name: "Sol", population: 10, capital: 1, port: 1 },
        { i: 2, cell: 20, x: 80, y: 80, name: "Rimworld", population: 2 }
      ]
    } as unknown as typeof pack;
  });

  it("derives world types deterministically", () => {
    const burg = pack.burgs[1];
    const type1 = worldTypeFor(burg);
    const type2 = worldTypeFor(burg);
    expect(type1).toBe(type2);
    expect(ASTRAL_WORLD_TYPE_KEYS).toContain(type1);
  });

  it("respects and modifies explicit world type tags", () => {
    const burg = { ...pack.burgs[1], tags: ["world-industrial"] };
    expect(worldTypeFor(burg)).toBe("Industrial");

    setWorldTypeFor(burg, "Alien");
    expect(burg.tags).toContain("world-alien");
    expect(worldTypeFor(burg)).toBe("Alien");

    setWorldTypeFor(burg, null);
    expect(burg.tags?.some(t => t.startsWith("world-"))).toBe(false);
  });

  it("rolls two distinct trade commodities from the world trade table", () => {
    const burg = pack.burgs[1];
    const [goodA, goodB] = tradeGoodsFor(burg);
    expect(goodA).not.toBe(goodB);

    const worldType = worldTypeFor(burg);
    const validGoods = ASTRAL_WORLD_TYPES[worldType].tradeTable;
    expect(validGoods).toContain(goodA);
    expect(validGoods).toContain(goodB);
  });

  it("populates world type and trade goods into toSystem", () => {
    const system = toSystem(pack.burgs[1]);
    expect(system.worldType).toBe(worldTypeFor(pack.burgs[1]));
    expect(system.worldTypeName).toBe(`${system.worldType} World`);
    expect(system.tradeGoods).toEqual(tradeGoodsFor(pack.burgs[1]));
  });
});
