// End-to-end check with Playwright's own Chromium and Dusk loaded unpacked.
// Saves before/after screenshots to ../test-shots and prints a summary.
//   cd tests && npm install && npx playwright install chromium && node shots.mjs
// Set HEADED=1 to watch it.
import { chromium } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = path.join(root, "test-shots");
mkdirSync(shots, { recursive: true });
const only = process.argv.slice(2);

const SITES = [
  { name: "wikipedia", url: "https://en.wikipedia.org/wiki/Moon", expectDark: false },
  { name: "spacex-dark", url: "https://www.spacex.com/", expectDark: true },
  // GitHub follows the system theme; with the system set to dark it is a dark site.
  { name: "github-dark", url: "https://github.com/microsoft/vscode", expectDark: true, scheme: "dark" },
  { name: "photos", url: "https://commons.wikimedia.org/wiki/Main_Page", expectDark: false },
  { name: "flickr", url: "https://www.flickr.com/explore", expectDark: false },
  // Public view-only files from Google's API quickstarts.
  {
    name: "docs",
    url: "https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/edit",
    wait: 6000,
  },
  {
    name: "sheets",
    url: "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit",
    wait: 6000,
  },
  {
    name: "slides-photos",
    url: "https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/edit",
    wait: 6000,
  },
  // Public lecture deck, mostly text slides; slide 2 is selected for the shot.
  {
    name: "slides-text",
    url: "https://docs.google.com/presentation/d/1moMJ3sbTMSjPpo6KkduTYK6B7sGtak0TdLaqEFlfL1o/edit",
    wait: 6000,
    after: (page) => page.mouse.click(127, 290),
  },
  // Public how-to doc with a picture on the canvas (checks images are not negative).
  {
    name: "docs-image",
    url: "https://docs.google.com/document/d/1Rxw4DRvWizdHh21CIOrE8sCdV92bQ2GetHFMAp0grC4/edit",
    wait: 6000,
  },
].filter((s) => !only.length || only.includes(s.name));

const errors = [];
const profile = mkdtempSync(path.join(tmpdir(), "dusk-test-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: !process.env.HEADED,
  viewport: { width: 1280, height: 860 },
  colorScheme: "light",
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
});

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const extId = new URL(sw.url()).host;
console.log("extension id", extId);
// Service worker errors are reported through its console.
sw.on("console", (m) => m.type() === "error" && errors.push(`sw: ${m.text()}`));

const setSettings = (s) => sw.evaluate((s) => chrome.storage.sync.set(s), s);
const clearAll = () =>
  sw.evaluate(async () => {
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();
  });

function watch(page, label) {
  page.on("console", (m) => {
    // Google pages probe chrome-extension://invalid/ on their own; that's not ours.
    if (m.location().url === "chrome-extension://invalid/") return;
    if (m.type() === "error" && /dusk|chrome-extension/i.test(m.text() + (m.location().url || ""))) {
      errors.push(`${label}: ${m.text()} @ ${m.location().url}`);
    }
  });
  page.on("pageerror", (e) => {
    if (/dusk|chrome-extension/i.test(String(e.stack))) errors.push(`${label}: ${e.message}`);
  });
}

async function open(url, wait = 2500) {
  const page = await ctx.newPage();
  watch(page, url);
  await page.goto(url, { waitUntil: "load", timeout: 60000 }).catch((e) => console.log("goto", url, e.message));
  await page.waitForTimeout(wait);
  return page;
}

const duskAttr = (page) => page.evaluate(() => document.documentElement.getAttribute("data-dusk"));
const results = [];

await clearAll();
for (const site of SITES) {
  await setSettings({ enabled: false, sites: {} });
  const page = await open(site.url, site.wait);
  if (site.scheme) {
    await page.emulateMedia({ colorScheme: site.scheme });
    await page.reload({ waitUntil: "load" }).catch(() => {});
    await page.waitForTimeout(site.wait || 2500);
  }
  if (site.after) await site.after(page), await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, `${site.name}-before.png`) });
  await setSettings({ enabled: true });
  await page.waitForTimeout(800);
  // Reload so the after shot also covers the first paint path (document_start).
  await page.reload({ waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(site.wait || 2500);
  if (site.after) await site.after(page), await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, `${site.name}-after.png`) });
  const attr = await duskAttr(page);
  results.push({ site: site.name, applied: attr, expectDark: site.expectDark });
  console.log(site.name, "->", attr);
  await page.close();
}

