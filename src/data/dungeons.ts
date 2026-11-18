// Generic dungeon tables for marker profiles. The procedure follows the FotF work; every string is original.
import { ALIGNMENTS, type Alignment } from "@/data/culture-traits";

export type Safety = "safe" | "unsafe" | "dangerous" | "perilous";
export type DungeonSize = "small" | "medium" | "large" | "huge";
export type DungeonTypeId =
  | "lair"
  | "caves"
  | "mine"
  | "prison"
  | "stronghold"
  | "crypt"
  | "temple"
  | "laboratory"
  | "unknown";
export type Direction = "down" | "back" | "forward" | "left" | "right" | "up";
export type DiceSpec = { count: number; sides: number; add?: number };
export type Weighted<T> = { value: T; weight: number };
export type AreaTypeEntry = string | { source: DungeonTypeId | "random" } | { special: true };
export type SpecialAreaEntry = string | { source: DungeonTypeId | "random" };

export interface OverviewField {
  label: string;
  entries: readonly string[];
}

export interface DungeonTypeTables {
  label: string;
  overview: readonly OverviewField[];
  areaTypes: readonly AreaTypeEntry[];
  dressing: readonly string[];
  connections: { directions: readonly Weighted<Direction>[]; forms: readonly string[] };
  specialAreas: readonly SpecialAreaEntry[];
  discoveries: { features: readonly string[]; finds: readonly string[] };
}

/** Expand count/value rows into a die-sized table */
const table = <T>(rows: readonly (readonly [number, T])[]): readonly T[] =>
  rows.flatMap(([count, value]) => Array.from({ length: count }, () => value));

export const DUNGEON_TYPES: readonly DungeonTypeId[] = table<DungeonTypeId>([
  [1, "lair"],
  [2, "caves"],
  [1, "mine"],
  [1, "prison"],
  [1, "stronghold"],
  [2, "crypt"],
  [1, "temple"],
  [1, "laboratory"],
  [2, "unknown"]
]);

export const DUNGEON_SIZES: readonly {
  size: DungeonSize;
  areas: DiceSpec;
  themes: number;
}[] = table([
  [6, { size: "small" as const, areas: { count: 1, sides: 6, add: 1 }, themes: 1 }],
  [7, { size: "medium" as const, areas: { count: 1, sides: 8, add: 7 }, themes: 2 }],
  [4, { size: "large" as const, areas: { count: 1, sides: 10, add: 15 }, themes: 3 }],
  [3, { size: "huge" as const, areas: { count: 1, sides: 12, add: 25 }, themes: 5 }]
]);

const ALIGNMENT_ROWS: readonly (readonly [Alignment, Alignment, Alignment, Alignment, Alignment])[] = [
  ["good", "good", "good", "good", "good"],
  ["good", "lawful", "lawful", "lawful", "lawful"],
  ["lawful", "lawful", "neutral", "neutral", "neutral"],
  ["neutral", "neutral", "neutral", "chaotic", "chaotic"],
  ["neutral", "neutral", "neutral", "chaotic", "chaotic"],
  ["neutral", "neutral", "neutral", "chaotic", "chaotic"],
  ["chaotic", "chaotic", "chaotic", "chaotic", "evil"],
  ["chaotic", "chaotic", "chaotic", "chaotic", "evil"],
  ["chaotic", "evil", "chaotic", "chaotic", "evil"],
  ["evil", "evil", "evil", "evil", "evil"],
  ["evil", "evil", "evil", "evil", "evil"],
  ["evil", "evil", "evil", "evil", "evil"]
];

const SAFETY_ROWS: readonly { safety: Safety; modifier: number }[] = [
  { safety: "safe", modifier: 3 },
  { safety: "safe", modifier: 3 },
  { safety: "unsafe", modifier: 2 },
  { safety: "unsafe", modifier: 2 },
  { safety: "dangerous", modifier: 1 },
  { safety: "dangerous", modifier: 1 },
  { safety: "dangerous", modifier: 1 },
  { safety: "perilous", modifier: 0 },
  { safety: "perilous", modifier: 0 },
  { safety: "perilous", modifier: 0 },
  { safety: "perilous", modifier: 0 },
  { safety: "perilous", modifier: 0 }
];

export const DUNGEON_ALIGNMENT: Record<
  Alignment,
  readonly { alignment: Alignment; safety: Safety; modifier: number }[]
> = Object.fromEntries(
  ALIGNMENTS.map((prevailing, column) => [
    prevailing,
    ALIGNMENT_ROWS.map((row, index) => ({
      alignment: row[column],
      ...SAFETY_ROWS[index]
    }))
  ])
) as unknown as Record<Alignment, readonly { alignment: Alignment; safety: Safety; modifier: number }[]>;

export const DUNGEON_NAME_TEMPLATES = [
  "The [PLACE]",
  "The [ADJECTIVE] [PLACE]",
  "[PLACE] of the [NOUN]",
  "[NOUN]'s [PLACE]",
  "[PLACE] of the [ADJECTIVE] [NOUN]",
  "The [ADJECTIVE] [NOUN]",
  "[PLACE] of [NAME]",
  "[NAME]'s [PLACE]",
  "The [PLACE] of [NAME]",
  "[ADJECTIVE] [PLACE]",
  "The [NOUN] of [NAME]",
  "[PLACE] of the [NOUN]"
] as const;

