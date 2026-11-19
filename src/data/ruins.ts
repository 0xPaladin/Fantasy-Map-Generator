// Generic ruin tables for single-site marker profiles
import type { InhabitantGroupId } from "@/data/inhabitants";
import type { TreasureModifier, TreasureWeights } from "@/data/treasure";

export type RuinTier = "outpost" | "village" | "town" | "city" | "capital";

export type RuinSiteKind =
  | "palace"
  | "temple"
  | "crypt"
  | "undercroft"
  | "academy"
  | "market"
  | "walls"
  | "harbor"
  | "residential"
  | "other";

export type RuinOriginId =
  | "settlement"
  | "fortress"
  | "temple"
  | "tomb"
  | "academy"
  | "palace"
  | "mine"
  | "harbor"
  | "monastery"
  | "road-station"
  | "unknown";

export interface RuinOrigin {
  id: RuinOriginId;
  label: string;
  siteKind: RuinSiteKind;
  zones: readonly string[];
  treasure: TreasureWeights;
  inhabitants: Partial<Record<InhabitantGroupId, number>>;
}

export const RUIN_TIERS: readonly { tier: RuinTier; weight: number; scale: number; sites: number }[] = [
  { tier: "outpost", weight: 40, scale: 2, sites: 1 },
  { tier: "village", weight: 30, scale: 4, sites: 1 },
  { tier: "town", weight: 20, scale: 6, sites: 1 },
  { tier: "city", weight: 8, scale: 8, sites: 1 },
  { tier: "capital", weight: 2, scale: 10, sites: 1 }
];

export const RUIN_ORIGINS: readonly RuinOrigin[] = [
  {
    id: "settlement",
    label: "a market settlement",
    siteKind: "residential",
    zones: ["street", "square", "well", "hall", "shrine", "workshop", "wall", "gate"],
    treasure: { bullion: 2, regalia: 1, art: 3, relics: 2 },
    inhabitants: { humans: 3, humanoids: 2, vermin: 2, beasts: 1, undead: 1, constructs: 1 }
  },
  {
    id: "fortress",
    label: "a frontier fortress",
    siteKind: "walls",
    zones: ["gate", "wall", "courtyard", "barracks", "armory", "tower", "well", "undercroft"],
    treasure: { bullion: 2, regalia: 3, art: 1, relics: 2 },
    inhabitants: { humans: 2, humanoids: 3, constructs: 2, undead: 2, beasts: 1, outsiders: 1 }
  },
  {
    id: "temple",
    label: "a temple",
    siteKind: "temple",
    zones: ["gate", "nave", "cloister", "shrine", "altar", "crypt", "garden", "bell tower"],
    treasure: { bullion: 1, regalia: 2, art: 3, relics: 5 },
    inhabitants: { undead: 3, outsiders: 2, fey: 2, humans: 2, constructs: 1, vermin: 1 }
  },
  {
    id: "tomb",
    label: "a tomb",
    siteKind: "crypt",
    zones: ["threshold", "corridor", "burial chamber", "false vault", "reliquary", "catacomb", "sealed door", "niche"],
    treasure: { bullion: 1, regalia: 4, art: 1, relics: 5 },
    inhabitants: { undead: 5, constructs: 2, vermin: 2, fey: 1, monsters: 1 }
  },
  {
    id: "academy",
    label: "an academy",
    siteKind: "academy",
    zones: ["gate", "courtyard", "lecture hall", "library", "workshop", "dormitory", "vault", "observatory"],
    treasure: { bullion: 1, regalia: 1, art: 5, relics: 3 },
    inhabitants: { constructs: 3, fey: 2, undead: 2, humans: 1, humanoids: 1, outsiders: 1 }
  },
  {
    id: "palace",
    label: "a palace",
    siteKind: "palace",
    zones: ["gate", "courtyard", "throne room", "apartments", "kitchen", "treasury", "garden", "undercroft"],
    treasure: { bullion: 2, regalia: 4, art: 3, relics: 2 },
    inhabitants: { humans: 3, humanoids: 2, constructs: 1, undead: 2, fey: 1, vermin: 1 }
  },
  {
    id: "mine",
    label: "a mine",
    siteKind: "undercroft",
    zones: ["minehead", "shaft", "tunnel", "ore vein", "workshop", "depot", "sealed adit", "flooded gallery"],
    treasure: { bullion: 5, regalia: 0, art: 0, relics: 1 },
    inhabitants: { vermin: 4, constructs: 2, beasts: 2, humanoids: 2, monsters: 1, undead: 1 }
  },
  {
    id: "harbor",
    label: "a harbor",
    siteKind: "harbor",
    zones: ["dock", "warehouse", "lighthouse", "sea cave", "jetty", "market", "custom house", "flooded cellar"],
    treasure: { bullion: 3, regalia: 1, art: 2, relics: 2 },
    inhabitants: { humans: 3, humanoids: 2, beasts: 2, vermin: 2, undead: 1, outsiders: 1 }
  },
  {
    id: "monastery",
    label: "a monastery",
    siteKind: "temple",
    zones: ["gate", "chapel", "cloister", "scriptorium", "garden", "cells", "refectory", "crypt"],
    treasure: { bullion: 1, regalia: 2, art: 3, relics: 4 },
    inhabitants: { humans: 3, humanoids: 2, undead: 2, fey: 2, constructs: 1, plants: 1 }
  },
  {
    id: "road-station",
    label: "a road station",
    siteKind: "market",
    zones: ["gate", "stable", "inn", "well", "shrine", "watchtower", "courtyard", "cellar"],
    treasure: { bullion: 2, regalia: 1, art: 1, relics: 1 },
    inhabitants: { humans: 2, humanoids: 2, beasts: 2, vermin: 2, undead: 1 }
  },
  {
    id: "unknown",
    label: "a place of unknown purpose",
    siteKind: "other",
    zones: ["threshold", "hall", "chamber", "stair", "well", "niche", "collapsed wing", "sealed door"],
    treasure: { bullion: 1, regalia: 1, art: 1, relics: 1 },
    inhabitants: {
      humans: 1,
      humanoids: 1,
      beasts: 1,
      monsters: 1,
      undead: 1,
      constructs: 1,
      outsiders: 1,
      fey: 1,
      plants: 1,
      vermin: 1
    }
  }
];

