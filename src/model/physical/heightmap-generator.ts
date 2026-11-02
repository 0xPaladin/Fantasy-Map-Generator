import Alea from "alea";
import { range as d3Range, leastIndex, mean } from "d3";
import { heightmapTemplates } from "@/data/heightmap-templates";
import { Lattice } from "@/model/graph/lattice";
import type { MapData } from "@/model/options/options-schema";
import type { GridGraph } from "@/types/grid-graph";
import { log } from "@/utils/logger";
import { lim, minmax } from "@/utils/number-utils";
import { getNumberInRange, P, rand } from "@/utils/probability-utils";

type Tool =
  | "Hill"
  | "Pit"
  | "Crater"
  | "Range"
  | "Trough"
  | "Strait"
  | "Mask"
  | "Invert"
  | "Add"
  | "Multiply"
  | "Power"
  | "Smooth";

class HeightmapModule {
  grid: GridGraph | null = null;
  heights: Uint8Array | null = null;
  blobPower: number = 0;
  linePower: number = 0;
  private width = 0;
  private height = 0;

  /** drop the graph and heights copy; the caller owns the grid, keeping it here pins a replaced world */
  clearData() {
    this.heights = null;
    this.grid = null;
  }

  private getBlobPower(cells: number): number {
    const blobPowerMap: Record<number, number> = {
      1000: 0.93,
      2000: 0.95,
      5000: 0.97,
      10000: 0.98,
      20000: 0.99,
      30000: 0.991,
      40000: 0.993,
      50000: 0.994,
      60000: 0.995,
      70000: 0.9955,
      80000: 0.996,
      90000: 0.9964,
      100000: 0.9973
    };
    return blobPowerMap[cells] || 0.98;
  }

  private getLinePower(cells: number): number {
    const linePowerMap: Record<number, number> = {
      1000: 0.75,
      2000: 0.77,
      5000: 0.79,
      10000: 0.81,
      20000: 0.82,
      30000: 0.83,
      40000: 0.84,
      50000: 0.86,
      60000: 0.87,
      70000: 0.88,
      80000: 0.91,
      90000: 0.92,
      100000: 0.93
    };

    return linePowerMap[cells] || 0.81;
  }

  private getPointInRange(range: string, length: number): number | undefined {
    if (typeof range !== "string") {
      log.error("Range should be a string");
      return;
    }

    const min = parseInt(range.split("-")[0], 10) / 100 || 0;
    const max = parseInt(range.split("-")[1], 10) / 100 || min;
    return rand(min * length, max * length);
  }

  setGraph(graph: GridGraph, config: MapData["graph"] = options.map.graph) {
    const cellsDesired = config.points;
    this.width = config.width;
    this.height = config.height;
    this.heights = Uint8Array.from(graph.cells.h);
    this.blobPower = this.getBlobPower(cellsDesired);
    this.linePower = this.getLinePower(cellsDesired);
    this.grid = graph;
  }

  addHill(count: string, height: string, rangeX: string, rangeY: string): void {
    const addOneHill = () => {
      const { grid } = this;
      if (!this.heights || !grid) return;
      const change = new Uint8Array(this.heights.length);
      let limit = 0;
      let start: number;
      const h = lim(getNumberInRange(height));

      do {
        const x = this.getPointInRange(rangeX, this.width);
        const y = this.getPointInRange(rangeY, this.height);
        if (x === undefined || y === undefined) return;
        start = Lattice.findSlot(x, y, grid);
        limit++;
      } while (this.heights[start] + h > 90 && limit < 50);
      change[start] = h;
      const queue = [start];
      while (queue.length) {
        const q = queue.shift() as number;

        for (const c of grid.cells.c[q]) {
          if (change[c]) continue;
          change[c] = change[q] ** this.blobPower * (Math.random() * 0.2 + 0.9);
          if (change[c] > 1) queue.push(c);
        }
      }

      this.heights = this.heights.map((h, i) => lim(h + change[i]));
    };

    const desiredHillCount = getNumberInRange(count);
    for (let i = 0; i < desiredHillCount; i++) {
      addOneHill();
    }
  }

