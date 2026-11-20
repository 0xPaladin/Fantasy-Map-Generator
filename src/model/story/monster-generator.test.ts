import { describe, expect, it } from "vitest";
import { TREASURE_CATEGORIES } from "@/data/treasure";
import type { MonsterContext } from "@/model/story/creature-profile";
import { generateMonsterProfile, renderMonsterProfile } from "./monster-generator";

const context: MonsterContext = {
  seed: "12345",
  cell: 1,
  cultureName: "Aeloran",
  alignment: "neutral",
  biomeName: "Forest",
  height: 60,
  name: "Aeloran Ogre",
  species: "Ogre",
  habit: "steals cattle at night"
};

describe("monster generator", () => {
  it("is deterministic for the same seed and context", () => {
    expect(generateMonsterProfile(context)).toEqual(generateMonsterProfile(context));
    expect(generateMonsterProfile(context, "reroll")).toEqual(generateMonsterProfile(context, "reroll"));
  });

  it("keeps the species, habit and marker name", () => {
    const profile = generateMonsterProfile(context);
    expect(profile.name).toBe("Aeloran Ogre");
    expect(profile.species).toBe("Ogre");
    expect(profile.habit).toBe("steals cattle at night");
  });

  it("builds ratings, inhabitants, treasure and hoard in range", () => {
    for (let seed = 0; seed < 50; seed++) {
      const profile = generateMonsterProfile({ ...context, seed: String(seed), species: undefined, habit: undefined });
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

      expect(profile.hoard.length).toBeGreaterThanOrEqual(2);
      expect(profile.moves.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("only gives a curio to magical, hoarder or huge monsters", () => {
    let withCurio = 0;
    for (let seed = 0; seed < 80; seed++) {
      const profile = generateMonsterProfile({ ...context, seed: String(seed) });
      if (profile.curio) {
        withCurio++;
        expect(profile.curio.name).not.toBe("");
        expect(profile.curio.power).not.toBe("");
        expect(profile.curio.drawback).not.toBe("");
        expect(profile.tags.includes("magical") || profile.tags.includes("hoarder") || profile.size === "huge").toBe(
          true
        );
      }
    }
    expect(withCurio).toBeGreaterThan(0);
  });

  it("caps lair drafts and keeps them off tiny monsters", () => {
    let withDraft = 0;
    for (let seed = 0; seed < 80; seed++) {
      const profile = generateMonsterProfile({ ...context, seed: String(seed) });
      if (profile.size === "tiny") expect(profile.dungeon).toBeUndefined();
      if (profile.dungeon) {
        withDraft++;
        expect(["small", "medium"]).toContain(profile.dungeon.size);
        expect(profile.dungeon.areaCount).toBeLessThanOrEqual(15);
        expect(profile.size === "large" || profile.size === "huge" || profile.tags.includes("hoarder")).toBe(true);
      }
    }
    expect(withDraft).toBeGreaterThan(0);
  });

  it("renders a bounded, escaped profile", () => {
    const profile = generateMonsterProfile({ ...context, name: "<script>alert(1)</script>" });
    const html = renderMonsterProfile(profile);
    expect(html).toContain("Alternate monster profile");
    expect(html).toContain("Hoard");
    expect(html).not.toContain("<script>");
    expect(html.length).toBeLessThan(40_000);
  });
});
