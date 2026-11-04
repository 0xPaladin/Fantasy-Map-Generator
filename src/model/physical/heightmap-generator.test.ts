import Alea from "alea";
import { beforeEach, describe, expect, it } from "vitest";
import { Grid } from "@/model/graph/grid-generator";
import { Lattice } from "@/model/graph/lattice";
import { Options } from "@/model/options/options-model";
import type { GridGraph } from "@/types/grid-graph";
import { HeightmapGenerator } from "./heightmap-generator";

describe("HeightmapGenerator Power tool", () => {
  const createMockGraph = (heights: number[]): GridGraph =>
    ({
      cells: {
        h: new Uint8Array(heights),
        c: heights.map(() => [])
      },
      points: heights.map((_, i) => [i, 0]),
      cellsX: heights.length,
      cellsY: 1
    }) as unknown as GridGraph;

  beforeEach(() => {
    HeightmapGenerator.clearData();
  });

  it("applies power transformation to land cells only when range is land", () => {
    const graph = createMockGraph([10, 20, 60]);
    HeightmapGenerator.setGraph(graph, { width: 100, height: 100, points: 3 } as any);

    HeightmapGenerator.addStep("Power", "0.9", "land", "0", "0");
    const result = HeightmapGenerator.getHeights()!;

    expect(result[0]).toBe(10); // Water cell is untouched
    expect(result[1]).toBe(20); // Baseline land cell stays at 20
    expect(result[2]).toBe(47); // Land elevation is compressed: (60-20)^0.9 + 20
  });

  it("compresses water and land when range is all", () => {
    const graph = createMockGraph([10, 60]);
    HeightmapGenerator.setGraph(graph, { width: 100, height: 100, points: 2 } as any);

    HeightmapGenerator.addStep("Power", "0.9", "all", "0", "0");
    const result = HeightmapGenerator.getHeights()!;

    expect(result[0]).toBe(7); // 10^0.9 truncated to Uint8
    expect(result[1]).toBe(39); // 60^0.9 truncated to Uint8
  });

  it("restricts transformation to numeric range", () => {
    const graph = createMockGraph([10, 30, 70]);
    HeightmapGenerator.setGraph(graph, { width: 100, height: 100, points: 3 } as any);

    HeightmapGenerator.addStep("Power", "0.9", "25-50", "0", "0");
    const result = HeightmapGenerator.getHeights()!;

    expect(result[0]).toBe(10); // < 25 untouched
    expect(result[1]).toBe(21); // 30^0.9 in range [25, 50]
    expect(result[2]).toBe(70); // > 50 untouched
  });
});

describe("globeWorld template", () => {
  it("is registered with id 14 and expected attributes", async () => {
    const { heightmapTemplates } = await import("@/data/heightmap-templates");
    expect(heightmapTemplates.globeWorld).toBeDefined();
    expect(heightmapTemplates.globeWorld.id).toBe(14);
    expect(heightmapTemplates.globeWorld.probability).toBe(5);
    expect(heightmapTemplates.globeWorld.template).toContain("Mask 2");
    expect(heightmapTemplates.globeWorld.template).toContain("Range 3 70 15-85 20-80");
  });

  it("leaves edge columns as ocean across multiple seeds", async () => {
    const { Grid } = await import("@/model/graph/grid-generator");
    const { Options } = await import("@/model/options/options-model");

    for (const seed of ["1", "42", "9999", "globe-test"]) {
      globalThis.options = Options.getDefaultOptions();
      options.map.seed = seed;
      options.map.graph = { width: 1000, height: 500, points: 2000, sampling: "square", jitter: 0.9 };

      const grid = Grid.generate("old");
      const heights = HeightmapGenerator.fromTemplate(grid, "globeWorld");

      // All cells within 2% of left and right margins should be water (< 20)
      for (let i = 0; i < grid.cells.i.length; i++) {
        const [x] = grid.points[i];
        if (x < 20 || x > 980) {
          expect(heights[i]).toBeLessThan(20);
        }
      }
    }
  });
});

