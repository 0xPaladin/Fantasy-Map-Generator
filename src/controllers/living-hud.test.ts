// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    enabled: true,
    tick: 0,
    season: 0,
    seed: "test-living",
    snapshotIntervalYears: 10,
    promptOnPlayerBattles: false,
    states: {} as Record<number, unknown>,
    provinces: {} as Record<number, unknown>,
    burgs: {} as Record<number, unknown>,
    recentNews: [] as unknown[],
    guild: {
      tier: 1,
      gold: 0,
      renown: 0,
      ageCount: 0,
      sandboxGodMode: true,
      doctrine: "auto_bounties",
      favoredStateId: 1 as number | undefined,
      chapterBurgIds: [] as number[],
      roster: [] as number[],
      candidates: [] as number[],
      missions: [] as unknown[],
      relics: [] as unknown[],
      cooldowns: {} as Record<number, number>,
      excavatedMarkers: [] as number[],
      popups: [] as unknown[]
    }
  };

  const living = {
    getState: vi.fn(() => state),
    getGuild: vi.fn(() => state.guild),
    getMissions: vi.fn(() => state.guild.missions),
    claimPopup: vi.fn((_id: number): unknown => null),
    formatSeasonDate: vi.fn(() => "Spring, 1000 AD"),
    tick: vi.fn(),
    syncWorld: vi.fn(),
    setDoctrine: vi.fn((doctrine: string) => {
      state.guild.doctrine = doctrine;
    }),
    setSandboxGodMode: vi.fn((enabled: boolean) => {
      state.guild.sandboxGodMode = enabled;
    }),
    setFavoredState: vi.fn((stateId: number) => {
      state.guild.favoredStateId = stateId;
    }),
    recruitCost: vi.fn(() => 80),
    recruitCandidate: vi.fn(() => true),
    chooseHeroPath: vi.fn(() => true),
    getHeroState: vi.fn((): unknown => undefined),
    setHeroDoctrine: vi.fn(() => true),
    setHeroPush: vi.fn(() => true),
    dispatchHero: vi.fn(() => true),
    dispatchBestHero: vi.fn(() => true),
    dispatchParty: vi.fn(() => true),
    getPartyPreview: vi.fn((): unknown => null),
    guildOperationCost: vi.fn(
      (kind: string) =>
        (
          ({
            pacify_mediate: 40,
            rush_charter: 50,
            incite_uprising: 75,
            assassinate_ruler: 100,
            war_broker: 80
          }) as Record<string, number>
        )[kind] ?? 0
    ),
    guildPacifyMediate: vi.fn(() => true),
    guildRushAssetCharter: vi.fn(() => true),
    guildInciteUprising: vi.fn(() => true),
    guildAssassinateRuler: vi.fn(() => true),
    guildBrokerWar: vi.fn(() => true),
    dispatchHeroToMarker: vi.fn(() => true),
    dispatchBestHeroToMarker: vi.fn(() => true),
    equipRelic: vi.fn(() => true),
    enshrineRelic: vi.fn(() => true),
    leaseRelic: vi.fn(() => true),
    recallRelic: vi.fn(() => true),
    excavateMarker: vi.fn(() => true),
    getRelics: vi.fn(() => state.guild.relics),
    getEschaton: vi.fn(() => 0),
    turnAge: vi.fn(() => ({ era: "The Second Age of Ash", year: 1150, realms: 1, successorStates: 2 })),
    resolvePetition: vi.fn(() => ({ summary: "Fund the Militia: the trouble was quelled.", gold: -30, renown: 8 })),
    retireHero: vi.fn(() => 5),
    sparkRebellion: vi.fn(() => true),
    smiteRuler: vi.fn(() => true),
    forceWar: vi.fn(() => true),
    pacifyBurg: vi.fn(() => true),
    completeAsset: vi.fn(() => true),
    spawnTrouble: vi.fn(() => ({ id: "monsters", level: 5 })),
    quellTrouble: vi.fn(() => true),
    resolveTrouble: vi.fn(() => true),
    spawnLair: vi.fn(() => ({ id: "bandit_camp", name: "Bandit Camp", level: 6 })),
    smiteLair: vi.fn(() => true),
    assaultLair: vi.fn(() => true),
    sendAdventurersToLair: vi.fn(() => true),
    ascendLairToState: vi.fn(() => 2)
  };

  return { state, living };
});

vi.mock("@/model/physical/living-generator", () => ({
  Living: mocks.living,
  figureLevel: (xp = 0) => 1 + Math.floor(xp / 60),
  GUILD_TIER_TITLES: [
    "Wayfarers' Lodge",
    "Chartered Company",
    "Grand Adventurers' Guild",
    "Sovereign Order",
    "Immortal Conclave"
  ],
  maxHeroesForTier: (tier: number) => [3, 4, 6, 8, 10][Math.min(4, Math.max(0, tier - 1))] ?? 3,
  activeCivThemeId: () => "fantasy",
  pantheonFaithCost: (founded: number) => 10 + 5 * founded,
  prophetFaithCost: (earned: number) => 200 + 100 * earned,
  majorityReligion: (pressure: Record<number, number> | undefined) => {
    const entries = Object.entries(pressure ?? {}).sort((a, b) => Number(b[1]) - Number(a[1]));
    return entries.length ? Number(entries[0]![0]) : 0;
  }
}));
vi.mock("@/renderers/layers", () => ({ Layers: { draw: vi.fn() } }));
vi.mock("@/ui/map/zoom", () => ({ zoomTo: vi.fn() }));
vi.mock("@/model/story/journeys/journey-places", () => ({ getCellPoint: vi.fn(() => [10, 10]) }));
vi.mock("@/data/roster-store", () => ({
  currentContent: () => ({ content: { buildings: [{ id: "market1", name: "Market" }] }, config: {} })
}));
vi.mock("@/controllers", () => ({
  Controllers: {
    LegendsOverview: { open: vi.fn() },
    StatesEditor: { open: vi.fn() },
    ProvincesEditor: { open: vi.fn() },
    BurgEditor: { open: vi.fn() },
    BurgsOverview: { open: vi.fn() },
    RegimentsOverview: { open: vi.fn() }
  }
}));

import { Controllers } from "@/controllers";
import { Living } from "@/model/physical/living-generator";
import { Layers } from "@/renderers/layers";
import { zoomTo } from "@/ui/map/zoom";
import { LivingHud } from "./living-hud";

function makePack() {
  return {
    cells: {
      i: [0, 1, 2],
      state: new Uint16Array([0, 1, 1]),
      province: new Uint16Array([0, 1, 1]),
      burg: new Uint16Array([0, 1, 2]),
      culture: new Uint16Array([0, 1, 1]),
      religion: new Uint16Array([0, 1, 1]),
      c: [[1], [0, 2], [1]],
      p: [
        [0, 0],
        [10, 10],
        [20, 20]
      ]
    },
    cultures: [
      { i: 0, name: "Wildlands" },
      { i: 1, name: "Aeloran" }
    ],
    states: [
      { i: 0, name: "Neutrals" },
      {
        i: 1,
        name: "Aeloria",
        fullName: "Kingdom of Aeloria",
        center: 1,
        capital: 1,
        culture: 1,
        military: [],
        diplomacy: []
      }
    ],
    burgs: [
      { i: 0 },
      { i: 1, name: "Aelor", cell: 1, state: 1, population: 18, capital: 1 },
      { i: 2, name: "Oakford", cell: 2, state: 1, population: 4, capital: 0 }
    ],
    provinces: [{ i: 0 }, { i: 1, name: "Northmarch", state: 1, burg: 1, center: 1 }],
    markers: [],
    history: {
      living: mocks.state,
      events: [],
      eras: [],
      figures: [
        {
          i: 0,
          name: "Queen Lyra",
          culture: 1,
          birth: 970,
          roles: [{ type: "ruler", target: { kind: "state", id: 1 }, from: 1000 }],
          alignment: "good",
          virtues: ["bold"],
          vices: []
        },
        {
          i: 1,
          name: "Bran Quickfoot",
          culture: 1,
          birth: 945,
          roles: [{ type: "adventurer", target: { kind: "culture", id: 1 }, from: 1000 }],
          alignment: "good",
          virtues: ["bold", "just"],
          vices: [],
          xp: 90,
          skills: { m: 3, w: 1, s: 0, c: 2 },
          cell: 1
        },
        {
          i: 2,
          name: "Sable Vane",
          culture: 1,
          birth: 980,
          roles: [{ type: "adventurer", target: { kind: "culture", id: 1 }, from: 1000 }],
          alignment: "neutral",
          virtues: [],
          vices: ["cruel"],
          xp: 0,
          skills: { m: 0, w: 0, s: 2, c: 1 },
          cell: 1
        }
      ]
    }
  };
}

