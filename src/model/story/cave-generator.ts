// Deterministic cave surveys over data/caves.ts
import {
  CAVE_DANGERS,
  CAVE_DISCOVERIES,
  CAVE_ENTRANCE_FORMS,
  CAVE_EXITS,
  CAVE_EXTENT_EMPTY_CHANCE,
  CAVE_EXTENT_INHABITANT_BASE,
  CAVE_EXTENT_INHABITANTS,
  CAVE_EXTENTS,
  CAVE_RUMORS,
  CAVE_SECRETS,
  CAVE_STATUS_TREASURE_MODIFIERS,
  CAVE_STATUS_WEIRDNESS,
  CAVE_TREASURE_BASE,
  CAVE_WATER_STATES,
  CAVE_ZONE_CONDITIONS,
  CAVE_ZONE_TYPES,
  type CaveExtent,
  type CaveExtentRow
} from "@/data/caves";
import {
  INHABITANT_GROUPS,
  INHABITANT_RELATIONS,
  type InhabitantGroup,
  type InhabitantGroupId
} from "@/data/inhabitants";
import { CAVE_FORMATIONS, CAVE_STATUSES } from "@/data/markers";
import { TREASURE_CATEGORIES, type TreasureShares } from "@/data/treasure";
import { type DungeonProfile, generateDungeonProfile, renderDungeonProfile } from "@/model/story/dungeon-generator";
import type { SiteInhabitants, SiteRatings } from "@/model/story/site-profile";
import { applyTreasureModifiers, normalizeTreasureShares, pickTreasureCategory } from "@/model/story/treasure";
import type { CaveContext } from "@/model/story/underworld-profile";
import { createRng, type Rng } from "@/utils/rng";
import { capitalize, escapeHtml } from "@/utils/string-utils";

export interface CaveZone {
  number: number;
  type: string;
  condition: string;
  discovery?: string;
  danger?: string;
  exits: string[];
}

