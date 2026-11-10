// The colonized solar system orrery: a Three.js scene built from the SolarSystem registry.
// Presentation only - it never mutates grid or pack; the user-driven mutations go through
// switchBody() and the FMG controllers. To-scale orbits and planet/moon globe systems with
// a bottom-bar vignette navigator and planet inspector. See docs/plans/solar-system-colonization.md §6.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { starTypeData } from "@/model/physical/astral-system/astrophysics";
import { GasGiantColors, RockyColors } from "@/model/physical/astral-system/palette";
import { createRng } from "@/model/physical/astral-system/rng";
import { type CelestialBody, SolarSystem } from "@/model/system/solar-system";
import { setViewMode } from "@/renderers/view-mode";
import { t } from "@/utils/i18n";
import { log } from "@/utils/logger";
import { rn } from "@/utils/number-utils";
import { escapeHtml } from "@/utils/string-utils";

// --- pure orrery math (unit-tested) ------------------------------------------

export const AU_SCALE = 18; // scene units per astronomical unit (linear scale)
export const STAR_RADIUS = 1.5; // visual radius of the primary star

/** to-scale orbital radius: linear scale with AU, with a minimum clearance outside the star */
export const orbitRadius = (semiMajorAxisAU: number, scaleAU = AU_SCALE): number => {
  const clampedAU = Math.max(semiMajorAxisAU, 0);
  return clampedAU <= 0 ? 0 : Math.max(STAR_RADIUS + 0.8, clampedAU * scaleAU);
};

/** point on the Kepler orbit ellipse, the star sitting in its focus */
export const ellipsePoint = (semiMajor: number, eccentricity: number, angle: number): { x: number; z: number } => {
  const r = (semiMajor * (1 - eccentricity ** 2)) / (1 + eccentricity * Math.cos(angle));
  return { x: r * Math.cos(angle), z: r * Math.sin(angle) };
};

/** scene-space body radius, scaled to Earth radius (Earth = 6,371 km) */
export const bodySceneRadius = (radiusKmOrMm: number, kind: "planet" | "moon"): number => {
  const rKm = radiusKmOrMm < 500 ? radiusKmOrMm * 1000 : radiusKmOrMm;
  const earthRatio = Math.max(0.08, rKm / 6371);

  if (kind === "moon") {
    return Math.min(0.07, Math.max(0.022, 0.038 * earthRatio ** 0.5));
  }

  return Math.min(0.6, Math.max(0.045, 0.11 * earthRatio ** 0.55));
};

/** banded gas-giant palette: three palette colors per body, deterministic per body id */
export const gasGiantBandColors = (bodyId: string): string[] => {
  const rng = createRng(`${bodyId}/bands`);
  const picked: string[] = [];
  while (picked.length < 3) {
    const color = rng.choice(GasGiantColors).hex;
    if (!picked.includes(color)) picked.push(color);
  }
  return picked;
};

/** rocky surface base color, deterministic per body id */
export const rockyBaseColor = (bodyId: string): string => createRng(`${bodyId}/surface`).choice(RockyColors).hex;

/** controlling state dots for the label and inspector, read from a materialized snapshot */
export const controllingStates = (snapshot: CelestialBody["snapshot"]): Array<{ name: string; color: string }> => {
  if (!snapshot) return [];
  return snapshot.pack.states
    .filter(state => state && !state.removed)
    .slice(0, 4)
    .map(state => ({ name: state.name, color: state.color ?? "#9aa2b5" }));
};

/** habitability classification nomenclature */
export const habitabilityNomenclature = (hi: number): string => {
  switch (hi) {
    case 1:
      return "Earthlike";
    case 2:
      return "Survivable";
    case 3:
      return "EVA Possible";
    case 4:
      return "Robot Accessible";
    case 5:
      return "Inimical";
    default:
      return `HI ${hi}`;
  }
};

// --- scene state --------------------------------------------------------------

type Actions = {
  /** switch to the body's world and show it as a globe */
  openWorld: (bodyId: string) => Promise<void>;
  /** switch to the body's world and show its flat map */
  openMap: (bodyId: string) => Promise<void>;
};

let Renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let raycaster: THREE.Raycaster | null = null;
let active = false;
let animationFrame = 0;
const bodyMeshes: THREE.Mesh[] = [];
const planetGroups: THREE.Group[] = [];
const disposables: Array<{ dispose(): void }> = [];
const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

let focusTarget: THREE.Vector3 | null = null; // camera controls target lerp destination
let cameraTargetPos: THREE.Vector3 | null = null; // camera position lerp destination
let currentViewMode: "system" | "planet" = "system";
let selectedBodyId: string | null = null;
let systemExtent = 50;

let actions: Actions | null = null;
let pointerStart: { x: number; y: number } | null = null;

const CANVAS_TEXTURE_WIDTH = 256;
const CANVAS_TEXTURE_HEIGHT = 128;

const ARCHETYPE_LABELS: Record<string, string> = {
  terran: "Terran",
  lunar: "Lunar",
  martian: "Martian",
  icy_moon: "Icy moon",
  titan: "Titan",
  volcanic: "Volcanic",
  gas_giant: "Gas giant"
};

// --- entry points -------------------------------------------------------------

