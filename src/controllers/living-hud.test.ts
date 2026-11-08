// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks, state } = vi.hoisted(() => {
  const state = {
    living: {
      enabled: true,
      tick: 42,
      season: 0,
      seed: "seed-x",
      states: {},
      provinces: {},
      burgs: {}
    }
  };

  const mocks = {
    living: {
      getState: vi.fn(() => state.living),
      formatSeasonDate: vi.fn(() => "Spring, 1000 AD"),
      getEschaton: vi.fn(() => 7),
      tick: vi.fn(() => state.living),
      syncWorld: vi.fn(),
      eligibleFactionSuppressionTargets: vi.fn(() => []),
      startFactionSuppression: vi.fn(() => true),
      getHeroState: vi.fn((): unknown => undefined),
      setHeroDoctrine: vi.fn(() => true),
      setHeroPush: vi.fn(() => true),
      chooseHeroPath: vi.fn(() => true),
      sparkRebellion: vi.fn(() => true),
      smiteRuler: vi.fn(() => true),
      forceWar: vi.fn(() => true),
      pacifyBurg: vi.fn(() => true),
      completeAsset: vi.fn(() => true),
      spawnTrouble: vi.fn(() => ({})),
      quellTrouble: vi.fn(() => true),
      resolveTrouble: vi.fn(() => true),
      promoteTroubleToState: vi.fn(() => 2),
      spawnLair: vi.fn(() => ({ id: "bandit_camp", name: "Bandit Camp", level: 6 })),
      smiteLair: vi.fn(() => true),
      assaultLair: vi.fn(() => true),
      sendAdventurersToLair: vi.fn(() => true),
      ascendLairToState: vi.fn(() => 2),
      turnAge: vi.fn(() => ({ era: "Second Age", year: 1150, realms: 1, successorStates: 0 }))
    }
  };

  return { mocks, state };
});

vi.mock("@/model/physical/living-generator", () => ({
  Living: mocks.living,
  figureLevel: (xp = 0) => 1 + Math.floor(xp / 60),
  activeCivThemeId: () => "fantasy",
  factionSuppressionProductionCost: (node: { tier?: number }) => 6 + (node?.tier ?? 2) * 4,
  pantheonFaithCost: (founded: number) => 10 + 5 * founded,
  prophetFaithCost: (earned: number) => 200 + 100 * earned,
  majorityReligion: (pressure: Record<number, number> | undefined) => {
    const entries = Object.entries(pressure ?? {}).sort((a, b) => Number(b[1]) - Number(a[1]));
    return entries.length ? Number(entries[0]![0]) : 0;
  }
}));

vi.mock("@/model/physical/living-heroes", () => ({
  ensureHeroSheet: (figure: { hero?: unknown }) => {
    figure.hero ??= {
      archetype: "freeblade",
      attributes: { might: 1, agility: 1, wits: 1, presence: 1 },
      actions: { strike: "d6" },
      xp: 0,
      progression: { appliedLevel: 1, pendingChoices: 0, picks: [] }
    };
    return figure.hero;
  }
}));

vi.mock("@/renderers/draw-living-overlay", () => ({
  drawLivingOverlay: vi.fn(),
  removeLivingOverlay: vi.fn(),
  clearLivingToasts: vi.fn()
}));

vi.mock("@/renderers/layers", () => ({ Layers: { show: vi.fn(), draw: vi.fn(), hide: vi.fn(), isOn: () => false } }));
vi.mock("@/ui/map/zoom", () => ({ zoomTo: vi.fn() }));
vi.mock("@/model/story/journeys/journey-places", () => ({
  getCellPoint: (cell: number): [number, number] | undefined => {
    const p = globalThis.pack?.cells?.p?.[cell];
    return p ? [p[0], p[1]] : undefined;
  }
}));

import { LivingHud } from "./living-hud";

