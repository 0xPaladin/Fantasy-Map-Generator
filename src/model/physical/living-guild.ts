// Living World Guild Engine: manages guild state, operations, missions, relics, petitions, and player faction bridging.
import { GUILD_OPERATIONS, type GuildOperationKind } from "@/data/guild-operations";
import { figureArchetype } from "@/data/hero-archetypes";
import { lairMissionTags } from "@/data/living-lairs";
import { getTroubleDef, troubleMissionTags } from "@/data/living-troubles";
import {
  autoPickPendingPaths,
  ensureHeroGuildState,
  findFigure,
  recoverHeroes,
  refreshCandidates
} from "@/model/physical/living-heroes";
import { Factions } from "@/model/political/factions-generator";
import type { Faction } from "@/types/factions";
import type { HistoricalFigure } from "@/types/history";
import type {
  ActiveGuildMission,
  GuildState,
  GuildTarget,
  HistoricalRelic,
  IdleDoctrine,
  LivingPopup,
  LivingWorldState,
  PartyPreview
} from "@/types/living";
import { createRng, type Rng } from "@/utils/rng";

export const GUILD_DUES_PER_CHAPTER = 2;
export const RELIC_LEASE_TRIBUTE = 10;
export const MIN_AUTO_DISPATCH_FIT = 0.45;
export const GUILD_TIER_TITLES = ["Lodge", "Chapterhouse", "Grand Hall", "High Citadel", "Sovereign Chapter"];

export interface GuildHost {
  getState(): LivingWorldState;
  pushNews(
    living: LivingWorldState,
    news: { kind: string; text: string; cell?: number; burgId?: number; stateId?: number; provinceId?: number }
  ): void;
  quellTrouble(provinceId: number): boolean;
  clearLair(lair: unknown, victorName?: string): void;
  smiteLair(provinceId: number): boolean;
  forceWar(stateId: number, otherId?: number): boolean;
}

let hostRef: GuildHost | null = null;

export function setGuildHost(host: GuildHost): void {
  hostRef = host;
}

function getHost(): GuildHost {
  return hostRef ?? (globalThis as unknown as { Living: GuildHost }).Living;
}

function _rngFor(tag: string, id = 0): Rng {
  const living = getHost().getState();
  return createRng(`${living.seed}:living:${living.tick}:${tag}:${id}`);
}

export function guildTierForRenown(renown: number): 1 | 2 | 3 {
  if (renown >= 120) return 3;
  if (renown >= 40) return 2;
  return 1;
}

export function maxPartyForTier(tier: number): number {
  return tier >= 3 ? 4 : tier === 2 ? 3 : 2;
}

export function guildCheckBonus(tier: number): number {
  return tier >= 3 ? 3 : tier === 2 ? 2 : 1;
}

function emptyGuild(): GuildState {
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
    heroes: {},
    missions: [],
    relics: [],
    cooldowns: {},
    excavatedMarkers: [],
    popups: []
  };
}

function pickGuildHq(): number | undefined {
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
  guild.heroes ??= {};
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
  getHost().pushNews(living, {
    kind: "muster",
    text: `The Guild Hall was raised to tier ${tier}: ${GUILD_TIER_TITLES[tier - 1]}.`
  });
}

export function getPopups(): LivingPopup[] {
  return getGuild().popups;
}

export function getMissions(): ActiveGuildMission[] {
  return getGuild().missions ?? [];
}

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
  const state = guild.heroes?.[figureId];
  const tick = getHost().getState().tick;
  if (state?.downUntilTick !== undefined && state.downUntilTick > tick) return false;
  return (guild.cooldowns[figureId] ?? 0) <= tick;
}

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

function operatorScore(figure: HistoricalFigure, pool: "m" | "w" | "s" | "c" | "best_sc" | undefined): number {
  const skills = figure.skills ?? { m: 0, w: 0, s: 0, c: 0 };
  if (pool === "best_sc") return Math.max(skills.s, skills.c);
  if (pool) return skills[pool];
  return skills.m + skills.w + skills.s + skills.c;
}

