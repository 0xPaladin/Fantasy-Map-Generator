// Living World Heroes Engine: handles adventurer lifecycle, vitals, progression, recruitment, and specialist commanders.

import {
  attributesFromSkills,
  DICE,
  heroStartingPackage,
  legacyActionForPool,
  legacyActionsFromSkills
} from "@/data/character-actions";
import { rollAlignment, rollFigureTraits, traitsRng } from "@/data/culture-traits";
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
import { heroMaxVitals, heroTemperamentFor, recoverInjuries } from "@/data/hero-vitals";
import { UNIT_ROLE_POOLS } from "@/data/living-troubles";
import { Military } from "@/model/political/military-generator";
import { Characters } from "@/model/society/characters";
import { Names } from "@/model/society/names-generator";
import type { HeroSheet } from "@/types/character";
import type { Die } from "@/types/character-actions";
import type { HistoricalFigure } from "@/types/history";
import type {
  DisciplineId,
  GuildState,
  HeroArchetypeId,
  HeroDoctrine,
  HeroGuildState,
  LivingWorldState,
  TroubleUnitRole
} from "@/types/living";
import type { Regiment, State } from "@/types/subdivided-pack";
import { createRng } from "@/utils/rng";
import { Chronicle } from "./history-generator";

const HERO_STATES = new WeakMap<HistoricalFigure, HeroGuildState>();

function stepDie(die: Die): Die {
  return DICE[Math.min(DICE.indexOf(die) + 1, DICE.length - 1)] ?? "d12";
}

/** Build or backfill the sheet, mirroring the legacy fields the guild stub still reads. */
export function ensureHeroSheet(figure: HistoricalFigure): HeroSheet {
  if (!figure.hero) {
    const archetype = figure.archetype ?? inferHeroArchetype(figure);
    const start = heroStartingPackage(archetype);
    const progression = figure.progression ?? {
      appliedLevel: figureLevel(figure.xp ?? 0),
      pendingChoices: 0,
      picks: []
    };
    figure.hero = {
      archetype,
      attributes: figure.skills ? attributesFromSkills(figure.skills) : { ...start.attributes },
      actions: figure.skills ? legacyActionsFromSkills(figure.skills) : { ...start.actions },
      abilities: figure.disciplines?.length ? [...figure.disciplines] : [...figureArchetype(figure).disciplines],
      xp: figure.xp ?? 0,
      progression
    };
  }

  const hero = figure.hero;
  const start = heroStartingPackage(hero.archetype ?? "freeblade");
  hero.actions ??= { ...start.actions };
  hero.attributes ??= { ...start.attributes };
  hero.abilities ??= [start.ability];
  hero.xp ??= figure.xp ?? 0;
  hero.progression ??= {};

  figure.archetype ??= hero.archetype;
  figure.disciplines ??= [...hero.abilities] as DisciplineId[];
  figure.progression ??= hero.progression;
  figure.xp ??= hero.xp;
  return hero;
}

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
  return Characters.get(figureId);
}

export const GUILD_MAX_HEROES = [3, 4, 6, 8, 10] as const;

export function maxHeroesForTier(tier: number): number {
  return GUILD_MAX_HEROES[Math.min(4, Math.max(0, tier - 1))]!;
}

