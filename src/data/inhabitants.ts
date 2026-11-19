// Shared top-level inhabitant groups for generated site profiles

export type InhabitantGroupId =
  | "humans"
  | "humanoids"
  | "beasts"
  | "monsters"
  | "undead"
  | "constructs"
  | "outsiders"
  | "fey"
  | "plants"
  | "vermin";

export interface InhabitantGroup {
  id: InhabitantGroupId;
  label: string;
}

export const INHABITANT_GROUPS: readonly InhabitantGroup[] = [
  { id: "humans", label: "Humans" },
  { id: "humanoids", label: "Humanoids" },
  { id: "beasts", label: "Beasts" },
  { id: "monsters", label: "Monsters" },
  { id: "undead", label: "Undead" },
  { id: "constructs", label: "Constructs" },
  { id: "outsiders", label: "Outsiders" },
  { id: "fey", label: "Fey & spirits" },
  { id: "plants", label: "Plants & fungi" },
  { id: "vermin", label: "Vermin & swarms" }
];

export const INHABITANT_RELATIONS = [
  "hostile",
  "uneasy truce",
  "master and servants",
  "predator and prey",
  "competing for the same resource",
  "unaware of each other"
] as const;
