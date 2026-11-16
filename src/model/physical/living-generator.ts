// Living World seasonal simulation engine. See docs/plans/living-world.md

import { rollAlignment, rollFigureTraits, traitsRng } from "@/data/culture-traits";
import { ANCIENT_SUPPRESSED_CAP } from "@/data/development";
import { EXPENSES, type Expense } from "@/data/expenses";
import { getAllFactionAssets, getFactionAsset } from "@/data/faction-assets";
import { CIV_BUILDING_BY_ID } from "@/data/living-civ-buildings";
import { SOVEREIGN_DEVELOPMENT, UNIT_TECH_DEVELOPMENT } from "@/data/living-eras";
import {
  PROJECT_BY_ID,
  PROJECTS,
  type ProjectDef,
  projectGoods,
  projectLineLabel,
  projectName
} from "@/data/living-projects";
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
import { Markets } from "@/model/economy/markets-generator";
import { Production } from "@/model/economy/production-generator";
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
  migrateArmyBlocks,
  nextRosterUnitInCategory,
  normalizeArmy,
  pickRosterUnit,
  requiredDevelopmentFor,
  toBattleTypes,
  toBattleUnits,
  toBattleUnitsMen
} from "@/model/physical/living-armies";
import {
  computeFactionEconomy,
  factionUpstreamIncome,
  type FactionUpstreamIncome,
  SEASON_DAYS
} from "@/model/physical/living-faction-economy";
import {
  CORRUPTION_DRIFT,
  CORRUPTION_NEWS_THRESHOLD,
  FISCAL_DRIFT,
  FISCAL_NEWS_THRESHOLD,
  type FiscalEvents,
  fiscalProfile,
  fiscalStride,
  fiscalTarget,
  fiscalValue,
  TAX_DRIFT
} from "@/model/physical/living-fiscal";
import { AUDIT_CORRUPTION_CUT, auditRecovery, rulerBias, stateEconomyModifiers } from "@/model/physical/living-rulers";
import { type Burg, Burgs } from "@/model/political/burgs-generator";
import { ensureFactionNodeSim, Factions, syncFactionState } from "@/model/political/factions-generator";
import {
  Military,
  type Regiment,
  reconcileRegimentBlocks,
  syncRegimentTotals
} from "@/model/political/military-generator";
import type { Province } from "@/model/political/provinces-generator";
import { Stability } from "@/model/political/stability";
import { noFinance, type State, States } from "@/model/political/states-generator";
import { type AstralTechRegime, classifyAstralRegime, Development } from "@/model/society/development-generator";
import { Names } from "@/model/society/names-generator";
import { getMoneyUnit } from "@/model/units";
import type { ArmyBlock, ArmyUnit } from "@/types/battle";
import type { Good } from "@/types/economy";
import type {
  Faction,
  FactionAssetDef,
  FactionHq,
  FactionNodeKey,
  FactionNodeYieldBreakdown,
  FactionOutpost,
  FactionYieldBreakdown
} from "@/types/factions";
import type { HistoricalFigure, HistoryEventType, HistRef, Realm } from "@/types/history";
import type {
  ArmyBattleRecord,
  ArmySimState,
  ArmyStance,
  BurgSimState,
  CellTerrainInfo,
  CivResourceClass,
  FiscalLock,
  GrudgeReason,
  HeroDoctrine,
  HeroGuildState,
  LivingNewsItem,
  LivingNewsKind,
  LivingProject,
  LivingWorldState,
  MissionTag,
  ProvinceTrouble,
  SeasonId,
  StateAgenda,
  StatePolitySim,
  TreatyKind,
  TroubleTheme,
  TroubleUnitRole
} from "@/types/living";
import { SEASON_NAMES } from "@/types/living";
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
const DEVELOPMENT_DECAY_SLACK = 3; // rural cells keep a little more than their land allows
const CHARTER_TITHE = "Chartered Faction Tithes"; // the state budget line charters pay
const SABOTAGE_ORDER = 15; // public order a ruined working costs its province
const PROJECT_RESERVE = 25; // seasons of net kept in hand before a public work starts
const PROJECT_CAMP_REPLENISH = 0.05; // extra capability a season an army camp gives resting forces
const FACTION_PROJECT_RESERVE = 20; // a faction keeps this much in hand before building its next work

/** Whether a faction's track, era and node rules allow an asset. */
function factionCanBuildAsset(faction: Faction, def: FactionAssetDef, development: number): boolean {
  const category = faction.category;
  const trackFits =
    def.track === category ||
    (def.track === "scholarly" && ["adventuring", "religious", "political"].includes(category)) ||
    (def.track === "wilder" && ["martial", "adventuring"].includes(category));
  if (!trackFits) return false;
  const gate = def.requiredTech ? (UNIT_TECH_DEVELOPMENT[def.requiredTech] ?? 0) : 0;
  return development >= gate;
}

/** What a move in one fiscal line reads like, as [raised, lowered] predicate completions. */
const FISCAL_PHRASES: Record<FiscalLock, readonly [string, string]> = {
  military: ["musters a greater share of its taxes for the army.", "lets its army's share of the taxes wither."],
  court: ["gilds its court while the provinces wait.", "tightens its court's belt."],
  administration: [
    "grows its chancery: more clerks and fewer bribes.",
    "thins its chancery, and the clerks grow greedy."
  ],
  infrastructure: ["lays roads and granaries across its provinces.", "shelves its public works for another year."],
  corruption: ["lets graft spread among its officials.", "reins in its officials' cut."],
  salesTax: ["raises the sales tax.", "eases the sales tax."],
  pollTax: ["raises the head tax.", "eases the head tax."]
};

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

/** A non-removed burg that runs the full OpenCiv city loop. */
export function isMajorBurg(burg: Burg | undefined | null): boolean {
  if (!burg?.i || burg.removed) return false;
  if (burg.capital === 1) return true;
  if (burg.state && pack.states?.[burg.state]?.capital === burg.i) return true;
  if (pack.provinces?.some(province => province?.i && !province.removed && province.burg === burg.i)) return true;
  if (pack?.history?.living?.burgs?.[burg.i]?.isMajor) return true;
  return !burg.state && settlementTierFromPop(burg.population ?? 0) >= 3;
}

// ---------------------------------------------------------------------------
// Slice 4: empire rollup helpers (Science, Gold, Happiness)
// ---------------------------------------------------------------------------

/** Regiments beyond this count cost 1 Gold per tick of upkeep. */
/** Gold per tick for a median block at full capability (living-openciv-armies.md §10.2). */
export const BASELINE_UPKEEP = 0.2;
/** Production plan for state suppression of a faction node. */
export const FACTION_SUPPRESSION_PRODUCTION_BASE = 6;
export const FACTION_SUPPRESSION_PRODUCTION_PER_TIER = 4;
/** Seasons of funded administrative pressure a suppression campaign needs. */
export const FACTION_SUPPRESSION_SEASONS = 3;
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
export const CITY_BASE_HP = 200;
/** A unit looks this many hops for an enemy to engage. */
export const UNIT_AGGRO_RANGE = 6;
/** One city strike removes this much capability from a single block. */
export const CITY_STRIKE_HP = 0.1;

