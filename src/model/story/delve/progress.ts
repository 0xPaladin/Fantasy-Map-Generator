// Alert ladder, scene framing and the progress roll.
// Ported from solo-engine's progress engine and scene framer.
// See docs/plans/dungeon-delves.md §4.2–§4.3.

import { DEFAULT_DELVE_CONFIG, type DelveConfig } from "@/data/delve-config";
import { DELVE_ALERTS, type DelveAlert } from "@/types/delves";
import type { Rng } from "@/utils/rng";

export type SceneKind = "expected" | "altered" | "interrupt";
export type ProgressKind = "upheaval" | "setback" | "compromised" | "advance";

export function alertFromInhabitants(rating: number): DelveAlert {
  if (rating <= 1) return "quiet";
  if (rating <= 3) return "uneasy";
  if (rating <= 5) return "alerted";
  return "hunting";
}

export function stepAlert(alert: DelveAlert, steps = 1): DelveAlert {
  const index = DELVE_ALERTS.indexOf(alert);
  const next = Math.max(0, Math.min(DELVE_ALERTS.length - 1, index + steps));
  return DELVE_ALERTS[next];
}

export function alertDie(alert: DelveAlert, config: DelveConfig = DEFAULT_DELVE_CONFIG): number {
  return config.alerts[alert].die;
}

export function driftChaos(chaos: number, delta: number, config: DelveConfig = DEFAULT_DELVE_CONFIG): number {
  return Math.max(config.chaos.min, Math.min(config.chaos.max, chaos + delta));
}

/** d10: equal to chaos interrupts, below changes the scene, above plays it straight. */
export function frameScene(
  rng: Rng,
  chaos: number,
  config: DelveConfig = DEFAULT_DELVE_CONFIG
): { kind: SceneKind; roll: number; chaos: number } {
  const roll = rng.d(10);
  if (roll === chaos) return { kind: "interrupt", roll, chaos: driftChaos(chaos, 1, config) };
  if (roll < chaos) return { kind: "altered", roll, chaos };
  return { kind: "expected", roll, chaos };
}

export function rollProgress(rng: Rng): { roll: number; kind: ProgressKind } {
  const roll = rng.d(6);
  const kind: ProgressKind = roll === 1 ? "upheaval" : roll === 2 ? "setback" : roll === 3 ? "compromised" : "advance";
  return { roll, kind };
}
