// Dungeon profile → delve objectives and situations.
// See docs/plans/dungeon-delves.md §4.2–§5.

import { DEFAULT_DELVE_CONFIG, type DelveConfig } from "@/data/delve-config";
import type { InhabitantGroupId } from "@/data/inhabitants";
import type { DungeonArea, DungeonProfile } from "@/model/story/dungeon-generator";
import type { SiteRatings } from "@/model/story/site-profile";
import type { ActionId } from "@/types/character-actions";
import type { DelveObjective, DelveRatingKey, DelveSituation, DelveSituationKind } from "@/types/delves";
import type { MissionTag } from "@/types/living";
import type { Rng } from "@/utils/rng";
import { capitalize } from "@/utils/string-utils";

const GROUP_TAGS: Record<InhabitantGroupId, MissionTag> = {
  humans: "social",
  humanoids: "social",
  beasts: "wild",
  monsters: "combat",
  undead: "undead",
  constructs: "arcane",
  outsiders: "curse",
  fey: "arcane",
  plants: "wild",
  vermin: "wild"
};

const SPECIAL_AREA =
  /vault|sanctum|oracle|lake|circle|shrine|altar|throne|reliquary|treasury|hoard|mausoleum|sepulchre|prison|cellblock|laboratory|gate|pool/i;

const ACTION_FOR_KIND: Record<DelveSituationKind, ActionId> = {
  fight: "strike",
  trap: "scout",
  clue: "investigate",
  find: "craft",
  setpiece: "investigate"
};

const RATING_FOR_KIND: Record<DelveSituationKind, DelveRatingKey> = {
  fight: "danger",
  trap: "danger",
  clue: "mystery",
  find: "mystery",
  setpiece: "weirdness"
};

export function actionForKind(kind: DelveSituationKind): ActionId {
  return ACTION_FOR_KIND[kind];
}

export function ratingForKind(kind: DelveSituationKind): DelveRatingKey {
  return RATING_FOR_KIND[kind];
}

/** How many success ranks a situation takes: danger drives fights and traps, mystery clues, weirdness set pieces. */
export function situationStrength(kind: DelveSituationKind, ratings: SiteRatings, bonus = 0): number {
  const base = {
    fight: 1 + Math.floor(ratings.danger / 3),
    trap: 1 + Math.floor(ratings.danger / 4),
    clue: 1 + Math.floor(ratings.mystery / 4),
    find: 1,
    setpiece: 2 + Math.floor(ratings.weirdness / 4)
  }[kind];
  return base + bonus;
}

function stripLabel(text: string): string {
  return capitalize(text.replace(/^(Leader|Creature|Hazard|Feature|Find):\s*/i, "").trim());
}

function isArcane(text: string): boolean {
  return /rune|glyph|arcane|magic|summon|circle|portal|curse|spirit|undead|bone|tomb|corpse|elemental|otherworld/i.test(
    text
  );
}

function tagsFor(kind: DelveSituationKind, text: string, groupTags: readonly MissionTag[]): MissionTag[] {
  switch (kind) {
    case "fight":
      return ["combat", ...(isArcane(text) ? (["arcane"] as const) : []), ...groupTags];
    case "trap":
      return ["trap", ...(isArcane(text) ? (["arcane"] as const) : [])];
    case "setpiece":
      return ["ruin", "arcane", ...groupTags];
    case "clue":
      return ["ruin", ...(isArcane(text) ? (["arcane"] as const) : [])];
    case "find":
      return ["ruin"];
  }
}

function makeSituation(
  kind: DelveSituationKind,
  text: string,
  area: DungeonArea,
  ratings: SiteRatings,
  groupTags: readonly MissionTag[],
  bonus = 0
): DelveSituation {
  return {
    id: `a${area.number}:${kind}:${text}`,
    area: area.number,
    kind,
    title: stripLabel(text),
    tags: tagsFor(kind, text, groupTags),
    action: ACTION_FOR_KIND[kind],
    rating: RATING_FOR_KIND[kind],
    strength: situationStrength(kind, ratings, bonus)
  };
}

interface Candidate {
  situation: DelveSituation;
  areaType: string;
}

