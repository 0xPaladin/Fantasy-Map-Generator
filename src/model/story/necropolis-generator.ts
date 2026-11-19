// Deterministic tiered necropolis profiles over data/burials.ts
import {
  BURIAL_CUSTOMS,
  NECROPOLIS_AGES,
  NECROPOLIS_CAUSE_TREASURE_MODIFIERS,
  NECROPOLIS_CAUSE_WEIRDNESS,
  NECROPOLIS_CAUSES,
  NECROPOLIS_DANGERS,
  NECROPOLIS_DISCOVERIES,
  NECROPOLIS_EXITS,
  NECROPOLIS_REMAINS,
  NECROPOLIS_RUMORS,
  NECROPOLIS_SECRETS,
  NECROPOLIS_SITE_TYPES,
  NECROPOLIS_SURFACE_STATES,
  NECROPOLIS_TIER_EMPTY_CHANCE,
  NECROPOLIS_TIER_INHABITANT_BASE,
  NECROPOLIS_TIER_INHABITANTS,
  NECROPOLIS_TIERS,
  NECROPOLIS_TREASURE_BASE,
  NECROPOLIS_ZONE_CONDITIONS,
  NECROPOLIS_ZONE_TYPES,
  type NecropolisSiteKind,
  type NecropolisTier,
  type NecropolisTierRow
} from "@/data/burials";
import type { DungeonTypeId } from "@/data/dungeons";
import {
  INHABITANT_GROUPS,
  INHABITANT_RELATIONS,
  type InhabitantGroup,
  type InhabitantGroupId
} from "@/data/inhabitants";
import { NECROPOLIS_TYPES } from "@/data/markers";
import { TREASURE_CATEGORIES, type TreasureShares } from "@/data/treasure";
import { type DungeonProfile, generateDungeonProfile, renderDungeonProfile } from "@/model/story/dungeon-generator";
import type { SiteInhabitants, SiteRatings } from "@/model/story/site-profile";
import { applyTreasureModifiers, normalizeTreasureShares, pickTreasureCategory } from "@/model/story/treasure";
import type { NecropolisContext } from "@/model/story/underworld-profile";
import { createRng, type Rng } from "@/utils/rng";
import { capitalize, escapeHtml } from "@/utils/string-utils";

export interface NecropolisSite {
  id: string;
  name: string;
  kind: NecropolisSiteKind;
  dungeon: boolean;
  dungeonSeed?: string;
  dungeonType?: DungeonTypeId;
  dungeonProfile?: DungeonProfile;
  summary: string;
}

export interface NecropolisZone {
  number: number;
  type: string;
  condition: string;
  discovery?: string;
  danger?: string;
  exits: string[];
}

export interface NecropolisProfile {
  name: string;
  originalName?: string;
  tier: NecropolisTier;
  burialType: string;
  originalPolity?: string;
  culture: string;
  age: string;
  fallYear?: number;
  cause: string;
  interment: string;
  surfaceState: string;
  ratings: SiteRatings;
  inhabitants: SiteInhabitants;
  treasure: { shares: TreasureShares };
  sites: NecropolisSite[];
  zones: NecropolisZone[];
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

const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/\[(culture|name|cause|biome|zone)\]/gi, (_match, key: string) => values[key.toLowerCase()] ?? "");

function pickTier(rng: Rng, tier?: NecropolisTier, burialType?: string): NecropolisTierRow {
  if (tier) return NECROPOLIS_TIERS.find(row => row.tier === tier) ?? NECROPOLIS_TIERS[0];

  let rows: readonly NecropolisTierRow[] = NECROPOLIS_TIERS;
  if (burialType === "Graveyard") rows = rows.filter(row => row.tier === "graveyard");
  else if (burialType === "Cemetery") rows = rows.filter(row => row.tier === "cemetery");
  else if (["Crypt", "Tomb", "Mausoleum", "Sepulchre"].includes(burialType ?? ""))
    rows = rows.filter(row => ["crypt-complex", "necropolis", "city-of-the-dead"].includes(row.tier));
  else if (burialType === "Necropolis")
    rows = rows.filter(row => ["necropolis", "city-of-the-dead"].includes(row.tier));
  if (!rows.length) rows = NECROPOLIS_TIERS;

  return pickWeighted(
    rng,
    rows.map(row => ({ value: row, weight: row.weight }))
  );
}

