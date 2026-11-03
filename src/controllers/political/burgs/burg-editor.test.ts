// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/renderers/layers", () => ({ Layers: { show: vi.fn() } }));
vi.mock("@/ui/tooltips", () => ({ tip: vi.fn(), clearMainTip: vi.fn(), loadingTip: { start: vi.fn(), end: vi.fn() } }));
vi.mock("@/ui/map/viewbox-events", () => ({ applyDefaultViewboxEvents: vi.fn() }));
vi.mock("@/controllers", () => ({ Controllers: {} }));
vi.mock("@/renderers/draw-emblems", () => ({ removeEmblem: vi.fn() }));
vi.mock("@/renderers/emblems/renderer", () => ({ EmblemRenderer: { trigger: vi.fn() } }));
vi.mock("@/ui/dialog/dialog-helpers", async importActual => ({
  noteButton: (await importActual<typeof import("@/ui/dialog/dialog-helpers")>()).noteButton
}));

import { Controllers } from "@/controllers";
import { Production } from "@/model/economy/production-generator";
import { Burgs } from "@/model/political/burgs-generator";
import { Dialog } from "@/ui/dialog/dialog";
import { BurgEditor } from "./burg-editor";

const preview = "https://watabou.github.io/city-generator/?seed=1&size=55&preview=1";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("does not reparent a loaded preview when opening or closing the dialog", () => {
  document.body.innerHTML = '<div id="dialogs"></div><svg id="labels"></svg><svg id="burgIcons"></svg>';
  options.app.mode = null;
  vi.stubGlobal("grid", { cells: { temp: [20] } });
  vi.stubGlobal("pack", {
    burgs: [null, { i: 1, cell: 0, state: 0, name: "Polmabas", group: "city", population: 10 }],
    cells: { province: [0], g: [0], h: [30] },
    states: [{ name: "Neutrals" }],
    cultures: []
  });
  Object.assign(Burgs, { getPreview: () => ({ link: preview, preview }) });
  Object.assign(Production, { getBurgProduction: () => ({}) });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

  const reparentedPreviews: string[] = [];
  const append = HTMLElement.prototype.append;
  vi.spyOn(HTMLElement.prototype, "append").mockImplementation(function (this: HTMLElement, ...nodes) {
    for (const node of nodes) {
      if (node instanceof HTMLElement && node.id === "burgEditor")
        reparentedPreviews.push(...Array.from(node.querySelectorAll("iframe"), frame => frame.src));
    }
    return append.apply(this, nodes);
  });

  BurgEditor.open(1);

  expect(reparentedPreviews).toEqual([]);
  expect(Dialog.isOpen("burgEditor")).toBe(true);
  expect(document.querySelector<HTMLInputElement>("#burgName")!.value).toBe("Polmabas");
  const frames = document.querySelectorAll<HTMLIFrameElement>(".dialog-window #burgPreviewObject iframe");
  expect(frames).toHaveLength(1);
  expect(frames[0].src).toBe(preview);

  Dialog.close("burgEditor");

  expect(reparentedPreviews).toEqual([]);
  expect(document.getElementById("burgEditor")).toBeNull();
});

it("shows the OpenCiv city state and opens the Living inspector", () => {
  document.body.innerHTML = '<div id="dialogs"></div><svg id="labels"></svg><svg id="burgIcons"></svg>';
  options.app.mode = null;
  vi.stubGlobal("grid", { cells: { temp: [20] } });

  const inspect = vi.fn();
  Object.assign(Controllers, { LivingHud: { inspect } });

  vi.stubGlobal("pack", {
    burgs: [null, { i: 1, cell: 0, state: 0, name: "Polmabas", group: "city", population: 10 }],
    cells: { province: [0], g: [0], h: [30] },
    states: [{ name: "Neutrals" }],
    cultures: [],
    religions: [
      { i: 0, name: "No religion" },
      { i: 1, name: "Solar Church" }
    ],
    history: {
      living: {
        burgs: {
          1: {
            burgId: 1,
            baseTier: 5,
            isMajor: true,
            citizens: 4,
            cityYields: { food: 9, production: 4, gold: 5, science: 3, culture: 1, faith: 2, happiness: 0 },
            hp: 210,
            maxHp: 250,
            productionQueue: [{ kind: "building", id: "monument" }],
            productionProgress: { "building:monument": 20 },
            religionPressure: { 1: 240 }
          }
        }
      }
    }
  });
  Object.assign(Burgs, { getPreview: () => ({ link: preview, preview }) });
  Object.assign(Production, { getBurgProduction: () => ({}) });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

  BurgEditor.open(1);

  const section = document.getElementById("burgLivingSection");
  expect(section?.style.display).toBe("block");
  expect(section?.textContent).toContain("4 citizens");
  expect(section?.textContent).toContain("Solar Church");
  expect(section?.textContent).toContain("Monument");
  expect(section?.textContent).toContain("20 / 60");

  document.getElementById("burgLivingOpen")!.click();
  expect(inspect).toHaveBeenCalledWith("burg", 1);
});
