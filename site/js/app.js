/*
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (C) 2026 Mehedi Maruf. Licence contact: license@mehedimaruf.com
Can't reach license@mehedimaruf.com?
The domain probably expired because HE's TOO BROKE TO RENEW IT.
Please don't take it personally. Try blessedevil@duck.com or mehedimaruf@duck.com instead,
and maybe BUY HIM a COFFE or a DOMAIN. Thank you... :')
Licensed under the GNU AGPL v3 or any later version; see <https://www.gnu.org/licenses/>. No warranty.
The mark images in site/assets/ are proprietary artwork (see LICENSE-ASSETS.md) and are not covered by the AGPL.
*/
"use strict";
/* ============================================================================
   APP
   ========================================================================== */
const $ = (id) => document.getElementById(id);

const stage   = $("stage");
const ctx     = stage.getContext("2d");
const docks   = $("docks");
const zoombar = $("zoombar");
const emptyEl = $("empty");

const APP_VERSION = "v0.3.1";

/* ---------------------------------------------------------------------------
   BRAND LINKS — fill these in to activate the brand menu items. Left empty,
   the item still renders but says so instead of navigating nowhere.
   ------------------------------------------------------------------------- */
const BRAND_LINKS = {
  about:   "https://mehedimaruf.com",
  contact: "mailto:slicedevil@mehedimaruf.com",
  source:  "https://github.com/BlesseDevil/cropper",   // AGPL: where the running code can be obtained
  donate:  "",   // e.g. "https://ko-fi.com/<you>"
};

/* Hover-driven affordances (brand menu peek, dock card peek) only make sense
   with a real pointer. Touch has no "hover away", so those devices get the
   click/tap path instead and never a peek. */
const canHover = matchMedia("(hover: hover) and (pointer: fine)");
/* The BlesseDevil mark, served from assets/ (the single-file build inlines
   these as data URIs). Two crops: the "dark" variant reads on dark surfaces, "light" on
   light ones — swapped to match the resolved theme, not the raw setting. */
const BRAND_URI = {
  dark:  "assets/brand-dark.png",
  light: "assets/brand-light.png",
};

const MIN_SCALE_FACTOR = 0.05;
const MAX_SCALE = 64;
const MAX_OUTPUT = 8192;
const MIN_BOX = 24;
const HANDLE_HIT = 13;

const S = {
  img: null, name: "image",
  scale: 1, tx: 0, ty: 0, vw: 0, vh: 0, dpr: 1,

  shape: "rect",
  roundPct: 0,
  aspect: 1,
  sizePct: 70,
  locked: true,
  box: { x: 0, y: 0, w: 0, h: 0 },

  outSize: "native",
  customW: 1024, customH: 1024,
  resLock: true,      // link the two custom dimensions to the crop ratio
  fitMode: null,      // "stretch" | "cover" — chosen only when there's a mismatch

  format: "png",
  quality: 0.9,
  background: "#ffffff",
  icoSizes: [16, 32, 48, 64, 128, 256],
  guides: false,

  filenameEdited: false,   // true once the user types their own file name

  rel: 0,        // photo rotation relative to the box, radians
  view: 0,       // box rotation on screen (the whole scene is drawn rotated by this), radians
  govt: null,    // active government-form preset, or null
};

/* ============================================================================
   THEME  — three-state: system (default) -> light -> dark -> system
   ========================================================================== */
const THEME_ICONS = {
  system: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M6 13.5h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  light:  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3.1" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.5v1.4M8 13.1v1.4M14.5 8h-1.4M2.9 8H1.5M12.6 3.4l-1 1M4.4 11.6l-1 1M12.6 12.6l-1-1M4.4 4.4l-1-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  dark:   '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
};
const THEME_ORDER = ["system", "light", "dark"];
const prefersDark = matchMedia("(prefers-color-scheme: dark)");

/** The theme actually in effect right now, resolving "system" to light/dark. */
function effectiveTheme() {
  const mode = document.documentElement.getAttribute("data-theme") || "system";
  return mode === "system" ? (prefersDark.matches ? "dark" : "light") : mode;
}

/** The logo is the theme button: gold mark for dark, crimson for light and system (the badge tells them apart). */
function paintLogo(mode) {
  $("theme-btn").dataset.mode = mode;
  $("brand-mark").src = mode === "dark" ? BRAND_URI.dark : BRAND_URI.light;
  $("foot-mark").src = $("brand-mark").src;
}

/* ----------------------------------------------------------------------------
   STATUS LINE (footer). Not static: it reports what the app is doing right now,
   with warnings taking priority. refreshStatus() recomputes it from state;
   flashStatus() lets a one-off message (a save result, an error) take over for
   a few seconds first.
   -------------------------------------------------------------------------- */
let statusHold = null, statusText = "";
function paintStatus(text, level) {
  const el = $("status-line");
  if (text !== statusText) { statusText = text; el.textContent = text; el.title = text; }
  $("statusbar").dataset.level = level || "info";
}
function flashStatus(text, level, ms) {
  clearTimeout(statusHold);
  paintStatus(text, level);
  statusHold = setTimeout(() => { statusHold = null; refreshStatus(); }, ms || 6000);
}
const fmtDeg = (d) => (Math.round(d * 10) / 10) + "\u00b0";
function refreshStatus() {
  if (statusHold) return;
  const g = S.govt;
  if (!S.img) {
    return paintStatus(g ? g.label + " preset ready \u00b7 choose your " + g.label.toLowerCase() + " to begin"
                         : "Drop, paste or choose an image to begin", "info");
  }
  const d = outputDims(), f = fmt(S.format);
  const blocked = formatBlocked(S.format) || (resMismatch() && !S.fitMode ? "Choose how to handle the ratio mismatch" : null);
  if (blocked) return paintStatus("\u26a0 " + blocked, "warn");
  if (cropOutsideImage()) {
    return paintStatus("\u26a0 The crop box extends outside the photo \u2014 that area exports " +
      (f.alpha ? "transparent" : "filled with the background colour"), "warn");
  }
  const bits = [S.name + " \u00b7 " + S.img.width + "\u00d7" + S.img.height + " \u2192 " + d.w + "\u00d7" + d.h + " " + f.name];
  if (g) bits.push(g.label + " preset \u00b7 aims " + g.recMin + "\u2013" + g.recMax + " KB, max " + g.maxKB + " KB" +
                   (S.govtEst ? " \u00b7 estimate " + S.govtEst : ""));
  const rot = [];
  if (Math.abs(photoAngle()) > 0.05) rot.push("photo " + fmtDeg(photoAngle()));
  if (Math.abs(boxAngle()) > 0.05) rot.push("box " + fmtDeg(boxAngle()));
  if (rot.length) bits.push("rotated: " + rot.join(", "));
  paintStatus(bits.join(" \u00b7 "), g && S.govtEstLevel === "warn" ? "warn" : (g && S.govtEst ? "ok" : "info"));
}

function applyTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  $("theme-icon").innerHTML = THEME_ICONS[mode];
  const label = "Theme: " + mode + " (click to change)";
  $("theme-btn").title = label;
  $("theme-btn").setAttribute("aria-label", label);
  paintLogo(mode);
  try { localStorage.setItem("sd-theme", mode); } catch (_) {}
  draw();
}
applyTheme((() => {
  try { const v = localStorage.getItem("sd-theme");
        return THEME_ORDER.includes(v) ? v : "system"; } catch (_) { return "system"; }
})());
$("theme-btn").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "system";
  applyTheme(THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length]);
});
prefersDark.addEventListener("change", () => {
  if ((document.documentElement.getAttribute("data-theme") || "system") === "system") {
    draw();
  }
});

$("brand-credit").innerHTML =
  APP_VERSION + " <i>&middot;</i> &copy; BlesseDevil <i>|</i> Mehedi Maruf";
document.title = "SliceDevil " + APP_VERSION;

/* ============================================================================
   BRAND MENU  — About / Contact / Donate
   Hover opens it on pointer devices, click toggles it everywhere. The menu is
   a child of .brand, so hovering the button *or* the menu keeps .brand
   hovered and only leaving both fires mouseleave — that plus the transparent
   padding bridge in .brand-menu is what stops it flickering shut in transit.
   ========================================================================== */
const brandEl   = $("brand");
const brandBtn  = $("brand-btn");
const brandMenu = $("brand-menu");
let brandTimer;

function openBrandMenu(open) {
  clearTimeout(brandTimer);
  brandMenu.hidden = !open;
  brandBtn.setAttribute("aria-expanded", String(open));
}

if (canHover.matches) {
  /* Only the name/credit part opens the menu on hover; the logo beside it is the theme button. */
  brandBtn.addEventListener("mouseenter", () => { clearTimeout(brandTimer); openBrandMenu(true); });
  brandEl.addEventListener("mouseenter", () => clearTimeout(brandTimer));
  /* A small grace period keeps a diagonal cursor path from closing the menu
     before it reaches the item the user is aiming for. */
  brandEl.addEventListener("mouseleave", () => {
    clearTimeout(brandTimer);
    brandTimer = setTimeout(() => openBrandMenu(false), 160);
  });
}
brandBtn.addEventListener("click", () => openBrandMenu(brandMenu.hidden));
/* Touch has no hover, so tapping outside is the only way back out. */
document.addEventListener("pointerdown", (e) => {
  if (!brandMenu.hidden && !brandEl.contains(e.target)) openBrandMenu(false);
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !brandMenu.hidden) { openBrandMenu(false); brandBtn.focus(); }
});

/* Wire each item to its configured URL. An unset link must not look broken or
   navigate nowhere — it says what is missing instead. */
