import type { CivBeliefDef } from "@/types/living";

/** Ported from OpenCiv's `server/config/pantheons.yml` and `religions.yml`. */
export const CIV_PANTHEONS: readonly CivBeliefDef[] = [
  {
    id: "ancestor_worship",
    name: "Ancestor Worship",
    text: "from Shrines",
    description: "+1 Culture from Shrines",
    yields: {
      culture: 1
    },
    effects: {
      buildingYields: [
        {
          building: "shrine",
          stats: {
            culture: 1
          }
        }
      ]
    }
  },
  {
    id: "dance_of_the_aurora",
    name: "Dance of the Aurora",
    text: "from Tundra without Forest",
    description: "+1 Faith from Tundra tiles without Forest",
    yields: {
      faith: 1
    },
    effects: {
      tileYields: [
        {
          except: ["forest"],
          stats: {
            faith: 1
          },
          terrain: ["tundra", "tundra_hill"]
        }
      ]
    }
  },
  {
    id: "desert_folklore",
    name: "Desert Folklore",
    text: "from Desert and Flood Plains",
    description: "+1 Faith from Desert tiles (including Flood Plains and Oasis)",
    yields: {
      faith: 1
    },
    effects: {
      tileYields: [
        {
          stats: {
            faith: 1
          },
          terrain: ["desert", "desert_hill", "floodplains", "oasis"]
        }
      ]
    }
  },
  {
    id: "earth_mother",
    name: "Earth Mother",
    text: "from Copper, Iron and Salt",
    description: "+1 Faith for each Copper, Iron, and Salt resource",
    yields: {
      faith: 1
    },
    effects: {
      tileYields: [
        {
          resources: ["copper", "iron", "salt"],
          stats: {
            faith: 1
          }
        }
      ]
    }
  },
  {
    id: "faith_healers",
    name: "Faith Healers",
    text: "+30 HP healing next to your cities",
    description: "+30 HP healed per turn if adjacent to a friendly city",
    effects: {
      healNearCity: 30
    }
  },
  {
    id: "fertility_rites",
    name: "Fertility Rites",
    text: "10% faster city growth",
    description: "10% faster Food Growth rates",
    effects: {
      growthPercent: 10
    }
  },
  {
    id: "god_of_craftsmen",
    name: "God of Craftsmen",
    text: "in cities of 3+ Population",
    description: "+1 Production in cities with Population of 3+",
    yields: {
      production: 1
    },
    effects: {
      cityYields: [
        {
          minPopulation: 3,
          stats: {
            production: 1
          }
        }
      ]
    }
  },
  {
    id: "god_of_the_open_sky",
    name: "God of the Open Sky",
    text: "from Pastures",
    description: "+1 Culture from Pastures",
    yields: {
      culture: 1
    },
    effects: {
      tileYields: [
        {
          improvement: "pasture",
          stats: {
            culture: 1
          }
        }
      ]
    }
  },
  {
    id: "god_of_the_sea",
    name: "God of the Sea",
    text: "from Fishing Boats",
    description: "+1 Production from Fishing Boats",
    yields: {
      production: 1
    },
    effects: {
      tileYields: [
        {
          improvement: "fishing_boats",
          stats: {
            production: 1
          }
        }
      ]
    }
  },
  {
    id: "god_of_war",
    name: "God of War",
    text: "Faith for battles won near your cities",
    description: "Gain Faith equal to the defeated unit's strength if you win a battle within 4 tiles of your city",
    effects: {
      faithFromKills: {
        range: 4
      }
    }
  },
  {
    id: "goddess_of_festivals",
    name: "Goddess of Festivals",
    text: "from Wine and Incense",
    description: "+1 Culture and +1 Faith for each Wine and Incense",
    yields: {
      culture: 1,
      faith: 1
    },
    effects: {
      tileYields: [
        {
          resources: ["wine", "incense"],
          stats: {
            culture: 1,
            faith: 1
          }
        }
      ]
    }
  },
  {
    id: "goddess_of_love",
    name: "Goddess of Love",
    text: "from cities of 6+ Population",
    description: "+1 Happiness from cities with Population of 6+",
    yields: {
      happiness: 1
    },
    effects: {
      cityYields: [
        {
          minPopulation: 6,
          stats: {
            happiness: 1
          }
        }
      ]
    }
  },
  {
    id: "goddess_of_protection",
    name: "Goddess of Protection",
    text: "+30% city Ranged Strength",
    description: "+30% increase in city Ranged Combat Strength",
    effects: {
      cityRangedPercent: 30
    }
  },
  {
    id: "goddess_of_the_hunt",
    name: "Goddess of the Hunt",
    text: "from Camps",
    description: "+1 Food from Camps",
    yields: {
      food: 1
    },
    effects: {
      tileYields: [
        {
          improvement: "camp",
          stats: {
            food: 1
          }
        }
      ]
    }
  },
  {
    id: "god_king",
    name: "God-King",
    text: "from the Palace",
    description: "Palace provides +1 Culture, Faith, Gold, Production, and Science",
    yields: {
      production: 1,
      gold: 1,
      science: 1,
      culture: 1,
      faith: 1
    },
    effects: {
      buildingYields: [
        {
          building: "palace",
          stats: {
            culture: 1,
            faith: 1,
            gold: 1,
            production: 1,
            science: 1
          }
        }
      ]
    }
  },
  {
    id: "messenger_of_the_gods",
    name: "Messenger of the Gods",
    text: "in cities with a City Connection",
    description: "+2 Science in cities with a City Connection",
    yields: {
      science: 2
    },
    notYet: ["City connections aren't in the game yet", "so this gives nothing"]
  },
  {
    id: "monument_to_the_gods",
    name: "Monument to the Gods",
    text: "+15% Production for early Wonders",
    description: "+15% Production for Ancient and Classical Era Wonders",
    effects: {
      wonderProduction: {
        eras: ["ancient", "classical"],
        percent: 15
      }
    }
  },
  {
    id: "one_with_nature",
    name: "One with Nature",
    text: "from Natural Wonders",
    description: "+4 Faith from Natural Wonders",
    yields: {
      faith: 4
    },
    effects: {
      tileYields: [
        {
          naturalWonder: true,
          stats: {
            faith: 4
          }
        }
      ]
    }
  },
  {
    id: "oral_tradition",
    name: "Oral Tradition",
    text: "from Plantations",
    description: "+1 Culture from Plantations",
    yields: {
      culture: 1
    },
    effects: {
      tileYields: [
        {
          improvement: "plantation",
          stats: {
            culture: 1
          }
        }
      ]
    }
  },
  {
    id: "religious_idols",
    name: "Religious Idols",
    text: "from Gold and Silver",
    description: "+1 Culture and +1 Faith for each Gold and Silver",
    yields: {
      culture: 1,
      faith: 1
    },
    effects: {
      tileYields: [
        {
          resources: ["gold", "silver"],
          stats: {
            culture: 1,
            faith: 1
          }
        }
      ]
    }
  },
  {
    id: "religious_settlements",
    name: "Religious Settlements",
    text: "15% faster border growth",
    description: "15% faster border growth",
    effects: {
      borderGrowthPercent: 15
    }
  },
  {
    id: "sacred_path",
    name: "Sacred Path",
    text: "from Jungle tiles",
    description: "+1 Culture from Jungle tiles (resource tiles in a Jungle also qualify)",
    yields: {
      culture: 1
    },
    effects: {
      tileYields: [
        {
          stats: {
            culture: 1
          },
          terrain: ["jungle"]
        }
      ]
    }
  },
  {
    id: "sacred_waters",
    name: "Sacred Waters",
    text: "from cities on rivers",
    description: "+1 Happiness from cities on rivers",
    yields: {
      happiness: 1
    },
    effects: {
      cityYields: [
        {
          river: true,
          stats: {
            happiness: 1
          }
        }
      ]
    }
  },
  {
    id: "stone_circles",
    name: "Stone Circles",
    text: "from Quarries",
    description: "+2 Faith from Quarries",
    yields: {
      faith: 2
    },
    effects: {
      tileYields: [
        {
          improvement: "quarry",
          stats: {
            faith: 2
          }
        }
      ]
    }
  },
  {
    id: "sun_god",
    name: "Sun God",
    text: "from Bananas, Citrus and Wheat",
    description: "+1 Food for each Bananas, Citrus, and Wheat resource",
    yields: {
      food: 1
    },
    effects: {
      tileYields: [
        {
          resources: ["bananas", "citrus", "wheat"],
          stats: {
            food: 1
          }
        }
      ]
    }
  },
  {
    id: "tears_of_the_gods",
    name: "Tears of the Gods",
    text: "from Gems and Pearls",
    description: "+2 Faith for each Gems and Pearls resource",
    yields: {
      faith: 2
    },
    effects: {
      tileYields: [
        {
          resources: ["gems", "pearls"],
          stats: {
            faith: 2
          }
        }
      ]
    }
  }
];

