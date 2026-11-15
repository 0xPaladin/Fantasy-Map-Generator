import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  draw: vi.fn(),
  drawAll: vi.fn(),
  restore: vi.fn(),
  refresh: vi.fn(),
  tip: vi.fn(),
  applyPreset: vi.fn(),
  loadPreset: vi.fn().mockResolvedValue({ styles: {} }),
  isSystem: vi.fn().mockReturnValue(true)
}));

vi.mock("@/renderers/layers", () => ({
  Layers: {
    state: { order: ["states", "burgIcons", "labels"], active: ["states", "burgIcons", "labels"] },
    restore: mocks.restore,
    drawAll: mocks.drawAll,
    draw: mocks.draw,
    isActive: vi.fn().mockReturnValue(false),
    subscribe: vi.fn()
  }
}));

vi.mock("@/renderers/performance", () => ({
  applyPerformanceSettings: vi.fn(),
  setHaloOwnedByBorders: vi.fn()
}));

vi.mock("@/services/style-presets", () => ({
  StylePresetsService: {
    isSystem: mocks.isSystem,
    load: mocks.loadPreset
  }
}));

vi.mock("@/controllers", () => ({
  Controllers: {
    StylePresetsEditor: { applyPreset: mocks.applyPreset },
    StyleEditor: { refresh: vi.fn() },
    View3d: { enterStandard: vi.fn() }
  }
}));

vi.mock("@/ui/tooltips", () => ({ tip: mocks.tip, clearMainTip: vi.fn() }));
vi.mock("@/ui/dialog/dialog-helpers", () => ({ refreshEditors: mocks.refresh }));
vi.mock("@/ui/map/zoom", () => ({ invokeActiveZooming: vi.fn() }));

import { Goods } from "@/model/economy/goods-generator";
import { getDefaultMilitaryUnits, isAstralMilitaryUnits } from "@/model/political/military-units";
import { noFinance } from "@/model/political/states-generator";
import { isAstralView, setAstralView } from "@/renderers/view-mode";
import { AstralMode } from "./astral-mode";

const storage = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
  clear: () => storage.clear(),
  length: 0,
  key: () => null
} as Storage;

