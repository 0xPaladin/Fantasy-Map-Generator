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
  DUNGEON_INHABITANT_WEIGHTS,
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
  DUNGEON_TREASURE_AREA_MODIFIERS,
  DUNGEON_TREASURE_BUILDER_MODIFIERS,
  DUNGEON_TREASURE_LAIR_MODIFIERS,
  DUNGEON_TREASURE_THEME_MODIFIERS,
  DUNGEON_TREASURE_WEIGHTS,
  DUNGEON_TYPE_TABLES,
  DUNGEON_TYPES,
  type DungeonSize,
  type DungeonTypeId,
  type Safety,
  type SpecialAreaEntry
} from "@/data/dungeons";
import {
  INHABITANT_GROUPS,
  INHABITANT_RELATIONS,
  type InhabitantGroup,
  type InhabitantGroupId
} from "@/data/inhabitants";
import { TREASURE_CATEGORIES, type TreasureShares } from "@/data/treasure";
import type { SiteInhabitants, SiteRatings } from "@/model/story/site-profile";
import { annotateTreasureCaches, applyTreasureModifiers, normalizeTreasureShares } from "@/model/story/treasure";
import type { MarkerDelveState } from "@/types/delves";
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

export interface DungeonOverrides {
  type?: DungeonTypeId;
  size?: DungeonSize;
  areaCount?: number;
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
  ratings: SiteRatings;
  inhabitants: SiteInhabitants;
  treasure: { shares: TreasureShares };
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

const SIZE_RANK: Record<DungeonSize, number> = { small: 1, medium: 2, large: 3, huge: 4 };
const SIZE_SCALE: Record<DungeonSize, number> = { small: 1, medium: 3, large: 5, huge: 7 };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const countMatching = (values: readonly string[], pattern: RegExp): number =>
  values.filter(value => pattern.test(value)).length;

function chooseInhabitantGroup(rng: Rng, type: DungeonTypeId, excluded?: InhabitantGroupId): InhabitantGroup {
  const weights = DUNGEON_INHABITANT_WEIGHTS[type];
  const weighted = INHABITANT_GROUPS.filter(group => group.id !== excluded)
    .map(group => ({ value: group, weight: weights[group.id] ?? 0 }))
    .filter(({ weight }) => weight > 0);

  if (weighted.length) return pickWeighted(rng, weighted);
  const fallback = INHABITANT_GROUPS.filter(group => group.id !== excluded);
  return pick(rng, fallback.length ? fallback : INHABITANT_GROUPS);
}

function inhabitantLabel(group: InhabitantGroup, cultureName: string): string {
  const culture = cultureName && cultureName !== "the local folk" ? cultureName : "";
  if (group.id === "humans") return culture ? `${culture} humans` : group.label;
  if (group.id === "humanoids") return culture ? `${culture} humanoids` : group.label;
  return group.label;
}

function treasureComposition(
  type: DungeonTypeId,
  builder: string,
  overview: { label: string; value: string }[],
  themes: string[],
  areas: DungeonArea[]
): TreasureShares {
  const weights = { ...DUNGEON_TREASURE_WEIGHTS[type] };
  const occupant = overview.find(({ label }) => label === "Main occupant")?.value ?? "";
  applyTreasureModifiers(weights, DUNGEON_TREASURE_BUILDER_MODIFIERS, [builder]);
  applyTreasureModifiers(weights, DUNGEON_TREASURE_LAIR_MODIFIERS, [occupant]);
  applyTreasureModifiers(weights, DUNGEON_TREASURE_THEME_MODIFIERS, themes);
  applyTreasureModifiers(
    weights,
    DUNGEON_TREASURE_AREA_MODIFIERS,
    areas.map(area => area.type)
  );
  return normalizeTreasureShares(weights);
}

function rollInhabitants(
  rng: Rng,
  type: DungeonTypeId,
  size: DungeonSize,
  areaCount: number,
  areas: DungeonArea[],
  cultureName: string
): SiteInhabitants {
  const first = chooseInhabitantGroup(rng, type);
  const groups = [first];
  if (rng.chance(0.5)) groups.push(chooseInhabitantGroup(rng, type, first.id));

  const dangers = areas.flatMap(area => area.dangers);
  const hasLeader = dangers.some(danger => danger.startsWith("Leader:"));
  const crowded = dangers.length >= areaCount;
  const rating = clamp(SIZE_RANK[size] + (groups.length === 2 ? 1 : 0) + (crowded ? 1 : 0) + (hasLeader ? 1 : 0), 1, 6);

  return {
    rating,
    groups: groups.map(group => ({ ...group, label: inhabitantLabel(group, cultureName) })),
    relationship: groups.length === 2 ? pick(rng, INHABITANT_RELATIONS) : undefined
  };
}

function rollRatings(
  size: DungeonSize,
  areaCount: number,
  themes: string[],
  alignment: Alignment,
  safety: Safety,
  type: DungeonTypeId,
  accessibility: string,
  builder: string,
  areas: DungeonArea[]
): SiteRatings {
  const dangers = areas.flatMap(area => area.dangers);
  const discoveries = areas.flatMap(area => area.discoveries);
  const areaTypes = areas.map(area => area.type);

  const safetyBase = { safe: 1, unsafe: 2, dangerous: 3, perilous: 4 }[safety];
  const dangerDensity = Math.min(3, Math.floor((dangers.length / Math.max(1, areaCount)) * 2));
  const leaders = countMatching(dangers, /^Leader:/);
  const monstrous = dangers.filter(
    danger =>
      danger.startsWith("Creature:") &&
      /extraplanar|undead|elemental|ooze|construct|fey|dragon|giant|horror|legendary/i.test(danger)
  ).length;
  const danger = clamp(safetyBase + dangerDensity + (leaders ? 1 : 0) + (monstrous ? 1 : 0), 1, 10);

  const caches = countMatching(discoveries, /treasure cache/i);
  const richType = ["mine", "crypt", "temple", "stronghold", "lair"].includes(type);
  const richArea = countMatching(areaTypes, /treasure|vault|hoard|mother lode|reliquary|strongroom/i) > 0;
  const treasure = clamp(SIZE_RANK[size] + Math.min(4, caches) + (richType ? 1 : 0) + (richArea ? 1 : 0), 1, 10);

  const grandBuilder = /otherworldly|extraplanar|sorcerer-king|monarch|warlord/i.test(builder);
  const scale = clamp(SIZE_SCALE[size] + Math.floor(areaCount / 10) + (grandBuilder ? 1 : 0), 1, 10);

  const accessibilityBase = accessibility.includes("sealed")
    ? 4
    : /hidden|concealed|buried/.test(accessibility)
      ? 3
      : accessibility.includes("partly")
        ? 2
        : 1;
  const mysteryThemes = countMatching(
    themes,
    /secret|mystery|forbidden|cryptic|shadow|madness|prophecy|transformation|inversion|imitation|knowledge|divine/i
  );
  const clues = countMatching(
    discoveries,
    /map|message|clue|inscription|epitaph|omen|record|pictograph|warning|letter|books|scrolls|charts|formulae|notebook/i
  );
  const hiddenAreas = countMatching(
    areaTypes,
    /secret|hidden|vault|sanctum|oracle|labyrinth|maze|catacomb|archive|library|burial/i
  );
  const mysteriousType = ["temple", "laboratory", "unknown", "crypt"].includes(type);
  const mystery = clamp(
    accessibilityBase +
      Math.min(2, mysteryThemes) +
      Math.min(2, clues) +
      (hiddenAreas ? 1 : 0) +
      (mysteriousType ? 1 : 0),
    1,
    10
  );

  const weirdThemes = countMatching(
    themes,
    /magic|element|strange|cosmic|alien|elder|insane|wild|transformation|shadow|spirit|divine|plane|curse|fey/i
  );
  const weirdAreas = countMatching(
    areaTypes,
    /strange|portal|summon|gateway|vault of|sanctum|oracle|vivification|preservation|foresight|laboratory|crystal|underground lake|lava/i
  );
  const weirdType = type === "laboratory" ? 2 : ["unknown", "temple"].includes(type) ? 1 : 0;
  const weirdAlignment = alignment === "chaotic" || alignment === "evil" ? 1 : 0;
  const weirdness = clamp(1 + Math.min(3, weirdThemes) + Math.min(3, weirdAreas) + weirdType + weirdAlignment, 1, 10);

  return { danger, treasure, scale, mystery, weirdness };
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

export function generateDungeonProfile(
  context: DungeonContext,
  salt = "",
  overrides: DungeonOverrides = {}
): DungeonProfile {
  const rng = createRng(`${context.seed}:dungeon:${context.cell}${salt ? `:${salt}` : ""}`);
  const generatedName = rollName(rng, context);
  const name = overrides.name?.trim() || context.name?.trim() || generatedName;
  const size = overrides.size
    ? (DUNGEON_SIZES.find(row => row.size === overrides.size) ?? pick(rng, DUNGEON_SIZES))
    : pick(rng, DUNGEON_SIZES);
  const areaCount = overrides.areaCount ?? rollDice(rng, size.areas);

  const outcome = pick(rng, DUNGEON_ALIGNMENT[context.alignment] ?? DUNGEON_ALIGNMENT.neutral);
  const type = overrides.type ?? pick(rng, DUNGEON_TYPES);
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
  const treasure = { shares: treasureComposition(type, builder, overview, themes, areas) };
  annotateTreasureCaches(rng, areas, treasure.shares);
  const inhabitants = rollInhabitants(rng, type, size.size, areaCount, areas, context.cultureName);
  const ratings = rollRatings(
    size.size,
    areaCount,
    themes,
    outcome.alignment,
    outcome.safety,
    type,
    accessibility,
    builder,
    areas
  );
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
    ratings,
    inhabitants,
    treasure,
    areas,
    rumors
  };
}

export function renderDungeonProfile(profile: DungeonProfile, delve?: Pick<MarkerDelveState, "status">): string {
  const e = escapeHtml;
  const cleared = delve?.status === "cleared";
  const overview = profile.overview
    .map(({ label, value }) => `<li><strong>${e(label)}:</strong> ${e(value)}</li>`)
    .join("");
  const themes = profile.themes.map(theme => `<li>${e(theme)}</li>`).join("");
  const areas = profile.areas
    .map(area => {
      const discoveries = area.discoveries.length
        ? `<br><em>Discoveries:</em> ${area.discoveries
            .map(discovery => e(cleared ? discovery.replace(/treasure cache/i, "plundered cache") : discovery))
            .join("; ")}`
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
  const ratings = [
    `<strong>Danger</strong> ${profile.ratings.danger}/10`,
    `<strong>Treasure</strong> ${cleared ? "0/10 (depleted)" : `${profile.ratings.treasure}/10`}`,
    `<strong>Scale</strong> ${profile.ratings.scale}/10`,
    `<strong>Mystery</strong> ${profile.ratings.mystery}/10`,
    `<strong>Weirdness</strong> ${profile.ratings.weirdness}/10`
  ].join(" · ");
  const treasureMix = TREASURE_CATEGORIES.filter(category => profile.treasure.shares[category] > 0)
    .map(category => `${capitalize(category)} ${profile.treasure.shares[category]}%`)
    .join(" · ");
  const inhabitants = `<strong>Inhabitants</strong> ${profile.inhabitants.rating}/6 (d6 ≤ ${
    profile.inhabitants.rating
  } each turn) · ${profile.inhabitants.groups.map(group => e(group.label)).join(" + ")}${
    profile.inhabitants.relationship ? ` (${e(profile.inhabitants.relationship)})` : ""
  }`;

  return [
    `<h3>${e(profile.name)}</h3>`,
    `<p><em>${capitalize(profile.size)} dungeon · ${profile.areaCount} areas · ${profile.themes.length} themes</em></p>`,
    `<p><strong>${capitalize(profile.alignment)}</strong> · <strong>${e(profile.safety)}</strong> · ${e(
      DUNGEON_TYPE_TABLES[profile.type].label
    )}</p>`,
    cleared
      ? "<p><strong>Cleared.</strong> The halls are emptied and the caches picked over.</p>"
      : delve?.status === "weakened"
        ? "<p><strong>Weakened.</strong> Its master is gone; the survivors keep to the dark.</p>"
        : "",
    `<p>${ratings}</p>`,
    `<p><strong>Treasure mix</strong> — ${treasureMix}</p>`,
    `<p>${inhabitants}</p>`,
    `<h4>Overview</h4><ul>${overview}</ul>`,
    `<h4>Themes</h4><ul>${themes}</ul>`,
    `<h4>Areas</h4><ol>${areas}</ol>`,
    `<h4>Rumors</h4><ul>${rumors}</ul>`,
    "<p><em>Alternate dungeon profile.</em></p>"
  ].join("");
}