brandMenu.querySelectorAll(".brand-item").forEach((item) => {
  const url = BRAND_LINKS[item.dataset.link];
  if (url) {
    item.href = url;
    if (!url.startsWith("mailto:")) { item.target = "_blank"; item.rel = "noopener noreferrer"; }
  }
  item.addEventListener("click", (e) => {
    if (!url) { e.preventDefault(); toast("That link isn't set yet — add it to BRAND_LINKS.", true); return; }
    openBrandMenu(false);
  });
});

/* ============================================================================
   DOCK CARDS  — collapse on click, drag by header. Positions are deliberately
   NOT persisted: every reload returns to the default stack.
   ========================================================================== */
const DOCK_IDS = ["dock-shape", "dock-ratio", "dock-frame", "dock-rotate"];
/* "Export resolution" and "Format" live inside the export popover instead of
   floating on the canvas — collapsible for tidiness, but not draggable. */
const FLAT_DOCK_IDS = ["dock-res", "dock-format"];
FLAT_DOCK_IDS.forEach((id) => {
  const el = $(id);
  el.querySelector(".dock-head").addEventListener("click", () =>
    el.dataset.open = el.dataset.open === "1" ? "0" : "1");
});
const DOCK_TOP = 66, DOCK_GAP = 10, DOCK_MARGIN = 14, DOCK_KEEP = 48;

const floatingLayout = () => matchMedia("(max-width: 820px), (max-height: 620px)").matches === false;

/** Stack every card that has not been dragged, wrapping into a new column
    to the left when the current one would run off the bottom. When the
    export popover is open, the whole stack shifts left by its width so the
    two never overlap in the same top-right corner. */
function relayout() {
  if (!floatingLayout()) return;
  const w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--panel-w"));
  const popShift = (exportPop && !exportPop.hidden) ? w + DOCK_GAP : 0;
  let col = 0, y = DOCK_TOP;
  for (const id of DOCK_IDS) {
    const el = $(id);
    if (el.dataset.free === "1") continue;
    const h = el.offsetHeight;
    if (y + h > window.innerHeight - DOCK_MARGIN && y > DOCK_TOP) { col++; y = DOCK_TOP; }
    el.style.left = (window.innerWidth - DOCK_MARGIN - popShift - (col + 1) * w - col * DOCK_GAP) + "px";
    el.style.top = y + "px";
    y += h + DOCK_GAP;
  }
}

function setDockOpen(el, open) {
  el.dataset.open = open ? "1" : "0";
  /* A click is a decision about the persisted state, so any transient peek
     underneath it is now meaningless — drop it rather than let the two
     disagree. */
  delete el.dataset.peek;
  relayout();
}

/* ---------------------------------------------------------------------------
   Hover-to-peek. A collapsed card opens while the pointer is over it and
   closes again on leave, without ever writing to data-open — so a peek can
   never be mistaken for, or overwrite, a deliberate click. An already-open
   card ignores hover entirely.
   ------------------------------------------------------------------------- */
let dockDragActive = false;

function setPeek(el, on) {
  if (!canHover.matches) return;          // no hover on touch, so no peek
  if (on) {
    /* Peeking mid-drag would reflow the stack out from under the card being
       dragged, so suppress it for the whole drag. */
    if (dockDragActive || el.dataset.open === "1" || el.dataset.peek === "1") return;
    el.dataset.peek = "1";
  } else {
    if (el.dataset.peek !== "1") return;
    delete el.dataset.peek;
  }
  relayout();                              // the height changed; reflow neighbours
}

/* Header does double duty: a click collapses, a drag moves. They are told
   apart by whether the pointer travelled past a small threshold. */
DOCK_IDS.forEach((id) => {
  const el = $(id);
  const head = el.querySelector(".dock-head");

  el.addEventListener("mouseenter", () => setPeek(el, true));
  el.addEventListener("mouseleave", () => setPeek(el, false));

  head.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const canDrag = floatingLayout();
    const start = { x: e.clientX, y: e.clientY };
    const rect = el.getBoundingClientRect();
    const offset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    let moved = false;

    const onMove = (ev) => {
      if (!canDrag) return;
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      if (!moved) {
        moved = true;
        dockDragActive = true;
        /* Any card already peeked open would otherwise resize mid-drag and
           shift the stack under the pointer. */
        DOCK_IDS.forEach((i) => delete $(i).dataset.peek);
        el.dataset.free = "1";
        el.classList.add("dragging", "floating");
        /* Capture is an optimisation, not a requirement — never let it abort
           the drag it was meant to smooth out. */
        try { head.setPointerCapture(e.pointerId); } catch (_) {}
        $("reset-layout").hidden = false;
        relayout();               // let the remaining cards close the gap
      }
      /* Clamp so a card can never be dragged fully out of reach. */
      const maxX = window.innerWidth - DOCK_KEEP;
      const maxY = window.innerHeight - DOCK_KEEP;
      el.style.left = Math.max(DOCK_KEEP - el.offsetWidth, Math.min(ev.clientX - offset.x, maxX)) + "px";
      el.style.top  = Math.max(0, Math.min(ev.clientY - offset.y, maxY)) + "px";
    };

    const onUp = () => {
      head.removeEventListener("pointermove", onMove);
      head.removeEventListener("pointerup", onUp);
      head.removeEventListener("pointercancel", onUp);
      el.classList.remove("dragging");
      dockDragActive = false;
      if (!moved) setDockOpen(el, el.dataset.open !== "1");
    };

    head.addEventListener("pointermove", onMove);
    head.addEventListener("pointerup", onUp);
    head.addEventListener("pointercancel", onUp);
  });
});

$("reset-layout").addEventListener("click", () => {
  DOCK_IDS.forEach((id) => { $(id).dataset.free = "0"; $(id).classList.remove("floating"); });
  $("reset-layout").hidden = true;
  relayout();
});

/* ============================================================================
   FORMATS
   ========================================================================== */
const FORMATS = [
  { id: "png",  tag: "PNG",  name: "PNG",  ext: "png",
    desc: "Lossless, transparent edges", alpha: true,  lossy: false },
  { id: "webp", tag: "WEBP", name: "WebP", ext: "webp",
    desc: "Smaller than PNG, keeps transparency", alpha: true, lossy: true },
  { id: "jpeg", tag: "JPG",  name: "JPEG", ext: "jpg",
    desc: "Universal, no transparency", alpha: false, lossy: true },
  /* AVIF is probed at runtime rather than assumed. As of now no browser ships
     an AVIF *encoder* for canvas — Chrome silently returns a PNG when asked —
     so this normally stays disabled. It lights up on its own if that changes. */
  { id: "avif", tag: "AVIF", name: "AVIF", ext: "avif",
    desc: "Best compression, keeps transparency", alpha: true, lossy: true,
    unavailable: "No browser can encode AVIF yet" },
  { id: "ico",  tag: "ICO",  name: "ICO",  ext: "ico",
    desc: "Windows icon, multi-resolution", alpha: true, lossy: false },
  { id: "svg",  tag: "SVG",  name: "SVG",  ext: "svg",
    desc: "Scalable wrapper around the crop", alpha: true, lossy: false },
];
const fmt = (id) => FORMATS.find((f) => f.id === id);
let SUPPORT = { png: true, jpeg: true, webp: true, avif: false, ico: true, svg: true };

/** Why a format cannot be used right now, or null if it can. */
function formatBlocked(id) {
  if (!SUPPORT[id]) return fmt(id).unavailable || "Not supported by this browser";
  /* ICO needs a square canvas, but that is a padding problem, not a blocker:
     a circular icon is simply a square with transparent corners. Non-square
     crops get centred on a transparent square instead. */
  return null;
}

/* ============================================================================
   VIEW
   ========================================================================== */
function resize() {
  S.dpr = Math.min(window.devicePixelRatio || 1, 3);
  const prev = { w: S.vw, h: S.vh };
  S.vw = stage.clientWidth;
  S.vh = stage.clientHeight;
  stage.width  = Math.round(S.vw * S.dpr);
  stage.height = Math.round(S.vh * S.dpr);
  if (!S.locked && prev.w > 0 && prev.h > 0) {
    const kx = S.vw / prev.w, ky = S.vh / prev.h;
    S.box = { x: S.box.x * kx, y: S.box.y * ky, w: S.box.w * kx, h: S.box.h * ky };
  }
  draw();
  updateReadouts();
  relayout();
}
new ResizeObserver(resize).observe(stage);

/** The centred box at 100% size — the ceiling that "Size" and handle-drag
    resizing both scale down from. */
function fullBox() {
  const availW = S.vw * 0.92, availH = S.vh * 0.92;
  const a = S.aspect || 1;
  let w = availW, h = w / a;
  if (h > availH) { h = availH; w = h * a; }
  return { x: (S.vw - w) / 2, y: (S.vh - h) / 2, w, h };
}

function box() {
  if (!S.locked) return S.box;
  const f = fullBox(), k = S.sizePct / 100;
  const w = f.w * k, h = f.h * k;
  return { x: (S.vw - w) / 2, y: (S.vh - h) / 2, w, h };
}

function radiusOf(w, h) {
  if (S.shape === "ellipse") return null;
  return (S.roundPct / 100) * (Math.min(w, h) / 2);
}

/** Trace the crop shape onto a 2D context. Works for ellipse and rounded rect. */
function traceShape(c, x, y, w, h, r) {
  if (r === null) { c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); return; }
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (rr < 0.5) { c.rect(x, y, w, h); return; }
  if (typeof c.roundRect === "function") { c.roundRect(x, y, w, h, rr); return; }
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y,     x + w, y + h, rr);
  c.arcTo(x + w, y + h, x,     y + h, rr);
  c.arcTo(x,     y + h, x,     y,     rr);
  c.arcTo(x,     y,     x + w, y,     rr);
  c.closePath();
}

