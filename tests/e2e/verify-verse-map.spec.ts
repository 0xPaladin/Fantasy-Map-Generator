import { test, expect } from "@playwright/test";
import path from "path";
import { countMaps, waitForMap, waitForNextMap } from "./wait-for-map";

test.describe("Verse Map Verification", () => {
  test.setTimeout(180_000);

  test("verifies loaded transformed Verse map and Precursor dialog icons", async ({ page, context }) => {
    await context.clearCookies();
    await context.addInitScript(() => localStorage.setItem("version", "99.99.99"));

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await waitForMap(page);

    const mapPath = path.resolve("public/Verse/Verse_2026-11-12-12-09.map");
    const initialMaps = await countMaps(page);
    await page.locator("#mapToLoad").setInputFiles(mapPath);
    await waitForNextMap(page, initialMaps);
    await page.waitForTimeout(1000);

    const verify = await page.evaluate(() => {
      const p = (window as any).pack;
      const o = (window as any).options;

      const activeStates = p.states.filter((s: any) => s && !s.removed && s.i > 0);
      const gateBurgs = p.burgs.filter((b: any) => b && !b.removed && b.spaceGate === 1);
      const activeWsBurgs = p.burgs.filter((b: any) => b && !b.removed && b.waystation === 1);
      const derelictWsBurgs = p.burgs.filter((b: any) => b && !b.removed && b.waystation === 2);
      const gateMarkers = p.markers.filter((m: any) => m.type === "spaceGates");
      const wsMarkers = p.markers.filter((m: any) => m.type === "waystations");
      const derelictMarkers = p.markers.filter((m: any) => m.type === "derelictWaystations");

      // Verify pixel alignment between burgs and markers
      let misaligned = 0;
      for (const m of p.markers) {
        const b = p.burgs.find((burg: any) => burg && !burg.removed && burg.cell === m.cell);
        if (!b || Math.abs(b.x - m.x) > 0.01 || Math.abs(b.y - m.y) > 0.01) {
          misaligned++;
        }
      }

      // Check Haven culture composition
      // States 1..7: check that cultures across Haven cells are mixed (contain multiple celestial cultures)
      const havenCultures = new Set<number>();
      for (let c = 0; c < p.cells.i.length; c++) {
        if (p.cells.state[c] >= 1 && p.cells.state[c] <= 7) {
          havenCultures.add(p.cells.culture[c]);
        }
      }

      return {
        mapName: o.map.lore?.name,
        astral: o.map.astral,
        statesCount: activeStates.length,
        gateBurgsCount: gateBurgs.length,
        activeWsBurgsCount: activeWsBurgs.length,
        derelictWsBurgsCount: derelictWsBurgs.length,
        gateMarkersCount: gateMarkers.length,
        wsMarkersCount: wsMarkers.length,
        derelictMarkersCount: derelictMarkers.length,
        misalignedMarkersCount: misaligned,
        havenDistinctCulturesCount: havenCultures.size,
        firstGateBurgId: gateBurgs[0]?.i,
        firstWsBurgId: activeWsBurgs[0]?.i
      };
    });

    console.log("Verification results:", verify);
    expect(verify.mapName).toBe("The Verse");
    expect(verify.astral).toBe(true);
    expect(verify.statesCount).toBe(47);
    expect(verify.gateBurgsCount).toBe(31);
    expect(verify.activeWsBurgsCount).toBe(197);
    expect(verify.derelictWsBurgsCount).toBe(132);
    expect(verify.gateMarkersCount).toBe(31);
    expect(verify.wsMarkersCount).toBe(197);
    expect(verify.derelictMarkersCount).toBe(132);
    expect(verify.misalignedMarkersCount).toBe(0); // 100% pixel-perfect alignment!
    expect(verify.havenDistinctCulturesCount).toBe(5); // Mixed celestial cultures!

    // Test opening the System Dialog on a Gate star system
    await page.evaluate((burgId) => {
      const FMG = (window as any).FMG;
      FMG.Controllers.AstralSystemEditor.open(burgId);
    }, verify.firstGateBurgId);

    await page.waitForSelector("#astralSystemEditor", { state: "visible" });

    // Verify Precursor line and Space Gate icon in system dialog
    const gateIconState = await page.evaluate(() => {
      const line = document.getElementById("systemPrecursorLine");
      const gateIcon = document.getElementById("systemSpaceGate");
      const activeWsIcon = document.getElementById("systemWaystationActive");
      return {
        lineVisible: line && window.getComputedStyle(line).display !== "none",
        isGateActive: gateIcon && !gateIcon.classList.contains("inactive"),
        isWsInactive: activeWsIcon && activeWsIcon.classList.contains("inactive")
      };
    });

    console.log("Gate System dialog icon state:", gateIconState);
    expect(gateIconState.lineVisible).toBe(true);
    expect(gateIconState.isGateActive).toBe(true);
    expect(gateIconState.isWsInactive).toBe(true);

    // Close and open an Active Waystation star system
    await page.evaluate((burgId) => {
      const FMG = (window as any).FMG;
      FMG.Controllers.AstralSystemEditor.open(burgId);
    }, verify.firstWsBurgId);

    const wsIconState = await page.evaluate(() => {
      const line = document.getElementById("systemPrecursorLine");
      const gateIcon = document.getElementById("systemSpaceGate");
      const activeWsIcon = document.getElementById("systemWaystationActive");
      return {
        lineVisible: line && window.getComputedStyle(line).display !== "none",
        isGateInactive: gateIcon && gateIcon.classList.contains("inactive"),
        isWsActive: activeWsIcon && !activeWsIcon.classList.contains("inactive")
      };
    });

    console.log("Waystation System dialog icon state:", wsIconState);
    expect(wsIconState.lineVisible).toBe(true);
    expect(wsIconState.isGateInactive).toBe(true);
    expect(wsIconState.isWsActive).toBe(true);
  });
});
