import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BURIAL_KINDS } from "@/data/burials";
import { BRIGAND_ANIMALS, HILL_MONSTER_SPECIES } from "@/data/markers";
import { Goods } from "@/model/economy/goods-generator";
import { Names } from "@/model/society/names-generator";
import { ensureGenerated } from "./marker-content";
import type { Marker } from "./markers-generator";
import { Markers } from "./markers-generator";

const NAV_KEY = "navigator";

function setNavigator(value: unknown) {
  Object.defineProperty(globalThis, NAV_KEY, {
    value,
    configurable: true,
    writable: true
  });
}

describe("MarkersModule.addEncounter", () => {
  let markers: any;
  const CELL = 1;
  let originalNavigatorDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, NAV_KEY);

    options.map.cultures.set = "world";
    globalThis.window = globalThis.window || ({} as any);

    globalThis.pack = {
      cells: {
        culture: Uint8Array.from([0, 2, 0, 0]),
        biome: Uint8Array.from([0, 3, 0, 0])
      },
      biomes: [{ name: "" }, { name: "" }, { name: "" }, { name: "Forest" }]
    } as any;

    Object.assign(Names, {
      getCulture: () => "Aeloran"
    });

    await import("./markers-generator");
    markers = Markers;
  });

  afterEach(() => {
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, NAV_KEY, originalNavigatorDescriptor);
    } else {
      delete (globalThis as any)[NAV_KEY];
    }
  });

  it("uses the Deorum iframe legend when the browser is online", () => {
    setNavigator({ onLine: true });

    const marker = { i: 42, cell: CELL } as Marker;
    markers.addEncounter(marker, CELL);

    expect(marker.name).toBe("Random encounter");
    expect(String(marker.note).includes(`https://deorum.vercel.app/encounter/${CELL}`)).toBe(true);
    expect(String(marker.note).includes("<iframe")).toBe(true);
  });

  it("falls back to a procedural culture/biome legend when offline", () => {
    setNavigator({ onLine: false });

    const marker = { i: 7, cell: CELL } as Marker;
    markers.addEncounter(marker, CELL);

    expect(String(marker.note).includes("iframe")).toBe(false);
    expect(String(marker.note).includes("deorum")).toBe(false);
    expect(String(marker.note).includes("Aeloran")).toBe(true);
    expect(String(marker.note).includes("forest")).toBe(true);
  });

  it("treats a missing navigator (SSR / Node) as online", () => {
    setNavigator(undefined);

    const marker = { i: 9, cell: CELL } as Marker;
    markers.addEncounter(marker, CELL);

    expect(String(marker.note).includes("deorum.vercel.app")).toBe(true);
  });
});

describe("MarkersModule.rename", () => {
  it("renames a marker by id", async () => {
    await import("./markers-generator");
    globalThis.pack = { markers: [{ i: 4, name: "Old Well" }] } as any;
    Markers.rename(4, "Wishing Well");
    expect(pack.markers[0].name).toBe("Wishing Well");
    expect(() => Markers.rename(0, "X")).toThrow("Marker 0 does not exist");
  });
});

describe("MarkersModule mines", () => {
  it("places mines in burgs on an ore or mineral, played out where the burg extracts none", async () => {
    await import("./markers-generator");
    const goods = [
      { i: 1, name: "Iron", tags: ["ore"] },
      { i: 2, name: "Grain", tags: ["food"] }
    ];
    Object.assign(Goods, { get: (id: number) => goods.find(good => good.i === id) });
    globalThis.pack = {
      cells: {
        i: [0, 1, 2, 3],
        burg: [0, 1, 2, 3],
        good: [1, 1, 2, 1]
      },
      burgs: [
        {},
        { i: 1, name: "Ironton", population: 1, production: [[1, 2]] },
        { i: 2, name: "Farmton", population: 1, production: [[2, 2]] },
        { i: 3, name: "Smithton", population: 1, production: [[3, 2]] } // sits on iron but makes no iron
      ],
      deals: [[1, 1, 1, 0, 2, 1, 0, 0, 0]]
    } as any;
    const markers = Markers as any;

    expect(markers.listMines(pack)).toEqual([1, 3]);
    const mine = { i: 0, cell: 1 } as Marker;
    markers.addMine(mine, 1);
    expect(mine.name).toBe("Ironton — iron mining town");
    const old = { i: 1, cell: 3 } as Marker;
    markers.addMine(old, 3);
    expect(old.name).toBe("Smithton — old iron mine");
  });
});

