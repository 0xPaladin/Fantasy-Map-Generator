import { describe, expect, it } from "vitest";
import {
  BURIAL_ACTIVITIES,
  BURIAL_CAUSE_TREASURE_MODIFIERS,
  BURIAL_CAUSE_WEIRDNESS,
  BURIAL_CUSTOMS,
  BURIAL_DANGERS,
  BURIAL_DISCOVERIES,
  BURIAL_DISTURBANCES,
  BURIAL_EXITS,
  BURIAL_KIND_EMPTY_CHANCE,
  BURIAL_KIND_INHABITANT_BASE,
  BURIAL_KIND_INHABITANTS,
  BURIAL_KINDS,
  BURIAL_LOOTED_TREASURE_MODIFIERS,
  BURIAL_RUMORS,
  BURIAL_SECRETS,
  BURIAL_TREASURE_BASE,
  BURIAL_WARDS,
  BURIAL_WHO,
  BURIAL_ZONE_CONDITIONS,
  BURIAL_ZONE_TYPES,
  NECROPOLIS_AGES,
  NECROPOLIS_CAUSE_TREASURE_MODIFIERS,
  NECROPOLIS_CAUSE_WEIRDNESS,
  NECROPOLIS_CAUSES,
  NECROPOLIS_DANGERS,
  NECROPOLIS_DISCOVERIES,
  NECROPOLIS_EXITS,
  NECROPOLIS_REMAINS,
  NECROPOLIS_RUMORS,
  NECROPOLIS_SECRETS,
  NECROPOLIS_SITE_TYPES,
  NECROPOLIS_SURFACE_STATES,
  NECROPOLIS_TIER_EMPTY_CHANCE,
  NECROPOLIS_TIER_INHABITANT_BASE,
  NECROPOLIS_TIER_INHABITANTS,
  NECROPOLIS_TIERS,
  NECROPOLIS_TREASURE_BASE,
  NECROPOLIS_ZONE_CONDITIONS,
  NECROPOLIS_ZONE_TYPES
} from "./burials";
import { DUNGEON_TYPES } from "./dungeons";
import { INHABITANT_GROUPS } from "./inhabitants";
import { TREASURE_CATEGORIES } from "./treasure";

const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
};

describe("burial tables", () => {
  it("has weighted burial kinds and complete hazard tables", () => {
    expect(BURIAL_KINDS).toHaveLength(7);
    expect(BURIAL_KINDS.reduce((sum, row) => sum + row.weight, 0)).toBe(100);
    for (const row of BURIAL_KINDS) {
      expect(row.scale).toBeGreaterThanOrEqual(1);
      expect(row.scale).toBeLessThanOrEqual(10);
      expect(row.zones[0]).toBeLessThanOrEqual(row.zones[1]);
      if (row.dungeon) expect(DUNGEON_TYPES).toContain(row.dungeonType);
      else expect(row.dungeonType).toBeUndefined();
    }

    expect(BURIAL_WHO.length).toBeGreaterThan(0);
    expect(BURIAL_CUSTOMS.length).toBeGreaterThan(0);
    expect(BURIAL_DISTURBANCES.length).toBeGreaterThan(0);
    expect(BURIAL_ACTIVITIES.length).toBeGreaterThan(0);
    expect(BURIAL_WARDS.length).toBeGreaterThan(0);
    expect(BURIAL_ZONE_TYPES.length).toBeGreaterThan(0);
    expect(BURIAL_ZONE_CONDITIONS.length).toBeGreaterThan(0);
    expect(BURIAL_DISCOVERIES.length).toBeGreaterThan(0);
    expect(BURIAL_DANGERS.length).toBeGreaterThan(0);
    expect(BURIAL_EXITS.length).toBeGreaterThan(0);
    expect(BURIAL_SECRETS.length).toBeGreaterThan(0);
    expect(BURIAL_RUMORS.length).toBeGreaterThan(0);
  });

  it("gives every burial kind inhabitant weights and encounter bounds", () => {
    const groupIds = INHABITANT_GROUPS.map(group => group.id);
    for (const row of BURIAL_KINDS) {
      const weights = BURIAL_KIND_INHABITANTS[row.kind];
      expect(Object.keys(weights).length).toBeGreaterThan(0);
      for (const [id, weight] of Object.entries(weights)) {
        expect(groupIds).toContain(id);
        expect(weight).toBeGreaterThan(0);
      }
      expect(BURIAL_KIND_EMPTY_CHANCE[row.kind]).toBeGreaterThanOrEqual(0);
      expect(BURIAL_KIND_EMPTY_CHANCE[row.kind]).toBeLessThanOrEqual(1);
      expect(BURIAL_KIND_INHABITANT_BASE[row.kind]).toBeGreaterThanOrEqual(1);
      expect(BURIAL_KIND_INHABITANT_BASE[row.kind]).toBeLessThanOrEqual(6);
    }
  });

  it("keeps burial treasure weights and modifiers generic", () => {
    expect(Object.keys(BURIAL_TREASURE_BASE).sort()).toEqual([...TREASURE_CATEGORIES].sort());
    expect(Object.values(BURIAL_TREASURE_BASE).every(weight => weight >= 0)).toBe(true);
    const modifiers = [...BURIAL_CAUSE_TREASURE_MODIFIERS, ...BURIAL_LOOTED_TREASURE_MODIFIERS];
    for (const modifier of modifiers) expect(modifier.pattern.global).toBe(false);
    for (const entry of BURIAL_CAUSE_WEIRDNESS) expect(entry.pattern.global).toBe(false);

    const text = strings({
      BURIAL_KINDS,
      BURIAL_WHO,
      BURIAL_CUSTOMS,
      BURIAL_DISTURBANCES,
      BURIAL_ACTIVITIES,
      BURIAL_WARDS,
      BURIAL_ZONE_TYPES,
      BURIAL_ZONE_CONDITIONS,
      BURIAL_DISCOVERIES,
      BURIAL_DANGERS,
      BURIAL_EXITS,
      BURIAL_SECRETS,
      BURIAL_RUMORS
    }).join("\n");
    expect(text).not.toMatch(/booty|seclusium|gonzo|freebooters|underlands|\bbd\b/i);
  });
});

