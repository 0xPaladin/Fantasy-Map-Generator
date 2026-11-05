// Character action vocabulary and check shapes. See docs/plans/characters.md.
export const DICE = ["d4", "d6", "d8", "d10", "d12"] as const;
export type Die = (typeof DICE)[number];

export const ACTIONS = [
  "strike",
  "guard",
  "maneuver",
  "scout",
  "infiltrate",
  "survive",
  "investigate",
  "craft",
  "treat",
  "persuade",
  "deceive",
  "command"
] as const;
export type ActionId = (typeof ACTIONS)[number];

export interface ActionCheck {
  action: ActionId;
  dc?: number;
  advantage?: boolean;
  disadvantage?: boolean;
  modifiers?: number;
}

export interface ActionCheckResult {
  die: Die;
  roll: number;
  total: number;
  critical: boolean;
  complication: boolean;
  success?: boolean;
}
