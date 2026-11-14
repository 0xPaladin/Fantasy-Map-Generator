// Astral networks: evenly placed nodes over a chosen part of the map, with optional direct routes
import Alea from "alea";
import {
  NETWORK_KINDS,
  NETWORK_SCOPE_KINDS,
  type Network,
  type NetworkKind,
  type NetworkNode,
  type NetworkScope,
  type NetworkTrade
} from "@/data/astral-networks";
import { graphWidth, isWrapEnabled, type Route, Routes } from "@/model/economy/routes-generator";
import { rn } from "@/utils/number-utils";
import { poissonDiscSelect } from "@/utils/poisson-disc";
import { generateSeed } from "@/utils/probability-utils";
import { requireName, requireOneOf } from "@/utils/validation-utils";

const AREA_PER_NODE = 0.7; // the share of the candidate area one Poisson node covers

export interface NetworkInput {
  name: string;
  kind: NetworkKind;
  scope: NetworkScope;
  target: number;
  connect?: boolean;
  trade?: Partial<NetworkTrade>;
  seed?: string;
}

export type NetworkPatch = Partial<Pick<Network, "name" | "kind" | "scope" | "target" | "connect" | "trade">> & {
  seed?: string;
};

const sameScope = (left: NetworkScope, right: NetworkScope): boolean => {
  if (left.kind !== right.kind) return false;
  if (left.kind === "culture") return left.culture === (right as typeof left).culture;
  if (left.kind === "state") return left.state === (right as typeof left).state;
  return true;
};

const targetOf = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("The node count must be a number");
  return Math.max(1, Math.round(value));
};

const tradeOf = (trade?: Partial<NetworkTrade>): NetworkTrade => {
  const enabled = trade?.enabled ?? true;
  const friction = trade?.friction ?? 1;
  if (!Number.isFinite(friction) || friction < 0) throw new Error("Trade friction must not be negative");
  return { enabled, friction };
};

class NetworksModule {
  getAll(): Network[] {
    return options.map.networks;
  }

  get(id: number): Network | undefined {
    return options.map.networks.find(network => network.i === id);
  }

  create(input: NetworkInput): Network {
    const network: Network = {
      i: this.nextId(),
      name: requireName(input.name),
      kind: requireOneOf(input.kind, NETWORK_KINDS, "The network kind"),
      scope: this.normalizeScope(input.scope),
      seed: input.seed || generateSeed(),
      target: targetOf(input.target),
      nodes: [],
      connect: input.connect ?? true,
      trade: tradeOf(input.trade)
    };

    network.nodes = this.sampleNodes(network);
    options.map.networks.push(network);
    if (network.connect) this.connect(network);
    return network;
  }

  update(id: number, patch: NetworkPatch): Network {
    const network = this.require(id);
    const scope = patch.scope === undefined ? network.scope : this.normalizeScope(patch.scope);
    const target = patch.target === undefined ? network.target : targetOf(patch.target);
    const seed = patch.seed ?? network.seed;
    const nodesChanged = target !== network.target || seed !== network.seed || !sameScope(scope, network.scope);

    // sample before touching the record, so a placement with no candidates changes nothing
    const nodes = nodesChanged ? this.sampleNodes({ ...network, scope, target, seed }) : network.nodes;

    if (patch.name !== undefined) network.name = requireName(patch.name);
    if (patch.kind !== undefined) network.kind = requireOneOf(patch.kind, NETWORK_KINDS, "The network kind");
    if (patch.trade !== undefined) network.trade = tradeOf(patch.trade);

    const connect = patch.connect ?? network.connect;
    if (nodesChanged) {
      this.disconnect(network);
      network.scope = scope;
      network.target = target;
      network.seed = seed;
      network.nodes = nodes;
      network.connect = connect;
      if (connect) this.connect(network);
      return network;
    }

    const wasConnected = network.connect;
    network.connect = connect;
    if (connect !== wasConnected) {
      if (connect) this.connect(network);
      else this.disconnect(network);
    }
    return network;
  }

