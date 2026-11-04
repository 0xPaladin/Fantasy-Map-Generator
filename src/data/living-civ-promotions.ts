import type { CivPromotionDef } from "@/types/living";

/** Ported from OpenCiv's `server/config/promotions.yml`. */
export const CIV_PROMOTIONS: readonly CivPromotionDef[] = [
  {
    id: "shock_i",
    name: "Shock I",
    classes: ["melee", "gunpowder", "mounted", "armor"],
    description: "+15% Combat Strength when fighting in open terrain (no Hills, Forest or Jungle)",
    effects: {
      openTerrainPercent: 15
    }
  },
  {
    id: "shock_ii",
    name: "Shock II",
    classes: ["melee", "gunpowder", "mounted", "armor"],
    requires: ["shock_i"],
    description: "+15% Combat Strength when fighting in open terrain (no Hills, Forest or Jungle)",
    effects: {
      openTerrainPercent: 15
    }
  },
  {
    id: "shock_iii",
    name: "Shock III",
    classes: ["melee", "gunpowder", "mounted", "armor"],
    requires: ["shock_ii"],
    description: "+15% Combat Strength when fighting in open terrain (no Hills, Forest or Jungle)",
    effects: {
      openTerrainPercent: 15
    }
  },
  {
    id: "drill_i",
    name: "Drill I",
    classes: ["melee", "gunpowder", "mounted", "armor"],
    description: "+15% Combat Strength when fighting in rough terrain (Hills, Forest or Jungle)",
    effects: {
      roughTerrainPercent: 15
    }
  },
  {
    id: "drill_ii",
    name: "Drill II",
    classes: ["melee", "gunpowder", "mounted", "armor"],
    requires: ["drill_i"],
    description: "+15% Combat Strength when fighting in rough terrain (Hills, Forest or Jungle)",
    effects: {
      roughTerrainPercent: 15
    }
  },
  {
    id: "drill_iii",
    name: "Drill III",
    classes: ["melee", "gunpowder", "mounted", "armor"],
    requires: ["drill_ii"],
    description: "+15% Combat Strength when fighting in rough terrain (Hills, Forest or Jungle)",
    effects: {
      roughTerrainPercent: 15
    }
  },
  {
    id: "formation_i",
    name: "Formation I",
    classes: ["melee", "gunpowder", "mounted"],
    requires: ["shock_ii", "drill_ii"],
    description: "+33% Combat Strength against mounted units",
    effects: {
      vsClasses: {
        classes: ["mounted"],
        percent: 33
      }
    }
  },
  {
    id: "formation_ii",
    name: "Formation II",
    classes: ["melee", "gunpowder", "mounted"],
    requires: ["formation_i"],
    description: "+33% Combat Strength against mounted units",
    effects: {
      vsClasses: {
        classes: ["mounted"],
        percent: 33
      }
    }
  },
  {
    id: "amphibious",
    name: "Amphibious",
    classes: ["melee", "gunpowder"],
    requires: ["shock_i", "drill_i"],
    description: "No combat penalty for attacking across a river or from the sea",
    effects: {
      amphibious: true
    }
  },
  {
    id: "siege",
    name: "Siege",
    classes: ["melee", "gunpowder"],
    requires: ["shock_ii", "drill_ii"],
    description: "+50% Combat Strength against cities",
    effects: {
      vsCityPercent: 50
    }
  },
  {
    id: "charge",
    name: "Charge",
    classes: ["mounted"],
    requires: ["shock_ii", "drill_ii"],
    description: "+33% Combat Strength against wounded units",
    effects: {
      vsWoundedPercent: 33
    }
  },
  {
    id: "blitz",
    name: "Blitz",
    classes: ["melee", "gunpowder", "mounted", "armor"],
    requires: ["shock_iii", "drill_iii"],
    description: "1 additional attack per turn",
    effects: {
      extraAttacks: 1
    }
  },
  {
    id: "woodsman",
    name: "Woodsman",
    classes: ["melee", "gunpowder"],
    requires: ["shock_iii", "drill_iii"],
    description: "Double movement through Forest and Jungle",
    effects: {
      woodsman: true
    }
  },
  {
    id: "ambush_i",
    name: "Ambush I",
    classes: ["gunpowder", "fighter", "bomber", "helicopter"],
    requires: ["shock_ii", "drill_ii", "interception_i", "dogfighting_i", "siege_i", "bombardment_i"],
    requiresByClass: {
      helicopter: []
    },
    description: "+25% Combat Strength against armored units",
    effects: {
      vsClasses: {
        classes: ["armor"],
        percent: 25
      }
    }
  },
  {
    id: "ambush_ii",
    name: "Ambush II",
    classes: ["gunpowder", "fighter", "bomber", "helicopter"],
    requires: ["ambush_i"],
    description: "+25% Combat Strength against armored units",
    effects: {
      vsClasses: {
        classes: ["armor"],
        percent: 25
      }
    }
  },
  {
    id: "medic",
    name: "Medic",
    classes: ["melee", "gunpowder", "mounted", "recon"],
    requires: ["shock_i", "drill_i", "scouting_ii", "survivalism_ii"],
    description: "This unit and every unit next to it heal 5 extra HP per turn",
    effects: {
      healAdjacent: 5
    }
  },
  {
    id: "medic_ii",
    name: "Medic II",
    classes: ["melee", "gunpowder", "mounted", "recon"],
    requires: ["medic"],
    description:
      "This unit and every unit next to it heal 5 more HP per turn, and this unit heals 5 extra HP outside friendly territory",
    effects: {
      healAdjacent: 5,
      healOutsideFriendly: 5
    }
  },
  {
    id: "march",
    name: "March",
    classes: ["melee", "gunpowder", "mounted", "ranged", "siege"],
    requires: ["shock_iii", "drill_iii", "accuracy_ii", "barrage_ii"],
    description: "Heals every turn, even after moving or fighting",
    effects: {
      healEveryTurn: true
    }
  },
  {
    id: "repair",
    name: "Repair",
    classes: ["armor", "helicopter"],
    requires: ["shock_iii", "drill_iii", "ambush_ii", "mobility_ii"],
    description: "Heals every turn, even after moving or fighting",
    effects: {
      healEveryTurn: true
    }
  },
  {
    id: "cover_i",
    name: "Cover I",
    classes: ["melee", "gunpowder", "ranged", "siege"],
    description: "+25% defense against ranged attacks",
    effects: {
      rangedDefensePercent: 25
    }
  },
  {
    id: "cover_ii",
    name: "Cover II",
    classes: ["melee", "gunpowder", "ranged", "siege"],
    requires: ["cover_i"],
    description: "+25% defense against ranged attacks",
    effects: {
      rangedDefensePercent: 25
    }
  },
  {
    id: "accuracy_i",
    name: "Accuracy I",
    classes: ["ranged", "siege"],
    description: "+15% Ranged Combat Strength against units in open terrain (no Hills, Forest or Jungle)",
    effects: {
      rangedOpenPercent: 15
    }
  },
  {
    id: "accuracy_ii",
    name: "Accuracy II",
    classes: ["ranged", "siege"],
    requires: ["accuracy_i"],
    description: "+15% Ranged Combat Strength against units in open terrain (no Hills, Forest or Jungle)",
    effects: {
      rangedOpenPercent: 15
    }
  },
  {
    id: "accuracy_iii",
    name: "Accuracy III",
    classes: ["ranged", "siege"],
    requires: ["accuracy_ii"],
    description: "+15% Ranged Combat Strength against units in open terrain (no Hills, Forest or Jungle)",
    effects: {
      rangedOpenPercent: 15
    }
  },
  {
    id: "barrage_i",
    name: "Barrage I",
    classes: ["ranged", "siege"],
    description: "+15% Ranged Combat Strength against units in rough terrain (Hills, Forest or Jungle)",
    effects: {
      rangedRoughPercent: 15
    }
  },
  {
    id: "barrage_ii",
    name: "Barrage II",
    classes: ["ranged", "siege"],
    requires: ["barrage_i"],
    description: "+15% Ranged Combat Strength against units in rough terrain (Hills, Forest or Jungle)",
    effects: {
      rangedRoughPercent: 15
    }
  },
  {
    id: "barrage_iii",
    name: "Barrage III",
    classes: ["ranged", "siege"],
    requires: ["barrage_ii"],
    description: "+15% Ranged Combat Strength against units in rough terrain (Hills, Forest or Jungle)",
    effects: {
      rangedRoughPercent: 15
    }
  },
  {
    id: "volley",
    name: "Volley",
    classes: ["ranged"],
    requires: ["accuracy_i", "barrage_i"],
    description: "+50% Combat Strength against fortified units and cities",
    effects: {
      vsCityPercent: 50,
      vsFortifiedPercent: 50
    }
  },
  {
    id: "range",
    name: "Range",
    classes: ["ranged", "siege", "naval_ranged"],
    requires: ["accuracy_iii", "barrage_iii", "targeting_ii", "bombardment_ii"],
    description: "+1 Range",
    effects: {
      range: 1
    }
  },
  {
    id: "indirect_fire",
    name: "Indirect Fire",
    classes: ["ranged", "siege", "naval_ranged"],
    requires: ["accuracy_iii", "barrage_iii", "targeting_ii", "bombardment_ii"],
    description: "Ranged attacks may be made over obstacles, at anything your units can see",
    effects: {
      indirectFire: true
    }
  },
  {
    id: "logistics",
    name: "Logistics",
    classes: ["ranged", "naval_ranged", "naval_melee", "submarine", "fighter", "bomber", "helicopter"],
    requires: [
      "accuracy_iii",
      "barrage_iii",
      "targeting_iii",
      "bombardment_iii",
      "coastal_raider_iii",
      "boarding_party_iii",
      "wolfpack_iii",
      "siege_iii",
      "ambush_ii",
      "mobility_ii"
    ],
    description: "1 additional attack per turn",
    effects: {
      extraAttacks: 1
    }
  },
  {
    id: "scouting_i",
    name: "Scouting I",
    classes: ["recon"],
    description: "+1 Sight",
    effects: {
      sight: 1
    }
  },
  {
    id: "scouting_ii",
    name: "Scouting II",
    classes: ["recon"],
    requires: ["scouting_i"],
    description: "+1 Sight",
    effects: {
      sight: 1
    }
  },
  {
    id: "scouting_iii",
    name: "Scouting III",
    classes: ["recon"],
    requires: ["scouting_ii"],
    description: "+1 Movement",
    effects: {
      movement: 1
    }
  },
  {
    id: "survivalism_i",
    name: "Survivalism I",
    classes: ["recon"],
    description: "+5 HP healed per turn outside friendly territory, and +25% defense",
    effects: {
      defensePercent: 25,
      healOutsideFriendly: 5
    }
  },
  {
    id: "survivalism_ii",
    name: "Survivalism II",
    classes: ["recon"],
    requires: ["survivalism_i"],
    description: "+5 HP healed per turn outside friendly territory, and +25% defense",
    effects: {
      defensePercent: 25,
      healOutsideFriendly: 5
    }
  },
  {
    id: "survivalism_iii",
    name: "Survivalism III",
    classes: ["recon"],
    requires: ["survivalism_ii"],
    description: "Heals every turn even after moving or fighting, and withdraws from melee attacks",
    effects: {
      healEveryTurn: true,
      withdraw: true
    }
  },
  {
    id: "sentry",
    name: "Sentry",
    classes: ["mounted", "naval_melee", "naval_ranged", "recon"],
    requires: ["shock_i", "drill_i", "targeting_i", "bombardment_i", "coastal_raider_i", "boarding_party_i"],
    requiresByClass: {
      recon: ["scouting_i"]
    },
    description: "+1 Sight",
    effects: {
      sight: 1
    }
  },
  {
    id: "mobility",
    name: "Mobility",
    classes: ["mounted", "naval_ranged", "naval_melee", "helicopter"],
    requires: ["shock_iii", "drill_iii", "targeting_i", "bombardment_i", "coastal_raider_i", "boarding_party_i"],
    requiresByClass: {
      helicopter: []
    },
    description: "+1 Movement",
    effects: {
      movement: 1
    }
  },
  {
    id: "mobility_ii",
    name: "Mobility II",
    classes: ["helicopter"],
    requires: ["mobility"],
    description: "+1 Movement",
    effects: {
      movement: 1
    }
  },
  {
    id: "targeting_i",
    name: "Targeting I",
    classes: ["naval_ranged", "fighter", "bomber"],
    requiresByClass: {
      fighter: ["interception_i", "dogfighting_i"],
      bomber: ["siege_i", "bombardment_i"]
    },
    description: "+15% Combat Strength against naval units",
    effects: {
      vsNavalPercent: 15
    }
  },
  {
    id: "targeting_ii",
    name: "Targeting II",
    classes: ["naval_ranged", "fighter", "bomber"],
    requires: ["targeting_i"],
    description: "+15% Combat Strength against naval units",
    effects: {
      vsNavalPercent: 15
    }
  },
  {
    id: "targeting_iii",
    name: "Targeting III",
    classes: ["naval_ranged"],
    requires: ["targeting_ii"],
    description: "+15% Combat Strength against naval units",
    effects: {
      vsNavalPercent: 15
    }
  },
  {
    id: "bombardment_i",
    name: "Bombardment I",
    classes: ["naval_ranged", "bomber"],
    description: "+33% Combat Strength against land units",
    effects: {
      vsLandPercent: 33
    }
  },
  {
    id: "bombardment_ii",
    name: "Bombardment II",
    classes: ["naval_ranged", "bomber"],
    requires: ["bombardment_i"],
    description: "+33% Combat Strength against land units",
    effects: {
      vsLandPercent: 33
    }
  },
  {
    id: "bombardment_iii",
    name: "Bombardment III",
    classes: ["naval_ranged", "bomber"],
    requires: ["bombardment_ii"],
    description: "+34% Combat Strength against land units",
    effects: {
      vsLandPercent: 34
    }
  },
  {
    id: "boarding_party_i",
    name: "Boarding Party I",
    classes: ["naval_melee"],
    description: "+15% Combat Strength in melee attacks against naval units",
    effects: {
      navalMeleePercent: 15
    }
  },
  {
    id: "boarding_party_ii",
    name: "Boarding Party II",
    classes: ["naval_melee"],
    requires: ["boarding_party_i"],
    description: "+15% Combat Strength in melee attacks against naval units",
    effects: {
      navalMeleePercent: 15
    }
  },
  {
    id: "boarding_party_iii",
    name: "Boarding Party III",
    classes: ["naval_melee"],
    requires: ["boarding_party_ii"],
    description: "+15% Combat Strength in melee attacks against naval units",
    effects: {
      navalMeleePercent: 15
    }
  },
  {
    id: "coastal_raider_i",
    name: "Coastal Raider I",
    classes: ["naval_melee"],
    description: "+20% Combat Strength when attacking cities",
    effects: {
      vsCityPercent: 20
    },
    notYet: ["Steals Gold equal to 33% of the damage dealt to a city"]
  },
  {
    id: "coastal_raider_ii",
    name: "Coastal Raider II",
    classes: ["naval_melee"],
    requires: ["coastal_raider_i"],
    description: "+20% Combat Strength when attacking cities",
    effects: {
      vsCityPercent: 20
    },
    notYet: ["Steals Gold equal to 33% of the damage dealt to a city"]
  },
  {
    id: "coastal_raider_iii",
    name: "Coastal Raider III",
    classes: ["naval_melee"],
    requires: ["coastal_raider_ii"],
    description: "+20% Combat Strength when attacking cities",
    effects: {
      vsCityPercent: 20
    },
    notYet: ["Steals Gold equal to 34% of the damage dealt to a city"]
  },
  {
    id: "wolfpack_i",
    name: "Wolfpack I",
    classes: ["submarine"],
    description: "+25% Combat Strength when attacking",
    effects: {
      attackPercent: 25
    }
  },
  {
    id: "wolfpack_ii",
    name: "Wolfpack II",
    classes: ["submarine"],
    requires: ["wolfpack_i"],
    description: "+25% Combat Strength when attacking",
    effects: {
      attackPercent: 25
    }
  },
  {
    id: "wolfpack_iii",
    name: "Wolfpack III",
    classes: ["submarine"],
    requires: ["wolfpack_ii"],
    description: "+25% Combat Strength when attacking",
    effects: {
      attackPercent: 25
    }
  },
  {
    id: "supply",
    name: "Supply",
    classes: ["naval_ranged", "naval_melee", "submarine", "carrier"],
    requires: [
      "targeting_ii",
      "bombardment_ii",
      "coastal_raider_ii",
      "boarding_party_ii",
      "wolfpack_ii",
      "flight_deck_ii",
      "armor_plating_ii"
    ],
    description: "Heals 15 HP per turn outside friendly territory",
    effects: {
      healOutsideFriendly: 5
    }
  },
  {
    id: "armor_plating_i",
    name: "Armor Plating I",
    classes: ["carrier"],
    description: "+25% defense",
    effects: {
      defensePercent: 25
    }
  },
  {
    id: "armor_plating_ii",
    name: "Armor Plating II",
    classes: ["carrier"],
    requires: ["armor_plating_i"],
    description: "+25% defense",
    effects: {
      defensePercent: 25
    }
  },
  {
    id: "armor_plating_iii",
    name: "Armor Plating III",
    classes: ["carrier"],
    requires: ["armor_plating_ii"],
    description: "+25% defense",
    effects: {
      defensePercent: 25
    }
  },
  {
    id: "flight_deck_i",
    name: "Flight Deck I",
    classes: ["carrier"],
    description: "Can carry 1 extra air unit",
    notYet: ["Carrying air units"]
  },
  {
    id: "flight_deck_ii",
    name: "Flight Deck II",
    classes: ["carrier"],
    requires: ["flight_deck_i"],
    description: "Can carry 1 extra air unit",
    notYet: ["Carrying air units"]
  },
  {
    id: "flight_deck_iii",
    name: "Flight Deck III",
    classes: ["carrier"],
    requires: ["flight_deck_ii"],
    description: "Can carry 1 extra air unit",
    notYet: ["Carrying air units"]
  },
  {
    id: "interception_i",
    name: "Interception I",
    classes: ["fighter"],
    description: "+33% Combat Strength when intercepting enemy aircraft",
    notYet: ["Interception"]
  },
  {
    id: "interception_ii",
    name: "Interception II",
    classes: ["fighter"],
    requires: ["interception_i"],
    description: "+33% Combat Strength when intercepting enemy aircraft",
    notYet: ["Interception"]
  },
  {
    id: "interception_iii",
    name: "Interception III",
    classes: ["fighter"],
    requires: ["interception_ii"],
    description: "+34% Combat Strength when intercepting enemy aircraft",
    notYet: ["Interception"]
  },
  {
    id: "dogfighting_i",
    name: "Dogfighting I",
    classes: ["fighter"],
    description: "+33% Combat Strength when performing an Air Sweep",
    notYet: ["Air Sweeps"]
  },
  {
    id: "dogfighting_ii",
    name: "Dogfighting II",
    classes: ["fighter"],
    requires: ["dogfighting_i"],
    description: "+33% Combat Strength when performing an Air Sweep",
    notYet: ["Air Sweeps"]
  },
  {
    id: "dogfighting_iii",
    name: "Dogfighting III",
    classes: ["fighter"],
    requires: ["dogfighting_ii"],
    description: "+34% Combat Strength when performing an Air Sweep",
    notYet: ["Air Sweeps"]
  },
  {
    id: "siege_i",
    name: "Siege I",
    classes: ["bomber"],
    description: "+33% Combat Strength against cities",
    effects: {
      vsCityPercent: 33
    }
  },
  {
    id: "siege_ii",
    name: "Siege II",
    classes: ["bomber"],
    requires: ["siege_i"],
    description: "+33% Combat Strength against cities",
    effects: {
      vsCityPercent: 33
    }
  },
  {
    id: "siege_iii",
    name: "Siege III",
    classes: ["bomber"],
    requires: ["siege_ii"],
    description: "+34% Combat Strength against cities",
    effects: {
      vsCityPercent: 34
    }
  },
  {
    id: "air_targeting_i",
    name: "Air Targeting I",
    classes: ["fighter", "bomber"],
    requires: ["interception_i", "dogfighting_i", "siege_i", "bombardment_i"],
    description: "+33% Combat Strength against naval units",
    effects: {
      vsNavalPercent: 33
    }
  },
  {
    id: "air_targeting_ii",
    name: "Air Targeting II",
    classes: ["fighter", "bomber"],
    requires: ["air_targeting_i"],
    description: "+33% Combat Strength against naval units",
    effects: {
      vsNavalPercent: 33
    }
  },
  {
    id: "air_repair",
    name: "Air Repair",
    classes: ["fighter", "bomber"],
    requires: ["interception_ii", "dogfighting_ii", "siege_ii", "bombardment_ii"],
    description: "Heals every turn, even after an action",
    effects: {
      healEveryTurn: true
    }
  },
  {
    id: "range_air",
    name: "Range (Air)",
    displayName: "Range",
    classes: ["fighter", "bomber"],
    requires: ["interception_i", "dogfighting_i", "siege_i", "bombardment_i"],
    description: "+2 operational range",
    notYet: ["Operational range"]
  },
  {
    id: "evasion",
    name: "Evasion",
    classes: ["bomber"],
    requires: ["siege_ii", "bombardment_ii"],
    description: "Takes 50% less damage from interception",
    notYet: ["Interception"]
  },
  {
    id: "sortie",
    name: "Sortie",
    classes: ["fighter"],
    requires: ["interception_ii", "dogfighting_ii"],
    description: "1 extra interception per turn",
    notYet: ["Interception"]
  },
  {
    id: "heal_instantly",
    name: "Heal Instantly",
    classes: ["any"],
    description: "Heals 50 HP, using up this promotion",
    effects: {
      healInstantly: 50
    }
  }
];

export const CIV_PROMOTION_BY_ID: Record<string, CivPromotionDef> = Object.fromEntries(
  CIV_PROMOTIONS.map(promotion => [promotion.id, promotion] as const)
);

export function getCivPromotion(id: string): CivPromotionDef | undefined {
  return CIV_PROMOTION_BY_ID[id];
}
