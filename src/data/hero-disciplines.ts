// Three discipline tags per hero stand in for a skill spreadsheet. A matching discipline is
// one bounded +1 to the unified check; see docs/plans/hero-diversity.md.
import type { DisciplineId, HeroPool, MissionTag } from "@/types/living";

export interface DisciplineDef {
  id: DisciplineId;
  name: string;
  pool: HeroPool;
  tags: readonly MissionTag[];
  description: string;
}

export const HERO_DISCIPLINES: Record<DisciplineId, DisciplineDef> = {
  court_etiquette: {
    id: "court_etiquette",
    name: "Court Etiquette",
    pool: "s",
    tags: ["social", "petition", "intrigue"],
    description: "Manners, precedence and the unspoken rules of a ruler's hall."
  },
  persuasion: {
    id: "persuasion",
    name: "Persuasion",
    pool: "s",
    tags: ["social", "petition"],
    description: "Turning a hostile room with argument, flattery and timing."
  },
  planar_lore: {
    id: "planar_lore",
    name: "Planar Lore",
    pool: "w",
    tags: ["arcane", "ruin"],
    description: "The geography of other worlds and the things that cross between them."
  },
  athletics: {
    id: "athletics",
    name: "Athletics",
    pool: "m",
    tags: ["combat", "travel", "wild"],
    description: "Climbing, swimming and forcing a path where none exists."
  },
  barter: {
    id: "barter",
    name: "Barter",
    pool: "w",
    tags: ["social", "petition"],
    description: "Reading a market and leaving with the better half of the bargain."
  },
  tongues: {
    id: "tongues",
    name: "Tongues",
    pool: "s",
    tags: ["social", "intrigue", "travel"],
    description: "Dead languages, border dialects and the courtesy of being understood."
  },
  artifice: {
    id: "artifice",
    name: "Artifice",
    pool: "c",
    tags: ["trap", "ruin", "lair"],
    description: "Locks, engines, buried mechanisms and the safe way past them."
  },
  archery: {
    id: "archery",
    name: "Archery",
    pool: "m",
    tags: ["combat", "lair", "wild"],
    description: "The bow at range, where courage matters less than breath."
  },
  siegecraft: {
    id: "siegecraft",
    name: "Siegecraft",
    pool: "m",
    tags: ["combat", "lair", "order"],
    description: "Walls, engines and the patient arithmetic of breaking them."
  },
  investigate: {
    id: "investigate",
    name: "Investigate",
    pool: "c",
    tags: ["ruin", "intrigue", "trap"],
    description: "Following a story through archives, witnesses and rubble."
  },
  healing: {
    id: "healing",
    name: "Healing",
    pool: "s",
    tags: ["plague", "order"],
    description: "Wounds, fevers and the practical mercy of clean water."
  },
  melee: {
    id: "melee",
    name: "Melee",
    pool: "m",
    tags: ["combat", "lair"],
    description: "Blade, shield and the space of a single breath."
  },
  brawling: {
    id: "brawling",
    name: "Brawling",
    pool: "m",
    tags: ["combat", "social"],
    description: "Unarmed violence in taverns, alleys and muddy camps."
  },
  ride: {
    id: "ride",
    name: "Ride",
    pool: "m",
    tags: ["travel", "wild", "combat"],
    description: "Horse, road and the endurance to arrive first."
  },
  scout: {
    id: "scout",
    name: "Scout",
    pool: "c",
    tags: ["wild", "travel", "ruin"],
    description: "Reading ground, tracks and the shape of a hidden camp."
  },
  nature_lore: {
    id: "nature_lore",
    name: "Nature Lore",
    pool: "w",
    tags: ["wild", "plague", "travel"],
    description: "Beasts, plants, weather and the old agreements between them."
  },
  alchemy: {
    id: "alchemy",
    name: "Alchemy",
    pool: "w",
    tags: ["plague", "trap", "arcane"],
    description: "Distillation, poison and the controlled violence of reagents."
  },
  perception: {
    id: "perception",
    name: "Perception",
    pool: "c",
    tags: ["trap", "intrigue", "lair"],
    description: "Noticing the wrong detail before it notices you."
  },
  stealth: {
    id: "stealth",
    name: "Stealth",
    pool: "c",
    tags: ["intrigue", "lair", "ruin"],
    description: "Moving through a guarded place without becoming part of its story."
  },
  survival: {
    id: "survival",
    name: "Survival",
    pool: "w",
    tags: ["wild", "travel"],
    description: "Fire, shelter and rationing when the road runs longer than planned."
  },
  tactics: {
    id: "tactics",
    name: "Tactics",
    pool: "m",
    tags: ["combat", "lair", "order"],
    description: "Ground, timing and the discipline to hold a line."
  },
  arcana: {
    id: "arcana",
    name: "Arcana",
    pool: "c",
    tags: ["arcane", "curse", "ruin"],
    description: "General theory of magic: signs, correspondences and costs."
  },
  arcana_evocation: {
    id: "arcana_evocation",
    name: "Evocation",
    pool: "c",
    tags: ["arcane", "combat"],
    description: "Calling raw force into the world and surviving the answer."
  },
  arcana_nature: {
    id: "arcana_nature",
    name: "Nature Magic",
    pool: "w",
    tags: ["arcane", "wild", "plague"],
    description: "Bargains with growing things, weather and the wild places."
  },
  arcana_holy: {
    id: "arcana_holy",
    name: "Holy Magic",
    pool: "s",
    tags: ["arcane", "curse", "undead", "order"],
    description: "Rites of blessing, consecration and permitted miracles."
  },
  arcana_abjuration: {
    id: "arcana_abjuration",
    name: "Abjuration",
    pool: "s",
    tags: ["arcane", "curse", "undead"],
    description: "Wards, circles and the refusal of a hostile presence."
  },
  arcana_divination: {
    id: "arcana_divination",
    name: "Divination",
    pool: "c",
    tags: ["arcane", "intrigue", "ruin"],
    description: "Reading signs, dreams and the thin edge of what comes next."
  },
  arcana_necromancy: {
    id: "arcana_necromancy",
    name: "Necromancy",
    pool: "c",
    tags: ["arcane", "undead", "curse"],
    description: "The stubborn business of asking the dead a direct question."
  },
  arcana_illusion: {
    id: "arcana_illusion",
    name: "Illusion",
    pool: "c",
    tags: ["arcane", "intrigue", "social"],
    description: "Making a room believe what it already expects to see."
  },
  arcana_transmutation: {
    id: "arcana_transmutation",
    name: "Transmutation",
    pool: "w",
    tags: ["arcane", "plague", "trap"],
    description: "Changing one substance into another, carefully and not always safely."
  },
  arcana_enchantment: {
    id: "arcana_enchantment",
    name: "Enchantment",
    pool: "s",
    tags: ["arcane", "social", "intrigue"],
    description: "Binding intent into a person, a place or a made thing."
  },
  arcana_shadow: {
    id: "arcana_shadow",
    name: "Shadow Magic",
    pool: "c",
    tags: ["arcane", "curse", "intrigue"],
    description: "The magic that prefers to be owed rather than named."
  }
};

/** Disciplines whose tags overlap the target, in the hero's listed order. */
export function matchingDisciplines(
  disciplines: readonly DisciplineId[] | undefined,
  tags: readonly MissionTag[]
): DisciplineId[] {
  if (!disciplines?.length || tags.length === 0) return [];
  const wanted = new Set(tags);
  return disciplines.filter(id => HERO_DISCIPLINES[id]?.tags.some(tag => wanted.has(tag)));
}

/** +1 per matching discipline, capped at +2. */
export function disciplineBonus(disciplines: readonly DisciplineId[] | undefined, tags: readonly MissionTag[]): number {
  return Math.min(2, matchingDisciplines(disciplines, tags).length);
}