describe("MarkersModule weighted pick", () => {
  it("draws once, in proportion to the weights, and removes the pick", () => {
    const markers = Markers as any;
    const random = Math.random;
    Math.random = () => 0.5;
    const cells = [10, 11, 12];
    const weights = [1, 0, 3];
    expect(markers.extractWeighted(cells, weights)).toEqual([12]);
    expect(cells).toEqual([10, 11]);
    expect(weights).toEqual([1, 0]);
    expect(markers.extractWeighted([7, 8], [0, 0])).toEqual([8]); // uniform without any weight
    Math.random = random;
  });
});

describe("MarkersModule guild halls", () => {
  const cloth = { i: 1, name: "Cloth", tags: [], value: 10, recipes: [{ 2: 1 }] };
  const wool = { i: 2, name: "Wool", tags: [], value: 1 };
  const guildsOf = (production: Record<number, number[][]>, states: Record<number, number> = {}) => {
    Object.assign(Goods, { get: (id: number) => [cloth, wool].find(good => good.i === id) });
    const burgs = Object.entries(production).map(([i, made]) => ({ i: +i, state: states[+i] ?? 1, production: made }));
    globalThis.pack = { burgs: [{}, ...burgs] } as any;
    return (Markers as any).indexGuilds() as Map<number, { good: { i: number }; renown: number }>;
  };

  it("fames a burg that leads the good's many makers, without a set share of the world", () => {
    const small = Object.fromEntries(Array.from({ length: 24 }, (_, k) => [k + 2, [[1, 0.5]]]));
    const guilds = guildsOf({ 1: [[1, 3]], ...small }); // 20% of the world and of its state, among 25 makers
    expect(guilds.has(1)).toBe(false); // 0.2 × √(25 × 0.2) is short of it

    const elsewhere = Object.fromEntries(Object.keys(small).map(i => [i, 2]));
    const famed = guildsOf({ 1: [[1, 3]], ...small }, elsewhere); // the same, and all of its state
    expect(famed.get(1)?.good.i).toBe(1);
    expect(famed.size).toBe(1);
  });

  it("skips a good that is a burg's sideline or too little", () => {
    expect(guildsOf({ 1: [[1, 1]] }).size).toBe(0); // worth 10 a day
    const silk = { i: 3, name: "Silk", tags: [], value: 100, recipes: [{ 2: 1 }] };
    Object.assign(Goods, { get: (id: number) => [cloth, wool, silk].find(good => good.i === id) });
    globalThis.pack = {
      burgs: [
        {},
        {
          i: 1,
          state: 1,
          production: [
            [1, 2],
            [3, 1]
          ]
        }
      ]
    } as any;
    expect((Markers as any).indexGuilds().get(1).good).toBe(silk); // cloth is a sixth of its work
  });

  it("skips raw goods and removed burgs", () => {
    expect(guildsOf({ 1: [[2, 500]] }).size).toBe(0);
    Object.assign(Goods, { get: () => cloth });
    globalThis.pack = { burgs: [{}, { i: 1, removed: true, production: [[1, 50]] }] } as any;
    expect((Markers as any).indexGuilds().size).toBe(0);
  });
});

describe("MarkersModule migrations", () => {
  it("picks animals native to the biome and skips biomes without migrations", async () => {
    await import("./markers-generator");
    globalThis.pack = {
      cells: { i: [0, 1, 2], h: [30, 30, 30], pop: [0, 0, 0], biome: [10, 11, 1] }
    } as any;
    const markers = Markers as any;

    expect(markers.listMigrations(pack)).toEqual([0, 2]);
    const marker = { i: 0, cell: 0 } as Marker;
    markers.addMigration(marker, 0);
    expect(["Reindeer", "Musk oxen", "Wolves", "Foxes", "Geese", "Hares", "Owls"]).toContain(
      marker.name.replace(" migration", "")
    );
  });
});

