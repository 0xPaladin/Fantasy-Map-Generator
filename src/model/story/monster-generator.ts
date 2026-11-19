// Deterministic monster profiles over data/creatures.ts
import {
  CREATURE_QUANTITIES,
  CREATURE_SIZES,
  type CreatureSize,
  CURIO_ADJECTIVES,
  CURIO_DRAWBACKS,
  CURIO_ITEMS,
  CURIO_NAME_TEMPLATES,
  CURIO_POWERS,
  CURIO_PROPERTIES,
  LOOT_CONTEXTS,
  MONSTER_LAIRS,
  MONSTER_NATURES,
  MONSTER_RUMORS,
  MONSTER_SIGNS,
  MONSTER_TERRITORY
} from "@/data/creatures";
import type { Alignment } from "@/data/culture-traits";
import type { DungeonTypeId } from "@/data/dungeons";
import { HILL_MONSTER_HABITS, HILL_MONSTER_SPECIES } from "@/data/markers";
import { TREASURE_CATEGORIES, type TreasureShares } from "@/data/treasure";
import { clamp, pick, rollCreatureCore, rollCreatureInhabitants } from "@/model/story/creature-generator";
import type { MonsterContext } from "@/model/story/creature-profile";
import { type DungeonProfile, generateDungeonProfile, renderDungeonProfile } from "@/model/story/dungeon-generator";
import type { SiteInhabitants, SiteRatings } from "@/model/story/site-profile";
import { normalizeTreasureShares } from "@/model/story/treasure";
import { createRng, type Rng } from "@/utils/rng";
import { capitalize, escapeHtml } from "@/utils/string-utils";

export interface Curio {
  name: string;
  power: string;
  drawback: string;
}

export interface MonsterProfile {
  name: string;
  species: string;
  habit: string;
  nature: string;
  natureId: string;
  size: CreatureSize;
  quantity: string;
  count: string;
  alignment: Alignment;
  tags: string[];
  attacks: string[];
  defense: string;
  want: string;
  moves: string[];
  lair: string;
  territory: string;
  signs: string[];
  ratings: SiteRatings;
  inhabitants: SiteInhabitants;
  treasure: { shares: TreasureShares };
  hoard: string[];
  lootDie: number;
  curio?: Curio;
  dungeon?: DungeonProfile;
  rumors: string[];
}

const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/\[(culture|name|species|biome|habit)\]/gi, (_match, key: string) => values[key.toLowerCase()] ?? "");

function rollCurio(rng: Rng, cultureName: string): Curio {
  const name = pick(rng, CURIO_NAME_TEMPLATES)
    .replace("[PROPERTY]", pick(rng, CURIO_PROPERTIES))
    .replace("[ADJECTIVE]", pick(rng, CURIO_ADJECTIVES))
    .replace("[ITEM]", pick(rng, CURIO_ITEMS))
    .replace("[NAME]", cultureName || "the Maker");
  return { name, power: pick(rng, CURIO_POWERS), drawback: pick(rng, CURIO_DRAWBACKS) };
}

function rollHoard(rng: Rng, hoarder: boolean, hasCurio: boolean): string[] {
  const forms = LOOT_CONTEXTS.find(row => row.context === "lair")!.forms;
  const pool = [...forms];
  const count = hoarder ? rng.int(4, 6) : rng.int(2, 4);
  const hoard: string[] = [];
  while (hoard.length < count && pool.length) {
    hoard.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  }
  if (hasCurio && !hoard.includes("a curio")) hoard.push("a curio");
  return hoard;
}

const LAIR_TYPE: Record<string, DungeonTypeId> = {
  undead: "crypt",
  brute: "stronghold",
  "giant-kin": "stronghold",
  beastly: "caves",
  caster: "laboratory",
  hag: "laboratory",
  aberration: "caves",
  "dragon-kin": "lair"
};

function rollLairDraft(
  context: MonsterContext,
  core: ReturnType<typeof rollCreatureCore>,
  hoarder: boolean,
  name: string,
  salt: string
): DungeonProfile | undefined {
  const eligible = (core.size === "large" || core.size === "huge" || hoarder) && core.size !== "tiny";
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
    salt ? `monster:${salt}` : "monster",
    {
      type: LAIR_TYPE[core.natureId] ?? "caves",
      size: core.size === "huge" ? "medium" : "small",
      name
    }
  );
}

function rollRatings(
  core: ReturnType<typeof rollCreatureCore>,
  sizeRow: (typeof CREATURE_SIZES)[number],
  quantityRow: (typeof CREATURE_QUANTITIES)[number],
  nature: (typeof MONSTER_NATURES)[number],
  hoarder: boolean,
  lootDie: number
): SiteRatings {
  const has = (tag: string) => core.tags.includes(tag);
  const danger = clamp(
    2 +
      nature.dangerBonus +
      Math.floor(sizeRow.scale / 2) +
      quantityRow.encounterBonus +
      (has("terrifying") ? 1 : 0) +
      (has("toxic") ? 1 : 0) +
      (has("magical") ? 1 : 0) +
      (has("leader") ? 1 : 0),
    1,
    10
  );
  const treasure = clamp(1 + Math.floor(lootDie / 4) + (hoarder ? 2 : 0) + (nature.dangerBonus >= 2 ? 1 : 0), 1, 10);
  const scale = clamp(sizeRow.scale + (core.quantity === "mob" || core.quantity === "throng" ? 1 : 0), 1, 10);
  const mystery = clamp(
    1 +
      (has("magical") ? 1 : 0) +
      (has("undead") ? 1 : 0) +
      (core.size === "huge" ? 1 : 0) +
      (core.natureId === "caster" || core.natureId === "hag" ? 1 : 0),
    1,
    10
  );
  const weirdness = clamp(
    1 +
      (has("magical") ? 2 : 0) +
      (has("undead") ? 2 : 0) +
      (core.natureId === "aberration" ? 2 : 0) +
      (core.attacks.includes("breath") ? 1 : 0),
    1,
    10
  );
  return { danger, treasure, scale, mystery, weirdness };
}

