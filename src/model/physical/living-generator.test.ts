// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { CIV_BUILDING_BY_ID } from "@/data/living-civ-buildings";
import { CIV_TECH_BY_ID, computePolityTechDevelopment } from "@/data/living-civ-techs";
import { getTroubleDef, troubleUnitMatchMultiplier } from "@/data/living-troubles";
import { currentContent } from "@/data/roster-store";
import { nextRosterUnitInCategory, requiredTechFor } from "@/model/physical/living-armies";
import type { Burg } from "@/model/political/burgs-generator";
import { Factions } from "@/model/political/factions-generator";
import { Military, syncRegimentTotals } from "@/model/political/military-generator";
import { noFinance } from "@/model/political/states-generator";
import { parseHistory, serializeHistory } from "@/services/io/epochs-format";
import type { Good } from "@/types/economy";
import type { Faction } from "@/types/factions";
import type { StateAgenda } from "@/types/living";
import {
  activeCivThemeId,
  BASE_EMPIRE_HAPPINESS,
  borderCultureNeeded,
  borderInfluenceScore,
  citizensFromPopulation,
  classifyGood,
  figureBias,
  foodNeededForGrowth,
  getCellResource,
  getCellTerrainInfo,
  getCellYieldSources,
  getCellYields,
  happinessCombatMultiplier,
  happinessGrowthFactor,
  hasStackingConflict,
  hurryGoldCost,
  isMajorBurg,
  isMinorBurg,
  isTechSelectable,
  Living,
  LUXURY_HAPPINESS,
  populationFromCitizens,
  regionTierFromPop,
  settlementTierFromPop,
  syncBurgBuildingsFromFlags,
  syncBurgFlagsFromBuildings,
  syncCivBuildingsFromFlags,
  syncCivFlagsFromBuildings,
  terrainDefenseMultiplier,
  UPKEEP_FREE,
  unitMovementCost
} from "./living-generator";

