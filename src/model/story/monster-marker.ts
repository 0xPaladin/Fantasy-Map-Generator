// The monster kind for lazy marker content: map context in, rendered profile out
import type { Alignment } from "@/data/culture-traits";
import { HILL_MONSTER_HABITS, HILL_MONSTER_SPECIES } from "@/data/markers";
import { Names } from "@/model/society/names-generator";
import type { MonsterContext } from "@/model/story/creature-profile";
import {
  type MarkerGeneratedContent,
  type MarkerGeneratedRecipe,
  registerGeneratedKind
} from "@/model/story/marker-content";
import type { Marker } from "@/model/story/markers-generator";
import { generateMonsterProfile, renderMonsterProfile } from "@/model/story/monster-generator";

export const MONSTER_KIND = "monster";
export const MONSTER_VERSION = 1;

/** The map facts a monster profile reads; safe with a stub pack in tests */
export function monsterContext(marker: Marker, seed: string): MonsterContext {
  const cell = marker.cell;
  const cultureId = pack.cells?.culture?.[cell] ?? 0;
  const culture = pack.cultures?.[cultureId];
  const biome = pack.biomes?.[pack.cells?.biome?.[cell] ?? 0];
  const meta = marker.generated?.meta ?? {};

  return {
    seed,
    cell,
    cultureName: culture?.name || (cultureId ? Names.getCulture(cultureId) : "the local folk"),
    alignment: (culture?.alignment ?? "neutral") as Alignment,
    biomeName: biome?.name || "wilderness",
    height: pack.cells?.h?.[cell] ?? 0,
    population: pack.cells?.pop?.[cell],
    name: marker.name,
    species: typeof meta.species === "string" ? meta.species : undefined,
    habit: typeof meta.habit === "string" ? meta.habit : undefined,
    nature: typeof meta.nature === "string" ? meta.nature : undefined,
    clearedBy: typeof meta.clearedBy === "string" ? meta.clearedBy : undefined,
    clearedFrom: typeof meta.clearedFrom === "string" ? meta.clearedFrom : undefined
  };
}

/** The tiny record stored on a monster marker; the profile is built on first read */
export function createMonsterContent(): MarkerGeneratedRecipe {
  return { kind: MONSTER_KIND, version: MONSTER_VERSION, seed: options.map.seed };
}

/** Best-effort species/habit recovery for an older monster marker without meta */
function inferMonsterMeta(marker: Marker): Record<string, string> | undefined {
  const meta: Record<string, string> = {};
  const name = marker.name ?? "";
  for (const species of HILL_MONSTER_SPECIES) {
    if (name.endsWith(species)) {
      meta.species = species;
      break;
    }
  }
  const note = marker.note ?? "";
  for (const habit of HILL_MONSTER_HABITS) {
    if (note.includes(habit)) {
      meta.habit = habit;
      break;
    }
  }
  return Object.keys(meta).length ? meta : undefined;
}

export function registerMonsterRenderer(): void {
  registerGeneratedKind(MONSTER_KIND, {
    markerTypes: ["hill-monsters", "hill-monster", "monsters", "monster"],
    create: marker => {
      const meta = inferMonsterMeta(marker);
      return { ...createMonsterContent(), ...(meta ? { meta } : {}) };
    },
    render: (marker: Marker, content: MarkerGeneratedContent, salt) =>
      renderMonsterProfile(generateMonsterProfile(monsterContext(marker, content.seed), salt ?? ""))
  });
}

registerMonsterRenderer();
