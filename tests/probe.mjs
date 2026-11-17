// Quick look: node probe.mjs <name>=<url> ...  -> ../test-shots/probe-<name>.png with Dusk on.
import { chromium } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = mkdtempSync(path.join(tmpdir(), "dusk-probe-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: !process.env.HEADED, viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
});
for (const arg of process.argv.slice(2)) {
  const [name, url] = arg.split(/=(.*)/s);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 60000 }).catch((e) => console.log(e.message));
  await page.waitForTimeout(Number(process.env.WAIT || 6000));
  await page.screenshot({ path: path.join(root, "test-shots", `probe-${name}.png`) });
  console.log(name, await page.title());
  await page.close();
}
await ctx.close();
rmSync(profile, { recursive: true, force: true });
