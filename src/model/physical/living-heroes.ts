// Living World Heroes Engine: handles adventurer lifecycle, vitals, progression, and specialist commanders.

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
  inferHeroArchetype,
  pendingPathLevel
} from "@/data/hero-archetypes";
import { aspectBonus } from "@/data/hero-aspects";
import { disciplineBonus, matchingDisciplines } from "@/data/hero-disciplines";
import { heroMaxVitals, heroTemperamentFor, recoverInjuries } from "@/data/hero-vitals";
import { UNIT_ROLE_POOLS } from "@/data/living-troubles";
import { valueModifier } from "@/data/saves-helpers";
import type { Regiment } from "@/model/political/military-generator";
import { Military } from "@/model/political/military-generator";
import type { State } from "@/model/political/states-generator";
import { Characters } from "@/model/society/characters";
import { Names } from "@/model/society/names-generator";
import type { HeroSheet } from "@/types/character";
import type { Die } from "@/types/character-actions";
import type { HistoricalFigure } from "@/types/history";
import type {
  DisciplineId,
  HeroDoctrine,
  HeroGuildState,
  LivingWorldState,
  MissionTag,
  TroubleUnitRole
} from "@/types/living";
import { createRng, type Rng } from "@/utils/rng";

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

/** @deprecated legacy d20 adapter for trouble resolution. */
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

/** Legacy pool score for trouble resolution. */
export function heroScore(
  figure: HistoricalFigure,
  pool: "m" | "w" | "s" | "c",
  tags: readonly MissionTag[] = []
): number {
  const fit = heroMissionFit(figure, tags);
  return (figure.skills?.[pool] ?? 0) + fit.alignment + fit.aspect + fit.discipline;
}

export interface HeroesHost {
  getState(): LivingWorldState;
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
export function ensureHeroGuildState(figure: HistoricalFigure): HeroGuildState {
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
  return ensureHeroGuildState(figure);
}

export function setHeroDoctrine(figureId: number, doctrine: HeroDoctrine): boolean {
  const figure = findFigure(figureId);
  if (!figure) return false;
  const state = ensureHeroGuildState(figure);
  state.doctrine = doctrine;
  return true;
}

export function setHeroPush(figureId: number, enabled: boolean): boolean {
  const figure = findFigure(figureId);
  if (!figure) return false;
  const state = ensureHeroGuildState(figure);
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

  const state = ensureHeroGuildState(figure);
  if (path.temperament) {
    for (const key of Object.keys(path.temperament) as (keyof typeof path.temperament)[]) {
      const nudge = path.temperament[key] ?? 0;
      state.temperament[key] = Math.max(0, Math.min(1, state.temperament[key] + nudge));
    }
  }
  return true;
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

/** Resolve, Stamina and injury treatment for every living hero, once per season. */
export function recoverHeroes(living: LivingWorldState): void {
  for (const figure of Characters.all().filter(entry => entry.hero && !entry.removed && entry.death === undefined)) {
    const state = ensureHeroGuildState(figure);
    if (state.downUntilTick !== undefined && living.tick >= state.downUntilTick) state.downUntilTick = undefined;

    const healer = (ensureHeroSheet(figure).abilities ?? []).includes("healing");
    state.resolve = Math.min(state.maxResolve, state.resolve + (healer ? 2 : 1));
    state.stamina = Math.min(state.maxStamina, state.stamina + 1);
    state.injuries = recoverInjuries(state.injuries, living.tick, healer);
  }
}

/** Ignored level 3/6 choices are auto-picked after two seasons by the archetype's doctrine. */
export function autoPickPendingPaths(living: LivingWorldState): void {
  for (const figure of Characters.all().filter(entry => entry.hero && !entry.removed && entry.death === undefined)) {
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
  ensureHeroSheet,
  ensureHeroGuildState,
  getHeroState,
  setHeroDoctrine,
  setHeroPush,
  chooseHeroPath,
  spawnProtege,
  recoverHeroes,
  autoPickPendingPaths,
  ensureCommanders,
  commanderFor,
  heroAlignmentModifier,
  heroMissionFit,
  heroScore,
  figureCheckRoll,
  figureCheck
};
