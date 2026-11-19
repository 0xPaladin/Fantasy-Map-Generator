import { describe, expect, it } from "vitest";
import { NECROPOLIS_TIERS } from "@/data/burials";
import { TREASURE_CATEGORIES } from "@/data/treasure";
import type { NecropolisContext } from "@/model/story/underworld-profile";
import { generateNecropolisProfile, renderNecropolisProfile } from "./necropolis-generator";

const context: NecropolisContext = {
  seed: "12345",
  cell: 1,
  cultureName: "Aeloran",
  alignment: "neutral",
  biomeName: "Forest",
  height: 25,
  name: "Aeloran Necropolis",
  burialType: "Necropolis"
};

describe("necropolis generator", () => {
  it("is deterministic for the same seed and context", () => {
    expect(generateNecropolisProfile(context)).toEqual(generateNecropolisProfile(context));
    expect(generateNecropolisProfile(context, "reroll")).toEqual(generateNecropolisProfile(context, "reroll"));
  });

  it("builds tiered sites and caps sub-dungeons", () => {
    for (const tier of NECROPOLIS_TIERS) {
      for (let seed = 0; seed < 20; seed++) {
        const profile = generateNecropolisProfile({ ...context, seed: String(seed), tier: tier.tier });
        expect(profile.sites.length).toBeGreaterThanOrEqual(tier.sites[0]);
        expect(profile.sites.length).toBeLessThanOrEqual(tier.sites[1]);

        const dungeons = profile.sites.filter(site => site.dungeon);
        expect(dungeons.length).toBeGreaterThanOrEqual(tier.dungeonSites[0]);
        expect(dungeons.length).toBeLessThanOrEqual(tier.dungeonSites[1]);

        for (const site of profile.sites) {
          if (site.dungeon) {
            expect(site.dungeonProfile).toBeDefined();
            expect(site.dungeonType).toBeDefined();
            expect(["small", "medium"]).toContain(site.dungeonProfile!.size);
            expect(site.dungeonProfile!.areaCount).toBeLessThanOrEqual(15);
            expect(Object.values(site.dungeonProfile!.treasure.shares).reduce((sum, share) => sum + share, 0)).toBe(
              100
            );
          } else {
            expect(site.dungeonProfile).toBeUndefined();
          }
        }

        for (const rating of Object.values(profile.ratings)) {
          expect(rating).toBeGreaterThanOrEqual(1);
          expect(rating).toBeLessThanOrEqual(10);
        }
        expect(profile.ratings.scale).toBe(tier.scale);
        expect(profile.inhabitants.rating).toBeGreaterThanOrEqual(1);
        expect(profile.inhabitants.rating).toBeLessThanOrEqual(6);
        expect(profile.inhabitants.groups.length).toBeLessThanOrEqual(2);

        const shares = Object.values(profile.treasure.shares);
        expect(shares.every(share => Number.isInteger(share) && share >= 0)).toBe(true);
        expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
        expect(Object.keys(profile.treasure.shares).sort()).toEqual([...TREASURE_CATEGORIES].sort());
      }
    }
  });

  it("lets the burial type bias small tiers", () => {
    expect(generateNecropolisProfile({ ...context, burialType: "Graveyard" }).tier).toBe("graveyard");
    expect(generateNecropolisProfile({ ...context, burialType: "Cemetery" }).tier).toBe("cemetery");
  });

  it("keeps history facts when they are known", () => {
    const profile = generateNecropolisProfile({
      ...context,
      tier: "city-of-the-dead",
      originalName: "Old Empire",
      originalPolity: "Old Empire",
      fallYear: 500,
      cause: "war"
    });
    expect(profile.originalName).toBe("Old Empire");
    expect(profile.originalPolity).toBe("Old Empire");
    expect(profile.fallYear).toBe(500);
    expect(profile.cause).toBe("war");
    expect(profile.age).toBe("fallen in 500");
  });

  it("renders a capital-scale profile inline without runaway notes", () => {
    const profile = generateNecropolisProfile({
      ...context,
      tier: "city-of-the-dead",
      name: "<script>alert(1)</script>"
    });
    expect(profile.sites.filter(site => site.dungeon).length).toBeGreaterThanOrEqual(2);
    const html = renderNecropolisProfile(profile);
    expect(html).toContain("Alternate necropolis profile");
    expect(html).not.toContain("<script>");
    expect((html.match(/<h3>/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html.length).toBeLessThan(40_000);
  });
});
