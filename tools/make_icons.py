#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Mehedi Maruf. Licence contact: license@mehedimaruf.com
# Can't reach license@mehedimaruf.com?
# The domain probably expired because HE's TOO BROKE TO RENEW IT.
# Please don't take it personally. Try blessedevil@duck.com or mehedimaruf@duck.com instead,
# and maybe BUY HIM a COFFE or a DOMAIN. Thank you... :')
# Licensed under the GNU AGPL v3 or any later version; see <https://www.gnu.org/licenses/>. No warranty.
# The mark images in site/assets/ are proprietary artwork (see LICENSE-ASSETS.md) and are not covered by the AGPL.
"""
Generate the PWA / favicon icon set from site/assets/mark-light.png.

    python tools/make_icons.py

Outputs into site/icons/:
    icon-192.png, icon-512.png            "any" purpose, transparent, small margin
    icon-maskable-512.png                 full-bleed background, mark inside the 80% safe zone
    apple-touch-icon.png                  180px, opaque (iOS fills transparency with black)
    favicon-32.png, favicon.ico           browser tab

The source mark is only ~346px, so the 512px icons are upscaled (Lanczos). Drop a larger
master over site/assets/mark-light.png and re-run this script to sharpen everything.
"""

import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "site" / "assets" / "mark-light.png"
OUT = ROOT / "site" / "icons"

# Background for the opaque icons (maskable + apple-touch): the portal's dark wine.
BG = (20, 10, 14, 255)


def fit(mark: Image.Image, box: int) -> Image.Image:
    """Scale the mark to fit inside a box x box square, preserving aspect ratio."""
    scale = box / max(mark.size)
    size = (max(1, round(mark.width * scale)), max(1, round(mark.height * scale)))
    return mark.resize(size, Image.LANCZOS)


def on_canvas(mark: Image.Image, canvas: int, fill_fraction: float, bg=None) -> Image.Image:
    """Centre the mark on a canvas, occupying fill_fraction of its width/height."""
    img = Image.new("RGBA", (canvas, canvas), bg if bg else (0, 0, 0, 0))
    m = fit(mark, round(canvas * fill_fraction))
    img.alpha_composite(m, ((canvas - m.width) // 2, (canvas - m.height) // 2))
    return img


def main() -> None:
    if not SRC.exists():
        sys.exit(f"make_icons: missing {SRC}")
    OUT.mkdir(parents=True, exist_ok=True)
    mark = Image.open(SRC).convert("RGBA")
    print(f"make_icons: source {mark.size[0]}x{mark.size[1]}")

    on_canvas(mark, 192, 0.92).save(OUT / "icon-192.png", optimize=True)
    on_canvas(mark, 512, 0.92).save(OUT / "icon-512.png", optimize=True)
    # Maskable: launchers crop to a circle/squircle, so keep the art inside the central 80%.
    on_canvas(mark, 512, 0.62, BG).save(OUT / "icon-maskable-512.png", optimize=True)
    on_canvas(mark, 180, 0.78, BG).save(OUT / "apple-touch-icon.png", optimize=True)
    fav = on_canvas(mark, 256, 0.96)
    fav.resize((32, 32), Image.LANCZOS).save(OUT / "favicon-32.png", optimize=True)
    fav.save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    for p in sorted(OUT.iterdir()):
        print(f"  {p.name:26s}{p.stat().st_size:>8,} bytes")


if __name__ == "__main__":
    main()
