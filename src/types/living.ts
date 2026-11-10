// Living World simulation state types. See docs/plans/living-world.md

export type SeasonId = 0 | 1 | 2 | 3;

export const SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"] as const;

export type AgendaKind =
  | "muster"
  | "develop"
  | "build"
  | "colonize"
  | "conquer"
  | "reclaim"
  | "pacify"
  | "clear_faction"
  | "hire_adventurers"
  | "defend"
  | "raid"
  | "suppress_faction";

/**
 * Diplomatic treaties (Phase D of the army integration). War and peace stay
 * on the FMG diplomacy matrix ("Enemy" or not); these are the *positive*
 * agreements layered on top of it. Symmetric — recorded on both sides.
 */
export type TreatyKind = "nonAggression" | "trade" | "defensiveAlliance" | "militaryAccess";

export type TroubleTheme = "burg" | "ruin" | "resource";
export type TroublePool = "m" | "w" | "s";
export type TroubleSaveKind = "disorder" | "uprising" | "poverty" | "ignorance" | "despair" | "corruption";
export type TroubleUnitRole = "guardsmen" | "military" | "merchant" | "sage" | "prophet" | "magistrate";

export type HeroPool = "m" | "w" | "s" | "c";
export type HeroDoctrine = "hunt_lairs" | "hunt_troubles" | "excavate" | "support" | "patrol" | "manual";

export interface HeroTemperament {
  boldness: number;
  caution: number;
  teamplay: number;
  greed: number;
}

export type HeroInjuryKind = "wounded" | "shaken" | "lost";

export interface HeroInjury {
  kind: HeroInjuryKind;
  /** absent for `lost`, which lasts until a healer treats it */
  untilTick?: number;
}

/** @deprecated legacy guild-owned hero state; migrate to `Character.hero.condition`. */
export interface HeroGuildState {
  resolve: number;
  stamina: number;
  maxResolve: number;
  maxStamina: number;
  doctrine: HeroDoctrine;
  temperament: HeroTemperament;
  injuries: HeroInjury[];
  downUntilTick?: number;
  /** manual Push toggle: spend Stamina even when the auto policy stays reserved */
  push?: boolean;
}

export type HeroArchetypeId =
  | "warden"
  | "ranger"
  | "scholar"
  | "priest"
  | "shadow"
  | "factor"
  | "envoy"
  | "alchemist"
  | "warlock"
  | "freeblade";

export type DisciplineId =
  | "court_etiquette"
  | "persuasion"
  | "planar_lore"
  | "athletics"
  | "barter"
  | "tongues"
  | "artifice"
  | "archery"
  | "siegecraft"
  | "investigate"
  | "healing"
  | "melee"
  | "brawling"
  | "ride"
  | "scout"
  | "nature_lore"
  | "alchemy"
  | "perception"
  | "stealth"
  | "survival"
  | "tactics"
  | "arcana"
  | "arcana_evocation"
  | "arcana_nature"
  | "arcana_holy"
  | "arcana_abjuration"
  | "arcana_divination"
  | "arcana_necromancy"
  | "arcana_illusion"
  | "arcana_transmutation"
  | "arcana_enchantment"
  | "arcana_shadow";

export type MissionTag =
  | "combat"
  | "lair"
  | "ruin"
  | "wild"
  | "travel"
  | "arcane"
  | "curse"
  | "plague"
  | "undead"
  | "social"
  | "petition"
  | "intrigue"
  | "trap"
  | "order"
  | "trouble"
  | `save:${TroubleSaveKind}`
  | `role:${TroubleUnitRole}`;

export interface ProvinceTrouble {
  id: string;
  name: string;
  theme: TroubleTheme;
  pool: TroublePool;
  save: TroubleSaveKind;
  requiredRole: TroubleUnitRole;
  level: number;
  seasonsUnchecked: number;
  cell: number;
  burgId?: number;
  markerId?: number;
  goodId?: number;
}

export interface StateAgenda {
  kind: AgendaKind;
  label: string;
  targetStateId?: number;
  targetFactionId?: number;
  stallUntilTick?: number;
  targetProvinceId?: number;
  targetBurgId?: number;
  targetCell?: number;
  buildingId?: string;
  progress: number;
  required: number;
}

export type GrudgeReason = "conquest" | "sacked" | "slain_ruler" | "slain_general" | "repulsed";

export interface GrudgeRecord {
  id: number;
  againstStateId?: number;
  targetBurgId?: number;
  reason: GrudgeReason;
  year: number;
  weight: number;
  summary: string;
}

export interface ClaimRecord {
  provinceId?: number;
  burgId: number;
  lostYear: number;
  heldByStateId: number;
}

