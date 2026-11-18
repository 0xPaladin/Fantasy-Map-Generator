// Regenerating one element on real generated maps
import { sum } from "d3";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Accounts } from "@/model/economy/accounts";
import { Goods } from "@/model/economy/goods-generator";
import { Routes } from "@/model/economy/routes-generator";
import { Pack } from "@/model/graph/pack-generator";
import { Rivers } from "@/model/physical/river-generator";
import { Burgs, isSurfaceBurg } from "@/model/political/burgs-generator";
import { Military } from "@/model/political/military-generator";
import { States } from "@/model/political/states-generator";
import { Zones } from "@/model/political/zones-generator";
import { Cultures } from "@/model/society/cultures-generator";
import { generateMap, living } from "./real-map.testing";

const FIRST_GOOD = 1;
beforeAll(() => vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }));

const stateMultipliers = () => Goods.get(FIRST_GOOD)!.multipliers?.state;

describe("Regenerate Burgs", () => {
  it("gives every province holding a burg a capital inside it", async () => {
    await generateMap({ seed: "regen-burgs" });
    Burgs.regenerate();
    for (const province of living(pack.provinces)) {
      const holdsBurg = living(pack.burgs).some(burg => pack.cells.province[burg.cell] === province.i);
      if (!holdsBurg) continue;
      const capital = pack.burgs[province.burg];
      expect(pack.cells.province[capital.cell]).toBe(province.i);
      expect(province.center).toBe(capital.cell);
    }
  });

  it("keeps a locked burg its province's seat under its new id", async () => {
    await generateMap({ seed: "regen-locked-seat" });
    const province = living(pack.provinces).find(({ burg }) => burg && !pack.burgs[burg].capital)!;
    const seat = pack.burgs[province.burg];
    seat.lock = true;
    Burgs.regenerate();
    expect(pack.burgs[province.burg]).toBe(seat);
  });

  it("leaves markets naming only burgs that still exist", async () => {
    await generateMap({ seed: "regen-market-centers" });
    const center = pack.burgs[pack.markets[0].centerBurgId];
    center.lock = true;
    Burgs.regenerate();
    expect(pack.burgs[pack.markets[0].centerBurgId]).toBe(center);
    for (const { centerBurgId } of pack.markets.slice(1)) expect(centerBurgId).toBe(0);
  });
});

describe("Burgs on the map", () => {
  it("never loses a locked burg's cell to a new one", async () => {
    await generateMap({ seed: "regen-locked-cells" });
    // realm burgs never own a cells.burg slot by design; only surface burgs do
    const locked = living(pack.burgs).filter((b, index) => index % 2 === 0 && isSurfaceBurg(b));
    for (const burg of locked) burg.lock = true;
    Burgs.regenerate();
    for (const burg of locked) expect(pack.cells.burg[burg.cell]).toBe(burg.i);
  });

  it("takes a road when moved off the network", async () => {
    await generateMap({ seed: "move-off-road" });
    const provinceCapitals = new Set(living(pack.provinces).map(province => province.burg));
    const burg = living(pack.burgs).find(
      b => !b.capital && !provinceCapitals.has(b.i!) && !pack.markets.some(market => market.centerBurgId === b.i)
    )!;
    const free = Array.from(pack.cells.i).find(
      cell =>
        pack.cells.h[cell] >= 20 &&
        !pack.cells.burg[cell] &&
        !Routes.isConnected(cell) &&
        pack.cells.state[cell] === burg.state
    )!;
    Burgs.move(burg.i!, ...pack.cells.p[free]);
    expect(Routes.isConnected(burg.cell)).toBe(true);
  });

  it("gives a province another seat when a state is founded on its own", async () => {
    await generateMap({ seed: "found-on-seat" });
    const province = living(pack.provinces).find(
      p =>
        p.burg &&
        !pack.burgs[p.burg].capital &&
        living(pack.burgs).filter(b => pack.cells.province[b.cell] === p.i).length > 1
    )!;
    const seat = pack.burgs[province.burg];
    States.add(...pack.cells.p[seat.cell]);
    expect(province.burg).not.toBe(seat.i);
    expect(pack.burgs[province.burg].state).toBe(province.state);
    expect(pack.cells.province[province.center]).toBe(province.i);
  });
});

describe("the economy's summaries", () => {
  it("follow an edit of a burg's people and of a province's cells", async () => {
    await generateMap({ seed: "summaries-follow" });
    const province = living(pack.provinces).find(p => p.burg)!;
    const was = Accounts.ofProvince(province.i)!.people;
    const burg = pack.burgs[province.burg];
    const { scale, urbanization } = options.map.units.population;
    Burgs.setPopulation(burg.i!, burg.population! * scale * urbanization.rate * 5);
    expect(Accounts.ofProvince(province.i)!.people).toBeGreaterThan(was);
  });
});

