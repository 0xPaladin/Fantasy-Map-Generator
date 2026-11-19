import { beforeEach, describe, expect, it } from "vitest";
import {
  canGenerateProfile,
  createGeneratedContent,
  ensureGenerated,
  fullNote,
  generatedDivider,
  regenerateGenerated,
  registerGeneratedKind,
  requireGeneratedRecipe,
  setFullNote
} from "./marker-content";
import type { Marker } from "./markers-generator";

const KIND = "test-content";
const MARKER_TYPE = "test-content-marker";

const makeMarker = (overrides: Partial<Marker> = {}): Marker =>
  ({
    i: 1,
    type: MARKER_TYPE,
    icon: "",
    x: 0,
    y: 0,
    cell: 0,
    name: "Test site",
    ...overrides
  }) as Marker;

beforeEach(() => {
  registerGeneratedKind(KIND, {
    markerTypes: [MARKER_TYPE],
    create: () => ({ kind: KIND, version: 1, seed: "created" }),
    render: (_marker, content, salt) => `<p>Generated ${salt ?? content.seed}</p>`
  });
});

describe("marker generated content", () => {
  it("does nothing without a generated recipe", () => {
    const marker = makeMarker({ note: "Short note", type: "other" });
    expect(ensureGenerated(marker)).toBeUndefined();
    expect(fullNote(marker)).toBe("Short note");
  });

  it("creates a recipe for an older marker from its registered type", () => {
    const marker = makeMarker();
    expect(canGenerateProfile(marker)).toBe(true);
    expect(createGeneratedContent(marker)).toEqual({ kind: KIND, version: 1, seed: "created" });
    expect(canGenerateProfile(makeMarker({ type: "other" }))).toBe(false);
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

  it("rerenders an existing recipe with a salt", () => {
    const marker = makeMarker({ generated: { kind: KIND, version: 1, seed: "abc" } });
    expect(regenerateGenerated(marker, "reroll")).toBe("<p>Generated reroll</p>");
    expect(marker.generated?.html).toBe("<p>Generated reroll</p>");
  });

  it("appends the generated section under a stable divider", () => {
    const marker = makeMarker({
      note: "Short note",
      generated: { kind: KIND, version: 1, seed: "abc" }
    });
    expect(fullNote(marker)).toBe(`Short note${generatedDivider(KIND)}<p>Generated abc</p>`);
  });

  it("uses a ruin heading for ruin content", () => {
    expect(generatedDivider("ruin")).toBe("<hr><h3>Ruin profile</h3>");
  });

  it("uses headings for the underworld kinds", () => {
    expect(generatedDivider("cave")).toBe("<hr><h3>Cave profile</h3>");
    expect(generatedDivider("burial")).toBe("<hr><h3>Burial profile</h3>");
    expect(generatedDivider("necropolis")).toBe("<hr><h3>Necropolis profile</h3>");
  });

  it("uses headings for the creature kinds", () => {
    expect(generatedDivider("beast")).toBe("<hr><h3>Beast profile</h3>");
    expect(generatedDivider("monster")).toBe("<hr><h3>Monster profile</h3>");
    expect(generatedDivider("bandit")).toBe("<hr><h3>Bandit profile</h3>");
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

describe("generated recipes", () => {
  it("accepts a seed and flat metadata", () => {
    expect(
      requireGeneratedRecipe({
        kind: "ruin",
        version: 1,
        seed: "seed",
        meta: { tier: "village", fallYear: 512, looted: true }
      })
    ).toEqual({
      kind: "ruin",
      version: 1,
      seed: "seed",
      meta: { tier: "village", fallYear: 512, looted: true }
    });
  });

  it("rejects malformed recipes and nested metadata", () => {
    expect(() => requireGeneratedRecipe(null)).toThrow("must be an object");
    expect(() => requireGeneratedRecipe({ kind: "", version: 1, seed: "x" })).toThrow("kind");
    expect(() => requireGeneratedRecipe({ kind: "ruin", version: 0, seed: "x" })).toThrow("version");
    expect(() => requireGeneratedRecipe({ kind: "ruin", version: 1, seed: "" })).toThrow("seed");
    expect(() => requireGeneratedRecipe({ kind: "ruin", version: 1, seed: "x", meta: { nested: { a: 1 } } })).toThrow(
      "meta nested"
    );
  });
});