  addPit(count: string, height: string, rangeX: string, rangeY: string): void {
    const addOnePit = () => {
      const { grid } = this;
      if (!this.heights || !grid) return;
      const used = new Uint8Array(this.heights.length);
      let limit = 0;
      let start: number;
      let h = lim(getNumberInRange(height));

      do {
        const x = this.getPointInRange(rangeX, this.width);
        const y = this.getPointInRange(rangeY, this.height);
        if (x === undefined || y === undefined) return;
        start = Lattice.findSlot(x, y, grid);
        limit++;
      } while (this.heights[start] < 20 && limit < 50);

      const queue = [start];
      while (queue.length) {
        const q = queue.shift() as number;
        h = h ** this.blobPower * (Math.random() * 0.2 + 0.9);
        if (h < 1) return;

        grid.cells.c[q].forEach((c: number) => {
          if (used[c] || this.heights === null) return;
          this.heights[c] = lim(this.heights[c] - h * (Math.random() * 0.2 + 0.9));
          used[c] = 1;
          queue.push(c);
        });
      }
    };

    const desiredPitCount = getNumberInRange(count);
    for (let i = 0; i < desiredPitCount; i++) {
      addOnePit();
    }
  }

  /**
   * BFS-propagates a blob of elevation change from a start cell, mirroring the Hill/Pit decay:
   * each newly reached cell gets `parentChange ** power * (0.9..1.1)` and only cells above 1 spread further.
   * Returns the full change buffer so several passes can be composed additively (e.g. impact craters).
   */
  private spreadBlob(start: number, amount: number, power: number): Float64Array {
    const { grid } = this;
    const change = new Float64Array(this.heights ? this.heights.length : 0);
    if (!grid || !this.heights) return change;
    change[start] = amount;
    const queue = [start];
    while (queue.length) {
      const q = queue.shift() as number;
      for (const c of grid.cells.c[q]) {
        if (change[c]) continue;
        change[c] = change[q] ** power * (Math.random() * 0.2 + 0.9);
        if (change[c] > 1) queue.push(c);
      }
    }
    return change;
  }

  addCrater(count: string, depth: string, rangeX: string, rangeY: string): void {
    const addOneCrater = () => {
      const { grid } = this;
      if (!this.heights || !grid) return;
      let limit = 0;
      let start: number;
      const d = lim(getNumberInRange(depth));

      do {
        const x = this.getPointInRange(rangeX, this.width);
        const y = this.getPointInRange(rangeY, this.height);
        if (x === undefined || y === undefined) return;
        start = Lattice.findSlot(x, y, grid);
        limit++;
      } while (this.heights[start] < 20 && limit < 50);

      // raised outer ejecta rim, centered on the impact cell
      const rim = this.spreadBlob(start, lim(d * 0.55), this.blobPower);
      // excavated bowl from the same cell: steeper decay than the rim, so the center nets out
      // as a concave depression while the periphery stays elevated as a circular crater rim
      const bowl = this.spreadBlob(start, d, this.blobPower * 0.985);
      // complex basins rebound into a tight central peak
      const peak = d >= 40 ? this.spreadBlob(start, lim(d * 0.25), this.blobPower * 0.92) : null;

      this.heights = this.heights.map((h, i) => lim(h + rim[i] - bowl[i] + (peak ? peak[i] : 0)));
    };

    const desiredCraterCount = getNumberInRange(count);
    for (let i = 0; i < desiredCraterCount; i++) {
      addOneCrater();
    }
  }

