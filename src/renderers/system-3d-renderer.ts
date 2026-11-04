// The colonized solar system orrery: a Three.js scene built from the SolarSystem registry.
// Presentation only - it never mutates grid or pack; the one user-driven mutation is the
// explicit double-click switchBody. Pure math helpers are exported for unit tests; the DOM
// and WebGL work stays inside create()/stop(). See docs/plans/solar-system-colonization.md §6.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { starTypeData } from "@/model/physical/astral-system/astrophysics";
import { GasGiantColors, RockyColors } from "@/model/physical/astral-system/palette";
import { createRng } from "@/model/physical/astral-system/rng";
import { type CelestialBody, SolarSystem } from "@/model/system/solar-system";
import { setViewMode } from "@/renderers/view-mode";
import { t } from "@/utils/i18n";
import { log } from "@/utils/logger";

// --- pure orrery math (unit-tested) ------------------------------------------

const ORBIT_BASE = 6; // scene units at the innermost orbits
const ORBIT_COMPRESSION = 6; // how quickly orbital radii spread out
const ORBIT_CURVE = 0.8; // flattens the AU spread before the log

/** compressed orbital radius: `R_0 + k * ln(1 + a * c)` - real AU spans stay navigable */
export const orbitRadius = (semiMajorAxisAU: number): number =>
  ORBIT_BASE + ORBIT_COMPRESSION * Math.log(1 + Math.max(semiMajorAxisAU, 0) * ORBIT_CURVE);

/** point on the Kepler orbit ellipse, the star sitting in its focus */
export const ellipsePoint = (semiMajor: number, eccentricity: number, angle: number): { x: number; z: number } => {
  const r = (semiMajor * (1 - eccentricity ** 2)) / (1 + eccentricity * Math.cos(angle));
  return { x: r * Math.cos(angle), z: r * Math.sin(angle) };
};

