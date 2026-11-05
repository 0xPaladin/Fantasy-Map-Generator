import { beforeEach, describe, expect, it } from "vitest";
import { HERO_STARTING_PACKAGES } from "@/data/character-actions";
import { Characters } from "@/model/society/characters";
import type { Faction } from "@/types/factions";
import { emptyHistory, type HistoricalRole } from "@/types/history";
import type { PackedGraph } from "@/types/packed-graph";

function faction(id: number, overrides: Partial<Faction> = {}): Faction {
  return {
    i: id,
    name: `Faction ${id}`,
    removed: false,
    memberIds: [],
    candidateIds: [],
    ...overrides
  } as unknown as Faction;
}

function role(overrides: Partial<HistoricalRole> = {}): HistoricalRole {
  return {
    type: "ruler",
    target: { kind: "state", id: 1 },
    from: 900,
    ...overrides
  };
}

describe("Characters", () => {
  beforeEach(() => {
    globalThis.options = {
      map: { lore: { calendar: { year: 1000 } } }
    } as unknown as typeof globalThis.options;
    globalThis.pack = {
      cultures: [
        { i: 0, base: "german", name: "Wildlands" },
        { i: 1, base: "german", name: "Testland" }
      ],
      factions: [],
      history: emptyHistory()
    } as unknown as PackedGraph;
  });

  it("creates, reads, updates, and never reuses ids", () => {
    const first = Characters.add({ name: "Aster", culture: 1, birth: 900 });
    const second = Characters.add({ name: "Bram", culture: 1, birth: 910 });

    expect([first.i, second.i]).toEqual([0, 1]);
    expect(Characters.all()).toHaveLength(2);
    expect(Characters.get(1)?.name).toBe("Bram");

    expect(Characters.update(0, { name: "Aster the Bold" })?.name).toBe("Aster the Bold");
    expect(Characters.get(0)?.name).toBe("Aster the Bold");

    expect(Characters.remove(1)).toBe(true);
    const third = Characters.add({ name: "Corin", culture: 1, birth: 990 });
    expect(third.i).toBe(2);
    expect(Characters.all().map(character => character.i)).toEqual([0, 1, 2]);
  });

  it("generates a name from the culture when none is given", () => {
    const character = Characters.add({ culture: 1, birth: 950 });
    expect(character.name.length).toBeGreaterThan(0);
    expect(character.name).not.toBe("ERROR");
  });

  it("rejects an unknown culture", () => {
    expect(() => Characters.add({ culture: 99 })).toThrow("Unknown culture 99");
  });

  it("soft deletes, closes open roles, and clears faction membership", () => {
    const character = Characters.add({
      name: "Dara",
      culture: 1,
      birth: 900,
      role: role()
    });
    const guild = faction(1, { memberIds: [character.i], candidateIds: [character.i] });
    pack.factions = [guild];

    expect(Characters.remove(character.i)).toBe(true);
    expect(Characters.get(character.i)?.removed).toBe(true);
    expect(Characters.get(character.i)?.roles[0].to).toBe(1000);
    expect(guild.memberIds).toEqual([]);
    expect(guild.candidateIds).toEqual([]);

    expect(Characters.restore(character.i)).toBe(true);
    expect(Characters.get(character.i)?.removed).toBe(false);
    expect(guild.memberIds).toEqual([]);
  });

  it("promotes a background character while keeping identity and traits", () => {
    const character = Characters.add({
      name: "Elian",
      culture: 1,
      birth: 880,
      manual: true,
      alignment: "lawful",
      virtues: ["just"],
      vices: ["proud"],
      role: role()
    });

    const hero = Characters.promoteToHero(character.i, "priest");
    expect(hero?.name).toBe("Elian");
    expect(hero?.culture).toBe(1);
    expect(hero?.birth).toBe(880);
    expect(hero?.manual).toBe(true);
    expect(hero?.alignment).toBe("lawful");
    expect(hero?.virtues).toEqual(["just"]);
    expect(hero?.vices).toEqual(["proud"]);
    expect(hero?.roles).toEqual(character.roles);
    expect(hero?.hero?.archetype).toBe("priest");
    expect(hero?.hero?.attributes).toEqual(HERO_STARTING_PACKAGES.priest.attributes);
    expect(hero?.hero?.actions).toEqual(HERO_STARTING_PACKAGES.priest.actions);
    expect(hero?.hero?.abilities).toEqual([HERO_STARTING_PACKAGES.priest.ability]);

    const again = Characters.promoteToHero(character.i, "warden");
    expect(again?.hero?.archetype).toBe("priest");
  });

  it("hides removed and dead characters from active()", () => {
    const living = Characters.add({ name: "Faye", culture: 1, birth: 900 });
    const dead = Characters.add({ name: "Gorm", culture: 1, birth: 850 });
    const gone = Characters.add({ name: "Hale", culture: 1, birth: 890 });

    Characters.update(dead.i, { death: 1000 });
    Characters.remove(gone.i);

    expect(Characters.active().map(character => character.i)).toEqual([living.i]);
    expect(Characters.all()).toHaveLength(3);
  });

  it("derives status from death, captivity, roles, and membership", () => {
    const retired = Characters.add({ name: "Iris", culture: 1, birth: 900 });
    const active = Characters.add({ name: "Jory", culture: 1, birth: 900, role: role() });
    const member = Characters.add({ name: "Kest", culture: 1, birth: 900 });
    const dead = Characters.add({ name: "Lorn", culture: 1, birth: 900, role: role() });
    const captive = Characters.add({ name: "Mira", culture: 1, birth: 900, role: role() });

    pack.factions = [faction(1, { memberIds: [member.i] })];
    Characters.update(dead.i, { death: 1000 });
    Characters.update(captive.i, { captor: 2 });

    expect(Characters.status(retired)).toBe("retired");
    expect(Characters.status(active)).toBe("active");
    expect(Characters.status(member)).toBe("active");
    expect(Characters.status(Characters.get(dead.i)!)).toBe("dead");
    expect(Characters.status(Characters.get(captive.i)!)).toBe("captive");
  });

  it("moves characters between candidates and members without duplicates", () => {
    const character = Characters.add({ name: "Nell", culture: 1, birth: 900 });
    const guild = faction(1, { candidateIds: [character.i] });
    pack.factions = [guild];

    expect(Characters.isCandidate(character.i, 1)).toBe(true);
    expect(Characters.factionsOf(character.i)).toEqual([guild]);

    expect(Characters.joinFaction(character.i, 1)).toBe(true);
    expect(Characters.joinFaction(character.i, 1)).toBe(true);
    expect(guild.memberIds).toEqual([character.i]);
    expect(guild.candidateIds).toEqual([]);

    expect(Characters.leaveFaction(character.i, 1)).toBe(true);
    expect(Characters.leaveFaction(character.i, 1)).toBe(false);
    expect(guild.memberIds).toEqual([]);
    expect(guild.candidateIds).toEqual([character.i]);
  });

  it("treats a missing faction registry as empty", () => {
    pack.factions = undefined as unknown as Faction[];
    const character = Characters.add({ name: "Orin", culture: 1, birth: 900 });

    expect(Characters.factionsOf(character.i)).toEqual([]);
    expect(Characters.joinFaction(character.i, 1)).toBe(false);
    expect(Characters.leaveFaction(character.i, 1)).toBe(false);
  });
});