describe("fractiousWorld template", () => {
  it("is registered with id 20 and expected attributes", async () => {
    const { heightmapTemplates } = await import("@/data/heightmap-templates");
    expect(heightmapTemplates.fractiousWorld).toBeDefined();
    expect(heightmapTemplates.fractiousWorld.id).toBe(20);
    expect(heightmapTemplates.fractiousWorld.probability).toBe(5);
    expect(heightmapTemplates.fractiousWorld.template).toContain("Mask 2");
    expect(heightmapTemplates.fractiousWorld.template).toContain("Hill 12-15 50-80 5-95 5-95");
  });

  it("leaves edge columns as ocean across multiple seeds", async () => {
    const { Grid } = await import("@/model/graph/grid-generator");
    const { Options } = await import("@/model/options/options-model");

    for (const seed of ["1", "42", "9999", "globe-test"]) {
      globalThis.options = Options.getDefaultOptions();
      options.map.seed = seed;
      options.map.graph = { width: 1000, height: 500, points: 2000, sampling: "square", jitter: 0.9 };

      const grid = Grid.generate("old");
      const heights = HeightmapGenerator.fromTemplate(grid, "fractiousWorld");

      // All cells within 2% of left and right margins should be water (< 20)
      for (let i = 0; i < grid.cells.i.length; i++) {
        const [x] = grid.points[i];
        if (x < 20 || x > 980) {
          expect(heights[i]).toBeLessThan(20);
        }
      }
    }
  });
});

/** a full-globe options setup with a real 2000-point lattice, shared by the Phase 1 suites */
const setupGlobe = (seed: string) => {
  globalThis.options = Options.getDefaultOptions();
  options.map.seed = seed;
  options.map.geography.coordinates = { latT: 180, latN: 90, latS: -90, lonT: 360, lonW: -180, lonE: 180 };
  options.map.graph = { width: 1000, height: 500, points: 2000, sampling: "square", jitter: 0.9 };
  return Grid.generate(seed);
};

describe("HeightmapGenerator Crater tool", () => {
  beforeEach(() => {
    HeightmapGenerator.clearData();
  });

  it("excavates a bowl below the surface while raising an ejecta ring around it", () => {
    const grid = setupGlobe("crater-test");
    grid.cells.h = new Uint8Array(grid.cells.h.length).fill(40);
    HeightmapGenerator.setGraph(grid, options.map.graph);
    Math.random = Alea("crater-test");

    // `Crater <count> <depth> <rangeX> <rangeY>`, impact centered on the map middle
    HeightmapGenerator.addStep("Crater", "1", "50", "50-50", "50-50");
    const heights = HeightmapGenerator.getHeights()!;
    HeightmapGenerator.clearData();

    const center = Lattice.findSlot(500, 250, grid);
    expect(heights[center]).toBeLessThan(40); // the bowl excavates below the flat surface

    // the raised rim shows up as a ring of cells above the surface at graph distance 5..15
    const distance = new Int16Array(grid.cells.h.length).fill(-1);
    distance[center] = 0;
    const queue = [center];
    while (queue.length) {
      const q = queue.shift() as number;
      for (const n of grid.cells.c[q]) {
        if (distance[n] >= 0) continue;
        distance[n] = distance[q] + 1;
        queue.push(n);
      }
    }
    const rimCells: number[] = [];
    for (let i = 0; i < heights.length; i++) {
      if (distance[i] >= 5 && distance[i] <= 15) rimCells.push(heights[i]);
    }
    expect(Math.max(...rimCells)).toBeGreaterThan(40);
  });

  it("stays deterministic for a fixed seed", () => {
    const run = () => {
      const grid = setupGlobe("crater-test");
      grid.cells.h = new Uint8Array(grid.cells.h.length).fill(40);
      HeightmapGenerator.setGraph(grid, options.map.graph);
      Math.random = Alea("crater-test");
      HeightmapGenerator.addStep("Crater", "2-3", "35-50", "30-70", "30-70");
      const heights = HeightmapGenerator.getHeights()!;
      HeightmapGenerator.clearData();
      return Array.from(heights);
    };

    expect(run()).toEqual(run());
  });
});

describe("planetary heightmap templates", () => {
  const TEMPLATE_IDS = { lunarWorld: 15, martianWorld: 16, icyMoon: 17, titanWorld: 18, volcanicWorld: 19 };

  beforeEach(() => {
    HeightmapGenerator.clearData();
  });

  const generateTemplate = (templateId: string, seed: string) => {
    const grid = setupGlobe(seed);
    Math.random = Alea(seed);
    return { grid, heights: HeightmapGenerator.fromTemplate(grid, templateId) };
  };

  for (const templateId of Object.keys(TEMPLATE_IDS)) {
    it(`${templateId} executes deterministically at a fixed seed without throwing`, () => {
      const first = generateTemplate(templateId, "sol-seed");
      const second = generateTemplate(templateId, "sol-seed");

      expect(Array.from(second.heights)).toEqual(Array.from(first.heights));
      expect(first.heights.length).toBeGreaterThan(0);
      expect(Array.from(first.heights).every(h => h >= 0 && h <= 100)).toBe(true);
      expect(Array.from(first.heights).some(h => h >= 20)).toBe(true); // the globe carries land
    });

    it(`${templateId} is registered with probability 0 so standard rolls are unchanged`, async () => {
      const { heightmapTemplates } = await import("@/data/heightmap-templates");
      expect(heightmapTemplates[templateId].id).toBe(TEMPLATE_IDS[templateId as keyof typeof TEMPLATE_IDS]);
      expect(heightmapTemplates[templateId].probability).toBe(0);
      expect(heightmapTemplates[templateId].template).toContain("Crater");
    });
  }

  it("lunarWorld blends the dry antimeridian to matching heights on both edges", () => {
    const {
      grid: { cellsX, cellsY },
      heights
    } = generateTemplate("lunarWorld", "lunar-seam");

    // no closing Mask on the lunar template, so smoothSeam must make the seam C⁰-continuous
    for (let y = 0; y < cellsY; y++) {
      expect(heights[y * cellsX]).toBe(heights[y * cellsX + cellsX - 1]);
    }
  });
});