export const DUNGEON_NAME_PARTS = {
  places: [
    "Archive",
    "Blight",
    "Boneyard",
    "Catacomb",
    "Cave",
    "Cavern",
    "Citadel",
    "Cliff",
    "Crack",
    "Crag",
    "Crypt",
    "Curse",
    "Deep",
    "Delve",
    "Den",
    "Finger",
    "Fist",
    "Fort",
    "Fortress",
    "Grave",
    "Haunt",
    "Hold",
    "Hole",
    "Hollow",
    "Home",
    "House",
    "Jaws",
    "Keep",
    "Lair",
    "Maw",
    "Maze",
    "Mountain",
    "Mouth",
    "Peak",
    "Pit",
    "Remnant",
    "Retreat",
    "Ruin",
    "Shrine",
    "Skull",
    "Spire",
    "Temple",
    "Throne",
    "Tomb",
    "Tooth",
    "Tower",
    "Tunnel",
    "Vault",
    "Warren",
    "Wreck"
  ],
  adjectives: [
    "Ancient",
    "Ashen",
    "Black",
    "Bloody",
    "Blue",
    "Broken",
    "Burning",
    "Cracked",
    "Dark",
    "Dead",
    "Doomed",
    "Endless",
    "Evil",
    "Fallen",
    "Far",
    "Fearsome",
    "Floating",
    "Forbidden",
    "Forgotten",
    "Frozen",
    "Ghostly",
    "Gloomy",
    "Gray",
    "Grim",
    "Hidden",
    "High",
    "Holy",
    "Iron",
    "Jagged",
    "Lonely",
    "Lost",
    "Low",
    "Misty",
    "Petrified",
    "Red",
    "Screaming",
    "Sharp",
    "Shattered",
    "Shifting",
    "Shivering",
    "Shrouded",
    "Stony",
    "Sunken",
    "Thorny",
    "Thundering",
    "Unholy",
    "White",
    "Wicked",
    "Withered",
    "Yellow"
  ],
  nouns: [
    "Arm",
    "Ash",
    "Beast",
    "Behemoth",
    "Blood",
    "Child",
    "Cinder",
    "Corpse",
    "Crystal",
    "Dagger",
    "Death",
    "Demon",
    "Devil",
    "Doom",
    "Dragon",
    "Eye",
    "Fear",
    "Finger",
    "Fire",
    "Foot",
    "Frog",
    "Ghost",
    "Giant",
    "Goblin",
    "God",
    "Hand",
    "Head",
    "Heart",
    "Horror",
    "Hero",
    "Horn",
    "King",
    "Knave",
    "Priest",
    "Prophet",
    "Queen",
    "Shard",
    "Skull",
    "Souls",
    "Spear",
    "Spirit",
    "Stone",
    "Sword",
    "Throne",
    "Tongue",
    "Troll",
    "Warrior",
    "Water",
    "Witch",
    "Wizard",
    "Worm"
  ]
} as const;

export const DUNGEON_THEME_CATEGORIES = [
  { category: "hopeful", min: 1, max: 3 },
  { category: "mysterious", min: 4, max: 11 },
  { category: "grim", min: 12, max: 18 },
  { category: "wild", min: 19, max: 20 }
] as const;

export const DUNGEON_THEMES = {
  hopeful: [
    "nature and growth",
    "law and order",
    "beauty and wonder",
    "healing and recovery",
    "protection and defense",
    "completion",
    "inheritance and legacy",
    "balance and harmony",
    "light and life",
    "prophecy",
    "divine influence",
    "transcendence"
  ],
  mysterious: [
    "theft and burglary",
    "desire and obsession",
    "secrets and deception",
    "imitation and mimicry",
    "inversion and reversal",
    "[element]",
    "transformation",
    "shadow and spirits",
    "cryptic knowledge",
    "madness",
    "[magic]",
    "[magic]"
  ],
  grim: [
    "pride and hubris",
    "hunger and gluttony",
    "greed and avarice",
    "wildness and savagery",
    "devotion and sacrifice",
    "forbidden knowledge",
    "control and dominance",
    "pain and torture",
    "wrath and war",
    "tragedy and loss",
    "chaos and corruption",
    "darkness and death"
  ],
  wild: [
    "constructs and machines",
    "unexpected sentience",
    "time and space",
    "lost technology",
    "utter insanity",
    "alien life",
    "cosmic alignment",
    "other planes",
    "fiends and devils",
    "unspeakable horrors",
    "elder powers",
    "[grim], heightened"
  ]
} as const;

export const DUNGEON_ACCESSIBILITY: readonly string[] = table([
  [1, "sealed and isolated"],
  [1, "deliberately hidden"],
  [2, "concealed by terrain"],
  [2, "buried under earth or rubble"],
  [2, "partly uncovered"],
  [4, "clear and obvious"]
]);

export const DUNGEON_BUILDERS: readonly string[] = table([
  [1, "an otherworldly being"],
  [1, "an extraplanar entity"],
  [1, "a wizard or mad scholar"],
  [1, "a sorcerer-king or queen"],
  [1, "an arcane circle"],
  [1, "a religious order or cult"],
  [1, "a monarch or warlord"],
  [1, "a merchant magnate"],
  [1, "an underground society"],
  [3, "a surface society"]
]);

export const DUNGEON_SITUATIONS: readonly string[] = table([
  [2, "aboveground"],
  [2, "part aboveground, part below"],
  [7, "belowground"],
  [1, "extraordinary: floating, shifting or half-real"]
]);

export const DUNGEON_CONDITIONS: readonly string[] = table([
  [1, "vestiges and remnants"],
  [2, "a decayed skeleton of a structure"],
  [5, "a partial ruin"],
  [2, "largely intact"],
  [1, "well preserved"],
  [1, "fully intact or restored"]
]);

export const DUNGEON_CAUSES: readonly string[] = table([
  [1, "an arcane disaster"],
  [1, "a curse or damnation"],
  [2, "a natural disaster"],
  [1, "plague, famine or drought"],
  [2, "being overrun by monsters"],
  [2, "hubris"],
  [1, "war or invasion"],
  [1, "depleted resources"],
  [1, "better prospects elsewhere"]
]);

export interface AreaContents {
  discoveries: DiceSpec | null;
  dangers: DiceSpec | null;
}

export const DUNGEON_AREA_CONTENTS: readonly AreaContents[] = table<AreaContents>([
  [1, { discoveries: null, dangers: { count: 1, sides: 4, add: 1 } }],
  [2, { discoveries: null, dangers: { count: 1, sides: 1 } }],
  [4, { discoveries: { count: 1, sides: 1 }, dangers: null }],
  [1, { discoveries: { count: 1, sides: 1 }, dangers: { count: 1, sides: 1 } }],
  [1, { discoveries: { count: 1, sides: 1 }, dangers: { count: 1, sides: 4 } }],
  [1, { discoveries: { count: 1, sides: 4 }, dangers: { count: 1, sides: 4 } }],
  [1, { discoveries: { count: 1, sides: 4, add: 1 }, dangers: { count: 1, sides: 1 } }],
  [1, { discoveries: { count: 1, sides: 4, add: 1 }, dangers: null }]
]);