describe("MarkersModule customs houses", () => {
  it("lists one road crossing for each pair of states trading under tariffs", () => {
    const markers = Markers as any;
    globalThis.pack = {
      cells: {
        i: [0, 1, 2, 3, 4],
        state: [1, 2, 1, 2, 3],
        // 0-1 and 2-3 cross by road between states 1 and 2; 3-4 by a trail into state 3
        routes: [{ 1: 0 }, { 0: 0 }, { 3: 0 }, { 2: 0, 4: 1 }, { 3: 1 }]
      },
      routes: [
        { i: 0, group: "roads" },
        { i: 1, group: "trails" }
      ]
    } as any;
    markers.tradeSource = pack.deals;
    markers.tradeIndex = {
      tariffs: new Map([
        [markers.getStatePair(1, 2), 5],
        [markers.getStatePair(2, 3), 9]
      ])
    };
    expect(markers.listCustomsHouses(pack)).toEqual([0]);
    expect(markers.getCustomsBorder(3)).toEqual({ state: 1, tariffs: 5 });
    markers.tradeIndex = undefined;
  });
});

describe("MarkersModule trade index", () => {
  it("sums the economy run again once its deals are replaced", () => {
    const markers = Markers as any;
    globalThis.pack = { burgs: [{}], markets: [], deals: [] } as any;
    const first = markers.trade;
    expect(markers.trade).toBe(first);
    pack.deals = [];
    expect(markers.trade).not.toBe(first);
  });
});

describe("MarkersModule chronicle-owned types", () => {
  /** one cell every ruins and battlefield list accepts; the arrays are indexed by cell id */
  const world = () => {
    globalThis.pack = {
      markers: [],
      cells: {
        i: [1],
        burg: [0, 0],
        culture: [0, 1],
        h: [0, 40],
        state: [0, 1],
        pop: [0, 5],
        p: [
          [0, 0],
          [50, 50]
        ]
      }
    } as any;
  };
  const twoTypes = [
    {
      type: "ruins",
      icon: "≡ƒÅ║",
      min: 1,
      each: 1200,
      multiplier: 1,
      list: (pack: any) =>
        pack.cells.i.filter((i: number) => pack.cells.culture[i] && pack.cells.h[i] >= 20 && pack.cells.h[i] < 60),
      add: () => {}
    },
    {
      type: "battlefields",
      icon: "ΓÜö∩╕Å",
      min: 1,
      each: 700,
      multiplier: 1,
      list: (pack: any) =>
        pack.cells.i.filter(
          (i: number) => pack.cells.state[i] && pack.cells.pop[i] > 2 && pack.cells.h[i] < 50 && pack.cells.h[i] > 25
        ),
      add: () => {}
    }
  ];
  const history = (over: Record<string, unknown>) => ({
    mode: "archaeologist",
    span: 1000,
    realms: 2,
    density: 1,
    echoes: true,
    ruins: 3,
    renames: false,
    ...over
  });

  it("leaves both to the epochs' chronicle", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    options.map.lore.history = history({ mode: "epochs" }) as any;
    world();
    markers.setConfig(twoTypes);
    markers.regenerate();
    expect(pack.markers).toHaveLength(0); // the chronicle places the ruins and the fall battlefields
  });

  it("hides both from the archaeologist's chronicle, as before", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    options.map.lore.history = history({}) as any;
    world();
    markers.setConfig(twoTypes);
    markers.regenerate();
    expect(pack.markers).toHaveLength(0);
  });

  it("keeps every standard marker when echoes are off", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    options.map.lore.history = history({ mode: "epochs", echoes: false }) as any;
    world();
    markers.setConfig(twoTypes);
    markers.regenerate();
    expect(pack.markers.map((marker: Marker) => marker.type)).toEqual(["ruins", "battlefields"]);
  });

  it("keeps a locked marker's generated profile through regeneration", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    options.map.lore.history = history({ mode: "epochs", echoes: false }) as any;
    world();
    const locked = {
      i: 99,
      type: "ruins",
      cell: 1,
      name: "Locked Ruin",
      lock: true,
      generated: { kind: "ruin", version: 1, seed: "12345", meta: { tier: "village" } }
    } as unknown as Marker;
    pack.markers = [locked];
    markers.setConfig(twoTypes);
    markers.regenerate();

    expect(pack.markers).toContain(locked);
    expect(locked.generated).toEqual({ kind: "ruin", version: 1, seed: "12345", meta: { tier: "village" } });
  });
});

