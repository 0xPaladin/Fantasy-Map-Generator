// Opposed challenge roll: action dice vs the dungeon's two threat dice.
// Ported from solo-engine's WAC challenge roll. See docs/plans/dungeon-delves.md §4.1.

import { ACTION_DEFS, DIE_SIDES } from "@/data/character-actions";
import { aspectBonus } from "@/data/hero-aspects";
import { disciplineBonus } from "@/data/hero-disciplines";
import type { ActionId } from "@/types/character-actions";
import type { DelveHero } from "@/types/delves";
import type { MissionTag } from "@/types/living";
import type { Rng } from "@/utils/rng";

export type ChallengeKind = "success" | "failure" | "critical_success" | "critical_failure" | "twist";

export interface ChallengeInput {
  rng: Rng;
  acting: DelveHero;
  support?: DelveHero;
  action: ActionId;
  tags: readonly MissionTag[];
  alertDie: number;
  ratingDie: number;
  maxRerolls?: number;
  /** rerolls that do not spend Stamina */
  freeRerolls?: number;
  supportBonus?: number;
  resolvePerRank?: number;
  injuryPenaltyCap?: number;
}

export interface ChallengeResult {
  kind: ChallengeKind;
  dm: number;
  officerRolls: number[];
  threatRolls: number[];
  /** officer max with DM */
  officerMax: number;
  threatMax: number;
  successRanks: number;
  failureRanks: number;
  resolveLoss: number;
  rerolls: number;
  freeRerollsUsed: number;
  staminaSpent: number;
  injured: boolean;
}

interface Attempt {
  kind: ChallengeKind;
  actingRoll: number;
  supportRoll?: number;
  alertRoll: number;
  ratingRoll: number;
  officerMax: number;
  threatMax: number;
  successRanks: number;
  failureRanks: number;
}

const isSetback = (kind: ChallengeKind): boolean => kind !== "success" && kind !== "critical_success";

export function resolveChallenge(input: ChallengeInput): ChallengeResult {
  const {
    rng,
    acting,
    support,
    action,
    tags,
    alertDie,
    ratingDie,
    maxRerolls = 0,
    freeRerolls = 0,
    supportBonus = 1,
    resolvePerRank = 1,
    injuryPenaltyCap = 2
  } = input;

  const attribute = acting.attributes[ACTION_DEFS[action].attribute] ?? 0;
  const fit = disciplineBonus(acting.disciplines, tags);
  const aspect = aspectBonus(acting, tags);
  const injuries = Math.min(injuryPenaltyCap, acting.injuries ?? 0);
  const supportFit = support ? Math.min(supportBonus, disciplineBonus(support.disciplines, tags)) : 0;
  const dm = attribute + fit + aspect + supportFit - injuries;

  const actingSides = DIE_SIDES[acting.actions[action] ?? "d4"];
  const supportSides = support ? DIE_SIDES[support.actions[action] ?? "d4"] : undefined;

  const rollOnce = (): Attempt => {
    const actingRoll = rng.d(actingSides);
    const supportRoll = supportSides ? rng.d(supportSides) : undefined;
    const alertRoll = rng.d(alertDie);
    const ratingRoll = rng.d(ratingDie);
    const officerMax = Math.max(actingRoll, supportRoll ?? 0) + dm;
    const threatMax = Math.max(alertRoll, ratingRoll);

    if (officerMax === threatMax) {
      return {
        kind: "twist",
        actingRoll,
        supportRoll,
        alertRoll,
        ratingRoll,
        officerMax,
        threatMax,
        successRanks: 0,
        failureRanks: 0
      };
    }

    if (officerMax > threatMax) {
      const critical = supportRoll !== undefined && actingRoll === supportRoll;
      return {
        kind: critical ? "critical_success" : "success",
        actingRoll,
        supportRoll,
        alertRoll,
        ratingRoll,
        officerMax,
        threatMax,
        successRanks: critical ? Math.max(1, officerMax) : 1,
        failureRanks: 0
      };
    }

    const critical = alertRoll === ratingRoll;
    return {
      kind: critical ? "critical_failure" : "failure",
      actingRoll,
      supportRoll,
      alertRoll,
      ratingRoll,
      officerMax,
      threatMax,
      successRanks: 0,
      failureRanks: critical ? 2 : 1 + Math.floor((threatMax - officerMax) / 3)
    };
  };

  let attempt = rollOnce();
  let rerolls = 0;
  let freeRerollsUsed = 0;
  let staminaSpent = 0;

  while (isSetback(attempt.kind) && rerolls < maxRerolls) {
    const useFree = freeRerollsUsed < freeRerolls;
    if (!useFree && staminaSpent >= acting.stamina) break;
    if (useFree) freeRerollsUsed++;
    else staminaSpent++;
    rerolls++;
    attempt = rollOnce();
  }

  return {
    kind: attempt.kind,
    dm,
    officerRolls: attempt.supportRoll === undefined ? [attempt.actingRoll] : [attempt.actingRoll, attempt.supportRoll],
    threatRolls: [attempt.alertRoll, attempt.ratingRoll],
    officerMax: attempt.officerMax,
    threatMax: attempt.threatMax,
    successRanks: attempt.successRanks,
    failureRanks: attempt.failureRanks,
    resolveLoss: attempt.failureRanks * resolvePerRank,
    rerolls,
    freeRerollsUsed,
    staminaSpent,
    injured: attempt.kind === "critical_failure"
  };
}
