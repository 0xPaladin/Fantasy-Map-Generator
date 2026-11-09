// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ui/map/zoom", () => ({ zoomTo: vi.fn() }));
vi.mock("@/controllers", () => ({
  Controllers: {
    BurgEditor: { open: vi.fn() },
    BurgsOverview: { open: vi.fn() }
  }
}));

import { Living } from "@/model/physical/living-generator";
import type { State } from "@/model/political/states-generator";
import { openStateCitiesDialog, STATE_CITIES_DIALOG_ID } from "./state-cities-dialog";

describe("StateCitiesDialog & getStateYieldBreakdown", () => {
  beforeEach(() => {
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
      happiness: 10,
      researchedTechs: ["pottery"]
    };

    living.burgs[1] = {
      burgId: 1,
      baseTier: 2,
      development: 0,
      developmentProgress: 0,
      buildings: [],
      civBuildings: ["library"],
      construction: null,
      unrest: 0,
      originalOwner: 1,
      originalCulture: 1,
      originalReligion: 0,
      isMajor: true,
      citizens: 3,
      workedCells: [1],
      cityYields: {
        food: 5,
        production: 4,
        gold: 6,
        science: 3,
        culture: 2,
        faith: 1,
        happiness: 0
      }
    };

    living.burgs[2] = {
      burgId: 2,
      baseTier: 1,
      development: 0,
      developmentProgress: 0,
      buildings: [],
      civBuildings: ["granary"],
      construction: null,
      unrest: 0,
      originalOwner: 1,
      originalCulture: 1,
      originalReligion: 0,
      isMajor: true,
      citizens: 2,
      workedCells: [2],
      cityYields: {
        food: 4,
        production: 2,
        gold: 3,
        science: 1,
        culture: 1,
        faith: 0,
        happiness: 0
      }
    };
  });

  it("computes accurate state yield breakdown across cities and matches recomputeStateYields", () => {
    const state = pack.states[1];
    const breakdown = Living.getStateYieldBreakdown(state);

    expect(breakdown.cities.length).toBe(2);
    expect(breakdown.capital).not.toBeNull();
    expect(breakdown.capital?.burgId).toBe(1);
    expect(breakdown.capital?.isCapital).toBe(true);

    expect(breakdown.total.food).toBe(9);
    expect(breakdown.total.production).toBe(6);
    expect(breakdown.totalCitizens).toBe(5);
    expect(breakdown.totalWorkedCells).toBe(2);

    const recomputed = Living.recomputeStateYields(state);
    expect(recomputed).toEqual(breakdown.total);
  });

  it("renders State Cities & Yields dialog with header, wide table, scroll styling, add city and add asset controls", () => {
    openStateCitiesDialog(1);

    const dialog = document.querySelector(`#${STATE_CITIES_DIALOG_ID}`) as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog?.innerHTML).toContain("Kingdom of Aeloria");
    expect(dialog?.innerHTML).toContain("Aelorian");
    expect(dialog?.innerHTML).toContain("Capital: Aelor");
    expect(dialog?.innerHTML).toContain("Aelor");
    expect(dialog?.innerHTML).toContain("Oakhaven");
    expect(dialog?.innerHTML).toContain("Library");
    expect(dialog?.innerHTML).toContain("Granary");

    // Dialog styling has width and y-axis scroll
    expect(dialog?.style.overflowY).toBe("auto");
    expect(dialog?.style.minWidth).toContain("860px");

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

    // Add asset controls
    const assetCitySelect = document.querySelector<HTMLSelectElement>("#newStateAssetCitySelect");
    const assetSelect = document.querySelector<HTMLSelectElement>("#newStateAssetSelect");
    const addAssetBtn = document.querySelector<HTMLButtonElement>("#addStateAssetBtn");
    expect(assetCitySelect).not.toBeNull();
    expect(assetSelect).not.toBeNull();
    expect(addAssetBtn).not.toBeNull();
    expect(assetCitySelect?.innerHTML).toContain("Aelor");
    expect(assetSelect?.innerHTML).toContain("Monument");

    // Test adding Riverbend as a major city
    citySelect!.value = "3";
    addCityBtn!.click();

    // Dialog re-renders with 3 major cities
    cityRows = document.querySelectorAll("#stateCitiesTable > .states");
    expect(cityRows?.length).toBe(3);
    expect(document.querySelector(`#${STATE_CITIES_DIALOG_ID}`)?.innerHTML).toContain("Riverbend");

    // Test adding an asset (Monument) to Aelor
    const assetCitySelAfter = document.querySelector<HTMLSelectElement>("#newStateAssetCitySelect");
    const assetSelAfter = document.querySelector<HTMLSelectElement>("#newStateAssetSelect");
    const addAssetBtnAfter = document.querySelector<HTMLButtonElement>("#addStateAssetBtn");
    assetCitySelAfter!.value = "1";
    assetSelAfter!.value = "monument";
    addAssetBtnAfter!.click();

    let assetRows = document.querySelectorAll("#stateAssetsTable > .states");
    expect(assetRows?.length).toBe(3);
    expect(document.querySelector(`#${STATE_CITIES_DIALOG_ID}`)?.innerHTML).toContain("Monument");

    // Test dismantling the newly added Monument
    const removeMonumentBtn = document.querySelector<HTMLButtonElement>('.removeAssetBtn[data-building-id="monument"]');
    expect(removeMonumentBtn).not.toBeNull();
    removeMonumentBtn!.click();

    assetRows = document.querySelectorAll("#stateAssetsTable > .states");
    expect(assetRows?.length).toBe(2);

    // Test removing Riverbend from major cities
    const removeRiverbendBtn = document.querySelector<HTMLButtonElement>('.removeCityBtn[data-burg-id="3"]');
    expect(removeRiverbendBtn).not.toBeNull();
    removeRiverbendBtn!.click();

    cityRows = document.querySelectorAll("#stateCitiesTable > .states");
    expect(cityRows?.length).toBe(2);
    expect(document.querySelector(`#${STATE_CITIES_DIALOG_ID}`)?.innerHTML).not.toContain("Riverbend");
  });
});