describe("regiment troops", () => {
  it("are people, shown rounded up to whole troops", async () => {
    await generateMap({ seed: "army-troops" });
    // the fork stores headcounts, not population points: the rate does not rescale them (§1.3 of the plan)
    options.map.units.population.scale = 10;
    expect(Military.getTroops(0)).toBe(0);
    expect(Military.getTroops(0.001)).toBe(1);
    expect(Military.getTroops(0.25)).toBe(1);
    options.map.units.population.scale = 1000;
    expect(Military.getTroops(0.007)).toBe(1);
    expect(Military.getTroops(250)).toBe(250);
  });

  it("keep their headcount through edits and a rate change, and their sum through a split", async () => {
    await generateMap({ seed: "army-edits" });
    const state = living(pack.states).find(s => s.military?.some(r => r.a > 0.1))!;
    const regiment = state.military!.find(r => r.a > 0.1)!;
    const [unit] = Object.keys(regiment.u);
    Military.setUnits(state.i, regiment.i, { ...regiment.u, [unit]: 25 });
    expect(regiment.u[unit]).toBe(25);

    const before = { ...regiment.u };
    options.map.units.population.scale *= 100;
    Pack.markChanged();
    expect(regiment.u).toEqual(before); // headcounts are people: a rate change rewrites none

    const total = regiment.a;
    const added = Military.split(state.i, regiment.i);
    const half = state.military!.find(r => r.i === added)!;
    expect(regiment.a + half.a).toBeCloseTo(total);
  });
});

describe("army figures", () => {
  it("keep their headcounts when the population rate changes", async () => {
    await generateMap({ seed: "army-scale" });
    const troops = () => living(pack.states).map(s => (s.military ?? []).map(r => r.a));
    const before = troops();
    options.map.units.population.scale *= 100;
    Pack.markChanged();
    expect(troops()).toEqual(before);
  });
});

describe("Military regeneration", () => {
  const unitTroops = (
    regiment: {
      u: Record<string, number>;
      unitOrigins?: Record<string, string>;
      composition?: Record<string, Record<string, number>>;
    },
    unit: string
  ) => {
    if (regiment.composition)
      return Object.values(regiment.composition[unit] ?? {}).reduce((total, troops) => total + troops, 0);
    return Object.entries(regiment.u).reduce(
      (total, [key, troops]) => total + ((regiment.unitOrigins?.[key] ?? key) === unit ? troops : 0),
      0
    );
  };
  const hasUnit = (
    regiment: {
      u: Record<string, number>;
      unitOrigins?: Record<string, string>;
      composition?: Record<string, Record<string, number>>;
    },
    unit: string
  ) =>
    regiment.composition
      ? Boolean(regiment.composition[unit])
      : Object.entries(regiment.u).some(([key]) => (regiment.unitOrigins?.[key] ?? key) === unit);
  const troopsOf = (unit: string) =>
    living(pack.states).map(s => (s.military ?? []).reduce((total, r) => total + unitTroops(r, unit), 0));

  it("of one state keeps the others' regiments and the alert set", async () => {
    await generateMap({ seed: "military-state" });
    const [state, ...others] = living(pack.states).filter(s => s.military?.length);
    const kept = others.map(s => s.military);
    Military.setAlert(state.i, 4);
    const before = state.military;
    Military.regenerate([state.i]);
    expect(state.alert).toBe(4);
    expect(state.military).not.toBe(before);
    expect(others.map(s => s.military)).toEqual(kept);
    for (const [index, other] of others.entries()) expect(other.military).toBe(kept[index]);
  });

  it("is not called for by a unit's name, icon, crew or power, and follows a rename", async () => {
    await generateMap({ seed: "military-roster" });
    const roster = options.map.military.units;
    const renamed = roster.find(unit => unit.type === "melee")!;
    const infantry = troopsOf(renamed.name);
    const names = living(pack.states).map(s => (s.military ?? []).map(r => r.name));
    const edited = roster.map(unit =>
      unit === renamed ? { ...unit, name: "guards", icon: "glyph-58", crew: 2, power: 3 } : unit
    );
    const stale = Military.setRoster(
      edited,
      roster.map(unit => unit.name)
    );
    expect(stale).toEqual([]);
    expect(troopsOf("guards")).toEqual(infantry);
    expect(troopsOf(renamed.name).every(total => !total)).toBe(true);
    expect(living(pack.states).map(s => (s.military ?? []).map(r => r.name))).toEqual(names);
    const led = living(pack.states)
      .flatMap(s => s.military ?? [])
      .filter(r => Military.getEmblem(r) === "glyph-58");
    expect(led.length).toBeGreaterThan(0);
    expect(led.every(r => r.icon === "glyph-58")).toBe(true);
    Military.setRoster(
      roster,
      edited.map(unit => unit.name)
    ); // the roster outlives the map
  });

  it("raising every unit anew keeps the state's troops and most regiments", async () => {
    await generateMap({ seed: "military-update" });
    const regiments = () => living(pack.states).flatMap(s => s.military ?? []);
    const describe = () => regiments().map(r => [r.state, r.i, r.name, r.x, r.y, r.n]);
    const before = describe();
    const totals = living(pack.states).map(s => sum(s.military ?? [], r => r.a));
    Military.raiseUnits(options.map.military.units.map(unit => unit.name));
    const after = describe();
    const retained = before.filter(regiment =>
      after.some(candidate => JSON.stringify(candidate) === JSON.stringify(regiment))
    );
    expect(retained.length).toBeGreaterThanOrEqual(before.length - 3); // a few tiny province regiments may fold
    expect(after.length - before.length).toBeLessThan(3); // a far island with no regiment forms its own
    for (const [index, state] of living(pack.states).entries())
      expect(sum(state.military ?? [], r => r.a)).toBeCloseTo(totals[index], 2);
  });

  it("drops a removed unit's troops, and raises a changed unit alone", async () => {
    await generateMap({ seed: "military-units" });
    const roster = options.map.military.units;
    const regiments = () => living(pack.states).flatMap(s => s.military ?? []);
    const changed = roster.find(unit => unit.type === "melee")!;
    const removed = roster.find(unit => unit.type === "ranged")!;
    const mounted = roster.find(unit => unit.type === "mounted");
    const archers = troopsOf(removed.name);
    const cavalry = regiments().map(r => [r.state, r.i, r.name, r.x, r.y, mounted ? unitTroops(r, mounted.name) : 0]);

    const edited = roster
      .filter(unit => unit !== removed)
      .map(unit => (unit === changed ? { ...unit, rural: unit.rural * 2, urban: unit.urban * 2 } : unit));
    const stale = Military.setRoster(
      edited,
      edited.map(unit => unit.name)
    );
    expect(stale).toEqual([changed.name]);
    expect(archers.some(Boolean)).toBe(true);
    expect(regiments().some(r => hasUnit(r, removed.name))).toBe(false);
    expect(regiments().every(r => r.a > 0)).toBe(true);

    const infantry = troopsOf(changed.name);
    const kept = regiments();
    Military.raiseUnits(stale);
    const raised = [troopsOf(changed.name), troopsOf("levies")];
    // more conscripts than before; goods scarcity moves the surplus to levies
    expect(sum(raised[0]) + sum(raised[1])).toBeGreaterThan(sum(infantry) * 1.2);
    expect(sum(raised[0])).toBeGreaterThan(0);
    expect(kept.filter(regiment => regiments().includes(regiment)).length).toBeGreaterThanOrEqual(kept.length - 3);
    const after = new Map(regiments().map(r => [`${r.state}-${r.i}`, r]));
    for (const [state, i, name, x, y, troops] of cavalry) {
      const regiment = after.get(`${state}-${i}`);
      if (!regiment) continue; // it was archers alone
      expect([regiment.name, regiment.x, regiment.y, mounted ? unitTroops(regiment, mounted.name) : 0]).toEqual([
        name,
        x,
        y,
        troops
      ]);
    }
    options.map.military.units = roster;
  });
});

