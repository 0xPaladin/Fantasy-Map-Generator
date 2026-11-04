// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    tick: 3,
    season: 1,
    states: {} as Record<number, unknown>,
    provinces: {} as Record<number, unknown>,
    burgs: {} as Record<number, unknown>,
    units: {} as Record<string, unknown>,
    recentNews: [] as unknown[],
    guild: { tier: 1, gold: 0, renown: 0, popups: [] as unknown[] }
  };
  return { state, living: { getState: vi.fn(() => state) } };
});

vi.mock("@/model/physical/living-generator", () => ({ Living: mocks.living, UNIT_MAX_HP: 100 }));

import {
  clearLivingToasts,
  collectLivingBadges,
  collectLivingVectors,
  drawLivingOverlay,
  removeLivingOverlay,
  showMarkerToast
} from "./draw-living-overlay";

function makePack() {
  return {
    cells: {
      p: [
        [0, 0],
        [10, 10],
        [20, 20],
        [30, 30]
      ],
      province: new Uint16Array([0, 1, 1, 1])
    },
    burgs: [
      { i: 0 },
      { i: 1, name: "Aelor", cell: 1, x: 10, y: 10, state: 1 },
      { i: 2, name: "Oakford", cell: 2, x: 20, y: 20, state: 1 }
    ],
    states: [{ i: 0 }, { i: 1, name: "Aeloria", capital: 1, center: 1 }]
  };
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = /* html */ `<svg id="map"><g id="viewbox"></g></svg>`;
  globalThis.pack = makePack() as unknown as typeof pack;

  mocks.state.tick = 3;
  mocks.state.states = {};
  mocks.state.provinces = {};
  mocks.state.burgs = {};
  mocks.state.units = {};
  mocks.state.recentNews = [];
  mocks.state.guild = { tier: 1, gold: 0, renown: 0, popups: [] };
});

afterEach(() => {
  removeLivingOverlay();
});

describe("collectLivingVectors", () => {
  it("draws raid lines for pending lairs and war arrows for conquer agendas", () => {
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        lair: { cell: 3, raidPending: true, name: "Forest Hideout", level: 6 }
      }
    };
    mocks.state.states = {
      1: {
        stateId: 1,
        agenda: { kind: "conquer", targetBurgId: 2, label: "Take Oakford", progress: 1, required: 2 }
      }
    };

    const vectors = collectLivingVectors(mocks.state as never);

    expect(vectors.find(vector => vector.kind === "raid")).toMatchObject({ label: "Forest Hideout", from: [30, 30] });
    expect(vectors.find(vector => vector.kind === "war")).toMatchObject({
      label: "Aeloria",
      from: [10, 10],
      to: [20, 20]
    });
  });
});

describe("collectLivingBadges", () => {
  it("only surfaces outcomes from the season that just resolved", () => {
    mocks.state.recentNews = [
      { tick: 3, year: 1000, season: 1, kind: "battle", text: "Battle of Oakford!", cell: 2 },
      { tick: 2, year: 1000, season: 0, kind: "war", text: "Old news", cell: 1 }
    ];

    const badges = collectLivingBadges(mocks.state as never);

    expect(badges).toHaveLength(1);
    expect(badges[0].cell).toBe(2);
    expect(badges[0].text).toContain("Battle of Oakford");
  });

  it("filters out trouble and lair news and cells with active bounty popups", () => {
    mocks.state.guild.popups = [
      {
        id: 7,
        kind: "bounty_trouble",
        cell: 1,
        title: "Trouble",
        subtitle: "Lv 4",
        createdTick: 3,
        expiresAtTick: 6,
        rewardGold: 20,
        rewardRenown: 3
      },
      {
        id: 8,
        kind: "bounty_lair",
        cell: 3,
        title: "Lair Raid",
        subtitle: "Lv 5",
        createdTick: 3,
        expiresAtTick: 6,
        rewardGold: 30,
        rewardRenown: 3
      }
    ];
    mocks.state.recentNews = [
      { tick: 3, year: 1000, season: 1, kind: "trouble", text: "Disorder arose!", cell: 1 },
      { tick: 3, year: 1000, season: 1, kind: "lair", text: "Raiders struck!", cell: 3 },
      { tick: 3, year: 1000, season: 1, kind: "battle", text: "Battle of Oakford!", cell: 2 }
    ];

    const badges = collectLivingBadges(mocks.state as never);
    expect(badges).toHaveLength(1);
    expect(badges[0].cell).toBe(2);
    expect(badges[0].text).toContain("Battle of Oakford");
  });

  it("adds wounded unit and besieged city badges", () => {
    mocks.state.units = { "1-0": { unitTypeId: "warrior", hp: 40 } };
    mocks.state.burgs = { 1: { burgId: 1, hp: 120, maxHp: 250 } };
    (globalThis.pack as unknown as { states: unknown[] }).states = [
      { i: 0 },
      { i: 1, name: "Aeloria", military: [{ i: 0, cell: 1 }] }
    ];

    const badges = collectLivingBadges(mocks.state as never);

    expect(badges.some(badge => badge.text.includes("40 HP"))).toBe(true);
    expect(badges.some(badge => badge.text.includes("120 / 250"))).toBe(true);
  });
});

