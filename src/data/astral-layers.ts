// Astral view profiles: which layers the star chart shows. See docs/plans/astral-ui-overhaul.md
import type { LayerId } from "@/renderers/layers";

export interface AstralPreset {
  name: string;
  layers: LayerId[];
}

export const ASTRAL_DEFAULT_PRESET = "astral";

export const ASTRAL_PRESETS: Record<string, AstralPreset> = {
  astral: {
    name: "Astral chart",
    layers: ["states", "routes", "systems", "labels", "scaleBar"]
  },
  empires: {
    name: "Empires",
    layers: ["states", "provinces", "borders", "labels", "scaleBar"]
  },
  dustDensity: {
    name: "Dust Density",
    layers: ["dustDensity", "scaleBar"]
  },
  survey: {
    name: "Survey scan",
    layers: ["starDensity", "coordinates", "scaleBar"]
  },
  systems: {
    name: "Systems and lanes",
    layers: ["systems", "routes", "labels", "scaleBar"]
  }
};
