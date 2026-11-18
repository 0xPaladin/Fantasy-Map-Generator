import { afterEach, describe, expect, it, vi } from "vitest";
import { type SchemeRuntime, tickSchemes } from "@/model/physical/living-schemes";
import type { Burg } from "@/model/political/burgs-generator";
import type { State } from "@/model/political/states-generator";
import { Characters } from "@/model/society/characters";
import type { Religion } from "@/model/society/religions-generator";
import type { Faction } from "@/types/factions";
import { emptyHistory, type HistoricalFigure, type HistoricalRole } from "@/types/history";
import type { LivingWorldState } from "@/types/living";
import type { PackedGraph } from "@/types/packed-graph";
import type { Scheme, SchemeStep, SchemeVerb } from "@/types/schemes";
import { createRng } from "@/utils/rng";

function state(id: number, treasury = 1000, overrides: Partial<State> = {}): State {
  return {
    i: id,
    name: `State ${id}`,
    culture: 1,
    center: 9 + id,
    capital: id,
    neighbors: [],
    removed: false,
    economy: { treasury },
    ...overrides
  } as unknown as State;
}

function burg(id: number): Burg {
  return { i: id, cell: 9 + id, state: id, name: `Burg ${id}` } as unknown as Burg;
}

function faith(id: number, type: "Organized" | "Cult" | "Heresy", center: number): Religion {
  return { i: id, name: `Faith ${id}`, type, center, removed: false } as unknown as Religion;
}

