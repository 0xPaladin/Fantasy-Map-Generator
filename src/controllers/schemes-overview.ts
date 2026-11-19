// The villain scheme sheet opened from the Characters editor. See docs/plans/villain-schemes.md.
import { Controllers } from "@/controllers";
import { Living } from "@/model/physical/living-generator";
import { Schemes } from "@/model/story/schemes-generator";
import type { Scheme } from "@/types/schemes";
import { Dialog } from "@/ui/dialog/dialog";
import { renderSchemeCard } from "@/ui/schemes-card";
import { findEl } from "@/utils";

const DIALOG_ID = "schemeOverview";

let current: { schemeId?: number; villainFigure?: number } = {};

const STYLE = /* html */ `<style>
  #${DIALOG_ID} .livingSection { margin-top: 0.55em; padding-top: 0.45em; border-top: 1px solid rgba(0, 0, 0, 0.1); }
  #${DIALOG_ID} .livingSectionTitle { font-weight: bold; font-size: 0.92em; margin-bottom: 0.25em; color: #333; }
  #${DIALOG_ID} .livingMuted { color: #666; font-size: 0.9em; }
  #${DIALOG_ID} .livingMeterRow { display: flex; align-items: center; justify-content: space-between; gap: 0.4em; margin-top: 0.2em; }
  #${DIALOG_ID} .livingBar { flex: 1; height: 6px; border-radius: 3px; background: rgba(0, 0, 0, 0.12); overflow: hidden; }
  #${DIALOG_ID} .livingBar > i { display: block; height: 100%; background: #5e4fa2; }
  #${DIALOG_ID} .livingBar.danger > i { background: #a33d3d; }
  #${DIALOG_ID} .livingBadge { display: inline-block; padding: 0.05em 0.35em; border-radius: 3px; color: #fff; font-size: 0.8em; }
  #${DIALOG_ID} .livingButtons { display: flex; flex-wrap: wrap; gap: 0.25em; margin-top: 0.25em; }
  #${DIALOG_ID} .livingButtons button { font-size: 0.85em; padding: 0.2em 0.45em; cursor: pointer; }
  #${DIALOG_ID} .livingLinkBtn { border: none; background: transparent; padding: 0; color: #3d5a99; text-decoration: underline; cursor: pointer; font-size: inherit; text-align: left; }
  #${DIALOG_ID} ul { margin: 0.2em 0 0; padding-left: 1.1em; }
</style>`;

function matchingSchemes(): Scheme[] {
  return Schemes.ensureSchemes().filter(scheme =>
    current.schemeId !== undefined
      ? scheme.i === current.schemeId
      : current.villainFigure !== undefined
        ? scheme.villainFigure === current.villainFigure
        : false
  );
}

function content(): string {
  const schemes = matchingSchemes();
  return `${STYLE}<div class="livingInspectorTitle">${schemes.length === 1 ? "Villain Scheme" : "Villain Schemes"}</div>
    ${schemes.length ? schemes.map(renderSchemeCard).join("") : '<div class="livingMuted">No scheme found for this character.</div>'}`;
}

function open(options: { schemeId?: number; villainFigure?: number } = {}): void {
  current = options;
  Dialog.destroy(DIALOG_ID);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="${DIALOG_ID}" class="dialog stable" style="width: 36em; max-height: 70vh; overflow-y: auto;">${content()}</div>`
  );
  bind();
  Dialog.open(DIALOG_ID, {
    title: "Villain Scheme",
    width: "36em",
    onClose: () => Dialog.destroy(DIALOG_ID)
  });
}

function bind(): void {
  const dialog = findEl(DIALOG_ID);
  if (!dialog) return;

  for (const button of dialog.querySelectorAll<HTMLElement>("[data-god]")) {
    button.addEventListener("click", () => runAction(button));
  }
  for (const button of dialog.querySelectorAll<HTMLElement>("[data-open='figure']")) {
    button.addEventListener("click", () => {
      const figureId = Number(button.dataset.id ?? Number.NaN);
      if (Number.isFinite(figureId)) void Controllers.CharactersEditor.openDetails(figureId);
    });
  }
}

function runAction(button: HTMLElement): void {
  const schemeId = Number(button.dataset.scheme ?? 0);
  if (!schemeId) return;

  switch (button.dataset.god) {
    case "scheme-force":
      Living.forceSchemeStep(schemeId);
      break;
    case "scheme-expose":
      Living.exposeScheme(schemeId);
      break;
    case "scheme-abort":
      Living.abortScheme(schemeId);
      break;
    case "scheme-reroll":
      Living.rerollScheme(schemeId);
      break;
    default:
      return;
  }

  const dialog = findEl(DIALOG_ID);
  if (!dialog) return;
  dialog.innerHTML = content();
  bind();
}

export const SchemesOverview = { open };
