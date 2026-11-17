export type TroubleCause = "diversity" | "corruption" | "poverty" | "site";

export interface TroubleDef {
  id: string;
  name: string;
  cause: TroubleCause;
  description: string;
}

export const TROUBLE_CATALOG: Record<string, TroubleDef> = {
  ancient_curse: {
    id: "ancient_curse",
    name: "Ancient Curse",
    cause: "site",
    description: "A lingering sorcerous blight poisons luck, crops, and labor across the area."
  },
  leyline_blight: {
    id: "leyline_blight",
    name: "Leyline Blight",
    cause: "site",
    description: "Crossed geomantic currents bring inexplicable misfortune, strange rot, and sudden fever."
  },
  barren_surroundings: {
    id: "barren_surroundings",
    name: "Barren Surroundings",
    cause: "poverty",
    description: "Rocky, arid, infertile soil forces locals into a desperate struggle for bare survival."
  },
  contaminated_land: {
    id: "contaminated_land",
    name: "Contaminated Land",
    cause: "site",
    description: "Poisoned soil, saline runoffs, or toxic springs leave the population sick and crops sparse."
  },
  crushed_spirits: {
    id: "crushed_spirits",
    name: "Crushed Spirits",
    cause: "poverty",
    description: "Endless privation and oppression have stamped out all hope, initiative, and morale."
  },
  destructive_customs: {
    id: "destructive_customs",
    name: "Destructive Customs",
    cause: "diversity",
    description: "Entrenched ruinous traditions and superstitious taboos waste labor and cripple commerce."
  },
  exceptional_poverty: {
    id: "exceptional_poverty",
    name: "Exceptional Poverty",
    cause: "poverty",
    description: "Crippling destitution and worn-out tools leave the region unable to provide for its basic needs."
  },
  failed_settlement: {
    id: "failed_settlement",
    name: "Failed Settlement",
    cause: "poverty",
    description: "An abandoned ghost town needs seed capital, basic tools, and resettlement logistics."
  },
  flooding: {
    id: "flooding",
    name: "Seasonal Flooding",
    cause: "site",
    description: "Uncontrolled river surges and torrents repeatedly destroy earthworks and drown arable fields."
  },
  harsh_conditions: {
    id: "harsh_conditions",
    name: "Harsh Conditions",
    cause: "site",
    description: "Ferocious weather, mountain slides, or toxic marsh fogs render daily labor punishingly grim."
  },
  hazardous_resource: {
    id: "hazardous_resource",
    name: "Hazardous Extraction",
    cause: "site",
    description:
      "Unstable deep tunnels, noxious vapors, or volatile minerals kill harvesters without specialized engineering."
  },
  inaccessible: {
    id: "inaccessible",
    name: "Inaccessible Terrain",
    cause: "site",
    description: "Treacherous cliffs, trackless mires, or lack of graded routes cut the region off from outside trade."
  },
  no_workers: {
    id: "no_workers",
    name: "Labor Shortage",
    cause: "poverty",
    description: "Rich timber, ores, or fields sit idle for total lack of a willing or able workforce."
  },
  pervasive_hunger: {
    id: "pervasive_hunger",
    name: "Pervasive Hunger",
    cause: "poverty",
    description: "Chronic malnutrition and barren harvests leave the populace emaciated and weary."
  },
  recurrent_sickness: {
    id: "recurrent_sickness",
    name: "Recurrent Sickness",
    cause: "site",
    description:
      "Plague vapors, bad water, or foul miasmas periodically afflict the populace with fever and pestilence."
  },
  severe_damage: {
    id: "severe_damage",
    name: "Severe Ruination",
    cause: "site",
    description:
      "Tumbled arches, burnt foundations, and flooded delvings block all access until cleared by heavy engineering."
  },
  taboo_land: {
    id: "taboo_land",
    name: "Taboo Land",
    cause: "site",
    description: "Dread prophecies and religious bans terrify laborers, who refuse to set foot on the accursed ground."
  },
  toxic_process: {
    id: "toxic_process",
    name: "Toxic Process",
    cause: "site",
    description: "Smelting fumes or caustic alchemy poison the workers and foul the downstream waters."
  },
  undeveloped: {
    id: "undeveloped",
    name: "Undeveloped Hinterland",
    cause: "poverty",
    description: "A remote site lacks mills, carts, docks, and basic infrastructure to harvest its natural bounty."
  },
  wasted_production: {
    id: "wasted_production",
    name: "Wasted Production",
    cause: "poverty",
    description: "Pests, improper storage, or superstitious destruction waste the vast majority of extracted goods."
  },
  bad_reputation: {
    id: "bad_reputation",
    name: "Bad Reputation",
    cause: "corruption",
    description: "A notoriety for thievery, bad faith, and rapacious officials strangles legitimate trade."
  },
  class_hatred: {
    id: "class_hatred",
    name: "Class Hatred",
    cause: "diversity",
    description: "Bitter hatred between social orders paralyzes civic life with savage score-settling."
  },
  covetous_polity: {
    id: "covetous_polity",
    name: "Covetous Neighbors",
    cause: "corruption",
    description: "Aggressive neighboring reavers and border poachers continually plunder the site."
  },
  disputed_possession: {
    id: "disputed_possession",
    name: "Disputed Possession",
    cause: "corruption",
    description: "Rival claimants contest ownership with subsidized bushwhackers and armed raiding parties."
  },
  disunity: {
    id: "disunity",
    name: "Factional Disunity",
    cause: "diversity",
    description: "Suspicious rival clans and splinter factions refuse to cooperate, sabotaging civic progress."
  },
  cultural_feuding: {
    id: "cultural_feuding",
    name: "Cultural Feuding",
    cause: "diversity",
    description: "Ancient ethnic blood-feuds erupt in cycles of revenge, boycott, and localized riots."
  },
  mercenary_populace: {
    id: "mercenary_populace",
    name: "Mercenary Populace",
    cause: "corruption",
    description: "Locals flout oaths and agreements the moment a richer bribe or treacherous turncoat offer appears."
  },
  xenophobia: {
    id: "xenophobia",
    name: "Insular Xenophobia",
    cause: "diversity",
    description: "Fierce hostility toward outsiders drives off foreign merchants and violently rejects outside rule."
  }
};

export const TROUBLE_LIST: TroubleDef[] = Object.values(TROUBLE_CATALOG);

export function troublesForCause(cause: TroubleCause): TroubleDef[] {
  return TROUBLE_LIST.filter(t => t.cause === cause);
}

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

export function getTroubleDef(id: string): TroubleDef {
  return TROUBLE_CATALOG[id] ?? TROUBLE_CATALOG.flooding;
}
