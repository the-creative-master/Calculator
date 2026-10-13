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

Uses Node's built-in test runner to cover the calculator engine and the YouTube link parser.

## Project layout

```
index.html            page markup and inline SVG icons
css/styles.css        themes, layout and animations
js/calculator.js      calculator engine (no DOM, unit tested)
js/youtube.js         YouTube link parser and embed URLs (no DOM, unit tested)
js/app.js             UI: keypad, keyboard, theme and the vault
assets/               app icons
scripts/serve.js      tiny zero-dependency static server for `npm start`
tests/                node --test suites
```

<details>
<summary>🤫 Psst… there's a secret</summary>

<br>

Switch to **light mode**, then press **`2`**, **`5`**, **`+`**. The calculator opens **TubeVault**.

TubeVault is a private little YouTube player. Paste a link and it plays right there using
YouTube's official embedded player.

- Works with normal videos, `youtu.be` links, Shorts, live links, playlists, embed links and
  links with timestamps (`?t=90`, `&t=1m30s`). You can even paste a whole message that
  contains a link.
- Paste anywhere on the page (or press `/` to jump to the link box).
- **Private** (on by default) plays through `youtube-nocookie.com`, YouTube's privacy-enhanced mode.
  Turn it off to use regular `youtube.com` embeds (for example, if you want your YouTube login
  to apply).
- **Recently played** remembers your last 12 links. They're stored only in your browser
  (`localStorage`), and you can remove them one by one or clear them all.
- **Lock** (or `Esc`, or your browser's back button) instantly stops the video and returns to
  the calculator.

The trigger only fires on a freshly typed `25` followed by `+`, so `125+` or `5 × 5 = +`
won't open it. In dark mode, `25+` is just `25+`.

</details>
