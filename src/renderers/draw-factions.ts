import { Controllers } from "@/controllers";
import { Factions } from "@/model/political/factions-generator";
import { Layers } from "@/renderers/layers";
import { zoomFontSize } from "@/renderers/viewport/viewport";
import { ViewportLayers, type ViewportRenderContext } from "@/renderers/viewport/viewport-renderer";
import type { Faction } from "@/types/factions";
import { t } from "@/utils/i18n";
import { log } from "@/utils/logger";
import { findEl } from "@/utils/node-utils";
import { capitalize, escapeHtml } from "@/utils/string-utils";

const layer = ViewportLayers.register({ id: "factions", render: reconcileFactions });

export function drawFactions(): void {
  log.time("drawFactions");
  layer.render();
  log.timeEnd("drawFactions");
}

export function removeFactions(): void {
  findEl("factions")?.replaceChildren();
}

function resolveHqCoords(faction: Faction): [number, number] | undefined {
  if (faction.hq.burgId && pack.burgs?.[faction.hq.burgId]) {
    const burg = pack.burgs[faction.hq.burgId];
    return [burg.x, burg.y];
  }
  if (faction.hq.markerId !== undefined && pack.markers?.[faction.hq.markerId]) {
    const marker = pack.markers[faction.hq.markerId];
    return [marker.x, marker.y];
  }
  if (pack.cells?.p?.[faction.hq.cell]) {
    return pack.cells.p[faction.hq.cell];
  }
  return undefined;
}

