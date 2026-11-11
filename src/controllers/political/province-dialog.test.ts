// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/renderers/layers", () => ({ Layers: { draw: vi.fn() } }));
vi.mock("@/services/speech", () => ({ speak: vi.fn() }));
vi.mock("@/ui/map/zoom", () => ({ zoomTo: vi.fn() }));
vi.mock("@/controllers", () => ({
  Controllers: {
    BurgEditor: { open: vi.fn() }
  }
}));

import { Provinces } from "@/model/political/provinces-generator";
import { DIALOGS_MARKUP } from "@/ui/dialog/dialog-testing";
import { computeProvinceCapacity, openProvinceDetailsDialog, PROVINCE_DIALOG_ID } from "./province-dialog";

describe("openProvinceDetailsDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = /* html */ `<svg></svg><div id="dialogs">${DIALOGS_MARKUP}</div>`;

    globalThis.options = {
      map: {
        units: {
          distance: { scale: 1, unit: "mi" },
          area: { scale: 1, unit: "sq mi" },
          population: { scale: 1000, urbanization: { rate: 0.25 } }
        }
      }
    } as unknown as typeof globalThis.options;

    globalThis.pack = {
      cells: {
        i: [0, 1, 2],
        culture: [0, 1, 1],
        province: [1, 1, 2],
        area: [100, 200, 200],
        pop: [1, 2, 3],
        burg: [0, 1, 0]
      },
      cultures: [
        { i: 0, name: "Wild" },
        { i: 1, name: "Highlander", code: "Hld" }
      ],
      states: [
        { i: 0, name: "Neutrals", color: "#999" },
        { i: 1, name: "Empire", fullName: "The Empire", color: "#e03b3b", capital: 1 }
      ],
      burgs: [
        undefined,
        {
          i: 1,
          name: "Highkeep",
          state: 1,
          cell: 1,
          x: 100,
          y: 200,
          population: 10,
          capital: 1,
          port: 0,
          citadel: 1,
          walls: 1,
          plaza: 0,
          temple: 1,
          shanty: 0
        }
      ],
      markers: [
        {
          i: 1,
          cell: 1,
          type: "mines",
          name: "Iron Mines of Vel",
          x: 105,
          y: 205
        }
      ],
      provinces: [
        undefined,
        {
          i: 1,
          state: 1,
          name: "Northmarch",
          formName: "County",
          fullName: "Northmarch County",
          color: "#4a90e2",
          center: 1,
          area: 500,
          rural: 12,
          urban: 4,
          burg: 1,
          burgs: [1]
        }
      ],
      factions: [
        { i: 0 },
        {
          i: 1,
          name: "Goblin Warren",
          type: "monster_nest",
          allegiance: "hostile",
          sovereignAmbition: true,
          hq: { cell: 1, provinceId: 1, fortified: true, secrecy: 0, assets: [] },
          outposts: [],
          military: [{ a: 120 }],
          raidPending: false,
          stateRelations: {},
          factionRelations: {}
        }
      ],
      living: {
        provinces: {
          1: {
            provinceId: 1,
            order: 65,
            stability: 3,
            development: 2,
            buildings: ["resource_extractor"],
            developmentProgress: {
              settlementId: 1,
              turnsLeft: 2
            },
            trouble: {
              id: "monsters",
              name: "Forest Monsters",
              theme: "wilderness",
              pool: "m",
              save: "reflex",
              requiredRole: "guardsmen",
              level: 4,
              seasonsUnchecked: 2,
              cell: 1
            }
          }
        },
        burgs: {
          1: {
            burgId: 1,
            baseTier: 3,
            development: 1,
            developmentProgress: 0,
            buildings: ["keep"],
            construction: {
              buildingId: "market",
              turnsLeft: 1,
              checks: { m: true, w: false, s: false },
              pityBonus: 0
            },
            unrest: 14
          }
        }
      }
    } as unknown as typeof globalThis.pack;
  });

  it("renders province name & form on one line, removing full name field", () => {
    openProvinceDetailsDialog(1);

    const dialog = document.getElementById(PROVINCE_DIALOG_ID);
    expect(dialog).toBeTruthy();

    const shortInput = dialog?.querySelector<HTMLInputElement>("#provDialogShort");
    const formSelect = dialog?.querySelector<HTMLSelectElement>("#provDialogSelectForm");
    const fullInput = dialog?.querySelector<HTMLInputElement>("#provDialogFull");

    expect(shortInput?.value).toBe("Northmarch");
    expect(formSelect?.value).toBe("County");
    expect(fullInput).toBeNull();

    expect(dialog?.textContent).toContain("Highlander");
  });

  it("renders geography & demographics on one line", () => {
    openProvinceDetailsDialog(1);

    const dialog = document.getElementById(PROVINCE_DIALOG_ID);
    expect(dialog?.textContent).toContain("Highkeep");
    expect(dialog?.textContent).toContain("Area");
    expect(dialog?.textContent).toContain("Population");
    expect(dialog?.textContent).toContain("Rural");
    expect(dialog?.textContent).toContain("Urban");
  });

  it("displays Living World M W S C checks and spacious living stat inputs", () => {
    openProvinceDetailsDialog(1);

    const dialog = document.getElementById(PROVINCE_DIALOG_ID);
    expect(dialog?.textContent).toContain("Checks:");
    expect(dialog?.textContent).toContain("M:");
    expect(dialog?.textContent).toContain("W:");
    expect(dialog?.textContent).toContain("S:");
    expect(dialog?.textContent).toContain("C:");

    const chips = dialog?.querySelectorAll(".provCheckChip");
    expect(chips?.length).toBe(4);

    const orderInput = dialog?.querySelector<HTMLInputElement>("#provDialogOrder");
    const stabInput = dialog?.querySelector<HTMLInputElement>("#provDialogStability");
    const devInput = dialog?.querySelector<HTMLInputElement>("#provDialogDev");
    expect(orderInput?.value).toBe("65");
    expect(stabInput?.value).toBe("3");
    expect(devInput?.value).toBe("2");
    expect(orderInput?.style.width).toBe("4.5em");
    expect(stabInput?.style.width).toBe("4em");
    expect(devInput?.style.width).toBe("4em");

    expect(dialog?.textContent).toContain("Next dev in Highkeep");
    expect(dialog?.textContent).toContain("Forest Monsters");
    expect(dialog?.textContent).toContain("Goblin Warren");
  });

  it("renders Province Assets table above Burgs table, with feature buttons on burg rows", () => {
    openProvinceDetailsDialog(1);

    const dialog = document.getElementById(PROVINCE_DIALOG_ID);
    const tables = dialog?.querySelectorAll("table.provTable");
    expect(tables?.length).toBe(2);

    // Assets table is moved above Burgs table (table index 0)
    const assetTable = tables?.[0];
    expect(assetTable?.textContent).toContain("Iron Mines of Vel");
    expect(assetTable?.textContent).toContain("Resource Extractor");

    // Burgs table (table index 1)
    const burgTable = tables?.[1];
    expect(burgTable?.textContent).toContain("Highkeep");
    expect(burgTable?.textContent).toContain("Tier 3");
    expect(burgTable?.textContent).toContain("Unrest 14");
    expect(burgTable?.querySelector("[data-zoom-burg='1']")).toBeTruthy();
    expect(burgTable?.querySelector("[data-open-burg='1']")).toBeTruthy();

    // Feature buttons on burg row
    expect(burgTable?.querySelector("[data-burg-feature='capital']")).toBeTruthy();
    expect(burgTable?.querySelector("[data-burg-feature='port']")).toBeTruthy();
    expect(burgTable?.querySelector("[data-burg-feature='citadel']")).toBeTruthy();
    expect(burgTable?.querySelector("[data-burg-feature='walls']")).toBeTruthy();
    expect(burgTable?.querySelector("[data-burg-feature='plaza']")).toBeTruthy();
    expect(burgTable?.querySelector("[data-burg-feature='temple']")).toBeTruthy();
    expect(burgTable?.querySelector("[data-burg-feature='shanty']")).toBeTruthy();

    // Toggling a feature button
    const portBtn = burgTable?.querySelector<HTMLElement>("[data-burg-feature='port']");
    expect(pack.burgs[1]!.port).toBe(0);
    portBtn?.click();
    expect(pack.burgs[1]!.port).toBe(1);
  });

  it("applies name and living world stat changes on Apply", () => {
    const onUpdate = vi.fn();
    const renameSpy = vi.spyOn(Provinces, "rename");
    const setFormSpy = vi.spyOn(Provinces, "setForm");

    openProvinceDetailsDialog(1, onUpdate);

    const dialog = document.getElementById(PROVINCE_DIALOG_ID);
    const shortInput = dialog!.querySelector<HTMLInputElement>("#provDialogShort")!;
    const formSelect = dialog!.querySelector<HTMLSelectElement>("#provDialogSelectForm")!;
    const orderInput = dialog!.querySelector<HTMLInputElement>("#provDialogOrder")!;
    const stabInput = dialog!.querySelector<HTMLInputElement>("#provDialogStability")!;
    const devInput = dialog!.querySelector<HTMLInputElement>("#provDialogDev")!;

    shortInput.value = "Southmarch";
    formSelect.value = "Duchy";
    orderInput.value = "80";
    stabInput.value = "5";
    devInput.value = "4";

    const applyButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".dialog-window button")).find(
      btn => btn.textContent?.trim() === "Apply"
    );
    expect(applyButton).toBeTruthy();
    applyButton?.click();

    expect(renameSpy).toHaveBeenCalledWith(1, "Southmarch");
    expect(setFormSpy).toHaveBeenCalledWith(1, "Duchy");

    const pSim = (pack as any).living.provinces[1];
    expect(pSim.order).toBe(80);
    expect(pSim.stability).toBe(5);
    expect(pSim.development).toBe(4);
    expect(onUpdate).toHaveBeenCalled();
  });

  it("computes province capacity and check modifiers correctly", () => {
    const p = pack.provinces[1]!;
    const pSim = (pack as any).living.provinces[1];
    const living = (pack as any).living;

    const cap = computeProvinceCapacity(p, pSim, living);
    // Base levy (1) + Iron mines POI (1) >= 2 M
    expect(cap.m).toBeGreaterThanOrEqual(2);
    // Dev (2) + Resource Extractor (2) >= 4 W
    expect(cap.w).toBeGreaterThanOrEqual(4);
    // Dev (2) >= 2 S
    expect(cap.s).toBeGreaterThanOrEqual(2);
    // Capital (2) >= 2 C
    expect(cap.c).toBeGreaterThanOrEqual(2);
    expect(typeof cap.modM).toBe("number");
    expect(typeof cap.modW).toBe("number");
    expect(typeof cap.modS).toBe("number");
    expect(typeof cap.modC).toBe("number");
  });
});
