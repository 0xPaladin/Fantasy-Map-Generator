// Deterministic bandit profiles over data/bandits.ts
import {
  BANDIT_INHABITANTS,
  BANDIT_LEADERS,
  BANDIT_LOCALITIES,
  BANDIT_MOVES,
  BANDIT_RUMORS,
  BANDIT_TREASURE,
  BANDIT_WANTS,
  BANDIT_WEAPONS,
  CONTRABAND,
  GANG_COMPOSITIONS,
  GANG_SIZES,
  type GangSize,
  LEADER_TRAITS,
  RAID_PREY,
  RAID_TACTICS
} from "@/data/bandits";
import {
  CREATURE_ALIGNMENT,
  CREATURE_DEFENSES,
  CREATURE_TAGS,
  CREATURE_WEALTH,
  type CreatureWealth,
  LOOT_CONTEXTS
} from "@/data/creatures";
import type { Alignment } from "@/data/culture-traits";
import { TREASURE_CATEGORIES, type TreasureShares } from "@/data/treasure";
import {
  type Curio,
  clamp,
  pick,
  pickWeighted,
  rollCreatureInhabitants,
  rollCurio
} from "@/model/story/creature-generator";
import type { BanditContext } from "@/model/story/creature-profile";
import { type DungeonProfile, generateDungeonProfile, renderDungeonProfile } from "@/model/story/dungeon-generator";
import type { SiteInhabitants, SiteRatings } from "@/model/story/site-profile";
import { normalizeTreasureShares, treasureBand } from "@/model/story/treasure";
import { createRng, type Rng } from "@/utils/rng";
import { capitalize, escapeHtml } from "@/utils/string-utils";

export interface BanditProfile {
  name: string;
  epithet?: string;
  gang: string;
  gangSize: GangSize;
  count: string;
  composition: string;
  leader: string;
  leaderTrait: string;
  locality: string;
  maritime: boolean;
  base: string;
  prey: string;
  tactic: string;
  alignment: Alignment;
  tags: string[];
  weapons: string[];
  defense: string;
  want: string;
  moves: string[];
  ratings: SiteRatings;
  inhabitants: SiteInhabitants;
  treasure: { shares: TreasureShares };
  loot: string[];
  wealth: CreatureWealth;
  contraband: string;
  curio?: Curio;
  dungeon?: DungeonProfile;
  rumors: string[];
}

const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/\[(culture|name|locality|biome|leader)\]/gi, (_match, key: string) => values[key.toLowerCase()] ?? "");

const uniquePicks = <T>(rng: Rng, table: readonly T[], count: number): T[] => {
  const pool = [...table];
  const result: T[] = [];
  while (result.length < count && pool.length) result.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return result;
};

function rollLoot(rng: Rng, count: number, hasCurio: boolean): string[] {
  const carried = LOOT_CONTEXTS.find(row => row.context === "carried")!.forms;
  const stashed = LOOT_CONTEXTS.find(row => row.context === "stashed")!.forms;
  const pool = [...new Set([...carried, ...stashed])];
  const loot = uniquePicks(rng, pool, count);
  if (hasCurio && !loot.includes("a curio")) loot.push("a curio");
  return loot;
}

function rollBaseDraft(
  context: BanditContext,
  gang: (typeof GANG_SIZES)[number],
  maritime: boolean,
  alignment: Alignment,
  name: string,
  salt: string
): DungeonProfile | undefined {
  if (gang.size !== "company" && gang.size !== "crew") return undefined;
  return generateDungeonProfile(
    {
      seed: context.seed,
      cell: context.cell,
      cultureName: context.cultureName,
      alignment,
      biomeName: context.biomeName,
      height: context.height,
      name
    },
    salt ? `bandit:${salt}` : "bandit",
    { type: maritime ? "lair" : "stronghold", size: "small", name }
  );
}

