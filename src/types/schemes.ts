// Villain masterminds and their world-altering schemes. See docs/plans/villain-schemes.md.
import type { HistRef } from "@/types/history";

/** Where a mastermind is seated: a crown, a faith, a living god, or a faction (wild = no burg HQ). */
export type MastermindPool = "crowned" | "religious" | "living_god" | "faction" | "wild";

export type SchemeGoalId =
  | "divine_ascension"
  | "undying"
  | "universal_empire"
  | "extinguish_faith"
  | "usurp_throne"
  | "puppeteer"
  | "unseal_doom";

export type SchemeVerb =
  | "seize_relic"
  | "assassinate"
  | "conquer"
  | "occupy_site"
  | "perform_ritual"
  | "convert"
  | "corrupt_official"
  | "engineer_war"
  | "infiltrate"
  | "build"
  | "research_lore"
  | "breach_seal";

export type SchemeStepStatus = "pending" | "active" | "done" | "failed";
export type SchemeStatus = "active" | "complete" | "collapsed";

export interface SchemeStep {
  verb: SchemeVerb;
  targets: HistRef[];
  /** the site the step happens at, when it has one */
  cell?: number;
  /** seasons the step channels once active (rituals, occupations, breaches) */
  duration?: number;
  /** seasons of channel work left; runtime-owned, absent on non-channel steps */
  progress?: number;
  status: SchemeStepStatus;
  /** the relic a seize step is about */
  relicId?: number;
}

export interface Scheme {
  i: number;
  goal: SchemeGoalId;
  /** the institution the mastermind leads: the seat schemes are paid from and retaliation falls on */
  mastermind: HistRef;
  /** the person: always a figure in `pack.history.figures` */
  villainFigure: number;
  template: string;
  /** 0..100; a consequence gate only — the god view always sees the scheme */
  secrecy: number;
  /** uncovered by a failed move; later phases hang coalitions and suppression on it */
  exposed?: boolean;
  steps: SchemeStep[];
  status: SchemeStatus;
  startedYear: number;
}

export interface Relic {
  i: number;
  name: string;
  kind: string;
  /** where it lies until seized */
  at: { cell: number; markerId?: number };
  holder?: HistRef;
  tags?: string[];
}
