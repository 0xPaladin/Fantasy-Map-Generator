// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/renderers/layers", () => ({ Layers: { show: vi.fn(), draw: vi.fn(), hide: vi.fn(), isOn: () => false } }));
vi.mock("@/ui/map/zoom", () => ({ zoomTo: vi.fn() }));
vi.mock("@/controllers", () => ({
  Controllers: {
    ColorPicker: { open: vi.fn(), close: vi.fn() },
    IconPicker: { open: vi.fn() }
  }
}));

import { Factions } from "@/model/political/factions-generator";
import type { Faction } from "@/types/factions";
import { dialogState } from "@/ui/dialog/state";
import { FactionsEditor, openOutpostsDialog } from "./factions-editor";

describe("FactionsEditor", () => {
  beforeEach(() => {
    dialogState.remove("factionsEditor", "filters");
    dialogState.remove("factionsEditor", "sorting");
    dialogState.remove("factionsEditor", "columns");

    document.body.innerHTML = /* html */ `<div id="dialogs"></div><svg id="viewbox"></svg>`;

    vi.stubGlobal("options", {
      app: { mode: null },
      map: {
        lore: { calendar: { year: 1000 } }
      }
    });

    vi.stubGlobal("pack", {
      cells: {
        p: [
          [0, 0],
          [20, 20],
          [50, 50]
        ]
      },
      burgs: [
        { i: 0 },
        { i: 1, name: "Aelor", x: 20, y: 20, cell: 1, population: 15 },
        { i: 2, name: "Oakhaven", x: 50, y: 50, cell: 2, population: 8 }
      ],
      markers: [],
      states: [{ i: 0 }, { i: 1, name: "Aeloria" }],
      factions: [{ i: 0 } as Faction]
    });
  });

  it("opens the Factions Editor dialog and renders rows for active factions", () => {
    Factions.add({
      name: "Golden Merchants",
      category: "commercial",
      type: "merchant_consortium",
      scale: "burg",
      tier: 1,
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: ["trade_depot"] },
      treasury: 200,
      influence: 50
    });

    FactionsEditor.open();

    const dialog = document.querySelector("#factionsEditor");
    expect(dialog).not.toBeNull();

    const bodySection = document.querySelector("#factionsBodySection")!;
    expect(bodySection.innerHTML).toContain("Golden Merchants");
    expect(bodySection.innerHTML).toContain("Commercial");
  });

  it("filters factions by category and search", () => {
    Factions.add({
      name: "Golden Merchants",
      category: "commercial",
      type: "merchant_consortium",
      scale: "burg",
      tier: 1,
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: [] }
    });

    Factions.add({
      name: "Night Syndicate",
      category: "underworld",
      type: "thieves_guild",
      scale: "province",
      tier: 2,
      hq: { cell: 2, burgId: 2, fortified: false, secrecy: 50, assets: [] }
    });

    FactionsEditor.open();

    // Category filter: underworld
    const catSelect = document.querySelector<HTMLSelectElement>("#factionsCategoryFilter")!;
    catSelect.value = "underworld";
    catSelect.dispatchEvent(new Event("change"));

    let bodySection = document.querySelector("#factionsBodySection")!;
    expect(bodySection.innerHTML).toContain("Night Syndicate");
    expect(bodySection.innerHTML).not.toContain("Golden Merchants");

    // Search filter
    catSelect.value = "all";
    catSelect.dispatchEvent(new Event("change"));

    const searchInput = document.querySelector<HTMLInputElement>("input#factionsSearch")!;
    searchInput.value = "gold";
    searchInput.dispatchEvent(new Event("input"));

    bodySection = document.querySelector("#factionsBodySection")!;
    expect(bodySection.innerHTML).toContain("Golden Merchants");
    expect(bodySection.innerHTML).not.toContain("Night Syndicate");
  });

  it("opens outposts & assets management dialog and supports adding outposts", () => {
    const faction = Factions.add({
      name: "Wayfarers",
      category: "adventuring",
      type: "adventurer_guild",
      scale: "burg",
      tier: 1,
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: ["chapter_lodge"] }
    });

    openOutpostsDialog(faction.i);

    const dialog = document.querySelector("#factionOutpostsDialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.innerHTML).toContain("Wayfarers");
    expect(dialog?.innerHTML).toContain("HQ Assets");

    // Add outpost in burg 2
    const burgSelect = document.querySelector<HTMLSelectElement>("#newOutpostBurgSelect")!;
    burgSelect.value = "2";
    const addOutpostBtn = document.querySelector<HTMLButtonElement>("#addOutpostBtn")!;
    addOutpostBtn.click();

    expect(faction.outposts.some(o => o.burgId === 2)).toBe(true);
  });
});