describe("smoothSeam (antimeridian blending)", () => {
  beforeEach(() => {
    HeightmapGenerator.clearData();
  });

  /** a small flat lattice; smoothSeam only reads cellsX/cellsY and the heights */
  const buildFlatGrid = (cellsX: number, cellsY: number, fill: (x: number) => number): GridGraph => {
    const size = cellsX * cellsY;
    const heights = new Uint8Array(size);
    for (let y = 0; y < cellsY; y++) {
      for (let x = 0; x < cellsX; x++) heights[y * cellsX + x] = fill(x);
    }
    return {
      sampling: "square",
      spacing: 10,
      cellsX,
      cellsY,
      cells: { h: heights, c: Array.from({ length: size }, () => []) },
      points: Array.from({ length: size }, (_, i) => [(i % cellsX) * 10, Math.floor(i / cellsX) * 10])
    } as unknown as GridGraph;
  };

  const enableGlobe = () => {
    globalThis.options = Options.getDefaultOptions();
    options.map.geography.coordinates = { latT: 180, latN: 90, latS: -90, lonT: 360, lonW: -180, lonE: 180 };
  };

  it("merges left and right seam columns toward their row-wise mean on 360° maps", () => {
    enableGlobe();
    const graph = buildFlatGrid(12, 4, x => (x === 0 ? 5 : x === 11 ? 45 : 40));
    HeightmapGenerator.setGraph(graph, { width: 120, height: 40, points: 48, sampling: "square", jitter: 0.9 });

    HeightmapGenerator.smoothSeam();
    const heights = HeightmapGenerator.getHeights()!;

    expect(heights[0]).toBe(25); // (5 + 45) / 2 — the seam is C⁰-continuous
    expect(heights[11]).toBe(25);
    expect(heights[1]).toBe(40); // second column pair was already continuous
    expect(heights[10]).toBe(40);
  });

  it("never drowns dry-seam land below sea level", () => {
    enableGlobe();
    const graph = buildFlatGrid(12, 4, x => (x === 0 ? 21 : x === 11 ? 22 : 40));
    HeightmapGenerator.setGraph(graph, { width: 120, height: 40, points: 48, sampling: "square", jitter: 0.9 });

    HeightmapGenerator.smoothSeam();
    const heights = HeightmapGenerator.getHeights()!;

    expect(heights[0]).toBeGreaterThanOrEqual(20);
    expect(heights[11]).toBeGreaterThanOrEqual(20);
    expect(heights[0]).toBe(heights[11]); // and stays continuous
  });

  it("leaves non-globe maps untouched", () => {
    globalThis.options = Options.getDefaultOptions();
    options.map.geography.coordinates.lonT = 90;
    const graph = buildFlatGrid(12, 4, x => (x === 0 ? 5 : x === 11 ? 45 : 40));
    HeightmapGenerator.setGraph(graph, { width: 120, height: 40, points: 48, sampling: "square", jitter: 0.9 });

    HeightmapGenerator.smoothSeam();
    const heights = HeightmapGenerator.getHeights()!;

    expect(heights[0]).toBe(5);
    expect(heights[11]).toBe(45);
  });

  it("skips blending when the antimeridian is already open ocean", () => {
    enableGlobe();
    const graph = buildFlatGrid(12, 4, () => 10);
    HeightmapGenerator.setGraph(graph, { width: 120, height: 40, points: 48, sampling: "square", jitter: 0.9 });

    HeightmapGenerator.smoothSeam();
    const heights = HeightmapGenerator.getHeights()!;

    expect(heights[0]).toBe(10);
    expect(heights[11]).toBe(10);
    expect(heights[5]).toBe(10);
  });
});
