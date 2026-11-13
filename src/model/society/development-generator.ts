import {
  ASTRAL_ERAS,
  CULTURE_TYPE_DEVELOPMENT,
  DEFAULT_DEVELOPMENT,
  DEFAULT_ERAS,
  type Era,
  POST_SCARCITY_DEVELOPMENT,
  WILDLANDS_DEVELOPMENT
} from "@/data/development";
import type { Culture } from "./cultures-generator";

export type AstralTechRegime = "postScarcity" | "ancientBimodal" | "xothianScourge" | "standardSciFi";

const ASTRAL_CULTURE_SETS = new Set(["astralTrek", "grimdark", "verse"]);
const POST_SCARCITY_BASES = new Set(["VRARC", "VRACN", "VRELY", "VRSOL", "VRCEL", "TRKSY"]);
const ANCIENT_BIMODAL_BASES = new Set(["VRHEG", "VRMIG", "VRHUI", "VRGRY"]);

export function classifyAstralRegime(culture?: Pick<Culture, "i" | "base" | "name" | "development">): AstralTechRegime {
  if (!culture?.i) return "standardSciFi";
  const base = culture.base ?? "";
  if (POST_SCARCITY_BASES.has(base) || (culture.development ?? 0) >= POST_SCARCITY_DEVELOPMENT) return "postScarcity";
  if (base === "VRXOT" && culture.name?.includes("Xothian")) return "xothianScourge";
  if (ANCIENT_BIMODAL_BASES.has(base) || (base === "VRXOT" && culture.name?.includes("Thrall"))) {
    return "ancientBimodal";
  }
  return "standardSciFi";
}

const SMOOTHING = 2; // passes averaging each land cell with its neighbors, before the noise
const NOISE = 9; // the waves' amplitude, in points
const WAVES = 3; // waves across the map
const RIVER = 1;
const COAST = 1;
const MIN_BURG = 5; // a generated town is past the foragers' era, whatever its land

class DevelopmentGenerator {
  get eras(): Era[] {
    return options.map.eras;
  }

  getDefaultEras(): Era[] {
    return DEFAULT_ERAS.map(era => ({ ...era }));
  }

  getAstralEras(): Era[] {
    return ASTRAL_ERAS.map(era => ({ ...era }));
  }

  isAstralMode(): boolean {
    return options?.map?.astral === true || ASTRAL_CULTURE_SETS.has(options?.map?.cultures?.set ?? "");
  }

  /** Make development again from the cultures and land; custom levels are lost */
  generate(): void {
    if (this.isAstralMode()) {
      this.generateAstral();
      return;
    }
    const { cells, cultures, biomes } = pack;
    const n = cells.i.length;
    const levels = cultures.map(culture => (culture && !culture.removed ? this.ofCulture(culture) : 0));
    const noise = this.getNoise();

    const field = new Float32Array(n);
    for (let cell = 0; cell < n; cell++) {
      if (cells.h[cell] < 20) continue;
      const biome = biomes[cells.biome[cell]]?.development ?? 0;
      const water = (cells.r[cell] ? RIVER : 0) + (cells.harbor[cell] ? COAST : 0);
      field[cell] = (levels[cells.culture[cell]] ?? levels[0]) + biome + water; // a damaged file's culture repairs to 0
    }
    const smooth = this.smooth(field);

    const development = new Uint8Array(n);
    for (let cell = 0; cell < n; cell++) {
      if (cells.h[cell] < 20 || (!cells.pop[cell] && !cells.burg[cell])) continue; // no people, no development
      const least = cells.burg[cell] ? MIN_BURG : 1;
      development[cell] = Math.max(least, Math.min(100, Math.round(smooth[cell] + noise(cell))));
    }
    cells.development = development;
  }

