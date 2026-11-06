// The colonized solar system orchestrator: it wraps the astral-system astrophysics generator,
// keeps one CelestialBody record per planet and moon, and swaps FMG's ambient world globals
// between bodies via switchBody(). Every body's surface stays a pure FMG map, so saving a
// .map file on Luna works exactly like on Earth. See docs/plans/solar-system-colonization.md.
import { presetAstro, SOL_SYSTEM_PRESET, type SolPresetBody } from "@/data/sol-system-preset";
import { GenerationPipeline } from "@/model/generation-pipeline";
import type { OptionsData } from "@/model/options/options-schema";
import type { Moon, Planet } from "@/model/physical/astral-system/planet";
import { createRng } from "@/model/physical/astral-system/rng";
import type { System } from "@/model/physical/astral-system/system";
import { type GenerateSystemOptions, generateSystem } from "@/model/physical/astral-system/system";
import { applyPlanetaryOptions, resolveArchetype } from "@/model/physical/planetary-profile";
import type { GridGraph } from "@/types/grid-graph";
import type { PackedGraph } from "@/types/packed-graph";
import { ARCHETYPE_HEIGHTMAP_TEMPLATES, type PlanetaryArchetype } from "@/types/planetary";
import type { StylesData } from "@/types/styles";

export interface WorldSnapshot {
  grid: GridGraph;
  pack: PackedGraph;
  options: OptionsData;
  styles: StylesData;
  seed: string;
}

export interface CelestialBody {
  id: string; // e.g. "planet-2", "planet-2-moon-0"
  name: string; // e.g. "Sol III (Terra)", "Luna", "Mars", "Europa"
  kind: "planet" | "moon";
  parentId: string | null; // null for planets; the parent planet's bodyId for moons
  archetype: PlanetaryArchetype | "gas_giant";
  astro: Planet | Moon; // full astrophysics record from astral-system
  orbit: {
    semiMajorAxisAU: number; // AU for planets; planetary radii / scaled units for moons
    eccentricity: number;
    angleRad: number;
    periodDays: number;
  };
  colonizable: boolean; // true for rocky planets & major moons; false for gas giants
  materialized: boolean; // true once GenerationPipeline has built this body's snapshot
  snapshot?: WorldSnapshot; // the body's full FMG state while it is not the active world
  textureUrl?: string; // cached equirectangular dataURL for the 3D orrery (Phase 4)
}

