// Only the first virtue and first vice are active. They add at most one point either way;
// every other trait stays narrative. See docs/plans/hero-diversity.md.
import type { MissionTag } from "@/types/living";

export interface HeroAspect {
  trait: string;
  tags: readonly MissionTag[];
  modifier: 1 | -1;
  note: string;
}

const TAG_LABELS: Record<string, string> = {
  combat: "combat",
  lair: "lairs",
  ruin: "ruins",
  wild: "the wild",
  travel: "travel",
  arcane: "arcane sites",
  curse: "curses",
  plague: "plague",
  undead: "the undead",
  social: "social encounters",
  petition: "petitions",
  intrigue: "intrigue",
  trap: "traps",
  order: "order",
  trouble: "troubles"
};

function label(tag: MissionTag): string {
  if (tag.startsWith("save:")) return tag.slice(5);
  if (tag.startsWith("role:")) return tag.slice(5);
  return TAG_LABELS[tag] ?? tag;
}

function aspect(trait: string, modifier: 1 | -1, tags: readonly MissionTag[]): HeroAspect {
  const joined = tags.map(label).join(" or ");
  return {
    trait,
    tags,
    modifier,
    note: `${capitalize(trait)}: ${modifier > 0 ? "+1" : "-1"} when facing ${joined}.`
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const HERO_ASPECTS: Record<string, HeroAspect> = {
  brave: aspect("brave", 1, ["combat", "lair"]),
  daring: aspect("daring", 1, ["combat", "lair"]),
  decisive: aspect("decisive", 1, ["combat", "lair"]),
  prudent: aspect("prudent", 1, ["ruin", "trap"]),
  methodical: aspect("methodical", 1, ["ruin", "trap"]),
  meticulous: aspect("meticulous", 1, ["ruin", "trap"]),
  observant: aspect("observant", 1, ["ruin", "arcane", "intrigue"]),
  curious: aspect("curious", 1, ["ruin", "arcane", "intrigue"]),
  wise: aspect("wise", 1, ["ruin", "arcane", "intrigue"]),
  eloquent: aspect("eloquent", 1, ["social", "petition", "intrigue"]),
  tactful: aspect("tactful", 1, ["social", "petition", "intrigue"]),
  courteous: aspect("courteous", 1, ["social", "petition", "intrigue"]),
  loyal: aspect("loyal", 1, ["order", "social"]),
  protective: aspect("protective", 1, ["order", "social"]),
  selfless: aspect("selfless", 1, ["order", "social"]),
  resourceful: aspect("resourceful", 1, ["wild", "travel"]),
  adaptable: aspect("adaptable", 1, ["wild", "travel"]),
  ingenious: aspect("ingenious", 1, ["wild", "travel"]),
  just: aspect("just", 1, ["order", "social"]),
  fair: aspect("fair", 1, ["order", "social"]),
  disciplined: aspect("disciplined", 1, ["order", "trouble"]),
  steadfast: aspect("steadfast", 1, ["order", "trouble"]),
  dependable: aspect("dependable", 1, ["order", "trouble"]),
  honest: aspect("honest", 1, ["social", "petition"]),
  sincere: aspect("sincere", 1, ["social", "petition"]),
  generous: aspect("generous", 1, ["social", "petition"]),
  charitable: aspect("charitable", 1, ["social", "petition"]),
  reverent: aspect("reverent", 1, ["arcane", "curse"]),
  faithful: aspect("faithful", 1, ["arcane", "curse"]),
  zealous: aspect("zealous", 1, ["arcane", "curse"]),
  merciful: aspect("merciful", 1, ["plague", "social"]),
  compassionate: aspect("compassionate", 1, ["plague", "social"]),
  kind: aspect("kind", 1, ["plague", "social"]),
  patient: aspect("patient", 1, ["plague", "order"]),
  serene: aspect("serene", 1, ["plague", "order"]),
  temperate: aspect("temperate", 1, ["plague", "order"]),
  thoughtful: aspect("thoughtful", 1, ["social", "travel"]),
  hopeful: aspect("hopeful", 1, ["social", "travel"]),
  cheerful: aspect("cheerful", 1, ["social", "travel"]),
  witty: aspect("witty", 1, ["social", "intrigue"]),
  playful: aspect("playful", 1, ["social", "travel"]),
  thrifty: aspect("thrifty", 1, ["petition", "social"]),
  humble: aspect("humble", 1, ["order", "social"]),
  modest: aspect("modest", 1, ["order", "social"]),
  tolerant: aspect("tolerant", 1, ["social", "petition"]),
  cowardly: aspect("cowardly", -1, ["combat", "lair"]),
  timid: aspect("timid", -1, ["combat", "lair"]),
  reckless: aspect("reckless", -1, ["wild", "travel", "trap"]),
  careless: aspect("careless", -1, ["wild", "travel", "trap"]),
  haphazard: aspect("haphazard", -1, ["wild", "travel", "trap"]),
  greedy: aspect("greedy", -1, ["social", "petition"]),
  stingy: aspect("stingy", -1, ["social", "petition"]),
  cruel: aspect("cruel", -1, ["social", "order"]),
  merciless: aspect("merciless", -1, ["social", "order"]),
  harsh: aspect("harsh", -1, ["social", "order"]),
  slothful: aspect("slothful", -1, ["ruin", "trap"]),
  negligent: aspect("negligent", -1, ["ruin", "trap"]),
  deceitful: aspect("deceitful", -1, ["social", "petition"]),
  insincere: aspect("insincere", -1, ["social", "petition"]),
  impatient: aspect("impatient", -1, ["trap", "travel"]),
  vengeful: aspect("vengeful", -1, ["social", "combat"]),
  wrathful: aspect("wrathful", -1, ["social", "combat"]),
  paranoid: aspect("paranoid", -1, ["intrigue", "social"]),
  domineering: aspect("domineering", -1, ["social", "order"]),
  dishonorable: aspect("dishonorable", -1, ["order", "social"]),
  unjust: aspect("unjust", -1, ["order", "social"]),
  undisciplined: aspect("undisciplined", -1, ["order", "trouble"]),
  oblivious: aspect("oblivious", -1, ["trap", "intrigue"]),
  rigid: aspect("rigid", -1, ["travel", "social"])
};

/** The first virtue and first vice, if they have a mechanical mapping. */
export function activeAspects(figure: { virtues?: string[]; vices?: string[] }): {
  virtue?: HeroAspect;
  vice?: HeroAspect;
} {
  return {
    virtue: figure.virtues?.[0] ? HERO_ASPECTS[figure.virtues[0]] : undefined,
    vice: figure.vices?.[0] ? HERO_ASPECTS[figure.vices[0]] : undefined
  };
}

/** Matching virtue +1, matching vice -1, clamped to [-1, +1]. */
export function aspectBonus(figure: { virtues?: string[]; vices?: string[] }, tags: readonly MissionTag[]): number {
  if (tags.length === 0) return 0;
  const wanted = new Set(tags);
  const { virtue, vice } = activeAspects(figure);
  const matches = (entry: HeroAspect | undefined) => Boolean(entry?.tags.some(tag => wanted.has(tag)));
  const total = (matches(virtue) ? 1 : 0) - (matches(vice) ? 1 : 0);
  return Math.max(-1, Math.min(1, total));
}
