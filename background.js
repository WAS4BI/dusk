// Dusk service worker: only handles the keyboard shortcut.
importScripts("common.js");

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-site") toggleSite(tab);
});

// Flip the current site: if it shows dark/invert now, override it to off; else to dark.
async function toggleSite(tab) {
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  let url;
  try {
    url = new URL(tab.url);
  } catch (_) {
    return;
  }
  if (!/^(https?|file):$/.test(url.protocol)) return;

  // Ask the page what it is showing right now (it may have skipped an already-dark page).
  let applied = null;
  try {
    const status = await chrome.tabs.sendMessage(tab.id, { type: "dusk-status" });
    applied = status && status.applied;
  } catch (_) {
    /* no content script in this tab (e.g. opened before install) */
  }
  if (applied === null) {
    applied = DUSK.resolve(await DUSK.load(), url.hostname).mode;
  }

  await DUSK.setSite(url.hostname, applied === "off" ? "dark" : "off");
}
