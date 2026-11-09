// Mapping and lifecycle utilities to turn danger markers into active Living World threats and lairs
import type { Marker } from "@/model/story/markers-generator";
import type { TroubleTheme } from "@/types/living";

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