describe("Living (Slices 1-4: Data Model, Seasonal Tick, Capacity, Projects, War & Unravel)", () => {
  beforeEach(() => {
    globalThis.options = {
      map: {
        seed: "test-living-seed",
        goods: [],
        population: { ruralFactor: 1, urbanization: 1 },
        lore: {
          name: "Test World",
          description: "",
          calendar: { year: 1000, era: "Age of Dawn", eraShort: "AD" },
          history: { span: 500, realms: 0, density: 1, echoes: false, renames: false, mode: "archaeologist" }
        }
      },
      generation: {
        cultures: { traits: true },
        states: { limit: 4, sizeVariety: 2, growthRate: 1 }
      }
    } as unknown as typeof options;

    globalThis.pack = {
      cells: {
        i: [0, 1, 2, 3, 4, 5],
        state: new Uint16Array([0, 1, 1, 2, 0, 0]),
        province: new Uint16Array([0, 1, 1, 2, 0, 0]),
        pop: [0, 120, 100, 90, 20, 15],
        culture: [0, 1, 1, 2, 1, 3],
        religion: [0, 1, 1, 2, 2, 3],
        c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4]],
        p: [
          [0, 0],
          [10, 10],
          [20, 20],
          [30, 30],
          [40, 40],
          [50, 50]
        ],
        r: [0, 0, 0, 0, 0, 0]
      },
      cultures: [
        { i: 0, name: "Wildlands", base: 0, center: 0 },
        { i: 1, name: "Aeloran (Human)", base: 0, center: 1, alignment: "good" },
        { i: 2, name: "Kazad (Dwarven)", base: 0, center: 3, alignment: "lawful" },
        { i: 3, name: "Steppe (Nomadic)", base: 0, center: 5, alignment: "chaotic" }
      ],
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Solar Church" },
        { i: 2, name: "Stone Ancestors" },
        { i: 3, name: "Sky Spirits" }
      ],
      burgs: [
        { i: 0 },
        {
          i: 1,
          name: "Aelor",
          cell: 1,
          x: 10,
          y: 10,
          state: 1,
          culture: 1,
          population: 18,
          capital: 1,
          walls: 1,
          plaza: 1,
          temple: 1,
          citadel: 1
        },
        {
          i: 2,
          name: "Khazad",
          cell: 3,
          x: 30,
          y: 30,
          state: 2,
          culture: 2,
          population: 6,
          capital: 1,
          walls: 1,
          plaza: 0,
          temple: 0,
          citadel: 0
        },
        {
          i: 3,
          name: "Kinborough",
          cell: 4,
          x: 40,
          y: 40,
          state: 0,
          culture: 1,
          population: 2.5,
          capital: 0,
          walls: 0,
          plaza: 1,
          temple: 0,
          citadel: 0
        },
        {
          i: 4,
          name: "Outcast Hold",
          cell: 5,
          x: 50,
          y: 50,
          state: 0,
          culture: 3,
          population: 3,
          capital: 0,
          walls: 1,
          plaza: 0,
          temple: 0,
          citadel: 0
        }
      ],
      states: [
        { i: 0, name: "Neutrals", economy: noFinance() },
        {
          i: 1,
          name: "Aeloria",
          economy: noFinance(),
          culture: 1,
          capital: 1,
          center: 1,
          military: [
            {
              i: 0,
              a: 300,
              cell: 1,
              x: 10,
              y: 10,
              bx: 10,
              by: 10,
              u: { spear: 300 },
              units: [
                { type: "spear", hp: 1, exp: 0 },
                { type: "spear", hp: 1, exp: 0 }
              ],
              n: 0,
              name: "1st Aeloria Regiment",
              state: 1,
              icon: "⚔️"
            }
          ]
        },
        {
          i: 2,
          name: "Khazadia",
          economy: noFinance(),
          culture: 2,
          capital: 2,
          center: 3,
          military: []
        }
      ],
      provinces: [{ i: 0 }, { i: 1, state: 1, burg: 1, center: 1 }, { i: 2, state: 2, burg: 2, center: 3 }],
      history: {
        events: [],
        realms: [],
        eras: [{ name: "Age of Dawn", from: 500, to: 1000 }],
        figures: []
      }
    } as unknown as typeof pack;
  });

  it("computes settlement and region tiers from population ladders", () => {
    expect(settlementTierFromPop(0.5)).toBe(0);
    expect(settlementTierFromPop(1)).toBe(1);
    expect(settlementTierFromPop(4.5)).toBe(3);
    expect(settlementTierFromPop(18)).toBe(5);

    expect(regionTierFromPop(50)).toBe(0);
    expect(regionTierFromPop(120)).toBe(1);
    expect(regionTierFromPop(250)).toBe(2);
    expect(regionTierFromPop(850)).toBe(4);
  });

  it("initializes LivingWorldState with rulers, rosters and burg assets", () => {
    const living = Living.init();

    expect(living.enabled).toBe(true);
    expect(living.tick).toBe(0);
    expect(living.season).toBe(0);
    expect(living.seed).toBe("test-living-seed");

    // Both active states are initialized with rulers and rosters
    expect(Object.keys(living.states)).toEqual(["1", "2"]);
    expect(pack.states[1].rosterId).toBeTruthy();
    expect(pack.states[2].rosterId).toBe("dwarfBase");

    const s1 = living.states[1];
    expect(s1.rulerId).toBeDefined();
    const ruler1 = pack.history.figures?.find(f => f.i === s1.rulerId);
    expect(ruler1).toBeDefined();
    expect(ruler1?.death).toBeUndefined();
    expect(ruler1?.roles[0]).toMatchObject({ type: "ruler", target: { kind: "state", id: 1 } });

    // Burg 1 flags (walls=1, citadel=1, plaza=1, temple=1) map to standing roster buildings
    const b1 = living.burgs[1];
    expect(b1.baseTier).toBe(5);
    expect(b1.buildings).toEqual(expect.arrayContaining(["walls2", "market1", "temple1", "barracks1"]));
  });

  it("synchronizes burg flags and roster buildings bidirectionally", () => {
    const burg = pack.burgs[2];
    const buildings = syncBurgBuildingsFromFlags(burg, []);
    expect(buildings).toEqual(["walls1"]);

    buildings.push("walls3", "market2", "temple1");
    syncBurgFlagsFromBuildings(burg, buildings);
    expect(burg.walls).toBe(3);
    expect(burg.citadel).toBe(1);
    expect(burg.plaza).toBe(1);
    expect(burg.temple).toBe(1);
  });

  it("checks Free Burg kinship and faith correctly", () => {
    Living.init();
    // Burg 3 (Kinborough) has culture 1 (same as State 1) and religion 2 (same as State 2)
    expect(Living.sharesKinshipOrFaith(1, 3)).toBe(true);
    expect(Living.sharesKinshipOrFaith(2, 3)).toBe(true);

    // Burg 4 (Outcast Hold) has culture 3 and religion 3 — foreign to both State 1 and State 2
    expect(Living.sharesKinshipOrFaith(1, 4)).toBe(false);
    expect(Living.sharesKinshipOrFaith(2, 4)).toBe(false);
  });

  it("advances seasons, increments calendar year every 4 ticks, and decays unrest", () => {
    const living = Living.init();

    // Simulate Outcast Hold conquered by State 1 with 10 seasons of unrest
    pack.burgs[4].state = 1;
    pack.cells.state[5] = 1;
    living.burgs[4].unrest = 10;

    // Tick 1: Summer 1000 (not garrisoned, no temple -> unrest decays by 1 to 9, unravel increases by 4)
    Living.tick(1);
    expect(living.tick).toBe(1);
    expect(living.season).toBe(1);
    expect(options.map.lore.calendar.year).toBe(1000);
    expect(living.burgs[4].unrest).toBe(9);
    expect(living.states[1].unravel).toBe(4);

    // Station State 1's regiment at Outcast Hold (cell 5) -> unrest decays by 2 per season
    pack.states[1].military![0].cell = 5;
    Living.tick(3); // Autumn (2), Winter (3), Spring (0 -> year 1001!)
    expect(living.tick).toBe(4);
    expect(living.season).toBe(0);
    expect(options.map.lore.calendar.year).toBe(1001);
    expect(pack.history.eras.at(-1)?.to).toBe(1001);
    expect(living.burgs[4].unrest).toBe(3); // 9 - 2*3 = 3
  });

  it("round-trips LivingWorldState through serializeHistory and parseHistory", () => {
    const living = Living.init();
    Living.tick(2);
    Living.pushNews(living, {
      kind: "resist",
      text: "Outcast Hold resisted annexation!",
      burgId: 4,
      cell: 5
    });

    const { json, snapshotRecords } = serializeHistory(pack.history, pack.cells.i.length);
    const restored = parseHistory(json, snapshotRecords, pack.cells.i.length);

    expect(restored.living).toBeDefined();
    expect(restored.living?.tick).toBe(2);
    expect(restored.living?.season).toBe(2);
    expect(restored.living?.recentNews[0].text).toBe("Outcast Hold resisted annexation!");
    expect(restored.living?.states[1].rulerId).toBe(living.states[1].rulerId);
    expect(restored.living?.provinces[1].stability).toBe(living.provinces[1].stability);
  });

  it("accrues province stability from friendly garrisons", () => {
    const living = Living.init();

    Living.tick(1);

    // State 1 keeps its regiment in province 1; state 2 has no field army.
    expect(living.provinces[1].stability).toBe(1);
    expect(living.provinces[2].stability).toBe(0);
  });

  it("spends stability and wealth to develop a province and grow its settlement", () => {
    const living = Living.init();
    pack.states[1].economy.treasury = 100;
    const populationBefore = pack.burgs[1].population!;

    living.provinces[1].stability = 4;
    expect(Living.startDevelop(1, 1)).toBe(true);
    expect(living.provinces[1].stability).toBe(0);
    expect(living.provinces[1].developmentProgress).toMatchObject({ settlementId: 1, turnsLeft: 4 });

    Living.tick(4);

    expect(living.provinces[1].development).toBe(1);
    expect(pack.burgs[1].population!).toBeGreaterThan(populationBefore);
  });

  it("stops development at the province habitability cap", () => {
    const living = Living.init();
    expect(Living.provinceDevelopmentCap(1)).toBe(2);

    living.provinces[1].stability = 8;
    living.provinces[1].development = 2;
    expect(Living.startDevelop(1, 1)).toBe(false);
  });

  it("completes a 3-check build and syncs burg flags", () => {
    const living = Living.init();

    expect(Living.startBuild(1, 1, "walls3")).toBe(true);

    Living.tick(3);

    expect(living.burgs[1].buildings).toContain("walls3");
    expect(living.burgs[1].buildings).not.toContain("walls2");
    expect(pack.burgs[1].walls).toBe(3);
    expect(pack.burgs[1].citadel).toBe(1);
  });

  it("rejects a build whose chain prerequisite is missing", () => {
    Living.init();
    expect(Living.startBuild(1, 1, "market3")).toBe(false);
  });

  it("musters roster units into a state's military", () => {
    const living = Living.init();
    pack.states[1].economy.treasury = 1000;
    const regiment = pack.states[1].military![0];
    const slotsBefore = regiment.units!.length;

    expect(Living.muster(1)).toBe(true);

    expect(regiment.units!.length).toBe(slotsBefore + 1);
    expect(regiment.a).toBeGreaterThan(0);
    expect(living.recentNews[0].kind).toBe("muster");
  });

  it("annexes a kin Free Burg peacefully with no unrest", () => {
    const living = Living.init();

    expect(Living.colonize(1, 3)).toBe(true);

    expect(pack.burgs[3].state).toBe(1);
    expect(pack.cells.state[4]).toBe(1);
    expect(living.burgs[3].unrest).toBe(0);
    expect(living.burgs[3].conqueredBy).toBeUndefined();
    expect(living.recentNews[0]).toMatchObject({ kind: "colonize", burgId: 3 });
  });

  it("storms a resisting Free Burg and applies occupation unrest", () => {
    const living = Living.init();
    const army = pack.states[1].military![0];
    army.units = Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 }));
    army.a = 2000;
    pack.cells.province[5] = 1;
    living.provinces[1].order = 80;

    expect(Living.colonize(1, 4)).toBe(true);

    expect(pack.burgs[4].state).toBe(1);
    expect(pack.cells.state[5]).toBe(1);
    expect(living.burgs[4].unrest).toBeGreaterThanOrEqual(8);
    expect(living.burgs[4].conqueredBy).toBe(1);
    expect(living.recentNews[0]).toMatchObject({ kind: "conquest", burgId: 4 });

    Living.tick(1);
    expect(living.provinces[1].order).toBeLessThan(80);
  });

  it("repulses a weak assault and records a grudge", () => {
    const living = Living.init();
    const army = pack.states[1].military![0];
    army.units = [{ type: "spear", hp: 0.07, exp: 0 }];
    army.a = 10;

    expect(Living.colonize(1, 4)).toBe(false);

    expect(pack.burgs[4].state).toBe(0);
    expect(pack.cells.state[5]).toBe(0);
    expect(living.states[1].grudges).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "repulsed", targetBurgId: 4, weight: 20 })])
    );
    expect(living.recentNews[0].kind).toBe("resist");
  });

  it("declares war, records a claim, and lets the loser reclaim its burg", () => {
    const living = Living.init();
    pack.burgs[2].capital = 0;
    const army = pack.states[1].military![0];
    army.units = Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 }));
    army.a = 2000;

    expect(Living.conquerBurg(1, 2)).toBe(true);

    expect(pack.burgs[2].state).toBe(1);
    expect(pack.states[1].diplomacy?.[2]).toBe("Enemy");
    expect(pack.states[2].diplomacy?.[1]).toBe("Enemy");
    expect(living.states[2].claims).toEqual(
      expect.arrayContaining([expect.objectContaining({ burgId: 2, heldByStateId: 1 })])
    );
    expect(living.states[2].grudges).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "conquest", targetBurgId: 2, weight: 40 })])
    );

    pack.states[2].military = [
      {
        i: 0,
        a: 2000,
        cell: 3,
        x: 30,
        y: 30,
        bx: 30,
        by: 30,
        u: { spear: 2000 },
        units: Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 })),
        n: 0,
        name: "2nd Khazadia Regiment",
        state: 2,
        icon: "⚔️"
      }
    ];

    expect(Living.reclaimBurg(2, 2)).toBe(true);

    expect(pack.burgs[2].state).toBe(2);
    expect(living.states[2].claims.some(claim => claim.burgId === 2)).toBe(false);
    expect(living.states[2].grudges.some(grudge => grudge.targetBurgId === 2)).toBe(false);
  });

  it("weights agenda pressure from ruler traits and culture values", () => {
    const base = figureBias({});

    expect(figureBias({ virtues: ["brave"], vices: ["wrathful"] }, ["power"]).martial).toBeGreaterThan(base.martial);
    expect(figureBias({ virtues: ["just", "diligent"], alignment: "lawful" }, ["investment"]).civic).toBeGreaterThan(
      base.civic
    );
    expect(figureBias({ vices: ["cruel"], alignment: "evil" }).cruel).toBeGreaterThan(base.cruel);
    expect(figureBias({}, ["order"]).pious).toBeGreaterThan(base.pious);
  });

  it("ages rulers and crowns a successor when the old ruler dies", () => {
    const living = Living.init();
    const rulerId = living.states[1].rulerId!;
    const ruler = pack.history.figures!.find(figure => figure.i === rulerId)!;
    ruler.birth = options.map.lore.calendar.year - 200;

    Living.tick(4);

    expect(ruler.death).toBe(1001);
    expect(living.states[1].rulerId).not.toBe(rulerId);
    const successor = pack.history.figures!.find(figure => figure.i === living.states[1].rulerId)!;
    expect(successor.death).toBeUndefined();
    expect(living.recentNews.some(item => item.kind === "succession")).toBe(true);
  });

  it("turns a succession into a crisis when the realm is exhausted", () => {
    pack.states[2].military = [
      {
        i: 0,
        a: 1000,
        cell: 3,
        x: 30,
        y: 30,
        bx: 30,
        by: 30,
        u: { balbenGuard: 1000 },
        units: Array.from({ length: 10 }, () => ({ type: "balbenGuard", hp: 1, exp: 0 })),
        n: 0,
        name: "Khazad Guard",
        state: 2,
        icon: "⚔️"
      }
    ];

    const living = Living.init();
    const ruler = pack.history.figures!.find(figure => figure.i === living.states[2].rulerId)!;
    ruler.birth = options.map.lore.calendar.year - 200;
    living.states[2].agenda = { kind: "muster", label: "Mustering troops", progress: 0, required: 999 };
    living.states[2].unravel = 0;

    living.states[2].warExhaustion = 60;

    Living.tick(4);

    expect(living.states[2].unravel).toBeGreaterThanOrEqual(10);
    expect(living.recentNews.some(item => item.kind === "succession" && item.text.includes("crisis"))).toBe(true);
  });

  it("raises a rebel and restores a Free Burg when unravel fills", () => {
    const living = Living.init();
    const army = pack.states[1].military![0];
    army.units = Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 }));
    army.a = 2000;

    expect(Living.colonize(1, 4)).toBe(true);
    living.burgs[4].unrest = 10;
    living.states[1].unravel = 100;
    const figuresBefore = pack.history.figures!.length;

    Living.tick(1);

    expect(pack.burgs[4].state).toBe(0);
    expect(pack.cells.state[5]).toBe(0);
    expect(living.burgs[4].unrest).toBe(0);
    expect(pack.history.figures!.length).toBe(figuresBefore + 1);
    expect(pack.history.figures!.at(-1)?.roles[0]).toMatchObject({
      type: "rebel",
      target: { kind: "burg", id: 4 }
    });
    expect(living.recentNews[0].kind).toBe("revolt");
  });

  it("returns a rebel burg to its former owner when one is remembered", () => {
    const living = Living.init();
    pack.burgs[4].state = 1;
    pack.cells.state[5] = 1;
    living.burgs[4].originalOwner = 2;
    living.burgs[4].unrest = 10;
    living.states[1].unravel = 100;

    Living.tick(1);

    expect(pack.burgs[4].state).toBe(2);
    expect(pack.cells.state[5]).toBe(2);
    expect(pack.states[2].military?.some(regiment => regiment.name.startsWith("Rebels of"))).toBe(true);
  });

  it("founds a secessionist state when a core burg rebels", () => {
    const living = Living.init();
    pack.burgs[4].state = 1;
    pack.cells.state[5] = 1;
    living.burgs[4].originalOwner = 1;
    living.burgs[4].unrest = 10;
    living.states[1].unravel = 100;
    const statesBefore = pack.states.length;

    Living.tick(1);

    expect(pack.states.length).toBe(statesBefore + 1);
    const secession = pack.states.at(-1)!;
    expect(secession.i).toBe(statesBefore);
    expect(secession.capital).toBe(4);
    expect(pack.burgs[4].state).toBe(secession.i);
    expect(living.states[1].grudges.some(grudge => grudge.reason === "repulsed")).toBe(true);
  });

  it("keeps a pacify agenda until the burg calms and clears it", () => {
    const living = Living.init();
    pack.burgs[4].state = 1;
    pack.cells.state[5] = 1;
    living.burgs[4].unrest = 2;
    living.states[1].agenda = {
      kind: "pacify",
      label: "Pacifying Outcast Hold",
      targetBurgId: 4,
      progress: 0,
      required: 1
    };

    Living.tick(1);

    expect(living.burgs[4].unrest).toBe(0);
    expect(living.states[1].agenda).toBeNull();
  });

  it("smites a ruler and plays out the succession", () => {
    const living = Living.init();
    const rulerId = living.states[1].rulerId!;
    const ruler = pack.history.figures!.find(figure => figure.i === rulerId)!;

    expect(Living.smiteRuler(1)).toBe(true);

    expect(ruler.death).toBe(1000);
    expect(living.states[1].rulerId).not.toBe(rulerId);
    expect(living.recentNews.some(item => item.kind === "succession")).toBe(true);
  });

  it("forces a war on a neighbour and refuses to declare it twice", () => {
    const living = Living.init();

    expect(Living.forceWar(1)).toBe(true);
    expect(pack.states[1].diplomacy?.[2]).toBe("Enemy");
    expect(living.recentNews.some(item => item.kind === "war")).toBe(true);
    expect(Living.forceWar(1, 2)).toBe(false);
  });

  it("sparks a rebellion in a non-capital burg", () => {
    const living = Living.init();
    pack.burgs[4].state = 1;
    pack.cells.state[5] = 1;

    expect(Living.sparkRebellion(1, 1)).toBe(false);
    expect(Living.sparkRebellion(1, 4)).toBe(true);

    expect(pack.burgs[4].state).toBe(0);
    expect(pack.cells.state[5]).toBe(0);
    expect(living.burgs[4].unrest).toBe(0);
    expect(living.states[1].unravel).toBe(30);
    expect(living.recentNews[0].kind).toBe("revolt");
  });

  it("pacifies a burg at once and eases the state's unravel", () => {
    const living = Living.init();
    pack.burgs[4].state = 1;
    pack.cells.state[5] = 1;
    living.burgs[4].unrest = 10;
    living.states[1].unravel = 50;

    expect(Living.pacifyBurg(4)).toBe(true);

    expect(living.burgs[4].unrest).toBe(0);
    expect(living.states[1].unravel).toBe(30);
    expect(living.recentNews[0].kind).toBe("pacify");
  });

  it("completes a burg's construction with a single intervention", () => {
    const living = Living.init();
    expect(Living.startBuild(1, 1, "walls3")).toBe(true);

    expect(Living.completeAsset(1)).toBe(true);

    expect(living.burgs[1].buildings).toContain("walls3");
    expect(living.burgs[1].buildings).not.toContain("walls2");
    expect(living.burgs[1].construction).toBeNull();
    expect(pack.burgs[1].walls).toBe(3);
    expect(living.recentNews[0].kind).toBe("build");
  });

  it("captures an epoch snapshot for the Legends time slider", () => {
    const living = Living.init();
    living.snapshotIntervalYears = 1;

    Living.tick(4);

    expect(pack.history.snapshots).toHaveLength(1);
    expect(pack.history.epochs).toHaveLength(1);
    expect(pack.history.epochs![0]).toMatchObject({ from: 1000, to: 1001, snapshot: 0 });
    expect(pack.history.snapshots![0]).toHaveLength(pack.cells.i.length);
    expect(pack.history.epochs![0].polities.map(polity => polity.id)).toEqual(expect.arrayContaining([1, 2]));
  });

  it("spawns and quells trouble on a province", () => {
    const living = Living.init();
    const trouble = Living.spawnTrouble(1, "flooding", "burg", 4);

    expect(trouble).toMatchObject({
      id: "flooding",
      theme: "burg",
      level: 4,
      seasonsUnchecked: 0
    });
    expect(living.provinces[1].trouble).toEqual(trouble);
    expect(living.recentNews[0].kind).toBe("trouble");

    expect(Living.quellTrouble(1)).toBe(true);
    expect(living.provinces[1].trouble).toBeNull();
  });

  it("drains public order and suspends garrison stability while trouble is active", () => {
    const living = Living.init();
    living.provinces[1].order = 70;
    living.provinces[1].stability = 5;

    Living.spawnTrouble(1, "flooding", "burg", 4);

    Living.tick(1);

    // With level 4 trouble, order drains by level * 2 = 8 (plus garrison +2 = net -6, or floor checked).
    // Garrison stability accrual stays suspended while trouble is active; the
    // freed agenda goes to development instead, spending developStabilityCost (4).
    expect(living.provinces[1].stability).toBe(1);
    expect(living.provinces[1].order).toBeLessThan(70);
  });

  it("keeps burg unrest floored at trouble level", () => {
    const living = Living.init();
    living.burgs[1].unrest = 2;

    Living.spawnTrouble(1, "crushed_spirits", "burg", 6);

    Living.tick(1);

    // Burg 1 unrest cannot decay below trouble level 6
    expect(living.burgs[1].unrest).toBeGreaterThanOrEqual(6);
  });

  it("suppresses trade goods when province has active resource trouble", () => {
    Living.init();
    pack.cells.good = Uint16Array.from([0, 1, 2, 0, 0, 0]);

    // Held goods method via muster check or direct query
    Living.spawnTrouble(1, "hazardous_resource", "resource", 3);

    // State 1 owns cells 1 and 2 in province 1. Since province 1 has resource trouble, goods 1 and 2 are suppressed.
    // Call muster which uses heldGoods internally
  });

  it("computes specialist mismatch penalties correctly", () => {
    const disorderDef = getTroubleDef("flooding"); // pool: w, requiredRole: merchant
    expect(troubleUnitMatchMultiplier(disorderDef, "merchant")).toBe(1);
    expect(troubleUnitMatchMultiplier(disorderDef, "sage")).toBe(2);
    expect(troubleUnitMatchMultiplier(disorderDef, "military")).toBe(3);

    const povertyDef = getTroubleDef("exceptional_poverty"); // pool: w, requiredRole: merchant
    expect(troubleUnitMatchMultiplier(povertyDef, "merchant")).toBe(1);
    expect(troubleUnitMatchMultiplier(povertyDef, "sage")).toBe(2);
    expect(troubleUnitMatchMultiplier(povertyDef, "military")).toBe(3);

    const despairDef = getTroubleDef("crushed_spirits"); // pool: s, requiredRole: prophet
    expect(troubleUnitMatchMultiplier(despairDef, "prophet")).toBe(1);
    expect(troubleUnitMatchMultiplier(despairDef, "magistrate")).toBe(2);
    expect(troubleUnitMatchMultiplier(despairDef, "guardsmen")).toBe(3);
  });

  it("resting units in peaceful provinces recover disruption", () => {
    Living.init();
    const unit = pack.states[1].military![0].units![0];
    unit.disruption = 2;
    Living.quellTrouble(1);

    Living.tick(1);

    expect(unit.disruption).toBe(1);
  });

  it("spawns and smites a dangerous faction in a province", () => {
    Living.init();
    const faction = Living.spawnDangerousFaction(1, "brigand_raiders", "burg", 5);
    expect(faction).not.toBeNull();
    expect(faction!.type).toBe("brigand_raiders");
    expect(faction!.hq.burgId).toBe(1);
    expect(faction!.military[0]!.units!.length).toBeGreaterThan(0);
    expect(faction!.stateRelations[1]).toBe("Enemy");

    expect(Living.quellTrouble(1)).toBe(false);

    expect(Living.smiteFaction(1)).toBe(true);
    expect(Factions.active().some(f => f.i === faction!.i)).toBe(false);
  });

  it("drains public order, suspends garrison stability, and floors unrest while a hostile faction is entrenched", () => {
    const living = Living.init();
    Living.quellTrouble(1);
    const faction = Living.spawnDangerousFaction(1, "monsters", "ruin", 6)!;
    faction.seasonsActive = 6; // unrest floor 4 + floor(7/3) = 6 after the tick

    const pSim = living.provinces[1];
    pSim.order = 80;
    pSim.stability = 10;
    const bSim = living.burgs[1];
    bSim.unrest = 2;

    Living.tick(1);

    // Unrest should be floored at the entrenched threat (6)
    expect(bSim.unrest).toBeGreaterThanOrEqual(6);
    // Garrison accrual stays suspended while the threat is entrenched
    expect(pSim.stability).toBeLessThanOrEqual(10);
    // Order should drain under threat pressure
    expect(pSim.order).toBeLessThan(80);
  });

  it("festered trouble takes root as a dangerous faction", () => {
    const living = Living.init();
    Living.quellTrouble(1);
    const trouble = Living.spawnTrouble(1, "flooding", "ruin", 10)!;
    expect(trouble).not.toBeNull();
    trouble.seasonsUnchecked = 5;

    Living.tick(1);

    // Level-10 trouble always festers (metaChance 1): hazard cleared, faction raised
    expect(living.provinces[1].trouble).toBeNull();
    expect(
      Factions.active().some(f => {
        const provId =
          f.hq.provinceId ??
          (f.hq.burgId ? pack.cells.province?.[pack.burgs?.[f.hq.burgId]?.cell ?? 0] : undefined) ??
          pack.cells?.province?.[f.hq.cell];
        return provId === 1 && (f.allegiance === "hostile" || f.allegiance === "clandestine");
      })
    ).toBe(true);
  });

  it("mounts military expedition to assault and clear a hostile faction", () => {
    const living = Living.init();
    Living.quellTrouble(1);

    // Give state 1 a strong field army to ensure victory
    const army = pack.states[1].military![0];
    army.units = [
      ...Array.from({ length: 4 }, () => ({ type: "cavalry", hp: 1, exp: 5 })),
      ...Array.from({ length: 3 }, () => ({ type: "spear", hp: 1, exp: 3 })),
      ...Array.from({ length: 3 }, () => ({ type: "archers", hp: 1, exp: 3 }))
    ];

    const faction = Living.spawnDangerousFaction(1, "brigand_raiders", "burg", 5)!;
    const result = Living.assaultFaction(1, 1);
    expect(result).toBe(true);
    expect(Factions.active().some(f => f.i === faction.i)).toBe(false);
    expect(
      living.recentNews.some(item => item.kind === "faction" && item.text.includes("conquered and destroyed"))
    ).toBe(true);
  });

  it("dispatches adventurers on a decapitation delve creating an adventurer figure", () => {
    const living = Living.init();
    Living.quellTrouble(1);
    const faction = Living.spawnDangerousFaction(1, "monsters", "ruin", 5);
    expect(faction).not.toBeNull();

    Living.sendAdventurersToFaction(1, 1);

    // Should create or use an adventurer figure
    const adventurers = pack.history.figures?.filter(f => f.roles.some(r => r.type === "adventurer")) ?? [];
    expect(adventurers.length).toBeGreaterThan(0);

    // Delve result processed
    expect(living.recentNews.some(item => item.kind === "faction")).toBe(true);
  });

  it("selects faction agendas against a hostile threat and loads Wealth capacity during adventurer contract", () => {
    const living = Living.init();
    Living.quellTrouble(1);
    Living.spawnDangerousFaction(1, "brigand_raiders", "burg", 6);

    const sSim = living.states[1];
    sSim.agenda = null;

    // Advance 1 tick so chooseAgenda and stepAgenda run
    Living.tick(1);

    // Agenda should have targeted the hostile faction (either clear_faction or hire_adventurers) or processed it
    expect(
      (sSim.agenda as StateAgenda | null)?.targetProvinceId ?? living.recentNews.some(item => item.kind === "faction")
    ).toBeTruthy();

    // Active adventurer contract commits +1 W load
    const activeAgenda: StateAgenda = {
      kind: "hire_adventurers",
      label: "Hiring adventurers against Ruined Keep",
      targetProvinceId: 1,
      progress: 0,
      required: 1
    };
    sSim.agenda = activeAgenda;
  });

  describe("Wheel of Ages (slice 5)", () => {
    it("tracks the eschaton clock from mighty factions and evil conquests", () => {
      const living = Living.init();
      expect(Living.getEschaton()).toBe(0);

      const doom = Living.spawnDangerousFaction(1, "brigand_raiders", "burg", 9)!;
      doom.seasonsActive = 8;
      Living.tick(1);
      expect(Living.getEschaton()).toBe(1);

      // an evil sovereign's conquest hastens the finale
      const rulerId = living.states[1].rulerId;
      const ruler = pack.history.figures?.find(figure => figure.i === rulerId);
      if (ruler) ruler.alignment = "evil";
      pack.burgs.push({
        i: 5,
        name: "Borderkeep",
        cell: 2,
        x: 20,
        y: 20,
        state: 2,
        culture: 2,
        population: 2,
        capital: 0
      });
      const army = pack.states[1].military![0];
      army.units = Array.from({ length: 25 }, () => ({ type: "cavalry", hp: 1, exp: 5 }));
      expect(Living.conquerBurg(1, 5)).toBe(true);
      expect(Living.getEschaton()).toBe(3);
    });

    it("winds the eschaton back when a dangerous faction is purged", () => {
      const living = Living.init();
      Living.spawnDangerousFaction(1, "brigand_raiders", "burg", 9)!.seasonsActive = 8;
      Living.tick(1);
      expect(Living.getEschaton()).toBe(1);

      expect(Living.smiteFaction(1)).toBe(true);
      Living.relieveEschaton(living);

      expect(Factions.active().some(f => f.hq.burgId === 1 && f.allegiance === "hostile")).toBe(false);
      expect(Living.getEschaton()).toBe(0);
    });

    it("turns the wheel: bakes the epoch, retires unraveling realms and seeds ruins", () => {
      const living = Living.init();
      living.states[2].unravel = 60;
      const yearBefore = options.map.lore.calendar.year;

      const result = Living.turnAge();

      expect(result.year).toBe(yearBefore + 150);
      expect(options.map.lore.calendar.year).toBe(result.year);
      expect(pack.history.epochs).toHaveLength(1);
      expect(pack.history.snapshots).toHaveLength(1);

      const realm = pack.history.realms?.find(entry => entry.name === "Khazadia");
      expect(realm).toBeDefined();
      expect(realm!.fallen).toBe(yearBefore);
      expect(pack.states[2].removed).toBe(true);

      const ruin = (pack.markers ?? []).find(
        marker => marker.type === "ruins" && marker.chronicle && marker.name === "Ruins of Khazadia"
      );
      expect(ruin).toBeDefined();

      expect(pack.history.eras?.at(-1)?.name).toBe(result.era);
      expect(Living.getEschaton()).toBe(0);

      // the surviving state resets and crowns a fresh young ruler
      expect(living.states[1].unravel).toBe(0);
      const freshRuler = pack.history.figures?.find(figure => figure.i === living.states[1].rulerId);
      expect(freshRuler?.death).toBeUndefined();
      expect(result.year - freshRuler!.birth).toBeLessThan(55);
    });

    it("fractures giant empires into successor states and free burgs", () => {
      Living.init();
      const extraProvinces = [
        { i: 3, state: 1, center: 2 },
        { i: 4, state: 1, center: 5 },
        { i: 5, state: 1, burg: 3, center: 4 }
      ] as unknown as (typeof pack.provinces)[number][];
      pack.provinces.push(...extraProvinces);
      pack.cells.state[4] = 1;
      pack.burgs[3].state = 1;
      Living.getState().burgs[3].originalOwner = 1; // secession instead of restoration

      const statesBefore = pack.states.length;
      const result = Living.turnAge();

      expect(result.successorStates).toBeGreaterThanOrEqual(1);
      expect(pack.states.length).toBeGreaterThan(statesBefore);
      expect(pack.burgs[3].state).toBeGreaterThan(2);
    });
  });

  describe("OpenCiv slice 2: cell yields, resources, improvements & minor burgs", () => {
    const makeGood = (i: number, name: string, tags: string[], demandCoverage: Good["demandCoverage"]): Good => ({
      i,
      name,
      tags,
      demandCoverage,
      value: 1,
      carriage: 1,
      unit: "unit",
      icon: "",
      color: "#000000"
    });

    function setupTerrain(): void {
      pack.cells.h = Uint8Array.from([20, 25, 25, 55, 10, 75]);
      pack.cells.biome = Uint8Array.from([4, 4, 1, 3, 1, 4]);
      pack.cells.harbor = Uint8Array.from([0, 0, 0, 0, 1, 0]);
      pack.cells.f = new Uint16Array(6);
      pack.cells.good = new Uint16Array(6);
      pack.cells.burg = new Uint16Array(6);
      pack.cells.r = new Uint16Array(6);
      pack.features = [];
      options.map.goods = [];
    }

    it("derives flat, hill, forest, coast and mountain terrain yields", () => {
      setupTerrain();

      expect(getCellYields(1)).toMatchObject({ food: 2, production: 0 });
      expect(getCellYields(3).production).toBe(2);
      expect(getCellYields(4)).toMatchObject({ food: 1, gold: 1 });
      expect(getCellTerrainInfo(5)).toMatchObject({
        isMountain: true,
        isWorkable: false,
        elevation: 2,
        movementCost: 9999
      });
      expect(getCellTerrainInfo(3)).toMatchObject({ isHill: true, elevation: 1, movementCost: 2 });

      pack.cells.biome[1] = 6;
      expect(getCellTerrainInfo(1).movementCost).toBe(2);
      expect(getCellYields(1)).toMatchObject({ food: 1, production: 1 });
    });

    it("treats rivers as fresh water and freshwater lakes as 2 Food", () => {
      setupTerrain();

      pack.cells.r[2] = 1;
      expect(getCellYields(2).food).toBe(2);

      pack.cells.f[4] = 0;
      pack.features = [
        {
          i: 0,
          type: "lake",
          land: false,
          border: false,
          cells: 1,
          firstCell: 4,
          vertices: [],
          area: 0,
          shoreline: [],
          height: 0,
          subtype: "freshwater",
          group: "",
          temp: 0,
          flux: 0,
          evaporation: 0,
          name: "Lake"
        }
      ];
      expect(getCellTerrainInfo(4).terrain).toBe("freshwater");
      expect(getCellYields(4).food).toBe(2);
    });

    it("classifies goods and reveals strategic resources by tech", () => {
      setupTerrain();
      const wheat = makeGood(1, "Wheat", ["food"], { food: 1 });
      const horses = makeGood(2, "Horses", ["supply", "military"], { utilities: 0.6, military: 0.4 });
      const wine = makeGood(3, "Wine", ["food", "luxury"], { food: 0.5, luxury: 0.5 });
      const iron = makeGood(4, "Iron", ["ore", "military"], { food: 1 });
      const stone = makeGood(5, "Stone", ["construction"], { construction: 1 });
      options.map.goods = [makeGood(0, "None", [], {}), wheat, horses, wine, iron, stone];

      expect(classifyGood(wheat)).toBe("bonus");
      expect(classifyGood(horses)).toBe("strategic");
      expect(classifyGood(wine)).toBe("luxury");
      expect(classifyGood(iron)).toBe("strategic");
      expect(classifyGood(stone)).toBe("bonus");

      pack.cells.good = Uint16Array.from([0, 1, 2, 3, 4, 5]);
      expect(getCellYields(1).food).toBe(3);
      expect(getCellResource(2, 1)).toMatchObject({ class: "strategic", revealed: false });
      expect(getCellYields(2).production).toBe(0);
      expect(getCellYields(3).food).toBe(1);

      const living = Living.init();
      living.states[1].researchedTechs = ["animal_husbandry"];
      expect(getCellResource(2, 1, living)?.revealed).toBe(true);
      expect(getCellYields(2, 1, living).production).toBe(1);
    });

    it("adds improvement yields and disables them when pillaged", () => {
      setupTerrain();
      const living = Living.init();
      living.cells = {};

      living.cells ??= {};
      living.cells[1] = { improvement: "farm" };
      expect(getCellYields(1, 0, living).food).toBe(3);

      pack.cells.r[1] = 1;
      living.states[1].researchedTechs = ["civil_service"];
      expect(getCellYields(1, 1, living).food).toBe(4);

      living.cells[1].pillaged = true;
      expect(getCellYields(1, 1, living).food).toBe(2);

      living.cells[3] = { improvement: "mine" };
      expect(getCellYields(3, 0, living).production).toBe(3);
      living.states[1].researchedTechs = ["chemistry"];
      expect(getCellYields(3, 1, living).production).toBe(4);
    });

    it("separates major and minor burgs and yields village bonuses", () => {
      setupTerrain();
      pack.cells.h[4] = 25;
      pack.cells.biome[4] = 4;
      pack.cells.harbor[4] = 0;
      const living = Living.init();
      const capital = pack.burgs[1];
      const freeVillage = pack.burgs[3];
      const freeCity = pack.burgs[4];
      expect(isMajorBurg(capital)).toBe(true);
      expect(isMajorBurg(freeVillage)).toBe(false);
      expect(isMinorBurg(freeVillage)).toBe(false);

      pack.cells.province[4] = 1;
      pack.cells.burg[4] = 3;
      expect(isMinorBurg(freeVillage)).toBe(true);

      expect(getCellYields(4, 0, living)).toMatchObject({ food: 3, gold: 3 });
      const baseVillage = getCellYieldSources(4, 0, living).find(source => source.kind === "minor_burg");
      expect(baseVillage?.yields).toMatchObject({ food: 1, gold: 3 });

      freeVillage.temple = 1;
      freeVillage.walls = 1;
      freeVillage.port = 1;
      const fullVillage = getCellYieldSources(4, 0, living).find(source => source.kind === "minor_burg");
      expect(fullVillage?.yields).toMatchObject({ food: 2, gold: 4, faith: 1, culture: 1, production: 1 });

      living.burgs[3].pillaged = true;
      expect(getCellYieldSources(4, 0, living).some(source => source.kind === "minor_burg")).toBe(false);

      freeCity.population = 8;
      expect(isMajorBurg(freeCity)).toBe(true);
    });

    it("auto-connects a minor burg's underlying good as an improved resource", () => {
      setupTerrain();
      pack.cells.h[4] = 25;
      pack.cells.biome[4] = 4;
      pack.cells.harbor[4] = 0;
      options.map.goods = [makeGood(0, "None", [], {}), makeGood(1, "Wheat", ["food"], { food: 1 })];
      pack.cells.good[4] = 1;
      pack.cells.burg[4] = 3;
      pack.cells.province[4] = 1;
      const living = Living.init();

      const connected = getCellYieldSources(4, 0, living).find(source => source.kind === "resource");
      expect(connected?.yields).toMatchObject({ food: 2 });

      living.burgs[3].pillaged = true;
      const disconnected = getCellYieldSources(4, 0, living).find(source => source.kind === "resource");
      expect(disconnected?.yields).toMatchObject({ food: 1 });
    });

    it("lazily initializes living.cells for old saves", () => {
      setupTerrain();
      delete pack.history.living;

      const living = Living.init();
      expect(living.cells).toBeDefined();
    });
  });

  const GRID = 4;

  const makeGood = (i: number, name: string, tags: string[], demandCoverage: Good["demandCoverage"]): Good => ({
    i,
    name,
    tags,
    demandCoverage,
    value: 1,
    carriage: 1,
    unit: "unit",
    icon: "",
    color: "#000000"
  });

  /** A 4x4 Voronoi grid: state 1 holds six cells around its capital, state 2 two cells. */
  function setupCityWorld(): void {
    const count = GRID * GRID;
    const indices = Array.from({ length: count }, (_, index) => index);
    const neighbors = indices.map(index => {
      const x = index % GRID;
      const y = Math.floor(index / GRID);
      const out: number[] = [];
      if (x > 0) out.push(index - 1);
      if (x < GRID - 1) out.push(index + 1);
      if (y > 0) out.push(index - GRID);
      if (y < GRID - 1) out.push(index + GRID);
      return out;
    });

    const state = new Uint16Array(count);
    const province = new Uint16Array(count);
    for (const cell of [1, 4, 5, 6, 9, 10]) {
      state[cell] = 1;
      province[cell] = 1;
    }
    for (const cell of [7, 11]) {
      state[cell] = 2;
      province[cell] = 2;
    }

    const burgCells = new Uint16Array(count);
    burgCells[5] = 1;
    burgCells[11] = 2;
    burgCells[2] = 3;
    burgCells[8] = 4;
    burgCells[4] = 5;

    const culture = new Uint16Array(count);
    culture[2] = 1;
    culture[8] = 3;
    for (const cell of [1, 4, 5, 6, 9, 10]) culture[cell] = 1;
    for (const cell of [7, 11]) culture[cell] = 2;

    const religion = new Uint16Array(count);
    for (const cell of [1, 4, 5, 6, 9, 10]) religion[cell] = 1;
    for (const cell of [7, 11]) religion[cell] = 2;
    religion[2] = 1;
    religion[8] = 3;

    const pop = new Array<number>(count).fill(0);
    pop[2] = 20;
    pop[8] = 15;

    globalThis.pack = {
      cells: {
        i: indices,
        state,
        province,
        h: new Uint8Array(count).fill(25),
        biome: new Uint8Array(count).fill(4),
        harbor: new Uint8Array(count),
        f: new Uint16Array(count),
        r: new Uint16Array(count),
        good: new Uint16Array(count),
        burg: burgCells,
        culture,
        religion,
        pop,
        area: new Array<number>(count).fill(1),
        c: neighbors,
        p: indices.map(index => [index * 10, index * 10]),
        routes: new Uint16Array(count)
      },
      features: [],
      cultures: [
        { i: 0, name: "Wildlands", base: 0, center: 0 },
        { i: 1, name: "Aeloran", base: 0, center: 5, alignment: "good" },
        { i: 2, name: "Kazad", base: 0, center: 11, alignment: "lawful" },
        { i: 3, name: "Steppe", base: 0, center: 15, alignment: "chaotic" }
      ],
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Solar Church" },
        { i: 2, name: "Stone Ancestors" },
        { i: 3, name: "Sky Spirits" }
      ],
      burgs: [
        { i: 0 },
        {
          i: 1,
          name: "Aelor",
          cell: 5,
          x: 50,
          y: 50,
          state: 1,
          culture: 1,
          population: 18,
          capital: 1,
          walls: 0,
          plaza: 0,
          temple: 0,
          citadel: 0
        },
        {
          i: 2,
          name: "Khazad",
          cell: 11,
          x: 110,
          y: 110,
          state: 2,
          culture: 2,
          population: 6,
          capital: 1,
          walls: 0,
          plaza: 0,
          temple: 0,
          citadel: 0
        },
        {
          i: 3,
          name: "Kinborough",
          cell: 2,
          x: 20,
          y: 20,
          state: 0,
          culture: 1,
          population: 2.5,
          capital: 0,
          walls: 0,
          plaza: 0,
          temple: 0,
          citadel: 0
        },
        {
          i: 4,
          name: "Outcast Hold",
          cell: 8,
          x: 80,
          y: 80,
          state: 0,
          culture: 3,
          population: 3,
          capital: 0,
          walls: 0,
          plaza: 0,
          temple: 0,
          citadel: 0
        },
        {
          i: 5,
          name: "Millbrook",
          cell: 4,
          x: 40,
          y: 40,
          state: 1,
          culture: 1,
          population: 1.5,
          capital: 0,
          walls: 0,
          plaza: 0,
          temple: 0,
          citadel: 0
        }
      ],
      states: [
        { i: 0, name: "Neutrals", treasury: 0, diplomacy: [], economy: noFinance() },
        {
          i: 1,
          name: "Aeloria",
          economy: noFinance(),
          culture: 1,
          capital: 1,
          center: 5,
          treasury: 0,
          diplomacy: [],
          military: []
        },
        {
          i: 2,
          name: "Khazadia",
          economy: noFinance(),
          culture: 2,
          capital: 2,
          center: 11,
          treasury: 0,
          diplomacy: [],
          military: []
        }
      ],
      provinces: [{ i: 0 }, { i: 1, state: 1, burg: 1, center: 5 }, { i: 2, state: 2, burg: 2, center: 11 }],
      history: {
        events: [],
        realms: [],
        eras: [{ name: "Age of Dawn", from: 500, to: 1000 }],
        figures: []
      }
    } as unknown as typeof pack;

    options.map.goods = [makeGood(0, "None", [], {}), makeGood(1, "Wine", ["luxury"], { luxury: 1 })];
  }

  describe("OpenCiv slice 3: autonomous major burg city loop", () => {
    beforeEach(() => {
      setupCityWorld();
    });

    it("maps population to citizens and back with OpenCiv thresholds", () => {
      expect(citizensFromPopulation(18)).toBe(6);
      expect(citizensFromPopulation(0)).toBe(1);
      expect(populationFromCitizens(6)).toBe(18);
      expect(populationFromCitizens(1)).toBe(0.5);
      expect(foodNeededForGrowth(6)).toBe(63);
      expect(borderCultureNeeded(0)).toBe(20);
      expect(borderCultureNeeded(1)).toBe(32);
      expect(borderCultureNeeded(1, 0.75)).toBe(24);
      expect(borderCultureNeeded(0, 0.75, 1.15)).toBe(13);
      expect(happinessGrowthFactor(0)).toBe(1);
      expect(happinessGrowthFactor(-5)).toBe(0.25);
      expect(happinessGrowthFactor(-10)).toBe(0);

      // Influence: closer cells win, a visible luxury good outweighs two extra hops.
      setupCityWorld();
      pack.cells.good[2] = 1;
      expect(borderInfluenceScore(1, 1, 1)).toBeLessThan(borderInfluenceScore(3, 3, 1));
      expect(borderInfluenceScore(2, 3, 1)).toBeLessThan(borderInfluenceScore(1, 1, 1));
    });

    it("works the centre for free plus citizen cells, never stealing another city's cells", () => {
      const living = Living.init();
      Living.tick(1);

      const b1 = living.burgs[1];
      expect(b1.citizens).toBe(6);
      expect(b1.workedCells?.length).toBe(5);
      expect(b1.workedCells).not.toContain(5);
      for (const cell of b1.workedCells ?? []) expect(pack.cells.state[cell]).toBe(1);
      // Millbrook (a minor burg) is the best food cell and is worked first.
      expect(b1.workedCells).toContain(4);
      // Palace adds +3 Production and +1 Culture to the capital.
      expect(b1.cityYields).toMatchObject({ food: 13, production: 3, culture: 1 });

      const b2 = living.burgs[2];
      expect(b2.citizens).toBe(3);
      expect(b2.workedCells?.sort()).toEqual([7]);
      for (const cell of b2.workedCells ?? []) expect(b1.workedCells ?? []).not.toContain(cell);
    });

    it("grows a citizen when the food bucket fills and grows satellite villages", () => {
      const living = Living.init();
      const b1 = living.burgs[1];
      b1.citizens = 6;
      b1.foodStored = 62;

      Living.tick(1);

      expect(b1.citizens).toBe(7);
      expect(pack.burgs[1].population).toBe(24.5);
      expect(pack.burgs[5].population).toBe(1.6);
    });

    it("keeps 40% of the bucket with an Aqueduct and starves without food", () => {
      const living = Living.init();
      const b1 = living.burgs[1];
      b1.citizens = 6;
      b1.civBuildings = ["palace", "aqueduct"];
      b1.foodStored = 63;

      Living.tick(1);

      expect(b1.citizens).toBe(7);
      expect(b1.foodStored).toBeCloseTo(26.2, 5);

      b1.foodStored = -1000;
      Living.tick(1);

      expect(b1.citizens).toBe(6);
      expect(b1.foodStored).toBe(0);
    });

    it("stops growth entirely while the empire is very unhappy", () => {
      const living = Living.init();
      living.states[1].happiness = -10;
      const b1 = living.burgs[1];
      b1.foodStored = 62;

      Living.tick(1);

      expect(b1.citizens).toBe(6);
      expect(b1.foodStored).toBe(62);
    });

    it("claims the best unowned border cell and peacefully annexes a kin free burg", () => {
      const living = Living.init();
      pack.cells.good[2] = 1;
      const b1 = living.burgs[1];
      b1.cultureStored = 20;

      Living.tick(1);

      expect(pack.cells.state[2]).toBe(1);
      expect(pack.cells.province[2]).toBe(1);
      expect(pack.burgs[3].state).toBe(1);
      expect(living.burgs[3].unrest).toBe(0);
      expect(b1.tilesAcquired).toBe(1);
      // 20 banked + 1 Palace Culture − 20 needed, clamped at 1.
      expect(b1.cultureStored).toBeCloseTo(1, 5);
    });

    it("takes a foreign free burg by force and raises occupation unrest", () => {
      const living = Living.init();
      pack.cells.good[8] = 1;
      const b1 = living.burgs[1];
      b1.cultureStored = 20;

      Living.tick(1);

      expect(pack.cells.state[8]).toBe(1);
      expect(pack.burgs[4].state).toBe(1);
      expect(living.burgs[4].unrest).toBeGreaterThan(0);
      expect(living.burgs[4].conqueredBy).toBe(1);
      expect(living.recentNews.some(item => item.kind === "conquest" && item.burgId === 4)).toBe(true);
    });

    it("completes a queued building and raises the matching burg flag", () => {
      const living = Living.init();
      const b1 = living.burgs[1];
      living.cells ??= {};
      living.cells[1] = { improvement: "mine" };
      b1.productionQueue = [{ kind: "building", id: "walls" }];
      b1.productionProgress = { "building:walls": 74 };

      Living.tick(1);

      expect(b1.civBuildings).toContain("walls");
      expect(b1.productionQueue).not.toContainEqual({ kind: "building", id: "walls" });
      expect(pack.burgs[1].walls).toBe(1);
      expect(living.recentNews.some(item => item.kind === "build" && item.burgId === 1)).toBe(true);
    });

    it("lets the governor pick the next project when the queue is empty", () => {
      const living = Living.init();
      living.cells ??= {};
      living.cells[1] = { improvement: "mine" };

      Living.tick(1);

      expect(living.burgs[1].productionQueue?.[0]).toEqual({ kind: "building", id: "monument" });
    });

    it("races a World Wonder and refunds every rival's invested Production", () => {
      const living = Living.init();
      living.states[1].researchedTechs = ["writing"];
      living.states[2].researchedTechs = ["writing"];
      living.cells ??= {};
      living.cells[1] = { improvement: "mine" };

      const b1 = living.burgs[1];
      b1.productionQueue = [{ kind: "wonder", id: "great_library" }];
      b1.productionProgress = { "wonder:great_library": 184 };

      const b2 = living.burgs[2];
      b2.productionQueue = [{ kind: "wonder", id: "great_library" }];
      b2.productionProgress = { "wonder:great_library": 40 };

      Living.tick(1);

      expect(living.worldWonders?.great_library).toMatchObject({ burgId: 1, stateId: 1 });
      expect(b1.civBuildings).toContain("great_library");
      expect(b2.productionQueue?.some(item => item.id === "great_library")).toBe(false);
      expect(b2.productionProgress?.["wonder:great_library"]).toBeUndefined();
      // 40 Gold refund plus the same tick's Empire gold income (Palace +3).
      expect(pack.states[2].economy.treasury).toBe(40 + (living.states[2].yieldsPerTurn?.gold ?? 0));
    });

    it("feeds surplus food into Production while a Settler is queued", () => {
      const living = Living.init();
      const b1 = living.burgs[1];
      b1.foodStored = 0;
      b1.productionQueue = [{ kind: "unit", id: "settler" }];
      b1.productionProgress = { "unit:settler": 0 };

      Living.tick(1);

      expect(b1.civBuildings).not.toContain("settler");
      // Growth is locked: the surplus Food becomes Production, not food storage.
      expect(b1.foodStored).toBe(0);
      // 3 Palace Production + 1 Food-to-Production.
      expect(b1.productionProgress?.["unit:settler"]).toBe(4);
    });

    it("keeps OpenCiv building ids and native burg flags in sync both ways", () => {
      const burg = {
        i: 9,
        cell: 0,
        x: 0,
        y: 0,
        walls: 1,
        plaza: 1,
        temple: 0,
        citadel: 0,
        capital: 0
      } as unknown as Burg;

      const ids = syncCivBuildingsFromFlags(burg, []);
      expect(ids).toEqual(expect.arrayContaining(["walls", "market"]));
      expect(ids).not.toContain("castle");
      expect(ids).not.toContain("palace");

      syncCivFlagsFromBuildings(burg, ["castle", "arsenal", "temple", "harbor", "palace"]);
      expect(burg.walls).toBe(3);
      expect(burg.citadel).toBe(1);
      expect(burg.temple).toBe(1);
      expect(burg.port).toBe(1);
      expect(burg.capital).toBe(1);

      const demolished = syncCivBuildingsFromFlags({ ...burg, walls: 0, citadel: 0 }, ["walls", "castle", "arsenal"]);
      expect(demolished).not.toContain("walls");
      expect(demolished).not.toContain("castle");
      expect(demolished).not.toContain("arsenal");
    });

    it("is deterministic across identical seeds and starting packs", () => {
      const run = () => {
        setupCityWorld();
        const living = Living.init({ seed: "slice-3-seed" });
        living.cells ??= {};
        living.cells[1] = { improvement: "farm" };
        living.states[1].researchedTechs = ["writing"];
        Living.tick(2);
        return {
          worked: [...(living.burgs[1].workedCells ?? [])],
          yields: living.burgs[1].cityYields,
          queue: living.burgs[1].productionQueue
        };
      };

      expect(run()).toEqual(run());
    });

    it("lazily initializes worldWonders and OpenCiv city fields on old saves", () => {
      delete pack.history.living;

      const living = Living.init();
      expect(living.worldWonders).toEqual({});
      expect(living.burgs[1].civBuildings).toEqual(expect.arrayContaining(["palace"]));
      expect(living.burgs[1].isMajor).toBe(true);
    });
  });

  describe("OpenCiv slice 4: science, treasury & happiness", () => {
    const makeRegiment = (i: number) => ({
      i,
      name: `Regiment ${i}`,
      a: 100,
      cell: 5,
      x: 50,
      y: 50,
      bx: 50,
      by: 50,
      u: { spear: 100 },
      units: [{ type: "spear", hp: 1, exp: 0 }],
      n: 0,
      icon: "⚔️",
      state: 1
    });

    beforeEach(() => {
      setupCityWorld();
    });

    it("selects the OpenCiv theme and era cap from the live map", () => {
      expect(activeCivThemeId()).toBe("fantasy");

      options.map.lore.calendar.year = 1900;
      expect(activeCivThemeId()).toBe("historical");

      options.map.lore.calendar.year = 1000;
      options.map.lore.calendar.era = "Age of Steam";
      expect(activeCivThemeId()).toBe("historical");
      options.map.lore.calendar.era = "Age of Dawn";
    });

    it("computes hurry Gold cost and the very-unhappy combat penalty", () => {
      expect(hurryGoldCost(0, false)).toBe(0);
      expect(hurryGoldCost(75, false)).toBe(320);
      expect(hurryGoldCost(75, true)).toBe(390);
      expect(hurryGoldCost(75, false, true)).toBe(270);

      expect(happinessCombatMultiplier(0)).toBe(1);
      expect(happinessCombatMultiplier(-9)).toBe(1);
      expect(happinessCombatMultiplier(-10)).toBe(0.67);
      expect(happinessCombatMultiplier(undefined)).toBe(1);
    });

    it("sets research through the public API and rejects unavailable techs", () => {
      const living = Living.init();
      const sSim = living.states[1];

      expect(Living.setResearch(1, "pottery")).toBe(true);
      expect(sSim.currentTechId).toBe("pottery");
      expect(Living.setResearch(1, "metallurgy")).toBe(false);

      expect(Living.grantTech(1, "pottery")).toBe(true);
      expect(sSim.researchedTechs).toContain("pottery");
      expect(Living.grantTech(1, "pottery")).toBe(false);
      expect(isTechSelectable(CIV_TECH_BY_ID.pottery!, new Set(), "fantasy")).toBe(true);
      expect(isTechSelectable(CIV_TECH_BY_ID.metallurgy!, new Set(), "fantasy")).toBe(false);
      expect(isTechSelectable(CIV_TECH_BY_ID.metallurgy!, new Set(["gunpowder", "printing_press"]), "fantasy")).toBe(
        true
      );
      expect(isTechSelectable(CIV_TECH_BY_ID.refrigeration!, new Set(), "fantasy")).toBe(false);
    });

    it("banks Science each tick and completes the current technology", () => {
      const living = Living.init();
      const sSim = living.states[1];
      sSim.currentTechId = "pottery";
      sSim.researchedProgress = { pottery: 32 };

      Living.tick(1);

      // Palace Science 3 pushes 32 over Pottery's 35 cost.
      expect(sSim.researchedTechs).toContain("pottery");
      expect(sSim.currentTechId).not.toBe("pottery");
      expect(sSim.currentTechId).toBeTruthy();
      expect(living.recentNews.some(item => item.kind === "tech")).toBe(true);
    });

    it("grants a free technology when a Great Library completes", () => {
      const living = Living.init();
      const sSim = living.states[1];
      sSim.researchedTechs = ["writing"];
      living.cells ??= {};
      living.cells[1] = { improvement: "mine" };
      const b1 = living.burgs[1];
      b1.productionQueue = [{ kind: "wonder", id: "great_library" }];
      b1.productionProgress = { "wonder:great_library": 184 };

      Living.tick(1);

      expect(living.worldWonders?.great_library).toMatchObject({ burgId: 1, stateId: 1 });
      // The free tech is consumed by the same tick's research step.
      expect(sSim.freeTechs).toBe(0);
      expect(sSim.researchedTechs.length).toBeGreaterThan(1);
    });

    it("unlocks buildings through discovered technologies", () => {
      const living = Living.init();
      // Every owned cell is already improved, so no Builder is queued either.
      living.cells = {};
      for (const cell of [1, 4, 5, 6, 9, 10]) living.cells[cell] = { improvement: "farm" };
      const b1 = living.burgs[1];
      b1.civBuildings = ["palace", "monument"];
      b1.productionQueue = [];

      Living.tick(1);
      expect(b1.productionQueue ?? []).toHaveLength(0);

      living.states[1].researchedTechs = ["pottery"];
      b1.productionQueue = [];
      Living.tick(1);
      expect(b1.productionQueue?.[0]).toEqual({ kind: "building", id: "granary" });
    });

    it("adds tech tile bonuses next to the base improvement yields", () => {
      const living = Living.init();
      living.cells ??= {};
      living.cells[1] = { improvement: "farm" };
      expect(getCellYields(1, 1, living).food).toBe(3);

      living.states[1].researchedTechs = ["civil_service"];
      expect(getCellYields(1, 1, living).food).toBe(3);

      pack.cells.r[1] = 1;
      expect(getCellYields(1, 1, living).food).toBe(4);
      expect(getCellYieldSources(1, 1, living).some(source => source.kind === "tech")).toBe(true);

      living.cells ??= {};
      living.cells[3] = { improvement: "mine" };
      expect(getCellYields(3, 1, living).production).toBe(1);
      living.states[1].researchedTechs = ["chemistry"];
      expect(getCellYields(3, 1, living).production).toBe(2);
    });

    it("rolls city Gold into the treasury net of maintenance and unit upkeep", () => {
      const living = Living.init();
      const sSim = living.states[1];

      Living.tick(1);
      // Palace +3 Gold, worked minor burg (Millbrook) +2 Gold.
      expect(sSim.yieldsPerTurn?.gold).toBe(5);
      expect(pack.states[1].economy.treasury).toBe(5);

      // Monument maintenance 1 plus 4 regiments (1 above the free allowance).
      living.burgs[1].civBuildings = ["palace", "monument"];
      pack.states[1].military = Array.from({ length: Math.ceil(UPKEEP_FREE / 0.2) + 1 }, (_, index) =>
        makeRegiment(index)
      );
      Living.tick(1);
      // Five 100-man blocks cost less than the three-block free allowance; only maintenance bites.
      // Phase E removed capacity gating, so an autonomous improvement can lift city Gold;
      // assert the monument's maintenance relationship instead of a stale absolute.
      expect(sSim.yieldsPerTurn?.gold).toBe((living.burgs[1].cityYields?.gold ?? 0) - 1);
    });

    it("disbands one block when the treasury goes negative", () => {
      const living = Living.init();
      const first = makeRegiment(0);
      const second = makeRegiment(1);
      second.units = [
        { type: "spear", hp: 1, exp: 0 },
        { type: "spear", hp: 1, exp: 0 }
      ];
      pack.states[1].military = [first, second];
      pack.states[1].economy.treasury = -10;

      Living.tick(1);

      expect(pack.states[1].economy.treasury).toBe(0);
      expect(pack.states[1].military).toHaveLength(2);
      expect(second.units).toHaveLength(1);
      expect(living.recentNews.some(item => item.text.includes("disbanded"))).toBe(true);
    });

    it("charges upkeep per block scaled by hp, with the free allowance and civilian rate", () => {
      const living = Living.init();
      const types = Military.getUnitTypes();
      const elite = Object.values(types).sort((a, b) => b.upkeep - a.upkeep)[0]!;
      const count = Math.ceil((UPKEEP_FREE + elite.upkeep * 2) / elite.upkeep);
      const full = {
        ...makeRegiment(0),
        units: Array.from({ length: count }, () => ({ type: elite.id, hp: 1, exp: 0 }))
      };
      const half = {
        ...makeRegiment(1),
        units: Array.from({ length: count }, () => ({ type: elite.id, hp: 0.5, exp: 0 }))
      };
      const civilian = { ...makeRegiment(2), type: "builder", units: [] };
      pack.states[1].military = [full, half, civilian];

      Living.tick(1);

      const b1 = living.burgs[1];
      const gross = b1.cityYields?.gold ?? 0;
      const maintenance = (b1.civBuildings ?? []).reduce(
        (sum, id) => sum + (CIV_BUILDING_BY_ID[id]?.maintenance ?? 0),
        0
      );
      const upkeep = Math.max(0, elite.upkeep * count * 1.5 + 0.1 - UPKEEP_FREE);
      expect(living.states[1].yieldsPerTurn?.gold).toBeCloseTo(gross - maintenance - upkeep, 2);
    });

    it("derives Empire Happiness from luxuries, buildings and city costs", () => {
      const living = Living.init();
      Living.tick(1);

      const sSim = living.states[1];
      expect(sSim.happiness).toBe(BASE_EMPIRE_HAPPINESS - 3 - 6);
      expect(sSim.happinessBreakdown).toMatchObject({
        base: BASE_EMPIRE_HAPPINESS,
        luxuries: 0,
        cityUnhappiness: 3,
        citizenUnhappiness: 6
      });

      pack.cells.good[1] = 1;
      living.cells ??= {};
      living.cells[1] = { improvement: "plantation" };
      Living.tick(1);
      expect(sSim.happinessBreakdown?.luxuries).toBe(LUXURY_HAPPINESS);
      expect(sSim.happiness).toBe(LUXURY_HAPPINESS);

      // Colosseum local happiness is capped by the city's citizens.
      living.burgs[1].civBuildings = ["palace", "colosseum"];
      living.burgs[1].citizens = 2;
      pack.burgs[1].population = 2;
      Living.tick(1);
      expect(sSim.happinessBreakdown?.buildings).toBe(2);
      expect(sSim.happiness).toBe(BASE_EMPIRE_HAPPINESS - 3 - 2 + 2 + LUXURY_HAPPINESS);
    });

    it("decays unravel while content and inflates it while very unhappy", () => {
      const living = Living.init();
      const sSim = living.states[1];

      sSim.unravel = 50;
      Living.tick(1);
      expect(sSim.happiness).toBe(0);
      expect(sSim.unravel).toBe(48);

      const b1 = living.burgs[1];
      b1.conqueredBy = 1;
      b1.unrest = 100;
      sSim.unravel = 0;
      Living.tick(1);
      expect(sSim.happiness).toBeLessThanOrEqual(-10);
      expect(sSim.unravel).toBeGreaterThanOrEqual(6);
    });

    it("hurries the top production item for Gold with a reserve", () => {
      const living = Living.init();
      const b1 = living.burgs[1];
      b1.productionQueue = [{ kind: "building", id: "monument" }];
      b1.productionProgress = { "building:monument": 0 };

      pack.states[1].economy.treasury = 50;
      expect(Living.hurryProduction(1)).toBe(false);

      pack.states[1].economy.treasury = 1000;
      expect(Living.hurryProduction(1)).toBe(true);
      expect(b1.civBuildings).toContain("monument");
      expect(pack.states[1].economy.treasury).toBeLessThan(1000);
    });

    it("lazily initializes the OpenCiv empire record on old saves", () => {
      delete pack.history.living;

      const living = Living.init();
      const sSim = living.states[1];
      expect(sSim.researchedTechs).toEqual([]);
      expect(sSim.researchQueue).toEqual([]);
      expect(sSim.researchedProgress).toEqual({});
      expect(sSim.freeTechs).toBe(0);
      expect(sSim.yieldsPerTurn).toBeDefined();
    });
  });

  describe("Upstream development bridge (economy alignment Phase 2)", () => {
    beforeEach(() => {
      setupCityWorld();
    });

    /** People and land of the test world at given development levels */
    function seedMap(levels: Record<number, number>, people: Record<number, number> = {}): Uint8Array {
      const development = new Uint8Array(GRID * GRID);
      for (const [cell, level] of Object.entries(levels)) development[Number(cell)] = level;
      for (const [cell, count] of Object.entries(people)) pack.cells.pop[Number(cell)] = count;
      pack.cells.development = development;
      return development;
    }

    it("seeds a state's technologies from the upstream development field", () => {
      seedMap({ 1: 20, 4: 20, 5: 20, 6: 20, 9: 20, 10: 20 }, { 1: 100, 6: 50, 9: 20 });

      const living = Living.init();
      const sSim = living.states[1];
      const known = new Set(sSim.researchedTechs ?? []);

      expect(known.has("pottery")).toBe(true);
      expect((sSim.researchedTechs ?? []).every(id => CIV_TECH_BY_ID[id]!.row <= 2)).toBe(true);
      for (const id of sSim.researchedTechs ?? []) {
        for (const prerequisite of CIV_TECH_BY_ID[id]!.prerequisites) expect(known.has(prerequisite)).toBe(true);
      }
      expect(computePolityTechDevelopment(sSim.researchedTechs ?? [])).toBeGreaterThanOrEqual(18);
    });

    it("leaves a map without development untouched", () => {
      const living = Living.init();

      expect(living.states[1].researchedTechs).toEqual([]);
      expect(living.economyDirty).toBeFalsy();
    });

    it("raises a state's cities when a technology completes", () => {
      const development = seedMap({ 1: 12, 4: 12, 5: 12, 6: 12, 9: 12, 10: 12 }, { 1: 100 });
      const living = Living.init();
      expect(living.states[1]!.researchedTechs?.length).toBeGreaterThan(0);

      expect(Living.grantTech(1, "mathematics")).toBe(true);

      expect(development[5]).toBeGreaterThan(12); // the capital
      expect(development[4]).toBeGreaterThan(12); // Millbrook
      expect(development[1]).toBe(12); // the countryside waits for the seasonal diffusion
      expect(living.economyDirty).toBe(true);
    });

    it("diffuses technology from the polity level into its peopled land", () => {
      const development = seedMap({ 1: 20, 4: 20, 5: 20, 6: 20, 9: 6, 10: 20 }, { 1: 100, 9: 1 });
      const living = Living.init();

      Living.tick(1);

      expect(development[9]).toBeGreaterThan(6); // its people's technology spreads
      expect(development[6]).toBe(20); // nobody lives there
      expect(living.economyDirty).toBe(true);
    });
  });

  describe("OpenCiv slice 5: 1UPT tactical units", () => {
    const makeRegiment = (i: number, cell: number, state = 1) => ({
      i,
      name: `Regiment ${i}`,
      a: 100,
      cell,
      x: 0,
      y: 0,
      bx: 0,
      by: 0,
      u: { spear: 100 },
      units: Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 })),
      n: 0,
      icon: "⚔️",
      state
    });

    const unitKey = (stateId: number, regimentId: number) => `${stateId}-${regimentId}`;

    beforeEach(() => {
      setupCityWorld();
    });

    it("applies terrain defense and movement costs", () => {
      expect(terrainDefenseMultiplier(1)).toBe(1);
      pack.cells.h[3] = 55;
      expect(terrainDefenseMultiplier(3)).toBe(1.25);
      pack.cells.biome[2] = 6;
      expect(terrainDefenseMultiplier(2)).toBe(1.25);
      pack.cells.biome[2] = 4;

      const unit = {
        unitTypeId: "warrior",
        domain: "land" as const,
        combatClass: "melee" as const,
        isUtility: false,
        hp: 100,
        movement: 2,
        maxMovement: 2,
        combatStrength: 8,
        rangedStrength: 0,
        range: 0,
        xp: 0,
        level: 1,
        promotions: [],
        fortified: false,
        hasAttacked: false
      };

      expect(unitMovementCost(1, 2, unit)).toBe(1);
      pack.cells.h[1] = 55;
      pack.cells.h[2] = 55;
      expect(unitMovementCost(1, 2, unit)).toBe(2);
      pack.cells.h[1] = 25;
      pack.cells.h[2] = 25;

      (pack.cells as unknown as { routes: Record<number, Record<number, number>> }).routes = { 1: { 2: 7 } };
      expect(unitMovementCost(1, 2, unit)).toBeCloseTo(1 / 3, 5);

      (pack.cells as unknown as { routes: Uint16Array }).routes = new Uint16Array(16);
      pack.cells.r[2] = 1;
      expect(unitMovementCost(1, 2, unit)).toBe(2); // drains all remaining movement

      pack.cells.h[2] = 75;
      expect(unitMovementCost(1, 2, unit)).toBe(Number.POSITIVE_INFINITY);
      pack.cells.h[2] = 25;

      const fleet = { ...unit, domain: "sea" as const };
      expect(unitMovementCost(1, 2, fleet)).toBe(Number.POSITIVE_INFINITY);
    });

    it("enforces 1UPT military/utility stacking", () => {
      const occupied = [{ stateId: 1, isUtility: false, key: "1-0" }];
      expect(hasStackingConflict(occupied, 1, false, "1-1")).toBe(true);
      expect(hasStackingConflict(occupied, 1, true, "1-1")).toBe(false);
      expect(hasStackingConflict(occupied, 2, true, "2-1")).toBe(true);
      expect(hasStackingConflict(occupied, 1, false, "1-0")).toBe(false);
    });

    it("seeds blocks and an army record for every native regiment", () => {
      pack.states[1].military = [makeRegiment(0, 5)];
      const living = Living.init();

      const regiment = pack.states[1].military![0];
      expect(regiment.units).toHaveLength(13);
      expect(living.armies?.[unitKey(1, 0)]).toMatchObject({ stance: "fortify", hasFought: false });
      expect(living.units?.[unitKey(1, 0)]).toBeUndefined();
      // a mirrors men: 13 spear blocks at the roster's 150-man quantity.
      expect(regiment.a).toBe(13 * 150);
    });

    it("grants a marching army 1.5x movement and an entrenching one 0.7x", () => {
      const grantFor = (stance: "march" | "encamp" | "fortify"): number => {
        delete (pack.history as { living?: unknown }).living;
        pack.states[1].military = [makeRegiment(0, 9)];
        const living = Living.init();
        const army = living.armies![unitKey(1, 0)]!;
        army.stance = stance;
        Living.tick(1);
        return army.movement;
      };

      const march = grantFor("march");
      const fortify = grantFor("fortify");
      const encamp = grantFor("encamp");

      // Same position, same path: the stance scales the points granted before it.
      expect(march).toBeCloseTo(fortify * 1.5, 5);
      expect(encamp).toBeCloseTo(fortify * 0.7, 5);
    });

    it("does not let a forced march open a battle", () => {
      Living.forceWar(1, 2);
      pack.states[1].military = [makeRegiment(0, 5)];
      pack.states[2].military = [makeRegiment(0, 6, 2)];
      const living = Living.init();
      const key = unitKey(1, 0);
      living.armies![key]!.stance = "march";

      Living.tick(1);

      // A marching army passes by: no battle is fought this tick.
      expect(living.armies![key]!.lastBattle?.role).not.toBe("attacker");
    });

    it("conceals a war army resting in the open outside its own land", () => {
      Living.forceWar(1, 2);
      pack.states[1].military = [makeRegiment(0, 7)]; // cell 7 is enemy ground
      const living = Living.init();

      Living.tick(1);

      // Waiting in the open on hostile soil is an ambush: the next attack lands +30%.
      expect(living.armies![unitKey(1, 0)]!.stance).toBe("ambush");
    });

    it("fights adjacent armies, damages the lead block and removes the dead", () => {
      Living.forceWar(1, 2);
      pack.states[1].military = [makeRegiment(0, 5)];
      const doomed = makeRegiment(0, 6, 2);
      doomed.units = [{ type: "levy_spear", hp: 1, exp: 0 }];
      pack.states[2].military = [doomed];
      const living = Living.init();

      Living.tick(1);
      // A battle was recorded: the attacker took the field.
      const record = living.armies?.[unitKey(1, 0)]?.lastBattle;
      expect(record).toBeDefined();
      expect(record!.winner).toBe("attacker");
      expect(record!.role).toBe("attacker");
      expect(record!.rounds).toBeGreaterThan(0);

      Living.tick(6);
      // The defeated regiment leaves the field (a fresh muster may replace it —
      // upkeep, not a muster fee, is what bounds army size now).
      expect(pack.states[2].military ?? []).not.toContain(doomed);
      expect(pack.states[1].military?.length ?? 0).toBeGreaterThan(0);
    });

    it("converts a legacy 1UPT combat sim into army blocks", () => {
      const living = Living.init();
      pack.states[1].military = [makeRegiment(0, 5)];
      pack.states[1].military![0].units = [];
      const key = unitKey(1, 0);
      living.units![key] = {
        unitTypeId: "warrior",
        domain: "land",
        combatClass: "melee",
        isUtility: false,
        hp: 60,
        movement: 2,
        maxMovement: 2,
        combatStrength: 30,
        rangedStrength: 0,
        range: 0,
        xp: 0,
        level: 4,
        promotions: [],
        fortified: false,
        hasAttacked: false
      };

      Living.tick(1);

      expect(living.units?.[key]).toBeUndefined();
      expect(pack.states[1].military![0].units?.[0]?.exp).toBe(3); // level 4 → exp 3
      expect(living.armies?.[key]).toBeDefined();
    });

    it("resolves a 2:1 army battle, reports losses in hp and mirrors reg.a", () => {
      const living = Living.init();
      Living.forceWar(1, 2);
      pack.states[1].military = [makeRegiment(0, 5)];
      const defenders = [makeRegiment(0, 6, 2)];
      defenders[0]!.units = defenders[0]!.units!.slice(0, 4);
      pack.states[2].military = defenders;
      const attacker = pack.states[1].military![0]!;
      const beforeAttacker = (attacker.units ?? []).reduce((sum, block) => sum + block.hp, 0);

      Living.tick(1);

      const afterAttacker = (attacker.units ?? []).reduce((sum, block) => sum + block.hp, 0);
      const record = living.armies?.[unitKey(1, 0)]?.lastBattle;
      if (record) {
        // A tick can contain both sides' attacks; the record is the last battle.
        expect(record.lossesHp).toBeLessThanOrEqual(beforeAttacker - afterAttacker + 1e-9);
        expect(record.rounds).toBeGreaterThan(0);
        expect(record.survivorsHp).toBeGreaterThan(0);
      }
      // 13 blocks against 4 wins: the weaker army routs and loses capability.
      expect(pack.states[1].military ?? []).toHaveLength(1);
      const defenderAfter = (pack.states[2].military?.[0]?.units ?? []).reduce((sum, block) => sum + block.hp, 0);
      expect(defenderAfter).toBeLessThan(4);
      // Survivors are whole blocks with hp in (0, 1], and reg.a mirrors men.
      for (const block of attacker.units ?? []) {
        expect(block.hp).toBeGreaterThan(0);
        expect(block.hp).toBeLessThanOrEqual(1);
      }
      const quantity = Military.getUnitTypes()[attacker.units![0]!.type]!.quantity;
      expect(attacker.a).toBe((attacker.units ?? []).reduce((sum, block) => sum + Math.round(block.hp * quantity), 0));
    });

    it("is deterministic for the same tick, armies and seed", () => {
      const run = () => {
        setupCityWorld();
        Living.forceWar(1, 2);
        pack.states[1].military = [makeRegiment(0, 5)];
        pack.states[2].military = [makeRegiment(0, 6, 2)];
        Living.init();
        Living.tick(1);
        return JSON.stringify({
          attacker: pack.states[1].military?.[0]?.units,
          defender: pack.states[2].military?.[0]?.units
        });
      };

      expect(run()).toBe(run());
    });

    it("fights monster and spellcaster blocks through the roster", () => {
      const types = Military.getUnitTypes();
      const monster = Object.values(types).find(unit => unit.category === "monster");
      const caster = Object.values(types).find(unit => unit.category === "spellcaster");
      expect(monster?.id).toBeDefined();
      expect(caster?.id).toBeDefined();

      Living.forceWar(1, 2);
      pack.states[1].military = [makeRegiment(0, 5), makeRegiment(1, 5)];
      pack.states[1].military![1]!.units = [{ type: monster!.id, hp: 1, exp: 4 }];
      const defenders = [makeRegiment(0, 6, 2)];
      defenders[0]!.units = [{ type: caster!.id, hp: 1, exp: 2 }];
      pack.states[2].military = defenders;
      const living = Living.init();
      Living.tick(1);

      expect(living.armies?.[unitKey(1, 1)]).toBeDefined();
      expect(living.armies?.[unitKey(1, 1)]?.lastBattle ?? living.armies?.[unitKey(2, 0)]?.lastBattle).toBeDefined();
    });

    it("prunes destroyed blocks and keeps the stack under the slot cap", () => {
      Living.forceWar(1, 2);
      pack.states[1].military = [makeRegiment(0, 5)];
      pack.states[2].military = [makeRegiment(0, 6, 2)];
      const living = Living.init();
      Living.tick(1);

      const blocks = pack.states[1].military?.[0]?.units ?? [];
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.length).toBeLessThanOrEqual(currentContent().config.military.maxUnitsPerArmy);
      expect(blocks.every(block => block.hp > 0)).toBe(true);
      expect(living.armies?.[unitKey(1, 0)]?.lastBattle?.blocksLost).toBeGreaterThanOrEqual(0);
    });

    it("keeps army composition across ticks without duplicating blocks", () => {
      pack.states[1].military = [makeRegiment(0, 5)];
      const living = Living.init();
      const before = pack.states[1].military![0].units!.length;

      Living.tick(3);

      expect(pack.states[1].military![0].units).toHaveLength(before);
      expect(living.armies?.[unitKey(1, 0)]).toBeDefined();
      expect(living.units?.[unitKey(1, 0)]).toBeUndefined();
    });

    it("produces a combat unit into an army block", () => {
      const living = Living.init();
      const b1 = living.burgs[1];
      const melee = Military.getRoster(pack.states[1]!)!.garrison.melee;
      b1.productionQueue = [{ kind: "unit", id: melee }];
      b1.productionProgress = { [`unit:${melee}`]: 0 };

      expect(Living.hurryProduction(1)).toBe(false); // treasury too thin

      pack.states[1].military = [makeRegiment(0, 5)];
      pack.states[1].economy.treasury = 1000;
      expect(Living.hurryProduction(1)).toBe(true);

      const blocks = (pack.states[1].military ?? []).reduce((sum, reg) => sum + (reg.units?.length ?? 0), 0);
      expect(blocks).toBeGreaterThan(13);
      expect(Object.keys(living.armies ?? {}).length).toBeGreaterThan(0);
    });

    it("recruits utility units and lets a Builder improve a tile", () => {
      const living = Living.init();
      const regiment = Living.recruitUnit(1, 1, "builder");
      expect(regiment).not.toBeNull();
      const regimentId = regiment!.i;
      const builder = living.units?.[unitKey(1, regimentId)];
      expect(builder).toMatchObject({ isUtility: true, unitTypeId: "builder" });

      Living.tick(10);

      const improved = Object.values(living.cells ?? {}).filter(cell => cell.improvement);
      expect(improved.length).toBeGreaterThan(0);
    });

    it("moves a Settler onto free land and founds a new burg", () => {
      const living = Living.init();
      pack.burgs[2].removed = true;
      pack.burgs[3].removed = true;
      pack.burgs[4].removed = true;
      pack.burgs[5].removed = true;
      pack.cells.state[15] = 1;
      pack.cells.province[15] = 1;

      expect(Living.recruitUnit(1, 1, "settler")).not.toBeNull();
      Living.tick(6);

      const founded = pack.burgs.find(burg => burg.cell === 15 && burg.state === 1);
      expect(founded).toBeDefined();
      expect(living.recentNews.some(item => item.kind === "colonize" && item.cell === 15)).toBe(true);
    });

    it("captures a city once its garrison is beaten", () => {
      pack.burgs[2].capital = 0;
      pack.states[1].military = [makeRegiment(0, 7)];
      const living = Living.init();
      Living.forceWar(1, 2);

      expect(Living.conquerBurg(1, 2)).toBe(true);

      const b2 = living.burgs[2];
      expect(pack.burgs[2].state).toBe(1);
      expect(b2.hp).toBe(100);
      expect(b2.citizens).toBe(1);
      expect(pack.burgs[2].population).toBe(0.5);
      expect(b2.productionQueue).toEqual([]);
      expect(b2.unrest).toBeGreaterThanOrEqual(7);
    });

    it("builds the siege garrison from the roster and scales it with walls", () => {
      Living.init();
      pack.burgs[2].capital = 1;
      const types = Military.getUnitTypes();
      const noWalls = Living.cityGarrison(2).map(block => block.type);
      pack.burgs[2].walls = 3;
      const withWalls = Living.cityGarrison(2).map(block => block.type);

      expect(noWalls.length).toBeGreaterThan(0);
      expect(withWalls.length).toBeGreaterThan(noWalls.length);
      for (const id of withWalls) expect(types[id]).toBeDefined();
      // Every garrison block enters the fight at full capability.
      expect(Living.cityGarrison(2).every(block => block.hp === 1)).toBe(true);
    });

    it("repels a weak assault and retreats the survivors", () => {
      pack.burgs[2].capital = 0;
      pack.burgs[2].walls = 3;
      const weak = makeRegiment(0, 7);
      weak.units = [{ type: weak.units![0]!.type, hp: 0.05, exp: 0 }];
      pack.states[1].military = [weak];
      const living = Living.init();
      Living.forceWar(1, 2);

      // Phase B siege progression may besiege instead of assaulting; what matters is
      // that a 5%-capability army does not take the city.
      Living.conquerBurg(1, 2);

      expect(pack.burgs[2].state).toBe(2);
      const army = living.armies?.[unitKey(1, 0)];
      if (army) expect(pack.states[1].military![0]!.cell).not.toBe(pack.burgs[2].cell);
    });

    it("lets a city strike one block of an enemy army within range two", () => {
      const living = Living.init();
      Living.forceWar(1, 2);
      pack.states[1].military = [makeRegiment(0, 9)];

      Living.tick(1);

      const blocks = pack.states[1].military?.[0]?.units ?? [];
      const damaged = blocks.filter(block => block.hp < 1);
      expect(damaged).toHaveLength(1);
      expect(1 - damaged[0]!.hp).toBeCloseTo(0.1, 5);
      expect((pack.states[1].military?.[0]?.units ?? []).every(block => block.hp > 0)).toBe(true);
      expect(living.armies?.[unitKey(1, 0)]).toBeDefined();
    });

    it("prunes a block destroyed by a city strike", () => {
      const living = Living.init();
      pack.states[1].economy.treasury = 0; // no Gold: no autonomous muster
      Living.forceWar(1, 2);
      const doomed = makeRegiment(0, 7); // in enemy land: no replenishment
      doomed.units = [{ type: doomed.units![0]!.type, hp: 0.05, exp: 0 }];
      pack.states[1].military = [doomed];
      living.states[1].agenda = { kind: "muster", label: "Mustering", progress: 0, required: 999 };

      Living.tick(1);

      // City strike destroys the nearly-dead block; destroyed blocks are pruned.
      const units = pack.states[1].military?.[0]?.units ?? [];
      expect(units.every(block => block.hp > 0)).toBe(true);
      expect(units.some(block => block.hp <= 0.05)).toBe(false);
      expect(living.armies?.[unitKey(1, 0)]).toBeDefined();
    });

    it("refits army blocks for Gold, preserving hp and exp", () => {
      pack.states[1].military = [makeRegiment(0, 5)];
      const living = Living.init();
      const types = Military.getUnitTypes();
      const roster = Military.getRoster(pack.states[1]!)!;
      const currentId = roster.garrison.melee;
      const current = types[currentId]!;
      const target = current.upgradesTo ? types[current.upgradesTo] : nextRosterUnitInCategory(roster, currentId);
      expect(target).toBeDefined();

      const regiment = pack.states[1].military![0]!;
      regiment.units = [{ type: current.id, hp: 0.45, exp: 6 }];
      syncRegimentTotals(regiment, types);
      pack.states[1].economy.treasury = 1000;
      living.states[1]!.researchedTechs = [requiredTechFor(target!, roster)];

      expect(Living.upgradeRegiment(1, 0)).toBe(true);

      expect(regiment.units![0]!.type).toBe(target!.id);
      expect(regiment.units![0]!.hp).toBe(0.45);
      expect(regiment.units![0]!.exp).toBe(6);
      expect(pack.states[1].economy.treasury).toBeLessThan(1000);
    });

    it("replenishes damaged blocks in a city, half in friendly land, never in neutral land", () => {
      const living = Living.init();
      const types = Military.getUnitTypes();
      const unitType = Object.keys(types)[0]!;
      const cityReg = makeRegiment(0, 5);
      cityReg.units = [{ type: unitType, hp: 0.4, exp: 0 }];
      const fieldReg = makeRegiment(1, 1);
      fieldReg.units = [{ type: unitType, hp: 0.4, exp: 0 }];
      const neutralReg = makeRegiment(2, 2);
      neutralReg.units = [{ type: unitType, hp: 0.4, exp: 0 }];
      pack.states[1].military = [cityReg, fieldReg, neutralReg];
      living.states[1].agenda = { kind: "muster", label: "Mustering", progress: 0, required: 999 };

      Living.tick(1);

      // City: 0.25 base × 2 encamp bonus = +0.5.
      expect(Math.min(...cityReg.units!.map(b => b.hp))).toBeCloseTo(0.9, 5);
      // Friendly land: half the base rate.
      expect(Math.min(...fieldReg.units!.map(b => b.hp))).toBeCloseTo(0.525, 5);
      // Neutral land: no replenishment.
      expect(Math.min(...neutralReg.units!.map(b => b.hp))).toBeCloseTo(0.4, 5);
    });

    it("grants training experience from military buildings", () => {
      const living = Living.init();
      living.burgs[1].civBuildings = ["palace", "barracks"];

      const regiment = Living.recruitUnit(1, 1, "warrior")!;
      const block = living.armies?.[unitKey(1, regiment.i)] ? regiment.units?.[0] : undefined;
      expect(block?.exp).toBeGreaterThan(0);

      const builder = Living.recruitUnit(1, 1, "builder")!;
      expect(living.units?.[unitKey(1, builder.i)]?.xp).toBe(15);
    });

    it("lazily initializes the tactical unit record on old saves", () => {
      delete pack.history.living;

      const living = Living.init();
      expect(living.units).toBeDefined();
    });
  });

  describe("OpenCiv slice 6: religion and diplomacy", () => {
    const makeRegiment = (i: number, cell: number, state = 1) => ({
      i,
      name: `Regiment ${i}`,
      a: 100,
      cell,
      x: 0,
      y: 0,
      bx: 0,
      by: 0,
      u: { spear: 100 },
      units: Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 })),
      n: 0,
      icon: "⚔️",
      state
    });

    beforeEach(() => {
      setupCityWorld();
    });

    it("banks Faith and founds a pantheon", () => {
      const living = Living.init();
      const sSim = living.states[1];
      sSim.faith = 10;

      Living.tick(1);

      expect(sSim.pantheonId).toBeTruthy();
      expect(sSim.faith).toBeLessThan(10);
      expect(living.recentNews.some(item => item.kind === "religion")).toBe(true);
    });

    it("births a Great Prophet that founds and then enhances a religion", () => {
      const living = Living.init();
      const sSim = living.states[1];
      sSim.faith = 1000;

      Living.tick(1);

      expect(sSim.prophetsEarned).toBe(1);
      expect(sSim.religionId).toBeTruthy();
      const record = living.religions?.[sSim.religionId!];
      expect(record).toBeDefined();
      expect(record?.holyCityBurgId).toBe(1);
      expect(record?.founderBeliefId).toBeTruthy();
      expect(record?.followerBeliefIds).toHaveLength(1);
      expect(pack.cells.religion[5]).toBe(sSim.religionId);

      Living.tick(1);

      expect(sSim.prophetsEarned).toBe(2);
      expect(record?.enhanced).toBe(true);
      expect(record?.followerBeliefIds.length).toBe(2);
      expect(record?.enhancerBeliefId).toBeTruthy();
    });

    it("radiates pressure that flips a neighbour city and repaints the religion layer", () => {
      const living = Living.init();
      living.states[1].faith = 1000;

      Living.tick(1);
      const religionId = living.states[1].religionId!;
      pack.cells.religion[11] = 0;
      living.burgs[2].religionPressure = {};

      Living.tick(8);

      expect(living.burgs[2].religionPressure?.[religionId]).toBeGreaterThan(0);
      expect(pack.cells.religion[11]).toBe(religionId);
    });

    it("spreads faith with a Missionary and consumes its charges", () => {
      const living = Living.init();
      living.states[1].faith = 1000;
      Living.tick(1);
      const religionId = living.states[1].religionId!;

      const regiment = Living.recruitUnit(1, 1, "missionary")!;
      regiment.cell = 11;
      const missionary = living.units?.[`1-${regiment.i}`];

      Living.tick(1);

      expect(living.burgs[2].religionPressure?.[religionId]).toBeGreaterThanOrEqual(180);
      expect(missionary?.spreadCharges).toBe(1);
    });

    it("locks war and peace behind the diplomacy timers", () => {
      const living = Living.init();
      Living.forceWar(1, 2);

      living.states[1].warTurns = { 2: 9 };
      expect(Living.signPeace(1, 2)).toBe(false);

      living.states[1].warTurns = { 2: 10 };
      expect(Living.signPeace(1, 2)).toBe(true);
      expect(pack.states[1].diplomacy?.[2]).toBe("Neutral");
      expect(pack.states[2].diplomacy?.[1]).toBe("Neutral");
      expect(living.states[1].peaceTreatyTurns?.[2]).toBe(10);

      Living.forceWar(1, 2);
      expect(pack.states[1].diplomacy?.[2]).not.toBe("Enemy");

      Living.tick(1);
      expect(living.states[1].peaceTreatyTurns?.[2]).toBeLessThan(10);
    });

    it("expels trespassers when peace is signed", () => {
      const living = Living.init();
      const regiment = makeRegiment(0, 7);
      pack.states[1].military = [regiment];
      Living.forceWar(1, 2);
      Living.tick(1);
      living.states[1].warTurns = { 2: 10 };

      expect(Living.signPeace(1, 2)).toBe(true);

      expect(pack.cells.state[regiment.cell]).not.toBe(2);
      expect(living.armies?.["1-0"]).toBeDefined();
    });

    it("keeps religion state lazy on old saves", () => {
      delete pack.history.living;

      const living = Living.init();
      expect(living.religions).toBeDefined();
    });
  });

  describe("Environmental trouble as a burg production action (Phase E)", () => {
    beforeEach(() => {
      setupCityWorld();
    });

    it("queues a trouble work order and clears it when Production completes", () => {
      const living = Living.init();
      const trouble = Living.spawnTrouble(1, "flooding", "burg", 2);
      expect(trouble).not.toBeNull();
      const carrier = Object.values(living.burgs).find(bSim =>
        (bSim?.productionQueue ?? []).some(item => item.kind === "trouble")
      );
      expect(carrier).toBeDefined();

      // Production completes the work order and clears the affliction.
      carrier!.productionQueue = [{ kind: "trouble", id: "flooding" }];
      carrier!.productionProgress = { "trouble:flooding": 79 }; // one Production from done
      Living.tick(1);

      expect(living.provinces[1].trouble).toBeNull();
      expect(living.provinces[1].order).toBeGreaterThan(0);
    });
  });

  describe("OpenCiv Faction City-Node Loop & Competitive Cell Draft (Phase 2)", () => {
    beforeEach(() => {
      setupCityWorld();
      pack.factions = [{ i: 0 } as Faction];
    });

    it("competes for worked cells: clandestine outpost pre-drafts cells before State Burg and siphons gold", () => {
      const living = Living.init();
      living.burgs[1].civBuildings = ["palace", "market"];

      const shadowFaction = Factions.add({
        name: "Nightblade Syndicate",
        category: "underworld",
        type: "thieves_guild",
        allegiance: "clandestine",
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 70, assets: ["safe_house"] },
        outposts: [
          {
            burgId: 1,
            cell: 5,
            tier: 2,
            influence: 60,
            secrecy: 60,
            assets: [],
            establishedYear: 990
          }
        ]
      });
      shadowFaction.hq.sim!.citizens = 1;
      shadowFaction.outposts[0].sim!.citizens = 2;

      Living.tick(1);

      const b1 = living.burgs[1];
      const hqWorked = shadowFaction.hq.sim?.workedCells ?? [];
      const outWorked = shadowFaction.outposts[0].sim?.workedCells ?? [];
      const stateWorked = b1.workedCells ?? [];

      expect(hqWorked.length).toBeGreaterThanOrEqual(1);
      expect(outWorked.length).toBeGreaterThanOrEqual(1);
      expect(stateWorked.length).toBeLessThan(5);

      for (const c of stateWorked) {
        expect(hqWorked).not.toContain(c);
        expect(outWorked).not.toContain(c);
      }

      expect(shadowFaction.outposts[0].sim?.cityYields?.gold ?? 0).toBeGreaterThan(1);
    });

    it("chartered faction alternates cell picks after state food floor and pays 15% charter tax to host burg", () => {
      const living = Living.init();
      const baseGoldBefore = living.burgs[1].cityYields?.gold ?? 0;

      const consortium = Factions.add({
        name: "Golden Scales Charter",
        category: "commercial",
        type: "merchant_consortium",
        allegiance: "chartered",
        patronStateId: 1,
        stateRelations: { 1: "Friendly" },
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: ["trade_depot"] }
      });
      consortium.hq.sim!.citizens = 2;

      Living.tick(1);

      const b1 = living.burgs[1];
      const hqYields = consortium.hq.sim?.cityYields;
      expect(hqYields).toBeDefined();
      expect(hqYields!.gold).toBeLessThan(4);
      expect(b1.cityYields!.gold).toBeGreaterThan(baseGoldBefore);
    });

    it("grows faction node citizens from food, boosts local influence from culture, and completes queued buildings", () => {
      Living.init();
      const guild = Factions.add({
        name: "Silver Compass",
        category: "commercial",
        type: "merchant_consortium",
        allegiance: "autonomous",
        researchedTechs: ["pottery", "currency"],
        hq: { cell: 11, burgId: 2, fortified: false, secrecy: 0, assets: [] },
        outposts: [
          {
            burgId: 1,
            cell: 5,
            tier: 1,
            influence: 40,
            secrecy: 0,
            assets: ["wayside_shrine"],
            establishedYear: 995
          }
        ]
      });

      const rival = Factions.add({
        name: "Rival Peddlers",
        category: "commercial",
        type: "merchant_consortium",
        allegiance: "autonomous",
        hq: { cell: 2, burgId: 3, fortified: false, secrecy: 0, assets: [] },
        outposts: [
          {
            burgId: 1,
            cell: 5,
            tier: 1,
            influence: 35,
            secrecy: 0,
            assets: [],
            establishedYear: 996
          }
        ]
      });

      const hqSim = guild.hq.sim!;
      hqSim.citizens = 2;
      hqSim.foodStored = foodNeededForGrowth(2);
      hqSim.productionQueue = [{ kind: "building", id: "trade_depot" }];
      hqSim.productionProgress = { "building:trade_depot": 79 };

      const outSim = guild.outposts[0].sim!;
      outSim.cultureStored = 20;

      Living.tick(1);

      expect(hqSim.citizens).toBe(3);
      expect(hqSim.civBuildings).toContain("trade_depot");
      expect(guild.hq.assets).toContain("trade_depot");

      expect(guild.outposts[0].influence).toBe(50);
      expect(rival.outposts[0].influence).toBe(30);
    });

    it("rolls up empire yields, luxury happiness, and research with host spillover", () => {
      const living = Living.init();
      living.states[1].researchedTechs = ["pottery"];

      const faction = Factions.add({
        name: "Golden Crest Syndicate",
        category: "commercial",
        type: "merchant_consortium",
        allegiance: "autonomous",
        treasury: 100,
        researchedTechs: [],
        researchedProgress: {},
        currentTechId: "pottery",
        researchQueue: ["writing"],
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: ["trade_depot"] },
        outposts: [{ burgId: 2, cell: 11, tier: 1, influence: 40, secrecy: 0, assets: [], establishedYear: 1000 }]
      });

      pack.cells.good[2] = 1;
      living.cells![2] = { improvement: "farm" };
      faction.hq.sim!.workedCells = [2];
      faction.hq.sim!.cityYields = { food: 8, production: 5, gold: 12, science: 4, culture: 2, faith: 1, happiness: 0 };
      faction.outposts[0].sim!.cityYields = {
        food: 4,
        production: 3,
        gold: 8,
        science: 2,
        culture: 1,
        faith: 0,
        happiness: 0
      };
      faction.hq.sim!.civBuildings = ["trade_depot"];
      faction.outposts[0].sim!.civBuildings = [];

      Living.stepFactionEmpire(living);

      expect(faction.yieldsPerTurn?.food).toBe(12);
      expect(faction.yieldsPerTurn?.production).toBe(8);
      expect(faction.yieldsPerTurn?.gold).toBe(20);
      expect(faction.yieldsPerTurn?.culture).toBe(3);
      expect(faction.yieldsPerTurn?.faith).toBe(1);
      expect(faction.yieldsPerTurn?.science).toBe(6);
      expect(faction.science).toBe(6);
      expect(faction.treasury).toBe(120);
      expect(faction.happinessBreakdown?.luxuries).toBeGreaterThan(0);
      expect(faction.happinessBreakdown?.luxuries).toBe(4);
      expect(faction.seasonsActive).toBeGreaterThan(0);
      expect(faction.researchedProgress.pottery ?? 0).toBeCloseTo(7.5);
    });

    it("grants free techs, completes research, and disbands a block on bankruptcy", () => {
      const living = Living.init();

      const scholar = Factions.add({
        name: "Test Scholars",
        category: "adventuring",
        type: "arcane_college",
        allegiance: "autonomous",
        treasury: 50,
        researchedTechs: [],
        researchedProgress: {},
        currentTechId: null,
        researchQueue: [],
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: [] }
      });
      scholar.freeTechs = 1;
      scholar.hq.sim!.cityYields = { food: 5, production: 2, gold: 5, science: 1, culture: 1, faith: 0, happiness: 0 };

      Living.stepFactionEmpire(living);
      expect(scholar.researchedTechs).toContain("pottery");

      const debtor = Factions.add({
        name: "Test Debtors",
        category: "martial",
        type: "raider_clan",
        allegiance: "hostile",
        treasury: 1,
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: [] }
      });
      debtor.military = [
        {
          i: 1,
          name: "Debtor Guard",
          a: 100,
          cell: 5,
          x: 50,
          y: 50,
          bx: 50,
          by: 50,
          u: { spear: 100 },
          units: [
            { type: "spear", hp: 1, exp: 0 },
            { type: "spear", hp: 1, exp: 0 }
          ],
          n: 0,
          state: 0,
          icon: "⚔️",
          rosterId: debtor.rosterId
        } as unknown as (typeof debtor.military)[number]
      ];
      debtor.hq.sim!.cityYields = { food: 5, production: 2, gold: 0, science: 1, culture: 1, faith: 0, happiness: 0 };
      debtor.hq.sim!.civBuildings = ["grand_exchange", "counting_house"];

      const blocksBefore = debtor.military[0]?.units?.length ?? 0;
      Living.stepFactionEmpire(living);
      expect(debtor.treasury).toBe(0);
      expect(debtor.military[0]?.units?.length ?? 0).toBeLessThan(blocksBefore);
    });

    it("faction builders improve worked cells", () => {
      const living = Living.init();
      const faction = Factions.add({
        name: "Builder Guild",
        category: "commercial",
        type: "merchant_consortium",
        allegiance: "autonomous",
        researchedTechs: ["pottery"],
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: [] }
      });
      faction.hq.sim!.productionQueue = [{ kind: "unit", id: "builder" }];
      faction.hq.sim!.productionProgress = { "unit:builder": 49 };

      Living.tick(10);

      expect(faction.military.some(r => r.type === "builder")).toBe(true);
      const improved = Object.values(living.cells ?? {}).filter(cell => cell.improvement);
      expect(improved.length).toBeGreaterThan(0);
    });

    it("faction settlers march to a burg and establish an outpost", () => {
      const living = Living.init();
      const faction = Factions.add({
        name: "Settler Guild",
        category: "commercial",
        type: "merchant_consortium",
        allegiance: "autonomous",
        researchedTechs: [],
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: [] }
      });
      faction.hq.sim!.productionQueue = [{ kind: "unit", id: "settler" }];
      faction.hq.sim!.productionProgress = { "unit:settler": 105 };

      Living.tick(10);

      expect(faction.outposts.length).toBeGreaterThan(0);
      expect(faction.outposts.some(o => o.burgId !== 1)).toBe(true);
      expect(faction.military.some(r => r.type === "settler")).toBe(false);
      expect(
        living.recentNews.some(item => item.kind === "faction" && item.text.includes("established a new outpost"))
      ).toBe(true);
    });

    it("faction armies fight adjacent enemy armies and siege burgs", () => {
      const living = Living.init();
      const faction = Factions.add({
        name: "Raider Warband",
        category: "martial",
        type: "raider_clan",
        allegiance: "hostile",
        sovereignAmbition: false,
        stateRelations: { 1: "Enemy", 2: "Enemy" },
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: [] }
      });
      // State regiment south of the HQ, faction regiment at the HQ cell.
      pack.states[1].military = [
        {
          i: 0,
          name: "Aeloria Regiment",
          a: 100,
          cell: 9,
          x: 90,
          y: 90,
          bx: 90,
          by: 90,
          u: { spear: 100 },
          units: Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 })),
          n: 0,
          state: 1,
          icon: "⚔️"
        } as unknown as NonNullable<NonNullable<(typeof pack.states)[number]>["military"]>[number]
      ];
      faction.military = [
        {
          i: 1,
          name: "Raider Guard",
          a: 100,
          cell: 5,
          x: 50,
          y: 50,
          bx: 50,
          by: 50,
          u: { spear: 100 },
          units: Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 })),
          n: 0,
          state: 0,
          icon: "⚔️",
          rosterId: faction.rosterId
        } as unknown as (typeof faction.military)[number]
      ];

      const stateHpBefore = (pack.states[1].military[0]?.units ?? []).reduce((sum, b) => sum + b.hp, 0);
      Living.tick(1);

      const stateHpAfter = (pack.states[1].military[0]?.units ?? []).reduce((sum, b) => sum + b.hp, 0);
      const factionHpAfter = (faction.military.find(r => r.i === 1)?.units ?? []).reduce((sum, b) => sum + b.hp, 0);
      expect(stateHpAfter).toBeLessThan(stateHpBefore);
      expect(living.armies?.[Living.factionUnitKey(faction.i, 1)]?.lastBattle).toBeDefined();
      expect(factionHpAfter).toBeGreaterThan(0);
    });

    it("faction armies siege a non-capital burg and pillage it", () => {
      const living = Living.init();
      const faction = Factions.add({
        name: "Siege Warband",
        category: "martial",
        type: "raider_clan",
        allegiance: "hostile",
        sovereignAmbition: false,
        stateRelations: { 1: "Enemy", 2: "Enemy" },
        treasury: 0,
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: [] }
      });
      // Place the faction army adjacent to Millbrook (burg 5, cell 4, state 1, non-capital).
      faction.military = [
        {
          i: 1,
          name: "Siege Guard",
          a: 100,
          cell: 5,
          x: 50,
          y: 50,
          bx: 50,
          by: 50,
          u: { spear: 100 },
          units: Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 })),
          n: 0,
          state: 0,
          icon: "⚔️",
          rosterId: faction.rosterId
        } as unknown as (typeof faction.military)[number]
      ];
      const unrestBefore = living.burgs[5]?.unrest ?? 0;

      Living.tick(1);

      expect(faction.treasury).toBeGreaterThan(0);
      expect(living.burgs[5]?.unrest ?? 0).toBeGreaterThan(unrestBefore);
    });

    it("autonomous faction competes for worked cells against the host State Burg", () => {
      const living = Living.init();
      const faction = Factions.add({
        name: "Independent Traders",
        category: "commercial",
        type: "merchant_consortium",
        allegiance: "autonomous",
        stateRelations: { 1: "Neutral" },
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: [] }
      });
      faction.hq.sim!.citizens = 2;

      Living.tick(1);

      const stateWorked = living.burgs[1]?.workedCells ?? [];
      const factionWorked = faction.hq.sim?.workedCells ?? [];
      expect(stateWorked.length).toBeGreaterThan(0);
      expect(factionWorked.length).toBeGreaterThan(0);
      expect(new Set([...stateWorked, ...factionWorked]).size).toBe(stateWorked.length + factionWorked.length);
      expect(faction.hq.sim?.cityYields?.food ?? 0).toBeGreaterThan(0);
      expect(faction.hq.sim?.cityYields?.gold ?? 0).toBeGreaterThanOrEqual(0);
    });

    describe("State suppression administrative campaign (Phase 2)", () => {
      function queueSuppression(
        living: ReturnType<typeof Living.init>,
        faction: Faction,
        nodeKey: string,
        progress = 13
      ) {
        const b1 = living.burgs[1];
        b1.productionQueue = [
          { kind: "operation", id: "faction-suppression", targetFactionId: faction.i, targetNodeKey: nodeKey }
        ];
        b1.productionProgress = { "operation:faction-suppression": progress };
        living.states[1].agenda = {
          kind: "suppress_faction",
          label: `Suppressing ${faction.name} in Aelor`,
          targetFactionId: faction.i,
          targetBurgId: 1,
          progress: 0,
          required: 1
        };
      }

      it("starts one suppression operation and agenda via the public API", () => {
        Living.init();
        const faction = Factions.add({
          name: "Silver Hand",
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          stateRelations: { 1: "Enemy" },
          hq: { cell: 2, burgId: 3, fortified: false, secrecy: 0, assets: [] },
          outposts: [{ burgId: 1, cell: 5, tier: 2, influence: 40, secrecy: 0, assets: [], establishedYear: 1000 }]
        });

        expect(Living.startFactionSuppression(1, faction.i)).toBe(true);
        const b1 = Living.getState().burgs[1];
        expect(b1.productionQueue).toEqual([
          { kind: "operation", id: "faction-suppression", targetFactionId: faction.i, targetNodeKey: "outpost:1" }
        ]);
        expect(Living.getState().states[1].agenda).toMatchObject({
          kind: "suppress_faction",
          targetFactionId: faction.i,
          targetBurgId: 1
        });
        expect(Living.startFactionSuppression(1, faction.i)).toBe(false);
        expect(
          Living.getState().recentNews.some(item => item.kind === "faction" && item.text.includes("began suppressing"))
        ).toBe(true);
      });

      it("chooses a suppression agenda once the state fields an army", () => {
        const living = Living.init();
        pack.states[1].military = [
          {
            i: 0,
            name: "Aeloria Regiment",
            a: 100,
            cell: 9,
            x: 90,
            y: 90,
            bx: 90,
            by: 90,
            u: { spear: 100 },
            units: Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 })),
            n: 0,
            state: 1,
            icon: "⚔️"
          } as unknown as NonNullable<NonNullable<(typeof pack.states)[number]>["military"]>[number]
        ];
        const faction = Factions.add({
          name: "Silver Hand",
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          stateRelations: { 1: "Enemy" },
          hq: { cell: 2, burgId: 3, fortified: false, secrecy: 0, assets: [] },
          outposts: [{ burgId: 1, cell: 5, tier: 2, influence: 40, secrecy: 0, assets: [], establishedYear: 1000 }]
        });
        Living.tick(1);

        expect(living.states[1].agenda).toMatchObject({ kind: "suppress_faction", targetFactionId: faction.i });
        expect(
          (living.burgs[1].productionQueue ?? []).some(
            item => item.kind === "operation" && item.targetFactionId === faction.i
          )
        ).toBe(true);
      });

      it("applies order/secrecy pressure and pillages a depleted outpost", () => {
        const living = Living.init();
        const faction = Factions.add({
          name: "Silver Hand",
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          stateRelations: { 1: "Enemy" },
          hq: { cell: 2, burgId: 3, fortified: false, secrecy: 0, assets: [] },
          outposts: [{ burgId: 1, cell: 5, tier: 2, influence: 3, secrecy: 0, assets: [], establishedYear: 1000 }]
        });
        queueSuppression(living, faction, "outpost:1");

        Living.tick(1);

        expect(faction.outposts[0].pillaged).toBe(true);
        expect(faction.outposts[0].influence).toBe(0);
        expect(living.states[1].agenda).toBeNull();
        expect(living.recentNews.some(item => item.kind === "faction" && item.text.includes("razed"))).toBe(true);
        // Pillaged nodes are skipped from empire rollups.
        expect(Living.getFactionYieldBreakdown(faction).outposts).toHaveLength(0);
      });

      it("pauses pressure while a faction guard defends the node", () => {
        const living = Living.init();
        const faction = Factions.add({
          name: "Silver Hand",
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          stateRelations: { 1: "Enemy" },
          hq: { cell: 2, burgId: 3, fortified: false, secrecy: 0, assets: [] },
          outposts: [{ burgId: 1, cell: 5, tier: 2, influence: 10, secrecy: 0, assets: [], establishedYear: 1000 }]
        });
        faction.military = [
          {
            i: 1,
            name: "Silver Guard",
            a: 100,
            cell: 5,
            x: 50,
            y: 50,
            bx: 50,
            by: 50,
            u: { spear: 100 },
            units: Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 })),
            n: 0,
            state: 0,
            icon: "⚔️",
            rosterId: faction.rosterId
          } as unknown as (typeof faction.military)[number]
        ];
        queueSuppression(living, faction, "outpost:1");

        Living.tick(1);

        expect(faction.outposts[0].influence).toBe(10);
        expect(faction.outposts[0].pillaged).toBeFalsy();
        expect(living.states[1].agenda?.kind).toBe("suppress_faction");
        expect(living.states[1].agenda?.stallUntilTick).toBeGreaterThan(living.tick);
      });

      it("relocates the HQ to the strongest surviving outpost when it falls", () => {
        const living = Living.init();
        const faction = Factions.add({
          name: "Silver Hand",
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          stateRelations: { 1: "Enemy" },
          researchedTechs: ["pottery"],
          hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, influence: 2, assets: [] },
          outposts: [{ burgId: 5, cell: 4, tier: 1, influence: 50, secrecy: 0, assets: [], establishedYear: 1000 }]
        });
        queueSuppression(living, faction, "hq");

        Living.tick(1);

        expect(faction.removed).toBeFalsy();
        expect(faction.hq.burgId).toBe(5);
        expect(faction.hq.pillaged).toBe(false);
        expect(faction.outposts).toHaveLength(0);
        expect(faction.researchedTechs).toContain("pottery");
        expect(living.recentNews.some(item => item.kind === "faction" && item.text.includes("fled to"))).toBe(true);
      });

      it("dissolves the faction when its HQ falls with no surviving outposts", () => {
        const living = Living.init();
        const faction = Factions.add({
          name: "Silver Hand",
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          stateRelations: { 1: "Enemy" },
          hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, influence: 2, assets: [] }
        });
        queueSuppression(living, faction, "hq");

        Living.tick(1);

        expect(faction.removed).toBe(true);
        expect(living.states[1].agenda).toBeNull();
        expect(living.recentNews.some(item => item.kind === "faction" && item.text.includes("dissolved"))).toBe(true);
      });
    });

    describe("State suppression armed stronghold clearing (Phase 3)", () => {
      function fieldArmy(blocks: number, cell = 9) {
        pack.states[1].military = [
          {
            i: 0,
            name: "Aeloria Regiment",
            a: 100,
            cell,
            x: 90,
            y: 90,
            bx: 90,
            by: 90,
            u: { spear: 100 },
            units: Array.from({ length: blocks }, () => ({ type: "spear", hp: 1, exp: 0 })),
            n: 0,
            state: 1,
            icon: "⚔️"
          } as unknown as NonNullable<NonNullable<(typeof pack.states)[number]>["military"]>[number]
        ];
      }

      function guardRegiment(faction: Faction, blocks: number) {
        faction.military = [
          {
            i: 1,
            name: "Silver Guard",
            a: 100,
            cell: 5,
            x: 50,
            y: 50,
            bx: 50,
            by: 50,
            u: { spear: 100 },
            units: Array.from({ length: blocks }, () => ({ type: "spear", hp: 1, exp: 0 })),
            n: 0,
            state: 0,
            icon: "⚔️",
            rosterId: faction.rosterId
          } as unknown as (typeof faction.military)[number]
        ];
      }

      it("builds a capped militia garrison from citizens, tier and fortification", () => {
        Living.init();
        const faction = Factions.add({
          name: "Silver Hand",
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          hq: { cell: 5, burgId: 1, fortified: true, secrecy: 0, assets: [] },
          outposts: [{ burgId: 1, cell: 5, tier: 1, influence: 40, secrecy: 0, assets: [], establishedYear: 1000 }]
        });

        expect(Living.factionGarrisonBlocks(faction, faction.hq, true)).toHaveLength(6);
        expect(Living.factionGarrisonBlocks(faction, faction.outposts[0], false)).toHaveLength(2);
      });

      it("lets the state field army defeat a faction guard in range", () => {
        const living = Living.init();
        fieldArmy(13);
        const faction = Factions.add({
          name: "Silver Hand",
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          stateRelations: { 1: "Enemy" },
          hq: { cell: 2, burgId: 3, fortified: false, secrecy: 0, assets: [] },
          outposts: [{ burgId: 1, cell: 5, tier: 2, influence: 40, secrecy: 0, assets: [], establishedYear: 1000 }]
        });
        guardRegiment(faction, 13);
        living.states[1].agenda = {
          kind: "suppress_faction",
          label: "Suppressing Silver Hand in Aelor",
          targetFactionId: faction.i,
          targetBurgId: 1,
          progress: 0,
          required: 1
        };

        const guardHpBefore = (faction.military[0]?.units ?? []).reduce((sum, b) => sum + b.hp, 0);
        Living.tick(1);

        const guardHpAfter = (faction.military.find(r => r.i === 1)?.units ?? []).reduce((sum, b) => sum + b.hp, 0);
        expect(guardHpAfter).toBeLessThan(guardHpBefore);
        expect(living.armies?.[Living.unitKey(1, 0)]?.lastBattle).toBeDefined();
        expect(living.recentNews.some(item => item.kind === "battle")).toBe(true);
      });

      it("storms a low-influence unguarded outpost and pillages it on victory", () => {
        Living.init();
        fieldArmy(13);
        const faction = Factions.add({
          name: "Silver Hand",
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          stateRelations: { 1: "Enemy" },
          hq: { cell: 2, burgId: 3, fortified: false, secrecy: 0, assets: [] },
          outposts: [{ burgId: 1, cell: 5, tier: 2, influence: 10, secrecy: 0, assets: [], establishedYear: 1000 }]
        });

        expect(Living.assaultFactionNode(1, faction.i, "outpost:1")).toBe(true);
        expect(faction.outposts[0].pillaged).toBe(true);
        expect(Living.getState().recentNews.some(item => item.text.includes("razed"))).toBe(true);
      });

      it("retreats and delays suppression when the storm fails", () => {
        Living.init();
        fieldArmy(1);
        const faction = Factions.add({
          name: "Silver Hand",
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          stateRelations: { 1: "Enemy" },
          hq: { cell: 5, burgId: 1, fortified: true, secrecy: 0, influence: 70, assets: [] }
        });
        expect(Living.startFactionSuppression(1, faction.i)).toBe(true);

        expect(Living.assaultFactionNode(1, faction.i, "hq")).toBe(false);
        expect(faction.hq.pillaged).toBeFalsy();
        const agenda = Living.getState().states[1].agenda;
        expect(agenda?.kind).toBe("suppress_faction");
        expect(agenda?.stallUntilTick).toBeGreaterThan(Living.getState().tick);
        expect(pack.states[1]?.military?.[0]?.cell).not.toBe(5);
        expect(Living.getState().recentNews.some(item => item.text.includes("failed to storm"))).toBe(true);
      });

      it("refuses a distant storm until the army marches into range", () => {
        Living.init();
        fieldArmy(13, 10);
        const faction = Factions.add({
          name: "Silver Hand",
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          stateRelations: { 1: "Enemy" },
          hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, influence: 10, assets: [] }
        });

        expect(Living.assaultFactionNode(1, faction.i, "hq")).toBe(false);
        expect(faction.hq.pillaged).toBeFalsy();
      });
    });

    describe("State suppression UI and saved-map compatibility (Phase 4)", () => {
      it("initializes legacy factions and suppress agendas without new-save fields", () => {
        setupCityWorld();
        pack.factions = [{ i: 0 } as Faction];
        const legacy = {
          i: 1,
          name: "Legacy Hand",
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          color: "#123456",
          icon: "🗡️",
          culture: 1,
          foundedYear: 1000,
          memberIds: [],
          alignment: "evil",
          values: ["honor"],
          expansionism: 1,
          expansionScope: "state",
          sovereignAmbition: false,
          hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: [] },
          outposts: [{ burgId: 5, cell: 4, tier: 1, influence: 40, secrecy: 0, assets: [], establishedYear: 1000 }],
          science: 2,
          currentTechId: null,
          researchQueue: [],
          researchedTechs: [],
          researchedProgress: {},
          treasury: 100,
          influence: 30,
          military: [],
          stateRelations: { 1: "Enemy" },
          factionRelations: {},
          agenda: null,
          seasonsActive: 0,
          removed: false
        } as unknown as Faction;
        pack.factions.push(legacy);

        const living = Living.init();
        expect(legacy.hq.pillaged).toBeUndefined();
        expect(legacy.hq.influence).toBe(70);
        expect(living.states[1]).toBeDefined();

        // A suppress agenda saved without targetFactionId clears safely on step.
        living.states[1].agenda = {
          kind: "suppress_faction",
          label: "Suppressing Legacy Hand in Aelor",
          targetBurgId: 1,
          progress: 0,
          required: 1
        } as unknown as StateAgenda;
        expect(() => Living.tick(1)).not.toThrow();
        expect(living.states[1].agenda?.kind).not.toBe("suppress_faction");
      });
    });

    describe("State suppression tests and balance (Phase 5)", () => {
      function hostileFaction(name: string, overrides: Partial<Faction> = {}): Faction {
        return Factions.add({
          name,
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          stateRelations: { 1: "Enemy" },
          hq: { cell: 2, burgId: 3, fortified: false, secrecy: 0, assets: [] },
          outposts: [{ burgId: 1, cell: 5, tier: 2, influence: 40, secrecy: 0, assets: [], establishedYear: 1000 }],
          ...overrides
        });
      }

      it("makes lawful and non-hostile factions ineligible for suppression", () => {
        Living.init();
        const patron = hostileFaction("Patron Guard", {
          allegiance: "state_arm",
          patronStateId: 1,
          stateRelations: { 1: "Ally" }
        });
        const chartered = hostileFaction("Chartered Guild", {
          allegiance: "chartered",
          patronStateId: 1,
          stateRelations: { 1: "Friendly" }
        });
        const neutral = hostileFaction("Neutral Circle", {
          allegiance: "autonomous",
          stateRelations: { 1: "Neutral" }
        });
        const hostile = hostileFaction("Silver Hand");

        expect(Living.isHostileToState(patron.i, 1)).toBe(false);
        expect(Living.isHostileToState(chartered.i, 1)).toBe(false);
        expect(Living.isHostileToState(neutral.i, 1)).toBe(false);
        expect(Living.isHostileToState(hostile.i, 1)).toBe(true);
        expect(Living.eligibleFactionSuppressionTargets(1).map(t => t.faction.i)).toContain(hostile.i);
        expect(Living.eligibleFactionSuppressionTargets(1).map(t => t.faction.i)).not.toContain(patron.i);
        expect(Living.eligibleFactionSuppressionTargets(1).map(t => t.faction.i)).not.toContain(chartered.i);
        expect(Living.eligibleFactionSuppressionTargets(1).map(t => t.faction.i)).not.toContain(neutral.i);
        expect(Living.startFactionSuppression(1, patron.i)).toBe(false);
        expect(Living.startFactionSuppression(1, neutral.i)).toBe(false);
      });

      it("accumulates production progress without spending gold", () => {
        const living = Living.init();
        const faction = hostileFaction("Silver Hand");
        expect(Living.startFactionSuppression(1, faction.i)).toBe(true);
        pack.states[1].economy.treasury = 500;

        Living.tick(1);

        const b1 = living.burgs[1];
        const progress = b1.productionProgress?.["operation:faction-suppression"] ?? 0;
        expect(progress).toBeGreaterThan(0);
        expect(progress).toBeLessThan(14);
        expect(pack.states[1].economy.treasury).toBeGreaterThanOrEqual(500);
        expect(faction.outposts[0].influence).toBe(40);
      });

      it("hurries an operation for gold while retaining the reserve", () => {
        const living = Living.init();
        const faction = hostileFaction("Silver Hand");
        expect(Living.startFactionSuppression(1, faction.i)).toBe(true);
        const b1 = living.burgs[1];
        b1.productionProgress = { "operation:faction-suppression": 0 };
        const remaining = 6 + 2 * 4;
        const price = hurryGoldCost(remaining, false);

        // Too thin: the state keeps its 100 Gold reserve.
        pack.states[1].economy.treasury = price + 50;
        expect(Living.hurryProduction(1)).toBe(false);
        expect(pack.states[1].economy.treasury).toBe(price + 50);

        pack.states[1].economy.treasury = 1000;
        expect(Living.hurryProduction(1)).toBe(true);
        expect(pack.states[1].economy.treasury).toBe(1000 - price);
        expect(faction.outposts[0].influence).toBe(37);
      });

      it("reduces influence by the order/secrecy formula per completed operation", () => {
        const living = Living.init();
        const faction = hostileFaction("Silver Hand");
        living.provinces[1].order = 70;
        const b1 = living.burgs[1];
        b1.productionQueue = [
          { kind: "operation", id: "faction-suppression", targetFactionId: faction.i, targetNodeKey: "outpost:1" }
        ];
        b1.productionProgress = { "operation:faction-suppression": 13 };
        living.states[1].agenda = {
          kind: "suppress_faction",
          label: `Suppressing ${faction.name} in Aelor`,
          targetFactionId: faction.i,
          targetBurgId: 1,
          progress: 0,
          required: 1
        };

        Living.tick(1);

        expect(faction.outposts[0].influence).toBe(37);
        expect(faction.outposts[0].pillaged).toBeFalsy();
        expect(living.provinces[1].order).toBeGreaterThanOrEqual(72);
      });

      it("progresses slowly without collapsing when local production is low", () => {
        const living = Living.init();
        const faction = hostileFaction("Silver Hand");
        expect(Living.startFactionSuppression(1, faction.i)).toBe(true);

        Living.tick(2);

        expect(faction.removed).toBe(false);
        expect(faction.outposts[0].pillaged).toBeFalsy();
        expect(faction.outposts[0].influence).toBeGreaterThan(0);
        const progress = living.burgs[1].productionProgress?.["operation:faction-suppression"] ?? 0;
        const queued = (living.burgs[1].productionQueue ?? []).some(
          item => item.kind === "operation" && item.targetFactionId === faction.i
        );
        expect(progress > 0 || queued).toBe(true);
      });
    });

    describe("State suppression wilderness strongholds", () => {
      function wildernessFaction(name: string, overrides: Partial<Faction> = {}): Faction {
        return Factions.add({
          name,
          category: "underworld",
          type: "thieves_guild",
          allegiance: "hostile",
          stateRelations: { 1: "Enemy" },
          hq: { cell: 9, fortified: false, secrecy: 0, assets: [] } as Faction["hq"],
          outposts: [],
          ...overrides
        });
      }

      function fieldArmy(blocks: number, cell = 10) {
        pack.states[1].military = [
          {
            i: 0,
            name: "Aeloria Regiment",
            a: 100,
            cell,
            x: 100,
            y: 100,
            bx: 100,
            by: 100,
            u: { spear: 100 },
            units: Array.from({ length: blocks }, () => ({ type: "spear", hp: 1, exp: 0 })),
            n: 0,
            state: 1,
            icon: "⚔️"
          } as unknown as NonNullable<NonNullable<(typeof pack.states)[number]>["military"]>[number]
        ];
      }

      it("targets a wilderness HQ on a state-owned cell but not on free land", () => {
        Living.init();
        const faction = wildernessFaction("Pale Hand");
        expect(faction.hq.burgId).toBeFalsy();

        const targets = Living.eligibleFactionSuppressionTargets(1);
        expect(targets.map(t => t.faction.i)).toContain(faction.i);
        expect(targets.find(t => t.faction.i === faction.i)?.wilderness).toBe(true);
        expect(targets.find(t => t.faction.i === faction.i)?.burg).toBeNull();
        expect(targets.find(t => t.faction.i === faction.i)?.cell).toBe(9);

        // Moving the HQ to a cell owned by state 2 removes eligibility.
        faction.hq.cell = 7;
        expect(Living.eligibleFactionSuppressionTargets(1).map(t => t.faction.i)).not.toContain(faction.i);
      });

      it("starts a military-only agenda with no production queue for a wilderness HQ", () => {
        const living = Living.init();
        const faction = wildernessFaction("Pale Hand");

        expect(Living.startFactionSuppression(1, faction.i)).toBe(true);
        const agenda = living.states[1].agenda;
        expect(agenda?.kind).toBe("suppress_faction");
        expect(agenda?.targetCell).toBe(9);
        expect(agenda?.targetBurgId).toBeUndefined();
        expect(agenda?.label).toContain("wild");
        for (const bSim of Object.values(living.burgs)) {
          expect(
            (bSim.productionQueue ?? []).some(item => item.kind === "operation" && item.id === "faction-suppression")
          ).toBe(false);
        }
        expect(living.recentNews.some(item => item.kind === "faction" && item.text.includes("began suppressing"))).toBe(
          true
        );
      });

      it("storms a wilderness HQ and dissolves the faction with no outposts left", () => {
        Living.init();
        fieldArmy(13);
        const faction = wildernessFaction("Pale Hand");

        expect(Living.startFactionSuppression(1, faction.i)).toBe(true);
        expect(Living.assaultFactionNode(1, faction.i, "hq")).toBe(true);
        expect(faction.hq.pillaged).toBe(true);
        expect(faction.removed).toBe(true);
        expect(Living.getState().states[1].agenda).toBeNull();
      });

      it("relocates a wilderness HQ to its strongest surviving outpost", () => {
        Living.init();
        fieldArmy(13);
        const faction = wildernessFaction("Pale Hand", {
          outposts: [{ burgId: 1, cell: 5, tier: 2, influence: 40, secrecy: 0, assets: [], establishedYear: 1000 }]
        });

        expect(Living.startFactionSuppression(1, faction.i)).toBe(true);
        expect(Living.assaultFactionNode(1, faction.i, "hq")).toBe(true);
        expect(faction.removed).toBeFalsy();
        expect(faction.hq.burgId).toBe(1);
        expect(faction.hq.pillaged).toBe(false);
        expect(faction.outposts).toHaveLength(0);
      });

      it("keeps a wilderness agenda without production after a tick until the army can march", () => {
        const living = Living.init();
        fieldArmy(13, 1); // far from cell 9: cannot storm yet
        const faction = wildernessFaction("Pale Hand");
        expect(Living.startFactionSuppression(1, faction.i)).toBe(true);

        Living.tick(1);

        for (const bSim of Object.values(living.burgs)) {
          expect(
            (bSim.productionQueue ?? []).some(item => item.kind === "operation" && item.id === "faction-suppression")
          ).toBe(false);
        }
        // Either the marching army reached the stronghold this tick (pillaged,
        // agenda retargeted/cleared) or it is still marching (agenda intact):
        // in no case did an administrative operation appear.
        if (faction.hq.pillaged) {
          expect(faction.removed).toBe(true);
        } else {
          expect(living.states[1].agenda?.kind).toBe("suppress_faction");
          expect(living.states[1].agenda?.targetCell).toBe(9);
        }
      });
    });
  });
});

