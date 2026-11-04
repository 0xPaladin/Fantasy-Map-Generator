import { describe, expect, it } from "vitest";
import { MEN_PER_BLOCK, type ResolvedRoster, type UnitType } from "@/conquest/engine/common/content";
import type { ArmyBlock } from "@/conquest/engine/common/types";
import { type BattleModifiers, computeBattleSetup } from "@/conquest/engine/game/battle";
import { resolveConfig } from "@/conquest/engine/game/config";
import {
  armyHp,
  armyLead,
  armyMen,
  armySlots,
  armySpeed,
  armyStrength,
  BATTLE_STRENGTH,
  blockPower,
  chooseOrder,
  fromBattleUnits,
  fromBattleUnitsMen,
  matchRosterUnitByCategory,
  migrateArmyBlocks,
  nextRosterUnitInCategory,
  normalizeArmy,
  pickRosterUnit,
  requiredTechFor,
  toBattleTypes,
  toBattleUnits,
  toBattleUnitsMen
} from "./living-armies";

const unit = (over: Partial<UnitType>): UnitType => ({
  id: "spear",
  name: "Spearmen",
  category: "melee",
  quantity: 100,
  men: 100,
  blocks: 100 / MEN_PER_BLOCK,
  attack: 5,
  defense: 5,
  charge: 1,
  missile: 0,
  cost: 25,
  upkeep: 0.1,
  ...over
});

const roster: ResolvedRoster = {
  id: "testBase",
  units: {
    levy: unit({ id: "levy", name: "Levy", quantity: 100, men: 100, upkeep: 0.05 }),
    sword: unit({ id: "sword", name: "Swordsmen", upkeep: 0.12 }),
    archer: unit({ id: "archer", name: "Archers", category: "ranged", quantity: 80, men: 80, upkeep: 0.2 }),
    knight: unit({ id: "knight", name: "Knights", category: "cavalry", quantity: 40, men: 40, upkeep: 0.3 }),
    slann: unit({ id: "slann", name: "Slann", category: "spellcaster", quantity: 1, men: 1, upkeep: 0.22 })
  },
  recruitable: ["levy", "sword", "archer", "knight", "slann"],
  garrison: { melee: "sword", ranged: "archer" },
  regimentMap: { infantry: "levy", archers: "archer", cavalry: "knight", artillery: "sword" },
  caps: {}
};

const block = (over: Partial<ArmyBlock>): ArmyBlock => ({ type: "levy", hp: 1, exp: 0, ...over });
const regimentOf = (units: ArmyBlock[]) => ({ units, u: {}, a: 0, n: 0 }) as never as Parameters<typeof armySlots>[0];

describe("hp ↔ count bridge", () => {
  it("round-trips a fractional hp exactly", () => {
    const battle = toBattleUnits([block({ hp: 0.37 })]);
    expect(battle[0]).toEqual({ type: "levy", count: 370, exp: 0 });
    expect(fromBattleUnits(battle)).toEqual([{ type: "levy", hp: 0.37, exp: 0 }]);
  });

  it("maps a full block to BATTLE_STRENGTH and survives the return trip", () => {
    const battle = toBattleUnits([block({ hp: 1 })]);
    expect(battle[0]!.count).toBe(BATTLE_STRENGTH);
    expect(fromBattleUnits(battle)[0]!.hp).toBe(1);
  });

  it("gives a nearly-wiped block one point of strength, not zero", () => {
    const battle = toBattleUnits([block({ hp: 0.001 })]);
    expect(battle[0]!.count).toBe(1);
  });

  it("drops wiped blocks on the way back", () => {
    expect(fromBattleUnits([{ type: "levy", count: 0, exp: 0 }])).toEqual([]);
  });

  it("rewrites men on a copied type table and leaves the source untouched", () => {
    const types = { levy: unit({}) };
    const battle = toBattleTypes(types);
    expect(battle.levy!.men).toBe(BATTLE_STRENGTH);
    expect(types.levy.men).toBe(100);
    // fill = count / men === hp
    const u = toBattleUnits([block({ hp: 0.42 })])[0]!;
    expect(u.count / battle.levy!.men).toBeCloseTo(0.42, 10);
  });

  it("mixed bridge uses real quantity and round-trips against counted units", () => {
    const types = { levy: unit({ quantity: 150, men: 150 }) };
    const battle = toBattleUnitsMen([block({ hp: 0.5 })], types);
    expect(battle[0]).toEqual({ type: "levy", count: 75, exp: 0 });
    expect(fromBattleUnitsMen(battle, types)).toEqual([{ type: "levy", hp: 0.5, exp: 0 }]);
    // A garrison unit at its full 150 men is fill 1 against the same table.
    expect(150 / types.levy.men).toBe(1);
  });

  it("mixed bridge clamps a survivor to one block and prunes the dead", () => {
    const types = { levy: unit({ quantity: 150, men: 150 }) };
    expect(fromBattleUnitsMen([{ type: "levy", count: 400, exp: 0 }], types)[0]!.hp).toBe(1);
    expect(fromBattleUnitsMen([{ type: "levy", count: 0, exp: 0 }], types)).toEqual([]);
  });
});