export interface BurgConstructionState {
  buildingId: string;
  turnsLeft: number;
}

export interface BurgSimState {
  burgId: number;
  baseTier: number;
  development: number;
  developmentProgress: number;
  buildings: string[];
  construction: BurgConstructionState | null;
  unrest: number;
  conqueredBy?: number;
  /** the state that held the burg before its first conquest in this simulation (0 = free) */
  originalOwner?: number;
  originalCulture?: number;
  originalReligion?: number;
  // OpenCiv city fields; lazily initialized by later Living World 2.0 slices.
  isMajor?: boolean;
  citizens?: number;
  foodStored?: number;
  cultureStored?: number;
  tilesAcquired?: number;
  nextBorderCell?: number | null;
  workedCells?: number[];
  lockedCells?: number[];
  productionQueue?: ProductionItem[];
  productionProgress?: Record<string, number>;
  /**
   * OpenCiv building & wonder ids produced by the autonomous city loop.
   * Kept apart from the legacy AER `buildings` list so the seasonal AER
   * capacity math keeps working until Slice 4 retires it.
   */
  civBuildings?: string[];
  /** last computed OpenCiv city yields, cached for the Living inspector */
  cityYields?: YieldValues;
  hp?: number;
  maxHp?: number;
  /** state besieging this burg (0 = none) */
  siegeStateId?: number;
  /** seasons of ongoing siege (for garrison weakening) */
  siegeProgress?: number;
  /** siege supply HD remaining (buffers attrition) */
  siegeSupplies?: number;
  hasStruckThisTurn?: boolean;
  soldBuildingThisTurn?: boolean;
  religionPressure?: Record<number, number>;
  pantheonId?: string | null;
  pillaged?: boolean;
}

export interface ProvinceSimState {
  provinceId: number;
  /** Public order, 0..100 */
  order: number;
  /** Stability points, spent to purchase development */
  stability: number;
  /** Earned development points, each adds +1 W and +1 S to the region */
  development: number;
  developmentProgress: {
    settlementId: number;
    turnsLeft: number;
  } | null;
  /** Active obstacle/trouble afflicting the province */
  trouble?: ProvinceTrouble | null;
}

export interface StatePolitySim {
  stateId: number;
  rulerId?: number;
  agenda: StateAgenda | null;
  unravel: number;
  warExhaustion: number;
  claims: ClaimRecord[];
  grudges: GrudgeRecord[];
  // OpenCiv empire fields; lazily initialized by later Living World 2.0 slices.
  faith?: number;
  prophetsEarned?: number;
  pantheonId?: string | null;
  religionId?: number | null;
  happiness?: number;
  happinessBreakdown?: HappinessBreakdown;
  yieldsPerTurn?: YieldValues;
  currentTechId?: string | null;
  researchQueue?: string[];
  researchedTechs?: string[];
  researchedProgress?: Record<string, number>;
  freeTechs?: number;
  warTurns?: Record<number, number>;
  peaceTreatyTurns?: Record<number, number>;
  /** Diplomatic treaties (Phase D): other-state id → active treaty kinds. Symmetric. */
  treaties?: Record<number, TreatyKind[]>;
}

export type LivingNewsKind =
  | "war"
  | "battle"
  | "conquest"
  | "resist"
  | "revolt"
  | "succession"
  | "build"
  | "develop"
  | "muster"
  | "colonize"
  | "pacify"
  | "trouble"
  | "lair"
  | "tech"
  | "religion"
  | "faction"
  | "raid";

export interface LivingNewsItem {
  tick: number;
  year: number;
  season: SeasonId;
  kind: LivingNewsKind;
  text: string;
  cell?: number;
  stateId?: number;
  burgId?: number;
}