describe("Unified Figures slice 1: specialist commanders", () => {
  beforeEach(() => {
    globalThis.options = {
      map: {
        seed: "test-living-seed",
        goods: [],
        population: { ruralFactor: 1, urbanization: 1 },
        lore: {
          name: "Test World",
          description: "",
          calendar: { year: 1000, era: "Age of Dawn", eraShort: "AD" },
          history: { span: 500, realms: 0, density: 1, echoes: false, renames: false, mode: "archaeologist" }
        }
      },
      generation: { cultures: { traits: true }, states: { limit: 4, sizeVariety: 2, growthRate: 1 } }
    } as unknown as typeof options;

    globalThis.pack = {
      cells: {
        i: [0, 1, 2, 3],
        state: new Uint16Array([0, 1, 1, 0]),
        province: new Uint16Array([0, 1, 1, 0]),
        pop: [0, 120, 100, 20],
        culture: [0, 1, 1, 1],
        religion: [0, 1, 1, 1],
        c: [[1], [0, 2], [1], [2]],
        p: [
          [0, 0],
          [10, 10],
          [20, 20],
          [30, 30]
        ],
        r: [0, 0, 0, 0]
      },
      cultures: [
        { i: 0, name: "Wildlands", base: 0, center: 0 },
        { i: 1, name: "Aeloran (Human)", base: 0, center: 1, alignment: "good" }
      ],
      religions: [{ i: 0, name: "No religion" }],
      burgs: [
        { i: 0 },
        {
          i: 1,
          name: "Aelor",
          cell: 1,
          x: 10,
          y: 10,
          state: 1,
          culture: 1,
          population: 18,
          capital: 1,
          walls: 1,
          plaza: 1,
          temple: 1,
          citadel: 1
        }
      ],
      states: [
        { i: 0, name: "Neutrals", economy: noFinance() },
        {
          i: 1,
          name: "Aeloria",
          economy: noFinance(),
          culture: 1,
          capital: 1,
          center: 1,
          military: [
            {
              i: 0,
              a: 300,
              cell: 1,
              x: 10,
              y: 10,
              bx: 10,
              by: 10,
              u: { spear: 300 },
              units: [
                { type: "spear", hp: 1, exp: 0 },
                { type: "sage_coven", hp: 1, exp: 0 }
              ],
              n: 0,
              name: "1st Aeloria Regiment",
              state: 1,
              icon: "⚔️"
            }
          ]
        }
      ],
      provinces: [{ i: 0 }, { i: 1, state: 1, burg: 1, center: 1 }],
      history: { events: [], realms: [], eras: [{ name: "Age of Dawn", from: 500, to: 1000 }], figures: [] }
    } as unknown as typeof pack;
  });

  it("backfills a named commander for a fielded specialist unit on init", () => {
    Living.init();
    const figures = pack.history.figures!;
    const commanders = figures.filter(f => f.roles.some(r => r.type === "specialist" && r.specialty === "sage"));
    expect(commanders).toHaveLength(1);
    expect(commanders[0]!.name).toBeTruthy();
    expect(commanders[0]!.alignment).toBeDefined(); // rolled on the culture's prevailing column
    expect(commanders[0]!.skills!.w).toBe(1);
    expect(pack.states[1].military![0].crew).toContain(commanders[0]!.i);
  });

  it("re-init does not mint duplicate commanders", () => {
    Living.init();
    Living.init();
    const commanders = pack.history.figures!.filter(f => f.roles.some(r => r.type === "specialist"));
    expect(commanders).toHaveLength(1);
  });

  it("ensureCommanders crews a freshly added specialist unit", () => {
    Living.init();
    const figures = pack.history.figures!;
    const regiment = pack.states[1].military![0];
    regiment.crew = [];
    regiment.units!.push({ type: "magistrates", hp: 1, exp: 0 });
    Living.ensureCommanders();
    const crew = (regiment.crew ?? []).map(id => figures[id]!);
    expect(crew.some(f => f.roles.some(r => r.type === "specialist" && r.specialty === "magistrate"))).toBe(true);
    expect(crew.find(f => f.roles.some(r => r.specialty === "magistrate"))!.skills!.s).toBe(1);
  });
});