describe("block helpers", () => {
  it("computes slots, mean hp, strength and the men mirror", () => {
    const reg = regimentOf([block({ type: "sword", hp: 1 }), block({ type: "levy", hp: 0.5 })]);
    expect(armySlots(reg)).toBe(2);
    expect(armyHp(reg)).toBeCloseTo(0.75, 10);
    expect(armyStrength(reg)).toBeCloseTo(1.5, 10);
    // sword quantity 100, levy quantity 100 → 100 + 50
    expect(armyMen(reg, roster.units)).toBe(150);
  });

  it("falls back to 100 men for types missing from the table", () => {
    const reg = regimentOf([block({ type: "ghost", hp: 1 })]);
    expect(armyMen(reg)).toBe(100);
  });

  it("reports an empty army only when every block is dead", () => {
    expect(armyHp(regimentOf([]))).toBe(0);
    expect(armyHp(regimentOf([block({ hp: 0 })]))).toBe(0);
    expect(armyHp(regimentOf([block({ hp: 0.2 })]))).toBeCloseTo(0.2, 10);
  });
});

describe("army speed, lead block and migration", () => {
  it("uses the slowest block: cavalry 4, infantry 2", () => {
    expect(armySpeed(regimentOf([block({ type: "knight" })]), roster.units)).toBe(4);
    expect(armySpeed(regimentOf([block({ type: "knight" }), block({ type: "sword" })]), roster.units)).toBe(2);
    expect(armySpeed(regimentOf([]), roster.units)).toBe(2);
    // A dead slow block no longer holds the army back.
    expect(armySpeed(regimentOf([block({ type: "knight" }), block({ type: "sword", hp: 0 })]), roster.units)).toBe(4);
  });

  it("picks the strongest block as the interim duel leader", () => {
    const reg = regimentOf([block({ type: "sword", hp: 0.4 }), block({ type: "levy", hp: 0.9 })]);
    expect(armyLead(reg)?.type).toBe("levy");
    expect(armyLead(regimentOf([]))).toBeUndefined();
  });

  it("scales block power by hp and experience", () => {
    const full = blockPower(block({ type: "sword", hp: 1, exp: 0 }), roster.units);
    const half = blockPower(block({ type: "sword", hp: 0.5, exp: 0 }), roster.units);
    const veteran = blockPower(block({ type: "sword", hp: 1, exp: 5 }), roster.units);
    expect(half).toBeCloseTo(full / 2, 10);
    expect(veteran).toBeGreaterThan(full);
    expect(blockPower(block({ type: "ghost" }), roster.units)).toBe(0);
  });

  it("converts legacy count blocks to hp and drops the fleet marker", () => {
    const reg = {
      units: [
        { type: "sword", count: 75, exp: 2 },
        { type: "levy", hp: 0.4, exp: 0 },
        { type: "fleet", hp: 1, exp: 0 }
      ]
    } as never as Parameters<typeof armySlots>[0];
    migrateArmyBlocks(reg, roster.units);
    expect(reg.units).toEqual([
      { type: "sword", count: 75, exp: 2, hp: 0.75 },
      { type: "levy", hp: 0.4, exp: 0 }
    ]);
  });
});

describe("normalizeArmy", () => {
  it("clamps hp, prunes dead blocks and drops unknown types", () => {
    const reg = regimentOf([
      block({ type: "sword", hp: 1.5 }),
      block({ hp: 0 }),
      block({ type: "ghost", hp: 0.5 }),
      block({ hp: 0.3 })
    ]);
    normalizeArmy(reg, 20, roster.units);
    expect(reg.units).toEqual([
      { type: "sword", hp: 1, exp: 0 },
      { type: "levy", hp: 0.3, exp: 0 }
    ]);
  });

  it("enforces the slot cap and sorts by hp then type", () => {
    const reg = regimentOf(
      Array.from({ length: 25 }, (_, i) => block({ type: i % 2 ? "sword" : "levy", hp: 1 - i * 0.01 }))
    );
    normalizeArmy(reg, 20, roster.units);
    expect(reg.units).toHaveLength(20);
    for (let i = 1; i < reg.units!.length; i++) {
      const prev = reg.units![i - 1]!;
      const cur = reg.units![i]!;
      expect(prev.hp).toBeGreaterThanOrEqual(cur.hp);
    }
  });

  it("keeps the fleet marker", () => {
    const reg = regimentOf([block({ type: "fleet", hp: 1 })]);
    normalizeArmy(reg, 20);
    expect(reg.units).toHaveLength(1);
  });
});

