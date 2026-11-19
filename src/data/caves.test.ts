import { describe, expect, it } from "vitest";
import {
  CAVE_DANGERS,
  CAVE_DISCOVERIES,
  CAVE_ENTRANCE_FORMS,
  CAVE_EXITS,
  CAVE_EXTENT_EMPTY_CHANCE,
  CAVE_EXTENT_INHABITANT_BASE,
  CAVE_EXTENT_INHABITANTS,
  CAVE_EXTENTS,
  CAVE_RUMORS,
  CAVE_SECRETS,
  CAVE_STATUS_TREASURE_MODIFIERS,
  CAVE_STATUS_WEIRDNESS,
  CAVE_TREASURE_BASE,
  CAVE_WATER_STATES,
  CAVE_ZONE_CONDITIONS,
  CAVE_ZONE_TYPES
} from "./caves";
import { INHABITANT_GROUPS } from "./inhabitants";
import { TREASURE_CATEGORIES } from "./treasure";

const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
};

describe("cave tables", () => {
  it("has weighted extents and complete survey tables", () => {
    expect(CAVE_EXTENTS).toHaveLength(5);
    expect(CAVE_EXTENTS.reduce((sum, row) => sum + row.weight, 0)).toBe(100);
    for (const row of CAVE_EXTENTS) {
      expect(row.scale).toBeGreaterThanOrEqual(1);
      expect(row.scale).toBeLessThanOrEqual(10);
      expect(row.zones[0]).toBeLessThanOrEqual(row.zones[1]);
      expect(row.dungeonChance).toBeGreaterThanOrEqual(0);
      expect(row.dungeonChance).toBeLessThanOrEqual(1);
      expect(["small", "medium"]).toContain(row.dungeonSize);
    }

    expect(CAVE_ENTRANCE_FORMS.length).toBeGreaterThan(0);
    expect(CAVE_WATER_STATES.length).toBeGreaterThan(0);
    expect(CAVE_ZONE_TYPES.length).toBeGreaterThan(0);
    expect(CAVE_ZONE_CONDITIONS.length).toBeGreaterThan(0);
    expect(CAVE_DISCOVERIES.length).toBeGreaterThan(0);
    expect(CAVE_DANGERS.length).toBeGreaterThan(0);
    expect(CAVE_EXITS.length).toBeGreaterThan(0);
    expect(CAVE_SECRETS.length).toBeGreaterThan(0);
    expect(CAVE_RUMORS.length).toBeGreaterThan(0);
  });

  it("gives every extent inhabitant weights and encounter bounds", () => {
    const groupIds = INHABITANT_GROUPS.map(group => group.id);
    for (const row of CAVE_EXTENTS) {
      const weights = CAVE_EXTENT_INHABITANTS[row.extent];
      expect(Object.keys(weights).length).toBeGreaterThan(0);
      for (const [id, weight] of Object.entries(weights)) {
        expect(groupIds).toContain(id);
        expect(weight).toBeGreaterThan(0);
      }
      expect(CAVE_EXTENT_EMPTY_CHANCE[row.extent]).toBeGreaterThanOrEqual(0);
      expect(CAVE_EXTENT_EMPTY_CHANCE[row.extent]).toBeLessThanOrEqual(1);
      expect(CAVE_EXTENT_INHABITANT_BASE[row.extent]).toBeGreaterThanOrEqual(1);
      expect(CAVE_EXTENT_INHABITANT_BASE[row.extent]).toBeLessThanOrEqual(6);
    }
  });

  it("keeps treasure weights and modifiers generic", () => {
    expect(Object.keys(CAVE_TREASURE_BASE).sort()).toEqual([...TREASURE_CATEGORIES].sort());
    expect(Object.values(CAVE_TREASURE_BASE).every(weight => weight >= 0)).toBe(true);
    for (const modifier of CAVE_STATUS_TREASURE_MODIFIERS) expect(modifier.pattern.global).toBe(false);
    for (const entry of CAVE_STATUS_WEIRDNESS) expect(entry.pattern.global).toBe(false);

    const text = strings({
      CAVE_EXTENTS,
      CAVE_ENTRANCE_FORMS,
      CAVE_WATER_STATES,
      CAVE_ZONE_TYPES,
      CAVE_ZONE_CONDITIONS,
      CAVE_DISCOVERIES,
      CAVE_DANGERS,
      CAVE_EXITS,
      CAVE_SECRETS,
      CAVE_RUMORS
    }).join("\n");
    expect(text).not.toMatch(/booty|seclusium|gonzo|freebooters|underlands|\bbd\b/i);
  });
});