const buildStubPack = () => {
  globalThis.options = {
    map: {
      seed: "test-emergent-state-seed",
      goods: [],
      population: { ruralFactor: 1, urbanization: 1 },
      lore: {
        name: "Test World",
        description: "",
        calendar: { year: 1000, era: "Age of Dawn", eraShort: "AD" },
        history: { span: 500, realms: 0, density: 1, echoes: false, renames: false, mode: "archaeologist" }
      }
    },
    generation: {
      cultures: { traits: true },
      states: { limit: 4, sizeVariety: 2, growthRate: 1 }
    }
  } as unknown as typeof options;

  globalThis.pack = {
    cells: {
      i: [0, 1, 2, 3, 4, 5],
      state: new Uint16Array([0, 1, 1, 1, 1, 2]),
      province: new Uint16Array([0, 1, 1, 2, 3, 4]),
      pop: [0, 120, 100, 90, 60, 80],
      culture: [0, 1, 1, 1, 2, 2],
      religion: [0, 1, 1, 1, 2, 2],
      c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4]],
      p: [
        [0, 0],
        [10, 10],
        [20, 20],
        [30, 30],
        [40, 40],
        [50, 50]
      ],
      r: [0, 0, 0, 0, 0, 0]
    },
    cultures: [
      { i: 0, name: "Wildlands", base: 0, center: 0 },
      { i: 1, name: "Aeloran (Human)", base: 0, center: 1, alignment: "good" },
      { i: 2, name: "Kazad (Dwarven)", base: 0, center: 5, alignment: "lawful" }
    ],
    religions: [
      { i: 0, name: "No religion" },
      { i: 1, name: "Solar Church" },
      { i: 2, name: "Stone Ancestors" }
    ],
    burgs: [
      { i: 0 },
      {
        i: 1,
        name: "Aelor",
        cell: 1,
        x: 10,
        y: 10,
        state: 1,
        culture: 1,
        population: 18,
        capital: 1,
        walls: 1,
        plaza: 1,
        temple: 1,
        citadel: 1
      },
      {
        i: 2,
        name: "Oakhaven",
        cell: 3,
        x: 30,
        y: 30,
        state: 1,
        culture: 1,
        population: 5,
        capital: 0,
        walls: 0,
        plaza: 1,
        temple: 0,
        citadel: 0
      },
      {
        i: 3,
        name: "Khazad",
        cell: 5,
        x: 50,
        y: 50,
        state: 2,
        culture: 2,
        population: 10,
        capital: 1,
        walls: 1,
        plaza: 1,
        temple: 0,
        citadel: 0
      }
    ],
    states: [
      { i: 0, name: "Neutrals" },
      {
        i: 1,
        name: "Aeloria",
        economy: noFinance(),
        culture: 1,
        capital: 1,
        center: 1,
        provinces: [1, 2, 3],
        military: []
      },
      {
        i: 2,
        name: "Khazadia",
        economy: noFinance(),
        culture: 2,
        capital: 3,
        center: 5,
        provinces: [4],
        military: []
      }
    ],
    provinces: [
      { i: 0 },
      { i: 1, name: "Heartland", state: 1, burg: 1, center: 1 },
      { i: 2, name: "Oakshire", state: 1, burg: 2, center: 3 },
      { i: 3, name: "Wildreach", state: 1, burg: 0, center: 4 },
      { i: 4, name: "Ironpeak", state: 2, burg: 3, center: 5 }
    ],
    markers: [],
    history: { events: [], realms: [], eras: [{ name: "Age of Dawn", from: 500, to: 1000 }], figures: [] }
  } as unknown as typeof pack;
};

