import { describe, expect, it } from "vitest";
import {
  CIV_BELIEF_BY_ID,
  CIV_ENHANCER_BELIEFS,
  CIV_FOLLOWER_BELIEFS,
  CIV_FOUNDER_BELIEFS,
  CIV_PANTHEONS,
  CIV_RELIGION_NAMES
} from "./living-civ-beliefs";
import { CIV_BUILDING_BY_ID, CIV_BUILDINGS, getCivBuilding } from "./living-civ-buildings";
import { CIV_CIVILIAN_BY_ID, CIV_CIVILIANS, getCivCivilian } from "./living-civ-civilians";
import {
  CIV_IMPROVEMENT_BY_ID,
  CIV_IMPROVEMENTS,
  CIV_RESOURCES,
  CIV_TILE_BY_ID,
  CIV_TILES
} from "./living-civ-improvements";
import { CIV_ERAS, CIV_TECH_BY_ID, CIV_TECHS, getCivTech } from "./living-civ-techs";
import {
  activeCivEras,
  CIV_THEMES,
  getCivTheme,
  isCivEraAvailable,
  resolveCivBuildingName,
  resolveCivEraName,
  resolveCivImprovementName,
  resolveCivTechName,
  resolveCivUnitName,
  selectCivTheme
} from "./living-civ-themes";

function expectUniqueIds(items: readonly { id: string }[], label: string): void {
  const ids = items.map(item => item.id);
  expect(new Set(ids).size, `${label} ids are unique`).toBe(ids.length);
  expect(
    ids.every(id => id.length > 0),
    `${label} ids are non-empty`
  ).toBe(true);
}

/** Returns the first dependency cycle as `a -> b -> a`, or null when the graph is acyclic. */
function findCycle(graph: ReadonlyMap<string, readonly string[]>): string[] | null {
  const state = new Map<string, "visiting" | "done">();

  const visit = (id: string, path: readonly string[]): string[] | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return [...path, id];

    state.set(id, "visiting");
    for (const dependency of graph.get(id) ?? []) {
      const cycle = visit(dependency, [...path, id]);
      if (cycle) return cycle;
    }
    state.set(id, "done");
    return null;
  };

  for (const id of graph.keys()) {
    const cycle = visit(id, []);
    if (cycle) return cycle;
  }
  return null;
}

function graphOf(items: readonly { id: string; prerequisites?: readonly string[] }[]): Map<string, readonly string[]> {
  return new Map(items.map(item => [item.id, item.prerequisites ?? []]));
}

