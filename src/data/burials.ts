// Generic burial and necropolis tables for marker profiles
import type { DungeonTypeId } from "@/data/dungeons";
import type { InhabitantGroupId } from "@/data/inhabitants";
import type { TreasureModifier, TreasureWeights } from "@/data/treasure";

export type BurialKind = "grave" | "cairn" | "barrow" | "graveyard" | "crypt" | "ossuary" | "mass-grave";

export interface BurialKindRow {
  kind: BurialKind;
  label: string;
  weight: number;
  scale: number;
  zones: readonly [number, number];
  dungeon: boolean;
  dungeonType?: DungeonTypeId;
}

export const BURIAL_KINDS: readonly BurialKindRow[] = [
  { kind: "grave", label: "a single grave", weight: 25, scale: 2, zones: [3, 4], dungeon: false },
  { kind: "cairn", label: "a cairn", weight: 15, scale: 3, zones: [3, 4], dungeon: false },
  { kind: "barrow", label: "a barrow", weight: 20, scale: 4, zones: [4, 5], dungeon: true, dungeonType: "crypt" },
  { kind: "graveyard", label: "a graveyard", weight: 15, scale: 4, zones: [4, 6], dungeon: false },
  { kind: "crypt", label: "a crypt", weight: 10, scale: 6, zones: [4, 6], dungeon: true, dungeonType: "crypt" },
  { kind: "ossuary", label: "an ossuary", weight: 8, scale: 6, zones: [4, 6], dungeon: true, dungeonType: "crypt" },
  {
    kind: "mass-grave",
    label: "a mass grave",
    weight: 7,
    scale: 8,
    zones: [5, 7],
    dungeon: true,
    dungeonType: "crypt"
  }
];

export const BURIAL_WHO: readonly string[] = [
  "a family line",
  "soldiers of a lost war",
  "plague dead",
  "a saint or founder",
  "nameless villagers",
  "a noble house",
  "sacrificed captives",
  "an order of monks",
  "children of a famine",
  "unknown dead"
];

export const BURIAL_CUSTOMS: readonly string[] = [
  "inhumation",
  "cremation",
  "exposure",
  "ossuary stacking",
  "barrow burial",
  "tomb interment",
  "a plague pit",
  "river burial",
  "sky burial",
  "a sealed crypt"
];

export const BURIAL_DISTURBANCES: readonly string[] = [
  "grave robbery",
  "war",
  "plague",
  "construction",
  "flood",
  "a broken ward",
  "necromancy",
  "a curse",
  "root and soil",
  "unknown"
];

export const BURIAL_ACTIVITIES: readonly string[] = [
  "the dead rise at night",
  "restless shades wander",
  "bound guardians stir",
  "bones knit together",
  "a cold wind speaks",
  "the ground breathes",
  "quiet, but wrong",
  "the dead watch"
];

export const BURIAL_WARDS: readonly string[] = [
  "a cracked ward stone",
  "salt lines",
  "iron nails",
  "a broken seal",
  "prayer knots",
  "a buried icon",
  "ash circles",
  "a forgotten oath",
  "no ward remains",
  "a silver chain"
];

export const BURIAL_ZONE_TYPES: readonly string[] = [
  "grave",
  "mound",
  "crypt door",
  "ossuary niche",
  "ward stone",
  "disturbed earth",
  "memorial",
  "bone pit",
  "burial chamber",
  "grave marker",
  "offering niche",
  "collapsed vault"
];

export const BURIAL_ZONE_CONDITIONS: readonly string[] = [
  "intact",
  "cracked",
  "collapsed",
  "overgrown",
  "burned",
  "flooded",
  "buried",
  "picked clean",
  "disturbed",
  "sealed"
];

export const BURIAL_DISCOVERIES: readonly string[] = [
  "a grave good",
  "a broken coffin",
  "a name plaque",
  "a sealed urn",
  "a bone key",
  "a funerary mask",
  "a treasure cache (1d6+1)",
  "a mourning figurine",
  "a ledger of the dead",
  "a hidden niche"
];