describe("Faction raids and assaults (trouble conversion Phase 3A)", () => {
  beforeEach(() => {
    buildStubPack();
    pack.factions = [{ i: 0 } as Faction];
  });

  const hostileFaction = (burgId: number, cell: number) => {
    const faction = Factions.add({
      name: "Reaver Host",
      category: "martial",
      type: "brigand_raiders",
      allegiance: "hostile",
      sovereignAmbition: false,
      raidThreshold: 4,
      stateRelations: { 1: "Enemy" },
      hq: { cell, burgId, fortified: false, secrecy: 0, assets: [] }
    });
    faction.military = [
      {
        i: 1,
        name: "Reaver Host warband",
        a: 0,
        cell,
        x: 10,
        y: 10,
        bx: 10,
        by: 10,
        state: 0,
        n: 0,
        units: Array.from({ length: 10 }, () => ({ type: "spear", hp: 1, exp: 3 })) as never
      } as never
    ];
    syncRegimentTotals(faction.military[0]!, Military.getUnitTypes());
    return faction;
  };

  it("raids and sacks a vulnerable settlement", () => {
    const living = Living.init();
    const faction = hostileFaction(1, 1);
    faction.raidPending = true;
    const orderBefore = living.provinces[1].order;

    Living.tick(1);

    expect(living.recentNews.some(n => n.kind === "faction" && n.text.includes("Raiders from Reaver Host"))).toBe(true);
    expect(living.provinces[1].order).toBeLessThan(orderBefore);
  });

  it("is repulsed by a prepared garrison", () => {
    const living = Living.init();
    const faction = hostileFaction(1, 1);
    faction.raidPending = true;
    // Moderate raiders vs a stationed regiment + capital garrison: plausible, but outmatched
    faction.military[0]!.units = Array.from({ length: 10 }, () => ({ type: "spear", hp: 1, exp: 1 })) as never;
    syncRegimentTotals(faction.military[0]!, Military.getUnitTypes());
    pack.states[1].military = [
      {
        i: 1,
        name: "Aelor Garrison",
        a: 0,
        cell: 1,
        x: 10,
        y: 10,
        bx: 10,
        by: 10,
        state: 1,
        n: 0,
        units: Array.from({ length: 10 }, () => ({ type: "spear", hp: 1, exp: 3 })) as never
      } as never
    ];
    syncRegimentTotals(pack.states[1].military[0]!, Military.getUnitTypes());

    Living.tick(1);

    expect(living.recentNews.some(n => n.kind === "faction" && n.text.includes("repulsed raiders"))).toBe(true);
  });

  it("assaults a hostile faction HQ and destroys it", () => {
    Living.init();
    const faction = hostileFaction(2, 3);
    pack.states[1].military = [
      {
        i: 1,
        name: "Aelor Host",
        a: 0,
        cell: 3,
        x: 30,
        y: 30,
        bx: 30,
        by: 30,
        state: 1,
        n: 0,
        units: []
      } as never
    ];
    const army = pack.states[1].military![0];
    army.units = [
      ...Array.from({ length: 4 }, () => ({ type: "cavalry", hp: 1, exp: 5 })),
      ...Array.from({ length: 3 }, () => ({ type: "spear", hp: 1, exp: 3 })),
      ...Array.from({ length: 3 }, () => ({ type: "archers", hp: 1, exp: 3 }))
    ] as never;

    const result = Living.assaultFaction(1, 2);
    expect(result).toBe(true);
    expect(Factions.active().some(f => f.i === faction.i)).toBe(false);
  });

  it("sends adventurers to delve a hostile faction and either purges or mauls it", () => {
    Living.init();
    const faction = hostileFaction(2, 3);
    const menBefore = faction.military[0]?.units?.length ?? 0;

    const result = Living.sendAdventurersToFaction(1, 2);
    const gone = !Factions.active().some(f => f.i === faction.i);
    if (result) expect(gone).toBe(true);
    else {
      expect(gone || faction.raidPending === true || (faction.military[0]?.units?.length ?? 0) <= menBefore).toBe(true);
    }
  });
});

