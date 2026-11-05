// Living World Heroes Engine: handles adventurer lifecycle, vitals, progression, recruitment, and specialist commanders.

import { rollAlignment, rollFigureTraits } from "@/data/culture-traits";
import {
  defaultPathForDoctrine,
  figureArchetype,
  figureDisciplines,
  findHeroPath,
  HERO_ARCHETYPES,
  type HeroArchetypeId,
  inferHeroArchetype,
  pendingPathLevel,
  rollHeroArchetype
} from "@/data/hero-archetypes";
import { heroMaxVitals, heroTemperamentFor, recoverInjuries } from "@/data/hero-vitals";
import { Military } from "@/model/political/military-generator";
import { Names } from "@/model/society/names-generator";
import type { HistoricalFigure } from "@/types/history";
import type { GuildState, HeroDoctrine, HeroGuildState, LivingWorldState, TroubleUnitRole } from "@/types/living";
import type { Regiment, State } from "@/types/subdivided-pack";
import { createRng } from "@/utils/rng";
import { Chronicle } from "./history-generator";

export const GUILD_CANDIDATES_PER_YEAR = 3;
export const HERO_RETIREMENT_AGE = 50;

export interface HeroesHost {
  getState(): LivingWorldState;
  getGuild(): GuildState;
  pushNews(
    living: LivingWorldState,
    news: { kind: string; text: string; cell?: number; burgId?: number; stateId?: number; provinceId?: number }
  ): void;
}

let hostRef: HeroesHost | null = null;

export function setHeroesHost(host: HeroesHost): void {
  hostRef = host;
}

function getHost(): HeroesHost {
  return hostRef ?? (globalThis as unknown as { Living: HeroesHost }).Living;
}

export function findFigure(figureId: number): HistoricalFigure | undefined {
  return Chronicle.sync().figures?.find(figure => figure.i === figureId);
}

export function maxHeroesForTier(tier: number): number {
  return tier >= 3 ? 12 : tier === 2 ? 8 : 4;
}

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

/** Lazily give an old roster hero identity without changing their existing pool ratings. */
export function ensureHeroIdentity(figure: HistoricalFigure): void {
  figure.progression ??= {};
  if (!figure.archetype) figure.archetype = inferHeroArchetype(figure);
  if (!figure.disciplines?.length) figure.disciplines = [...HERO_ARCHETYPES[figure.archetype].disciplines];
  figure.progression.appliedLevel ??= figureLevel(figure.xp ?? 0);
  figure.progression.pendingChoices ??= 0;
}

