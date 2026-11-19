// Generic creature tables for beast/monster/bandit marker profiles.
// Procedure adapted from the FotF2e creature & loot volume; every string is original.
import { ALIGNMENTS, type Alignment } from "@/data/culture-traits";
import type { InhabitantGroupId } from "@/data/inhabitants";
import type { TreasureWeights } from "@/data/treasure";

export type CreatureSize = "tiny" | "small" | "medium" | "large" | "huge";
export type CreatureQuantity = "solitary" | "group" | "mob" | "throng";
export type CreatureWealth = "penniless" | "poor" | "mediocre" | "comfortable" | "wealthy" | "fabulous";
export type LootContext = "harvest" | "carried" | "stashed" | "lair";

export interface CreatureSizeRow {
  size: CreatureSize;
  weight: number;
  scale: number;
  lootDie: number;
  encounterBase: number;
}

export const CREATURE_SIZES: readonly CreatureSizeRow[] = [
  { size: "tiny", weight: 10, scale: 1, lootDie: 4, encounterBase: 1 },
  { size: "small", weight: 30, scale: 3, lootDie: 6, encounterBase: 2 },
  { size: "medium", weight: 35, scale: 5, lootDie: 8, encounterBase: 3 },
  { size: "large", weight: 20, scale: 7, lootDie: 10, encounterBase: 4 },
  { size: "huge", weight: 5, scale: 10, lootDie: 12, encounterBase: 5 }
];

export interface CreatureQuantityRow {
  quantity: CreatureQuantity;
  weight: number;
  count: string;
  encounterBonus: number;
}

export const CREATURE_QUANTITIES: readonly CreatureQuantityRow[] = [
  { quantity: "solitary", weight: 50, count: "1", encounterBonus: 0 },
  { quantity: "group", weight: 30, count: "1d6+1", encounterBonus: 1 },
  { quantity: "mob", weight: 15, count: "3d6+5", encounterBonus: 2 },
  { quantity: "throng", weight: 5, count: "5d6×5", encounterBonus: 3 }
];

export interface CreatureWealthRow {
  wealth: CreatureWealth;
  weight: number;
  lootDie: number;
}

export const CREATURE_WEALTH: readonly CreatureWealthRow[] = [
  { wealth: "penniless", weight: 15, lootDie: 0 },
  { wealth: "poor", weight: 25, lootDie: 4 },
  { wealth: "mediocre", weight: 30, lootDie: 6 },
  { wealth: "comfortable", weight: 15, lootDie: 8 },
  { wealth: "wealthy", weight: 10, lootDie: 10 },
  { wealth: "fabulous", weight: 5, lootDie: 12 }
];

export interface CreatureNature {
  id: string;
  label: string;
  weight: number;
  dangerBonus: number;
  treasure: TreasureWeights;
  inhabitants: Partial<Record<InhabitantGroupId, number>>;
}

export const BEAST_NATURES: readonly CreatureNature[] = [
  {
    id: "ambush",
    label: "an ambush hunter",
    weight: 20,
    dangerBonus: 1,
    treasure: { bullion: 0, regalia: 0, art: 2, relics: 1 },
    inhabitants: { beasts: 3, monsters: 1, vermin: 1 }
  },
  {
    id: "apex",
    label: "an apex predator",
    weight: 15,
    dangerBonus: 2,
    treasure: { bullion: 0, regalia: 0, art: 2, relics: 2 },
    inhabitants: { beasts: 2, monsters: 2 }
  },
  {
    id: "behemoth",
    label: "a behemoth",
    weight: 10,
    dangerBonus: 1,
    treasure: { bullion: 0, regalia: 0, art: 3, relics: 1 },
    inhabitants: { beasts: 3 }
  },
  {
    id: "herd",
    label: "a herd animal",
    weight: 20,
    dangerBonus: 0,
    treasure: { bullion: 0, regalia: 0, art: 1, relics: 0 },
    inhabitants: { beasts: 4, vermin: 1 }
  },
  {
    id: "pack",
    label: "a pack opportunist",
    weight: 20,
    dangerBonus: 1,
    treasure: { bullion: 0, regalia: 0, art: 1, relics: 1 },
    inhabitants: { beasts: 3, vermin: 1 }
  },
  {
    id: "scavenger",
    label: "a scavenger",
    weight: 10,
    dangerBonus: 0,
    treasure: { bullion: 0, regalia: 0, art: 1, relics: 1 },
    inhabitants: { beasts: 2, vermin: 2 }
  },
  {
    id: "stalker",
    label: "a stalker",
    weight: 5,
    dangerBonus: 1,
    treasure: { bullion: 0, regalia: 0, art: 1, relics: 1 },
    inhabitants: { beasts: 2, monsters: 1 }
  }
];

