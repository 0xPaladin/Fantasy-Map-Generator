// The necropolis kind for lazy marker content: map and history context in, rendered profile out
import { NECROPOLIS_TIERS, type NecropolisTier } from "@/data/burials";
import type { Alignment } from "@/data/culture-traits";
import { NECROPOLIS_TYPES } from "@/data/markers";
import { Names } from "@/model/society/names-generator";
import {
  type MarkerGeneratedContent,
  type MarkerGeneratedRecipe,
  registerGeneratedKind
} from "@/model/story/marker-content";
import type { Marker } from "@/model/story/markers-generator";
import { generateNecropolisProfile, renderNecropolisProfile } from "@/model/story/necropolis-generator";
import type { NecropolisContext } from "@/model/story/underworld-profile";

export const NECROPOLIS_KIND = "necropolis";
export const NECROPOLIS_VERSION = 1;

const tierOf = (value: unknown): NecropolisTier | undefined =>
  typeof value === "string" && NECROPOLIS_TIERS.some(row => row.tier === value) ? (value as NecropolisTier) : undefined;

/** The map and history facts a necropolis profile reads; safe with a stub pack in tests */
export function necropolisContext(marker: Marker, seed: string): NecropolisContext {
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
    burialType: typeof meta.burialType === "string" ? meta.burialType : undefined,
    tier: tierOf(meta.tier),
    originalName: typeof meta.originalName === "string" ? meta.originalName : undefined,
    originalPolity: typeof meta.originalPolity === "string" ? meta.originalPolity : undefined,
    fallYear: typeof meta.fallYear === "number" ? meta.fallYear : undefined,
    cause: typeof meta.cause === "string" ? meta.cause : undefined,
    looted: meta.looted === true,
    clearedBy: typeof meta.clearedBy === "string" ? meta.clearedBy : undefined,
    clearedFrom: typeof meta.clearedFrom === "string" ? meta.clearedFrom : undefined
  };
}

/** The tiny record stored on a necropolis marker; the profile is built on first read */
export function createNecropolisContent(): MarkerGeneratedRecipe {
  return { kind: NECROPOLIS_KIND, version: NECROPOLIS_VERSION, seed: options.map.seed };
}

/** Best-effort burial-type recovery for an older necropolis marker without meta */
function inferNecropolisMeta(marker: Marker): Record<string, string> | undefined {
  const name = marker.name ?? "";
  for (const burialType of Object.keys(NECROPOLIS_TYPES)) {
    if (name.endsWith(burialType)) return { burialType };
  }
  return undefined;
}

export function registerNecropolisRenderer(): void {
  registerGeneratedKind(NECROPOLIS_KIND, {
    markerTypes: ["necropolises", "necropolis"],
    create: marker => {
      const meta = inferNecropolisMeta(marker);
      return { ...createNecropolisContent(), ...(meta ? { meta } : {}) };
    },
    render: (marker: Marker, content: MarkerGeneratedContent, salt) =>
      renderNecropolisProfile(generateNecropolisProfile(necropolisContext(marker, content.seed), salt ?? ""))
  });
}

registerNecropolisRenderer();
