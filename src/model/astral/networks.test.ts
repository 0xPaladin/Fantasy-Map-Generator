import { beforeEach, describe, expect, test } from "vitest";
import { Options } from "@/model/options/options-model";
import { mapSchema } from "@/model/options/options-schema";
import { Networks } from "./networks";

const CELLS = 10;
const STEP = 10;

function makeMap(): void {
  const cells = {
    i: [] as number[],
    h: [] as number[],
    culture: [] as number[],
    state: [] as number[],
    p: [] as [number, number][],
    f: [] as number[],
    routes: {} as Record<number, Record<number, number>>
  };

  let cell = 0;
  for (let row = 0; row < CELLS; row++) {
    for (let column = 0; column < CELLS; column++) {
      cells.i.push(cell);
      cells.h.push(cell % 17 === 0 ? 0 : 30); // a few water cells
      cells.culture.push(cell % 2);
      cells.state.push(cell % 3);
      cells.p.push([column * STEP, row * STEP]);
      cells.f.push(1);
      cell++;
    }
  }

  globalThis.pack = {
    cells,
    burgs: [
      { i: 0 },
      { i: 1, cell: 11, x: 10, y: 10 },
      { i: 2, cell: 44, x: 40, y: 40 },
      { i: 3, cell: 77, x: 70, y: 70 }
    ],
    routes: []
  } as never;
}

beforeEach(() => {
  globalThis.options = {
    map: {
      graph: { width: CELLS * STEP, height: CELLS * STEP },
      geography: { coordinates: { lonT: 320 } },
      networks: []
    }
  } as never;
  globalThis.grid = { spacing: STEP } as never;
  globalThis.styles = {
    routes: { groups: { roads: { attrs: { stroke: "#000" }, options: { width: 1 } } } }
  } as never;
  makeMap();
});

describe("Networks.create", () => {
  test("places land nodes only, deterministically for the same seed", () => {
    const first = Networks.create({
      name: "The Veil Run",
      kind: "wormhole",
      scope: { kind: "land" },
      target: 12,
      connect: false,
      seed: "seed-1"
    });
    const second = Networks.create({
      name: "Second",
      kind: "relay",
      scope: { kind: "land" },
      target: 12,
      connect: false,
      seed: "seed-1"
    });

    expect(first.nodes.length).toBeGreaterThan(1);
    expect(first.nodes.every(node => pack.cells.h[node.cell] >= 20)).toBe(true);
    expect(second.nodes).toEqual(first.nodes);
    expect(first.nodes.map(node => node.cell)).toEqual([...first.nodes.map(node => node.cell)].sort((a, b) => a - b));
  });

  test("places burgs-only nodes on systems", () => {
    const network = Networks.create({
      name: "Courier Chain",
      kind: "relay",
      scope: { kind: "burgs" },
      target: 3,
      connect: false,
      seed: "seed-2"
    });

    expect(network.nodes.length).toBeGreaterThan(0);
    for (const node of network.nodes) {
      const burg = pack.burgs[node.burg!];
      expect(burg.cell).toBe(node.cell);
      expect([burg.x, burg.y]).toEqual([node.x, node.y]);
    }
  });

  test("creates locked routes in the Routes store and links their cells", () => {
    const network = Networks.create({
      name: "The Bright Lanes",
      kind: "hyperlane",
      scope: { kind: "any" },
      target: 9,
      connect: true,
      seed: "seed-3"
    });

    const routes = Networks.routesOf(network.i);
    expect(routes.length).toBeGreaterThan(1);
    for (const route of routes) {
      expect(route.group).toBe("networks");
      expect(route.networkId).toBe(network.i);
      expect(route.name).toBe(network.name);
      expect(route.lock).toBe(true);
      expect(route.points).toHaveLength(2);
      expect(pack.cells.routes[route.points[0][2]]?.[route.points[1][2]]).toBe(route.i);
    }
    expect(styles.routes.groups.networks).toBeDefined();
  });

  test("never joins the economy when trade is off, and keeps its friction", () => {
    const network = Networks.create({
      name: "The Quiet Line",
      kind: "relay",
      scope: { kind: "land" },
      target: 6,
      connect: true,
      trade: { enabled: false, friction: 0.25 },
      seed: "seed-4"
    });

    expect(network.trade).toEqual({ enabled: false, friction: 0.25 });
  });
});

