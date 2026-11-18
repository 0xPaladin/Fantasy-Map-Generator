// The seven schemes a villain mastermind can pursue, and the step orders that compile them.
import type { MastermindPool, SchemeGoalId, SchemeVerb } from "@/types/schemes";

export interface SchemeTemplateDef {
  id: string;
  label: string;
  /** gather, weaken, channel, finale — 8 to 12 verbs */
  steps: readonly SchemeVerb[];
}

export interface SchemeGoalDef {
  id: SchemeGoalId;
  label: string;
  description: string;
  /** the pools that naturally reach for this goal */
  pools: readonly MastermindPool[];
  relicKinds: readonly string[];
  templates: readonly SchemeTemplateDef[];
}

export const SCHEME_GOALS: readonly SchemeGoalDef[] = [
  {
    id: "divine_ascension",
    label: "Divine Ascension",
    description: "Become a god in the flesh: a new faith, or an old one taken from its deity.",
    pools: ["living_god", "religious"],
    relicKinds: ["crown", "scepter", "idol", "chalice"],
    templates: [
      {
        id: "holy_crusade",
        label: "Holy Crusade",
        steps: [
          "research_lore",
          "seize_relic",
          "build",
          "convert",
          "conquer",
          "convert",
          "assassinate",
          "perform_ritual"
        ]
      },
      {
        id: "silent_schism",
        label: "Silent Schism",
        steps: [
          "infiltrate",
          "corrupt_official",
          "seize_relic",
          "convert",
          "assassinate",
          "corrupt_official",
          "build",
          "convert",
          "perform_ritual"
        ]
      }
    ]
  },
  {
    id: "undying",
    label: "Undying",
    description: "Put death aside: a phylactery, a deathless court, an age without end.",
    pools: ["living_god", "wild", "faction"],
    relicKinds: ["phylactery", "skull", "tome"],
    templates: [
      {
        id: "phylactery",
        label: "The Phylactery",
        steps: [
          "research_lore",
          "seize_relic",
          "seize_relic",
          "build",
          "occupy_site",
          "assassinate",
          "perform_ritual",
          "assassinate",
          "perform_ritual"
        ]
      },
      {
        id: "deathless_court",
        label: "Deathless Court",
        steps: [
          "occupy_site",
          "research_lore",
          "seize_relic",
          "convert",
          "build",
          "assassinate",
          "corrupt_official",
          "perform_ritual"
        ]
      }
    ]
  },
  {
    id: "universal_empire",
    label: "Universal Empire",
    description: "One crown over all: absorb the neighbours, or restore a realm the world forgot.",
    pools: ["crowned", "wild"],
    relicKinds: ["crown", "banner", "blade", "scepter"],
    templates: [
      {
        id: "sword_and_crown",
        label: "Sword and Crown",
        steps: [
          "build",
          "engineer_war",
          "assassinate",
          "conquer",
          "conquer",
          "corrupt_official",
          "engineer_war",
          "conquer"
        ]
      },
      {
        id: "restored_realm",
        label: "The Restored Realm",
        steps: [
          "research_lore",
          "seize_relic",
          "build",
          "corrupt_official",
          "engineer_war",
          "conquer",
          "conquer",
          "conquer"
        ]
      }
    ]
  },
  {
    id: "extinguish_faith",
    label: "Extinguish the Faith",
    description: "Leave a rival religion without a single province that still prays to it.",
    pools: ["religious", "crowned"],
    relicKinds: ["tome", "idol", "mask", "chalice"],
    templates: [
      {
        id: "holy_war",
        label: "Holy War",
        steps: ["engineer_war", "conquer", "convert", "assassinate", "build", "conquer", "convert", "perform_ritual"]
      },
      {
        id: "silent_heresy",
        label: "Silent Heresy",
        steps: [
          "infiltrate",
          "corrupt_official",
          "assassinate",
          "convert",
          "engineer_war",
          "convert",
          "assassinate",
          "perform_ritual"
        ]
      }
    ]
  },
  {
    id: "usurp_throne",
    label: "Usurp the Throne",
    description: "A specific crown changes head: the heirs removed, the court bought, the ruler killed.",
    pools: ["crowned", "faction"],
    relicKinds: ["signet", "crown", "blade"],
    templates: [
      {
        id: "knife_in_the_dark",
        label: "Knife in the Dark",
        steps: [
          "infiltrate",
          "corrupt_official",
          "assassinate",
          "engineer_war",
          "assassinate",
          "build",
          "corrupt_official",
          "assassinate"
        ]
      },
      {
        id: "court_of_shadows",
        label: "Court of Shadows",
        steps: [
          "research_lore",
          "seize_relic",
          "infiltrate",
          "corrupt_official",
          "assassinate",
          "engineer_war",
          "corrupt_official",
          "assassinate"
        ]
      }
    ]
  },
  {
    id: "puppeteer",
    label: "The Puppeteer",
    description: "Rule without a crown: lever rulers into puppets and let their own states do the work.",
    pools: ["faction", "wild"],
    relicKinds: ["ledger", "ring", "mask"],
    templates: [
      {
        id: "web_of_debt",
        label: "Web of Debt",
        steps: [
          "infiltrate",
          "corrupt_official",
          "corrupt_official",
          "engineer_war",
          "seize_relic",
          "corrupt_official",
          "assassinate",
          "corrupt_official"
        ]
      },
      {
        id: "shadow_court",
        label: "The Shadow Court",
        steps: [
          "infiltrate",
          "research_lore",
          "seize_relic",
          "corrupt_official",
          "assassinate",
          "corrupt_official",
          "engineer_war",
          "corrupt_official"
        ]
      }
    ]
  },
  {
    id: "unseal_doom",
    label: "Unseal the Doom",
    description: "Break the old seals: a blight, a plague, or an age of ruin given a door.",
    pools: ["wild", "religious"],
    relicKinds: ["seal", "key", "orb"],
    templates: [
      {
        id: "three_seals",
        label: "The Three Seals",
        steps: [
          "research_lore",
          "seize_relic",
          "seize_relic",
          "seize_relic",
          "occupy_site",
          "convert",
          "perform_ritual",
          "breach_seal"
        ]
      },
      {
        id: "the_long_breach",
        label: "The Long Breach",
        steps: [
          "infiltrate",
          "corrupt_official",
          "seize_relic",
          "build",
          "occupy_site",
          "assassinate",
          "perform_ritual",
          "breach_seal"
        ]
      }
    ]
  }
];

export const SCHEME_GOAL_BY_ID = Object.fromEntries(SCHEME_GOALS.map(goal => [goal.id, goal])) as Record<
  SchemeGoalId,
  SchemeGoalDef
>;

export const SCHEME_VERB_LABELS: Record<SchemeVerb, string> = {
  seize_relic: "Seize a relic",
  assassinate: "Assassinate",
  conquer: "Conquer",
  occupy_site: "Occupy a site",
  perform_ritual: "Perform a ritual",
  convert: "Convert the faith",
  corrupt_official: "Corrupt an official",
  engineer_war: "Engineer a war",
  infiltrate: "Infiltrate",
  build: "Build",
  research_lore: "Research lore",
  breach_seal: "Breach the seal"
};
