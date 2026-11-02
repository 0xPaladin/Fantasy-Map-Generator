import { mean } from "d3";
import { PLANETARY_BIOMES } from "@/data/planetary-biomes";
import type { ReliefPool } from "@/model/physical/relief-generator";
import type { PlanetaryArchetype } from "@/types/planetary";
import { requireColor } from "@/utils/color-utils";
import { rn } from "@/utils/number-utils";
import { requireName } from "@/utils/validation-utils";

export interface Biome {
  i: number;
  name: string;
  color: string;
  habitability: number;
  iconsDensity: number;
  icons: ReliefPool;
  cost: number;
  removed?: boolean;
  note?: string;
  /** set on the planetary biomes appended at 13..27; absent on the built-in terrestrial biomes */
  archetype?: PlanetaryArchetype;
}

function getDefaultBiomes(): Biome[] {
  const name = [
    "Marine",
    "Hot desert",
    "Cold desert",
    "Savanna",
    "Grassland",
    "Tropical seasonal forest",
    "Temperate deciduous forest",
    "Tropical rainforest",
    "Temperate rainforest",
    "Taiga",
    "Tundra",
    "Glacier",
    "Wetland"
  ];

  const color = [
    "#466eab",
    "#fbe79f",
    "#b5b887",
    "#d2d082",
    "#c8d68f",
    "#b6d95d",
    "#29bc56",
    "#7dcb35",
    "#409c43",
    "#4b6b32",
    "#96784b",
    "#d5e7eb",
    "#0b9131"
  ];
  const habitability = [0, 4, 10, 22, 30, 50, 100, 80, 90, 12, 4, 0, 12];
  const iconsDensity = [0, 27, 20, 120, 120, 120, 120, 150, 150, 100, 39, 0, 250];
  const weights: Record<string, number>[] = [
    {},
    { dune: 3, cactus: 6, deadTree: 1 },
    { dune: 9, deadTree: 1 },
    { acacia: 1, grass: 9 },
    { grass: 1 },
    { acacia: 8, palm: 1 },
    { deciduous: 2, conifer: 1 },
    { acacia: 5, palm: 3, deciduous: 1, swamp: 1 },
    { deciduous: 6, conifer: 1, swamp: 1 },
    { coniferSnow: 1 },
    { grass: 1 },
    {},
    { swamp: 1 }
  ];
  const icons = weights.map(
    (pool): ReliefPool => Object.fromEntries(Object.entries(pool).map(([entry, weight]) => [entry, { weight }]))
  );
  const cost = [10, 200, 150, 60, 50, 70, 70, 80, 90, 200, 1000, 5000, 150];

  return name.map((name, i) => ({
    i,
    name,
    color: color[i],
    habitability: habitability[i],
    iconsDensity: iconsDensity[i],
    icons: icons[i],
    cost: cost[i]
  }));
}

// hot ↔ cold [>19°C; <-4°C]; dry ↕ wet
const biomesMatrix = [
  new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 10]),
  new Uint8Array([3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 9, 9, 9, 9, 10, 10, 10]),
  new Uint8Array([5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 9, 9, 9, 9, 9, 10, 10, 10]),
  new Uint8Array([5, 6, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 10, 10, 10]),
  new Uint8Array([7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 10, 10])
];

class BiomesGenerator {
  private MIN_LAND_HEIGHT = 20;

  getDefault(): Biome[] {
    return getDefaultBiomes();
  }

  /** the 13 terrestrial biomes plus the planetary 13..27 block when the map has a non-terran archetype */
  private buildBiomes(): Biome[] {
    const biomes = this.getDefault();
    if (this.getArchetype()) biomes.push(...PLANETARY_BIOMES.map(biome => ({ ...biome })));
    return biomes;
  }

  generate(): void {
    pack.biomes = this.buildBiomes();
    this.define();
  }

