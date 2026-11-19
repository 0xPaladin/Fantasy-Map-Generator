import { describe, expect, it } from "vitest";
import { CAVE_EXTENTS } from "@/data/caves";
import { TREASURE_CATEGORIES } from "@/data/treasure";
import type { CaveContext } from "@/model/story/underworld-profile";
import { generateCaveProfile, renderCaveProfile } from "./cave-generator";

const context: CaveContext = {
  seed: "12345",
  cell: 1,
  cultureName: "Aeloran",
  alignment: "neutral",
  biomeName: "Forest",
  height: 60,
  name: "Aeloran Cave",
  formation: "Cave",
  status: "the home of strange monsters"
};

describe("cave generator", () => {
  it("is deterministic for the same seed and context", () => {
    expect(generateCaveProfile(context)).toEqual(generateCaveProfile(context));
    expect(generateCaveProfile(context, "reroll")).toEqual(generateCaveProfile(context, "reroll"));
  });

  it("keeps the formation, status and marker name", () => {
    const profile = generateCaveProfile(context);
    expect(profile.name).toBe("Aeloran Cave");
    expect(profile.formation).toBe("Cave");
    expect(profile.status).toBe("the home of strange monsters");
  });

  it("builds extents, zones, ratings, inhabitants and treasure in range", () => {
    for (let seed = 0; seed < 40; seed++) {
      const profile = generateCaveProfile({ ...context, seed: String(seed), formation: undefined, status: undefined });
      const extent = CAVE_EXTENTS.find(row => row.extent === profile.extent)!;
      expect(profile.zones.length).toBeGreaterThanOrEqual(extent.zones[0]);
      expect(profile.zones.length).toBeLessThanOrEqual(extent.zones[1]);

      for (const rating of Object.values(profile.ratings)) {
        expect(rating).toBeGreaterThanOrEqual(1);
        expect(rating).toBeLessThanOrEqual(10);
      }
      expect(profile.ratings.scale).toBe(extent.scale);
      expect(profile.inhabitants.rating).toBeGreaterThanOrEqual(1);
      expect(profile.inhabitants.rating).toBeLessThanOrEqual(6);
      expect(profile.inhabitants.groups.length).toBeLessThanOrEqual(2);
      expect(Boolean(profile.inhabitants.relationship)).toBe(profile.inhabitants.groups.length === 2);

      const shares = Object.values(profile.treasure.shares);
      expect(shares.every(share => Number.isInteger(share) && share >= 0)).toBe(true);
      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
      expect(Object.keys(profile.treasure.shares).sort()).toEqual([...TREASURE_CATEGORIES].sort());

      for (const zone of profile.zones) {
        if (zone.discovery && /treasure cache/i.test(zone.discovery))
          expect(zone.discovery).toMatch(/\[(Bullion|Regalia|Art|Relics)\]/);
      }
    }
  });

  it("does not force a dungeon on empty, flooded or lava caves", () => {
    for (const status of ["totally empty", "completely flooded", "slowly filling with lava"]) {
      for (let seed = 0; seed < 20; seed++) {
        const profile = generateCaveProfile({ ...context, seed: String(seed), status, extent: "abyssal" });
        expect(profile.dungeon).toBeUndefined();
      }
    }
  });

  it("can draft a capped dungeon for a monster-haunted deep cave", () => {
    const profile = generateCaveProfile({ ...context, extent: "abyssal", status: "the home of strange monsters" });
    expect(profile.dungeon).toBeDefined();
    expect(["small", "medium"]).toContain(profile.dungeon!.size);
    expect(profile.dungeon!.areaCount).toBeLessThanOrEqual(15);
    expect(Object.values(profile.dungeon!.treasure.shares).reduce((sum, share) => sum + share, 0)).toBe(100);
  });

  it("renders a bounded, escaped profile", () => {
    const profile = generateCaveProfile({
      ...context,
      extent: "abyssal",
      status: "the home of strange monsters",
      name: "<script>alert(1)</script>"
    });
    const html = renderCaveProfile(profile);
    expect(html).toContain("Alternate cave profile");
    expect(html).not.toContain("<script>");
    expect(html.length).toBeLessThan(30_000);
  });
});