  /** Sci-fi & Verse development spread: node-based, regime-aware (Post-Scarcity, Bimodal Ancient, Feral) */
  generateAstral(): void {
    const { cells, cultures, burgs, states } = pack;
    const n = cells.i.length;
    const development = new Uint8Array(n);
    const seedPrefix = `${options?.map?.seed ?? ""}/astral/dev`;
    const roll = (tag: string, id: number): number => hashString(`${seedPrefix}/${tag}/${id}`);

    for (let cell = 0; cell < n; cell++) {
      if (cells.h[cell] < 20 || (!cells.pop[cell] && !cells.burg[cell])) continue;
      const burgId = cells.burg[cell] ?? 0;
      const burg = burgId ? burgs?.[burgId] : undefined;
      const cultureId = cells.culture?.[cell] ?? 0;
      const stateId = cells.state?.[cell] ?? 0;
      const culture = cultures?.[cultureId];
      const state = states?.[stateId];
      const h = roll(burgId ? "burg" : "cell", burgId || cell);
      const frac = (h % 1000) / 1000;

      if (!cultureId || !stateId || !culture || culture.removed) {
        // Feral / Unclaimed systems roll: 20% TL0, 50% TL1, 10% TL2, 10% TL3, 8% TL4, 2% TL5
        let level: number;
        if (frac < 0.2) level = 3 + (h % 3);
        else if (frac < 0.7) level = 8 + (h % 11);
        else if (frac < 0.8) level = 24 + (h % 9);
        else if (frac < 0.9) level = 35 + (h % 14);
        else if (frac < 0.98) level = 54 + (h % 11);
        else level = 68 + (h % 17);
        development[cell] = Math.max(burg ? MIN_BURG : 1, Math.min(100, level));
        continue;
      }

      const regime = classifyAstralRegime(culture);
      const baseDev = this.ofCulture(culture);
      const isCap = Boolean(burg && (burg.capital || state?.capital === burg.i));
      const isCore = Boolean(burg && (isCap || (burg.population ?? 0) >= 100));

      let level: number;
      if (regime === "postScarcity") {
        if (isCore) level = Math.max(92, Math.min(100, baseDev + (isCap ? 2 : 0)));
        else if (burg) level = Math.max(85, Math.min(98, baseDev - 4 + (burg.port ? 2 : 0)));
        else level = Math.max(80, Math.min(95, baseDev - 6));
      } else if (regime === "ancientBimodal") {
        if (isCap || (burg?.citadel && burg.port)) {
          level = Math.max(78, Math.min(92, baseDev));
        } else if (burg && (burg.citadel || burg.walls || burg.port)) {
          level = 54 + (h % 12);
        } else if (frac < 0.2) {
          level = 3 + (h % 3);
        } else if (frac < 0.9) {
          level = 8 + (h % 13);
        } else {
          level = 24 + (h % 9);
        }
      } else if (regime === "xothianScourge") {
        level = isCap ? Math.max(75, Math.min(86, baseDev)) : 4 + (h % 11);
      } else {
        level = baseDev;
        if (burg) {
          if (isCap) level += 6;
          else if ((burg.population ?? 0) >= 100) level += 4;
          if (burg.port) level += 3;
          if (burg.citadel || burg.plaza) level += 2;
          if (burg.shanty && !burg.plaza) level -= 4;
          if (!cells.r?.[cell] && !burg.port && !isCap) level -= 6;
        } else {
          level = baseDev - 4 + (cells.r?.[cell] ? 2 : 0) + (cells.harbor?.[cell] ? 1 : 0);
        }
        level += (h % 5) - 2;
      }

      const least = burg ? MIN_BURG : 1;
      development[cell] = Math.max(least, Math.min(100, Math.round(level)));
    }
    cells.development = development;
  }

  getEraIndex(level: number): number {
    let index = 0;
    this.eras.forEach((era, i) => {
      if (level >= era.level) index = i;
    });
    return index;
  }

  getEra(level: number): string {
    return this.eras[this.getEraIndex(level)].name;
  }

  /** The people's average development by the id each cell holds, as `cells.state` */
  getAverages(ids: ArrayLike<number>): (number | undefined)[] {
    const { cells, burgs } = pack;
    const development = cells.development;
    const rate = options.map.units?.population?.urbanization?.rate ?? 0;
    const people: number[] = [];
    const total: number[] = [];
    for (let cell = 0; cell < development.length; cell++) {
      if (!development[cell]) continue; // no development, as painted
      const burg = cells.burg[cell] ? burgs[cells.burg[cell]] : undefined;
      const count = cells.pop[cell] + (burg && !burg.removed ? (burg.population || 0) * rate : 0);
      if (!count) continue;
      const id = ids[cell];
      people[id] = (people[id] || 0) + count;
      total[id] = (total[id] || 0) + count * development[cell];
    }
    return Array.from(people, (count, id) => (count ? total[id] / count : undefined));
  }

