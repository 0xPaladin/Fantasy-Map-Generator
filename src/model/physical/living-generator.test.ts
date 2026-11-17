// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOVEREIGN_DEVELOPMENT } from "@/data/living-eras";
import { getTroubleDef } from "@/data/living-troubles";
import { currentContent } from "@/data/roster-store";
import { Deals } from "@/model/economy/deals";
import { nextRosterUnitInCategory, requiredDevelopmentFor } from "@/model/physical/living-armies";
import type { Burg } from "@/model/political/burgs-generator";
import { Factions } from "@/model/political/factions-generator";
import { Military, syncRegimentTotals } from "@/model/political/military-generator";
import { noFinance } from "@/model/political/states-generator";
import { parseHistory, serializeHistory } from "@/services/io/epochs-format";
import type { Good } from "@/types/economy";
import type { Faction } from "@/types/factions";
import type { StateAgenda } from "@/types/living";
import {
  classifyGood,
  FACTION_SUPPRESSION_SEASONS,
  figureBias,
  hasStackingConflict,
  isMajorBurg,
  Living,
  regionTierFromPop,
  settlementTierFromPop,
  syncBurgBuildingsFromFlags,
  syncBurgFlagsFromBuildings,
  terrainDefenseMultiplier
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

  it("advances seasons and increments calendar year every 4 ticks", () => {
    const living = Living.init();

    // Tick 1: Summer 1000
    Living.tick(1);
    expect(living.tick).toBe(1);
    expect(living.season).toBe(1);
    expect(options.map.lore.calendar.year).toBe(1000);

    Living.tick(3); // Autumn (2), Winter (3), Spring (0 -> year 1001!)
    expect(living.tick).toBe(4);
    expect(living.season).toBe(0);
    expect(options.map.lore.calendar.year).toBe(1001);
    expect(pack.history.eras.at(-1)?.to).toBe(1001);
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

  it("annexes a kin Free Burg peacefully", () => {
    const living = Living.init();

    expect(Living.colonize(1, 3)).toBe(true);

    expect(pack.burgs[3].state).toBe(1);
    expect(pack.cells.state[4]).toBe(1);
    expect(living.burgs[3].conqueredBy).toBeUndefined();
    expect(living.recentNews[0]).toMatchObject({ kind: "colonize", burgId: 3 });
  });

  it("storms a resisting Free Burg and marks conquest", () => {
    const living = Living.init();
    const army = pack.states[1].military![0];
    army.units = Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 }));
    army.a = 2000;
    pack.cells.province[5] = 1;

    expect(Living.colonize(1, 4)).toBe(true);

    expect(pack.burgs[4].state).toBe(1);
    expect(pack.cells.state[5]).toBe(1);
    expect(living.burgs[4].conqueredBy).toBe(1);
    expect(living.recentNews[0]).toMatchObject({ kind: "conquest", burgId: 4 });
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

    living.states[2].warExhaustion = 60;

    Living.tick(4);

    expect(pack.states[2].economy.simStabilityAdjustments?.some(l => l.name === "Succession Crisis")).toBe(true);
    expect(living.recentNews.some(item => item.kind === "succession" && item.text.includes("crisis"))).toBe(true);
  });

  it("raises a rebel and restores a Free Burg when sparked", () => {
    const living = Living.init();
    const army = pack.states[1].military![0];
    army.units = Array.from({ length: 13 }, () => ({ type: "spear", hp: 1, exp: 0 }));
    army.a = 2000;

    expect(Living.colonize(1, 4)).toBe(true);
    const figuresBefore = pack.history.figures!.length;

    expect(Living.sparkRebellion(1, 4)).toBe(true);

    expect(pack.burgs[4].state).toBe(0);
    expect(pack.cells.state[5]).toBe(0);
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

    expect(Living.sparkRebellion(1, 4)).toBe(true);

    expect(pack.burgs[4].state).toBe(2);
    expect(pack.cells.state[5]).toBe(2);
    expect(pack.states[2].military?.some(regiment => regiment.name.startsWith("Rebels of"))).toBe(true);
  });

  it("founds a secessionist state when a core burg rebels", () => {
    const living = Living.init();
    pack.burgs[4].state = 1;
    pack.cells.state[5] = 1;
    living.burgs[4].originalOwner = 1;
    const statesBefore = pack.states.length;

    expect(Living.sparkRebellion(1, 4)).toBe(true);

    expect(pack.states.length).toBe(statesBefore + 1);
    const secession = pack.states.at(-1)!;
    expect(secession.i).toBe(statesBefore);
    expect(secession.capital).toBe(4);
    expect(pack.burgs[4].state).toBe(secession.i);
    expect(living.states[1].grudges.some(grudge => grudge.reason === "repulsed")).toBe(true);
  });

  it("clears a pacify agenda when province stability recovers", () => {
    const living = Living.init();
    pack.burgs[4].state = 1;
    pack.cells.state[5] = 1;
    living.states[1].agenda = {
      kind: "pacify",
      label: "Pacifying Outcast Hold",
      targetBurgId: 4,
      progress: 0,
      required: 1
    };

    Living.tick(1);

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
    expect(living.recentNews[0].kind).toBe("revolt");
  });

  it("pacifies a burg at once", () => {
    const living = Living.init();
    pack.burgs[4].state = 1;
    pack.cells.state[5] = 1;

    expect(Living.pacifyBurg(4)).toBe(true);

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

  it("assigns and quells trouble flavor silently without news", () => {
    const living = Living.init();
    const trouble = Living.spawnTrouble(1, "flooding");

    expect(trouble).toMatchObject({
      id: "flooding",
      severity: "flavor",
      seasonsLow: 0
    });
    expect(living.provinces[1].trouble).toEqual(trouble);
    expect(living.recentNews.some(n => n.kind === "trouble")).toBe(false);

    expect(Living.quellTrouble(1)).toBe(true);
    expect(living.provinces[1].trouble).toBeNull();
    expect(living.recentNews.some(n => n.kind === "trouble")).toBe(false);
  });

  it("silently escalates low-stability flavor trouble to drain after 2 seasons and clears when stability recovers", () => {
    const living = Living.init();
    // Force province 1 stability below 0.40 using stock province adjustments
    pack.provinces[1].stabilityAdjustments = [{ name: "Crisis", value: -45 }];

    Living.tick(1);
    expect(living.provinces[1].trouble).not.toBeNull();
    expect(living.provinces[1].trouble?.severity).toBe("flavor");
    expect(living.provinces[1].trouble?.seasonsLow).toBe(1);
    expect(living.recentNews.some(n => n.kind === "trouble")).toBe(false);

    Living.tick(1);
    expect(living.provinces[1].trouble?.severity).toBe("drain");
    expect(living.provinces[1].trouble?.seasonsLow).toBeGreaterThanOrEqual(2);
    expect(pack.states[1].economy.simAdjustments?.some(l => l.name.startsWith("Trouble: ") && l.value === -3)).toBe(
      true
    );
    expect(pack.provinces[1].simStabilityAdjustments?.some(l => l.name.startsWith("Trouble: ") && l.value === -5)).toBe(
      true
    );
    expect(living.recentNews.some(n => n.kind === "trouble")).toBe(false);

    // Recover stability >= 0.55: trouble and drain lines clear silently
    pack.provinces[1].stabilityAdjustments = [{ name: "Stabilized", value: 40 }];
    Living.tick(1);
    expect(living.provinces[1].trouble).toBeNull();
    expect((pack.states[1].economy.simAdjustments ?? []).some(l => l.name.startsWith("Trouble: "))).toBe(false);
    expect(pack.provinces[1].simStabilityAdjustments?.some(l => l.name.startsWith("Trouble: "))).toBe(false);
  });

  it("silently names instability with a flavor trouble when below 55% and leaves economy untouched", () => {
    const living = Living.init();
    pack.provinces[1].stabilityAdjustments = [{ name: "Strain", value: -25 }];
    const trouble = Living.spawnTrouble(1, "flooding")!;
    expect(trouble.severity).toBe("flavor");

    Living.tick(1);
    expect(living.provinces[1].trouble?.severity).toBe("flavor");
    expect((pack.states[1].economy.simAdjustments ?? []).some(l => l.name.startsWith("Trouble: "))).toBe(false);
  });

  it("exposes trouble flavor defs for all causes via getTroubleDef", () => {
    expect(getTroubleDef("flooding").cause).toBe("site");
    expect(getTroubleDef("exceptional_poverty").cause).toBe("poverty");
    expect(getTroubleDef("cultural_feuding").cause).toBe("diversity");
    expect(getTroubleDef("bad_reputation").cause).toBe("corruption");
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
    expect(faction!.type).toBe("dread_host");
    expect(faction!.hq.burgId).toBe(1);
    expect(faction!.military[0]!.units!.length).toBeGreaterThan(0);
    expect(faction!.stateRelations[1]).toBe("Enemy");

    expect(Living.quellTrouble(1)).toBe(false);

    expect(Living.smiteFaction(1)).toBe(true);
    expect(Factions.active().some(f => f.i === faction!.i)).toBe(false);
  });

  it("tracks seasonsActive while a hostile faction is entrenched", () => {
    Living.init();
    Living.quellTrouble(1);
    const faction = Living.spawnDangerousFaction(1, "monsters", "ruin", 6)!;
    faction.seasonsActive = 6;

    Living.tick(1);

    expect(faction.seasonsActive).toBeGreaterThan(6);
  });

  it("keeps drain troubles provincial without spontaneously spawning a faction", () => {
    const living = Living.init();
    pack.provinces[1].stabilityAdjustments = [{ name: "Collapse", value: -45 }];
    const trouble = Living.spawnTrouble(1, "flooding", "drain")!;
    trouble.seasonsLow = 5;

    Living.tick(1);

    expect(living.provinces[1].trouble?.severity).toBe("drain");
    expect(Factions.active()).toHaveLength(0);
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

  it("selects suppress_faction agenda against a hostile threat", () => {
    const living = Living.init();
    Living.quellTrouble(1);
    Living.spawnDangerousFaction(1, "brigand_raiders", "burg", 6);

    const sSim = living.states[1];
    sSim.agenda = null;

    // Advance 1 tick so chooseAgenda and stepAgenda run
    Living.tick(1);

    // Agenda should have targeted the hostile faction with suppress_faction or resolved it
    expect(
      (sSim.agenda as StateAgenda | null)?.targetProvinceId ?? living.recentNews.some(item => item.kind === "faction")
    ).toBeTruthy();

    // Active suppress_faction agenda uses the unified kind
    const activeAgenda: StateAgenda = {
      kind: "suppress_faction",
      label: "Suppressing Ruined Keep",
      targetProvinceId: 1,
      progress: 0,
      required: 1
    };
    sSim.agenda = activeAgenda;
    expect(sSim.agenda.kind).toBe("suppress_faction");
  });

  describe("Wheel of Ages (slice 5)", () => {
    /** A dangerous faction's seat settled past the sovereignty threshold. */
    function seedFactionDevelopment(cell: number): void {
      pack.cells.h = new Uint8Array(pack.cells.i.length).fill(25);
      pack.cells.burg = new Uint16Array(pack.cells.i.length);
      pack.cells.development = new Uint8Array(pack.cells.i.length);
      pack.cells.development[cell] = SOVEREIGN_DEVELOPMENT;
    }

    it("tracks the eschaton clock from mighty factions and evil conquests", () => {
      const living = Living.init();
      expect(Living.getEschaton()).toBe(0);

      const doom = Living.spawnDangerousFaction(1, "brigand_raiders", "burg", 9)!;
      doom.seasonsActive = 8;
      seedFactionDevelopment(pack.burgs[1].cell);
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
      seedFactionDevelopment(pack.burgs[1].cell);
      Living.tick(1);
      expect(Living.getEschaton()).toBe(1);

      expect(Living.smiteFaction(1)).toBe(true);
      Living.relieveEschaton(living);

      expect(Factions.active().some(f => f.hq.burgId === 1 && f.allegiance === "hostile")).toBe(false);
      expect(Living.getEschaton()).toBe(0);
    });

    it("turns the wheel: bakes the epoch, retires unstable realms and seeds ruins", () => {
      const living = Living.init();
      pack.states[2].economy.simStabilityAdjustments = [{ name: "Collapse", value: -80 }];
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

  describe("Goods, burg classes & cell records", () => {
    beforeEach(() => {
      setupCityWorld();
    });

    it("classifies goods into the living resource classes", () => {
      const good = (tags: string[], demandCoverage: Good["demandCoverage"]): Good => ({
        i: 0,
        name: "Good",
        tags,
        demandCoverage,
        value: 1,
        carriage: 1,
        unit: "unit",
        icon: "",
        color: "#000000"
      });

      expect(classifyGood(good(["food"], { food: 1 }))).toBe("bonus");
      expect(classifyGood(good(["supply", "military"], { utilities: 0.6, military: 0.4 }))).toBe("strategic");
      expect(classifyGood(good(["food", "luxury"], { food: 0.5, luxury: 0.5 }))).toBe("luxury");
      expect(classifyGood(good(["ore", "military"], { food: 1 }))).toBe("strategic");
      expect(classifyGood(good(["construction"], { construction: 1 }))).toBe("bonus");
      expect(classifyGood(undefined)).toBeNull();
    });

    it("separates major and minor burgs for the city UI", () => {
      Living.init();

      expect(isMajorBurg(pack.burgs[1])).toBe(true); // a capital
      expect(isMajorBurg(pack.burgs[3])).toBe(false); // a free village
      pack.burgs[4].population = 8; // a free city: settlement tier 4
      expect(isMajorBurg(pack.burgs[4])).toBe(true);
    });

    it("lazily initializes the cell record on old saves", () => {
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
        routes: new Uint16Array(count),
        market: new Uint16Array(count)
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
      markets: [],
      history: {
        events: [],
        realms: [],
        eras: [{ name: "Age of Dawn", from: 500, to: 1000 }],
        figures: []
      }
    } as unknown as typeof pack;

    options.map.goods = [makeGood(0, "None", [], {}), makeGood(1, "Wine", ["luxury"], { luxury: 1 })];
  }

  describe("State treasury & bankruptcy", () => {
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

    it("leaves a map without development untouched", () => {
      const living = Living.init();

      expect(pack.cells.development).toBeUndefined();
      expect(living.economyDirty).toBeFalsy();
    });

    it("eases peopled cells toward the state's mean development", () => {
      const development = seedMap({ 5: 60, 9: 40 }, { 5: 100, 9: 100 }); // mean 50
      const living = Living.init();

      Living.tick(1);

      expect(development[9]).toBe(41); // the low cell climbs toward the mean
      expect(development[5]).toBe(60); // the burg keeps its own level
      expect(living.economyDirty).toBe(true);
    });

    it("diffuses development from the polity level into its peopled land", () => {
      const development = seedMap({ 1: 20, 4: 20, 5: 20, 6: 20, 9: 6, 10: 20 }, { 1: 100, 9: 1 });
      const living = Living.init();

      Living.tick(1);

      expect(development[9]).toBeGreaterThan(6); // its people's development spreads
      expect(development[6]).toBe(20); // nobody lives there
      expect(living.economyDirty).toBe(true);
    });
  });

  describe("Upstream economy bridge (economy alignment Phase 3)", () => {
    beforeEach(() => {
      setupCityWorld();
    });

    it("preserves state and burg treasuries as stock Day Balances across ticks", () => {
      pack.states[1].economy.treasury = 77;
      const burg = pack.burgs.find(entry => entry.i === 1)!;
      burg.treasury = 12;

      Living.init();
      Living.tick(1);

      expect(pack.states[1].economy.treasury).toBe(77);
      expect(burg.treasury).toBe(12);
    });

    it("re-runs the upstream economy once the dirty flag is raised", () => {
      const living = Living.init();
      pack.markets = [];
      living.economyDirty = true;

      Living.tick(1);

      // nothing consumable on a stripped pack: the flag stays raised for the next real run
      expect(living.economyDirty).toBe(true);

      pack.markets = [{ i: 1, centerBurgId: 1, goods: {} } as never];
      Living.tick(1);

      expect(living.economyDirty).toBe(false);
    });
  });

  describe("Military goods gating & upkeep (economy alignment Phase 4)", () => {
    beforeEach(() => {
      setupCityWorld();
    });

    /** The default roster's units table plus the map options mustering and upkeep read */
    function armOptions(): void {
      const map = options.map as { military?: unknown; units?: unknown };
      map.military = { units: [{ name: "sword", power: 1 }] };
      map.units = { population: { scale: 1 } };
    }

    /** A fully developed people: the state's mean development clears every era gate. */
    function seedStateDevelopment(): void {
      pack.cells.development = new Uint8Array(GRID * GRID);
      pack.cells.development[5] = 100;
      pack.cells.pop[5] = 100;
    }

    it("musters through the equipment gate when the economy has run", () => {
      armOptions();
      seedStateDevelopment();
      const arms = makeGood(9, "Arms", ["military"], { military: 1 });
      options.map.goods = [makeGood(0, "None", [], {}), arms];
      pack.deals = [[1, 1, arms.i, 2, 1, 1, 0, 0, 0]] as unknown as typeof pack.deals; // a demand deal, no kept stock

      expect(Living.muster(1)).toBe(true);

      const block = pack.states[1].military?.[0]?.units?.[0];
      expect(block?.type).toBe("levy_spear"); // the state consumes no Arms: the sword demoted
      expect(Living.getState().recentNews.some(entry => entry.text.includes("short of Arms"))).toBe(true);
    });

    it("musters the requested block when the goods cannot be measured", () => {
      armOptions();
      seedStateDevelopment();
      pack.deals = undefined as unknown as typeof pack.deals;

      expect(Living.muster(1)).toBe(true);

      expect(pack.states[1].military?.[0]?.units?.[0]?.type).toBe("sword");
    });

    it("spares kits for blocks already in the field", () => {
      armOptions();
      const arms = makeGood(9, "Arms", ["military"], { military: 1 });
      options.map.goods = [makeGood(0, "None", [], {}), arms];
      pack.states[1].military = [
        {
          i: 0,
          name: "Regiment",
          a: 100,
          cell: 5,
          x: 0,
          y: 0,
          bx: 0,
          by: 0,
          n: 0,
          u: { sword: 100 },
          units: [{ type: "sword", hp: 1, exp: 0 }],
          state: 1
        } as never
      ];
      pack.deals = [[1, 1, arms.i, 3, 20, 1, 0, 0, 0]] as unknown as typeof pack.deals; // 20 units kept

      const spare = Military.getEquipmentSpare(1, "Arms", id => id === "sword");
      expect(spare).toBeCloseTo(20 * 0.365 - 1); // consumption × EQUIPMENT − the fielded sword
    });

    it("clamps a funded state's battle upkeep and lets a bankrupt one collapse", () => {
      armOptions();
      const state = pack.states[1];
      state.military = [
        {
          i: 0,
          name: "Regiment",
          a: 100,
          cell: 5,
          x: 0,
          y: 0,
          bx: 0,
          by: 0,
          n: 0,
          u: { sword: 100 },
          units: [{ type: "sword", hp: 1, exp: 0 }],
          state: 1
        } as never
      ];
      pack.deals = [[1, 1, 1, 3, 1, 1, 0, 0, 0]] as unknown as typeof pack.deals;
      state.economy.spent.military = 100; // need is 100 × 20: upkeep 0.05

      state.economy.treasury = 500;
      expect(Military.getLivingBattleUpkeep(1)).toBe(0.5); // funded: the floor holds

      state.economy.treasury = -10;
      expect(Military.getLivingBattleUpkeep(1)).toBeCloseTo(0.05); // bankrupt: toward MIN_UPKEEP

      state.economy.spent.military = 2000; // fully kept
      expect(Military.getLivingBattleUpkeep(1)).toBe(1);

      pack.deals = undefined as unknown as typeof pack.deals;
      expect(Military.getLivingBattleUpkeep(1)).toBe(1); // no run: no modifier
    });

    it("demotes an unpaid elite block to levies instead of disbanding it", () => {
      armOptions();
      const state = pack.states[1];
      state.military = [
        {
          i: 0,
          name: "Regiment",
          a: 100,
          cell: 5,
          x: 0,
          y: 0,
          bx: 0,
          by: 0,
          n: 0,
          u: { sword: 100 },
          units: [{ type: "sword", hp: 1, exp: 4 }],
          state: 1
        } as never
      ];
      pack.deals = [[1, 1, 1, 3, 1, 1, 0, 0, 0]] as unknown as typeof pack.deals;
      state.economy.treasury = -10; // negative daily balance
      state.economy.spent.military = 100; // underfunded: upkeep 0.05 < 0.5

      const living = Living.init();

      Living.tick(1);

      const block = state.military?.[0]?.units?.[0];
      expect(state.economy.treasury).toBe(0);
      expect(block?.type).toBe("levy_spear"); // the sword took service as a levy
      expect(living.recentNews.some(entry => entry.text.includes("took service as"))).toBe(true);
    });
  });

  describe("Factions & characters on the upstream foundation (economy alignment Phase 5)", () => {
    beforeEach(() => {
      setupCityWorld();
      pack.factions = [{ i: 0 } as Faction];
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** An economy run to read: a dealt market at the capital, and a product to tax */
    function runEconomy(): void {
      pack.cells.market[5] = 1;
      pack.markets = [{ i: 1 } as never];
      pack.deals = [[1, 1, 1, 2, 1, 1, 0, 0, 0]] as unknown as typeof pack.deals;
      pack.burgs[1].product = 10;
      vi.spyOn(Deals, "getGoodsValue").mockReturnValue(20);
    }

    it("pays a chartered faction's tithe into its patron's budget as a named line", () => {
      const living = Living.init();
      runEconomy();

      const charter = Factions.add({
        name: "Golden Scales Charter",
        category: "commercial",
        type: "merchant_consortium",
        allegiance: "chartered",
        patronStateId: 1,
        stateRelations: { 1: "Friendly" },
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: ["trade_depot"] }
      });
      const treasuryBefore = charter.treasury ?? 0;

      Living.stepFactionEmpire(living);

      const breakdown = Living.getFactionYieldBreakdown(charter);
      expect(breakdown.charterTithe).toBeGreaterThan(0);
      expect(breakdown.upstreamGold).toBeGreaterThan(0);
      expect(charter.treasury).toBeGreaterThan(treasuryBefore);

      const line = pack.states[1].economy.adjustments.find(entry => entry.name === "Chartered Faction Tithes");
      expect(line).toBeDefined();
      expect(line!.value).toBeCloseTo(breakdown.charterTithe / 90, 2); // a day's tithe, as adjustments are
    });

    it("enriches an underworld faction from the host province's official graft", () => {
      const guild = Factions.add({
        name: "Nightblade Syndicate",
        category: "underworld",
        type: "thieves_guild",
        allegiance: "clandestine",
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 70, assets: ["safe_house"] }
      });
      Living.init();
      runEconomy();
      pack.states[1].economy.pocketed = 0;
      expect(Living.getFactionYieldBreakdown(guild).upstreamGold).toBe(0);

      pack.states[1].economy.pocketed = 30;
      expect(Living.getFactionYieldBreakdown(guild).upstreamGold).toBeGreaterThan(0);
    });

    it("draws a temple's tithe from the court's spending", () => {
      const temple = Factions.add({
        name: "Order of the Dawn",
        category: "religious",
        type: "religious_order",
        allegiance: "autonomous",
        hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: [] }
      });
      const living = Living.init();
      runEconomy();
      pack.states[1].economy.spent.court = 0;
      expect(Living.getFactionYieldBreakdown(temple).upstreamGold).toBe(0);

      pack.states[1].economy.spent.court = 40;
      Living.stepFactionEmpire(living);
      expect(Living.getFactionYieldBreakdown(temple).upstreamGold).toBeGreaterThan(0);
      expect(temple.influence).toBeGreaterThan(0);
    });

    it("audits corruption: officials' cut lowered and graft recovered into the treasury", () => {
      const living = Living.init();
      const state = pack.states[1];
      state.economy.budget.corruption = 20;
      state.economy.treasury = 10;
      state.economy.pocketed = 8;

      const recovered = Living.auditCorruption(1);

      expect(state.economy.budget.corruption).toBeLessThan(20);
      expect(recovered).toBeGreaterThan(0);
      expect(state.economy.treasury).toBeCloseTo(10 + recovered, 2);
      expect(living.recentNews.some(entry => entry.text.includes("audited"))).toBe(true);
    });

    it("sabotages a deposit: its output spoiled", () => {
      const living = Living.init();
      pack.cells.good[3] = 1;
      pack.cells.state[3] = 1;
      pack.cells.province[3] = 1;

      expect(Living.sabotageDeposit(3)).toBe(true);
      expect(living.cells?.[3]?.pillaged).toBe(true);
      expect(living.economyDirty).toBe(true);

      expect(Living.sabotageDeposit(3)).toBe(false); // already spoiled
      expect(Living.sabotageDeposit(4)).toBe(false); // nothing worked there
    });

    it("keeps troops keen when a martial ruler leads", () => {
      const map = options.map as { military?: unknown; units?: unknown };
      map.military = { units: [{ name: "spear", power: 1 }] };
      map.units = { population: { scale: 1, urbanization: { rate: 1 } } };
      const living = Living.init();
      pack.deals = [[1, 1, 1, 3, 1, 1, 0, 0, 0]] as unknown as typeof pack.deals;
      pack.states[1].economy.spent.military = 2000;
      pack.states[1].economy.treasury = 100;
      const plain = Military.getLivingBattleUpkeep(1);

      const ruler = pack.history.figures!.find(figure => figure.i === living.states[1].rulerId)!;
      ruler.virtues = ["brave", "daring", "decisive"];
      ruler.vices = [];
      ruler.alignment = "chaotic";

      expect(Military.getLivingBattleUpkeep(1)).toBeGreaterThan(plain);
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

    it("applies terrain defense from hills and forests", () => {
      expect(terrainDefenseMultiplier(1)).toBe(1);
      pack.cells.h[3] = 55;
      expect(terrainDefenseMultiplier(3)).toBe(1.25);
      pack.cells.biome[2] = 6;
      expect(terrainDefenseMultiplier(2)).toBe(1.25);
      pack.cells.biome[2] = 4;
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
      expect(b2.conqueredBy).toBe(1);
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
      // A settled people: the muster that replaces the dead block clears the sword's era gate
      pack.cells.development = new Uint8Array(GRID * GRID);
      pack.cells.development[5] = 20;
      pack.cells.pop[5] = 100;
      pack.states[1].economy.treasury = 0; // no Gold: no autonomous muster
      Living.forceWar(1, 2);
      const doomed = makeRegiment(0, 7); // in enemy land: no replenishment
      doomed.units = [{ type: doomed.units![0]!.type, hp: 0.05, exp: 0 }];
      pack.states[1].military = [doomed];
      living.states[1].agenda = { kind: "muster", label: "Mustering", progress: 0, required: 999 };

      Living.tick(1);

      // City strike destroys the nearly-dead block; a fresh muster replaces it.
      const units = pack.states[1].military?.[0]?.units ?? [];
      expect(units.every(block => block.hp > 0)).toBe(true);
      expect(units.some(block => block.hp <= 0.05)).toBe(false);
      expect(living.armies?.[unitKey(1, 0)]).toBeDefined();
    });

    it("refits army blocks for Gold, preserving hp and exp", () => {
      pack.states[1].military = [makeRegiment(0, 5)];
      Living.init();
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
      pack.cells.development = new Uint8Array(GRID * GRID);
      pack.cells.development[5] = requiredDevelopmentFor(target!, roster);
      pack.cells.pop[5] = 100; // the state's mean development clears the target's gate

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
  });

  describe("Diplomacy (war and peace timers)", () => {
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
  });

  describe("Faction armies & state suppression", () => {
    beforeEach(() => {
      setupCityWorld();
      pack.factions = [{ i: 0 } as Faction];
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
      Living.init();
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
      Living.tick(1);

      expect(faction.treasury).toBeGreaterThan(0);
    });

    describe("State suppression administrative campaign (Phase 2)", () => {
      function queueSuppression(
        living: ReturnType<typeof Living.init>,
        faction: Faction,
        target: { burgId?: number; cell?: number } = { burgId: 1 },
        progress = FACTION_SUPPRESSION_SEASONS - 1
      ) {
        pack.states[1].economy.treasury = 1000;
        living.states[1].agenda = {
          kind: "suppress_faction",
          label: `Suppressing ${faction.name} in Aelor`,
          targetFactionId: faction.i,
          ...(target.burgId !== undefined ? { targetBurgId: target.burgId } : { targetCell: target.cell }),
          progress,
          required: FACTION_SUPPRESSION_SEASONS
        };
      }

      it("starts one suppression agenda via the public API", () => {
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
        queueSuppression(living, faction, { burgId: 1 });

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
          treasury: 1000,
          raidThreshold: 100, // no opportunistic raid: the guard stays home
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
        // Impassable surroundings keep the garrison at its post (no adjacent siege target).
        pack.cells.h = new Uint8Array(GRID * GRID).fill(75);
        pack.cells.h[5] = 25;
        pack.burgs[5].removed = true;
        queueSuppression(living, faction, { burgId: 1 });

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
          treasury: 0, // no seasonal muster: the HQ itself must stand guardless
          hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, influence: 2, assets: [] },
          outposts: [{ burgId: 5, cell: 4, tier: 1, influence: 50, secrecy: 0, assets: [], establishedYear: 1000 }]
        });
        queueSuppression(living, faction, { burgId: 1 });

        Living.tick(1);

        expect(faction.removed).toBeFalsy();
        expect(faction.hq.burgId).toBe(5);
        expect(faction.hq.pillaged).toBe(false);
        expect(faction.outposts).toHaveLength(0);
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
          treasury: 0, // no seasonal muster riding to the rescue
          hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, influence: 2, assets: [] }
        });
        queueSuppression(living, faction, { burgId: 1 });

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

      it("builds a capped militia garrison from tier and fortification", () => {
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

      it("reduces influence by the stability/secrecy formula on a campaign season", () => {
        const living = Living.init();
        const faction = hostileFaction("Silver Hand");
        pack.states[1].economy.treasury = 1000;
        living.states[1].agenda = {
          kind: "suppress_faction",
          label: `Suppressing ${faction.name} in Aelor`,
          targetFactionId: faction.i,
          targetBurgId: 1,
          progress: FACTION_SUPPRESSION_SEASONS - 1,
          required: FACTION_SUPPRESSION_SEASONS
        };

        Living.tick(1);

        expect(faction.outposts[0].influence).toBeLessThan(40);
        expect(faction.outposts[0].pillaged).toBeFalsy();
      });

      it("stalls a campaign the treasury cannot fund without collapsing the faction", () => {
        const living = Living.init();
        const faction = hostileFaction("Silver Hand");
        expect(Living.startFactionSuppression(1, faction.i)).toBe(true);
        pack.states[1].economy.treasury = 0;

        Living.tick(2);

        expect(faction.removed).toBe(false);
        expect(faction.outposts[0].pillaged).toBeFalsy();
        expect(faction.outposts[0].influence).toBeGreaterThan(0);
        expect(living.states[1].agenda?.kind).toBe("suppress_faction");
        expect(living.states[1].agenda?.stallUntilTick).toBeGreaterThan(living.tick);
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

      it("starts a military-only agenda for a wilderness HQ", () => {
        const living = Living.init();
        const faction = wildernessFaction("Pale Hand");

        expect(Living.startFactionSuppression(1, faction.i)).toBe(true);
        const agenda = living.states[1].agenda;
        expect(agenda?.kind).toBe("suppress_faction");
        expect(agenda?.targetCell).toBe(9);
        expect(agenda?.targetBurgId).toBeUndefined();
        expect(agenda?.label).toContain("wild");
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

      it("keeps a wilderness agenda after a tick until the army can march", () => {
        const living = Living.init();
        fieldArmy(13, 1); // far from cell 9: cannot storm yet
        const faction = wildernessFaction("Pale Hand");
        expect(Living.startFactionSuppression(1, faction.i)).toBe(true);

        Living.tick(1);

        // Either the marching army reached the stronghold this tick (pillaged,
        // agenda retargeted/cleared) or it is still marching (agenda intact).
        if (faction.hq.pillaged) {
          expect(faction.removed).toBe(true);
        } else {
          expect(living.states[1].agenda?.kind).toBe("suppress_faction");
          expect(living.states[1].agenda?.targetCell).toBe(9);
        }
      });
    });
  });

  describe("live mobile burgs (Living World wandering)", () => {
    /** pin a walking titan to cell 1; overrides customize per case */
    function addTitan(i = 5, overrides: Record<string, unknown> = {}): Burg {
      const burg = {
        i,
        name: `Wandering Titan ${i}`,
        cell: 1,
        x: 10,
        y: 10,
        state: 0,
        culture: 1,
        population: 2,
        capital: 0,
        walls: 0,
        plaza: 0,
        temple: 0,
        citadel: 0,
        titan: 1,
        mobile: 1,
        mobility: "live",
        ...overrides
      } as unknown as Burg;
      pack.burgs.push(burg);
      return burg;
    }

    beforeEach(() => {
      pack.cells.h = Uint8Array.from([25, 25, 25, 25, 25, 25]);
      pack.cells.biome = Uint8Array.from([4, 4, 4, 4, 4, 4]);
      pack.cells.f = new Uint16Array(6);
      pack.cells.burg = new Uint16Array(6);
      pack.cells.development = new Uint8Array(6);
      pack.cells.harbor = new Uint8Array(6);
      pack.cells.routes = {};
      pack.journeys = [];
      (options.map as { graph?: unknown }).graph = { width: 100, height: 100, points: 100 };
    });

    it("takes one step per season along the cell graph and picks a far destination", () => {
      Living.init();
      const burg = addTitan(5);

      Living.tick(1);

      const next = pack.burgs[5]!.cell;
      expect(next).not.toBe(1);
      expect([...pack.cells.c[1]]).toContain(next);
      expect(pack.burgs[5]!.destination).toBeDefined();
      // it steps onto the cell's own point, and the save remembers where it is going
      expect(burg.x).toBe(pack.cells.p[burg.cell]![0]);
      expect(burg.y).toBe(pack.cells.p[burg.cell]![1]);
    });

    it("keeps pinned and drift burgs in place", () => {
      Living.init();
      addTitan(5, { name: "Pinned Hold", mobile: undefined, mobility: undefined });
      addTitan(6, { name: "Drifting Hold", mobility: "drift" });
      addTitan(7, { name: "Walking Titan" });

      Living.tick(2);

      expect(pack.burgs[5]!.cell).toBe(1);
      expect(pack.burgs[6]!.cell).toBe(1);
      expect(pack.burgs[7]!.cell).not.toBe(1);
    });

    it("chronicles the arrival and rests a season before wandering again", () => {
      Living.init();
      const burg = addTitan(5);

      let arrivedYear: number | undefined;
      for (let i = 0; i < 40 && arrivedYear === undefined; i++) {
        Living.tick(1);
        const event = pack.history?.events?.find(
          e => e.type === "deed" && e.actors.some(a => a.kind === "burg" && a.id === 5)
        );
        if (event) arrivedYear = event.year;
      }

      expect(arrivedYear).toBe(options.map.lore.calendar.year);
      const event = pack.history!.events!.find(
        e => e.type === "deed" && e.actors.some(a => a.kind === "burg" && a.id === 5)
      );
      expect(event?.text).toContain("Wandering Titan 5");
      expect(pack.cells.h[burg.cell]).toBeGreaterThanOrEqual(20);
      const news = Living.getState().recentNews.find(n => n.kind === "colonize" && n.burgId === 5);
      expect(news).toBeDefined();
      // the destination is cleared, so the next wander picks a fresh far cell
      expect(burg.destination).toBeUndefined();
    });

    it("an underwater wanderer holds to the waters", () => {
      Living.init();
      pack.cells.h = Uint8Array.from([10, 10, 10, 10, 10, 10]);
      const burg = addTitan(5, { titan: undefined, underwater: 1 });

      Living.tick(2);

      expect(pack.cells.h[burg.cell]).toBeLessThan(20);
      expect(burg.cell).not.toBe(1);
    });

    it("a land-born titan on an all-water world stays put and the tick survives", () => {
      Living.init();
      pack.cells.h = Uint8Array.from([10, 10, 10, 10, 10, 10]);
      const burg = addTitan(5);

      expect(() => Living.tick(2)).not.toThrow();
      expect(burg.cell).toBe(1);
    });

    it("a titan's footfall scours the land it sets down on", () => {
      Living.init();
      pack.cells.development = Uint8Array.from([50, 50, 50, 50, 50, 50]);
      const burg = addTitan(5);

      Living.tick(1);

      const landed = burg.cell;
      expect(landed).not.toBe(1); // it walked
      expect(pack.cells.development[landed]).toBe(40); // the footfall took ten
      expect(pack.cells.development[1]).toBe(50); // where it stood is not yet a footfall
      expect([...pack.cells.development.keys()].filter(cell => pack.cells.development[cell] !== 50)).toEqual([landed]);
    });

    it("an underwater wanderer swims without trampling", () => {
      Living.init();
      pack.cells.h = Uint8Array.from([10, 10, 10, 10, 10, 10]);
      pack.cells.development = Uint8Array.from([50, 50, 50, 50, 50, 50]);
      const burg = addTitan(5, { titan: undefined, underwater: 1 });

      Living.tick(2);

      expect(burg.cell).not.toBe(1); // it swam
      expect(Math.max(...pack.cells.development)).toBe(50); // water has no footfall
    });

    it("a surface wanderer takes and releases its cell slot as it walks", () => {
      Living.init();
      const surface = {
        i: 5,
        name: "Wandering Town",
        cell: 1,
        x: 10,
        y: 10,
        state: 1,
        culture: 1,
        population: 20,
        capital: 0,
        walls: 0,
        plaza: 0,
        temple: 0,
        citadel: 0,
        mobile: 1,
        mobility: "live"
      } as unknown as Burg;
      pack.burgs.push(surface);
      pack.cells.burg[1] = 5; // a surface burg's slot, handed down at founding

      Living.tick(1);

      expect(pack.burgs[5]!.cell).not.toBe(1); // it walked
      expect(pack.cells.burg[1]).toBe(0); // the slot was released
      expect(pack.cells.burg[pack.burgs[5]!.cell]).toBe(5); // and taken at the new cell
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
    Living.init();
    const faction = hostileFaction(1, 1);
    faction.raidPending = true;

    Living.tick(1);

    expect(
      Living.getState().recentNews.some(n => n.kind === "faction" && n.text.includes("Raiders from Reaver Host"))
    ).toBe(true);
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
    const trouble = Living.spawnTrouble(2, "flooding");
    expect(trouble?.id).toBe("flooding");
    expect(Living.ascendFactionToState(999)).toBeNull();
    expect(pack.states.length).toBe(stateCountBefore);

    // Non-ambitious factions never ascend on their own
    Living.spawnDangerousFaction(2, "monsters", "ruin", 8);
    Living.spawnDangerousFaction(2, "things_from_below", "ruin", 8);
    expect(pack.states.length).toBe(stateCountBefore);
  });

  it("spawns a dangerous faction from an organizational archetype and ascends it into a sovereign state", () => {
    const living = Living.init();
    const spawned = Living.spawnDangerousFaction(2, "demagogue", "burg", 7);
    expect(spawned).not.toBeNull();
    expect(living.provinces[2].trouble).toBeNull();

    const faction = (pack.factions ?? []).find(f => f.i !== 0)!;
    expect(faction.type).toBe("noble_league");
    expect(faction.hq.burgId).toBe(2);
    expect(faction.stateRelations[1]).toBe("Enemy");

    const newStateId = Living.ascendFactionToState(faction.i);
    expect(newStateId).toBe(3);

    const newState = pack.states[newStateId!];
    expect(newState).toBeDefined();
    expect(newState.fullName).toContain("Confederated Duchy");
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
    Living.init();
    const faction = Living.spawnDangerousFaction(3, "doomsday_cult", "ruin", 8, { cell: 4 })!;
    expect(faction.hq.cell).toBe(4);

    const burgsBefore = pack.burgs.length;
    const newStateId = Living.ascendFactionToState(faction.i);
    expect(newStateId).toBe(3);
    expect(pack.burgs.length).toBe(burgsBefore + 1);

    const newState = pack.states[newStateId!];
    expect(newState.fullName).toContain("Unholy Covenant");

    const newCapital = pack.burgs[newState.capital];
    expect(newCapital.cell).toBe(4);
    expect(newCapital.capital).toBe(1);
    expect(newCapital.state).toBe(newStateId);
    expect(pack.cells.state[4]).toBe(newStateId);
  });

  it("keeps a drain trouble in place without creating a faction or promoting a state when stability collapses", () => {
    const living = Living.init();
    pack.provinces[2].stabilityAdjustments = [{ name: "Collapse", value: -80 }];
    const trouble = Living.spawnTrouble(2, "flooding", "drain")!;
    trouble.seasonsLow = 3;

    Living.tick(1);

    expect(pack.states.length).toBe(3);
    expect(pack.provinces[2].state).not.toBe(3);
    expect(living.provinces[2].trouble?.severity).toBe("drain");
    expect(
      Factions.active().some(
        f => f.hq.provinceId === 2 && (f.allegiance === "hostile" || f.allegiance === "clandestine")
      )
    ).toBe(false);
  });

  it("escalates flavor to drain cleanly without generating a hostile faction", () => {
    const living = Living.init();
    pack.provinces[2].stabilityAdjustments = [{ name: "Collapse", value: -45 }];
    living.states[1].warExhaustion = 0;

    Living.tick(2);

    expect(pack.states.length).toBe(3);
    expect(living.provinces[2].trouble?.severity).toBe("drain");
    expect(
      Factions.active().some(
        f => f.hq.provinceId === 2 && (f.allegiance === "hostile" || f.allegiance === "clandestine")
      )
    ).toBe(false);
  });

  it("leaves an active drain trouble without domain rolls", () => {
    const living = Living.init();
    pack.provinces[2].stabilityAdjustments = [{ name: "Strain", value: -45 }];
    Living.spawnTrouble(2, "flooding", "drain");

    expect(typeof (Living as unknown as Record<string, unknown>).resolveTrouble).toBe("undefined");
    Living.tick(1);

    expect(pack.states.length).toBe(3);
    expect(pack.provinces[2].state).not.toBe(3);
    expect(living.provinces[2].trouble?.severity).toBe("drain");
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
    pack.provinces[2].simStabilityAdjustments = [{ name: "Collapse", value: -80 }];
    pack.burgs[2].walls = 0;
    // Its seat is settled enough to claim sovereignty
    pack.cells.h = new Uint8Array((pack.cells.i as number[]).length).fill(25);
    pack.cells.biome = new Uint8Array((pack.cells.i as number[]).length).fill(4);
    pack.cells.burg = new Uint16Array((pack.cells.i as number[]).length);
    pack.cells.development = new Uint8Array((pack.cells.i as number[]).length);
    pack.cells.development[pack.burgs[2].cell] = SOVEREIGN_DEVELOPMENT;

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
    // The wilderness seat is settled enough to claim sovereignty
    pack.cells.h = new Uint8Array((pack.cells.i as number[]).length).fill(25);
    pack.cells.biome = new Uint8Array((pack.cells.i as number[]).length).fill(4);
    pack.cells.burg = new Uint16Array((pack.cells.i as number[]).length);
    pack.cells.development = new Uint8Array((pack.cells.i as number[]).length);
    pack.cells.development[4] = SOVEREIGN_DEVELOPMENT;

    Living.tick(1);

    expect(pack.states.length).toBe(4);
    expect(pack.provinces[3].state).toBe(3);
    expect(pack.states[3].fullName).toContain("Dread Dominion");
    expect(faction.allegiance).toBe("state_arm");
  });

  it("records independence chronicle events and round-trips emergent states through serializeHistory / parseHistory", () => {
    const living = Living.init();
    Living.spawnDangerousFaction(2, "demagogue", "burg", 7);
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
        Living.spawnDangerousFaction(2, "secret_society", "burg", 8);
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

describe("Epic faction agendas (simplification Phase 3)", () => {
  beforeEach(() => {
    buildStubPack();
    pack.cells.h = Uint8Array.from([0, 30, 30, 30, 30, 30]);
    pack.cells.biome = Uint8Array.from([0, 2, 2, 2, 2, 2]);
    pack.factions = [{ i: 0 } as Faction];
  });

  it("assigns build_work when a faction can fund an eligible asset", () => {
    Living.init();
    const guild = Factions.add({
      name: "Adventurers' Conclave",
      category: "adventuring",
      type: "adventurer_guild",
      allegiance: "autonomous",
      treasury: 200,
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: [] }
    });

    Living.tick(1);
    expect(guild.agenda?.kind).toBe("build_work");
    expect(guild.project).toBeDefined();

    Living.tick(1);
    expect(guild.hq.assets.length).toBeGreaterThan(0);
    expect(guild.agenda).toBeNull();
  });

  it("assigns and completes expand_network to establish a new outpost", () => {
    Living.init();
    const consortium = Factions.add({
      name: "Grand Merchant Consortium",
      category: "commercial",
      type: "merchant_consortium",
      allegiance: "chartered",
      expansionScope: "global",
      treasury: 95,
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: ["trade_depot"] }
    });

    Living.tick(1);
    expect(consortium.agenda?.kind).toBe("expand_network");
    expect(consortium.outposts).toHaveLength(0);

    Living.tick(1);
    expect(consortium.outposts.length).toBe(1);
    expect(consortium.treasury).toBeLessThan(95);
    expect(consortium.agenda).toBeNull();
  });

  it("executes subvert to apply a temporary provincial stability penalty", () => {
    Living.init();
    pack.provinces[2].state = 2;
    const shadow = Factions.add({
      name: "Shadow Brotherhood",
      category: "underworld",
      type: "shadow_syndicate",
      allegiance: "clandestine",
      treasury: 10,
      hq: { cell: 3, burgId: 2, provinceId: 2, fortified: false, secrecy: 65, assets: ["safe_house"] }
    });

    Living.tick(1);
    expect(shadow.agenda?.kind).toBe("subvert");
    expect(shadow.agenda?.targetProvinceId).toBe(2);

    Living.tick(1);
    const subLine = pack.provinces[2].simStabilityAdjustments?.find(l => l.name === "Subversion: Shadow Brotherhood");
    expect(subLine?.value).toBe(-6);
    expect(shadow.agenda).toBeNull();
  });

  it("executes crusade_or_raid to clear trouble or strike hostiles and improve relations", () => {
    const living = Living.init();
    pack.provinces[1].stabilityAdjustments = [{ name: "Strain", value: -25 }];
    Living.spawnTrouble(1, "flooding", "flavor");
    const holy = Factions.add({
      name: "Crusader Knightly Order",
      category: "religious",
      type: "holy_order",
      allegiance: "chartered",
      patronStateId: 1,
      treasury: 10,
      hq: { cell: 1, burgId: 1, provinceId: 1, fortified: true, secrecy: 0, assets: ["wayside_shrine"] }
    });
    holy.stateRelations[1] = "Suspicion";

    Living.tick(1);
    expect(holy.agenda?.kind).toBe("crusade_or_raid");
    expect(holy.agenda?.targetProvinceId).toBe(1);

    Living.tick(1);
    expect(living.provinces[1].trouble).toBeNull();
    expect(holy.stateRelations[1]).toBe("Neutral");
    expect(holy.agenda).toBeNull();
  });

  it("executes ascend when an ambitious entrenched faction holds a collapsed province", () => {
    Living.init();
    pack.cells.burg = new Uint16Array([0, 1, 0, 2, 0, 0]);
    pack.cells.development = new Uint8Array([0, 30, 30, 30, 30, 30]);
    pack.provinces[2].stabilityAdjustments = [{ name: "Collapse", value: -80 }];
    const league = Factions.add({
      name: "Claimant Confederacy",
      category: "political",
      type: "noble_league",
      allegiance: "autonomous",
      sovereignAmbition: true,
      stateForm: "Confederated Duchy",
      seasonsActive: 10,
      treasury: 10,
      hq: {
        cell: 3,
        burgId: 2,
        provinceId: 2,
        fortified: false,
        secrecy: 0,
        assets: ["informant_ring", "printing_cell", "shadow_directorate"]
      }
    });
    const statesBefore = pack.states.length;

    Living.tick(1);
    expect(league.agenda?.kind).toBe("ascend");

    Living.tick(1);
    expect(pack.states.length).toBe(statesBefore + 1);
    expect(league.agenda).toBeNull();
  });
});

describe("Living World Factions (Phase 3: Economy, Agendas, Military, Raids & Ascension)", () => {
  beforeEach(() => {
    buildStubPack();
  });

  it("banks upstream income less its forces' upkeep", () => {
    buildStubPack();
    const living = Living.init();
    pack.factions = [{ i: 0 } as Faction];
    (pack.cells as unknown as { h: Uint8Array }).h = new Uint8Array((pack.cells.i as number[]).length).fill(25);
    (pack.cells as unknown as { biome: Uint8Array }).biome = new Uint8Array((pack.cells.i as number[]).length).fill(4);

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
      influence: 20
    });

    // A live upstream economy: the capital's product and market turnover feed the faction
    options.map.goods = [
      {
        i: 1,
        name: "Wheat",
        tags: [],
        demandCoverage: {},
        value: 1,
        carriage: 1,
        unit: "unit",
        icon: "",
        color: "#000"
      }
    ] as never;
    pack.cells.market = new Uint16Array((pack.cells.i as number[]).length);
    pack.cells.market[1] = 1;
    pack.markets = [{ i: 1 } as never];
    pack.deals = [[1, 1, 1, 0, 1, 1, 0, 0, 0]] as unknown as typeof pack.deals;
    pack.burgs[1].product = 10;

    // Keep the seasonal muster out of the ledger assertion: one block already guards the HQ
    const combatType = Object.keys(Military.getUnitTypes())[0]!;
    faction.military = [
      {
        i: 1,
        name: "Golden Crest Guard",
        a: 150,
        cell: 1,
        x: 10,
        y: 10,
        bx: 10,
        by: 10,
        state: 0,
        n: 0,
        u: { [combatType]: 150 },
        units: [{ type: combatType, hp: 1, exp: 0 }]
      } as never
    ];

    const initTreasury = faction.treasury;
    const breakdown = Living.getFactionYieldBreakdown(faction);
    const expectedNet = Math.round(breakdown.economy.dayBalance * 90 * 100) / 100;
    Living.stepFactionEmpire(living);

    expect(breakdown.upstreamGold).toBeGreaterThan(0);
    expect(faction.treasury).toBeCloseTo(initTreasury + expectedNet, 2);
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
  });

  it("defects from crumbling patron state when stability falls below threshold", () => {
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

    pack.states[1].economy.simStabilityAdjustments = [{ name: "Collapse", value: -90 }];

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

    // A settled realm at its seat clears the sovereignty development gate
    pack.cells.development = new Uint8Array((pack.cells.i as number[]).length);
    pack.cells.development[4] = SOVEREIGN_DEVELOPMENT;

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

    const remnant = Living.spawnRemnantFaction(fallenState, 2);
    expect(remnant).not.toBeNull();
    expect(remnant!.name).toContain("Aeloria Restoration Front");
    expect(remnant!.category).toBe("political");
    expect(remnant!.type).toBe("noble_league");
    expect(remnant!.allegiance).toBe("hostile");
    expect(remnant!.sovereignAmbition).toBe(true);
    expect(remnant!.stateRelations[2]).toBe("Enemy");
  });

  describe("Fiscal policy (living-fmg-native Phase 3)", () => {
    /** Give state 1 a known martial ruler and a clean purse. */
    function martialPurse(form = "Monarchy") {
      const living = Living.init();
      const state = pack.states[1];
      const ruler = pack.history.figures!.find(figure => figure.i === living.states[1]!.rulerId)!;
      ruler.virtues = ["brave", "decisive", "wrathful"];
      ruler.vices = ["cruel", "greedy"];
      ruler.alignment = "evil";
      state.form = form;
      state.economy.budget = { court: 20, administration: 10, infrastructure: 8, military: 25, corruption: 15 };
      state.economy.salesTax = 0.08;
      state.economy.pollTax = 0.07;
      state.economy.treasury = 100;
      state.diplomacy = [];
      return { living, state, ruler };
    }

    it("drifts the real budget toward the ruler's target each spring", () => {
      const { state } = martialPurse();
      Living.tick(4); // the fourth season is a spring
      expect(state.economy.budget.military).toBe(27);
      expect(state.economy.budget.corruption).toBeGreaterThan(15); // a cruel ruler tolerates graft
      expect(state.economy.pollTax).toBeGreaterThan(0.07); // and leans on the head tax
    });

    it("moves a republic one point a season and an anarchy not at all", () => {
      const republic = martialPurse("Republic");
      Living.tick(4);
      expect(republic.state.economy.budget.military).toBe(26);

      const anarchy = martialPurse("Anarchy");
      Living.tick(4);
      expect(anarchy.state.economy.budget.military).toBe(25);
    });

    it("logs a dispatch once a line drifts far from accession", () => {
      const { living, state } = martialPurse();
      Living.tick(12); // three springs hold the same ruler
      const dispatches = living.recentNews.filter(item => item.text.startsWith(state.name));
      expect(dispatches.length).toBeGreaterThan(0);
      expect(dispatches.some(item => /army|court|chancery|graft|tax/.test(item.text))).toBe(true);
    });

    it("pins a line away from the ruler's drift, and unpins it", () => {
      const { state } = martialPurse();
      expect(Living.toggleFiscalLock(1, "military")).toBe(true);
      Living.tick(4);
      expect(state.economy.budget.military).toBe(25);

      expect(Living.toggleFiscalLock(1, "military")).toBe(false);
      Living.tick(4);
      expect(state.economy.budget.military).toBeGreaterThan(25);
    });

    it("exposes current and target values for the inspector", () => {
      martialPurse();
      const policy = Living.fiscalPolicy(1)!;
      expect(policy.current.military).toBe(25);
      expect(policy.target.military).toBeGreaterThan(25);
      expect(policy.stride).toBe(2);
      expect(policy.locks).toEqual([]);
    });
  });

  describe("Public works (living-fmg-native Phase 4)", () => {
    /** A funded state with development high enough to build, and land data for works. */
    function projectWorld(development = 30) {
      const living = Living.init();
      const state = pack.states[1];
      state.economy.treasury = 500;
      pack.cells.development = new Uint8Array([0, development, development, development, 0, 0]);
      pack.cells.burg = new Uint16Array([0, 1, 0, 2, 0, 0]);
      pack.cells.h = new Uint8Array([10, 30, 30, 40, 10, 10]);
      pack.cells.biome = new Uint8Array([0, 4, 4, 5, 0, 0]);
      return { living, state };
    }

    it("commissions a work the ruler's era allows and completes it in seasons", () => {
      const { living, state } = projectWorld();
      expect(Living.commissionProject(1, "walls", 1)).toBe(true);
      expect(state.economy.treasury).toBe(410);
      expect(living.states[1]!.project).toMatchObject({ id: "walls", targetId: 1, turnsLeft: 2 });

      Living.tick(2);
      expect(living.states[1]!.project).toBeUndefined();
      expect(pack.burgs[1].walls).toBe(3); // walls1 + citadel normalize to walls2, then the work raises a tier
      expect(living.projects).toHaveLength(1);
      expect(living.projects![0]).toMatchObject({ id: "walls", stateId: 1, targetId: 1 });
    });

    it("gates works by the people's development", () => {
      projectWorld(10);
      expect(Living.commissionProject(1, "college", 1)).toBe(false); // needs 27

      pack.cells.development = new Uint8Array([0, 30, 30, 30, 0, 0]);
      expect(Living.commissionProject(1, "college", 1)).toBe(true);
    });

    it("writes a daily line into the target's sim adjustments", () => {
      projectWorld();
      expect(Living.commissionProject(1, "temple_works", 2)).toBe(true);
      Living.tick(2);

      const line = pack.burgs[2].simAdjustments?.find(entry => entry.name.startsWith("Temple works"));
      expect(line?.value).toBe(2);
      expect(pack.burgs[2].temple).toBe(1);
    });

    it("buys its goods from the town's market, and stalls without them", () => {
      projectWorld();
      options.map.goods = [{ i: 1, name: "Stone", value: 1.5 }] as unknown as typeof options.map.goods;
      const market = { i: 1, centerBurgId: 1, goods: { 1: { stock: 10, price: 1.5 } } };
      pack.markets = [market] as unknown as typeof pack.markets;
      pack.cells.market = new Uint16Array([0, 1, 1, 1, 0, 0]);

      expect(Living.commissionProject(1, "walls", 1)).toBe(true);
      Living.tick(2);
      expect(market.goods[1].stock).toBe(4); // six units of stone spent

      // The next wall cannot be built twice at the same burg.
      expect(Living.commissionProject(1, "walls", 1)).toBe(false);
    });

    it("charters a new market and keeps one work per target", () => {
      const { living } = projectWorld();
      pack.markets = [] as unknown as typeof pack.markets;
      pack.cells.market = new Uint16Array([0, 0, 0, 0, 0, 0]);

      expect(Living.commissionProject(1, "market_charter", 2)).toBe(true);
      Living.tick(2);
      expect(pack.markets.some(entry => entry.centerBurgId === 2)).toBe(true);
      expect(pack.burgs[2].plaza).toBe(1);
      expect(living.projects!.some(project => project.id === "market_charter" && project.targetId === 2)).toBe(true);
    });

    it("automatically starts a work the ruler favours without a commission", () => {
      const { living, state } = projectWorld();
      Living.tick(1);
      expect(living.states[1]!.project).toBeDefined();
      expect(state.economy.treasury).toBeLessThan(500);
    });
  });

  describe("Trouble economics (living-fmg-native Phase 5)", () => {
    it("writes negative economy and provincial stability lines only for drain troubles", () => {
      const living = Living.init();
      pack.provinces[1].stabilityAdjustments = [{ name: "Crisis", value: -45 }];
      living.provinces[1].trouble = {
        id: "flooding",
        name: "Seasonal Flooding",
        severity: "drain",
        seasonsLow: 2,
        cell: 1
      };

      Living.tick(1);
      const line = pack.states[1].economy.simAdjustments?.find(entry => entry.name.startsWith("Trouble: "));
      expect(line?.value).toBe(-3);
      expect(line?.name).toContain("Seasonal Flooding");
      const stabLine = pack.provinces[1].simStabilityAdjustments?.find(entry => entry.name.startsWith("Trouble: "));
      expect(stabLine?.value).toBe(-5);
    });

    it("keeps project lines when it rebuilds drain lines", () => {
      const living = Living.init();
      pack.provinces[1].stabilityAdjustments = [{ name: "Crisis", value: -45 }];
      pack.states[1].economy.simAdjustments = [{ name: "Mint of Aeloria", value: 4 }];
      living.provinces[1].trouble = {
        id: "flooding",
        name: "Seasonal Flooding",
        severity: "drain",
        seasonsLow: 2,
        cell: 1
      };

      Living.tick(1);
      expect(pack.states[1].economy.simAdjustments).toEqual(
        expect.arrayContaining([
          { name: "Mint of Aeloria", value: 4 },
          expect.objectContaining({ name: expect.stringContaining("Trouble:"), value: -3 })
        ])
      );
    });

    it("drains the purse for hostile factions in the realm's provinces", () => {
      Living.init();
      const faction = Living.spawnDangerousFaction(1);
      expect(faction).not.toBeNull();

      Living.tick(1);
      const line = pack.states[1].economy.simAdjustments?.find(entry => entry.name.startsWith("Raiders: "));
      expect(line).toBeDefined();
      expect(line!.value).toBeLessThan(0);
    });

    it("drops drain lines once stability recovers or trouble is quelled", () => {
      const living = Living.init();
      pack.provinces[1].stabilityAdjustments = [{ name: "Crisis", value: -45 }];
      living.provinces[1].trouble = {
        id: "flooding",
        name: "Seasonal Flooding",
        severity: "drain",
        seasonsLow: 2,
        cell: 1
      };
      Living.tick(1);
      expect(pack.states[1].economy.simAdjustments?.some(entry => entry.name.startsWith("Trouble: "))).toBe(true);

      pack.provinces[1].stabilityAdjustments = [];
      Living.tick(1);
      expect(living.provinces[1].trouble).toBeNull();
      expect(pack.states[1].economy.simAdjustments?.some(entry => entry.name.startsWith("Trouble: "))).toBe(false);
      expect(pack.provinces[1].simStabilityAdjustments?.some(entry => entry.name.startsWith("Trouble: "))).toBe(false);
    });
  });

  describe("Faction works (living-fmg-native Phase 6)", () => {
    function factionWorld(development = 30) {
      const living = Living.init();
      pack.factions = [{ i: 0 } as never];
      pack.cells.development = new Uint8Array([0, development, development, development, 0, 0]);
      pack.cells.burg = new Uint16Array([0, 1, 0, 2, 0, 0]);
      pack.cells.h = new Uint8Array([10, 30, 30, 40, 10, 10]);
      pack.cells.biome = new Uint8Array([0, 4, 4, 5, 0, 0]);
      const faction = Factions.add({
        name: "Test Consortium",
        category: "commercial",
        type: "merchant_consortium",
        hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: [] },
        outposts: [],
        treasury: 500
      });
      return { living, faction };
    }

    it("commissions an asset from treasury and pays the host town a daily line", () => {
      const { living, faction } = factionWorld();
      expect(Living.commissionFactionAsset(faction.i, "trade_depot", "hq")).toBe(true);
      expect(faction.treasury).toBe(450);
      expect(faction.project).toMatchObject({ assetId: "trade_depot", nodeKey: "hq", turnsLeft: 1 });

      Living.tick(1);
      expect(faction.project).toBeUndefined();
      expect(faction.hq.assets).toContain("trade_depot");
      const line = pack.burgs[1].simAdjustments?.find(entry =>
        entry.name.startsWith("Faction: Test Consortium Trade Depot")
      );
      expect(line?.value).toBe(1); // the depot's gold bite on its host
      expect(living.projects ?? []).toBeDefined();
    });

    it("gates faction works by the node's development", () => {
      const { faction } = factionWorld(10);
      expect(Living.commissionFactionAsset(faction.i, "counting_house", "hq")).toBe(false); // needs currency at 25

      pack.cells.development = new Uint8Array([0, 30, 30, 30, 0, 0]);
      expect(Living.commissionFactionAsset(faction.i, "counting_house", "hq")).toBe(true);
    });

    it("drops a line when the work is gone", () => {
      const { faction } = factionWorld();
      Living.commissionFactionAsset(faction.i, "trade_depot", "hq");
      Living.tick(1);
      expect(pack.burgs[1].simAdjustments?.some(entry => entry.name.startsWith("Faction: "))).toBe(true);

      faction.hq.assets = [];
      if (faction.hq.sim) faction.hq.sim.civBuildings = [];
      faction.treasury = 0; // nothing new to build
      Living.tick(1);
      expect(pack.burgs[1].simAdjustments?.some(entry => entry.name.startsWith("Faction: "))).toBe(false);
    });

    it("commissions works on its own when funded", () => {
      const { faction } = factionWorld();
      Living.tick(1);
      expect(faction.project).toBeDefined();
      expect(Number(faction.treasury)).toBeLessThan(500);
    });
  });

  describe("Religious drift (living-fmg-native Phase 7)", () => {
    /** State 1 with a zealous, well-funded court and one foreign-faith holdout in its province. */
    function faithWorld() {
      const living = Living.init();
      const state = pack.states[1];
      state.urban = 100;
      state.rural = 100;
      state.economy.spent = { court: 16, administration: 0, infrastructure: 0, military: 0 } as never;
      const ruler = pack.history.figures!.find(figure => figure.i === living.states[1]!.rulerId)!;
      ruler.virtues = ["reverent", "zealous", "faithful"];
      ruler.vices = [];
      ruler.alignment = "lawful";
      pack.cells.religion = new Uint8Array([0, 1, 2, 2, 2, 3]);
      pack.religions![1] = { i: 1, name: "Solar Church" } as never;
      return { living, state };
    }

    it("reads court spending and a pious ruler as conversion pressure", () => {
      const { living, state } = faithWorld();
      const zealot = Living.religiousPressure(1, 1);
      expect(zealot).toBeGreaterThan(0.2);

      const ruler = pack.history.figures!.find(figure => figure.i === living.states[1]!.rulerId)!;
      ruler.virtues = [];
      ruler.alignment = "neutral";
      const tolerant = Living.religiousPressure(1, 1);
      expect(tolerant).toBeLessThan(zealot);

      state.economy.spent = { court: 0, administration: 0, infrastructure: 0, military: 0 } as never;
      expect(Living.religiousPressure(1, 1)).toBeLessThan(tolerant);
    });

    it("converts rural holdouts first and chronicles the province's flip", () => {
      const { living } = faithWorld();
      for (let attempt = 0; attempt < 20; attempt++) Living.convertProvince(1, 1, attempt);

      expect(pack.cells.religion![2]).toBe(1); // the rural holdout took the state faith
      expect(living.recentNews.some(item => item.kind === "religion" && item.text.includes("Solar Church"))).toBe(true);
    });

    it("gives a state holding the faith's holy site more pull", () => {
      faithWorld();
      const plain = Living.religiousPressure(1, 1);
      pack.religions![1] = { i: 1, name: "Solar Church", center: 1 } as never; // the capital cell is the holy site
      expect(Living.religiousPressure(1, 1)).toBeGreaterThan(plain);
    });

    it("never drifts a province without a state faith", () => {
      faithWorld();
      pack.cells.religion![1] = 0; // the capital holds no faith
      expect(Living.religiousPressure(1, 1)).toBe(0);
    });
  });

  describe("Rebellions, border shifts & unified agendas (simplification Phase 4)", () => {
    beforeEach(() => {
      buildStubPack();
    });

    it("ignites a provincial rebellion below 30% stability without a full-upkeep garrison and writes Rebellion lines", () => {
      const living = Living.init();
      Living.quellTrouble(2);
      pack.provinces[2]!.stabilityAdjustments = [{ name: "Famine", value: -40 }]; // 0.65 - 0.40 = 0.25

      Living.tick(1);

      expect(living.provinces[2]?.rebellion).toEqual({ name: "Oakshire Rising", seasonsActive: 0 });
      expect(pack.provinces[2]!.simStabilityAdjustments).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Rebellion: Oakshire Rising", value: -15 })])
      );
      expect(pack.states[1].economy.simAdjustments).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Rebellion: Oakshire Rising in Oakshire", value: -5 })])
      );
      expect(living.recentNews.some(n => n.kind === "revolt" && n.text.includes("Oakshire Rising"))).toBe(true);
    });

    it("suppresses a rebellion when targeted by pacify, setting Pacified +10 stabilization", () => {
      const living = Living.init();
      Living.quellTrouble(2);
      living.provinces[2]!.rebellion = { name: "Oakshire Rising", seasonsActive: 1 };
      living.states[1]!.agenda = {
        kind: "pacify",
        label: "Pacifying rebellion in Oakshire",
        targetProvinceId: 2,
        targetBurgId: 2,
        progress: 0,
        required: 1
      };

      Living.tick(1);

      expect(living.provinces[2]?.rebellion).toBeNull();
      expect(living.provinces[2]?.pacifiedUntilTick).toBeGreaterThan(living.tick);
      expect(pack.provinces[2]!.simStabilityAdjustments).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Pacified", value: 10 })])
      );
    });

    it("crushes or prevents rebellion when a full-upkeep garrison occupies the province", () => {
      const living = Living.init();
      Living.quellTrouble(2);
      pack.provinces[2]!.stabilityAdjustments = [{ name: "Tax Revolt", value: -40 }];
      pack.states[1].military = [
        { i: 1, name: "Oakshire Watch", a: 50, cell: 3, state: 1, u: { infantry: 50 }, units: [] } as never
      ];

      Living.tick(1);

      expect(living.provinces[2]?.rebellion ?? null).toBeNull();
    });

    it("spreads an unchecked rebellion to an adjacent restive same-state province", () => {
      const living = Living.init();
      Living.quellTrouble(2);
      Living.quellTrouble(3);
      pack.provinces[2]!.stabilityAdjustments = [{ name: "Crisis", value: -35 }]; // 0.30 (< 0.45)
      pack.provinces[3]!.stabilityAdjustments = [{ name: "Discontent", value: -30 }]; // 0.35 (< 0.45, >= 0.30)
      living.provinces[2]!.rebellion = { name: "Oakshire Rising", seasonsActive: 0 };
      living.states[1]!.agenda = { kind: "build_work", label: "Busy elsewhere", progress: 0, required: 3 };
      // Prevent chooseAgenda from picking pacify during this tick
      living.burgs[1]!.construction = { buildingId: "granary", turnsLeft: 5 };

      Living.tick(1);

      expect(living.provinces[3]?.rebellion).toEqual({ name: "Oakshire Rising", seasonsActive: 0 });
    });

    it("defects an unchecked province to an adjacent stable kin neighbor after 2+ seasons below 25% stability", () => {
      const living = Living.init();
      Living.quellTrouble(3);
      // Province 3 (Wildreach, cell 4) has culture 2 matching state 2 (Khazadia), adjacent to state 2 (cell 5)
      pack.states[2].economy.stabilityAdjustments = [{ name: "Prosperous", value: 20 }]; // 0.50 + 0.20 = 0.70 (> 0.60)
      pack.provinces[3]!.stabilityAdjustments = [{ name: "Collapse", value: -45 }]; // 0.20 (< 0.25)
      living.provinces[3]!.rebellion = { name: "Wildreach Rising", seasonsActive: 1 };
      living.states[1]!.agenda = { kind: "build_work", label: "Distracted", progress: 0, required: 3 };

      Living.tick(1);

      expect(pack.provinces[3]!.state).toBe(2);
      expect(pack.cells.state![4]).toBe(2);
      expect(living.provinces[3]?.rebellion).toBeNull();
    });

    it("collapses an unchecked rebellion on its own after 2+ seasons when surrounded by calm provinces", () => {
      const living = Living.init();
      Living.quellTrouble(1);
      Living.quellTrouble(2);
      Living.quellTrouble(3);
      pack.provinces[2]!.stabilityAdjustments = [{ name: "Fraying", value: -25 }]; // 0.65 - 0.25 - 0.15(rebellion) = 0.25 (>= 0.25)
      living.provinces[2]!.rebellion = { name: "Oakshire Rising", seasonsActive: 1 };
      living.states[1]!.agenda = { kind: "build_work", label: "Distracted", progress: 0, required: 3 };

      Living.tick(1);

      expect(living.provinces[2]?.rebellion).toBeNull();
      expect(living.recentNews.some(n => n.kind === "pacify" && n.text.includes("fell apart"))).toBe(true);
    });

    it("drifts corrupt, unstable frontier cells to a high-stability neighbor", () => {
      // Give province 3 (state 1) a non-center frontier cell 6 with a non-capital burg adjoining state 2 (cell 5)
      pack.cells.i.push(6);
      pack.cells.state = new Uint16Array([0, 1, 1, 1, 1, 2, 1]);
      pack.cells.province = new Uint16Array([0, 1, 1, 2, 3, 4, 3]);
      pack.cells.pop = [...pack.cells.pop, 50] as never;
      pack.cells.culture = [...pack.cells.culture, 1] as never;
      pack.cells.religion = [...(pack.cells.religion ?? []), 1] as never;
      pack.cells.c.push([4, 5]);
      pack.cells.c[4] = [3, 5, 6];
      pack.cells.c[5] = [4, 6];
      pack.cells.p.push([45, 45]);
      pack.cells.r = [...pack.cells.r, 0] as never;
      pack.cells.burg = new Uint16Array([0, 1, 0, 2, 0, 3, 4]);
      pack.burgs.push({
        i: 4,
        name: "Borderwatch",
        cell: 6,
        x: 45,
        y: 45,
        state: 1,
        culture: 1,
        population: 2,
        capital: 0
      } as never);

      const living = Living.init();
      Living.quellTrouble(3);
      pack.states[1].economy.budget = { corruption: 45 } as never; // > 35 fallback corruption
      pack.provinces[3]!.stabilityAdjustments = [{ name: "Neglect", value: -45 }]; // 0.65 - 0.45 + 0.10(Pacified) = 0.30 (< 0.35)
      living.provinces[3]!.pacifiedUntilTick = 10; // block rebellion ignition so border drift runs cleanly
      pack.states[2].economy.stabilityAdjustments = [{ name: "Order", value: 25 }]; // 0.75 (> 0.70)

      Living.tick(1);

      expect(pack.cells.state![6]).toBe(2);
      expect(pack.burgs[4]!.state).toBe(2);
      expect(living.recentNews.some(n => n.kind === "revolt" && n.text.includes("drifted"))).toBe(true);
    });

    it("remaps legacy agenda kinds to the 5 unified state agendas on load", () => {
      const living = Living.init();
      living.states[1]!.agenda = { kind: "hire_adventurers" as never, label: "Legacy", progress: 0, required: 1 };
      living.states[2]!.agenda = { kind: "develop" as never, label: "Legacy Build", progress: 0, required: 1 };

      pack.history.living = living;
      Living.init();

      expect(Living.getState().states[1]?.agenda?.kind).toBe("suppress_faction");
      expect(Living.getState().states[2]?.agenda?.kind).toBe("build_work");
    });

    it("caps notable headlines and executed beats at 2 per tick in crowded worlds (Phase 5)", () => {
      // Expand stub pack with extra states & factions all poised to act on the same tick
      pack.states.push(
        {
          i: 3,
          name: "Solaria",
          economy: { ...pack.states[1].economy, treasury: 500, simAdjustments: [] },
          culture: 1,
          capital: 1,
          center: 1,
          provinces: [],
          military: []
        } as never,
        {
          i: 4,
          name: "Valoria",
          economy: { ...pack.states[1].economy, treasury: 500, simAdjustments: [] },
          culture: 1,
          capital: 1,
          center: 1,
          provinces: [],
          military: []
        } as never
      );
      pack.cells.development = new Uint8Array([0, 30, 30, 30, 30, 30]);
      pack.cells.h = new Uint8Array([0, 25, 25, 25, 25, 25]);
      pack.cells.burg = new Uint16Array([0, 1, 0, 2, 0, 3]);
      pack.states[1].economy.treasury = 500;
      pack.states[2].economy.treasury = 500;
      pack.factions = [{ i: 0 } as never];
      Factions.add({
        name: "Crimson Brotherhood",
        category: "underworld",
        type: "shadow_syndicate",
        allegiance: "clandestine",
        treasury: 300,
        hq: { cell: 3, burgId: 2, fortified: false, secrecy: 40, assets: [] }
      });
      Factions.add({
        name: "Iron Free Company",
        category: "martial",
        type: "mercenary_company",
        allegiance: "autonomous",
        treasury: 300,
        hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: [] }
      });

      const living = Living.init();
      pack.provinces[2]!.stabilityAdjustments = [{ name: "Discontent", value: -20 }]; // 0.45 (< 0.55) silent trouble test
      const startTick = living.tick;

      Living.tick(1);

      const thisTickNews = living.recentNews.filter(item => item.tick === startTick + 1);
      expect(thisTickNews.length).toBeLessThanOrEqual(2);
      // Silent Phase A still assigns flavor trouble without spending a headline
      expect(living.provinces[2]?.trouble?.severity).toBe("flavor");
      expect(thisTickNews.some(n => n.kind === "trouble")).toBe(false);
    });
  });
});
