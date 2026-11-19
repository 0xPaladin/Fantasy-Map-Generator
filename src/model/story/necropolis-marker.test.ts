import { beforeEach, describe, expect, it } from "vitest";
import { ensureGenerated } from "./marker-content";
import type { Marker } from "./markers-generator";
import { Markers } from "./markers-generator";
import { createNecropolisContent, NECROPOLIS_KIND, NECROPOLIS_VERSION, necropolisContext } from "./necropolis-marker";
import { Notes } from "./notes";

const CELL = 1;

const makeMarker = (): Marker =>
  ({
    i: 0,
    type: "necropolises",
    icon: "",
    x: 10,
    y: 20,
    cell: CELL,
    name: "Aeloran Necropolis",
    note: "A foreboding necropolis shrouded in perpetual darkness."
  }) as Marker;

beforeEach(() => {
  options.map.seed = "12345";
  globalThis.pack = {
    cells: {
      i: [0, 1],
      culture: Uint8Array.from([1, 1]),
      biome: Uint8Array.from([1, 1]),
      h: Uint8Array.from([25, 25]),
      pop: Uint8Array.from([1, 1])
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

describe("necropolis marker context", () => {
  it("reads the culture, burial type, tier and history metadata from the marker", () => {
    const marker = makeMarker();
    marker.generated = {
      kind: NECROPOLIS_KIND,
      version: NECROPOLIS_VERSION,
      seed: "12345",
      meta: {
        burialType: "Mausoleum",
        tier: "necropolis",
        originalName: "Old Empire",
        originalPolity: "Old Empire",
        fallYear: 500,
        cause: "war"
      }
    };

    expect(necropolisContext(marker, "12345")).toMatchObject({
      seed: "12345",
      cell: CELL,
      cultureName: "Aeloran",
      alignment: "chaotic",
      biomeName: "Forest",
      name: "Aeloran Necropolis",
      burialType: "Mausoleum",
      tier: "necropolis",
      originalName: "Old Empire",
      originalPolity: "Old Empire",
      fallYear: 500,
      cause: "war"
    });
  });

  it("stores only the recipe until the profile is read", () => {
    expect(createNecropolisContent()).toEqual({ kind: NECROPOLIS_KIND, version: NECROPOLIS_VERSION, seed: "12345" });
  });

  it("renders the necropolis profile and caches it", () => {
    const marker = makeMarker();
    marker.generated = { ...createNecropolisContent(), meta: { burialType: "Necropolis", tier: "necropolis" } };

    const html = ensureGenerated(marker);
    expect(html).toContain("<h3>Aeloran Necropolis</h3>");
    expect(html).toContain("Alternate necropolis profile");
    expect(html).toContain("Treasure mix");
    expect(marker.generated?.html).toBe(html);
  });

  it("merges the short note and the profile for the notes editor", () => {
    const marker = makeMarker();
    marker.generated = createNecropolisContent();
    pack.markers = [marker];

    const full = Notes.getFull({ type: "marker", id: 0 });
    expect(full).toContain("perpetual darkness");
    expect(full).toContain("<hr><h3>Necropolis profile</h3>");
    expect(full).toContain("<h3>Aeloran Necropolis</h3>");
    expect(Notes.get({ type: "marker", id: 0 })).toBe(marker.note);
  });

  it("backfills an older necropolis through the generic reroll and infers its type", () => {
    const marker = makeMarker();
    marker.name = "Aeloran Mausoleum";
    pack.markers = [marker];

    Markers.regenerateGeneratedContent(0, "backfill");

    expect(marker.generated).toMatchObject({ kind: NECROPOLIS_KIND, version: NECROPOLIS_VERSION, seed: "12345" });
    expect(marker.generated?.meta).toMatchObject({ burialType: "Mausoleum" });
    expect(marker.generated?.html).toContain("Alternate necropolis profile");
    expect(marker.note).toContain("perpetual darkness");
  });
});