  regenerate(id: number, seed = generateSeed()): Network {
    return this.update(id, { seed });
  }

  remove(id: number): boolean {
    const index = options.map.networks.findIndex(network => network.i === id);
    if (index === -1) return false;

    this.disconnect(options.map.networks[index]);
    options.map.networks.splice(index, 1);
    return true;
  }

  routesOf(id: number): Route[] {
    return (pack.routes ?? []).filter(route => route.networkId === id);
  }

  private require(id: number): Network {
    const network = this.get(id);
    if (!network) throw new Error(`Network ${id} does not exist`);
    return network;
  }

  private nextId(): number {
    return options.map.networks.reduce((max, network) => Math.max(max, network.i), 0) + 1;
  }

  private normalizeScope(scope: NetworkScope): NetworkScope {
    requireOneOf(scope?.kind, NETWORK_SCOPE_KINDS, "The placement");
    if (scope.kind === "culture" || scope.kind === "state") {
      const id = scope.kind === "culture" ? scope.culture : scope.state;
      if (!Number.isInteger(id) || id < 0) throw new Error("The culture or state is invalid");
    }
    return structuredClone(scope);
  }

  private sampleNodes(network: Network): NetworkNode[] {
    const candidates = this.candidates(network.scope);
    if (!candidates.length) throw new Error("No cells match this placement");

    const spacing = grid?.spacing || 10;
    const mapArea = options.map.graph.width * options.map.graph.height;
    const candidateArea = network.scope.kind === "burgs" ? mapArea : candidates.length * spacing * spacing;
    const radius = Math.max(Math.sqrt((AREA_PER_NODE * candidateArea) / network.target), spacing * 0.75);

    const nodes = poissonDiscSelect(candidates, {
      radius,
      random: Alea(network.seed),
      wrapWidth: isWrapEnabled() ? graphWidth() : undefined
    });

    return nodes.sort((left, right) => left.cell - right.cell || (left.burg ?? 0) - (right.burg ?? 0));
  }

  private candidates(scope: NetworkScope): NetworkNode[] {
    if (scope.kind === "burgs") {
      return (pack.burgs ?? [])
        .filter(burg => burg?.i && !burg.removed)
        .map(burg => ({ cell: burg.cell, x: rn(burg.x, 2), y: rn(burg.y, 2), burg: burg.i }));
    }

    const { cells } = pack;
    const nodes: NetworkNode[] = [];
    for (const cell of cells.i) {
      if (scope.kind === "land" && cells.h[cell] < 20) continue;
      if (scope.kind === "culture" && cells.culture[cell] !== scope.culture) continue;
      if (scope.kind === "state" && cells.state[cell] !== scope.state) continue;
      const [x, y] = cells.p[cell];
      nodes.push({ cell, x: rn(x, 2), y: rn(y, 2) });
    }
    return nodes;
  }

  private connect(network: Network): void {
    const points = network.nodes.map(node => [node.x, node.y] as [number, number]);
    if (points.length < 2) return;

    const group = this.ensureRouteGroup();
    const edges = Routes.calculateUrquhartEdges(points, isWrapEnabled(), graphWidth());
    for (const [from, to] of edges) {
      const routeId = Routes.create([points[from], points[to]], group);
      const route = pack.routes.find(candidate => candidate.i === routeId);
      if (!route) continue;
      route.networkId = network.i;
      route.name = network.name;
      route.lock = true;
      route.tags = [];
    }
  }

  private disconnect(network: Network): void {
    const ids = this.routesOf(network.i).map(route => route.i);
    if (ids.length) Routes.remove(...ids);
  }

  /** `Routes.create` validates its group against the styles, so a stock group has to exist first */
  private ensureRouteGroup(): string {
    const groups = styles.routes.groups;
    if (groups.networks) return "networks";

    const template = groups.airroutes ?? groups.roads ?? Object.values(groups)[0];
    if (!template) throw new Error("No route group to base the networks group on");
    groups.networks = structuredClone(template);
    return "networks";
  }
}

export const Networks = new NetworksModule();
