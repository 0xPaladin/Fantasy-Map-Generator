import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { countMaps, waitForMap, waitForNextMap } from "./wait-for-map";

test.describe("Verse Map Topography Transformation", () => {
  test.setTimeout(600_000);

  test("transforms Verse_2026-11-12-12-09.map to canonical Verse topography and saves", async ({ page, context }) => {
    await context.clearCookies();
    await context.addInitScript(() => localStorage.setItem("version", "99.99.99"));

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await waitForMap(page);

    const mapPath = path.resolve("public/Verse/Verse_2026-11-12-12-09.map");
    expect(fs.existsSync(mapPath)).toBe(true);

    const initialMaps = await countMaps(page);
    await page.locator("#mapToLoad").setInputFiles(mapPath);
    await waitForNextMap(page, initialMaps);
    await page.waitForTimeout(1000);

    // Run the complete canonical topography mutation inside the page
    const result = await page.evaluate(async () => {
      const p = (window as any).pack;
      const o = (window as any).options;
      const FMG = (window as any).FMG;

      // Seeded PRNG for deterministic placement
      let seedVal = 12195118;
      function rnd() {
        seedVal = (seedVal * 1664525 + 1013904223) >>> 0;
        return seedVal / 4294967296;
      }

      // 1. Identify Galactic Land Cells (h >= 20)
      const landCellIndices: number[] = [];
      const isLand = new Uint8Array(p.cells.i.length);
      for (let i = 0; i < p.cells.i.length; i++) {
        if (p.cells.h[i] >= 20) {
          landCellIndices.push(i);
          isLand[i] = 1;
        }
      }
      const totalLand = landCellIndices.length;

      // Distance helper
      function distSq(c1: number, c2: number): number {
        const [x1, y1] = p.cells.p[c1];
        const [x2, y2] = p.cells.p[c2];
        const dx = x1 - x2;
        const dy = y1 - y2;
        return dx * dx + dy * dy;
      }
      function distToPointSq(c: number, x: number, y: number): number {
        const [cx, cy] = p.cells.p[c];
        const dx = cx - x;
        const dy = cy - y;
        return dx * dx + dy * dy;
      }

      // 2. Network 1: The 31 Great Space Gates
      // Gate 0: Junction Gate at Sector (-1, -7) -> (980, 860) px
      let junctionCell = landCellIndices[0];
      let minJunctionDist = Infinity;
      for (const c of landCellIndices) {
        const d = distToPointSq(c, 980, 860);
        if (d < minJunctionDist) {
          minJunctionDist = d;
          junctionCell = c;
        }
      }

      const gateCells: number[] = [junctionCell];
      const gateMinDist = 260; // ~13,000 ly
      const gateMinDistSq = gateMinDist * gateMinDist;

      // Poisson-disk sample 30 peripheral gates
      const shuffledLand = [...landCellIndices].sort(() => rnd() - 0.5);
      for (const c of shuffledLand) {
        if (gateCells.length >= 31) break;
        let ok = true;
        for (const gc of gateCells) {
          if (distSq(c, gc) < gateMinDistSq) {
            ok = false;
            break;
          }
        }
        if (ok) gateCells.push(c);
      }

      // Fallback with relaxed distance if needed to reach 31 gates
      if (gateCells.length < 31) {
        const fallbackDistSq = 180 * 180;
        for (const c of shuffledLand) {
          if (gateCells.length >= 31) break;
          if (gateCells.includes(c)) continue;
          let ok = true;
          for (const gc of gateCells) {
            if (distSq(c, gc) < fallbackDistSq) {
              ok = false;
              break;
            }
          }
          if (ok) gateCells.push(c);
        }
      }

      // Sort peripheral gates (indices 1..30) by distance to canvas center (1000, 1000)
      const peripheralGates = gateCells.slice(1).sort((a, b) => distToPointSq(a, 1000, 1000) - distToPointSq(b, 1000, 1000));
      // Gates 1..7: Celestials
      // Gates 8..24: Hegemony (17)
      // Gates 25..29: Mi-Go Primacy (5)
      // Gate 30: Crysik Expanse (1)
      const orderedGates = [gateCells[0], ...peripheralGates];

      // 3. Network 2: 329 Precursor Waystations
      const waystationCells: number[] = [];
      const wsMinDist = 65; // ~3,250 ly
      const wsMinDistSq = wsMinDist * wsMinDist;
      const wsClearanceGateSq = 55 * 55;

      for (const c of shuffledLand) {
        if (waystationCells.length >= 329) break;
        if (orderedGates.includes(c)) continue;

        let ok = true;
        for (const gc of orderedGates) {
          if (distSq(c, gc) < wsClearanceGateSq) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;

        for (const wc of waystationCells) {
          if (distSq(c, wc) < wsMinDistSq) {
            ok = false;
            break;
          }
        }
        if (ok) waystationCells.push(c);
      }

      // Fallback if needed
      if (waystationCells.length < 329) {
        const fallbackWsDistSq = 45 * 45;
        for (const c of shuffledLand) {
          if (waystationCells.length >= 329) break;
          if (orderedGates.includes(c) || waystationCells.includes(c)) continue;
          let ok = true;
          for (const wc of waystationCells) {
            if (distSq(c, wc) < fallbackWsDistSq) {
              ok = false;
              break;
            }
          }
          if (ok) waystationCells.push(c);
        }
      }

      const activeWaystations = waystationCells.slice(0, 197);
      const derelictWaystations = waystationCells.slice(197);

      // 4. The 22 Verse Cultures
      p.cultures = [
        { name: "Wildlands", i: 0, removed: false, base: "VRGRY", origins: [null], shield: "round", type: "Generic", tags: [] },
        // Celestials
        { name: "Archilects (Celestial)", i: 1, base: "VRARC", shield: "hexagon", color: "#7b68ee", type: "Generic" },
        { name: "Archons (Celestial)", i: 2, base: "VRACN", shield: "heater", color: "#4682b4", type: "Generic" },
        { name: "Elysians (Celestial)", i: 3, base: "VRELY", shield: "vesicaPiscis", color: "#00ced1", type: "Generic" },
        { name: "Solari (Celestial)", i: 4, base: "VRSOL", shield: "boeotian", color: "#ffd700", type: "Generic" },
        { name: "Celestial Accord (Celestial)", i: 5, base: "VRCEL", shield: "kite", color: "#ff8c00", type: "Generic" },
        // Ancients
        { name: "Hegemony (Ancient)", i: 6, base: "VRHEG", shield: "oldFrench", color: "#b22222", type: "Generic" },
        { name: "Mi-Go Primacy (Ancient)", i: 7, base: "VRMIG", shield: "diamond", color: "#6a0dad", type: "Generic" },
        { name: "Huijhoh Sovereignty (Ancient)", i: 8, base: "VRHUI", shield: "dovetail", color: "#2e8b57", type: "Generic" },
        { name: "Crysik Expanse (Ancient)", i: 9, base: "VRCRY", shield: "embowed", color: "#00bfff", type: "Generic" },
        { name: "Echani Reach (Ancient)", i: 10, base: "VRECH", shield: "pavise", color: "#778899", type: "Generic" },
        { name: "Gray Syndicate (Ancient)", i: 11, base: "VRGRY", shield: "targe", color: "#708090", type: "Generic" },
        { name: "Xothians (Ancient)", i: 12, base: "VRMIG", shield: "diamond", color: "#3cb371", type: "Generic" },
        // Independents & Thralls
        { name: "The One (Nexus)", i: 13, base: "VRONE", shield: "square", color: "#ba55d3", type: "Generic" },
        { name: "Ascendancy (Independent)", i: 14, base: "VRGRY", shield: "round", color: "#cd853f", type: "Generic" },
        { name: "Collective (Independent)", i: 15, base: "VRGRY", shield: "round", color: "#20b2aa", type: "Generic" },
        { name: "Venar (Independent)", i: 16, base: "VRECH", shield: "pavise", color: "#dda0dd", type: "Generic" },
        { name: "Mazani (Independent)", i: 17, base: "VRSOL", shield: "kite", color: "#f4a460", type: "Generic" },
        { name: "Crimson Concord (Independent)", i: 18, base: "VRFRN", shield: "heater", color: "#dc143c", type: "Generic" },
        { name: "Wanderers (Frontier)", i: 19, base: "VRGRY", shield: "targe", color: "#9e9e9e", type: "Generic" },
        { name: "Data Conclave (Independent)", i: 20, base: "VRARC", shield: "hexagon", color: "#1e90ff", type: "Generic" },
        { name: "Gemeli (Independent)", i: 21, base: "VRELY", shield: "vesicaPiscis", color: "#ff69b4", type: "Generic" },
        { name: "Cthyre & Thralls (Frontier)", i: 22, base: "VRMIG", shield: "diamond", color: "#556b2f", type: "Generic" }
      ];

      // 5. Build 47 Canonical Polities
      // State 0 = Unclaimed Wilderness / Neutral
      const states: any[] = [
        {
          i: 0,
          name: "Wanderers' Confluence",
          fullName: "The Unclaimed Wilderness",
          color: "#555555",
          culture: 19,
          economy: {
            salesTax: 0,
            pollTax: 0,
            marketFee: 0,
            tariffs: [],
            adjustments: [],
            spent: { court: 0, military: 0, administration: 0, infrastructure: 0 },
            budget: { court: 0, military: 0, administration: 0, infrastructure: 0, corruption: 0 },
            collected: 0,
            pocketed: 0,
            treasury: 0
          },
          removed: false
        }
      ];

      // Helper to add state
      function addState(id: number, name: string, fullName: string, color: string, culture: number) {
        states[id] = {
          i: id,
          name,
          fullName,
          color,
          culture,
          type: "Generic",
          expansionism: 1,
          capital: 0,
          center: 0,
          coa: { t1: "heater" },
          diplomacy: [],
          campaigns: [],
          form: "Domain",
          formName: "Domain",
          economy: {
            salesTax: 0.05,
            pollTax: 1,
            marketFee: 10,
            tariffs: [],
            adjustments: [],
            spent: { court: 0, military: 0, administration: 0, infrastructure: 0 },
            budget: { court: 25, military: 25, administration: 25, infrastructure: 25, corruption: 0 }
          },
          removed: false
        };
      }

      // The 7 Celestial Havens (States 1..7) - Mixed Celestial Culture!
      const havenDefs = [
        { name: "Haven Core", fullName: "The Radiant Haven", color: "#ffcc00", gateIdx: 1 },
        { name: "Haven Bastion", fullName: "The Adamantine Haven", color: "#ff9900", gateIdx: 2 },
        { name: "Haven Foundry", fullName: "The Optimal Haven", color: "#6699ff", gateIdx: 3 },
        { name: "Haven Slipway", fullName: "The Zephyr Haven", color: "#33cccc", gateIdx: 4 },
        { name: "Haven Veritas", fullName: "The Scribe Haven", color: "#9966cc", gateIdx: 5 },
        { name: "Haven Borealis", fullName: "The Frontier Haven", color: "#e67300", gateIdx: 6 },
        { name: "Haven Nexus", fullName: "The Guardian Haven", color: "#ffaa33", gateIdx: 7 }
      ];
      havenDefs.forEach((h, idx) => {
        // Celestial culture rotates or uses archilects/archons/elysians/solari/guardians (1..5)
        addState(idx + 1, h.name, h.fullName, h.color, (idx % 5) + 1);
      });

      // The 5 Landed Independent Polities (States 8..12)
      addState(8, "The Ascendancy", "The Ascendancy", "#d2691e", 14);
      addState(9, "The Collective (Foundry)", "The Collective (Foundry Enclave)", "#20b2aa", 15);
      addState(10, "The Collective (Slipway)", "The Collective (Slipway Domain)", "#008b8b", 15);
      addState(11, "The Venar", "The Venar Scriptorium", "#ba55d3", 16);
      addState(12, "The Mazani", "The Mazani Sanctuary", "#e9967a", 17);

      // The Hegemony (22 Fiefdoms: States 13..34)
      const assizeNames = [
        "The Midnight Assize", "The Adamant Assize", "The Gilded Assize", "The Obsidian Assize",
        "The Iron Assize", "The Sanguine Assize", "The Aureate Assize", "The Umbral Assize",
        "The Cobalt Assize", "The Cinnabar Assize", "The Argent Assize", "The Sable Assize",
        "The Viridian Assize", "The Basalt Assize", "The Cinder Assize", "The Beryl Assize",
        "The Pelagic Assize"
      ];
      assizeNames.forEach((name, idx) => {
        const id = 13 + idx;
        const col = `hsl(${Math.round((idx * 17) % 40 + 340)}, ${70 + (idx % 20)}%, ${35 + (idx % 15)}%)`;
        addState(id, name.replace("The ", ""), name, col, 6);
      });

      const wildFiefdomNames = [
        "The Vhol-Khorat Reaches", "The Iron-Vein Marches", "The Shattered Pale",
        "The Null-Boundary", "The Ashen Chantry"
      ];
      wildFiefdomNames.forEach((name, idx) => {
        const id = 30 + idx;
        const col = `hsl(${Math.round(20 + idx * 10)}, 65%, 40%)`;
        addState(id, name.replace("The ", ""), name, col, 6);
      });

      // The Mi-Go Primacy (5 Hyperspace Domains: States 35..39)
      const migoDomains = [
        "The Yuggoth Nexus", "The Weeping Lattice", "The Spore-Weaver Artery",
        "The Gestation Spire", "The Deep-Node Current"
      ];
      migoDomains.forEach((name, idx) => {
        const id = 35 + idx;
        const col = `hsl(${Math.round(270 + idx * 12)}, 75%, ${30 + idx * 4}%)`;
        addState(id, name.replace("The ", ""), name, col, 7);
      });

      // The Huijhoh Sovereignty (3 Sub-Kingdoms: States 40..42)
      const huijhohKingdoms = [
        "The High Sovereign Hive", "The Brood-Tide Reaches", "The Abyssal Crown"
      ];
      huijhohKingdoms.forEach((name, idx) => {
        const id = 40 + idx;
        const col = `hsl(${Math.round(140 + idx * 25)}, 70%, ${32 + idx * 5}%)`;
        addState(id, name.replace("The ", ""), name, col, 8);
      });

      // The Crysik Expanse (State 43)
      addState(43, "Crysik Expanse", "The Crysik Expanse", "#00bfff", 9);

      // The One (State 44)
      addState(44, "The One", "The One (Prime Assimilation Nexus)", "#9400d3", 13);

      // The Echani Reach (3 Archive Clusters: States 45..47)
      const echaniClusters = [
        "The Quiescent Nine", "The Crysteel Codex", "The Chrono-Vault"
      ];
      echaniClusters.forEach((name, idx) => {
        const id = 45 + idx;
        const col = `hsl(${Math.round(210 + idx * 15)}, 40%, ${45 + idx * 5}%)`;
        addState(id, name.replace("The ", ""), name, col, 10);
      });

      p.states = states;

      // 6. Territorial Growth on Cells
      const cellState = new Uint16Array(p.cells.i.length); // 0 by default (wilderness)
      const cellCulture = new Uint16Array(p.cells.i.length);

      // Initialize all land cells to Wilderness (state 0, Wanderers culture 19)
      for (const c of landCellIndices) {
        cellState[c] = 0;
        cellCulture[c] = 19;
      }

      // Find free land cell nearest to (x, y)
      function findFreeLandNear(x: number, y: number): number {
        let best = -1;
        let bestDist = Infinity;
        for (const c of landCellIndices) {
          if (cellState[c] !== 0) continue;
          const d = distToPointSq(c, x, y);
          if (d < bestDist) {
            bestDist = d;
            best = c;
          }
        }
        return best !== -1 ? best : landCellIndices[0];
      }

      // Compact BFS growth helper
      function growCompact(rootCell: number, stateId: number, targetCount: number, cultureId?: number): number[] {
        const claimed: number[] = [];
        const queue = [rootCell];
        const visited = new Uint8Array(p.cells.i.length);
        visited[rootCell] = 1;

        while (queue.length > 0 && claimed.length < targetCount) {
          // Sort queue by distance to root
          queue.sort((a, b) => distSq(a, rootCell) - distSq(b, rootCell));
          const current = queue.shift()!;
          if (cellState[current] === 0 || current === rootCell) {
            cellState[current] = stateId;
            if (cultureId) cellCulture[current] = cultureId;
            claimed.push(current);
          }

          for (const neighbor of p.cells.c[current]) {
            if (!visited[neighbor] && isLand[neighbor] && cellState[neighbor] === 0) {
              visited[neighbor] = 1;
              queue.push(neighbor);
            }
          }
        }
        return claimed;
      }

      // Dendritic BFS growth helper
      function growDendrite(rootCell: number, stateId: number, targetCount: number, cultureId: number): number[] {
        const claimed: number[] = [];
        const frontier = [rootCell];
        const visited = new Uint8Array(p.cells.i.length);
        visited[rootCell] = 1;

        while (frontier.length > 0 && claimed.length < targetCount) {
          // Pick with randomness to branch out
          const idx = Math.floor(rnd() * frontier.length);
          const current = frontier.splice(idx, 1)[0];

          if (cellState[current] === 0 || current === rootCell) {
            cellState[current] = stateId;
            cellCulture[current] = cultureId;
            claimed.push(current);
          }

          for (const neighbor of p.cells.c[current]) {
            if (!visited[neighbor] && isLand[neighbor] && cellState[neighbor] === 0) {
              visited[neighbor] = 1;
              frontier.push(neighbor);
            }
          }
        }
        return claimed;
      }

      // Arterial BFS growth along hyperlane conduit graph
      function growArtery(rootCell: number, stateId: number, targetCount: number, cultureId: number, corridorSet: Set<number>): number[] {
        const claimed: number[] = [];
        const queue = [rootCell];
        const visited = new Uint8Array(p.cells.i.length);
        visited[rootCell] = 1;

        while (queue.length > 0 && claimed.length < targetCount) {
          // Prefer cells in the conduit corridor
          queue.sort((a, b) => {
            const aCorridor = corridorSet.has(a) ? 0 : 1;
            const bCorridor = corridorSet.has(b) ? 0 : 1;
            if (aCorridor !== bCorridor) return aCorridor - bCorridor;
            return distSq(a, rootCell) - distSq(b, rootCell);
          });

          const current = queue.shift()!;
          if (cellState[current] === 0 || current === rootCell) {
            cellState[current] = stateId;
            cellCulture[current] = cultureId;
            claimed.push(current);
          }

          for (const neighbor of p.cells.c[current]) {
            if (!visited[neighbor] && isLand[neighbor] && cellState[neighbor] === 0) {
              visited[neighbor] = 1;
              queue.push(neighbor);
            }
          }
        }
        return claimed;
      }

      // Active conduit cell set for arterial routing
      const activeConduitCellSet = new Set<number>([...activeWaystations]);
      // Connect nearest active waystations
      for (const ws of activeWaystations) {
        const sorted = [...activeWaystations].filter(c => c !== ws).sort((a, b) => distSq(ws, a) - distSq(ws, b));
        for (let k = 0; k < Math.min(3, sorted.length); k++) {
          activeConduitCellSet.add(sorted[k]);
        }
      }

      // --- PHASE 6A: Grow the 7 Celestial Havens (~146 cells each) ---
      const celestialCultures = [1, 2, 3, 4, 5]; // Mixed celestial cultures!
      const havenCellsMap: number[][] = [];

      for (let i = 0; i < 7; i++) {
        const havenId = i + 1;
        const gateCell = orderedGates[i + 1];
        const claimedHaven = growCompact(gateCell, havenId, 146);
        havenCellsMap[havenId] = claimedHaven;

        // Mixed Celestial Culture across the haven!
        claimedHaven.forEach((cell, cIdx) => {
          cellCulture[cell] = celestialCultures[cIdx % celestialCultures.length];
        });
      }

      // Carve out 5 Landed Independent Polities inside their host Havens
      // Preserving a 1-cell Celestial perimeter ring and anchoring the Haven Gate
      function carveEnclave(hostHavenId: number, enclaveId: number, enclaveCulture: number, targetCount: number) {
        const havenCells = havenCellsMap[hostHavenId];
        const gateCell = orderedGates[hostHavenId];

        // Identify inner cells (cells not on the outer boundary of the haven)
        const innerCells = havenCells.filter(c => {
          if (c === gateCell) return false;
          // check if all neighbors are in the haven
          const allInside = p.cells.c[c].every((n: number) => havenCells.includes(n));
          return allInside;
        });

        const carveQueue = innerCells.slice(0, targetCount);
        for (const c of carveQueue) {
          cellState[c] = enclaveId;
          cellCulture[c] = enclaveCulture;
        }
      }

      // 8: Ascendancy (78 cells in Haven Foundry #3)
      carveEnclave(3, 8, 14, 78);
      // 9: Collective Foundry (34 cells in Haven Foundry #3)
      carveEnclave(3, 9, 15, 34);
      // 10: Collective Slipway (96 cells in Haven Slipway #4)
      carveEnclave(4, 10, 15, 96);
      // 11: Venar (52 cells in Haven Veritas #5)
      carveEnclave(5, 11, 16, 52);
      // 12: Mazani (8 cells in Haven Borealis #6)
      carveEnclave(6, 12, 17, 8);

      // --- PHASE 6B: Grow 22 Hegemony Fiefdoms (12% = ~1,755 cells, ~80 cells/fiefdom) ---
      // 17 Gate Assizes (States 13..29)
      for (let i = 0; i < 17; i++) {
        const stateId = 13 + i;
        const gateCell = orderedGates[8 + i];
        growDendrite(gateCell, stateId, 80, 6);
      }
      // 5 Wild Fiefdoms (States 30..34)
      const wildSeeds = [
        findFreeLandNear(400, 500),
        findFreeLandNear(1600, 600),
        findFreeLandNear(500, 1500),
        findFreeLandNear(1500, 1500),
        findFreeLandNear(1000, 1700)
      ];
      wildSeeds.forEach((seedCell, idx) => {
        const stateId = 30 + idx;
        growDendrite(seedCell, stateId, 78, 6);
      });

      // --- PHASE 6C: Grow 5 Mi-Go Hyperspace Domains (10% = ~1,462 cells, ~292 cells/domain) ---
      for (let i = 0; i < 5; i++) {
        const stateId = 35 + i;
        const gateCell = orderedGates[25 + i];
        growArtery(gateCell, stateId, 292, 7, activeConduitCellSet);
      }

      // --- PHASE 6D: Grow 3 Huijhoh Sub-Kingdoms (8% = ~1,170 cells, ~390 cells/kingdom) ---
      const huijhohSeeds = [
        findFreeLandNear(1200, 450),
        findFreeLandNear(1650, 1100),
        findFreeLandNear(600, 800)
      ];
      huijhohSeeds.forEach((seedCell, idx) => {
        const stateId = 40 + idx;
        growCompact(seedCell, stateId, 390, 8);
      });

      // --- PHASE 6E: Grow Crysik Expanse (5% = ~731 cells) ---
      const crysikGate = orderedGates[30];
      growCompact(crysikGate, 43, 731, 9);

      // --- PHASE 6F: Grow The One (3% = ~439 cells) ---
      const theOneRoot = activeWaystations[activeWaystations.length - 1];
      growArtery(theOneRoot, 44, 439, 13, activeConduitCellSet);

      // --- PHASE 6G: Grow 3 Echani Archive Clusters (<1% = ~39 cells, 13 cells/cluster) ---
      const echaniSeeds = [
        findFreeLandNear(350, 1200),
        findFreeLandNear(1750, 800),
        findFreeLandNear(800, 1600)
      ];
      echaniSeeds.forEach((seedCell, idx) => {
        const stateId = 45 + idx;
        growCompact(seedCell, stateId, 13, 10);
      });

      // Assign cell state and culture to pack
      p.cells.state = cellState;
      p.cells.culture = cellCulture;

      // 7. Star Systems (Burgs) & Capitals
      // Re-initialize pack.burgs
      const burgs: any[] = [
        { i: 0, name: "Uninhabited", removed: true }
      ];

      // Reset cell burg pointers
      const cellBurg = new Uint16Array(p.cells.i.length);

      // Helper to add burg
      function createBurg(cell: number, name: string, isCapital = 0, isGate = 0, wsStatus: 0 | 1 | 2 = 0) {
        const id = burgs.length;
        const [x, y] = p.cells.p[cell];
        const state = cellState[cell] || 0;
        const culture = cellCulture[cell] || 19;
        const b = {
          i: id,
          cell,
          x,
          y,
          state,
          culture,
          name,
          capital: isCapital,
          port: isGate || isCapital ? 1 : 0,
          citadel: isGate || isCapital ? 1 : 0,
          walls: isGate ? 1 : 0,
          plaza: 1,
          temple: 0,
          shanty: 0,
          feature: p.cells.f[cell] || 1,
          spaceGate: isGate ? 1 : undefined,
          waystation: wsStatus ? wsStatus : undefined,
          population: isCapital ? 85 : isGate ? 65 : 25,
          type: "Generic",
          group: isCapital ? "Capitals" : "Generic",
          coa: {
            t1: "circle",
            charges: [{ current: "star", color: isGate ? "gold" : "silver" }]
          }
        };
        burgs.push(b);
        cellBurg[cell] = id;
        if (isCapital && state > 0 && p.states[state]) {
          p.states[state].capital = id;
          p.states[state].center = cell;
        }
        return b;
      }

      // Add Junction Gate burg
      createBurg(orderedGates[0], "Junction", 0, 1, 0);

      // Add 7 Celestial Haven Gate Capitals
      const havenCapitalNames = [
        "Radiant Citadel", "Adamant Bastion", "Foundry Prime", "Zephyr Slipway",
        "Scribe Archive", "Borealis Vanguard", "Guardian Nexus"
      ];
      for (let i = 0; i < 7; i++) {
        const havenId = i + 1;
        createBurg(orderedGates[havenId], havenCapitalNames[i], 1, 1, 0);
      }

      // Add 5 Landed Independent Capitals
      const independentCapitals = [
        { state: 8, name: "Ascendant Spire" },
        { state: 9, name: "Foundry Core Enclave" },
        { state: 10, name: "Slipway Concourse" },
        { state: 11, name: "Venar Scriptorium" },
        { state: 12, name: "Mazani Sanctuary" }
      ];
      independentCapitals.forEach(ic => {
        // find a cell in this enclave
        const cell = landCellIndices.find(c => cellState[c] === ic.state) || landCellIndices[0];
        createBurg(cell, ic.name, 1, 0, 0);
      });

      // Add 17 Hegemony Assize Gate Capitals
      for (let i = 0; i < 17; i++) {
        const stateId = 13 + i;
        const gateCell = orderedGates[8 + i];
        const stateName = p.states[stateId].name;
        createBurg(gateCell, `${stateName} Throne`, 1, 1, 0);
      }

      // Add 5 Hegemony Wild Fiefdom Capitals
      wildSeeds.forEach((cell, idx) => {
        const stateId = 30 + idx;
        const stateName = p.states[stateId].name;
        createBurg(cell, `${stateName} Bastion`, 1, 0, 0);
      });

      // Add 5 Mi-Go Primacy Gate Capitals
      for (let i = 0; i < 5; i++) {
        const stateId = 35 + i;
        const gateCell = orderedGates[25 + i];
        const stateName = p.states[stateId].name;
        createBurg(gateCell, `${stateName} Hive`, 1, 1, 0);
      }

      // Add 3 Huijhoh Sub-Kingdom Capitals
      huijhohSeeds.forEach((cell, idx) => {
        const stateId = 40 + idx;
        const stateName = p.states[stateId].name;
        createBurg(cell, `${stateName} Nest`, 1, 0, 0);
      });

      // Add Crysik Expanse Gate Capital
      createBurg(orderedGates[30], "Crysik Central Core", 1, 1, 0);

      // Add The One Prime Nexus Capital
      createBurg(theOneRoot, "Assimilation Nexus Zero", 1, 0, 1);

      // Add 3 Echani Archive Capitals
      echaniSeeds.forEach((cell, idx) => {
        const stateId = 45 + idx;
        const stateName = p.states[stateId].name;
        createBurg(cell, `${stateName} Vault`, 1, 0, 0);
      });

      // Add remaining 196 Active Waystations as burgs
      activeWaystations.forEach((cell, idx) => {
        if (cellBurg[cell] === 0) {
          createBurg(cell, `Conduit Node ${idx + 1}`, 0, 0, 1);
        }
      });

      // Add all 132 Derelict Waystations as burgs
      derelictWaystations.forEach((cell, idx) => {
        if (cellBurg[cell] === 0) {
          createBurg(cell, `Derelict Array ${idx + 1}`, 0, 0, 2);
        }
      });

      p.burgs = burgs;
      p.cells.burg = cellBurg;

      // 8. Markers & Notes
      p.markers = [];
      const notes: any[] = [];

      // Gate markers
      orderedGates.forEach((cell, idx) => {
        const b = burgs[cellBurg[cell]];
        const markerId = p.markers.length;
        const isJunction = idx === 0;
        const gateName = isJunction ? "Junction Gate" : `Peripheral Gate ${idx}`;
        const marker = {
          i: markerId,
          type: "spaceGates",
          icon: "🌌",
          x: b.x,
          y: b.y,
          cell,
          size: 32
        };
        p.markers.push(marker);

        notes.push({
          id: `marker${markerId}`,
          name: `${gateName} (${b.name})`,
          legend: `<p><strong>${gateName}</strong></p><p>A colossal Precursor Space Gate ring establishing instantaneous trans-galactic transit. Connected star system: ${b.name}.</p>`
        });
      });

      // Active Waystation markers
      activeWaystations.forEach((cell, idx) => {
        const b = burgs[cellBurg[cell]];
        const markerId = p.markers.length;
        const marker = {
          i: markerId,
          type: "waystations",
          icon: "🛰️",
          x: b.x,
          y: b.y,
          cell,
          size: 24
        };
        p.markers.push(marker);

        notes.push({
          id: `marker${markerId}`,
          name: `Active Waystation ${idx + 1} (${b.name})`,
          legend: `<p><strong>Active Precursor Waystation</strong></p><p>Operational hyperspace lattice repeater relaying regional hyperlanes. System: ${b.name}.</p>`
        });
      });

      // Derelict Waystation markers
      derelictWaystations.forEach((cell, idx) => {
        const b = burgs[cellBurg[cell]];
        const markerId = p.markers.length;
        const marker = {
          i: markerId,
          type: "derelictWaystations",
          icon: "⚠️",
          x: b.x,
          y: b.y,
          cell,
          size: 22
        };
        p.markers.push(marker);

        notes.push({
          id: `marker${markerId}`,
          name: `Derelict Waystation ${idx + 1} (${b.name})`,
          legend: `<p><strong>Derelict Precursor Waystation</strong></p><p>Inert ancient superstructure; dormant hyperlane beacon prone to severe planar gravitational shear. System: ${b.name}.</p>`
        });
      });

      (window as any).notes = notes;

      // 9. Hyperspace Conduit Routes (k=3 Lattice)
      const routes: any[] = [];
      const connectedPairs = new Set<string>();

      function addRoute(c1: number, c2: number) {
        const k1 = `${Math.min(c1, c2)}-${Math.max(c1, c2)}`;
        if (connectedPairs.has(k1)) return;
        connectedPairs.has(k1);
        connectedPairs.add(k1);

        const [x1, y1] = p.cells.p[c1];
        const [x2, y2] = p.cells.p[c2];
        routes.push({
          i: routes.length,
          feature: 1,
          group: "roads",
          points: [[x1, y1], [x2, y2]]
        });
      }

      // Connect each active waystation to 3 nearest active waystations
      for (const ws of activeWaystations) {
        const neighbors = [...activeWaystations]
          .filter(c => c !== ws)
          .sort((a, b) => distSq(ws, a) - distSq(ws, b))
          .slice(0, 3);
        for (const n of neighbors) {
          addRoute(ws, n);
        }
      }

      // Connect peripheral gates to their 2 nearest active waystations
      for (let i = 1; i < orderedGates.length; i++) {
        const gc = orderedGates[i];
        const nearestWs = [...activeWaystations]
          .sort((a, b) => distSq(gc, a) - distSq(gc, b))
          .slice(0, 2);
        for (const ws of nearestWs) {
          addRoute(gc, ws);
        }
      }

      p.routes = routes;

      // 10. Sectors (Provinces)
      p.provinces = [
        { i: 0, name: "Unclaimed", fullName: "Unclaimed Sector", removed: true }
      ];
      p.cells.province = new Uint16Array(p.cells.i.length);

      for (let sId = 1; sId < p.states.length; sId++) {
        const state = p.states[sId];
        if (!state || state.removed) continue;
        const provId = p.provinces.length;
        p.provinces.push({
          i: provId,
          state: sId,
          name: `${state.name} Sector`,
          fullName: `${state.fullName} Sector Alpha`,
          color: state.color,
          center: state.center,
          burg: state.capital,
          removed: false
        });

        for (const c of landCellIndices) {
          if (cellState[c] === sId) {
            p.cells.province[c] = provId;
          }
        }
      }

      // Ensure all cultures have unique centers, expansionism, etc.
      const usedCultureCenters = new Set<number>();
      for (let i = 1; i < p.cultures.length; i++) {
        const cult = p.cultures[i];
        cult.type = cult.type || "Generic";
        cult.expansionism = cult.expansionism || 1;
        cult.development = 30;
        cult.origins = [0];
        cult.tags = [];
        cult.code = cult.name.slice(0, 3).toUpperCase();

        const cultBurgs = burgs.filter(b => b.i && !b.removed && b.culture === cult.i);
        let centerCell: number | undefined;

        // Prefer capital burg, then any burg, then land cell of that culture
        const cap = cultBurgs.find(b => b.capital && !usedCultureCenters.has(b.cell));
        if (cap) {
          centerCell = cap.cell;
        } else {
          const bg = cultBurgs.find(b => !usedCultureCenters.has(b.cell));
          if (bg) {
            centerCell = bg.cell;
          } else {
            for (const c of landCellIndices) {
              if (cellCulture[c] === cult.i && !usedCultureCenters.has(c)) {
                centerCell = c;
                break;
              }
            }
          }
        }

        if (centerCell === undefined) {
          for (const c of landCellIndices) {
            if (!usedCultureCenters.has(c)) {
              centerCell = c;
              break;
            }
          }
        }

        cult.center = centerCell ?? landCellIndices[0];
        usedCultureCenters.add(cult.center);
      }

      // 11. Astral Economy & Metadata
      o.map.lore.name = "The Verse";
      o.map.cultures.set = "verse";
      o.map.astral = true;
      o.map.units.distance.unit = "ly";
      o.map.units.distance.scale = 50;

      if (FMG.Goods?.switchToAstralGoods) {
        FMG.Goods.switchToAstralGoods();
      }
      if (FMG.Goods?.generate) {
        FMG.Goods.generate();
      }
      if (FMG.States?.collectStatistics) {
        FMG.States.collectStatistics();
      }
      if (FMG.Markets?.generate) {
        FMG.Markets.generate();
      }
      if (FMG.Production?.produce) {
        FMG.Production.produce();
      }

      // 12. Redraw all Layers
      if (FMG.Layers) {
        FMG.Layers.drawAll();
      }

      // Calculate statistics
      let claimedCellsCount = 0;
      for (const c of landCellIndices) {
        if (cellState[c] > 0) claimedCellsCount++;
      }

      return {
        totalLand,
        claimedCellsCount,
        claimedPct: ((claimedCellsCount / totalLand) * 100).toFixed(1) + "%",
        gatesCount: orderedGates.length,
        waystationsCount: waystationCells.length,
        burgsCount: burgs.length - 1,
        statesCount: states.length - 1,
        markersCount: p.markers.length,
        routesCount: routes.length
      };
    });

    console.log("Transformation completed:", result);
    expect(result.gatesCount).toBe(31);
    expect(result.waystationsCount).toBe(329);
    expect(result.statesCount).toBe(47);

    // Save screenshot of the rendered astral map
    const screenshotDir = path.resolve("tests/screenshots");
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, "verse-canonical-astral.png");
    await page.screenshot({ path: screenshotPath });
    console.log("Saved verification screenshot to:", screenshotPath);

    // Also copy screenshot to artifact directory for the user
    const artifactScreenshotPath = "/home/paladin/.gemini/antigravity/brain/6734fcd9-f48c-4093-8ae9-8be05713ba20/verse-canonical-astral.png";
    try {
      fs.copyFileSync(screenshotPath, artifactScreenshotPath);
    } catch (e) {
      console.warn("Could not copy screenshot to artifact dir:", e);
    }

    // Serialize and overwrite public/Verse/Verse_2026-11-12-12-09.map
    const serializedMap = await page.evaluate(async () => {
      const FMG = (window as any).FMG;
      return await FMG.Services.Save.prepareMapData();
    });

    expect(serializedMap && serializedMap.length > 1000).toBe(true);

    // Ensure CRLF line endings for save format
    let crlfMap = serializedMap;
    if (!crlfMap.includes("\r\n")) {
      const svgMatch = crlfMap.match(/<svg[^>]*id="map"[\s\S]*?<\/svg>/)?.[0];
      const placeholder = "___SVG_PLACEHOLDER___";
      if (svgMatch) {
        crlfMap = crlfMap.replace(svgMatch, placeholder);
        crlfMap = crlfMap.split("\n").join("\r\n").replace(placeholder, svgMatch);
      } else {
        crlfMap = crlfMap.split("\n").join("\r\n");
      }
    }

    fs.writeFileSync(mapPath, crlfMap, "utf8");
    console.log(`Saved updated Verse map (${crlfMap.length} bytes) to ${mapPath}`);
  });
});
