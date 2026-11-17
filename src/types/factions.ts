import type { Alignment } from "@/data/culture-traits";
import type { Regiment } from "@/model/political/military-generator";
import type { Emblem } from "@/types/emblems";
import type { BurgSimState } from "@/types/living";

export type FactionCategory = "commercial" | "adventuring" | "underworld" | "religious" | "political" | "martial";

export type FactionAllegiance = "state_arm" | "chartered" | "autonomous" | "clandestine" | "hostile";

export type FactionExpansionScope = "local" | "province" | "state" | "culture" | "religion" | "global";

export type FactionRelation = "Ally" | "Friendly" | "Neutral" | "Suspicion" | "Rival" | "Enemy";

export type FactionAgendaKind = "expand_network" | "build_work" | "subvert" | "crusade_or_raid" | "ascend";

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
  pillaged?: boolean;
  influence?: number; // 0..100, urban HQ suppression health (defaults to 70)
  secrecy: number; // 0..100
  assets: string[];
  sim?: BurgSimState;
}

export type FactionNodeKey = "hq" | `outpost:${number}`;

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

export interface FactionProject {
  assetId: string;
  nodeKey: FactionNodeKey;
  turnsLeft: number;
  totalCost?: number;
  remainingCost?: number;
}

export interface FactionQueuedProject {
  assetId: string;
  nodeKey: FactionNodeKey;
}

export interface Faction {
  i: number;
  name: string;
  category: FactionCategory;
  type: string;
  allegiance: FactionAllegiance;
  patronStateId?: number;
  /** Active asset build funded from daily infrastructure revenue */
  project?: FactionProject;
  /** Pending asset builds queued after the active work */
  projectQueue?: FactionQueuedProject[];
  /** User-configured daily revenue/cost adjustments */
  adjustments?: { name: string; value: number }[];

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

  // Economy, Diplomacy & Military
  treasury: number;
  influence: number;
  rosterId?: string;
  military: Regiment[];
  /** Threat level 1..10 for dangerous factions; drives mission DC and display. */
  threatLevel?: number;
  raidThreshold?: number;
  raidPending?: boolean;
  stateRelations: Record<number, FactionRelation>;
  factionRelations: Record<number, FactionRelation>;

  // Operations
  doctrine?: "auto_expand" | "auto_bounties" | "auto_lairs" | "auto_excavate" | "auto_subvert" | "manual";
  agenda: FactionAgenda | null;
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
    influence?: number;
    militaryCap?: number;
    secrecy?: number;
    development?: number;
  };
  burgImpact?: {
    gold?: number;
    stability?: number;
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

export type FactionExpenseBucket = "court" | "administration" | "infrastructure" | "military";

export interface FactionRevenueLine {
  key: string;
  label: string;
  /** Daily gold earned by this stream (before corruption and charter tithe) */
  daily: number;
}

export interface FactionExpenseLine {
  bucket: FactionExpenseBucket;
  label: string;
  /** Percentage share of collected daily revenue (0..100) */
  share: number;
  /** Daily gold spent in this bucket */
  daily: number;
}

export interface FactionEconomyBreakdown {
  /** Daily revenue lines across all active nodes, grouped by stream */
  revenueLines: FactionRevenueLine[];
  /** Total daily revenue collected across active nodes and adjustments */
  collectedDaily: number;
  /** Sum of user daily revenue adjustments */
  adjustmentsDaily: number;
  /** Daily revenue allocated to queued asset construction */
  projectDaily: number;
  /** Share of host burgs' product (%) */
  hostProductShare: number;
  /** Four state-style expense buckets */
  expenses: FactionExpenseLine[];
  /** Total percentage of collected revenue spent across the 4 buckets */
  spentShare: number;
  /** Corruption / skimming percentage (0..100) and daily gold lost */
  corruptionRate: number;
  corruptionDaily: number;
  /** Charter tithe paid to patron state (daily) */
  charterTitheDaily: number;
  /** Net daily balance: collectedDaily - expenses - corruptionDaily - charterTitheDaily */
  dayBalance: number;
  /** Net balance as % of collectedDaily */
  dayBalanceShare: number;
}

export interface FactionNodeYieldBreakdown {
  node: FactionHq | FactionOutpost;
  isHq: boolean;
  /** daily upstream income net of charter tithe */
  dailyIncome: number;
  /** upstream economy gold of the node's season, already net of the charter tithe */
  upstreamGold: number;
  /** what the node pays its patron state of its upstream gold */
  charterTithe: number;
}

export interface FactionYieldBreakdown {
  nodes: FactionNodeYieldBreakdown[];
  hq: FactionNodeYieldBreakdown | null;
  outposts: FactionNodeYieldBreakdown[];
  /** total daily income (upstream nodes + adjustments, net of charter tithe) */
  dailyIncome: number;
  /** upstream gold the empire's nodes earned this season, net of charters */
  upstreamGold: number;
  /** what the empire's charters pay its patron states this season, and which state they pay */
  charterTithe: number;
  charterPatronId: number;
  /** influence the court's spending lends its temples and its chancery */
  influence: number;
  /** daily state-style Revenue & Expenses breakdown */
  economy: FactionEconomyBreakdown;
}
