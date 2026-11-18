import { beforeEach, describe, expect, it } from "vitest";
import { ensureGenerated, fullNote, generatedDivider, registerGeneratedRenderer, setFullNote } from "./marker-content";
import type { Marker } from "./markers-generator";

const KIND = "test-content";

const makeMarker = (overrides: Partial<Marker> = {}): Marker =>
  ({
    i: 1,
    type: "dungeons",
    icon: "",
    x: 0,
    y: 0,
    cell: 0,
    name: "Test dungeon",
    ...overrides
  }) as Marker;

beforeEach(() => {
  registerGeneratedRenderer(KIND, (_marker, content) => `<p>Generated ${content.seed}</p>`);
});

describe("marker generated content", () => {
  it("does nothing without a generated recipe", () => {
    const marker = makeMarker({ note: "Short note" });
    expect(ensureGenerated(marker)).toBeUndefined();
    expect(fullNote(marker)).toBe("Short note");
  });

  it("builds and caches the html on first read", () => {
    const marker = makeMarker({ generated: { kind: KIND, version: 1, seed: "abc" } });

    expect(marker.generated?.html).toBeUndefined();
    expect(ensureGenerated(marker)).toBe("<p>Generated abc</p>");
    expect(marker.generated?.html).toBe("<p>Generated abc</p>");
    expect(ensureGenerated(marker)).toBe("<p>Generated abc</p>");
  });

  it("can render without caching", () => {
    const marker = makeMarker({ generated: { kind: KIND, version: 1, seed: "abc" } });
    expect(ensureGenerated(marker, { cache: false })).toBe("<p>Generated abc</p>");
    expect(marker.generated?.html).toBeUndefined();
  });

  it("appends the generated section under a stable divider", () => {
    const marker = makeMarker({
      note: "Short note",
      generated: { kind: KIND, version: 1, seed: "abc" }
    });
    expect(fullNote(marker)).toBe(`Short note${generatedDivider(KIND)}<p>Generated abc</p>`);
  });

  it("does not append twice when the note already contains the divider", () => {
    const note = `Short note${generatedDivider(KIND)}<p>Existing</p>`;
    const marker = makeMarker({ note, generated: { kind: KIND, version: 1, seed: "abc" } });
    expect(fullNote(marker)).toBe(note);
  });

  it("splits the full note back into the short note and the generated html", () => {
    const marker = makeMarker({
      note: "Short note",
      generated: { kind: KIND, version: 1, seed: "abc" }
    });

    setFullNote(marker, `Changed note${generatedDivider(KIND)}<p>Edited</p>`);
    expect(marker.note).toBe("Changed note");
    expect(marker.generated?.html).toBe("<p>Edited</p>");
  });

  it("drops the recipe when the generated section is removed", () => {
    const marker = makeMarker({
      note: "Short note",
      generated: { kind: KIND, version: 1, seed: "abc", html: "<p>Generated abc</p>" }
    });

    setFullNote(marker, "Only the user text");
    expect(marker.note).toBe("Only the user text");
    expect(marker.generated).toBeUndefined();
  });

  it("clears both parts when the full note is emptied", () => {
    const marker = makeMarker({
      note: "Short note",
      generated: { kind: KIND, version: 1, seed: "abc", html: "<p>Generated abc</p>" }
    });

    setFullNote(marker, "");
    expect(marker.note).toBeUndefined();
    expect(marker.generated).toBeUndefined();
  });

  it("leaves the short note alone when no renderer is registered", () => {
    const marker = makeMarker({
      note: "Short note",
      generated: { kind: "missing-kind", version: 1, seed: "abc" }
    });
    expect(ensureGenerated(marker)).toBeUndefined();
    expect(fullNote(marker)).toBe("Short note");
  });
});