export const DUNGEON_EXITS: readonly DiceSpec[] = table<DiceSpec>([
  [4, { count: 1, sides: 1 }],
  [3, { count: 1, sides: 4, add: 1 }],
  [1, { count: 1, sides: 6, add: 5 }]
]);

const commonDirections = (down: number, back: number, forward: number, left: number, right: number, up: number) => [
  { value: "down" as const, weight: down },
  { value: "back" as const, weight: back },
  { value: "forward" as const, weight: forward },
  { value: "left" as const, weight: left },
  { value: "right" as const, weight: right },
  { value: "up" as const, weight: up }
];

export const DUNGEON_TYPE_TABLES: Record<DungeonTypeId, DungeonTypeTables> = {
  lair: {
    label: "lair, den or hideout",
    overview: [
      {
        label: "Main occupant",
        entries: table([
          [1, "a legendary monster"],
          [1, "a lich, vampire or mummy"],
          [1, "a monstrous beast"],
          [1, "a savage humanoid band"],
          [1, "a wizard, witch or sorcerer"],
          [1, "a cult, coven or secret society"],
          [1, "a mercenary company"],
          [1, "bandits or smugglers"],
          [1, "rebels or partisans"],
          [1, "a wanted fugitive"],
          [2, "two occupants combined"]
        ])
      },
      {
        label: "Entrance",
        entries: table([
          [1, "underwater"],
          [1, "a natural maze"],
          [1, "a dense thicket"],
          [1, "an abandoned temple"],
          [1, "a ruined keep"],
          [4, "a cave, tunnel or grotto"],
          [1, "a hut or homestead"]
        ])
      },
      {
        label: "Defenses",
        entries: table([
          [1, "two defenses combined"],
          [1, "traps"],
          [1, "guards"],
          [1, "alarms and wards"],
          [1, "fortification"],
          [2, "lookouts and scouts"],
          [1, "none"]
        ])
      }
    ],
    areaTypes: table<AreaTypeEntry>([
      [2, "abandoned entry hall"],
      [2, "guard post"],
      [2, "storeroom"],
      [2, "sleeping quarters"],
      [2, "common room"],
      [2, "workshop"],
      [2, "kitchen or larder"],
      [2, "holding cell"],
      [2, "hidden cache"],
      [2, { special: true }]
    ]),
    dressing: [
      "nothing unusual",
      "cooking smell",
      "distant alarm or signal",
      "tracks and scuff marks",
      "bedding and personal effects",
      "stolen goods",
      "guard marks",
      "prisoner remains",
      "a firepit",
      "two details combined"
    ],
    connections: {
      directions: commonDirections(1, 2, 6, 4, 4, 3),
      forms: [
        "curtained opening",
        "door",
        "locked door",
        "passage",
        "ladder",
        "stair",
        "secret passage",
        "trapdoor",
        "bridge",
        "window",
        "collapsed passage",
        "adjacent area"
      ]
    },
    specialAreas: table<SpecialAreaEntry>([
      [2, "waste pit"],
      [2, "burial ground"],
      [2, "guardroom"],
      [2, "storeroom"],
      [2, "well room"],
      [2, "barracks"],
      [1, "shrine"],
      [1, "armory"],
      [1, "audience room"],
      [1, "leader's quarters"],
      [1, "strongroom"],
      [3, { source: "random" }]
    ]),
    discoveries: {
      features: [
        "pit or covered hole",
        "alarm wire or trip line",
        "barred door",
        "cramped passage",
        "hidden nook",
        "ladder or ladder shaft",
        "trophy display",
        "sleeping mats",
        "firepit",
        "stash pit",
        "lookout post",
        "escape route"
      ],
      finds: [
        "a creature's lair",
        "evidence of the occupant",
        "a prisoner or captive",
        "a map or message",
        "1d4 personal items",
        "a key or token",
        "a supply cache",
        "weapons or armor",
        "a treasure cache (1d6+1)",
        "a treasure cache (1d8+1)",
        "stolen goods",
        "a guard roster"
      ]
    }
  },
  caves: {
    label: "caves and caverns",
    overview: [
      {
        label: "Cave type",
        entries: table([
          [2, "burrowed by a creature"],
          [4, "formed by lava tubes"],
          [2, "solutional limestone"],
          [2, "solutional chalk"],
          [2, "solutional dolomite"],
          [2, "solutional salt"],
          [3, "eroded by water"],
          [1, "formed by a glacier"],
          [1, "formed by an earthquake"],
          [1, "crystalline"]
        ])
      },
      {
        label: "Entrances",
        entries: table([
          [6, "one"],
          [4, "1d4+1"],
          [1, "1d6+5"],
          [1, "1d8+11"]
        ])
      },
      {
        label: "Main entrance",
        entries: table([
          [5, "cave mouth"],
          [3, "crevice, chasm or gorge"],
          [1, "sinkhole"],
          [1, "swallow hole"]
        ])
      }
    ],
    areaTypes: table<AreaTypeEntry>([
      [2, "collapsed area"],
      [4, "tunnel network"],
      [3, "cave, gallery or room"],
      [2, "cavern or chamber"],
      [2, "cluster of linked caves"],
      [2, "multi-level cavern"],
      [1, { source: "random" }],
      [1, "seismic fissure or void"],
      [1, "crystalline chamber"],
      [2, { special: true }]
    ]),
    dressing: [
      "nothing unusual",
      "a strong smell",
      "an echo or dripping sound",
      "tracks and signs of activity",
      "silt, mud or rubble",
      "a mineral pattern",
      "fungi or lichen",
      "stalactites and stalagmites",
      "a crystal or calcite formation",
      "two details combined"
    ],
    connections: {
      directions: commonDirections(3, 2, 4, 4, 4, 3),
      forms: [
        "hole, pit or sinkhole",
        "crack or fissure",
        "crawlspace",
        "dropoff",
        "watercourse",
        "tunnel",
        "tunnel",
        "tunnel",
        "tunnel",
        "tunnel",
        "shaft or chimney",
        "adjacent area"
      ]
    },
    specialAreas: table<SpecialAreaEntry>([
      [2, "midden"],
      [1, "sinkhole"],
      [2, "ice cave"],
      [1, "maze of tunnels"],
      [2, "bandit hideout"],
      [2, "creature lair"],
      [1, "vast cavern"],
      [1, "strange cavern"],
      [1, "underground lake or river"],
      [1, "lake or river of lava"],
      [1, "gateway to the deep"],
      [2, { source: "mine" }],
      [3, { source: "random" }]
    ]),
    discoveries: {
      features: [
        "pit or fissure",
        "slippery slope",
        "steep incline",
        "pillars or columns",
        "hollows and pockets",
        "natural alcoves",
        "vertical shaft",
        "ledges or natural bridges",
        "overlook",
        "multi-level space",
        "vantage point",
        "strange feature"
      ],
      finds: [
        "a creature's lair",
        "edible fungi",
        "glowing fungi",
        "an explorer's remains",
        "a warning sign",
        "1d4 explorers",
        "a spring or pool",
        "a waterfall",
        "an old campsite",
        "abandoned supplies",
        "a treasure cache (1d4+1)",
        "a treasure cache (1d6+1)"
      ]
    }
  },
  mine: {
    label: "mine",
    overview: [
      {
        label: "Resource",
        entries: table([
          [1, "salt or mineral"],
          [2, "clay, stone or limestone"],
          [3, "copper, tin, iron or lead"],
          [2, "silver or gold"],
          [1, "gems"],
          [1, "rare ore"],
          [1, "magical or planar material"],
          [1, "something exotic"]
        ])
      },
      {
        label: "Entrance",
        entries: table([
          [1, "one minehead with a lift"],
          [1, "1d6+1 mineheads with lifts"],
          [2, "an open pit with 1d6 mouths"],
          [2, "1d6+1 open pits"],
          [2, "1d6+1 tunnel mouths"],
          [2, "one tunnel mouth"]
        ])
      },
      {
        label: "Method",
        entries: table([
          [1, "magical or enchanted"],
          [1, "mechanical or automated"],
          [6, "hard labor"]
        ])
      }
    ],
    areaTypes: table<AreaTypeEntry>([
      [2, "collapsed area"],
      [2, "open pit or shaft"],
      [1, "waste pits"],
      [4, "mining tunnel network"],
      [2, "dead-end adit"],
      [2, "natural cave or chasm"],
      [1, "underground stream or pool"],
      [1, "miners' quarters"],
      [1, "processing area"],
      [1, "storeroom or workshop"],
      [1, { source: "random" }],
      [2, { special: true }]
    ]),
    dressing: [
      "nothing unusual",
      "a sound or smell",
      "waste, refuse or debris",
      "graffiti or a warning",
      "remains of miners",
      "remains of a creature",
      "broken tools",
      "tailings",
      "a breeze",
      "two details combined"
    ],
    connections: {
      directions: commonDirections(3, 2, 4, 4, 4, 3),
      forms: [
        "dead-end adit",
        "out-of-reach opening",
        "fissure or cave",
        "waterway or bridge",
        "tunnel",
        "tunnel",
        "tunnel",
        "shaft or chute",
        "shaft or chute",
        "secret passage",
        "adit to the surface",
        "collapsed passage"
      ]
    },
    specialAreas: table<SpecialAreaEntry>([
      [2, "pit of doom"],
      [2, "labyrinth"],
      [2, "excavation site"],
      [2, "great chasm or bridge"],
      [2, "reservoir or cistern"],
      [2, "vast cavern"],
      [2, "strange cavern"],
      [1, "enchanted pool"],
      [1, "forgotten foundry"],
      [1, "mother lode"],
      [1, "planar portal"],
      [1, "gateway to the deep"],
      [1, { source: "random" }]
    ]),
    discoveries: {
      features: [
        "pit or fissure",
        "uneven floor",
        "rubble heaps",
        "locked door or gate",
        "alcoves and niches",
        "ledges or walkways",
        "wall carving or statue",
        "old processing equipment",
        "well or pool",
        "obstacle or puzzle",
        "lift or winch",
        "air shaft"
      ],
      finds: [
        "mining tools or supplies",
        "a pictographic record",
        "a creature's lair",
        "evidence of a creature",
        "a personal item",
        "a map or message",
        "a key",
        "a vein of the resource",
        "a treasure cache (1d4+1)",
        "a treasure cache (1d6+1)",
        "an abandoned cart",
        "an ore sample"
      ]
    }
  },
  prison: {
    label: "prison",
    overview: [
      {
        label: "Prisoner type",
        entries: table([
          [1, "an unspeakable horror"],
          [1, "demons or devils"],
          [1, "terrible monsters"],
          [1, "lunatics"],
          [1, "the poor and indigent"],
          [3, "a criminal underclass"],
          [1, "rebels or traitors"],
          [1, "a religious minority"],
          [1, "research subjects"],
          [2, "two prisoner types combined"]
        ])
      },
      {
        label: "Perimeter",
        entries: table([
          [1, "traps and hazards"],
          [1, "a moat or chasm"],
          [3, "a fence or wall"],
          [1, "difficult terrain"],
          [1, "open land"],
          [3, "two perimeter types combined"]
        ])
      },
      {
        label: "Security",
        entries: table([
          [1, "divine or demonic power"],
          [1, "wards and enchantments"],
          [1, "mechanical or automated"],
          [1, "baroque systems"],
          [3, "standard or mundane"],
          [1, "two security types combined"]
        ])
      }
    ],
    areaTypes: table<AreaTypeEntry>([
      [2, "latrine or midden"],
      [3, "passageway"],
      [2, "guardpost or anteroom"],
      [4, "cellblock"],
      [2, "storeroom"],
      [1, "mess or kitchen"],
      [1, "yard or common area"],
      [2, "barracks or quarters"],
      [1, "workshop"],
      [2, { special: true }]
    ]),
    dressing: [
      "nothing unusual",
      "a sound or smell",
      "waste or debris",
      "graffiti or a warning",
      "signs of battle or escape",
      "remains of prisoners",
      "remains of a creature",
      "a sign or plaque",
      "furniture",
      "two details combined"
    ],
    connections: {
      directions: commonDirections(1, 2, 5, 5, 5, 2),
      forms: [
        "collapsed passage",
        "window, hole or pit",
        "fissure or broken wall",
        "door to a passage",
        "locked door",
        "locked door",
        "locked door",
        "locked door",
        "locked door",
        "locked door",
        "shaft or chute",
        "escape tunnel"
      ]
    },
    specialAreas: table<SpecialAreaEntry>([
      [2, "burial pits"],
      [2, "oubliette"],
      [2, "sealed cellblock"],
      [2, "torture chamber"],
      [2, "quarry or excavation"],
      [1, "hall of judgment"],
      [1, "hall of subjugation"],
      [1, "shrine"],
      [1, "administrative offices"],
      [2, "warden's quarters"],
      [2, { source: "mine" }],
      [1, "gateway to the deep"],
      [1, { source: "random" }]
    ]),
    discoveries: {
      features: [
        "pit or fissure",
        "obstacle or impediment",
        "locked door or gate",
        "uneven floor",
        "barred wall or window",
        "alcoves and niches",
        "ledges or catwalks",
        "wall carving or statue",
        "iron bars and rings",
        "chokepoint",
        "air shaft",
        "collapsed cell"
      ],
      finds: [
        "a creature's lair",
        "evidence of an inhabitant",
        "1d4 prisoners or escapees",
        "a personal item",
        "a map or message",
        "a key",
        "a well or pool",
        "a treasure cache (1d4+1)",
        "a treasure cache (1d6+1)",
        "a guard roster",
        "a smuggled tool",
        "an escape route"
      ]
    }
  },
  stronghold: {
    label: "stronghold or fortress",
    overview: [
      {
        label: "Approach",
        entries: table([
          [2, "extreme terrain"],
          [2, "a switchback ascent"],
          [1, "barren wasteland"],
          [1, "a chasm or defile"],
          [2, "a bridge or span"],
          [1, "a pass or valley"],
          [2, "forest or thicket"],
          [1, "open land"]
        ])
      },
      {
        label: "Defenses",
        entries: table([
          [4, "three defenses combined"],
          [1, "wards and enchantments"],
          [1, "traps"],
          [1, "towers and arrow slits"],
          [1, "caltrops and hindrances"],
          [1, "moat and drawbridge"],
          [1, "gates and portcullis"]
        ])
      },
      {
        label: "Original threat",
        entries: table([
          [1, "an otherworldly force"],
          [1, "a monster mob"],
          [2, "a savage humanoid horde"],
          [1, "a rival religion"],
          [2, "a rival faction or culture"],
          [1, "rebels or insurgents"]
        ])
      }
    ],
    areaTypes: table<AreaTypeEntry>([
      [1, "latrine or midden"],
      [2, "fortified gate or guardpost"],
      [3, "passageway or walkway"],
      [4, "common quarters"],
      [3, "storage or supply"],
      [1, "mess or kitchen"],
      [1, "courtyard or well"],
      [2, "barracks, stables or kennels"],
      [1, "workshop"],
      [2, { special: true }]
    ]),
    dressing: [
      "nothing unusual",
      "a sound or smell",
      "waste or rubbish",
      "signs of battle",
      "remains of a creature",
      "an emblem or banner",
      "curtains or tapestries",
      "a sign or plaque",
      "a mural or relief",
      "two details combined"
    ],
    connections: {
      directions: commonDirections(1, 2, 6, 4, 4, 3),
      forms: [
        "locked door or gate",
        "locked door or gate",
        "locked door or gate",
        "archway",
        "door or gate",
        "door or gate",
        "ladder or trapdoor",
        "stair",
        "passage",
        "passage",
        "passage",
        "secret passage"
      ]
    },
    specialAreas: table<SpecialAreaEntry>([
      [3, "torture chamber"],
      [2, "menagerie or arena"],
      [2, "feasting hall"],
      [2, "shrine or temple"],
      [3, "armory"],
      [1, "trophy hall"],
      [1, "audience chamber"],
      [2, "advisor's quarters"],
      [1, "leader's quarters"],
      [1, "secret room"],
      [1, "treasure chamber"],
      [1, { source: "random" }]
    ]),
    discoveries: {
      features: [
        "firepit or braziers",
        "rubble or debris",
        "controls or machinery",
        "curtains or tapestries",
        "alcoves and niches",
        "pillars or columns",
        "furniture",
        "statuary",
        "well or fountain",
        "balcony or overlook",
        "defensible position",
        "secret door"
      ],
      finds: [
        "a creature's lair",
        "evidence of a creature",
        "a prisoner or escapee",
        "a map or record",
        "1d4 personal items",
        "a lever, switch or key",
        "a supply stockpile",
        "weapons or armor",
        "a treasure cache (1d6+1)",
        "a treasure cache (1d8+1)",
        "a heraldic banner",
        "a locked chest"
      ]
    }
  },
  crypt: {
    label: "crypt or tomb",
    overview: [
      {
        label: "Occupant",
        entries: table([
          [1, "a fiend or devil"],
          [1, "a horror or abomination"],
          [2, "a necromancer or sorcerer"],
          [1, "a folk hero or commoner"],
          [1, "a legendary hero or martyr"],
          [2, "a noble or aristocrat"],
          [2, "a high priest, saint or prophet"],
          [1, "a monarch or overlord"],
          [1, "two occupants combined"]
        ])
      },
      {
        label: "Marker",
        entries: table([
          [2, "ominous markings"],
          [1, "funerary statuary"],
          [2, "gravestones"],
          [1, "an obelisk or monument"],
          [1, "a symbolic threshold"],
          [1, "a memorial plaque"],
          [1, "an eternal flame"],
          [1, "two markers combined"]
        ])
      },
      {
        label: "Entrance",
        entries: table([
          [1, "secret or hidden"],
          [1, "sealed and warded"],
          [1, "trapped"],
          [2, "sealed or locked"],
          [1, "a broken slab or door"],
          [1, "a ceremonial gate"],
          [1, "open"]
        ])
      }
    ],
    areaTypes: table<AreaTypeEntry>([
      [2, "collapsed area"],
      [2, "false treasure vault"],
      [3, "trapped passage"],
      [2, "vestibule or antechamber"],
      [2, "catacomb"],
      [2, "passage"],
      [3, "chamber or gallery"],
      [1, "storage room"],
      [1, { source: "random" }],
      [2, { special: true }]
    ]),
    dressing: [
      "nothing unusual",
      "a distant sound",
      "dust, cobwebs or mould",
      "graffiti or an inscription",
      "remains of robbers",
      "a mural or relief",
      "a faint smell of oil or incense",
      "a vandalized ornament",
      "stale air",
      "two details combined"
    ],
    connections: {
      directions: commonDirections(4, 2, 5, 3, 3, 3),
      forms: [
        "sealed door or gate",
        "sealed door or gate",
        "dead-end passage",
        "dead-end passage",
        "out-of-reach opening",
        "fissure or cave",
        "pit or shaft",
        "open passage",
        "open passage",
        "adjacent area",
        "tomb robber's tunnel",
        "secret passage"
      ]
    },
    specialAreas: table<SpecialAreaEntry>([
      [2, "catacombs"],
      [2, "hall of guardians"],
      [2, "sacrificial chamber"],
      [2, "funerary workshop"],
      [2, "hall of ancestors"],
      [2, "shrine"],
      [1, "temple"],
      [1, "hall of offerings"],
      [2, "burial vault"],
      [1, "secret burial vault"],
      [1, "treasure vault"],
      [1, "gateway to the deep"],
      [1, { source: "random" }]
    ]),
    discoveries: {
      features: [
        "pit or fissure",
        "close quarters",
        "rubble heaps",
        "broken slabs",
        "cracked walls or floor",
        "funerary urns",
        "pillars or statuary",
        "high ceiling",
        "alcoves and niches",
        "stairs or ledges",
        "coffins or sarcophagi",
        "platform or altar"
      ],
      finds: [
        "embalming supplies",
        "a meaningful inscription",
        "1d4 tomb robbers",
        "a creature's lair",
        "a map or clue",
        "a lever or key",
        "a sarcophagus or reliquary",
        "a treasure cache (1d6+1)",
        "a treasure cache (1d8+1)",
        "a treasure cache (1d10+1)",
        "a treasure cache (1d12+1)",
        "a sealed urn"
      ]
    }
  },
  temple: {
    label: "temple or sanctuary",
    overview: [
      {
        label: "Religion",
        entries: table([
          [1, "extraplanar or alien"],
          [2, "long forgotten"],
          [3, "ancient or dormant"],
          [6, "still active"]
        ])
      },
      {
        label: "Dedication",
        entries: table([
          [1, "ancestral spirits"],
          [1, "a divine creature"],
          [1, "a relic or artifact"],
          [1, "a saint or martyr"],
          [1, "a minor deity"],
          [3, "a major deity"],
          [2, "two dedications combined"]
        ])
      },
      {
        label: "Primary role",
        entries: table([
          [2, "worship and prayer"],
          [1, "pilgrimage"],
          [1, "protection and safekeeping"],
          [1, "sacrifice"],
          [1, "healing and restoration"],
          [1, "study and research"],
          [1, "prophecy"]
        ])
      }
    ],
    areaTypes: table<AreaTypeEntry>([
      [2, "latrine or waste disposal"],
      [2, "storeroom"],
      [2, "antechamber or vestry"],
      [5, "chamber, gallery or arcade"],
      [1, "mess or kitchen"],
      [3, "dormitory or sleeping cells"],
      [1, "garden or courtyard"],
      [1, "meditation chamber"],
      [1, { source: "random" }],
      [2, { special: true }]
    ]),
    dressing: [
      "nothing unusual",
      "a draft",
      "an echo",
      "a lingering scent",
      "dust, cobwebs or mould",
      "condensation or dampness",
      "loose or cracked tiles",
      "scorch marks",
      "a mural or relief",
      "two details combined"
    ],
    connections: {
      directions: commonDirections(1, 2, 6, 4, 4, 3),
      forms: [
        "locked door",
        "locked door",
        "curtained opening",
        "curtained opening",
        "archway",
        "archway",
        "cloister",
        "passage",
        "passage",
        "alcove-lined passage",
        "stair",
        "hidden passage"
      ]
    },
    specialAreas: table<SpecialAreaEntry>([
      [2, "lay chapel"],
      [2, "shrine"],
      [2, "blessed pool"],
      [2, "hall of offerings"],
      [2, "belltower"],
      [2, "sacrificial chamber"],
      [2, { source: "crypt" }],
      [1, "library"],
      [1, "high priest's quarters"],
      [1, "sanctum"],
      [1, "oracle"],
      [1, "vault of secrets"],
      [1, { source: "random" }]
    ]),
    discoveries: {
      features: [
        "firepit or braziers",
        "rubble or debris",
        "curtains or tapestries",
        "pillars or statuary",
        "alcoves and niches",
        "pews or benches",
        "vaulted ceiling",
        "stairs or ledges",
        "well or font",
        "balcony or overlook",
        "altar or dais",
        "concealed niche"
      ],
      finds: [
        "evidence of a creature",
        "a letter or omen",
        "ritual vestments",
        "candles or lamps",
        "books or scrolls",
        "incense or oils",
        "a key",
        "a reliquary",
        "an idol or icon",
        "a treasure cache (1d6+1)",
        "a treasure cache (1d8+1)",
        "a treasure cache (1d10+1)"
      ]
    }
  },
  laboratory: {
    label: "laboratory or remote retreat",
    overview: [
      {
        label: "Practitioner",
        entries: table([
          [1, "an extraplanar entity"],
          [1, "a necromancer or lich"],
          [5, "a wizard or witch"],
          [1, "a scholar or sage"],
          [1, "a herbalist or botanist"],
          [1, "an alchemist"],
          [1, "an engineer or artificer"],
          [1, "an enchanter"]
        ])
      },
      {
        label: "Focus of study",
        entries: table([
          [1, "other planes"],
          [1, "time"],
          [1, "a specific element"],
          [1, "geology"],
          [1, "botany or biology"],
          [1, "zoology"],
          [1, "astronomy"],
          [3, "sorcery"]
        ])
      },
      {
        label: "Method",
        entries: table([
          [1, "experimentation"],
          [1, "sorcery"],
          [1, "technology"],
          [1, "divination"],
          [1, "vivisection"],
          [1, "extraction and distillation"],
          [1, "observation"],
          [1, "collaboration"]
        ])
      }
    ],
    areaTypes: table<AreaTypeEntry>([
      [2, "latrine or waste disposal"],
      [2, "storeroom or repository"],
      [2, "study or reading room"],
      [2, "workshop or scriptorium"],
      [2, "enclosures or cells"],
      [1, "mess or kitchen"],
      [3, "common or living quarters"],
      [2, { source: "random" }],
      [4, { special: true }]
    ]),
    dressing: [
      "nothing unusual",
      "dust, cobwebs or mould",
      "a hum, whirr or groan",
      "stains, scratches or scorch marks",
      "structural damage",
      "a sound or smell",
      "glyphs and markings",
      "pools of liquid",
      "broken tools",
      "two details combined"
    ],
    connections: {
      directions: commonDirections(5, 1, 3, 3, 3, 5),
      forms: [
        "secret door",
        "secret door",
        "locked door",
        "archway",
        "archway",
        "passage",
        "passage",
        "ladder or trapdoor",
        "stair",
        "stair",
        "elevator or lift",
        "teleporter or portal"
      ]
    },
    specialAreas: table<SpecialAreaEntry>([
      [2, "auditorium"],
      [2, "greenhouse"],
      [2, "library or archive"],
      [6, "laboratory"],
      [1, "hall of foresight"],
      [1, "chamber of preservation"],
      [1, "summoning circle"],
      [1, "vivification chamber"],
      [1, "altar of sacrifice"],
      [1, "vault of the forbidden"],
      [1, "practitioner's quarters"],
      [1, { source: "random" }]
    ]),
    discoveries: {
      features: [
        "pit or void",
        "firepit or braziers",
        "chains or ropes",
        "shelves or cabinets",
        "benches or tables",
        "well or pool",
        "examination table",
        "jars or vitrines",
        "warded area",
        "viewing gallery",
        "levers or controls",
        "suspended walkway"
      ],
      finds: [
        "evidence of a creature",
        "vials or alembics",
        "a preserved specimen",
        "a mechanical apparatus",
        "an incomplete experiment",
        "a notebook or records",
        "a lever, key or cipher",
        "charts or formulae",
        "a rare mineral",
        "a spellbook or codex",
        "a treasure cache (1d6+1)",
        "a treasure cache (1d8+1)"
      ]
    }
  },
  unknown: {
    label: "place of unknown origin",
    overview: [
      {
        label: "Entrance",
        entries: table([
          [1, "underwater"],
          [1, "a dense thicket"],
          [2, "a tunnel or cave"],
          [2, "a crevice or ravine"],
          [1, "a basement or cellar"],
          [1, "a hut or homestead"],
          [1, "an abandoned temple"],
          [1, "a tower"],
          [2, "a ruined keep or castle"]
        ])
      },
      {
        label: "Inhabitants",
        entries: table([
          [1, "prisoners"],
          [1, "summoned or invited beings"],
          [1, "outcasts or refugees"],
          [1, "creations or constructs"],
          [2, "a spawn or infestation"],
          [1, "haunts or ghosts"],
          [1, "escapees"],
          [1, "mutants or horrors"],
          [1, "survivors or descendants"]
        ])
      },
      {
        label: "Legendary foe",
        entries: table([
          [1, "an ancient dragon"],
          [1, "a demon prince"],
          [1, "a lich or necromancer"],
          [1, "a titan or elemental"],
          [1, "a warlord or tyrant"],
          [1, "a cult"],
          [1, "an enchanter"],
          [1, "an archmage"]
        ])
      }
    ],
    areaTypes: table<AreaTypeEntry>([
      [4, { source: "caves" }],
      [2, { source: "prison" }],
      [2, { source: "mine" }],
      [4, { source: "crypt" }],
      [2, { source: "stronghold" }],
      [3, { source: "temple" }],
      [1, { source: "laboratory" }],
      [2, { special: true }]
    ]),
    dressing: [
      "nothing unusual",
      "dust, cobwebs or mould",
      "stains, scratches or scorch marks",
      "a strange smell",
      "strange sounds",
      "a draft",
      "an explorer's remains",
      "a mural or relief",
      "glyphs and markings",
      "two details combined"
    ],
    connections: {
      directions: commonDirections(2, 2, 6, 4, 4, 2),
      forms: [
        "dead-end passage",
        "secret door",
        "door",
        "archway",
        "passage",
        "passage",
        "fissure or pit",
        "ladder or trapdoor",
        "stair",
        "stair",
        "elevator or lift",
        "teleporter or portal"
      ]
    },
    specialAreas: table<SpecialAreaEntry>([
      [3, { source: "caves" }],
      [1, { source: "prison" }],
      [1, { source: "mine" }],
      [3, { source: "crypt" }],
      [1, { source: "stronghold" }],
      [3, { source: "temple" }],
      [3, { source: "laboratory" }],
      [1, "hall of an aspect"],
      [1, "vault of an element"],
      [1, "chamber of a strange feature"],
      [1, "sanctum"],
      [1, "treasure vault"]
    ]),
    discoveries: {
      features: [
        "pit or fissure",
        "firepit or braziers",
        "chains or ropes",
        "obstacle or puzzle",
        "sloping floor",
        "multi-level space",
        "niches and alcoves",
        "statues or pillars",
        "well or pool",
        "chokepoint",
        "levers or controls",
        "bridge or ledge"
      ],
      finds: [
        "a creature's lair",
        "evidence of a creature",
        "1d4+1 rival explorers",
        "a message or omen",
        "a mechanical apparatus",
        "an idol or altar",
        "a lever, switch or key",
        "a map or clue",
        "1d4 personal items",
        "a treasure cache (1d6+1)",
        "a treasure cache (1d8+1)",
        "a treasure cache (1d10+1)"
      ]
    }
  }
};