  define(): void {
    if (!pack.biomes?.length) pack.biomes = this.buildBiomes();

    const { fl: flux, r: riverIds, h: heights, c: neighbors, g: gridReference } = pack.cells;
    const { temp, prec } = grid.cells;
    pack.cells.biome = new Uint8Array(pack.cells.i.length); // biomes array

    const calculateMoisture = (cellId: number) => {
      let moisture = prec[gridReference[cellId]];
      if (riverIds[cellId]) moisture += Math.max(flux[cellId] / 10, 2);

      const moistAround = neighbors[cellId]
        .filter((neibCellId: number) => heights[neibCellId] >= this.MIN_LAND_HEIGHT)
        .map((c: number) => prec[gridReference[c]])
        .concat([moisture]);
      return rn(4 + (mean(moistAround) as number));
    };

    for (let cellId = 0; cellId < heights.length; cellId++) {
      const height = heights[cellId];
      const moisture = height < this.MIN_LAND_HEIGHT ? 0 : calculateMoisture(cellId);
      const temperature = temp[gridReference[cellId]];
      pack.cells.biome[cellId] = this.getId(moisture, temperature, height, Boolean(riverIds[cellId]), cellId);
    }
  }

  /** Rename a biome */
  rename(biomeId: number, name: string): void {
    this.living(biomeId).name = requireName(name);
  }

  /** Set a biome's color */
  recolor(biomeId: number, color: string): void {
    this.living(biomeId).color = requireColor(color);
  }

  /** Set a biome's habitability, in percent */
  setHabitability(biomeId: number, percent: number): void {
    if (!Number.isFinite(percent) || percent < 0) throw new Error("The habitability must be a non-negative number");
    this.living(biomeId).habitability = percent;
  }

  /** Add a custom biome for painting; returns its id. There can be at most 255 biomes */
  add(name: string, color: string, habitability: number): number {
    const biomes = pack.biomes;
    if (biomes.length > 254) throw new Error("There can be at most 255 biomes");
    if (!Number.isFinite(habitability) || habitability < 0)
      throw new Error("The habitability must be a non-negative number");
    const i = biomes.length;
    biomes.push({
      i,
      name: requireName(name),
      color: requireColor(color),
      habitability,
      iconsDensity: 0,
      icons: {},
      cost: 50
    });
    return i;
  }

  /** Remove a custom biome that no cell uses; the generated biomes stay */
  remove(biomeId: number): void {
    this.living(biomeId);
    if (biomeId <= 12) throw new Error(`Biome ${biomeId} is a generated biome and cannot be removed`);
    if (pack.cells.biome.includes(biomeId)) throw new Error(`Biome ${biomeId} still has cells; paint them over first`);
    pack.biomes[biomeId].removed = true;
  }

