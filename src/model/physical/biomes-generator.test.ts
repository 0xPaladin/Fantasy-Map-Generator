import { beforeEach, describe, expect, it } from "vitest";
import type { PlanetaryArchetype } from "@/types/planetary";
import { Biomes } from "./biomes-generator";
import type { Feature } from "./features-generator";

const COLS = 6;
const ROWS = 8;
const CELLS = COLS * ROWS;

/**
 * A synthetic 360° globe: 6×8 pack cells on a matching lattice, cell i referencing grid cell i.
 * Row 0/7 sit above |70°| latitude, rows 2..5 are equatorial. Heights come from the callback.
 */
const buildWorld = (heightAt: (x: number, y: number) => number) => {
  const c: number[][] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      const neighbors: number[] = [];
      if (x > 0) neighbors.push(i - 1);
      if (x < COLS - 1) neighbors.push(i + 1);
      if (y > 0) neighbors.push(i - COLS);
      if (y < ROWS - 1) neighbors.push(i + COLS);
      c.push(neighbors);
    }
  }
  const h = new Uint8Array(CELLS);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) h[y * COLS + x] = heightAt(x, y);
  }

  globalThis.options = {
    map: {
      seed: "biomes-test",
      graph: { width: 60, height: 80, points: CELLS, sampling: "square", jitter: 0.9 },
      geography: {
        mapSize: 100,
        latitude: 50,
        longitude: 50,
        coordinates: { latT: 180, latN: 90, latS: -90, lonT: 360, lonW: -180, lonE: 180 }
      },
      climate: {
        temperature: { equator: 20, northPole: -20, southPole: -20 },
        precipitation: 100,
        winds: [225, 45, 225, 315, 135, 315]
      }
    }
  } as unknown as typeof options;

  globalThis.grid = {
    cellsX: COLS,
    cellsY: ROWS,
    points: Array.from({ length: CELLS }, (_, i) => [(i % COLS) * 10, Math.floor(i / COLS) * 10 + 5]),
    cells: { temp: new Int8Array(CELLS), prec: new Float32Array(CELLS) }
  } as unknown as typeof grid;

  globalThis.pack = {
    cells: {
      i: Array.from({ length: CELLS }, (_, i) => i),
      h,
      c,
      f: new Uint16Array(CELLS),
      g: Array.from({ length: CELLS }, (_, i) => i),
      fl: new Uint16Array(CELLS),
      r: new Uint16Array(CELLS)
    },
    features: []
  } as unknown as typeof pack;
};

const biomeAt = (x: number, y: number) => pack.cells.biome[y * COLS + x];
const setArchetype = (archetype: PlanetaryArchetype | undefined) => {
  options.map.geography.archetype = archetype;
};

