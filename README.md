# Calculator

A clean, fast calculator for the browser, in dark mode by default with a light mode a tap away.

There are no dependencies and no build step: just HTML, CSS and plain JavaScript.

- Proper order of operations (`2 + 3 × 4 = 14`) with a live preview of the result while you type
- Phone-style percent (`200 + 10 % = 220`), `±`, backspace, and repeat-equals (`2 × 3 = = = → 54`)
- No floating-point surprises (`0.1 + 0.2 = 0.3`) and friendly errors (`Can't divide by 0`)
- Full keyboard support, auto-shrinking display, and a layout that fits phones, tablets and desktops
- Can be added to your home screen (web manifest + icons) and respects reduced-motion settings

## Run it locally

You need [Node.js](https://nodejs.org) 18 or newer. There's nothing to install.

```bash
npm start
```

Then open <http://localhost:8080>. Use `PORT=3000 npm start` to pick another port.

Any static file server works too, for example `python3 -m http.server 8080`.

> **Serve it over http(s), don't double-click `index.html`.** The calculator itself works from
> `file://`, but YouTube refuses to play embedded videos on pages that don't have a real web
> address (you'll see *"Error 153"*).

## Deploy

It's a static site, so any static host works (GitHub Pages, Netlify, Cloudflare Pages, Vercel…).

**GitHub Pages:** go to *Settings → Pages*, choose *Deploy from a branch*, pick `main` and `/ (root)`,
and save. The site appears at `https://<user>.github.io/Calculator/` after a minute or so.

If your host or CDN lets you set response headers, don't use `Referrer-Policy: no-referrer`;
YouTube embeds need the default `strict-origin-when-cross-origin`.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `0`–`9`, `.` or `,` | Enter numbers |
| `+` `-` `*` (or `x`) `/` | Operators |
| `Enter` or `=` | Equals |
| `%` | Percent |
| `F9` | Change sign (±) |
| `Backspace` | Delete last digit |
| `Esc`, `Delete` or `C` | Clear |

## Tests

```bash
npm test
```

Uses Node's built-in test runner to cover the calculator engine, the YouTube helpers (link
parsing, embed URLs, reading the player's messages) and the library (playlists, progress,
backups, and cleaning anything read back from storage).

## Project layout

```
index.html            page markup and inline SVG icons (bump the ?v= on CSS/JS links when they change)
css/styles.css        calculator themes, layout and animations
css/tubevault.css     the vault's YouTube-style look
js/calculator.js      calculator engine (no DOM, unit tested)
js/youtube.js         YouTube links, embed URLs, player messages (no DOM, unit tested)
js/library.js         playlists, watch progress and backups (no DOM, unit tested)
js/app.js             UI: keypad, keyboard, theme and the vault
assets/               app icons
assets/fonts/         Roboto (SIL Open Font License, see OFL.txt)
scripts/serve.js      tiny zero-dependency static server for `npm start`
tests/                node --test suites
```

<details>
<summary>🤫 Psst… there's a secret</summary>

<br>

Switch to **light mode**, then press **`2`**, **`5`**, **`+`**. The calculator opens **TubeVault**.

TubeVault looks and works like YouTube, but it only plays links you paste, using YouTube's
official embedded player.

- **Paste a link** into the search bar (or anywhere on the page, or press `/`). Works with normal
  videos, `youtu.be` links, Shorts, live streams, playlists, embed links and timestamps
  (`?t=90`, `&t=1m30s`). You can even paste a whole message that contains a link.
- **Watch page:** the player with the video's title, channel and length underneath, plus
  *Like*, *Share*, *Save*, *Full screen*, *Open in YouTube* and *Close*. The details come from
  the player itself (no API key needed), so they appear a moment after a video starts loading.
- **Home:** your watch history as a YouTube-style feed, with *All / Videos / Shorts / Playlists*
  filters. It keeps your last 24 videos. Each video's ⋮ menu can save it to Watch later or a
  playlist, share it, or remove it from history (with Undo).
- **Saving videos:**
  - **Watch later** and **Liked videos** (the *Like* button), plus as many of your own
    **playlists** as you like (up to 50), from *Save* under the player or any video's ⋮ menu.
  - **You** (in the side bar) shows your history and playlists. A playlist's page has
    *Play all* and *Shuffle*, and you can reorder, remove, rename or delete (with Undo).
  - Playing a playlist shows it next to the player, YouTube-style, and moves on to the next
    video by itself when one ends.
  - **Picks up where you left off:** videos resume from where you stopped (with a *Start over*
    button), and thumbnails show YouTube's red bar for how much you've watched.
  - Everything is saved in this browser only (`localStorage`). *You → Export backup* downloads
    it all as a file; *Import backup* adds a backup back in without losing what's already there.
    (Downloading the videos themselves isn't possible: the embedded player doesn't give out the
    files, and YouTube's terms don't allow it.)
- **Full screen:** YouTube's own full-screen button, TubeVault's *Full screen* button or `F`.
  If the page is shown inside a frame that blocks full screen (some previews and embeds do),
  the video fills the whole window instead; `Esc` or *Exit full screen* goes back.
- **⋮ Settings:**
  - **Private mode** (on by default) plays through `youtube-nocookie.com`, YouTube's
    privacy-enhanced mode. Turn it off to use regular `youtube.com` embeds (for example, if you
    want your YouTube login to apply).
  - **Appearance:** device theme, dark or light, like YouTube.
- **Lock** (or `Esc`, or your browser's back button) instantly stops the video and returns to
  the calculator. `Esc` works even with a menu or dialog open (if the video is filling the
  window, the first `Esc` just exits that).

The trigger only fires on a freshly typed `25` followed by `+`, so `125+` or `5 × 5 = +`
won't open it. In dark mode, `25+` is just `25+`. If TubeVault ever fails to start (say, a
browser mixing cached files from different versions), the calculator keeps working without it.

</details>
