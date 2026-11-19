// Shared creature core for beast/monster/bandit profiles
import {
  CREATURE_ALIGNMENT,
  CREATURE_ATTACKS,
  CREATURE_DEFENSES,
  CREATURE_MOVES,
  CREATURE_QUANTITIES,
  CREATURE_SIZES,
  CREATURE_TAGS,
  CREATURE_WANTS,
  type CreatureNature,
  type CreatureQuantity,
  type CreatureSize,
  CURIO_ADJECTIVES,
  CURIO_DRAWBACKS,
  CURIO_ITEMS,
  CURIO_NAME_TEMPLATES,
  CURIO_POWERS,
  CURIO_PROPERTIES
} from "@/data/creatures";
import type { Alignment } from "@/data/culture-traits";
import {
  INHABITANT_GROUPS,
  INHABITANT_RELATIONS,
  type InhabitantGroup,
  type InhabitantGroupId
} from "@/data/inhabitants";
import type { CreatureCore } from "@/model/story/creature-profile";
import type { SiteInhabitants } from "@/model/story/site-profile";
import type { Rng } from "@/utils/rng";

export const d = (rng: Rng, sides: number) => rng.int(1, sides);

export const pick = <T>(rng: Rng, table: readonly T[]): T => {
  if (!table.length) throw new Error("Cannot pick from an empty table");
  return table[d(rng, table.length) - 1];
};

export const pickWeighted = <T>(rng: Rng, table: readonly { value: T; weight: number }[]): T => {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = d(rng, total);
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return table[table.length - 1].value;
};

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const uniquePicks = <T>(rng: Rng, table: readonly T[], count: number): T[] => {
  const pool = [...table];
  const result: T[] = [];
  while (result.length < count && pool.length) {
    result.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  }
  return result;
};

export interface CreatureOverrides {
  size?: CreatureSize;
  quantity?: CreatureQuantity;
}

/** Roll the shared creature identity: size, quantity, nature, alignment, tags, attack/defense, want, moves */
export function rollCreatureCore(
  rng: Rng,
  prevailing: Alignment,
  natures: readonly CreatureNature[],
  overrides: CreatureOverrides = {}
): CreatureCore {
  const sizeRow = overrides.size
    ? (CREATURE_SIZES.find(row => row.size === overrides.size) ??
      pickWeighted(
        rng,
        CREATURE_SIZES.map(row => ({ value: row, weight: row.weight }))
      ))
    : pickWeighted(
        rng,
        CREATURE_SIZES.map(row => ({ value: row, weight: row.weight }))
      );
  const quantityRow = overrides.quantity
    ? (CREATURE_QUANTITIES.find(row => row.quantity === overrides.quantity) ??
      pickWeighted(
        rng,
        CREATURE_QUANTITIES.map(row => ({ value: row, weight: row.weight }))
      ))
    : pickWeighted(
        rng,
        CREATURE_QUANTITIES.map(row => ({ value: row, weight: row.weight }))
      );
  const nature = pickWeighted(
    rng,
    natures.map(row => ({ value: row, weight: row.weight }))
  );
  const alignment = pick(rng, CREATURE_ALIGNMENT[prevailing] ?? CREATURE_ALIGNMENT.neutral);

  return {
    size: sizeRow.size,
    quantity: quantityRow.quantity,
    count: quantityRow.count,
    natureId: nature.id,
    nature: nature.label,
    alignment,
    tags: uniquePicks(rng, CREATURE_TAGS, rng.int(0, 3)),
    attacks: uniquePicks(rng, CREATURE_ATTACKS, rng.int(1, 2)),
    defense: pick(rng, CREATURE_DEFENSES),
    want: pick(rng, CREATURE_WANTS),
    moves: uniquePicks(rng, CREATURE_MOVES, rng.int(3, 5))
  };
}

function inhabitantLabel(group: InhabitantGroup, cultureName: string): string {
  const culture = cultureName && cultureName !== "the local folk" ? cultureName : "";
  if (group.id === "humans") return culture ? `${culture} humans` : group.label;
  if (group.id === "humanoids") return culture ? `${culture} humanoids` : group.label;
  return group.label;
}

function chooseGroup(
  rng: Rng,
  weights: Partial<Record<InhabitantGroupId, number>>,
  excluded?: InhabitantGroupId
): InhabitantGroup {
  const weighted = INHABITANT_GROUPS.filter(group => group.id !== excluded)
    .map(group => ({ value: group, weight: weights[group.id] ?? 0 }))
    .filter(({ weight }) => weight > 0);
  if (weighted.length) return pickWeighted(rng, weighted);
  const fallback = INHABITANT_GROUPS.filter(group => group.id !== excluded);
  return pick(rng, fallback.length ? fallback : INHABITANT_GROUPS);
}

/** Roll the inhabitant groups for a creature; the encounter rating is supplied by the caller */
export function rollCreatureInhabitants(
  rng: Rng,
  weights: Partial<Record<InhabitantGroupId, number>>,
  rating: number,
  cultureName: string,
  secondChance = 0.3
): SiteInhabitants {
  const first = chooseGroup(rng, weights);
  const groups = [first];
  if (rng.chance(secondChance)) groups.push(chooseGroup(rng, weights, first.id));

  return {
    rating: clamp(rating, 1, 6),
    groups: groups.map(group => ({ ...group, label: inhabitantLabel(group, cultureName) })),
    relationship: groups.length === 2 ? pick(rng, INHABITANT_RELATIONS) : undefined
  };
}

export interface Curio {
  name: string;
  power: string;
  drawback: string;
}

/** Roll a single named curio prompt: a power and a drawback, not a full magic item */
export function rollCurio(rng: Rng, cultureName: string): Curio {
  const name = pick(rng, CURIO_NAME_TEMPLATES)
    .replace("[PROPERTY]", pick(rng, CURIO_PROPERTIES))
    .replace("[ADJECTIVE]", pick(rng, CURIO_ADJECTIVES))
    .replace("[ITEM]", pick(rng, CURIO_ITEMS))
    .replace("[NAME]", cultureName || "the Maker");
  return { name, power: pick(rng, CURIO_POWERS), drawback: pick(rng, CURIO_DRAWBACKS) };
}
