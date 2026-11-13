import type { OptionsData } from "@/model/options/options-schema";
import type { Moon, Planet } from "@/model/physical/astral-system/planet";
import { Emblems } from "@/model/political/emblems-generator";
import { Provinces } from "@/model/political/provinces-generator";
import type { Culture } from "@/model/society/cultures-generator";
import type { PackedGraph } from "@/types/packed-graph";
import type { SystemOriginContext } from "@/types/planetary";
import { getSectorColor } from "@/utils/color-utils";

type CelestialBody = Planet | Moon;

/** Extract sector polity, culture, province and religion context from a parent star system burg */
export function extractSystemOriginContext(pack: PackedGraph, burgId: number): SystemOriginContext | undefined {
  if (!pack?.burgs?.[burgId]) return undefined;
  const burg = pack.burgs[burgId];
  const cell = burg.cell;
  const cultureId = burg.culture ?? 0;
  const stateId = burg.state ?? 0;
  const culture = cultureId && pack.cultures?.[cultureId] ? structuredClone(pack.cultures[cultureId]) : undefined;
  const state = stateId && pack.states?.[stateId] ? structuredClone(pack.states[stateId]) : undefined;
  const provinceId = pack.cells?.province?.[cell] ?? 0;
  const province = pack.provinces?.[provinceId] ? structuredClone(pack.provinces[provinceId]) : undefined;
  const religionId = pack.cells?.religion?.[cell] ?? 0;
  const religion = pack.religions?.[religionId] ? structuredClone(pack.religions[religionId]) : undefined;

  const minorityCultures: Culture[] = [];
  if (pack.cultures && state?.i) {
    const stateBurgs = pack.burgs.filter(b => b?.i && !b.removed && b.state === state.i && b.culture !== burg.culture);
    for (const sb of stateBurgs) {
      if (!sb.culture) continue;
      const mc = pack.cultures[sb.culture];
      if (mc && !minorityCultures.some(c => c.i === mc.i)) {
        minorityCultures.push(structuredClone(mc));
        if (minorityCultures.length >= 2) break;
      }
    }
  }

  return {
    burgId,
    burgName: burg.name || "System",
    population: burg.population || 0,
    isCapital: Boolean(burg.capital),
    port: burg.port || 0,
    worldType: (burg as { worldType?: string }).worldType,
    culture,
    minorityCultures,
    state,
    province,
    religion
  };
}

/** Pre-configure generation options to bind to sector culture, limit states, and prioritize provinces */
export function preparePlanetaryGenerationConfig(
  config: OptionsData,
  body: CelestialBody,
  originContext?: SystemOriginContext
): void {
  const culturesCount = originContext?.minorityCultures?.length ? 1 + originContext.minorityCultures.length : 1;
  config.generation.cultures.limit = culturesCount;

  if (body.HI === 5) {
    config.generation.states.limit = 0;
    config.generation.burgs.limit = 0;
  } else if (body.HI === 3 || body.HI === 4 || body.kind === "moon") {
    config.generation.states.limit = 1;
    config.generation.burgs.limit = Math.min(config.generation.burgs.limit, 12);
    config.generation.states.growthRate = 1.5;
    config.generation.states.freeBurgs = 0;
  } else {
    const allowMultipleSubStates = Boolean(originContext?.isCapital && (originContext?.population ?? 0) > 40);
    config.generation.states.limit = allowMultipleSubStates ? 2 : 1;
    config.generation.states.growthRate = 3.0;
    config.generation.states.freeBurgs = 0;
  }

  config.generation.provinces.ratio = 100;
  config.generation.religions.limit = 0;
}

/** Pre-seed locked cultures on pack before generation pipeline runs */
export function seedPlanetaryCultures(pack: PackedGraph, originContext?: SystemOriginContext): void {
  if (!originContext?.culture) return;
  const primary = originContext.culture;
  const cultures: Culture[] = [
    {
      i: 0,
      name: "Wildlands",
      base: "ENGLI",
      origins: [null],
      shield: "round",
      type: "Generic",
      tags: []
    } as Culture,
    {
      i: 1,
      lock: true,
      name: primary.name,
      base: primary.base,
      shield: primary.shield || "round",
      color: primary.color || "#4a86e8",
      type: primary.type || "Generic",
      ancestry: primary.ancestry,
      alignment: primary.alignment,
      values: primary.values,
      code: primary.code || primary.name.slice(0, 2).toUpperCase(),
      origins: [0],
      tags: primary.tags ? [...primary.tags] : []
    } as Culture
  ];

  if (originContext.minorityCultures?.length) {
    for (let idx = 0; idx < originContext.minorityCultures.length; idx++) {
      const mc = originContext.minorityCultures[idx];
      cultures.push({
        i: 2 + idx,
        lock: true,
        name: mc.name,
        base: mc.base,
        shield: mc.shield || "round",
        color: mc.color || getSectorColor(primary.color || "#4a86e8", idx + 1),
        type: mc.type || "Generic",
        ancestry: mc.ancestry,
        alignment: mc.alignment,
        values: mc.values,
        code: mc.code || mc.name.slice(0, 2).toUpperCase(),
        origins: [0],
        tags: mc.tags ? [...mc.tags] : []
      } as Culture);
    }
  }

  pack.cultures = cultures;
}

