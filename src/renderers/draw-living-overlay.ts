// Transient on-map juice for the Living HUD: army/raid vectors and floating
// outcome badges. See docs/plans/living-world.md (slice 5).
import { Living, UNIT_MAX_HP } from "@/model/physical/living-generator";
import { viewport } from "@/renderers/viewport/viewport";
import type { LivingNewsItem, LivingWorldState } from "@/types/living";
import { escapeHtml } from "@/utils";

const SVG_NS = "http://www.w3.org/2000/svg";
const OVERLAY_ID = "livingOverlay";
const CONTENT_ID = "livingOverlayContent";
const TOASTS_ID = "livingToasts";
const STYLE_ID = "livingOverlayStyle";
const MAX_BADGES = 5;

const NEWS_ICONS: Partial<Record<LivingNewsItem["kind"], string>> = {
  war: "🏹",
  battle: "⚔️",
  conquest: "⚔️",
  resist: "🛡️",
  revolt: "🔥",
  succession: "👑",
  build: "🏛️",
  develop: "🏗️",
  muster: "🎖️",
  colonize: "🏳️",
  pacify: "🕊️",
  trouble: "🎲",
  lair: "💀",
  tech: "📜",
  religion: "🕊️"
};

const NEWS_COLORS: Partial<Record<LivingNewsItem["kind"], string>> = {
  battle: "#a33d3d",
  conquest: "#a33d3d",
  revolt: "#a33d3d",
  lair: "#8b0000",
  trouble: "#b8860b",
  succession: "#6a4c93",
  religion: "#6a4c93"
};

const OVERLAY_CSS = /* css */ `
  @keyframes livingFloatUp {
    0% { opacity: 0; transform: translateY(6px); }
    8% { opacity: 1; transform: translateY(0); }
    72% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-28px); }
  }
  @keyframes livingDashFlow {
    to { stroke-dashoffset: -20; }
  }
  @keyframes livingRaidPulse {
    0%, 100% { opacity: 0.45; }
    50% { opacity: 0.95; }
  }
  .livingFloatBadgeInner { animation: livingFloatUp 4s ease-out forwards; }
  .livingVectorPath { animation: livingDashFlow 1.1s linear infinite; }
  .livingVector-raid .livingVectorPath {
    animation: livingDashFlow 1.1s linear infinite, livingRaidPulse 1.4s ease-in-out infinite;
  }
`;

export interface LivingVector {
  id: string;
  kind: "raid" | "war";
  from: [number, number];
  to: [number, number];
  color: string;
  label: string;
}

export interface LivingBadge {
  id: string;
  cell: number;
  text: string;
  color: string;
}

const VECTOR_COLORS = { raid: "#8b0000", war: "#a33d3d" } as const;

function cellPoint(cell: number | undefined): [number, number] | null {
  if (cell === undefined) return null;
  const point = pack?.cells?.p?.[cell];
  return point ? [point[0], point[1]] : null;
}

function burgPoint(burgId: number | undefined): [number, number] | null {
  if (!burgId) return null;
  const burg = pack?.burgs?.[burgId];
  if (!burg?.i || burg.removed) return null;
  return [burg.x, burg.y];
}

function nearestBurgPoint(cell: number, provinceId: number | undefined): [number, number] | null {
  const origin = cellPoint(cell);
  if (!origin || !pack?.burgs?.length) return null;

  let best: [number, number] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const burg of pack.burgs) {
    if (!burg?.i || burg.removed) continue;
    const sameProvince = provinceId !== undefined && pack.cells.province?.[burg.cell] === provinceId;
    const distance = Math.hypot(burg.x - origin[0], burg.y - origin[1]) * (sameProvince ? 0.5 : 1);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [burg.x, burg.y];
    }
  }
  return best;
}

