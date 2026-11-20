// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

vi.mock("@/model/icons", () => ({
  Icons: { paint: () => ({ fill: "#000000", stroke: "#000000" }), html: () => "" }
}));
vi.mock("@/renderers/draw-markers", () => ({ drawMarkers: vi.fn(), setEditedMarker: vi.fn() }));
const { delveOpen } = vi.hoisted(() => ({ delveOpen: vi.fn() }));
vi.mock("@/controllers", () => ({ Controllers: { DelveScreen: { openPartyPicker: delveOpen } } }));
vi.mock("@/ui/tooltips", () => ({ tip: vi.fn(), clearMainTip: vi.fn() }));
vi.mock("@/ui/dialog/dialog-helpers", async importActual => ({
  noteButton: (await importActual<typeof import("@/ui/dialog/dialog-helpers")>()).noteButton,
  refreshEditors: vi.fn()
}));

import { Markers } from "@/model/story/markers-generator";
import { MarkersEditor } from "./markers-editor";

it("renames through Markers.rename, the same method the Assistant proposes", () => {
  document.body.innerHTML = '<div id="dialogs"></div><svg><svg id="marker4"></svg></svg>';
  options.app.mode = null;
  vi.stubGlobal("pack", { markers: [{ i: 4, type: "inns", name: "Old Well" }] });
  const rename = vi.fn();
  Object.assign(Markers, { rename });
  MarkersEditor.open(4);
  const input = document.getElementById("markerName") as HTMLInputElement;
  input.value = "Wishing Well";
  input.dispatchEvent(new Event("change"));
  expect(rename).toHaveBeenCalledWith(4, "Wishing Well");
});

it("displays type default impacts and updates or resets overrides via Markers.setImpact", () => {
  document.body.innerHTML = '<div id="dialogs"></div><svg><svg id="marker5"></svg></svg>';
  options.app.mode = null;
  vi.stubGlobal("pack", { markers: [{ i: 5, type: "brigands", name: "Highwaymen", cell: 0, x: 0, y: 0 }] });
  const setImpact = vi.fn((_id: number, impact: { economy?: number | null; stability?: number | null }) => {
    if (impact.economy === null) delete pack.markers[0].economy;
    else if (impact.economy !== undefined) pack.markers[0].economy = impact.economy;
    if (impact.stability === null) delete pack.markers[0].stability;
    else if (impact.stability !== undefined) pack.markers[0].stability = impact.stability;
  });
  Object.assign(Markers, { setImpact });

  MarkersEditor.open(5);
  const econ = document.getElementById("markerEconomy") as HTMLInputElement;
  const stab = document.getElementById("markerStability") as HTMLInputElement;
  expect(econ.value).toBe("-3");
  expect(stab.value).toBe("-5");

  econ.value = "2";
  econ.dispatchEvent(new Event("change"));
  expect(setImpact).toHaveBeenCalledWith(5, { economy: 2 });

  stab.value = "-1";
  stab.dispatchEvent(new Event("change"));
  expect(setImpact).toHaveBeenCalledWith(5, { stability: -1 });

  document.getElementById("markerImpactReset")!.click();
  expect(setImpact).toHaveBeenCalledWith(5, { economy: null, stability: null });
  expect(econ.value).toBe("-3");
  expect(stab.value).toBe("-5");
});

it("rerolls a generated profile from the marker editor", () => {
  document.body.innerHTML = '<div id="dialogs"></div><svg><svg id="marker6"></svg></svg>';
  options.app.mode = null;
  vi.stubGlobal("pack", {
    markers: [{ i: 6, type: "dungeons", name: "Dungeon", cell: 0, x: 0, y: 0 }]
  });
  const reroll = vi.spyOn(Markers, "regenerateGeneratedContent").mockImplementation(() => {});

  MarkersEditor.open(6);
  const button = document.getElementById("markerProfileReroll");
  expect(button).not.toBeNull();

  button!.click();
  expect(reroll).toHaveBeenCalledWith(6);
  reroll.mockRestore();
});

it("hides the generated reroll for other marker types", () => {
  document.body.innerHTML = '<div id="dialogs"></div><svg><svg id="marker7"></svg></svg>';
  options.app.mode = null;
  vi.stubGlobal("pack", { markers: [{ i: 7, type: "inns", name: "Inn", cell: 0, x: 0, y: 0 }] });

  MarkersEditor.open(7);
  expect(document.getElementById("markerProfileReroll")).toBeNull();
});

it("offers the generated reroll for ruins", () => {
  document.body.innerHTML = '<div id="dialogs"></div><svg><svg id="marker8"></svg></svg>';
  options.app.mode = null;
  vi.stubGlobal("pack", { markers: [{ i: 8, type: "ruins", name: "Old Ruins", cell: 0, x: 0, y: 0 }] });

  MarkersEditor.open(8);
  expect(document.getElementById("markerProfileReroll")).not.toBeNull();
});

it("sends a party from a dungeon marker", () => {
  document.body.innerHTML = '<div id="dialogs"></div><svg><svg id="marker9"></svg></svg>';
  options.app.mode = null;
  vi.stubGlobal("pack", {
    markers: [
      {
        i: 9,
        type: "dungeons",
        name: "Deep Hall",
        cell: 0,
        x: 0,
        y: 0,
        generated: { kind: "dungeon", version: 1, seed: "12345" }
      }
    ]
  });
  delveOpen.mockClear();

  MarkersEditor.open(9);
  const button = document.getElementById("markerDelve");
  expect(button).not.toBeNull();

  button!.click();
  expect(delveOpen).toHaveBeenCalledWith(9);
});