export const CIV_FOUNDER_BELIEFS: readonly CivBeliefDef[] = [
  {
    id: "ceremonial_burial",
    name: "Ceremonial Burial",
    text: "for every 2 cities following",
    description: "+1 Happiness for every 2 Cities following this religion",
    yields: {
      happiness: 1
    },
    effects: {
      happinessPerCities: {
        per: 2
      }
    }
  },
  {
    id: "church_property",
    name: "Church Property",
    text: "for each city following",
    description: "+2 Gold for each City following this religion",
    yields: {
      gold: 2
    },
    effects: {
      goldPerCity: 2
    }
  },
  {
    id: "initiation_rites",
    name: "Initiation Rites",
    text: "when each city first converts",
    description: "+100 Gold when each City first converts to this religion",
    yields: {
      gold: 100
    },
    effects: {
      goldOnConversion: 100
    }
  },
  {
    id: "interfaith_dialogue",
    name: "Interfaith Dialogue",
    text: "per other religion's follower a Missionary reaches",
    description: "Gain Science when a Missionary spreads this religion to cities of other religions",
    yields: {
      science: 2
    },
    effects: {
      sciencePerOtherFollower: 2
    }
  },
  {
    id: "papal_primacy",
    name: "Papal Primacy",
    text: "+15 resting Influence with City-States",
    description: "+15 to Influence resting point with City-States following this religion",
    notYet: ["City-States aren't in the game yet", "so this gives nothing"]
  },
  {
    id: "peace_loving",
    name: "Peace Loving",
    text: "per 8 followers in friendly foreign cities",
    description: "+1 Happiness for every 8 followers of this religion in non-enemy foreign cities",
    yields: {
      happiness: 1
    },
    effects: {
      happinessPerForeignFollowers: {
        per: 8
      }
    }
  },
  {
    id: "pilgrimage",
    name: "Pilgrimage",
    text: "for each foreign city following",
    description: "+2 Faith for each foreign City following this religion",
    yields: {
      faith: 2
    },
    effects: {
      faithPerForeignCity: 2
    }
  },
  {
    id: "tithe",
    name: "Tithe",
    text: "for every 4 followers",
    description: "+1 Gold for every 4 followers of this religion",
    yields: {
      gold: 1
    },
    effects: {
      goldPerFollowers: {
        per: 4
      }
    }
  },
  {
    id: "world_church",
    name: "World Church",
    text: "per 5 followers in other civilizations",
    description: "+1 Culture for every 5 followers of this religion in other civilizations",
    yields: {
      culture: 1
    },
    effects: {
      culturePerForeignFollowers: {
        per: 5
      }
    }
  }
];

