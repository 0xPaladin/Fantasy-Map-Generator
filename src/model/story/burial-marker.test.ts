import { beforeEach, describe, expect, it } from "vitest";
import { BURIAL_KIND, BURIAL_VERSION, burialContext, createBurialContent } from "./burial-marker";
import { ensureGenerated } from "./marker-content";
import type { Marker } from "./markers-generator";
import { Markers } from "./markers-generator";
import { Notes } from "./notes";

const CELL = 1;

const makeMarker = (): Marker =>
  ({
    i: 0,
    type: "disturbed-burials",
    icon: "",
    x: 10,
    y: 20,
    cell: CELL,
    name: "Disturbed Burial",
    note: "A burial site has been disturbed in this area, causing the dead to rise and attack the living."
  }) as Marker;

beforeEach(() => {
  options.map.seed = "12345";
  globalThis.pack = {
    cells: {
      i: [0, 1],
      culture: Uint8Array.from([1, 1]),
      biome: Uint8Array.from([1, 1]),
      h: Uint8Array.from([30, 30]),
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

describe("burial marker context", () => {
  it("reads the culture, burial kind and history metadata from the marker", () => {
    const marker = makeMarker();
    marker.generated = {
      kind: BURIAL_KIND,
      version: BURIAL_VERSION,
      seed: "12345",
      meta: {
        burialKind: "barrow",
        disturbance: "a broken ward",
        originalName: "Old Dale",
        originalPolity: "Old Empire",
        fallYear: 500,
        cause: "war",
        looted: true
      }
    };

    expect(burialContext(marker, "12345")).toMatchObject({
      seed: "12345",
      cell: CELL,
      cultureName: "Aeloran",
      alignment: "chaotic",
      biomeName: "Forest",
      name: "Disturbed Burial",
      burialKind: "barrow",
      disturbance: "a broken ward",
      originalName: "Old Dale",
      originalPolity: "Old Empire",
      fallYear: 500,
      cause: "war",
      looted: true
    });
  });

  it("stores only the recipe until the profile is read", () => {
    expect(createBurialContent()).toEqual({ kind: BURIAL_KIND, version: BURIAL_VERSION, seed: "12345" });
  });

  it("renders the burial profile and caches it", () => {
    const marker = makeMarker();
    marker.generated = { ...createBurialContent(), meta: { burialKind: "crypt" } };

    const html = ensureGenerated(marker);
    expect(html).toContain("<h3>Disturbed Burial</h3>");
    expect(html).toContain("Alternate burial profile");
    expect(html).toContain("Treasure mix");
    expect(marker.generated?.html).toBe(html);
  });

  it("merges the short note and the profile for the notes editor", () => {
    const marker = makeMarker();
    marker.generated = createBurialContent();
    pack.markers = [marker];

    const full = Notes.getFull({ type: "marker", id: 0 });
    expect(full).toContain("the dead to rise");
    expect(full).toContain("<hr><h3>Burial profile</h3>");
    expect(full).toContain("<h3>Disturbed Burial</h3>");
    expect(Notes.get({ type: "marker", id: 0 })).toBe(marker.note);
  });

  it("backfills an older burial through the generic reroll", () => {
    const marker = makeMarker();
    pack.markers = [marker];

    Markers.regenerateGeneratedContent(0, "backfill");

    expect(marker.generated).toMatchObject({ kind: BURIAL_KIND, version: BURIAL_VERSION, seed: "12345" });
    expect(marker.generated?.html).toContain("Alternate burial profile");
    expect(marker.note).toContain("the dead to rise");
  });
});