function fitScale() {
  if (!S.img) return 1;
  return Math.min((S.vw - 96) / S.img.width, (S.vh - 96) / S.img.height);
}
function fillScale() {
  if (!S.img) return 1;
  const b = box();
  if (!isRotated()) return Math.max(b.w / S.img.width, b.h / S.img.height);
  /* A rotated photo covers the box only when the box's worst corner, expressed in the photo's own frame, is inside. */
  const cos = Math.abs(Math.cos(S.rel)), sin = Math.abs(Math.sin(S.rel));
  const hx = (b.w * cos + b.h * sin) / 2, hy = (b.w * sin + b.h * cos) / 2;
  return Math.max(2 * hx / S.img.width, 2 * hy / S.img.height);
}
const minScale = () => Math.max(fitScale() * MIN_SCALE_FACTOR, 0.01);

function setScale(next, anchorX, anchorY) {
  if (!S.img) return;
  const clamped = Math.min(Math.max(next, minScale()), MAX_SCALE);
  const ax = anchorX === undefined ? S.vw / 2 : anchorX;
  const ay = anchorY === undefined ? S.vh / 2 : anchorY;
  S.tx = ax - (ax - S.tx) * (clamped / S.scale);
  S.ty = ay - (ay - S.ty) * (clamped / S.scale);
  S.scale = clamped;
  draw(); updateReadouts();
}

function centerAt(scale) {
  if (!S.img) return;
  const b = box();
  S.scale = Math.min(Math.max(scale, minScale()), MAX_SCALE);
  S.tx = b.x + b.w / 2 - (S.img.width  * S.scale) / 2;
  S.ty = b.y + b.h / 2 - (S.img.height * S.scale) / 2;
  draw(); updateReadouts();
}

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ============================================================================
   ROTATION
   Two independent angles, adjusted one at a time (see the Rotate card):
     S.view  rotates the whole scene on screen about the stage centre, so the BOX appears tilted;
     S.rel   rotates the photo relative to the box.
   The box stays axis-aligned in "world" space, so every existing hit-test, drag and resize keeps working: pointer
   positions are un-rotated by S.view first (localPoint). Photo angle on screen = rel + view; box angle = view.
   ========================================================================== */
const DEG = Math.PI / 180;
function stageC() { return { x: S.vw / 2, y: S.vh / 2 }; }
function rotPt(p, ang, c) {
  const cos = Math.cos(ang), sin = Math.sin(ang), dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}
function viewPt(p) { return S.view ? rotPt(p, S.view, stageC()) : p; }
function unview(p) { return S.view ? rotPt(p, -S.view, stageC()) : p; }
function isRotated() { return Math.abs(S.rel) > 1e-4; }
function imgCenter() { return { x: S.tx + S.img.width * S.scale / 2, y: S.ty + S.img.height * S.scale / 2 }; }
function normDeg(d) { d = (((d + 180) % 360) + 360) % 360 - 180; return d === -180 ? 180 : d; }
function photoAngle() { return normDeg((S.rel + S.view) / DEG); }
function boxAngle() { return normDeg(S.view / DEG); }
function screenBounds(b) {
  const cs = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }].map(viewPt);
  const x0 = Math.min(...cs.map((p) => p.x)), y0 = Math.min(...cs.map((p) => p.y));
  return { x: x0, y: y0, w: Math.max(...cs.map((p) => p.x)) - x0, h: Math.max(...cs.map((p) => p.y)) - y0 };
}

/** Set the photo's or the box's angle (degrees). Turning the box keeps the photo and the box centre where they are on
    screen: world positions are recomputed through the new view rotation. */
function setAngle(target, deg) {
  if (!S.img) return;
  if (target === "photo") {
    S.rel = deg * DEG - S.view;
  } else {
    const b = box(), bs = viewPt({ x: b.x + b.w / 2, y: b.y + b.h / 2 }), is = viewPt(imgCenter());
    const theta = S.rel + S.view;
    S.view = deg * DEG; S.rel = theta - S.view;
    const bc = unview(bs), ic = unview(is);
    S.tx = ic.x - S.img.width * S.scale / 2; S.ty = ic.y - S.img.height * S.scale / 2;
    if (!S.locked) S.box = { x: bc.x - b.w / 2, y: bc.y - b.h / 2, w: b.w, h: b.h };
  }
  draw(); updateReadouts(); syncRotateUI();
}

/* ============================================================================
   DRAW
   ========================================================================== */
function draw() {
  if (!S.vw) return;
  const { vw, vh, dpr } = S;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);
  ctx.fillStyle = cssVar("--stage");
  ctx.fillRect(0, 0, vw, vh);
  if (!S.img) return;

  ctx.save();
  if (S.view) { const c = stageC(); ctx.translate(c.x, c.y); ctx.rotate(S.view); ctx.translate(-c.x, -c.y); }
  ctx.imageSmoothingEnabled = S.scale < 1.35 || isRotated() || !!S.view;   // real pixels above 1:1, unless rotated (nearest-neighbour looks jagged)
  ctx.imageSmoothingQuality = "high";
  const iw0 = S.img.width * S.scale, ih0 = S.img.height * S.scale;
  if (isRotated()) {
    const ic = imgCenter();
    ctx.save(); ctx.translate(ic.x, ic.y); ctx.rotate(S.rel);
    ctx.drawImage(S.img, -iw0 / 2, -ih0 / 2, iw0, ih0);
    ctx.restore();
  } else {
    ctx.drawImage(S.img, S.tx, S.ty, iw0, ih0);
  }
  ctx.imageSmoothingEnabled = true;

  const b = box();
  const r = radiusOf(b.w, b.h);

  /* Scrim everywhere except the crop shape, via even-odd fill — works for any
     shape, unlike the anticlockwise-arc trick. */
  ctx.save();
  ctx.fillStyle = cssVar("--scrim");
  ctx.beginPath();
  { const M = vw + vh; ctx.rect(-M, -M, vw + 2 * M, vh + 2 * M); }   // oversized: the scene may be rotated
  traceShape(ctx, b.x, b.y, b.w, b.h, r);
  ctx.fill("evenodd");

  if (S.guides) {
    ctx.save();
    ctx.beginPath(); traceShape(ctx, b.x, b.y, b.w, b.h, r); ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.42)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 2; i++) {
      const gx = b.x + (b.w * i) / 3, gy = b.y + (b.h * i) / 3;
      ctx.moveTo(gx, b.y); ctx.lineTo(gx, b.y + b.h);
      ctx.moveTo(b.x, gy); ctx.lineTo(b.x + b.w, gy);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* Halo first, so the crisp stroke sits on top of it either way. */
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,.22)";
  ctx.beginPath(); traceShape(ctx, b.x, b.y, b.w, b.h, r); ctx.stroke();

  /* Outside the image the outline breaks into dashes and gains a red glow:
     two independent cues, so it still reads without colour vision and still
     reads on a busy red-toned photo. */
  const outside = cropOutsideImage();
  if (outside) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = cssVar("--danger");
    ctx.setLineDash([9, 6]);
    ctx.shadowColor = cssVar("--danger");
    ctx.shadowBlur = 14;
    ctx.beginPath(); traceShape(ctx, b.x, b.y, b.w, b.h, r); ctx.stroke();
    /* A second pass with the shadow off keeps the dashes sharp rather than
       letting the glow wash them out. */
    ctx.shadowBlur = 0;
    ctx.beginPath(); traceShape(ctx, b.x, b.y, b.w, b.h, r); ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = cssVar("--outline");
    ctx.beginPath(); traceShape(ctx, b.x, b.y, b.w, b.h, r); ctx.stroke();
  }
  ctx.restore();

  drawHandles(b);
  ctx.restore();                      // back to screen space
  if (outside) drawOutsideBadge(b);
  refreshStatus();
}

/** A small caption above the box, because the Export panel that carries the
    same warning may be collapsed or closed. */
function drawOutsideBadge(b) {
  b = screenBounds(b);   // the badge is drawn upright, beside the box's on-screen footprint
  const label = fmt(S.format).alpha ? "Outside image — exports transparent"
                                    : "Outside image — exports filled";
  ctx.save();
  ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  const padX = 8, h = 21;
  const w = ctx.measureText(label).width + padX * 2;
  const x = Math.min(Math.max(b.x, 6), S.vw - w - 6);
  /* Prefer just above the box; drop below when the box is near the top. */
  const y = b.y - h - 8 < 58 ? Math.min(b.y + b.h + 8, S.vh - h - 6) : b.y - h - 8;
  ctx.fillStyle = cssVar("--danger");
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, 6);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x + padX, y + h / 2 + .5);
  ctx.restore();
}

