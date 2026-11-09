// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Mehedi Maruf. Licence contact: license@mehedimaruf.com
// Can't reach license@mehedimaruf.com?
// The domain probably expired because HE's TOO BROKE TO RENEW IT.
// Please don't take it personally. Try blessedevil@duck.com or mehedimaruf@duck.com instead,
// and maybe BUY HIM a COFFE or a DOMAIN. Thank you... :')
// Licensed under the GNU AGPL v3 or any later version; see <https://www.gnu.org/licenses/>. No warranty.
"use strict";
// PWA support: service-worker registration and the Install button.
//
// Install button rules:
//   * Chromium (Chrome, Edge, Android): shown only after the browser fires `beforeinstallprompt`; click opens the
//     native install dialog.
//   * iOS / iPadOS Safari has no install prompt, so the button is shown and explains Share -> Add to Home Screen.
//   * Hidden when already running as an installed app, after `appinstalled`, and wherever install is not possible
//     (file://, Firefox desktop, ...).
const Pwa = (() => {
  const btn = document.getElementById("install-btn");
  let deferred = null;

  const standalone = () =>
    matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIos = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const secure = () => location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const note = (msg) => (typeof toast === "function" ? toast(msg) : alert(msg));

  function refresh() {
    if (!btn) return;
    btn.hidden = standalone() || !(deferred || (isIos() && secure()));
  }

  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; refresh(); });
  addEventListener("appinstalled", () => { deferred = null; refresh(); note("SliceDevil installed."); });
  matchMedia("(display-mode: standalone)").addEventListener("change", refresh);

  if (btn) btn.addEventListener("click", async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null; refresh();
    } else if (isIos()) {
      note("To install: tap the Share button, then \"Add to Home Screen\".");
    }
  });

  /** Registers the service worker. Resolves to a short status string for the splash. */
  async function register() {
    if (location.protocol === "file:") return "running from a local file";
    if (!("serviceWorker" in navigator)) return "offline mode not supported here";
    if (!secure()) return "online only (needs https)";
    try {
      await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
      return "works offline";
    } catch (e) {
      return "online only";
    }
  }

  refresh();
  return { register, refresh };
})();