describe("living-civ catalogs (Slice 1)", () => {
  describe("tech tree", () => {
    it("ports every era and uses each tech's row era", () => {
      expect(CIV_ERAS).toHaveLength(8);
      expect(CIV_TECHS).toHaveLength(80);
      expectUniqueIds(CIV_TECHS, "tech");

      const seenRows = new Set<number>();
      for (const era of CIV_ERAS) {
        expect(era.name.length).toBeGreaterThan(0);
        expect(era.rows.length).toBeGreaterThan(0);
        for (const row of era.rows) {
          expect(seenRows.has(row), `row ${row} belongs to one era`).toBe(false);
          seenRows.add(row);
        }
      }

      for (const tech of CIV_TECHS) {
        expect(tech.name.length).toBeGreaterThan(0);
        expect(tech.description.length).toBeGreaterThan(0);
        expect(tech.cost).toBeGreaterThan(0);
        expect(tech.row).toBeGreaterThanOrEqual(0);
        expect(tech.slot).toBeGreaterThanOrEqual(0);

        const eraRows = CIV_ERAS.find(entry => entry.id === tech.era)?.rows ?? [];
        expect(eraRows, `tech ${tech.id} has a known era`).not.toHaveLength(0);
        expect(eraRows, `tech ${tech.id} row fits its era`).toContain(tech.row);
      }

      expect(new Set(CIV_TECHS.map(tech => tech.era)).size).toBe(CIV_ERAS.length);
      expect(CIV_TECH_BY_ID[CIV_TECHS[0].id]).toBe(CIV_TECHS[0]);
      expect(getCivTech(CIV_TECHS[0].id)).toBe(CIV_TECHS[0]);
      expect(getCivTech("not_a_tech")).toBeUndefined();
    });

    it("keeps the prerequisite graph closed and acyclic, with prerequisites on earlier rows", () => {
      const techIds = new Set(CIV_TECHS.map(tech => tech.id));

      for (const tech of CIV_TECHS) {
        for (const prerequisite of tech.prerequisites) {
          expect(techIds.has(prerequisite), `${tech.id} prerequisite ${prerequisite} exists`).toBe(true);
          const prerequisiteTech = CIV_TECH_BY_ID[prerequisite];
          expect(prerequisiteTech.row, `${tech.id} prerequisite ${prerequisite} sits earlier`).toBeLessThan(tech.row);
        }
      }

      expect(findCycle(graphOf(CIV_TECHS))).toBeNull();
    });
  });

  describe("buildings", () => {
    it("ports buildings with resolvable tech and building requirements", () => {
      expect(CIV_BUILDINGS).toHaveLength(94);
      expectUniqueIds(CIV_BUILDINGS, "building");

      const buildingIds = new Set(CIV_BUILDINGS.map(building => building.id));
      const techIds = new Set(CIV_TECHS.map(tech => tech.id));

      for (const building of CIV_BUILDINGS) {
        expect(building.name.length).toBeGreaterThan(0);
        expect(building.stats).toBeDefined();

        if (building.requiredTech) {
          expect(techIds.has(building.requiredTech), `${building.id} tech ${building.requiredTech}`).toBe(true);
        }
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
      expect(getCivBuilding("not_a_building")).toBeUndefined();
    });
  });

  describe("civilians", () => {
    it("keeps only the eight utility units the Civ mechanics still need", () => {
      expect(CIV_CIVILIANS).toHaveLength(8);
      expectUniqueIds(CIV_CIVILIANS, "civilian");

      const ids = new Set(CIV_CIVILIANS.map(unit => unit.id));
      for (const id of [
        "settler",
        "builder",
        "work_boat",
        "caravan",
        "cargo_ship",
        "missionary",
        "inquisitor",
        "great_prophet"
      ]) {
        expect(ids.has(id), `civilian ${id} exists`).toBe(true);
      }

      const techIds = new Set(CIV_TECHS.map(tech => tech.id));
      for (const unit of CIV_CIVILIANS) {
        expect(unit.name.length).toBeGreaterThan(0);
        expect(unit.isUtility, `${unit.id} is utility`).toBe(true);
        expect(["land", "sea", undefined]).toContain(unit.domain);
        if (unit.requiredTech) {
          expect(techIds.has(unit.requiredTech), `${unit.id} tech ${unit.requiredTech}`).toBe(true);
        }
        if (unit.capturedAs) {
          expect(CIV_CIVILIAN_BY_ID[unit.capturedAs], `${unit.id} captured as ${unit.capturedAs}`).toBeDefined();
        }
      }

      expect(CIV_CIVILIAN_BY_ID.builder).toBe(CIV_CIVILIANS.find(unit => unit.id === "builder"));
      expect(getCivCivilian("builder")?.name).toBe("Builder");
      expect(getCivCivilian("swordsman"), "combat units are roster-only now").toBeUndefined();
    });
  });

  describe("beliefs and religions", () => {
    it("ports pantheons, founder/follower/enhancer beliefs and religions", () => {
      expect(CIV_PANTHEONS).toHaveLength(26);
      expect(CIV_FOUNDER_BELIEFS).toHaveLength(9);
      expect(CIV_FOLLOWER_BELIEFS).toHaveLength(16);
      expect(CIV_ENHANCER_BELIEFS).toHaveLength(9);
      expect(CIV_RELIGION_NAMES.length).toBeGreaterThanOrEqual(8);

      const allBeliefs = [...CIV_PANTHEONS, ...CIV_FOUNDER_BELIEFS, ...CIV_FOLLOWER_BELIEFS, ...CIV_ENHANCER_BELIEFS];
      expectUniqueIds(allBeliefs, "belief");
      expect(Object.keys(CIV_BELIEF_BY_ID)).toHaveLength(allBeliefs.length);

      for (const belief of allBeliefs) {
        expect(belief.name.length).toBeGreaterThan(0);
        expect(belief.text.length).toBeGreaterThan(0);
        expect(belief.description.length).toBeGreaterThan(0);
      }

      for (const religion of CIV_RELIGION_NAMES) {
        expect(religion.length).toBeGreaterThan(0);
      }
    });

    it("resolves every belief building reference", () => {
      const buildingIds = new Set(CIV_BUILDINGS.map(building => building.id));
      const allBeliefs = [...CIV_PANTHEONS, ...CIV_FOUNDER_BELIEFS, ...CIV_FOLLOWER_BELIEFS, ...CIV_ENHANCER_BELIEFS];

      for (const belief of allBeliefs) {
        for (const effect of belief.effects?.buildingYields ?? []) {
          expect(buildingIds.has(effect.building), `${belief.id} building ${effect.building}`).toBe(true);
        }
        for (const effect of belief.effects?.faithBuildings ?? []) {
          expect(buildingIds.has(effect.building), `${belief.id} faith building ${effect.building}`).toBe(true);
        }
        for (const effect of belief.effects?.tileYields ?? []) {
          if (effect.improvement) {
            expect(CIV_IMPROVEMENT_BY_ID[effect.improvement], `${belief.id} improvement`).toBeDefined();
          }
        }
      }
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

      const techIds = new Set(CIV_TECHS.map(tech => tech.id));

      for (const improvement of CIV_IMPROVEMENTS) {
        expect(improvement.name.length).toBeGreaterThan(0);
        if (improvement.requiredTech) {
          expect(techIds.has(improvement.requiredTech), `${improvement.id} tech ${improvement.requiredTech}`).toBe(
            true
          );
        }
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

      for (const tech of CIV_TECHS) {
        for (const bonus of tech.tileBonuses ?? []) {
          expect(CIV_TILE_BY_ID[bonus.tileType], `${tech.id} bonus tile ${bonus.tileType}`).toBeDefined();
        }
      }

      expect(Object.keys(CIV_IMPROVEMENT_BY_ID)).toHaveLength(CIV_IMPROVEMENTS.length);
      expect(Object.keys(CIV_TILE_BY_ID)).toHaveLength(CIV_TILES.length);
    });
  });

  describe("adaptive theme profiles", () => {
    const themeIds = ["fantasy", "historical", "astral"] as const;
    const eraIds = CIV_ERAS.map(era => era.id);

    it("defines all three themes with active, ordered eras", () => {
      for (const themeId of themeIds) {
        const theme = getCivTheme(themeId);

        expect(theme.id).toBe(themeId);
        expect(theme.label.length).toBeGreaterThan(0);
        expect(CIV_THEMES[themeId]).toBe(theme);

        for (const era of eraIds) {
          expect(theme.eraNames[era].length, `${themeId} names ${era}`).toBeGreaterThan(0);
        }

        const active = activeCivEras(themeId);
        expect(active.length, `${themeId} has active eras`).toBeGreaterThan(0);
        expect(active[0].id).toBe("ancient");
        expect(active[active.length - 1].id).toBe(theme.eraCap);
        expect(isCivEraAvailable(themeId, theme.eraCap)).toBe(true);
      }

      expect(isCivEraAvailable("fantasy", "industrial")).toBe(false);
      expect(isCivEraAvailable("historical", "information")).toBe(true);
      expect(isCivEraAvailable("astral", "information")).toBe(true);
      expect(activeCivEras("fantasy").length).toBeLessThan(activeCivEras("historical").length);
    });

    it("resolves names with theme overrides and canonical fallbacks", () => {
      for (const themeId of themeIds) {
        for (const era of eraIds) {
          expect(resolveCivEraName(themeId, era).length).toBeGreaterThan(0);
        }
        for (const tech of CIV_TECHS) {
          expect(resolveCivTechName(themeId, tech).length).toBeGreaterThan(0);
        }
        for (const unit of CIV_CIVILIANS) {
          expect(resolveCivUnitName(themeId, unit).length).toBeGreaterThan(0);
        }
        for (const building of CIV_BUILDINGS) {
          expect(resolveCivBuildingName(themeId, building).length).toBeGreaterThan(0);
        }
        for (const improvement of CIV_IMPROVEMENTS) {
          expect(resolveCivImprovementName(themeId, improvement).length).toBeGreaterThan(0);
        }
      }

      expect(resolveCivUnitName("historical", CIV_CIVILIAN_BY_ID.builder!)).toBe("Builder");
      expect(resolveCivUnitName("fantasy", CIV_CIVILIAN_BY_ID.builder!)).toBe("Builder");
      expect(resolveCivUnitName("astral", CIV_CIVILIAN_BY_ID.builder!)).toBe("Constructor Drone");
      expect(resolveCivBuildingName("astral", CIV_BUILDING_BY_ID.palace)).toBe("Command Nexus");
      expect(resolveCivImprovementName("astral", CIV_IMPROVEMENT_BY_ID.farm)).toBe("Agripod");
    });

    it("selects astral first, then historical, and fantasy by default", () => {
      expect(selectCivTheme({})).toBe("fantasy");
      expect(selectCivTheme({ historical: true })).toBe("historical");
      expect(selectCivTheme({ astral: true })).toBe("astral");
      expect(selectCivTheme({ astral: true, historical: true })).toBe("astral");
    });
  });
});
