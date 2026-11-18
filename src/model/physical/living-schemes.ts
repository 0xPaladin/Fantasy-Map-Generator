// Villain scheme runtime: world-match, seasonal pushes, exposure, retargeting and succession.
// See docs/plans/villain-schemes.md. Called once a season by the Living World, beside Phase B.
import { SCHEME_GOAL_BY_ID } from "@/data/scheme-goals";
import type { Burg } from "@/model/political/burgs-generator";
import type { State } from "@/model/political/states-generator";
import { Characters } from "@/model/society/characters";
import type { Religion } from "@/model/society/religions-generator";
import { Schemes } from "@/model/story/schemes-generator";
import type { Faction } from "@/types/factions";
import type { HistoricalFigure, HistoryEventType, HistRef } from "@/types/history";
import type { LivingNewsKind, LivingWorldState } from "@/types/living";
import type { Relic, Scheme, SchemeStep, SchemeVerb } from "@/types/schemes";
import type { Rng } from "@/utils/rng";

/** The Living World operations a scheme needs; keeps this module free of the engine import cycle. */
export interface SchemeRuntime {
  isAtWar(stateId: number, otherId: number): boolean;
  declareWar(stateId: number, otherId: number): void;
  killFigure(figureId: number): boolean;
  pushNews(
    living: LivingWorldState,
    item: { kind: LivingNewsKind; text: string; cell?: number; stateId?: number }
  ): unknown;
  pushHistory(type: HistoryEventType, actors: HistRef[], cell: number | undefined, text: string): void;
  rng(tag: string, id?: number): Rng;
}

/** Daily gold a push costs the mastermind's purse. */
const PUSH_COST: Record<SchemeVerb, number> = {
  seize_relic: 12,
  assassinate: 15,
  conquer: 25,
  occupy_site: 8,
  perform_ritual: 10,
  convert: 8,
  corrupt_official: 8,
  engineer_war: 20,
  infiltrate: 10,
  build: 12,
  research_lore: 6,
  breach_seal: 12
};

/** Seasons of work for verbs that channel rather than resolve in one attempt. */
const CHANNEL_PROGRESS: Partial<Record<SchemeVerb, number>> = {
  infiltrate: 2,
  build: 2,
  research_lore: 2,
  occupy_site: 3,
  perform_ritual: 4,
  breach_seal: 2
};

const puppetTag = (scheme: Scheme): string => `scheme_puppet:${scheme.i}`;

export function tickSchemes(living: LivingWorldState, runtime: SchemeRuntime): void {
  for (const scheme of Schemes.ensureSchemes()) {
    if (scheme.status !== "active") continue;
    advance(living, scheme, runtime);
  }
}

function advance(living: LivingWorldState, scheme: Scheme, runtime: SchemeRuntime): void {
  if (!ensureVillain(living, scheme, runtime)) return;

  const step = activeStep(scheme);
  if (!step) {
    finishScheme(living, scheme, runtime);
    return;
  }

  if (!ensureTargets(step, scheme)) {
    failStep(living, scheme, step, runtime);
    return;
  }
  if (isComplete(step, scheme, runtime)) {
    completeStep(living, scheme, step, runtime);
    return;
  }

  pushStep(living, scheme, step, runtime);
  if (isComplete(step, scheme, runtime)) completeStep(living, scheme, step, runtime);
}

// ---------------------------------------------------------------------------
// Villain, succession and exposure
// ---------------------------------------------------------------------------

function ensureVillain(living: LivingWorldState, scheme: Scheme, runtime: SchemeRuntime): boolean {
  const villain = Characters.get(scheme.villainFigure);
  if (villain && !villain.removed && villain.death === undefined) return true;

  const heir = findHeir(scheme);
  if (heir) {
    scheme.villainFigure = heir.i;
    scheme.secrecy = Math.min(100, scheme.secrecy + 5);
    for (const step of scheme.steps) {
      if (step.progress !== undefined) step.progress = Math.max(1, Math.ceil(step.progress * 0.7));
    }
    const text = `${heir.name} inherits ${villain?.name ?? "a fallen mastermind"}'s design.`;
    runtime.pushNews(living, { kind: "faction", text, cell: cellOf(scheme), stateId: stateOf(scheme) });
    runtime.pushHistory("deed", [scheme.mastermind, { kind: "figure", id: heir.i }], cellOf(scheme), text);
    return true;
  }

  collapse(living, scheme, runtime, `${villain?.name ?? "The mastermind"} is dead; the design dies too.`);
  return false;
}

