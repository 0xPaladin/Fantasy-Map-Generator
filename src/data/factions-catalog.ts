import type { FactionArchetypeDef, FactionCategory } from "@/types/factions";

/** Curated roster of the 10 epic Living World faction archetypes. */
export const FACTIONS_CATALOG: Record<string, FactionArchetypeDef> = {
  merchant_consortium: {
    type: "merchant_consortium",
    name: "Grand Merchant Consortium",
    category: "commercial",
    defaultAllegiance: "chartered",
    defaultExpansionScope: "global",
    defaultAlignment: "lawful",
    sovereignAmbition: false,
    stateForm: "Plutocracy",
    markerIcon: "💰",
    description: "Continental mercantile syndicate dominating trade lanes, chartered ports, and banking.",
    desiredAssets: ["trade_depot", "counting_house", "grand_exchange"],
    desiredTechs: ["currency", "banking", "sailing", "economics"],
    defaultValues: ["greed", "order"]
  },
  adventurer_guild: {
    type: "adventurer_guild",
    name: "Adventurers' Conclave",
    category: "adventuring",
    defaultAllegiance: "autonomous",
    defaultExpansionScope: "global",
    defaultAlignment: "good",
    sovereignAmbition: false,
    stateForm: "Heroic League",
    markerIcon: "⚔️",
    description: "Realm-spanning brotherhood of free blades, relic seekers, and monster hunters.",
    desiredAssets: ["chapter_lodge", "seeker_archives", "grand_conclave"],
    desiredTechs: ["iron_working", "writing", "education"],
    defaultValues: ["valor", "honor"]
  },
  arcane_college: {
    type: "arcane_college",
    name: "Arcane Conclave",
    category: "adventuring",
    defaultAllegiance: "chartered",
    defaultExpansionScope: "state",
    defaultAlignment: "neutral",
    sovereignAmbition: false,
    stateForm: "Magocracy",
    markerIcon: "📜",
    description: "Sanctum of wizards, astrologers, and alchemists charting astral and arcane phenomena.",
    desiredAssets: ["seeker_archives", "alchemical_lab", "grand_conclave"],
    desiredTechs: ["writing", "philosophy", "education", "scientific_theory"],
    defaultValues: ["knowledge", "mysticism"]
  },
  ranger_wardens: {
    type: "ranger_wardens",
    name: "Frontier Warden Order",
    category: "adventuring",
    defaultAllegiance: "autonomous",
    defaultExpansionScope: "culture",
    defaultAlignment: "good",
    sovereignAmbition: false,
    stateForm: "Warden Protectorate",
    markerIcon: "🏹",
    description: "Bound order of border rangers, scouts, and wardens guarding wild marches.",
    desiredAssets: ["chapter_lodge", "wayside_shrine"],
    desiredTechs: ["archery", "animal_husbandry", "writing"],
    defaultValues: ["nature", "vigilance"]
  },
  holy_order: {
    type: "holy_order",
    name: "Crusader Knightly Order",
    category: "religious",
    defaultAllegiance: "chartered",
    defaultExpansionScope: "religion",
    defaultAlignment: "lawful",
    sovereignAmbition: true,
    stateForm: "Theocracy",
    stateRosterId: "knightsRoster",
    markerIcon: "🛡️",
    description: "Militant templars and paladins waging pious crusades and defending sacred shrines.",
    desiredAssets: ["wayside_shrine", "muster_camp", "war_citadel"],
    desiredTechs: ["chivalry", "iron_working", "theology"],
    defaultValues: ["faith", "valor"]
  },
  heretical_cult: {
    type: "heretical_cult",
    name: "Apocalyptic Cult",
    category: "religious",
    defaultAllegiance: "clandestine",
    defaultExpansionScope: "culture",
    defaultAlignment: "evil",
    sovereignAmbition: true,
    stateForm: "Unholy Covenant",
    stateRosterId: "darkCultBase",
    raidThreshold: 5,
    markerIcon: "🕯️",
    description: "Secretive fanatics spreading forbidden prophecy, subversion, and end-times zealotry.",
    desiredAssets: ["safe_house", "wayside_shrine", "ritual_sanctum"],
    desiredTechs: ["theology", "philosophy"],
    defaultValues: ["zeal", "secrecy"]
  },
  shadow_syndicate: {
    type: "shadow_syndicate",
    name: "Shadow Brotherhood",
    category: "underworld",
    defaultAllegiance: "clandestine",
    defaultExpansionScope: "state",
    defaultAlignment: "chaotic",
    sovereignAmbition: false,
    stateForm: "Shadow Enclave",
    markerIcon: "🗡️",
    description: "Interlocking syndicate of smugglers, thieves, and veiled assassins subverting cities.",
    desiredAssets: ["safe_house", "smuggler_tunnel", "shadow_court"],
    desiredTechs: ["masonry", "optics", "guilds"],
    defaultValues: ["greed", "subterfuge"]
  },
  noble_league: {
    type: "noble_league",
    name: "Claimant Confederacy",
    category: "political",
    defaultAllegiance: "autonomous",
    defaultExpansionScope: "state",
    defaultAlignment: "lawful",
    sovereignAmbition: true,
    stateForm: "Confederated Duchy",
    markerIcon: "👑",
    description: "Dynastic league of disaffected lords, pretenders, and powerbrokers vying for the crown.",
    desiredAssets: ["informant_ring", "printing_cell", "shadow_directorate"],
    desiredTechs: ["chivalry", "civil_service"],
    defaultValues: ["lineage", "ambition"]
  },
  mercenary_company: {
    type: "mercenary_company",
    name: "Iron Free Company",
    category: "martial",
    defaultAllegiance: "autonomous",
    defaultExpansionScope: "global",
    defaultAlignment: "neutral",
    sovereignAmbition: true,
    stateForm: "Military Junta",
    stateRosterId: "freeGuildsRoster",
    markerIcon: "⚔️",
    description: "Hardened free company of pikemen and heavy horse selling war to any sovereign patron.",
    desiredAssets: ["muster_camp", "armory_forge", "war_citadel"],
    desiredTechs: ["iron_working", "chivalry", "steel"],
    defaultValues: ["valor", "wealth"]
  },
  dread_host: {
    type: "dread_host",
    name: "Dread Sovereign Host",
    category: "martial",
    defaultAllegiance: "hostile",
    defaultExpansionScope: "province",
    defaultAlignment: "evil",
    sovereignAmbition: true,
    stateForm: "Dread Dominion",
    stateRosterId: "warlordsBase",
    raidThreshold: 4,
    markerIcon: "💀",
    description: "Hostile warhost, cursed legions, and marauder chieftains carving empires out of ruin.",
    desiredAssets: ["muster_camp", "armory_forge", "war_citadel"],
    desiredTechs: ["iron_working", "chivalry"],
    defaultValues: ["conquest", "might"]
  }
};