export interface LivingWorldState {
  enabled: boolean;
  tick: number;
  season: SeasonId;
  seed: string;
  snapshotIntervalYears: number;
  /** tick of the last Legends border snapshot; absent on old saves (treated as 0) */
  lastSnapshotTick?: number;
  promptOnPlayerBattles: boolean;
  states: Record<number, StatePolitySim>;
  provinces: Record<number, ProvinceSimState>;
  burgs: Record<number, BurgSimState>;
  /** Voronoi cell improvements and pillage state; lazily initialized by later slices */
  cells?: Record<number, CellSimState>;
  recentNews: LivingNewsItem[];
  /** 0..100 Age Finale meter; absent on old saves (treated as 0) */
  eschaton?: number;
  /** one-time legacy trouble/lair -> faction migration has run (faction-trouble conversion) */
  threatsMigrated?: boolean;
  /** completed World Wonder id -> owner and year; later Living World 2.0 slices */
  worldWonders?: Record<string, { burgId: number; stateId: number; year: number }>;
  /** 1UPT tactical unit state, keyed by `${stateId}-${regimentId}`; Slice 5.
   *  After the armies migration this holds **utility regiments only**
   *  (Settler, Builder, Work Boat, Caravan, Cargo Ship, Missionary, Inquisitor,
   *  Great Prophet) — combat regiments are blocks + `armies` below. */
  units?: Record<string, UnitSimState>;
  /** Per-tick combat-army state, keyed by `${stateId}-${regimentId}` (living-openciv-armies.md §5.2).
   *  Composition itself lives on `Regiment.units`; lazily initialized in `syncArmies`. */
  armies?: Record<string, ArmySimState>;
  /** religion belief state, keyed by `pack.religions` id; lazily initialized by Slice 6 */
  religions?: Record<number, ReligionBeliefState>;
  activeTroubles?: Record<string, ProvinceTrouble>;
  /** upstream economy is stale after a development, market or border change; re-run `Production.produce()` */
  economyDirty?: boolean;
}

// ---------------------------------------------------------------------------
// Living World 2.0 (OpenCiv) catalogs and simulation types. See docs/plans/living-openciv.md.
// ---------------------------------------------------------------------------

export type CivYieldId = "food" | "production" | "gold" | "science" | "culture" | "faith" | "happiness";

export type YieldValues = Record<CivYieldId, number>;
export type YieldDelta = Partial<YieldValues>;

export interface StateCityYieldBreakdown {
  burgId: number;
  name: string;
  isCapital: boolean;
  yields: YieldValues;
  grossGold: number;
  maintenance: number;
  science: number;
  citizens: number;
  workedCells: number;
  buildings: string[];
}

export interface StateYieldBreakdown {
  total: YieldValues;
  totalCitizens: number;
  totalWorkedCells: number;
  upkeep: number;
  maintenance: number;
  cities: StateCityYieldBreakdown[];
  capital: StateCityYieldBreakdown | null;
}

export type CivEraId =
  | "ancient"
  | "classical"
  | "medieval"
  | "renaissance"
  | "industrial"
  | "modern"
  | "atomic"
  | "information";

export type CivThemeId = "fantasy" | "historical" | "astral";

export interface CivEraDef {
  id: CivEraId;
  name: string;
  rows: readonly number[];
}

export interface CivTechNote {
  text: string;
  icon: string;
}

export interface CivTechTileBonus {
  tileType: string;
  freshWater?: boolean;
  stats: YieldDelta;
}

export interface CivTechDef {
  id: string;
  name: string;
  cost: number;
  prerequisites: readonly string[];
  row: number;
  slot: number;
  era: CivEraId;
  description: string;
  assetName?: string;
  notes?: readonly CivTechNote[];
  tileBonuses?: readonly CivTechTileBonus[];
}

export type UnitDomain = "land" | "sea";

export type UnitCombatClass =
  | "recon"
  | "melee"
  | "gunpowder"
  | "mounted"
  | "armor"
  | "ranged"
  | "siege"
  | "naval_melee"
  | "naval_ranged"
  | "submarine"
  | "fighter"
  | "bomber"
  | "helicopter"
  | "carrier"
  | "civilian";

export type CivUnitAttackType = "melee" | "ranged" | "siege" | "naval";

export interface CivUnitDef {
  id: string;
  name: string;
  cost?: number;
  attackType?: CivUnitAttackType;
  unitClass?: UnitCombatClass;
  combatStrength?: number;
  rangedStrength?: number;
  range?: number;
  requiredTech?: string;
  obsoleteTech?: string;
  upgradesTo?: string;
  freePromotions?: readonly string[];
  domain?: UnitDomain;
  coastOnly?: boolean;
  isUtility?: boolean;
  capturedAs?: string;
  defaultMoveDistance?: number;
  sightRange?: number;
  ignoresTerrainCost?: boolean;
  faithCost?: number;
  spreadCharges?: number;
  entersForeignLands?: boolean;
  uniqueTo?: string;
  replaces?: string;
  rosterIds?: readonly string[];
}

export interface CivTileYieldEffect {
  terrain?: string | readonly string[];
  except?: readonly string[];
  resources?: readonly string[];
  improvement?: string;
  naturalWonder?: boolean;
  stats: YieldDelta;
}