  addRange(
    count: string,
    height: string,
    rangeX: string,
    rangeY: string,
    startCellId?: number,
    endCellId?: number,
    randomness = 0.15
  ): void {
    const { grid } = this;
    if (!this.heights || !grid) return;

    const addOneRange = () => {
      const { grid } = this;
      if (!this.heights || !grid) return;

      // get main ridge
      const getRange = (cur: number, end: number) => {
        const range = [cur];
        const p = grid.points;
        used[cur] = 1;

        while (cur !== end) {
          let min = Infinity;
          grid.cells.c[cur].forEach((e: number) => {
            if (used[e]) return;
            let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
            // compare against the top of the [0,1) range to keep seeded generation identical to the legacy `> 0.85`/`> 0.8` checks
            if (Math.random() > 1 - randomness) diff = diff / 2;
            if (diff < min) {
              min = diff;
              cur = e;
            }
          });
          if (min === Infinity) return range;
          range.push(cur);
          used[cur] = 1;
        }

        return range;
      };

      const used = new Uint8Array(this.heights.length);
      let h = lim(getNumberInRange(height));

      if (rangeX && rangeY) {
        // find start and end points
        const startX = this.getPointInRange(rangeX, this.width) as number;
        const startY = this.getPointInRange(rangeY, this.height) as number;

        let dist = 0;
        let limit = 0;
        let endY: number;
        let endX: number;

        do {
          endX = Math.random() * this.width * 0.8 + this.width * 0.1;
          endY = Math.random() * this.height * 0.7 + this.height * 0.15;
          dist = Math.abs(endY - startY) + Math.abs(endX - startX);
          limit++;
        } while ((dist < this.width / 8 || dist > this.width / 3) && limit < 50);

        startCellId = Lattice.findSlot(startX, startY, grid);
        endCellId = Lattice.findSlot(endX, endY, grid);
      }

      const range = getRange(startCellId as number, endCellId as number);

      // add height to ridge and cells around
      let queue = range.slice();
      let i = 0;
      while (queue.length) {
        const frontier = queue.slice();
        queue = [];
        i++;
        frontier.forEach((i: number) => {
          if (!this.heights) return;
          this.heights[i] = lim(this.heights[i] + h * (Math.random() * 0.3 + 0.85));
        });
        h = h ** this.linePower - 1;
        if (h < 2) break;
        frontier.forEach((f: number) => {
          grid.cells.c[f].forEach((i: number) => {
            if (!used[i]) {
              queue.push(i);
              used[i] = 1;
            }
          });
        });
      }

      // generate prominences
      range.forEach((cur: number, d: number) => {
        if (d % 6 !== 0) return;
        for (const _l of d3Range(i)) {
          const index = leastIndex(grid.cells.c[cur], (a: number, b: number) => this.heights![a] - this.heights![b]);
          if (index === undefined) continue;
          const min = grid.cells.c[cur][index]; // downhill cell
          this.heights![min] = (this.heights![cur] * 2 + this.heights![min]) / 3;
          cur = min;
        }
      });
    };

    const desiredRangeCount = getNumberInRange(count);
    for (let i = 0; i < desiredRangeCount; i++) {
      addOneRange();
    }
  }

