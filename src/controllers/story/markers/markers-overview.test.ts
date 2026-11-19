// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/renderers/layers", () => ({
  Layers: { show: vi.fn(), draw: vi.fn() }
}));
vi.mock("@/renderers/draw-markers", () => ({
  setMarkersFilter: vi.fn()
}));
vi.mock("@/services/io/csv", () => ({ Csv: { download: vi.fn() } }));
vi.mock("@/controllers", () => ({
  Controllers: {
    MarkerCreator: { toggle: vi.fn() },
    MarkersSettings: { open: vi.fn() },
    MarkersEditor: { open: vi.fn() }
  }
}));

import { Markers } from "@/model/story/markers-generator";
import { Csv } from "@/services/io/csv";
import { dialogState } from "@/ui/dialog/state";
import { MarkersOverview } from "./markers-overview";

const zoom = vi.hoisted(() => ({ zoomTo: vi.fn() }));
vi.mock("@/ui/map/zoom", async original => ({ ...(await original<object>()), zoomTo: zoom.zoomTo }));

describe("MarkersOverview", () => {
  beforeEach(() => {
    dialogState.remove("markersOverview", "filters");
    dialogState.remove("markersOverview", "sorting");
    document.body.innerHTML = '<div id="dialogs"></div>';
    options.app.mode = null;
    Object.assign(Markers, {
      getConfig: () => [{ type: "volcano", icon: "🌋" }],
      setPinned: vi.fn(),
      setLocked: vi.fn()
    });
    vi.stubGlobal("pack", {
      markers: [
        { i: 1, type: "volcano", icon: "🌋", name: "Mount Doom", cell: 10, x: 100, y: 200 },
        { i: 2, type: "inn", icon: "🍺", name: "The Prancing Pony", cell: 20, x: 300, y: 400 },
        { i: 3, type: "mines", icon: "⛏️", name: "Moria", cell: 30, x: 500, y: 600 }
      ],
      states: [],
      cultures: [],
      cells: {
        state: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        culture: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      }
    });
  });

  it("renders the name column and displays marker names in the table", () => {
    MarkersOverview.open();

    const header = document.getElementById("markersOverviewHeader");
    expect(header?.querySelector('[data-col="name"]')).not.toBeNull();
    expect(header?.querySelector('[data-col="type"]')).not.toBeNull();

    const rows = document.querySelectorAll("#markersBody .states");
    expect(rows).toHaveLength(3);

    const names = Array.from(rows).map(row => row.querySelector('[data-col="name"]')?.textContent);
    expect(names).toEqual(["Mount Doom", "The Prancing Pony", "Moria"]);
  });

  it("filters markers by name", () => {
    MarkersOverview.open();

    const searchInput = document.getElementById("markersSearch") as HTMLInputElement;
    searchInput.value = "prancing";
    searchInput.dispatchEvent(new Event("input"));

    const rows = document.querySelectorAll("#markersBody .states");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('[data-col="name"]')?.textContent).toBe("The Prancing Pony");
  });

  it("filters markers by type", () => {
    MarkersOverview.open();

    const searchInput = document.getElementById("markersSearch") as HTMLInputElement;
    searchInput.value = "volcano";
    searchInput.dispatchEvent(new Event("input"));

    const rows = document.querySelectorAll("#markersBody .states");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('[data-col="name"]')?.textContent).toBe("Mount Doom");
  });

  it("sorts markers by name when header is clicked", () => {
    MarkersOverview.open();

    const nameHeader = document.querySelector('#markersOverviewHeader [data-col="name"]') as HTMLElement;
    nameHeader.click();

    const names = Array.from(document.querySelectorAll("#markersBody .states")).map(
      row => row.querySelector('[data-col="name"]')?.textContent
    );
    expect(names).toEqual(["Moria", "Mount Doom", "The Prancing Pony"]);
  });

  it("zooms to and locates the marker when target button is clicked", () => {
    MarkersOverview.open();

    const targetButton = document.querySelector('#markersBody .states[data-id="1"] .icon-target') as HTMLElement;
    targetButton.click();

    expect(zoom.zoomTo).toHaveBeenCalledWith(100, 200, 8, 2000);
  });

  it("exports the generated profile without caching it on the marker", () => {
    const marker = {
      i: 9,
      type: "dungeons",
      icon: "🗝️",
      name: "Dungeon",
      note: "Watabou legend",
      cell: 10,
      x: 100,
      y: 200,
      generated: { kind: "dungeon", version: 1, seed: "12345" }
    };
    Object.assign(pack, { markers: [marker] });
    Object.assign(pack.cells, {
      biome: Array(31).fill(1),
      h: Array(31).fill(42),
      province: Array(31).fill(0),
      religion: Array(31).fill(0)
    });
    Object.assign(pack, {
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Aeloran", alignment: "neutral" }
      ],
      biomes: [
        { i: 0, name: "" },
        { i: 1, name: "Forest" }
      ],
      states: [{ i: 0, name: "Neutrals" }],
      provinces: [{ i: 0, name: "" }],
      religions: [{ i: 0, name: "" }]
    });
    options.map.seed = "12345";
    vi.mocked(Csv.download).mockClear();

    MarkersOverview.exportCsv();

    const rows = vi.mocked(Csv.download).mock.calls.at(-1)?.[2] as string[][];
    expect(rows[0][4]).toContain("Dungeon profile");
    expect((marker.generated as { html?: string }).html).toBeUndefined();
  });

  it("exports a creature profile without caching it on the marker", () => {
    const marker = {
      i: 9,
      type: "hill-monsters",
      icon: "👹",
      name: "Aeloran Ogre",
      note: "A rumor of an ogre",
      cell: 10,
      x: 100,
      y: 200,
      generated: { kind: "monster", version: 1, seed: "12345", meta: { species: "Ogre" } }
    };
    Object.assign(pack, { markers: [marker] });
    Object.assign(pack.cells, {
      biome: Array(31).fill(1),
      h: Array(31).fill(60),
      pop: Array(31).fill(5),
      province: Array(31).fill(0),
      religion: Array(31).fill(0)
    });
    Object.assign(pack, {
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Aeloran", alignment: "neutral" }
      ],
      biomes: [
        { i: 0, name: "" },
        { i: 1, name: "Forest" }
      ],
      states: [{ i: 0, name: "Neutrals" }],
      provinces: [{ i: 0, name: "" }],
      religions: [{ i: 0, name: "" }]
    });
    options.map.seed = "12345";
    vi.mocked(Csv.download).mockClear();

    MarkersOverview.exportCsv();

    const rows = vi.mocked(Csv.download).mock.calls.at(-1)?.[2] as string[][];
    expect(rows[0][4]).toContain("Monster profile");
    expect((marker.generated as { html?: string }).html).toBeUndefined();
  });
});
