import type { DemandCategory, Good } from "@/model/economy/goods-generator";

export type AstralWorldType =
  | "Agricultural"
  | "Alien"
  | "Cosmopolitan"
  | "Decadent"
  | "Industrial"
  | "Primitive"
  | "Savage"
  | "Tyrannical";

export interface AstralWorldTypeSpec {
  name: AstralWorldType;
  summary: string;
  modifiers: Record<string, number>;
  troubleChance: number;
  troubles: string[];
  tradeTable: number[];
}

export const ASTRAL_WORLD_TYPES: Record<AstralWorldType, AstralWorldTypeSpec> = {
  Agricultural: {
    name: "Agricultural",
    summary: "Vast robotic farmworlds and fertile breadbaskets feeding entire sectors.",
    modifiers: { agricultural: -2, livestock: -1, biotech: 1, tool: 2 },
    troubleChance: 2,
    troubles: [
      "Cargo infested with mold, 1d4 x 10% of goods sold are ruined",
      "Farmer's union forces a discount; add 1d4 Friction to this deal",
      "Harvest going on and labor is scarce; stuck 1d4 weeks before deal is completed",
      "Local grower's customs make this deal harder; stuck for one week and add 1 Friction",
      "Natives have allergic reaction to goods, add 2 Friction to this deal",
      "Ship quarantine for plant disease check; stuck there for 1d6+1 weeks"
    ],
    tradeTable: [12, 4, 20, 15, 3, 6, 9, 1, 7, 19]
  },
  Alien: {
    name: "Alien",
    summary: "Inhabited by non-human species or drastically gengineered variant human strains.",
    modifiers: { alien: -2, medical: -1, biotech: 1, cultural: 2 },
    troubleChance: 4,
    troubles: [
      "Ignorant handling or use wrecks 1d4 x 10% of the goods",
      "Local pest ruins 1d4 x 10% of the goods",
      "Local rituals add 2 weeks to finishing the deal",
      "Product has unwanted side-effects on alien biology, add 1d4+1 Friction",
      "Product is mistrusted or hard to get from local retailers, add 1d6+1 weeks until trade",
      "Unexpected alien custom adds 1d4 Friction"
    ],
    tradeTable: [12, 4, 16, 3, 6, 1, 7, 11, 23, 24]
  },
  Cosmopolitan: {
    name: "Cosmopolitan",
    summary: "Bustling interstellar hubs with established trade lanes and sophisticated markets.",
    modifiers: { cultural: -2, military: -1, luxury: 1, pretech: 2 },
    troubleChance: 1,
    troubles: [
      "A functionary finds a number of unpaid tariffs; add 1d4 Friction to the deal",
      "A local bureaucrat has been annoyed by the PCs; add 1 Friction to the deal",
      "Administrative confusion locks the deal down for 1d4 weeks",
      "Another merchant just flooded/emptied the market for the goods; add 2 Friction",
      "Another merchant takes 1d4 x 10% of the goods through fraud",
      "The goods or payment are only partially the genuine article; add 1d4 Friction"
    ],
    tradeTable: [12, 13, 28, 8, 16, 25, 17, 23, 18, 20]
  },
  Decadent: {
    name: "Decadent",
    summary: "Ancient, morally exhausted worlds devoted to luxury, vices, and jaded pleasures.",
    modifiers: { sapient: -2, biotech: -1, maltech: 1, luxury: 2 },
    troubleChance: 4,
    troubles: [
      "An addict official skims for his habit; add 2 Friction",
      "Local merchants can't be bothered to finish the deal; add 1d4+1 weeks",
      "Local potentate casually takes half the goods because he can",
      "Local workers are drugged or indolent, add 1d6+1 weeks to finish deal",
      "Strange local customs coincidentally add 1d4 Friction",
      "Thrill-seeking thieves steal 1d4 x 10% of the goods"
    ],
    tradeTable: [12, 4, 28, 8, 20, 6, 9, 25, 10, 30]
  },
  Industrial: {
    name: "Industrial",
    summary: "Forges, refineries, and robotic foundries hungry for raw mineral and agricultural inputs.",
    modifiers: { consumer: -2, tool: -1, agricultural: 1, mineral: 2 },
    troubleChance: 3,
    troubles: [
      "An unfriendly oligopolist arranges for accidents that destroy 1d6 x 10% of the goods",
      "Industrial accident destroys 1d4 x 10% of the goods in this deal",
      "Labor unrest adds 1d4 Friction to the deal",
      "Monopolists push back on this intrusion, adding 1d6 Friction to the deal",
      "The factories are backlogged; the deal is stalled for 1d4 weeks",
      "The supplier or buyer is retooling, delaying the deal by 1d6+1 weeks"
    ],
    tradeTable: [13, 21, 16, 7, 17, 22, 23, 18, 19, 24]
  },
  Primitive: {
    name: "Primitive",
    summary: "Low-tech worlds cut off from interstellar industry, living in fragile equilibrium.",
    modifiers: { agricultural: -2, livestock: -1, tool: 1, postech: 2 },
    troubleChance: 3,
    troubles: [
      "Local rulers argue over who gets to collect the tariffs for 1d6+1 weeks",
      "Locals have been upset or frightened by the traders; add 1d4 Friction to the deal",
      "Priests require 1d4 Friction worth of inducements to bless the deal",
      "Sickness has struck down many workers, delaying the deal by 1d4 weeks",
      "Vicious beasts or raiders have ruined or stolen 1d4 x 10% of the goods",
      "Weather bogs all transport; add 1d4 weeks to the deal"
    ],
    tradeTable: [12, 4, 15, 3, 2, 5, 1, 7, 10, 19]
  },
  Savage: {
    name: "Savage",
    summary: "War-torn badlands and collapsed civilizations ruled by warlords and plunder.",
    modifiers: { agricultural: -2, sapient: -1, tool: 1, military: 2 },
    troubleChance: 4,
    troubles: [
      "An aspiring local warlord wants recognition and taxes; add 1d6 Friction to the deal",
      "Arson or collateral combat damage ruins 1d6 x 10% of the good",
      "Bandit attacks prevent the goods from moving for 1d4 weeks",
      "Desperate locals steal 1d4 x 10% of the goods for survival's sake",
      "Local strongman wants a bigger taste, adding 2 points of Friction to the deal",
      "Looters plunder 1d4 x 10% of the goods"
    ],
    tradeTable: [4, 15, 3, 1, 7, 11, 10, 18, 19, 20]
  },
  Tyrannical: {
    name: "Tyrannical",
    summary: "Authoritarian regimes, closed hab-domes, and secret police enforcing arbitrary decree.",
    modifiers: { mineral: -2, sapient: -1, military: 1, medical: 2 },
    troubleChance: 4,
    troubles: [
      "A bureaucrat squeezes the PCs for 1d4+1 Friction on the deal",
      "A security official confiscates 1d6 x 10% of the goods for the State",
      "Local rebels or common thieves stole 1d4 x 10% of the goods",
      "Secret police suspect the PCs of wrong-doing; add 1d6 Friction to the deal",
      "The local ruler levies a fresh tariff for 1d6 more Friction on the deal",
      "The PCs are suspected as spies or rebels; add 1d4+1 Friction"
    ],
    tradeTable: [4, 15, 2, 5, 17, 22, 10, 23, 18, 24]
  }
};

