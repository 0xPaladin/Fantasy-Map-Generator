import { beforeEach, describe, expect, it } from "vitest";
import type { Burg } from "@/model/political/burgs-generator";
import { Factions } from "@/model/political/factions-generator";
import type { State } from "@/model/political/states-generator";
import type { Marker } from "@/model/story/markers-generator";
import type { PackedGraph } from "@/types/packed-graph";

describe("FactionsGenerator", () => {
  beforeEach(() => {
    // Setup minimal pack graph mock
    const burgs: Burg[] = [
      { i: 0 } as Burg,
      { i: 1, name: "Oakhaven", cell: 10, state: 1, culture: 1, population: 50, x: 100, y: 100 } as Burg,
      { i: 2, name: "Riverbend", cell: 20, state: 1, culture: 1, population: 30, x: 150, y: 120 } as Burg,
      { i: 3, name: "Ironport", cell: 30, state: 2, culture: 2, population: 45, port: 1, x: 300, y: 250 } as Burg,
      { i: 4, name: "Sunspire", cell: 40, state: 2, culture: 2, population: 20, x: 350, y: 280 } as Burg
    ];

    const states: State[] = [
      { i: 0 } as State,
      { i: 1, name: "Verdantia", capital: 1 } as State,
      { i: 2, name: "Ironmarch", capital: 3 } as State
    ];

    const markers: Marker[] = [
      { i: 0 } as Marker,
      { i: 1, type: "brigands", name: "Blackfang Hideout", cell: 15, x: 120, y: 110, icon: "⚔️" } as Marker,
      { i: 2, type: "dungeons", name: "Crypt of Shadows", cell: 25, x: 220, y: 180, icon: "☠️" } as Marker,
      { i: 3, type: "inns", name: "The Prancing Pony", cell: 12, x: 105, y: 102, icon: "🍺" } as Marker
    ];

    const cells = {
      i: Array.from({ length: 50 }, (_, i) => i),
      p: Array.from({ length: 50 }, (_, i) => [i * 10, i * 10]),
      culture: new Uint16Array(50).fill(1),
      religion: new Uint16Array(50).fill(1),
      state: new Uint16Array(50).fill(1),
      province: new Uint16Array(50).fill(1)
    };

    const religions = [
      { i: 0, name: "No religion" },
      { i: 1, name: "Order of the Sun", type: "Organized" }
    ];

    globalThis.options = {
      map: {
        seed: "factions-test-seed",
        lore: { calendar: { year: 1000 } }
      }
    } as unknown as typeof globalThis.options;

    globalThis.pack = {
      burgs,
      states,
      markers,
      cells,
      religions,
      factions: [{ i: 0 }]
    } as unknown as PackedGraph;
  });

  it("reserves index 0 and generates a non-empty list of factions", () => {
    Factions.generate();
    expect(pack.factions).toBeDefined();
    expect(pack.factions[0].i).toBe(0);
    expect(pack.factions.length).toBeGreaterThan(1);
  });

  it("is deterministic when generated with the same seed", () => {
    Factions.generate();
    const firstRun = JSON.stringify(pack.factions);

    Factions.generate();
    const secondRun = JSON.stringify(pack.factions);

    expect(firstRun).toBe(secondRun);
  });

  it("guarantees at least one adventurer guild", () => {
    Factions.generate();
    const adventurerGuilds = pack.factions.filter(f => f.type === "adventurer_guild");
    expect(adventurerGuilds.length).toBeGreaterThanOrEqual(1);
  });

  it("creates hostile lair factions from danger markers", () => {
    Factions.generate();
    const lairFactions = pack.factions.filter(f => f.hq?.markerId !== undefined);
    expect(lairFactions.length).toBe(2); // brigands & dungeons, inns is not danger

    const brigandFaction = lairFactions.find(f => f.hq.markerId === 1);
    expect(brigandFaction).toBeDefined();
    expect(brigandFaction?.allegiance).toBe("hostile");
    expect(brigandFaction?.military).toHaveLength(1);
    expect(brigandFaction?.military[0].cell).toBe(15);
  });

  it("calculates dynamic scale for generated factions", () => {
    Factions.generate();
    for (const faction of pack.factions.slice(1)) {
      expect(["burg", "province", "state", "world"]).toContain(faction.scale);
    }
  });

  it("provides helper lookup methods on Factions singleton", () => {
    Factions.generate();
    const active = Factions.active();
    expect(active.length).toBe(pack.factions.length - 1);

    const f1 = Factions.get(1);
    expect(f1).toBeDefined();
    expect(f1?.i).toBe(1);

    const commercial = Factions.byCategory("commercial");
    expect(commercial.length).toBeGreaterThan(0);

    const burg1Factions = Factions.atBurg(1);
    expect(burg1Factions.length).toBeGreaterThan(0);

    const state1Factions = Factions.byState(1);
    expect(state1Factions.length).toBeGreaterThan(0);
  });

  it("adds and removes factions with scale recalculation", () => {
    Factions.generate();
    const initialCount = Factions.active().length;

    const added = Factions.add({
      name: "The New Consortium",
      category: "commercial",
      type: "merchant_consortium",
      hq: { cell: 10, burgId: 1, fortified: false, secrecy: 0, assets: ["trade_depot", "counting_house"] },
      outposts: [
        { burgId: 2, cell: 20, tier: 1, influence: 50, secrecy: 0, assets: ["trade_depot"], establishedYear: 990 },
        { burgId: 3, cell: 30, tier: 1, influence: 50, secrecy: 0, assets: [], establishedYear: 995 }
      ],
      researchedTechs: ["pottery", "currency"]
    });

    expect(added.i).toBeGreaterThan(0);
    expect(added.scale).toBe("province");
    expect(Factions.active().length).toBe(initialCount + 1);

    // Dynamic scale recompute when outposts expand
    added.outposts.push({
      burgId: 4,
      cell: 40,
      tier: 1,
      influence: 50,
      secrecy: 0,
      assets: ["trade_depot", "counting_house"],
      establishedYear: 998
    });
    added.researchedTechs.push("sailing", "writing", "masonry");
    const updatedScale = Factions.recomputeScale(added);
    expect(updatedScale).toBe("state");

    // Removal
    const removed = Factions.remove(added.i);
    expect(removed).toBe(true);
    expect(Factions.get(added.i)).toBeUndefined();
    expect(Factions.active().length).toBe(initialCount);
  });
});