export const CIV_FOLLOWER_BELIEFS: readonly CivBeliefDef[] = [
  {
    id: "asceticism",
    name: "Asceticism",
    text: "from Shrines in cities with 3 followers",
    description: "Shrines provide +1 Happiness in cities with 3 followers",
    yields: {
      happiness: 1
    },
    effects: {
      buildingYields: [
        {
          building: "shrine",
          minFollowers: 3,
          stats: {
            happiness: 1
          }
        }
      ]
    }
  },
  {
    id: "cathedrals",
    name: "Cathedrals",
    text: "Use Faith to buy Cathedrals",
    description: "Use Faith to purchase Cathedrals",
    effects: {
      faithBuildings: [
        {
          building: "cathedral",
          faithCost: 200
        }
      ]
    }
  },
  {
    id: "choral_music",
    name: "Choral Music",
    text: "from Temples in cities with 5 followers",
    description: "Temples provide +2 Culture in cities with 5 followers",
    yields: {
      culture: 2
    },
    effects: {
      buildingYields: [
        {
          building: "temple",
          minFollowers: 5,
          stats: {
            culture: 2
          }
        }
      ]
    }
  },
  {
    id: "divine_inspiration",
    name: "Divine Inspiration",
    text: "from each World Wonder",
    description: "Each World Wonder provides +2 Faith in city",
    yields: {
      faith: 2
    },
    effects: {
      wonderYields: {
        faith: 2
      }
    }
  },
  {
    id: "feed_the_world",
    name: "Feed the World",
    text: "from each Shrine and Temple",
    description: "Shrines and Temples provide +1 Food each in city",
    yields: {
      food: 1
    },
    effects: {
      buildingYields: [
        {
          building: "shrine",
          stats: {
            food: 1
          }
        },
        {
          building: "temple",
          stats: {
            food: 1
          }
        }
      ]
    }
  },
  {
    id: "guruship",
    name: "Guruship",
    text: "if the city has a Specialist",
    description: "+2 Production if city has a Specialist",
    yields: {
      production: 2
    },
    notYet: ["Specialists aren't in the game yet", "so this gives nothing"]
  },
  {
    id: "holy_warriors",
    name: "Holy Warriors",
    text: "Use Faith to buy pre-Industrial land units",
    description: "Use Faith to purchase pre-Industrial land units",
    effects: {
      faithUnits: {
        beforeEra: "industrial"
      }
    }
  },
  {
    id: "liturgical_drama",
    name: "Liturgical Drama",
    text: "from Amphitheaters with 3 followers",
    description: "Amphitheaters provide +1 Faith in cities with 3 followers",
    yields: {
      faith: 1
    },
    effects: {
      buildingYields: [
        {
          building: "amphitheater",
          minFollowers: 3,
          stats: {
            faith: 1
          }
        }
      ]
    }
  },
  {
    id: "monasteries",
    name: "Monasteries",
    text: "Use Faith to buy Monasteries",
    description: "Use Faith to purchase Monasteries",
    effects: {
      faithBuildings: [
        {
          building: "monastery",
          faithCost: 200
        }
      ]
    }
  },
  {
    id: "mosques",
    name: "Mosques",
    text: "Use Faith to buy Mosques",
    description: "Use Faith to purchase Mosques",
    effects: {
      faithBuildings: [
        {
          building: "mosque",
          faithCost: 200
        }
      ]
    }
  },
  {
    id: "pagodas",
    name: "Pagodas",
    text: "Use Faith to buy Pagodas",
    description: "Use Faith to purchase Pagodas",
    effects: {
      faithBuildings: [
        {
          building: "pagoda",
          faithCost: 200
        }
      ]
    }
  },
  {
    id: "peace_gardens",
    name: "Peace Gardens",
    text: "from Gardens",
    description: "Gardens provide +2 Happiness in city",
    yields: {
      happiness: 2
    },
    effects: {
      buildingYields: [
        {
          building: "garden",
          stats: {
            happiness: 2
          }
        }
      ]
    }
  },
  {
    id: "religious_art",
    name: "Religious Art",
    text: "from the Hermitage",
    description: "Hermitage provides +5 Culture and +5 Tourism",
    yields: {
      culture: 5
    },
    effects: {
      buildingYields: [
        {
          building: "hermitage",
          stats: {
            culture: 5
          }
        }
      ]
    },
    notYet: ["Tourism isn't in the game yet"]
  },
  {
    id: "religious_center",
    name: "Religious Center",
    text: "from Temples in cities with 5 followers",
    description: "Temples provide +2 Happiness in cities with 5 followers",
    yields: {
      happiness: 2
    },
    effects: {
      buildingYields: [
        {
          building: "temple",
          minFollowers: 5,
          stats: {
            happiness: 2
          }
        }
      ]
    }
  },
  {
    id: "religious_community",
    name: "Religious Community",
    text: "+1% Production per follower (max +15%)",
    description: "+1% Production for each follower (Max +15%)",
    effects: {
      productionPercentPerFollower: {
        max: 15,
        percent: 1
      }
    }
  },
  {
    id: "swords_into_plowshares",
    name: "Swords into Plowshares",
    text: "15% faster growth while at peace",
    description: "15% faster Food Growth rate for city if not at war",
    effects: {
      growthPercentAtPeace: 15
    }
  }
];

