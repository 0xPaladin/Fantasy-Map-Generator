// Characters layer: one marker per living character with a known cell.
// See docs/plans/characters.md.
import { Controllers } from "@/controllers";
import { ACTION_DEFS, DICE } from "@/data/character-actions";
import { Characters } from "@/model/society/characters";
import { Layers } from "@/renderers/layers";
import { zoomFontSize } from "@/renderers/viewport/viewport";
import { ViewportLayers, type ViewportRenderContext } from "@/renderers/viewport/viewport-renderer";
import type { HistoricalFigure } from "@/types/history";
import { capitalize, escapeHtml } from "@/utils/string-utils";

const layer = ViewportLayers.register({ id: "characters", render: reconcileCharacters });

const ROLE_ICONS: Record<string, string> = {
  ruler: "♛",
  general: "⚔",
  prophet: "✦",
  rebel: "✹",
  adventurer: "✧",
  specialist: "◆",
  agent: "◈"
};

export function drawCharacters(): void {
  layer.render();
}

export function removeCharacters(): void {
  document.querySelector<SVGGElement>("#characters")?.replaceChildren();
}

function characterTooltip(character: HistoricalFigure): string {
  const status = character.removed ? "removed" : Characters.status(character);
  const role = character.roles.find(entry => entry.to === undefined) ?? character.roles.at(-1);
  const faction = Characters.factionsOf(character.i)
    .map(entry => entry.name)
    .join(", ");
  const actions = character.hero
    ? Object.values(ACTION_DEFS)
        .map(def => ({ label: def.label, die: character.hero!.actions[def.id] }))
        .sort((a, b) => DICE.indexOf(b.die) - DICE.indexOf(a.die))
        .slice(0, 3)
        .map(entry => `${entry.label} ${entry.die}`)
        .join(" · ")
    : "";

  return [
    `<b>${escapeHtml(character.name)}</b>`,
    `${character.hero ? "Hero" : "Background character"} · ${capitalize(status)}`,
    role ? `${capitalize(role.type)} ${role.target.kind} ${role.target.id}` : "",
    faction ? `Faction: ${escapeHtml(faction)}` : "",
    actions ? `Actions: ${escapeHtml(actions)}` : ""
  ]
    .filter(Boolean)
    .join("<br/>");
}

function reconcileCharacters({ root, bounds }: ViewportRenderContext): void {
  const container = root.querySelector<SVGGElement>("#characters");
  if (!container || !Layers.isOn("characters")) return;

  const characters = Characters.active().filter(character => character.cell !== undefined);
  if (!characters.length) {
    container.replaceChildren();
    return;
  }

  const fontSize = zoomFontSize("characters", bounds.scale);
  const markup: string[] = [];

  for (const character of characters) {
    const [x, y] = pack.cells.p[character.cell!] ?? [];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const size = character.hero ? 34 : 24;
    const drawn = (size / 100) * fontSize;
    const radius = Math.max(3, drawn / 2);
    if (x + radius < bounds.x0 || x - radius > bounds.x1 || y + radius < bounds.y0 || y - radius > bounds.y1) continue;

    const role = character.roles.find(entry => entry.to === undefined) ?? character.roles.at(-1);
    const glyph = character.hero ? "★" : (ROLE_ICONS[role?.type ?? ""] ?? "•");
    const fill = character.hero ? "#f59e0b" : "#38bdf8";
    const stroke = character.hero ? "#7c2d12" : "#0f172a";
    const tooltip = characterTooltip(character);

    markup.push(
      `<g id="character${character.i}" class="character-marker" data-id="${character.i}" data-type="character" data-tip="${tooltip}" style="cursor:pointer;" pointer-events="all">` +
        `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${Math.max(0.8, radius / 6)}"/>` +
        `<text x="${x}" y="${y + radius * 0.06}" font-size="${radius * 1.15}" fill="#0f172a" text-anchor="middle" dominant-baseline="central">${glyph}</text>` +
        `</g>`
    );
  }

  container.innerHTML = markup.join("");
  if (!container.dataset.hasClickListener) {
    container.dataset.hasClickListener = "true";
    container.addEventListener("click", event => {
      const target = (event.target as Element | null)?.closest?.<SVGGElement>("[data-id][data-type='character']");
      const id = Number(target?.dataset.id);
      if (Number.isFinite(id)) Controllers.CharactersEditor.openDetails(id);
    });
  }
}