export const RUIN_CAUSES: readonly string[] = [
  "war",
  "siege",
  "plague",
  "famine",
  "fire",
  "earthquake",
  "flood",
  "curse",
  "arcane disaster",
  "overrun by monsters",
  "resource depletion",
  "abandonment",
  "unknown"
];

export const RUIN_CONDITIONS: readonly string[] = [
  "vestiges and foundations",
  "a skeletal shell",
  "a partial ruin",
  "largely intact",
  "well preserved",
  "restored by later hands"
];

export const RUIN_ACCESSIBILITY: readonly string[] = [
  "sealed and isolated",
  "deliberately hidden",
  "concealed by terrain",
  "buried under earth or rubble",
  "partly uncovered",
  "clear and obvious"
];

export const RUIN_SURFACE_STATES: readonly string[] = [
  "overgrown",
  "burned",
  "flooded",
  "collapsed",
  "occupied",
  "picked clean",
  "half-buried",
  "quiet"
];

export const RUIN_ZONE_CONDITIONS: readonly string[] = [
  "intact",
  "cracked",
  "collapsed",
  "overgrown",
  "burned",
  "flooded",
  "buried",
  "picked clean"
];

export const RUIN_AGES: readonly string[] = [
  "older than living memory",
  "three centuries old",
  "from the last age",
  "from before the current calendar",
  "from a forgotten age"
];

export const RUIN_DISCOVERIES: readonly string[] = [
  "a faded mural",
  "a broken altar",
  "a sealed coffer",
  "a hidden niche",
  "a rusted key",
  "a fragment of a map",
  "a survivor's camp",
  "a treasure cache (1d6+1)",
  "a carved name",
  "a collapsed stair",
  "a cache of old coins",
  "a weathered statue"
];

export const RUIN_DANGERS: readonly string[] = [
  "unstable floor",
  "collapsing roof",
  "a vermin swarm",
  "an old trap",
  "a restless haunting",
  "toxic mould",
  "a flooded passage",
  "a bandit lookout",
  "falling masonry",
  "a cursed threshold"
];

