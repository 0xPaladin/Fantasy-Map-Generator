import { describe, expect, it } from "vitest";
import { CIV_BUILDING_BY_ID, CIV_BUILDINGS, civBuildingCapacity, getCivBuilding } from "./living-civ-buildings";
import {
  CIV_IMPROVEMENT_BY_ID,
  CIV_IMPROVEMENTS,
  CIV_RESOURCES,
  CIV_TILE_BY_ID,
  CIV_TILES
} from "./living-civ-improvements";

function expectUniqueIds(items: readonly { id: string }[], label: string): void {
  const ids = items.map(item => item.id);
  expect(new Set(ids).size, `${label} ids are unique`).toBe(ids.length);
  expect(
    ids.every(id => id.length > 0),
    `${label} ids are non-empty`
  ).toBe(true);
}

describe("living-civ catalogs (Slice 1)", () => {
  describe("buildings", () => {
    it("ports buildings with resolvable building requirements", () => {
      expect(CIV_BUILDINGS).toHaveLength(114);
      expect(CIV_BUILDINGS.filter(building => building.factionCategory !== undefined)).toHaveLength(20);
      expectUniqueIds(CIV_BUILDINGS, "building");

      const buildingIds = new Set(CIV_BUILDINGS.map(building => building.id));

      for (const building of CIV_BUILDINGS) {
        expect(building.name.length).toBeGreaterThan(0);
        expect(building.stats).toBeDefined();

        if (building.requiresBuilding) {
          expect(
            buildingIds.has(building.requiresBuilding),
            `${building.id} requires ${building.requiresBuilding}`
          ).toBe(true);
        }
        if (building.replaces) {
          expect(buildingIds.has(building.replaces), `${building.id} replaces ${building.replaces}`).toBe(true);
        }
        if (building.effects?.freeBuilding) {
          expect(buildingIds.has(building.effects.freeBuilding), `${building.id} free building`).toBe(true);
        }

        for (const effect of building.effects?.tileYields ?? []) {
          if (effect.improvement) {
            expect(CIV_IMPROVEMENT_BY_ID[effect.improvement], `${building.id} tile improvement`).toBeDefined();
          }
        }
      }

      expect(CIV_BUILDINGS.filter(building => building.isWonder).length).toBeGreaterThan(0);
      expect(CIV_BUILDINGS.filter(building => building.nationalWonder).length).toBeGreaterThan(0);
      expect(CIV_BUILDING_BY_ID.palace).toBe(CIV_BUILDINGS[0]);
      expect(getCivBuilding("palace")).toBe(CIV_BUILDINGS[0]);
      expect(getCivBuilding("trade_depot")?.factionCategory).toBe("commercial");
      expect(getCivBuilding("not_a_building")).toBeUndefined();
    });
  });

  describe("improvements, resources and tiles", () => {
    it("ports improvements, resources and tiles with resolvable references", () => {
      expect(CIV_IMPROVEMENTS).toHaveLength(14);
      expect(CIV_RESOURCES).toHaveLength(27);
      expect(CIV_TILES).toHaveLength(83);
      expectUniqueIds(CIV_IMPROVEMENTS, "improvement");
      expectUniqueIds(CIV_RESOURCES, "resource");
      expectUniqueIds(CIV_TILES, "tile");

      for (const improvement of CIV_IMPROVEMENTS) {
        expect(improvement.name.length).toBeGreaterThan(0);
        for (const [resource, tile] of Object.entries(improvement.resources ?? {})) {
          expect(resource.length).toBeGreaterThan(0);
          expect(CIV_TILE_BY_ID[tile], `${improvement.id} resource ${resource} -> ${tile}`).toBeDefined();
        }
      }

      for (const resource of CIV_RESOURCES) {
        expect(["bonus", "strategic", "luxury"]).toContain(resource.class);
        expect(resource.spawnTiles.length).toBeGreaterThan(0);
        for (const tile of resource.spawnTiles) {
          expect(CIV_TILE_BY_ID[tile], `${resource.id} spawns on ${tile}`).toBeDefined();
        }
      }

      expect(Object.keys(CIV_IMPROVEMENT_BY_ID)).toHaveLength(CIV_IMPROVEMENTS.length);
      expect(Object.keys(CIV_TILE_BY_ID)).toHaveLength(CIV_TILES.length);
    });
  });

  describe("civBuildingCapacity", () => {
    it("maps military structures to M capacity", () => {
      expect(civBuildingCapacity("walls").m).toBeGreaterThanOrEqual(1);
      expect(civBuildingCapacity("barracks").m).toBeGreaterThanOrEqual(1);
      expect(civBuildingCapacity("castle").m).toBeGreaterThanOrEqual(2);
      expect(civBuildingCapacity("military_base").m).toBeGreaterThanOrEqual(2);
    });

    it("maps economic structures to W capacity", () => {
      expect(civBuildingCapacity("market").w).toBeGreaterThanOrEqual(1);
      expect(civBuildingCapacity("bank").w).toBeGreaterThanOrEqual(2);
      expect(civBuildingCapacity("stock_exchange").w).toBeGreaterThanOrEqual(2);
      expect(civBuildingCapacity("workshop").w).toBeGreaterThanOrEqual(1);
    });

    it("maps cultural and religious structures to S capacity", () => {
      expect(civBuildingCapacity("monument").s).toBeGreaterThanOrEqual(1);
      expect(civBuildingCapacity("temple").s).toBeGreaterThanOrEqual(2);
      expect(civBuildingCapacity("colosseum").s).toBeGreaterThanOrEqual(2);
      expect(civBuildingCapacity("museum").s).toBeGreaterThanOrEqual(2);
    });

    it("maps scientific and intrigue structures to C capacity", () => {
      expect(civBuildingCapacity("library").c).toBeGreaterThanOrEqual(1);
      expect(civBuildingCapacity("university").c).toBeGreaterThanOrEqual(2);
      expect(civBuildingCapacity("public_school").c).toBeGreaterThanOrEqual(2);
      expect(civBuildingCapacity("observatory").c).toBeGreaterThanOrEqual(1);
    });

    it("treats palace as inherent capital seat with 0 extra capacity (capital court bonus handled separately)", () => {
      expect(civBuildingCapacity("palace")).toEqual({ m: 0, w: 0, s: 0, c: 0 });
    });

    it("returns zeros safely for unknown or empty input", () => {
      expect(civBuildingCapacity(undefined)).toEqual({ m: 0, w: 0, s: 0, c: 0 });
      expect(civBuildingCapacity(null)).toEqual({ m: 0, w: 0, s: 0, c: 0 });
      expect(civBuildingCapacity("nonexistent_building")).toEqual({ m: 0, w: 0, s: 0, c: 0 });
    });
  });
});
