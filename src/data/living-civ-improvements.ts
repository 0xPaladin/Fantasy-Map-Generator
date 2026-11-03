import type { CivImprovementDef, CivResourceDef, CivTileDef } from "@/types/living";

/** Ported from OpenCiv's `server/config/improvements.yml`, `map_resources.yml` and `tiles.yml`. */
export const CIV_IMPROVEMENTS: readonly CivImprovementDef[] = [
  {
    id: "farm",
    name: "Farm",
    assetName: "TILE_FARM",
    icon: "ICON_FARM",
    buildTurns: 7,
    tileType: "farm",
    terrain: [
      "grass",
      "plains",
      "desert",
      "tundra",
      "floodplains",
      "grass_hill",
      "plains_hill",
      "desert_hill",
      "tundra_hill"
    ],
    resources: {
      wheat: "improved_wheat"
    }
  },
  {
    id: "pasture",
    name: "Pasture",
    assetName: "ICON_EMPTY_PASTURE",
    icon: "ICON_EMPTY_PASTURE",
    requiredTech: "animal_husbandry",
    buildTurns: 7,
    resources: {
      horses: "improved_horses",
      cattle: "improved_cattle",
      sheep: "improved_sheep"
    }
  },
  {
    id: "mine",
    name: "Mine",
    assetName: "TILE_COPPER_MINE",
    icon: "ICON_MINE",
    requiredTech: "mining",
    buildTurns: 7,
    tileType: "mine",
    terrain: ["grass_hill", "plains_hill", "desert_hill", "tundra_hill", "snow_hill"],
    resources: {
      copper: "copper_mine",
      iron: "iron_mine",
      gold: "gold_mine",
      salt: "salt_mine",
      silver: "silver_mine",
      gems: "gems_mine"
    }
  },
  {
    id: "fishing_boats",
    name: "Fishing Boats",
    assetName: "TILE_IMPROVED_FISH",
    icon: "TILE_IMPROVED_FISH",
    requiredTech: "sailing",
    resources: {
      fish: "improved_fish",
      crab: "improved_crab",
      whales: "improved_whales",
      turtles: "improved_turtles",
      pearls: "improved_pearls"
    },
    domain: "sea",
    consumesUnit: true
  },
  {
    id: "plantation",
    name: "Plantation",
    assetName: "TILE_CITRUS_PLANTATION",
    icon: "TILE_CITRUS_PLANTATION",
    requiredTech: "calendar",
    buildTurns: 5,
    resources: {
      citrus: "citrus_plantation",
      cotton: "cotton_plantation",
      olives: "olive_plantation",
      wine: "wine_plantation",
      incense: "incense_plantation",
      bananas: "banana_plantation"
    },
    features: ["forest", "jungle"]
  },
  {
    id: "camp",
    name: "Camp",
    assetName: "TILE_FURS_CAMP",
    icon: "TILE_FURS_CAMP",
    requiredTech: "trapping",
    buildTurns: 6,
    resources: {
      deer: "deer_camp",
      bison: "bison_camp",
      ivory: "ivory_camp",
      furs: "furs_camp",
      truffles: "truffles_camp"
    },
    features: ["forest", "jungle", "marsh"]
  },
  {
    id: "trading_post",
    name: "Trading Post",
    assetName: "TILE_TRADING_POST",
    icon: "TILE_TRADING_POST",
    requiredTech: "guilds",
    buildTurns: 8,
    tileType: "trading_post",
    features: ["forest", "jungle"]
  },
  {
    id: "quarry",
    name: "Quarry",
    assetName: "TILE_STONE_QUARRY",
    icon: "ICON_HAMMER",
    requiredTech: "masonry",
    buildTurns: 7,
    resources: {
      stone: "stone_quarry"
    }
  },
  {
    id: "road",
    name: "Road",
    assetName: "ROAD_VERTICAL_RIGHT",
    icon: "ROAD_VERTICAL_RIGHT",
    requiredTech: "the_wheel",
    buildTurns: 3,
    tileType: "road",
    features: ["forest", "jungle", "marsh", "oasis"],
    route: true,
    outsideBorders: true
  },
  {
    id: "lumber_mill",
    name: "Lumber Mill",
    assetName: "TILE_LUMBER_MILL",
    icon: "ICON_GEAR",
    requiredTech: "construction",
    buildTurns: 10,
    tileType: "lumber_mill",
    requiresFeature: "forest"
  },
  {
    id: "fort",
    name: "Fort",
    requiredTech: "engineering"
  },
  {
    id: "remove_forest",
    name: "Remove Forest",
    icon: "ICON_CHOP",
    requiredTech: "mining",
    buildTurns: 4,
    removesFeature: "forest",
    outsideBorders: true,
    status: "Removing Forest"
  },
  {
    id: "remove_jungle",
    name: "Remove Jungle",
    icon: "ICON_CHOP",
    requiredTech: "bronze_working",
    buildTurns: 7,
    removesFeature: "jungle",
    outsideBorders: true,
    status: "Removing Jungle"
  },
  {
    id: "remove_marsh",
    name: "Remove Marsh",
    icon: "ICON_CHOP",
    requiredTech: "masonry",
    buildTurns: 6,
    removesFeature: "marsh",
    outsideBorders: true,
    status: "Removing Marsh"
  }
];

