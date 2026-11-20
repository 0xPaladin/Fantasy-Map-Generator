import { describe, expect, it } from "vitest";
import {
  BEAST_FORMS,
  BEAST_HABITATS,
  BEAST_LAIRS,
  BEAST_NATURES,
  BEAST_RUMORS,
  BEAST_SIGNS,
  BODY_PART_PROPERTIES,
  BODY_PARTS,
  CREATURE_ACTIVITIES,
  CREATURE_ALIGNMENT,
  CREATURE_ATTACKS,
  CREATURE_COLORS,
  CREATURE_CONDITIONS,
  CREATURE_DEFENSES,
  CREATURE_MOVES,
  CREATURE_QUANTITIES,
  CREATURE_SIZES,
  CREATURE_STRANGE_FEATURES,
  CREATURE_TAGS,
  CREATURE_TEXTURES,
  CREATURE_WANTS,
  CREATURE_WEALTH,
  CURIO_ADJECTIVES,
  CURIO_DRAWBACKS,
  CURIO_ITEMS,
  CURIO_NAME_TEMPLATES,
  CURIO_POWERS,
  CURIO_PROPERTIES,
  GEM_TYPES,
  JEWELRY_FORMS,
  LOOT_CONTEXTS,
  MONSTER_LAIRS,
  MONSTER_NATURES,
  MONSTER_RUMORS,
  MONSTER_SIGNS,
  MONSTER_TERRITORY,
  RARITY_CATEGORIES,
  TRINKET_FORMS
} from "./creatures";
import { ALIGNMENTS } from "./culture-traits";
import { INHABITANT_GROUPS } from "./inhabitants";
import { TREASURE_CATEGORIES } from "./treasure";

const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
};

describe("creature tables", () => {
  it("has weighted sizes, quantities and wealth", () => {
    expect(CREATURE_SIZES).toHaveLength(5);
    expect(CREATURE_SIZES.reduce((sum, row) => sum + row.weight, 0)).toBe(100);
    for (const row of CREATURE_SIZES) {
      expect(row.scale).toBeGreaterThanOrEqual(1);
      expect(row.scale).toBeLessThanOrEqual(10);
      expect(row.encounterBase).toBeGreaterThanOrEqual(1);
      expect(row.encounterBase).toBeLessThanOrEqual(6);
    }

    expect(CREATURE_QUANTITIES).toHaveLength(4);
    expect(CREATURE_QUANTITIES.reduce((sum, row) => sum + row.weight, 0)).toBe(100);
    for (const row of CREATURE_QUANTITIES) {
      expect(row.count).not.toBe("");
      expect(row.encounterBonus).toBeGreaterThanOrEqual(0);
    }

    expect(CREATURE_WEALTH).toHaveLength(6);
    expect(CREATURE_WEALTH.reduce((sum, row) => sum + row.weight, 0)).toBe(100);
    for (const row of CREATURE_WEALTH) expect(row.rank).toBeGreaterThanOrEqual(0);
  });

  it("gives every nature treasure weights and inhabitant weights", () => {
    const groupIds = INHABITANT_GROUPS.map(group => group.id);
    for (const table of [BEAST_NATURES, MONSTER_NATURES]) {
      expect(table.length).toBeGreaterThan(0);
      expect(table.reduce((sum, row) => sum + row.weight, 0)).toBe(100);
      for (const nature of table) {
        expect(nature.label).not.toBe("");
        expect(nature.dangerBonus).toBeGreaterThanOrEqual(0);
        expect(Object.keys(nature.treasure).sort()).toEqual([...TREASURE_CATEGORIES].sort());
        expect(Object.values(nature.treasure).every(weight => weight >= 0)).toBe(true);
        for (const [id, weight] of Object.entries(nature.inhabitants)) {
          expect(groupIds).toContain(id);
          expect(weight).toBeGreaterThan(0);
        }
      }
    }
  });

  it("builds a valid alignment column for every prevailing alignment", () => {
    for (const prevailing of ALIGNMENTS) {
      const column = CREATURE_ALIGNMENT[prevailing];
      expect(column).toHaveLength(12);
      for (const alignment of column) expect(ALIGNMENTS).toContain(alignment);
    }
  });

  it("has complete loot contexts and prompt tables", () => {
    expect(LOOT_CONTEXTS).toHaveLength(4);
    for (const row of LOOT_CONTEXTS) {
      expect(Object.keys(row.treasure).sort()).toEqual([...TREASURE_CATEGORIES].sort());
      expect(row.forms.length).toBeGreaterThan(0);
    }

    for (const table of [
      CREATURE_TAGS,
      CREATURE_ATTACKS,
      CREATURE_DEFENSES,
      CREATURE_WANTS,
      CREATURE_MOVES,
      CREATURE_COLORS,
      CREATURE_TEXTURES,
      CREATURE_CONDITIONS,
      CREATURE_ACTIVITIES,
      CREATURE_STRANGE_FEATURES,
      BODY_PARTS,
      BODY_PART_PROPERTIES,
      TRINKET_FORMS,
      GEM_TYPES,
      JEWELRY_FORMS,
      RARITY_CATEGORIES,
      CURIO_NAME_TEMPLATES,
      CURIO_PROPERTIES,
      CURIO_ADJECTIVES,
      CURIO_ITEMS,
      CURIO_POWERS,
      CURIO_DRAWBACKS,
      BEAST_HABITATS,
      BEAST_FORMS,
      BEAST_LAIRS,
      BEAST_SIGNS,
      BEAST_RUMORS,
      MONSTER_LAIRS,
      MONSTER_SIGNS,
      MONSTER_TERRITORY,
      MONSTER_RUMORS
    ]) {
      expect(table.length).toBeGreaterThan(0);
    }
  });

  it("keeps the data generic", () => {
    const text = strings({
      CREATURE_SIZES,
      CREATURE_QUANTITIES,
      CREATURE_WEALTH,
      BEAST_NATURES,
      MONSTER_NATURES,
      CREATURE_TAGS,
      CREATURE_ATTACKS,
      CREATURE_DEFENSES,
      CREATURE_WANTS,
      CREATURE_MOVES,
      CREATURE_COLORS,
      CREATURE_TEXTURES,
      CREATURE_CONDITIONS,
      CREATURE_ACTIVITIES,
      CREATURE_STRANGE_FEATURES,
      LOOT_CONTEXTS,
      BODY_PARTS,
      BODY_PART_PROPERTIES,
      TRINKET_FORMS,
      GEM_TYPES,
      JEWELRY_FORMS,
      RARITY_CATEGORIES,
      CURIO_NAME_TEMPLATES,
      CURIO_PROPERTIES,
      CURIO_ADJECTIVES,
      CURIO_ITEMS,
      CURIO_POWERS,
      CURIO_DRAWBACKS,
      BEAST_HABITATS,
      BEAST_FORMS,
      BEAST_LAIRS,
      BEAST_SIGNS,
      BEAST_RUMORS,
      MONSTER_LAIRS,
      MONSTER_SIGNS,
      MONSTER_TERRITORY,
      MONSTER_RUMORS
    }).join("\n");
    expect(text).not.toMatch(/booty|seclusium|gonzo|freebooters|underlands|\bbd\b/i);
  });
});
