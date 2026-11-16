// The Networks tool: manage the created networks and edit one network's kind, placement and links
import { type D3DragEvent, drag, select } from "d3";
import {
  NETWORK_KIND_DEFINITIONS,
  NETWORK_KINDS,
  NETWORK_SCOPE_KINDS,
  NETWORK_SCOPE_LABELS,
  type Network,
  type NetworkKind,
  type NetworkScope
} from "@/data/astral-networks";
import { Networks } from "@/model/astral/networks";
import { Options } from "@/model/options/options-model";
import { setNetworkRenderHook } from "@/renderers/astral/draw-networks";
import { Layers } from "@/renderers/layers";
import { Dialog } from "@/ui/dialog/dialog";
import {
  type EditorColumn,
  initColumnVisibility,
  initEditorTable,
  renderEditorHeader,
  renderEditorPagination,
  type TableView
} from "@/ui/dialog/table";
import { zoomTo } from "@/ui/map/zoom";
import { tip } from "@/ui/tooltips";
import { t } from "@/utils/i18n";
import { ensureEl, findEl } from "@/utils/node-utils";
import { minmax, rn } from "@/utils/number-utils";
import { escapeHtml } from "@/utils/string-utils";

const dialogId = "astralNetworks" as const;
const editorId = "astralNetworkEditor" as const;
const listPosition = { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" } as const;
const editorPosition = { my: "left top", at: "left+10 top+10", of: "#map" } as const;
const DEFAULT_TARGET = 24;
const MIN_TARGET = 2;
const MAX_TARGET = 500;

let editingId: number | null = null;

const columns: EditorColumn<Network>[] = [
  { key: "locate", width: "0.8em", permanent: true },
  {
    key: "name",
    label: t("Network"),
    width: "14em",
    permanent: true,
    sortBy: network => network.name,
    sortType: "alpha"
  },
  {
    key: "kind",
    label: t("Kind"),
    width: "10em",
    sortBy: network => NETWORK_KIND_DEFINITIONS[network.kind].label,
    sortType: "alpha"
  },
  {
    key: "scope",
    label: t("Placement"),
    width: "12em",
    sortBy: placementLabel,
    sortType: "alpha"
  },
  { key: "nodes", label: t("Nodes"), width: "4.5em", sortBy: network => network.nodes.length },
  { key: "links", label: t("Links"), width: "4.5em", sortBy: network => Networks.routesOf(network.i).length },
  { key: "edit", width: "1.1em" },
  { key: "remove", width: "1.4em", permanent: true }
];

const networksTable = initEditorTable<Network>({
  dialogId,
  getData: () => Networks.getAll(),
  onUpdate: renderRows
});

function open(): void {
  if (options.app.mode) return;
  Dialog.closeAll(`#${dialogId}, .stable`);
  Layers.show("networks", "routes");

  renderDialog();
  networksTable.reset();
  Dialog.open(dialogId, {
    title: t("Networks"),
    width: "fit-content",
    position: listPosition,
    onClose: () => Dialog.destroy(dialogId)
  });
}

function renderDialog(): void {
  Dialog.destroy(dialogId);

  const html = /* html */ `<div id="${dialogId}" class="dialog stable editorDialog">
    <div id="networksBody" class="table">${renderEditorHeader({ dialogId, columns })}</div>
    <div id="networksFooter" class="totalLine">
      <div data-tip="${t("Networks number")}" style="margin-left: 4px">
        ${t("Networks")}:&nbsp;<span id="networksCount">0</span>
      </div>
    </div>
    <div id="networksBottom" class="editorToolbar">
      <button id="networksRefresh" data-tip="${t("Refresh")}" class="icon-cw"></button>
      <button id="networksCreate" data-tip="${t("Create a network")}" class="icon-plus"></button>
    </div>
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);

  initColumnVisibility({
    dialogId,
    columns,
    onUpdate: () => Dialog.update(dialogId, { width: "fit-content", position: listPosition })
  });
  ensureEl("networksRefresh").addEventListener("click", refreshList);
  ensureEl("networksCreate").addEventListener("click", () => openEditor());
}

function refreshList(): void {
  networksTable.refresh();
  ensureEl("networksCount").textContent = String(Networks.getAll().length);
}

function renderRows(view: TableView<Network>): void {
  const body = ensureEl("networksBody");
  body.querySelectorAll(":scope > .states").forEach(row => {
    row.remove();
  });

  let lines = "";
  for (const network of view.rows) {
    lines += /* html */ `<div class="states" data-id="${network.i}">
      <span data-tip="${t("Locate on map")}" class="icon-dot-circled pointer" data-col="locate"></span>
      <div data-tip="${t("Network name")}" data-col="name">${escapeHtml(network.name)}</div>
      <div data-tip="${t("Network kind")}" data-col="kind">${escapeHtml(NETWORK_KIND_DEFINITIONS[network.kind].label)}</div>
      <div data-tip="${t("Where the network is placed")}" data-col="scope">${escapeHtml(placementLabel(network))}</div>
      <div data-tip="${t("Nodes in the network")}" data-col="nodes">${network.nodes.length}</div>
      <div data-tip="${t("Links in the Routes store")}" data-col="links">${Networks.routesOf(network.i).length}</div>
      <span data-tip="${t("Edit network")}" class="icon-pencil pointer" data-col="edit"></span>
      <span data-tip="${t("Remove network")}" class="icon-trash-empty pointer" data-col="remove"></span>
    </div>`;
  }
  body.insertAdjacentHTML("beforeend", lines);

  ensureEl("networksCount").textContent = String(Networks.getAll().length);
  renderEditorPagination(ensureEl("networksFooter"), view, networksTable.goto);

  body.querySelectorAll("div.states").forEach(row => {
    row.querySelector<HTMLElement>("[data-col='locate']")?.addEventListener("click", locateNetwork);
    row.querySelector<HTMLElement>("[data-col='edit']")?.addEventListener("click", editNetwork);
    row.querySelector<HTMLElement>("[data-col='remove']")?.addEventListener("click", removeNetwork);
  });
}

function networkOf(element: HTMLElement): Network | undefined {
  return Networks.get(Number((element.closest(".states") as HTMLElement).dataset.id));
}

function locateNetwork(this: HTMLElement): void {
  const network = networkOf(this);
  if (!network?.nodes.length) return;

  const x = network.nodes.reduce((sum, node) => sum + node.x, 0) / network.nodes.length;
  const y = network.nodes.reduce((sum, node) => sum + node.y, 0) / network.nodes.length;
  zoomTo(x, y, 6, 2000);
}

function editNetwork(this: HTMLElement): void {
  const network = networkOf(this);
  if (network) openEditor(network.i);
}

function removeNetwork(this: HTMLElement): void {
  const network = networkOf(this);
  if (!network) return;

  Dialog.confirm({
    title: t("Remove network"),
    message: t("Remove “{{name}}” and its routes?", { name: escapeHtml(network.name) }),
    confirm: t("Remove"),
    onConfirm: () => {
      Networks.remove(network.i);
      saved();
      if (editingId === network.i) Dialog.close(editorId);
      refreshList();
    }
  });
}

function placementLabel(network: Network): string {
  const { scope } = network;
  if (scope.kind === "culture") return `${t("Culture")}: ${pack.cultures[scope.culture]?.name ?? `#${scope.culture}`}`;
  if (scope.kind === "state") return `${t("State")}: ${pack.states[scope.state]?.name ?? `#${scope.state}`}`;
  return NETWORK_SCOPE_LABELS[scope.kind];
}

function saved(): void {
  Options.save();
  redraw();
  if (Dialog.isOpen(dialogId)) refreshList();
}

function redraw(): void {
  Layers.draw("routes", "goods", "trade");
  if (Layers.has("networks")) Layers.draw("networks");
}

function openEditor(id?: number): void {
  if (options.app.mode) return;
  if (id !== undefined && !Networks.get(id)) {
    tip(t("This network is not in the map anymore"), false, "error");
    return;
  }

  editingId = id ?? null;
  Dialog.closeAll(`#${editorId}`);
  Layers.show("networks", "routes");

  renderEditor();
  setNetworkRenderHook(editingId === null ? null : attachNodeDrag);
  const container = findEl<SVGGElement>("networks");
  if (container) attachNodeDrag(container);

  Dialog.open(editorId, {
    title: id === undefined ? t("New Network") : t("Edit Network"),
    position: editorPosition,
    onClose: closeEditor
  });
}

function closeEditor(): void {
  editingId = null;
  setNetworkRenderHook(null);
  const container = findEl<SVGGElement>("networks");
  if (container) {
    select(container)
      .selectAll<SVGGElement, unknown>(".nodes > g[data-node]")
      .classed("draggable", false)
      .style("cursor", null)
      .on(".drag", null);
  }
  Dialog.destroy(editorId);
}

function attachNodeDrag(container: SVGGElement): void {
  select(container)
    .selectAll<SVGGElement, unknown>(".nodes > g[data-node]")
    .classed("draggable", false)
    .style("cursor", null)
    .on(".drag", null);

  if (editingId === null) return;
  select(container)
    .selectAll<SVGGElement, unknown>(`#network${editingId} .nodes > g[data-node]`)
    .classed("draggable", true)
    .style("cursor", "move")
    .call(drag<SVGGElement, unknown>().on("start", dragNetworkNode));
}

function dragNetworkNode(this: SVGGElement, event: D3DragEvent<SVGGElement, unknown, unknown>): void {
  if (editingId === null) return;
  const network = Networks.get(editingId);
  const nodeIndex = Number(this.dataset.node);
  const node = network?.nodes[nodeIndex];
  if (!network || !node) return;

  const offsetX = node.x - event.x;
  const offsetY = node.y - event.y;
  let moved = false;

  event.on("drag", function (this: SVGGElement, dragEvent: D3DragEvent<SVGGElement, unknown, unknown>) {
    moved = true;
    const { width, height } = options.map.graph;
    const x = minmax(offsetX + dragEvent.x, 0, width);
    const y = minmax(offsetY + dragEvent.y, 0, height);
    this.setAttribute("transform", `translate(${rn(x, 2)} ${rn(y, 2)})`);
  });

  event.on("end", (dragEvent: D3DragEvent<SVGGElement, unknown, unknown>) => {
    if (!moved) return;
    const { width, height } = options.map.graph;
    const x = rn(minmax(offsetX + dragEvent.x, 0, width), 2);
    const y = rn(minmax(offsetY + dragEvent.y, 0, height), 2);
    Networks.moveNode(network.i, nodeIndex, x, y);
    saved();
    updateSummary();
  });
}

function renderEditor(): void {
  Dialog.destroy(editorId);
  const network = editingId === null ? undefined : Networks.get(editingId);

  const html = /* html */ `<div id="${editorId}" class="dialog stable">
    <div id="networkForm" style="display: grid; grid-template-columns: 8em 1fr; gap: 0.35em 0.6em; align-items: center">
      <div class="label">${t("Name")}:</div>
      <input id="networkName" placeholder="${t("Name the network")}" autocorrect="off" spellcheck="false" />
      <div class="label">${t("Kind")}:</div>
      <select id="networkKind"></select>
      <div class="label">${t("Placement")}:</div>
      <div style="display: flex; gap: 0.4em; align-items: center">
        <select id="networkScope"></select>
        <select id="networkCulture"></select>
        <select id="networkState"></select>
      </div>
      <div class="label">${t("Nodes")}:</div>
      <input id="networkTarget" type="number" min="${MIN_TARGET}" max="${MAX_TARGET}" step="1" />
    </div>
    <div id="networkSummary" class="totalLine"></div>
    <div id="networkBottom" class="editorToolbar">
      <button id="networkSave" data-tip="${editingId === null ? t("Create network") : t("Save changes")}" class="icon-check"></button>
      ${editingId === null ? "" : `<button id="networkRegenerate" data-tip="${t("Replace nodes and links with a new spread")}" class="icon-cw"></button>`}
      <button id="networkCancel" data-tip="${t("Close")}" class="icon-cancel"></button>
      ${editingId === null ? "" : `<button id="networkRemove" data-tip="${t("Remove network")}" class="icon-trash"></button>`}
    </div>
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);

  fillKinds();
  fillScopes();
  fillOwners(network);
  applyForm(network);

  ensureEl("networkScope").addEventListener("change", syncFields);
  ensureEl("networkSave").addEventListener("click", saveNetwork);
  ensureEl("networkCancel").addEventListener("click", () => Dialog.close(editorId));
  if (editingId !== null) {
    ensureEl("networkRegenerate").addEventListener("click", regenerateNetwork);
    ensureEl("networkRemove").addEventListener("click", confirmRemove);
  }
}

function fillKinds(): void {
  const select = ensureEl<HTMLSelectElement>("networkKind");
  select.innerHTML = NETWORK_KINDS.map(
    kind => `<option value="${kind}">${escapeHtml(NETWORK_KIND_DEFINITIONS[kind].label)}</option>`
  ).join("");
}

function fillScopes(): void {
  const select = ensureEl<HTMLSelectElement>("networkScope");
  select.innerHTML = NETWORK_SCOPE_KINDS.map(
    kind => `<option value="${kind}">${escapeHtml(NETWORK_SCOPE_LABELS[kind])}</option>`
  ).join("");
}

function fillOwners(network?: Network): void {
  const selectedCulture = network?.scope.kind === "culture" ? network.scope.culture : undefined;
  const selectedState = network?.scope.kind === "state" ? network.scope.state : undefined;
  fillOwnerSelect(
    "networkCulture",
    (pack.cultures ?? []).filter(item => !item.removed),
    selectedCulture
  );
  fillOwnerSelect(
    "networkState",
    (pack.states ?? []).filter(item => !item.removed),
    selectedState
  );
}

function fillOwnerSelect(id: string, items: { i: number; name?: string }[], selected?: number): void {
  const select = ensureEl<HTMLSelectElement>(id);
  const preferred = selected ?? items.find(item => item.i > 0)?.i ?? items[0]?.i ?? 0;
  const options = items.map(item => `<option value="${item.i}">${escapeHtml(item.name || `#${item.i}`)}</option>`);
  if (selected !== undefined && !items.some(item => item.i === selected)) {
    options.unshift(`<option value="${selected}">#${selected}</option>`);
  }
  select.innerHTML = options.join("");
  select.value = String(preferred);
}

