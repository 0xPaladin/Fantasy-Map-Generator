import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Alignment } from "@/data/culture-traits";
import { Characters } from "@/model/society/characters";
import { Schemes } from "@/model/story/schemes-generator";
import type { HistoricalRole } from "@/types/history";
import { emptyHistory } from "@/types/history";
import type { PackedGraph } from "@/types/packed-graph";

let random: () => number = () => 0.5;

function seedRandom(seed = 7): void {
  let value = seed >>> 0;
  random = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

interface SeedOptions {
  states?: number[];
  rulers?: Array<{ stateId: number; culture?: number; alignment?: Alignment; virtues?: string[]; vices?: string[] }>;
  religions?: Array<{
    id: number;
    type: "Cult" | "Heresy" | "Organized";
    deity?: string;
    culture?: number;
    center?: number;
  }>;
  factions?: Array<{
    id: number;
    type: string;
    culture?: number;
    wilderness?: boolean;
    leaderId?: number;
    patronStateId?: number;
    expansionism?: number;
    sovereignAmbition?: boolean;
  }>;
  burgs?: Array<{ id: number; cell: number; state: number; temple?: number }>;
  markers?: Array<{ id: number; type: string; cell: number }>;
  figures?: Array<{ name: string; culture: number; role: HistoricalRole }>;
}

/** A minimal map with the pools the election reads: states, religions, factions, burgs and markers. */
function seed(options: SeedOptions = {}): void {
  const states = options.states ?? [1];
  const burgs = options.burgs ?? states.map((id, index) => ({ id, cell: 10 + index, state: id, temple: undefined }));
  const maxCell =
    Math.max(
      20,
      ...burgs.map(burg => burg.cell),
      ...(options.religions ?? []).map(religion => religion.center ?? 0),
      ...(options.markers ?? []).map(marker => marker.cell)
    ) + 1;
  const cellBurg = new Uint16Array(maxCell);
  for (const burg of burgs) cellBurg[burg.cell] = burg.id;

  globalThis.options = {
    map: { seed: "schemes-test", lore: { calendar: { year: 1000 } } },
    generation: { cultures: { traits: false } }
  } as unknown as typeof globalThis.options;

  globalThis.pack = {
    cultures: Array.from({ length: 7 }, (_, id) => ({
      i: id,
      name: id === 0 ? "Wildlands" : `Culture ${id}`,
      base: "german"
    })),
    states: [
      { i: 0, name: "Neutral", removed: false },
      ...states.map(id => ({
        i: id,
        name: `State ${id}`,
        expansionism: 1,
        capital: burgs.find(burg => burg.state === id)?.id ?? 1,
        center: burgs.find(burg => burg.state === id)?.cell ?? 10,
        culture: id,
        neighbors: states.filter(other => other !== id),
        removed: false
      }))
    ],
    burgs: [
      { i: 0, name: "None" },
      ...burgs.map(burg => ({
        i: burg.id,
        cell: burg.cell,
        state: burg.state,
        culture: burg.state,
        name: `Burg ${burg.id}`,
        temple: burg.temple,
        x: 0,
        y: 0
      }))
    ],
    religions: [
      { i: 0, name: "None", type: "Folk", removed: false },
      ...(options.religions ?? []).map(religion => ({
        i: religion.id,
        name: `Faith ${religion.id}`,
        type: religion.type,
        deity: religion.deity ?? null,
        culture: religion.culture ?? religion.id,
        center: religion.center ?? 10,
        rural: 80,
        urban: 20,
        expansionism: 1,
        form: "Monotheism",
        expansion: "state",
        color: "#999999",
        removed: false
      }))
    ],
    factions: (options.factions ?? []).map(faction => ({
      i: faction.id,
      name: `Faction ${faction.id}`,
      type: faction.type,
      category: "underworld",
      culture: faction.culture ?? 1,
      alignment: "neutral",
      expansionism: faction.expansionism ?? 1,
      sovereignAmbition: faction.sovereignAmbition ?? false,
      leaderId: faction.leaderId,
      memberIds: [],
      treasury: 0,
      influence: 50,
      hq: {
        cell: burgs.find(burg => burg.state === 1)?.cell ?? 10,
        burgId: faction.wilderness ? undefined : burgs[0]?.id,
        fortified: false,
        secrecy: 50,
        assets: []
      },
      outposts: [],
      agenda: null,
      seasonsActive: 0,
      patronStateId: faction.patronStateId,
      allegiance: faction.wilderness ? "hostile" : "chartered",
      factionRelations: {},
      stateRelations: {},
      removed: false
    })),
    markers: (options.markers ?? []).map(marker => ({
      i: marker.id,
      type: marker.type,
      icon: "?",
      x: 0,
      y: 0,
      cell: marker.cell,
      name: `Marker ${marker.id}`
    })),
    cells: { burg: cellBurg },
    history: emptyHistory()
  } as unknown as PackedGraph;

  for (const ruler of options.rulers ?? []) {
    Characters.add({
      name: `Ruler ${ruler.stateId}`,
      culture: ruler.culture ?? 1,
      birth: 940,
      alignment: ruler.alignment,
      virtues: ruler.virtues,
      vices: ruler.vices,
      roles: [{ type: "ruler", target: { kind: "state", id: ruler.stateId }, from: 990 }]
    });
  }
  for (const figure of options.figures ?? []) {
    Characters.add({ name: figure.name, culture: figure.culture, birth: 950, roles: [figure.role] });
  }
}

function richMap(): void {
  seed({
    states: [1, 2, 3],
    rulers: [
      { stateId: 1, culture: 1, alignment: "evil", vices: ["cruel", "greedy", "wrathful"] },
      { stateId: 2, culture: 2 },
      { stateId: 3, culture: 3 }
    ],
    religions: [{ id: 1, type: "Cult", deity: "Nerath", culture: 2, center: 30 }],
    factions: [
      { id: 1, type: "shadow_syndicate", culture: 3, wilderness: true },
      { id: 2, type: "merchant_consortium", culture: 1, wilderness: false }
    ],
    burgs: [
      { id: 1, cell: 30, state: 1 },
      { id: 2, cell: 31, state: 2 },
      { id: 3, cell: 32, state: 3 }
    ],
    markers: [
      { id: 0, type: "ruins", cell: 40 },
      { id: 1, type: "necropolises", cell: 41 }
    ]
  });
}

describe("Schemes generator", () => {
  beforeEach(() => {
    seedRandom(7);
    vi.spyOn(Math, "random").mockImplementation(() => random());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("elects 3-5 masterminds with a crowned villain and a hidden schemer", () => {
    richMap();
    const schemes = Schemes.generate();

    expect(schemes.length).toBeGreaterThanOrEqual(3);
    expect(schemes.length).toBeLessThanOrEqual(5);
    for (const scheme of schemes) {
      expect(scheme.status).toBe("active");
      expect(Characters.get(scheme.villainFigure)).toBeDefined();
    }
    expect(schemes.some(scheme => scheme.mastermind.kind === "state")).toBe(true);
    expect(schemes.some(scheme => scheme.mastermind.kind !== "state")).toBe(true);
  });

  it("scores a vice-ridden evil ruler above a virtuous one", () => {
    seed({
      states: [1, 2],
      rulers: [
        { stateId: 1, culture: 1, alignment: "evil", vices: ["cruel", "greedy", "wrathful"] },
        { stateId: 2, culture: 2, alignment: "good", virtues: ["kind", "just", "honest"] }
      ],
      religions: [{ id: 1, type: "Cult", deity: "Nerath", culture: 3 }],
      factions: [{ id: 1, type: "shadow_syndicate", culture: 3, wilderness: true }],
      burgs: [
        { id: 1, cell: 10, state: 1 },
        { id: 2, cell: 11, state: 2 }
      ]
    });

    const schemes = Schemes.generate();
    const crowned = schemes.filter(scheme => scheme.mastermind.kind === "state").map(scheme => scheme.mastermind.id);

    expect(crowned).toContain(1);
    expect(crowned).not.toContain(2);
  });

  it("incarnates a cult's deity as a living god and reuses the figure on regeneration", () => {
    seed({
      states: [1],
      rulers: [{ stateId: 1, culture: 1 }],
      religions: [{ id: 1, type: "Cult", deity: "Nerath", culture: 2, center: 12 }],
      burgs: [{ id: 1, cell: 10, state: 1 }],
      markers: [{ id: 1, type: "ruins", cell: 40 }]
    });

    const first = Schemes.generate();
    const gods = Characters.all().filter(figure => figure.tags?.includes("living_god"));

    expect(gods).toHaveLength(1);
    expect(gods[0].name).toBe("Nerath");
    expect(gods[0].roles[0]).toMatchObject({ type: "prophet", target: { kind: "religion", id: 1 } });
    expect(first.some(scheme => scheme.villainFigure === gods[0].i)).toBe(true);

    seedRandom(7);
    Schemes.generate();
    expect(Characters.all().filter(figure => figure.tags?.includes("living_god"))).toHaveLength(1);
  });

  it("mints a face for a faction with no leader", () => {
    seed({
      states: [1],
      rulers: [{ stateId: 1, culture: 1 }],
      factions: [{ id: 1, type: "shadow_syndicate", culture: 2, wilderness: true }],
      burgs: [{ id: 1, cell: 10, state: 1 }]
    });

    const schemes = Schemes.generate();
    const faction = pack.factions.find(candidate => candidate.i === 1)!;
    expect(faction.leaderId).toBeDefined();

    const leader = Characters.get(faction.leaderId!);
    expect(leader?.roles[0]).toMatchObject({ type: "ruler", target: { kind: "faction", id: 1 } });
    expect(
      schemes.some(scheme => scheme.mastermind.kind === "faction" && scheme.villainFigure === faction.leaderId)
    ).toBe(true);
  });

  it("compiles 8-12 steps, one active, with map-real targets", () => {
    richMap();
    const schemes = Schemes.generate();

    for (const scheme of schemes) {
      expect(scheme.steps.length).toBeGreaterThanOrEqual(8);
      expect(scheme.steps.length).toBeLessThanOrEqual(12);
      expect(scheme.steps[0].status).toBe("active");
      expect(scheme.steps.filter(step => step.status === "active")).toHaveLength(1);

      for (const step of scheme.steps) {
        for (const target of step.targets) {
          if (target.kind === "figure") expect(Characters.get(target.id)).toBeDefined();
          else if (target.kind === "state") expect(pack.states[target.id]).toBeDefined();
          else if (target.kind === "religion") expect(pack.religions[target.id]).toBeDefined();
          else if (target.kind === "faction") expect(pack.factions[target.id]).toBeDefined();
          else if (target.kind === "burg") expect(pack.burgs[target.id]).toBeDefined();
        }
        if (step.relicId !== undefined) {
          expect(Schemes.ensureRelics().some(relic => relic.i === step.relicId)).toBe(true);
        }
      }
    }
  });

  it("seeds relics at danger markers and ties them to seize steps", () => {
    richMap();
    vi.mocked(Math.random).mockReturnValue(0);

    const schemes = Schemes.generate();
    const seizeSteps = schemes.flatMap(scheme => scheme.steps.filter(step => step.verb === "seize_relic"));

    expect(seizeSteps.length).toBeGreaterThan(0);
    for (const step of seizeSteps) {
      expect(step.relicId).toBeDefined();
      const relic = Schemes.ensureRelics().find(candidate => candidate.i === step.relicId)!;
      expect(relic.at.markerId).toBeDefined();
      const marker = pack.markers.find(candidate => candidate.i === relic.at.markerId)!;
      expect(marker.cell).toBe(relic.at.cell);
    }
  });

  it("re-rolls a scheme around the same mastermind", () => {
    richMap();
    const schemes = Schemes.generate();
    const scheme = schemes[0];
    const mastermind = JSON.stringify(scheme.mastermind);
    const villain = scheme.villainFigure;

    expect(Schemes.reroll(scheme)).toBe(true);
    expect(scheme.status).toBe("active");
    expect(JSON.stringify(scheme.mastermind)).toBe(mastermind);
    expect(scheme.villainFigure).toBe(villain);
    expect(scheme.steps.length).toBeGreaterThanOrEqual(8);
    expect(scheme.steps.some(step => step.status === "active")).toBe(true);
  });

  it("compiles the same schemes for the same map and random stream", () => {
    const build = (): string => {
      richMap();
      seedRandom(11);
      return JSON.stringify(Schemes.generate());
    };

    expect(build()).toBe(build());
  });
});