export const DUNGEON_DANGER_CATEGORIES: readonly string[] = table([
  [1, "leader"],
  [11, "creature"],
  [8, "hazard"]
]);

export const DUNGEON_LEADER_KINDS: readonly string[] = table([
  [1, "monstrous"],
  [7, "humanoid"],
  [4, "human"]
]);

export const DUNGEON_LEADERS = {
  monstrous: [
    "vermin lord",
    "wraith or ghost",
    "wraith or ghost",
    "undead lieutenant",
    "undead lieutenant",
    "undead lord",
    "demon",
    "monster lord",
    "demon lord",
    "alien interloper"
  ],
  humanoid: [
    "scavenger or robber",
    "wanted criminal",
    "bandit or mercenary chief",
    "adventurer",
    "shaman or cultist",
    "high priest or oracle",
    "sage or alchemist",
    "chief or lord",
    "warchief or warlord",
    "wizard or witch"
  ],
  human: [
    "scavenger or robber",
    "wanted criminal",
    "bandit or mercenary chief",
    "adventurer",
    "shaman or cultist",
    "high priest or oracle",
    "sage or alchemist",
    "chief or lord",
    "warchief or warlord",
    "wizard or witch"
  ]
} as const;

export const DUNGEON_MONSTERS: readonly string[] = [
  "extraplanar lord",
  "legendary beast",
  "undead horror",
  "undead horror",
  "elemental",
  "elemental",
  "ooze, plant or parasite",
  "construct or fey",
  "dragon or giant",
  "strange horror"
];

