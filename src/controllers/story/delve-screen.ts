// Dungeon delve player surface: party picker, dungeon chooser and the steppable report.
// See docs/plans/dungeon-delves.md §9.

import { ACTION_DEFS, DICE } from "@/data/character-actions";
import { Chronicle } from "@/model/physical/history-generator";
import { Living } from "@/model/physical/living-generator";
import { Characters } from "@/model/society/characters";
import { type DelveRun, runDelveAtMarker, setDelveHost } from "@/model/story/delve/apply";
import { type DungeonProfile, generateDungeonProfile } from "@/model/story/dungeon-generator";
import { DUNGEON_KIND, dungeonContext } from "@/model/story/dungeon-marker";
import type { Marker } from "@/model/story/markers-generator";
import { Layers } from "@/renderers/layers";
import type { ActionId } from "@/types/character-actions";
import type { DelveOrder } from "@/types/delves";
import type { HistoricalFigure } from "@/types/history";
import { Dialog } from "@/ui/dialog/dialog";
import { tip } from "@/ui/tooltips";
import { t } from "@/utils/i18n";
import { ensureEl } from "@/utils/node-utils";
import { capitalize, escapeHtml } from "@/utils/string-utils";

const PICKER_ID = "delvePicker";
const REPORT_ID = "delveReport";
const CHOOSER_ID = "delveDungeonChooser";

const ORDER_LABELS: Record<DelveOrder, () => string> = {
  swift: () => t("Swift"),
  cautious: () => t("Cautious"),
  greedy: () => t("Greedy")
};

function alertLabel(alert: string): string {
  if (alert === "quiet") return t("Quiet");
  if (alert === "uneasy") return t("Uneasy");
  if (alert === "alerted") return t("Alerted");
  return t("Hunting");
}

interface PickerState {
  markerId: number;
  selected: number[];
  leaderId?: number;
  order: DelveOrder;
  retainers: number;
}

let picker: PickerState | null = null;

interface ReportState {
  run: DelveRun;
  profile: DungeonProfile;
  revealed: number;
}

let report: ReportState | null = null;

export function isDungeonMarker(marker: Marker): boolean {
  return marker.type === "dungeons" || marker.type === "dungeon" || marker.generated?.kind === DUNGEON_KIND;
}

function markerProfile(marker: Marker): DungeonProfile | undefined {
  const content = marker.generated;
  if (!content) return undefined;
  const salt = typeof content.meta?.salt === "string" ? content.meta.salt : "";
  return generateDungeonProfile(dungeonContext(marker.cell, content.seed, marker.name), salt);
}

function topActions(figure: HistoricalFigure): string {
  const sheet = figure.hero;
  if (!sheet) return t("Background character");
  const actions = (Object.keys(sheet.actions) as ActionId[])
    .sort((a, b) => DICE.indexOf(sheet.actions[b]) - DICE.indexOf(sheet.actions[a]))
    .slice(0, 3);
  return actions.map(action => `${ACTION_DEFS[action].label} ${sheet.actions[action]}`).join(" · ");
}

function vitals(figure: HistoricalFigure): string {
  const condition = figure.hero?.condition;
  if (!condition) return "";
  const parts = [
    `${t("Resolve")} ${condition.resolve}/${condition.maxResolve}`,
    `${t("Stamina")} ${condition.stamina}`
  ];
  if (condition.injuries.length) parts.push(`${t("Injuries")} ${condition.injuries.length}`);
  if (condition.downUntilTick !== undefined) parts.push(t("Down"));
  return parts.join(" · ");
}

function selectedFigures(): HistoricalFigure[] {
  if (!picker) return [];
  return picker.selected
    .map(id => Characters.get(id))
    .filter((figure): figure is HistoricalFigure => Boolean(figure && !figure.death && !figure.removed));
}

function candidateFigures(): HistoricalFigure[] {
  return Characters.active()
    .filter(figure => figure.death === undefined)
    .sort((a, b) => {
      const byHero = Number(Boolean(b.hero)) - Number(Boolean(a.hero));
      return byHero || a.name.localeCompare(b.name);
    });
}