function drawHandles(b) {
  const pts = handlePoints(b);
  ctx.save();
  ctx.fillStyle = cssVar("--surface-solid");
  ctx.strokeStyle = cssVar("--outline");
  ctx.lineWidth = 1.5;
  for (const k in pts) {
    const [hx, hy] = pts[k];
    ctx.beginPath();
    ctx.arc(hx, hy, k.length === 2 ? 5.5 : 4.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function handlePoints(b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return {
    nw: [b.x, b.y], ne: [b.x + b.w, b.y], sw: [b.x, b.y + b.h], se: [b.x + b.w, b.y + b.h],
    n: [cx, b.y], s: [cx, b.y + b.h], w: [b.x, cy], e: [b.x + b.w, cy],
  };
}

/* ============================================================================
   GEOMETRY
   ========================================================================== */
function cropRectImg() {
  const b = box();
  return { x: (b.x - S.tx) / S.scale, y: (b.y - S.ty) / S.scale,
           w: b.w / S.scale, h: b.h / S.scale };
}
const cropAspect = () => { const c = cropRectImg(); return c.w / c.h; };

/* ============================================================================
   EDGE RESISTANCE
   The crop may legitimately hang off the image — those pixels export
   transparent (or background-filled) — but that is nearly always a mistake
   when it happens by a hair. So the image edge is sticky rather than solid:
   the first stretch of travel past it is heavily damped, and continuing
   past the break distance releases into ordinary 1:1 movement.
   ========================================================================== */
const EDGE_BREAK = 26;    // raw travel, in CSS px, before the edge lets go
const EDGE_DAMP  = 0.22;  // fraction of travel that lands while still stuck

/**
 * Damp `overshoot` past a boundary.
 *
 * Deliberately continuous at the break point: at exactly EDGE_BREAK both
 * branches evaluate to EDGE_BREAK * EDGE_DAMP, so the box never jumps as it
 * tears free — it just stops being slow.
 */
function resistOvershoot(overshoot) {
  const dir = Math.sign(overshoot), dist = Math.abs(overshoot);
  if (dist <= EDGE_BREAK) return dir * dist * EDGE_DAMP;
  return dir * (dist - EDGE_BREAK * (1 - EDGE_DAMP));
}

/** Clamp `v` into [lo, hi], but softly — outside gets damped, not blocked. */
function resistToRange(v, lo, hi) {
  /* An empty range means the box is larger than the image on this axis, so
     there is no "inside" to be pulled toward. Leave it completely free. */
  if (lo > hi) return v;
  if (v < lo) return lo + resistOvershoot(v - lo);
  if (v > hi) return hi + resistOvershoot(v - hi);
  return v;
}

/** Edge resistance assumes an axis-aligned photo; once it is rotated there is no single edge to stick to. */
function softRange(v, lo, hi) { return isRotated() ? v : resistToRange(v, lo, hi); }

/** True when any part of the crop box falls outside the image. */
function cropOutsideImage() {
  if (!S.img) return false;
  const b = box();
  const EPS = 0.5;   // sub-pixel slack, so a flush edge doesn't read as outside
  const iw = S.img.width * S.scale, ih = S.img.height * S.scale;
  if (!isRotated()) {
    const l = S.tx, t = S.ty, r = S.tx + iw, bt = S.ty + ih;
    return b.x < l - EPS || b.y < t - EPS || b.x + b.w > r + EPS || b.y + b.h > bt + EPS;
  }
  const ic = imgCenter();
  return [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].some(([x, y]) => {
    const p = rotPt({ x, y }, -S.rel, ic);   // the corner in the photo's own frame
    return Math.abs(p.x - ic.x) > iw / 2 + EPS || Math.abs(p.y - ic.y) > ih / 2 + EPS;
  });
}

/** Exported pixel dimensions. Numeric presets set the LONGER edge. */
function outputDims() {
  if (!S.img) return null;
  const c = cropRectImg();
  if (S.outSize === "custom") {
    return { w: clampOut(S.customW), h: clampOut(S.customH) };
  }
  if (S.outSize === "native") {
    return { w: Math.max(1, Math.round(c.w)), h: Math.max(1, Math.round(c.h)) };
  }
  const n = Number(S.outSize);
  const a = c.w / c.h;
  let w, h;
  if (a >= 1) { w = n; h = Math.round(n / a); } else { h = n; w = Math.round(n * a); }
  return { w: clampOut(w), h: clampOut(h) };
}
const clampOut = (n) => Math.min(Math.max(1, Math.round(n) || 1), MAX_OUTPUT);

/** True when a custom size has been typed that does not match the crop shape. */
function resMismatch() {
  if (S.outSize !== "custom" || S.resLock || !S.img) return false;
  const outA = clampOut(S.customW) / clampOut(S.customH);
  return Math.abs(cropAspect() - outA) / cropAspect() > 0.005;
}

/* ============================================================================
   READOUTS
   ========================================================================== */
function updateReadouts() {
  $("zoom-level").textContent = Math.round(S.scale * 100) + "%";
  updateSliderFill($("size"));
  updateSliderFill($("round"));
  if (!S.img) return;

  $("source-readout").textContent = S.img.width + " × " + S.img.height;
  $("frame-readout").textContent = S.locked ? "Centred" : "Free";

  const c = cropRectImg();
  const d = outputDims();
  $("out-readout").textContent = d.w + " × " + d.h;

  const natW = Math.max(1, Math.round(c.w)), natH = Math.max(1, Math.round(c.h));
  $("size-hint").textContent =
    S.outSize === "native"
      ? "True source resolution inside the box: " + natW + " × " + natH + "."
      : (d.w > natW
          ? "Upscaling from " + natW + " × " + natH + " — no new detail is created."
          : "Downscaled from " + natW + " × " + natH + " of source detail.");

  const a = S.aspect;
  $("ratio-readout").textContent = a
    ? (Math.abs(a - 1) < 1e-6 ? "1 : 1" : (Math.round(a * 100) / 100) + " : 1")
    : (Math.round(cropAspect() * 100) / 100) + " : 1";

  syncCustomRes();
  updateFilenameDefault();
  refreshExportState();
  if (S.govt && !govtApplying) scheduleGovtPreview();
  refreshStatus();
}

/** {original}-SliceDeviled_{w}x{h}, kept in sync until the user edits it. */
function updateFilenameDefault() {
  if (!S.img) return;
  const d = outputDims();
  const base = S.name + "-SliceDeviled_" + d.w + "x" + d.h;
  $("filename-ext-readout").textContent = "." + fmt(S.format).ext;
  if (!S.filenameEdited) $("filename-input").value = base;
}

/** Strip characters invalid across Windows/macOS/Linux filenames. */
function sanitizeFilename(name) {
  const cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "").trim();
  return cleaned || S.name + "-SliceDeviled";
}

/** Keep the custom H/V boxes coherent with the lock and the crop ratio. */
function syncCustomRes(edited) {
  if (S.outSize !== "custom") { $("fit-notice").hidden = true; return; }
  if (S.resLock && S.img) {
    const a = cropAspect();
    if (edited === "h") S.customW = clampOut(S.customH * a);
    else                S.customH = clampOut(S.customW / a);
    if (document.activeElement !== $("res-w")) $("res-w").value = clampOut(S.customW);
    if (document.activeElement !== $("res-h")) $("res-h").value = clampOut(S.customH);
  }
  const bad = resMismatch();
  $("fit-notice").hidden = !bad;
  if (bad) {
    const outA = clampOut(S.customW) / clampOut(S.customH);
    $("fit-msg").textContent =
      clampOut(S.customW) + " × " + clampOut(S.customH) + " (" + round2(outA) +
      ":1) doesn't match the crop's " + round2(cropAspect()) + ":1 shape. How should it fit?";
    [...$("fit-seg").children].forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.fit === S.fitMode)));
  }
}
const round2 = (n) => Math.round(n * 100) / 100;

function refreshExportState() {
  if (S.govt && !govtApplying && !govtStillValid()) {
    S.govt = null; S.govtEst = null;
    toast("Government preset cleared \u2014 the format or size was changed.");
  }
  syncGovtUI();
  let reason = formatBlocked(S.format);
  if (!reason && resMismatch() && !S.fitMode) reason = "Choose how to handle the ratio mismatch";

  /* The top-bar button only opens the popover, so it stays enabled whenever
     there is something to export — even mid-block, so the user can get in
     and fix it. The confirm button inside the popover is the one that
     actually gates on the block reason. */
  $("export-btn").disabled = !S.img;
  $("export-confirm").disabled = !!reason || !S.img;
  $("export-confirm-label").textContent = "Export " + fmt(S.format).name;

  const hint = $("save-hint");
  const outside = cropOutsideImage();
  hint.classList.toggle("warn", !!reason || outside);
  if (reason) { hint.textContent = reason + "."; return; }
  if (outside) {
    hint.textContent = fmt(S.format).alpha
      ? "Part of the crop is outside the image — that area exports transparent."
      : "Part of the crop is outside the image — that area exports as the background colour.";
    return;
  }
  const d = outputDims();
  hint.textContent =
    S.format === "svg" ? "Embeds the crop as a scalable, shape-masked image."
  : S.format === "ico"
      ? (d && d.w !== d.h
          ? "One .ico containing every size above, centred on a transparent square."
          : "One .ico file containing every size selected above.")
  : "Cropped from the original pixels, never from the preview.";
}

function updateSliderFill(el) {
  const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
  el.style.setProperty("--fill", pct + "%");
}

/* ============================================================================
   IMAGE LOADING
   ========================================================================== */
async function loadFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("That file is not an image.", true);
  try {
    const bmp = await createImageBitmap(file).catch(async () => {
      const url = URL.createObjectURL(file);
      try {
        const im = new Image();
        im.decoding = "async";
        await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = url; });
        return im;
      } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    });
    S.img = bmp;
    S.name = (file.name || "image").replace(/\.[^.]+$/, "") || "image";
    S.filenameEdited = false;   // a new source image gets a fresh default name
    emptyEl.hidden = true;
    $("govt-wrap").hidden = false;   // the government presets only make sense once there is a photo
    S.rel = 0; S.view = 0; syncRotateUI();
    docks.hidden = false;
    zoombar.hidden = false;
    if (!S.locked) S.box = box();
    centerAt(fillScale());
    relayout();
    refreshStatus();
    if (S.govt) scheduleGovtPreview();
    toast(S.img.width + " × " + S.img.height + " loaded");
  } catch (_) {
    toast("Could not decode that image" +
          (/heic|heif/i.test(file.type + file.name) ? " — browsers cannot read HEIC." : "."), true);
  }
}

