<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (C) 2026 Mehedi Maruf. Licence contact: license@mehedimaruf.com
Can't reach license@mehedimaruf.com?
The domain probably expired because HE's TOO BROKE TO RENEW IT.
Please don't take it personally. Try blessedevil@duck.com or mehedimaruf@duck.com instead,
and maybe BUY HIM a COFFE or a DOMAIN. Thank you... :')
Licensed under the GNU AGPL v3 or any later version; see <https://www.gnu.org/licenses/>. No warranty.
-->
# SliceDevil

A free image cropper that runs entirely in your browser. Crop to any shape (circle, ellipse, square,
rounded rectangle, pill or arbitrary rectangle) and export to PNG, WebP, JPEG, ICO or SVG at any resolution.

By [Mehedi Maruf (BlesseDevil)](https://mehedimaruf.com) &middot; [project page](https://mehedimaruf.com/projects/slicedevil)

**Live:** <https://crop.mehedimaruf.com> &middot; **Source:** <https://github.com/BlesseDevil/cropper> &middot; installable as an app (PWA) &middot; works offline after the first load.

Nothing you open is ever uploaded. After the first load the app needs no network, and there is nothing to install
unless you want the app icon.

---

## Using it

- **On the web:** open the site and drop an image on the window, paste one with <kbd>Ctrl</kbd>+<kbd>V</kbd>, or use
  **Open**. Use the **Install** button in the top bar (or your browser's install option) to add it as an app.
  On iPhone/iPad, use Share, then Add to Home Screen.
- **Single file, no server:** `python tools/build_single.py` writes one self-contained HTML file to `releases/` (generated, not
  committed). Double-click it; it works from `file://` with no dependencies.

---

## Project layout

```
site/                        the website, served as-is (no build step)
  index.html  manifest.webmanifest  sw.js  CNAME
  css/    portal.css (launch splash)  app.css
  js/     app.js  encoders.js  portal.js  pwa.js  boot.js
  assets/ the BlesseDevil mark          icons/  PWA and favicon icons
releases/                    single-file build output (generated, gitignored)
tools/
  build_single.py            builds releases/ from site/
  make_icons.py              regenerates site/icons/ from site/assets/mark-light.png (needs Pillow)
design/                      local previews used to choose the splash look
.github/workflows/pages.yml  deploys site/ to GitHub Pages
```

### Running locally

```
python -m http.server 8751     # then open http://localhost:8751/site/
```

A service worker needs `http(s)` (localhost counts), so open the site through a server, not `file://`.

### Building the single file

```
python tools/build_single.py            # writes releases/slicedevil-v<version>.html
python tools/build_single.py --check    # validate only
```

The version lives in `APP_VERSION` in `site/js/app.js`. The service worker's cache name in `site/sw.js` must carry
the same version; the build refuses to run if they differ, so a release cannot ship a stale offline cache.

### Deploying

GitHub Pages serves `site/` through the workflow in `.github/workflows/pages.yml`. One-time setup: Settings, Pages,
Source "GitHub Actions"; custom domain `crop.mehedimaruf.com`; Enforce HTTPS. DNS: a `CNAME` record for `crop`
pointing at the owner's `github.io` host.

---

## Government form presets

Once a photo is loaded, the **Govt. form** button (top bar, beside Open) offers two presets:

| Preset | Size | Format | Hard limit | Aims for |
|---|---|---|---|---|
| **Photo** | 300 &times; 300 px | JPEG | 100 KB | 50&ndash;90 KB |
| **Signature** | 300 &times; 80 px | JPEG | 60 KB | 20&ndash;50 KB |

Choosing one sets the shape, ratio, exact output size, format and a white background in one step. At export the JPEG
quality is searched for the highest value that lands inside the "aims for" range, falling back to the hard limit; it
refuses, with a message, if even very low quality cannot get under the limit. A live estimate appears in the Export panel
and the footer. Sizes are decimal KB (1 KB = 1000 bytes), which is safe for the maximum under either convention. Changing
the format or size afterwards clears the preset. Always check the rules on the form you are filling in.

## Rotating

The **Rotate** card turns either the **photo** or the **crop box**, one at a time (the Photo / Box switch). Use the slider,
the 90&deg; buttons, Reset, or the <kbd>[</kbd> and <kbd>]</kbd> keys (hold <kbd>Shift</kbd> for 5&deg;). Turning the box
leaves the photo where it is, and the other way round. Export samples the rotated crop at full resolution before the normal
high-quality downscale. Edge resistance is switched off while the photo is rotated relative to the box.

---

## The crop model

The crop box is described by three things, which together cover every shape
the app can produce:

| Control | What it does |
|---|---|
| **Shape** | Rectangle or Ellipse |
| **Corner radius** | Rounds a rectangle's corners, 0–100% (rectangle only) |
| **Aspect ratio** | 1:1, 4:3, 3:2, 16:9, a custom `W:H`, or Free |

A circle is simply an ellipse at 1:1. A pill is a rectangle at 100% radius. A
squircle is a rectangle at a middling radius. There is no separate "circle
mode" because there does not need to be one.

### Framing

- **Centred** — the box stays in the middle of the screen; you pan and zoom
  the image behind it. The **Size** slider scales the box, and you can also
  drag the box's own border to resize it (the slider follows along).
- **Free drag** — the box gets eight handles. Drag inside it to move it,
  drag its handles to resize, drag outside it (or hold <kbd>Space</kbd>) to
  pan the image.

Choosing a **Free** aspect ratio switches to free-drag automatically, since a
free ratio has no meaning on a centred box.

### Edges are sticky, not solid

The crop is allowed to hang off the image — sometimes that is exactly what you
want, and those pixels export transparent (or background-filled). But it is
almost never what you want *by a hair*, so the image edge resists.

Push past it and the box slows to about a fifth of your pointer's movement.
Keep going and it lets go, returning to normal 1:1 movement. The transition is
smooth: the box stops being slow rather than snapping free.

While any part of the crop is outside the image, the outline turns to red
dashes with a soft glow and a caption appears above it. The Export panel says
the same thing in words, and tells you which way it will be filled for the
format you picked.

---

## Export

Open the **Export** panel from the top bar. It holds three things:

### Resolution
Presets (Native, 2048, 1024, 512, 256) or **Custom**, which gives you linked
Horizontal and Vertical fields. With the link on, typing one dimension derives
the other from the crop's shape.

If you unlink them and type a size that does not match the crop's shape, the
export pauses and asks which you want:

- **Stretch** — exactly the size you asked for, image distorted to fit.
- **Crop overflow** — exactly the size you asked for, proportions preserved,
  the excess trimmed off.
- **Match ratio** — re-link and recompute, no distortion and no trimming.

Nothing is chosen for you, because all three are reasonable and they produce
visibly different files.

### Format

| Format | Transparency | Notes |
|---|---|---|
| **PNG** | yes | Lossless. The safe default. |
| **WebP** | yes | Noticeably smaller than PNG at high quality. |
| **JPEG** | no | Universal. The area outside the shape is filled with a colour you choose. |
| **ICO** | yes | Windows icon containing every size you tick (16–256). |
| **SVG** | yes | Wraps the crop in a matching clip path, so it scales. |
| **AVIF** | — | Listed but disabled — see below. |

**Why AVIF is greyed out:** no browser currently ships an AVIF *encoder* for
canvas. Chrome does not even fail loudly — ask it for AVIF and it hands back a
PNG with the wrong MIME type. SliceDevil verifies encoder support by
inspecting the returned file's magic bytes rather than trusting what the
browser claims, so AVIF reports itself honestly as unavailable. It will enable
itself automatically if that ever changes.

**HEIC is not offered at all.** No browser can encode it, and adding it would
mean bundling a multi-megabyte WASM decoder — which is a
big dependency. Optional WASM codecs are planned as a later milestone.

### File name
Defaults to `{original}-SliceDeviled_{width}x{height}`, and follows your
resolution and format changes until you type something yourself. Clear the
field to get the automatic name back. Characters that are illegal in filenames
are stripped before saving.

Where the browser supports it, you get a real **Save as…** dialog; otherwise
it falls back to a normal download.

---

## Interface

Panels are **cards** you can rearrange:

- **Click** a card's header to collapse or expand it.
- **Hover** a collapsed card to peek inside without changing anything — it
  closes again when you move away. (Pointer devices only; touch keeps
  tap-to-toggle.)
- **Drag** a card's header to move it anywhere on screen. A **Reset layout**
  button appears once you have moved something. Positions reset on reload.

On narrow or short screens (up to 820px wide, or up to 620px tall) the cards become a single scrolling sheet and
dragging is switched off.

The **logo** (top left) is the theme button: click it to cycle System → Light → Dark. A small badge shows the mode, and
the mark swaps (crimson for light and system, gold for dark). It follows your system by default and remembers your choice.

The **footer** holds a live status line (what is loaded, the output size, the active preset and its size estimate, and
warnings such as a crop box hanging off the photo), a quiet **How to use** card with the shortcuts, and a **Credits**
card with the author's contact details.

### Keyboard

| Key | Action |
|---|---|
| <kbd>F</kbd> | Fit image to screen |
| <kbd>C</kbd> | Fill the crop box |
| <kbd>0</kbd> | Zoom to 100% |
| <kbd>+</kbd> / <kbd>−</kbd> | Zoom in / out |
| Arrow keys | Pan (hold <kbd>Shift</kbd> for larger steps) |
| <kbd>Space</kbd> + drag | Pan, in any mode |
| <kbd>[</kbd> / <kbd>]</kbd> | Rotate the photo or box by 1° (hold <kbd>Shift</kbd> for 5°) |
| <kbd>Ctrl</kbd>+<kbd>V</kbd> | Paste an image |
| <kbd>Esc</kbd> | Close the open panel or menu |

---

## Configuration

The brand menu and the Credits card read their links from `BRAND_LINKS` near the top of `site/js/app.js`:

```js
const BRAND_LINKS = {
  about:   "https://mehedimaruf.com",
  contact: "mailto:slicedevil@mehedimaruf.com",
  donate:  "",   // e.g. "https://ko-fi.com/<you>"
};
```

An empty link (currently `donate`) makes its menu item say so instead of navigating nowhere. If you fork, point these at
yourself, but keep the attribution required by [NOTICE](NOTICE).

---

## How the quality is protected

A few decisions matter more than they look:

- **Crops come from the original pixels, never the preview.** The on-screen
  canvas is only ever a viewport; export re-reads the source image.
- **Downscaling is done by progressive halving**, not one large `drawImage`,
  which is visibly cleaner at big reductions.
- **Shape edges are masked with `destination-in` compositing** rather than
  `clip()`, because `clip()` produces aliased edges in some browsers.
- **Encoder support is verified by magic bytes**, not by the browser's own
  MIME reporting, which lies (see AVIF above).
- **A crop extending past the image edge** draws only the overlapping region,
  positioned correctly, instead of stretching to fill.

---

## Licence and credits

&copy; 2026 BlesseDevil | Mehedi Maruf. Code: GNU AGPL-3.0-or-later (see [LICENSE](LICENSE)) with attribution terms in
[NOTICE](NOTICE). The BlesseDevil mark and icons are **not** AGPL; see [LICENSE-ASSETS.md](LICENSE-ASSETS.md).

Licence contact: license@mehedimaruf.com

**Can't reach license@mehedimaruf.com?
The domain probably expired because HE's TOO BROKE TO RENEW IT.
Please don't take it personally. Try blessedevil@duck.com or mehedimaruf@duck.com instead,
and maybe BUY HIM a COFFE or a DOMAIN. Thank you... :')**