describe("MarkersModule provincial impacts and attribution", () => {
  it("resolves default, contextual, alias and overridden impacts", () => {
    expect(Markers.getImpact({ type: "brigands", name: "Brigands" })).toEqual({ economy: -3, stability: -5 });
    expect(Markers.getImpact({ type: "bandit", name: "Bandit" })).toEqual({ economy: -3, stability: -5 });
    expect(Markers.getImpact({ type: "mines", name: "Ironton — iron mining town" })).toEqual({
      economy: 3,
      stability: 0
    });
    expect(
      Markers.getImpact({
        type: "mines",
        name: "Smithton — old iron mine",
        note: "The iron mine by Smithton is played out."
      })
    ).toEqual({ economy: 0, stability: -2 });
    expect(Markers.getImpact({ type: "volcanoes", name: "Ash", note: "Erupting volcano." })).toEqual({
      economy: -4,
      stability: -8
    });
    expect(Markers.getImpact({ type: "volcanoes", name: "Ash", note: "Dormant volcano." })).toEqual({
      economy: 0,
      stability: 0
    });
    expect(
      Markers.getImpact({ type: "caves", name: "Cavern", note: "Locals claim that it is a good spot to hid treasure." })
    ).toEqual({ economy: 1, stability: 0 });
    expect(Markers.getImpact({ type: "brigands", name: "Red Gang", economy: 2.5, stability: -1 })).toEqual({
      economy: 2.5,
      stability: -1
    });
  });

  it("sets and resets per-marker impact overrides via setImpact", () => {
    globalThis.pack = {
      markers: [{ i: 1, type: "inns", name: "The Oak", cell: 0, x: 0, y: 0 }]
    } as any;
    Markers.setImpact(1, { economy: 5.556, stability: -2.24 });
    expect(pack.markers[0].economy).toBe(5.56);
    expect(pack.markers[0].stability).toBe(-2.2);
    expect(Markers.getImpact(pack.markers[0])).toEqual({ economy: 5.56, stability: -2.2 });

    Markers.setImpact(1, { economy: null, stability: null });
    expect(pack.markers[0].economy).toBeUndefined();
    expect(pack.markers[0].stability).toBeUndefined();
    expect(Markers.getImpact(pack.markers[0])).toEqual({ economy: 1.5, stability: 2 });
    expect(() => Markers.setImpact(1, { economy: Number.NaN })).toThrow("number or null");
  });

  it("attributes land and water markers to their direct, route-endpoint, or nearest shore province", () => {
    // Cells: 0 (land, prov 1), 1 (land, prov 2), 2 (water near cell 0), 3 (water on sea route to cell 1), 4 (neutral land)
    globalThis.pack = {
      provinces: [{ i: 0 }, { i: 1, name: "West" }, { i: 2, name: "East" }],
      routes: [
        {
          i: 7,
          group: "searoutes",
          points: [
            [100, 0, 1],
            [50, 0, 3]
          ]
        }
      ],
      cells: {
        i: [0, 1, 2, 3, 4],
        h: [30, 30, 10, 10, 30],
        province: [1, 2, 0, 0, 0],
        p: [
          [0, 0],
          [100, 0],
          [10, 0],
          [50, 0],
          [200, 0]
        ],
        c: [[2], [3], [0, 3], [2, 1], []],
        routes: [{}, {}, {}, { 7: 1 }, {}]
      },
      markers: [
        { i: 0, type: "merchant-houses", name: "House A", cell: 0, x: 0, y: 0 },
        { i: 1, type: "lake-monsters", name: "Nessie", cell: 2, x: 10, y: 0 }, // shore cell 0 (prov 1) is closer than cell 1 (prov 2)
        { i: 2, type: "pirates", name: "Corsairs", cell: 3, x: 80, y: 0 }, // nearest shore/route endpoint is prov 2 at x=100
        { i: 3, type: "ruins", name: "Wild Ruins", cell: 4, x: 200, y: 0 }, // neutral unprovinced land -> no province
        { i: 4, type: "brigands", name: "Hidden Gang", cell: 0, x: 0, y: 0, hidden: true }
      ]
    } as any;

    expect(Markers.getProvinceAdjustments(1)).toEqual({
      economy: [
        { name: "House A", value: 4 },
        { name: "Nessie", value: -1.5 }
      ],
      stability: [
        { name: "House A", value: 2 },
        { name: "Nessie", value: -3 }
      ]
    });
    expect(Markers.getProvinceAdjustments(2)).toEqual({
      economy: [{ name: "Corsairs", value: -3 }],
      stability: [{ name: "Corsairs", value: -3 }]
    });

    // Hiding a marker removes its provincial impact; moving shifts it
    Markers.setHidden(1, true);
    expect(Markers.getProvinceAdjustments(1).economy).toEqual([{ name: "House A", value: 4 }]);
  });
});

