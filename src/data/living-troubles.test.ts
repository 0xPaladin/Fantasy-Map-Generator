import { describe, expect, it } from "vitest";
import { LAIR_CATALOG } from "./living-lairs";
import { getFactionArchetype } from "./factions-catalog";
import {
  BURG_FACTION_IDS,
  BURG_TROUBLE_IDS,
  getTroubleDef,
  getTroubleFactionType,
  ORGANIZATIONAL_TROUBLE_IDS,
  RESOURCE_FACTION_IDS,
  RESOURCE_TROUBLE_IDS,
  RUIN_FACTION_IDS,
  RUIN_TROUBLE_IDS,
  TROUBLE_CATALOG,
  TROUBLE_TO_FACTION,
  TROUBLE_TO_LAIR,
  troubleUnitMatchMultiplier,
  UNIT_ROLE_POOLS
} from "./living-troubles";

describe("living-troubles (hazard catalog, retired organizational map, unit roles)", () => {
  it("defines exactly the 28 hazard and hazardous-custom archetypes", () => {
    const keys = Object.keys(TROUBLE_CATALOG);
    expect(keys).toHaveLength(28);

    for (const id of keys) {
      const def = TROUBLE_CATALOG[id];
      expect(def).toBeDefined();
      expect(def.id).toBe(id);
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(["m", "w", "s"]).toContain(def.pool);
      expect(["disorder", "uprising", "poverty", "ignorance", "despair", "corruption"]).toContain(def.save);
      expect(["guardsmen", "military", "merchant", "sage", "prophet", "magistrate"]).toContain(def.requiredRole);
    }

    for (const table of [BURG_TROUBLE_IDS, RUIN_TROUBLE_IDS, RESOURCE_TROUBLE_IDS]) {
      expect(table.length).toBeGreaterThan(0);
      for (const id of table) expect(TROUBLE_CATALOG[id], `spawn table id ${id} is a hazard`).toBeDefined();
    }
  });

  it("maps all 18 retired organizational troubles to faction archetypes and lair templates", () => {
    expect(ORGANIZATIONAL_TROUBLE_IDS).toHaveLength(18);
    for (const id of ORGANIZATIONAL_TROUBLE_IDS) {
      expect(TROUBLE_CATALOG[id]).toBeUndefined();
      const factionType = getTroubleFactionType(id);
      expect(getFactionArchetype(factionType), `${id} resolves to a faction archetype`).toBeDefined();
      expect(LAIR_CATALOG[TROUBLE_TO_LAIR[id]!], `template lair for ${id}`).toBeDefined();
    }
    expect(getTroubleFactionType("monsters")).toBe("monster_nest");
    expect(getTroubleFactionType("murderous_heirs")).toBe("conquering_heirs");
    expect(TROUBLE_TO_FACTION.monsters).toBe("monster_nest");
  });

  it("covers every organizational trouble in the dangerous-faction spawn pools", () => {
    const pool = new Set([...BURG_FACTION_IDS, ...RUIN_FACTION_IDS, ...RESOURCE_FACTION_IDS]);
    for (const id of ORGANIZATIONAL_TROUBLE_IDS) expect(pool.has(id)).toBe(true);
  });

  it("retrieves trouble definitions with fallback via getTroubleDef", () => {
    const flooding = getTroubleDef("flooding");
    expect(flooding.id).toBe("flooding");
    expect(flooding.name).toBeTruthy();

    const fallback = getTroubleDef("non_existent_trouble");
    expect(fallback).toBe(TROUBLE_CATALOG.flooding);
  });

  it("computes troubleUnitMatchMultiplier correctly based on role and pool match", () => {
    const def = getTroubleDef("flooding"); // pool: w, requiredRole: merchant
    expect(troubleUnitMatchMultiplier(def, "merchant")).toBe(1); // exact role
    expect(troubleUnitMatchMultiplier(def, "sage")).toBe(2); // same pool (w), different role
    expect(troubleUnitMatchMultiplier(def, "military")).toBe(3); // wrong pool (m)
    expect(troubleUnitMatchMultiplier(def, undefined)).toBe(3); // no unit
  });

  it("maintains consistent pool mapping in UNIT_ROLE_POOLS", () => {
    expect(UNIT_ROLE_POOLS.guardsmen).toBe("m");
    expect(UNIT_ROLE_POOLS.military).toBe("m");
    expect(UNIT_ROLE_POOLS.merchant).toBe("w");
    expect(UNIT_ROLE_POOLS.sage).toBe("w");
    expect(UNIT_ROLE_POOLS.prophet).toBe("s");
    expect(UNIT_ROLE_POOLS.magistrate).toBe("s");
  });
});