export const MONSTER_NATURES: readonly CreatureNature[] = [
  {
    id: "brute",
    label: "a brute",
    weight: 20,
    dangerBonus: 1,
    treasure: { bullion: 2, regalia: 1, art: 1, relics: 1 },
    inhabitants: { humanoids: 3, humans: 1, beasts: 1 }
  },
  {
    id: "caster",
    label: "a caster",
    weight: 12,
    dangerBonus: 1,
    treasure: { bullion: 1, regalia: 1, art: 2, relics: 3 },
    inhabitants: { humans: 2, constructs: 1, outsiders: 1, undead: 1 }
  },
  {
    id: "undead",
    label: "an undead horror",
    weight: 18,
    dangerBonus: 1,
    treasure: { bullion: 1, regalia: 2, art: 1, relics: 3 },
    inhabitants: { undead: 4, constructs: 1 }
  },
  {
    id: "aberration",
    label: "an aberration",
    weight: 10,
    dangerBonus: 2,
    treasure: { bullion: 0, regalia: 0, art: 1, relics: 3 },
    inhabitants: { monsters: 3, outsiders: 1, plants: 1 }
  },
  {
    id: "giant-kin",
    label: "a giant-kin",
    weight: 15,
    dangerBonus: 1,
    treasure: { bullion: 2, regalia: 1, art: 1, relics: 1 },
    inhabitants: { humanoids: 3, humans: 1 }
  },
  {
    id: "dragon-kin",
    label: "a dragon-kin",
    weight: 8,
    dangerBonus: 2,
    treasure: { bullion: 3, regalia: 2, art: 2, relics: 2 },
    inhabitants: { monsters: 3, beasts: 1 }
  },
  {
    id: "hag",
    label: "a hag",
    weight: 7,
    dangerBonus: 1,
    treasure: { bullion: 0, regalia: 1, art: 2, relics: 3 },
    inhabitants: { fey: 2, undead: 1, monsters: 1 }
  },
  {
    id: "beastly",
    label: "a beastly predator",
    weight: 10,
    dangerBonus: 1,
    treasure: { bullion: 0, regalia: 0, art: 2, relics: 1 },
    inhabitants: { beasts: 3, monsters: 1 }
  }
];

export const CREATURE_TAGS: readonly string[] = [
  "flying",
  "stealthy",
  "toxic",
  "armored",
  "magical",
  "undead",
  "terrifying",
  "hoarder",
  "leader",
  "organized",
  "fast",
  "slow",
  "burrowing",
  "aquatic",
  "regenerating",
  "insubstantial",
  "mindless"
];

export const CREATURE_ATTACKS: readonly string[] = [
  "bite",
  "claw",
  "trample",
  "gore",
  "grapple",
  "venom",
  "breath",
  "tail",
  "sting",
  "constrict",
  "weapon",
  "spell",
  "touch",
  "swallow"
];

export const CREATURE_DEFENSES: readonly string[] = [
  "thick hide",
  "scales",
  "carapace",
  "bone plating",
  "dense fur",
  "a shell",
  "worn armor",
  "an aura",
  "speed",
  "regeneration",
  "an insubstantial form"
];

export const CREATURE_WANTS: readonly string[] = [
  "to feed",
  "to guard its territory",
  "to hunt the weakest",
  "to hoard what it takes",
  "to be left alone",
  "to spread its blight",
  "to serve its master",
  "to avenge an old wrong",
  "to claim a mate",
  "to drag prey to its lair"
];

export const CREATURE_MOVES: readonly string[] = [
  "ambush from cover",
  "single out the weakest",
  "call the pack",
  "telegraph its presence",
  "crash through obstacles",
  "drag prey away",
  "vanish when threatened",
  "loose a toxic cloud",
  "strike from range",
  "terrify with a display",
  "fight to the death",
  "flee to fight again"
];

export const CREATURE_COLORS: readonly string[] = [
  "pale",
  "dun",
  "russet",
  "slate",
  "mottled green",
  "ashen",
  "black",
  "blood-red",
  "sallow",
  "iridescent"
];

export const CREATURE_TEXTURES: readonly string[] = [
  "slick",
  "rough",
  "scarred",
  "matted",
  "scaled",
  "wrinkled",
  "gaunt",
  "bloated",
  "crusted",
  "smooth"
];

