# Dusk

Dark mode for Chrome with a global switch and per-site overrides. It also works on
Google Docs, Sheets and Slides, which draw the document on a canvas that ordinary
CSS recoloring can't reach.

Plain JavaScript, Manifest V3, no build step.

## Install (load unpacked)

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick this folder (the one with `manifest.json`).
3. Pin Dusk from the puzzle-piece menu so the moon icon stays in the toolbar.

Pages that were already open before installing need a reload once.

## Using it

The popup shows the current site and:

- **Dark Mode**: the global switch. On means every site is dark unless it has an override.
- **Override this site**: gives this site its own setting, ignoring the global switch.
  When it's on, pick **Off**, **Dark** or **Invert** for the site.
- A line that says what applies, for example "This site uses its own setting (overrides global)".
- On `docs.google.com`: **Grayscale text in Docs** (see below).

Changes apply right away to every open tab of that site, without reloading.

**Alt+Shift+D** toggles the current site: if it's dark now it gets an "Off" override,
otherwise a "Dark" override. Change the key at `chrome://extensions/shortcuts`.

The **Sites** link (or the extension's Options) lists all overrides with a Remove button.

Settings are stored with `chrome.storage.sync`, so they follow your Chrome profile.

## How the modes work

**Dark** (the default when the global switch is on)

- The whole page is inverted once at the root (`invert(0.9) hue-rotate(180deg)` on `<html>`).
  Inverting by 0.9 rather than 1 turns white into a soft #1a1a1a and black text into a soft
  light gray. The hue rotation keeps colors roughly the same hue (blue links stay blue).
- Photos and video are turned back with `invert(1) hue-rotate(180deg)`: `img`, `video`,
  `canvas`, `embed`, `object`, `<image>` inside SVG, iframes from YouTube, Vimeo, maps and
  Twitch, and elements whose CSS background is a picture at least 48x48 px (smaller ones are
  usually icon sprites, which look better inverted). Nested media are not flipped twice.
- SVG images are left inverted: they're usually logos, icons, diagrams and math in dark ink
  on a transparent background, which would disappear on a dark page.
- **Already-dark pages are left alone.** After the page loads (and again a bit later for
  sites that switch theme with JavaScript), Dusk samples the background color behind several
  points on the screen, ignoring points that land on a picture. If most are dark, it removes
  its filter. Hosts found dark are remembered so the next visit doesn't flash. A site
  override set to Dark skips this check and always darkens.
- No white flash: the content script runs at `document_start` and its style is in place
  before the first paint.

**Invert**: plain `invert(1) hue-rotate(180deg)` of the whole page, nothing turned back and no
already-dark check. For odd sites the Dark mode gets wrong, or to make a dark site light.

**Off**: nothing is changed.

### Google Docs, Sheets and Slides

On `docs.google.com` editors, Dark uses a slightly stronger inversion (`invert(0.93)`), so
the page and cells are near black with white text, gridlines dim, and the toolbar and menus
dark. The canvas is **not** turned back here, since the canvas is the document.

Two small scripts run in the page itself (`docs-main.js`) to make that work:

- **Pictures on the canvas.** Docs draws inserted images and charts onto the canvas, so the
  page inversion would make them negative. Dusk wraps `drawImage` so a picture (`<img>`,
  `<video>` or a bitmap decoded from an image file) is drawn pre-inverted while Dark is on;
  the page inversion then turns it back to its real colors. Canvas-to-canvas copies are left
  alone (Google uses those for text tiles).
- **Grayscale text in Docs** (on by default). Sheets draws its grid on an opaque canvas, where
  Chrome uses LCD (subpixel, ClearType-style) text smoothing. Inverted, the colored fringes
  swap sides and the text looks blurry with orange and blue edges. With this setting on, Dusk
  creates those canvases with transparency allowed, which makes Chrome use grayscale smoothing
  that inverts cleanly. In testing this took the colored pixels in Sheets text from about 70%
  to 0%. It's read when Google creates the canvas, so reload the tab after changing it.

Slides themselves keep their own colors when they're made of pictures (a photo background
stays a photo); text slides on a white background come out dark.

## Permissions

- `storage`: save the global switch and per-site overrides.
- `activeTab`: let the popup and the shortcut read the current tab's address, to know which
  site they're changing.
- Content script on all sites: needed to apply dark mode to any page you visit.

Dusk doesn't collect, send or store any browsing data outside your own Chrome profile.

## Testing

`tests/` has a Playwright script that loads the extension into Playwright's own Chromium (not
your Chrome), takes before/after screenshots and checks the popup, overrides and shortcut.

```sh
cd tests
npm install
npx playwright install chromium
node shots.mjs            # everything; or e.g. `node shots.mjs wikipedia override`
```

Screenshots go to `test-shots/` (ignored by git). `HEADED=1 node shots.mjs` shows the browser.
`node make-icons.mjs` re-renders the PNG icons from `icons/icon.svg`.

## Known gaps

- Emoji typed as text are inverted with the page (they look darker); image emoji are fine.
- Pages inside ordinary iframes are darkened together with their parent page; a dark page in
  an iframe on a light page is inverted to light.
- Full-screen video and modal dialogs are handled with CSS but weren't tested much.
- Google Docs pictures drawn before Dark was switched on stay as drawn until Docs redraws
  them (scroll, or reload).
