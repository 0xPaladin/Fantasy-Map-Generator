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
    yields: { gold: 3, influence: 1 },
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
    yields: { gold: 6, science: 1, influence: 2 },
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
    yields: { gold: 12, science: 2, influence: 4 },
    burgImpact: { gold: 4, prod: 1 }
  },
  chapter_lodge: {
    id: "chapter_lodge",
    name: "Chapter Lodge",
    track: "adventuring",
    tier: 1,
    cost: 40,
    location: "any",
    description: "Meeting hall and posting board for wandering heroes and scouts.",
    yields: { gold: 2, science: 1, influence: 2 },
    burgImpact: { order: 2 }
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
    yields: { science: 3, influence: 3 },
    burgImpact: { science: 2 }
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
    yields: { science: 6, influence: 6 },
    burgImpact: { science: 4, order: 4 }
  },
  safe_house: {
    id: "safe_house",
    name: "Safe House",
    track: "underworld",
    tier: 1,
    cost: 35,
    location: "burg",
    description: "Concealed cellar and bolt-hole for covert operators and contraband.",
    yields: { gold: 3, secrecy: 15 },
    burgImpact: { gold: -1, order: -1 }
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
    yields: { gold: 6, science: 1, secrecy: 25 },
    burgImpact: { gold: -2, order: -2, unrest: 1 }
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
    yields: { gold: 10, science: 3, influence: 4 },
    burgImpact: { order: -4, unrest: 2 }
  },
  wayside_shrine: {
    id: "wayside_shrine",
    name: "Wayside Shrine",
    track: "religious",
    tier: 1,
    cost: 30,
    location: "any",
    description: "Consecrated sanctuary offering shelter and receiving pious tithes.",
    yields: { gold: 2, influence: 2 },
    burgImpact: { order: 2 }
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
    yields: { science: 4, influence: 3 },
    burgImpact: { science: 2 }
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
    yields: { gold: 4, science: 4, influence: 5 },
    burgImpact: { unrest: 1 }
  },
  informant_ring: {
    id: "informant_ring",
    name: "Informant Ring",
    track: "political",
    tier: 1,
    cost: 45,
    location: "burg",
    description: "Loose web of tavern whispers, palace servants, and courier intercepts.",
    yields: { influence: 2, science: 1, secrecy: 15 },
    burgImpact: { order: 1 }
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
    yields: { science: 3, influence: 5 },
    burgImpact: { order: 2 }
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
    yields: { gold: 6, science: 4, influence: 6, militaryCap: 1 },
    burgImpact: { order: 3 }
  },
  muster_camp: {
    id: "muster_camp",
    name: "Muster Camp",
    track: "martial",
    tier: 1,
    cost: 50,
    location: "any",
    description: "Fortified drill grounds training foot soldiers and housing mercenary recruits.",
    yields: { gold: 2, militaryCap: 1 },
    burgImpact: { order: 1 }
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
    yields: { gold: 2, science: 2 },
    burgImpact: { prod: 2 }
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
    yields: { gold: 4, science: 3, militaryCap: 2 },
    burgImpact: { order: 4 }
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
    yields: { science: 5, gold: 2 },
    burgImpact: { science: 2 }
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
    yields: { gold: 5, science: 2 },
    burgImpact: { prod: 2 }
  }
};

export function getFactionAsset(id: string): FactionAssetDef | undefined {
  return FACTION_ASSETS_CATALOG[id];
}

export function getAllFactionAssets(): FactionAssetDef[] {
  return Object.values(FACTION_ASSETS_CATALOG);
}

export function getFactionAssetsByTrack(track: FactionAssetDef["track"]): FactionAssetDef[] {
  return Object.values(FACTION_ASSETS_CATALOG).filter(a => a.track === track);
}
