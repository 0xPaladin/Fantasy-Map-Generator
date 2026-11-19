import { describe, expect, it } from "vitest";
import {
  BANDIT_BASES,
  BANDIT_INHABITANTS,
  BANDIT_LEADERS,
  BANDIT_LOCALITIES,
  BANDIT_MOVES,
  BANDIT_RUMORS,
  BANDIT_TREASURE,
  BANDIT_WANTS,
  BANDIT_WEAPONS,
  CONTRABAND,
  GANG_COMPOSITIONS,
  GANG_SIZES,
  LEADER_TRAITS,
  RAID_PREY,
  RAID_TACTICS
} from "./bandits";
import { INHABITANT_GROUPS } from "./inhabitants";
import { TREASURE_CATEGORIES } from "./treasure";

const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
};

describe("bandit tables", () => {
  it("has weighted gang sizes and complete raid tables", () => {
    expect(GANG_SIZES).toHaveLength(4);
    expect(GANG_SIZES.reduce((sum, row) => sum + row.weight, 0)).toBe(100);
    for (const row of GANG_SIZES) {
      expect(row.label).not.toBe("");
      expect(row.count).not.toBe("");
      expect(row.encounterBonus).toBeGreaterThanOrEqual(0);
    }

    for (const table of [
      GANG_COMPOSITIONS,
      BANDIT_LEADERS,
      LEADER_TRAITS,
      BANDIT_LOCALITIES,
      BANDIT_BASES,
      RAID_PREY,
      RAID_TACTICS,
      CONTRABAND,
      BANDIT_WEAPONS,
      BANDIT_WANTS,
      BANDIT_MOVES,
      BANDIT_RUMORS
    ]) {
      expect(table.length).toBeGreaterThan(0);
    }
  });

  it("has valid treasure and inhabitant weights", () => {
    expect(Object.keys(BANDIT_TREASURE).sort()).toEqual([...TREASURE_CATEGORIES].sort());
    expect(Object.values(BANDIT_TREASURE).every(weight => weight >= 0)).toBe(true);

    const groupIds = INHABITANT_GROUPS.map(group => group.id);
    for (const [id, weight] of Object.entries(BANDIT_INHABITANTS)) {
      expect(groupIds).toContain(id);
      expect(weight).toBeGreaterThan(0);
    }
  });

  it("keeps the data generic", () => {
    const text = strings({
      GANG_SIZES,
      GANG_COMPOSITIONS,
      BANDIT_LEADERS,
      LEADER_TRAITS,
      BANDIT_LOCALITIES,
      BANDIT_BASES,
      RAID_PREY,
      RAID_TACTICS,
      CONTRABAND,
      BANDIT_WEAPONS,
      BANDIT_WANTS,
      BANDIT_MOVES,
      BANDIT_RUMORS
    }).join("\n");
    expect(text).not.toMatch(/booty|seclusium|gonzo|freebooters|underlands|\bbd\b/i);
  });
});
