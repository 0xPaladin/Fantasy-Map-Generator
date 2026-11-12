import { beforeEach, describe, expect, it } from "vitest";
import { Options } from "@/model/options/options-model";
import type { Planet } from "@/model/physical/astral-system/planet";
import type { Province } from "@/model/political/provinces-generator";
import type { State } from "@/model/political/states-generator";
import type { Culture } from "@/model/society/cultures-generator";
import type { Religion } from "@/model/society/religions-generator";
import type { PackedGraph } from "@/types/packed-graph";
import type { SystemOriginContext } from "@/types/planetary";
import {
  applySystemPolityContext,
  extractSystemOriginContext,
  preparePlanetaryGenerationConfig,
  seedPlanetaryCultures
} from "../planetary-polity";

describe("planetary-polity module", () => {
  beforeEach(() => {
    globalThis.options = Options.getDefaultOptions();
  });

  const mockContext: SystemOriginContext = {
    burgId: 5,
    burgName: "Epsilon Eridani Prime",
    population: 60,
    isCapital: true,
    port: 1,
    culture: {
      i: 2,
      name: "Solaris",
      base: "ENGLI",
      color: "#2a75d3",
      shield: "heater",
      type: "Generic",
      ancestry: "Human",
      code: "SOL",
      origins: [0]
    } as unknown as Culture,
    state: {
      i: 3,
      name: "United Colonies",
      form: "Republic",
      formName: "Federation",
      color: "#3065b5",
      type: "Generic",
      coa: { shield: "heater" }
    } as unknown as State,
    province: {
      i: 1,
      name: "Sol Sector",
      state: 3
    } as unknown as Province,
    religion: {
      i: 4,
      name: "Starlight Faith",
      type: "Organized",
      form: "Monotheism",
      deity: "The Cosmos",
      color: "#ffd700",
      code: "SF"
    } as unknown as Religion
  };

  it("extracts system origin context from packed graph", () => {
    const pack = {
      burgs: [
        null,
        null,
        null,
        null,
        null,
        { i: 5, name: "New Earth", cell: 10, culture: 1, state: 1, capital: 1, population: 35, port: 1 }
      ],
      cultures: [null, { i: 1, name: "Terran", base: "ENGLI", color: "#112233", origins: [0] }],
      states: [null, { i: 1, name: "Sol Alliance", form: "Republic", color: "#334455" }],
      provinces: [null, { i: 1, name: "Core Province", state: 1 }],
      religions: [null, { i: 1, name: "Solar Creed", type: "Organized", color: "#eedd22" }],
      cells: {
        province: new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
        religion: new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
      }
    } as unknown as PackedGraph;

    const ctx = extractSystemOriginContext(pack, 5);
    expect(ctx).toBeDefined();
    expect(ctx!.burgName).toBe("New Earth");
    expect(ctx!.culture?.name).toBe("Terran");
    expect(ctx!.state?.name).toBe("Sol Alliance");
    expect(ctx!.province?.name).toBe("Core Province");
    expect(ctx!.religion?.name).toBe("Solar Creed");
    expect(ctx!.isCapital).toBe(true);
  });

  it("prepares generation config based on habitability and polity context", () => {
    const config = structuredClone(options);

    // Habitable capital world
    preparePlanetaryGenerationConfig(config, { HI: 1, kind: "planet" } as Planet, mockContext);
    expect(config.generation.states.limit).toBe(2); // multiple sub-states for populated capital
    expect(config.generation.states.growthRate).toBe(3.0);
    expect(config.generation.states.freeBurgs).toBe(0);
    expect(config.generation.provinces.ratio).toBe(100);
    expect(config.generation.cultures.limit).toBe(1);
    expect(config.generation.religions.limit).toBe(0);

    // Hostile outpost world
    preparePlanetaryGenerationConfig(config, { HI: 3, kind: "planet" } as Planet, mockContext);
    expect(config.generation.states.limit).toBe(1);
    expect(config.generation.states.growthRate).toBe(1.5);
    expect(config.generation.burgs.limit).toBeLessThanOrEqual(12);

    // Inhabitable world
    preparePlanetaryGenerationConfig(config, { HI: 5, kind: "planet" } as Planet, mockContext);
    expect(config.generation.states.limit).toBe(0);
    expect(config.generation.burgs.limit).toBe(0);
  });

  it("seeds locked cultures preserving sector culture attributes", () => {
    const testPack = {} as PackedGraph;
    seedPlanetaryCultures(testPack, mockContext);

    expect(testPack.cultures).toHaveLength(2);
    expect(testPack.cultures[0].name).toBe("Wildlands");
    expect(testPack.cultures[1].name).toBe("Solaris");
    expect(testPack.cultures[1].base).toBe("ENGLI");
    expect(testPack.cultures[1].color).toBe("#2a75d3");
    expect(testPack.cultures[1].lock).toBe(true);
    expect(testPack.cultures[1].origins).toEqual([0]);
  });

  it("applies sector polity context to generated world", () => {
    const testPack = {
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "RandomCulture", base: "FANTASY", color: "#999999" }
      ],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "OldState", type: "Generic", capital: 1, color: "#111111" },
        { i: 2, name: "SubState", type: "Generic", capital: 2, color: "#222222", diplomacy: [] }
      ],
      burgs: [null, { i: 1, name: "Prime City", cell: 10 }, { i: 2, name: "Colony Bay", cell: 20 }],
      provinces: [{ i: 0 }, { i: 1, name: "Northern District" }],
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Random Cult", type: "Cult", color: "#333333" }
      ],
      cells: {
        i: [0, 1, 2],
        h: new Uint8Array([10, 30, 40]),
        culture: new Uint16Array([0, 1, 1]),
        religion: new Uint16Array([0, 0, 0])
      }
    } as unknown as PackedGraph;

    applySystemPolityContext(testPack, { name: "Astra IV" } as unknown as Planet, mockContext);

    // 1. Culture updated to sector culture
    expect(testPack.cultures[1].name).toBe("Solaris");
    expect(testPack.cultures[1].base).toBe("ENGLI");
    expect(testPack.cultures[1].color).toBe("#2a75d3");

    // 2. States bound to sector polity
    expect(testPack.states[1].name).toBe("United Colonies Authority");
    expect(testPack.states[1].formName).toBe("Administration");
    expect(testPack.states[1].fullName).toBe("United Colonies - Astra IV Administration");
    expect(testPack.states[1].color).toBe("#3065b5");

    // Sub-state bound as charter with allied diplomacy
    expect(testPack.states[2].name).toBe("Colony Bay Charter");
    expect(testPack.states[2].formName).toBe("Charter");
    expect(testPack.states[2].diplomacy?.[1]).toBe("Ally");

    // 3. Religion bound to sector religion
    expect(testPack.religions[1].name).toBe("Starlight Faith");
    expect(testPack.religions[1].type).toBe("Organized");
    expect(testPack.religions[1].form).toBe("Monotheism");
    expect(testPack.religions[1].deity).toBe("The Cosmos");
    expect(testPack.religions[1].color).toBe("#ffd700");
    expect(testPack.religions[1].code).toBe("SF");
    expect(testPack.cells.religion[1]).toBe(1);
    expect(testPack.cells.religion[2]).toBe(1);
  });
});