describe("MarkersModule dungeons", () => {
  const CELL = 1;

  beforeEach(() => {
    options.map.seed = "12345";
    globalThis.pack = {
      markers: [],
      cells: {
        i: [0, 1],
        culture: Uint8Array.from([1, 1]),
        biome: Uint8Array.from([1, 1]),
        h: Uint8Array.from([42, 42]),
        state: Uint8Array.from([1, 1]),
        province: Uint8Array.from([1, 1]),
        religion: Uint8Array.from([1, 1])
      },
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Aeloran", alignment: "neutral" }
      ],
      biomes: [
        { i: 0, name: "" },
        { i: 1, name: "Forest" }
      ],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Ardenia" }
      ],
      provinces: [
        { i: 0, name: "" },
        { i: 1, name: "Green March" }
      ],
      religions: [
        { i: 0, name: "" },
        { i: 1, name: "The Dawn" }
      ]
    } as any;
  });

  it("keeps the Watabou preview and stores only the lazy dungeon recipe", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "dungeons", cell: CELL } as Marker;

    markers.addDungeon(marker, CELL);

    expect(marker.name).not.toBe("Dungeon");
    expect(marker.note).toContain("https://watabou.github.io/one-page-dungeon/?seed=123451");
    expect(marker.note).toContain('rel="noopener"');
    expect(marker.note).not.toContain("Dungeon profile");
    expect(marker.generated).toMatchObject({ kind: "dungeon", version: 1, seed: "12345" });
    expect(marker.generated?.html).toBeUndefined();
  });

  it("materializes the profile on first read without changing the stored note", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "dungeons", cell: CELL } as Marker;
    markers.addDungeon(marker, CELL);
    const note = marker.note;

    const html = ensureGenerated(marker);

    expect(html).toContain(marker.name);
    expect(html).toContain("Alternate dungeon profile");
    expect(marker.generated?.html).toBe(html);
    expect(marker.note).toBe(note);
  });

  it("rerolls the profile and keeps the Watabou note", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "dungeons", cell: CELL } as Marker;
    markers.addDungeon(marker, CELL);
    pack.markers = [marker];
    const note = marker.note;
    const first = ensureGenerated(marker);

    markers.regenerateDungeonProfile(0, "reroll");

    expect(marker.note).toBe(note);
    expect(marker.generated).toMatchObject({ kind: "dungeon", version: 1, seed: "12345" });
    expect(marker.generated?.html).not.toBe(first);
  });

  it("rerolls through the generic generated-content entry point", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "dungeons", cell: CELL } as Marker;
    markers.addDungeon(marker, CELL);
    pack.markers = [marker];

    markers.regenerateGeneratedContent(0, "generic");

    expect(marker.generated?.html).toContain("Alternate dungeon profile");
  });

  it("backfills an older dungeon marker and its generic name", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 1, type: "dungeons", name: "Dungeon", note: "Watabou legend", cell: CELL } as Marker;
    pack.markers = [marker];

    markers.regenerateDungeonProfile(1, "backfill");

    expect(marker.name).not.toBe("Dungeon");
    expect(marker.note).toBe("Watabou legend");
    expect(marker.generated?.html).toContain("Alternate dungeon profile");
  });

  it("refuses to reroll a marker that is not a dungeon", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    pack.markers = [{ i: 2, type: "inns", name: "Inn", cell: CELL } as Marker];

    expect(() => markers.regenerateDungeonProfile(2)).toThrow("not a dungeon");
  });
});

describe("MarkersModule ruins", () => {
  beforeEach(() => {
    options.map.seed = "12345";
    globalThis.pack = { markers: [] } as any;
  });

  it("gives a random ruin a lazy ruin recipe", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "ruins", cell: 1 } as Marker;

    markers.addRuins(marker, 1);

    expect(marker.name).toContain("Ruined");
    expect(marker.generated).toMatchObject({ kind: "ruin", version: 1, seed: "12345" });
    expect(marker.generated?.html).toBeUndefined();
    expect(ensureGenerated(marker)).toContain("Alternate ruin profile");
  });
});

