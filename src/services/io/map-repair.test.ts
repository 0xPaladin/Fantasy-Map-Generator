// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import "@/model/story/journeys/transports-generator";
import { Transports } from "@/model/story/journeys/transports-generator";
import { MapRepair } from "./map-repair";

afterEach(() => vi.unstubAllGlobals());

it("unassigns each invalid cell owner from its own array only", () => {
  globalThis.pack = {
    cells: {
      i: [0, 1, 2],
      state: [0, 1, 9],
      province: [0, 2, 0],
      culture: [0, 5, 1],
      religion: [0, 0, 7],
      burg: [0, 0, 0],
      r: [0, 3, 0],
      f: [1, 1, 1],
      routes: {}
    },
    vertices: { p: [] },
    features: [0, { i: 1 }],
    states: [{ i: 0 }, { i: 1 }],
    provinces: [0],
    cultures: [{ i: 0 }, { i: 1 }],
    religions: [{ i: 0 }],
    burgs: [{ i: 0 }],
    rivers: [],
    routes: [],
    markers: [],
    journeys: []
  } as unknown as typeof pack;

  const repairs = MapRepair.repair();

  const { state, province, culture, religion, r } = pack.cells;
  expect([state, province, culture, religion, r]).toEqual([
    [0, 1, 0],
    [0, 0, 0],
    [0, 0, 1],
    [0, 0, 0],
    [0, 0, 0]
  ]);
  expect(repairs).toHaveLength(5);
});

it("removes rivers with less than 2 cells and frees their cells and lakes", () => {
  globalThis.pack = {
    cells: {
      i: [0, 1, 2],
      state: [0, 0, 0],
      province: [],
      culture: [],
      religion: [],
      burg: [],
      r: [1, 2, 2],
      f: [1, 1, 1],
      routes: {}
    },
    vertices: { p: [] },
    features: [0, { i: 1, type: "lake", height: 20, inlets: [1, 2] }],
    states: [{ i: 0 }],
    provinces: [0],
    cultures: [{ i: 0 }],
    religions: [{ i: 0 }],
    burgs: [{ i: 0 }],
    rivers: [
      { i: 1, cells: [0] },
      { i: 2, cells: [1, 2] }
    ],
    routes: [],
    markers: [],
    journeys: []
  } as unknown as typeof pack;

  const repairs = MapRepair.repair();

  expect(pack.rivers.map(river => river.i)).toEqual([2]);
  expect(pack.cells.r).toEqual([0, 2, 2]);
  expect(pack.features[1].inlets).toEqual([2]);
  expect(repairs).toHaveLength(2);
});

it("drops invalid network nodes and detaches links whose network is gone", () => {
  const network = {
    i: 1,
    name: "Test",
    kind: "portal",
    scope: { kind: "land" },
    seed: "x",
    target: 3,
    connect: true,
    trade: { enabled: true, friction: 1 },
    nodes: [
      { cell: 0, x: 0, y: 0 },
      { cell: 9, x: 90, y: 90 },
      { cell: 1, x: 10, y: 10, burg: 9 }
    ]
  };
  vi.stubGlobal("options", { map: { networks: [network], transports: Transports.getDefaults() } });
  globalThis.pack = {
    cells: {
      i: [0, 1],
      state: [0, 0],
      province: [0, 0],
      culture: [0, 0],
      religion: [0, 0],
      burg: [0, 0],
      r: [0, 0],
      f: [1, 1],
      routes: {}
    },
    vertices: { p: [] },
    features: [0],
    states: [{ i: 0 }],
    provinces: [0],
    cultures: [{ i: 0 }],
    religions: [{ i: 0 }],
    burgs: [{ i: 0 }],
    rivers: [],
    routes: [
      {
        i: 1,
        points: [
          [0, 0, 0],
          [1, 1, 1]
        ],
        networkId: 1
      },
      {
        i: 2,
        points: [
          [0, 0, 0],
          [1, 1, 1]
        ],
        networkId: 7
      }
    ],
    markers: [],
    journeys: []
  } as unknown as typeof pack;

  const repairs = MapRepair.repair();

  expect(network.nodes).toEqual([{ cell: 0, x: 0, y: 0 }]);
  expect(pack.routes[0].networkId).toBe(1);
  expect(pack.routes[1].networkId).toBeUndefined();
  expect(repairs.some(repair => repair.includes("node on cell 9"))).toBe(true);
  expect(repairs.some(repair => repair.includes("missing network 7"))).toBe(true);
});