describe("Biomes planetary archetypes", () => {
  beforeEach(() => {
    buildWorld(() => 40);
    grid.cells.temp.fill(10);
    grid.cells.prec.fill(0);
  });

  it("terran maps (no archetype) generate only the 13 built-in biomes", () => {
    Biomes.generate();
    expect(pack.biomes.length).toBe(13);
    expect(pack.biomes.map(b => b.name)).toEqual(Biomes.getDefault().map(b => b.name));
    expect([...pack.cells.biome].every(id => id <= 12)).toBe(true);
  });

  it("keeps biomes 0..12 intact and appends the planetary block at 13..27", () => {
    setArchetype("martian");
    Biomes.generate();

    expect(pack.biomes.length).toBe(28);
    const defaults = Biomes.getDefault();
    for (let i = 0; i < 13; i++) {
      expect(pack.biomes[i].name).toBe(defaults[i].name);
      expect(pack.biomes[i].color).toBe(defaults[i].color);
      expect(pack.biomes[i].habitability).toBe(defaults[i].habitability);
    }
    expect(pack.biomes[13].name).toBe("Basalt Mare");
    expect(pack.biomes[16].name).toBe("Shadowed Polar Ice Crater");
    expect(pack.biomes[17].name).toBe("Ferric Regolith Plains");
    expect(pack.biomes[20].name).toBe("Polar CO₂ / Water Ice Cap");
    expect(pack.biomes[23].name).toBe("Thermal Lineae Rift");
    expect(pack.biomes[27].name).toBe("Sulfur Fumarole / Caldera");
  });

  it("classifies lunar cells into basins, highlands, ridges and polar ice craters", () => {
    grid.cells.temp.fill(-20);
    buildWorld((x, y) => {
      if (y === 0 && x < 2) return 30; // polar depression -> shadowed ice crater
      if (y === 1) return 70; // crater ejecta ridge
      if (y === 2) return 40; // anorthosite highlands
      return 25; // basalt mare
    });
    setArchetype("lunar");
    Biomes.generate();

    expect(biomeAt(0, 0)).toBe(16);
    expect(biomeAt(3, 1)).toBe(15);
    expect(biomeAt(3, 2)).toBe(14);
    expect(biomeAt(3, 4)).toBe(13);
    for (const id of new Set([...pack.cells.biome])) expect([0, 13, 14, 15, 16]).toContain(id);
  });

  it("classifies martian cells into regolith, dune seas, shields and ice caps", () => {
    buildWorld((_x, y) => {
      if (y === 1) return 50; // oxide dune sea
      if (y === 2) return 70; // tharsis basalt shield
      return 30; // ferric regolith plains
    });
    setArchetype("martian");
    Biomes.generate();

    expect(biomeAt(0, 0)).toBe(20); // |lat| 78.75° > 72° -> polar ice cap
    expect(biomeAt(3, 1)).toBe(18);
    expect(biomeAt(3, 2)).toBe(19);
    expect(biomeAt(3, 4)).toBe(17);
    for (const id of new Set([...pack.cells.biome])) expect([0, 17, 18, 19, 20]).toContain(id);
  });

  it("grows terrestrial biomes in terraformed martian basins", () => {
    buildWorld((_x, y) => (y === 3 ? 25 : 50));
    grid.cells.temp.fill(15);
    grid.cells.prec.fill(60); // moisture >= 12 with T > -15 degC: hybrid basins
    options.map.geography.hydrographics = 40;
    setArchetype("martian");
    Biomes.generate();

    const hybrid = biomeAt(3, 3);
    expect(hybrid).toBeGreaterThanOrEqual(1);
    expect(hybrid).toBeLessThanOrEqual(12); // a terrestrial matrix biome, not a ferric one
    expect(biomeAt(0, 0)).toBe(20); // poles stay an ice cap
  });

  it("classifies icy moon cells into shell, matrix and lineae", () => {
    grid.cells.temp.fill(-60);
    buildWorld((_x, y) => (y === 1 ? 60 : y === 2 ? 25 : 40));
    setArchetype("icy_moon");
    Biomes.generate();

    expect(biomeAt(3, 1)).toBe(22); // chaos ice matrix
    expect(biomeAt(3, 2)).toBe(23); // thermal lineae rift
    expect(biomeAt(3, 4)).toBe(21); // smooth ice shell
  });

  it("classifies titan cells into dune bands and cryo-bedrock plains", () => {
    grid.cells.temp.fill(-40);
    buildWorld((_x, y) => (y === 1 ? 50 : 30));
    setArchetype("titan");
    Biomes.generate();

    expect(biomeAt(3, 4)).toBe(24); // equatorial dune band, |lat| 11.25° < 35°
    expect(biomeAt(3, 1)).toBe(25); // beyond 35 degN and too high: cryo-bedrock
    expect(biomeAt(0, 0)).toBe(25); // polar cells stay plains
  });

  it("classifies volcanic cells into flood plains and fumaroles, lava shores included", () => {
    grid.cells.temp.fill(60);
    buildWorld((_x, y) => (y === 1 ? 60 : 40));
    setArchetype("volcanic");
    const h = pack.cells.h;
    h[4 * COLS + 1] = 10; // carve a small lake
    h[4 * COLS + 2] = 10;
    pack.features[1] = { i: 1, type: "lake" } as unknown as Feature;
    pack.cells.f[4 * COLS + 1] = 1;
    pack.cells.f[4 * COLS + 2] = 1;
    Biomes.generate();

    expect(biomeAt(3, 1)).toBe(27); // high caldera
    expect(biomeAt(3, 4)).toBe(27); // shore of the (lava) lake
    expect(biomeAt(5, 6)).toBe(26); // ordinary basalt flood plain
    expect(biomeAt(1, 4)).toBe(0); // the lake itself stays marine
  });

  it("round-trips a martian map's biomes through the .map serialization format", () => {
    setArchetype("martian");
    Biomes.generate();

    // save.ts: JSON.stringify(pack.biomes); pack.cells.biome joins the typed array into the data sheet
    const savedBiomes = JSON.stringify(pack.biomes);
    const savedCells = String(pack.cells.biome);

    // load.ts: JSON.parse for the biome table, Uint8Array.from(data[16].split(","), Number) for cells
    const loadedBiomes = JSON.parse(savedBiomes);
    const loadedCells = Uint8Array.from(savedCells.split(","), Number);

    expect(loadedBiomes).toEqual(pack.biomes);
    expect(Array.from(loadedCells)).toEqual([...pack.cells.biome]);
    expect(loadedBiomes.length).toBe(28);
    expect(loadedBiomes[17].name).toBe("Ferric Regolith Plains");
  });

  it("round-trips a lunar map's biomes through the .map serialization format", () => {
    setArchetype("lunar");
    grid.cells.temp.fill(-20);
    Biomes.generate();

    const loadedCells = Uint8Array.from(String(pack.cells.biome).split(","), Number);
    expect(JSON.parse(JSON.stringify(pack.biomes))).toEqual(pack.biomes);
    expect(Array.from(loadedCells)).toEqual([...pack.cells.biome]);
  });

  it("restore() rebuilds the planetary biome block", () => {
    setArchetype("lunar");
    Biomes.generate();
    pack.biomes[13].name = "Renamed";
    Biomes.restore();

    expect(pack.biomes.length).toBe(28);
    expect(pack.biomes[13].name).toBe("Basalt Mare");
  });
});