describe("MarkersModule caves", () => {
  beforeEach(() => {
    options.map.seed = "12345";
    globalThis.pack = {
      cells: { culture: [0, 1], biome: [0, 1], h: [0, 60], pop: [0, 5] },
      cultures: [{ i: 0 }, { i: 1, name: "Aeloran" }],
      biomes: [
        { i: 0, name: "" },
        { i: 1, name: "Forest" }
      ],
      markers: []
    } as any;
    Object.assign(Names, { getCulture: () => "Aeloran" });
  });

  it("gives a random cave a lazy cave recipe and keeps the status note", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "caves", cell: 1 } as Marker;

    markers.addCave(marker, 1);

    expect(marker.name).toContain("Aeloran");
    expect(marker.generated).toMatchObject({ kind: "cave", version: 1, seed: "12345" });
    const formation = marker.generated?.meta?.formation as string;
    const status = marker.generated?.meta?.status as string;
    expect(formation).toBeTruthy();
    expect(status).toBeTruthy();
    expect(marker.note).toContain(status);
    expect(marker.generated?.html).toBeUndefined();
    expect(ensureGenerated(marker)).toContain("Alternate cave profile");
  });

  it("keeps cave impact keywords in the short note", () => {
    expect(Markers.getDefaultImpact({ type: "caves", name: "X", note: "a good spot to hid treasure" })).toEqual({
      economy: 1,
      stability: 0
    });
    expect(Markers.getDefaultImpact({ type: "caves", name: "X", note: "the home of strange monsters" })).toEqual({
      economy: 0,
      stability: -2
    });
  });
});

describe("MarkersModule disturbed burials", () => {
  beforeEach(() => {
    options.map.seed = "12345";
    globalThis.pack = {
      cells: { culture: [0, 1], biome: [0, 1], h: [0, 30], pop: [0, 5] },
      cultures: [{ i: 0 }, { i: 1, name: "Aeloran" }],
      biomes: [
        { i: 0, name: "" },
        { i: 1, name: "Forest" }
      ],
      markers: []
    } as any;
  });

  it("gives a random disturbed burial a lazy burial recipe and keeps the short note", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "disturbed-burials", cell: 1 } as Marker;

    markers.addDisturbedBurial(marker, 1);

    expect(marker.name).toBe("Disturbed Burial");
    expect(marker.note).toContain("the dead to rise");
    expect(marker.generated).toMatchObject({ kind: "burial", version: 1, seed: "12345" });
    const burialKind = marker.generated?.meta?.burialKind as string;
    expect(BURIAL_KINDS.some(row => row.kind === burialKind)).toBe(true);
    expect(marker.generated?.html).toBeUndefined();
    expect(ensureGenerated(marker)).toContain("Alternate burial profile");
  });
});

describe("MarkersModule necropolises", () => {
  beforeEach(() => {
    options.map.seed = "12345";
    globalThis.pack = {
      cells: { culture: [0, 1], biome: [0, 1], h: [0, 25], pop: [0, 1] },
      cultures: [{ i: 0 }, { i: 1, name: "Aeloran" }],
      biomes: [
        { i: 0, name: "" },
        { i: 1, name: "Forest" }
      ],
      markers: []
    } as any;
    Object.assign(Names, { getCulture: () => "Aeloran" });
  });

  it("gives a random necropolis a lazy necropolis recipe and keeps the legend", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "necropolises", cell: 1 } as Marker;

    markers.addNecropolis(marker, 1);

    const burialType = marker.generated?.meta?.burialType as string;
    expect(marker.name).toBe(`Aeloran ${burialType}`);
    expect(marker.note).toBeTruthy();
    expect(marker.generated).toMatchObject({ kind: "necropolis", version: 1, seed: "12345" });
    expect(burialType).toBeTruthy();
    expect(marker.generated?.html).toBeUndefined();
    expect(ensureGenerated(marker)).toContain("Alternate necropolis profile");
  });
});

