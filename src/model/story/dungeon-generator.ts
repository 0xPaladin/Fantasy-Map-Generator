// Deterministic dungeon profiles over the generic tables in data/dungeons.ts

import type { Alignment } from "@/data/culture-traits";
import {
  type AreaTypeEntry,
  type DiceSpec,
  type Direction,
  DUNGEON_ACCESSIBILITY,
  DUNGEON_ALIGNMENT,
  DUNGEON_ANIMALS,
  DUNGEON_AREA_CONTENTS,
  DUNGEON_BUILDERS,
  DUNGEON_CAUSES,
  DUNGEON_CONDITIONS,
  DUNGEON_DANGER_CATEGORIES,
  DUNGEON_DETAILS,
  DUNGEON_EXITS,
  DUNGEON_HAZARD_KINDS,
  DUNGEON_HAZARDS,
  DUNGEON_HUMANOIDS,
  DUNGEON_LEADER_KINDS,
  DUNGEON_LEADERS,
  DUNGEON_MONSTERS,
  DUNGEON_NAME_PARTS,
  DUNGEON_NAME_TEMPLATES,
  DUNGEON_RUMOR_TEMPLATES,
  DUNGEON_SITUATIONS,
  DUNGEON_SIZES,
  DUNGEON_THEME_CATEGORIES,
  DUNGEON_THEMES,
  DUNGEON_TYPE_TABLES,
  DUNGEON_TYPES,
  type DungeonSize,
  type DungeonTypeId,
  type Safety,
  type SpecialAreaEntry
} from "@/data/dungeons";
import { createRng, type Rng } from "@/utils/rng";
import { capitalize, escapeHtml } from "@/utils/string-utils";

export interface DungeonContext {
  seed: string;
  cell: number;
  cultureName: string;
  alignment: Alignment;
  biomeName: string;
  height: number;
  stateName?: string;
  provinceName?: string;
  religionName?: string;
  /** marker name override, so a user rename wins over the generated name */
  name?: string;
}

export interface DungeonExit {
  to: number | "open";
  direction: Direction;
  form: string;
}

export interface DungeonArea {
  number: number;
  type: string;
  kind: DungeonTypeId;
  dressing: string;
  discoveries: string[];
  dangers: string[];
  exits: DungeonExit[];
}

export interface DungeonProfile {
  name: string;
  size: DungeonSize;
  areaCount: number;
  themes: string[];
  alignment: Alignment;
  safety: Safety;
  type: DungeonTypeId;
  overview: { label: string; value: string }[];
  areas: DungeonArea[];
  rumors: string[];
}

type TokenValues = {
  element: string;
  magic: string;
  strange: string;
  aspect: string;
  culture: string;
  name: string;
  biome: string;
  cause: string;
  builder: string;
  theme: string;
  type: string;
  safety: string;
};

const d = (rng: Rng, sides: number) => rng.int(1, sides);

const pick = <T>(rng: Rng, table: readonly T[]): T => {
  if (!table.length) throw new Error("Cannot pick from an empty table");
  return table[d(rng, table.length) - 1];
};

const pickPercent = <T>(rng: Rng, table: readonly T[]): T => {
  if (!table.length) throw new Error("Cannot pick from an empty table");
  return table[Math.min(table.length - 1, Math.floor(((d(rng, 100) - 1) * table.length) / 100))];
};

const pickWeighted = <T>(rng: Rng, table: readonly { value: T; weight: number }[]): T => {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = d(rng, total);
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return table[table.length - 1].value;
};

const rollDice = (rng: Rng, spec: DiceSpec): number => {
  let total = spec.add ?? 0;
  for (let i = 0; i < spec.count; i++) total += d(rng, spec.sides);
  return total;
};

const resolveText = (text: string, tokens: TokenValues): string =>
  text.replace(
    /\[(element|magic|strange|aspect|culture|name|biome|cause|builder|theme|type|safety)\]/gi,
    (_match, key: string) => tokens[key.toLowerCase() as keyof TokenValues] ?? ""
  );

const withArticle = (phrase: string): string => `${/^[aeiou]/i.test(phrase) ? "an" : "a"} ${phrase}`;