/** Lazy vitals for old saves and fresh candidates alike. */
export function ensureHeroGuildState(guild: GuildState, figure: HistoricalFigure): HeroGuildState {
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

/** Vitals, temperament, injuries and doctrine for one hero; lazily initialized. */
export function getHeroState(figureId: number): HeroGuildState | undefined {
  const figure = findFigure(figureId);
  if (!figure) return undefined;
  return ensureHeroGuildState(getHost().getGuild(), figure);
}

export function setHeroDoctrine(figureId: number, doctrine: HeroDoctrine): boolean {
  const figure = findFigure(figureId);
  if (!figure) return false;
  const state = ensureHeroGuildState(getHost().getGuild(), figure);
  state.doctrine = doctrine;
  return true;
}

export function setHeroPush(figureId: number, enabled: boolean): boolean {
  const figure = findFigure(figureId);
  if (!figure) return false;
  const state = ensureHeroGuildState(getHost().getGuild(), figure);
  state.push = enabled;
  return true;
}

/** Spend one pending level 3/6 choice on a path from the hero's archetype. */
export function chooseHeroPath(figureId: number, pathId: string): boolean {
  const figure = findFigure(figureId);
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

  const guild = getHost().getGuild();
  const state = ensureHeroGuildState(guild, figure);
  if (path.temperament) {
    for (const key of Object.keys(path.temperament) as (keyof typeof path.temperament)[]) {
      const nudge = path.temperament[key] ?? 0;
      state.temperament[key] = Math.max(0, Math.min(1, state.temperament[key] + nudge));
    }
  }
  ensureHeroGuildState(guild, figure);
  return true;
}

/** Gold cost to recruit a hero: base by guild tier plus a premium for starting level. */
export function recruitCost(figureId?: number): number {
  const guild = getHost().getGuild();
  const base = 40 + guild.tier * 20;
  if (figureId === undefined) return base;
  const figure = findFigure(figureId);
  return base + Math.max(0, figureLevel(figure?.xp ?? 0) - 1) * 15;
}

/** Recruit a tavern candidate into the hero roster. */
export function recruitCandidate(figureId: number): boolean {
  const host = getHost();
  const living = host.getState();
  const guild = host.getGuild();
  if (!guild.candidates.includes(figureId)) return false;
  if (guild.roster.length >= maxHeroesForTier(guild.tier)) return false;

  const cost = recruitCost(figureId);
  if (guild.gold < cost) return false;

  const figure = findFigure(figureId);
  if (!figure || figure.death !== undefined) return false;
  ensureHeroGuildState(guild, figure);

  guild.gold -= cost;
  guild.candidates = guild.candidates.filter(id => id !== figureId);
  guild.roster.push(figureId);

  host.pushNews(living, {
    kind: "muster",
    text: `${figure.name} joined the Guild roster.`
  });
  return true;
}

/** Retire a veteran hero and mint a protege carrying one skill point forward. */
export function retireHero(figureId: number): number | null {
  const host = getHost();
  const living = host.getState();
  const guild = host.getGuild();
  const figure = findFigure(figureId);
  if (!figure || figure.death !== undefined || !guild.roster.includes(figureId)) return null;

  const year = options.map?.lore?.calendar?.year ?? 1000;
  if (year - figure.birth < HERO_RETIREMENT_AGE) return null;

  guild.roster = guild.roster.filter(id => id !== figureId);
  figure.death = year;

  let protege: HistoricalFigure | undefined;
  if (guild.tier >= 2) {
    protege = mintProtege(living, figure);
    if (protege && guild.roster.length < maxHeroesForTier(guild.tier)) guild.roster.push(protege.i);
  }

  host.pushNews(living, {
    kind: "muster",
    text: `${figure.name} retired with honor${protege ? `, naming ${protege.name} their successor` : ""}.`
  });
  return protege ? protege.i : null;
}

function mintProtege(living: LivingWorldState, veteran: HistoricalFigure): HistoricalFigure {
  const history = Chronicle.sync();
  history.figures ??= [];
  const figures = history.figures;
  const index = figures.length;
  const rng = createRng(`${living.seed}:guild:protege:${index}`);
  const culture = veteran.culture ?? 0;
  const skills = { m: 0, w: 0, s: 0, c: 0 };

  const validPools = (["m", "w", "s", "c"] as const).filter(p => (veteran.skills?.[p] ?? 0) >= 3);
  const bestPool = validPools.length > 0 ? rng.choice(validPools) : "m";
  skills[bestPool] = 1;

  const protege: HistoricalFigure = {
    i: index,
    name: Names.getBase(culture),
    culture,
    birth: (options.map?.lore?.calendar?.year ?? 1000) - 18,
    alignment: veteran.alignment ?? "neutral",
    virtues: [...(veteran.virtues ?? [])],
    vices: [...(veteran.vices ?? [])],
    xp: 0,
    roles: [
      { type: "adventurer", target: { kind: "culture", id: culture }, from: options.map?.lore?.calendar?.year ?? 1000 }
    ],
    skills,
    archetype: figureArchetype(veteran).id,
    disciplines: [...figureDisciplines(veteran)],
    progression: { appliedLevel: 1, pendingChoices: 0, picks: [] }
  };
  figures.push(protege);
  return protege;
}

/** Spring: refresh the tavern with up to three free adventurers. */
export function refreshCandidates(living: LivingWorldState): void {
  const guild = getHost().getGuild();
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
      .map(id => findFigure(id))
      .filter((figure): figure is HistoricalFigure => Boolean(figure))
      .map(figure => {
        ensureHeroIdentity(figure);
        return figure.archetype!;
      });
    guild.candidates.push(mintCandidate(living, avoid).i);
  }
}

