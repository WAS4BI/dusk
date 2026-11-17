// Chrome Web Store screenshots (1280x800) into ../store/screenshots, with Playwright's own
// Chromium and Dusk loaded unpacked (never your Chrome).
//   cd tests && node store-shots.mjs
import { chromium } from "playwright";
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "store", "screenshots");
mkdirSync(out, { recursive: true });
const W = 1280, H = 800;

const profile = mkdtempSync(path.join(tmpdir(), "dusk-store-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: !process.env.HEADED,
  viewport: { width: W, height: H },
  colorScheme: "light",
  locale: "en-US",
  args: ["--lang=en-US", `--disable-extensions-except=${root}`, `--load-extension=${root}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const extId = new URL(sw.url()).host;
const set = (s) => sw.evaluate((s) => chrome.storage.sync.set(s), s);
await sw.evaluate(async () => { await chrome.storage.sync.clear(); await chrome.storage.local.clear(); });

async function shot(name, url, { wait = 2500, settings = { enabled: true, sites: {} }, after } = {}) {
  await set(settings);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 60000 }).catch((e) => console.log("goto", url, e.message));
  await page.waitForTimeout(wait);
  if (after) await after(page), await page.waitForTimeout(1500);
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  console.log("saved", file);
  return page;
}

// 1. Wikipedia in Dark, photo in natural colors.
(await shot("1-wikipedia-dark", "https://en.wikipedia.org/wiki/Moon")).close();

// 2. The popup over a site: site shot + popup shot, composed on one 1280x800 frame.
{
  const site = await shot("_bg", "https://en.wikipedia.org/wiki/Aurora");
  const bg = await site.screenshot({ type: "png" });
  await site.close();
  await set({ enabled: true, sites: { "en.wikipedia.org": "dark" } });
  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 300, height: 300 });
  await popup.goto(`chrome-extension://${extId}/popup.html?host=en.wikipedia.org`);
  await popup.waitForTimeout(400);
  const box = await popup.evaluate(() => {
    const r = document.body.getBoundingClientRect();
    return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
  });
  const pop = await popup.screenshot({ type: "png", clip: { x: 0, y: 0, ...box } });
  await popup.close();
  const comp = await ctx.newPage();
  await comp.setContent(`<body style="margin:0;width:${W}px;height:${H}px;position:relative;overflow:hidden">
    <img src="data:image/png;base64,${bg.toString("base64")}" style="position:absolute;inset:0">
    <img src="data:image/png;base64,${pop.toString("base64")}" style="position:absolute;top:12px;right:16px;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08)">
  </body>`);
  await comp.waitForTimeout(300);
  await comp.screenshot({ path: path.join(out, "2-popup-override.png") });
  console.log("saved 2-popup-override.png");
  await comp.close();
  rmSync(path.join(out, "_bg.png"), { force: true });
}

// 3. Sheets dark. 4. Docs dark with an image.
(await shot("3-sheets-dark", "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?hl=en", { wait: 7000 })).close();
(await shot("4-docs-image-dark", "https://docs.google.com/document/d/1Rxw4DRvWizdHh21CIOrE8sCdV92bQ2GetHFMAp0grC4/edit?hl=en", { wait: 7000 })).close();

// 5. Options page with a few overrides.
await set({ enabled: true, sites: { "en.wikipedia.org": "dark", "news.ycombinator.com": "invert", "www.figma.com": "off", "docs.google.com": "dark" } });
{
  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  await opts.waitForTimeout(500);
  await opts.screenshot({ path: path.join(out, "5-options.png") });
  console.log("saved 5-options.png");
  await opts.close();
}

await ctx.close();
rmSync(profile, { recursive: true, force: true });