const makeTokens = (
  rng: Rng,
  context: DungeonContext,
  name: string,
  cause: string,
  builder: string,
  theme: string,
  type: DungeonTypeId,
  safety: Safety
): TokenValues => {
  const element = pick(rng, DUNGEON_DETAILS.elements);
  const magic = pick(rng, DUNGEON_DETAILS.magic).replace("[element]", element);
  return {
    element,
    magic,
    strange: pick(rng, DUNGEON_DETAILS.strange),
    aspect: pick(rng, DUNGEON_DETAILS.aspects),
    culture: context.cultureName || "the local folk",
    name,
    biome: context.biomeName || "wilderness",
    cause,
    builder,
    theme,
    type: DUNGEON_TYPE_TABLES[type].label,
    safety
  };
};

function rollName(rng: Rng, context: DungeonContext): string {
  const template = pick(rng, DUNGEON_NAME_TEMPLATES);
  const values: Record<string, string> = {
    PLACE: pickPercent(rng, DUNGEON_NAME_PARTS.places),
    ADJECTIVE: pickPercent(rng, DUNGEON_NAME_PARTS.adjectives),
    NOUN: pickPercent(rng, DUNGEON_NAME_PARTS.nouns),
    NAME: context.cultureName || "the lost land"
  };
  return template
    .replace(/\[(PLACE|ADJECTIVE|NOUN|NAME)\]/g, (_match, key: string) => values[key])
    .replace(/\s+/g, " ")
    .trim();
}

function rollThemes(rng: Rng, count: number, tokens: TokenValues): string[] {
  const themes: string[] = [];
  for (let guard = 0; guard < count * 10 && themes.length < count; guard++) {
    const roll = d(rng, 20);
    const category =
      DUNGEON_THEME_CATEGORIES.find(({ min, max }) => roll >= min && roll <= max)?.category ?? "mysterious";
    let theme: string = pick(rng, DUNGEON_THEMES[category]);
    if (theme.startsWith("[grim]")) theme = `${pick(rng, DUNGEON_THEMES.grim)} (heightened)`;
    theme = resolveText(theme, tokens);
    if (!themes.includes(theme)) themes.push(theme);
  }

  for (const fallback of [...DUNGEON_THEMES.grim, ...DUNGEON_THEMES.mysterious]) {
    if (themes.length >= count) break;
    const theme = resolveText(fallback, tokens);
    if (!themes.includes(theme)) themes.push(theme);
  }

  return themes.slice(0, count);
}

function rollOverview(rng: Rng, type: DungeonTypeId, tokens: TokenValues) {
  return DUNGEON_TYPE_TABLES[type].overview.map(({ label, entries }) => ({
    label,
    value: resolveText(pick(rng, entries), tokens)
  }));
}

function randomAreaType(rng: Rng, exclude?: DungeonTypeId): DungeonTypeId {
  const candidates = DUNGEON_TYPES.filter(type => type !== exclude);
  return pick(rng, candidates);
}

function rollSpecialArea(
  rng: Rng,
  source: DungeonTypeId,
  tokens: TokenValues,
  depth: number
): { type: string; kind: DungeonTypeId } {
  if (depth > 2) return { type: "plain chamber", kind: source };
  const entry: SpecialAreaEntry = pick(rng, DUNGEON_TYPE_TABLES[source].specialAreas);
  if (typeof entry === "string") return { type: resolveText(entry, tokens), kind: source };
  const next = entry.source === "random" ? randomAreaType(rng, source) : entry.source;
  return rollSpecialArea(rng, next, tokens, depth + 1);
}

function rollAreaType(
  rng: Rng,
  source: DungeonTypeId,
  tokens: TokenValues,
  depth: number
): { type: string; kind: DungeonTypeId } {
  if (depth > 2) return { type: "plain chamber", kind: source };
  const entry: AreaTypeEntry = pick(rng, DUNGEON_TYPE_TABLES[source].areaTypes);
  if (typeof entry === "string") return { type: resolveText(entry, tokens), kind: source };
  if ("special" in entry) return rollSpecialArea(rng, source, tokens, depth + 1);
  const next = entry.source === "random" ? randomAreaType(rng, source) : entry.source;
  return rollAreaType(rng, next, tokens, depth + 1);
}

function rollDressing(rng: Rng, table: readonly string[], tokens: TokenValues): string {
  const choice = pick(rng, table);
  if (!choice.includes("two details")) return resolveText(choice, tokens);
  const options = table.filter(entry => !entry.includes("two details"));
  return `${resolveText(pick(rng, options), tokens)} and ${resolveText(pick(rng, options), tokens)}`;
}

