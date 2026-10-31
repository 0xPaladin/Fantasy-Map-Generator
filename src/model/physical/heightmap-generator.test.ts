import { beforeEach, describe, expect, it } from "vitest";
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
