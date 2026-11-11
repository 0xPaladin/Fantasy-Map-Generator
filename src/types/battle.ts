/**
 * Battle / army types shared between the Living World (civ) engine and the
 * roster content pipeline.
 */

export interface ArmyUnit {
  type: string;
  /** Current men (0..UnitType.men). */
  count: number;
  /** Experience 0..9. */
  exp: number;
  /** Temporary militia unit spawned for local defense. */
  temporaryMilitia?: boolean;
  /** Disruption points accrued from failed obstacle/trouble checks or fatigue (0..3) */
  disruption?: number;
}

/**
 * One Living World block on a regiment (living-openciv-armies.md §5.1): a type
 * plus its current **capability fraction**, not a headcount. `hp` is exactly the
 * `fill` `battle.ts` computes, so damage, healing and upkeep all scale off one
 * number. `battle.ts` still speaks absolute `count`; the bridge in
 * `living-armies.ts` is the only place the two meet.
 */
export interface ArmyBlock {
  type: string;
  /** 0 < hp <= 1. % capability, and exactly the `fill` battle.ts already uses. */
  hp: number;
  /** Experience 0..9. */
  exp: number;
  /** Trouble-resolution fatigue carried over from `ArmyUnit` (0..3). */
  disruption?: number;
}