function situationsForArea(
  area: DungeonArea,
  ratings: SiteRatings,
  groupTags: readonly MissionTag[]
): { regular: Candidate[]; leader?: Candidate } {
  const leaderDanger = area.dangers.find(danger => danger.startsWith("Leader:"));
  const danger = area.dangers.find(entry => !entry.startsWith("Leader:"));
  const discovery = area.discoveries[0];

  const regular: Candidate[] = [];
  if (danger) {
    const kind: DelveSituationKind = danger.startsWith("Hazard:") ? "trap" : "fight";
    regular.push({ situation: makeSituation(kind, danger, area, ratings, groupTags), areaType: area.type });
  } else if (discovery) {
    const kind: DelveSituationKind = discovery.startsWith("Feature:") ? "clue" : "find";
    regular.push({ situation: makeSituation(kind, discovery, area, ratings, groupTags), areaType: area.type });
  } else if (SPECIAL_AREA.test(area.type)) {
    regular.push({ situation: makeSituation("setpiece", area.type, area, ratings, groupTags), areaType: area.type });
  } else {
    const search = `Search: the ${area.type}`;
    regular.push({ situation: makeSituation("find", search, area, ratings, groupTags), areaType: area.type });
  }

  const leader = leaderDanger
    ? { situation: makeSituation("fight", leaderDanger, area, ratings, groupTags, 1), areaType: area.type }
    : undefined;
  return { regular, leader };
}

/** Scale sets the base; the draft adjusts one step in either direction. */
export function objectiveCount(
  profile: Pick<DungeonProfile, "ratings" | "areaCount">,
  config: DelveConfig = DEFAULT_DELVE_CONFIG
): number {
  const scale = Math.max(1, Math.min(10, profile.ratings.scale));
  let count = 2 + Math.floor((scale - 1) / 2);
  if (profile.areaCount < count * config.objectives.areasPerObjective) count -= 1;
  if (profile.areaCount >= config.objectives.hugeAreas) count += 1;
  const bounded = Math.min(Math.max(count, config.objectives.min), config.objectives.max);
  return Math.max(1, Math.min(bounded, profile.areaCount));
}

export function buildObjectives(profile: DungeonProfile, config: DelveConfig = DEFAULT_DELVE_CONFIG): DelveObjective[] {
  if (!profile.areas.length) return [];
  const count = objectiveCount(profile, config);
  const groupTags = profile.inhabitants.groups.map(group => GROUP_TAGS[group.id] ?? "combat").slice(0, 2);

  let regular: Candidate[] = [];
  const leaders: Candidate[] = [];
  for (const area of profile.areas) {
    const { regular: areaRegular, leader } = situationsForArea(area, profile.ratings, groupTags);
    regular.push(...areaRegular);
    if (leader) leaders.push(leader);
  }

  const budget = Math.max(1, count * 4 - leaders.length);
  if (regular.length > budget) {
    regular = Array.from({ length: budget }, (_, index) => {
      return regular[Math.floor((index * regular.length) / budget)];
    });
  }

  const chunks: Candidate[][] = Array.from({ length: count }, () => []);
  for (let index = 0; index < regular.length; index++) {
    const target = Math.min(count - 1, Math.floor((index * count) / regular.length));
    chunks[target].push(regular[index]);
  }

  for (let index = 0; index < chunks.length; index++) {
    if (chunks[index].length) continue;
    const area = profile.areas[index % profile.areas.length];
    chunks[index].push({
      situation: makeSituation("find", `Search: the ${area.type}`, area, profile.ratings, groupTags),
      areaType: area.type
    });
  }

  if (leaders.length) chunks[chunks.length - 1].push(...leaders);

  return chunks.map((chunk, index) => {
    const last = index === chunks.length - 1;
    const firstType = chunk[0]?.areaType ?? profile.areas[0].type;
    const title = index === 0 ? `Breach the ${firstType}` : last ? `Reach the ${firstType}` : `Clear the ${firstType}`;
    return {
      index: index + 1,
      title,
      situations: chunk.map(candidate => candidate.situation),
      status: "pending" as const
    };
  });
}

export function buildInjectedObjective(profile: DungeonProfile, index: number, rng: Rng): DelveObjective {
  const area = profile.areas.length ? rng.choice(profile.areas) : undefined;
  if (!area) {
    return { index, title: "Press deeper", situations: [], status: "pending" };
  }
  const groupTags = profile.inhabitants.groups.map(group => GROUP_TAGS[group.id] ?? "combat").slice(0, 2);
  const { regular, leader } = situationsForArea(area, profile.ratings, groupTags);
  const situations = [...regular, ...(leader ? [leader] : [])].map(candidate => candidate.situation);
  return { index, title: `Press into the ${area.type}`, situations, status: "pending" };
}

/** Altered scenes swap the situation for another kind, recomputed against the same ratings. */
export function alterSituation(situation: DelveSituation, rng: Rng, ratings: SiteRatings): DelveSituation {
  const kinds: DelveSituationKind[] = ["fight", "trap", "clue", "find", "setpiece"];
  const current = kinds.indexOf(situation.kind);
  const kind = kinds[(current + 1 + rng.int(0, kinds.length - 2)) % kinds.length];
  return {
    ...situation,
    kind,
    action: ACTION_FOR_KIND[kind],
    rating: RATING_FOR_KIND[kind],
    strength: situationStrength(kind, ratings),
    tags: tagsFor(kind, situation.title, [])
  };
}