function reconcileFactions({ root, bounds }: ViewportRenderContext): void {
  const container = root.querySelector<SVGGElement>("#factions");
  if (!container || !Layers.isOn("factions") || !pack.factions) return;

  const activeFactions = Factions.active();
  if (!activeFactions.length) {
    container.replaceChildren();
    return;
  }

  const fontSize = zoomFontSize("factions", bounds.scale);
  const size = 30;
  const drawn = (size / 100) * fontSize;

  const linesMarkup: string[] = [];
  const outpostsMarkup: string[] = [];
  const hqsMarkup: string[] = [];

  // Group outposts by burg to calculate radial offsets
  const burgOutpostCounts = new Map<number, number>();
  const burgOutpostIndices = new Map<number, number>();

  for (const faction of activeFactions) {
    for (const outpost of faction.outposts) {
      if (!outpost.pillaged) {
        burgOutpostCounts.set(outpost.burgId, (burgOutpostCounts.get(outpost.burgId) ?? 0) + 1);
      }
    }
  }

  for (const faction of activeFactions) {
    const hqPoint = resolveHqCoords(faction);
    if (!hqPoint) continue;
    const [hx, hy] = hqPoint;

    // 1. Connection lines & outposts
    for (const outpost of faction.outposts) {
      if (outpost.pillaged) continue;
      const burg = pack.burgs?.[outpost.burgId];
      if (!burg || burg.removed) continue;

      const totalAtBurg = burgOutpostCounts.get(outpost.burgId) ?? 1;
      const curIdx = burgOutpostIndices.get(outpost.burgId) ?? 0;
      burgOutpostIndices.set(outpost.burgId, curIdx + 1);

      const angle = (curIdx / Math.max(1, totalAtBurg)) * Math.PI * 2 - Math.PI / 2;
      const radius = 12 + Math.min(10, totalAtBurg * 2);
      const ox = burg.x + Math.cos(angle) * radius;
      const oy = burg.y + Math.sin(angle) * radius;

      // Draw connection line if HQ is different from outpost
      if (Math.hypot(hx - ox, hy - oy) > 15) {
        const midX = (hx + ox) / 2;
        const midY = (hy + oy) / 2 - 20;
        linesMarkup.push(
          `<path d="M${hx},${hy} Q${midX},${midY} ${ox},${oy}" stroke="${faction.color}" stroke-width="1.2" stroke-dasharray="3,3" opacity="0.55" fill="none" pointer-events="none"/>`
        );
      }

      // Check viewport bounds for outpost
      if (ox + 10 >= bounds.x0 && ox - 10 <= bounds.x1 && oy + 10 >= bounds.y0 && oy - 10 <= bounds.y1) {
        const opTip = `${escapeHtml(faction.name)} (${t("Outpost")})<br/>${t("Tier")}: ${outpost.tier} • ${t("Influence")}: ${outpost.influence}%<br/>${t("Assets")}: ${outpost.assets.join(", ") || t("None")}`;
        outpostsMarkup.push(
          `<g class="faction-outpost" data-id="${faction.i}" data-outpost-burg="${outpost.burgId}" data-type="faction" data-tip="${opTip}" style="cursor: pointer;" pointer-events="all">` +
            `<circle cx="${ox}" cy="${oy}" r="6" fill="${faction.color}" stroke="#1e293b" stroke-width="1.2"/>` +
            `<circle cx="${ox}" cy="${oy}" r="4" fill="#ffffff" opacity="0.9"/>` +
            `<text x="${ox}" y="${oy + 0.5}" font-size="5" font-weight="bold" fill="#0f172a" text-anchor="middle" dominant-baseline="central">${outpost.tier}</text>` +
            `</g>`
        );
      }
    }

    // 2. HQ Pin
    if (hx + drawn >= bounds.x0 && hx - drawn <= bounds.x1 && hy + drawn >= bounds.y0 && hy - drawn <= bounds.y1) {
      const hqLocationName = faction.hq.burgId
        ? (pack.burgs?.[faction.hq.burgId]?.name ?? `Burg ${faction.hq.burgId}`)
        : faction.hq.markerId !== undefined
          ? (pack.markers?.[faction.hq.markerId]?.legend ?? `Marker ${faction.hq.markerId}`)
          : `Cell ${faction.hq.cell}`;
      const pillagedBadge = faction.hq.pillaged ? `<br/>${t("Pillaged")}` : "";
      const hqTip = `<b>${escapeHtml(faction.name)}</b><br/>${capitalize(faction.category)} • ${capitalize(faction.alignment)}<br/>${t("Allegiance")}: ${capitalize(faction.allegiance)}<br/>HQ: ${escapeHtml(hqLocationName)}${pillagedBadge}<br/>${t("Treasury")}: ${faction.treasury}g • ${t("Influence")}: ${faction.influence}`;

      hqsMarkup.push(
        `<svg id="faction-hq-${faction.i}" class="faction-hq" data-id="${faction.i}" data-type="faction" data-tip="${hqTip}" viewBox="0 0 32 38" width="${drawn}px" height="${(drawn * 38) / 32}px" x="${hx - drawn / 2}" y="${hy - (drawn * 38) / 32}" overflow="visible" style="cursor: pointer;" pointer-events="all">` +
          `<g>` +
          // Crest shape
          `<path d="M16 2 C8.5 2 4 6.5 4 15 C4 24 16 35 16 35 C16 35 28 24 28 15 C28 6.5 23.5 2 16 2 Z" fill="${faction.hq.pillaged ? "#475569" : faction.color}" stroke="#0f172a" stroke-width="1.6"/>` +
          (faction.hq.pillaged
            ? `<text x="16" y="18" font-size="11" text-anchor="middle" dominant-baseline="central">💀</text>`
            : // Inner badge
              `<circle cx="16" cy="14" r="8.5" fill="#f8fafc" stroke="#334155" stroke-width="0.8"/>` +
              `<text x="16" y="16.5" font-size="10" text-anchor="middle" dominant-baseline="central">${faction.icon || "⚔️"}</text>`) +
          `</g></svg>`
      );
    }
  }

  container.innerHTML = `<g id="factionLines">${linesMarkup.join("")}</g><g id="factionOutposts">${outpostsMarkup.join("")}</g><g id="factionHQs">${hqsMarkup.join("")}</g>`;

  // Setup click handler if not already attached
  if (!container.dataset.hasClickListener) {
    container.dataset.hasClickListener = "true";
    container.addEventListener("click", event => {
      const target = (event.target as Element)?.closest?.<SVGElement>("[data-id][data-type='faction']");
      if (target?.dataset?.id) {
        const id = Number(target.dataset.id);
        if (id > 0) {
          void Controllers.FactionsEditor.open(id);
        }
      }
    });
  }
}