function renderPicker(): void {
  if (!picker) return;
  const marker = pack.markers.find(entry => entry.i === picker!.markerId);
  if (!marker) return;

  Dialog.destroy(PICKER_ID);
  const selected = new Set(picker.selected);
  const rows = candidateFigures()
    .map(figure => {
      const active = selected.has(figure.i);
      const background = !figure.hero;
      return `<label class="delveHero" data-hero="${figure.i}" style="display:flex;gap:6px;align-items:center;padding:3px 4px;border-bottom:1px solid rgba(0,0,0,0.08);cursor:pointer;">
        <input type="checkbox" data-hero="${figure.i}" ${active ? "checked" : ""} />
        <span style="flex:1;min-width:0;">
          <span style="font-weight:600;">${escapeHtml(figure.name)}</span>
          <span class="badge" style="margin-left:4px;">${background ? t("Background") : t("Hero")}</span>
          <span style="display:block;font-size:0.82em;opacity:0.8;">${escapeHtml(topActions(figure))}</span>
        </span>
        <span style="font-size:0.8em;opacity:0.85;text-align:right;white-space:nowrap;">${escapeHtml(vitals(figure))}</span>
      </label>`;
    })
    .join("");

  const leaderOptions = picker.selected
    .map(id => Characters.get(id))
    .filter((figure): figure is HistoricalFigure => Boolean(figure))
    .map(
      figure =>
        `<option value="${figure.i}" ${figure.i === picker!.leaderId ? "selected" : ""}>${escapeHtml(figure.name)}</option>`
    )
    .join("");

  const orderOptions = (Object.keys(ORDER_LABELS) as DelveOrder[])
    .map(
      order => `<option value="${order}" ${order === picker!.order ? "selected" : ""}>${ORDER_LABELS[order]()}</option>`
    )
    .join("");

  const html = /* html */ `<div id="${PICKER_ID}" class="dialog stable" style="width: 640px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
      <div>
        <div style="font-weight:bold;">${escapeHtml(marker.name)}</div>
        <div style="font-size:0.85em;opacity:0.8;">${t("Choose up to six heroes")}</div>
      </div>
      <div id="delveSelectedCount" style="font-size:0.85em;">${picker.selected.length}/6</div>
    </div>
    <div id="delvePickerBody" class="table" style="max-height:360px;overflow-y:auto;">${rows}</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px;">
      <label style="display:flex;flex-direction:column;">${t("Leader")}<select id="delveLeader">${leaderOptions}</select></label>
      <label style="display:flex;flex-direction:column;">${t("Order")}<select id="delveOrder">${orderOptions}</select></label>
      <label style="display:flex;flex-direction:column;">${t("Retainers")}<input id="delveRetainers" type="number" min="0" max="4" value="${picker.retainers}" /></label>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px;">
      <button id="delveWithdraw" class="btn">${t("Withdraw")}</button>
      <button id="delveDispatch" class="btn">${t("Send Party")}</button>
    </div>
  </div>`;

  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);
  Dialog.open(PICKER_ID, {
    title: t("Delve"),
    width: "fit-content",
    position: { my: "center", at: "center", of: "svg" }
  });
  wirePicker();
}

function wirePicker(): void {
  const body = ensureEl("delvePickerBody");
  body.addEventListener("change", event => {
    const input = event.target as HTMLInputElement;
    if (input.type !== "checkbox" || !picker) return;
    const id = Number(input.dataset.hero);
    if (input.checked) {
      if (picker.selected.length >= 6) {
        input.checked = false;
        tip(t("A delve needs 1–6 heroes"), false, "error", 3000);
        return;
      }
      picker.selected.push(id);
    } else {
      picker.selected = picker.selected.filter(selectedId => selectedId !== id);
    }
    picker.leaderId = picker.selected.includes(picker.leaderId ?? -1) ? picker.leaderId : picker.selected[0];
    renderPicker();
  });

  ensureEl<HTMLSelectElement>("delveLeader").addEventListener("change", function () {
    if (picker) picker.leaderId = Number(this.value);
  });
  ensureEl<HTMLSelectElement>("delveOrder").addEventListener("change", function () {
    if (picker) picker.order = this.value as DelveOrder;
  });
  ensureEl<HTMLInputElement>("delveRetainers").addEventListener("change", function () {
    if (picker) picker.retainers = Math.max(0, Math.min(4, Number(this.value) || 0));
  });
  ensureEl("delveWithdraw").addEventListener("click", () => {
    picker = null;
    Dialog.destroy(PICKER_ID);
  });
  ensureEl("delveDispatch").addEventListener("click", dispatch);
}