function rollBurialType(rng: Rng, burialType?: string): string {
  return (
    burialType?.trim() ||
    pickWeighted(
      rng,
      Object.entries(NECROPOLIS_TYPES).map(([value, weight]) => ({ value, weight }))
    )
  );
}

function mainSiteKind(burialType: string): NecropolisSiteKind {
  switch (burialType) {
    case "Graveyard":
    case "Cemetery":
      return "grave-field";
    case "Mausoleum":
      return "mausoleum";
    case "Sepulchre":
      return "sepulchre";
    case "Crypt":
    case "Tomb":
      return "catacomb";
    default:
      return "tomb-district";
  }
}

function rollSites(
  rng: Rng,
  tier: NecropolisTierRow,
  context: NecropolisContext,
  originalName: string,
  salt: string
): NecropolisSite[] {
  const siteCount = rng.int(tier.sites[0], tier.sites[1]);
  const dungeonTarget = Math.min(siteCount, rng.int(tier.dungeonSites[0], tier.dungeonSites[1]));
  const mainKind = mainSiteKind(context.burialType ?? "");
  const main = NECROPOLIS_SITE_TYPES.find(type => type.kind === mainKind) ?? NECROPOLIS_SITE_TYPES[0];
  const chosen = [main];
  const pool = NECROPOLIS_SITE_TYPES.filter(type => type.kind !== main.kind);

  while (chosen.length < siteCount && pool.length) {
    const dungeonChosen = chosen.filter(type => Boolean(type.dungeonType)).length;
    const candidates = dungeonChosen < dungeonTarget ? pool.filter(type => Boolean(type.dungeonType)) : pool;
    const source = candidates.length ? candidates : pool;
    const type = source[rng.int(0, source.length - 1)];
    pool.splice(pool.indexOf(type), 1);
    chosen.push(type);
  }

  let dungeonsLeft = dungeonTarget;
  return chosen.map((type, index) => {
    const dungeon = Boolean(type.dungeonType) && dungeonsLeft > 0;
    if (dungeon) dungeonsLeft--;

    const siteName = index === 0 ? originalName : `The ${type.label}`;
    const dungeonSeed = dungeon
      ? `${context.seed}:necropolis-site:${context.cell}:${salt ? `${salt}:` : ""}${index + 1}`
      : undefined;
    const dungeonProfile =
      dungeon && type.dungeonType
        ? generateDungeonProfile(
            {
              seed: context.seed,
              cell: context.cell,
              cultureName: context.cultureName,
              alignment: context.alignment,
              biomeName: context.biomeName,
              height: context.height,
              name: siteName
            },
            dungeonSeed,
            {
              type: type.dungeonType,
              size: tier.scale >= 8 ? "medium" : "small",
              name: siteName
            }
          )
        : undefined;

    return {
      id: `${type.kind}-${index + 1}`,
      name: siteName,
      kind: type.kind,
      dungeon,
      dungeonSeed,
      dungeonType: dungeon ? type.dungeonType : undefined,
      dungeonProfile,
      summary: `A ${type.label.toLowerCase()} within the city of the dead.`
    };
  });
}

function rollTreasure(cause: string): TreasureShares {
  const weights = { ...NECROPOLIS_TREASURE_BASE };
  applyTreasureModifiers(weights, NECROPOLIS_CAUSE_TREASURE_MODIFIERS, [cause]);
  return normalizeTreasureShares(weights);
}

function rollZone(rng: Rng, number: number, shares: TreasureShares): NecropolisZone {
  const discovery = rng.chance(0.65) ? pick(rng, NECROPOLIS_DISCOVERIES) : undefined;
  const taggedDiscovery = discovery
    ? /treasure cache/i.test(discovery)
      ? `${discovery} [${capitalize(pickTreasureCategory(rng, shares))}]`
      : discovery
    : undefined;
  const exits = [...new Set(Array.from({ length: rng.int(1, 2) }, () => pick(rng, NECROPOLIS_EXITS)))];

  return {
    number,
    type: pick(rng, NECROPOLIS_ZONE_TYPES),
    condition: pick(rng, NECROPOLIS_ZONE_CONDITIONS),
    discovery: taggedDiscovery,
    danger: rng.chance(0.5) ? pick(rng, NECROPOLIS_DANGERS) : undefined,
    exits
  };
}

