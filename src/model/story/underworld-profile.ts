// Shared context types for cave, burial and necropolis profiles
import type { BurialKind, NecropolisTier } from "@/data/burials";
import type { CaveExtent } from "@/data/caves";
import type { Alignment } from "@/data/culture-traits";

export type UnderworldKind = "cave" | "burial" | "necropolis";

export interface UnderworldContext {
  seed: string;
  cell: number;
  cultureName: string;
  alignment: Alignment;
  biomeName: string;
  height: number;
  population?: number;
  /** marker name override, so a user rename wins over the generated name */
  name?: string;
  originalName?: string;
  originalPolity?: string;
  fallYear?: number;
  cause?: string;
  looted?: boolean;
  clearedBy?: string;
  clearedFrom?: string;
}

export interface CaveContext extends UnderworldContext {
  formation?: string;
  status?: string;
  extent?: CaveExtent;
}

export interface BurialContext extends UnderworldContext {
  burialKind?: BurialKind;
  disturbance?: string;
}

export interface NecropolisContext extends UnderworldContext {
  burialType?: string;
  tier?: NecropolisTier;
}