describe("necropolis tables", () => {
  it("has weighted tiers and complete burial-complex tables", () => {
    expect(NECROPOLIS_TIERS).toHaveLength(5);
    expect(NECROPOLIS_TIERS.reduce((sum, tier) => sum + tier.weight, 0)).toBe(100);
    for (const tier of NECROPOLIS_TIERS) {
      expect(tier.scale).toBeGreaterThanOrEqual(1);
      expect(tier.scale).toBeLessThanOrEqual(10);
      expect(tier.sites[0]).toBeLessThanOrEqual(tier.sites[1]);
      expect(tier.dungeonSites[0]).toBeLessThanOrEqual(tier.dungeonSites[1]);
      expect(tier.dungeonSites[1]).toBeLessThanOrEqual(tier.sites[1]);
    }

    expect(NECROPOLIS_SITE_TYPES.length).toBeGreaterThan(0);
    expect(new Set(NECROPOLIS_SITE_TYPES.map(type => type.kind)).size).toBe(NECROPOLIS_SITE_TYPES.length);
    for (const type of NECROPOLIS_SITE_TYPES) {
      expect(type.label.trim()).not.toBe("");
      expect(type.zones.length).toBeGreaterThan(0);
      if (type.dungeonType) expect(DUNGEON_TYPES).toContain(type.dungeonType);
    }
    expect(NECROPOLIS_SITE_TYPES.some(type => Boolean(type.dungeonType))).toBe(true);

    expect(NECROPOLIS_CAUSES.length).toBeGreaterThan(0);
    expect(NECROPOLIS_AGES.length).toBeGreaterThan(0);
    expect(NECROPOLIS_SURFACE_STATES.length).toBeGreaterThan(0);
    expect(NECROPOLIS_ZONE_TYPES.length).toBeGreaterThan(0);
    expect(NECROPOLIS_ZONE_CONDITIONS.length).toBeGreaterThan(0);
    expect(NECROPOLIS_DISCOVERIES.length).toBeGreaterThan(0);
    expect(NECROPOLIS_DANGERS.length).toBeGreaterThan(0);
    expect(NECROPOLIS_EXITS.length).toBeGreaterThan(0);
    expect(NECROPOLIS_REMAINS.length).toBeGreaterThan(0);
    expect(NECROPOLIS_SECRETS.length).toBeGreaterThan(0);
    expect(NECROPOLIS_RUMORS.length).toBeGreaterThan(0);
  });

  it("gives every tier inhabitant weights and encounter bounds", () => {
    const groupIds = INHABITANT_GROUPS.map(group => group.id);
    for (const tier of NECROPOLIS_TIERS) {
      const weights = NECROPOLIS_TIER_INHABITANTS[tier.tier];
      expect(Object.keys(weights).length).toBeGreaterThan(0);
      for (const [id, weight] of Object.entries(weights)) {
        expect(groupIds).toContain(id);
        expect(weight).toBeGreaterThan(0);
      }
      expect(NECROPOLIS_TIER_EMPTY_CHANCE[tier.tier]).toBeGreaterThanOrEqual(0);
      expect(NECROPOLIS_TIER_EMPTY_CHANCE[tier.tier]).toBeLessThanOrEqual(1);
      expect(NECROPOLIS_TIER_INHABITANT_BASE[tier.tier]).toBeGreaterThanOrEqual(1);
      expect(NECROPOLIS_TIER_INHABITANT_BASE[tier.tier]).toBeLessThanOrEqual(6);
    }
  });

  it("keeps necropolis treasure weights and modifiers generic", () => {
    expect(Object.keys(NECROPOLIS_TREASURE_BASE).sort()).toEqual([...TREASURE_CATEGORIES].sort());
    expect(Object.values(NECROPOLIS_TREASURE_BASE).every(weight => weight >= 0)).toBe(true);
    for (const modifier of NECROPOLIS_CAUSE_TREASURE_MODIFIERS) expect(modifier.pattern.global).toBe(false);
    for (const entry of NECROPOLIS_CAUSE_WEIRDNESS) expect(entry.pattern.global).toBe(false);

    const text = strings({
      NECROPOLIS_TIERS,
      NECROPOLIS_SITE_TYPES,
      NECROPOLIS_CAUSES,
      NECROPOLIS_AGES,
      NECROPOLIS_SURFACE_STATES,
      NECROPOLIS_ZONE_TYPES,
      NECROPOLIS_ZONE_CONDITIONS,
      NECROPOLIS_DISCOVERIES,
      NECROPOLIS_DANGERS,
      NECROPOLIS_EXITS,
      NECROPOLIS_REMAINS,
      NECROPOLIS_SECRETS,
      NECROPOLIS_RUMORS
    }).join("\n");
    expect(text).not.toMatch(/booty|seclusium|gonzo|freebooters|underlands|\bbd\b/i);
  });
});
