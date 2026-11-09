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
Build the single-file release of SliceDevil from the deployable site/ folder.

The website (site/) is the source of truth and needs no build step. This script additionally produces one
self-contained HTML file that runs by double-click from file:// with no server, for people who want that.

    python tools/build_single.py            # writes releases/slicedevil-v<version>.html
    python tools/build_single.py --check    # validate only, write nothing

What it does:
  * inlines every <link rel=stylesheet href="css/..."> and <script src="js/..."> into the page
  * replaces every assets/*.png and icons/* reference with a base64 data URI
  * drops the web manifest link (a single file cannot be installed or cached)
  * refuses to build if the version is inconsistent: APP_VERSION in js/app.js must equal the cache name in sw.js,
    and every file sw.js precaches must exist
  * refuses to build if any local reference survives, so a half-assembled release cannot ship
"""

import argparse
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
RELEASES = ROOT / "releases"
MIME = {".png": "image/png", ".ico": "image/x-icon"}


def read(path: pathlib.Path) -> str:
    if not path.exists():
        sys.exit(f"build: missing {path}")
    return path.read_text(encoding="utf-8")


def check_versions() -> str:
    app = read(SITE / "js" / "app.js")
    m = re.search(r'APP_VERSION\s*=\s*"v?([0-9]+\.[0-9]+\.[0-9]+)"', app)
    if not m:
        sys.exit("build: could not find APP_VERSION in site/js/app.js")
    version = m.group(1)
    sw_src = read(SITE / "sw.js")
    sw = re.search(r'^const CACHE = "slicedevil-v([0-9.]+)"', sw_src, re.M)
    if not sw or sw.group(1) != version:
        sys.exit(f"build: sw.js cache name ({sw.group(1) if sw else 'missing'}) does not match APP_VERSION ({version})")
    pre = re.search(r"^const PRECACHE = \[(.*?)\];", sw_src, re.M | re.S)
    if not pre:
        sys.exit("build: could not find PRECACHE in site/sw.js")
    missing = [p for p in re.findall(r'"([^"]+)"', pre.group(1)) if p != "./" and not (SITE / p).exists()]
    if missing:
        sys.exit(f"build: sw.js PRECACHE lists files that do not exist: {missing}")
    return version


def data_uri(rel: str) -> str:
    p = SITE / rel
    if not p.exists():
        sys.exit(f"build: referenced file missing: site/{rel}")
    blob = base64.b64encode(p.read_bytes()).decode("ascii")
    return f"data:{MIME[p.suffix]};base64,{blob}"


def inline(html: str) -> str:
    def css(m):
        return "<style>\n" + read(SITE / m.group(1)) + "\n</style>"

    def js(m):
        body = read(SITE / m.group(1))
        if "</script" in body.lower():
            sys.exit(f"build: {m.group(1)} contains a closing script tag and cannot be inlined")
        return "<script>\n" + body + "\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', css, html)
    html = re.sub(r'<script src="(js/[^"]+)"></script>', js, html)
    html = re.sub(r'<link rel="manifest"[^>]*>\n?', "", html)
    html = re.sub(r'(?<![\w/.-])((?:assets|icons)/[\w.-]+\.(?:png|ico))', lambda m: data_uri(m.group(1)), html)
    return html


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="validate without writing")
    args = ap.parse_args()

    version = check_versions()
    out = inline(read(SITE / "index.html"))

    leftover = re.findall(r'(?:(?:src|href)="|url\(["\']?)(?:css|js|assets|icons)/[^"\')]*', out)
    if leftover:
        sys.exit(f"build: local references survived the build: {leftover[:5]}")

    if args.check:
        print(f"build: OK, v{version}, {len(out):,} chars, nothing written")
        return
    RELEASES.mkdir(exist_ok=True)
    dest = RELEASES / f"slicedevil-v{version}.html"
    with open(dest, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)
    print(f"build: wrote {dest} ({dest.stat().st_size:,} bytes), v{version}")


if __name__ == "__main__":
    main()
