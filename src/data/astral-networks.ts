// Astral networks: the kinds, the placement rules, and the record stored with the map settings
import { t } from "@/utils/i18n";

export const NETWORK_KINDS = ["wormhole", "hyperlane", "relay"] as const;
export type NetworkKind = (typeof NETWORK_KINDS)[number];

export interface NetworkKindDefinition {
  id: NetworkKind;
  label: string;
  /** the emoji drawn on the chart; `Icons.reference` turns it into a glyph */
  icon: string;
  tip: string;
}

export const NETWORK_KIND_DEFINITIONS: Record<NetworkKind, NetworkKindDefinition> = {
  wormhole: {
    id: "wormhole",
    label: t("Wormhole"),
    icon: "🌀",
    tip: t("A stable passage between two distant systems")
  },
  hyperlane: {
    id: "hyperlane",
    label: t("Hyperspace lane"),
    icon: "🛸",
    tip: t("A fast route across the sector")
  },
  relay: {
    id: "relay",
    label: t("Communication relay"),
    icon: "📡",
    tip: t("A chain of stations carrying signals between systems")
  }
};

export const NETWORK_SCOPE_KINDS = ["any", "land", "burgs", "culture", "state"] as const;
export type NetworkScopeKind = (typeof NETWORK_SCOPE_KINDS)[number];

export const NETWORK_SCOPE_LABELS: Record<NetworkScopeKind, string> = {
  any: t("Anywhere"),
  land: t("Land"),
  burgs: t("Star systems"),
  culture: t("Culture"),
  state: t("State")
};

export type NetworkScope =
  | { kind: "any" }
  | { kind: "land" }
  | { kind: "burgs" }
  | { kind: "culture"; culture: number }
  | { kind: "state"; state: number };

export interface NetworkNode {
  cell: number;
  x: number;
  y: number;
  /** the burg the node sits on, for burgs-only networks */
  burg?: number;
}

export interface NetworkTrade {
  /** whether the links join the economy */
  enabled: boolean;
  /** a multiplier on each link's travel cost: below 1 is faster than a normal route */
  friction: number;
}

export interface Network {
  i: number;
  name: string;
  kind: NetworkKind;
  scope: NetworkScope;
  seed: string;
  /** requested node count; the actual count is nodes.length */
  target: number;
  nodes: NetworkNode[];
  /** whether the network created direct routes */
  connect: boolean;
  trade: NetworkTrade;
}
