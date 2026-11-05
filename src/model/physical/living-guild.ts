// Living World Guild Engine: manages guild state, operations, missions, relics, petitions, and player faction bridging.
import { valueModifier } from "@/conquest/engine/game/saves";
import { ACTION_DEFS, type ActionId, actionCheck, DIE_SIDES, legacyActionForPool } from "@/data/character-actions";
import { GUILD_OPERATIONS, type GuildOperationKind } from "@/data/guild-operations";
import { figureArchetype, figureDisciplines } from "@/data/hero-archetypes";
import { aspectBonus } from "@/data/hero-aspects";
import { disciplineBonus, matchingDisciplines } from "@/data/hero-disciplines";
import { HERO_INJURY_LABELS, injuryPenalty, STAMINA_RESERVE_MINIMUM } from "@/data/hero-vitals";
import { isLairStateCapable } from "@/data/living-lairs";
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
import { getTroubleDef, isTroubleStatePromotable } from "@/data/living-troubles";
import { buildMissionPhases, type MissionPhaseInput, phasesForParty } from "@/data/mission-phases";
import { excavationMissionTags, lairMissionTags, PACIFY_MISSION_TAGS, troubleMissionTags } from "@/data/mission-tags";
import {
  applyHeroLevels,
  autoPickPendingPaths,
  ensureHeroGuildState,
  ensureHeroSheet,
  figureLevel,
  findFigure,
  GUILD_MAX_HEROES,
  maxHeroesForTier,
  recoverHeroes,
  refreshCandidates,
  spawnProtege
} from "@/model/physical/living-heroes";
import { LivingThreats } from "@/model/physical/living-threats";
import type { Burg } from "@/model/political/burgs-generator";
import { Factions } from "@/model/political/factions-generator";
import type { Marker } from "@/model/story/markers-generator";
import type { Faction } from "@/types/factions";
import type { HistoricalFigure, HistoryEventType, HistRef, Realm } from "@/types/history";
import type {
  ActiveGuildMission,
  CapacityLedger,
  DisciplineId,
  GuildMissionKind,
  GuildState,
  GuildTarget,
  HeroDoctrine,
  HeroGuildState,
  HeroInjury,
  HistoricalRelic,
  IdleDoctrine,
  LivingNewsKind,
  LivingPopup,
  LivingPopupKind,
  LivingWorldState,
  MissionOutcome,
  MissionPhase,
  MissionTag,
  PartyPreview,
  PartyPreviewMember,
  ProvinceSimState
} from "@/types/living";
import type { Province } from "@/types/subdivided-pack";
import { minmax } from "@/utils";
import { createRng, type Rng } from "@/utils/rng";
import { Chronicle } from "./history-generator";

export const GUILD_RENOWN_THRESHOLDS = [0, 50, 150, 350, 700] as const;
export const GUILD_TIER_TITLES = [
  "Wayfarers' Lodge",
  "Chartered Company",
  "Grand Adventurers' Guild",
  "Sovereign Order",
  "Immortal Conclave"
] as const;
export { GUILD_MAX_HEROES, maxHeroesForTier };

export const GUILD_DUES_PER_CHAPTER = 2;
export { RELIC_LEASE_TRIBUTE };
export const MIN_AUTO_DISPATCH_FIT = 0.25;
export const MAX_LIVING_POPUPS = 6;
export const POPUP_LIFETIME_SEASONS = 3;

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

interface PetitionTarget {
  def: PetitionDef;
  cell: number;
  provinceId?: number;
  burgId?: number;
  stateId?: number;
  context: PetitionContext;
}

export interface GuildHost {
  getState(): LivingWorldState;
  rng?(tag: string, id?: number, salt?: number): Rng;
  pushNews?(
    living: LivingWorldState,
    news: { kind: string; text: string; cell?: number; burgId?: number; stateId?: number; provinceId?: number }
  ): void;
  pushHistory?(type: HistoryEventType, refs: HistRef[], cell?: number, text?: string): void;
  quellTrouble?(provinceId: number): boolean;
  clearLair?(lair: unknown, victorName?: string): void;
  smiteLair?(provinceId: number): boolean;
  removeLairMarker?(markerId?: number): void;
  forceWar?(stateId: number, otherId?: number): boolean;
  isAtWar?(stateId: number, otherId: number): boolean;
  pacifyBurg?(burgId: number): boolean;
  completeAsset?(burgId: number): boolean;
  sparkRebellion?(stateId: number, burgId?: number): boolean;
  promoteTroubleToState?(provinceId: number, capitalBurgId?: number): number | null;
  smiteRuler?(stateId: number): boolean;
  recomputeStateCapacity?(stateId: number): CapacityLedger;
  relieveEschaton?(living: LivingWorldState, amount?: number): void;
  addRuinMarker?(cell: number, name: string): number;
  spawnProtege?(living: LivingWorldState, veteran: HistoricalFigure): HistoricalFigure | undefined;
}

let hostRef: GuildHost | null = null;

export function setGuildHost(host: GuildHost): void {
  hostRef = host;
}

function getHost(): GuildHost {
  return hostRef ?? (globalThis as unknown as { Living: GuildHost }).Living;
}

function getRng(tag: string, id = 0, salt = 0): Rng {
  const host = getHost();
  if (host.rng) return host.rng(tag, id, salt);
  const living = host.getState();
  return createRng(`${living.seed}:living:${living.tick}:${tag}:${id}`);
}

function pushNews(
  living: LivingWorldState,
  news: { kind: string; text: string; cell?: number; burgId?: number; stateId?: number; provinceId?: number }
): void {
  getHost().pushNews?.(living, news);
}

function pushHistory(type: HistoryEventType, refs: HistRef[], cell: number | undefined, text: string): void {
  getHost().pushHistory?.(type, refs, cell, text);
}

export function guildTierForRenown(renown: number): number {
  let tier = 1;
  for (let i = 1; i < GUILD_RENOWN_THRESHOLDS.length; i++) {
    if (renown >= GUILD_RENOWN_THRESHOLDS[i]!) tier = i + 1;
  }
  return tier;
}

/** Party size: two heroes below tier 3, three from tier 3. */
export const maxPartyForTier = (tier: number): number => (tier >= 3 ? 3 : 2);

/** Guild hall passive: +1 to checks at tier 2, +2 from tier 4 */
export const guildCheckBonus = (tier: number): number => (tier >= 4 ? 2 : tier >= 2 ? 1 : 0);

export function heroAlignmentModifier(figure: HistoricalFigure): number {
  return Math.max(-1, Math.min(1, (figure.virtues?.length ?? 0) - (figure.vices?.length ?? 0)));
}

export function heroMissionFit(figure: HistoricalFigure, tags: readonly MissionTag[] = []): HeroMissionFit {
  const disciplines = figureDisciplines(figure);
  const matchedDisciplines = matchingDisciplines(disciplines, tags);
  return {
    matchedDisciplines,
    discipline: Math.min(2, matchedDisciplines.length),
    aspect: aspectBonus(figure, tags),
    alignment: heroAlignmentModifier(figure),
    total: disciplineBonus(disciplines, tags) + aspectBonus(figure, tags)
  };
}

/** @deprecated legacy d20 adapter for guild operations and trouble resolution. */
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

export function emptyGuild(): GuildState {
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
export function pickGuildHq(): number | undefined {
  const living = (pack.burgs ?? []).filter(burg => burg?.i && !burg.removed);
  const capitals = living.filter(burg => burg.capital);
  const pool = capitals.length > 0 ? capitals : living;
  return pool.sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.i - b.i)[0]?.i;
}

/** Return the guild wallet, initializing it lazily for maps saved before the Guild existed */
export function getGuild(): GuildState {
  const living = getHost().getState();
  if (!living.guild) living.guild = emptyGuild();

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
  guild.missions ??= [];
  guild.relics ??= [];
  guild.cooldowns ??= {};
  guild.excavatedMarkers ??= [];
  guild.popups ??= [];

  if (guild.hqBurgId === undefined) guild.hqBurgId = pickGuildHq();
  if (guild.chapterBurgIds.length === 0 && guild.hqBurgId) guild.chapterBurgIds = [guild.hqBurgId];
  if (guild.favoredStateId === undefined) {
    guild.favoredStateId = pack.states?.find(state => state?.i && !state.removed)?.i;
  }

  for (const id of [...guild.roster, ...guild.candidates]) {
    const figure = findFigure(id);
    if (figure) ensureHeroGuildState(guild, figure);
  }

  const faction = getPlayerFaction();
  if (faction) {
    faction.treasury = guild.gold;
    faction.influence = guild.renown;
    if (guild.roster.length) faction.memberIds = [...guild.roster];
    else if (faction.memberIds?.length) guild.roster = [...faction.memberIds];
    guild.missions = faction.missions ?? guild.missions;
    guild.relics = faction.relics ?? guild.relics;
  }
  return guild;
}