export const EPIC_FACTION_IDS: readonly string[] = Object.keys(FACTIONS_CATALOG);

/** Legacy petty, lair, and retired-trouble type aliases mapped to the 10 epic archetypes. */
export const LEGACY_FACTION_ALIASES: Record<string, string> = {
  trade_guild: "merchant_consortium",
  banking_house: "merchant_consortium",
  smuggler_syndicate: "shadow_syndicate",
  explorer_society: "adventurer_guild",
  bardic_college: "adventurer_guild",
  ranger_corps: "ranger_wardens",
  druidic_circle: "ranger_wardens",
  thieves_guild: "shadow_syndicate",
  assassin_creed: "shadow_syndicate",
  black_market: "shadow_syndicate",
  thieves_stronghold: "shadow_syndicate",
  secret_society: "shadow_syndicate",
  corrupt_leadership: "shadow_syndicate",
  monastic_order: "holy_order",
  inquisition_cadre: "holy_order",
  temple_sect: "holy_order",
  dark_cabal: "heretical_cult",
  heretical_sect: "heretical_cult",
  corrupt_monastery: "heretical_cult",
  cult_shrine: "heretical_cult",
  demonic_master: "heretical_cult",
  malevolent_creed: "heretical_cult",
  school_of_dark_sorcery: "heretical_cult",
  mad_wizard: "heretical_cult",
  sinister_cult: "heretical_cult",
  doomsday_cult: "heretical_cult",
  dark_wizards: "heretical_cult",
  noble_house: "noble_league",
  magistrate_cadre: "noble_league",
  diplomatic_corps: "noble_league",
  royal_chancery: "noble_league",
  exiled_claimant: "noble_league",
  rebel_front: "noble_league",
  demagogue: "noble_league",
  recalcitrant_locals: "noble_league",
  splinter_group: "noble_league",
  exiled_lord: "noble_league",
  conquering_heirs: "noble_league",
  murderous_heirs: "noble_league",
  knight_chivalry: "mercenary_company",
  frontier_legion: "mercenary_company",
  iron_legion: "mercenary_company",
  gladiator_ring: "mercenary_company",
  ancient_evil: "dread_host",
  ancient_fort: "dread_host",
  aspiring_warlord: "dread_host",
  bandit_camp: "dread_host",
  cursed_earth: "dread_host",
  dwarven_outcasts: "dread_host",
  magical_gate: "dread_host",
  monster_nest: "dread_host",
  renegade_outpost: "dread_host",
  marauder_warcamp: "dread_host",
  angry_dead: "dread_host",
  brigand_raiders: "dread_host",
  monsters: "dread_host",
  riotous_thugs: "dread_host",
  outland_raiders: "dread_host",
  things_from_below: "dread_host",
  relic_golems: "dread_host",
  vicious_humanoids: "dread_host",
  blight_infestation: "dread_host",
  blight_spawn: "dread_host"
};

export function resolveFactionArchetypeType(type: string): string {
  return FACTIONS_CATALOG[type] ? type : (LEGACY_FACTION_ALIASES[type] ?? type);
}

export function getFactionArchetype(type: string): FactionArchetypeDef | undefined {
  return FACTIONS_CATALOG[resolveFactionArchetypeType(type)];
}

export function getAllFactionArchetypes(): FactionArchetypeDef[] {
  return Object.values(FACTIONS_CATALOG);
}

export function getArchetypesByCategory(category: FactionCategory): FactionArchetypeDef[] {
  return Object.values(FACTIONS_CATALOG).filter(a => a.category === category);
}
