import { describe, expect, it } from "vitest";
import { INHABITANT_GROUPS } from "./inhabitants";
import {
  RUIN_ACCESSIBILITY,
  RUIN_AGES,
  RUIN_CAUSE_TREASURE_MODIFIERS,
  RUIN_CAUSE_WEIRDNESS,
  RUIN_CAUSES,
  RUIN_CONDITIONS,
  RUIN_DANGERS,
  RUIN_DISCOVERIES,
  RUIN_EXITS,
  RUIN_LOOTED_TREASURE_MODIFIERS,
  RUIN_NAME_PARTS,
  RUIN_NAME_TEMPLATES,
  RUIN_ORIGINS,
  RUIN_REMAINS,
  RUIN_RUMORS,
  RUIN_SECRETS,
  RUIN_SITE_TYPES,
  RUIN_SURFACE_STATES,
  RUIN_TIERS,
  RUIN_ZONE_CONDITIONS
} from "./ruins";
import { TREASURE_CATEGORIES } from "./treasure";

const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
};

describe("ruin tables", () => {
  it("has weighted tiers and complete single-site tables", () => {
    expect(RUIN_TIERS).toHaveLength(5);
    expect(RUIN_TIERS.reduce((sum, tier) => sum + tier.weight, 0)).toBe(100);
    expect(RUIN_TIERS.every(tier => tier.scale >= 1 && tier.scale <= 10)).toBe(true);
    for (const tier of RUIN_TIERS) {
      expect(tier.sites[0]).toBeLessThanOrEqual(tier.sites[1]);
      expect(tier.dungeonSites[0]).toBeLessThanOrEqual(tier.dungeonSites[1]);
      expect(tier.dungeonSites[1]).toBeLessThanOrEqual(tier.sites[1]);
    }

    expect(RUIN_SITE_TYPES.length).toBeGreaterThan(0);
    expect(new Set(RUIN_SITE_TYPES.map(type => type.kind)).size).toBe(RUIN_SITE_TYPES.length);
    expect(RUIN_SITE_TYPES.every(type => type.label.trim() && type.zones.length > 0)).toBe(true);
    expect(RUIN_SITE_TYPES.some(type => Boolean(type.dungeonType))).toBe(true);

    expect(RUIN_CAUSES.length).toBeGreaterThan(0);
    expect(RUIN_CONDITIONS.length).toBeGreaterThan(0);
    expect(RUIN_ACCESSIBILITY.length).toBeGreaterThan(0);
    expect(RUIN_SURFACE_STATES.length).toBeGreaterThan(0);
    expect(RUIN_ZONE_CONDITIONS.length).toBeGreaterThan(0);
    expect(RUIN_AGES.length).toBeGreaterThan(0);
    expect(RUIN_DISCOVERIES.length).toBeGreaterThan(0);
    expect(RUIN_DANGERS.length).toBeGreaterThan(0);
    expect(RUIN_EXITS.length).toBeGreaterThan(0);
    expect(RUIN_REMAINS.length).toBeGreaterThan(0);
    expect(RUIN_SECRETS.length).toBeGreaterThan(0);
    expect(RUIN_RUMORS.length).toBeGreaterThan(0);
    expect(RUIN_NAME_TEMPLATES.length).toBeGreaterThan(0);
    expect(RUIN_NAME_PARTS.places.length).toBeGreaterThan(0);
    expect(RUIN_NAME_PARTS.adjectives.length).toBeGreaterThan(0);
    expect(RUIN_NAME_PARTS.nouns.length).toBeGreaterThan(0);
  });

  it("gives every origin zones, treasure weights and inhabitant weights", () => {
    const groupIds = INHABITANT_GROUPS.map(group => group.id);
    expect(RUIN_ORIGINS.length).toBeGreaterThan(0);

    for (const origin of RUIN_ORIGINS) {
      expect(origin.zones.length).toBeGreaterThan(0);
      expect(Object.keys(origin.treasure).sort()).toEqual([...TREASURE_CATEGORIES].sort());
      expect(Object.values(origin.treasure).every(weight => weight >= 0)).toBe(true);
      for (const [id, weight] of Object.entries(origin.inhabitants)) {
        expect(groupIds).toContain(id);
        expect(weight).toBeGreaterThan(0);
      }
    }
  });

  it("keeps modifier patterns non-global and the data generic", () => {
    const modifiers = [...RUIN_CAUSE_TREASURE_MODIFIERS, ...RUIN_LOOTED_TREASURE_MODIFIERS];
    for (const modifier of modifiers) expect(modifier.pattern.global).toBe(false);
    for (const entry of RUIN_CAUSE_WEIRDNESS) expect(entry.pattern.global).toBe(false);

    const text = strings({
      RUIN_ORIGINS,
      RUIN_CAUSES,
      RUIN_CONDITIONS,
      RUIN_ACCESSIBILITY,
      RUIN_SURFACE_STATES,
      RUIN_ZONE_CONDITIONS,
      RUIN_AGES,
      RUIN_DISCOVERIES,
      RUIN_DANGERS,
      RUIN_EXITS,
      RUIN_REMAINS,
      RUIN_SECRETS,
      RUIN_RUMORS,
      RUIN_NAME_TEMPLATES,
      RUIN_NAME_PARTS
    }).join("\n");
    expect(text).not.toMatch(/booty|seclusium|gonzo|freebooters|underlands|\bbd\b/i);
  });
});