function dispatch(): void {
  if (!picker) return;
  const figures = selectedFigures();
  if (!figures.length) {
    tip(t("Select at least one hero"), false, "error", 3000);
    return;
  }

  const leaderId = picker.leaderId ?? figures[0].i;
  const party = [leaderId, ...figures.map(figure => figure.i).filter(id => id !== leaderId)];
  const request = {
    markerId: picker.markerId,
    party,
    order: picker.order,
    retainers: picker.retainers
  };

  let run: DelveRun;
  try {
    run = withLivingHost(() => runDelveAtMarker(request));
  } catch (error) {
    Dialog.message({ title: t("Cannot send the party"), message: escapeHtml(String(error)) });
    return;
  }

  picker = null;
  Dialog.destroy(PICKER_ID);
  const marker = pack.markers.find(entry => entry.i === run.marker.i);
  const profile = marker ? markerProfile(marker) : undefined;
  if (!profile) {
    tip(t("Generated profile is unavailable"), false, "error", 3000);
    return;
  }
  openReport(run, profile);
  Layers.draw("markers");
}

/** Attach the living-world news ticker when the map has a Living World. */
function withLivingHost<T>(callback: () => T): T {
  const living = pack.history?.living;
  setDelveHost({
    getMarker: id => pack.markers.find(marker => marker.i === id),
    getFigure: id => Characters.get(id),
    getHistory: () => Chronicle.sync(),
    tick: () => living?.tick ?? 0,
    year: () => options.map.lore.calendar.year ?? 1000,
    ...(living
      ? { pushNews: (text: string, cell: number) => Living.pushNews(living, { kind: "delve", text, cell }) }
      : {})
  });
  try {
    return callback();
  } finally {
    setDelveHost(undefined);
  }
}

function openReport(run: DelveRun, profile: DungeonProfile): void {
  report = { run, profile, revealed: 0 };
  Dialog.destroy(REPORT_ID);

  const shares = (Object.keys(profile.treasure.shares) as (keyof typeof profile.treasure.shares)[])
    .filter(part => profile.treasure.shares[part] > 0)
    .map(part => `${capitalize(part)} ${profile.treasure.shares[part]}%`)
    .join(" · ");

  const party = run.result.heroes
    .map(hero => {
      const parts = [`${t("Resolve")} ${hero.resolve}`, `${t("Stamina")} ${hero.stamina}`];
      if (hero.injuries) parts.push(`${t("Injuries")} ${hero.injuries}`);
      if (hero.down) parts.push(t("Down"));
      return `<div style="font-size:0.85em;">${escapeHtml(hero.name)} — ${parts.join(" · ")}</div>`;
    })
    .join("");

  const html = /* html */ `<div id="${REPORT_ID}" class="dialog stable" style="width:780px;">
    <div style="display:flex;gap:12px;">
      <div style="flex:0 0 250px;font-size:0.85em;">
        <div style="font-weight:bold;font-size:1.05em;">${escapeHtml(profile.name)}</div>
        <div style="opacity:0.85;">${t("Danger")} ${profile.ratings.danger}/10 · ${t("Treasure")} ${profile.ratings.treasure}/10 · ${t("Scale")} ${profile.ratings.scale}/10</div>
        <div style="opacity:0.85;">${t("Mystery")} ${profile.ratings.mystery}/10 · ${t("Weirdness")} ${profile.ratings.weirdness}/10</div>
        <div style="margin-top:4px;">${t("Treasure mix")}: ${shares}</div>
        <div style="margin-top:4px;">${t("Alert")}: ${alertLabel(run.result.startingAlert)} → ${alertLabel(run.result.alert)}</div>
        <div>${t("Chaos")}: ${run.result.chaos} · ${t("Turns")}: ${run.result.turns} · ${t("Supplies")}: ${run.result.supplies}</div>
        <div>${t("Objectives")}: ${run.result.objectivesDone}/${run.result.objectivesTotal} · ${t("XP")}: ${run.result.xp}</div>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:bold;font-size:0.9em;margin-bottom:3px;">${t("Party")}</div>
        ${party}
        <div style="font-weight:bold;font-size:0.9em;margin-top:8px;">${t("Chronicle")}</div>
        <div id="delveLog" style="font-size:0.82em;max-height:260px;overflow-y:auto;background:rgba(0,0,0,0.08);padding:6px;border-radius:3px;font-family:monospace;"></div>
      </div>
    </div>
    <div id="delveOutcome" style="margin-top:8px;"></div>
    <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px;">
      <button id="delveStep" class="btn">${t("Step")}</button>
      <button id="delveShowAll" class="btn">${t("Show all")}</button>
      <button id="delveClose" class="btn">${t("Close")}</button>
    </div>
  </div>`;

  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);
  Dialog.open(REPORT_ID, {
    title: `${t("Delve")} — ${profile.name}`,
    width: "fit-content",
    position: { my: "center", at: "center", of: "svg" },
    onClose: closeReport
  });

  ensureEl("delveStep").addEventListener("click", () => {
    if (!report) return;
    report.revealed = Math.min(report.run.result.events.length, report.revealed + 1);
    updateReport();
  });
  ensureEl("delveShowAll").addEventListener("click", () => {
    if (!report) return;
    report.revealed = report.run.result.events.length;
    updateReport();
  });
  ensureEl("delveClose").addEventListener("click", () => Dialog.close(REPORT_ID));

  updateReport();
}