export const BURIAL_DANGERS: readonly string[] = [
  "a rising corpse",
  "a grasping hand",
  "a wailing shade",
  "a bone swarm",
  "a cursed inscription",
  "a collapsing vault",
  "a grave trap",
  "a cold spot",
  "a restless guardian",
  "a necromantic sigil"
];

export const BURIAL_EXITS: readonly string[] = [
  "a crypt stair",
  "a broken door",
  "a grave opening",
  "a bone passage",
  "a sealed vault",
  "a collapsed arch",
  "a narrow niche",
  "a memorial gate"
];

export const BURIAL_SECRETS: readonly string[] = [
  "One grave was never meant to be opened.",
  "A name is missing from every marker.",
  "The ward binds something older than the dead.",
  "A hidden chamber holds the real burial.",
  "The disturbance was deliberate, and recent.",
  "Something below still answers to its old name."
];

export const BURIAL_RUMORS: readonly string[] = [
  "The people of [culture] give [name] a wide berth.",
  "They say [name] holds [who].",
  "Grave robbers swear [name] was already empty when they broke in.",
  "A [culture] elder claims the dead at [name] are not at rest.",
  "The [biome] around [name] never freezes, even in winter.",
  "Someone has been leaving offerings at [name] again."
];

export const BURIAL_TREASURE_BASE: TreasureWeights = { bullion: 1, regalia: 3, art: 2, relics: 4 };

export const BURIAL_CAUSE_TREASURE_MODIFIERS: readonly TreasureModifier[] = [
  { pattern: /war|battle/i, weights: { regalia: 1, bullion: 1 } },
  { pattern: /plague|famine/i, weights: { bullion: -1, art: -1, relics: 1 } },
  { pattern: /curse|necromancy/i, weights: { relics: 2, art: 1 } },
  { pattern: /flood|construction/i, weights: { art: -1, bullion: -1 } }
];

export const BURIAL_LOOTED_TREASURE_MODIFIERS: readonly TreasureModifier[] = [
  { pattern: /looted|robbery/i, weights: { bullion: -2, regalia: -1, art: -1, relics: 1 } }
];

export const BURIAL_CAUSE_WEIRDNESS: readonly { pattern: RegExp; value: number }[] = [
  { pattern: /curse|necromancy/i, value: 3 },
  { pattern: /plague|famine/i, value: 1 },
  { pattern: /unknown/i, value: 2 },
  { pattern: /broken ward/i, value: 1 }
];

export const BURIAL_KIND_EMPTY_CHANCE: Record<BurialKind, number> = {
  grave: 0.1,
  cairn: 0.08,
  barrow: 0.05,
  graveyard: 0.1,
  crypt: 0.05,
  ossuary: 0.05,
  "mass-grave": 0.02
};

export const BURIAL_KIND_INHABITANT_BASE: Record<BurialKind, number> = {
  grave: 2,
  cairn: 2,
  barrow: 3,
  graveyard: 3,
  crypt: 3,
  ossuary: 3,
  "mass-grave": 4
};

export const BURIAL_KIND_INHABITANTS: Record<BurialKind, Partial<Record<InhabitantGroupId, number>>> = {
  grave: { undead: 5, vermin: 2, humans: 1, constructs: 1 },
  cairn: { undead: 4, vermin: 2, beasts: 1, constructs: 1, fey: 1 },
  barrow: { undead: 5, constructs: 2, vermin: 1, humans: 1, fey: 1 },
  graveyard: { undead: 4, vermin: 2, fey: 2, humans: 1, constructs: 1 },
  crypt: { undead: 5, constructs: 3, vermin: 1, outsiders: 1 },
  ossuary: { undead: 5, constructs: 2, vermin: 2, outsiders: 1 },
  "mass-grave": { undead: 6, constructs: 1, vermin: 1, outsiders: 1, fey: 1 }
};

export type NecropolisTier = "graveyard" | "cemetery" | "crypt-complex" | "necropolis" | "city-of-the-dead";

export interface NecropolisTierRow {
  tier: NecropolisTier;
  weight: number;
  scale: number;
  sites: readonly [number, number];
  dungeonSites: readonly [number, number];
}