function rollDiscovery(rng: Rng, kind: DungeonTypeId, tokens: TokenValues): string {
  const table = DUNGEON_TYPE_TABLES[kind].discoveries;
  const feature = d(rng, 20) <= 8;
  const text = resolveText(pick(rng, feature ? table.features : table.finds), tokens);
  return `${feature ? "Feature" : "Find"}: ${text}`;
}

function rollDanger(rng: Rng, safetyModifier: number, tokens: TokenValues): string {
  const category = pick(rng, DUNGEON_DANGER_CATEGORIES);
  if (category === "leader") {
    const kind = pick(rng, DUNGEON_LEADER_KINDS) as keyof typeof DUNGEON_LEADERS;
    return `Leader: ${resolveText(pick(rng, DUNGEON_LEADERS[kind]), tokens)}`;
  }

  if (category === "creature") {
    const score = d(rng, 12) + safetyModifier;
    if (score <= 4) {
      const kind = resolveText(pick(rng, DUNGEON_MONSTERS), tokens);
      return `Creature: ${withArticle(`${pick(rng, DUNGEON_DETAILS.adjectives)} ${kind}`)}`;
    }
    if (score <= 10) {
      const band = d(rng, 10);
      const group = band <= 2 ? "water" : band <= 4 ? "air" : "earth";
      return `Creature: ${pick(rng, DUNGEON_ANIMALS[group])} (${group}-dwelling)`;
    }
    return `Creature: ${resolveText(pick(rng, DUNGEON_HUMANOIDS), tokens)}`;
  }

  const kind = pick(rng, DUNGEON_HAZARD_KINDS) as keyof typeof DUNGEON_HAZARDS;
  return `Hazard: ${resolveText(pick(rng, DUNGEON_HAZARDS[kind]), tokens)}`;
}

function rollArea(
  rng: Rng,
  source: DungeonTypeId,
  tokens: TokenValues,
  existingAreas: number,
  safetyModifier: number
): DungeonArea {
  const areaType = rollAreaType(rng, source, tokens, 0);
  const contents = pick(rng, DUNGEON_AREA_CONTENTS);
  const discoveries = contents.discoveries
    ? Array.from({ length: rollDice(rng, contents.discoveries) }, () => rollDiscovery(rng, areaType.kind, tokens))
    : [];
  const dangers = contents.dangers
    ? Array.from({ length: rollDice(rng, contents.dangers) }, () => rollDanger(rng, safetyModifier, tokens))
    : [];
  const dressing = rollDressing(rng, DUNGEON_TYPE_TABLES[areaType.kind].dressing, tokens);
  const exits = Array.from({ length: rollDice(rng, pick(rng, DUNGEON_EXITS)) }, () => {
    const direction = pickWeighted(rng, DUNGEON_TYPE_TABLES[areaType.kind].connections.directions);
    const form = resolveText(pick(rng, DUNGEON_TYPE_TABLES[areaType.kind].connections.forms), tokens);
    const to = direction === "back" && existingAreas > 0 ? rng.int(1, existingAreas) : "open";
    return { to, direction, form } as DungeonExit;
  });

  return { number: 0, type: areaType.type, kind: areaType.kind, dressing, discoveries, dangers, exits };
}

function buildAreas(
  rng: Rng,
  source: DungeonTypeId,
  count: number,
  tokens: TokenValues,
  safetyModifier: number
): DungeonArea[] {
  const areas: DungeonArea[] = [];
  const open: { area: DungeonArea; exit: DungeonExit }[] = [];

  for (let number = 1; number <= count; number++) {
    const area = rollArea(rng, source, tokens, areas.length, safetyModifier);
    area.number = number;

    if (areas.length) {
      const connection = open.length ? open.splice(rng.int(0, open.length - 1), 1)[0] : undefined;
      if (connection) connection.exit.to = number;
      else areas[areas.length - 1].exits.push({ to: number, direction: "forward", form: "passage" });
    }

    areas.push(area);
    for (const exit of area.exits) if (exit.to === "open") open.push({ area, exit });
  }

  return areas;
}

function rollRumors(rng: Rng, tokens: TokenValues): string[] {
  const templates = [...DUNGEON_RUMOR_TEMPLATES];
  const count = rng.int(2, 3);
  return Array.from({ length: count }, () =>
    resolveText(templates.splice(rng.int(0, templates.length - 1), 1)[0], tokens)
  );
}

