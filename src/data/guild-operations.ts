// Guild Operations: paid, hero-led interventions. See docs/plans/hero-diversity.md.
import type { HeroArchetypeId, HeroPool, MissionTag } from "@/types/living";

export type GuildOperationKind =
  | "pacify_mediate"
  | "rush_charter"
  | "incite_uprising"
  | "assassinate_ruler"
  | "war_broker";

export interface GuildOperationDef {
  id: GuildOperationKind;
  name: string;
  cost: number;
  archetypes: readonly HeroArchetypeId[];
  check?: {
    pool: HeroPool | "best_sc";
    dc: number;
    tags: readonly MissionTag[];
  };
  description: string;
}

export const GUILD_OPERATIONS: Record<GuildOperationKind, GuildOperationDef> = {
  pacify_mediate: {
    id: "pacify_mediate",
    name: "Pacify & Mediate",
    cost: 40,
    archetypes: ["priest", "envoy"],
    description: "Clear burg unrest and raise province order."
  },
  rush_charter: {
    id: "rush_charter",
    name: "Rush Asset Charter",
    cost: 50,
    archetypes: ["factor", "scholar"],
    description: "Complete the burg's current construction at once."
  },
  incite_uprising: {
    id: "incite_uprising",
    name: "Incite Uprising",
    cost: 75,
    archetypes: ["shadow"],
    description: "Spark a rebellion, or turn a state-capable trouble into a coup."
  },
  assassinate_ruler: {
    id: "assassinate_ruler",
    name: "Assassinate Ruler",
    cost: 100,
    archetypes: ["shadow"],
    check: { pool: "c", dc: 15, tags: ["intrigue"] },
    description: "A cunning check to slay the ruler and force a succession."
  },
  war_broker: {
    id: "war_broker",
    name: "War Broker",
    cost: 80,
    archetypes: ["envoy"],
    check: { pool: "best_sc", dc: 15, tags: ["social", "intrigue"] },
    description: "Broker a truce, or provoke a border war."
  }
};

export const GUILD_OPERATION_LABELS: Record<GuildOperationKind, string> = {
  pacify_mediate: "Pacify & Mediate",
  rush_charter: "Rush Asset Charter",
  incite_uprising: "Incite Uprising",
  assassinate_ruler: "Assassinate Ruler",
  war_broker: "War Broker"
};
