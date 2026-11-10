// How a figure's traits lean its polity towards war, works, faith or cruelty.
// A leaf module: the economy hooks read it without pulling in the Living generator.

import type { Alignment } from "@/data/culture-traits";

export interface FigureBias {
  martial: number;
  civic: number;
  pious: number;
  cruel: number;
}

const MARTIAL_TRAITS = ["brave", "daring", "decisive", "wrathful", "vengeful", "boastful", "reckless"];
const CIVIC_TRAITS = ["just", "diligent", "temperate", "thrifty", "methodical", "prudent"];
const PIOUS_TRAITS = ["reverent", "zealous", "faithful", "tolerant", "merciful"];
const CRUEL_TRAITS = ["cruel", "greedy", "merciless", "callous", "domineering", "paranoid", "selfish", "bigoted"];

/** Weight a ruler's traits and their culture's values towards war, works, faith or cruelty. */
export function figureBias(
  figure: { alignment?: Alignment; virtues?: string[]; vices?: string[] },
  values: readonly string[] = []
): FigureBias {
  const words = new Set([...(figure.virtues ?? []), ...(figure.vices ?? [])]);
  const held = new Set(values);
  const bias: FigureBias = { martial: 0.1, civic: 0.1, pious: 0.1, cruel: 0 };

  const add = (key: keyof FigureBias, list: string[], cultural: string[]) => {
    for (const word of list) if (words.has(word)) bias[key] += 0.12;
    for (const value of cultural) if (held.has(value)) bias[key] += 0.1;
  };

  add("martial", MARTIAL_TRAITS, ["conflict", "power", "subjugation", "hatred"]);
  add("civic", CIVIC_TRAITS, ["investment", "advancement", "knowledge", "balance"]);
  add("pious", PIOUS_TRAITS, ["order", "honor", "loyalty", "truth"]);
  add("cruel", CRUEL_TRAITS, ["greed", "control", "subjugation"]);

  if (figure.alignment === "evil") {
    bias.martial += 0.15;
    bias.cruel += 0.15;
  } else if (figure.alignment === "chaotic") {
    bias.martial += 0.1;
  } else if (figure.alignment === "lawful") {
    bias.civic += 0.1;
  } else if (figure.alignment === "good") {
    bias.civic += 0.05;
    bias.pious += 0.05;
  }

  for (const key of ["martial", "civic", "pious", "cruel"] as const) {
    bias[key] = Math.min(0.8, Math.round(bias[key] * 100) / 100);
  }
  return bias;
}
