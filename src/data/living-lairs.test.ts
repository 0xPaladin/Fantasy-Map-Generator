import { describe, expect, it } from "vitest";
import { currentContent } from "@/data/roster-store";
import { getLairDef, instantiateLairUnits, LAIR_CATALOG } from "./living-lairs";

const LAIR_IDS = Object.keys(LAIR_CATALOG);

describe("living-lairs (military templates for dangerous factions)", () => {
  it("defines 20 distinct lair natures", () => {
    expect(LAIR_IDS).toHaveLength(20);
    expect(new Set(LAIR_IDS).size).toBe(20);

    for (const id of LAIR_IDS) {
      const def = LAIR_CATALOG[id]!;
      expect(def.id).toBe(id);
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.raidThreshold).toBeGreaterThanOrEqual(4);
      expect(def.raidThreshold).toBeLessThanOrEqual(6);
      expect(def.raidUnits.length).toBeGreaterThan(0);
      expect(def.defenderUnits.length).toBeGreaterThan(0);
      expect(["burg", "ruin", "resource"]).toContain(def.defaultTheme);
      expect(def.markerIcon).toBeTruthy();
    }
  });

  it("references valid unit types defined in the roster catalog", () => {
    const { unitTypes } = currentContent().content;
    for (const id of LAIR_IDS) {
      const def = LAIR_CATALOG[id]!;
      for (const u of [...def.raidUnits, ...def.defenderUnits]) {
        expect(unitTypes[u.unitTypeId], `Lair ${id} unit ${u.unitTypeId} exists in unitTypes`).toBeDefined();
        expect(u.count).toBeGreaterThan(0);
      }
    }
  });

  it("instantiates ArmyUnit records with correct men counts and attributes", () => {
    const def = getLairDef("ancient_evil");
    const defenders = instantiateLairUnits(def.defenderUnits);
    // 3 dead_legion, 1 gorgon_behemoth, 1 necromancer = 5 units
    expect(defenders).toHaveLength(5);
    for (const unit of defenders) {
      expect(unit.count).toBeGreaterThan(0);
      expect(unit.exp).toBe(0);
      expect(unit.type).toBeTruthy();
    }
  });

  it("falls back to a known template for unknown lair ids", () => {
    expect(getLairDef("does_not_exist")).toBe(LAIR_CATALOG.ancient_evil);
  });
});