$("file").addEventListener("change", (e) => { loadFile(e.target.files[0]); e.target.value = ""; });
$("open-btn").addEventListener("click", () => $("file").click());
$("open-btn-2").addEventListener("click", () => $("file").click());

let dragDepth = 0;
addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; document.body.classList.add("dragover"); });
addEventListener("dragover",  (e) => e.preventDefault());
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragover"); } });
addEventListener("drop", (e) => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragover");
  loadFile(e.dataTransfer.files[0]);
});
addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) loadFile(item.getAsFile());
});

/* ============================================================================
   POINTER
   ========================================================================== */
const pointers = new Map();
let mode = null, activeHandle = null, dragStart = null, pinchDist = 0, spaceHeld = false;

const CURSORS = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize", w: "ew-resize", e: "ew-resize",
};

function localPoint(e) {
  const rect = stage.getBoundingClientRect();
  return unview({ x: e.clientX - rect.left, y: e.clientY - rect.top });
}
function hitHandle(px, py) {
  const pts = handlePoints(box());
  let best = null, bestD = HANDLE_HIT;
  for (const k in pts) {
    const d = Math.hypot(px - pts[k][0], py - pts[k][1]);
    if (d <= bestD) { bestD = d; best = k; }
  }
  return best;
}
function insideBox(px, py) {
  const b = box();
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}

stage.addEventListener("pointerdown", (e) => {
  if (!S.img) return;
  /* Capture keeps a fast drag from escaping the canvas, but it is an
     optimisation — never let it abort the interaction it was meant to help. */
  try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { mode = "pan"; pinchDist = pinchSpread(); return; }
  if (pointers.size > 1) return;

  const p = localPoint(e);
  const h = hitHandle(p.x, p.y);
  if (h && !spaceHeld) {
    mode = S.locked ? "resize-centered" : "resize";
    activeHandle = h; dragStart = { box: { ...box() }, p };
  } else if (!S.locked && insideBox(p.x, p.y) && !spaceHeld) {
    mode = "movebox"; dragStart = { box: { ...box() }, p };
  } else {
    mode = "pan"; dragStart = { p, tx: S.tx, ty: S.ty };
  }
  S.guides = mode !== "pan";
  draw();
});

stage.addEventListener("pointermove", (e) => {
  if (!S.img) return;
  if (!pointers.has(e.pointerId)) { updateCursor(localPoint(e)); return; }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size >= 2) {
    const d = pinchSpread(), m = pinchMid();
    if (pinchDist > 0) setScale(S.scale * (d / pinchDist), m.x, m.y);
    pinchDist = d;
    return;
  }

  const p = localPoint(e);
  if (mode === "pan") {
    /* Panning moves the image under a fixed box, so the constraint is on the
       translation: the image's leading edge may not pass the box's, nor its
       trailing edge fall short. Both collapse to one range per axis. */
    const b = box();
    const iw = S.img.width * S.scale, ih = S.img.height * S.scale;
    S.tx = softRange(dragStart.tx + (p.x - dragStart.p.x), b.x + b.w - iw, b.x);
    S.ty = softRange(dragStart.ty + (p.y - dragStart.p.y), b.y + b.h - ih, b.y);
    draw();
  } else if (mode === "movebox") {
    /* Moving the box is the mirror case: the box must stay within the
       image's screen-space rectangle. */
    const iw = S.img.width * S.scale, ih = S.img.height * S.scale;
    const w = dragStart.box.w, h = dragStart.box.h;
    S.box = { ...dragStart.box,
      x: softRange(dragStart.box.x + (p.x - dragStart.p.x), S.tx, S.tx + iw - w),
      y: softRange(dragStart.box.y + (p.y - dragStart.p.y), S.ty, S.ty + ih - h) };
    draw(); updateReadouts();
  } else if (mode === "resize") {
    S.box = resizeBox(activeHandle, p, dragStart.box, S.aspect);
    draw(); updateReadouts();
  } else if (mode === "resize-centered") {
    resizeCentered(activeHandle, p);
    draw(); updateReadouts();
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) { mode = null; activeHandle = null; S.guides = false; draw(); if (S.govt) scheduleGovtPreview(); }
  pinchDist = pointers.size === 2 ? pinchSpread() : 0;
}
stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", endPointer);

function updateCursor(p) {
  if (!S.img) { stage.style.cursor = "default"; return; }
  if (spaceHeld) { stage.style.cursor = "grab"; return; }
  const h = hitHandle(p.x, p.y);
  if (h) { stage.style.cursor = S.view ? "pointer" : CURSORS[h]; return; }
  stage.style.cursor = (!S.locked && insideBox(p.x, p.y)) ? "move" : "grab";
}

/** Resize the centred box by dragging its border, mirroring the effect of the
    Size slider — the box stays centred and at the locked aspect, only its
    scale changes, so this and the slider stay in sync either way. */
function resizeCentered(handle, p) {
  const cx = S.vw / 2, cy = S.vh / 2;
  const full = fullBox();
  const dx = Math.abs(p.x - cx), dy = Math.abs(p.y - cy);
  let scale;
  if (handle.length === 2) scale = Math.max(dx / (full.w / 2), dy / (full.h / 2));
  else if (handle === "e" || handle === "w") scale = dx / (full.w / 2);
  else scale = dy / (full.h / 2);

  const slider = $("size");
  scale = Math.min(Math.max(scale, Number(slider.min) / 100), Number(slider.max) / 100);
  S.sizePct = scale * 100;
  slider.value = S.sizePct;
  $("size-val").textContent = Math.round(S.sizePct) + "%";
  updateSliderFill(slider);
}

/** Resize from a handle, honouring the aspect lock and a minimum size. */
function resizeBox(handle, p, start, aspect) {
  let l = start.x, t = start.y, r = start.x + start.w, b = start.y + start.h;
  if (handle.includes("w")) l = p.x;
  if (handle.includes("e")) r = p.x;
  if (handle.includes("n")) t = p.y;
  if (handle.includes("s")) b = p.y;

  let w = Math.max(MIN_BOX, r - l);
  let h = Math.max(MIN_BOX, b - t);

  if (aspect) {
    if (handle.length === 2) {
      if (w / h > aspect) h = w / aspect; else w = h * aspect;
    } else if (handle === "e" || handle === "w") { h = w / aspect; }
    else { w = h * aspect; }
  }

  let x = handle.includes("w") ? r - w : l;
  let y = handle.includes("n") ? b - h : t;
  if (aspect && (handle === "e" || handle === "w")) y = start.y + start.h / 2 - h / 2;
  if (aspect && (handle === "n" || handle === "s")) x = start.x + start.w / 2 - w / 2;
  return { x, y, w, h };
}

function pinchSpread() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function pinchMid() {
  const [a, b] = [...pointers.values()];
  const rect = stage.getBoundingClientRect();
  return unview({ x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top });
}

stage.addEventListener("wheel", (e) => {
  if (!S.img) return;
  e.preventDefault();
  const p = localPoint(e);
  if (e.shiftKey && !e.ctrlKey) { S.tx -= e.deltaY; draw(); return; }
  const step = e.ctrlKey ? 0.01 : 0.0022;   // ctrlKey means a trackpad pinch
  setScale(S.scale * Math.exp(-e.deltaY * step), p.x, p.y);
}, { passive: false });

/* ============================================================================
   KEYBOARD
   ========================================================================== */
addEventListener("keydown", (e) => {
  if (e.code === "Space" && !e.repeat) { spaceHeld = true; stage.style.cursor = "grab"; }
  /* Optional call: a keydown dispatched at document/window level has a target
     with no .matches, which would otherwise throw before any shortcut ran. */
  if (e.target.matches?.("input, textarea") || e.metaKey || e.ctrlKey) return;
  const pan = e.shiftKey ? 60 : 12;
  switch (e.key) {
    case "f": case "F": centerAt(fitScale());  break;
    case "c": case "C": centerAt(fillScale()); break;
    case "+": case "=": setScale(S.scale * 1.2); break;
    case "-": case "_": setScale(S.scale / 1.2); break;
    case "0": setScale(1); break;
    case "[": case "{": case "]": case "}":
      setAngle(rotTarget, normDeg(curAngle() + (e.key === "]" || e.key === "}" ? 1 : -1) * (e.shiftKey ? 5 : 1))); break;
    case "ArrowLeft":  S.tx += pan; draw(); break;
    case "ArrowRight": S.tx -= pan; draw(); break;
    case "ArrowUp":    S.ty += pan; draw(); break;
    case "ArrowDown":  S.ty -= pan; draw(); break;
    default: return;
  }
  e.preventDefault();
});
addEventListener("blur", () => { spaceHeld = false; });   // a held Space must not stick when focus leaves
addEventListener("keyup", (e) => {
  if (e.code === "Space") { spaceHeld = false; stage.style.cursor = "grab"; }
});

/* ============================================================================
   CONTROLS
   ========================================================================== */
$("zoom-in").onclick    = () => setScale(S.scale * 1.25);
$("zoom-out").onclick   = () => setScale(S.scale / 1.25);
$("zoom-level").onclick = () => setScale(1);
$("fit-btn").onclick    = () => centerAt(fitScale());
$("fill-btn").onclick   = () => centerAt(fillScale());

const pressOnly = (container, btn) =>
  [...container.children].forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));

/* --- Shape --------------------------------------------------------------- */
$("shape-seg").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-shape]");
  if (!btn) return;
  S.shape = btn.dataset.shape;
  pressOnly(e.currentTarget, btn);
  $("round-field").hidden = S.shape !== "rect";
  draw(); updateReadouts(); relayout();
});