export function guildPacifyMediate(burgId: number): boolean {
  const guild = getGuild();
  const cost = guildOperationCost("pacify_mediate");
  if (guild.gold < cost) return false;
  const operator = guildOperator("pacify_mediate");
  if (!operator) return false;

  const burg = pack.burgs?.[burgId];
  const bSim = burg ? getHost().getState().burgs?.[burgId] : undefined;
  if (!burg || !bSim || (bSim.unrest ?? 0) <= 0) return false;

  guild.gold -= cost;
  bSim.unrest = Math.max(0, (bSim.unrest ?? 0) - 4);
  getHost().pushNews(getHost().getState(), {
    kind: "diplomacy",
    text: `${operator.name} mediated disputes in ${burg.name}, reducing unrest.`,
    cell: burg.cell,
    burgId
  });
  return true;
}

export function guildRushAssetCharter(burgId: number): boolean {
  const guild = getGuild();
  const cost = guildOperationCost("rush_charter");
  if (guild.gold < cost) return false;
  const operator = guildOperator("rush_charter");
  if (!operator) return false;

  const burg = pack.burgs?.[burgId];
  const bSim = burg ? getHost().getState().burgs?.[burgId] : undefined;
  if (!burg || !bSim?.construction) return false;

  guild.gold -= cost;
  bSim.construction.progress = bSim.construction.cost ?? 100;
  getHost().pushNews(getHost().getState(), {
    kind: "build",
    text: `${operator.name} secured a charter to accelerate construction in ${burg.name}.`,
    cell: burg.cell,
    burgId
  });
  return true;
}

export function guildInciteUprising(burgId: number): boolean {
  const guild = getGuild();
  const cost = guildOperationCost("incite_uprising");
  if (guild.gold < cost) return false;
  const operator = guildOperator("incite_uprising");
  if (!operator) return false;

  const burg = pack.burgs?.[burgId];
  const bSim = burg ? getHost().getState().burgs?.[burgId] : undefined;
  if (!burg || !bSim) return false;

  guild.gold -= cost;
  bSim.unrest = Math.min(100, (bSim.unrest ?? 0) + 6);
  getHost().pushNews(getHost().getState(), {
    kind: "rebellion",
    text: `${operator.name} stirred underground dissension in ${burg.name}!`,
    cell: burg.cell,
    burgId
  });
  return true;
}

export function guildAssassinateRuler(stateId: number): boolean {
  const guild = getGuild();
  const cost = guildOperationCost("assassinate_ruler");
  if (guild.gold < cost) return false;
  const operator = guildOperator("assassinate_ruler");
  if (!operator) return false;

  const state = pack.states?.[stateId];
  const sSim = state ? getHost().getState().states?.[stateId] : undefined;
  if (!state?.i || state.removed || !sSim) return false;

  guild.gold -= cost;
  sSim.unravel = Math.min(100, (sSim.unravel ?? 0) + 15);
  sSim.rulerId = undefined;
  getHost().pushNews(getHost().getState(), {
    kind: "diplomacy",
    text: `Rumors spread that ${operator.name} orchestrated the sudden demise of ${state.name}'s ruler!`,
    cell: state.center,
    stateId
  });
  return true;
}

export function guildBrokerWar(stateId: number, otherId?: number): boolean {
  const guild = getGuild();
  const cost = guildOperationCost("war_broker");
  if (guild.gold < cost) return false;
  const operator = guildOperator("war_broker");
  if (!operator) return false;

  const host = getHost();
  if (!host.forceWar(stateId, otherId)) return false;
  guild.gold -= cost;
  host.pushNews(host.getState(), {
    kind: "war",
    text: `${operator.name} brokered border conflicts into open warfare!`,
    stateId
  });
  return true;
}

