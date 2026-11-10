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

import { Living } from "@/model/physical/living-generator";
import { Factions, syncFactionState } from "@/model/political/factions-generator";
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
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: [] }
    });

    Factions.add({
      name: "Night Syndicate",
      category: "underworld",
      type: "thieves_guild",
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
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: ["chapter_lodge"] }
    });

    openOutpostsDialog(faction.i);

    const dialog = document.querySelector("#factionOutpostsDialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.innerHTML).toContain("Wayfarers");
    expect(dialog?.innerHTML).toContain("HQ & Outposts");

    // Add outpost in burg 2
    const burgSelect = document.querySelector<HTMLSelectElement>("#newOutpostBurgSelect")!;
    burgSelect.value = "2";
    const addOutpostBtn = document.querySelector<HTMLButtonElement>("#addOutpostBtn")!;
    addOutpostBtn.click();

    expect(faction.outposts.some(o => o.burgId === 2)).toBe(true);

    // Verify dialog was re-rendered with new outpost in the table
    const outpostRows = document.querySelectorAll("#outpostsTable > .states");
    expect(outpostRows.length).toBe(2);
    expect(document.querySelector("#outpostsTable")?.innerHTML).toContain("Oakhaven");
    expect(document.querySelector("#outpostsTable")?.innerHTML).toContain("🌾");
  });

  it("computes faction yield breakdown and populates outpost table data", () => {
    const faction = Factions.add({
      name: "Iron Bank",
      category: "commercial",
      type: "merchant_consortium",
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: ["trade_depot"] },
      treasury: 100
    });

    faction.outposts.push({
      burgId: 2,
      cell: 2,
      tier: 2,
      influence: 40,
      secrecy: 0,
      assets: ["vault"],
      establishedYear: 1000
    });
    syncFactionState(faction);

    // Provide node yields to simulate computed tick
    faction.hq.sim!.cityYields = {
      food: 4,
      production: 3,
      gold: 5,
      science: 2,
      culture: 1,
      faith: 0,
      happiness: 0
    };
    faction.outposts[0].sim!.cityYields = {
      food: 3,
      production: 2,
      gold: 4,
      science: 1,
      culture: 0,
      faith: 1,
      happiness: 0
    };

    const breakdown = Living.getFactionYieldBreakdown(faction);
    expect(breakdown.hq).not.toBeNull();
    expect(breakdown.hq?.isHq).toBe(true);
    expect(breakdown.hq?.yields.food).toBe(4);
    expect(breakdown.outposts.length).toBe(1);
    expect(breakdown.outposts[0].isHq).toBe(false);
    expect(breakdown.outposts[0].yields.food).toBe(3);

    expect(breakdown.total.food).toBe(7);
    expect(breakdown.total.production).toBe(5);
    expect(breakdown.totalCitizens).toBeGreaterThanOrEqual(3);

    const recomputed = Living.recomputeFactionYields(faction);
    expect(recomputed).toEqual(breakdown.total);

    openOutpostsDialog(faction.i);
    const dialog = document.querySelector("#factionOutpostsDialog")!;
    expect(dialog.innerHTML).toContain("🌾 4 · 🔨 3");
    expect(dialog.innerHTML).toContain("🌾 3 · 🔨 2");
  });

  it("supports tab switching between HQ & Outposts, Assets, and Forces", () => {
    const faction = Factions.add({
      name: "Guild of Traders",
      category: "commercial",
      type: "merchant_consortium",
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: ["trade_depot"] }
    });

    openOutpostsDialog(faction.i);

    const dialog = document.querySelector("#factionOutpostsDialog") as HTMLElement;
    expect(dialog).not.toBeNull();

    const outpostsTabBtn = dialog.querySelector<HTMLButtonElement>('.tabBtn[data-tab="outposts"]')!;
    const assetsTabBtn = dialog.querySelector<HTMLButtonElement>('.tabBtn[data-tab="assets"]')!;
    const forcesTabBtn = dialog.querySelector<HTMLButtonElement>('.tabBtn[data-tab="forces"]')!;

    const outpostsPanel = dialog.querySelector<HTMLElement>('.tabPanel[data-panel="outposts"]')!;
    const assetsPanel = dialog.querySelector<HTMLElement>('.tabPanel[data-panel="assets"]')!;
    const forcesPanel = dialog.querySelector<HTMLElement>('.tabPanel[data-panel="forces"]')!;

    expect(outpostsTabBtn.classList.contains("active")).toBe(true);
    expect(assetsTabBtn.classList.contains("active")).toBe(false);
    expect(outpostsPanel.style.display).toBe("block");
    expect(assetsPanel.style.display).toBe("none");
    expect(forcesPanel.style.display).toBe("none");

    // Click assets tab
    assetsTabBtn.click();
    expect(outpostsTabBtn.classList.contains("active")).toBe(false);
    expect(assetsTabBtn.classList.contains("active")).toBe(true);
    expect(outpostsPanel.style.display).toBe("none");
    expect(assetsPanel.style.display).toBe("block");
    expect(forcesPanel.style.display).toBe("none");

    // Click forces tab
    forcesTabBtn.click();
    expect(forcesTabBtn.classList.contains("active")).toBe(true);
    expect(assetsTabBtn.classList.contains("active")).toBe(false);
    expect(forcesPanel.style.display).toBe("block");
    expect(assetsPanel.style.display).toBe("none");
  });

  it("supports adding and dismantling assets in the Assets tab", () => {
    const faction = Factions.add({
      name: "Silver Vault",
      category: "commercial",
      type: "merchant_consortium",
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: [] }
    });

    openOutpostsDialog(faction.i, "assets");

    const locSelect = document.querySelector<HTMLSelectElement>("#newAssetLocationSelect")!;
    const assetSelect = document.querySelector<HTMLSelectElement>("#newAssetSelect")!;
    const addAssetBtn = document.querySelector<HTMLButtonElement>("#addAssetBtn")!;

    locSelect.value = "hq";
    assetSelect.value = "vault";
    addAssetBtn.click();

    expect(faction.hq.assets).toContain("vault");
    const assetRows = document.querySelectorAll("#assetsTable > .states");
    expect(assetRows.length).toBe(1);
    expect(document.querySelector("#assetsTable")?.innerHTML).toContain("Vault");

    // Dismantle asset
    const removeBtn = document.querySelector<HTMLButtonElement>('.removeAssetBtn[data-node="hq"][data-index="0"]')!;
    expect(removeBtn).not.toBeNull();
    removeBtn.click();

    expect(faction.hq.assets?.includes("vault")).toBe(false);
    expect(document.querySelector("#assetsTable")?.innerHTML).toContain("No assets constructed yet");
  });

  it("supports mustering and disbanding forces in the Forces tab", () => {
    const faction = Factions.add({
      name: "Crimson Legion",
      category: "martial",
      type: "mercenary_band",
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: [] }
    });

    openOutpostsDialog(faction.i, "forces");

    expect(document.querySelector("#forcesTable")?.innerHTML).toContain("No military forces mustered yet");

    const locSelect = document.querySelector<HTMLSelectElement>("#newFactionForceLocationSelect")!;
    const nameInput = document.querySelector<HTMLInputElement>("#newFactionForceNameInput")!;
    const troopsInput = document.querySelector<HTMLInputElement>("#newFactionForceTroopsInput")!;
    const addBtn = document.querySelector<HTMLButtonElement>("#addFactionForceBtn")!;

    locSelect.value = "hq";
    nameInput.value = "Crimson Vanguard";
    troopsInput.value = "150";
    addBtn.click();

    expect(faction.military?.length).toBe(1);
    expect(faction.military![0].name).toBe("Crimson Vanguard");
    expect(faction.military![0].a).toBe(150);

    const forceRows = document.querySelectorAll("#forcesTable > .states");
    expect(forceRows.length).toBe(1);
    expect(document.querySelector("#forcesTable")?.innerHTML).toContain("Crimson Vanguard");
    expect(document.querySelector("#forcesTable")?.innerHTML).toContain("150");

    // Disband force
    const removeBtn = document.querySelector<HTMLButtonElement>('.removeForceBtn[data-reg-id="0"]')!;
    expect(removeBtn).not.toBeNull();
    removeBtn.click();

    expect(faction.military?.length).toBe(0);
    expect(document.querySelector("#forcesTable")?.innerHTML).toContain("No military forces mustered yet");
  });
});
