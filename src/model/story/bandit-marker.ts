// The bandit kind for lazy marker content: map context in, rendered profile out
import { BANDIT_LOCALITIES } from "@/data/bandits";
import type { Alignment } from "@/data/culture-traits";
import { BRIGAND_ANIMALS } from "@/data/markers";
import { Names } from "@/model/society/names-generator";
import { generateBanditProfile, renderBanditProfile } from "@/model/story/bandit-generator";
import type { BanditContext } from "@/model/story/creature-profile";
import {
  type MarkerGeneratedContent,
  type MarkerGeneratedRecipe,
  registerGeneratedKind
} from "@/model/story/marker-content";
import type { Marker } from "@/model/story/markers-generator";

export const BANDIT_KIND = "bandit";
export const BANDIT_VERSION = 1;

/** The map facts a bandit profile reads; safe with a stub pack in tests */
export function banditContext(marker: Marker, seed: string): BanditContext {
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
    gang: typeof meta.gang === "string" ? meta.gang : undefined,
    locality: typeof meta.locality === "string" ? meta.locality : undefined,
    leader: typeof meta.leader === "string" ? meta.leader : undefined,
    maritime: meta.maritime === true,
    clearedBy: typeof meta.clearedBy === "string" ? meta.clearedBy : undefined,
    clearedFrom: typeof meta.clearedFrom === "string" ? meta.clearedFrom : undefined
  };
}

/** The tiny record stored on a bandit marker; the profile is built on first read */
export function createBanditContent(): MarkerGeneratedRecipe {
  return { kind: BANDIT_KIND, version: BANDIT_VERSION, seed: options.map.seed };
}

/** Best-effort gang/locality recovery for an older bandit marker without meta */
function inferBanditMeta(marker: Marker): Record<string, string | boolean> | undefined {
  const meta: Record<string, string | boolean> = {};
  const type = (marker.type ?? "").toLowerCase();
  if (type.includes("pirate")) {
    meta.maritime = true;
    meta.locality = "coastal";
    return meta;
  }
  const name = marker.name ?? "";
  for (const animal of BRIGAND_ANIMALS) {
    if (name.endsWith(animal)) {
      meta.gang = animal;
      break;
    }
  }
  const note = marker.note ?? "";
  for (const locality of BANDIT_LOCALITIES) {
    if (note.includes(locality)) {
      meta.locality = locality;
      break;
    }
  }
  return Object.keys(meta).length ? meta : undefined;
}

export function registerBanditRenderer(): void {
  registerGeneratedKind(BANDIT_KIND, {
    markerTypes: ["brigands", "brigand", "bandits", "bandit", "highwaymen", "robbers", "pirates", "pirate"],
    create: marker => {
      const meta = inferBanditMeta(marker);
      return { ...createBanditContent(), ...(meta ? { meta } : {}) };
    },
    render: (marker: Marker, content: MarkerGeneratedContent, salt) =>
      renderBanditProfile(generateBanditProfile(banditContext(marker, content.seed), salt ?? ""))
  });
}

registerBanditRenderer();
