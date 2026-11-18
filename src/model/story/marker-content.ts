// Lazy generated marker content. A marker stores the generator seed only; the html is built on first read.
import type { Marker } from "@/model/story/markers-generator";

export interface MarkerGeneratedContent {
  /** the generator that owns this content: "dungeon" first, later "ruin", "monster", … */
  kind: string;
  /** bump when the generator output changes; lets a migration invalidate cached html */
  version: number;
  /** stable input for the generator; enough to rebuild the content */
  seed: string;
  /** rendered notes-subset HTML; absent until the content is first read */
  html?: string;
}

export type GeneratedRenderer = (marker: Marker, content: MarkerGeneratedContent) => string;

const renderers = new Map<string, GeneratedRenderer>();
const HEADINGS: Record<string, string> = { dungeon: "Dungeon profile" };

/** Register the renderer for one generated content kind */
export function registerGeneratedRenderer(kind: string, renderer: GeneratedRenderer): void {
  if (!kind.trim()) throw new Error("The generated content kind must not be empty");
  renderers.set(kind, renderer);
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

  const renderer = renderers.get(content.kind);
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
