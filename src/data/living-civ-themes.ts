import type {
  CivBuildingDef,
  CivEraDef,
  CivEraId,
  CivImprovementDef,
  CivTechDef,
  CivThemeId,
  CivThemeProfile,
  CivUnitDef
} from "@/types/living";
import { CIV_ERAS } from "./living-civ-techs";

const FANTASY_ERA_NAMES: Record<CivEraId, string> = {
  ancient: "Age of Myth",
  classical: "Age of Heroes",
  medieval: "Age of Kingdoms",
  renaissance: "Arcane-Clockwork",
  industrial: "Age of Industry",
  modern: "Age of Steam",
  atomic: "Age of Atom",
  information: "Age of Wonders"
};

const HISTORICAL_ERA_NAMES: Record<CivEraId, string> = {
  ancient: "Ancient Era",
  classical: "Classical Era",
  medieval: "Medieval Era",
  renaissance: "Renaissance Era",
  industrial: "Industrial Era",
  modern: "Modern Era",
  atomic: "Atomic Era",
  information: "Information Era"
};

const ASTRAL_ERA_NAMES: Record<CivEraId, string> = {
  ancient: "Pre-Warp",
  classical: "First Contact",
  medieval: "Colonial Expansion",
  renaissance: "System Hegemony",
  industrial: "Interstellar Age",
  modern: "Warp Ascendancy",
  atomic: "Transcendent Age",
  information: "Singularity"
};

const ASTRAL_UNIT_NAMES: Record<string, string> = {
  warrior: "Enforcer",
  scout: "Pathfinder Drone",
  settler: "Colony Pod",
  builder: "Constructor Drone",
  archer: "Railgunner",
  spearman: "Lancer Trooper",
  swordsman: "Plasma Blade",
  horseman: "Grav-Skimmer",
  knight: "Skimmer Lancer",
  catapult: "Ion Mortar",
  crossbowman: "Pulse Rifleman",
  trebuchet: "Railgun Battery",
  longswordsman: "Warframe Trooper",
  musketman: "Gauss Rifleman",
  cannon: "Plasma Cannon",
  frigate: "Missile Frigate",
  galleass: "Escort Cruiser",
  caravel: "Survey Ship",
  trireme: "Patrol Skiff",
  artillery: "Siege Walker",
  tank: "Hovertank",
  battleship: "Dreadnought",
  submarine: "Stealth Submersible",
  great_prophet: "Ascended Prophet",
  missionary: "Signal Emissary",
  inquisitor: "Firewall Agent"
};

const ASTRAL_BUILDING_NAMES: Record<string, string> = {
  palace: "Command Nexus",
  monument: "Memorial Uplink",
  barracks: "Marine Barracks",
  granary: "Hydroponics Bay",
  library: "Data Archive",
  market: "Trade Hub",
  temple: "Meditation Chamber",
  walls: "Deflector Grid",
  university: "Science Academy",
  bank: "Credit Exchange",
  workshop: "Fabricator",
  factory: "Autofactory",
  observatory: "Deep-Space Array",
  aqueduct: "Water Recycler",
  shrine: "Faith Beacon",
  harbor: "Orbital Dock",
  castle: "Shield Bastion",
  arsenal: "Weapons Foundry"
};

const ASTRAL_IMPROVEMENT_NAMES: Record<string, string> = {
  farm: "Agripod",
  mine: "Extractor",
  pasture: "Gene-Pasture",
  plantation: "Bio-Dome",
  camp: "Survey Camp",
  quarry: "Regolith Quarry",
  trading_post: "Trade Beacon",
  lumber_mill: "Bio-Processor",
  road: "Transit Line",
  fishing_boats: "Harvest Drones"
};

export const CIV_THEMES: Readonly<Record<CivThemeId, CivThemeProfile>> = {
  fantasy: {
    id: "fantasy",
    label: "Fantasy",
    eraCap: "renaissance",
    eraNames: FANTASY_ERA_NAMES,
    techNames: {},
    unitNames: {},
    buildingNames: {},
    improvementNames: {}
  },
  historical: {
    id: "historical",
    label: "Historical",
    eraCap: "information",
    eraNames: HISTORICAL_ERA_NAMES,
    techNames: {},
    unitNames: {},
    buildingNames: {},
    improvementNames: {}
  },
  astral: {
    id: "astral",
    label: "Astral Cartographer",
    eraCap: "information",
    eraNames: ASTRAL_ERA_NAMES,
    techNames: {},
    unitNames: ASTRAL_UNIT_NAMES,
    buildingNames: ASTRAL_BUILDING_NAMES,
    improvementNames: ASTRAL_IMPROVEMENT_NAMES
  }
};

export function getCivTheme(id: CivThemeId): CivThemeProfile {
  return CIV_THEMES[id];
}

export function civEraIndex(era: CivEraId): number {
  return CIV_ERAS.findIndex(entry => entry.id === era);
}

export function isCivEraAvailable(theme: CivThemeId, era: CivEraId): boolean {
  return civEraIndex(era) <= civEraIndex(CIV_THEMES[theme].eraCap);
}

export function activeCivEras(theme: CivThemeId): readonly CivEraDef[] {
  return CIV_ERAS.filter(entry => isCivEraAvailable(theme, entry.id));
}

export function resolveCivEraName(theme: CivThemeId, era: CivEraId): string {
  return CIV_THEMES[theme].eraNames[era];
}

export function resolveCivTechName(theme: CivThemeId, tech: CivTechDef): string {
  return CIV_THEMES[theme].techNames[tech.id] ?? tech.name;
}

export function resolveCivUnitName(theme: CivThemeId, unit: CivUnitDef): string {
  return CIV_THEMES[theme].unitNames[unit.id] ?? unit.name;
}

export function resolveCivBuildingName(theme: CivThemeId, building: CivBuildingDef): string {
  return CIV_THEMES[theme].buildingNames[building.id] ?? building.name;
}

export function resolveCivImprovementName(theme: CivThemeId, improvement: CivImprovementDef): string {
  return CIV_THEMES[theme].improvementNames[improvement.id] ?? improvement.name;
}

/** Astral view wins; otherwise modern/historical presets opt in; fantasy is the default. */
export function selectCivTheme(options: { astral?: boolean; historical?: boolean }): CivThemeId {
  if (options.astral) return "astral";
  return options.historical ? "historical" : "fantasy";
}
