import { describe, expect, it } from "vitest";
import { type DiceSpec, DUNGEON_ALIGNMENT, DUNGEON_SIZES } from "@/data/dungeons";
import { generateDungeonName, generateDungeonProfile, renderDungeonProfile } from "./dungeon-generator";

const context = {
  seed: "241183762",
  cell: 512,
  cultureName: "Aeloran",
  alignment: "neutral" as const,
  biomeName: "forest",
  height: 42
};

const minOf = (spec: DiceSpec) => spec.count + (spec.add ?? 0);
const maxOf = (spec: DiceSpec) => spec.count * spec.sides + (spec.add ?? 0);

describe("dungeon generator", () => {
  it("is deterministic for a seed and cell", () => {
    expect(generateDungeonName(context)).toBe(generateDungeonName(context));
    expect(generateDungeonProfile(context)).toEqual(generateDungeonProfile(context));
  });

  it("changes with the seed", () => {
    expect(generateDungeonName({ ...context, seed: "other" })).not.toBe(generateDungeonName(context));
  });

  it("uses a marker name override in the profile", () => {
    expect(generateDungeonProfile({ ...context, name: "The User's Keep" }).name).toBe("The User's Keep");
  });

  it("fills the rolled size range and theme count", () => {
    for (let seed = 0; seed < 40; seed++) {
      const profile = generateDungeonProfile({ ...context, seed: String(seed) });
      const row = DUNGEON_SIZES.find(entry => entry.size === profile.size);
      expect(row).toBeDefined();
      expect(profile.areaCount).toBeGreaterThanOrEqual(minOf(row!.areas));
      expect(profile.areaCount).toBeLessThanOrEqual(maxOf(row!.areas));
      expect(profile.themes).toHaveLength(row!.themes);
    }
  });

  it("rolls alignment through the prevailing column", () => {
    const allowed = new Set(DUNGEON_ALIGNMENT.evil.map(outcome => outcome.alignment));
    const rolled = Array.from({ length: 20 }, (_, seed) =>
      generateDungeonProfile({ ...context, seed: String(seed), alignment: "evil" })
    );
    for (const profile of rolled) expect(allowed.has(profile.alignment)).toBe(true);
    expect(rolled.some(profile => profile.alignment === "evil")).toBe(true);
  });

  it("builds a connected area draft with valid exits", () => {
    for (let seed = 0; seed < 40; seed++) {
      const profile = generateDungeonProfile({ ...context, seed: String(seed) });
      expect(profile.areas).toHaveLength(profile.areaCount);
      expect(profile.areas[0].number).toBe(1);

      const numbers = new Set(profile.areas.map(area => area.number));
      for (const area of profile.areas) {
        expect(area.type).not.toBe("");
        expect(area.dressing).not.toBe("");
        expect(area.kind).toBeTruthy();
        for (const exit of area.exits) {
          if (exit.to !== "open") expect(numbers.has(exit.to)).toBe(true);
        }
      }
    }
  });

  it("produces no empty or missing text across many seeds", () => {
    for (let seed = 0; seed < 100; seed++) {
      const profile = generateDungeonProfile({ ...context, seed: String(seed) });
      const html = renderDungeonProfile(profile);
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("NaN");
      expect(profile.name).not.toBe("");
      expect(profile.overview.every(({ label, value }) => label && value)).toBe(true);
      expect(profile.rumors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("escapes untrusted context and profile text", () => {
    const profile = generateDungeonProfile({
      ...context,
      name: "<script>alert(1)</script>",
      cultureName: "<script>culture</script>"
    });
    const html = renderDungeonProfile(profile);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not render product-specific source terms", () => {
    const html = renderDungeonProfile(generateDungeonProfile(context));
    expect(html).not.toMatch(/booty|seclusium|gonzo|freebooters|underlands|\bbd\b/i);
  });
});
