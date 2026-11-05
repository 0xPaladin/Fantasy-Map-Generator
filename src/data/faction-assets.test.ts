import { describe, expect, it } from "vitest";
import { CIV_TECHS } from "@/data/living-civ-techs";
import { computeFactionScale } from "@/types/factions";
import { getAllFactionAssets, getFactionAsset, getFactionAssetsByTrack } from "./faction-assets";

describe("FACTION_ASSETS_CATALOG", () => {
  const knownTechIds = new Set(CIV_TECHS.map(t => t.id));

  it("contains at least 20 defined assets across multiple tracks", () => {
    const assets = getAllFactionAssets();
    expect(assets.length).toBeGreaterThanOrEqual(20);
  });

  it("has valid requiredTech referencing valid CIV_TECHS", () => {
    for (const asset of getAllFactionAssets()) {
      if (asset.requiredTech) {
        expect(knownTechIds.has(asset.requiredTech)).toBe(true);
      }
    }
  });

  it("assigns valid tiers and costs to each asset", () => {
    for (const asset of getAllFactionAssets()) {
      expect([1, 2, 3]).toContain(asset.tier);
      expect(asset.cost).toBeGreaterThan(0);
      expect(asset.name).toBeTruthy();
      expect(asset.description).toBeTruthy();
    }
  });

  it("looks up assets by ID and track correctly", () => {
    const tradeDepot = getFactionAsset("trade_depot");
    expect(tradeDepot).toBeDefined();
    expect(tradeDepot?.track).toBe("commercial");
    expect(tradeDepot?.tier).toBe(1);

    const commercialAssets = getFactionAssetsByTrack("commercial");
    expect(commercialAssets.length).toBeGreaterThanOrEqual(3);
    expect(commercialAssets.map(a => a.id)).toContain("grand_exchange");
  });
});

describe("computeFactionScale", () => {
  it("defaults to burg scale for an isolated or small faction", () => {
    const scale = computeFactionScale({
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: [] },
      outposts: [],
      researchedTechs: []
    });
    expect(scale).toBe("burg");
  });

  it("promotes to province scale with >= 2 outposts, >= 2 assets, >= 2 techs", () => {
    const scale = computeFactionScale(
      {
        hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: ["trade_depot"] },
        outposts: [
          { burgId: 2, cell: 2, tier: 1, influence: 50, secrecy: 0, assets: ["counting_house"], establishedYear: 100 },
          { burgId: 3, cell: 3, tier: 1, influence: 50, secrecy: 0, assets: [], establishedYear: 100 }
        ],
        researchedTechs: ["pottery", "currency"]
      },
      undefined,
      getFactionAsset
    );
    expect(scale).toBe("province");
  });

  it("promotes to state scale with >= 3 outposts, >= 5 assets (with >= 1 T2), >= 5 techs", () => {
    const scale = computeFactionScale(
      {
        hq: { cell: 1, burgId: 1, fortified: true, secrecy: 0, assets: ["trade_depot", "counting_house"] },
        outposts: [
          { burgId: 2, cell: 2, tier: 1, influence: 50, secrecy: 0, assets: ["trade_depot"], establishedYear: 100 },
          { burgId: 3, cell: 3, tier: 1, influence: 50, secrecy: 0, assets: ["chapter_lodge"], establishedYear: 100 },
          { burgId: 4, cell: 4, tier: 1, influence: 50, secrecy: 0, assets: ["wayside_shrine"], establishedYear: 100 }
        ],
        researchedTechs: ["pottery", "currency", "sailing", "writing", "masonry"]
      },
      undefined,
      getFactionAsset
    );
    expect(scale).toBe("state");
  });

  it("promotes to world scale when spanning >= 2 states, >= 7 outposts, >= 10 assets (with T3), >= 10 techs", () => {
    const mockBurgs: Record<number, { state: number }> = {
      1: { state: 1 },
      2: { state: 1 },
      3: { state: 1 },
      4: { state: 1 },
      5: { state: 2 },
      6: { state: 2 },
      7: { state: 2 },
      8: { state: 2 }
    };

    const outposts = [2, 3, 4, 5, 6, 7, 8].map(id => ({
      burgId: id,
      cell: id,
      tier: 1 as const,
      influence: 60,
      secrecy: 0,
      assets: ["trade_depot"],
      establishedYear: 100
    }));

    const scale = computeFactionScale(
      {
        hq: {
          cell: 1,
          burgId: 1,
          fortified: true,
          secrecy: 0,
          assets: ["trade_depot", "counting_house", "grand_exchange"]
        },
        outposts,
        researchedTechs: [
          "pottery",
          "currency",
          "sailing",
          "writing",
          "masonry",
          "banking",
          "education",
          "guilds",
          "civil_service",
          "philosophy"
        ]
      },
      { burgs: mockBurgs, provinces: [] },
      getFactionAsset
    );
    expect(scale).toBe("world");
  });

  it("dynamically contracts scale when outposts are lost", () => {
    const mockBurgs: Record<number, { state: number }> = {
      1: { state: 1 },
      2: { state: 2 }
    };

    // Had outposts previously, but reduced down to 1 outpost
    const scale = computeFactionScale(
      {
        hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: ["grand_exchange"] },
        outposts: [{ burgId: 2, cell: 2, tier: 1, influence: 50, secrecy: 0, assets: [], establishedYear: 100 }],
        researchedTechs: ["pottery", "currency", "banking"]
      },
      { burgs: mockBurgs, provinces: [] },
      getFactionAsset
    );
    expect(scale).toBe("burg");
  });
});
