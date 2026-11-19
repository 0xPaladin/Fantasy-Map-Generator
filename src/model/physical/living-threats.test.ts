import { beforeEach, describe, expect, it } from "vitest";
import type { Burg } from "@/model/political/burgs-generator";
import { Factions } from "@/model/political/factions-generator";
import type { Province } from "@/model/political/provinces-generator";
import type { State } from "@/model/political/states-generator";
import type { Marker } from "@/model/story/markers-generator";
import type { Faction } from "@/types/factions";
import type { LivingWorldState } from "@/types/living";
import {
  ascendFactionToState,
  convertThreatToRuin,
  migrateLegacyThreats,
  quellTrouble,
  setThreatHost,
  smiteFaction,
  spawnDangerousFaction,
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
      activeTroubles: {},
      recentNews: [],
      provinces: {
        1: {
          provinceId: 1,
          order: 30,
          stability: 1,
          trouble: null
        }
      },
      states: {
        1: {
          stateId: 1,
          unravel: 10,
          warExhaustion: 0,
          treasury: 100
        }
      },
      burgs: {}
    } as unknown as LivingWorldState;

    setThreatHost({
      getState: () => mockLiving,
      pushNews: () => {}
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
      states: [
        { i: 0 },
        { i: 1, name: "Aeloria", color: "#3b82f6", culture: 1, center: 1, military: [] } as unknown as State
      ],
      burgs: [{ i: 0 }, { i: 1, name: "Aelor", state: 1, cell: 1, population: 10 } as Burg],
      markers: [
        { i: 0, type: "brigands", cell: 1, name: "Bandit Hideout" },
        { i: 1, type: "ruins", cell: 2, name: "Ancient Reliquary" }
      ],
      factions: [{ i: 0 } as Faction]
    } as unknown as typeof pack;
  });

  it("synchronizes danger markers into dangerous factions", () => {
    syncDangerMarkers(mockLiving);

    const faction = Factions.active().find(f => f.hq.markerId === 0);
    expect(faction).toBeDefined();
    expect(faction?.name).toBe("Bandit Hideout");
    // Ruins markers are not danger markers, so no faction is anchored to marker 1
    expect(Factions.active().some(f => f.hq.markerId === 1)).toBe(false);
  });

  it("spawns trouble as flavor by default and quells it silently", () => {
    const trouble = spawnTrouble(1, "flooding");
    expect(trouble).not.toBeNull();
    expect(trouble?.id).toBe("flooding");
    expect(trouble?.severity).toBe("flavor");
    expect(mockLiving.provinces[1].trouble).toBe(trouble);
    expect(mockLiving.recentNews).toHaveLength(0);

    const quelled = quellTrouble(1);
    expect(quelled).toBe(true);
    expect(mockLiving.provinces[1].trouble).toBeNull();
    expect(mockLiving.recentNews).toHaveLength(0);
  });

  it("assigns a flavor trouble matched to the province when no id is given", () => {
    const trouble = spawnTrouble(1);
    expect(trouble).not.toBeNull();
    expect(trouble?.severity).toBe("flavor");
    expect(mockLiving.provinces[1].trouble).toBe(trouble);
  });

  it("spawns a dangerous faction directly with lair-template military under canonical epic type", () => {
    const faction = spawnDangerousFaction(1, "monsters", "ruin", 6);
    expect(faction).not.toBeNull();
    expect(faction?.type).toBe("dread_host");
    expect(faction?.allegiance).toBe("hostile");
    expect(faction?.threatLevel).toBe(6);
    expect(faction?.military[0]?.u).toBeDefined();
    expect(mockLiving.provinces[1].trouble).toBeNull();
  });

  it("migrates legacy organizational trouble and lairs into epic factions", () => {
    mockLiving.provinces[1].trouble = {
      id: "demagogue",
      name: "Zealous Demagogue",
      theme: "burg",
      pool: "s",
      save: "uprising",
      requiredRole: "prophet",
      level: 5,
      seasonsUnchecked: 2,
      cell: 1
    } as never;
    (mockLiving.provinces[1] as unknown as { lair?: unknown }).lair = {
      id: "bandit_camp",
      name: "Bandit Camp",
      theme: "burg",
      level: 4,
      cell: 1,
      seasonsActive: 5
    };

    migrateLegacyThreats(mockLiving);

    expect(mockLiving.provinces[1].trouble).toBeNull();
    expect((mockLiving.provinces[1] as unknown as { lair?: unknown }).lair).toBeUndefined();
    const types = (pack.factions ?? []).filter(f => f.i !== 0).map(f => f.type);
    expect(types).toContain("noble_league");
    expect(types).toContain("dread_host");
  });

  it("spawns and smites dangerous factions", () => {
    const faction = spawnDangerousFaction(1, "bandit_camp", "burg", 2);
    expect(faction).not.toBeNull();
    expect(faction?.type).toBe("dread_host");

    expect(smiteFaction(1)).toBe(true);
    expect(Factions.active().some(f => f.i === faction!.i)).toBe(false);
  });

  it("turns a cleared threat into a looted ruin with cleared metadata", () => {
    options.map.seed = "threats-seed";
    const marker = pack.markers[0] as Marker;

    convertThreatToRuin(marker, "Aeloria");

    expect(marker.type).toBe("ruins");
    expect(marker.name).toBe("Ruins of Bandit Hideout");
    expect(marker.generated).toEqual({
      kind: "ruin",
      version: 1,
      seed: "threats-seed",
      meta: {
        originalName: "Bandit Hideout",
        tier: "outpost",
        cause: "abandonment",
        looted: true,
        clearedFrom: "brigands",
        clearedBy: "Aeloria"
      }
    });
  });

  it("gives a cleared dungeon a village tier and no clearedBy when unknown", () => {
    options.map.seed = "threats-seed";
    const marker = { i: 2, type: "dungeons", cell: 1, name: "Old Crypt" } as Marker;

    convertThreatToRuin(marker);

    expect(marker.generated?.meta).toMatchObject({
      originalName: "Old Crypt",
      tier: "village",
      clearedFrom: "dungeons",
      looted: true
    });
    expect(marker.generated?.meta?.clearedBy).toBeUndefined();
  });

  it("ascends an ambitious faction into a sovereign state", () => {
    const faction = Factions.add({
      name: "Free Brotherhood",
      category: "martial",
      type: "rebel_front",
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
