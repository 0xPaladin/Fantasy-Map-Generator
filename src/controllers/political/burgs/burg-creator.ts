import { pointer } from "d3";
import type { BurgRealm } from "@/model/political/burgs-generator";
import { Burgs } from "@/model/political/burgs-generator";
import { redrawEmblem } from "@/renderers/draw-emblems";
import { Layers } from "@/renderers/layers";
import { Dialog } from "@/ui/dialog/dialog";
import { refreshEditors } from "@/ui/dialog/dialog-helpers";
import { stopMapPlacement, toggleMapPlacement } from "@/ui/map/map-placement";
import { tip } from "@/ui/tooltips";
import { sentences, t } from "@/utils/i18n";
import { findEl } from "@/utils/node-utils";
import { errorText } from "@/utils/string-utils";

/** The realm the current tool arms the placement with; empty means surface */
let pendingRealm: BurgRealm = "surface";

const TIP: Record<BurgRealm, string> = {
  surface: t("Click on map to place a surface burg"),
  sky: t("Click on map to place a skyburg"),
  underdark: t("Click on map to place an underdark hold"),
  underwater: t("Click on map to place an underwater settlement")
};

function toggle(realm?: BurgRealm): void {
  if (isActive()) {
    stop();
    return;
  }

  pendingRealm = realm ?? pendingRealm;
  Dialog.closeAll(".stable");
  toggleMapPlacement(
    "addBurgTool",
    addOnClick,
    sentences(TIP[pendingRealm], t("Hold Shift to add multiple")),
    "warn",
    unpressProxyButton
  );
  findEl("addNewBurg")?.classList.add("pressed");

  Layers.show("burgIcons", "labels");
}

function addOnClick(event: MouseEvent): void {
  const point = pointer(event, event.currentTarget as SVGGElement);
  let burgId: number;
  try {
    burgId = Burgs.add(...point, pendingRealm);
  } catch (error) {
    tip(errorText(error), false, "error");
    return;
  }
  redrawEmblem("burg", burgId);
  refreshEditors();
  Layers.draw("burgIcons", "labels", "routes");

  if (!event.shiftKey) stop();
}

function stop(): void {
  if (isActive()) stopMapPlacement();
  else unpressProxyButton();
}

function isActive(): boolean {
  return findEl("addBurgTool")?.classList.contains("pressed") ?? false;
}

function unpressProxyButton(): void {
  findEl("addNewBurg")?.classList.remove("pressed");
}

/** Change the realm the next placement brings in */
function setRealm(realm: BurgRealm): void {
  pendingRealm = realm;
  if (isActive()) tip(TIP[realm], true);
}

export const BurgCreator = { toggle, stop, setRealm };