/** Terrain defense multiplier for the defender's cell (+25% on hills, forest and jungle). */
export function terrainDefenseMultiplier(cell: number): number {
  const info = getCellTerrainInfo(cell);
  if (info.isHill) return 1.25;
  const biome = Number(pack.cells.biome?.[cell] ?? 0);
  if (biome === 6 || biome === 7 || biome === 8) return 1.25;
  return 1;
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
/** Diplomacy clocks. */
export const MIN_WAR_TURNS = 10;
export const PEACE_TREATY_TURNS = 10;

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
    this.pruneLegacyFields(history.living);

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

  /** living-fmg-native.md: strip retired OpenCiv/research fields from older saves. */
  private pruneLegacyFields(living: LivingWorldState): void {
    type Legacy = Record<string, unknown>;
    const legacy = living as unknown as Legacy;
    for (const key of ["worldWonders", "religions", "units"]) delete legacy[key];
    const researchKeys = ["currentTechId", "researchQueue", "researchedTechs", "researchedProgress", "freeTechs"];
    for (const sSim of Object.values(living.states)) {
      const record = sSim as unknown as Legacy;
      for (const key of [
        "faith",
        "prophetsEarned",
        "pantheonId",
        "religionId",
        "happiness",
        "happinessBreakdown",
        "yieldsPerTurn",
        ...researchKeys
      ]) {
        delete record[key];
      }
    }
    for (const faction of pack.factions ?? []) {
      if (!faction?.i) continue;
      const record = faction as unknown as Legacy;
      for (const key of [...researchKeys, "happiness", "happinessBreakdown", "yieldsPerTurn"]) delete record[key];
    }
    for (const bSim of Object.values(living.burgs)) {
      const record = bSim as unknown as Legacy;
      for (const key of [
        "citizens",
        "foodStored",
        "cultureStored",
        "tilesAcquired",
        "nextBorderCell",
        "workedCells",
        "lockedCells",
        "productionQueue",
        "productionProgress",
        "cityYields",
        "religionPressure",
        "pantheonId"
      ]) {
        delete record[key];
      }
    }
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
        this.stepFiscalPolicy(living);
        this.stepReligiousDrift(living);
        this.stepGrudges(living);
        this.captureSnapshot(living);
      }

      this.syncWorld();
      this.stepFactionEmpire(living);
      this.stepDevelopmentDiffusion(living);
      this.syncTroubleLines(living);
      this.stepEconomy(living);
      this.stepTactical(living);
      this.stepBurgUnrest(living);
      this.stepProvinces(living);
      this.stepFactions(living);
      this.stepStates(living);
      this.stepProjects(living);
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
        this.factionDevelopment(faction) >= SOVEREIGN_DEVELOPMENT
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
          treasury: Number(pack.states[state.i]?.economy?.treasury ?? 0)
        };
      } else {
        existing.rulerId = rulerId;
        existing.treasury ??= Number(state.economy?.treasury ?? 0);
        existing.warTurns ??= {};
        existing.peaceTreatyTurns ??= {};
      }
    }
  }

  syncFactions(_living: LivingWorldState): void {
    for (const faction of Factions.active()) {
      syncFactionState(faction);
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

  /** A state's mean development, 0 when the map carries none. */
  private stateDevelopment(stateId: number): number {
    return this.developmentAverages().get(stateId) ?? 0;
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

  /** Peopled land eases toward its people's mean development; the land itself sets the local ceiling. */
  private stepDevelopmentDiffusion(living: LivingWorldState): void {
    const { cells } = pack;
    const development = cells.development;
    if (!development || !cells.state) return;
    const astral = Development.isAstralMode();
    const averages = this.developmentAverages();
    const targets = new Map<number, { target: number; regime: AstralTechRegime }>();
    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const target = averages.get(state.i) ?? 0;
      if (target > 0) {
        const regime = astral ? classifyAstralRegime(pack.cultures?.[state.culture ?? 0]) : "standardSciFi";
        targets.set(state.i, { target, regime });
      }
    }
    if (targets.size === 0) return;

    let changed = false;
    for (let cell = 0; cell < development.length; cell++) {
      const entry = targets.get(cells.state[cell]);
      if (!entry || !development[cell]) continue; // no polity or no people, no development
      if (cells.h[cell] < 20 || (!cells.pop[cell] && !cells.burg?.[cell])) continue;

      let local = this.localDevelopmentTarget(cell, entry.target);
      if (astral && (entry.regime === "ancientBimodal" || entry.regime === "xothianScourge") && !cells.burg?.[cell]) {
        local = Math.min(local, ANCIENT_SUPPRESSED_CAP);
      }
      if (development[cell] < local) {
        const step = astral && entry.regime === "postScarcity" ? 2 : 1;
        development[cell] = Math.min(local, development[cell] + step);
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

  /** Spring: the ruler's fiscal target pulls the real budget, taxes and graft. */
  private stepFiscalPolicy(living: LivingWorldState): void {
    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim) continue;
      const stride = Math.min(fiscalStride(state), FISCAL_DRIFT);
      if (!stride) continue;
      const profile = fiscalProfile(state, this.fiscalEvents(state, living));
      if (!profile) continue;

      this.ensureFiscalBaseline(state, sSim);
      const locks = new Set(sSim.fiscal?.locks ?? []);
      let changed = false;

      const budget: Partial<Record<Expense, number>> = {};
      for (const line of EXPENSES) {
        if (locks.has(line)) continue;
        const next = this.driftNumber(fiscalValue(state, line), fiscalTarget(profile, line), stride);
        if (next !== fiscalValue(state, line)) budget[line] = next;
      }
      if (Object.keys(budget).length) {
        States.setBudget(state.i, budget);
        changed = true;
      }

      if (!locks.has("corruption")) {
        const current = state.economy.budget.corruption;
        const next = this.driftNumber(current, profile.corruption, CORRUPTION_DRIFT);
        if (next !== current) {
          States.setCorruption(state.i, next);
          changed = true;
        }
      }

      if (!locks.has("salesTax") || !locks.has("pollTax")) {
        const sales = locks.has("salesTax")
          ? state.economy.salesTax
          : this.driftNumber(state.economy.salesTax, profile.salesTax, TAX_DRIFT, 4);
        const poll = locks.has("pollTax")
          ? state.economy.pollTax
          : this.driftNumber(state.economy.pollTax, profile.pollTax, TAX_DRIFT, 4);
        if (sales !== state.economy.salesTax || poll !== state.economy.pollTax) {
          States.setTaxes(state.i, sales, poll);
          changed = true;
        }
      }

      if (!changed) continue;
      living.economyDirty = true; // the run's taxes, spending and graft follow the purse
      this.pushFiscalNews(state, sSim, locks, living);
    }
  }

  /** The political weather the purse must answer this spring. */
  private fiscalEvents(state: State, living: LivingWorldState): FiscalEvents {
    return {
      war: this.stateAtWar(state),
      rebellion: (living.states[state.i]?.unravel ?? 0) >= 50,
      hazard: this.ownedProvinces(state.i).some(province => Boolean(living.provinces[province.i]?.trouble)),
      bankrupt: Number(state.economy.treasury ?? 0) < 0
    };
  }

  /** Each ruler starts with a baseline so a later dispatch can say what changed. */
  private ensureFiscalBaseline(state: State, sSim: StatePolitySim): void {
    if (!sSim.fiscal) sSim.fiscal = {};
    const fiscal = sSim.fiscal;
    if (fiscal.rulerId === sSim.rulerId && fiscal.baseline) return;
    fiscal.rulerId = sSim.rulerId;
    fiscal.logged = {};
    fiscal.baseline = Object.fromEntries(
      [...EXPENSES, "corruption", "salesTax", "pollTax"].map(line => [line, fiscalValue(state, line as FiscalLock)])
    ) as Partial<Record<FiscalLock, number>>;
  }

  /** Move one value toward its target by at most `stride`, rounded to `decimals`. */
  private driftNumber(current: number, target: number, stride: number, decimals = 0): number {
    const step = Math.min(stride, Math.abs(target - current));
    const next = current + Math.sign(target - current) * step;
    const scale = 10 ** decimals;
    return Math.round(next * scale) / scale;
  }

  /** One dispatch per spring at most: the line the ruler moved furthest from accession. */
  private pushFiscalNews(state: State, sSim: StatePolitySim, locks: Set<FiscalLock>, living: LivingWorldState): void {
    const baseline = sSim.fiscal?.baseline;
    if (!baseline) return;
    let best: { line: FiscalLock; deviation: number; value: number } | null = null;
    for (const line of [...EXPENSES, "corruption", "salesTax", "pollTax"] as FiscalLock[]) {
      if (locks.has(line) || sSim.fiscal?.logged?.[line]) continue;
      const start = baseline[line];
      if (start === undefined) continue;
      const value = fiscalValue(state, line);
      const deviation =
        line === "salesTax" || line === "pollTax" ? Math.abs(value - start) * 100 : Math.abs(value - start);
      const threshold =
        line === "corruption"
          ? CORRUPTION_NEWS_THRESHOLD
          : line === "salesTax" || line === "pollTax"
            ? 1
            : FISCAL_NEWS_THRESHOLD;
      if (deviation < threshold) continue;
      if (!best || deviation > best.deviation) best = { line, deviation, value };
    }
    if (!best) return;
    sSim.fiscal!.logged = { ...sSim.fiscal!.logged, [best.line]: true };
    const up = best.value > (baseline[best.line] ?? 0);
    const text = `${state.name} ${FISCAL_PHRASES[best.line][up ? 0 : 1]}`;
    this.pushNews(living, { kind: "develop", text, cell: state.center, stateId: state.i });
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
    // a titan's footfall scours the cell it sets down on; the road-bound wanderers leave the land scarred
    if (burg.titan === 1) {
      const development = pack.cells.development?.[burg.cell];
      if (development !== undefined && development > 0)
        pack.cells.development[burg.cell] = Math.max(0, development - 10);
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

  /** Is this state engaged in any war this tick? */
  private stateAtWar(state: State): boolean {
    if (!state.diplomacy) return false;
    return pack.states.some(
      other => other?.i && other.i !== state.i && !other.removed && state.diplomacy?.[other.i] === "Enemy"
    );
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

    // Drop any partial suppression work the agenda still names.
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
    const development = this.factionDevelopment(faction);
    const melee =
      (roster ? pickRosterUnit(roster, "melee", development) : undefined) ??
      Object.values(types).find(type => type.category === "melee") ??
      Object.values(types)[0];
    if (!melee) return [];

    const nodeTier = "tier" in node ? node.tier : 2;
    const tier = isHq ? 2 : nodeTier;
    const fortified = isHq && "fortified" in node && node.fortified ? 1 : 0;
    const count = Math.min(FACTION_GARRISON_BLOCK_CAP, Math.max(2, (isHq ? 3 : tier) + tier + fortified * 2));
    return Array.from({ length: count }, () => ({ type: melee.id, hp: 1, exp: 0 }));
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

  /** Tactical unit key for a Faction regiment in `living.armies`. */
  factionUnitKey(factionId: number, regimentId: number): string {
    return `f${factionId}-${regimentId}`;
  }

  /** Factions keep a small standing guard: muster one roster block per season while under strength and funded. */
  private musterFactionBlock(faction: Faction, living: LivingWorldState): void {
    const desired =
      1 +
      Math.floor((faction.outposts ?? []).length / 2) +
      (faction.allegiance === "hostile" || faction.category === "martial" || faction.sovereignAmbition ? 1 : 0);
    const combatRegiments = (faction.military ?? []).filter(r => !isCivilianUnit((r.type ?? "").toLowerCase()));
    if (combatRegiments.length >= desired) return;

    const roster = Military.getRoster(faction);
    if (!roster) return;
    const unit = pickRosterUnit(roster, "melee", this.factionDevelopment(faction));
    if (!unit) return;

    const cost = Math.max(1, Math.round(unit.cost ?? 0));
    if (Number(faction.treasury ?? 0) < cost) return;
    const node = faction.hq && !faction.hq.pillaged ? faction.hq : (faction.outposts ?? []).find(o => !o.pillaged);
    if (!node) return;

    faction.treasury = Math.round((Number(faction.treasury ?? 0) - cost) * 100) / 100;
    const unitTypes = Military.getUnitTypes();
    const maxSlots = currentContent().config.military.maxUnitsPerArmy;
    const pt = pack.cells.p?.[node.cell] ?? [0, 0];
    let regiment = (faction.military ?? []).find(
      r => r.cell === node.cell && !isCivilianUnit((r.type ?? "").toLowerCase()) && (r.units?.length ?? 0) < maxSlots
    );
    if (!regiment) {
      const nextRegId = (faction.military ?? []).reduce((max, r) => Math.max(max, r.i ?? 0), 0) + 1;
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
    regiment.units.push({ type: unit.id, hp: 1, exp: 0 });
    normalizeArmy(regiment, maxSlots, unitTypes);
    syncRegimentTotals(regiment, unitTypes);
    const speed = armySpeed(regiment, unitTypes);
    const key = this.factionUnitKey(faction.i, regiment.i);
    living.armies ??= {};
    living.armies[key] ??= { movement: speed, maxMovement: speed, stance: "fortify", hasFought: false };

    this.pushNews(living, {
      kind: "muster",
      text: `${faction.name} mustered ${unit.name}.`,
      cell: node.cell,
      ...(node.burgId ? { burgId: node.burgId } : {})
    });
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
      if (living.armies) delete living.armies[key];
    }

    this.pushNews(living, {
      kind: "muster",
      text: `${state.name} could not pay its army; its newest block was disbanded.`,
      cell: newest.cell,
      stateId: state.i
    });
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

  /** A faction's next work: advance it, or commission the best asset its track and purse allow. */
  private stepFactionProject(faction: Faction, living: LivingWorldState): void {
    if (faction.project) {
      if (faction.project.turnsLeft > 1) {
        faction.project.turnsLeft -= 1;
        return;
      }
      this.completeFactionProject(faction, living);
      return;
    }

    const treasury = Number(faction.treasury ?? 0);
    const development = this.factionDevelopment(faction);
    const candidates = getAllFactionAssets()
      .filter(def => factionCanBuildAsset(faction, def, development))
      .filter(def => treasury >= def.cost + FACTION_PROJECT_RESERVE)
      .filter(def => this.pickFactionAssetNode(faction, def) !== null)
      .sort((a, b) => a.tier - b.tier || a.cost - b.cost || a.id.localeCompare(b.id));
    const next = candidates[0];
    if (next) this.commissionFactionAsset(faction.i, next.id);
  }

  /** God mode / editor: pay for and begin one faction asset at a node. */
  commissionFactionAsset(factionId: number, assetId: string, nodeKey?: FactionNodeKey): boolean {
    const faction = Factions.active().find(entry => entry.i === factionId);
    const def = getFactionAsset(assetId);
    if (!faction?.i || faction.removed || !def || faction.project) return false;
    if (Number(faction.treasury ?? 0) < def.cost) return false;
    if (!factionCanBuildAsset(faction, def, this.factionDevelopment(faction))) return false;

    const target = nodeKey ? this.factionNodeByKey(faction, nodeKey) : this.pickFactionAssetNode(faction, def);
    if (!target || (target.node.assets ?? []).includes(assetId)) return false;

    faction.treasury = Math.round((Number(faction.treasury) - def.cost) * 100) / 100;
    faction.project = {
      assetId,
      nodeKey: factionSuppressionNodeKey(target.node, target.isHq),
      turnsLeft: def.tier
    };
    if (pack.history?.living) pack.history.living.economyDirty = true;
    return true;
  }

  /** Finish a faction work: add it to the node and let the host town feel it. */
  private completeFactionProject(faction: Faction, living: LivingWorldState): void {
    const active = faction.project;
    if (!active) return;
    const def = getFactionAsset(active.assetId);
    const target = this.factionNodeByKey(faction, active.nodeKey);
    if (!def || !target) {
      faction.project = undefined;
      return;
    }

    target.node.assets = [...(target.node.assets ?? []), def.id];
    if (target.node.sim) target.node.sim.civBuildings = [...target.node.assets];
    this.applyFactionAssetImpacts(target.node, def);
    faction.influence = minmax((faction.influence ?? 0) + 2, 0, 100);
    faction.project = undefined;
    living.economyDirty = true;

    const location = target.node.burgId ? (pack.burgs[target.node.burgId]?.name ?? "a burg") : "the wilds";
    const text = `${faction.name} completes its ${def.name} in ${location}.`;
    this.pushNews(living, {
      kind: "faction",
      text,
      cell: target.node.cell,
      ...(target.node.burgId ? { burgId: target.node.burgId } : {})
    });
    this.pushHistory("deed", [{ kind: "state", id: faction.patronStateId ?? 0 }], target.node.cell, text);
  }

  /** Order and unrest bites at once; money lines are rebuilt by `syncFactionLines`. */
  private applyFactionAssetImpacts(node: FactionHq | FactionOutpost, def: FactionAssetDef): void {
    const burg = node.burgId ? pack.burgs[node.burgId] : undefined;
    if (!burg?.i) return;
    const provinceId = Number(pack.cells.province?.[burg.cell] ?? 0);
    const pSim = provinceId ? this.getState().provinces[provinceId] : undefined;
    if (pSim && def.burgImpact?.order) {
      pSim.order = minmax(pSim.order + def.burgImpact.order * 3, 0, 100);
    }
    if (def.burgImpact?.unrest) {
      const bSim = this.getState().burgs[burg.i];
      if (bSim) bSim.unrest = minmax(bSim.unrest + Math.max(0, def.burgImpact.unrest) * 3, 0, 100);
    }
  }

  /** Rebuild every faction money line on its host towns: one per asset with a gold bite. */
  private syncFactionLines(living: LivingWorldState): void {
    const prefix = "Faction: ";
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed) continue;
      const current = burg.simAdjustments ?? [];
      const kept = current.filter(line => !line.name.startsWith(prefix));
      const lines: { name: string; value: number }[] = [];

      for (const faction of Factions.active()) {
        for (const { node } of this.factionNodes(faction)) {
          if (!node.burgId || node.burgId !== burg.i) continue;
          for (const assetId of node.assets ?? []) {
            const def = getFactionAsset(assetId);
            const value = def?.burgImpact?.gold ?? 0;
            if (!def || !value) continue;
            lines.push({ name: `${prefix}${faction.name} ${def.name}`, value });
          }
        }
      }

      const next = [...kept, ...lines];
      if (JSON.stringify(next) === JSON.stringify(current)) continue;
      burg.simAdjustments = next;
      living.economyDirty = true;
    }
  }

  /** A faction's live nodes, HQ first. */
  private factionNodes(faction: Faction): { node: FactionHq | FactionOutpost; isHq: boolean }[] {
    const nodes: { node: FactionHq | FactionOutpost; isHq: boolean }[] = [];
    if (faction.hq && !faction.hq.pillaged) nodes.push({ node: faction.hq, isHq: true });
    for (const outpost of faction.outposts ?? []) {
      if (!outpost.pillaged) nodes.push({ node: outpost, isHq: false });
    }
    return nodes;
  }

  private factionNodeByKey(
    faction: Faction,
    key: FactionNodeKey
  ): { node: FactionHq | FactionOutpost; isHq: boolean } | null {
    for (const entry of this.factionNodes(faction)) {
      if (factionSuppressionNodeKey(entry.node, entry.isHq) === key) return entry;
    }
    return null;
  }

  /** The node a new asset can be built at, honouring its location rule. */
  private pickFactionAssetNode(
    faction: Faction,
    def: FactionAssetDef
  ): { node: FactionHq | FactionOutpost; isHq: boolean } | null {
    const nodes = this.factionNodes(faction);
    const fits = (entry: { node: FactionHq | FactionOutpost; isHq: boolean }) => {
      if (!entry.isHq && def.location === "hq_only") return false;
      if (def.location === "burg" && !entry.node.burgId) return false;
      if (def.location === "wilderness" && entry.node.burgId) return false;
      if ((entry.node.assets ?? []).includes(def.id)) return false;
      return true;
    };
    const candidates = nodes.filter(fits);
    return candidates.find(entry => entry.isHq) ?? candidates[0] ?? null;
  }

  /** §5.1 upstream-only faction income & state-style expense breakdown per node and empire. */
  getFactionYieldBreakdown(faction: Faction): FactionYieldBreakdown {
    const nodes: FactionNodeYieldBreakdown[] = [];
    const nodeIncomes: FactionUpstreamIncome[] = [];
    let totalUpstreamGold = 0;
    let totalCharterTithe = 0;
    let charterPatronId = 0;
    let totalInfluence = 0;
    let hqBreakdown: FactionNodeYieldBreakdown | null = null;
    const outpostsBreakdown: FactionNodeYieldBreakdown[] = [];

    for (const { node, isHq } of this.factionEmpireNodes(faction)) {
      const upstream = factionUpstreamIncome(faction, node);
      nodeIncomes.push(upstream);
      const breakdown: FactionNodeYieldBreakdown = {
        node,
        isHq,
        upstreamGold: upstream.gold,
        charterTithe: upstream.charterTithe
      };
      nodes.push(breakdown);
      if (isHq) hqBreakdown = breakdown;
      else outpostsBreakdown.push(breakdown);
      totalUpstreamGold += upstream.gold;
      totalInfluence += upstream.influence;
      if (upstream.charterTithe > 0) {
        totalCharterTithe += upstream.charterTithe;
        charterPatronId = upstream.patronStateId;
      }
    }

    const unitTypes = Military.getUnitTypes();
    const blockUpkeep = (faction.military ?? []).reduce(
      (total, regiment) =>
        total +
        (regiment.units ?? []).reduce(
          (sum, block) => sum + (block.hp > 0 ? (unitTypes[block.type]?.upkeep ?? 0) * block.hp : 0),
          0
        ),
      0
    );
    const economy = computeFactionEconomy(faction, nodeIncomes, blockUpkeep);

    return {
      nodes,
      hq: hqBreakdown,
      outposts: outpostsBreakdown,
      upstreamGold: Math.round(totalUpstreamGold * 100) / 100,
      charterTithe: Math.round(totalCharterTithe * 100) / 100,
      charterPatronId,
      influence: Math.round(totalInfluence * 100) / 100,
      economy
    };
  }

  /** The faction's season on the upstream economy: Day Balance × SEASON_DAYS. */
  private factionSeasonalGold(faction: Faction): number {
    const upstream = this.getFactionYieldBreakdown(faction);
    return Math.round(upstream.economy.dayBalance * SEASON_DAYS * 100) / 100;
  }

  /** Bank the faction's season: upstream income less its forces' upkeep; debt disbands a block. */
  private applyFactionTreasury(faction: Faction, living: LivingWorldState): void {
    faction.treasury = Math.round((Number(faction.treasury ?? 0) + this.factionSeasonalGold(faction)) * 100) / 100;
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
      if (living.armies) delete living.armies[key];
    }

    this.pushNews(living, {
      kind: "muster",
      text: `${faction.name} could not pay its forces; its newest block was disbanded.`,
      cell: newest.cell,
      ...(newest.cell !== undefined ? { burgId: Number(pack.cells.burg?.[newest.cell] ?? 0) || undefined } : {})
    });
  }

  /** One seasonal faction tick: upstream income, influence, charters, research, treasury and a guard. */
  stepFactionEmpire(living: LivingWorldState): void {
    const charters = new Map<number, number>();
    for (const faction of Factions.active()) {
      faction.seasonsActive = (faction.seasonsActive || 0) + 1;
      syncFactionState(faction);
      const breakdown = this.getFactionYieldBreakdown(faction);
      // temples and chanceries grow their influence with the court's spending
      faction.influence = minmax((faction.influence ?? 0) + breakdown.influence, 0, 100);
      if (breakdown.charterPatronId && breakdown.charterTithe > 0) {
        const patron = breakdown.charterPatronId;
        charters.set(patron, (charters.get(patron) ?? 0) + breakdown.charterTithe);
      }
      this.applyFactionTreasury(faction, living);
      this.musterFactionBlock(faction, living);
      this.stepFactionProject(faction, living);
    }
    this.syncFactionLines(living);
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

  /** The state's fiscal posture for the HUD: current, target and pinned lines. */
  fiscalPolicy(stateId: number): {
    current: Record<FiscalLock, number>;
    target: Record<FiscalLock, number>;
    locks: FiscalLock[];
    stride: number;
  } | null {
    const state = pack.states[stateId];
    const living = this.getState();
    const sSim = living.states[stateId];
    if (!state?.i || state.removed || !sSim) return null;
    const profile = fiscalProfile(state, this.fiscalEvents(state, living));
    if (!profile) return null;
    const lines = [...EXPENSES, "corruption", "salesTax", "pollTax"] as FiscalLock[];
    return {
      current: Object.fromEntries(lines.map(line => [line, fiscalValue(state, line)])) as Record<FiscalLock, number>,
      target: Object.fromEntries(lines.map(line => [line, fiscalTarget(profile, line)])) as Record<FiscalLock, number>,
      locks: sSim.fiscal?.locks ?? [],
      stride: fiscalStride(state)
    };
  }

  /** God mode: pin a fiscal line so the ruler's drift leaves it alone. Returns the new lock state. */
  toggleFiscalLock(stateId: number, line: FiscalLock, locked?: boolean): boolean {
    const living = this.getState();
    const sSim = living.states[stateId];
    if (!sSim) return false;
    if (!sSim.fiscal) sSim.fiscal = {};
    const fiscal = sSim.fiscal;
    const locks = new Set(fiscal.locks ?? []);
    const next = locked ?? !locks.has(line);
    if (next) locks.add(line);
    else locks.delete(line);
    fiscal.locks = [...locks];
    return next;
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

        const burgPoint = pack.cells.p?.[cell];
        const distance =
          burgPoint && statePoint ? Math.hypot(burgPoint[0] - statePoint[0], burgPoint[1] - statePoint[1]) : 0;
        const score = (burg?.capital ? 1000 : 0) + (node.influence ?? node.secrecy) - distance * 0.1;

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

  // -------------------------------------------------------------------------
  // Slice 5: OpenCiv 1UPT tactical layer — units, combat, builders, settlers,
  // city sieges and Gold upgrades.
  // -------------------------------------------------------------------------

  unitKey(stateId: number, regimentId: number): string {
    return `${stateId}-${regimentId}`;
  }

  /**
   * Reconcile `living.armies` (combat) with the
   * native regiments (terrain packs only). Composition stays on
   * `Regiment.units`; this only guarantees one live state record per regiment.
   */
  private syncArmies(living: LivingWorldState): void {
    if (!this.hasCityTerrain()) return;
    living.armies ??= {};
    const unitTypes = Military.getUnitTypes();
    const aliveArmies = new Set<string>();
    const maxSlots = currentContent().config.military.maxUnitsPerArmy;

    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;

      for (const regiment of state.military ?? []) {
        const key = this.unitKey(state.i, regiment.i);

        // Phase 1 strips the civilians: old saves' utility regiments disband.
        if (isCivilianUnit((regiment.type ?? "").toLowerCase())) {
          this.removeRegiment(state, regiment, living);
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
      for (const regiment of [...(faction.military ?? [])]) {
        const key = this.factionUnitKey(faction.i, regiment.i);
        if (isCivilianUnit((regiment.type ?? "").toLowerCase())) {
          this.removeFactionRegiment(faction, regiment, living);
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

    for (const key of Object.keys(living.armies)) {
      if (!aliveArmies.has(key)) delete living.armies[key];
    }
  }

  /**
   * Occupant registry: one combat army per polity and cell, never two polities.
   * Polity ids: state ids are positive, faction ids are negated (see `factionOwnerId`).
   */
  private armyOccupancy(
    _living: LivingWorldState
  ): Map<number, { stateId: number; isUtility: boolean; key: string }[]> {
    const map = new Map<number, { stateId: number; isUtility: boolean; key: string }[]>();
    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      for (const regiment of state.military ?? []) {
        const key = this.unitKey(state.i, regiment.i);
        if (armyIsEmpty(regiment)) continue;
        const list = map.get(regiment.cell) ?? [];
        list.push({ stateId: state.i, isUtility: false, key });
        map.set(regiment.cell, list);
      }
    }
    for (const faction of Factions.active()) {
      for (const regiment of faction.military ?? []) {
        const key = this.factionUnitKey(faction.i, regiment.i);
        if (armyIsEmpty(regiment)) continue;
        const list = map.get(regiment.cell) ?? [];
        list.push({ stateId: this.factionOwnerId(faction.i), isUtility: false, key });
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

    const target = occupancy.get(cell) ?? [];
    target.push({ stateId, isUtility: false, key });
    occupancy.set(cell, target);
  }

  private removeRegiment(state: State, regiment: Regiment, living: LivingWorldState): void {
    state.military = (state.military ?? []).filter(entry => entry !== regiment);
    const key = this.unitKey(state.i, regiment.i);
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

  /** One tactical tick: army orders, battles, city strikes and replenishment. */
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
        ...(attackerLordMult !== 1 ? { attackerLordMult } : {})
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
      modifiers: this.factionBattleModifiers(attackerRegiment, defenderRegiment, defenderKind, defenderId)
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
    attackerRegiment: Regiment,
    defenderRegiment: Regiment,
    defenderKind: "state" | "faction",
    defenderId: number
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
    const defenderLordMult = defenderKind === "state" ? this.stateCombatMult(defenderId, living) : 1;
    return {
      walls,
      defenderEncamped: defenderArmy?.stance === "encamp" || defenderArmy?.stance === "fortify",
      defenderAmbushed: defenderArmy?.stance === "ambush",
      attackerCrossedRiver,
      defenderTerrain: terrainDefenseMultiplier(defenderRegiment.cell) > 1,
      labels: [],
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
      modifiers: this.factionSiegeModifiers(burg)
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

  private factionSiegeModifiers(burg: Burg): BattleModifiers {
    const living = this.getState();
    const defenderId = burg.state ?? 0;
    const defenderLordMult = this.stateCombatMult(defenderId, living);
    return {
      walls: Number(burg.walls ?? 0),
      defenderEncamped: true,
      defenderAmbushed: false,
      attackerCrossedRiver: false,
      defenderTerrain: terrainDefenseMultiplier(burg.cell) > 1,
      labels: [],
      ...(defenderLordMult !== 1 ? { defenderLordMult } : {})
    };
  }

  private captureFactionBurg(faction: Faction, burg: Burg, living: LivingWorldState): void {
    if (
      faction.sovereignAmbition &&
      !burg.capital &&
      (faction.seasonsActive >= 4 || this.factionDevelopment(faction) >= SOVEREIGN_DEVELOPMENT)
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
      text: `${faction.name} pillaged ${burg.name ?? "a settlement"} and seized ${loot} ${getMoneyUnit(loot !== 1)}!`,
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
    const wasCapital = Boolean(burg.capital);
    if (wasCapital && warExhaustion > 30) return "sack";
    const ruler = sSim?.rulerId !== undefined ? this.findFigure(sSim.rulerId) : undefined;
    if (ruler?.alignment === "evil" || ruler?.alignment === "chaotic") return "sack";
    if (warExhaustion > 20) return "loot";
    return "occupy";
  }

  /** §4.4: a state's forces fight at their upkeep-funded strength. */
  private stateCombatMult(stateId: number, _living: LivingWorldState): number {
    return Military.getLivingBattleUpkeep(stateId);
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

  /** §5.3 city capture: half the people, reset HP, raze or plunder works per policy. */
  private captureCity(state: State, burg: Burg, living: LivingWorldState, policy: string = "occupy"): void {
    const previousStateId = burg.state ?? 0;
    const wasCapital = Boolean(burg.capital);
    this.annexBurg(state.i, burg, true);
    this.logConquest(state, burg, true);

    const bSim = living.burgs[burg.i];
    if (!bSim) return;
    bSim.civBuildings ??= [];

    if (wasCapital) this.relocateCapital(previousStateId, burg);

    // Base booty from city population.
    const baseBooty = Math.round((burg.population ?? 1) * 10);

    burg.population = Math.max(0.5, Math.round((burg.population ?? 1) / 2));
    bSim.maxHp = CITY_BASE_HP;
    bSim.hp = 100;

    // Apply capture policy effects.
    switch (policy) {
      case "raze":
        bSim.civBuildings = [];
        syncCivFlagsFromBuildings(burg, []);
        bSim.unrest = 5;
        state.economy.treasury = (state.economy.treasury ?? 0) + baseBooty * 3;
        break;
      case "sack":
        if (bSim.civBuildings.length > 0) bSim.civBuildings.pop();
        syncCivFlagsFromBuildings(burg, bSim.civBuildings);
        bSim.unrest = 15;
        state.economy.treasury = (state.economy.treasury ?? 0) + baseBooty * 4;
        break;
      case "loot":
        bSim.unrest = 20;
        state.economy.treasury = (state.economy.treasury ?? 0) + baseBooty * 2;
        break;
      default: // occupy
        bSim.unrest = 6 + settlementTierFromPop(burg.population);
        break;
    }

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
    const development = this.stateDevelopment(state.i);
    const renames: string[] = [];
    let upgraded = 0;

    for (const block of regiment.units ?? []) {
      if (upgraded >= maxBlocks) break;
      const current = types[block.type];
      if (!current) continue;
      const authored = current.upgradesTo ? types[current.upgradesTo] : undefined;
      const target = authored ?? (roster ? nextRosterUnitInCategory(roster, current.id) : undefined);
      if (!target || target.id === current.id) continue;
      if (roster && development < requiredDevelopmentFor(target, roster)) continue;

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
      const camp = this.hasProject(state.i, "army_camp", living) ? PROJECT_CAMP_REPLENISH : 0;
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
          ((army.stance === "encamp" ? base * config.military.encampReplenishBonus : base) + camp) * (inCity ? 1 : 0.5);
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
        if (!inCity) continue;

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

    // Apply seasonal unravel clock changes from unrest balance
    for (const key of Object.keys(living.states)) {
      const sSim = living.states[Number(key)];
      if (!sSim) continue;

      const restiveCount = restiveCountByState.get(sSim.stateId) ?? 0;

      let delta = 0;
      if (restiveCount > 0) delta += restiveCount * 4;
      if (sSim.warExhaustion >= 50) delta += 2;
      if (restiveCount === 0 && sSim.unravel > 0) delta -= 2;

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
    const development = this.stateDevelopment(state.i);

    for (const unitId of roster.recruitable) {
      const unit = unitTypes[unitId];
      if (!unit) continue;
      if (development < requiredDevelopmentFor(unit, roster)) continue; // the era ladder gates it
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
        const booty = Math.round(Math.max(1, burg.population ?? 1) * 2 + 10);
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
        // Resolve the current node, preferring the one the agenda already targets.
        let target: FactionSuppressionTarget | null = null;
        const agendaBurg = agenda.targetBurgId !== undefined ? pack.burgs[agenda.targetBurgId] : undefined;
        if (agendaBurg) {
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
        agenda.required = FACTION_SUPPRESSION_SEASONS;

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

        // Administrative pressure: each season costs the treasury a day-rate of the
        // campaign (the old production plan), and a guarded node stalls it.
        const tier = target.isHq ? 2 : "tier" in target.node ? target.node.tier : 2;
        const cost = factionSuppressionProductionCost({ tier });
        if (Number(state.economy.treasury ?? 0) < cost) {
          agenda.stallUntilTick = living.tick + 2; // underfunded: the magistrates wait
          return;
        }
        state.economy.treasury = Math.round((Number(state.economy.treasury ?? 0) - cost) * 100) / 100;
        agenda.progress += 1;
        if (agenda.progress < agenda.required) return;

        if (this.factionNodeHasGuard(target.faction, target.node)) {
          agenda.stallUntilTick = living.tick + 4;
          agenda.progress = agenda.required - 1;
          return;
        }
        this.applyFactionSuppressionPressure(state, target, living);
        agenda.progress = 0;
        if ((target.node.influence ?? 0) <= 0) sSim.agenda = null;
        return;
      }
      default:
        sSim.agenda = null;
    }
  }

  /** God mode: commission a specific work (optionally at a target), paying its treasury cost now. */
  commissionProject(stateId: number, projectId: string, targetId?: number): boolean {
    const living = this.getState();
    const state = pack.states[stateId];
    const sSim = living.states[stateId];
    const def = PROJECT_BY_ID[projectId];
    if (!state?.i || state.removed || !sSim || !def || sSim.project) return false;
    if (this.stateDevelopment(stateId) < def.minDevelopment) return false;
    if (Number(state.economy.treasury ?? 0) < def.treasury) return false;

    if (!living.projects) living.projects = [];
    const target = targetId ?? this.projectTarget(state, def, living);
    if (target === null) return false;
    if (living.projects.some(project => project.id === def.id && project.targetId === target)) return false;

    state.economy.treasury = Math.round((Number(state.economy.treasury) - def.treasury) * 100) / 100;
    sSim.project = { id: def.id, scale: def.scale, targetId: target, turnsLeft: def.seasons };
    living.economyDirty = true;
    return true;
  }

  /** Hazards and hostile factions drain the purse: one negative line per troubled province. */
  private syncTroubleLines(living: LivingWorldState): void {
    const prefixes = ["Trouble: ", "Raiders: "];
    const isOurs = (name: string) => prefixes.some(prefix => name.startsWith(prefix));

    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const current = state.economy.simAdjustments ?? [];
      const kept = current.filter(line => !isOurs(line.name));
      const lines: { name: string; value: number }[] = [];

      for (const province of this.ownedProvinces(state.i)) {
        const pSim = living.provinces[province.i];
        if (!pSim?.trouble) continue;
        const value = -Math.max(1, Math.round(pSim.trouble.level * 0.8 + 1));
        lines.push({ name: `Trouble: ${pSim.trouble.name} in ${province.name ?? "the province"}`, value });
      }

      for (const faction of Factions.active()) {
        if (faction.allegiance !== "hostile" && faction.allegiance !== "clandestine") continue;
        const provinceId = this.factionProvinceId(faction);
        const province = provinceId ? pack.provinces?.[provinceId] : undefined;
        if (!province?.i || province.state !== state.i) continue;
        const value = -Math.min(6, 2 + Math.floor((faction.seasonsActive ?? 0) / 3));
        lines.push({ name: `Raiders: ${faction.name} in ${province.name ?? "the province"}`, value });
      }

      const next = [...kept, ...lines];
      if (JSON.stringify(next) === JSON.stringify(current)) continue;
      state.economy.simAdjustments = next;
      living.economyDirty = true;
    }
  }

  /** A cleared hazard drops a small treasure into the clearer's treasury; returns it. */
  rewardTroubleClear(provinceId: number, level = 5): number {
    const state = pack.states[pack.provinces?.[provinceId]?.state ?? 0];
    if (!state?.i || state.removed) return 0;
    const loot = 20 + level * 5;
    state.economy.treasury = Math.round((Number(state.economy.treasury ?? 0) + loot) * 100) / 100;
    return loot;
  }

  /** Each season: advance a public work, or commission the next one the ruler favours. */
  private stepProjects(living: LivingWorldState): void {
    living.projects ??= [];
    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states[state.i];
      if (!sSim) continue;

      if (sSim.project) {
        if (sSim.project.turnsLeft > 1) {
          sSim.project.turnsLeft -= 1;
          continue;
        }
        this.completeProject(state, sSim, living);
        continue;
      }

      this.startProject(state, sSim, living);
    }
  }

  /** Pay for and begin the best work the ruler can afford and values. */
  private startProject(state: State, sSim: StatePolitySim, living: LivingWorldState): void {
    const development = this.stateDevelopment(state.i);
    const treasury = Number(state.economy.treasury ?? 0);
    const bias = rulerBias(state.i) ?? { martial: 0.1, civic: 0.1, pious: 0.1, cruel: 0 };

    let best: { def: ProjectDef; target: number; score: number } | null = null;
    for (const def of PROJECTS) {
      if (development < def.minDevelopment) continue;
      if (treasury < def.treasury + PROJECT_RESERVE) continue;
      const target = this.projectTarget(state, def, living);
      if (target === null) continue;
      const score = this.projectScore(state, def, target, bias, living);
      if (!best || score > best.score || (score === best.score && def.id < best.def.id)) {
        best = { def, target, score };
      }
    }
    if (!best) return;

    state.economy.treasury = Math.round((treasury - best.def.treasury) * 100) / 100;
    sSim.project = { id: best.def.id, scale: best.def.scale, targetId: best.target, turnsLeft: best.def.seasons };
    living.economyDirty = true;

    const where = this.projectTargetName(state, best.def, best.target);
    this.pushNews(living, {
      kind: "build",
      text: `${state.name} begins ${this.withArticle(projectName(best.def))}${where ? ` in ${where}` : ""}.`,
      cell: this.projectTargetCell(state, best.def, best.target),
      stateId: state.i,
      burgId: best.def.scale === "burg" ? best.target : undefined
    });
  }

  /** The target id a project would build at, or null when none is valid or free. */
  private projectTarget(state: State, def: ProjectDef, living: LivingWorldState): number | null {
    const built = (targetId: number) =>
      (living.projects ?? []).some(project => project.id === def.id && project.targetId === targetId) ||
      (living.states[state.i]?.project?.id === def.id && living.states[state.i]?.project?.targetId === targetId);

    if (def.scale === "state") return built(state.i) ? null : state.i;

    if (def.scale === "province") {
      const provinces = this.ownedProvinces(state.i)
        .filter(province => province.i && !province.removed)
        .filter(province => !built(province.i))
        .sort((a, b) => (living.provinces[a.i]?.order ?? 70) - (living.provinces[b.i]?.order ?? 70) || a.i - b.i);
      return provinces[0]?.i ?? null;
    }

    const burgs = this.stateBurgs(state.i).filter(burg => !built(burg.i));
    if (!burgs.length) return null;
    if (def.needsCoast) {
      const coastal = burgs
        .filter(burg => this.isCoastal(burg) && !burg.port)
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.i - b.i);
      if (!coastal.length) return null;
      return coastal[0]!.i;
    }
    if (def.effect.market) {
      const charterable = burgs
        .filter(burg => !(pack.markets ?? []).some(market => market.centerBurgId === burg.i))
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.i - b.i);
      if (!charterable.length) return null;
      return charterable[0]!.i;
    }
    if (def.effect.burgFlag === "walls") {
      const border = burgs
        .filter(burg => !burg.capital && this.isBorderBurg(state.i, burg))
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.i - b.i);
      if (border.length) return border[0]!.i;
    }
    return (burgs.find(burg => burg.capital) ?? burgs[0]!).i;
  }

  /** How much this ruler wants that work at that target right now. */
  private projectScore(
    state: State,
    def: ProjectDef,
    target: number,
    bias: { martial: number; civic: number; pious: number; cruel: number },
    living: LivingWorldState
  ): number {
    let score = 1;
    for (const key of ["martial", "civic", "pious", "cruel"] as const) {
      score += (def.affinity?.[key] ?? 0) * bias[key] * 10;
    }

    if (this.stateAtWar(state)) {
      if (def.id === "walls" || def.id === "army_camp") score += 8;
      if (def.id === "granary") score += 3;
    }
    if ((state.economy.budget.corruption ?? 0) >= 25 && def.id === "courthouse") score += 8;
    if (def.id === "land_improvement" && this.stateDevelopment(state.i) < 27) score += 4;
    if (def.id === "college" && this.stateDevelopment(state.i) >= 27) score += 4;
    if (def.id === "market_charter" && this.stateBurgs(state.i).length >= 3) score += 3;

    const provinceId = def.scale === "province" ? target : this.provinceOfTarget(def, target);
    const trouble = provinceId ? living.provinces[provinceId]?.trouble : null;
    if (trouble) {
      if (def.id === "granary" || def.id === "courthouse") score += 6;
    }
    const order = provinceId ? (living.provinces[provinceId]?.order ?? 70) : 70;
    if (order < 50 && (def.id === "courthouse" || def.id === "granary")) score += 4;

    return score;
  }

  /** Finish a work: buy its goods from the market, write its effects, chronicle it. */
  private completeProject(state: State, sSim: StatePolitySim, living: LivingWorldState): void {
    const active = sSim.project;
    if (!active) return;
    const def = PROJECT_BY_ID[active.id];
    if (!def) {
      sSim.project = undefined;
      return;
    }

    const burgId = this.projectBurgId(state, def, active.targetId);
    const burg = burgId ? pack.burgs[burgId] : undefined;
    if (!def || (def.scale !== "state" && (!burg?.i || burg.removed || burg.state !== state.i))) {
      sSim.project = undefined; // the target is no longer the ruler's
      return;
    }

    if (!this.consumeProjectGoods(burg, def)) {
      sSim.project = undefined;
      this.pushNews(living, {
        kind: "build",
        text: `${state.name} abandons its ${projectName(def).toLowerCase()}: the markets cannot supply the works.`,
        cell: burg?.cell ?? state.center,
        stateId: state.i
      });
      return;
    }

    const line = this.applyProjectEffect(state, def, active.targetId, burgId);
    const where = this.projectTargetName(state, def, active.targetId);
    const project: LivingProject = {
      id: def.id,
      name: projectName(def),
      stateId: state.i,
      scale: def.scale,
      targetId: active.targetId,
      burgId,
      completedTick: living.tick,
      ...(line ? { line } : {})
    };
    living.projects ??= [];
    living.projects.push(project);
    sSim.project = undefined;
    living.economyDirty = true;

    const text = `${state.name} completes ${this.withArticle(projectName(def))}${where ? ` in ${where}` : ""}.`;
    this.pushNews(living, {
      kind: "build",
      text,
      cell: burg?.cell ?? state.center,
      stateId: state.i,
      burgId
    });
    this.pushHistory(
      "deed",
      [{ kind: "state", id: state.i }, ...(burg?.i ? [{ kind: "burg", id: burg.i } as HistRef] : [])],
      burg?.cell ?? state.center,
      text
    );
  }

  /** A work buys its goods from the town's market; a stripped map without one needs none. */
  private consumeProjectGoods(burg: Burg | undefined, def: ProjectDef): boolean {
    const goods = projectGoods(def);
    if (!goods?.length) return true;
    if (!pack.markets?.length) return true; // no markets on this map
    Markets.sync();
    const market = burg ? Markets.ofBurg(burg) : undefined;
    if (!market) return true; // no market on this map: the work draws on the treasury alone

    for (const cost of goods) {
      const good = options.map.goods?.find(entry => entry.name === cost.name);
      if (!good) continue; // the good is not traded here
      const row = market.goods[good.i];
      if (!row || row.stock + 0.01 < cost.units) return false;
    }
    for (const cost of goods) {
      const good = options.map.goods?.find(entry => entry.name === cost.name);
      const row = good ? market.goods[good.i] : undefined;
      if (!row) continue;
      row.stock = Math.round((row.stock - cost.units) * 100) / 100;
    }
    return true;
  }

  /** Write every effect of a finished work; returns the daily line it added, if any. */
  private applyProjectEffect(
    state: State,
    def: ProjectDef,
    targetId: number,
    burgId: number | undefined
  ): { name: string; value: number } | undefined {
    const { effect } = def;
    const burg = burgId ? pack.burgs[burgId] : undefined;
    const targetName = this.projectTargetName(state, def, targetId) ?? state.name;
    let line: { name: string; value: number } | undefined;

    if (effect.line) {
      const label = projectLineLabel(def) ?? effect.line.label;
      const name = `${label} of ${targetName}`;
      const value = effect.line.value;
      line = { name, value };
      const merge = (lines: { name: string; value: number }[] | undefined) => [
        ...(lines ?? []).filter(entry => entry.name !== name),
        { name, value }
      ];
      if (def.scale === "burg" && burg) burg.simAdjustments = merge(burg.simAdjustments);
      else state.economy.simAdjustments = merge(state.economy.simAdjustments);
    }

    if (effect.development) {
      const provinceId = this.provinceOfTarget(def, targetId);
      if (provinceId) this.raiseProvinceDevelopment(provinceId, effect.development, this.getState());
    }

    if (effect.corruption) {
      const corruption = Math.max(0, Math.round((state.economy.budget.corruption ?? 0) - effect.corruption));
      States.setCorruption(state.i, corruption);
    }

    if (effect.burgFlag && burg) {
      switch (effect.burgFlag) {
        case "walls":
          burg.walls = Math.min(3, Number(burg.walls ?? 0) + 1);
          if (burg.walls >= 2) burg.citadel = 1;
          break;
        case "citadel":
          burg.citadel = 1;
          break;
        case "plaza":
          burg.plaza = 1;
          break;
        case "temple":
          burg.temple = 1;
          break;
        case "port":
          burg.port = 1;
          break;
      }
    }

    if (effect.improvement) {
      const provinceId = this.provinceOfTarget(def, targetId);
      if (provinceId) this.improveProvince(provinceId, this.getState());
    }

    if (effect.route) {
      for (const town of this.stateBurgs(state.i)) {
        if (Routes.isConnected(town.cell)) continue;
        try {
          Routes.connect(town.cell);
        } catch {
          // a stripped map has no route grid
        }
      }
    }

    if (effect.market && burg?.i) {
      try {
        Markets.addMarket(burg.i);
        Markets.expand();
      } catch {
        // a stripped map has no market grid
      }
    }

    return line;
  }

  /** Lay improvements across a province's peopled cells (works that the economy can read). */
  private improveProvince(provinceId: number, living: LivingWorldState): void {
    living.cells ??= {};
    for (const cell of this.provinceCells(provinceId)) {
      if (!pack.cells.pop[cell] && !pack.cells.burg?.[cell]) continue;
      if (pack.cells.h[cell] < 20) continue;
      if (living.cells[cell]?.improvement) continue;
      const improvement = this.improvementForCell(cell);
      if (!improvement) continue;
      living.cells[cell] = { ...(living.cells[cell] ?? {}), improvement, pillaged: false, progress: {} };
    }
  }

  /** The land work a cell wants: forest mills, hill mines, farms elsewhere. */
  private improvementForCell(cell: number): string | null {
    const height = Number(pack.cells.h?.[cell] ?? 0);
    if (height < 20) return null;
    if (height >= 50) return "mine";
    const biome = Number(pack.cells.biome?.[cell] ?? 0);
    if (biome === 6 || biome === 8 || biome === 9) return "lumber_mill";
    if (biome === 12) return "pasture";
    return "farm";
  }

  /** Whether the state owns a finished work of this kind. */
  private hasProject(stateId: number, id: string, living: LivingWorldState): boolean {
    return (living.projects ?? []).some(project => project.stateId === stateId && project.id === id);
  }

  /** The burg a work is built at: the target itself, or a settlement of the province/state. */
  private projectBurgId(state: State, def: ProjectDef, targetId: number): number | undefined {
    if (def.scale === "burg") return targetId;
    if (def.scale === "province") return this.pickProvinceSettlement(targetId, state.i) ?? state.capital;
    return state.capital;
  }

  /** The province a work belongs to, for development and improvements. */
  private provinceOfTarget(def: ProjectDef, targetId: number): number | undefined {
    if (def.scale === "province") return targetId;
    if (def.scale === "burg") {
      const burg = pack.burgs[targetId];
      const provinceId = burg ? Number(pack.cells.province?.[burg.cell] ?? 0) : 0;
      return provinceId || undefined;
    }
    return undefined;
  }

  /** A work's target as a readable name. */
  private projectTargetName(state: State, def: ProjectDef, targetId: number): string | undefined {
    if (def.scale === "state") return state.name;
    if (def.scale === "province") return pack.provinces?.[targetId]?.name;
    return pack.burgs[targetId]?.name;
  }

  /** A work's target as a map cell, for news and markers. */
  private projectTargetCell(state: State, def: ProjectDef, targetId: number): number | undefined {
    if (def.scale === "burg") return pack.burgs[targetId]?.cell;
    if (def.scale === "province") return pack.provinces?.[targetId]?.center;
    return state.center;
  }

  private withArticle(name: string): string {
    return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`;
  }

  /** A state's surface burgs, capital first on ties. */
  private stateBurgs(stateId: number): Burg[] {
    return pack.burgs
      .filter((burg): burg is Burg => Boolean(burg?.i && !burg.removed && burg.state === stateId))
      .sort((a, b) => Number(b.capital ?? 0) - Number(a.capital ?? 0) || a.i - b.i);
  }

  /** A burg with sea at its door. */
  private isCoastal(burg: Burg): boolean {
    return (pack.cells.c?.[burg.cell] ?? []).some(cell => Number(pack.cells.h?.[cell] ?? 20) < 20);
  }

  /** A burg touching another state. */
  private isBorderBurg(stateId: number, burg: Burg): boolean {
    return (pack.cells.c?.[burg.cell] ?? []).some(cell => {
      const owner = Number(pack.cells.state?.[cell] ?? 0);
      return owner > 0 && owner !== stateId;
    });
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
      // The project's real effect is on the map: its peopled cells gain development.
      this.raiseProvinceDevelopment(province.i, 2, living);
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

  /** A completed develop project raises its province's peopled cells, unlocking goods tiers. */
  private raiseProvinceDevelopment(provinceId: number, amount: number, living: LivingWorldState): void {
    const development = pack.cells.development;
    if (!development) return;
    let changed = false;
    for (const cell of this.provinceCells(provinceId)) {
      if (!development[cell]) continue; // wild land stays wild
      development[cell] = Math.min(100, development[cell] + amount);
      changed = true;
    }
    if (changed) living.economyDirty = true;
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

  /** Spring: faith drifts province by province on court spending, zeal and holy ground. */
  private stepReligiousDrift(_living: LivingWorldState): void {
    if (!pack.cells.religion) return;
    for (const state of pack.states) {
      if (!state?.i || state.removed) continue;
      if (!this.getStateReligion(state)) continue;
      for (const province of this.ownedProvinces(state.i)) this.convertProvince(state.i, province.i);
    }
  }

  /** One spring's conversion attempt in a province; returns how many cells took the state faith. */
  convertProvince(stateId: number, provinceId: number, attempt = 0): number {
    const living = this.getState();
    if (!pack.cells.religion) return 0;
    const state = pack.states[stateId];
    if (!state?.i || state.removed) return 0;
    const faith = this.getStateReligion(state);
    if (!faith) return 0;

    const mix = this.provinceFaithMix(provinceId);
    if (!mix || mix.total === 0) return 0;
    if ((mix.counts.get(faith) ?? 0) > mix.total / 2) return 0; // already the faith's province

    const pressure = this.religiousPressure(stateId, provinceId);
    if (pressure <= 0) return 0;
    if (!this.rng("religion:drift", provinceId * 1000 + attempt, living.tick).chance(pressure)) return 0;

    const province = pack.provinces?.[provinceId];
    const capitalCell = province?.burg ? pack.burgs[province.burg]?.cell : undefined;
    const holdouts = mix.cells
      .filter(cell => pack.cells.religion![cell] !== faith)
      .sort((a, b) => {
        const rank = (cell: number) => (cell === capitalCell ? 2 : Number(pack.cells.burg?.[cell] ?? 0) > 0 ? 1 : 0);
        return rank(a) - rank(b) || a - b;
      });
    if (!holdouts.length) return 0;

    const convert = Math.max(1, Math.floor(holdouts.length * (0.04 + 0.12 * pressure)));
    for (const cell of holdouts.slice(0, convert)) pack.cells.religion[cell] = faith;
    living.economyDirty = true; // faith feeds corruption, diversity and stability

    const converted = this.provinceFaithMix(provinceId);
    const nowMajority = converted ? (converted.counts.get(faith) ?? 0) > converted.total / 2 : false;
    if (nowMajority) {
      const religionName = pack.religions?.[faith]?.name ?? "the faith";
      const text = `${province?.name ?? "A province"} now follows ${religionName} under ${state.name}.`;
      this.pushNews(living, {
        kind: "religion",
        text,
        cell: province?.center,
        stateId,
        ...(province?.burg ? { burgId: province.burg } : {})
      });
      this.pushHistory(
        "schism",
        [{ kind: "state", id: stateId }, ...(province?.burg ? [{ kind: "burg", id: province.burg } as HistRef] : [])],
        province?.center,
        text
      );
    }
    return convert;
  }

  /** Chance a province's holdouts convert this spring, 0..0.85 (court spending × zeal × holy ground). */
  religiousPressure(stateId: number, provinceId: number): number {
    const state = pack.states[stateId];
    if (!state?.i || state.removed || !pack.cells.religion) return 0;
    const faith = this.getStateReligion(state);
    if (!faith) return 0;
    const mix = this.provinceFaithMix(provinceId);
    if (!mix || mix.total === 0) return 0;

    const share = (mix.counts.get(faith) ?? 0) / mix.total;
    if (share >= 1) return 0;
    const court = StateOrders.getProvision(state, "court");
    const zeal = minmax(rulerBias(stateId)?.pious ?? 0.1, 0, 0.8);
    const holyCell = pack.religions?.[faith]?.center;
    const holdsHolySite =
      holyCell !== undefined && holyCell >= 0 && Number(pack.cells.state?.[holyCell] ?? 0) === stateId;
    const pressure = (0.08 + 0.6 * court) * (0.5 + zeal) * (1 + share) * (holdsHolySite ? 1.25 : 1) * (1 - share * 0.8);
    return Math.round(minmax(pressure, 0, 0.85) * 1000) / 1000;
  }

  /** A province's cells, counted by faith. */
  private provinceFaithMix(provinceId: number): { total: number; counts: Map<number, number>; cells: number[] } | null {
    const religion = pack.cells.religion;
    if (!religion) return null;
    const cells = this.provinceCells(provinceId).filter(cell => Number(religion[cell] ?? 0) > 0);
    if (!cells.length) return null;
    const counts = new Map<number, number>();
    for (const cell of cells) {
      const faith = Number(religion[cell]);
      counts.set(faith, (counts.get(faith) ?? 0) + 1);
    }
    return { total: cells.length, counts, cells };
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

        // A funded administration grinds a hazard down before it festers; a cleared
        // hazard leaves a small treasure for the state that paid to end it.
        if (pSim.trouble) {
          const administration = pack.states[province.state]?.economy.budget.administration ?? 0;
          const adminFunded = administration >= 15 && Number(pack.states[province.state]?.economy.treasury ?? 0) >= 0;
          if (adminFunded && this.rng("trouble:admin", province.i, living.tick).chance(0.25)) {
            const levelBefore = pSim.trouble.level;
            pSim.trouble.level -= 1;
            pSim.trouble.seasonsUnchecked = 0;
            pSim.order = Math.min(100, pSim.order + 2);
            if (pSim.trouble.level <= 0) {
              pSim.trouble = null;
              const loot = this.rewardTroubleClear(province.i, Math.max(2, levelBefore));
              this.pushNews(living, {
                kind: "trouble",
                text: `${province.name ?? "The province"}'s courts cleared its troubles and recovered ${loot} ${getMoneyUnit(loot !== 1)}.`,
                cell: province.center,
                stateId: province.state
              });
            }
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
        // Stock rails feed the roll: a fragile, corrupt, unprosperous land breeds trouble.
        const stability = Stability.get(province.state)?.stability ?? null;
        if (stability !== null && stability < 0.4) spawnChance += 0.05;
        if ((pack.states[province.state]?.economy.budget.corruption ?? 0) >= 25) spawnChance += 0.03;
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
      agenda.progress += 8; // a caretaker faction's seasonal clearing effort
      if (agenda.progress >= agenda.required) {
        const troubleName = pSim.trouble.name;
        const province = pack.provinces?.[provinceId];
        const clearedLevel = pSim.trouble.level;
        pSim.trouble = null;
        pSim.order = Math.min(100, pSim.order + 10);
        pSim.stability += 1;
        faction.treasury = Math.round((Number(faction.treasury ?? 0) + 15 + clearedLevel * 3) * 100) / 100;
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
        this.factionDevelopment(faction) >= SOVEREIGN_DEVELOPMENT
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
