// Argument checks for model edits: return the clean value or throw a readable error

/** A usable entity name: trimmed and not empty */
export const requireName = (name: unknown): string => {
  const value = typeof name === "string" ? name.trim() : "";
  if (!value) throw new Error("The name must not be empty");
  return value;
};

/** Adjustments: { name, value } lines, names trimmed and values rounded to cents */
export const requireAdjustments = (lines: unknown): { name: string; value: number }[] => {
  if (!Array.isArray(lines)) throw new Error("Adjustments must be a list of { name, value } lines");
  return lines.map(({ name, value } = {}) => {
    if (typeof name !== "string") throw new Error("An adjustment's name must be text");
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("An adjustment's value must be a number");
    return { name: name.trim(), value: Math.round(value * 100) / 100 };
  });
};

/** One of the allowed values, or a readable error listing them */
export const requireOneOf = <T extends string>(value: unknown, allowed: readonly T[], label: string): T => {
  if (!allowed.includes(value as T)) throw new Error(`${label} must be one of: ${allowed.join(", ")}`);
  return value as T;
};

interface Rooted {
  i: number;
  removed?: boolean;
  origins?: (number | null)[] | null;
}

/** Origins for an entity: the first is primary (0 = top level), the rest secondary. None may descend from it */
export function requireOrigins(list: Rooted[], id: number, origins: number[]): number[] {
  if (!Array.isArray(origins) || !origins.length) throw new Error("Name at least one origin; 0 is the top level");
  const unique = [...new Set(origins)];
  const ancestors = (from: number, seen = new Set<number>()): Set<number> => {
    for (const origin of list[from]?.origins ?? []) {
      if (!origin || seen.has(origin)) continue;
      seen.add(origin);
      ancestors(origin, seen);
    }
    return seen;
  };
  for (const [index, origin] of unique.entries()) {
    if (origin === 0 && !index) continue;
    const entity = list[origin];
    if (!Number.isInteger(origin) || !origin || !entity || entity.removed || entity.i !== origin)
      throw new Error(`Origin ${origin} does not exist; only the primary origin may be 0, the top level`);
    if (origin === id || ancestors(origin).has(id))
      throw new Error(`${origin} descends from ${id} and cannot be its origin`);
  }
  return unique;
}

/** A short code of 1 to 3 characters */
export function requireCode(code: unknown): string {
  const value = typeof code === "string" ? code.trim() : "";
  if (!value || value.length > 3) throw new Error("The code must be 1 to 3 characters");
  return value;
}

/** Whether html keeps to the notes editor's subset: no event handlers, JavaScript URLs, scripts or iframes */
export function isSafeHtml(html: string): boolean {
  return canUseDom() ? isSafeHtmlByDom(html) : isSafeHtmlByScan(html);
}

const NOTE_TAGS = new Set(
  "p div br hr span strong b em i u s strike a img ol ul li blockquote code h1 h2 h3 h4 h5 h6 sub sup table tbody tr td".split(
    " "
  )
);
const NOTE_ATTRIBUTES = new Set(["href", "src", "alt", "title", "style", "colspan", "rowspan"]);
const UNSAFE_STYLE = /url\s*\(|expression\s*\(|@import/i;

function canUseDom(): boolean {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

/** A link attribute's value: relative, or an allowed absolute scheme */
function isSafeUrl(name: string, value: string): boolean {
  const compact = [...value].filter(character => character.charCodeAt(0) > 32).join("");
  if (!/^[a-z][a-z\d+.-]*:/i.test(compact)) return true;
  return name === "src"
    ? /^(?:https?:|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(compact)
    : /^(?:https?|mailto):/i.test(compact);
}

/** Whether one attribute of an allowed tag is allowed */
function isSafeAttribute(rawName: string, value: string): boolean {
  const name = rawName.toLowerCase();
  if (!NOTE_ATTRIBUTES.has(name)) return false;
  if (name === "style") return !UNSAFE_STYLE.test(value);
  if (name !== "href" && name !== "src") return true;
  return isSafeUrl(name, value.trim());
}

/** The check with a real DOM: the browser and jsdom path */
function isSafeHtmlByDom(html: string): boolean {
  const template = document.createElement("template");
  template.innerHTML = html;
  return [...template.content.querySelectorAll("*")].every(
    element =>
      NOTE_TAGS.has(element.localName) &&
      [...element.attributes].every(attribute => isSafeAttribute(attribute.name, attribute.value))
  );
}

/**
 * The same check without a DOM, for the node test runners and scripts that stub `document`
 * without a parser: anything the scan cannot read as an allowed tag is refused.
 */
function isSafeHtmlByScan(html: string): boolean {
  const TAG = /<\s*(\/?)\s*([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
  let unread = ""; // text and anything the tag pattern could not read
  let index = 0;

  for (let match = TAG.exec(html); match; match = TAG.exec(html)) {
    unread += html.slice(index, match.index);
    index = TAG.lastIndex;
    const [, closing, rawName, rawAttributes = ""] = match;
    if (!NOTE_TAGS.has(rawName.toLowerCase())) return false;
    // a closing tag takes no attributes: `<br/>` is an opening one
    if (closing && rawAttributes.replaceAll(/\s/g, "") !== "") return false;
    if (!closing && !attributesAreSafe(rawAttributes)) return false;
  }

  unread += html.slice(index);
  return !unread.includes("<"); // a comment, an unclosed tag or any other markup the scan skipped
}

function attributesAreSafe(raw: string): boolean {
  const cleaned = raw.replace(/\/\s*$/, ""); // a self-closing slash
  const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let index = 0;
  const skipSpaces = () => {
    while (index < cleaned.length && /\s/.test(cleaned[index])) index++;
  };

  skipSpaces();
  for (let match = ATTR.exec(cleaned); match; match = ATTR.exec(cleaned)) {
    if (match.index !== index) return false; // something unreadable between attributes
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!isSafeAttribute(match[1], value)) return false;
    index = ATTR.lastIndex;
    skipSpaces();
    ATTR.lastIndex = index;
  }

  skipSpaces();
  return index === cleaned.length;
}
