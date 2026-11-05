import { describe, expect, it } from "vitest";
import { CIV_TECHS } from "@/data/living-civ-techs";
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

