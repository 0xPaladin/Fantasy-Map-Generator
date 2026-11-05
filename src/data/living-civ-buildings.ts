import type { CivBuildingDef } from "@/types/living";

/** Ported from OpenCiv's `server/config/buildings.yml`. */
export const CIV_BUILDINGS: readonly CivBuildingDef[] = [
  {
    id: "palace",
    name: "Palace",
    assetName: "BUILDING_PALACE",
    stats: {
      science: 3,
      production: 3,
      gold: 3,
      defense: 2,
      culture: 1
    }
  },
  {
    id: "monument",
    name: "Monument",
    assetName: "BUILDING_MONUMENT",
    cost: 60,
    maintenance: 1,
    stats: {
      culture: 2
    }
  },
  {
    id: "barracks",
    name: "Barracks",
    assetName: "BUILDING_BARRACKS",
    cost: 75,
    maintenance: 1,
    requiredTech: "bronze_working",
    stats: {},
    effects: {
      trainedUnitExperience: {
        amount: 15,
        landOnly: true
      }
    }
  },
  {
    id: "amphitheater",
    name: "Amphitheater",
    assetName: "BUILDING_AMPHITHEATER",
    cost: 100,
    maintenance: 1,
    requiredTech: "drama_and_poetry",
    stats: {
      culture: 3
    },
    notYet: ["A slot for a Great Work of Writing"]
  },
  {
    id: "aqueduct",
    name: "Aqueduct",
    assetName: "BUILDING_AQUEDUCT",
    cost: 100,
    maintenance: 1,
    requiredTech: "engineering",
    stats: {},
    effects: {
      foodKeptPercent: 40
    }
  },
  {
    id: "bazaar",
    name: "Bazaar",
    assetName: "BUILDING_BAZAAR",
    cost: 100,
    requiredTech: "currency",
    uniqueTo: "Arabia",
    replaces: "market",
    stats: {
      gold: 2,
      science: 2
    }
  },
  {
    id: "castle",
    name: "Castle",
    assetName: "BUILDING_CASTLE",
    cost: 160,
    requiredTech: "chivalry",
    requiresBuilding: "walls",
    cityHealth: 25,
    stats: {
      defense: 7
    }
  },
  {
    id: "arsenal",
    name: "Arsenal",
    assetName: "BUILDING_ARSENAL",
    cost: 300,
    requiredTech: "railroad",
    requiresBuilding: "castle",
    cityHealth: 25,
    stats: {
      defense: 9
    }
  },
  {
    id: "military_base",
    name: "Military Base",
    assetName: "BUILDING_MILITARY_BASE",
    cost: 450,
    requiredTech: "electronics",
    requiresBuilding: "arsenal",
    cityHealth: 25,
    stats: {
      defense: 12
    }
  },
  {
    id: "circus",
    name: "Circus",
    assetName: "BUILDING_CIRCUS",
    cost: 80,
    maintenance: 1,
    requiredTech: "trapping",
    stats: {
      happiness: 2
    }
  },
  {
    id: "colosseum",
    name: "Colosseum",
    assetName: "BUILDING_COLOSSEUM",
    cost: 100,
    maintenance: 1,
    requiredTech: "construction",
    stats: {
      happiness: 3
    }
  },
  {
    id: "colossus",
    name: "Colossus",
    assetName: "BUILDING_COLOSSUS",
    cost: 185,
    requiredTech: "bronze_working",
    coastal: true,
    isWonder: true,
    stats: {
      culture: 1
    },
    effects: {
      tileYields: [
        {
          stats: {
            gold: 1
          },
          terrain: "sea"
        }
      ]
    },
    notYet: ["An extra trade route"]
  },
  {
    id: "forge",
    name: "Forge",
    assetName: "BUILDING_FORGE",
    cost: 120,
    maintenance: 1,
    requiredTech: "metal_casting",
    stats: {},
    effects: {
      tileYields: [
        {
          resources: ["iron"],
          stats: {
            production: 1
          }
        }
      ],
      unitProduction: {
        label: "land units",
        landMilitary: true,
        percent: 15
      }
    }
  },
  {
    id: "garden",
    name: "Garden",
    assetName: "BUILDING_GARDEN",
    cost: 120,
    maintenance: 1,
    requiredTech: "theology",
    stats: {
      food: 1
    },
    notYet: ["+25% Great People generation"]
  },
  {
    id: "granary",
    name: "Granary",
    assetName: "BUILDING_GRANARY",
    cost: 40,
    maintenance: 1,
    requiredTech: "pottery",
    stats: {
      food: 2
    },
    effects: {
      tileYields: [
        {
          resources: ["wheat", "bananas", "deer"],
          stats: {
            food: 1
          }
        }
      ]
    }
  },
  {
    id: "great_library",
    name: "Great Library",
    assetName: "BUILDING_GREAT_LIBRARY",
    cost: 185,
    requiredTech: "writing",
    isWonder: true,
    stats: {
      science: 3,
      culture: 1
    },
    effects: {
      freeTechs: 1
    },
    notYet: ["Two slots for Great Works of Writing"]
  },
  {
    id: "great_pyramids",
    name: "Great Pyramids",
    assetName: "BUILDING_GREAT_PYRAMIDS",
    cost: 185,
    requiredTech: "masonry",
    isWonder: true,
    stats: {
      culture: 1
    },
    effects: {
      builderSpeedPercent: 25,
      freeUnits: ["builder", "builder"]
    }
  },
  {
    id: "hanging_gardens",
    name: "Hanging Gardens",
    assetName: "BUILDING_HANGING_GARDENS",
    cost: 250,
    requiredTech: "mathematics",
    isWonder: true,
    stats: {
      food: 6,
      culture: 1
    }
  },
  {
    id: "harbor",
    name: "Harbor",
    assetName: "BUILDING_HARBOR",
    cost: 80,
    maintenance: 2,
    requiredTech: "compass",
    coastal: true,
    stats: {},
    effects: {
      tileYields: [
        {
          stats: {
            production: 1
          },
          terrain: "sea"
        }
      ]
    }
  },
  {
    id: "library",
    name: "Library",
    assetName: "BUILDING_LIBRARY",
    cost: 75,
    maintenance: 1,
    requiredTech: "writing",
    stats: {},
    effects: {
      yieldsPerCitizen: {
        science: 0.5
      }
    }
  },
  {
    id: "lighthouse",
    name: "Lighthouse",
    assetName: "BUILDING_LIGHTHOUSE",
    cost: 75,
    maintenance: 1,
    requiredTech: "optics",
    coastal: true,
    stats: {},
    effects: {
      tileYields: [
        {
          stats: {
            food: 1
          },
          terrain: "sea"
        }
      ]
    }
  },
  {
    id: "machu_picchu",
    name: "Machu Picchu",
    assetName: "BUILDING_MACHU_PICCHU",
    cost: 300,
    requiredTech: "guilds",
    isWonder: true,
    stats: {
      culture: 1,
      gold: 5
    },
    notYet: ["+25% Gold from city connections and trade routes"]
  },
  {
    id: "artists_guild",
    name: "Artists' Guild",
    assetName: "BUILDING_ARTISTS_GUILD",
    cost: 100,
    maintenance: 1,
    requiredTech: "guilds",
    stats: {
      culture: 1
    },
    notYet: ["Slot for a Great Artist specialist"]
  },
  {
    id: "market",
    name: "Market",
    assetName: "BUILDING_MARKET",
    cost: 100,
    requiredTech: "currency",
    stats: {
      gold: 1
    },
    effects: {
      yieldPercent: {
        gold: 25
      }
    }
  },
  {
    id: "mint",
    name: "Mint",
    assetName: "BUILDING_MINT",
    cost: 100,
    requiredTech: "currency",
    stats: {},
    effects: {
      tileYields: [
        {
          resources: ["gold", "silver"],
          stats: {
            gold: 2
          }
        }
      ]
    }
  },
  {
    id: "national_college",
    name: "National College",
    assetName: "BUILDING_NATIONAL_COLLEGE",
    cost: 135,
    requiredTech: "philosophy",
    requiresBuilding: "library",
    nationalWonder: true,
    stats: {
      science: 3,
      culture: 1
    },
    effects: {
      yieldPercent: {
        science: 50
      }
    }
  },
  {
    id: "shrine",
    name: "Shrine",
    assetName: "BUILDING_SHRINE",
    cost: 65,
    maintenance: 1,
    requiredTech: "pottery",
    stats: {
      faith: 1
    }
  },
  {
    id: "stables",
    name: "Stables",
    assetName: "BUILDING_STABLES",
    cost: 100,
    maintenance: 1,
    requiredTech: "horseback_riding",
    stats: {},
    effects: {
      tileYields: [
        {
          resources: ["horses", "sheep", "cattle"],
          stats: {
            production: 1
          }
        }
      ],
      unitProduction: {
        label: "mounted units",
        percent: 15,
        units: ["horseman", "chariot_archer", "knight"]
      }
    }
  },
  {
    id: "statue_of_zeus",
    name: "Statue of Zeus",
    assetName: "BUILDING_STATUE_OF_ZEUS",
    cost: 185,
    requiredTech: "bronze_working",
    isWonder: true,
    stats: {
      culture: 1
    },
    effects: {
      cityAttackPercent: 15,
      freeUnits: ["spearman"]
    }
  },
  {
    id: "stonehenge",
    name: "Stonehenge",
    assetName: "BUILDING_STONEHENGE",
    cost: 185,
    requiredTech: "calendar",
    isWonder: true,
    stats: {
      faith: 5
    }
  },
  {
    id: "stoneworks",
    name: "Stoneworks",
    assetName: "BUILDING_STONEWORKS",
    cost: 75,
    maintenance: 1,
    requiredTech: "calendar",
    stats: {
      happiness: 1
    },
    effects: {
      tileYields: [
        {
          resources: ["stone"],
          stats: {
            production: 1
          }
        }
      ]
    }
  },
  {
    id: "temple",
    name: "Temple",
    assetName: "BUILDING_TEMPLE",
    cost: 100,
    maintenance: 2,
    requiredTech: "philosophy",
    requiresBuilding: "shrine",
    stats: {
      faith: 2
    }
  },
  {
    id: "terracotta_army",
    name: "Terracotta Army",
    assetName: "BUILDING_TERRACOTTA_ARMY",
    cost: 200,
    requiredTech: "construction",
    isWonder: true,
    stats: {
      culture: 1
    },
    effects: {
      copyLandUnits: true
    }
  },
  {
    id: "university",
    name: "University",
    assetName: "BUILDING_UNIVERSITY",
    cost: 160,
    maintenance: 3,
    requiredTech: "education",
    requiresBuilding: "library",
    stats: {},
    effects: {
      tileYields: [
        {
          stats: {
            science: 2
          },
          terrain: "jungle"
        }
      ],
      yieldPercent: {
        science: 33
      }
    }
  },
  {
    id: "walls",
    name: "Walls",
    assetName: "BUILDING_WALLS",
    cost: 75,
    maintenance: 1,
    requiredTech: "masonry",
    cityHealth: 50,
    stats: {
      defense: 5
    }
  },
  {
    id: "water_mill",
    name: "Water Mill",
    assetName: "BUILDING_WATER_MILL",
    cost: 75,
    maintenance: 2,
    requiredTech: "the_wheel",
    requiresRiver: true,
    stats: {
      food: 2,
      production: 1
    }
  },
  {
    id: "workshop",
    name: "Workshop",
    assetName: "BUILDING_WORKSHOP",
    cost: 120,
    maintenance: 2,
    requiredTech: "metal_casting",
    stats: {
      production: 2
    },
    effects: {
      yieldPercent: {
        production: 10
      }
    }
  },
  {
    id: "temple_of_artemis",
    name: "Temple of Artemis",
    assetName: "BUILDING_TEMPLE_OF_ARTEMIS",
    cost: 185,
    requiredTech: "archery",
    isWonder: true,
    stats: {
      culture: 1
    },
    effects: {
      empireYieldPercent: {
        food: 10
      }
    }
  },
  {
    id: "great_lighthouse",
    name: "Great Lighthouse",
    assetName: "BUILDING_GREAT_LIGHTHOUSE",
    cost: 185,
    requiredTech: "optics",
    coastal: true,
    isWonder: true,
    stats: {
      culture: 1
    },
    effects: {
      navalMovement: 1,
      navalSight: 1
    }
  },
  {
    id: "mausoleum_of_halicarnassus",
    name: "Mausoleum of Halicarnassus",
    assetName: "BUILDING_MAUSOLEUM_OF_HALICARNASSUS",
    cost: 185,
    requiredTech: "masonry",
    isWonder: true,
    stats: {
      gold: 3,
      culture: 1
    },
    notYet: ["+100 Gold whenever a Great Person is expended"]
  },
  {
    id: "oracle",
    name: "Oracle",
    assetName: "BUILDING_ORACLE",
    cost: 250,
    requiredTech: "philosophy",
    isWonder: true,
    stats: {
      culture: 4
    },
    notYet: ["A free Social Policy"]
  },
  {
    id: "parthenon",
    name: "Parthenon",
    assetName: "BUILDING_PARTHENON",
    cost: 250,
    requiredTech: "drama_and_poetry",
    isWonder: true,
    stats: {
      culture: 4
    },
    notYet: ["A free Great Work of Art"]
  },
  {
    id: "petra",
    name: "Petra",
    assetName: "BUILDING_PETRA",
    cost: 250,
    requiredTech: "currency",
    isWonder: true,
    stats: {},
    effects: {
      tileYields: [
        {
          except: ["floodplains"],
          stats: {
            food: 1,
            production: 1
          },
          terrain: "desert"
        }
      ]
    },
    notYet: ["An extra trade route"]
  },
  {
    id: "great_wall",
    name: "Great Wall",
    assetName: "BUILDING_GREAT_WALL",
    cost: 250,
    requiredTech: "engineering",
    isWonder: true,
    stats: {
      culture: 1
    },
    effects: {
      enemyMovementCost: 1
    }
  },
  {
    id: "hagia_sophia",
    name: "Hagia Sophia",
    assetName: "BUILDING_HAGIA_SOPHIA",
    cost: 300,
    requiredTech: "theology",
    isWonder: true,
    stats: {
      faith: 4,
      culture: 1
    },
    notYet: ["A free Great Prophet"]
  },
  {
    id: "borobudur",
    name: "Borobudur",
    assetName: "BUILDING_BOROBUDUR",
    cost: 300,
    requiredTech: "theology",
    isWonder: true,
    stats: {
      faith: 5
    },
    notYet: ["Three free Missionaries"]
  },
  {
    id: "great_mosque_of_djenne",
    name: "Great Mosque of Djenne",
    assetName: "BUILDING_GREAT_MOSQUE_OF_DJENNE",
    cost: 300,
    requiredTech: "theology",
    isWonder: true,
    stats: {
      faith: 3,
      culture: 1
    },
    notYet: ["Missionaries spread religion three times instead of twice"]
  },
  {
    id: "chichen_itza",
    name: "Chichen Itza",
    assetName: "BUILDING_CHICHEN_ITZA",
    cost: 300,
    requiredTech: "civil_service",
    isWonder: true,
    stats: {
      happiness: 4,
      culture: 1
    },
    notYet: ["Golden Ages last 50% longer"]
  },
  {
    id: "angkor_wat",
    name: "Angkor Wat",
    assetName: "BUILDING_ANGKOR_WAT",
    cost: 400,
    requiredTech: "education",
    isWonder: true,
    stats: {
      culture: 1
    },
    effects: {
      borderCostPercent: -25
    }
  },
  {
    id: "himeji_castle",
    name: "Himeji Castle",
    assetName: "BUILDING_HIMEJI_CASTLE",
    cost: 400,
    requiredTech: "chivalry",
    isWonder: true,
    stats: {
      culture: 1
    },
    effects: {
      friendlyTerritoryCombatPercent: 15
    }
  },
  {
    id: "alhambra",
    name: "Alhambra",
    assetName: "BUILDING_ALHAMBRA",
    cost: 400,
    requiredTech: "chivalry",
    isWonder: true,
    stats: {
      culture: 1
    },
    effects: {
      freeBuilding: "castle",
      trainedUnitPromotions: {
        landOnly: true,
        promotions: ["drill_i"]
      },
      yieldPercent: {
        culture: 20
      }
    }
  },
  {
    id: "notre_dame",
    name: "Notre Dame",
    assetName: "BUILDING_NOTRE_DAME",
    cost: 400,
    requiredTech: "physics",
    isWonder: true,
    stats: {
      happiness: 10,
      culture: 1
    }
  },
  {
    id: "national_epic",
    name: "National Epic",
    assetName: "BUILDING_NATIONAL_EPIC",
    cost: 125,
    requiredTech: "drama_and_poetry",
    requiresBuilding: "monument",
    nationalWonder: true,
    stats: {
      culture: 2
    },
    notYet: ["+25% Great People generation in the city"]
  },
  {
    id: "east_india_company",
    name: "East India Company",
    assetName: "BUILDING_EAST_INDIA_COMPANY",
    cost: 150,
    requiredTech: "guilds",
    requiresBuilding: "market",
    nationalWonder: true,
    stats: {
      gold: 4
    },
    notYet: ["Extra gold from luxury resources"]
  },
  {
    id: "circus_maximus",
    name: "Circus Maximus",
    assetName: "BUILDING_CIRCUS_MAXIMUS",
    cost: 125,
    requiredTech: "horseback_riding",
    requiresBuilding: "colosseum",
    nationalWonder: true,
    stats: {
      happiness: 5
    }
  },
  {
    id: "grand_temple",
    name: "Grand Temple",
    assetName: "BUILDING_GRAND_TEMPLE",
    cost: 125,
    requiredTech: "theology",
    requiresBuilding: "temple",
    nationalWonder: true,
    stats: {
      faith: 8
    },
    notYet: ["Doubles the city's religious pressure"]
  },
  {
    id: "oxford_university",
    name: "Oxford University",
    assetName: "BUILDING_OXFORD_UNIVERSITY",
    cost: 125,
    requiredTech: "education",
    requiresBuilding: "university",
    nationalWonder: true,
    stats: {
      science: 3
    },
    effects: {
      freeTechs: 1
    }
  },
  {
    id: "ironworks",
    name: "Ironworks",
    assetName: "BUILDING_IRONWORKS",
    cost: 125,
    requiredTech: "machinery",
    requiresBuilding: "workshop",
    nationalWonder: true,
    stats: {
      production: 10
    }
  },
  {
    id: "observatory",
    name: "Observatory",
    assetName: "BUILDING_OBSERVATORY",
    cost: 120,
    maintenance: 2,
    requiredTech: "astronomy",
    requiresMountain: true,
    stats: {},
    effects: {
      yieldPercent: {
        science: 50
      }
    }
  },
  {
    id: "opera_house",
    name: "Opera House",
    assetName: "BUILDING_OPERA_HOUSE",
    cost: 150,
    maintenance: 2,
    requiredTech: "acoustics",
    requiresBuilding: "amphitheater",
    stats: {
      culture: 3
    },
    notYet: ["A slot for a Great Work of Music"]
  },
  {
    id: "bank",
    name: "Bank",
    assetName: "BUILDING_BANK",
    cost: 200,
    maintenance: 2,
    requiredTech: "banking",
    requiresBuilding: "market",
    stats: {},
    effects: {
      yieldPercent: {
        gold: 25
      }
    }
  },
  {
    id: "seaport",
    name: "Seaport",
    assetName: "BUILDING_SEAPORT",
    cost: 120,
    maintenance: 2,
    requiredTech: "navigation",
    requiresBuilding: "harbor",
    coastal: true,
    stats: {},
    effects: {
      tileYields: [
        {
          stats: {
            production: 1
          },
          terrain: "sea"
        }
      ]
    }
  },
  {
    id: "windmill",
    name: "Windmill",
    assetName: "BUILDING_WINDMILL",
    cost: 120,
    maintenance: 2,
    requiredTech: "economics",
    stats: {
      production: 2
    },
    effects: {
      yieldPercent: {
        production: 10
      }
    }
  },
  {
    id: "public_school",
    name: "Public School",
    assetName: "BUILDING_PUBLIC_SCHOOL",
    cost: 200,
    maintenance: 3,
    requiredTech: "scientific_theory",
    requiresBuilding: "university",
    stats: {},
    effects: {
      yieldPercent: {
        science: 50
      }
    }
  },
  {
    id: "museum",
    name: "Museum",
    assetName: "BUILDING_MUSEUM",
    cost: 200,
    maintenance: 3,
    requiredTech: "archaeology",
    requiresBuilding: "opera_house",
    stats: {
      culture: 4
    },
    notYet: ["Two slots for Great Works of Art or Artifacts"]
  },
  {
    id: "factory",
    name: "Factory",
    assetName: "BUILDING_FACTORY",
    cost: 200,
    maintenance: 3,
    requiredTech: "industrialization",
    requiresBuilding: "workshop",
    stats: {},
    effects: {
      yieldPercent: {
        production: 25
      }
    }
  },
  {
    id: "hospital",
    name: "Hospital",
    assetName: "BUILDING_HOSPITAL",
    cost: 200,
    maintenance: 2,
    requiredTech: "biology",
    stats: {
      food: 2
    },
    effects: {
      foodKeptPercent: 25
    }
  },
  {
    id: "stock_exchange",
    name: "Stock Exchange",
    assetName: "BUILDING_STOCK_EXCHANGE",
    cost: 300,
    maintenance: 3,
    requiredTech: "electricity",
    requiresBuilding: "bank",
    stats: {},
    effects: {
      yieldPercent: {
        gold: 33
      }
    }
  },
  {
    id: "broadcast_tower",
    name: "Broadcast Tower",
    assetName: "BUILDING_BROADCAST_TOWER",
    cost: 300,
    maintenance: 3,
    requiredTech: "radio",
    requiresBuilding: "museum",
    stats: {},
    effects: {
      yieldPercent: {
        culture: 33
      }
    }
  },
  {
    id: "stadium",
    name: "Stadium",
    assetName: "BUILDING_STADIUM",
    cost: 300,
    maintenance: 3,
    requiredTech: "refrigeration",
    requiresBuilding: "colosseum",
    stats: {
      happiness: 4
    }
  },
  {
    id: "medical_lab",
    name: "Medical Lab",
    assetName: "BUILDING_MEDICAL_LAB",
    cost: 300,
    maintenance: 3,
    requiredTech: "penicillin",
    requiresBuilding: "hospital",
    stats: {
      food: 3
    },
    notYet: ["Its Civ 5 effect"]
  },
  {
    id: "forbidden_palace",
    name: "Forbidden Palace",
    assetName: "BUILDING_FORBIDDEN_PALACE",
    cost: 400,
    requiredTech: "banking",
    isWonder: true,
    stats: {
      happiness: 6,
      culture: 1
    },
    notYet: ["Reduces unhappiness from the number of cities"]
  },
  {
    id: "sistine_chapel",
    name: "Sistine Chapel",
    assetName: "BUILDING_SISTINE_CHAPEL",
    cost: 400,
    requiredTech: "acoustics",
    isWonder: true,
    stats: {
      culture: 3
    },
    effects: {
      empireYieldPercent: {
        culture: 15
      }
    }
  },
  {
    id: "taj_mahal",
    name: "Taj Mahal",
    assetName: "BUILDING_TAJ_MAHAL",
    cost: 400,
    requiredTech: "printing_press",
    isWonder: true,
    stats: {
      culture: 3,
      happiness: 3
    },
    notYet: ["Begins a Golden Age"]
  },
  {
    id: "leaning_tower_of_pisa",
    name: "Leaning Tower of Pisa",
    assetName: "BUILDING_LEANING_TOWER_OF_PISA",
    cost: 400,
    requiredTech: "architecture",
    isWonder: true,
    stats: {
      culture: 2,
      science: 3
    },
    notYet: ["+25% Great People generation"]
  },
  {
    id: "big_ben",
    name: "Big Ben",
    assetName: "BUILDING_BIG_BEN",
    cost: 500,
    requiredTech: "industrialization",
    isWonder: true,
    stats: {
      gold: 6,
      culture: 1
    },
    notYet: ["Halves the gold cost of purchasing buildings"]
  },
  {
    id: "louvre",
    name: "Louvre",
    assetName: "BUILDING_LOUVRE",
    cost: 500,
    requiredTech: "archaeology",
    isWonder: true,
    stats: {
      culture: 6
    },
    notYet: ["Two slots for Great Works of Art"]
  },
  {
    id: "hermitage",
    name: "Hermitage",
    assetName: "BUILDING_HERMITAGE",
    cost: 500,
    requiredTech: "archaeology",
    isWonder: true,
    stats: {
      culture: 5
    },
    notYet: ["Three slots for Great Works of Art"]
  },
  {
    id: "brandenburg_gate",
    name: "Brandenburg Gate",
    assetName: "BUILDING_BRANDENBURG_GATE",
    cost: 500,
    requiredTech: "military_science",
    isWonder: true,
    stats: {
      culture: 3
    },
    effects: {
      trainedUnitExperience: {
        amount: 15
      }
    },
    notYet: ["A free Great General"]
  },
  {
    id: "cristo_redentor",
    name: "Cristo Redentor",
    assetName: "BUILDING_CRISTO_REDENTOR",
    cost: 600,
    requiredTech: "electronics",
    isWonder: true,
    stats: {
      culture: 4,
      faith: 4
    },
    notYet: ["Culture needed for new policies is reduced"]
  },
  {
    id: "statue_of_liberty",
    name: "Statue of Liberty",
    assetName: "BUILDING_STATUE_OF_LIBERTY",
    cost: 600,
    requiredTech: "replaceable_parts",
    isWonder: true,
    stats: {
      culture: 3,
      happiness: 4
    },
    notYet: ["A free Great Engineer"]
  },
  {
    id: "eiffel_tower",
    name: "Eiffel Tower",
    assetName: "BUILDING_EIFFEL_TOWER",
    cost: 600,
    requiredTech: "radio",
    isWonder: true,
    stats: {
      culture: 5,
      happiness: 4
    },
    notYet: ["+1 Tourism per Culture in every city"]
  },
  {
    id: "pentagon",
    name: "Pentagon",
    assetName: "BUILDING_PENTAGON",
    cost: 800,
    requiredTech: "combined_arms",
    isWonder: true,
    stats: {
      culture: 3
    },
    notYet: ["Cheaper unit upgrades"]
  },
  {
    id: "manhattan_project",
    name: "Manhattan Project",
    assetName: "BUILDING_MANHATTAN_PROJECT",
    cost: 800,
    requiredTech: "atomic_theory",
    isWonder: true,
    stats: {
      culture: 3
    },
    notYet: ["Lets every civilization build Nuclear Missiles"]
  },
  {
    id: "apollo_program",
    name: "Apollo Program",
    assetName: "BUILDING_APOLLO_PROGRAM",
    cost: 1000,
    requiredTech: "rocketry",
    isWonder: true,
    stats: {
      culture: 3,
      science: 5
    },
    notYet: ["Lets every civilization build spaceship parts"]
  },
  {
    id: "sydney_opera_house",
    name: "Sydney Opera House",
    assetName: "BUILDING_SYDNEY_OPERA_HOUSE",
    cost: 1000,
    requiredTech: "ecology",
    isWonder: true,
    stats: {
      culture: 6,
      happiness: 4
    },
    notYet: ["A free Social Policy"]
  },
  {
    id: "united_nations",
    name: "United Nations",
    assetName: "BUILDING_UNITED_NATIONS",
    cost: 1000,
    requiredTech: "globalization",
    isWonder: true,
    stats: {
      gold: 6,
      culture: 3
    },
    notYet: ["Diplomatic victory by World Congress vote"]
  },
  {
    id: "prora",
    name: "Prora",
    assetName: "BUILDING_PRORA",
    cost: 600,
    requiredTech: "flight",
    isWonder: true,
    stats: {
      culture: 3,
      happiness: 4
    },
    notYet: ["Its Civ 5 effect"]
  },
  {
    id: "great_firewall",
    name: "Great Firewall",
    assetName: "BUILDING_GREAT_FIREWALL",
    cost: 1000,
    requiredTech: "computers",
    isWonder: true,
    stats: {
      culture: 3,
      science: 5
    },
    notYet: ["Its Civ 5 effect"]
  },
  {
    id: "cn_tower",
    name: "CN Tower",
    assetName: "BUILDING_CN_TOWER",
    cost: 1000,
    requiredTech: "telecommunications",
    isWonder: true,
    stats: {
      culture: 3,
      happiness: 4
    },
    notYet: ["Its Civ 5 effect"]
  },
  {
    id: "cathedral",
    name: "Cathedral",
    assetName: "BUILDING_CATHEDRAL",
    maintenance: 3,
    stats: {
      faith: 3,
      happiness: 1
    },
    notYet: ["A slot for a Great Work of Art"]
  },
  {
    id: "monastery",
    name: "Monastery",
    assetName: "BUILDING_MONASTERY",
    stats: {
      faith: 2,
      culture: 2
    },
    notYet: ["+1 Faith and +1 Culture from each worked Incense and Wine"]
  },
  {
    id: "mosque",
    name: "Mosque",
    assetName: "BUILDING_MOSQUE",
    stats: {
      faith: 3,
      culture: 2,
      happiness: 1
    }
  },
  {
    id: "pagoda",
    name: "Pagoda",
    assetName: "BUILDING_PAGODA",
    stats: {
      faith: 2,
      culture: 2,
      happiness: 2
    }
  },
  {
    id: "trade_depot",
    name: "Trade Depot",
    cost: 50,
    maintenance: 0,
    requiredTech: "pottery",
    factionCategory: "commercial",
    factionTier: 1,
    factionLocation: "any",
    stats: {
      gold: 3,
      production: 1,
      culture: 1
    }
  },
  {
    id: "counting_house",
    name: "Counting House",
    cost: 120,
    maintenance: 1,
    requiredTech: "currency",
    factionCategory: "commercial",
    factionTier: 2,
    factionLocation: "burg",
    stats: {
      gold: 6,
      science: 1,
      culture: 2
    }
  },
  {
    id: "grand_exchange",
    name: "Grand Exchange",
    cost: 300,
    maintenance: 2,
    requiredTech: "banking",
    factionCategory: "commercial",
    factionTier: 3,
    factionLocation: "burg",
    stats: {
      gold: 12,
      production: 1,
      science: 2,
      culture: 4
    }
  },
  {
    id: "chapter_lodge",
    name: "Chapter Lodge",
    cost: 40,
    maintenance: 1,
    factionCategory: "adventuring",
    factionTier: 1,
    factionLocation: "any",
    stats: {
      gold: 2,
      science: 1,
      culture: 2,
      happiness: 1
    }
  },
  {
    id: "seeker_archives",
    name: "Seeker Archives",
    cost: 100,
    maintenance: 1,
    requiredTech: "writing",
    factionCategory: "adventuring",
    factionTier: 2,
    factionLocation: "any",
    stats: {
      science: 3,
      culture: 3
    }
  },
  {
    id: "grand_conclave",
    name: "Grand Conclave",
    cost: 250,
    maintenance: 2,
    requiredTech: "education",
    factionCategory: "adventuring",
    factionTier: 3,
    factionLocation: "hq_only",
    stats: {
      science: 6,
      culture: 6,
      happiness: 2
    }
  },
  {
    id: "safe_house",
    name: "Safe House",
    cost: 35,
    maintenance: 0,
    factionCategory: "underworld",
    factionTier: 1,
    factionLocation: "burg",
    stats: {
      gold: 3,
      defense: 1
    }
  },
  {
    id: "smuggler_tunnel",
    name: "Smuggler Warren",
    cost: 90,
    maintenance: 1,
    requiredTech: "masonry",
    factionCategory: "underworld",
    factionTier: 2,
    factionLocation: "any",
    stats: {
      gold: 6,
      science: 1,
      production: 1
    }
  },
  {
    id: "shadow_court",
    name: "Shadow Court",
    cost: 220,
    maintenance: 2,
    requiredTech: "guilds",
    factionCategory: "underworld",
    factionTier: 3,
    factionLocation: "hq_only",
    stats: {
      gold: 10,
      science: 3,
      culture: 4
    }
  },
  {
    id: "wayside_shrine",
    name: "Wayside Shrine",
    cost: 30,
    maintenance: 1,
    factionCategory: "religious",
    factionTier: 1,
    factionLocation: "any",
    stats: {
      gold: 2,
      faith: 2,
      culture: 2,
      happiness: 1
    }
  },
  {
    id: "monastic_scriptorium",
    name: "Scriptorium",
    cost: 80,
    maintenance: 1,
    requiredTech: "philosophy",
    factionCategory: "religious",
    factionTier: 2,
    factionLocation: "any",
    stats: {
      science: 4,
      faith: 2,
      culture: 3
    }
  },
  {
    id: "ritual_sanctum",
    name: "Ritual Sanctum",
    cost: 200,
    maintenance: 2,
    requiredTech: "theology",
    factionCategory: "religious",
    factionTier: 3,
    factionLocation: "any",
    stats: {
      gold: 4,
      science: 4,
      faith: 4,
      culture: 5
    }
  },
  {
    id: "informant_ring",
    name: "Informant Ring",
    cost: 45,
    maintenance: 1,
    factionCategory: "political",
    factionTier: 1,
    factionLocation: "burg",
    stats: {
      science: 1,
      culture: 2
    }
  },
  {
    id: "printing_cell",
    name: "Pamphlet Press",
    cost: 110,
    maintenance: 1,
    requiredTech: "machinery",
    factionCategory: "political",
    factionTier: 2,
    factionLocation: "burg",
    stats: {
      science: 3,
      culture: 5,
      happiness: 1
    }
  },
  {
    id: "shadow_directorate",
    name: "Directorate HQ",
    cost: 260,
    maintenance: 2,
    requiredTech: "civil_service",
    factionCategory: "political",
    factionTier: 3,
    factionLocation: "hq_only",
    stats: {
      gold: 6,
      science: 4,
      culture: 6,
      defense: 2
    }
  },
  {
    id: "muster_camp",
    name: "Muster Camp",
    cost: 50,
    maintenance: 1,
    factionCategory: "martial",
    factionTier: 1,
    factionLocation: "any",
    stats: {
      gold: 2,
      production: 1,
      defense: 2
    },
    effects: {
      trainedUnitExperience: {
        amount: 10,
        landOnly: true
      }
    }
  },
  {
    id: "armory_forge",
    name: "Armory & Forge",
    cost: 120,
    maintenance: 1,
    requiredTech: "iron_working",
    factionCategory: "martial",
    factionTier: 2,
    factionLocation: "any",
    stats: {
      gold: 2,
      production: 2,
      science: 2,
      defense: 3
    },
    effects: {
      trainedUnitExperience: {
        amount: 15,
        landOnly: true
      }
    }
  },
  {
    id: "war_citadel",
    name: "War Citadel",
    cost: 300,
    maintenance: 2,
    requiredTech: "chivalry",
    factionCategory: "martial",
    factionTier: 3,
    factionLocation: "hq_only",
    cityHealth: 25,
    stats: {
      gold: 4,
      production: 2,
      science: 3,
      defense: 6
    }
  },
  {
    id: "alchemical_lab",
    name: "Alchemical Lab",
    cost: 130,
    maintenance: 1,
    requiredTech: "chemistry",
    factionCategory: "scholarly",
    factionTier: 2,
    factionLocation: "any",
    stats: {
      gold: 2,
      science: 5,
      production: 1
    }
  },
  {
    id: "subterranean_delve",
    name: "Deep Delve",
    cost: 100,
    maintenance: 1,
    requiredTech: "mining",
    factionCategory: "wilder",
    factionTier: 2,
    factionLocation: "wilderness",
    stats: {
      gold: 5,
      production: 2,
      science: 2,
      defense: 2
    }
  }
];

