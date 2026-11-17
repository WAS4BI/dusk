# Permission justifications (draft, for the Web Store "Privacy practices" tab)

**storage**
Saves the user's settings: the global dark mode switch, the per-site overrides, and the
Google Docs text option. Synced with the user's Chrome profile through chrome.storage.sync.
A local cache remembers which sites were found to be already dark, to avoid a flash on the
next visit. Nothing leaves the browser.

**activeTab**
When the user opens the popup or presses the shortcut, Dusk reads the current tab's address
to know which site the override applies to. It doesn't read page content through this
permission and doesn't access other tabs.

**Host permissions / content scripts on all URLs (`<all_urls>`)**
Dark mode has to be applied to whatever page the user visits, before it first paints, so a
content script runs on every page at document_start. It only injects a stylesheet and reads
computed background colors to detect pages that are already dark. It doesn't read or send
page text, form data or browsing history.

**Content script in the page's main world on docs.google.com**
Google Docs, Sheets and Slides draw documents on a canvas. A small script wraps the
canvas's drawImage and getContext so pictures keep their colors and text stays sharp when
the document is darkened. It doesn't read document content and makes no network requests.

**Remote code:** none. All code ships in the package.

## Data usage answers

- Collects user data: **No** (none of: personally identifiable info, health, financial,
  authentication, personal communications, location, web history, user activity, website content).
- Sold or transferred to third parties: No.
- Used for purposes unrelated to the single purpose: No.
- Used for creditworthiness or lending: No.

## Privacy policy (short text to host)

Dusk doesn't collect, store or transmit any personal data or browsing data. Its settings
(the dark mode switch and per-site choices) are saved in your browser through Chrome's
storage and synced only through your own Chrome account if you have sync turned on.