describe("tech gating", () => {
  it("returns the authored gate when present", () => {
    const r: ResolvedRoster = {
      ...roster,
      units: { ...roster.units, sword: unit({ id: "sword", requiredTech: "iron_working" }) }
    };
    expect(requiredTechFor(r.units.sword!, r)).toBe("iron_working");
  });

  it("derives the gate from upkeep rank inside the category", () => {
    // melee ladder: ["", "", "bronze_working", ...] — levy rank 0 (free), sword rank 1 (free)
    expect(requiredTechFor(roster.units.levy!, roster)).toBe("");
    expect(requiredTechFor(roster.units.sword!, roster)).toBe("");
    // spellcaster ladder: ["", "writing", ...] — slann is rank 0 → free
    expect(requiredTechFor(roster.units.slann!, roster)).toBe("");
    const r: ResolvedRoster = {
      ...roster,
      units: {
        ...roster.units,
        acolyte: unit({ id: "acolyte", category: "spellcaster", upkeep: 0.3 }),
        slann: unit({ id: "slann", category: "spellcaster", quantity: 1, men: 1, upkeep: 0.22 })
      },
      recruitable: [...roster.recruitable, "acolyte"]
    };
    expect(requiredTechFor(r.units.acolyte!, r)).toBe("writing");
  });

  it("gates pickRosterUnit and hands back the next ladder step", () => {
    expect(pickRosterUnit(roster, "melee", [])?.id).toBe("levy");
    expect(pickRosterUnit(roster, "cavalry", [])?.id).toBe("knight");
    expect(pickRosterUnit(roster, "ranged", ["machinery"])?.id).toBe("archer");
    expect(nextRosterUnitInCategory(roster, "levy")?.id).toBe("sword");
    expect(nextRosterUnitInCategory(roster, "slann")).toBeUndefined();
  });

  it("maps retired Civ combat classes onto roster units", () => {
    const withArtillery: ResolvedRoster = {
      ...roster,
      units: { ...roster.units, cannon: unit({ id: "cannon", name: "Cannon", category: "artillery", upkeep: 0.3 }) },
      recruitable: [...roster.recruitable, "cannon"]
    };
    expect(matchRosterUnitByCategory(withArtillery, "melee")?.id).toBe("levy");
    expect(matchRosterUnitByCategory(withArtillery, "mounted")?.id).toBe("knight");
    expect(matchRosterUnitByCategory(withArtillery, "siege")?.id).toBe("cannon");
    expect(matchRosterUnitByCategory(withArtillery, "civilian")?.id).toBe("levy");
    expect(matchRosterUnitByCategory(roster, "siege")).toBeUndefined(); // no artillery in roster
  });
});

describe("chooseOrder", () => {
  const types = toBattleTypes(roster.units);

  it("braces when encamped or fortified and skirmishes from ambush", () => {
    expect(chooseOrder([block({})], types, "encamp")).toBe("brace");
    expect(chooseOrder([block({})], types, "fortify")).toBe("brace");
    expect(chooseOrder([block({})], types, "ambush")).toBe("skirmish");
  });

  it("charges with a cavalry majority and presses with melee", () => {
    const cavalry = Array.from({ length: 3 }, () => block({ type: "knight" }));
    expect(chooseOrder(cavalry, types, "march")).toBe("charge");
    expect(chooseOrder([block({ type: "sword" })], types, "march")).toBe("press");
  });

  it("skirmishes when missile power dominates and balances otherwise", () => {
    const archers = Array.from({ length: 3 }, () => block({ type: "archer" }));
    expect(chooseOrder(archers, types, "march")).toBe("skirmish");
    expect(chooseOrder([block({ type: "levy" }), block({ type: "archer" })], types, "raid")).toBe("balanced");
  });
});

describe("computeBattleSetup terrain", () => {
  const config = resolveConfig({});
  const types = toBattleTypes(roster.units);
  const base: BattleModifiers = {
    walls: 0,
    defenderEncamped: false,
    defenderAmbushed: false,
    attackerCrossedRiver: false,
    labels: []
  };
  const units = toBattleUnits([block({})]);

  it("folds terrainDefenseBonus into the defender multiplier", () => {
    const plain = computeBattleSetup(config, base, units, units, types);
    const hilly = computeBattleSetup(config, { ...base, defenderTerrain: true }, units, units, types);
    expect(plain.defenderMult).toBe(1);
    expect(hilly.defenderMult).toBeCloseTo(1 + config.battle.terrainDefenseBonus, 10);
    expect(hilly.labels).toContain("defender terrain");
  });

  it("does not claim open field when the defender holds terrain", () => {
    const hilly = computeBattleSetup(config, { ...base, defenderTerrain: true }, units, units, types);
    expect(hilly.labels).not.toContain("open field");
  });
});