export const DUNGEON_ANIMALS = {
  water: [
    "whale or narwhal",
    "squid or octopus",
    "shark or alligator",
    "turtle or crab",
    "eel or snake",
    "frog or toad",
    "jelly or anemone",
    "barnacle or insect"
  ],
  air: [
    "pteranodon or condor",
    "eagle or owl",
    "heron or crane",
    "crow or raven",
    "songbird or parrot",
    "duck or goose",
    "wasp or locust",
    "moth or mosquito"
  ],
  earth: [
    "dinosaur or elephant",
    "bear or ape",
    "deer or horse",
    "wolf or boar",
    "snake or lizard",
    "rat or weasel",
    "centipede or scorpion",
    "worm or beetle"
  ]
} as const;

export const DUNGEON_HUMANOIDS: readonly string[] = [
  "a rare heritage",
  "a dwarven folk",
  "a dwarven folk",
  "a halfling folk",
  "a mixed group",
  "people of [culture]",
  "people of [culture]",
  "people of [culture]",
  "people of [culture]",
  "a mixed group"
];

export const DUNGEON_HAZARD_KINDS: readonly string[] = table([
  [1, "unnatural"],
  [7, "natural"],
  [4, "trap"]
]);

export const DUNGEON_HAZARDS = {
  unnatural: [
    "demonic power",
    "mind control",
    "blight or curse",
    "mimicry",
    "planar power ([element])",
    "magical power ([magic])",
    "magical power ([magic])",
    "magical power ([magic])",
    "divine test",
    "divine test"
  ],
  natural: [
    "cave-in",
    "poison or disease",
    "pitfall",
    "treacherous footing",
    "precarious position",
    "vulnerable position",
    "fog or smoke",
    "structural weakness",
    "tight space",
    "two natural hazards combined"
  ],
  trap: [
    "ambush or alarm",
    "pit trap",
    "ensnaring or paralyzing",
    "crushing or piercing",
    "asphyxiating",
    "soporific or confusing",
    "poison or disease",
    "element-based ([element])",
    "magic-based ([magic])",
    "two traps combined"
  ]
} as const;