export function equipRelic(relicId: number, figureId: number): boolean {
  const guild = getGuild();
  const relic = (guild.relics ?? []).find(r => r.id === relicId);
  const figure = findFigure(figureId);
  if (!relic || !figure || figure.death !== undefined) return false;

  for (const r of guild.relics ?? []) {
    if (r.holder.kind === "figure" && r.holder.id === figureId) {
      r.holder = { kind: "vault" };
    }
  }
  relic.holder = { kind: "figure", id: figureId };
  return true;
}

export function enshrineRelic(relicId: number): boolean {
  const guild = getGuild();
  const relic = (guild.relics ?? []).find(r => r.id === relicId);
  if (!relic) return false;
  relic.holder = { kind: "vault" };
  return true;
}

export function leaseRelic(relicId: number, stateId: number): boolean {
  const guild = getGuild();
  const relic = (guild.relics ?? []).find(r => r.id === relicId);
  const state = pack.states?.[stateId];
  if (!relic || !state?.i || state.removed) return false;
  if (relic.holder.kind === "state" && relic.holder.id === stateId) return false;

  relic.holder = { kind: "state", id: stateId };
  return true;
}

export function recallRelic(relicId: number): boolean {
  const guild = getGuild();
  const relic = (guild.relics ?? []).find(r => r.id === relicId);
  if (relic?.holder.kind !== "state") return false;
  relic.holder = { kind: "vault" };
  return true;
}

