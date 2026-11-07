// Trouble and Lair layer renderer: visual markers and info popups for active provincial threats
import { getFactionArchetype } from "@/data/factions-catalog";
import { Factions } from "@/model/political/factions-generator";
import { getTroubleDef, SAVE_KIND_LABELS, UNIT_ROLE_LABELS } from "@/data/living-troubles";
import { MapEntities } from "@/model/map-entities";
import { Living } from "@/model/physical/living-generator";
import type { Burg } from "@/model/political/burgs-generator";
import { Layers } from "@/renderers/layers";
import { zoomFontSize } from "@/renderers/viewport/viewport";
import { ViewportLayers, type ViewportRenderContext } from "@/renderers/viewport/viewport-renderer";
import type { Faction } from "@/types/factions";
import type { ProvinceTrouble } from "@/types/living";
import { t } from "@/utils/i18n";
import { log } from "@/utils/logger";
import { findEl } from "@/utils/node-utils";
import { capitalize, escapeHtml } from "@/utils/string-utils";

const layer = ViewportLayers.register({ id: "trouble", render: reconcileTrouble });

let pinnedTroubleId: string | null = null;

const TROUBLE_ICONS: Record<string, string> = {
  ancient_curse: "🔮",
  angry_dead: "💀",
  leyline_blight: "⚡",
  bad_reputation: "🗣️",
  blood_feud: "⚔️",
  brigand_raiders: "🗡️",
  corrupt_official: "💰",
  cult_infiltration: "🕯️",
  demagogue: "📢",
  exiled_lord: "👑",
  famine: "🌾",
  flooding: "🌊",
  hazardous_resource: "☣️",
  heretical_preacher: "📖",
  infestation: "🦗",
  monsters: "🐺",
  plague: "🦠",
  rebellion: "🔥",
  riotous_thugs: "🥊",
  schism: "⚡",
  secret_society: "👁️",
  smugglers: "📦",
  taboo_land: "🚫",
  things_from_below: "🐙",
  wild_magic_surge: "✨",
  witch_coven: "🧙"
};

export function getTroubleIcon(trouble: ProvinceTrouble): string {
  if (TROUBLE_ICONS[trouble.id]) return TROUBLE_ICONS[trouble.id];
  if (trouble.theme === "burg") return "⚠️";
  if (trouble.theme === "ruin") return "🏛️";
  if (trouble.theme === "resource") return "⛏️";
  return "⚠️";
}

export function getFactionIcon(faction: Faction): string {
  return getFactionArchetype(faction.type)?.markerIcon || "🏰";
}

export interface TroubleInfo {
  id: string;
  type: "trouble" | "faction";
  provinceId: number;
  name: string;
  tip: string;
  note: string;
}

export function pinTroubleNote(id: string): void {
  pinnedTroubleId = pinnedTroubleId === id ? null : id;
}

export function clearTroubleNotePin(): void {
  pinnedTroubleId = null;
}

export function isTroubleNotePinned(id: string | null): boolean {
  return Boolean(id && pinnedTroubleId === id);
}

export function hasTroubleNotePin(): boolean {
  return pinnedTroubleId !== null;
}

function findNearestBurg(cell: number): Burg | undefined {
  if (!pack.burgs || !pack.cells?.p) return undefined;
  const [cx, cy] = pack.cells.p[cell] ?? [0, 0];
  let closest: Burg | undefined;
  let minDist = Number.POSITIVE_INFINITY;

  for (const b of pack.burgs) {
    if (!b?.i || b.removed) continue;
    const dist = Math.hypot(b.x - cx, b.y - cy);
    if (dist < minDist) {
      minDist = dist;
      closest = b;
    }
  }
  return closest;
}