  addTrough(
    count: string,
    height: string,
    rangeX: string,
    rangeY: string,
    startCellId?: number,
    endCellId?: number,
    randomness = 0.2
  ): void {
    const addOneTrough = () => {
      const { grid } = this;
      if (!this.heights || !grid) return;

      // get main ridge
      const getRange = (cur: number, end: number) => {
        const range = [cur];
        const p = grid.points;
        used[cur] = 1;

        while (cur !== end) {
          let min = Infinity;
          grid.cells.c[cur].forEach((e: number) => {
            if (used[e]) return;
            let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
            // compare against the top of the [0,1) range to keep seeded generation identical to the legacy `> 0.85`/`> 0.8` checks
            if (Math.random() > 1 - randomness) diff = diff / 2;
            if (diff < min) {
              min = diff;
              cur = e;
            }
          });
          if (min === Infinity) return range;
          range.push(cur);
          used[cur] = 1;
        }

        return range;
      };

      const used = new Uint8Array(this.heights.length);
      let h = lim(getNumberInRange(height));

      if (rangeX && rangeY) {
        // find start and end points
        let limit = 0;
        let startX: number;
        let startY: number;
        let dist = 0;
        let endX: number;
        let endY: number;
        do {
          startX = this.getPointInRange(rangeX, this.width) as number;
          startY = this.getPointInRange(rangeY, this.height) as number;
          startCellId = Lattice.findSlot(startX, startY, grid);
          limit++;
        } while (this.heights[startCellId] < 20 && limit < 50);

        limit = 0;
        do {
          endX = Math.random() * this.width * 0.8 + this.width * 0.1;
          endY = Math.random() * this.height * 0.7 + this.height * 0.15;
          dist = Math.abs(endY - startY) + Math.abs(endX - startX);
          limit++;
        } while ((dist < this.width / 8 || dist > this.width / 2) && limit < 50);

        endCellId = Lattice.findSlot(endX, endY, grid);
      }

      const range = getRange(startCellId as number, endCellId as number);

      // add height to ridge and cells around
      let queue = range.slice(),
        i = 0;
      while (queue.length) {
        const frontier = queue.slice();
        queue = [];
        i++;
        frontier.forEach((i: number) => {
          this.heights![i] = lim(this.heights![i] - h * (Math.random() * 0.3 + 0.85));
        });
        h = h ** this.linePower - 1;
        if (h < 2) break;
        frontier.forEach((f: number) => {
          grid.cells.c[f].forEach((i: number) => {
            if (!used[i]) {
              queue.push(i);
              used[i] = 1;
            }
          });
        });
      }

      // generate prominences
      range.forEach((cur: number, d: number) => {
        if (d % 6 !== 0) return;
        for (const _l of d3Range(i)) {
          const index = leastIndex(grid.cells.c[cur], (a: number, b: number) => this.heights![a] - this.heights![b]);
          if (index === undefined) continue;
          const min = grid.cells.c[cur][index]; // downhill cell
          //debug.append("circle").attr("cx", p[min][0]).attr("cy", p[min][1]).attr("r", 1);
          this.heights![min] = (this.heights![cur] * 2 + this.heights![min]) / 3;
          cur = min;
        }
      });
    };

    const desiredTroughCount = getNumberInRange(count);
    for (let i = 0; i < desiredTroughCount; i++) {
      addOneTrough();
    }
  }

  addStrait(width: string, direction = "vertical"): void {
    const { grid } = this;
    if (!this.heights || !grid) return;
    const desiredWidth = Math.min(getNumberInRange(width), grid.cellsX / 3);
    if (desiredWidth < 1 && P(desiredWidth)) return;
    const used = new Uint8Array(this.heights.length);
    const vert = direction === "vertical";
    const startX = vert ? Math.floor(Math.random() * this.width * 0.4 + this.width * 0.3) : 5;
    const startY = vert ? 5 : Math.floor(Math.random() * this.height * 0.4 + this.height * 0.3);
    const endX = vert
      ? Math.floor(this.width - startX - this.width * 0.1 + Math.random() * this.width * 0.2)
      : this.width - 5;
    const endY = vert
      ? this.height - 5
      : Math.floor(this.height - startY - this.height * 0.1 + Math.random() * this.height * 0.2);

    const start = Lattice.findSlot(startX, startY, grid);
    const end = Lattice.findSlot(endX, endY, grid);

    const getRange = (cur: number, end: number) => {
      const range = [];
      const p = grid.points;

      while (cur !== end) {
        let min = Infinity;
        grid.cells.c[cur].forEach((e: number) => {
          let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
          if (Math.random() > 0.8) diff = diff / 2;
          if (diff < min) {
            min = diff;
            cur = e;
          }
        });
        range.push(cur);
      }

      return range;
    };
    let range = getRange(start, end);
    const query: number[] = [];

    const step = 0.1 / desiredWidth;

    for (let i = 0; i < desiredWidth; i++) {
      const remainingWidth = desiredWidth - i;
      const exp = 0.9 - step * remainingWidth;
      range.forEach((r: number) => {
        grid.cells.c[r].forEach((e: number) => {
          if (used[e]) return;
          used[e] = 1;
          query.push(e);
          this.heights![e] **= exp;
          if (this.heights![e] > 100) this.heights![e] = 5;
        });
      });
      range = query.slice();
    }
  }

