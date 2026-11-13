import type { DemandCategory, Good } from "@/types/economy";

type AstralGoodRawSpec = {
  name: string;
  tags: string[];
  value: number;
  carriage?: number;
  deposits?: [number, number];
  distribution?: string;
  development?: number;
  biomeOutput?: Partial<Record<number, number>>;
  multipliers?: Good["multipliers"];
  icon: string;
  color: string;
  demandCoverage: Partial<Record<DemandCategory, number>>;
  recipes?: Record<string, number>[];
};

const ASTRAL_COMMODITIES_SPECS: AstralGoodRawSpec[] = [
  {
    name: "Metawheat",
    tags: ["common", "agricultural", "bulky", "tl0"],
    value: 1,
    carriage: 0.5,
    deposits: [4, 7],
    distribution: "biome(4, 6) && (river() || random(30))",
    biomeOutput: { 4: 0.06, 6: 0.06 },
    icon: "goods-grain",
    color: "#c8ad55",
    demandCoverage: { food: 3 }
  },
  {
    name: "Metal Ingots, Common",
    tags: ["common", "mineral", "bulky", "tl1"],
    value: 2,
    carriage: 0.7,
    deposits: [4, 8],
    distribution: "minHeight(45) || (biome(12) && nth(5))",
    biomeOutput: { 12: 0.04 },
    icon: "goods-iron",
    color: "#707982",
    demandCoverage: { construction: 2 }
  },
  {
    name: "Livestock, Common",
    tags: ["common", "livestock", "tl0"],
    value: 4,
    carriage: 0.4,
    deposits: [3, 5],
    distribution: "(biome(3, 4) && !elevation()) || (biome(6) && random(70))",
    biomeOutput: { 3: 0.03, 4: 0.04 },
    icon: "goods-cattle",
    color: "#8c6747",
    demandCoverage: { food: 2, utilities: 1 }
  },
  {
    name: "Drugs, Raw Materials",
    tags: ["agricultural", "biotech", "bulky", "tl0"],
    value: 4,
    carriage: 0.5,
    deposits: [3, 5],
    distribution: "biome(5, 7, 8, 12)",
    biomeOutput: { 5: 0.02, 7: 0.03, 8: 0.02 },
    icon: "goods-tobacco",
    color: "#3e7d58",
    demandCoverage: { utilities: 1 }
  },
  {
    name: "Metal Ingots, Rare Alloys",
    tags: ["mineral", "bulky", "rare", "tl3"],
    value: 10,
    carriage: 0.8,
    deposits: [2, 4],
    distribution: "minHeight(60) || (minHeight(30) && elevation())",
    development: 15,
    icon: "goods-bronze",
    color: "#c5832b",
    demandCoverage: { construction: 3 }
  },
  {
    name: "Livestock, Gengineered",
    tags: ["livestock", "biotech", "tl0"],
    value: 20,
    carriage: 0.6,
    deposits: [2, 4],
    distribution: "biome(4, 5, 6, 8) && minHabitability(40)",
    development: 20,
    icon: "goods-horses",
    color: "#3aa598",
    demandCoverage: { food: 3, luxury: 1 }
  },
  {
    name: "Native Artwork",
    tags: ["cultural", "luxury", "tl0"],
    value: 20,
    carriage: 0.5,
    deposits: [2, 4],
    distribution: "minHabitability(30) && (shore(1, 2) || river())",
    icon: "goods-amber",
    color: "#b75388",
    demandCoverage: { luxury: 3 }
  },
  {
    name: "Exotic Jewels",
    tags: ["rare", "mineral", "luxury", "compact", "tl0"],
    value: 50,
    carriage: 0.5,
    deposits: [1, 3],
    distribution: "minHeight(65) || (biome(1, 7) && random(25))",
    icon: "goods-gemstones",
    color: "#38bdf8",
    demandCoverage: { luxury: 4 }
  },
  {
    name: "Livestock, Luxury Pets",
    tags: ["livestock", "luxury", "tl0"],
    value: 50,
    carriage: 0.6,
    deposits: [1, 3],
    distribution: "biome(5, 7, 8, 9)",
    icon: "goods-elephants",
    color: "#a855f7",
    demandCoverage: { luxury: 3 }
  },
  {
    name: "Slaves",
    tags: ["sapient", "tl0"],
    value: 50,
    carriage: 0.5,
    deposits: [1, 3],
    distribution: "minHabitability(20) && random(20)",
    icon: "goods-slaves",
    color: "#78716c",
    demandCoverage: { utilities: 2, construction: 1 }
  },
  {
    name: "Pretech Junk",
    tags: ["pretech", "rare", "tl0"],
    value: 100,
    carriage: 1,
    deposits: [2, 4],
    distribution: "(biome(1, 2, 10) && random(20)) || (minHeight(55) && nth(7))",
    icon: "goods-unknown",
    color: "#f59e0b",
    demandCoverage: { construction: 2, luxury: 2 }
  },
  {
    name: "Clothing",
    tags: ["common", "low-tech", "cultural", "tl0"],
    value: 2,
    icon: "goods-garments",
    color: "#3b82f6",
    demandCoverage: { utilities: 2, luxury: 1 },
    recipes: [{ Metawheat: 1 }, { "Livestock, Common": 0.5 }]
  },
  {
    name: "Colonial Supplies",
    tags: ["agricultural", "survival", "postech", "tl4"],
    value: 2,
    icon: "goods-barrels",
    color: "#84cc16",
    demandCoverage: { food: 2, utilities: 2 },
    recipes: [{ Metawheat: 1, "Livestock, Common": 0.5 }, { "Fusion Plants": 0.5 }]
  },
  {
    name: "Colonial Materials",
    tags: ["survival", "postech", "common", "tl4"],
    value: 4,
    icon: "goods-sand",
    color: "#eab308",
    demandCoverage: { construction: 2, utilities: 1 },
    recipes: [{ "Metal Ingots, Common": 1 }, { "Fusion Plants": 0.5 }]
  },
  {
    name: "Housewares, Basic",
    tags: ["low-tech", "consumer", "tl1"],
    value: 4,
    icon: "goods-ceramics",
    color: "#f97316",
    demandCoverage: { utilities: 2 },
    recipes: [{ "Metal Ingots, Common": 0.5 }]
  },
  {
    name: "Housewares, Postech",
    tags: ["consumer", "postech", "tl4"],
    value: 10,
    icon: "goods-glass",
    color: "#06b6d4",
    demandCoverage: { utilities: 3, luxury: 1 },
    recipes: [{ "Housewares, Basic": 1, "Parts, Basic Industry": 0.5 }, { "Fusion Plants": 0.5 }]
  },
  {
    name: "Parts, Basic Industry",
    tags: ["low-tech", "tool", "tl2"],
    value: 10,
    icon: "goods-tools",
    color: "#64748b",
    demandCoverage: { construction: 3 },
    recipes: [{ "Metal Ingots, Common": 1 }]
  },
  {
    name: "Small Arms, Projectile",
    tags: ["military", "low-tech", "tl3"],
    value: 10,
    icon: "goods-gunpowder",
    color: "#dc2626",
    demandCoverage: { military: 2 },
    recipes: [{ "Metal Ingots, Common": 1, "Parts, Basic Industry": 0.5 }]
  },
  {
    name: "Tools, Basic Hand Tools",
    tags: ["low-tech", "tool", "tl1"],
    value: 10,
    icon: "goods-tools",
    color: "#71717a",
    demandCoverage: { utilities: 2, construction: 1 },
    recipes: [{ "Metal Ingots, Common": 1 }]
  },
  {
    name: "Fine Liquor",
    tags: ["luxury", "low-tech", "compact", "tl0"],
    value: 20,
    icon: "goods-liquor",
    color: "#991b1b",
    demandCoverage: { luxury: 3, food: 1 },
    recipes: [{ Metawheat: 2 }]
  },
  {
    name: "Fusion Plants",
    tags: ["postech", "tool", "bulky", "tl4"],
    value: 20,
    icon: "goods-artillery",
    color: "#0284c7",
    demandCoverage: { construction: 4, utilities: 2 },
    recipes: [{ "Parts, Basic Industry": 1, "Metal Ingots, Rare Alloys": 0.5 }]
  },
  {
    name: "Postech Building Material",
    tags: ["tool", "postech", "bulky", "tl2"],
    value: 20,
    icon: "goods-stone",
    color: "#475569",
    demandCoverage: { construction: 4 },
    recipes: [{ "Colonial Materials": 1, "Metal Ingots, Common": 1 }, { "Fusion Plants": 0.5 }]
  },
  {
    name: "Small Arms, Energy",
    tags: ["military", "postech", "tl4"],
    value: 20,
    icon: "goods-arms",
    color: "#ef4444",
    demandCoverage: { military: 3 },
    recipes: [{ "Small Arms, Projectile": 1, "Metal Ingots, Rare Alloys": 0.5 }]
  },
  {
    name: "Tools, Industrial",
    tags: ["tool", "postech", "tl4"],
    value: 20,
    icon: "goods-tools",
    color: "#0d9488",
    demandCoverage: { construction: 3, utilities: 2 },
    recipes: [{ "Tools, Basic Hand Tools": 1, "Parts, Basic Industry": 1 }, { "Fusion Plants": 0.5 }]
  },
  {
    name: "Medical Supplies, Postech",
    tags: ["medical", "postech", "compact", "tl4"],
    value: 50,
    icon: "goods-saltpeter",
    color: "#10b981",
    demandCoverage: { utilities: 4 },
    recipes: [{ "Drugs, Raw Materials": 2 }, { "Fusion Plants": 0.5 }]
  },
  {
    name: "Parts, Starship Maintenance",
    tags: ["postech", "astronautic", "rare", "tl4"],
    value: 50,
    icon: "goods-ships",
    color: "#2563eb",
    demandCoverage: { construction: 3, military: 2 },
    recipes: [{ "Parts, Basic Industry": 1, "Metal Ingots, Rare Alloys": 1 }]
  },
  {
    name: "Tools, Astronautic",
    tags: ["tool", "postech", "astronautic", "tl4"],
    value: 50,
    icon: "goods-tools",
    color: "#1d4ed8",
    demandCoverage: { construction: 3, utilities: 2 },
    recipes: [{ "Tools, Industrial": 1, "Parts, Starship Maintenance": 0.5 }]
  },
  {
    name: "Drugs, Recreational",
    tags: ["luxury", "biotech", "compact", "tl3"],
    value: 100,
    icon: "goods-incense",
    color: "#ec4899",
    demandCoverage: { luxury: 4 },
    recipes: [{ "Drugs, Raw Materials": 3 }]
  },
  {
    name: "Housewares, Pretech",
    tags: ["consumer", "pretech", "tl5"],
    value: 100,
    icon: "goods-glass",
    color: "#8b5cf6",
    demandCoverage: { luxury: 4, utilities: 2 },
    recipes: [{ "Housewares, Postech": 1, "Pretech Junk": 0.5 }]
  },
  {
    name: "Tools, Medical Equipment",
    tags: ["tool", "postech", "medical", "tl4"],
    value: 100,
    icon: "goods-tools",
    color: "#059669",
    demandCoverage: { utilities: 4 },
    recipes: [{ "Medical Supplies, Postech": 1, "Tools, Industrial": 0.5 }]
  },
  {
    name: "Parts, Pretech Industry",
    tags: ["pretech", "tool", "tl4"],
    value: 200,
    icon: "goods-tools",
    color: "#d97706",
    demandCoverage: { construction: 5, luxury: 2 },
    recipes: [{ "Parts, Starship Maintenance": 1, "Pretech Junk": 1 }]
  },
  {
    name: "Small Arms, Pretech",
    tags: ["military", "pretech", "tl5"],
    value: 200,
    icon: "goods-arms",
    color: "#b91c1c",
    demandCoverage: { military: 5 },
    recipes: [{ "Small Arms, Energy": 1, "Pretech Junk": 1 }]
  },
  {
    name: "Medical Supplies, Pretech",
    tags: ["medical", "pretech", "compact", "tl5"],
    value: 400,
    icon: "goods-perfume",
    color: "#14b8a6",
    demandCoverage: { utilities: 5, luxury: 3 },
    recipes: [{ "Medical Supplies, Postech": 2, "Pretech Junk": 1 }]
  },
  {
    name: "Ghoul Immortality Tech",
    tags: ["medical", "maltech", "compact", "tl5"],
    value: 800,
    icon: "goods-candles",
    color: "#4c1d95",
    demandCoverage: { luxury: 5, military: 2 },
    recipes: [{ "Medical Supplies, Pretech": 1, Slaves: 1 }]
  },
  {
    name: "Matter Compiler Matrix",
    tags: ["pretech", "post-scarcity", "tool", "compact", "tl5"],
    value: 300,
    carriage: 0.1,
    development: 90,
    icon: "goods-tools",
    color: "#38bdf8",
    demandCoverage: { construction: 5, utilities: 5, food: 4 },
    recipes: [{ "Fusion Plants": 1 }]
  },
  {
    name: "Esoteric Circuitry & VI Cores",
    tags: ["pretech", "post-scarcity", "cybernetic", "compact", "tl5"],
    value: 500,
    carriage: 0.1,
    development: 90,
    icon: "goods-gemstones",
    color: "#c084fc",
    demandCoverage: { luxury: 5, utilities: 5, military: 4 },
    recipes: [{ "Fusion Plants": 1, "Metal Ingots, Rare Alloys": 0.5 }]
  }
];

