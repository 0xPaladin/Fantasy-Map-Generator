import { describe, expect, it } from "vitest";
import { TREASURE_CATEGORIES } from "@/data/treasure";
import type { BeastContext } from "@/model/story/creature-profile";
import { generateBeastProfile, renderBeastProfile } from "./beast-generator";

const context: BeastContext = {
  seed: "12345",
  cell: 1,
  cultureName: "Aeloran",
  alignment: "neutral",
  biomeName: "Forest",
  height: 10,
  name: "Loch Ael Monster",
  habitat: "a freshwater lake",
  length: 12
};

describe("beast generator", () => {
  it("is deterministic for the same seed and context", () => {
    expect(generateBeastProfile(context)).toEqual(generateBeastProfile(context));
    expect(generateBeastProfile(context, "reroll")).toEqual(generateBeastProfile(context, "reroll"));
  });

  it("keeps the habitat, length and marker name", () => {
    const profile = generateBeastProfile(context);
    expect(profile.name).toBe("Loch Ael Monster");
    expect(profile.habitat).toBe("a freshwater lake");
    expect(profile.length).toBe(12);
  });

  it("builds ratings, inhabitants, treasure and harvest in range", () => {
    for (let seed = 0; seed < 50; seed++) {
      const profile = generateBeastProfile({ ...context, seed: String(seed), habitat: undefined, length: undefined });
      for (const rating of Object.values(profile.ratings)) {
        expect(rating).toBeGreaterThanOrEqual(1);
        expect(rating).toBeLessThanOrEqual(10);
      }
      expect(profile.inhabitants.rating).toBeGreaterThanOrEqual(1);
      expect(profile.inhabitants.rating).toBeLessThanOrEqual(6);
      expect(profile.inhabitants.groups.length).toBeGreaterThanOrEqual(1);
      expect(profile.inhabitants.groups.length).toBeLessThanOrEqual(2);
      expect(Boolean(profile.inhabitants.relationship)).toBe(profile.inhabitants.groups.length === 2);

      const shares = Object.values(profile.treasure.shares);
      expect(shares.every(share => Number.isInteger(share) && share >= 0)).toBe(true);
      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
      expect(Object.keys(profile.treasure.shares).sort()).toEqual([...TREASURE_CATEGORIES].sort());

      expect(profile.harvest.length).toBeGreaterThanOrEqual(2);
      expect(profile.signs.length).toBeGreaterThanOrEqual(1);
      expect(profile.moves.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("does not give tiny or herd beasts a lair draft, but large beasts can have one", () => {
    let withDraft = 0;
    for (let seed = 0; seed < 80; seed++) {
      const profile = generateBeastProfile({ ...context, seed: String(seed) });
      if (profile.size === "tiny" || profile.natureId === "herd") {
        expect(profile.dungeon).toBeUndefined();
      }
      if (profile.dungeon) {
        withDraft++;
        expect(profile.dungeon.size).toBe("small");
        expect(profile.dungeon.areaCount).toBeLessThanOrEqual(7);
      }
    }
    expect(withDraft).toBeGreaterThan(0);
  });

  it("renders a bounded, escaped profile", () => {
    const profile = generateBeastProfile({ ...context, name: "<script>alert(1)</script>" });
    const html = renderBeastProfile(profile);
    expect(html).toContain("Alternate beast profile");
    expect(html).toContain("Harvest");
    expect(html).not.toContain("<script>");
    expect(html.length).toBeLessThan(30_000);
  });
});