export function excavateMarker(markerId: number): boolean {
  const marker = pack.markers?.[markerId];
  if (marker?.type !== "ruins") return false;
  const guild = getGuild();
  if (guild.excavatedMarkers?.includes(markerId)) return false;

  guild.excavatedMarkers ??= [];
  guild.excavatedMarkers.push(markerId);
  guild.gold += 50;
  guild.renown += 10;
  return true;
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

function autoDispatch(living: LivingWorldState): void {
  const guild = getGuild();
  if (guild.doctrine === "manual") return;

  const targets = missionTargets(living, guild);
  if (targets.length === 0) return;

  const assignedTargets = new Set<string>();
  for (const target of targets) {
    const key = `${target.kind}:${target.provinceId ?? target.markerId ?? target.burgId}`;
    if (assignedTargets.has(key)) continue;
    const party = bestPartyForTarget(living, guild, target);
    if (!party) continue;
    assignedTargets.add(key);
    createMission(living, guild, party[0]!, target, party);
  }
}

function missionTargets(living: LivingWorldState, guild: GuildState): GuildTarget[] {
  if (guild.doctrine === "manual") return [];

  const targets: GuildTarget[] = [];
  if (guild.doctrine === "auto_excavate") {
    for (const marker of pack.markers ?? []) {
      if (!marker || marker.hidden || marker.type !== "ruins") continue;
      if (guild.excavatedMarkers?.includes(marker.i)) continue;
      targets.push({
        kind: "excavation",
        cell: marker.cell,
        markerId: marker.i,
        pool: "s",
        dc: 13 + guild.tier,
        rewardGold: 20,
        rewardRenown: 10,
        priority: 3,
        level: guild.tier,
        tags: ["ruins", "excavate"]
      });
    }
  } else if (guild.doctrine === "auto_pacify") {
    for (const burg of pack.burgs ?? []) {
      if (!burg?.i || burg.removed) continue;
      const bSim = living.burgs?.[burg.i];
      if (!bSim || (bSim.unrest ?? 0) <= 0) continue;
      targets.push({
        kind: "pacify",
        cell: burg.cell,
        burgId: burg.i,
        pool: "c",
        dc: 12 + guild.tier,
        rewardGold: 25,
        rewardRenown: 8,
        priority: 3,
        level: Math.round(bSim.unrest),
        tags: ["social", "order"]
      });
    }
  } else {
    for (const province of pack.provinces ?? []) {
      if (!province?.i || province.removed) continue;
      if (guild.doctrine === "auto_patron" && province.state !== guild.favoredStateId) continue;
      const pSim = living.provinces?.[province.i];
      if (pSim?.trouble) {
        targets.push({
          kind: "trouble",
          cell: pSim.trouble.cell ?? province.center ?? 0,
          provinceId: province.i,
          burgId: pSim.trouble.burgId,
          pool: getTroubleDef(pSim.trouble.id).pool,
          dc: 14 + pSim.trouble.level,
          rewardGold: 15 + pSim.trouble.level * 5,
          rewardRenown: 5,
          priority: guild.doctrine === "auto_bounties" ? 3 : 2,
          level: pSim.trouble.level,
          tags: troubleMissionTags(pSim.trouble)
        });
      }
      if (pSim?.lair) {
        targets.push({
          kind: "lair",
          cell: pSim.lair.cell ?? province.center ?? 0,
          provinceId: province.i,
          burgId: pSim.lair.burgId,
          pool: "m",
          dc: 14 + pSim.lair.level,
          rewardGold: 30 + pSim.lair.level * 10,
          rewardRenown: 15,
          priority: guild.doctrine === "auto_lairs" ? 3 : 1,
          level: pSim.lair.level,
          tags: lairMissionTags(pSim.lair)
        });
      }
    }
  }

  targets.sort((a, b) => b.priority - a.priority || b.level - a.level);
  return targets;
}

function bestPartyForTarget(
  _living: LivingWorldState,
  guild: GuildState,
  _target: GuildTarget
): HistoricalFigure[] | undefined {
  const idle = guild.roster
    .filter(id => isHeroIdle(guild, id))
    .map(id => findFigure(id))
    .filter((figure): figure is HistoricalFigure => Boolean(figure) && figure!.death === undefined)
    .filter(figure => ensureHeroGuildState(guild, figure).doctrine !== "manual");

  if (idle.length === 0) return undefined;
  return [idle[0]!];
}

function createMission(
  _living: LivingWorldState,
  guild: GuildState,
  leader: HistoricalFigure,
  target: GuildTarget,
  party: readonly HistoricalFigure[]
): ActiveGuildMission {
  const mission: ActiveGuildMission = {
    id: guild.missions.reduce((max, entry) => Math.max(max, entry.id), 0) + 1,
    figureId: leader.i,
    party: party.map(figure => figure.i),
    kind: target.kind,
    targetCell: target.cell,
    provinceId: target.provinceId,
    burgId: target.burgId,
    markerId: target.markerId,
    pool: target.pool,
    dc: target.dc,
    rewardGold: target.rewardGold,
    rewardRenown: target.rewardRenown,
    progress: 0,
    required: 2,
    tags: target.tags
  };
  guild.missions.push(mission);
  return mission;
}

function resolveMission(living: LivingWorldState, mission: ActiveGuildMission): void {
  if (mission.progress < mission.required) return;
  const guild = getGuild();
  const index = guild.missions.findIndex(m => m.id === mission.id);
  if (index === -1) return;
  guild.missions.splice(index, 1);

  const leader = findFigure(mission.figureId);
  const success = true;

  if (success) {
    guild.gold += mission.rewardGold;
    guild.renown += mission.rewardRenown;
    if (leader) leader.xp = (leader.xp ?? 0) + 50;

    const host = getHost();
    if (mission.kind === "trouble" && mission.provinceId) {
      host.quellTrouble(mission.provinceId);
    } else if (mission.kind === "lair" && mission.provinceId) {
      const pSim = living.provinces?.[mission.provinceId];
      if (pSim?.lair) host.clearLair(pSim.lair, leader?.name ?? "Guild Adventurers");
    } else if (mission.kind === "excavation" && mission.markerId !== undefined) {
      excavateMarker(mission.markerId);
    }
  }
}

export function dispatchHero(figureId: number, provinceId: number): boolean {
  const guild = getGuild();
  if (!guild.roster.includes(figureId) || !isHeroIdle(guild, figureId)) return false;
  const figure = findFigure(figureId);
  if (!figure) return false;

  const target: GuildTarget = {
    kind: "trouble",
    cell: pack.provinces?.[provinceId]?.center ?? 0,
    provinceId,
    pool: "m",
    dc: 14,
    rewardGold: 25,
    rewardRenown: 10,
    priority: 3,
    level: 2,
    tags: ["trouble"]
  };
  createMission(getHost().getState(), guild, figure, target, [figure]);
  return true;
}

export function dispatchParty(figureId: number, provinceId: number): boolean {
  return dispatchHero(figureId, provinceId);
}

export function dispatchBestHero(provinceId: number): boolean {
  const guild = getGuild();
  const idle = guild.roster.filter(id => isHeroIdle(guild, id));
  if (idle.length === 0) return false;
  return dispatchHero(idle[0]!, provinceId);
}

export function dispatchHeroToMarker(figureId: number, markerId: number): boolean {
  const marker = pack.markers?.[markerId];
  if (!marker) return false;
  const guild = getGuild();
  if (!guild.roster.includes(figureId) || !isHeroIdle(guild, figureId)) return false;
  const figure = findFigure(figureId);
  if (!figure) return false;

  const target: GuildTarget = {
    kind: "excavation",
    cell: marker.cell,
    markerId,
    pool: "s",
    dc: 14,
    rewardGold: 20,
    rewardRenown: 10,
    priority: 3,
    level: 1,
    tags: ["ruins"]
  };
  createMission(getHost().getState(), guild, figure, target, [figure]);
  return true;
}

export function dispatchPartyToMarker(figureId: number, markerId: number): boolean {
  return dispatchHeroToMarker(figureId, markerId);
}

export function dispatchBestHeroToMarker(markerId: number): boolean {
  const guild = getGuild();
  const idle = guild.roster.filter(id => isHeroIdle(guild, id));
  if (idle.length === 0) return false;
  return dispatchHeroToMarker(idle[0]!, markerId);
}

export function getPartyPreview(_provinceId: number, leaderId?: number): PartyPreview | null {
  const _guild = getGuild();
  const leader = leaderId !== undefined ? findFigure(leaderId) : undefined;
  return {
    party: leader ? [leader.i] : [],
    phases: [],
    members: leader ? [{ heroId: leader.i, trained: true, resolve: 10, stamina: 10, injuries: [], fit: 1 }] : []
  };
}

export function getPartyPreviewForMarker(markerId: number, leaderId?: number): PartyPreview | null {
  return getPartyPreview(markerId, leaderId);
}

export function claimPopup(id: number): LivingPopup | null {
  const guild = getGuild();
  const index = guild.popups.findIndex(popup => popup.id === id);
  if (index === -1) return null;
  const [popup] = guild.popups.splice(index, 1);
  return popup ?? null;
}

export function resolvePetition(
  popupId: number,
  choiceIndex: number
): { summary: string; gold: number; renown: number } | null {
  const guild = getGuild();
  const popup = guild.popups.find(entry => entry.id === popupId);
  if (!popup?.petition) return null;

  const petition = popup.petition;
  const choice = petition.choices[choiceIndex];
  if (!choice) return null;

  const cost = choice.effect.goldCost ?? 0;
  if (guild.gold < cost) return null;

  guild.gold -= cost;
  guild.gold += choice.effect.goldReward ?? 0;
  guild.renown += choice.effect.renownReward ?? 0;

  if (choice.effect.resolveTrouble && petition.provinceId) {
    getHost().quellTrouble(petition.provinceId);
  }

  const outcome = {
    summary: choice.description,
    gold: guild.gold,
    renown: guild.renown
  };

  claimPopup(popupId);
  return outcome;
}

export const LivingGuild = {
  setHost: setGuildHost,
  getGuild,
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
  equipRelic,
  enshrineRelic,
  leaseRelic,
  recallRelic,
  excavateMarker,
  stepPlayerFactionMissions,
  dispatchHero,
  dispatchParty,
  dispatchBestHero,
  dispatchHeroToMarker,
  dispatchPartyToMarker,
  dispatchBestHeroToMarker,
  getPartyPreview,
  getPartyPreviewForMarker,
  claimPopup,
  resolvePetition
};