export function generateDungeonName(context: DungeonContext): string {
  return rollName(createRng(`${context.seed}:dungeon:${context.cell}`), context);
}

export function generateDungeonProfile(context: DungeonContext, salt = ""): DungeonProfile {
  const rng = createRng(`${context.seed}:dungeon:${context.cell}${salt ? `:${salt}` : ""}`);
  const generatedName = rollName(rng, context);
  const name = context.name?.trim() || generatedName;
  const size = pick(rng, DUNGEON_SIZES);
  const areaCount = rollDice(rng, size.areas);

  const outcome = pick(rng, DUNGEON_ALIGNMENT[context.alignment] ?? DUNGEON_ALIGNMENT.neutral);
  const type = pick(rng, DUNGEON_TYPES);
  const accessibility = pick(rng, DUNGEON_ACCESSIBILITY);
  const builder = pick(rng, DUNGEON_BUILDERS);
  const situation = pick(rng, DUNGEON_SITUATIONS);
  const condition = pick(rng, DUNGEON_CONDITIONS);
  const cause = pick(rng, DUNGEON_CAUSES);

  const tokens = makeTokens(rng, context, name, cause, builder, "", type, outcome.safety);
  const themes = rollThemes(rng, size.themes, tokens);
  tokens.theme = themes[0] ?? "mystery";

  const overview = [
    { label: "Type", value: DUNGEON_TYPE_TABLES[type].label },
    { label: "Accessibility", value: accessibility },
    { label: "Builder", value: builder },
    { label: "Situation", value: situation },
    { label: "Condition", value: condition },
    { label: "Cause of ruin", value: cause },
    ...rollOverview(rng, type, tokens)
  ];

  // A lair borrows the area layout of another kind, as the source's lair tables do.
  const areaSource = type === "lair" ? randomAreaType(rng, "lair") : type;
  const areas = buildAreas(rng, areaSource, areaCount, tokens, outcome.modifier);
  const rumors = rollRumors(rng, tokens);

  return {
    name,
    size: size.size,
    areaCount,
    themes,
    alignment: outcome.alignment,
    safety: outcome.safety,
    type,
    overview,
    areas,
    rumors
  };
}

export function renderDungeonProfile(profile: DungeonProfile): string {
  const e = escapeHtml;
  const overview = profile.overview
    .map(({ label, value }) => `<li><strong>${e(label)}:</strong> ${e(value)}</li>`)
    .join("");
  const themes = profile.themes.map(theme => `<li>${e(theme)}</li>`).join("");
  const areas = profile.areas
    .map(area => {
      const discoveries = area.discoveries.length
        ? `<br><em>Discoveries:</em> ${area.discoveries.map(e).join("; ")}`
        : "";
      const dangers = area.dangers.length ? `<br><em>Dangers:</em> ${area.dangers.map(e).join("; ")}` : "";
      const exits = area.exits.length
        ? `<br><em>Exits:</em> ${area.exits
            .map(
              exit => `${exit.to === "open" ? "unexplored" : `area ${exit.to}`} (${exit.direction}, ${e(exit.form)})`
            )
            .join("; ")}`
        : "";
      return `<li><strong>${area.number}. ${e(area.type)}</strong> — ${e(area.dressing)}.${discoveries}${dangers}${exits}</li>`;
    })
    .join("");
  const rumors = profile.rumors.map(rumor => `<li>${e(rumor)}</li>`).join("");

  return [
    `<h3>${e(profile.name)}</h3>`,
    `<p><em>${capitalize(profile.size)} dungeon · ${profile.areaCount} areas · ${profile.themes.length} themes</em></p>`,
    `<p><strong>${capitalize(profile.alignment)}</strong> · <strong>${e(profile.safety)}</strong> · ${e(
      DUNGEON_TYPE_TABLES[profile.type].label
    )}</p>`,
    `<h4>Overview</h4><ul>${overview}</ul>`,
    `<h4>Themes</h4><ul>${themes}</ul>`,
    `<h4>Areas</h4><ol>${areas}</ol>`,
    `<h4>Rumors</h4><ul>${rumors}</ul>`,
    "<p><em>Alternate dungeon profile.</em></p>"
  ].join("");
}
