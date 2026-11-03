import { beforeEach, describe, expect, it } from "vitest";
import { ASTRAL_GOODS_DATA } from "@/data/astral-goods";
import { tradeGoodsFor } from "@/model/physical/astral-naming";
import type { Burg } from "@/model/political/burgs-generator";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { Production } from "./production-generator";

describe("astral goods and system-level production", () => {
  beforeEach(() => {
    globalThis.options = {
      map: {
        seed: "astral-prod-seed",
        cultures: { set: "astralTrek" },
        units: { population: { scale: 1000, urbanization: { rate: 0.1 } } }
      }
    } as unknown as typeof options;

    const burg1: Burg = {
      i: 1,
      cell: 2,
      x: 100,
      y: 100,
      name: "Alpha Prime",
      population: 50,
      market: 1,
      tags: ["world-industrial"]
    };

    const burg2: Burg = {
      i: 2,
      cell: 4,
      x: 200,
      y: 200,
      name: "Beta Outpost",
      population: 20,
      market: 1,
      tags: ["world-primitive"]
    };

    const market = {
      i: 1,
      centerBurgId: 1,
      color: "#ffffff",
      goods: {}
    };

    globalThis.pack = {
      goods: structuredClone(ASTRAL_GOODS_DATA),
      cells: {
        i: [0, 1, 2, 3, 4, 5],
        burg: [0, 0, 1, 0, 2, 0],
        good: new Uint16Array(6),
        biome: [1, 1, 1, 1, 1, 1],
        culture: [1, 1, 1, 1, 1, 1],
        state: [1, 1, 1, 1, 1, 1],
        religion: [1, 1, 1, 1, 1, 1],
        market: [1, 1, 1, 1, 1, 1],
        pop: [10, 10, 50, 10, 20, 10],
        h: [50, 50, 50, 50, 50, 50]
      },
      burgs: [0, burg1, burg2],
      markets: [0, market],
      deals: [],
      biomes: [{ habitability: 100 }, { habitability: 100 }],
      cultures: [0, { type: "Generic" }]
    } as unknown as typeof pack;

    Goods.sync();
    Markets.sync();
  });

  it("detects astral goods catalogue and switches properly", () => {
    expect(Goods.isAstralCatalogue()).toBe(true);
    Goods.restoreDefaults();
    expect(Goods.isAstralCatalogue()).toBe(false);
    Goods.switchToAstralGoods();
    expect(Goods.isAstralCatalogue()).toBe(true);
  });

  it("places resources only at star systems (burg.cell) and nowhere else", () => {
    Goods.generate();

    // Cells 0, 1, 3, 5 are non-burg cells and must have 0
    expect(pack.cells.good[0]).toBe(0);
    expect(pack.cells.good[1]).toBe(0);
    expect(pack.cells.good[3]).toBe(0);
    expect(pack.cells.good[5]).toBe(0);

    // Cells 2 and 4 are burg cells and must have the primary rolled trade good
    const burg1 = pack.burgs[1];
    const burg2 = pack.burgs[2];
    const [expected1] = tradeGoodsFor(burg1);
    const [expected2] = tradeGoodsFor(burg2);

    expect(pack.cells.good[burg1.cell]).toBe(expected1);
    expect(pack.cells.good[burg2.cell]).toBe(expected2);
  });

  it("returns zero rural cell production for non-burg cells and valid output for system cells", () => {
    Goods.generate();

    const emptyOutput = Production.getCellProduction(1, {});
    expect(Object.keys(emptyOutput)).toHaveLength(0);

    const systemOutput = Production.getCellProduction(2, {});
    const primaryGood = pack.cells.good[2];
    expect(systemOutput[primaryGood]).toBeGreaterThan(0);
  });

  it("pre-seeds both 1d10 trade table commodities into burg production state", () => {
    Goods.generate();
    const burg1 = pack.burgs[1];
    const market = pack.markets[1];
    // biome-ignore lint/complexity/useLiteralKeys: test access to private method
    const index = Production["buildProductionIndex"](pack.goods);
    // biome-ignore lint/complexity/useLiteralKeys: test access to private method
    const state = Production["createBurgProductionState"](burg1, market, index);

    const [goodA, goodB] = tradeGoodsFor(burg1);
    expect(state.inventory[goodA]).toBeGreaterThan(0);
    expect(state.inventory[goodB]).toBeGreaterThan(0);

    const recordedGoods = state.records.map(r => ("goodId" in r ? r.goodId : null));
    expect(recordedGoods).toContain(goodA);
    expect(recordedGoods).toContain(goodB);
  });

  it("applies world-type modifiers and penalizes high-tech on primitive worlds", () => {
    const industrialBurgCell = 2;
    const primitiveBurgCell = 4;

    const postechGood = pack.goods.find(g => g.name === "Fusion Plants")!;
    // biome-ignore lint/complexity/useLiteralKeys: test access to private method
    const indMod = Production["getModifiers"](postechGood, industrialBurgCell);
    // biome-ignore lint/complexity/useLiteralKeys: test access to private method
    const primMod = Production["getModifiers"](postechGood, primitiveBurgCell);

    // Industrial world favors tools and trade goods, while primitive heavily penalizes postech
    expect(indMod).toBeGreaterThan(1.0);
    expect(primMod).toBeLessThan(0.5);
  });

  it("collects rural production into market stocks exclusively from systems", () => {
    Goods.generate();
    Markets.collectRuralProduction();

    const market = pack.markets[1];
    const burg1Good = pack.cells.good[2];
    const burg2Good = pack.cells.good[4];

    expect(market.goods[burg1Good]?.stock).toBeGreaterThan(0);
    expect(market.goods[burg2Good]?.stock).toBeGreaterThan(0);
  });
});