describe("MarkersModule beasts", () => {
  beforeEach(() => {
    options.map.seed = "12345";
    options.map.units = { height: { unit: "m" } } as any;
    globalThis.pack = {
      cells: { culture: [0, 1], biome: [0, 1], h: [0, 10], pop: [0, 5], f: [0, 1] },
      features: [{}, { type: "lake", name: "Loch Ael" }],
      cultures: [{ i: 0 }, { i: 1, name: "Aeloran" }],
      biomes: [
        { i: 0, name: "" },
        { i: 1, name: "Forest" }
      ],
      markers: []
    } as any;
    Object.assign(Names, { getCulture: () => "Aeloran", getCultureShort: () => "Aeloran" });
  });

  it("gives a lake monster a lazy beast recipe and keeps the rumor", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "lake-monsters", cell: 1 } as Marker;

    markers.addLakeMonster(marker, 1);

    expect(marker.name).toBe("Loch Ael Monster");
    expect(marker.generated).toMatchObject({ kind: "beast", version: 1, seed: "12345" });
    expect(marker.generated?.meta?.habitat).toBe("a freshwater lake");
    expect(typeof marker.generated?.meta?.length).toBe("number");
    expect(marker.note).toContain("afraid to fish");
    expect(marker.generated?.html).toBeUndefined();
    expect(ensureGenerated(marker)).toContain("Alternate beast profile");
  });

  it("gives a sea monster a lazy beast recipe", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "sea-monsters", cell: 1 } as Marker;

    markers.addSeaMonster(marker, 1);

    expect(marker.name).toBe("Aeloran Monster");
    expect(marker.generated).toMatchObject({ kind: "beast", version: 1, seed: "12345" });
    expect(marker.generated?.meta?.habitat).toBe("the open sea");
    expect(typeof marker.generated?.meta?.length).toBe("number");
    expect(marker.generated?.html).toBeUndefined();
    expect(ensureGenerated(marker)).toContain("Alternate beast profile");
  });
});

describe("MarkersModule monsters", () => {
  beforeEach(() => {
    options.map.seed = "12345";
    globalThis.pack = {
      cells: { culture: [0, 1], biome: [0, 1], h: [0, 60], pop: [0, 5] },
      cultures: [{ i: 0 }, { i: 1, name: "Aeloran" }],
      biomes: [
        { i: 0, name: "" },
        { i: 1, name: "Forest" }
      ],
      markers: []
    } as any;
    Object.assign(Names, { getCulture: () => "Aeloran" });
  });

  it("gives a hill monster a lazy monster recipe and keeps the rumor", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "hill-monsters", cell: 1 } as Marker;

    markers.addHillMonster(marker, 1);

    const species = marker.generated?.meta?.species as string;
    expect(HILL_MONSTER_SPECIES).toContain(species);
    expect(marker.name).toBe(`Aeloran ${species}`);
    expect(marker.generated).toMatchObject({ kind: "monster", version: 1, seed: "12345" });
    expect(marker.generated?.meta?.habit).toBeTruthy();
    expect(marker.note).toContain(species);
    expect(marker.generated?.html).toBeUndefined();
    expect(ensureGenerated(marker)).toContain("Alternate monster profile");
  });
});

describe("MarkersModule bandits", () => {
  beforeEach(() => {
    options.map.seed = "12345";
    globalThis.pack = {
      cells: { culture: [0, 1], biome: [0, 5], h: [0, 40], pop: [0, 5] },
      cultures: [{ i: 0 }, { i: 1, name: "Aeloran" }],
      biomes: [
        { i: 0, name: "" },
        { i: 5, name: "Forest" }
      ],
      markers: []
    } as any;
    Object.assign(Names, { getCulture: () => "Aeloran" });
  });

  it("gives a brigand gang a lazy bandit recipe and keeps the note", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "brigands", cell: 1 } as Marker;

    markers.addBrigands(marker, 1);

    const gang = marker.generated?.meta?.gang as string;
    expect(BRIGAND_ANIMALS).toContain(gang);
    expect(marker.name).toBe(`Aeloran ${gang}`);
    expect(marker.generated).toMatchObject({ kind: "bandit", version: 1, seed: "12345" });
    expect(marker.generated?.meta?.locality).toBeTruthy();
    expect(marker.generated?.meta?.maritime).toBe(false);
    expect(marker.note).toContain("A gang of");
    expect(marker.generated?.html).toBeUndefined();
    expect(ensureGenerated(marker)).toContain("Alternate bandit profile");
  });

  it("gives pirates a maritime bandit recipe", async () => {
    await import("./markers-generator");
    const markers = Markers as any;
    const marker = { i: 0, type: "pirates", cell: 1 } as Marker;

    markers.addPirates(marker, 1);

    expect(marker.name).toBe("Pirates");
    expect(marker.generated).toMatchObject({ kind: "bandit", version: 1, seed: "12345" });
    expect(marker.generated?.meta?.maritime).toBe(true);
    expect(marker.generated?.meta?.locality).toBe("coastal");
    expect(marker.generated?.html).toBeUndefined();
    expect(ensureGenerated(marker)).toContain("Alternate bandit profile");
  });
});
