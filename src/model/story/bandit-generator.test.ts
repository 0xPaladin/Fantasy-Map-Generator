import { describe, expect, it } from "vitest";
import { CREATURE_WEALTH } from "@/data/creatures";
import { TREASURE_CATEGORIES } from "@/data/treasure";
import type { BanditContext } from "@/model/story/creature-profile";
import { generateBanditProfile, renderBanditProfile } from "./bandit-generator";

const context: BanditContext = {
  seed: "12345",
  cell: 1,
  cultureName: "Aeloran",
  alignment: "neutral",
  biomeName: "Forest",
  height: 40,
  name: "Aeloran Wolves",
  gang: "Wolves",
  locality: "forest",
  maritime: false
};

describe("bandit generator", () => {
  it("is deterministic for the same seed and context", () => {
    expect(generateBanditProfile(context)).toEqual(generateBanditProfile(context));
    expect(generateBanditProfile(context, "reroll")).toEqual(generateBanditProfile(context, "reroll"));
  });

  it("keeps the locality, maritime flag, epithet and marker name", () => {
    const profile = generateBanditProfile(context);
    expect(profile.name).toBe("Aeloran Wolves");
    expect(profile.locality).toBe("forest");
    expect(profile.maritime).toBe(false);
    expect(profile.epithet).toBe("Wolves");
    expect(profile.leader).not.toBe("");
    expect(profile.leaderTrait).not.toBe("");
  });

  it("builds ratings, inhabitants, treasure and loot in range", () => {
    for (let seed = 0; seed < 50; seed++) {
      const profile = generateBanditProfile({ ...context, seed: String(seed), gang: undefined, locality: undefined });
      for (const rating of Object.values(profile.ratings)) {
        expect(rating).toBeGreaterThanOrEqual(1);
        expect(rating).toBeLessThanOrEqual(10);
      }
      expect(profile.inhabitants.rating).toBeGreaterThanOrEqual(1);
      expect(profile.inhabitants.rating).toBeLessThanOrEqual(6);
      expect(profile.inhabitants.groups.length).toBeGreaterThanOrEqual(1);
      expect(profile.inhabitants.groups.length).toBeLessThanOrEqual(2);

      const shares = Object.values(profile.treasure.shares);
      expect(shares.every(share => Number.isInteger(share) && share >= 0)).toBe(true);
      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
      expect(Object.keys(profile.treasure.shares).sort()).toEqual([...TREASURE_CATEGORIES].sort());

      expect(profile.loot.length).toBeGreaterThanOrEqual(1);
      expect(profile.moves.length).toBeGreaterThanOrEqual(3);
      const wealthRow = CREATURE_WEALTH.find(row => row.wealth === profile.wealth)!;
      expect(profile.lootDie).toBe(wealthRow.lootDie);
    }
  });

  it("flags maritime crews and gives them a seaborne base", () => {
    const profile = generateBanditProfile({ ...context, maritime: true, locality: undefined, name: "Pirates" });
    expect(profile.maritime).toBe(true);
    expect(profile.tags).toContain("seaborne");
    expect(["a wreck", "an island", "an anchorage", "a hidden cove"]).toContain(profile.base);
  });

  it("only gives a base draft to companies and crews", () => {
    let withDraft = 0;
    for (let seed = 0; seed < 80; seed++) {
      const profile = generateBanditProfile({ ...context, seed: String(seed) });
      if (profile.gangSize === "handful" || profile.gangSize === "band") expect(profile.dungeon).toBeUndefined();
      if (profile.dungeon) {
        withDraft++;
        expect(["company", "crew"]).toContain(profile.gangSize);
        expect(profile.dungeon.size).toBe("small");
        expect(profile.dungeon.areaCount).toBeLessThanOrEqual(7);
      }
    }
    expect(withDraft).toBeGreaterThan(0);
  });

  it("renders a bounded, escaped profile", () => {
    const profile = generateBanditProfile({ ...context, name: "<script>alert(1)</script>" });
    const html = renderBanditProfile(profile);
    expect(html).toContain("Alternate bandit profile");
    expect(html).toContain("Loot");
    expect(html).not.toContain("<script>");
    expect(html.length).toBeLessThan(30_000);
  });
});