describe("Regenerate Rivers", () => {
  it("leaves no port on water that is gone", async () => {
    await generateMap({ seed: "regen-rivers" });
    Rivers.regenerate();
    Burgs.syncPorts();
    for (const burg of living(pack.burgs)) if (burg.port) expect(Burgs.getPortWater(burg.cell)).toBe(burg.port);
  });
});

describe("entity multipliers", () => {
  it("follow a locked state through its new id, and go with dropped states", async () => {
    await generateMap({ seed: "regen-state-multipliers" });
    const [kept, dropped] = living(pack.states).slice(-2);
    kept.lock = true;
    Goods.get(FIRST_GOOD)!.multipliers = { state: { [kept.i]: 0, [dropped.i]: 3 } };
    States.regenerate();
    expect(kept.i).toBe(1);
    expect(stateMultipliers()).toEqual({ 1: 0 });
  });

  it("follow a locked culture through its new id", async () => {
    await generateMap({ seed: "regen-culture-multipliers" });
    const kept = living(pack.cultures).at(-1)!;
    kept.lock = true;
    Goods.get(FIRST_GOOD)!.multipliers = { culture: { [kept.i]: 0, 999: 3 } };
    Cultures.regenerate();
    expect(Goods.get(FIRST_GOOD)!.multipliers!.culture).toEqual({ [kept.i]: 0 });
    expect(pack.cultures[kept.i]).toBe(kept);
  });

  it("go when zones are generated again", async () => {
    await generateMap({ seed: "regen-zone-multipliers" });
    Goods.get(FIRST_GOOD)!.multipliers = { zone: { 1: 0 } };
    Zones.regenerate();
    expect(Goods.get(FIRST_GOOD)!.multipliers!.zone).toBeUndefined();
  });
});

describe("generated zones", () => {
  it("hold each cell once", async () => {
    await generateMap({ seed: "zones-unique" });
    for (const zone of pack.zones) expect(new Set(zone.cells).size).toBe(zone.cells.length);
  });
});
