# bad_ragaz

A private app for two. The content of `index.html` is encrypted; the site opens with a word that only we know.

- `index.html` — the sealed app (this is what the site serves).
- `tools/seal.mjs` — `open` turns `index.html` into the readable `app.src.html`; `seal` turns it back. Node 20+, no installs.
- `tools/loader.js` — the small unlocking code that `seal` puts into `index.html`.
- `sw.js` — offline use. Bump `SHELL_VERSION` together with `APP_VERSION`.
- `manifest.webmanifest`, `icon-v3-*.png` — home-screen install. When the icon changes, give the files new names.
- `fonts/` — Bellefair and Assistant (SIL Open Font License), served from this site.
- `img/` — compressed photos. Photos here are public; nothing personal belongs in this folder.

Editing: `node tools/seal.mjs open`, edit `app.src.html` (all content is in the data block at the top), `node tools/seal.mjs seal`, push.
`app.src.html` is never pushed (see `.gitignore`). Preview a day by adding `?now=YYYY-MM-DDTHH:MM` to the address.
Names, journal lines, photos and drafts stay on each phone and never reach this site.
