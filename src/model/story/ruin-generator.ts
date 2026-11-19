// Deterministic single-site ruin profiles over data/ruins.ts
import type { Alignment } from "@/data/culture-traits";
import {
  INHABITANT_GROUPS,
  INHABITANT_RELATIONS,
  type InhabitantGroup,
  type InhabitantGroupId
} from "@/data/inhabitants";
import {
  RUIN_ACCESSIBILITY,
  RUIN_AGES,
  RUIN_CAUSE_TREASURE_MODIFIERS,
  RUIN_CAUSE_WEIRDNESS,
  RUIN_CAUSES,
  RUIN_CONDITIONS,
  RUIN_DANGERS,
  RUIN_DISCOVERIES,
  RUIN_EXITS,
  RUIN_LOOTED_TREASURE_MODIFIERS,
  RUIN_NAME_PARTS,
  RUIN_NAME_TEMPLATES,
  RUIN_ORIGINS,
  RUIN_REMAINS,
  RUIN_RUMORS,
  RUIN_SECRETS,
  RUIN_SURFACE_STATES,
  RUIN_TIER_EMPTY_CHANCE,
  RUIN_TIER_INHABITANT_BASE,
  RUIN_TIERS,
  RUIN_ZONE_CONDITIONS,
  type RuinOrigin,
  type RuinSiteKind,
  type RuinTier
} from "@/data/ruins";
import { TREASURE_CATEGORIES, type TreasureShares } from "@/data/treasure";
import type { SiteInhabitants, SiteRatings } from "@/model/story/site-profile";
import { applyTreasureModifiers, normalizeTreasureShares, pickTreasureCategory } from "@/model/story/treasure";
import { createRng, type Rng } from "@/utils/rng";
import { capitalize, escapeHtml } from "@/utils/string-utils";

export interface RuinContext {
  seed: string;
  cell: number;
  cultureName: string;
  alignment: Alignment;
  biomeName: string;
  height: number;
  name?: string;
  tier?: RuinTier;
  originalName?: string;
  originalPolity?: string;
  fallYear?: number;
  cause?: string;
  looted?: boolean;
  clearedBy?: string;
  clearedFrom?: string;
}

export interface RuinSite {
  id: string;
  name: string;
  kind: RuinSiteKind;
  dungeon: boolean;
  summary: string;
}

export interface RuinZone {
  number: number;
  type: string;
  condition: string;
  discovery?: string;
  danger?: string;
  exits: string[];
}

export interface RuinProfile {
  name: string;
  originalName: string;
  tier: RuinTier;
  originalPurpose: string;
  originalPolity?: string;
  culture: string;
  age: string;
  fallYear?: number;
  cause: string;
  condition: string;
  accessibility: string;
  surfaceState: string;
  clearedBy?: string;
  ratings: SiteRatings;
  inhabitants: SiteInhabitants;
  treasure: { shares: TreasureShares };
  sites: RuinSite[];
  zones: RuinZone[];
  remains: string[];
  secrets: string[];
  rumors: string[];
}

const d = (rng: Rng, sides: number) => rng.int(1, sides);

