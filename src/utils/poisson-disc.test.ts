import { describe, expect, test } from "vitest";
import { poissonDiscSampler, poissonDiscSelect } from "./poisson-disc";

const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const leastDistance = (points: readonly { x: number; y: number }[]): number => {
  let least = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      least = Math.min(least, Math.hypot(dx, dy));
    }
  }
  return least;
};

describe("poissonDiscSampler", () => {
  test("keeps every point inside the rectangle at the minimum distance", () => {
    const radius = 10;
    const points = Array.from(poissonDiscSampler(5, 7, 105, 87, radius, 3, seeded(1)));

    expect(points.length).toBeGreaterThan(1);
    expect(points[0]).toEqual([55, 47]); // the rectangle centre comes first
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(5);
      expect(x).toBeLessThan(105);
      expect(y).toBeGreaterThanOrEqual(7);
      expect(y).toBeLessThan(87);
    }
    expect(leastDistance(points.map(([x, y]) => ({ x, y })))).toBeGreaterThanOrEqual(radius - 1e-9);
  });

  test("is deterministic for a seed and varies with another", () => {
    const run = (seed: number) => Array.from(poissonDiscSampler(0, 0, 100, 100, 8, 3, seeded(seed)));

    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });
});

describe("poissonDiscSelect", () => {
  const candidates = Array.from({ length: 400 }, (_, i) => ({ id: i, x: (i % 20) * 5, y: Math.floor(i / 20) * 5 }));

  test("accepts candidates at least the radius apart", () => {
    const accepted = poissonDiscSelect(candidates, { radius: 12, random: seeded(3) });

    expect(accepted.length).toBeGreaterThan(1);
    expect(accepted.length).toBeLessThan(candidates.length);
    expect(leastDistance(accepted)).toBeGreaterThanOrEqual(12 - 1e-9);
    for (const point of accepted) expect(candidates).toContain(point);
  });

  test("is deterministic for a seed", () => {
    const run = (seed: number) => poissonDiscSelect(candidates, { radius: 9, random: seeded(seed) });

    expect(run(11)).toEqual(run(11));
    expect(run(11)).not.toEqual(run(12));
  });

  test("treats points across the seam as neighbours when wrapping", () => {
    const acrossSeam = [
      { x: 1, y: 50 },
      { x: 99, y: 50 }
    ];

    expect(poissonDiscSelect(acrossSeam, { radius: 10, random: () => 0 })).toHaveLength(2);
    expect(poissonDiscSelect(acrossSeam, { radius: 10, random: () => 0, wrapWidth: 100 })).toHaveLength(1);
  });

  test("accepts one of two candidates at the same place", () => {
    const point = { x: 10, y: 10 };

    expect(poissonDiscSelect([point, point], { radius: 5, random: () => 0 })).toEqual([point]);
  });

  test("rejects an invalid radius", () => {
    expect(() => poissonDiscSelect(candidates, { radius: 0 })).toThrow("radius must be positive");
  });
});
