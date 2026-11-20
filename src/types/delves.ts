// Dungeon delve types. Engine: src/model/story/delve/.
// See docs/plans/dungeon-delves.md.

import type { CharacterAttributes } from "./character";
import type { ActionId, Die } from "./character-actions";
import type { DisciplineId, MissionTag } from "./living";

export const DELVE_ALERTS = ["quiet", "uneasy", "alerted", "hunting"] as const;
export type DelveAlert = (typeof DELVE_ALERTS)[number];

export const DELVE_ORDERS = ["swift", "cautious", "greedy"] as const;
export type DelveOrder = (typeof DELVE_ORDERS)[number];

export type DelveOutcome = "triumph" | "retreat" | "defeat";
export type DelveObjectiveStatus = "pending" | "active" | "done" | "failed";
export type DelveSituationKind = "fight" | "trap" | "clue" | "find" | "setpiece";
export type DelveRatingKey = "danger" | "mystery" | "weirdness";

export const TREASURE_PARTS = ["bullion", "regalia", "art", "relics"] as const;
export type DelveLootPart = (typeof TREASURE_PARTS)[number];

export interface DelveHero {
  figureId: number;
  name: string;
  actions: Record<ActionId, Die>;
  attributes: CharacterAttributes;
  resolve: number;
  maxResolve: number;
  stamina: number;
  maxStamina: number;
  /** injury count; each costs 1 DM up to the config cap */
  injuries?: number;
  disciplines?: DisciplineId[];
  virtues?: string[];
  vices?: string[];
}

export interface DelveSituation {
  id: string;
  area: number;
  kind: DelveSituationKind;
  title: string;
  tags: MissionTag[];
  action: ActionId;
  /** which 1-10 rating feeds the second threat die */
  rating: DelveRatingKey;
  /** chipped by success ranks */
  strength: number;
  /** the dungeon's master; always last in its objective */
  leader?: boolean;
}

export interface DelveObjective {
  index: number;
  title: string;
  situations: DelveSituation[];
  status: DelveObjectiveStatus;
}

export interface DelveLoot {
  bullion: number;
  regalia: number;
  art: number;
  relics: number;
}

export type DelveEventType =
  | "delve_start"
  | "objective_start"
  | "objective_done"
  | "scene"
  | "challenge"
  | "twist"
  | "loot"
  | "progress"
  | "alert"
  | "objective_injected"
  | "supplies"
  | "retreat"
  | "defeat"
  | "triumph"
  | "delve_end";

export interface DelveEvent {
  turn: number;
  type: DelveEventType;
  objective?: number;
  text: string;
}

export interface DelveHeroResult {
  figureId: number;
  name: string;
  resolve: number;
  stamina: number;
  injuries: number;
  down: boolean;
}

export interface DelveOptions {
  /** caller-owned seed, e.g. `${mapSeed}:delve:${cell}:${figureIds}:${tick}` */
  seed: string;
  leaderId?: number;
  order?: DelveOrder;
  retainers?: number;
  maxObjectives?: number;
}

export interface DelveResult {
  outcome: DelveOutcome;
  objectives: DelveObjective[];
  objectivesDone: number;
  objectivesTotal: number;
  alert: DelveAlert;
  startingAlert: DelveAlert;
  escalation: number;
  chaos: number;
  turns: number;
  supplies: number;
  loot: DelveLoot;
  xp: number;
  heroes: DelveHeroResult[];
  events: DelveEvent[];
}

/** Persisted record; the event log lives in the marker note, not the save. */
export interface DelveRecord {
  i: number;
  marker: number;
  cell: number;
  year: number;
  tick: number;
  party: number[];
  order: DelveOrder;
  outcome: DelveOutcome;
  objectivesDone: number;
  objectivesTotal: number;
  turns: number;
  finalAlert: DelveAlert;
  escalation: number;
  loot: DelveLoot;
  xp: number;
}

export interface MarkerDelveState {
  status: "undisturbed" | "weakened" | "cleared";
  lastDelve?: number;
  clearedYear?: number;
}
