// Deterministic beast profiles over data/creatures.ts
import {
  BEAST_FORMS,
  BEAST_HABITATS,
  BEAST_LAIRS,
  BEAST_NATURES,
  BEAST_RUMORS,
  BEAST_SIGNS,
  BODY_PART_PROPERTIES,
  BODY_PARTS,
  CREATURE_QUANTITIES,
  CREATURE_SIZES,
  type CreatureSize
} from "@/data/creatures";
import type { Alignment } from "@/data/culture-traits";
import { TREASURE_CATEGORIES, type TreasureShares } from "@/data/treasure";
import { clamp, pick, rollCreatureCore, rollCreatureInhabitants } from "@/model/story/creature-generator";
import type { BeastContext } from "@/model/story/creature-profile";
import { type DungeonProfile, generateDungeonProfile, renderDungeonProfile } from "@/model/story/dungeon-generator";
import type { SiteInhabitants, SiteRatings } from "@/model/story/site-profile";
import { normalizeTreasureShares, treasureBand } from "@/model/story/treasure";
import { createRng, type Rng } from "@/utils/rng";
import { capitalize, escapeHtml } from "@/utils/string-utils";

export interface BeastProfile {
  name: string;
  form: string;
  habitat: string;
  nature: string;
  natureId: string;
  size: CreatureSize;
  quantity: string;
  count: string;
  length?: number;
  alignment: Alignment;
  tags: string[];
  attacks: string[];
  defense: string;
  want: string;
  moves: string[];
  lair: string;
  signs: string[];
  ratings: SiteRatings;
  inhabitants: SiteInhabitants;
  treasure: { shares: TreasureShares };
  harvest: string[];
  dungeon?: DungeonProfile;
  rumors: string[];
}

const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/\[(culture|name|habitat|biome)\]/gi, (_match, key: string) => values[key.toLowerCase()] ?? "");

function rollHarvest(rng: Rng, count: number): string[] {
  const parts = [...BODY_PARTS];
  const harvest: string[] = [];
  while (harvest.length < count && parts.length) {
    const part = parts.splice(rng.int(0, parts.length - 1), 1)[0];
    harvest.push(`${part} (${pick(rng, BODY_PART_PROPERTIES)})`);
  }
  return harvest;
}

function rollRatings(
  core: ReturnType<typeof rollCreatureCore>,
  sizeRow: (typeof CREATURE_SIZES)[number],
  quantityRow: (typeof CREATURE_QUANTITIES)[number],
  nature: (typeof BEAST_NATURES)[number],
  hoarder: boolean,
  habitat: string
): SiteRatings {
  const has = (tag: string) => core.tags.includes(tag);
  const danger = clamp(
    1 +
      nature.dangerBonus +
      Math.floor(sizeRow.scale / 2) +
      quantityRow.encounterBonus +
      (has("terrifying") ? 1 : 0) +
      (has("toxic") ? 1 : 0) +
      (has("magical") ? 1 : 0),
    1,
    10
  );
  const treasure = clamp(1 + Math.floor(sizeRow.scale / 3) + (hoarder ? 2 : 0), 1, 10);
  const scale = clamp(sizeRow.scale + (core.quantity === "mob" || core.quantity === "throng" ? 1 : 0), 1, 10);
  const mystery = clamp(
    1 +
      (has("magical") ? 1 : 0) +
      (has("insubstantial") ? 1 : 0) +
      (core.size === "huge" ? 1 : 0) +
      (/trench|deep/i.test(habitat) ? 1 : 0),
    1,
    10
  );
  const weirdness = clamp(
    1 +
      (has("magical") ? 2 : 0) +
      (has("undead") ? 2 : 0) +
      (core.attacks.includes("breath") ? 1 : 0) +
      (has("regenerating") ? 1 : 0),
    1,
    10
  );
  return { danger, treasure, scale, mystery, weirdness };
}

function rollLairDraft(
  context: BeastContext,
  core: ReturnType<typeof rollCreatureCore>,
  hoarder: boolean,
  name: string,
  salt: string
): DungeonProfile | undefined {
  const eligible =
    (core.size === "large" || core.size === "huge" || hoarder) && core.natureId !== "herd" && core.size !== "tiny";
  if (!eligible) return undefined;
  return generateDungeonProfile(
    {
      seed: context.seed,
      cell: context.cell,
      cultureName: context.cultureName,
      alignment: core.alignment,
      biomeName: context.biomeName,
      height: context.height,
      name
    },
    salt ? `beast:${salt}` : "beast",
    { type: hoarder ? "lair" : "caves", size: "small", name }
  );
}

