import { describe, expect, it } from "vitest";
import { FACTION_ASSETS_CATALOG } from "@/data/faction-assets";
import { LAIR_CATALOG } from "@/data/living-lairs";
import { getTroubleFactionType, ORGANIZATIONAL_TROUBLE_IDS, TROUBLE_CATALOG } from "@/data/living-troubles";
import {
  EPIC_FACTION_IDS,
  FACTIONS_CATALOG,
  getAllFactionArchetypes,
  getArchetypesByCategory,
  getFactionArchetype,
  resolveFactionArchetypeType
} from "./factions-catalog";

describe("FACTIONS_CATALOG", () => {
  const knownAssetIds = new Set(Object.keys(FACTION_ASSETS_CATALOG));

  it("contains strictly the 10 curated epic archetypes across all 6 categories", () => {
    const archetypes = getAllFactionArchetypes();
    expect(archetypes).toHaveLength(10);
    expect(Object.keys(FACTIONS_CATALOG)).toEqual(EPIC_FACTION_IDS);

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

  it("resolves all 20 legacy lairs to one of the 10 epic archetypes", () => {
    const lairKeys = Object.keys(LAIR_CATALOG);
    expect(lairKeys.length).toBe(20);

    for (const lairKey of lairKeys) {
      const canonical = resolveFactionArchetypeType(lairKey);
      expect(FACTIONS_CATALOG[canonical], `${lairKey} -> ${canonical}`).toBeDefined();
      const factionArch = getFactionArchetype(lairKey);
      expect(factionArch).toBeDefined();
      expect(factionArch?.markerIcon).toBeTruthy();
    }
  });

  it("resolves every retired organizational trouble to an epic faction archetype", () => {
    expect(ORGANIZATIONAL_TROUBLE_IDS.length).toBe(18);
    for (const troubleId of ORGANIZATIONAL_TROUBLE_IDS) {
      expect(TROUBLE_CATALOG[troubleId]).toBeUndefined();
      const arch = getFactionArchetype(getTroubleFactionType(troubleId));
      expect(arch, troubleId).toBeDefined();
      expect(FACTIONS_CATALOG[arch!.type]).toBeDefined();
    }
    expect(Object.keys(TROUBLE_CATALOG)).toHaveLength(28);
  });

  it("looks up archetypes by type and category", () => {
    const guild = getFactionArchetype("adventurer_guild");
    expect(guild).toBeDefined();
    expect(guild?.category).toBe("adventuring");
    expect(guild?.defaultAlignment).toBe("good");

    const commercial = getArchetypesByCategory("commercial");
    expect(commercial).toHaveLength(1);
    expect(commercial[0].type).toBe("merchant_consortium");
  });
});
