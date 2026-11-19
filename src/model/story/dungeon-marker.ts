// The dungeon kind for lazy marker content: map context in, rendered profile out
import type { Alignment } from "@/data/culture-traits";
import { Names } from "@/model/society/names-generator";
import {
  type DungeonContext,
  generateDungeonName,
  generateDungeonProfile,
  renderDungeonProfile
} from "@/model/story/dungeon-generator";
import { type MarkerGeneratedContent, registerGeneratedKind } from "@/model/story/marker-content";
import type { Marker } from "@/model/story/markers-generator";

export const DUNGEON_KIND = "dungeon";
export const DUNGEON_VERSION = 1;

/** The map facts a dungeon profile reads; safe with a stub pack in tests */
export function dungeonContext(cell: number, seed: string, name?: string): DungeonContext {
  const cultureId = pack.cells?.culture?.[cell] ?? 0;
  const culture = pack.cultures?.[cultureId];
  const biome = pack.biomes?.[pack.cells?.biome?.[cell] ?? 0];
  const state = pack.states?.[pack.cells?.state?.[cell] ?? 0];
  const province = pack.provinces?.[pack.cells?.province?.[cell] ?? 0];
  const religion = pack.religions?.[pack.cells?.religion?.[cell] ?? 0];

  return {
    seed,
    cell,
    cultureName: culture?.name || (cultureId ? Names.getCulture(cultureId) : "the local folk"),
    alignment: (culture?.alignment ?? "neutral") as Alignment,
    biomeName: biome?.name || "wilderness",
    height: pack.cells?.h?.[cell] ?? 0,
    stateName: state?.name,
    provinceName: province?.name,
    religionName: religion?.name,
    name
  };
}

export function dungeonName(cell: number, seed: string): string {
  return generateDungeonName(dungeonContext(cell, seed));
}

/** The tiny record stored on a new dungeon marker; the profile is built on first read */
export function createDungeonContent(): MarkerGeneratedContent {
  return { kind: DUNGEON_KIND, version: DUNGEON_VERSION, seed: options.map.seed };
}

export function registerDungeonRenderer(): void {
  registerGeneratedKind(DUNGEON_KIND, {
    markerTypes: ["dungeons", "dungeon"],
    create: () => createDungeonContent(),
    render: (marker: Marker, content: MarkerGeneratedContent, salt) =>
      renderDungeonProfile(generateDungeonProfile(dungeonContext(marker.cell, content.seed, marker.name), salt ?? ""))
  });
}

registerDungeonRenderer();
