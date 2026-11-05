// The twelve heroic actions, starting packages and the action check.
// See docs/plans/characters.md.

import type { CharacterAttributes, HeroSheet } from "@/types/character";
import type { ActionCheck, ActionCheckResult, ActionId, Die } from "@/types/character-actions";
import { ACTIONS } from "@/types/character-actions";
import type { HeroArchetypeId, MissionTag } from "@/types/living";
import type { Rng } from "@/utils/rng";

export type { ActionCheck, ActionCheckResult, ActionId, Die } from "@/types/character-actions";
export { ACTIONS, DICE } from "@/types/character-actions";

export const ACTION_DEFS: Record<
  ActionId,
  { id: ActionId; label: string; attribute: keyof CharacterAttributes; tags: readonly MissionTag[] }
> = {
  strike: { id: "strike", label: "Strike", attribute: "might", tags: ["combat", "lair"] },
  guard: { id: "guard", label: "Guard", attribute: "might", tags: ["combat", "order"] },
  maneuver: { id: "maneuver", label: "Maneuver", attribute: "agility", tags: ["combat", "travel"] },
  scout: { id: "scout", label: "Scout", attribute: "agility", tags: ["wild", "travel", "trap"] },
  infiltrate: { id: "infiltrate", label: "Infiltrate", attribute: "agility", tags: ["intrigue", "ruin"] },
  survive: { id: "survive", label: "Survive", attribute: "wits", tags: ["wild", "travel"] },
  investigate: { id: "investigate", label: "Investigate", attribute: "wits", tags: ["ruin", "arcane", "intrigue"] },
  craft: { id: "craft", label: "Craft", attribute: "wits", tags: ["ruin", "trap"] },
  treat: { id: "treat", label: "Treat", attribute: "wits", tags: ["plague", "curse", "undead"] },
  persuade: { id: "persuade", label: "Persuade", attribute: "presence", tags: ["social", "petition"] },
  deceive: { id: "deceive", label: "Deceive", attribute: "presence", tags: ["intrigue", "social"] },
  command: { id: "command", label: "Command", attribute: "presence", tags: ["order", "combat", "trouble"] }
};

export const DIE_SIDES: Record<Die, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12 };

export interface HeroStartingPackage {
  attributes: CharacterAttributes;
  actions: Record<ActionId, Die>;
  ability: string;
}

function startActions(overrides: Partial<Record<ActionId, Die>>): Record<ActionId, Die> {
  const actions = Object.fromEntries(ACTIONS.map(action => [action, "d4"])) as Record<ActionId, Die>;
  return { ...actions, ...overrides };
}

function startPackage(
  attributes: CharacterAttributes,
  actions: Partial<Record<ActionId, Die>>,
  ability: string
): HeroStartingPackage {
  return { attributes, actions: startActions(actions), ability };
}

/** One `d10`, one `d8`, two `d6`, eight `d4`; attributes within -1..+2. */
export const HERO_STARTING_PACKAGES: Record<HeroArchetypeId, HeroStartingPackage> = {
  warden: startPackage(
    { might: 2, agility: -1, wits: 0, presence: 1 },
    { guard: "d10", strike: "d8", command: "d6", maneuver: "d6" },
    "Shield Wall"
  ),
  ranger: startPackage(
    { might: 0, agility: 2, wits: 1, presence: -1 },
    { scout: "d10", strike: "d8", survive: "d6", maneuver: "d6" },
    "Trailblazer"
  ),
  scholar: startPackage(
    { might: -1, agility: 0, wits: 2, presence: 1 },
    { investigate: "d10", craft: "d8", treat: "d6", persuade: "d6" },
    "Loremaster"
  ),
  priest: startPackage(
    { might: 0, agility: -1, wits: 1, presence: 2 },
    { command: "d10", persuade: "d8", treat: "d6", investigate: "d6" },
    "Benediction"
  ),
  shadow: startPackage(
    { might: -1, agility: 2, wits: 0, presence: 1 },
    { infiltrate: "d10", deceive: "d8", scout: "d6", strike: "d6" },
    "Slip Away"
  ),
  factor: startPackage(
    { might: -1, agility: 0, wits: 1, presence: 2 },
    { persuade: "d10", deceive: "d8", investigate: "d6", command: "d6" },
    "Appraisal"
  ),
  envoy: startPackage(
    { might: -1, agility: 0, wits: 1, presence: 2 },
    { persuade: "d10", command: "d8", deceive: "d6", investigate: "d6" },
    "Diplomatic Immunity"
  ),
  alchemist: startPackage(
    { might: -1, agility: 1, wits: 2, presence: 0 },
    { craft: "d10", treat: "d8", investigate: "d6", deceive: "d6" },
    "Volatile Concoction"
  ),
  warlock: startPackage(
    { might: -1, agility: 0, wits: 1, presence: 2 },
    { command: "d10", deceive: "d8", investigate: "d6", infiltrate: "d6" },
    "Forbidden Lore"
  ),
  freeblade: startPackage(
    { might: 2, agility: 1, wits: -1, presence: 0 },
    { strike: "d10", guard: "d8", maneuver: "d6", survive: "d6" },
    "Duelist"
  )
};

