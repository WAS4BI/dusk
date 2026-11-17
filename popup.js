// Popup: global switch, per-site override, and a line saying what applies.
// For testing it can be opened as a tab with ?host=example.com (no active-tab lookup then).
(async () => {
  const $ = (id) => document.getElementById(id);
  const globalSw = $("global");
  const overrideSw = $("override");
  const modes = $("modes");
  const statusEl = $("status");
  const grayRow = $("grayRow");
  const graySw = $("grayText");

  let host = new URLSearchParams(location.search).get("host");
  let tabId = null;
  let supported = true;

  if (!host) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab ? tab.id : null;
    try {
      const url = new URL(tab.url);
      supported = /^(https?|file):$/.test(url.protocol);
      host = url.protocol === "file:" ? "" : url.hostname;
    } catch (_) {
      supported = false;
    }
  }
  const key = DUSK.hostKey(host);
  $("host").textContent = supported ? key || "local file" : "this page";

  async function pageStatus() {
    if (tabId === null) return null;
    try {
      return await chrome.tabs.sendMessage(tabId, { type: "dusk-status" });
    } catch (_) {
      return null;
    }
  }

  async function render() {
    const settings = await DUSK.load();
    const site = settings.sites[key];
    globalSw.checked = settings.enabled;
    grayRow.hidden = key !== "docs.google.com";
    graySw.checked = settings.docsGrayText;
    overrideSw.checked = Boolean(site);
    overrideSw.disabled = !supported;
    overrideSw.closest(".row").classList.toggle("disabled", !supported);
    modes.hidden = !site;
    for (const b of modes.querySelectorAll("button")) {
      b.setAttribute("aria-checked", String(b.dataset.mode === site));
    }

    if (!supported) {
      statusEl.textContent = "Chrome doesn't let extensions change this page.";
      return;
    }
    if (site) {
      statusEl.textContent = "This site uses its own setting (overrides global).";
      return;
    }
    if (!settings.enabled) {
      statusEl.textContent = "Off: global Dark Mode is off.";
      return;
    }
    const st = await pageStatus();
    if (st && st.pageIsDark && st.applied === "off") {
      statusEl.textContent = "Uses global Dark Mode. This page is already dark, so it's left as is.";
    } else {
      statusEl.textContent = "Uses global Dark Mode.";
    }
  }

  globalSw.addEventListener("change", async () => {
    await chrome.storage.sync.set({ enabled: globalSw.checked });
  });

  graySw.addEventListener("change", async () => {
    await chrome.storage.sync.set({ docsGrayText: graySw.checked });
  });

  overrideSw.addEventListener("change", async () => {
    if (overrideSw.checked) {
      // Start the override from what the site shows now, flipped: the usual reason
      // to override is that the global result is wrong for this site.
      const settings = await DUSK.load();
      const st = await pageStatus();
      const now = st ? st.applied : DUSK.resolve(settings, key).mode;
      await DUSK.setSite(key, now === "off" ? "dark" : "off");
    } else {
      await DUSK.setSite(key, null);
    }
  });

  modes.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-mode]");
    if (b) await DUSK.setSite(key, b.dataset.mode);
  });

  chrome.storage.onChanged.addListener((_c, area) => {
    if (area === "sync") setTimeout(render, 50);
  });

  render();
})();
