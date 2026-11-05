import type { Alignment } from "@/data/culture-traits";
import type { Regiment } from "@/model/political/military-generator";
import type { Emblem } from "@/types/emblems";
import type {
  ActiveGuildMission,
  BurgSimState,
  HappinessBreakdown,
  HistoricalRelic,
  YieldValues
} from "@/types/living";
import type { PackedGraph } from "@/types/packed-graph";

export type FactionScale = "burg" | "province" | "state" | "world";

export type FactionCategory = "commercial" | "adventuring" | "underworld" | "religious" | "political" | "martial";

export type FactionAllegiance = "state_arm" | "chartered" | "autonomous" | "clandestine" | "hostile";

export type FactionExpansionScope = "local" | "province" | "state" | "culture" | "religion" | "global";

export type FactionRelation = "Ally" | "Friendly" | "Neutral" | "Suspicion" | "Rival" | "Enemy";

export type FactionAgendaKind =
  | "establish_outpost"
  | "upgrade_outpost"
  | "build_asset"
  | "research_tech"
  | "muster_forces"
  | "raid_burg"
  | "subvert_burg"
  | "clear_hazard"
  | "strike_rival"
  | "excavate_site"
  | "stage_coup";

export interface FactionAgenda {
  kind: FactionAgendaKind;
  label: string;
  targetBurgId?: number;
  targetProvinceId?: number;
  targetCell?: number;
  targetFactionId?: number;
  targetStateId?: number;
  assetId?: string;
  techId?: string;
  progress: number;
  required: number;
}

export interface FactionHq {
  cell: number;
  burgId?: number;
  markerId?: number;
  provinceId?: number;
  maritime?: boolean;
  fortified: boolean;
  secrecy: number; // 0..100
  assets: string[];
  sim?: BurgSimState;
}

export interface FactionOutpost {
  burgId: number;
  cell: number;
  tier: 1 | 2 | 3;
  influence: number; // 0..100
  secrecy: number; // 0..100
  assets: string[];
  establishedYear: number;
  pillaged?: boolean;
  sim?: BurgSimState;
}

export interface Faction {
  i: number;
  name: string;
  category: FactionCategory;
  type: string;
  readonly scale: FactionScale;
  allegiance: FactionAllegiance;
  patronStateId?: number;

  // Identity & Visuals
  color: string;
  coa?: Emblem;
  icon: string;
  culture: number;
  religion?: number;
  foundedYear: number;
  leaderId?: number;
  memberIds: number[];
  candidateIds?: number[];

  // Culture-like Ethos & Growth
  alignment: Alignment;
  values: string[];
  expansionism: number; // 0.2 .. 2.0
  expansionScope: FactionExpansionScope;
  sovereignAmbition: boolean;
  stateForm?: string;
  stateRosterId?: string;

  // HQ & Outposts
  hq: FactionHq;
  outposts: FactionOutpost[];

  // Advancement & OpenCiv Tech Tree
  tier: number; // 1..5
  science: number;
  currentTechId?: string | null;
  researchQueue: string[];
  researchedTechs: string[];
  researchedProgress: Record<string, number>;
  freeTechs?: number;
  yieldsPerTurn?: YieldValues;
  happiness?: number;
  happinessBreakdown?: HappinessBreakdown;

  // Economy, Diplomacy & Military
  treasury: number;
  influence: number;
  rosterId?: string;
  military: Regiment[];
  raidThreshold?: number;
  raidPending?: boolean;
  stateRelations: Record<number, FactionRelation>;
  factionRelations: Record<number, FactionRelation>;

  // Operations & Missions
  doctrine?: "auto_expand" | "auto_bounties" | "auto_lairs" | "auto_excavate" | "auto_subvert" | "manual";
  agenda: FactionAgenda | null;
  missions?: ActiveGuildMission[];
  relics?: HistoricalRelic[];
  seasonsActive: number;

  // Map entity metadata
  tags?: string[];
  lock?: boolean;
  removed?: boolean;
  note?: string;
}

export type FactionAssetLocation = "any" | "burg" | "wilderness" | "hq_only";

export interface FactionAssetDef {
  id: string;
  name: string;
  track: FactionCategory | "wilder" | "scholarly";
  tier: 1 | 2 | 3;
  cost: number;
  requiredTech?: string;
  location: FactionAssetLocation;
  description: string;
  yields: {
    gold?: number;
    science?: number;
    influence?: number;
    militaryCap?: number;
    secrecy?: number;
  };
  burgImpact?: {
    gold?: number;
    science?: number;
    prod?: number;
    order?: number;
    unrest?: number;
  };
}

export interface FactionArchetypeDef {
  type: string;
  name: string;
  category: FactionCategory;
  defaultAllegiance: FactionAllegiance;
  defaultExpansionScope: FactionExpansionScope;
  defaultAlignment: Alignment;
  sovereignAmbition: boolean;
  stateForm?: string;
  stateRosterId?: string;
  raidThreshold?: number;
  markerIcon: string;
  description: string;
  desiredAssets: readonly string[];
  desiredTechs: readonly string[];
  defaultValues: readonly string[];
}

/** Computes dynamic scale from outpost footprint, asset milestones, and tech advancement */
export function computeFactionScale(
  faction: {
    hq?: FactionHq;
    outposts?: FactionOutpost[];
    researchedTechs?: string[];
  },
  graph?: Pick<PackedGraph, "burgs" | "provinces">,
  assetLookup?: (assetId: string) => { tier: number } | undefined
): FactionScale {
  const outposts = faction.outposts ?? [];
  const techs = faction.researchedTechs ?? [];
  const totalOutposts = outposts.length;

  const hqAssets = Array.from(new Set([...(faction.hq?.assets ?? []), ...(faction.hq?.sim?.civBuildings ?? [])]));
  const outpostAssets = outposts.flatMap(o =>
    Array.from(new Set([...(o.assets ?? []), ...(o.sim?.civBuildings ?? [])]))
  );
  const allAssetIds = [...hqAssets, ...outpostAssets];
  const totalAssets = allAssetIds.length;

  let hasT2 = false;
  let hasT3 = false;
  if (assetLookup) {
    for (const id of allAssetIds) {
      const def = assetLookup(id);
      if (def?.tier === 2) hasT2 = true;
      if (def?.tier === 3) {
        hasT2 = true;
        hasT3 = true;
      }
    }
  } else {
    hasT2 = totalAssets >= 5;
    hasT3 = totalAssets >= 10;
  }

  const stateIds = new Set<number>();
  const provinceIds = new Set<number>();

  if (faction.hq?.provinceId) provinceIds.add(faction.hq.provinceId);
  if (faction.hq?.burgId && graph?.burgs?.[faction.hq.burgId]?.state) {
    stateIds.add(graph.burgs[faction.hq.burgId].state!);
  }

  if (graph?.burgs) {
    for (const outpost of outposts) {
      const b = graph.burgs[outpost.burgId];
      if (b?.state) stateIds.add(b.state);
      if (b?.cell && graph.provinces && graph.burgs[outpost.burgId]) {
        // Track provinces if known
      }
    }
  }

  if (stateIds.size >= 2 && totalOutposts >= 7 && totalAssets >= 10 && hasT3 && techs.length >= 10) {
    return "world";
  }

  if ((provinceIds.size >= 2 || totalOutposts >= 3) && totalAssets >= 5 && hasT2 && techs.length >= 5) {
    return "state";
  }

  if (totalOutposts >= 2 && totalAssets >= 2 && techs.length >= 2) {
    return "province";
  }

  return "burg";
}