  modify(range: string, add: number, mult: number, power?: number): void {
    if (!this.heights) return;
    const min = range === "land" ? 20 : range === "all" ? 0 : +range.split("-")[0];
    const max = range === "land" || range === "all" ? 100 : +range.split("-")[1];
    const isLand = min === 20;

    this.heights = this.heights.map(h => {
      if (h < min || h > max) return h;

      if (add) h = isLand ? Math.max(h + add, 20) : h + add;
      if (mult !== 1) h = isLand ? (h - 20) * mult + 20 : h * mult;
      if (power) h = isLand ? (h - 20) ** power + 20 : h ** power;
      return lim(h);
    });
  }

  smooth(fr = 2, add = 0): void {
    const { grid } = this;
    if (!this.heights || !grid) return;
    this.heights = this.heights.map((h, i) => {
      const a = [h];
      grid.cells.c[i].forEach((c: number) => {
        a.push(this.heights![c]);
      });
      if (fr === 1) return (mean(a) as number) + add;
      return lim((h * (fr - 1) + (mean(a) as number) + add) / fr);
    });
  }

  mask(power = 1): void {
    const { grid } = this;
    if (!this.heights || !grid) return;
    const fr = power ? Math.abs(power) : 1;

    this.heights = this.heights.map((h, i) => {
      const [x, y] = grid.points[i];
      const nx = (2 * x) / this.width - 1; // [-1, 1], 0 is center
      const ny = (2 * y) / this.height - 1; // [-1, 1], 0 is center
      let distance = (1 - nx ** 2) * (1 - ny ** 2); // 1 is center, 0 is edge
      if (power < 0) distance = 1 - distance; // inverted, 0 is center, 1 is edge
      const masked = h * distance;
      return lim((h * (fr - 1) + masked) / fr);
    });
  }

  /**
   * Blends the leftmost and rightmost 3 columns row-by-row so a 360° globe stays C⁰-continuous
   * across the antimeridian. Skipped when the map is not a full globe or when the template already
   * submerges the whole seam with ocean (e.g. `globeWorld`'s closing `Mask 2`). The blend never
   * pulls dry-seam land below the sea level of 20.
   */
  smoothSeam(): void {
    const { grid } = this;
    if (!this.heights || !grid) return;
    if (options.map.geography.coordinates.lonT !== 360) return;

    const { cellsX, cellsY } = grid;
    let seamIsDry = false;
    for (let y = 0; y < cellsY && !seamIsDry; y++) {
      const row = y * cellsX;
      seamIsDry = this.heights[row] >= 20 || this.heights[row + cellsX - 1] >= 20;
    }
    if (!seamIsDry) return;

    for (let y = 0; y < cellsY; y++) {
      const row = y * cellsX;
      for (let k = 0; k < 3; k++) {
        const left = row + k;
        const right = row + cellsX - 1 - k;
        const l = this.heights[left];
        const r = this.heights[right];
        const seamMean = (l + r) / 2;
        const blended = l >= 20 && r >= 20 ? Math.max(seamMean, 20) : seamMean;
        this.heights[left] = blended;
        this.heights[right] = blended;
      }
    }
  }

  invert(count: number, axes: string): void {
    if (!P(count) || !this.heights || !this.grid) return;

    const invertX = axes !== "y";
    const invertY = axes !== "x";
    const { cellsX, cellsY } = this.grid;

    const inverted = this.heights.map((_h: number, i: number) => {
      if (!this.heights) return 0;
      const x = i % cellsX;
      const y = Math.floor(i / cellsX);

      const nx = invertX ? cellsX - x - 1 : x;
      const ny = invertY ? cellsY - y - 1 : y;
      const invertedI = nx + ny * cellsX;
      return this.heights[invertedI];
    });

    this.heights = inverted;
  }

