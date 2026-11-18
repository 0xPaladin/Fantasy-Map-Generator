import type { ZoomSize } from "@/data/style-choices";

export const viewport = { width: 0, height: 0, scale: 1, x: 0, y: 0 };

/** The font size at a zoom scale, in % of the size at scale 1: from growing with the map to keeping its pixels */
const ZOOM_CURVES: Record<ZoomSize, (scale: number) => number> = {
  screen: scale => 100 / scale,
  arithmetic: scale => (100 + 100 / scale) / 2,
  geometric: scale => 100 / Math.sqrt(scale),
  natural: scale => 100 / (1 + (scale - 1) / 80),
  map: () => 100
};

/** The layers whose font size follows the zoom, each as its `zoomSize` style option says; every other layer keeps its sizes */
export const ZOOMED_LAYERS = ["labels", "markers", "burgIcons"] as const;
export type ZoomedLayer = (typeof ZOOMED_LAYERS)[number];

/** The fork's extra zoomed layers, which have no style option and keep their original curve */
const FIXED_ZOOM_CURVES = {
  trouble: "geometric",
  factions: "geometric",
  characters: "geometric",
  systems: "natural",
  networks: "natural"
} as const;
type FixedZoomedLayer = keyof typeof FIXED_ZOOM_CURVES;
export const FIXED_ZOOMED_LAYERS = Object.keys(FIXED_ZOOM_CURVES) as FixedZoomedLayer[];

/** The font size of a zoomed layer at a scale, in px */
export const zoomFontSize = (layer: ZoomedLayer | FixedZoomedLayer, scale: number): number => {
  const zoomSize: ZoomSize =
    layer in FIXED_ZOOM_CURVES
      ? FIXED_ZOOM_CURVES[layer as FixedZoomedLayer]
      : (styles[layer as ZoomedLayer].options.zoomSize as ZoomSize);
  return Math.max(Math.round(ZOOM_CURVES[zoomSize](scale) * 100) / 100, 1);
};

/** Set the svg resolution */
export function setViewportSize(width: number, height: number): void {
  viewport.width = width;
  viewport.height = height;
}

/** Set the map transform */
export function setViewportTransform(scale: number, x: number, y: number): void {
  viewport.scale = scale;
  viewport.x = x;
  viewport.y = y;
}
