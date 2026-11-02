# Globe Generation and Use

The **Globe World** workflow turns Fantasy Map Generator from a flat rectangular canvas into a complete, seamless planetary sphere. By configuring the world dimensions to 360° longitude, applying the dedicated `Globe World` heightmap template, and opening the 3D Globe renderer, you can generate and explore a full spherical planet with seamless oceans and trans-oceanic sea routes that cross the antimeridian.

---

## 1. Core Concepts

* **Equirectangular Projection**: Standard world maps map longitude (0° to 360°, or -180° to +180°) horizontally and latitude (+90° to -90°) vertically. For undistorted projection onto a sphere, the map canvas should have a **2:1 aspect ratio** (e.g. 2000 × 1000 or 1600 × 800 pixels).
* **The Antimeridian Seam**: On a flat map, the left edge ($X = 0$) and right edge ($X = \text{width}$) meet when wrapped into a cylinder or sphere. If land touches either edge, a vertical seam or sheared continent appears. The `Globe World` template prevents this by ensuring both edges are open ocean ($h < 20$).
* **Seam-Wrapped Navigation**: When a map spans 360° of longitude (`lonT === 360`), sea routes automatically wrap across the antimeridian. Ships sail directly between ports on opposite edges of the map rather than taking artificial detours across the entire canvas.

---

## 2. Generating a Globe World Map

To create a full globe world from scratch:

### Step 1: Set a 2:1 Map Canvas
1. Open **Options** → **Advanced** (_Advanced Options_ dialog).
2. Set the **Map size** to a 2:1 ratio (for example, `2000` width and `1000` height, or `1600 × 800`).
3. Click the checkmark to apply.

### Step 2: Configure World Coordinates
1. Open **Options** → **Climate** (_World Configurator_ dialog).
2. Set **Map size** to **100%**.
3. Set **Latitude** position to **50%** (equator centered).
4. Verify that the displayed coordinates show:
   * **Total Latitude**: `180°` (from 90° N to 90° S).
   * **Total Longitude**: `360°` (full planetary circumference).
5. Adjust equator and pole temperatures or global precipitation as desired, then click the checkmark to apply.

### Step 3: Select the Globe World Template
1. Open **Tools** → **Heightmap**.
2. Select **Erase** mode and open the **Template editor**.
3. In the _Select template_ dropdown, choose **Globe World** (template ID 14).
4. Click ▶ to execute the template.
5. Exit the Heightmap editor to let the generator calculate coastlines, biomes, rivers, states, and routes.

> **Tip:** You can also set **Globe World** as the default template in the **Options** tab so that clicking **New Map!** immediately rolls a fresh 360° globe.

---

## 3. How the `Globe World` Template Works

The built-in `Globe World` template definition:

```text
Hill 1 60-70 22-38 20-80
Hill 1 60-70 62-78 20-80
Hill 4-5 15-25 20-80 15-85
Smooth 2 0 0 0
Multiply 0.35 land 0 0
Range 2-3 60-75 25-75 25-75
Smooth 2 0 0 0
Mask 2 0 0 0
Smooth 3 0 0 0
```

### Key Elements of the Template:
* **Constrained Landmass Placement**: The initial continent hills and mountain ranges are constrained within 20% to 80% along the X axis. This leaves the eastern and western peripheries clear of major land blobs.
* **Edge Masking (`Mask 2`)**: `Mask` scales cell elevations down near the boundaries. Setting the fraction to `2` halves heights approaching the frame borders (`distance = 0`), ensuring any residual elevations drop below the sea level threshold ($h < 20$).
* **Seamless Oceans**: The leftmost and rightmost ~2% of grid columns remain ocean at all seeds, eliminating vertical cliffs and jagged coastlines when mapped onto a 3D sphere.
* **The `Power` Heightmap Tool**: The template generator supports the `Power` tool (`Power <exponent> <range>`), which applies non-linear exponent scaling `(h - 20) ** power + 20` to land or all cells to shape broad lowlands and steep ranges without altering coastline boundaries.

---

## 4. Seam-Wrapped Sea Routes

On regional maps (`lonT < 360`), sea routes terminate or turn away at the map edges. On full-globe maps (`lonT === 360`), seam-wrapping is enabled automatically for sea trade and naval routes:

* **Ghost Port Pairing (Toroidal Urquhart Graph)**: When building the sea route network, ports near the left and right borders are duplicated as "ghost" ports across the seam ($x \pm \text{width}$). The Urquhart edge generator pairs ports across the antimeridian just like adjacent ports.
* **Edge Adjacency Linking**: Water cells on the western frame edge ($x \le \text{grid.spacing}$) link bidirectionally to corresponding water cells on the eastern frame edge ($x \ge \text{width} - \text{grid.spacing}$) without mutating the underlying Voronoi cell structure.
* **Wrap-Aware Dijkstra Pathfinding**: Water path costs use toroidal distance `min(|dx|, width - |dx|)`, finding the shortest route across the antimeridian.
* **Seam-Split Path Rendering**: When a route crosses the antimeridian, its SVG path is split at the boundary into two cleanly separated sub-paths (ending at one frame edge and continuing from the opposite edge). This prevents horizontal visual streaks across the map canvas.
* **Accurate Circumnavigation Lengths**: The Routes Overview and shipping cost calculations measure the short wrapped distance rather than an artificial route traversing the full map.

---

## 5. Using the 3D Globe View

You can inspect and showcase your planet in interactive 3D at any time:

### Switching to Globe Mode
1. Open the **Layers** tab (or press <kbd>Tab</kbd>).
2. In the **View mode** row at the top, click **Globe**.
3. The generator renders your current map layers to an equirectangular texture and projects it onto a Three.js 3D sphere against a starry background.

### Navigation and Controls
* **Rotate the Globe**: Left-click and drag across the sphere to spin the planet in any direction.
* **Zoom**: Use the mouse scroll wheel or middle-click drag to zoom in close to continents or out to a distant orbital view (constrained between 1.5 and 10 scene units).
* **Pan**: Right-click and drag to translate the camera.
* **Auto-Rotation**: Open the 3D options panel (press <kbd>O</kbd> while in Globe view) to toggle auto-rotation and adjust spin speed.
* **Texture Resolution**: Select between `0.5x`, `1x`, `2x`, `4x`, or `8x` texture scaling in 3D options to balance sharpness and GPU performance.

### Partial / Regional Maps on the Globe
If you switch to Globe view on a map with `latT ≤ 179` (a regional or continental map), the generator automatically projects the map onto its exact geographic latitude and longitude position on the sphere, covering unmapped areas of the planet with a cloud layer.

### Returning to 2D Mode
Click **Standard** in the View mode row or press <kbd>Escape</kbd>. Exiting Globe mode disposes of the WebGL geometry, texture, and material buffers to free GPU memory for map generation and 2D editing.

---

## 6. Best Practices & Tips

1. **Keep Layer Styling Clean**: In Globe view, all visible 2D layers (borders, labels, biomes, relief icons, rivers, routes) are baked into the sphere texture. Turn off unwanted overlays (like grid lines or debug layers) in the **Layers** tab before switching to Globe view.
2. **View-Only Mode**: Globe view is for presentation, exploration, and export. All terrain sculpting (Heightmap, Wrap tool), burg placement, and political editing should be done in **Standard** view.
3. **Capture Screenshots**: Use the screenshot button in the 3D options panel to save high-resolution images of your globe without browser chrome.