function rollRatings(
  gang: (typeof GANG_SIZES)[number],
  leaderTrait: string,
  maritime: boolean,
  composition: string,
  contraband: string,
  tags: string[],
  wealth: CreatureWealth,
  wealthRank: number,
  hasCurio: boolean
): SiteRatings {
  const danger = clamp(
    2 + gang.encounterBonus + (["cruel", "zealous", "paranoid"].includes(leaderTrait) ? 1 : 0) + (maritime ? 1 : 0),
    1,
    10
  );
  const treasure = clamp(1 + wealthRank + (wealth === "wealthy" || wealth === "fabulous" ? 1 : 0), 1, 10);
  const scale = clamp(2 + gang.encounterBonus * 2, 1, 10);
  const mystery = clamp(
    1 +
      (tags.includes("stealthy") ? 1 : 0) +
      (leaderTrait === "cunning" ? 1 : 0) +
      (leaderTrait === "paranoid" ? 1 : 0),
    1,
    10
  );
  const weirdness = clamp(
    1 + (hasCurio ? 2 : 0) + (composition === "cultists" ? 1 : 0) + (contraband === "forbidden relics" ? 1 : 0),
    1,
    10
  );
  return { danger, treasure, scale, mystery, weirdness };
}

export function generateBanditProfile(context: BanditContext, salt = ""): BanditProfile {
  const rng = createRng(`${context.seed}:bandit:${context.cell}${salt ? `:${salt}` : ""}`);
  const gang = pickWeighted(
    rng,
    GANG_SIZES.map(row => ({ value: row, weight: row.weight }))
  );
  const maritime = context.maritime === true;
  const composition = pick(rng, GANG_COMPOSITIONS);
  const leader = pick(rng, BANDIT_LEADERS);
  const leaderTrait = pick(rng, LEADER_TRAITS);
  const locality = context.locality?.trim() || (maritime ? "coastal" : pick(rng, BANDIT_LOCALITIES));
  const name = context.name?.trim() || `${context.cultureName || "The"} ${locality} Gang`;
  const epithet = context.gang?.trim();
  const base = maritime
    ? pick(rng, ["a wreck", "an island", "an anchorage", "a hidden cove"])
    : pick(rng, ["a camp", "a hideout", "a fortlet", "a cave"]);
  const prey = pick(rng, RAID_PREY);
  const tactic = maritime && rng.chance(0.5) ? "boarding" : pick(rng, RAID_TACTICS);
  const alignment = pick(rng, CREATURE_ALIGNMENT[context.alignment] ?? CREATURE_ALIGNMENT.neutral);
  const tags = ["organized", "leader", ...(maritime ? ["seaborne"] : [])];
  if (rng.chance(0.5)) {
    const extra = pick(rng, CREATURE_TAGS);
    if (!tags.includes(extra)) tags.push(extra);
  }
  const weapons = uniquePicks(rng, BANDIT_WEAPONS, rng.int(1, 2));
  const defense = pick(rng, CREATURE_DEFENSES);
  const want = pick(rng, BANDIT_WANTS);
  const moves = uniquePicks(rng, BANDIT_MOVES, rng.int(3, 5));

  const wealthRow = pickWeighted(
    rng,
    CREATURE_WEALTH.map(row => ({ value: row, weight: row.weight }))
  );
  const wealth = wealthRow.wealth;
  const weights = { ...BANDIT_TREASURE };
  if (wealth === "wealthy" || wealth === "fabulous") {
    weights.regalia += 1;
    weights.art += 1;
  } else if (wealth === "penniless") {
    weights.regalia = Math.max(0, weights.regalia - 1);
    weights.art = Math.max(0, weights.art - 1);
  }
  const treasure = { shares: normalizeTreasureShares(weights) };
  const contraband = pick(rng, CONTRABAND);
  const curio =
    (wealth === "wealthy" || wealth === "fabulous") && rng.chance(0.6)
      ? rollCurio(rng, context.cultureName)
      : undefined;
  const ratings = rollRatings(
    gang,
    leaderTrait,
    maritime,
    composition,
    contraband,
    tags,
    wealth,
    wealthRow.rank,
    Boolean(curio)
  );
  const loot = rollLoot(rng, clamp(ratings.treasure, 1, 6), Boolean(curio));
  const encounterRating = clamp(2 + gang.encounterBonus + 1, 1, 6);
  const inhabitants = rollCreatureInhabitants(rng, BANDIT_INHABITANTS, encounterRating, context.cultureName, 0.3);
  const dungeon = rollBaseDraft(context, gang, maritime, alignment, name, salt);
  const rumors = [
    ...new Set(
      Array.from({ length: rng.int(2, 3) }, () =>
        fill(pick(rng, BANDIT_RUMORS), {
          culture: context.cultureName || "the local folk",
          name,
          locality,
          biome: context.biomeName || "wilderness",
          leader
        })
      )
    )
  ];

  return {
    name,
    epithet,
    gang: gang.label,
    gangSize: gang.size,
    count: gang.count,
    composition,
    leader,
    leaderTrait,
    locality,
    maritime,
    base,
    prey,
    tactic,
    alignment,
    tags,
    weapons,
    defense,
    want,
    moves,
    ratings,
    inhabitants,
    treasure,
    loot,
    wealth,
    contraband,
    curio,
    dungeon,
    rumors
  };
}