export const isActive = (): boolean => active;
export const getViewMode = (): "system" | "planet" => currentViewMode;
export const getSelectedBodyId = (): string | null => selectedBodyId;

export const setActions = (next: Actions | null): void => {
  actions = next;
};

export async function create(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    if (!SolarSystem.bodies.length) SolarSystem.initFromSeed(options.map.seed);
    buildScene(canvas);
    active = true;
    bindEvents(canvas);
    buildVignetteBar();
    animate();
    render();
    return true;
  } catch (error) {
    log.error("System view failed to start:", error);
    stop();
    return false;
  }
}

export function stop(): void {
  active = false;
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  focusTarget = null;
  cameraTargetPos = null;
  pointerStart = null;
  currentViewMode = "system";
  selectedBodyId = null;

  for (const [target, type, listener] of listeners) target.removeEventListener(type, listener);
  listeners.length = 0;

  document.getElementById("systemInspector")?.remove();
  document.getElementById("systemInspectorStyle")?.remove();
  document.getElementById("systemVignetteBar")?.remove();
  document.getElementById("systemVignetteStyle")?.remove();

  if (controls) controls.dispose();
  controls = null;

  if (scene) {
    scene.traverse(object => {
      const mesh = object as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
      if (mesh.geometry) {
        mesh.geometry.dispose();
        disposables.push(mesh.geometry);
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materials) {
        const mapped = material as THREE.MeshLambertMaterial;
        if (mapped.map) mapped.map.dispose();
        material.dispose();
      }
    });
  }
  disposables.length = 0;
  bodyMeshes.length = 0;
  planetGroups.length = 0;
  scene = null;

  if (Renderer) {
    Renderer.renderLists.dispose();
    Renderer.dispose();
    Renderer.forceContextLoss();
    Renderer = null;
  }
  raycaster = null;
  setViewMode("standard");
}

export function redraw(): void {
  const el = canvasEl();
  if (!active || !Renderer || !el) return;
  Renderer.setSize(el.width, el.height);
  if (camera) {
    camera.aspect = el.width / el.height;
    camera.updateProjectionMatrix();
  }
  render();
}

// --- scene construction -------------------------------------------------------