export const CREATURE_CONDITIONS: readonly string[] = [
  "healthy",
  "alert",
  "wounded",
  "starving",
  "aged",
  "young",
  "diseased",
  "enraged",
  "sleeping",
  "dying"
];

export const CREATURE_ACTIVITIES: readonly string[] = [
  "hunting",
  "prowling",
  "feeding",
  "resting",
  "patrolling",
  "ambushing",
  "fleeing",
  "building",
  "arguing",
  "nursing a wound"
];

export const CREATURE_STRANGE_FEATURES: readonly string[] = [
  "too many eyes",
  "a second shadow",
  "a crown of bone",
  "weeping sores",
  "a voice like grinding stone",
  "fur that moves on its own",
  "a halo of flies",
  "glowing veins",
  "an extra limb",
  "a face that is not its own"
];

const CREATURE_ALIGNMENT_ROWS: readonly (readonly [Alignment, Alignment, Alignment, Alignment, Alignment])[] = [
  ["neutral", "neutral", "neutral", "chaotic", "evil"],
  ["neutral", "neutral", "neutral", "chaotic", "evil"],
  ["neutral", "lawful", "neutral", "chaotic", "evil"],
  ["neutral", "lawful", "neutral", "chaotic", "evil"],
  ["neutral", "neutral", "neutral", "chaotic", "evil"],
  ["neutral", "neutral", "neutral", "chaotic", "chaotic"],
  ["lawful", "lawful", "neutral", "chaotic", "chaotic"],
  ["neutral", "neutral", "neutral", "chaotic", "evil"],
  ["good", "lawful", "neutral", "neutral", "chaotic"],
  ["good", "lawful", "lawful", "neutral", "chaotic"],
  ["good", "good", "lawful", "neutral", "neutral"],
  ["good", "good", "lawful", "neutral", "neutral"]
];

export const CREATURE_ALIGNMENT: Record<Alignment, readonly Alignment[]> = Object.fromEntries(
  ALIGNMENTS.map((prevailing, column) => [prevailing, CREATURE_ALIGNMENT_ROWS.map(row => row[column])])
) as unknown as Record<Alignment, readonly Alignment[]>;

export interface LootContextRow {
  context: LootContext;
  label: string;
  treasure: TreasureWeights;
  forms: readonly string[];
}

export const LOOT_CONTEXTS: readonly LootContextRow[] = [
  {
    context: "harvest",
    label: "Harvest",
    treasure: { bullion: 0, regalia: 0, art: 3, relics: 2 },
    forms: ["hide/fur/shell", "meat/rations", "organs/glands", "teeth/claws/horns", "venom/ichor", "bone/sinew"]
  },
  {
    context: "carried",
    label: "Carried",
    treasure: { bullion: 3, regalia: 1, art: 2, relics: 1 },
    forms: ["coin", "a personal item", "a trade good", "a gem", "jewelry", "contraband"]
  },
  {
    context: "stashed",
    label: "Stashed",
    treasure: { bullion: 3, regalia: 2, art: 2, relics: 2 },
    forms: ["a coin chest", "trade goods", "gems", "jewelry", "an art object", "a rare item"]
  },
  {
    context: "lair",
    label: "Lair",
    treasure: { bullion: 2, regalia: 3, art: 3, relics: 3 },
    forms: ["coin", "gems", "jewelry", "an art object", "a rare item", "a curio", "victims' gear"]
  }
];

export const BODY_PARTS: readonly string[] = [
  "hide/fur/shell",
  "blood/ichor",
  "organ/gland",
  "sinew/bone",
  "teeth/claws/horns",
  "eyes/sensory organ",
  "venom sac"
];

export const BODY_PART_PROPERTIES: readonly string[] = [
  "ingredient",
  "decorative",
  "protective",
  "poison",
  "curative",
  "charm/ward"
];

export const TRINKET_FORMS: readonly string[] = [
  "a fragment",
  "a tooth or claw",
  "a ring",
  "a charm",
  "a key",
  "a figurine",
  "a toy",
  "a cameo",
  "a locket",
  "a small box",
  "an orb",
  "an idol"
];

export const GEM_TYPES: readonly string[] = [
  "quartz",
  "agate",
  "jasper",
  "garnet",
  "amber",
  "moonstone",
  "pearl",
  "ruby",
  "emerald",
  "sapphire",
  "diamond"
];