export const CIV_IMPROVEMENT_BY_ID: Record<string, CivImprovementDef> = Object.fromEntries(
  CIV_IMPROVEMENTS.map(improvement => [improvement.id, improvement] as const)
);

export const CIV_RESOURCES: readonly CivResourceDef[] = [
  {
    id: "cattle",
    class: "bonus",
    spawnTiles: ["grass"]
  },
  {
    id: "sheep",
    class: "bonus",
    spawnTiles: ["grass", "grass_hill", "plains", "plains_hill"]
  },
  {
    id: "wheat",
    class: "bonus",
    spawnTiles: ["plains", "floodplains"]
  },
  {
    id: "fish",
    class: "bonus",
    spawnTiles: ["freshwater", "shallow_ocean"]
  },
  {
    id: "stone",
    class: "bonus",
    spawnTiles: [
      "grass",
      "grass_hill",
      "plains",
      "plains_hill",
      "tundra",
      "tundra_hill",
      "desert",
      "desert_hill",
      "snow",
      "snow_hill"
    ]
  },
  {
    id: "deer",
    class: "bonus",
    spawnTiles: ["forest", "tundra"]
  },
  {
    id: "bison",
    class: "bonus",
    spawnTiles: ["grass", "plains"]
  },
  {
    id: "bananas",
    class: "bonus",
    spawnTiles: ["jungle"]
  },
  {
    id: "horses",
    class: "strategic",
    revealTech: "animal_husbandry",
    spawnTiles: ["grass", "grass_hill", "plains", "plains_hill", "tundra", "tundra_hill"]
  },
  {
    id: "iron",
    class: "strategic",
    revealTech: "bronze_working",
    spawnTiles: [
      "grass",
      "grass_hill",
      "plains",
      "plains_hill",
      "tundra",
      "tundra_hill",
      "desert",
      "desert_hill",
      "snow",
      "snow_hill"
    ]
  },
  {
    id: "citrus",
    class: "luxury",
    spawnTiles: ["jungle", "forest", "grass"]
  },
  {
    id: "cotton",
    class: "luxury",
    spawnTiles: ["grass", "grass_hill", "plains", "plains_hill", "desert"]
  },
  {
    id: "copper",
    class: "luxury",
    spawnTiles: [
      "grass",
      "grass_hill",
      "plains",
      "plains_hill",
      "tundra",
      "tundra_hill",
      "desert",
      "desert_hill",
      "snow",
      "snow_hill"
    ]
  },
  {
    id: "gold",
    class: "luxury",
    spawnTiles: [
      "grass",
      "grass_hill",
      "plains",
      "plains_hill",
      "tundra",
      "tundra_hill",
      "desert",
      "desert_hill",
      "snow",
      "snow_hill"
    ]
  },
  {
    id: "crab",
    class: "luxury",
    spawnTiles: ["freshwater", "shallow_ocean"]
  },
  {
    id: "whales",
    class: "luxury",
    spawnTiles: ["shallow_ocean"]
  },
  {
    id: "turtles",
    class: "luxury",
    spawnTiles: ["freshwater", "shallow_ocean"]
  },
  {
    id: "pearls",
    class: "luxury",
    spawnTiles: ["shallow_ocean"]
  },
  {
    id: "olives",
    class: "luxury",
    spawnTiles: ["grass"]
  },
  {
    id: "ivory",
    class: "luxury",
    spawnTiles: ["plains"]
  },
  {
    id: "furs",
    class: "luxury",
    spawnTiles: ["forest", "tundra"]
  },
  {
    id: "truffles",
    class: "luxury",
    spawnTiles: ["forest", "jungle", "marsh"]
  },
  {
    id: "salt",
    class: "luxury",
    spawnTiles: ["desert", "plains", "tundra"]
  },
  {
    id: "wine",
    class: "luxury",
    spawnTiles: ["grass", "plains"]
  },
  {
    id: "incense",
    class: "luxury",
    spawnTiles: ["desert", "plains"]
  },
  {
    id: "silver",
    class: "luxury",
    spawnTiles: ["desert", "desert_hill", "tundra", "tundra_hill"]
  },
  {
    id: "gems",
    class: "luxury",
    spawnTiles: [
      "grass",
      "grass_hill",
      "plains",
      "plains_hill",
      "desert",
      "desert_hill",
      "tundra",
      "tundra_hill",
      "jungle"
    ]
  }
];