function inhabitantLabel(group: InhabitantGroup, cultureName: string): string {
  const culture = cultureName && cultureName !== "the local folk" ? cultureName : "";
  if (group.id === "humans") return culture ? `${culture} humans` : group.label;
  if (group.id === "humanoids") return culture ? `${culture} humanoids` : group.label;
  return group.label;
}

function chooseInhabitantGroup(rng: Rng, tier: NecropolisTier, excluded?: InhabitantGroupId): InhabitantGroup {
  const weights = NECROPOLIS_TIER_INHABITANTS[tier];
  const weighted = INHABITANT_GROUPS.filter(group => group.id !== excluded)
    .map(group => ({ value: group, weight: weights[group.id] ?? 0 }))
    .filter(({ weight }) => weight > 0);

  if (weighted.length) return pickWeighted(rng, weighted);
  const fallback = INHABITANT_GROUPS.filter(group => group.id !== excluded);
  return pick(rng, fallback.length ? fallback : INHABITANT_GROUPS);
}

function rollInhabitants(
  rng: Rng,
  tier: NecropolisTierRow,
  zones: NecropolisZone[],
  cultureName: string
): SiteInhabitants {
  if (rng.chance(NECROPOLIS_TIER_EMPTY_CHANCE[tier.tier])) return { rating: 1, groups: [] };

  const first = chooseInhabitantGroup(rng, tier.tier);
  const groups = [first];
  if (rng.chance(0.5)) groups.push(chooseInhabitantGroup(rng, tier.tier, first.id));

  const dangerZones = zones.filter(zone => zone.danger).length;
  const rating = clamp(
    NECROPOLIS_TIER_INHABITANT_BASE[tier.tier] +
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

function rollRatings(
  tier: NecropolisTierRow,
  cause: string,
  surfaceState: string,
  age: string,
  zones: NecropolisZone[],
  inhabitants: SiteInhabitants,
  treasure: TreasureShares,
  secrets: string[],
  dungeonSites: number
): SiteRatings {
  const dangerZones = zones.filter(zone => zone.danger).length;
  const danger = clamp(
    3 +
      Math.min(3, dangerZones) +
      Math.min(2, dungeonSites) +
      (inhabitants.rating >= 4 ? 1 : 0) +
      (/curse|necromancy/i.test(cause) ? 1 : 0) +
      (/occupied|cult/i.test(surfaceState) ? 1 : 0),
    1,
    10
  );

  const caches = zones.filter(zone => /treasure cache/i.test(zone.discovery ?? "")).length;
  const treasureRating = clamp(1 + Math.floor(tier.scale / 2) + Math.min(3, caches) + (tier.scale >= 6 ? 1 : 0), 1, 10);

  const old = /forgotten|before the current|three centuries/i.test(age);
  const mystery = clamp(
    2 +
      (old ? 1 : 0) +
      Math.min(2, secrets.length) +
      (dungeonSites ? 1 : 0) +
      (/unknown|curse|necromancy/i.test(cause) ? 1 : 0),
    1,
    10
  );

  const causeWeird = NECROPOLIS_CAUSE_WEIRDNESS.find(({ pattern }) => pattern.test(cause))?.value ?? 0;
  const weirdness = clamp(
    1 +
      causeWeird +
      (treasure.relics >= 30 ? 1 : 0) +
      (secrets.some(secret => /old name|door|below|entrance/i.test(secret)) ? 1 : 0),
    1,
    10
  );

  return { danger, treasure: treasureRating, scale: tier.scale, mystery, weirdness };
}

export function generateNecropolisProfile(context: NecropolisContext, salt = ""): NecropolisProfile {
  const rng = createRng(`${context.seed}:necropolis:${context.cell}${salt ? `:${salt}` : ""}`);
  const burialType = rollBurialType(rng, context.burialType);
  const tier = pickTier(rng, context.tier, burialType);
  const name = context.name?.trim() || `${context.cultureName || "The"} ${burialType}`;
  const originalName = context.originalName?.trim();
  const cause = context.cause?.trim() || pick(rng, NECROPOLIS_CAUSES);
  const interment = pick(rng, BURIAL_CUSTOMS);
  const surfaceState = pick(rng, NECROPOLIS_SURFACE_STATES);
  const age = context.fallYear ? `fallen in ${context.fallYear}` : pick(rng, NECROPOLIS_AGES);
  const treasure = { shares: rollTreasure(cause) };
  const zones = Array.from({ length: rng.int(4, 8) }, (_, index) => rollZone(rng, index + 1, treasure.shares));
  const inhabitants = rollInhabitants(rng, tier, zones, context.cultureName);
  const secrets = Array.from(new Set(Array.from({ length: rng.int(1, 2) }, () => pick(rng, NECROPOLIS_SECRETS))));
  const sites = rollSites(rng, tier, context, originalName || name, salt);
  const dungeonSites = sites.filter(site => site.dungeon).length;
  const tokens = {
    culture: context.cultureName || "the local folk",
    name,
    cause,
    biome: context.biomeName || "wilderness",
    zone: zones[0]?.type ?? "gate"
  };
  const remains = Array.from(
    new Set(Array.from({ length: rng.int(2, 3) }, () => fill(pick(rng, NECROPOLIS_REMAINS), tokens)))
  );
  const rumors = Array.from(
    new Set(Array.from({ length: rng.int(2, 3) }, () => fill(pick(rng, NECROPOLIS_RUMORS), tokens)))
  );
  const ratings = rollRatings(
    tier,
    cause,
    surfaceState,
    age,
    zones,
    inhabitants,
    treasure.shares,
    secrets,
    dungeonSites
  );

  return {
    name,
    originalName,
    tier: tier.tier,
    burialType,
    originalPolity: context.originalPolity,
    culture: context.cultureName || "the local folk",
    age,
    fallYear: context.fallYear,
    cause,
    interment,
    surfaceState,
    ratings,
    inhabitants,
    treasure,
    sites,
    zones,
    remains,
    secrets,
    rumors
  };
}

export function renderNecropolisProfile(profile: NecropolisProfile): string {
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
  const secretList = profile.secrets.map(item => `<li>${e(item)}</li>`).join("");
  const rumorList = profile.rumors.map(item => `<li>${e(item)}</li>`).join("");
  const dungeons = profile.sites
    .filter(site => site.dungeonProfile)
    .map(site => `<h4>${e(site.name)}</h4>${renderDungeonProfile(site.dungeonProfile!)}`)
    .join("");
  const original = profile.originalName ? `<p><strong>Original name:</strong> ${e(profile.originalName)}</p>` : "";
  const polity = profile.originalPolity ? `<p><strong>Original polity:</strong> ${e(profile.originalPolity)}</p>` : "";
  const year = profile.fallYear !== undefined ? `<p><strong>Year:</strong> ${profile.fallYear}</p>` : "";
  const tierLabel = capitalize(profile.tier.replace(/-/g, " "));

  return [
    `<h3>${e(profile.name)}</h3>`,
    `<p><em>${tierLabel} necropolis · Scale ${profile.ratings.scale}/10 · ${profile.sites.length} site${
      profile.sites.length === 1 ? "" : "s"
    }</em></p>`,
    `<p>${ratings}</p>`,
    `<p><strong>Treasure mix</strong> — ${treasureMix}</p>`,
    `<p><strong>Inhabitants</strong> ${profile.inhabitants.rating}/6 (d6 ≤ ${profile.inhabitants.rating} each turn) · ${inhabitants}</p>`,
    `<h4>What it was</h4>${original}${polity}<p><strong>Burial type:</strong> ${e(profile.burialType)}</p><p><strong>Culture:</strong> ${e(profile.culture)}</p><p><strong>Age:</strong> ${e(profile.age)}</p><p><strong>Interment:</strong> ${e(profile.interment)}</p>`,
    `<h4>Fall</h4><p><strong>Cause:</strong> ${e(profile.cause)}</p>${year}`,
    `<h4>Present state</h4><p><strong>Surface:</strong> ${e(profile.surfaceState)}</p>`,
    `<h4>${profile.sites.length === 1 ? "Site" : "Sites"}</h4><ul>${sites}</ul>`,
    `<h4>Zones</h4><ol>${zones}</ol>`,
    dungeons,
    `<h4>What remains</h4><ul>${remains}</ul>`,
    `<h4>Secrets</h4><ul>${secretList}</ul>`,
    `<h4>Rumors</h4><ul>${rumorList}</ul>`,
    "<p><em>Alternate necropolis profile.</em></p>"
  ].join("");
}