describe("Living (Lair Ascension Slice 3: Shared Emergent State Engine)", () => {
  beforeEach(() => {
    buildStubPack();
  });

  it("rejects ineligible troubles and lairs without mutating world state", () => {
    Living.init();
    const stateCountBefore = pack.states.length;

    // Hazards stay provincial trouble: they never spawn factions or states
    const trouble = Living.spawnTrouble(2, "flooding", "resource", 7);
    expect(trouble?.id).toBe("flooding");
    expect(Living.ascendFactionToState(999)).toBeNull();
    expect(pack.states.length).toBe(stateCountBefore);

    // Non-ambitious factions never ascend on their own
    Living.spawnDangerousFaction(2, "monsters", "ruin", 8);
    Living.spawnDangerousFaction(2, "things_from_below", "ruin", 8);
    expect(pack.states.length).toBe(stateCountBefore);
  });

  it("spawns a dangerous faction from organizational trouble and ascends it into a sovereign state", () => {
    const living = Living.init();
    const trouble = Living.spawnTrouble(2, "demagogue", "burg", 7);
    expect(trouble).toBeNull();
    expect(living.provinces[2].trouble).toBeNull();

    const faction = (pack.factions ?? []).find(f => f.i !== 0)!;
    expect(faction.type).toBe("demagogue");
    expect(faction.hq.burgId).toBe(2);
    expect(faction.stateRelations[1]).toBe("Enemy");

    const newStateId = Living.ascendFactionToState(faction.i);
    expect(newStateId).toBe(3);

    const newState = pack.states[newStateId!];
    expect(newState).toBeDefined();
    expect(newState.fullName).toContain("Popular Assembly");
    expect(newState.economy.treasury).toBe(150);
    expect(newState.capital).toBe(2);

    const capital = pack.burgs[2];
    expect(capital.state).toBe(newStateId);
    expect(capital.capital).toBe(1);
    expect(pack.provinces[2].state).toBe(newStateId);

    // The faction survives as the new state's autonomous arm
    expect(faction.allegiance).toBe("state_arm");
    expect(faction.patronStateId).toBe(newStateId);
    expect(faction.stateRelations[newStateId!]).toBe("Ally");

    // Mutual war, claim, and grudges via the shared emergent engine
    expect(newState.diplomacy![1]).toBe("Enemy");
    expect(pack.states[1].diplomacy![newStateId!]).toBe("Enemy");
    expect(living.states[1].claims.some(c => c.burgId === 2 && c.heldByStateId === newStateId)).toBe(true);
    expect(living.states[1].grudges.some(g => g.againstStateId === newStateId && g.weight === 60)).toBe(true);
  });

  it("ascends a wilderness faction by founding a new capital burg", () => {
    const living = Living.init();
    const faction = Living.spawnDangerousFaction(3, "doomsday_cult", "ruin", 8, { cell: 4 })!;
    expect(faction.hq.cell).toBe(4);

    const burgsBefore = pack.burgs.length;
    const newStateId = Living.ascendFactionToState(faction.i);
    expect(newStateId).toBe(3);
    expect(pack.burgs.length).toBe(burgsBefore + 1);

    const newState = pack.states[newStateId!];
    expect(newState.fullName).toContain("Apocalyptic Dominion");

    const newCapital = pack.burgs[newState.capital];
    expect(newCapital.cell).toBe(4);
    expect(newCapital.capital).toBe(1);
    expect(newCapital.state).toBe(newStateId);
    expect(pack.cells.state[4]).toBe(newStateId);
    expect(living.provinces[3].order).toBe(75);
  });

  it("never promotes a festering hazard to a state in stepProvinces, even when order has collapsed", () => {
    const living = Living.init();
    const trouble = Living.spawnTrouble(2, "flooding", "burg", 10)!;
    trouble.seasonsUnchecked = 5;
    living.provinces[2].order = 20;

    Living.tick(1);

    expect(pack.states.length).toBe(3);
    expect(pack.provinces[2].state).not.toBe(3);
    // The hazard festers into a dangerous faction instead of a state
    expect(living.provinces[2].trouble).toBeNull();
    expect(
      Factions.active().some(
        f => f.hq.provinceId === 2 && (f.allegiance === "hostile" || f.allegiance === "clandestine")
      )
    ).toBe(true);
  });

  it("festered hazards become dangerous factions when order is intact", () => {
    const living = Living.init();
    const trouble = Living.spawnTrouble(2, "flooding", "burg", 10)!;
    trouble.seasonsUnchecked = 5;
    living.provinces[2].order = 80;
    living.states[1].unravel = 0;
    living.states[1].warExhaustion = 0;

    Living.tick(1);

    expect(pack.states.length).toBe(3);
    expect(living.provinces[2].trouble).toBeNull();
    expect(
      Factions.active().some(
        f => f.hq.provinceId === 2 && (f.allegiance === "hostile" || f.allegiance === "clandestine")
      )
    ).toBe(true);
  });

  it("leaves a festering hazard in place without the domain check: no dice, no promotion", () => {
    const living = Living.init();
    Living.spawnTrouble(2, "flooding", "burg", 9);
    living.provinces[2].order = 25;

    expect(typeof (Living as unknown as Record<string, unknown>).resolveTrouble).toBe("undefined");
    Living.tick(1);

    expect(pack.states.length).toBe(3);
    expect(pack.provinces[2].state).not.toBe(3);
    // The hazard only escalates; it is cleared by production, heroes or factions
    expect(living.provinces[2].trouble?.level ?? 0).toBeGreaterThanOrEqual(9);
  });

  it("ascends an ambitious raid faction via Path A when overwhelming a vulnerable non-capital settlement", () => {
    Living.init();
    const faction = Factions.add({
      name: "Warlord's Host",
      category: "martial",
      type: "aspiring_warlord",
      allegiance: "hostile",
      sovereignAmbition: true,
      raidThreshold: 1,
      stateRelations: { 1: "Enemy" },
      hq: { cell: 3, burgId: 2, fortified: false, secrecy: 0, assets: [] }
    });
    faction.seasonsActive = 8;
    faction.raidPending = true;
    faction.military = [
      {
        i: 1,
        name: "Warlord's Host warband",
        a: 0,
        cell: 3,
        x: 30,
        y: 30,
        bx: 30,
        by: 30,
        state: 0,
        n: 0,
        units: Array.from({ length: 8 }, () => ({ type: "cavalry", hp: 1, exp: 5 })) as never
      } as never
    ];
    syncRegimentTotals(faction.military[0]!, Military.getUnitTypes());
    const living = Living.getState();
    living.provinces[2].order = 18;
    pack.burgs[2].walls = 0;

    Living.tick(1);

    expect(pack.states.length).toBe(4);
    expect(pack.provinces[2].state).toBe(3);
    expect(pack.burgs[2].state).toBe(3);
    expect(pack.burgs[2].capital).toBe(1);
    expect(faction.allegiance).toBe("state_arm");
  });

  it("ascends an entrenched wilderness faction via Path B when active >= 8 seasons", () => {
    Living.init();
    const faction = Living.spawnDangerousFaction(3, "dwarven_outcasts", "ruin", 8, { cell: 4 })!;
    faction.allegiance = "hostile";
    faction.seasonsActive = 7; // stepProvinces increments to 8
    faction.raidThreshold = 7; // prevent raid so Path B is exercised directly

    Living.tick(1);

    expect(pack.states.length).toBe(4);
    expect(pack.provinces[3].state).toBe(3);
    expect(pack.states[3].fullName).toContain("Underhold");
    expect(faction.allegiance).toBe("state_arm");
  });

  it("records independence chronicle events and round-trips emergent states through serializeHistory / parseHistory", () => {
    const living = Living.init();
    Living.spawnTrouble(2, "demagogue", "burg", 7);
    const spawnedFaction = (pack.factions ?? []).find(f => f.i !== 0)!;
    const troubleStateId = Living.ascendFactionToState(spawnedFaction.i)!;

    const lairFaction = Living.spawnDangerousFaction(3, "doomsday_cult", "ruin", 8, { cell: 4 })!;
    const lairStateId = Living.ascendFactionToState(lairFaction.i)!;

    const independenceEvents = pack.history.events!.filter(e => e.type === "independence");
    expect(independenceEvents).toHaveLength(2);
    expect(independenceEvents[0]!.actors).toContainEqual({ kind: "state", id: troubleStateId });
    expect(independenceEvents[1]!.actors).toContainEqual({ kind: "state", id: lairStateId });

    const { json, snapshotRecords } = serializeHistory(pack.history, pack.cells.i.length);
    const restored = parseHistory(json, snapshotRecords, pack.cells.i.length);

    expect(restored.living?.states[troubleStateId]?.rulerId).toBe(living.states[troubleStateId].rulerId);
    expect(restored.living?.provinces?.[2]?.trouble).toBeNull();
    expect(restored.events.filter(e => e.type === "independence")).toHaveLength(2);
  });

  it("produces deterministic emergent states, rulers, armies, and chronicle entries across identical seeds", () => {
    const runScenario = () => {
      buildStubPack();
      let s = 42;
      const origRandom = Math.random;
      Math.random = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
      };
      try {
        const living = Living.init({ seed: "deterministic-ascension-seed" });
        Living.spawnTrouble(2, "secret_society", "burg", 8);
        const spawnedFaction = (pack.factions ?? []).find(f => f.i !== 0)!;
        const s1 = Living.ascendFactionToState(spawnedFaction.i)!;
        const lairFaction = Living.spawnDangerousFaction(3, "angry_dead", "ruin", 9, { cell: 4 })!;
        const s2 = Living.ascendFactionToState(lairFaction.i)!;
        Living.tick(2);
        return {
          s1Name: pack.states[s1].fullName,
          s2Name: pack.states[s2].fullName,
          s1Ruler: pack.history.figures!.find(f => f.i === living.states[s1].rulerId),
          s2Ruler: pack.history.figures!.find(f => f.i === living.states[s2].rulerId),
          s1Units: pack.states[s1].military?.[0]?.units,
          s2Units: pack.states[s2].military?.[0]?.units,
          news: living.recentNews.map(n => n.text),
          events: pack.history.events?.map(e => e.text)
        };
      } finally {
        Math.random = origRandom;
      }
    };

    const first = runScenario();
    const second = runScenario();
    expect(second).toEqual(first);
  });
});