function makeSimulation() {
  return {
    states: {
      1: {
        stateId: 1,
        rulerId: 0,
        agenda: { kind: "develop", label: "Developing Aelor", progress: 2, required: 4 },
        unravel: 30,
        warExhaustion: 10,
        capacity: {
          m: { gen: 10, load: 4 },
          w: { gen: 8, load: 9 },
          s: { gen: 6, load: 2 },
          c: { gen: 2, load: 1 }
        },
        claims: [{ burgId: 2, lostYear: 999, heldByStateId: 2 }],
        grudges: [{ id: 0, reason: "conquest", year: 999, weight: 4, summary: "Aeloria took Oakford" }]
      }
    },
    burgs: {
      1: {
        burgId: 1,
        baseTier: 5,
        development: 0,
        developmentProgress: 0,
        buildings: ["market1"],
        construction: null,
        unrest: 0
      },
      2: {
        burgId: 2,
        baseTier: 2,
        development: 0,
        developmentProgress: 0,
        buildings: [],
        construction: { buildingId: "market1", turnsLeft: 2, checks: { m: true, w: false, s: false }, pityBonus: 0 },
        unrest: 40
      }
    }
  };
}

beforeEach(() => {
  document.body.innerHTML = `<svg id="map"><g id="viewbox"></g></svg>`;
  vi.clearAllMocks();

  globalThis.options = {
    map: { seed: "test-living", lore: { calendar: { year: 1000, era: "Age of Dawn", eraShort: "AD" } } }
  } as unknown as typeof options;
  globalThis.pack = makePack() as unknown as typeof pack;

  const simulation = makeSimulation();
  mocks.state.states = simulation.states;
  mocks.state.burgs = simulation.burgs;
  mocks.state.provinces = {};
  mocks.state.recentNews = [];
  Object.assign(mocks.state.guild, {
    tier: 2,
    gold: 40,
    renown: 75,
    ageCount: 0,
    sandboxGodMode: true,
    doctrine: "auto_bounties",
    favoredStateId: 1,
    chapterBurgIds: [1],
    roster: [],
    candidates: [],
    missions: [],
    relics: [],
    cooldowns: {},
    excavatedMarkers: [],
    popups: []
  });
  mocks.living.claimPopup.mockReturnValue(null);
  mocks.living.getHeroState.mockReturnValue(undefined);
  mocks.living.getPartyPreview.mockReturnValue(null);
  mocks.living.getState.mockReturnValue(mocks.state);
});

afterEach(() => {
  LivingHud.close();
  vi.useRealTimers();
});