function buildScene(canvas: HTMLCanvasElement): void {
  scene = new THREE.Scene();

  Renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  Renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  Renderer.setSize(canvas.width, canvas.height);

  // Compute to-scale system extent to frame initial view
  const planetBodies = SolarSystem.bodies.filter(b => b.kind === "planet");
  let maxOrbit = 12;
  for (const p of planetBodies) {
    const r = orbitRadius(p.orbit.semiMajorAxisAU * (1 + p.orbit.eccentricity));
    if (r > maxOrbit) maxOrbit = r;
  }
  systemExtent = maxOrbit;

  const camDist = Math.max(40, maxOrbit * 1.3);
  camera = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 0.1, Math.max(1600, maxOrbit * 6));
  camera.position.set(0, camDist * 0.65, camDist * 1.15);

  controls = new OrbitControls(camera, Renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1;
  controls.maxDistance = Math.max(600, maxOrbit * 4);

  raycaster = new THREE.Raycaster();

  const spectral = SolarSystem.star?.primary.spectral ?? "G";
  const starColor = new THREE.Color().setStyle(starTypeData[spectral]?.color ?? starTypeData.G.color);

  buildStar(starColor);
  buildBodies();

  const starLight = new THREE.PointLight(starColor, 2.8, 0, 0);
  scene.add(starLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
}

function buildStar(color: THREE.Color): void {
  if (!scene) return;
  const geometry = new THREE.SphereGeometry(STAR_RADIUS, 48, 48);
  const material = new THREE.MeshBasicMaterial({ color });
  const star = new THREE.Mesh(geometry, material);
  star.userData.bodyId = "::star";
  scene.add(star);
  bodyMeshes.push(star);

  // soft glow corona
  const glow = document.createElement("canvas");
  glow.width = glow.height = 256;
  const ctx = glow.getContext("2d")!;
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.22, `rgba(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0},0.6)`);
  gradient.addColorStop(0.65, `rgba(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0},0.15)`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(glow);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  sprite.scale.set(STAR_RADIUS * 6.5, STAR_RADIUS * 6.5, 1);
  scene.add(sprite);
}

function buildBodies(): void {
  if (!scene) return;

  for (const body of SolarSystem.bodies) {
    if (body.kind !== "planet") continue;
    const { group, orbitRing } = buildPlanet(body);
    scene.add(group);
    scene.add(orbitRing); // the orbit ellipse centers on the star
  }
}

function buildPlanet(body: CelestialBody): { group: THREE.Group; orbitRing: THREE.LineLoop } {
  const radius = bodySceneRadius(kindRadius(body), "planet");
  const orbit = orbitRadius(body.orbit.semiMajorAxisAU);
  const point = ellipsePoint(orbit, body.orbit.eccentricity, body.orbit.angleRad);

  const group = new THREE.Group();
  group.position.set(point.x, 0, point.z);
  group.userData.planetId = body.id;

  const geometry = new THREE.SphereGeometry(radius, 48, 48);
  const material = new THREE.MeshLambertMaterial({ map: bodyTexture(body) });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.userData.bodyId = body.id;
  group.add(sphere);
  bodyMeshes.push(sphere);

  const hasRingMesh = body.archetype === "gas_giant" && hasRings(body);
  if (hasRingMesh) group.add(buildRings(radius, body.id));
  group.add(buildLabel(body, radius, false));

  // Build moon sub-system around this planet in globe view (hidden by default in system view)
  const moons = SolarSystem.bodies.filter(b => b.kind === "moon" && b.parentId === body.id);
  const moonsGroup = new THREE.Group();
  moonsGroup.name = "moonsGroup";
  moonsGroup.visible = false; // Hidden in system view!

  const ringsOuter = hasRingMesh ? radius * 2.2 : radius;
  const baseMoonDist = Math.max(radius * 2.0, ringsOuter + 0.25);
  const moonStep = Math.max(0.24, radius * 0.45);

  for (let mIdx = 0; mIdx < moons.length; mIdx++) {
    const moon = moons[mIdx];
    const moonRadius = bodySceneRadius(kindRadius(moon), "moon");
    const moonOrbitDist = baseMoonDist + (mIdx + 0.5) * moonStep;
    const mAngle = moon.orbit.angleRad;
    const mx = Math.cos(mAngle) * moonOrbitDist;
    const mz = Math.sin(mAngle) * moonOrbitDist;

    const moonGeom = new THREE.SphereGeometry(moonRadius, 32, 32);
    const moonMat = new THREE.MeshLambertMaterial({ map: bodyTexture(moon) });
    const moonMesh = new THREE.Mesh(moonGeom, moonMat);
    moonMesh.position.set(mx, 0, mz);
    moonMesh.userData.bodyId = moon.id;
    moonMesh.userData.parentId = body.id;
    moonsGroup.add(moonMesh);
    bodyMeshes.push(moonMesh);

    // Orbit ring around planet
    const moonRing = buildOrbitRing(moonOrbitDist, moon.orbit.eccentricity, true);
    moonsGroup.add(moonRing);

    // Compact label for moon
    const moonLabel = buildLabel(moon, moonRadius, true);
    moonLabel.position.x = mx;
    moonLabel.position.z = mz;
    moonsGroup.add(moonLabel);
  }

  group.add(moonsGroup);
  planetGroups.push(group);

  return { group, orbitRing: buildOrbitRing(orbit, body.orbit.eccentricity, false) };
}

function buildRings(radius: number, bodyId: string): THREE.Mesh {
  const inner = radius * 1.35;
  const outer = radius * 2.2;
  const geometry = new THREE.RingGeometry(inner, outer, 64);

  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = textureCanvas.height = 128;
  const ctx = textureCanvas.getContext("2d")!;
  const rng = createRng(`${bodyId}/rings`);
  ctx.clearRect(0, 0, 128, 128);
  for (let band = 0; band < 9; band++) {
    const bandRadius = inner + ((outer - inner) * band) / 8;
    const pixel = (bandRadius / outer) * 64;
    ctx.beginPath();
    ctx.arc(64, 64, pixel, 0, Math.PI * 2);
    ctx.lineWidth = ((outer - inner) / 8 / outer) * 64;
    ctx.strokeStyle = `rgba(210, 190, 150, ${0.25 + rng.next() * 0.5})`;
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = Math.PI / 2.6;
  return mesh;
}

function buildOrbitRing(orbit: number, eccentricity: number, isMoon: boolean): THREE.LineLoop {
  const segments = isMoon ? 48 : 128;
  const points: THREE.Vector3[] = [];
  for (let step = 0; step < segments; step++) {
    const angle = (step / segments) * Math.PI * 2;
    const point = isMoon
      ? { x: Math.cos(angle) * orbit, z: Math.sin(angle) * orbit }
      : ellipsePoint(orbit, eccentricity, angle);
    points.push(new THREE.Vector3(point.x, 0, point.z));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: isMoon ? 0x6e7890 : 0x8b93a7,
    transparent: true,
    opacity: isMoon ? 0.28 : 0.26
  });
  return new THREE.LineLoop(geometry, material);
}

function buildLabel(body: CelestialBody, radius: number, isMoon = false): THREE.Sprite {
  const states = controllingStates(body.snapshot);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const name = body.name;
  const archetype = ARCHETYPE_LABELS[body.archetype] ?? body.archetype;

  if (isMoon) {
    ctx.font = "600 20px sans-serif";
    const textWidth = Math.max(80, ctx.measureText(name).width + 16);
    canvas.width = textWidth;
    canvas.height = 34;

    ctx.fillStyle = "rgba(12, 14, 20, 0.65)";
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 6);
    ctx.fill();

    ctx.font = "600 16px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e8eaf1";
    ctx.fillText(name, 8, 17);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    const scale = 0.28;
    sprite.scale.set(scale * (canvas.width / canvas.height), scale, 1);
    sprite.position.y = radius + 0.16;
    sprite.renderOrder = 2;
    return sprite;
  }

  ctx.font = "600 24px sans-serif";
  const width = Math.max(
    130,
    ctx.measureText(name).width + 24,
    24 + ctx.measureText(archetype).width + states.length * 18
  );
  canvas.width = width;
  canvas.height = 54;
  ctx.font = "600 24px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(12, 14, 20, 0.60)";
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
  ctx.fill();
  ctx.fillStyle = "#f2f3f7";
  ctx.fillText(name, 10, 5);
  ctx.font = "400 15px sans-serif";
  ctx.fillStyle = "#aab2c5";
  ctx.fillText(archetype, 10, 31);
  for (const [index, state] of states.entries()) {
    ctx.fillStyle = state.color;
    ctx.beginPath();
    ctx.arc(width - 14 - index * 16, 39, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  const scale = Math.max(0.9, radius * 1.5 + 0.65);
  sprite.scale.set(scale * (canvas.width / canvas.height) * 0.45, scale * 0.45, 1);
  sprite.position.y = radius + scale * 0.35;
  sprite.renderOrder = 2;
  return sprite;
}

// --- body textures ------------------------------------------------------------

function bodyTexture(body: CelestialBody): THREE.Texture {
  const url = body.textureUrl ?? (body.snapshot ? bakeBodyTexture(body) : proceduralBodyTexture(body));
  body.textureUrl = url;
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** equirectangular thumbnail baked from a materialized body's snapshot heights and biomes */
function bakeBodyTexture(body: CelestialBody): string {
  const snapshot = body.snapshot!;
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_TEXTURE_WIDTH;
  canvas.height = CANVAS_TEXTURE_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(canvas.width, canvas.height);
  const { cellsX, cellsY } = snapshot.grid;
  const heights = snapshot.grid.cells.h;
  const biomeOf = snapshot.pack.cells.biome;

  for (let pixelY = 0; pixelY < canvas.height; pixelY++) {
    const row = Math.min(cellsY - 1, Math.floor((pixelY / canvas.height) * cellsY));
    for (let pixelX = 0; pixelX < canvas.width; pixelX++) {
      const column = Math.min(cellsX - 1, Math.floor((pixelX / canvas.width) * cellsX));
      const cell = row * cellsX + column;
      const height = heights[cell] ?? 0;
      const hex = height < 20 ? "#466eab" : (snapshot.pack.biomes[biomeOf[cell]]?.color ?? "#c8d68f");
      const [r, g, b] = hexRgb(hex);
      const shade = height < 20 ? 0.7 + (height / 20) * 0.3 : 0.72 + ((height - 20) / 80) * 0.45;
      const pixel = (pixelY * canvas.width + pixelX) * 4;
      image.data[pixel] = Math.min(255, r * shade);
      image.data[pixel + 1] = Math.min(255, g * shade);
      image.data[pixel + 2] = Math.min(255, b * shade);
      image.data[pixel + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

/** lightweight procedural surface for unmaterialized bodies and gas giants */
function proceduralBodyTexture(body: CelestialBody): string {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_TEXTURE_WIDTH;
  canvas.height = CANVAS_TEXTURE_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const rng = createRng(`${body.id}/texture`);

  if (body.archetype === "gas_giant") {
    const [base, mid, cap] = gasGiantBandColors(body.id);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const bands = 9;
    for (let band = 0; band < bands; band++) {
      ctx.fillStyle = band % 2 ? mid : cap;
      ctx.globalAlpha = 0.25 + rng.next() * 0.4;
      const bandHeight = canvas.height / bands;
      const wobble = Math.sin(band * 1.7) * 3;
      ctx.fillRect(0, band * bandHeight + wobble, canvas.width, bandHeight * (0.6 + rng.next() * 0.5));
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = rockyBaseColor(body.id);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const craters = 26 + Math.floor(rng.next() * 24);
    for (let crater = 0; crater < craters; crater++) {
      const x = rng.next() * canvas.width;
      const y = rng.next() * canvas.height;
      const craterRadius = 2 + rng.next() * 9;
      ctx.fillStyle = `rgba(0, 0, 0, ${0.12 + rng.next() * 0.16})`;
      ctx.beginPath();
      ctx.arc(x, y, craterRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + rng.next() * 0.1})`;
      ctx.beginPath();
      ctx.arc(x, y, craterRadius, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    for (let speckle = 0; speckle < 400; speckle++) {
      ctx.fillStyle = `rgba(${rng.next() > 0.5 ? "255,255,255" : "0,0,0"}, 0.05)`;
      ctx.fillRect(rng.next() * canvas.width, rng.next() * canvas.height, 1, 1);
    }
  }
  return canvas.toDataURL();
}

function hexRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** gas giants show rings on every second planet, and Saturn in the Sol preset */
function hasRings(body: CelestialBody): boolean {
  if (body.id === "saturn") return true;
  const index = Number.parseInt(body.id.split("-")[1] ?? "0", 10);
  return Number.isInteger(index) && index % 2 === 1;
}

/** the astro radius the scene sizing reads */
function kindRadius(body: CelestialBody): number {
  return typeof body.astro.radius === "number" ? body.astro.radius : 6.371;
}

// --- navigation & zoom --------------------------------------------------------

function setMoonsVisibility(activePlanetId: string | null): void {
  for (const group of planetGroups) {
    const moonsGroup = group.getObjectByName("moonsGroup");
    if (moonsGroup) {
      moonsGroup.visible = group.userData.planetId === activePlanetId;
    }
  }
}

function zoomToSystem(): void {
  currentViewMode = "system";
  selectedBodyId = null;
  setMoonsVisibility(null);

  focusTarget = new THREE.Vector3(0, 0, 0);
  const camDist = Math.max(40, systemExtent * 1.3);
  cameraTargetPos = new THREE.Vector3(0, camDist * 0.65, camDist * 1.15);

  if (controls) {
    controls.minDistance = 2;
    controls.maxDistance = Math.max(600, systemExtent * 4);
  }

  updateVignetteActive("::star");
  document.getElementById("systemInspector")?.remove();
}

function zoomToPlanet(planetId: string): void {
  const planet = SolarSystem.getBody(planetId);
  if (!planet || !scene) return;
  const anchor = bodyAnchor(planetId);
  if (!anchor) return;

  currentViewMode = "planet";
  selectedBodyId = planetId;
  setMoonsVisibility(planetId);

  const worldPos = new THREE.Vector3();
  anchor.getWorldPosition(worldPos);

  const planetRadius = bodySceneRadius(kindRadius(planet), "planet");
  const moons = SolarSystem.bodies.filter(b => b.kind === "moon" && b.parentId === planetId);

  let maxMoonDist = planetRadius * 2.5;
  for (const m of moons) {
    const mAnchor = bodyAnchor(m.id);
    if (mAnchor) {
      const mPos = new THREE.Vector3();
      mAnchor.getWorldPosition(mPos);
      const dist = worldPos.distanceTo(mPos);
      if (dist > maxMoonDist) maxMoonDist = dist;
    }
  }

  const frameDist = Math.max(planetRadius * 4.5, maxMoonDist * 1.8);
  focusTarget = worldPos.clone();
  cameraTargetPos = new THREE.Vector3(worldPos.x, worldPos.y + frameDist * 0.45, worldPos.z + frameDist * 0.95);

  if (controls) {
    controls.minDistance = Math.max(0.15, planetRadius * 1.1);
    controls.maxDistance = Math.max(50, frameDist * 5);
  }

  updateVignetteActive(planetId);
  showInspector(planet);
}

function zoomToMoon(moonId: string): void {
  const moon = SolarSystem.getBody(moonId);
  if (!moon || !scene) return;
  const anchor = bodyAnchor(moonId);
  if (!anchor) return;

  selectedBodyId = moonId;
  if (moon.parentId) setMoonsVisibility(moon.parentId);

  const worldPos = new THREE.Vector3();
  anchor.getWorldPosition(worldPos);

  const moonRadius = bodySceneRadius(kindRadius(moon), "moon");
  const frameDist = Math.max(0.45, moonRadius * 8);

  focusTarget = worldPos.clone();
  cameraTargetPos = new THREE.Vector3(worldPos.x, worldPos.y + frameDist * 0.45, worldPos.z + frameDist * 0.95);

  if (controls) {
    controls.minDistance = Math.max(0.04, moonRadius * 1.1);
    controls.maxDistance = Math.max(20, frameDist * 6);
  }

  if (moon.parentId) updateVignetteActive(moon.parentId);
  showInspector(moon);
}

// --- interaction --------------------------------------------------------------

function bindEvents(canvas: HTMLCanvasElement): void {
  const onPointerDown = (event: PointerEvent) => {
    pointerStart = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!pointerStart) return;
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (moved > 5) return; // orbit drag, not click
    const bodyId = pickBody(canvas, event.clientX, event.clientY);
    if (!bodyId) return;
    if (bodyId === "::star") {
      zoomToSystem();
    } else {
      const body = SolarSystem.getBody(bodyId);
      if (body?.kind === "moon") zoomToMoon(bodyId);
      else if (body?.kind === "planet") zoomToPlanet(bodyId);
    }
  };
  const onDoubleClick = (event: MouseEvent) => {
    const bodyId = pickBody(canvas, event.clientX, event.clientY);
    if (!bodyId || bodyId === "::star") return;
    const body = SolarSystem.getBody(bodyId);
    if (body?.archetype === "gas_giant" || body?.astro.type === "gas giant") return; // gas giants have no surface
    void openWorld(bodyId);
  };
  const onResize = () => redraw();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("dblclick", onDoubleClick);
  window.addEventListener("resize", onResize);
  listeners.push(
    [canvas, "pointerdown", onPointerDown as EventListener],
    [canvas, "pointerup", onPointerUp as EventListener],
    [canvas, "dblclick", onDoubleClick as EventListener],
    [window, "resize", onResize]
  );
}

function pickBody(canvas: HTMLCanvasElement, clientX: number, clientY: number): string | null {
  if (!raycaster || !camera) return null;
  const rect = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);

  const visibleMeshes = bodyMeshes.filter(mesh => {
    let cur: THREE.Object3D | null = mesh;
    while (cur) {
      if (!cur.visible) return false;
      cur = cur.parent;
    }
    return true;
  });

  const hit = raycaster.intersectObjects(visibleMeshes, false)[0];
  return (hit?.object.userData.bodyId as string) ?? null;
}

async function openWorld(bodyId: string): Promise<void> {
  if (actions?.openWorld) return actions.openWorld(bodyId);
  await SolarSystem.switchBody(bodyId);
}

function animate(): void {
  const frame = () => {
    if (!active) return;
    animationFrame = requestAnimationFrame(frame);
    if (controls) {
      if (focusTarget) {
        controls.target.lerp(focusTarget, 0.08);
        if (controls.target.distanceTo(focusTarget) < 0.02) focusTarget = null;
      }
      if (cameraTargetPos && camera) {
        camera.position.lerp(cameraTargetPos, 0.08);
        if (camera.position.distanceTo(cameraTargetPos) < 0.05) cameraTargetPos = null;
      }
      controls.update();
    }
    for (const pGroup of planetGroups) {
      const planetSphere = pGroup.children[0];
      if (planetSphere) planetSphere.rotation.y += 0.002;
    }
    render();
  };
  animationFrame = requestAnimationFrame(frame);
}

function render(): void {
  if (!active || !Renderer || !scene || !camera) return;
  Renderer.render(scene, camera);
}

function canvasEl(): HTMLCanvasElement | null {
  return (Renderer?.domElement as HTMLCanvasElement) ?? null;
}

// --- vignette bar (bottom 10%) ------------------------------------------------

function buildVignetteBar(): void {
  ensureVignetteStyle();
  document.getElementById("systemVignetteBar")?.remove();

  const bar = document.createElement("div");
  bar.id = "systemVignetteBar";

  const spectral = SolarSystem.star?.primary.spectral ?? "G";
  const starColor = starTypeData[spectral]?.color ?? starTypeData.G.color;
  const starName = SolarSystem.star?.primary.name ?? (SolarSystem.star ? "Primary Star" : "Sol");

  const starItem = document.createElement("div");
  starItem.className = "systemVignetteItem active";
  starItem.dataset.id = "::star";
  starItem.innerHTML = `
    <div class="systemVignetteThumbWrap">
      <div class="systemVignetteStarSphere" style="background: ${starColor}; box-shadow: 0 0 12px ${starColor}, inset -2px -2px 5px rgba(0,0,0,0.35);"></div>
    </div>
    <div class="systemVignetteText">
      <span class="systemVignetteName">${escapeHtml(starName)}</span>
      <span class="systemVignetteSub">${spectral} V · ${t("Star")}</span>
    </div>
  `;
  bar.appendChild(starItem);

  const planets = SolarSystem.bodies.filter(b => b.kind === "planet");
  for (const planet of planets) {
    const moons = SolarSystem.bodies.filter(b => b.kind === "moon" && b.parentId === planet.id);
    const texture = planet.textureUrl ?? (planet.snapshot ? bakeBodyTexture(planet) : proceduralBodyTexture(planet));
    planet.textureUrl = texture;

    const item = document.createElement("div");
    item.className = "systemVignetteItem";
    item.dataset.id = planet.id;
    item.innerHTML = `
      <div class="systemVignetteThumbWrap">
        <img src="${texture}" class="systemVignetteGlobeImg" alt="${escapeHtml(planet.name)}" />
        ${moons.length ? `<span class="systemMoonCountBadge" title="${moons.length} ${t("moons")}">${moons.length}</span>` : ""}
      </div>
      <div class="systemVignetteText">
        <span class="systemVignetteName">${escapeHtml(planet.name)}</span>
        <span class="systemVignetteSub">${rn(planet.orbit.semiMajorAxisAU, 2)} AU</span>
      </div>
    `;
    bar.appendChild(item);
  }

  bar.addEventListener("click", event => {
    const item = (event.target as HTMLElement).closest<HTMLElement>(".systemVignetteItem");
    if (!item) return;
    const id = item.dataset.id;
    if (!id) return;
    if (id === "::star") {
      zoomToSystem();
    } else {
      zoomToPlanet(id);
    }
  });

  document.body.appendChild(bar);
}

function updateVignetteActive(activeId: string): void {
  const bar = document.getElementById("systemVignetteBar");
  if (!bar) return;
  for (const item of bar.querySelectorAll(".systemVignetteItem")) {
    const htmlItem = item as HTMLElement;
    if (htmlItem.dataset.id === activeId) {
      htmlItem.classList.add("active");
      htmlItem.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    } else {
      htmlItem.classList.remove("active");
    }
  }
}

function ensureVignetteStyle(): void {
  if (document.getElementById("systemVignetteStyle")) return;
  const style = document.createElement("style");
  style.id = "systemVignetteStyle";
  style.textContent = /* css */ `
    #systemVignetteBar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 10vh;
      min-height: 64px;
      max-height: 84px;
      z-index: 100;
      background: rgba(12, 14, 20, 0.88);
      backdrop-filter: blur(8px);
      border-top: 1px solid #2a3142;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 16px;
      overflow-x: auto;
      overflow-y: hidden;
      box-sizing: border-box;
    }
    #systemVignetteBar::-webkit-scrollbar {
      height: 4px;
    }
    #systemVignetteBar::-webkit-scrollbar-thumb {
      background: #3b4255;
      border-radius: 2px;
    }
    .systemVignetteItem {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 5px 12px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.18s ease;
      user-select: none;
    }
    .systemVignetteItem:hover {
      background: rgba(255, 255, 255, 0.09);
      border-color: rgba(255, 255, 255, 0.15);
    }
    .systemVignetteItem.active {
      background: rgba(60, 110, 200, 0.22);
      border-color: #4f8aff;
      box-shadow: 0 0 12px rgba(79, 138, 255, 0.35);
    }
    .systemVignetteThumbWrap {
      position: relative;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .systemVignetteStarSphere {
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }
    .systemVignetteGlobeImg {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      object-fit: cover;
      box-shadow: inset -4px -3px 6px rgba(0, 0, 0, 0.75), inset 2px 2px 3px rgba(255, 255, 255, 0.2);
    }
    .systemMoonCountBadge {
      position: absolute;
      bottom: -2px;
      right: -4px;
      background: #1e2433;
      color: #aab2c5;
      border: 1px solid #3d465e;
      border-radius: 10px;
      font-size: 10px;
      line-height: 1;
      padding: 2px 4px;
      font-weight: 600;
    }
    .systemVignetteText {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .systemVignetteName {
      font-size: 12px;
      font-weight: 600;
      color: #f0f3fa;
      white-space: nowrap;
    }
    .systemVignetteSub {
      font-size: 11px;
      color: #9aa2b5;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

// --- inspector overlay --------------------------------------------------------

function bodyAnchor(bodyId: string): THREE.Object3D | null {
  return bodyMeshes.find(mesh => mesh.userData.bodyId === bodyId) ?? null;
}

function colonySummary(body: CelestialBody): { population: string; burgs: number; spaceports: number } | null {
  const burgs = body.snapshot?.pack.burgs.filter(burg => burg && typeof burg.population === "number") ?? [];
  if (!body.snapshot || !burgs.length) return null;
  const total = burgs.reduce((sum, burg) => sum + (burg.population ?? 0), 0);
  return {
    population: Math.round(total).toLocaleString(),
    burgs: burgs.length,
    spaceports: burgs.filter(burg => burg.port).length
  };
}

function showInspector(body: CelestialBody): void {
  ensureInspectorStyle();
  document.getElementById("systemInspector")?.remove();

  const states = controllingStates(body.snapshot);
  const colonies = colonySummary(body);

  const isPlanet = body.kind === "planet";
  const isGasGiant = body.archetype === "gas_giant" || body.astro.type === "gas giant";
  const parentPlanet = body.parentId ? SolarSystem.getBody(body.parentId) : null;
  const moons = isPlanet ? SolarSystem.bodies.filter(b => b.kind === "moon" && b.parentId === body.id) : [];

  const rKm = kindRadius(body) < 500 ? kindRadius(body) * 1000 : kindRadius(body);
  const earthRadiusRatio = rKm / 6371;

  const panel = document.createElement("div");
  panel.id = "systemInspector";
  panel.innerHTML = /* html */ `
    <header>
      <b>${escapeHtml(body.name)}</b>
      <i id="systemInspectorClose" class="icon-cancel pointer"></i>
    </header>
    <div class="systemInspectorBody">
      ${parentPlanet ? `<div class="systemInspectorParentLink" data-parent="${parentPlanet.id}">← Back to ${escapeHtml(parentPlanet.name)}</div>` : ""}
      ${isPlanet ? `<div class="systemInspectorParentLink systemInspectorSystemLink">← ${t("Back to System View")}</div>` : ""}
      <div class="systemInspectorRow"><span>${t("Archetype")}</span><b>${t(ARCHETYPE_LABELS[body.archetype] ?? body.archetype)}</b></div>
      ${isPlanet ? `<div class="systemInspectorRow"><span>${t("Orbit")}</span><b>${rn(body.orbit.semiMajorAxisAU, 2)} AU</b></div>` : ""}
      <div class="systemInspectorRow"><span>${t("Period")}</span><b>${rn(body.orbit.periodDays, 1)} days</b></div>
      <div class="systemInspectorRow"><span>${t("Radius")}</span><b>${rn(earthRadiusRatio, 2)} R⊕</b></div>
      <div class="systemInspectorRow"><span>${t("Gravity")}</span><b>${body.astro.g} g</b></div>
      <div class="systemInspectorRow"><span>${t("Surface temperature")}</span><b>${body.astro.tempC} °C</b></div>
      <div class="systemInspectorRow"><span>${t("Atmosphere")}</span><b>${body.astro.atmosphere}</b></div>
      <div class="systemInspectorRow"><span>${t("Hydrographics")}</span><b>${body.astro.hydrographics}%</b></div>
      <div class="systemInspectorRow"><span>${t("Habitability")}</span><b class="systemInspectorHI hi-${body.astro.HI}">${habitabilityNomenclature(body.astro.HI)}</b></div>
      ${
        moons.length
          ? `<div class="systemInspectorSection">${t("Moons")} (${moons.length})</div>
      <div class="systemInspectorMoonsList">
        ${moons
          .map(
            m => `
          <div class="systemInspectorMoonRow" data-moon="${m.id}">
            <span class="systemInspectorMoonName">↳ ${escapeHtml(m.name)}</span>
            <span class="systemInspectorMoonHI hi-${m.astro.HI}">${habitabilityNomenclature(m.astro.HI)}</span>
          </div>`
          )
          .join("")}
      </div>`
          : ""
      }
      ${
        !isGasGiant
          ? colonies
            ? `<div class="systemInspectorSection">${t("Colonies")}</div>
        <div class="systemInspectorRow"><span>${t("Population")}</span><b>${colonies.population}</b></div>
        <div class="systemInspectorRow"><span>${t("Settlements")}</span><b>${colonies.burgs}</b></div>
        <div class="systemInspectorRow"><span>${t("Spaceports")}</span><b>${colonies.spaceports}</b></div>
        ${states.length ? `<div class="systemInspectorRow"><span>${t("States")}</span><b>${states.map(state => state.name).join(", ")}</b></div>` : ""}`
            : `<div class="systemInspectorSection">${t("Surface not generated yet")}</div>`
          : ""
      }
    </div>
    ${!isGasGiant ? `<footer><button id="systemInspectorViewSurface">${t("View Surface")}</button></footer>` : ""}
  `;
  document.body.appendChild(panel);

  panel.querySelector("#systemInspectorClose")?.addEventListener("click", () => panel.remove());
  panel.querySelector(".systemInspectorParentLink:not(.systemInspectorSystemLink)")?.addEventListener("click", () => {
    if (parentPlanet) zoomToPlanet(parentPlanet.id);
  });
  panel.querySelector(".systemInspectorSystemLink")?.addEventListener("click", () => zoomToSystem());
  for (const moonRow of panel.querySelectorAll(".systemInspectorMoonRow")) {
    moonRow.addEventListener("click", () => {
      const moonId = (moonRow as HTMLElement).dataset.moon;
      if (moonId) zoomToMoon(moonId);
    });
  }
  panel.querySelector("#systemInspectorViewSurface")?.addEventListener("click", () => void openWorld(body.id));
}

function ensureInspectorStyle(): void {
  if (document.getElementById("systemInspectorStyle")) return;
  const style = document.createElement("style");
  style.id = "systemInspectorStyle";
  style.textContent = /* css */ `
    #systemInspector {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 290px;
      max-height: calc(88vh - 24px);
      overflow-y: auto;
      z-index: 10;
      background: rgba(15, 17, 24, 0.94);
      color: #e8eaf1;
      border: 1px solid #3a3f4d;
      border-radius: 8px;
      font: 13px/1.45 sans-serif;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    }
    #systemInspector header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      font-size: 15px;
      border-bottom: 1px solid #3a3f4d;
    }
    #systemInspector .systemInspectorBody { padding: 8px 12px; }
    #systemInspector .systemInspectorRow {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 2px 0;
    }
    #systemInspector .systemInspectorRow > span { color: #9aa2b5; }
    #systemInspector .systemInspectorSection {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid #3a3f4d;
      color: #c8cede;
      font-weight: 600;
    }
    #systemInspector .systemInspectorParentLink {
      padding: 3px 6px;
      margin-bottom: 6px;
      font-size: 12px;
      color: #60a5fa;
      cursor: pointer;
      display: inline-block;
      border-radius: 4px;
      background: rgba(96, 165, 250, 0.1);
    }
    #systemInspector .systemInspectorParentLink:hover {
      background: rgba(96, 165, 250, 0.2);
      text-decoration: underline;
    }
    #systemInspector .systemInspectorMoonsList {
      margin-top: 4px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    #systemInspector .systemInspectorMoonRow {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
      font-size: 12px;
      transition: background 0.15s ease;
    }
    #systemInspector .systemInspectorMoonRow:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    #systemInspector .systemInspectorMoonName {
      font-weight: 500;
      color: #e2e6f0;
    }
    #systemInspector .systemInspectorHI {
      font-weight: 600;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 3px;
    }
    #systemInspector .systemInspectorMoonHI {
      font-weight: 600;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 3px;
      white-space: nowrap;
    }
    #systemInspector .hi-1 { color: #86efac; background: rgba(34, 197, 94, 0.15); }
    #systemInspector .hi-2 { color: #93c5fd; background: rgba(59, 130, 246, 0.15); }
    #systemInspector .hi-3 { color: #fde047; background: rgba(234, 179, 8, 0.15); }
    #systemInspector .hi-4 { color: #f97316; background: rgba(249, 115, 22, 0.15); }
    #systemInspector .hi-5 { color: #ef4444; background: rgba(239, 68, 68, 0.15); }
    #systemInspector footer {
      display: flex;
      padding: 8px 12px;
      border-top: 1px solid #3a3f4d;
    }
    #systemInspector footer button {
      flex: 1;
      background: #2c3140;
      color: #e8eaf1;
      border: 1px solid #454b5e;
      border-radius: 6px;
      padding: 7px 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    #systemInspector footer button:hover {
      background: #384055;
      border-color: #60a5fa;
      color: #ffffff;
    }
  `;
  document.head.appendChild(style);
}

/** delegation surface for view-3d-renderer's create/stop/redraw router */
export const SystemRenderer = {
  create,
  stop,
  redraw,
  isActive,
  setActions,
  getViewMode,
  getSelectedBodyId,
  zoomToSystem,
  zoomToPlanet,
  zoomToMoon,
  habitabilityNomenclature
};
