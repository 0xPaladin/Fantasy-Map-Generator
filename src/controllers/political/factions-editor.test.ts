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
import { FactionsEditor, formatAssetBenefits, openOutpostsDialog } from "./factions-editor";

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
    expect(dialog?.innerHTML).not.toContain('data-col="treasury"');
    expect(dialog?.innerHTML).toContain("Avg daily income");
    expect(dialog?.innerHTML).toContain("Prosperity");
    expect(dialog?.innerHTML).toContain("Stability");
    expect(bodySection.querySelector('#factionsRows [data-col="prosperity"]')?.textContent).toContain("%");
    expect(bodySection.querySelector('#factionsRows [data-col="stability"]')?.textContent).toContain("%");
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
    expect(document.querySelector("#outpostsTable")?.innerHTML).toContain("Income");
  });

  it("computes the upstream faction yield breakdown and populates the outpost income column", () => {
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

    const breakdown = Living.getFactionYieldBreakdown(faction);
    expect(breakdown.nodes.length).toBe(2);
    expect(breakdown.hq).not.toBeNull();
    expect(breakdown.hq?.isHq).toBe(true);
    expect(breakdown.hq?.node).toBe(faction.hq);
    expect(breakdown.outposts.length).toBe(1);
    expect(breakdown.outposts[0].isHq).toBe(false);
    expect(breakdown.outposts[0].node).toBe(faction.outposts[0]);
    expect(breakdown.upstreamGold).toBeGreaterThanOrEqual(0);
    expect(breakdown.charterTithe).toBeGreaterThanOrEqual(0);

    openOutpostsDialog(faction.i);
    const dialog = document.querySelector("#factionOutpostsDialog")!;
    expect(dialog.innerHTML).toContain("Income");
    expect(dialog.innerHTML).toContain("/day");
    expect(dialog.innerHTML).not.toContain("income a season");
    expect(dialog.innerHTML).not.toContain("🪙 100");
    expect(dialog.innerHTML).toContain("Revenue");
    expect(dialog.innerHTML).toContain("Adjustments");
    expect(dialog.innerHTML).toContain("Expenses");
    expect(dialog.innerHTML).toContain("Court and patronage");
    expect(dialog.innerHTML).toContain("Day Balance");
    expect(dialog.innerHTML).toContain("Corruption");
    expect(dialog.innerHTML).not.toContain("Citizens");
    expect(dialog.innerHTML).not.toContain("yields");

    const outpostsHeader = dialog.querySelector("#outpostsTable .header")!;
    expect(outpostsHeader.textContent).not.toContain("Tier");
    expect(outpostsHeader.textContent).not.toContain("Lines");
    expect(outpostsHeader.textContent).toContain("Host Impact");
    expect(dialog.innerHTML).toContain("prosperity");
    expect(dialog.innerHTML).toContain("stability");

    const courtInput = dialog.querySelector<HTMLInputElement>('.factionBudgetInput[data-bucket="court"]')!;
    courtInput.value = "35";
    courtInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(faction.budget?.court).toBe(35);

    // Charter tithe rate is also editable directly in the ledger for chartered factions
    const titheInput = dialog.querySelector<HTMLInputElement>('.factionRevenueInput[data-rate-key="charterTithe"]');
    expect(titheInput).toBeNull(); // autonomous Iron Bank has no charter tithe
    faction.allegiance = "chartered";
    faction.patronStateId = 1;
    openOutpostsDialog(faction.i);
    const charteredDialog = document.querySelector("#factionOutpostsDialog")!;
    const titheRateInput = charteredDialog.querySelector<HTMLInputElement>(
      '.factionRevenueInput[data-rate-key="charterTithe"]'
    )!;
    titheRateInput.value = "25";
    titheRateInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(faction.revenue?.charterTithe).toBe(25);

    const hqInfInput = charteredDialog.querySelector<HTMLInputElement>('.nodeInfluenceInput[data-node="hq"]')!;
    hqInfInput.value = "85";
    hqInfInput.dispatchEvent(new Event("change"));
    expect(faction.hq.influence).toBe(85);
  });

  it("formats asset benefits using FMG-native simulation effects", () => {
    expect(formatAssetBenefits("trade_depot")).toBe("+1 🪙/day Host, +3% Market Cut, +1 Influence");
    expect(formatAssetBenefits("safe_house")).toBe("-1 🪙/day Host, -1% Host Stability, +15 Secrecy");
    expect(formatAssetBenefits("shadow_court")).toBe("-6% Host Stability, +10 Secrecy, +4 Influence");
    expect(formatAssetBenefits("war_citadel")).toBe("+4% Host Stability, +2 Force Cap");
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

  it("supports adjustments, season-projected asset queuing, and dismantling in Assets tab", () => {
    const faction = Factions.add({
      name: "Silver Vault",
      category: "commercial",
      type: "merchant_consortium",
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: [] },
      treasury: 500,
      adjustments: [{ name: "Trade Charter", value: 2 }]
    });
    pack.cells.development = new Uint8Array([0, 30, 30]);

    openOutpostsDialog(faction.i, "assets");

    const locSelect = document.querySelector<HTMLSelectElement>("#newAssetLocationSelect")!;
    const assetSelect = document.querySelector<HTMLSelectElement>("#newAssetSelect")!;
    const addAssetBtn = document.querySelector<HTMLButtonElement>("#addAssetBtn")!;

    // Asset options display projected seasons based upon revenue (not lump-sum gold)
    const depotOption = assetSelect.querySelector<HTMLOptionElement>('option[value="trade_depot"]')!;
    expect(depotOption.textContent).toContain("season");
    expect(depotOption.textContent).not.toContain("50g");

    locSelect.value = "hq";
    assetSelect.value = "trade_depot";
    addAssetBtn.click();

    // Selecting places the work in the active slot without deducting lump-sum gold from treasury
    expect(faction.project).toMatchObject({ assetId: "trade_depot", nodeKey: "hq" });
    expect(faction.treasury).toBe(500);
    expect(faction.hq.assets).not.toContain("trade_depot");

    // Selecting another asset places it in the queue
    document.querySelector<HTMLSelectElement>("#newAssetLocationSelect")!.value = "hq";
    document.querySelector<HTMLSelectElement>("#newAssetSelect")!.value = "counting_house";
    document.querySelector<HTMLButtonElement>("#addAssetBtn")!.click();
    expect(faction.projectQueue).toEqual([{ assetId: "counting_house", nodeKey: "hq" }]);

    // A finished asset can still be dismantled from the node.
    faction.project = undefined;
    faction.projectQueue = undefined;
    faction.hq.assets = ["trade_depot"];
    openOutpostsDialog(faction.i, "assets");
    const assetRows = document.querySelectorAll("#assetsTable > .states");
    expect(assetRows.length).toBe(1);
    expect(document.querySelector("#assetsTable")?.innerHTML).toContain("Trade Depot");

    const removeBtn = document.querySelector<HTMLButtonElement>('.removeAssetBtn[data-node="hq"][data-index="0"]')!;
    expect(removeBtn).not.toBeNull();
    removeBtn.click();

    expect(faction.hq.assets?.includes("trade_depot")).toBe(false);
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

    // Disband force (the muster handler ids regiments from 1)
    const removeBtn = document.querySelector<HTMLButtonElement>('.removeForceBtn[data-reg-id="1"]')!;
    expect(removeBtn).not.toBeNull();
    removeBtn.click();

    expect(faction.military?.length).toBe(0);
    expect(document.querySelector("#forcesTable")?.innerHTML).toContain("No military forces mustered yet");
  });
});