export const CIV_BUILDING_BY_ID: Record<string, CivBuildingDef> = Object.fromEntries(
  CIV_BUILDINGS.map(building => [building.id, building] as const)
);

export function getCivBuilding(id: string): CivBuildingDef | undefined {
  return CIV_BUILDING_BY_ID[id];
}

export interface CivCapacityBonus {
  m: number;
  w: number;
  s: number;
  c: number;
}

/**
 * Maps an OpenCiv building to its domain capability contribution (M, W, S, C).
 * Used by Living World and ProvinceDialog to compute state & province check ratings.
 */
export function civBuildingCapacity(bDefOrId: CivBuildingDef | string | undefined | null): CivCapacityBonus {
  const cap: CivCapacityBonus = { m: 0, w: 0, s: 0, c: 0 };
  if (!bDefOrId) return cap;
  const bDef = typeof bDefOrId === "string" ? getCivBuilding(bDefOrId) : bDefOrId;
  if (!bDef || bDef.id === "palace") return cap;

  const id = bDef.id;
  const stats = bDef.stats ?? {};

  // 1. Military (M)
  if ((stats.defense ?? 0) >= 7) cap.m += 2;
  else if ((stats.defense ?? 0) >= 2) cap.m += 1;

  if (
    id === "barracks" ||
    id === "armory" ||
    id === "stables" ||
    id === "forge" ||
    bDef.effects?.trainedUnitExperience
  ) {
    cap.m += 1;
  }
  if (
    id === "military_base" ||
    id === "heroic_epic" ||
    id === "statue_of_zeus" ||
    id === "terracotta_army" ||
    id === "himeji_castle" ||
    id === "alhambra" ||
    id === "brandenburg_gate" ||
    id === "pentagon" ||
    id === "great_wall"
  ) {
    cap.m += 2;
  }

  // 2. Wealth (W)
  if ((stats.gold ?? 0) >= 4) cap.w += 2;
  else if ((stats.gold ?? 0) >= 1) cap.w += 1;

  if (
    id === "market" ||
    id === "bazaar" ||
    id === "mint" ||
    id === "caravansary" ||
    id === "workshop" ||
    id === "windmill" ||
    id === "water_mill" ||
    id === "granary" ||
    id === "harbor" ||
    id === "seaport"
  ) {
    cap.w += 1;
  }
  if (
    id === "bank" ||
    id === "stock_exchange" ||
    id === "factory" ||
    id === "ironworks" ||
    id === "colossus" ||
    id === "east_india_company" ||
    id === "machu_picchu" ||
    id === "petra" ||
    id === "big_ben" ||
    id === "great_pyramids"
  ) {
    cap.w += 2;
  }

  // 3. Social / Stability (S)
  const cultOrFaithOrHap = (stats.culture ?? 0) + (stats.faith ?? 0) + (stats.happiness ?? 0);
  if (cultOrFaithOrHap >= 6) cap.s += 2;
  else if (cultOrFaithOrHap >= 1) cap.s += 1;

  if (
    id === "monument" ||
    id === "amphitheater" ||
    id === "shrine" ||
    id === "circus" ||
    id === "garden" ||
    id === "artists_guild"
  ) {
    cap.s += 1;
  }
  if (
    id === "temple" ||
    id === "colosseum" ||
    id === "theatre" ||
    id === "opera_house" ||
    id === "museum" ||
    id === "stadium" ||
    id === "broadcast_tower" ||
    id === "courthouse" ||
    id === "cathedral" ||
    id === "monastery" ||
    id === "mosque" ||
    id === "pagoda" ||
    id === "grand_temple" ||
    id === "stonehenge" ||
    id === "parthenon" ||
    id === "oracle" ||
    id === "borobudur" ||
    id === "hagia_sophia" ||
    id === "chichen_itza" ||
    id === "notre_dame" ||
    id === "sistine_chapel" ||
    id === "taj_mahal"
  ) {
    cap.s += 2;
  }

  // 4. Cunning / Knowledge / Arcana (C)
  if ((stats.science ?? 0) >= 4) cap.c += 2;
  else if ((stats.science ?? 0) >= 1) cap.c += 1;

  if (id === "library" || id === "observatory" || id === "constabulary") {
    cap.c += 1;
  }
  if (
    id === "university" ||
    id === "public_school" ||
    id === "research_lab" ||
    id === "police_station" ||
    id === "national_college" ||
    id === "great_library" ||
    id === "oxford_university" ||
    id === "porcelain_tower" ||
    id === "great_firewall"
  ) {
    cap.c += 2;
  }

  return cap;
}
