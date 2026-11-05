// Mapping and lifecycle utilities to turn danger markers into active Living World threats and lairs
import type { UnitType } from "@/data/roster-content";
import { getLairDef, instantiateLairUnits } from "@/data/living-lairs";
import type { Marker } from "@/model/story/markers-generator";
import type { ProvinceLair, TroubleTheme } from "@/types/living";

export const DANGER_MARKER_TYPES: readonly string[] = [
  "brigands",
  "brigand",
  "bandits",
  "bandit",
  "highwaymen",
  "robbers",
  "pirates",
  "pirate",
  "hill-monsters",
  "hill-monster",
  "lake-monsters",
  "lake-monster",
  "sea-monsters",
  "sea-monster",
  "monsters",
  "monster",
  "dungeons",
  "dungeon",
  "caves",
  "cave",
  "disturbed-burials",
  "disturbed-burial",
  "necropolises",
  "necropolis",
  "rifts",
  "rift",
  "volcanoes",
  "volcano"
];

const DANGER_TYPE_SET = new Set(DANGER_MARKER_TYPES);

export function isDangerMarkerType(type: string | undefined): boolean {
  if (!type) return false;
  return DANGER_TYPE_SET.has(type.toLowerCase().trim());
}

export function isDangerMarker(marker: Pick<Marker, "type" | "hidden"> | null | undefined): boolean {
  if (!marker || marker.hidden) return false;
  return isDangerMarkerType(marker.type);
}

interface LairArchetypeMapping {
  lairId: string;
  defaultTheme: TroubleTheme;
  isMaritime: boolean;
  baseLevel: number;
}

export function getLairArchetypeForMarker(type: string): LairArchetypeMapping {
  const normalized = type.toLowerCase().trim();

  if (normalized.includes("pirate")) {
    return { lairId: "thieves_stronghold", defaultTheme: "burg", isMaritime: true, baseLevel: 4 };
  }
  if (normalized.includes("sea-monster")) {
    return { lairId: "monster_nest", defaultTheme: "resource", isMaritime: true, baseLevel: 5 };
  }
  if (normalized.includes("lake-monster")) {
    return { lairId: "monster_nest", defaultTheme: "resource", isMaritime: true, baseLevel: 4 };
  }
  if (normalized.includes("hill-monster") || normalized.includes("monster")) {
    return { lairId: "monster_nest", defaultTheme: "resource", isMaritime: false, baseLevel: 4 };
  }
  if (
    normalized.includes("brigand") ||
    normalized.includes("bandit") ||
    normalized.includes("highway") ||
    normalized.includes("robber")
  ) {
    return { lairId: "bandit_camp", defaultTheme: "burg", isMaritime: false, baseLevel: 3 };
  }
  if (normalized.includes("dungeon")) {
    return { lairId: "ancient_evil", defaultTheme: "ruin", isMaritime: false, baseLevel: 5 };
  }
  if (normalized.includes("cave")) {
    return { lairId: "blight_infestation", defaultTheme: "resource", isMaritime: false, baseLevel: 3 };
  }
  if (normalized.includes("burial")) {
    return { lairId: "ancient_evil", defaultTheme: "ruin", isMaritime: false, baseLevel: 4 };
  }
  if (normalized.includes("necropolis")) {
    return { lairId: "ancient_evil", defaultTheme: "ruin", isMaritime: false, baseLevel: 5 };
  }
  if (normalized.includes("rift")) {
    return { lairId: "magical_gate", defaultTheme: "ruin", isMaritime: false, baseLevel: 5 };
  }
  if (normalized.includes("volcano")) {
    return { lairId: "cursed_earth", defaultTheme: "resource", isMaritime: false, baseLevel: 4 };
  }

  return { lairId: "monster_nest", defaultTheme: "resource", isMaritime: false, baseLevel: 4 };
}

export function computeMarkerThreatLevel(marker: Marker, seed = 0): number {
  const archetype = getLairArchetypeForMarker(marker.type);
  const hash = Math.abs((marker.i * 31 + marker.cell * 17 + seed * 13) % 4);
  const level = archetype.baseLevel + hash - 1;
  return Math.max(3, Math.min(6, level));
}

/** Construct an active ProvinceLair object directly from a danger marker */
export function createLairFromMarker(marker: Marker, unitTypes?: Record<string, UnitType>): ProvinceLair {
  const archetype = getLairArchetypeForMarker(marker.type);
  const def = getLairDef(archetype.lairId);
  const level = computeMarkerThreatLevel(marker);
  const isWater = pack.cells?.h ? pack.cells.h[marker.cell] < 20 : false;
  const isMaritime = archetype.isMaritime || isWater;
  const provinceId = pack.cells?.province?.[marker.cell] ?? 0;

  return {
    id: def.id,
    name: marker.name || def.name,
    level,
    theme: archetype.defaultTheme,
    cell: marker.cell,
    markerId: marker.i,
    provinceId,
    maritime: isMaritime,
    raidThreshold: def.raidThreshold,
    raidUnits: instantiateLairUnits(def.raidUnits, unitTypes),
    defenders: instantiateLairUnits(def.defenderUnits, unitTypes),
    fortified: def.fortified,
    raidPending: false,
    seasonsActive: 0
  };
}

/** Converts a cleared danger marker into a historical ruin landmark, keeping historical continuity */
export function convertDangerMarkerToRuins(marker: Marker, conquerorName?: string): void {
  marker.type = "ruins";
  marker.icon = "🏛️";
  if (!marker.name.toLowerCase().startsWith("ruins")) {
    marker.name = `Ruins of ${marker.name}`;
  }
  const resolution = conquerorName ? `Site cleared and dismantled by ${conquerorName}.` : "Site cleared and pacified.";
  marker.note = marker.note ? `${marker.note}\n\n${resolution}` : resolution;
  delete marker.threatId;
}