function faction(id: number): Faction {
  return {
    i: id,
    name: `Faction ${id}`,
    removed: false,
    treasury: 500,
    memberIds: [],
    outposts: [],
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

  globalThis.pack = {
    cultures: [
      { i: 0, name: "Wildlands", base: "german" },
      { i: 1, name: "Testland", base: "german" }
    ],
    states: [
      { i: 0 } as State,
      state(1, 1000, { neighbors: [2] }),
      state(2, 1000, { neighbors: [1, 3, 4] }),
      state(3, 1000, { neighbors: [2, 4] }),
      state(4, 1000, { neighbors: [2, 3] })
    ],
    burgs: [{ i: 0 } as Burg, burg(1), burg(2), burg(3), burg(4)],
    religions: [
      { i: 0, name: "None", type: "Folk", center: 0, removed: false } as unknown as Religion,
      faith(1, "Organized", 10),
      faith(2, "Cult", 11)
    ],
    factions: [{ i: 0 } as Faction, faction(1)],
    cells: { religion: religionCells, state: stateCells },
    history: emptyHistory()
  } as unknown as PackedGraph;
}

function living(tick = 1): LivingWorldState {
  return { tick, season: 1, seed: "schemes-runtime", recentNews: [] } as unknown as LivingWorldState;
}

function runtime(overrides: Partial<SchemeRuntime> = {}): SchemeRuntime {
  const wars = new Set<string>();
  const key = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  return {
    isAtWar: (a, b) => wars.has(key(a, b)),
    declareWar: (a, b) => wars.add(key(a, b)),
    killFigure: vi.fn(id => {
      const figure = Characters.get(id);
      if (!figure) return false;
      figure.death = 1000;
      return true;
    }),
    pushNews: vi.fn(),
    pushHistory: vi.fn(),
    rng: (tag, id = 0) => createRng(`test:${tag}:${id}`),
    factionDayBalance: vi.fn(() => 100),
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

function makeStep(verb: SchemeVerb, overrides: Partial<SchemeStep> = {}): SchemeStep {
  return { verb, targets: [], status: "pending", ...overrides };
}

function makeScheme(villain: HistoricalFigure, steps: SchemeStep[], overrides: Partial<Scheme> = {}): Scheme {
  return {
    i: 1,
    goal: "usurp_throne",
    mastermind: { kind: "state", id: 1 },
    villainFigure: villain.i,
    template: "test",
    secrecy: 60,
    steps,
    status: "active",
    startedYear: 990,
    ...overrides
  };
}

describe("Scheme runtime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completes a step the world already answers", () => {
    setup();
    const victim = addFigure();
    victim.death = 999;
    const villain = addFigure();
    const first = makeStep("assassinate", { targets: [{ kind: "figure", id: victim.i }], status: "active" });
    const second = makeStep("research_lore", { targets: [{ kind: "burg", id: 1 }] });
    const scheme = makeScheme(villain, [first, second]);
    pack.history!.schemes = [scheme];

    tickSchemes(living(), runtime());

    expect(first.status).toBe("done");
    expect(second.status).toBe("active");
    expect(scheme.status).toBe("active");
  });

  it("finishes the scheme when the last step resolves", () => {
    setup();
    const victim = addFigure();
    victim.death = 999;
    const villain = addFigure();
    const only = makeStep("assassinate", { targets: [{ kind: "figure", id: victim.i }], status: "active" });
    const scheme = makeScheme(villain, [only]);
    pack.history!.schemes = [scheme];
    const rt = runtime();

    tickSchemes(living(), rt);

    expect(scheme.status).toBe("complete");
    expect(vi.mocked(rt.pushHistory)).toHaveBeenCalledWith(
      "deed",
      expect.any(Array),
      expect.anything(),
      expect.stringContaining("completes")
    );
  });

  it("charges a push as a one-season daily expense line and stalls when the day balance cannot pay", () => {
    setup();
    const villain = addFigure();
    const step = makeStep("research_lore", {
      targets: [{ kind: "burg", id: 1 }],
      status: "active",
      duration: 2
    });
    const scheme = makeScheme(villain, [step]);
    pack.history!.schemes = [scheme];

    const stateOne = pack.states[1];
    const line = () => (stateOne.economy.simAdjustments ?? []).find(entry => entry.name.startsWith("Scheme 1:"));
    stateOne.economy.treasury = 0;
    const rt = runtime();
    const world = living(1);

    tickSchemes(world, rt);
    expect(step.progress).toBe(2);
    expect(step.status).toBe("active");
    expect(line()).toBeUndefined();

    stateOne.economy.treasury = 100;
    world.tick = 2;
    tickSchemes(world, rt);
    expect(step.progress).toBe(1);
    expect(line()).toBeDefined();
    expect(line()!.value).toBeLessThan(0);
    expect(step.attempts).toBe(1);
    expect(world.economyDirty).toBe(true);

    world.tick = 3;
    tickSchemes(world, rt);
    expect(step.status).toBe("done");
    expect(scheme.status).toBe("complete");
    expect(step.attempts).toBe(2);
    expect(line()).toBeDefined();

    world.tick = 4;
    tickSchemes(world, rt);
    expect(line()).toBeUndefined();
  });

  it("charges faction pushes through its daily expense line, not a stockpile", () => {
    setup();
    const villain = addFigure();
    const step = makeStep("research_lore", {
      targets: [{ kind: "burg", id: 1 }],
      status: "active",
      duration: 2
    });
    const scheme = makeScheme(villain, [step], { mastermind: { kind: "faction", id: 1 } });
    pack.history!.schemes = [scheme];
    const host = pack.factions.find(candidate => candidate.i === 1)!;
    host.simAdjustments = [];
    let balance = 10;
    const rt = runtime({ factionDayBalance: () => balance });
    const world = living(1);
    const line = () => (host.simAdjustments ?? []).find(entry => entry.name.startsWith("Scheme 1:"));

    tickSchemes(world, rt);
    expect(step.progress).toBe(1);
    expect(step.attempts).toBe(1);
    expect(line()).toBeDefined();
    expect(line()!.value).toBeLessThan(0);
    expect(host.treasury).toBe(500); // the ledger line is the charge

    balance = 0;
    world.tick = 2;
    tickSchemes(world, rt);
    expect(step.progress).toBe(1);
    expect(line()).toBeUndefined(); // last season's line cleared and the push stalled
  });

  it("pushes an assassination until the victim dies", () => {
    setup();
    const victim = addFigure();
    const villain = addFigure();
    const step = makeStep("assassinate", { targets: [{ kind: "figure", id: victim.i }], status: "active" });
    const scheme = makeScheme(villain, [step]);
    pack.history!.schemes = [scheme];
    const rt = runtime();
    const world = living();

    for (let season = 0; season < 50 && step.status === "active"; season++) {
      world.tick += 1;
      tickSchemes(world, rt);
    }

    expect(victim.death).toBeDefined();
    expect(step.status).toBe("done");
    expect(vi.mocked(rt.killFigure)).toHaveBeenCalled();
  });

  it("retargets a war step when a victim state is gone", () => {
    setup();
    pack.states[2].removed = true;
    const villain = addFigure();
    const step = makeStep("engineer_war", {
      targets: [
        { kind: "state", id: 2 },
        { kind: "state", id: 3 }
      ],
      status: "active"
    });
    const scheme = makeScheme(villain, [step]);
    pack.history!.schemes = [scheme];
    pack.states[1].economy.treasury = 0;

    tickSchemes(living(), runtime());

    expect(step.targets).toHaveLength(2);
    expect(step.targets.some(target => target.id === 2)).toBe(false);
    expect(
      step.targets.every(target => target.kind === "state" && pack.states[target.id] && !pack.states[target.id].removed)
    ).toBe(true);
  });

  it("exposes the design once secrecy runs out", () => {
    setup();
    const villain = addFigure();
    const step = makeStep("research_lore", {
      targets: [{ kind: "burg", id: 1 }],
      status: "active",
      duration: 4
    });
    const scheme = makeScheme(villain, [step], { secrecy: 1 });
    pack.history!.schemes = [scheme];
    const rt = runtime();
    const world = living();

    tickSchemes(world, rt);
    expect(scheme.exposed).toBe(true);
    expect(vi.mocked(rt.pushNews)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ text: expect.stringContaining("exposed") })
    );

    world.tick += 1;
    tickSchemes(world, rt);
    const exposedCalls = vi
      .mocked(rt.pushNews)
      .mock.calls.filter(([, item]) => String((item as { text: string }).text).includes("exposed")).length;
    expect(exposedCalls).toBe(1);
  });

  it("hands the design to a lieutenant", () => {
    setup();
    const deadVillain = addFigure();
    deadVillain.death = 999;
    const heir = addFigure({ type: "agent", target: { kind: "state", id: 1 }, from: 990 });
    const step = makeStep("research_lore", {
      targets: [{ kind: "burg", id: 1 }],
      status: "active",
      duration: 4,
      progress: 4
    });
    const scheme = makeScheme(deadVillain, [step]);
    pack.history!.schemes = [scheme];

    tickSchemes(living(), runtime());
    expect(scheme.villainFigure).toBe(heir.i);
    expect(scheme.status).toBe("active");
    expect(step.progress).toBe(2); // 4 scaled to 3, then one season of work
  });

  it("collapses when the mastermind dies with no heir", () => {
    setup();
    const deadVillain = addFigure();
    deadVillain.death = 999;
    addFigure();
    const step = makeStep("research_lore", { targets: [{ kind: "burg", id: 1 }], status: "active" });
    const scheme = makeScheme(deadVillain, [step]);
    pack.history!.schemes = [scheme];

    tickSchemes(living(), runtime());
    expect(scheme.status).toBe("collapsed");
  });

  it("stalls covert work inside an enemy's borders", () => {
    setup();
    const victim = addFigure();
    const villain = addFigure();
    const step = makeStep("assassinate", {
      targets: [{ kind: "figure", id: victim.i }],
      status: "active",
      cell: 11
    });
    const scheme = makeScheme(villain, [step]);
    pack.history!.schemes = [scheme];

    const war = runtime({
      isAtWar: (a, b) => (a === 1 && b === 2) || (a === 2 && b === 1)
    });
    const world = living();
    for (let season = 0; season < 30; season++) {
      world.tick += 1;
      tickSchemes(world, war);
    }
    expect(victim.death).toBeUndefined();
    expect(step.status).toBe("active");

    const peace = runtime();
    for (let season = 0; season < 50 && step.status === "active"; season++) {
      world.tick += 1;
      tickSchemes(world, peace);
    }
    expect(victim.death).toBeDefined();
    expect(step.status).toBe("done");
  });

  it("pushes two states into war", () => {
    setup();
    const villain = addFigure();
    const step = makeStep("engineer_war", {
      targets: [
        { kind: "state", id: 2 },
        { kind: "state", id: 3 }
      ],
      status: "active"
    });
    const scheme = makeScheme(villain, [step]);
    pack.history!.schemes = [scheme];
    const rt = runtime();
    const world = living();

    for (let season = 0; season < 20 && step.status === "active"; season++) {
      world.tick += 1;
      tickSchemes(world, rt);
    }

    expect(rt.isAtWar(2, 3)).toBe(true);
    expect(step.status).toBe("done");
  });
});
