// Shared profile types for generated sites (dungeons first, ruins next)
import type { InhabitantGroup } from "@/data/inhabitants";

export interface SiteRatings {
  danger: number;
  treasure: number;
  scale: number;
  mystery: number;
  weirdness: number;
}

export interface SiteInhabitants {
  rating: number;
  groups: InhabitantGroup[];
  relationship?: string;
}