describe("Networks.update", () => {
  test("turning links off removes the routes, and on creates them again", () => {
    const network = Networks.create({
      name: "Test",
      kind: "wormhole",
      scope: { kind: "land" },
      target: 8,
      connect: true,
      seed: "seed-5"
    });
    expect(Networks.routesOf(network.i).length).toBeGreaterThan(0);

    Networks.update(network.i, { connect: false });
    expect(Networks.routesOf(network.i)).toHaveLength(0);
    expect(pack.cells.routes).toEqual({});

    Networks.update(network.i, { connect: true });
    expect(Networks.routesOf(network.i).length).toBeGreaterThan(0);
  });

  test("changing placement resamples without touching other networks", () => {
    const first = Networks.create({
      name: "First",
      kind: "relay",
      scope: { kind: "land" },
      target: 6,
      connect: false,
      seed: "seed-6"
    });
    const second = Networks.create({
      name: "Second",
      kind: "relay",
      scope: { kind: "land" },
      target: 6,
      connect: false,
      seed: "seed-7"
    });
    const secondNodes = structuredClone(second.nodes);

    Networks.update(first.i, { scope: { kind: "culture", culture: 1 }, target: 4 });

    expect(first.nodes.every(node => pack.cells.culture[node.cell] === 1)).toBe(true);
    expect(second.nodes).toEqual(secondNodes);
  });

  test("renaming the network renames its links", () => {
    const network = Networks.create({
      name: "Old name",
      kind: "relay",
      scope: { kind: "land" },
      target: 6,
      connect: true,
      seed: "seed-12"
    });

    Networks.update(network.i, { name: "New name" });

    expect(Networks.routesOf(network.i).every(route => route.name === "New name")).toBe(true);
  });

  test("a placement with no candidates throws and leaves the network alone", () => {
    const network = Networks.create({
      name: "Kept",
      kind: "relay",
      scope: { kind: "land" },
      target: 6,
      connect: false,
      seed: "seed-8"
    });
    const nodes = structuredClone(network.nodes);

    expect(() => Networks.update(network.i, { scope: { kind: "culture", culture: 99 } })).toThrow(
      "No cells match this placement"
    );
    expect(network.nodes).toEqual(nodes);
    expect(network.scope).toEqual({ kind: "land" });
  });

  test("regenerate replaces the nodes and the routes", () => {
    const network = Networks.create({
      name: "Rotating",
      kind: "relay",
      scope: { kind: "land" },
      target: 8,
      connect: true,
      seed: "seed-9"
    });
    const oldNodes = structuredClone(network.nodes);

    Networks.regenerate(network.i, "seed-10");

    expect(network.nodes).not.toEqual(oldNodes);
    const newRoutes = Networks.routesOf(network.i);
    expect(newRoutes.length).toBeGreaterThan(0);
    expect(pack.routes).toHaveLength(newRoutes.length);
    expect(pack.routes.every(route => route.networkId === network.i)).toBe(true);
  });
});

describe("Networks.remove", () => {
  test("removes the network and its routes", () => {
    const network = Networks.create({
      name: "Gone",
      kind: "wormhole",
      scope: { kind: "land" },
      target: 8,
      connect: true,
      seed: "seed-11"
    });

    expect(Networks.remove(network.i)).toBe(true);
    expect(Networks.get(network.i)).toBeUndefined();
    expect(Networks.routesOf(network.i)).toHaveLength(0);
    expect(pack.routes).toHaveLength(0);
    expect(pack.cells.routes).toEqual({});
  });
});

describe("networks schema", () => {
  test("an old map without the key starts with no networks", () => {
    const map = { ...Options.getDefaultOptions().map } as Record<string, unknown>;
    delete map.networks;
    expect(mapSchema.parse(map).networks).toEqual([]);
  });

  test("one broken network is dropped without losing the rest", () => {
    const valid = {
      i: 1,
      name: "Good",
      kind: "relay",
      scope: { kind: "land" },
      seed: "x",
      target: 4,
      nodes: [{ cell: 0, x: 0, y: 0 }],
      connect: false,
      trade: { enabled: true, friction: 1 }
    };
    const parsed = mapSchema.parse({
      ...Options.getDefaultOptions().map,
      networks: [valid, { ...valid, i: 2, scope: { kind: "culture" } }]
    });

    expect(parsed.networks).toHaveLength(1);
    expect(parsed.networks[0].name).toBe("Good");
  });
});
