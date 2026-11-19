// Generic cave tables for marker profiles
import type { InhabitantGroupId } from "@/data/inhabitants";
import type { TreasureModifier, TreasureWeights } from "@/data/treasure";

export type CaveExtent = "pocket" | "passage" | "cavern" | "deep" | "abyssal";

export interface CaveExtentRow {
  extent: CaveExtent;
  weight: number;
  scale: number;
  zones: readonly [number, number];
  /** chance of an inline dungeon draft; the status can still veto it */
  dungeonChance: number;
  dungeonSize: "small" | "medium";
}

export const CAVE_EXTENTS: readonly CaveExtentRow[] = [
  { extent: "pocket", weight: 35, scale: 2, zones: [3, 4], dungeonChance: 0, dungeonSize: "small" },
  { extent: "passage", weight: 30, scale: 4, zones: [4, 5], dungeonChance: 0.1, dungeonSize: "small" },
  { extent: "cavern", weight: 20, scale: 6, zones: [4, 6], dungeonChance: 0.35, dungeonSize: "small" },
  { extent: "deep", weight: 12, scale: 8, zones: [5, 7], dungeonChance: 0.8, dungeonSize: "medium" },
  { extent: "abyssal", weight: 3, scale: 10, zones: [6, 8], dungeonChance: 1, dungeonSize: "medium" }
];

export const CAVE_ENTRANCE_FORMS: readonly string[] = [
  "a low mouth in the rock",
  "a narrow fissure",
  "a sinkhole",
  "a cliff opening",
  "a river cave",
  "a collapsed adit",
  "a hidden crawl",
  "a weathered arch"
];

export const CAVE_WATER_STATES: readonly string[] = [
  "dry",
  "dripping",
  "a shallow stream",
  "flooded",
  "an underground lake",
  "a lava tube",
  "ice-bound"
];

export const CAVE_ZONE_TYPES: readonly string[] = [
  "entrance",
  "passage",
  "chamber",
  "shaft",
  "streamway",
  "crystal vein",
  "collapsed gallery",
  "lava tube",
  "ice chamber",
  "old working",
  "shrine niche",
  "bone niche",
  "fissure",
  "crawlway"
];

export const CAVE_ZONE_CONDITIONS: readonly string[] = [
  "intact",
  "cracked",
  "collapsed",
  "flooded",
  "frozen",
  "scorched",
  "slick",
  "rubble-choked",
  "dry",
  "dripping"
];

export const CAVE_DISCOVERIES: readonly string[] = [
  "a miner's lamp",
  "a fossil bed",
  "a crystal cluster",
  "a rope anchor",
  "a carved warning",
  "a shallow pool",
  "a bone pile",
  "a lost pack",
  "a treasure cache (1d6+1)",
  "a hidden niche",
  "a cold spring",
  "a wall of flowstone"
];

export const CAVE_DANGERS: readonly string[] = [
  "an unstable roof",
  "a sudden drop",
  "a vermin swarm",
  "a flooded passage",
  "a lava vent",
  "a slick ledge",
  "a rockfall",
  "a monster den",
  "a bad air pocket",
  "an ice crevasse"
];

export const CAVE_EXITS: readonly string[] = [
  "a narrow crawl",
  "a passage down",
  "a fissure",
  "a flooded tunnel",
  "a rope descent",
  "a collapsed gallery",
  "a side chamber",
  "a stream passage"
];

export const CAVE_SECRETS: readonly string[] = [
  "A second entrance opens only when the stream runs low.",
  "Something below still answers to an old name.",
  "A sealed side chamber holds the cave's real treasure.",
  "The deepest passage bends back toward the surface.",
  "A carved warning marks a door that is not stone.",
  "The cave's water remembers a path no map shows."
];

export const CAVE_RUMORS: readonly string[] = [
  "The people of [culture] avoid [name] after dark.",
  "Shepherds say [name] breathes cold air even in summer.",
  "A [culture] hunter claims something answers from inside [name].",
  "Treasure seekers have offered coin for a map of [name].",
  "The [biome] around [name] is quieter than it should be.",
  "Locals say the [formation] was not made by water alone."
];

export const CAVE_TREASURE_BASE: TreasureWeights = { bullion: 3, regalia: 0, art: 1, relics: 1 };

export const CAVE_STATUS_TREASURE_MODIFIERS: readonly TreasureModifier[] = [
  { pattern: /treasure|hid treasure/i, weights: { bullion: 3, art: 1 } },
  { pattern: /monsters/i, weights: { bullion: 1, art: 1 } },
  { pattern: /empty/i, weights: { bullion: -2, art: -1, relics: -1 } },
  { pattern: /deep|unexplored/i, weights: { relics: 1, art: 1 } },
  { pattern: /flooded/i, weights: { art: -2, bullion: -1 } },
  { pattern: /lava/i, weights: { art: -2, bullion: -1, relics: 1 } }
];

export const CAVE_STATUS_WEIRDNESS: readonly { pattern: RegExp; value: number }[] = [
  { pattern: /lava/i, value: 3 },
  { pattern: /strange|monsters/i, value: 1 },
  { pattern: /deep|unexplored/i, value: 1 },
  { pattern: /flooded/i, value: 1 }
];

export const CAVE_EXTENT_EMPTY_CHANCE: Record<CaveExtent, number> = {
  pocket: 0.4,
  passage: 0.3,
  cavern: 0.2,
  deep: 0.1,
  abyssal: 0.05
};

export const CAVE_EXTENT_INHABITANT_BASE: Record<CaveExtent, number> = {
  pocket: 1,
  passage: 2,
  cavern: 2,
  deep: 3,
  abyssal: 3
};

export const CAVE_EXTENT_INHABITANTS: Record<CaveExtent, Partial<Record<InhabitantGroupId, number>>> = {
  pocket: { beasts: 3, vermin: 3, humans: 1, humanoids: 1 },
  passage: { beasts: 3, vermin: 2, humanoids: 2, humans: 2, monsters: 1 },
  cavern: { beasts: 2, vermin: 2, monsters: 3, humanoids: 2, humans: 2, undead: 1 },
  deep: { monsters: 3, humanoids: 2, constructs: 2, undead: 2, outsiders: 1, vermin: 1 },
  abyssal: { monsters: 3, outsiders: 2, undead: 2, constructs: 2, humanoids: 1, vermin: 1 }
};
