import { describe, expect, it } from "vitest";
import { getFactionArchetype } from "./factions-catalog";
import { LAIR_CATALOG } from "./living-lairs";
import {
  BURG_FACTION_IDS,
  getTroubleDef,
  getTroubleFactionType,
  ORGANIZATIONAL_TROUBLE_IDS,
  RESOURCE_FACTION_IDS,
  RUIN_FACTION_IDS,
  TROUBLE_CATALOG,
  TROUBLE_TO_FACTION,
  TROUBLE_TO_LAIR,
  troublesForCause
} from "./living-troubles";

describe("living-troubles (flavor catalog & retired organizational map)", () => {
  it("defines 28 instability flavor archetypes grouped by cause", () => {
    const keys = Object.keys(TROUBLE_CATALOG);
    expect(keys).toHaveLength(28);

    for (const id of keys) {
      const def = TROUBLE_CATALOG[id];
      expect(def).toBeDefined();
      expect(def.id).toBe(id);
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(["diversity", "corruption", "poverty", "site"]).toContain(def.cause);
    }

    for (const cause of ["diversity", "corruption", "poverty", "site"] as const) {
      expect(troublesForCause(cause).length).toBeGreaterThan(0);
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
});