export interface CivBuildingEffects {
  trainedUnitExperience?: { amount: number; landOnly?: boolean };
  foodKeptPercent?: number;
  freeTechs?: number;
  freeUnits?: readonly string[];
  builderSpeedPercent?: number;
  tileYields?: readonly CivTileYieldEffect[];
  yieldPercent?: YieldDelta;
  empireYieldPercent?: YieldDelta;
  unitProduction?: { percent: number; label?: string; landMilitary?: boolean; units?: readonly string[] };
  navalMovement?: number;
  navalSight?: number;
  cityAttackPercent?: number;
  borderCostPercent?: number;
  friendlyTerritoryCombatPercent?: number;
  freeBuilding?: string;
  trainedUnitPromotions?: { promotions: readonly string[]; landOnly?: boolean };
  enemyMovementCost?: number;
  copyLandUnits?: boolean;
  yieldsPerCitizen?: YieldDelta;
}

export interface CivBuildingStats extends YieldDelta {
  defense?: number;
}

export interface CivBuildingDef {
  id: string;
  name: string;
  assetName?: string;
  cost?: number;
  maintenance?: number;
  requiredTech?: string;
  requiresBuilding?: string;
  requiresRiver?: boolean;
  requiresMountain?: boolean;
  coastal?: boolean;
  isWonder?: boolean;
  nationalWonder?: boolean;
  uniqueTo?: string;
  replaces?: string;
  cityHealth?: number;
  factionCategory?:
    | "commercial"
    | "adventuring"
    | "underworld"
    | "religious"
    | "political"
    | "martial"
    | "scholarly"
    | "wilder";
  factionTier?: 1 | 2 | 3;
  factionLocation?: "any" | "burg" | "wilderness" | "hq_only";
  stats: CivBuildingStats;
  effects?: CivBuildingEffects;
  notYet?: readonly string[];
}

export interface CivImprovementDef {
  id: string;
  name: string;
  assetName?: string;
  icon?: string;
  requiredTech?: string;
  buildTurns?: number;
  tileType?: string;
  terrain?: readonly string[];
  resources?: Readonly<Record<string, string>>;
  features?: readonly string[];
  requiresFeature?: string;
  route?: boolean;
  removesFeature?: string;
  domain?: UnitDomain;
  consumesUnit?: boolean;
  outsideBorders?: boolean;
  status?: string;
}

export type CivResourceClass = "bonus" | "strategic" | "luxury";

export interface CivResourceDef {
  id: string;
  class: CivResourceClass;
  revealTech?: string;
  spawnTiles: readonly string[];
}

export interface CivTileDef {
  id: string;
  name: string;
  stats: YieldDelta;
}

export interface CivPromotionEffects {
  openTerrainPercent?: number;
  roughTerrainPercent?: number;
  rangedOpenPercent?: number;
  rangedRoughPercent?: number;
  vsClasses?: { classes: readonly UnitCombatClass[]; percent: number };
  vsWoundedPercent?: number;
  vsCityPercent?: number;
  vsFortifiedPercent?: number;
  vsLandPercent?: number;
  vsNavalPercent?: number;
  navalMeleePercent?: number;
  attackPercent?: number;
  defensePercent?: number;
  rangedDefensePercent?: number;
  extraAttacks?: number;
  movement?: number;
  sight?: number;
  range?: number;
  healEveryTurn?: boolean;
  healAdjacent?: number;
  healOutsideFriendly?: number;
  woodsman?: boolean;
  amphibious?: boolean;
  indirectFire?: boolean;
  withdraw?: boolean;
  healInstantly?: number;
}

export interface CivPromotionDef {
  id: string;
  name: string;
  displayName?: string;
  classes: readonly (UnitCombatClass | "any")[];
  requires?: readonly string[];
  requiresByClass?: Readonly<Partial<Record<UnitCombatClass, readonly string[]>>>;
  description: string;
  effects?: CivPromotionEffects;
  notYet?: readonly string[];
}

export interface CivBeliefBuildingEffect {
  building: string;
  minFollowers?: number;
  stats: YieldDelta;
}

export interface CivBeliefCityEffect {
  minPopulation?: number;
  river?: boolean;
  stats: YieldDelta;
}

