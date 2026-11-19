// Relic nouns and the places relics rest, keyed for the scheme generator.
export interface RelicKindDef {
  id: string;
  noun: string;
}

export const RELIC_KINDS: readonly RelicKindDef[] = [
  { id: "crown", noun: "Crown" },
  { id: "blade", noun: "Blade" },
  { id: "tome", noun: "Tome" },
  { id: "signet", noun: "Signet Ring" },
  { id: "orb", noun: "Orb" },
  { id: "scepter", noun: "Scepter" },
  { id: "mask", noun: "Mask" },
  { id: "chalice", noun: "Chalice" },
  { id: "banner", noun: "Banner" },
  { id: "idol", noun: "Idol" },
  { id: "skull", noun: "Skull" },
  { id: "phylactery", noun: "Phylactery" },
  { id: "seal", noun: "Seal" },
  { id: "key", noun: "Key" },
  { id: "ledger", noun: "Ledger" }
];

export const RELIC_KIND_BY_ID = Object.fromEntries(RELIC_KINDS.map(kind => [kind.id, kind])) as Record<
  string,
  RelicKindDef
>;

/** Marker types a relic may rest at, per goal; `default` catches the rest. */
export const RELIC_SITES: Readonly<Record<string, readonly string[]>> = {
  default: ["ruins", "dungeons", "battlefields", "caves", "disturbed-burials"],
  divine_ascension: ["ruins", "sacred-mountains", "sacred-forests", "dungeons"],
  undying: ["necropolises", "disturbed-burials", "ruins"],
  unseal_doom: ["rifts", "portals", "dungeons", "caves"]
};
