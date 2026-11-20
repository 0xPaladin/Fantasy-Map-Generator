// The Delve engine: a seeded mission loop over a dungeon profile and a party.
// Ported from solo-engine's run-mission state machine.
// See docs/plans/dungeon-delves.md.

import { DIE_SIDES } from "@/data/character-actions";
import {
  DEFAULT_DELVE_CONFIG,
  type DelveConfig,
  type DelveOrderConfig,
  ratingDie,
  stepDieSides
} from "@/data/delve-config";
import { TREASURE_CATEGORIES, type TreasureCategory } from "@/data/treasure";
import type { DungeonProfile } from "@/model/story/dungeon-generator";
import { pickTreasureCategory } from "@/model/story/treasure";
import type { ActionId } from "@/types/character-actions";
import type {
  DelveEvent,
  DelveEventType,
  DelveHero,
  DelveLoot,
  DelveOptions,
  DelveOutcome,
  DelveResult
} from "@/types/delves";
import { createRng, type Rng } from "@/utils/rng";
import { resolveChallenge } from "./challenge";
import {
  alertDie,
  alertFromInhabitants,
  driftChaos,
  frameScene,
  type ProgressKind,
  rollProgress,
  stepAlert
} from "./progress";
import { alterSituation, buildInjectedObjective, buildObjectives } from "./situations";

type MutableHero = DelveHero & { down: boolean; injuries: number };

const CACHE_PATTERN = /treasure cache \((\d+)d(\d+)([+-]\d+)?\)(?:\s*\[([a-z]+)\])?/i;

const PROGRESS_TEXT: Record<ProgressKind, string> = {
  upheaval: "Upheaval — the dungeon reasserts itself",
  setback: "Setback — a way forward is blocked",
  compromised: "Compromised advance",
  advance: "Clean advance"
};

function dieFor(hero: DelveHero, action: ActionId): number {
  return DIE_SIDES[hero.actions[action] ?? "d4"];
}

function compareHeroes(action: ActionId, leaderId: number) {
  return (a: MutableHero, b: MutableHero): number => {
    const byDie = dieFor(b, action) - dieFor(a, action);
    if (byDie) return byDie;
    if (a.figureId === leaderId && b.figureId !== leaderId) return -1;
    if (b.figureId === leaderId && a.figureId !== leaderId) return 1;
    return a.figureId - b.figureId;
  };
}

function parseCache(rng: Rng, text: string): { value: number; part?: TreasureCategory } | undefined {
  const match = CACHE_PATTERN.exec(text);
  if (!match) return undefined;
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const modifier = Number(match[3] ?? 0);
  let value = modifier;
  for (let index = 0; index < count; index++) value += rng.d(sides);
  const part = match[4] ? TREASURE_CATEGORIES.find(category => category === match[4]) : undefined;
  return { value: Math.max(1, value), part };
}

