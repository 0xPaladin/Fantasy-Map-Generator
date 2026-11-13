// Living World seasonal simulation engine. See docs/plans/living-world.md

import { rollAlignment, rollFigureTraits, traitsRng } from "@/data/culture-traits";
import {
  CIV_BELIEF_BY_ID,
  CIV_ENHANCER_BELIEFS,
  CIV_FOLLOWER_BELIEFS,
  CIV_FOUNDER_BELIEFS,
  CIV_PANTHEONS,
  CIV_RELIGION_NAMES
} from "@/data/living-civ-beliefs";
import { CIV_BUILDING_BY_ID, CIV_BUILDINGS } from "@/data/living-civ-buildings";
import { CIV_CIVILIAN_BY_ID } from "@/data/living-civ-civilians";
import { CIV_IMPROVEMENT_BY_ID, CIV_RESOURCE_BY_ID } from "@/data/living-civ-improvements";
import {
  CIV_TECH_BY_ID,
  CIV_TECHS,
  computePolityTechDevelopment,
  seedTechsFromDevelopment
} from "@/data/living-civ-techs";
import { isCivEraAvailable, resolveCivTechName, selectCivTheme } from "@/data/living-civ-themes";
import { RESOURCE_FACTION_IDS } from "@/data/living-troubles";
import {
  assignStateRoster,
  type BuildingDef,
  inferRosterForCulture,
  type ResolvedRoster,
  type UnitType
} from "@/data/roster-content";
import { currentContent } from "@/data/roster-store";
import { REGION_TIER_STEPS, SETTLEMENT_TIER_STEPS } from "@/data/tiers";
import {
  type BattleModifiers,
  type BattleOutcome,
  type BattleSession,
  type BattleTacticalOrder,
  estimateOdds,
  finalizeBattle,
  initBattleSession,
  stepBattleRound
} from "@/model/battle/battle";
import { garrisonUnits, minorGarrisonUnits } from "@/model/battle/garrisons";
import { Accounts } from "@/model/economy/accounts";
import { Production } from "@/model/economy/production-generator";
import { Prosperity as UpstreamProsperity } from "@/model/economy/prosperity";
import { Routes } from "@/model/economy/routes-generator";
import { StateOrders } from "@/model/economy/state-orders";
import { type FigureBias, figureBias } from "@/model/physical/figure-bias";
import {
  armyHp,
  armyIsEmpty,
  armyIsRangedBlocks,
  armyMen,
  armySpeed,
  armyStrength,
  chooseOrder,
  fromBattleUnits,
  fromBattleUnitsMen,
  getUnitRequiredGoods,
  isCivilianUnit,
  levyUnitFor,
  matchRosterUnitByCategory,
  migrateArmyBlocks,
  nextRosterUnitInCategory,
  normalizeArmy,
  pickRosterUnit,
  requiredTechFor,
  toBattleTypes,
  toBattleUnits,
  toBattleUnitsMen
} from "@/model/physical/living-armies";
import { canReadUpstreamEconomy, factionUpstreamIncome, SEASON_DAYS } from "@/model/physical/living-faction-economy";
import { AUDIT_CORRUPTION_CUT, auditRecovery, rulerBias, stateEconomyModifiers } from "@/model/physical/living-rulers";
import { type Burg, Burgs, isSurfaceBurg } from "@/model/political/burgs-generator";
import { ensureFactionNodeSim, Factions, syncFactionState } from "@/model/political/factions-generator";
import {
  Military,
  type Regiment,
  reconcileRegimentBlocks,
  syncRegimentTotals
} from "@/model/political/military-generator";
import type { Province } from "@/model/political/provinces-generator";
import { noFinance, type State, States } from "@/model/political/states-generator";
import { Development } from "@/model/society/development-generator";
import { Names } from "@/model/society/names-generator";
import { isAstralView } from "@/renderers/view-mode";
import type { ArmyBlock, ArmyUnit } from "@/types/battle";
import type { Good } from "@/types/economy";
import type {
  Faction,
  FactionHq,
  FactionNodeKey,
  FactionNodeYieldBreakdown,
  FactionOutpost,
  FactionYieldBreakdown
} from "@/types/factions";
import type { HistoricalFigure, HistoryEventType, HistRef, Realm } from "@/types/history";
import {
  type ArmyBattleRecord,
  type ArmySimState,
  type ArmyStance,
  type BurgSimState,
  type CellResourceInfo,
  type CellSimState,
  type CellTerrainInfo,
  type CellYieldSource,
  type CivBeliefDef,
  type CivBuildingDef,
  type CivResourceClass,
  type CivTechDef,
  type CivThemeId,
  type CivUnitDef,
  type GrudgeReason,
  type HappinessBreakdown,
  type HeroDoctrine,
  type HeroGuildState,
  type LivingNewsItem,
  type LivingNewsKind,
  type LivingWorldState,
  type MissionTag,
  type ProductionItem,
  type ProvinceTrouble,
  type ReligionBeliefState,
  SEASON_NAMES,
  type SeasonId,
  type StateAgenda,
  type StateCityYieldBreakdown,
  type StatePolitySim,
  type StateYieldBreakdown,
  type TreatyKind,
  type TroubleTheme,
  type TroubleUnitRole,
  type UnitSimState,
  type YieldDelta,
  type YieldValues
} from "@/types/living";
import { minmax } from "@/utils";
import { SEA_LEVEL } from "@/utils/height-utils";
import { createRng, type Rng } from "@/utils/rng";
import { Chronicle } from "./history-generator";
import type { FigureCheck, HeroMissionFit } from "./living-heroes";
import { LivingHeroes } from "./living-heroes";
import { LivingThreats } from "./living-threats";

const MAX_RECENT_NEWS = 50;
const WHEEL_YEAR_LEAP = 150;
const GIANT_PROVINCE_LIMIT = 3;
const SCHOLARLY_BUILDINGS = new Set(["library", "university", "public_school"]);
const DEVELOPMENT_DECAY_SLACK = 3; // rural cells keep a little more than their land allows
const SCHOLARLY_GOODS = ["Paper", "Ink", "Books", "Glass"] as const;
const SCHOLAR_SCIENCE_CAP = 5; // books light a city's lamps but cannot replace schools
const COURT_PROVISION_YIELD = 3; // culture and faith a fully served court provides per season
const CHARTER_TITHE = "Chartered Faction Tithes"; // the state budget line charters pay
const SABOTAGE_ORDER = 15; // public order a ruined working costs its province

const ERA_EPITHETS = ["Ash", "the Compact", "Drowned Kings", "Iron and Salt", "Quiet Stars", "Broken Crowns"] as const;
const ERA_ORDINALS = [
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth"
] as const;

/** Hero level from lifetime xp: 40 + 20 × level per level */
export function figureLevel(xp = 0): number {
  return LivingHeroes.figureLevel(xp);
}

export type { FigureCheck, HeroMissionFit } from "./living-heroes";

/** xp needed to enter a level: L1 0, L2 60, L3 140, ... */
export function xpForHeroLevel(level: number): number {
  return LivingHeroes.xpForHeroLevel(level);
}

/** Old saves receive no retroactive points: absent progression starts at the current level. */
export function applyHeroLevels(figure: HistoricalFigure): boolean {
  return LivingHeroes.applyHeroLevels(figure);
}

/** Lazily give an old roster hero identity without changing their existing pool ratings. */
export function ensureHeroIdentity(figure: HistoricalFigure): void {
  LivingHeroes.ensureHeroIdentity(figure);
}

export function heroAlignmentModifier(figure: HistoricalFigure): number {
  return LivingHeroes.heroAlignmentModifier(figure);
}
export function heroMissionFit(figure: HistoricalFigure, tags: readonly MissionTag[]): HeroMissionFit {
  return LivingHeroes.heroMissionFit(figure, tags);
}

export function figureCheckRoll(
  rng: Rng,
  figure: HistoricalFigure,
  pool: "m" | "w" | "s" | "c",
  poolGen: number,
  dc: number,
  guildBonus: number,
  relicBonus: number,
  tags: readonly MissionTag[],
  stamina = 0,
  injuries = 0,
  synergy = 0,
  untrained = false
): FigureCheck {
  return LivingHeroes.figureCheckRoll(
    rng,
    figure,
    pool,
    poolGen,
    dc,
    guildBonus,
    relicBonus,
    tags,
    stamina,
    injuries,
    synergy,
    untrained
  );
}

export function settlementTierFromPop(populationThousands: number): number {
  let tier = 0;
  for (const step of SETTLEMENT_TIER_STEPS) {
    if (populationThousands >= step) tier++;
  }
  return tier;
}

export function regionTierFromPop(populationThousands: number): number {
  let tier = 0;
  for (const step of REGION_TIER_STEPS) {
    if (populationThousands >= step) tier++;
  }
  return tier;
}

export { type FigureBias, figureBias } from "./figure-bias";

const GRUDGE_WEIGHTS: Record<GrudgeReason, number> = {
  conquest: 40,
  sacked: 30,
  slain_ruler: 35,
  slain_general: 35,
  repulsed: 20
};

/** Reconcile roster building IDs from FMG Burg feature flags (walls, plaza, temple, citadel) */
export function syncBurgBuildingsFromFlags(burg: Burg, existing: string[]): string[] {
  const set = new Set(existing);
  const wallTier = Number(burg.walls ?? 0);
  if (wallTier >= 3) {
    set.delete("walls1");
    set.delete("walls2");
    set.add("walls3");
  } else if (wallTier === 2 || (wallTier === 1 && burg.citadel)) {
    set.delete("walls1");
    if (!set.has("walls3")) set.add("walls2");
  } else if (wallTier === 1 && !set.has("walls2") && !set.has("walls3")) {
    set.add("walls1");
  } else if (wallTier === 0) {
    set.delete("walls1");
    set.delete("walls2");
    set.delete("walls3");
  }

  if (burg.plaza && !set.has("market1") && !set.has("market2") && !set.has("market3")) {
    set.add("market1");
  }
  if (burg.temple && !set.has("temple1") && !set.has("temple2") && !set.has("temple3")) {
    set.add("temple1");
  }
  if (burg.citadel && !set.has("barracks1") && !set.has("barracks2") && !set.has("barracks3")) {
    set.add("barracks1");
  }
  return Array.from(set);
}

/** Push completed roster buildings back onto FMG Burg flags */
export function syncBurgFlagsFromBuildings(burg: Burg, buildings: string[]): void {
  if (buildings.includes("walls3")) {
    burg.walls = 3;
    burg.citadel = 1;
  } else if (buildings.includes("walls2")) {
    burg.walls = Math.max(Number(burg.walls ?? 0), 2);
    burg.citadel = 1;
  } else if (buildings.includes("walls1")) {
    burg.walls = Math.max(Number(burg.walls ?? 0), 1);
  }

  if (buildings.some(id => id.startsWith("market"))) burg.plaza = 1;
  if (buildings.some(id => id.startsWith("temple"))) burg.temple = 1;
  if (buildings.includes("barracks2") || buildings.includes("barracks3")) burg.citadel = 1;
}

/**
 * OpenCiv building families that mirror the native FMG Burg flags.
 * Slice 3 keeps these ids in `bSim.civBuildings`, next to the legacy AER list.
 */
const CIV_WALL_BUILDINGS: readonly (readonly [string, number])[] = [
  ["walls", 1],
  ["castle", 2],
  ["arsenal", 3],
  ["military_base", 3]
];
const CIV_PLAZA_BUILDINGS = ["market", "bank", "stock_exchange", "bazaar"] as const;
const CIV_TEMPLE_BUILDINGS = ["shrine", "temple", "cathedral", "monastery", "mosque", "pagoda"] as const;
const CIV_PORT_BUILDINGS = ["harbor", "lighthouse", "seaport"] as const;

/**
 * Reconcile native FMG Burg flags into OpenCiv building ids (flags win).
 * Flag families are added and removed as a unit, so lowering `burg.walls` in
 * BurgsEditor demolishes the OpenCiv wall line on the next sync.
 */
export function syncCivBuildingsFromFlags(burg: Burg, existing: readonly string[]): string[] {
  const set = new Set(existing);

  if (burg.capital) set.add("palace");
  else set.delete("palace");

  const walls = Number(burg.walls ?? 0);
  const wallBuilding = CIV_WALL_BUILDINGS.find(([, tier]) => walls >= tier)?.[0];
  const wallFamily = new Set(CIV_WALL_BUILDINGS.map(([id]) => id));
  for (const id of wallFamily) set.delete(id);
  if (wallBuilding) set.add(wallBuilding);
  // A citadel without a wall tier still reads as a castle.
  if (!wallBuilding && burg.citadel) set.add("castle");

  const syncFamily = (enabled: boolean, family: readonly string[], canonical: string) => {
    for (const id of family) set.delete(id);
    if (enabled) set.add(canonical);
  };
  syncFamily(Boolean(burg.plaza), CIV_PLAZA_BUILDINGS, "market");
  syncFamily(Boolean(burg.temple), CIV_TEMPLE_BUILDINGS, "temple");
  syncFamily(Boolean(burg.port), CIV_PORT_BUILDINGS, "harbor");

  return Array.from(set);
}

/** Push completed OpenCiv buildings back onto native FMG Burg flags (buildings raise flags). */
export function syncCivFlagsFromBuildings(burg: Burg, civBuildings: readonly string[]): void {
  const held = new Set(civBuildings);

  let walls = 0;
  for (const [id, tier] of CIV_WALL_BUILDINGS) if (held.has(id)) walls = Math.max(walls, tier);
  if (walls > 0) burg.walls = Math.max(Number(burg.walls ?? 0), walls);
  if (held.has("castle") || held.has("arsenal") || held.has("military_base")) burg.citadel = 1;

  if (CIV_PLAZA_BUILDINGS.some(id => held.has(id))) burg.plaza = 1;
  if (CIV_TEMPLE_BUILDINGS.some(id => held.has(id))) burg.temple = 1;
  if (CIV_PORT_BUILDINGS.some(id => held.has(id))) burg.port = 1;
  if (held.has("palace")) burg.capital = 1;
}

const CIV_YIELD_KEYS = ["food", "production", "gold", "science", "culture", "faith", "happiness"] as const;

const RESOURCE_ID_ALIASES: Record<string, string> = {
  gemstones: "gems",
  game: "deer"
};

/** Fresh zeroed OpenCiv yield record. */
export function emptyYields(): YieldValues {
  return { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0, happiness: 0 };
}

function humanizeId(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function hasYield(delta: YieldDelta): boolean {
  return CIV_YIELD_KEYS.some(key => (delta[key] ?? 0) !== 0);
}

/** A cell has fresh water if it carries a river or borders a freshwater lake. */
export function hasFreshWater(cell: number): boolean {
  const cells = pack.cells;
  if (Number(cells.r?.[cell] ?? 0) > 0) return true;

  const feature = pack.features?.[Number(cells.f?.[cell] ?? 0)];
  if (feature?.type === "lake" && feature.subtype === "freshwater") return true;

  for (const neighbor of cells.c?.[cell] ?? []) {
    const neighborFeature = pack.features?.[Number(cells.f?.[neighbor] ?? 0)];
    if (neighborFeature?.type === "lake" && neighborFeature.subtype === "freshwater") return true;
  }
  return false;
}

function cellTerrainId(cell: number, height: number, biome: number): string {
  if (height < SEA_LEVEL) {
    const feature = pack.features?.[Number(pack.cells.f?.[cell] ?? 0)];
    if (feature?.type === "lake" && feature.subtype === "freshwater") return "freshwater";
    return Number(pack.cells.harbor?.[cell] ?? 0) > 0 ? "shallow_ocean" : "ocean";
  }
  if (height >= 70) return "mountain";
  if (height >= 50) return "hill";

  switch (biome) {
    case 1:
    case 2:
      return "desert";
    case 3:
    case 5:
      return "plains";
    case 4:
      return "grass";
    case 6:
    case 8:
      return "forest";
    case 7:
      return "jungle";
    case 9:
      return "taiga";
    case 10:
      return "tundra";
    case 11:
      return "snow";
    case 12:
      return "marsh";
    default:
      return "grass";
  }
}

/** Terrain, elevation and movement metadata for a Voronoi cell. */
export function getCellTerrainInfo(cell: number): CellTerrainInfo {
  const height = Number(pack.cells.h?.[cell] ?? 0);
  const biome = Number(pack.cells.biome?.[cell] ?? 0);
  const isWaterCell = height < SEA_LEVEL;
  const isMountain = height >= 70;
  const isHill = !isWaterCell && !isMountain && height >= 50;

  let movementCost = 1;
  if (isMountain) movementCost = 9999;
  else if (isHill) movementCost = 2;
  else if (!isWaterCell && (biome === 6 || biome === 7 || biome === 8 || biome === 9 || biome === 12)) {
    movementCost = 2;
  }

  return {
    terrain: cellTerrainId(cell, height, biome),
    isWater: isWaterCell,
    isMountain,
    isHill,
    isWorkable: !isMountain,
    elevation: isMountain ? 2 : isHill ? 1 : 0,
    movementCost,
    hasFreshWater: hasFreshWater(cell)
  };
}

function baseTerrainYields(cell: number, info: CellTerrainInfo): YieldDelta {
  const height = Number(pack.cells.h?.[cell] ?? 0);
  const biome = Number(pack.cells.biome?.[cell] ?? 0);

  if (info.isMountain) return {};

  if (info.isWater) {
    if (info.terrain === "freshwater") return { food: 2 };
    if (info.terrain === "shallow_ocean") return { food: 1, gold: 1 };
    return { food: 1 };
  }

  // Forest canopy replaces the underlying flat/hill yield.
  if (biome === 7) return { food: 2 };
  if (biome === 6 || biome === 8 || biome === 9) return { food: 1, production: 1 };

  if (height >= 50) return { production: 2 };

  switch (biome) {
    case 1:
    case 2:
      return info.hasFreshWater ? { food: 2 } : {};
    case 3:
    case 5:
      return { food: 1, production: 1 };
    case 4:
      return { food: 2 };
    case 10:
      return { food: 1 };
    case 12:
      return { food: 1 };
    default:
      return {};
  }
}

/** Classify an FMG trade good into OpenCiv's Bonus / Strategic / Luxury taxonomy. */
export function classifyGood(good: Good | undefined): CivResourceClass | null {
  if (!good) return null;

  const tags = new Set(good.tags ?? []);
  const coverage = good.demandCoverage ?? {};

  if ((coverage.luxury ?? 0) > 0 || tags.has("luxury")) return "luxury";
  if ((coverage.military ?? 0) > 0 || tags.has("military") || tags.has("ore")) return "strategic";
  if (
    (coverage.food ?? 0) > 0 ||
    (coverage.construction ?? 0) > 0 ||
    (coverage.utilities ?? 0) > 0 ||
    tags.has("food") ||
    tags.has("construction")
  ) {
    return "bonus";
  }
  return null;
}

function civResourceIdForGood(good: Good): string | null {
  const normalized = good.name.toLowerCase().trim().replace(/\s+/g, "_");
  for (const candidate of [normalized, RESOURCE_ID_ALIASES[normalized]]) {
    if (candidate && CIV_RESOURCE_BY_ID[candidate]) return candidate;
  }
  return null;
}

/** The good on a cell plus its OpenCiv resource class and reveal status. */
export function getCellResource(
  cell: number,
  playerStateId = 0,
  living: LivingWorldState | undefined = pack.history?.living
): CellResourceInfo | null {
  const goodId = Number(pack.cells.good?.[cell] ?? 0);
  if (!goodId) return null;

  const good = options.map.goods?.[goodId];
  const resourceClass = classifyGood(good);
  if (!good || !resourceClass) return null;

  const resourceId = civResourceIdForGood(good);
  const revealTech = resourceId ? CIV_RESOURCE_BY_ID[resourceId]?.revealTech : undefined;
  const stateSim = playerStateId > 0 ? living?.states?.[playerStateId] : undefined;
  const revealed = !revealTech || Boolean(stateSim?.researchedTechs?.includes(revealTech));

  return { goodId, goodName: good.name, resourceId, class: resourceClass, revealed };
}

/** A non-removed burg that runs the full OpenCiv city loop. */
export function isMajorBurg(burg: Burg | undefined | null): boolean {
  if (!burg?.i || burg.removed) return false;
  if (burg.capital === 1) return true;
  if (burg.state && pack.states?.[burg.state]?.capital === burg.i) return true;
  if (pack.provinces?.some(province => province?.i && !province.removed && province.burg === burg.i)) return true;
  if (pack?.history?.living?.burgs?.[burg.i]?.isMajor) return true;
  return !burg.state && settlementTierFromPop(burg.population ?? 0) >= 3;
}

/** A non-capital settlement inside a province: a village tile improvement. */
export function isMinorBurg(burg: Burg | undefined | null): boolean {
  if (!burg?.i || burg.removed || isMajorBurg(burg)) return false;
  const provinceId = Number(pack.cells.province?.[burg.cell] ?? 0);
  if (!provinceId) return false;
  const province = pack.provinces?.[provinceId];
  return Boolean(province?.i && !province.removed && province.burg !== burg.i);
}

function burgAtCell(cell: number): Burg | undefined {
  const burgId = Number(pack.cells.burg?.[cell] ?? 0);
  return burgId ? pack.burgs?.[burgId] : undefined;
}

function isBurgPillaged(burg: Burg, living: LivingWorldState | undefined): boolean {
  return Boolean(burg.shanty) || Boolean(living?.burgs?.[burg.i]?.pillaged);
}

function isMinorBurgTroubled(burg: Burg, living: LivingWorldState | undefined): boolean {
  const provinceId = Number(pack.cells.province?.[burg.cell] ?? 0);
  const trouble = provinceId ? living?.provinces?.[provinceId]?.trouble : null;
  return Boolean(trouble && trouble.burgId === burg.i);
}

function resourceYieldDelta(resource: CellResourceInfo, good: Good, improved: boolean): YieldDelta {
  if (resource.class === "strategic" && !resource.revealed) return {};

  const amount = improved ? 2 : 1;
  const tags = new Set(good.tags ?? []);

  if (resource.class === "luxury") {
    if (tags.has("food")) return { food: amount };
    if (tags.has("construction") || tags.has("ore")) return { production: amount };
    return { gold: amount };
  }

  if (resource.class === "strategic") return { production: amount };

  if (tags.has("construction") || tags.has("ore") || tags.has("fuel")) return { production: amount };
  return { food: amount };
}

/**
 * Base improvement yields. Tech upgrades are added separately from the
 * OpenCiv `tileBonuses` catalog so Science visibly unlocks them.
 */
function improvementYieldDelta(improvementId: string, resource: CellResourceInfo | null): YieldDelta {
  switch (improvementId) {
    case "farm":
      return { food: 1 };
    case "mine":
    case "quarry":
      return { production: 1 };
    case "pasture": {
      const food = resource?.resourceId === "cattle" || resource?.resourceId === "sheep";
      return food ? { food: 1 } : { production: 1 };
    }
    case "plantation":
      return { gold: 2 };
    case "camp":
      return { production: 1 };
    case "lumber_mill":
      return { production: 1 };
    case "trading_post":
      return { gold: 1 };
    case "fishing_boats":
      return { food: 1, gold: 1 };
    default:
      return {};
  }
}

/** OpenCiv tile ids a generic FMG improvement can match, e.g. `mine` -> `iron_mine`. */
function improvementTileTypes(improvementId: string, resource: CellResourceInfo | null): string[] {
  const types = [improvementId];
  const resourceId = resource?.resourceId;
  if (!resourceId) return types;
  types.push(`${resourceId}_${improvementId}`, `improved_${resourceId}`);
  return types;
}

/** Tech tile bonuses for an active improvement, e.g. Chemistry +1 Production from Mines. */
function techTileBonusDelta(
  improvementId: string,
  cell: number,
  resource: CellResourceInfo | null,
  researchedTechs: readonly string[]
): YieldDelta {
  if (researchedTechs.length === 0) return {};
  const tileTypes = new Set(improvementTileTypes(improvementId, resource));
  const freshWater = hasFreshWater(cell);
  const total: YieldDelta = {};

  for (const techId of researchedTechs) {
    const tech = CIV_TECH_BY_ID[techId];
    for (const bonus of tech?.tileBonuses ?? []) {
      if (!tileTypes.has(bonus.tileType)) continue;
      if (bonus.freshWater !== undefined && bonus.freshWater !== freshWater) continue;
      for (const key of CIV_YIELD_KEYS) total[key] = (total[key] ?? 0) + (bonus.stats[key] ?? 0);
    }
  }
  return total;
}

function minorBurgYieldDelta(burg: Burg, pillaged: boolean): YieldDelta {
  if (pillaged) return {};

  const yields: YieldDelta = { food: 1, gold: 2 };
  if (burg.plaza) yields.gold = (yields.gold ?? 0) + 1;
  if (burg.temple) {
    yields.faith = 1;
    yields.culture = 1;
  }
  if (burg.walls) yields.production = 1;
  if (burg.port) {
    yields.food = (yields.food ?? 0) + 1;
    yields.gold = (yields.gold ?? 0) + 1;
  }
  return yields;
}

/** Every additive yield contribution on a cell: terrain, resource, improvement, minor burg. */
export function getCellYieldSources(
  cell: number,
  playerStateId = 0,
  living: LivingWorldState | undefined = pack.history?.living
): CellYieldSource[] {
  const info = getCellTerrainInfo(cell);
  if (!info.isWorkable) return [];

  const sources: CellYieldSource[] = [];
  const terrainYields = baseTerrainYields(cell, info);
  if (hasYield(terrainYields)) {
    sources.push({ kind: "terrain", id: info.terrain, label: humanizeId(info.terrain), yields: terrainYields });
  }

  const resource = getCellResource(cell, playerStateId, living);
  const burg = burgAtCell(cell);
  const minorBurg = burg && isMinorBurg(burg) && !isMinorBurgTroubled(burg, living) ? burg : undefined;
  const minorPillaged = minorBurg ? isBurgPillaged(minorBurg, living) : false;
  const cellSim: CellSimState | undefined = living?.cells?.[cell];
  const improvementId = cellSim?.improvement ?? null;
  const improvementActive = Boolean(improvementId && !cellSim?.pillaged);
  const connected = improvementActive || Boolean(minorBurg && !minorPillaged);

  if (resource && options.map.goods?.[resource.goodId]) {
    const yields = resourceYieldDelta(resource, options.map.goods[resource.goodId], connected);
    if (hasYield(yields)) {
      sources.push({
        kind: "resource",
        id: resource.resourceId ?? resource.goodName,
        label: resource.goodName,
        yields
      });
    }
  }

  if (improvementId && improvementActive) {
    const yields = improvementYieldDelta(improvementId, resource);
    if (hasYield(yields)) {
      const def = CIV_IMPROVEMENT_BY_ID[improvementId];
      sources.push({ kind: "improvement", id: improvementId, label: def?.name ?? humanizeId(improvementId), yields });
    }

    const techs = living?.states?.[playerStateId]?.researchedTechs ?? [];
    const techYields = techTileBonusDelta(improvementId, cell, resource, techs);
    if (hasYield(techYields)) {
      sources.push({ kind: "tech", id: improvementId, label: "Technology upgrades", yields: techYields });
    }
  }

  if (minorBurg) {
    const yields = minorBurgYieldDelta(minorBurg, minorPillaged);
    if (hasYield(yields)) {
      sources.push({
        kind: "minor_burg",
        id: String(minorBurg.i),
        label: `${minorBurg.name ?? "Village"} (village)`,
        yields
      });
    }
  }

  return sources;
}

/** Sum all Slice 2 cell yields into one OpenCiv yield record. */
export function getCellYields(
  cell: number,
  playerStateId = 0,
  living: LivingWorldState | undefined = pack.history?.living
): YieldValues {
  const total = emptyYields();
  for (const source of getCellYieldSources(cell, playerStateId, living)) {
    for (const key of CIV_YIELD_KEYS) total[key] += source.yields[key] ?? 0;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Slice 3: autonomous Major Burg city loop (OpenCiv `City`)
// ---------------------------------------------------------------------------

/** A Major Burg works its centre for free plus citizen cells within this many Voronoi hops. */
export const MAX_WORK_DISTANCE = 3;
/** Culture border growth looks for unowned cells within this many hops. */
export const MAX_ACQUIRE_DISTANCE = 5;
/** Each OpenCiv citizen eats 2 Food per tick. */
export const FOOD_PER_CITIZEN = 2;
/** Citizens are assigned until the net Food surplus reaches this floor. */
export const DEFAULT_FOCUS_GROWTH_TARGET = 1;
/** While a Settler is queued, every surplus Food becomes Production. */
export const SETTLER_FOOD_TO_PRODUCTION_FACTOR = 1;
export const SETTLER_UNIT_ID = "settler";
/** OpenCiv city population ceiling. */
export const MAX_CITIZENS = 30;

/** OpenCiv citizen count for an FMG burg population (`floor(sqrt(pop * 2))`). */
export function citizensFromPopulation(population: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, population) * 2)));
}

/** FMG burg population for an OpenCiv citizen count (`citizens² / 2`). */
export function populationFromCitizens(citizens: number): number {
  const safe = Math.max(1, Math.floor(citizens));
  return Math.max(0.5, Math.round(((safe * safe) / 2) * 10) / 10);
}

/** Food bucket size that grows a city by one citizen: `15 + 8 × citizens`. */
export function foodNeededForGrowth(citizens: number): number {
  return 15 + 8 * Math.max(1, Math.floor(citizens));
}

/** Border culture bucket: `max(1, floor(floor(20 + (10N)^1.1) × cost / speed))`. */
export function borderCultureNeeded(tilesAcquired: number, costFactor = 1, speedFactor = 1): number {
  const base = Math.floor(20 + (10 * Math.max(0, tilesAcquired)) ** 1.1);
  const speed = speedFactor > 0 ? speedFactor : 1;
  return Math.max(1, Math.floor((base * costFactor) / speed));
}

/**
 * Influence score for a candidate border cell: lower is better.
 * `100 × hops` plus feature bonuses from §4.3 of the plan.
 */
export function borderInfluenceScore(
  cell: number,
  hops: number,
  playerStateId: number,
  living: LivingWorldState | undefined = pack.history?.living
): number {
  let score = 100 * Math.max(1, hops);
  const info = getCellTerrainInfo(cell);
  if (info.isMountain) score += 100;
  if (info.hasFreshWater) score -= 50;

  const resource = getCellResource(cell, playerStateId, living);
  if (resource) {
    if (!resource.revealed) score -= 75;
    else if (resource.class === "luxury") score -= 250;
    else if (resource.class === "strategic") score -= 200;
    else score -= 150;
  } else if ((pack.cells.c?.[cell] ?? []).some(neighbor => Number(pack.cells.good?.[neighbor] ?? 0) > 0)) {
    score -= 75;
  }

  const burgId = Number(pack.cells.burg?.[cell] ?? 0);
  const burg = burgId ? pack.burgs?.[burgId] : undefined;
  if (burg?.i && !burg.removed && !burg.state) score -= 200;

  return score;
}

/** Growth multiplier from Empire Happiness: full, quarter or none. */
export function happinessGrowthFactor(happiness: number): number {
  if (happiness <= -10) return 0;
  if (happiness < 0) return 0.25;
  return 1;
}

/** The economy buildings the autonomous governor prioritises before wonders. */
const CITY_ECONOMY_BUILDINGS: readonly string[] = [
  "monument",
  "granary",
  "library",
  "market",
  "shrine",
  "workshop",
  "aqueduct",
  "university",
  "bank",
  "public_school",
  "factory"
];

// ---------------------------------------------------------------------------
// Slice 4: empire rollup helpers (Science, Gold, Happiness)
// ---------------------------------------------------------------------------

/** Regiments beyond this count cost 1 Gold per tick of upkeep. */
/** Gold per tick for a median block at full capability (living-openciv-armies.md §10.2). */
export const BASELINE_UPKEEP = 0.2;
/** Three baseline blocks are free, so a starting army costs nothing. */
export const UPKEEP_FREE = 3 * BASELINE_UPKEEP;
/** A civilian regiment costs a flat tenth, independent of roster prices. */
export const CIVILIAN_UPKEEP = 0.1;
/** At or below this net happiness growth stops and combat suffers. */
export const VERY_UNHAPPY_HAPPINESS = -10;
/** Very unhappy empires fight at two thirds strength. */
export const UNHAPPY_COMBAT_MULTIPLIER = 0.67;
/** States only hurry production while keeping this Gold reserve. */
export const GOLD_PURCHASE_RESERVE = 100;
export const BASE_EMPIRE_HAPPINESS = 9;
export const LUXURY_HAPPINESS = 4;
/** Production plan for state suppression of a faction node. */
export const FACTION_SUPPRESSION_OPERATION_ID = "faction-suppression";
export const FACTION_SUPPRESSION_PRODUCTION_BASE = 6;
export const FACTION_SUPPRESSION_PRODUCTION_PER_TIER = 4;
/** Unguarded nodes at or below this influence can be stormed directly. */
export const FACTION_SUPPRESSION_ASSAULT_THRESHOLD = 25;
/** Cap on temporary garrison blocks raised for a faction stronghold assault. */
export const FACTION_GARRISON_BLOCK_CAP = 6;

/** City-node key used by suppression production operations. */
export function factionSuppressionNodeKey(node: FactionHq | FactionOutpost, isHq: boolean): FactionNodeKey {
  return isHq ? "hq" : (`outpost:${node.burgId}` as FactionNodeKey);
}

/** Production cost of one administrative suppression cycle against a faction node. */
export function factionSuppressionProductionCost(node: { tier?: number }): number {
  const tier = node?.tier ?? 2;
  return FACTION_SUPPRESSION_PRODUCTION_BASE + tier * FACTION_SUPPRESSION_PRODUCTION_PER_TIER;
}

/** Human-readable stronghold location for a suppression target. */
export function factionSuppressionLocationName(target: FactionSuppressionTarget): string {
  if (target.burg?.i) return target.burg.name ?? "a burg";
  const provinceId = Number(pack.cells.province?.[target.cell] ?? 0);
  const province = provinceId ? pack.provinces?.[provinceId] : undefined;
  return province?.name ? `the wilds of ${province.name}` : "the wildlands";
}

/** Resolve a suppression target's state-owned cell for marching and news. */
export function factionSuppressionTargetCell(target: FactionSuppressionTarget): number {
  return target.burg?.i ? target.burg.cell : target.cell;
}

/** A locally hosted faction node that a state can pressure through suppression. */
export interface FactionSuppressionTarget {
  faction: Faction;
  node: FactionHq | FactionOutpost;
  isHq: boolean;
  burg: Burg | null;
  cell: number;
  wilderness: boolean;
  nodeKey: FactionNodeKey;
  score: number;
}

/** OpenCiv theme profile for the live map: Astral, Historical/Modern or Fantasy. */
export function activeCivThemeId(): CivThemeId {
  const astral = isAstralView();
  const year = options?.map?.lore?.calendar?.year ?? 1000;
  const era = String(options?.map?.lore?.calendar?.era ?? "");
  const historical = year >= 1800 || /industrial|modern|atomic|information|steam/i.test(era);
  return selectCivTheme({ astral, historical });
}

/** Combat strength multiplier from Empire Happiness (a flat -33% when very unhappy). */
export function happinessCombatMultiplier(happiness: number | undefined): number {
  return (happiness ?? 0) <= VERY_UNHAPPY_HAPPINESS ? UNHAPPY_COMBAT_MULTIPLIER : 1;
}

/** Gold cost to hurry `remainingProduction` in a Major Burg. */
export function hurryGoldCost(remainingProduction: number, isUnit: boolean, hasBigBen = false): number {
  const remaining = Math.max(0, remainingProduction);
  if (remaining <= 0) return 0;
  const raw = (30 * remaining) ** 0.75 * (isUnit ? 1.2 : 1) * (hasBigBen ? 0.85 : 1);
  return Math.max(10, Math.floor(raw / 10) * 10);
}

/** A tech is selectable when its era is unlocked and every prerequisite is known. */
export function isTechSelectable(tech: CivTechDef, researched: ReadonlySet<string>, theme: CivThemeId): boolean {
  if (researched.has(tech.id)) return false;
  if (!isCivEraAvailable(theme, tech.era)) return false;
  return tech.prerequisites.every(id => researched.has(id));
}

// ---------------------------------------------------------------------------
// Slice 5: 1UPT tactical units, combat, builders, settlers and city sieges
// ---------------------------------------------------------------------------

export const UNIT_MAX_HP = 100;
export const CITY_BASE_HP = 200;
/** A unit looks this many hops for an enemy to engage. */
export const UNIT_AGGRO_RANGE = 6;
/** Builders improve owned cells within this many hops. */
export const BUILDER_RANGE = 8;
/** One city strike removes this much capability from a single block. */
export const CITY_STRIKE_HP = 0.1;

/** Cumulative XP needed to reach a level. */
export function xpForLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return (10 * safe * (safe + 1)) / 2;
}

/** Terrain defense multiplier for the defender's cell (+25% on hills, forest and jungle). */
export function terrainDefenseMultiplier(cell: number): number {
  const info = getCellTerrainInfo(cell);
  if (info.isHill) return 1.25;
  const biome = Number(pack.cells.biome?.[cell] ?? 0);
  if (biome === 6 || biome === 7 || biome === 8) return 1.25;
  return 1;
}

/** Movement cost from one cell to the next for a unit; Infinity blocks the step. */
export function unitMovementCost(from: number, to: number, unit: UnitSimState): number {
  const target = getCellTerrainInfo(to);
  if (unit.domain === "sea") {
    if (!target.isWater) return Number.POSITIVE_INFINITY;
  } else if (target.isWater || target.isMountain) {
    return Number.POSITIVE_INFINITY;
  }

  if (Number(pack.cells.routes?.[from]?.[to] ?? 0) > 0) return 1 / 3;

  const riverCrossing =
    Number(pack.cells.r?.[from] ?? 0) !== Number(pack.cells.r?.[to] ?? 0) && Number(pack.cells.r?.[to] ?? 0) > 0;
  // An unbridged river crossing drains every remaining movement point.
  if (riverCrossing) return Math.max(1, unit.movement);

  if (target.movementCost >= 9999) return Number.POSITIVE_INFINITY;
  return target.movementCost;
}

/** 1UPT: a cell holds at most one military and one utility unit per state; never two states. */
export function hasStackingConflict(
  occupied: readonly { stateId: number; isUtility: boolean; key: string }[],
  stateId: number,
  isUtility: boolean,
  selfKey: string
): boolean {
  return occupied.some(entry => entry.key !== selfKey && (entry.stateId !== stateId || entry.isUtility === isUtility));
}

// ---------------------------------------------------------------------------
// Slice 6: religion pressure, belief effects and diplomacy timers
// ---------------------------------------------------------------------------

/** A citizen represents 60 pressure for its faith. */
export const CONVERSION_PRESSURE = 60;
/** Faith needed for the first pantheon; each further pantheon costs 5 more. */
export const PANTHEON_BASE_FAITH = 10;
export const PANTHEON_FAITH_STEP = 5;
/** Great Prophet thresholds. */
export const PROPHET_BASE_FAITH = 200;
export const PROPHET_FAITH_STEP = 100;
/** Religious pressure: radius, per-city/holy-city amounts and unit spreads. */
export const PRESSURE_RADIUS = 10;
export const PRESSURE_RADIUS_PREACHERS = 13;
export const PRESSURE_PER_CITY = 6;
export const PRESSURE_HOLY_CITY = 12;
export const PRESSURE_CAP = 6000;
export const MISSIONARY_PRESSURE = 180;
export const PROPHET_PRESSURE = 240;
/** Diplomacy clocks. */
export const MIN_WAR_TURNS = 10;
export const PEACE_TREATY_TURNS = 10;

/** Faith cost of the next pantheon for a state with `founded` pantheons already. */
export function pantheonFaithCost(founded: number): number {
  return PANTHEON_BASE_FAITH + PANTHEON_FAITH_STEP * Math.max(0, founded);
}

/** Faith cost of the next Great Prophet. */
export function prophetFaithCost(earned: number, hasMessiah = false): number {
  return Math.floor((PROPHET_BASE_FAITH + PROPHET_FAITH_STEP * Math.max(0, earned)) * (hasMessiah ? 0.75 : 1));
}

/** A city's majority religion, or 0 when no faith has a majority. */
export function majorityReligion(pressure: Record<number, number> | undefined, citizens: number): number {
  const entries = Object.entries(pressure ?? {})
    .map(([id, value]) => [Number(id), Math.max(0, value)] as const)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const first = entries[0];
  if (!first) return 0;

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const [id, value] = first;
  const needed = Math.max(CONVERSION_PRESSURE, Math.max(1, citizens) * CONVERSION_PRESSURE * 0.5);
  return value >= total - value && value >= needed ? id : 0;
}

class LivingModel {
  /** Initialize or reconcile the Living World state on `pack.history.living` */
  init(opts?: { seed?: string; snapshotIntervalYears?: number }): LivingWorldState {
    LivingThreats.setHost(this);
    LivingHeroes.setHost(this);

    const history = Chronicle.sync();
    const seed = String(opts?.seed ?? history.living?.seed ?? options.map?.seed ?? "living-seed");

    history.living ??= {
      enabled: true,
      tick: 0,
      season: 0,
      seed,
      snapshotIntervalYears: opts?.snapshotIntervalYears ?? 10,
      promptOnPlayerBattles: false,
      states: {},
      provinces: {},
      burgs: {},
      cells: {},
      recentNews: []
    };

    history.living.provinces ??= {};
    history.living.cells ??= {};
    history.living.recentNews ??= [];

    if (opts?.seed !== undefined) history.living.seed = String(opts.seed);
    if (opts?.snapshotIntervalYears !== undefined) {
      history.living.snapshotIntervalYears = opts.snapshotIntervalYears;
    }

    this.syncWorld();
    this.ensureCommanders();
    if (!history.living.threatsMigrated) {
      LivingThreats.migrateLegacyThreats(history.living);
      history.living.threatsMigrated = true;
    }
    return history.living;
  }

  /** Return the active LivingWorldState, initializing it lazily if needed */
  getState(): LivingWorldState {
    return pack.history?.living ?? this.init();
  }

  /** Vitals, temperament, injuries and doctrine for one hero; lazily initialized. */
  getHeroState(figureId: number): HeroGuildState | undefined {
    return LivingHeroes.getHeroState(figureId);
  }

  setHeroDoctrine(figureId: number, doctrine: HeroDoctrine): boolean {
    return LivingHeroes.setHeroDoctrine(figureId, doctrine);
  }

  setHeroPush(figureId: number, enabled: boolean): boolean {
    return LivingHeroes.setHeroPush(figureId, enabled);
  }

  /** Spend one pending level 3/6 choice on a path from the hero's archetype. */
  chooseHeroPath(figureId: number, pathId: string): boolean {
    return LivingHeroes.chooseHeroPath(figureId, pathId);
  }

  /** The Wheel of Ages: bake the epoch, retire fallen empires, and open the next era. */
  turnAge(): { era: string; year: number; realms: number; successorStates: number } {
    const living = this.init();
    const history = Chronicle.sync();
    const yearBefore = options.map?.lore?.calendar?.year ?? 1000;
    const ageCount = history.epochs?.length ?? 0;

    // 1. bake the completed age so Legends can scrub back through it
    this.bakeEpoch(living, yearBefore);

    // 2. overextended empires fall
    const realms = this.retireFallenEmpires(living, yearBefore);

    // 3. the calendar leaps forward and the political map is reshaped
    const year = yearBefore + WHEEL_YEAR_LEAP;
    options.map.lore.calendar.year = year;
    const eraName = this.nextEraName(ageCount);
    history.eras ??= [];
    const currentEra = history.eras.at(-1);
    if (currentEra) currentEra.to = year;
    history.eras.push({ name: eraName, from: year, to: year });

    this.syncWorld();
    const shattered = this.fractureGiantEmpires(living);

    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim) continue;
      sSim.unravel = 0;
      sSim.warExhaustion = 0;
      this.crownFreshRuler(state, sSim, living, year);
    }
    this.syncWorld();

    living.eschaton = 0;

    const text = `${eraName} dawns in ${year}: ${realms.length} ${
      realms.length === 1 ? "realm" : "realms"
    } fell and ${shattered} provinces broke away as the Wheel turned.`;
    this.pushNews(living, { kind: "muster", text });
    this.pushHistory("goldenAge", [], undefined, text);

    return { era: eraName, year, realms: realms.length, successorStates: shattered };
  }

  /** Force-bake the current borders as one epoch spanning the played age. */
  private bakeEpoch(living: LivingWorldState, year: number): void {
    const history = Chronicle.sync();
    history.snapshots ??= [];
    history.epochs ??= [];

    const owned = new Map<number, number>();
    for (const owner of pack.cells.state) owned.set(owner, (owned.get(owner) ?? 0) + 1);

    const eraFrom = pack.history?.eras?.at(-1)?.from ?? year - 100;
    const polities = pack.states
      .filter(state => state?.i && !state.removed)
      .map(state => ({
        id: state.i,
        name: state.name,
        form: state.formName ?? state.form ?? "State",
        capital: state.capital ?? 0,
        cells: owned.get(state.i) ?? 0,
        color: state.color ?? "#8a8a8a",
        founded: eraFrom
      }));

    history.snapshots.push(new Uint16Array(pack.cells.state));
    history.epochs.push({
      i: history.epochs.length,
      from: eraFrom,
      to: year,
      era: options.map?.lore?.calendar?.era ?? "Present Age",
      polities,
      snapshot: history.snapshots.length - 1
    });
    living.lastSnapshotTick = living.tick;
  }

  /** Overextended empires (unravel >= 50) are retired into `history.realms`. */
  private retireFallenEmpires(living: LivingWorldState, year: number): Realm[] {
    const realms: Realm[] = [];
    for (const state of [...pack.states]) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim || sSim.unravel < 50) continue;
      realms.push(this.retireStateToRealm(state, sSim, living, year));
    }
    return realms;
  }

  private retireStateToRealm(state: State, sSim: StatePolitySim, living: LivingWorldState, year: number): Realm {
    const history = Chronicle.sync();
    history.realms ??= [];

    const ruler = sSim.rulerId !== undefined ? this.findFigure(sSim.rulerId) : undefined;
    const realm: Realm = {
      i: history.realms.reduce((max, realm) => Math.max(max, realm.i), -1) + 1,
      name: state.name,
      coa: state.coa,
      center: state.center,
      capital: state.capital || undefined,
      founded: year - 100 - ((state.i * 37) % 80),
      fallen: year,
      cause: "collapse",
      successors: [],
      remnantCulture: state.culture
    };
    history.realms.push(realm);

    // its lands go wild and its simulation is dismissed
    const cells: number[] = [];
    for (let cell = 0; cell < pack.cells.state.length; cell++) {
      if (pack.cells.state[cell] === state.i) cells.push(cell);
    }
    this.transferCells(0, cells);
    for (const burg of pack.burgs) {
      if (burg?.i && !burg.removed && burg.state === state.i) burg.state = 0;
    }
    state.removed = true;
    delete living.states[state.i];
    this.spawnRemnantFaction(state);

    if (ruler && ruler.death === undefined) {
      ruler.death = year;
      for (const role of ruler.roles) {
        if (role.to === undefined) role.to = year;
      }
    }

    // a chronicle ruin at the fallen capital
    const capital = state.capital ? pack.burgs[state.capital] : undefined;
    const cell = capital?.cell ?? state.center ?? 0;
    this.addRuinMarker(cell, `Ruins of ${state.name}`);

    this.pushHistory(
      "collapse",
      [{ kind: "state", id: state.i }],
      state.center,
      `${state.name} crumbled at the turning of the age.`
    );
    return realm;
  }

  /** Giant empires shatter along provincial lines into successor states and free burgs. */
  private fractureGiantEmpires(living: LivingWorldState): number {
    let released = 0;
    for (const state of [...pack.states]) {
      if (!state?.i || state.removed) continue;
      const provinces = this.ownedProvinces(state.i).sort((a, b) => a.i - b.i);
      if (provinces.length <= GIANT_PROVINCE_LIMIT) continue;

      const keep = new Set(provinces.slice(0, GIANT_PROVINCE_LIMIT).map(province => province.i));
      for (const province of provinces) {
        if (keep.has(province.i)) continue;
        if (this.releaseProvince(state, province, living)) released += 1;
      }
    }
    return released;
  }

  /** One province leaves a fracturing state: secession where a settlement stands, wilds otherwise. */
  private releaseProvince(state: State, province: Province, living: LivingWorldState): boolean {
    const settlementId =
      province.burg !== undefined && pack.burgs[province.burg]?.state === state.i
        ? province.burg
        : this.pickProvinceSettlement(province.i, state.i);
    const burg = settlementId !== undefined ? pack.burgs[settlementId] : undefined;
    if (burg?.i && !burg.removed && burg.state === state.i) {
      this.breakAway(state, burg, living);
      return true;
    }

    const provinceCells = pack.cells.province;
    if (!provinceCells) return false;
    const cells: number[] = [];
    for (let cell = 0; cell < provinceCells.length; cell++) {
      if (provinceCells[cell] === province.i) cells.push(cell);
    }
    this.transferCells(0, cells);
    for (const cell of cells) provinceCells[cell] = 0;
    return true;
  }

  /** The calendar leap ages every ruler away; each surviving state crowns a fresh young ruler. */
  private crownFreshRuler(state: State, sSim: StatePolitySim, living: LivingWorldState, year: number): void {
    const ruler = sSim.rulerId !== undefined ? this.findFigure(sSim.rulerId) : undefined;
    if (ruler && ruler.death === undefined) {
      ruler.death = year;
      for (const role of ruler.roles) {
        if (role.to === undefined) role.to = year;
      }
    }
    sSim.rulerId = this.spawnRuler(state, living, year);
  }

  /** Poetic name for the era that dawns after the given number of wheel turns. */
  private nextEraName(ageCount: number): string {
    const rng = createRng(`${this.getState().seed}:turnAge:${ageCount}`);
    const epithet = ERA_EPITHETS[rng.int(0, ERA_EPITHETS.length - 1)]!;
    const ordinal = ERA_ORDINALS[Math.min(ageCount, ERA_ORDINALS.length - 1)] ?? `${ageCount + 1}th`;
    return rng.chance(0.5) ? `The ${ordinal} Age of ${epithet}` : `The Era of ${epithet}`;
  }

  /** Deterministic PRNG for a given tick and domain tag */
  rng(tag: string, id = 0, _salt = 0): Rng {
    const living = this.getState();
    return createRng(`${living.seed}:living:${living.tick}:${tag}:${id}`);
  }

  /** Advance the world by `seasons` ticks (1 tick = 1 season, 4 ticks = 1 year) */
  tick(seasons = 1): LivingWorldState {
    const living = this.init();
    const steps = Math.max(1, Math.floor(seasons));

    for (let step = 0; step < steps; step++) {
      living.tick += 1;
      living.season = ((living.season + 1) % 4) as SeasonId;

      if (living.season === 0) {
        options.map.lore.calendar.year += 1;
        const currentEra = pack.history?.eras?.at(-1);
        if (currentEra) currentEra.to = options.map.lore.calendar.year;
        this.stepRulers(living);
        this.stepGrudges(living);
        this.captureSnapshot(living);
      }

      this.syncWorld();
      this.stepCities(living);
      this.stepEmpire(living);
      this.stepDevelopmentDiffusion(living);
      this.stepEconomy(living);
      this.stepReligion(living);
      this.stepTactical(living);
      this.stepBurgUnrest(living);
      this.stepProvinces(living);
      this.stepFactions(living);
      this.stepStates(living);
      this.stepDiplomacy(living);
      this.stepRebellions(living);
      this.stepMobileBurgs(living);
      this.stepEschaton(living);
    }

    return living;
  }

  /** Synchronize `living.burgs` and `living.states` with the live `pack` */
  syncWorld(): void {
    const history = Chronicle.sync();
    const living = history.living;
    if (!living) return;

    living.provinces ??= {};
    living.cells ??= {};
    living.recentNews ??= [];
    living.worldWonders ??= {};
    living.religions ??= {};
    living.activeTroubles ??= {};
    this.syncBurgs(living);
    this.syncProvinces(living);
    this.syncStates(living);
    this.syncFactions(living);
    this.syncArmies(living);
    this.syncDangerMarkers(living);
    this.ensureCommanders();
  }

  /** Synchronize danger markers backed by factions */
  syncDangerMarkers(living: LivingWorldState): void {
    LivingThreats.syncDangerMarkers(living);
  }

  /** Check whether a burg shares culture OR religion with a state (Free Burg peaceful integration rule) */
  sharesKinshipOrFaith(stateId: number, burgId: number): boolean {
    const state = pack.states[stateId];
    const burg = pack.burgs[burgId];
    if (!state?.i || state.removed || !burg?.i || burg.removed) return false;

    if ((burg.culture ?? 0) > 0 && burg.culture === state.culture) return true;

    const stateReligion = this.getStateReligion(state);
    const burgReligion = pack.cells.religion?.[burg.cell] ?? 0;
    return stateReligion > 0 && burgReligion === stateReligion;
  }

  /** Dominant religion of a state (measured at its capital or center cell) */
  getStateReligion(state: State): number {
    if (!pack.cells.religion) return 0;
    const capitalCell = state.capital ? pack.burgs[state.capital]?.cell : undefined;
    const cell = capitalCell ?? state.center ?? 0;
    return pack.cells.religion[cell] ?? 0;
  }

  /** Append a headline to the seasonal news ticker */
  pushNews(
    living: LivingWorldState,
    item: { kind: LivingNewsKind; text: string; cell?: number; stateId?: number; burgId?: number }
  ): LivingNewsItem {
    const entry: LivingNewsItem = {
      tick: living.tick,
      year: options.map.lore.calendar.year,
      season: living.season,
      ...item
    };
    living.recentNews.unshift(entry);
    if (living.recentNews.length > MAX_RECENT_NEWS) {
      living.recentNews.length = MAX_RECENT_NEWS;
    }
    return entry;
  }

  /** Format current season and year label (e.g. "Spring, 1024 Era") */
  formatSeasonDate(living = this.getState()): string {
    const seasonName = SEASON_NAMES[living.season] ?? "Spring";
    const year = options.map?.lore?.calendar?.year ?? 1000;
    const eraShort = options.map?.lore?.calendar?.eraShort ?? "";
    return eraShort ? `${seasonName}, ${year} ${eraShort}` : `${seasonName}, ${year}`;
  }

  findFigure(figureId: number): HistoricalFigure | undefined {
    return Chronicle.sync().figures?.find(figure => figure.i === figureId);
  }

  /** Lazy vitals for a hero's sheet; the sheet is the only store. */
  ensureHeroGuildState(figure: HistoricalFigure): HeroGuildState {
    return LivingHeroes.ensureHeroGuildState(figure);
  }

  /** A veteran's protege: one point in the veteran's best pool carried forward. */
  spawnProtege(living: LivingWorldState, veteran: HistoricalFigure): HistoricalFigure | undefined {
    return LivingHeroes.spawnProtege(living, veteran);
  }

  /** Ignored level 3/6 choices are auto-picked after two seasons by the archetype's doctrine. */
  autoPickPendingPaths(living: LivingWorldState): void {
    LivingHeroes.autoPickPendingPaths(living);
  }

  /** Resolve, Stamina and injury treatment for every living hero, once per season. */
  recoverHeroes(living: LivingWorldState): void {
    LivingHeroes.recoverHeroes(living);
  }

  /** The current eschaton reading, lazily initialized for old saves */
  getEschaton(): number {
    return this.getState().eschaton ?? 0;
  }

  /** Each season, every entrenched dangerous faction pushes the world one step closer to the finale. */
  private stepEschaton(living: LivingWorldState): void {
    let doom = 0;
    for (const faction of Factions.active()) {
      if (
        (faction.allegiance === "hostile" || faction.allegiance === "clandestine") &&
        (faction.seasonsActive ?? 0) >= 8 &&
        (faction.researchedTechs?.length ?? 0) >= 2
      ) {
        doom += 1;
      }
    }
    if (doom > 0) this.exaltEschaton(living, doom);
  }

  private exaltEschaton(living: LivingWorldState, amount: number): void {
    living.eschaton = minmax((living.eschaton ?? 0) + amount, 0, 100);
  }

  /** Purging lairs buys the world time. */
  relieveEschaton(living: LivingWorldState, amount = 5): void {
    living.eschaton = Math.max(0, (living.eschaton ?? 0) - amount);
  }

  syncBurgs(living: LivingWorldState): void {
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed) {
        if (burg?.i && living.burgs[burg.i]) delete living.burgs[burg.i];
        continue;
      }

      const baseTier = settlementTierFromPop(burg.population ?? 0);
      const existing = living.burgs[burg.i];
      if (!existing) {
        living.burgs[burg.i] = {
          burgId: burg.i,
          baseTier,
          development: 0,
          developmentProgress: 0,
          buildings: syncBurgBuildingsFromFlags(burg, []),
          civBuildings: syncCivBuildingsFromFlags(burg, []),
          construction: null,
          unrest: 0,
          treasury: Number(burg.treasury ?? 0),
          originalOwner: burg.state ?? 0,
          originalCulture: burg.culture,
          originalReligion: pack.cells.religion?.[burg.cell] ?? 0
        };
        syncCivFlagsFromBuildings(burg, living.burgs[burg.i].civBuildings ?? []);
        living.burgs[burg.i].isMajor = isMajorBurg(burg);
      } else {
        existing.baseTier = baseTier;
        existing.buildings = syncBurgBuildingsFromFlags(burg, existing.buildings);
        existing.civBuildings = syncCivBuildingsFromFlags(burg, existing.civBuildings ?? []);
        syncCivFlagsFromBuildings(burg, existing.civBuildings);
        syncBurgFlagsFromBuildings(burg, existing.buildings);
        existing.isMajor = isMajorBurg(burg) || Boolean(existing.isMajor);
      }
    }
  }

  syncStates(living: LivingWorldState): void {
    const { content } = currentContent();
    const availableRosters = new Set(Object.keys(content.rosters));
    const development = this.developmentAverages();

    for (const state of pack.states) {
      if (!state?.i || state.removed) {
        if (state?.i && living.states[state.i]) delete living.states[state.i];
        continue;
      }

      if (!state.rosterId || !availableRosters.has(state.rosterId)) {
        state.rosterId = assignStateRoster(state, pack.cultures);
      }

      const rulerId = this.ensureStateRuler(state, living);
      const existing = living.states[state.i];
      if (!existing) {
        living.states[state.i] = {
          stateId: state.i,
          rulerId,
          agenda: null,
          unravel: 0,
          warExhaustion: 0,
          claims: [],
          grudges: [],
          currentTechId: null,
          researchQueue: [],
          researchedTechs: [],
          researchedProgress: {},
          freeTechs: 0,
          treasury: Number(pack.states[state.i]?.economy?.treasury ?? 0),
          yieldsPerTurn: emptyYields()
        };
      } else {
        existing.rulerId = rulerId;
        existing.currentTechId ??= null;
        existing.researchQueue ??= [];
        existing.researchedTechs ??= [];
        existing.researchedProgress ??= {};
        existing.freeTechs ??= 0;
        existing.treasury ??= Number(state.economy?.treasury ?? 0);
        existing.yieldsPerTurn ??= emptyYields();
        existing.warTurns ??= {};
        existing.peaceTreatyTurns ??= {};
        existing.faith ??= 0;
        existing.prophetsEarned ??= 0;
      }

      const sSim = living.states[state.i];
      this.seedPolityTechs(sSim.researchedTechs ?? [], sSim.researchedProgress ?? {}, development.get(state.i) ?? 0);
    }
  }

  syncFactions(_living: LivingWorldState): void {
    for (const faction of Factions.active()) {
      syncFactionState(faction);
      faction.researchedTechs ??= [];
      faction.researchedProgress ??= {};
      this.seedPolityTechs(faction.researchedTechs, faction.researchedProgress, this.factionDevelopment(faction));
    }
  }

  // ---------------------------------------------------------------------------
  // Upstream development bridge (docs/plans/upstream-economy-alignment.md §2)
  // ---------------------------------------------------------------------------

  /** Population-weighted mean development per state id from upstream's field; empty when the map has none. */
  private developmentAverages(): Map<number, number> {
    const averages = new Map<number, number>();
    if (!pack.cells.development) return averages;
    Development.getAverages(pack.cells.state).forEach((value, id) => {
      if (id > 0 && value !== undefined) averages.set(id, value);
    });
    return averages;
  }

  /** Mean development at a faction's HQ and outposts. */
  private factionDevelopment(faction: Faction): number {
    const development = pack.cells.development;
    if (!development) return 0;

    let total = 0;
    let count = 0;
    for (const cell of this.factionSettlementCells(faction)) {
      const level = development[cell] ?? 0;
      if (!level) continue;
      total += level;
      count += 1;
    }
    return count > 0 ? total / count : 0;
  }

  /** §2.2: a polity that starts past the foragers' era already knows its earlier rows' technologies. */
  private seedPolityTechs(techs: string[], progress: Record<string, number>, development: number): void {
    if (techs.length > 0 || Object.keys(progress).length > 0) return;
    const seeded = seedTechsFromDevelopment(development);
    techs.push(...seeded.researched);
    Object.assign(progress, seeded.progress);
  }

  /** §2.3: a discovery raises the polity's cities and marks the upstream economy to re-run. */
  private raiseTechDevelopment(
    living: LivingWorldState,
    researchedTechs: readonly string[],
    cells: readonly number[]
  ): void {
    const development = pack.cells.development;
    if (!development) return;

    const target = computePolityTechDevelopment(researchedTechs);
    if (target <= 0) return;

    let changed = false;
    for (const cell of cells) {
      if (!development[cell]) continue; // wild land stays wild
      const goal = Math.min(100, target + this.schoolBonus(living, cell));
      if (development[cell] >= goal) continue;
      development[cell] = goal;
      changed = true;
    }
    if (changed) living.economyDirty = true;
  }

  /** +2 development in a city with a seat of learning. */
  private schoolBonus(living: LivingWorldState, cell: number): number {
    const burgId = pack.cells.burg?.[cell] ?? 0;
    const buildings = burgId ? (living.burgs[burgId]?.civBuildings ?? []) : [];
    return buildings.some(id => SCHOLARLY_BUILDINGS.has(id)) ? 2 : 0;
  }

  /** The capital and every burg a state owns: where a discovery lands first. */
  private settlementCells(stateId: number): number[] {
    const cells = new Set<number>();
    const capital = pack.burgs[pack.states[stateId]?.capital ?? 0];
    if (capital?.i && !capital.removed) cells.add(capital.cell);
    for (const burg of pack.burgs) {
      if (burg?.i && !burg.removed && burg.state === stateId) cells.add(burg.cell);
    }
    return [...cells];
  }

  /** A faction's live HQ and outpost cells. */
  private factionSettlementCells(faction: Faction): number[] {
    const cells: number[] = [];
    const nodes: (FactionHq | FactionOutpost)[] = [faction.hq, ...(faction.outposts ?? [])];
    for (const node of nodes) {
      if (!node || node.pillaged) continue;
      const burg = node.burgId ? pack.burgs[node.burgId] : undefined;
      cells.push(burg?.i && !burg.removed ? burg.cell : node.cell);
    }
    return cells;
  }

  /** §2.3: peopled land steps toward its polity's technology level, eased by the land itself. */
  private stepDevelopmentDiffusion(living: LivingWorldState): void {
    const { cells } = pack;
    const development = cells.development;
    if (!development || !cells.state) return;
    const targets = new Map<number, number>();
    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const target = computePolityTechDevelopment(living.states[state.i]?.researchedTechs ?? []);
      if (target > 0) targets.set(state.i, target);
    }
    if (targets.size === 0) return;

    let changed = false;
    for (let cell = 0; cell < development.length; cell++) {
      const target = targets.get(cells.state[cell]);
      if (!target || !development[cell]) continue; // no polity or no people, no development
      if (cells.h[cell] < 20 || (!cells.pop[cell] && !cells.burg?.[cell])) continue;

      const local = this.localDevelopmentTarget(cell, target);
      if (development[cell] < local) {
        development[cell] += 1;
        changed = true;
      } else if (!cells.burg?.[cell] && development[cell] > local + DEVELOPMENT_DECAY_SLACK) {
        development[cell] -= 1; // the land cannot hold what its polity cannot work
        changed = true;
      }
    }
    if (changed) living.economyDirty = true;
  }

  /** A cell's own ceiling: the polity's level eased by biome, rivers and harbors. */
  private localDevelopmentTarget(cell: number, polityTarget: number): number {
    const biome = pack.biomes?.[pack.cells.biome[cell]]?.development ?? 0;
    const water = (pack.cells.r?.[cell] ? 1 : 0) + (pack.cells.harbor?.[cell] ? 1 : 0);
    return minmax(Math.round(polityTarget + biome + water), 1, 100);
  }

  // ---------------------------------------------------------------------------
  // Upstream economy bridge (docs/plans/upstream-economy-alignment.md §3.2)
  // ---------------------------------------------------------------------------

  /** §3.2: refresh the upstream economy when stale, then bank the season's cash flows. */
  private stepEconomy(living: LivingWorldState): void {
    if (living.season === 0 || living.economyDirty) {
      if (pack.markets?.length) {
        living.economyDirty = false;
        try {
          Production.regenerate();
        } catch {
          // a stripped pack cannot run the economy; the abstract sim yields carry on
        }
      }
    }
    this.bankSeasonalGold(living);
  }

  /** §3.2: bank the season's upstream cash flows and keep the sim treasury mirror in step. */
  private bankSeasonalGold(living: LivingWorldState): void {
    const ran = Boolean(pack.deals?.length);

    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim) continue;

      const net = ran ? this.upstreamSeasonalNet(state) : 0;
      if (net) state.economy.treasury = Math.round((Number(state.economy.treasury ?? 0) + net) * 100) / 100;
      if (Number(state.economy.treasury) < 0) this.settleDebt(state, living);
      sSim.treasury = Number(state.economy.treasury ?? 0); // the ledger mirrors the accumulated reserve
    }
    if (!ran) return;

    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed) continue;
      const bSim = living.burgs[burg.i];
      if (!bSim) continue;
      bSim.treasury ??= Number(burg.treasury ?? 0);
      const net = ((burg.product ?? 0) - (burg.pollTaxPaid ?? 0)) * SEASON_DAYS;
      if (net) bSim.treasury = Math.round((bSim.treasury + net) * 100) / 100;
    }
  }

  /** A season of the state's last run: what was collected minus corruption and spending. */
  private upstreamSeasonalNet(state: State): number {
    const economy = state.economy;
    if (!economy) return 0;
    const spent = Object.values(economy.spent ?? {}).reduce((total, value) => total + Number(value ?? 0), 0);
    return (Number(economy.collected ?? 0) - Number(economy.pocketed ?? 0) - spent) * SEASON_DAYS;
  }

  /** Upstream accounts are readable only after a full economy run on a whole map. */
  private canReadUpstreamEconomy(): boolean {
    return canReadUpstreamEconomy();
  }

  private upstreamAccounts(stateId: number): ReturnType<typeof Accounts.ofState> {
    return this.canReadUpstreamEconomy() ? Accounts.ofState(stateId) : null;
  }

  syncProvinces(living: LivingWorldState): void {
    const startOrder = currentContent().config.economy.startOrder;

    for (const province of pack.provinces ?? []) {
      if (!province?.i || province.removed || !province.state || pack.states[province.state]?.removed) {
        if (province?.i && living.provinces[province.i]) delete living.provinces[province.i];
        continue;
      }

      if (!living.provinces[province.i]) {
        living.provinces[province.i] = {
          provinceId: province.i,
          order: startOrder,
          stability: 0,
          development: 0,
          developmentProgress: null,
          trouble: null
        };
      } else {
        living.provinces[province.i].trouble ??= null;
      }
    }
  }

  private ensureStateRuler(state: State, living: LivingWorldState): number {
    const history = Chronicle.sync();
    history.figures ??= [];

    const active = history.figures.find(
      fig =>
        fig.death === undefined &&
        fig.roles.some(
          role =>
            role.type === "ruler" && role.to === undefined && role.target.kind === "state" && role.target.id === state.i
        )
    );
    if (active) return active.i;
    return this.spawnRuler(state, living);
  }

  /** A new ruler for the state; called at init and after a death. */
  private spawnRuler(state: State, living: LivingWorldState, accession?: number): number {
    const history = Chronicle.sync();
    history.figures ??= [];

    const year = options.map?.lore?.calendar?.year ?? 1000;
    const figIndex = history.figures.length;
    const rng = traitsRng(living.seed, "figure", figIndex + state.i * 1000);
    const age = rng.int(20, 50);
    const from = accession ?? year - Math.min(age - 16, rng.int(1, 12));

    const cultureId = state.culture ?? 0;
    const alignment = rollAlignment(rng, pack.cultures[cultureId]?.alignment);
    const { virtues, vices } = rollFigureTraits(rng, alignment);

    const figure: HistoricalFigure = {
      i: figIndex,
      name: Names.getCulture(cultureId),
      culture: cultureId,
      birth: year - age,
      roles: [{ type: "ruler", target: { kind: "state", id: state.i }, from }],
      alignment,
      virtues,
      vices
    };
    history.figures.push(figure);
    return figure.i;
  }

  /** Once a year: rulers age, die and are succeeded; a weak court turns a funeral into a crisis. */
  private stepRulers(living: LivingWorldState): void {
    const history = Chronicle.sync();
    const year = options.map?.lore?.calendar?.year ?? 1000;

    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim) continue;

      const ruler = history.figures?.find(figure => figure.i === sSim.rulerId);
      if (!ruler || ruler.death !== undefined) {
        sSim.rulerId = this.ensureStateRuler(state, living);
        continue;
      }

      const age = year - ruler.birth;
      const lifespan = createRng(`${living.seed}:living:lifespan:${ruler.i}`).int(55, 95);
      if (age < lifespan) continue;
      this.succeedRuler(state, sSim, ruler, living, year);
    }
  }

  private succeedRuler(
    state: State,
    sSim: StatePolitySim,
    ruler: HistoricalFigure,
    living: LivingWorldState,
    year: number
  ): void {
    const history = Chronicle.sync();
    ruler.death = year;
    for (const role of ruler.roles) {
      if (
        role.type === "ruler" &&
        role.to === undefined &&
        role.target.kind === "state" &&
        role.target.id === state.i
      ) {
        role.to = year;
      }
    }

    const successorId = this.spawnRuler(state, living, year);
    const successor = history.figures?.find(figure => figure.i === successorId);
    sSim.rulerId = successorId;

    const crisis = this.successionCrisis(sSim, successor);
    let text = `${ruler.name} of ${state.name} died; ${successor?.name ?? "a successor"} took the crown.`;
    if (crisis) {
      sSim.unravel = minmax(sSim.unravel + 10, 0, 100);
      for (const province of this.ownedProvinces(state.i)) {
        const pSim = living.provinces[province.i];
        if (pSim) pSim.order = Math.max(0, pSim.order - 10);
      }
      text += " A succession crisis follows.";
    }

    this.pushNews(living, { kind: "succession", text, cell: state.center, stateId: state.i });
    this.pushHistory(
      "succession",
      [
        { kind: "figure", id: ruler.i },
        ...(successor ? [{ kind: "figure", id: successor.i } as HistRef] : []),
        { kind: "state", id: state.i }
      ],
      state.center,
      text
    );
  }

  private successionCrisis(sSim: StatePolitySim, successor: HistoricalFigure | undefined): boolean {
    if (sSim.warExhaustion >= 50) return true;
    const vices = new Set(successor?.vices ?? []);
    return ["cruel", "greedy", "slothful", "cowardly", "vengeful", "wrathful", "paranoid"].some(vice =>
      vices.has(vice)
    );
  }

  /** Once a year: old grudges fade and the war weariness of the court eases. */
  private stepGrudges(living: LivingWorldState): void {
    for (const sSim of Object.values(living.states)) {
      for (const grudge of sSim.grudges) grudge.weight -= 1;
      sSim.grudges = sSim.grudges.filter(grudge => grudge.weight > 0);
      sSim.warExhaustion = minmax(sSim.warExhaustion - 5, 0, 100);
    }
  }

  /** Every `snapshotIntervalYears`, keep the borders as an epoch for the Legends time slider. */
  private captureSnapshot(living: LivingWorldState): void {
    const interval = Math.max(1, Math.floor(living.snapshotIntervalYears || 10));
    if (living.tick - (living.lastSnapshotTick ?? 0) < interval * 4) return;

    const history = Chronicle.sync();
    history.snapshots ??= [];
    history.epochs ??= [];
    const year = options.map?.lore?.calendar?.year ?? 1000;

    const owned = new Map<number, number>();
    for (const owner of pack.cells.state) owned.set(owner, (owned.get(owner) ?? 0) + 1);

    const polities = pack.states
      .filter(state => state?.i && !state.removed)
      .map(state => ({
        id: state.i,
        name: state.name,
        form: state.formName ?? state.form ?? "State",
        capital: state.capital ?? 0,
        cells: owned.get(state.i) ?? 0,
        color: state.color ?? "#8a8a8a",
        founded: year - interval
      }));

    history.snapshots.push(new Uint16Array(pack.cells.state));
    history.epochs.push({
      i: history.epochs.length,
      from: year - interval,
      to: year,
      era: options.map?.lore?.calendar?.era ?? "Present Age",
      polities,
      snapshot: history.snapshots.length - 1
    });
    living.lastSnapshotTick = living.tick;
  }

  // -------------------------------------------------------------------------
  // Mobile burgs: wanderers on mobility "live" migrate one cell per season
  // toward a seeded far destination — a migration, never an army.
  // -------------------------------------------------------------------------

  /** One seasonal migration tick for every burg on mobility "live". */
  private stepMobileBurgs(living: LivingWorldState): void {
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.mobile !== 1 || burg.mobility !== "live") continue;
      this.stepLiveBurg(living, burg);
    }
  }

  /** Can this burg stand on `cell`? Each realm keeps its own ground. */
  private mobileBurgCanStand(burg: Burg, cell: number): boolean {
    const height = pack.cells.h?.[cell];
    if (height === undefined) return false;
    if (burg.underwater) return height < 20; // underwater settlements roam the waters
    if (burg.flying) return true; // the sky roams wherever it pleases
    return height >= 20; // titans, hordes and underdark holds stay on the land
  }

  /** Season tick for one live burg: pick a far destination, take one greedy hop, chronicle the arrival. */
  private stepLiveBurg(living: LivingWorldState, burg: Burg): void {
    const name = burg.name ?? "A wandering burg";
    const [x, y] = pack.cells.p[burg.cell] ?? [0, 0];

    // just arrived: chronicle the coming to anchor, then rest a season
    if (burg.destination !== undefined && burg.cell === burg.destination) {
      const text = burg.titan
        ? `${name}, the titan, came to anchor`
        : burg.horde
          ? `${name}, the horde, came to rest`
          : burg.underwater
            ? `${name}, the walking isle, came to anchor`
            : burg.flying
              ? `${name}, the sky-wanderer, came to rest`
              : burg.underdark
                ? `${name}, the wandering hold, came to rest`
                : `${name}, the wandering burg, came to anchor`;
      this.pushNews(living, { kind: "colonize", text, cell: burg.cell, stateId: burg.state, burgId: burg.i });
      this.pushHistory("deed", [{ kind: "burg", id: burg.i! }], burg.cell, text);
      delete burg.destination;
      return;
    }

    // pick a far plausible destination from a seeded shortlist when none stands
    if (burg.destination === undefined || !this.mobileBurgCanStand(burg, burg.destination)) {
      delete burg.destination;
      const rng = this.rng("liveMobile", burg.i!);
      let best = -1;
      let bestDistance = 0;
      for (let i = 0; i < 48; i++) {
        const cell = rng.int(0, pack.cells.i.length - 1);
        if (!this.mobileBurgCanStand(burg, cell)) continue;
        const [cx, cy] = pack.cells.p[cell] ?? [0, 0];
        const distance = (cx - x) ** 2 + (cy - y) ** 2;
        if (distance > bestDistance) {
          bestDistance = distance;
          best = cell;
        }
      }
      if (best === -1) return; // nowhere to go this season (all water, all mountain…)
      burg.destination = best;
    }

    // take one greedy hop toward the destination; a hemmed-in burg re-rolls next season
    const [dx, dy] = pack.cells.p[burg.destination] ?? [0, 0];
    let hopCell = -1;
    let hopDistance = (dx - x) ** 2 + (dy - y) ** 2;
    for (const neighbor of pack.cells.c?.[burg.cell] ?? []) {
      if (!this.mobileBurgCanStand(burg, neighbor)) continue;
      const [nx, ny] = pack.cells.p[neighbor] ?? [0, 0];
      const distance = (nx - dx) ** 2 + (ny - dy) ** 2;
      if (distance < hopDistance) {
        hopDistance = distance;
        hopCell = neighbor;
      }
    }
    if (hopCell === -1) {
      delete burg.destination; // hemmed in; try a fresh destination next season
      return;
    }

    // Burgs.move enforces the full move contract (no evicting a surface burg, no swims, no capitals leaving their state);
    // the road join happens on arrival only, like a marching burg docking at the journey's end
    try {
      const [nx, ny] = pack.cells.p[hopCell] ?? [0, 0];
      Burgs.move(burg.i!, nx, ny, { connect: false });
    } catch {
      delete burg.destination; // blocked (a taken cell); try again next season
      return;
    }
    if (burg.cell === burg.destination && !Routes.isConnected(burg.cell)) {
      try {
        Routes.connect(burg.cell); // join the roads once, on arrival
      } catch {
        // a road-join failure must not abort the season; the burg stays connected on its next dock
      }
    }
  }

  // -------------------------------------------------------------------------
  // Slice 3: autonomous Major Burg city loop (worked cells, food, culture
  // borders, production queues and World Wonders).
  // -------------------------------------------------------------------------

  /** The OpenCiv city loop needs a terrain-bearing pack (real maps), not a stripped fixture. */
  private hasCityTerrain(): boolean {
    return Boolean(pack.cells.h?.length) && Boolean(pack.cells.biome?.length) && Boolean(pack.cells.c?.length);
  }

  /** BFS hop distances from a cell, capped at `maxHops`. */
  private cellHopDistances(start: number, maxHops: number): Map<number, number> {
    const distances = new Map<number, number>([[start, 0]]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head]!;
      const hops = distances.get(cell)!;
      if (hops >= maxHops) continue;
      for (const neighbor of pack.cells.c?.[cell] ?? []) {
        if (distances.has(neighbor)) continue;
        distances.set(neighbor, hops + 1);
        queue.push(neighbor);
      }
    }
    return distances;
  }

  /** Every Major Burg of a state that has a live simulation record. */
  private majorBurgsOfState(stateId: number, living: LivingWorldState): Burg[] {
    return pack.burgs.filter(
      burg =>
        burg?.i &&
        !burg.removed &&
        burg.state === stateId &&
        (isMajorBurg(burg) || Boolean(living.burgs[burg.i]?.isMajor)) &&
        Boolean(living.burgs[burg.i])
    );
  }

  /** Is this state engaged in any war this tick? */
  private stateAtWar(state: State): boolean {
    if (!state.diplomacy) return false;
    return pack.states.some(
      other => other?.i && other.i !== state.i && !other.removed && state.diplomacy?.[other.i] === "Enemy"
    );
  }

  /** Pantheon + religion belief ids held by a state (Slice 6 fills the religion record). */
  private stateBeliefs(state: State, living: LivingWorldState): Set<string> {
    const ids = new Set<string>();
    const sSim = living.states[state.i];
    if (sSim?.pantheonId) ids.add(sSim.pantheonId);
    const religionId = sSim?.religionId;
    const religion = religionId ? living.religions?.[religionId] : undefined;
    if (religion) {
      if (religion.pantheonId) ids.add(religion.pantheonId);
      if (religion.founderBeliefId) ids.add(religion.founderBeliefId);
      if (religion.enhancerBeliefId) ids.add(religion.enhancerBeliefId);
      for (const id of religion.followerBeliefIds ?? []) ids.add(id);
    }
    return ids;
  }

  /** A ruler's temperament weights which cells a city works (martial/civic/pious). */
  private cityWorkWeight(yields: YieldValues, state: State, living: LivingWorldState): number {
    const sSim = living.states[state.i];
    const bias = sSim ? this.traitBias(state, sSim) : { martial: 0.1, civic: 0.1, pious: 0.1, cruel: 0 };
    return (
      yields.food +
      yields.production * (1 + bias.martial) +
      (yields.gold + yields.science) * (1 + bias.civic) +
      (yields.faith + yields.culture) * (1 + bias.pious) +
      yields.happiness * 0.5
    );
  }

  /** A cell that can host a Major Burg's centre or a citizen worker. */
  private isCityWorkable(cell: number): boolean {
    if (getCellTerrainInfo(cell).isWorkable) return true;
    return Number(pack.cells.harbor?.[cell] ?? 0) > 0;
  }

  /**
   * §4.1: assign citizens to worked cells (centre free, then Food floor, then
   * ruler-weighted total yield) and sum the OpenCiv city yields.
   */
  private updateWorkedCells(
    burg: Burg,
    bSim: BurgSimState,
    state: State,
    living: LivingWorldState,
    globalWorkedCells?: Set<number>
  ): YieldValues {
    const citizens = Math.max(1, Math.floor(bSim.citizens ?? citizensFromPopulation(burg.population ?? 0)));
    bSim.citizens = citizens;

    const centerYields = getCellYields(burg.cell, state.i, living);
    if (centerYields.food < 2) centerYields.food = 2;

    const taken = new Set<number>(globalWorkedCells);
    for (const other of this.majorBurgsOfState(state.i, living)) {
      if (other.i === burg.i) continue;
      for (const cell of living.burgs[other.i]?.workedCells ?? []) taken.add(cell);
    }

    const distances = this.cellHopDistances(burg.cell, MAX_WORK_DISTANCE);
    const candidates: { cell: number; hops: number; yields: YieldValues; weight: number }[] = [];
    for (const [cell, hops] of distances) {
      if (cell === burg.cell || taken.has(cell)) continue;
      if (pack.cells.state?.[cell] !== state.i) continue;
      if (!this.isCityWorkable(cell)) continue;
      const yields = getCellYields(cell, state.i, living);
      candidates.push({ cell, hops, yields, weight: this.cityWorkWeight(yields, state, living) });
    }

    const worked: number[] = [];
    const assigned = new Set<number>();
    let food = centerYields.food;
    const consumption = FOOD_PER_CITIZEN * citizens;
    const foodFloorReached = () => food - consumption >= DEFAULT_FOCUS_GROWTH_TARGET;

    // Ruler-pinned cells are worked first, exactly as the player left them.
    for (const cell of bSim.lockedCells ?? []) {
      if (worked.length >= citizens) break;
      if (assigned.has(cell) || !candidates.some(candidate => candidate.cell === cell)) continue;
      worked.push(cell);
      assigned.add(cell);
      food += getCellYields(cell, state.i, living).food;
    }

    // Phase 1: Food floor, highest Food first, then nearest, then lowest id.
    const byFood = [...candidates].sort((a, b) => b.yields.food - a.yields.food || a.hops - b.hops || a.cell - b.cell);
    for (const candidate of byFood) {
      if (worked.length >= citizens || foodFloorReached()) break;
      if (assigned.has(candidate.cell) || candidate.yields.food <= 0) continue;
      worked.push(candidate.cell);
      assigned.add(candidate.cell);
      food += candidate.yields.food;
    }

    // Phase 2: ruler-weighted total yield for the remaining citizens.
    const byWeight = [...candidates].sort((a, b) => b.weight - a.weight || a.hops - b.hops || a.cell - b.cell);
    for (const candidate of byWeight) {
      if (worked.length >= citizens) break;
      if (assigned.has(candidate.cell)) continue;
      if (candidate.weight <= 0) break;
      worked.push(candidate.cell);
      assigned.add(candidate.cell);
    }

    const total = { ...centerYields };
    for (const cell of worked) {
      if (globalWorkedCells) globalWorkedCells.add(cell);
      const yields = getCellYields(cell, state.i, living);
      for (const key of CIV_YIELD_KEYS) total[key] += yields[key];
    }
    for (const id of bSim.civBuildings ?? []) {
      const def = CIV_BUILDING_BY_ID[id];
      if (!def) continue;
      for (const key of CIV_YIELD_KEYS) total[key] += def.stats[key] ?? 0;
    }

    bSim.workedCells = worked;
    return total;
  }

  /** Food as a percentage of the bucket kept on growth (Aqueduct / Hospital). */
  private cityFoodCarryover(bSim: BurgSimState): number {
    const held = new Set(bSim.civBuildings ?? []);
    let percent = 0;
    if (held.has("aqueduct")) percent += 40;
    if (held.has("hospital")) percent += 25;
    return percent / 100;
  }

  /** Mutate a city's citizen count and mirror it onto `burg.population`. */
  private changeCitizens(
    state: State,
    burg: Burg,
    bSim: BurgSimState,
    living: LivingWorldState,
    nextCitizens: number
  ): void {
    const previous = bSim.citizens ?? 1;
    const next = minmax(Math.floor(nextCitizens), 1, MAX_CITIZENS);
    bSim.citizens = next;

    const target = populationFromCitizens(next);
    const current = Number(burg.population ?? 0);
    // Growth never shrinks an existing population; starvation sets it back.
    burg.population = next >= previous ? Math.max(current, target) : target;
    if (next > previous) this.growMinorBurgs(state, burg, living);
  }

  /** A growing Major Burg pulls its satellite villages up by 6%. */
  private growMinorBurgs(state: State, parent: Burg, _living: LivingWorldState): void {
    const provinceId = Number(pack.cells.province?.[parent.cell] ?? 0);
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.i === parent.i || burg.state !== state.i) continue;
      if (!isMinorBurg(burg)) continue;
      if (provinceId && Number(pack.cells.province?.[burg.cell] ?? 0) !== provinceId) continue;
      burg.population = Math.round(Number(burg.population ?? 0) * 1.06 * 10) / 10;
    }
  }

  /**
   * §4.2: Food consumption, growth multipliers, bucket carryover and
   * starvation. Returns Production converted from surplus Food by a queued
   * Settler.
   */
  private applyFoodGrowth(
    burg: Burg,
    bSim: BurgSimState,
    state: State,
    living: LivingWorldState,
    cityYields: YieldValues
  ): number {
    const sSim = living.states[state.i];
    const citizens = Math.max(1, bSim.citizens ?? 1);
    const surplus = cityYields.food - FOOD_PER_CITIZEN * citizens;

    const top = bSim.productionQueue?.[0];
    if (top?.kind === "unit" && top.id === SETTLER_UNIT_ID) {
      return surplus > 0 ? surplus * SETTLER_FOOD_TO_PRODUCTION_FACTOR : 0;
    }

    if (surplus > 0) {
      let multiplier = happinessGrowthFactor(sSim?.happiness ?? 0);
      if (multiplier > 0) {
        const beliefs = this.stateBeliefs(state, living);
        if (beliefs.has("fertility_rites")) multiplier *= 1.1;
        if (beliefs.has("swords_into_plowshares") && !this.stateAtWar(state)) multiplier *= 1.15;
        if ((bSim.civBuildings ?? []).includes("temple_of_artemis")) multiplier *= 1.1;
      }
      bSim.foodStored = (bSim.foodStored ?? 0) + surplus * multiplier;
    }

    const needed = foodNeededForGrowth(citizens);
    const stored = bSim.foodStored ?? 0;
    if (stored >= needed) {
      const carryover = this.cityFoodCarryover(bSim);
      bSim.foodStored = stored - needed + needed * carryover;
      this.changeCitizens(state, burg, bSim, living, citizens + 1);
    } else if (stored < 0) {
      bSim.foodStored = 0;
      this.changeCitizens(state, burg, bSim, living, Math.max(1, citizens - 1));
    }
    return 0;
  }

  /** Best unowned, workable cell to claim next: lowest influence score wins. */
  private pickBorderClaimCell(burg: Burg, state: State, living: LivingWorldState): number | null {
    let best: { cell: number; score: number } | null = null;
    const distances = this.cellHopDistances(burg.cell, MAX_ACQUIRE_DISTANCE);
    for (const [cell, hops] of distances) {
      if (cell === burg.cell) continue;
      if (pack.cells.state?.[cell] !== 0) continue;
      if (!this.isCityWorkable(cell)) continue;
      const bordersState = (pack.cells.c?.[cell] ?? []).some(neighbor => pack.cells.state?.[neighbor] === state.i);
      if (!bordersState) continue;
      const score = borderInfluenceScore(cell, hops, state.i, living);
      if (!best || score < best.score || (score === best.score && cell < best.cell)) best = { cell, score };
    }
    return best?.cell ?? null;
  }

  /**
   * §4.3: accumulate Culture and claim the best unowned cell. Claims go
   * through `States.setCells` where the pack is complete, and fall back to a
   * direct assignment on stripped saves.
   */
  private applyBorderGrowth(
    burg: Burg,
    bSim: BurgSimState,
    state: State,
    living: LivingWorldState,
    cityYields: YieldValues
  ): boolean {
    // realm states hold no surface territory: only surface burgs grow borders
    if (!isSurfaceBurg(burg) || state.cells === 0) return false;
    const tiles = bSim.tilesAcquired ?? 0;
    const held = new Set(bSim.civBuildings ?? []);
    const costFactor = held.has("angkor_wat") ? 0.75 : 1;
    const speedFactor = this.stateBeliefs(state, living).has("religious_settlements") ? 1.15 : 1;
    const needed = borderCultureNeeded(tiles, costFactor, speedFactor);

    bSim.cultureStored = (bSim.cultureStored ?? 0) + Math.max(0, cityYields.culture);
    if (bSim.cultureStored < needed) return false;

    const target = this.pickBorderClaimCell(burg, state, living);
    if (target === null) {
      // Keep the bucket full but clamped until there is land worth claiming.
      bSim.cultureStored = needed;
      bSim.nextBorderCell = null;
      return false;
    }

    const burgId = Number(pack.cells.burg?.[target] ?? 0);
    const encountered = burgId ? pack.burgs?.[burgId] : undefined;
    const previousOwner = encountered?.state ?? 0;
    const provinceId = Number(pack.cells.province?.[burg.cell] ?? 0);

    // Claim directly: `States.setCells()` recomputes poles and statistics on
    // every call, which is far too heavy inside a per-city seasonal loop.
    // `stepCities` refreshes the aggregate state statistics once per tick.
    pack.cells.state[target] = state.i;
    if (provinceId && pack.cells.province) pack.cells.province[target] = provinceId;
    if (encountered?.i) encountered.state = state.i;

    bSim.cultureStored -= needed;
    bSim.tilesAcquired = tiles + 1;
    bSim.nextBorderCell = null;

    if (encountered?.i && !encountered.removed) {
      this.handleFreeBurgEncounter(state, encountered, previousOwner, living);
    }
    return true;
  }

  /** Border growth reaching a Free Burg triggers the kinship/faith check. */
  private handleFreeBurgEncounter(state: State, burg: Burg, previousOwner: number, living: LivingWorldState): void {
    if (previousOwner) return;
    const bSim = living.burgs[burg.i];
    const kin = this.sharesKinshipOrFaith(state.i, burg.i);

    if (kin) {
      if (bSim) {
        bSim.unrest = 0;
        bSim.conqueredBy = undefined;
        bSim.originalOwner = state.i;
        bSim.originalCulture ??= burg.culture;
        bSim.originalReligion ??= pack.cells.religion?.[burg.cell] ?? 0;
      }
      this.logConquest(state, burg, false);
      return;
    }

    if (bSim) {
      bSim.conqueredBy = state.i;
      bSim.unrest = Math.max(bSim.unrest ?? 0, 6 + (bSim.citizens ?? citizensFromPopulation(burg.population ?? 0)));
    }
    this.logConquest(state, burg, true);
  }

  /** Can this Major Burg start this OpenCiv building or wonder? */
  private cityCanBuild(
    burg: Burg,
    state: State,
    def: CivBuildingDef,
    techs: Set<string>,
    held: Set<string>,
    living: LivingWorldState
  ): boolean {
    if (def.uniqueTo) return false;
    if (def.factionCategory) return false;
    if (held.has(def.id)) return false;
    if (def.requiredTech && !techs.has(def.requiredTech)) return false;
    if (def.requiresBuilding && !held.has(def.requiresBuilding)) return false;
    if (def.requiresRiver && !hasFreshWater(burg.cell)) return false;
    if (def.requiresMountain) {
      const nearMountain = (pack.cells.c?.[burg.cell] ?? []).some(cell => getCellTerrainInfo(cell).isMountain);
      if (!nearMountain) return false;
    }
    if (def.coastal) {
      const coastal = (pack.cells.c?.[burg.cell] ?? []).some(cell => Number(pack.cells.h?.[cell] ?? 0) < SEA_LEVEL);
      if (!coastal) return false;
    }
    if (def.isWonder) {
      const owner = living.worldWonders?.[def.id];
      if (owner && owner.burgId !== burg.i) return false;
    }
    if (def.nationalWonder) {
      const alreadyBuilt = this.majorBurgsOfState(state.i, living).some(other =>
        (living.burgs[other.i]?.civBuildings ?? []).includes(def.id)
      );
      if (alreadyBuilt) return false;
    }
    return true;
  }

  /**
   * §4.4: the autonomous governor picks the next project. Units are deferred
   * to Slice 5 (1UPT tacticals), so this queue holds buildings and wonders.
   */
  private chooseCityProduction(
    burg: Burg,
    bSim: BurgSimState,
    state: State,
    living: LivingWorldState
  ): ProductionItem | null {
    const sSim = living.states[state.i];
    const techs = new Set(sSim?.researchedTechs ?? []);
    const held = new Set(bSim.civBuildings ?? []);
    const canBuild = (def: CivBuildingDef | undefined): def is CivBuildingDef =>
      def !== undefined && this.cityCanBuild(burg, state, def, techs, held, living);

    // 1. Emergency defence: a war or restive city without walls raises them first.
    if ((this.stateAtWar(state) || (bSim.unrest ?? 0) > 0) && !held.has("walls")) {
      const walls = CIV_BUILDING_BY_ID.walls;
      if (canBuild(walls)) return { kind: "building", id: "walls" };
    }

    // 2. Economic and science core.
    for (const id of CITY_ECONOMY_BUILDINGS) {
      const def = CIV_BUILDING_BY_ID[id];
      if (canBuild(def)) return { kind: "building", id };
    }

    // 3. Expansion: a Builder while owned tiles sit unimproved, then a Settler.
    const unitAvailable = (id: string): boolean => {
      const def = CIV_CIVILIAN_BY_ID[id];
      if (!def) return false;
      return !def.requiredTech || techs.has(def.requiredTech);
    };
    if (this.stateUnitCount(state.i, "builder") === 0 && this.countUnimprovedCells(state.i, living) >= 2) {
      if (unitAvailable("builder")) return { kind: "unit", id: "builder" };
    }
    if (
      (sSim?.happiness ?? 0) >= 4 &&
      (bSim.citizens ?? 1) >= 3 &&
      this.stateUnitCount(state.i, "settler") === 0 &&
      unitAvailable("settler")
    ) {
      return { kind: "unit", id: "settler" };
    }

    // 4. Military: a war without a field army raises the cheapest roster melee.
    if (this.stateAtWar(state)) {
      const roster = Military.getRoster(state);
      const hasArmy = (state.military ?? []).some(regiment => living.armies?.[this.unitKey(state.i, regiment.i)]);
      if (roster && !hasArmy) {
        const melee = pickRosterUnit(roster, "melee", [...techs]);
        if (melee) return { kind: "unit", id: melee.id };
      }
    }

    // 5. National and World Wonders, cheapest first, deterministic on ties.
    const wonders = CIV_BUILDINGS.filter(def => (def.isWonder || def.nationalWonder) && canBuild(def)).sort(
      (a, b) => (a.cost ?? 0) - (b.cost ?? 0) || a.id.localeCompare(b.id)
    );
    if (wonders.length) return { kind: "wonder", id: wonders[0]!.id };
    return null;
  }

  /** Production price: civilians keep their Civ cost, combat blocks use the roster's. */
  private productionCost(state: State, item: ProductionItem): number {
    if (item.kind === "trouble") {
      // Environmental-trouble work order (Phase E): progress like a building.
      return 80;
    }
    if (item.kind === "operation") {
      if (item.id !== FACTION_SUPPRESSION_OPERATION_ID) return 1;
      const target = this.resolveFactionSuppressionTarget(state, item);
      const tier = target ? (target.isHq ? 2 : "tier" in target.node ? target.node.tier : 2) : 2;
      return factionSuppressionProductionCost({ tier });
    }
    const cost =
      item.kind === "unit"
        ? isCivilianUnit(item.id)
          ? CIV_CIVILIAN_BY_ID[item.id]?.cost
          : Military.getRoster(state)?.units[item.id]?.cost
        : CIV_BUILDING_BY_ID[item.id]?.cost;
    return Math.max(1, Math.floor(cost ?? 1));
  }

  /** §4.4: advance the top queue item by this tick's Production. */
  private applyProduction(
    burg: Burg,
    bSim: BurgSimState,
    state: State,
    living: LivingWorldState,
    cityYields: YieldValues,
    bonusProduction: number
  ): void {
    bSim.productionQueue ??= [];
    bSim.productionProgress ??= {};

    let production = Math.max(0, cityYields.production) + Math.max(0, bonusProduction);
    let guard = 0;
    while (production > 0 && guard++ < 8) {
      if (bSim.productionQueue.length === 0) {
        const next = this.chooseCityProduction(burg, bSim, state, living);
        if (!next) return;
        bSim.productionQueue.push(next);
      }

      const item = bSim.productionQueue[0]!;
      const key = `${item.kind}:${item.id}`;
      const cost = this.productionCost(state, item);
      const total = (bSim.productionProgress[key] ?? 0) + production;
      if (total < cost) {
        bSim.productionProgress[key] = total;
        return;
      }

      production = total - cost;
      delete bSim.productionProgress[key];
      bSim.productionQueue.shift();
      this.completeProductionItem(state, burg, bSim, item, living);
    }
  }

  /** Finish a queued unit, building or wonder and reconcile every mirror. */
  private completeProductionItem(
    state: State,
    burg: Burg,
    bSim: BurgSimState,
    item: ProductionItem,
    living: LivingWorldState
  ): void {
    const year = options.map?.lore?.calendar?.year ?? 1000;
    bSim.civBuildings ??= [];

    if (item.kind === "trouble") {
      // Phase E: the burg worked off an environmental affliction.
      const provinceId = pack.cells.province?.[burg.cell] ?? 0;
      const province = pack.provinces?.[provinceId];
      const pSim = provinceId ? living.provinces[provinceId] : undefined;
      if (pSim?.trouble) {
        const troubleName = pSim.trouble.name ?? "trouble";
        pSim.trouble = null;
        pSim.order = Math.min(100, pSim.order + 10);
        pSim.stability += 1;
        const name = province?.name ?? "the province";
        this.pushNews(living, {
          kind: "trouble",
          text: `${burg.name ?? state.name} worked through ${name}'s afflictions.`,
          cell: burg.cell,
          stateId: state.i,
          burgId: burg.i
        });
        this.pushHistory(
          "deed",
          [{ kind: "state", id: state.i }],
          burg.cell,
          `${burg.name ?? state.name} cleared the ${troubleName} afflicting ${name}.`
        );
      }
      return;
    }

    if (item.kind === "operation") {
      this.completeSuppressionOperation(state, bSim, item, living);
      return;
    }

    if (item.kind === "building" || item.kind === "wonder") {
      if (!bSim.civBuildings.includes(item.id)) bSim.civBuildings.push(item.id);
      syncCivFlagsFromBuildings(burg, bSim.civBuildings);
    }

    if (item.kind === "building" || item.kind === "wonder") {
      const sSim = living.states[state.i];
      const freeTechs = CIV_BUILDING_BY_ID[item.id]?.effects?.freeTechs ?? 0;
      if (sSim && freeTechs > 0) sSim.freeTechs = (sSim.freeTechs ?? 0) + freeTechs;
    }

    if (item.kind === "wonder") {
      living.worldWonders ??= {};
      living.worldWonders[item.id] = { burgId: burg.i, stateId: state.i, year };
      this.refundRivalWonders(item.id, burg.i, living);
      const name = CIV_BUILDING_BY_ID[item.id]?.name ?? item.id;
      this.pushNews(living, {
        kind: "build",
        text: `${burg.name ?? state.name} raised the ${name}.`,
        cell: burg.cell,
        stateId: state.i,
        burgId: burg.i
      });
      return;
    }

    if (item.kind === "building") {
      const name = CIV_BUILDING_BY_ID[item.id]?.name ?? item.id;
      this.pushNews(living, {
        kind: "build",
        text: `${burg.name ?? state.name} completed the ${name}.`,
        cell: burg.cell,
        stateId: state.i,
        burgId: burg.i
      });
      return;
    }

    if (this.hasCityTerrain()) {
      this.spawnUnit(state, burg, item.id);
      return;
    }
    this.muster(state.i);
  }

  /** Administrative suppression pressure after a host-city operation finishes. */
  private completeSuppressionOperation(
    state: State,
    _bSim: BurgSimState,
    item: ProductionItem,
    living: LivingWorldState
  ): void {
    if (item.id !== FACTION_SUPPRESSION_OPERATION_ID) return;
    const target = this.resolveFactionSuppressionTarget(state, item);
    if (!target) return;
    const sSim = living.states[state.i];
    if (this.factionNodeHasGuard(target.faction, target.node)) {
      // Guarded node stalls the campaign; repeated stalls strain the state.
      const agenda = sSim?.agenda?.kind === "suppress_faction" ? sSim.agenda : undefined;
      if (sSim && (!agenda?.stallUntilTick || agenda.stallUntilTick <= living.tick)) {
        sSim.unravel = Math.min(100, (sSim.unravel ?? 0) + 2);
      }
      if (agenda) agenda.stallUntilTick = living.tick + 4;
      return;
    }
    this.applyFactionSuppressionPressure(state, target, living);
  }

  /** Whether a non-civilian faction regiment is defending this node cell. */
  private factionNodeHasGuard(faction: Faction, node: FactionHq | FactionOutpost): boolean {
    return (faction.military ?? []).some(
      regiment =>
        regiment.cell === node.cell && !armyIsEmpty(regiment) && !isCivilianUnit((regiment.type ?? "").toLowerCase())
    );
  }

  /** Apply one administrative suppression effect when the target node is unguarded. */
  private applyFactionSuppressionPressure(
    state: State,
    target: FactionSuppressionTarget,
    living: LivingWorldState
  ): void {
    const { node, isHq, burg } = target;
    if (!burg?.i) return; // Wilderness strongholds are military-only, not administrative pressure.

    // Guards must be dealt with first; a defending army pauses administrative pressure.
    if (this.factionNodeHasGuard(target.faction, node)) return;

    const provinceId = Number(pack.cells.province?.[burg.cell] ?? 0);
    const pSim = provinceId ? living.provinces?.[provinceId] : undefined;
    const provinceOrder = pSim?.order ?? 70;
    const influenceDamage = Math.max(1, Math.floor((provinceOrder - node.secrecy) / 20));

    if (isHq) {
      node.influence = Math.max(0, (node.influence ?? 70) - influenceDamage);
    } else {
      node.influence = Math.max(0, (node.influence ?? 70) - influenceDamage);
    }

    if (pSim) pSim.order = Math.min(100, pSim.order + 2);
    const bSim = living.burgs[burg.i];
    if (bSim) bSim.unrest = Math.min(100, (bSim.unrest ?? 0) + 1);

    const remaining = node.influence ?? 0;
    if (remaining <= 0) this.pillageFactionNode(state, target, living);
  }

  /** Pillage a depleted node, clear its queue state, and run relocation/dissolution checks. */
  private pillageFactionNode(state: State, target: FactionSuppressionTarget, living: LivingWorldState): void {
    const { faction, node, isHq, burg } = target;
    const targetCell = factionSuppressionTargetCell(target);
    const location = factionSuppressionLocationName(target);
    node.pillaged = true;
    if ("influence" in node || isHq) (node as FactionHq | FactionOutpost).influence = 0;

    // Drop any partial suppression work queued for this node.
    if (burg?.i) {
      const bSim = living.burgs[burg.i];
      if (bSim?.productionQueue) {
        bSim.productionQueue = bSim.productionQueue.filter(
          item =>
            !(
              item.kind === "operation" &&
              item.id === FACTION_SUPPRESSION_OPERATION_ID &&
              item.targetFactionId === faction.i &&
              item.targetNodeKey === target.nodeKey
            )
        );
        if (bSim.productionProgress) delete bSim.productionProgress[`operation:${FACTION_SUPPRESSION_OPERATION_ID}`];
      }
    }

    if (!isHq && burg?.i) {
      this.pushNews(living, {
        kind: "faction",
        text: `${state.name} razed the ${faction.name} enclave in ${burg.name ?? "a burg"}.`,
        cell: burg.cell,
        stateId: state.i,
        burgId: burg.i
      });
    }
    if (isHq && target.wilderness) {
      this.pushNews(living, {
        kind: "faction",
        text: `${state.name} razed the ${faction.name} stronghold in ${location}.`,
        cell: targetCell,
        stateId: state.i
      });
    }

    if (isHq) this.relocateOrDissolveFaction(state, faction, living);

    // Retarget or cancel the suppressing state's agenda.
    const sSim = living.states[state.i];
    const agenda = sSim?.agenda;
    if (agenda?.kind === "suppress_faction" && agenda.targetFactionId === faction.i) {
      if (faction.removed) {
        sSim.agenda = null;
      } else {
        const next = this.eligibleFactionSuppressionTargets(state.i).find(entry => entry.faction.i === faction.i);
        if (next) {
          agenda.targetBurgId = next.burg?.i;
          agenda.targetCell = next.burg?.i ? undefined : next.cell;
          agenda.label = `Suppressing ${next.faction.name} in ${factionSuppressionLocationName(next)}`;
        } else {
          sSim.agenda = null;
        }
      }
    }
  }

  /** After an urban HQ falls: relocate to the strongest outpost, or dissolve the faction. */
  private relocateOrDissolveFaction(state: State, faction: Faction, living: LivingWorldState): void {
    const survivors = [...(faction.outposts ?? [])]
      .filter(outpost => !outpost.pillaged)
      .sort((a, b) => b.influence - a.influence || a.burgId - b.burgId);
    const survivor = survivors[0];

    if (!survivor) {
      Factions.remove(faction.i);
      this.pushNews(living, {
        kind: "faction",
        text: `${faction.name} was dissolved after its last stronghold fell.`,
        cell: faction.hq?.cell,
        ...(faction.hq?.burgId ? { burgId: faction.hq.burgId } : {})
      });
      return;
    }

    const oldHq = faction.hq;
    const burg = pack.burgs[survivor.burgId];
    faction.outposts = (faction.outposts ?? []).filter(outpost => outpost !== survivor);
    faction.hq = {
      cell: survivor.cell,
      burgId: survivor.burgId,
      fortified: oldHq?.fortified ?? false,
      pillaged: false,
      influence: survivor.influence,
      secrecy: survivor.secrecy,
      assets: [...survivor.assets],
      sim: survivor.sim
    };
    ensureFactionNodeSim(faction.hq, true);
    this.pushNews(living, {
      kind: "faction",
      text: `${faction.name} fled to ${burg?.name ?? "a new stronghold"}.`,
      cell: survivor.cell,
      stateId: state.i,
      burgId: survivor.burgId
    });
  }

  /** Temporary militia garrison for a faction stronghold, from citizens, tier and fortifications. */
  factionGarrisonBlocks(faction: Faction, node: FactionHq | FactionOutpost, isHq: boolean): ArmyBlock[] {
    const types = Military.getUnitTypes();
    const roster = faction.rosterId ? Military.getRoster(faction) : undefined;
    const techs = new Set(faction.researchedTechs ?? []);
    const melee =
      (roster ? pickRosterUnit(roster, "melee", [...techs]) : undefined) ??
      Object.values(types).find(type => type.category === "melee") ??
      Object.values(types)[0];
    if (!melee) return [];

    const nodeTier = "tier" in node ? node.tier : 2;
    const citizens = Math.max(1, Math.floor(node.sim?.citizens ?? (isHq ? 2 : nodeTier)));
    const tier = isHq ? 2 : nodeTier;
    const fortified = isHq && "fortified" in node && node.fortified ? 1 : 0;
    const count = Math.min(FACTION_GARRISON_BLOCK_CAP, Math.max(2, citizens + tier + fortified * 2));
    return Array.from({ length: count }, () => ({ type: melee.id, hp: 1, exp: 0 }));
  }

  /** Whether an unguarded node can be stormed directly (low influence or fortified). */
  private factionNodeAssaultable(node: FactionHq | FactionOutpost, isHq: boolean): boolean {
    const influence = node.influence ?? 70;
    if (influence <= FACTION_SUPPRESSION_ASSAULT_THRESHOLD) return true;
    if (isHq && "fortified" in node && node.fortified) return true;
    if (!isHq && "tier" in node && node.tier >= 3) return true;
    return false;
  }

  /**
   * Storm a faction node with the state's field army through the shared
   * battle engine. Victory pillages the node; failure retreats the army and
   * delays the suppression campaign. Wilderness HQs are military-only: there
   * is no host city, so they are stormed directly rather than pressured.
   */
  assaultFactionNode(stateId: number, factionId: number, nodeKey?: string): boolean {
    const living = this.getState();
    const state = pack.states[stateId];
    const sSim = living.states[stateId];
    if (!state?.i || state.removed || !sSim) return false;

    const target =
      this.eligibleFactionSuppressionTargets(stateId).find(
        entry => entry.faction.i === factionId && (nodeKey === undefined || entry.nodeKey === nodeKey)
      ) ?? null;
    if (!target) return false;
    const { faction, node, isHq, burg } = target;
    const targetCell = factionSuppressionTargetCell(target);
    const location = factionSuppressionLocationName(target);

    const army = this.fieldArmy(state);
    if (!army) return false;

    const types = Military.getUnitTypes();
    const ranged = armyIsRangedBlocks(army, types);
    if (!this.cellHopDistances(army.cell, ranged ? 2 : 1).has(targetCell)) return false;

    const attackerUnits = toBattleUnits(army.units ?? []);
    const defenderUnits = toBattleUnits(this.factionGarrisonBlocks(faction, node, isHq));
    if (attackerUnits.length === 0 || defenderUnits.length === 0) return false;

    const { config } = currentContent();
    const maxSlots = config.military.maxUnitsPerArmy;
    const attackerKey = this.unitKey(state.i, army.i);
    const attackerArmy = living.armies?.[attackerKey];
    const fortified = (isHq && "fortified" in node && node.fortified) || (!isHq && "tier" in node && node.tier >= 3);

    const session = initBattleSession({
      config,
      unitTypes: toBattleTypes(types),
      attacker: { factionId: state.i, armyId: `fm-${state.i}-${army.i}`, units: attackerUnits },
      defender: {
        factionId: this.factionOwnerId(faction.i),
        armyId: `fm-f${faction.i}-garrison`,
        units: defenderUnits
      },
      cell: targetCell,
      regionId: pack.cells.province?.[targetCell] ?? 0,
      assault: true,
      modifiers: {
        walls: fortified ? 1 : 0,
        defenderEncamped: fortified,
        defenderAmbushed: attackerArmy?.stance === "ambush",
        attackerCrossedRiver:
          Number(pack.cells.r?.[army.cell] ?? 0) !== Number(pack.cells.r?.[targetCell] ?? 0) &&
          Number(pack.cells.r?.[targetCell] ?? 0) > 0,
        defenderTerrain: terrainDefenseMultiplier(targetCell) > 1,
        labels: [fortified ? `${burg?.name ?? "stronghold"} (fortified)` : (burg?.name ?? "stronghold")],
        ...(this.stateCombatMult(sSim.stateId, living) !== 1
          ? { attackerLordMult: this.stateCombatMult(sSim.stateId, living) }
          : {}),
        ...(happinessCombatMultiplier(faction.happiness ?? 0) !== 1
          ? { defenderLordMult: happinessCombatMultiplier(faction.happiness ?? 0) }
          : {})
      }
    });

    const rng = this.rng("faction:assault", state.i * 1000 + targetCell, living.tick);
    while (session.status === "active" && session.round < config.battle.maxRounds) {
      stepBattleRound(session, rng.next, {
        attacker: this.battleOrder(session, "attacker", attackerArmy?.stance ?? "march"),
        defender: this.battleOrder(session, "defender", "fortify")
      });
    }
    const outcome = finalizeBattle(session, rng.next);
    const attackerHpBefore = attackerUnits.reduce((sum, unit) => sum + unit.count, 0);

    army.units = fromBattleUnits(outcome.attacker.units);
    normalizeArmy(army, maxSlots, types);
    if (attackerArmy) {
      attackerArmy.hasFought = true;
      attackerArmy.lastBattle = this.battleRecord(army, "attacker", outcome.winner, session.round, living.tick, {
        before: attackerHpBefore,
        after: armyStrength(army),
        beforeBlocks: attackerUnits.length,
        afterBlocks: army.units?.length ?? 0
      });
    }
    syncRegimentTotals(army, types);

    const sSimAgenda = sSim.agenda?.kind === "suppress_faction" ? sSim.agenda : undefined;
    if (outcome.winner === "attacker") {
      for (const block of army.units ?? []) this.awardBlockExp(block, 5);
      if (armyIsEmpty(army) && army.units?.[0]) army.units[0].hp = 0.01;
      if (this.armyHasMelee(army, types)) {
        const occupancy = this.armyOccupancy(living);
        this.moveRegimentTo(army, targetCell, state.i, attackerKey, occupancy);
      }
      this.addBattleMarker(targetCell, `${state.name} vs ${faction.name}`);
      this.pillageFactionNode(state, target, living);
      return true;
    }

    if (armyIsEmpty(army)) {
      this.removeRegiment(state, army, living);
    } else {
      // Retreat one hop toward friendly land; otherwise hold and delay.
      const neighbors = [...(pack.cells.c?.[targetCell] ?? [])]
        .filter(cell => cell !== targetCell)
        .sort((a, b) => a - b);
      const retreat = neighbors.find(cell => pack.cells.state?.[cell] === state.i) ?? neighbors[0];
      if (retreat !== undefined && retreat !== army.cell) {
        const occupancy = this.armyOccupancy(living);
        this.moveRegimentTo(army, retreat, state.i, attackerKey, occupancy);
      }
    }
    if (sSimAgenda) sSimAgenda.stallUntilTick = living.tick + 4;
    sSim.unravel = Math.min(100, (sSim.unravel ?? 0) + 2);
    this.addBattleMarker(targetCell, `${state.name} vs ${faction.name}`);
    this.pushNews(living, {
      kind: "faction",
      text: `${state.name} failed to storm the ${faction.name} stronghold in ${location}.`,
      cell: targetCell,
      stateId: state.i,
      ...(burg?.i ? { burgId: burg.i } : {})
    });
    return false;
  }

  /** Queue one suppression operation for the target's host city, if not already queued. */
  private enqueueFactionSuppression(target: FactionSuppressionTarget, living: LivingWorldState): boolean {
    if (!target.burg?.i) return false; // Wilderness strongholds have no host city queue.
    const bSim = living.burgs[target.burg.i!];
    if (!bSim?.isMajor) return false;
    bSim.productionQueue ??= [];
    bSim.productionProgress ??= {};
    const queued = bSim.productionQueue.some(
      item =>
        item.kind === "operation" &&
        item.id === FACTION_SUPPRESSION_OPERATION_ID &&
        item.targetFactionId === target.faction.i &&
        item.targetNodeKey === target.nodeKey
    );
    if (queued) return false;
    bSim.productionQueue.push({
      kind: "operation",
      id: FACTION_SUPPRESSION_OPERATION_ID,
      targetFactionId: target.faction.i,
      targetNodeKey: target.nodeKey
    });
    return true;
  }

  /** Resolve an operation/stale agenda target into its live faction node and host burg. */
  private resolveFactionSuppressionTarget(
    state: State,
    item: { targetFactionId?: number; targetNodeKey?: string }
  ): FactionSuppressionTarget | null {
    const factionId = item.targetFactionId;
    const faction = factionId !== undefined ? pack.factions?.[factionId] : undefined;
    if (!faction?.i || faction.removed) return null;

    const nodes: { node: FactionHq | FactionOutpost; isHq: boolean }[] = [];
    if (faction.hq && !faction.hq.pillaged) nodes.push({ node: faction.hq, isHq: true });
    for (const outpost of faction.outposts ?? []) {
      if (!outpost.pillaged) nodes.push({ node: outpost, isHq: false });
    }

    for (const { node, isHq } of nodes) {
      if (item.targetNodeKey !== undefined && item.targetNodeKey !== factionSuppressionNodeKey(node, isHq)) continue;
      const candidateBurg = node.burgId ? pack.burgs[node.burgId] : undefined;
      if (candidateBurg?.i && !candidateBurg.removed) {
        if (candidateBurg.state !== state.i) continue;
        return {
          faction,
          node,
          isHq,
          burg: candidateBurg,
          cell: candidateBurg.cell,
          wilderness: false,
          nodeKey: factionSuppressionNodeKey(node, isHq),
          score: 0
        };
      }
      // Wilderness HQ: HQ without a burg, anchored to a state-owned cell.
      if (isHq && node.cell !== undefined && node.cell >= 0 && Number(pack.cells.state?.[node.cell] ?? 0) === state.i) {
        return {
          faction,
          node,
          isHq,
          burg: null,
          cell: node.cell,
          wilderness: true,
          nodeKey: factionSuppressionNodeKey(node, isHq),
          score: 0
        };
      }
    }
    return null;
  }

  /** Hurry a city-node suppression operation without changing the gold reserve rule. */
  hurryFactionSuppression(burgId: number): boolean {
    const living = this.getState();
    const burg = pack.burgs[burgId];
    const bSim = living.burgs[burgId];
    if (!burg?.i || burg.removed || !burg.state || !bSim?.productionQueue?.[0]) return false;

    const item = bSim.productionQueue[0]!;
    if (item.kind !== "operation" || item.id !== FACTION_SUPPRESSION_OPERATION_ID) return false;

    const state = pack.states[burg.state];
    if (!state?.i || state.removed) return false;
    if (!this.resolveFactionSuppressionTarget(state, item)) return false;

    const key = `${item.kind}:${item.id}`;
    const remaining = Math.max(0, this.productionCost(state, item) - (bSim.productionProgress?.[key] ?? 0));
    if (remaining <= 0) return false;

    const price = hurryGoldCost(remaining, false, (bSim.civBuildings ?? []).includes("big_ben"));
    if (Number(state.economy.treasury ?? 0) < price + GOLD_PURCHASE_RESERVE) return false;

    state.economy.treasury = Math.round((Number(state.economy.treasury ?? 0) - price) * 100) / 100;
    if (bSim.productionProgress) delete bSim.productionProgress[key];
    bSim.productionQueue.shift();
    this.completeProductionItem(state, burg, bSim, item, living);
    return true;
  }

  /** A wonder winner refunds 1 Gold per 1 Production invested by every rival. */
  private refundRivalWonders(wonderId: string, winnerBurgId: number, living: LivingWorldState): void {
    const key = `wonder:${wonderId}`;
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.i === winnerBurgId) continue;
      const bSim = living.burgs[burg.i];
      if (!bSim?.productionQueue?.length) continue;

      const index = bSim.productionQueue.findIndex(item => item.kind === "wonder" && item.id === wonderId);
      if (index === -1) continue;

      const invested = Math.floor(bSim.productionProgress?.[key] ?? 0);
      bSim.productionQueue.splice(index, 1);
      if (bSim.productionProgress) delete bSim.productionProgress[key];

      const owner = pack.states[burg.state ?? 0];
      if (invested > 0 && owner?.i && !owner.removed) {
        owner.economy.treasury = Number(owner.economy.treasury ?? 0) + invested;
      }
    }
  }

  /** One seasonal OpenCiv tick for every owned Major Burg and every Faction HQ/Outpost node. */
  private stepCities(living: LivingWorldState): void {
    if (!this.hasCityTerrain()) return;
    living.worldWonders ??= {};
    let bordersChanged = false;
    const globalWorkedCells = new Set<number>();
    const draftedFactionNodes = new Set<BurgSimState>();
    const factionNodes = this.collectFactionNodes();

    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || !burg.state) continue;
      const state = pack.states[burg.state];
      if (!state?.i || state.removed) continue;
      if (!isMajorBurg(burg)) continue;

      const bSim = living.burgs[burg.i];
      if (!bSim) continue;

      // AER development can outgrow the stored citizen count; adopt the higher.
      const derived = citizensFromPopulation(burg.population ?? 0);
      bSim.citizens = Math.max(1, bSim.citizens ?? derived, derived);

      const residentNodes = factionNodes.filter(entry => entry.node.burgId === burg.i || entry.node.cell === burg.cell);

      let yields: YieldValues;
      if (residentNodes.length === 0) {
        yields = this.updateWorkedCells(burg, bSim, state, living, globalWorkedCells);
      } else {
        yields = this.allocateCompetitiveBurgCells(
          burg,
          bSim,
          state,
          residentNodes,
          living,
          globalWorkedCells,
          draftedFactionNodes
        );
      }
      bSim.cityYields = yields;

      const bonusProduction = this.applyFoodGrowth(burg, bSim, state, living, yields);
      if (this.applyBorderGrowth(burg, bSim, state, living, yields)) bordersChanged = true;
      this.applyProduction(burg, bSim, state, living, yields, bonusProduction);
    }

    // Run OpenCiv city loop for all Faction HQs and Outposts (Major Burg residents, Minor Burg residents, and Wilderness HQs)
    for (const entry of factionNodes) {
      if (!draftedFactionNodes.has(entry.sim)) {
        entry.sim.cityYields = this.updateFactionNodeWorkedCells(
          entry.faction,
          entry.node,
          entry.sim,
          entry.isHq,
          living,
          globalWorkedCells
        );
      }
      const yields = entry.sim.cityYields ?? emptyYields();
      const bonusProd = this.applyFactionFoodGrowth(entry.faction, entry.node, entry.sim, entry.isHq, yields);
      if (this.applyFactionBorderGrowth(entry.faction, entry.node, entry.sim, entry.isHq, living, yields)) {
        bordersChanged = true;
      }
      this.applyFactionProduction(entry.faction, entry.node, entry.sim, entry.isHq, living, yields, bonusProd);
    }

    if (bordersChanged && pack.cells.area) {
      try {
        States.collectStatistics();
      } catch {
        // Stripped test packs have no full statistics grid; borders still moved.
      }
    }
  }

  /** Collect all active Faction HQ and Outpost BurgSimState nodes ordered by draft priority. */
  private collectFactionNodes(): {
    faction: Faction;
    node: FactionHq | FactionOutpost;
    sim: BurgSimState;
    isHq: boolean;
  }[] {
    const entries: {
      faction: Faction;
      node: FactionHq | FactionOutpost;
      sim: BurgSimState;
      isHq: boolean;
    }[] = [];
    for (const faction of Factions.active()) {
      syncFactionState(faction);
      if (faction.hq && !faction.hq.pillaged) {
        entries.push({ faction, node: faction.hq, sim: ensureFactionNodeSim(faction.hq, true), isHq: true });
      }
      for (const outpost of faction.outposts ?? []) {
        if (outpost.pillaged) continue;
        entries.push({ faction, node: outpost, sim: ensureFactionNodeSim(outpost, false), isHq: false });
      }
    }
    return entries;
  }

  /** Classify how a Faction Node competes with a host State. */
  private factionCompetitionMode(
    faction: Faction,
    hostStateId: number
  ): "predatory" | "autonomous" | "chartered" | "cooperative" {
    const rel = hostStateId > 0 ? faction.stateRelations?.[hostStateId] : undefined;
    if (faction.allegiance === "clandestine" || faction.allegiance === "hostile" || rel === "Enemy") {
      return "predatory";
    }
    if (faction.allegiance === "state_arm" || (rel === "Ally" && faction.patronStateId === hostStateId)) {
      return "cooperative";
    }
    if (faction.allegiance === "chartered" || rel === "Friendly") {
      return "chartered";
    }
    return "autonomous";
  }

  /** Weight a candidate cell's yields for a Faction based on its category. */
  private factionWorkWeight(yields: YieldValues, faction: Faction): number {
    switch (faction.category) {
      case "commercial":
        return yields.food + yields.gold * 1.6 + yields.production * 1.2 + yields.science + yields.culture;
      case "martial":
        return yields.food * 1.2 + yields.production * 1.6 + yields.gold + yields.culture;
      case "adventuring":
        return yields.food + yields.science * 1.6 + yields.gold * 1.3 + yields.culture * 1.2;
      case "religious":
        return yields.food + yields.faith * 1.6 + yields.culture * 1.4 + yields.gold;
      case "underworld":
        return yields.food + yields.gold * 1.8 + yields.production * 1.2 + yields.happiness;
      default:
        return yields.food + yields.production * 1.4 + yields.gold * 1.4 + yields.science * 1.2;
    }
  }

  /**
   * Competitive Worked-Cell Draft between a State Major Burg and resident Faction HQs/Outposts.
   * Implements predatory pre-draft + gold siphon, autonomous influence-vs-order interleaving,
   * chartered alternating draft + 15% tithe, and state_arm cooperative residual draft.
   */
  private allocateCompetitiveBurgCells(
    burg: Burg,
    bSim: BurgSimState,
    state: State,
    residentNodes: { faction: Faction; node: FactionHq | FactionOutpost; sim: BurgSimState; isHq: boolean }[],
    living: LivingWorldState,
    globalWorkedCells: Set<number>,
    draftedFactionNodes: Set<BurgSimState>
  ): YieldValues {
    const stateCitizens = Math.max(1, Math.floor(bSim.citizens ?? citizensFromPopulation(burg.population ?? 0)));
    bSim.citizens = stateCitizens;

    const stateCenterYields = getCellYields(burg.cell, state.i, living);
    if (stateCenterYields.food < 2) stateCenterYields.food = 2;

    const taken = new Set<number>(globalWorkedCells);
    for (const other of this.majorBurgsOfState(state.i, living)) {
      if (other.i === burg.i) continue;
      for (const cell of living.burgs[other.i]?.workedCells ?? []) taken.add(cell);
    }

    const distances = this.cellHopDistances(burg.cell, MAX_WORK_DISTANCE);
    const stateCandidates: { cell: number; hops: number; yields: YieldValues; weight: number }[] = [];
    const factionCandidateCells: { cell: number; hops: number }[] = [];
    for (const [cell, hops] of distances) {
      if (cell === burg.cell || taken.has(cell)) continue;
      if (!this.isCityWorkable(cell)) continue;
      factionCandidateCells.push({ cell, hops });
      if (pack.cells.state?.[cell] === state.i) {
        const yields = getCellYields(cell, state.i, living);
        stateCandidates.push({ cell, hops, yields, weight: this.cityWorkWeight(yields, state, living) });
      }
    }

    const provinceId = Number(pack.cells.province?.[burg.cell] ?? 0);
    const localOrder = provinceId ? (living.provinces?.[provinceId]?.order ?? 70) : 70;

    type NodeDraftState = {
      faction: Faction;
      node: FactionHq | FactionOutpost;
      sim: BurgSimState;
      isHq: boolean;
      mode: "predatory" | "autonomous" | "chartered" | "cooperative";
      influence: number;
      citizens: number;
      worked: number[];
      food: number;
      centerYields: YieldValues;
    };

    const nodeStates: NodeDraftState[] = residentNodes.map(entry => {
      const citizens = Math.max(1, Math.floor(entry.sim.citizens ?? (entry.isHq ? 2 : 1)));
      entry.sim.citizens = citizens;
      const influence = entry.node.influence ?? 70;
      const centerYields: YieldValues = {
        food: 2,
        production: 1,
        gold: 1,
        science: 0,
        culture: 0,
        faith: 0,
        happiness: 0
      };
      return {
        ...entry,
        mode: this.factionCompetitionMode(entry.faction, state.i),
        influence,
        citizens,
        worked: [],
        food: centerYields.food,
        centerYields
      };
    });

    const assigned = new Set<number>();
    const pickBestForFaction = (ns: NodeDraftState, preferValue: boolean): boolean => {
      if (ns.worked.length >= ns.citizens) return false;
      const needsFood = !preferValue && ns.food - FOOD_PER_CITIZEN * ns.citizens < DEFAULT_FOCUS_GROWTH_TARGET;
      let best: { cell: number; hops: number; score: number; food: number } | null = null;
      for (const cand of factionCandidateCells) {
        if (assigned.has(cand.cell) || taken.has(cand.cell)) continue;
        const yields = getCellYields(cand.cell, state.i, living);
        if (needsFood && yields.food <= 0) continue;
        const score = needsFood
          ? yields.food * 100 - cand.hops
          : preferValue
            ? yields.gold * 2.5 +
              yields.production * 1.8 +
              yields.food * 1.2 +
              yields.science +
              yields.culture +
              yields.happiness * 2
            : this.factionWorkWeight(yields, ns.faction);
        if (score <= 0) continue;
        if (
          !best ||
          score > best.score ||
          (score === best.score && cand.hops < best.hops) ||
          (score === best.score && cand.hops === best.hops && cand.cell < best.cell)
        ) {
          best = { cell: cand.cell, hops: cand.hops, score, food: yields.food };
        }
      }
      if (!best) return false;
      ns.worked.push(best.cell);
      assigned.add(best.cell);
      ns.food += best.food;
      return true;
    };

    const stateWorked: number[] = [];
    let stateFood = stateCenterYields.food;
    const stateConsumption = FOOD_PER_CITIZEN * stateCitizens;
    const stateFoodFloorReached = () => stateFood - stateConsumption >= DEFAULT_FOCUS_GROWTH_TARGET;
    const stateByFood = [...stateCandidates].sort(
      (a, b) => b.yields.food - a.yields.food || a.hops - b.hops || a.cell - b.cell
    );
    const stateByWeight = [...stateCandidates].sort(
      (a, b) => b.weight - a.weight || a.hops - b.hops || a.cell - b.cell
    );

    const pickNextForState = (foodMode: boolean): boolean => {
      if (stateWorked.length >= stateCitizens) return false;
      const list = foodMode ? stateByFood : stateByWeight;
      for (const cand of list) {
        if (assigned.has(cand.cell) || taken.has(cand.cell)) continue;
        if (foodMode && cand.yields.food <= 0) continue;
        if (!foodMode && cand.weight <= 0) return false;
        stateWorked.push(cand.cell);
        assigned.add(cand.cell);
        stateFood += cand.yields.food;
        return true;
      }
      return false;
    };

    // Phase A: Predatory (clandestine / hostile / Enemy) pre-draft before the host State Burg
    const predatoryNodes = nodeStates
      .filter(n => n.mode === "predatory")
      .sort((a, b) => b.influence - a.influence || a.faction.i - b.faction.i);
    for (const ns of predatoryNodes) {
      const preDraftQuota = Math.min(ns.citizens, Math.max(1, Math.ceil(ns.influence / 25)));
      while (ns.worked.length < preDraftQuota) {
        if (!pickBestForFaction(ns, true)) break;
      }
    }

    // Phase B: Locked cells (State Burg first, then Faction Nodes)
    for (const cell of bSim.lockedCells ?? []) {
      if (stateWorked.length >= stateCitizens) break;
      if (assigned.has(cell) || !stateCandidates.some(c => c.cell === cell)) continue;
      stateWorked.push(cell);
      assigned.add(cell);
      stateFood += getCellYields(cell, state.i, living).food;
    }
    for (const ns of nodeStates) {
      for (const cell of ns.sim.lockedCells ?? []) {
        if (ns.worked.length >= ns.citizens) break;
        if (assigned.has(cell) || !factionCandidateCells.some(c => c.cell === cell)) continue;
        ns.worked.push(cell);
        assigned.add(cell);
        ns.food += getCellYields(cell, state.i, living).food;
      }
    }

    const highAutonomous = nodeStates
      .filter(n => n.mode === "autonomous" && n.influence >= localOrder)
      .sort((a, b) => b.influence - a.influence || a.faction.i - b.faction.i);
    const lowAutonomous = nodeStates
      .filter(n => n.mode === "autonomous" && n.influence < localOrder)
      .sort((a, b) => b.influence - a.influence || a.faction.i - b.faction.i);
    const charteredNodes = nodeStates
      .filter(n => n.mode === "chartered")
      .sort((a, b) => b.influence - a.influence || a.faction.i - b.faction.i);
    const cooperativeNodes = nodeStates
      .filter(n => n.mode === "cooperative")
      .sort((a, b) => b.influence - a.influence || a.faction.i - b.faction.i);

    // Phase C: State Food Floor (interleaved with high-influence autonomous factions)
    while (stateWorked.length < stateCitizens && !stateFoodFloorReached()) {
      for (const ns of highAutonomous) pickBestForFaction(ns, false);
      if (!pickNextForState(true)) break;
    }

    // Phase D: Interleaved Round-Robin between State Burg, Chartered, and Autonomous Factions
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const ns of highAutonomous) {
        if (pickBestForFaction(ns, false)) progressed = true;
      }
      if (pickNextForState(false)) progressed = true;
      for (const ns of charteredNodes) {
        if (pickBestForFaction(ns, false)) progressed = true;
      }
      for (const ns of lowAutonomous) {
        if (pickBestForFaction(ns, false)) progressed = true;
      }
    }

    // Phase E: Cooperative (state_arm) & remaining predatory citizens work remaining cells
    let coopProgressed = true;
    while (coopProgressed) {
      coopProgressed = false;
      for (const ns of cooperativeNodes) {
        if (pickBestForFaction(ns, false)) coopProgressed = true;
      }
      for (const ns of predatoryNodes) {
        if (pickBestForFaction(ns, false)) coopProgressed = true;
      }
    }

    // Phase F: Sum yields, apply building stats, Charter Tax (15%), and Clandestine/Hostile Gold Siphon
    const stateTotal = { ...stateCenterYields };
    for (const cell of stateWorked) {
      globalWorkedCells.add(cell);
      const yields = getCellYields(cell, state.i, living);
      for (const key of CIV_YIELD_KEYS) stateTotal[key] += yields[key];
    }
    for (const id of bSim.civBuildings ?? []) {
      const def = CIV_BUILDING_BY_ID[id];
      if (!def) continue;
      for (const key of CIV_YIELD_KEYS) stateTotal[key] += def.stats[key] ?? 0;
    }

    for (const ns of nodeStates) {
      const fTotal = { ...ns.centerYields };
      for (const cell of ns.worked) {
        globalWorkedCells.add(cell);
        const yields = getCellYields(cell, state.i, living);
        for (const key of CIV_YIELD_KEYS) fTotal[key] += yields[key];
      }
      for (const id of ns.sim.civBuildings ?? []) {
        const def = CIV_BUILDING_BY_ID[id];
        if (!def) continue;
        for (const key of CIV_YIELD_KEYS) fTotal[key] += def.stats[key] ?? 0;
      }

      if (ns.mode === "chartered" && fTotal.gold > 0) {
        const charterTax = Math.round(fTotal.gold * 0.15 * 100) / 100;
        fTotal.gold = Math.round((fTotal.gold - charterTax) * 100) / 100;
        stateTotal.gold = Math.round((stateTotal.gold + charterTax) * 100) / 100;
      } else if (ns.mode === "predatory" && stateTotal.gold > 0) {
        const siphonShare = Math.min(0.5, ns.influence / 200);
        const siphonedGold = Math.round(stateTotal.gold * siphonShare * 100) / 100;
        stateTotal.gold = Math.round(Math.max(0, stateTotal.gold - siphonedGold) * 100) / 100;
        fTotal.gold = Math.round((fTotal.gold + siphonedGold) * 100) / 100;
      }

      ns.sim.workedCells = ns.worked;
      ns.sim.cityYields = fTotal;
      ns.sim.isMajor = true;
      draftedFactionNodes.add(ns.sim);
    }

    bSim.workedCells = stateWorked;
    bSim.isMajor = true;
    return stateTotal;
  }

  /** Allocate worked cells within 3 hops for a Wilderness Faction HQ or Minor-Burg Faction Node. */
  private updateFactionNodeWorkedCells(
    faction: Faction,
    node: FactionHq | FactionOutpost,
    nodeSim: BurgSimState,
    isHq: boolean,
    living: LivingWorldState,
    globalWorkedCells: Set<number>
  ): YieldValues {
    const citizens = Math.max(1, Math.floor(nodeSim.citizens ?? (isHq ? 2 : 1)));
    nodeSim.citizens = citizens;

    const hostStateId = node.burgId ? (pack.burgs[node.burgId]?.state ?? 0) : (pack.cells.state?.[node.cell] ?? 0);
    const centerYields = node.burgId
      ? { food: 2, production: 1, gold: 1, science: 0, culture: 0, faith: 0, happiness: 0 }
      : getCellYields(node.cell, hostStateId, living);
    if (centerYields.food < 2) centerYields.food = 2;
    if (centerYields.production < 1) centerYields.production = 1;

    const distances = this.cellHopDistances(node.cell, MAX_WORK_DISTANCE);
    const candidates: { cell: number; hops: number; yields: YieldValues; weight: number }[] = [];
    for (const [cell, hops] of distances) {
      if (cell === node.cell || globalWorkedCells.has(cell)) continue;
      if (!this.isCityWorkable(cell)) continue;
      const yields = getCellYields(cell, hostStateId, living);
      candidates.push({ cell, hops, yields, weight: this.factionWorkWeight(yields, faction) });
    }

    const worked: number[] = [];
    const assigned = new Set<number>();
    let food = centerYields.food;
    const consumption = FOOD_PER_CITIZEN * citizens;
    const foodFloorReached = () => food - consumption >= DEFAULT_FOCUS_GROWTH_TARGET;

    for (const cell of nodeSim.lockedCells ?? []) {
      if (worked.length >= citizens) break;
      if (assigned.has(cell) || !candidates.some(c => c.cell === cell)) continue;
      worked.push(cell);
      assigned.add(cell);
      food += getCellYields(cell, hostStateId, living).food;
    }

    const byFood = [...candidates].sort((a, b) => b.yields.food - a.yields.food || a.hops - b.hops || a.cell - b.cell);
    for (const candidate of byFood) {
      if (worked.length >= citizens || foodFloorReached()) break;
      if (assigned.has(candidate.cell) || candidate.yields.food <= 0) continue;
      worked.push(candidate.cell);
      assigned.add(candidate.cell);
      food += candidate.yields.food;
    }

    const byWeight = [...candidates].sort((a, b) => b.weight - a.weight || a.hops - b.hops || a.cell - b.cell);
    for (const candidate of byWeight) {
      if (worked.length >= citizens) break;
      if (assigned.has(candidate.cell)) continue;
      if (candidate.weight <= 0) break;
      worked.push(candidate.cell);
      assigned.add(candidate.cell);
    }

    const total = { ...centerYields };
    for (const cell of worked) {
      globalWorkedCells.add(cell);
      const yields = getCellYields(cell, hostStateId, living);
      for (const key of CIV_YIELD_KEYS) total[key] += yields[key];
    }
    for (const id of nodeSim.civBuildings ?? []) {
      const def = CIV_BUILDING_BY_ID[id];
      if (!def) continue;
      for (const key of CIV_YIELD_KEYS) total[key] += def.stats[key] ?? 0;
    }

    nodeSim.workedCells = worked;
    nodeSim.isMajor = true;
    return total;
  }

  /** Food consumption, growth bucket, and Settler/Envoy food-to-production conversion for a Faction Node. */
  private applyFactionFoodGrowth(
    faction: Faction,
    node: FactionHq | FactionOutpost,
    nodeSim: BurgSimState,
    _isHq: boolean,
    cityYields: YieldValues
  ): number {
    const citizens = Math.max(1, nodeSim.citizens ?? 1);
    const surplus = cityYields.food - FOOD_PER_CITIZEN * citizens;

    const top = nodeSim.productionQueue?.[0];
    if (top?.kind === "unit" && top.id === SETTLER_UNIT_ID) {
      return surplus > 0 ? surplus * SETTLER_FOOD_TO_PRODUCTION_FACTOR : 0;
    }

    if (surplus > 0) {
      let multiplier = happinessGrowthFactor(faction.happiness ?? 0);
      if (multiplier > 0 && (nodeSim.civBuildings ?? []).includes("temple_of_artemis")) {
        multiplier *= 1.1;
      }
      nodeSim.foodStored = (nodeSim.foodStored ?? 0) + surplus * multiplier;
    } else if (surplus < 0) {
      nodeSim.foodStored = (nodeSim.foodStored ?? 0) + surplus;
    }

    const needed = foodNeededForGrowth(citizens);
    const stored = nodeSim.foodStored ?? 0;
    if (stored >= needed) {
      const carryover = this.cityFoodCarryover(nodeSim);
      nodeSim.foodStored = stored - needed + needed * carryover;
      nodeSim.citizens = minmax(citizens + 1, 1, MAX_CITIZENS);
      if ("tier" in node) {
        node.tier = Math.min(3, Math.max(1, Math.floor(nodeSim.citizens / 2))) as 1 | 2 | 3;
      }
    } else if (stored < 0) {
      nodeSim.foodStored = 0;
      nodeSim.citizens = Math.max(1, citizens - 1);
      if ("tier" in node) {
        node.tier = Math.min(3, Math.max(1, Math.floor(nodeSim.citizens / 2))) as 1 | 2 | 3;
      }
    }
    return 0;
  }

  /** Culture bucket growth for a Faction Node: boosts local Influence in Burgs or claims territory for Wilderness HQs. */
  private applyFactionBorderGrowth(
    faction: Faction,
    node: FactionHq | FactionOutpost,
    nodeSim: BurgSimState,
    _isHq: boolean,
    living: LivingWorldState,
    cityYields: YieldValues
  ): boolean {
    const tiles = nodeSim.tilesAcquired ?? 0;
    const held = new Set(nodeSim.civBuildings ?? []);
    const costFactor = held.has("angkor_wat") ? 0.75 : 1;
    const needed = borderCultureNeeded(tiles, costFactor, 1);

    nodeSim.cultureStored = (nodeSim.cultureStored ?? 0) + Math.max(0, cityYields.culture);
    if (nodeSim.cultureStored < needed) return false;

    nodeSim.cultureStored -= needed;
    nodeSim.tilesAcquired = tiles + 1;

    if (node.burgId) {
      if ("tier" in node) {
        node.influence = Math.min(100, (node.influence ?? 30) + 10);
      } else {
        node.influence = Math.min(100, (node.influence ?? 70) + 10);
      }
      // Reduce rival faction outpost influence in the same Burg
      for (const rival of Factions.active()) {
        if (rival.i === faction.i) continue;
        for (const rOutpost of rival.outposts ?? []) {
          if (rOutpost.pillaged) continue;
          if (rOutpost.burgId === node.burgId) {
            rOutpost.influence = Math.max(5, (rOutpost.influence ?? 20) - 5);
          }
        }
      }
      // Clandestine/hostile cultural growth erodes host province order
      if (faction.allegiance === "clandestine" || faction.allegiance === "hostile") {
        const burg = pack.burgs[node.burgId];
        const provinceId = burg ? Number(pack.cells.province?.[burg.cell] ?? 0) : 0;
        const pSim = provinceId ? living.provinces?.[provinceId] : undefined;
        if (pSim) pSim.order = Math.max(0, pSim.order - 2);
      }
      return false;
    }

    return false;
  }

  /** Check whether a Faction Node can construct a given OpenCiv or Faction-track building. */
  private factionNodeCanBuild(
    faction: Faction,
    node: FactionHq | FactionOutpost,
    def: CivBuildingDef,
    techs: Set<string>,
    held: Set<string>
  ): boolean {
    if (def.uniqueTo) return false;
    if (held.has(def.id)) return false;
    if (def.isWonder || def.nationalWonder) return false;
    if (def.factionCategory) {
      const catMatch =
        def.factionCategory === faction.category ||
        (def.factionCategory === "scholarly" &&
          ["academic", "religious", "secret", "adventuring"].includes(faction.category)) ||
        (def.factionCategory === "wilder" && (!node.burgId || ["martial", "adventuring"].includes(faction.category)));
      if (!catMatch) return false;
      if (def.factionLocation === "burg" && !node.burgId) return false;
      if (def.factionLocation === "wilderness" && node.burgId) return false;
    }
    if (def.requiredTech && !techs.has(def.requiredTech)) return false;
    if (def.requiresBuilding && !held.has(def.requiresBuilding)) return false;
    if (def.requiresRiver && !hasFreshWater(node.cell)) return false;
    if (def.requiresMountain) {
      const nearMountain = (pack.cells.c?.[node.cell] ?? []).some(cell => getCellTerrainInfo(cell).isMountain);
      if (!nearMountain) return false;
    }
    if (def.coastal) {
      const coastal = (pack.cells.c?.[node.cell] ?? []).some(cell => Number(pack.cells.h?.[cell] ?? 0) < SEA_LEVEL);
      if (!coastal) return false;
    }
    return true;
  }

  /** Autonomous governor for a Faction HQ or Outpost production queue. */
  private chooseFactionNodeProduction(
    faction: Faction,
    node: FactionHq | FactionOutpost,
    nodeSim: BurgSimState,
    _isHq: boolean,
    living: LivingWorldState
  ): ProductionItem | null {
    const techs = new Set(faction.researchedTechs ?? []);
    const held = new Set(nodeSim.civBuildings ?? []);
    const canBuild = (def: CivBuildingDef | undefined): def is CivBuildingDef =>
      def !== undefined && this.factionNodeCanBuild(faction, node, def, techs, held);

    // 1. Defense: hostile factions or restive nodes prioritize walls
    if ((faction.allegiance === "hostile" || (nodeSim.unrest ?? 0) > 0) && !held.has("walls")) {
      if (canBuild(CIV_BUILDING_BY_ID.walls)) return { kind: "building", id: "walls" };
    }

    // 2. Faction specialized category buildings (Tier 1 -> Tier 2 -> Tier 3)
    const factionBuildings = CIV_BUILDINGS.filter(def => Boolean(def.factionCategory) && canBuild(def)).sort(
      (a, b) => (a.factionTier ?? 1) - (b.factionTier ?? 1) || (a.cost ?? 0) - (b.cost ?? 0) || a.id.localeCompare(b.id)
    );
    if (factionBuildings.length > 0) {
      return { kind: "building", id: factionBuildings[0]!.id };
    }

    // 3. Economic and science core buildings
    for (const id of CITY_ECONOMY_BUILDINGS) {
      const def = CIV_BUILDING_BY_ID[id];
      if (canBuild(def)) return { kind: "building", id };
    }

    // 4. Utility units: Builder for unimproved worked cells, Settler/Envoy for new Outpost expansion
    const unitAvailable = (id: string): boolean => {
      const def = CIV_CIVILIAN_BY_ID[id];
      if (!def) return false;
      return !def.requiredTech || techs.has(def.requiredTech);
    };
    if (
      this.factionUnitCount(faction, "builder", living) === 0 &&
      this.countFactionUnimprovedCells(faction, living) >= 1
    ) {
      if (unitAvailable("builder")) return { kind: "unit", id: "builder" };
    }
    if (
      (faction.happiness ?? 0) >= 0 &&
      (nodeSim.citizens ?? 1) >= 2 &&
      this.factionUnitCount(faction, "settler", living) === 0 &&
      this.hasFactionOutpostTarget(faction) &&
      unitAvailable("settler")
    ) {
      return { kind: "unit", id: "settler" };
    }

    // 5. Roster combat units (ArmyBlock)
    const desiredRegiments =
      1 +
      Math.floor((faction.outposts?.length ?? 0) / 2) +
      (faction.allegiance === "hostile" || faction.category === "martial" || faction.sovereignAmbition ? 1 : 0);
    const combatRegiments = (faction.military ?? []).filter(r => !isCivilianUnit((r.type ?? "").toLowerCase()));
    if (combatRegiments.length < desiredRegiments) {
      const roster = Military.getRoster(faction);
      if (roster) {
        const melee = pickRosterUnit(roster, "melee", [...techs]);
        if (melee) return { kind: "unit", id: melee.id };
      }
    }

    return null;
  }

  /** Production cost of a queued item for a Faction. */
  private factionProductionCost(faction: Faction, item: ProductionItem): number {
    const cost =
      item.kind === "unit"
        ? isCivilianUnit(item.id)
          ? CIV_CIVILIAN_BY_ID[item.id]?.cost
          : Military.getRoster(faction)?.units[item.id]?.cost
        : CIV_BUILDING_BY_ID[item.id]?.cost;
    return Math.max(1, Math.floor(cost ?? 1));
  }

  /** Advance a Faction Node's production queue by this tick's Production. */
  private applyFactionProduction(
    faction: Faction,
    node: FactionHq | FactionOutpost,
    nodeSim: BurgSimState,
    isHq: boolean,
    living: LivingWorldState,
    cityYields: YieldValues,
    bonusProduction: number
  ): void {
    nodeSim.productionQueue ??= [];
    nodeSim.productionProgress ??= {};

    let production = Math.max(0, cityYields.production) + Math.max(0, bonusProduction);
    let guard = 0;
    while (production > 0 && guard++ < 8) {
      if (nodeSim.productionQueue.length === 0) {
        const next = this.chooseFactionNodeProduction(faction, node, nodeSim, isHq, living);
        if (!next) return;
        nodeSim.productionQueue.push(next);
      }

      const item = nodeSim.productionQueue[0]!;
      const key = `${item.kind}:${item.id}`;
      const cost = this.factionProductionCost(faction, item);
      const total = (nodeSim.productionProgress[key] ?? 0) + production;
      if (total < cost) {
        nodeSim.productionProgress[key] = total;
        return;
      }

      production = total - cost;
      delete nodeSim.productionProgress[key];
      nodeSim.productionQueue.shift();
      this.completeFactionProductionItem(faction, node, nodeSim, isHq, item, living);
    }
  }

  /** Complete a queued building or unit at a Faction HQ or Outpost. */
  private completeFactionProductionItem(
    faction: Faction,
    node: FactionHq | FactionOutpost,
    nodeSim: BurgSimState,
    isHq: boolean,
    item: ProductionItem,
    living: LivingWorldState
  ): void {
    nodeSim.civBuildings ??= [];
    node.assets ??= [];

    if (item.kind === "building" || item.kind === "wonder") {
      if (!nodeSim.civBuildings.includes(item.id)) nodeSim.civBuildings.push(item.id);
      if (!node.assets.includes(item.id)) node.assets.push(item.id);

      const def = CIV_BUILDING_BY_ID[item.id];
      if (def?.cityHealth) {
        nodeSim.maxHp = (nodeSim.maxHp ?? (isHq ? 200 : 100)) + def.cityHealth;
        nodeSim.hp = Math.min(nodeSim.maxHp, (nodeSim.hp ?? 100) + def.cityHealth);
      }
      if (isHq && (item.id === "walls" || item.id === "war_citadel")) {
        (node as FactionHq).fortified = true;
      }
      const freeTechs = def?.effects?.freeTechs ?? 0;
      if (freeTechs > 0) faction.freeTechs = (faction.freeTechs ?? 0) + freeTechs;

      const name = def?.name ?? item.id;
      const locName = node.burgId ? (pack.burgs[node.burgId]?.name ?? faction.name) : faction.name;
      this.pushNews(living, {
        kind: "build",
        text: `${faction.name} completed the ${name} at ${locName}.`,
        cell: node.cell,
        ...(node.burgId ? { burgId: node.burgId } : {})
      });
      return;
    }

    if (this.hasCityTerrain()) {
      this.spawnFactionUnit(faction, node, nodeSim, item.id, living);
    }
  }

  /** Tactical unit key for a Faction regiment in `living.units` and `living.armies`. */
  factionUnitKey(factionId: number, regimentId: number): string {
    return `f${factionId}-${regimentId}`;
  }

  /** Spawn a civilian utility unit (`builder` / `settler`) or combat `ArmyBlock` for a Faction. */
  private spawnFactionUnit(
    faction: Faction,
    node: FactionHq | FactionOutpost,
    nodeSim: BurgSimState,
    unitTypeId: string,
    living: LivingWorldState
  ): Regiment | null {
    faction.military ??= [];
    const def = this.civilianDefinition(unitTypeId);
    const pt = pack.cells.p?.[node.cell] ?? [0, 0];
    const nextRegId = faction.military.reduce((max, r) => Math.max(max, r.i ?? 0), 0) + 1;

    if (def?.isUtility || isCivilianUnit(unitTypeId)) {
      if (!def) return null;
      const regiment: Regiment = {
        i: nextRegId,
        a: UNIT_MAX_HP,
        cell: node.cell,
        x: pt[0],
        y: pt[1],
        bx: pt[0],
        by: pt[1],
        u: { [def.id]: UNIT_MAX_HP },
        units: [],
        n: (def.domain ?? "land") === "sea" ? 1 : 0,
        name: `${faction.name} ${def.name}`,
        state: 0,
        icon: def.id === "settler" ? "⛺" : "🔨",
        type: def.id,
        rosterId: faction.rosterId
      };
      faction.military.push(regiment);

      const unit = this.createUtilitySim(regiment, def);
      living.units ??= {};
      living.units[this.factionUnitKey(faction.i, regiment.i)] = unit;
      return regiment;
    }

    const unitTypes = Military.getUnitTypes();
    const roster = Military.getRoster(faction);
    const typeId = unitTypes[unitTypeId]
      ? unitTypeId
      : roster
        ? matchRosterUnitByCategory(roster, def?.unitClass ?? "melee")?.id
        : undefined;
    if (!typeId || !unitTypes[typeId]) return null;

    const maxSlots = currentContent().config.military.maxUnitsPerArmy;
    const trainingCount = (nodeSim.civBuildings ?? []).filter(id =>
      ["barracks", "armory", "military_academy", "muster_camp", "armory_forge", "war_citadel"].includes(id)
    ).length;
    const exp = Math.min(9, trainingCount);

    let regiment = faction.military.find(
      r => r.cell === node.cell && !isCivilianUnit((r.type ?? "").toLowerCase()) && (r.units?.length ?? 0) < maxSlots
    );
    if (!regiment) {
      regiment = {
        i: nextRegId,
        a: 0,
        cell: node.cell,
        x: pt[0],
        y: pt[1],
        bx: pt[0],
        by: pt[1],
        u: {},
        units: [],
        n: 0,
        name: `${faction.name} Guard`,
        state: 0,
        icon: "⚔️",
        rosterId: faction.rosterId
      };
      faction.military.push(regiment);
    }

    regiment.units ??= [];
    regiment.units.push({ type: typeId, hp: 1, exp });
    normalizeArmy(regiment, maxSlots, unitTypes);
    syncRegimentTotals(regiment, unitTypes);

    const speed = armySpeed(regiment, unitTypes);
    const key = this.factionUnitKey(faction.i, regiment.i);
    living.armies ??= {};
    living.armies[key] ??= { movement: speed, maxMovement: speed, stance: "fortify", hasFought: false };
    return regiment;
  }

  /** Count active utility units of `unitTypeId` held by a Faction. */
  private factionUnitCount(faction: Faction, unitTypeId: string, living: LivingWorldState): number {
    let count = 0;
    for (const reg of faction.military ?? []) {
      if ((reg.type ?? "").toLowerCase() === unitTypeId) {
        count += 1;
        continue;
      }
      const unit = living.units?.[this.factionUnitKey(faction.i, reg.i)];
      if (unit && unit.unitTypeId === unitTypeId && unit.hp > 0) count += 1;
    }
    return count;
  }

  /** Count unimproved workable cells currently worked by any of a Faction's nodes. */
  private countFactionUnimprovedCells(faction: Faction, living: LivingWorldState): number {
    let count = 0;
    const nodes = [faction.hq, ...(faction.outposts ?? [])].filter(node => node && !node.pillaged);
    for (const node of nodes) {
      if (!node?.sim?.workedCells) continue;
      for (const cell of node.sim.workedCells) {
        if (!getCellTerrainInfo(cell).isWorkable) continue;
        if (living.cells?.[cell]?.improvement) continue;
        count += 1;
      }
    }
    return count;
  }

  /** Check whether there is any valid Burg on the map where this Faction does not yet have an HQ or Outpost. */
  private hasFactionOutpostTarget(faction: Faction): boolean {
    const existing = new Set<number>();
    if (faction.hq && !faction.hq.pillaged && faction.hq.burgId) existing.add(faction.hq.burgId);
    for (const o of faction.outposts ?? []) if (!o.pillaged) existing.add(o.burgId);
    return (pack.burgs ?? []).some(b => b?.i && !b.removed && !existing.has(b.i));
  }

  // -------------------------------------------------------------------------
  // Slice 4: OpenCiv empire rollup — Science, Gold, Happiness & Unravel.
  // -------------------------------------------------------------------------

  /** Detailed breakdown of yields for a state and each of its major cities. */
  getStateYieldBreakdown(state: State, livingState?: LivingWorldState): StateYieldBreakdown {
    const living = livingState ?? this.getState();
    const cities: StateCityYieldBreakdown[] = [];
    const totals = emptyYields();
    let totalGrossGold = 0;
    let totalMaintenance = 0;
    let totalScience = 0;
    let totalCitizens = 0;
    let totalWorkedCells = 0;
    let capitalBreakdown: StateCityYieldBreakdown | null = null;

    for (const burg of this.majorBurgsOfState(state.i, living)) {
      const bSim = living.burgs[burg.i];
      if (!bSim) continue;

      let cityYields = bSim.cityYields;
      if (
        !cityYields ||
        (cityYields.food === 0 &&
          cityYields.production === 0 &&
          cityYields.gold === 0 &&
          cityYields.science === 0 &&
          cityYields.culture === 0 &&
          cityYields.faith === 0)
      ) {
        cityYields = this.refreshStateBurgYields(state, burg);
      }

      let maintenance = 0;
      for (const id of bSim.civBuildings ?? []) {
        maintenance += CIV_BUILDING_BY_ID[id]?.maintenance ?? 0;
      }

      const grossGold = cityYields.gold;
      const cityScience = this.citySciencePerTick(bSim) + this.scholarScienceBonus(burg.i);
      const netGold = Math.round((grossGold - maintenance) * 100) / 100;
      const roundedScience = Math.round(cityScience * 100) / 100;
      const citizens = bSim.citizens ?? citizensFromPopulation(burg.population ?? 0);
      const workedCells = bSim.workedCells?.length ?? 1;
      const isCapital = state.capital === burg.i;

      const nodeYields: YieldValues = {
        food: cityYields.food,
        production: cityYields.production,
        gold: netGold,
        science: roundedScience,
        culture: cityYields.culture,
        faith: cityYields.faith,
        happiness: 0
      };

      const breakdown: StateCityYieldBreakdown = {
        burgId: burg.i,
        name: burg.name || `Burg ${burg.i}`,
        isCapital,
        yields: nodeYields,
        grossGold,
        maintenance,
        science: roundedScience,
        citizens,
        workedCells,
        buildings: [...(bSim.civBuildings ?? [])]
      };

      cities.push(breakdown);
      if (isCapital) capitalBreakdown = breakdown;

      totals.food += cityYields.food;
      totals.production += cityYields.production;
      totals.culture += cityYields.culture;
      totals.faith += cityYields.faith;
      totalGrossGold += grossGold;
      totalMaintenance += maintenance;
      totalScience += cityScience;
      totalCitizens += citizens;
      totalWorkedCells += workedCells;
    }

    // Belief yields (pantheon, founder, follower, enhancer).
    for (const id of this.stateBeliefs(state, living)) {
      const def = CIV_BELIEF_BY_ID[id];
      if (!def?.yields) continue;
      for (const key of CIV_YIELD_KEYS) {
        if (key === "happiness") continue;
        totals[key] += def.yields[key] ?? 0;
      }
    }

    // §3.3: a court fully served with luxury goods feeds culture and faith
    const court = StateOrders.getProvision(state, "court");
    if (court > 0) {
      totals.culture += COURT_PROVISION_YIELD * court;
      totals.faith += COURT_PROVISION_YIELD * court;
    }

    const unitTypes = Military.getUnitTypes();
    let blockUpkeep = 0;
    let civilianUpkeep = 0;
    for (const regiment of state.military ?? []) {
      if (isCivilianUnit((regiment.type ?? "").toLowerCase())) {
        civilianUpkeep += CIVILIAN_UPKEEP;
        continue;
      }
      for (const block of regiment.units ?? []) {
        if (block.hp > 0) blockUpkeep += (unitTypes[block.type]?.upkeep ?? 0) * block.hp;
      }
    }
    const upkeep = Math.max(0, blockUpkeep + civilianUpkeep - UPKEEP_FREE);

    totals.science = Math.round(totalScience * 100) / 100;
    totals.gold = Math.round((totalGrossGold - totalMaintenance - upkeep) * 100) / 100;
    totals.happiness = 0;

    return {
      total: totals,
      totalCitizens,
      totalWorkedCells,
      upkeep,
      maintenance: totalMaintenance,
      cities,
      capital: capitalBreakdown
    };
  }

  /** Recalculate worked cells and cityYields for a single state major burg. */
  refreshStateBurgYields(state: State, burg: Burg): YieldValues {
    const living = this.getState();
    const bSim = living.burgs[burg.i];
    if (!bSim) return emptyYields();
    if (!pack?.cells?.c || !pack?.cells?.state) {
      bSim.cityYields ??= emptyYields();
      return bSim.cityYields;
    }
    const yields = this.updateWorkedCells(burg, bSim, state, living);
    bSim.cityYields = yields;
    return yields;
  }

  /** Empire-wide yields for every state: city totals, science multipliers, upkeep and maintenance. */
  recomputeStateYields(state: State, living?: LivingWorldState): YieldValues {
    return this.getStateYieldBreakdown(state, living).total;
  }

  /** §6.1 Science per city: flat yields plus the Library / School / University / Observatory multipliers. */
  private citySciencePerTick(bSim: BurgSimState): number {
    const held = new Set(bSim.civBuildings ?? []);
    const citizens = bSim.citizens ?? 1;
    let science = bSim.cityYields?.science ?? 0;

    if (held.has("library")) science += citizens * 0.5;
    if (held.has("public_school")) science += citizens * 0.5 + 3;
    if (held.has("university")) {
      science *= 1.33;
      const jungle = (bSim.workedCells ?? []).filter(cell => Number(pack.cells.biome?.[cell] ?? 0) === 7).length;
      science += 2 * jungle;
    }
    if (held.has("observatory")) science *= 1.5;
    if (held.has("national_college")) science = science * 1.5 + 3;

    return Math.round(science * 100) / 100;
  }

  /** §3.3: consuming scholarly goods adds a capped science bonus to the city. */
  private scholarScienceBonus(burgId: number): number {
    if (!this.canReadUpstreamEconomy()) return 0;
    const consumed = UpstreamProsperity.getConsumption(burgId);
    const units = SCHOLARLY_GOODS.reduce((total, name) => {
      const good = options.map.goods.find(entry => entry.name === name);
      return total + (good ? (consumed[good.i] ?? 0) : 0);
    }, 0);
    return Math.min(SCHOLAR_SCIENCE_CAP, Math.round(units * 2) / 2);
  }

  /** §7.2 Empire Happiness: base + luxuries + buildings/religion − cities − citizens − unrest. */
  private recomputeEmpireHappiness(state: State, sSim: StatePolitySim, living: LivingWorldState): void {
    const breakdown: HappinessBreakdown = {
      base: BASE_EMPIRE_HAPPINESS,
      luxuries: 0,
      buildings: 0,
      religion: 0,
      cityUnhappiness: 0,
      citizenUnhappiness: 0,
      unrestUnhappiness: 0
    };
    breakdown.luxuries = LUXURY_HAPPINESS * this.uniqueLuxuries(state, living).size;

    let localHappiness = 0;
    for (const burg of this.majorBurgsOfState(state.i, living)) {
      const bSim = living.burgs[burg.i];
      if (!bSim) continue;
      const citizens = bSim.citizens ?? 1;

      let local = 0;
      for (const id of bSim.civBuildings ?? []) {
        const def = CIV_BUILDING_BY_ID[id];
        const happiness = def?.stats.happiness ?? 0;
        if (happiness === 0) continue;
        if (def?.isWonder) breakdown.buildings += happiness;
        else local += happiness;
      }

      // Local city happiness is capped by the city's citizens, exactly as in OpenCiv.
      localHappiness += Math.min(local, citizens);
      breakdown.cityUnhappiness += 3;
      breakdown.citizenUnhappiness += citizens;
      if (bSim.conqueredBy !== undefined) breakdown.unrestUnhappiness += Math.ceil((bSim.unrest ?? 0) / 2);
    }
    breakdown.buildings += localHappiness;
    breakdown.religion = this.beliefHappiness(state, living);

    // §3.3: upstream Prosperity of the people sways the court; 0.5 is neutral
    const prosperity = this.upstreamAccounts(state.i)?.prosperity;
    if (prosperity != null) breakdown.prosperity = Math.round((prosperity - 0.5) * 10);

    sSim.happinessBreakdown = breakdown;
    sSim.happiness =
      breakdown.base +
      breakdown.luxuries +
      breakdown.buildings +
      breakdown.religion +
      (breakdown.prosperity ?? 0) -
      breakdown.cityUnhappiness -
      breakdown.citizenUnhappiness -
      breakdown.unrestUnhappiness;
  }

  /** Unique improved Luxury goods inside a state's borders, one +4 Happiness each. */
  private uniqueLuxuries(state: State, living: LivingWorldState): Set<string> {
    const luxuries = new Set<string>();
    const cells = pack.cells.state?.length ?? 0;
    for (let cell = 0; cell < cells; cell++) {
      if (pack.cells.state?.[cell] !== state.i) continue;
      const resource = getCellResource(cell, state.i, living);
      if (resource?.class !== "luxury") continue;

      const cellSim = living.cells?.[cell];
      const improved = Boolean(cellSim?.improvement && !cellSim.pillaged);
      const burgId = Number(pack.cells.burg?.[cell] ?? 0);
      const burg = burgId ? pack.burgs?.[burgId] : undefined;
      const village = Boolean(burg?.i && !burg.removed && !isBurgPillaged(burg, living));
      if (!improved && !village) continue;

      luxuries.add(resource.resourceId ?? resource.goodName);
    }
    return luxuries;
  }

  /** Happiness from pantheon / founder / follower beliefs (Slice 6 fills religion records). */
  private beliefHappiness(state: State, living: LivingWorldState): number {
    let happiness = 0;
    for (const id of this.stateBeliefs(state, living)) {
      happiness += CIV_BELIEF_BY_ID[id]?.yields?.happiness ?? 0;
    }
    return happiness;
  }

  /** §6.1 Research: bank Science into the current tech, then pick the next project. */
  private applyResearch(state: State, sSim: StatePolitySim, living: LivingWorldState): void {
    const theme = activeCivThemeId();
    sSim.researchedTechs ??= [];
    sSim.researchedProgress ??= {};
    sSim.researchQueue ??= [];
    const researched = new Set(sSim.researchedTechs);

    let freeTechs = sSim.freeTechs ?? 0;
    while (freeTechs > 0) {
      const free = this.nextTech(researched, theme);
      if (!free) break;
      this.completeTech(state, sSim, free, living, true);
      researched.add(free.id);
      freeTechs -= 1;
    }
    sSim.freeTechs = freeTechs;

    let current: CivTechDef | undefined = sSim.currentTechId ? CIV_TECH_BY_ID[sSim.currentTechId] : undefined;
    if (!current || !isTechSelectable(current, researched, theme)) {
      const queued = sSim.researchQueue
        .map(id => CIV_TECH_BY_ID[id])
        .find(tech => tech !== undefined && isTechSelectable(tech, researched, theme));
      current = queued ?? this.nextTech(researched, theme) ?? undefined;
      sSim.currentTechId = current?.id ?? null;
    }
    if (!current) return;

    const science = Math.max(0, sSim.yieldsPerTurn?.science ?? 0);
    const cost = Math.max(1, current.cost);
    const banked = (sSim.researchedProgress[current.id] ?? 0) + science;
    if (banked < cost) {
      sSim.researchedProgress[current.id] = Math.round(banked * 100) / 100;
      return;
    }
    this.completeTech(state, sSim, current, living, false);

    // Keep the research queue moving: pick the next project immediately.
    const advanced = new Set(sSim.researchedTechs ?? []);
    const queued = sSim.researchQueue
      .map(id => CIV_TECH_BY_ID[id])
      .find(tech => tech !== undefined && isTechSelectable(tech, advanced, theme));
    sSim.currentTechId = (queued ?? this.nextTech(advanced, theme))?.id ?? null;
  }

  /** Cheapest selectable technology, deterministic on ties. */
  private nextTech(researched: ReadonlySet<string>, theme: CivThemeId): CivTechDef | null {
    const available = CIV_TECHS.filter(tech => isTechSelectable(tech, researched, theme)).sort(
      (a, b) => a.cost - b.cost || a.row - b.row || a.slot - b.slot || a.id.localeCompare(b.id)
    );
    return available[0] ?? null;
  }

  private completeTech(
    state: State,
    sSim: StatePolitySim,
    tech: CivTechDef,
    living: LivingWorldState,
    free: boolean
  ): void {
    sSim.researchedTechs ??= [];
    if (!sSim.researchedTechs.includes(tech.id)) sSim.researchedTechs.push(tech.id);
    if (sSim.researchedProgress) delete sSim.researchedProgress[tech.id];
    if (sSim.researchQueue) sSim.researchQueue = sSim.researchQueue.filter(id => id !== tech.id);
    sSim.currentTechId = null;

    const name = resolveCivTechName(activeCivThemeId(), tech);
    this.pushNews(living, {
      kind: "tech",
      text: `${state.name} discovered ${name}${free ? " through foreign scholars" : ""}.`,
      cell: state.center,
      stateId: state.i
    });

    this.raiseTechDevelopment(living, sSim.researchedTechs ?? [], this.settlementCells(state.i));
  }

  /** §7.1 Bank net Gold into the treasury; a negative balance disbands a regiment. */
  private applyTreasury(state: State, sSim: StatePolitySim, living: LivingWorldState): void {
    const goldPerTurn = sSim.yieldsPerTurn?.gold ?? 0;
    state.economy.treasury = Math.round((Number(state.economy.treasury ?? 0) + goldPerTurn) * 100) / 100;
    if (state.economy.treasury < 0) this.settleDebt(state, living);
  }

  /** §7.1 Bankruptcy: reset the treasury and disband the newest block, not the whole regiment. */
  private settleDebt(state: State, living: LivingWorldState): void {
    state.economy.treasury = 0;
    const military = state.military ?? [];
    const newest = military[military.length - 1];
    if (!newest) return;

    const blocks = newest.units ?? [];
    const last = blocks[blocks.length - 1];

    // §4.4: an underfunded state cannot keep its elite blocks paid; they take service as levies
    if (last && Military.getUpkeep(state.i) < 0.5) {
      const roster = Military.getRoster(state);
      const unitTypes = Military.getUnitTypes();
      const levy = roster ? levyUnitFor(roster) : undefined;
      const unit = last.type ? unitTypes[last.type] : undefined;
      if (levy && unit && getUnitRequiredGoods(unit, roster!).length > 0) {
        last.type = levy.id;
        last.exp = Math.floor((last.exp ?? 0) / 2);
        syncRegimentTotals(newest, unitTypes);
        this.pushNews(living, {
          kind: "muster",
          text: `Unpaid, ${state.name}'s ${unit.name} took service as ${levy.name}.`,
          cell: newest.cell,
          stateId: state.i
        });
        return;
      }
    }

    if (blocks.length > 0) {
      blocks.pop();
      newest.units = blocks;
      syncRegimentTotals(newest, Military.getUnitTypes());
    }
    if (blocks.length === 0) {
      military.pop();
      const key = this.unitKey(state.i, newest.i);
      if (living.units) delete living.units[key];
      if (living.armies) delete living.armies[key];
    }

    this.pushNews(living, {
      kind: "muster",
      text: `${state.name} could not pay its army; its newest block was disbanded.`,
      cell: newest.cell,
      stateId: state.i
    });
  }

  /** §7.2 Content empires pacify, unhappy ones breed unravel, very unhappy ones spiral. */
  private applyHappinessPressure(sSim: StatePolitySim): void {
    const happiness = sSim.happiness ?? 0;
    let delta: number;
    if (happiness <= VERY_UNHAPPY_HAPPINESS) delta = 6;
    else if (happiness < 0) delta = 2;
    else delta = -(2 + Math.floor(happiness / 5));
    sSim.unravel = minmax(sSim.unravel + delta, 0, 100);
  }

  /** Active HQ/outpost nodes of a faction, skipping pillaged nodes. */
  private factionEmpireNodes(faction: Faction): { node: FactionHq | FactionOutpost; isHq: boolean }[] {
    const nodes: { node: FactionHq | FactionOutpost; isHq: boolean }[] = [];
    if (faction.hq && !faction.hq.pillaged) nodes.push({ node: faction.hq, isHq: true });
    for (const outpost of faction.outposts ?? []) {
      if (outpost.pillaged) continue;
      nodes.push({ node: outpost, isHq: false });
    }
    return nodes;
  }

  /** Detailed breakdown of yields for a faction and each of its nodes. */
  getFactionYieldBreakdown(faction: Faction): FactionYieldBreakdown {
    const nodes: FactionNodeYieldBreakdown[] = [];
    const totals = emptyYields();
    let totalGrossGold = 0;
    let totalMaintenance = 0;
    let totalScience = 0;
    let totalCitizens = 0;
    let totalWorkedCells = 0;
    let totalUpstreamGold = 0;
    let totalCharterTithe = 0;
    let charterPatronId = 0;
    let totalInfluence = 0;
    let hqBreakdown: FactionNodeYieldBreakdown | null = null;
    const outpostsBreakdown: FactionNodeYieldBreakdown[] = [];

    for (const { node, isHq } of this.factionEmpireNodes(faction)) {
      const sim = ensureFactionNodeSim(node, isHq);
      let cityYields = sim.cityYields;
      if (
        !cityYields ||
        (cityYields.food === 0 &&
          cityYields.production === 0 &&
          cityYields.gold === 0 &&
          cityYields.science === 0 &&
          cityYields.culture === 0 &&
          cityYields.faith === 0)
      ) {
        cityYields = this.refreshFactionNodeYields(faction, node, isHq);
      }

      let maintenance = 0;
      for (const id of sim.civBuildings ?? []) {
        maintenance += CIV_BUILDING_BY_ID[id]?.maintenance ?? 0;
      }

      // §5.1: the node also earns off the host burg's upstream product, trade and graft
      const upstream = factionUpstreamIncome(faction, node);
      const grossGold = cityYields.gold + upstream.gold;
      const nodeScience = this.citySciencePerTick(sim);
      const netGold = Math.round((grossGold - maintenance) * 100) / 100;
      const roundedScience = Math.round(nodeScience * 100) / 100;
      const citizens = sim.citizens ?? (isHq ? 2 : 1);
      const workedCells = sim.workedCells?.length ?? (node.cell >= 0 ? 1 : 0);

      const nodeYields: YieldValues = {
        food: cityYields.food,
        production: cityYields.production,
        gold: netGold,
        science: roundedScience,
        culture: cityYields.culture,
        faith: cityYields.faith,
        happiness: 0
      };

      const breakdown: FactionNodeYieldBreakdown = {
        node,
        isHq,
        yields: nodeYields,
        grossGold,
        maintenance,
        science: roundedScience,
        citizens,
        workedCells,
        upstreamGold: upstream.gold,
        charterTithe: upstream.charterTithe
      };

      nodes.push(breakdown);
      if (isHq) {
        hqBreakdown = breakdown;
      } else {
        outpostsBreakdown.push(breakdown);
      }

      totals.food += cityYields.food;
      totals.production += cityYields.production;
      totals.culture += cityYields.culture;
      totals.faith += cityYields.faith;
      totalGrossGold += grossGold;
      totalMaintenance += maintenance;
      totalScience += nodeScience;
      totalCitizens += citizens;
      totalWorkedCells += workedCells;
      totalUpstreamGold += upstream.gold;
      totalInfluence += upstream.influence;
      if (upstream.charterTithe > 0) {
        totalCharterTithe += upstream.charterTithe;
        charterPatronId = upstream.patronStateId;
      }
    }

    const unitTypes = Military.getUnitTypes();
    let blockUpkeep = 0;
    let civilianUpkeep = 0;
    for (const regiment of faction.military ?? []) {
      if (isCivilianUnit((regiment.type ?? "").toLowerCase())) {
        civilianUpkeep += CIVILIAN_UPKEEP;
        continue;
      }
      for (const block of regiment.units ?? []) {
        if (block.hp > 0) blockUpkeep += (unitTypes[block.type]?.upkeep ?? 0) * block.hp;
      }
    }
    const upkeep = Math.max(0, blockUpkeep + civilianUpkeep - UPKEEP_FREE);

    totals.science = Math.round(totalScience * 100) / 100;
    totals.gold = Math.round((totalGrossGold - totalMaintenance - upkeep) * 100) / 100;
    totals.happiness = 0;

    return {
      total: totals,
      totalCitizens,
      totalWorkedCells,
      upkeep,
      maintenance: totalMaintenance,
      nodes,
      hq: hqBreakdown,
      outposts: outpostsBreakdown,
      upstreamGold: Math.round(totalUpstreamGold * 100) / 100,
      charterTithe: Math.round(totalCharterTithe * 100) / 100,
      charterPatronId,
      influence: Math.round(totalInfluence * 100) / 100
    };
  }

  /** Recalculate worked cells and cityYields for a single faction node. */
  refreshFactionNodeYields(faction: Faction, node: FactionHq | FactionOutpost, isHq: boolean): YieldValues {
    const sim = ensureFactionNodeSim(node, isHq);
    if (!pack?.cells?.c || !pack?.cells?.state) {
      sim.cityYields ??= emptyYields();
      return sim.cityYields;
    }
    const living = this.getState();
    const globalWorkedCells = new Set<number>();
    const yields = this.updateFactionNodeWorkedCells(faction, node, sim, isHq, living, globalWorkedCells);
    sim.cityYields = yields;
    return yields;
  }

  /** Empire-wide yields for a faction: sum of city-node yields plus science multipliers minus upkeep. */
  recomputeFactionYields(faction: Faction): YieldValues {
    return this.getFactionYieldBreakdown(faction).total;
  }

  /** Unique luxury resources worked by any faction node, for Empire Happiness. */
  private factionUniqueLuxuries(faction: Faction, living: LivingWorldState): Set<string> {
    const luxuries = new Set<string>();
    for (const { node, isHq } of this.factionEmpireNodes(faction)) {
      const sim = ensureFactionNodeSim(node, isHq);
      const worked = [...(sim.workedCells ?? [])];
      if (!worked.includes(node.cell)) worked.push(node.cell);
      const hostStateId = node.burgId ? (pack.burgs[node.burgId]?.state ?? 0) : (pack.cells.state?.[node.cell] ?? 0);
      for (const cell of worked) {
        const resource = getCellResource(cell, hostStateId, living);
        if (resource?.class !== "luxury") continue;
        const cellSim = living.cells?.[cell];
        const improved = Boolean(cellSim?.improvement && !cellSim.pillaged);
        const burgId = Number(pack.cells.burg?.[cell] ?? 0);
        const burg = burgId ? pack.burgs?.[burgId] : undefined;
        const village = Boolean(burg?.i && !isBurgPillaged(burg, living));
        if (!improved && !village) continue;
        luxuries.add(resource.resourceId ?? resource.goodName);
      }
    }
    return luxuries;
  }

  /** Faction Empire Happiness: base + luxuries + buildings − nodes − citizens. */
  private recomputeFactionHappiness(faction: Faction, living: LivingWorldState): void {
    const breakdown: HappinessBreakdown = {
      base: BASE_EMPIRE_HAPPINESS,
      luxuries: 0,
      buildings: 0,
      religion: 0,
      cityUnhappiness: 0,
      citizenUnhappiness: 0,
      unrestUnhappiness: 0
    };
    breakdown.luxuries = LUXURY_HAPPINESS * this.factionUniqueLuxuries(faction, living).size;

    let localHappiness = 0;
    for (const { node, isHq } of this.factionEmpireNodes(faction)) {
      const sim = ensureFactionNodeSim(node, isHq);
      const citizens = sim.citizens ?? 1;
      let local = 0;
      for (const id of sim.civBuildings ?? []) {
        const def = CIV_BUILDING_BY_ID[id];
        const happiness = def?.stats.happiness ?? 0;
        if (happiness === 0) continue;
        if (def?.isWonder) breakdown.buildings += happiness;
        else local += happiness;
      }
      localHappiness += Math.min(local, citizens);
      breakdown.cityUnhappiness += 3;
      breakdown.citizenUnhappiness += citizens;
      breakdown.unrestUnhappiness += Math.ceil((sim.unrest ?? 0) / 2);
    }
    breakdown.buildings += localHappiness;

    faction.happinessBreakdown = breakdown;
    faction.happiness =
      breakdown.base +
      breakdown.luxuries +
      breakdown.buildings +
      breakdown.religion -
      breakdown.cityUnhappiness -
      breakdown.citizenUnhappiness -
      breakdown.unrestUnhappiness;
  }

  /** Host state used for the +25% research spillover. */
  private factionHostStateId(faction: Faction): number {
    if (faction.patronStateId) return faction.patronStateId;
    if (faction.hq && !faction.hq.pillaged && faction.hq.burgId) return pack.burgs[faction.hq.burgId]?.state ?? 0;
    const first = (faction.outposts ?? []).find(outpost => !outpost.pillaged);
    if (first?.burgId) return pack.burgs[first.burgId]?.state ?? 0;
    return 0;
  }

  private completeFactionTech(faction: Faction, tech: CivTechDef, living: LivingWorldState, free: boolean): void {
    faction.researchedTechs ??= [];
    if (!faction.researchedTechs.includes(tech.id)) faction.researchedTechs.push(tech.id);
    faction.researchedProgress ??= {};
    delete faction.researchedProgress[tech.id];
    faction.researchQueue = (faction.researchQueue ?? []).filter(id => id !== tech.id);
    faction.currentTechId = null;

    const name = resolveCivTechName(activeCivThemeId(), tech);
    this.pushNews(living, {
      kind: "faction",
      text: `${faction.name} discovered ${name}${free ? " through foreign scholars" : ""}.`,
      cell: faction.hq?.cell,
      ...(faction.hq?.burgId ? { burgId: faction.hq.burgId } : {})
    });

    this.raiseTechDevelopment(living, faction.researchedTechs, this.factionSettlementCells(faction));
  }

  /** Research with +25% spillover when the host state already knows the tech. */
  private applyFactionResearch(faction: Faction, living: LivingWorldState): void {
    const theme = activeCivThemeId();
    faction.researchedTechs ??= [];
    faction.researchedProgress ??= {};
    faction.researchQueue ??= [];
    const researched = new Set(faction.researchedTechs);

    let freeTechs = faction.freeTechs ?? 0;
    while (freeTechs > 0) {
      const free = this.nextTech(researched, theme);
      if (!free) break;
      this.completeFactionTech(faction, free, living, true);
      researched.add(free.id);
      freeTechs -= 1;
    }
    faction.freeTechs = freeTechs;

    let current: CivTechDef | undefined = faction.currentTechId ? CIV_TECH_BY_ID[faction.currentTechId] : undefined;
    if (!current || !isTechSelectable(current, researched, theme)) {
      const queued = faction.researchQueue
        .map(id => CIV_TECH_BY_ID[id])
        .find(tech => tech !== undefined && isTechSelectable(tech, researched, theme));
      current = queued ?? this.nextTech(researched, theme) ?? undefined;
      faction.currentTechId = current?.id ?? null;
    }
    if (!current) return;

    let science = Math.max(0, faction.yieldsPerTurn?.science ?? 0);
    const hostId = this.factionHostStateId(faction);
    if (hostId > 0) {
      const hostTechs = living.states[hostId]?.researchedTechs ?? [];
      if (hostTechs.includes(current.id)) science = Math.round(science * 1.25 * 100) / 100;
    }

    const cost = Math.max(1, current.cost);
    const banked = (faction.researchedProgress[current.id] ?? 0) + science;
    if (banked < cost) {
      faction.researchedProgress[current.id] = Math.round(banked * 100) / 100;
      return;
    }
    this.completeFactionTech(faction, current, living, false);

    const advanced = new Set(faction.researchedTechs ?? []);
    const queued = faction.researchQueue
      .map(id => CIV_TECH_BY_ID[id])
      .find(tech => tech !== undefined && isTechSelectable(tech, advanced, theme));
    faction.currentTechId = (queued ?? this.nextTech(advanced, theme))?.id ?? null;
  }

  /** Bank net Gold into the faction treasury; a negative balance disbands a block. */
  private applyFactionTreasury(faction: Faction, living: LivingWorldState): void {
    const goldPerTurn = faction.yieldsPerTurn?.gold ?? 0;
    faction.treasury = Math.round((Number(faction.treasury ?? 0) + goldPerTurn) * 100) / 100;
    faction.science = Math.max(0, faction.yieldsPerTurn?.science ?? 0);
    if (faction.treasury < 0) this.settleFactionDebt(faction, living);
  }

  /** Bankruptcy: disband the newest block, not the whole regiment. */
  private settleFactionDebt(faction: Faction, living: LivingWorldState): void {
    faction.treasury = 0;
    const military = faction.military ?? [];
    const newest = military[military.length - 1];
    if (!newest) return;

    const blocks = newest.units ?? [];
    if (blocks.length > 0) {
      blocks.pop();
      newest.units = blocks;
      syncRegimentTotals(newest, Military.getUnitTypes());
    }
    if (blocks.length === 0) {
      military.pop();
      const key = this.factionUnitKey(faction.i, newest.i);
      if (living.units) delete living.units[key];
      if (living.armies) delete living.armies[key];
    }

    this.pushNews(living, {
      kind: "muster",
      text: `${faction.name} could not pay its forces; its newest block was disbanded.`,
      cell: newest.cell,
      ...(newest.cell !== undefined ? { burgId: Number(pack.cells.burg?.[newest.cell] ?? 0) || undefined } : {})
    });
  }

  /** One seasonal faction empire tick: yields, happiness, research and treasury. */
  stepFactionEmpire(living: LivingWorldState): void {
    if (!this.hasCityTerrain()) return;
    const charters = new Map<number, number>();
    for (const faction of Factions.active()) {
      faction.seasonsActive = (faction.seasonsActive || 0) + 1;
      syncFactionState(faction);
      const breakdown = this.getFactionYieldBreakdown(faction);
      faction.yieldsPerTurn = breakdown.total;
      // §5.1: temples and chanceries grow their influence with the court's spending
      faction.influence = minmax((faction.influence ?? 0) + breakdown.influence, 0, 100);
      if (breakdown.charterPatronId && breakdown.charterTithe > 0) {
        const patron = breakdown.charterPatronId;
        charters.set(patron, (charters.get(patron) ?? 0) + breakdown.charterTithe);
      }
      this.recomputeFactionHappiness(faction, living);
      this.applyFactionResearch(faction, living);
      this.applyFactionTreasury(faction, living);
    }
    this.applyCharterTithes(living, charters);
  }

  /** §5.1: charters pay their patron states, as a named line of the state's budget */
  private applyCharterTithes(living: LivingWorldState, charters: Map<number, number>): void {
    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const others = (state.economy.adjustments ?? []).filter(line => line.name !== CHARTER_TITHE);
      const value = Math.round(((charters.get(state.i) ?? 0) / SEASON_DAYS) * 100) / 100; // a day's, as adjustments are
      if (value === (state.economy.adjustments ?? []).find(line => line.name === CHARTER_TITHE)?.value) continue;
      state.economy.adjustments = value > 0 ? [...others, { name: CHARTER_TITHE, value }] : others;
      living.economyDirty = true;
    }
  }

  /** One seasonal empire tick: yields, happiness, research, treasury and unravel. */
  private stepEmpire(living: LivingWorldState): void {
    if (!this.hasCityTerrain()) return;

    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim) continue;

      sSim.yieldsPerTurn = this.recomputeStateYields(state, living);
      this.recomputeEmpireHappiness(state, sSim, living);
      this.applyResearch(state, sSim, living);
      this.applyTreasury(state, sSim, living);
      this.applyHappinessPressure(sSim);
    }

    this.stepFactionEmpire(living);
  }

  /** Choose the technology a state researches next (public for HUD and Sandbox controls). */
  setResearch(stateId: number, techId: string): boolean {
    const living = this.getState();
    const state = pack.states[stateId];
    const sSim = living.states[stateId];
    const tech = CIV_TECH_BY_ID[techId];
    if (!state?.i || state.removed || !sSim || !tech) return false;

    const researched = new Set(sSim.researchedTechs ?? []);
    if (!isTechSelectable(tech, researched, activeCivThemeId())) return false;

    sSim.researchQueue = [techId, ...(sSim.researchQueue ?? []).filter(id => id !== techId)];
    sSim.currentTechId = techId;
    return true;
  }

  /** Grant a technology outright (wonders, Guild scrolls, Sandbox God Mode). */
  grantTech(stateId: number, techId: string): boolean {
    const living = this.getState();
    const state = pack.states[stateId];
    const sSim = living.states[stateId];
    const tech = CIV_TECH_BY_ID[techId];
    if (!state?.i || state.removed || !sSim || !tech) return false;
    if ((sSim.researchedTechs ?? []).includes(techId)) return false;

    this.completeTech(state, sSim, tech, living, true);
    return true;
  }

  /**
   * §5.2 A ruler's audit: officials' cut lowered and the graft they held recovered into the
   * treasury. Returns the gold recovered; 0 without a treasury to recover it into.
   */
  auditCorruption(stateId: number): number {
    const living = this.getState();
    const state = pack.states[stateId];
    if (!state?.i || state.removed || !living.states[stateId]) return 0;

    const budget = state.economy.budget;
    budget.corruption = Math.max(0, Math.round((budget.corruption ?? 0) - AUDIT_CORRUPTION_CUT));
    const recovered = auditRecovery(Number(state.economy.pocketed ?? 0), rulerBias(stateId));
    if (recovered > 0) {
      state.economy.treasury = Math.round((Number(state.economy.treasury ?? 0) + recovered) * 100) / 100;
    }
    living.economyDirty = true; // the run's graft rate follows the budget
    this.pushNews(living, {
      kind: "develop",
      text: `${state.name} audited its officials: graft cut to ${budget.corruption}%, ${recovered} recovered.`,
      cell: state.center,
      stateId
    });
    return recovered;
  }

  /** §5.2 Sabotage a deposit: its cell's output drops and its province loses order. */
  sabotageDeposit(cellId: number): boolean {
    const living = this.getState();
    const cell = Math.floor(Number(cellId));
    if (!Number.isInteger(cell) || cell < 0 || !pack.cells.i?.includes(cell)) return false;
    if (!Number(pack.cells.good?.[cell] ?? 0)) return false; // no deposit to spoil

    living.cells ??= {};
    living.cells[cell] ??= {};
    const cellSim = living.cells[cell];
    if (cellSim.pillaged) return false;
    cellSim.pillaged = true;
    living.economyDirty = true;

    const provinceId = Number(pack.cells.province?.[cell] ?? 0);
    const province = provinceId ? living.provinces?.[provinceId] : undefined;
    if (province) province.order = minmax(province.order - SABOTAGE_ORDER, 0, 100);

    this.pushNews(living, {
      kind: "trouble",
      text: `Saboteurs wrecked a working near ${pack.burgs?.[Number(pack.cells.burg?.[cell] ?? 0)]?.name ?? "the frontier"}.`,
      cell,
      stateId: pack.cells.state?.[cell] ?? 0
    });
    return true;
  }

  /** Queue one faction-suppression operation through a state city. */
  startFactionSuppression(stateId: number, factionId: number): boolean {
    const living = this.getState();
    const state = pack.states[stateId];
    const sSim = living.states[stateId];
    if (!state?.i || state.removed || !sSim) return false;
    if (sSim.agenda?.kind === "suppress_faction") return false;
    if (!this.isHostileToState(factionId, stateId)) return false;

    const targets = this.eligibleFactionSuppressionTargets(stateId).filter(target => target.faction.i === factionId);
    const target = targets[0];
    if (!target) return false;
    const location = factionSuppressionLocationName(target);
    const targetCell = factionSuppressionTargetCell(target);

    if (!target.wilderness && target.burg?.i) {
      if (!this.enqueueFactionSuppression(target, living)) return false;
    }
    sSim.agenda = {
      kind: "suppress_faction",
      label: `Suppressing ${target.faction.name} in ${location}`,
      targetFactionId: factionId,
      ...(target.burg?.i ? { targetBurgId: target.burg.i } : { targetCell }),
      progress: 0,
      required: 1
    };

    this.pushNews(living, {
      kind: "faction",
      text: `${state.name} began suppressing ${target.faction.name} in ${location}.`,
      cell: targetCell,
      stateId,
      ...(target.burg?.i ? { burgId: target.burg.i } : {})
    });
    return true;
  }

  /** Whether a state is willing to suppress this faction as an in-world target. */
  isHostileToState(factionId: number, stateId: number): boolean {
    const faction = pack.factions?.[factionId];
    return Boolean(faction?.i && !faction.removed && this.isFactionHostileToState(faction, stateId));
  }

  /** Active, locally hosted faction nodes eligible for suppression by a state. */
  eligibleFactionSuppressionTargets(stateId: number): FactionSuppressionTarget[] {
    const state = pack.states[stateId];
    if (!state?.i || state.removed) return [];

    const stateCell = state.center;
    const statePoint = stateCell !== undefined ? pack.cells.p?.[stateCell] : undefined;
    const targets: FactionSuppressionTarget[] = [];

    for (const faction of Factions.active()) {
      if (!this.isFactionHostileToState(faction, state.i)) continue;

      const nodes: { node: FactionHq | FactionOutpost; isHq: boolean }[] = [];
      if (faction.hq && !faction.hq.pillaged) nodes.push({ node: faction.hq, isHq: true });
      for (const outpost of faction.outposts ?? []) {
        if (!outpost.pillaged) nodes.push({ node: outpost, isHq: false });
      }

      for (const { node, isHq } of nodes) {
        const burg = node.burgId ? pack.burgs[node.burgId] : undefined;
        const wilderness = isHq && !burg?.i;
        let cell: number;
        if (burg?.i && !burg.removed) {
          if (burg.state !== state.i) continue;
          cell = burg.cell;
        } else if (wilderness) {
          cell = node.cell;
          if (cell === undefined || cell < 0) continue;
          if (Number(pack.cells.state?.[cell] ?? 0) !== state.i) continue;
        } else {
          continue;
        }

        const yields = node.sim?.cityYields;
        const burgPoint = pack.cells.p?.[cell];
        const distance =
          burgPoint && statePoint ? Math.hypot(burgPoint[0] - statePoint[0], burgPoint[1] - statePoint[1]) : 0;
        const score =
          (burg?.capital ? 1000 : 0) +
          ((yields?.gold ?? 0) + (yields?.production ?? 0) + (yields?.culture ?? 0)) * 10 +
          ((node.sim?.citizens ?? 1) + (node.influence ?? node.secrecy)) -
          distance * 0.1;

        targets.push({
          faction,
          node,
          isHq,
          burg: burg?.i && !burg.removed ? burg : null,
          cell,
          wilderness,
          nodeKey: factionSuppressionNodeKey(node, isHq),
          score
        });
      }
    }

    targets.sort((a, b) => b.score - a.score || a.cell - b.cell || a.faction.i - b.faction.i);
    return targets;
  }

  /** Best locally hosted hostile/clandestine node for administrative suppression. */
  private pickFactionSuppressionTarget(state: State): FactionSuppressionTarget | null {
    return this.eligibleFactionSuppressionTargets(state.i)[0] ?? null;
  }

  /** Gold-hurry the top production item in a Major Burg (GoldPurchase). */
  hurryProduction(burgId: number): boolean {
    const living = this.getState();
    const burg = pack.burgs[burgId];
    const bSim = living.burgs[burgId];
    if (!burg?.i || burg.removed || !burg.state || !bSim?.productionQueue?.length) return false;

    const state = pack.states[burg.state];
    if (!state?.i || state.removed) return false;

    const item = bSim.productionQueue[0]!;
    const key = `${item.kind}:${item.id}`;
    const remaining = Math.max(0, this.productionCost(state, item) - (bSim.productionProgress?.[key] ?? 0));
    if (remaining <= 0) return false;

    const price = hurryGoldCost(remaining, item.kind === "unit", (bSim.civBuildings ?? []).includes("big_ben"));
    if (Number(state.economy.treasury ?? 0) < price + GOLD_PURCHASE_RESERVE) return false;

    state.economy.treasury = Math.round((Number(state.economy.treasury ?? 0) - price) * 100) / 100;
    if (bSim.productionProgress) delete bSim.productionProgress[key];
    bSim.productionQueue.shift();
    this.completeProductionItem(state, burg, bSim, item, living);
    return true;
  }

  // -------------------------------------------------------------------------
  // Slice 5: OpenCiv 1UPT tactical layer — units, combat, builders, settlers,
  // city sieges and Gold upgrades.
  // -------------------------------------------------------------------------

  unitKey(stateId: number, regimentId: number): string {
    return `${stateId}-${regimentId}`;
  }

  /**
   * Reconcile `living.units` (utility) and `living.armies` (combat) with the
   * native regiments (terrain packs only). Composition stays on
   * `Regiment.units`; this only guarantees one live state record per regiment.
   */
  private syncArmies(living: LivingWorldState): void {
    if (!this.hasCityTerrain()) return;
    living.units ??= {};
    living.armies ??= {};
    const unitTypes = Military.getUnitTypes();
    const rosterCache = new Map<number, ResolvedRoster | undefined>();
    const aliveUnits = new Set<string>();
    const aliveArmies = new Set<string>();
    const maxSlots = currentContent().config.military.maxUnitsPerArmy;

    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;

      for (const regiment of state.military ?? []) {
        const key = this.unitKey(state.i, regiment.i);

        // Legacy 1UPT combat sim: convert once, then drop it (§13.1).
        const sim = living.units[key];
        if (sim && !sim.isUtility) {
          const roster = this.stateRoster(state, rosterCache);
          const unit = roster ? matchRosterUnitByCategory(roster, sim.combatClass) : undefined;
          if (unit) {
            regiment.units = [{ type: unit.id, hp: 1, exp: Math.min(9, Math.max(0, (sim.level ?? 1) - 1)) }];
          }
          delete living.units[key];
        }

        // Utility regiment: its civilian type is authoritative (living-openciv-armies.md §11).
        const civilianType = (regiment.type ?? "").toLowerCase();
        if (isCivilianUnit(civilianType)) {
          const def = this.civilianDefinition(civilianType);
          if (!def?.isUtility) continue;
          regiment.units = [];
          const unit = living.units[key] ?? this.createUtilitySim(regiment, def);
          this.applyUnitDefinition(unit, def);
          if (unit.domain === "sea") regiment.n = 1;
          regiment.a = Math.max(0, Math.round(unit.hp));
          regiment.u = { [def.id]: regiment.a };
          living.units[key] = unit;
          aliveUnits.add(key);
          continue;
        }

        migrateArmyBlocks(regiment, unitTypes);
        if (!regiment.units?.length) continue;
        normalizeArmy(regiment, maxSlots, unitTypes);
        if (armyIsEmpty(regiment)) {
          this.removeRegiment(state, regiment, living);
          continue;
        }
        const speed = armySpeed(regiment, unitTypes);
        const army = living.armies[key] ?? {
          movement: speed,
          maxMovement: speed,
          stance: "fortify" as const,
          hasFought: false
        };
        army.maxMovement = speed;
        living.armies[key] = army;
        aliveArmies.add(key);
        syncRegimentTotals(regiment, unitTypes);
      }
    }

    for (const faction of Factions.active()) {
      syncFactionState(faction);
      for (const regiment of faction.military ?? []) {
        const key = this.factionUnitKey(faction.i, regiment.i);
        const civilianType = (regiment.type ?? "").toLowerCase();
        if (isCivilianUnit(civilianType)) {
          const def = this.civilianDefinition(civilianType);
          if (!def?.isUtility) continue;
          regiment.units = [];
          const unit = living.units[key] ?? this.createUtilitySim(regiment, def);
          this.applyUnitDefinition(unit, def);
          if (unit.domain === "sea") regiment.n = 1;
          regiment.a = Math.max(0, Math.round(unit.hp));
          regiment.u = { [def.id]: regiment.a };
          living.units[key] = unit;
          aliveUnits.add(key);
          continue;
        }

        migrateArmyBlocks(regiment, unitTypes);
        if (!regiment.units?.length) continue;
        normalizeArmy(regiment, maxSlots, unitTypes);
        if (armyIsEmpty(regiment)) {
          this.removeFactionRegiment(faction, regiment, living);
          continue;
        }
        const speed = armySpeed(regiment, unitTypes);
        const army = living.armies[key] ?? {
          movement: speed,
          maxMovement: speed,
          stance: "fortify" as const,
          hasFought: false
        };
        army.maxMovement = speed;
        living.armies[key] = army;
        aliveArmies.add(key);
        syncRegimentTotals(regiment, unitTypes);
      }
    }

    for (const key of Object.keys(living.units)) {
      if (!aliveUnits.has(key)) delete living.units[key];
    }
    for (const key of Object.keys(living.armies)) {
      if (!aliveArmies.has(key)) delete living.armies[key];
    }
  }

  /** Roster for a state, cached for the duration of a sync pass. */
  private stateRoster(state: State, cache: Map<number, ResolvedRoster | undefined>): ResolvedRoster | undefined {
    if (!cache.has(state.i)) cache.set(state.i, Military.getRoster(state));
    return cache.get(state.i);
  }

  /** Build a utility sim for an existing civilian regiment. */
  private createUtilitySim(_regiment: Regiment, def: CivUnitDef): UnitSimState {
    const unit: UnitSimState = {
      unitTypeId: def.id,
      domain: def.domain ?? "land",
      combatClass: def.unitClass ?? "civilian",
      isUtility: true,
      hp: UNIT_MAX_HP,
      movement: def.defaultMoveDistance ?? 2,
      maxMovement: def.defaultMoveDistance ?? 2,
      combatStrength: 0,
      rangedStrength: 0,
      range: 0,
      xp: 0,
      level: 1,
      promotions: [],
      fortified: false,
      hasAttacked: false,
      workOrder: null
    };
    return unit;
  }

  private civilianDefinition(unitTypeId: string): CivUnitDef | undefined {
    return CIV_CIVILIAN_BY_ID[unitTypeId];
  }

  /** Copy catalog stats onto a live unit sim, keeping its current HP/XP. */
  private applyUnitDefinition(unit: UnitSimState, def: CivUnitDef): void {
    unit.unitTypeId = def.id;
    unit.domain = def.domain ?? "land";
    unit.combatClass = def.unitClass ?? (def.isUtility ? "civilian" : "melee");
    unit.isUtility = Boolean(def.isUtility);
    unit.combatStrength = def.combatStrength ?? 0;
    unit.rangedStrength = def.rangedStrength ?? 0;
    unit.range = def.range ?? 0;
    unit.maxMovement = def.defaultMoveDistance ?? 2;
    unit.movement = Math.min(unit.movement, unit.maxMovement);
  }

  private unitLevel(xp: number): number {
    let level = 1;
    while (level < 10 && xp >= xpForLevel(level + 1)) level += 1;
    return level;
  }

  /** The 1UPT sim for a regiment, if the tactical layer is active. */
  unitSim(stateId: number, regimentId: number): UnitSimState | undefined {
    return pack.history?.living?.units?.[this.unitKey(stateId, regimentId)];
  }

  /**
   * Occupant registry: one combat army plus one utility regiment per polity and
   * cell, never two polities (living-openciv-armies.md §7.1). Army granularity is
   * the regiment, not the old 1UPT sim.
   * Polity ids: state ids are positive, faction ids are negated (see `factionOwnerId`).
   */
  private armyOccupancy(living: LivingWorldState): Map<number, { stateId: number; isUtility: boolean; key: string }[]> {
    const map = new Map<number, { stateId: number; isUtility: boolean; key: string }[]>();
    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      for (const regiment of state.military ?? []) {
        const key = this.unitKey(state.i, regiment.i);
        const unit = living.units?.[key];
        const isUtility = Boolean(unit?.isUtility);
        if (isUtility && (!unit || unit.hp <= 0)) continue;
        if (!isUtility && armyIsEmpty(regiment)) continue;
        const list = map.get(regiment.cell) ?? [];
        list.push({ stateId: state.i, isUtility, key });
        map.set(regiment.cell, list);
      }
    }
    for (const faction of Factions.active()) {
      for (const regiment of faction.military ?? []) {
        const key = this.factionUnitKey(faction.i, regiment.i);
        const unit = living.units?.[key];
        const isUtility = Boolean(unit?.isUtility);
        if (isUtility && (!unit || unit.hp <= 0)) continue;
        if (!isUtility && armyIsEmpty(regiment)) continue;
        const list = map.get(regiment.cell) ?? [];
        list.push({ stateId: this.factionOwnerId(faction.i), isUtility, key });
        map.set(regiment.cell, list);
      }
    }
    return map;
  }

  /** Move a regiment to a cell, keeping occupancy and coordinates in sync. */
  private moveRegimentTo(
    regiment: Regiment,
    cell: number,
    stateId: number,
    key: string,
    occupancy: Map<number, { stateId: number; isUtility: boolean; key: string }[]>
  ): void {
    const list = occupancy.get(regiment.cell);
    if (list) {
      const filtered = list.filter(entry => entry.key !== key);
      if (filtered.length) occupancy.set(regiment.cell, filtered);
      else occupancy.delete(regiment.cell);
    }

    regiment.cell = cell;
    const point = pack.cells.p?.[cell];
    if (point) {
      regiment.x = point[0];
      regiment.y = point[1];
      regiment.bx = point[0];
      regiment.by = point[1];
    }

    const unit = pack.history?.living?.units?.[key];
    const target = occupancy.get(cell) ?? [];
    target.push({ stateId, isUtility: Boolean(unit?.isUtility), key });
    occupancy.set(cell, target);
  }

  private removeRegiment(state: State, regiment: Regiment, living: LivingWorldState): void {
    state.military = (state.military ?? []).filter(entry => entry !== regiment);
    const key = this.unitKey(state.i, regiment.i);
    if (living.units) delete living.units[key];
    if (living.armies) delete living.armies[key];
    // Lift any siege this regiment was conducting.
    for (const bSim of Object.values(living.burgs ?? {})) {
      if (bSim.siegeStateId === state.i) {
        bSim.siegeStateId = 0;
        bSim.siegeProgress = 0;
        bSim.siegeSupplies = 0;
      }
    }
  }

  /** Faction owner id for occupancy / borders: negated so it never collides with a State id. */
  private factionOwnerId(factionId: number): number {
    return -factionId;
  }

  private removeFactionRegiment(faction: Faction, regiment: Regiment, living: LivingWorldState): void {
    faction.military = (faction.military ?? []).filter(entry => entry !== regiment);
    const key = this.factionUnitKey(faction.i, regiment.i);
    if (living.units) delete living.units[key];
    if (living.armies) delete living.armies[key];
  }

  /** Is this faction at war with this state (Enemy relation or hostile allegiance)? */
  private isFactionEnemyOfState(faction: Faction, stateId: number): boolean {
    if (!stateId) return false;
    if (faction.stateRelations?.[stateId] === "Enemy") return true;
    if (faction.allegiance === "hostile") return true;
    return false;
  }

  /** Broader suppression eligibility: hostile/clandestine allegiance or an explicit Enemy relation. */
  private isFactionHostileToState(faction: Faction, stateId: number): boolean {
    if (!stateId) return false;
    if (faction.patronStateId === stateId && faction.allegiance === "state_arm") return false;
    const relation = faction.stateRelations?.[stateId];
    if (relation === "Ally" || relation === "Friendly") return false;
    return faction.allegiance === "hostile" || faction.allegiance === "clandestine" || relation === "Enemy";
  }

  /** Is this faction at war with that faction (explicit Enemy relation)? */
  private isFactionEnemyOfFaction(faction: Faction, other: Faction): boolean {
    if (faction.i === other.i) return false;
    return faction.factionRelations?.[other.i] === "Enemy" || other.factionRelations?.[faction.i] === "Enemy";
  }

  /** One tactical tick: utility work, army orders, battles and city strikes. */
  private stepTactical(living: LivingWorldState): void {
    if (!this.hasCityTerrain()) return;
    this.syncArmies(living);
    const occupancy = this.armyOccupancy(living);

    // Cities regenerate and reset their strike flag before units act.
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || !burg.state) continue;
      if (!isMajorBurg(burg)) continue;
      const bSim = living.burgs[burg.i];
      if (!bSim) continue;
      this.ensureCityHp(bSim);
      bSim.hp = Math.min(bSim.maxHp ?? CITY_BASE_HP, (bSim.hp ?? 0) + 20);
      bSim.hasStruckThisTurn = false;
    }

    // Faction HQ/outpost nodes regenerate similarly.
    for (const entry of this.collectFactionNodes()) {
      this.ensureCityHp(entry.sim);
      entry.sim.hp = Math.min(entry.sim.maxHp ?? CITY_BASE_HP, (entry.sim.hp ?? 0) + 20);
      entry.sim.hasStruckThisTurn = false;
    }

    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim) continue;

      for (const regiment of [...(state.military ?? [])]) {
        const key = this.unitKey(state.i, regiment.i);
        const unit = living.units?.[key];

        // Utility regiment: Settler/Builder/Missionary keep the 1UPT sim.
        if (unit?.isUtility) {
          if (unit.hp <= 0) {
            this.removeRegiment(state, regiment, living);
            continue;
          }
          this.tickUnitHealing(unit, regiment, state);
          unit.movement = unit.maxMovement;
          unit.hasAttacked = false;
          let acted = false;
          if (unit.unitTypeId === "settler") {
            acted = this.stepSettler(state, regiment, unit, living, occupancy);
          } else if (unit.unitTypeId === "missionary" || unit.unitTypeId === "inquisitor") {
            acted = this.stepMissionary(state, regiment, unit, living, occupancy);
          } else {
            acted = this.stepBuilder(state, regiment, unit, living, occupancy);
          }
          unit.fortified = !acted;
          continue;
        }

        // Combat army: blocks + per-tick state.
        const army = living.armies?.[key];
        if (!army) continue;
        if (armyIsEmpty(regiment)) {
          this.removeRegiment(state, regiment, living);
          continue;
        }
        // The stance carries from the previous tick: a forced march covers more
        // ground but cannot open a fight; an army lying in wait is concealed.
        army.movement = army.maxMovement * this.stanceMovementMultiplier(army.stance);
        army.hasFought = false;
        const acted = this.stepArmyOrders(state, regiment, army, living, occupancy);
        army.stance = acted ? "march" : this.restStance(state, regiment, army);
        syncRegimentTotals(regiment, Military.getUnitTypes());
      }

      // Rich states upgrade one regiment per season.
      this.autoUpgrade(state, living);
    }

    for (const faction of Factions.active()) {
      syncFactionState(faction);
      for (const regiment of [...(faction.military ?? [])]) {
        const key = this.factionUnitKey(faction.i, regiment.i);
        const unit = living.units?.[key];

        if (unit?.isUtility) {
          if (unit.hp <= 0) {
            this.removeFactionRegiment(faction, regiment, living);
            continue;
          }
          this.tickFactionUnitHealing(unit, regiment, faction);
          unit.movement = unit.maxMovement;
          unit.hasAttacked = false;
          let acted = false;
          if (unit.unitTypeId === "settler") {
            acted = this.stepFactionSettler(faction, regiment, unit, living, occupancy);
          } else {
            acted = this.stepFactionBuilder(faction, regiment, unit, living, occupancy);
          }
          unit.fortified = !acted;
          continue;
        }

        const army = living.armies?.[key];
        if (!army) continue;
        if (armyIsEmpty(regiment)) {
          this.removeFactionRegiment(faction, regiment, living);
          continue;
        }
        army.movement = army.maxMovement;
        army.hasFought = false;
        const acted = this.stepFactionArmyOrders(faction, regiment, army, living, occupancy);
        army.stance = acted ? "march" : this.factionRestStance(faction, regiment, army);
        syncRegimentTotals(regiment, Military.getUnitTypes());
      }
    }

    this.replenishArmies(living);
    this.stepCityStrikes(living);
  }

  /** Movement points a stance grants: march 1.5x, encamp/ambush 0.7x, everything else 1x. */
  private stanceMovementMultiplier(stance: ArmyStance): number {
    return currentContent().config.movement.stanceMultipliers[stance] ?? 1;
  }

  /** A resting army entrenches in a friendly city when badly hurt, otherwise fortifies. */
  private restStance(state: State, regiment: Regiment, army: ArmySimState): ArmyStance {
    const burgId = Number(pack.cells.burg?.[regiment.cell] ?? 0);
    const burg = burgId ? pack.burgs[burgId] : undefined;
    const inCity = Boolean(burg?.i && !burg.removed && burg.state === state.i);
    if (inCity && armyHp(regiment) < 0.6) return "encamp";

    // A war army resting in the open outside its own land is a concealed force:
    // the attack it opens next tick gets the ambush bonus (§F).
    const inFriendlyLand = pack.cells.state?.[regiment.cell] === state.i;
    if (!inCity && !inFriendlyLand && this.stateAtWar(state)) return "ambush";

    return army.stance === "encamp" && inCity ? "encamp" : "fortify";
  }

  private factionRestStance(faction: Faction, regiment: Regiment, army: ArmySimState): ArmyStance {
    const burgId = Number(pack.cells.burg?.[regiment.cell] ?? 0);
    const inCity = burgId > 0 && this.factionNodesAtBurg(faction.i, burgId);
    if (inCity && armyHp(regiment) < 0.6) return "encamp";
    return army.stance === "encamp" && inCity ? "encamp" : "fortify";
  }

  private factionNodesAtBurg(factionId: number, burgId: number): boolean {
    const faction = pack.factions?.[factionId];
    if (!faction?.i || faction.removed) return false;
    if (faction.hq && !faction.hq.pillaged && faction.hq.burgId === burgId) return true;
    return (faction.outposts ?? []).some(outpost => outpost.burgId === burgId && !outpost.pillaged);
  }

  /** Fortification-only healing: +25 in a friendly city, +20 in friendly lands, +10 elsewhere. */
  private tickUnitHealing(unit: UnitSimState, regiment: Regiment, state: State): void {
    if (!unit.fortified || unit.hp <= 0 || unit.hp >= UNIT_MAX_HP) return;
    const burgId = Number(pack.cells.burg?.[regiment.cell] ?? 0);
    const inFriendlyCity = burgId > 0 && pack.burgs[burgId]?.state === state.i;
    const inFriendlyLands = pack.cells.state?.[regiment.cell] === state.i;
    const heal = inFriendlyCity ? 25 : inFriendlyLands ? 20 : 10;
    unit.hp = Math.min(UNIT_MAX_HP, unit.hp + heal);
  }

  private tickFactionUnitHealing(unit: UnitSimState, regiment: Regiment, faction: Faction): void {
    if (!unit.fortified || unit.hp <= 0 || unit.hp >= UNIT_MAX_HP) return;
    const burgId = Number(pack.cells.burg?.[regiment.cell] ?? 0);
    const inFriendlyCity = burgId > 0 && this.factionNodesAtBurg(faction.i, burgId);
    const nearNode =
      inFriendlyCity ||
      Boolean(faction.hq && this.cellHopDistances(faction.hq.cell, MAX_WORK_DISTANCE).has(regiment.cell)) ||
      (faction.outposts ?? []).some(outpost =>
        this.cellHopDistances(outpost.cell, MAX_WORK_DISTANCE).has(regiment.cell)
      );
    const heal = inFriendlyCity ? 25 : nearNode ? 20 : 10;
    unit.hp = Math.min(UNIT_MAX_HP, unit.hp + heal);
  }

  /** Move a unit along the cheapest descending path toward a target cell. */
  private moveUnitToward(
    regiment: Regiment,
    unit: UnitSimState,
    targetCell: number,
    stateId: number,
    key: string,
    occupancy: Map<number, { stateId: number; isUtility: boolean; key: string }[]>
  ): boolean {
    const distances = this.cellHopDistances(targetCell, 40);
    let moved = false;
    let guard = 0;

    while (unit.movement > 0 && guard++ < 12) {
      const current = regiment.cell;
      if (current === targetCell) break;
      const currentDistance = distances.get(current) ?? Number.POSITIVE_INFINITY;
      let best: { cell: number; distance: number; cost: number } | null = null;

      for (const neighbor of pack.cells.c?.[current] ?? []) {
        const distance = distances.get(neighbor);
        if (distance === undefined || distance >= currentDistance) continue;
        if (hasStackingConflict(occupancy.get(neighbor) ?? [], stateId, unit.isUtility, key)) continue;
        if (!this.canEnterForeignCell(stateId, neighbor, unit)) continue;
        const cost = unitMovementCost(current, neighbor, unit);
        if (!Number.isFinite(cost) || cost > unit.movement) continue;
        if (
          !best ||
          distance < best.distance ||
          (distance === best.distance && cost < best.cost) ||
          (distance === best.distance && cost === best.cost && neighbor < best.cell)
        ) {
          best = { cell: neighbor, distance, cost };
        }
      }

      if (!best) break;
      this.moveRegimentTo(regiment, best.cell, stateId, key, occupancy);
      unit.movement = Math.max(0, unit.movement - best.cost);
      moved = true;
    }

    return moved;
  }

  /** Army orders: engage an enemy in range, bombard a city, or march on the agenda target. */
  private stepArmyOrders(
    state: State,
    regiment: Regiment,
    army: ArmySimState,
    living: LivingWorldState,
    occupancy: Map<number, { stateId: number; isUtility: boolean; key: string }[]>
  ): boolean {
    // A forced march cannot open a fight (§F).
    if (army.stance !== "march") {
      const enemy = this.findEnemyArmyInRange(state.i, regiment.cell, regiment, living);
      if (enemy) {
        // No heroic suicides (absorbs the campaign AI): a badly outmatched army
        // holds position unless its goal orders the attack anyway.
        const agenda = living.states[state.i]?.agenda;
        const ordered =
          agenda?.kind === "conquer" ||
          agenda?.kind === "raid" ||
          agenda?.kind === "defend" ||
          agenda?.kind === "suppress_faction";
        if (!ordered && this.armyOutmatched(regiment, enemy.regiment)) return false;
        if (enemy.kind === "state" && enemy.state) {
          this.resolveArmyBattle(state, regiment, enemy.state, enemy.regiment, living);
        } else if (enemy.kind === "faction" && enemy.faction) {
          this.resolveStateFactionBattle(state, regiment, enemy.faction, enemy.regiment, living);
        }
        return true;
      }
    }

    const target = this.tacticalTarget(state, living, regiment.cell);
    if (target === null) return false;
    return this.moveArmyToward(regiment, army, target, state.i, this.unitKey(state.i, regiment.i), occupancy);
  }

  /** Faction army orders: engage enemies, siege adjacent burgs, or march toward a target. */
  private stepFactionArmyOrders(
    faction: Faction,
    regiment: Regiment,
    army: ArmySimState,
    living: LivingWorldState,
    occupancy: Map<number, { stateId: number; isUtility: boolean; key: string }[]>
  ): boolean {
    const enemy = this.findFactionEnemyInRange(faction, regiment.cell, regiment, living);
    if (enemy) {
      this.resolveFactionBattle(faction, regiment, enemy.kind, enemy.id, enemy.regiment, living, occupancy);
      return true;
    }

    const adjacentBurg = this.factionSiegeTarget(faction, regiment.cell);
    if (adjacentBurg) {
      return this.openFactionAssault(faction, regiment, adjacentBurg, living, occupancy);
    }

    const target = this.factionTacticalTarget(faction, regiment.cell, living);
    if (target === null) return false;
    return this.moveArmyToward(
      regiment,
      army,
      target,
      this.factionOwnerId(faction.i),
      this.factionUnitKey(faction.i, regiment.i),
      occupancy
    );
  }

  private factionSiegeTarget(faction: Faction, fromCell: number): Burg | null {
    if (
      faction.allegiance !== "hostile" &&
      faction.allegiance !== "clandestine" &&
      faction.allegiance !== "autonomous"
    ) {
      // only offensive allegiances wage sieges
      if (!faction.sovereignAmbition) return null;
    }
    const neighbors = pack.cells.c?.[fromCell] ?? [];
    let best: Burg | null = null;
    for (const cell of [...neighbors, fromCell]) {
      const burgId = Number(pack.cells.burg?.[cell] ?? 0);
      const burg = burgId ? pack.burgs?.[burgId] : undefined;
      if (!burg?.i || burg.removed) continue;
      if (this.factionNodesAtBurg(faction.i, burg.i)) continue;
      const owner = burg.state ?? 0;
      if (!owner) continue;
      if (!this.isFactionEnemyOfState(faction, owner)) continue;
      if (burg.capital && !faction.sovereignAmbition) continue;
      if (!best || burg.cell < best.cell) best = burg;
    }
    return best;
  }

  private findFactionEnemyInRange(
    faction: Faction,
    cell: number,
    regiment: Regiment,
    living: LivingWorldState
  ): { kind: "state" | "faction"; id: number; regiment: Regiment } | null {
    const ranged = armyIsRangedBlocks(regiment, Military.getUnitTypes());
    const distances = this.cellHopDistances(cell, ranged ? 2 : 1);
    const ordered = [...distances.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [candidate, hops] of ordered) {
      if (hops === 0) continue;
      for (const other of pack.states) {
        if (!other?.i || other.removed) continue;
        if (!this.isFactionEnemyOfState(faction, other.i)) continue;
        for (const enemy of other.military ?? []) {
          if (enemy.cell !== candidate) continue;
          if (!living.armies?.[this.unitKey(other.i, enemy.i)]) continue;
          if (armyIsEmpty(enemy)) continue;
          if (ranged && terrainDefenseMultiplier(candidate) > 1) continue;
          return { kind: "state", id: other.i, regiment: enemy };
        }
      }
      for (const other of Factions.active()) {
        if (other.i === faction.i) continue;
        if (!this.isFactionEnemyOfFaction(faction, other)) continue;
        for (const enemy of other.military ?? []) {
          if (enemy.cell !== candidate) continue;
          if (!living.armies?.[this.factionUnitKey(other.i, enemy.i)]) continue;
          if (armyIsEmpty(enemy)) continue;
          if (ranged && terrainDefenseMultiplier(candidate) > 1) continue;
          return { kind: "faction", id: other.i, regiment: enemy };
        }
      }
    }
    return null;
  }

  private factionTacticalTarget(faction: Faction, fromCell: number, living: LivingWorldState): number | null {
    // Cheap: nearest enemy burg or nearest enemy army.
    let best: { cell: number; distance: number } | null = null;
    const enemyRegReach = this.cellHopDistances(fromCell, UNIT_AGGRO_RANGE);
    for (const other of pack.states) {
      if (!other?.i || other.removed) continue;
      if (!this.isFactionEnemyOfState(faction, other.i)) continue;
      for (const regiment of other.military ?? []) {
        const distance = enemyRegReach.get(regiment.cell);
        if (distance === undefined) continue;
        if (!living.armies?.[this.unitKey(other.i, regiment.i)] || armyIsEmpty(regiment)) continue;
        if (!best || distance < best.distance || (distance === best.distance && regiment.cell < best.cell)) {
          best = { cell: regiment.cell, distance };
        }
      }
    }
    for (const other of Factions.active()) {
      if (!this.isFactionEnemyOfFaction(faction, other)) continue;
      for (const regiment of other.military ?? []) {
        const distance = enemyRegReach.get(regiment.cell);
        if (distance === undefined) continue;
        if (!living.armies?.[this.factionUnitKey(other.i, regiment.i)] || armyIsEmpty(regiment)) continue;
        if (!best || distance < best.distance || (distance === best.distance && regiment.cell < best.cell)) {
          best = { cell: regiment.cell, distance };
        }
      }
    }
    if (best) return best.cell;

    const isOffensive =
      faction.allegiance === "hostile" ||
      faction.allegiance === "clandestine" ||
      faction.sovereignAmbition ||
      (faction.outposts ?? []).some(outpost => {
        if (outpost.pillaged) return false;
        const burg = pack.burgs?.[outpost.burgId];
        return Boolean(burg?.state && this.isFactionEnemyOfState(faction, burg.state));
      }) ||
      Object.values(faction.stateRelations ?? {}).includes("Enemy");
    if (!isOffensive) return null;

    const distances = this.cellHopDistances(fromCell, 40);
    for (const burg of pack.burgs ?? []) {
      if (!burg?.i || burg.removed || !burg.state) continue;
      if (this.factionNodesAtBurg(faction.i, burg.i)) continue;
      if (!this.isFactionEnemyOfState(faction, burg.state)) continue;
      if (burg.capital && !faction.sovereignAmbition) continue;
      const distance = distances.get(burg.cell);
      if (distance === undefined) continue;
      if (!best || distance < best.distance || (distance === best.distance && burg.cell < best.cell)) {
        best = { cell: burg.cell, distance };
      }
    }
    for (const other of Factions.active()) {
      if (!this.isFactionEnemyOfFaction(faction, other)) continue;
      const cells = [other.hq?.cell, ...(other.outposts ?? []).map(outpost => outpost.cell)].filter(
        (cell): cell is number => typeof cell === "number"
      );
      for (const cell of cells) {
        const distance = distances.get(cell);
        if (distance === undefined) continue;
        if (!best || distance < best.distance || (distance === best.distance && cell < best.cell)) {
          best = { cell, distance };
        }
      }
    }
    return best?.cell ?? null;
  }

  /** Movement cost for an army: the slowest block decides the terrain, not the lead. */
  private armyMovementCost(from: number, to: number, regiment: Regiment, movement: number): number {
    const target = getCellTerrainInfo(to);
    if (regiment.n === 1) {
      if (!target.isWater) return Number.POSITIVE_INFINITY;
    } else if (target.isWater || target.isMountain) {
      return Number.POSITIVE_INFINITY;
    }

    if (Number(pack.cells.routes?.[from]?.[to] ?? 0) > 0) return 1 / 3;

    const riverCrossing =
      Number(pack.cells.r?.[from] ?? 0) !== Number(pack.cells.r?.[to] ?? 0) && Number(pack.cells.r?.[to] ?? 0) > 0;
    if (riverCrossing) return Math.max(1, movement);

    if (target.movementCost >= 9999) return Number.POSITIVE_INFINITY;
    return target.movementCost;
  }

  /** Closed borders: an army may enter foreign land when at war or under a military-access treaty. Factions ignore borders. */
  private canEnterForeignCellFor(stateId: number, cell: number): boolean {
    if (stateId < 0) return true;
    const owner = pack.cells.state?.[cell] ?? 0;
    if (!owner || owner === stateId) return true;
    if (this.hasTreaty(stateId, owner, "militaryAccess")) return true;
    return this.isAtWar(stateId, owner);
  }

  /** March an army along the cheapest descending path toward a target cell. */
  private moveArmyToward(
    regiment: Regiment,
    army: ArmySimState,
    targetCell: number,
    stateId: number,
    key: string,
    occupancy: Map<number, { stateId: number; isUtility: boolean; key: string }[]>
  ): boolean {
    const distances = this.cellHopDistances(targetCell, 40);
    const isUtility = false;
    let moved = false;
    let guard = 0;

    while (army.movement > 0 && guard++ < 12) {
      const current = regiment.cell;
      if (current === targetCell) break;
      const currentDistance = distances.get(current) ?? Number.POSITIVE_INFINITY;
      let best: { cell: number; distance: number; cost: number } | null = null;

      for (const neighbor of pack.cells.c?.[current] ?? []) {
        const distance = distances.get(neighbor);
        if (distance === undefined || distance >= currentDistance) continue;
        if (hasStackingConflict(occupancy.get(neighbor) ?? [], stateId, isUtility, key)) continue;
        if (!this.canEnterForeignCellFor(stateId, neighbor)) continue;
        const cost = this.armyMovementCost(current, neighbor, regiment, army.movement);
        if (!Number.isFinite(cost) || cost > army.movement) continue;
        if (
          !best ||
          distance < best.distance ||
          (distance === best.distance && cost < best.cost) ||
          (distance === best.distance && cost === best.cost && neighbor < best.cell)
        ) {
          best = { cell: neighbor, distance, cost };
        }
      }

      if (!best) break;
      this.moveRegimentTo(regiment, best.cell, stateId, key, occupancy);
      army.movement = Math.max(0, army.movement - best.cost);
      moved = true;
    }

    return moved;
  }

  /** Nearest at-war enemy **army** within melee reach or the army's firing range. */
  /** No heroic suicides: true when this army is under 30% of the enemy's strength. */
  private armyOutmatched(regiment: Regiment, enemy: Regiment): boolean {
    const mine = armyStrength(regiment);
    const theirs = armyStrength(enemy);
    return theirs > 0 && mine < theirs * 0.3;
  }

  private findEnemyArmyInRange(
    stateId: number,
    cell: number,
    regiment: Regiment,
    living: LivingWorldState
  ): { kind: "state" | "faction"; id: number; state?: State; faction?: Faction; regiment: Regiment } | null {
    const ranged = armyIsRangedBlocks(regiment, Military.getUnitTypes());
    const distances = this.cellHopDistances(cell, ranged ? 2 : 1);

    for (const [candidate, hops] of distances) {
      if (hops === 0) continue;
      for (const other of pack.states) {
        if (!other?.i || other.removed || other.i === stateId) continue;
        if (!this.isAtWar(stateId, other.i)) continue;
        for (const enemy of other.military ?? []) {
          if (enemy.cell !== candidate) continue;
          if (!living.armies?.[this.unitKey(other.i, enemy.i)]) continue;
          if (armyIsEmpty(enemy)) continue;
          if (ranged && terrainDefenseMultiplier(candidate) > 1) continue;
          return { kind: "state", id: other.i, state: other, regiment: enemy };
        }
      }
      for (const faction of Factions.active()) {
        if (!this.isFactionHostileToState(faction, stateId)) continue;
        for (const enemy of faction.military ?? []) {
          if (enemy.cell !== candidate) continue;
          if (!living.armies?.[this.factionUnitKey(faction.i, enemy.i)]) continue;
          if (armyIsEmpty(enemy)) continue;
          if (ranged && terrainDefenseMultiplier(candidate) > 1) continue;
          return { kind: "faction", id: faction.i, faction, regiment: enemy };
        }
      }
    }
    return null;
  }

  /**
   * Combined-arms battle through the shared battle engine
   * (living-openciv-armies.md §8). Both sides are blocks, so the 1,000-strength
   * bridge keeps `fill = hp` exactly; the outcome converts back to hp before
   * anything else reads it.
   */
  private resolveArmyBattle(
    attackerState: State,
    attackerRegiment: Regiment,
    defenderState: State,
    defenderRegiment: Regiment,
    living: LivingWorldState
  ): void {
    const { config } = currentContent();
    const types = Military.getUnitTypes();
    const maxSlots = config.military.maxUnitsPerArmy;
    const attackerKey = this.unitKey(attackerState.i, attackerRegiment.i);
    const defenderKey = this.unitKey(defenderState.i, defenderRegiment.i);
    const attackerArmy = living.armies?.[attackerKey];
    const defenderArmy = living.armies?.[defenderKey];

    const attackerUnits = toBattleUnits(attackerRegiment.units ?? []);
    const defenderUnits = toBattleUnits(defenderRegiment.units ?? []);
    if (attackerUnits.length === 0 || defenderUnits.length === 0) return;

    const before = {
      attackerHp: armyStrength(attackerRegiment),
      defenderHp: armyStrength(defenderRegiment),
      attackerBlocks: attackerRegiment.units?.length ?? 0,
      defenderBlocks: defenderRegiment.units?.length ?? 0
    };

    const session = initBattleSession({
      config,
      unitTypes: toBattleTypes(types),
      attacker: {
        factionId: attackerState.i,
        armyId: `fm-${attackerState.i}-${attackerRegiment.i}`,
        units: attackerUnits
      },
      defender: {
        factionId: defenderState.i,
        armyId: `fm-${defenderState.i}-${defenderRegiment.i}`,
        units: defenderUnits
      },
      cell: defenderRegiment.cell,
      regionId: pack.cells.province?.[defenderRegiment.cell] ?? 0,
      assault: false,
      modifiers: this.armyBattleModifiers(attackerState, attackerRegiment, defenderState, defenderRegiment)
    });

    const rng = this.rng("army:battle", attackerRegiment.i * 1000 + defenderRegiment.i, living.tick);
    while (session.status === "active" && session.round < config.battle.maxRounds) {
      stepBattleRound(session, rng.next, {
        attacker: this.battleOrder(session, "attacker", attackerArmy?.stance ?? "march"),
        defender: this.battleOrder(session, "defender", defenderArmy?.stance ?? "fortify")
      });
    }
    const outcome = finalizeBattle(session, rng.next);

    attackerRegiment.units = fromBattleUnits(outcome.attacker.units);
    defenderRegiment.units = fromBattleUnits(outcome.defender.units);
    normalizeArmy(attackerRegiment, maxSlots, types);
    normalizeArmy(defenderRegiment, maxSlots, types);

    if (attackerArmy) attackerArmy.hasFought = true;
    if (defenderArmy) defenderArmy.hasFought = true;

    const winnerRegiment = outcome.winner === "attacker" ? attackerRegiment : defenderRegiment;
    for (const block of winnerRegiment.units ?? []) this.awardBlockExp(block, 5);

    syncRegimentTotals(attackerRegiment, types);
    syncRegimentTotals(defenderRegiment, types);

    const after = {
      attackerHp: armyStrength(attackerRegiment),
      defenderHp: armyStrength(defenderRegiment),
      attackerBlocks: attackerRegiment.units?.length ?? 0,
      defenderBlocks: defenderRegiment.units?.length ?? 0
    };
    if (attackerArmy) {
      attackerArmy.lastBattle = this.battleRecord(
        attackerRegiment,
        "attacker",
        outcome.winner,
        session.round,
        living.tick,
        {
          before: before.attackerHp,
          after: after.attackerHp,
          beforeBlocks: before.attackerBlocks,
          afterBlocks: after.attackerBlocks
        }
      );
    }
    if (defenderArmy) {
      defenderArmy.lastBattle = this.battleRecord(
        defenderRegiment,
        "defender",
        outcome.winner,
        session.round,
        living.tick,
        {
          before: before.defenderHp,
          after: after.defenderHp,
          beforeBlocks: before.defenderBlocks,
          afterBlocks: after.defenderBlocks
        }
      );
    }

    const attackerWiped = armyIsEmpty(attackerRegiment);
    const defenderWiped = armyIsEmpty(defenderRegiment);
    if (defenderWiped) {
      if (attackerWiped && attackerRegiment.units?.[0]) attackerRegiment.units[0].hp = 0.01;
      this.removeRegiment(defenderState, defenderRegiment, living);
      if (this.armyHasMelee(attackerRegiment, types)) {
        const occupancy = this.armyOccupancy(living);
        this.moveRegimentTo(attackerRegiment, defenderRegiment.cell, attackerState.i, attackerKey, occupancy);
      }
    }
    if (attackerWiped && !defenderWiped) this.removeRegiment(attackerState, attackerRegiment, living);

    const winnerName = outcome.winner === "attacker" ? attackerState.name : defenderState.name;
    this.pushNews(living, {
      kind: "battle",
      text:
        `${attackerState.name} and ${defenderState.name} fought` +
        (session.labels.length ? ` (${session.labels.slice(0, 2).join(", ")})` : "") +
        `; ${winnerName} held the field after ${session.round} rounds.`,
      cell: defenderRegiment.cell,
      stateId: attackerState.i
    });
    this.addBattleMarker(defenderRegiment.cell, `${attackerState.name} vs ${defenderState.name}`);
  }

  /** State army vs faction regiment through the shared battle engine (suppression guard fights). */
  private resolveStateFactionBattle(
    attackerState: State,
    attackerRegiment: Regiment,
    defenderFaction: Faction,
    defenderRegiment: Regiment,
    living: LivingWorldState
  ): void {
    const { config } = currentContent();
    const types = Military.getUnitTypes();
    const maxSlots = config.military.maxUnitsPerArmy;
    const attackerKey = this.unitKey(attackerState.i, attackerRegiment.i);
    const defenderKey = this.factionUnitKey(defenderFaction.i, defenderRegiment.i);
    const attackerArmy = living.armies?.[attackerKey];
    const defenderArmy = living.armies?.[defenderKey];

    const attackerUnits = toBattleUnits(attackerRegiment.units ?? []);
    const defenderUnits = toBattleUnits(defenderRegiment.units ?? []);
    if (attackerUnits.length === 0 || defenderUnits.length === 0) return;

    const before = {
      attackerHp: armyStrength(attackerRegiment),
      defenderHp: armyStrength(defenderRegiment),
      attackerBlocks: attackerRegiment.units?.length ?? 0,
      defenderBlocks: defenderRegiment.units?.length ?? 0
    };

    const burgId = Number(pack.cells.burg?.[defenderRegiment.cell] ?? 0);
    const burg = burgId ? pack.burgs[burgId] : undefined;
    const attackerLordMult = this.stateCombatMult(attackerState.i, living);
    const defenderLordMult = happinessCombatMultiplier(defenderFaction.happiness ?? 0);
    const session = initBattleSession({
      config,
      unitTypes: toBattleTypes(types),
      attacker: {
        factionId: attackerState.i,
        armyId: `fm-${attackerState.i}-${attackerRegiment.i}`,
        units: attackerUnits
      },
      defender: {
        factionId: this.factionOwnerId(defenderFaction.i),
        armyId: `fm-f${defenderFaction.i}-${defenderRegiment.i}`,
        units: defenderUnits
      },
      cell: defenderRegiment.cell,
      regionId: pack.cells.province?.[defenderRegiment.cell] ?? 0,
      assault: true,
      modifiers: {
        walls: burg?.i && !burg.removed && burg.state === attackerState.i ? Number(burg.walls ?? 0) : 0,
        defenderEncamped: defenderArmy?.stance === "encamp" || defenderArmy?.stance === "fortify",
        defenderAmbushed: attackerArmy?.stance === "ambush",
        attackerCrossedRiver:
          Number(pack.cells.r?.[attackerRegiment.cell] ?? 0) !== Number(pack.cells.r?.[defenderRegiment.cell] ?? 0) &&
          Number(pack.cells.r?.[defenderRegiment.cell] ?? 0) > 0,
        defenderTerrain: terrainDefenseMultiplier(defenderRegiment.cell) > 1,
        labels: [],
        ...(attackerLordMult !== 1 ? { attackerLordMult } : {}),
        ...(defenderLordMult !== 1 ? { defenderLordMult } : {})
      }
    });

    const rng = this.rng("army:faction:battle", attackerRegiment.i * 1000 + defenderRegiment.i, living.tick);
    while (session.status === "active" && session.round < config.battle.maxRounds) {
      stepBattleRound(session, rng.next, {
        attacker: this.battleOrder(session, "attacker", attackerArmy?.stance ?? "march"),
        defender: this.battleOrder(session, "defender", defenderArmy?.stance ?? "fortify")
      });
    }
    const outcome = finalizeBattle(session, rng.next);

    attackerRegiment.units = fromBattleUnits(outcome.attacker.units);
    defenderRegiment.units = fromBattleUnits(outcome.defender.units);
    normalizeArmy(attackerRegiment, maxSlots, types);
    normalizeArmy(defenderRegiment, maxSlots, types);
    if (attackerArmy) attackerArmy.hasFought = true;
    if (defenderArmy) defenderArmy.hasFought = true;

    const winnerRegiment = outcome.winner === "attacker" ? attackerRegiment : defenderRegiment;
    for (const block of winnerRegiment.units ?? []) this.awardBlockExp(block, 5);
    syncRegimentTotals(attackerRegiment, types);
    syncRegimentTotals(defenderRegiment, types);

    const after = {
      attackerHp: armyStrength(attackerRegiment),
      defenderHp: armyStrength(defenderRegiment),
      attackerBlocks: attackerRegiment.units?.length ?? 0,
      defenderBlocks: defenderRegiment.units?.length ?? 0
    };
    if (attackerArmy) {
      attackerArmy.lastBattle = this.battleRecord(
        attackerRegiment,
        "attacker",
        outcome.winner,
        session.round,
        living.tick,
        {
          before: before.attackerHp,
          after: after.attackerHp,
          beforeBlocks: before.attackerBlocks,
          afterBlocks: after.attackerBlocks
        }
      );
    }
    if (defenderArmy) {
      defenderArmy.lastBattle = this.battleRecord(
        defenderRegiment,
        "defender",
        outcome.winner,
        session.round,
        living.tick,
        {
          before: before.defenderHp,
          after: after.defenderHp,
          beforeBlocks: before.defenderBlocks,
          afterBlocks: after.defenderBlocks
        }
      );
    }

    const attackerWiped = armyIsEmpty(attackerRegiment);
    const defenderWiped = armyIsEmpty(defenderRegiment);
    if (defenderWiped) {
      if (attackerWiped && attackerRegiment.units?.[0]) attackerRegiment.units[0].hp = 0.01;
      this.removeFactionRegiment(defenderFaction, defenderRegiment, living);
      if (this.armyHasMelee(attackerRegiment, types)) {
        const occupancy = this.armyOccupancy(living);
        this.moveRegimentTo(attackerRegiment, defenderRegiment.cell, attackerState.i, attackerKey, occupancy);
      }
      this.pushNews(living, {
        kind: "faction",
        text: `${attackerState.name}'s legions broke the ${defenderFaction.name} guard in ${burg?.name ?? "a burg"}.`,
        cell: defenderRegiment.cell,
        stateId: attackerState.i,
        burgId: burg?.i
      });
    }
    if (attackerWiped && !defenderWiped) this.removeRegiment(attackerState, attackerRegiment, living);

    const winnerName = outcome.winner === "attacker" ? attackerState.name : defenderFaction.name;
    this.pushNews(living, {
      kind: "battle",
      text:
        `${attackerState.name} and ${defenderFaction.name} fought` +
        (session.labels.length ? ` (${session.labels.slice(0, 2).join(", ")})` : "") +
        `; ${winnerName} held the field after ${session.round} rounds.`,
      cell: defenderRegiment.cell,
      stateId: attackerState.i
    });
    this.addBattleMarker(defenderRegiment.cell, `${attackerState.name} vs ${defenderFaction.name}`);
  }

  private resolveFactionBattle(
    attackerFaction: Faction,
    attackerRegiment: Regiment,
    defenderKind: "state" | "faction",
    defenderId: number,
    defenderRegiment: Regiment,
    living: LivingWorldState,
    occupancy: Map<number, { stateId: number; isUtility: boolean; key: string }[]>
  ): void {
    const { config } = currentContent();
    const types = Military.getUnitTypes();
    const maxSlots = config.military.maxUnitsPerArmy;
    const attackerKey = this.factionUnitKey(attackerFaction.i, attackerRegiment.i);
    const defenderKey =
      defenderKind === "state"
        ? this.unitKey(defenderId, defenderRegiment.i)
        : this.factionUnitKey(defenderId, defenderRegiment.i);
    const attackerArmy = living.armies?.[attackerKey];
    const defenderArmy = living.armies?.[defenderKey];

    const attackerUnits = toBattleUnits(attackerRegiment.units ?? []);
    const defenderUnits = toBattleUnits(defenderRegiment.units ?? []);
    if (attackerUnits.length === 0 || defenderUnits.length === 0) return;

    const defenderName =
      defenderKind === "state"
        ? (pack.states[defenderId]?.name ?? `State ${defenderId}`)
        : (pack.factions?.[defenderId]?.name ?? `Faction ${defenderId}`);
    const defenderHappiness =
      defenderKind === "state"
        ? (living.states[defenderId]?.happiness ?? 0)
        : (pack.factions?.[defenderId]?.happiness ?? 0);
    const before = {
      attackerHp: armyStrength(attackerRegiment),
      defenderHp: armyStrength(defenderRegiment),
      attackerBlocks: attackerRegiment.units?.length ?? 0,
      defenderBlocks: defenderRegiment.units?.length ?? 0
    };

    const session = initBattleSession({
      config,
      unitTypes: toBattleTypes(types),
      attacker: {
        factionId: this.factionOwnerId(attackerFaction.i),
        armyId: `fm-f${attackerFaction.i}-${attackerRegiment.i}`,
        units: attackerUnits
      },
      defender: {
        factionId: defenderKind === "state" ? defenderId : this.factionOwnerId(defenderId),
        armyId:
          defenderKind === "state"
            ? `fm-${defenderId}-${defenderRegiment.i}`
            : `fm-f${defenderId}-${defenderRegiment.i}`,
        units: defenderUnits
      },
      cell: defenderRegiment.cell,
      regionId: pack.cells.province?.[defenderRegiment.cell] ?? 0,
      assault: false,
      modifiers: this.factionBattleModifiers(
        attackerFaction,
        attackerRegiment,
        defenderRegiment,
        defenderKind,
        defenderId,
        defenderHappiness
      )
    });

    const rng = this.rng("faction:army:battle", attackerRegiment.i * 1000 + defenderRegiment.i, living.tick);
    while (session.status === "active" && session.round < config.battle.maxRounds) {
      stepBattleRound(session, rng.next, {
        attacker: this.battleOrder(session, "attacker", attackerArmy?.stance ?? "march"),
        defender: this.battleOrder(session, "defender", defenderArmy?.stance ?? "fortify")
      });
    }
    const outcome = finalizeBattle(session, rng.next);

    attackerRegiment.units = fromBattleUnits(outcome.attacker.units);
    defenderRegiment.units = fromBattleUnits(outcome.defender.units);
    normalizeArmy(attackerRegiment, maxSlots, types);
    normalizeArmy(defenderRegiment, maxSlots, types);

    if (attackerArmy) attackerArmy.hasFought = true;
    if (defenderArmy) defenderArmy.hasFought = true;

    const winnerRegiment = outcome.winner === "attacker" ? attackerRegiment : defenderRegiment;
    for (const block of winnerRegiment.units ?? []) this.awardBlockExp(block, 5);

    syncRegimentTotals(attackerRegiment, types);
    syncRegimentTotals(defenderRegiment, types);

    const after = {
      attackerHp: armyStrength(attackerRegiment),
      defenderHp: armyStrength(defenderRegiment),
      attackerBlocks: attackerRegiment.units?.length ?? 0,
      defenderBlocks: defenderRegiment.units?.length ?? 0
    };
    if (attackerArmy) {
      attackerArmy.lastBattle = this.battleRecord(
        attackerRegiment,
        "attacker",
        outcome.winner,
        session.round,
        living.tick,
        {
          before: before.attackerHp,
          after: after.attackerHp,
          beforeBlocks: before.attackerBlocks,
          afterBlocks: after.attackerBlocks
        }
      );
    }
    if (defenderArmy) {
      defenderArmy.lastBattle = this.battleRecord(
        defenderRegiment,
        "defender",
        outcome.winner,
        session.round,
        living.tick,
        {
          before: before.defenderHp,
          after: after.defenderHp,
          beforeBlocks: before.defenderBlocks,
          afterBlocks: after.defenderBlocks
        }
      );
    }

    const attackerWiped = armyIsEmpty(attackerRegiment);
    const defenderWiped = armyIsEmpty(defenderRegiment);
    if (defenderWiped) {
      if (attackerWiped && attackerRegiment.units?.[0]) attackerRegiment.units[0].hp = 0.01;
      if (defenderKind === "state") {
        const defenderState = pack.states[defenderId];
        if (defenderState) this.removeRegiment(defenderState, defenderRegiment, living);
      } else {
        const defenderFaction = pack.factions?.[defenderId];
        if (defenderFaction) this.removeFactionRegiment(defenderFaction, defenderRegiment, living);
      }
      if (this.armyHasMelee(attackerRegiment, types)) {
        this.moveRegimentTo(
          attackerRegiment,
          defenderRegiment.cell,
          this.factionOwnerId(attackerFaction.i),
          attackerKey,
          occupancy
        );
      }
      if (defenderKind === "state") {
        const provId = pack.cells?.province?.[defenderRegiment.cell] ?? 0;
        const pSim = provId ? living.provinces?.[provId] : undefined;
        if (pSim) pSim.order = Math.max(0, pSim.order - 2);
      }
    }
    if (attackerWiped && !defenderWiped) this.removeFactionRegiment(attackerFaction, attackerRegiment, living);

    const winnerName = outcome.winner === "attacker" ? attackerFaction.name : defenderName;
    this.pushNews(living, {
      kind: "battle",
      text:
        `${attackerFaction.name} and ${defenderName} fought` +
        (session.labels.length ? ` (${session.labels.slice(0, 2).join(", ")})` : "") +
        `; ${winnerName} held the field after ${session.round} rounds.`,
      cell: defenderRegiment.cell
    });
    this.addBattleMarker(defenderRegiment.cell, `${attackerFaction.name} vs ${defenderName}`);
  }

  private factionBattleModifiers(
    attackerFaction: Faction,
    attackerRegiment: Regiment,
    defenderRegiment: Regiment,
    defenderKind: "state" | "faction",
    defenderId: number,
    defenderHappiness: number
  ): BattleModifiers {
    const living = this.getState();
    const defenderKey =
      defenderKind === "state"
        ? this.unitKey(defenderId, defenderRegiment.i)
        : this.factionUnitKey(defenderId, defenderRegiment.i);
    const defenderArmy = living.armies?.[defenderKey];

    const burgId = Number(pack.cells.burg?.[defenderRegiment.cell] ?? 0);
    const burg = burgId ? pack.burgs[burgId] : undefined;
    const walls =
      burg?.i && !burg.removed && defenderKind === "state" && burg.state === defenderId ? Number(burg.walls ?? 0) : 0;
    const attackerCrossedRiver =
      Number(pack.cells.r?.[attackerRegiment.cell] ?? 0) !== Number(pack.cells.r?.[defenderRegiment.cell] ?? 0) &&
      Number(pack.cells.r?.[defenderRegiment.cell] ?? 0) > 0;
    const attackerLordMult = happinessCombatMultiplier(attackerFaction.happiness ?? 0);
    const defenderLordMult =
      defenderKind === "state"
        ? this.stateCombatMult(defenderId, living)
        : happinessCombatMultiplier(defenderHappiness);
    return {
      walls,
      defenderEncamped: defenderArmy?.stance === "encamp" || defenderArmy?.stance === "fortify",
      defenderAmbushed: defenderArmy?.stance === "ambush",
      attackerCrossedRiver,
      defenderTerrain: terrainDefenseMultiplier(defenderRegiment.cell) > 1,
      labels: [],
      ...(attackerLordMult !== 1 ? { attackerLordMult } : {}),
      ...(defenderLordMult !== 1 ? { defenderLordMult } : {})
    };
  }

  private openFactionAssault(
    faction: Faction,
    army: Regiment,
    burg: Burg,
    living: LivingWorldState,
    occupancy: Map<number, { stateId: number; isUtility: boolean; key: string }[]>
  ): boolean {
    const bSim = living.burgs[burg.i];
    if (!army || !bSim) return false;
    this.ensureCityHp(bSim);
    const key = this.factionUnitKey(faction.i, army.i);
    const armyState = living.armies?.[key];
    if (!armyState) return false;

    const adjacent = (pack.cells.c?.[burg.cell] ?? []).includes(army.cell) || army.cell === burg.cell;
    if (!adjacent) {
      this.moveArmyToward(army, armyState, burg.cell, this.factionOwnerId(faction.i), key, occupancy);
      if (!((pack.cells.c?.[burg.cell] ?? []).includes(army.cell) || army.cell === burg.cell)) return false;
    }

    const { config } = currentContent();
    const types = Military.getUnitTypes();
    const maxSlots = config.military.maxUnitsPerArmy;
    const attackerBlocks = (army.units ?? []).filter(block => block.hp > 0);
    if (attackerBlocks.length === 0) return false;

    const garrison = this.cityGarrisonBlocks(burg);
    if (garrison.length === 0) {
      this.captureFactionBurg(faction, burg, living);
      if (army.cell !== burg.cell) {
        this.moveRegimentTo(army, burg.cell, this.factionOwnerId(faction.i), key, this.armyOccupancy(living));
      }
      return true;
    }

    const before = armyStrength(army);
    const session = initBattleSession({
      config,
      unitTypes: toBattleTypes(types),
      attacker: {
        factionId: this.factionOwnerId(faction.i),
        armyId: `fm-f${faction.i}-${army.i}`,
        units: toBattleUnits(attackerBlocks)
      },
      defender: { factionId: burg.state ?? 0, armyId: null, units: toBattleUnits(garrison) },
      cell: burg.cell,
      regionId: pack.cells.province?.[burg.cell] ?? 0,
      assault: true,
      modifiers: this.factionSiegeModifiers(faction, burg)
    });

    const rng = this.rng("faction:city:siege", faction.i * 1000 + burg.i, living.tick);
    while (session.status === "active" && session.round < config.battle.maxRounds) {
      stepBattleRound(session, rng.next, {
        attacker: this.battleOrder(session, "attacker", "march"),
        defender: this.battleOrder(session, "defender", "fortify")
      });
    }
    const outcome = finalizeBattle(session, rng.next);

    army.units = fromBattleUnits(outcome.attacker.units);
    normalizeArmy(army, maxSlots, types);
    syncRegimentTotals(army, types);
    armyState.hasFought = true;
    const after = armyStrength(army);
    armyState.lastBattle = {
      tick: living.tick,
      cell: burg.cell,
      role: "attacker",
      winner: outcome.winner,
      rounds: session.round,
      lossesHp: Math.max(0, before - after),
      blocksLost: Math.max(0, attackerBlocks.length - (army.units?.length ?? 0)),
      survivorsHp: before > 0 ? after / before : 0
    };

    if (outcome.winner === "attacker") {
      bSim.hp = 0;
      this.captureFactionBurg(faction, burg, living);
      if (armyIsEmpty(army)) {
        this.removeFactionRegiment(faction, army, living);
        return true;
      }
      for (const block of army.units ?? []) this.awardBlockExp(block, 5);
      if (army.cell !== burg.cell) {
        this.moveRegimentTo(army, burg.cell, this.factionOwnerId(faction.i), key, this.armyOccupancy(living));
      }
      return true;
    }

    if (armyIsEmpty(army)) this.removeFactionRegiment(faction, army, living);
    else this.retreatFactionArmy(faction, army, burg.cell, living);
    bSim.hp = Math.max(1, bSim.hp ?? 1);
    return false;
  }

  private factionSiegeModifiers(faction: Faction, burg: Burg): BattleModifiers {
    const living = this.getState();
    const defenderId = burg.state ?? 0;
    const attackerLordMult = happinessCombatMultiplier(faction.happiness ?? 0);
    const defenderLordMult = this.stateCombatMult(defenderId, living);
    return {
      walls: Number(burg.walls ?? 0),
      defenderEncamped: true,
      defenderAmbushed: false,
      attackerCrossedRiver: false,
      defenderTerrain: terrainDefenseMultiplier(burg.cell) > 1,
      labels: [],
      ...(attackerLordMult !== 1 ? { attackerLordMult } : {}),
      ...(defenderLordMult !== 1 ? { defenderLordMult } : {})
    };
  }

  private captureFactionBurg(faction: Faction, burg: Burg, living: LivingWorldState): void {
    if (
      faction.sovereignAmbition &&
      !burg.capital &&
      (faction.seasonsActive >= 4 || faction.researchedTechs.length >= 2)
    ) {
      const ascStateId = this.ascendFactionToState(faction.i, burg.i);
      if (ascStateId !== null) return;
    }
    const rng = this.rng("faction:pillage", faction.i * 1000 + burg.i, living.tick);
    const loot = 50 + rng.d(50);
    faction.treasury = Math.round((Number(faction.treasury ?? 0) + loot) * 100) / 100;
    const bSim = living.burgs[burg.i];
    const provId = pack.cells?.province?.[burg.cell] ?? 0;
    const pSim = provId ? living.provinces?.[provId] : undefined;
    if (bSim) bSim.unrest = Math.min(100, (bSim.unrest ?? 0) + 8);
    if (pSim) pSim.order = Math.max(0, pSim.order - 5);
    if (bSim) bSim.hp = 1;
    this.pushNews(living, {
      kind: "faction",
      text: `${faction.name} pillaged ${burg.name ?? "a settlement"} and seized ${loot} gold!`,
      cell: burg.cell,
      burgId: burg.i
    });
  }

  private retreatFactionArmy(faction: Faction, regiment: Regiment, fromCell: number, living: LivingWorldState): void {
    const key = this.factionUnitKey(faction.i, regiment.i);
    const occupancy = this.armyOccupancy(living);
    const candidates = (pack.cells.c?.[fromCell] ?? [])
      .filter(cell => {
        const info = getCellTerrainInfo(cell);
        if (regiment.n === 1 ? !info.isWater : info.isWater || info.isMountain) return false;
        return !hasStackingConflict(occupancy.get(cell) ?? [], this.factionOwnerId(faction.i), false, key);
      })
      .sort((a, b) => a - b);
    const target = candidates[0];
    if (target !== undefined) this.moveRegimentTo(regiment, target, this.factionOwnerId(faction.i), key, occupancy);
  }

  /** Battle modifiers from stance, terrain, river, walls and the lord multipliers. */
  private armyBattleModifiers(
    attackerState: State,
    attackerRegiment: Regiment,
    defenderState: State,
    defenderRegiment: Regiment
  ): BattleModifiers {
    const living = this.getState();
    const attackerArmy = living.armies?.[this.unitKey(attackerState.i, attackerRegiment.i)];
    const defenderArmy = living.armies?.[this.unitKey(defenderState.i, defenderRegiment.i)];

    const burgId = Number(pack.cells.burg?.[defenderRegiment.cell] ?? 0);
    const burg = burgId ? pack.burgs[burgId] : undefined;
    const walls = burg?.i && !burg.removed && burg.state === defenderState.i ? Number(burg.walls ?? 0) : 0;
    const attackerCrossedRiver =
      Number(pack.cells.r?.[attackerRegiment.cell] ?? 0) !== Number(pack.cells.r?.[defenderRegiment.cell] ?? 0) &&
      Number(pack.cells.r?.[defenderRegiment.cell] ?? 0) > 0;

    const attackerLordMult = this.stateCombatMult(attackerState.i, living);
    const defenderLordMult = this.stateCombatMult(defenderState.i, living);

    return {
      walls,
      defenderEncamped: defenderArmy?.stance === "encamp" || defenderArmy?.stance === "fortify",
      // battle.ts reads this as "the attacker is ambushing": +30% on contact.
      defenderAmbushed: attackerArmy?.stance === "ambush",
      attackerCrossedRiver,
      defenderTerrain: terrainDefenseMultiplier(defenderRegiment.cell) > 1,
      labels: [],
      ...(attackerLordMult !== 1 ? { attackerLordMult } : {}),
      ...(defenderLordMult !== 1 ? { defenderLordMult } : {})
    };
  }

  /** Deterministic round orders (§8.4): stance on contact, then react to the power curve. */
  private battleOrder(session: BattleSession, side: "attacker" | "defender", stance: ArmyStance): BattleTacticalOrder {
    const units = side === "attacker" ? session.attackerUnits : session.defenderUnits;
    const blocks = fromBattleUnits(units);
    if (session.round === 0) return chooseOrder(blocks, session.unitTypes, stance);

    const last = session.history.at(-1);
    const frac = side === "attacker" ? (last?.attackerPowerFrac ?? 1) : (last?.defenderPowerFrac ?? 1);
    const cavalry = blocks.some(block => session.unitTypes[block.type]?.category === "cavalry");
    if (frac < session.config.battle.routThreshold + 0.15 && cavalry) return "charge";
    return "balanced";
  }

  private armyHasMelee(regiment: Regiment, types: Record<string, UnitType>): boolean {
    return (regiment.units ?? []).some(block => {
      if (block.hp <= 0) return false;
      const category = types[block.type]?.category;
      return category !== "ranged" && category !== "artillery" && category !== "spellcaster";
    });
  }

  private battleRecord(
    regiment: Regiment,
    role: "attacker" | "defender",
    winner: "attacker" | "defender",
    rounds: number,
    tick: number,
    hp: { before: number; after: number; beforeBlocks: number; afterBlocks: number }
  ): ArmyBattleRecord {
    return {
      tick,
      cell: regiment.cell,
      role,
      winner,
      rounds,
      lossesHp: Math.max(0, hp.before - hp.after),
      blocksLost: Math.max(0, hp.beforeBlocks - hp.afterBlocks),
      survivorsHp: hp.before > 0 ? Math.max(0, Math.min(1, hp.after / hp.before)) : 0
    };
  }

  private awardBlockExp(block: { hp: number; exp: number }, amount: number): void {
    if (block.hp <= 0) return;
    block.exp = Math.min(9, block.exp + Math.max(1, Math.round(amount / 3)));
  }

  /** City HP: 200 base plus Walls/Castle/Arsenal/Military Base. */
  private ensureCityHp(bSim: BurgSimState): void {
    if (bSim.maxHp !== undefined && bSim.hp !== undefined) return;
    let maxHp = CITY_BASE_HP;
    for (const id of bSim.civBuildings ?? []) maxHp += CIV_BUILDING_BY_ID[id]?.cityHealth ?? 0;
    bSim.maxHp = maxHp;
    bSim.hp = maxHp;
  }

  /** The burg's roster garrison as blocks at full capability (Phase D siege defender). */
  private cityGarrisonBlocks(burg: Burg): ArmyBlock[] {
    return fromBattleUnitsMen(this.burgDefenders(burg), Military.getUnitTypes());
  }

  /** Each Major Burg removes one block step from the weakest hostile army in range 2. */
  private stepCityStrikes(living: LivingWorldState): void {
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || !burg.state) continue;
      if (!isMajorBurg(burg)) continue;
      const bSim = living.burgs[burg.i];
      if (!bSim || bSim.hasStruckThisTurn || (bSim.hp ?? 0) <= 0) continue;

      const state = pack.states[burg.state];
      if (!state?.i || state.removed || !this.stateAtWar(state)) continue;

      const distances = this.cellHopDistances(burg.cell, 2);
      const types = Military.getUnitTypes();
      let targetState: { state: State; regiment: Regiment } | null = null;
      let targetFaction: { faction: Faction; regiment: Regiment } | null = null;
      let targetHp = 2;

      for (const [candidate, hops] of distances) {
        if (hops === 0) continue;
        for (const other of pack.states) {
          if (!other?.i || other.removed || other.i === burg.state) continue;
          if (!this.isAtWar(state.i, other.i)) continue;
          for (const regiment of other.military ?? []) {
            if (regiment.cell !== candidate) continue;
            if (!living.armies?.[this.unitKey(other.i, regiment.i)]) continue;
            const hp = armyHp(regiment);
            if (hp > 0 && hp < targetHp) {
              targetState = { state: other, regiment };
              targetFaction = null;
              targetHp = hp;
            }
          }
        }
        for (const faction of Factions.active()) {
          if (!this.isFactionEnemyOfState(faction, state.i)) continue;
          for (const regiment of faction.military ?? []) {
            if (regiment.cell !== candidate) continue;
            if (!living.armies?.[this.factionUnitKey(faction.i, regiment.i)]) continue;
            const hp = armyHp(regiment);
            if (hp > 0 && hp < targetHp) {
              targetFaction = { faction, regiment };
              targetState = null;
              targetHp = hp;
            }
          }
        }
      }

      const target = targetFaction
        ? { faction: targetFaction.faction, regiment: targetFaction.regiment, isFaction: true as const }
        : targetState
          ? { state: targetState.state, regiment: targetState.regiment, isFaction: false as const }
          : null;
      if (!target) continue;

      let block: ArmyBlock | undefined;
      for (const candidate of target.regiment.units ?? []) {
        if (candidate.hp <= 0) continue;
        if (!block || candidate.hp > block.hp || (candidate.hp === block.hp && candidate.type < block.type)) {
          block = candidate;
        }
      }
      if (!block) continue;
      block.hp = Math.max(0, block.hp - CITY_STRIKE_HP);
      bSim.hasStruckThisTurn = true;

      target.regiment.units = (target.regiment.units ?? []).filter(entry => entry.hp > 0);
      syncRegimentTotals(target.regiment, types);
      if (armyIsEmpty(target.regiment)) {
        if (target.isFaction) this.removeFactionRegiment(target.faction, target.regiment, living);
        else this.removeRegiment(target.state, target.regiment, living);
      }
    }

    for (const entry of this.collectFactionNodes()) {
      if (entry.sim.hasStruckThisTurn || (entry.sim.hp ?? 0) <= 0) continue;
      const distances = this.cellHopDistances(entry.node.cell, 2);
      const types = Military.getUnitTypes();
      let targetState: { state: State; regiment: Regiment } | null = null;
      let targetFaction: { faction: Faction; regiment: Regiment } | null = null;
      let targetHp = 2;
      for (const [candidate, hops] of distances) {
        if (hops === 0) continue;
        for (const other of pack.states) {
          if (!other?.i || other.removed) continue;
          if (!this.isFactionEnemyOfState(entry.faction, other.i)) continue;
          for (const regiment of other.military ?? []) {
            if (regiment.cell !== candidate) continue;
            if (!living.armies?.[this.unitKey(other.i, regiment.i)]) continue;
            const hp = armyHp(regiment);
            if (hp > 0 && hp < targetHp) {
              targetState = { state: other, regiment };
              targetFaction = null;
              targetHp = hp;
            }
          }
        }
        for (const other of Factions.active()) {
          if (other.i === entry.faction.i) continue;
          if (!this.isFactionEnemyOfFaction(entry.faction, other)) continue;
          for (const regiment of other.military ?? []) {
            if (regiment.cell !== candidate) continue;
            if (!living.armies?.[this.factionUnitKey(other.i, regiment.i)]) continue;
            const hp = armyHp(regiment);
            if (hp > 0 && hp < targetHp) {
              targetFaction = { faction: other, regiment };
              targetState = null;
              targetHp = hp;
            }
          }
        }
      }
      const target = targetFaction
        ? { faction: targetFaction.faction, regiment: targetFaction.regiment, isFaction: true as const }
        : targetState
          ? { state: targetState.state, regiment: targetState.regiment, isFaction: false as const }
          : null;
      if (!target) continue;
      let block: ArmyBlock | undefined;
      for (const candidate of target.regiment.units ?? []) {
        if (candidate.hp <= 0) continue;
        if (!block || candidate.hp > block.hp || (candidate.hp === block.hp && candidate.type < block.type)) {
          block = candidate;
        }
      }
      if (!block) continue;
      block.hp = Math.max(0, block.hp - CITY_STRIKE_HP);
      entry.sim.hasStruckThisTurn = true;
      target.regiment.units = (target.regiment.units ?? []).filter(e => e.hp > 0);
      syncRegimentTotals(target.regiment, types);
      if (armyIsEmpty(target.regiment)) {
        if (target.isFaction) this.removeFactionRegiment(target.faction, target.regiment, living);
        else this.removeRegiment(target.state, target.regiment, living);
      }
    }
  }

  /** The cell a regiment should march toward this tick. */
  /**
   * Goal-driven army targeting (Phase C of the army integration): the
   * state's agenda IS the goal — its burg/province target decides where this
   * army marches. With no goal, an at-war army hunts the nearest enemy
   * regiment inside the aggro radius.
   */
  private tacticalTarget(state: State, living: LivingWorldState, fromCell: number): number | null {
    const agenda = living.states[state.i]?.agenda;
    const burgId = agenda?.targetBurgId;
    if (burgId !== undefined) {
      const burg = pack.burgs[burgId];
      if (burg?.i && !burg.removed) return burg.cell;
    }
    if (agenda?.kind === "suppress_faction" && agenda.targetCell !== undefined) {
      return agenda.targetCell;
    }
    if (agenda?.targetProvinceId !== undefined) {
      const province = pack.provinces?.[agenda.targetProvinceId];
      if (province?.center !== undefined) return province.center;
    }

    // With no order, hunt the nearest at-war enemy regiment inside the aggro radius.
    let best: { cell: number; distance: number } | null = null;
    const reach = this.cellHopDistances(fromCell, UNIT_AGGRO_RANGE);
    for (const other of pack.states) {
      if (!other?.i || other.removed || other.i === state.i) continue;
      if (!this.isAtWar(state.i, other.i)) continue;
      for (const regiment of other.military ?? []) {
        const distance = reach.get(regiment.cell);
        if (distance === undefined) continue;
        if (!living.armies?.[this.unitKey(other.i, regiment.i)] || armyIsEmpty(regiment)) continue;
        if (!best || distance < best.distance || (distance === best.distance && regiment.cell < best.cell)) {
          best = { cell: regiment.cell, distance };
        }
      }
    }
    // Suppression: also hunt hostile/clandestine faction guards inside aggro range.
    for (const faction of Factions.active()) {
      if (!this.isFactionHostileToState(faction, state.i)) continue;
      for (const regiment of faction.military ?? []) {
        const distance = reach.get(regiment.cell);
        if (distance === undefined) continue;
        if (!living.armies?.[this.factionUnitKey(faction.i, regiment.i)] || armyIsEmpty(regiment)) continue;
        if (!best || distance < best.distance || (distance === best.distance && regiment.cell < best.cell)) {
          best = { cell: regiment.cell, distance };
        }
      }
    }
    return best?.cell ?? null;
  }

  /** Autonomous Builder: improve the best owned tile in range, then connect roads. */
  private stepBuilder(
    state: State,
    regiment: Regiment,
    unit: UnitSimState,
    living: LivingWorldState,
    occupancy: Map<number, { stateId: number; isUtility: boolean; key: string }[]>
  ): boolean {
    const key = this.unitKey(state.i, regiment.i);

    if (unit.workOrder) {
      unit.workOrder.turnsLeft -= 1;
      if (unit.workOrder.turnsLeft <= 0) {
        this.completeImprovement(regiment.cell, unit.workOrder.improvementId, state, living);
        unit.workOrder = null;
      }
      return true;
    }

    const target = this.pickBuilderTarget(state, regiment.cell, living);
    if (!target) {
      if (!Routes.isConnected(regiment.cell)) {
        try {
          Routes.connect(regiment.cell);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }

    if (regiment.cell !== target.cell) {
      return this.moveUnitToward(regiment, unit, target.cell, state.i, key, occupancy);
    }

    unit.workOrder = {
      improvementId: target.improvementId,
      turnsLeft: Math.max(1, CIV_IMPROVEMENT_BY_ID[target.improvementId]?.buildTurns ?? 5)
    };
    return true;
  }

  /** Best unimproved owned cell within builder range and the improvement it wants. */
  private pickBuilderTarget(
    state: State,
    fromCell: number,
    living: LivingWorldState
  ): { cell: number; improvementId: string } | null {
    const techs = new Set(living.states[state.i]?.researchedTechs ?? []);
    const distances = this.cellHopDistances(fromCell, BUILDER_RANGE);
    let best: { cell: number; improvementId: string; score: number } | null = null;

    for (const [cell, hops] of distances) {
      if (pack.cells.state?.[cell] !== state.i) continue;
      if (living.cells?.[cell]?.improvement) continue;
      const improvementId = this.desiredImprovement(cell);
      if (!improvementId) continue;
      const def = CIV_IMPROVEMENT_BY_ID[improvementId];
      if (def?.requiredTech && !techs.has(def.requiredTech)) continue;

      const resource = getCellResource(cell, state.i, living);
      const score =
        (resource?.revealed ? 3 : resource ? 2 : 0) +
        (getCellYields(cell, state.i, living).food + getCellYields(cell, state.i, living).production) / 10 -
        hops / 10;
      if (!best || score > best.score || (score === best.score && cell < best.cell)) {
        best = { cell, improvementId, score };
      }
    }

    return best ? { cell: best.cell, improvementId: best.improvementId } : null;
  }

  /** Improvement an unimproved owned cell wants, or null when nothing fits. */
  private desiredImprovement(cell: number): string | null {
    const info = getCellTerrainInfo(cell);
    if (info.isWater) {
      return Number(pack.cells.harbor?.[cell] ?? 0) > 0 ? "fishing_boats" : null;
    }
    if (!info.isWorkable) return null;

    const resource = getCellResource(cell);
    const resourceId = resource?.resourceId ?? "";
    if (resource) {
      if (resource.class === "luxury") return "plantation";
      if (resource.class === "strategic") return "mine";
      if (["stone", "marble"].includes(resourceId)) return "quarry";
      if (["cattle", "sheep", "horses"].includes(resourceId)) return "pasture";
      if (["ivory", "furs"].includes(resourceId)) return "camp";
      return "farm";
    }

    const biome = Number(pack.cells.biome?.[cell] ?? 0);
    if (biome === 6 || biome === 8 || biome === 9) return "lumber_mill";
    if (info.isHill) return "mine";
    return "farm";
  }

  /** Finish a tile improvement and (for roads) link the native route network. */
  private completeImprovement(cell: number, improvementId: string, state: State, living: LivingWorldState): void {
    living.cells ??= {};
    living.cells[cell] = { ...(living.cells[cell] ?? {}), improvement: improvementId, pillaged: false, progress: {} };

    if (CIV_IMPROVEMENT_BY_ID[improvementId]?.route && pack.cells.routes) {
      try {
        Routes.connect(cell);
      } catch {
        // stripped packs have no route grid
      }
    }

    this.pushNews(living, {
      kind: "develop",
      text: `${state.name} built a ${CIV_IMPROVEMENT_BY_ID[improvementId]?.name ?? improvementId}.`,
      cell,
      stateId: state.i
    });
  }

  /** Autonomous Settler: found a burg on a valid owned cell. */
  private stepSettler(
    state: State,
    regiment: Regiment,
    unit: UnitSimState,
    living: LivingWorldState,
    occupancy: Map<number, { stateId: number; isUtility: boolean; key: string }[]>
  ): boolean {
    if (this.canFoundBurg(regiment.cell, state)) {
      if (this.foundBurg(state, regiment.cell, living) === null) return false;
      this.removeRegiment(state, regiment, living);
      return true;
    }

    const target = this.pickSettlerTarget(state, regiment.cell, living);
    if (target === null) return false;
    return this.moveUnitToward(regiment, unit, target, state.i, this.unitKey(state.i, regiment.i), occupancy);
  }

  /** Faction Builder: improve a cell worked by this faction's HQ/outposts. */
  private stepFactionBuilder(
    faction: Faction,
    regiment: Regiment,
    unit: UnitSimState,
    living: LivingWorldState,
    occupancy: Map<number, { stateId: number; isUtility: boolean; key: string }[]>
  ): boolean {
    const key = this.factionUnitKey(faction.i, regiment.i);
    if (unit.workOrder) {
      unit.workOrder.turnsLeft -= 1;
      if (unit.workOrder.turnsLeft <= 0) {
        this.completeFactionImprovement(regiment.cell, unit.workOrder.improvementId, faction, living);
        unit.workOrder = null;
      }
      return true;
    }

    const target = this.pickFactionBuilderTarget(faction, regiment.cell, living);
    if (!target) {
      if (!Routes.isConnected(regiment.cell)) {
        try {
          Routes.connect(regiment.cell);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }

    if (regiment.cell !== target.cell) {
      return this.moveUnitToward(regiment, unit, target.cell, this.factionOwnerId(faction.i), key, occupancy);
    }

    unit.workOrder = {
      improvementId: target.improvementId,
      turnsLeft: Math.max(1, CIV_IMPROVEMENT_BY_ID[target.improvementId]?.buildTurns ?? 5)
    };
    return true;
  }

  private pickFactionBuilderTarget(
    faction: Faction,
    fromCell: number,
    living: LivingWorldState
  ): { cell: number; improvementId: string } | null {
    const techs = new Set(faction.researchedTechs ?? []);
    const distances = this.cellHopDistances(fromCell, BUILDER_RANGE);
    const worked = new Set<number>();
    for (const node of [faction.hq, ...(faction.outposts ?? [])]) {
      for (const cell of node?.sim?.workedCells ?? []) worked.add(cell);
    }
    let best: { cell: number; improvementId: string; score: number } | null = null;

    for (const [cell, hops] of distances) {
      if (living.cells?.[cell]?.improvement) continue;
      if (worked.size > 0 && !worked.has(cell)) continue;
      const improvementId = this.desiredImprovement(cell);
      if (!improvementId) continue;
      const def = CIV_IMPROVEMENT_BY_ID[improvementId];
      if (def?.requiredTech && !techs.has(def.requiredTech)) continue;

      const hostStateId = pack.cells.state?.[cell] ?? 0;
      const resource = getCellResource(cell, hostStateId, living);
      const score =
        (resource?.revealed ? 3 : resource ? 2 : 0) +
        (getCellYields(cell, hostStateId, living).food + getCellYields(cell, hostStateId, living).production) / 10 -
        hops / 10;
      if (!best || score > best.score || (score === best.score && cell < best.cell)) {
        best = { cell, improvementId, score };
      }
    }

    return best ? { cell: best.cell, improvementId: best.improvementId } : null;
  }

  private completeFactionImprovement(
    cell: number,
    improvementId: string,
    faction: Faction,
    living: LivingWorldState
  ): void {
    living.cells ??= {};
    living.cells[cell] = { ...(living.cells[cell] ?? {}), improvement: improvementId, pillaged: false, progress: {} };

    if (CIV_IMPROVEMENT_BY_ID[improvementId]?.route && pack.cells.routes) {
      try {
        Routes.connect(cell);
      } catch {
        // stripped packs have no route grid
      }
    }

    this.pushNews(living, {
      kind: "develop",
      text: `${faction.name} built a ${CIV_IMPROVEMENT_BY_ID[improvementId]?.name ?? improvementId}.`,
      cell,
      ...(faction.hq?.burgId ? { burgId: faction.hq.burgId } : {})
    });
  }

  /** Faction Settler/Envoy: march to a target burg and establish an outpost on arrival. */
  private stepFactionSettler(
    faction: Faction,
    regiment: Regiment,
    unit: UnitSimState,
    living: LivingWorldState,
    occupancy: Map<number, { stateId: number; isUtility: boolean; key: string }[]>
  ): boolean {
    const burgId = Number(pack.cells.burg?.[regiment.cell] ?? 0);
    const burg = burgId ? pack.burgs?.[burgId] : undefined;
    if (burg?.i && !burg.removed && burg.cell === regiment.cell && !this.factionNodesAtBurg(faction.i, burg.i)) {
      if (!this.foundFactionOutpost(faction, burg, living)) return false;
      this.removeFactionRegiment(faction, regiment, living);
      return true;
    }

    const target = this.pickFactionSettlerTarget(faction, regiment.cell, living);
    if (target === null) return false;
    return this.moveUnitToward(
      regiment,
      unit,
      target,
      this.factionOwnerId(faction.i),
      this.factionUnitKey(faction.i, regiment.i),
      occupancy
    );
  }

  private pickFactionSettlerTarget(faction: Faction, fromCell: number, _living: LivingWorldState): number | null {
    const distances = this.cellHopDistances(fromCell, 40);
    const candidates: { cell: number; score: number; distance: number }[] = [];
    for (const burg of pack.burgs ?? []) {
      if (!burg?.i || burg.removed) continue;
      if (this.factionNodesAtBurg(faction.i, burg.i)) continue;
      // Skip burgs holding a foreign combat army: the settler cannot share the cell (1UPT).
      const occupiedByCombat = [...(pack.states ?? []), ...Factions.active()].some(polity => {
        if (polity.i === faction.i) return false;
        const military = (polity as { military?: Regiment[] }).military ?? [];
        return military.some(
          reg => reg.cell === burg.cell && !armyIsEmpty(reg) && !isCivilianUnit((reg.type ?? "").toLowerCase())
        );
      });
      if (occupiedByCombat) continue;
      const distance = distances.get(burg.cell);
      if (distance === undefined) continue;
      let score = (burg.population ?? 0) - distance * 2;
      if (faction.category === "commercial" && burg.port) score += 20;
      if (faction.category === "underworld") score += (burg.population ?? 0) * 0.5;
      candidates.push({ cell: burg.cell, score, distance });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score || a.distance - b.distance || a.cell - b.cell);
    return candidates[0]!.cell;
  }

  private foundFactionOutpost(faction: Faction, burg: Burg, living: LivingWorldState): boolean {
    const currentYear = options.map?.lore?.calendar?.year ?? 1000;
    const startingAsset =
      faction.category === "commercial"
        ? "trade_depot"
        : faction.category === "adventuring"
          ? "chapter_lodge"
          : faction.category === "underworld"
            ? "safe_house"
            : faction.category === "religious"
              ? "wayside_shrine"
              : "muster_camp";
    faction.outposts ??= [];
    faction.outposts.push({
      burgId: burg.i,
      cell: burg.cell,
      tier: 1,
      influence: 35,
      secrecy: faction.allegiance === "clandestine" ? 60 : 0,
      assets: [startingAsset],
      establishedYear: currentYear
    });
    ensureFactionNodeSim(faction.outposts[faction.outposts.length - 1]!, false);

    this.pushNews(living, {
      kind: "faction",
      text: `${faction.name} established a new outpost in ${burg.name ?? "a settlement"}!`,
      cell: burg.cell,
      burgId: burg.i
    });
    return true;
  }

  private canFoundBurg(cell: number, state: State): boolean {
    if (pack.cells.state?.[cell] !== state.i) return false;
    if (Number(pack.cells.burg?.[cell] ?? 0) > 0) return false;
    const info = getCellTerrainInfo(cell);
    if (!info.isWorkable || info.isWater) return false;

    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed) continue;
      if (this.cellHopDistances(cell, 3).has(burg.cell)) return false;
    }
    return true;
  }

  private pickSettlerTarget(state: State, fromCell: number, living: LivingWorldState): number | null {
    const distances = this.cellHopDistances(fromCell, 8);
    let best: { cell: number; score: number } | null = null;
    for (const [cell] of distances) {
      if (!this.canFoundBurg(cell, state)) continue;
      const yields = getCellYields(cell, state.i, living);
      const score = yields.food * 2 + yields.production + yields.gold;
      if (!best || score > best.score || (score === best.score && cell < best.cell)) best = { cell, score };
    }
    return best?.cell ?? null;
  }

  private foundBurg(state: State, cell: number, living: LivingWorldState): number | null {
    const point = pack.cells.p?.[cell];
    if (!point) return null;

    let burgId: number | null = null;
    try {
      burgId = Burgs.add(point[0], point[1]);
    } catch {
      // Stubbed packs have no Voronoi grid or route network; found it directly.
      burgId = null;
    }
    if (burgId === null || !pack.burgs[burgId]) {
      burgId = pack.burgs.length;
      pack.burgs.push({
        i: burgId,
        cell,
        x: point[0],
        y: point[1],
        state: state.i,
        culture: state.culture,
        name: Names.getCulture(state.culture),
        population: 2,
        capital: 0,
        port: 0,
        tags: []
      } as Burg);
      if (pack.cells.burg) pack.cells.burg[cell] = burgId;
    }

    const burg = pack.burgs[burgId];
    if (!burg) return null;
    burg.state = state.i;
    burg.culture = state.culture;
    burg.population = 2;

    this.pushNews(living, {
      kind: "colonize",
      text: `${state.name} founded ${burg.name ?? "a new settlement"}.`,
      cell,
      stateId: state.i,
      burgId
    });
    return burgId;
  }

  /** OpenCiv city assault: march to the walls, then a 1UPT siege round. */
  /** Storm a city: the garrison fights as blocks, the field army is the attacker (living-openciv-armies.md §9). */
  private openCivAssault(state: State, burg: Burg): boolean {
    const living = this.getState();
    const bSim = living.burgs[burg.i];
    const army = this.fieldArmy(state);
    if (!army || !bSim) return false;

    this.ensureCityHp(bSim);
    const key = this.unitKey(state.i, army.i);
    const armyState = living.armies?.[key];
    if (!armyState) return false;

    const adjacent = (pack.cells.c?.[burg.cell] ?? []).includes(army.cell);
    if (!adjacent) {
      const occupancy = this.armyOccupancy(living);
      this.moveArmyToward(army, armyState, burg.cell, state.i, key, occupancy);
      if (!(pack.cells.c?.[burg.cell] ?? []).includes(army.cell)) return false;
    }

    const { config } = currentContent();
    const types = Military.getUnitTypes();
    const maxSlots = config.military.maxUnitsPerArmy;
    const attackerBlocks = (army.units ?? []).filter(block => block.hp > 0);
    if (attackerBlocks.length === 0) return false;

    const garrison = this.cityGarrisonBlocks(burg);
    if (garrison.length === 0) {
      // Undefended: walk in.
      this.captureCity(state, burg, living, "occupy");
      if (army.cell !== burg.cell) {
        this.moveRegimentTo(army, burg.cell, state.i, key, this.armyOccupancy(living));
      }
      return true;
    }

    // Siege progression: track ongoing siege for this state.
    const siegeStateId = bSim.siegeStateId ?? 0;
    if (siegeStateId !== state.i) {
      bSim.siegeStateId = state.i;
      bSim.siegeProgress = 0;
      bSim.siegeSupplies = Number(burg.walls ?? 0) * 20;
    }
    bSim.siegeProgress = (bSim.siegeProgress ?? 0) + 1;

    // Apply garrison weakening (15% per season, floor 40%).
    const weakenFactor = this.siegeWeakenFactor(bSim);
    if (weakenFactor < 1) {
      for (const block of garrison) {
        block.hp = Math.max(0.4, block.hp * weakenFactor);
      }
    }

    // Decide: assault or continue besieging; a martial ruler presses the siege harder (§5.2)
    const odds = this.estimateSiegeOdds(state, army, garrison, types, burg);
    const momentum = (bSim.siegeProgress ?? 0) * stateEconomyModifiers(state.i).siege;
    const shouldAssault = momentum >= 2 || odds >= 40;
    if (!shouldAssault) {
      bSim.hp = Math.max(1, bSim.hp ?? 1);
      return true;
    }

    const before = armyStrength(army);
    const session = initBattleSession({
      config,
      unitTypes: toBattleTypes(types),
      attacker: { factionId: state.i, armyId: `fm-${state.i}-${army.i}`, units: toBattleUnits(attackerBlocks) },
      defender: { factionId: burg.state ?? 0, armyId: null, units: toBattleUnits(garrison) },
      cell: burg.cell,
      regionId: pack.cells.province?.[burg.cell] ?? 0,
      assault: true,
      modifiers: this.siegeModifiers(state, burg)
    });

    const rng = this.rng("city:siege", state.i * 1000 + burg.i, living.tick);
    while (session.status === "active" && session.round < config.battle.maxRounds) {
      stepBattleRound(session, rng.next, {
        attacker: this.battleOrder(session, "attacker", "march"),
        defender: this.battleOrder(session, "defender", "fortify")
      });
    }
    const outcome = finalizeBattle(session, rng.next);

    army.units = fromBattleUnits(outcome.attacker.units);
    normalizeArmy(army, maxSlots, types);
    syncRegimentTotals(army, types);
    armyState.hasFought = true;
    const after = armyStrength(army);
    armyState.lastBattle = {
      tick: living.tick,
      cell: burg.cell,
      role: "attacker",
      winner: outcome.winner,
      rounds: session.round,
      lossesHp: Math.max(0, before - after),
      blocksLost: Math.max(0, attackerBlocks.length - (army.units?.length ?? 0)),
      survivorsHp: before > 0 ? after / before : 0
    };

    if (outcome.winner === "attacker") {
      bSim.hp = 0;
      const policy = this.chooseCapturePolicy(state, burg, living);
      this.captureCity(state, burg, living, policy);
      if (armyIsEmpty(army)) {
        this.removeRegiment(state, army, living);
        return true;
      }
      for (const block of army.units ?? []) this.awardBlockExp(block, 5);
      if (army.cell !== burg.cell) {
        const occupancy = this.armyOccupancy(living);
        this.moveRegimentTo(army, burg.cell, state.i, key, occupancy);
      }
      return true;
    }

    // Repulsed: survivors fall back one cell; the city keeps its HP.
    if (armyIsEmpty(army)) this.removeRegiment(state, army, living);
    else {
      this.retreatArmy(state, army, burg.cell, living);
      // Lift siege if the army is no longer adjacent.
      const stillAdjacent = (pack.cells.c?.[burg.cell] ?? []).includes(army.cell);
      if (!stillAdjacent) {
        bSim.siegeStateId = 0;
        bSim.siegeProgress = 0;
        bSim.siegeSupplies = 0;
      }
    }
    bSim.hp = Math.max(1, bSim.hp ?? 1);
    return false;
  }

  /** Public view of a burg's siege garrison (HUD / tests). */
  cityGarrison(burgId: number): ArmyBlock[] {
    const burg = pack.burgs[burgId];
    return burg?.i && !burg.removed ? this.cityGarrisonBlocks(burg) : [];
  }

  /** Garrison weaken factor for an ongoing siege: 15% per season, floor 40%. */
  private siegeWeakenFactor(bSim: BurgSimState): number {
    const progress = bSim.siegeProgress ?? 0;
    const supplies = bSim.siegeSupplies ?? 0;
    // Siege supplies buffer: each 20 HD blocks one season of attrition.
    if (supplies > 0) {
      bSim.siegeSupplies = Math.max(0, supplies - 10);
      return 1;
    }
    const factor = 1 - progress * 0.15;
    return Math.max(0.4, factor);
  }

  /** Estimate siege odds for the assault decision. */
  private estimateSiegeOdds(
    state: State,
    army: Regiment,
    garrison: ArmyBlock[],
    types: Record<string, UnitType>,
    burg: Burg
  ): number {
    try {
      const { config } = currentContent();
      const battleTypes = toBattleTypes(types);
      const odds = estimateOdds(
        config,
        { factionId: state.i, armyId: null, units: toBattleUnits(army.units ?? []) },
        { factionId: burg.state ?? 0, armyId: null, units: toBattleUnits(garrison) },
        this.siegeModifiers(state, burg),
        battleTypes
      );
      return odds.attackerWinPct;
    } catch {
      return 50;
    }
  }

  /** Choose a capture policy based on ruler personality and war state. */
  private chooseCapturePolicy(state: State, burg: Burg, living: LivingWorldState): string {
    const sSim = living.states[state.i];
    const warExhaustion = sSim?.warExhaustion ?? 0;
    const happiness = sSim?.happiness ?? 0;
    const wasCapital = Boolean(burg.capital);
    if (wasCapital && warExhaustion > 30) return "sack";
    if (happiness < -5) return "sack";
    if (warExhaustion > 20) return "loot";
    return "occupy";
  }

  /** §4.4: a state's forces fight at happiness × battle-upkeep strength. */
  private stateCombatMult(stateId: number, living: LivingWorldState): number {
    return happinessCombatMultiplier(living.states[stateId]?.happiness) * Military.getLivingBattleUpkeep(stateId);
  }

  /** Modifiers for a city assault: walls, bracing garrison, terrain and lord multipliers. */
  private siegeModifiers(state: State, burg: Burg): BattleModifiers {
    const living = this.getState();
    const defenderId = burg.state ?? 0;
    const attackerLordMult = this.stateCombatMult(state.i, living);
    const defenderLordMult = this.stateCombatMult(defenderId, living);
    return {
      walls: Number(burg.walls ?? 0),
      defenderEncamped: true,
      defenderAmbushed: false,
      attackerCrossedRiver: false,
      defenderTerrain: terrainDefenseMultiplier(burg.cell) > 1,
      labels: [],
      ...(attackerLordMult !== 1 ? { attackerLordMult } : {}),
      ...(defenderLordMult !== 1 ? { defenderLordMult } : {})
    };
  }

  /** Move a repulsed army to the nearest friendly or unowned adjacent cell. */
  private retreatArmy(state: State, regiment: Regiment, fromCell: number, living: LivingWorldState): void {
    const key = this.unitKey(state.i, regiment.i);
    const occupancy = this.armyOccupancy(living);
    const candidates = (pack.cells.c?.[fromCell] ?? [])
      .filter(cell => {
        const info = getCellTerrainInfo(cell);
        if (regiment.n === 1 ? !info.isWater : info.isWater || info.isMountain) return false;
        const owner = pack.cells.state?.[cell] ?? 0;
        if (owner && owner !== state.i) return false;
        return !hasStackingConflict(occupancy.get(cell) ?? [], state.i, false, key);
      })
      .sort((a, b) => a - b);
    const target = candidates[0];
    if (target !== undefined) this.moveRegimentTo(regiment, target, state.i, key, occupancy);
  }

  /** §5.3 city capture: half the citizens, reset HP, clear queue, destroy national wonders. */
  private captureCity(state: State, burg: Burg, living: LivingWorldState, policy: string = "occupy"): void {
    const previousStateId = burg.state ?? 0;
    const wasCapital = Boolean(burg.capital);
    this.annexBurg(state.i, burg, true);
    this.logConquest(state, burg, true);

    const bSim = living.burgs[burg.i];
    if (!bSim) return;

    if (wasCapital) this.relocateCapital(previousStateId, burg);

    // Base booty from city population.
    const baseBooty = (bSim.citizens ?? 1) * 10;

    bSim.citizens = Math.max(1, Math.floor((bSim.citizens ?? 1) / 2));
    burg.population = populationFromCitizens(bSim.citizens);
    bSim.maxHp = CITY_BASE_HP;
    bSim.hp = 100;
    bSim.productionQueue = [];
    bSim.productionProgress = {};

    // Apply capture policy effects.
    switch (policy) {
      case "raze":
        bSim.civBuildings = [];
        syncCivFlagsFromBuildings(burg, []);
        bSim.unrest = 5;
        state.economy.treasury = (state.economy.treasury ?? 0) + baseBooty * 3;
        break;
      case "sack":
        bSim.civBuildings = (bSim.civBuildings ?? []).filter(id => {
          const def = CIV_BUILDING_BY_ID[id];
          return !def?.nationalWonder && !def?.isWonder;
        });
        // Destroy one additional building.
        if (bSim.civBuildings.length > 0) bSim.civBuildings.pop();
        syncCivFlagsFromBuildings(burg, bSim.civBuildings);
        bSim.unrest = 15;
        state.economy.treasury = (state.economy.treasury ?? 0) + baseBooty * 4;
        break;
      case "loot":
        bSim.civBuildings = (bSim.civBuildings ?? []).filter(id => {
          const def = CIV_BUILDING_BY_ID[id];
          return !def?.nationalWonder && !def?.isWonder;
        });
        syncCivFlagsFromBuildings(burg, bSim.civBuildings);
        bSim.unrest = 20;
        state.economy.treasury = (state.economy.treasury ?? 0) + baseBooty * 2;
        break;
      default: // occupy
        bSim.civBuildings = (bSim.civBuildings ?? []).filter(id => {
          const def = CIV_BUILDING_BY_ID[id];
          return !def?.nationalWonder && !def?.isWonder;
        });
        syncCivFlagsFromBuildings(burg, bSim.civBuildings);
        bSim.unrest = 6 + bSim.citizens;
        break;
    }
    bSim.cityYields = undefined;

    // Clear siege state.
    bSim.siegeStateId = 0;
    bSim.siegeProgress = 0;
    bSim.siegeSupplies = 0;

    const captures = living.states[state.i];
    if (captures?.agenda?.kind === "conquer") captures.agenda = null;
  }

  /** Move the loser's Palace to its best remaining burg. */
  private relocateCapital(previousStateId: number, captured: Burg): void {
    captured.capital = 0;
    if (previousStateId <= 0) return;

    const state = pack.states[previousStateId];
    if (!state?.i || state.removed || state.capital !== captured.i) return;

    const next = pack.burgs.find(
      candidate =>
        candidate?.i && !candidate.removed && candidate.state === previousStateId && candidate.i !== captured.i
    );
    state.capital = next?.i ?? 0;
    if (next) state.center = next.cell;
  }

  /** Produce one unit: civilians keep a 1UPT sim, combat units add an army block. */
  private spawnUnit(state: State, burg: Burg, unitTypeId: string): Regiment | null {
    const living = this.getState();
    const def = this.civilianDefinition(unitTypeId);

    if (def?.isUtility || isCivilianUnit(unitTypeId)) {
      if (!def) return null;
      const cell = this.findSpawnCell(burg.cell, state.i, true, living);
      if (cell === null) return null;

      const regiment = this.createRegiment(state);
      regiment.type = def.id;
      this.moveRegimentTo(regiment, cell, state.i, this.unitKey(state.i, regiment.i), this.armyOccupancy(living));

      const unit = this.createUtilitySim(regiment, def);
      unit.xp = this.trainingXp(burg);
      unit.level = this.unitLevel(unit.xp);

      living.units ??= {};
      living.units[this.unitKey(state.i, regiment.i)] = unit;
      regiment.a = UNIT_MAX_HP;
      regiment.u = { [def.id]: UNIT_MAX_HP };
      regiment.units = [];
      regiment.n = (def.domain ?? "land") === "sea" ? 1 : 0;

      this.pushNews(living, {
        kind: "muster",
        text: `${state.name} trained a ${def.name} in ${burg.name ?? "a city"}.`,
        cell,
        stateId: state.i,
        burgId: burg.i
      });
      return regiment;
    }

    // Interim roster production: map the Civ class onto the culture's roster.
    const unitTypes = Military.getUnitTypes();
    const roster = Military.getRoster(state);
    const typeId = unitTypes[unitTypeId]
      ? unitTypeId
      : roster
        ? matchRosterUnitByCategory(roster, def?.unitClass ?? "melee")?.id
        : undefined;
    if (!typeId || !unitTypes[typeId]) return null;
    return this.spawnArmyBlock(state, burg, typeId, unitTypes[typeId].name);
  }

  /** Muster one roster block into the army at a burg, or a new regiment if it is full. */
  private spawnArmyBlock(state: State, burg: Burg, typeId: string, label: string): Regiment | null {
    const living = this.getState();
    const unitTypes = Military.getUnitTypes();
    const maxSlots = currentContent().config.military.maxUnitsPerArmy;
    const exp = Math.min(9, Math.floor(this.trainingXp(burg) / 15));

    // §4.3: a unit its state cannot equip takes the field as levies, or at half strength
    const roster = Military.getRoster(state);
    const resolved = this.resolveEquipment(state, roster, unitTypes, typeId, label);
    const shortage = resolved.shortage;
    typeId = resolved.typeId;
    label = resolved.label;

    let regiment = (state.military ?? []).find(entry => {
      if (entry.cell !== burg.cell) return false;
      const key = this.unitKey(state.i, entry.i);
      return Boolean(living.armies?.[key]) && (entry.units?.length ?? 0) < maxSlots;
    });
    if (!regiment) {
      const cell = this.findSpawnCell(burg.cell, state.i, false, living);
      if (cell === null) return null;
      regiment = this.createRegiment(state);
      this.moveRegimentTo(regiment, cell, state.i, this.unitKey(state.i, regiment.i), this.armyOccupancy(living));
    }

    const key = this.unitKey(state.i, regiment.i);
    regiment.units ??= [];
    regiment.units.push({ type: typeId, hp: shortage && resolved.typeId === typeId ? 0.5 : 1, exp });
    normalizeArmy(regiment, maxSlots, unitTypes);
    syncRegimentTotals(regiment, unitTypes);

    const speed = armySpeed(regiment, unitTypes);
    living.armies ??= {};
    living.armies[key] ??= { movement: speed, maxMovement: speed, stance: "fortify", hasFought: false };

    this.pushNews(living, {
      kind: "muster",
      text: `${state.name} mustered ${label} in ${burg.name ?? "a city"}.`,
      cell: regiment.cell,
      stateId: state.i,
      burgId: burg.i
    });
    if (shortage) {
      this.pushNews(living, {
        kind: "muster",
        text: `${state.name}'s forges ran short of ${shortage}; the block took the field underequipped.`,
        cell: regiment.cell,
        stateId: state.i,
        burgId: burg.i
      });
    }
    return regiment;
  }

  /** §4.3: resolve a mustering block against the state's spare equipment kits. */
  private resolveEquipment(
    state: State,
    roster: ResolvedRoster | undefined,
    unitTypes: Record<string, UnitType>,
    typeId: string,
    label: string
  ): { typeId: string; label: string; shortage?: string } {
    const unit = unitTypes[typeId];
    if (!unit || !roster) return { typeId, label };

    const required = getUnitRequiredGoods(unit, roster);
    const missing = required.filter(
      good =>
        Military.getEquipmentSpare(state.i, good, id => {
          const peer = unitTypes[id];
          return Boolean(peer && getUnitRequiredGoods(peer, roster).includes(good));
        }) < 1
    );
    if (missing.length === 0) return { typeId, label };

    const levy = levyUnitFor(roster);
    if (levy && unitTypes[levy.id] && levy.id !== typeId)
      return { typeId: levy.id, label: levy.name, shortage: missing.join(", ") };
    return { typeId, label, shortage: missing.join(", ") };
  }

  /** Barracks and similar training buildings grant +15 XP each on recruitment. */
  private trainingXp(burg: Burg): number {
    return (
      (pack.history?.living?.burgs[burg.i]?.civBuildings ?? []).filter(id =>
        ["barracks", "armory", "military_academy"].includes(id)
      ).length * 15
    );
  }

  /** First free cell at or around the burg that respects 1UPT stacking. */
  private findSpawnCell(
    burgCell: number,
    stateId: number,
    isUtility: boolean,
    living: LivingWorldState
  ): number | null {
    const occupancy = this.armyOccupancy(living);
    const candidates = [burgCell, ...(pack.cells.c?.[burgCell] ?? [])];
    for (const cell of candidates) {
      const info = getCellTerrainInfo(cell);
      if (info.isMountain) continue;
      if (hasStackingConflict(occupancy.get(cell) ?? [], stateId, isUtility, "")) continue;
      return cell;
    }
    return null;
  }

  /** Count live units of a type held by a state. */
  private stateUnitCount(stateId: number, unitTypeId: string): number {
    const living = pack.history?.living;
    if (!living?.units) return 0;
    let count = 0;
    for (const regiment of pack.states[stateId]?.military ?? []) {
      const unit = living.units[this.unitKey(stateId, regiment.i)];
      if (unit && unit.unitTypeId === unitTypeId && unit.hp > 0) count += 1;
    }
    return count;
  }

  /** How many owned workable cells still lack an improvement. */
  private countUnimprovedCells(stateId: number, living: LivingWorldState): number {
    let count = 0;
    const cells = pack.cells.state?.length ?? 0;
    for (let cell = 0; cell < cells; cell++) {
      if (pack.cells.state?.[cell] !== stateId) continue;
      if (!getCellTerrainInfo(cell).isWorkable) continue;
      if (living.cells?.[cell]?.improvement) continue;
      count += 1;
    }
    return count;
  }

  /** Recruit a specific OpenCiv unit in a Major Burg (city production, Guild, Sandbox). */
  recruitUnit(stateId: number, burgId: number, unitTypeId: string): Regiment | null {
    const state = pack.states[stateId];
    const burg = pack.burgs[burgId];
    if (!state?.i || state.removed || !burg?.i || burg.removed || burg.state !== stateId) return null;
    if (!this.hasCityTerrain()) return null;
    return this.spawnUnit(state, burg, unitTypeId);
  }

  /**
   * Gold refit of up to `maxBlocks` blocks to their successor (living-openciv-armies.md §10.5).
   * Preserves `hp` and `exp`: the block keeps its slot, its damage and its veterans.
   */
  upgradeRegiment(stateId: number, regimentId: number): boolean {
    return this.upgradeArmyBlocks(stateId, regimentId, Number.POSITIVE_INFINITY);
  }

  private upgradeArmyBlocks(stateId: number, regimentId: number, maxBlocks: number): boolean {
    const living = this.getState();
    const state = pack.states[stateId];
    const sSim = living.states[stateId];
    const regiment = (state?.military ?? []).find(entry => entry.i === regimentId);
    if (!state?.i || state.removed || !sSim || !regiment) return false;
    if (isCivilianUnit((regiment.type ?? "").toLowerCase())) return false;

    const types = Military.getUnitTypes();
    const roster = Military.getRoster(state);
    const techs = sSim.researchedTechs ?? [];
    const renames: string[] = [];
    let upgraded = 0;

    for (const block of regiment.units ?? []) {
      if (upgraded >= maxBlocks) break;
      const current = types[block.type];
      if (!current) continue;
      const authored = current.upgradesTo ? types[current.upgradesTo] : undefined;
      const target = authored ?? (roster ? nextRosterUnitInCategory(roster, current.id) : undefined);
      if (!target || target.id === current.id) continue;
      const gate = roster ? requiredTechFor(target, roster) : "";
      if (gate && !techs.includes(gate)) continue;

      const cost = Math.max(5, Math.round((10 * target.upkeep) / BASELINE_UPKEEP));
      if (Number(state.economy.treasury ?? 0) < cost) break;

      state.economy.treasury = Math.round((Number(state.economy.treasury ?? 0) - cost) * 100) / 100;
      block.type = target.id;
      renames.push(`${current.name} → ${target.name}`);
      upgraded += 1;
    }

    if (upgraded === 0) return false;
    normalizeArmy(regiment, currentContent().config.military.maxUnitsPerArmy, types);
    syncRegimentTotals(regiment, types);
    this.pushNews(living, {
      kind: "muster",
      text: `${state.name} refitted ${renames.length === 1 ? renames[0] : `${renames.length} blocks`}.`,
      cell: regiment.cell,
      stateId
    });
    return true;
  }

  /** Wealthy states refit one block per season. */
  private autoUpgrade(state: State, living: LivingWorldState): void {
    if (Number(state.economy.treasury ?? 0) < 50) return;
    for (const regiment of state.military ?? []) {
      if (isCivilianUnit((regiment.type ?? "").toLowerCase())) continue;
      if (!living.armies?.[this.unitKey(state.i, regiment.i)]) continue;
      if (this.upgradeArmyBlocks(state.i, regiment.i, 1)) return;
    }
  }

  /**
   * Between-tick replenishment in capability (living-openciv-armies.md §10.7):
   * +replenishFraction in a city, half that in friendly land, encamp doubles it.
   * A block that fought this tick does not heal.
   */
  private replenishArmies(living: LivingWorldState): void {
    const { config } = currentContent();
    const types = Military.getUnitTypes();
    const base = config.military.replenishFraction;

    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      for (const regiment of state.military ?? []) {
        const key = this.unitKey(state.i, regiment.i);
        const army = living.armies?.[key];
        if (!army || army.hasFought) continue;

        const burgId = Number(pack.cells.burg?.[regiment.cell] ?? 0);
        const burg = burgId ? pack.burgs[burgId] : undefined;
        const inCity = burg?.i && !burg.removed && burg.state === state.i;
        const friendly = pack.cells.state?.[regiment.cell] === state.i;
        if (!inCity && !friendly) continue;

        const gain =
          (army.stance === "encamp" ? base * config.military.encampReplenishBonus : base) * (inCity ? 1 : 0.5);
        let healed = false;
        for (const block of regiment.units ?? []) {
          if (block.hp <= 0 || block.hp >= 1) continue;
          block.hp = Math.min(1, block.hp + gain);
          healed = true;
        }
        if (healed) syncRegimentTotals(regiment, types);
      }
    }

    for (const faction of Factions.active()) {
      for (const regiment of faction.military ?? []) {
        const key = this.factionUnitKey(faction.i, regiment.i);
        const army = living.armies?.[key];
        if (!army || army.hasFought) continue;

        const burgId = Number(pack.cells.burg?.[regiment.cell] ?? 0);
        const inCity = burgId > 0 && this.factionNodesAtBurg(faction.i, burgId);
        const friendly =
          inCity ||
          Boolean(faction.hq && this.cellHopDistances(faction.hq.cell, MAX_WORK_DISTANCE).has(regiment.cell)) ||
          (faction.outposts ?? []).some(outpost =>
            this.cellHopDistances(outpost.cell, MAX_WORK_DISTANCE).has(regiment.cell)
          );
        if (!inCity && !friendly) continue;

        const gain =
          (army.stance === "encamp" ? base * config.military.encampReplenishBonus : base) * (inCity ? 1 : 0.5);
        let healed = false;
        for (const block of regiment.units ?? []) {
          if (block.hp <= 0 || block.hp >= 1) continue;
          block.hp = Math.min(1, block.hp + gain);
          healed = true;
        }
        if (healed) syncRegimentTotals(regiment, types);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Slice 6: dynamic religion pressure, beliefs and diplomacy timers.
  // -------------------------------------------------------------------------

  /** One seasonal religion tick: faith, pantheons, Great Prophets and pressure. */
  private stepReligion(living: LivingWorldState): void {
    if (!this.hasCityTerrain()) return;
    living.religions ??= {};

    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim) continue;
      this.stepFaithAndPantheon(state, sSim, living);
      this.stepProphet(state, sSim, living);
    }

    this.stepReligiousPressure(living);
  }

  private usedBeliefs(living: LivingWorldState): Set<string> {
    const used = new Set<string>();
    for (const record of Object.values(living.religions ?? {})) {
      if (record.pantheonId) used.add(record.pantheonId);
      if (record.founderBeliefId) used.add(record.founderBeliefId);
      if (record.enhancerBeliefId) used.add(record.enhancerBeliefId);
      for (const id of record.followerBeliefIds ?? []) used.add(id);
    }
    for (const record of Object.values(living.states)) {
      if (record.pantheonId) used.add(record.pantheonId);
    }
    return used;
  }

  private chooseBelief(catalog: readonly CivBeliefDef[], used: Set<string>, salt: number): string | null {
    const available = catalog.filter(def => !used.has(def.id));
    if (!available.length) return null;
    return available[Math.abs(salt) % available.length]!.id;
  }

  /** Bank Faith and found a Pantheon once the state can afford one. */
  private stepFaithAndPantheon(state: State, sSim: StatePolitySim, living: LivingWorldState): void {
    const gain = Math.max(0, sSim.yieldsPerTurn?.faith ?? 0);
    sSim.faith = Math.round(((sSim.faith ?? 0) + gain) * 100) / 100;
    if (sSim.pantheonId) return;

    const used = this.usedBeliefs(living);
    const founded = new Set<string>();
    for (const record of Object.values(living.religions ?? {})) if (record.pantheonId) founded.add(record.pantheonId);
    for (const record of Object.values(living.states)) if (record.pantheonId) founded.add(record.pantheonId);
    const cost = pantheonFaithCost(founded.size);
    if ((sSim.faith ?? 0) < cost) return;

    const id = this.chooseBelief(CIV_PANTHEONS, used, state.i);
    if (!id) return;
    sSim.faith = Math.round(((sSim.faith ?? 0) - cost) * 100) / 100;
    sSim.pantheonId = id;
    if (sSim.religionId && living.religions?.[sSim.religionId]) {
      living.religions[sSim.religionId].pantheonId = id;
    }

    const name = CIV_BELIEF_BY_ID[id]?.name ?? id;
    this.pushNews(living, {
      kind: "religion",
      text: `${state.name} adopted the ${name} pantheon.`,
      cell: state.center,
      stateId: state.i
    });
  }

  /** Birth a Great Prophet once Faith reaches the threshold, then expend it. */
  private stepProphet(state: State, sSim: StatePolitySim, living: LivingWorldState): void {
    const capital = state.capital ? pack.burgs[state.capital] : undefined;
    if (!capital?.i || capital.removed || capital.state !== state.i) return;

    const beliefs = this.stateBeliefs(state, living);
    const cost = prophetFaithCost(sSim.prophetsEarned ?? 0, beliefs.has("messiah"));
    if ((sSim.faith ?? 0) < cost) return;

    const chance = Math.min(1, 0.05 + ((sSim.faith ?? 0) - cost) / 100);
    if (!this.rng("prophet", state.i, living.tick).chance(chance)) return;

    sSim.faith = Math.round(((sSim.faith ?? 0) - cost) * 100) / 100;
    sSim.prophetsEarned = (sSim.prophetsEarned ?? 0) + 1;

    const record = sSim.religionId ? living.religions?.[sSim.religionId] : undefined;
    if (!record) this.foundReligion(state, sSim, capital, living);
    else if (!record.enhanced) this.enhanceReligion(state, record, capital, living);
    else this.spreadProphetPressure(sSim, capital, living);
  }

  /** The first Great Prophet links or founds a faith and picks Founder + Follower beliefs. */
  private foundReligion(state: State, sSim: StatePolitySim, capital: Burg, living: LivingWorldState): void {
    living.religions ??= {};
    const used = this.usedBeliefs(living);

    let religionId = sSim.religionId ?? 0;
    if (!religionId) {
      const native = pack.cells.religion?.[capital.cell] ?? 0;
      if (native > 0 && pack.religions?.[native] && !pack.religions[native].removed) religionId = native;
    }
    if (!religionId) {
      religionId = pack.religions?.length ?? 0;
      const name = CIV_RELIGION_NAMES[religionId % CIV_RELIGION_NAMES.length] ?? "New Faith";
      const culture = pack.cultures?.[capital.culture ?? state.culture ?? 0]?.name;
      pack.religions ??= [];
      pack.religions.push({
        i: religionId,
        name: culture ? `${name} of ${culture}` : name,
        type: "Organized",
        form: "Faith",
        deity: null,
        expansion: "state",
        expansionism: 1,
        color: state.color ?? "#8a7f5c",
        culture: capital.culture ?? state.culture ?? 0,
        center: capital.cell,
        tags: []
      });
    }

    const record: ReligionBeliefState = {
      religionId,
      founderStateId: state.i,
      holyCityBurgId: capital.i,
      followerBeliefIds: [],
      enhanced: false
    };
    if (sSim.pantheonId) record.pantheonId = sSim.pantheonId;
    const founder = this.chooseBelief(CIV_FOUNDER_BELIEFS, used, religionId);
    if (founder) record.founderBeliefId = founder;
    const follower = this.chooseBelief(CIV_FOLLOWER_BELIEFS, used, religionId + 1);
    if (follower) record.followerBeliefIds.push(follower);

    living.religions[religionId] = record;
    sSim.religionId = religionId;

    const city = living.burgs[capital.i];
    if (city) {
      city.religionPressure = { [religionId]: Math.max(1, city.citizens ?? 1) * CONVERSION_PRESSURE };
    }
    this.syncReligionCells(capital, religionId, living);

    this.pushNews(living, {
      kind: "religion",
      text: `${state.name} founded ${pack.religions[religionId]?.name ?? "a new faith"} in ${
        capital.name ?? "its capital"
      }.`,
      cell: capital.cell,
      stateId: state.i,
      burgId: capital.i
    });
  }

  /** The second Great Prophet adds a Follower and an Enhancer belief. */
  private enhanceReligion(state: State, record: ReligionBeliefState, capital: Burg, living: LivingWorldState): void {
    const used = this.usedBeliefs(living);
    const follower = this.chooseBelief(
      CIV_FOLLOWER_BELIEFS,
      used,
      record.religionId + record.followerBeliefIds.length + 1
    );
    if (follower) record.followerBeliefIds.push(follower);
    const enhancer = this.chooseBelief(CIV_ENHANCER_BELIEFS, used, record.religionId);
    if (enhancer) record.enhancerBeliefId = enhancer;
    record.enhanced = true;

    this.pushNews(living, {
      kind: "religion",
      text: `${state.name} enhanced ${pack.religions[record.religionId]?.name ?? "its faith"}.`,
      cell: capital.cell,
      stateId: state.i,
      burgId: capital.i
    });
  }

  /** Further Great Prophets add conversion pressure to the Holy City. */
  private spreadProphetPressure(sSim: StatePolitySim, capital: Burg, living: LivingWorldState): void {
    const religionId = sSim.religionId ?? 0;
    const city = living.burgs[capital.i];
    if (!religionId || !city) return;
    city.religionPressure ??= {};
    city.religionPressure[religionId] = Math.min(
      PRESSURE_CAP,
      (city.religionPressure[religionId] ?? 0) + PROPHET_PRESSURE
    );
    this.syncReligionCells(capital, religionId, living);
  }

  /** Passive pressure: 60/citizen, 6 (12 holy) per city within 10 (13) hops. */
  private stepReligiousPressure(living: LivingWorldState): void {
    const cities = pack.burgs.filter(
      burg => burg?.i && !burg.removed && burg.state && isMajorBurg(burg) && Boolean(living.burgs[burg.i])
    );

    // Seed pressure from the native religion layer for cities that have none yet.
    for (const burg of cities) {
      const bSim = living.burgs[burg.i]!;
      bSim.religionPressure ??= {};
      if (Object.keys(bSim.religionPressure).length > 0) continue;
      const native = pack.cells.religion?.[burg.cell] ?? 0;
      if (native > 0) bSim.religionPressure[native] = Math.max(1, bSim.citizens ?? 1) * CONVERSION_PRESSURE;
    }

    const sources = cities.map(burg => {
      const bSim = living.burgs[burg.i]!;
      const state = pack.states[burg.state!];
      const beliefs = state ? this.stateBeliefs(state, living) : new Set<string>();
      const religionId = majorityReligion(bSim.religionPressure, bSim.citizens ?? 1);
      return { burg, bSim, beliefs, religionId };
    });

    for (const source of sources) {
      if (!source.religionId) continue;
      const record = living.religions?.[source.religionId];
      let amount = record?.holyCityBurgId === source.burg.i ? PRESSURE_HOLY_CITY : PRESSURE_PER_CITY;
      if (source.beliefs.has("religious_texts")) amount *= record?.enhanced ? 1.5 : 1.25;
      if ((source.bSim.civBuildings ?? []).includes("grand_temple")) amount *= 1.25;

      const radius = source.beliefs.has("itinerant_preachers") ? PRESSURE_RADIUS_PREACHERS : PRESSURE_RADIUS;
      const distances = this.cellHopDistances(source.burg.cell, radius);
      for (const target of cities) {
        if (target.i === source.burg.i || !distances.has(target.cell)) continue;
        const targetSim = living.burgs[target.i]!;
        targetSim.religionPressure ??= {};
        targetSim.religionPressure[source.religionId] = Math.min(
          PRESSURE_CAP,
          (targetSim.religionPressure[source.religionId] ?? 0) + amount
        );
      }
    }

    // Majority flips repaint the native religion layer across the province.
    for (const burg of cities) {
      const bSim = living.burgs[burg.i]!;
      const majority = majorityReligion(bSim.religionPressure, bSim.citizens ?? 1);
      if (!majority) continue;
      if ((pack.cells.religion?.[burg.cell] ?? 0) === majority) continue;
      this.syncReligionCells(burg, majority, living);
    }
  }

  /** Repaint `pack.cells.religion` across a burg's province when its faith flips. */
  private syncReligionCells(burg: Burg, religionId: number, living: LivingWorldState): void {
    if (!pack.cells.religion) return;
    const provinceId = Number(pack.cells.province?.[burg.cell] ?? 0);
    const cells = pack.cells.i?.length ?? 0;
    const hinterland = provinceId ? null : new Set(this.burgHinterland(burg));

    for (let cell = 0; cell < cells; cell++) {
      if (provinceId) {
        if (pack.cells.province?.[cell] !== provinceId) continue;
      } else if (!hinterland?.has(cell)) {
        continue;
      }
      if (pack.cells.state && pack.cells.state[cell] !== burg.state) continue;
      pack.cells.religion[cell] = religionId;
    }

    this.pushNews(living, {
      kind: "religion",
      text: `${burg.name ?? "A city"} now follows ${pack.religions?.[religionId]?.name ?? "a new faith"}.`,
      cell: burg.cell,
      stateId: burg.state,
      burgId: burg.i
    });
  }

  /** Missionaries spread faith; Inquisitors purge rival pressure in their own cities. */
  private stepMissionary(
    state: State,
    regiment: Regiment,
    unit: UnitSimState,
    living: LivingWorldState,
    occupancy: Map<number, { stateId: number; isUtility: boolean; key: string }[]>
  ): boolean {
    const sSim = living.states[state.i];
    const religionId = sSim?.religionId ?? 0;
    if (!religionId) return false;

    const inquisitor = unit.unitTypeId === "inquisitor";
    if (unit.spreadCharges === undefined) {
      unit.spreadCharges = CIV_CIVILIAN_BY_ID[unit.unitTypeId]?.spreadCharges ?? 2;
    }

    const target = this.nearestCity(state.i, regiment.cell, 6, inquisitor);
    if (!target) return false;

    if (target.cell !== regiment.cell) {
      const moved = this.moveUnitToward(
        regiment,
        unit,
        target.cell,
        state.i,
        this.unitKey(state.i, regiment.i),
        occupancy
      );
      if (moved) return true;
    }

    const bSim = living.burgs[target.i];
    if (!bSim) return false;
    bSim.religionPressure ??= {};

    if (inquisitor) {
      for (const key of Object.keys(bSim.religionPressure)) {
        const id = Number(key);
        if (id === religionId) continue;
        bSim.religionPressure[id] = Math.floor((bSim.religionPressure[id] ?? 0) / 2);
      }
    } else {
      bSim.religionPressure[religionId] = Math.min(
        PRESSURE_CAP,
        (bSim.religionPressure[religionId] ?? 0) + MISSIONARY_PRESSURE
      );
    }

    const majority = majorityReligion(bSim.religionPressure, bSim.citizens ?? 1);
    if (majority) this.syncReligionCells(target, majority, living);

    unit.spreadCharges = (unit.spreadCharges ?? 2) - 1;
    if (unit.spreadCharges <= 0) this.removeRegiment(state, regiment, living);
    return true;
  }

  /** Nearest Major Burg; Inquisitors stay in friendly lands, Missionaries go anywhere. */
  private nearestCity(stateId: number, fromCell: number, maxHops: number, ownOnly: boolean): Burg | null {
    const distances = this.cellHopDistances(fromCell, maxHops);
    let best: { burg: Burg; distance: number } | null = null;
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || !burg.state) continue;
      if (!isMajorBurg(burg)) continue;
      if (ownOnly && burg.state !== stateId) continue;
      const distance = distances.get(burg.cell);
      if (distance === undefined) continue;
      if (!best || distance < best.distance || (distance === best.distance && burg.cell < best.burg.cell)) {
        best = { burg, distance };
      }
    }
    return best?.burg ?? null;
  }

  // -------------------------------------------------------------------------
  // Diplomacy: closed borders, war length and peace treaties.
  // -------------------------------------------------------------------------

  /** Tick war/peace clocks and let exhausted states sue for peace. */
  private stepDiplomacy(living: LivingWorldState): void {
    if (!this.hasCityTerrain()) return;

    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim) continue;
      sSim.warTurns ??= {};
      sSim.peaceTreatyTurns ??= {};

      for (const key of Object.keys(sSim.peaceTreatyTurns)) {
        const other = Number(key);
        sSim.peaceTreatyTurns[other] = Math.max(0, (sSim.peaceTreatyTurns[other] ?? 0) - 1);
      }
      for (const other of pack.states) {
        if (!other?.i || other.removed || other.i === state.i) continue;
        if (this.isAtWar(state.i, other.i)) sSim.warTurns[other.i] = (sSim.warTurns[other.i] ?? 0) + 1;
        else sSim.warTurns[other.i] = 0;
      }
    }

    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim) continue;
      const rivals = Object.entries(sSim.warTurns ?? {})
        .filter(([other, turns]) => this.isAtWar(state.i, Number(other)) && turns >= MIN_WAR_TURNS)
        .map(([other]) => Number(other));
      for (const otherId of rivals) {
        const sue = sSim.warExhaustion >= 50 || this.rng("peace", state.i * 1000 + otherId, living.tick).chance(0.15);
        if (!sue) continue;
        if (this.signPeace(state.i, otherId)) break;
      }
    }

    // Treaties: AI states occasionally offer pacts to their neighbours (Phase D).
    this.stepTreaties(living);
  }

  /** Sign a peace treaty once the war has lasted the minimum number of seasons. */
  signPeace(stateId: number, otherId: number): boolean {
    const living = this.getState();
    const state = pack.states[stateId];
    const other = pack.states[otherId];
    const sSim = living.states[stateId];
    const oSim = living.states[otherId];
    if (!state?.i || state.removed || !other?.i || other.removed || !sSim || !oSim) return false;
    if (!this.isAtWar(stateId, otherId)) return false;
    if ((sSim.warTurns?.[otherId] ?? 0) < MIN_WAR_TURNS) return false;

    state.diplomacy ??= [];
    other.diplomacy ??= [];
    state.diplomacy[otherId] = "Neutral";
    other.diplomacy[stateId] = "Neutral";

    sSim.warTurns ??= {};
    oSim.warTurns ??= {};
    sSim.peaceTreatyTurns ??= {};
    oSim.peaceTreatyTurns ??= {};
    sSim.warTurns[otherId] = 0;
    oSim.warTurns[stateId] = 0;
    sSim.peaceTreatyTurns[otherId] = PEACE_TREATY_TURNS;
    oSim.peaceTreatyTurns[stateId] = PEACE_TREATY_TURNS;

    this.pushNews(living, {
      kind: "war",
      text: `${state.name} and ${other.name} signed a peace treaty.`,
      cell: other.center,
      stateId,
      burgId: other.capital
    });
    this.pushHistory(
      "war",
      [
        { kind: "state", id: stateId },
        { kind: "state", id: otherId }
      ],
      other.center,
      `${state.name} and ${other.name} made peace.`
    );

    this.expelTrespassers(stateId);
    this.expelTrespassers(otherId);
    return true;
  }

  /** Move every regiment standing in foreign land at peace back to friendly ground. */
  private expelTrespassers(stateId: number): void {
    const state = pack.states[stateId];
    if (!state?.i || state.removed) return;
    const living = this.getState();

    for (const regiment of state.military ?? []) {
      const owner = pack.cells.state?.[regiment.cell] ?? 0;
      if (!owner || owner === stateId) continue;
      if (this.isAtWar(stateId, owner)) continue;

      const destination = this.nearestFriendlyCell(regiment.cell, stateId);
      if (destination === null) continue;
      this.moveRegimentTo(
        regiment,
        destination,
        stateId,
        this.unitKey(stateId, regiment.i),
        this.armyOccupancy(living)
      );
    }
  }

  /** Nearest passable own or unowned cell within 12 hops. */
  private nearestFriendlyCell(fromCell: number, stateId: number): number | null {
    const distances = this.cellHopDistances(fromCell, 12);
    let best: { cell: number; distance: number } | null = null;
    for (const [cell, distance] of distances) {
      if (distance === 0) continue;
      const owner = pack.cells.state?.[cell] ?? 0;
      if (owner && owner !== stateId) continue;
      if (!getCellTerrainInfo(cell).isWorkable && !getCellTerrainInfo(cell).isWater) continue;
      if (!best || distance < best.distance || (distance === best.distance && cell < best.cell)) {
        best = { cell, distance };
      }
    }
    return best?.cell ?? null;
  }

  /** Closed borders: a unit may only enter foreign land at war or when it ignores borders. Factions ignore borders. */
  private canEnterForeignCell(stateId: number, cell: number, unit: UnitSimState): boolean {
    if (stateId < 0) return true;
    const owner = pack.cells.state?.[cell] ?? 0;
    if (!owner || owner === stateId) return true;
    const def = CIV_CIVILIAN_BY_ID[unit.unitTypeId];
    if (def?.entersForeignLands) return true;
    return this.isAtWar(stateId, owner);
  }

  /** Step post-conquest occupation unrest on burgs and apply unravel pressure to owning states */
  private stepBurgUnrest(living: LivingWorldState): void {
    const restiveCountByState = new Map<number, number>();

    for (const key of Object.keys(living.burgs)) {
      const bSim = living.burgs[Number(key)];
      if (!bSim) continue;

      const burg = pack.burgs[bSim.burgId];
      if (!burg || burg.removed || !burg.state) {
        bSim.unrest = 0;
        continue;
      }

      const ownerState = pack.states[burg.state];
      if (!ownerState || ownerState.removed) {
        bSim.unrest = 0;
        continue;
      }

      const provId = pack.cells.province?.[burg.cell] ?? 0;
      const pSim = provId ? living.provinces?.[provId] : null;
      const trouble = pSim?.trouble;
      const hostile = provId
        ? Factions.active().find(
            f => (f.allegiance === "hostile" || f.allegiance === "clandestine") && this.factionProvinceId(f) === provId
          )
        : undefined;

      if (bSim.unrest <= 0 && !trouble && !hostile) continue;

      if (trouble) {
        bSim.unrest = Math.max(trouble.level, bSim.unrest);
      }
      if (hostile) {
        bSim.unrest = Math.max(Math.min(10, 4 + Math.floor((hostile.seasonsActive ?? 0) / 3)), bSim.unrest);
      }

      restiveCountByState.set(burg.state, (restiveCountByState.get(burg.state) ?? 0) + 1);

      const agenda = living.states[ownerState.i]?.agenda;
      const pacifying = agenda?.kind === "pacify" && agenda.targetBurgId === burg.i;

      let decay = 1;
      const isGarrisoned = (ownerState.military ?? []).some(reg => reg.cell === burg.cell && reg.a > 0);
      if (isGarrisoned) decay += 1;
      if (bSim.buildings.some(id => id.startsWith("temple"))) decay += 1;
      if (pacifying) decay += 2;

      const floor = Math.max(
        trouble ? trouble.level : 0,
        hostile ? Math.min(10, 4 + Math.floor((hostile.seasonsActive ?? 0) / 3)) : 0
      );
      bSim.unrest = Math.max(floor, bSim.unrest - decay);
      if (pacifying && bSim.unrest === 0) this.assimilateBurg(ownerState, burg, bSim);
    }

    // Apply seasonal unravel clock changes from unrest & stability balance
    for (const key of Object.keys(living.states)) {
      const sSim = living.states[Number(key)];
      if (!sSim) continue;

      const restiveCount = restiveCountByState.get(sSim.stateId) ?? 0;
      const sDeficit = (sSim.happiness ?? 0) <= VERY_UNHAPPY_HAPPINESS;

      let delta = 0;
      if (restiveCount > 0) delta += restiveCount * 4;
      if (sDeficit) delta += 4;
      if (sSim.warExhaustion >= 50) delta += 2;
      // On terrain packs the OpenCiv happiness rollup owns the peace decay.
      const empireManaged = sSim.happiness !== undefined;
      if (restiveCount === 0 && !sDeficit && !empireManaged && sSim.unravel > 0) delta -= 2;

      sSim.unravel = minmax(sSim.unravel + delta, 0, 100);
      sSim.warExhaustion = minmax(sSim.warExhaustion - 1, 0, 100);
    }
  }

  /** A pacified burg may adopt its conqueror's faith and, over time, its culture. */
  private assimilateBurg(state: State, burg: Burg, bSim: BurgSimState): void {
    const rng = this.rng("pacify:assimilate", burg.i);
    const religion = pack.cells.religion?.[state.center] ?? 0;
    if (religion && pack.cells.religion?.[burg.cell] !== religion && rng.chance(0.5)) {
      pack.cells.religion[burg.cell] = religion;
      bSim.originalReligion = religion;
    }
    if (burg.culture !== state.culture && rng.chance(0.25)) {
      burg.culture = state.culture;
      for (const cell of this.burgHinterland(burg)) pack.cells.culture[cell] = state.culture;
      bSim.originalCulture = state.culture;
    }
  }

  /** Start a development project in an owned province. */
  startDevelop(stateId: number, provinceId: number): boolean {
    const living = this.getState();
    const state = pack.states[stateId];
    const province = pack.provinces?.[provinceId];
    if (!state?.i || state.removed || !province?.i || province.removed || province.state !== stateId) return false;

    const sSim = living.states[stateId];
    const pSim = living.provinces?.[provinceId];
    if (!sSim || !pSim || pSim.developmentProgress) return false;

    const capacityConfig = currentContent().config.capacity;
    if (pSim.stability < capacityConfig.developStabilityCost) return false;
    if (pSim.development >= this.provinceDevelopmentCap(provinceId)) return false;

    const settlementId = this.pickProvinceSettlement(provinceId, stateId);
    if (!settlementId) return false;

    pSim.stability -= capacityConfig.developStabilityCost;
    pSim.developmentProgress = { settlementId, turnsLeft: capacityConfig.developTurns };
    const settlement = pack.burgs[settlementId];
    sSim.agenda = {
      kind: "develop",
      label: `Developing ${settlement?.name ?? province.name ?? "a settlement"}`,
      targetProvinceId: provinceId,
      targetBurgId: settlementId,
      progress: 0,
      required: capacityConfig.developTurns
    };
    return true;
  }

  /** Begin constructing an asset in one of the state's burgs. */
  startBuild(stateId: number, burgId: number, buildingId: string): boolean {
    const living = this.getState();
    const state = pack.states[stateId];
    const burg = pack.burgs[burgId];
    if (!state?.i || state.removed || !burg?.i || burg.removed || burg.state !== stateId) return false;

    const sSim = living.states[stateId];
    const bSim = living.burgs[burgId];
    if (!sSim || !bSim || bSim.construction) return false;

    const { content } = currentContent();
    const building = content.buildings.find(b => b.id === buildingId);
    if (!building || !this.canBuild(state, burg, bSim, building)) return false;

    bSim.construction = {
      buildingId,
      turnsLeft: building.turns ?? 1
    };
    sSim.agenda = {
      kind: "build",
      label: `Building ${building.name}`,
      targetBurgId: burgId,
      targetProvinceId: pack.cells.province?.[burg.cell] || undefined,
      buildingId,
      progress: 0,
      required: 3
    };
    return true;
  }

  /** Muster one roster unit into a state's field regiment. */
  muster(stateId: number): boolean {
    const state = pack.states[stateId];
    if (!state?.i || state.removed) return false;

    const choice = this.pickMusterUnit(state);
    if (!choice) return false;

    const unitTypes = Military.getUnitTypes();
    // §4.3: muster through the equipment gate; short goods demote the unit to a levy
    const roster = Military.getRoster(state);
    const resolved = this.resolveEquipment(state, roster, unitTypes, choice.unit.id, choice.unit.name);
    const unit =
      resolved.shortage && resolved.typeId === choice.unit.id
        ? choice.unit
        : (unitTypes[resolved.typeId] ?? choice.unit);
    const regiment = choice.regiment ?? this.createRegiment(state);
    regiment.units ??= [];
    regiment.units.push({ type: unit.id, hp: resolved.shortage && resolved.typeId === unit.id ? 0.5 : 1, exp: 0 });
    normalizeArmy(regiment, currentContent().config.military.maxUnitsPerArmy, unitTypes);
    syncRegimentTotals(regiment, unitTypes);
    const key = this.unitKey(state.i, regiment.i);
    const speed = armySpeed(regiment, unitTypes);
    const livingState = this.getState();
    livingState.armies ??= {};
    livingState.armies[key] ??= { movement: speed, maxMovement: speed, stance: "fortify", hasFought: false };
    if (unit.troubleRole) this.commanderFor(state, regiment, unit.troubleRole);

    const living = this.getState();
    const burg = pack.burgs[pack.cells.burg?.[regiment.cell] ?? 0];
    this.pushNews(living, {
      kind: "muster",
      text: `${state.name} mustered ${resolved.label} in ${burg?.name ?? "the field"}.`,
      cell: regiment.cell,
      stateId,
      burgId: burg?.i
    });
    if (resolved.shortage) {
      this.pushNews(living, {
        kind: "muster",
        text: `${state.name}'s forges ran short of ${resolved.shortage}; the block took the field underequipped.`,
        cell: regiment.cell,
        stateId,
        burgId: burg?.i
      });
    }
    return true;
  }

  /**
   * unified-figures slice 1: every specialist unit in the field serves under a
   * named commander figure. Backfills on init and each sync, and is what a
   * fresh muster calls; idempotent through `regiment.crew`.
   */
  ensureCommanders(): void {
    LivingHeroes.ensureCommanders();
  }

  /** The living commander figure for a regiment's specialty, minting one on first need. */
  commanderFor(state: State, regiment: Regiment, specialty: TroubleUnitRole): number | undefined {
    return LivingHeroes.commanderFor(state, regiment, specialty);
  }

  /** Annex a Free Burg: peacefully when it shares the state's culture or faith, else by assault. */
  colonize(stateId: number, burgId: number): boolean {
    const state = pack.states[stateId];
    const burg = pack.burgs[burgId];
    if (!state?.i || state.removed || !burg?.i || burg.removed || burg.state !== 0) return false;

    if (this.sharesKinshipOrFaith(stateId, burgId)) {
      this.annexBurg(stateId, burg, false);
      this.logConquest(state, burg, false);
      return true;
    }
    return this.assaultBurg(state, burg);
  }

  /** Declare war on a rival and storm one of its border burgs. */
  conquerBurg(stateId: number, burgId: number): boolean {
    const state = pack.states[stateId];
    const burg = pack.burgs[burgId];
    if (!state?.i || state.removed || !burg?.i || burg.removed) return false;

    const defenderId = burg.state;
    if (!defenderId || defenderId === stateId) return false;
    if (!pack.states[defenderId]?.i || pack.states[defenderId].removed || burg.capital) return false;
    if (!this.bordersState(stateId, burg)) return false;

    if (!this.isAtWar(stateId, defenderId)) this.declareWar(stateId, defenderId);
    if (!this.assaultBurg(state, burg)) return false;

    this.removeClaim(stateId, burg.i);
    this.recordClaim(defenderId, burg, stateId);
    this.recordGrudge(defenderId, burg, "conquest", `${state.name} took ${burg.name}`, stateId);
    return true;
  }

  /** Retake a burg recorded on the state's claim list. */
  reclaimBurg(stateId: number, burgId: number): boolean {
    const sSim = this.getState().states[stateId];
    const burg = pack.burgs[burgId];
    if (!sSim || !burg?.i || burg.removed || !burg.state || burg.state === stateId) return false;
    if (!sSim.claims.some(claim => claim.burgId === burgId)) return false;

    const defenderId = burg.state;
    if (!this.isAtWar(stateId, defenderId)) this.declareWar(stateId, defenderId);
    if (!this.assaultBurg(pack.states[stateId], burg)) return false;

    sSim.claims = sSim.claims.filter(claim => claim.burgId !== burgId);
    sSim.grudges = sSim.grudges.filter(
      grudge => !(grudge.againstStateId === defenderId && grudge.targetBurgId === burgId)
    );
    this.recordClaim(defenderId, burg, stateId);
    return true;
  }

  /** God mode: set a state's most restive burg (or the given one) on the path to secession. */
  sparkRebellion(stateId: number, burgId?: number): boolean {
    const living = this.getState();
    const state = pack.states[stateId];
    const sSim = living.states[stateId];
    if (!state?.i || state.removed || !sSim) return false;

    const burg =
      burgId !== undefined
        ? pack.burgs[burgId]
        : pack.burgs.find(
            candidate => candidate?.i && !candidate.removed && candidate.state === stateId && !candidate.capital
          );
    if (!burg?.i || burg.removed || burg.state !== stateId || burg.capital) return false;

    const bSim = living.burgs[burg.i];
    if (bSim) bSim.unrest = 100;
    sSim.unravel = 100;
    this.stepRebellions(living);
    return true;
  }

  /** God mode: kill the current ruler and let the succession play out. */
  smiteRuler(stateId: number): boolean {
    const living = this.getState();
    const state = pack.states[stateId];
    const sSim = living.states[stateId];
    if (!state?.i || state.removed || !sSim) return false;

    const ruler = pack.history?.figures?.find(figure => figure.i === sSim.rulerId);
    if (!ruler || ruler.death !== undefined) return false;

    this.succeedRuler(state, sSim, ruler, living, options.map?.lore?.calendar?.year ?? 1000);
    return true;
  }

  /** God mode: declare war on a rival, or on the first neighbour not already at war. */
  forceWar(stateId: number, otherId?: number): boolean {
    const state = pack.states[stateId];
    if (!state?.i || state.removed) return false;

    const other = otherId !== undefined ? pack.states[otherId] : this.pickWarRival(state);
    if (!other?.i || other.removed || other.i === stateId) return false;
    if (this.isAtWar(stateId, other.i)) return false;

    this.declareWar(stateId, other.i);
    return true;
  }

  /** God mode: end a burg's unrest at once and start its assimilation. */
  pacifyBurg(burgId: number): boolean {
    const living = this.getState();
    const burg = pack.burgs[burgId];
    const bSim = living.burgs[burgId];
    if (!burg?.i || burg.removed || !burg.state || !bSim || bSim.unrest <= 0) return false;

    const state = pack.states[burg.state];
    if (!state?.i || state.removed) return false;

    bSim.unrest = 0;
    const sSim = living.states[state.i];
    if (sSim) sSim.unravel = Math.max(0, sSim.unravel - 20);
    this.assimilateBurg(state, burg, bSim);

    this.pushNews(living, {
      kind: "pacify",
      text: `${state.name} pacified ${burg.name ?? "a restive burg"}.`,
      cell: burg.cell,
      stateId: state.i,
      burgId
    });
    return true;
  }

  /** God mode: finish the burg's construction, or start and finish the best available asset. */
  completeAsset(burgId: number): boolean {
    const living = this.getState();
    const burg = pack.burgs[burgId];
    const bSim = living.burgs[burgId];
    if (!burg?.i || burg.removed || !burg.state || !bSim) return false;

    const state = pack.states[burg.state];
    const sSim = state?.i && !state.removed ? living.states[state.i] : undefined;
    if (!state?.i || state.removed || !sSim) return false;

    const { content } = currentContent();
    const construction = bSim.construction;
    const built = construction ? content.buildings.find(entry => entry.id === construction.buildingId) : undefined;
    const candidates = content.buildings.filter(entry => this.canBuild(state, burg, bSim, entry));
    const building = built ?? candidates.find(entry => entry.id === sSim.agenda?.buildingId) ?? candidates[0];
    if (!building) return false;

    this.completeConstruction(state, sSim, living, burg, bSim, building);
    return true;
  }

  /** Spawn or escalate a trouble in a province (e.g. flooding, heresy, unrest). */
  spawnTrouble(provinceId: number, troubleId?: string, theme?: TroubleTheme, level?: number): ProvinceTrouble | null {
    return LivingThreats.spawnTrouble(provinceId, troubleId, theme, level);
  }

  /** Quell a trouble immediately (magistrate intervention, hero success, GM tool). */
  quellTrouble(provinceId: number): boolean {
    return LivingThreats.quellTrouble(provinceId);
  }

  /** Order a state army to march on and assault a hostile faction in its territory. */
  assaultFaction(stateId: number, provinceId: number): boolean {
    return LivingThreats.assaultFaction(stateId, provinceId);
  }

  /** Dispatch an adventuring band to execute a decapitation delve into a hostile faction. */
  sendAdventurersToFaction(stateId: number, provinceId: number): boolean {
    return LivingThreats.sendAdventurersToFaction(stateId, provinceId);
  }

  /** Destroy a hostile faction immediately. */
  smiteFaction(provinceId: number): boolean {
    return LivingThreats.smiteFaction(provinceId);
  }

  /** Spawn a dangerous faction from the trouble trigger. */
  spawnDangerousFaction(
    provinceId: number,
    troubleId?: string,
    theme?: TroubleTheme,
    level?: number,
    opts?: { name?: string; markerId?: number; cell?: number }
  ): import("@/types/factions").Faction | null {
    return LivingThreats.spawnDangerousFaction(provinceId, troubleId, theme, level, opts);
  }

  /** Ascend an ambitious faction into a sovereign state. */
  ascendFactionToState(factionId: number, targetBurgId?: number): number | null {
    return LivingThreats.ascendFactionToState(factionId, targetBurgId);
  }

  /** Spawn a remnant rebel faction when a state is annexed. */
  spawnRemnantFaction(fallenState: State, conquerorStateId?: number): Faction | null {
    return LivingThreats.spawnRemnantFaction(fallenState, conquerorStateId);
  }

  addRuinMarker(cell: number, name: string): number {
    pack.markers ??= [];
    const markers = pack.markers;
    const [x, y] = pack.cells.p[cell] ?? [0, 0];
    const markerIndex = markers.length;
    markers.push({
      i: markerIndex,
      type: "ruins",
      icon: "🏛️",
      x,
      y,
      cell,
      name,
      chronicle: true
    });
    return markerIndex;
  }

  private pickWarRival(state: State): State | undefined {
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || !burg.state || burg.state === state.i) continue;
      if (!this.bordersState(state.i, burg) || this.isAtWar(state.i, burg.state)) continue;
      const rival = pack.states[burg.state];
      if (rival?.i && !rival.removed) return rival;
    }
    return undefined;
  }

  /** Strongest land regiment with living troops, reconciling legacy compositions on the way. */
  fieldArmy(state: State): Regiment | null {
    const unitTypes = Military.getUnitTypes();
    let best: Regiment | null = null;
    let bestMen = 0;
    for (const regiment of state.military ?? []) {
      if (regiment.n) continue;
      if (isCivilianUnit((regiment.type ?? "").toLowerCase())) continue;
      if (!regiment.units?.length) reconcileRegimentBlocks(regiment, unitTypes);
      // Civilian regiments and stale ids never fight (living-openciv-armies.md §11).
      if ((regiment.units ?? []).some(unit => unit.type !== "fleet" && !unitTypes[unit.type])) continue;
      const men = armyMen(regiment, unitTypes);
      if (men > bestMen) {
        best = regiment;
        bestMen = men;
      }
    }
    return best;
  }

  /** Attack a settlement with the state's strongest field regiment. */
  private assaultBurg(state: State, burg: Burg): boolean {
    if (this.hasCityTerrain()) return this.openCivAssault(state, burg);

    const army = this.fieldArmy(state);
    if (!army) return false;

    const defenders = this.burgDefenders(burg);
    if (defenders.length === 0) {
      this.annexBurg(state.i, burg, false);
      this.moveArmy(army, burg);
      this.logConquest(state, burg, true);
      return true;
    }

    const outcome = this.resolveAssault(state.i, burg, army, defenders);
    this.applyArmySurvivors(state, army, outcome.attacker.units);
    this.addBattleMarker(burg);

    const sSim = this.getState().states[state.i];
    if (sSim) sSim.warExhaustion = minmax(sSim.warExhaustion + (outcome.winner === "attacker" ? 2 : 8), 0, 100);

    if (outcome.winner === "attacker") {
      this.annexBurg(state.i, burg, true);
      if (army.a > 0) this.moveArmy(army, burg);
      this.logConquest(state, burg, true);
      return true;
    }

    this.recordGrudge(state.i, burg, "repulsed", `${burg.name} repulsed ${state.name}`);
    this.pushNews(this.getState(), {
      kind: "resist",
      text: `${burg.name ?? "The free town"} repulsed ${state.name}'s assault.`,
      cell: burg.cell,
      stateId: state.i,
      burgId: burg.i
    });
    this.pushHistory(
      "battle",
      [
        { kind: "state", id: state.i },
        { kind: "burg", id: burg.i }
      ],
      burg.cell,
      `${burg.name ?? "The free town"} repulsed ${state.name}'s assault.`
    );
    return false;
  }

  private resolveAssault(stateId: number, burg: Burg, army: Regiment, defenders: ArmyUnit[]): BattleOutcome {
    const { config } = currentContent();
    const session = initBattleSession({
      config,
      unitTypes: Military.getUnitTypes(),
      attacker: {
        factionId: stateId,
        armyId: null,
        units: toBattleUnitsMen(army.units ?? [], Military.getUnitTypes())
      },
      defender: { factionId: burg.state ?? 0, armyId: null, units: defenders },
      cell: burg.cell,
      regionId: pack.cells.province?.[burg.cell] ?? 0,
      assault: Number(burg.walls ?? 0) > 0,
      modifiers: this.assaultModifiers(burg, stateId)
    });
    const rng = this.rng("battle", stateId * 10000 + burg.i);
    while (session.status === "active" && session.round < config.battle.maxRounds) {
      stepBattleRound(session, rng.next);
    }
    return finalizeBattle(session, rng.next);
  }

  private assaultModifiers(burg: Burg, attackerStateId?: number): BattleModifiers {
    const living = pack.history?.living;
    const attackerMult = attackerStateId ? this.stateCombatMult(attackerStateId, living ?? this.getState()) : 1;
    const defenderMult = this.stateCombatMult(burg.state ?? 0, living ?? this.getState());

    return {
      walls: Number(burg.walls ?? 0),
      defenderEncamped: false,
      defenderAmbushed: false,
      attackerCrossedRiver: Boolean(pack.cells.r?.[burg.cell]),
      labels: [`${burg.name ?? "settlement"} (walls ${burg.walls ?? 0})`],
      ...(attackerMult < 1 ? { attackerLordMult: attackerMult } : {}),
      ...(defenderMult < 1 ? { defenderLordMult: defenderMult } : {})
    };
  }

  /** Win chance for the AI's war picking; 100 when the settlement is undefended. */
  private assaultOdds(stateId: number, burg: Burg, army: Regiment): number {
    const living = this.getState();
    if (!living.armies?.[this.unitKey(stateId, army.i)]) return 50;
    if (this.hasCityTerrain()) {
      const garrison = this.cityGarrisonBlocks(burg);
      if (garrison.length === 0) return 100;
      const state = pack.states[stateId]!;
      return estimateOdds(
        currentContent().config,
        { factionId: stateId, armyId: null, units: toBattleUnits(army.units ?? []) },
        { factionId: burg.state ?? 0, armyId: null, units: toBattleUnits(garrison) },
        this.siegeModifiers(state, burg),
        toBattleTypes(Military.getUnitTypes())
      ).attackerWinPct;
    }

    const defenders = this.burgDefenders(burg);
    if (defenders.length === 0) return 100;
    return estimateOdds(
      currentContent().config,
      { factionId: stateId, armyId: null, units: toBattleUnitsMen(army.units ?? [], Military.getUnitTypes()) },
      { factionId: burg.state ?? 0, armyId: null, units: defenders },
      this.assaultModifiers(burg, stateId),
      Military.getUnitTypes()
    ).attackerWinPct;
  }

  /** The burg's roster and its militia garrison. */
  private burgDefenders(burg: Burg): ArmyUnit[] {
    const roster = this.burgDefenderRoster(burg);
    const unitTypes = Military.getUnitTypes();
    if (!roster) return [];
    const tier = settlementTierFromPop(burg.population ?? 0);
    const walls = Number(burg.walls ?? 0);
    return burg.capital ? garrisonUnits(roster, unitTypes, walls) : minorGarrisonUnits(roster, unitTypes, tier, walls);
  }

  private burgDefenderRoster(burg: Burg): ResolvedRoster | undefined {
    if (burg.state) {
      const owner = pack.states[burg.state];
      if (owner?.i && !owner.removed) return Military.getRoster(owner);
    }
    const { content } = currentContent();
    const culture = pack.cultures?.[burg.culture ?? 0];
    const rosterId = inferRosterForCulture(culture?.name, content.rosters, content.defaultRoster, culture?.type);
    return content.rosters[rosterId] ?? content.rosters[content.defaultRoster] ?? Object.values(content.rosters)[0];
  }

  applyArmySurvivors(state: State, regiment: Regiment, units: ArmyUnit[]): void {
    regiment.units = fromBattleUnitsMen(units, Military.getUnitTypes());
    syncRegimentTotals(regiment, Military.getUnitTypes());
    if (regiment.a <= 0) state.military = (state.military ?? []).filter(entry => entry !== regiment);
  }

  moveArmy(regiment: Regiment, burg: Burg): void {
    regiment.cell = burg.cell;
    regiment.x = burg.x;
    regiment.y = burg.y;
    regiment.bx = burg.x;
    regiment.by = burg.y;
  }

  /** Flip the burg and its hinterland to the state and seed occupation unrest. */
  private annexBurg(stateId: number, burg: Burg, restless: boolean): void {
    const living = this.getState();
    const bSim = living.burgs[burg.i];
    if (bSim) bSim.originalOwner ??= burg.state ?? 0;

    const previousState = burg.state ?? 0;
    const loserProvinces = previousState > 0 ? this.ownedProvinces(previousState).length : 0;
    const cells = this.burgHinterland(burg);
    this.transferCells(stateId, cells);
    burg.state = stateId;
    this.assignProvince(stateId, cells);

    // a major state losing its last holding collapses — and hastens the eschaton
    if (previousState > 0 && previousState !== stateId) {
      const stillHolds = pack.burgs.some(entry => entry?.i && !entry.removed && entry.state === previousState);
      if (!stillHolds) {
        if (loserProvinces >= 4) this.exaltEschaton(living, 5);
        this.spawnRemnantFaction(pack.states[previousState], stateId);
      }
    }

    // conquests by evil sovereigns push the world toward its finale
    const conquerorSim = living.states[stateId];
    const conquerorRuler =
      conquerorSim && conquerorSim.rulerId !== undefined ? this.findFigure(conquerorSim.rulerId) : undefined;
    if (conquerorRuler?.alignment === "evil") this.exaltEschaton(living, 2);

    if (!bSim) return;
    bSim.originalCulture ??= burg.culture;
    bSim.originalReligion ??= pack.cells.religion?.[burg.cell] ?? 0;
    bSim.conqueredBy = restless ? stateId : undefined;
    bSim.unrest = restless ? this.initialUnrest(stateId, burg) : 0;

    if (restless) {
      const provId = pack.cells.province?.[burg.cell] ?? 0;
      const prov = provId ? pack.provinces?.[provId] : null;
      const pSim = provId ? this.getState().provinces?.[provId] : null;
      if (prov && pSim && !pSim.trouble) {
        const conquestLevel = this.rng("conquest:trouble", burg.i).d(6) + 2;
        this.spawnTrouble(provId, undefined, "burg", conquestLevel);
      }
    }
  }

  /** The burg cell plus adjacent cells of the same (wild or defending) owner. */
  burgHinterland(burg: Burg): number[] {
    const from = burg.state ?? 0;
    const cells = [burg.cell];
    const burgCells = new Set<number>();
    for (const entry of pack.burgs ?? []) {
      if (entry?.i && !entry.removed) burgCells.add(entry.cell);
    }
    const centers = new Set<number>();
    for (const state of pack.states ?? []) {
      if (state?.i && !state.removed) centers.add(state.center);
    }

    for (const neighbor of pack.cells.c?.[burg.cell] ?? []) {
      if (pack.cells.state?.[neighbor] !== from) continue;
      if (pack.cells.h && pack.cells.h[neighbor] < 20) continue;
      if (burgCells.has(neighbor) || centers.has(neighbor)) continue;
      cells.push(neighbor);
    }
    return cells;
  }

  /** Prefer the state's own SetCells (provinces, statistics); fall back on stripped packs. */
  transferCells(stateId: number, cells: number[]): void {
    if (cells.length === 0) return;
    try {
      States.setCells(stateId, cells);
      return;
    } catch {
      // Stub packs (tests, stripped saves) have no full grid to validate against.
    }
    for (const cell of cells) {
      if (pack.cells.state[cell] === stateId) continue;
      pack.cells.state[cell] = stateId;
      const burgId = pack.cells.burg?.[cell];
      if (burgId) pack.burgs[burgId].state = stateId;
    }
  }

  /** Put annexed cells in an adjacent province of the conquering state, if it has one. */
  assignProvince(stateId: number, cells: number[]): void {
    let provinceId = 0;
    for (const cell of cells) {
      for (const neighbor of pack.cells.c?.[cell] ?? []) {
        const candidate = pack.cells.province?.[neighbor] ?? 0;
        if (candidate && pack.provinces?.[candidate]?.state === stateId) {
          provinceId = candidate;
          break;
        }
      }
      if (provinceId) break;
    }
    if (!provinceId) {
      for (const cell of cells) {
        if (pack.cells.province) pack.cells.province[cell] = 0;
      }
      return;
    }
    for (const cell of cells) pack.cells.province[cell] = provinceId;
  }

  /** When a state's unravel clock fills, its most restive burg breaks away. */
  private stepRebellions(living: LivingWorldState): void {
    for (const state of pack.states.slice()) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim || sSim.unravel < 100) continue;

      const target = this.mostRestiveBurg(state.i, true);
      if (!target) {
        sSim.unravel = 50;
        continue;
      }
      this.breakAway(state, target, living);
      sSim.unravel = 30;
    }
  }

  /** Highest-unrest burg of the state; capitals are only allowed when asked for. */
  private mostRestiveBurg(stateId: number, excludeCapital: boolean): Burg | null {
    let best: Burg | null = null;
    let bestUnrest = 0;
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.state !== stateId) continue;
      if (excludeCapital && burg.capital) continue;
      const unrest = this.getState().burgs[burg.i]?.unrest ?? 0;
      if (unrest <= bestUnrest) continue;
      best = burg;
      bestUnrest = unrest;
    }
    return best;
  }

  /** Restore a Free Burg, rejoin its homeland, defect to kin, or found a secessionist state. */
  private breakAway(state: State, burg: Burg, living: LivingWorldState): void {
    const bSim = living.burgs[burg.i];
    const cells = this.burgHinterland(burg);
    const original = bSim?.originalOwner ?? 0;
    const kin = this.kinNeighborState(state.i, burg);
    const rebel = this.spawnRebel(state, burg, living);

    let heir = 0;
    if (original > 0 && original !== state.i) {
      if (pack.states[original]?.i && !pack.states[original].removed) heir = original;
    } else if (kin) {
      heir = kin;
    } else if (original > 0) {
      heir = this.foundSecessionState(state, burg);
    }

    if (heir) {
      this.transferCells(heir, cells);
      burg.state = heir;
      this.assignProvince(heir, cells);
      this.raiseRebelRegiment(heir, burg);
    } else {
      this.transferCells(0, cells);
      burg.state = 0;
      for (const cell of cells) pack.cells.province[cell] = 0;
    }

    if (bSim) {
      bSim.unrest = 0;
      bSim.conqueredBy = undefined;
    }
    this.recordClaim(state.i, burg, heir);
    this.recordGrudge(state.i, burg, "repulsed", `${burg.name ?? "The burg"} broke away from ${state.name}`);

    const heirState = heir ? pack.states[heir] : undefined;
    const text = heirState
      ? `${burg.name ?? "The burg"} rose in revolt and joined ${heirState.name}.`
      : `${burg.name ?? "The burg"} rose in revolt and restored its independence.`;
    this.pushNews(living, { kind: "revolt", text, cell: burg.cell, stateId: state.i, burgId: burg.i });
    this.pushHistory(
      "independence",
      [
        { kind: "figure", id: rebel.i },
        { kind: "burg", id: burg.i },
        { kind: "state", id: state.i }
      ],
      burg.cell,
      text
    );
  }

  private spawnRebel(state: State, burg: Burg, living: LivingWorldState): HistoricalFigure {
    const history = Chronicle.sync();
    history.figures ??= [];
    const year = options.map?.lore?.calendar?.year ?? 1000;
    const culture = living.burgs[burg.i]?.originalCulture ?? burg.culture ?? state.culture ?? 0;
    const index = history.figures.length;
    const rng = traitsRng(living.seed, "figure", index + state.i * 1000);
    const alignment = rollAlignment(rng, pack.cultures[culture]?.alignment);
    const { virtues, vices } = rollFigureTraits(rng, alignment);
    const figure: HistoricalFigure = {
      i: index,
      name: Names.getCulture(culture),
      culture,
      birth: year - rng.int(20, 50),
      roles: [{ type: "rebel", target: { kind: "burg", id: burg.i }, from: year }],
      alignment,
      virtues,
      vices
    };
    history.figures.push(figure);
    return figure;
  }

  /** A state on a neighbouring cell that shares the burg's culture. */
  private kinNeighborState(ownerId: number, burg: Burg): number {
    const culture = this.getState().burgs[burg.i]?.originalCulture ?? burg.culture ?? 0;
    for (const cell of pack.cells.c?.[burg.cell] ?? []) {
      const stateId = pack.cells.state?.[cell] ?? 0;
      if (!stateId || stateId === ownerId) continue;
      const state = pack.states[stateId];
      if (state?.i && !state.removed && state.culture === culture) return stateId;
    }
    return 0;
  }

  private foundSecessionState(oldOwner: State, burg: Burg): number {
    const i = pack.states.length;
    const culture = burg.culture ?? oldOwner.culture ?? 0;
    const relations: string[] = [];
    for (const other of pack.states) {
      if (!other) continue;
      if (!other.i || other.removed) {
        relations[other.i] = "x";
        continue;
      }
      const relation = other.i === oldOwner.i ? "Enemy" : "Neutral";
      other.diplomacy ??= [];
      other.diplomacy[i] = relation;
      relations[other.i] = relation;
    }
    relations[i] = "x";

    pack.states.push({
      i,
      name: Names.getState(burg.name ?? Names.getCulture(culture), culture),
      diplomacy: relations,
      provinces: [],
      color: oldOwner.color ?? "#8a8a8a",
      expansionism: 0.5,
      capital: burg.i,
      type: "Generic",
      center: burg.cell,
      culture,
      rosterId: assignStateRoster({ culture, type: "Generic" }, pack.cultures),
      military: [],
      coa: oldOwner.coa ?? ({} as State["coa"]),
      economy: {
        ...noFinance(),
        salesTax: oldOwner.economy?.salesTax ?? 0,
        pollTax: oldOwner.economy?.pollTax ?? 0,
        treasury: 0
      }
    });
    burg.capital = 1;
    return i;
  }

  /** Raise a rebel militia at the burg from the local culture's roster. */
  private raiseRebelRegiment(stateId: number, burg: Burg): Regiment | null {
    const state = pack.states[stateId];
    if (!state?.i || state.removed) return null;
    const roster = this.burgDefenderRoster(burg) ?? Military.getRoster(state);
    const unitTypes = Military.getUnitTypes();
    const unitId = roster?.recruitable.find(id => unitTypes[id]) ?? Object.keys(unitTypes)[0];
    const unit = unitId ? unitTypes[unitId] : undefined;
    if (!unit) return null;

    const tier = settlementTierFromPop(burg.population ?? 0);
    const blocks = Math.min(20, 1 + Math.floor(tier / 2));
    const regiment = this.createRegiment(state);
    regiment.name = `Rebels of ${burg.name ?? "the wilds"}`;
    this.moveArmy(regiment, burg);
    regiment.units = Array.from({ length: blocks }, () => ({ type: unitId, hp: 1, exp: 0 }));
    syncRegimentTotals(regiment, unitTypes);
    return regiment;
  }

  private initialUnrest(stateId: number, burg: Burg): number {
    const tier = settlementTierFromPop(burg.population ?? 0);
    const rulerId = this.getState().states[stateId]?.rulerId;
    const alignment = pack.history?.figures?.find(figure => figure.i === rulerId)?.alignment;
    const cruelty = alignment === "evil" ? 4 : alignment === "chaotic" ? 2 : 0;
    return minmax(8 + tier + cruelty, 8, 16);
  }

  private bordersState(stateId: number, burg: Burg): boolean {
    return (pack.cells.c?.[burg.cell] ?? []).some(cell => pack.cells.state?.[cell] === stateId);
  }

  isAtWar(stateId: number, otherId: number): boolean {
    return pack.states[stateId]?.diplomacy?.[otherId] === "Enemy";
  }

  private declareWar(stateId: number, otherId: number): void {
    const subject = pack.states[stateId];
    const object = pack.states[otherId];
    if (!subject?.i || subject.removed || !object?.i || object.removed) return;
    if ((pack.history?.living?.states?.[stateId]?.peaceTreatyTurns?.[otherId] ?? 0) > 0) return;

    const living = this.getState();
    const sSim = living.states[stateId];
    // A non-aggression pact binds (Phase D): the war cannot start while it stands.
    if (this.hasTreaty(stateId, otherId, "nonAggression")) return;

    subject.diplomacy ??= [];
    object.diplomacy ??= [];
    subject.diplomacy[otherId] = "Enemy";
    object.diplomacy[stateId] = "Enemy";
    // War voids every treaty between the pair.
    if (sSim?.treaties) delete sSim.treaties[otherId];
    const oSim = living.states[otherId];
    if (oSim?.treaties) delete oSim.treaties[stateId];

    const text = `${subject.name} declared war on ${object.name}.`;
    this.pushNews(this.getState(), {
      kind: "war",
      text,
      cell: object.center,
      stateId,
      burgId: object.capital
    });
    this.pushHistory(
      "war",
      [
        { kind: "state", id: stateId },
        { kind: "state", id: otherId }
      ],
      object.center,
      text
    );

    // Defensive call-to-arms (Phase D): allies of the defender join the war.
    for (const other of pack.states) {
      if (!other?.i || other.removed || other.i === stateId || other.i === otherId) continue;
      if (!this.hasTreaty(otherId, other.i, "defensiveAlliance")) continue;
      if (this.isAtWar(stateId, other.i)) continue;
      other.diplomacy ??= [];
      subject.diplomacy ??= [];
      other.diplomacy[stateId] = "Enemy";
      subject.diplomacy[other.i] = "Enemy";
      this.pushNews(living, {
        kind: "war",
        text: `${other.name} answered ${object.name}'s call to arms against ${subject.name}.`,
        cell: object.center,
        stateId: other.i
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Diplomacy: treaties on top of FMG's native matrix (Phase D)
  // ---------------------------------------------------------------------------

  /** Does an active treaty of this kind bind the pair? */
  hasTreaty(stateId: number, otherId: number, kind: TreatyKind): boolean {
    const treaties = pack.history?.living?.states?.[stateId]?.treaties?.[otherId];
    return Array.isArray(treaties) && treaties.includes(kind);
  }

  private recordTreaty(aId: number, bId: number, kind: TreatyKind): void {
    const living = this.getState();
    for (const id of [aId, bId]) {
      const sSim = living.states[id];
      if (!sSim) continue;
      sSim.treaties ??= {};
      const list = sSim.treaties[id === aId ? bId : aId] ?? [];
      if (!list.includes(kind)) sSim.treaties[id === aId ? bId : aId] = [...list, kind];
    }
  }

  /**
   * FMG matrix floor for a treaty: positive treaties can't coexist with cold
   * relations, so signing lifts the matrix to at least the treaty's floor.
   * (Builds on FMG's native diplomacy rather than a parallel numeric relation.)
   */
  private treatyFloor(kind: TreatyKind): string {
    if (kind === "defensiveAlliance" || kind === "militaryAccess") return "Ally";
    return "Friendly";
  }

  private applyTreaty(aId: number, bId: number, kind: TreatyKind): void {
    const a = pack.states[aId];
    const b = pack.states[bId];
    if (!a?.i || !b?.i) return;
    this.recordTreaty(aId, bId, kind);

    const floor = this.treatyFloor(kind);
    a.diplomacy ??= [];
    b.diplomacy ??= [];
    if (!a.diplomacy[bId] || a.diplomacy[bId] === "Neutral" || a.diplomacy[bId] === "Unknown")
      a.diplomacy[bId] = "Friendly";
    if (!b.diplomacy[aId] || b.diplomacy[aId] === "Neutral" || b.diplomacy[aId] === "Unknown")
      b.diplomacy[aId] = "Friendly";
    if (floor === "Ally" && a.diplomacy[bId] !== "Enemy") a.diplomacy[bId] = "Ally";
    if (floor === "Ally" && b.diplomacy[aId] !== "Enemy") b.diplomacy[aId] = "Ally";
  }

  /**
   * Offer a treaty. AI targets answer instantly via their utility; the offer is
   * idempotent — a rejected offer just sours the FMG relation one step.
   */
  offerTreaty(fromId: number, toId: number, kind: TreatyKind): boolean {
    const from = pack.states[fromId];
    const to = pack.states[toId];
    if (!from?.i || from.removed || !to?.i || to.removed || fromId === toId) return false;
    if (this.isAtWar(fromId, toId) && kind !== "nonAggression") return false;
    if (this.hasTreaty(fromId, toId, kind)) return true; // already in force

    const verdict = this.aiAcceptsTreaty(toId, fromId, kind);
    if (verdict.accept) {
      this.applyTreaty(fromId, toId, kind);
      const living = this.getState();
      this.pushNews(living, {
        kind: "war",
        text: `${from.name} and ${to.name} signed a ${kind === "defensiveAlliance" ? "defensive alliance" : kind.replace(/([A-Z])/g, " $1").toLowerCase()} pact.`,
        cell: to.center,
        stateId: fromId
      });
      this.pushHistory(
        "war",
        [
          { kind: "state", id: fromId },
          { kind: "state", id: toId }
        ],
        to.center,
        `${from.name} and ${to.name} signed a ${kind} pact.`
      );
      return true;
    }

    // Pushy envoys cost goodwill: step the FMG relation one rung colder.
    from.diplomacy ??= [];
    to.diplomacy ??= [];
    if (from.diplomacy[toId] === "Friendly") {
      from.diplomacy[toId] = "Neutral";
      to.diplomacy[fromId] = "Neutral";
    } else if (from.diplomacy[toId] === "Neutral") {
      from.diplomacy[toId] = "Suspicion";
      to.diplomacy[fromId] = "Suspicion";
    }
    return false;
  }

  /**
   * AI treaty acceptance, ported from the campaign AI and re-expressed over
   * FMG's native relation strings + living's own war-exhaustion bookkeeping.
   */
  private aiAcceptsTreaty(aiId: number, fromId: number, kind: TreatyKind): { accept: boolean; reason: string } {
    const ai = pack.states[aiId];
    const from = pack.states[fromId];
    if (!ai?.i || ai.removed || !from?.i || from.removed) return { accept: false, reason: "not alive" };
    const relation = ai.diplomacy?.[fromId] ?? "Unknown";
    const atWar = this.isAtWar(aiId, fromId);
    const myStrength = this.stateStrength(aiId);
    const theirStrength = Math.max(1, this.stateStrength(fromId));
    const ratio = myStrength / theirStrength;

    switch (kind) {
      case "nonAggression":
        if (atWar) return { accept: false, reason: "we are at war" };
        return {
          accept: relation === "Neutral" || relation === "Friendly" || relation === "Ally",
          reason: relation === "Friendly" || relation === "Ally" ? "a cautious calm" : "we do not trust them"
        };
      case "trade":
        return {
          accept: !atWar && relation !== "Enemy" && relation !== "Rival" && relation !== "Suspicion",
          reason: "coin is coin"
        };
      case "defensiveAlliance":
      case "militaryAccess":
        if (atWar) return { accept: false, reason: "we are at war" };
        if (relation !== "Ally" && relation !== "Friendly") return { accept: false, reason: "alliances need trust" };
        if (ratio < 0.5) return { accept: false, reason: "you cannot shield us" };
        return { accept: true, reason: "shared interests" };
      default:
        return { accept: false, reason: "unknown treaty" };
    }
  }

  /** Total army strength of a state (men under arms). */
  private stateStrength(stateId: number): number {
    const state = pack.states[stateId];
    if (!state?.i || state.removed) return 0;
    return (state.military ?? []).reduce((sum, regiment) => sum + armyMen(regiment, Military.getUnitTypes()), 0);
  }

  /**
   * Confederation: a dying or devoted culture-mate peacefully merges into a
   * stronger cousin (ported from the campaign AI).
   */
  offerConfederation(byId: number, targetId: number): boolean {
    const by = pack.states[byId];
    const target = pack.states[targetId];
    if (!by?.i || by.removed || !target?.i || target.removed || byId === targetId) return false;
    if (target.culture !== by.culture) return false;

    const provinces = this.ownedProvinces(targetId).length;
    const living = this.getState();
    const tSim = living.states[targetId];
    const relation = target.diplomacy?.[byId] ?? "Unknown";
    const dying = provinces <= 2;
    const devoted = relation === "Ally" && this.stateStrength(targetId) * 2 <= this.stateStrength(byId);
    if (!dying && !devoted) return false;

    // Peaceful annexation of every target burg.
    for (const province of this.ownedProvinces(targetId)) {
      for (const burg of pack.burgs) {
        if (!burg?.i || burg.removed || burg.state !== targetId) continue;
        if (pack.cells.province?.[burg.cell] !== province.i) continue;
        this.annexBurg(byId, burg, false);
      }
    }
    if (tSim) tSim.agenda = null;
    this.pushNews(living, {
      kind: "conquest",
      text: `${target.name} confederated into ${by.name}.`,
      cell: by.center,
      stateId: byId
    });
    this.pushHistory(
      "conquest",
      [
        { kind: "state", id: byId },
        { kind: "state", id: targetId }
      ],
      by.center,
      `${target.name} joined ${by.name} in confederation.`
    );
    return true;
  }

  /**
   * AI states occasionally offer treaties to their neighbours (Phase D).
   * Deterministic per pair per season through the living PRNG.
   */
  private stepTreaties(living: LivingWorldState): void {
    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const neighbours = this.neighbourStates(state.i);
      for (const otherId of neighbours) {
        if (otherId <= state.i) continue; // one roll per pair
        const roll = this.rng(`treaty:${state.i}:${otherId}`, living.tick);
        if (!roll.chance(0.06)) continue;
        const kind = roll.choice<TreatyKind>(["nonAggression", "trade", "defensiveAlliance", "militaryAccess"]);
        if (this.hasTreaty(state.i, otherId, kind)) continue;
        if (this.isAtWar(state.i, otherId)) continue;
        this.offerTreaty(state.i, otherId, kind);
      }
    }
  }

  /** Directly adjacent states (shared border), neighbours only. */
  private neighbourStates(stateId: number): number[] {
    const out = new Set<number>();
    for (let cell = 0; cell < pack.cells.state.length; cell++) {
      if ((pack.cells.state[cell] ?? 0) !== stateId) continue;
      for (const neighbour of pack.cells.c?.[cell] ?? []) {
        const owner = pack.cells.state[neighbour] ?? 0;
        if (owner && owner !== stateId) out.add(owner);
      }
    }
    return [...out].filter(id => id > 0 && pack.states[id] && !pack.states[id].removed);
  }

  private logConquest(state: State, burg: Burg, forced: boolean): void {
    const text = forced
      ? `${state.name} stormed ${burg.name ?? "a settlement"} and annexed it.`
      : `${state.name} peacefully annexed ${burg.name ?? "a free settlement"}.`;
    this.pushNews(this.getState(), {
      kind: forced ? "conquest" : "colonize",
      text,
      cell: burg.cell,
      stateId: state.i,
      burgId: burg.i
    });
    this.pushHistory(
      "conquest",
      [
        { kind: "state", id: state.i },
        { kind: "burg", id: burg.i }
      ],
      burg.cell,
      text
    );
  }

  recordClaim(stateId: number, burg: Burg, heldByStateId: number): void {
    const sSim = this.getState().states[stateId];
    if (!sSim || stateId === heldByStateId) return;
    sSim.claims = sSim.claims.filter(claim => claim.burgId !== burg.i);
    sSim.claims.push({
      provinceId: pack.cells.province?.[burg.cell] || undefined,
      burgId: burg.i,
      lostYear: options.map.lore.calendar.year,
      heldByStateId
    });
  }

  private removeClaim(stateId: number, burgId: number): void {
    const sSim = this.getState().states[stateId];
    if (sSim) sSim.claims = sSim.claims.filter(claim => claim.burgId !== burgId);
  }

  recordGrudge(stateId: number, burg: Burg, reason: GrudgeReason, summary: string, againstStateId?: number): void {
    const sSim = this.getState().states[stateId];
    if (!sSim) return;
    sSim.grudges.push({
      id: sSim.grudges.length,
      againstStateId,
      targetBurgId: burg.i,
      reason,
      year: options.map.lore.calendar.year,
      weight: GRUDGE_WEIGHTS[reason],
      summary
    });
  }

  addBattleMarker(burgOrCell: Burg | number, label?: string): void {
    pack.markers ??= [];
    const markers = pack.markers;
    if (typeof burgOrCell === "number") {
      const [x, y] = pack.cells.p[burgOrCell] ?? [0, 0];
      markers.push({
        i: markers.length,
        type: "battlefields",
        icon: "⚔️",
        x,
        y,
        cell: burgOrCell,
        name: `Battle of ${label ?? "the wilds"}`
      });
    } else {
      markers.push({
        i: markers.length,
        type: "battlefields",
        icon: "⚔️",
        x: burgOrCell.x,
        y: burgOrCell.y,
        cell: burgOrCell.cell,
        name: `Battle of ${label ?? burgOrCell.name ?? "the wilds"}`
      });
    }
  }

  pushHistory(type: HistoryEventType, actors: HistRef[], cell: number | undefined, text: string): void {
    const history = Chronicle.sync();
    history.events ??= [];
    history.events.push({
      i: history.events.length,
      year: options.map.lore.calendar.year,
      type,
      actors,
      loc: cell,
      text
    });
  }

  /** Development cap for a province: floor(average biome habitability / growthPerHabitability). */
  provinceDevelopmentCap(provinceId: number): number {
    const cells = this.provinceCells(provinceId);
    if (cells.length === 0) return 0;

    let total = 0;
    for (const cell of cells) {
      const biomeId = pack.cells.biome?.[cell];
      total += (biomeId !== undefined ? pack.biomes?.[biomeId]?.habitability : undefined) ?? 50;
    }
    const perPoint = 20; // Civ economy: shipped growthPerHabitability, kept as a constant
    return Math.floor(total / cells.length / perPoint);
  }

  provinceCells(provinceId: number): number[] {
    const cells: number[] = [];
    const provinces = pack.cells.province;
    if (!provinces) return cells;
    for (let cell = 0; cell < provinces.length; cell++) {
      if (provinces[cell] === provinceId) cells.push(cell);
    }
    return cells;
  }

  private ownedProvinces(stateId: number): Province[] {
    return (pack.provinces ?? []).filter(province => province?.i && !province.removed && province.state === stateId);
  }

  private isProvinceGarrisoned(stateId: number, provinceId: number): boolean {
    const military = pack.states[stateId]?.military ?? [];
    return military.some(
      regiment =>
        regiment.a > 0 &&
        (pack.cells.province?.[regiment.cell] ?? 0) === provinceId &&
        (pack.cells.state?.[regiment.cell] ?? 0) === stateId
    );
  }

  private pickProvinceSettlement(provinceId: number, stateId: number): number | undefined {
    const province = pack.provinces?.[provinceId];
    const capital = province?.burg ? pack.burgs[province.burg] : undefined;
    if (capital && !capital.removed && capital.state === stateId) return capital.i;

    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.state !== stateId) continue;
      if ((pack.cells.province?.[burg.cell] ?? 0) === provinceId) return burg.i;
    }
    return undefined;
  }

  private pickMusterUnit(state: State): { unit: UnitType; regiment: Regiment | null } | null {
    const roster = Military.getRoster(state);
    const unitTypes = Military.getUnitTypes();
    if (!roster) return null;

    const living = this.getState();
    const sSim = living.states[state.i];
    if (!sSim) return null;

    const { content, config } = currentContent();
    const maxUnits = config.military.maxUnitsPerArmy;
    const heldBuildings = this.heldBuildings(state.i);
    const unlockSources = new Map<string, string[]>();
    for (const building of content.buildings) {
      for (const unitId of building.effects.unlock ?? []) {
        const sources = unlockSources.get(unitId) ?? [];
        sources.push(building.id);
        unlockSources.set(unitId, sources);
      }
    }
    const heldGoods = this.heldGoods(state.i);
    const maxWalls = this.maxOwnedWallTier(state.i);

    for (const unitId of roster.recruitable) {
      const unit = unitTypes[unitId];
      if (!unit) continue;
      const sources = unlockSources.get(unitId);
      if (sources && !sources.some(id => heldBuildings.has(id))) continue;
      if (unit.requiresGood !== undefined && !heldGoods.has(unit.requiresGood)) continue;
      if (unit.requiresWallTier !== undefined && maxWalls < unit.requiresWallTier) continue;

      const regiment = this.findRegimentForUnit(state, unitId, maxUnits, roster.caps[unitId]);
      // Civ economy owns army size via upkeep (Σ upkeep × hp, treasury,
      // settleDebt) — no per-muster fee (army integration).
      return { unit, regiment };
    }
    return null;
  }

  private findRegimentForUnit(state: State, unitId: string, maxUnits: number, cap?: number): Regiment | null {
    const unitTypes = Military.getUnitTypes();
    for (const regiment of state.military ?? []) {
      if (regiment.n) continue;
      if (isCivilianUnit((regiment.type ?? "").toLowerCase())) continue;
      if (!regiment.units) reconcileRegimentBlocks(regiment, unitTypes);
      const slots = regiment.units ?? [];
      if (slots.length >= maxUnits) continue;
      if (cap !== undefined && slots.filter(slot => slot.type === unitId).length >= cap) continue;
      return regiment;
    }
    return null;
  }

  createRegiment(state: State): Regiment {
    state.military ??= [];
    const military = state.military;
    const i = military.length ? Math.max(...military.map(regiment => regiment.i)) + 1 : 0;
    const capital = state.capital ? pack.burgs[state.capital] : undefined;
    const cell = capital?.cell ?? state.center ?? 0;
    const point = pack.cells.p?.[cell];
    const x = point?.[0] ?? capital?.x ?? 0;
    const y = point?.[1] ?? capital?.y ?? 0;
    const regiment: Regiment = {
      i,
      name: `${state.name} Levy`,
      a: 0,
      cell,
      x,
      y,
      bx: x,
      by: y,
      u: {},
      units: [],
      n: 0,
      icon: "⚔️",
      state: state.i
    };
    military.push(regiment);
    return regiment;
  }

  private heldBuildings(stateId: number): Set<string> {
    const ids = new Set<string>();
    const living = pack.history?.living;
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.state !== stateId) continue;
      for (const id of living?.burgs[burg.i]?.buildings ?? []) ids.add(id);
    }
    return ids;
  }

  private heldGoods(stateId: number): Set<number> {
    const goods = new Set<number>();
    if (!pack.cells.good) return goods;
    const living = pack.history?.living;
    for (let cell = 0; cell < pack.cells.good.length; cell++) {
      if (pack.cells.state?.[cell] !== stateId) continue;
      const provId = pack.cells.province?.[cell] ?? 0;
      const pSim = provId ? living?.provinces?.[provId] : null;
      if (pSim?.trouble?.theme === "resource") continue;
      const resourceFaction = provId
        ? Factions.active().find(f => RESOURCE_FACTION_IDS.includes(f.type) && this.factionProvinceId(f) === provId)
        : undefined;
      if (resourceFaction) continue;
      const good = pack.cells.good[cell];
      if (good) goods.add(good);
    }
    return goods;
  }

  private maxOwnedWallTier(stateId: number): number {
    let best = 0;
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.state !== stateId) continue;
      best = Math.max(best, Number(burg.walls ?? 0));
    }
    return best;
  }

  private canBuild(state: State, burg: Burg, bSim: BurgSimState, building: BuildingDef): boolean {
    const { content } = currentContent();
    if (building.kind && building.kind !== "structure") return false;
    if (building.group && building.group !== state.rosterId) return false;

    const kind = burg.capital ? "major" : "minor";
    if (!building.settlementKinds.includes(kind)) return false;
    if (building.requires && !bSim.buildings.includes(building.requires)) return false;

    const sameChain = bSim.buildings
      .map(id => content.buildings.find(entry => entry.id === id))
      .filter(
        (entry): entry is BuildingDef =>
          entry !== undefined && (!entry.kind || entry.kind === "structure") && entry.chain === building.chain
      );
    if (sameChain.some(entry => entry.tier >= building.tier)) return false;

    const sSim = pack.history?.living?.states[state.i];
    if (!sSim) return false;
    return true;
  }

  private pickBuildTarget(state: State): { burgId: number; buildingId: string } | null {
    const { content } = currentContent();
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.state !== state.i) continue;
      const bSim = pack.history?.living?.burgs[burg.i];
      if (!bSim || bSim.construction) continue;
      for (const building of content.buildings) {
        if (this.canBuild(state, burg, bSim, building)) return { burgId: burg.i, buildingId: building.id };
      }
    }
    return null;
  }

  private hasDevelopment(living: LivingWorldState, stateId: number): boolean {
    return this.ownedProvinces(stateId).some(province => Boolean(living.provinces[province.i]?.developmentProgress));
  }

  private hasConstruction(living: LivingWorldState, stateId: number): boolean {
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.state !== stateId) continue;
      if (living.burgs[burg.i]?.construction) return true;
    }
    return false;
  }

  private pickDevelopProvince(stateId: number, living: LivingWorldState): number | undefined {
    const capacityConfig = currentContent().config.capacity;
    for (const province of this.ownedProvinces(stateId)) {
      const pSim = living.provinces[province.i];
      if (!pSim || pSim.developmentProgress) continue;
      if (pSim.stability < capacityConfig.developStabilityCost) continue;
      if (pSim.development >= this.provinceDevelopmentCap(province.i)) continue;
      if (!this.pickProvinceSettlement(province.i, stateId)) continue;
      return province.i;
    }
    return undefined;
  }

  /** War options: press an ongoing war, calm a restive burg, retake a claim, absorb a free burg, or expand. */
  private warAgenda(state: State, sSim: StatePolitySim): StateAgenda | null {
    const army = this.fieldArmy(state);
    const bias = this.traitBias(state, sSim);

    // Defend: an at-war enemy regiment within aggro range of home territory
    // (absorbs the campaign AI threat evaluation + defensive interception).
    const threat = this.pickDefendTarget(state);
    if (threat) {
      const burg = pack.burgs[threat.nearBurgId];
      return {
        kind: "defend",
        label: `Defending ${burg?.name ?? "the border"} against ${threat.enemyState.name}`,
        targetBurgId: threat.nearBurgId,
        targetStateId: threat.enemyState.i,
        progress: 0,
        required: 1
      };
    }

    const target = army ? this.pickWarTarget(state, army) : null;
    if (target) return this.conquerAgenda(target);

    const restive = this.mostRestiveBurg(state.i, false);
    if (restive && this.rng("agenda:pacify", state.i).chance(0.15 + bias.pious * 0.35 + bias.civic * 0.15)) {
      return {
        kind: "pacify",
        label: `Pacifying ${restive.name ?? "a burg"}`,
        targetBurgId: restive.i,
        progress: 0,
        required: 1
      };
    }

    const reclaim = army ? this.pickReclaimTarget(state, sSim, army) : null;
    if (reclaim && this.rng("agenda:reclaim", state.i).chance(0.45 + bias.martial * 0.3)) {
      return {
        kind: "reclaim",
        label: `Reclaiming ${reclaim.name ?? "a burg"}`,
        targetBurgId: reclaim.i,
        progress: 0,
        required: 1
      };
    }

    const free = this.pickFreeBurgTarget(state, army);
    if (free && this.rng("agenda:colonize", state.i).chance(0.25 + bias.civic * 0.3 + bias.pious * 0.1)) {
      return {
        kind: "colonize",
        label: `Colonizing ${free.name ?? "a free town"}`,
        targetBurgId: free.i,
        progress: 0,
        required: 1
      };
    }

    // Raid: a martial ruler plunders an enemy border town for Gold + unrest.
    const raidTarget = army ? this.pickRaidTarget(state, army) : null;
    if (raidTarget && this.rng("agenda:raid", state.i).chance(0.08 + bias.martial * 0.35)) {
      return {
        kind: "raid",
        label: `Raiding ${raidTarget.name ?? "enemy lands"}`,
        targetBurgId: raidTarget.i,
        targetStateId: raidTarget.state,
        progress: 0,
        required: 1
      };
    }

    const neighbour = army ? this.pickConquerTarget(state, army) : null;
    if (neighbour && this.rng("agenda:conquer", state.i).chance(0.12 + bias.martial * 0.5)) {
      return this.conquerAgenda(neighbour);
    }
    return null;
  }

  private traitBias(state: State, sSim: StatePolitySim): FigureBias {
    const figure = pack.history?.figures?.find(entry => entry.i === sSim.rulerId);
    return figureBias(figure ?? {}, pack.cultures?.[state.culture ?? 0]?.values);
  }

  /** Grudges and claims against a state weigh its burgs up in target selection. */
  private casusBelli(stateId: number, otherId: number): number {
    const sSim = this.getState().states[stateId];
    if (!sSim || !otherId) return 0;
    const grudges = sSim.grudges
      .filter(grudge => grudge.againstStateId === otherId)
      .reduce((sum, grudge) => sum + grudge.weight, 0);
    const claims = sSim.claims.filter(claim => claim.heldByStateId === otherId).length * 20;
    return grudges + claims;
  }

  private conquerAgenda(burg: Burg): StateAgenda {
    return {
      kind: "conquer",
      label: `Attacking ${burg.name ?? "a burg"}`,
      targetBurgId: burg.i,
      targetStateId: burg.state,
      progress: 0,
      required: 1
    };
  }

  /** Best defended border burg of a state already at war. */
  /**
   * Defend target: the nearest at-war enemy army within aggro range of any home
   * major burg (absorbs the campaign AI threat evaluation). Returns the enemy
   * state and the home burg being threatened, or null when nothing threatens.
   */
  private pickDefendTarget(state: State): { enemyState: State; enemyCell: number; nearBurgId: number } | null {
    const living = this.getState();
    let best: { enemyState: State; enemyCell: number; nearBurgId: number; distance: number } | null = null;

    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.state !== state.i || !burg.capital) continue;
      const reach = this.cellHopDistances(burg.cell, UNIT_AGGRO_RANGE);
      for (const other of pack.states) {
        if (!other?.i || other.removed || other.i === state.i) continue;
        if (!this.isAtWar(state.i, other.i)) continue;
        for (const regiment of other.military ?? []) {
          const distance = reach.get(regiment.cell);
          if (distance === undefined) continue;
          if (!living.armies?.[this.unitKey(other.i, regiment.i)] || armyIsEmpty(regiment)) continue;
          if (!best || distance < best.distance) {
            best = { enemyState: other, enemyCell: regiment.cell, nearBurgId: burg.i, distance };
          }
        }
      }
      if (best && best.distance <= 2) break; // close threat wins immediately
    }
    return best;
  }

  /** Weakest enemy border burg for a raid: plunder Gold, seed unrest. */
  private pickRaidTarget(state: State, army: Regiment): Burg | null {
    return this.pickAssaultTarget(
      state,
      army,
      burg => {
        const defenders = this.cityGarrisonBlocks(burg);
        const totalHp = defenders.reduce((sum, block) => sum + block.hp, 0);
        return totalHp <= 2; // weakly held: a raid, not a siege
      },
      55
    );
  }

  private pickWarTarget(state: State, army: Regiment): Burg | null {
    return this.pickAssaultTarget(
      state,
      army,
      burg => this.isAtWar(state.i, burg.state ?? 0) && this.bordersState(state.i, burg),
      50,
      burg => this.casusBelli(state.i, burg.state ?? 0)
    );
  }

  /** Best border burg of a neighbour the state has not fought yet. */
  private pickConquerTarget(state: State, army: Regiment): Burg | null {
    return this.pickAssaultTarget(
      state,
      army,
      burg => !this.isAtWar(state.i, burg.state ?? 0) && this.bordersState(state.i, burg),
      50,
      burg => this.casusBelli(state.i, burg.state ?? 0)
    );
  }

  private pickAssaultTarget(
    state: State,
    army: Regiment,
    accept: (burg: Burg) => boolean,
    minOdds: number,
    score: (burg: Burg) => number = () => 0
  ): Burg | null {
    let best: Burg | null = null;
    let bestValue = 0;
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || !burg.state || burg.state === state.i || burg.capital) continue;
      if (!accept(burg)) continue;
      const odds = this.assaultOdds(state.i, burg, army);
      if (odds < minOdds) continue;
      const value = odds + score(burg);
      if (value <= bestValue) continue;
      best = burg;
      bestValue = value;
    }
    return best;
  }

  /** A burg on the state's claim list still held by its conqueror. */
  private pickReclaimTarget(state: State, sSim: StatePolitySim, army: Regiment): Burg | null {
    let best: Burg | null = null;
    let bestOdds = 0;
    for (const claim of sSim.claims) {
      const burg = pack.burgs[claim.burgId];
      if (!burg?.i || burg.removed || !burg.state || burg.state !== claim.heldByStateId) continue;
      if (burg.state === state.i) continue;
      const odds = this.assaultOdds(state.i, burg, army);
      if (odds < 45 || odds <= bestOdds) continue;
      best = burg;
      bestOdds = odds;
    }
    return best;
  }

  /** Adjacent Free Burg: kin or co-religionists always, strangers only if the army can win. */
  private pickFreeBurgTarget(state: State, army: Regiment | null): Burg | null {
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.state !== 0) continue;
      if (!this.bordersState(state.i, burg)) continue;
      if (this.sharesKinshipOrFaith(state.i, burg.i)) return burg;
      if (army && this.assaultOdds(state.i, burg, army) >= 50) return burg;
    }
    return null;
  }

  private chooseAgenda(state: State, sSim: StatePolitySim, living: LivingWorldState): StateAgenda | null {
    const capacityConfig = currentContent().config.capacity;
    const hasFieldArmy = this.fieldArmy(state) !== null;
    if (!hasFieldArmy && this.pickMusterUnit(state)) {
      return { kind: "muster", label: "Mustering troops", progress: 0, required: 1 };
    }

    const factionProvince = this.ownedProvinces(state.i)
      .map(p => {
        const faction = Factions.active().find(f => {
          if (f.allegiance !== "hostile" && f.allegiance !== "clandestine") return false;
          const provId =
            f.hq.provinceId ??
            (f.hq.burgId ? pack.cells.province?.[pack.burgs?.[f.hq.burgId]?.cell ?? 0] : undefined) ??
            pack.cells?.province?.[f.hq.cell];
          return provId === p.i;
        });
        return { province: p, faction };
      })
      .filter((entry): entry is { province: Province; faction: import("@/types/factions").Faction } =>
        Boolean(entry.faction)
      )
      .sort((a, b) => (b.faction.military?.[0]?.a ?? 0) - (a.faction.military?.[0]?.a ?? 0))[0];

    if (factionProvince) {
      const army = this.fieldArmy(state);
      const armyMenValue = army ? armyMen(army, Military.getUnitTypes()) : 0;
      const defMen = (factionProvince.faction.military ?? []).reduce((s, r) => s + (r.a ?? 0), 0);
      if (army && (armyMenValue >= defMen * 0.85 || sSim.warExhaustion < 40)) {
        return {
          kind: "clear_faction",
          label: `Marching against ${factionProvince.faction.name} in ${factionProvince.province.name}`,
          targetProvinceId: factionProvince.province.i,
          progress: 0,
          required: 1
        };
      }
      if ((state.economy.treasury ?? 0) >= 40) {
        return {
          kind: "hire_adventurers",
          label: `Hiring adventurers against ${factionProvince.faction.name} in ${factionProvince.province.name}`,
          targetProvinceId: factionProvince.province.i,
          progress: 0,
          required: 1
        };
      }
    }

    const suppression = this.pickFactionSuppressionTarget(state);
    if (suppression) {
      return {
        kind: "suppress_faction",
        label: `Suppressing ${suppression.faction.name} in ${factionSuppressionLocationName(suppression)}`,
        targetFactionId: suppression.faction.i,
        ...(suppression.burg?.i
          ? { targetBurgId: suppression.burg.i }
          : { targetCell: factionSuppressionTargetCell(suppression) }),
        progress: 0,
        required: 1
      };
    }

    const war = this.warAgenda(state, sSim);
    if (war) return war;

    const provinceId = this.pickDevelopProvince(state.i, living);
    if (provinceId !== undefined) {
      const province = pack.provinces?.[provinceId];
      return {
        kind: "develop",
        label: `Developing ${province?.name ?? "a province"}`,
        targetProvinceId: provinceId,
        progress: 0,
        required: capacityConfig.developTurns
      };
    }

    const build = this.pickBuildTarget(state);
    if (build) {
      const building = currentContent().content.buildings.find(entry => entry.id === build.buildingId);
      return {
        kind: "build",
        label: `Building ${building?.name ?? build.buildingId}`,
        targetBurgId: build.burgId,
        buildingId: build.buildingId,
        progress: 0,
        required: 3
      };
    }

    if (this.pickMusterUnit(state)) {
      return { kind: "muster", label: "Mustering troops", progress: 0, required: 1 };
    }
    return null;
  }

  private stepAgenda(state: State, sSim: StatePolitySim, living: LivingWorldState): void {
    const agenda = sSim.agenda;
    if (!agenda) return;

    switch (agenda.kind) {
      case "clear_faction": {
        const provinceId = agenda.targetProvinceId;
        if (provinceId === undefined) {
          sSim.agenda = null;
          return;
        }
        this.assaultFaction(state.i, provinceId);
        agenda.progress += 1;
        const cleared = !Factions.active().some(f => {
          const provId =
            f.hq.provinceId ??
            (f.hq.burgId ? pack.cells.province?.[pack.burgs?.[f.hq.burgId]?.cell ?? 0] : undefined) ??
            pack.cells?.province?.[f.hq.cell];
          return provId === provinceId && (f.allegiance === "hostile" || f.allegiance === "clandestine");
        });
        if (agenda.progress >= agenda.required || cleared) {
          sSim.agenda = null;
        }
        return;
      }
      case "hire_adventurers": {
        const provinceId = agenda.targetProvinceId;
        if (provinceId === undefined) {
          sSim.agenda = null;
          return;
        }
        this.sendAdventurersToFaction(state.i, provinceId);
        agenda.progress += 1;
        const cleared = !Factions.active().some(f => {
          const provId =
            f.hq.provinceId ??
            (f.hq.burgId ? pack.cells.province?.[pack.burgs?.[f.hq.burgId]?.cell ?? 0] : undefined) ??
            pack.cells?.province?.[f.hq.cell];
          return provId === provinceId && (f.allegiance === "hostile" || f.allegiance === "clandestine");
        });
        if (agenda.progress >= agenda.required || cleared) {
          sSim.agenda = null;
        }
        return;
      }
      case "develop": {
        if (this.hasDevelopment(living, state.i)) return;
        const provinceId = agenda.targetProvinceId ?? this.pickDevelopProvince(state.i, living);
        if (provinceId === undefined || !this.startDevelop(state.i, provinceId)) sSim.agenda = null;
        return;
      }
      case "build": {
        if (this.hasConstruction(living, state.i)) return;
        const target =
          agenda.targetBurgId !== undefined && agenda.buildingId
            ? { burgId: agenda.targetBurgId, buildingId: agenda.buildingId }
            : this.pickBuildTarget(state);
        if (!target || !this.startBuild(state.i, target.burgId, target.buildingId)) sSim.agenda = null;
        return;
      }
      case "muster": {
        if (this.muster(state.i)) agenda.progress = Math.min(agenda.required, agenda.progress + 1);
        if (agenda.progress >= agenda.required) sSim.agenda = null;
        return;
      }
      case "colonize": {
        if (agenda.targetBurgId !== undefined) this.colonize(state.i, agenda.targetBurgId);
        sSim.agenda = null;
        return;
      }
      case "conquer": {
        if (agenda.targetBurgId === undefined) {
          sSim.agenda = null;
          return;
        }
        if (!this.conquerBurg(state.i, agenda.targetBurgId)) {
          // OpenCiv armies march for a few seasons before the offensive is called off.
          agenda.progress += 1;
          if (agenda.progress >= 6) sSim.agenda = null;
          return;
        }
        sSim.agenda = null;
        return;
      }
      case "reclaim": {
        if (agenda.targetBurgId === undefined) {
          sSim.agenda = null;
          return;
        }
        if (!this.reclaimBurg(state.i, agenda.targetBurgId)) {
          agenda.progress += 1;
          if (agenda.progress >= 6) sSim.agenda = null;
          return;
        }
        sSim.agenda = null;
        return;
      }
      case "pacify": {
        const burg = agenda.targetBurgId !== undefined ? pack.burgs[agenda.targetBurgId] : undefined;
        const unrest = burg ? (living.burgs[burg.i]?.unrest ?? 0) : 0;
        if (!burg || burg.removed || burg.state !== state.i || unrest <= 0) sSim.agenda = null;
        return;
      }
      case "defend": {
        // The army marches home via tacticalTarget; the goal clears when the
        // threat is gone (enemy destroyed or moved out of aggro range).
        if (!this.pickDefendTarget(state)) sSim.agenda = null;
        return;
      }
      case "raid": {
        const burg = agenda.targetBurgId !== undefined ? pack.burgs[agenda.targetBurgId] : undefined;
        if (!burg || burg.removed || !burg.state || burg.state === state.i) {
          sSim.agenda = null;
          return;
        }
        const army = this.fieldArmy(state);
        if (!army) {
          agenda.progress += 1;
          if (agenda.progress >= 6) sSim.agenda = null; // no field army: call off
          return;
        }
        const adjacent = (pack.cells.c?.[burg.cell] ?? []).includes(army.cell) || army.cell === burg.cell;
        if (!adjacent) {
          agenda.progress += 1;
          if (agenda.progress >= 6) sSim.agenda = null; // marching for a few seasons
          return;
        }
        // Plunder: Gold to the treasury, unrest to the burg.
        const bSim = living.burgs[burg.i];
        const booty = Math.round((bSim?.citizens ?? 1) * 2 + 10);
        state.economy.treasury = (state.economy.treasury ?? 0) + booty;
        if (bSim) bSim.unrest = (bSim.unrest ?? 0) + 8;
        this.declareWar(state.i, burg.state);
        const raidState = pack.states[burg.state];
        this.pushNews(living, {
          kind: "raid",
          text: `${state.name} raided ${burg.name}, plundering ${booty} Gold.`,
          cell: burg.cell,
          stateId: state.i,
          burgId: burg.i
        });
        this.pushHistory(
          "conquest",
          [{ kind: "state", id: state.i }],
          burg.cell,
          `${state.name} raided ${burg.name} and carried off ${booty} Gold${raidState ? ` from ${raidState.name}` : ""}.`
        );
        agenda.progress += 1;
        if (agenda.progress >= agenda.required) sSim.agenda = null;
        return;
      }
      case "suppress_faction": {
        const factionId = agenda.targetFactionId;
        if (factionId === undefined) {
          sSim.agenda = null;
          return;
        }
        // Resolve the current node, preferring one already queued in the agenda burg.
        let target: FactionSuppressionTarget | null = null;
        const agendaBurg = agenda.targetBurgId !== undefined ? pack.burgs[agenda.targetBurgId] : undefined;
        const queuedItem = agendaBurg
          ? (living.burgs[agendaBurg.i]?.productionQueue ?? []).find(
              item =>
                item.kind === "operation" &&
                item.id === FACTION_SUPPRESSION_OPERATION_ID &&
                item.targetFactionId === factionId
            )
          : undefined;
        if (queuedItem) target = this.resolveFactionSuppressionTarget(state, queuedItem);
        if (!target && agendaBurg) {
          target =
            this.eligibleFactionSuppressionTargets(state.i).find(
              entry => entry.faction.i === factionId && entry.burg?.i === agendaBurg.i
            ) ?? null;
        }
        if (!target && agenda.targetCell !== undefined) {
          target =
            this.eligibleFactionSuppressionTargets(state.i).find(
              entry => entry.faction.i === factionId && entry.wilderness && entry.cell === agenda.targetCell
            ) ?? null;
        }
        target ??= this.eligibleFactionSuppressionTargets(state.i).find(entry => entry.faction.i === factionId) ?? null;
        if (!target) {
          sSim.agenda = null;
          return;
        }
        agenda.targetFactionId = target.faction.i;
        agenda.targetBurgId = target.burg?.i;
        agenda.targetCell = target.burg?.i ? undefined : target.cell;
        agenda.label = `Suppressing ${target.faction.name} in ${factionSuppressionLocationName(target)}`;

        // A failed storm (or a guarded stall) pauses the campaign briefly.
        if (agenda.stallUntilTick !== undefined && living.tick < agenda.stallUntilTick) return;

        if (target.wilderness) {
          // Military-only: the field army marches via tacticalTarget (targetCell)
          // and storms the stronghold once adjacent; a defending guard is
          // handled by normal army-vs-guard combat first.
          if (!this.factionNodeHasGuard(target.faction, target.node)) {
            this.assaultFactionNode(state.i, target.faction.i, target.nodeKey);
          }
          return;
        }

        const bSim = living.burgs[target.burg!.i];
        if (!bSim?.isMajor) return;
        this.enqueueFactionSuppression(target, living);

        // Unguarded low-influence / fortified nodes can be stormed directly; the
        // production operation keeps running and resumes if the assault fails.
        if (
          !this.factionNodeHasGuard(target.faction, target.node) &&
          this.factionNodeAssaultable(target.node, target.isHq)
        ) {
          this.assaultFactionNode(state.i, target.faction.i, target.nodeKey);
        }
        return;
      }
      default:
        sSim.agenda = null;
    }
  }

  private advanceDevelopment(state: State, sSim: StatePolitySim, living: LivingWorldState): void {
    for (const province of this.ownedProvinces(state.i)) {
      const pSim = living.provinces[province.i];
      const progress = pSim?.developmentProgress;
      if (!pSim || !progress) continue;

      progress.turnsLeft = Math.max(0, progress.turnsLeft - 1);
      if (sSim.agenda?.kind === "develop" && sSim.agenda.targetProvinceId === province.i) {
        sSim.agenda.progress = Math.min(sSim.agenda.required, sSim.agenda.required - progress.turnsLeft);
      }
      if (progress.turnsLeft > 0) continue;

      pSim.development += 1;
      const burg = pack.burgs[progress.settlementId];
      if (burg && !burg.removed) {
        const growth = this.rng("develop:growth", burg.i).range(0.05, 0.15);
        burg.population = Math.round((burg.population ?? 0) * (1 + growth) * 100) / 100;
        const bSim = living.burgs[burg.i];
        if (bSim) bSim.baseTier = settlementTierFromPop(burg.population);
      }
      pSim.developmentProgress = null;
      if (sSim.agenda?.kind === "develop" && sSim.agenda.targetProvinceId === province.i) {
        sSim.agenda = null;
      }

      this.pushNews(living, {
        kind: "develop",
        text: `${state.name} completed development in ${province.name ?? "a province"}${
          burg?.name ? ` (${burg.name})` : ""
        }.`,
        cell: burg?.cell,
        stateId: state.i,
        burgId: burg?.i
      });
    }
  }

  private advanceConstructions(state: State, sSim: StatePolitySim, living: LivingWorldState): void {
    const { content } = currentContent();
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.state !== state.i) continue;
      const bSim = living.burgs[burg.i];
      const construction = bSim?.construction;
      if (!bSim || !construction) continue;

      const building = content.buildings.find(entry => entry.id === construction.buildingId);
      if (!building) {
        bSim.construction = null;
        continue;
      }

      construction.turnsLeft = Math.max(0, construction.turnsLeft - 1);

      // Building time is the whole gate now: the Civ economy owns construction
      // (Phase E retired the 3-check value rolls).
      if (construction.turnsLeft === 0) {
        this.completeConstruction(state, sSim, living, burg, bSim, building);
      }
    }
  }

  private completeConstruction(
    state: State,
    sSim: StatePolitySim,
    living: LivingWorldState,
    burg: Burg,
    bSim: BurgSimState,
    building: BuildingDef
  ): void {
    const { content } = currentContent();
    bSim.buildings = bSim.buildings.filter(id => {
      const other = content.buildings.find(entry => entry.id === id);
      if (!other || other.kind === "custom") return true;
      return other.chain !== building.chain || other.tier > building.tier;
    });
    bSim.buildings.push(building.id);
    syncBurgFlagsFromBuildings(burg, bSim.buildings);
    bSim.construction = null;

    if (sSim.agenda?.kind === "build" && sSim.agenda.targetBurgId === burg.i) sSim.agenda = null;

    this.pushNews(living, {
      kind: "build",
      text: `${state.name} completed ${building.name} in ${burg.name ?? "a settlement"}.`,
      cell: burg.cell,
      stateId: state.i,
      burgId: burg.i
    });
  }

  /** Step province order, stability, and trouble progression. */
  /** Province a faction HQ sits in (for province-level threat pressure). */
  private factionProvinceId(faction: import("@/types/factions").Faction): number {
    return (
      faction.hq.provinceId ??
      (faction.hq.burgId ? pack.cells.province?.[pack.burgs?.[faction.hq.burgId]?.cell ?? 0] : undefined) ??
      pack.cells?.province?.[faction.hq.cell] ??
      0
    );
  }

  private stepProvinces(living: LivingWorldState): void {
    const { config } = currentContent();
    const unrestByProvince = new Map<number, number>();
    for (const key of Object.keys(living.burgs)) {
      const bSim = living.burgs[Number(key)];
      if (!bSim || bSim.unrest <= 0) continue;
      const burg = pack.burgs[bSim.burgId];
      if (!burg?.i || burg.removed || !burg.state) continue;
      const provinceId = pack.cells.province?.[burg.cell] ?? 0;
      if (!provinceId) continue;
      unrestByProvince.set(provinceId, (unrestByProvince.get(provinceId) ?? 0) + bSim.unrest);
    }

    for (const province of pack.provinces ?? []) {
      if (!province?.i || province.removed) continue;
      const pSim = living.provinces[province.i];
      if (!pSim || !province.state || pack.states[province.state]?.removed) continue;
      const sSim = living.states[province.state];

      if (pSim.trouble) {
        pSim.trouble.seasonsUnchecked = (pSim.trouble.seasonsUnchecked ?? 0) + 1;
        if (pSim.trouble.seasonsUnchecked % 2 === 0) {
          pSim.trouble.level = Math.min(10, pSim.trouble.level + 1);
        }
        if (pSim.trouble.level >= 8 && pSim.trouble.seasonsUnchecked >= 4) {
          if (sSim) sSim.unravel = minmax(sSim.unravel + 3, 0, 100);
          if (pSim.developmentProgress) pSim.developmentProgress = null;
        }

        const unchecked = pSim.trouble.seasonsUnchecked;
        const lvl = pSim.trouble.level;
        if (unchecked >= 3 || lvl >= 5) {
          const metaChance = lvl >= 10 ? 1 : Math.max(0, (unchecked - 2) * 0.06 + Math.max(0, lvl - 4) * 0.04);
          const rngMeta = this.rng("trouble:metastasize", province.i, living.tick);
          if (rngMeta.chance(metaChance)) {
            // Unchecked hazards fester into a dangerous faction, not a lair
            this.spawnDangerousFaction(province.i, undefined, pSim.trouble.theme, lvl);
            pSim.trouble = null;
          }
        }
      }

      const hostiles = Factions.active().filter(
        f => (f.allegiance === "hostile" || f.allegiance === "clandestine") && this.factionProvinceId(f) === province.i
      );
      for (const hostile of hostiles) {
        hostile.seasonsActive = (hostile.seasonsActive ?? 0) + 1;
        if (sSim) sSim.unravel = minmax(sSim.unravel + 2, 0, 100);
        if (pSim.developmentProgress) pSim.developmentProgress = null;
        pSim.order = Math.max(0, pSim.order - 2);
      }

      if (this.isProvinceGarrisoned(province.state, province.i)) {
        if (!pSim.trouble && hostiles.length === 0) pSim.stability += 1;
        pSim.order = Math.min(100, pSim.order + 2);
      } else if (pSim.order < config.economy.startOrder) {
        pSim.order = Math.min(config.economy.startOrder, pSim.order + 1);
      } else {
        pSim.order = Math.max(config.economy.startOrder, pSim.order - 1);
      }

      const unrest = unrestByProvince.get(province.i) ?? 0;
      if (unrest > 0) pSim.order = Math.max(0, pSim.order - Math.round((15 * unrest) / 12));
      if (pSim.trouble) {
        pSim.order = Math.max(0, pSim.order - pSim.trouble.level * 2);
      }
      pSim.order = minmax(pSim.order, 0, 100);

      // Seasonal trouble spawning
      if (!pSim.trouble && hostiles.length === 0) {
        const rng = this.rng("trouble:spawn", province.i, living.tick);
        let spawnChance = 0.12;
        if (pSim.order < 50) spawnChance += 0.08;
        if (pSim.order < 25) spawnChance += 0.05;
        if (sSim && sSim.unravel > 50) spawnChance += 0.05;
        if (this.isProvinceGarrisoned(province.state, province.i)) spawnChance -= 0.05;
        spawnChance = minmax(spawnChance, 0.03, 0.4);

        if (rng.chance(spawnChance)) {
          this.spawnTrouble(province.i);
        }
      }
    }
  }

  /** Seasonal simulation step for autonomous factions */
  stepFactions(living: LivingWorldState): void {
    if (pack.factions && pack.factions.length > 1) {
      this.stepFactionAgendas(living);
      this.stepFactionMilitaryAndRaids(living);
    }
  }

  /** Faction node (HQ or outpost) sitting in a province, with its sim. */
  private factionNodeInProvince(faction: import("@/types/factions").Faction, provinceId: number) {
    const entries: {
      node: import("@/types/factions").FactionHq | import("@/types/factions").FactionOutpost;
      isHq: boolean;
    }[] = [
      { node: faction.hq, isHq: true },
      ...(faction.outposts ?? []).map(outpost => ({ node: outpost, isHq: false }))
    ];
    for (const entry of entries) {
      const nodeProvId =
        (entry.node as import("@/types/factions").FactionHq).provinceId ??
        (entry.node.burgId ? pack.cells.province?.[pack.burgs?.[entry.node.burgId]?.cell ?? 0] : undefined) ??
        pack.cells.province?.[entry.node.cell];
      if (nodeProvId === provinceId) return { ...entry, sim: ensureFactionNodeSim(entry.node, entry.isHq) };
    }
    return null;
  }

  /** Warmth ladder for faction-state relations: Enemy ... Ally. */
  private improveFactionRelation(faction: import("@/types/factions").Faction, stateId: number): void {
    const ladder = ["Enemy", "Rival", "Suspicion", "Neutral", "Friendly", "Ally"] as const;
    const current = faction.stateRelations[stateId] ?? "Neutral";
    const idx = ladder.indexOf(current);
    if (idx >= 0 && idx < ladder.length - 1) faction.stateRelations[stateId] = ladder[idx + 1];
  }

  /**
   * Clear trouble as a production clock (faction-trouble conversion Phase 2):
   * adventuring/religious/commercial factions bank their node's Production
   * each season toward `40 + 20 * level` and clear the hazard on completion.
   */
  private stepFactionClearTrouble(faction: import("@/types/factions").Faction, living: LivingWorldState): void {
    const agenda = faction.agenda;
    if (agenda?.kind === "clear_trouble") {
      const provinceId = agenda.targetProvinceId;
      const pSim = provinceId !== undefined ? living.provinces[provinceId] : undefined;
      if (provinceId === undefined || !pSim?.trouble) {
        faction.agenda = null;
        return;
      }
      const node = this.factionNodeInProvince(faction, provinceId);
      if (!node) {
        faction.agenda = null;
        return;
      }
      agenda.progress += Math.max(0, node.sim.cityYields?.production ?? 0);
      if (agenda.progress >= agenda.required) {
        const troubleName = pSim.trouble.name;
        const province = pack.provinces?.[provinceId];
        pSim.trouble = null;
        pSim.order = Math.min(100, pSim.order + 10);
        pSim.stability += 1;
        const hostStateId = province?.state ?? 0;
        const before = hostStateId ? (faction.stateRelations[hostStateId] ?? "Neutral") : undefined;
        if (hostStateId) this.improveFactionRelation(faction, hostStateId);
        faction.influence = Math.min(100, (faction.influence ?? 0) + 10);
        const standing =
          before && before !== faction.stateRelations[hostStateId]
            ? `, improving relations with ${pack.states[hostStateId]?.name ?? "the state"}`
            : "";
        this.pushNews(living, {
          kind: "trouble",
          text: `${faction.name} cleared the ${troubleName} afflicting ${province?.name ?? "the province"}${standing}.`,
          cell: province?.center ?? node.node.cell,
          burgId: node.node.burgId
        });
        this.pushHistory(
          "deed",
          [{ kind: "state", id: province?.state ?? 0 }],
          province?.center ?? node.node.cell,
          `${faction.name} cleared the ${troubleName} afflicting ${province?.name ?? "the province"}.`
        );
        faction.agenda = null;
      }
      return;
    }

    // Assignment: only caretaker categories, only with a node in a troubled province.
    if (agenda || !["adventuring", "religious", "commercial"].includes(faction.category)) return;
    const nodes = [
      { node: faction.hq, isHq: true },
      ...(faction.outposts ?? []).map(outpost => ({ node: outpost, isHq: false }))
    ];
    let best: { provinceId: number; level: number } | null = null;
    for (const entry of nodes) {
      const nodeProvId =
        (entry.node as import("@/types/factions").FactionHq).provinceId ??
        (entry.node.burgId ? pack.cells.province?.[pack.burgs?.[entry.node.burgId]?.cell ?? 0] : undefined) ??
        pack.cells.province?.[entry.node.cell];
      if (!nodeProvId) continue;
      const trouble = living.provinces[nodeProvId]?.trouble;
      if (trouble && (!best || trouble.level > best.level)) best = { provinceId: nodeProvId, level: trouble.level };
    }
    if (best) {
      const province = pack.provinces?.[best.provinceId];
      const trouble = living.provinces[best.provinceId]!.trouble!;
      faction.agenda = {
        kind: "clear_trouble",
        label: `Clearing ${trouble.name} in ${province?.name ?? "the province"}`,
        targetProvinceId: best.provinceId,
        progress: 0,
        required: 40 + 20 * best.level
      };
    }
  }

  /** Step faction agendas: patron severance, clear-trouble production clocks and turf clashes (expansion is via Settlers in Phase 4) */
  stepFactionAgendas(living: LivingWorldState): void {
    const activeFactions = Factions.active();
    const rng = this.rng("faction:agendas", living.tick);

    for (const faction of activeFactions) {
      this.stepFactionClearTrouble(faction, living);

      if (faction.allegiance === "state_arm" && faction.patronStateId) {
        const patronSim = living.states?.[faction.patronStateId];
        const patron = pack.states?.[faction.patronStateId];
        if (!patron || patron.removed || (patronSim?.unravel ?? 0) >= 60) {
          faction.allegiance =
            faction.alignment === "evil" || faction.alignment === "chaotic" ? "hostile" : "autonomous";
          faction.stateRelations[faction.patronStateId] = "Enemy";
          faction.patronStateId = undefined;
          this.pushNews(living, {
            kind: "faction",
            text: `${faction.name} severed allegiance from its crumbling patron!`,
            cell: faction.hq.cell,
            burgId: faction.hq.burgId
          });
        }
      }

      for (const outpost of faction.outposts) {
        if (outpost.pillaged) continue;
        const otherFactions = Factions.atBurg(outpost.burgId).filter(f => f.i !== faction.i);
        for (const rival of otherFactions) {
          const rivalOutpost = rival.outposts.find(o => o.burgId === outpost.burgId && !o.pillaged);
          if (!rivalOutpost) continue;

          const isEnemy =
            faction.factionRelations[rival.i] === "Enemy" ||
            rival.factionRelations[faction.i] === "Enemy" ||
            (faction.category === "underworld" && rival.category === "underworld");

          if (isEnemy) {
            const myPower = outpost.influence + rng.d(20);
            const rivalPower = rivalOutpost.influence + rng.d(20);

            const burg = pack.burgs?.[outpost.burgId];
            if (myPower >= rivalPower) {
              rivalOutpost.influence = Math.max(0, rivalOutpost.influence - 20);
              if (rivalOutpost.influence <= 0) rivalOutpost.pillaged = true;
              outpost.influence = Math.min(100, outpost.influence + 10);
              faction.treasury += 25;
              this.pushNews(living, {
                kind: "faction",
                text: `${faction.name} outmaneuvered ${rival.name} in the streets of ${burg?.name ?? "the city"}!`,
                cell: outpost.cell,
                burgId: outpost.burgId
              });
            } else {
              outpost.influence = Math.max(0, outpost.influence - 20);
              if (outpost.influence <= 0) outpost.pillaged = true;
              rivalOutpost.influence = Math.min(100, rivalOutpost.influence + 10);
              rival.treasury += 25;
            }

            const bSim = living.burgs?.[outpost.burgId];
            if (bSim) bSim.unrest = Math.min(100, (bSim.unrest ?? 0) + 2);
            break;
          }
        }
      }
    }
  }

  /** Entrenched-sovereignty check: hostile factions ascend when order has collapsed. Combat and expansion run in stepTactical. */
  stepFactionMilitaryAndRaids(living: LivingWorldState): void {
    for (const faction of Factions.active()) {
      if (faction.allegiance === "hostile" || faction.allegiance === "clandestine") {
        this.tickFactionRaid(faction, living);
      }
      if (
        faction.sovereignAmbition &&
        faction.allegiance === "hostile" &&
        (faction.seasonsActive ?? 0) >= 8 &&
        (faction.researchedTechs?.length ?? 0) >= 2
      ) {
        const provId = faction.hq.provinceId ?? pack.cells?.province?.[faction.hq.cell] ?? 0;
        const pSim = provId ? living.provinces?.[provId] : undefined;
        const sSim =
          provId && pack.provinces?.[provId]?.state ? living.states?.[pack.provinces[provId].state] : undefined;
        const localBurgs =
          pack.burgs?.filter(b => b?.i && !b.removed && pack.cells.province?.[b.cell] === provId) ?? [];
        const noBurgs = localBurgs.length === 0;
        const collapsedOrder = Boolean(pSim && pSim.order <= 15);
        const stateInTurmoil = Boolean(sSim && (sSim.unravel >= 50 || sSim.warExhaustion >= 50));
        if (noBurgs || collapsedOrder || stateInTurmoil) {
          const nonCapBurg = collapsedOrder ? localBurgs.find(b => !b.capital) : undefined;
          this.ascendFactionToState(faction.i, nonCapBurg?.i);
        }
      }
    }
  }

  /** Faction raid tick: hostile/clandestine factions sack plausible settlements, ported from the retired lair raids. */
  private tickFactionRaid(faction: import("@/types/factions").Faction, living: LivingWorldState): void {
    const provinceId = faction.hq.provinceId ?? pack.cells?.province?.[faction.hq.cell] ?? 0;
    const province = provinceId ? pack.provinces?.[provinceId] : undefined;
    const pSim = provinceId ? living.provinces?.[provinceId] : undefined;

    const rng = this.rng("faction:raid", faction.i * 1000 + provinceId, living.tick);
    const shouldRaid = faction.raidPending || rng.d(6) >= (faction.raidThreshold ?? 6);
    if (!shouldRaid) return;

    const unitTypes = Military.getUnitTypes();
    const raidBlocks = (faction.military ?? []).flatMap(reg => (reg.units ?? []).filter(u => u.hp > 0));
    const raidUnits = toBattleUnitsMen(raidBlocks, unitTypes);
    const raidMen = raidUnits.reduce((sum, u) => sum + u.count, 0);
    if (raidUnits.length === 0 || raidMen <= 0) return;

    // 1. Identify target burgs (maritime HQs strike ports/coasts)
    let targetBurgs: Burg[] = [];
    if (faction.hq.maritime) {
      const [lx, ly] = pack.cells.p?.[faction.hq.cell] ?? [0, 0];
      targetBurgs = pack.burgs
        .filter(b => b?.i && !b.removed && (b.port || (pack.cells.h && pack.cells.h[b.cell] < 20)))
        .map(b => ({ burg: b, dist: Math.hypot(b.x - lx, b.y - ly) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 4)
        .map(d => d.burg);
    } else {
      const localBurgs = province?.i
        ? pack.burgs.filter(b => b?.i && !b.removed && pack.cells.province?.[b.cell] === province.i)
        : [];
      targetBurgs = localBurgs;
      if (targetBurgs.length === 0) {
        const [lx, ly] = pack.cells.p?.[faction.hq.cell] ?? [0, 0];
        const withDist = pack.burgs
          .filter(b => b?.i && !b.removed)
          .map(b => ({ burg: b, dist: Math.hypot(b.x - lx, b.y - ly) }))
          .sort((a, b) => a.dist - b.dist);
        targetBurgs = withDist.slice(0, 3).map(d => d.burg);
      }
    }
    if (targetBurgs.length === 0) return;

    // 2. Filter for plausible targets (skip fortresses that are overwhelmingly defended)
    const plausible = targetBurgs.filter(b => {
      const defenders = this.burgDefenders(b);
      const defMen = defenders.reduce((sum, u) => sum + u.count, 0);
      const walls = Number(b.walls ?? 0);
      if (walls >= 2 && defMen > raidMen * 1.5) return false;
      if (defMen > raidMen * 2.5) return false;
      return true;
    });

    if (plausible.length === 0) {
      faction.raidPending = true;
      return;
    }

    // Sort by easiest target (lowest walls, fewest defenders)
    plausible.sort((a, b) => {
      const wA = Number(a.walls ?? 0);
      const wB = Number(b.walls ?? 0);
      if (wA !== wB) return wA - wB;
      const menA = this.burgDefenders(a).reduce((sum, u) => sum + u.count, 0);
      const menB = this.burgDefenders(b).reduce((sum, u) => sum + u.count, 0);
      return menA - menB;
    });
    const target = plausible[0]!;

    faction.raidPending = false;

    // 3. Resolve raid combat
    const { config } = currentContent();
    const defenders = this.burgDefenders(target);
    const ownerState = pack.states[target.state ?? 0];
    const stationedReg = (ownerState?.military ?? []).find(r => r.cell === target.cell && r.a > 0);
    const stationedBlocks = (stationedReg?.units ?? []).filter(u => u.hp > 0 && unitTypes[u.type]);
    for (const u of toBattleUnitsMen(stationedBlocks, unitTypes)) defenders.push(u);

    const session = initBattleSession({
      config,
      unitTypes,
      attacker: { factionId: 0, armyId: null, units: raidUnits },
      defender: { factionId: target.state ?? 0, armyId: null, units: defenders },
      cell: target.cell,
      regionId: pack.cells.province?.[target.cell] ?? provinceId,
      assault: Number(target.walls ?? 0) > 0,
      modifiers: this.assaultModifiers(target)
    });
    while (session.status === "active" && session.round < config.battle.maxRounds) {
      stepBattleRound(session, rng.next);
    }
    const outcome = finalizeBattle(session, rng.next);

    this.addBattleMarker(target);

    if (stationedReg && ownerState && stationedBlocks.length > 0) {
      this.applyArmySurvivors(ownerState, stationedReg, outcome.defender.units);
    }
    // Raiders keep their survivors in the lead regiment
    const survivors = fromBattleUnitsMen(outcome.attacker.units, unitTypes);
    if (faction.military?.length && survivors.length > 0 && survivors.reduce((s, b) => s + (b.hp ?? 0), 0) > 0) {
      const main = faction.military[0]!;
      main.units = survivors;
      syncRegimentTotals(main, unitTypes);
    }

    if (outcome.winner === "defender") {
      if (pSim) pSim.order = Math.min(100, pSim.order + 3);
      this.pushNews(living, {
        kind: "faction",
        text: `${target.name} garrison repulsed raiders from ${faction.name}!`,
        cell: target.cell,
        stateId: target.state ?? 0,
        burgId: target.i
      });
      return;
    }

    // Raid coup: an ambitious faction that overwhelms a vulnerable non-capital raises a state
    const bSim = living.burgs[target.i];
    if (
      faction.sovereignAmbition &&
      (faction.seasonsActive ?? 0) >= 6 &&
      !target.capital &&
      ((pSim?.order ?? 100) <= 20 || Number(target.walls ?? 0) === 0 || (bSim?.buildings.length ?? 0) === 0)
    ) {
      if (this.ascendFactionToState(faction.i, target.i) !== null) return;
    }

    // Raiders win: destroy 1 asset or pillage development & unrest
    if (pSim && bSim?.buildings && bSim.buildings.length > 0) {
      let destroyIndex = bSim.buildings.findIndex(bid => !bid.startsWith("walls"));
      if (destroyIndex === -1) destroyIndex = bSim.buildings.length - 1;
      const destroyed = bSim.buildings.splice(destroyIndex, 1)[0]!;
      syncBurgFlagsFromBuildings(target, bSim.buildings);
      const bDef = currentContent().content.buildings.find(b => b.id === destroyed);
      const bName = bDef?.name ?? destroyed;
      pSim.order = Math.max(0, pSim.order - 6);
      this.pushNews(living, {
        kind: "faction",
        text: `Raiders from ${faction.name} sacked ${target.name} and destroyed its ${bName}!`,
        cell: target.cell,
        stateId: target.state ?? 0,
        burgId: target.i
      });
      this.pushHistory(
        "sack",
        [
          { kind: "burg", id: target.i },
          { kind: "state", id: target.state ?? 0 }
        ],
        target.cell,
        `Raiders from ${faction.name} sacked ${target.name} and tore down its ${bName}.`
      );
    } else if (pSim) {
      if (bSim) {
        bSim.development = Math.max(0, bSim.development - 1);
        bSim.unrest = Math.min(10, bSim.unrest + 2);
      }
      pSim.development = Math.max(0, pSim.development - 1);
      pSim.order = Math.max(0, pSim.order - 10);
      this.pushNews(living, {
        kind: "faction",
        text: `Raiders from ${faction.name} pillaged ${target.name}, leaving ruin in their wake.`,
        cell: target.cell,
        stateId: target.state ?? 0,
        burgId: target.i
      });
      this.pushHistory(
        "sack",
        [
          { kind: "burg", id: target.i },
          { kind: "state", id: target.state ?? 0 }
        ],
        target.cell,
        `Raiders from ${faction.name} plundered ${target.name} and terrorized the populace.`
      );
    }

    faction.influence = Math.min(100, (faction.influence ?? 0) + 5);
  }

  /** Step each active state's projects and seasonal agenda. */
  private stepStates(living: LivingWorldState): void {
    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim) continue;

      for (const regiment of state.military ?? []) {
        for (const unit of regiment.units ?? []) {
          if ((unit.disruption ?? 0) > 0) {
            const regProvId = pack.cells.province?.[regiment.cell] ?? 0;
            const provSim = regProvId ? living.provinces?.[regProvId] : null;
            const hosted = regProvId
              ? Factions.active().some(
                  f =>
                    (f.allegiance === "hostile" || f.allegiance === "clandestine") &&
                    this.factionProvinceId(f) === regProvId
                )
              : false;
            if (!provSim?.trouble && !hosted) {
              unit.disruption = Math.max(0, unit.disruption! - 1);
            }
          }
        }
      }

      this.advanceDevelopment(state, sSim, living);
      this.advanceConstructions(state, sSim, living);

      if (!sSim.agenda) sSim.agenda = this.chooseAgenda(state, sSim, living);
      if (!sSim.agenda) continue;
      this.stepAgenda(state, sSim, living);
    }
  }
}

declare global {
  var Living: LivingModel;
}

// biome-ignore lint/suspicious/noRedeclare: legacy seam
export const Living = new LivingModel();
window.Living = Living;

export { LivingHeroes } from "./living-heroes";
export { LivingThreats } from "./living-threats";
