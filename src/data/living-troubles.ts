import type { TroublePool, TroubleSaveKind, TroubleUnitRole } from "@/types/living";

export interface TroubleDef {
  id: string;
  name: string;
  pool: TroublePool;
  save: TroubleSaveKind;
  requiredRole: TroubleUnitRole;
  description: string;
}

export const UNIT_ROLE_POOLS: Record<TroubleUnitRole, TroublePool> = {
  guardsmen: "m",
  military: "m",
  merchant: "w",
  sage: "w",
  prophet: "s",
  magistrate: "s"
};

export const UNIT_ROLE_LABELS: Record<TroubleUnitRole, string> = {
  guardsmen: "Guardsmen",
  military: "Military Unit",
  merchant: "Merchant",
  sage: "Sage",
  prophet: "Prophet",
  magistrate: "Magistrate"
};

export const SAVE_KIND_LABELS: Record<TroubleSaveKind, string> = {
  disorder: "Disorder",
  uprising: "Uprising",
  poverty: "Poverty",
  ignorance: "Ignorance",
  despair: "Despair",
  corruption: "Corruption"
};

export const TROUBLE_CATALOG: Record<string, TroubleDef> = {
  ancient_curse: {
    id: "ancient_curse",
    name: "Ancient Curse",
    pool: "w",
    save: "ignorance",
    requiredRole: "sage",
    description: "A lingering sorcerous blight poisons luck, crops, and labor across the area."
  },
  leyline_blight: {
    id: "leyline_blight",
    name: "Leyline Blight",
    pool: "w",
    save: "ignorance",
    requiredRole: "sage",
    description: "Crossed geomantic currents bring inexplicable misfortune, strange rot, and sudden fever."
  },
  barren_surroundings: {
    id: "barren_surroundings",
    name: "Barren Surroundings",
    pool: "w",
    save: "poverty",
    requiredRole: "merchant",
    description: "Rocky, arid, infertile soil forces locals into a desperate struggle for bare survival."
  },
  contaminated_land: {
    id: "contaminated_land",
    name: "Contaminated Land",
    pool: "w",
    save: "poverty",
    requiredRole: "merchant",
    description: "Poisoned soil, saline runoffs, or toxic springs leave the population sick and crops sparse."
  },
  crushed_spirits: {
    id: "crushed_spirits",
    name: "Crushed Spirits",
    pool: "s",
    save: "despair",
    requiredRole: "prophet",
    description: "Endless privation and oppression have stamped out all hope, initiative, and morale."
  },
  destructive_customs: {
    id: "destructive_customs",
    name: "Destructive Customs",
    pool: "w",
    save: "ignorance",
    requiredRole: "sage",
    description: "Entrenched ruinous traditions and superstitious taboos waste labor and cripple commerce."
  },
  exceptional_poverty: {
    id: "exceptional_poverty",
    name: "Exceptional Poverty",
    pool: "w",
    save: "poverty",
    requiredRole: "merchant",
    description: "Crippling destitution and worn-out tools leave the region unable to provide for its basic needs."
  },
  failed_settlement: {
    id: "failed_settlement",
    name: "Failed Settlement",
    pool: "w",
    save: "poverty",
    requiredRole: "merchant",
    description: "An abandoned ghost town needs seed capital, basic tools, and resettlement logistics."
  },
  flooding: {
    id: "flooding",
    name: "Seasonal Flooding",
    pool: "w",
    save: "poverty",
    requiredRole: "merchant",
    description: "Uncontrolled river surges and torrents repeatedly destroy earthworks and drown arable fields."
  },
  harsh_conditions: {
    id: "harsh_conditions",
    name: "Harsh Conditions",
    pool: "w",
    save: "poverty",
    requiredRole: "merchant",
    description: "Ferocious weather, mountain slides, or toxic marsh fogs render daily labor punishingly grim."
  },
  hazardous_resource: {
    id: "hazardous_resource",
    name: "Hazardous Extraction",
    pool: "w",
    save: "ignorance",
    requiredRole: "sage",
    description:
      "Unstable deep tunnels, noxious vapors, or volatile minerals kill harvesters without specialized engineering."
  },
  inaccessible: {
    id: "inaccessible",
    name: "Inaccessible Terrain",
    pool: "w",
    save: "poverty",
    requiredRole: "merchant",
    description: "Treacherous cliffs, trackless mires, or lack of graded routes cut the region off from outside trade."
  },
  no_workers: {
    id: "no_workers",
    name: "Labor Shortage",
    pool: "w",
    save: "poverty",
    requiredRole: "merchant",
    description: "Rich timber, ores, or fields sit idle for total lack of a willing or able workforce."
  },
  pervasive_hunger: {
    id: "pervasive_hunger",
    name: "Pervasive Hunger",
    pool: "w",
    save: "poverty",
    requiredRole: "merchant",
    description: "Chronic malnutrition and barren harvests leave the populace emaciated and weary."
  },
  recurrent_sickness: {
    id: "recurrent_sickness",
    name: "Recurrent Sickness",
    pool: "w",
    save: "ignorance",
    requiredRole: "sage",
    description:
      "Plague vapors, bad water, or foul miasmas periodically afflict the populace with fever and pestilence."
  },
  severe_damage: {
    id: "severe_damage",
    name: "Severe Ruination",
    pool: "w",
    save: "poverty",
    requiredRole: "merchant",
    description:
      "Tumbled arches, burnt foundations, and flooded delvings block all access until cleared by heavy engineering."
  },
  taboo_land: {
    id: "taboo_land",
    name: "Taboo Land",
    pool: "w",
    save: "ignorance",
    requiredRole: "sage",
    description: "Dread prophecies and religious bans terrify laborers, who refuse to set foot on the accursed ground."
  },
  toxic_process: {
    id: "toxic_process",
    name: "Toxic Process",
    pool: "w",
    save: "ignorance",
    requiredRole: "sage",
    description: "Smelting fumes or caustic alchemy poison the workers and foul the downstream waters."
  },
  undeveloped: {
    id: "undeveloped",
    name: "Undeveloped Hinterland",
    pool: "w",
    save: "poverty",
    requiredRole: "merchant",
    description: "A remote site lacks mills, carts, docks, and basic infrastructure to harvest its natural bounty."
  },
  wasted_production: {
    id: "wasted_production",
    name: "Wasted Production",
    pool: "w",
    save: "ignorance",
    requiredRole: "sage",
    description: "Pests, improper storage, or superstitious destruction waste the vast majority of extracted goods."
  },
  bad_reputation: {
    id: "bad_reputation",
    name: "Bad Reputation",
    pool: "s",
    save: "corruption",
    requiredRole: "magistrate",
    description: "A notoriety for thievery, bad faith, and rapacious officials strangles legitimate trade."
  },
  class_hatred: {
    id: "class_hatred",
    name: "Class Hatred",
    pool: "s",
    save: "despair",
    requiredRole: "prophet",
    description: "Bitter hatred between social orders paralyzes civic life with savage score-settling."
  },
  covetous_polity: {
    id: "covetous_polity",
    name: "Covetous Neighbors",
    pool: "m",
    save: "disorder",
    requiredRole: "guardsmen",
    description: "Aggressive neighboring reavers and border poachers continually plunder the site."
  },
  disputed_possession: {
    id: "disputed_possession",
    name: "Disputed Possession",
    pool: "m",
    save: "uprising",
    requiredRole: "military",
    description: "Rival claimants contest ownership with subsidized bushwhackers and armed raiding parties."
  },
  disunity: {
    id: "disunity",
    name: "Factional Disunity",
    pool: "s",
    save: "despair",
    requiredRole: "prophet",
    description: "Suspicious rival clans and splinter factions refuse to cooperate, sabotaging civic progress."
  },
  cultural_feuding: {
    id: "cultural_feuding",
    name: "Cultural Feuding",
    pool: "s",
    save: "despair",
    requiredRole: "prophet",
    description: "Ancient ethnic blood-feuds erupt in cycles of revenge, boycott, and localized riots."
  },
  mercenary_populace: {
    id: "mercenary_populace",
    name: "Mercenary Populace",
    pool: "s",
    save: "corruption",
    requiredRole: "magistrate",
    description: "Locals flout oaths and agreements the moment a richer bribe or treacherous turncoat offer appears."
  },
  xenophobia: {
    id: "xenophobia",
    name: "Insular Xenophobia",
    pool: "m",
    save: "disorder",
    requiredRole: "guardsmen",
    description: "Fierce hostility toward outsiders drives off foreign merchants and violently rejects outside rule."
  }
};