export function heroStartingPackage(id: HeroArchetypeId): HeroStartingPackage {
  const source = HERO_STARTING_PACKAGES[id];
  return {
    attributes: { ...source.attributes },
    actions: { ...source.actions },
    ability: source.ability
  };
}

/** Legacy M/W/S/C rating to a die step. */
export function dieForRating(rating: number): Die {
  if (rating <= 0) return "d4";
  if (rating === 1) return "d6";
  if (rating === 2) return "d8";
  if (rating === 3) return "d10";
  return "d12";
}

function clampAttribute(value: number): number {
  return Math.max(-1, Math.min(2, value));
}

/** Legacy skills to the four bounded attributes. */
export function attributesFromSkills(skills: { m: number; w: number; s: number; c: number }): CharacterAttributes {
  return {
    might: clampAttribute(skills.m - 1),
    agility: clampAttribute(skills.c - 1),
    wits: clampAttribute(skills.w - 1),
    presence: clampAttribute(skills.s - 1)
  };
}

/** @deprecated adapter for guild operations and trouble resolution. */
export function legacyActionForPool(pool: "m" | "w" | "s" | "c"): ActionId {
  if (pool === "m") return "strike";
  if (pool === "w") return "investigate";
  if (pool === "s") return "command";
  return "scout";
}

const ACTION_LEGACY_POOL: Record<ActionId, "m" | "w" | "s" | "c"> = {
  strike: "m",
  guard: "m",
  maneuver: "m",
  scout: "c",
  infiltrate: "c",
  survive: "c",
  investigate: "w",
  craft: "w",
  treat: "w",
  persuade: "s",
  deceive: "s",
  command: "s"
};

/** Old M/W/S/C ratings to the twelve action dice. */
export function legacyActionsFromSkills(skills: { m: number; w: number; s: number; c: number }): Record<ActionId, Die> {
  return Object.fromEntries(
    ACTIONS.map(action => [action, dieForRating(skills[ACTION_LEGACY_POOL[action]])])
  ) as Record<ActionId, Die>;
}

export function actionCheck(
  rng: Rng,
  hero: Pick<HeroSheet, "actions" | "attributes">,
  check: ActionCheck
): ActionCheckResult {
  const die = hero.actions[check.action] ?? "d4";
  const sides = DIE_SIDES[die];
  const advantage = Boolean(check.advantage && !check.disadvantage);
  const disadvantage = Boolean(check.disadvantage && !check.advantage);
  const roll = advantage
    ? Math.max(rng.d(sides), rng.d(sides))
    : disadvantage
      ? Math.min(rng.d(sides), rng.d(sides))
      : rng.d(sides);
  const attribute = hero.attributes[ACTION_DEFS[check.action].attribute] ?? 0;
  const total = roll + attribute + (check.modifiers ?? 0);

  return {
    die,
    roll,
    total,
    critical: roll === sides,
    complication: roll === 1,
    success: check.dc === undefined ? undefined : total >= check.dc
  };
}