/** scene-space body radius, log-compressed from the astro radius (Earth = 6.371 Mm) */
export const bodySceneRadius = (radiusMegameters: number, kind: "planet" | "moon"): number => {
  const earthRatio = radiusMegameters / 6.371;
  return kind === "moon"
    ? 0.1 + 0.12 * Math.log10(1 + radiusMegameters / 1.737)
    : 0.3 + 0.35 * Math.log10(1 + earthRatio);
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
const disposables: Array<{ dispose(): void }> = [];
const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
let focusTarget: THREE.Vector3 | null = null; // camera focus lerp destination
let actions: Actions | null = null;
let pointerStart: { x: number; y: number } | null = null;

const STAR_RADIUS = 2.2;
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

export const setActions = (next: Actions | null): void => {
  actions = next;
};

export async function create(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    if (!SolarSystem.bodies.length) SolarSystem.initFromSeed(options.map.seed);
    buildScene(canvas);
    active = true;
    bindEvents(canvas);
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
  pointerStart = null;

  for (const [target, type, listener] of listeners) target.removeEventListener(type, listener);
  listeners.length = 0;
  document.getElementById("systemInspector")?.remove();
  document.getElementById("systemInspectorStyle")?.remove();

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
  scene = null;

  if (Renderer) {
    Renderer.renderLists.dispose();
    Renderer.dispose();
    Renderer.forceContextLoss(); // dispose() only drops three's bookkeeping, the GL context survives it
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

  camera = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 0.1, 600);
  camera.position.set(0, 34, 58);

  controls = new OrbitControls(camera, Renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 160;

  raycaster = new THREE.Raycaster();

  const spectral = SolarSystem.star?.primary.spectral ?? "G";
  const starColor = new THREE.Color().setStyle(starTypeData[spectral]?.color ?? starTypeData.G.color);

  buildStar(starColor);
  buildBodies();

  const starLight = new THREE.PointLight(starColor, 2.5, 0, 0);
  scene.add(starLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
}

function buildStar(color: THREE.Color): void {
  if (!scene) return;
  const geometry = new THREE.SphereGeometry(STAR_RADIUS, 48, 48);
  const material = new THREE.MeshBasicMaterial({ color });
  const star = new THREE.Mesh(geometry, material);
  star.userData.bodyId = "::star";
  scene.add(star);
  bodyMeshes.push(star);

  // soft glow
  const glow = document.createElement("canvas");
  glow.width = glow.height = 256;
  const ctx = glow.getContext("2d")!;
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.25, `rgba(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0},0.45)`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(glow);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  sprite.scale.set(14, 14, 1);
  scene.add(sprite);
}

function buildBodies(): void {
  if (!scene) return;

  for (const body of SolarSystem.bodies) {
    if (body.kind !== "planet") continue;
    const { group, orbitRing } = buildPlanet(body);
    scene.add(group);
    scene.add(orbitRing); // the orbit ellipse centers on the star, not the moving planet
  }
}

function buildPlanet(body: CelestialBody): { group: THREE.Group; orbitRing: THREE.LineLoop } {
  const radius = bodySceneRadius(kindRadius(body), "planet");
  const orbit = orbitRadius(body.orbit.semiMajorAxisAU);
  const point = ellipsePoint(orbit, body.orbit.eccentricity, body.orbit.angleRad);

  const group = new THREE.Group();
  group.position.set(point.x, 0, point.z);

  const geometry = new THREE.SphereGeometry(radius, 48, 48);
  const material = new THREE.MeshLambertMaterial({ map: bodyTexture(body) });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.userData.bodyId = body.id;
  group.add(sphere);
  bodyMeshes.push(sphere);

  if (body.archetype === "gas_giant" && hasRings(body)) group.add(buildRings(radius, body.id));
  group.add(buildLabel(body, radius));

  return { group, orbitRing: buildOrbitRing(orbit, body.orbit.eccentricity, false) };
}

function buildRings(radius: number, bodyId: string): THREE.Mesh {
  const inner = radius * 1.4;
  const outer = radius * 2.3;
  const geometry = new THREE.RingGeometry(inner, outer, 64);

  // concentric alpha bands mapped over the ring's bounding square
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
  const segments = isMoon ? 64 : 128;
  const points: THREE.Vector3[] = [];
  for (let step = 0; step < segments; step++) {
    const angle = (step / segments) * Math.PI * 2;
    const point = isMoon
      ? { x: Math.cos(angle) * orbit, z: Math.sin(angle) * orbit }
      : ellipsePoint(orbit, eccentricity, angle);
    points.push(new THREE.Vector3(point.x, 0, point.z));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x8b93a7, transparent: true, opacity: isMoon ? 0.18 : 0.3 });
  return new THREE.LineLoop(geometry, material);
}

function buildLabel(body: CelestialBody, radius: number): THREE.Sprite {
  const states = controllingStates(body.snapshot);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const name = body.name;
  const archetype = ARCHETYPE_LABELS[body.archetype] ?? body.archetype;
  ctx.font = "600 26px sans-serif";
  const width = Math.max(
    140,
    ctx.measureText(name).width + 24,
    24 + ctx.measureText(archetype).width + states.length * 18
  );
  canvas.width = width;
  canvas.height = 58;
  ctx.font = "600 26px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(12, 14, 20, 0.55)";
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
  ctx.fill();
  ctx.fillStyle = "#f2f3f7";
  ctx.fillText(name, 10, 6);
  ctx.font = "400 16px sans-serif";
  ctx.fillStyle = "#aab2c5";
  ctx.fillText(archetype, 10, 34);
  for (const [index, state] of states.entries()) {
    ctx.fillStyle = state.color;
    ctx.beginPath();
    ctx.arc(width - 14 - index * 16, 42, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  const scale = radius * 2 + 1.4;
  sprite.scale.set(scale * (canvas.width / canvas.height) * 0.5, scale * 0.5, 1);
  sprite.position.y = radius + scale * 0.55;
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

/** the astro radius the scene sizing reads: gas giants carry their own radius, others too */
function kindRadius(body: CelestialBody): number {
  return typeof body.astro.radius === "number" ? body.astro.radius : 6.371;
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
    if (moved > 5) return; // it was an orbit drag, not a pick
    const bodyId = pickBody(canvas, event.clientX, event.clientY);
    if (bodyId && bodyId !== "::star") selectBody(bodyId);
  };
  const onDoubleClick = (event: MouseEvent) => {
    const bodyId = pickBody(canvas, event.clientX, event.clientY);
    if (!bodyId || bodyId === "::star") return;
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
  const hit = raycaster.intersectObjects(bodyMeshes, false)[0];
  return (hit?.object.userData.bodyId as string) ?? null;
}

/** focus the camera on the body and open the inspector */
function selectBody(bodyId: string): void {
  const body = SolarSystem.getBody(bodyId);
  if (!body || !scene) return;
  const anchor = bodyAnchor(bodyId);
  if (!anchor) return;
  const world = new THREE.Vector3();
  anchor.getWorldPosition(world);
  focusTarget = world.clone();
  showInspector(body);
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
        if (controls.target.distanceTo(focusTarget) < 0.05) focusTarget = null;
      }
      controls.update();
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

// --- inspector overlay --------------------------------------------------------

/** the sphere mesh carrying a bodyId, whose world position the camera focuses on */
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
  const { type } = body.astro;
  const subtype = body.astro.kind === "planet" ? body.astro.subtype : undefined;
  const colonies = colonySummary(body);

  const panel = document.createElement("div");
  panel.id = "systemInspector";
  panel.innerHTML = /* html */ `
    <header>
      <b>${body.name}</b>
      <i id="systemInspectorClose" class="icon-cancel pointer"></i>
    </header>
    <div class="systemInspectorBody">
      <div class="systemInspectorRow"><span>${t("Archetype")}</span><b>${t(ARCHETYPE_LABELS[body.archetype] ?? body.archetype)}</b></div>
      <div class="systemInspectorRow"><span>${t("Classification")}</span><b>${type}${subtype && subtype !== type ? ` (${subtype})` : ""}</b></div>
      <div class="systemInspectorRow"><span>${t("Gravity")}</span><b>${body.astro.g} g</b></div>
      <div class="systemInspectorRow"><span>${t("Surface temperature")}</span><b>${body.astro.tempC} °C</b></div>
      <div class="systemInspectorRow"><span>${t("Atmosphere")}</span><b>${body.astro.atmosphere}</b></div>
      <div class="systemInspectorRow"><span>${t("Hydrographics")}</span><b>${body.astro.hydrographics}%</b></div>
      <div class="systemInspectorRow"><span>${t("Habitability")}</span><b>HI ${body.astro.HI}</b></div>
      ${
        colonies
          ? `<div class="systemInspectorSection">${t("Colonies")}</div>
      <div class="systemInspectorRow"><span>${t("Population")}</span><b>${colonies.population}</b></div>
      <div class="systemInspectorRow"><span>${t("Settlements")}</span><b>${colonies.burgs}</b></div>
      <div class="systemInspectorRow"><span>${t("Spaceports")}</span><b>${colonies.spaceports}</b></div>
      ${states.length ? `<div class="systemInspectorRow"><span>${t("States")}</span><b>${states.map(state => state.name).join(", ")}</b></div>` : ""}`
          : `<div class="systemInspectorSection">${t("Surface not generated yet")}</div>`
      }
    </div>
    <footer>
      <button id="systemInspectorGlobe">${t("Open globe")}</button>
      <button id="systemInspectorMap">${t("Surface map")}</button>
      <button id="systemInspectorColonize" disabled data-tip="${t("Available with the colonization tools")}">${t("Colonize")}</button>
    </footer>
  `;
  document.body.appendChild(panel);

  panel.querySelector("#systemInspectorClose")?.addEventListener("click", () => panel.remove());
  panel.querySelector("#systemInspectorGlobe")?.addEventListener("click", () => void openWorld(body.id));
  panel
    .querySelector("#systemInspectorMap")
    ?.addEventListener("click", () => (actions?.openMap ? void actions.openMap(body.id) : void openWorld(body.id)));
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
      width: 280px;
      z-index: 10;
      background: rgba(15, 17, 24, 0.92);
      color: #e8eaf1;
      border: 1px solid #3a3f4d;
      border-radius: 8px;
      font: 13px/1.45 sans-serif;
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
    #systemInspector footer {
      display: flex;
      gap: 6px;
      padding: 8px 12px;
      border-top: 1px solid #3a3f4d;
    }
    #systemInspector footer button {
      flex: 1;
      background: #2c3140;
      color: #e8eaf1;
      border: 1px solid #454b5e;
      border-radius: 5px;
      padding: 4px 6px;
      cursor: pointer;
    }
    #systemInspector footer button:disabled { opacity: 0.45; cursor: default; }
  `;
  document.head.appendChild(style);
}

/** delegation surface for view-3d-renderer's create/stop/redraw router */
export const SystemRenderer = { create, stop, redraw, isActive, setActions };