/** Retired organizational trouble IDs and the dangerous-faction archetype each becomes. */
export const ORGANIZATIONAL_TROUBLE_IDS: readonly string[] = [
  "angry_dead",
  "conquering_heirs",
  "corrupt_leadership",
  "dark_wizards",
  "demagogue",
  "exiled_lord",
  "brigand_raiders",
  "monsters",
  "murderous_heirs",
  "recalcitrant_locals",
  "relic_golems",
  "riotous_thugs",
  "secret_society",
  "outland_raiders",
  "sinister_cult",
  "things_from_below",
  "doomsday_cult",
  "blight_spawn"
];

/** Trouble ID -> faction archetype (identity except two aliases). */
export const TROUBLE_TO_FACTION: Record<string, string> = {
  angry_dead: "angry_dead",
  conquering_heirs: "conquering_heirs",
  corrupt_leadership: "corrupt_leadership",
  dark_wizards: "dark_wizards",
  demagogue: "demagogue",
  exiled_lord: "exiled_lord",
  brigand_raiders: "brigand_raiders",
  monsters: "monster_nest",
  murderous_heirs: "conquering_heirs",
  recalcitrant_locals: "recalcitrant_locals",
  relic_golems: "relic_golems",
  riotous_thugs: "riotous_thugs",
  secret_society: "secret_society",
  outland_raiders: "outland_raiders",
  sinister_cult: "sinister_cult",
  things_from_below: "things_from_below",
  doomsday_cult: "doomsday_cult",
  blight_spawn: "blight_spawn"
};