function formatFactionInfo(faction: Faction, uniqueId: string): TroubleInfo {
  const provinceId = faction.hq.provinceId ?? (faction.hq.burgId ? pack.cells.province?.[pack.burgs?.[faction.hq.burgId]?.cell ?? 0] : undefined) ?? pack.cells?.province?.[faction.hq.cell];
  const province = provinceId ? pack.provinces?.[provinceId] : undefined;
  const burg = faction.hq.burgId ? pack.burgs?.[faction.hq.burgId] : findNearestBurg(faction.hq.cell);
  const archetype = getFactionArchetype(faction.type);
  const men = (faction.military ?? []).reduce((s, r) => s + (r.a ?? 0), 0);

  const locationLabel = province?.name ?? (faction.hq.maritime ? t("Maritime Waters") : t("Wilderness"));
  const name = `${faction.name} (${faction.allegiance} faction)`;
  const tip = `${faction.name} — ${faction.allegiance} faction in ${locationLabel}`;

  const flags = [
    faction.hq.fortified ? "🏰 Fortified" : "Unfortified",
    faction.raidPending ? "⚠️ Raid imminent!" : "Preparing raid"
  ].join(" · ");

  const bodyHtml = [
    `<p><strong>Location:</strong> ${escapeHtml(locationLabel)}${burg?.name ? ` (near ${escapeHtml(burg.name)})` : ""}</p>`,
    `<p><strong>Allegiance:</strong> ${escapeHtml(faction.allegiance)} &nbsp;|&nbsp; <strong>Fighters:</strong> ${men}</p>`,
    `<p><strong>Status:</strong> ${flags}</p>`,
    `<p><strong>Raid Threshold:</strong> ${faction.raidThreshold ?? 6}+ on 1d6 &nbsp;|&nbsp; <strong>Seasons Active:</strong> ${faction.seasonsActive ?? 0}</p>`,
    archetype?.description ? `<p style="margin-top: 6px; font-style: italic;">${escapeHtml(archetype.description)}</p>` : "",
    faction.sovereignAmbition
      ? `<p style="margin-top: 6px; color: #6a4c93; font-weight: bold;">⚔️ Sovereign ambition: may proclaim ${escapeHtml(faction.stateForm ?? "a new domain")}</p>`
      : ""
  ].filter(Boolean).join("");

  return {
    id: uniqueId,
    type: "faction",
    provinceId: provinceId ?? 0,
    name,
    tip,
    note: bodyHtml
  };
}

/** Resolve a hovered/clicked DOM element to its trouble or faction data model and info presentation */
export function getTroubleOrLairFromElement(element: Element | null): TroubleInfo | undefined {
  if (!element) return undefined;

  const living = pack.history?.living ?? Living.getState();

  // 1. Check if it's a trouble layer pin
  const troubleMarker = element.closest<SVGElement>("[data-trouble-type]");
  if (troubleMarker) {
    const type = troubleMarker.dataset.troubleType as "trouble" | "faction";
    const factionId = troubleMarker.dataset.factionId;
    const markerId = troubleMarker.dataset.markerId ? Number(troubleMarker.dataset.markerId) : undefined;
    const provinceId = Number(troubleMarker.dataset.provinceId ?? 0);

    if (type === "faction") {
      const factions = Factions.active();
      const faction =
        (factionId ? factions.find(f => f.i === Number(factionId)) : undefined) ??
        (markerId !== undefined ? factions.find(f => f.hq.markerId === markerId) : undefined) ??
        (provinceId
          ? factions.find(f => {
              const provId =
                f.hq.provinceId ??
                (f.hq.burgId ? pack.cells.province?.[pack.burgs?.[f.hq.burgId]?.cell ?? 0] : undefined) ??
                pack.cells?.province?.[f.hq.cell];
              return provId === provinceId;
            })
          : undefined);
      if (faction) {
        return formatFactionInfo(faction, factionId || `faction:${markerId ?? provinceId}`);
      }
    }

    if (type === "trouble") {
      const pSim = provinceId ? living?.provinces?.[provinceId] : undefined;
      const province = provinceId ? pack.provinces?.[provinceId] : undefined;
      if (pSim?.trouble && province) {
        const trouble = pSim.trouble;
        const tDef = getTroubleDef(trouble.id);
        const burg = trouble.burgId ? pack.burgs?.[trouble.burgId] : undefined;

        const name = `${trouble.name} (Trouble Lv ${trouble.level})`;
        const tip = `${trouble.name} — Level ${trouble.level} ${trouble.theme} trouble in ${province.name}`;

        const bodyHtml = [
          `<p><strong>Province:</strong> ${escapeHtml(province.name)}${burg?.name ? ` (near ${escapeHtml(burg.name)})` : ""}</p>`,
          `<p><strong>Theme:</strong> ${capitalize(trouble.theme)} &nbsp;|&nbsp; <strong>Threat Level:</strong> ${trouble.level} / 10</p>`,
          `<p><strong>Seasons Unchecked:</strong> ${trouble.seasonsUnchecked ?? 0}</p>`,
          `<p><strong>Required Counter:</strong> ${escapeHtml(UNIT_ROLE_LABELS[trouble.requiredRole] ?? trouble.requiredRole)} (${trouble.pool.toUpperCase()} Pool)</p>`,
          `<p><strong>Save / Harm:</strong> ${escapeHtml(SAVE_KIND_LABELS[trouble.save] ?? trouble.save)}</p>`,
          tDef?.description ? `<p style="margin-top: 6px; font-style: italic;">${escapeHtml(tDef.description)}</p>` : ""
        ].filter(Boolean).join("");

        return {
          id: `trouble:${provinceId}`,
          type: "trouble",
          provinceId,
          name,
          tip,
          note: bodyHtml
        };
      }
    }
  }

  // 2. Check if it's a marker from the markers layer corresponding to a faction HQ
  const ref = MapEntities.resolveTarget(element);
  if (ref?.type === "marker") {
    const faction = Factions.active().find(f => f.hq.markerId === ref.id);
    if (faction) {
      return formatFactionInfo(faction, `faction:${ref.id}`);
    }
  }

  return undefined;
}

