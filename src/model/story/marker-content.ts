// Lazy generated marker content. A marker stores the generator seed only; the html is built on first read.
import type { Marker } from "@/model/story/markers-generator";

export interface MarkerGeneratedContent {
  /** the generator that owns this content: "dungeon" first, later "ruin", "monster", … */
  kind: string;
  /** bump when the generator output changes; lets a migration invalidate cached html */
  version: number;
  /** stable input for the generator; enough to rebuild the content */
  seed: string;
  /** small generator input such as history context; never html */
  meta?: Record<string, string | number | boolean>;
  /** rendered notes-subset HTML; absent until the content is first read */
  html?: string;
}

export type MarkerGeneratedRecipe = Omit<MarkerGeneratedContent, "html">;

export interface GeneratedKind {
  /** marker types that create this kind when an older marker has no generated recipe */
  markerTypes?: readonly string[];
  /** create the recipe for a marker that predates generated content */
  create?: (marker: Marker) => MarkerGeneratedRecipe | undefined;
  /** render with a salt for manual rerolls; no salt is the normal read */
  render: (marker: Marker, content: MarkerGeneratedContent, salt?: string) => string;
}

const kinds = new Map<string, GeneratedKind>();
const typeToKind = new Map<string, string>();
const HEADINGS: Record<string, string> = {
  dungeon: "Dungeon profile",
  ruin: "Ruin profile",
  cave: "Cave profile",
  burial: "Burial profile",
  necropolis: "Necropolis profile",
  beast: "Beast profile",
  monster: "Monster profile",
  bandit: "Bandit profile"
};

/** Register one generated content kind and the marker types that create it */
export function registerGeneratedKind(kind: string, handler: GeneratedKind): void {
  if (!kind.trim()) throw new Error("The generated content kind must not be empty");
  if (typeof handler.render !== "function") throw new Error("The generated kind needs a renderer");
  kinds.set(kind, handler);
  for (const type of handler.markerTypes ?? []) typeToKind.set(type, kind);
}

/** The generated kind a marker type would create when it has no recipe yet */
export function generatedKindForType(type: string | undefined): string | undefined {
  return type ? typeToKind.get(type) : undefined;
}

/** Whether the marker can create or reroll a generated profile */
export function canGenerateProfile(marker: Pick<Marker, "type" | "generated">): boolean {
  return Boolean((marker.generated && kinds.has(marker.generated.kind)) || generatedKindForType(marker.type));
}

/** Create a recipe for an older marker that has no generated content yet */
export function createGeneratedContent(marker: Marker, kind?: string): MarkerGeneratedContent | undefined {
  const target = kind ?? generatedKindForType(marker.type);
  if (!target) return undefined;
  const recipe = kinds.get(target)?.create?.(marker);
  if (!recipe) return undefined;
  return { ...recipe, kind: recipe.kind || target };
}

/** Re-render an existing recipe; used by manual rerolls */
export function regenerateGenerated(marker: Marker, salt?: string): string | undefined {
  const content = marker.generated;
  if (!content) return undefined;
  const handler = kinds.get(content.kind);
  if (!handler) return undefined;
  const html = handler.render(marker, content, salt);
  content.html = html;
  return html;
}

/** Validate the small recipe a caller may attach while placing a marker */
export function requireGeneratedRecipe(value: unknown): MarkerGeneratedRecipe {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("The generated content must be an object");

  const { kind, version, seed, meta } = value as Partial<MarkerGeneratedRecipe>;
  if (typeof kind !== "string" || !kind.trim()) throw new Error("The generated content kind must not be empty");
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
    throw new Error("The generated content version must be a positive whole number");
  if (typeof seed !== "string" || !seed.trim()) throw new Error("The generated content seed must not be empty");
  if (meta !== undefined) {
    if (typeof meta !== "object" || meta === null || Array.isArray(meta))
      throw new Error("The generated content meta must be an object");
    for (const [key, item] of Object.entries(meta)) {
      if (!["string", "number", "boolean"].includes(typeof item))
        throw new Error(`The generated content meta ${key} must be a string, number or boolean`);
    }
  }

  return { kind: kind.trim(), version, seed, ...(meta ? { meta: { ...meta } } : {}) };
}

export function generatedHeading(kind: string): string {
  return HEADINGS[kind] ?? "Generated content";
}

export function generatedDivider(kind: string): string {
  return `<hr><h3>${generatedHeading(kind)}</h3>`;
}

/** Build and cache a marker's generated html when it is missing; a missing renderer returns undefined */
export function ensureGenerated(marker: Marker, { cache = true }: { cache?: boolean } = {}): string | undefined {
  const content = marker.generated;
  if (!content) return undefined;
  if (content.html !== undefined) return content.html;

  const renderer = kinds.get(content.kind)?.render;
  if (!renderer) return undefined;

  const html = renderer(marker, content);
  if (cache) content.html = html;
  return html;
}

/** The note as the reader sees it: the short note plus the lazily generated section */
export function fullNote(marker: Marker, options: { cache?: boolean } = {}): string {
  const note = marker.note ?? "";
  const content = marker.generated;
  if (!content) return note;

  const divider = generatedDivider(content.kind);
  if (note.includes(divider)) return note;

  const html = ensureGenerated(marker, options);
  return html ? `${note}${divider}${html}` : note;
}

/** Split a full note back into the short note and the generated section */
export function setFullNote(marker: Marker, html: string): void {
  const content = marker.generated;
  if (!content) {
    if (html) marker.note = html;
    else delete marker.note;
    return;
  }

  const divider = generatedDivider(content.kind);
  const index = html.indexOf(divider);
  if (index === -1) {
    // the generated section was removed or its heading rewritten: keep the text, drop the recipe
    if (html) marker.note = html;
    else delete marker.note;
    delete marker.generated;
    return;
  }

  const note = html.slice(0, index);
  const generated = html.slice(index + divider.length);
  if (note) marker.note = note;
  else delete marker.note;

  if (generated) content.html = generated;
  else delete marker.generated;
}