export interface CaveProfile {
  name: string;
  formation: string;
  status: string;
  extent: CaveExtent;
  entrance: string;
  water: string;
  ratings: SiteRatings;
  inhabitants: SiteInhabitants;
  treasure: { shares: TreasureShares };
  zones: CaveZone[];
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
  text.replace(/\[(culture|name|biome|formation)\]/gi, (_match, key: string) => values[key.toLowerCase()] ?? "");

function pickExtent(rng: Rng, extent?: CaveExtent): CaveExtentRow {
  if (extent) return CAVE_EXTENTS.find(row => row.extent === extent) ?? CAVE_EXTENTS[0];
  return pickWeighted(
    rng,
    CAVE_EXTENTS.map(row => ({ value: row, weight: row.weight }))
  );
}

function rollWater(rng: Rng, status: string): string {
  if (/lava/i.test(status)) return "a lava tube";
  if (/flooded/i.test(status)) return "flooded";
  return pick(
    rng,
    CAVE_WATER_STATES.filter(state => !/lava|flooded/i.test(state))
  );
}

function rollTreasure(status: string): TreasureShares {
  const weights = { ...CAVE_TREASURE_BASE };
  applyTreasureModifiers(weights, CAVE_STATUS_TREASURE_MODIFIERS, [status]);
  return normalizeTreasureShares(weights);
}

function rollZone(rng: Rng, number: number, shares: TreasureShares): CaveZone {
  const discovery = rng.chance(0.65) ? pick(rng, CAVE_DISCOVERIES) : undefined;
  const taggedDiscovery = discovery
    ? /treasure cache/i.test(discovery)
      ? `${discovery} [${capitalize(pickTreasureCategory(rng, shares))}]`
      : discovery
    : undefined;
  const exits = [...new Set(Array.from({ length: rng.int(1, 2) }, () => pick(rng, CAVE_EXITS)))];

  return {
    number,
    type: pick(rng, CAVE_ZONE_TYPES),
    condition: pick(rng, CAVE_ZONE_CONDITIONS),
    discovery: taggedDiscovery,
    danger: rng.chance(0.5) ? pick(rng, CAVE_DANGERS) : undefined,
    exits
  };
}

function inhabitantLabel(group: InhabitantGroup, cultureName: string): string {
  const culture = cultureName && cultureName !== "the local folk" ? cultureName : "";
  if (group.id === "humans") return culture ? `${culture} humans` : group.label;
  if (group.id === "humanoids") return culture ? `${culture} humanoids` : group.label;
  return group.label;
}

function chooseInhabitantGroup(rng: Rng, extent: CaveExtent, excluded?: InhabitantGroupId): InhabitantGroup {
  const weights = CAVE_EXTENT_INHABITANTS[extent];
  const weighted = INHABITANT_GROUPS.filter(group => group.id !== excluded)
    .map(group => ({ value: group, weight: weights[group.id] ?? 0 }))
    .filter(({ weight }) => weight > 0);

  if (weighted.length) return pickWeighted(rng, weighted);
  const fallback = INHABITANT_GROUPS.filter(group => group.id !== excluded);
  return pick(rng, fallback.length ? fallback : INHABITANT_GROUPS);
}

function rollInhabitants(
  rng: Rng,
  extent: CaveExtentRow,
  status: string,
  zones: CaveZone[],
  cultureName: string
): SiteInhabitants {
  if (/empty/i.test(status) || rng.chance(CAVE_EXTENT_EMPTY_CHANCE[extent.extent])) return { rating: 1, groups: [] };

  const first = chooseInhabitantGroup(rng, extent.extent);
  const groups = [first];
  if (rng.chance(0.5)) groups.push(chooseInhabitantGroup(rng, extent.extent, first.id));

  const dangerZones = zones.filter(zone => zone.danger).length;
  const rating = clamp(
    CAVE_EXTENT_INHABITANT_BASE[extent.extent] +
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

function dungeonEligible(extent: CaveExtentRow, status: string): boolean {
  if (/empty|flooded|lava/i.test(status)) return false;
  return /monsters|deep|unexplored/i.test(status) || extent.extent === "deep" || extent.extent === "abyssal";
}

function rollDungeon(
  rng: Rng,
  context: CaveContext,
  extent: CaveExtentRow,
  status: string,
  name: string,
  salt: string
): DungeonProfile | undefined {
  if (!dungeonEligible(extent, status) || !rng.chance(extent.dungeonChance)) return undefined;
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
    salt ? `cave:${salt}` : "cave",
    {
      type: /monsters/i.test(status) ? "lair" : "caves",
      size: extent.dungeonSize,
      name
    }
  );
}

function rollRatings(
  extent: CaveExtentRow,
  status: string,
  water: string,
  zones: CaveZone[],
  inhabitants: SiteInhabitants,
  treasure: TreasureShares,
  secrets: string[],
  dungeon: boolean
): SiteRatings {
  const dangerZones = zones.filter(zone => zone.danger).length;
  const danger = clamp(
    2 +
      Math.min(3, dangerZones) +
      (dungeon ? 1 : 0) +
      (inhabitants.rating >= 4 ? 1 : 0) +
      (/monsters/i.test(status) ? 1 : 0) +
      (/lava|flooded|ice/i.test(water) ? 1 : 0),
    1,
    10
  );

  const caches = zones.filter(zone => /treasure cache/i.test(zone.discovery ?? "")).length;
  const treasureRating = clamp(
    1 +
      Math.floor(extent.scale / 2) +
      Math.min(3, caches) +
      (/treasure/i.test(status) ? 1 : 0) -
      (/empty/i.test(status) ? 2 : 0),
    1,
    10
  );

  const hidden =
    /hidden|crawl|fissure|sinkhole/i.test(water) || /deep|unexplored|abyssal/i.test(`${status} ${extent.extent}`);
  const mystery = clamp(
    2 + (hidden ? 2 : 0) + Math.min(2, secrets.length) + (dungeon ? 1 : 0) + (/unexplored/i.test(status) ? 1 : 0),
    1,
    10
  );

  const statusWeird = CAVE_STATUS_WEIRDNESS.find(({ pattern }) => pattern.test(status))?.value ?? 0;
  const weirdness = clamp(
    1 +
      statusWeird +
      (treasure.relics >= 30 ? 1 : 0) +
      (secrets.some(secret => /old name|door|below|path/i.test(secret)) ? 1 : 0),
    1,
    10
  );

  return { danger, treasure: treasureRating, scale: extent.scale, mystery, weirdness };
}

export function generateCaveProfile(context: CaveContext, salt = ""): CaveProfile {
  const rng = createRng(`${context.seed}:cave:${context.cell}${salt ? `:${salt}` : ""}`);
  const extent = pickExtent(rng, context.extent);
  const formation =
    context.formation?.trim() ||
    pickWeighted(
      rng,
      Object.entries(CAVE_FORMATIONS).map(([value, weight]) => ({ value, weight }))
    );
  const status =
    context.status?.trim() ||
    pickWeighted(
      rng,
      Object.entries(CAVE_STATUSES).map(([value, weight]) => ({ value, weight }))
    );
  const name = context.name?.trim() || `${context.cultureName || "The"} ${formation}`;
  const entrance = pick(rng, CAVE_ENTRANCE_FORMS);
  const water = rollWater(rng, status);
  const treasure = { shares: rollTreasure(status) };
  const zones = Array.from({ length: rng.int(extent.zones[0], extent.zones[1]) }, (_, index) =>
    rollZone(rng, index + 1, treasure.shares)
  );
  const inhabitants = rollInhabitants(rng, extent, status, zones, context.cultureName);
  const secrets = Array.from(new Set(Array.from({ length: rng.int(1, 2) }, () => pick(rng, CAVE_SECRETS))));
  const rumors = Array.from(
    new Set(
      Array.from({ length: rng.int(2, 3) }, () =>
        fill(pick(rng, CAVE_RUMORS), {
          culture: context.cultureName || "the local folk",
          name,
          biome: context.biomeName || "wilderness",
          formation
        })
      )
    )
  );
  const dungeon = rollDungeon(rng, context, extent, status, name, salt);
  const ratings = rollRatings(extent, status, water, zones, inhabitants, treasure.shares, secrets, Boolean(dungeon));

  return {
    name,
    formation,
    status,
    extent: extent.extent,
    entrance,
    water,
    ratings,
    inhabitants,
    treasure,
    zones,
    dungeon,
    secrets,
    rumors
  };
}

export function renderCaveProfile(profile: CaveProfile): string {
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
  const dungeon = profile.dungeon ? `<h4>Dungeon draft</h4>${renderDungeonProfile(profile.dungeon)}` : "";
  const secretList = profile.secrets.map(item => `<li>${e(item)}</li>`).join("");
  const rumorList = profile.rumors.map(item => `<li>${e(item)}</li>`).join("");

  return [
    `<h3>${e(profile.name)}</h3>`,
    `<p><em>${capitalize(profile.extent)} cave · ${e(profile.formation)} · Scale ${profile.ratings.scale}/10</em></p>`,
    `<p>${ratings}</p>`,
    `<p><strong>Treasure mix</strong> — ${treasureMix}</p>`,
    `<p><strong>Inhabitants</strong> ${profile.inhabitants.rating}/6 (d6 ≤ ${profile.inhabitants.rating} each turn) · ${inhabitants}</p>`,
    `<h4>Survey</h4><p><strong>Entrance:</strong> ${e(profile.entrance)}</p><p><strong>Water:</strong> ${e(profile.water)}</p><p><strong>Local claim:</strong> ${e(profile.status)}</p>`,
    `<h4>Zones</h4><ol>${zones}</ol>`,
    dungeon,
    `<h4>Secrets</h4><ul>${secretList}</ul>`,
    `<h4>Rumors</h4><ul>${rumorList}</ul>`,
    "<p><em>Alternate cave profile.</em></p>"
  ].join("");
}