const roundSlider = $("round");
roundSlider.addEventListener("input", () => {
  S.roundPct = Number(roundSlider.value);
  $("round-val").textContent = S.roundPct + "%";
  updateSliderFill(roundSlider);
  draw();
});

/* --- Aspect ratio -------------------------------------------------------- */
$("ratio-seg").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-ratio]");
  if (!btn) return;
  const v = btn.dataset.ratio;
  pressOnly(e.currentTarget, btn);
  $("ratio-custom").hidden = v !== "custom";

  if (v === "free") {
    S.aspect = null;
    if (S.locked) { setLocked(false); toast("Free ratio unlocks the frame — drag its handles."); }
  } else if (v === "custom") {
    applyCustomRatio();
  } else {
    const [w, h] = v.split(":").map(Number);
    S.aspect = w / h;
  }
  reflowBoxForAspect();
});

function applyCustomRatio() {
  const w = Math.max(1, Number($("ratio-w").value) || 1);
  const h = Math.max(1, Number($("ratio-h").value) || 1);
  S.aspect = w / h;
}
["ratio-w", "ratio-h"].forEach((id) =>
  $(id).addEventListener("input", () => {
    if ($("ratio-custom").hidden) return;
    applyCustomRatio(); reflowBoxForAspect();
  }));

function reflowBoxForAspect() {
  if (!S.locked && S.aspect) {
    const b = S.box;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const area = Math.max(MIN_BOX * MIN_BOX, b.w * b.h);
    const w = Math.sqrt(area * S.aspect), h = w / S.aspect;
    S.box = { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  draw(); updateReadouts(); renderFormatList(); relayout();
}

/* --- Centred vs free ----------------------------------------------------- */
function setLocked(locked) {
  if (!locked && S.locked) S.box = box();
  S.locked = locked;
  [...$("lock-seg").children].forEach((b) =>
    b.setAttribute("aria-pressed", String((b.dataset.lock === "1") === locked)));
  $("size-field").hidden = !locked;
  $("frame-hint").textContent = locked
    ? "The box stays centred — pan and zoom the image behind it."
    : "Drag inside the box to move it, its handles to resize. Drag outside — or hold Space — to pan the image.";
  if (locked && !S.aspect) {
    S.aspect = 1;
    pressOnly($("ratio-seg"), $("ratio-seg").querySelector('[data-ratio="1:1"]'));
    $("ratio-custom").hidden = true;
  }
  draw(); updateReadouts(); renderFormatList(); relayout();
}
$("lock-seg").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-lock]");
  if (btn) setLocked(btn.dataset.lock === "1");
});

const sizeSlider = $("size");
sizeSlider.addEventListener("input", () => {
  S.sizePct = Number(sizeSlider.value);
  $("size-val").textContent = Math.round(S.sizePct) + "%";
  S.guides = true;
  draw(); updateReadouts();
});
const endSize = () => { S.guides = false; draw(); };
sizeSlider.addEventListener("pointerup", endSize);
sizeSlider.addEventListener("blur", endSize);

/* --- Output size --------------------------------------------------------- */
$("size-seg").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-size]");
  if (!btn) return;
  const v = btn.dataset.size;
  pressOnly(e.currentTarget, btn);
  $("custom-res").hidden = v !== "custom";
  if (v === "custom") {
    /* Seed the boxes from whatever the export size currently is. */
    S.outSize = "custom";
    const d = outputDims() || { w: 1024, h: 1024 };
    S.customW = d.w; S.customH = d.h;
    $("res-w").value = d.w; $("res-h").value = d.h;
  } else {
    S.outSize = v === "native" ? "native" : Number(v);
    S.fitMode = null;
  }
  updateReadouts(); renderFormatList(); relayout();
});

$("res-w").addEventListener("input", () => {
  S.customW = clampOut($("res-w").value);
  syncCustomRes("w"); updateReadouts(); relayout();
});
$("res-h").addEventListener("input", () => {
  S.customH = clampOut($("res-h").value);
  syncCustomRes("h"); updateReadouts(); relayout();
});

$("res-lock").addEventListener("click", () => {
  S.resLock = !S.resLock;
  $("res-lock").setAttribute("aria-pressed", String(S.resLock));
  $("res-lock").title = S.resLock
    ? "Locked to the crop's aspect ratio" : "Free — width and height are independent";
  if (S.resLock) S.fitMode = null;
  syncCustomRes("w"); updateReadouts(); relayout();
});

$("fit-seg").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-fit]");
  if (!btn) return;
  if (btn.dataset.fit === "relock") {
    /* "Match ratio" simply re-locks and recomputes the height. */
    S.resLock = true; S.fitMode = null;
    $("res-lock").setAttribute("aria-pressed", "true");
    syncCustomRes("w");
  } else {
    S.fitMode = btn.dataset.fit;
    pressOnly(e.currentTarget, btn);
  }
  updateReadouts(); relayout();
});

/* --- Quality ------------------------------------------------------------- */
const qualitySlider = $("quality");
qualitySlider.addEventListener("input", () => {
  S.quality = Number(qualitySlider.value) / 100;
  $("quality-val").textContent = qualitySlider.value;
  updateSliderFill(qualitySlider);
});

/* --- Background ---------------------------------------------------------- */
$("bg-swatches").addEventListener("click", (e) => {
  const sw = e.target.closest(".swatch[data-color]");
  if (!sw) return;
  S.background = sw.dataset.color;
  syncSwatches();
});
$("bg-custom").addEventListener("input", (e) => { S.background = e.target.value; syncSwatches(); });
function syncSwatches() {
  document.querySelectorAll("#bg-swatches .swatch[data-color]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.color === S.background)));
}

/* --- ICO size chips ------------------------------------------------------ */
const ICO_ALL = [16, 24, 32, 48, 64, 128, 256];
$("ico-chips").innerHTML = ICO_ALL.map((n) =>
  '<button class="chip" data-n="' + n + '" aria-pressed="' +
  S.icoSizes.includes(n) + '">' + n + "</button>").join("");
$("ico-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const n = Number(chip.dataset.n);
  const on = S.icoSizes.includes(n);
  if (on && S.icoSizes.length === 1) return toast("Keep at least one icon size.", true);
  S.icoSizes = on ? S.icoSizes.filter((x) => x !== n) : [...S.icoSizes, n].sort((a, b) => a - b);
  chip.setAttribute("aria-pressed", String(!on));
});

/* ============================================================================
   FORMAT SELECT
   ========================================================================== */
const selBtn  = $("format-btn");
const selList = $("format-list");
let activeIdx = 0;

/* The list lives inside a scrolling popover section in markup, but an
   absolutely-positioned dropdown gets clipped by that ancestor's own
   scrollbox rather than floating above it. Reparenting to <body> plus fixed
   positioning (positionFormatList) escapes that entirely. */
document.body.appendChild(selList);

function positionFormatList() {
  const GAP = 6, EDGE = 8;   // gap from the button; margin kept from the viewport edge
  const r = selBtn.getBoundingClientRect();
  const spaceBelow = innerHeight - r.bottom - GAP - EDGE;
  const spaceAbove = r.top - GAP - EDGE;
  const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;

  selList.style.width = r.width + "px";
  selList.style.left = Math.max(EDGE, Math.min(r.left, innerWidth - r.width - EDGE)) + "px";
  if (openUp) {
    selList.style.top = "";
    selList.style.bottom = (innerHeight - r.top + GAP) + "px";
    selList.style.maxHeight = Math.min(360, spaceAbove) + "px";
  } else {
    selList.style.bottom = "";
    selList.style.top = (r.bottom + GAP) + "px";
    selList.style.maxHeight = Math.min(360, spaceBelow) + "px";
  }
}

function renderFormatList() {
  selList.innerHTML = FORMATS.map((f, i) => {
    const reason = formatBlocked(f.id);
    return '<li role="option" data-id="' + f.id + '" data-i="' + i + '"' +
      ' aria-selected="' + (f.id === S.format) + '"' +
      (reason ? ' aria-disabled="true"' : "") + ">" +
      '<span class="tag">' + f.tag + "</span>" +
      '<span class="txt">' + f.name + "<small>" + (reason || f.desc) + "</small></span></li>";
  }).join("");
  refreshExportState();
}

function openList(open) {
  selList.hidden = !open;
  selBtn.setAttribute("aria-expanded", String(open));
  if (open) {
    renderFormatList();
    positionFormatList();
    activeIdx = Math.max(0, FORMATS.findIndex((f) => f.id === S.format));
    markActive();
  }
}
/* The button can scroll out from under the (now body-level) list, e.g. via
   the popover's own scroll region — close rather than leave it stranded. */
document.querySelector(".pop-body").addEventListener("scroll", () => { if (!selList.hidden) openList(false); });
addEventListener("resize", () => { if (!selList.hidden) positionFormatList(); });
function markActive() {
  [...selList.children].forEach((li, i) => li.classList.toggle("active", i === activeIdx));
  selList.children[activeIdx]?.scrollIntoView({ block: "nearest" });
}