export const JEWELRY_FORMS: readonly string[] = [
  "earrings",
  "a locket",
  "a ring",
  "a bracelet",
  "a necklace",
  "a belt",
  "an idol",
  "a scepter",
  "a jeweled weapon",
  "a circlet"
];

export const RARITY_CATEGORIES: readonly string[] = ["a trade good", "a book/scroll", "an art object", "a curio"];

export const CURIO_NAME_TEMPLATES: readonly string[] = [
  "The [PROPERTY] [ITEM]",
  "The [ADJECTIVE] [ITEM]",
  "The [ITEM] of [PROPERTY]",
  "[NAME]'s [ITEM]"
];

export const CURIO_PROPERTIES: readonly string[] = [
  "Flame",
  "Frost",
  "Storm",
  "Shadow",
  "Light",
  "Binding",
  "Seeing",
  "Swiftness",
  "Stone",
  "Blood"
];

export const CURIO_ADJECTIVES: readonly string[] = [
  "Gleaming",
  "Ancient",
  "Cursed",
  "Blessed",
  "Silent",
  "Hungry",
  "Pale",
  "Gilded"
];

export const CURIO_ITEMS: readonly string[] = [
  "Blade",
  "Amulet",
  "Ring",
  "Staff",
  "Lantern",
  "Mirror",
  "Horn",
  "Key",
  "Cloak",
  "Orb"
];

export const CURIO_POWERS: readonly string[] = [
  "kindles a flame",
  "wards off fear",
  "reveals the hidden",
  "binds a wound",
  "calls a small wind",
  "lights the dark",
  "stills pain",
  "marks the path"
];

export const CURIO_DRAWBACKS: readonly string[] = [
  "drains the bearer's warmth",
  "whispers at night",
  "must be fed a drop of blood",
  "fails in sunlight",
  "binds the bearer to a promise",
  "grows heavier with use"
];

export const BEAST_HABITATS: readonly string[] = [
  "a freshwater lake",
  "a river mouth",
  "coastal shallows",
  "the open sea",
  "a reef",
  "a deep trench"
];

export const BEAST_FORMS: readonly string[] = [
  "a serpentine horror",
  "a many-finned leviathan",
  "a shelled lurker",
  "a tentacled mass",
  "a fanged swimmer",
  "a scaled bulk",
  "a pale crawler",
  "a winged shadow"
];

export const BEAST_LAIRS: readonly string[] = [
  "a submerged cave",
  "a wrecked hull",
  "a trench below the thermocline",
  "a rocky island den",
  "a flooded grotto",
  "a kelp-choked hollow",
  "a half-sunken hulk"
];

export const BEAST_SIGNS: readonly string[] = [
  "gnawed bones on the shore",
  "missing boats",
  "disturbed water",
  "deep gouges in the rock",
  "a trail of dragged prey",
  "scattered scales",
  "an unnatural silence",
  "livestock gone from the shallows"
];

export const BEAST_RUMORS: readonly string[] = [
  "The people of [culture] will not fish [habitat] after dark.",
  "A [culture] elder claims [name] is older than the lake itself.",
  "Boats give [name] a wide berth, and no one blames them.",
  "They say [name] takes the unwary who stray too close to [habitat].",
  "A hunter swears [name] is not one beast but many.",
  "The [biome] around [habitat] goes quiet when [name] rises."
];

export const MONSTER_LAIRS: readonly string[] = [
  "a cave in the crags",
  "a barrow under the hill",
  "a ruined keep",
  "a hollow hill",
  "a blighted grove",
  "a wrecked tower",
  "a bone-strewn den",
  "a flooded cellar"
];

export const MONSTER_SIGNS: readonly string[] = [
  "livestock taken in the night",
  "missing travelers",
  "a tribute of grain left at the border",
  "scorched earth",
  "gnawed bones",
  "a fear of the high passes",
  "lights in the ruin",
  "a silence over the hills"
];

export const MONSTER_TERRITORY: readonly string[] = [
  "holds the high passes and takes a toll",
  "hunts the valley farms by night",
  "keeps the region at bay",
  "demands tribute from the nearest village",
  "ranges the crags for prey",
  "guards a hoard it will not share"
];

export const MONSTER_RUMORS: readonly string[] = [
  "The people of [culture] speak of [name] in hushed tones.",
  "They say [name] [habit], and the locals believe it.",
  "Hunters avoid the [biome] where [name] lairs.",
  "A [culture] elder claims [name] cannot be killed by ordinary steel.",
  "Someone has left offerings at the edge of [name]'s territory.",
  "The road past [name] is watched, and no one agrees by what."
];