  /** Whether people live in the cell: only peopled land has development, 0 is none */
  isPeopled(cell: number): boolean {
    const { cells } = pack;
    return cells.h[cell] >= 20 && (cells.pop[cell] > 0 || cells.burg[cell] > 0);
  }

  /** Set the development of peopled land cells, a whole number from 0 to 100: 0 is none. Empty land and water are skipped */
  setCells(level: number, cells: readonly number[]): void {
    if (!Number.isInteger(level) || level < 0 || level > 100)
      throw new Error("The development must be an integer from 0 to 100");
    const { development } = pack.cells;
    for (const cell of cells) {
      if (this.isPeopled(cell)) development[cell] = level;
    }
  }

  /** A burg founded after generation: a cell with none takes the best around, at least MIN_BURG */
  settle(cell: number): void {
    const { development } = pack.cells;
    development[cell] = Math.max(MIN_BURG, development[cell] || this.getBestAround(cell));
  }

  /** A cell a burg left: no development once nobody lives there */
  vacate(cell: number): void {
    if (!this.isPeopled(cell)) pack.cells.development[cell] = 0;
  }

  /** After people moved: newly peopled land takes the best around, at least 1; emptied has none */
  resettle(wasPeopled: readonly boolean[]): void {
    const { development, i, h } = pack.cells;
    for (const cell of i) {
      if (h[cell] < 20) continue;
      if (!this.isPeopled(cell)) development[cell] = 0;
      else if (!wasPeopled[cell]) development[cell] = Math.max(1, this.getBestAround(cell));
    }
  }

  /** A cell's development; a water cell, worked from the shore, takes the best of the land around */
  ofCell(cell: number): number {
    return pack.cells.h[cell] >= 20 ? pack.cells.development[cell] : this.getBestAround(cell);
  }

  private getBestAround(cell: number): number {
    const { development, c, h } = pack.cells;
    let level = 0;
    for (const neighbor of c[cell]) if (h[neighbor] >= 20) level = Math.max(level, development[neighbor]);
    return level;
  }

  private smooth(field: Float32Array): Float32Array {
    const { cells } = pack;
    let current = field;
    for (let pass = 0; pass < SMOOTHING; pass++) {
      const next = new Float32Array(current.length);
      for (let cell = 0; cell < current.length; cell++) {
        if (cells.h[cell] < 20) continue;
        let sum = current[cell];
        let count = 1;
        for (const neighbor of cells.c[cell]) {
          if (cells.h[neighbor] < 20) continue;
          sum += current[neighbor];
          count++;
        }
        next[cell] = sum / count;
      }
      current = next;
    }
    return current;
  }

  /** A culture's development at its center: its own level and its way of life */
  ofCulture(culture: Culture): number {
    if (!culture.i) return WILDLANDS_DEVELOPMENT;
    return (culture.development ?? DEFAULT_DEVELOPMENT) + (CULTURE_TYPE_DEVELOPMENT[culture.type] ?? 0);
  }

  /** Value noise in two octaves, the same for the same seed */
  private getNoise(): (cell: number) => number {
    const points = pack.cells.p;
    let minX = Infinity;
    let minY = Infinity;
    let size = 0;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (point[0] < minX) minX = point[0];
      if (point[0] > maxX) maxX = point[0];
      if (point[1] < minY) minY = point[1];
      if (point[1] > maxY) maxY = point[1];
    }
    size = Math.max(maxX - minX, maxY - minY);
    const seed = hashString(String(options.map.seed));
    const lattice = (x: number, y: number) => {
      let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
    };
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const valueNoise = (x: number, y: number) => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = smooth(x - ix);
      const fy = smooth(y - iy);
      const top = lattice(ix, iy) + (lattice(ix + 1, iy) - lattice(ix, iy)) * fx;
      const bottom = lattice(ix, iy + 1) + (lattice(ix + 1, iy + 1) - lattice(ix, iy + 1)) * fx;
      return top + (bottom - top) * fy;
    };
    return cell => {
      const x = ((points[cell][0] - minX) / (size || 1)) * WAVES;
      const y = ((points[cell][1] - minY) / (size || 1)) * WAVES;
      return NOISE * (0.67 * valueNoise(x, y) + 0.33 * valueNoise(x * 2 + 17, y * 2 + 17));
    };
  }
}

/** FNV-1a: a seed's text as a 32-bit number */
function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export const Development = new DevelopmentGenerator();
