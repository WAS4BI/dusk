// Shared by the content script, popup, options page and service worker.
// Settings live in chrome.storage.sync:
//   enabled: boolean            global Dark Mode switch
//   sites:   { [host]: mode }   per-site overrides, mode is "off" | "dark" | "invert"
//   docsGrayText: boolean       grayscale canvas text in Google Docs/Sheets/Slides
// chrome.storage.local keeps a cache of hosts found to be dark already ("darkHosts"),
// so returning to them doesn't flash an inverted page.

/* exported DUSK */
var DUSK = (() => {
  const MODES = ["off", "dark", "invert"];
  const DEFAULTS = { enabled: true, sites: {}, docsGrayText: true };

  function hostKey(hostname) {
    return String(hostname || "").toLowerCase().replace(/^www\./, "");
  }

  async function load() {
    const s = await chrome.storage.sync.get(DEFAULTS);
    return { enabled: s.enabled !== false, sites: s.sites || {}, docsGrayText: s.docsGrayText !== false };
  }

  // What applies to a host. `forced` means the user chose it for this site,
  // so already-dark detection must not skip it.
  function resolve(settings, host) {
    const override = settings.sites[hostKey(host)];
    if (MODES.includes(override)) {
      return { mode: override, forced: true, source: "site" };
    }
    return { mode: settings.enabled ? "dark" : "off", forced: false, source: "global" };
  }

  async function setSite(host, mode) {
    const { sites } = await load();
    const key = hostKey(host);
    if (mode === null || mode === undefined) delete sites[key];
    else if (MODES.includes(mode)) sites[key] = mode;
    await chrome.storage.sync.set({ sites });
  }

  return { MODES, DEFAULTS, hostKey, load, resolve, setSite };
})();
