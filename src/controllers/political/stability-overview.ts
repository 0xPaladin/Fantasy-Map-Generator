import { EXPENSE_LABELS } from "@/data/id-labels";
import { Corruption } from "@/model/economy/corruption";
import { StateOrders } from "@/model/economy/state-orders";
import type { Burg } from "@/model/political/burgs-generator";
import { Provinces } from "@/model/political/provinces-generator";
import { STABILITY_PARTS, Stability, type StabilityPart } from "@/model/political/stability";
import { States } from "@/model/political/states-generator";
import { getDecima } from "@/model/units";
import { Dialog } from "@/ui/dialog/dialog";
import { ECONOMY_COLORS, EconomyTerms, mountAdjustments, renderSimAdjustments, tone } from "@/ui/economy-view";
import { tip } from "@/ui/tooltips";
import { t } from "@/utils/i18n";
import { ensureEl } from "@/utils/node-utils";
import { rn } from "@/utils/number-utils";
import { escapeHtml } from "@/utils/string-utils";

const dialogPrefix = "stabilityOverview";
const REMOTE_DECIMAS = 2; // as the province table counts remoteness

const STYLE = /* html */ `<style>
  .stabilityDialog > div { width: auto }
  .stabilityDialog h4 { margin: 0.4em 0 0.3em; border-bottom: 1px solid var(--dark-solid) }
  .stabilityDialog .row { display: grid; grid-template-columns: 9em auto 2.5em; align-items: center; column-gap: 0.4em; line-height: 1.5; white-space: nowrap }
  .stabilityDialog .row.plain { grid-template-columns: 1fr auto }
  .stabilityDialog .bar { height: 0.7em; background: #eee }
  .stabilityDialog .bar > div { height: 100% }
  .stabilityDialog .right { text-align: right; white-space: nowrap }
  .stabilityDialog .total { font-weight: bold; border-top: 1px solid #ccc }
  .stabilityDialog .scroll { max-height: 18em; overflow-y: auto }
  .stabilityDialog table.provinces { width: 100%; border-collapse: collapse }
  .stabilityDialog table.provinces th { text-align: right; font-weight: normal; color: #666; padding: 0 0.3em }
  .stabilityDialog table.provinces td { text-align: right; padding: 0 0.3em; line-height: 1.5 }
  .stabilityDialog table.provinces th:first-child, .stabilityDialog table.provinces td:first-child { text-align: left }
</style>`;

/** Opens one dialog per state, so states can be compared side by side */
function open(stateId: number): void {
  const state = pack.states[stateId];
  if (!stateId || !state || state.removed) return;
  const stability = Stability.get(stateId);
  if (!stability) {
    tip(EconomyTerms.noData(), true, "error", 5000);
    return;
  }

  const id = `${dialogPrefix}${stateId}`;
  Dialog.destroy(id);
  ensureEl("dialogs").insertAdjacentHTML(
    "beforeend",
    /* html */ `<div id="${id}" class="dialog stable stabilityDialog">${STYLE}
      <div id="stabilityParts${stateId}">${renderParts(stability)}</div>
      <div id="stabilityAdjustments${stateId}"></div>
      <div id="stabilitySimAdjustments${stateId}"></div>
      <div id="stabilityProvinces${stateId}">${renderProvinces(stateId)}</div>
    </div>`
  );
  mountStabilityAdjustments(stateId);
  Dialog.open(id, {
    title: t("Stability of {{- state}}", { state: state.fullName || state.name }),
    width: "fit-content",
    onClose: () => Dialog.destroy(id),
    position: { my: "right top", at: "right-10 top+10", of: "svg" }
  });
}

/** Opens one dialog per province, listing the province's burgs where the state's lists its provinces */
function openProvince(provinceId: number): void {
  const province = pack.provinces?.[provinceId];
  if (!provinceId || !province || province.removed) return;
  const stability = Stability.getProvince(provinceId);
  if (!stability) {
    tip(EconomyTerms.noData(), true, "error", 5000);
    return;
  }

  const id = `${dialogPrefix}Province${provinceId}`;
  Dialog.destroy(id);
  ensureEl("dialogs").insertAdjacentHTML(
    "beforeend",
    /* html */ `<div id="${id}" class="dialog stable stabilityDialog">${STYLE}
      <div id="stabilityProvinceParts${provinceId}">${renderParts(stability)}</div>
      <div id="stabilityProvinceAdjustments${provinceId}"></div>
      <div id="stabilityProvinceSimAdjustments${provinceId}"></div>
      <div id="stabilityProvinceBurgs${provinceId}">${renderBurgs(provinceId)}</div>
    </div>`
  );
  mountProvinceStabilityAdjustments(provinceId);
  Dialog.open(id, {
    title: t("Stability of {{- province}}", { province: province.fullName || province.name }),
    width: "fit-content",
    onClose: () => Dialog.destroy(id),
    position: { my: "right top", at: "right-10 top+10", of: "svg" }
  });
}