function applyForm(network?: Network): void {
  ensureEl<HTMLInputElement>("networkName").value = network?.name ?? "";
  ensureEl<HTMLSelectElement>("networkKind").value = network?.kind ?? "transit";
  ensureEl<HTMLSelectElement>("networkScope").value = network?.scope.kind ?? "land";
  ensureEl<HTMLInputElement>("networkTarget").value = String(network?.target ?? DEFAULT_TARGET);

  syncFields();
  updateSummary();
  ensureEl<HTMLInputElement>("networkName").focus();
}

function syncFields(): void {
  const scope = ensureEl<HTMLSelectElement>("networkScope").value;

  ensureEl("networkCulture").style.display = scope === "culture" ? "" : "none";
  ensureEl("networkState").style.display = scope === "state" ? "" : "none";
  updateSummary();
}

function updateSummary(): void {
  const network = editingId === null ? undefined : Networks.get(editingId);
  if (!network) {
    ensureEl("networkSummary").textContent = t("A new network has no nodes yet");
    return;
  }

  const links = Networks.routesOf(network.i).length;
  ensureEl("networkSummary").textContent =
    network.kind === "communication"
      ? t("{{nodes}} nodes", { nodes: network.nodes.length })
      : t("{{nodes}} nodes, {{links}} links", {
          nodes: network.nodes.length,
          links
        });
}

