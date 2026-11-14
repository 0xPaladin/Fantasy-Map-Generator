// Poisson-disc sampling: Bridson's rectangle sampler, and a minimum-distance selector over a candidate set

export interface PoissonPoint {
  x: number;
  y: number;
}

export interface PoissonDiscOptions {
  /** the least distance between accepted points */
  radius: number;
  /** the random source, default Math.random */
  random?: () => number;
  /** when set, distances are measured across the map seam, as on a wrapped map */
  wrapWidth?: number;
}

/**
 * mbostock's poissonDiscSampler implementation
 * Generates points using Poisson-disc sampling within a specified rectangle
 * @param {number} x0 - The minimum x coordinate of the rectangle
 * @param {number} y0 - The minimum y coordinate of the rectangle
 * @param {number} x1 - The maximum x coordinate of the rectangle
 * @param {number} y1 - The maximum y coordinate of the rectangle
 * @param {number} r - The minimum distance between points
 * @param {number} k - The number of attempts before rejection (default is 3)
 * @param {function} random - The random source (default is Math.random)
 * @yields {Array} - An array containing the x and y coordinates of a generated point
 */
export function* poissonDiscSampler(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  k = 3,
  random = Math.random
) {
  if (!(x1 >= x0) || !(y1 >= y0) || !(r > 0)) throw new Error("Invalid Poisson-disc rectangle or radius");

  const width = x1 - x0;
  const height = y1 - y0;
  const r2 = r * r;
  const r2_3 = 3 * r2;
  const cellSize = r * Math.SQRT1_2;
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);
  const grid = new Array(gridWidth * gridHeight);
  const queue: [number, number][] = [];

  function far(x: number, y: number) {
    const i = (x / cellSize) | 0;
    const j = (y / cellSize) | 0;
    const i0 = Math.max(i - 2, 0);
    const j0 = Math.max(j - 2, 0);
    const i1 = Math.min(i + 3, gridWidth);
    const j1 = Math.min(j + 3, gridHeight);
    for (let j = j0; j < j1; ++j) {
      const o = j * gridWidth;
      for (let i = i0; i < i1; ++i) {
        const s = grid[o + i];
        if (s) {
          const dx = s[0] - x;
          const dy = s[1] - y;
          if (dx * dx + dy * dy < r2) return false;
        }
      }
    }
    return true;
  }

  function sample(x: number, y: number): [number, number] {
    const point: [number, number] = [x, y];
    grid[gridWidth * ((y / cellSize) | 0) + ((x / cellSize) | 0)] = point;
    queue.push(point);
    return [x + x0, y + y0];
  }

  yield sample(width / 2, height / 2);

  pick: while (queue.length) {
    const i = (random() * queue.length) | 0;
    const parent = queue[i];

    for (let j = 0; j < k; ++j) {
      const a = 2 * Math.PI * random();
      const r = Math.sqrt(random() * r2_3 + r2);
      const x = parent[0] + r * Math.cos(a);
      const y = parent[1] + r * Math.sin(a);
      if (0 <= x && x < width && 0 <= y && y < height && far(x, y)) {
        yield sample(x, y);
        continue pick;
      }
    }

    const r = queue.pop();
    if (r !== undefined && i < queue.length) queue[i] = r;
  }
}

/**
 * Select an even subset of candidates: shuffle them, then accept a point only when no accepted point
 * lies closer than the radius. The constrained form of Poisson-disc for regions that are not rectangles.
 * The returned points are the candidates themselves, in acceptance order.
 */
export function poissonDiscSelect<T extends PoissonPoint>(
  candidates: readonly T[],
  { radius, random = Math.random, wrapWidth }: PoissonDiscOptions
): T[] {
  if (!(radius > 0)) throw new Error("Poisson-disc radius must be positive");

  const ordered = candidates.slice();
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = (random() * (i + 1)) | 0;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }

  const cellSize = radius; // a point within the radius shares a cell or one of its eight neighbours
  const buckets = new Map<string, T[]>();
  const accepted: T[] = [];
  const radiusSquared = radius * radius;

  const bucketOf = (x: number, y: number) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;

  const hasNeighbour = (x: number, y: number): boolean => {
    const i = Math.floor(x / cellSize);
    const j = Math.floor(y / cellSize);
    for (let jj = j - 1; jj <= j + 1; jj++) {
      for (let ii = i - 1; ii <= i + 1; ii++) {
        const bucket = buckets.get(`${ii},${jj}`);
        if (!bucket) continue;
        for (const other of bucket) {
          const dx = other.x - x;
          const dy = other.y - y;
          if (dx * dx + dy * dy < radiusSquared) return true;
        }
      }
    }
    return false;
  };

  for (const point of ordered) {
    // across the seam a near neighbour may sit one map width away
    const near =
      hasNeighbour(point.x, point.y) ||
      (wrapWidth !== undefined &&
        (hasNeighbour(point.x - wrapWidth, point.y) || hasNeighbour(point.x + wrapWidth, point.y)));
    if (near) continue;

    accepted.push(point);
    const key = bucketOf(point.x, point.y);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point);
    else buckets.set(key, [point]);
  }

  return accepted;
}