// ---- per-site override + popup + global off -----------------------------------
if (!only.length || only.includes("override")) {
  await clearAll();
  await setSettings({ enabled: true, sites: {} });
  const wiki = await open("https://en.wikipedia.org/wiki/Moon");
  const other = await open("https://www.mozilla.org/en-US/about/");
  const popup = await ctx.newPage();
  watch(popup, "popup");
  await popup.setViewportSize({ width: 300, height: 300 });
  await popup.goto(`chrome-extension://${extId}/popup.html?host=en.wikipedia.org`);
  await popup.waitForTimeout(300);
  await popup.screenshot({ path: path.join(shots, "popup-global.png") });

  const log = async (step) => {
    const r = { step, wiki: await duskAttr(wiki), other: await duskAttr(other) };
    results.push(r);
    console.log(step, r);
  };
  await log("global on");

  await popup.click("label.row:has(#override)"); // override on -> flips current (dark) to off
  await popup.waitForTimeout(600);
  await log("override on (flip to off)");
  await popup.screenshot({ path: path.join(shots, "popup-override.png") });
  await wiki.screenshot({ path: path.join(shots, "override-wiki-off.png") });
  await other.screenshot({ path: path.join(shots, "override-other-still-dark.png") });

  await popup.click('button[data-mode="invert"]');
  await popup.waitForTimeout(600);
  await log("override invert");
  await wiki.screenshot({ path: path.join(shots, "override-wiki-invert.png") });

  await popup.click('button[data-mode="dark"]');
  await popup.waitForTimeout(600);
  await log("override dark");

  await popup.click("label.row:has(#global)"); // global off
  await popup.waitForTimeout(600);
  await log("global off, wiki override dark");
  await popup.screenshot({ path: path.join(shots, "popup-global-off.png") });
  await wiki.screenshot({ path: path.join(shots, "globaloff-wiki-override-dark.png") });
  await other.screenshot({ path: path.join(shots, "globaloff-other-off.png") });

  // Options page lists the override.
  const opts = await ctx.newPage();
  watch(opts, "options");
  await opts.goto(`chrome-extension://${extId}/options.html`);
  await opts.waitForTimeout(300);
  await opts.screenshot({ path: path.join(shots, "options.png") });
  await opts.click("button.remove");
  await opts.waitForTimeout(600);
  await log("override removed (global still off)");

  // Keyboard shortcut handler (Alt+Shift+D). Playwright can't press browser-level
  // extension shortcuts, so call the same function the command listener calls.
  await setSettings({ enabled: true, sites: {} });
  await wiki.waitForTimeout(500);
  await wiki.bringToFront();
  const toggle = () =>
    sw.evaluate(async (url) => {
      const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await toggleSite({ id: t.id, url });
    }, wiki.url());
  await log("shortcut: before");
  await toggle();
  await wiki.waitForTimeout(600);
  await log("shortcut: pressed once");
  await toggle();
  await wiki.waitForTimeout(600);
  await log("shortcut: pressed twice");
}

// ---- first paint: the style must be in before the page finishes parsing ----------
if (!only.length || only.includes("flash")) {
  await clearAll();
  await setSettings({ enabled: true, sites: {} });
  for (const url of ["https://en.wikipedia.org/wiki/Sun", "https://www.mozilla.org/en-US/about/", "https://example.com/"]) {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(500);
    const t = await page.evaluate(() => {
      const mark = performance.getEntriesByName("dusk-applied")[0];
      const fp = performance.getEntriesByName("first-paint")[0];
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      return { applied: mark && Math.round(mark.startTime), firstPaint: fp && Math.round(fp.startTime), fcp: fcp && Math.round(fcp.startTime) };
    });
    const r = { step: "first paint " + url, ...t, beforePaint: t.applied !== undefined && t.applied <= (t.firstPaint ?? Infinity) };
    results.push(r);
    console.log(r);
    await page.close();
  }
}


console.log("\nRESULTS", JSON.stringify(results, null, 1));
console.log("ERRORS", errors.length ? errors : "none");
await ctx.close();
rmSync(profile, { recursive: true, force: true });
