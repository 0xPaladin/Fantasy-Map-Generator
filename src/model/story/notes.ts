// Entity notes are optional HTML fields
import { ENTITY_TYPES, type EntityRef, MapEntities } from "@/model/map-entities";
import { fullNote, setFullNote } from "@/model/story/marker-content";
import type { Marker } from "@/model/story/markers-generator";
import { isSafeHtml } from "@/utils/validation-utils";

export interface NoteEntry {
  ref: EntityRef;
  key: string;
  note: string;
}

const canHaveNote = (ref: EntityRef) => (ENTITY_TYPES as readonly string[]).includes(ref.type);
const entity = (ref: EntityRef) => (canHaveNote(ref) ? MapEntities.get(ref) : undefined);
const generated = (type: string, item: ReturnType<typeof entity>) =>
  type === "marker" && Boolean((item as Marker | undefined)?.generated);

class NotesStore {
  /** The short note, without lazily generated content */
  get(ref: EntityRef): string | undefined {
    return entity(ref)?.note;
  }

  /** The full note, including lazily generated content when the entity has it */
  getFull(ref: EntityRef, { cache = true }: { cache?: boolean } = {}): string | undefined {
    const item = entity(ref);
    if (!item) return undefined;
    return ref.type === "marker" ? fullNote(item as Marker, { cache }) : item.note;
  }

  /** Set the short note, or remove the field when the html is empty. Returns false if the entity is gone */
  set(ref: EntityRef, note: string): boolean {
    const item = entity(ref);
    if (!item) return false;
    if (note) item.note = note;
    else delete item.note;
    return true;
  }

  /** Set the full note, splitting generated content back into its own field. Returns false if the entity is gone */
  setFull(ref: EntityRef, note: string): boolean {
    const item = entity(ref);
    if (!item) return false;
    if (ref.type === "marker") {
      setFullNote(item as Marker, note);
      return true;
    }
    if (note) item.note = note;
    else delete item.note;
    return true;
  }

  /** Replace an entity's note with HTML from the notes editor's subset; empty html removes the note */
  write(key: string, html: string): void {
    const ref = MapEntities.parseKey(key);
    if (!ref) throw new Error(`Entity ${key} does not exist`);
    if (!canHaveNote(ref)) throw new Error(`A ${ref.type} cannot have a note`);
    if (!entity(ref)) throw new Error(`Entity ${key} does not exist`);
    if (typeof html !== "string" || !isSafeHtml(html))
      throw new Error(
        "Note HTML must keep to the notes subset: no event handlers, JavaScript URLs, scripts or iframes"
      );
    this.set(ref, html);
  }

  /** Append to an existing note, used by the migration to collide duplicates */
  append(ref: EntityRef, note: string): boolean {
    if (!note) return true;
    const existing = this.get(ref);
    return this.set(ref, existing ? `${existing}${note}` : note);
  }

  /** Every note on the map, grouped by entity type in ENTITY_TYPES order. Does not materialize generated content */
  list(): NoteEntry[] {
    return ENTITY_TYPES.flatMap(type => {
      const entries = MapEntities.collect(type).flatMap(({ ref, entity: item }) => {
        const note = item.note ?? "";
        if (!note && !generated(type, item)) return [];
        return [{ ref, key: MapEntities.key(ref), note }];
      });
      if (type === "journey" && typeof pack !== "undefined") {
        for (const journey of pack.journeys || []) {
          for (const segment of journey.segments || []) {
            if (segment.note) {
              const ref: EntityRef = { type: "journey", id: journey.i, sub: segment.i };
              entries.push({ ref, key: MapEntities.key(ref), note: segment.note });
            }
          }
        }
      }
      return entries;
    });
  }

  /** Every note with lazily generated content materialized, for exports only */
  listFull(): NoteEntry[] {
    return this.list().map(entry => ({ ...entry, note: this.getFull(entry.ref) ?? "" }));
  }
}

export const Notes = new NotesStore();
