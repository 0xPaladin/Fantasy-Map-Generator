// One-release bridge from legacy M/W/S/C figures and guild hero state to Character.hero.
// See docs/plans/characters.md.
import { attributesFromSkills, heroStartingPackage, legacyActionsFromSkills } from "@/data/character-actions";
import { inferHeroArchetype } from "@/data/hero-archetypes";
import type { HeroCondition, HeroSheet } from "@/types/character";
import type { Character, History, LegacyFigureFields } from "@/types/history";
import type { HeroGuildState } from "@/types/living";

export type LegacyFigure = Character & LegacyFigureFields;

export interface CharacterMigrationResult {
  heroes: number;
}

function conditionFromGuild(state: HeroGuildState): HeroCondition {
  return {
    resolve: state.resolve,
    stamina: state.stamina,
    maxResolve: state.maxResolve,
    maxStamina: state.maxStamina,
    injuries: [...state.injuries],
    downUntilTick: state.downUntilTick,
    push: state.push
  };
}

function sheetFromLegacy(figure: LegacyFigure, state: HeroGuildState | undefined): HeroSheet {
  const archetype = figure.archetype ?? inferHeroArchetype(figure);
  const start = heroStartingPackage(archetype);
  const skills = figure.skills;
  const progression = figure.progression ? { ...figure.progression, picks: [] } : undefined;

  return {
    archetype,
    attributes: skills ? attributesFromSkills(skills) : { ...start.attributes },
    actions: skills ? legacyActionsFromSkills(skills) : { ...start.actions },
    abilities: figure.disciplines?.length ? [...figure.disciplines] : [start.ability],
    xp: figure.xp ?? 0,
    progression,
    doctrine: state?.doctrine,
    temperament: state?.temperament ? { ...state.temperament } : undefined,
    condition: state ? conditionFromGuild(state) : undefined
  };
}

function attachGuildState(hero: HeroSheet, state: HeroGuildState | undefined, cooldownUntil: number | undefined): void {
  if (!state) return;
  hero.condition ??= conditionFromGuild(state);
  hero.doctrine ??= state.doctrine;
  hero.temperament ??= { ...state.temperament };
  if (cooldownUntil !== undefined) hero.cooldownUntil ??= cooldownUntil;
}

/** Backfill seed keys and build hero sheets for legacy figures. Idempotent. */
export function migrateCharacters(history: History | undefined): CharacterMigrationResult {
  const figures = history?.figures;
  if (!figures?.length) return { heroes: 0 };

  const guild = history?.living?.guild;
  const roster = new Set(guild?.roster ?? []);
  let heroes = 0;

  for (const character of figures as LegacyFigure[]) {
    character.seedKey ??= `figure:${character.i}`;

    const state = guild?.heroes?.[character.i];
    const legacy = character.skills ?? character.archetype ?? character.disciplines ?? character.progression;
    const shouldBeHero = Boolean(legacy || state || roster.has(character.i));

    if (shouldBeHero && !character.hero) {
      character.hero = sheetFromLegacy(character, state);
      heroes += 1;
    }

    if (character.hero) attachGuildState(character.hero, state, guild?.cooldowns?.[character.i]);
  }

  return { heroes };
}
