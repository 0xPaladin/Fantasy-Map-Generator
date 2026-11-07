import { beforeEach, describe, expect, it } from "vitest";
import type { Faction } from "@/types/factions";
import type { LivingWorldState } from "@/types/living";
import type { State } from "@/types/subdivided-pack";
import {
  dispatchHero,
  getGuild,
  getPartyPreview,
  getPlayerFaction,
  leaseRelic,
  recallRelic,
  resolvePetition,
  setGuildHost,
  syncPlayerFaction
} from "./living-guild";

describe("living-guild", () => {
  let mockLiving: LivingWorldState;

  beforeEach(() => {
    mockLiving = {
      seed: "guild-seed",
      tick: 1,
      provinces: {},
      burgs: {},
      states: {}
    } as unknown as LivingWorldState;

    setGuildHost({
      getState: () => mockLiving,
      pushNews: () => {},
      quellTrouble: () => true,
      forceWar: () => true
    });

    globalThis.options = {
      map: { lore: { calendar: { year: 1000 } } }
    } as unknown as typeof options;

    globalThis.pack = {
      burgs: [{ i: 0 }, { i: 1, name: "Aelor", population: 10, capital: 1 }],
      states: [{ i: 0 }, { i: 1, name: "Aeloria" } as State],
      provinces: [{ i: 0 }, { i: 1, name: "Heartlands", center: 1, state: 1 }],
      markers: [],
      history: { figures: [] },
      factions: [{ i: 0 } as Faction]
    } as unknown as typeof pack;
  });

  it("lazily creates GuildState and initializes player faction", () => {
    const guild = getGuild();
    expect(guild).toBeDefined();
    expect(guild.tier).toBe(1);

    const faction = getPlayerFaction();
    expect(faction).toBeDefined();
    expect(faction.type).toBe("adventurer_guild");
  });

  it("synchronizes player faction treasury, roster, and missions", () => {
    const guild = getGuild();
    guild.gold = 350;
    guild.renown = 80;
    guild.roster = [10, 11];

    syncPlayerFaction(mockLiving);

    const faction = getPlayerFaction();
    expect(faction.treasury).toBe(350);
    expect(faction.influence).toBe(80);
    expect(faction.memberIds).toEqual([10, 11]);
  });

  it("manages relics: equip, lease, and recall", () => {
    const guild = getGuild();
    guild.relics = [
      {
        id: 1,
        name: "Blade of Dawn",
        category: "weapon",
        holder: { kind: "vault" },
        bonuses: { m: 2, w: 0, s: 0, c: 0 },
        lore: "An ancient weapon."
      }
    ];

    expect(leaseRelic(1, 1)).toBe(true);
    expect(guild.relics[0].holder.kind).toBe("state");
    expect(guild.relics[0].holder.id).toBe(1);

    expect(recallRelic(1)).toBe(true);
    expect(guild.relics[0].holder.kind).toBe("vault");
  });

  it("dispatches heroes on missions and previews parties", () => {
    const guild = getGuild();
    pack.history.figures.push({
      i: 1,
      name: "Valerius",
      culture: 1,
      roles: [{ type: "adventurer", target: { kind: "culture", id: 1 }, from: 1000 }],
      skills: { m: 4, w: 1, s: 0, c: 0 }
    });
    guild.roster = [1];
    mockLiving.provinces[1] = {
      order: 50,
      stability: 1,
      trouble: {
        id: "bandits",
        name: "Forest Bandits",
        theme: "brigands",
        level: 2,
        seasonsUnchecked: 0,
        cell: 1
      }
    } as any;

    const preview = getPartyPreview(1, 1);
    expect(preview).not.toBeNull();
    expect(preview?.party).toEqual([1]);

    const dispatched = dispatchHero(1, 1);
    expect(dispatched).toBe(true);
    expect(guild.missions.length).toBe(1);
    expect(guild.missions[0].figureId).toBe(1);
  });

  it("resolves petitions and claims popups", () => {
    const guild = getGuild();
    guild.gold = 100;
    guild.popups = [
      {
        id: 42,
        kind: "petition",
        title: "Plea for Aid",
        text: "Bandits plague the roads.",
        year: 1000,
        petition: {
          id: "trouble_plea",
          provinceId: 1,
          choices: [
            {
              id: "fund_guard",
              description: "Fund the local guards",
              effect: { goldCost: 30, renownReward: 10, resolveTrouble: true }
            }
          ]
        }
      }
    ];

    const result = resolvePetition(42, 0);
    expect(result).not.toBeNull();
    expect(guild.gold).toBe(70);
    expect(guild.renown).toBe(10);
    expect(guild.popups.some(p => p.id === 42)).toBe(false);
  });
});
