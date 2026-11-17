// The Networks layer: one marker per network node; network routes are drawn on the Routes layer
import { NETWORK_KIND_DEFINITIONS, type Network } from "@/data/astral-networks";
import { Networks } from "@/model/astral/networks";
import { Icons } from "@/model/icons";
import { Layers } from "@/renderers/layers";
import { zoomFontSize } from "@/renderers/viewport/viewport";
import { ViewportLayers, type ViewportRenderContext } from "@/renderers/viewport/viewport-renderer";
import { rn } from "@/utils/number-utils";
import { escapeHtml } from "@/utils/string-utils";
import { writeAttrs } from "./system-markers";

type NetworkStyle = (typeof styles)["networks"]["groups"][string];

const layer = ViewportLayers.register({ id: "networks", render: reconcileNetworks });
let renderHook: ((container: SVGGElement) => void) | null = null;

export function setNetworkRenderHook(hook: ((container: SVGGElement) => void) | null): void {
  renderHook = hook;
}

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
  renderHook?.(container);
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

  if (!nodes) return "";

  return /* html */ `<g id="network${network.i}" data-network="${network.i}">
    <g data-group="${escapeHtml(network.kind)}" font-size="${size}%"${writeAttrs(style.attrs)}>
      <g class="nodes">${nodes}</g>
    </g>
  </g>`;
}

function nodeGlyph(network: Network): string {
  return Icons.href(Icons.reference(NETWORK_KIND_DEFINITIONS[network.kind].icon));
}
