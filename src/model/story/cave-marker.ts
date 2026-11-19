// The cave kind for lazy marker content: map context in, rendered survey out
import { CAVE_EXTENTS, type CaveExtent } from "@/data/caves";
import type { Alignment } from "@/data/culture-traits";
import { CAVE_FORMATIONS, CAVE_STATUSES } from "@/data/markers";
import { Names } from "@/model/society/names-generator";
import { generateCaveProfile, renderCaveProfile } from "@/model/story/cave-generator";
import {
  type MarkerGeneratedContent,
  type MarkerGeneratedRecipe,
  registerGeneratedKind
} from "@/model/story/marker-content";
import type { Marker } from "@/model/story/markers-generator";
import type { CaveContext } from "@/model/story/underworld-profile";

export const CAVE_KIND = "cave";
export const CAVE_VERSION = 1;

const extentOf = (value: unknown): CaveExtent | undefined =>
  typeof value === "string" && CAVE_EXTENTS.some(row => row.extent === value) ? (value as CaveExtent) : undefined;

/** The map facts a cave profile reads; safe with a stub pack in tests */
export function caveContext(marker: Marker, seed: string): CaveContext {
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
    formation: typeof meta.formation === "string" ? meta.formation : undefined,
    status: typeof meta.status === "string" ? meta.status : undefined,
    extent: extentOf(meta.extent)
  };
}

/** The tiny record stored on a cave marker; the profile is built on first read */
export function createCaveContent(): MarkerGeneratedRecipe {
  return { kind: CAVE_KIND, version: CAVE_VERSION, seed: options.map.seed };
}

/** Best-effort formation/status recovery for an older cave marker without meta */
function inferCaveMeta(marker: Marker): Record<string, string> | undefined {
  const meta: Record<string, string> = {};
  const name = marker.name ?? "";
  for (const formation of Object.keys(CAVE_FORMATIONS)) {
    if (!name.endsWith(formation)) continue;
    const glacial = `Glacial ${formation}`;
    meta.formation = name.endsWith(glacial) ? glacial : formation;
    break;
  }
  const note = marker.note ?? "";
  for (const status of Object.keys(CAVE_STATUSES)) {
    if (note.includes(status)) {
      meta.status = status;
      break;
    }
  }
  return Object.keys(meta).length ? meta : undefined;
}

export function registerCaveRenderer(): void {
  registerGeneratedKind(CAVE_KIND, {
    markerTypes: ["caves", "cave"],
    create: marker => {
      const meta = inferCaveMeta(marker);
      return { ...createCaveContent(), ...(meta ? { meta } : {}) };
    },
    render: (marker: Marker, content: MarkerGeneratedContent, salt) =>
      renderCaveProfile(generateCaveProfile(caveContext(marker, content.seed), salt ?? ""))
  });
}

registerCaveRenderer();
