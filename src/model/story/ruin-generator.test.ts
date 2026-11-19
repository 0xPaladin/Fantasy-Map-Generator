import { describe, expect, it } from "vitest";
import { TREASURE_CATEGORIES } from "@/data/treasure";
import { generateRuinName, generateRuinProfile, renderRuinProfile } from "./ruin-generator";

const context = {
  seed: "241183762",
  cell: 512,
  cultureName: "Aeloran",
  alignment: "neutral" as const,
  biomeName: "forest",
  height: 42
};

describe("ruin generator", () => {
  it("is deterministic for a seed and cell", () => {
    expect(generateRuinName(context)).toBe(generateRuinName(context));
    expect(generateRuinProfile(context)).toEqual(generateRuinProfile(context));
  });

  it("uses the generated name as the original name", () => {
    const profile = generateRuinProfile(context);
    expect(profile.originalName).toBe(generateRuinName(context));
    expect(profile.name.startsWith("Ruins of ")).toBe(true);
  });

  it("keeps the context name and history facts", () => {
    const profile = generateRuinProfile({
      ...context,
      name: "Ruins of Vaelen",
      originalName: "Vaelen",
      originalPolity: "Old Vaelen",
      fallYear: 512,
      cause: "a curse",
      clearedBy: "King Alden",
      looted: true
    });
    expect(profile.name).toBe("Ruins of Vaelen");
    expect(profile.originalName).toBe("Vaelen");
    expect(profile.originalPolity).toBe("Old Vaelen");
    expect(profile.fallYear).toBe(512);
    expect(profile.cause).toBe("a curse");
    expect(profile.clearedBy).toBe("King Alden");
    expect(renderRuinProfile(profile)).toContain("Original polity:");
  });

  it("keeps ratings, inhabitants and treasure in range", () => {
    for (let seed = 0; seed < 80; seed++) {
      const profile = generateRuinProfile({ ...context, seed: String(seed) });
      for (const rating of Object.values(profile.ratings)) {
        expect(rating).toBeGreaterThanOrEqual(1);
        expect(rating).toBeLessThanOrEqual(10);
      }
      expect(profile.inhabitants.rating).toBeGreaterThanOrEqual(1);
      expect(profile.inhabitants.rating).toBeLessThanOrEqual(6);
      expect(profile.inhabitants.groups.length).toBeGreaterThanOrEqual(0);
      expect(profile.inhabitants.groups.length).toBeLessThanOrEqual(2);
      expect(Boolean(profile.inhabitants.relationship)).toBe(profile.inhabitants.groups.length === 2);

      const shares = Object.values(profile.treasure.shares);
      expect(shares.every(share => Number.isInteger(share) && share >= 0)).toBe(true);
      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
      expect(Object.keys(profile.treasure.shares).sort()).toEqual([...TREASURE_CATEGORIES].sort());
    }
  });

  it("builds a single site and 4–8 zones", () => {
    for (let seed = 0; seed < 40; seed++) {
      const profile = generateRuinProfile({ ...context, seed: String(seed) });
      expect(profile.sites).toHaveLength(1);
      expect(profile.sites[0].dungeon).toBe(false);
      expect(profile.zones.length).toBeGreaterThanOrEqual(4);
      expect(profile.zones.length).toBeLessThanOrEqual(8);
      for (const zone of profile.zones) {
        expect(zone.type).not.toBe("");
        expect(zone.condition).not.toBe("");
        if (zone.discovery && /treasure cache/i.test(zone.discovery))
          expect(zone.discovery).toMatch(/\[(Bullion|Regalia|Art|Relics)\]/);
      }
    }
  });

  it("can produce empty ruins", () => {
    const empty = Array.from({ length: 80 }, (_, seed) =>
      generateRuinProfile({ ...context, seed: String(seed), tier: "outpost" })
    ).some(profile => profile.inhabitants.groups.length === 0);
    expect(empty).toBe(true);
  });

  it("lowers the treasure rating when the ruin has been looted", () => {
    const rich = generateRuinProfile({ ...context, cause: "war" });
    const looted = generateRuinProfile({ ...context, cause: "war", looted: true });
    expect(looted.ratings.treasure).toBeLessThanOrEqual(rich.ratings.treasure);
  });

  it("renders the full profile and escapes unsafe text", () => {
    const profile = generateRuinProfile({ ...context, name: "<script>alert(1)</script>" });
    const html = renderRuinProfile(profile);
    expect(html).toContain("What it was");
    expect(html).toContain("Zones");
    expect(html).toContain("Treasure mix");
    expect(html).toContain("Inhabitants");
    expect(html).toContain("Alternate ruin profile");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });
});