describe("LivingHud", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="dialogs"></div><svg id="viewbox"></svg><div id="livingOverlay"></div>`;
    vi.clearAllMocks();

    globalThis.options = {
      map: {
        seed: "seed-x",
        lore: { calendar: { year: 1000, era: "Age of Dawn", eraShort: "AD" } }
      }
    } as unknown as typeof options;

    globalThis.pack = {
      cells: {
        i: [0, 1, 2, 3, 4, 5],
        state: new Uint16Array([0, 1, 1, 2, 1, 1]),
        province: new Uint16Array([0, 1, 1, 2, 1, 1]),
        burg: new Uint16Array([0, 0, 1, 0, 2, 0]),
        p: [[0, 0], [10, 10], [20, 20], [30, 30], [40, 40], [50, 50]],
        c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4]]
      },
      burgs: [
        { i: 0 },
        { i: 1, name: "Aelor", cell: 5, x: 50, y: 50, state: 1, population: 10, capital: 1 },
        { i: 2, name: "Millbrook", cell: 4, x: 40, y: 40, state: 1, population: 2 }
      ],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Aeloria", fullName: "Kingdom of Aeloria", capital: 1, center: 5 },
        { i: 2, name: "Khazadia", capital: 2, center: 11 }
      ],
      provinces: [
        { i: 0 },
        { i: 1, name: "Aeloran March", state: 1, center: 5 },
        { i: 2, name: "Kazad Hold", state: 2, center: 11 }
      ],
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Aeloran" }
      ],
      religions: [{ i: 1, name: "Solar Church" }],
      markers: [{ i: 0, type: "ruins", cell: 3, name: "Old Ruins" }],
      history: { figures: [], events: [], realms: [], eras: [] }
    } as unknown as typeof pack;
  });

  function openHud(): void {
    LivingHud.open();
  }

  it("opens the HUD with clock, eschaton and news ticker", () => {
    state.living.recentNews = [
      { tick: 1, year: 1000, season: 0, kind: "war", text: "Aeloria marches", cell: 2 }
    ] as never;
    openHud();

    expect(document.getElementById("livingWorldHud")).toBeTruthy();
    expect(document.getElementById("livingHudDate")?.textContent).toContain("1000");
    expect(document.getElementById("livingHudEschaton")?.textContent).toContain("⏳ 7");
    expect(document.querySelectorAll(".livingNewsItem").length).toBeGreaterThan(0);
    state.living.recentNews = [] as never;
  });

  it("steps a season through Living.tick and resyncs", () => {
    openHud();
    (document.getElementById("livingHudStepSeason") as HTMLButtonElement).click();

    expect(mocks.living.tick).toHaveBeenCalledWith(1);
    expect(mocks.living.syncWorld).toHaveBeenCalled();
  });

  it("zooms to a clicked news dispatch", () => {
    state.living.recentNews = [
      { tick: 1, year: 1000, season: 0, kind: "war", text: "Aeloria marches", cell: 2, burgId: 1 }
    ] as never;
    openHud();

    const item = document.querySelector<HTMLElement>(".livingNewsItem");
    item?.click();

    expect(item?.textContent).toContain("Aeloria marches");
    state.living.recentNews = [] as never;
  });

  it("renders the state inspector with god-mode buttons", () => {
    state.living.states = {
      1: {
        stateId: 1,
        agenda: null,
        unravel: 4,
        warExhaustion: 2,
        claims: [],
        grudges: []
      }
    } as never;
    openHud();
    LivingHud.inspect("state", 1);

    const panel = document.getElementById("livingInspector")!;
    expect(panel.textContent).toContain("Sandbox God Mode");
    expect(panel.querySelector('[data-god="spark"]')).toBeTruthy();
    expect(panel.querySelector('[data-god="smite"]')).toBeTruthy();
    expect(panel.querySelector('[data-god="war"]')).toBeTruthy();
    state.living.states = {} as never;
  });

  it("runs god-mode interventions from the state card", () => {
    state.living.states = {
      1: { stateId: 1, agenda: null, unravel: 0, warExhaustion: 0, claims: [], grudges: [] }
    } as never;
    openHud();
    LivingHud.inspect("state", 1);

    (document.querySelector('[data-god="spark"]') as HTMLButtonElement).click();
    expect(mocks.living.sparkRebellion).toHaveBeenCalledWith(1, undefined);
    state.living.states = {} as never;
  });

  it("renders lairs and troubles as province rows with zoom links", () => {
    state.living.states = {
      1: { stateId: 1, agenda: null, unravel: 4, warExhaustion: 2, claims: [], grudges: [] }
    } as never;
    state.living.provinces = {
      1: {
        provinceId: 1,
        order: 60,
        stability: 1,
        development: 0,
        trouble: { id: "bandits", name: "Bandits", level: 3, cell: 4, theme: "banditry" },
        lair: null
      }
    } as never;
    openHud();
    LivingHud.inspect("state", 1);

    const panel = document.getElementById("livingInspector")!;
    expect(panel.textContent).toContain("Bandits [3]");
    state.living.provinces = {} as never;
    state.living.states = {} as never;
  });

  it("renders the burg card with unrest meter and god buttons", () => {
    state.living.burgs = { 1: { burgId: 1, unrest: 8, baseTier: 2, buildings: [], construction: null } } as never;
    openHud();
    LivingHud.inspect("burg", 1);

    const panel = document.getElementById("livingInspector")!;
    expect(panel.textContent).toContain("Aelor");
    expect(panel.querySelector('[data-god="pacify"]')).toBeTruthy();
    expect(panel.querySelector('[data-god="complete"]')).toBeTruthy();
    state.living.burgs = {} as never;
  });

  it("renders the province card with trouble and lair interventions", () => {
    state.living.provinces = {
      1: {
        provinceId: 1,
        order: 40,
        stability: 0,
        development: 0,
        trouble: { id: "prowling", name: "Prowling Monsters", level: 4, cell: 4, theme: "banditry" },
        lair: null
      }
    } as never;
    openHud();
    LivingHud.inspect("province", 1);

    const panel = document.getElementById("livingInspector")!;
    expect(panel.textContent).toContain("Prowling Monsters");
    expect(panel.querySelector('[data-god="quell-trouble"]')).toBeTruthy();
    state.living.provinces = {} as never;
  });

  it("closes and reopens the HUD cleanly", () => {
    openHud();
    LivingHud.close();

    expect(document.getElementById("livingWorldHud")).toBeNull();

    LivingHud.open();
    expect(document.getElementById("livingWorldHud")).toBeTruthy();
  });

  it("renders the suppression section when eligible targets exist", () => {
    state.living.states = {
      1: { stateId: 1, agenda: null, unravel: 0, warExhaustion: 0, claims: [], grudges: [] }
    } as never;
    mocks.living.eligibleFactionSuppressionTargets.mockReturnValue([
      {
        faction: { i: 3, name: "Silver Hand" },
        node: { influence: 40 },
        burg: { i: 1, name: "Aelor" },
        cell: 5,
        wilderness: false,
        nodeKey: "outpost:1",
        score: 10
      }
    ]);
    openHud();
    LivingHud.inspect("state", 1);

    const panel = document.getElementById("livingInspector")!;
    expect(panel.textContent).toContain("Suppression");
    expect(panel.textContent).toContain("Silver Hand");

    (panel.querySelector('[data-guild="suppress-faction"]') as HTMLButtonElement).click();
    expect(mocks.living.startFactionSuppression).toHaveBeenCalledWith(1, 3);

    mocks.living.eligibleFactionSuppressionTargets.mockReturnValue([]);
    state.living.states = {} as never;
  });
});
