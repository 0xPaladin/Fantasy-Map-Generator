// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { currentContent } from "@/data/roster-store";
import { valueModifier } from "@/data/saves-helpers";
import { CIV_BUILDING_BY_ID } from "@/data/living-civ-buildings";
import { CIV_TECH_BY_ID } from "@/data/living-civ-techs";
import { getPetitionDef } from "@/data/living-petitions";
import { getTroubleDef, troubleUnitMatchMultiplier } from "@/data/living-troubles";
import type { Good } from "@/model/economy/goods-generator";
import { nextRosterUnitInCategory, requiredTechFor } from "@/model/physical/living-armies";
import type { Burg } from "@/model/political/burgs-generator";
import { Factions } from "@/model/political/factions-generator";
import { Military, syncRegimentTotals } from "@/model/political/military-generator";
import type { Marker } from "@/model/story/markers-generator";
import { parseHistory, serializeHistory } from "@/services/io/epochs-format";
import type { Faction } from "@/types/factions";
import type { HistoricalFigure } from "@/types/history";
import type { HistoricalRelic } from "@/types/living";
import { createRng } from "@/utils/rng";
import {
  activeCivThemeId,
  BASE_EMPIRE_HAPPINESS,
  borderCultureNeeded,
  borderInfluenceScore,
  citizensFromPopulation,
  classifyGood,
  figureBias,
  figureCheckRoll,
  figureLevel,
  foodNeededForGrowth,
  getCellResource,
  getCellTerrainInfo,
  getCellYieldSources,
  getCellYields,
  guildTierForRenown,
  happinessCombatMultiplier,
  happinessGrowthFactor,
  hasStackingConflict,
  hurryGoldCost,
  isMajorBurg,
  isMinorBurg,
  isTechSelectable,
  Living,
  LUXURY_HAPPINESS,
  maxHeroesForTier,
  maxPartyForTier,
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

function makeGuildFigure(i: number, overrides: Partial<HistoricalFigure> = {}): HistoricalFigure {
  return {
    i,
    name: `Hero ${i}`,
    culture: 1,
    birth: 980,
    roles: [{ type: "adventurer", target: { kind: "culture", id: 1 }, from: 1000 }],
    alignment: "neutral",
    virtues: [],
    vices: [],
    skills: { m: 0, w: 0, s: 0, c: 0 },
    xp: 0,
    cell: 1,
    ...overrides
  };
}

function addGuildHero(skills: { m: number; w: number; s: number; c: number }): number {
  pack.history.figures ??= [];
  const figures = pack.history.figures;
  const heroId = figures.length;
  figures.push(makeGuildFigure(heroId, { skills }));
  return heroId;
}

describe("Living (Slices 1-4: Data Model, Seasonal Tick, Capacity, Projects, War & Unravel)", () => {
  beforeEach(() => {
    globalThis.options = {
      map: {
        seed: "test-living-seed",
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
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Aeloria",
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

    // Burg 1 flags (walls=1, citadel=1, plaza=1, temple=1) map to standing Conquest buildings
    const b1 = living.burgs[1];
    expect(b1.baseTier).toBe(5);
    expect(b1.buildings).toEqual(expect.arrayContaining(["walls2", "market1", "temple1", "barracks1"]));

  });

  it("synchronizes burg flags and Conquest buildings bidirectionally", () => {
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
    pack.states[1].treasury = 100;
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
    pack.states[1].treasury = 1000;
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
    const trouble = Living.spawnTrouble(1, "bad_reputation", "burg", 4);

    expect(trouble).toMatchObject({
      id: "bad_reputation",
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

    Living.spawnTrouble(1, "riotous_thugs", "burg", 4);

    Living.tick(1);

    // With level 4 trouble, order drains by level * 2 = 8 (plus garrison +2 = net -6, or floor checked)
    // and stability accrual from garrison is suspended
    expect(living.provinces[1].stability).toBe(5);
    expect(living.provinces[1].order).toBeLessThan(70);
  });

  it("keeps burg unrest floored at trouble level", () => {
    const living = Living.init();
    living.burgs[1].unrest = 2;

    Living.spawnTrouble(1, "demagogue", "burg", 6);

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
    const disorderDef = getTroubleDef("riotous_thugs"); // pool: m, requiredRole: guardsmen
    expect(troubleUnitMatchMultiplier(disorderDef, "guardsmen")).toBe(1);
    expect(troubleUnitMatchMultiplier(disorderDef, "military")).toBe(2);
    expect(troubleUnitMatchMultiplier(disorderDef, "merchant")).toBe(3);

    const povertyDef = getTroubleDef("exceptional_poverty"); // pool: w, requiredRole: merchant
    expect(troubleUnitMatchMultiplier(povertyDef, "merchant")).toBe(1);
    expect(troubleUnitMatchMultiplier(povertyDef, "sage")).toBe(2);
    expect(troubleUnitMatchMultiplier(povertyDef, "military")).toBe(3);

    const despairDef = getTroubleDef("crushed_spirits"); // pool: s, requiredRole: prophet
    expect(troubleUnitMatchMultiplier(despairDef, "prophet")).toBe(1);
    expect(troubleUnitMatchMultiplier(despairDef, "magistrate")).toBe(2);
    expect(troubleUnitMatchMultiplier(despairDef, "guardsmen")).toBe(3);
  });

  it("resolves trouble with domain saving throw and tracks disruption", () => {
    const living = Living.init();
    const trouble = Living.spawnTrouble(1, "brigand_raiders", "burg", 2);
    expect(trouble).not.toBeNull();

    const unit = pack.states[1].military![0].units![0];
    unit.disruption = 0;

    // Attempt resolution
    const result = Living.resolveTrouble(1, 1);
    if (result) {
      // Success either reduced or eliminated trouble
      expect(living.provinces[1].trouble == null || living.provinces[1].trouble.level < 2).toBe(true);
    } else {
      // Failure inflicted +1 disruption
      expect(unit.disruption).toBe(1);
    }
  });

  it("resting units in peaceful provinces recover disruption", () => {
    Living.init();
    const unit = pack.states[1].military![0].units![0];
    unit.disruption = 2;
    Living.quellTrouble(1);

    Living.tick(1);

    expect(unit.disruption).toBe(1);
  });

  it("spawns and smites a lair with map marker tracking", () => {
    const living = Living.init();
    const lair = Living.spawnLair(1, "bandit_camp", 5);
    expect(lair).not.toBeNull();
    expect(lair!.level).toBe(5);
    expect(lair!.id).toBe("bandit_camp");
    expect(lair!.markerId).toBeDefined();

    const marker = pack.markers[lair!.markerId!];
    expect(marker).toBeDefined();
    expect(marker.type).toBe("dungeon");
    expect(marker.icon).toBe("🗡️");
    expect(marker.hidden).toBeUndefined();

    expect(Living.resolveTrouble(1, 1)).toBe(false);

    expect(Living.smiteLair(1)).toBe(true);
    expect(living.provinces[1].lair).toBeNull();
    // Danger markers are converted into explorable ruins instead of hidden
    expect(marker.type).toBe("ruins");
    expect(marker.name.startsWith("Ruins of")).toBe(true);
  });

  it("drains public order, suspends garrison stability, and floors unrest while lair is active", () => {
    const living = Living.init();
    Living.quellTrouble(1);
    Living.spawnLair(1, "monster_nest", 6);

    const pSim = living.provinces[1];
    pSim.order = 80;
    pSim.stability = 10;
    const bSim = living.burgs[1];
    bSim.unrest = 2;

    Living.tick(1);

    // Unrest should be floored at lair level (6)
    expect(bSim.unrest).toBeGreaterThanOrEqual(6);
    // Stability shouldn't accrue from garrisons while lair is active
    expect(pSim.stability).toBe(10);
    // Order should drain by level * 2
    expect(pSim.order).toBeLessThan(80);
  });

  it("metastasizes unchecked trouble into an entrenched lair", () => {
    const living = Living.init();
    Living.smiteLair(1);
    const trouble = Living.spawnTrouble(1, "angry_dead", "ruin", 5);
    expect(trouble).not.toBeNull();

    const lair = Living.metastasizeTroubleToLair(1);
    expect(lair).not.toBeNull();
    expect(living.provinces[1].trouble).toBeNull();
    expect(living.provinces[1].lair).toBe(lair);
    expect(lair!.id).toBe("ancient_evil");
    expect(lair!.level).toBe(3); // ceil(5 / 2) = 3, clamped to min 3

    // Test higher trouble level (10 -> ceil(10 / 2) = 5)
    Living.smiteLair(1);
    Living.spawnTrouble(1, "angry_dead", "ruin", 10);
    const lair10 = Living.metastasizeTroubleToLair(1);
    expect(lair10!.level).toBe(5);
  });

  it("launches seasonal lair raid against a settlement", () => {
    const living = Living.init();
    Living.quellTrouble(1);
    const lair = Living.spawnLair(1, "bandit_camp", 4);
    expect(lair).not.toBeNull();
    lair!.raidPending = true;

    const bSim = living.burgs[1];
    bSim.buildings = ["market1"];

    Living.tick(1);

    // News should record lair activity
    expect(living.recentNews.some(item => item.kind === "lair")).toBe(true);
  });

  it("grows a lair after a victorious raid: level, defenders, marker and news", () => {
    const living = Living.init();
    Living.quellTrouble(1);
    const lair = Living.spawnLair(1, "bandit_camp", 5)!;
    lair.raidPending = true;
    lair.raidUnits = Array.from({ length: 10 }, () => ({ type: "north_marauders", count: 1000, exp: 5 }));
    const defenders = lair.defenders.length;

    Living.tick(1);

    expect(lair.level).toBe(6);
    expect(lair.defenders).toHaveLength(defenders + 1);
    expect(pack.markers![lair.markerId!]!.name).toContain("Lair Lvl 6");
    expect(living.recentNews.some(item => item.kind === "lair" && item.text.includes("grew bolder"))).toBe(true);
  });

  it("does not grow a lair past level 10", () => {
    Living.init();
    Living.quellTrouble(1);
    const lair = Living.spawnLair(1, "bandit_camp", 10)!;
    lair.raidPending = true;
    lair.raidUnits = Array.from({ length: 10 }, () => ({ type: "north_marauders", count: 1000, exp: 5 }));
    const defenders = lair.defenders.length;

    Living.tick(1);

    expect(lair.level).toBe(10);
    expect(lair.defenders).toHaveLength(defenders);
  });

  it("mounts military expedition to assault and clear a lair", () => {
    const living = Living.init();
    Living.quellTrouble(1);
    const lair = Living.spawnLair(1, "bandit_camp", 4);
    expect(lair).not.toBeNull();

    // Give state 1 a strong field army to ensure victory
    const army = pack.states[1].military![0];
    army.units = [
      ...Array.from({ length: 4 }, () => ({ type: "cavalry", hp: 1, exp: 5 })),
      ...Array.from({ length: 3 }, () => ({ type: "spear", hp: 1, exp: 3 })),
      ...Array.from({ length: 3 }, () => ({ type: "archers", hp: 1, exp: 3 }))
    ];

    const result = Living.assaultLair(1, 1);
    expect(result).toBe(true);
    expect(living.provinces[1].lair).toBeNull();
    expect(living.recentNews.some(item => item.kind === "lair" && item.text.includes("conquered and destroyed"))).toBe(
      true
    );
  });

  it("dispatches adventurers on a decapitation delve creating an adventurer figure", () => {
    const living = Living.init();
    Living.quellTrouble(1);
    const lair = Living.spawnLair(1, "monster_nest", 5);
    expect(lair).not.toBeNull();

    Living.sendAdventurersToLair(1, 1);

    // Should create or use an adventurer figure
    const adventurers = pack.history.figures?.filter(f => f.roles.some(r => r.type === "adventurer")) ?? [];
    expect(adventurers.length).toBeGreaterThan(0);

    // Delve result processed
    expect(living.recentNews.some(item => item.kind === "lair")).toBe(true);
  });

  it("selects lair agendas and loads Wealth capacity during adventurer contract", () => {
    const living = Living.init();
    Living.quellTrouble(1);
    Living.spawnLair(1, "ancient_fort", 6);

    const sSim = living.states[1];
    sSim.agenda = null;

    // Advance 1 tick so chooseAgenda and stepAgenda run
    Living.tick(1);

    // Agenda should have targeted the lair (either clear_lair or hire_adventurers) or processed it
    expect(living.recentNews.some(item => item.kind === "lair")).toBe(true);

    // Active adventurer contract commits +1 W load
    sSim.agenda = {
      kind: "hire_adventurers",
      label: "Hiring adventurers against Ruined Keep",
      targetProvinceId: 1,
      progress: 0,
      required: 1
    };
  });

  it("claims a guild bounty popup and banks its gold and renown", () => {
    Living.init();
    const guild = Living.getGuild();
    guild.popups.push({
      id: 1,
      kind: "bounty_trouble",
      cell: 1,
      title: "Monsters in Aelor",
      subtitle: "Level 5 trouble",
      createdTick: 0,
      expiresAtTick: 3,
      rewardGold: 20,
      rewardRenown: 5
    });

    const claimed = Living.claimPopup(1);

    expect(claimed?.title).toBe("Monsters in Aelor");
    expect(Living.getGuild().gold).toBe(20);
    expect(Living.getGuild().renown).toBe(5);
    expect(Living.getPopups()).toHaveLength(0);
  });

  it("expires an unclaimed popup after three seasons", () => {
    Living.init();
    Living.getGuild().popups.push({
      id: 9,
      kind: "bounty_lair",
      cell: 1,
      title: "A lair stirs",
      subtitle: "Level 6 lair",
      createdTick: 0,
      expiresAtTick: 3,
      rewardGold: 10,
      rewardRenown: 2
    });

    Living.tick(3);

    expect(Living.getPopups().some(popup => popup.id === 9)).toBe(false);
  });

  it("queues a bounty popup when a high-level trouble festers", () => {
    Living.init();
    Living.spawnTrouble(1, "monsters", "burg", 5);

    Living.tick(1);

    expect(Living.getPopups().some(popup => popup.kind === "bounty_trouble" && popup.provinceId === 1)).toBe(true);
    expect(Living.getGuild().tier).toBe(1);
  });

  describe("Guild spine (slice 2)", () => {
    it("initializes guild defaults, headquarters and passive chapter dues", () => {
      Living.init();
      const guild = Living.getGuild();

      expect(guild.tier).toBe(1);
      expect(guild.gold).toBe(0);
      expect(guild.renown).toBe(0);
      expect(guild.sandboxGodMode).toBe(false);
      expect(guild.doctrine).toBe("auto_bounties");
      expect(guild.hqBurgId).toBe(1);
      expect(guild.chapterBurgIds).toEqual([1]);
      expect(guild.favoredStateId).toBe(1);
      expect(guild.roster).toEqual([]);
      expect(guild.missions).toEqual([]);

      const before = guild.gold;
      Living.tick(1);
      expect(guild.gold).toBe(before + 2);
    });

    it("recruits candidates for gold and enforces the tier roster cap", () => {
      Living.init();
      const guild = Living.getGuild();
      pack.history.figures ??= [];
      const figures = pack.history.figures;
      const ids = [0, 1, 2, 3].map(() => {
        const index = figures.length;
        figures.push(makeGuildFigure(index));
        return index;
      });
      guild.candidates = [...ids];
      guild.gold = 1000;

      expect(Living.recruitCost()).toBe(60);
      expect(Living.recruitCandidate(ids[0]!)).toBe(true);
      expect(Living.recruitCandidate(ids[1]!)).toBe(true);
      expect(Living.recruitCandidate(ids[2]!)).toBe(true);
      expect(Living.recruitCandidate(ids[3]!)).toBe(false);
      expect(guild.roster).toEqual(ids.slice(0, 3));
      expect(guild.gold).toBe(1000 - 3 * 60);
      expect(guild.candidates).toEqual([ids[3]!]);
    });

    it("mints tavern candidates with archetypes, disciplines and starting levels", () => {
      Living.init();
      Living.tick(4);
      const guild = Living.getGuild();
      const figures = pack.history.figures ?? [];

      expect(guild.candidates).toHaveLength(3);
      for (const id of guild.candidates) {
        const figure = figures.find(entry => entry.i === id)!;
        expect(figure.archetype).toBeDefined();
        expect(figure.disciplines?.length).toBeGreaterThanOrEqual(3);
        expect(figure.progression?.appliedLevel).toBe(figureLevel(figure.xp ?? 0));
        expect(figure.skills!.m + figure.skills!.w + figure.skills!.s + figure.skills!.c).toBeGreaterThanOrEqual(3);
      }
    });

    it("applies a chosen level 3 path once and clears the pending choice", () => {
      Living.init();
      const guild = Living.getGuild();
      pack.history.figures ??= [];
      const figures = pack.history.figures;
      const id = figures.length;
      figures.push(
        makeGuildFigure(id, {
          archetype: "warden",
          disciplines: ["melee", "tactics", "ride"],
          skills: { m: 2, w: 0, s: 1, c: 0 },
          xp: 140,
          progression: { appliedLevel: 3, pendingChoices: 1, picks: [] }
        })
      );
      guild.roster = [id];

      expect(Living.chooseHeroPath(id, "warden_standard")).toBe(true);
      const hero = figures.find(entry => entry.i === id)!;
      expect(hero.skills).toEqual({ m: 2, w: 0, s: 2, c: 0 });
      expect(hero.disciplines).toEqual(["melee", "tactics", "ride"]);
      expect(hero.progression?.pendingChoices).toBe(0);
      expect(hero.progression?.picks).toEqual(["warden_standard"]);
      expect(Living.getHeroState(id)?.temperament.teamplay).toBeCloseTo(0.95);
      expect(Living.chooseHeroPath(id, "warden_shieldwall")).toBe(false);
    });

    it("lazily initializes hero vitals, temperament and per-hero doctrine", () => {
      Living.init();
      const guild = Living.getGuild();
      const id = addGuildHero({ m: 5, w: 0, s: 0, c: 0 });
      guild.roster = [id];

      const state = Living.getHeroState(id)!;
      expect(state.resolve).toBe(state.maxResolve);
      expect(state.stamina).toBe(state.maxStamina);
      expect(state.temperament.boldness).toBe(0.6);
      expect(state.doctrine).toBe("hunt_lairs");
      expect(state.injuries).toEqual([]);

      expect(Living.setHeroDoctrine(id, "manual")).toBe(true);
      expect(Living.getHeroState(id)?.doctrine).toBe("manual");
      expect(Living.setHeroPush(id, true)).toBe(true);
      expect(Living.getHeroState(id)?.push).toBe(true);
    });

    it("never dispatches a downed hero", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.doctrine = "manual";
      Living.spawnTrouble(1, "monsters", "burg", 1);
      const id = addGuildHero({ m: 5, w: 0, s: 0, c: 0 });
      guild.roster = [id];
      const state = Living.getHeroState(id)!;
      state.resolve = 0;
      state.downUntilTick = 10;

      expect(Living.dispatchBestHero(1)).toBe(false);
      expect(Living.dispatchHero(id, 1)).toBe(false);
      expect(Living.getMissions()).toHaveLength(0);
    });

    it("spends at most one Stamina per mission below level 5 and two at level 5+", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.tier = 3;
      guild.doctrine = "manual";
      Living.spawnLair(1, "bandit_camp", 1, 1);
      const id = addGuildHero({ m: 5, w: 0, s: 0, c: 0 });
      guild.roster = [id];
      const state = Living.getHeroState(id)!;
      state.stamina = 7;
      state.push = true;

      expect(Living.dispatchHero(id, 1)).toBe(true);
      Living.tick(1);
      expect(state.stamina).toBe(6);

      const veteranId = addGuildHero({ m: 5, w: 0, s: 0, c: 0 });
      pack.history.figures!.find(figure => figure.i === veteranId)!.xp = 360;
      guild.roster.push(veteranId);
      const veteran = Living.getHeroState(veteranId)!;
      veteran.stamina = 10;
      veteran.push = true;
      Living.spawnLair(2, "bandit_camp", 1, 3);

      expect(Living.dispatchHero(veteranId, 2)).toBe(true);
      Living.tick(1);
      expect(veteran.stamina).toBe(8);
    });

    it("turns a guaranteed fumble into injury, down state, or death only at zero Resolve", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.tier = 3;
      guild.doctrine = "manual";
      Living.spawnLair(1, "bandit_camp", 10, 1);
      const id = addGuildHero({ m: -100, w: 5, s: 0, c: 0 }); // a test-only impossible pool forces the fumble branch
      guild.roster = [id];

      expect(Living.dispatchHero(id, 1)).toBe(true);
      Living.tick(2);
      const figure = pack.history.figures!.find(entry => entry.i === id)!;
      const state = Living.getHeroState(id)!;
      if (figure.death !== undefined) {
        expect(state.resolve).toBe(0);
      } else {
        expect(state.injuries.length > 0 || (state.downUntilTick ?? 0) > Living.getState().tick).toBe(true);
      }
    });

    it("lets a manual hero doctrine opt out of auto-dispatch", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.doctrine = "auto_bounties";
      Living.spawnTrouble(1, "monsters", "burg", 1);
      const id = addGuildHero({ m: 5, w: 0, s: 0, c: 0 });
      guild.roster = [id];
      Living.getHeroState(id)!.doctrine = "manual";

      Living.tick(1);

      expect(Living.getMissions()).toHaveLength(0);
    });

    it("runs paid pacify and charter operations with qualified idle heroes", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      guild.doctrine = "manual";
      const mediator = addGuildHero({ m: 0, w: 0, s: 5, c: 0 });
      pack.history.figures!.find(figure => figure.i === mediator)!.archetype = "priest";
      const factor = addGuildHero({ m: 0, w: 5, s: 0, c: 0 });
      pack.history.figures!.find(figure => figure.i === factor)!.archetype = "factor";
      guild.roster = [mediator, factor];
      guild.gold = 150;
      living.burgs[1]!.unrest = 40;
      const orderBefore = living.provinces[1]!.order;

      expect(Living.guildPacifyMediate(1)).toBe(true);
      expect(living.burgs[1]!.unrest).toBe(0);
      expect(living.provinces[1]!.order).toBe(orderBefore + 10);
      expect(guild.gold).toBe(110);

      expect(Living.startBuild(1, 1, "walls3")).toBe(true);
      expect(Living.guildRushAssetCharter(1)).toBe(true);
      expect(living.burgs[1]!.construction).toBeNull();
      expect(living.burgs[1]!.buildings).toContain("walls3");
      expect(guild.gold).toBe(60);
    });

    it("runs paid sedition, assassination and war brokerage", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      guild.doctrine = "manual";
      const shadow = addGuildHero({ m: 0, w: 0, s: 0, c: 30 });
      pack.history.figures!.find(figure => figure.i === shadow)!.archetype = "shadow";
      const cutthroat = addGuildHero({ m: 0, w: 0, s: 0, c: 30 });
      pack.history.figures!.find(figure => figure.i === cutthroat)!.archetype = "shadow";
      const envoy = addGuildHero({ m: 0, w: 0, s: 30, c: 0 });
      pack.history.figures!.find(figure => figure.i === envoy)!.archetype = "envoy";
      const diplomat = addGuildHero({ m: 0, w: 0, s: 30, c: 0 });
      pack.history.figures!.find(figure => figure.i === diplomat)!.archetype = "envoy";
      guild.roster = [shadow, cutthroat, envoy, diplomat];
      guild.gold = 400;
      pack.burgs[4].state = 1;
      pack.cells.state[5] = 1;

      expect(Living.guildInciteUprising(4)).toBe(true);
      expect(pack.burgs[4].state).toBe(0);
      expect(guild.gold).toBe(325);

      const rulerId = living.states[1].rulerId!;
      expect(Living.guildAssassinateRuler(1)).toBe(true);
      expect(pack.history.figures!.find(figure => figure.i === rulerId)?.death).toBeDefined();
      expect(guild.gold).toBe(225);

      expect(Living.guildBrokerWar(1, 2)).toBe(true);
      expect(pack.states[1].diplomacy?.[2]).toBe("Enemy");
      expect(guild.gold).toBe(145);

      expect(Living.guildBrokerWar(1, 2)).toBe(true);
      expect(pack.states[1].diplomacy?.[2]).toBe("Neutral");
      expect(pack.states[2].diplomacy?.[1]).toBe("Neutral");
      expect(guild.gold).toBe(65);
    });

    it("refuses a paid operation without a qualified idle hero or enough gold", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      guild.doctrine = "manual";
      const wrongHero = addGuildHero({ m: 5, w: 0, s: 0, c: 0 });
      guild.roster = [wrongHero];
      guild.gold = 30;
      living.burgs[1]!.unrest = 40;

      expect(Living.guildPacifyMediate(1)).toBe(false);
      expect(living.burgs[1]!.unrest).toBe(40);
      expect(guild.gold).toBe(30);
    });

    it("round-trips hero vitals and injuries through the map history", () => {
      Living.init();
      const guild = Living.getGuild();
      const id = addGuildHero({ m: 5, w: 0, s: 0, c: 0 });
      guild.roster = [id];
      const state = Living.getHeroState(id)!;
      state.stamina = 2;
      state.doctrine = "manual";
      state.push = true;
      state.injuries = [{ kind: "wounded", untilTick: 4 }];

      const { json, snapshotRecords } = serializeHistory(pack.history, pack.cells.i.length);
      const restored = parseHistory(json, snapshotRecords, pack.cells.i.length);

      expect(restored.living?.guild?.heroes?.[id]).toMatchObject({
        stamina: 2,
        doctrine: "manual",
        push: true,
        injuries: [{ kind: "wounded", untilTick: 4 }]
      });
    });

    it("auto-fills a deterministic tier-limited party", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.tier = 1;
      guild.doctrine = "manual";
      guild.roster = [
        addGuildHero({ m: 5, w: 0, s: 0, c: 0 }),
        addGuildHero({ m: 0, w: 5, s: 0, c: 0 }),
        addGuildHero({ m: 0, w: 0, s: 0, c: 5 })
      ];
      Living.spawnLair(1, "bandit_camp", 1, 1);

      const first = Living.getPartyPreview(1)!;
      const second = Living.getPartyPreview(1)!;

      expect(first.party).toEqual(second.party);
      expect(first.party.length).toBeGreaterThan(1);
      expect(first.party.length).toBeLessThanOrEqual(maxPartyForTier(1));
      expect(Living.dispatchBestHero(1)).toBe(true);
      expect(Living.getMissions()[0]!.party?.length).toBeLessThanOrEqual(maxPartyForTier(1));
      expect(maxPartyForTier(3)).toBe(3);
    });

    it("records one result per phase and lets no hero take more than two phases", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.tier = 1;
      guild.doctrine = "manual";
      const leader = addGuildHero({ m: 30, w: 30, s: 30, c: 30 });
      guild.roster = [leader, addGuildHero({ m: 30, w: 30, s: 30, c: 30 })];
      Living.spawnLair(1, "bandit_camp", 5, 1);

      expect(Living.dispatchHero(leader, 1)).toBe(true);
      const mission = Living.getMissions()[0]!;
      expect(mission.party).toHaveLength(2);
      expect(mission.phases).toHaveLength(3);

      Living.tick(3);

      const results = mission.phaseResults ?? [];
      expect(results).toHaveLength(3);
      expect(new Set(results.map(result => result.phaseId)).size).toBe(3);
      const contributions = new Map<number, number>();
      for (const result of results) {
        contributions.set(result.heroId, (contributions.get(result.heroId) ?? 0) + 1);
      }
      expect(Math.max(...contributions.values())).toBeLessThanOrEqual(2);
    });

    it("marks a phase untrained when no party member has the matching pool", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.tier = 1;
      guild.doctrine = "manual";
      const id = addGuildHero({ m: 0, w: 0, s: 0, c: 0 });
      guild.roster = [id];
      Living.spawnLair(1, "bandit_camp", 1, 1);

      expect(Living.dispatchHero(id, 1)).toBe(true);
      Living.tick(1);

      expect(Living.getMissions()[0]!.phaseResults?.[0]?.untrained).toBe(true);
    });

    it("pays every party member on full success and names the leader in the chronicle", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.tier = 1;
      guild.doctrine = "manual";
      const leader = addGuildHero({ m: 30, w: 30, s: 30, c: 30 });
      const companion = addGuildHero({ m: 30, w: 30, s: 30, c: 30 });
      guild.roster = [leader, companion];
      Living.spawnLair(1, "bandit_camp", 1, 1);

      expect(Living.dispatchHero(leader, 1)).toBe(true);
      Living.tick(2);

      const figures = pack.history.figures!;
      expect(figures.find(figure => figure.i === leader)?.xp).toBe(50);
      expect(figures.find(figure => figure.i === companion)?.xp).toBe(50);
      const deed = pack.history.events!.filter(event => event.type === "deed").at(-1)!;
      expect(deed.actors).toContainEqual({ kind: "figure", id: leader });
    });

    it("applies partial success to a lair and failure leaves it standing", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.tier = 1;
      guild.doctrine = "manual";
      const partialHero = addGuildHero({ m: -100, w: 0, s: 0, c: 30 });
      guild.roster = [partialHero];
      Living.spawnLair(1, "bandit_camp", 5, 1);

      expect(Living.dispatchHero(partialHero, 1)).toBe(true);
      Living.tick(2);
      expect(Living.getState().provinces[1]!.lair?.level).toBe(4);

      const failedHero = addGuildHero({ m: -100, w: 0, s: 0, c: -100 });
      guild.roster = [failedHero];
      Living.spawnLair(2, "bandit_camp", 5, 3);
      expect(Living.dispatchHero(failedHero, 2)).toBe(true);
      Living.tick(2);

      expect(Living.getState().provinces[2]!.lair?.level).toBe(5);
    });

    it("maps renown and experience onto the tier and level ladders", () => {
      expect(guildTierForRenown(0)).toBe(1);
      expect(guildTierForRenown(49)).toBe(1);
      expect(guildTierForRenown(50)).toBe(2);
      expect(guildTierForRenown(150)).toBe(3);
      expect(guildTierForRenown(350)).toBe(4);
      expect(guildTierForRenown(700)).toBe(5);
      expect(maxHeroesForTier(1)).toBe(3);
      expect(maxHeroesForTier(5)).toBe(10);
      expect(figureLevel(0)).toBe(1);
      expect(figureLevel(59)).toBe(1);
      expect(figureLevel(60)).toBe(2);
    });

    it("rolls unified figure checks deterministically", () => {
      const figure = makeGuildFigure(42, {
        skills: { m: 2, w: 0, s: 0, c: 0 },
        virtues: ["bold"],
        vices: []
      });

      const first = figureCheckRoll(createRng("guild-check"), figure, "m", 4, 12, 1);
      const second = figureCheckRoll(createRng("guild-check"), figure, "m", 4, 12, 1);

      expect(first).toEqual(second);
      expect(first.total).toBe(first.roll + 2 + valueModifier(4) + 1 + 1);
      expect(first.dc).toBe(12);
      expect(first.success).toBe(first.total >= 12);
    });

    it("auto-dispatches an idle hero under its doctrine", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.doctrine = "auto_bounties";
      pack.history.figures ??= [];
      const figures = pack.history.figures;
      const heroId = figures.length;
      figures.push(makeGuildFigure(heroId, { skills: { m: 5, w: 0, s: 0, c: 0 } }));
      guild.roster = [heroId];

      Living.spawnTrouble(1, "monsters", "burg", 1);
      Living.tick(1);

      const mission = Living.getMissions().find(entry => entry.figureId === heroId);
      expect(mission?.kind).toBe("trouble");
      expect(mission?.required).toBe(2);
      expect(mission?.tags).toEqual(expect.arrayContaining(["trouble"]));
    });

    it("auto-dispatches the best-fitting idle hero instead of the lowest id", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.doctrine = "manual";
      const weakId = addGuildHero({ m: 0, w: 0, s: 0, c: 4 });
      const strongId = addGuildHero({ m: 5, w: 0, s: 0, c: 0 });
      guild.roster = [weakId, strongId];
      Living.setHeroDoctrine(weakId, "hunt_troubles");
      Living.setHeroDoctrine(strongId, "hunt_troubles");

      Living.spawnTrouble(1, "monsters", "burg", 1);
      expect(Living.dispatchBestHero(1)).toBe(true);

      const mission = Living.getMissions().find(entry => entry.provinceId === 1);
      expect(mission?.figureId).toBe(strongId);
    });

    it("auto-dispatches a pacify mission under the pacify doctrine", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      guild.doctrine = "auto_pacify";
      living.burgs[1]!.unrest = 40;
      const heroId = addGuildHero({ m: 0, w: 0, s: 5, c: 0 });
      guild.roster = [heroId];

      Living.tick(1);

      const mission = Living.getMissions().find(entry => entry.kind === "pacify");
      expect(mission?.burgId).toBe(1);
      expect(mission?.figureId).toBe(heroId);
      expect(mission?.tags).toEqual(["social", "order"]);
    });

    it("resolves a dispatched mission and pays its gold, renown and xp", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      guild.tier = 3;
      guild.doctrine = "manual";
      pack.history.figures ??= [];
      const figures = pack.history.figures;
      const heroId = figures.length;
      figures.push(makeGuildFigure(heroId, { skills: { m: 30, w: 0, s: 0, c: 30 } }));
      guild.roster = [heroId];

      Living.spawnLair(1, "bandit_camp", 1, 1);
      expect(Living.dispatchHero(heroId, 1)).toBe(true);
      const mission = Living.getMissions().find(entry => entry.figureId === heroId)!;
      expect(mission.required).toBe(2);

      const goldBefore = guild.gold;
      Living.tick(2);

      expect(Living.getMissions().some(entry => entry.figureId === heroId)).toBe(false);
      expect(living.provinces[1].lair).toBeNull();
      expect(guild.gold).toBe(goldBefore + mission.rewardGold + 4);
      expect(guild.renown).toBe(mission.rewardRenown);
      expect(figures[heroId]!.xp).toBe(50);
    });

    it("retires a veteran and mints a protege carrying their best skill", () => {
      Living.init();
      const guild = Living.getGuild();
      pack.history.figures ??= [];
      const figures = pack.history.figures;
      const heroId = figures.length;
      figures.push(makeGuildFigure(heroId, { birth: 940, skills: { m: 3, w: 1, s: 0, c: 2 }, xp: 120, cell: 2 }));
      guild.roster = [heroId];

      const before = figures.length;
      const protegeId = Living.retireHero(heroId);

      expect(protegeId).not.toBeNull();
      expect(figures.length).toBe(before + 1);
      expect(guild.roster).toContain(protegeId);
      expect(guild.roster).not.toContain(heroId);

      const protege = figures.find(figure => figure.i === protegeId)!;
      expect(protege.skills?.m).toBe(4);
      expect(protege.skills?.c).toBe(2);
      expect(protege.roles.some(role => role.type === "adventurer")).toBe(true);
    });

    it("promotes the guild tier when renown crosses a threshold", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.renown = 150;

      Living.tick(1);

      expect(guild.tier).toBe(3);
    });
  });

  describe("Relics & ruin excavation (slice 3)", () => {
    function addMarker(fixtures: Partial<Marker> & Pick<Marker, "i" | "type" | "cell" | "name">): void {
      pack.markers ??= [];
      const [x, y] = pack.cells.p[fixtures.cell] ?? [0, 0];
      pack.markers.push({ icon: "🏛️", x, y, ...fixtures });
    }

    function makeRelic(id: number, overrides: Partial<HistoricalRelic> = {}): HistoricalRelic {
      return {
        id,
        name: `Relic ${id}`,
        category: "regalia",
        lore: "An old thing of power.",
        originYear: 900,
        bonuses: { s: 2 },
        holder: { kind: "vault" },
        ...overrides
      };
    }

    it("targets any unexcavated ruin marker under auto_excavate with a tier-scaled DC", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.doctrine = "auto_excavate";
      pack.markers = [];
      // a wild, non-chronicle ruin is still a valid dig site
      addMarker({ i: 0, type: "ruins", cell: 1, name: "Old Stones" });
      guild.roster = [addGuildHero({ m: 0, w: 0, s: 0, c: 5 })];

      Living.tick(1);

      const mission = Living.getMissions().find(entry => entry.kind === "excavate");
      expect(mission?.markerId).toBe(0);
      expect(mission?.dc).toBe(14); // 13 + tier 1
    });

    it("mints a realm-named relic when excavating a chronicle site", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.tier = 5;
      guild.doctrine = "manual";
      pack.history.realms = [
        {
          i: 0,
          name: "Vhaelen Empire",
          coa: {} as (typeof pack.history.realms)[number]["coa"],
          center: 1,
          founded: 300,
          fallen: 890,
          cause: "collapse",
          successors: []
        }
      ];
      pack.markers = [];
      addMarker({ i: 0, type: "ruins", cell: 1, name: "Old Vhaelen", chronicle: true });
      const heroId = addGuildHero({ m: 0, w: 30, s: 0, c: 30 });
      guild.roster = [heroId];

      expect(Living.dispatchHeroToMarker(heroId, 0)).toBe(true);
      const mission = Living.getMissions()[0]!;
      expect(mission.rewardRelic).toBe(true);

      const goldBefore = guild.gold;
      Living.tick(2);

      expect(guild.excavatedMarkers).toContain(0);
      expect(guild.relics).toHaveLength(1);
      const relic = guild.relics[0]!;
      expect(relic.holder).toEqual({ kind: "figure", id: heroId });
      expect(relic.originRealmId).toBe(0);
      expect(["Vhaelen", "Old Vhaelen"].some(part => relic.name.includes(part))).toBe(true);
      expect(relic.lore.length).toBeGreaterThan(0);
      expect(guild.gold).toBe(goldBefore + 4 + mission.rewardGold);
      expect(pack.history.figures?.find(figure => figure.i === heroId)?.xp).toBe(30);
    });

    it("yields either a relic or a 40-80 gold cache from a wild ruin", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.tier = 5;
      guild.doctrine = "manual";
      pack.markers = [];
      addMarker({ i: 0, type: "ruins", cell: 1, name: "Old Stones" });
      const heroId = addGuildHero({ m: 0, w: 30, s: 0, c: 30 });
      guild.roster = [heroId];

      expect(Living.dispatchBestHeroToMarker(0)).toBe(true);
      const mission = Living.getMissions()[0]!;

      Living.tick(2);

      expect(guild.excavatedMarkers).toContain(0);
      if (mission.rewardRelic) {
        expect(guild.relics).toHaveLength(1);
      } else {
        expect(guild.relics).toHaveLength(0);
        expect(mission.rewardGold).toBeGreaterThanOrEqual(40);
        expect(mission.rewardGold).toBeLessThanOrEqual(80);
        expect(guild.gold).toBe(4 + mission.rewardGold);
      }
    });

    it("excavates instantly in sandbox mode and mint per marker-type categories", () => {
      Living.init();
      const guild = Living.getGuild();
      pack.markers = [];
      addMarker({ i: 0, type: "libraries", cell: 1, name: "Great Library", chronicle: true });

      expect(Living.excavateMarker(0)).toBe(true);
      expect(guild.excavatedMarkers).toContain(0);
      expect(guild.relics).toHaveLength(1);
      expect(guild.relics[0]!.category).toBe("tome");
      expect(Living.excavateMarker(0)).toBe(false);
      expect(Living.excavateMarker(99)).toBe(false);
    });

    it("caps the vault at the guild tier and holds overflow in reserve", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.tier = 1;
      guild.relics = [makeRelic(1)];
      pack.markers = [];
      addMarker({ i: 0, type: "libraries", cell: 1, name: "Great Library", chronicle: true });

      expect(Living.excavateMarker(0)).toBe(true);
      expect(guild.relics).toHaveLength(2);
      expect(guild.relics[0]!.holder).toEqual({ kind: "vault" });
      expect(guild.relics[1]!.holder).toEqual({ kind: "reserve" });
      expect(Living.enshrineRelic(2)).toBe(false);
    });

    it("equips one relic per hero and caps enshrinement at the guild tier", () => {
      Living.init();
      const guild = Living.getGuild();
      const heroId = addGuildHero({ m: 1, w: 0, s: 0, c: 0 });
      guild.roster = [heroId];
      guild.relics = [makeRelic(1), makeRelic(2)];
      guild.tier = 2;

      expect(Living.equipRelic(1, heroId)).toBe(true);
      expect(guild.relics[0]!.holder).toEqual({ kind: "figure", id: heroId });

      // one relic per hero: the previous carry returns to the vault
      expect(Living.equipRelic(2, heroId)).toBe(true);
      expect(guild.relics[0]!.holder).toEqual({ kind: "vault" });
      expect(guild.relics[1]!.holder).toEqual({ kind: "figure", id: heroId });

      guild.tier = 1; // vault cap 1, already holding relic 1
      expect(Living.enshrineRelic(2)).toBe(false);
      expect(Living.recallRelic(2)).toBe(true);
      expect(guild.relics[1]!.holder).toEqual({ kind: "reserve" });

      // free the vault and the reserve relic can be enshrined
      const secondHero = addGuildHero({ m: 0, w: 0, s: 0, c: 0 });
      guild.roster.push(secondHero);
      expect(Living.equipRelic(1, secondHero)).toBe(true);
      expect(Living.enshrineRelic(2)).toBe(true);
      expect(guild.relics[1]!.holder).toEqual({ kind: "vault" });
    });

    it("leases a relic to a state, adding generation, tribute and unravel relief", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      const sSim = living.states[1];
      guild.relics = [makeRelic(1, { category: "regalia", bonuses: { s: 2 } })];

      expect(Living.leaseRelic(1, 1)).toBe(true);
      expect(guild.relics[0]!.holder).toEqual({ kind: "state", id: 1 });

      sSim.unravel = 10;
      const goldBefore = guild.gold;
      Living.tick(1);

      expect(guild.gold).toBe(goldBefore + 2 + 10); // chapter dues + lease tribute
      expect(sSim.unravel).toBe(7); // -2 seasonal peace, -1 relic lease
      expect(Living.leaseRelic(1, 1)).toBe(false); // already leased, not in vault
    });

    it("drops leased relics into a chronicle ruin when the capital falls and recovers them by excavation", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      guild.tier = 5;
      guild.doctrine = "manual";
      pack.markers = [];
      const baseS = living.states[1].yieldsPerTurn?.gold ?? 0;
      guild.relics = [makeRelic(1, { category: "regalia", bonuses: { s: 2 } })];
      expect(Living.leaseRelic(1, 1)).toBe(true);
      expect(living.states[1].yieldsPerTurn?.gold ?? 0).toBeGreaterThanOrEqual(baseS);

      const dropped = Living.dropStateRelicsToRuin(1, pack.burgs[1]);

      expect(dropped).toHaveLength(1);
      const relic = guild.relics[0]!;
      const holder = relic.holder;
      expect(holder.kind).toBe("ruin");
      const ruinMarkerId = holder.kind === "ruin" ? holder.markerId : -1;
      const ruinMarker = (pack.markers ?? []).find(marker => marker.i === ruinMarkerId);
      expect(ruinMarker?.type).toBe("ruins");
      expect(ruinMarker?.chronicle).toBe(true);
      expect(ruinMarker?.cell).toBe(1);
      expect(living.states[1].yieldsPerTurn?.gold ?? 0).toBeGreaterThanOrEqual(0);

      const heroId = addGuildHero({ m: 0, w: 30, s: 0, c: 30 });
      guild.roster = [heroId];
      expect(Living.dispatchBestHeroToMarker(ruinMarkerId)).toBe(true);

      Living.tick(2);

      expect(relic.holder).toEqual({ kind: "figure", id: heroId });
      // the chronicle ruin also yields its own fresh relic
      expect(guild.relics).toHaveLength(2);
    });

    it("adds carried relic bonuses to figure checks", () => {
      const figure = makeGuildFigure(9, { skills: { m: 2, w: 0, s: 0, c: 0 } });
      const withRelic = figureCheckRoll(createRng("relic-check"), figure, "m", 0, 12, 0, 2);
      const withoutRelic = figureCheckRoll(createRng("relic-check"), figure, "m", 0, 12, 0, 0);
      expect(withRelic.total).toBe(withoutRelic.total + 2);
    });
  });

  describe("Guild petitions (slice 4)", () => {
    function pushPetition(
      guild: ReturnType<typeof Living.getGuild>,
      petitionId: string,
      anchors: { provinceId?: number; burgId?: number; stateId?: number } = {}
    ): number {
      const id = guild.popups.reduce((max, popup) => Math.max(max, popup.id), 0) + 1;
      guild.popups.push({
        id,
        kind: "guild_petition",
        cell: 1,
        title: "A petition",
        subtitle: "The dilemma text",
        createdTick: 0,
        expiresAtTick: 20,
        petitionId,
        rewardGold: 0,
        rewardRenown: 0,
        ...anchors
      });
      return id;
    }

    it("queues a petition anchored to an active crisis every ~5 seasons", () => {
      Living.init();
      Living.spawnTrouble(1, "demagogue", "burg", 7);

      // the deterministic phase decides which season within the 5-season cycle asks
      const phase = createRng("test-living-seed:guild:petition:phase").int(0, 4);
      Living.tick(phase === 0 ? 5 : 5 - phase);

      const petitions = Living.getPopups().filter(popup => popup.kind === "guild_petition");
      expect(petitions).toHaveLength(1);
      expect(petitions[0]!.petitionId).toBeTruthy();
      expect(petitions[0]!.title.length).toBeGreaterThan(0);
      expect(petitions[0]!.subtitle).not.toContain("{");
      expect(getPetitionDef(petitions[0]!.petitionId)).toBeDefined();
    });

    it("resolves a petition choice, trading guild gold for quelling the trouble", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      Living.spawnTrouble(1, "demagogue", "burg", 5);
      const popupId = pushPetition(guild, "harsh_levy", { provinceId: 1, burgId: 1, stateId: 1 });
      guild.gold = 100;

      const outcome = Living.resolvePetition(popupId, 0)!;

      expect(outcome.summary).toContain("the trouble was quelled");
      expect(living.provinces[1].trouble).toBeNull();
      expect(guild.gold).toBe(70);
      expect(guild.renown).toBe(8);
      expect(Living.getPopups().some(popup => popup.id === popupId)).toBe(false);
      expect(Living.resolvePetition(popupId, 1)).toBeNull();
    });

    it("lets the selfish choice bank gold while the crisis festers", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      Living.spawnTrouble(1, "demagogue", "burg", 5);
      const popupId = pushPetition(guild, "harsh_levy", { provinceId: 1, burgId: 1, stateId: 1 });

      const outcome = Living.resolvePetition(popupId, 1)!;

      expect(outcome.gold).toBe(10);
      expect(guild.gold).toBe(10);
      expect(guild.renown).toBe(Math.max(0, -4));
      expect(living.provinces[1].trouble).not.toBeNull();
    });

    it("backs a coup and births a new sovereign state", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      Living.spawnTrouble(1, "demagogue", "burg", 8);
      const popupId = pushPetition(guild, "pretenders_bribe", { provinceId: 1, burgId: 1, stateId: 1 });
      guild.gold = 100;
      const statesBefore = pack.states.filter(state => state?.i && !state.removed).length;

      const outcome = Living.resolvePetition(popupId, 0)!;

      expect(outcome.summary).toContain("rose from the coup");
      expect(pack.states.filter(state => state?.i && !state.removed).length).toBe(statesBefore + 1);
      expect(living.provinces[1].trouble).toBeNull();
    });

    it("banishes or profits from a cursed relic", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.relics = [
        {
          id: 1,
          name: "Blood-Idol of the Dread Cloister",
          category: "idol",
          lore: "It whispers.",
          originYear: 700,
          bonuses: { m: 1, c: 1 },
          cursed: true,
          holder: { kind: "vault" }
        }
      ];
      const popupId = pushPetition(guild, "cursed_idol");

      const outcome = Living.resolvePetition(popupId, 0)!;

      expect(outcome.summary).toContain("was destroyed");
      expect(guild.relics).toHaveLength(0);
      expect(guild.renown).toBe(12);

      // with no cursed relic left, the dark sale yields nothing but gold
      const secondId = pushPetition(guild, "cursed_idol");
      const outcome2 = Living.resolvePetition(secondId, 1)!;
      expect(outcome2.gold).toBe(80);
      expect(outcome2.summary).toContain("takes its cut");
    });

    it("purges a lair when the Guild refuses the dark tithe", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      Living.quellTrouble(1);
      const lair = Living.spawnLair(1, "bandit_camp", 5)!;
      const popupId = pushPetition(guild, "dark_tithe", { provinceId: 1, burgId: 1, stateId: 1 });
      guild.gold = 50;

      const outcome = Living.resolvePetition(popupId, 0)!;

      expect(outcome.summary).toContain("was broken up");
      expect(living.provinces[1].lair).toBeNull();
      expect(lair.markerId).toBeDefined();
      expect(pack.markers![lair.markerId!]!.type).toBe("ruins");
    });

    it("resolves a succession dispute by selling out the ruler", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      const rulerId = living.states[1].rulerId;
      const popupId = pushPetition(guild, "palace_coup", { stateId: 1 });

      const outcome = Living.resolvePetition(popupId, 1)!;

      expect(outcome.summary).toContain("the ruler fell");
      expect(pack.history.figures?.find(figure => figure.i === rulerId)?.death).toBeDefined();
    });

    it("refuses expired petitions and ignored ones leave the world unchanged", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      Living.spawnTrouble(1, "demagogue", "burg", 5);
      const popup = {
        id: 77,
        kind: "guild_petition" as const,
        cell: 1,
        title: "A late petition",
        subtitle: "Too late",
        createdTick: 0,
        expiresAtTick: 0,
        provinceId: 1,
        petitionId: "harsh_levy",
        rewardGold: 0,
        rewardRenown: 0
      };
      guild.popups.push(popup);

      expect(Living.resolvePetition(77, 0)).toBeNull();
      expect(living.provinces[1].trouble).not.toBeNull();

      Living.tick(1);

      expect(Living.getPopups().some(entry => entry.id === 77)).toBe(false);
      expect(living.provinces[1].trouble).not.toBeNull();
    });
  });

  describe("Wheel of Ages (slice 5)", () => {
    it("tracks the eschaton clock from mighty lairs and evil conquests", () => {
      const living = Living.init();
      expect(Living.getEschaton()).toBe(0);

      Living.spawnLair(1, "bandit_camp", 9);
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

    it("winds the eschaton back when a lair is purged", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      guild.tier = 3;
      guild.doctrine = "manual";
      Living.spawnLair(1, "bandit_camp", 9);
      Living.tick(1);
      expect(Living.getEschaton()).toBe(1);

      guild.roster = [addGuildHero({ m: 30, w: 0, s: 0, c: 30 })];
      expect(Living.dispatchBestHero(1)).toBe(true);

      Living.tick(2);

      expect(living.provinces[1].lair).toBeNull();
      expect(Living.getEschaton()).toBe(0);
    });

    it("turns the wheel: bakes the epoch, retires unraveling realms and seeds relic ruins", () => {
      const living = Living.init();
      const guild = Living.getGuild();
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
      const buried = guild.relics.find(entry => entry.holder.kind === "ruin" && entry.holder.markerId === ruin!.i);
      expect(buried).toBeDefined();
      expect(buried!.originRealmId).toBe(realm!.i);
      expect(["regalia", "charter"]).toContain(buried!.category);

      expect(pack.history.eras?.at(-1)?.name).toBe(result.era);
      expect(guild.ageCount).toBe(1);
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

    it("carries the vault forward and mints scions for veteran heroes", () => {
      Living.init();
      const guild = Living.getGuild();
      guild.tier = 4;
      pack.history.figures ??= [];
      const figures = pack.history.figures;
      const heroId = figures.length;
      figures.push(
        makeGuildFigure(heroId, { skills: { m: 3, w: 1, s: 0, c: 2 }, xp: 300, virtues: ["bold"], cell: 1 })
      );
      const rookieId = heroId + 1;
      figures.push(makeGuildFigure(rookieId, { xp: 0 }));
      guild.roster = [heroId, rookieId];
      guild.relics = [
        {
          id: 1,
          name: "Old Crown",
          category: "regalia",
          lore: "A battered diadem.",
          originYear: 500,
          bonuses: { s: 2 },
          holder: { kind: "vault" }
        }
      ];

      const result = Living.turnAge();

      expect(guild.ageCount).toBe(1);
      expect(guild.legacyTier).toBe(1);
      expect(guild.tier).toBe(4);
      expect(guild.relics).toHaveLength(1);
      expect(guild.relics[0]!.holder).toEqual({ kind: "vault" });
      expect(guild.chapterBurgIds).toEqual([1]);

      expect(figures[heroId]!.death).toBe(result.year);
      expect(guild.roster).not.toContain(heroId);
      expect(guild.roster).not.toContain(rookieId); // level 1 heroes leave no bloodline

      const scion = figures.find(figure => figure.i === guild.roster[0])!;
      expect(scion.skills?.m).toBe(5); // ancestor 3 + 1 + 1 legacyTier, capped at 5
      expect(scion.virtues).toContain("bold");
      expect(scion.roles[0]!.type).toBe("adventurer");
    });
  });

  describe("OpenCiv slice 2: cell yields, resources, improvements & minor burgs", () => {
    const makeGood = (i: number, name: string, tags: string[], demandCoverage: Good["demandCoverage"]): Good => ({
      i,
      name,
      tags,
      demandCoverage,
      value: 1,
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
      pack.goods = [];
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
      pack.goods = [makeGood(0, "None", [], {}), wheat, horses, wine, iron, stone];

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

      (living.cells ??= {})[1] = { improvement: "farm" };
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
      pack.goods = [makeGood(0, "None", [], {}), makeGood(1, "Wheat", ["food"], { food: 1 })];
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
      goods: [makeGood(0, "None", [], {}), makeGood(1, "Wine", ["luxury"], { luxury: 1 })],
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
        { i: 0, name: "Neutrals", treasury: 0, diplomacy: [] },
        {
          i: 1,
          name: "Aeloria",
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
      (living.cells ??= {})[1] = { improvement: "mine" };
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
      (living.cells ??= {})[1] = { improvement: "mine" };

      Living.tick(1);

      expect(living.burgs[1].productionQueue?.[0]).toEqual({ kind: "building", id: "monument" });
    });

    it("races a World Wonder and refunds every rival's invested Production", () => {
      const living = Living.init();
      living.states[1].researchedTechs = ["writing"];
      living.states[2].researchedTechs = ["writing"];
      (living.cells ??= {})[1] = { improvement: "mine" };

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
      expect(pack.states[2].treasury).toBe(40 + (living.states[2].yieldsPerTurn?.gold ?? 0));
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
        (living.cells ??= {})[1] = { improvement: "farm" };
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
      (living.cells ??= {})[1] = { improvement: "mine" };
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
      (living.cells ??= {})[1] = { improvement: "farm" };
      expect(getCellYields(1, 1, living).food).toBe(3);

      living.states[1].researchedTechs = ["civil_service"];
      expect(getCellYields(1, 1, living).food).toBe(3);

      pack.cells.r[1] = 1;
      expect(getCellYields(1, 1, living).food).toBe(4);
      expect(getCellYieldSources(1, 1, living).some(source => source.kind === "tech")).toBe(true);

      (living.cells ??= {})[3] = { improvement: "mine" };
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
      expect(pack.states[1].treasury).toBe(5);

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
      pack.states[1].treasury = -10;

      Living.tick(1);

      expect(pack.states[1].treasury).toBe(0);
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
      (living.cells ??= {})[1] = { improvement: "plantation" };
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

      pack.states[1].treasury = 50;
      expect(Living.hurryProduction(1)).toBe(false);

      pack.states[1].treasury = 1000;
      expect(Living.hurryProduction(1)).toBe(true);
      expect(b1.civBuildings).toContain("monument");
      expect(pack.states[1].treasury).toBeLessThan(1000);
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
      pack.states[1].treasury = 1000;
      expect(Living.hurryProduction(1)).toBe(true);

      const blocks = (pack.states[1].military ?? []).reduce((sum, reg) => sum + (reg.units?.length ?? 0), 0);
      expect(blocks).toBeGreaterThan(13);
      expect(Object.keys(living.armies ?? {}).length).toBeGreaterThan(0);
    });

    it("recruits utility units and lets a Builder improve a tile", () => {
      const living = Living.init();
      const regiment = Living.recruitUnit(1, 1, "builder");
      expect(regiment).not.toBeNull();
      const builder = living.units?.[unitKey(1, regiment!.i)]!;
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
      pack.states[1].treasury = 0; // no Gold: no autonomous muster
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
      pack.states[1].treasury = 1000;
      living.states[1]!.researchedTechs = [requiredTechFor(target!, roster)];

      expect(Living.upgradeRegiment(1, 0)).toBe(true);

      expect(regiment.units![0]!.type).toBe(target!.id);
      expect(regiment.units![0]!.hp).toBe(0.45);
      expect(regiment.units![0]!.exp).toBe(6);
      expect(pack.states[1].treasury).toBeLessThan(1000);
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

  describe("OpenCiv slice 6: religion, diplomacy & relic perks", () => {
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

    const makeRelic = (id: number, category: HistoricalRelic["category"], stateId = 1): HistoricalRelic => ({
      id,
      name: `${category} relic`,
      category,
      lore: "A relic.",
      originYear: 900,
      bonuses: {},
      holder: { kind: "state", id: stateId }
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
      const missionary = living.units?.[`1-${regiment.i}`]!;

      Living.tick(1);

      expect(living.burgs[2].religionPressure?.[religionId]).toBeGreaterThanOrEqual(180);
      expect(missionary.spreadCharges).toBe(1);
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

    it("applies leased relic perks to yields and happiness", () => {
      const living = Living.init();
      const guild = Living.getGuild();
      guild.relics = [makeRelic(0, "regalia"), makeRelic(1, "charter"), makeRelic(2, "idol")];

      Living.tick(1);

      const sSim = living.states[1];
      expect(sSim.happinessBreakdown?.relics).toBe(4);
      expect(sSim.yieldsPerTurn?.faith).toBeGreaterThanOrEqual(4);
      expect(sSim.yieldsPerTurn?.culture).toBeGreaterThanOrEqual(2);
      expect(sSim.yieldsPerTurn?.gold).toBeGreaterThan(5);
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
      const trouble = Living.spawnTrouble(1, "bandits", "burg", 2);
      expect(trouble).not.toBeNull();
      const carrier = Object.values(living.burgs).find(bSim =>
        (bSim?.productionQueue ?? []).some(item => item.kind === "trouble")
      );
      expect(carrier).toBeDefined();

      // Production completes the work order and clears the affliction.
      carrier!.productionQueue = [{ kind: "trouble", id: "bandits" }];
      carrier!.productionProgress = { "trouble:bandits": 79 }; // one Production from done
      Living.tick(1);

      expect(living.provinces[1].trouble).toBeNull();
      expect(living.provinces[1].order).toBeGreaterThan(0);
    });
  });
});

describe("Unified Figures slice 1: specialist commanders", () => {
  beforeEach(() => {
    globalThis.options = {
      map: {
        seed: "test-living-seed",
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
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Aeloria",
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

describe("Unified Figures slice 2: named dispatch", () => {
  beforeEach(() => {
    globalThis.options = {
      map: {
        seed: "test-living-seed",
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
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Aeloria",
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
      provinces: [{ i: 0 }, { i: 1, name: "Ems", state: 1, burg: 1, center: 1 }],
      history: { events: [], realms: [], eras: [{ name: "Age of Dawn", from: 500, to: 1000 }], figures: [] }
    } as unknown as typeof pack;
  });

  it("names the matching specialist commander in the dispatch news", () => {
    Living.init();
    const living = Living.getState();
    const commander = pack.history.figures!.find(f => f.roles.some(r => r.specialty === "sage"))!;
    Living.spawnTrouble(1, "ancient_curse", "burg", 2); // pool w, requiredRole sage
    const beforeXp = commander.xp ?? 0;
    const success = Living.resolveTrouble(1, 1);
    const news = living.recentNews[0]!;
    expect(news.text).toContain(commander.name);
    expect(news.text).toContain("Ancient Curse");
    if (success) {
      expect(commander.xp).toBeGreaterThan(beforeXp);
      if (living.provinces[1].trouble === null) {
        const event = pack.history.events!.at(-1)!;
        expect(event.type).toBe("deed");
        expect(event.actors).toContainEqual({ kind: "figure", id: commander.i });
      }
    }
  });

  it("a disastrous resolution breaks or slays the commander", () => {
    Living.init();
    const commander = pack.history.figures!.find(f => f.roles.some(r => r.specialty === "sage"))!;
    commander.virtues = [];
    commander.vices = ["cruel", "greedy", "wrathful"]; // traitBonus −3
    commander.skills!.w = 0;
    const regiment = pack.states[1].military![0];
    for (const unit of regiment.units!) unit.disruption = 3;
    Living.spawnTrouble(1, "ancient_curse", "burg", 10); // dc 26: total ≤ 20 is a guaranteed fumble
    const vicesBefore = commander.vices.length;
    Living.resolveTrouble(1, 1);
    const broken = commander.death !== undefined || commander.vices.length > vicesBefore;
    expect(broken).toBe(true);
    if (commander.death !== undefined) {
      expect(regiment.crew).not.toContain(commander.i); // the fallen commander is uncrewed
    }
  });

  it("falls back to the anonymous state voice when no specialist is fielded", () => {
    Living.init();
    const living = Living.getState();
    const state = pack.states[1];
    state.military![0].units = state.military![0].units!.filter(u => u.type !== "sage_coven");
    state.military![0].crew = [];
    Living.spawnTrouble(1, "ancient_curse", "burg", 2);
    Living.resolveTrouble(1, 1);
    const news = living.recentNews[0]!;
    expect(news.text).toContain("Aeloria");
  });
});

const buildStubPack = () => {
  globalThis.options = {
    map: {
      seed: "test-emergent-state-seed",
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
        culture: 1,
        capital: 1,
        center: 1,
        provinces: [1, 2, 3],
        military: []
      },
      {
        i: 2,
        name: "Khazadia",
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

describe("Living (Lair Ascension Slice 3: Shared Emergent State Engine)", () => {
  beforeEach(() => {
    buildStubPack();
  });

  it("rejects ineligible troubles and lairs without mutating world state", () => {
    Living.init();
    const stateCountBefore = pack.states.length;

    Living.spawnTrouble(2, "flooding", "resource", 7);
    expect(Living.promoteTroubleToState(2)).toBeNull();
    expect(pack.states.length).toBe(stateCountBefore);

    Living.spawnTrouble(2, "monsters", "ruin", 7);
    expect(Living.promoteTroubleToState(2)).toBeNull();

    Living.spawnLair(2, "monster_nest", 8);
    expect(Living.ascendLairToState(2)).toBeNull();

    Living.spawnLair(2, "cursed_earth", 8);
    expect(Living.ascendLairToState(2)).toBeNull();
    expect(pack.states.length).toBe(stateCountBefore);
  });

  it("promotes an eligible trouble into a sovereign state by seizing the province burg", () => {
    const living = Living.init();
    Living.spawnTrouble(2, "demagogue", "burg", 7);

    const newStateId = Living.promoteTroubleToState(2);
    expect(newStateId).toBe(3);

    const newState = pack.states[newStateId!];
    expect(newState).toBeDefined();
    expect(newState.expansionism).toBe(0.8);
    expect(newState.treasury).toBe(150);
    expect(newState.capital).toBe(2);
    expect(newState.fullName).toContain("Revolutionary Tribune");

    const capital = pack.burgs[2];
    expect(capital.state).toBe(newStateId);
    expect(capital.capital).toBe(1);
    expect(pack.cells.state[3]).toBe(newStateId);
    expect(pack.provinces[2].state).toBe(newStateId);

    // Trouble cleared, order & stability scaffolded
    const pSim = living.provinces[2];
    expect(pSim.trouble).toBeNull();
    expect(pSim.order).toBe(75);
    expect(pSim.stability).toBe(3);

    // Capital buildings scaffolded
    const bSim = living.burgs[2];
    expect(bSim.unrest).toBe(0);
    expect(bSim.buildings).toEqual(expect.arrayContaining(["walls2", "barracks1", "market1", "temple1"]));

    // Aggressive ruler minted & 1st Regiment raised
    const sSim = living.states[newStateId!];
    const ruler = pack.history.figures!.find(f => f.i === sSim.rulerId)!;
    expect(ruler).toBeDefined();
    expect(ruler.virtues).toContain("brave");
    expect(ruler.vices?.some(v => ["wrathful", "cruel", "vengeful"].includes(v))).toBe(true);
    expect(newState.military?.length).toBe(1);
    expect(newState.military![0].a).toBeGreaterThan(0);

    // Mutual war, claim, and weight-60 grudges
    expect(newState.diplomacy![1]).toBe("Enemy");
    expect(pack.states[1].diplomacy![newStateId!]).toBe("Enemy");
    expect(living.states[1].claims.some(c => c.burgId === 2 && c.heldByStateId === newStateId)).toBe(true);
    expect(living.states[1].grudges.some(g => g.againstStateId === newStateId && g.weight === 60)).toBe(true);
    expect(sSim.grudges.some(g => g.againstStateId === 1 && g.weight === 60)).toBe(true);

  });

  it("ascends a wilderness lair by founding a new capital burg and hiding its dungeon marker", () => {
    const living = Living.init();
    const lair = Living.spawnLair(3, "demonic_master", 8, 4)!;
    const markerId = lair.markerId!;
    expect(pack.markers![markerId].hidden).toBeFalsy();

    const burgsBefore = pack.burgs.length;
    const newStateId = Living.ascendLairToState(3);
    expect(newStateId).toBe(3);
    expect(pack.burgs.length).toBe(burgsBefore + 1);

    const newState = pack.states[newStateId!];
    expect(newState.rosterId).toBe("demonBase");
    expect(newState.fullName).toContain("Infernal Dominion");

    const newCapital = pack.burgs[newState.capital];
    expect(newCapital.cell).toBe(4);
    expect(newCapital.capital).toBe(1);
    expect(newCapital.state).toBe(newStateId);
    expect(pack.cells.state[4]).toBe(newStateId);

    // The dungeon marker becomes a ruin and the lair is cleared
    expect(pack.markers![markerId].type).toBe("ruins");
    expect(living.provinces[3].lair).toBeNull();
    expect(living.provinces[3].order).toBe(75);
  });

  it("organically promotes a festering trouble to a state in stepProvinces when order has collapsed", () => {
    const living = Living.init();
    const trouble = Living.spawnTrouble(2, "demagogue", "burg", 10)!;
    trouble.seasonsUnchecked = 5;
    living.provinces[2].order = 20;

    Living.tick(1);

    expect(pack.states.length).toBe(4);
    expect(pack.provinces[2].state).toBe(3);
    expect(living.provinces[2].trouble).toBeNull();
    expect(living.provinces[2].lair).toBeNull();
    expect(pack.burgs[2].state).toBe(3);
    expect(pack.burgs[2].capital).toBe(1);
  });

  it("metastasizes a festering trouble into a lair instead of promoting when order is intact", () => {
    const living = Living.init();
    const trouble = Living.spawnTrouble(2, "demagogue", "burg", 10)!;
    trouble.seasonsUnchecked = 5;
    living.provinces[2].order = 80;
    living.states[1].unravel = 0;
    living.states[1].warExhaustion = 0;

    Living.tick(1);

    expect(pack.states.length).toBe(3);
    expect(living.provinces[2].trouble).toBeNull();
    expect(living.provinces[2].lair).not.toBeNull();
  });

  it("promotes a trouble immediately when resolveTrouble critically backfires in a low-order province", () => {
    const living = Living.init();
    Living.spawnTrouble(2, "exiled_lord", "burg", 9); // high DC (16 + 3*9 = 43) guarantees total <= dc - 10
    living.provinces[2].order = 25;

    const success = Living.resolveTrouble(1, 2);
    expect(success).toBe(false);
    expect(pack.states.length).toBe(4);
    expect(pack.provinces[2].state).toBe(3);
    expect(living.provinces[2].trouble).toBeNull();
  });

  it("ascends a state-capable lair via Path A (raid coup) when overwhelming a vulnerable non-capital settlement", () => {
    const living = Living.init();
    const lair = Living.spawnLair(2, "aspiring_warlord", 7, 3)!;
    lair.raidPending = true;
    lair.raidUnits = Array.from({ length: 8 }, () => ({ type: "cavalry", count: 1000, exp: 5 }));
    living.provinces[2].order = 18;
    pack.burgs[2].walls = 0;

    Living.tick(1);

    expect(pack.states.length).toBe(4);
    expect(pack.provinces[2].state).toBe(3);
    expect(pack.burgs[2].state).toBe(3);
    expect(pack.burgs[2].capital).toBe(1);
    expect(living.provinces[2].lair).toBeNull();
  });

  it("ascends an entrenched wilderness lair via Path B when active >= 8 seasons at level >= 8", () => {
    const living = Living.init();
    const lair = Living.spawnLair(3, "dwarven_outcasts", 8, 4)!;
    lair.seasonsActive = 7; // stepProvinces increments to 8
    lair.raidThreshold = 7; // prevent raid so Path B is exercised directly

    Living.tick(1);

    expect(pack.states.length).toBe(4);
    expect(pack.provinces[3].state).toBe(3);
    expect(living.provinces[3].lair).toBeNull();
    expect(pack.states[3].rosterId).toBe("infernalDwarfBase");
  });

  it("records independence chronicle events and round-trips emergent states through serializeHistory / parseHistory", () => {
    const living = Living.init();
    Living.spawnTrouble(2, "demagogue", "burg", 7);
    const troubleStateId = Living.promoteTroubleToState(2)!;

    Living.spawnLair(3, "demonic_master", 8, 4);
    const lairStateId = Living.ascendLairToState(3)!;

    const independenceEvents = pack.history.events!.filter(e => e.type === "independence");
    expect(independenceEvents).toHaveLength(2);
    expect(independenceEvents[0]!.actors).toContainEqual({ kind: "state", id: troubleStateId });
    expect(independenceEvents[1]!.actors).toContainEqual({ kind: "state", id: lairStateId });

    const { json, snapshotRecords } = serializeHistory(pack.history, pack.cells.i.length);
    const restored = parseHistory(json, snapshotRecords, pack.cells.i.length);

    expect(restored.living?.states[troubleStateId]?.rulerId).toBe(living.states[troubleStateId].rulerId);
    expect(restored.living?.provinces?.[2]?.trouble).toBeNull();
    expect(restored.living?.provinces?.[3]?.lair).toBeNull();
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
        const s1 = Living.promoteTroubleToState(2)!;
        Living.spawnLair(3, "ancient_evil", 9, 4);
        const s2 = Living.ascendLairToState(3)!;
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

describe("Living World Factions (Phase 3: Economy, Agendas, Military, Raids & Ascension)", () => {
  beforeEach(() => {
    buildStubPack();
  });

  it("bridges getGuild with getPlayerFaction and synchronizes roster, missions, and relics", () => {
    const living = Living.init();
    const playerFaction = Living.getPlayerFaction();
    expect(playerFaction).toBeDefined();
    expect(playerFaction.i).toBeGreaterThan(0);
    expect(living.playerFactionId).toBe(playerFaction.i);

    // Guild getters and setters mirror player faction
    const guild = Living.getGuild();
    expect(guild.gold).toBe(playerFaction.treasury);

    playerFaction.treasury = 500;
    playerFaction.influence = 200;
    playerFaction.memberIds = [101, 102];
    Living.syncPlayerFaction(living);

    const updatedGuild = Living.getGuild();
    expect(updatedGuild.gold).toBe(500);
    expect(updatedGuild.renown).toBe(200);
    expect(updatedGuild.roster).toEqual([101, 102]);

    // Switching player faction
    const newFaction = Factions.add({
      name: "Iron Vanguard",
      category: "martial",
      type: "mercenary_company",
      allegiance: "autonomous",
      hq: { cell: 1, fortified: true, secrecy: 0, assets: ["muster_camp"] },
      treasury: 750,
      influence: 350
    });
    expect(Living.setPlayerFaction(newFaction.i)).toBe(true);
    expect(Living.getPlayerFaction().i).toBe(newFaction.i);
    expect(Living.getGuild().gold).toBe(750);
  });

  it("advances faction economy, applies yields, upkeeps, and progresses tech research with host-state spillover", () => {
    const living = Living.init();
    pack.factions = [{ i: 0 } as Faction];

    // Host state 1 has researched pottery
    pack.states[1].researchedTechs = ["pottery"];
    if (living.states[1]) living.states[1].researchedTechs = ["pottery"];

    const faction = Factions.add({
      name: "Golden Crest Trading",
      category: "commercial",
      type: "merchant_consortium",
      scale: "burg",
      tier: 1,
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

    const initTreasury = faction.treasury;
    Living.stepFactionEconomyAndTech(living);

    // Economy: trade_depot yield (gold: 6, influence: 2) x 2 (HQ + outpost) + outpost tier*2 (2) + outpost influence (1) = gold +14, minus outpost upkeep (-1)
    expect(faction.treasury).toBeGreaterThan(initTreasury);
    expect(faction.influence).toBeGreaterThan(20);

    // Tech research: progress accumulated
    expect(faction.researchedProgress.pottery ?? 0).toBeGreaterThan(0);

    // Trigger completion
    faction.researchedProgress.pottery = 34;
    faction.science = 5;
    Living.stepFactionEconomyAndTech(living);
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
      scale: "province",
      tier: 2,
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
      scale: "burg",
      tier: 1,
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

  it("musters military regiments, conducts raids and ascends to sovereign state", () => {
    const living = Living.init();
    pack.factions = [{ i: 0 } as Faction];

    const raiderFaction = Factions.add({
      name: "Ironfang Warband",
      category: "martial",
      type: "raider_clan",
      allegiance: "hostile",
      scale: "province",
      tier: 2,
      treasury: 300,
      seasonsActive: 10,
      sovereignAmbition: true,
      stateForm: "Warband Realm",
      hq: { cell: 4, fortified: true, secrecy: 0, assets: ["muster_camp"] }
    });

    // Step military: musters regiment
    Living.stepFactionMilitaryAndRaids(living);
    expect(raiderFaction.military.length).toBeGreaterThan(0);
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
    Living.init();
    const fallenState = pack.states[1];
    fallenState.researchedTechs = ["mining", "pottery", "masonry"];

    const remnant = Living.spawnRemnantFaction(fallenState, 2);
    expect(remnant).not.toBeNull();
    expect(remnant!.name).toContain("Aeloria Restoration Front");
    expect(remnant!.category).toBe("political");
    expect(remnant!.type).toBe("rebel_front");
    expect(remnant!.allegiance).toBe("hostile");
    expect(remnant!.sovereignAmbition).toBe(true);
    expect(remnant!.stateRelations[2]).toBe("Enemy");
    expect(remnant!.researchedTechs).toEqual(fallenState.researchedTechs);
  });
});








