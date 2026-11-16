// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";
import type { Network } from "@/data/astral-networks";
import type { Route } from "@/model/economy/routes-generator";
import { Routes } from "@/model/economy/routes-generator";
import { setViewportSize, setViewportTransform } from "@/renderers/viewport/viewport";
import { ViewportLayers } from "@/renderers/viewport/viewport-renderer";
import { drawNetworks, removeNetworks } from "./draw-networks";

const mocks = vi.hoisted(() => ({ layerOn: true }));
vi.mock("@/renderers/layers", () => ({ Layers: { isOn: () => mocks.layerOn } }));
vi.mock("@/model/icons", () => ({
  Icons: { reference: (value: string) => value, href: () => "#glyph" }
}));

const network: Network = {
  i: 1,
  name: "The Veil Run",
  kind: "portal",
  scope: { kind: "land" },
  seed: "seed",
  target: 2,
  connect: true,
  trade: { enabled: true, friction: 1 },
  nodes: [
    { cell: 1, x: 10, y: 10 },
    { cell: 2, x: 90, y: 90 }
  ]
};

const route: Route = {
  i: 10,
  name: network.name,
  group: "networks",
  feature: 1,
  networkId: network.i,
  points: [
    [10, 10, 1],
    [90, 90, 2]
  ]
};

const style = {
  attrs: { opacity: 1, fill: "#c084fc", stroke: "#7c3aed", "stroke-width": 0.15 },
  options: { size: 1.2, linkColor: "#a855f7", linkWidth: 0.45, linkOpacity: 0.9, linkDash: "6 4" }
};

beforeEach(() => {
  mocks.layerOn = true;
  document.body.innerHTML = '<svg id="map"><g id="networks"></g></svg>';
  globalThis.options = { map: { graph: { width: 100, height: 100 }, networks: [network] } } as never;
  globalThis.pack = { routes: [route] } as never;
  globalThis.styles = { networks: { groups: { portal: style } } } as never;
  Object.assign(Routes, { getPath: () => "M10,10L90,90" });
  network.nodes = [
    { cell: 1, x: 10, y: 10 },
    { cell: 2, x: 90, y: 90 }
  ];
  setViewportSize(100, 100);
  setViewportTransform(1, 0, 0);
});

test("draws each network's links and nodes under one styled group", () => {
  drawNetworks();

  const group = document.querySelector("#network1");
  expect(group).not.toBeNull();
  expect(group?.querySelector(".links #route10")?.getAttribute("d")).toBe("M10,10L90,90");
  expect(group?.querySelector(".links #route10")?.getAttribute("stroke")).toBe("#a855f7");
  expect(group?.querySelector(".links #route10")?.getAttribute("stroke-dasharray")).toBe("6 4");
  expect(group?.querySelector("#networkNode1-0 use")?.getAttribute("href")).toBe("#glyph");
  expect(group?.querySelector("[data-group='portal']")).not.toBeNull();
});

test("culls nodes outside the viewport", () => {
  network.nodes.push({ cell: 3, x: 4000, y: 4000 });
  drawNetworks();

  expect(document.querySelector("#networkNode1-2")).toBeNull();
  ViewportLayers.renderNow();
  expect(document.querySelector("#networkNode1-2")).toBeNull();
});

test("erasing the layer drops the rendered networks", () => {
  drawNetworks();
  expect(document.querySelectorAll("#networks > g")).toHaveLength(1);

  removeNetworks();
  expect(document.querySelectorAll("#networks > g")).toHaveLength(0);
});

test("a disabled layer renders nothing new", () => {
  mocks.layerOn = false;
  drawNetworks();
  expect(document.querySelectorAll("#networks > g")).toHaveLength(0);
});
