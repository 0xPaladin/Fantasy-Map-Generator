// Generic bandit tables for brigand/pirate marker profiles. All strings are original.
import type { InhabitantGroupId } from "@/data/inhabitants";
import type { TreasureWeights } from "@/data/treasure";

export type GangSize = "handful" | "band" | "company" | "crew";

export interface GangSizeRow {
  size: GangSize;
  label: string;
  weight: number;
  count: string;
  encounterBonus: number;
}

export const GANG_SIZES: readonly GangSizeRow[] = [
  { size: "handful", label: "a handful", weight: 30, count: "1d4+1", encounterBonus: 0 },
  { size: "band", label: "a band", weight: 40, count: "1d6+4", encounterBonus: 1 },
  { size: "company", label: "a company", weight: 20, count: "2d6+6", encounterBonus: 2 },
  { size: "crew", label: "a crew", weight: 10, count: "2d6+4", encounterBonus: 2 }
];

export const GANG_COMPOSITIONS: readonly string[] = [
  "locals",
  "outcasts",
  "deserters",
  "cultists",
  "a mixed rabble",
  "foreigners",
  "broken soldiers"
];

export const BANDIT_LEADERS: readonly string[] = [
  "a scarred captain",
  "a fallen knight",
  "a cunning smuggler",
  "a brutal warlord",
  "a charismatic preacher",
  "a masked thief",
  "a veteran sergeant"
];

export const LEADER_TRAITS: readonly string[] = [
  "cruel",
  "cunning",
  "charismatic",
  "desperate",
  "honorable",
  "paranoid",
  "greedy",
  "zealous"
];

export const BANDIT_LOCALITIES: readonly string[] = [
  "highlander",
  "desert",
  "mounted",
  "forest",
  "swamp",
  "angry",
  "coastal"
];

export const BANDIT_BASES: readonly string[] = [
  "a camp",
  "a hideout",
  "a wreck",
  "an island",
  "a fortlet",
  "a cave",
  "an anchorage"
];

export const RAID_PREY: readonly string[] = [
  "merchant traffic",
  "market roads",
  "sea routes",
  "isolated farms",
  "pilgrims",
  "tax collectors"
];

export const RAID_TACTICS: readonly string[] = [
  "ambush",
  "blockade",
  "boarding",
  "extortion",
  "a night raid",
  "a false parley"
];

export const CONTRABAND: readonly string[] = [
  "stolen coin",
  "smuggled goods",
  "forbidden relics",
  "captives",
  "spoiled cargo",
  "weapons"
];

export const BANDIT_TREASURE: TreasureWeights = { bullion: 3, regalia: 1, art: 2, relics: 1 };

export const BANDIT_INHABITANTS: Partial<Record<InhabitantGroupId, number>> = {
  humans: 4,
  humanoids: 2,
  beasts: 1
};

export const BANDIT_WEAPONS: readonly string[] = [
  "swords",
  "spears",
  "bows",
  "axes",
  "daggers",
  "crossbows",
  "clubs",
  "boarding pikes"
];

export const BANDIT_WANTS: readonly string[] = [
  "to take the next rich prize",
  "to keep the crew fed",
  "to evade the law",
  "to build a feared name",
  "to avenge a fallen mate",
  "to buy a pardon"
];

export const BANDIT_MOVES: readonly string[] = [
  "demand a toll",
  "set an ambush on the road",
  "board and seize",
  "burn what they cannot take",
  "scatter when outmatched",
  "parley for a bigger score",
  "take hostages",
  "vanish into the hills"
];

export const BANDIT_RUMORS: readonly string[] = [
  "The people of [culture] pay [name] to leave their carts alone.",
  "They say [name] is led by [leader].",
  "[name] strikes the [locality] roads and is gone before the watch arrives.",
  "A [culture] merchant swears [name] takes only half, and calls it mercy.",
  "The [biome] hides [name]'s base, and no one has found it.",
  "Someone in the village is feeding [name] word of the caravans."
];