/** A fresh, unaffiliated adventurer for the tavern. */
export function mintCandidate(living: LivingWorldState, avoid: HeroArchetypeId[] = []): HistoricalFigure {
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
    const pool = def.growthOrder[growthIndex % def.growthOrder.length]!;
    skills[pool] = Math.min(5, skills[pool] + 1);
    growthIndex++;
  }

  const candidate: HistoricalFigure = {
    i: index,
    name: Names.getBase(culture),
    culture,
    birth: year - 18 - rng.int(0, 10),
    alignment,
    virtues,
    vices,
    xp: level === 1 ? 0 : level === 2 ? 100 : 300,
    roles: [{ type: "adventurer", target: { kind: "culture", id: culture }, from: year }],
    skills,
    archetype,
    disciplines: [...def.disciplines],
    progression: {
      appliedLevel: level,
      pendingChoices: level >= 3 ? 1 : 0,
      picks: []
    }
  };
  figures.push(candidate);
  return candidate;
}

/** Guild Hall rest: Resolve, Stamina and injury treatment, once per season. */
export function recoverHeroes(living: LivingWorldState, guild: GuildState): void {
  for (const id of guild.roster) {
    const figure = findFigure(id);
    if (!figure || figure.death !== undefined) continue;
    if (guild.missions.some(mission => mission.figureId === id || mission.party?.includes(id))) continue;

    const state = ensureHeroGuildState(guild, figure);
    if (state.downUntilTick !== undefined && living.tick >= state.downUntilTick) state.downUntilTick = undefined;

    const healer = figureDisciplines(figure).includes("healing");
    state.resolve = Math.min(state.maxResolve, state.resolve + (healer ? 2 : 1));
    state.stamina = Math.min(state.maxStamina, state.stamina + 1);
    state.injuries = recoverInjuries(state.injuries, living.tick, healer);
  }
}

/** Ignored level 3/6 choices are auto-picked after two seasons by the archetype's doctrine. */
export function autoPickPendingPaths(living: LivingWorldState, guild: GuildState): void {
  for (const id of guild.roster) {
    const figure = findFigure(id);
    if (!figure || figure.death !== undefined) continue;
    ensureHeroIdentity(figure);

    const progression = figure.progression!;
    if ((progression.pendingChoices ?? 0) <= 0) continue;
    if (progression.choiceSinceTick === undefined) {
      progression.choiceSinceTick = living.tick;
      continue;
    }
    if (living.tick - progression.choiceSinceTick < 2) continue;

    const level = pendingPathLevel(figure);
    const pick = defaultPathForDoctrine(figure.archetype!, level, guild.doctrine);
    if (pick) chooseHeroPath(figure.i, pick.id);
  }
}

/** Backfill or assign specialist commanders to fielded specialist units */
export function ensureCommanders(): void {
  const unitTypes = Military.getUnitTypes();
  for (const state of pack.states) {
    if (!state?.i || state.removed || !state.military) continue;
    for (const regiment of state.military) {
      for (const unit of regiment.units ?? []) {
        const specialty = unitTypes[unit.type]?.troubleRole;
        if (!specialty) continue;
        commanderFor(state, regiment, specialty);
      }
    }
  }
}

/** The living commander figure for a regiment's specialty, minting one on first need. */
export function commanderFor(state: State, regiment: Regiment, specialty: TroubleUnitRole): number | undefined {
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
  const commander: HistoricalFigure = {
    i: index,
    name: Names.getBase(culture),
    culture,
    birth: (options.map?.lore?.calendar?.year ?? 1000) - 28,
    alignment: "lawful",
    roles: [
      {
        type: "specialist",
        specialty,
        target: { kind: "state", id: state.i },
        from: options.map?.lore?.calendar?.year ?? 1000
      }
    ]
  };
  figures.push(commander);
  regiment.crew.push(index);
  return index;
}

export const LivingHeroes = {
  setHost: setHeroesHost,
  findFigure,
  figureLevel,
  ensureHeroIdentity,
  ensureHeroGuildState,
  getHeroState,
  setHeroDoctrine,
  setHeroPush,
  chooseHeroPath,
  recruitCost,
  recruitCandidate,
  retireHero,
  mintCandidate,
  refreshCandidates,
  recoverHeroes,
  autoPickPendingPaths,
  ensureCommanders,
  commanderFor
};