export function generateBeastProfile(context: BeastContext, salt = ""): BeastProfile {
  const rng = createRng(`${context.seed}:beast:${context.cell}${salt ? `:${salt}` : ""}`);
  const core = rollCreatureCore(rng, context.alignment, BEAST_NATURES);
  const sizeRow = CREATURE_SIZES.find(row => row.size === core.size)!;
  const quantityRow = CREATURE_QUANTITIES.find(row => row.quantity === core.quantity)!;
  const nature = BEAST_NATURES.find(row => row.id === core.natureId)!;
  const name = context.name?.trim() || `${context.cultureName || "The"} Beast`;
  const form = pick(rng, BEAST_FORMS);
  const habitat = context.habitat?.trim() || pick(rng, BEAST_HABITATS);
  const lair = pick(rng, BEAST_LAIRS);
  const signs = [...new Set(Array.from({ length: rng.int(2, 3) }, () => pick(rng, BEAST_SIGNS)))];
  const hoarder = core.tags.includes("hoarder");

  const weights = { ...nature.treasure };
  if (hoarder) {
    weights.bullion += 1;
    weights.regalia += 1;
  }
  const treasure = { shares: normalizeTreasureShares(weights) };
  const ratings = rollRatings(core, sizeRow, quantityRow, nature, hoarder, habitat);
  const harvest = rollHarvest(rng, clamp(ratings.treasure, 2, 4));
  const encounterRating = clamp(
    sizeRow.encounterBase + quantityRow.encounterBonus + (core.tags.includes("leader") ? 1 : 0),
    1,
    6
  );
  const inhabitants = rollCreatureInhabitants(rng, nature.inhabitants, encounterRating, context.cultureName, 0.25);
  const dungeon = rollLairDraft(context, core, hoarder, name, salt);
  const rumors = [
    ...new Set(
      Array.from({ length: rng.int(2, 3) }, () =>
        fill(pick(rng, BEAST_RUMORS), {
          culture: context.cultureName || "the local folk",
          name,
          habitat,
          biome: context.biomeName || "wilderness"
        })
      )
    )
  ];

  return {
    name,
    form,
    habitat,
    nature: core.nature,
    natureId: core.natureId,
    size: core.size,
    quantity: core.quantity,
    count: core.count,
    length: context.length,
    alignment: core.alignment,
    tags: core.tags,
    attacks: core.attacks,
    defense: core.defense,
    want: core.want,
    moves: core.moves,
    lair,
    signs,
    ratings,
    inhabitants,
    treasure,
    harvest,
    dungeon,
    rumors
  };
}

export function renderBeastProfile(profile: BeastProfile): string {
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
    : "none";
  const tags = profile.tags.length ? `<p><strong>Tags:</strong> ${profile.tags.map(e).join(", ")}</p>` : "";
  const length = profile.length !== undefined ? `<p><strong>Length:</strong> ~${profile.length}</p>` : "";
  const signs = profile.signs.map(item => `<li>${e(item)}</li>`).join("");
  const harvest = profile.harvest.map(item => `<li>${e(item)}</li>`).join("");
  const moves = profile.moves.map(item => `<li>${e(item)}</li>`).join("");
  const rumorList = profile.rumors.map(item => `<li>${e(item)}</li>`).join("");
  const dungeon = profile.dungeon ? `<h4>Lair draft</h4>${renderDungeonProfile(profile.dungeon)}` : "";

  return [
    `<h3>${e(profile.name)}</h3>`,
    `<p><em>${capitalize(profile.nature)} · ${e(profile.size)} ${e(profile.quantity)} · Scale ${profile.ratings.scale}/10</em></p>`,
    `<p>${ratings}</p>`,
    `<p><strong>Treasure mix</strong> — ${treasureMix}</p>`,
    `<p><strong>Inhabitants</strong> ${profile.inhabitants.rating}/6 (d6 ≤ ${profile.inhabitants.rating} each turn) · ${inhabitants}</p>`,
    `<h4>The beast</h4><p><strong>Form:</strong> ${e(profile.form)}</p><p><strong>Number:</strong> ${e(profile.count)}</p>${length}<p><strong>Alignment:</strong> ${e(profile.alignment)}</p>${tags}<p><strong>Attack:</strong> ${profile.attacks.map(e).join(", ")} · <strong>Defense:</strong> ${e(profile.defense)}</p><p><strong>Want:</strong> ${e(profile.want)}</p><ul>${moves}</ul>`,
    `<h4>Territory</h4><p><strong>Habitat:</strong> ${e(profile.habitat)}</p><p><strong>Lair:</strong> ${e(profile.lair)}</p><ul>${signs}</ul>`,
    `<h4>Harvest</h4><p><em>${capitalize(treasureBand(profile.ratings.treasure))} — the value is in the taking, not the coin.</em></p><ul>${harvest}</ul>`,
    dungeon,
    `<h4>Rumors</h4><ul>${rumorList}</ul>`,
    "<p><em>Alternate beast profile.</em></p>"
  ].join("");
}