export const NECROPOLIS_TIERS: readonly NecropolisTierRow[] = [
  { tier: "graveyard", weight: 35, scale: 2, sites: [1, 1], dungeonSites: [0, 0] },
  { tier: "cemetery", weight: 30, scale: 4, sites: [1, 2], dungeonSites: [0, 1] },
  { tier: "crypt-complex", weight: 20, scale: 6, sites: [2, 3], dungeonSites: [1, 1] },
  { tier: "necropolis", weight: 12, scale: 8, sites: [3, 5], dungeonSites: [1, 2] },
  { tier: "city-of-the-dead", weight: 3, scale: 10, sites: [4, 6], dungeonSites: [2, 3] }
];

export type NecropolisSiteKind =
  | "mausoleum"
  | "sepulchre"
  | "catacomb"
  | "ossuary"
  | "mortuary-temple"
  | "tomb-district"
  | "grave-field"
  | "gate"
  | "walls"
  | "memorial";

export interface NecropolisSiteType {
  kind: NecropolisSiteKind;
  label: string;
  dungeonType?: DungeonTypeId;
  zones: readonly string[];
}

export const NECROPOLIS_SITE_TYPES: readonly NecropolisSiteType[] = [
  {
    kind: "mausoleum",
    label: "Mausoleum",
    dungeonType: "crypt",
    zones: ["gate", "vestibule", "burial chamber", "reliquary", "sealed vault", "catacomb stair"]
  },
  {
    kind: "sepulchre",
    label: "Sepulchre",
    dungeonType: "crypt",
    zones: ["threshold", "burial chamber", "false vault", "reliquary", "sealed door", "niche"]
  },
  {
    kind: "catacomb",
    label: "Catacomb",
    dungeonType: "crypt",
    zones: ["stair", "corridor", "burial niche", "ossuary", "collapsed gallery", "sealed door"]
  },
  {
    kind: "ossuary",
    label: "Ossuary",
    dungeonType: "caves",
    zones: ["stair", "bone chamber", "niche", "cistern", "sealed door", "flooded gallery"]
  },
  {
    kind: "mortuary-temple",
    label: "Mortuary temple",
    dungeonType: "temple",
    zones: ["gate", "nave", "shrine", "altar", "crypt", "cloister", "bell tower"]
  },
  {
    kind: "tomb-district",
    label: "Tomb district",
    dungeonType: "crypt",
    zones: ["street", "tomb door", "burial chamber", "reliquary", "sealed vault", "memorial"]
  },
  { kind: "grave-field", label: "Grave field", zones: ["grave", "marker", "path", "well", "memorial"] },
  { kind: "gate", label: "Gate", zones: ["gate", "wall", "threshold", "guard niche"] },
  { kind: "walls", label: "Walls", zones: ["wall", "tower", "gate", "collapsed stretch"] },
  { kind: "memorial", label: "Memorial", zones: ["plinth", "inscription", "offering niche", "steps"] }
];

export const NECROPOLIS_CAUSES: readonly string[] = [
  "war",
  "plague",
  "curse",
  "abandonment",
  "necromancy",
  "famine",
  "unknown"
];

export const NECROPOLIS_AGES: readonly string[] = [
  "older than living memory",
  "three centuries old",
  "from the last age",
  "from before the current calendar",
  "from a forgotten age"
];

export const NECROPOLIS_SURFACE_STATES: readonly string[] = [
  "overgrown",
  "collapsed",
  "flooded",
  "burned",
  "quiet",
  "occupied by cults",
  "picked clean",
  "half-buried"
];

export const NECROPOLIS_ZONE_TYPES: readonly string[] = [
  "gate",
  "grave field",
  "mausoleum",
  "catacomb entrance",
  "mortuary temple",
  "ossuary",
  "tomb district",
  "memorial",
  "wall",
  "bone pit",
  "processional way",
  "sealed vault"
];

export const NECROPOLIS_ZONE_CONDITIONS: readonly string[] = [
  "intact",
  "cracked",
  "collapsed",
  "overgrown",
  "burned",
  "flooded",
  "buried",
  "picked clean",
  "sealed",
  "quiet"
];

