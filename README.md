# Calculator

A clean, fast calculator for the browser, in dark mode by default with a light mode a tap away.

There are no dependencies and no build step: just HTML, CSS and plain JavaScript.

- Proper order of operations (`2 + 3 × 4 = 14`) with a live preview of the result while you type
- Phone-style percent (`200 + 10 % = 220`), `±`, backspace, and repeat-equals (`2 × 3 = = = → 54`)
- No floating-point surprises (`0.1 + 0.2 = 0.3`) and friendly errors (`Can't divide by 0`)
- Full keyboard support, auto-shrinking display, and a layout that fits phones, tablets and desktops
- Can be added to your home screen (web manifest + icons) and respects reduced-motion settings

## Deploy with GitHub Pages

It's a static site with no build step, so GitHub Pages can host it as-is:

1. Merge into `main`.
2. In the repository, open *Settings → Pages*, choose *Deploy from a branch*, pick `main` and
   `/ (root)`, and save.
3. After a minute or so the site is live at `https://<user>.github.io/Calculator/`.

Any other static host works too (Netlify, Cloudflare Pages, Vercel…). If yours lets you set
response headers, don't use `Referrer-Policy: no-referrer`; YouTube embeds need the default
`strict-origin-when-cross-origin`.

> **Open it from its web address, not by double-clicking `index.html`.** The calculator works
> either way, but YouTube won't play embedded videos on a page opened from a file (you'd see
> *"Error 153"*).

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
index.html             page markup and inline SVG icons (bump the ?v= on CSS/JS links when they change)
css/styles.css         calculator themes, layout and animations
css/unblockedtube.css  UnblockedTube's YouTube-style look
js/calculator.js       calculator engine (no DOM, unit tested)
js/youtube.js          YouTube links, embed URLs, player messages (no DOM, unit tested)
js/library.js          playlists, watch progress and backups (no DOM, unit tested)
js/app.js              UI: keypad, keyboard, theme and UnblockedTube
assets/                app icons
assets/fonts/          Roboto (SIL Open Font License, see OFL.txt)
tests/                 node --test suites
```

<details>
<summary>🤫 Psst… there's a secret</summary>

<br>

Switch to **light mode**, then press **`2`**, **`5`**, **`+`**. The calculator opens **UnblockedTube**.

UnblockedTube looks and works like YouTube, but it only plays links you paste, using YouTube's
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
- **Full screen:** YouTube's own full-screen button, UnblockedTube's *Full screen* button or `F`.
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
won't open it. In dark mode, `25+` is just `25+`. If UnblockedTube ever fails to start (say, a
browser mixing cached files from different versions), the calculator keeps working without it.

</details>
