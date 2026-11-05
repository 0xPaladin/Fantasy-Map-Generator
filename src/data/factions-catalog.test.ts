import { describe, expect, it } from "vitest";
import { FACTION_ASSETS_CATALOG } from "@/data/faction-assets";
import { CIV_TECHS } from "@/data/living-civ-techs";
import { LAIR_CATALOG } from "@/data/living-lairs";
import { TROUBLE_CATALOG } from "@/data/living-troubles";
import { getAllFactionArchetypes, getArchetypesByCategory, getFactionArchetype } from "./factions-catalog";

describe("FACTIONS_CATALOG", () => {
  const knownAssetIds = new Set(Object.keys(FACTION_ASSETS_CATALOG));
  const knownTechIds = new Set(CIV_TECHS.map(t => t.id));

  it("contains at least 38 archetypes across 6 categories", () => {
    const archetypes = getAllFactionArchetypes();
    expect(archetypes.length).toBeGreaterThanOrEqual(38);

    const categories = new Set(archetypes.map(a => a.category));
    expect(categories.has("commercial")).toBe(true);
    expect(categories.has("adventuring")).toBe(true);
    expect(categories.has("underworld")).toBe(true);
    expect(categories.has("religious")).toBe(true);
    expect(categories.has("political")).toBe(true);
    expect(categories.has("martial")).toBe(true);
  });

  it("ensures all desiredAssets exist in FACTION_ASSETS_CATALOG", () => {
    for (const archetype of getAllFactionArchetypes()) {
      for (const assetId of archetype.desiredAssets) {
        expect(knownAssetIds.has(assetId)).toBe(true);
      }
    }
  });

  it("ensures all desiredTechs exist in CIV_TECHS", () => {
    for (const archetype of getAllFactionArchetypes()) {
      for (const techId of archetype.desiredTechs) {
        expect(knownTechIds.has(techId)).toBe(true);
      }
    }
  });

  it("absorbs all 20 lairs from LAIR_CATALOG", () => {
    const lairKeys = Object.keys(LAIR_CATALOG);
    expect(lairKeys.length).toBe(20);

    for (const lairKey of lairKeys) {
      const factionArch = getFactionArchetype(lairKey);
      expect(factionArch).toBeDefined();
      expect(factionArch?.markerIcon).toBeTruthy();
    }
  });

  it("covers organizational troubles and distinguishes hazards in TROUBLE_CATALOG", () => {
    const hazards = Object.values(TROUBLE_CATALOG).filter(t => t.isHazard);
    expect(hazards.length).toBeGreaterThanOrEqual(18);

    for (const hazard of hazards) {
      expect(hazard.isHazard).toBe(true);
      expect(hazard.attractsFactionTypes?.length).toBeGreaterThan(0);
    }
  });

  it("looks up archetypes by type and category", () => {
    const guild = getFactionArchetype("adventurer_guild");
    expect(guild).toBeDefined();
    expect(guild?.category).toBe("adventuring");
    expect(guild?.defaultAlignment).toBe("good");

    const commercial = getArchetypesByCategory("commercial");
    expect(commercial.length).toBeGreaterThanOrEqual(4);
    expect(commercial.map(c => c.type)).toContain("merchant_consortium");
  });
});
