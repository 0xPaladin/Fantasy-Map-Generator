import { beforeEach, describe, expect, it } from "vitest";
import { BEAST_KIND, BEAST_VERSION, beastContext, createBeastContent } from "./beast-marker";
import { ensureGenerated } from "./marker-content";
import type { Marker } from "./markers-generator";
import { Markers } from "./markers-generator";
import { Notes } from "./notes";

const CELL = 1;

const makeMarker = (): Marker =>
  ({
    i: 0,
    type: "lake-monsters",
    icon: "",
    x: 10,
    y: 20,
    cell: CELL,
    name: "Loch Ael Monster",
    note: "Folk say a relic monster of 12 m long inhabits Loch Ael. Truth or lie, folks are afraid to fish."
  }) as Marker;

beforeEach(() => {
  options.map.seed = "12345";
  globalThis.pack = {
    cells: {
      i: [0, 1],
      culture: Uint8Array.from([1, 1]),
      biome: Uint8Array.from([1, 1]),
      h: Uint8Array.from([10, 10]),
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

describe("beast marker context", () => {
  it("reads the culture, habitat and length from the marker", () => {
    const marker = makeMarker();
    marker.generated = {
      kind: BEAST_KIND,
      version: BEAST_VERSION,
      seed: "12345",
      meta: { habitat: "the open sea", length: 30 }
    };

    expect(beastContext(marker, "12345")).toMatchObject({
      seed: "12345",
      cell: CELL,
      cultureName: "Aeloran",
      alignment: "chaotic",
      biomeName: "Forest",
      name: "Loch Ael Monster",
      habitat: "the open sea",
      length: 30
    });
  });

  it("stores only the recipe until the profile is read", () => {
    expect(createBeastContent()).toEqual({ kind: BEAST_KIND, version: BEAST_VERSION, seed: "12345" });
  });

  it("renders the beast profile and caches it", () => {
    const marker = makeMarker();
    marker.generated = { ...createBeastContent(), meta: { habitat: "a freshwater lake", length: 12 } };

    const html = ensureGenerated(marker);
    expect(html).toContain("<h3>Loch Ael Monster</h3>");
    expect(html).toContain("Alternate beast profile");
    expect(html).toContain("Treasure mix");
    expect(marker.generated?.html).toBe(html);
  });

  it("merges the short note and the profile for the notes editor", () => {
    const marker = makeMarker();
    marker.generated = createBeastContent();
    pack.markers = [marker];

    const full = Notes.getFull({ type: "marker", id: 0 });
    expect(full).toContain("afraid to fish");
    expect(full).toContain("<hr><h3>Beast profile</h3>");
    expect(full).toContain("<h3>Loch Ael Monster</h3>");
    expect(Notes.get({ type: "marker", id: 0 })).toBe(marker.note);
  });

  it("backfills an older beast through the generic reroll and infers its habitat", () => {
    const marker = makeMarker();
    pack.markers = [marker];

    Markers.regenerateGeneratedContent(0, "backfill");

    expect(marker.generated).toMatchObject({ kind: BEAST_KIND, version: BEAST_VERSION, seed: "12345" });
    expect(marker.generated?.meta).toMatchObject({ habitat: "a freshwater lake", length: 12 });
    expect(marker.generated?.html).toContain("Alternate beast profile");
    expect(marker.note).toContain("afraid to fish");
  });
});