/** Retired trouble ID -> lair template whose raid/defender units seed the faction's military. */
export const TROUBLE_TO_LAIR: Record<string, string> = {
  angry_dead: "ancient_evil",
  conquering_heirs: "ancient_fort",
  corrupt_leadership: "renegade_outpost",
  dark_wizards: "school_of_dark_sorcery",
  demagogue: "splinter_group",
  exiled_lord: "aspiring_warlord",
  brigand_raiders: "bandit_camp",
  monsters: "monster_nest",
  murderous_heirs: "ancient_fort",
  recalcitrant_locals: "splinter_group",
  relic_golems: "magical_gate",
  riotous_thugs: "bandit_camp",
  secret_society: "thieves_stronghold",
  outland_raiders: "marauder_warcamp",
  sinister_cult: "cult_shrine",
  things_from_below: "cursed_earth",
  doomsday_cult: "demonic_master",
  blight_spawn: "blight_infestation"
};

export function getTroubleFactionType(troubleId: string): string {
  return TROUBLE_TO_FACTION[troubleId] ?? troubleId;
}

/** Dangerous-faction spawn pools by theme (the organizational IDs a spawn can become). */
export const BURG_FACTION_IDS: readonly string[] = [
  "corrupt_leadership",
  "demagogue",
  "exiled_lord",
  "recalcitrant_locals",
  "riotous_thugs",
  "secret_society",
  "sinister_cult"
];

export const RUIN_FACTION_IDS: readonly string[] = [
  "angry_dead",
  "conquering_heirs",
  "dark_wizards",
  "doomsday_cult",
  "monsters",
  "murderous_heirs",
  "relic_golems",
  "things_from_below"
];

export const RESOURCE_FACTION_IDS: readonly string[] = ["blight_spawn", "brigand_raiders", "outland_raiders"];

export const BURG_TROUBLE_IDS: readonly string[] = [
  "contaminated_land",
  "crushed_spirits",
  "destructive_customs",
  "exceptional_poverty",
  "flooding",
  "pervasive_hunger",
  "recurrent_sickness",
  "bad_reputation",
  "class_hatred",
  "disunity",
  "cultural_feuding",
  "mercenary_populace",
  "xenophobia"
];

/** 20-entry table for Ruin / Site troubles */
export const RUIN_TROUBLE_IDS: readonly string[] = [
  "ancient_curse",
  "barren_surroundings",
  "destructive_customs",
  "inaccessible",
  "severe_damage",
  "taboo_land",
  "disputed_possession"
];

/** 20-entry table for Resource / Extraction troubles */
export const RESOURCE_TROUBLE_IDS: readonly string[] = [
  "leyline_blight",
  "contaminated_land",
  "failed_settlement",
  "flooding",
  "harsh_conditions",
  "hazardous_resource",
  "inaccessible",
  "no_workers",
  "recurrent_sickness",
  "taboo_land",
  "toxic_process",
  "undeveloped",
  "wasted_production",
  "covetous_polity"
];

export function getTroubleDef(id: string): TroubleDef {
  return TROUBLE_CATALOG[id] ?? TROUBLE_CATALOG.flooding;
}

/** Returns 1 for exact specialist match, 2 for same-pool mismatch, 3 for wrong-pool mismatch */
export function troubleUnitMatchMultiplier(
  trouble: { pool: TroublePool; requiredRole: TroubleUnitRole },
  unitRole?: TroubleUnitRole
): number {
  if (!unitRole) return 3;
  if (unitRole === trouble.requiredRole) return 1;
  const unitPool = UNIT_ROLE_POOLS[unitRole];
  if (unitPool === trouble.pool) return 2;
  return 3;
}