export const ASTRAL_WORLD_TYPE_KEYS = Object.keys(ASTRAL_WORLD_TYPES) as AstralWorldType[];

type AstralGoodRawSpec = {
  name: string;
  tags: string[];
  value: number;
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
    icon: "goods-grain",
    color: "#c8ad55",
    demandCoverage: { food: 3 }
  },
  {
    name: "Metal Ingots, Common",
    tags: ["common", "mineral", "bulky", "tl1"],
    value: 2,
    icon: "goods-iron",
    color: "#707982",
    demandCoverage: { construction: 2 }
  },
  {
    name: "Livestock, Common",
    tags: ["common", "livestock", "tl0"],
    value: 4,
    icon: "goods-cattle",
    color: "#8c6747",
    demandCoverage: { food: 2, utilities: 1 }
  },
  {
    name: "Drugs, Raw Materials",
    tags: ["agricultural", "biotech", "bulky", "tl0"],
    value: 4,
    icon: "goods-tobacco",
    color: "#3e7d58",
    demandCoverage: { utilities: 1 }
  },
  {
    name: "Metal Ingots, Rare Alloys",
    tags: ["mineral", "bulky", "rare", "tl3"],
    value: 10,
    icon: "goods-bronze",
    color: "#c5832b",
    demandCoverage: { construction: 3 }
  },
  {
    name: "Livestock, Gengineered",
    tags: ["livestock", "biotech", "tl0"],
    value: 20,
    icon: "goods-horses",
    color: "#3aa598",
    demandCoverage: { food: 3, luxury: 1 }
  },
  {
    name: "Native Artwork",
    tags: ["cultural", "luxury", "tl0"],
    value: 20,
    icon: "goods-amber",
    color: "#b75388",
    demandCoverage: { luxury: 3 }
  },
  {
    name: "Exotic Jewels",
    tags: ["rare", "mineral", "luxury", "compact", "tl0"],
    value: 50,
    icon: "goods-gemstones",
    color: "#38bdf8",
    demandCoverage: { luxury: 4 }
  },
  {
    name: "Livestock, Luxury Pets",
    tags: ["livestock", "luxury", "tl0"],
    value: 50,
    icon: "goods-elephants",
    color: "#a855f7",
    demandCoverage: { luxury: 3 }
  },
  {
    name: "Slaves",
    tags: ["sapient", "tl0"],
    value: 50,
    icon: "goods-slaves",
    color: "#78716c",
    demandCoverage: { utilities: 2, construction: 1 }
  },
  {
    name: "Pretech Junk",
    tags: ["pretech", "rare", "tl0"],
    value: 100,
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
    recipes: [{ Metawheat: 1, "Livestock, Common": 0.5 }]
  },
  {
    name: "Colonial Materials",
    tags: ["survival", "postech", "common", "tl4"],
    value: 4,
    icon: "goods-sand",
    color: "#eab308",
    demandCoverage: { construction: 2, utilities: 1 },
    recipes: [{ "Metal Ingots, Common": 1 }]
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
    recipes: [{ "Housewares, Basic": 1, "Parts, Basic Industry": 0.5 }]
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
    recipes: [{ "Colonial Materials": 1, "Metal Ingots, Common": 1 }]
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
    recipes: [{ "Tools, Basic Hand Tools": 1, "Parts, Basic Industry": 1 }]
  },
  {
    name: "Medical Supplies, Postech",
    tags: ["medical", "postech", "compact", "tl4"],
    value: 50,
    icon: "goods-saltpeter",
    color: "#10b981",
    demandCoverage: { utilities: 4 },
    recipes: [{ "Drugs, Raw Materials": 2 }]
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
  }
];

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

  return {
    i: index + 1,
    name: spec.name,
    tags: [...spec.tags],
    value: spec.value,
    unit: "ton",
    icon: spec.icon,
    color: spec.color,
    biomeOutput: {},
    demandCoverage: spec.demandCoverage,
    ...(recipes && { recipes })
  };
});

export function isAstralGoodsCatalogue(goods: readonly Good[] = pack.goods): boolean {
  if (!goods?.length) return false;
  return goods.some(
    good =>
      good.tags.includes("astronautic") ||
      good.tags.includes("postech") ||
      good.tags.includes("pretech") ||
      good.name === "Metawheat"
  );
}
