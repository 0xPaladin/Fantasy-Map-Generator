import { beforeEach, describe, expect, it } from "vitest";
import { CAVE_KIND, CAVE_VERSION, caveContext, createCaveContent } from "./cave-marker";
import { ensureGenerated } from "./marker-content";
import type { Marker } from "./markers-generator";
import { Markers } from "./markers-generator";
import { Notes } from "./notes";

const CELL = 1;

const makeMarker = (): Marker =>
  ({
    i: 0,
    type: "caves",
    icon: "",
    x: 10,
    y: 20,
    cell: CELL,
    name: "Aeloran Cave",
    note: "The Aeloran Cave. Locals claim that it is the home of strange monsters."
  }) as Marker;

beforeEach(() => {
  options.map.seed = "12345";
  globalThis.pack = {
    cells: {
      i: [0, 1],
      culture: Uint8Array.from([1, 1]),
      biome: Uint8Array.from([1, 1]),
      h: Uint8Array.from([60, 60]),
      pop: Uint8Array.from([5, 5])
    },
    cultures: [
      { i: 0, name: "Wildlands" },
      { i: 1, name: "Aeloran", alignment: "chaotic" }
    ],
    biomes: [
      { i: 0, name: "" },
      { i: 1, name: "Forest" }
    ],
    markers: []
  } as unknown as typeof pack;
});

describe("cave marker context", () => {
  it("reads the culture, formation, status and extent from the marker", () => {
    const marker = makeMarker();
    marker.generated = {
      kind: CAVE_KIND,
      version: CAVE_VERSION,
      seed: "12345",
      meta: { formation: "Glacial Cave", status: "totally empty", extent: "deep" }
    };

    expect(caveContext(marker, "12345")).toMatchObject({
      seed: "12345",
      cell: CELL,
      cultureName: "Aeloran",
      alignment: "chaotic",
      biomeName: "Forest",
      name: "Aeloran Cave",
      formation: "Glacial Cave",
      status: "totally empty",
      extent: "deep"
    });
  });

  it("stores only the recipe until the profile is read", () => {
    expect(createCaveContent()).toEqual({ kind: CAVE_KIND, version: CAVE_VERSION, seed: "12345" });
  });

  it("renders the cave profile and caches it", () => {
    const marker = makeMarker();
    marker.generated = { ...createCaveContent(), meta: { formation: "Cave", status: "the home of strange monsters" } };

    const html = ensureGenerated(marker);
    expect(html).toContain("<h3>Aeloran Cave</h3>");
    expect(html).toContain("Alternate cave profile");
    expect(html).toContain("Treasure mix");
    expect(marker.generated?.html).toBe(html);
  });

  it("merges the short note and the profile for the notes editor", () => {
    const marker = makeMarker();
    marker.generated = createCaveContent();
    pack.markers = [marker];

    const full = Notes.getFull({ type: "marker", id: 0 });
    expect(full).toContain("Locals claim");
    expect(full).toContain("<hr><h3>Cave profile</h3>");
    expect(full).toContain("<h3>Aeloran Cave</h3>");
    expect(Notes.get({ type: "marker", id: 0 })).toBe(marker.note);
  });

  it("backfills an older cave through the generic reroll and infers its note", () => {
    const marker = makeMarker();
    marker.name = "Aeloran Glacial Cave";
    marker.note = "The Aeloran Glacial Cave. Locals claim that it is a good spot to hid treasure.";
    pack.markers = [marker];

    Markers.regenerateGeneratedContent(0, "backfill");

    expect(marker.generated).toMatchObject({ kind: CAVE_KIND, version: CAVE_VERSION, seed: "12345" });
    expect(marker.generated?.meta).toMatchObject({
      formation: "Glacial Cave",
      status: "a good spot to hid treasure"
    });
    expect(marker.generated?.html).toContain("Alternate cave profile");
    expect(marker.note).toContain("a good spot to hid treasure");
  });
});
