import { describe, expect, it } from "vitest";
import {
  CIV_TECH_BY_ID,
  CIV_TECH_ROW_DEVELOPMENT,
  CIV_TECHS,
  computePolityTechDevelopment,
  developmentToTechRow,
  seedTechsFromDevelopment,
  techRowTechs,
  techTargetDevelopment
} from "./living-civ-techs";

describe("CIV_TECHS <-> upstream development bridge", () => {
  it("bands every tech row on the 1..100 development scale", () => {
    const maxRow = Math.max(...CIV_TECHS.map(tech => tech.row));
    expect(CIV_TECH_ROW_DEVELOPMENT).toHaveLength(maxRow + 1);

    CIV_TECH_ROW_DEVELOPMENT.forEach((band, row) => {
      expect(band[0], `row ${row} starts before it ends`).toBeLessThanOrEqual(band[1]);
      if (row > 0)
        expect(band[0], `row ${row} continues the previous band`).toBe(CIV_TECH_ROW_DEVELOPMENT[row - 1]![1] + 1);
    });
    expect(CIV_TECH_ROW_DEVELOPMENT[0]![0]).toBe(6); // the first rows unlock with farming
    expect(CIV_TECH_ROW_DEVELOPMENT.at(-1)![1]).toBe(100);
  });

  it("reads the tech row of a development level", () => {
    expect(developmentToTechRow(0)).toBe(-1);
    expect(developmentToTechRow(5)).toBe(-1);
    expect(developmentToTechRow(6)).toBe(0);
    expect(developmentToTechRow(11)).toBe(0);
    expect(developmentToTechRow(12)).toBe(1);
    expect(developmentToTechRow(59)).toBe(7);
    expect(developmentToTechRow(100)).toBe(16);
  });

  it("targets the top of a technology's row band", () => {
    expect(techTargetDevelopment(CIV_TECH_BY_ID.pottery!)).toBe(CIV_TECH_ROW_DEVELOPMENT[0]![1]);
    expect(techTargetDevelopment(CIV_TECH_BY_ID.mathematics!)).toBe(CIV_TECH_ROW_DEVELOPMENT[2]![1]);
    expect(techTargetDevelopment(CIV_TECH_BY_ID.future_tech!)).toBe(100);
  });

  it("reads a polity's development from its researched technologies", () => {
    expect(computePolityTechDevelopment([])).toBe(0);
    expect(computePolityTechDevelopment(["not_a_tech"])).toBe(0);

    const row = techRowTechs(2).map(tech => tech.id);
    expect(computePolityTechDevelopment(row.slice(0, 2))).toBe(21); // halfway across 18..23
    expect(computePolityTechDevelopment(row)).toBe(CIV_TECH_ROW_DEVELOPMENT[2]![1]);
  });

  it("seeds nothing below the foragers' threshold", () => {
    expect(seedTechsFromDevelopment(0)).toEqual({ researched: [], progress: {} });
    expect(seedTechsFromDevelopment(5)).toEqual({ researched: [], progress: {} });
  });

  it("seeds earlier rows whole and the current one in part", () => {
    const seeded = seedTechsFromDevelopment(12);
    const known = new Set(seeded.researched);
    const rows = seeded.researched.map(id => CIV_TECH_BY_ID[id]!.row);

    expect(rows.filter(row => row === 0)).toHaveLength(techRowTechs(0).length);
    expect(rows.filter(row => row === 1)).toHaveLength(1);
    expect(rows.every(row => row <= 1)).toBe(true);

    for (const id of seeded.researched) {
      for (const prerequisite of CIV_TECH_BY_ID[id]!.prerequisites) expect(known.has(prerequisite)).toBe(true);
    }

    const banked = Object.values(seeded.progress);
    expect(banked).toHaveLength(1);
    expect(banked[0]).toBeGreaterThan(0);
  });

  it("never seeds past what the development level reached", () => {
    for (const development of [6, 17, 23, 45, 79, 100]) {
      const seeded = seedTechsFromDevelopment(development);
      const row = developmentToTechRow(development);
      expect(CIV_TECH_BY_ID[seeded.researched.at(-1) ?? "pottery"]!.row).toBeLessThanOrEqual(row);
      expect(computePolityTechDevelopment(seeded.researched)).toBeGreaterThanOrEqual(CIV_TECH_ROW_DEVELOPMENT[row]![0]);
      expect(computePolityTechDevelopment(seeded.researched)).toBeLessThanOrEqual(CIV_TECH_ROW_DEVELOPMENT[row]![1]);
    }
  });
});