export const CIV_RESOURCE_BY_ID: Record<string, CivResourceDef> = Object.fromEntries(
  CIV_RESOURCES.map(resource => [resource.id, resource] as const)
);

export const CIV_TILES: readonly CivTileDef[] = [
  {
    id: "grass",
    name: "Grass",
    stats: {
      food: 2
    }
  },
  {
    id: "plains",
    name: "Plains",
    stats: {
      food: 1,
      production: 1
    }
  },
  {
    id: "tundra",
    name: "Tundra",
    stats: {
      food: 1
    }
  },
  {
    id: "desert",
    name: "Desert",
    stats: {}
  },
  {
    id: "floodplains",
    name: "Floodplains",
    stats: {
      food: 2
    }
  },
  {
    id: "snow",
    name: "Snow",
    stats: {}
  },
  {
    id: "freshwater",
    name: "Freshwater",
    stats: {
      food: 2,
      gold: 1
    }
  },
  {
    id: "shallow_ocean",
    name: "Shallow Ocean",
    stats: {
      food: 1,
      gold: 1
    }
  },
  {
    id: "ocean",
    name: "Ocean",
    stats: {
      food: 1,
      gold: 1
    }
  },
  {
    id: "grass_hill",
    name: "Grass Hill",
    stats: {
      production: 2
    }
  },
  {
    id: "plains_hill",
    name: "Plains Hill",
    stats: {
      production: 2
    }
  },
  {
    id: "desert_hill",
    name: "Desert Hill",
    stats: {
      production: 2
    }
  },
  {
    id: "tundra_hill",
    name: "Tundra Hill",
    stats: {
      production: 2
    }
  },
  {
    id: "snow_hill",
    name: "Snow Hill",
    stats: {
      production: 2
    }
  },
  {
    id: "forest",
    name: "Forest",
    stats: {
      food: 1,
      production: 1
    }
  },
  {
    id: "jungle",
    name: "Jungle",
    stats: {
      food: 2
    }
  },
  {
    id: "marsh",
    name: "Marsh",
    stats: {
      food: 1
    }
  },
  {
    id: "oasis",
    name: "Oasis",
    stats: {
      food: 3,
      gold: 1
    }
  },
  {
    id: "horses",
    name: "Horses",
    stats: {
      production: 1
    }
  },
  {
    id: "improved_horses",
    name: "Improved Horses",
    stats: {
      production: 2
    }
  },
  {
    id: "cattle",
    name: "Cattle",
    stats: {
      food: 1
    }
  },
  {
    id: "improved_cattle",
    name: "Improved Cattle",
    stats: {
      food: 1,
      production: 1
    }
  },
  {
    id: "sheep",
    name: "Sheep",
    stats: {
      food: 1
    }
  },
  {
    id: "improved_sheep",
    name: "Improved Sheep",
    stats: {
      food: 1,
      production: 1
    }
  },
  {
    id: "copper",
    name: "Copper",
    stats: {
      gold: 2
    }
  },
  {
    id: "copper_mine",
    name: "Copper Mine",
    stats: {
      gold: 2,
      production: 1
    }
  },
  {
    id: "gold",
    name: "Gold",
    stats: {
      gold: 2
    }
  },
  {
    id: "iron",
    name: "Iron",
    stats: {
      production: 1
    }
  },
  {
    id: "iron_mine",
    name: "Iron Mine",
    stats: {
      production: 2
    }
  },
  {
    id: "stone",
    name: "Stone",
    stats: {
      production: 1
    }
  },
  {
    id: "stone_quarry",
    name: "Stone Quarry",
    stats: {
      production: 2
    }
  },
  {
    id: "wheat",
    name: "Wheat",
    stats: {
      food: 1
    }
  },
  {
    id: "improved_wheat",
    name: "Improved Wheat",
    stats: {
      food: 2
    }
  },
  {
    id: "fish",
    name: "Fish",
    stats: {
      food: 1
    }
  },
  {
    id: "improved_fish",
    name: "Improved Fish",
    stats: {
      food: 2
    }
  },
  {
    id: "crab",
    name: "Crab",
    stats: {
      food: 1
    }
  },
  {
    id: "improved_crab",
    name: "Improved Crab",
    stats: {
      food: 2
    }
  },
  {
    id: "whales",
    name: "Whales",
    stats: {
      food: 1,
      gold: 1
    }
  },
  {
    id: "improved_whales",
    name: "Improved Whales",
    stats: {
      food: 2,
      gold: 1
    }
  },
  {
    id: "turtles",
    name: "Turtles",
    stats: {
      food: 1,
      gold: 1
    }
  },
  {
    id: "improved_turtles",
    name: "Improved Turtles",
    stats: {
      food: 2,
      gold: 1
    }
  },
  {
    id: "pearls",
    name: "Pearls",
    stats: {
      gold: 2
    }
  },
  {
    id: "improved_pearls",
    name: "Improved Pearls",
    stats: {
      food: 1,
      gold: 2
    }
  },
  {
    id: "citrus",
    name: "Citrus",
    stats: {
      food: 1,
      gold: 1
    }
  },
  {
    id: "citrus_plantation",
    name: "Citrus Plantation",
    stats: {
      food: 1,
      gold: 2
    }
  },
  {
    id: "cotton",
    name: "Cotton",
    stats: {
      gold: 2
    }
  },
  {
    id: "cotton_plantation",
    name: "Cotton Plantation",
    stats: {
      gold: 3
    }
  },
  {
    id: "olives",
    name: "Olives",
    stats: {
      gold: 1,
      production: 1
    }
  },
  {
    id: "olive_plantation",
    name: "Olive Plantation",
    stats: {
      gold: 2,
      production: 1
    }
  },
  {
    id: "deer",
    name: "Deer",
    stats: {
      food: 1
    }
  },
  {
    id: "deer_camp",
    name: "Deer Camp",
    stats: {
      food: 1,
      production: 1
    }
  },
  {
    id: "bison",
    name: "Bison",
    stats: {
      food: 1
    }
  },
  {
    id: "bison_camp",
    name: "Bison Camp",
    stats: {
      food: 1,
      production: 1
    }
  },
  {
    id: "ivory",
    name: "Ivory",
    stats: {
      gold: 2
    }
  },
  {
    id: "ivory_camp",
    name: "Ivory Camp",
    stats: {
      gold: 3
    }
  },
  {
    id: "furs",
    name: "Furs",
    stats: {
      gold: 2
    }
  },
  {
    id: "furs_camp",
    name: "Furs Camp",
    stats: {
      gold: 3
    }
  },
  {
    id: "truffles",
    name: "Truffles",
    stats: {
      gold: 2
    }
  },
  {
    id: "truffles_camp",
    name: "Truffles Camp",
    stats: {
      gold: 3
    }
  },
  {
    id: "gold_mine",
    name: "Gold Mine",
    stats: {
      gold: 2,
      production: 1
    }
  },
  {
    id: "salt",
    name: "Salt",
    stats: {
      food: 1,
      gold: 1
    }
  },
  {
    id: "salt_mine",
    name: "Salt Mine",
    stats: {
      food: 1,
      gold: 1,
      production: 1
    }
  },
  {
    id: "silver",
    name: "Silver",
    stats: {
      gold: 2
    }
  },
  {
    id: "silver_mine",
    name: "Silver Mine",
    stats: {
      gold: 2,
      production: 1
    }
  },
  {
    id: "gems",
    name: "Gems",
    stats: {
      gold: 3
    }
  },
  {
    id: "gems_mine",
    name: "Gems Mine",
    stats: {
      gold: 3,
      production: 1
    }
  },
  {
    id: "wine",
    name: "Wine",
    stats: {
      gold: 2
    }
  },
  {
    id: "wine_plantation",
    name: "Wine Plantation",
    stats: {
      gold: 3
    }
  },
  {
    id: "incense",
    name: "Incense",
    stats: {
      gold: 2
    }
  },
  {
    id: "incense_plantation",
    name: "Incense Plantation",
    stats: {
      gold: 3
    }
  },
  {
    id: "bananas",
    name: "Bananas",
    stats: {
      food: 1
    }
  },
  {
    id: "banana_plantation",
    name: "Banana Plantation",
    stats: {
      food: 2
    }
  },
  {
    id: "farm",
    name: "Farm",
    stats: {
      food: 1
    }
  },
  {
    id: "mine",
    name: "Mine",
    stats: {
      production: 1
    }
  },
  {
    id: "trading_post",
    name: "Trading Post",
    stats: {
      gold: 1
    }
  },
  {
    id: "lumber_mill",
    name: "Lumber Mill",
    stats: {
      production: 1
    }
  },
  {
    id: "mt_fuji",
    name: "Mt. Fuji",
    stats: {
      faith: 3,
      culture: 2
    }
  },
  {
    id: "mt_kilimanjaro",
    name: "Mt. Kilimanjaro",
    stats: {
      food: 3,
      culture: 2
    }
  },
  {
    id: "cerro_de_potosi",
    name: "Cerro de Potosi",
    stats: {
      gold: 10
    }
  },
  {
    id: "grand_mesa",
    name: "Grand Mesa",
    stats: {
      production: 2,
      gold: 3
    }
  },
  {
    id: "barringer_crater",
    name: "Barringer Crater",
    stats: {
      gold: 2,
      science: 3
    }
  },
  {
    id: "great_barrier_reef",
    name: "Great Barrier Reef",
    stats: {
      food: 2,
      production: 1,
      gold: 1,
      science: 2
    }
  },
  {
    id: "krakatoa",
    name: "Krakatoa",
    stats: {
      science: 5
    }
  }
];

export const CIV_TILE_BY_ID: Record<string, CivTileDef> = Object.fromEntries(
  CIV_TILES.map(tile => [tile.id, tile] as const)
);