/** Raid lines from imminent lairs and war arrows from conquer/reclaim agendas. */
export function collectLivingVectors(living: LivingWorldState): LivingVector[] {
  if (!pack?.cells?.p) return [];
  const vectors: LivingVector[] = [];

  for (const pSim of Object.values(living.provinces ?? {})) {
    const lair = pSim?.lair;
    if (!lair?.raidPending) continue;
    const from = cellPoint(lair.cell);
    const to = nearestBurgPoint(lair.cell, pack.cells.province?.[lair.cell]);
    if (!from || !to) continue;
    vectors.push({
      id: `raid-${pSim.provinceId}`,
      kind: "raid",
      from,
      to,
      color: VECTOR_COLORS.raid,
      label: lair.name
    });
  }

  for (const sSim of Object.values(living.states ?? {})) {
    const agenda = sSim?.agenda;
    if (!agenda || (agenda.kind !== "conquer" && agenda.kind !== "reclaim")) continue;
    const state = pack.states?.[sSim.stateId];
    const from = burgPoint(state?.capital) ?? cellPoint(state?.center);
    const to = burgPoint(agenda.targetBurgId);
    if (!from || !to) continue;
    vectors.push({
      id: `war-${sSim.stateId}`,
      kind: "war",
      from,
      to,
      color: state?.color ?? VECTOR_COLORS.war,
      label: state?.name ?? "War"
    });
  }

  return vectors;
}

function badgeIcon(item: LivingNewsItem): string {
  if (/proclaim|ascend|crown|throne/i.test(item.text)) return "👑";
  if (/sack|pillage|raid/i.test(item.text)) return "💀";
  return NEWS_ICONS[item.kind] ?? "✦";
}

/** The outcome badges for the season that just resolved. */
export function collectLivingBadges(living: LivingWorldState): LivingBadge[] {
  const news = (living.recentNews ?? [])
    .filter(item => item.tick === living.tick && item.cell !== undefined)
    .filter(item => item.kind !== "trouble" && item.kind !== "lair");

  const badges: LivingBadge[] = news.map((item, index) => ({
    id: `${item.tick}-${index}`,
    cell: item.cell!,
    text: `${badgeIcon(item)} ${item.text}`,
    color: NEWS_COLORS[item.kind] ?? "#5e4fa2"
  }));

  // Tactical status: wounded 1UPT regiments and besieged cities.
  for (const state of pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    for (const regiment of state.military ?? []) {
      const unit = living.units?.[`${state.i}-${regiment.i}`];
      if (!unit || unit.hp >= UNIT_MAX_HP) continue;
      badges.push({
        id: `unit-${state.i}-${regiment.i}`,
        cell: regiment.cell,
        text: `❤️ ${Math.round(unit.hp)} HP`,
        color: unit.hp <= 30 ? "#a33d3d" : "#5e4fa2"
      });
    }
  }

  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    const bSim = living.burgs?.[burg.i];
    if (bSim?.hp === undefined || bSim.maxHp === undefined || bSim.hp >= bSim.maxHp) continue;
    badges.push({
      id: `city-${burg.i}`,
      cell: burg.cell,
      text: `🏰 ${Math.round(bSim.hp)} / ${Math.round(bSim.maxHp)}`,
      color: "#8b0000"
    });
  }

  return badges.slice(0, MAX_BADGES);
}

function vectorMarkup(vector: LivingVector): string {
  const [x1, y1] = vector.from;
  const [x2, y2] = vector.to;
  const dash = vector.kind === "raid" ? "3 3" : "7 4";
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return `<g class="livingVector livingVector-${vector.kind}" pointer-events="none">
    <path class="livingVectorPath" d="M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${vector.color}" stroke-width="1.2" stroke-dasharray="${dash}" stroke-linecap="round" opacity="0.8"/>
    <polygon points="0,-1.7 3.4,0 0,1.7" transform="translate(${x2.toFixed(1)}, ${y2.toFixed(1)}) rotate(${angle.toFixed(1)})" fill="${vector.color}"/>
    <text x="${((x1 + x2) / 2).toFixed(1)}" y="${((y1 + y2) / 2 - 2).toFixed(1)}" text-anchor="middle" font-size="3.6" fill="${vector.color}">${escapeHtml(vector.label)}</text>
  </g>`;
}

function badgeMarkup(badge: LivingBadge): string | null {
  const point = cellPoint(badge.cell);
  if (!point) return null;

  const [x, y] = point;
  const scale = Number.isFinite(viewport?.scale) && viewport.scale > 0 ? viewport.scale : 1;
  const invScale = 1 / scale;
  const width = Math.min(380, Math.max(120, badge.text.length * 7.5 + 24));
  return `<g class="livingFloatBadge" id="${badge.id}" transform="translate(${x.toFixed(1)}, ${y.toFixed(1)}) scale(${invScale.toFixed(4)})" pointer-events="none">
    <g class="livingFloatBadgeInner">
      <rect x="${(-width / 2).toFixed(1)}" y="-34" width="${width.toFixed(1)}" height="28" rx="5" fill="${badge.color}" opacity="0.95" filter="drop-shadow(0 2px 5px rgba(0,0,0,0.4))"/>
      <text y="-20" text-anchor="middle" dominant-baseline="central" font-size="12.5" font-weight="600" fill="#fff" font-family="sans-serif">${escapeHtml(badge.text)}</text>
    </g>
  </g>`;
}