  addStep(tool: Tool, a2: string, a3: string, a4: string, a5: string): void {
    if (tool === "Hill") {
      this.addHill(a2, a3, a4, a5);
      return;
    }
    if (tool === "Pit") {
      this.addPit(a2, a3, a4, a5);
      return;
    }
    if (tool === "Crater") {
      this.addCrater(a2, a3, a4, a5);
      return;
    }
    if (tool === "Range") {
      this.addRange(a2, a3, a4, a5);
      return;
    }
    if (tool === "Trough") {
      this.addTrough(a2, a3, a4, a5);
      return;
    }
    if (tool === "Strait") {
      this.addStrait(a2, a3);
      return;
    }
    if (tool === "Mask") {
      this.mask(+a2);
      return;
    }
    if (tool === "Invert") {
      this.invert(+a2, a3);
      return;
    }
    if (tool === "Add") {
      this.modify(a3, +a2, 1);
      return;
    }
    if (tool === "Multiply") {
      this.modify(a3, 0, +a2);
      return;
    }
    if (tool === "Power") {
      this.modify(a3, 0, 1, +a2); // syntax: Power <exponent> <range>
      return;
    }
    if (tool === "Smooth") {
      this.smooth(+a2);
      return;
    }
  }

  /** heightmap template or precreated heightmap selected in the options */
  getSelectedId(): string {
    return options.generation.template;
  }

  /** build the heightmap from the selected template or image and store it as the graph cell heights */
  async generate(graph: GridGraph = grid, id: string = this.getSelectedId()): Promise<Uint8Array> {
    Math.random = Alea(options.map.seed); // reset PRNG
    const isTemplate = id in heightmapTemplates;
    const heights = isTemplate ? this.fromTemplate(graph, id) : await this.fromPrecreated(graph, id);

    this.clearData();
    graph.cells.h = heights;
    return heights;
  }

  fromTemplate(graph: GridGraph, id: string, config: MapData["graph"] = options.map.graph): Uint8Array {
    const templateString = heightmapTemplates[id]?.template || "";
    const steps = templateString.split("\n");

    if (!steps.length) throw new Error(`Heightmap template: no steps. Template: ${id}. Steps: ${steps}`);
    this.setGraph(graph, config);

    for (const step of steps) {
      const elements = step.trim().split(" ");
      if (elements.length < 2) throw new Error(`Heightmap template: steps < 2. Template: ${id}. Step: ${elements}`);
      this.addStep(...(elements as [Tool, string, string, string, string]));
    }

    this.smoothSeam();
    return this.heights!;
  }

  private getHeightsFromImageData(imageData: Uint8ClampedArray): void {
    if (!this.heights) return;
    for (let i = 0; i < this.heights.length; i++) {
      const lightness = imageData[i * 4] / 255;
      const powered = lightness < 0.2 ? lightness : 0.2 + (lightness - 0.2) ** 0.8;
      this.heights[i] = minmax(Math.floor(powered * 100), 0, 100);
    }
  }

  fromPrecreated(graph: GridGraph, id: string, config: MapData["graph"] = options.map.graph): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      // create canvas where 1px corresponds to a cell
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      const { cellsX, cellsY } = graph;
      canvas.width = cellsX;
      canvas.height = cellsY;

      const img = new Image();
      const fail = (message: string) => {
        canvas.remove();
        img.remove();
        reject(new Error(message));
      };

      // load heightmap into image and render to canvas
      img.onerror = () => fail(`Cannot load heightmap ${id}`);
      img.onload = () => {
        if (!ctx) return fail("Could not get canvas context");
        this.heights = this.heights || new Uint8Array(cellsX * cellsY);
        ctx.drawImage(img, 0, 0, cellsX, cellsY);
        const imageData = ctx.getImageData(0, 0, cellsX, cellsY);
        this.setGraph(graph, config);
        this.getHeightsFromImageData(imageData.data);
        canvas.remove();
        img.remove();
        resolve(this.heights);
      };
      img.src = `./heightmaps/${id}.png`;
    });
  }

  getHeights() {
    return this.heights;
  }
}

export const HeightmapGenerator = new HeightmapModule();