export function generateMonsterProfile(context: MonsterContext, salt = ""): MonsterProfile {
  const rng = createRng(`${context.seed}:monster:${context.cell}${salt ? `:${salt}` : ""}`);
  const core = rollCreatureCore(rng, context.alignment, MONSTER_NATURES);
  const sizeRow = CREATURE_SIZES.find(row => row.size === core.size)!;
  const quantityRow = CREATURE_QUANTITIES.find(row => row.quantity === core.quantity)!;
  const nature = MONSTER_NATURES.find(row => row.id === core.natureId)!;
  const species = context.species?.trim() || pick(rng, HILL_MONSTER_SPECIES);
  const name = context.name?.trim() || `${context.cultureName || "The"} ${species}`;
  const habit = context.habit?.trim() || pick(rng, HILL_MONSTER_HABITS);
  const lair = pick(rng, MONSTER_LAIRS);
  const territory = pick(rng, MONSTER_TERRITORY);
  const signs = [...new Set(Array.from({ length: rng.int(2, 3) }, () => pick(rng, MONSTER_SIGNS)))];
  const hoarder = core.tags.includes("hoarder");

  const weights = { ...nature.treasure };
  if (hoarder) {
    weights.bullion += 1;
    weights.regalia += 1;
  }
  const treasure = { shares: normalizeTreasureShares(weights) };
  const lootDie = sizeRow.lootDie;
  const curioEligible = core.tags.includes("magical") || hoarder || core.size === "huge";
  const curio = curioEligible && rng.chance(0.7) ? rollCurio(rng, context.cultureName) : undefined;
  const hoard = rollHoard(rng, hoarder, Boolean(curio));
  const encounterRating = clamp(
    sizeRow.encounterBase + quantityRow.encounterBonus + (core.tags.includes("leader") ? 1 : 0),
    1,
    6
  );
  const inhabitants = rollCreatureInhabitants(rng, nature.inhabitants, encounterRating, context.cultureName, 0.3);
  const ratings = rollRatings(core, sizeRow, quantityRow, nature, hoarder, lootDie);
  const dungeon = rollLairDraft(context, core, hoarder, name, salt);
  const rumors = [
    ...new Set(
      Array.from({ length: rng.int(2, 3) }, () =>
        fill(pick(rng, MONSTER_RUMORS), {
          culture: context.cultureName || "the local folk",
          name,
          species,
          biome: context.biomeName || "wilderness",
          habit
        })
      )
    )
  ];

  return {
    name,
    species,
    habit,
    nature: core.nature,
    natureId: core.natureId,
    size: core.size,
    quantity: core.quantity,
    count: core.count,
    alignment: core.alignment,
    tags: core.tags,
    attacks: core.attacks,
    defense: core.defense,
    want: core.want,
    moves: core.moves,
    lair,
    territory,
    signs,
    ratings,
    inhabitants,
    treasure,
    hoard,
    lootDie,
    curio,
    dungeon,
    rumors
  };
}

export function renderMonsterProfile(profile: MonsterProfile): string {
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
  const signs = profile.signs.map(item => `<li>${e(item)}</li>`).join("");
  const hoard = profile.hoard.map(item => `<li>${e(item)}</li>`).join("");
  const moves = profile.moves.map(item => `<li>${e(item)}</li>`).join("");
  const rumorList = profile.rumors.map(item => `<li>${e(item)}</li>`).join("");
  const curio = profile.curio
    ? `<p><strong>${e(profile.curio.name)}</strong> — ${e(profile.curio.power)}. <em>Drawback:</em> ${e(profile.curio.drawback)}</p>`
    : "";
  const dungeon = profile.dungeon ? `<h4>Lair draft</h4>${renderDungeonProfile(profile.dungeon)}` : "";

  return [
    `<h3>${e(profile.name)}</h3>`,
    `<p><em>${capitalize(profile.nature)} · ${e(profile.size)} ${e(profile.quantity)} · Scale ${profile.ratings.scale}/10</em></p>`,
    `<p>${ratings}</p>`,
    `<p><strong>Treasure mix</strong> — ${treasureMix}</p>`,
    `<p><strong>Inhabitants</strong> ${profile.inhabitants.rating}/6 (d6 ≤ ${profile.inhabitants.rating} each turn) · ${inhabitants}</p>`,
    `<h4>The monster</h4><p><strong>Species:</strong> ${e(profile.species)}</p><p><strong>Number:</strong> ${e(profile.count)}</p><p><strong>Alignment:</strong> ${e(profile.alignment)}</p>${tags}<p><strong>Attack:</strong> ${profile.attacks.map(e).join(", ")} · <strong>Defense:</strong> ${e(profile.defense)}</p><p><strong>Want:</strong> ${e(profile.want)}</p><ul>${moves}</ul>`,
    `<h4>Lair and territory</h4><p><strong>Lair:</strong> ${e(profile.lair)}</p><p><strong>Territory:</strong> ${e(profile.territory)}</p><p><strong>Habit:</strong> ${e(profile.habit)}</p><ul>${signs}</ul>`,
    `<h4>Hoard</h4><p><em>Loot die d${profile.lootDie}.</em></p><ul>${hoard}</ul>${curio}`,
    dungeon,
    `<h4>Rumors</h4><ul>${rumorList}</ul>`,
    "<p><em>Alternate monster profile.</em></p>"
  ].join("");
}