function readForm(): {
  name: string;
  kind: NetworkKind;
  scope: NetworkScope;
  target: number;
} | null {
  const name = ensureEl<HTMLInputElement>("networkName").value.trim();
  if (!name) {
    tip(t("Name the network"), true, "error", 6000);
    return null;
  }

  const kind = ensureEl<HTMLSelectElement>("networkKind").value as NetworkKind;
  const scopeKind = ensureEl<HTMLSelectElement>("networkScope").value;
  let scope: NetworkScope;
  if (scopeKind === "culture")
    scope = { kind: "culture", culture: +ensureEl<HTMLSelectElement>("networkCulture").value };
  else if (scopeKind === "state") scope = { kind: "state", state: +ensureEl<HTMLSelectElement>("networkState").value };
  else scope = { kind: scopeKind as "any" | "land" | "burgs" };

  const target = +ensureEl<HTMLInputElement>("networkTarget").value;
  if (!Number.isFinite(target) || target < MIN_TARGET || target > MAX_TARGET) {
    tip(t("Set the node count from {{min}} to {{max}}", { min: MIN_TARGET, max: MAX_TARGET }), true, "error", 6000);
    return null;
  }

  return {
    name,
    kind,
    scope,
    target
  };
}

function saveNetwork(): void {
  const input = readForm();
  if (!input) return;

  try {
    if (editingId === null) {
      const network = Networks.create(input);
      tip(t("Network “{{name}}” created", { name: network.name }), true, "success", 5000);
      saved();
      openEditor(network.i);
      return;
    }

    Networks.update(editingId, input);
    saved();
    updateSummary();
    tip(t("Network “{{name}}” saved", { name: input.name }), true, "success", 4000);
  } catch (error) {
    tip(error instanceof Error ? error.message : String(error), true, "error", 8000);
  }
}

function regenerateNetwork(): void {
  if (editingId === null) return;

  Dialog.confirm({
    title: t("Regenerate network"),
    message: t("Replace the network's nodes and links with a new spread?"),
    confirm: t("Regenerate"),
    onConfirm: () => {
      try {
        Networks.regenerate(editingId!);
        saved();
        renderEditor();
      } catch (error) {
        tip(error instanceof Error ? error.message : String(error), true, "error", 8000);
      }
    }
  });
}

function confirmRemove(): void {
  if (editingId === null) return;
  const network = Networks.get(editingId);
  if (!network) return;

  Dialog.confirm({
    title: t("Remove network"),
    message: t("Remove “{{name}}” and its routes?", { name: escapeHtml(network.name) }),
    confirm: t("Remove"),
    onConfirm: () => {
      Networks.remove(network.i);
      saved();
      Dialog.close(editorId);
      open();
    }
  });
}

export const AstralNetworks = { open, openEditor };