export const RUIN_EXITS: readonly string[] = [
  "collapsed passage",
  "open street",
  "stair down",
  "sealed door",
  "gap in the wall",
  "undercroft entrance",
  "broken archway",
  "narrow crawlspace"
];

export const RUIN_REMAINS: readonly string[] = [
  "a collapsed [zone]",
  "a [zone] open to the sky",
  "a [zone] half-filled with rubble",
  "a [zone] still marked by [culture] stonework",
  "a [zone] with a sealed lower door",
  "a [zone] where the old floor gives way"
];

export const RUIN_SECRETS: readonly string[] = [
  "A sealed undercroft survives beneath the main hall.",
  "One wall is a disguised door into a forgotten room.",
  "A record of the original settlement is hidden in the ruins.",
  "Something in the deepest chamber still answers to its old name.",
  "A survivor's cache holds a key to a door nobody has found.",
  "The ruin's true entrance is not the obvious one."
];

export const RUIN_RUMORS: readonly string[] = [
  "The people of [culture] call it [name].",
  "They say [name] was [origin] before [cause].",
  "Hunters avoid the [biome] around [name].",
  "A [culture] elder claims something still lives beneath [name].",
  "Treasure hunters have offered coin for a map to [name].",
  "The road to [name] is watched, and no one agrees by whom.",
  "A drunken guide swears the entrance to [name] moves when no one looks."
];

export const RUIN_NAME_TEMPLATES: readonly string[] = [
  "The [ADJECTIVE] [PLACE]",
  "[PLACE] of the [NOUN]",
  "[CULTURE] [PLACE]",
  "The [NOUN]'s [PLACE]",
  "[ADJECTIVE] [PLACE]",
  "The [PLACE] of [CULTURE]",
  "Old [PLACE]",
  "[PLACE] of the [ADJECTIVE] [NOUN]"
];

export const RUIN_NAME_PARTS = {
  places: [
    "Ruin",
    "Keep",
    "Temple",
    "Hall",
    "Court",
    "Gate",
    "Tower",
    "Market",
    "Abbey",
    "Mine",
    "Harbor",
    "Villa",
    "Manor",
    "Bastion",
    "Sanctuary",
    "Quarter",
    "Bridge",
    "Well",
    "Camp",
    "Station"
  ],
  adjectives: [
    "Broken",
    "Forgotten",
    "Silent",
    "Sunken",
    "Ashen",
    "Old",
    "Lost",
    "Hollow",
    "Pale",
    "Weeping",
    "Gilded",
    "Blackened"
  ],
  nouns: [
    "Crown",
    "Hand",
    "King",
    "Queen",
    "Saint",
    "Serpent",
    "Flame",
    "Moon",
    "Bell",
    "Stone",
    "Thorn",
    "Well",
    "Hound",
    "Tower"
  ]
} as const;

export const RUIN_CAUSE_TREASURE_MODIFIERS: readonly TreasureModifier[] = [
  { pattern: /war|siege|invasion/i, weights: { regalia: 1, bullion: 1 } },
  { pattern: /plague|famine|abandon/i, weights: { bullion: -1, art: -1, relics: 1 } },
  { pattern: /fire|earthquake|flood|collapse/i, weights: { art: -2, relics: 1 } },
  { pattern: /curse|arcane|planar/i, weights: { relics: 2, art: 1 } },
  { pattern: /overrun/i, weights: { bullion: -1, relics: 1 } }
];

export const RUIN_LOOTED_TREASURE_MODIFIERS: readonly TreasureModifier[] = [
  { pattern: /looted/i, weights: { bullion: -2, regalia: -1, art: -1, relics: 1 } }
];

export const RUIN_CAUSE_WEIRDNESS: readonly { pattern: RegExp; value: number }[] = [
  { pattern: /curse|arcane|planar/i, value: 3 },
  { pattern: /plague|famine/i, value: 1 },
  { pattern: /unknown/i, value: 2 }
];

export const RUIN_TIER_EMPTY_CHANCE: Record<RuinTier, number> = {
  outpost: 0.45,
  village: 0.35,
  town: 0.25,
  city: 0.15,
  capital: 0.1
};

export const RUIN_TIER_INHABITANT_BASE: Record<RuinTier, number> = {
  outpost: 1,
  village: 2,
  town: 2,
  city: 3,
  capital: 3
};