describe("drawLivingOverlay", () => {
  it("renders vectors, floating badges and clickable popups on the map", () => {
    mocks.state.provinces = {
      1: { provinceId: 1, lair: { cell: 3, raidPending: true, name: "Forest Hideout", level: 6 } }
    };
    mocks.state.states = {
      1: { stateId: 1, agenda: { kind: "conquer", targetBurgId: 2, label: "Take Oakford", progress: 1, required: 2 } }
    };
    mocks.state.recentNews = [{ tick: 3, year: 1000, season: 1, kind: "battle", text: "Battle of Oakford!", cell: 2 }];
    mocks.state.guild.popups = [
      {
        id: 7,
        kind: "bounty_trouble",
        cell: 1,
        title: "Monsters in Aelor",
        subtitle: "Level 5 trouble",
        createdTick: 0,
        expiresAtTick: 6,
        rewardGold: 32,
        rewardRenown: 3
      }
    ];

    drawLivingOverlay();

    const overlay = document.getElementById("livingOverlay");
    expect(overlay).toBeTruthy();
    expect(overlay?.querySelector(".livingVector-raid")).toBeTruthy();
    expect(overlay?.querySelector(".livingVector-war")).toBeTruthy();
    expect(overlay?.querySelector(".livingFloatBadge")).toBeTruthy();

    const popup = overlay?.querySelector('.livingPopup[data-popup-id="7"]');
    expect(popup).toBeTruthy();
    expect(popup?.querySelector("title")?.textContent).toContain("+32g");

    // countdown = expiresAtTick - tick (6 - 3)
    expect(popup?.querySelector(".livingPopupCountdown text")?.textContent).toBe("3");
  });

  it("is a no-op when the map is not mounted", () => {
    document.body.innerHTML = "";

    expect(() => drawLivingOverlay()).not.toThrow();
    expect(document.getElementById("livingOverlay")).toBeNull();
  });

  it("removes the overlay and its stylesheet", () => {
    drawLivingOverlay();
    expect(document.getElementById("livingOverlay")).toBeTruthy();

    removeLivingOverlay();

    expect(document.getElementById("livingOverlay")).toBeNull();
    expect(document.getElementById("livingOverlayStyle")).toBeNull();
  });

  it("shows a marker toast only for the clicked popup with zoom-independent scale", () => {
    drawLivingOverlay();
    const overlay = document.getElementById("livingOverlay");

    showMarkerToast({
      id: 42,
      kind: "bounty_trouble",
      cell: 1,
      title: "Goblins in Aelor",
      subtitle: "Level 4 trouble",
      createdTick: 3,
      expiresAtTick: 6,
      rewardGold: 28,
      rewardRenown: 3
    });

    const toast = overlay?.querySelector(".livingFloatBadge");
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain("Goblins in Aelor");
    expect(toast?.textContent).toContain("+28g");
    expect(toast?.getAttribute("transform")).toContain("scale(1.0000)");

    clearLivingToasts();
    expect(overlay?.querySelector(".livingFloatBadge")).toBeNull();
  });
});
