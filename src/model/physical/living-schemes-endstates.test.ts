import { afterEach, describe, expect, it, vi } from "vitest";
import { type SchemeRuntime, tickSchemes } from "@/model/physical/living-schemes";
import type { Burg } from "@/model/political/burgs-generator";
import type { State } from "@/model/political/states-generator";
import { Characters } from "@/model/society/characters";
import type { Religion } from "@/model/society/religions-generator";
import type { Faction } from "@/types/factions";
import { emptyHistory, type HistoricalFigure, type HistoricalRole, type Realm } from "@/types/history";
import type { LivingWorldState } from "@/types/living";
import type { PackedGraph } from "@/types/packed-graph";
import type { Scheme, SchemeGoalId, SchemeStep } from "@/types/schemes";
import { createRng } from "@/utils/rng";

function state(id: number, overrides: Partial<State> = {}): State {
  return {
    i: id,
    name: `State ${id}`,
    culture: 1,
    center: 9 + id,
    capital: id,
    neighbors: [],
    removed: false,
    economy: { treasury: 1000 },
    ...overrides
  } as unknown as State;
}

function burg(id: number): Burg {
  return { i: id, cell: 9 + id, state: id, name: `Burg ${id}` } as unknown as Burg;
}

function faith(id: number, type: "Organized" | "Cult", center: number): Religion {
  return { i: id, name: `Faith ${id}`, type, center, removed: false, tags: [] } as unknown as Religion;
}

function faction(id: number): Faction {
  return {
    i: id,
    name: `Faction ${id}`,
    removed: false,
    treasury: 500,
    memberIds: [],
    outposts: [],
    stateRelations: {},
    factionRelations: {},
    hq: { cell: 10, fortified: false, secrecy: 50, assets: [] }
  } as unknown as Faction;
}

function setup(): void {
  globalThis.options = { map: { lore: { calendar: { year: 1000 } } } } as unknown as typeof globalThis.options;

  const religionCells = new Uint16Array(60);
  religionCells[10] = 1;
  religionCells[11] = 2;
  const stateCells = new Uint16Array(60);
  stateCells[10] = 1;
  stateCells[11] = 2;
  stateCells[12] = 3;
  stateCells[13] = 4;
  const points = Array.from({ length: 60 }, (_, cell) => [cell * 5, cell * 5] as [number, number]);
  const neighbors = Array.from({ length: 60 }, (_, cell) => [cell + 1, Math.max(0, cell - 1)]);

  globalThis.pack = {
    cultures: [
      { i: 0, name: "Wildlands", base: "german" },
      { i: 1, name: "Testland", base: "german" }
    ],
    states: [
      { i: 0 } as State,
      state(1, { neighbors: [2] }),
      state(2, { neighbors: [1, 3, 4] }),
      state(3, { neighbors: [2, 4] }),
      state(4, { neighbors: [2, 3] })
    ],
    burgs: [{ i: 0 } as Burg, burg(1), burg(2), burg(3), burg(4)],
    religions: [
      { i: 0, name: "None", type: "Folk", center: 0, removed: false, tags: [] } as unknown as Religion,
      faith(1, "Organized", 10),
      faith(2, "Cult", 11)
    ],
    factions: [{ i: 0 } as Faction, faction(1)],
    markers: [{ i: 0, type: "ruins", icon: "?", x: 0, y: 0, cell: 12, name: "The Seal" }],
    cells: {
      religion: religionCells,
      state: stateCells,
      p: points,
      h: new Uint16Array(60).fill(30),
      c: neighbors,
      culture: new Uint16Array(60).fill(1)
    },
    history: emptyHistory()
  } as unknown as PackedGraph;
}

function living(tick = 1): LivingWorldState {
  return { tick, season: 1, seed: "schemes-endstates", recentNews: [] } as unknown as LivingWorldState;
}

function runtime(overrides: Partial<SchemeRuntime> = {}): SchemeRuntime {
  return {
    isAtWar: () => false,
    declareWar: vi.fn(),
    killFigure: vi.fn(() => true),
    pushNews: vi.fn(),
    pushHistory: vi.fn(),
    rng: (tag, id = 0) => createRng(`end:${tag}:${id}`),
    factionDayBalance: vi.fn(() => 100),
    absorbState: vi.fn(() => true),
    usurpThrone: vi.fn(() => true),
    breachDoom: vi.fn(),
    ascendFaction: vi.fn(() => null),
    ...overrides
  };
}

function addFigure(
  role?: HistoricalRole,
  overrides: Partial<Omit<HistoricalFigure, "i" | "hero">> = {}
): HistoricalFigure {
  return Characters.add({
    name: overrides.name ?? `Figure ${Characters.nextId()}`,
    culture: 1,
    birth: 940,
    roles: role ? [role] : [],
    ...overrides
  }) as HistoricalFigure;
}

function doneStep(): SchemeStep {
  return { verb: "research_lore", targets: [{ kind: "burg", id: 1 }], status: "active", progress: 0 };
}

function makeScheme(villain: HistoricalFigure, goal: SchemeGoalId, overrides: Partial<Scheme> = {}): Scheme {
  return {
    i: 1,
    goal,
    mastermind: { kind: "state", id: 1 },
    villainFigure: villain.i,
    template: "test",
    secrecy: 40,
    steps: [doneStep()],
    status: "active",
    startedYear: 990,
    ...overrides
  };
}

