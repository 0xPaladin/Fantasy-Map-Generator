// Elects villain masterminds and compiles their schemes from map data. See docs/plans/villain-schemes.md.
import { rollAlignment, rollFigureTraits, traitsRng } from "@/data/culture-traits";
import { getFactionArchetype } from "@/data/factions-catalog";
import { RELIC_KIND_BY_ID, RELIC_KINDS, RELIC_SITES } from "@/data/relics";
import { SCHEME_GOALS, type SchemeGoalDef } from "@/data/scheme-goals";
import type { Burg } from "@/model/political/burgs-generator";
import type { State } from "@/model/political/states-generator";
import { Characters } from "@/model/society/characters";
import { Names } from "@/model/society/names-generator";
import type { Religion } from "@/model/society/religions-generator";
import type { Marker } from "@/model/story/markers-generator";
import type { Faction } from "@/types/factions";
import { emptyHistory, type HistoricalFigure, type HistoricalRole, type History, type HistRef } from "@/types/history";
import type { MastermindPool, Relic, Scheme, SchemeStep, SchemeVerb } from "@/types/schemes";
import { getAdjective } from "@/utils/language-utils";
import { P, ra, rand } from "@/utils/probability-utils";

const MAX_MASTERMINDS = 5;
const MIN_MASTERMINDS = 3;
const MAX_PER_CULTURE = 2;

/** the curated archetypes that reach for a crown or a hidden hand */
const VILLAIN_ARCHETYPES = new Set([
  "heretical_cult",
  "shadow_syndicate",
  "noble_league",
  "mercenary_company",
  "dread_host",
  "merchant_consortium"
]);

interface MastermindCandidate {
  pool: MastermindPool;
  /** the institution the mastermind leads */
  ref: HistRef;
  figureId?: number;
  culture: number;
  score: number;
  hidden: boolean;
  stateId?: number;
  cell?: number;
  religionId?: number;
}

interface Site {
  cell: number;
  markerId?: number;
}

interface SchemeDraft {
  template: string;
  steps: SchemeStep[];
  keystone?: string;
}

interface StepContext {
  verb: SchemeVerb;
  goal: SchemeGoalDef;
  candidate: MastermindCandidate;
  villain: HistoricalFigure;
  usurpState?: State;
  doomSite?: Site;
  homeBurg?: Burg;
  usedVictims: Set<number>;
  usedOfficials: Set<number>;
  usedConquests: Set<number>;
  finale: boolean;
  rivalStateIds: Set<number>;
}

const currentYear = (): number => options?.map?.lore?.calendar?.year ?? 1000;

function activeStates(): State[] {
  return (pack.states ?? []).filter(state => state?.i > 0 && !state.removed);
}

function activeReligions(): Religion[] {
  return (pack.religions ?? []).filter(religion => religion?.i > 0 && !religion.removed);
}

function activeFactions(): Faction[] {
  return (pack.factions ?? []).filter(faction => faction?.i > 0 && !faction.removed);
}

function activeBurgs(): Burg[] {
  return (pack.burgs ?? []).filter(burg => burg?.i > 0 && !burg.removed);
}

const stateById = (id: number | undefined): State | undefined =>
  id === undefined ? undefined : pack.states?.find(state => state?.i === id);

const religionById = (id: number | undefined): Religion | undefined =>
  id === undefined ? undefined : pack.religions?.find(religion => religion?.i === id);

const factionById = (id: number | undefined): Faction | undefined =>
  id === undefined ? undefined : pack.factions?.find(faction => faction?.i === id);

/** the newest open role of a type toward a kind, if any */
function openRoleTarget(
  figure: HistoricalFigure,
  type: HistoricalRole["type"],
  kind: HistRef["kind"]
): number | undefined {
  const roles = figure.roles ?? [];
  for (let i = roles.length - 1; i >= 0; i--) {
    const role = roles[i];
    if (role.type === type && role.to === undefined && role.target.kind === kind) return role.target.id;
  }
  return undefined;
}

