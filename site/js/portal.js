// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Mehedi Maruf. Licence contact: license@mehedimaruf.com
// Can't reach license@mehedimaruf.com?
// The domain probably expired because HE's TOO BROKE TO RENEW IT.
// Please don't take it personally. Try blessedevil@duck.com or mehedimaruf@duck.com instead,
// and maybe BUY HIM a COFFE or a DOMAIN. Thank you... :')
// Licensed under the GNU AGPL v3 or any later version; see <https://www.gnu.org/licenses/>. No warranty.
"use strict";
// Portal splash runner (web adaptation of the Blessedevil portal kit). No dependencies.
//
//   Portal.run([{ label, lines: [..narration..], run: async () => "short detail" }, ...],
//              { onDone, onTileClick, pace, quick });
//
// Differences from the desktop kit:
//   * Theme is owned by the app (<html data-theme>), not by the portal. The tile click is handed to `onTileClick`
//     so the app cycles its own theme, and the mark swaps whenever data-theme (or the OS scheme) changes.
//   * `quick: true` narrates only the first line of each step, for repeat visits.
//   * `Portal.dismiss()` fades the splash out and resolves when it is gone. Reduced-motion skips the fade.
const Portal = (() => {
  const $ = (s) => document.querySelector(s);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const root = document.documentElement;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const isDark = () => {
    const mode = root.dataset.theme || "system";
    return mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  };

  /** Light theme shows the full-colour mark; dark shows the gold one. */
  function syncMark() {
    const img = $("#tile img");
    if (!img || !img.dataset.light || !img.dataset.gold) return;
    const want = isDark() ? img.dataset.gold : img.dataset.light;
    if (img.getAttribute("src") !== want) img.setAttribute("src", want);
  }
  new MutationObserver(syncMark).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncMark);
  syncMark();

  function dismiss() {
    const splash = $("#splash");
    if (!splash || splash.hidden) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => { splash.hidden = true; resolve(); };
      if (reduced()) { finish(); return; }
      splash.classList.add("leaving");
      splash.addEventListener("transitionend", finish, { once: true });
      setTimeout(finish, 800); // safety net if transitionend never fires (hidden tab)
    });
  }

  async function run(steps, opts = {}) {
    const step = $("#step"), pct = $("#pct"), fill = $("#fill"), trail = $("#trail");
    $("#tile").onclick = () => { if (opts.onTileClick) opts.onTileClick(); };
    $(".err")?.remove();
    trail.replaceChildren(); fill.style.width = "0"; pct.textContent = "0%"; delete step.dataset.cur;
    const say = (text) => {
      if (step.dataset.cur) { const d = document.createElement("div"); d.textContent = step.dataset.cur; trail.append(d); }
      while (trail.children.length > 3) trail.firstChild.remove();
      step.textContent = text; step.dataset.cur = text;
    };
    const linesOf = (s) => (opts.quick ? [(s.lines || [s.label])[0]] : (s.lines || [s.label]));
    try {
      const total = steps.reduce((n, s) => n + linesOf(s).length, 0);
      let done = 0;
      for (const s of steps) {
        const lines = linesOf(s);
        for (let k = 0; k < lines.length; k++) {
          say(lines[k]);
          if (k === 0 && s.run) { const detail = await s.run(); if (detail) say(`${String(s.label).replace(/…$/, "")} · ${detail}`); }
          done++;
          const p = Math.min(100, Math.round((done / total) * 100));
          fill.style.width = p + "%"; pct.textContent = p + "%";
          await wait(opts.pace ?? 120);
        }
      }
      fill.style.width = "100%"; pct.textContent = "100%";
      await wait(opts.quick ? 120 : 350);
      if (opts.onDone) await opts.onDone();
    } catch (e) {
      step.textContent = "Could not start";
      const err = document.createElement("div"); err.className = "err";
      const b = document.createElement("button"); b.textContent = "Retry"; b.onclick = () => run(steps, opts);
      err.append(String((e && e.message) || e), b); $("#splash").append(err);
    }
  }
  return { run, dismiss, syncMark, isDark };
})();
