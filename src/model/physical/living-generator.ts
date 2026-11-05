// Living World seasonal simulation engine. See docs/plans/living-world.md
import { currentContent } from "@/conquest/content/store";
import {
  assignStateRoster,
  type BuildingDef,
  inferRosterForCulture,
  MEN_PER_BLOCK,
  type ResolvedRoster,
  type UnitType
} from "@/conquest/engine/common/content";
import type { ArmyBlock, ArmyUnit, CapacityPoints } from "@/conquest/engine/common/types";
import { REGION_TIER_STEPS, SETTLEMENT_TIER_STEPS } from "@/conquest/engine/compiler";
import {
  type BattleModifiers,
  type BattleOutcome,
  type BattleSession,
  type BattleTacticalOrder,
  estimateOdds,
  finalizeBattle,
  initBattleSession,
  stepBattleRound
} from "@/conquest/engine/game/battle";
import { assetCheckDifficulties, valueModifier } from "@/conquest/engine/game/saves";
import { garrisonUnits, minorGarrisonUnits } from "@/conquest/engine/game/units";
import type { Alignment } from "@/data/culture-traits";
import { aggressiveTraits, drawVice, rollAlignment, rollFigureTraits, traitsRng } from "@/data/culture-traits";
import { convertDangerMarkerToRuins, createLairFromMarker, isDangerMarker } from "@/data/danger-markers";
import { FACTION_ASSETS_CATALOG, getFactionAsset } from "@/data/faction-assets";
import { getFactionArchetype } from "@/data/factions-catalog";
import { GUILD_OPERATIONS, type GuildOperationKind } from "@/data/guild-operations";
import {
  defaultPathForDoctrine,
  figureArchetype,
  figureDisciplines,
  findHeroPath,
  HERO_ARCHETYPES,
  inferHeroArchetype,
  pendingPathLevel,
  rollHeroArchetype
} from "@/data/hero-archetypes";
import { aspectBonus } from "@/data/hero-aspects";
import { disciplineBonus, matchingDisciplines } from "@/data/hero-disciplines";
import {
  HERO_INJURY_LABELS,
  heroMaxVitals,
  heroTemperamentFor,
  injuryPenalty,
  recoverInjuries,
  STAMINA_RESERVE_MINIMUM
} from "@/data/hero-vitals";
import {
  CIV_BELIEF_BY_ID,
  CIV_ENHANCER_BELIEFS,
  CIV_FOLLOWER_BELIEFS,
  CIV_FOUNDER_BELIEFS,
  CIV_PANTHEONS,
  CIV_RELIGION_NAMES
} from "@/data/living-civ-beliefs";
import { CIV_BUILDING_BY_ID, CIV_BUILDINGS, civBuildingCapacity } from "@/data/living-civ-buildings";
import { CIV_CIVILIAN_BY_ID } from "@/data/living-civ-civilians";
import { CIV_IMPROVEMENT_BY_ID, CIV_RESOURCE_BY_ID } from "@/data/living-civ-improvements";
import { CIV_TECH_BY_ID, CIV_TECHS } from "@/data/living-civ-techs";
import { isCivEraAvailable, resolveCivTechName, selectCivTheme } from "@/data/living-civ-themes";
import {
  createProvinceLair,
  getLairDef,
  growLair,
  instantiateLairUnits,
  isLairStateCapable,
  LAIR_NATURE_IDS,
  pickLairForTrouble
} from "@/data/living-lairs";
import {
  formatPetitionText,
  getPetitionDef,
  type PetitionContext,
  type PetitionDef,
  type PetitionEffect,
  petitionsForAnchor
} from "@/data/living-petitions";
import {
  equippedRelic,
  formatRelicLore,
  formatRelicName,
  isExcavationMarker,
  RELIC_CATALOG,
  RELIC_LEASE_TRIBUTE,
  relicCategoriesForMarker,
  relicGoldMultiplier,
  relicSurvivalBonus,
  relicXpMultiplier,
  vaultBonuses,
  vaultHasRoom
} from "@/data/living-relics";
import {
  BURG_TROUBLE_IDS,
  getTroubleDef,
  isTroubleStatePromotable,
  RESOURCE_TROUBLE_IDS,
  RUIN_TROUBLE_IDS,
  troubleUnitMatchMultiplier,
  UNIT_ROLE_POOLS
} from "@/data/living-troubles";
import { buildMissionPhases, type MissionPhaseInput, phasesForParty } from "@/data/mission-phases";
import { excavationMissionTags, lairMissionTags, PACIFY_MISSION_TAGS, troubleMissionTags } from "@/data/mission-tags";
import type { Good } from "@/model/economy/goods-generator";
import { Routes } from "@/model/economy/routes-generator";
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
  isCivilianUnit,
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
import { type Burg, Burgs } from "@/model/political/burgs-generator";
import { Factions } from "@/model/political/factions-generator";
import {
  Military,
  type Regiment,
  reconcileRegimentBlocks,
  syncRegimentTotals
} from "@/model/political/military-generator";
import type { Province } from "@/model/political/provinces-generator";
import { type State, States } from "@/model/political/states-generator";
import { Names } from "@/model/society/names-generator";
import type { Marker } from "@/model/story/markers-generator";
import { isAstralView } from "@/renderers/view-mode";
import type { Faction, FactionScale } from "@/types/factions";
import type { HistoricalFigure, HistoryEventType, HistRef, Realm } from "@/types/history";
import {
  type ActiveGuildMission,
  type ArmyBattleRecord,
  type ArmySimState,
  type ArmyStance,
  type BurgSimState,
  type CapacityLedger,
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
  type DisciplineId,
  type GrudgeReason,
  type GuildMissionKind,
  type GuildState,
  type HappinessBreakdown,
  type HeroArchetypeId,
  type HeroDoctrine,
  type HeroGuildState,
  type HeroInjury,
  type HistoricalRelic,
  type IdleDoctrine,
  type LivingNewsItem,
  type LivingNewsKind,
  type LivingPopup,
  type LivingPopupKind,
  type LivingWorldState,
  type MissionOutcome,
  type MissionPhase,
  type MissionTag,
  type ProductionItem,
  type ProvinceLair,
  type ProvinceSimState,
  type ProvinceTrouble,
  type RelicCategory,
  type ReligionBeliefState,
  SEASON_NAMES,
  type SeasonId,
  type StateAgenda,
  type StatePolitySim,
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

const MAX_RECENT_NEWS = 50;
const MAX_LIVING_POPUPS = 6;
const POPUP_LIFETIME_SEASONS = 3;

/** Renown required for each Guild tier, index 0 = tier 1 */
export const GUILD_RENOWN_THRESHOLDS = [0, 50, 150, 350, 700] as const;
export const GUILD_TIER_TITLES = [
  "Wayfarers' Lodge",
  "Chartered Company",
  "Grand Adventurers' Guild",
  "Sovereign Order",
  "Immortal Conclave"
] as const;
export const GUILD_MAX_HEROES = [3, 4, 6, 8, 10] as const;

const GUILD_DUES_PER_CHAPTER = 2;
const GUILD_CANDIDATES_PER_YEAR = 3;
/** Auto-dispatch will not send a hero on a contract with less than this estimated chance. */
const MIN_AUTO_DISPATCH_FIT = 0.25;
const HERO_RETIREMENT_AGE = 55;
const WHEEL_YEAR_LEAP = 150;
const GIANT_PROVINCE_LIMIT = 3;

const ERA_EPITHETS = [
  "Ash",
  "the Guild Compact",
  "Drowned Kings",
  "Iron and Salt",
  "Quiet Stars",
  "Broken Crowns"
] as const;
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

export function guildTierForRenown(renown: number): number {
  let tier = 1;
  for (let i = 1; i < GUILD_RENOWN_THRESHOLDS.length; i++) {
    if (renown >= GUILD_RENOWN_THRESHOLDS[i]!) tier = i + 1;
  }
  return tier;
}

export const maxHeroesForTier = (tier: number): number => GUILD_MAX_HEROES[Math.min(4, Math.max(0, tier - 1))]!;

/** Party size: two heroes below tier 3, three from tier 3. */
export const maxPartyForTier = (tier: number): number => (tier >= 3 ? 3 : 2);

/** Guild hall passive: +1 to checks at tier 2, +2 from tier 4 */
export const guildCheckBonus = (tier: number): number => (tier >= 4 ? 2 : tier >= 2 ? 1 : 0);

/** Hero level from lifetime xp: 40 + 20 × level per level */
export function figureLevel(xp = 0): number {
  let level = 1;
  let remaining = xp;
  let needed = 40 + 20 * level;
  while (remaining >= needed && level < 20) {
    remaining -= needed;
    level += 1;
    needed = 40 + 20 * level;
  }
  return level;
}

export interface FigureCheck {
  roll: number;
  total: number;
  dc: number;
  success: boolean;
  matchedDisciplines?: DisciplineId[];
  aspect?: number;
  staminaSpent?: number;
  injuryPenalty?: number;
  partyBonus?: number;
}

export interface HeroMissionFit {
  matchedDisciplines: DisciplineId[];
  discipline: number;
  aspect: number;
  alignment: number;
  total: number;
}

/** xp needed to enter a level: L1 0, L2 60, L3 140, ... */
export function xpForHeroLevel(level: number): number {
  let xp = 0;
  for (let step = 1; step < Math.max(1, level); step++) xp += 40 + 20 * step;
  return xp;
}

/** Old saves receive no retroactive points: absent progression starts at the current level. */
export function applyHeroLevels(figure: HistoricalFigure): boolean {
  const level = figureLevel(figure.xp ?? 0);
  figure.progression ??= {};

  if (figure.progression.appliedLevel === undefined) {
    figure.progression.appliedLevel = level;
    figure.progression.pendingChoices ??= 0;
    return false;
  }

  const appliedLevel = figure.progression.appliedLevel;
  if (level <= appliedLevel) return false;

  const def = figureArchetype(figure);
  figure.skills ??= { m: 0, w: 0, s: 0, c: 0 };

  let growthIndex = 0;
  for (let step = 2; step <= appliedLevel; step++) {
    if (step !== 3 && step !== 6) growthIndex += 1;
  }

  let pending = figure.progression.pendingChoices ?? 0;
  let gained = false;
  for (let step = appliedLevel + 1; step <= level; step++) {
    if (step === 3 || step === 6) {
      pending += 1;
      continue;
    }
    const pool = def.growthOrder[growthIndex % def.growthOrder.length]!;
    growthIndex += 1;
    if (figure.skills[pool] < 5) {
      figure.skills[pool] += 1;
      gained = true;
    }
  }

  figure.progression.appliedLevel = level;
  figure.progression.pendingChoices = Math.min(2, pending);
  if (pending > 0) figure.progression.choiceSinceTick = undefined;
  return gained;
}

/** Lazily give an old roster hero identity without changing their existing pool ratings. */
export function ensureHeroIdentity(figure: HistoricalFigure): void {
  figure.progression ??= {};
  if (!figure.archetype) figure.archetype = inferHeroArchetype(figure);
  if (!figure.disciplines?.length) figure.disciplines = [...HERO_ARCHETYPES[figure.archetype].disciplines];
  figure.progression.appliedLevel ??= figureLevel(figure.xp ?? 0);
  figure.progression.pendingChoices ??= 0;
}

export function heroAlignmentModifier(figure: HistoricalFigure): number {
  return Math.max(-1, Math.min(1, (figure.virtues?.length ?? 0) - (figure.vices?.length ?? 0)));
}

export function heroMissionFit(figure: HistoricalFigure, tags: readonly MissionTag[] = []): HeroMissionFit {
  const matchedDisciplines = matchingDisciplines(figure.disciplines, tags);
  return {
    matchedDisciplines,
    discipline: Math.min(2, matchedDisciplines.length),
    aspect: aspectBonus(figure, tags),
    alignment: heroAlignmentModifier(figure),
    total: disciplineBonus(figure.disciplines, tags) + aspectBonus(figure, tags)
  };
}

interface GuildTarget {
  kind: GuildMissionKind;
  cell: number;
  provinceId?: number;
  burgId?: number;
  markerId?: number;
  pool: "m" | "w" | "s" | "c";
  dc: number;
  rewardGold: number;
  rewardRenown: number;
  priority: number;
  level: number;
  tags: MissionTag[];
  /** excavate missions: success mints a named HistoricalRelic */
  wantsRelic?: boolean;
}

/** A petitionable crisis matched to one of its anchor's petition definitions */
interface PetitionTarget {
  def: PetitionDef;
  cell: number;
  provinceId?: number;
  burgId?: number;
  stateId?: number;
  context: PetitionContext;
}

export interface PartyPreviewMember {
  figureId: number;
  name: string;
  score: number;
  bestPhaseId: string;
}

export interface PartyPreview {
  party: number[];
  phases: MissionPhase[];
  members: PartyPreviewMember[];
}

/** Unified figure roll: 1d20 + pool skill + domain modifier + clamped traits + aspects + disciplines + guild + relic */
export function figureCheckRoll(
  rng: Rng,
  figure: HistoricalFigure,
  pool: "m" | "w" | "s" | "c",
  poolGen: number,
  dc: number,
  guildTierBonus = 0,
  relicBonus = 0,
  tags: readonly MissionTag[] = [],
  staminaSpent = 0,
  injuryPenaltyValue = 0,
  partyBonus = 0,
  suppressDiscipline = false
): FigureCheck {
  const roll = rng.d(20);
  const skill = figure.skills?.[pool] ?? 0;
  const fit = heroMissionFit(figure, tags);
  const total =
    roll +
    skill +
    valueModifier(poolGen) +
    fit.alignment +
    fit.aspect +
    (suppressDiscipline ? 0 : fit.discipline) +
    guildTierBonus +
    relicBonus +
    staminaSpent +
    partyBonus -
    injuryPenaltyValue;
  return {
    roll,
    total,
    dc,
    success: total >= dc,
    matchedDisciplines: fit.matchedDisciplines,
    aspect: fit.aspect,
    staminaSpent,
    injuryPenalty: injuryPenaltyValue,
    partyBonus
  };
}

/** Boolean form of the unified figure check */
export function figureCheck(
  rng: Rng,
  figure: HistoricalFigure,
  pool: "m" | "w" | "s" | "c",
  poolGen: number,
  dc: number,
  guildTierBonus = 0,
  relicBonus = 0,
  tags: readonly MissionTag[] = [],
  staminaSpent = 0,
  injuryPenaltyValue = 0,
  partyBonus = 0,
  suppressDiscipline = false
): boolean {
  return figureCheckRoll(
    rng,
    figure,
    pool,
    poolGen,
    dc,
    guildTierBonus,
    relicBonus,
    tags,
    staminaSpent,
    injuryPenaltyValue,
    partyBonus,
    suppressDiscipline
  ).success;
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

export function emptyCapacityLedger(): CapacityLedger {
  return {
    m: { gen: 0, load: 0 },
    w: { gen: 0, load: 0 },
    s: { gen: 0, load: 0 },
    c: { gen: 0, load: 0 }
  };
}

/** how much each remembered humiliation weighs on the casus belli ledger */
const GRUDGE_WEIGHTS: Record<GrudgeReason, number> = {
  conquest: 40,
  sacked: 30,
  slain_ruler: 35,
  slain_general: 35,
  repulsed: 20
};

export interface FigureBias {
  martial: number;
  civic: number;
  pious: number;
  cruel: number;
}

const MARTIAL_TRAITS = ["brave", "daring", "decisive", "wrathful", "vengeful", "boastful", "reckless"];
const CIVIC_TRAITS = ["just", "diligent", "temperate", "thrifty", "methodical", "prudent"];
const PIOUS_TRAITS = ["reverent", "zealous", "faithful", "tolerant", "merciful"];
const CRUEL_TRAITS = ["cruel", "greedy", "merciless", "callous", "domineering", "paranoid", "selfish", "bigoted"];

/** Weight a ruler's traits and their culture's values towards war, works, faith or cruelty. */
export function figureBias(
  figure: { alignment?: Alignment; virtues?: string[]; vices?: string[] },
  values: readonly string[] = []
): FigureBias {
  const words = new Set([...(figure.virtues ?? []), ...(figure.vices ?? [])]);
  const held = new Set(values);
  const bias: FigureBias = { martial: 0.1, civic: 0.1, pious: 0.1, cruel: 0 };

  const add = (key: keyof FigureBias, list: string[], cultural: string[]) => {
    for (const word of list) if (words.has(word)) bias[key] += 0.12;
    for (const value of cultural) if (held.has(value)) bias[key] += 0.1;
  };

  add("martial", MARTIAL_TRAITS, ["conflict", "power", "subjugation", "hatred"]);
  add("civic", CIVIC_TRAITS, ["investment", "advancement", "knowledge", "balance"]);
  add("pious", PIOUS_TRAITS, ["order", "honor", "loyalty", "truth"]);
  add("cruel", CRUEL_TRAITS, ["greed", "control", "subjugation"]);

  if (figure.alignment === "evil") {
    bias.martial += 0.15;
    bias.cruel += 0.15;
  } else if (figure.alignment === "chaotic") {
    bias.martial += 0.1;
  } else if (figure.alignment === "lawful") {
    bias.civic += 0.1;
  } else if (figure.alignment === "good") {
    bias.civic += 0.05;
    bias.pious += 0.05;
  }

  for (const key of ["martial", "civic", "pious", "cruel"] as const) {
    bias[key] = Math.min(0.8, Math.round(bias[key] * 100) / 100);
  }
  return bias;
}

/** Reconcile Conquest building IDs from FMG Burg feature flags (walls, plaza, temple, citadel) */
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

/** Push completed Conquest buildings back onto FMG Burg flags */
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

  const good = pack.goods?.[goodId];
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

  if (resource && pack.goods?.[resource.goodId]) {
    const yields = resourceYieldDelta(resource, pack.goods[resource.goodId], connected);
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
// Slice 6: religion pressure, belief effects, diplomacy timers & relic perks
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
/** Leased relic perks. */
export const REGALIA_HAPPINESS = 4;
export const IDOL_FAITH = 4;
export const IDOL_CULTURE = 2;
export const RELIC_YIELD_PERCENT = 15;
export const WEAPON_RELIC_COMBAT_PERCENT = 15;

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
    return history.living;
  }

  /** Return the active LivingWorldState, initializing it lazily if needed */
  getState(): LivingWorldState {
    return pack.history?.living ?? this.init();
  }

  /** Return the guild wallet, initializing it lazily for maps saved before the Guild existed */
  getGuild(): GuildState {
    const living = this.getState();
    if (!living.guild) living.guild = this.emptyGuild();

    const guild = living.guild;
    guild.tier ??= 1;
    guild.gold ??= 0;
    guild.renown ??= 0;
    guild.ageCount ??= 0;
    guild.sandboxGodMode ??= false;
    guild.doctrine ??= "auto_bounties";
    guild.chapterBurgIds ??= [];
    guild.roster ??= [];
    guild.candidates ??= [];
    guild.heroes ??= {};
    guild.missions ??= [];
    guild.relics ??= [];
    guild.cooldowns ??= {};
    guild.excavatedMarkers ??= [];
    guild.popups ??= [];

    if (guild.hqBurgId === undefined) guild.hqBurgId = this.pickGuildHq();
    if (guild.chapterBurgIds.length === 0 && guild.hqBurgId) guild.chapterBurgIds = [guild.hqBurgId];
    if (guild.favoredStateId === undefined) {
      guild.favoredStateId = pack.states?.find(state => state?.i && !state.removed)?.i;
    }

    for (const id of [...guild.roster, ...guild.candidates]) {
      const figure = this.findFigure(id);
      if (figure) this.ensureHeroGuildState(guild, figure);
    }

    const faction = this.getPlayerFaction();
    if (faction) {
      if (guild.gold > 0 && faction.treasury === 0) faction.treasury = guild.gold;
      else if (faction.treasury > 0) guild.gold = faction.treasury;

      if (guild.renown > 0 && faction.influence === 0) faction.influence = guild.renown;
      else if (faction.influence > 0) guild.renown = faction.influence;

      if (faction.memberIds?.length && !guild.roster.length) guild.roster = [...faction.memberIds];
      else if (guild.roster.length) faction.memberIds = [...guild.roster];

      if (faction.missions?.length) guild.missions = faction.missions;
      if (faction.relics?.length) guild.relics = faction.relics;
    }
    return guild;
  }

  /** Return the active player-controlled faction in pack.factions */
  getPlayerFaction(): Faction {
    const living = this.getState();
    pack.factions ??= [{ i: 0 } as Faction];
    let faction = living.playerFactionId ? pack.factions[living.playerFactionId] : undefined;
    if (!faction || faction.removed) {
      faction =
        pack.factions.find(f => f && f.i > 0 && !f.removed && f.type === "adventurer_guild") ||
        pack.factions.find(f => f && f.i > 0 && !f.removed);
      if (!faction) {
        faction = Factions.add({
          name: "The Adventurers' Fellowship",
          category: "adventuring",
          type: "adventurer_guild",
          allegiance: "autonomous",
          hq: { cell: 0, fortified: false, secrecy: 0, assets: ["chapter_lodge"] },
          treasury: 150
        });
      }
      living.playerFactionId = faction.i;
    }
    return faction;
  }

  /** Change the active player-controlled faction */
  setPlayerFaction(factionId: number): boolean {
    const faction = pack.factions?.[factionId];
    if (!faction || faction.removed) return false;
    const living = this.getState();
    living.playerFactionId = factionId;
    this.syncPlayerFaction(living);
    return true;
  }

  /** Synchronize the legacy GuildState with the active player faction */
  syncPlayerFaction(living: LivingWorldState): void {
    const faction = this.getPlayerFaction();
    if (!faction) return;
    const guild = living.guild;
    if (guild) {
      guild.gold = faction.treasury;
      guild.renown = faction.influence;
      guild.tier = Math.min(3, Math.max(1, faction.tier)) as 1 | 2 | 3;
      if (faction.doctrine) guild.doctrine = faction.doctrine;
      if (faction.memberIds) guild.roster = faction.memberIds;
      if (faction.candidateIds) guild.candidates = faction.candidateIds;
      if (faction.missions) guild.missions = faction.missions;
      if (faction.relics) guild.relics = faction.relics;
    }
  }

  /** On-map popups currently waiting to be claimed */
  getPopups(): LivingPopup[] {
    return this.getGuild().popups;
  }

  /** Active guild hero missions */
  getMissions(): ActiveGuildMission[] {
    return this.getGuild().missions;
  }

  /** Every discovered relic, whatever its current holder */
  getRelics(): HistoricalRelic[] {
    return this.getGuild().relics ?? [];
  }

  setDoctrine(doctrine: IdleDoctrine): void {
    this.getGuild().doctrine = doctrine;
  }

  setSandboxGodMode(enabled: boolean): void {
    this.getGuild().sandboxGodMode = enabled;
  }

  setFavoredState(stateId: number): void {
    const state = pack.states?.[stateId];
    if (!state?.i || state.removed) return;
    this.getGuild().favoredStateId = stateId;
  }

  /** Vitals, temperament, injuries and doctrine for one hero; lazily initialized. */
  getHeroState(figureId: number): HeroGuildState | undefined {
    const figure = this.findFigure(figureId);
    if (!figure) return undefined;
    return this.ensureHeroGuildState(this.getGuild(), figure);
  }

  setHeroDoctrine(figureId: number, doctrine: HeroDoctrine): boolean {
    const figure = this.findFigure(figureId);
    if (!figure) return false;
    const state = this.ensureHeroGuildState(this.getGuild(), figure);
    state.doctrine = doctrine;
    return true;
  }

  setHeroPush(figureId: number, enabled: boolean): boolean {
    const figure = this.findFigure(figureId);
    if (!figure) return false;
    const state = this.ensureHeroGuildState(this.getGuild(), figure);
    state.push = enabled;
    return true;
  }

  guildOperationCost(kind: GuildOperationKind): number {
    return GUILD_OPERATIONS[kind].cost;
  }

  /** The best idle roster hero allowed to lead this operation. */
  guildOperator(kind: GuildOperationKind): HistoricalFigure | undefined {
    const guild = this.getGuild();
    const def = GUILD_OPERATIONS[kind];
    return guild.roster
      .filter(id => this.isHeroIdle(guild, id))
      .map(id => this.findFigure(id))
      .filter((figure): figure is HistoricalFigure => Boolean(figure) && figure!.death === undefined)
      .filter(figure => def.archetypes.includes(figureArchetype(figure).id))
      .sort((a, b) => this.operatorScore(b, def.check?.pool) - this.operatorScore(a, def.check?.pool) || a.i - b.i)[0];
  }

  private operatorScore(figure: HistoricalFigure, pool: "m" | "w" | "s" | "c" | "best_sc" | undefined): number {
    const skills = figure.skills ?? { m: 0, w: 0, s: 0, c: 0 };
    if (pool === "best_sc") return Math.max(skills.s, skills.c);
    if (pool) return skills[pool];
    return skills.m + skills.w + skills.s + skills.c;
  }

  private checkPool(figure: HistoricalFigure, pool: "m" | "w" | "s" | "c" | "best_sc"): "m" | "w" | "s" | "c" {
    if (pool !== "best_sc") return pool;
    const skills = figure.skills ?? { m: 0, w: 0, s: 0, c: 0 };
    return skills.c >= skills.s ? "c" : "s";
  }

  private chargeOperation(
    living: LivingWorldState,
    guild: GuildState,
    operator: HistoricalFigure,
    kind: GuildOperationKind
  ): boolean {
    const def = GUILD_OPERATIONS[kind];
    if (guild.gold < def.cost) return false;
    guild.gold -= def.cost;
    guild.cooldowns[operator.i] = living.tick + 1;
    return true;
  }

  /** Paid mediation: clear burg unrest and lift the province's order. */
  guildPacifyMediate(burgId: number): boolean {
    const living = this.getState();
    const guild = this.getGuild();
    const kind: GuildOperationKind = "pacify_mediate";
    const operator = this.guildOperator(kind);
    if (!operator || guild.gold < this.guildOperationCost(kind)) return false;
    if (!this.pacifyBurg(burgId)) return false;
    if (!this.chargeOperation(living, guild, operator, kind)) return false;

    const burg = pack.burgs[burgId];
    const provinceId = burg ? pack.cells.province?.[burg.cell] : undefined;
    const pSim = provinceId !== undefined ? living.provinces[provinceId] : undefined;
    if (pSim) pSim.order = Math.min(100, pSim.order + 10);
    this.pushNews(living, {
      kind: "pacify",
      text: `${operator.name} mediated ${burg?.name ?? "the burg"} back to order (+10 province order).`,
      cell: burg?.cell,
      burgId,
      stateId: provinceId !== undefined ? pack.provinces?.[provinceId]?.state : undefined
    });
    return true;
  }

  /** Paid charter: complete the burg's current construction immediately. */
  guildRushAssetCharter(burgId: number): boolean {
    const living = this.getState();
    const guild = this.getGuild();
    const kind: GuildOperationKind = "rush_charter";
    const operator = this.guildOperator(kind);
    if (!operator || guild.gold < this.guildOperationCost(kind)) return false;
    if (!this.completeAsset(burgId)) return false;
    if (!this.chargeOperation(living, guild, operator, kind)) return false;

    this.pushNews(living, {
      kind: "build",
      text: `${operator.name} chartered the works at ${pack.burgs[burgId]?.name ?? "the burg"}.`,
      cell: pack.burgs[burgId]?.cell,
      burgId
    });
    return true;
  }

  /** Paid sedition: spark a revolt or promote a state-capable trouble. */
  guildInciteUprising(burgId: number): boolean {
    const living = this.getState();
    const guild = this.getGuild();
    const kind: GuildOperationKind = "incite_uprising";
    const operator = this.guildOperator(kind);
    if (!operator || guild.gold < this.guildOperationCost(kind)) return false;

    const burg = pack.burgs[burgId];
    if (!burg?.i || burg.removed || !burg.state) return false;
    const provinceId = pack.cells.province?.[burg.cell];
    const trouble = provinceId !== undefined ? living.provinces[provinceId]?.trouble : undefined;
    const coup =
      trouble && provinceId !== undefined && isTroubleStatePromotable(trouble.id)
        ? this.promoteTroubleToState(provinceId, burgId) !== null
        : false;
    const ok = coup || this.sparkRebellion(burg.state, burgId);
    if (!ok) return false;
    if (!this.chargeOperation(living, guild, operator, kind)) return false;

    this.pushNews(living, {
      kind: "revolt",
      text: `${operator.name} incited ${burg.name ?? "the burg"} against ${pack.states[burg.state]?.name ?? "its ruler"}.`,
      cell: burg.cell,
      burgId,
      stateId: burg.state
    });
    return true;
  }

  /** Paid assassination: a Shadow's C check to slay a ruler and force succession. */
  guildAssassinateRuler(stateId: number): boolean {
    const living = this.getState();
    const guild = this.getGuild();
    const kind: GuildOperationKind = "assassinate_ruler";
    const def = GUILD_OPERATIONS[kind];
    const operator = this.guildOperator(kind);
    const state = pack.states[stateId];
    const sSim = living.states[stateId];
    if (!operator || guild.gold < def.cost || !state?.i || state.removed || !sSim) return false;
    if (sSim.rulerId === undefined || this.findFigure(sSim.rulerId)?.death !== undefined) return false;
    if (!this.chargeOperation(living, guild, operator, kind)) return false;

    const poolGen = sSim.capacity.c.gen;
    const rng = this.rng("guild:operation", stateId * 1000 + operator.i);
    const check = figureCheckRoll(
      rng,
      operator,
      def.check!.pool as "c",
      poolGen,
      def.check!.dc,
      guildCheckBonus(guild.tier),
      equippedRelic(guild.relics ?? [], operator.i)?.bonuses.c ?? 0,
      def.check!.tags
    );
    if (!check.success || !this.smiteRuler(stateId)) {
      guild.cooldowns[operator.i] = living.tick + 2;
      this.pushNews(living, {
        kind: "succession",
        text: `${operator.name}'s attempt on ${state.name}'s ruler failed (rolled ${check.total} vs DC ${def.check!.dc}).`,
        cell: state.center,
        stateId
      });
      return false;
    }

    this.pushNews(living, {
      kind: "succession",
      text: `${operator.name} slew the ruler of ${state.name}; succession follows.`,
      cell: state.center,
      stateId
    });
    return true;
  }

  /** Paid diplomacy: broker peace with a current enemy, or provoke a border war. */
  guildBrokerWar(stateId: number, otherId?: number): boolean {
    const living = this.getState();
    const guild = this.getGuild();
    const kind: GuildOperationKind = "war_broker";
    const def = GUILD_OPERATIONS[kind];
    const operator = this.guildOperator(kind);
    const state = pack.states[stateId];
    if (!operator || guild.gold < def.cost || !state?.i || state.removed) return false;
    if (!this.chargeOperation(living, guild, operator, kind)) return false;

    const enemyId =
      otherId !== undefined && this.isAtWar(stateId, otherId)
        ? otherId
        : state.diplomacy?.findIndex((relation, index) => relation === "Enemy" && index !== stateId);
    const pool = this.checkPool(operator, def.check!.pool);
    const poolGen = living.states[stateId]?.capacity[pool]?.gen ?? 0;
    const rng = this.rng("guild:operation", stateId * 1000 + operator.i);
    const check = figureCheckRoll(
      rng,
      operator,
      pool,
      poolGen,
      def.check!.dc,
      guildCheckBonus(guild.tier),
      equippedRelic(guild.relics ?? [], operator.i)?.bonuses[pool] ?? 0,
      def.check!.tags
    );

    if (!check.success) {
      guild.cooldowns[operator.i] = living.tick + 2;
      this.pushNews(living, {
        kind: "war",
        text: `${operator.name}'s brokerage in ${state.name} failed (rolled ${check.total} vs DC ${def.check!.dc}).`,
        cell: state.center,
        stateId
      });
      return false;
    }

    if (typeof enemyId === "number" && enemyId > 0) {
      const enemy = pack.states[enemyId];
      if (!enemy?.i || enemy.removed || !this.isAtWar(stateId, enemyId)) {
        if (!this.forceWar(stateId, otherId)) return false;
        return true;
      }
      state.diplomacy ??= [];
      enemy.diplomacy ??= [];
      state.diplomacy[enemyId] = "Neutral";
      enemy.diplomacy[stateId] = "Neutral";
      const sSim = living.states[stateId];
      const eSim = living.states[enemyId];
      if (sSim) sSim.warExhaustion = Math.max(0, sSim.warExhaustion - 20);
      if (eSim) eSim.warExhaustion = Math.max(0, eSim.warExhaustion - 20);
      const text = `${operator.name} brokered a truce between ${state.name} and ${enemy.name}.`;
      this.pushNews(living, {
        kind: "war",
        text,
        cell: enemy.center,
        stateId,
        burgId: enemy.capital
      });
      this.pushHistory(
        "war",
        [
          { kind: "state", id: stateId },
          { kind: "state", id: enemyId }
        ],
        enemy.center,
        text
      );
      return true;
    }

    if (!this.forceWar(stateId, otherId)) return false;
    this.pushNews(living, {
      kind: "war",
      text: `${operator.name} brokered ${state.name} into a border war.`,
      cell: state.center,
      stateId
    });
    return true;
  }

  /** Spend one pending level 3/6 choice on a path from the hero's archetype. */
  chooseHeroPath(figureId: number, pathId: string): boolean {
    const figure = this.findFigure(figureId);
    if (!figure || figure.death !== undefined) return false;
    ensureHeroIdentity(figure);

    const progression = figure.progression!;
    if ((progression.pendingChoices ?? 0) <= 0) return false;

    const level = pendingPathLevel(figure);
    const found = findHeroPath(figure.archetype!, pathId);
    if (!found || found.choice.level !== level) return false;

    const path = found.path;
    figure.skills ??= { m: 0, w: 0, s: 0, c: 0 };
    if (path.pool) figure.skills[path.pool] = Math.min(5, figure.skills[path.pool] + 1);
    if (path.discipline && !figure.disciplines?.includes(path.discipline)) {
      figure.disciplines ??= [];
      figure.disciplines.push(path.discipline);
    }

    progression.picks ??= [];
    progression.picks.push(path.id);
    progression.pendingChoices = Math.max(0, (progression.pendingChoices ?? 0) - 1);
    progression.choiceSinceTick = undefined;

    const guild = this.getGuild();
    const state = this.ensureHeroGuildState(guild, figure);
    if (path.temperament) {
      for (const key of Object.keys(path.temperament) as (keyof typeof path.temperament)[]) {
        const nudge = path.temperament[key] ?? 0;
        state.temperament[key] = Math.max(0, Math.min(1, state.temperament[key] + nudge));
      }
    }
    this.ensureHeroGuildState(guild, figure);
    return true;
  }

  /** Gold cost to recruit a hero: base by guild tier plus a premium for starting level. */
  recruitCost(figureId?: number): number {
    const guild = this.getGuild();
    const base = 40 + guild.tier * 20;
    if (figureId === undefined) return base;
    const figure = this.findFigure(figureId);
    return base + Math.max(0, figureLevel(figure?.xp ?? 0) - 1) * 15;
  }

  /** Recruit a tavern candidate into the hero roster. */
  recruitCandidate(figureId: number): boolean {
    const living = this.getState();
    const guild = this.getGuild();
    if (!guild.candidates.includes(figureId)) return false;
    if (guild.roster.length >= maxHeroesForTier(guild.tier)) return false;

    const cost = this.recruitCost(figureId);
    if (guild.gold < cost) return false;

    const figure = this.findFigure(figureId);
    if (!figure || figure.death !== undefined) return false;
    this.ensureHeroGuildState(guild, figure);

    guild.gold -= cost;
    guild.candidates = guild.candidates.filter(id => id !== figureId);
    guild.roster.push(figureId);
    figure.cell ??= guild.hqBurgId ? pack.burgs[guild.hqBurgId]?.cell : undefined;

    this.pushNews(living, {
      kind: "muster",
      text: `${figure.name} joined the Guild for ${cost} gold.`,
      cell: figure.cell,
      burgId: guild.hqBurgId
    });
    return true;
  }

  /** Click-dispatch: pin a leader and auto-fill companions for the province target. */
  dispatchHero(figureId: number, provinceId: number): boolean {
    return this.dispatchParty(figureId, provinceId);
  }

  /** Manually pin a leader for a province mission; companions are auto-filled. */
  dispatchParty(figureId: number, provinceId: number): boolean {
    const living = this.getState();
    const guild = this.getGuild();
    if (!guild.roster.includes(figureId) || !this.isHeroIdle(guild, figureId)) return false;

    const figure = this.findFigure(figureId);
    const target = this.provinceTarget(living, guild, provinceId);
    if (!figure || figure.death !== undefined || !target) return false;

    const party = this.autoFillParty(living, guild, target, figureId);
    if (party.length === 0) return false;
    this.createMission(living, guild, party[0]!, target, party);
    return true;
  }

  /** Recommended party and phase fits for the province dispatch card. */
  getPartyPreview(provinceId: number, leaderId?: number): PartyPreview | null {
    const living = this.getState();
    const guild = this.getGuild();
    const target = this.provinceTarget(living, guild, provinceId);
    return target ? this.partyPreview(living, guild, target, leaderId) : null;
  }

  /** Recommended party and phase fits for an excavation site. */
  getPartyPreviewForMarker(markerId: number, leaderId?: number): PartyPreview | null {
    const living = this.getState();
    const guild = this.getGuild();
    const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
    const target = marker ? this.excavationTarget(guild, marker) : null;
    return target ? this.partyPreview(living, guild, target, leaderId) : null;
  }

  /** Send the best auto-filled party to a province (used by the HUD guild operations). */
  dispatchBestHero(provinceId: number): boolean {
    const living = this.getState();
    const guild = this.getGuild();
    const target = this.provinceTarget(living, guild, provinceId);
    if (!target) return false;

    const best = this.bestPartyForTarget(living, guild, target);
    if (!best) return false;

    this.createMission(living, guild, best[0]!, target, best);
    return true;
  }

  /** Click-dispatch: pin a leader and auto-fill companions for an excavation. */
  dispatchHeroToMarker(figureId: number, markerId: number): boolean {
    return this.dispatchPartyToMarker(figureId, markerId);
  }

  /** Manually pin a leader for an excavation; companions are auto-filled. */
  dispatchPartyToMarker(figureId: number, markerId: number): boolean {
    const living = this.getState();
    const guild = this.getGuild();
    if (!guild.roster.includes(figureId) || !this.isHeroIdle(guild, figureId)) return false;

    const figure = this.findFigure(figureId);
    if (!figure || figure.death !== undefined) return false;

    const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
    const target = marker ? this.excavationTarget(guild, marker) : null;
    if (!target) return false;

    const party = this.autoFillParty(living, guild, target, figureId);
    if (party.length === 0) return false;
    this.createMission(living, guild, party[0]!, target, party);
    return true;
  }

  /** Send the best auto-filled party to excavate a landmark. */
  dispatchBestHeroToMarker(markerId: number): boolean {
    const living = this.getState();
    const guild = this.getGuild();
    const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
    const target = marker ? this.excavationTarget(guild, marker) : null;
    if (!target) return false;

    const best = this.bestPartyForTarget(living, guild, target);
    if (!best) return false;

    this.createMission(living, guild, best[0]!, target, best);
    return true;
  }

  /** Place a vault relic in a hero's hands (one relic per hero). */
  equipRelic(relicId: number, figureId: number): boolean {
    const guild = this.getGuild();
    if (!guild.roster.includes(figureId)) return false;
    if (this.findFigure(figureId)?.death !== undefined) return false;

    const relic = guild.relics?.find(entry => entry.id === relicId);
    if (!relic) return false;

    const previous = (guild.relics ?? []).find(
      held => held.holder.kind === "figure" && held.holder.id === figureId && held.id !== relicId
    );
    relic.holder = { kind: "figure", id: figureId };
    if (previous) this.placeRelic(previous, guild);
    return true;
  }

  /** Enshrine a relic in the Guild Vault, up to one relic per guild tier. */
  enshrineRelic(relicId: number): boolean {
    const guild = this.getGuild();
    const relic = guild.relics?.find(entry => entry.id === relicId);
    if (!relic) return false;
    if (relic.holder.kind === "vault") return true;
    if (!vaultHasRoom(guild)) return false;

    relic.holder = { kind: "vault" };
    return true;
  }

  /** Lease a vault relic to a sovereign state: +gen, -1 unravel/season, tribute gold. */
  leaseRelic(relicId: number, stateId: number): boolean {
    const state = pack.states?.[stateId];
    if (!state?.i || state.removed) return false;

    const guild = this.getGuild();
    const relic = guild.relics?.find(entry => entry.id === relicId);
    if (relic?.holder.kind !== "vault") return false;

    relic.holder = { kind: "state", id: stateId };
    const sSim = this.getState().states[stateId];
    if (sSim) sSim.capacity = this.recomputeStateCapacity(stateId);
    return true;
  }

  /** Return a relic from any holder to the Guild Vault, or the reserve when it is full. */
  recallRelic(relicId: number): boolean {
    const guild = this.getGuild();
    const relic = guild.relics?.find(entry => entry.id === relicId);
    if (!relic || relic.holder.kind === "vault" || relic.holder.kind === "ruin") return false;

    const previous = relic.holder;
    relic.holder = vaultHasRoom(guild) ? { kind: "vault" } : { kind: "reserve" };
    if (previous.kind === "state") {
      const sSim = this.getState().states[previous.id];
      if (sSim) sSim.capacity = this.recomputeStateCapacity(previous.id);
    }
    return true;
  }

  /** Sandbox god action: excavate a site immediately, minting its seeded relic. */
  excavateMarker(markerId: number): boolean {
    const living = this.getState();
    const guild = this.getGuild();
    const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
    if (!marker || !isExcavationMarker(marker) || guild.excavatedMarkers.includes(markerId)) return false;

    guild.excavatedMarkers.push(markerId);
    this.recoverRelicsFromMarker(guild, marker.i);

    if (marker.chronicle || this.rng("guild:excavate", marker.i).chance(0.5)) {
      const relic = this.mintRelicFromMarker(marker, marker.i * 7919 + living.tick);
      this.pushNews(living, {
        kind: "develop",
        text: `The Guild excavated ${marker.name} and recovered ${relic.name}.`,
        cell: marker.cell
      });
    }
    return true;
  }

  /** The Wheel of Ages: bake the epoch, retire fallen empires, and open the next era. */
  turnAge(): { era: string; year: number; realms: number; successorStates: number } {
    const living = this.init();
    const history = Chronicle.sync();
    const guild = this.getGuild();
    const yearBefore = options.map?.lore?.calendar?.year ?? 1000;

    // 1. bake the completed age so Legends can scrub back through it
    this.bakeEpoch(living, yearBefore);

    // 2. overextended empires fall, their capitals seeding chronicle relic ruins
    const realms = this.retireFallenEmpires(living, yearBefore);

    // 3. the calendar leaps forward and the political map is reshaped
    const year = yearBefore + WHEEL_YEAR_LEAP;
    options.map.lore.calendar.year = year;
    const eraName = this.nextEraName(guild.ageCount);
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

    // 4. prestige carryover: heroes pass into legend, veteran bloodlines spawn scions
    guild.ageCount += 1;
    guild.legacyTier = (guild.legacyTier ?? 0) + 1;
    const nextRoster: number[] = [];
    for (const id of guild.roster) {
      const hero = this.findFigure(id);
      if (!hero || hero.death !== undefined) continue;
      hero.death = year;
      for (const role of hero.roles) {
        if (role.to === undefined) role.to = year;
      }
      for (const held of guild.relics ?? []) {
        if (held.holder.kind === "figure" && held.holder.id === id) this.placeRelic(held, guild);
      }
      if (figureLevel(hero.xp ?? 0) < 3 || nextRoster.length >= maxHeroesForTier(guild.tier)) continue;
      nextRoster.push(this.spawnScion(living, hero, guild.legacyTier).i);
    }
    guild.roster = nextRoster;
    guild.candidates = [];

    living.eschaton = 0;

    const text = `${eraName} dawns in ${year}: ${realms.length} ${
      realms.length === 1 ? "realm" : "realms"
    } fell and ${shattered} provinces broke away as the Wheel turned.`;
    this.pushNews(living, {
      kind: "muster",
      text,
      cell: guild.hqBurgId !== undefined ? pack.burgs[guild.hqBurgId]?.cell : undefined
    });
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

    // a chronicle ruin at the fallen capital, hiding a realm-named relic (a +2-tier find)
    const capital = state.capital ? pack.burgs[state.capital] : undefined;
    const cell = capital?.cell ?? state.center ?? 0;
    const markerId = this.addRuinMarker(cell, `Ruins of ${state.name}`);
    const marker = (pack.markers ?? [])[markerId]!;
    const relic = this.mintRelicFromMarker(marker, year * 1000 + state.i);
    relic.holder = { kind: "ruin", markerId, cell };

    // relics the fallen state leased from the Guild are buried in the same ruin
    for (const held of this.getGuild().relics ?? []) {
      if (held.holder.kind === "state" && held.holder.id === state.i) {
        held.holder = { kind: "ruin", markerId, cell };
      }
    }

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

  /** A founder's scion: carries the bloodline and its legacy skill into the new era. */
  private spawnScion(living: LivingWorldState, ancestor: HistoricalFigure, legacyTier: number): HistoricalFigure {
    const history = Chronicle.sync();
    history.figures ??= [];
    const figures = history.figures;
    const index = figures.length;
    const year = options.map?.lore?.calendar?.year ?? 1000;
    const rng = createRng(`${living.seed}:guild:scion:${index + ancestor.i * 1000}`);
    const culture = ancestor.culture;
    const alignment = rollAlignment(rng, pack.cultures?.[culture]?.alignment);
    const traits = rollFigureTraits(rng, alignment);
    const signatureVirtue = ancestor.virtues?.[0];
    const virtues =
      signatureVirtue && !traits.virtues.includes(signatureVirtue)
        ? [signatureVirtue, ...traits.virtues]
        : traits.virtues;

    const skills = {
      m: ancestor.skills?.m ?? 0,
      w: ancestor.skills?.w ?? 0,
      s: ancestor.skills?.s ?? 0,
      c: ancestor.skills?.c ?? 0
    };
    const pools = ["m", "w", "s", "c"] as const;
    const best = pools.reduce((chosen, pool) => (skills[pool] > skills[chosen] ? pool : chosen), pools[0]!);
    skills[best] = Math.min(5, skills[best] + 1 + legacyTier);
    const guild = this.getGuild();

    const scion: HistoricalFigure = {
      i: index,
      name: Names.getCulture(culture),
      culture,
      birth: year - rng.int(18, 24),
      roles: [{ type: "adventurer", target: { kind: "culture", id: culture }, from: year }],
      alignment,
      virtues,
      vices: traits.vices,
      cell: guild.hqBurgId !== undefined ? pack.burgs[guild.hqBurgId]?.cell : undefined,
      xp: 0,
      skills,
      archetype: figureArchetype(ancestor).id,
      disciplines: [...figureDisciplines(ancestor)],
      progression: { appliedLevel: 1, pendingChoices: 0, picks: [] }
    };
    figures.push(scion);
    return scion;
  }

  /** Poetic name for the era that dawns after the given number of wheel turns. */
  private nextEraName(ageCount: number): string {
    const rng = createRng(`${this.getState().seed}:turnAge:${ageCount}`);
    const epithet = ERA_EPITHETS[rng.int(0, ERA_EPITHETS.length - 1)]!;
    const ordinal = ERA_ORDINALS[Math.min(ageCount, ERA_ORDINALS.length - 1)] ?? `${ageCount + 1}th`;
    return rng.chance(0.5) ? `The ${ordinal} Age of ${epithet}` : `The Era of ${epithet}`;
  }

  /** Retire a veteran hero and mint a protege carrying one skill point forward. */
  retireHero(figureId: number): number | null {
    const living = this.getState();
    const guild = this.getGuild();
    const figure = this.findFigure(figureId);
    if (!figure || figure.death !== undefined || !guild.roster.includes(figureId)) return null;

    const year = options.map?.lore?.calendar?.year ?? 1000;
    if (year - figure.birth < HERO_RETIREMENT_AGE) return null;

    guild.roster = guild.roster.filter(id => id !== figureId);
    guild.missions = guild.missions.filter(mission => mission.figureId !== figureId);
    for (const role of figure.roles) {
      if (role.to === undefined) role.to = year;
    }

    const protege = this.spawnProtege(living, figure);
    if (protege && guild.roster.length < maxHeroesForTier(guild.tier)) guild.roster.push(protege.i);

    this.pushNews(living, {
      kind: "succession",
      text: `${figure.name} retired from the Guild and passed the torch to ${protege?.name ?? "a new protege"}.`,
      cell: figure.cell
    });
    return protege?.i ?? null;
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
      this.expirePopups(living);

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
      this.stepReligion(living);
      this.stepTactical(living);
      this.stepBurgUnrest(living);
      this.stepProvinces(living);
      this.stepFactions(living);
      this.stepStates(living);
      this.stepDiplomacy(living);
      this.stepRebellions(living);
      this.recomputeAllCapacities(living);
      this.stepRelics(living);
      this.stepEschaton(living);
      this.refreshPopups(living);
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
    living.activeLairs ??= {};
    living.activeTroubles ??= {};
    this.syncBurgs(living);
    this.syncProvinces(living);
    this.syncStates(living);
    this.syncArmies(living);
    this.syncDangerMarkers(living);
    this.ensureCommanders();
    this.recomputeAllCapacities(living);
  }

  /** Synchronize active lairs with all danger markers on the map */
  syncDangerMarkers(living: LivingWorldState): void {
    living.activeLairs ??= {};
    living.activeTroubles ??= {};

    const activeMarkerIds = new Set<number>();

    for (const marker of pack.markers ?? []) {
      if (marker.hidden || !isDangerMarker(marker)) {
        if (marker.threatId && living.activeLairs[marker.threatId]) {
          delete living.activeLairs[marker.threatId];
          delete marker.threatId;
        }
        continue;
      }

      activeMarkerIds.add(marker.i);
      const key = `lair:${marker.i}`;
      marker.threatId = key;

      let lair = living.activeLairs[key];
      if (!lair) {
        lair = createLairFromMarker(marker, Military.getUnitTypes());
        living.activeLairs[key] = lair;
      } else {
        lair.markerId = marker.i;
        lair.name = marker.name;
        lair.cell = marker.cell;
        lair.provinceId = pack.cells?.province?.[marker.cell] ?? 0;
      }

      if (lair.provinceId && living.provinces[lair.provinceId]) {
        const pSim = living.provinces[lair.provinceId]!;
        if (!pSim.lair || pSim.lair.level < lair.level) {
          pSim.lair = lair;
        }
      }
    }

    for (const [key, lair] of Object.entries(living.activeLairs)) {
      if (lair.markerId !== undefined && !activeMarkerIds.has(lair.markerId)) {
        delete living.activeLairs[key];
        if (lair.provinceId && living.provinces[lair.provinceId]?.lair?.markerId === lair.markerId) {
          living.provinces[lair.provinceId]!.lair = null;
        }
      }
    }
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

  /** Recompute a single state's M / W / S / C capacity pools from live pack holdings, buildings, and regiments */
  recomputeStateCapacity(stateId: number): CapacityLedger {
    const ledger = emptyCapacityLedger();
    const state = pack.states[stateId];
    if (!state?.i || state.removed) return ledger;

    const living = pack.history?.living;
    const sSim = living?.states?.[stateId];
    const { content, config } = currentContent();
    const capacityConfig = config.capacity;
    const buildingById = new Map<string, BuildingDef>(content.buildings.map(b => [b.id, b]));
    const unitTypes: Record<string, UnitType> = Military.getUnitTypes();

    // 1. Group owned cells and population by province (or state fallback if no provinces)
    const provincePop = new Map<number, number>();
    const cellCount = pack.cells.i.length;

    for (let c = 0; c < cellCount; c++) {
      if (pack.cells.state[c] !== stateId) continue;
      const provId = pack.cells.province?.[c] || -stateId;
      const pop = pack.cells.pop?.[c] ?? 0;
      provincePop.set(provId, (provincePop.get(provId) ?? 0) + pop);
    }

    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.state !== stateId) continue;
      const provId = pack.cells.province?.[burg.cell] || -stateId;
      const pop = burg.population ?? 0;
      provincePop.set(provId, (provincePop.get(provId) ?? 0) + pop);
    }

    // Every held province/region grants +1 M levy base and +regionTier W & S
    provincePop.forEach(popThousands => {
      ledger.m.gen += 1;
      const rTier = regionTierFromPop(popThousands);
      ledger.w.gen += rTier;
      ledger.s.gen += rTier;
    });

    // Earned province development adds +1 W and +1 S per point; a running
    // development commits `developWPerTurn` Wealth until it completes.
    for (const provId of provincePop.keys()) {
      if (provId <= 0) continue;
      const pSim = living?.provinces?.[provId];
      if (!pSim) continue;
      if (pSim.development > 0) {
        ledger.w.gen += pSim.development;
        ledger.s.gen += pSim.development;
      }
      if (pSim.developmentProgress) ledger.w.load += capacityConfig.developWPerTurn;
      if (pSim.trouble) {
        const troubleLoad = Math.ceil(pSim.trouble.level / 2);
        ledger.m.load += troubleLoad;
        ledger.w.load += troubleLoad;
        ledger.s.load += troubleLoad;
      }
      if (pSim.lair) {
        const lairLoad = Math.ceil(pSim.lair.level / 2);
        ledger.m.load += lairLoad;
        ledger.w.load += lairLoad;
        ledger.s.load += lairLoad;
      }
    }

    // Capital court grants +2 C
    if (state.capital && pack.burgs[state.capital]?.state === stateId) {
      ledger.c.gen += 2;
    }

    // Active adventurer contract commits +1 Wealth load
    if (sSim?.agenda?.kind === "hire_adventurers") {
      ledger.w.load += 1;
    }

    // 2. Burgs: earned development, standing buildings, and occupation unrest
    let freeGarrisonWaiver = 0;
    for (const burg of pack.burgs) {
      if (!burg?.i || burg.removed || burg.state !== stateId) continue;
      const bSim = living?.burgs[burg.i];
      if (!bSim) continue;

      // A running construction commits Wealth until it completes.
      if (bSim.construction) ledger.w.load += capacityConfig.constructionWPerTurn;

      // Occupation unrest drains -1 S and suppresses earned W bonus while unrest > 4
      if (bSim.unrest > 0) {
        ledger.s.load += 1;
      }
      if (bSim.development > 0) {
        if (bSim.unrest <= 4) ledger.w.gen += bSim.development;
        ledger.s.gen += bSim.development;
      }

      for (const bid of bSim.civBuildings ?? []) {
        const cap = civBuildingCapacity(bid);
        ledger.m.gen += cap.m;
        if (bSim.unrest <= 4) ledger.w.gen += cap.w;
        ledger.s.gen += cap.s;
        ledger.c.gen += cap.c;
        if (bid === "barracks" || bid === "armory" || bid === "castle" || bid === "arsenal") {
          freeGarrisonWaiver += 1;
        } else if (bid === "military_base") {
          freeGarrisonWaiver += 2;
        }
      }

      for (const bid of bSim.buildings ?? []) {
        const bDef = buildingById.get(bid);
        if (!bDef) continue;
        const gen = bDef.effects.capacity;
        if (gen) {
          ledger.m.gen += gen.m ?? 0;
          if (bSim.unrest <= 4) ledger.w.gen += gen.w ?? 0;
          ledger.s.gen += gen.s ?? 0;
          ledger.c.gen += gen.c ?? 0;
        }
        const up = bDef.effects.upkeep;
        if (up) {
          ledger.m.load += up.m ?? 0;
          ledger.w.load += up.w ?? 0;
          ledger.s.load += up.s ?? 0;
          ledger.c.load += up.c ?? 0;
        }
        if (bDef.effects.freeGarrisonUnits) {
          freeGarrisonWaiver += bDef.effects.freeGarrisonUnits;
        }
      }
    }

    // 3. Regiments: load capacity per unit block, waiving up to `freeGarrisonWaiver` units
    let waivedUnits = 0;
    for (const reg of state.military ?? []) {
      if (!reg.units || reg.units.length === 0) {
        reconcileRegimentBlocks(reg, unitTypes);
      }
      for (const unit of reg.units ?? []) {
        if (unit.hp <= 0) continue;
        if (waivedUnits < freeGarrisonWaiver) {
          waivedUnits += 1;
          continue;
        }
        const uType = unitTypes[unit.type];
        const cost = uType?.capacityCost;
        if (!cost) continue;
        const blocks = unit.hp * (uType.quantity / MEN_PER_BLOCK);
        ledger.m.load += (cost.m ?? 0) * blocks;
        ledger.w.load += (cost.w ?? 0) * blocks;
        ledger.s.load += (cost.s ?? 0) * blocks;
        ledger.c.load += (cost.c ?? 0) * blocks;
      }
    }

    // 4. Relics leased to this state add straight to generation
    for (const relic of living?.guild?.relics ?? []) {
      if (relic.holder.kind !== "state" || relic.holder.id !== stateId) continue;
      ledger.m.gen += relic.bonuses.m ?? 0;
      ledger.w.gen += relic.bonuses.w ?? 0;
      ledger.s.gen += relic.bonuses.s ?? 0;
      ledger.c.gen += relic.bonuses.c ?? 0;
    }

    // Round to 2 decimal places for clean display and deterministic comparisons
    for (const pool of ["m", "w", "s", "c"] as const) {
      ledger[pool].gen = Math.round(ledger[pool].gen * 100) / 100;
      ledger[pool].load = Math.round(ledger[pool].load * 100) / 100;
    }

    return ledger;
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

  /** Claim an on-map popup before it expires, banking its bonus Gold and Renown. */
  claimPopup(id: number): LivingPopup | null {
    const living = this.getState();
    const guild = this.getGuild();
    const index = guild.popups.findIndex(popup => popup.id === id);
    if (index === -1) return null;

    const [popup] = guild.popups.splice(index, 1);
    if (!popup || popup.expiresAtTick <= living.tick) return null;
    // petitions are decided, never claimed; put it back for resolvePetition
    if (popup.kind === "guild_petition") {
      guild.popups.push(popup);
      return null;
    }

    guild.gold += popup.rewardGold;
    guild.renown += popup.rewardRenown;
    this.syncGuildTier(living, guild);
    this.pushNews(living, {
      kind: popup.kind === "bounty_trouble" ? "trouble" : popup.kind === "bounty_lair" ? "lair" : "succession",
      text: `Guild bounty claimed: ${popup.title} (+${popup.rewardGold}g, +${popup.rewardRenown} renown).`,
      cell: popup.cell,
      stateId: popup.stateId
    });
    return popup;
  }

  /** Drop popups whose countdown ran out. They auto-resolve without a reward. */
  private expirePopups(living: LivingWorldState): void {
    const guild = living.guild;
    if (!guild?.popups?.length) return;
    guild.popups = guild.popups.filter(popup => popup.expiresAtTick > living.tick);
  }

  /** Inspect the live world after a tick and queue urgent-bounty popups (deduplicated, capped). */
  private refreshPopups(living: LivingWorldState): void {
    const guild = this.getGuild();
    const candidates: Array<Omit<LivingPopup, "id" | "createdTick" | "expiresAtTick"> & { priority: number }> = [];

    for (const province of pack.provinces ?? []) {
      if (!province?.i || province.removed) continue;
      const pSim = living.provinces?.[province.i];
      if (!pSim) continue;

      const trouble = pSim.trouble;
      const lair = pSim.lair;
      const cell = trouble?.cell ?? lair?.cell ?? province.center ?? 0;
      const stateId = province.state;

      if (trouble && trouble.level >= 4) {
        candidates.push({
          kind: "bounty_trouble",
          cell,
          title: `${trouble.name} in ${province.name ?? "the province"}`,
          subtitle: `Level ${trouble.level} ${trouble.theme} trouble`,
          provinceId: province.i,
          stateId,
          rewardGold: 12 + trouble.level * 4,
          rewardRenown: 3,
          priority: trouble.level
        });
      }

      if (lair?.raidPending) {
        candidates.push({
          kind: "bounty_lair",
          cell,
          title: `${lair.name} prepares a raid`,
          subtitle: `Level ${lair.level} lair in ${province.name ?? "the province"}`,
          provinceId: province.i,
          stateId,
          rewardGold: 20 + lair.level * 5,
          rewardRenown: 8,
          priority: lair.level + 10
        });
      }

      const troubleImminent =
        Boolean(trouble) &&
        isTroubleStatePromotable(trouble!.id) &&
        trouble!.level >= 7 &&
        trouble!.seasonsUnchecked >= 3 &&
        pSim.order <= 30;
      const lairImminent =
        Boolean(lair) && isLairStateCapable(lair!.id) && lair!.level >= 8 && lair!.seasonsActive >= 7;
      if (troubleImminent || lairImminent) {
        candidates.push({
          kind: "ascension_warning",
          cell,
          title: `${lair ? lair.name : trouble!.name} is about to rise`,
          subtitle: "A new sovereign state may be born next season",
          provinceId: province.i,
          stateId,
          rewardGold: 25,
          rewardRenown: 12,
          priority: 100
        });
      }
    }

    candidates.sort((a, b) => b.priority - a.priority);
    for (const candidate of candidates) {
      if (guild.popups.length >= MAX_LIVING_POPUPS) break;
      if (this.hasPopup(guild, candidate.kind, candidate.provinceId)) continue;
      const { priority: _priority, ...popup } = candidate;
      guild.popups.push({
        ...popup,
        id: this.nextPopupId(guild),
        createdTick: living.tick,
        expiresAtTick: living.tick + POPUP_LIFETIME_SEASONS
      });
    }

    this.spawnPetitionPopup(living);
  }

  /** Queue a one-off popup (e.g. a battle unearthing a relic) without waiting for the next scan. */
  private queuePopup(partial: Omit<LivingPopup, "id" | "createdTick" | "expiresAtTick">): LivingPopup | null {
    const living = this.getState();
    const guild = this.getGuild();
    if (guild.popups.length >= MAX_LIVING_POPUPS) return null;
    if (this.hasPopup(guild, partial.kind, partial.provinceId, partial.cell)) return null;

    const entry: LivingPopup = {
      ...partial,
      id: this.nextPopupId(guild),
      createdTick: living.tick,
      expiresAtTick: living.tick + POPUP_LIFETIME_SEASONS
    };
    guild.popups.push(entry);
    return entry;
  }

  private hasPopup(guild: GuildState, kind: LivingPopupKind, provinceId?: number, cell?: number): boolean {
    return guild.popups.some(popup => {
      if (popup.kind !== kind) return false;
      if (provinceId !== undefined) return popup.provinceId === provinceId;
      return cell !== undefined && popup.cell === cell;
    });
  }

  /** Queue a guild petition from a ruler or burg every ~5 seasons, anchored to an active crisis. */
  private spawnPetitionPopup(living: LivingWorldState): void {
    const guild = this.getGuild();
    if (guild.popups.some(popup => popup.kind === "guild_petition")) return;
    if (guild.popups.length >= MAX_LIVING_POPUPS) return;

    const phase = createRng(`${living.seed}:guild:petition:phase`).int(0, 4);
    if ((living.tick + phase) % 5 !== 0) return;

    const rng = this.rng("guild:petition", living.tick);
    const target = this.findPetitionAnchor(living, rng);
    if (!target) return;

    this.queuePopup({
      kind: "guild_petition",
      cell: target.cell,
      title: formatPetitionText(target.def.title, target.context),
      subtitle: formatPetitionText(target.def.text, target.context),
      provinceId: target.provinceId,
      burgId: target.burgId,
      stateId: target.stateId,
      petitionId: target.def.id,
      rewardGold: 0,
      rewardRenown: 0
    });
  }

  /** A petitionable crisis matching an awaiting petition definition. */
  private findPetitionAnchor(living: LivingWorldState, rng: Rng): PetitionTarget | null {
    const targets: PetitionTarget[] = [];

    for (const province of pack.provinces ?? []) {
      if (!province?.i || province.removed) continue;
      const pSim = living.provinces?.[province.i];
      if (!pSim) continue;
      const stateId = province.state;
      const state = stateId ? pack.states[stateId] : undefined;
      const context = {
        province: province.name,
        state: state?.i && !state.removed ? state.name : undefined,
        burg: pSim.trouble?.burgId !== undefined ? pack.burgs[pSim.trouble.burgId]?.name : undefined,
        trouble: pSim.trouble?.name,
        lair: pSim.lair?.name
      };

      if (pSim.trouble) {
        for (const def of petitionsForAnchor("trouble")) {
          if (def.promotableOnly && !isTroubleStatePromotable(pSim.trouble.id)) continue;
          targets.push({
            def,
            cell: pSim.trouble.cell ?? province.center ?? 0,
            provinceId: province.i,
            burgId: pSim.trouble.burgId,
            stateId,
            context
          });
        }
      }
      if (pSim.lair) {
        for (const def of petitionsForAnchor("lair")) {
          targets.push({
            def,
            cell: pSim.lair.cell,
            provinceId: province.i,
            burgId: pSim.lair.burgId,
            stateId,
            context: {
              ...context,
              burg: pSim.lair.burgId !== undefined ? pack.burgs[pSim.lair.burgId]?.name : undefined
            }
          });
        }
      }
    }

    for (const burg of pack.burgs ?? []) {
      if (!burg?.i || burg.removed || !burg.state) continue;
      const bSim = living.burgs?.[burg.i];
      const state = pack.states[burg.state];
      if (!bSim || bSim.unrest < 5 || !state?.i || state.removed) continue;
      for (const def of petitionsForAnchor("unrest")) {
        targets.push({
          def,
          cell: burg.cell,
          burgId: burg.i,
          stateId: burg.state,
          context: { burg: burg.name, state: state.name }
        });
      }
    }

    for (const state of pack.states ?? []) {
      if (!state?.i || state.removed) continue;
      const sSim = living.states?.[state.i];
      const ruler = sSim && sSim.rulerId !== undefined ? this.findFigure(sSim.rulerId) : undefined;
      if (!ruler || ruler.death !== undefined) continue;
      const capital = state.capital ? pack.burgs[state.capital] : undefined;
      for (const def of petitionsForAnchor("state")) {
        targets.push({
          def,
          cell: capital?.cell ?? state.center ?? 0,
          stateId: state.i,
          burgId: capital?.i,
          context: { state: state.name, ruler: ruler.name, burg: capital?.name }
        });
      }
    }

    const guild = this.getGuild();
    for (const relic of guild.relics ?? []) {
      if (!relic.cursed) continue;
      for (const def of petitionsForAnchor("cursedRelic")) {
        targets.push({
          def,
          cell: guild.hqBurgId ? (pack.burgs[guild.hqBurgId]?.cell ?? 0) : 0,
          context: { relic: relic.name }
        });
      }
    }

    return targets.length > 0 ? rng.choice(targets) : null;
  }

  /** Apply the player's petition choice: guild gold/renown plus world outcomes. */
  resolvePetition(popupId: number, choiceIndex: number): { summary: string; gold: number; renown: number } | null {
    const living = this.getState();
    const guild = this.getGuild();
    const index = guild.popups.findIndex(popup => popup.id === popupId && popup.kind === "guild_petition");
    if (index === -1) return null;

    const popup = guild.popups[index]!;
    const def = getPetitionDef(popup.petitionId);
    const choice = def?.choices[choiceIndex];
    if (!def || !choice || popup.expiresAtTick <= living.tick) return null;

    guild.popups.splice(index, 1);
    guild.gold = Math.max(0, guild.gold + choice.gold);
    guild.renown = Math.max(0, guild.renown + choice.renown);
    this.syncGuildTier(living, guild);

    const outcomes = this.applyPetitionEffects(living, popup, choice.effects ?? []);
    const summary =
      outcomes.length > 0 ? `${choice.label}: ${outcomes.join(", ")}.` : `${choice.label}: the Guild takes its cut.`;

    const signed = (value: number): string => `${value >= 0 ? "+" : ""}${value}`;
    this.pushNews(living, {
      kind: "develop",
      text: `Petition resolved — ${popup.title}: ${choice.label} (${signed(choice.gold)}g, ${signed(choice.renown)} renown).`,
      cell: popup.cell,
      stateId: popup.stateId,
      burgId: popup.burgId
    });
    return { summary, gold: choice.gold, renown: choice.renown };
  }

  private applyPetitionEffects(living: LivingWorldState, popup: LivingPopup, effects: PetitionEffect[]): string[] {
    const outcomes: string[] = [];
    for (const effect of effects) {
      switch (effect.kind) {
        case "quellTrouble": {
          if (popup.provinceId !== undefined && this.quellTrouble(popup.provinceId)) {
            outcomes.push("the trouble was quelled");
          }
          break;
        }
        case "promoteTrouble": {
          const newStateId =
            popup.provinceId !== undefined ? this.promoteTroubleToState(popup.provinceId, popup.burgId) : null;
          if (newStateId !== null)
            outcomes.push(`${pack.states[newStateId]?.name ?? "a new realm"} rose from the coup`);
          break;
        }
        case "purgeLair": {
          const pSim = popup.provinceId !== undefined ? living.provinces[popup.provinceId] : undefined;
          const lair = pSim?.lair;
          if (pSim && lair) {
            this.removeLairMarker(lair.markerId);
            pSim.lair = null;
            pSim.order = Math.min(100, pSim.order + 12);
            this.relieveEschaton(living);
            outcomes.push(`${lair.name} was broken up`);
          }
          break;
        }
        case "pacifyBurg": {
          if (popup.burgId !== undefined && this.pacifyBurg(popup.burgId)) outcomes.push("the burg was pacified");
          break;
        }
        case "unrest": {
          const bSim = popup.burgId !== undefined ? living.burgs[popup.burgId] : undefined;
          if (bSim) {
            bSim.unrest = minmax(bSim.unrest + effect.amount, 0, 100);
            outcomes.push(effect.amount >= 0 ? "unrest grew" : "unrest eased");
          }
          break;
        }
        case "unravel": {
          const sSim = popup.stateId !== undefined ? living.states[popup.stateId] : undefined;
          if (sSim) {
            sSim.unravel = minmax(sSim.unravel + effect.amount, 0, 100);
            outcomes.push(effect.amount >= 0 ? "the realm frayed" : "the realm stabilized");
          }
          break;
        }
        case "smiteRuler": {
          if (popup.stateId !== undefined && this.smiteRuler(popup.stateId)) outcomes.push("the ruler fell");
          break;
        }
        case "destroyRelic": {
          const relicIndex = (this.getGuild().relics ?? []).findIndex(relic => relic.cursed);
          if (relicIndex !== -1) {
            const [relic] = this.getGuild().relics.splice(relicIndex, 1);
            outcomes.push(`${relic.name} was destroyed`);
          }
          break;
        }
        case "setPatron": {
          if (popup.stateId !== undefined) {
            this.setFavoredState(popup.stateId);
            outcomes.push("the state is now the Guild's patron");
          }
          break;
        }
      }
    }
    return outcomes;
  }

  private nextPopupId(guild: GuildState): number {
    return guild.popups.reduce((max, popup) => Math.max(max, popup.id), 0) + 1;
  }

  private emptyGuild(): GuildState {
    return {
      tier: 1,
      gold: 0,
      renown: 0,
      ageCount: 0,
      sandboxGodMode: false,
      doctrine: "auto_bounties",
      chapterBurgIds: [],
      roster: [],
      candidates: [],
      missions: [],
      relics: [],
      cooldowns: {},
      excavatedMarkers: [],
      popups: []
    };
  }

  /** Guild headquarters: the largest capital, else the largest burg */
  private pickGuildHq(): number | undefined {
    const living = (pack.burgs ?? []).filter(burg => burg?.i && !burg.removed);
    const capitals = living.filter(burg => burg.capital);
    const pool = capitals.length > 0 ? capitals : living;
    return pool.sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.i - b.i)[0]?.i;
  }

  private findFigure(figureId: number): HistoricalFigure | undefined {
    return Chronicle.sync().figures?.find(figure => figure.i === figureId);
  }

  /** Lazy vitals for old saves and fresh candidates alike. */
  private ensureHeroGuildState(guild: GuildState, figure: HistoricalFigure): HeroGuildState {
    ensureHeroIdentity(figure);
    guild.heroes ??= {};

    const def = figureArchetype(figure);
    const max = heroMaxVitals(def.id, figureLevel(figure.xp ?? 0), figure.progression?.picks ?? []);
    let state = guild.heroes[figure.i];
    if (!state) {
      state = {
        resolve: max.maxResolve,
        stamina: max.maxStamina,
        maxResolve: max.maxResolve,
        maxStamina: max.maxStamina,
        doctrine: def.defaultDoctrine,
        temperament: heroTemperamentFor(def.id),
        injuries: []
      };
      guild.heroes[figure.i] = state;
      return state;
    }

    state.maxResolve = max.maxResolve;
    state.maxStamina = max.maxStamina;
    state.resolve = Math.min(state.resolve ?? max.maxResolve, max.maxResolve);
    state.stamina = Math.min(state.stamina ?? max.maxStamina, max.maxStamina);
    state.doctrine ??= def.defaultDoctrine;
    state.temperament ??= heroTemperamentFor(def.id);
    state.injuries ??= [];
    return state;
  }

  private heroScore(figure: HistoricalFigure, pool: "m" | "w" | "s" | "c", tags: readonly MissionTag[] = []): number {
    const fit = heroMissionFit(figure, tags);
    return (figure.skills?.[pool] ?? 0) + fit.alignment + fit.aspect + fit.discipline;
  }

  private missionPhaseInput(target: GuildTarget): MissionPhaseInput {
    const chronicle =
      target.kind === "excavate" &&
      target.markerId !== undefined &&
      Boolean((pack.markers ?? []).find(marker => marker?.i === target.markerId)?.chronicle);
    return {
      kind: target.kind,
      dc: target.dc,
      tags: target.tags,
      level: target.level,
      chronicle
    };
  }

  private missionPhases(target: GuildTarget): MissionPhase[] {
    return buildMissionPhases(this.missionPhaseInput(target));
  }

  /** Party companions wait for click-dispatch when their doctrine is manual. */
  private idlePartyCandidates(guild: GuildState): HistoricalFigure[] {
    return guild.roster
      .filter(id => this.isHeroIdle(guild, id))
      .map(id => this.findFigure(id))
      .filter((figure): figure is HistoricalFigure => Boolean(figure) && figure!.death === undefined)
      .filter(figure => this.ensureHeroGuildState(guild, figure).doctrine !== "manual");
  }

  private phaseScore(figure: HistoricalFigure, phase: MissionPhase): number {
    return this.heroScore(figure, phase.pool, phase.tags) + (figure.skills?.[phase.pool] ?? 0) * 5;
  }

  /** Leader first, then the best coverage companions up to the tier's party limit. */
  private autoFillParty(
    _living: LivingWorldState,
    guild: GuildState,
    target: GuildTarget,
    leaderId?: number
  ): HistoricalFigure[] {
    const limit = maxPartyForTier(guild.tier);
    const phases = this.missionPhases(target);
    const leader =
      leaderId !== undefined && guild.roster.includes(leaderId) && this.isHeroIdle(guild, leaderId)
        ? this.findFigure(leaderId)
        : undefined;

    const party: HistoricalFigure[] = [];
    if (leader && leader.death === undefined) party.push(leader);

    const candidates = this.idlePartyCandidates(guild).filter(figure => !party.some(hero => hero.i === figure.i));
    if (party.length === 0) {
      const ranked = [...candidates].sort(
        (a, b) =>
          Math.max(...phases.map(phase => this.phaseScore(b, phase))) -
            Math.max(...phases.map(phase => this.phaseScore(a, phase))) || a.i - b.i
      );
      if (ranked.length === 0) return [];
      party.push(ranked[0]!);
      candidates.splice(candidates.indexOf(ranked[0]!), 1);
    }

    while (party.length < limit && candidates.length > 0) {
      candidates.sort(
        (a, b) =>
          phases.reduce((sum, phase) => sum + Math.max(0, this.phaseScore(b, phase)), 0) -
            phases.reduce((sum, phase) => sum + Math.max(0, this.phaseScore(a, phase)), 0) || a.i - b.i
      );
      party.push(candidates.shift()!);
    }

    return party;
  }

  private partyChance(
    living: LivingWorldState,
    guild: GuildState,
    party: readonly HistoricalFigure[],
    target: GuildTarget
  ): number {
    if (party.length === 0) return 0;
    const phases = phasesForParty(this.missionPhases(target), party.length);
    const contributions = new Map<number, number>();
    let total = 0;
    for (const phase of phases) {
      const choice = this.pickPhaseHero(party, contributions, phase);
      if (!choice) continue;
      contributions.set(choice.figure.i, (contributions.get(choice.figure.i) ?? 0) + 1);
      total += this.missionChance(living, guild, choice.figure, phase);
    }
    return total / Math.max(1, phases.length);
  }

  private pickPhaseHero(
    party: readonly HistoricalFigure[],
    contributions: ReadonlyMap<number, number>,
    phase: MissionPhase
  ): { figure: HistoricalFigure; untrained: boolean } | undefined {
    const eligible = party.filter(figure => (contributions.get(figure.i) ?? 0) < 2);
    if (eligible.length === 0) return undefined;
    const trained = eligible.filter(figure => (figure.skills?.[phase.pool] ?? 0) > 0);
    const pool = trained.length > 0 ? trained : eligible;
    const figure = [...pool].sort((a, b) => this.phaseScore(b, phase) - this.phaseScore(a, phase) || a.i - b.i)[0];
    return figure ? { figure, untrained: trained.length === 0 } : undefined;
  }

  private partySynergy(guild: GuildState, party: readonly HistoricalFigure[]): number {
    if (party.length === 0) return 0;
    const primaryPools = party.map(figure => figureArchetype(figure).primaryPool);
    const distinct = new Set(primaryPools).size;
    const leaderState = this.ensureHeroGuildState(guild, party[0]!);
    const support = party.some(figure => {
      const state = this.ensureHeroGuildState(guild, figure);
      return state.doctrine === "support" || figureDisciplines(figure).includes("healing");
    });
    const duplicated = primaryPools.some((pool, index) => primaryPools.indexOf(pool) !== index);

    let synergy = 0;
    if (distinct >= 3) synergy += 1;
    if (leaderState.temperament.teamplay >= 0.7) synergy += 1;
    if (duplicated && !support) synergy -= 1;
    return Math.max(-1, Math.min(1, synergy));
  }

  /** HUD helper: the recommended party and each member's best phase. */
  private partyPreview(
    living: LivingWorldState,
    guild: GuildState,
    target: GuildTarget,
    leaderId?: number
  ): PartyPreview {
    const party = this.autoFillParty(living, guild, target, leaderId);
    const phases = phasesForParty(this.missionPhases(target), party.length);
    const members = party.map(figure => {
      const best = [...phases].sort((a, b) => this.phaseScore(figure, b) - this.phaseScore(figure, a))[0];
      return {
        figureId: figure.i,
        name: figure.name,
        score: best ? this.phaseScore(figure, best) : 0,
        bestPhaseId: best?.id ?? ""
      };
    });
    return { party: party.map(figure => figure.i), phases, members };
  }

  private bestPartyForTarget(
    living: LivingWorldState,
    guild: GuildState,
    target: GuildTarget
  ): HistoricalFigure[] | undefined {
    let best: { party: HistoricalFigure[]; score: number } | undefined;
    for (const leader of this.idlePartyCandidates(guild)) {
      const party = this.autoFillParty(living, guild, target, leader.i);
      if (party.length === 0) continue;
      const chance = this.partyChance(living, guild, party, target);
      if (chance < MIN_AUTO_DISPATCH_FIT) continue;
      const doctrine = this.ensureHeroGuildState(guild, leader).doctrine;
      const phases = phasesForParty(this.missionPhases(target), party.length);
      const leaderFit = Math.max(...phases.map(phase => this.phaseScore(leader, phase))) * 0.01;
      const score =
        chance * (1 + target.rewardGold / 100) * target.priority +
        this.doctrineWeight(doctrine, target.kind) +
        leaderFit;
      if (!best || score > best.score) best = { party, score };
    }
    return best?.party;
  }

  private isHeroIdle(guild: GuildState, figureId: number): boolean {
    if (guild.missions.some(mission => mission.figureId === figureId || mission.party?.includes(figureId)))
      return false;
    const state = guild.heroes?.[figureId];
    const tick = this.getState().tick;
    if (state?.downUntilTick !== undefined && state.downUntilTick > tick) return false;
    return (guild.cooldowns[figureId] ?? 0) <= tick;
  }

  private hasTargetMission(guild: GuildState, kind: GuildMissionKind, provinceId?: number, markerId?: number): boolean {
    return guild.missions.some(mission => {
      if (mission.kind !== kind) return false;
      return markerId !== undefined ? mission.markerId === markerId : mission.provinceId === provinceId;
    });
  }

  /** The best mission available in one province (trouble before lair). */
  private provinceTarget(living: LivingWorldState, guild: GuildState, provinceId: number): GuildTarget | null {
    const province = pack.provinces?.[provinceId];
    const pSim = living.provinces?.[provinceId];
    if (!province?.i || province.removed || !pSim) return null;

    const trouble = pSim.trouble;
    if (trouble && !this.hasTargetMission(guild, "trouble", provinceId)) {
      const def = getTroubleDef(trouble.id);
      return {
        kind: "trouble",
        cell: trouble.cell ?? province.center ?? 0,
        provinceId,
        burgId: trouble.burgId,
        pool: def.pool,
        dc: 14 + trouble.level,
        rewardGold: 15 + trouble.level * 5,
        rewardRenown: 5,
        priority: 2,
        level: trouble.level,
        tags: troubleMissionTags(trouble)
      };
    }

    const lair = pSim.lair;
    if (lair && !this.hasTargetMission(guild, "lair", provinceId)) {
      return {
        kind: "lair",
        cell: lair.cell,
        provinceId,
        burgId: lair.burgId,
        pool: "m",
        dc: 14 + lair.level,
        rewardGold: 30 + lair.level * 10,
        rewardRenown: 15,
        priority: 1,
        level: lair.level,
        tags: lairMissionTags(lair)
      };
    }
    return null;
  }

  /** An excavate mission against an unexcavated ruin, battlefield, dungeon, necropolis, statue or library */
  private excavationTarget(guild: GuildState, marker: Marker): GuildTarget | null {
    if (!marker || !isExcavationMarker(marker)) return null;
    if (guild.excavatedMarkers.includes(marker.i)) return null;
    if (this.hasTargetMission(guild, "excavate", undefined, marker.i)) return null;

    const rng = this.rng("guild:excavate", marker.i);
    // chronicle sites always hide a named relic; wild ruins yield a relic half the time, else a cache
    const wantsRelic = Boolean(marker.chronicle) || rng.chance(0.5);
    return {
      kind: "excavate",
      cell: marker.cell,
      markerId: marker.i,
      pool: "c",
      dc: 13 + guild.tier,
      rewardGold: wantsRelic ? 20 + rng.int(0, 20) : 40 + rng.int(0, 40),
      rewardRenown: 20,
      priority: 1,
      level: 0,
      tags: excavationMissionTags(marker),
      wantsRelic
    };
  }

  /** A pacify mission in a burg with unrest. */
  private burgTarget(living: LivingWorldState, guild: GuildState, burgId: number): GuildTarget | null {
    const burg = pack.burgs?.[burgId];
    const bSim = living.burgs?.[burgId];
    if (!burg?.i || burg.removed || !burg.state || !bSim || bSim.unrest <= 0) return null;
    if (guild.missions.some(mission => mission.kind === "pacify" && mission.burgId === burgId)) return null;

    const provinceId = pack.cells.province?.[burg.cell];
    return {
      kind: "pacify",
      cell: burg.cell,
      provinceId: provinceId && pack.provinces?.[provinceId]?.i ? provinceId : undefined,
      burgId,
      pool: "s",
      dc: 12 + guild.tier,
      rewardGold: 15 + Math.round(bSim.unrest / 2),
      rewardRenown: 10,
      priority: 2,
      level: Math.round(bSim.unrest),
      tags: [...PACIFY_MISSION_TAGS]
    };
  }

  /** The next mission for the guild's current doctrine */
  private missionTargets(living: LivingWorldState, guild: GuildState): GuildTarget[] {
    if (guild.doctrine === "manual") return [];

    const targets: GuildTarget[] = [];
    if (guild.doctrine === "auto_excavate") {
      for (const marker of pack.markers ?? []) {
        const target = this.excavationTarget(guild, marker);
        if (target) targets.push(target);
      }
    } else if (guild.doctrine === "auto_pacify") {
      for (const burg of pack.burgs ?? []) {
        if (!burg?.i || burg.removed) continue;
        const target = this.burgTarget(living, guild, burg.i);
        if (target) targets.push(target);
      }
    } else {
      for (const province of pack.provinces ?? []) {
        if (!province?.i || province.removed) continue;
        if (guild.doctrine === "auto_patron" && province.state !== guild.favoredStateId) continue;
        const target = this.provinceTarget(living, guild, province.i);
        if (target) targets.push(target);
      }
      if (living.activeLairs) {
        for (const lair of Object.values(living.activeLairs)) {
          if (lair.markerId !== undefined && !this.hasTargetMission(guild, "lair", lair.provinceId, lair.markerId)) {
            targets.push({
              kind: "lair",
              cell: lair.cell,
              provinceId: lair.provinceId && pack.provinces?.[lair.provinceId]?.i ? lair.provinceId : undefined,
              burgId: lair.burgId,
              markerId: lair.markerId,
              pool: "m",
              dc: 14 + lair.level,
              rewardGold: 30 + lair.level * 10,
              rewardRenown: 15,
              priority: guild.doctrine === "auto_lairs" ? 3 : 1,
              level: lair.level,
              tags: lairMissionTags(lair)
            });
          }
        }
      }
    }

    for (const target of targets) {
      if (guild.doctrine === "auto_lairs") target.priority = target.kind === "lair" ? 3 : 2;
      else if (guild.doctrine === "auto_bounties") target.priority = target.kind === "trouble" ? 3 : 2;
      else if (guild.doctrine === "auto_pacify") target.priority = target.kind === "pacify" ? 3 : 2;
      else target.priority = target.kind === "trouble" ? 2 : 1;
    }

    targets.sort(
      (a, b) =>
        b.priority - a.priority ||
        b.level - a.level ||
        (a.provinceId ?? a.markerId ?? a.burgId ?? 0) - (b.provinceId ?? b.markerId ?? b.burgId ?? 0)
    );
    return targets;
  }

  /** Chance that a hero succeeds at a target with the current state and guild bonuses. */
  private missionChance(
    living: LivingWorldState,
    guild: GuildState,
    figure: HistoricalFigure,
    target: Pick<GuildTarget, "provinceId" | "pool" | "dc"> & { tags?: MissionTag[] }
  ): number {
    const province = target.provinceId !== undefined ? pack.provinces?.[target.provinceId] : undefined;
    const sSim = province?.state ? living.states[province.state] : undefined;
    const poolGen = sSim?.capacity[target.pool]?.gen ?? 0;
    const carried = equippedRelic(guild.relics ?? [], figure.i);
    const tags = target.tags ?? [];
    const fit = heroMissionFit(figure, tags);
    const state = this.ensureHeroGuildState(guild, figure);
    const injuries = injuryPenalty(state.injuries, tags, living.tick);
    const modifier =
      (figure.skills?.[target.pool] ?? 0) +
      valueModifier(poolGen) +
      fit.alignment +
      fit.aspect +
      fit.discipline +
      guildCheckBonus(guild.tier) +
      (carried?.bonuses[target.pool] ?? 0) -
      injuries;
    return minmax((21 - target.dc + modifier) / 20, 0, 1);
  }

  private doctrineWeight(doctrine: HeroDoctrine, kind: GuildMissionKind): number {
    if (doctrine === "manual") return 0;
    if (doctrine === "hunt_lairs") return kind === "lair" ? 2 : kind === "trouble" ? 1 : 0.25;
    if (doctrine === "hunt_troubles") return kind === "trouble" ? 2 : kind === "lair" ? 1 : 0.25;
    if (doctrine === "excavate") return kind === "excavate" ? 2 : 0.1;
    if (doctrine === "support") return kind === "pacify" ? 2 : kind === "trouble" ? 1 : 0.5;
    return kind === "pacify" ? 1.5 : 0.5;
  }

  private targetKey(target: GuildTarget): string {
    if (target.markerId !== undefined) return `marker:${target.markerId}`;
    if (target.kind === "pacify" && target.burgId !== undefined) return `burg:${target.burgId}`;
    return `province:${target.provinceId}`;
  }

  private missionNewsKind(kind: GuildMissionKind): LivingNewsKind {
    if (kind === "lair") return "lair";
    if (kind === "trouble") return "trouble";
    if (kind === "pacify") return "pacify";
    return "develop";
  }

  private createMission(
    living: LivingWorldState,
    guild: GuildState,
    figure: HistoricalFigure,
    target: GuildTarget,
    partyFigures: HistoricalFigure[] = [figure]
  ): ActiveGuildMission {
    const id = guild.missions.reduce((max, mission) => Math.max(max, mission.id), 0) + 1;
    const limit = maxPartyForTier(guild.tier);
    const party = [figure, ...partyFigures].filter(
      (hero, index, list) => hero.death === undefined && list.findIndex(entry => entry.i === hero.i) === index
    );
    const members = party.slice(0, limit);
    const phases = phasesForParty(this.missionPhases(target), members.length);
    const finalPhase = phases[phases.length - 1];
    const mission: ActiveGuildMission = {
      id,
      kind: target.kind,
      figureId: figure.i,
      targetCell: target.cell,
      provinceId: target.provinceId,
      burgId: target.burgId,
      markerId: target.markerId,
      pool: finalPhase?.pool ?? target.pool,
      dc: finalPhase?.dc ?? target.dc,
      progress: 0,
      required: phases.length || 1,
      rewardGold: target.rewardGold,
      rewardRenown: target.rewardRenown,
      tags: [...target.tags],
      party: members.map(hero => hero.i),
      phases,
      phaseResults: [],
      staminaByHero: {},
      ...(target.wantsRelic ? { rewardRelic: true } : {})
    };
    guild.missions.push(mission);
    for (const hero of members) hero.cell = target.cell;

    const names = members.map(hero => hero.name).join(", ");
    this.pushNews(living, {
      kind: this.missionNewsKind(target.kind),
      text: `${names} set out on a Guild ${target.kind} expedition (${phases.length} phases).`,
      cell: target.cell,
      stateId: target.provinceId !== undefined ? pack.provinces?.[target.provinceId]?.state : undefined
    });
    return mission;
  }

  /** Tags for missions saved before tags were stored. */
  private missionTagsFor(living: LivingWorldState, mission: ActiveGuildMission): MissionTag[] {
    const pSim = mission.provinceId !== undefined ? living.provinces?.[mission.provinceId] : undefined;
    if (mission.kind === "trouble" && pSim?.trouble) return troubleMissionTags(pSim.trouble);
    if (mission.kind === "lair" && pSim?.lair) return lairMissionTags(pSim.lair);
    if (mission.kind === "excavate") {
      const marker =
        mission.markerId !== undefined ? (pack.markers ?? []).find(entry => entry?.i === mission.markerId) : undefined;
      return marker ? excavationMissionTags(marker) : ["ruin"];
    }
    return [...PACIFY_MISSION_TAGS];
  }

  private missionStillValid(living: LivingWorldState, mission: ActiveGuildMission): boolean {
    const pSim = mission.provinceId !== undefined ? living.provinces?.[mission.provinceId] : undefined;
    switch (mission.kind) {
      case "trouble":
        return Boolean(pSim?.trouble);
      case "lair":
        if (mission.markerId !== undefined) {
          return Boolean(living.activeLairs?.[`lair:${mission.markerId}`]);
        }
        return Boolean(pSim?.lair);
      case "excavate":
        return (pack.markers ?? []).some(marker => marker.i === mission.markerId && !marker.hidden);
      case "pacify": {
        const burg = mission.burgId ? pack.burgs?.[mission.burgId] : undefined;
        const bSim = mission.burgId !== undefined ? living.burgs?.[mission.burgId] : undefined;
        return Boolean(burg?.i && !burg.removed && (bSim?.unrest ?? 0) > 0);
      }
    }
  }

  /** One season of player faction / guild bookkeeping: missions, hero recovery, candidates, and dispatch. */
  stepPlayerFactionMissions(living: LivingWorldState): void {
    const guild = this.getGuild();
    const faction = this.getPlayerFaction();

    const hq = guild.hqBurgId !== undefined ? pack.burgs?.[guild.hqBurgId] : undefined;
    if (!hq || hq.removed) {
      guild.hqBurgId = faction.hq.burgId ?? this.pickGuildHq();
      if (guild.hqBurgId !== undefined && !guild.chapterBurgIds.includes(guild.hqBurgId)) {
        guild.chapterBurgIds.push(guild.hqBurgId);
      }
    }

    guild.gold += GUILD_DUES_PER_CHAPTER * guild.chapterBurgIds.length;
    this.syncGuildTier(living, guild);

    for (const key of Object.keys(guild.cooldowns)) {
      const figureId = Number(key);
      if ((guild.cooldowns[figureId] ?? 0) <= living.tick) delete guild.cooldowns[figureId];
    }

    guild.roster = guild.roster.filter(id => {
      const figure = this.findFigure(id);
      return Boolean(figure) && figure!.death === undefined;
    });

    this.autoPickPendingPaths(living, guild);
    this.recoverHeroes(living, guild);

    for (const mission of [...guild.missions]) {
      mission.progress += 1;
      this.resolveMission(living, mission);
    }

    if (living.season === 0) this.refreshCandidates(living);
    this.autoDispatch(living);

    if (faction) {
      faction.treasury = guild.gold;
      faction.influence = guild.renown;
      faction.tier = Math.min(5, Math.max(1, guild.tier));
      faction.memberIds = [...guild.roster];
      faction.candidateIds = [...guild.candidates];
      faction.missions = [...guild.missions];
      faction.relics = [...guild.relics];
    }
  }

  /** Spring: refresh the tavern with up to three free adventurers. */
  private refreshCandidates(living: LivingWorldState): void {
    const guild = this.getGuild();
    const history = Chronicle.sync();
    history.figures ??= [];
    const figures = history.figures;

    const free = figures.filter(
      figure =>
        figure.death === undefined &&
        !guild.roster.includes(figure.i) &&
        !guild.candidates.includes(figure.i) &&
        figure.roles.some(role => role.type === "adventurer" && role.target.kind === "culture" && role.to === undefined)
    );

    guild.candidates = free.slice(0, GUILD_CANDIDATES_PER_YEAR).map(figure => figure.i);
    while (guild.candidates.length < GUILD_CANDIDATES_PER_YEAR) {
      const avoid = guild.candidates
        .map(id => this.findFigure(id))
        .filter((figure): figure is HistoricalFigure => Boolean(figure))
        .map(figure => {
          ensureHeroIdentity(figure);
          return figure.archetype!;
        });
      guild.candidates.push(this.mintCandidate(living, avoid).i);
    }
  }

  /** A fresh, unaffiliated adventurer for the tavern. */
  private mintCandidate(living: LivingWorldState, avoid: HeroArchetypeId[] = []): HistoricalFigure {
    const history = Chronicle.sync();
    history.figures ??= [];
    const figures = history.figures;
    const index = figures.length;
    const rng = createRng(`${living.seed}:guild:candidate:${index}`);
    const cultures = (pack.cultures ?? []).filter(culture => culture?.i && !culture.removed);
    const culture = cultures.length > 0 ? cultures[rng.int(0, cultures.length - 1)]!.i : 0;
    const archetype = rollHeroArchetype(rng, pack.cultures?.[culture], avoid);
    const def = HERO_ARCHETYPES[archetype];
    const alignment = rollAlignment(rng, pack.cultures?.[culture]?.alignment);
    const { virtues, vices } = rollFigureTraits(rng, alignment);
    const year = options.map?.lore?.calendar?.year ?? 1000;

    const quality = rng.next();
    const level = quality < 0.7 ? 1 : quality < 0.95 ? 2 : 3;
    const skills = { ...def.baseSkills };
    let growthIndex = 0;
    for (let step = 2; step <= level; step++) {
      if (step === 3 || step === 6) continue;
      const pool = def.growthOrder[growthIndex % def.growthOrder.length]!;
      growthIndex += 1;
      skills[pool] = Math.min(5, skills[pool] + 1);
    }

    const guild = this.getGuild();

    const figure: HistoricalFigure = {
      i: index,
      name: Names.getCulture(culture),
      culture,
      birth: year - rng.int(20, 38),
      roles: [{ type: "adventurer", target: { kind: "culture", id: culture }, from: year }],
      alignment,
      virtues,
      vices,
      cell: guild.hqBurgId !== undefined ? pack.burgs[guild.hqBurgId]?.cell : undefined,
      xp: xpForHeroLevel(level),
      skills,
      archetype,
      disciplines: [...def.disciplines],
      progression: { appliedLevel: level, pendingChoices: level >= 3 ? 1 : 0, picks: [] }
    };
    figures.push(figure);
    return figure;
  }

  /** A retired veteran's protege: one point in the veteran's best pool carried forward. */
  private spawnProtege(living: LivingWorldState, veteran: HistoricalFigure): HistoricalFigure | undefined {
    const history = Chronicle.sync();
    history.figures ??= [];
    const figures = history.figures;
    const index = figures.length;
    const rng = createRng(`${living.seed}:guild:protege:${index + veteran.i * 1000}`);
    const culture = veteran.culture;
    const alignment = rollAlignment(rng, pack.cultures?.[culture]?.alignment);
    const { virtues, vices } = rollFigureTraits(rng, alignment);
    const year = options.map?.lore?.calendar?.year ?? 1000;

    const skills = {
      m: veteran.skills?.m ?? 0,
      w: veteran.skills?.w ?? 0,
      s: veteran.skills?.s ?? 0,
      c: veteran.skills?.c ?? 0
    };
    const pools = ["m", "w", "s", "c"] as const;
    const best = pools.reduce((chosen, pool) => (skills[pool] > skills[chosen] ? pool : chosen), pools[0]!);
    skills[best] = Math.min(5, skills[best] + 1);
    ensureHeroIdentity(veteran);

    const protege: HistoricalFigure = {
      i: index,
      name: Names.getCulture(culture),
      culture,
      birth: year - rng.int(18, 24),
      roles: [{ type: "adventurer", target: { kind: "culture", id: culture }, from: year }],
      alignment,
      virtues,
      vices,
      cell: veteran.cell,
      xp: 0,
      skills,
      archetype: veteran.archetype,
      disciplines: [...figureDisciplines(veteran)],
      progression: { appliedLevel: 1, pendingChoices: 0, picks: [] }
    };
    figures.push(protege);
    return protege;
  }

  private syncGuildTier(living: LivingWorldState, guild: GuildState): void {
    const tier = guildTierForRenown(guild.renown);
    if (tier <= guild.tier) return;

    guild.tier = tier;
    this.pushNews(living, {
      kind: "muster",
      text: `The Guild Hall was raised to tier ${tier}: ${GUILD_TIER_TITLES[tier - 1]}.`
    });
  }

  /** Ignored level 3/6 choices are auto-picked after two seasons by the archetype's doctrine. */
  private autoPickPendingPaths(living: LivingWorldState, guild: GuildState): void {
    for (const id of guild.roster) {
      const figure = this.findFigure(id);
      if (!figure || figure.death !== undefined) continue;
      ensureHeroIdentity(figure);

      const progression = figure.progression!;
      if ((progression.pendingChoices ?? 0) <= 0) continue;
      if (progression.choiceSinceTick === undefined) {
        progression.choiceSinceTick = living.tick;
        continue;
      }
      if (living.tick - progression.choiceSinceTick < 2) continue;

      const def = figureArchetype(figure);
      const path = defaultPathForDoctrine(def.id, def.defaultDoctrine, pendingPathLevel(figure));
      this.chooseHeroPath(id, path.id);
    }
  }

  /** Guild Hall rest: Resolve, Stamina and injury treatment, once per season. */
  private recoverHeroes(living: LivingWorldState, guild: GuildState): void {
    for (const id of guild.roster) {
      const figure = this.findFigure(id);
      if (!figure || figure.death !== undefined) continue;
      if (guild.missions.some(mission => mission.figureId === id || mission.party?.includes(id))) continue;

      const state = this.ensureHeroGuildState(guild, figure);
      if (state.downUntilTick !== undefined && living.tick >= state.downUntilTick) state.downUntilTick = undefined;

      const healer = figureDisciplines(figure).includes("healing");
      state.resolve = Math.min(state.maxResolve, state.resolve + (healer ? 2 : 1));
      state.stamina = Math.min(state.maxStamina, state.stamina + 1);
      state.injuries = recoverInjuries(state.injuries, living.tick, healer);
    }
  }

  private autoDispatch(living: LivingWorldState): void {
    const guild = this.getGuild();
    if (guild.doctrine === "manual") return;

    const targets = this.missionTargets(living, guild);
    if (targets.length === 0) return;

    const assignedTargets = new Set<string>();
    for (const target of targets) {
      const key = this.targetKey(target);
      if (assignedTargets.has(key)) continue;
      const party = this.bestPartyForTarget(living, guild, target);
      if (!party) continue;
      assignedTargets.add(key);
      this.createMission(living, guild, party[0]!, target, party);
    }
  }

  /** Seasonal bookkeeping for leased relics: tribute gold and unravel relief. */
  private stepRelics(living: LivingWorldState): void {
    const guild = living.guild;
    if (!guild?.relics?.length) return;

    for (const relic of guild.relics) {
      if (relic.holder.kind !== "state") continue;
      guild.gold += RELIC_LEASE_TRIBUTE;
      const sSim = living.states[relic.holder.id];
      if (sSim) sSim.unravel = Math.max(0, sSim.unravel - 1);
    }
  }

  /** The current eschaton reading, lazily initialized for old saves */
  getEschaton(): number {
    return this.getState().eschaton ?? 0;
  }

  /** Each season, every level 8+ lair pushes the world one step closer to the finale. */
  private stepEschaton(living: LivingWorldState): void {
    let doom = 0;
    const lairs = living.activeLairs
      ? Object.values(living.activeLairs)
      : Object.values(living.provinces)
          .map(p => p.lair)
          .filter(Boolean);
    for (const lair of lairs) {
      if (lair && lair.level >= 8) doom += 1;
    }
    if (doom > 0) this.exaltEschaton(living, doom);
  }

  private exaltEschaton(living: LivingWorldState, amount: number): void {
    living.eschaton = minmax((living.eschaton ?? 0) + amount, 0, 100);
  }

  /** Purging lairs buys the world time. */
  private relieveEschaton(living: LivingWorldState, amount = 5): void {
    living.eschaton = Math.max(0, (living.eschaton ?? 0) - amount);
  }

  private resolveMission(living: LivingWorldState, mission: ActiveGuildMission): void {
    const guild = this.getGuild();
    const index = guild.missions.findIndex(entry => entry.id === mission.id);
    if (index === -1) return;

    const leader = this.findFigure(mission.figureId);
    const province = mission.provinceId !== undefined ? pack.provinces?.[mission.provinceId] : undefined;
    if (!leader || leader.death !== undefined || !this.missionStillValid(living, mission)) {
      guild.missions.splice(index, 1);
      if (leader && leader.death === undefined) {
        this.pushNews(living, {
          kind: this.missionNewsKind(mission.kind),
          text: `${leader.name}'s Guild contract ended with nothing left to resolve.`,
          cell: mission.targetCell,
          stateId: province?.state
        });
      }
      return;
    }

    const tags = mission.tags ?? this.missionTagsFor(living, mission);
    mission.phases ??= [
      {
        id: `${mission.kind}_legacy`,
        label: mission.kind,
        pool: mission.pool,
        tags,
        dc: mission.dc,
        required: true
      }
    ];
    const phases = mission.phases;
    mission.party ??= [mission.figureId];
    mission.phaseResults ??= [];
    mission.staminaByHero ??= {};
    const party = mission.party
      .map(id => this.findFigure(id))
      .filter((figure): figure is HistoricalFigure => Boolean(figure) && figure!.death === undefined);
    if (party.length === 0) {
      guild.missions.splice(index, 1);
      return;
    }
    mission.party = party.map(figure => figure.i);

    const phaseIndex = Math.min(phases.length - 1, Math.max(0, mission.progress - 1));
    const phase = phases[phaseIndex];
    if (!phase || mission.phaseResults.some(result => result.phaseId === phase.id)) return;

    const contributions = new Map<number, number>();
    for (const result of mission.phaseResults) {
      contributions.set(result.heroId, (contributions.get(result.heroId) ?? 0) + 1);
    }
    const choice = this.pickPhaseHero(party, contributions, phase) ?? { figure: party[0]!, untrained: true };

    const stamina = this.phaseStamina(living, guild, mission, choice.figure, phase);
    const state = this.ensureHeroGuildState(guild, choice.figure);
    const injuries = injuryPenalty(state.injuries, phase.tags, living.tick) + (choice.untrained ? 2 : 0);
    const synergy = this.partySynergy(guild, party);
    const poolGen = province?.state ? (living.states[province.state]?.capacity[phase.pool]?.gen ?? 0) : 0;
    const carried = equippedRelic(guild.relics ?? [], choice.figure.i);
    const rng = this.rng("guild:phase", mission.id * 1000 + phaseIndex * 100 + choice.figure.i);
    const check = figureCheckRoll(
      rng,
      choice.figure,
      phase.pool,
      poolGen,
      phase.dc,
      guildCheckBonus(guild.tier),
      carried?.bonuses[phase.pool] ?? 0,
      phase.tags,
      stamina,
      injuries,
      synergy,
      choice.untrained
    );

    mission.phaseResults.push({
      phaseId: phase.id,
      heroId: choice.figure.i,
      roll: check.roll,
      total: check.total,
      success: check.success,
      ...(choice.untrained ? { untrained: true } : {})
    });
    mission.staminaSpent = Object.values(mission.staminaByHero).reduce((sum, value) => sum + value, 0);

    const phaseText = `${choice.figure.name} ${check.success ? "passed" : "failed"} ${phase.label} (${check.total} vs DC ${phase.dc}).`;
    this.pushNews(living, {
      kind: this.missionNewsKind(mission.kind),
      text: phaseText,
      cell: mission.targetCell,
      stateId: province?.state
    });

    if (mission.phaseResults.length >= phases.length) {
      this.finalizeMission(living, guild, mission, party, province);
    }
  }

  /** Spend Stamina once per hero per mission, on the first phase they take. */
  private phaseStamina(
    living: LivingWorldState,
    guild: GuildState,
    mission: ActiveGuildMission,
    figure: HistoricalFigure,
    phase: MissionPhase
  ): number {
    mission.staminaByHero ??= {};
    const existing = mission.staminaByHero[figure.i];
    if (existing !== undefined) return 0;

    const state = this.ensureHeroGuildState(guild, figure);
    const maxSpend = figureLevel(figure.xp ?? 0) >= 5 ? 2 : 1;
    const reserve = STAMINA_RESERVE_MINIMUM[figureArchetype(figure).id];
    const expected = this.missionChance(living, guild, figure, phase);
    const autoPush =
      state.stamina > reserve && expected < 0.6 && (state.temperament.boldness >= 0.5 || guild.tier >= 3);
    const spent = state.push
      ? Math.min(maxSpend, state.stamina)
      : autoPush
        ? Math.min(maxSpend, Math.max(0, state.stamina - reserve))
        : 0;
    state.stamina -= spent;
    mission.staminaByHero[figure.i] = spent;
    return spent;
  }

  private finalizeMission(
    living: LivingWorldState,
    guild: GuildState,
    mission: ActiveGuildMission,
    party: readonly HistoricalFigure[],
    province: Province | undefined
  ): void {
    const index = guild.missions.findIndex(entry => entry.id === mission.id);
    if (index === -1) return;
    guild.missions.splice(index, 1);

    const results = mission.phaseResults ?? [];
    const successes = results.filter(result => result.success).length;
    const total = Math.max(1, mission.phases?.length ?? results.length);
    const outcome: MissionOutcome = successes === total ? "full" : successes * 2 >= total ? "partial" : "failed";
    mission.outcome = outcome;

    const pSim = mission.provinceId !== undefined ? living.provinces?.[mission.provinceId] : undefined;
    const sSim = province?.state ? living.states[province.state] : undefined;
    const leader = party[0]!;
    const text = this.applyMissionTargetEffect(living, guild, mission, outcome, leader, province, pSim);

    if (outcome !== "failed") {
      const multiplier = outcome === "full" ? 1 : 0.5;
      const carried = equippedRelic(guild.relics ?? [], leader.i);
      const vault = vaultBonuses(guild.relics ?? []);
      const paidGold = Math.round(
        mission.rewardGold * multiplier * (1 + 0.1 * (vault.w ?? 0)) * relicGoldMultiplier(carried)
      );
      const paidRenown = Math.round(mission.rewardRenown * multiplier * (1 + 0.1 * (vault.s ?? 0)));
      guild.gold += paidGold;
      guild.renown += paidRenown;

      for (const hero of party) {
        const heroRelic = equippedRelic(guild.relics ?? [], hero.i);
        const baseXp = mission.kind === "lair" ? 50 : mission.kind === "excavate" ? 30 : 25;
        const xp = Math.round(baseXp * multiplier * (1 + 0.1 * (vault.c ?? 0)) * relicXpMultiplier(heroRelic));
        hero.xp = (hero.xp ?? 0) + xp;
        applyHeroLevels(hero);
        this.ensureHeroGuildState(guild, hero);
        hero.cell = mission.targetCell;
      }

      this.pushNews(living, {
        kind: this.missionNewsKind(mission.kind),
        text: `${text}${mission.staminaSpent ? ` ${mission.staminaSpent} Stamina spent.` : ""} (${outcome}, +${paidGold}g, +${paidRenown} renown)`,
        cell: mission.targetCell,
        stateId: province?.state
      });
      this.pushHistory(
        "deed",
        [
          { kind: "figure", id: leader.i },
          ...(province?.state ? [{ kind: "state", id: province.state } as HistRef] : [])
        ],
        mission.targetCell,
        text
      );
    } else {
      const rng = this.rng("guild:failure", mission.id * 1000 + leader.i);
      const phaseById = new Map((mission.phases ?? []).map(phase => [phase.id, phase]));
      const fumbles: string[] = [];
      for (const hero of party) {
        const state = this.ensureHeroGuildState(guild, hero);
        state.resolve = Math.max(0, state.resolve - 2);
        if (state.resolve === 0) this.markHeroDown(living, state);
        guild.cooldowns[hero.i] = living.tick + rng.int(1, 2);

        const worst = results
          .filter(result => result.heroId === hero.i)
          .find(result => result.roll === 1 || result.total <= (phaseById.get(result.phaseId)?.dc ?? mission.dc) - 8);
        if (worst) {
          const phase = phaseById.get(worst.phaseId);
          const aftermath = this.fumbleAftermath(
            living,
            guild,
            hero,
            rng,
            { roll: worst.roll, total: worst.total, dc: phase?.dc ?? mission.dc, success: false },
            phase?.tags ?? mission.tags ?? [],
            equippedRelic(guild.relics ?? [], hero.i)
          );
          if (aftermath) fumbles.push(aftermath.trim());
        }
      }
      this.pushNews(living, {
        kind: this.missionNewsKind(mission.kind),
        text: `The ${mission.kind} expedition failed (${successes}/${total} phases). ${text} -2 Resolve to each survivor.${
          fumbles.length > 0 ? ` ${fumbles.join(" ")}` : ""
        }`,
        cell: mission.targetCell,
        stateId: province?.state
      });
    }

    if (sSim && province?.state) sSim.capacity = this.recomputeStateCapacity(province.state);
    this.syncGuildTier(living, guild);
  }

  private applyMissionTargetEffect(
    living: LivingWorldState,
    guild: GuildState,
    mission: ActiveGuildMission,
    outcome: MissionOutcome,
    leader: HistoricalFigure,
    province: Province | undefined,
    pSim: ProvinceSimState | undefined
  ): string {
    if (outcome === "failed") return `The ${mission.kind} target remains.`;
    const partial = outcome === "partial";

    switch (mission.kind) {
      case "trouble": {
        const trouble = pSim?.trouble;
        if (!pSim || !trouble) return "Nothing was left to resolve.";
        const def = getTroubleDef(trouble.id);
        trouble.level -= partial ? 1 : 2;
        if (trouble.level <= 0) {
          pSim.trouble = null;
          pSim.order = Math.min(100, pSim.order + (partial ? 5 : 10));
          pSim.stability += 1;
          return `${leader.name} quelled ${def.name} in ${province?.name ?? "the province"}.`;
        }
        return `${leader.name} broke ${def.name} in ${province?.name ?? "the province"} (reduced to level ${trouble.level}).`;
      }
      case "lair": {
        const lair =
          (mission.markerId !== undefined ? living.activeLairs?.[`lair:${mission.markerId}`] : undefined) ??
          pSim?.lair ??
          (living.activeLairs
            ? Object.values(living.activeLairs).find(entry => entry.provinceId === mission.provinceId)
            : undefined);
        if (!lair) return "Nothing was left to resolve.";
        if (partial) {
          lair.level = Math.max(1, lair.level - 1);
          return `${leader.name} weakened ${lair.name} in ${province?.name ?? "the wilderness"} (level ${lair.level}).`;
        }
        this.clearLair(lair, leader.name);
        this.relieveEschaton(living);
        return `${leader.name} purged ${lair.name} in ${province?.name ?? "the wilderness"}.`;
      }
      case "excavate": {
        const marker =
          mission.markerId !== undefined
            ? (pack.markers ?? []).find(entry => entry?.i === mission.markerId)
            : undefined;
        if (mission.markerId !== undefined && !guild.excavatedMarkers.includes(mission.markerId)) {
          guild.excavatedMarkers.push(mission.markerId);
        }
        this.recoverRelicsFromMarker(guild, mission.markerId, leader);
        if (partial) {
          return `${leader.name} excavated ${marker?.name ?? "a ruin site"} and recovered a cache of ${mission.rewardGold} gold.`;
        }
        if (mission.rewardRelic && marker) {
          const relic = this.mintRelicFromMarker(marker, mission.id, leader);
          return `${leader.name} excavated ${marker.name} and recovered ${relic.name}.`;
        }
        return `${leader.name} excavated ${marker?.name ?? "a ruin site"} and recovered ${mission.rewardGold} gold in relics.`;
      }
      case "pacify": {
        const burg = mission.burgId !== undefined ? pack.burgs[mission.burgId] : undefined;
        const bSim = mission.burgId !== undefined ? living.burgs[mission.burgId] : undefined;
        if (bSim) bSim.unrest = partial ? Math.floor(bSim.unrest / 2) : 0;
        return `${leader.name} ${partial ? "calmed" : "pacified"} ${burg?.name ?? "the burg"}.`;
      }
    }
  }

  private markHeroDown(living: LivingWorldState, state: HeroGuildState): void {
    state.resolve = 0;
    state.downUntilTick = Math.max(state.downUntilTick ?? 0, living.tick + 2);
  }

  private injuryForTags(tags: readonly MissionTag[], rng: Rng): HeroInjury["kind"] {
    if (tags.some(tag => tag === "combat" || tag === "lair")) return "wounded";
    if (tags.some(tag => tag === "social" || tag === "petition" || tag === "intrigue")) return "shaken";
    if (tags.some(tag => tag === "travel" || tag === "wild")) return "lost";
    return rng.choice(["wounded", "shaken", "lost"] as const);
  }

  /** Fumble aftermath: a DC 12 survival save decides between death, an injury or being downed. */
  private fumbleAftermath(
    living: LivingWorldState,
    guild: GuildState,
    figure: HistoricalFigure,
    rng: Rng,
    check: FigureCheck,
    tags: readonly MissionTag[],
    relic: HistoricalRelic | undefined
  ): string {
    const state = this.ensureHeroGuildState(guild, figure);
    const survived = rng.d(20) + relicSurvivalBonus(relic) >= 12;

    if (!survived) {
      if (state.resolve > 0 && check.roll !== 1) {
        this.markHeroDown(living, state);
        return ` ${figure.name} was downed by the ordeal.`;
      }

      const year = options.map?.lore?.calendar?.year ?? 1000;
      figure.death = year;
      for (const role of figure.roles) {
        if (role.to === undefined) role.to = year;
      }
      guild.roster = guild.roster.filter(id => id !== figure.i);
      for (const held of guild.relics ?? []) {
        if (held.holder.kind === "figure" && held.holder.id === figure.i) this.placeRelic(held, guild);
      }
      let aftermath = ` ${figure.name} did not survive the mission.`;

      if (guild.tier >= 2) {
        const protege = this.spawnProtege(living, figure);
        if (protege && guild.roster.length < maxHeroesForTier(guild.tier)) {
          guild.roster.push(protege.i);
          aftermath += ` ${protege.name} took up the Guild's colours.`;
        }
      }
      return aftermath;
    }

    const kind = this.injuryForTags(tags, rng);
    state.injuries.push({ kind, ...(kind === "lost" ? {} : { untilTick: living.tick + 2 }) });
    if (state.resolve === 0) this.markHeroDown(living, state);
    return ` The ordeal left ${figure.name} ${HERO_INJURY_LABELS[kind].toLowerCase()}.`;
  }

  private syncBurgs(living: LivingWorldState): void {
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
        existing.isMajor = isMajorBurg(burg);
      }
    }
  }

  private syncStates(living: LivingWorldState): void {
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
          capacity: emptyCapacityLedger(),
          claims: [],
          grudges: [],
          currentTechId: null,
          researchQueue: [],
          researchedTechs: [],
          researchedProgress: {},
          freeTechs: 0,
          yieldsPerTurn: emptyYields()
        };
      } else {
        existing.rulerId = rulerId;
        existing.currentTechId ??= null;
        existing.researchQueue ??= [];
        existing.researchedTechs ??= [];
        existing.researchedProgress ??= {};
        existing.freeTechs ??= 0;
        existing.yieldsPerTurn ??= emptyYields();
        existing.warTurns ??= {};
        existing.peaceTreatyTurns ??= {};
        existing.faith ??= 0;
        existing.prophetsEarned ??= 0;
      }
    }
  }

  private syncProvinces(living: LivingWorldState): void {
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
    if (sSim.capacity.s.load > sSim.capacity.s.gen) return true;
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

  private recomputeAllCapacities(living: LivingWorldState): void {
    for (const key of Object.keys(living.states)) {
      const stateId = Number(key);
      const sSim = living.states[stateId];
      if (sSim) {
        sSim.capacity = this.recomputeStateCapacity(stateId);
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
      burg => burg?.i && !burg.removed && burg.state === stateId && isMajorBurg(burg) && Boolean(living.burgs[burg.i])
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
  private updateWorkedCells(burg: Burg, bSim: BurgSimState, state: State, living: LivingWorldState): YieldValues {
    const citizens = Math.max(1, Math.floor(bSim.citizens ?? citizensFromPopulation(burg.population ?? 0)));
    bSim.citizens = citizens;

    const centerYields = getCellYields(burg.cell, state.i, living);
    if (centerYields.food < 2) centerYields.food = 2;

    const taken = new Set<number>();
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
      const yields = getCellYields(cell, state.i, living);
      for (const key of CIV_YIELD_KEYS) total[key] += yields[key];
    }
    for (const id of bSim.civBuildings ?? []) {
      const def = CIV_BUILDING_BY_ID[id];
      if (!def) continue;
      for (const key of CIV_YIELD_KEYS) total[key] += def.stats[key] ?? 0;
    }

    bSim.workedCells = worked;
    bSim.isMajor = true;
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
      const walls = CIV_BUILDING_BY_ID["walls"];
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
        owner.treasury = Number(owner.treasury ?? 0) + invested;
      }
    }
  }

  /** One seasonal OpenCiv tick for every owned Major Burg. */
  private stepCities(living: LivingWorldState): void {
    if (!this.hasCityTerrain()) return;
    living.worldWonders ??= {};
    let bordersChanged = false;

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

      const yields = this.updateWorkedCells(burg, bSim, state, living);
      bSim.cityYields = yields;

      const bonusProduction = this.applyFoodGrowth(burg, bSim, state, living, yields);
      if (this.applyBorderGrowth(burg, bSim, state, living, yields)) bordersChanged = true;
      this.applyProduction(burg, bSim, state, living, yields, bonusProduction);
    }

    if (bordersChanged && pack.cells.area) {
      try {
        States.collectStatistics();
      } catch {
        // Stripped test packs have no full statistics grid; borders still moved.
      }
    }
  }

  // -------------------------------------------------------------------------
  // Slice 4: OpenCiv empire rollup — Science, Gold, Happiness & Unravel.
  // -------------------------------------------------------------------------

  /** Empire-wide yields for every state: city totals, science multipliers, upkeep and maintenance. */
  private recomputeStateYields(state: State, living: LivingWorldState): YieldValues {
    const totals = emptyYields();
    let science = 0;
    let gold = 0;
    let maintenance = 0;

    for (const burg of this.majorBurgsOfState(state.i, living)) {
      const bSim = living.burgs[burg.i];
      if (!bSim) continue;
      const yields = bSim.cityYields ?? emptyYields();
      totals.food += yields.food;
      totals.production += yields.production;
      totals.culture += yields.culture;
      totals.faith += yields.faith;
      gold += yields.gold;
      science += this.citySciencePerTick(bSim);

      for (const id of bSim.civBuildings ?? []) {
        maintenance += CIV_BUILDING_BY_ID[id]?.maintenance ?? 0;
      }
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

    // Leased relic perks: charter boosts capital Gold, tome capital Science,
    // idol adds Faith/Culture. Regalia (Happiness/unravel) and weapon (combat)
    // are applied by the happiness and combat paths.
    const capitalSim = state.capital ? living.burgs[state.capital] : undefined;
    const charterShare = RELIC_YIELD_PERCENT / 100;
    if (capitalSim) {
      gold += Math.round((capitalSim.cityYields?.gold ?? 0) * charterShare * this.stateRelicCount(state.i, "charter"));
      science += this.citySciencePerTick(capitalSim) * charterShare * this.stateRelicCount(state.i, "tome");
    }
    totals.faith += IDOL_FAITH * this.stateRelicCount(state.i, "idol");
    totals.culture += IDOL_CULTURE * this.stateRelicCount(state.i, "idol");

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
    const leasedRelics = (living.guild?.relics ?? []).filter(
      relic => relic.holder.kind === "state" && relic.holder.id === state.i
    ).length;
    const relicTribute = leasedRelics * RELIC_LEASE_TRIBUTE;

    totals.science = Math.round(science * 100) / 100;
    totals.gold = Math.round((gold - maintenance - upkeep + relicTribute) * 100) / 100;
    // Empire Happiness is stored on `sSim.happiness` with its full breakdown.
    totals.happiness = 0;
    return totals;
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

  /** §7.2 Empire Happiness: base + luxuries + buildings/religion − cities − citizens − unrest. */
  private recomputeEmpireHappiness(state: State, sSim: StatePolitySim, living: LivingWorldState): void {
    const breakdown: HappinessBreakdown = {
      base: BASE_EMPIRE_HAPPINESS,
      luxuries: 0,
      buildings: 0,
      religion: 0,
      relics: REGALIA_HAPPINESS * this.stateRelicCount(state.i, "regalia"),
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

    sSim.happinessBreakdown = breakdown;
    sSim.happiness =
      breakdown.base +
      breakdown.luxuries +
      breakdown.buildings +
      breakdown.religion +
      breakdown.relics -
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
      if (!resource || resource.class !== "luxury") continue;

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
  }

  /** §7.1 Bank net Gold into the treasury; a negative balance disbands a regiment. */
  private applyTreasury(state: State, sSim: StatePolitySim, living: LivingWorldState): void {
    const goldPerTurn = sSim.yieldsPerTurn?.gold ?? 0;
    state.treasury = Math.round((Number(state.treasury ?? 0) + goldPerTurn) * 100) / 100;
    if (state.treasury < 0) this.settleDebt(state, living);
  }

  /** §7.1 Bankruptcy: reset the treasury and disband the newest block, not the whole regiment. */
  private settleDebt(state: State, living: LivingWorldState): void {
    state.treasury = 0;
    const military = state.military ?? [];
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
    delta -= 2 * this.stateRelicCount(sSim.stateId, "regalia");
    sSim.unravel = minmax(sSim.unravel + delta, 0, 100);
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
    if (Number(state.treasury ?? 0) < price + GOLD_PURCHASE_RESERVE) return false;

    state.treasury = Math.round((Number(state.treasury ?? 0) - price) * 100) / 100;
    if (bSim.productionProgress) delete bSim.productionProgress[key];
    bSim.productionQueue.shift();
    this.completeProductionItem(state, burg, bSim, item, living);
    return true;
  }

  // -------------------------------------------------------------------------
  // Slice 5: OpenCiv 1UPT tactical layer — units, combat, builders, settlers,
  // city sieges and Gold upgrades.
  // -------------------------------------------------------------------------

  private unitKey(stateId: number, regimentId: number): string {
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
   * Occupant registry: one combat army plus one utility regiment per state and
   * cell, never two states (living-openciv-armies.md §7.1). Army granularity is
   * the regiment, not the old 1UPT sim.
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
        army.movement = army.maxMovement;
        army.hasFought = false;
        const acted = this.stepArmyOrders(state, regiment, army, living, occupancy);
        army.stance = acted ? "march" : this.restStance(state, regiment, army);
        syncRegimentTotals(regiment, Military.getUnitTypes());
      }

      // Rich states upgrade one regiment per season.
      this.autoUpgrade(state, living);
    }

    this.replenishArmies(living);
    this.stepCityStrikes(living);
  }

  /** A resting army entrenches in a friendly city when badly hurt, otherwise fortifies. */
  private restStance(state: State, regiment: Regiment, army: ArmySimState): ArmyStance {
    const burgId = Number(pack.cells.burg?.[regiment.cell] ?? 0);
    const burg = burgId ? pack.burgs[burgId] : undefined;
    const inCity = Boolean(burg?.i && !burg.removed && burg.state === state.i);
    if (inCity && armyHp(regiment) < 0.6) return "encamp";
    return army.stance === "encamp" && inCity ? "encamp" : "fortify";
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
    const enemy = this.findEnemyArmyInRange(state.i, regiment.cell, regiment, living);
    if (enemy) {
      this.resolveArmyBattle(state, regiment, enemy.state, enemy.regiment, living);
      return true;
    }

    const target = this.tacticalTarget(state, living, regiment.cell);
    if (target === null) return false;
    return this.moveArmyToward(regiment, army, target, state.i, this.unitKey(state.i, regiment.i), occupancy);
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

  /** Closed borders: an army may only enter foreign land when at war. */
  private canEnterForeignCellFor(stateId: number, cell: number): boolean {
    const owner = pack.cells.state?.[cell] ?? 0;
    if (!owner || owner === stateId) return true;
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
  private findEnemyArmyInRange(
    stateId: number,
    cell: number,
    regiment: Regiment,
    living: LivingWorldState
  ): { state: State; regiment: Regiment } | null {
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
          return { state: other, regiment: enemy };
        }
      }
    }
    return null;
  }

  /**
   * Combined-arms battle through OpenConquest's battle.ts
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

  /** Battle modifiers from stance, terrain, river, walls and the lord multipliers. */
  private armyBattleModifiers(
    attackerState: State,
    attackerRegiment: Regiment,
    defenderState: State,
    defenderRegiment: Regiment
  ): BattleModifiers {
    const living = this.getState();
    const defenderArmy = living.armies?.[this.unitKey(defenderState.i, defenderRegiment.i)];

    const burgId = Number(pack.cells.burg?.[defenderRegiment.cell] ?? 0);
    const burg = burgId ? pack.burgs[burgId] : undefined;
    const walls = burg?.i && !burg.removed && burg.state === defenderState.i ? Number(burg.walls ?? 0) : 0;
    const attackerCrossedRiver =
      Number(pack.cells.r?.[attackerRegiment.cell] ?? 0) !== Number(pack.cells.r?.[defenderRegiment.cell] ?? 0) &&
      Number(pack.cells.r?.[defenderRegiment.cell] ?? 0) > 0;

    const relicMult = (stateId: number) =>
      this.stateRelicCount(stateId, "weapon") > 0 ? 1 + WEAPON_RELIC_COMBAT_PERCENT / 100 : 1;
    const attackerLordMult =
      happinessCombatMultiplier(living.states[attackerState.i]?.happiness) * relicMult(attackerState.i);
    const defenderLordMult =
      happinessCombatMultiplier(living.states[defenderState.i]?.happiness) * relicMult(defenderState.i);

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

      let target: { state: State; regiment: Regiment } | null = null;
      let targetHp = 2;
      const distances = this.cellHopDistances(burg.cell, 2);
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
              target = { state: other, regiment };
              targetHp = hp;
            }
          }
        }
      }
      if (!target) continue;

      const types = Military.getUnitTypes();
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
      if (armyIsEmpty(target.regiment)) this.removeRegiment(target.state, target.regiment, living);
    }
  }

  /** The cell a regiment should march toward this tick. */
  private tacticalTarget(state: State, living: LivingWorldState, fromCell: number): number | null {
    const agenda = living.states[state.i]?.agenda;
    const burgId = agenda?.targetBurgId;
    if (burgId !== undefined) {
      const burg = pack.burgs[burgId];
      if (burg?.i && !burg.removed) return burg.cell;
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
      this.captureCity(state, burg, living);
      if (army.cell !== burg.cell) {
        this.moveRegimentTo(army, burg.cell, state.i, key, this.armyOccupancy(living));
      }
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
      this.captureCity(state, burg, living);
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
    else this.retreatArmy(state, army, burg.cell, living);
    bSim.hp = Math.max(1, bSim.hp ?? 1);
    return false;
  }

  /** Public view of a burg's siege garrison (HUD / tests). */
  cityGarrison(burgId: number): ArmyBlock[] {
    const burg = pack.burgs[burgId];
    return burg?.i && !burg.removed ? this.cityGarrisonBlocks(burg) : [];
  }

  /** Modifiers for a city assault: walls, bracing garrison, terrain and lord multipliers. */
  private siegeModifiers(state: State, burg: Burg): BattleModifiers {
    const living = this.getState();
    const defenderId = burg.state ?? 0;
    const relicMult = (stateId: number) =>
      this.stateRelicCount(stateId, "weapon") > 0 ? 1 + WEAPON_RELIC_COMBAT_PERCENT / 100 : 1;
    const lord = (stateId: number) => happinessCombatMultiplier(living.states[stateId]?.happiness) * relicMult(stateId);
    const attackerLordMult = lord(state.i);
    const defenderLordMult = lord(defenderId);
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
  private captureCity(state: State, burg: Burg, living: LivingWorldState): void {
    const previousStateId = burg.state ?? 0;
    const wasCapital = Boolean(burg.capital);
    this.annexBurg(state.i, burg, true);
    this.logConquest(state, burg, true);

    const bSim = living.burgs[burg.i];
    if (!bSim) return;

    if (wasCapital) this.relocateCapital(previousStateId, burg);

    bSim.citizens = Math.max(1, Math.floor((bSim.citizens ?? 1) / 2));
    burg.population = populationFromCitizens(bSim.citizens);
    bSim.maxHp = CITY_BASE_HP;
    bSim.hp = 100;
    bSim.productionQueue = [];
    bSim.productionProgress = {};
    bSim.civBuildings = (bSim.civBuildings ?? []).filter(id => {
      const def = CIV_BUILDING_BY_ID[id];
      return !def?.nationalWonder && !def?.isWonder;
    });
    syncCivFlagsFromBuildings(burg, bSim.civBuildings);
    bSim.cityYields = undefined;
    bSim.unrest = 6 + bSim.citizens;

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
    regiment.units.push({ type: typeId, hp: 1, exp });
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
    return regiment;
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
      if (Number(state.treasury ?? 0) < cost) break;

      state.treasury = Math.round((Number(state.treasury ?? 0) - cost) * 100) / 100;
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
    if (Number(state.treasury ?? 0) < 50) return;
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
  }

  // -------------------------------------------------------------------------
  // Slice 6: dynamic religion pressure, beliefs, diplomacy timers and relic
  // perks.
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

  /** Closed borders: a unit may only enter foreign land at war or when it ignores borders. */
  private canEnterForeignCell(stateId: number, cell: number, unit: UnitSimState): boolean {
    const owner = pack.cells.state?.[cell] ?? 0;
    if (!owner || owner === stateId) return true;
    const def = CIV_CIVILIAN_BY_ID[unit.unitTypeId];
    if (def?.entersForeignLands) return true;
    return this.isAtWar(stateId, owner);
  }

  /** How many relics of a category are leased to this state. */
  private stateRelicCount(stateId: number, category: RelicCategory): number {
    const relics = pack.history?.living?.guild?.relics ?? [];
    return relics.filter(
      relic => relic.holder.kind === "state" && relic.holder.id === stateId && relic.category === category
    ).length;
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
      const lair = pSim?.lair;

      if (bSim.unrest <= 0 && !trouble && !lair) continue;

      if (trouble) {
        bSim.unrest = Math.max(trouble.level, bSim.unrest);
      }
      if (lair) {
        bSim.unrest = Math.max(lair.level, bSim.unrest);
      }

      restiveCountByState.set(burg.state, (restiveCountByState.get(burg.state) ?? 0) + 1);

      const agenda = living.states[ownerState.i]?.agenda;
      const pacifying = agenda?.kind === "pacify" && agenda.targetBurgId === burg.i;

      let decay = 1;
      const isGarrisoned = (ownerState.military ?? []).some(reg => reg.cell === burg.cell && reg.a > 0);
      if (isGarrisoned) decay += 1;
      if (bSim.buildings.some(id => id.startsWith("temple"))) decay += 1;
      if (pacifying) decay += 2;

      const floor = Math.max(trouble ? trouble.level : 0, lair ? lair.level : 0);
      bSim.unrest = Math.max(floor, bSim.unrest - decay);
      if (pacifying && bSim.unrest === 0) this.assimilateBurg(ownerState, burg, bSim);
    }

    // Apply seasonal unravel clock changes from unrest & stability balance
    for (const key of Object.keys(living.states)) {
      const sSim = living.states[Number(key)];
      if (!sSim) continue;

      const restiveCount = restiveCountByState.get(sSim.stateId) ?? 0;
      const sDeficit = sSim.capacity.s.load > sSim.capacity.s.gen;

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
    if (this.freeCapacity(sSim).w < capacityConfig.developWPerTurn) return false;

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
      turnsLeft: building.turns ?? 1,
      checks: { m: false, w: false, s: false },
      pityBonus: 0
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

    const regiment = choice.regiment ?? this.createRegiment(state);
    const unitTypes = Military.getUnitTypes();
    regiment.units ??= [];
    regiment.units.push({ type: choice.unit.id, hp: 1, exp: 0 });
    normalizeArmy(regiment, currentContent().config.military.maxUnitsPerArmy, unitTypes);
    syncRegimentTotals(regiment, unitTypes);
    const key = this.unitKey(state.i, regiment.i);
    const speed = armySpeed(regiment, unitTypes);
    const livingState = this.getState();
    livingState.armies ??= {};
    livingState.armies[key] ??= { movement: speed, maxMovement: speed, stance: "fortify", hasFought: false };
    if (choice.unit.troubleRole) this.commanderFor(state, regiment, choice.unit.troubleRole);

    const living = this.getState();
    const burg = pack.burgs[pack.cells.burg?.[regiment.cell] ?? 0];
    this.pushNews(living, {
      kind: "muster",
      text: `${state.name} mustered ${choice.unit.name} in ${burg?.name ?? "the field"}.`,
      cell: regiment.cell,
      stateId,
      burgId: burg?.i
    });
    return true;
  }

  /**
   * unified-figures slice 1: every specialist unit in the field serves under a
   * named commander figure. Backfills on init and each sync, and is what a
   * fresh muster calls; idempotent through `regiment.crew`.
   */
  ensureCommanders(): void {
    const unitTypes = Military.getUnitTypes();
    for (const state of pack.states) {
      if (!state?.i || state.removed || !state.military) continue;
      for (const regiment of state.military) {
        for (const unit of regiment.units ?? []) {
          const specialty = unitTypes[unit.type]?.troubleRole;
          if (!specialty) continue;
          this.commanderFor(state, regiment, specialty);
        }
      }
    }
  }

  /** The living commander figure for a regiment's specialty, minting one on first need. */
  private commanderFor(state: State, regiment: Regiment, specialty: TroubleUnitRole): number | undefined {
    if (specialty === "military") return undefined;
    const history = Chronicle.sync();
    history.figures ??= [];
    const figures = history.figures;
    regiment.crew ??= [];

    const crewed = regiment.crew.find(id => {
      const figure = figures[id];
      return figure && !figure.death && figure.roles.some(r => r.type === "specialist" && r.specialty === specialty);
    });
    if (crewed !== undefined) return crewed;

    // a commander of the same state and specialty may already serve elsewhere (a merged-away regiment)
    const existing = figures.find(
      figure =>
        !figure.death &&
        figure.roles.some(
          r =>
            r.type === "specialist" && r.specialty === specialty && r.target.kind === "state" && r.target.id === state.i
        )
    );
    if (existing) {
      regiment.crew.push(existing.i);
      return existing.i;
    }

    const index = figures.length;
    const culture = state.culture ?? 0;
    const year = options.map?.lore?.calendar?.year ?? 1000;
    const rng = traitsRng(this.getState().seed, "figure", index);
    const alignment = rollAlignment(rng, pack.cultures[culture]?.alignment);
    const { virtues, vices } = rollFigureTraits(rng, alignment);
    const skills = { m: 0, w: 0, s: 0, c: 0 };
    skills[UNIT_ROLE_POOLS[specialty]] = 1;
    const figure: HistoricalFigure = {
      i: index,
      name: Names.getCulture(culture),
      culture,
      birth: year - rng.int(25, 45),
      roles: [{ type: "specialist", specialty, target: { kind: "state", id: state.i }, from: year }],
      alignment,
      virtues,
      vices,
      cell: regiment.cell,
      xp: 0,
      skills
    };
    figures.push(figure);
    regiment.crew.push(figure.i);
    return figure.i;
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

  /** Send military or specialist units to quell a provincial trouble with a domain saving throw. */
  resolveTrouble(stateId: number, provinceId: number): boolean {
    const province = pack.provinces?.[provinceId];
    if (!province?.i || province.removed || province.state !== stateId) return false;
    const living = this.getState();
    const pSim = living.provinces[provinceId];
    if (!pSim?.trouble || pSim.lair) return false;

    const state = pack.states[stateId];
    const sSim = living.states[stateId];
    if (!state?.i || state.removed || !sSim) return false;

    const troubleDef = getTroubleDef(pSim.trouble.id);
    const unitTypes = Military.getUnitTypes();

    let bestUnit: ArmyBlock | null = null;
    let bestReg: Regiment | null = null;
    let bestMult = 3;
    let bestDisruption = 999;

    for (const reg of state.military ?? []) {
      for (const unit of reg.units ?? []) {
        if (unit.hp <= 0) continue;
        const uType = unitTypes[unit.type];
        const role: TroubleUnitRole = uType?.troubleRole ?? "military";
        const mult = troubleUnitMatchMultiplier(troubleDef, role);
        const dis = unit.disruption ?? 0;
        if (mult < bestMult || (mult === bestMult && dis < bestDisruption)) {
          bestMult = mult;
          bestDisruption = dis;
          bestUnit = unit;
          bestReg = reg;
        }
      }
    }

    // unified-figures slice 2: when the state fields a matching specialist, its
    // named commander leads the attempt and the roll carries the person.
    const history = Chronicle.sync();
    history.figures ??= [];
    const figures = history.figures;
    const commander = bestReg?.crew
      ?.map(id => figures[id])
      .find(
        f => f && !f.death && f.roles.some(r => r.type === "specialist" && r.specialty === troubleDef.requiredRole)
      );

    const rng = this.rng("trouble:resolve", provinceId, living.tick);
    const roll = rng.d(20);
    const poolGen = sSim.capacity[troubleDef.pool]?.gen ?? 0;
    const domainMod = valueModifier(poolGen);
    const skillBonus = commander?.skills?.[troubleDef.pool] ?? 0;
    const traitBonus = commander ? (commander.virtues?.length ?? 0) - (commander.vices?.length ?? 0) : 0;
    const unitDisruption = bestUnit?.disruption ?? 0;
    const total = roll + skillBonus + domainMod + traitBonus - unitDisruption;
    const dc = 16 + bestMult * pSim.trouble.level;
    const year = options.map?.lore?.calendar?.year ?? 1000;
    const cell = province.center ?? state.center;

    const success = total >= dc;
    if (success) {
      const reduction = rng.d(4);
      pSim.trouble.level -= reduction;
      if (pSim.trouble.level <= 0) {
        pSim.trouble = null;
        pSim.order = Math.min(100, pSim.order + 10);
        pSim.stability += 1;
        if (commander) {
          commander.xp = (commander.xp ?? 0) + 25;
          this.pushNews(living, {
            kind: "trouble",
            text: `${commander.name} overcame ${troubleDef.name} in ${province.name}!`,
            cell,
            stateId
          });
          this.pushHistory(
            "deed",
            [
              { kind: "figure", id: commander.i },
              { kind: "state", id: stateId }
            ],
            cell,
            `${commander.name} eliminated the ${troubleDef.name} affliction in ${province.name}.`
          );
        } else {
          this.pushNews(living, {
            kind: "trouble",
            text: `${state.name} overcame ${troubleDef.name} in ${province.name}!`,
            cell,
            stateId
          });
          this.pushHistory(
            "conquest",
            [{ kind: "state", id: stateId }],
            cell,
            `${state.name} eliminated the ${troubleDef.name} affliction in ${province.name}.`
          );
        }
      } else {
        if (commander) commander.xp = (commander.xp ?? 0) + 10;
        const who = commander ? commander.name : state.name;
        this.pushNews(living, {
          kind: "trouble",
          text: `${who} quelled ${troubleDef.name} in ${province.name} (reduced to level ${pSim.trouble.level}).`,
          cell,
          stateId
        });
      }
    } else {
      if (bestUnit) {
        bestUnit.disruption = Math.min(3, (bestUnit.disruption ?? 0) + 1);
      }
      // unified-figures: a disastrous attempt (≤ dc − 6) breaks or slays the commander
      let aftermath = "";
      if (commander && total <= dc - 6) {
        if (rng.d(2) === 1) {
          commander.death = year;
          for (const role of commander.roles) if (role.to === undefined) role.to = year;
          if (bestReg?.crew) bestReg.crew = bestReg.crew.filter(id => id !== commander.i);
          aftermath = ` ${commander.name} did not survive the attempt.`;
        } else {
          const vice = drawVice(rng, commander);
          if (vice) {
            commander.vices ??= [];
            commander.vices.push(vice);
            aftermath = ` The struggle left ${commander.name} ${vice}.`;
          }
        }
      }
      const who = commander ? `${commander.name}'s attempt` : `${state.name}'s attempt`;
      this.pushNews(living, {
        kind: "trouble",
        text: `${who} to resolve ${troubleDef.name} in ${province.name} failed (rolled ${total} vs DC ${dc}).${aftermath}`,
        cell,
        stateId
      });

      if (
        pSim.trouble &&
        isTroubleStatePromotable(pSim.trouble.id) &&
        pSim.trouble.level >= 6 &&
        pSim.order <= 30 &&
        (roll === 1 || total <= dc - 10)
      ) {
        this.promoteTroubleToState(provinceId);
      }
    }

    sSim.capacity = this.recomputeStateCapacity(stateId);
    return success;
  }

  /** Spawn a trouble in a province. If troubleId/theme/level are omitted, rolls them procedurally. */
  spawnTrouble(provinceId: number, troubleId?: string, theme?: TroubleTheme, level?: number): ProvinceTrouble | null {
    const province = pack.provinces?.[provinceId];
    if (!province?.i || province.removed) return null;
    const living = this.getState();
    const pSim = living.provinces[provinceId];
    if (!pSim) return null;

    const rng = this.rng("trouble:spawn", provinceId, living.tick);

    let finalTheme = theme;
    if (!finalTheme) {
      const provCells = this.provinceCells(provinceId);
      const hasBurg = pack.burgs.some(b => b?.i && !b.removed && pack.cells.province?.[b.cell] === provinceId);
      const hasRuin = (pack.markers ?? []).some(
        m =>
          !m.hidden &&
          m.cell &&
          provCells.includes(m.cell) &&
          ["ruins", "cave", "dungeon", "battlefields", "volcano"].includes(m.type)
      );
      const hasResource = provCells.some(c => Boolean(pack.cells.good?.[c]));

      const candidates: TroubleTheme[] = [];
      if (hasBurg) candidates.push("burg", "burg");
      if (hasRuin) candidates.push("ruin", "ruin");
      if (hasResource) candidates.push("resource", "resource");
      if (candidates.length === 0) candidates.push("burg");
      finalTheme = rng.choice(candidates) ?? "burg";
    }

    let finalTroubleId = troubleId;
    if (!finalTroubleId) {
      const table =
        finalTheme === "burg" ? BURG_TROUBLE_IDS : finalTheme === "ruin" ? RUIN_TROUBLE_IDS : RESOURCE_TROUBLE_IDS;
      finalTroubleId = rng.choice(table) ?? "monsters";
    }

    const finalLevel = minmax(level ?? rng.d(4) + 1, 1, 10);
    const tDef = getTroubleDef(finalTroubleId);
    const cell = province.center ?? pack.states[province.state]?.center ?? 0;
    pSim.trouble = {
      id: finalTroubleId,
      name: tDef.name,
      theme: finalTheme,
      pool: tDef.pool,
      save: tDef.save,
      requiredRole: tDef.requiredRole,
      level: finalLevel,
      seasonsUnchecked: 0,
      cell
    };

    if (province.state && living.states[province.state]) {
      living.states[province.state].capacity = this.recomputeStateCapacity(province.state);
    }

    this.pushNews(living, {
      kind: "trouble",
      text: `${tDef.name} arose in ${province.name}! (${finalTheme} trouble, level ${finalLevel})`,
      cell,
      stateId: province.state
    });

    return pSim.trouble ?? null;
  }

  /** God-mode / debug helper: clears trouble from a province. */
  quellTrouble(provinceId: number): boolean {
    const province = pack.provinces?.[provinceId];
    if (!province?.i || province.removed) return false;
    const living = this.getState();
    const pSim = living.provinces[provinceId];
    if (!pSim?.trouble) return false;

    pSim.trouble = null;
    if (province.state && living.states[province.state]) {
      living.states[province.state].capacity = this.recomputeStateCapacity(province.state);
    }
    this.pushNews(living, {
      kind: "trouble",
      text: `Trouble in ${province.name} was quelled.`,
      cell: province.center ?? 0,
      stateId: province.state
    });
    return true;
  }

  /** Send the state's field army to storm and destroy a provincial lair. */
  assaultLair(stateId: number, provinceId: number): boolean {
    const province = pack.provinces?.[provinceId];
    if (!province?.i || province.removed || province.state !== stateId) return false;
    const living = this.getState();
    const pSim = living.provinces[provinceId];
    if (!pSim?.lair) return false;

    const state = pack.states[stateId];
    const sSim = living.states[stateId];
    if (!state?.i || state.removed || !sSim) return false;

    const army = this.fieldArmy(state);
    if (!army) return false;

    const lair = pSim.lair;
    const { config } = currentContent();
    const attackerUnits = toBattleUnitsMen(army.units ?? [], Military.getUnitTypes());
    const defenderUnits = lair.defenders.filter(u => u.count > 0).map(u => ({ ...u }));

    if (attackerUnits.length === 0) return false;

    const session = initBattleSession({
      config,
      unitTypes: Military.getUnitTypes(),
      attacker: { factionId: stateId, armyId: null, units: attackerUnits },
      defender: { factionId: 0, armyId: null, units: defenderUnits },
      cell: lair.cell,
      regionId: provinceId,
      assault: lair.fortified,
      modifiers: {
        walls: lair.fortified ? 1 : 0,
        defenderEncamped: lair.fortified,
        defenderAmbushed: false,
        attackerCrossedRiver: false,
        labels: [lair.fortified ? `${lair.name} (fortified walls)` : lair.name]
      }
    });

    const rng = this.rng("lair:assault", stateId * 1000 + provinceId, living.tick);
    while (session.status === "active" && session.round < config.battle.maxRounds) {
      stepBattleRound(session, rng.next);
    }
    const outcome = finalizeBattle(session, rng.next);

    this.applyArmySurvivors(state, army, outcome.attacker.units);
    this.addBattleMarker(lair.cell, lair.name);

    if (outcome.winner === "attacker") {
      const lairName = lair.name;
      this.clearLair(lair, state.name);
      sSim.warExhaustion = Math.max(0, sSim.warExhaustion - 2);
      sSim.capacity = this.recomputeStateCapacity(stateId);
      this.relieveEschaton(living);

      this.pushNews(living, {
        kind: "lair",
        text: `${state.name}'s army conquered and destroyed ${lairName} in ${province.name}!`,
        cell: lair.cell,
        stateId
      });
      this.pushHistory(
        "conquest",
        [{ kind: "state", id: stateId }],
        lair.cell,
        `${state.name}'s legions conquered and dismantled the ${lairName} in ${province.name}.`
      );
      return true;
    }

    // Defenders repulsed the assault: surviving defenders persist for attrition
    lair.defenders = outcome.defender.units.filter(u => u.count > 0).map(u => ({ ...u }));
    if (lair.defenders.length === 0) {
      const lairName = lair.name;
      this.clearLair(lair, state.name);
      sSim.capacity = this.recomputeStateCapacity(stateId);
      this.pushNews(living, {
        kind: "lair",
        text: `${state.name}'s army destroyed ${lairName} in ${province.name} at immense cost!`,
        cell: lair.cell,
        stateId
      });
      return true;
    }

    for (const u of army.units ?? []) {
      u.disruption = Math.min(3, (u.disruption ?? 0) + 1);
    }
    sSim.warExhaustion = Math.min(100, sSim.warExhaustion + 4);

    this.pushNews(living, {
      kind: "lair",
      text: `${state.name}'s assault on ${lair.name} was repulsed with heavy losses!`,
      cell: lair.cell,
      stateId
    });
    this.pushHistory(
      "battle",
      [{ kind: "state", id: stateId }],
      lair.cell,
      `${state.name}'s expedition against ${lair.name} was repulsed.`
    );
    return false;
  }

  /** Dispatch an adventuring band to execute a decapitation delve into a lair. */
  sendAdventurersToLair(stateId: number, provinceId: number): boolean {
    const province = pack.provinces?.[provinceId];
    if (!province?.i || province.removed || province.state !== stateId) return false;
    const living = this.getState();
    const pSim = living.provinces[provinceId];
    if (!pSim?.lair) return false;

    const state = pack.states[stateId];
    const sSim = living.states[stateId];
    if (!state?.i || state.removed || !sSim) return false;

    const lair = pSim.lair;
    const history = Chronicle.sync();
    history.figures ??= [];

    let adventurer = history.figures.find(
      f =>
        !f.death && f.roles.some(r => r.type === "adventurer" && r.target.kind === "state" && r.target.id === stateId)
    );

    const year = options.map?.lore?.calendar?.year ?? 1000;
    if (!adventurer) {
      const culture = state.culture ?? 0;
      const index = history.figures.length;
      const rng = traitsRng(living.seed, "adventurer", index + state.i * 500);
      const alignment = rollAlignment(rng, pack.cultures[culture]?.alignment);
      const { virtues, vices } = rollFigureTraits(rng, alignment);
      adventurer = {
        i: index,
        name: Names.getCulture(culture),
        culture,
        birth: year - rng.int(22, 40),
        roles: [{ type: "adventurer", target: { kind: "state", id: state.i }, from: year }],
        alignment,
        virtues,
        vices
      };
      history.figures.push(adventurer);
    }

    const domainMod = valueModifier(Math.max(sSim.capacity.w.gen, sSim.capacity.c.gen));
    const traitBonus = (adventurer.virtues?.length ?? 0) - (adventurer.vices?.length ?? 0);
    const rng = this.rng("adventurer:delve", stateId * 500 + provinceId, living.tick);
    const roll = rng.d(20);
    const total = roll + domainMod + traitBonus;
    const dc = 14 + lair.level;

    if (total >= dc) {
      // Full Success: decapitation strike slays the lair master
      this.removeLairMarker(lair.markerId);
      const lairName = lair.name;
      pSim.lair = null;
      pSim.order = Math.min(100, pSim.order + 12);
      pSim.stability += 1;
      sSim.capacity = this.recomputeStateCapacity(stateId);
      this.relieveEschaton(living);

      this.pushNews(living, {
        kind: "lair",
        text: `${adventurer.name} and their adventuring band purged ${lairName} in ${province.name}!`,
        cell: lair.cell,
        stateId
      });
      this.pushHistory(
        "conquest",
        [
          { kind: "figure", id: adventurer.i },
          { kind: "state", id: stateId }
        ],
        lair.cell,
        `${adventurer.name} and their adventuring band slew the master of ${lairName} in ${province.name}.`
      );
      return true;
    }

    if (total >= dc - 3) {
      // Partial Success / Near Miss: thinned defenders and retreated
      for (const u of lair.defenders) {
        u.count = Math.max(1, Math.round(u.count * (0.5 + rng.next() * 0.25)));
      }
      lair.level = Math.max(4, lair.level - 1);
      sSim.capacity = this.recomputeStateCapacity(stateId);

      this.pushNews(living, {
        kind: "lair",
        text: `${adventurer.name}'s band struck deep into ${lair.name}, culling defenders before withdrawing (reduced to level ${lair.level}).`,
        cell: lair.cell,
        stateId
      });
      return false;
    }

    // Failure: disastrous delve, potential death, triggers retaliatory raid
    if (rng.d(2) === 1) {
      adventurer.death = year;
      for (const role of adventurer.roles) {
        if (role.type === "adventurer" && role.to === undefined) role.to = year;
      }
    }
    lair.raidPending = true;

    this.pushNews(living, {
      kind: "lair",
      text: `${adventurer.name}'s delve into ${lair.name} failed disastrously!`,
      cell: lair.cell,
      stateId
    });
    return false;
  }

  /** Metastasize an active trouble into a full lair stronghold. */
  metastasizeTroubleToLair(provinceId: number, lairId?: string): ProvinceLair | null {
    const province = pack.provinces?.[provinceId];
    if (!province?.i || province.removed) return null;
    const living = this.getState();
    const pSim = living.provinces[provinceId];
    if (!pSim) return null;
    if (!pSim.trouble && !lairId) return null;

    const trouble = pSim.trouble;
    const rng = this.rng("lair:metastasize", provinceId, living.tick);
    const chosenLairId = lairId ?? (trouble ? pickLairForTrouble(trouble.id, rng) : LAIR_NATURE_IDS[0]!);
    const originCell = trouble?.cell ?? province.center ?? pack.states[province.state]?.center ?? 0;
    const level = Math.max(3, Math.ceil((trouble?.level ?? 3) / 2));
    const theme = trouble?.theme ?? "ruin";

    const lair = createProvinceLair(chosenLairId, originCell, level, theme, trouble?.burgId, Military.getUnitTypes());
    const markerId = this.addLairMarker(lair, originCell);
    this.registerActiveLair(lair, markerId, provinceId);

    pSim.lair = lair;
    pSim.trouble = null;

    if (province.state) {
      const sSim = living.states[province.state];
      if (sSim) {
        if (sSim.agenda?.kind === "resolve_trouble" && sSim.agenda.targetProvinceId === provinceId) {
          sSim.agenda = null;
        }
        sSim.capacity = this.recomputeStateCapacity(province.state);
      }
    }

    const lairDef = getLairDef(chosenLairId);
    this.pushNews(living, {
      kind: "lair",
      text: `Unchecked trouble in ${province.name} has festered into a ${lairDef.name}!`,
      cell: originCell,
      stateId: province.state
    });
    this.pushHistory(
      "collapse",
      [{ kind: "state", id: province.state }],
      originCell,
      `A ${lairDef.name} took root in ${province.name}, defying lawful authority.`
    );

    return lair;
  }

  /** Directly spawn a lair in a province. */
  spawnLair(provinceId: number, lairId?: string, level?: number, cell?: number): ProvinceLair | null {
    const province = pack.provinces?.[provinceId];
    if (!province?.i || province.removed) return null;
    const living = this.getState();
    const pSim = living.provinces[provinceId];
    if (!pSim) return null;

    const rng = this.rng("lair:spawn", provinceId, living.tick);
    const chosenLairId = lairId ?? rng.choice(LAIR_NATURE_IDS) ?? "ancient_evil";
    const originCell = cell ?? province.center ?? pack.states[province.state]?.center ?? 0;
    const finalLevel = minmax(level ?? 4 + rng.d(4), 4, 10);

    const lair = createProvinceLair(chosenLairId, originCell, finalLevel, "ruin", undefined, Military.getUnitTypes());
    const markerId = this.addLairMarker(lair, originCell);
    this.registerActiveLair(lair, markerId, provinceId);

    if (pSim.lair) {
      this.removeLairMarker(pSim.lair.markerId);
    }
    pSim.lair = lair;
    pSim.trouble = null;

    if (province.state && living.states[province.state]) {
      living.states[province.state].capacity = this.recomputeStateCapacity(province.state);
    }

    const lairDef = getLairDef(chosenLairId);
    this.pushNews(living, {
      kind: "lair",
      text: `A ${lairDef.name} arose in ${province.name}! (Lair level ${finalLevel})`,
      cell: originCell,
      stateId: province.state
    });

    return lair;
  }

  /** God-mode / cleanup helper: destroys a lair from a province. */
  smiteLair(provinceId: number): boolean {
    const province = pack.provinces?.[provinceId];
    if (!province?.i || province.removed) return false;
    const living = this.getState();
    const pSim = living.provinces[provinceId];
    if (!pSim?.lair) return false;

    this.removeLairMarker(pSim.lair.markerId);
    const lairName = pSim.lair.name;
    pSim.lair = null;

    if (province.state && living.states[province.state]) {
      living.states[province.state].capacity = this.recomputeStateCapacity(province.state);
    }

    this.pushNews(living, {
      kind: "lair",
      text: `The ${lairName} in ${province.name} was destroyed.`,
      cell: province.center ?? 0,
      stateId: province.state
    });
    return true;
  }

  /** Promote an eligible provincial trouble directly into an emergent sovereign state. */
  promoteTroubleToState(provinceId: number, burgId?: number): number | null {
    const province = pack.provinces?.[provinceId];
    if (!province?.i || province.removed) return null;
    const living = this.getState();
    const pSim = living.provinces[provinceId];
    const trouble = pSim?.trouble;
    if (!trouble || !isTroubleStatePromotable(trouble.id)) return null;

    const tDef = getTroubleDef(trouble.id);
    const lairDef = getLairDef(tDef.stateLairId ?? "aspiring_warlord");
    const unitTypes = Military.getUnitTypes();
    const scale = Math.max(1, Math.min(2, Math.round(trouble.level / 5)));
    const templates = lairDef.defenderUnits.map(t => ({ ...t, count: Math.max(1, Math.round(t.count * scale)) }));
    const units = instantiateLairUnits(templates, unitTypes);
    const originCell = trouble.cell || province.center || pack.states[province.state]?.center || 0;

    return this.spawnEmergentState({
      province,
      pSim,
      living,
      originKind: "trouble",
      originName: trouble.name,
      originCell,
      requestedBurgId: burgId ?? trouble.burgId,
      rosterId: lairDef.stateRosterId,
      stateForm: tDef.stateForm ?? lairDef.stateForm,
      alignment: lairDef.defaultAlignment,
      units
    });
  }

  /** Ascend an ambitious faction into an emergent sovereign state. */
  ascendFactionToState(factionId: number, targetBurgId?: number): number | null {
    const faction = pack.factions?.[factionId];
    if (!faction || faction.removed) return null;

    const living = this.getState();
    const targetBurg = targetBurgId
      ? pack.burgs?.[targetBurgId]
      : faction.hq.burgId
        ? pack.burgs?.[faction.hq.burgId]
        : undefined;
    const targetCell = targetBurg?.cell ?? faction.hq.cell;
    const provinceId = faction.hq.provinceId ?? pack.cells?.province?.[targetCell] ?? 0;
    const province = provinceId ? pack.provinces?.[provinceId] : undefined;
    const pSim = provinceId ? living.provinces?.[provinceId] : undefined;

    const _unitTypes = Military.getUnitTypes();
    const units: ArmyUnit[] = [];
    for (const reg of faction.military ?? []) {
      for (const [uType, count] of Object.entries(reg.u ?? {})) {
        units.push({ type: uType as UnitType, count });
      }
    }
    if (units.length === 0) {
      units.push({ type: "spear", count: 60 }, { type: "archers", count: 40 });
    }

    const dummyProv = {
      i: provinceId,
      name: "Frontier",
      state: targetBurg?.state ?? 0,
      center: targetCell
    } as Province;
    const dummyPSim = { order: 50, stability: 1 } as ProvinceSimState;

    const newStateId = this.spawnEmergentState({
      province: province ?? dummyProv,
      pSim: pSim ?? dummyPSim,
      living,
      originKind: "faction",
      originName: faction.name,
      originCell: targetCell,
      requestedBurgId: targetBurg?.i,
      markerId: faction.hq.markerId,
      rosterId: faction.stateRosterId,
      stateForm: faction.stateForm,
      alignment: faction.alignment,
      units
    });

    if (newStateId !== null) {
      const newState = pack.states?.[newStateId];
      if (newState) {
        newState.name = faction.name;
        newState.formName = faction.stateForm;
        newState.fullName = faction.stateForm ? `${faction.stateForm} of ${newState.name}` : faction.name;
        newState.color = faction.color;
        newState.treasury = faction.treasury;
        newState.researchedTechs = [...faction.researchedTechs];
        newState.military = [...(faction.military ?? [])];

        if (faction.leaderId) {
          const sSim = living.states?.[newStateId];
          if (sSim) sSim.rulerId = faction.leaderId;
        }
      }

      faction.allegiance = "state_arm";
      faction.patronStateId = newStateId;
      faction.sovereignAmbition = false;
      faction.stateRelations[newStateId] = "Ally";
      Factions.recomputeScale(faction);

      this.pushNews(living, {
        kind: "faction",
        text: `${faction.name} has proclaimed sovereign independence, founding ${newState?.fullName ?? "a new realm"}!`,
        cell: targetCell,
        stateId: newStateId,
        burgId: targetBurg?.i
      });
    }

    return newStateId;
  }

  /** Ascend an eligible entrenched lair into an emergent sovereign state. */
  ascendLairToState(provinceId: number, burgId?: number): number | null {
    const province = pack.provinces?.[provinceId];
    if (!province?.i || province.removed) return null;
    const living = this.getState();
    const pSim = living.provinces[provinceId];
    const lair = pSim?.lair;
    if (!lair || !isLairStateCapable(lair.id)) return null;

    const lairDef = getLairDef(lair.id);
    const unitTypes = Military.getUnitTypes();
    let units = [...lair.defenders, ...lair.raidUnits].filter(u => u.count > 0).map(u => ({ ...u }));
    if (units.length === 0) {
      units = instantiateLairUnits(lairDef.defenderUnits, unitTypes);
    }
    const originCell = lair.cell || province.center || pack.states[province.state]?.center || 0;

    const stateId = this.spawnEmergentState({
      province,
      pSim,
      living,
      originKind: "lair",
      originName: lair.name,
      originCell,
      requestedBurgId: burgId ?? lair.burgId,
      markerId: lair.markerId,
      rosterId: lairDef.stateRosterId,
      stateForm: lairDef.stateForm,
      alignment: lairDef.defaultAlignment,
      units
    });

    if (stateId !== null) {
      const faction = pack.factions?.find(
        f => f && f.i > 0 && !f.removed && lair.markerId !== undefined && f.hq?.markerId === lair.markerId
      );
      if (faction) {
        faction.allegiance = "state_arm";
        faction.patronStateId = stateId;
        faction.sovereignAmbition = false;
        faction.stateRelations[stateId] = "Ally";
        Factions.recomputeScale(faction);
      }
    }

    return stateId;
  }

  private spawnEmergentState(opts: {
    province: Province;
    pSim: ProvinceSimState;
    living: LivingWorldState;
    originKind: "trouble" | "lair" | "faction";
    originName: string;
    originCell: number;
    requestedBurgId?: number;
    markerId?: number;
    rosterId?: string;
    stateForm?: string;
    alignment?: Alignment;
    units: ArmyUnit[];
  }): number | null {
    const { province, pSim, living, originKind, originName, originCell, requestedBurgId, markerId } = opts;
    const oldOwnerId = province.state ?? 0;
    const oldOwner = oldOwnerId ? pack.states[oldOwnerId] : undefined;
    const rng = this.rng(`emergent:${originKind}`, province.i, living.tick);

    const capital = this.resolveEmergentCapital(province, originKind, originCell, rng, requestedBurgId);
    if (!capital) return null;

    const culture =
      capital.culture ?? pack.cells.culture?.[capital.cell] ?? oldOwner?.culture ?? pack.states[1]?.culture ?? 0;
    const baseName = Names.getState(capital.name ?? Names.getCulture(culture), culture);
    const fullName = opts.stateForm ? `${opts.stateForm} of ${capital.name ?? baseName}` : baseName;

    const { content } = currentContent();
    const availableRosters = new Set(Object.keys(content.rosters));
    const resolvedRosterId =
      opts.rosterId && opts.rosterId !== "local" && availableRosters.has(opts.rosterId)
        ? opts.rosterId
        : assignStateRoster({ culture, type: "Generic" }, pack.cultures);

    const newStateId = pack.states.length;
    const relations: string[] = [];
    for (const other of pack.states) {
      if (!other) continue;
      if (!other.i || other.removed) {
        relations[other.i] = "x";
        continue;
      }
      const relation = other.i === oldOwnerId ? "Enemy" : "Neutral";
      other.diplomacy ??= [];
      other.diplomacy[newStateId] = relation;
      relations[other.i] = relation;
    }
    relations[newStateId] = "x";

    const color = this.emergentStateColor(opts.rosterId, opts.alignment, oldOwner?.color);
    const newState: State = {
      i: newStateId,
      name: baseName,
      formName: opts.stateForm,
      fullName,
      diplomacy: relations,
      provinces: [],
      color,
      expansionism: 0.8,
      capital: capital.i,
      type: "Generic",
      center: capital.cell,
      culture,
      rosterId: resolvedRosterId,
      military: [],
      coa: oldOwner?.coa ?? ({} as State["coa"]),
      salesTax: oldOwner?.salesTax ?? 0,
      pollTax: oldOwner?.pollTax ?? 0,
      treasury: 150
    };
    pack.states.push(newState);
    capital.capital = 1;
    capital.state = newStateId;

    const territoryCells = this.emergentTerritoryCells(province, capital, oldOwnerId);
    this.transferCells(newStateId, territoryCells);
    capital.state = newStateId;

    // Ensure the province transfers cleanly if its center or non-capital cells were seized
    const oldCapitalCell = oldOwner?.capital ? pack.burgs[oldOwner.capital]?.cell : oldOwner?.center;
    const provinceCells = this.provinceCells(province.i);
    const holdsOldCapital = oldCapitalCell !== undefined && provinceCells.includes(oldCapitalCell);
    if (!holdsOldCapital) {
      if (oldOwner?.provinces) {
        oldOwner.provinces = oldOwner.provinces.filter(id => id !== province.i);
      }
      province.state = newStateId;
      province.burg = capital.i;
      province.center = capital.cell;
      if (!newState.provinces?.includes(province.i)) {
        newState.provinces = [...(newState.provinces ?? []), province.i];
      }
      for (const c of territoryCells) {
        if (pack.cells.province) pack.cells.province[c] = province.i;
      }
    } else {
      this.assignProvince(newStateId, territoryCells);
    }

    if (markerId !== undefined) {
      this.removeLairMarker(markerId);
    }

    pSim.trouble = null;
    pSim.lair = null;
    pSim.order = 75;
    pSim.stability = 3;

    const ruler = this.spawnEmergentRuler(newState, living, opts.alignment);

    // Sync world burgs/provinces/states and scaffold capital infrastructure
    this.syncBurgs(living);
    this.syncProvinces(living);
    this.syncStates(living);

    const bSim = living.burgs[capital.i];
    if (bSim) {
      bSim.unrest = 0;
      bSim.conqueredBy = undefined;
      const scaffold = ["walls2", "barracks1", "market1", "temple1"];
      const bSet = new Set(bSim.buildings);
      bSet.delete("walls1");
      for (const bid of scaffold) bSet.add(bid);
      bSim.buildings = Array.from(bSet);
      syncBurgFlagsFromBuildings(capital, bSim.buildings);
    }

    const sSim = living.states[newStateId];
    if (sSim) {
      sSim.rulerId = ruler.i;
      sSim.unravel = 0;
      sSim.warExhaustion = 0;
    }

    // Clear stale agendas on former owner targeting this province
    if (oldOwnerId && living.states[oldOwnerId]) {
      const oldSim = living.states[oldOwnerId]!;
      const kind = oldSim.agenda?.kind;
      if (
        (kind === "resolve_trouble" || kind === "clear_lair" || kind === "hire_adventurers") &&
        oldSim.agenda?.targetProvinceId === province.i
      ) {
        oldSim.agenda = null;
      }
    }

    // Form 1st Regiment at capital and trim excess blocks to guarantee capacity viability
    const unitTypes = Military.getUnitTypes();
    const regiment = this.createRegiment(newState);
    regiment.name = `1st Host of ${newState.name}`;
    this.moveArmy(regiment, capital);
    regiment.units = fromBattleUnitsMen(opts.units, unitTypes);
    syncRegimentTotals(regiment, unitTypes);
    this.ensureCommanders();

    let capacity = this.recomputeStateCapacity(newStateId);
    while (
      (capacity.m.load > capacity.m.gen || capacity.w.load > capacity.w.gen || capacity.s.load > capacity.s.gen) &&
      regiment.units &&
      regiment.units.length > 1
    ) {
      regiment.units.pop();
      syncRegimentTotals(regiment, unitTypes);
      capacity = this.recomputeStateCapacity(newStateId);
    }
    if (sSim) sSim.capacity = capacity;
    if (oldOwnerId && living.states[oldOwnerId]) {
      living.states[oldOwnerId]!.capacity = this.recomputeStateCapacity(oldOwnerId);
    }

    // Claims and mutual high-weight grudges with the former sovereign
    if (oldOwnerId && oldOwner && !oldOwner.removed) {
      this.recordClaim(oldOwnerId, capital, newStateId);
      this.recordGrudge(
        oldOwnerId,
        capital,
        "conquest",
        `${newState.name} seized ${capital.name ?? "the province"} from ${oldOwner.name}`,
        newStateId
      );
      const lastOldGrudge = living.states[oldOwnerId]?.grudges.at(-1);
      if (lastOldGrudge) lastOldGrudge.weight = 60;

      this.recordGrudge(
        newStateId,
        capital,
        "conquest",
        `${ruler.name} vowed to cast down ${oldOwner.name}`,
        oldOwnerId
      );
      const lastNewGrudge = living.states[newStateId]?.grudges.at(-1);
      if (lastNewGrudge) lastNewGrudge.weight = 60;
    }

    const provLabel = province.name ?? capital.name ?? "the province";
    const text =
      originKind === "lair"
        ? `${ruler.name} of the ${originName} in ${provLabel} has proclaimed the ${fullName}!`
        : `${originName} in ${provLabel} erupted into revolution, proclaiming the ${fullName} under ${ruler.name}!`;
    this.pushNews(living, {
      kind: originKind === "lair" ? "lair" : "revolt",
      text,
      cell: capital.cell,
      stateId: newStateId,
      burgId: capital.i
    });
    this.pushHistory(
      "independence",
      [
        { kind: "figure", id: ruler.i },
        { kind: "burg", id: capital.i },
        { kind: "state", id: newStateId },
        ...(oldOwnerId ? [{ kind: "state", id: oldOwnerId } as HistRef] : [])
      ],
      capital.cell,
      text
    );

    return newStateId;
  }

  /** Spawn a remnant rebel front when a state collapses or is annexed */
  spawnRemnantFaction(fallenState: State, conquerorStateId?: number): Faction | null {
    if (!fallenState?.i) return null;

    const stateRelations: Record<number, "Enemy" | "Ally" | "Friendly" | "Neutral"> = {};
    if (conquerorStateId) {
      stateRelations[conquerorStateId] = "Enemy";
    }

    const remnant = Factions.add({
      name: `${fallenState.name} Restoration Front`,
      category: "political",
      type: "rebel_front",
      scale: "province",
      allegiance: "hostile",
      color: fallenState.color,
      culture: fallenState.culture,
      alignment: "chaotic",
      values: ["freedom", "justice"],
      expansionism: 1.2,
      expansionScope: "state",
      sovereignAmbition: true,
      stateForm: fallenState.formName || "Restored Republic",
      stateRosterId: fallenState.rosterId,
      hq: {
        cell: fallenState.center || 0,
        fortified: false,
        secrecy: 50,
        assets: ["safe_house", "muster_camp"]
      },
      treasury: 120,
      influence: 40,
      researchedTechs: fallenState.researchedTechs
        ? [...fallenState.researchedTechs]
        : ["pottery", "mining", "iron_working"],
      stateRelations
    });

    const living = this.getState();
    this.pushNews(living, {
      kind: "faction",
      text: `Loyalists of the fallen ${fallenState.name} formed the ${remnant.name}!`,
      cell: fallenState.center || 0,
      stateId: conquerorStateId
    });

    return remnant;
  }

  private resolveEmergentCapital(
    province: Province,
    originKind: "trouble" | "lair" | "faction",
    originCell: number,
    rng: Rng,
    requestedBurgId?: number
  ): Burg | null {
    if (requestedBurgId) {
      const target = pack.burgs?.[requestedBurgId];
      if (target?.i && !target.removed && (!target.capital || originKind === "faction")) return target;
    }

    const cellBurgId = pack.cells.burg?.[originCell];
    if (cellBurgId) {
      const cellBurg = pack.burgs?.[cellBurgId];
      if (cellBurg?.i && !cellBurg.removed && (!cellBurg.capital || originKind === "faction")) return cellBurg;
    }

    if (originKind === "trouble" || originKind === "faction") {
      if (province.burg) {
        const pBurg = pack.burgs?.[province.burg];
        if (pBurg?.i && !pBurg.removed && !pBurg.capital) return pBurg;
      }
      const candidates = (pack.burgs ?? []).filter(
        b =>
          b?.i &&
          !b.removed &&
          !b.capital &&
          (pack.cells.province?.[b.cell] === province.i || (province.state && b.state === province.state))
      );
      if (candidates.length > 0) {
        candidates.sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
        return candidates[0]!;
      }
    }

    return this.foundEmergentBurg(province, originCell, rng);
  }

  private foundEmergentBurg(province: Province, originCell: number, rng: Rng): Burg {
    const occupiedCells = new Set<number>();
    for (const b of pack.burgs ?? []) {
      if (b?.i && !b.removed) occupiedCells.add(b.cell);
    }

    let cell = originCell;
    if (occupiedCells.has(cell)) {
      const neighbor = (pack.cells.c?.[originCell] ?? []).find(
        c => !occupiedCells.has(c) && (!pack.cells.h || pack.cells.h[c] >= 20)
      );
      if (neighbor !== undefined) cell = neighbor;
    }

    const [x, y] = pack.cells.p?.[cell] ?? [0, 0];
    const culture =
      pack.cells.culture?.[cell] ??
      (province.state ? pack.states[province.state]?.culture : undefined) ??
      pack.states[1]?.culture ??
      0;
    const pop = Math.round(rng.range(1.5, 3.0) * 10) / 10;

    try {
      const addedId = Burgs.add(x, y);
      const added = pack.burgs[addedId];
      if (added) {
        added.population = Math.max(added.population ?? 0, pop);
        return added;
      }
    } catch {
      // Fallback for stubbed test packs without full Voronoi grid or Routes
    }

    const burgId = pack.burgs.length;
    const burg: Burg = {
      i: burgId,
      cell,
      x,
      y,
      state: province.state ?? 0,
      culture,
      name: Names.getCulture(culture),
      population: pop,
      capital: 0,
      port: 0,
      walls: 1,
      plaza: 1,
      temple: 1,
      citadel: 1,
      tags: []
    };
    pack.burgs.push(burg);
    if (pack.cells.burg) pack.cells.burg[cell] = burgId;
    return burg;
  }

  private emergentTerritoryCells(province: Province, capital: Burg, oldOwnerId: number): number[] {
    const cells = new Set<number>(this.burgHinterland(capital));
    cells.add(capital.cell);

    const stateCenters = new Set<number>();
    const stateCapitalCells = new Set<number>();
    for (const s of pack.states ?? []) {
      if (!s?.i || s.removed) continue;
      if (s.center !== undefined) stateCenters.add(s.center);
      if (s.capital && pack.burgs[s.capital]) stateCapitalCells.add(pack.burgs[s.capital].cell);
    }

    for (const c of this.provinceCells(province.i)) {
      if (c === capital.cell) continue;
      if (stateCenters.has(c) || stateCapitalCells.has(c)) continue;
      const cellBurgId = pack.cells.burg?.[c];
      if (cellBurgId && pack.burgs[cellBurgId]?.capital) continue;
      if (!oldOwnerId || pack.cells.state?.[c] === oldOwnerId || pack.cells.state?.[c] === 0) {
        cells.add(c);
      }
    }
    return Array.from(cells);
  }

  private emergentStateColor(rosterId?: string, alignment?: Alignment, fallback?: string): string {
    if (rosterId === "tombKingsBase") return "#d6ccb2";
    if (rosterId === "vampireBase" || rosterId === "darkElfBase") return "#5e3c6e";
    if (rosterId === "demonBase" || rosterId === "chaosBase") return "#9e2a2b";
    if (rosterId === "infernalDwarfBase" || rosterId === "skavenBase") return "#5c646d";
    if (rosterId === "orcBase" || rosterId === "tribalBase") return "#8c4a27";
    if (alignment === "evil") return "#8b2635";
    if (alignment === "chaotic") return "#b5532a";
    if (alignment === "lawful") return "#4a5d73";
    return fallback ?? "#7a6855";
  }

  private spawnEmergentRuler(state: State, living: LivingWorldState, preferredAlignment?: Alignment): HistoricalFigure {
    const history = Chronicle.sync();
    history.figures ??= [];
    const year = options.map?.lore?.calendar?.year ?? 1000;
    const culture = state.culture ?? 0;
    const index = history.figures.length;
    const rng = traitsRng(living.seed, "figure", index + state.i * 1000);
    const alignment = preferredAlignment ?? rollAlignment(rng, pack.cultures[culture]?.alignment ?? "chaotic");
    const { virtues, vices } = aggressiveTraits(rollFigureTraits(rng, alignment));
    const figure: HistoricalFigure = {
      i: index,
      name: Names.getCulture(culture),
      culture,
      birth: year - rng.int(22, 48),
      roles: [{ type: "ruler", target: { kind: "state", id: state.i }, from: year }],
      alignment,
      virtues,
      vices
    };
    history.figures.push(figure);
    return figure;
  }

  private addLairMarker(lair: ProvinceLair, cell: number): number {
    pack.markers ??= [];
    const markers = pack.markers;
    const [x, y] = pack.cells.p[cell] ?? [0, 0];
    const markerIndex = markers.length;
    const def = getLairDef(lair.id);
    markers.push({
      i: markerIndex,
      type: "dungeon",
      icon: def.markerIcon || "☠️",
      x,
      y,
      cell,
      name: `${lair.name} (Lair Lvl ${lair.level})`
    });
    return markerIndex;
  }

  /** Register a lair under its danger marker so syncDangerMarkers reuses the same object. */
  private registerActiveLair(lair: ProvinceLair, markerId: number, provinceId: number): void {
    const living = this.getState();
    living.activeLairs ??= {};
    const key = `lair:${markerId}`;
    lair.markerId = markerId;
    lair.provinceId = provinceId;
    living.activeLairs[key] = lair;
    const marker = pack.markers?.[markerId];
    if (marker) marker.threatId = key;
  }

  private removeLairMarker(markerId?: number, victorName?: string): void {
    if (markerId === undefined || !pack.markers) return;
    if (pack.history?.living?.activeLairs) delete pack.history.living.activeLairs[`lair:${markerId}`];
    const marker = pack.markers[markerId];
    if (!marker) return;
    if (isDangerMarker(marker)) {
      convertDangerMarkerToRuins(marker, victorName);
    } else {
      marker.hidden = true;
    }
  }

  /** Clears a defeated lair: converts marker to ruins, prunes activeLairs, updates province */
  clearLair(lair: ProvinceLair, victorName?: string): void {
    const living = this.getState();
    this.removeLairMarker(lair.markerId, victorName);

    if (living.activeLairs) {
      if (lair.markerId !== undefined) {
        delete living.activeLairs[`lair:${lair.markerId}`];
      }
      delete living.activeLairs[`prov_lair:${lair.provinceId}`];
    }

    if (lair.provinceId && living.provinces[lair.provinceId]) {
      const pSim = living.provinces[lair.provinceId]!;
      if (pSim.lair === lair || pSim.lair?.markerId === lair.markerId) {
        const nextLair = living.activeLairs
          ? Object.values(living.activeLairs).find(l => l.provinceId === lair.provinceId)
          : null;
        pSim.lair = nextLair ?? null;
      }
      pSim.order = Math.min(100, pSim.order + 15);
      pSim.stability += 2;
    }
  }

  private addRuinMarker(cell: number, name: string): number {
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

  /** Place a found relic: carried by the digger, stored in the vault, or held in reserve. */
  private placeRelic(relic: HistoricalRelic, guild: GuildState, figure?: HistoricalFigure): void {
    if (figure && !equippedRelic(guild.relics ?? [], figure.i)) {
      relic.holder = { kind: "figure", id: figure.i };
    } else if (vaultHasRoom(guild)) {
      relic.holder = { kind: "vault" };
    } else {
      relic.holder = { kind: "reserve" };
    }
  }

  /** Mint a lore-linked relic named after the nearest fallen realm, a dead hero, or the site itself */
  private mintRelicFromMarker(marker: Marker, seedId: number, figure?: HistoricalFigure): HistoricalRelic {
    const guild = this.getGuild();
    const rng = this.rng("guild:relic", seedId);
    const history = Chronicle.sync();

    // the nearest fallen realm lends its name; else a dead figure of the chronicle
    const realms = history.realms ?? [];
    const point = pack.cells.p?.[marker.cell];
    let realm: Realm | undefined;
    let bestDist = Infinity;
    for (const candidate of realms) {
      const center = pack.cells.p?.[candidate.center];
      if (!center || !point) continue;
      const dist = Math.hypot(center[0] - point[0], center[1] - point[1]);
      if (dist < bestDist) {
        bestDist = dist;
        realm = candidate;
      }
    }

    const dead = (history.figures ?? []).filter(figure => figure.death !== undefined);
    const deadFigure = dead.length > 0 ? dead[rng.int(0, dead.length - 1)] : undefined;
    const province = pack.cells.province?.[marker.cell];
    const place = marker.name ?? (province ? pack.provinces?.[province]?.name : undefined) ?? "the wilds";

    const category = rng.choice(relicCategoriesForMarker(marker.type));
    const context = {
      realm: realm?.name,
      figure: deadFigure?.name,
      place,
      year: realm?.fallen ?? deadFigure?.death ?? options.map?.lore?.calendar?.year ?? 1000
    };

    const relic: HistoricalRelic = {
      id: guild.relics.reduce((max, entry) => Math.max(max, entry.id), 0) + 1,
      name: formatRelicName(category, context, rng),
      category,
      lore: formatRelicLore(category, context, rng),
      originYear: context.year,
      ...(realm ? { originRealmId: realm.i } : {}),
      ...(deadFigure ? { originFigureId: deadFigure.i } : {}),
      bonuses: { ...RELIC_CATALOG[category].bonuses },
      cursed: RELIC_CATALOG[category].cursed,
      holder: { kind: "vault" }
    };
    this.placeRelic(relic, guild, figure);
    guild.relics.push(relic);
    return relic;
  }

  /** Recover any relics a fallen capital buried at this marker */
  private recoverRelicsFromMarker(guild: GuildState, markerId: number | undefined, figure?: HistoricalFigure): void {
    if (markerId === undefined) return;
    for (const relic of guild.relics ?? []) {
      if (relic.holder.kind === "ruin" && relic.holder.markerId === markerId) {
        this.placeRelic(relic, guild, figure);
      }
    }
  }

  /** A fallen capital forces the state's leased relics into a fresh chronicle ruin at the capital cell. */
  dropStateRelicsToRuin(stateId: number, burg: Burg): HistoricalRelic[] {
    const living = this.getState();
    const guild = this.getGuild();
    const dropped = guild.relics.filter(relic => relic.holder.kind === "state" && relic.holder.id === stateId);
    if (dropped.length === 0) return [];

    const markerId = this.addRuinMarker(burg.cell, `Ruins of ${burg.name ?? "the fallen capital"}`);
    for (const relic of dropped) relic.holder = { kind: "ruin", markerId, cell: burg.cell };

    const sSim = living.states[stateId];
    if (sSim) sSim.capacity = this.recomputeStateCapacity(stateId);

    this.pushNews(living, {
      kind: "develop",
      text: `${burg.name ?? "The capital"} fell; ${dropped.length} leased Guild relic${
        dropped.length === 1 ? "" : "s"
      } lay buried in the ruins.`,
      cell: burg.cell,
      stateId
    });
    return dropped;
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
  private fieldArmy(state: State): Regiment | null {
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
    const attackerMult = attackerStateId ? happinessCombatMultiplier(living?.states?.[attackerStateId]?.happiness) : 1;
    const defenderMult = happinessCombatMultiplier(living?.states?.[burg.state ?? 0]?.happiness);

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

  /** The burg's roster and its Conquest militia garrison. */
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

  private applyArmySurvivors(state: State, regiment: Regiment, units: ArmyUnit[]): void {
    regiment.units = fromBattleUnitsMen(units, Military.getUnitTypes());
    syncRegimentTotals(regiment, Military.getUnitTypes());
    if (regiment.a <= 0) state.military = (state.military ?? []).filter(entry => entry !== regiment);
  }

  private moveArmy(regiment: Regiment, burg: Burg): void {
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
    const wasCapital = burg.capital === 1;
    const loserProvinces = previousState > 0 ? this.ownedProvinces(previousState).length : 0;
    const cells = this.burgHinterland(burg);
    this.transferCells(stateId, cells);
    burg.state = stateId;
    this.assignProvince(stateId, cells);

    // a conquered capital forces its state's leased relics into a ruin at the capital cell
    if (wasCapital && previousState > 0 && previousState !== stateId) this.dropStateRelicsToRuin(previousState, burg);

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
  private burgHinterland(burg: Burg): number[] {
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
  private transferCells(stateId: number, cells: number[]): void {
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
  private assignProvince(stateId: number, cells: number[]): void {
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
      salesTax: oldOwner.salesTax ?? 0,
      pollTax: oldOwner.pollTax ?? 0,
      treasury: 0
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

  private isAtWar(stateId: number, otherId: number): boolean {
    return pack.states[stateId]?.diplomacy?.[otherId] === "Enemy";
  }

  private declareWar(stateId: number, otherId: number): void {
    const subject = pack.states[stateId];
    const object = pack.states[otherId];
    if (!subject?.i || subject.removed || !object?.i || object.removed) return;
    if ((pack.history?.living?.states?.[stateId]?.peaceTreatyTurns?.[otherId] ?? 0) > 0) return;

    subject.diplomacy ??= [];
    object.diplomacy ??= [];
    subject.diplomacy[otherId] = "Enemy";
    object.diplomacy[stateId] = "Enemy";

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

  private recordClaim(stateId: number, burg: Burg, heldByStateId: number): void {
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

  private recordGrudge(
    stateId: number,
    burg: Burg,
    reason: GrudgeReason,
    summary: string,
    againstStateId?: number
  ): void {
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

  private addBattleMarker(burgOrCell: Burg | number, label?: string): void {
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

    // A clash can break open an ancient site: expose a relic cache on the map.
    const cell = typeof burgOrCell === "number" ? burgOrCell : burgOrCell.cell;
    const place = typeof burgOrCell === "number" ? (label ?? "the wilds") : (label ?? burgOrCell.name ?? "the wilds");
    this.queuePopup({
      kind: "relic_exposed",
      cell,
      title: `Relics exposed near ${place}`,
      subtitle: "A clash has broken open an ancient site",
      rewardGold: this.rng("relic:exposed", cell).int(15, 40),
      rewardRenown: 4
    });
  }

  private pushHistory(type: HistoryEventType, actors: HistRef[], cell: number | undefined, text: string): void {
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
    const perPoint = Math.max(1, currentContent().config.capacity.growthPerHabitability);
    return Math.floor(total / cells.length / perPoint);
  }

  private provinceCells(provinceId: number): number[] {
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

  private freeCapacity(sSim: { capacity: CapacityLedger }): CapacityPoints {
    const out = { m: 0, w: 0, s: 0, c: 0 };
    for (const pool of ["m", "w", "s", "c"] as const) {
      out[pool] = sSim.capacity[pool].gen - sSim.capacity[pool].load;
    }
    return out;
  }

  private hasFreeCapacity(sSim: { capacity: CapacityLedger }, load?: CapacityPoints): boolean {
    if (!load) return true;
    const free = this.freeCapacity(sSim);
    for (const pool of ["m", "w", "s", "c"] as const) {
      if (free[pool] - (load[pool] ?? 0) < 0) return false;
    }
    return true;
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
    const free = this.freeCapacity(sSim);
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

      const cost = unit.capacityCost;
      if (cost) {
        let refused = false;
        for (const pool of ["m", "w", "s", "c"] as const) {
          if (free[pool] - (cost[pool] ?? 0) * unit.blocks < 0) {
            refused = true;
            break;
          }
        }
        if (refused) continue;
      }

      const regiment = this.findRegimentForUnit(state, unitId, maxUnits, roster.caps[unitId]);
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

  private createRegiment(state: State): Regiment {
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
      if (pSim?.trouble?.theme === "resource" || pSim?.lair?.theme === "resource") continue;
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
    const { content, config } = currentContent();
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
    if (!this.hasFreeCapacity(sSim, building.effects.upkeep)) return false;
    return this.freeCapacity(sSim).w >= config.capacity.constructionWPerTurn;
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

  private pickDevelopProvince(stateId: number, sSim: StatePolitySim, living: LivingWorldState): number | undefined {
    const capacityConfig = currentContent().config.capacity;
    for (const province of this.ownedProvinces(stateId)) {
      const pSim = living.provinces[province.i];
      if (!pSim || pSim.developmentProgress) continue;
      if (pSim.stability < capacityConfig.developStabilityCost) continue;
      if (pSim.development >= this.provinceDevelopmentCap(province.i)) continue;
      if (!this.pickProvinceSettlement(province.i, stateId)) continue;
      if (this.freeCapacity(sSim).w < capacityConfig.developWPerTurn) continue;
      return province.i;
    }
    return undefined;
  }

  /** War options: press an ongoing war, calm a restive burg, retake a claim, absorb a free burg, or expand. */
  private warAgenda(state: State, sSim: StatePolitySim): StateAgenda | null {
    const army = this.fieldArmy(state);
    const bias = this.traitBias(state, sSim);
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

    const lairProvince = this.ownedProvinces(state.i)
      .map(p => ({ province: p, lair: living.provinces[p.i]?.lair }))
      .filter((entry): entry is { province: Province; lair: ProvinceLair } => Boolean(entry.lair))
      .sort((a, b) => b.lair.level - a.lair.level)[0];

    if (lairProvince) {
      const army = this.fieldArmy(state);
      const armyMenValue = army ? armyMen(army, Military.getUnitTypes()) : 0;
      const defMen = lairProvince.lair.defenders.reduce((s, u) => s + u.count, 0);
      if (army && (armyMenValue >= defMen * 0.85 || sSim.warExhaustion < 40)) {
        return {
          kind: "clear_lair",
          label: `Marching against ${lairProvince.lair.name} in ${lairProvince.province.name}`,
          targetProvinceId: lairProvince.province.i,
          progress: 0,
          required: 1
        };
      }
      if (sSim.capacity.w.gen >= sSim.capacity.w.load || sSim.capacity.c.gen >= 4) {
        return {
          kind: "hire_adventurers",
          label: `Hiring adventurers against ${lairProvince.lair.name} in ${lairProvince.province.name}`,
          targetProvinceId: lairProvince.province.i,
          progress: 0,
          required: 1
        };
      }
    }

    const troubledProvince = this.ownedProvinces(state.i)
      .map(p => ({ province: p, trouble: living.provinces[p.i]?.trouble }))
      .filter((entry): entry is { province: Province; trouble: ProvinceTrouble } => Boolean(entry.trouble))
      .sort((a, b) => b.trouble.level - a.trouble.level)[0];

    if (troubledProvince) {
      const tDef = getTroubleDef(troubledProvince.trouble.id);
      return {
        kind: "resolve_trouble",
        label: `Resolving ${tDef.name} in ${troubledProvince.province.name}`,
        targetProvinceId: troubledProvince.province.i,
        progress: 0,
        required: 1
      };
    }

    const war = this.warAgenda(state, sSim);
    if (war) return war;

    const provinceId = this.pickDevelopProvince(state.i, sSim, living);
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
      case "clear_lair": {
        const provinceId = agenda.targetProvinceId;
        if (provinceId === undefined) {
          sSim.agenda = null;
          return;
        }
        const pSim = living.provinces[provinceId];
        if (!pSim?.lair) {
          sSim.agenda = null;
          return;
        }
        this.assaultLair(state.i, provinceId);
        agenda.progress += 1;
        if (agenda.progress >= agenda.required || !pSim.lair) {
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
        const pSim = living.provinces[provinceId];
        if (!pSim?.lair) {
          sSim.agenda = null;
          return;
        }
        this.sendAdventurersToLair(state.i, provinceId);
        agenda.progress += 1;
        if (agenda.progress >= agenda.required || !pSim.lair) {
          sSim.agenda = null;
        }
        return;
      }
      case "resolve_trouble": {
        const provinceId = agenda.targetProvinceId;
        if (provinceId === undefined) {
          sSim.agenda = null;
          return;
        }
        const pSim = living.provinces[provinceId];
        if (!pSim?.trouble) {
          sSim.agenda = null;
          return;
        }
        this.resolveTrouble(state.i, provinceId);
        agenda.progress += 1;
        if (agenda.progress >= agenda.required || !pSim.trouble) {
          sSim.agenda = null;
        }
        return;
      }
      case "develop": {
        if (this.hasDevelopment(living, state.i)) return;
        const provinceId = agenda.targetProvinceId ?? this.pickDevelopProvince(state.i, sSim, living);
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
      const checks = construction.checks;
      // One value check per season: pass the next unfinished pool.
      const pool = (["m", "w", "s"] as const).find(entry => !checks[entry]);
      if (pool) {
        const dcs = assetCheckDifficulties(building, construction.pityBonus);
        const modifier = valueModifier(sSim.capacity[pool].gen);
        const roll = this.rng(
          "build-check",
          state.i * 10000 + burg.i * 10 + (pool === "m" ? 1 : pool === "w" ? 2 : 3)
        ).d(20);

        if (roll + modifier >= dcs[pool]) {
          checks[pool] = true;
          if (sSim.agenda?.kind === "build" && sSim.agenda.targetBurgId === burg.i) {
            sSim.agenda.progress = Math.min(sSim.agenda.required, sSim.agenda.progress + 1);
          }
        } else {
          construction.pityBonus += 1;
        }
      }

      // Building time is a floor: all three saves and the advertised turns must pass.
      if (checks.m && checks.w && checks.s && construction.turnsLeft === 0) {
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
            const canCoup =
              isTroubleStatePromotable(pSim.trouble.id) &&
              (lvl >= 7 || unchecked >= 5) &&
              (pSim.order <= 25 || (sSim ? sSim.unravel >= 60 || sSim.warExhaustion >= 60 : false));
            if (canCoup && this.promoteTroubleToState(province.i) !== null) {
              continue;
            }
            this.metastasizeTroubleToLair(province.i);
          }
        }
      }

      if (pSim.lair) {
        pSim.lair.seasonsActive = (pSim.lair.seasonsActive ?? 0) + 1;
        if (sSim) sSim.unravel = minmax(sSim.unravel + 2, 0, 100);
        if (pSim.lair.level >= 8 && pSim.developmentProgress) pSim.developmentProgress = null;
      }

      if (this.isProvinceGarrisoned(province.state, province.i)) {
        if (!pSim.trouble && !pSim.lair) pSim.stability += config.capacity.stabilityPerGarrison;
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
      if (pSim.lair) {
        pSim.order = Math.max(0, pSim.order - pSim.lair.level * 2);
      }
      pSim.order = minmax(pSim.order, 0, 100);

      // Seasonal trouble spawning
      if (!pSim.trouble && !pSim.lair) {
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

  /** Seasonal simulation step for autonomous and player factions */
  stepFactions(living: LivingWorldState): void {
    if (!pack.factions || pack.factions.length <= 1) {
      if (typeof Factions?.generate === "function" && (pack.burgs?.length ?? 0) > 0) {
        Factions.generate();
      }
    }
    if (pack.factions && pack.factions.length > 1) {
      this.syncPlayerFaction(living);
      this.stepFactionEconomyAndTech(living);
      this.stepFactionAgendas(living);
      this.stepFactionMilitaryAndRaids(living);
      this.stepPlayerFactionMissions(living);
    }
    this.stepLairs(living);
  }

  /** Calculate per-season faction revenue, science, tech research, and burg/province impact */
  stepFactionEconomyAndTech(living: LivingWorldState): void {
    const activeFactions = Factions.active();

    for (const faction of activeFactions) {
      faction.seasonsActive = (faction.seasonsActive || 0) + 1;

      // 1. Calculate Incomes
      let goldIncome = 0;
      let scienceIncome = 1;
      let influenceIncome = 1;

      for (const assetId of faction.hq.assets) {
        const asset = getFactionAsset(assetId);
        if (asset) {
          goldIncome += asset.yields?.gold ?? 0;
          scienceIncome += asset.yields?.science ?? 0;
          influenceIncome += asset.yields?.influence ?? 0;
        }
      }

      for (const outpost of faction.outposts) {
        if (outpost.pillaged) continue;

        goldIncome += outpost.tier * 2;
        influenceIncome += outpost.tier;

        for (const assetId of outpost.assets) {
          const asset = getFactionAsset(assetId);
          if (asset) {
            goldIncome += asset.yields?.gold ?? 0;
            scienceIncome += asset.yields?.science ?? 0;
            influenceIncome += asset.yields?.influence ?? 0;
          }
        }

        const bSim = living.burgs?.[outpost.burgId];
        if (bSim) {
          if (
            faction.category === "commercial" ||
            faction.category === "adventuring" ||
            (faction.category === "religious" && faction.alignment !== "evil")
          ) {
            bSim.unrest = Math.max(0, (bSim.unrest ?? 0) - 1);
          } else if (
            faction.category === "underworld" ||
            faction.allegiance === "hostile" ||
            faction.alignment === "evil"
          ) {
            if (outpost.secrecy < 30 || outpost.influence > 50) {
              bSim.unrest = Math.min(100, (bSim.unrest ?? 0) + 1);
            }
          }
        }
      }

      // Patron State Stipends
      if (faction.patronStateId) {
        const patron = pack.states?.[faction.patronStateId];
        const pStateSim = living.states?.[faction.patronStateId];
        if (patron && !patron.removed && (pStateSim?.unravel ?? 0) < 60) {
          if (faction.allegiance === "state_arm") {
            goldIncome += 8;
            scienceIncome += 2;
          } else if (faction.allegiance === "chartered") {
            goldIncome += 4;
          }
        }
      }

      // Underworld Illicit Siphoning
      if (faction.category === "underworld") {
        for (const outpost of faction.outposts) {
          if (!outpost.pillaged) {
            const burg = pack.burgs?.[outpost.burgId];
            if (burg) {
              const siphon = Math.min(12, Math.max(2, Math.round((burg.population || 10) * 0.1)));
              goldIncome += siphon;
            }
          }
        }
      }

      // Upkeep
      const militaryUpkeep = (faction.military ?? []).reduce(
        (acc, r) => acc + Math.max(2, Math.round((r.a || 50) * 0.05)),
        0
      );
      const outpostUpkeep = faction.outposts.length;
      const totalUpkeep = militaryUpkeep + outpostUpkeep;

      faction.treasury = Math.max(0, faction.treasury + goldIncome - totalUpkeep);
      faction.influence = Math.min(1000, Math.max(0, faction.influence + influenceIncome));
      faction.science = Math.max(1, scienceIncome);

      // 2. Tech Progression & Spillover (+25%)
      if (faction.currentTechId) {
        let researchPower = faction.science;

        const hostBurgId = faction.hq.burgId ?? faction.outposts[0]?.burgId;
        const hostBurg = hostBurgId ? pack.burgs?.[hostBurgId] : undefined;
        const hostState = hostBurg?.state ? pack.states?.[hostBurg.state] : undefined;
        const hostStateSim = hostBurg?.state ? living.states?.[hostBurg.state] : undefined;
        if (
          hostStateSim?.researchedTechs?.includes(faction.currentTechId) ||
          hostState?.researchedTechs?.includes(faction.currentTechId)
        ) {
          researchPower = Number((researchPower * 1.25).toFixed(1));
        }

        faction.researchedProgress ??= {};
        const currentProg = (faction.researchedProgress[faction.currentTechId] || 0) + researchPower;
        const techCost = CIV_TECH_BY_ID[faction.currentTechId]?.cost ?? 50;

        if (currentProg >= techCost) {
          if (!faction.researchedTechs.includes(faction.currentTechId)) {
            faction.researchedTechs.push(faction.currentTechId);
          }
          delete faction.researchedProgress[faction.currentTechId];

          const techName = CIV_TECH_BY_ID[faction.currentTechId]?.name ?? faction.currentTechId;
          this.pushNews(living, {
            kind: "faction",
            text: `${faction.name} mastered the secrets of ${techName}!`,
            cell: faction.hq.cell,
            burgId: faction.hq.burgId
          });

          const nextTech = faction.researchQueue.find(t => !faction.researchedTechs.includes(t));
          if (nextTech) {
            faction.currentTechId = nextTech;
          } else {
            const arch = getFactionArchetype(faction.type);
            const candidates = (arch?.desiredTechs ?? []).filter(t => !faction.researchedTechs.includes(t));
            faction.currentTechId = candidates[0] ?? null;
          }
        } else {
          faction.researchedProgress[faction.currentTechId] = currentProg;
        }
      } else {
        const nextTech = faction.researchQueue.find(t => !faction.researchedTechs.includes(t));
        if (nextTech) {
          faction.currentTechId = nextTech;
        } else {
          const arch = getFactionArchetype(faction.type);
          const candidates = (arch?.desiredTechs ?? []).filter(t => !faction.researchedTechs.includes(t));
          if (candidates.length > 0) {
            faction.currentTechId = candidates[0];
          }
        }
      }

      // 3. Dynamic Scale & Tier Re-evaluation
      Factions.recomputeScale(faction);
      if (faction.scale === "burg") faction.tier = 1;
      else if (faction.scale === "province") faction.tier = 2;
      else if (faction.scale === "state") faction.tier = 3;
      else if (faction.scale === "world") faction.tier = faction.researchedTechs.length >= 8 ? 5 : 4;
    }
  }

  /** Step autonomous faction agendas: outpost expansion, asset building, and turf clashes */
  stepFactionAgendas(living: LivingWorldState): void {
    const activeFactions = Factions.active();
    const rng = this.rng("faction:agendas", living.tick);
    const currentYear = options.map?.lore?.calendar?.year ?? 1000;

    for (const faction of activeFactions) {
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

      const maxOutposts: Record<FactionScale, number> = {
        burg: 2,
        province: 4,
        state: 8,
        world: 25
      };

      const shouldExpand = rng.next() <= (faction.expansionism || 1) * 0.5;
      if (shouldExpand && faction.treasury >= 100 && faction.outposts.length < (maxOutposts[faction.scale] ?? 2)) {
        const candidateBurgs =
          pack.burgs?.filter(b => {
            if (!b?.i || b.removed) return false;
            if (b.i === faction.hq.burgId) return false;
            if (faction.outposts.some(o => o.burgId === b.i)) return false;
            return true;
          }) ?? [];

        if (candidateBurgs.length > 0) {
          let targetBurg = candidateBurgs[0];
          if (faction.category === "commercial") {
            targetBurg = [...candidateBurgs].sort(
              (a, b) => (b.population || 0) + (b.port ? 20 : 0) - ((a.population || 0) + (a.port ? 20 : 0))
            )[0];
          } else if (faction.category === "underworld") {
            targetBurg = [...candidateBurgs].sort((a, b) => (b.population || 0) - (a.population || 0))[0];
          } else {
            targetBurg = candidateBurgs[Math.floor(rng.next() * candidateBurgs.length)];
          }

          if (targetBurg) {
            faction.treasury -= 100;
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

            faction.outposts.push({
              burgId: targetBurg.i,
              cell: targetBurg.cell,
              tier: 1,
              influence: 35,
              secrecy: faction.allegiance === "clandestine" ? 60 : 0,
              assets: [startingAsset],
              establishedYear: currentYear
            });

            Factions.recomputeScale(faction);

            this.pushNews(living, {
              kind: "faction",
              text: `${faction.name} established a new outpost in ${targetBurg.name}!`,
              cell: targetBurg.cell,
              burgId: targetBurg.i
            });
          }
        }
      }

      if (faction.treasury >= 80) {
        const unbuilt = Object.values(FACTION_ASSETS_CATALOG).filter(asset => {
          if (faction.hq.assets.includes(asset.id)) return false;
          if (asset.tier > faction.tier) return false;
          if (
            asset.track &&
            asset.track !== faction.category &&
            asset.track !== "scholarly" &&
            asset.track !== "wilder"
          )
            return false;
          if (asset.requiredTech && !faction.researchedTechs.includes(asset.requiredTech)) return false;
          if (faction.treasury < asset.cost) return false;
          return true;
        });

        if (unbuilt.length > 0) {
          const chosen = unbuilt[0];
          faction.treasury -= chosen.cost;
          faction.hq.assets.push(chosen.id);
          Factions.recomputeScale(faction);
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
            const myPower = outpost.influence + faction.tier * 10 + rng.d(20);
            const rivalPower = rivalOutpost.influence + rival.tier * 10 + rng.d(20);

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

  /** Step faction regiment mustering and seasonal raids */
  stepFactionMilitaryAndRaids(living: LivingWorldState): void {
    const activeFactions = Factions.active();

    for (const faction of activeFactions) {
      const maxRegs: Record<FactionScale, number> = {
        burg: 1,
        province: 2,
        state: 4,
        world: 8
      };
      let limit = maxRegs[faction.scale] ?? 1;
      if (faction.hq.assets.includes("muster_camp")) limit += 1;
      if (faction.hq.assets.includes("war_citadel")) limit += 2;

      faction.military ??= [];
      if (
        faction.military.length < limit &&
        faction.treasury >= 120 &&
        (faction.category === "martial" || faction.allegiance === "hostile" || faction.sovereignAmbition)
      ) {
        faction.treasury -= 120;
        const regId = faction.military.length + 1;
        const [x, y] = pack.cells?.p?.[faction.hq.cell] ?? [0, 0];

        const unitsComposition: Record<string, number> = { spear: 50 };
        if (faction.researchedTechs.includes("archery")) unitsComposition.archers = 30;
        if (faction.researchedTechs.includes("iron_working")) unitsComposition.swordsmen = 25;
        if (faction.researchedTechs.includes("horseback_riding")) unitsComposition.cavalry = 20;

        faction.military.push({
          i: regId,
          name: `${faction.name} Regiment ${regId}`,
          a: 100,
          cell: faction.hq.cell,
          x,
          y,
          bx: x,
          by: y,
          u: unitsComposition,
          n: faction.hq.maritime ? 1 : 0,
          state: 0,
          icon: faction.icon || "⚔️"
        });
      }

      if (faction.allegiance === "hostile" && faction.military.length > 0) {
        this.tickFactionRaid(faction, living);
      }

      // Check entrenched wilderness sovereignty
      if (
        faction.sovereignAmbition &&
        faction.allegiance === "hostile" &&
        (faction.seasonsActive ?? 0) >= 8 &&
        faction.tier >= 2
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

  /** Execute a seasonal raid by a hostile martial/underworld faction */
  tickFactionRaid(faction: Faction, living: LivingWorldState): void {
    const rng = this.rng("faction:raid", faction.i, living.tick);
    const raidThreshold = faction.raidThreshold ?? 5;
    const shouldRaid = faction.raidPending || rng.d(6) >= raidThreshold;
    if (!shouldRaid) return;

    const [lx, ly] = pack.cells?.p?.[faction.hq.cell] ?? [0, 0];
    const targets = (pack.burgs ?? [])
      .filter(b => b?.i && !b.removed && b.cell !== faction.hq.cell)
      .map(b => ({ burg: b, dist: Math.hypot(b.x - lx, b.y - ly) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5)
      .map(t => t.burg);

    if (targets.length === 0) return;
    const target = targets[0];
    faction.raidPending = false;

    const { config } = currentContent();
    const raidUnits: ArmyUnit[] = [];
    for (const reg of faction.military) {
      for (const [unitName, count] of Object.entries(reg.u ?? {})) {
        raidUnits.push({ type: unitName as UnitType, count });
      }
    }
    if (raidUnits.length === 0) raidUnits.push({ type: "spear", count: 50 });

    const defenders = this.burgDefenders(target);
    const ownerState = pack.states?.[target.state ?? 0];
    const stationedReg = (ownerState?.military ?? []).find(r => r.cell === target.cell && r.a > 0);
    const unitTypes = Military.getUnitTypes();
    const stationedBlocks = (stationedReg?.units ?? []).filter(u => u.hp > 0 && unitTypes[u.type]);
    for (const u of toBattleUnitsMen(stationedBlocks, unitTypes)) defenders.push(u);

    const session = initBattleSession({
      config,
      unitTypes,
      attacker: { factionId: faction.i, armyId: null, units: raidUnits },
      defender: { factionId: target.state ?? 0, armyId: null, units: defenders },
      cell: target.cell,
      regionId: pack.cells?.province?.[target.cell] ?? 0,
      assault: Number(target.walls ?? 0) > 0,
      modifiers: this.assaultModifiers(target)
    });

    while (session.status === "active" && session.round < config.battle.maxRounds) {
      stepBattleRound(session, rng.next);
    }
    const outcome = finalizeBattle(session, rng.next);
    this.addBattleMarker(target);

    if (outcome.winner === "defender") {
      this.pushNews(living, {
        kind: "faction",
        text: `${target.name} garrison repelled raiders from ${faction.name}!`,
        cell: target.cell,
        burgId: target.i
      });
      return;
    }

    const loot = 50 + rng.d(50);
    faction.treasury += loot;

    const bSim = living.burgs?.[target.i];
    const provId = pack.cells?.province?.[target.cell] ?? 0;
    const pSim = provId ? living.provinces?.[provId] : undefined;

    if (faction.sovereignAmbition && !target.capital && (faction.seasonsActive >= 4 || faction.tier >= 2)) {
      const ascStateId = this.ascendFactionToState(faction.i, target.i);
      if (ascStateId !== null) {
        return;
      }
    }

    if (bSim) bSim.unrest = Math.min(100, (bSim.unrest ?? 0) + 8);
    if (pSim) pSim.order = Math.max(0, pSim.order - 5);

    this.pushNews(living, {
      kind: "faction",
      text: `${faction.name} raided ${target.name} and pillaged ${loot} gold!`,
      cell: target.cell,
      burgId: target.i
    });
  }

  /** Step seasonal raids and lair activity. */
  private stepLairs(living: LivingWorldState): void {
    this.syncDangerMarkers(living);
    const lairs = living.activeLairs ? Object.values(living.activeLairs) : [];
    if (lairs.length === 0) {
      for (const province of pack.provinces ?? []) {
        if (!province?.i || province.removed) continue;
        const pSim = living.provinces[province.i];
        if (pSim?.lair) lairs.push(pSim.lair);
      }
    }

    for (const lair of lairs) {
      const province = lair.provinceId ? pack.provinces?.[lair.provinceId] : undefined;
      const pSim = lair.provinceId ? living.provinces[lair.provinceId] : undefined;

      this.tickLairRaid(
        province ?? ({ i: 0, name: "Wildlands" } as Province),
        pSim ?? ({ order: 50, stability: 0 } as ProvinceSimState),
        lair,
        living
      );

      const key = lair.markerId !== undefined ? `lair:${lair.markerId}` : `prov_lair:${lair.provinceId}`;
      if (!living.activeLairs?.[key] && !pSim?.lair) continue;

      // Path B: Entrenched wilderness sovereignty
      if (province?.i && pSim && isLairStateCapable(lair.id) && lair.seasonsActive >= 8 && lair.level >= 8) {
        const sSim = province.state ? living.states[province.state] : undefined;
        const localBurgs = pack.burgs.filter(b => b?.i && !b.removed && pack.cells.province?.[b.cell] === province.i);
        const noBurgs = localBurgs.length === 0;
        const collapsedOrder = pSim.order <= 15;
        const stateInTurmoil = Boolean(sSim && (sSim.unravel >= 50 || sSim.warExhaustion >= 50));
        if (noBurgs || collapsedOrder || stateInTurmoil) {
          const nonCapBurg = collapsedOrder ? localBurgs.find(b => !b.capital) : undefined;
          this.ascendLairToState(province.i, nonCapBurg?.i);
        }
      }
    }
  }

  private tickLairRaid(province: Province, pSim: ProvinceSimState, lair: ProvinceLair, living: LivingWorldState): void {
    const rng = this.rng("lair:raid", province.i, living.tick);
    const shouldRaid = lair.raidPending || rng.d(6) >= lair.raidThreshold;
    if (!shouldRaid) return;

    // 1. Identify target burgs
    let targetBurgs: Burg[] = [];
    if (lair.maritime) {
      const [lx, ly] = pack.cells.p[lair.cell] ?? [0, 0];
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
        const [lx, ly] = pack.cells.p[lair.cell] ?? [0, 0];
        const withDist = pack.burgs
          .filter(b => b?.i && !b.removed)
          .map(b => ({ burg: b, dist: Math.hypot(b.x - lx, b.y - ly) }))
          .sort((a, b) => a.dist - b.dist);
        targetBurgs = withDist.slice(0, 3).map(d => d.burg);
      }
    }
    if (targetBurgs.length === 0) return;

    // 2. Filter for plausible targets (skip fortresses that are overwhelmingly defended)
    const raidMen = lair.raidUnits.reduce((sum, u) => sum + u.count, 0);
    const plausible = targetBurgs.filter(b => {
      const defenders = this.burgDefenders(b);
      const defMen = defenders.reduce((sum, u) => sum + u.count, 0);
      const walls = Number(b.walls ?? 0);
      if (walls >= 2 && defMen > raidMen * 1.5) return false;
      if (defMen > raidMen * 2.5) return false;
      return true;
    });

    if (plausible.length === 0) {
      lair.raidPending = true;
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

    lair.raidPending = false;

    // 3. Resolve raid combat
    const { config } = currentContent();
    const raidUnits = lair.raidUnits.map(u => ({ ...u }));
    const defenders = this.burgDefenders(target);
    const ownerState = pack.states[target.state ?? 0];
    const stationedReg = (ownerState?.military ?? []).find(r => r.cell === target.cell && r.a > 0);
    const unitTypes = Military.getUnitTypes();
    const stationedBlocks = (stationedReg?.units ?? []).filter(u => u.hp > 0 && unitTypes[u.type]);
    for (const u of toBattleUnitsMen(stationedBlocks, unitTypes)) defenders.push(u);

    const session = initBattleSession({
      config,
      unitTypes: Military.getUnitTypes(),
      attacker: { factionId: 0, armyId: null, units: raidUnits },
      defender: { factionId: target.state ?? 0, armyId: null, units: defenders },
      cell: target.cell,
      regionId: pack.cells.province?.[target.cell] ?? province.i,
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

    if (outcome.winner === "defender") {
      pSim.order = Math.min(100, pSim.order + 3);
      this.pushNews(living, {
        kind: "lair",
        text: `${target.name} garrison repulsed raiders from ${lair.name}!`,
        cell: target.cell,
        stateId: target.state ?? 0,
        burgId: target.i
      });
      return;
    }

    // Path A: Opportunistic raid coup when a state-capable lair overwhelms a vulnerable non-capital settlement
    const bSim = living.burgs[target.i];
    if (
      isLairStateCapable(lair.id) &&
      (lair.level >= 7 || lair.seasonsActive >= 6) &&
      !target.capital &&
      (pSim.order <= 20 || Number(target.walls ?? 0) === 0 || (bSim?.buildings.length ?? 0) === 0)
    ) {
      lair.raidUnits = outcome.attacker.units.filter(u => u.count > 0).map(u => ({ ...u }));
      if (this.ascendLairToState(province.i, target.i) !== null) {
        return;
      }
    }

    // Raiders win: destroy 1 asset or pillage development & unrest
    if (bSim?.buildings && bSim.buildings.length > 0) {
      let destroyIndex = bSim.buildings.findIndex(bid => !bid.startsWith("walls"));
      if (destroyIndex === -1) destroyIndex = bSim.buildings.length - 1;
      const destroyed = bSim.buildings.splice(destroyIndex, 1)[0]!;
      syncBurgFlagsFromBuildings(target, bSim.buildings);
      const bDef = currentContent().content.buildings.find(b => b.id === destroyed);
      const bName = bDef?.name ?? destroyed;
      pSim.order = Math.max(0, pSim.order - 6);
      if (target.state && living.states[target.state]) {
        living.states[target.state].capacity = this.recomputeStateCapacity(target.state);
      }
      this.pushNews(living, {
        kind: "lair",
        text: `Raiders from ${lair.name} sacked ${target.name} and destroyed its ${bName}!`,
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
        `Raiders from ${lair.name} sacked ${target.name} and tore down its ${bName}.`
      );
    } else {
      if (bSim) {
        bSim.development = Math.max(0, bSim.development - 1);
        bSim.unrest = Math.min(10, bSim.unrest + 2);
      }
      pSim.development = Math.max(0, pSim.development - 1);
      pSim.order = Math.max(0, pSim.order - 10);
      if (target.state && living.states[target.state]) {
        living.states[target.state].capacity = this.recomputeStateCapacity(target.state);
      }
      this.pushNews(living, {
        kind: "lair",
        text: `Raiders from ${lair.name} pillaged ${target.name}, leaving ruin in their wake.`,
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
        `Raiders from ${lair.name} plundered ${target.name} and terrorized the populace.`
      );
    }
    this.escalateLair(province, lair, living);
  }

  /** A successful raid grows the lair: higher level, more defenders, refreshed marker and owner load. */
  private escalateLair(province: Province, lair: ProvinceLair, living: LivingWorldState): void {
    if (!growLair(lair, Military.getUnitTypes())) return;
    const marker = lair.markerId !== undefined ? pack.markers?.[lair.markerId] : undefined;
    if (marker) marker.name = `${lair.name} (Lair Lvl ${lair.level})`;
    if (province.state && living.states[province.state]) {
      living.states[province.state].capacity = this.recomputeStateCapacity(province.state);
    }
    this.pushNews(living, {
      kind: "lair",
      text: `${lair.name} in ${province.name} grew bolder after its raid (level ${lair.level}).`,
      cell: lair.cell,
      stateId: province.state
    });
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
            if (!provSim?.trouble && !provSim?.lair) {
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
