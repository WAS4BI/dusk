// Options page: list per-site overrides, each with a remove button.
const LABELS = { off: "Off", dark: "Dark", invert: "Invert" };

async function render() {
  const { sites } = await DUSK.load();
  const list = document.getElementById("list");
  list.replaceChildren();
  const hosts = Object.keys(sites).sort();
  document.getElementById("empty").hidden = hosts.length > 0;
  for (const host of hosts) {
    const tr = document.createElement("tr");
    const site = document.createElement("td");
    site.className = "site";
    site.textContent = host;
    const mode = document.createElement("td");
    mode.className = "mode";
    mode.textContent = LABELS[sites[host]] || sites[host];
    const act = document.createElement("td");
    act.className = "act";
    const btn = document.createElement("button");
    btn.className = "remove";
    btn.textContent = "Remove";
    btn.addEventListener("click", () => DUSK.setSite(host, null));
    act.append(btn);
    tr.append(site, mode, act);
    list.append(tr);
  }
}

chrome.storage.onChanged.addListener((_c, area) => {
  if (area === "sync") render();
});
render();