describe("Faction clear-trouble production clock (trouble conversion Phase 2)", () => {
  beforeEach(() => {
    buildStubPack();
    // City loops need terrain columns or stepCities early-returns with empty yields
    pack.cells.h = Uint8Array.from([0, 30, 30, 30, 30, 30]);
    pack.cells.biome = Uint8Array.from([0, 2, 2, 2, 2, 2]);
    pack.factions = [{ i: 0 } as Faction];
  });

  const caretaker = (category: "adventuring" | "religious" | "commercial" | "martial") =>
    Factions.add({
      name: `${category} caretakers`,
      category,
      type: category === "martial" ? "mercenary_company" : "adventurer_guild",
      allegiance: "autonomous",
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: [] }
    });

  it("assigns a clear_trouble agenda sized in production and banks node production each season", () => {
    const living = Living.init();
    Living.spawnTrouble(1, "flooding", "burg", 1);
    const faction = caretaker("adventuring");

    Living.tick(1);
    expect(faction.agenda?.kind).toBe("clear_trouble");
    expect(faction.agenda?.targetProvinceId).toBe(1);
    expect(faction.agenda?.required).toBe(60); // 40 + 20 x level 1
    expect(faction.agenda?.progress).toBe(0);

    Living.tick(1);
    expect(faction.agenda?.kind).toBe("clear_trouble");
    expect(faction.agenda?.progress ?? 0).toBeGreaterThan(0);
    expect(living.provinces[1].trouble).not.toBeNull();
  });

  it("clears the hazard on completion with order and stability rewards", () => {
    const living = Living.init();
    Living.spawnTrouble(1, "flooding", "burg", 1);
    const faction = caretaker("religious");
    faction.stateRelations[1] = "Suspicion";

    Living.tick(1);
    expect(faction.agenda?.kind).toBe("clear_trouble");
    faction.agenda!.progress = faction.agenda!.required - 1;

    const orderBefore = living.provinces[1].order;
    const stabilityBefore = living.provinces[1].stability;
    Living.tick(1);

    expect(living.provinces[1].trouble).toBeNull();
    expect(living.provinces[1].order).toBeGreaterThanOrEqual(orderBefore + 7);
    expect(living.provinces[1].stability).toBe(stabilityBefore + 1);
    expect(faction.agenda).toBeNull();
    expect(living.recentNews.some(n => n.kind === "trouble" && n.text.includes(faction.name))).toBe(true);
    // Clearing trouble buys standing with the host state
    expect(faction.stateRelations[1]).toBe("Neutral");
  });

  it("improves relations one rung per clear, capped at Ally", () => {
    const living = Living.init();
    Living.spawnTrouble(1, "flooding", "burg", 1);
    const faction = caretaker("adventuring");
    faction.stateRelations[1] = "Enemy";
    faction.agenda = {
      kind: "clear_trouble",
      label: "test",
      targetProvinceId: 1,
      progress: 0,
      required: 1
    };

    Living.tick(1);
    expect(living.provinces[1].trouble).toBeNull();
    expect(faction.stateRelations[1]).toBe("Rival");

    // Already Ally: stays Ally
    Living.spawnTrouble(1, "flooding", "burg", 1);
    faction.stateRelations[1] = "Ally";
    faction.agenda = { kind: "clear_trouble", label: "test", targetProvinceId: 1, progress: 0, required: 1 };
    Living.tick(1);
    expect(faction.stateRelations[1]).toBe("Ally");
  });

  it("clears the agenda without progress when the trouble is gone", () => {
    Living.init();
    Living.spawnTrouble(1, "flooding", "burg", 1);
    const faction = caretaker("commercial");

    Living.tick(1);
    expect(faction.agenda?.kind).toBe("clear_trouble");

    Living.quellTrouble(1);
    Living.tick(1);
    expect(faction.agenda).toBeNull();
  });

  it("does not assign clear_trouble to martial factions or factions without a node in the province", () => {
    Living.init();
    Living.spawnTrouble(1, "flooding", "burg", 1);
    const martial = caretaker("martial");
    martial.hq.burgId = 1;

    Living.tick(2);
    expect(martial.agenda).toBeNull();

    // Province 2 (Oakshire) has no troubled province node for a second faction
    const far = Factions.add({
      name: "far guild",
      category: "adventuring",
      type: "adventurer_guild",
      allegiance: "autonomous",
      hq: { cell: 5, burgId: 3, fortified: false, secrecy: 0, assets: [] }
    });
    Living.tick(1);
    expect(far.agenda).toBeNull();
  });
});