function updateReport(): void {
  if (!report) return;
  const events = report.run.result.events;
  const shown = Math.min(report.revealed, events.length);
  const log = ensureEl("delveLog");
  log.innerHTML = events
    .slice(0, shown)
    .map(event => `<div><span style="opacity:0.6;">T${event.turn}</span> ${escapeHtml(event.text)}</div>`)
    .join("");
  log.scrollTop = log.scrollHeight;

  const finished = shown >= events.length;
  ensureEl<HTMLButtonElement>("delveStep").disabled = finished;
  ensureEl<HTMLButtonElement>("delveShowAll").disabled = finished;

  const outcome = ensureEl("delveOutcome");
  if (!finished) {
    outcome.innerHTML = "";
    return;
  }

  const labels: Record<string, string> = {
    triumph: t("The dungeon is cleared."),
    retreat: t("The party withdraws with what it can carry."),
    defeat: t("The party does not come back out.")
  };
  const colors: Record<string, string> = { triumph: "#27ae60", retreat: "#d68910", defeat: "#c0392b" };
  outcome.innerHTML = `<div style="padding:8px;border-radius:4px;font-weight:bold;color:${colors[report.run.result.outcome]};background:rgba(0,0,0,0.08);">${labels[report.run.result.outcome]}</div>`;
}

function closeReport(): void {
  report = null;
  Layers.draw("markers");
}

export function openPartyPicker(markerId: number, focusId?: number): void {
  if (options.app.mode) return;
  const marker = pack.markers.find(entry => entry.i === markerId);
  if (!marker || !isDungeonMarker(marker)) return;

  Dialog.closeAll(".stable");
  picker = {
    markerId,
    selected: focusId === undefined ? [] : [focusId],
    leaderId: focusId,
    order: "cautious",
    retainers: 0
  };
  renderPicker();
}

/** From the Characters editor: choose a dungeon, then the party with the hero preselected. */
export function openPartyPickerForCharacter(characterId: number): void {
  if (options.app.mode) return;
  Dialog.closeAll(".stable");

  const dungeons = pack.markers.filter(isDungeonMarker).sort((a, b) => a.name.localeCompare(b.name));
  if (!dungeons.length) {
    Dialog.message({ title: t("Choose a dungeon"), message: t("No dungeons on this map") });
    return;
  }

  const rows = dungeons
    .map(
      marker =>
        `<div class="delveDungeon" data-marker="${marker.i}" style="padding:5px 4px;border-bottom:1px solid rgba(0,0,0,0.08);cursor:pointer;">
          <strong>${escapeHtml(marker.name)}</strong>${marker.delve ? ` <span style="opacity:0.7;font-size:0.85em;">· ${delveStatusLabel(marker.delve.status)}</span>` : ""}
        </div>`
    )
    .join("");

  const html = /* html */ `<div id="${CHOOSER_ID}" class="dialog stable" style="width:460px;">
    <div style="font-size:0.85em;opacity:0.8;margin-bottom:6px;">${t("Choose a dungeon")}</div>
    <div class="table" style="max-height:50vh;overflow-y:auto;">${rows}</div>
  </div>`;

  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);
  Dialog.open(CHOOSER_ID, { title: t("Choose a dungeon"), width: "fit-content" });
  ensureEl(CHOOSER_ID)
    .querySelectorAll<HTMLElement>(".delveDungeon")
    .forEach(row => {
      row.addEventListener("click", () => {
        const markerId = Number(row.dataset.marker);
        Dialog.destroy(CHOOSER_ID);
        openPartyPicker(markerId, characterId);
      });
    });
}

function delveStatusLabel(status: string): string {
  if (status === "cleared") return t("Cleared");
  if (status === "weakened") return t("Weakened");
  return t("Undisturbed");
}

export const DelveScreen = { openPartyPicker, openPartyPickerForCharacter };