const formatPct = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${rn(Math.abs(value), 1)}%`;

function mountStabilityAdjustments(stateId: number): void {
  const state = pack.states[stateId];
  mountAdjustments(
    ensureEl(`stabilityAdjustments${stateId}`),
    state.economy.stabilityAdjustments ?? [],
    t("Adjustments: percentage-point modifiers to state stability, set by you"),
    adjustments => {
      States.setStabilityAdjustments(stateId, adjustments);
      const updated = Stability.get(stateId);
      if (!updated) return;
      ensureEl(`stabilityParts${stateId}`).innerHTML = renderParts(updated);
      ensureEl(`stabilityProvinces${stateId}`).innerHTML = renderProvinces(stateId);
    },
    formatPct,
    {
      step: "1",
      valueTip: t("Stability points (%); negative to lower stability"),
      addTip: t("Add stability modifier")
    }
  );
  const simLines = [
    ...(state.economy.simStabilityAdjustments ?? []),
    ...(pack.provinces ?? [])
      .filter(p => p?.i && !p.removed && p.state === stateId && p.simStabilityAdjustments?.length)
      .flatMap(p => p.simStabilityAdjustments!.map(line => ({ name: `${p.name}: ${line.name}`, value: line.value })))
  ];
  renderSimAdjustments(
    ensureEl(`stabilitySimAdjustments${stateId}`),
    simLines,
    t("Stability modifiers written by the Living World"),
    formatPct
  );
}

/** A province's own stability, with its burgs where the state dialog lists its provinces */
function mountProvinceStabilityAdjustments(provinceId: number): void {
  const province = pack.provinces[provinceId];
  const state = pack.states[province.state];

  const refresh = () => {
    const updated = Stability.getProvince(provinceId);
    if (!updated) return;
    ensureEl(`stabilityProvinceParts${provinceId}`).innerHTML = renderParts(updated);
    ensureEl(`stabilityProvinceBurgs${provinceId}`).innerHTML = renderBurgs(provinceId);
  };

  mountAdjustments(
    ensureEl(`stabilityProvinceAdjustments${provinceId}`),
    province.stabilityAdjustments ?? [],
    t("Adjustments: percentage-point modifiers to provincial stability, set by you"),
    adjustments => {
      Provinces.setStabilityAdjustments(provinceId, adjustments);
      refresh();
    },
    formatPct,
    {
      step: "1",
      valueTip: t("Stability points (%); negative to lower stability"),
      addTip: t("Add stability modifier")
    }
  );

  const simLines = [
    ...(province.simStabilityAdjustments ?? []).map(line => ({
      name: `${province.name}: ${line.name}`,
      value: line.value
    })),
    ...(state.economy.simStabilityAdjustments ?? []).map(line => ({
      name: `${state.name}: ${line.name}`,
      value: line.value
    }))
  ];
  renderSimAdjustments(
    ensureEl(`stabilityProvinceSimAdjustments${provinceId}`),
    simLines,
    t("Stability modifiers written by the Living World"),
    formatPct
  );
}

/** Each part of a state's or province's stability, for or against; the base is the same for all */
function renderParts(stability: NonNullable<ReturnType<typeof Stability.get>>): string {
  const labels: Record<StabilityPart, string> = {
    base: t("Base"),
    prosperity: t("Prosperity"),
    court: EXPENSE_LABELS.court,
    army: t("Army"),
    remoteness: t("Remoteness"),
    diversity: t("Minorities"),
    corruption: t("Corruption"),
    burden: t("Tax burden"),
    adjustments: t("Adjustments")
  };
  const signed = (value: number) => `${value >= 0 ? "+" : "−"}${rn(Math.abs(value) * 100)}`;
  const rows = STABILITY_PARTS.map(part => {
    const value = stability.parts[part];
    const color = value >= 0 ? ECONOMY_COLORS.positive : ECONOMY_COLORS.negative;
    const bar =
      part === "base"
        ? "<span></span>"
        : `<div class="bar"><div style="width: ${Math.min(100, Math.abs(value) * 200)}%; background: ${color}"></div></div>`;
    return `<div class="row"><span>${labels[part]}</span>${bar}<span class="right ${tone(value)}">${signed(value)}</span></div>`;
  }).join("");
  const total = `<div class="row plain total"><span>${t("Stability")}</span><span class="right">${rn(stability.stability * 100)}%</span></div>`;
  return `<div><h4>${t("Stability")}</h4>${rows}${total}</div>`;
}

/** Each province, least stable first */
function renderProvinces(stateId: number): string {
  const state = pack.states[stateId];
  const provinces = Stability.getProvinces(stateId);
  if (provinces.length < 2) return "";
  const infrastructure = StateOrders.getInfrastructure(state);
  const percent = (value: number) => `${rn(value * 100)}%`;
  const rows = provinces
    .toSorted((a, b) => a.stability - b.stability)
    .map(({ province, stability }) => {
      const name = province.id ? escapeHtml(pack.provinces[province.id]?.name ?? "—") : "—";
      const corruption = Corruption.ofProvince(state, province, state.economy.collected);
      return `<tr><td>${name}</td><td>${percent(province.share)}</td><td>${percent(province.remoteness)}</td><td>${percent(province.diversity)}</td><td>${rn(corruption)}%</td><td>${percent(infrastructure.get(province.id) ?? 0)}</td><td><b>${percent(stability)}</b></td></tr>`;
    })
    .join("");
  const header = [
    [t("Province"), ""],
    [t("People"), t("Share of the state's people")],
    [t("Remoteness"), t("Distance from the capital")],
    [t("Minorities"), t("Share of other cultures and faiths")],
    [t("Corruption"), t("Share of state spending officials pocket")],
    [t("Infrastructure"), t("How well the state's public works serve the people")],
    [t("Stability"), EconomyTerms.stability()]
  ]
    .map(([label, tipText]) => `<th${tipText ? ` data-tip="${tipText}"` : ""}>${label}</th>`)
    .join("");
  return `<h4>${t("Provinces")}</h4><div class="scroll"><table class="provinces"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** Each burg in the province, the way the state dialog lists its provinces */