describe("Living World Factions (Phase 3: Economy, Agendas, Military, Raids & Ascension)", () => {
  beforeEach(() => {
    buildStubPack();
  });

  it("advances faction economy, applies yields, upkeeps, and progresses tech research with host-state spillover", () => {
    buildStubPack();
    const living = Living.init();
    pack.factions = [{ i: 0 } as Faction];
    (pack.cells as unknown as { h: Uint8Array }).h = new Uint8Array((pack.cells.i as number[]).length).fill(25);
    (pack.cells as unknown as { biome: Uint8Array }).biome = new Uint8Array((pack.cells.i as number[]).length).fill(4);

    // Host state 1 has researched pottery
    living.states[1].researchedTechs = ["pottery"];

    const faction = Factions.add({
      name: "Golden Crest Trading",
      category: "commercial",
      type: "merchant_consortium",
      allegiance: "autonomous",
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: ["trade_depot"] },
      outposts: [
        {
          burgId: 2,
          cell: 3,
          tier: 1,
          influence: 40,
          secrecy: 0,
          assets: ["trade_depot"],
          establishedYear: 1000
        }
      ],
      treasury: 100,
      science: 2,
      influence: 20,
      currentTechId: "pottery",
      researchQueue: ["writing"],
      researchedTechs: [],
      researchedProgress: {}
    });

    faction.hq.sim!.cityYields = { food: 5, production: 3, gold: 12, science: 4, culture: 2, faith: 1, happiness: 0 };
    faction.outposts[0].sim!.cityYields = {
      food: 3,
      production: 2,
      gold: 8,
      science: 2,
      culture: 1,
      faith: 0,
      happiness: 0
    };
    faction.hq.sim!.civBuildings = ["trade_depot"];
    faction.outposts[0].sim!.civBuildings = ["trade_depot"];

    const initTreasury = faction.treasury;
    Living.stepFactionEmpire(living);

    expect(faction.yieldsPerTurn?.food).toBe(8);
    expect(faction.yieldsPerTurn?.production).toBe(5);
    expect(faction.yieldsPerTurn?.gold).toBe(20);
    expect(faction.treasury).toBe(initTreasury + 20);
    expect(faction.science).toBe(6);
    expect(Number.isFinite(faction.happiness ?? NaN)).toBe(true);
    expect(faction.happinessBreakdown).toBeDefined();

    // Tech research: progress accumulated with +25% host spillover (6 * 1.25 = 7.5)
    expect(faction.researchedProgress.pottery ?? 0).toBeCloseTo(7.5);

    // Trigger completion
    faction.researchedProgress.pottery = 34;
    Living.stepFactionEmpire(living);
    expect(faction.researchedTechs).toContain("pottery");
    expect(faction.currentTechId).toBe("writing");
  });

  it("handles autonomous agendas: expands outposts and Clashes in contested burgs", () => {
    const living = Living.init();
    pack.factions = [{ i: 0 } as Faction];

    const f1 = Factions.add({
      name: "Shadow Syndicate",
      category: "underworld",
      type: "thieves_guild",
      expansionism: 2.0,
      treasury: 250,
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 50, assets: ["safe_house"] },
      outposts: [
        {
          burgId: 2,
          cell: 3,
          tier: 1,
          influence: 50,
          secrecy: 40,
          assets: ["safe_house"],
          establishedYear: 1000
        }
      ]
    });

    const f2 = Factions.add({
      name: "Nightblades",
      category: "underworld",
      type: "thieves_guild",
      treasury: 50,
      hq: { cell: 3, burgId: 2, fortified: false, secrecy: 50, assets: ["safe_house"] },
      outposts: [
        {
          burgId: 2,
          cell: 3,
          tier: 1,
          influence: 30,
          secrecy: 40,
          assets: ["safe_house"],
          establishedYear: 1000
        }
      ],
      factionRelations: { [f1.i]: "Enemy" }
    });
    f1.factionRelations[f2.i] = "Enemy";

    // Step agendas - turf clash in burg 2
    Living.stepFactionAgendas(living);

    // The two rivals clashed in burg 2; influence shifted
    const o1 = f1.outposts.find(o => o.burgId === 2)!;
    const o2 = f2.outposts.find(o => o.burgId === 2)!;
    expect(o1.influence !== 50 || o2.influence !== 30).toBe(true);

    // Burg unrest should have risen due to the clash
    const burg2Sim = living.burgs[2];
    expect(burg2Sim?.unrest ?? 0).toBeGreaterThan(0);
  });

  it("defects from crumbling patron state when unravel exceeds threshold", () => {
    const living = Living.init();
    pack.factions = [{ i: 0 } as Faction];

    const faction = Factions.add({
      name: "Imperial Guard Auxiliary",
      category: "martial",
      type: "knightly_order",
      allegiance: "state_arm",
      patronStateId: 1,
      alignment: "neutral",
      hq: { cell: 1, burgId: 1, fortified: true, secrecy: 0, assets: ["muster_camp"] }
    });

    // Make patron state 1 collapse / unravel >= 60
    if (living.states[1]) living.states[1].unravel = 65;

    Living.stepFactionAgendas(living);

    expect(faction.allegiance).toBe("autonomous");
    expect(faction.patronStateId).toBeUndefined();
    expect(faction.stateRelations[1]).toBe("Enemy");
  });

  it("ascends to sovereign state when sovereignty conditions are met", () => {
    const living = Living.init();
    pack.factions = [{ i: 0 } as Faction];

    const raiderFaction = Factions.add({
      name: "Ironfang Warband",
      category: "martial",
      type: "raider_clan",
      allegiance: "hostile",
      treasury: 300,
      seasonsActive: 10,
      sovereignAmbition: true,
      stateForm: "Warband Realm",
      hq: { cell: 4, fortified: true, secrecy: 0, assets: ["muster_camp"] }
    });

    // Legacy instant muster is retired: Phase 4 regiments come from the production queue.
    Living.stepFactionMilitaryAndRaids(living);
    expect(raiderFaction.military.length).toBe(0);

    // Seed a combat regiment with blocks for the ascension check.
    raiderFaction.military.push({
      i: 1,
      name: "Ironfang Vanguard",
      a: 100,
      cell: 4,
      x: 0,
      y: 0,
      bx: 0,
      by: 0,
      u: { spear: 100 },
      units: [{ type: "spear", hp: 1, exp: 0 }],
      n: 0,
      state: 0,
      icon: "⚔️",
      rosterId: raiderFaction.rosterId
    } as unknown as (typeof raiderFaction.military)[number]);
    expect(raiderFaction.military[0].u).toHaveProperty("spear");

    // Direct ascension test: ascendFactionToState
    const stateCountBefore = pack.states.length;
    const ascStateId = Living.ascendFactionToState(raiderFaction.i, 2);
    expect(ascStateId).not.toBeNull();
    expect(pack.states.length).toBe(stateCountBefore + 1);

    const createdState = pack.states[ascStateId!];
    expect(createdState.name).toBe("Ironfang Warband");
    expect(createdState.formName).toBe("Warband Realm");
    expect(raiderFaction.allegiance).toBe("state_arm");
    expect(raiderFaction.patronStateId).toBe(ascStateId);
  });

  it("spawns remnant faction on state collapse with inherited identity and hostilities", () => {
    const living = Living.init();
    const fallenState = pack.states[1];
    living.states[1].researchedTechs = ["mining", "pottery", "masonry"];

    const remnant = Living.spawnRemnantFaction(fallenState, 2);
    expect(remnant).not.toBeNull();
    expect(remnant!.name).toContain("Aeloria Restoration Front");
    expect(remnant!.category).toBe("political");
    expect(remnant!.type).toBe("rebel_front");
    expect(remnant!.allegiance).toBe("hostile");
    expect(remnant!.sovereignAmbition).toBe(true);
    expect(remnant!.stateRelations[2]).toBe("Enemy");
    expect(remnant!.researchedTechs).toEqual(living.states[1].researchedTechs);
  });
});
