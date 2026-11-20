// Deterministic disturbed-burial profiles over data/burials.ts
import {
  BURIAL_ACTIVITIES,
  BURIAL_CAUSE_TREASURE_MODIFIERS,
  BURIAL_CAUSE_WEIRDNESS,
  BURIAL_CUSTOMS,
  BURIAL_DANGERS,
  BURIAL_DISCOVERIES,
  BURIAL_DISTURBANCES,
  BURIAL_EXITS,
  BURIAL_KIND_EMPTY_CHANCE,
  BURIAL_KIND_INHABITANT_BASE,
  BURIAL_KIND_INHABITANTS,
  BURIAL_KINDS,
  BURIAL_LOOTED_TREASURE_MODIFIERS,
  BURIAL_RUMORS,
  BURIAL_SECRETS,
  BURIAL_TREASURE_BASE,
  BURIAL_WARDS,
  BURIAL_WHO,
  BURIAL_ZONE_CONDITIONS,
  BURIAL_ZONE_TYPES,
  type BurialKind,
  type BurialKindRow
} from "@/data/burials";
import {
  INHABITANT_GROUPS,
  INHABITANT_RELATIONS,
  type InhabitantGroup,
  type InhabitantGroupId
} from "@/data/inhabitants";
import { TREASURE_CATEGORIES, type TreasureShares } from "@/data/treasure";
import { type DungeonProfile, generateDungeonProfile, renderDungeonProfile } from "@/model/story/dungeon-generator";
import type { SiteInhabitants, SiteRatings } from "@/model/story/site-profile";
import {
  applyTreasureModifiers,
  normalizeTreasureShares,
  pickTreasureCategory,
  rateTreasureCache
} from "@/model/story/treasure";
import type { BurialContext } from "@/model/story/underworld-profile";
import { createRng, type Rng } from "@/utils/rng";
import { capitalize, escapeHtml } from "@/utils/string-utils";

export interface BurialZone {
  number: number;
  type: string;
  condition: string;
  discovery?: string;
  danger?: string;
  exits: string[];
}

export interface BurialProfile {
  name: string;
  burialKind: BurialKind;
  label: string;
  who: string;
  custom: string;
  disturbance: string;
  activity: string;
  ward: string;
  looted: boolean;
  ratings: SiteRatings;
  inhabitants: SiteInhabitants;
  treasure: { shares: TreasureShares };
  zones: BurialZone[];
  dungeon?: DungeonProfile;
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

const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/\[(culture|name|who|biome)\]/gi, (_match, key: string) => values[key.toLowerCase()] ?? "");

function pickKind(rng: Rng, kind?: BurialKind): BurialKindRow {
  if (kind) return BURIAL_KINDS.find(row => row.kind === kind) ?? BURIAL_KINDS[0];
  return pickWeighted(
    rng,
    BURIAL_KINDS.map(row => ({ value: row, weight: row.weight }))
  );
}

function rollTreasure(disturbance: string, looted: boolean): TreasureShares {
  const weights = { ...BURIAL_TREASURE_BASE };
  applyTreasureModifiers(weights, BURIAL_CAUSE_TREASURE_MODIFIERS, [disturbance]);
  if (looted) applyTreasureModifiers(weights, BURIAL_LOOTED_TREASURE_MODIFIERS, ["looted"]);
  return normalizeTreasureShares(weights);
}

function rollZone(rng: Rng, number: number, shares: TreasureShares): BurialZone {
  const discovery = rng.chance(0.65) ? pick(rng, BURIAL_DISCOVERIES) : undefined;
  const taggedDiscovery = discovery
    ? /treasure cache/i.test(discovery)
      ? `${discovery} [${capitalize(pickTreasureCategory(rng, shares))}]`
      : discovery
    : undefined;
  const exits = [...new Set(Array.from({ length: rng.int(1, 2) }, () => pick(rng, BURIAL_EXITS)))];

  return {
    number,
    type: pick(rng, BURIAL_ZONE_TYPES),
    condition: pick(rng, BURIAL_ZONE_CONDITIONS),
    discovery: taggedDiscovery,
    danger: rng.chance(0.6) ? pick(rng, BURIAL_DANGERS) : undefined,
    exits
  };
}