  /** Paint land cells with a biome; a cell's rural population does not follow until population is regenerated */
  setCells(biomeId: number, cellIds: number[]): void {
    this.living(biomeId);
    if (!biomeId) throw new Error("Biome 0 is the water biome; land cannot take it");
    const { cells } = pack;
    if (!Array.isArray(cellIds) || !cellIds.length) throw new Error("Name at least one cell");
    for (const cell of cellIds) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= cells.i.length) throw new Error(`Cell ${cell} does not exist`);
      if (cells.h[cell] < this.MIN_LAND_HEIGHT) throw new Error(`Cell ${cell} is water; biomes are painted on land`);
    }
    for (const cell of cellIds) cells.biome[cell] = biomeId;
  }

  /** Restore the generated biomes: their default names, colors and habitability, and the cells they cover. Custom biomes are removed */
  restore(): void {
    pack.biomes = this.buildBiomes();
    this.define();
  }

  private living(biomeId: number): Biome {
    const biome = pack.biomes[biomeId];
    if (!biome || biome.removed) throw new Error(`Biome ${biomeId} does not exist`);
    return biome;
  }

  getId(moisture: number, temperature: number, height: number, hasRiver: boolean, cellId = -1) {
    if (height < 20) return 0; // all water cells: marine biome
    const archetype = this.getArchetype();
    if (archetype) return this.getPlanetaryId(archetype, cellId, moisture, temperature, height);
    if (temperature < -5) return 11; // too cold: permafrost biome
    if (temperature >= 25 && !hasRiver && moisture < 8) return 1; // too hot and dry: hot desert biome
    if (this.isWetland(moisture, temperature, height)) return 12; // too wet: wetland biome
    return this.getMatrixId(moisture, temperature);
  }

  /** the map's surface archetype, or null on standard terran maps */
  private getArchetype(): PlanetaryArchetype | null {
    const archetype = options.map.geography.archetype;
    return archetype && archetype !== "terran" ? archetype : null;
  }

  /** classify a land cell on a planetary body; falls through to the terrestrial matrix on terraformed martian basins */
  private getPlanetaryId(
    archetype: PlanetaryArchetype,
    cellId: number,
    moisture: number,
    temperature: number,
    height: number
  ) {
    const latitude = this.getCellLatitude(cellId);
    const polar = latitude !== null && Math.abs(latitude) > 70;
    const cap = latitude !== null && Math.abs(latitude) > 72;

    switch (archetype) {
      case "lunar":
        if (polar && height < 38) return 16; // shadowed polar ice crater
        if (height >= 62) return 15; // crater ejecta ridge
        if (height >= 34) return 14; // anorthosite highlands
        return 13; // basalt mare
      case "martian":
        if (temperature < -55 || cap) return 20; // polar CO2 / water ice cap
        if (height >= 68) return 19; // tharsis basalt shield
        // terraformed hybrid: wet and warm basins fall through to the terrestrial matrix
        if (moisture >= 12 && temperature > -15) break;
        if (height >= 45) return 18; // oxide dune sea
        return 17; // ferric regolith plains
      case "icy_moon":
        if (height >= 55) return 22; // chaos ice matrix
        if (height < 32) return 23; // thermal lineae rift
        return 21; // smooth ice shell
      case "titan":
        if (latitude !== null && Math.abs(latitude) < 35 && height < 45) return 24; // hydrocarbon dune band
        return 25; // cryo-bedrock plains
      case "volcanic":
        if (height >= 55 || this.isLavaShore(cellId)) return 27; // sulfur fumarole / caldera
        return 26; // basalt flood plain
    }

    return this.getMatrixId(moisture, temperature);
  }

  /** the terrestrial biomesMatrix lookup: hot ↔ cold bands across dry ↕ wet bands */
  private getMatrixId(moisture: number, temperature: number) {
    const moistureBand = Math.min((moisture / 5) | 0, 4); // [0-4]
    const temperatureBand = Math.min(Math.max(20 - temperature, 0), 25); // [0-25]
    return biomesMatrix[moistureBand][temperatureBand];
  }

  /** cell latitude in degrees, mirroring the temperature generator; null when the cell has no grid reference */
  private getCellLatitude(cellId: number): number | null {
    const gridCell = pack.cells.g[cellId];
    const point = gridCell !== undefined ? grid.points[gridCell] : undefined;
    if (!point) return null;
    const { latN, latT } = options.map.geography.coordinates;
    return latN - (point[1] / options.map.graph.height) * latT; // [latN; latN - latT]
  }

  /** a land cell bordering an enclosed lake or sea on a volcanic world: molten shore */
  private isLavaShore(cellId: number): boolean {
    const { c: neighbors, f: featureOf, h: heights } = pack.cells;
    return neighbors[cellId].some(
      (neighborId: number) => heights[neighborId] < 20 && pack.features[featureOf[neighborId]]?.type === "lake"
    );
  }

  private isWetland(moisture: number, temperature: number, height: number) {
    if (temperature <= -2) return false; // too cold
    if (moisture > 40 && height < 25) return true; // near coast
    if (moisture > 24 && height > 24 && height < 60) return true; // off coast
    return false;
  }
}

export const Biomes = new BiomesGenerator();
