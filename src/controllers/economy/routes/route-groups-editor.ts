import { Controllers } from "@/controllers";
import type { Route } from "@/model/economy/routes-generator";
import { Routes } from "@/model/economy/routes-generator";
import { getRouteGroupCarriage } from "@/model/economy/trade-routes";
import { Options } from "@/model/options/options-model";
import { Layers } from "@/renderers/layers";
import { Dialog } from "@/ui/dialog/dialog";

import { tip } from "@/ui/tooltips";
import { t } from "@/utils/i18n";
import { ensureEl, findEl } from "@/utils/node-utils";

const DEFAULT_GROUPS = ["roads", "trails", "searoutes", "transit", "portal"];

function open(): void {
  if (options.app.mode) return;
  Layers.show("routes");

  renderDialog();
  addLines();

  Dialog.open("routeGroupsEditor", {
    title: t("Edit route groups"),
    position: { my: "left top", at: "left+10 top+140", of: "#map" },
    onClose: closeRouteGroupsEditor
  });
}

function renderDialog(): void {
  Dialog.destroy("routeGroupsEditor");

  const html = /* html */ `<div id="routeGroupsEditor" class="dialog">
    <div id="routeGroupsEditorBody" class="table" style="padding: 0.3em 0; width: 100%"></div>
    <div id="routeGroupsEditorBottom">
      <button id="routeGroupsEditorAdd" data-tip="${t("Add")}" class="icon-plus"></button>
    </div>
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);

  // add listeners — dropped together with the dialog HTML on close
  ensureEl("routeGroupsEditorAdd").addEventListener("click", addGroup);
  ensureEl("routeGroupsEditorBody").addEventListener("click", onBodyClick);
  ensureEl("routeGroupsEditorBody").addEventListener("change", onBodyChange);
}

function closeRouteGroupsEditor(): void {
  Dialog.destroy("routeGroupsEditor");
}

function onBodyClick(ev: Event): void {
  const target = ev.target as HTMLElement;
  const group = target.closest<HTMLElement>(".states")?.dataset.id;
  if (target.classList.contains("editStyle") && group) void Controllers.StyleEditor.open("routes", group);
  else if (target.classList.contains("removeGroup") && group) removeGroup(group);
}

function onBodyChange(ev: Event): void {
  const target = ev.target as HTMLInputElement;
  if (!target.classList.contains("groupCarriage")) return;
  const group = target.dataset.group;
  if (!group) return;

  const value = +target.value;
  if (!Number.isFinite(value) || value < 0) {
    target.value = String(getRouteGroupCarriage(group));
    tip(t("Carriage multiplier must not be negative"), false, "error");
    return;
  }

  options.map.routeCarriage ??= {};
  options.map.routeCarriage[group] = value;
  Options.save();
  Layers.draw("goods", "trade");
}

function addLines(): void {
  ensureEl("routeGroupsEditorBody").innerHTML = "";

  const header = /* html */ `<div class="header" style="display: flex; justify-content: space-between; align-items: center; gap: 0.6em; font-weight: 600; padding: 0 0.2em;">
    <span style="flex: 1;">${t("Group")}</span>
    <span data-tip="${t("Carriage cost multiplier")}" style="width: 5.5em; text-align: center;">${t("Carriage")}</span>
    <span style="width: 3em;"></span>
  </div>`;

  const lines = Object.keys(styles.routes.groups).map(group => {
    const count = pack.routes.filter((route: Route) => route.group === group).length;
    const carriage = getRouteGroupCarriage(group);
    return /* html */ `<div data-id="${group}" class="states" style="display: flex; justify-content: space-between; align-items: center; gap: 0.6em;">
          <span style="flex: 1;">${group} (${count})</span>
          <input
            type="number"
            class="groupCarriage"
            data-group="${group}"
            data-tip="${t("Carriage cost multiplier")}"
            min="0"
            max="10"
            step="0.05"
            value="${carriage}"
            style="width: 5em; text-align: right;"
          />
          <div style="width: 3em; display: flex; justify-content: flex-end; gap: 0.4em;">
            <span data-tip="${t("Edit style")}" class="editStyle icon-brush pointer" style="font-size: smaller;"></span>
            <span data-tip="${t("Remove")}" class="removeGroup icon-trash pointer"></span>
          </div>
        </div>`;
  });

  ensureEl("routeGroupsEditorBody").innerHTML = header + lines.join("");
}

function addGroup(): void {
  Dialog.prompt(t("Group name"), { default: "route-group-new" }, v => {
    let group = v
      .toLowerCase()
      .replace(/ /g, "_")
      .replace(/[^\w\s]/gi, "");

    if (!group) return tip(t("Invalid group name"), false, "error");
    if (!group.startsWith("route-")) group = `route-${group}`;
    if (Object.hasOwn(styles.routes.groups, group))
      return tip(t("Element with this name already exists. Provide a unique name"), false, "error");
    if (Number.isFinite(+group.charAt(0))) return tip(t("Group name should start with a letter"), false, "error");

    // the store is authoritative: seed an entry so style edits and presets can address the group
    const template = styles.routes.groups.roads || Object.values(styles.routes.groups)[0];
    const groupStyle = structuredClone(template);
    Object.assign(groupStyle.attrs, {
      stroke: "#000000",
      "stroke-width": 0.5,
      "stroke-dasharray": "1 0.5",
      "stroke-linecap": "butt"
    });
    styles.routes.groups[group] = groupStyle;
    options.map.routeCarriage ??= {};
    options.map.routeCarriage[group] ??= 1;
    Options.save();
    Layers.draw("routes"); // the layer makes the group element from the store

    findEl<HTMLSelectElement>("routeGroup")?.options.add(new Option(group, group));
    findEl<HTMLSelectElement>("routeCreatorGroupSelect")?.options.add(new Option(group, group));
    addLines();
  });
}

function removeGroup(group: string): void {
  Dialog.confirm({
    title: t("Remove"),
    message: `${t("Are you sure you want to remove the entire route group? All routes in this group will be removed.")}<br>${t("This action cannot be reverted")}`,
    confirm: t("Remove"),
    onConfirm: () => {
      Dialog.close("routeEditor"); // it may be editing one of them
      Routes.remove(...pack.routes.filter((r: Route) => r.group === group).map(route => route.i));
      if (!DEFAULT_GROUPS.includes(group)) {
        delete styles.routes.groups[group];
        if (options.map.routeCarriage) delete options.map.routeCarriage[group];
        Options.save();
      }
      Layers.draw("routes", "labels", "goods", "trade");
      findEl("routesOverviewRefresh")?.click();
      addLines();
    }
  });
}

export const RouteGroupsEditor = { open };