function renderBurgs(provinceId: number): string {
  const province = pack.provinces[provinceId];
  const state = pack.states[province.state];
  const stability = Stability.getProvince(provinceId);
  if (!stability) return "";

  const burgs = (province.burgs ?? [])
    .map(id => pack.burgs[id])
    .filter((burg): burg is Burg => Boolean(burg?.i && !burg.removed && burg.state === province.state));
  if (burgs.length === 0) return `<h4>${t("Burgs")}</h4><div class="right">${t("No burgs")}</div>`;

  const spread = Corruption.getProvinces(province.state).find(entry => entry.id === provinceId);
  const corruption = spread ? Corruption.ofProvince(state, spread, state.economy.collected) : 0;
  const infrastructure = StateOrders.getInfrastructure(state).get(provinceId) ?? 0;
  const people = spread?.people ?? 0;
  const center = pack.burgs[province.burg ?? 0];
  const reach = REMOTE_DECIMAS * getDecima();
  const stateFaith = pack.cells.religion?.[pack.burgs[state.capital]?.cell ?? -1] || 0;
  const percent = (value: number) => `${rn(value * 100)}%`;

  const remoteness = (burg: Burg): number => {
    if (!center?.i || burg === center || center.removed) return 0;
    const overseas = pack.cells.f?.[burg.cell] !== pack.cells.f?.[center.cell];
    return overseas ? 1 : Math.min(1, Math.hypot(burg.x - center.x, burg.y - center.y) / reach);
  };
  const minorities = (burg: Burg): number =>
    (pack.cells.culture?.[burg.cell] !== state.culture ? 0.5 : 0) +
    ((pack.cells.religion?.[burg.cell] ?? 0) !== stateFaith ? 0.5 : 0);

  const rows = burgs
    .toSorted((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .map(burg => {
      const share = people ? (burg.population ?? 0) / people : 0;
      return `<tr><td>${escapeHtml(burg.name ?? "—")}</td><td>${percent(share)}</td><td>${percent(remoteness(burg))}</td><td>${percent(minorities(burg))}</td><td>${rn(corruption)}%</td><td>${percent(infrastructure)}</td><td><b>${percent(stability.stability)}</b></td></tr>`;
    })
    .join("");

  const header = [
    [t("Burg"), ""],
    [t("People"), t("Share of the province's people")],
    [t("Remoteness"), t("Distance from the province's capital")],
    [t("Minorities"), t("Share of other cultures and faiths")],
    [t("Corruption"), t("Share of state spending officials pocket")],
    [t("Infrastructure"), t("How well the state's public works serve the people")],
    [t("Stability"), EconomyTerms.stability()]
  ]
    .map(([label, tipText]) => `<th${tipText ? ` data-tip="${tipText}"` : ""}>${label}</th>`)
    .join("");
  return `<h4>${t("Burgs")}</h4><div class="scroll"><table class="provinces"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export const StabilityOverview = { open, openProvince };