export const NECROPOLIS_DISCOVERIES: readonly string[] = [
  "a funerary mask",
  "a sealed urn",
  "a name plaque",
  "a bone key",
  "a treasure cache (1d6+1)",
  "a ledger of the dead",
  "a mourning figurine",
  "a hidden niche",
  "a broken sarcophagus",
  "a relic of the founders"
];

export const NECROPOLIS_DANGERS: readonly string[] = [
  "a restless guardian",
  "a bone swarm",
  "a wailing shade",
  "a cursed inscription",
  "a collapsing vault",
  "a grave trap",
  "a cold spot",
  "a necromantic sigil",
  "a cult lookout",
  "a rising corpse"
];

export const NECROPOLIS_EXITS: readonly string[] = [
  "a crypt stair",
  "a broken door",
  "a catacomb passage",
  "a sealed vault",
  "a collapsed arch",
  "a memorial gate",
  "a bone passage",
  "a processional way"
];

export const NECROPOLIS_REMAINS: readonly string[] = [
  "a collapsed [zone]",
  "a [zone] open to the sky",
  "a [zone] half-filled with rubble",
  "a [zone] still marked by [culture] stone",
  "a [zone] with a sealed lower door",
  "a [zone] lined with empty niches"
];

export const NECROPOLIS_SECRETS: readonly string[] = [
  "A sealed undercroft survives beneath the main tomb.",
  "One wall is a disguised door into a forgotten chamber.",
  "A record of the original dead is hidden in the necropolis.",
  "Something in the deepest chamber still answers to its old name.",
  "A survivor's cache holds a key to a door nobody has found.",
  "The necropolis's true entrance is not the obvious one."
];

export const NECROPOLIS_RUMORS: readonly string[] = [
  "The people of [culture] call it [name].",
  "They say [name] fell to [cause].",
  "Grave robbers avoid the [biome] around [name].",
  "A [culture] elder claims something still walks beneath [name].",
  "Treasure hunters have offered coin for a map to [name].",
  "The road to [name] is watched, and no one agrees by whom."
];

export const NECROPOLIS_TREASURE_BASE: TreasureWeights = { bullion: 1, regalia: 4, art: 2, relics: 4 };

export const NECROPOLIS_CAUSE_TREASURE_MODIFIERS: readonly TreasureModifier[] = [
  { pattern: /war|siege/i, weights: { regalia: 1, bullion: 1 } },
  { pattern: /plague|famine|abandon/i, weights: { bullion: -1, art: -1, relics: 1 } },
  { pattern: /curse|necromancy/i, weights: { relics: 2, art: 1 } },
  { pattern: /unknown/i, weights: { relics: 1 } }
];

export const NECROPOLIS_CAUSE_WEIRDNESS: readonly { pattern: RegExp; value: number }[] = [
  { pattern: /curse|necromancy/i, value: 3 },
  { pattern: /plague|famine/i, value: 1 },
  { pattern: /unknown/i, value: 2 }
];

export const NECROPOLIS_TIER_EMPTY_CHANCE: Record<NecropolisTier, number> = {
  graveyard: 0.3,
  cemetery: 0.2,
  "crypt-complex": 0.15,
  necropolis: 0.1,
  "city-of-the-dead": 0.05
};

export const NECROPOLIS_TIER_INHABITANT_BASE: Record<NecropolisTier, number> = {
  graveyard: 1,
  cemetery: 2,
  "crypt-complex": 2,
  necropolis: 3,
  "city-of-the-dead": 3
};

export const NECROPOLIS_TIER_INHABITANTS: Record<NecropolisTier, Partial<Record<InhabitantGroupId, number>>> = {
  graveyard: { undead: 4, vermin: 3, fey: 2, beasts: 1 },
  cemetery: { undead: 5, vermin: 2, fey: 2, constructs: 1, humans: 1 },
  "crypt-complex": { undead: 5, constructs: 3, vermin: 1, humans: 1, outsiders: 1 },
  necropolis: { undead: 5, constructs: 3, humans: 2, vermin: 1, outsiders: 1, fey: 1 },
  "city-of-the-dead": { undead: 6, constructs: 3, humans: 2, outsiders: 2, vermin: 1, fey: 1 }
};
