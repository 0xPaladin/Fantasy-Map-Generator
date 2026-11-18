// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  getProvince: vi.fn(),
  getProvinces: vi.fn(),
  ofProvince: vi.fn(),
  getInfrastructure: vi.fn(),
  setProvinceAdjustments: vi.fn(),
  mountAdjustments: vi.fn(),
  renderSimAdjustments: vi.fn(),
  tip: vi.fn()
}));

vi.mock("@/data/id-labels", () => ({ EXPENSE_LABELS: { court: "Court" } }));
vi.mock("@/model/economy/corruption", () => ({
  Corruption: { getProvinces: mocks.getProvinces, ofProvince: mocks.ofProvince }
}));
vi.mock("@/model/economy/state-orders", () => ({
  StateOrders: { getInfrastructure: mocks.getInfrastructure }
}));
vi.mock("@/model/political/provinces-generator", () => ({
  Provinces: { setStabilityAdjustments: mocks.setProvinceAdjustments }
}));
vi.mock("@/model/political/stability", () => ({
  Stability: { get: mocks.getState, getProvince: mocks.getProvince, getProvinces: mocks.getProvinces },
  STABILITY_PARTS: [
    "base",
    "prosperity",
    "court",
    "army",
    "remoteness",
    "diversity",
    "corruption",
    "burden",
    "adjustments"
  ]
}));
vi.mock("@/model/political/states-generator", () => ({
  States: { setStabilityAdjustments: vi.fn() }
}));
vi.mock("@/model/units", () => ({ getDecima: () => 30 }));
vi.mock("@/ui/economy-view", () => ({
  ECONOMY_COLORS: { positive: "#0a0", negative: "#a00" },
  EconomyTerms: { noData: () => "No data", stability: () => "Stability tooltip" },
  mountAdjustments: mocks.mountAdjustments,
  renderSimAdjustments: mocks.renderSimAdjustments,
  tone: () => ""
}));
vi.mock("@/ui/tooltips", () => ({ tip: mocks.tip }));

import { DIALOGS_MARKUP } from "@/ui/dialog/dialog-testing";
import { StabilityOverview } from "./stability-overview";

const parts = {
  base: 0.5,
  prosperity: 0,
  court: 0,
  army: 0,
  remoteness: 0,
  diversity: 0,
  corruption: 0,
  burden: 0,
  adjustments: 0
};

describe("StabilityOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `<svg></svg><input id="uiSize" value="1" />${DIALOGS_MARKUP}`;
    globalThis.pack = {
      states: [
        {},
        {
          i: 1,
          name: "Aeloria",
          fullName: "Kingdom of Aeloria",
          culture: 1,
          capital: 1,
          economy: { collected: 10, simStabilityAdjustments: [{ name: "Court", value: 5 }] }
        }
      ],
      provinces: [
        {},
        {
          i: 1,
          state: 1,
          name: "March",
          fullName: "March",
          burg: 1,
          burgs: [1, 2],
          stabilityAdjustments: [],
          simStabilityAdjustments: [{ name: "Trouble", value: -5 }]
        }
      ],
      burgs: [
        {},
        { i: 1, name: "Aelor", cell: 1, x: 0, y: 0, population: 50, state: 1 },
        { i: 2, name: "Mill", cell: 2, x: 10, y: 10, population: 10, state: 1 }
      ],
      cells: { culture: [1, 1, 2], religion: [1, 1, 1], f: [0, 0, 1] }
    } as unknown as typeof globalThis.pack;

    mocks.getProvince.mockReturnValue({ stability: 0.42, parts });
    mocks.getProvinces.mockReturnValue([{ id: 1, people: 60, share: 1, remoteness: 0, diversity: 0, factor: 1 }]);
    mocks.ofProvince.mockReturnValue(12);
    mocks.getInfrastructure.mockReturnValue(new Map([[1, 0.3]]));
  });

  it("opens a province dialog with its parts, adjustments and burgs", () => {
    StabilityOverview.openProvince(1);

    const dialog = document.querySelector("#stabilityOverviewProvince1") as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(document.querySelector(".dialog-title")?.textContent).toContain("March");
    expect(dialog.textContent).toContain("Burgs");
    expect(dialog.textContent).toContain("Aelor");
    expect(dialog.textContent).toContain("Mill");
    expect(dialog.textContent).toContain("42%");
    const headers = [...dialog.querySelectorAll("table.provinces th")].map(header => header.textContent);
    expect(headers).toEqual(["Burg", "People", "Remoteness", "Minorities"]);
    expect(dialog.querySelector("table.provinces tbody tr td")?.textContent).toBe("Aelor");

    expect(mocks.mountAdjustments).toHaveBeenCalledWith(
      expect.anything(),
      [],
      expect.stringContaining("provincial stability"),
      expect.any(Function),
      expect.anything(),
      expect.anything()
    );
    expect(mocks.renderSimAdjustments).toHaveBeenCalled();
  });

  it("renders provincial marker stability lines under Of which markers", () => {
    globalThis.pack.cells = {
      ...globalThis.pack.cells,
      h: [30, 30, 30],
      province: [0, 1, 1]
    } as any;
    globalThis.pack.markers = [{ i: 0, type: "brigands", name: "Forest Gang", cell: 1, x: 0, y: 0 }] as any;

    StabilityOverview.openProvince(1);

    expect(mocks.renderSimAdjustments).toHaveBeenCalledWith(
      expect.anything(),
      [{ name: "Forest Gang", value: -5 }],
      expect.stringContaining("markers"),
      expect.any(Function),
      "Of which markers"
    );
  });

  it("warns and opens nothing without province data", () => {
    mocks.getProvince.mockReturnValue(null);
    StabilityOverview.openProvince(1);

    expect(mocks.tip).toHaveBeenCalled();
    expect(document.querySelector("#stabilityOverviewProvince1")).toBeNull();
  });
});