/** Return the active player-controlled faction in pack.factions */
export function getPlayerFaction(): Faction {
  const living = getHost().getState();
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
        treasury: living.guild?.gold ?? 0,
        influence: living.guild?.renown ?? 0
      });
    }
    living.playerFactionId = faction.i;
  }
  return faction;
}

/** Change the active player-controlled faction */
export function setPlayerFaction(factionId: number): boolean {
  const faction = pack.factions?.[factionId];
  if (!faction || faction.removed) return false;
  const living = getHost().getState();
  living.playerFactionId = factionId;
  const guild = living.guild;
  if (guild) {
    guild.gold = faction.treasury;
    guild.renown = faction.influence;
    guild.tier = Math.min(3, Math.max(1, faction.tier)) as 1 | 2 | 3;
    guild.roster = faction.memberIds ? [...faction.memberIds] : [];
    guild.candidates = faction.candidateIds ? [...faction.candidateIds] : [];
    guild.missions = faction.missions ? [...faction.missions] : [];
    guild.relics = faction.relics ? [...faction.relics] : [];
  }
  return true;
}

/** Synchronize the legacy GuildState with the active player faction */
export function syncPlayerFaction(living: LivingWorldState): void {
  const faction = getPlayerFaction();
  if (!faction) return;
  const guild = living.guild;
  if (guild) {
    if (faction.treasury > 0 && guild.gold === 0) guild.gold = faction.treasury;
    else faction.treasury = guild.gold;

    if (faction.influence > 0 && guild.renown === 0) guild.renown = faction.influence;
    else faction.influence = guild.renown;

    if (guild.tier > faction.tier) faction.tier = guild.tier;
    else guild.tier = Math.min(3, Math.max(1, faction.tier)) as 1 | 2 | 3;

    if (guild.roster.length > 0) faction.memberIds = [...guild.roster];
    else if (faction.memberIds?.length) guild.roster = [...faction.memberIds];

    if (guild.candidates.length > 0) faction.candidateIds = [...guild.candidates];
    else if (faction.candidateIds?.length) guild.candidates = [...faction.candidateIds];

    if (guild.missions.length > 0) faction.missions = [...guild.missions];
    else if (faction.missions?.length) guild.missions = [...faction.missions];

    if (guild.relics.length > 0) faction.relics = [...guild.relics];
    else if (faction.relics?.length) guild.relics = [...faction.relics];
  }
}

export function syncGuildTier(living: LivingWorldState, guild: GuildState): void {
  const tier = guildTierForRenown(guild.renown);
  if (tier <= guild.tier) return;

  guild.tier = tier;
  const faction = getPlayerFaction();
  if (faction) faction.tier = tier;
  pushNews(living, {
    kind: "muster",
    text: `The Guild Hall was raised to tier ${tier}: ${GUILD_TIER_TITLES[tier - 1]}.`
  });
}

/** On-map popups currently waiting to be claimed */
export function getPopups(): LivingPopup[] {
  return getGuild().popups;
}

/** Active guild hero missions */
export function getMissions(): ActiveGuildMission[] {
  return getGuild().missions;
}

/** Every discovered relic, whatever its current holder */
export function getRelics(): HistoricalRelic[] {
  return getGuild().relics ?? [];
}

export function setDoctrine(doctrine: IdleDoctrine): void {
  getGuild().doctrine = doctrine;
}

export function setSandboxGodMode(enabled: boolean): void {
  getGuild().sandboxGodMode = enabled;
}

export function setFavoredState(stateId: number): void {
  const state = pack.states?.[stateId];
  if (!state?.i || state.removed) return;
  getGuild().favoredStateId = stateId;
}

export function guildOperationCost(kind: GuildOperationKind): number {
  return GUILD_OPERATIONS[kind].cost;
}

function isHeroIdle(guild: GuildState, figureId: number): boolean {
  if (guild.missions.some(mission => mission.figureId === figureId || mission.party?.includes(figureId))) return false;
  const figure = findFigure(figureId);
  const state = figure ? ensureHeroGuildState(guild, figure) : undefined;
  const tick = getHost().getState().tick;
  if (state?.downUntilTick !== undefined && state.downUntilTick > tick) return false;
  return (guild.cooldowns[figureId] ?? 0) <= tick;
}

function operatorScore(figure: HistoricalFigure, pool: "m" | "w" | "s" | "c" | "best_sc" | undefined): number {
  const skills = figure.skills ?? { m: 0, w: 0, s: 0, c: 0 };
  if (pool === "best_sc") return Math.max(skills.s, skills.c);
  if (pool) return skills[pool];
  return skills.m + skills.w + skills.s + skills.c;
}

/** The best idle roster hero allowed to lead this operation. */
export function guildOperator(kind: GuildOperationKind): HistoricalFigure | undefined {
  const guild = getGuild();
  const def = GUILD_OPERATIONS[kind];
  return guild.roster
    .filter(id => isHeroIdle(guild, id))
    .map(id => findFigure(id))
    .filter((figure): figure is HistoricalFigure => Boolean(figure) && figure!.death === undefined)
    .filter(figure => def.archetypes.includes(figureArchetype(figure).id))
    .sort((a, b) => operatorScore(b, def.check?.pool) - operatorScore(a, def.check?.pool) || a.i - b.i)[0];
}

function checkPool(figure: HistoricalFigure, pool: "m" | "w" | "s" | "c" | "best_sc"): "m" | "w" | "s" | "c" {
  if (pool !== "best_sc") return pool;
  const skills = figure.skills ?? { m: 0, w: 0, s: 0, c: 0 };
  return skills.c >= skills.s ? "c" : "s";
}