selBtn.addEventListener("click", () => openList(selList.hidden));
selList.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li || li.getAttribute("aria-disabled") === "true") return;
  setFormat(li.dataset.id); openList(false); selBtn.focus();
});
selList.addEventListener("pointermove", (e) => {
  const li = e.target.closest("li");
  if (li) { activeIdx = Number(li.dataset.i); markActive(); }
});
document.addEventListener("pointerdown", (e) => {
  if (!$("format-select").contains(e.target) && !selList.contains(e.target)) openList(false);
});
$("format-select").addEventListener("keydown", (e) => {
  const open = !selList.hidden;
  if (e.key === "Escape") { openList(false); selBtn.focus(); return; }
  if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
    e.preventDefault(); e.stopPropagation(); openList(true); return;
  }
  if (!open) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault(); e.stopPropagation();   // do not also nudge the photo
    const dir = e.key === "ArrowDown" ? 1 : -1;
    for (let n = 0; n < FORMATS.length; n++) {
      activeIdx = (activeIdx + dir + FORMATS.length) % FORMATS.length;
      if (!formatBlocked(FORMATS[activeIdx].id)) break;
    }
    markActive();
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (!formatBlocked(FORMATS[activeIdx].id)) {
      setFormat(FORMATS[activeIdx].id); openList(false); selBtn.focus();
    }
  }
});

function setFormat(id) {
  const f = fmt(id);
  S.format = id;
  $("format-tag").textContent  = f.tag;
  $("format-name").textContent = f.name;
  $("format-desc").textContent = f.desc;
  $("format-readout").textContent = f.name;
  $("quality-field").hidden = !f.lossy;
  $("bg-field").hidden      = f.alpha;
  $("ico-field").hidden     = id !== "ico";
  $("filename-ext-readout").textContent = "." + f.ext;
  renderFormatList();
  relayout();
}

$("filename-input").addEventListener("input", () => { S.filenameEdited = true; });
$("filename-input").addEventListener("blur", () => {
  if (!$("filename-input").value.trim()) { S.filenameEdited = false; updateFilenameDefault(); }
});

/* ============================================================================
   EXPORT
   ========================================================================== */

/** Progressive halving gives a far cleaner downscale than one big drawImage. */
function smoothResize(src, sx, sy, sw, sh, dw, dh) {
  let cur = document.createElement("canvas");
  let cw = Math.max(1, Math.round(Math.min(sw, MAX_OUTPUT)));
  let ch = Math.max(1, Math.round(Math.min(sh, MAX_OUTPUT)));
  cur.width = cw; cur.height = ch;
  let c = cur.getContext("2d");
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
  c.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);

  while (cw > dw * 2 && ch > dh * 2) {
    const nw = Math.max(dw, Math.round(cw / 2)), nh = Math.max(dh, Math.round(ch / 2));
    const next = document.createElement("canvas");
    next.width = nw; next.height = nh;
    const nc = next.getContext("2d");
    nc.imageSmoothingEnabled = true; nc.imageSmoothingQuality = "high";
    nc.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
    cur = next; cw = nw; ch = nh;
  }

  if (cw === dw && ch === dh) return cur;
  const out = document.createElement("canvas");
  out.width = dw; out.height = dh;
  const oc = out.getContext("2d");
  oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = "high";
  oc.drawImage(cur, 0, 0, cw, ch, 0, 0, dw, dh);
  return out;
}

/** Render the crop at the chosen output size, masked to the crop shape. */
/** With the photo rotated, first draw the rotated photo into an upright canvas covering exactly the box, at the photo's
    own pixel scale, then let the normal pipeline downscale and mask it. Returns the canvas and its rect (the whole canvas). */
function rotatedSource() {
  const b = box(), s = S.scale;
  const d = outputDims(), longest = Math.max(b.w / s, b.h / s);
  const f = Math.min(1, MAX_OUTPUT / longest, (Math.max(d.w, d.h) * 2) / longest);   // 2x the output is plenty for the halving downscale
  const w = Math.max(1, Math.round(b.w / s * f)), h = Math.max(1, Math.round(b.h / s * f));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  const ic = imgCenter(), bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const off = rotPt({ x: (bc.x - ic.x) / s, y: (bc.y - ic.y) / s }, -S.rel, { x: 0, y: 0 });   // box centre, in photo pixels
  g.translate(w / 2, h / 2); g.scale(f, f); g.rotate(S.rel);
  g.translate(-S.img.width / 2 - off.x, -S.img.height / 2 - off.y);
  g.drawImage(S.img, 0, 0);
  /* If nothing of the photo landed in the box, say so rather than exporting a blank file. */
  const probe = document.createElement("canvas"); probe.width = probe.height = 16;
  const pg = probe.getContext("2d"); pg.drawImage(cv, 0, 0, 16, 16);
  const px = pg.getImageData(0, 0, 16, 16).data;
  let any = false; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) { any = true; break; }
  if (!any) throw new Error("The crop box is outside the image");
  return { src: cv, rect: { x: 0, y: 0, w, h } };
}

function renderCrop() {
  let src = S.img, c;
  if (isRotated()) ({ src, rect: c } = rotatedSource()); else c = cropRectImg();
  const d = outputDims();

  /* "Crop overflow" narrows the source rect to the output's ratio first, so
     the two axis scales come out equal and nothing is distorted. "Stretch"
     just lets the two scales differ. */
  if (S.fitMode === "cover" && resMismatch()) {
    const targetA = d.w / d.h, curA = c.w / c.h;
    if (curA > targetA) { const nw = c.h * targetA; c = { ...c, x: c.x + (c.w - nw) / 2, w: nw }; }
    else                { const nh = c.w / targetA; c = { ...c, y: c.y + (c.h - nh) / 2, h: nh }; }
  }

  const kx = d.w / c.w, ky = d.h / c.h;
  const out = document.createElement("canvas");
  out.width = d.w; out.height = d.h;
  const oc = out.getContext("2d");

  /* The box can hang off the edge of the image; draw only the overlap, placed
     at the right offset inside the output rectangle. */
  const ix0 = Math.max(0, c.x), iy0 = Math.max(0, c.y);
  const ix1 = Math.min(src.width,  c.x + c.w);
  const iy1 = Math.min(src.height, c.y + c.h);
  if (ix1 - ix0 < 1 || iy1 - iy0 < 1) throw new Error("The crop box is outside the image");

  const dw = Math.max(1, Math.round((ix1 - ix0) * kx));
  const dh = Math.max(1, Math.round((iy1 - iy0) * ky));
  const piece = smoothResize(src, ix0, iy0, ix1 - ix0, iy1 - iy0, dw, dh);
  oc.drawImage(piece, Math.round((ix0 - c.x) * kx), Math.round((iy0 - c.y) * ky));

  /* Mask with destination-in rather than clip() — the edge is antialiased. */
  const r = radiusOf(d.w, d.h);
  if (!(r !== null && r < 0.5)) {
    oc.globalCompositeOperation = "destination-in";
    oc.fillStyle = "#000";
    oc.beginPath();
    traceShape(oc, 0, 0, d.w, d.h, r);
    oc.fill();
    oc.globalCompositeOperation = "source-over";
  }
  return { canvas: out, radius: r };
}

/** Centre a canvas on a transparent square of its longer edge. */
function padToSquare(src) {
  const n = Math.max(src.width, src.height);
  const out = document.createElement("canvas");
  out.width = n; out.height = n;
  out.getContext("2d").drawImage(src,
    Math.round((n - src.width) / 2), Math.round((n - src.height) / 2));
  return out;
}

/* ============================================================================
   EXPORT POPOVER  — opened from the top-bar Export button; holds resolution
   and format settings plus the actual save action.
   ========================================================================== */
const exportPop = $("export-pop");

function openExportPop() {
  if (!S.img) return;
  if (S.govt) scheduleGovtPreview();
  exportPop.hidden = false;
  $("export-btn").setAttribute("aria-expanded", "true");
  relayout();
}
function closeExportPop() {
  exportPop.hidden = true;
  $("export-btn").setAttribute("aria-expanded", "false");
  relayout();
}
$("export-btn").addEventListener("click", () => exportPop.hidden ? openExportPop() : closeExportPop());
$("export-close").addEventListener("click", closeExportPop);
document.addEventListener("pointerdown", (e) => {
  /* The format dropdown is reparented to <body> (see FORMAT SELECT below), so
     a click inside it is not a descendant of exportPop and must be exempted
     explicitly, or picking a format would close the whole popover under it. */
  if (!exportPop.hidden && !exportPop.contains(e.target) && !selList.contains(e.target)
      && e.target !== $("export-btn") && !$("export-btn").contains(e.target)) closeExportPop();
});
/* Independent of the canvas shortcut handler below, which ignores keydowns
   while an input is focused — Escape should still close the popover then. */
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !exportPop.hidden) { closeExportPop(); $("export-btn").focus(); }
});

$("export-confirm").addEventListener("click", async () => {
  if (!S.img) return;
  let reason = formatBlocked(S.format);
  if (!reason && resMismatch() && !S.fitMode) reason = "Choose how to handle the ratio mismatch";
  if (reason) return toast(reason, true);

  const btn = $("export-confirm");
  btn.disabled = true;
  try {
    let { canvas, radius } = renderCrop();
    /* Icons must be square. Centre a non-square crop on a transparent square
       rather than distorting it or refusing the export. */
    if (S.format === "ico" && canvas.width !== canvas.height) canvas = padToSquare(canvas);
    const f = fmt(S.format);
    let blob, filename_ext, govtState = null;
    if (S.govt) {
      const r = await encodeToTarget(canvas, S.govt);
      blob = r.blob; filename_ext = "jpg"; govtState = r.state;
    } else {
      ({ blob, filename_ext } = await Encoders.encode(canvas, S.format, {
        quality: S.quality,
        icoSizes: S.icoSizes,
        background: f.alpha ? null : S.background,
        svgClip: radius === null ? { type: "ellipse" } : { type: "rect", radius },
      }));
    }
    const filename = sanitizeFilename($("filename-input").value) + "." + (filename_ext || f.ext);
    await saveBlob(blob, filename, blob.type);
    toast("Saved " + filename + "  ·  " + (S.govt ? (blob.size / 1000).toFixed(1) + " KB (limit " + S.govt.maxKB + " KB)" + (govtState === "small" ? " \u2014 below the recommended " + S.govt.recMin + "\u2013" + S.govt.recMax + " KB (still accepted)" : "") : prettyBytes(blob.size)));
  } catch (err) {
    toast((err && err.message ? err.message : "Export failed") + ".", true);
  } finally {
    refreshExportState();
  }
});