const TL_DEVELOPMENT: Record<string, number> = {
  tl1: 6,
  tl2: 24,
  tl3: 34,
  tl4: 54,
  tl5: 78
};

function inferAstralDevelopment(spec: AstralGoodRawSpec): number | undefined {
  if (spec.development !== undefined) return spec.development;
  for (const tag of spec.tags) {
    if (tag in TL_DEVELOPMENT) return TL_DEVELOPMENT[tag];
  }
  return undefined;
}

export const ASTRAL_GOODS_DATA: Good[] = ASTRAL_COMMODITIES_SPECS.map((spec, index): Good => {
  let recipes: Good["recipes"];
  if (spec.recipes) {
    recipes = spec.recipes.map(recipe => {
      const entries = Object.entries(recipe).map(([name, amount]) => {
        const foundIndex = ASTRAL_COMMODITIES_SPECS.findIndex(s => s.name === name);
        if (foundIndex === -1) throw new Error(`Unknown ingredient ${name} in ${spec.name}`);
        return [foundIndex + 1, amount];
      });
      return Object.fromEntries(entries);
    });
  }

  const development = inferAstralDevelopment(spec);
  return {
    i: index + 1,
    name: spec.name,
    tags: [...spec.tags],
    value: spec.value,
    carriage: spec.carriage ?? 1,
    ...(spec.deposits && { deposits: spec.deposits }),
    ...(spec.distribution && { distribution: spec.distribution }),
    ...(development !== undefined && { development }),
    unit: "ton",
    icon: spec.icon,
    color: spec.color,
    biomeOutput: spec.biomeOutput ?? {},
    ...(spec.multipliers && { multipliers: spec.multipliers }),
    demandCoverage: spec.demandCoverage,
    ...(recipes && { recipes })
  };
});

export function isAstralGoodsCatalogue(goods: readonly Good[] = options.map.goods): boolean {
  if (!goods?.length) return false;
  return goods.some(
    good =>
      good.tags?.includes("astronautic") ||
      good.tags?.includes("postech") ||
      good.tags?.includes("pretech") ||
      good.name === "Metawheat"
  );
}
