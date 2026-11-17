// Chrome Web Store art into ../store: the 128 store icon (96 artwork + 16 transparent padding),
// the 440x280 small promo tile and the 1400x560 marquee (JPEG, no alpha).
//   cd tests && node store-art.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(path.join(root, "icons", "icon.svg"), "utf8");
const shot = readFileSync(path.join(root, "store", "screenshots", "3-sheets-dark.png")).toString("base64");
const browser = await chromium.launch();

async function render(file, width, height, html, opts = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(root, "store", file), ...opts });
  await page.close();
  console.log("saved", file);
}

const font = `font-family: "Segoe UI", system-ui, -apple-system, sans-serif;`;
const sky = `background: radial-gradient(120% 140% at 85% 10%, #3a3f6b 0%, #1d2030 45%, #0f1018 100%);`;

await render("icon-store-128.png", 128, 128,
  `<style>html,body{margin:0;background:transparent}svg{width:96px;height:96px;display:block;margin:16px}</style>${svg}`,
  { omitBackground: true });

await render("promo-small-440x280.jpg", 440, 280, `<style>
  html,body{margin:0;width:440px;height:280px;${sky}${font}color:#e8ebff;overflow:hidden}
  .wrap{display:flex;align-items:center;gap:22px;padding:0 40px;height:100%}
  svg{width:96px;height:96px;flex:none}
  h1{margin:0;font-size:44px;font-weight:700;letter-spacing:-.5px}
  p{margin:6px 0 0;font-size:17px;line-height:1.35;color:#b9c0ee}
</style><div class="wrap">${svg}<div><h1>Dusk</h1><p>Dark mode for every site,<br>Google Docs included.</p></div></div>`,
  { type: "jpeg", quality: 95 });

await render("promo-marquee-1400x560.jpg", 1400, 560, `<style>
  html,body{margin:0;width:1400px;height:560px;${sky}${font}color:#e8ebff;overflow:hidden;position:relative}
  .text{position:absolute;left:90px;top:0;height:100%;display:flex;flex-direction:column;justify-content:center;width:520px}
  svg{width:88px;height:88px}
  h1{margin:18px 0 0;font-size:64px;font-weight:700;letter-spacing:-1px}
  p{margin:10px 0 0;font-size:24px;line-height:1.4;color:#b9c0ee}
  img{position:absolute;left:680px;top:70px;width:820px;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)}
</style><div class="text">${svg}<h1>Dusk</h1><p>Dark mode for every site, with per-site overrides.<br>Docs, Sheets and Slides go dark too.</p></div>
<img src="data:image/png;base64,${shot}">`,
  { type: "jpeg", quality: 95 });

await browser.close();