export const CIV_ENHANCER_BELIEFS: readonly CivBeliefDef[] = [
  {
    id: "defender_of_the_faith",
    name: "Defender of the Faith",
    text: "+20% Combat Strength near friendly cities following",
    description: "+20% Combat Strength for your units in the lands of friendly cities following this religion",
    effects: {
      combatNearFriendlyPercent: 20
    }
  },
  {
    id: "holy_order",
    name: "Holy Order",
    text: "Missionaries and Inquisitors cost 30% less",
    description: "Missionaries and Inquisitors cost 30% less Faith",
    effects: {
      missionaryCostPercent: -30
    }
  },
  {
    id: "itinerant_preachers",
    name: "Itinerant Preachers",
    text: "Spreads to cities 30% further away",
    description: "Religion spreads to cities 30% further away",
    effects: {
      spreadRangePercent: 30
    }
  },
  {
    id: "just_war",
    name: "Just War",
    text: "+20% Combat Strength near enemy cities following",
    description: "+20% Combat Strength for your units in the lands of enemy cities following this religion",
    effects: {
      combatNearEnemyPercent: 20
    }
  },
  {
    id: "messiah",
    name: "Messiah",
    text: "Prophets 25% stronger and 25% cheaper",
    description: "Prophets 25% stronger and earned with 25% less Faith",
    effects: {
      prophetCostPercent: -25,
      prophetStrengthPercent: 25
    }
  },
  {
    id: "missionary_zeal",
    name: "Missionary Zeal",
    text: "Missionaries spread it 25% harder",
    description: "Missionary conversion strength +25%",
    effects: {
      missionaryStrengthPercent: 25
    }
  },
  {
    id: "religious_texts",
    name: "Religious Texts",
    text: "Spreads 25% faster (50% with Printing Press)",
    description: "Religion spreads 25% faster (50% faster after discovery of Printing Press)",
    effects: {
      spreadPressurePercent: {
        percent: 25,
        withTech: {
          percent: 50,
          tech: "printing_press"
        }
      }
    }
  },
  {
    id: "religious_unity",
    name: "Religious Unity",
    text: "Spreads to friendly City-States twice as fast",
    description: "Religion spreads to friendly City-States at double rate",
    notYet: ["City-States aren't in the game yet", "so this gives nothing"]
  },
  {
    id: "reliquary",
    name: "Reliquary",
    text: "each time a Great Person is expended",
    description: "Gain 50 Faith each time a Great Person is expended",
    yields: {
      faith: 50
    },
    effects: {
      faithOnGreatPerson: 50
    }
  }
];

export const CIV_RELIGION_NAMES: readonly string[] = [
  "Buddhism",
  "Christianity",
  "Confucianism",
  "Eastern Orthodoxy",
  "Hinduism",
  "Islam",
  "Judaism",
  "Protestantism",
  "Shinto",
  "Sikhism",
  "Taoism",
  "Tengriism",
  "Zoroastrianism"
];

export const CIV_BELIEF_BY_ID: Record<string, CivBeliefDef> = Object.fromEntries(
  [...CIV_PANTHEONS, ...CIV_FOUNDER_BELIEFS, ...CIV_FOLLOWER_BELIEFS, ...CIV_ENHANCER_BELIEFS].map(
    belief => [belief.id, belief] as const
  )
);
