import { describe, expect, it } from "vitest";
import { createRng } from "@/utils/rng";
import { annotateTreasureCaches, rateTreasureCache, treasureBand, treasureCacheDice } from "./treasure";

describe("treasure rating helpers", () => {
  it("scales cache dice with the treasure rating", () => {
    expect(treasureCacheDice(1)).toBe("1d4");
    expect(treasureCacheDice(4)).toBe("1d6+1");
    expect(treasureCacheDice(6)).toBe("1d8+1");
    expect(treasureCacheDice(8)).toBe("2d6+2");
    expect(treasureCacheDice(10)).toBe("3d8+3");
  });

  it("rewrites a cache's dice to the rating band, keeping the category", () => {
    expect(rateTreasureCache("a treasure cache (1d6+1) [Bullion]", 10)).toBe("a treasure cache (3d8+3) [Bullion]");
    expect(rateTreasureCache("a treasure cache", 2)).toBe("a treasure cache (1d4)");
  });

  it("names a magnitude band for the rating", () => {
    expect(treasureBand(1)).toBe("a pittance");
    expect(treasureBand(5)).toBe("a rich hoard");
    expect(treasureBand(10)).toBe("a legendary fortune");
  });

  it("annotates caches with rating-scaled dice and a mix category", () => {
    const rng = createRng("seed");
    const areas = [{ discoveries: ["a treasure cache (1d6+1)", "a faded mural"] }];
    annotateTreasureCaches(rng, areas, { bullion: 100, regalia: 0, art: 0, relics: 0 }, 9);
    expect(areas[0].discoveries[0]).toBe("a treasure cache (3d8+3) [Bullion]");
    expect(areas[0].discoveries[1]).toBe("a faded mural");
  });
});