export interface CivBeliefEffects {
  tileYields?: readonly CivTileYieldEffect[];
  buildingYields?: readonly CivBeliefBuildingEffect[];
  cityYields?: readonly CivBeliefCityEffect[];
  wonderYields?: YieldDelta;
  growthPercent?: number;
  borderGrowthPercent?: number;
  cityRangedPercent?: number;
  wonderProduction?: { percent: number; eras: readonly CivEraId[] };
  healNearCity?: number;
  faithFromKills?: { range: number };
  goldPerCity?: number;
  happinessPerCities?: { per: number };
  goldPerFollowers?: { per: number };
  goldOnConversion?: number;
  happinessPerForeignFollowers?: { per: number };
  faithPerForeignCity?: number;
  culturePerForeignFollowers?: { per: number };
  faithBuildings?: readonly { building: string; faithCost: number }[];
  faithUnits?: { beforeEra: CivEraId };
  sciencePerOtherFollower?: number;
  productionPercentPerFollower?: { percent: number; max: number };
  growthPercentAtPeace?: number;
  spreadRangePercent?: number;
  spreadPressurePercent?: { percent: number; withTech?: { tech: string; percent: number } };
  prophetCostPercent?: number;
  prophetStrengthPercent?: number;
  missionaryCostPercent?: number;
  missionaryStrengthPercent?: number;
  combatNearFriendlyPercent?: number;
  combatNearEnemyPercent?: number;
  faithOnGreatPerson?: number;
}

export interface CivBeliefDef {
  id: string;
  name: string;
  text: string;
  description: string;
  yields?: YieldDelta;
  effects?: CivBeliefEffects;
  notYet?: readonly string[];
}

export interface CivThemeProfile {
  id: CivThemeId;
  label: string;
  eraCap: CivEraId;
  eraNames: Readonly<Record<CivEraId, string>>;
  techNames: Readonly<Record<string, string>>;
  unitNames: Readonly<Record<string, string>>;
  buildingNames: Readonly<Record<string, string>>;
  improvementNames: Readonly<Record<string, string>>;
}

export interface ProductionItem {
  kind: "unit" | "building" | "wonder" | "trouble" | "operation";
  id: string;
  targetFactionId?: number;
  targetNodeKey?: string;
}

export interface CellSimState {
  improvement?: string | null;
  pillaged?: boolean;
  progress?: Record<string, number>;
}

export type CellYieldSourceKind = "terrain" | "resource" | "improvement" | "minor_burg" | "tech";

/** One additive contribution to a cell's OpenCiv yields, shown in the Living inspector. */
export interface CellYieldSource {
  kind: CellYieldSourceKind;
  id: string;
  label: string;
  yields: YieldDelta;
}

/** A `pack.goods` entry classified into OpenCiv's resource taxonomy. */
export interface CellResourceInfo {
  goodId: number;
  goodName: string;
  /** matching OpenCiv resource id, when the FMG good name maps cleanly */
  resourceId: string | null;
  class: CivResourceClass;
  /** strategic resources stay hidden until their reveal tech is known */
  revealed: boolean;
}

export interface CellTerrainInfo {
  terrain: string;
  isWater: boolean;
  isMountain: boolean;
  isHill: boolean;
  isWorkable: boolean;
  elevation: 0 | 1 | 2;
  movementCost: number;
  hasFreshWater: boolean;
}

export interface ReligionBeliefState {
  religionId: number;
  founderStateId: number;
  holyCityBurgId: number;
  pantheonId?: string;
  founderBeliefId?: string;
  followerBeliefIds: string[];
  enhancerBeliefId?: string;
  enhanced: boolean;
}

export interface HappinessBreakdown {
  base: number;
  luxuries: number;
  buildings: number;
  religion: number;
  cityUnhappiness: number;
  citizenUnhappiness: number;
  unrestUnhappiness: number;
}

export interface UnitSimState {
  unitTypeId: string;
  domain: UnitDomain;
  combatClass: UnitCombatClass;
  isUtility: boolean;
  hp: number;
  movement: number;
  maxMovement: number;
  combatStrength: number;
  rangedStrength: number;
  range: number;
  xp: number;
  level: number;
  promotions: string[];
  fortified: boolean;
  hasAttacked: boolean;
  spreadCharges?: number;
  conversionStrength?: number;
  workOrder?: { improvementId: string; turnsLeft: number } | null;
}

// ---------------------------------------------------------------------------
// Combined-arms armies (living-openciv-armies.md). Composition lives on
// `Regiment.units: ArmyBlock[]`; these are the per-tick state around it.
// ---------------------------------------------------------------------------

/** Per-tick state for one combat army. */
export interface ArmySimState {
  movement: number;
  maxMovement: number;
  stance: ArmyStance;
  hasFought: boolean;
  lastBattle?: ArmyBattleRecord;
}

export type ArmyStance = "march" | "encamp" | "fortify" | "raid" | "ambush";

export interface ArmyBattleRecord {
  tick: number;
  cell: number;
  role: "attacker" | "defender";
  winner: "attacker" | "defender";
  rounds: number;
  /** Σ hp this army lost. */
  lossesHp: number;
  /** Blocks reduced to 0 hp and removed. */
  blocksLost: number;
  /** Remaining hp / full-strength hp, 0..1. */
  survivorsHp: number;
}
