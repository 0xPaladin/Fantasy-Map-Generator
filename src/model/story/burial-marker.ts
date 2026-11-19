// The burial kind for lazy marker content: map context in, rendered hazard out
import { BURIAL_KINDS, type BurialKind } from "@/data/burials";
import type { Alignment } from "@/data/culture-traits";
import { Names } from "@/model/society/names-generator";
import { generateBurialProfile, renderBurialProfile } from "@/model/story/burial-generator";
import {
  type MarkerGeneratedContent,
  type MarkerGeneratedRecipe,
  registerGeneratedKind
} from "@/model/story/marker-content";
import type { Marker } from "@/model/story/markers-generator";
import type { BurialContext } from "@/model/story/underworld-profile";

export const BURIAL_KIND = "burial";
export const BURIAL_VERSION = 1;

const kindOf = (value: unknown): BurialKind | undefined =>
  typeof value === "string" && BURIAL_KINDS.some(row => row.kind === value) ? (value as BurialKind) : undefined;

/** The map and history facts a burial profile reads; safe with a stub pack in tests */
export function burialContext(marker: Marker, seed: string): BurialContext {
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
    burialKind: kindOf(meta.burialKind),
    disturbance: typeof meta.disturbance === "string" ? meta.disturbance : undefined,
    originalName: typeof meta.originalName === "string" ? meta.originalName : undefined,
    originalPolity: typeof meta.originalPolity === "string" ? meta.originalPolity : undefined,
    fallYear: typeof meta.fallYear === "number" ? meta.fallYear : undefined,
    cause: typeof meta.cause === "string" ? meta.cause : undefined,
    looted: meta.looted === true,
    clearedBy: typeof meta.clearedBy === "string" ? meta.clearedBy : undefined,
    clearedFrom: typeof meta.clearedFrom === "string" ? meta.clearedFrom : undefined
  };
}

/** The tiny record stored on a burial marker; the profile is built on first read */
export function createBurialContent(): MarkerGeneratedRecipe {
  return { kind: BURIAL_KIND, version: BURIAL_VERSION, seed: options.map.seed };
}

export function registerBurialRenderer(): void {
  registerGeneratedKind(BURIAL_KIND, {
    markerTypes: ["disturbed-burials", "disturbed-burial"],
    create: () => createBurialContent(),
    render: (marker: Marker, content: MarkerGeneratedContent, salt) =>
      renderBurialProfile(generateBurialProfile(burialContext(marker, content.seed), salt ?? ""))
  });
}

registerBurialRenderer();