export function runDelve(
  profile: DungeonProfile,
  partyInput: readonly DelveHero[],
  options: DelveOptions,
  config: DelveConfig = DEFAULT_DELVE_CONFIG
): DelveResult {
  if (!partyInput.length || partyInput.length > 6) {
    throw new Error("A delve needs 1–6 heroes");
  }

  const rng = createRng(options.seed);
  const party: MutableHero[] = partyInput.map(hero => ({
    ...hero,
    injuries: hero.injuries ?? 0,
    down: false
  }));
  const leaderId = options.leaderId ?? party[0].figureId;
  const neutralOrder: DelveOrderConfig = {
    threatStep: 0,
    rankBonus: 0,
    lootMultiplier: 1,
    freeRerolls: 0,
    breakThreshold: config.pressure.breakThreshold
  };
  const order = options.order ? config.orders[options.order] : neutralOrder;

  const startingAlert = alertFromInhabitants(profile.inhabitants.rating);
  let alert = startingAlert;
  let chaos = Math.max(config.chaos.min, Math.min(config.chaos.max, profile.ratings.weirdness));
  const maxObjectives = Math.min(config.objectives.max, Math.max(1, options.maxObjectives ?? config.objectives.max));
  const objectives = buildObjectives(profile, config).slice(0, maxObjectives);
  const loot: DelveLoot = { bullion: 0, regalia: 0, art: 0, relics: 0 };
  const events: DelveEvent[] = [];

  let turns = 0;
  let supplies = config.supply.baseTurns + config.supply.perRetainer * (options.retainers ?? 0);
  let escalation = 0;
  let pendingComplications = 0;
  let situationsInObjective = 0;
  let freeRerollsLeft = order.freeRerolls;
  let outcome: DelveOutcome | undefined;

  const startResolve = party.reduce((sum, hero) => sum + hero.resolve, 0);
  const totalResolve = (): number => party.reduce((sum, hero) => sum + hero.resolve, 0);

  const log = (type: DelveEventType, text: string, objective?: number): void => {
    events.push(objective === undefined ? { turn: turns, type, text } : { turn: turns, type, text, objective });
  };

  const damage = (hero: MutableHero, amount: number): void => {
    if (amount <= 0 || hero.down) return;
    hero.resolve = Math.max(0, hero.resolve - amount);
    if (hero.resolve === 0) hero.down = true;
  };

  const injectObjective = (): void => {
    if (objectives.length >= maxObjectives) {
      log("objective_injected", "The dungeon has no more ground to give.");
      return;
    }
    const objective = buildInjectedObjective(profile, objectives.length + 1, rng);
    objectives.push(objective);
    log("objective_injected", `New objective: ${objective.title}.`, objective.index);
  };

  const releaseLoot = (situationTitle: string): void => {
    const cache = parseCache(rng, situationTitle);
    const part = cache?.part ?? pickTreasureCategory(rng, profile.treasure.shares);
    const value = (cache?.value ?? 1) * config.loot.cacheMultiplier * order.lootMultiplier;
    const amount = Math.max(1, Math.round(value));
    loot[part] += amount;
    log("loot", `Recovered ${amount} ${part}.`);
  };

  log("delve_start", `${profile.name}: ${objectives.length} objectives, alert ${startingAlert}, chaos ${chaos}.`);

  for (let step = 0; !outcome && step < 512; step++) {
    const objective = objectives.find(entry => entry.status === "pending" || entry.status === "active");
    if (!objective) {
      outcome = "triumph";
      break;
    }

    if (objective.status === "pending") {
      objective.status = "active";
      situationsInObjective = 0;
      freeRerollsLeft = order.freeRerolls;
      log("objective_start", `${objective.title}.`, objective.index);
      if (pendingComplications > 0) {
        for (const situation of objective.situations.slice(0, pendingComplications)) situation.strength += 1;
        log("objective_start", `${pendingComplications} complications harden the way ahead.`, objective.index);
        pendingComplications = 0;
      }
    }

    const situation = objective.situations.find(entry => entry.strength > 0);
    if (!situation) {
      objective.status = "done";
      log("objective_done", `${objective.title} — done.`, objective.index);
      if (!party.some(hero => hero.down)) chaos = driftChaos(chaos, -1, config);

      const progress = rollProgress(rng);
      log("progress", `Progress ${progress.roll}: ${PROGRESS_TEXT[progress.kind]}.`, objective.index);
      if (progress.kind === "upheaval") {
        escalation++;
        alert = stepAlert(alert);
        chaos = driftChaos(chaos, 1, config);
        log("alert", `The dungeon is roused: alert ${alert}.`);
        injectObjective();
      } else if (progress.kind === "setback") {
        escalation++;
        injectObjective();
      } else if (progress.kind === "compromised") {
        if (rng.chance(0.5)) {
          alert = stepAlert(alert);
          log("alert", `Compromised: alert ${alert}.`);
        } else {
          pendingComplications = 3;
        }
      }

      if (objectives.every(entry => entry.status === "done")) {
        outcome = "triumph";
        break;
      }
      continue;
    }

    const cost = rng.int(config.turns.min, config.turns.max);
    turns += cost;
    supplies -= cost;
    if (supplies < 0) {
      for (const hero of party) damage(hero, config.supply.outOfSupplyResolve);
      log("supplies", "Out of supplies — the party bleeds Resolve.");
      if (party.every(hero => hero.down)) {
        outcome = "defeat";
        break;
      }
    }

    situationsInObjective++;
    if (situationsInObjective > config.alerts[alert].freeTurns) {
      const stepped = stepAlert(alert);
      if (stepped !== alert) {
        alert = stepped;
        log("alert", `The dungeon stirs: alert ${alert}.`, objective.index);
      }
    }

    const scene = frameScene(rng, chaos, config);
    chaos = scene.chaos;
    log("scene", `${scene.kind} scene — ${situation.title}.`, objective.index);
    if (scene.kind === "altered") {
      Object.assign(situation, alterSituation(situation, rng, profile.ratings));
      log("scene", `The room is not as the profile said: ${situation.kind}.`, objective.index);
    } else if (scene.kind === "interrupt") {
      if (rng.chance(0.5)) {
        alert = stepAlert(alert);
        log("alert", `Interrupt: alert ${alert}.`, objective.index);
      } else {
        injectObjective();
      }
    }

    const active = party.filter(hero => !hero.down).sort(compareHeroes(situation.action, leaderId));
    const acting = active[0];
    if (!acting) {
      outcome = "defeat";
      break;
    }
    const support = active.find(hero => hero.figureId !== acting.figureId);

    const challenge = resolveChallenge({
      rng,
      acting,
      support,
      action: situation.action,
      tags: situation.tags,
      alertDie: stepDieSides(alertDie(alert, config), order.threatStep),
      ratingDie: stepDieSides(ratingDie(profile.ratings[situation.rating], config), order.threatStep),
      maxRerolls: config.challenge.rerollsPerSituation,
      freeRerolls: freeRerollsLeft,
      supportBonus: config.challenge.supportBonus,
      resolvePerRank: config.pressure.resolvePerRank,
      injuryPenaltyCap: config.challenge.injuryPenaltyCap
    });
    freeRerollsLeft = Math.max(0, freeRerollsLeft - challenge.freeRerollsUsed);
    acting.stamina = Math.max(0, acting.stamina - challenge.staminaSpent);

    const rollText = `${challenge.officerMax} vs ${challenge.threatMax}`;
    if (challenge.kind === "success" || challenge.kind === "critical_success") {
      const ranks = Math.max(1, challenge.successRanks + order.rankBonus);
      situation.strength = Math.max(0, situation.strength - ranks);
      log("challenge", `${acting.name} — ${situation.action}: ${rollText}, ${challenge.kind}.`, objective.index);
      if (situation.strength === 0) releaseLoot(situation.title);
    } else if (challenge.kind === "twist") {
      const twist = rng.choice(config.twists);
      damage(acting, twist.resolve);
      if (twist.alertStep) alert = stepAlert(alert);
      log("twist", `${acting.name} — ${rollText}, twist: ${twist.text}`, objective.index);
    } else {
      damage(acting, challenge.resolveLoss);
      if (acting.down && support) damage(support, 1);
      if (challenge.injured) {
        acting.injuries = Math.min(config.challenge.injuryLimit, acting.injuries + 1);
        if (options.order === "swift") alert = stepAlert(alert);
      }
      log("challenge", `${acting.name} — ${situation.action}: ${rollText}, ${challenge.kind}.`, objective.index);
    }

    if (party.every(hero => hero.down)) {
      outcome = "defeat";
      break;
    }
    if (totalResolve() <= startResolve * order.breakThreshold) {
      objective.status = "failed";
      outcome = "retreat";
      break;
    }
  }

  if (!outcome) {
    outcome = objectives.every(entry => entry.status === "done") ? "triumph" : "retreat";
  }

  const objectivesDone = objectives.filter(entry => entry.status === "done").length;
  const objectivesTotal = objectives.length;
  const xp = Math.max(
    0,
    config.xp.base + objectivesDone * config.alerts[startingAlert].xp - escalation * config.xp.escalationPenalty
  );

  if (outcome === "triumph") {
    log("triumph", `${profile.name} is cleared.`);
  } else if (outcome === "defeat") {
    log("defeat", "The party does not come back out.");
  } else {
    log("retreat", "The party withdraws with what it can carry.");
  }
  log("delve_end", `${objectivesDone}/${objectivesTotal} objectives · ${turns} turns · ${xp} XP · alert ${alert}.`);

  return {
    outcome,
    objectives,
    objectivesDone,
    objectivesTotal,
    alert,
    startingAlert,
    escalation,
    chaos,
    turns,
    supplies: Math.max(0, supplies),
    loot,
    xp,
    heroes: party.map(hero => ({
      figureId: hero.figureId,
      name: hero.name,
      resolve: hero.resolve,
      stamina: hero.stamina,
      injuries: hero.injuries ?? 0,
      down: hero.down
    })),
    events
  };
}