function findOpenRuler(ref: HistRef): HistoricalFigure | undefined {
  let best: HistoricalFigure | undefined;
  let bestFrom = -Infinity;
  for (const figure of Characters.active()) {
    for (const role of figure.roles ?? []) {
      if (role.type !== "ruler" || role.to !== undefined) continue;
      if (role.target.kind !== ref.kind || role.target.id !== ref.id) continue;
      if (role.from >= bestFrom) {
        best = figure;
        bestFrom = role.from;
      }
    }
  }
  return best;
}

function figureVillainScore(figure: HistoricalFigure | undefined): number {
  if (!figure) return 0;
  let score = Math.min(6, (figure.vices?.length ?? 0) * 2);
  if (figure.alignment === "evil") score += 2;
  else if (figure.alignment === "chaotic") score += 1;
  return score;
}

function figureTraits(seedKey: string, cultureId: number): Pick<HistoricalFigure, "alignment" | "virtues" | "vices"> {
  if (!options?.generation?.cultures?.traits) return {};
  const rng = traitsRng(options.map.seed, "figure", seedKey);
  const alignment = rollAlignment(rng, pack.cultures?.[cultureId]?.alignment);
  const { virtues, vices } = rollFigureTraits(rng, alignment);
  return { alignment, virtues, vices };
}

function collectCandidates(): MastermindCandidate[] {
  const candidates: MastermindCandidate[] = [];
  const figures = Characters.active();

  for (const state of activeStates()) {
    const ruler = findOpenRuler({ kind: "state", id: state.i });
    if (!ruler) continue;
    candidates.push({
      pool: "crowned",
      ref: { kind: "state", id: state.i },
      figureId: ruler.i,
      culture: ruler.culture,
      score: 3 + figureVillainScore(ruler) + (state.expansionism ?? 0) * 2,
      hidden: false,
      stateId: state.i,
      cell: state.center
    });
  }

  for (const religion of activeReligions()) {
    if (religion.type !== "Cult" && religion.type !== "Heresy") continue;
    const believers = (religion.rural ?? 0) + (religion.urban ?? 0);
    const prophet = figures.find(figure => openRoleTarget(figure, "prophet", "religion") === religion.i);

    if (religion.type === "Cult") {
      const god = figures.find(
        figure => figure.tags?.includes("living_god") && openRoleTarget(figure, "prophet", "religion") === religion.i
      );
      const figure = god ?? prophet;
      candidates.push({
        pool: "living_god",
        ref: { kind: "religion", id: religion.i },
        figureId: figure?.i,
        culture: religion.culture,
        score: 4 + believers * 0.05 + figureVillainScore(figure),
        hidden: true,
        cell: religion.center,
        religionId: religion.i
      });
      continue;
    }

    candidates.push({
      pool: "religious",
      ref: { kind: "religion", id: religion.i },
      figureId: prophet?.i,
      culture: religion.culture,
      score: 2 + believers * 0.04 + figureVillainScore(prophet),
      hidden: true,
      cell: religion.center,
      religionId: religion.i
    });
  }

  for (const faction of activeFactions()) {
    if (faction.type === "monster_nest" || !getFactionArchetype(faction.type)) continue;
    const leader = faction.leaderId !== undefined ? Characters.get(faction.leaderId) : undefined;
    const villainy = VILLAIN_ARCHETYPES.has(faction.type) ? 2 : 0;
    const hidden = !faction.hq?.burgId || faction.allegiance === "clandestine" || faction.allegiance === "hostile";
    candidates.push({
      pool: !faction.hq?.burgId ? "wild" : "faction",
      ref: { kind: "faction", id: faction.i },
      figureId: leader && !leader.removed && leader.death === undefined ? leader.i : undefined,
      culture: faction.culture ?? 0,
      score:
        villainy +
        figureVillainScore(leader) +
        (faction.expansionism ?? 0) * 2 +
        (faction.sovereignAmbition ? 2 : 0) +
        (hidden ? 1 : 0),
      hidden,
      stateId: faction.patronStateId,
      cell: faction.hq?.cell
    });
  }

  return candidates;
}

