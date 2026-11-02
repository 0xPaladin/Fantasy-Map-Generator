// Living World simulation state types. See docs/plans/living-world.md
import type { ArmyUnit } from "@/conquest/engine/common/types";

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
  | "resolve_trouble"
  | "clear_lair"
  | "hire_adventurers";

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

/** Per-hero guild state; kept out of the chronicle figure so old maps stay additive. */
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

export interface ProvinceLair {
  id: string;
  name: string;
  level: number;
  theme: TroubleTheme;
  cell: number;
  burgId?: number;
  markerId?: number;
  raidThreshold: number;
  raidUnits: ArmyUnit[];
  defenders: ArmyUnit[];
  fortified: boolean;
  raidPending: boolean;
  seasonsActive: number;
}

export interface StateAgenda {
  kind: AgendaKind;
  label: string;
  targetStateId?: number;
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

export interface CapacityPoolEntry {
  gen: number;
  load: number;
}

export interface CapacityLedger {
  m: CapacityPoolEntry;
  w: CapacityPoolEntry;
  s: CapacityPoolEntry;
  c: CapacityPoolEntry;
}

export interface BurgConstructionState {
  buildingId: string;
  turnsLeft: number;
  checks: { m: boolean; w: boolean; s: boolean };
  pityBonus: number;
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
  /** Active lair entrenched in the province */
  lair?: ProvinceLair | null;
}

export interface StatePolitySim {
  stateId: number;
  rulerId?: number;
  agenda: StateAgenda | null;
  unravel: number;
  warExhaustion: number;
  capacity: CapacityLedger;
  claims: ClaimRecord[];
  grudges: GrudgeRecord[];
}

/** On-map popups queued by the simulation and claimed by the player (idle bonus). */
export type LivingPopupKind =
  | "bounty_trouble"
  | "bounty_lair"
  | "ascension_warning"
  | "relic_exposed"
  | "guild_petition";

export interface LivingPopup {
  id: number;
  kind: LivingPopupKind;
  cell: number;
  title: string;
  subtitle: string;
  createdTick: number;
  /** the popup auto-resolves (no reward) once the world reaches this tick */
  expiresAtTick: number;
  stateId?: number;
  provinceId?: number;
  burgId?: number;
  markerId?: number;
  /** guild_petition popups: the id of the awaiting PetitionDef */
  petitionId?: string;
  rewardGold: number;
  rewardRenown: number;
}

export type GuildMissionKind = "trouble" | "lair" | "excavate" | "pacify";

export interface MissionPhase {
  id: string;
  label: string;
  pool: HeroPool;
  tags: MissionTag[];
  dc: number;
  required: boolean;
}

export interface MissionPhaseResult {
  phaseId: string;
  heroId: number;
  roll: number;
  total: number;
  success: boolean;
  untrained?: boolean;
}

export type MissionOutcome = "full" | "partial" | "failed";

export interface ActiveGuildMission {
  id: number;
  kind: GuildMissionKind;
  figureId: number;
  targetCell: number;
  provinceId?: number;
  burgId?: number;
  markerId?: number;
  pool: "m" | "w" | "s" | "c";
  dc: number;
  progress: number;
  required: number;
  rewardGold: number;
  rewardRenown: number;
  /** target tags used for discipline and aspect fit */
  tags?: MissionTag[];
  /** leader first; two heroes below tier 3, up to three from tier 3 */
  party?: number[];
  phases?: MissionPhase[];
  phaseResults?: MissionPhaseResult[];
  /** per-hero Stamina committed when that hero first takes a phase */
  staminaByHero?: Record<number, number>;
  outcome?: MissionOutcome;
  /** Stamina spent across the party */
  staminaSpent?: number;
  /** excavate missions: a named HistoricalRelic is minted on success */
  rewardRelic?: boolean;
}

export type RelicCategory = "regalia" | "weapon" | "tome" | "charter" | "idol";

export type RelicHolder =
  | { kind: "vault" }
  | { kind: "reserve" }
  | { kind: "figure"; id: number }
  | { kind: "state"; id: number }
  | { kind: "ruin"; markerId: number; cell: number };

/** A lore-linked artifact unearthed from an excavation site */
export interface HistoricalRelic {
  id: number;
  name: string;
  category: RelicCategory;
  lore: string;
  originYear: number;
  originRealmId?: number;
  originFigureId?: number;
  bonuses: { m?: number; w?: number; s?: number; c?: number };
  cursed?: boolean;
  holder: RelicHolder;
}

export type IdleDoctrine = "auto_bounties" | "auto_lairs" | "auto_excavate" | "auto_pacify" | "auto_patron" | "manual";

/** Player guild: wallet, hero stable, idle doctrine and the transient on-map popups. */
export interface GuildState {
  tier: number;
  gold: number;
  renown: number;
  ageCount: number;
  /** false = resource-driven Guild Operations, true = classic free God Mode */
  sandboxGodMode: boolean;
  doctrine: IdleDoctrine;
  favoredStateId?: number;
  hqBurgId?: number;
  chapterBurgIds: number[];
  /** active guild hero figure ids */
  roster: number[];
  /** tavern recruitment pool figure ids */
  candidates: number[];
  /** permanent +1 base skill per prestige age, inherited by hero scions */
  legacyTier?: number;
  /** figureId -> vitals, temperament, injuries and per-hero doctrine */
  heroes?: Record<number, HeroGuildState>;
  missions: ActiveGuildMission[];
  /** all discovered relics, whatever their current holder */
  relics: HistoricalRelic[];
  /** figureId -> tick the hero is free again after a failed mission */
  cooldowns: Record<number, number>;
  /** excavation site marker.i values already dug */
  excavatedMarkers: number[];
  popups: LivingPopup[];
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
  | "lair";

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
  recentNews: LivingNewsItem[];
  /** 0..100 Age Finale meter; absent on old saves (treated as 0) */
  eschaton?: number;
  /** lazily initialized guild wallet, mission list and on-map popups */
  guild?: GuildState;
}
