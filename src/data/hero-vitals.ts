// Vitals, temperament and injury rules for Phase 2. See docs/plans/hero-diversity.md.
import { findHeroPath } from "@/data/hero-archetypes";
import type { HeroArchetypeId, HeroInjury, HeroInjuryKind, HeroTemperament, MissionTag } from "@/types/living";

const VITALS_BUDGETS: readonly (readonly [number, number])[] = [
  [8, 36],
  [5, 30],
  [3, 26],
  [1, 20]
];

export const HERO_TEMPERAMENTS: Record<HeroArchetypeId, HeroTemperament> = {
  warden: { boldness: 0.7, caution: 0.5, teamplay: 0.85, greed: 0.2 },
  ranger: { boldness: 0.6, caution: 0.65, teamplay: 0.75, greed: 0.35 },
  scholar: { boldness: 0.35, caution: 0.8, teamplay: 0.65, greed: 0.3 },
  priest: { boldness: 0.45, caution: 0.7, teamplay: 0.9, greed: 0.2 },
  shadow: { boldness: 0.8, caution: 0.45, teamplay: 0.5, greed: 0.7 },
  factor: { boldness: 0.35, caution: 0.75, teamplay: 0.6, greed: 0.85 },
  envoy: { boldness: 0.4, caution: 0.65, teamplay: 0.85, greed: 0.4 },
  alchemist: { boldness: 0.45, caution: 0.7, teamplay: 0.75, greed: 0.3 },
  warlock: { boldness: 0.65, caution: 0.5, teamplay: 0.55, greed: 0.6 },
  freeblade: { boldness: 0.75, caution: 0.35, teamplay: 0.6, greed: 0.5 }
};

export const STAMINA_RESERVE_MINIMUM: Record<HeroArchetypeId, number> = {
  warden: 3,
  ranger: 3,
  scholar: 4,
  priest: 4,
  shadow: 2,
  factor: 3,
  envoy: 4,
  alchemist: 4,
  warlock: 3,
  freeblade: 2
};

const VITALS_SHIFT: Record<HeroArchetypeId, { resolve: number; stamina: number }> = {
  warden: { resolve: 2, stamina: -2 },
  ranger: { resolve: -1, stamina: 1 },
  scholar: { resolve: -2, stamina: 2 },
  priest: { resolve: 0, stamina: 0 },
  shadow: { resolve: -1, stamina: 1 },
  factor: { resolve: 0, stamina: 0 },
  envoy: { resolve: 0, stamina: 0 },
  alchemist: { resolve: 0, stamina: 0 },
  warlock: { resolve: -2, stamina: 2 },
  freeblade: { resolve: 2, stamina: -2 }
};

export function heroVitalsBudget(level: number): number {
  for (const [minLevel, budget] of VITALS_BUDGETS) {
    if (level >= minLevel) return budget;
  }
  return 20;
}

/** Budget split by archetype plus any path grants. */
export function heroMaxVitals(
  archetype: HeroArchetypeId,
  level: number,
  pathPicks: readonly string[] = []
): { maxResolve: number; maxStamina: number } {
  const budget = heroVitalsBudget(level);
  const shift = VITALS_SHIFT[archetype];
  let maxResolve = Math.floor(budget / 2) + shift.resolve;
  let maxStamina = Math.floor(budget / 2) + shift.stamina;

  for (const pick of pathPicks) {
    const found = findHeroPath(archetype, pick);
    maxResolve += found?.path.maxResolve ?? 0;
    maxStamina += found?.path.maxStamina ?? 0;
  }

  return { maxResolve: Math.max(1, maxResolve), maxStamina: Math.max(1, maxStamina) };
}

export function heroTemperamentFor(archetype: HeroArchetypeId): HeroTemperament {
  return { ...HERO_TEMPERAMENTS[archetype] };
}

/** Display tags for the temperament knobs. */
export function heroTemperamentTags(temperament: HeroTemperament): string[] {
  const tags: string[] = [];
  if (temperament.boldness >= 0.7) tags.push("Bold");
  if (temperament.caution >= 0.7) tags.push("Cautious");
  if (temperament.teamplay >= 0.85) tags.push("Loyal");
  if (temperament.greed >= 0.7) tags.push("Grasping");
  return tags;
}

export function heroInjuryTags(kind: HeroInjuryKind): MissionTag[] {
  if (kind === "wounded") return ["combat"];
  if (kind === "shaken") return ["social"];
  return ["travel", "wild"];
}

export const HERO_INJURY_LABELS: Record<HeroInjuryKind, string> = {
  wounded: "Wounded",
  shaken: "Shaken",
  lost: "Lost"
};

export function injuryIsActive(injury: HeroInjury, tick: number): boolean {
  return injury.untilTick === undefined || injury.untilTick > tick;
}

/** Each active injury costs -1 on a matching check. */
export function injuryPenalty(
  injuries: readonly HeroInjury[] | undefined,
  tags: readonly MissionTag[],
  tick: number
): number {
  if (!injuries?.length || tags.length === 0) return 0;
  const wanted = new Set(tags);
  return injuries.filter(
    injury => injuryIsActive(injury, tick) && heroInjuryTags(injury.kind).some(tag => wanted.has(tag))
  ).length;
}

/** Expire timed injuries and let a healer clear one more per season. */
export function recoverInjuries(injuries: HeroInjury[], tick: number, hasHealer: boolean): HeroInjury[] {
  const active = injuries.filter(injury => injuryIsActive(injury, tick));
  if (!hasHealer || active.length === 0) return active;
  active.shift();
  return active;
}