describe("LivingHud", () => {
  it("opens States, Provinces, Burgs, and Regiments editors filtered by state", () => {
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 2, kind: "succession", text: "A new ruler.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");

    const titleButton = inspector?.querySelector<HTMLButtonElement>("button.livingInspectorTitle");
    expect(titleButton).toBeTruthy();
    expect(titleButton?.dataset.open).toBe("states");
    expect(titleButton?.dataset.id).toBe("1");

    titleButton?.click();
    expect(Controllers.StatesEditor.open).toHaveBeenCalled();

    // Standalone States button is removed
    const standaloneStatesBtn = Array.from(inspector?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
      btn => btn.textContent?.trim() === "States"
    );
    expect(standaloneStatesBtn).toBeUndefined();

    // Provinces is grouped with Burgs and Regiments under Capacity
    const capacityButtons = inspector?.querySelector(".livingSection .livingButtons");
    expect(capacityButtons?.querySelector('button[data-open="provinces"]')).toBeTruthy();
    expect(capacityButtons?.querySelector('button[data-open="burgs"]')).toBeTruthy();
    expect(capacityButtons?.querySelector('button[data-open="regiments"]')).toBeTruthy();

    inspector?.querySelector<HTMLElement>('button[data-open="provinces"]')?.click();
    expect(Controllers.ProvincesEditor.open).toHaveBeenCalled();

    inspector?.querySelector<HTMLElement>('button[data-open="burgs"]')?.click();
    expect(Controllers.BurgsOverview.open).toHaveBeenCalledWith({ stateId: 1 });

    inspector?.querySelector<HTMLElement>('button[data-open="regiments"]')?.click();
    expect(Controllers.RegimentsOverview.open).toHaveBeenCalledWith(1);
  });

  it("displays Claims & Grudges title and renders None when all topics are empty", () => {
    const sSim = mocks.state.states[1] as { claims: unknown[]; grudges: unknown[] };
    sSim.claims = [];
    sSim.grudges = [];
    mocks.state.provinces = {};
    for (const burg of Object.values(mocks.state.burgs) as { unrest?: number }[]) burg.unrest = 0;
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 2, kind: "succession", text: "A new ruler.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Claims & Grudges");
    expect(inspector?.textContent).toContain("None");
  });

  it("renders lairs as {Province}, {what} [{level}] and zooms to location on click", () => {
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 50,
        stability: 1,
        development: 0,
        developmentProgress: null,
        trouble: null,
        lair: {
          id: "bandit_camp",
          name: "Bandit Camp",
          level: 6,
          theme: "ruin",
          cell: 2,
          defenders: [],
          raidUnits: [],
          raidThreshold: 5,
          fortified: false,
          raidPending: false,
          seasonsActive: 1
        }
      }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 2, kind: "succession", text: "A new ruler.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Lairs");
    expect(inspector?.textContent).toContain("Northmarch, Bandit Camp [6]");

    const link = inspector?.querySelector<HTMLElement>('button[data-zoom-cell="2"]');
    expect(link).toBeTruthy();
    link?.click();
    expect(zoomTo).toHaveBeenCalled();
  });

  it("renders troubles as {Province}, {what} [{level}] and zooms to location on click", () => {
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 50,
        stability: 1,
        development: 0,
        developmentProgress: null,
        trouble: {
          id: "monsters",
          name: "Monsters",
          theme: "wilderness",
          pool: "m",
          save: "reflex",
          requiredRole: "guardsmen",
          level: 5,
          seasonsUnchecked: 1,
          cell: 2
        },
        lair: null
      }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 2, kind: "succession", text: "A new ruler.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Troubles");
    expect(inspector?.textContent).toContain("Northmarch, Monsters [5]");

    const link = inspector?.querySelector<HTMLElement>('button[data-zoom-cell="2"]');
    expect(link).toBeTruthy();
    link?.click();
    expect(zoomTo).toHaveBeenCalled();
  });

  it("renders claims and restive burgs with clean characters and zooms to burg on click", () => {
    mocks.state.burgs = {
      1: {
        burgId: 1,
        baseTier: 5,
        development: 0,
        developmentProgress: 0,
        buildings: [],
        construction: null,
        unrest: 12
      }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 2, kind: "succession", text: "A new ruler.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Casus belli");
    expect(inspector?.textContent).toContain("Oakford - held by no one since 999");
    expect(inspector?.textContent).toContain("Restive burgs");
    expect(inspector?.textContent).toContain("Orange Aelor");
    expect(inspector?.textContent).not.toContain("unrest 12");

    const burgLink = inspector?.querySelector<HTMLElement>('button[data-zoom-burg="1"]');
    expect(burgLink).toBeTruthy();
    burgLink?.click();
    expect(zoomTo).toHaveBeenCalledWith(10, 10, 8, 1000);
  });

  it("renders Claims & Grudges in precedence order: Lairs, Troubles, Restive burgs, then Claims and Grudges", () => {
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 50,
        stability: 1,
        development: 0,
        developmentProgress: null,
        trouble: {
          id: "monsters",
          name: "Monsters",
          theme: "wilderness",
          pool: "m",
          save: "reflex",
          requiredRole: "guardsmen",
          level: 5,
          seasonsUnchecked: 1,
          cell: 2
        },
        lair: {
          id: "bandit_camp",
          name: "Bandit Camp",
          level: 6,
          theme: "ruin",
          cell: 2,
          defenders: [],
          raidUnits: [],
          raidThreshold: 5,
          fortified: false,
          raidPending: false,
          seasonsActive: 1
        }
      }
    };
    mocks.state.burgs = {
      1: {
        burgId: 1,
        baseTier: 5,
        development: 0,
        developmentProgress: 0,
        buildings: [],
        construction: null,
        unrest: 12
      }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 2, kind: "succession", text: "A new ruler.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const text = document.getElementById("livingInspector")?.textContent ?? "";
    const lairsIdx = text.indexOf("Lairs");
    const troublesIdx = text.indexOf("Troubles");
    const restiveIdx = text.indexOf("Restive burgs");
    const casusIdx = text.indexOf("Casus belli");
    const grudgesIdx = text.lastIndexOf("Grudges");

    expect(lairsIdx).toBeGreaterThan(-1);
    expect(troublesIdx).toBeGreaterThan(lairsIdx);
    expect(restiveIdx).toBeGreaterThan(troublesIdx);
    expect(casusIdx).toBeGreaterThan(restiveIdx);
    expect(grudgesIdx).toBeGreaterThan(casusIdx);
  });

  it("groups restive burgs by Red, Orange, Yellow bins, omits Green, and omits unrest numbers", () => {
    (pack.burgs as unknown) = [
      undefined,
      { i: 1, name: "RedHold", state: 1, cell: 1, x: 10, y: 10 },
      { i: 2, name: "OrangePort", state: 1, cell: 2, x: 20, y: 20 },
      { i: 3, name: "YellowCrest", state: 1, cell: 3, x: 30, y: 30 },
      { i: 4, name: "GreenVillage", state: 1, cell: 4, x: 40, y: 40 },
      { i: 5, name: "BloodFort", state: 1, cell: 5, x: 50, y: 50 }
    ];
    mocks.state.burgs = {
      1: {
        burgId: 1,
        baseTier: 1,
        development: 0,
        developmentProgress: 0,
        buildings: [],
        construction: null,
        unrest: 20
      },
      2: {
        burgId: 2,
        baseTier: 1,
        development: 0,
        developmentProgress: 0,
        buildings: [],
        construction: null,
        unrest: 14
      },
      3: {
        burgId: 3,
        baseTier: 1,
        development: 0,
        developmentProgress: 0,
        buildings: [],
        construction: null,
        unrest: 7
      },
      4: {
        burgId: 4,
        baseTier: 1,
        development: 0,
        developmentProgress: 0,
        buildings: [],
        construction: null,
        unrest: 3
      },
      5: {
        burgId: 5,
        baseTier: 1,
        development: 0,
        developmentProgress: 0,
        buildings: [],
        construction: null,
        unrest: 18
      }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 2, kind: "succession", text: "A new ruler.", cell: 1, stateId: 1 }
    ];

    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    const text = inspector?.textContent ?? "";

    expect(text).toContain("Restive burgs");
    expect(text).toContain("Red RedHold, BloodFort");
    expect(text).toContain("Orange OrangePort");
    expect(text).toContain("Yellow YellowCrest");
    expect(text).not.toContain("GreenVillage");
    expect(text).not.toContain("20");
    expect(text).not.toContain("18");
    expect(text).not.toContain("14");
    expect(text).not.toContain("unrest");

    // Order check: Red appears before Orange, which appears before Yellow
    const redIndex = text.indexOf("Red RedHold, BloodFort");
    const orangeIndex = text.indexOf("Orange OrangePort");
    const yellowIndex = text.indexOf("Yellow YellowCrest");
    expect(redIndex).toBeLessThan(orangeIndex);
    expect(orangeIndex).toBeLessThan(yellowIndex);

    // Zoom on click test
    const redBtn = inspector?.querySelector<HTMLElement>('button[data-zoom-burg="1"]');
    redBtn?.click();
    expect(zoomTo).toHaveBeenCalledWith(10, 10, 8, 1000);

    const bloodBtn = inspector?.querySelector<HTMLElement>('button[data-zoom-burg="5"]');
    bloodBtn?.click();
    expect(zoomTo).toHaveBeenCalledWith(50, 50, 8, 1000);

    const yellowBtn = inspector?.querySelector<HTMLElement>('button[data-zoom-burg="3"]');
    yellowBtn?.click();
    expect(zoomTo).toHaveBeenCalledWith(30, 30, 8, 1000);
  });

  it("closes the inspector when clicking the close button", () => {
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 2, kind: "succession", text: "A new ruler.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.style.display).not.toBe("none");

    inspector?.querySelector<HTMLElement>('[data-inspector="close"]')?.click();
    expect(inspector?.style.display).toBe("none");
  });

  it("renders the Economy strip and inline Stability meters", () => {
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 2, kind: "succession", text: "A new ruler.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Economy");
    expect(inspector?.textContent).toContain("Gold");
    expect(inspector?.textContent).toContain("Production");

    const unravelRow = inspector?.querySelector<HTMLElement>(".livingMeterRow[title*='Unravel']");
    expect(unravelRow).toBeTruthy();
    expect(unravelRow?.getAttribute("title")).toContain("Unravel: 30%");

    const exhaustionRow = inspector?.querySelector<HTMLElement>(".livingMeterRow[title*='Exhaustion']");
    expect(exhaustionRow).toBeTruthy();
    expect(exhaustionRow?.getAttribute("title")).toContain("Exhaustion: 10%");
  });

  it("opens the bar with clock controls and the current date", () => {
    LivingHud.open();

    expect(document.getElementById("livingWorldHud")).toBeTruthy();
    expect(document.getElementById("livingInspector")).toBeTruthy();
    expect(document.getElementById("livingHudDate")?.textContent).toBe("Spring, 1000 AD");
    expect(document.getElementById("livingHudPause")?.textContent).toBe("Pause");
    expect(document.getElementById("livingHudStepSeason")?.textContent).toBe("Step +1 Season");
    expect(document.getElementById("livingHudStepYear")?.textContent).toBe("Step +1 Year");
    expect(document.getElementById("livingHudPlay")?.textContent).toBe("Play 1×");
    expect(document.getElementById("livingHudPlay4")?.textContent).toBe("Play 4×");
    expect(Living.getState).toHaveBeenCalled();
  });

  it("steps a season and redraws the political layers", () => {
    LivingHud.open();
    document.getElementById("livingHudStepSeason")?.click();

    expect(Living.tick).toHaveBeenCalledWith(1);
    expect(Living.syncWorld).toHaveBeenCalled();
    expect(Layers.draw).toHaveBeenCalledWith(
      "states",
      "borders",
      "provinces",
      "labels",
      "burgIcons",
      "military",
      "markers",
      "trouble"
    );
  });

  it("advances four seasons from the year button", () => {
    LivingHud.open();
    document.getElementById("livingHudStepYear")?.click();

    expect(Living.tick).toHaveBeenCalledWith(4);
  });

  it("runs and pauses playback without leaking its interval", () => {
    vi.useFakeTimers();
    LivingHud.open();
    document.getElementById("livingHudPlay4")?.click();

    vi.advanceTimersByTime(700);
    expect(Living.tick).toHaveBeenCalledTimes(2);

    document.getElementById("livingHudPause")?.click();
    vi.advanceTimersByTime(2000);
    expect(Living.tick).toHaveBeenCalledTimes(2);
  });

  it("renders the news ticker and zooms to a clicked dispatch", () => {
    mocks.state.recentNews = [
      {
        tick: 1,
        year: 1000,
        season: 1,
        kind: "war",
        text: "Aeloria declared war on Khazadia.",
        cell: 2,
        stateId: 1
      }
    ];
    LivingHud.open();

    const item = document.querySelector<HTMLElement>("button.livingNewsItem");
    expect(item?.textContent).toContain("[1000 Summer]");
    expect(item?.textContent).toContain("Aeloria declared war");

    item?.click();
    expect(zoomTo).toHaveBeenCalledWith(10, 10, 8, 800);
    expect(document.getElementById("livingInspector")?.textContent).toContain("Kingdom of Aeloria");
  });

  it("shows the state diorama and runs the god-mode actions", () => {
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 2, kind: "succession", text: "A new ruler.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Queen Lyra");
    expect(inspector?.textContent).toContain("Queen Lyra");
    expect(inspector?.textContent).toContain("Developing Aelor");
    expect(inspector?.textContent).toContain("2 / 4");
    expect(inspector?.textContent).toContain("Aeloria took Oakford");
    expect(inspector?.textContent).toContain("Unravel");

    inspector?.querySelector<HTMLElement>('[data-god="spark"]')?.click();
    expect(Living.sparkRebellion).toHaveBeenCalledWith(1, undefined);

    document.querySelector<HTMLElement>('#livingInspector [data-god="smite"]')?.click();
    expect(Living.smiteRuler).toHaveBeenCalledWith(1);

    document.querySelector<HTMLElement>('#livingInspector [data-god="war"]')?.click();
    expect(Living.forceWar).toHaveBeenCalledWith(1);
    expect(document.getElementById("livingHudStatus")?.textContent).toBe("War has been declared.");
  });

  it("shows the OpenCiv empire, research, faith and city queue panels", () => {
    mocks.state.states[1] = {
      ...(mocks.state.states[1] as Record<string, unknown>),
      yieldsPerTurn: { food: 12, production: 5, gold: 6, science: 4, culture: 2, faith: 3, happiness: 0 },
      happiness: 2,
      happinessBreakdown: {
        base: 9,
        luxuries: 4,
        buildings: 2,
        religion: 1,
        relics: 0,
        cityUnhappiness: 3,
        citizenUnhappiness: 6,
        unrestUnhappiness: 0
      },
      currentTechId: "pottery",
      researchedProgress: { pottery: 20 },
      researchedTechs: [],
      faith: 42,
      prophetsEarned: 0,
      religionId: 1,
      pantheonId: "fertility_rites"
    };
    mocks.state.burgs[1] = {
      ...(mocks.state.burgs[1] as Record<string, unknown>),
      citizens: 3,
      cityYields: { food: 8, production: 4, gold: 5, science: 2, culture: 1, faith: 1, happiness: 0 },
      foodStored: 12,
      tilesAcquired: 2,
      productionQueue: [{ kind: "building", id: "monument" }],
      productionProgress: { "building:monument": 20 },
      religionPressure: { 1: 180 }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 1, kind: "religion", text: "Aeloria adopted a faith.", cell: 1, stateId: 1 },
      { tick: 1, year: 1000, season: 1, kind: "build", text: "Aelor builds.", cell: 1, burgId: 1 }
    ];

    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const statePanel = document.getElementById("livingInspector");
    expect(statePanel?.textContent).toContain("OpenCiv Empire");
    expect(statePanel?.textContent).toContain("Research");
    expect(statePanel?.textContent).toContain("Pottery");
    expect(statePanel?.textContent).toContain("20 / 35 science");
    expect(statePanel?.textContent).toContain("Faith 42");
    expect(statePanel?.textContent).toContain("Fertility Rites");

    document.querySelectorAll<HTMLElement>("button.livingNewsItem")[1]?.click();

    const burgPanel = document.getElementById("livingInspector");
    expect(burgPanel?.textContent).toContain("OpenCiv City");
    expect(burgPanel?.textContent).toContain("3 citizens");
    expect(burgPanel?.textContent).toContain("Production");
    expect(burgPanel?.textContent).toContain("Monument");
    expect(burgPanel?.textContent).toContain("Religion");
  });

  it("shows the burg diorama and completes its asset", () => {
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 3, kind: "revolt", text: "Oakford is restless.", cell: 2, burgId: 2 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Oakford");
    expect(inspector?.textContent).toContain("Unrest");
    expect(inspector?.textContent).toContain("Market");
    expect(inspector?.textContent).toContain("2 turns left");

    inspector?.querySelector<HTMLElement>('[data-god="pacify"]')?.click();
    expect(Living.pacifyBurg).toHaveBeenCalledWith(2);

    document.querySelector<HTMLElement>('#livingInspector [data-god="complete"]')?.click();
    expect(Living.completeAsset).toHaveBeenCalledWith(2);
  });

  it("shows provincial lairs in the state inspector and runs lair god-mode actions", () => {
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 75,
        stability: 2,
        development: 1,
        lair: {
          id: "bandit_camp",
          name: "Forest Hideout",
          level: 6,
          theme: "ruin",
          originCell: 1,
          raidThreshold: 5,
          defenders: [{ type: "infantry", count: 25 }],
          fortified: true,
          raidPending: true,
          seasonsActive: 2
        }
      }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 2, kind: "succession", text: "A new ruler.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Forest Hideout");
    expect(inspector?.textContent).toContain("Forest Hideout [6]");

    inspector?.querySelector<HTMLElement>('[data-god="assault-state-lair"]')?.click();
    expect(Living.assaultLair).toHaveBeenCalledWith(1, 1);
    expect(document.getElementById("livingHudStatus")?.textContent).toContain("Northmarch");

    inspector?.querySelector<HTMLElement>('[data-god="delve-state-lair"]')?.click();
    expect(Living.sendAdventurersToLair).toHaveBeenCalledWith(1, 1);

    inspector?.querySelector<HTMLElement>('[data-god="smite-state-lair"]')?.click();
    expect(Living.smiteLair).toHaveBeenCalledWith(1);
  });

  it("opens a province card from the state chips and from inspect()", () => {
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 82,
        stability: 3,
        development: 2,
        trouble: {
          id: "flooding",
          name: "Seasonal Flooding",
          level: 4,
          theme: "burg",
          pool: "w",
          save: "poverty",
          requiredRole: "merchant",
          burgId: 1,
          seasonsUnchecked: 2
        },
        lair: {
          id: "bandit_camp",
          name: "Forest Hideout",
          level: 5,
          theme: "ruin",
          originCell: 1,
          raidThreshold: 5,
          defenders: [{ type: "infantry", count: 12 }],
          fortified: true,
          raidPending: false,
          seasonsActive: 1
        }
      }
    };
    mocks.state.burgs[1] = { ...(mocks.state.burgs[1] as Record<string, unknown>), citizens: 4 };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 2, kind: "religion", text: "Northmarch converts.", cell: 1, stateId: 1 }
    ];

    LivingHud.open();
    LivingHud.inspect("state", 1);

    const inspector = document.getElementById("livingInspector");
    const provinceChip = inspector?.querySelector<HTMLElement>('[data-inspect="province"]');
    expect(provinceChip?.textContent).toContain("Northmarch");

    provinceChip?.click();
    expect(inspector?.textContent).toContain("Public order");
    expect(inspector?.textContent).toContain("82%");
    expect(inspector?.textContent).toContain("Seasonal Flooding");
    expect(inspector?.textContent).toContain("Forest Hideout");
    expect(inspector?.textContent).toContain("4 citizens");
    expect(inspector?.querySelector('[data-open="province"]')).toBeTruthy();

    LivingHud.inspect("province", 1);
    expect(inspector?.textContent).toContain("Provinces Editor");
  });

  it("shows provincial lair on burg card and triggers burg lair interventions", () => {
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 60,
        stability: 1,
        development: 0,
        lair: {
          id: "ancient_evil",
          name: "Abyssal Rift",
          level: 8,
          theme: "ruin",
          originCell: 1,
          raidThreshold: 6,
          defenders: [{ type: "cavalry", count: 15 }],
          fortified: false,
          raidPending: false,
          seasonsActive: 4
        }
      }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 0, kind: "lair", text: "Abyssal Rift active.", cell: 1, burgId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Abyssal Rift");
    expect(inspector?.textContent).toContain("Lv 8");
    expect(inspector?.textContent).toContain("Raid: 6+");
    expect(inspector?.textContent).toContain("15 men");

    inspector?.querySelector<HTMLElement>('[data-god="assault-lair"]')?.click();
    expect(Living.assaultLair).toHaveBeenCalledWith(1, 1);

    inspector?.querySelector<HTMLElement>('[data-god="delve-lair"]')?.click();
    expect(Living.sendAdventurersToLair).toHaveBeenCalledWith(1, 1);

    inspector?.querySelector<HTMLElement>('[data-god="smite-lair"]')?.click();
    expect(Living.smiteLair).toHaveBeenCalledWith(1);
    expect(document.getElementById("livingHudStatus")?.textContent).toBe("The lair was smitten by divine wrath.");
  });

  it("allows spawning a lair when province has no active lair", () => {
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 90,
        stability: 3,
        development: 2,
        lair: null
      }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 0, kind: "peace", text: "Peace in Aelor.", cell: 1, burgId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("No active lair");

    const spawnBtn = inspector?.querySelector<HTMLElement>('[data-god="spawn-lair"]');
    expect(spawnBtn).toBeTruthy();
    spawnBtn?.click();
    expect(Living.spawnLair).toHaveBeenCalledWith(1);
    expect(document.getElementById("livingHudStatus")?.textContent).toBe("A lair has arisen in the province.");
  });

  it("opens the Legends browser from the date badge and toggles the HUD", () => {
    LivingHud.open();
    document.getElementById("livingHudDate")?.click();
    expect(Controllers.LegendsOverview.open).toHaveBeenCalled();

    LivingHud.close();
    expect(document.getElementById("livingWorldHud")).toBeNull();
    expect(document.getElementById("livingInspector")).toBeNull();

    LivingHud.toggle();
    expect(document.getElementById("livingWorldHud")).toBeTruthy();
  });

  it("never shows a Promote to State button for hazard trouble", () => {
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 35,
        stability: 1,
        development: 0,
        trouble: {
          id: "flooding",
          name: "Seasonal Flooding",
          level: 7,
          theme: "burg",
          pool: "w",
          save: "poverty",
          requiredRole: "merchant",
          seasonsUnchecked: 3,
          cell: 1
        }
      }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 0, kind: "trouble", text: "Demagogue in Aelor.", cell: 1, burgId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Seasonal Flooding");
    expect(inspector?.querySelector('[data-god="promote-trouble"]')).toBeNull();

    // Hazards never show a Promote to State button
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 35,
        stability: 1,
        development: 0,
        trouble: {
          id: "flooding",
          name: "Seasonal Flooding",
          level: 6,
          theme: "resource",
          pool: "w",
          save: "poverty",
          requiredRole: "merchant",
          seasonsUnchecked: 2,
          cell: 1
        }
      }
    };
    LivingHud.refresh();
    expect(inspector?.querySelector<HTMLElement>('[data-god="promote-trouble"]')).toBeNull();
  });

  it("shows Ascend Lair button and badge only for state-capable lairs on state and burg cards", () => {
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 40,
        stability: 1,
        development: 0,
        lair: {
          id: "demonic_master",
          name: "Infernal Fane",
          level: 8,
          theme: "ruin",
          cell: 1,
          raidThreshold: 5,
          defenders: [{ type: "infantry", count: 40 }],
          fortified: true,
          raidPending: false,
          seasonsActive: 6
        }
      }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 0, kind: "lair", text: "Infernal Fane.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Infernal Dominion");

    const stateAscendBtn = inspector?.querySelector<HTMLElement>('[data-god="ascend-state-lair"]');
    expect(stateAscendBtn).toBeTruthy();
    stateAscendBtn?.click();
    expect(Living.ascendLairToState).toHaveBeenCalledWith(1);

    // Non-capable lair (monster_nest) omits Ascend Lair button
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 40,
        stability: 1,
        development: 0,
        lair: {
          id: "monster_nest",
          name: "Monster Nest",
          level: 8,
          theme: "ruin",
          cell: 1,
          raidThreshold: 5,
          defenders: [{ type: "infantry", count: 40 }],
          fortified: false,
          raidPending: false,
          seasonsActive: 6
        }
      }
    };
    LivingHud.refresh();
    expect(inspector?.querySelector<HTMLElement>('[data-god="ascend-state-lair"]')).toBeNull();
  });

  it("shows the guild wallet in the guild bar", () => {
    LivingHud.open();

    const bar = document.getElementById("livingHudGuild");
    expect(bar?.textContent).toContain("40g");
    expect(bar?.textContent).toContain("75r");
  });

  it("renders the guild bar with tier, gold/renown, patron, heroes count and doctrine", () => {
    Object.assign(mocks.state.guild, {
      tier: 3,
      gold: 120,
      renown: 160,
      doctrine: "auto_lairs",
      roster: [1],
      candidates: [2],
      favoredStateId: 1
    });
    LivingHud.open();

    const bar = document.getElementById("livingHudGuild");
    expect(bar?.textContent).toContain("⚜ T3");
    expect(bar?.textContent).toContain("Grand Adventurers' Guild");
    expect(bar?.textContent).toContain("120g");
    expect(bar?.textContent).toContain("160r");
    expect(document.getElementById("livingHudPatronBtn")?.textContent).toContain("Patron: Aeloria");
    expect(document.getElementById("livingHudHeroesBtn")?.textContent).toContain("Heroes: 1/6");
    expect((document.getElementById("livingHudDoctrine") as HTMLSelectElement | null)?.value).toBe("auto_lairs");
  });

  it("clicks patron button to zoom to favored state", () => {
    Object.assign(mocks.state.guild, { favoredStateId: 1 });
    LivingHud.open();

    document.getElementById("livingHudPatronBtn")?.click();
    expect(zoomTo).toHaveBeenCalled();
  });

  it("clicks heroes button to open the hero dialog showing active heroes and tavern seekers", () => {
    mocks.living.getHeroState.mockReturnValue({
      resolve: 10,
      stamina: 6,
      maxResolve: 12,
      maxStamina: 8,
      doctrine: "hunt_troubles",
      temperament: { boldness: 0.5, caution: 0.5, teamplay: 0.5, greed: 0.5 },
      injuries: [],
      push: false
    });
    Object.assign(mocks.state.guild, {
      tier: 3,
      gold: 120,
      roster: [1],
      candidates: [2]
    });
    LivingHud.open();

    document.getElementById("livingHudHeroesBtn")?.click();

    const dialog = document.getElementById("livingHeroesDialog");
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain("Active Heroes (1/6)");
    expect(dialog?.textContent).toContain("Bran Quickfoot");
    expect(dialog?.textContent).toContain("Res: 10/12");
    expect(dialog?.textContent).toContain("Sta: 6/8");
    expect(dialog?.textContent).toContain("Tavern Seekers (1)");
    expect(dialog?.textContent).toContain("Sable Vane");

    dialog?.querySelector<HTMLElement>('[data-guild="inspect"][data-figure="1"]')?.click();
    expect(document.getElementById("livingInspector")?.textContent).toContain("Bran Quickfoot");
  });

  it("changes the idle doctrine from the guild bar", () => {
    LivingHud.open();

    const select = document.getElementById("livingHudDoctrine") as HTMLSelectElement;
    select.value = "manual";
    select.dispatchEvent(new Event("change"));

    expect(Living.setDoctrine).toHaveBeenCalledWith("manual");
    expect(document.getElementById("livingHudStatus")?.textContent).toContain("Manual Dispatch");
  });

  it("toggles between Guild Mode and Sandbox God Mode", () => {
    LivingHud.open();

    const toggle = document.querySelector<HTMLElement>('#livingHudGuild [data-mode="sandbox"]');
    expect(toggle).toBeTruthy();
    expect(toggle?.textContent).toContain("Sandbox");

    // initial sandbox is true -> clicking toggles to false (Guild Mode)
    toggle?.click();
    expect(Living.setSandboxGodMode).toHaveBeenCalledWith(false);

    // toggling again sets sandbox to true
    mocks.state.guild.sandboxGodMode = false;
    LivingHud.refresh();
    const guildToggle = document.querySelector<HTMLElement>('#livingHudGuild [data-mode="sandbox"]');
    expect(guildToggle?.classList.contains("strikethrough")).toBe(true);
    guildToggle?.click();
    expect(Living.setSandboxGodMode).toHaveBeenCalledWith(true);
  });

  it("replaces god buttons with guild operations in Guild Mode", () => {
    Object.assign(mocks.state.guild, { sandboxGodMode: false });
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 35,
        stability: 1,
        development: 0,
        trouble: {
          id: "demagogue",
          name: "Zealous Demagogue",
          level: 7,
          theme: "burg",
          pool: "s",
          save: "uprising",
          requiredRole: "prophet",
          seasonsUnchecked: 3,
          cell: 1
        }
      }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 1, kind: "trouble", text: "Demagogue in Aelor.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Guild Operations");
    expect(inspector?.querySelector<HTMLElement>("[data-god]")).toBeNull();

    inspector?.querySelector<HTMLElement>('[data-guild="dispatch-state"]')?.click();
    expect(Living.dispatchBestHero).toHaveBeenCalledWith(1);
    expect(document.getElementById("livingHudStatus")?.textContent).toContain("Northmarch");
  });

  it("dispatches a hero from a burg card in Guild Mode", () => {
    Object.assign(mocks.state.guild, { sandboxGodMode: false });
    mocks.state.provinces = {
      1: {
        provinceId: 1,
        order: 60,
        stability: 1,
        development: 0,
        lair: {
          id: "bandit_camp",
          name: "Forest Hideout",
          level: 6,
          theme: "ruin",
          originCell: 1,
          raidThreshold: 5,
          defenders: [{ type: "infantry", count: 25 }],
          fortified: false,
          raidPending: false,
          seasonsActive: 2
        }
      }
    };
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 3, kind: "lair", text: "Forest Hideout active.", cell: 2, burgId: 2 }
    ];
    mocks.living.getPartyPreview.mockReturnValue({
      party: [1, 2],
      phases: [
        { id: "lair_approach", label: "Approach", action: "scout", tags: ["ruin"], dc: 19, required: true },
        { id: "lair_breach", label: "Breach", action: "strike", tags: ["combat"], dc: 20, required: true }
      ],
      members: [
        { figureId: 1, name: "Bran Quickfoot", score: 4, bestPhaseId: "lair_breach" },
        { figureId: 2, name: "Sable Vane", score: 2, bestPhaseId: "lair_approach" }
      ]
    });
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.querySelector<HTMLElement>("[data-god]")).toBeNull();
    expect(inspector?.textContent).toContain("Expedition Party");
    expect(inspector?.textContent).toContain("Bran Quickfoot");
    expect(inspector?.textContent).toContain("Approach Scout");
    inspector?.querySelector<HTMLElement>('[data-guild="dispatch"]')?.click();
    expect(Living.dispatchBestHero).toHaveBeenCalledWith(1);
    expect(document.getElementById("livingHudStatus")?.textContent).toContain("guild hero");
    inspector?.querySelector<HTMLElement>('[data-guild="dispatch-leader"][data-figure="1"]')?.click();
    expect(Living.dispatchParty).toHaveBeenCalledWith(1, 1);
  });

  it("inspects a hero and retires a veteran from the figure card", () => {
    Object.assign(mocks.state.guild, { roster: [1] });
    LivingHud.open();

    document.getElementById("livingHudHeroesBtn")?.click();
    document.querySelector<HTMLElement>('#livingHeroesDialog [data-guild="inspect"][data-figure="1"]')?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Bran Quickfoot");
    expect(inspector?.textContent).toContain("Level 2");
    expect(inspector?.textContent).toContain("Guild Hero");
    expect(inspector?.textContent).toContain("Ranger");
    expect(inspector?.textContent).toContain("Scout");
    expect(inspector?.textContent).toContain("Survival");
    expect(inspector?.textContent).toContain("Archery");
    expect(inspector?.textContent).toContain("Strike d10 · Guard d10 · Maneuver d10");

    inspector?.querySelector<HTMLElement>('[data-guild="retire"]')?.click();
    expect(Living.retireHero).toHaveBeenCalledWith(1);
  });

  it("offers level 3 path choices on the hero card", () => {
    const hero = pack.history.figures!.find(figure => figure.i === 1)!;
    Object.assign(hero, {
      archetype: "warden",
      disciplines: ["melee", "tactics", "ride"],
      xp: 140,
      skills: { m: 2, w: 0, s: 1, c: 0 },
      progression: { appliedLevel: 3, pendingChoices: 1, picks: [] }
    });
    Object.assign(mocks.state.guild, { roster: [1] });
    LivingHud.open();

    document.getElementById("livingHudHeroesBtn")?.click();
    document.querySelector<HTMLElement>('#livingHeroesDialog [data-guild="inspect"][data-figure="1"]')?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Choose a path (level 3)");
    expect(inspector?.textContent).toContain("Shieldwall");
    expect(inspector?.textContent).toContain("Standard-Bearer");

    inspector?.querySelector<HTMLElement>('[data-guild="choose-path"][data-path="warden_shieldwall"]')?.click();
    expect(Living.chooseHeroPath).toHaveBeenCalledWith(1, "warden_shieldwall");
  });

  it("shows vitals, temperament, doctrine and injury status on the hero card", () => {
    mocks.living.getHeroState.mockReturnValue({
      resolve: 7,
      stamina: 4,
      maxResolve: 12,
      maxStamina: 8,
      doctrine: "hunt_lairs",
      temperament: { boldness: 0.7, caution: 0.5, teamplay: 0.85, greed: 0.2 },
      injuries: [{ kind: "wounded", untilTick: 5 }],
      push: false
    });
    Object.assign(mocks.state.guild, { roster: [1] });
    LivingHud.open();

    document.getElementById("livingHudHeroesBtn")?.click();
    document.querySelector<HTMLElement>('#livingHeroesDialog [data-guild="inspect"][data-figure="1"]')?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Resolve");
    expect(inspector?.textContent).toContain("7/12");
    expect(inspector?.textContent).toContain("Stamina");
    expect(inspector?.textContent).toContain("4/8");
    expect(inspector?.textContent).toContain("Bold");
    expect(inspector?.textContent).toContain("Loyal");
    expect(inspector?.textContent).toContain("Wounded");
    expect(inspector?.textContent).toContain("Doctrine: Lairs");
    expect(inspector?.textContent).toContain("Push: Off");

    inspector?.querySelector<HTMLElement>('[data-guild="hero-doctrine"][data-doctrine="manual"]')?.click();
    expect(Living.setHeroDoctrine).toHaveBeenCalledWith(1, "manual");
    inspector?.querySelector<HTMLElement>('[data-guild="toggle-push"]')?.click();
    expect(Living.setHeroPush).toHaveBeenCalledWith(1, true);
  });

  it("offers paid guild operations on burg and state cards", () => {
    Object.assign(mocks.state.guild, { sandboxGodMode: false });
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 1, kind: "build", text: "Oakford builds.", cell: 2, burgId: 2 },
      { tick: 1, year: 1000, season: 1, kind: "war", text: "Aeloria stirs.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();

    document.querySelector<HTMLElement>('button.livingNewsItem[data-burg="2"]')?.click();
    let inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Pacify & Mediate");
    expect(inspector?.textContent).toContain("Rush Charter");
    expect(inspector?.textContent).toContain("Incite Uprising");

    inspector?.querySelector<HTMLElement>('[data-guild="op-pacify"]')?.click();
    expect(Living.guildPacifyMediate).toHaveBeenCalledWith(2);
    inspector?.querySelector<HTMLElement>('[data-guild="op-charter"]')?.click();
    expect(Living.guildRushAssetCharter).toHaveBeenCalledWith(2);
    inspector?.querySelector<HTMLElement>('[data-guild="op-incite"]')?.click();
    expect(Living.guildInciteUprising).toHaveBeenCalledWith(2);

    document.querySelector<HTMLElement>('button.livingNewsItem[data-state="1"]:not([data-burg])')?.click();
    inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Assassinate Ruler");
    expect(inspector?.textContent).toContain("War Broker");
    inspector?.querySelector<HTMLElement>('[data-guild="op-assassinate"]')?.click();
    expect(Living.guildAssassinateRuler).toHaveBeenCalledWith(1);
    inspector?.querySelector<HTMLElement>('[data-guild="op-broker"]')?.click();
    expect(Living.guildBrokerWar).toHaveBeenCalledWith(1);
  });

  it("shows expedition phase progress and results on the hero card", () => {
    Object.assign(mocks.state.guild, {
      roster: [1],
      missions: [
        {
          id: 4,
          kind: "lair",
          figureId: 1,
          targetCell: 1,
          action: "strike",
          dc: 15,
          progress: 1,
          required: 2,
          rewardGold: 10,
          rewardRenown: 2,
          party: [1, 2],
          tags: ["lair", "combat"],
          phases: [
            { id: "lair_approach", label: "Approach", action: "scout", tags: ["lair"], dc: 14, required: true },
            { id: "lair_breach", label: "Breach", action: "strike", tags: ["combat"], dc: 15, required: true }
          ],
          phaseResults: [{ phaseId: "lair_approach", heroId: 1, roll: 12, total: 18, success: true }]
        }
      ]
    });
    LivingHud.open();

    document.getElementById("livingHudHeroesBtn")?.click();
    document.querySelector<HTMLElement>('#livingHeroesDialog [data-guild="inspect"][data-figure="1"]')?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("On expedition: Phase 2/2");
    expect(inspector?.textContent).toContain("Approach Scout");
    expect(inspector?.textContent).toContain("Breach Strike");
  });

  it("recruits a tavern candidate from the figure card", () => {
    Object.assign(mocks.state.guild, { candidates: [2], gold: 120 });
    LivingHud.open();

    document.getElementById("livingHudHeroesBtn")?.click();
    document.querySelector<HTMLElement>('#livingHeroesDialog [data-guild="inspect"][data-figure="2"]')?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Sable Vane");
    expect(inspector?.textContent).toContain("Recruit — 80g");
    expect(inspector?.querySelector<HTMLElement>("[data-guild='recruit']")?.hasAttribute("disabled")).toBe(false);

    inspector?.querySelector<HTMLElement>('[data-guild="recruit"]')?.click();
    expect(Living.recruitCandidate).toHaveBeenCalledWith(2);
  });

  it("renders vault relics in the guild bar", () => {
    Object.assign(mocks.state.guild, {
      relics: [
        {
          id: 1,
          name: "Crown of the Vhaelen Emperors",
          category: "regalia",
          lore: "Worn by the rulers of Vhaelen.",
          originYear: 812,
          originRealmId: 3,
          bonuses: { s: 2 },
          holder: { kind: "vault" }
        }
      ]
    });
    pack.markers = [
      { i: 0, type: "ruins", icon: "🏛️", x: 10, y: 10, cell: 1, name: "Old Vhaelen", chronicle: true },
      { i: 1, type: "volcano", icon: "🌋", x: 20, y: 20, cell: 2, name: "Mount Keld" }
    ] as unknown as typeof pack.markers;
    LivingHud.open();

    const bar = document.getElementById("livingHudGuild");
    expect(bar?.textContent).toContain("1 relic");
    expect(bar?.textContent).toContain("Crown of the Vhaelen Emperors");
    expect(bar?.textContent).toContain("vault");
    expect(bar?.textContent).not.toContain("Mount Keld");
  });

  it("holds vault overflow in reserve and enshrines it when space opens", () => {
    Object.assign(mocks.state.guild, {
      tier: 1,
      relics: [
        {
          id: 7,
          name: "Diadem of the Fallen",
          category: "regalia",
          lore: "A crown without a kingdom.",
          originYear: 733,
          bonuses: { s: 2 },
          holder: { kind: "reserve" }
        }
      ]
    });
    LivingHud.open();

    const bar = document.getElementById("livingHudGuild");
    expect(bar?.textContent).toContain("Reserve (1)");
    expect(bar?.textContent).toContain("reserve");

    document.querySelector<HTMLElement>('#livingHudGuild [data-guild="inspect-relic"]')?.click();
    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Held in reserve");

    inspector?.querySelector<HTMLElement>('[data-guild="enshrine"]')?.click();
    expect(Living.enshrineRelic).toHaveBeenCalledWith(7);
    expect(document.getElementById("livingHudStatus")?.textContent).toContain("enshrined");
  });

  it("inspects an excavation site and dispatches a hero", () => {
    pack.markers = [
      { i: 4, type: "dungeons", icon: "☠️", x: 10, y: 10, cell: 1, name: "The Ashen Deep" }
    ] as unknown as typeof pack.markers;
    LivingHud.open();

    LivingHud.selectMarker(4);

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("The Ashen Deep");
    expect(inspector?.textContent).toContain("DC 15");
    expect(inspector?.textContent).toContain("Dispatch Hero");

    inspector?.querySelector<HTMLElement>('[data-guild="dispatch-marker"]')?.click();
    expect(Living.dispatchBestHeroToMarker).toHaveBeenCalledWith(4);
    expect(document.getElementById("livingHudStatus")?.textContent).toContain("excavate the site");
  });

  it("shows the relic card with powers, lore and a recall action", () => {
    Object.assign(mocks.state.guild, {
      relics: [
        {
          id: 2,
          name: "Greataxe of General Kael",
          category: "weapon",
          lore: "Forged for General Kael.",
          originYear: 901,
          originFigureId: 1,
          bonuses: { m: 2 },
          holder: { kind: "figure", id: 1 }
        }
      ]
    });
    LivingHud.open();

    document.querySelector<HTMLElement>('#livingHudGuild [data-guild="inspect-relic"]')?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Greataxe of General Kael");
    expect(inspector?.textContent).toContain("Weapon");
    expect(inspector?.textContent).toContain("+2 M");
    expect(inspector?.textContent).toContain("Carried by Bran Quickfoot");

    inspector?.querySelector<HTMLElement>('[data-guild="recall"]')?.click();
    expect(Living.recallRelic).toHaveBeenCalledWith(2);
    expect(document.getElementById("livingHudStatus")?.textContent).toContain("Guild Vault");
  });

  it("offers a Send Expedition action for relics buried in a fallen capital's ruin", () => {
    Object.assign(mocks.state.guild, {
      relics: [
        {
          id: 3,
          name: "Golden Charter of Old Aelor",
          category: "charter",
          lore: "The trade writ that made Aelor rich.",
          originYear: 744,
          bonuses: { w: 2 },
          holder: { kind: "ruin", markerId: 9, cell: 1 }
        }
      ],
      excavatedMarkers: []
    });
    pack.markers = [
      { i: 9, type: "ruins", icon: "🏛️", x: 10, y: 10, cell: 1, name: "Ruins of Aelor", chronicle: true }
    ] as unknown as typeof pack.markers;
    LivingHud.open();

    document.querySelector<HTMLElement>('#livingHudGuild [data-guild="inspect-relic"]')?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Buried in Ruins of Aelor");

    inspector?.querySelector<HTMLElement>('[data-guild="dispatch-marker"]')?.click();
    expect(Living.dispatchBestHeroToMarker).toHaveBeenCalledWith(9);
  });

  it("equips a vault relic from the hero card", () => {
    Object.assign(mocks.state.guild, {
      roster: [1],
      relics: [
        {
          id: 5,
          name: "Codex of the Ashen Schism",
          category: "tome",
          lore: "Saved from the fires.",
          originYear: 890,
          bonuses: { c: 2 },
          holder: { kind: "vault" }
        }
      ]
    });
    LivingHud.open();

    document.getElementById("livingHudHeroesBtn")?.click();
    document.querySelector<HTMLElement>('#livingHeroesDialog [data-guild="inspect"][data-figure="1"]')?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Equip Codex of the Ashen Schism");

    inspector?.querySelector<HTMLElement>('[data-guild="equip"]')?.click();
    expect(Living.equipRelic).toHaveBeenCalledWith(5, 1);
  });

  it("leases a vault relic to a state from the state card", () => {
    Object.assign(mocks.state.guild, {
      relics: [
        {
          id: 6,
          name: "Crown of the Vhaelen Emperors",
          category: "regalia",
          lore: "A symbol of legitimacy.",
          originYear: 812,
          bonuses: { s: 2 },
          holder: { kind: "vault" }
        }
      ]
    });
    mocks.state.recentNews = [
      { tick: 1, year: 1000, season: 0, kind: "develop", text: "Aeloria prospers.", cell: 1, stateId: 1 }
    ];
    LivingHud.open();
    document.querySelector<HTMLElement>("button.livingNewsItem")?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Lease Crown of the Vhaelen Emperors");

    inspector?.querySelector<HTMLElement>('[data-guild="lease"]')?.click();
    expect(Living.leaseRelic).toHaveBeenCalledWith(6, 1);
  });

  it("excavates a site instantly in Sandbox God Mode", () => {
    Object.assign(mocks.state.guild, { sandboxGodMode: true });
    pack.markers = [
      { i: 2, type: "necropolises", icon: "⚱️", x: 10, y: 10, cell: 1, name: "Barrow of Kings" }
    ] as unknown as typeof pack.markers;
    LivingHud.open();

    LivingHud.selectMarker(2);
    const inspector = document.getElementById("livingInspector");

    inspector?.querySelector<HTMLElement>('[data-god="excavate-marker"]')?.click();
    expect(Living.excavateMarker).toHaveBeenCalledWith(2);
    expect(document.getElementById("livingHudStatus")?.textContent).toContain("excavated instantly");
  });

  it("opens the dilemma card from a petition popup and decides it", () => {
    mocks.state.guild.popups = [
      {
        id: 3,
        kind: "guild_petition",
        cell: 1,
        title: "The Harsh Levy",
        subtitle: "Aeloria begs the Guild to put down the demagogue.",
        createdTick: 0,
        expiresAtTick: 5,
        provinceId: 1,
        stateId: 1,
        petitionId: "harsh_levy",
        rewardGold: 0,
        rewardRenown: 0
      }
    ];
    LivingHud.open();

    // clicking the popup opens the dilemma card instead of claiming a bounty
    document
      .querySelector<SVGElement>('.livingPopup[data-kind="guild_petition"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(Living.claimPopup).not.toHaveBeenCalled();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("The Harsh Levy");
    expect(inspector?.textContent).toContain("Fund the Militia");
    expect(inspector?.textContent).toContain("Let Them Squabble");

    inspector?.querySelector<HTMLElement>('[data-guild="petition"][data-choice="0"]')?.click();
    expect(Living.resolvePetition).toHaveBeenCalledWith(3, 0);
    expect(document.getElementById("livingHudStatus")?.textContent).toContain("the trouble was quelled");
  });

  it("lists awaiting petitions in the guild bar and opens one from its chip", () => {
    mocks.state.guild.popups = [
      {
        id: 4,
        kind: "guild_petition",
        cell: 1,
        title: "The Harsh Levy",
        subtitle: "Aeloria begs the Guild to put down the trouble.",
        createdTick: 0,
        expiresAtTick: 4,
        provinceId: 1,
        stateId: 1,
        petitionId: "harsh_levy",
        rewardGold: 0,
        rewardRenown: 0
      }
    ];
    LivingHud.open();

    const bar = document.getElementById("livingHudGuild");
    expect(bar?.textContent).toContain("Petitions:");
    expect(bar?.textContent).toContain("The Harsh Levy");

    bar?.querySelector<HTMLElement>('[data-guild="inspect-petition"]')?.click();

    const inspector = document.getElementById("livingInspector");
    expect(inspector?.textContent).toContain("Fund the Militia");
    expect(inspector?.textContent).toContain("Let Them Squabble");
  });

  it("shows the Wheel of Ages only when the age is ready to turn at the bottom right", () => {
    mocks.living.getEschaton.mockReturnValue(30);
    Object.assign(mocks.state.guild, { tier: 1 });
    LivingHud.open();

    // Wheel of ages button is removed when not ready
    expect(document.querySelector<HTMLButtonElement>("#livingHudGuild [data-wheel]")).toBeNull();
    // Eschaton clock is shown in top bar
    expect(document.getElementById("livingHudEschaton")?.textContent).toContain("⏳ 30");

    mocks.living.getEschaton.mockReturnValue(100);
    LivingHud.refresh();

    const wheel = document.querySelector<HTMLButtonElement>("#livingHudGuild [data-wheel]");
    expect(wheel).toBeTruthy();
    expect(wheel?.closest(".livingGuildBottomRight")).toBeTruthy();
    wheel?.click();

    expect(Living.turnAge).toHaveBeenCalled();
    expect(document.getElementById("livingHudStatus")?.textContent).toContain("The Second Age of Ash");
  });

  it("renders first livingGuildRow with left, center, and right sections", () => {
    LivingHud.open();
    const row = document.querySelector<HTMLElement>("#livingHudGuild .livingGuildHeaderRow");
    expect(row).toBeTruthy();
    expect(row?.querySelector(".livingGuildLeft")?.textContent).toContain("T2");
    expect(row?.querySelector(".livingGuildCenter")?.textContent).toContain("40g");
    expect(row?.querySelector(".livingGuildRight")?.textContent).toContain("Doctrine");
  });

  it("draws on-map bounty popups and claims one when clicked", () => {
    const popup = {
      id: 7,
      kind: "bounty_trouble",
      cell: 1,
      title: "Monsters in Northmarch",
      subtitle: "Level 5 trouble",
      createdTick: 0,
      expiresAtTick: 3,
      rewardGold: 32,
      rewardRenown: 3,
      provinceId: 1,
      stateId: 1
    };
    mocks.state.guild.popups = [popup];
    mocks.living.claimPopup.mockReturnValue(popup);

    LivingHud.open();

    const overlay = document.getElementById("livingOverlay");
    expect(overlay).toBeTruthy();

    const pin = overlay?.querySelector<SVGElement>('.livingPopup[data-popup-id="7"]');
    expect(pin).toBeTruthy();

    pin?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(Living.claimPopup).toHaveBeenCalledWith(7);
    expect(document.getElementById("livingHudStatus")?.textContent).toContain("Bounty claimed");
    expect(document.getElementById("livingHudStatus")?.textContent).toContain("+32g");

    const toasts = overlay?.querySelectorAll(".livingFloatBadge");
    expect(toasts?.length).toBe(1);
    expect(toasts?.[0].textContent).toContain("Monsters in Northmarch");
    expect(toasts?.[0].textContent).toContain("+32g");
  });
});
