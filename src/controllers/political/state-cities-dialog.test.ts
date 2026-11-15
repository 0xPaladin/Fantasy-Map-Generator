// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ui/map/zoom", () => ({ zoomTo: vi.fn() }));
vi.mock("@/controllers", () => ({
  Controllers: {
    BurgEditor: { open: vi.fn() },
    BurgEconomyOverview: { open: vi.fn() },
    BurgsOverview: { open: vi.fn() },
    EconomyOverview: { open: vi.fn() },
    StabilityOverview: { open: vi.fn() },
    StateBudgetEditor: { open: vi.fn() }
  }
}));

import { Controllers } from "@/controllers";
import { Accounts } from "@/model/economy/accounts";
import { Prosperity } from "@/model/economy/prosperity";
import { Living } from "@/model/physical/living-generator";
import { Stability } from "@/model/political/stability";
import type { State } from "@/model/political/states-generator";
import { openStateCitiesDialog, STATE_CITIES_DIALOG_ID } from "./state-cities-dialog";

describe("State Cities & Economy dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

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
          [50, 50],
          [60, 60]
        ],
        state: [0, 1, 1, 1],
        c: [
          [1, 2],
          [0, 2],
          [0, 1],
          [1, 2]
        ]
      },
      cultures: [{ i: 0 }, { i: 1, name: "Aelorian" }],
      burgs: [
        { i: 0 },
        { i: 1, name: "Aelor", x: 20, y: 20, cell: 1, state: 1, population: 20, capital: true },
        { i: 2, name: "Oakhaven", x: 50, y: 50, cell: 2, state: 1, population: 10 },
        { i: 3, name: "Riverbend", x: 60, y: 60, cell: 3, state: 1, population: 5 }
      ],
      provinces: [{ i: 0 }, { i: 1, state: 1, burg: 2, name: "Oak Province" }],
      states: [
        { i: 0 },
        {
          i: 1,
          name: "Aeloria",
          fullName: "Kingdom of Aeloria",
          form: "Kingdom",
          formName: "Monarchy",
          color: "#4f46e5",
          culture: 1,
          capital: 1,
          treasury: 150,
          military: []
        } as unknown as State
      ]
    });

    const living = Living.init();
    living.states[1] = {
      stateId: 1,
      agenda: null,
      unravel: 0,
      warExhaustion: 0,
      claims: [],
      grudges: [],
      researchedTechs: ["pottery"]
    };

    living.burgs[1] = {
      burgId: 1,
      baseTier: 2,
      development: 0,
      developmentProgress: 0,
      buildings: ["library"],
      civBuildings: ["library"],
      construction: null,
      unrest: 0,
      originalOwner: 1,
      originalCulture: 1,
      originalReligion: 0,
      isMajor: true
    };

    living.burgs[2] = {
      burgId: 2,
      baseTier: 1,
      development: 0,
      developmentProgress: 0,
      buildings: ["granary"],
      civBuildings: ["granary"],
      construction: null,
      unrest: 0,
      originalOwner: 1,
      originalCulture: 1,
      originalReligion: 0,
      isMajor: true
    };
  });

  it("shows the state's development and links each city's upstream economy", () => {
    const cells = pack.cells as unknown as Record<string, unknown>;
    cells.burg = Uint16Array.from([0, 1, 2, 3]);
    cells.development = Uint8Array.from([0, 44, 44, 44]);
    cells.pop = [0, 20, 10, 5];
    options.map.eras = [
      { level: 0, name: "Paleolithic" },
      { level: 40, name: "Renaissance" }
    ] as never;

    openStateCitiesDialog(1);

    const dialog = document.querySelector(`#${STATE_CITIES_DIALOG_ID}`) as HTMLElement;
    expect(document.querySelector(`#${STATE_CITIES_DIALOG_ID}-dialog-title`)?.textContent).toContain(
      "State Cities & Economy"
    );
    expect(dialog.innerHTML).toContain("Development");
    expect(dialog.innerHTML).toContain("Renaissance");
    expect(dialog.querySelector("#stateCitiesBudgetBtn")).not.toBeNull();
    // no economy run in this pack: prosperity falls back to an em dash
    expect(dialog.querySelector("#stateCitiesTable")?.innerHTML).toContain("—");

    (dialog.querySelector(".cityEconomyBtn") as HTMLButtonElement).click();
    expect(Controllers.BurgEconomyOverview.open).toHaveBeenCalledWith(1);
  });

  it("shows prosperity and stability badges when the upstream economy is readable", () => {
    pack.deals = [[1, 1]] as never;
    pack.cells.market = Uint16Array.from([0, 0, 0, 0]);
    options.map.goods = [{}] as never;

    vi.spyOn(Accounts, "ofState").mockReturnValue({ prosperity: 0.62 } as never);
    vi.spyOn(Stability, "get").mockReturnValue({ stability: 0.81 } as never);
    vi.spyOn(Prosperity, "getBurg").mockReturnValue({ prosperity: 0.55 } as never);

    openStateCitiesDialog(1);

    const dialog = document.querySelector(`#${STATE_CITIES_DIALOG_ID}`) as HTMLElement;
    expect(dialog.innerHTML).toContain("Prosperity: 62%");
    expect(dialog.innerHTML).toContain("Stability: 81%");
    expect(dialog.querySelector("#stateCitiesTable")?.innerHTML).toContain("55%");
    expect(dialog.innerHTML).not.toContain("Research");

    (dialog.querySelector("#stateCitiesEconomyBtn") as HTMLButtonElement).click();
    expect(Controllers.EconomyOverview.open).toHaveBeenCalledWith("state", 1);

    (dialog.querySelector("#stateCitiesStabilityBtn") as HTMLButtonElement).click();
    expect(Controllers.StabilityOverview.open).toHaveBeenCalledWith(1);
  });

  it("renders the Cities & Economy dialog with header, cities, assets and add city controls", () => {
    Living.getState().burgs[2].construction = { buildingId: "monument", turnsLeft: 2 };
    openStateCitiesDialog(1);

    const dialog = document.querySelector(`#${STATE_CITIES_DIALOG_ID}`) as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog?.innerHTML).toContain("Kingdom of Aeloria");
    expect(dialog?.innerHTML).toContain("Aelorian");
    expect(dialog?.innerHTML).toContain("Capital: Aelor");
    expect(dialog?.innerHTML).toContain("Aelor");
    expect(dialog?.innerHTML).toContain("Oakhaven");

    // Dialog styling has width and y-axis scroll
    expect(dialog?.style.overflowY).toBe("auto");
    expect(dialog?.style.minWidth).toContain("860px");

    // Cities table has the rewritten City/Pop/Prosperity/Actions columns
    const cityHeader = dialog.querySelector("#stateCitiesTable .header")?.innerHTML ?? "";
    expect(cityHeader).toContain("City");
    expect(cityHeader).toContain("Pop");
    expect(cityHeader).toContain("Prosperity");
    expect(cityHeader).toContain("Actions");

    // Cities table has 2 rows for initial major cities
    let cityRows = dialog?.querySelectorAll("#stateCitiesTable > .states");
    expect(cityRows?.length).toBe(2);

    // Capital has gold star, province capital has small black star
    expect(cityRows?.[0]?.innerHTML).toContain("⭐");
    expect(cityRows?.[1]?.innerHTML).toContain("★");

    // Capital does not have remove city button, but province capital does
    expect(cityRows?.[0]?.querySelector(".removeCityBtn")).toBeNull();
    expect(cityRows?.[1]?.querySelector(".removeCityBtn")).not.toBeNull();

    // Add city controls
    const citySelect = document.querySelector<HTMLSelectElement>("#newStateCitySelect");
    const addCityBtn = document.querySelector<HTMLButtonElement>("#addStateCityBtn");
    expect(citySelect).not.toBeNull();
    expect(addCityBtn).not.toBeNull();
    expect(citySelect?.innerHTML).toContain("Riverbend");

    // Assets tab lists completed buildings and works under way, with no picker
    const assetsTableText = dialog.querySelector("#stateAssetsTable")?.textContent?.toLowerCase() ?? "";
    expect(assetsTableText).toContain("library");
    expect(assetsTableText).toContain("granary");
    expect(assetsTableText).toContain("monument");
    expect(assetsTableText).toContain("2 seasons left");
    expect(dialog.querySelector("#newStateAssetSelect")).toBeNull();
    expect(dialog.querySelector("#addStateAssetBtn")).toBeNull();

    // Test adding Riverbend as a major city
    citySelect!.value = "3";
    addCityBtn!.click();

    // Dialog re-renders with 3 major cities
    cityRows = document.querySelectorAll("#stateCitiesTable > .states");
    expect(cityRows?.length).toBe(3);
    expect(Living.getState().burgs[3]?.isMajor).toBe(true);
    expect(document.querySelector(`#${STATE_CITIES_DIALOG_ID}`)?.innerHTML).toContain("Riverbend");

    // Test removing Riverbend from major cities
    const removeRiverbendBtn = document.querySelector<HTMLButtonElement>('.removeCityBtn[data-burg-id="3"]');
    expect(removeRiverbendBtn).not.toBeNull();
    removeRiverbendBtn!.click();

    cityRows = document.querySelectorAll("#stateCitiesTable > .states");
    expect(cityRows?.length).toBe(2);
    expect(Living.getState().burgs[3]?.isMajor).toBe(false);
    // the cities table drops Riverbend; it re-appears only in the add-city select
    expect(document.querySelector("#stateCitiesTable")?.innerHTML).not.toContain("Riverbend");
  });

  it("supports tab switching between Major Cities, Assets, and Forces", () => {
    openStateCitiesDialog(1);

    const dialog = document.querySelector(`#${STATE_CITIES_DIALOG_ID}`) as HTMLElement;
    expect(dialog).not.toBeNull();

    const citiesTabBtn = dialog.querySelector<HTMLButtonElement>('.tabBtn[data-tab="cities"]')!;
    const assetsTabBtn = dialog.querySelector<HTMLButtonElement>('.tabBtn[data-tab="assets"]')!;
    const forcesTabBtn = dialog.querySelector<HTMLButtonElement>('.tabBtn[data-tab="forces"]')!;

    const citiesPanel = dialog.querySelector<HTMLElement>('.tabPanel[data-panel="cities"]')!;
    const assetsPanel = dialog.querySelector<HTMLElement>('.tabPanel[data-panel="assets"]')!;
    const forcesPanel = dialog.querySelector<HTMLElement>('.tabPanel[data-panel="forces"]')!;

    // Initial state: cities tab active
    expect(citiesTabBtn.classList.contains("active")).toBe(true);
    expect(assetsTabBtn.classList.contains("active")).toBe(false);
    expect(citiesPanel.style.display).toBe("block");
    expect(assetsPanel.style.display).toBe("none");
    expect(forcesPanel.style.display).toBe("none");

    // Click assets tab
    assetsTabBtn.click();
    expect(citiesTabBtn.classList.contains("active")).toBe(false);
    expect(assetsTabBtn.classList.contains("active")).toBe(true);
    expect(citiesPanel.style.display).toBe("none");
    expect(assetsPanel.style.display).toBe("block");
    expect(forcesPanel.style.display).toBe("none");

    // Click forces tab
    forcesTabBtn.click();
    expect(forcesTabBtn.classList.contains("active")).toBe(true);
    expect(assetsTabBtn.classList.contains("active")).toBe(false);
    expect(forcesPanel.style.display).toBe("block");
    expect(assetsPanel.style.display).toBe("none");
  });

  it("supports viewing, adding, and disbanding military forces in the Forces tab", () => {
    openStateCitiesDialog(1, "forces");

    const dialog = document.querySelector(`#${STATE_CITIES_DIALOG_ID}`) as HTMLElement;
    expect(dialog).not.toBeNull();

    // Initially no forces
    expect(dialog.innerHTML).toContain("No military forces mustered yet");

    // Add a new force
    const locSelect = document.querySelector<HTMLSelectElement>("#newStateForceLocationSelect")!;
    const nameInput = document.querySelector<HTMLInputElement>("#newStateForceNameInput")!;
    const troopsInput = document.querySelector<HTMLInputElement>("#newStateForceTroopsInput")!;
    const addBtn = document.querySelector<HTMLButtonElement>("#addStateForceBtn")!;

    expect(locSelect).not.toBeNull();
    locSelect.value = "1";
    nameInput.value = "Royal Guard";
    troopsInput.value = "200";
    addBtn.click();

    // Verify force added to state.military
    const state = pack.states[1];
    expect(state.military?.length).toBe(1);
    expect(state.military![0].name).toBe("Royal Guard");
    expect(state.military![0].a).toBe(200);

    // Verify dialog re-rendered with the force row
    const forceRows = document.querySelectorAll("#stateForcesTable > .states");
    expect(forceRows.length).toBe(1);
    expect(document.querySelector("#stateForcesTable")?.innerHTML).toContain("Royal Guard");
    expect(document.querySelector("#stateForcesTable")?.innerHTML).toContain("200");

    // Disband the force (the muster handler ids regiments from 1)
    const removeBtn = document.querySelector<HTMLButtonElement>('.removeForceBtn[data-reg-id="1"]')!;
    expect(removeBtn).not.toBeNull();
    removeBtn.click();

    expect(state.military?.length).toBe(0);
    expect(document.querySelector("#stateForcesTable")?.innerHTML).toContain("No military forces mustered yet");
  });
});