/** name designations for procedural systems, e.g. "GL-4123 III b" */
const DESIGNATION_PREFIXES = ["GL", "HD", "KL", "TYC", "ROSS", "WOLF"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const MOON_LETTERS = "bcdefghij";
const EARTH_DENSITY = 5.51; // g/cc
const EARTH_RADIUS = 6.371; // megameters
const SOLAR_MASS_EARTH = 332946;
const AU_IN_MEGAMETERS = 149598;

const rad = (angleDeg: number) => (angleDeg * Math.PI) / 180;

class SolarSystemModule {
  bodies: CelestialBody[] = [];
  homeworldId: string | null = null;
  activeBodyId: string | null = null;
  seed: string | null = null;
  star: System["star"] | null = null;
  /** the FMG world the session started from, parked before the first body materialization */
  private originSnapshot: WorldSnapshot | null = null;
  /** view refresh hook; the app binds Layers.drawAll here so the model stays renderer-free */
  redrawHook: (() => void) | null = null;

  get activeBody(): CelestialBody | null {
    return this.bodies.find(body => body.id === this.activeBodyId) ?? null;
  }

  get homeworld(): CelestialBody | null {
    return this.homeworldId ? this.getBody(this.homeworldId) : null;
  }

  getBody(bodyId: string): CelestialBody | null {
    return this.bodies.find(body => body.id === bodyId) ?? null;
  }

  /** Restore the world the session started from: the map under the Sector View. */
  returnToOrigin(): void {
    if (!this.originSnapshot) return; // no body switch happened yet; the origin is what is on screen
    this.restoreGlobals(this.originSnapshot);
    this.activeBodyId = null;
  }

  /** Drop the parked origin world: for tests, or when the session's base map is regenerated */
  forgetOrigin(): void {
    this.originSnapshot = null;
  }

  /** Build a system from a procedural astral-system roll. Colonized systems center on a
   * habitable star by default — without it some seeds roll giant-poor primaries with no worlds */
  initFromSeed(seed: string, opts: GenerateSystemOptions = {}): void {
    this.adopt(generateSystem(seed, { forceHabitable: true, ...opts }), opts.systemName);
  }

  /** Build the canonical near-future Sol system preset */
  initFromPreset(): void {
    this.seed = SOL_SYSTEM_PRESET.star.name.toLowerCase();
    this.star = null;
    this.bodies = SOL_SYSTEM_PRESET.bodies.map((row, index) => this.fromPresetRow(row, index));
    this.homeworldId = this.bodies.find(body => body.archetype === "terran" && body.kind === "planet")?.id ?? null;
    this.activeBodyId = null;
  }

  /** drop every body and release the active world; snapshots are garbage-collected with them */
  reset(): void {
    this.bodies = [];
    this.homeworldId = null;
    this.activeBodyId = null;
    this.seed = null;
    this.star = null;
  }

  private adopt(system: System, customName?: string): void {
    this.reset();
    this.seed = system.seed;
    this.star = system.star;
    if (customName && this.star) this.star.primary.name = customName;

    const rng = createRng(`${system.seed}/designations`);
    const designation = customName || `${rng.choice(DESIGNATION_PREFIXES)}-${rng.int(1000, 9999)}`;

    for (const [planetIndex, planet] of system.planets.entries()) {
      const planetId = `planet-${planetIndex}`;
      const isGasGiant = planet.type === "gas giant";
      const planetName = `${designation} ${ROMAN[planetIndex] ?? planetIndex + 1}`;

      this.bodies.push({
        id: planetId,
        name: planetName,
        kind: "planet",
        parentId: null,
        archetype: isGasGiant ? "gas_giant" : resolveArchetype(planet),
        astro: planet,
        orbit: {
          semiMajorAxisAU: planet.orbit,
          eccentricity: planet.eccentricity,
          angleRad: rad(planet.pos?.angleDeg ?? 0),
          periodDays: planet.periodDays ?? this.keplerPeriodDays(planet.orbit, planet.density, planet.radius)
        },
        colonizable: !isGasGiant,
        materialized: false
      });

      for (const [moonIndex, moon] of planet.moons.entries()) {
        this.bodies.push({
          id: `${planetId}-moon-${moonIndex}`,
          name: `${planetName} ${MOON_LETTERS[moonIndex] ?? moonIndex + 1}`,
          kind: "moon",
          parentId: planetId,
          archetype: resolveArchetype(moon),
          astro: moon,
          orbit: {
            semiMajorAxisAU: moon.orbit,
            eccentricity: moon.eccentricity,
            angleRad: rad(moon.pos?.angleDeg ?? 0),
            periodDays: this.moonPeriodDays(planet, moon)
          },
          colonizable: true,
          materialized: false
        });
      }
    }

    this.homeworldId = this.pickHomeworld();
  }

  private fromPresetRow(row: SolPresetBody, index: number): CelestialBody {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      parentId: row.parentId,
      archetype: row.archetype,
      astro: presetAstro(row),
      orbit: {
        semiMajorAxisAU: row.semiMajorAxisAU,
        eccentricity: row.eccentricity,
        angleRad: rad(row.angleDeg || (index * 137.508) % 360),
        periodDays: row.periodDays
      },
      colonizable: row.colonizable,
      materialized: false
    };
  }

  /** the terran planet or moon is the homeworld; otherwise the first colonizable one */
  private pickHomeworld(): string | null {
    const terranPlanet = this.bodies.find(body => body.kind === "planet" && body.archetype === "terran");
    if (terranPlanet) return terranPlanet.id;
    const colonizablePlanet = this.bodies.find(body => body.kind === "planet" && body.colonizable);
    if (colonizablePlanet) return colonizablePlanet.id;
    const terranMoon = this.bodies.find(body => body.kind === "moon" && body.archetype === "terran");
    if (terranMoon) return terranMoon.id;
    return this.bodies.find(body => body.colonizable)?.id ?? null;
  }

  /** Kepler's third law around the primary, mirroring generateSystem */
  private keplerPeriodDays(orbitAU: number, density: number, radius: number): number {
    const massSolar = this.massSolar(density, radius) + 1; // + the primary's own ~1 solar mass
    return +(365.25 * Math.sqrt(orbitAU ** 3 / massSolar)).toFixed(1);
  }

  /** Kepler around the parent planet: mass from radius and density, semi-major axis from the moon orbit */
  private moonPeriodDays(planet: Planet, moon: Moon): number {
    const massSolar = this.massSolar(planet.density, planet.radius) / SOLAR_MASS_EARTH;
    const orbitAU = Math.max((moon.orbit * planet.radius) / AU_IN_MEGAMETERS, 1e-8);
    return +Math.max(365.25 * Math.sqrt(orbitAU ** 3 / Math.max(massSolar, 1e-12)), 0.01).toFixed(2);
  }

  private massSolar(density: number, radius: number): number {
    return (density / EARTH_DENSITY) * (radius / EARTH_RADIUS) ** 3;
  }

  /**
   * Swap the active world. The current body's globals are parked on its snapshot, an
   * unmaterialized target is generated through the pipeline, and the target's snapshot becomes
   * the ambient world. Fires `system:bodySwitched` for the view layer.
   */
  async switchBody(bodyId: string): Promise<void> {
    const target = this.getBody(bodyId);
    if (!target) throw new Error(`Celestial body ${bodyId} does not exist in this system`);
    if (!target.colonizable) throw new Error(`${target.name} has no mappable surface`);
    if (target.id === this.activeBodyId) return;

    // park the session's origin world once, before the first materialization replaces the globals
    if (!this.originSnapshot) this.originSnapshot = this.captureGlobals();

    const current = this.activeBody;
    if (current) current.snapshot = this.captureGlobals();

    if (!target.materialized || !target.snapshot) await this.materialize(target);
    else this.restoreGlobals(target.snapshot);

    this.activeBodyId = target.id;
    this.redraw();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("system:bodySwitched", { detail: { bodyId: target.id } }));
    }
  }

  /** park the ambient world on the (about to be replaced) globals */
  private captureGlobals(): WorldSnapshot {
    return {
      // property access rather than bare identifiers: headless test envs may not have
      // initialized the world globals yet
      grid: globalThis.grid ?? ({} as GridGraph),
      pack: globalThis.pack ?? ({} as PackedGraph),
      options: structuredClone(options),
      styles: structuredClone(globalThis.styles ?? ({} as StylesData)),
      seed: options.map.seed
    };
  }

  private restoreGlobals(snapshot: WorldSnapshot): void {
    globalThis.grid = snapshot.grid;
    globalThis.pack = snapshot.pack;
    globalThis.options = snapshot.options;
    globalThis.styles = snapshot.styles;
  }

  /**
   * Generate a body's surface: fresh world containers so the pipeline's in-place mutation
   * cannot touch the parked snapshots, planetary options and heightmap template from the
   * body's archetype, then a full generation run.
   */
  private async materialize(body: CelestialBody): Promise<void> {
    const archetype: PlanetaryArchetype = body.archetype === "gas_giant" ? "terran" : body.archetype;
    const config = structuredClone(options);
    config.map.seed = body.astro.seed;

    // 2:1 equirectangular aspect for a full globe; mapSize 100 makes the pipeline's own
    // Coordinates.calculate() derive latT 180 / lonT 360 from the aspect ratio
    const globeHeight = Math.round(config.map.graph.width / 2);
    config.map.graph = { ...config.map.graph, height: globeHeight };
    config.generation.graph = { ...config.generation.graph, height: globeHeight };
    config.generation.geography = { ...config.generation.geography, mapSize: 100 };
    config.generation.template = ARCHETYPE_HEIGHTMAP_TEMPLATES[archetype];

    globalThis.styles = structuredClone(globalThis.styles ?? ({} as StylesData));
    globalThis.options = config;
    applyPlanetaryOptions(body.astro); // globe coordinates, climate and archetype onto the new options
    globalThis.grid = {} as GridGraph;
    globalThis.pack = {} as PackedGraph;

    await GenerationPipeline.run({});

    body.materialized = true;
    body.snapshot = this.captureGlobals();
  }

  /** redraw the map after a switch; the hook keeps renderer imports out of headless contexts */
  private redraw(): void {
    if (this.redrawHook) {
      this.redrawHook();
      return;
    }
    import("@/renderers/layers").then(({ Layers }) => Layers.drawAll()).catch(() => {}); // headless contexts (tests, workers) have no layers to draw
  }
}

export const SolarSystem = new SolarSystemModule();