async function saveBlob(blob, filename, mime) {
  /* Prefer a real Save dialog where the browser offers one. */
  if (window.showSaveFilePicker) {
    try {
      const ext = "." + filename.split(".").pop();
      const handle = await showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: ext.slice(1).toUpperCase() + " image", accept: { [mime]: [ext] } }],
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return;
    } catch (err) {
      if (err && err.name === "AbortError") throw new Error("Save cancelled");
      /* Anything else (unsupported type, sandboxed page) falls through. */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function prettyBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(2) + " MB";
}

/* ============================================================================
   TOAST
   ========================================================================== */
let toastTimer;
function toast(msg, isError) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.toggle("err", !!isError);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), isError ? 4200 : 2600);
  flashStatus(msg, isError ? "warn" : "ok", isError ? 8000 : 5000);
}

/* ============================================================================
   ROTATE CARD  (photo or box, one at a time)
   ========================================================================== */
let rotTarget = "photo";
const curAngle = () => (rotTarget === "photo" ? photoAngle() : boxAngle());
function syncRotateUI() {
  const ang = curAngle(), sl = $("rot");
  if (document.activeElement !== sl) sl.value = ang;
  $("rot-val").textContent = fmtDeg(ang);
  updateSliderFill(sl);
  const r = [];
  if (Math.abs(photoAngle()) > 0.05) r.push("photo " + fmtDeg(photoAngle()));
  if (Math.abs(boxAngle()) > 0.05) r.push("box " + fmtDeg(boxAngle()));
  $("rot-readout").textContent = r.length ? r.join(" \u00b7 ") : "level";
  $("rot-hint").textContent = rotTarget === "photo"
    ? "Turns the photo behind the box. Keys: [ and ] (Shift for 5\u00b0)."
    : "Turns the box over the photo, which stays put. Keys: [ and ] (Shift for 5\u00b0).";
}
$("rot").addEventListener("input", () => setAngle(rotTarget, Number($("rot").value)));
$("rot-ccw").onclick = () => setAngle(rotTarget, normDeg(curAngle() - 90));
$("rot-cw").onclick = () => setAngle(rotTarget, normDeg(curAngle() + 90));
$("rot-reset").onclick = () => setAngle(rotTarget, 0);
$("rot-target").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-rot]");
  if (!btn) return;
  rotTarget = btn.dataset.rot;
  pressOnly(e.currentTarget, btn);
  syncRotateUI();
});

/* ============================================================================
   GOVERNMENT FORM PRESETS  (Photo / Signature)
   Sets shape, ratio, size, format and background in one go, then tunes the JPEG quality at export so the file lands
   inside the recommended size range and never above the hard limit. Sizes are decimal KB (1 KB = 1000 bytes), which is
   safe for the maximum under either convention (a decimal minimum is slightly stricter than a binary one).
   ========================================================================== */
const GOVT = {
  photo:     { id: "photo",     label: "Photo",     w: 300, h: 300, maxKB: 100, recMin: 50, recMax: 90 },
  signature: { id: "signature", label: "Signature", w: 300, h: 80,  maxKB: 60,  recMin: 20, recMax: 50 },
};
let govtApplying = false, govtTimer = null, govtSeq = 0;

function govtStillValid() {
  const g = S.govt;
  return S.format === "jpeg" && S.outSize === "custom" && S.customW === g.w && S.customH === g.h;
}

function applyGovt(id) {
  const g = GOVT[id];
  if (!g) return;
  govtApplying = true;
  try {
    S.shape = "rect"; S.roundPct = 0;
    pressOnly($("shape-seg"), $("shape-seg").querySelector('[data-shape="rect"]'));
    $("round").value = 0; $("round-val").textContent = "0%"; $("round-field").hidden = false;
    S.aspect = g.w / g.h;
    pressOnly($("ratio-seg"), $("ratio-seg").querySelector('[data-ratio="custom"]'));
    $("ratio-custom").hidden = false; $("ratio-w").value = g.w; $("ratio-h").value = g.h;
    setLocked(true);
    S.outSize = "custom"; S.customW = g.w; S.customH = g.h; S.resLock = true; S.fitMode = null;
    pressOnly($("size-seg"), $("size-seg").querySelector('[data-size="custom"]'));
    $("custom-res").hidden = false; $("res-w").value = g.w; $("res-h").value = g.h;
    $("res-lock").setAttribute("aria-pressed", "true");
    S.background = "#ffffff"; syncSwatches();
    setFormat("jpeg");
    S.filenameEdited = false;
    if (S.img) centerAt(fillScale());
  } finally { govtApplying = false; }
  S.govt = g; S.govtEst = null; S.govtEstLevel = null;
  draw(); updateReadouts();
  toast(g.label + " preset: " + g.w + " \u00d7 " + g.h + " px JPG, max " + g.maxKB + " KB.");
}

function syncGovtUI() {
  const g = S.govt;
  $("govt-note").hidden = !g;
  $("govt-btn").classList.toggle("active", !!g);
  if (g) {
    $("govt-title").textContent = g.label + " preset";
    $("govt-detail").textContent = g.w + " \u00d7 " + g.h + " px \u00b7 JPG \u00b7 max " + g.maxKB + " KB. Quality is tuned " +
      "automatically to land in " + g.recMin + "\u2013" + g.recMax + " KB.";
  }
  $("quality-field").hidden = !fmt(S.format).lossy || !!g;
}

/** Encode as JPEG at the highest quality whose size stays inside the recommended range (falling back to the hard
    limit). Throws if even quality 0.05 cannot get under the limit. */
async function encodeToTarget(canvas, g) {
  const limit = g.maxKB * 1000, aim = g.recMax * 1000, floor = g.recMin * 1000;
  const enc = async (q) => (await Encoders.encode(canvas, "jpeg", { quality: q, background: S.background })).blob;
  const stateOf = (n) => (n < floor ? "small" : n > aim ? "high" : "ok");
  const top = await enc(0.98);
  if (top.size <= aim) return { blob: top, q: 0.98, state: stateOf(top.size) };
  const search = async (target) => {
    let lo = 0.05, hi = 0.98, best = null;
    const first = await enc(lo);
    if (first.size > target) return null;
    best = { blob: first, q: lo };
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2, b = await enc(mid);
      if (b.size <= target) { best = { blob: b, q: mid }; lo = mid; } else hi = mid;
    }
    return best;
  };
  const r = (await search(aim)) || (await search(limit));
  if (!r) throw new Error("Cannot get under " + g.maxKB + " KB at " + g.w + " \u00d7 " + g.h + " \u2014 try a less detailed area");
  return { ...r, state: stateOf(r.blob.size) };
}

function scheduleGovtPreview() {
  clearTimeout(govtTimer);
  govtTimer = setTimeout(previewGovt, 280);
}
async function previewGovt() {
  const g = S.govt;
  if (!g || !S.img) return;
  const mine = ++govtSeq;
  try {
    const { canvas } = renderCrop();
    const r = await encodeToTarget(canvas, g);
    if (S.govt !== g || mine !== govtSeq) return;
    S.govtEst = (r.blob.size / 1000).toFixed(1) + " KB";
    S.govtEstLevel = r.state === "ok" ? "ok" : "warn";
    $("govt-result").textContent = "Estimated " + S.govtEst + " at quality " + Math.round(r.q * 100) +
      (r.state === "ok" ? " \u2014 inside the recommended range."
       : r.state === "small" ? " \u2014 below the recommended range (still within the limit)."
       : " \u2014 above the recommended range but under the limit.");
  } catch (e) {
    if (mine !== govtSeq) return;
    S.govtEst = null; S.govtEstLevel = "warn";
    $("govt-result").textContent = (e && e.message ? e.message : "Could not estimate the size") + ".";
  }
  refreshStatus();
}

const govtBtn = $("govt-btn"), govtMenu = $("govt-menu");
function openGovtMenu(open) { govtMenu.hidden = !open; govtBtn.setAttribute("aria-expanded", String(open)); }
govtBtn.addEventListener("click", () => openGovtMenu(govtMenu.hidden));
govtMenu.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-govt]");
  if (!b) return;
  openGovtMenu(false);
  applyGovt(b.dataset.govt);
});
document.addEventListener("pointerdown", (e) => {
  if (!govtMenu.hidden && !govtMenu.contains(e.target) && !govtBtn.contains(e.target)) openGovtMenu(false);
});
addEventListener("keydown", (e) => { if (e.key === "Escape" && !govtMenu.hidden) { openGovtMenu(false); govtBtn.focus(); } });
$("govt-clear").addEventListener("click", () => {
  S.govt = null; S.govtEst = null; S.govtEstLevel = null;
  syncGovtUI(); refreshStatus(); toast("Government preset cleared.");
});

/* ============================================================================
   BOOT
   ========================================================================== */
(async function boot() {
  resize();
  try {
    if (window.Encoders && Encoders.detect) SUPPORT = await Encoders.detect();
  } catch (_) { /* keep the optimistic defaults */ }
  if (formatBlocked(S.format)) S.format = "png";
  setFormat(S.format);
  syncSwatches();
  setLocked(true);
  relayout();
  stage.style.cursor = "default";
  addEventListener("resize", relayout);
})();