// Scheme card markup shared by the Living World god view and the Characters editor's scheme dialog.
import { SCHEME_GOAL_BY_ID, SCHEME_VERB_LABELS } from "@/data/scheme-goals";
import type { HistRef } from "@/types/history";
import type { Scheme, SchemeStepStatus } from "@/types/schemes";
import { escapeHtml } from "@/utils";

const STATUS_ICONS: Record<SchemeStepStatus, string> = {
  done: "✓",
  active: "▶",
  pending: "·",
  failed: "✗"
};

export function schemeTargetLabel(ref: HistRef): string {
  switch (ref.kind) {
    case "figure":
      return pack.history?.figures?.find(figure => figure.i === ref.id)?.name ?? `Figure ${ref.id}`;
    case "state":
      return pack.states?.[ref.id]?.name ?? `State ${ref.id}`;
    case "religion":
      return pack.religions?.[ref.id]?.name ?? `Religion ${ref.id}`;
    case "faction":
      return pack.factions?.find(faction => faction.i === ref.id)?.name ?? `Faction ${ref.id}`;
    case "burg":
      return pack.burgs?.[ref.id]?.name ?? `Burg ${ref.id}`;
    case "realm":
      return pack.history?.realms?.find(realm => realm.i === ref.id)?.name ?? `Realm ${ref.id}`;
    case "culture":
      return pack.cultures?.[ref.id]?.name ?? `Culture ${ref.id}`;
    case "polity":
      return pack.history?.polities?.find(polity => polity.id === ref.id)?.name ?? `Polity ${ref.id}`;
    default:
      return `${ref.kind} ${ref.id}`;
  }
}

export function schemeMastermindLabel(ref: HistRef): string {
  const prefix =
    ref.kind === "state" ? "State" : ref.kind === "religion" ? "Faith" : ref.kind === "faction" ? "Faction" : ref.kind;
  return `${prefix}: ${schemeTargetLabel(ref)}`;
}

export function renderSchemeCard(scheme: Scheme): string {
  const villain = pack.history?.figures?.find(figure => figure.i === scheme.villainFigure);
  const goal = SCHEME_GOAL_BY_ID[scheme.goal];
  const template = goal?.templates.find(entry => entry.id === scheme.template)?.label ?? scheme.template;
  const active = scheme.steps.find(step => step.status === "active");
  const done = scheme.steps.filter(step => step.status === "done").length;
  const status =
    scheme.status === "active"
      ? `${done}/${scheme.steps.length} steps`
      : scheme.status === "complete"
        ? "complete"
        : "collapsed";
  const exposed = scheme.exposed ? '<span class="livingBadge" style="background:#a33d3d">exposed</span>' : "";
  const steps = scheme.steps
    .map((step, index) => {
      const label = SCHEME_VERB_LABELS[step.verb] ?? step.verb;
      const targets = step.targets.map(schemeTargetLabel).filter(Boolean).join(", ");
      const progress =
        step.progress !== undefined ? ` · ${step.progress} season${step.progress === 1 ? "" : "s"} left` : "";
      const attempts = step.attempts ? ` · ${step.attempts} push${step.attempts === 1 ? "" : "es"}` : "";
      return `<li${step.status === "active" ? ' style="font-weight:bold;"' : step.status === "done" ? ' style="opacity:0.7;"' : ""}>${STATUS_ICONS[step.status]} ${index + 1}. ${escapeHtml(label)}${targets ? ` — ${escapeHtml(targets)}` : ""}${progress}${attempts}</li>`;
    })
    .join("");

  const disabled = scheme.status === "active" ? "" : " disabled";
  const exposeDisabled = scheme.status === "active" && !scheme.exposed ? "" : " disabled";
  const secrecy = Math.max(0, Math.min(100, Math.round(scheme.secrecy)));
  return `<div class="livingSection">
    <div class="livingSectionTitle">
      <button type="button" class="livingLinkBtn" data-open="figure" data-id="${scheme.villainFigure}" title="Open the villain's character sheet">${escapeHtml(villain?.name ?? "Unknown hand")}</button>
      ${exposed}
    </div>
    <div>${escapeHtml(goal?.label ?? scheme.goal)} <span class="livingMuted">· ${escapeHtml(template)}</span></div>
    <div class="livingMuted">${escapeHtml(schemeMastermindLabel(scheme.mastermind))} · ${status}${active ? ` · now: ${escapeHtml(SCHEME_VERB_LABELS[active.verb] ?? active.verb)}` : ""}</div>
    <div class="livingMeterRow" title="Secrecy ${secrecy}%${scheme.exposed ? " (exposed)" : ""}">
      <span>Secrecy</span>
      <div class="livingBar${scheme.exposed ? " danger" : ""}"><i style="width:${secrecy}%"></i></div>
      <span>${scheme.exposed ? "exposed" : `${secrecy}%`}</span>
    </div>
    <ul>${steps}</ul>
    <div class="livingButtons">
      <button type="button" data-god="scheme-force" data-scheme="${scheme.i}"${disabled}>Force step</button>
      <button type="button" data-god="scheme-expose" data-scheme="${scheme.i}"${exposeDisabled}>Expose</button>
      <button type="button" data-god="scheme-abort" data-scheme="${scheme.i}"${disabled}>Abort</button>
      <button type="button" data-god="scheme-reroll" data-scheme="${scheme.i}"${disabled}>Re-roll</button>
    </div>
  </div>`;
}
