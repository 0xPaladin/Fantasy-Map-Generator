// Shared context and core types for beast, monster and bandit profiles
import type { CreatureQuantity, CreatureSize } from "@/data/creatures";
import type { Alignment } from "@/data/culture-traits";

export type CreatureKind = "beast" | "monster" | "bandit";

export interface CreatureContext {
  seed: string;
  cell: number;
  cultureName: string;
  alignment: Alignment;
  biomeName: string;
  height: number;
  population?: number;
  /** marker name override, so a user rename wins over the generated name */
  name?: string;
  species?: string;
  habitat?: string;
  length?: number;
  nature?: string;
  habit?: string;
  gang?: string;
  locality?: string;
  leader?: string;
  maritime?: boolean;
  clearedBy?: string;
  clearedFrom?: string;
}

export interface BeastContext extends CreatureContext {
  habitat?: string;
  length?: number;
}

export interface MonsterContext extends CreatureContext {
  species?: string;
  nature?: string;
  habit?: string;
}

export interface BanditContext extends CreatureContext {
  gang?: string;
  locality?: string;
  leader?: string;
  maritime?: boolean;
}

/** The shared creature identity consumed by the three kind generators */
export interface CreatureCore {
  size: CreatureSize;
  quantity: CreatureQuantity;
  count: string;
  natureId: string;
  nature: string;
  alignment: Alignment;
  tags: string[];
  attacks: string[];
  defense: string;
  want: string;
  moves: string[];
}