export const DUNGEON_DETAILS = {
  adjectives: [
    "slick",
    "rough",
    "smooth",
    "corroded",
    "rotten",
    "broken",
    "stinking",
    "drained",
    "strong",
    "pale",
    "dark",
    "colorful"
  ],
  activities: [
    "laying a trap",
    "fighting",
    "on patrol",
    "hunting",
    "resting",
    "arguing",
    "exploring",
    "trading",
    "fleeing",
    "excavating",
    "sleeping",
    "dying"
  ],
  conditions: [
    "being built",
    "intact",
    "alert",
    "weathered",
    "vacant",
    "damaged",
    "broken",
    "flooded",
    "overgrown",
    "burned",
    "frozen",
    "restored"
  ],
  elements: [
    "void",
    "death or darkness",
    "fire, metal or smoke",
    "fire, metal or smoke",
    "earth, stone or vegetation",
    "earth, stone or vegetation",
    "water, ice or mist",
    "water, ice or mist",
    "air, wind or storm",
    "air, wind or storm",
    "life or light",
    "stars or cosmos"
  ],
  magic: [
    "necromancy",
    "evocation",
    "evocation",
    "summoning",
    "illusion",
    "enchantment",
    "transformation",
    "warding",
    "elemental magic ([element])",
    "elemental magic ([element])",
    "restoration",
    "divination"
  ],
  strange: [
    "garish",
    "geometric",
    "weblike",
    "crystalline",
    "fungal",
    "misty",
    "volcanic",
    "magnetic",
    "tiered",
    "impossible",
    "dreamlike",
    "shifting"
  ],
  aspects: ["war", "hate", "power", "trickery", "time", "lore", "nature", "culture", "luck", "love", "peace", "glory"]
} as const;

export const DUNGEON_RUMOR_TEMPLATES = [
  "The people of [culture] say [name] is [cause].",
  "A traveler claims lights burn beneath [name].",
  "Hunters avoid the [biome] around [name].",
  "They say [name] was built by [builder].",
  "A local elder warns that [theme] rules [name].",
  "Someone has offered coin for a map to [name].",
  "The road to [name] is watched, and no one agrees by whom.",
  "A drunken guide swears the entrance to [name] moves when no one looks."
] as const;
