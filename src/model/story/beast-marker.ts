// The beast kind for lazy marker content: map context in, rendered profile out
import type { Alignment } from "@/data/culture-traits";
import { Names } from "@/model/society/names-generator";
import { generateBeastProfile, renderBeastProfile } from "@/model/story/beast-generator";
import type { BeastContext } from "@/model/story/creature-profile";
import {
  type MarkerGeneratedContent,
  type MarkerGeneratedRecipe,
  registerGeneratedKind
} from "@/model/story/marker-content";
import type { Marker } from "@/model/story/markers-generator";

export const BEAST_KIND = "beast";
export const BEAST_VERSION = 1;

/** The map facts a beast profile reads; safe with a stub pack in tests */
export function beastContext(marker: Marker, seed: string): BeastContext {
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
    habitat: typeof meta.habitat === "string" ? meta.habitat : undefined,
    length: typeof meta.length === "number" ? meta.length : undefined,
    clearedBy: typeof meta.clearedBy === "string" ? meta.clearedBy : undefined,
    clearedFrom: typeof meta.clearedFrom === "string" ? meta.clearedFrom : undefined
  };
}

/** The tiny record stored on a beast marker; the profile is built on first read */
export function createBeastContent(): MarkerGeneratedRecipe {
  return { kind: BEAST_KIND, version: BEAST_VERSION, seed: options.map.seed };
}

/** Best-effort habitat/length recovery for an older beast marker without meta */
function inferBeastMeta(marker: Marker): Record<string, string | number> | undefined {
  const meta: Record<string, string | number> = {};
  const type = (marker.type ?? "").toLowerCase();
  if (type.includes("lake")) meta.habitat = "a freshwater lake";
  else if (type.includes("sea")) meta.habitat = "the open sea";
  const length = (marker.note ?? "").match(/(\d+)[\s\S]*?long/);
  if (length) meta.length = Number(length[1]);
  return Object.keys(meta).length ? meta : undefined;
}

export function registerBeastRenderer(): void {
  registerGeneratedKind(BEAST_KIND, {
    markerTypes: ["lake-monsters", "lake-monster", "sea-monsters", "sea-monster"],
    create: marker => {
      const meta = inferBeastMeta(marker);
      return { ...createBeastContent(), ...(meta ? { meta } : {}) };
    },
    render: (marker: Marker, content: MarkerGeneratedContent, salt) =>
      renderBeastProfile(generateBeastProfile(beastContext(marker, content.seed), salt ?? ""))
  });
}

registerBeastRenderer();
