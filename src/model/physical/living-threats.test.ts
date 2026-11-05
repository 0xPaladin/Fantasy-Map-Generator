import { beforeEach, describe, expect, it } from "vitest";
import { Factions } from "@/model/political/factions-generator";
import type { Faction } from "@/types/factions";
import type { LivingWorldState } from "@/types/living";
import type { Burg, Province, State } from "@/types/subdivided-pack";
import {
  ascendFactionToState,
  clearLair,
  promoteTroubleToState,
  quellTrouble,
  setThreatHost,
  spawnLair,
  spawnRemnantFaction,
  spawnTrouble,
  syncDangerMarkers
} from "./living-threats";

describe("living-threats", () => {
  let mockLiving: LivingWorldState;

  beforeEach(() => {
    mockLiving = {
      seed: "threats-seed",
      tick: 1,
      season: 0,
      activeLairs: {},
      activeTroubles: {},
      provinces: {
        1: {
          provinceId: 1,
          order: 30,
          stability: 1,
          trouble: null,
          lair: null
        }
      },
      states: {
        1: {
          stateId: 1,
          unravel: 10,
          warExhaustion: 0,
          treasury: 100,
          capacity: {
            m: { gen: 30, load: 15 },
            w: { gen: 30, load: 15 },
            c: { gen: 30, load: 15 },
            s: { gen: 30, load: 15 }
          }
        }
      },
      burgs: {}
    } as unknown as LivingWorldState;

    setThreatHost({
      getState: () => mockLiving,
      pushNews: () => {},
      recomputeStateCapacity: () => ({
        m: { gen: 30, load: 15 },
        w: { gen: 30, load: 15 },
        c: { gen: 30, load: 15 },
        s: { gen: 30, load: 15 }
      })
    });

    globalThis.options = {
      map: { lore: { calendar: { year: 1000 } } }
    } as unknown as typeof options;

    globalThis.pack = {
      cells: {
        i: [0, 1, 2],
        p: [
          [0, 0],
          [10, 10],
          [20, 20]
        ],
        state: new Uint16Array([0, 1, 1]),
        province: new Uint16Array([0, 1, 1]),
        culture: new Uint16Array([0, 1, 1])
      },
      provinces: [{ i: 0 }, { i: 1, name: "Heartlands", state: 1, center: 1 } as Province],
      cultures: [{ i: 0 }, { i: 1, name: "Aeloran", base: 0 }],
      states: [{ i: 0 }, { i: 1, name: "Aeloria", color: "#3b82f6", culture: 1, center: 1, military: [] } as State],
      burgs: [{ i: 0 }, { i: 1, name: "Aelor", state: 1, cell: 1, population: 10 } as Burg],
      markers: [
        { i: 0, type: "brigands", cell: 1, name: "Bandit Hideout" },
        { i: 1, type: "ruins", cell: 2, name: "Ancient Reliquary" }
      ],
      factions: [{ i: 0 } as Faction]
    } as unknown as typeof pack;
  });

  it("synchronizes danger markers into activeLairs", () => {
    syncDangerMarkers(mockLiving);
    expect(mockLiving.activeLairs?.["lair:0"]).toBeDefined();
    expect(mockLiving.activeLairs?.["lair:0"].name).toBe("Bandit Hideout");
    expect(mockLiving.activeLairs?.["lair:1"]).toBeUndefined();
  });

  it("spawns and quells troubles", () => {
    const trouble = spawnTrouble(1, "secret_society", "burg", 3);
    expect(trouble).not.toBeNull();
    expect(trouble?.id).toBe("secret_society");
    expect(mockLiving.provinces[1].trouble).toBe(trouble);

    const quelled = quellTrouble(1);
    expect(quelled).toBe(true);
    expect(mockLiving.provinces[1].trouble).toBeNull();
  });

  it("spawns and clears lairs", () => {
    const lair = spawnLair(1, "bandit_camp", 2, 1);
    expect(lair).not.toBeNull();
    expect(lair?.id).toBe("bandit_camp");
    expect(mockLiving.provinces[1].lair).toBe(lair);

    clearLair(lair!, "Aelorian Guard");
    expect(mockLiving.provinces[1].lair).toBeNull();
  });

  it("promotes trouble to sovereign state", () => {
    spawnTrouble(1, "secret_society", "burg", 7);
    const stateId = promoteTroubleToState(1, 1);
    expect(stateId).not.toBeNull();
    expect(stateId).toBeGreaterThan(1);
    expect(pack.states[stateId!]).toBeDefined();
    expect(mockLiving.provinces[1].trouble).toBeNull();
  });

  it("ascends an ambitious faction into a sovereign state", () => {
    const faction = Factions.add({
      name: "Free Brotherhood",
      category: "martial",
      type: "rebel_front",
      scale: "province",
      allegiance: "hostile",
      sovereignAmbition: true,
      color: "#ef4444",
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: [] }
    });

    const stateId = ascendFactionToState(faction.i, 1);
    expect(stateId).not.toBeNull();
    expect(pack.states[stateId!].name).toBe("Free Brotherhood");
    expect(faction.allegiance).toBe("state_arm");
    expect(faction.patronStateId).toBe(stateId!);
  });

  it("spawns remnant rebel front upon state collapse", () => {
    const fallenState = pack.states[1];
    const remnant = spawnRemnantFaction(fallenState, 2);
    expect(remnant).not.toBeNull();
    expect(remnant?.name).toBe("Aeloria Restoration Front");
    expect(remnant?.allegiance).toBe("hostile");
    expect(remnant?.stateRelations[2]).toBe("Enemy");
  });
});