function inhabitantLabel(group: InhabitantGroup, cultureName: string): string {
  const culture = cultureName && cultureName !== "the local folk" ? cultureName : "";
  if (group.id === "humans") return culture ? `${culture} humans` : group.label;
  if (group.id === "humanoids") return culture ? `${culture} humanoids` : group.label;
  return group.label;
}

function chooseInhabitantGroup(rng: Rng, kind: BurialKind, excluded?: InhabitantGroupId): InhabitantGroup {
  const weights = BURIAL_KIND_INHABITANTS[kind];
  const weighted = INHABITANT_GROUPS.filter(group => group.id !== excluded)
    .map(group => ({ value: group, weight: weights[group.id] ?? 0 }))
    .filter(({ weight }) => weight > 0);

  if (weighted.length) return pickWeighted(rng, weighted);
  const fallback = INHABITANT_GROUPS.filter(group => group.id !== excluded);
  return pick(rng, fallback.length ? fallback : INHABITANT_GROUPS);
}

function rollInhabitants(rng: Rng, kind: BurialKindRow, zones: BurialZone[], cultureName: string): SiteInhabitants {
  if (rng.chance(BURIAL_KIND_EMPTY_CHANCE[kind.kind])) return { rating: 1, groups: [] };

  const first = chooseInhabitantGroup(rng, kind.kind);
  const groups = [first];
  if (rng.chance(0.5)) groups.push(chooseInhabitantGroup(rng, kind.kind, first.id));

  const dangerZones = zones.filter(zone => zone.danger).length;
  const rating = clamp(
    BURIAL_KIND_INHABITANT_BASE[kind.kind] +
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

function rollDungeon(
  context: BurialContext,
  kind: BurialKindRow,
  name: string,
  salt: string
): DungeonProfile | undefined {
  if (!kind.dungeon || !kind.dungeonType) return undefined;
  return generateDungeonProfile(
    {
      seed: context.seed,
      cell: context.cell,
      cultureName: context.cultureName,
      alignment: context.alignment,
      biomeName: context.biomeName,
      height: context.height,
      name
    },
    salt ? `burial:${salt}` : "burial",
    { type: kind.dungeonType, size: "small", name }
  );
}

function rollRatings(
  kind: BurialKindRow,
  disturbance: string,
  who: string,
  zones: BurialZone[],
  inhabitants: SiteInhabitants,
  treasure: TreasureShares,
  secrets: string[],
  dungeon: boolean,
  looted: boolean
): SiteRatings {
  const dangerZones = zones.filter(zone => zone.danger).length;
  const danger = clamp(
    4 +
      Math.min(3, dangerZones) +
      (dungeon ? 1 : 0) +
      (inhabitants.rating >= 4 ? 1 : 0) +
      (/curse|necromancy|broken ward/i.test(disturbance) ? 1 : 0) +
      (kind.kind === "mass-grave" ? 1 : 0),
    1,
    10
  );

  const caches = zones.filter(zone => /treasure cache/i.test(zone.discovery ?? "")).length;
  const rich = ["barrow", "crypt", "ossuary", "mass-grave"].includes(kind.kind);
  const treasureRating = clamp(
    1 + Math.floor(kind.scale / 2) + Math.min(3, caches) + (rich ? 1 : 0) - (looted ? 2 : 0),
    1,
    10
  );

  const mystery = clamp(
    2 +
      (/unknown/i.test(`${who} ${disturbance}`) ? 1 : 0) +
      Math.min(2, secrets.length) +
      (dungeon ? 1 : 0) +
      (rich ? 1 : 0),
    1,
    10
  );

  const causeWeird = BURIAL_CAUSE_WEIRDNESS.find(({ pattern }) => pattern.test(disturbance))?.value ?? 0;
  const weirdness = clamp(
    1 +
      causeWeird +
      (treasure.relics >= 30 ? 1 : 0) +
      (secrets.some(secret => /old name|door|below|ward|real burial/i.test(secret)) ? 1 : 0),
    1,
    10
  );

  return { danger, treasure: treasureRating, scale: kind.scale, mystery, weirdness };
}

export function generateBurialProfile(context: BurialContext, salt = ""): BurialProfile {
  const rng = createRng(`${context.seed}:burial:${context.cell}${salt ? `:${salt}` : ""}`);
  const kind = pickKind(rng, context.burialKind);
  const name = context.name?.trim() || "Disturbed Burial";
  const who = pick(rng, BURIAL_WHO);
  const custom = pick(rng, BURIAL_CUSTOMS);
  const disturbance = context.disturbance?.trim() || context.cause?.trim() || pick(rng, BURIAL_DISTURBANCES);
  const activity = pick(rng, BURIAL_ACTIVITIES);
  const ward = pick(rng, BURIAL_WARDS);
  const looted = context.looted === true || /robbery/i.test(disturbance);
  const treasure = { shares: rollTreasure(disturbance, looted) };
  const zones = Array.from({ length: rng.int(kind.zones[0], kind.zones[1]) }, (_, index) =>
    rollZone(rng, index + 1, treasure.shares)
  );
  const inhabitants = rollInhabitants(rng, kind, zones, context.cultureName);
  const secrets = Array.from(new Set(Array.from({ length: rng.int(1, 2) }, () => pick(rng, BURIAL_SECRETS))));
  const rumors = Array.from(
    new Set(
      Array.from({ length: rng.int(2, 3) }, () =>
        fill(pick(rng, BURIAL_RUMORS), {
          culture: context.cultureName || "the local folk",
          name,
          who,
          biome: context.biomeName || "wilderness"
        })
      )
    )
  );
  const dungeon = rollDungeon(context, kind, name, salt);
  const ratings = rollRatings(
    kind,
    disturbance,
    who,
    zones,
    inhabitants,
    treasure.shares,
    secrets,
    Boolean(dungeon),
    looted
  );
  for (const zone of zones) {
    if (zone.discovery && /treasure cache/i.test(zone.discovery))
      zone.discovery = rateTreasureCache(zone.discovery, ratings.treasure);
  }

  return {
    name,
    burialKind: kind.kind,
    label: kind.label,
    who,
    custom,
    disturbance,
    activity,
    ward,
    looted,
    ratings,
    inhabitants,
    treasure,
    zones,
    dungeon,
    secrets,
    rumors
  };
}

export function renderBurialProfile(profile: BurialProfile): string {
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
  const dungeon = profile.dungeon ? `<h4>Crypt draft</h4>${renderDungeonProfile(profile.dungeon)}` : "";
  const secretList = profile.secrets.map(item => `<li>${e(item)}</li>`).join("");
  const rumorList = profile.rumors.map(item => `<li>${e(item)}</li>`).join("");
  const looted = profile.looted ? "<p><strong>Looted:</strong> the grave goods have been taken.</p>" : "";

  return [
    `<h3>${e(profile.name)}</h3>`,
    `<p><em>Disturbed burial · ${e(profile.label)} · Scale ${profile.ratings.scale}/10</em></p>`,
    `<p>${ratings}</p>`,
    `<p><strong>Treasure mix</strong> — ${treasureMix}</p>`,
    `<p><strong>Inhabitants</strong> ${profile.inhabitants.rating}/6 (d6 ≤ ${profile.inhabitants.rating} each turn) · ${inhabitants}</p>`,
    `<h4>Who lies here</h4><p><strong>Dead:</strong> ${e(profile.who)}</p><p><strong>Custom:</strong> ${e(profile.custom)}</p>`,
    `<h4>Disturbance</h4><p><strong>Cause:</strong> ${e(profile.disturbance)}</p><p><strong>Activity:</strong> ${e(profile.activity)}</p><p><strong>Ward:</strong> ${e(profile.ward)}</p>${looted}`,
    `<h4>Zones</h4><ol>${zones}</ol>`,
    dungeon,
    `<h4>Secrets</h4><ul>${secretList}</ul>`,
    `<h4>Rumors</h4><ul>${rumorList}</ul>`,
    "<p><em>Alternate burial profile.</em></p>"
  ].join("");
}