/** xp needed to enter a level: L1 0, L2 60, L3 140, ... */
export function xpForHeroLevel(level: number): number {
  let xp = 0;
  for (let step = 1; step < Math.max(1, level); step++) xp += 40 + 20 * step;
  return xp;
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

/** Old saves receive no retroactive points: absent progression starts at the current level. */
export function applyHeroLevels(figure: HistoricalFigure): boolean {
  const hero = ensureHeroSheet(figure);
  hero.xp = figure.xp ?? hero.xp ?? 0;
  const progression = hero.progression!;
  const level = figureLevel(hero.xp ?? 0);

  if (progression.appliedLevel === undefined) {
    progression.appliedLevel = level;
    progression.pendingChoices ??= 0;
    return false;
  }

  const appliedLevel = progression.appliedLevel;
  if (level <= appliedLevel) return false;

  const def = figureArchetype(figure);
  let growthIndex = 0;
  for (let step = 2; step <= appliedLevel; step++) {
    if (step !== 3 && step !== 6) growthIndex += 1;
  }

  let pending = progression.pendingChoices ?? 0;
  let gained = false;
  for (let step = appliedLevel + 1; step <= level; step++) {
    if (step === 3 || step === 6) {
      pending += 1;
      continue;
    }
    const pool = def.growthOrder[growthIndex % def.growthOrder.length]!;
    growthIndex += 1;
    const action = legacyActionForPool(pool);
    const next = stepDie(hero.actions[action]);
    if (next !== hero.actions[action]) {
      hero.actions[action] = next;
      gained = true;
    }
    figure.skills ??= { m: 0, w: 0, s: 0, c: 0 };
    if (figure.skills[pool] < 5) {
      figure.skills[pool] += 1;
      gained = true;
    }
  }

  progression.appliedLevel = level;
  progression.pendingChoices = Math.min(2, pending);
  if (pending > 0) progression.choiceSinceTick = undefined;
  figure.progression = progression;
  return gained;
}

/** Lazily give an old roster hero identity without changing their existing sheet. */
export function ensureHeroIdentity(figure: HistoricalFigure): void {
  const hero = ensureHeroSheet(figure);
  hero.progression!.appliedLevel ??= figureLevel(hero.xp ?? 0);
  hero.progression!.pendingChoices ??= 0;
  figure.progression = hero.progression;
}

/** Lazy vitals for old saves and fresh candidates alike; the sheet is the only store. */
export function ensureHeroGuildState(_guild: GuildState, figure: HistoricalFigure): HeroGuildState {
  ensureHeroIdentity(figure);
  const hero = figure.hero!;
  const def = figureArchetype(figure);
  const max = heroMaxVitals(def.id, figureLevel(hero.xp ?? 0), hero.progression?.picks ?? []);

  hero.condition ??= {
    resolve: max.maxResolve,
    stamina: max.maxStamina,
    maxResolve: max.maxResolve,
    maxStamina: max.maxStamina,
    injuries: []
  };
  const condition = hero.condition;
  condition.maxResolve = max.maxResolve;
  condition.maxStamina = max.maxStamina;
  condition.resolve = Math.min(condition.resolve ?? max.maxResolve, max.maxResolve);
  condition.stamina = Math.min(condition.stamina ?? max.maxStamina, max.maxStamina);
  condition.injuries ??= [];
  hero.doctrine ??= def.defaultDoctrine;
  hero.temperament ??= heroTemperamentFor(def.id);

  const cached = HERO_STATES.get(figure);
  if (cached) return cached;

  const state: HeroGuildState = {
    get resolve() {
      return condition.resolve;
    },
    set resolve(value) {
      condition.resolve = value;
    },
    get stamina() {
      return condition.stamina;
    },
    set stamina(value) {
      condition.stamina = value;
    },
    get maxResolve() {
      return condition.maxResolve;
    },
    set maxResolve(value) {
      condition.maxResolve = value;
    },
    get maxStamina() {
      return condition.maxStamina;
    },
    set maxStamina(value) {
      condition.maxStamina = value;
    },
    get doctrine() {
      return hero.doctrine!;
    },
    set doctrine(value) {
      hero.doctrine = value;
    },
    get temperament() {
      return hero.temperament!;
    },
    set temperament(value) {
      hero.temperament = value;
    },
    get injuries() {
      return condition.injuries;
    },
    set injuries(value) {
      condition.injuries = value;
    },
    get downUntilTick() {
      return condition.downUntilTick;
    },
    set downUntilTick(value) {
      condition.downUntilTick = value;
    },
    get push() {
      return condition.push;
    },
    set push(value) {
      condition.push = value;
    }
  };
  HERO_STATES.set(figure, state);
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
  const hero = ensureHeroSheet(figure);
  ensureHeroIdentity(figure);

  const progression = hero.progression!;
  if ((progression.pendingChoices ?? 0) <= 0) return false;

  const level = pendingPathLevel(figure);
  const found = findHeroPath(hero.archetype!, pathId);
  if (!found || found.choice.level !== level) return false;

  const path = found.path;
  if (path.pool) {
    const action = legacyActionForPool(path.pool);
    hero.actions[action] = stepDie(hero.actions[action]);
    figure.skills ??= { m: 0, w: 0, s: 0, c: 0 };
    figure.skills[path.pool] = Math.min(5, figure.skills[path.pool] + 1);
  }
  if (path.discipline) {
    hero.abilities ??= [];
    if (!hero.abilities.includes(path.discipline)) hero.abilities.push(path.discipline);
    figure.disciplines ??= [];
    if (!figure.disciplines.includes(path.discipline)) figure.disciplines.push(path.discipline);
  }

  progression.picks ??= [];
  progression.picks.push(path.id);
  progression.pendingChoices = Math.max(0, (progression.pendingChoices ?? 0) - 1);
  progression.choiceSinceTick = undefined;
  figure.progression = progression;

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
  figure.cell ??= guild.hqBurgId ? pack.burgs[guild.hqBurgId]?.cell : undefined;

  host.pushNews(living, {
    kind: "muster",
    text: `${figure.name} joined the Guild for ${cost} gold.`,
    cell: figure.cell,
    burgId: guild.hqBurgId
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
  guild.missions = guild.missions.filter(mission => mission.figureId !== figureId);
  for (const role of figure.roles) {
    if (role.to === undefined) role.to = year;
  }

  const protege = spawnProtege(living, figure);
  if (protege && guild.roster.length < maxHeroesForTier(guild.tier)) guild.roster.push(protege.i);

  host.pushNews(living, {
    kind: "succession",
    text: `${figure.name} retired from the Guild and passed the torch to ${protege?.name ?? "a new protege"}.`,
    cell: figure.cell
  });
  return protege?.i ?? null;
}

export function spawnProtege(living: LivingWorldState, veteran: HistoricalFigure): HistoricalFigure | undefined {
  const veteranHero = ensureHeroSheet(veteran);
  const rng = createRng(`${living.seed}:guild:protege:${Characters.nextId() + veteran.i * 1000}`);
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

  const id = Characters.nextId();
  const protege = Characters.add({
    name: Names.getCulture(culture),
    culture,
    birth: year - rng.int(18, 24),
    roles: [{ type: "adventurer", target: { kind: "culture", id: culture }, from: year }],
    alignment,
    virtues,
    vices,
    cell: veteran.cell,
    hero: true,
    archetype: veteranHero.archetype,
    seedKey: `figure:${id}`
  }) as HistoricalFigure;

  protege.xp = 0;
  protege.skills = skills;
  protege.disciplines = [...figureDisciplines(veteran)];
  protege.progression = { appliedLevel: 1, pendingChoices: 0, picks: [] };

  const hero = ensureHeroSheet(protege);
  hero.xp = 0;
  hero.actions = legacyActionsFromSkills(skills);
  hero.attributes = attributesFromSkills(skills);
  hero.abilities = [...(veteranHero.abilities ?? [])];
  hero.progression = protege.progression;
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
  const index = Characters.nextId();
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

  const guild = getHost().getGuild();
  const candidate = Characters.add({
    name: Names.getCulture(culture),
    culture,
    birth: year - rng.int(20, 38),
    roles: [{ type: "adventurer", target: { kind: "culture", id: culture }, from: year }],
    alignment,
    virtues,
    vices,
    cell: guild.hqBurgId !== undefined ? pack.burgs[guild.hqBurgId]?.cell : undefined,
    hero: true,
    archetype,
    seedKey: `figure:${index}`
  }) as HistoricalFigure;

  candidate.xp = xpForHeroLevel(level);
  candidate.skills = skills;
  candidate.disciplines = [...def.disciplines];
  candidate.progression = {
    appliedLevel: level,
    pendingChoices: level >= 3 ? 1 : 0,
    picks: []
  };

  const hero = ensureHeroSheet(candidate);
  hero.xp = candidate.xp;
  hero.actions = legacyActionsFromSkills(skills);
  hero.attributes = attributesFromSkills(skills);
  hero.abilities = [...def.disciplines];
  hero.progression = candidate.progression;
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

    const healer = (ensureHeroSheet(figure).abilities ?? []).includes("healing");
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
    const hero = ensureHeroSheet(figure);
    ensureHeroIdentity(figure);

    const progression = hero.progression!;
    if ((progression.pendingChoices ?? 0) <= 0) continue;
    if (progression.choiceSinceTick === undefined) {
      progression.choiceSinceTick = living.tick;
      continue;
    }
    if (living.tick - progression.choiceSinceTick < 2) continue;

    const def = figureArchetype(figure);
    const pick = defaultPathForDoctrine(def.id, def.defaultDoctrine, pendingPathLevel(figure));
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
  regiment.crew ??= [];

  const crewed = regiment.crew.find(id => {
    const figure = Characters.get(id);
    return figure && !figure.death && figure.roles.some(r => r.type === "specialist" && r.specialty === specialty);
  });
  if (crewed !== undefined) return crewed;

  const existing = Characters.all().find(
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

  const index = Characters.nextId();
  const culture = state.culture ?? 0;
  const year = options.map?.lore?.calendar?.year ?? 1000;
  const living = getHost().getState();
  const rng = traitsRng(living.seed, "figure", `figure:${index}`);
  const alignment = rollAlignment(rng, pack.cultures[culture]?.alignment);
  const { virtues, vices } = rollFigureTraits(rng, alignment);
  const skills = { m: 0, w: 0, s: 0, c: 0 };
  skills[UNIT_ROLE_POOLS[specialty]] = 1;
  const figure = Characters.add({
    name: Names.getCulture(culture),
    culture,
    birth: year - rng.int(25, 45),
    roles: [{ type: "specialist", specialty, target: { kind: "state", id: state.i }, from: year }],
    alignment,
    virtues,
    vices,
    cell: regiment.cell,
    hero: true,
    seedKey: `figure:${index}`
  }) as HistoricalFigure;

  figure.xp = 0;
  figure.skills = skills;
  const hero = ensureHeroSheet(figure);
  hero.xp = 0;
  hero.actions = legacyActionsFromSkills(skills);
  hero.attributes = attributesFromSkills(skills);
  regiment.crew.push(figure.i);
  return figure.i;
}

export const LivingHeroes = {
  setHost: setHeroesHost,
  findFigure,
  figureLevel,
  xpForHeroLevel,
  applyHeroLevels,
  ensureHeroIdentity,
  ensureHeroGuildState,
  getHeroState,
  setHeroDoctrine,
  setHeroPush,
  chooseHeroPath,
  recruitCost,
  recruitCandidate,
  retireHero,
  spawnProtege,
  mintCandidate,
  refreshCandidates,
  recoverHeroes,
  autoPickPendingPaths,
  ensureCommanders,
  commanderFor
};