function selectMasterminds(candidates: MastermindCandidate[]): MastermindCandidate[] {
  const stateCount = activeStates().length;
  const desired = Math.min(
    MAX_MASTERMINDS,
    MIN_MASTERMINDS + (stateCount >= 12 ? 1 : 0) + (stateCount >= 24 ? 1 : 0),
    candidates.length
  );

  const picked: MastermindCandidate[] = [];
  const refs = new Set<string>();
  const figures = new Set<number>();
  const cultures = new Map<number, number>();

  const refKey = (candidate: MastermindCandidate) => `${candidate.ref.kind}:${candidate.ref.id}`;
  const canTake = (candidate: MastermindCandidate, strict: boolean): boolean => {
    if (refs.has(refKey(candidate))) return false;
    if (candidate.figureId !== undefined && figures.has(candidate.figureId)) return false;
    if (strict && (cultures.get(candidate.culture) ?? 0) >= MAX_PER_CULTURE) return false;
    return true;
  };
  const take = (candidate: MastermindCandidate): void => {
    picked.push(candidate);
    refs.add(refKey(candidate));
    if (candidate.figureId !== undefined) figures.add(candidate.figureId);
    cultures.set(candidate.culture, (cultures.get(candidate.culture) ?? 0) + 1);
  };

  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const poolOrder: MastermindPool[] = ["crowned", "wild", "faction", "living_god", "religious"];

  for (const pool of poolOrder) {
    if (picked.length >= desired) break;
    const candidate = ranked.find(candidate => candidate.pool === pool && canTake(candidate, true));
    if (candidate) take(candidate);
  }

  if (picked.length < desired && !picked.some(candidate => candidate.hidden)) {
    const hidden = ranked.find(
      candidate =>
        candidate.hidden &&
        canTake(candidate, true) &&
        !picked.some(pickedCandidate => pickedCandidate.pool === candidate.pool)
    );
    if (hidden) take(hidden);
  }

  while (picked.length < desired) {
    const candidate = ranked.find(
      candidate => canTake(candidate, false) && !picked.some(pickedCandidate => pickedCandidate.pool === candidate.pool)
    );
    if (!candidate) break;
    take(candidate);
  }

  while (picked.length < desired) {
    const candidate = ranked.find(candidate => canTake(candidate, false));
    if (!candidate) break;
    take(candidate);
  }

  return picked;
}