const pick = <T>(rng: Rng, table: readonly T[]): T => {
  if (!table.length) throw new Error("Cannot pick from an empty table");
  return table[d(rng, table.length) - 1];
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

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

type TokenValues = {
  culture: string;
  name: string;
  origin: string;
  cause: string;
  biome: string;
  zone: string;
};

const fill = (text: string, values: TokenValues): string =>
  text.replace(/\[(culture|name|origin|cause|biome|zone)\]/gi, (_match, key: string) =>
    String(values[key.toLowerCase() as keyof TokenValues] ?? "")
  );

function rollName(rng: Rng, context: RuinContext): string {
  const template = pick(rng, RUIN_NAME_TEMPLATES);
  const values: Record<string, string> = {
    PLACE: pick(rng, RUIN_NAME_PARTS.places),
    ADJECTIVE: pick(rng, RUIN_NAME_PARTS.adjectives),
    NOUN: pick(rng, RUIN_NAME_PARTS.nouns),
    CULTURE: context.cultureName || "the lost folk"
  };
  return template
    .replace(/\[(PLACE|ADJECTIVE|NOUN|CULTURE)\]/g, (_match, key: string) => values[key])
    .replace(/\s+/g, " ")
    .trim();
}

function pickTier(rng: Rng, tier?: RuinTier): (typeof RUIN_TIERS)[number] {
  if (tier) return RUIN_TIERS.find(entry => entry.tier === tier) ?? RUIN_TIERS[0];
  return pickWeighted(
    rng,
    RUIN_TIERS.map(entry => ({ value: entry, weight: entry.weight }))
  );
}

function rollTreasure(origin: RuinOrigin, cause: string, looted?: boolean): TreasureShares {
  const weights = { ...origin.treasure };
  applyTreasureModifiers(weights, RUIN_CAUSE_TREASURE_MODIFIERS, [cause]);
  if (looted) applyTreasureModifiers(weights, RUIN_LOOTED_TREASURE_MODIFIERS, ["looted"]);
  return normalizeTreasureShares(weights);
}

function inhabitantLabel(group: InhabitantGroup, cultureName: string): string {
  const culture = cultureName && cultureName !== "the local folk" ? cultureName : "";
  if (group.id === "humans") return culture ? `${culture} humans` : group.label;
  if (group.id === "humanoids") return culture ? `${culture} humanoids` : group.label;
  return group.label;
}

function chooseInhabitantGroup(rng: Rng, origin: RuinOrigin, excluded?: InhabitantGroupId): InhabitantGroup {
  const weighted = INHABITANT_GROUPS.filter(group => group.id !== excluded)
    .map(group => ({ value: group, weight: origin.inhabitants[group.id] ?? 0 }))
    .filter(({ weight }) => weight > 0);

  if (weighted.length) return pickWeighted(rng, weighted);
  const fallback = INHABITANT_GROUPS.filter(group => group.id !== excluded);
  return pick(rng, fallback.length ? fallback : INHABITANT_GROUPS);
}

function rollInhabitants(
  rng: Rng,
  tier: (typeof RUIN_TIERS)[number],
  origin: RuinOrigin,
  zones: RuinZone[],
  cultureName: string
): SiteInhabitants {
  if (rng.chance(RUIN_TIER_EMPTY_CHANCE[tier.tier])) return { rating: 1, groups: [] };

  const first = chooseInhabitantGroup(rng, origin);
  const groups = [first];
  if (rng.chance(0.5)) groups.push(chooseInhabitantGroup(rng, origin, first.id));

  const dangerZones = zones.filter(zone => zone.danger).length;
  const rating = clamp(
    RUIN_TIER_INHABITANT_BASE[tier.tier] +
      (groups.length === 2 ? 1 : 0) +
      (dangerZones >= Math.ceil(zones.length / 2) ? 1 : 0),
    1,
    6
  );

  return {
    rating,
    groups: groups.map(group => ({ ...group, label: inhabitantLabel(group, cultureName) })),
    relationship: groups.length === 2 ? pick(rng, INHABITANT_RELATIONS) : undefined
  };
}

function rollZone(rng: Rng, origin: RuinOrigin, number: number, shares: TreasureShares): RuinZone {
  const type = pick(rng, origin.zones);
  const discovery = rng.chance(0.65) ? pick(rng, RUIN_DISCOVERIES) : undefined;
  const taggedDiscovery = discovery
    ? /treasure cache/i.test(discovery)
      ? `${discovery} [${capitalize(pickTreasureCategory(rng, shares))}]`
      : discovery
    : undefined;
  const danger = rng.chance(0.5) ? pick(rng, RUIN_DANGERS) : undefined;
  const exits = [...new Set(Array.from({ length: rng.int(1, 2) }, () => pick(rng, RUIN_EXITS)))];

  return {
    number,
    type,
    condition: pick(rng, RUIN_ZONE_CONDITIONS),
    discovery: taggedDiscovery,
    danger,
    exits
  };
}

function rollRatings(
  tier: (typeof RUIN_TIERS)[number],
  origin: RuinOrigin,
  cause: string,
  accessibility: string,
  condition: string,
  surfaceState: string,
  age: string,
  zones: RuinZone[],
  inhabitants: SiteInhabitants,
  treasure: TreasureShares,
  secrets: string[],
  looted?: boolean
): SiteRatings {
  const dangerZones = zones.filter(zone => zone.danger).length;
  const danger = clamp(
    2 +
      Math.min(3, dangerZones) +
      (inhabitants.rating >= 4 ? 1 : 0) +
      (/vestiges|skeletal|partial ruin|collapsed|buried/i.test(condition) ? 1 : 0) +
      (/occupied|bandit|haunt/i.test(surfaceState) ? 1 : 0),
    1,
    10
  );

  const caches = zones.filter(zone => /treasure cache/i.test(zone.discovery ?? "")).length;
  const richOrigin = ["mine", "tomb", "temple", "palace"].includes(origin.id);
  const treasureRating = clamp(
    1 + Math.floor(tier.scale / 2) + Math.min(3, caches) + (richOrigin ? 1 : 0) - (looted ? 2 : 0),
    1,
    10
  );

  const hidden = /sealed|hidden|concealed|buried/i.test(accessibility);
  const old = /forgotten|before the current|three centuries/i.test(age);
  const mystery = clamp(
    2 +
      (hidden ? 2 : 0) +
      (old ? 1 : 0) +
      Math.min(2, secrets.length) +
      (origin.id === "unknown" || origin.id === "temple" || origin.id === "academy" ? 1 : 0),
    1,
    10
  );

  const causeWeird = RUIN_CAUSE_WEIRDNESS.find(({ pattern }) => pattern.test(cause))?.value ?? 0;
  const weirdness = clamp(
    1 +
      causeWeird +
      (treasure.relics >= 30 ? 1 : 0) +
      (secrets.some(secret => /forgotten|answers|name|door|below/i.test(secret)) ? 1 : 0),
    1,
    10
  );

  return { danger, treasure: treasureRating, scale: tier.scale, mystery, weirdness };
}

export function generateRuinName(context: RuinContext): string {
  return rollName(createRng(`${context.seed}:ruin:${context.cell}`), context);
}

export function generateRuinProfile(context: RuinContext, salt = ""): RuinProfile {
  const rng = createRng(`${context.seed}:ruin:${context.cell}${salt ? `:${salt}` : ""}`);
  const generatedName = rollName(rng, context);
  const tier = pickTier(rng, context.tier);
  const origin = pick(rng, RUIN_ORIGINS);
  const originalName = context.originalName || generatedName;
  const fallbackName = `Ruins of ${originalName.startsWith("The ") ? `the ${originalName.slice(4)}` : originalName}`;
  const name = context.name?.trim() || fallbackName;
  const cause = context.cause || pick(rng, RUIN_CAUSES);
  const condition = pick(rng, RUIN_CONDITIONS);
  const accessibility = pick(rng, RUIN_ACCESSIBILITY);
  const surfaceState = pick(rng, RUIN_SURFACE_STATES);
  const age = context.fallYear ? `fallen in ${context.fallYear}` : pick(rng, RUIN_AGES);
  const treasure = { shares: rollTreasure(origin, cause, context.looted) };
  const zones = Array.from({ length: rng.int(4, 8) }, (_, index) => rollZone(rng, origin, index + 1, treasure.shares));
  const inhabitants = rollInhabitants(rng, tier, origin, zones, context.cultureName);
  const secrets = Array.from(new Set(Array.from({ length: rng.int(1, 2) }, () => pick(rng, RUIN_SECRETS))));
  const tokens: TokenValues = {
    culture: context.cultureName || "the local folk",
    name,
    origin: origin.label,
    cause,
    biome: context.biomeName || "wilderness",
    zone: zones[0]?.type ?? "hall"
  };
  const remains = Array.from(
    new Set(Array.from({ length: rng.int(2, 3) }, () => fill(pick(rng, RUIN_REMAINS), tokens)))
  );
  const rumors = Array.from(new Set(Array.from({ length: rng.int(2, 3) }, () => fill(pick(rng, RUIN_RUMORS), tokens))));
  const ratings = rollRatings(
    tier,
    origin,
    cause,
    accessibility,
    condition,
    surfaceState,
    age,
    zones,
    inhabitants,
    treasure.shares,
    secrets,
    context.looted
  );

  return {
    name,
    originalName,
    tier: tier.tier,
    originalPurpose: origin.label,
    originalPolity: context.originalPolity,
    culture: context.cultureName || "the local folk",
    age,
    fallYear: context.fallYear,
    cause,
    condition,
    accessibility,
    surfaceState,
    clearedBy: context.clearedBy,
    ratings,
    inhabitants,
    treasure,
    sites: [
      {
        id: "main",
        name: originalName,
        kind: origin.siteKind,
        dungeon: false,
        summary: `${capitalize(origin.label)} at the heart of the site.`
      }
    ],
    zones,
    remains,
    secrets,
    rumors
  };
}

export function renderRuinProfile(profile: RuinProfile): string {
  const e = escapeHtml;
  const ratings = [
    `<strong>Danger</strong> ${profile.ratings.danger}/10`,
    `<strong>Treasure</strong> ${profile.ratings.treasure}/10`,
    `<strong>Scale</strong> ${profile.ratings.scale}/10`,
    `<strong>Mystery</strong> ${profile.ratings.mystery}/10`,
    `<strong>Weirdness</strong> ${profile.ratings.weirdness}/10`
  ].join(" · ");
  const treasureMix = TREASURE_CATEGORIES.filter(category => profile.treasure.shares[category] > 0)
    .map(category => `${capitalize(category)} ${profile.treasure.shares[category]}%`)
    .join(" · ");
  const inhabitants = profile.inhabitants.groups.length
    ? profile.inhabitants.groups.map(group => e(group.label)).join(" + ") +
      (profile.inhabitants.relationship ? ` (${e(profile.inhabitants.relationship)})` : "")
    : "none (wandering vermin or scavengers)";
  const zones = profile.zones
    .map(zone => {
      const discovery = zone.discovery ? `<br><em>Discovery:</em> ${e(zone.discovery)}` : "";
      const danger = zone.danger ? `<br><em>Danger:</em> ${e(zone.danger)}` : "";
      const exits = zone.exits.length ? `<br><em>Exits:</em> ${zone.exits.map(e).join("; ")}` : "";
      return `<li><strong>${zone.number}. ${e(zone.type)}</strong> — ${e(zone.condition)}.${discovery}${danger}${exits}</li>`;
    })
    .join("");
  const sites = profile.sites
    .map(
      site =>
        `<li><strong>${e(site.name)}</strong> — ${e(site.kind)}${site.dungeon ? " (dungeon)" : ""}. ${e(site.summary)}</li>`
    )
    .join("");
  const remains = profile.remains.map(item => `<li>${e(item)}</li>`).join("");
  const secrets = profile.secrets.map(item => `<li>${e(item)}</li>`).join("");
  const rumors = profile.rumors.map(item => `<li>${e(item)}</li>`).join("");
  const fall = [
    profile.fallYear !== undefined ? `<p><strong>Year:</strong> ${profile.fallYear}</p>` : "",
    profile.clearedBy ? `<p><strong>Cleared by:</strong> ${e(profile.clearedBy)}</p>` : ""
  ].join("");
  const polity = profile.originalPolity ? `<p><strong>Original polity:</strong> ${e(profile.originalPolity)}</p>` : "";

  return [
    `<h3>${e(profile.name)}</h3>`,
    `<p><em>${capitalize(profile.tier)} ruin · Scale ${profile.ratings.scale}/10 · ${profile.sites.length} site</em></p>`,
    `<p>${ratings}</p>`,
    `<p><strong>Treasure mix</strong> — ${treasureMix}</p>`,
    `<p><strong>Inhabitants</strong> ${profile.inhabitants.rating}/6 (d6 ≤ ${profile.inhabitants.rating} each turn) · ${inhabitants}</p>`,
    `<h4>What it was</h4><p><strong>Original name:</strong> ${e(profile.originalName)}</p>${polity}<p><strong>Purpose:</strong> ${e(profile.originalPurpose)}</p><p><strong>Culture:</strong> ${e(profile.culture)}</p><p><strong>Age:</strong> ${e(profile.age)}</p>`,
    `<h4>Fall</h4><p><strong>Cause:</strong> ${e(profile.cause)}</p>${fall}`,
    `<h4>Present state</h4><p><strong>Condition:</strong> ${e(profile.condition)}</p><p><strong>Accessibility:</strong> ${e(profile.accessibility)}</p><p><strong>Surface:</strong> ${e(profile.surfaceState)}</p>`,
    `<h4>Site</h4><ul>${sites}</ul>`,
    `<h4>Zones</h4><ol>${zones}</ol>`,
    `<h4>What remains</h4><ul>${remains}</ul>`,
    `<h4>Secrets</h4><ul>${secrets}</ul>`,
    `<h4>Rumors</h4><ul>${rumors}</ul>`,
    "<p><em>Alternate ruin profile.</em></p>"
  ].join("");
}
