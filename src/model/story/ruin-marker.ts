// The ruin kind for lazy marker content: map and history context in, rendered profile out
import type { Alignment } from "@/data/culture-traits";
import { RUIN_TIERS, type RuinTier } from "@/data/ruins";
import { Names } from "@/model/society/names-generator";
import {
  type MarkerGeneratedContent,
  type MarkerGeneratedRecipe,
  registerGeneratedKind
} from "@/model/story/marker-content";
import type { Marker } from "@/model/story/markers-generator";
import { generateRuinProfile, type RuinContext, renderRuinProfile } from "@/model/story/ruin-generator";

export const RUIN_KIND = "ruin";
export const RUIN_VERSION = 1;

const tierOf = (value: unknown): RuinTier | undefined =>
  typeof value === "string" && RUIN_TIERS.some(entry => entry.tier === value) ? (value as RuinTier) : undefined;

/** The map and history facts a ruin profile reads; safe with a stub pack in tests */
export function ruinContext(marker: Marker, seed: string): RuinContext {
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
    name: marker.name,
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

/** The tiny record stored on a ruin marker; the profile is built on first read */
export function createRuinContent(): MarkerGeneratedRecipe {
  return { kind: RUIN_KIND, version: RUIN_VERSION, seed: options.map.seed };
}

export function registerRuinRenderer(): void {
  registerGeneratedKind(RUIN_KIND, {
    markerTypes: ["ruins", "ruin"],
    create: () => createRuinContent(),
    render: (marker: Marker, content: MarkerGeneratedContent, salt) =>
      renderRuinProfile(generateRuinProfile(ruinContext(marker, content.seed), salt ?? ""))
  });
}

registerRuinRenderer();
