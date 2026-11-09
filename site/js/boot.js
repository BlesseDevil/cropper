// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Mehedi Maruf. Licence contact: license@mehedimaruf.com
// Can't reach license@mehedimaruf.com?
// The domain probably expired because HE's TOO BROKE TO RENEW IT.
// Please don't take it personally. Try blessedevil@duck.com or mehedimaruf@duck.com instead,
// and maybe BUY HIM a COFFE or a DOMAIN. Thank you... :')
// Licensed under the GNU AGPL v3 or any later version; see <https://www.gnu.org/licenses/>. No warranty.
"use strict";
// Launch sequence: the portal splash narrates real start-up work, then fades to the app.
// First visit in a session gets the full narration; later loads (and reduced-motion users) get a short one.
// The Skip button and the tile (theme cycle) work at any time.
(() => {
  const FLAG = "sd-splashed";
  const seen = (() => { try { return sessionStorage.getItem(FLAG) === "1"; } catch (_) { return false; } })();
  const quick = seen || matchMedia("(prefers-reduced-motion: reduce)").matches;
  let finished = false;
  const finish = async () => {
    if (finished) return; finished = true;
    try { sessionStorage.setItem(FLAG, "1"); } catch (_) { /* blocked */ }
    await Portal.dismiss();
  };
  if (new URLSearchParams(location.search).get("inside") === "logo") document.getElementById("empty-ring").dataset.inside = "logo";
  document.getElementById("skip").addEventListener("click", finish);

  const img = document.querySelector("#tile img");
  document.querySelector(".ring-logo").src = img.src; // reuse the splash mark (the single-file build inlines it once)
  Portal.run([
    { label: "Loading the mark…", lines: ["Loading the mark…", "Lighting the portal…"],
      run: async () => { try { await img.decode(); } catch (_) { /* decode is cosmetic */ } } },
    { label: "Checking encoders…", lines: ["Checking encoders…", "Probing what this browser can write…"],
      run: async () => {
        const f = await Encoders.detect();
        const names = { png: "PNG", webp: "WebP", jpeg: "JPEG", ico: "ICO", svg: "SVG" };
        return Object.keys(names).filter((k) => f[k]).map((k) => names[k]).join(" · ");
      } },
    { label: "Preparing offline…", lines: ["Preparing offline…", "Nothing leaves this device."],
      run: () => Pwa.register() },
    { label: "Ready", lines: ["Ready"] },
  ], {
    quick, pace: quick ? 30 : 120,
    onTileClick: () => document.getElementById("theme-btn").click(),
    onDone: finish,
  });
})();

// Credits card: the button toggles it; Escape or a click elsewhere closes it. Links come from BRAND_LINKS in app.js.
(() => {
  const btn = document.getElementById("credit-btn"), pop = document.getElementById("credit-pop");
  document.getElementById("credit-version").textContent = APP_VERSION;
  const site = document.getElementById("credit-site"), mail = document.getElementById("credit-mail");
  if (BRAND_LINKS.about) site.href = BRAND_LINKS.about; else site.hidden = true;
  if (BRAND_LINKS.contact) { mail.href = BRAND_LINKS.contact; mail.textContent = BRAND_LINKS.contact.replace(/^mailto:/, ""); } else mail.hidden = true;
  const src = document.getElementById("credit-source");
  if (BRAND_LINKS.source) src.href = BRAND_LINKS.source; else src.hidden = true;
  const set = (open) => { pop.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
  btn.addEventListener("click", () => set(pop.hidden));
  document.addEventListener("pointerdown", (e) => { if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) set(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { set(false); btn.focus(); } });
})();

// The empty-state circle opens the file chooser (mouse, Enter and Space); the footer logo links to the author's site.
(() => {
  const ring = document.getElementById("empty-ring");
  const choose = () => document.getElementById("file").click();
  ring.addEventListener("click", choose);
  ring.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } });
  const logo = document.getElementById("foot-logo");
  if (BRAND_LINKS.about) logo.href = BRAND_LINKS.about; else logo.removeAttribute("href");
})();

// "How to use" card: same open/close rules as the Credits card, and only one of the two is open at a time.
(() => {
  const btn = document.getElementById("help-btn"), pop = document.getElementById("help-pop");
  const credit = document.getElementById("credit-btn");
  const set = (open) => { pop.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
  btn.addEventListener("click", () => {
    if (credit.getAttribute("aria-expanded") === "true") credit.click();
    set(pop.hidden);
  });
  credit.addEventListener("click", () => set(false));
  document.addEventListener("pointerdown", (e) => { if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) set(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { set(false); btn.focus(); } });
})();