function chooseGoal(pool: MastermindPool): SchemeGoalDef {
  const weights = SCHEME_GOALS.map(goal => (goal.pools.includes(pool) ? 3 : 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < SCHEME_GOALS.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return SCHEME_GOALS[i];
  }
  return SCHEME_GOALS[SCHEME_GOALS.length - 1];
}

class SchemesModule {
  private usedRelicNames = new Set<string>();
  private relicSequence = 0;
  private schemeSequence = 0;

  /** The scheme registry, created lazily for old maps and bare test packs. */
  ensureSchemes(): Scheme[] {
    const history = this.history();
    history.schemes ??= [];
    return history.schemes;
  }

  /** The relic registry, created lazily for old maps and bare test packs. */
  ensureRelics(): Relic[] {
    const history = this.history();
    history.relics ??= [];
    return history.relics;
  }

  /** Elect 3-5 masterminds and compile one scheme for each; replaces any previous schemes. */
  generate(): Scheme[] {
    const schemes = this.ensureSchemes();
    const relics = this.ensureRelics();
    schemes.length = 0;
    relics.length = 0;
    this.usedRelicNames.clear();
    this.relicSequence = 0;
    this.schemeSequence = 0;

    const candidates = collectCandidates();
    if (!candidates.length) return schemes;

    const picked = selectMasterminds(candidates);
    const rivalStateIds = new Set(
      picked.map(candidate => candidate.stateId).filter((id): id is number => id !== undefined)
    );
    const usedKeystones = new Set<string>();

    for (const candidate of picked) {
      const villain = this.materialize(candidate);
      let goal: SchemeGoalDef | undefined;
      let draft: SchemeDraft | undefined;

      for (let attempt = 0; attempt < 4; attempt++) {
        goal = chooseGoal(candidate.pool);
        draft = this.instantiate(candidate, villain, goal, rivalStateIds);
        if (!draft.keystone || !usedKeystones.has(draft.keystone)) break;
      }
      if (!goal || !draft) continue;
      if (draft.keystone) usedKeystones.add(draft.keystone);

      schemes.push({
        i: ++this.schemeSequence,
        goal: goal.id,
        mastermind: candidate.ref,
        keystone: draft.keystone,
        villainFigure: villain.i,
        template: draft.template,
        secrecy: candidate.hidden ? rand(55, 85) : rand(20, 50),
        steps: draft.steps,
        status: "active",
        startedYear: this.year()
      });
    }

    return schemes;
  }

  /** Recompile one scheme for the same mastermind with a fresh goal and targets (god tool). */
  reroll(scheme: Scheme): boolean {
    const candidate = collectCandidates().find(
      entry => entry.ref.kind === scheme.mastermind.kind && entry.ref.id === scheme.mastermind.id
    );
    if (!candidate) return false;

    const relics = this.ensureRelics();
    this.relicSequence = relics.reduce((max, relic) => Math.max(max, relic.i), 0);
    this.usedRelicNames = new Set(relics.map(relic => relic.name));

    const existing = Characters.get(scheme.villainFigure);
    const villain =
      existing && !existing.removed && existing.death === undefined ? existing : this.materialize(candidate);
    const goal = chooseGoal(candidate.pool);
    const draft = this.instantiate(candidate, villain, goal, new Set());

    const orphaned = new Set(scheme.steps.map(step => step.relicId).filter((id): id is number => id !== undefined));
    if (orphaned.size) {
      for (let index = relics.length - 1; index >= 0; index--) {
        if (orphaned.has(relics[index].i)) relics.splice(index, 1);
      }
    }

    scheme.goal = goal.id;
    scheme.villainFigure = villain.i;
    scheme.template = draft.template;
    scheme.keystone = draft.keystone;
    scheme.steps = draft.steps;
    scheme.secrecy = candidate.hidden ? rand(55, 85) : rand(20, 50);
    scheme.status = "active";
    delete scheme.exposed;
    scheme.startedYear = this.year();
    return true;
  }

  private history(): History {
    if (!pack.history) pack.history = emptyHistory();
    return pack.history;
  }

  private year(): number {
    return currentYear();
  }

  private materialize(candidate: MastermindCandidate): HistoricalFigure {
    if (candidate.figureId !== undefined) {
      const existing = Characters.get(candidate.figureId);
      if (existing && !existing.removed && existing.death === undefined) return existing;
    }

    const faction = candidate.ref.kind === "faction" ? factionById(candidate.ref.id) : undefined;
    const livingGod = candidate.pool === "living_god";
    const role: HistoricalRole =
      candidate.ref.kind === "state" || candidate.ref.kind === "faction"
        ? { type: "ruler", target: candidate.ref, from: faction?.foundedYear ?? this.year() }
        : { type: "prophet", target: candidate.ref, from: this.year() };

    const figure = this.addFigure({
      name: livingGod ? (religionById(candidate.ref.id)?.deity ?? undefined) : undefined,
      culture: candidate.culture,
      birth: this.year() - (livingGod ? rand(120, 600) : rand(20, 45)),
      role,
      tags: livingGod ? ["living_god", "mastermind"] : ["mastermind"]
    });

    if (faction) faction.leaderId = figure.i;
    return figure;
  }

  private addFigure(input: {
    name?: string;
    culture: number;
    birth: number;
    role: HistoricalRole;
    tags?: string[];
  }): HistoricalFigure {
    const id = Characters.nextId();
    const seedKey = `scheme:${id}`;
    return Characters.add({
      name: input.name,
      culture: input.culture,
      birth: input.birth,
      roles: [input.role],
      tags: input.tags,
      seedKey,
      ...figureTraits(seedKey, input.culture)
    }) as HistoricalFigure;
  }

  private instantiate(
    candidate: MastermindCandidate,
    villain: HistoricalFigure,
    goal: SchemeGoalDef,
    rivalStateIds: Set<number>
  ): SchemeDraft {
    const template = ra(goal.templates);
    const usurpState = goal.id === "usurp_throne" ? this.pickRivalState(candidate, rivalStateIds) : undefined;
    const doomSite = goal.id === "unseal_doom" ? this.pickSite(goal) : undefined;
    const homeBurg = this.pickHomeBurg(candidate);
    const usedVictims = new Set<number>();
    const usedOfficials = new Set<number>();
    const usedConquests = new Set<number>();

    const steps = template.steps.map((verb, index) => {
      const finale = index === template.steps.length - 1;
      const data = this.buildStep({
        verb,
        goal,
        candidate,
        villain,
        usurpState,
        doomSite,
        homeBurg,
        usedVictims,
        usedOfficials,
        usedConquests,
        finale,
        rivalStateIds
      });
      return {
        verb,
        ...data,
        status: index === 0 ? ("active" as const) : ("pending" as const)
      };
    });

    return {
      template: template.id,
      steps,
      keystone: this.keystoneOf(goal, steps, usurpState, doomSite)
    };
  }

  private buildStep(context: StepContext): Omit<SchemeStep, "verb" | "status"> {
    switch (context.verb) {
      case "seize_relic": {
        const relic = this.createRelic(context.goal, context.candidate);
        return relic ? { targets: [], cell: relic.at.cell, relicId: relic.i } : { targets: [] };
      }
      case "assassinate": {
        const victim = this.pickVictim(context);
        return { targets: victim ? [{ kind: "figure", id: victim.i }] : [] };
      }
      case "conquer": {
        const state =
          context.usurpState ?? this.pickRivalState(context.candidate, context.rivalStateIds, context.usedConquests);
        if (state) context.usedConquests.add(state.i);
        return { targets: state ? [{ kind: "state", id: state.i }] : [] };
      }
      case "occupy_site": {
        const site = this.pickSite(context.goal);
        return { targets: [], cell: site?.cell, duration: rand(2, 4) };
      }
      case "perform_ritual": {
        return { targets: [], cell: context.homeBurg?.cell ?? context.candidate.cell, duration: rand(3, 6) };
      }
      case "convert": {
        const religion = this.pickRivalReligion(context.candidate);
        return { targets: religion ? [{ kind: "religion", id: religion.i }] : [], cell: religion?.center };
      }
      case "corrupt_official": {
        const official = this.pickOfficial(context);
        return { targets: official ? [{ kind: "figure", id: official.i }] : [] };
      }
      case "engineer_war": {
        const pair = this.pickWarPair(context.candidate);
        return { targets: pair.map(state => ({ kind: "state" as const, id: state.i })) };
      }
      case "infiltrate": {
        const burg = this.pickRivalBurg(context);
        return { targets: burg ? [{ kind: "burg", id: burg.i }] : [], cell: burg?.cell };
      }
      case "build": {
        const burg = context.homeBurg ?? this.pickAnyBurg();
        return { targets: burg ? [{ kind: "burg", id: burg.i }] : [], cell: burg?.cell };
      }
      case "research_lore": {
        const burg = this.pickLoreBurg(context);
        return { targets: burg ? [{ kind: "burg", id: burg.i }] : [], cell: burg?.cell };
      }
      case "breach_seal": {
        const site = context.doomSite ?? this.pickSite(context.goal);
        return { targets: [], cell: site?.cell, duration: rand(1, 3) };
      }
    }

    return { targets: [] };
  }

  private pickVictim(context: StepContext): HistoricalFigure | undefined {
    const figures = Characters.active().filter(figure => figure.i !== context.villain.i);
    if (!figures.length) return undefined;

    const usurpId = context.usurpState?.i;
    if (usurpId !== undefined && context.finale) {
      const ruler = findOpenRuler({ kind: "state", id: usurpId });
      if (ruler && ruler.i !== context.villain.i) return ruler;
    }

    const pool = figures.filter(figure => !context.usedVictims.has(figure.i));
    const available = pool.length ? pool : figures;
    const inUsurpState =
      usurpId !== undefined && !context.finale
        ? available.filter(
            figure =>
              figure.i !== findOpenRuler({ kind: "state", id: usurpId })?.i &&
              figure.roles?.some(
                role => role.to === undefined && role.target.kind === "state" && role.target.id === usurpId
              )
          )
        : [];
    const roleBearing = available.filter(figure =>
      figure.roles?.some(
        role =>
          role.to === undefined &&
          (role.type === "ruler" || role.type === "general" || role.type === "prophet" || role.type === "agent")
      )
    );

    const victim = ra(inUsurpState.length ? inUsurpState : roleBearing.length ? roleBearing : available);
    if (victim) context.usedVictims.add(victim.i);
    return victim;
  }

  private pickOfficial(context: StepContext): HistoricalFigure | undefined {
    const figures = Characters.active().filter(figure => figure.i !== context.villain.i);
    const pool = figures.filter(figure => !context.usedOfficials.has(figure.i));
    const available = pool.length ? pool : figures;
    const officials = available.filter(figure =>
      figure.roles?.some(
        role => role.to === undefined && (role.type === "ruler" || role.type === "specialist" || role.type === "agent")
      )
    );
    const official = ra(officials.length ? officials : available);
    if (official) context.usedOfficials.add(official.i);
    return official;
  }

  private pickRivalState(
    candidate: MastermindCandidate,
    rivalStateIds: Set<number>,
    used: Set<number> = new Set()
  ): State | undefined {
    const home = candidate.stateId;
    const free = activeStates().filter(state => state.i !== home && !used.has(state.i));
    if (!free.length) return undefined;

    const rivals = free.filter(state => rivalStateIds.has(state.i));
    if (rivals.length && P(0.5)) return ra(rivals);

    const neighborIds = home !== undefined ? (stateById(home)?.neighbors ?? []) : [];
    const neighbors = neighborIds
      .map(id => stateById(id))
      .filter((state): state is State => state !== undefined && state.i > 0 && !state.removed && !used.has(state.i));
    return ra(neighbors.length ? neighbors : free);
  }

  private pickRivalReligion(candidate: MastermindCandidate): Religion | undefined {
    const own = candidate.ref.kind === "religion" ? candidate.ref.id : undefined;
    const options = activeReligions().filter(religion => religion.i !== own && religion.type !== "Folk");
    return ra(options.length ? options : activeReligions().filter(religion => religion.i !== own));
  }

  private pickHomeBurg(candidate: MastermindCandidate): Burg | undefined {
    if (candidate.ref.kind === "state") {
      const capital = stateById(candidate.ref.id)?.capital;
      return capital ? pack.burgs?.[capital] : undefined;
    }
    if (candidate.ref.kind === "faction") {
      const burgId = factionById(candidate.ref.id)?.hq?.burgId;
      return burgId ? pack.burgs?.[burgId] : undefined;
    }
    const cell = candidate.cell;
    if (cell === undefined) return undefined;
    const burgId = pack.cells?.burg?.[cell];
    return burgId ? pack.burgs?.[burgId] : undefined;
  }

  private pickRivalBurg(context: StepContext): Burg | undefined {
    const state = context.usurpState ?? this.pickRivalState(context.candidate, context.rivalStateIds);
    const capital = state?.capital;
    const burg = capital ? pack.burgs?.[capital] : undefined;
    if (burg && !burg.removed) return burg;
    return this.pickAnyBurg(context.candidate.ref.kind === "faction" ? context.candidate.ref.id : undefined);
  }

  private pickAnyBurg(excludeFactionId?: number): Burg | undefined {
    const burgs = activeBurgs();
    if (!excludeFactionId) return ra(burgs);
    const factionBurg = factionById(excludeFactionId)?.hq?.burgId;
    const options = burgs.filter(burg => burg.i !== factionBurg);
    return ra(options.length ? options : burgs);
  }

  private pickLoreBurg(context: StepContext): Burg | undefined {
    const marker = ra(
      (pack.markers ?? []).filter(
        marker => marker && !marker.hidden && (marker.type === "libraries" || marker.type === "ruins")
      )
    );
    if (marker) {
      const burgId = pack.cells?.burg?.[marker.cell];
      const burg = burgId ? pack.burgs?.[burgId] : undefined;
      if (burg && !burg.removed) return burg;
    }
    return context.homeBurg ?? this.pickAnyBurg();
  }

  private pickWarPair(candidate: MastermindCandidate): State[] {
    const states = activeStates().filter(state => state.i !== candidate.stateId);
    if (states.length < 2) return [];
    const first = ra(states);
    const second = ra(states.filter(state => state.i !== first.i));
    return second ? [first, second] : [];
  }

  private pickSite(goal: SchemeGoalDef): Site | undefined {
    const types = RELIC_SITES[goal.id] ?? RELIC_SITES.default;
    const marker = ra(
      (pack.markers ?? []).filter(
        (marker): marker is Marker =>
          Boolean(marker) && !marker.hidden && marker.cell !== undefined && types.includes(marker.type)
      )
    );
    if (marker) return { cell: marker.cell, markerId: marker.i };

    const temple = ra(activeBurgs().filter(burg => burg.temple));
    if (temple) return { cell: temple.cell };
    const burg = this.pickAnyBurg();
    return burg ? { cell: burg.cell } : undefined;
  }

  private createRelic(goal: SchemeGoalDef, candidate: MastermindCandidate): Relic | undefined {
    const site = this.pickSite(goal);
    if (!site) return undefined;

    const kind = ra(goal.relicKinds.length ? goal.relicKinds : RELIC_KINDS.map(relic => relic.id));
    const religion = religionById(candidate.religionId);
    const relic: Relic = {
      i: ++this.relicSequence,
      name: this.relicName(kind, candidate.culture, religion),
      kind,
      at: site,
      tags: [goal.id]
    };
    this.ensureRelics().push(relic);
    return relic;
  }

  private relicName(kind: string, cultureId: number, religion: Religion | undefined): string {
    const noun = RELIC_KIND_BY_ID[kind]?.noun ?? kind;
    const culture = pack.cultures?.[cultureId]?.name;
    const founder = Names.getCulture(cultureId);
    const patterns = [
      religion?.deity ? `The ${noun} of ${religion.deity}` : "",
      culture ? `The ${getAdjective(culture)} ${noun}` : "",
      `The ${noun} of ${founder}`
    ].filter(Boolean);

    let name = ra(patterns) || `The ${noun}`;
    const base = name;
    let suffix = 2;
    while (this.usedRelicNames.has(name)) name = `${base} ${suffix++}`;
    this.usedRelicNames.add(name);
    return name;
  }

  private keystoneOf(
    goal: SchemeGoalDef,
    steps: SchemeStep[],
    usurpState: State | undefined,
    doomSite: Site | undefined
  ): string | undefined {
    if (goal.id === "usurp_throne" && usurpState) return `state:${usurpState.i}`;
    if (goal.id === "universal_empire") {
      const conquest = [...steps].reverse().find(step => step.verb === "conquer" && step.targets[0]?.kind === "state");
      return conquest ? `state:${conquest.targets[0].id}` : undefined;
    }
    if (goal.id === "extinguish_faith") {
      const target = steps.flatMap(step => step.targets).find(ref => ref.kind === "religion");
      return target ? `religion:${target.id}` : undefined;
    }
    if (goal.id === "unseal_doom" && doomSite?.markerId !== undefined) return `marker:${doomSite.markerId}`;
    return undefined;
  }
}

export const Schemes = new SchemesModule();