function run(scheme: Scheme, rt: SchemeRuntime = runtime()): void {
  pack.history!.schemes = [scheme];
  tickSchemes(living(), rt);
}

describe("Scheme end states", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("divine ascension makes the villain the living deity of its faith", () => {
    setup();
    const villain = addFigure();
    const scheme = makeScheme(villain, "divine_ascension", { mastermind: { kind: "religion", id: 2 } });
    const rt = runtime();

    run(scheme, rt);

    const religion = pack.religions[2];
    expect(religion.deity).toBe(villain.name);
    expect(religion.type).toBe("Organized");
    expect(religion.tags).toContain("ascended");
    expect(villain.roles.some(role => role.type === "prophet" && role.target.id === 2)).toBe(true);
    expect(vi.mocked(rt.pushHistory)).toHaveBeenCalledWith(
      "schism",
      expect.any(Array),
      expect.anything(),
      expect.stringContaining("living deity")
    );
  });

  it("undying marks the villain as immortal", () => {
    setup();
    const villain = addFigure();
    const scheme = makeScheme(villain, "undying");
    const rt = runtime();

    run(scheme, rt);

    expect(villain.tags).toContain("immortal");
    expect(vi.mocked(rt.pushHistory)).toHaveBeenCalledWith(
      "deed",
      expect.any(Array),
      expect.anything(),
      expect.stringContaining("puts death aside")
    );
  });

  it("universal empire absorbs the target state and tags the empire", () => {
    setup();
    const villain = addFigure();
    const scheme = makeScheme(villain, "universal_empire", { keystone: "state:2" });
    const absorbed = vi.fn((stateId: number) => {
      pack.states[stateId].removed = true;
      return true;
    });
    const rt = runtime({ absorbState: absorbed });

    run(scheme, rt);

    expect(absorbed).toHaveBeenCalledWith(2, 1);
    expect(pack.states[1].tags).toContain("empire");
    expect(vi.mocked(rt.pushHistory)).toHaveBeenCalledWith(
      "conquest",
      expect.any(Array),
      expect.anything(),
      expect.stringContaining("single empire")
    );
  });

  it("universal empire restores a fallen realm of the same culture", () => {
    setup();
    const villain = addFigure();
    const realm = {
      i: 3,
      name: "Old Aeloria",
      remnantCulture: 1,
      successors: [],
      founded: 500,
      fallen: 800,
      cause: "collapse",
      center: 10
    } as unknown as Realm;
    pack.history!.realms = [realm];
    const scheme = makeScheme(villain, "universal_empire", { keystone: "state:2" });
    const rt = runtime({ absorbState: vi.fn(() => false) });

    run(scheme, rt);

    expect(pack.states[1].tags).toContain("restored_realm:3");
    expect(vi.mocked(rt.pushHistory)).toHaveBeenCalledWith(
      "founding",
      expect.any(Array),
      expect.anything(),
      expect.stringContaining("Old Aeloria")
    );
  });

  it("extinguish faith removes the target religion and clears its cells", () => {
    setup();
    const villain = addFigure();
    const scheme = makeScheme(villain, "extinguish_faith", { keystone: "religion:2" });
    const rt = runtime();

    run(scheme, rt);

    expect(pack.religions[2].removed).toBe(true);
    expect(pack.cells.religion[11]).toBe(0);
    expect(vi.mocked(rt.pushHistory)).toHaveBeenCalledWith(
      "schism",
      expect.any(Array),
      expect.anything(),
      expect.stringContaining("last congregation")
    );
  });

  it("usurp throne puts the villain on the target state's seat", () => {
    setup();
    const villain = addFigure();
    const scheme = makeScheme(villain, "usurp_throne", { mastermind: { kind: "faction", id: 1 }, keystone: "state:2" });
    const usurp = vi.fn(() => true);
    const rt = runtime({ usurpThrone: usurp });

    run(scheme, rt);

    expect(usurp).toHaveBeenCalledWith(2, villain.i);
  });

  it("puppeteer binds its corrupted rulers and their states", () => {
    setup();
    const villain = addFigure();
    addFigure({ type: "ruler", target: { kind: "state", id: 2 }, from: 990 }, { tags: ["scheme_puppet:1"] });
    const scheme = makeScheme(villain, "puppeteer", { mastermind: { kind: "faction", id: 1 } });
    const rt = runtime();

    run(scheme, rt);

    expect(pack.states[2].tags).toContain("puppet:1");
    expect(pack.factions[1].stateRelations[2]).toBe("Ally");
    expect(vi.mocked(rt.pushHistory)).toHaveBeenCalledWith(
      "deed",
      expect.any(Array),
      expect.anything(),
      expect.stringContaining("shadow court")
    );
  });

  it("unseal doom breaches the keystone marker once", () => {
    setup();
    const villain = addFigure();
    const scheme = makeScheme(villain, "unseal_doom", { keystone: "marker:0" });
    const breach = vi.fn();
    const rt = runtime({ breachDoom: breach });
    const world = living();

    pack.history!.schemes = [scheme];
    tickSchemes(world, rt);
    expect(breach).toHaveBeenCalledWith(12, 1);

    world.tick += 1;
    tickSchemes(world, rt);
    expect(breach).toHaveBeenCalledTimes(1);
  });
});
