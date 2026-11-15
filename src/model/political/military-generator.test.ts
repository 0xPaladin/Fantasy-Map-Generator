import { beforeEach, describe, expect, it } from "vitest";
import { Military } from "@/model/political/military-generator";
import {
  getAstralMilitaryUnits,
  getDefaultMilitaryUnits,
  isAstralMilitaryUnits
} from "@/model/political/military-units";

function setupAstralPack(development: number, rosterId = "verseCelestialBase") {
  globalThis.TIME = false;
  globalThis.options = {
    app: { mode: "" },
    map: {
      astral: true,
      seed: "mil-test",
      military: { units: getAstralMilitaryUnits() },
      units: { population: { scale: 1000, urbanization: { rate: 0.1 } } },
      goods: []
    }
  } as unknown as typeof options;

  globalThis.grid = {
    cells: {
      temp: new Int8Array([10, 10, 10, 10])
    }
  } as unknown as typeof grid;

  globalThis.pack = {
    cells: {
      i: [0, 1, 2, 3],
      p: [
        [10, 10],
        [20, 20],
        [30, 30],
        [40, 40]
      ],
      state: new Uint16Array([0, 1, 1, 1]),
      biome: new Uint8Array([1, 1, 1, 1]),
      culture: new Uint16Array([0, 1, 1, 1]),
      religion: new Uint16Array([0, 0, 0, 0]),
      f: new Uint16Array([0, 1, 1, 1]),
      t: new Int8Array([1, 1, 1, 1]),
      province: new Uint16Array([0, 0, 0, 0]),
      burg: new Uint16Array([0, 1, 2, 0]),
      pop: new Float32Array([0, 50, 40, 20]),
      s: new Uint16Array([0, 100, 80, 30]),
      haven: new Uint16Array([0, 0, 0, 0]), // landlocked cells — fleets must still form in Astral TL3+
      development: new Uint8Array([0, development, development, development]),
      good: new Uint16Array([0, 0, 0, 0]),
      c: [[1], [0, 2], [1, 3], [2]]
    },
    cultures: [
      { i: 0, name: "Wild", base: "VRCEL" },
      { i: 1, name: "Celestial", base: "VRCEL", type: "Generic", expansionism: 1, development }
    ],
    burgs: [
      0,
      { i: 1, cell: 1, x: 20, y: 20, name: "Aurelia", culture: 1, state: 1, capital: 1, port: 1, population: 25 },
      { i: 2, cell: 2, x: 30, y: 30, name: "Vesper", culture: 1, state: 1, capital: 0, port: 0, population: 15 }
    ],
    states: [
      { i: 0, name: "Neutrals" },
      {
        i: 1,
        name: "Aurelia",
        form: "Republic",
        type: "Generic",
        capital: 1,
        center: 1,
        culture: 1,
        rosterId,
        area: 120,
        cells: 3,
        burgs: 2,
        diplomacy: ["x", "x"],
        neighbors: [],
        expansionism: 1,
        alert: 1,
        military: []
      }
    ],
    markets: [],
    biomes: [{ habitability: 100 }, { habitability: 100 }],
    deals: []
  } as unknown as typeof pack;
}

describe("Astral military units and generator", () => {
  beforeEach(() => {
    setupAstralPack(85);
  });

  it("distinguishes Astral military units from standard fantasy units", () => {
    const standard = getDefaultMilitaryUnits();
    const astral = getAstralMilitaryUnits();

    expect(isAstralMilitaryUnits(standard)).toBe(false);
    expect(isAstralMilitaryUnits(astral)).toBe(true);
    expect(astral.map(u => u.name)).toEqual([
      "militia",
      "marines",
      "garrison",
      "strike_wings",
      "cruiser_squadrons",
      "capital_ships",
      "void_fleets"
    ]);
  });

  it("restricts TL0-2 worlds to ground forces and unlocks orbital fleets for TL3+ landlocked systems", () => {
    setupAstralPack(30); // TL1-2 Industrial/Primitive
    Military.generate();
    const lowTechRegs = pack.states[1].military ?? [];
    expect(lowTechRegs.length).toBeGreaterThan(0);
    expect(lowTechRegs.every(r => r.n === 0)).toBe(true);
    expect(lowTechRegs.reduce((sum, r) => sum + Number(Military.getTotal(r)), 0)).toBeGreaterThan(0);

    setupAstralPack(85); // TL4 Interstellar
    Military.generate();
    const highTechRegs = pack.states[1].military ?? [];
    const fleetRegs = highTechRegs.filter(r => r.n === 1);
    expect(fleetRegs.length).toBeGreaterThan(0);
    expect(fleetRegs.reduce((sum, r) => sum + Number(Military.getTotal(r)), 0)).toBeGreaterThan(0);
  });

  it("resolves roster unit IDs and applies Astral tech multipliers in getPower", () => {
    setupAstralPack(20, "verseCelestialBase");
    pack.states[1].military = [
      {
        i: 1,
        name: "Test",
        a: 100,
        u: { cel_paladin: 100 },
        cell: 1,
        x: 20,
        y: 20,
        bx: 20,
        by: 20,
        n: 0,
        state: 1,
        icon: "⚔️"
      }
    ];
    const lowTechPower = Military.getPower(1);

    setupAstralPack(110, "verseCelestialBase");
    pack.states[1].military = [
      {
        i: 1,
        name: "Test",
        a: 100,
        u: { cel_paladin: 100 },
        cell: 1,
        x: 20,
        y: 20,
        bx: 20,
        by: 20,
        n: 0,
        state: 1,
        icon: "⚔️"
      }
    ];
    const postScarcityPower = Military.getPower(1);

    expect(lowTechPower).toBeGreaterThan(0);
    expect(postScarcityPower).toBeGreaterThan(lowTechPower * 2);
  });

  it("grants post-scarcity systems full equipment in getEquipped", () => {
    setupAstralPack(110);
    const equipped = Military.getEquipped(1, { militia: 100, void_fleets: 50 });
    expect(equipped.militia).toBe(1);
    expect(equipped.void_fleets).toBe(1);
  });
});