function chargeOperation(
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
export function guildPacifyMediate(burgId: number): boolean {
  const host = getHost();
  const living = host.getState();
  const guild = getGuild();
  const kind: GuildOperationKind = "pacify_mediate";
  const operator = guildOperator(kind);
  if (!operator || guild.gold < guildOperationCost(kind)) return false;

  const pacified = host.pacifyBurg ? host.pacifyBurg(burgId) : true;
  if (!pacified) return false;
  if (!chargeOperation(living, guild, operator, kind)) return false;

  const burg = pack.burgs?.[burgId];
  const provinceId = burg ? pack.cells.province?.[burg.cell] : undefined;
  const pSim = provinceId !== undefined ? living.provinces?.[provinceId] : undefined;
  if (pSim) pSim.order = Math.min(100, pSim.order + 10);
  pushNews(living, {
    kind: "pacify",
    text: `${operator.name} mediated ${burg?.name ?? "the burg"} back to order (+10 province order).`,
    cell: burg?.cell,
    burgId,
    stateId: provinceId !== undefined ? pack.provinces?.[provinceId]?.state : undefined
  });
  return true;
}

/** Paid charter: complete the burg's current construction immediately. */
export function guildRushAssetCharter(burgId: number): boolean {
  const host = getHost();
  const living = host.getState();
  const guild = getGuild();
  const kind: GuildOperationKind = "rush_charter";
  const operator = guildOperator(kind);
  if (!operator || guild.gold < guildOperationCost(kind)) return false;

  const completed = host.completeAsset ? host.completeAsset(burgId) : true;
  if (!completed) return false;
  if (!chargeOperation(living, guild, operator, kind)) return false;

  pushNews(living, {
    kind: "build",
    text: `${operator.name} chartered the works at ${pack.burgs?.[burgId]?.name ?? "the burg"}.`,
    cell: pack.burgs?.[burgId]?.cell,
    burgId
  });
  return true;
}

/** Paid sedition: spark a revolt or promote a state-capable trouble. */
export function guildInciteUprising(burgId: number): boolean {
  const host = getHost();
  const living = host.getState();
  const guild = getGuild();
  const kind: GuildOperationKind = "incite_uprising";
  const operator = guildOperator(kind);
  if (!operator || guild.gold < guildOperationCost(kind)) return false;

  const burg = pack.burgs?.[burgId];
  if (!burg?.i || burg.removed || !burg.state) return false;
  const provinceId = pack.cells.province?.[burg.cell];
  const trouble = provinceId !== undefined ? living.provinces?.[provinceId]?.trouble : undefined;
  const coup =
    trouble && provinceId !== undefined && isTroubleStatePromotable(trouble.id) && host.promoteTroubleToState
      ? host.promoteTroubleToState(provinceId, burgId) !== null
      : false;
  const ok = coup || (host.sparkRebellion ? host.sparkRebellion(burg.state, burgId) : true);
  if (!ok) return false;
  if (!chargeOperation(living, guild, operator, kind)) return false;

  pushNews(living, {
    kind: "revolt",
    text: `${operator.name} incited ${burg.name ?? "the burg"} against ${pack.states?.[burg.state]?.name ?? "its ruler"}.`,
    cell: burg.cell,
    burgId,
    stateId: burg.state
  });
  return true;
}

/** Paid assassination: a Shadow's C check to slay a ruler and force succession. */
export function guildAssassinateRuler(stateId: number): boolean {
  const host = getHost();
  const living = host.getState();
  const guild = getGuild();
  const kind: GuildOperationKind = "assassinate_ruler";
  const def = GUILD_OPERATIONS[kind];
  const operator = guildOperator(kind);
  const state = pack.states?.[stateId];
  const sSim = living.states?.[stateId];
  if (!operator || guild.gold < def.cost || !state?.i || state.removed || !sSim) return false;
  if (sSim.rulerId === undefined || findFigure(sSim.rulerId)?.death !== undefined) return false;
  if (!chargeOperation(living, guild, operator, kind)) return false;

  const poolGen = sSim.capacity?.c?.gen ?? 0;
  const rng = getRng("guild:operation", stateId * 1000 + operator.i);
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
  if (!check.success || !(host.smiteRuler ? host.smiteRuler(stateId) : true)) {
    guild.cooldowns[operator.i] = living.tick + 2;
    pushNews(living, {
      kind: "succession",
      text: `${operator.name}'s attempt on ${state.name}'s ruler failed (rolled ${check.total} vs DC ${def.check!.dc}).`,
      cell: state.center,
      stateId
    });
    return false;
  }

  pushNews(living, {
    kind: "succession",
    text: `${operator.name} slew the ruler of ${state.name}; succession follows.`,
    cell: state.center,
    stateId
  });
  return true;
}

/** Paid diplomacy: broker peace with a current enemy, or provoke a border war. */
export function guildBrokerWar(stateId: number, otherId?: number): boolean {
  const host = getHost();
  const living = host.getState();
  const guild = getGuild();
  const kind: GuildOperationKind = "war_broker";
  const def = GUILD_OPERATIONS[kind];
  const operator = guildOperator(kind);
  const state = pack.states?.[stateId];
  if (!operator || guild.gold < def.cost || !state?.i || state.removed) return false;
  if (!chargeOperation(living, guild, operator, kind)) return false;

  const isAtWar = host.isAtWar ?? ((a: number, b: number) => pack.states?.[a]?.diplomacy?.[b] === "Enemy");
  const enemyId =
    otherId !== undefined && isAtWar(stateId, otherId)
      ? otherId
      : state.diplomacy?.findIndex((relation, index) => relation === "Enemy" && index !== stateId);
  const pool = checkPool(operator, def.check!.pool);
  const poolGen = living.states?.[stateId]?.capacity[pool]?.gen ?? 0;
  const rng = getRng("guild:operation", stateId * 1000 + operator.i);
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
    pushNews(living, {
      kind: "war",
      text: `${operator.name}'s brokerage in ${state.name} failed (rolled ${check.total} vs DC ${def.check!.dc}).`,
      cell: state.center,
      stateId
    });
    return false;
  }

  if (typeof enemyId === "number" && enemyId > 0) {
    const enemy = pack.states?.[enemyId];
    if (!enemy?.i || enemy.removed || !isAtWar(stateId, enemyId)) {
      if (!host.forceWar?.(stateId, otherId)) return false;
      return true;
    }
    state.diplomacy ??= [];
    enemy.diplomacy ??= [];
    state.diplomacy[enemyId] = "Neutral";
    enemy.diplomacy[stateId] = "Neutral";
    const sSim = living.states?.[stateId];
    const eSim = living.states?.[enemyId];
    if (sSim) sSim.warExhaustion = Math.max(0, sSim.warExhaustion - 20);
    if (eSim) eSim.warExhaustion = Math.max(0, eSim.warExhaustion - 20);
    const text = `${operator.name} brokered a truce between ${state.name} and ${enemy.name}.`;
    pushNews(living, {
      kind: "war",
      text,
      cell: enemy.center,
      stateId,
      burgId: enemy.capital
    });
    pushHistory(
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

  if (!host.forceWar?.(stateId, otherId)) return false;
  pushNews(living, {
    kind: "war",
    text: `${operator.name} brokered ${state.name} into a border war.`,
    cell: state.center,
    stateId
  });
  return true;
}

/** Place a found relic: carried by the digger, stored in the vault, or held in reserve. */
export function placeRelic(relic: HistoricalRelic, guild: GuildState, figure?: HistoricalFigure): void {
  if (figure && !equippedRelic(guild.relics ?? [], figure.i)) {
    relic.holder = { kind: "figure", id: figure.i };
  } else if (vaultHasRoom(guild)) {
    relic.holder = { kind: "vault" };
  } else {
    relic.holder = { kind: "reserve" };
  }
}

/** Mint a lore-linked relic named after the nearest fallen realm, a dead hero, or the site itself */
export function mintRelicFromMarker(marker: Marker, seedId: number, figure?: HistoricalFigure): HistoricalRelic {
  const guild = getGuild();
  const rng = getRng("guild:relic", seedId);
  const history = Chronicle.sync();

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

  const dead = (history.figures ?? []).filter(fig => fig.death !== undefined);
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
  placeRelic(relic, guild, figure);
  guild.relics.push(relic);
  return relic;
}

/** Recover any relics a fallen capital buried at this marker */
export function recoverRelicsFromMarker(
  guild: GuildState,
  markerId: number | undefined,
  figure?: HistoricalFigure
): void {
  if (markerId === undefined) return;
  for (const relic of guild.relics ?? []) {
    if (relic.holder.kind === "ruin" && relic.holder.markerId === markerId) {
      placeRelic(relic, guild, figure);
    }
  }
}

/** A fallen capital forces the state's leased relics into a fresh chronicle ruin at the capital cell. */
export function dropStateRelicsToRuin(stateId: number, burg: Burg): HistoricalRelic[] {
  const host = getHost();
  const living = host.getState();
  const guild = getGuild();
  const dropped = guild.relics.filter(relic => relic.holder.kind === "state" && relic.holder.id === stateId);
  if (dropped.length === 0) return [];

  const markerId = host.addRuinMarker
    ? host.addRuinMarker(burg.cell, `Ruins of ${burg.name ?? "the fallen capital"}`)
    : 0;
  for (const relic of dropped) relic.holder = { kind: "ruin", markerId, cell: burg.cell };

  const sSim = living.states?.[stateId];
  if (sSim && host.recomputeStateCapacity) sSim.capacity = host.recomputeStateCapacity(stateId);

  pushNews(living, {
    kind: "develop",
    text: `${burg.name ?? "The capital"} fell; ${dropped.length} leased Guild relic${
      dropped.length === 1 ? "" : "s"
    } lay buried in the ruins.`,
    cell: burg.cell,
    stateId
  });
  return dropped;
}

/** Seasonal bookkeeping for leased relics: tribute gold and unravel relief. */
export function stepRelics(living: LivingWorldState): void {
  const guild = living.guild;
  if (!guild?.relics?.length) return;

  for (const relic of guild.relics) {
    if (relic.holder.kind !== "state") continue;
    guild.gold += RELIC_LEASE_TRIBUTE;
    const sSim = living.states?.[relic.holder.id];
    if (sSim) sSim.unravel = Math.max(0, sSim.unravel - 1);
  }
}

/** Place a vault relic in a hero's hands (one relic per hero). */
export function equipRelic(relicId: number, figureId: number): boolean {
  const guild = getGuild();
  if (!guild.roster.includes(figureId)) return false;
  if (findFigure(figureId)?.death !== undefined) return false;

  const relic = guild.relics?.find(entry => entry.id === relicId);
  if (!relic) return false;

  const previous = (guild.relics ?? []).find(
    held => held.holder.kind === "figure" && held.holder.id === figureId && held.id !== relicId
  );
  relic.holder = { kind: "figure", id: figureId };
  if (previous) placeRelic(previous, guild);
  return true;
}

/** Enshrine a relic in the Guild Vault, up to one relic per guild tier. */
export function enshrineRelic(relicId: number): boolean {
  const guild = getGuild();
  const relic = guild.relics?.find(entry => entry.id === relicId);
  if (!relic) return false;
  if (relic.holder.kind === "vault") return true;
  if (!vaultHasRoom(guild)) return false;

  relic.holder = { kind: "vault" };
  return true;
}

/** Lease a vault relic to a sovereign state: +gen, -1 unravel/season, tribute gold. */
export function leaseRelic(relicId: number, stateId: number): boolean {
  const state = pack.states?.[stateId];
  if (!state?.i || state.removed) return false;

  const host = getHost();
  const guild = getGuild();
  const relic = guild.relics?.find(entry => entry.id === relicId);
  if (relic?.holder.kind !== "vault") return false;

  relic.holder = { kind: "state", id: stateId };
  const sSim = host.getState().states?.[stateId];
  if (sSim && host.recomputeStateCapacity) sSim.capacity = host.recomputeStateCapacity(stateId);
  return true;
}

/** Return a relic from any holder to the Guild Vault, or the reserve when it is full. */
export function recallRelic(relicId: number): boolean {
  const host = getHost();
  const guild = getGuild();
  const relic = guild.relics?.find(entry => entry.id === relicId);
  if (!relic || relic.holder.kind === "vault" || relic.holder.kind === "ruin") return false;

  const previous = relic.holder;
  relic.holder = vaultHasRoom(guild) ? { kind: "vault" } : { kind: "reserve" };
  if (previous.kind === "state") {
    const sSim = host.getState().states?.[previous.id];
    if (sSim && host.recomputeStateCapacity) sSim.capacity = host.recomputeStateCapacity(previous.id);
  }
  return true;
}

/** Sandbox god action: excavate a site immediately, minting its seeded relic. */
export function excavateMarker(markerId: number): boolean {
  const host = getHost();
  const living = host.getState();
  const guild = getGuild();
  const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
  if (!marker || !isExcavationMarker(marker) || guild.excavatedMarkers.includes(markerId)) return false;

  guild.excavatedMarkers.push(markerId);
  recoverRelicsFromMarker(guild, marker.i);

  if (marker.chronicle || getRng("guild:excavate", marker.i).chance(0.5)) {
    const relic = mintRelicFromMarker(marker, marker.i * 7919 + living.tick);
    pushNews(living, {
      kind: "develop",
      text: `The Guild excavated ${marker.name} and recovered ${relic.name}.`,
      cell: marker.cell
    });
  }
  return true;
}

/** @deprecated legacy pool score for guild operations and trouble resolution. */
export function heroScore(
  figure: HistoricalFigure,
  pool: "m" | "w" | "s" | "c",
  tags: readonly MissionTag[] = []
): number {
  const fit = heroMissionFit(figure, tags);
  return (figure.skills?.[pool] ?? 0) + fit.alignment + fit.aspect + fit.discipline;
}

/** Old mission DCs were d20-shaped; action checks use the 4/6/8/10 ladder. */
export function actionDcForMission(dc: number): number {
  return Math.max(4, Math.min(10, dc - 8));
}

/** Old saves carry a pool on phases; turns it into the action that replaced it. */
function phaseAction(phase: MissionPhase & { pool?: "m" | "w" | "s" | "c" }): ActionId {
  return phase.action ?? legacyActionForPool(phase.pool ?? "m");
}

function poolForAction(action: ActionId): "m" | "w" | "s" | "c" {
  if (action === "strike" || action === "guard" || action === "maneuver") return "m";
  if (action === "investigate" || action === "craft" || action === "treat") return "w";
  if (action === "persuade" || action === "deceive" || action === "command") return "s";
  return "c";
}

function actionScore(figure: HistoricalFigure, phase: MissionPhase): number {
  const hero = ensureHeroSheet(figure);
  const action = phaseAction(phase);
  const sides = DIE_SIDES[hero.actions[action] ?? "d4"];
  const attribute = hero.attributes[ACTION_DEFS[action].attribute] ?? 0;
  const fit = heroMissionFit(figure, phase.tags);
  return sides + attribute + fit.alignment + fit.aspect + fit.discipline;
}

export function missionPhaseInput(target: GuildTarget): MissionPhaseInput {
  const chronicle =
    target.kind === "excavate" &&
    target.markerId !== undefined &&
    Boolean((pack.markers ?? []).find(marker => marker?.i === target.markerId)?.chronicle);
  return {
    kind: target.kind,
    dc: actionDcForMission(target.dc),
    tags: target.tags,
    level: target.level,
    chronicle
  };
}

export function missionPhases(target: GuildTarget): MissionPhase[] {
  return buildMissionPhases(missionPhaseInput(target));
}

/** Party companions wait for click-dispatch when their doctrine is manual. */
export function idlePartyCandidates(guild: GuildState): HistoricalFigure[] {
  return guild.roster
    .filter(id => isHeroIdle(guild, id))
    .map(id => findFigure(id))
    .filter((figure): figure is HistoricalFigure => Boolean(figure) && figure!.death === undefined)
    .filter(figure => ensureHeroGuildState(guild, figure).doctrine !== "manual");
}

export function phaseScore(figure: HistoricalFigure, phase: MissionPhase): number {
  return actionScore(figure, phase);
}

/** Leader first, then the best coverage companions up to the tier's party limit. */
export function autoFillParty(
  _living: LivingWorldState,
  guild: GuildState,
  target: GuildTarget,
  leaderId?: number
): HistoricalFigure[] {
  const limit = maxPartyForTier(guild.tier);
  const phases = missionPhases(target);
  const leader =
    leaderId !== undefined && guild.roster.includes(leaderId) && isHeroIdle(guild, leaderId)
      ? findFigure(leaderId)
      : undefined;

  const party: HistoricalFigure[] = [];
  if (leader && leader.death === undefined) party.push(leader);

  const candidates = idlePartyCandidates(guild).filter(figure => !party.some(hero => hero.i === figure.i));
  if (party.length === 0) {
    const ranked = [...candidates].sort(
      (a, b) =>
        Math.max(...phases.map(phase => phaseScore(b, phase))) -
          Math.max(...phases.map(phase => phaseScore(a, phase))) || a.i - b.i
    );
    if (ranked.length === 0) return [];
    party.push(ranked[0]!);
    candidates.splice(candidates.indexOf(ranked[0]!), 1);
  }

  while (party.length < limit && candidates.length > 0) {
    candidates.sort(
      (a, b) =>
        phases.reduce((sum, phase) => sum + Math.max(0, phaseScore(b, phase)), 0) -
          phases.reduce((sum, phase) => sum + Math.max(0, phaseScore(a, phase)), 0) || a.i - b.i
    );
    party.push(candidates.shift()!);
  }

  return party;
}

export function pickPhaseHero(
  party: readonly HistoricalFigure[],
  contributions: ReadonlyMap<number, number>,
  phase: MissionPhase
): { figure: HistoricalFigure; untrained: boolean } | undefined {
  const eligible = party.filter(figure => (contributions.get(figure.i) ?? 0) < 2);
  if (eligible.length === 0) return undefined;
  const trained = eligible.filter(figure => ensureHeroSheet(figure).actions[phaseAction(phase)] !== "d4");
  const pool = trained.length > 0 ? trained : eligible;
  const figure = [...pool].sort((a, b) => phaseScore(b, phase) - phaseScore(a, phase) || a.i - b.i)[0];
  return figure ? { figure, untrained: trained.length === 0 } : undefined;
}

export function partySynergy(guild: GuildState, party: readonly HistoricalFigure[]): number {
  if (party.length === 0) return 0;
  const primaryPools = party.map(figure => figureArchetype(figure).primaryPool);
  const distinct = new Set(primaryPools).size;
  const leaderState = ensureHeroGuildState(guild, party[0]!);
  const support = party.some(figure => {
    const state = ensureHeroGuildState(guild, figure);
    return state.doctrine === "support" || figureDisciplines(figure).includes("healing");
  });
  const duplicated = primaryPools.some((pool, index) => primaryPools.indexOf(pool) !== index);

  let synergy = 0;
  if (distinct >= 3) synergy += 1;
  if (leaderState.temperament.teamplay >= 0.7) synergy += 1;
  if (duplicated && !support) synergy -= 1;
  return Math.max(-1, Math.min(1, synergy));
}

/** Chance that a hero succeeds at a phase with the current state and guild bonuses. */
export function missionChance(
  living: LivingWorldState,
  guild: GuildState,
  figure: HistoricalFigure,
  phase: Pick<MissionPhase, "action" | "dc" | "tags">
): number {
  const hero = ensureHeroSheet(figure);
  const action = phaseAction(phase as MissionPhase);
  const sides = DIE_SIDES[hero.actions[action] ?? "d4"];
  const attribute = hero.attributes[ACTION_DEFS[action].attribute] ?? 0;
  const carried = equippedRelic(guild.relics ?? [], figure.i);
  const tags = phase.tags ?? [];
  const fit = heroMissionFit(figure, tags);
  const state = ensureHeroGuildState(guild, figure);
  const injuries = injuryPenalty(state.injuries, tags, living.tick);
  const modifier =
    attribute +
    fit.alignment +
    fit.aspect +
    fit.discipline +
    guildCheckBonus(guild.tier) +
    (carried?.bonuses[poolForAction(action)] ?? 0) -
    injuries;
  return minmax((sides - phase.dc + 1 + modifier) / sides, 0, 1);
}

export function partyChance(
  living: LivingWorldState,
  guild: GuildState,
  party: readonly HistoricalFigure[],
  target: GuildTarget
): number {
  if (party.length === 0) return 0;
  const phases = phasesForParty(missionPhases(target), party.length);
  const contributions = new Map<number, number>();
  let total = 0;
  for (const phase of phases) {
    const choice = pickPhaseHero(party, contributions, phase);
    if (!choice) continue;
    contributions.set(choice.figure.i, (contributions.get(choice.figure.i) ?? 0) + 1);
    total += missionChance(living, guild, choice.figure, phase);
  }
  return total / Math.max(1, phases.length);
}

export function doctrineWeight(doctrine: HeroDoctrine, kind: GuildMissionKind): number {
  if (doctrine === "manual") return 0;
  if (doctrine === "hunt_lairs") return kind === "lair" ? 2 : kind === "trouble" ? 1 : 0.25;
  if (doctrine === "hunt_troubles") return kind === "trouble" ? 2 : kind === "lair" ? 1 : 0.25;
  if (doctrine === "excavate") return kind === "excavate" ? 2 : 0.1;
  if (doctrine === "support") return kind === "pacify" ? 2 : kind === "trouble" ? 1 : 0.5;
  return kind === "pacify" ? 1.5 : 0.5;
}

export function hasTargetMission(
  guild: GuildState,
  kind: GuildMissionKind,
  provinceId?: number,
  markerId?: number
): boolean {
  return guild.missions.some(mission => {
    if (mission.kind !== kind) return false;
    return markerId !== undefined ? mission.markerId === markerId : mission.provinceId === provinceId;
  });
}

/** The best mission available in one province (trouble before lair). */
export function provinceTarget(living: LivingWorldState, guild: GuildState, provinceId: number): GuildTarget | null {
  const province = pack.provinces?.[provinceId];
  const pSim = living.provinces?.[provinceId];
  if (!province?.i || province.removed || !pSim) return null;

  const trouble = pSim.trouble;
  if (trouble && !hasTargetMission(guild, "trouble", provinceId)) {
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
  if (lair && !hasTargetMission(guild, "lair", provinceId)) {
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
export function excavationTarget(guild: GuildState, marker: Marker): GuildTarget | null {
  if (!marker || !isExcavationMarker(marker)) return null;
  if (guild.excavatedMarkers.includes(marker.i)) return null;
  if (hasTargetMission(guild, "excavate", undefined, marker.i)) return null;

  const rng = getRng("guild:excavate", marker.i);
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
export function burgTarget(living: LivingWorldState, guild: GuildState, burgId: number): GuildTarget | null {
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
export function missionTargets(living: LivingWorldState, guild: GuildState): GuildTarget[] {
  if (guild.doctrine === "manual") return [];

  const targets: GuildTarget[] = [];
  if (guild.doctrine === "auto_excavate") {
    for (const marker of pack.markers ?? []) {
      const target = excavationTarget(guild, marker);
      if (target) targets.push(target);
    }
  } else if (guild.doctrine === "auto_pacify") {
    for (const burg of pack.burgs ?? []) {
      if (!burg?.i || burg.removed) continue;
      const target = burgTarget(living, guild, burg.i);
      if (target) targets.push(target);
    }
  } else {
    for (const province of pack.provinces ?? []) {
      if (!province?.i || province.removed) continue;
      if (guild.doctrine === "auto_patron" && province.state !== guild.favoredStateId) continue;
      const target = provinceTarget(living, guild, province.i);
      if (target) targets.push(target);
    }
    if (living.activeLairs) {
      for (const lair of Object.values(living.activeLairs)) {
        if (lair.markerId !== undefined && !hasTargetMission(guild, "lair", lair.provinceId, lair.markerId)) {
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

export function bestPartyForTarget(
  living: LivingWorldState,
  guild: GuildState,
  target: GuildTarget
): HistoricalFigure[] | undefined {
  let best: { party: HistoricalFigure[]; score: number } | undefined;
  for (const leader of idlePartyCandidates(guild)) {
    const party = autoFillParty(living, guild, target, leader.i);
    if (party.length === 0) continue;
    const chance = partyChance(living, guild, party, target);
    if (chance < MIN_AUTO_DISPATCH_FIT) continue;
    const doctrine = ensureHeroGuildState(guild, leader).doctrine;
    const phases = phasesForParty(missionPhases(target), party.length);
    const leaderFit = Math.max(...phases.map(phase => phaseScore(leader, phase))) * 0.01;
    const score =
      chance * (1 + target.rewardGold / 100) * target.priority + doctrineWeight(doctrine, target.kind) + leaderFit;
    if (!best || score > best.score) best = { party, score };
  }
  return best?.party;
}

export function missionNewsKind(kind: GuildMissionKind): LivingNewsKind {
  if (kind === "lair") return "lair";
  if (kind === "trouble") return "trouble";
  if (kind === "pacify") return "pacify";
  return "develop";
}

export function createMission(
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
  const phases = phasesForParty(missionPhases(target), members.length);
  const finalPhase = phases[phases.length - 1];
  const mission: ActiveGuildMission = {
    id,
    kind: target.kind,
    figureId: figure.i,
    targetCell: target.cell,
    provinceId: target.provinceId,
    burgId: target.burgId,
    markerId: target.markerId,
    action: finalPhase?.action ?? "strike",
    dc: finalPhase?.dc ?? actionDcForMission(target.dc),
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
  pushNews(living, {
    kind: missionNewsKind(target.kind),
    text: `${names} set out on a Guild ${target.kind} expedition (${phases.length} phases).`,
    cell: target.cell,
    stateId: target.provinceId !== undefined ? pack.provinces?.[target.provinceId]?.state : undefined
  });
  return mission;
}

/** Tags for missions saved before tags were stored. */
export function missionTagsFor(living: LivingWorldState, mission: ActiveGuildMission): MissionTag[] {
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

export function missionStillValid(living: LivingWorldState, mission: ActiveGuildMission): boolean {
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

/** HUD helper: the recommended party and each member's best phase. */
export function partyPreview(
  living: LivingWorldState,
  guild: GuildState,
  target: GuildTarget,
  leaderId?: number
): PartyPreview {
  const party = autoFillParty(living, guild, target, leaderId);
  const phases = phasesForParty(missionPhases(target), party.length);
  const members: PartyPreviewMember[] = party.map(figure => {
    const best = [...phases].sort((a, b) => phaseScore(figure, b) - phaseScore(figure, a))[0];
    return {
      figureId: figure.i,
      name: figure.name,
      score: best ? phaseScore(figure, best) : 0,
      bestPhaseId: best?.id ?? ""
    };
  });
  return { party: party.map(figure => figure.i), phases, members };
}

/** Recommended party and phase fits for the province dispatch card. */
export function getPartyPreview(provinceId: number, leaderId?: number): PartyPreview | null {
  const living = getHost().getState();
  const guild = getGuild();
  const target = provinceTarget(living, guild, provinceId);
  return target ? partyPreview(living, guild, target, leaderId) : null;
}

/** Recommended party and phase fits for an excavation site. */
export function getPartyPreviewForMarker(markerId: number, leaderId?: number): PartyPreview | null {
  const living = getHost().getState();
  const guild = getGuild();
  const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
  const target = marker ? excavationTarget(guild, marker) : null;
  return target ? partyPreview(living, guild, target, leaderId) : null;
}

/** Manually pin a leader for a province mission; companions are auto-filled. */
export function dispatchParty(figureId: number, provinceId: number): boolean {
  const host = getHost();
  const living = host.getState();
  const guild = getGuild();
  if (!guild.roster.includes(figureId) || !isHeroIdle(guild, figureId)) return false;

  const figure = findFigure(figureId);
  const target = provinceTarget(living, guild, provinceId);
  if (!figure || figure.death !== undefined || !target) return false;

  const party = autoFillParty(living, guild, target, figureId);
  if (party.length === 0) return false;
  createMission(living, guild, party[0]!, target, party);
  return true;
}

export function dispatchHero(figureId: number, provinceId: number): boolean {
  return dispatchParty(figureId, provinceId);
}

/** Send the best auto-filled party to a province (used by the HUD guild operations). */
export function dispatchBestHero(provinceId: number): boolean {
  const host = getHost();
  const living = host.getState();
  const guild = getGuild();
  const target = provinceTarget(living, guild, provinceId);
  if (!target) return false;

  const best = bestPartyForTarget(living, guild, target);
  if (!best) return false;

  createMission(living, guild, best[0]!, target, best);
  return true;
}

/** Manually pin a leader for an excavation; companions are auto-filled. */
export function dispatchPartyToMarker(figureId: number, markerId: number): boolean {
  const host = getHost();
  const living = host.getState();
  const guild = getGuild();
  if (!guild.roster.includes(figureId) || !isHeroIdle(guild, figureId)) return false;

  const figure = findFigure(figureId);
  if (!figure || figure.death !== undefined) return false;

  const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
  const target = marker ? excavationTarget(guild, marker) : null;
  if (!target) return false;

  const party = autoFillParty(living, guild, target, figureId);
  if (party.length === 0) return false;
  createMission(living, guild, party[0]!, target, party);
  return true;
}

export function dispatchHeroToMarker(figureId: number, markerId: number): boolean {
  return dispatchPartyToMarker(figureId, markerId);
}

/** Send the best auto-filled party to excavate a landmark. */
export function dispatchBestHeroToMarker(markerId: number): boolean {
  const host = getHost();
  const living = host.getState();
  const guild = getGuild();
  const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
  const target = marker ? excavationTarget(guild, marker) : null;
  if (!target) return false;

  const best = bestPartyForTarget(living, guild, target);
  if (!best) return false;

  createMission(living, guild, best[0]!, target, best);
  return true;
}

export function markHeroDown(living: LivingWorldState, state: HeroGuildState): void {
  state.resolve = 0;
  state.downUntilTick = Math.max(state.downUntilTick ?? 0, living.tick + 2);
}

export function injuryForTags(tags: readonly MissionTag[], rng: Rng): HeroInjury["kind"] {
  if (tags.some(tag => tag === "combat" || tag === "lair")) return "wounded";
  if (tags.some(tag => tag === "social" || tag === "petition" || tag === "intrigue")) return "shaken";
  if (tags.some(tag => tag === "travel" || tag === "wild")) return "lost";
  return rng.choice(["wounded", "shaken", "lost"] as const);
}

/** Fumble aftermath: a DC 12 survival save decides between death, an injury or being downed. */
export function fumbleAftermath(
  living: LivingWorldState,
  guild: GuildState,
  figure: HistoricalFigure,
  rng: Rng,
  check: FigureCheck,
  tags: readonly MissionTag[],
  relic: HistoricalRelic | undefined
): string {
  const state = ensureHeroGuildState(guild, figure);
  const survived = rng.d(20) + relicSurvivalBonus(relic) >= 12;

  if (!survived) {
    if (state.resolve > 0 && check.roll !== 1) {
      markHeroDown(living, state);
      return ` ${figure.name} was downed by the ordeal.`;
    }

    const year = options.map?.lore?.calendar?.year ?? 1000;
    figure.death = year;
    for (const role of figure.roles) {
      if (role.to === undefined) role.to = year;
    }
    guild.roster = guild.roster.filter(id => id !== figure.i);
    for (const held of guild.relics ?? []) {
      if (held.holder.kind === "figure" && held.holder.id === figure.i) placeRelic(held, guild);
    }
    let aftermath = ` ${figure.name} did not survive the mission.`;

    if (guild.tier >= 2) {
      const protege = spawnProtege(living, figure);
      if (protege && guild.roster.length < maxHeroesForTier(guild.tier)) {
        guild.roster.push(protege.i);
        aftermath += ` ${protege.name} took up the Guild's colours.`;
      }
    }
    return aftermath;
  }

  const kind = injuryForTags(tags, rng);
  state.injuries.push({ kind, ...(kind === "lost" ? {} : { untilTick: living.tick + 2 }) });
  if (state.resolve === 0) markHeroDown(living, state);
  return ` The ordeal left ${figure.name} ${HERO_INJURY_LABELS[kind].toLowerCase()}.`;
}

/** Spend Stamina once per hero per mission, on the first phase they take. */
export function phaseStamina(
  living: LivingWorldState,
  guild: GuildState,
  mission: ActiveGuildMission,
  figure: HistoricalFigure,
  phase: MissionPhase
): number {
  mission.staminaByHero ??= {};
  const existing = mission.staminaByHero[figure.i];
  if (existing !== undefined) return 0;

  const state = ensureHeroGuildState(guild, figure);
  const maxSpend = figureLevel(figure.xp ?? 0) >= 5 ? 2 : 1;
  const reserve = STAMINA_RESERVE_MINIMUM[figureArchetype(figure).id];
  const expected = missionChance(living, guild, figure, phase);
  const autoPush = state.stamina > reserve && expected < 0.6 && (state.temperament.boldness >= 0.5 || guild.tier >= 3);
  const spent = state.push
    ? Math.min(maxSpend, state.stamina)
    : autoPush
      ? Math.min(maxSpend, Math.max(0, state.stamina - reserve))
      : 0;
  state.stamina -= spent;
  mission.staminaByHero[figure.i] = spent;
  return spent;
}

export function applyMissionTargetEffect(
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
  const host = getHost();

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
      if (host.clearLair) host.clearLair(lair, leader.name);
      else LivingThreats.clearLair(lair, leader.name);
      if (host.relieveEschaton) host.relieveEschaton(living);
      else living.eschaton = Math.max(0, (living.eschaton ?? 0) - 5);
      return `${leader.name} purged ${lair.name} in ${province?.name ?? "the wilderness"}.`;
    }
    case "excavate": {
      const marker =
        mission.markerId !== undefined ? (pack.markers ?? []).find(entry => entry?.i === mission.markerId) : undefined;
      if (mission.markerId !== undefined && !guild.excavatedMarkers.includes(mission.markerId)) {
        guild.excavatedMarkers.push(mission.markerId);
      }
      recoverRelicsFromMarker(guild, mission.markerId, leader);
      if (partial) {
        return `${leader.name} excavated ${marker?.name ?? "a ruin site"} and recovered a cache of ${mission.rewardGold} gold.`;
      }
      if (mission.rewardRelic && marker) {
        const relic = mintRelicFromMarker(marker, mission.id, leader);
        return `${leader.name} excavated ${marker.name} and recovered ${relic.name}.`;
      }
      return `${leader.name} excavated ${marker?.name ?? "a ruin site"} and recovered ${mission.rewardGold} gold in relics.`;
    }
    case "pacify": {
      const burg = mission.burgId !== undefined ? pack.burgs?.[mission.burgId] : undefined;
      const bSim = mission.burgId !== undefined ? living.burgs?.[mission.burgId] : undefined;
      if (bSim) bSim.unrest = partial ? Math.floor(bSim.unrest / 2) : 0;
      return `${leader.name} ${partial ? "calmed" : "pacified"} ${burg?.name ?? "the burg"}.`;
    }
  }
}

export function finalizeMission(
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
  const sSim = province?.state ? living.states?.[province.state] : undefined;
  const leader = party[0]!;
  const text = applyMissionTargetEffect(living, guild, mission, outcome, leader, province, pSim);

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
      ensureHeroGuildState(guild, hero);
      hero.cell = mission.targetCell;
    }

    pushNews(living, {
      kind: missionNewsKind(mission.kind),
      text: `${text}${mission.staminaSpent ? ` ${mission.staminaSpent} Stamina spent.` : ""} (${outcome}, +${paidGold}g, +${paidRenown} renown)`,
      cell: mission.targetCell,
      stateId: province?.state
    });
    pushHistory(
      "deed",
      [
        { kind: "figure", id: leader.i },
        ...(province?.state ? [{ kind: "state", id: province.state } as HistRef] : [])
      ],
      mission.targetCell,
      text
    );
  } else {
    const rng = getRng("guild:failure", mission.id * 1000 + leader.i);
    const phaseById = new Map((mission.phases ?? []).map(phase => [phase.id, phase]));
    const fumbles: string[] = [];
    for (const hero of party) {
      const state = ensureHeroGuildState(guild, hero);
      state.resolve = Math.max(0, state.resolve - 2);
      if (state.resolve === 0) markHeroDown(living, state);
      guild.cooldowns[hero.i] = living.tick + rng.int(1, 2);

      const worst = results.filter(result => result.heroId === hero.i).find(result => !result.success);
      if (worst) {
        const phase = phaseById.get(worst.phaseId);
        const aftermath = fumbleAftermath(
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
    pushNews(living, {
      kind: missionNewsKind(mission.kind),
      text: `The ${mission.kind} expedition failed (${successes}/${total} phases). ${text} -2 Resolve to each survivor.${
        fumbles.length > 0 ? ` ${fumbles.join(" ")}` : ""
      }`,
      cell: mission.targetCell,
      stateId: province?.state
    });
  }

  const host = getHost();
  if (sSim && province?.state && host.recomputeStateCapacity) {
    sSim.capacity = host.recomputeStateCapacity(province.state);
  }
  syncGuildTier(living, guild);
}

export function resolveMission(living: LivingWorldState, mission: ActiveGuildMission): void {
  const guild = getGuild();
  const index = guild.missions.findIndex(entry => entry.id === mission.id);
  if (index === -1) return;

  const leader = findFigure(mission.figureId);
  const province = mission.provinceId !== undefined ? pack.provinces?.[mission.provinceId] : undefined;
  if (!leader || leader.death !== undefined || !missionStillValid(living, mission)) {
    guild.missions.splice(index, 1);
    if (leader && leader.death === undefined) {
      pushNews(living, {
        kind: missionNewsKind(mission.kind),
        text: `${leader.name}'s Guild contract ended with nothing left to resolve.`,
        cell: mission.targetCell,
        stateId: province?.state
      });
    }
    return;
  }

  const tags = mission.tags ?? missionTagsFor(living, mission);
  const legacyMission = mission as ActiveGuildMission & { pool?: "m" | "w" | "s" | "c" };
  const legacyAction = legacyMission.action ?? legacyActionForPool(legacyMission.pool ?? "m");
  mission.action ??= legacyAction;
  mission.phases ??= [
    {
      id: `${mission.kind}_legacy`,
      label: mission.kind,
      action: legacyAction,
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
    .map(id => findFigure(id))
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
  const choice = pickPhaseHero(party, contributions, phase) ?? { figure: party[0]!, untrained: true };

  const stamina = phaseStamina(living, guild, mission, choice.figure, phase);
  const state = ensureHeroGuildState(guild, choice.figure);
  const injuries = injuryPenalty(state.injuries, phase.tags, living.tick) + (choice.untrained ? 2 : 0);
  const synergy = partySynergy(guild, party);
  const action = phaseAction(phase);
  const pool = poolForAction(action);
  const poolGen = province?.state ? (living.states?.[province.state]?.capacity[pool]?.gen ?? 0) : 0;
  const carried = equippedRelic(guild.relics ?? [], choice.figure.i);
  const fit = heroMissionFit(choice.figure, phase.tags);
  const rng = getRng("guild:phase", mission.id * 1000 + phaseIndex * 100 + choice.figure.i);
  const check = actionCheck(rng, ensureHeroSheet(choice.figure), {
    action,
    dc: phase.dc,
    modifiers:
      valueModifier(poolGen) +
      fit.alignment +
      fit.aspect +
      (choice.untrained ? 0 : fit.discipline) +
      guildCheckBonus(guild.tier) +
      (carried?.bonuses[pool] ?? 0) +
      stamina +
      synergy -
      injuries
  });

  mission.phaseResults.push({
    phaseId: phase.id,
    heroId: choice.figure.i,
    roll: check.roll,
    total: check.total,
    success: Boolean(check.success),
    critical: check.critical,
    complication: check.complication,
    ...(choice.untrained ? { untrained: true } : {})
  });
  mission.staminaSpent = Object.values(mission.staminaByHero).reduce((sum, value) => sum + value, 0);

  const phaseText = `${choice.figure.name} ${check.success ? "passed" : "failed"} ${phase.label} (${check.die} ${check.roll} → ${check.total} vs DC ${phase.dc}).`;
  pushNews(living, {
    kind: missionNewsKind(mission.kind),
    text: phaseText,
    cell: mission.targetCell,
    stateId: province?.state
  });

  if (mission.phaseResults.length >= phases.length) {
    finalizeMission(living, guild, mission, party, province);
  }
}

export function autoDispatch(living: LivingWorldState): void {
  const guild = getGuild();
  if (guild.doctrine === "manual") return;

  const targets = missionTargets(living, guild);
  if (targets.length === 0) return;

  const assignedTargets = new Set<string>();
  for (const target of targets) {
    const key =
      target.markerId !== undefined
        ? `marker:${target.markerId}`
        : target.kind === "pacify" && target.burgId !== undefined
          ? `burg:${target.burgId}`
          : `province:${target.provinceId}`;
    if (assignedTargets.has(key)) continue;

    const party = bestPartyForTarget(living, guild, target);
    if (!party) continue;

    assignedTargets.add(key);
    createMission(living, guild, party[0]!, target, party);
  }
}

/** One season of player faction / guild bookkeeping: missions, hero recovery, candidates, and dispatch. */
export function stepPlayerFactionMissions(living: LivingWorldState): void {
  const guild = getGuild();
  const faction = getPlayerFaction();

  const hq = guild.hqBurgId !== undefined ? pack.burgs?.[guild.hqBurgId] : undefined;
  if (!hq || hq.removed) {
    guild.hqBurgId = faction.hq.burgId ?? pickGuildHq();
    if (guild.hqBurgId !== undefined && !guild.chapterBurgIds.includes(guild.hqBurgId)) {
      guild.chapterBurgIds.push(guild.hqBurgId);
    }
  }

  guild.gold += GUILD_DUES_PER_CHAPTER * guild.chapterBurgIds.length;
  syncGuildTier(living, guild);

  for (const key of Object.keys(guild.cooldowns)) {
    const figureId = Number(key);
    if ((guild.cooldowns[figureId] ?? 0) <= living.tick) delete guild.cooldowns[figureId];
  }

  guild.roster = guild.roster.filter(id => {
    const figure = findFigure(id);
    return Boolean(figure) && figure!.death === undefined;
  });

  autoPickPendingPaths(living, guild);
  recoverHeroes(living, guild);

  for (const mission of [...guild.missions]) {
    mission.progress += 1;
    resolveMission(living, mission);
  }

  if (living.season === 0) refreshCandidates(living);
  autoDispatch(living);

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

export function nextPopupId(guild: GuildState): number {
  return guild.popups.reduce((max, popup) => Math.max(max, popup.id), 0) + 1;
}

export function hasPopup(guild: GuildState, kind: LivingPopupKind, provinceId?: number, cell?: number): boolean {
  return guild.popups.some(popup => {
    if (popup.kind !== kind) return false;
    if (provinceId !== undefined) return popup.provinceId === provinceId;
    return cell !== undefined && popup.cell === cell;
  });
}

/** Queue a one-off popup (e.g. a battle unearthing a relic) without waiting for the next scan. */
export function queuePopup(partial: Omit<LivingPopup, "id" | "createdTick" | "expiresAtTick">): LivingPopup | null {
  const living = getHost().getState();
  const guild = getGuild();
  if (guild.popups.length >= MAX_LIVING_POPUPS) return null;
  if (hasPopup(guild, partial.kind, partial.provinceId, partial.cell)) return null;

  const entry: LivingPopup = {
    ...partial,
    id: nextPopupId(guild),
    createdTick: living.tick,
    expiresAtTick: living.tick + POPUP_LIFETIME_SEASONS
  };
  guild.popups.push(entry);
  return entry;
}

/** A petitionable crisis matching an awaiting petition definition. */
export function findPetitionAnchor(living: LivingWorldState, rng: Rng): PetitionTarget | null {
  const targets: PetitionTarget[] = [];

  for (const province of pack.provinces ?? []) {
    if (!province?.i || province.removed) continue;
    const pSim = living.provinces?.[province.i];
    if (!pSim) continue;
    const stateId = province.state;
    const state = stateId ? pack.states?.[stateId] : undefined;
    const context = {
      province: province.name,
      state: state?.i && !state.removed ? state.name : undefined,
      burg: pSim.trouble?.burgId !== undefined ? pack.burgs?.[pSim.trouble.burgId]?.name : undefined,
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
            burg: pSim.lair.burgId !== undefined ? pack.burgs?.[pSim.lair.burgId]?.name : undefined
          }
        });
      }
    }
  }

  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed || !burg.state) continue;
    const bSim = living.burgs?.[burg.i];
    const state = pack.states?.[burg.state];
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
    const ruler = sSim && sSim.rulerId !== undefined ? findFigure(sSim.rulerId) : undefined;
    if (!ruler || ruler.death !== undefined) continue;
    const capital = state.capital ? pack.burgs?.[state.capital] : undefined;
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

  const guild = getGuild();
  for (const relic of guild.relics ?? []) {
    if (!relic.cursed) continue;
    for (const def of petitionsForAnchor("cursedRelic")) {
      targets.push({
        def,
        cell: guild.hqBurgId ? (pack.burgs?.[guild.hqBurgId]?.cell ?? 0) : 0,
        context: { relic: relic.name }
      });
    }
  }

  return targets.length > 0 ? rng.choice(targets) : null;
}

export function spawnPetitionPopup(living: LivingWorldState): void {
  const guild = getGuild();
  if (guild.popups.some(popup => popup.kind === "guild_petition")) return;
  if (guild.popups.length >= MAX_LIVING_POPUPS) return;

  const phase = createRng(`${living.seed}:guild:petition:phase`).int(0, 4);
  if ((living.tick + phase) % 5 !== 0) return;

  const rng = getRng("guild:petition", living.tick);
  const target = findPetitionAnchor(living, rng);
  if (!target) return;

  queuePopup({
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

/** Drop popups whose countdown ran out. They auto-resolve without a reward. */
export function expirePopups(living: LivingWorldState): void {
  const guild = living.guild;
  if (!guild?.popups?.length) return;
  guild.popups = guild.popups.filter(popup => popup.expiresAtTick > living.tick);
}

/** Inspect the live world after a tick and queue urgent-bounty popups (deduplicated, capped). */
export function refreshPopups(living: LivingWorldState): void {
  const guild = getGuild();
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
    const lairImminent = Boolean(lair) && isLairStateCapable(lair!.id) && lair!.level >= 8 && lair!.seasonsActive >= 7;
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
    if (hasPopup(guild, candidate.kind, candidate.provinceId)) continue;
    const { priority: _priority, ...popup } = candidate;
    guild.popups.push({
      ...popup,
      id: nextPopupId(guild),
      createdTick: living.tick,
      expiresAtTick: living.tick + POPUP_LIFETIME_SEASONS
    });
  }

  spawnPetitionPopup(living);
}

/** Claim an on-map popup before it expires, banking its bonus Gold and Renown. */
export function claimPopup(id: number): LivingPopup | null {
  const living = getHost().getState();
  const guild = getGuild();
  const index = guild.popups.findIndex(popup => popup.id === id);
  if (index === -1) return null;

  const [popup] = guild.popups.splice(index, 1);
  if (!popup || popup.expiresAtTick <= living.tick) return null;
  if (popup.kind === "guild_petition") {
    guild.popups.push(popup);
    return null;
  }

  guild.gold += popup.rewardGold;
  guild.renown += popup.rewardRenown;
  syncGuildTier(living, guild);
  pushNews(living, {
    kind: popup.kind === "bounty_trouble" ? "trouble" : popup.kind === "bounty_lair" ? "lair" : "succession",
    text: `Guild bounty claimed: ${popup.title} (+${popup.rewardGold}g, +${popup.rewardRenown} renown).`,
    cell: popup.cell,
    stateId: popup.stateId
  });
  return popup;
}

export function applyPetitionEffects(
  living: LivingWorldState,
  popup: LivingPopup,
  effects: PetitionEffect[]
): string[] {
  const outcomes: string[] = [];
  const host = getHost();
  for (const effect of effects) {
    switch (effect.kind) {
      case "quellTrouble": {
        if (popup.provinceId !== undefined && (host.quellTrouble ? host.quellTrouble(popup.provinceId) : true)) {
          outcomes.push("the trouble was quelled");
        }
        break;
      }
      case "promoteTrouble": {
        const newStateId =
          popup.provinceId !== undefined && host.promoteTroubleToState
            ? host.promoteTroubleToState(popup.provinceId, popup.burgId)
            : null;
        if (newStateId !== null) {
          outcomes.push(`${pack.states?.[newStateId]?.name ?? "a new realm"} rose from the coup`);
        }
        break;
      }
      case "purgeLair": {
        const pSim = popup.provinceId !== undefined ? living.provinces?.[popup.provinceId] : undefined;
        const lair = pSim?.lair;
        if (pSim && lair) {
          if (host.removeLairMarker) host.removeLairMarker(lair.markerId);
          pSim.lair = null;
          pSim.order = Math.min(100, pSim.order + 12);
          if (host.relieveEschaton) host.relieveEschaton(living);
          else living.eschaton = Math.max(0, (living.eschaton ?? 0) - 5);
          outcomes.push(`${lair.name} was broken up`);
        }
        break;
      }
      case "pacifyBurg": {
        if (popup.burgId !== undefined && (host.pacifyBurg ? host.pacifyBurg(popup.burgId) : true)) {
          outcomes.push("the burg was pacified");
        }
        break;
      }
      case "unrest": {
        const bSim = popup.burgId !== undefined ? living.burgs?.[popup.burgId] : undefined;
        if (bSim) {
          bSim.unrest = minmax(bSim.unrest + effect.amount, 0, 100);
          outcomes.push(effect.amount >= 0 ? "unrest grew" : "unrest eased");
        }
        break;
      }
      case "unravel": {
        const sSim = popup.stateId !== undefined ? living.states?.[popup.stateId] : undefined;
        if (sSim) {
          sSim.unravel = minmax(sSim.unravel + effect.amount, 0, 100);
          outcomes.push(effect.amount >= 0 ? "the realm frayed" : "the realm stabilized");
        }
        break;
      }
      case "smiteRuler": {
        if (popup.stateId !== undefined && (host.smiteRuler ? host.smiteRuler(popup.stateId) : true)) {
          outcomes.push("the ruler fell");
        }
        break;
      }
      case "destroyRelic": {
        const relicIndex = (getGuild().relics ?? []).findIndex(relic => relic.cursed);
        if (relicIndex !== -1) {
          const [relic] = getGuild().relics.splice(relicIndex, 1);
          outcomes.push(`${relic.name} was destroyed`);
        }
        break;
      }
      case "setPatron": {
        if (popup.stateId !== undefined) {
          setFavoredState(popup.stateId);
          outcomes.push("the state is now the Guild's patron");
        }
        break;
      }
    }
  }
  return outcomes;
}

/** Apply the player's petition choice: guild gold/renown plus world outcomes. */
export function resolvePetition(
  popupId: number,
  choiceIndex: number
): { summary: string; gold: number; renown: number } | null {
  const host = getHost();
  const living = host.getState();
  const guild = getGuild();
  const index = guild.popups.findIndex(popup => popup.id === popupId && popup.kind === "guild_petition");
  if (index === -1) {
    // support standalone unit tests that don't specify kind === "guild_petition"
    const genericIndex = guild.popups.findIndex(popup => popup.id === popupId);
    if (genericIndex === -1) return null;
    const genericPopup = guild.popups[genericIndex]!;
    if (genericPopup.petition) {
      const choice = genericPopup.petition.choices[choiceIndex];
      if (!choice) return null;
      const cost = choice.effect?.goldCost ?? 0;
      if (guild.gold < cost) return null;
      guild.gold -= cost;
      guild.gold += choice.effect?.goldReward ?? 0;
      guild.renown += choice.effect?.renownReward ?? 0;
      if (choice.effect?.resolveTrouble && genericPopup.petition.provinceId && host.quellTrouble) {
        host.quellTrouble(genericPopup.petition.provinceId);
      }
      guild.popups.splice(genericIndex, 1);
      return { summary: choice.description, gold: guild.gold, renown: guild.renown };
    }
    return null;
  }

  const popup = guild.popups[index]!;
  const def = getPetitionDef(popup.petitionId);
  const choice = def?.choices[choiceIndex];
  if (!def || !choice || popup.expiresAtTick <= living.tick) return null;

  guild.popups.splice(index, 1);
  guild.gold = Math.max(0, guild.gold + choice.gold);
  guild.renown = Math.max(0, guild.renown + choice.renown);
  syncGuildTier(living, guild);

  const outcomes = applyPetitionEffects(living, popup, choice.effects ?? []);
  const summary =
    outcomes.length > 0 ? `${choice.label}: ${outcomes.join(", ")}.` : `${choice.label}: the Guild takes its cut.`;

  const signed = (value: number): string => `${value >= 0 ? "+" : ""}${value}`;
  pushNews(living, {
    kind: "develop",
    text: `Petition resolved — ${popup.title}: ${choice.label} (${signed(choice.gold)}g, ${signed(choice.renown)} renown).`,
    cell: popup.cell,
    stateId: popup.stateId,
    burgId: popup.burgId
  });
  return { summary, gold: choice.gold, renown: choice.renown };
}

export const LivingGuild = {
  setHost: setGuildHost,
  guildTierForRenown,
  maxPartyForTier,
  guildCheckBonus,
  heroAlignmentModifier,
  heroMissionFit,
  figureCheckRoll,
  figureCheck,
  getGuild,
  emptyGuild,
  pickGuildHq,
  getPlayerFaction,
  setPlayerFaction,
  syncPlayerFaction,
  syncGuildTier,
  getPopups,
  getMissions,
  getRelics,
  setDoctrine,
  setSandboxGodMode,
  setFavoredState,
  guildOperationCost,
  guildOperator,
  guildPacifyMediate,
  guildRushAssetCharter,
  guildInciteUprising,
  guildAssassinateRuler,
  guildBrokerWar,
  placeRelic,
  mintRelicFromMarker,
  recoverRelicsFromMarker,
  dropStateRelicsToRuin,
  stepRelics,
  equipRelic,
  enshrineRelic,
  leaseRelic,
  recallRelic,
  excavateMarker,
  heroScore,
  missionPhaseInput,
  missionPhases,
  idlePartyCandidates,
  phaseScore,
  autoFillParty,
  partyChance,
  pickPhaseHero,
  partySynergy,
  missionChance,
  doctrineWeight,
  hasTargetMission,
  provinceTarget,
  excavationTarget,
  burgTarget,
  missionTargets,
  bestPartyForTarget,
  missionNewsKind,
  createMission,
  missionTagsFor,
  missionStillValid,
  partyPreview,
  getPartyPreview,
  getPartyPreviewForMarker,
  dispatchParty,
  dispatchHero,
  dispatchBestHero,
  dispatchPartyToMarker,
  dispatchHeroToMarker,
  dispatchBestHeroToMarker,
  markHeroDown,
  injuryForTags,
  fumbleAftermath,
  phaseStamina,
  applyMissionTargetEffect,
  finalizeMission,
  resolveMission,
  autoDispatch,
  stepPlayerFactionMissions,
  nextPopupId,
  hasPopup,
  queuePopup,
  findPetitionAnchor,
  spawnPetitionPopup,
  expirePopups,
  refreshPopups,
  claimPopup,
  applyPetitionEffects,
  resolvePetition
};
