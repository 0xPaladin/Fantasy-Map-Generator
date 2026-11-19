import { describe, expect, it } from "vitest";
import * as D from "./dungeons";

const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
};

describe("dungeon table sizes", () => {
  it("has a full die for every shared table", () => {
    expect(D.DUNGEON_TYPES).toHaveLength(12);
    expect(D.DUNGEON_SIZES).toHaveLength(20);
    expect(D.DUNGEON_ACCESSIBILITY).toHaveLength(12);
    expect(D.DUNGEON_BUILDERS).toHaveLength(12);
    expect(D.DUNGEON_SITUATIONS).toHaveLength(12);
    expect(D.DUNGEON_CONDITIONS).toHaveLength(12);
    expect(D.DUNGEON_CAUSES).toHaveLength(12);
    expect(D.DUNGEON_AREA_CONTENTS).toHaveLength(12);
    expect(D.DUNGEON_EXITS).toHaveLength(8);
    expect(D.DUNGEON_DANGER_CATEGORIES).toHaveLength(20);
    expect(D.DUNGEON_LEADER_KINDS).toHaveLength(12);
    expect(D.DUNGEON_HAZARD_KINDS).toHaveLength(12);
    expect(D.DUNGEON_MONSTERS).toHaveLength(10);
    expect(D.DUNGEON_HUMANOIDS).toHaveLength(10);
    expect(D.DUNGEON_INHABITANT_GROUPS).toHaveLength(10);
    expect(D.DUNGEON_INHABITANT_RELATIONS).toHaveLength(6);
    expect(D.TREASURE_CATEGORIES).toHaveLength(4);
  });

  it("has treasure weights for every dungeon type and non-global modifier patterns", () => {
    for (const [type, weights] of Object.entries(D.DUNGEON_TREASURE_WEIGHTS)) {
      expect(Object.keys(weights).sort(), type).toEqual([...D.TREASURE_CATEGORIES].sort());
      expect(
        Object.values(weights).every(weight => weight >= 0),
        type
      ).toBe(true);
      expect(
        Object.values(weights).some(weight => weight > 0),
        type
      ).toBe(true);
    }

    const modifiers = [
      ...D.DUNGEON_TREASURE_BUILDER_MODIFIERS,
      ...D.DUNGEON_TREASURE_LAIR_MODIFIERS,
      ...D.DUNGEON_TREASURE_THEME_MODIFIERS,
      ...D.DUNGEON_TREASURE_AREA_MODIFIERS
    ];
    expect(modifiers.length).toBeGreaterThan(0);
    for (const modifier of modifiers) expect(modifier.pattern.global).toBe(false);
  });

  it("biases the treasure mix by type and modifier", () => {
    expect(D.DUNGEON_TREASURE_WEIGHTS.mine.bullion).toBeGreaterThan(D.DUNGEON_TREASURE_WEIGHTS.mine.relics);
    expect(D.DUNGEON_TREASURE_WEIGHTS.temple.relics).toBeGreaterThan(D.DUNGEON_TREASURE_WEIGHTS.temple.bullion);
    expect(D.DUNGEON_TREASURE_WEIGHTS.stronghold.regalia).toBeGreaterThan(0);

    const greed = D.DUNGEON_TREASURE_THEME_MODIFIERS.find(modifier => modifier.pattern.test("greed and avarice"));
    expect(greed?.weights.bullion).toBe(2);
    const religious = D.DUNGEON_TREASURE_BUILDER_MODIFIERS.find(modifier =>
      modifier.pattern.test("a religious order or cult")
    );
    expect(religious?.weights.relics).toBe(2);
  });

  it("has weighted inhabitant groups for every dungeon type", () => {
    const ids = D.DUNGEON_INHABITANT_GROUPS.map(group => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(D.DUNGEON_INHABITANT_GROUPS.every(group => group.label.trim())).toBe(true);

    for (const [type, weights] of Object.entries(D.DUNGEON_INHABITANT_WEIGHTS)) {
      const entries = Object.entries(weights);
      expect(entries.length, type).toBeGreaterThan(0);
      for (const [id, weight] of entries) {
        expect(ids).toContain(id);
        expect(weight).toBeGreaterThan(0);
      }
    }
  });

  it("has twelve alignment outcomes per prevailing alignment", () => {
    for (const outcomes of Object.values(D.DUNGEON_ALIGNMENT)) expect(outcomes).toHaveLength(12);
  });

  it("has the expected theme, name and detail lists", () => {
    expect(D.DUNGEON_NAME_TEMPLATES).toHaveLength(12);
    expect(D.DUNGEON_NAME_PARTS.places.length).toBeGreaterThan(20);
    expect(D.DUNGEON_NAME_PARTS.adjectives.length).toBeGreaterThan(20);
    expect(D.DUNGEON_NAME_PARTS.nouns.length).toBeGreaterThan(20);
    for (const entries of Object.values(D.DUNGEON_THEMES)) expect(entries).toHaveLength(12);
    for (const entries of Object.values(D.DUNGEON_LEADERS)) expect(entries).toHaveLength(10);
    for (const entries of Object.values(D.DUNGEON_ANIMALS)) expect(entries).toHaveLength(8);
    for (const entries of Object.values(D.DUNGEON_HAZARDS)) expect(entries).toHaveLength(10);
    for (const entries of Object.values(D.DUNGEON_DETAILS)) expect(entries).toHaveLength(12);
  });

  it("has a complete set of area, dressing, connection and discovery tables", () => {
    for (const [type, tables] of Object.entries(D.DUNGEON_TYPE_TABLES)) {
      expect(tables.overview.length, `${type} overview`).toBeGreaterThan(0);
      expect(tables.areaTypes, `${type} area types`).toHaveLength(20);
      expect(tables.dressing, `${type} dressing`).toHaveLength(10);
      expect(tables.connections.forms, `${type} forms`).toHaveLength(12);
      expect(tables.specialAreas, `${type} special areas`).toHaveLength(20);
      expect(tables.discoveries.features, `${type} features`).toHaveLength(12);
      expect(tables.discoveries.finds, `${type} finds`).toHaveLength(12);
      for (const field of tables.overview) expect(field.entries.length, `${type} ${field.label}`).toBeGreaterThan(0);
    }
  });
});

describe("dungeon table vocabulary", () => {
  it("does not carry product-specific table terms into the generated data", () => {
    const text = strings(D).join("\n");
    expect(text).not.toMatch(/booty|seclusium|gonzo|freebooters|underlands|\bbd\b/i);
  });
});
