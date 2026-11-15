// The Networks layer: one marker per network node and one path per direct route
import { NETWORK_KIND_DEFINITIONS, type Network } from "@/data/astral-networks";
import { Networks } from "@/model/astral/networks";
import { type Route, Routes } from "@/model/economy/routes-generator";
import { Icons } from "@/model/icons";
import { Layers } from "@/renderers/layers";
import { zoomFontSize } from "@/renderers/viewport/viewport";
import { boundsIntersect, ViewportLayers, type ViewportRenderContext } from "@/renderers/viewport/viewport-renderer";
import { rn } from "@/utils/number-utils";
import { escapeHtml } from "@/utils/string-utils";
import { writeAttrs } from "./system-markers";

type NetworkStyle = (typeof styles)["networks"]["groups"][string];

const layer = ViewportLayers.register({ id: "networks", render: reconcileNetworks });

export function drawNetworks(): void {
  layer.render();
}

export function removeNetworks(): void {
  document.querySelector("#networks")?.replaceChildren();
}

function reconcileNetworks({ root, bounds }: ViewportRenderContext): void {
  if (!Layers.isOn("networks")) return;

  const container = root.querySelector<SVGGElement>("#networks");
  if (!container) return;

  const markup: string[] = [];
  for (const network of Networks.getAll()) {
    const style = styles.networks.groups[network.kind];
    if (!style) continue;

    const html = writeNetwork(network, style, bounds);
    if (html) markup.push(html);
  }

  container.innerHTML = markup.join("");
}

function writeNetwork(network: Network, style: NetworkStyle, bounds: ViewportRenderContext["bounds"]): string {
  const size = style.options.size ?? 1;
  const em = (size * zoomFontSize("networks", bounds.scale)) / 100; // the node glyph in map units
  const padding = em * 1.5;

  const nodes = network.nodes
    .map((node, index) => {
      if (
        node.x + padding < bounds.x0 ||
        node.x - padding > bounds.x1 ||
        node.y + padding < bounds.y0 ||
        node.y - padding > bounds.y1
      )
        return "";

      return /* html */ `<g id="networkNode${network.i}-${index}" data-node="${index}" data-cell="${node.cell}" transform="translate(${rn(node.x, 2)} ${rn(node.y, 2)})">
        <circle class="ring" r="0.85em" fill="none"/>
        <use href="${escapeHtml(nodeGlyph(network))}" x="-0.5em" y="-0.5em" width="1em" height="1em"/>
      </g>`;
    })
    .join("");

  const links = Networks.routesOf(network.i)
    .filter(route => routeIntersects(route, bounds))
    .map(route => writeLink(route, style))
    .join("");

  if (!nodes && !links) return "";

  const linksGroup = links ? `<g class="links">${links}</g>` : "";
  return /* html */ `<g id="network${network.i}" data-network="${network.i}">
    <g data-group="${escapeHtml(network.kind)}" font-size="${size}%"${writeAttrs(style.attrs)}>
      ${linksGroup}
      <g class="nodes">${nodes}</g>
    </g>
  </g>`;
}

function nodeGlyph(network: Network): string {
  return Icons.href(Icons.reference(NETWORK_KIND_DEFINITIONS[network.kind].icon));
}

function writeLink(route: Route, style: NetworkStyle): string {
  const path = Routes.getPath(route);
  const dash = style.options.linkDash;
  const opacity = style.options.linkOpacity ?? 1;
  const attrs = [
    'fill="none"',
    `stroke="${escapeHtml(style.options.linkColor)}"`,
    `stroke-width="${rn(style.options.linkWidth, 2)}"`,
    `stroke-opacity="${rn(opacity, 2)}"`,
    dash ? `stroke-dasharray="${escapeHtml(dash)}"` : "",
    'stroke-linecap="round"',
    'stroke-linejoin="round"'
  ]
    .filter(Boolean)
    .join(" ");

  // the wider transparent path is the click target; the visible one can be too thin to hit
  return `<path id="route${route.i}" class="networkLink" d="${path}" ${attrs}/><path class="networkLinkHit" d="${path}" fill="none" stroke="transparent" stroke-width="2" pointer-events="stroke"/>`;
}

function routeIntersects(route: Route, bounds: ViewportRenderContext["bounds"]): boolean {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of route.points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return boundsIntersect({ x0, y0, x1, y1 }, bounds);
}
