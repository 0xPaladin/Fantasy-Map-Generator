// Mission tags are derived from the target, never stored on the mission definition.
// See docs/plans/hero-diversity.md.
import type { MissionTag, ProvinceLair, ProvinceTrouble } from "@/types/living";

const MAGICAL_TROUBLES = new Set([
  "ancient_curse",
  "leyline_blight",
  "dark_wizards",
  "sinister_cult",
  "doomsday_cult",
  "relic_golems",
  "taboo_land",
  "things_from_below",
  "blight_spawn"
]);
const CURSE_TROUBLES = new Set(["ancient_curse", "leyline_blight", "taboo_land", "things_from_below"]);
const UNDEAD_TROUBLES = new Set(["angry_dead", "things_from_below"]);
const PLAGUE_TROUBLES = new Set(["contaminated_land", "recurrent_sickness", "toxic_process", "blight_spawn"]);

export const MISSION_TAG_LABELS: Record<string, string> = {
  combat: "combat",
  lair: "lair",
  ruin: "ruin",
  wild: "wild",
  travel: "travel",
  arcane: "arcane",
  curse: "curse",
  plague: "plague",
  undead: "undead",
  social: "social",
  petition: "petition",
  intrigue: "intrigue",
  trap: "trap",
  order: "order",
  trouble: "trouble"
};

export function troubleMissionTags(
  trouble: Pick<ProvinceTrouble, "id" | "pool" | "save" | "requiredRole">
): MissionTag[] {
  const tags: MissionTag[] = ["trouble", `save:${trouble.save}`, `role:${trouble.requiredRole}`];
  if (trouble.pool === "m") tags.push("combat");
  if (trouble.pool === "s") tags.push("social");
  if (MAGICAL_TROUBLES.has(trouble.id)) tags.push("arcane");
  if (CURSE_TROUBLES.has(trouble.id)) tags.push("curse");
  if (UNDEAD_TROUBLES.has(trouble.id)) tags.push("undead");
  if (PLAGUE_TROUBLES.has(trouble.id)) tags.push("plague");
  return tags;
}

export function lairMissionTags(lair: Pick<ProvinceLair, "theme">): MissionTag[] {
  return ["lair", "combat", lair.theme === "ruin" ? "ruin" : "wild"];
}

export function excavationMissionTags(marker: { type?: string; chronicle?: boolean }): MissionTag[] {
  const tags: MissionTag[] = ["ruin"];
  if (marker.chronicle) tags.push("arcane");
  if (marker.type === "dungeon" || marker.type === "cave") tags.push("trap");
  return tags;
}

export const PACIFY_MISSION_TAGS: readonly MissionTag[] = ["social", "order"];

/** One short line for the HUD. */
export function missionTagsText(tags: readonly MissionTag[] | undefined, fallback = ""): string {
  if (!tags?.length) return fallback;
  return tags.map(tag => MISSION_TAG_LABELS[tag] ?? tag).join(" · ");
}
