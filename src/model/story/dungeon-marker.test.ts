import { beforeEach, describe, expect, it } from "vitest";
import { createDungeonContent, DUNGEON_KIND, DUNGEON_VERSION, dungeonContext, dungeonName } from "./dungeon-marker";
import { ensureGenerated } from "./marker-content";
import type { Marker } from "./markers-generator";
import { Notes } from "./notes";

const CELL = 1;

const makeMarker = (): Marker =>
  ({
    i: 0,
    type: "dungeons",
    icon: "",
    x: 10,
    y: 20,
    cell: CELL,
    name: "",
    note: "Watabou legend"
  }) as Marker;

beforeEach(() => {
  options.map.seed = "12345";
  globalThis.pack = {
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
      { i: 1, name: "Aeloran", alignment: "chaotic" }
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
    ],
    markers: []
  } as unknown as typeof pack;
});

describe("dungeon marker context", () => {
  it("reads the culture, alignment, biome and place names from the cell", () => {
    expect(dungeonContext(CELL, "12345")).toMatchObject({
      seed: "12345",
      cell: CELL,
      cultureName: "Aeloran",
      alignment: "chaotic",
      biomeName: "Forest",
      height: 42,
      stateName: "Ardenia",
      provinceName: "Green March",
      religionName: "The Dawn"
    });
  });

  it("names a dungeon deterministically from the map seed and cell", () => {
    expect(dungeonName(CELL, "12345")).toBe(dungeonName(CELL, "12345"));
    expect(dungeonName(CELL, "12345")).not.toBe("");
  });
});

describe("dungeon generated content", () => {
  it("stores only the recipe until the profile is read", () => {
    expect(createDungeonContent()).toEqual({ kind: DUNGEON_KIND, version: DUNGEON_VERSION, seed: "12345" });
  });

  it("renders the named profile and caches it", () => {
    const marker = makeMarker();
    marker.name = dungeonName(CELL, "12345");
    marker.generated = createDungeonContent();

    const html = ensureGenerated(marker);
    expect(html).toContain(`<h3>${marker.name}</h3>`);
    expect(html).toContain("Alternate dungeon profile");
    expect(html).toContain("<strong>Danger</strong>");
    expect(html).toContain("<strong>Inhabitants</strong>");
    expect(marker.generated?.html).toBe(html);
  });

  it("merges the Watabou note and the profile for the notes editor", () => {
    const marker = makeMarker();
    marker.name = dungeonName(CELL, "12345");
    marker.generated = createDungeonContent();
    pack.markers = [marker];

    const full = Notes.getFull({ type: "marker", id: 0 });
    expect(full).toContain("Watabou legend");
    expect(full).toContain("<hr><h3>Dungeon profile</h3>");
    expect(full).toContain(`<h3>${marker.name}</h3>`);
    expect(Notes.get({ type: "marker", id: 0 })).toBe("Watabou legend");
  });
});
