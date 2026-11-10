// Rulers and their councils sway the upstream economy (economy alignment §5.2).
// A leaf module: upstream economy code reads it without pulling in the Living generator.

import { type FigureBias, figureBias } from "@/model/physical/figure-bias";
import type { State } from "@/model/political/states-generator";
import type { HistoricalFigure } from "@/types/history";
import { minmax } from "@/utils/number-utils";

export interface RulerEconomyModifiers {
  /** percentage points added to the state's official corruption budget */
  corruption: number;
  /** multiplier on the court's provision, and so on stability and faith */
  court: number;
  /** multiplier on administration and infrastructure provision */
  administration: number;
  /** multiplier on the forces' living battle upkeep */
  upkeep: number;
  /** multiplier on siege progress */
  siege: number;
}

/** A ruler's corruption mark, worst and best */
const CIVIC_CORRUPTION = -5; // a fully civic ruler curbs officials' cut by 5 points
const CRUEL_CORRUPTION = 6;
const COURT_PIOUS = 0.25;
const ADMINISTRATION_CIVIC = 0.2;
const UPKEEP_MARTIAL = 0.2;
const SIEGE_MARTIAL = 0.3;

const IDENTITY: RulerEconomyModifiers = { corruption: 0, court: 1, administration: 1, upkeep: 1, siege: 1 };

/** A figure's leaning as effects on its polity's economy */
export function rulerEconomyModifiers(bias: FigureBias): RulerEconomyModifiers {
  return {
    corruption: Math.round((CIVIC_CORRUPTION * bias.civic + CRUEL_CORRUPTION * bias.cruel) * 10) / 10,
    court: Math.round((1 + COURT_PIOUS * bias.pious) * 100) / 100,
    administration: Math.round((1 + ADMINISTRATION_CIVIC * bias.civic) * 100) / 100,
    upkeep: Math.round((1 + UPKEEP_MARTIAL * bias.martial) * 100) / 100,
    siege: Math.round((1 + SIEGE_MARTIAL * bias.martial) * 100) / 100
  };
}

function activeFigures(): HistoricalFigure[] {
  return (pack.history?.figures ?? []).filter(figure => !figure.removed && figure.death === undefined);
}

/** The state's magistrate, its councilor for graft and public works, if it keeps one */
function magistrateOf(stateId: number, figures: HistoricalFigure[]): HistoricalFigure | undefined {
  return figures.find(figure =>
    figure.roles?.some(
      role =>
        role.to === undefined &&
        role.type === "specialist" &&
        role.specialty === "magistrate" &&
        role.target.kind === "state" &&
        role.target.id === stateId
    )
  );
}

/** The ruler's traits plus half their magistrate's, or null without a ruler */
function stateBias(stateId: number): FigureBias | null {
  const sSim = pack.history?.living?.states?.[stateId];
  if (!sSim) return null;
  const figures = activeFigures();
  const ruler = figures.find(figure => figure.i === sSim.rulerId);
  if (!ruler) return null;

  const values = pack.cultures?.[pack.states?.[stateId]?.culture ?? 0]?.values;
  const bias = figureBias(ruler, values);
  const magistrate = magistrateOf(stateId, figures);
  if (!magistrate) return bias;

  const council = figureBias(magistrate, values);
  for (const key of ["martial", "civic", "pious", "cruel"] as const) {
    bias[key] = Math.min(0.8, Math.round((bias[key] + council[key] / 2) * 100) / 100);
  }
  return bias;
}

/** How a state's court sways the upstream economy; identity without a Living World ruler */
export function stateEconomyModifiers(stateId: number): RulerEconomyModifiers {
  const bias = stateBias(stateId);
  return bias ? rulerEconomyModifiers(bias) : IDENTITY;
}

/** The state's official corruption budget as its ruler leaves it */
export function stateCorruption(state: State): number {
  const { corruption } = stateEconomyModifiers(state.i);
  return minmax((state.economy?.budget?.corruption ?? 0) + corruption, 0, 100);
}

/** A ruler's audit: officials' rate cut, the graft they held recovered as a day's money */
export const AUDIT_CORRUPTION_CUT = 4;

/** How much graft an audit recovers of what officials pocketed in a day */
export function auditRecovery(pocketed: number, bias: FigureBias | null): number {
  if (!pocketed) return 0;
  const zeal = 1 + Math.min(0.5, (bias?.civic ?? 0.1) * 0.5);
  return Math.round(pocketed * zeal * 100) / 100;
}

/** A state's ruler bias for callers outside the Living generator */
export function rulerBias(stateId: number): FigureBias | null {
  return stateBias(stateId);
}
