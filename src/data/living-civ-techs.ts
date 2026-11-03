import type { CivEraDef, CivTechDef } from "@/types/living";

/** Ported from OpenCiv's `server/config/techs.yml`. */
export const CIV_ERAS: readonly CivEraDef[] = [
  {
    id: "ancient",
    name: "Ancient Era",
    rows: [0, 1]
  },
  {
    id: "classical",
    name: "Classical Era",
    rows: [2, 3]
  },
  {
    id: "medieval",
    name: "Medieval Era",
    rows: [4, 5]
  },
  {
    id: "renaissance",
    name: "Renaissance Era",
    rows: [6, 7]
  },
  {
    id: "industrial",
    name: "Industrial Era",
    rows: [8, 9]
  },
  {
    id: "modern",
    name: "Modern Era",
    rows: [10, 11]
  },
  {
    id: "atomic",
    name: "Atomic Era",
    rows: [12, 13]
  },
  {
    id: "information",
    name: "Information Era",
    rows: [14, 15, 16]
  }
];

export const CIV_TECHS: readonly CivTechDef[] = [
  {
    id: "pottery",
    name: "Pottery",
    cost: 35,
    prerequisites: [],
    row: 0,
    slot: 1,
    era: "ancient",
    description: "Enables long-term storage of food and materials.",
    assetName: "BUILDING_GRANARY"
  },
  {
    id: "animal_husbandry",
    name: "Animal Husbandry",
    cost: 35,
    prerequisites: [],
    row: 0,
    slot: 4,
    era: "ancient",
    description: "Unlocks pastures and an additional trade route.",
    assetName: "ICON_EMPTY_PASTURE",
    notes: [
      {
        text: "Reveals Horses",
        icon: "TILE_HORSES"
      },
      {
        text: "Allows an additional trade route",
        icon: "ICON_TRADE"
      }
    ]
  },
  {
    id: "archery",
    name: "Archery",
    cost: 35,
    prerequisites: [],
    row: 0,
    slot: 6,
    era: "ancient",
    description: "Grants access to the Archer unit.",
    assetName: "UNIT_ARCHER"
  },
  {
    id: "mining",
    name: "Mining",
    cost: 35,
    prerequisites: [],
    row: 0,
    slot: 8,
    era: "ancient",
    description: "Allows mining mineral resources and clearing forests.",
    assetName: "TILE_COPPER_MINE",
    notes: [
      {
        text: "Can remove Forests",
        icon: "ICON_CHOP"
      }
    ]
  },
  {
    id: "sailing",
    name: "Sailing",
    cost: 55,
    prerequisites: ["pottery"],
    row: 1,
    slot: 0,
    era: "ancient",
    description: "Develops the means to traverse the seas, one of civilization's great early achievements.",
    assetName: "UNIT_WORK_BOAT"
  },
  {
    id: "calendar",
    name: "Calendar",
    cost: 55,
    prerequisites: ["pottery"],
    row: 1,
    slot: 1,
    era: "ancient",
    description: "Allows prediction of seasonal change, essential for advanced agriculture.",
    assetName: "BUILDING_STONEHENGE"
  },
  {
    id: "writing",
    name: "Writing",
    cost: 55,
    prerequisites: ["pottery"],
    row: 1,
    slot: 2,
    era: "ancient",
    description: "Enables recording information on durable materials, preserving knowledge across generations.",
    assetName: "BUILDING_LIBRARY",
    notes: [
      {
        text: "Allows exchanging embassies",
        icon: "ICON_DIPLOMACY"
      }
    ]
  },
  {
    id: "trapping",
    name: "Trapping",
    cost: 55,
    prerequisites: ["animal_husbandry"],
    row: 1,
    slot: 4,
    era: "ancient",
    description: "Enables hunting of animals that cannot be domesticated in human-controlled environments.",
    assetName: "BUILDING_CIRCUS"
  },
  {
    id: "the_wheel",
    name: "The Wheel",
    cost: 55,
    prerequisites: ["animal_husbandry", "archery"],
    row: 1,
    slot: 6,
    era: "ancient",
    description: "A key technology that transforms how people move around and transport goods.",
    assetName: "UNIT_CHARIOT_ARCHER"
  },
  {
    id: "masonry",
    name: "Masonry",
    cost: 55,
    prerequisites: ["mining"],
    row: 1,
    slot: 8,
    era: "ancient",
    description: "The art of building with stone, enabling massive stone structures and fortifications.",
    assetName: "BUILDING_WALLS",
    notes: [
      {
        text: "Can remove Marshes",
        icon: "ICON_CHOP"
      }
    ]
  },
  {
    id: "bronze_working",
    name: "Bronze Working",
    cost: 55,
    prerequisites: ["mining"],
    row: 1,
    slot: 9,
    era: "ancient",
    description: "The first metal-working technology, providing sturdy tools and early bronze weapons.",
    assetName: "UNIT_SPEARMAN",
    notes: [
      {
        text: "Can remove Jungles",
        icon: "ICON_CHOP"
      },
      {
        text: "Reveals Iron",
        icon: "TILE_IRON"
      }
    ]
  },
  {
    id: "optics",
    name: "Optics",
    cost: 105,
    prerequisites: ["sailing"],
    row: 2,
    slot: 0,
    era: "classical",
    description: "Develops tools for seeing farther, enabling key advances in seafaring.",
    assetName: "BUILDING_LIGHTHOUSE",
    notes: [
      {
        text: "Allows land units to embark",
        icon: "ICON_EMBARK"
      }
    ]
  },
  {
    id: "horseback_riding",
    name: "Horseback Riding",
    cost: 105,
    prerequisites: ["the_wheel", "trapping"],
    row: 2,
    slot: 4,
    era: "classical",
    description: "Enables large animals once used for food or labor to be ridden for transportation.",
    assetName: "UNIT_HORSEMAN"
  },
  {
    id: "mathematics",
    name: "Mathematics",
    cost: 105,
    prerequisites: ["the_wheel"],
    row: 2,
    slot: 6,
    era: "classical",
    description: "The foundational science for exploring and understanding the physical world.",
    assetName: "UNIT_CATAPULT"
  },
  {
    id: "construction",
    name: "Construction",
    cost: 105,
    prerequisites: ["masonry", "the_wheel"],
    row: 2,
    slot: 8,
    era: "classical",
    description: "Represents further advances in building and combining materials.",
    assetName: "BUILDING_AQUEDUCT"
  },
  {
    id: "philosophy",
    name: "Philosophy",
    cost: 105,
    prerequisites: ["calendar", "writing"],
    row: 3,
    slot: 1,
    era: "classical",
    description: "The first abstract science, advancing civilization's intellectual and reasoning power.",
    assetName: "BUILDING_TEMPLE"
  },
  {
    id: "drama_and_poetry",
    name: "Drama and Poetry",
    cost: 105,
    prerequisites: ["writing"],
    row: 3,
    slot: 2,
    era: "classical",
    description: "Unlocks the Amphitheater and early cultural works.",
    assetName: "BUILDING_AMPHITHEATER"
  },
  {
    id: "currency",
    name: "Currency",
    cost: 175,
    prerequisites: ["mathematics"],
    row: 3,
    slot: 6,
    era: "classical",
    description: "Establishes a single consolidated trading system based on one standard material.",
    assetName: "BUILDING_MARKET"
  },
  {
    id: "engineering",
    name: "Engineering",
    cost: 175,
    prerequisites: ["mathematics", "construction"],
    row: 3,
    slot: 7,
    era: "classical",
    description: "Builds on mathematics to design complex structures and machines before actually building them.",
    assetName: "BUILDING_WATER_MILL",
    notes: [
      {
        text: "Roads cross rivers",
        icon: "ICON_BRIDGE"
      }
    ]
  },
  {
    id: "iron_working",
    name: "Iron Working",
    cost: 105,
    prerequisites: ["bronze_working"],
    row: 3,
    slot: 9,
    era: "classical",
    description: "The discovery of iron, a metal stronger than bronze, lays the groundwork for advanced metallurgy.",
    assetName: "UNIT_SWORDSMAN"
  },
  {
    id: "theology",
    name: "Theology",
    cost: 175,
    prerequisites: ["drama_and_poetry", "philosophy"],
    row: 4,
    slot: 1,
    era: "medieval",
    description: "The scientific study of spirituality, turning religion into a subject of research.",
    assetName: "ICON_FAITH"
  },
  {
    id: "civil_service",
    name: "Civil Service",
    cost: 175,
    prerequisites: ["drama_and_poetry", "horseback_riding", "currency"],
    row: 4,
    slot: 4,
    era: "medieval",
    description: "Creates the first true state organization, improving food production.",
    assetName: "UNIT_PIKEMAN",
    notes: [
      {
        text: "+1 Food from Farms next to fresh water",
        icon: "TILE_FARM"
      }
    ],
    tileBonuses: [
      {
        tileType: "farm",
        freshWater: true,
        stats: {
          food: 1
        }
      }
    ]
  },
  {
    id: "guilds",
    name: "Guilds",
    cost: 175,
    prerequisites: ["currency"],
    row: 4,
    slot: 6,
    era: "medieval",
    description: "The first worker unions, letting tradespeople organize and better control their trades.",
    assetName: "BUILDING_BAZAAR",
    notes: [
      {
        text: "Allows cities to convert Production into Gold",
        icon: "ICON_GOLD"
      }
    ]
  },
  {
    id: "metal_casting",
    name: "Metal Casting",
    cost: 175,
    prerequisites: ["engineering", "iron_working"],
    row: 4,
    slot: 8,
    era: "medieval",
    description: "Introduces molds for casting metal into complex shapes, advancing metallurgy further.",
    assetName: "BUILDING_FORGE"
  },
  {
    id: "compass",
    name: "Compass",
    cost: 275,
    prerequisites: ["optics", "theology"],
    row: 5,
    slot: 0,
    era: "medieval",
    description: "Enables more reliable navigation, extending a ship's vision range at sea.",
    assetName: "UNIT_GALLEASS"
  },
  {
    id: "education",
    name: "Education",
    cost: 275,
    prerequisites: ["theology", "civil_service"],
    row: 5,
    slot: 2,
    era: "medieval",
    description: "Establishes formal schooling, greatly increasing the pursuit of knowledge.",
    assetName: "BUILDING_UNIVERSITY",
    notes: [
      {
        text: "Allows cities to convert Production into Science",
        icon: "ICON_SCIENCE"
      },
      {
        text: "Allows Research agreements",
        icon: "ICON_DIPLOMACY"
      }
    ]
  },
  {
    id: "chivalry",
    name: "Chivalry",
    cost: 275,
    prerequisites: ["civil_service", "guilds"],
    row: 5,
    slot: 5,
    era: "medieval",
    description: "The code of conduct for knights, unlocking powerful mounted warriors.",
    assetName: "UNIT_KNIGHT"
  },
  {
    id: "machinery",
    name: "Machinery",
    cost: 275,
    prerequisites: ["engineering", "guilds"],
    row: 5,
    slot: 7,
    era: "medieval",
    description: "Builds on metalworking and science to create devices with multiple moving parts working together.",
    assetName: "UNIT_CROSSBOWMAN"
  },
  {
    id: "physics",
    name: "Physics",
    cost: 275,
    prerequisites: ["metal_casting"],
    row: 5,
    slot: 8,
    era: "medieval",
    description: "Develops the scientific study of motion and matter, advancing military engineering.",
    assetName: "UNIT_TREBUCHET"
  },
  {
    id: "steel",
    name: "Steel",
    cost: 275,
    prerequisites: ["metal_casting"],
    row: 5,
    slot: 9,
    era: "medieval",
    description: "A stronger, more refined form of iron, enabling more resilient weapons and armor.",
    assetName: "UNIT_LONGSWORDSMAN"
  },
  {
    id: "astronomy",
    name: "Astronomy",
    cost: 505,
    prerequisites: ["education", "compass"],
    row: 6,
    slot: 1,
    era: "renaissance",
    description: "Charts the heavens, leading to ships that can cross the open ocean.",
    assetName: "UNIT_CARAVEL",
    notes: [
      {
        text: "Faster embarked movement",
        icon: "ICON_EMBARK"
      },
      {
        text: "Allows embarking across oceans",
        icon: "ICON_EMBARK"
      }
    ]
  },
  {
    id: "acoustics",
    name: "Acoustics",
    cost: 505,
    prerequisites: ["education"],
    row: 6,
    slot: 3,
    era: "renaissance",
    description: "The science of sound, enabling great halls for music and worship.",
    assetName: "BUILDING_OPERA_HOUSE"
  },
  {
    id: "banking",
    name: "Banking",
    cost: 505,
    prerequisites: ["education", "chivalry"],
    row: 6,
    slot: 5,
    era: "renaissance",
    description: "Organizes lending and deposits, putting a city's wealth to work.",
    assetName: "BUILDING_BANK",
    notes: [
      {
        text: "Allows an additional trade route",
        icon: "ICON_TRADE"
      }
    ]
  },
  {
    id: "printing_press",
    name: "Printing Press",
    cost: 420,
    prerequisites: ["machinery", "physics"],
    row: 6,
    slot: 7,
    era: "renaissance",
    description: "Spreads books and ideas far faster than hand copying ever could.",
    assetName: "BUILDING_THEATER"
  },
  {
    id: "gunpowder",
    name: "Gunpowder",
    cost: 440,
    prerequisites: ["physics", "steel"],
    row: 6,
    slot: 9,
    era: "renaissance",
    description: "A black powder that changes the battlefield for good.",
    assetName: "UNIT_MUSKETMAN"
  },
  {
    id: "navigation",
    name: "Navigation",
    cost: 585,
    prerequisites: ["astronomy"],
    row: 7,
    slot: 1,
    era: "renaissance",
    description: "Advances sailing and shipbuilding for long voyages.",
    assetName: "UNIT_FRIGATE"
  },
  {
    id: "architecture",
    name: "Architecture",
    cost: 420,
    prerequisites: ["acoustics", "banking"],
    row: 7,
    slot: 3,
    era: "renaissance",
    description: "Designs grand structures that outlast their builders.",
    assetName: "BUILDING_LEANING_TOWER_OF_PISA"
  },
  {
    id: "economics",
    name: "Economics",
    cost: 585,
    prerequisites: ["banking", "printing_press"],
    row: 7,
    slot: 5,
    era: "renaissance",
    description: "The groundwork for the modern money system.",
    assetName: "BUILDING_WINDMILL",
    notes: [
      {
        text: "+1 Gold from Camps on Ivory and Furs",
        icon: "TILE_IVORY_CAMP"
      }
    ],
    tileBonuses: [
      {
        tileType: "ivory_camp",
        stats: {
          gold: 1
        }
      },
      {
        tileType: "furs_camp",
        stats: {
          gold: 1
        }
      }
    ]
  },
  {
    id: "chemistry",
    name: "Chemistry",
    cost: 750,
    prerequisites: ["gunpowder"],
    row: 7,
    slot: 9,
    era: "renaissance",
    description: "The study of matter and how it changes, from powders to acids.",
    assetName: "UNIT_CANNON",
    notes: [
      {
        text: "+1 Production from Mines and Quarries",
        icon: "TILE_MINE"
      }
    ],
    tileBonuses: [
      {
        tileType: "mine",
        stats: {
          production: 1
        }
      },
      {
        tileType: "copper_mine",
        stats: {
          production: 1
        }
      },
      {
        tileType: "iron_mine",
        stats: {
          production: 1
        }
      },
      {
        tileType: "gold_mine",
        stats: {
          production: 1
        }
      },
      {
        tileType: "salt_mine",
        stats: {
          production: 1
        }
      },
      {
        tileType: "silver_mine",
        stats: {
          production: 1
        }
      },
      {
        tileType: "gems_mine",
        stats: {
          production: 1
        }
      },
      {
        tileType: "stone_quarry",
        stats: {
          production: 1
        }
      }
    ]
  },
  {
    id: "metallurgy",
    name: "Metallurgy",
    cost: 585,
    prerequisites: ["gunpowder", "printing_press"],
    row: 7,
    slot: 8,
    era: "renaissance",
    description: "Improves the metals behind Renaissance weaponry and armor.",
    assetName: "UNIT_LANCER"
  },
  {
    id: "scientific_theory",
    name: "Scientific Theory",
    cost: 1040,
    prerequisites: ["economics", "architecture"],
    row: 8,
    slot: 3,
    era: "industrial",
    description: "Tests ideas against evidence, the base of modern science.",
    assetName: "BUILDING_PUBLIC_SCHOOL",
    notes: [
      {
        text: "+2 Science from Academies",
        icon: "ICON_SCIENCE"
      },
      {
        text: "+1 Production from Lumber Mills",
        icon: "TILE_LUMBER_MILL"
      }
    ],
    tileBonuses: [
      {
        tileType: "lumber_mill",
        stats: {
          production: 1
        }
      }
    ]
  },
  {
    id: "archaeology",
    name: "Archaeology",
    cost: 1040,
    prerequisites: ["navigation", "architecture"],
    row: 8,
    slot: 1,
    era: "industrial",
    description: "Digs up the past and puts it on display.",
    assetName: "BUILDING_MUSEUM",
    notes: [
      {
        text: "Reveals archaeological sites",
        icon: "ICON_ARCHAEOLOGY"
      },
      {
        text: "Allows constructing archaeological digs",
        icon: "ICON_ARCHAEOLOGY"
      }
    ]
  },
  {
    id: "industrialization",
    name: "Industrialization",
    cost: 1040,
    prerequisites: ["economics"],
    row: 8,
    slot: 5,
    era: "industrial",
    description: "Machines and factories replace the workshop.",
    assetName: "BUILDING_FACTORY",
    notes: [
      {
        text: "Reveals Coal",
        icon: "TILE_COAL"
      }
    ]
  },
  {
    id: "military_science",
    name: "Military Science",
    cost: 1040,
    prerequisites: ["metallurgy", "chemistry"],
    row: 8,
    slot: 8,
    era: "industrial",
    description: "Turns warfare into an organized discipline.",
    assetName: "UNIT_CAVALRY"
  },
  {
    id: "rifling",
    name: "Rifling",
    cost: 925,
    prerequisites: ["metallurgy"],
    row: 8,
    slot: 6,
    era: "industrial",
    description: "Grooved barrels make guns accurate at long range.",
    assetName: "UNIT_RIFLEMAN"
  },
  {
    id: "fertilizer",
    name: "Fertilizer",
    cost: 845,
    prerequisites: ["chemistry"],
    row: 8,
    slot: 9,
    era: "industrial",
    description: "Feeds the soil so farms yield more where water is scarce.",
    assetName: "TILE_FARM",
    notes: [
      {
        text: "+1 Food from Farms without fresh water",
        icon: "TILE_FARM"
      },
      {
        text: "+1 Food from Plantations and Pastures",
        icon: "TILE_COTTON_PLANTATION"
      }
    ],
    tileBonuses: [
      {
        tileType: "farm",
        freshWater: false,
        stats: {
          food: 1
        }
      },
      {
        tileType: "citrus_plantation",
        stats: {
          food: 1
        }
      },
      {
        tileType: "cotton_plantation",
        stats: {
          food: 1
        }
      },
      {
        tileType: "olive_plantation",
        stats: {
          food: 1
        }
      },
      {
        tileType: "wine_plantation",
        stats: {
          food: 1
        }
      },
      {
        tileType: "incense_plantation",
        stats: {
          food: 1
        }
      },
      {
        tileType: "banana_plantation",
        stats: {
          food: 1
        }
      },
      {
        tileType: "improved_horses",
        stats: {
          food: 1
        }
      },
      {
        tileType: "improved_cattle",
        stats: {
          food: 1
        }
      },
      {
        tileType: "improved_sheep",
        stats: {
          food: 1
        }
      }
    ]
  },
  {
    id: "biology",
    name: "Biology",
    cost: 1530,
    prerequisites: ["archaeology", "scientific_theory"],
    row: 9,
    slot: 1,
    era: "industrial",
    description: "The study of living things, the root of modern medicine.",
    assetName: "BUILDING_HOSPITAL",
    notes: [
      {
        text: "Reveals Oil",
        icon: "TILE_OIL"
      },
      {
        text: "Allows an additional trade route",
        icon: "ICON_TRADE"
      }
    ]
  },
  {
    id: "electricity",
    name: "Electricity",
    cost: 1530,
    prerequisites: ["scientific_theory"],
    row: 9,
    slot: 2,
    era: "industrial",
    description: "Harnesses electric current for light, power and trade.",
    assetName: "BUILDING_STOCK_EXCHANGE",
    notes: [
      {
        text: "Reveals Aluminum",
        icon: "TILE_ALUMINUM"
      }
    ]
  },
  {
    id: "steam_power",
    name: "Steam Power",
    cost: 1530,
    prerequisites: ["scientific_theory", "industrialization", "rifling"],
    row: 9,
    slot: 5,
    era: "industrial",
    description: "Steam engines drive ships and machines without wind or muscle.",
    assetName: "UNIT_IRONCLAD",
    notes: [
      {
        text: "Faster embarked movement",
        icon: "ICON_EMBARK"
      }
    ]
  },
  {
    id: "dynamite",
    name: "Dynamite",
    cost: 1530,
    prerequisites: ["fertilizer", "rifling", "military_science"],
    row: 9,
    slot: 8,
    era: "industrial",
    description: "A stable explosive for mining, demolition and war.",
    assetName: "UNIT_ARTILLERY",
    notes: [
      {
        text: "Obsoletes the Great Wall",
        icon: "BUILDING_GREAT_WALL"
      }
    ]
  },
  {
    id: "refrigeration",
    name: "Refrigeration",
    cost: 2015,
    prerequisites: ["biology", "electricity"],
    row: 10,
    slot: 1,
    era: "modern",
    description: "Keeps food fresh for weeks, letting cities grow larger.",
    assetName: "BUILDING_SUPERMARKET"
  },
  {
    id: "railroad",
    name: "Railroad",
    cost: 1235,
    prerequisites: ["steam_power", "dynamite"],
    row: 10,
    slot: 7,
    era: "modern",
    description: "Steam locomotives move goods and armies across continents.",
    assetName: "BUILDING_ARSENAL"
  },
  {
    id: "replaceable_parts",
    name: "Replaceable Parts",
    cost: 2015,
    prerequisites: ["electricity", "steam_power"],
    row: 10,
    slot: 3,
    era: "modern",
    description: "Interchangeable parts make weapons easy to mass produce and repair.",
    assetName: "UNIT_INFANTRY"
  },
  {
    id: "combustion",
    name: "Combustion",
    cost: 1430,
    prerequisites: ["replaceable_parts", "dynamite"],
    row: 11,
    slot: 7,
    era: "modern",
    description: "Engines that burn fuel inside the cylinder power the next generation of vehicles.",
    assetName: "UNIT_TANK"
  },
  {
    id: "penicillin",
    name: "Penicillin",
    cost: 3315,
    prerequisites: ["refrigeration", "plastics"],
    row: 12,
    slot: 1,
    era: "atomic",
    description: "Antibiotics cure infections that once killed millions.",
    assetName: "BUILDING_MEDICAL_LAB",
    notes: [
      {
        text: "Allows an additional trade route",
        icon: "ICON_TRADE"
      }
    ]
  },
  {
    id: "plastics",
    name: "Plastics",
    cost: 1690,
    prerequisites: ["radio", "replaceable_parts"],
    row: 11,
    slot: 2,
    era: "modern",
    description: "Cheap, moldable materials made from oil.",
    assetName: "BUILDING_HYDRO_PLANT"
  },
  {
    id: "electronics",
    name: "Electronics",
    cost: 1690,
    prerequisites: ["replaceable_parts", "flight"],
    row: 11,
    slot: 4,
    era: "modern",
    description: "Controls electric current with tubes and circuits.",
    assetName: "BUILDING_STADIUM"
  },
  {
    id: "radio",
    name: "Radio",
    cost: 2015,
    prerequisites: ["electricity"],
    row: 10,
    slot: 2,
    era: "modern",
    description: "Carries voices and music through the air.",
    assetName: "BUILDING_BROADCAST_TOWER",
    notes: [
      {
        text: "Enables the International Games World Congress proposal",
        icon: "ICON_DIPLOMACY"
      }
    ]
  },
  {
    id: "flight",
    name: "Flight",
    cost: 2015,
    prerequisites: ["steam_power"],
    row: 10,
    slot: 5,
    era: "modern",
    description: "Powered flight, the end of distance as a barrier.",
    assetName: "UNIT_FIGHTER"
  },
  {
    id: "ecology",
    name: "Ecology",
    cost: 4160,
    prerequisites: ["penicillin", "atomic_theory"],
    row: 13,
    slot: 1,
    era: "atomic",
    description: "Studies how living things and their surroundings depend on each other.",
    assetName: "BUILDING_SOLAR_PLANT"
  },
  {
    id: "atomic_theory",
    name: "Atomic Theory",
    cost: 3315,
    prerequisites: ["electronics", "plastics"],
    row: 12,
    slot: 3,
    era: "atomic",
    description: "Shows that matter is built of atoms with enormous energy inside.",
    assetName: "BUILDING_MANHATTAN_PROJECT",
    notes: [
      {
        text: "Reveals Uranium",
        icon: "TILE_URANIUM"
      },
      {
        text: "+2 Science from Academies",
        icon: "ICON_SCIENCE"
      }
    ]
  },
  {
    id: "radar",
    name: "Radar",
    cost: 3315,
    prerequisites: ["ballistics", "electronics"],
    row: 12,
    slot: 5,
    era: "atomic",
    description: "Bounces radio waves off distant objects to see them in the dark.",
    assetName: "BUILDING_PENTAGON"
  },
  {
    id: "nuclear_fission",
    name: "Nuclear Fission",
    cost: 4160,
    prerequisites: ["atomic_theory", "radar"],
    row: 13,
    slot: 3,
    era: "atomic",
    description: "Splits the atom, releasing power for plants and weapons alike.",
    assetName: "BUILDING_NUCLEAR_PLANT"
  },
  {
    id: "computers",
    name: "Computers",
    cost: 4160,
    prerequisites: ["radar", "combined_arms"],
    row: 13,
    slot: 7,
    era: "atomic",
    description: "Machines that calculate faster than any person.",
    assetName: "UNIT_NUCLEAR_SUBMARINE"
  },
  {
    id: "lasers",
    name: "Lasers",
    cost: 5005,
    prerequisites: ["computers"],
    row: 14,
    slot: 7,
    era: "information",
    description: "Focused light for cutting, measuring and aiming.",
    assetName: "UNIT_MODERN_ARMOR"
  },
  {
    id: "rocketry",
    name: "Rocketry",
    cost: 4160,
    prerequisites: ["radar"],
    row: 13,
    slot: 5,
    era: "atomic",
    description: "Liquid-fueled rockets that reach beyond the atmosphere.",
    assetName: "BUILDING_APOLLO_PROGRAM"
  },
  {
    id: "globalization",
    name: "Globalization",
    cost: 5720,
    prerequisites: ["telecommunications"],
    row: 15,
    slot: 1,
    era: "information",
    description: "Trade, travel and communication knit the world into one market.",
    assetName: "BUILDING_UNITED_NATIONS",
    notes: [
      {
        text: "Gives an additional World Congress delegate for each Diplomat in a foreign capital",
        icon: "ICON_DIPLOMACY"
      }
    ]
  },
  {
    id: "robotics",
    name: "Robotics",
    cost: 5005,
    prerequisites: ["computers", "rocketry"],
    row: 14,
    slot: 6,
    era: "information",
    description: "Programmable machines that do work too dull or dangerous for people.",
    assetName: "UNIT_MISSILE_CRUISER"
  },
  {
    id: "particle_physics",
    name: "Particle Physics",
    cost: 5720,
    prerequisites: ["telecommunications", "mobile_tactics", "advanced_ballistics"],
    row: 15,
    slot: 2,
    era: "information",
    description: "Probes the smallest pieces of matter with giant machines.",
    assetName: "BUILDING_SPACESHIP_FACTORY"
  },
  {
    id: "satellites",
    name: "Satellites",
    cost: 5005,
    prerequisites: ["rocketry"],
    row: 14,
    slot: 5,
    era: "information",
    description: "Machines in orbit that watch, listen and relay from above.",
    assetName: "BUILDING_APOLLO_PROGRAM",
    notes: [
      {
        text: "Automatically explores the entire map",
        icon: "ICON_MAP"
      }
    ]
  },
  {
    id: "stealth",
    name: "Stealth",
    cost: 5720,
    prerequisites: ["lasers", "robotics"],
    row: 15,
    slot: 7,
    era: "information",
    description: "Shapes and coats aircraft so radar can barely see them.",
    assetName: "UNIT_STEALTH_BOMBER"
  },
  {
    id: "advanced_ballistics",
    name: "Advanced Ballistics",
    cost: 5005,
    prerequisites: ["rocketry", "nuclear_fission"],
    row: 14,
    slot: 4,
    era: "information",
    description: "Guides rockets over thousands of miles to a chosen target.",
    assetName: "UNIT_NUCLEAR_MISSILE"
  },
  {
    id: "nanotechnology",
    name: "Nanotechnology",
    cost: 5720,
    prerequisites: ["robotics"],
    row: 15,
    slot: 6,
    era: "information",
    description: "Builds machines and materials one atom at a time.",
    assetName: "ICON_UNKNOWN"
  },
  {
    id: "nuclear_fusion",
    name: "Nuclear Fusion",
    cost: 5720,
    prerequisites: ["advanced_ballistics", "satellites", "robotics"],
    row: 15,
    slot: 5,
    era: "information",
    description: "Joins atoms together to release the energy that powers the stars.",
    assetName: "UNIT_GIANT_DEATH_ROBOT"
  },
  {
    id: "ballistics",
    name: "Ballistics",
    cost: 2015,
    prerequisites: ["flight"],
    row: 11,
    slot: 5,
    era: "modern",
    description: "Studies the flight of projectiles, improving the aim of guns and shells.",
    assetName: "ICON_UNKNOWN"
  },
  {
    id: "combined_arms",
    name: "Combined Arms",
    cost: 3315,
    prerequisites: ["combustion", "ballistics"],
    row: 12,
    slot: 7,
    era: "atomic",
    description: "Tanks, infantry and aircraft fight as a single force.",
    assetName: "ICON_UNKNOWN"
  },
  {
    id: "telecommunications",
    name: "Telecommunications",
    cost: 5005,
    prerequisites: ["ecology"],
    row: 14,
    slot: 1,
    era: "information",
    description: "Carries voice, video and data across the whole world.",
    assetName: "ICON_UNKNOWN"
  },
  {
    id: "mobile_tactics",
    name: "Mobile Tactics",
    cost: 5005,
    prerequisites: ["ecology", "nuclear_fission"],
    row: 14,
    slot: 2,
    era: "information",
    description: "Fast, flexible forces that strike where the enemy is weakest.",
    assetName: "ICON_UNKNOWN"
  },
  {
    id: "the_internet",
    name: "The Internet",
    cost: 5720,
    prerequisites: ["telecommunications"],
    row: 15,
    slot: 0,
    era: "information",
    description: "Links computers around the world into one network.",
    assetName: "ICON_UNKNOWN",
    notes: [
      {
        text: "Doubles the Tourism of all your cities",
        icon: "ICON_CULTURE"
      }
    ]
  },
  {
    id: "future_tech",
    name: "Future Tech",
    cost: 6175,
    prerequisites: ["nanotechnology", "nuclear_fusion", "stealth", "particle_physics", "globalization", "the_internet"],
    row: 16,
    slot: 4,
    era: "information",
    description: "Research beyond today's science.",
    assetName: "ICON_UNKNOWN",
    notes: [
      {
        text: "Increases score each time it is researched",
        icon: "ICON_STAR"
      }
    ]
  }
];

export const CIV_TECH_BY_ID: Record<string, CivTechDef> = Object.fromEntries(
  CIV_TECHS.map(tech => [tech.id, tech] as const)
);

export function getCivTech(id: string): CivTechDef | undefined {
  return CIV_TECH_BY_ID[id];
}