function findHeir(scheme: Scheme): HistoricalFigure | undefined {
  const master = scheme.mastermind;
  const living = Characters.active().filter(figure => figure.i !== scheme.villainFigure);
  const serving = living.filter(figure =>
    figure.roles?.some(
      role => role.to === undefined && role.target.kind === master.kind && role.target.id === master.id
    )
  );
  const agents = serving.filter(figure =>
    figure.roles?.some(role => role.to === undefined && (role.type === "agent" || role.type === "general"))
  );
  if (agents.length) return agents[0];
  if (serving.length) return serving[0];

  if (master.kind === "faction") {
    const faction = factionById(master.id);
    for (const memberId of faction?.memberIds ?? []) {
      const member = Characters.get(memberId);
      if (member && !member.removed && member.death === undefined && member.i !== scheme.villainFigure) return member;
    }
  }
  return undefined;
}

function collapse(living: LivingWorldState, scheme: Scheme, runtime: SchemeRuntime, text: string): void {
  if (scheme.status !== "active") return;
  scheme.status = "collapsed";
  runtime.pushNews(living, { kind: "faction", text, cell: cellOf(scheme), stateId: stateOf(scheme) });
  runtime.pushHistory("deed", [scheme.mastermind], cellOf(scheme), text);
}

function expose(living: LivingWorldState, scheme: Scheme, runtime: SchemeRuntime): void {
  if (scheme.exposed) return;
  scheme.exposed = true;
  const villain = Characters.get(scheme.villainFigure);

  const text = `${villain?.name ?? "A hidden hand"}'s design stands exposed.`;
  runtime.pushNews(living, { kind: "faction", text, cell: cellOf(scheme), stateId: stateOf(scheme) });
  runtime.pushHistory("deed", [scheme.mastermind], cellOf(scheme), text);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function activeStep(scheme: Scheme): SchemeStep | undefined {
  return scheme.steps.find(step => step.status === "active");
}

function activateStep(step: SchemeStep, scheme: Scheme): void {
  step.status = "active";
  step.progress ??= step.duration ?? CHANNEL_PROGRESS[step.verb];
  if (step.verb === "convert") ensureConvertCell(step);
  step.cell ??= cellOf(scheme);
}

function completeStep(living: LivingWorldState, scheme: Scheme, step: SchemeStep, runtime: SchemeRuntime): void {
  step.status = "done";
  const text = describeCompletion(scheme, step);
  runtime.pushNews(living, { kind: "faction", text, cell: step.cell ?? cellOf(scheme), stateId: stateOf(scheme) });

  const next = scheme.steps.find(candidate => candidate.status === "pending");
  if (next) activateStep(next, scheme);
  else finishScheme(living, scheme, runtime);
}

function failStep(living: LivingWorldState, scheme: Scheme, step: SchemeStep, runtime: SchemeRuntime): void {
  step.status = "failed";
  const next = scheme.steps.find(candidate => candidate.status === "pending");
  if (next) activateStep(next, scheme);
  else
    collapse(
      living,
      scheme,
      runtime,
      `${Characters.get(scheme.villainFigure)?.name ?? "The mastermind"} loses the thread of the design.`
    );
}

function finishScheme(living: LivingWorldState, scheme: Scheme, runtime: SchemeRuntime): void {
  if (scheme.status !== "active") return;
  scheme.status = "complete";
  const villain = Characters.get(scheme.villainFigure);
  const label = SCHEME_GOAL_BY_ID[scheme.goal]?.label ?? scheme.goal;
  const text = `${villain?.name ?? "A hidden hand"} completes the design: ${label}.`;
  runtime.pushNews(living, { kind: "faction", text, cell: cellOf(scheme), stateId: stateOf(scheme) });
  runtime.pushHistory("deed", [scheme.mastermind, { kind: "figure", id: scheme.villainFigure }], cellOf(scheme), text);
}

function describeCompletion(scheme: Scheme, step: SchemeStep): string {
  const villain = Characters.get(scheme.villainFigure)?.name ?? "A hidden hand";
  const victim = figureTarget(step) ? Characters.get(figureTarget(step)!.id) : undefined;
  const states = stateTargets(step);
  const religion = religionTarget(step) ? religionById(religionTarget(step)!.id) : undefined;
  const relic = relicFor(step);
  const burg = burgTarget(step);

  switch (step.verb) {
    case "assassinate":
      return `${victim?.name ?? "A rival"} is dead; ${villain} is suspected.`;
    case "engineer_war":
      return `${states[0]?.name ?? "Two realms"} and ${states[1]?.name ?? "their rival"} are at war.`;
    case "corrupt_official":
      return `${victim?.name ?? "An official"} now answers to ${villain}.`;
    case "seize_relic":
      return `${relic?.name ?? "A relic"} has vanished from its resting place.`;
    case "convert":
      return `The faithful of ${religion?.name ?? "a rival creed"} dwindle.`;
    case "conquer":
      return `${states[0]?.name ?? "A realm"} falls to ${villain}.`;
    case "breach_seal":
      return `Something stirs beneath ${burg?.name ?? "the old stones"}.`;
    default:
      return `${villain}'s agents finish their work at ${burg?.name ?? "the seat of the design"}.`;
  }
}

// ---------------------------------------------------------------------------
// Completion predicates
// ---------------------------------------------------------------------------

function isComplete(step: SchemeStep, scheme: Scheme, runtime: SchemeRuntime): boolean {
  switch (step.verb) {
    case "assassinate": {
      const target = figureTarget(step);
      if (!target) return false;
      const figure = Characters.get(target.id);
      return !figure || figure.removed || figure.death !== undefined;
    }
    case "conquer": {
      const target = stateTargets(step)[0];
      if (!target) return false;
      const state = stateById(target.i);
      if (!state || state.removed) return true;
      const capital = pack.burgs?.[state.capital];
      if (!capital || capital.removed) return true;
      const master = scheme.mastermind;
      if (master.kind === "state") return capital.state === master.id;
      if (master.kind === "faction")
        return Boolean(factionById(master.id)?.outposts.some(outpost => outpost.burgId === capital.i));
      if (master.kind === "religion") return pack.cells?.religion?.[capital.cell] === master.id;
      return false;
    }
    case "engineer_war": {
      const [a, b] = stateTargets(step);
      return Boolean(a && b && runtime.isAtWar(a.i, b.i));
    }
    case "seize_relic": {
      const relic = relicFor(step);
      return relic?.holder?.kind === "figure" && relic.holder.id === scheme.villainFigure;
    }
    case "corrupt_official": {
      const target = figureTarget(step);
      if (!target) return false;
      return Boolean(Characters.get(target.id)?.tags?.includes(puppetTag(scheme)));
    }
    case "convert": {
      const target = religionTarget(step);
      if (!target) return false;
      const religion = religionById(target.id);
      if (!religion || religion.removed) return true;
      if (step.cell === undefined) return true;
      return pack.cells?.religion?.[step.cell] !== target.id;
    }
    case "infiltrate": {
      const burg = burgTarget(step);
      const master = scheme.mastermind;
      if (master.kind === "faction" && burg) {
        const faction = factionById(master.id);
        if (faction?.outposts.some(outpost => outpost.burgId === burg.i)) return true;
      }
      return channelDone(step);
    }
    default:
      return channelDone(step);
  }
}

function channelDone(step: SchemeStep): boolean {
  step.progress ??= step.duration ?? CHANNEL_PROGRESS[step.verb] ?? 2;
  return step.progress <= 0;
}

// ---------------------------------------------------------------------------
// Pushing the active step
// ---------------------------------------------------------------------------

function pushStep(living: LivingWorldState, scheme: Scheme, step: SchemeStep, runtime: SchemeRuntime): void {
  if (bordersClosed(scheme, step, runtime)) return; // enemy territory: agents cannot work
  const rng = runtime.rng(`scheme:${scheme.i}`, living.tick);
  const cost = PUSH_COST[step.verb];
  const purse = purseOf(scheme.mastermind);

  if (purse === undefined) {
    if (!rng.chance(0.5)) return; // a faith with no patron lives on donations
  } else {
    if (purse < cost) return; // a broke mastermind stalls
    spend(scheme.mastermind, cost);
  }

  let succeeded = false;
  switch (step.verb) {
    case "assassinate": {
      const target = figureTarget(step);
      if (!target) break;
      const chance = 0.3 + Math.min(0.25, scheme.secrecy / 400);
      if (rng.chance(chance)) succeeded = runtime.killFigure(target.id);
      break;
    }
    case "engineer_war": {
      const [a, b] = stateTargets(step);
      if (!a || !b || runtime.isAtWar(a.i, b.i)) break;
      if (rng.chance(0.55)) {
        runtime.declareWar(a.i, b.i);
        succeeded = runtime.isAtWar(a.i, b.i);
      }
      break;
    }
    case "seize_relic": {
      const relic = relicFor(step);
      if (!relic) break;
      if (rng.chance(0.55)) {
        relic.holder = { kind: "figure", id: scheme.villainFigure };
        succeeded = true;
      }
      break;
    }
    case "corrupt_official": {
      const target = figureTarget(step);
      if (!target) break;
      const figure = Characters.get(target.id);
      if (!figure || !rng.chance(0.55)) break;
      figure.tags = Array.from(new Set([...(figure.tags ?? []), puppetTag(scheme)]));
      figure.relations ??= {};
      figure.relations.characters ??= {};
      figure.relations.characters[scheme.villainFigure] = "Ally";
      succeeded = true;
      break;
    }
    case "convert": {
      const target = religionTarget(step)?.id;
      const cells = pack.cells?.religion;
      if (target === undefined || !cells || step.cell === undefined) break;
      if (!rng.chance(0.6)) break;
      const own = ownReligion(scheme);
      cells[step.cell] = own === target ? 0 : own;
      succeeded = true;
      break;
    }
    case "conquer": {
      const target = stateTargets(step)[0];
      const master = scheme.mastermind;
      if (!target || !master) break;
      if (master.kind === "state" && master.id !== target.i && !runtime.isAtWar(master.id, target.i)) {
        if (rng.chance(0.5)) {
          runtime.declareWar(master.id, target.i);
          succeeded = runtime.isAtWar(master.id, target.i);
        }
      } else if (master.kind === "faction") {
        const faction = factionById(master.id);
        if (faction && !faction.raidPending) {
          faction.raidPending = true;
          succeeded = true;
        }
      } else if (master.kind === "religion") {
        const cells = pack.cells?.religion;
        const capital = pack.burgs?.[target.capital];
        if (cells && capital && cells[capital.cell] !== master.id && rng.chance(0.5)) {
          cells[capital.cell] = master.id;
          succeeded = true;
        }
      }
      break;
    }
    default: {
      step.progress ??= step.duration ?? CHANNEL_PROGRESS[step.verb] ?? 2;
      step.progress = Math.max(0, step.progress - 1);
      succeeded = step.progress <= 0;
    }
  }

  scheme.secrecy = Math.max(0, scheme.secrecy - (succeeded ? 1 : 2));
  if (scheme.secrecy === 0) expose(living, scheme, runtime);
}

// ---------------------------------------------------------------------------
// Targets: validation, replacement and concrete site cells
// ---------------------------------------------------------------------------

function ensureTargets(step: SchemeStep, scheme: Scheme): boolean {
  switch (step.verb) {
    case "assassinate": {
      const target = figureTarget(step);
      if (target) return true; // a dead target is completion, not a retarget
      const victim = pickFigure(scheme);
      if (!victim) return false;
      step.targets = [{ kind: "figure", id: victim.i }];
      return true;
    }
    case "corrupt_official": {
      const target = figureTarget(step);
      if (target && isAlive(target)) return true;
      const official = pickOfficial(scheme);
      if (!official) return false;
      step.targets = [{ kind: "figure", id: official.i }];
      return true;
    }
    case "engineer_war": {
      const chosen: State[] = [];
      for (const target of step.targets) {
        if (target.kind !== "state") continue;
        const state = stateById(target.id);
        if (state && isActiveState(state) && !chosen.some(entry => entry.i === state.i)) chosen.push(state);
      }
      while (chosen.length < 2) {
        const replacement = pickRivalState(
          scheme,
          chosen.map(state => state.i)
        );
        if (!replacement) return false;
        chosen.push(replacement);
      }
      step.targets = chosen.slice(0, 2).map(state => ({ kind: "state" as const, id: state.i }));
      return true;
    }
    case "conquer": {
      const target = stateTargets(step)[0];
      if (target) return true; // a removed state is completion
      const replacement = pickRivalState(scheme);
      if (!replacement) return false;
      step.targets = [{ kind: "state", id: replacement.i }];
      return true;
    }
    case "convert": {
      const target = religionTarget(step);
      if (target) {
        ensureConvertCell(step);
        return true;
      }
      const replacement = pickRivalReligion(scheme);
      if (!replacement) return false;
      step.targets = [{ kind: "religion", id: replacement.i }];
      ensureConvertCell(step, replacement.i);
      return true;
    }
    case "infiltrate":
    case "build":
    case "research_lore": {
      const burg = burgTarget(step);
      if (burg && !burg.removed) return true;
      const replacement = pickAnyBurg();
      if (!replacement) return false;
      step.targets = [{ kind: "burg", id: replacement.i }];
      step.cell = replacement.cell;
      return true;
    }
    case "seize_relic":
      return Boolean(relicFor(step));
    default:
      step.cell ??= cellOf(scheme);
      return true;
  }
}

function ensureConvertCell(step: SchemeStep, religionId?: number): void {
  const target = religionId ?? religionTarget(step)?.id;
  const cells = pack.cells?.religion;
  if (target === undefined || !cells) return;
  if (step.cell !== undefined && cells[step.cell] === target) return;
  if (step.cell !== undefined) step.cell = undefined;

  for (let cell = 1; cell < cells.length; cell++) {
    if (cells[cell] === target) {
      step.cell = cell;
      return;
    }
  }
  // no cell still holds the faith: the step's predicate treats it as done
}

function pickFigure(scheme: Scheme): HistoricalFigure | undefined {
  const figures = Characters.active().filter(figure => figure.i !== scheme.villainFigure);
  const roleBearing = figures.filter(figure =>
    figure.roles?.some(
      role =>
        role.to === undefined &&
        (role.type === "ruler" || role.type === "general" || role.type === "prophet" || role.type === "agent")
    )
  );
  return roleBearing[0] ?? figures[0];
}

function pickOfficial(scheme: Scheme): HistoricalFigure | undefined {
  const figures = Characters.active().filter(figure => figure.i !== scheme.villainFigure);
  const officials = figures.filter(figure =>
    figure.roles?.some(
      role => role.to === undefined && (role.type === "ruler" || role.type === "specialist" || role.type === "agent")
    )
  );
  return officials[0] ?? figures[0];
}

function pickRivalState(scheme: Scheme, exclude: number[] = []): State | undefined {
  const home = scheme.mastermind.kind === "state" ? scheme.mastermind.id : undefined;
  const states = (pack.states ?? []).filter(
    state => state?.i > 0 && !state.removed && state.i !== home && !exclude.includes(state.i)
  );
  const homeState = home !== undefined ? stateById(home) : undefined;
  const neighbors = (homeState?.neighbors ?? [])
    .map(id => stateById(id))
    .filter(
      (state): state is State => state !== undefined && state.i > 0 && !state.removed && !exclude.includes(state.i)
    );
  return neighbors[0] ?? states[0];
}

function pickRivalReligion(scheme: Scheme): Religion | undefined {
  const own = scheme.mastermind.kind === "religion" ? scheme.mastermind.id : undefined;
  return (pack.religions ?? []).find(
    religion => religion?.i > 0 && !religion.removed && religion.i !== own && religion.type !== "Folk"
  );
}

function pickAnyBurg(): Burg | undefined {
  return (pack.burgs ?? []).find(burg => burg?.i > 0 && !burg.removed);
}

// ---------------------------------------------------------------------------
// Purses, sites and small lookups
// ---------------------------------------------------------------------------

/** Covert work stops inside the land of a state at war with the mastermind's own. */
const COVERT_VERBS = new Set<SchemeVerb>([
  "seize_relic",
  "assassinate",
  "occupy_site",
  "perform_ritual",
  "convert",
  "corrupt_official",
  "infiltrate",
  "build",
  "research_lore",
  "breach_seal"
]);

function bordersClosed(scheme: Scheme, step: SchemeStep, runtime: SchemeRuntime): boolean {
  if (!COVERT_VERBS.has(step.verb)) return false;
  const master = scheme.mastermind;
  if (master.kind !== "state") return false;
  const owner = pack.cells?.state?.[step.cell ?? cellOf(scheme)] ?? 0;
  return owner > 0 && owner !== master.id && runtime.isAtWar(master.id, owner);
}

function purseOf(mastermind: HistRef): number | undefined {
  if (mastermind.kind === "state") return stateById(mastermind.id)?.economy?.treasury;
  if (mastermind.kind === "faction") return factionById(mastermind.id)?.treasury;
  if (mastermind.kind === "religion") {
    const religion = religionById(mastermind.id);
    if (!religion) return undefined;
    const host = (pack.factions ?? []).find(
      faction => faction?.i > 0 && !faction.removed && faction.religion === mastermind.id
    );
    if (host) return host.treasury;
    const stateId = pack.cells?.state?.[religion.center ?? 0];
    return stateId ? stateById(stateId)?.economy?.treasury : undefined;
  }
  return undefined;
}

function spend(mastermind: HistRef, cost: number): void {
  if (mastermind.kind === "state") {
    const state = stateById(mastermind.id);
    if (state?.economy) state.economy.treasury -= cost;
  } else if (mastermind.kind === "faction") {
    const faction = factionById(mastermind.id);
    if (faction) faction.treasury -= cost;
  } else if (mastermind.kind === "religion") {
    const host = (pack.factions ?? []).find(
      faction => faction?.i > 0 && !faction.removed && faction.religion === mastermind.id
    );
    if (host) {
      host.treasury -= cost;
      return;
    }
    const religion = religionById(mastermind.id);
    const stateId = religion ? pack.cells?.state?.[religion.center ?? 0] : 0;
    const state = stateId ? stateById(stateId) : undefined;
    if (state?.economy) state.economy.treasury -= cost;
  }
}

function ownReligion(scheme: Scheme): number {
  if (scheme.mastermind.kind === "religion") return scheme.mastermind.id;
  const cell = cellOf(scheme);
  return pack.cells?.religion?.[cell] ?? 0;
}

function cellOf(scheme: Scheme): number {
  const master = scheme.mastermind;
  if (master.kind === "state") return stateById(master.id)?.center ?? 0;
  if (master.kind === "faction") return factionById(master.id)?.hq?.cell ?? 0;
  if (master.kind === "religion") return religionById(master.id)?.center ?? 0;
  return Characters.get(scheme.villainFigure)?.cell ?? 0;
}

function stateOf(scheme: Scheme): number | undefined {
  return scheme.mastermind.kind === "state" ? scheme.mastermind.id : undefined;
}

function stateById(id: number | undefined): State | undefined {
  return id === undefined ? undefined : pack.states?.find(state => state?.i === id);
}

function religionById(id: number): Religion | undefined {
  return pack.religions?.find(religion => religion?.i === id);
}

function factionById(id: number | undefined): Faction | undefined {
  return id === undefined ? undefined : pack.factions?.find(faction => faction?.i === id);
}

function isActiveState(state: State): boolean {
  return state.i > 0 && !state.removed;
}

function isAlive(ref: HistRef): boolean {
  if (ref.kind !== "figure") return false;
  const figure = Characters.get(ref.id);
  return Boolean(figure && !figure.removed && figure.death === undefined);
}

function figureTarget(step: SchemeStep): HistRef | undefined {
  return step.targets.find(target => target.kind === "figure");
}

function stateTargets(step: SchemeStep): State[] {
  return step.targets
    .filter((target): target is HistRef & { kind: "state" } => target.kind === "state")
    .map(target => stateById(target.id))
    .filter((state): state is State => Boolean(state));
}

function religionTarget(step: SchemeStep): HistRef | undefined {
  return step.targets.find(target => target.kind === "religion");
}

function burgTarget(step: SchemeStep): Burg | undefined {
  const target = step.targets.find(entry => entry.kind === "burg");
  return target ? pack.burgs?.[target.id] : undefined;
}

function relicFor(step: SchemeStep): Relic | undefined {
  if (step.relicId === undefined) return undefined;
  return Schemes.ensureRelics().find(relic => relic.i === step.relicId);
}