export function renderBanditProfile(profile: BanditProfile): string {
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
  const epithet = profile.epithet ? `<p><strong>Known as:</strong> the ${e(profile.epithet)}</p>` : "";
  const tags = profile.tags.length ? `<p><strong>Tags:</strong> ${profile.tags.map(e).join(", ")}</p>` : "";
  const loot = profile.loot.map(item => `<li>${e(item)}</li>`).join("");
  const moves = profile.moves.map(item => `<li>${e(item)}</li>`).join("");
  const rumorList = profile.rumors.map(item => `<li>${e(item)}</li>`).join("");
  const curio = profile.curio
    ? `<p><strong>${e(profile.curio.name)}</strong> — ${e(profile.curio.power)}. <em>Drawback:</em> ${e(profile.curio.drawback)}</p>`
    : "";
  const dungeon = profile.dungeon ? `<h4>Base draft</h4>${renderDungeonProfile(profile.dungeon)}` : "";

  return [
    `<h3>${e(profile.name)}</h3>`,
    `<p><em>${capitalize(profile.gang)} of ${e(profile.composition)} · ${profile.maritime ? "maritime" : e(profile.locality)} · Scale ${profile.ratings.scale}/10</em></p>`,
    `<p>${ratings}</p>`,
    `<p><strong>Treasure mix</strong> — ${treasureMix}</p>`,
    `<p><strong>Inhabitants</strong> ${profile.inhabitants.rating}/6 (d6 ≤ ${profile.inhabitants.rating} each turn) · ${inhabitants}</p>`,
    `<h4>The gang</h4>${epithet}<p><strong>Number:</strong> ${e(profile.count)}</p><p><strong>Leader:</strong> ${e(profile.leader)} (${e(profile.leaderTrait)})</p><p><strong>Alignment:</strong> ${e(profile.alignment)}</p>${tags}<p><strong>Weapons:</strong> ${profile.weapons.map(e).join(", ")} · <strong>Defense:</strong> ${e(profile.defense)}</p><p><strong>Want:</strong> ${e(profile.want)}</p><ul>${moves}</ul>`,
    `<h4>Base and raids</h4><p><strong>Base:</strong> ${e(profile.base)}</p><p><strong>Prey:</strong> ${e(profile.prey)}</p><p><strong>Tactic:</strong> ${e(profile.tactic)}</p>`,
    `<h4>Loot</h4><p><em>Wealth ${e(profile.wealth)}; ${treasureBand(profile.ratings.treasure)}.</em></p><ul>${loot}</ul><p><strong>Contraband:</strong> ${e(profile.contraband)}</p>${curio}`,
    dungeon,
    `<h4>Rumors</h4><ul>${rumorList}</ul>`,
    "<p><em>Alternate bandit profile.</em></p>"
  ].join("");
}
