// Character sheet types. The stored person stays in pack.history.figures.
// See docs/plans/characters.md.
import type { FactionRelation } from "@/types/factions";
import type { HeroArchetypeId, HeroDoctrine, HeroInjury, HeroTemperament } from "@/types/living";
import type { ActionId, Die } from "./character-actions";

/** Deterministic level growth and the player-chosen die steps / abilities. */
export interface HeroProgression {
  appliedLevel?: number;
  pendingChoices?: number;
  picks?: string[];
  /** tick the pending choice first appeared, for the two-season auto-pick */
  choiceSinceTick?: number;
}

export interface CharacterAttributes {
  might: number;
  agility: number;
  wits: number;
  presence: number;
}

export interface HeroCondition {
  resolve: number;
  stamina: number;
  maxResolve: number;
  maxStamina: number;
  injuries: HeroInjury[];
  downUntilTick?: number;
  push?: boolean;
}

export interface HeroSheet {
  /** Starting-package label, not a permanent class. */
  archetype?: HeroArchetypeId;
  attributes: CharacterAttributes;
  actions: Record<ActionId, Die>;
  abilities?: string[];
  inventory?: string[];
  xp: number;
  progression?: HeroProgression;
  condition?: HeroCondition;
  doctrine?: HeroDoctrine;
  temperament?: HeroTemperament;
  cooldownUntil?: number;
}

/** Faction-style standing; no character renown. */
export interface CharacterRelations {
  characters?: Record<number, FactionRelation>;
  factions?: Record<number, FactionRelation>;
  states?: Record<number, FactionRelation>;
}

export type CharacterStatus = "active" | "dead" | "captive" | "retired";