describe("AstralMode automatic transition and reversal", () => {
  beforeEach(async () => {
    if (isAstralView()) await AstralMode.exit();
    setAstralView(false);
    vi.clearAllMocks();
    storage.clear();

    const sampleGoods = [
      {
        i: 1,
        name: "Wheat",
        tags: ["food"],
        value: 1,
        unit: "bushel",
        icon: "goods-grain",
        color: "#fff",
        biomeOutput: {},
        demandCoverage: {}
      },
      {
        i: 2,
        name: "Iron",
        tags: ["mineral"],
        value: 2,
        unit: "ingot",
        icon: "goods-iron",
        color: "#888",
        biomeOutput: {},
        demandCoverage: {}
      }
    ];

    globalThis.options = {
      app: { mode: "" },
      map: {
        astral: false,
        seed: "astral-test-seed",
        extents: "whole",
        graph: { width: 1280, height: 720 },
        style: { preset: "default" },
        cultures: { set: "european" },
        units: { population: { scale: 1000, urbanization: { rate: 0.1 } } },
        military: { units: getDefaultMilitaryUnits() },
        goods: structuredClone(sampleGoods)
      }
    } as unknown as typeof options;

    globalThis.styles = {} as unknown as typeof styles;

    const originalCells = {
      i: [0, 1, 2, 3],
      p: [
        [10, 10],
        [10, 10],
        [20, 20],
        [20, 20]
      ],
      good: new Uint16Array([0, 1, 2, 0]),
      biome: new Uint8Array([1, 1, 1, 1]),
      h: new Uint8Array([20, 20, 20, 20]),
      t: new Int8Array([1, 1, 1, 1]),
      g: new Uint16Array([0, 1, 2, 3]),
      haven: new Uint16Array([0, 0, 0, 0]),
      f: new Uint16Array([0, 0, 0, 0]),
      c: [[1], [0, 2], [1, 3], [2]],
      s: new Uint16Array([10, 10, 10, 10]),
      pop: new Float32Array([10, 10, 10, 10]),
      state: new Uint16Array([0, 1, 1, 0]),
      culture: new Uint16Array([0, 1, 1, 0]),
      religion: new Uint16Array([0, 0, 0, 0]),
      burg: new Uint16Array([0, 1, 2, 0]),
      market: new Uint16Array([0, 0, 0, 0]),
      routes: {},
      development: new Uint8Array([50, 50, 50, 50]),
      area: new Uint16Array([10, 10, 10, 10])
    };

    globalThis.grid = {
      cells: {
        temp: new Int8Array([10, 10, 10, 10])
      }
    } as unknown as typeof grid;

    globalThis.pack = {
      cells: originalCells,
      features: [{ type: "ocean" }],
      biomes: [{ habitability: 100 }, { habitability: 100 }],
      routes: [],
      cultures: [
        { i: 0, name: "Wildlings", base: "GERMA" },
        { i: 1, name: "Anglos", base: "ENGLI" }
      ],
      burgs: [
        0,
        { i: 1, cell: 1, x: 10, y: 10, name: "Oakhaven", culture: 1, state: 1, capital: 1, population: 5 },
        { i: 2, cell: 2, x: 20, y: 20, name: "Riverbend", culture: 1, state: 1, capital: 0, population: 3 }
      ],
      states: [
        { i: 0, name: "Neutrals", economy: noFinance() },
        {
          i: 1,
          name: "Gondor",
          fullName: "Kingdom of Gondor",
          form: "Monarchy",
          formName: "Kingdom",
          capital: 1,
          center: 1,
          area: 100,
          cells: 2,
          burgs: 2,
          culture: 1,
          diplomacy: ["x", "x"],
          neighbors: [],
          expansionism: 1,
          alert: 1,
          economy: noFinance(),
          salesTax: 1,
          pollTax: 1,
          treasury: 100,
          military: []
        }
      ],
      provinces: [
        { i: 0 },
        { i: 1, name: "Westfold", formName: "County", fullName: "Westfold County", burg: 1, state: 1 }
      ],
      goods: structuredClone(sampleGoods),
      markers: [
        { i: 1, cell: 1, x: 10, y: 10, type: "volcanoes", icon: "🌋", name: "Mount Doom", note: "An active volcano" },
        { i: 2, cell: 2, x: 20, y: 20, type: "dungeons", icon: "🏰", name: "Dark Cave", note: "A creepy dungeon" }
      ],
      markets: []
    } as unknown as typeof pack;
  });

  it("replaces names, goods, and markers with Astral counterparts on entering Astral view", async () => {
    expect(pack.burgs[1].name).toBe("Oakhaven");
    expect(pack.states[1].name).toBe("Gondor");
    expect(pack.markers[0].name).toBe("Mount Doom");
    expect(Goods.isAstralCatalogue()).toBe(false);

    await AstralMode.enter();

    expect(isAstralView()).toBe(true);
    expect(options.map.astral).toBe(true);

    // 1. Burg names replaced with Astral counterparts
    expect(pack.burgs[1].name).not.toBe("Oakhaven");
    expect(pack.burgs[2].name).not.toBe("Riverbend");

    // States renamed to capital's new Astral name and takes an Astral polity word
    expect(pack.states[1].name).toBe(pack.burgs[1].name);
    expect(pack.states[1].fullName).toContain(pack.burgs[1].name);
    expect(pack.provinces[1].fullName).toContain("Sector");

    // 2. Goods switched to Astral sci-fi commodities
    expect(Goods.isAstralCatalogue()).toBe(true);
    expect(options.map.goods.some(g => g.name === "Metawheat")).toBe(true);
    expect(options.map.eras.some(e => e.name === "Post-Scarcity Transhuman (TL5+)")).toBe(true);

    // 2b. Military units & state roster switched to Astral fleet-centric counterparts
    expect(isAstralMilitaryUnits(options.map.military.units)).toBe(true);
    expect(options.map.military.units.some(u => u.name === "void_fleets")).toBe(true);
    expect(pack.states[1].rosterId).toBe("scifiFederationBase");

    // 3. Markers converted to Astral anomalies
    expect(pack.markers[0].name).toBe("Nova remnants");
    expect(pack.markers[0].note).toContain("An active volcano"); // original note kept
    expect(pack.markers[1].name).toBe("Derelicts");
    expect(pack.markers[1].note).toContain("A creepy dungeon");

    expect(mocks.draw).toHaveBeenCalledWith("labels");
    expect(mocks.draw).toHaveBeenCalledWith("markers");
  });

  it("reverses names, goods, and markers back to standard FMG on exiting Astral view", async () => {
    const originalBurg1Name = pack.burgs[1].name;
    const originalBurg2Name = pack.burgs[2].name;
    const originalStateName = pack.states[1].name;
    const originalStateFullName = pack.states[1].fullName;
    const originalProvinceFullName = pack.provinces[1].fullName;
    const originalMarker1Name = pack.markers[0].name;
    const originalMarker1Note = pack.markers[0].note;
    const originalMarker1Icon = pack.markers[0].icon;

    await AstralMode.enter();

    expect(isAstralView()).toBe(true);
    expect(pack.burgs[1].name).not.toBe(originalBurg1Name);

    await AstralMode.exit();

    expect(isAstralView()).toBe(false);
    expect(options.map.astral).toBe(false);

    // 1. Names reversed back to standard FMG
    expect(pack.burgs[1].name).toBe(originalBurg1Name);
    expect(pack.burgs[2].name).toBe(originalBurg2Name);
    expect(pack.states[1].name).toBe(originalStateName);
    expect(pack.states[1].fullName).toBe(originalStateFullName);
    expect(pack.provinces[1].fullName).toBe(originalProvinceFullName);

    // 2. Goods & Eras reversed back to standard FMG
    expect(Goods.isAstralCatalogue()).toBe(false);
    expect(options.map.goods.some(g => g.name === "Wheat")).toBe(true);
    expect(options.map.goods.some(g => g.name === "Metawheat")).toBe(false);
    expect(options.map.eras.some(e => e.name === "Post-Scarcity Transhuman (TL5+)")).toBe(false);

    // 2b. Military units & state roster reversed back to standard FMG
    expect(isAstralMilitaryUnits(options.map.military.units)).toBe(false);
    expect(options.map.military.units.some(u => u.name === "infantry")).toBe(true);
    expect(pack.states[1].rosterId).toBeUndefined();

    // 3. Markers reversed back to standard FMG
    expect(pack.markers[0].name).toBe(originalMarker1Name);
    expect(pack.markers[0].note).toBe(originalMarker1Note);
    expect(pack.markers[0].icon).toBe(originalMarker1Icon);
  });
});
