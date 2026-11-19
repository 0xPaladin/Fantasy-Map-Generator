import { describe, expect, it } from "vitest";
import { BURIAL_KINDS } from "@/data/burials";
import { TREASURE_CATEGORIES } from "@/data/treasure";
import type { BurialContext } from "@/model/story/underworld-profile";
import { generateBurialProfile, renderBurialProfile } from "./burial-generator";

const context: BurialContext = {
  seed: "12345",
  cell: 1,
  cultureName: "Aeloran",
  alignment: "neutral",
  biomeName: "Forest",
  height: 30,
  name: "Disturbed Burial",
  burialKind: "crypt",
  disturbance: "grave robbery"
};

describe("burial generator", () => {
  it("is deterministic for the same seed and context", () => {
    expect(generateBurialProfile(context)).toEqual(generateBurialProfile(context));
    expect(generateBurialProfile(context, "reroll")).toEqual(generateBurialProfile(context, "reroll"));
  });

  it("keeps the burial kind, label and marker name", () => {
    const profile = generateBurialProfile(context);
    expect(profile.name).toBe("Disturbed Burial");
    expect(profile.burialKind).toBe("crypt");
    expect(profile.label).toBe("a crypt");
    expect(profile.disturbance).toBe("grave robbery");
    expect(profile.looted).toBe(true);
  });

  it("builds kinds, zones, ratings, inhabitants and treasure in range", () => {
    for (let seed = 0; seed < 40; seed++) {
      const profile = generateBurialProfile({
        ...context,
        seed: String(seed),
        burialKind: undefined,
        disturbance: undefined
      });
      const kind = BURIAL_KINDS.find(row => row.kind === profile.burialKind)!;
      expect(profile.zones.length).toBeGreaterThanOrEqual(kind.zones[0]);
      expect(profile.zones.length).toBeLessThanOrEqual(kind.zones[1]);

      for (const rating of Object.values(profile.ratings)) {
        expect(rating).toBeGreaterThanOrEqual(1);
        expect(rating).toBeLessThanOrEqual(10);
      }
      expect(profile.ratings.scale).toBe(kind.scale);
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

  it("does not draft a dungeon for open graves", () => {
    for (const burialKind of ["grave", "cairn", "graveyard"] as const) {
      for (let seed = 0; seed < 15; seed++) {
        const profile = generateBurialProfile({ ...context, seed: String(seed), burialKind });
        expect(profile.dungeon).toBeUndefined();
      }
    }
  });

  it("drafts a small crypt for enclosed burials", () => {
    for (const burialKind of ["barrow", "crypt", "ossuary", "mass-grave"] as const) {
      const profile = generateBurialProfile({ ...context, burialKind });
      expect(profile.dungeon).toBeDefined();
      expect(profile.dungeon!.size).toBe("small");
      expect(profile.dungeon!.areaCount).toBeLessThanOrEqual(7);
      expect(Object.values(profile.dungeon!.treasure.shares).reduce((sum, share) => sum + share, 0)).toBe(100);
    }
  });

  it("stays dangerous and renders a bounded, escaped profile", () => {
    const profile = generateBurialProfile({
      ...context,
      burialKind: "mass-grave",
      disturbance: "a curse",
      name: "<script>alert(1)</script>"
    });
    expect(profile.ratings.danger).toBeGreaterThanOrEqual(4);
    const html = renderBurialProfile(profile);
    expect(html).toContain("Alternate burial profile");
    expect(html).not.toContain("<script>");
    expect(html.length).toBeLessThan(20_000);
  });
});
