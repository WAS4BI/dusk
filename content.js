// Dusk content script. Runs at document_start in the top frame of every page.
// It decides the mode for this host, injects one <style> element and keeps it in
// sync with storage, so changes from the popup or the shortcut apply live.
(() => {
  if (window.__duskLoaded) return;
  window.__duskLoaded = true;

  const host = location.hostname;
  const key = DUSK.hostKey(host);
  const IS_GOOGLE_EDITOR =
    host === "docs.google.com" &&
    /^\/(document|spreadsheets|presentation|drawings)\//.test(location.pathname);

  // Dark: invert the whole page once at the root, then invert media back.
  // invert(0.9) instead of 1 turns pure white into a soft #1a1a1a and black text into
  // a soft #e6e6e6. Media inside get invert(1), which nets out to the original
  // picture at slightly lower contrast (easier on the eyes at night).
  const DARK_FILTER = "invert(0.9) hue-rotate(180deg)";
  // Google editors: closer to black, as their canvas grid looks best that way.
  const DOCS_FILTER = "invert(0.93) hue-rotate(180deg)";
  const UNDO = "invert(1) hue-rotate(180deg)";

  // SVG images are left inverted: they are usually logos, icons, diagrams and math
  // drawn in dark ink on a transparent background, which would vanish on a dark page.
  const MEDIA = [
    'img:not([src*=".svg"], [src^="data:image/svg"])',
    "video",
    "canvas",
    "embed",
    "object",
    "svg image",
    "[data-dusk-bg]",
    'iframe[src*="youtube.com"]',
    'iframe[src*="youtube-nocookie.com"]',
    'iframe[src*="vimeo.com"]',
    'iframe[src*="google.com/maps"]',
    'iframe[src*="maps.google."]',
    'iframe[src*="openstreetmap.org"]',
    'iframe[src*="twitch.tv"]',
  ];
  // In the Google editors the canvas is the document, so it must stay inverted.
  const DOCS_MEDIA = MEDIA.filter((s) => s !== "canvas");

  function darkCss(rootFilter, media) {
    const m = media.join(",");
    return `
html { filter: ${rootFilter} !important; }
html { background-color: #fff; }
:is(${m}) { filter: ${UNDO} !important; }
:is(${m}) :is(${m}) { filter: none !important; }
:is(:modal, :popover-open) { filter: ${rootFilter} !important; }
:is(img, video, canvas, iframe, embed, object):fullscreen { filter: none !important; }
`;
  }

  const CSS = {
    dark: darkCss(DARK_FILTER, MEDIA),
    docs: darkCss(DOCS_FILTER, DOCS_MEDIA),
    // Plain inversion for odd sites: everything flips, nothing is turned back.
    invert: `
html { filter: invert(1) hue-rotate(180deg) !important; }
html { background-color: #fff; }
`,
  };

  const state = {
    mode: "off", // what the settings say for this host
    forced: false, // set by a site override (so already-dark pages are not skipped)
    source: "global",
    pageIsDark: false, // detected after load
    applied: "off", // what is actually on the page right now
  };

  let styleEl = null;
  let applyMarked = false;

  function ensureStyle() {
    if (styleEl && styleEl.isConnected) return styleEl;
    styleEl = document.createElement("style");
    styleEl.id = "dusk-style";
    // Put it in <html> directly: <head> may not exist yet at document_start.
    (document.head || document.documentElement).appendChild(styleEl);
    return styleEl;
  }

  function apply() {
    let want = state.mode;
    if (want === "dark" && !state.forced && state.pageIsDark && !IS_GOOGLE_EDITOR) want = "off";
    state.applied = want;

    const root = document.documentElement;
    if (root) root.setAttribute("data-dusk", want);

    if (want === "off") {
      if (styleEl) styleEl.textContent = "";
      return;
    }
    const css = want === "invert" ? CSS.invert : IS_GOOGLE_EDITOR ? CSS.docs : CSS.dark;
    const el = ensureStyle();
    if (el.textContent !== css) el.textContent = css;
    if (!applyMarked) {
      applyMarked = true;
      try {
        performance.mark("dusk-applied"); // lets tests compare with first paint
      } catch (_) {}
    }
    if (want === "dark" && !IS_GOOGLE_EDITOR) scheduleBgScan(document.body);
  }

  async function refresh() {
    const settings = await DUSK.load();
    Object.assign(state, DUSK.resolve(settings, host));
    setGrayText(settings);
    apply();
  }

  // Read by docs-main.js when Google creates its canvases.
  function setGrayText(settings) {
    if (IS_GOOGLE_EDITOR && document.documentElement) {
      document.documentElement.setAttribute("data-dusk-gray-text", settings.docsGrayText ? "on" : "off");
    }
  }

  // ---- already-dark detection -------------------------------------------------

  function parseRgb(str) {
    const m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function luminance({ r, g, b }) {
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  const MEDIA_TAGS = new Set(["IMG", "PICTURE", "VIDEO", "CANVAS", "IFRAME", "EMBED", "OBJECT", "svg"]);

  // The background actually painted behind a point: the first opaque background
  // among the elements stacked there. Returns null when the point is on a picture
  // or video (its dark letterbox says nothing about the page theme).
  function bgAt(x, y) {
    const stack = document.elementsFromPoint(x, y);
    if (stack.length && MEDIA_TAGS.has(stack[0].tagName)) return null;
    for (const el of stack) {
      const cs = getComputedStyle(el);
      if (cs.backgroundImage.includes("url(") && el !== document.body && el !== document.documentElement) {
        return null;
      }
      const c = parseRgb(cs.backgroundColor);
      if (c && c.a >= 0.5) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 }; // nothing opaque: the browser's white
  }

  function rootBg() {
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue;
      const c = parseRgb(getComputedStyle(el).backgroundColor);
      if (c && c.a >= 0.5) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function looksDark() {
    if (!document.body) return false;
    const w = innerWidth;
    const h = innerHeight;
    const points = [
      [w * 0.5, h * 0.5],
      [w * 0.25, h * 0.3],
      [w * 0.75, h * 0.3],
      [w * 0.25, h * 0.8],
      [w * 0.75, h * 0.8],
      [w * 0.5, h * 0.95],
      [w * 0.05, h * 0.5],
      [w * 0.95, h * 0.5],
    ];
    let dark = 0;
    let counted = 0;
    for (const [x, y] of points) {
      const c = bgAt(x, y);
      if (!c) continue;
      counted++;
      if (luminance(c) < 0.2) dark++;
    }
    if (counted < 3) return luminance(rootBg()) < 0.2;
    return dark > counted / 2;
  }

  async function checkDark() {
    if (IS_GOOGLE_EDITOR) return;
    const dark = looksDark();
    if (dark === state.pageIsDark) return;
    // Once a page is seen dark, keep it that way; late checks only catch themes
    // that a script applies after load.
    if (!dark && state.pageIsDark) return;
    state.pageIsDark = dark;
    apply();
    try {
      const { darkHosts = {} } = await chrome.storage.local.get("darkHosts");
      if (dark) darkHosts[key] = Date.now();
      else delete darkHosts[key];
      await chrome.storage.local.set({ darkHosts });
    } catch (_) {
      /* extension reloaded; ignore */
    }
  }

  // A cached-dark host starts as dark (no flash); the check after load corrects it.
  async function correctCachedDark() {
    if (IS_GOOGLE_EDITOR || !state.pageIsDark) return;
    if (!looksDark()) {
      state.pageIsDark = false;
      apply();
      const { darkHosts = {} } = await chrome.storage.local.get("darkHosts");
      delete darkHosts[key];
      await chrome.storage.local.set({ darkHosts });
    }
  }

  // ---- background images ------------------------------------------------------
  // Elements that show a photo through CSS background-image get turned back like
  // <img>. Small ones are skipped: those are usually icon sprites, which read
  // better inverted on a dark page.

  const pendingRoots = new Set();
  let scanQueued = false;

  function scheduleBgScan(root) {
    if (!root) return;
    pendingRoots.add(root);
    if (scanQueued) return;
    scanQueued = true;
    const run = () => {
      scanQueued = false;
      if (state.applied !== "dark" || IS_GOOGLE_EDITOR) {
        pendingRoots.clear();
        return;
      }
      const roots = [...pendingRoots];
      pendingRoots.clear();
      for (const r of roots) scanBg(r);
    };
    if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 800 });
    else setTimeout(run, 200);
  }

  function scanBg(root) {
    if (!(root instanceof Element) || !root.isConnected) return;
    const els = [root, ...root.querySelectorAll("*")];
    if (els.length > 20000) els.length = 20000;
    for (const el of els) {
      if (el.hasAttribute("data-dusk-bg")) continue;
      const tag = el.tagName;
      if (tag === "IMG" || tag === "VIDEO" || tag === "CANVAS" || tag === "svg") continue;
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === "none" || !bg.includes("url(")) continue;
      if (/\.svg|image\/svg/i.test(bg)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 48 || r.height < 48) continue;
      el.setAttribute("data-dusk-bg", "");
    }
  }

  function watchMutations() {
    const mo = new MutationObserver((records) => {
      if (state.applied !== "dark" || IS_GOOGLE_EDITOR) return;
      for (const rec of records) {
        for (const n of rec.addedNodes) if (n.nodeType === 1) scheduleBgScan(n);
        if (rec.type === "attributes" && rec.target.nodeType === 1) scheduleBgScan(rec.target);
      }
    });
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }

  // ---- wiring -----------------------------------------------------------------

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && (changes.enabled || changes.sites || changes.docsGrayText)) refresh();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg && msg.type === "dusk-status") {
      reply({
        host,
        key,
        mode: state.mode,
        source: state.source,
        applied: state.applied,
        pageIsDark: state.pageIsDark,
        googleEditor: IS_GOOGLE_EDITOR,
      });
    }
  });

  // The style element can get dropped when a site rewrites <head> or <html>.
  function keepStyleAlive() {
    const mo = new MutationObserver(() => {
      if (state.applied !== "off" && styleEl && !styleEl.isConnected) {
        (document.head || document.documentElement).appendChild(styleEl);
      }
    });
    mo.observe(document, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 10000);
  }

  (async () => {
    try {
      const [{ darkHosts = {} }, settings] = await Promise.all([
        chrome.storage.local.get("darkHosts"),
        DUSK.load(),
      ]);
      state.pageIsDark = Boolean(darkHosts[key]);
      Object.assign(state, DUSK.resolve(settings, host));
      setGrayText(settings);
      apply();
    } catch (_) {
      return; // storage unavailable (extension updated mid-page)
    }
    keepStyleAlive();

    const afterDom = () => {
      if (state.pageIsDark) correctCachedDark();
      else checkDark();
      if (state.applied === "dark" && !IS_GOOGLE_EDITOR) scheduleBgScan(document.body);
      watchMutations();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", afterDom, { once: true });
    } else afterDom();

    const late = () => {
      checkDark();
      setTimeout(checkDark, 1500);
    };
    if (document.readyState === "complete") late();
    else window.addEventListener("load", late, { once: true });
  })();
})();
