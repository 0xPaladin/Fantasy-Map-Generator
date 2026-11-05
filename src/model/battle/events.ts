// Battle reporting types. `battle.ts` returns these and the Living World
// reads them.

export type CapturePolicy = "occupy" | "sack" | "loot" | "raze";

export interface BattleSideReport {
  factionId: number;
  armyId: string | null;
  initialMen: number;
  initialPower: number;
  losses: number;
  survivors: number;
  routed: boolean;
}

export interface BattleSummary {
  cell: number;
  regionId: number;
  attacker: BattleSideReport;
  defender: BattleSideReport;
  winner: "attacker" | "defender";
  rounds: number;
  /** Modifiers that were applied, for the battle card. */
  modifiers: string[];
  /** True when the battle was an assault on a settlement's garrison. */
  assault: boolean;
  /** Settlement involved in the assault or defense, if any. */
  settlementId?: number;
  regionCaptured: boolean;
  /** Capture policy applied on success. */
  policy?: CapturePolicy;
}