/** Post-process generated world to bind states to sector polity, elevate provinces and bind religion */
export function applySystemPolityContext(
  pack: PackedGraph,
  body: CelestialBody,
  originContext?: SystemOriginContext
): void {
  if (!originContext) return;

  if (originContext.culture && pack.cultures?.[1]) {
    const c = pack.cultures[1];
    c.name = originContext.culture.name;
    c.base = originContext.culture.base;
    c.shield = originContext.culture.shield || c.shield;
    c.color = originContext.culture.color || c.color;
    if (originContext.culture.ancestry) c.ancestry = originContext.culture.ancestry;
    if (originContext.culture.alignment) c.alignment = originContext.culture.alignment;
    if (originContext.culture.values) c.values = originContext.culture.values;
    if (originContext.culture.code) c.code = originContext.culture.code;
  }

  const sectorState = originContext.state;
  if (pack.states && pack.states.length > 1) {
    const state1 = pack.states[1];
    if (state1 && !state1.removed) {
      const sectorPolityName = sectorState?.name || originContext.burgName;
      const formName =
        sectorState?.form === "Monarchy"
          ? "Governorate"
          : sectorState?.form === "Theocracy"
            ? "Mission"
            : sectorState?.form === "Republic"
              ? "Administration"
              : "Dominion";

      const bodyName = (body as { name?: string }).name || "Colony";
      state1.name = `${sectorPolityName} Authority`;
      state1.formName = formName;
      state1.fullName = `${sectorPolityName} - ${bodyName} ${formName}`;
      if (sectorState?.color) state1.color = sectorState.color;
      if (sectorState?.coa) {
        state1.coa = Emblems.generate(sectorState.coa, 0.85, null, state1.type);
      }
    }

    for (let i = 2; i < pack.states.length; i++) {
      const subState = pack.states[i];
      if (!subState || subState.removed) continue;
      const capitalBurg = pack.burgs?.[subState.capital];
      const capName = capitalBurg?.name || `District ${i}`;
      subState.name = `${capName} Charter`;
      subState.formName = "Charter";
      subState.fullName = `${capName} Colonial Charter`;
      if (sectorState?.color) {
        subState.color = getSectorColor(sectorState.color, i - 1);
      }
      if (sectorState?.coa) {
        subState.coa = Emblems.generate(sectorState.coa, 0.7, null, subState.type);
      }
      if (subState.diplomacy && state1) {
        subState.diplomacy[1] = "Ally";
        if (state1.diplomacy) state1.diplomacy[subState.i] = "Ally";
      }
    }
  }

  if (pack.provinces && pack.provinces.length <= 1 && pack.burgs?.filter(b => b?.i && !b.removed).length >= 2) {
    Provinces.generate();
  }

  if (originContext.religion && pack.religions && pack.religions.length > 1) {
    const rel1 = pack.religions[1];
    if (rel1 && !rel1.removed) {
      rel1.name = originContext.religion.name;
      rel1.type = originContext.religion.type || "Organized";
      rel1.form = originContext.religion.form || rel1.form;
      rel1.deity = originContext.religion.deity || rel1.deity;
      rel1.color = originContext.religion.color || rel1.color;
      rel1.code = originContext.religion.code || rel1.code;
      rel1.expansion = "global";
      rel1.origins = [0];
    }
    if (pack.cells?.religion) {
      for (let cellId = 0; cellId < pack.cells.i.length; cellId++) {
        if (
          pack.cells.h[cellId] >= 20 &&
          pack.cells.culture[cellId] &&
          (!pack.cells.religion[cellId] || pack.cells.religion[cellId] === 0)
        ) {
          pack.cells.religion[cellId] = 1;
        }
      }
    }
  }
}