export function drawTrouble(): void {
  log.time("drawTrouble");
  layer.render();
  log.timeEnd("drawTrouble");
}

export function removeTrouble(): void {
  findEl("trouble")?.replaceChildren();
}

function reconcileTrouble({ root, bounds }: ViewportRenderContext): void {
  const container = root.querySelector<SVGGElement>("#trouble");
  if (!container || !Layers.isOn("trouble") || !pack.cells?.p) return;

  const living = pack.history?.living ?? Living.getState();
  if (!living) return;

  const fontSize = zoomFontSize("trouble", bounds.scale);
  const size = 32;
  const drawn = (size / 100) * fontSize;
  const markup: string[] = [];

  // Group threats by cell to offset overlaps
  const cellCounts = new Map<number, number>();
  const cellIndices = new Map<number, number>();

  const troubles: { trouble: ProvinceTrouble; provinceId: number }[] = [];
  for (const pSim of Object.values(living.provinces ?? {})) {
    if (pSim.trouble) {
      troubles.push({ trouble: pSim.trouble, provinceId: pSim.provinceId });
      const cell = pSim.trouble.cell ?? pack.provinces?.[pSim.provinceId]?.center ?? 0;
      cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + 1);
    }
  }

  const threats = Factions.active().filter(
    f => f.allegiance === "hostile" || f.allegiance === "clandestine"
  );
  for (const faction of threats) {
    cellCounts.set(faction.hq.cell, (cellCounts.get(faction.hq.cell) ?? 0) + 1);
  }

  const getOffset = (cell: number) => {
    const total = cellCounts.get(cell) ?? 1;
    if (total <= 1) return 0;
    const idx = cellIndices.get(cell) ?? 0;
    cellIndices.set(cell, idx + 1);
    return (idx - (total - 1) / 2) * drawn * 0.45;
  };

  // Draw troubles
  for (const { trouble, provinceId } of troubles) {
    const province = pack.provinces?.[provinceId];
    if (!province?.i || province.removed) continue;

    const tCell = trouble.cell ?? province.center ?? 0;
    const point = pack.cells.p[tCell];
    if (!point) continue;

    const offset = getOffset(tCell);
    const x = point[0] + offset;
    const y = point[1];

    if (
      x - drawn / 2 <= bounds.x1 &&
      y - drawn <= bounds.y1 &&
      x + drawn / 2 >= bounds.x0 &&
      y >= bounds.y0
    ) {
      const icon = getTroubleIcon(trouble);
      markup.push(
        `<svg id="trouble-marker-${province.i}" class="trouble-marker" data-trouble-type="trouble" data-province-id="${province.i}" viewBox="0 0 30 36" width="${size / 100}em" height="${size / 100}em" x="${x}" y="${y}" overflow="visible" style="cursor: pointer;" pointer-events="all">` +
          `<g transform="translate(-15 -30)">` +
          `<path d="M15 3 C9.5 3 5.3 7.1 5.3 12.3 C5.3 19.1 15 29.3 15 29.3 C15 29.3 24.7 19.1 24.7 12.3 C24.7 7.1 20.5 3 15 3 Z" fill="#b45309" stroke="#451a03" stroke-width="1.2"/>` +
          `<circle cx="15" cy="12" r="7.5" fill="#fef3c7" stroke="#b45309" stroke-width="0.8"/>` +
          `<text x="15" y="15.5" font-size="9" text-anchor="middle" dominant-baseline="central">${icon}</text>` +
          `<rect x="6.5" y="21" width="17" height="6.5" rx="2" fill="#1c1917" stroke="#fde68a" stroke-width="0.6"/>` +
          `<text x="15" y="25.8" font-size="4.8" font-weight="bold" fill="#fef3c7" text-anchor="middle">Lv.${trouble.level}</text>` +
          `</g></svg>`
      );
    }
  }

  // Draw dangerous factions
  for (const faction of threats) {
    const hqCell = faction.hq.cell;
    const point = pack.cells.p?.[hqCell];
    if (!point) continue;

    const offset = getOffset(hqCell);
    const x = point[0] + offset;
    const y = point[1];
    const provinceId =
      faction.hq.provinceId ??
      (faction.hq.burgId ? pack.cells.province?.[pack.burgs?.[faction.hq.burgId]?.cell ?? 0] : undefined) ??
      pack.cells?.province?.[hqCell] ??
      0;

    if (
      x - drawn / 2 <= bounds.x1 &&
      y - drawn <= bounds.y1 &&
      x + drawn / 2 >= bounds.x0 &&
      y >= bounds.y0
    ) {
      const icon = getFactionIcon(faction);
      const markerAttr = faction.hq.markerId !== undefined ? ` data-marker-id="${faction.hq.markerId}"` : "";
      const elementId = `faction-marker-${faction.i}`;
      markup.push(
        `<svg id="${elementId}" class="faction-marker" data-trouble-type="faction" data-faction-id="${faction.i}" data-province-id="${provinceId}"${markerAttr} viewBox="0 0 30 36" width="${size / 100}em" height="${size / 100}em" x="${x}" y="${y}" overflow="visible" style="cursor: pointer;" pointer-events="all">` +
          `<g transform="translate(-15 -30)">` +
          `<path d="M15 3 C9.5 3 5.3 7.1 5.3 12.3 C5.3 19.1 15 29.3 15 29.3 C15 29.3 24.7 19.1 24.7 12.3 C24.7 7.1 20.5 3 15 3 Z" fill="#881337" stroke="#450a0a" stroke-width="1.2"/>` +
          `<circle cx="15" cy="12" r="7.5" fill="#ffe4e6" stroke="#881337" stroke-width="0.8"/>` +
          `<text x="15" y="15.5" font-size="9" text-anchor="middle" dominant-baseline="central">${icon}</text>` +
          `<rect x="6.5" y="21" width="17" height="6.5" rx="2" fill="#1c1917" stroke="#fecdd3" stroke-width="0.6"/>` +
          `<text x="15" y="25.8" font-size="4.8" font-weight="bold" fill="#ffe4e6" text-anchor="middle">${faction.allegiance}`
          .slice(0, 3) + `</text>` +
          `</g></svg>`
      );
    }
  }

  container.innerHTML = markup.join("");
}
