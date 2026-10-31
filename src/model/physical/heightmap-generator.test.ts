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
