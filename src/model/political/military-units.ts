import { ASTRAL_GOODS_DATA } from "@/data/astral-goods";
import { GOODS_DATA } from "@/data/goods";
import { Icons } from "@/model/icons";
import type { MilitaryUnit } from "@/types/military";

export const ASTRAL_FLEET_UNIT_NAMES = new Set(["strike_wings", "cruiser_squadrons", "capital_ships", "void_fleets"]);

export function getDefaultMilitaryUnits(): MilitaryUnit[] {
  const units = [
    {
      icon: "🪓",
      name: "levies",
      rural: 0,
      urban: 0,
      crew: 1,
      power: 0.5,
      type: "levies",
      separate: 0
    },
    {
      icon: "⚔️",
      name: "infantry",
      rural: 0.25,
      urban: 0.2,
      crew: 1,
      power: 1,
      type: "melee",
      separate: 0,
      goods: ["Arms"]
    },
    {
      icon: "🏹",
      name: "archers",
      rural: 0.12,
      urban: 0.2,
      crew: 1,
      power: 1,
      type: "ranged",
      separate: 0,
      goods: ["Arms"]
    },
    {
      icon: "🐴",
      name: "cavalry",
      rural: 0.12,
      urban: 0.03,
      crew: 1,
      power: 2,
      type: "mounted",
      separate: 0,
      goods: ["Horses", "Camels", "Harnesses"]
    },
    {
      icon: "💣",
      name: "artillery",
      rural: 0,
      urban: 0.03,
      crew: 8,
      power: 12,
      type: "machinery",
      separate: 0,
      goods: ["Artillery", "Gunpowder"]
    },
    {
      icon: "🌊",
      name: "fleet",
      rural: 0,
      urban: 0.015,
      crew: 100,
      power: 50,
      type: "naval",
      separate: 1,
      goods: ["Boats"]
    }
  ];
  const goodId = (name: string) => GOODS_DATA.findIndex(good => good.name === name) + 1; // default goods' ids
  return units.map(
    ({ goods, ...unit }): MilitaryUnit => ({
      ...unit,
      icon: Icons.glyph(unit.icon),
      ...(goods && { goods: goods.map(goodId) })
    })
  );
}

export function getAstralMilitaryUnits(): MilitaryUnit[] {
  const units = [
    {
      icon: "🛡️",
      name: "militia",
      rural: 0,
      urban: 0,
      crew: 1,
      power: 0.5,
      type: "levies",
      separate: 0
    },
    {
      icon: "⚡",
      name: "marines",
      rural: 0.1,
      urban: 0.12,
      crew: 1,
      power: 1.5,
      type: "melee",
      separate: 0,
      goods: ["Small Arms, Projectile", "Small Arms, Energy", "Small Arms, Pretech"]
    },
    {
      icon: "🔫",
      name: "garrison",
      rural: 0.1,
      urban: 0.14,
      crew: 1,
      power: 1.5,
      type: "ranged",
      separate: 0,
      goods: ["Small Arms, Projectile", "Small Arms, Energy", "Small Arms, Pretech"]
    },
    {
      icon: "🛸",
      name: "strike_wings",
      rural: 0.03,
      urban: 0.08,
      crew: 6,
      power: 8,
      type: "mounted",
      separate: 1,
      goods: ["Parts, Starship Maintenance", "Small Arms, Energy"]
    },
    {
      icon: "🛰️",
      name: "cruiser_squadrons",
      rural: 0,
      urban: 0.05,
      crew: 40,
      power: 35,
      type: "machinery",
      separate: 1,
      goods: ["Parts, Starship Maintenance", "Small Arms, Pretech", "Esoteric Circuitry & VI Cores"]
    },
    {
      icon: "🪐",
      name: "capital_ships",
      rural: 0,
      urban: 0.025,
      crew: 120,
      power: 90,
      type: "armored",
      separate: 1,
      goods: ["Parts, Starship Maintenance", "Esoteric Circuitry & VI Cores", "Matter Compiler Matrix"]
    },
    {
      icon: "🚀",
      name: "void_fleets",
      rural: 0,
      urban: 0.03,
      crew: 100,
      power: 75,
      type: "naval",
      separate: 1,
      goods: ["Parts, Starship Maintenance", "Esoteric Circuitry & VI Cores", "Fusion Plants"]
    }
  ];
  const goodId = (name: string) => ASTRAL_GOODS_DATA.findIndex(good => good.name === name) + 1;
  return units.map(
    ({ goods, ...unit }): MilitaryUnit => ({
      ...unit,
      icon: Icons.glyph(unit.icon),
      ...(goods && { goods: goods.map(goodId).filter(id => id > 0) })
    })
  );
}

export function isAstralMilitaryUnits(units?: readonly MilitaryUnit[]): boolean {
  if (!units?.length) return false;
  return units.some(u => u.name === "void_fleets" || u.name === "cruiser_squadrons" || u.name === "capital_ships");
}
