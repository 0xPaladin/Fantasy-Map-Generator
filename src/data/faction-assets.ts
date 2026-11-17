import { CIV_BUILDING_BY_ID } from "@/data/living-civ-buildings";
import type { FactionAssetDef } from "@/types/factions";

export const FACTION_ASSETS_CATALOG: Record<string, FactionAssetDef> = {
  trade_depot: {
    id: "trade_depot",
    name: "Trade Depot",
    track: "commercial",
    tier: 1,
    cost: 50,
    requiredTech: "pottery",
    location: "any",
    description: "Warehousing and caravansary coordinating local and regional exchange.",
    yields: { influence: 1 },
    burgImpact: { gold: 1 }
  },
  counting_house: {
    id: "counting_house",
    name: "Counting House",
    track: "commercial",
    tier: 2,
    cost: 120,
    requiredTech: "currency",
    location: "burg",
    description: "Financial hub handling credit, coin exchange, and commercial loans.",
    yields: { influence: 2 },
    burgImpact: { gold: 2 }
  },
  grand_exchange: {
    id: "grand_exchange",
    name: "Grand Exchange",
    track: "commercial",
    tier: 3,
    cost: 300,
    requiredTech: "banking",
    location: "burg",
    description: "Continental trading floor driving international commodity monopolies.",
    yields: { influence: 4, development: 1 },
    burgImpact: { gold: 4 }
  },
  chapter_lodge: {
    id: "chapter_lodge",
    name: "Chapter Lodge",
    track: "adventuring",
    tier: 1,
    cost: 40,
    location: "any",
    description: "Meeting hall and posting board for wandering heroes and scouts.",
    yields: { influence: 2 },
    burgImpact: { stability: 2 }
  },
  seeker_archives: {
    id: "seeker_archives",
    name: "Seeker Archives",
    track: "adventuring",
    tier: 2,
    cost: 100,
    requiredTech: "writing",
    location: "any",
    description: "Repository of ancient cartography, relic histories, and monster lore.",
    yields: { influence: 3, development: 2 },
    burgImpact: { stability: 1 }
  },
  grand_conclave: {
    id: "grand_conclave",
    name: "Grand Conclave",
    track: "adventuring",
    tier: 3,
    cost: 250,
    requiredTech: "education",
    location: "hq_only",
    description: "Sovereign hall uniting legendary guilds and artifact researchers.",
    yields: { influence: 6, development: 4 },
    burgImpact: { stability: 4 }
  },
  safe_house: {
    id: "safe_house",
    name: "Safe House",
    track: "underworld",
    tier: 1,
    cost: 35,
    location: "burg",
    description: "Concealed cellar and bolt-hole for covert operators and contraband.",
    yields: { secrecy: 15 },
    burgImpact: { gold: -1, stability: -1 }
  },
  smuggler_tunnel: {
    id: "smuggler_tunnel",
    name: "Smuggler Warren",
    track: "underworld",
    tier: 2,
    cost: 90,
    requiredTech: "masonry",
    location: "any",
    description: "Subterranean canal network bypassing city walls and state customs gates.",
    yields: { secrecy: 25 },
    burgImpact: { gold: -2, stability: -3 }
  },
  shadow_court: {
    id: "shadow_court",
    name: "Shadow Court",
    track: "underworld",
    tier: 3,
    cost: 220,
    requiredTech: "guilds",
    location: "hq_only",
    description: "Clandestine underworld senate orchestrating black markets and contract hits.",
    yields: { influence: 4, secrecy: 10 },
    burgImpact: { stability: -6 }
  },
  wayside_shrine: {
    id: "wayside_shrine",
    name: "Wayside Shrine",
    track: "religious",
    tier: 1,
    cost: 30,
    location: "any",
    description: "Consecrated sanctuary offering shelter and receiving pious tithes.",
    yields: { influence: 2 },
    burgImpact: { stability: 2 }
  },
  monastic_scriptorium: {
    id: "monastic_scriptorium",
    name: "Scriptorium",
    track: "religious",
    tier: 2,
    cost: 80,
    requiredTech: "philosophy",
    location: "any",
    description: "Scholarly cloister illuminating sacred manuscripts and compiling historical annals.",
    yields: { influence: 3, development: 2 },
    burgImpact: { stability: 1 }
  },
  ritual_sanctum: {
    id: "ritual_sanctum",
    name: "Ritual Sanctum",
    track: "religious",
    tier: 3,
    cost: 200,
    requiredTech: "theology",
    location: "any",
    description: "Grand sanctum radiating divine zeal, mystical rites, or forbidden sorceries.",
    yields: { influence: 5, militaryCap: 1 },
    burgImpact: { stability: -2 }
  },
  informant_ring: {
    id: "informant_ring",
    name: "Informant Ring",
    track: "political",
    tier: 1,
    cost: 45,
    location: "burg",
    description: "Loose web of tavern whispers, palace servants, and courier intercepts.",
    yields: { influence: 2, secrecy: 15 },
    burgImpact: { stability: 1 }
  },
  printing_cell: {
    id: "printing_cell",
    name: "Pamphlet Press",
    track: "political",
    tier: 2,
    cost: 110,
    requiredTech: "machinery",
    location: "burg",
    description: "Movable-type workshop printing doctrine, royal edicts, or subversive manifestos.",
    yields: { influence: 5, development: 2 },
    burgImpact: { stability: 2 }
  },
  shadow_directorate: {
    id: "shadow_directorate",
    name: "Directorate HQ",
    track: "political",
    tier: 3,
    cost: 260,
    requiredTech: "civil_service",
    location: "hq_only",
    description: "Administrative intelligence center coordinating diplomatic intrigue and state coups.",
    yields: { influence: 6, militaryCap: 1 },
    burgImpact: { stability: 3 }
  },
  muster_camp: {
    id: "muster_camp",
    name: "Muster Camp",
    track: "martial",
    tier: 1,
    cost: 50,
    location: "any",
    description: "Fortified drill grounds training foot soldiers and housing mercenary recruits.",
    yields: { militaryCap: 1 },
    burgImpact: { stability: 1 }
  },
  armory_forge: {
    id: "armory_forge",
    name: "Armory & Forge",
    track: "martial",
    tier: 2,
    cost: 120,
    requiredTech: "iron_working",
    location: "any",
    description: "Blacksmith forge manufacturing arms, heavy armor, and siege gear.",
    yields: { militaryCap: 1, development: 1 },
    burgImpact: { gold: 2 }
  },
  war_citadel: {
    id: "war_citadel",
    name: "War Citadel",
    track: "martial",
    tier: 3,
    cost: 300,
    requiredTech: "chivalry",
    location: "hq_only",
    description: "High stone fortress anchoring heavy garrisons, war councils, and siege engines.",
    yields: { militaryCap: 2 },
    burgImpact: { stability: 4 }
  },
  alchemical_lab: {
    id: "alchemical_lab",
    name: "Alchemical Lab",
    track: "scholarly",
    tier: 2,
    cost: 130,
    requiredTech: "chemistry",
    location: "any",
    description: "Laboratory refining explosive reagents, healing draughts, and transmutations.",
    yields: { influence: 2, development: 3 },
    burgImpact: { gold: 1 }
  },
  subterranean_delve: {
    id: "subterranean_delve",
    name: "Deep Delve",
    track: "wilder",
    tier: 2,
    cost: 100,
    requiredTech: "mining",
    location: "wilderness",
    description: "Excavated mine tapping deep ore veins and subterranean fortifications.",
    yields: { gold: 3, development: 2 }
  }
};

export function getFactionAsset(id: string): FactionAssetDef | undefined {
  if (FACTION_ASSETS_CATALOG[id]) return FACTION_ASSETS_CATALOG[id];
  const civ = CIV_BUILDING_BY_ID[id];
  if (!civ) return undefined;
  const cost = civ.cost ?? 60;
  const tier: 1 | 2 | 3 = civ.factionTier ?? (cost >= 200 ? 3 : cost >= 100 ? 2 : 1);
  return {
    id: civ.id,
    name: civ.name,
    track: civ.factionCategory ?? "commercial",
    tier,
    cost,
    requiredTech: civ.requiredTech,
    location: civ.factionLocation ?? "any",
    description: civ.name,
    yields: {
      influence: civ.stats.culture
    }
  };
}

export function getAllFactionAssets(): FactionAssetDef[] {
  return Object.values(FACTION_ASSETS_CATALOG);
}

export function getFactionAssetsByTrack(track: FactionAssetDef["track"]): FactionAssetDef[] {
  return Object.values(FACTION_ASSETS_CATALOG).filter(a => a.track === track);
}
