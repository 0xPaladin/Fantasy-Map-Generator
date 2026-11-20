// Delve journal: the event log as a marker-note record.
// See docs/plans/dungeon-delves.md §7.

import { type DelveLoot, type DelveResult, TREASURE_PARTS } from "@/types/delves";
import { capitalize, escapeHtml } from "@/utils/string-utils";

const OUTCOME_LABEL: Record<DelveResult["outcome"], string> = {
  triumph: "Triumph",
  retreat: "Retreat",
  defeat: "Defeat"
};

function lootText(loot: DelveLoot): string {
  const parts = TREASURE_PARTS.filter(part => loot[part] > 0).map(part => `${capitalize(part)} ${loot[part]}`);
  return parts.length ? parts.join(" · ") : "nothing";
}

function summary(result: DelveResult): string {
  return [
    `Objectives ${result.objectivesDone}/${result.objectivesTotal}`,
    `Alert ${result.startingAlert} → ${result.alert}`,
    `${result.turns} turns`,
    `${result.xp} XP`
  ].join(" · ");
}

export function renderDelveRecordMarkdown(result: DelveResult): string {
  const lines = [
    `## Delve record — ${OUTCOME_LABEL[result.outcome]}`,
    `**${summary(result)}**`,
    `**Loot:** ${lootText(result.loot)}`,
    ""
  ];
  for (const event of result.events) {
    if (event.type === "delve_start") continue;
    lines.push(`- Turn ${event.turn} — ${event.text}`);
  }
  return lines.join("\n");
}

export function renderDelveRecordHtml(result: DelveResult): string {
  const items = result.events
    .filter(event => event.type !== "delve_start")
    .map(event => `<li>Turn ${event.turn} — ${escapeHtml(event.text)}</li>`)
    .join("");
  return [
    `<p><strong>Delve record — ${OUTCOME_LABEL[result.outcome]}</strong></p>`,
    `<p><em>${escapeHtml(summary(result))}</em></p>`,
    `<p><strong>Loot:</strong> ${escapeHtml(lootText(result.loot))}</p>`,
    `<ul>${items}</ul>`
  ].join("");
}