function ensureOverlay(): SVGGElement | null {
  const viewbox = document.getElementById("viewbox");
  if (!viewbox) return null;

  let existing = document.getElementById(OVERLAY_ID) as unknown as SVGGElement | null;
  if (!existing) {
    existing = document.createElementNS(SVG_NS, "g") as unknown as SVGGElement;
    existing.setAttribute("id", OVERLAY_ID);
    existing.innerHTML = `<g id="${CONTENT_ID}"></g><g id="${TOASTS_ID}" pointer-events="none"></g>`;
    viewbox.appendChild(existing);
  } else if (!document.getElementById(TOASTS_ID)) {
    const toasts = document.createElementNS(SVG_NS, "g");
    toasts.setAttribute("id", TOASTS_ID);
    toasts.setAttribute("pointer-events", "none");
    existing.appendChild(toasts);
  }
  return existing;
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = OVERLAY_CSS;
  document.head.appendChild(style);
}

/** Show a transient floating toast over a specific cell. */
export function showLivingToast(badge: LivingBadge): void {
  const overlay = ensureOverlay();
  if (!overlay) return;
  ensureStyle();

  const toastsGroup = (document.getElementById(TOASTS_ID) as unknown as SVGGElement | null) ?? overlay;
  const point = cellPoint(badge.cell);
  if (!point) return;

  const [x, y] = point;
  const scale = Number.isFinite(viewport?.scale) && viewport.scale > 0 ? viewport.scale : 1;
  const invScale = 1 / scale;
  const width = Math.min(380, Math.max(120, badge.text.length * 7.5 + 24));

  const el = document.createElementNS(SVG_NS, "g") as unknown as SVGGElement;
  el.setAttribute("class", "livingFloatBadge");
  el.setAttribute("id", badge.id);
  el.setAttribute("transform", `translate(${x.toFixed(1)}, ${y.toFixed(1)}) scale(${invScale.toFixed(4)})`);
  el.setAttribute("pointer-events", "none");

  el.innerHTML = `<g class="livingFloatBadgeInner">
    <rect x="${(-width / 2).toFixed(1)}" y="-34" width="${width.toFixed(1)}" height="28" rx="5" fill="${badge.color}" opacity="0.95" filter="drop-shadow(0 2px 5px rgba(0,0,0,0.4))"/>
    <text y="-20" text-anchor="middle" dominant-baseline="central" font-size="12.5" font-weight="600" fill="#fff" font-family="sans-serif">${escapeHtml(badge.text)}</text>
  </g>`;

  toastsGroup.appendChild(el);

  const cleanup = () => el.remove();
  el.addEventListener("animationend", cleanup, { once: true });
  setTimeout(cleanup, 4200);
}

/** Clear all active living toasts from the overlay. */
export function clearLivingToasts(): void {
  const toasts = document.getElementById(TOASTS_ID);
  if (toasts) toasts.innerHTML = "";
}

/** Redraw the Living overlay from the current simulation state. Safe without a map. */
export function drawLivingOverlay(options: { includeBadges?: boolean } = {}): void {
  const group = ensureOverlay();
  if (!group) return;
  ensureStyle();

  const content = (document.getElementById(CONTENT_ID) as unknown as SVGGElement | null) ?? group;
  const living = Living.getState();
  const vectors = collectLivingVectors(living);
  const badges = options.includeBadges !== false ? collectLivingBadges(living) : [];

  content.innerHTML = [
    ...vectors.map(vectorMarkup),
    ...badges.map(badgeMarkup).filter((markup): markup is string => Boolean(markup))
  ].join("");
}

/** Remove the overlay and its stylesheet when the Living HUD closes. */
export function removeLivingOverlay(): void {
  clearLivingToasts();
  document.getElementById(OVERLAY_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
}
