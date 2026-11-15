import { expect, test, type Page } from "@playwright/test";
import { waitForMap } from "./wait-for-map";

// the app's console surface, see src/app/fmg.ts
declare const FMG: any;

declare const options: { map: { astral: boolean; networks: { i: number; name: string; nodes: unknown[] }[] } };
declare const pack: import("@/types/packed-graph").PackedGraph;

const editor = "#astralNetworkEditor";
const manager = "#astralNetworks";

// the version-update changelog opens over the map and eats map clicks
async function dismissChangelog(page: Page): Promise<void> {
  const close = page.locator('.dialog-window:has-text("Generator update") .dialog-titlebar-close');
  if (await close.isVisible().catch(() => false)) await close.click();
}

test.describe("Astral networks", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/?seed=astral-networks&width=1280&height=720");
    await waitForMap(page);
    await page.waitForTimeout(300);
    await dismissChangelog(page);
  });

  test("creates, draws, edits and removes a network on its own layer", async ({ page }) => {
    await page.evaluate(() => FMG.Controllers.AstralMode.enter());
    await page.waitForTimeout(500);
    await dismissChangelog(page);

    await page.evaluate(() => FMG.Controllers.AstralNetworks.open());
    await expect(page.locator(manager)).toBeVisible();
    await page.click("#networksCreate");
    await expect(page.locator(editor)).toBeVisible();

    await page.fill("#networkName", "The Veil Run");
    await page.fill("#networkTarget", "8");
    await page.click("#networkSave");

    // create switches the dialog to edit mode for the new network
    await expect(page.locator(editor)).toBeVisible();
    await expect(page.locator("#networkName")).toHaveValue("The Veil Run");
    await expect.poll(() => page.evaluate(() => options.map.networks.length)).toBe(1);

    const network = await page.evaluate(() => {
      const item = options.map.networks[0];
      return {
        i: item.i,
        nodes: item.nodes.length,
        routes: pack.routes.filter(route => route.networkId === item.i).map(route => route.i)
      };
    });
    expect(network.nodes).toBeGreaterThan(1);
    expect(network.routes.length).toBeGreaterThan(0);

    // the nodes and links live on the networks layer, not on the routes layer
    await expect(page.locator(`#network${network.i}`)).toHaveCount(1);
    expect(await page.locator(`#network${network.i} [data-node]`).count()).toBeGreaterThan(0);
    expect(
      await page.evaluate(id => document.getElementById(`route${id}`)?.closest("#routes") ?? null, network.routes[0])
    ).toBeNull();
    expect(
      await page.evaluate(id => document.getElementById(`route${id}`)?.closest("#networks") !== null, network.routes[0])
    ).toBe(true);

    await page.click("#networkCancel");
    await expect(page.locator(editor)).toHaveCount(0);

    // the layer button controls the whole overlay
    await page.evaluate(() => FMG.Layers.hide("networks"));
    await expect(page.locator(`#network${network.i}`)).toHaveCount(0);
    await page.evaluate(() => FMG.Layers.show("networks"));
    await expect(page.locator(`#network${network.i}`)).toHaveCount(1);

    // a map click on a node reopens the network editor
    await page.evaluate(() => FMG.Dialog.closeAll());
    await page.locator(`#network${network.i} [data-node="0"]`).click({ force: true });
    await expect(page.locator(editor)).toBeVisible();
    await expect(page.locator("#networkName")).toHaveValue("The Veil Run");

    // removing the network takes its links out of the Routes store too
    await page.click("#networkRemove");
    await page.locator(".dialog-window:has(.message) .dialog-buttonpane button:first-child").click();
    await expect(page.locator(manager)).toBeVisible();
    await expect.poll(() => page.evaluate(() => options.map.networks.length)).toBe(0);
    expect(await page.evaluate(() => pack.routes.some(route => route.networkId !== undefined))).toBe(false);

    await page.evaluate(() => FMG.Controllers.AstralMode.exit());
    await expect.poll(() => page.evaluate(() => options.map.astral)).toBe(false);
  });
});