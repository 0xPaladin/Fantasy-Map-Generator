// One-release bridge from legacy M/W/S/C figures to Character.hero.
// See docs/plans/characters.md. Legacy `living.guild` hero state is ignored.
import { attributesFromSkills, heroStartingPackage, legacyActionsFromSkills } from "@/data/character-actions";
import { inferHeroArchetype } from "@/data/hero-archetypes";
import type { HeroSheet } from "@/types/character";
import type { Character, History, LegacyFigureFields } from "@/types/history";

export type LegacyFigure = Character & LegacyFigureFields;

export interface CharacterMigrationResult {
  heroes: number;
}

function sheetFromLegacy(figure: LegacyFigure): HeroSheet {
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
    progression
  };
}

/** Backfill seed keys and build hero sheets for legacy figures. Idempotent. */
export function migrateCharacters(history: History | undefined): CharacterMigrationResult {
  const figures = history?.figures;
  if (!figures?.length) return { heroes: 0 };

  let heroes = 0;

  for (const character of figures as LegacyFigure[]) {
    character.seedKey ??= `figure:${character.i}`;

    const legacy = character.skills ?? character.archetype ?? character.disciplines ?? character.progression;
    if (legacy && !character.hero) {
      character.hero = sheetFromLegacy(character);
      heroes += 1;
    }
  }

  return { heroes };
}
