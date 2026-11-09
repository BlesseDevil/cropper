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
/* ============================================================================
   ENCODERS  (format encoding: png / jpeg / webp / avif / ico / svg)
   ========================================================================== */
/**
 * encoders.js
 *
 * Self-contained, dependency-free browser module for encoding a <canvas>
 * into several image formats: png, jpeg, webp, avif, ico, svg.
 *
 * Exposes exactly one global: `Encoders`.
 *
 * No imports/exports, no build step. Load with a plain <script> tag from
 * a file:// page.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------

  /**
   * Draw `srcCanvas` onto a new canvas of the same size, composited over
   * an opaque solid background color. Used for formats without usable
   * alpha (jpeg, and avif when a background is requested).
   * @param {HTMLCanvasElement|OffscreenCanvas} srcCanvas
   * @param {string} background CSS color string
   * @returns {HTMLCanvasElement}
   */
  function compositeOnBackground(srcCanvas, background) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) {
      throw new Error('Encoders: failed to get 2D context for background compositing');
    }
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(srcCanvas, 0, 0);
    return out;
  }

  /**
   * Promise wrapper around canvas.toBlob.
   * @param {HTMLCanvasElement} canvas
   * @param {string} mime
   * @param {number} [quality]
   * @returns {Promise<Blob>}
   */
  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error(`Encoders: toBlob returned null for mime "${mime}"`));
              return;
            }
            resolve(blob);
          },
          mime,
          quality
        );
      } catch (err) {
        reject(new Error(`Encoders: toBlob threw for mime "${mime}": ${err.message}`));
      }
    });
  }

  /**
   * Read the first N bytes of a Blob as a Uint8Array.
   * @param {Blob} blob
   * @param {number} n
   * @returns {Promise<Uint8Array>}
   */
  async function readMagicBytes(blob, n) {
    const slice = blob.slice(0, n);
    const buf = await slice.arrayBuffer();
    return new Uint8Array(buf);
  }

  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const JPEG_MAGIC = [0xff, 0xd8, 0xff];
  const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
  const AVIF_FTYP_BRAND = 'avif'; // appears at byte offset 8..11 typically, ftyp box

  function bytesStartWith(bytes, magic) {
    if (bytes.length < magic.length) return false;
    for (let i = 0; i < magic.length; i++) {
      if (bytes[i] !== magic[i]) return false;
    }
    return true;
  }

  /**
   * Build a tiny 2x2 opaque red test canvas used for feature detection.
   * @returns {HTMLCanvasElement}
   */
  function makeProbeCanvas() {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 2, 2);
    return c;
  }

  /**
   * Attempt to encode the probe canvas to `mime` and verify the resulting
   * blob is genuinely that format (not a silent fallback to PNG).
   * @param {HTMLCanvasElement} probe
   * @param {string} mime
   * @returns {Promise<boolean>}
   */
  async function canActuallyEncode(probe, mime) {
    try {
      const blob = await canvasToBlob(probe, mime, 0.8);
      if (!blob || blob.type !== mime) return false;

      const magic = await readMagicBytes(blob, 16);

      if (mime === 'image/png') {
        return bytesStartWith(magic, PNG_MAGIC);
      }
      if (mime === 'image/jpeg') {
        return bytesStartWith(magic, JPEG_MAGIC);
      }
      if (mime === 'image/webp') {
        // RIFF....WEBP
        if (!bytesStartWith(magic, WEBP_RIFF)) return false;
        const webpTag = String.fromCharCode(magic[8], magic[9], magic[10], magic[11]);
        return webpTag === 'WEBP';
      }
      if (mime === 'image/avif') {
        // ISO BMFF: bytes 4-7 are "ftyp", brand follows at 8-11 (may be
        // "avif" or "avis"; some encoders use a different major brand but
        // still list avif in compatible brands further along). Accept any
        // ftyp box as a strong signal combined with the mime-type match
        // already checked above, but prefer the strict brand check first.
        const isFtyp =
          magic[4] === 0x66 && magic[5] === 0x74 && magic[6] === 0x79 && magic[7] === 0x70; // "ftyp"
        if (!isFtyp) return false;
        const brand = String.fromCharCode(magic[8], magic[9], magic[10], magic[11]);
        return brand === 'avif' || brand === 'avis' || brand === 'mif1';
      }
      return false;
    } catch (_err) {
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // ICO encoder
  // ---------------------------------------------------------------------

  /**
   * Downscale `srcCanvas` to exactly `targetSize` x `targetSize`, stepping
   * down by halves until within 2x of the target for better quality, then
   * doing a final high-quality draw.
   * @param {HTMLCanvasElement} srcCanvas
   * @param {number} targetSize
   * @returns {HTMLCanvasElement}
   */
  function downscaleForIco(srcCanvas, targetSize) {
    let current = srcCanvas;

    // Step down by halves while the current size is more than 2x target.
    while (current.width > targetSize * 2 && current.height > targetSize * 2) {
      const nextW = Math.max(targetSize, Math.floor(current.width / 2));
      const nextH = Math.max(targetSize, Math.floor(current.height / 2));
      const step = document.createElement('canvas');
      step.width = nextW;
      step.height = nextH;
      const stepCtx = step.getContext('2d');
      stepCtx.imageSmoothingEnabled = true;
      stepCtx.imageSmoothingQuality = 'high';
      stepCtx.drawImage(current, 0, 0, nextW, nextH);
      current = step;
    }

    // Final draw to exact target size.
    const out = document.createElement('canvas');
    out.width = targetSize;
    out.height = targetSize;
    const outCtx = out.getContext('2d');
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(current, 0, 0, targetSize, targetSize);
    return out;
  }

  /**
   * Normalize/validate the requested ICO sizes: sort ascending, dedupe,
   * fall back to a sane default, and reject out-of-range values.
   * @param {number[]|undefined} sizes
   * @returns {number[]}
   */
  function normalizeIcoSizes(sizes) {
    const defaults = [16, 32, 48, 64, 128, 256];
    const input = Array.isArray(sizes) && sizes.length > 0 ? sizes : defaults;

    const cleaned = Array.from(new Set(input.map((n) => Math.round(n))))
      .filter((n) => n > 0 && n <= 256)
      .sort((a, b) => a - b);

    if (cleaned.length === 0) {
      throw new Error('Encoders: icoSizes must contain at least one value in range 1..256');
    }
    return cleaned;
  }

  /**
   * Build a multi-resolution .ico file (Vista+ PNG-compressed form) from a
   * source canvas.
   * @param {HTMLCanvasElement} srcCanvas
   * @param {number[]} sizesInput
   * @returns {Promise<Blob>}
   */
  async function encodeIco(srcCanvas, sizesInput) {
    const sizes = normalizeIcoSizes(sizesInput);
    const n = sizes.length;

    // Render + PNG-encode each requested size.
    const pngBuffers = [];
    for (const size of sizes) {
      const resized = downscaleForIco(srcCanvas, size);
      const blob = await canvasToBlob(resized, 'image/png');
      const buf = await blob.arrayBuffer();
      pngBuffers.push(new Uint8Array(buf));
    }

    const headerSize = 6 + 16 * n;
    const totalSize = headerSize + pngBuffers.reduce((sum, b) => sum + b.byteLength, 0);

    const out = new Uint8Array(totalSize);
    const view = new DataView(out.buffer);

    // ICONDIR
    view.setUint16(0, 0, true); // reserved
    view.setUint16(2, 1, true); // type: 1 = icon
    view.setUint16(4, n, true); // count

    let offset = headerSize;
    for (let i = 0; i < n; i++) {
      const entryOffset = 6 + 16 * i;
      const size = sizes[i];
      const byteSize = size === 256 ? 0 : size; // 0 means 256 per ICO spec

      out[entryOffset + 0] = byteSize; // width
      out[entryOffset + 1] = byteSize; // height
      out[entryOffset + 2] = 0; // color count (0 = no palette / >=256 colors)
      out[entryOffset + 3] = 0; // reserved
      view.setUint16(entryOffset + 4, 1, true); // planes
      view.setUint16(entryOffset + 6, 32, true); // bit count
      view.setUint32(entryOffset + 8, pngBuffers[i].byteLength, true); // bytes in resource
      view.setUint32(entryOffset + 12, offset, true); // image offset

      out.set(pngBuffers[i], offset);
      offset += pngBuffers[i].byteLength;
    }

    return new Blob([out], { type: 'image/x-icon' });
  }

  // ---------------------------------------------------------------------
  // SVG encoder
  // ---------------------------------------------------------------------

  /**
   * Base64-encode an ArrayBuffer in chunks to avoid blowing the call stack
   * on large inputs (String.fromCharCode.apply has an argument-count limit).
   * @param {ArrayBuffer} buffer
   * @returns {string}
   */
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  /**
   * Wrap a source canvas as a clipped SVG document with the raster embedded as
   * a base64 PNG data URI, so the result stays scalable.
   *
   * The clip shape is described by the caller rather than assumed, because the
   * crop box is not necessarily a circle:
   *   {type:'ellipse'}              -> full-bleed ellipse (a circle when w===h)
   *   {type:'rect', radius:number}  -> rounded rectangle; radius 0 means sharp
   *   null / undefined              -> no clip at all
   *
   * @param {HTMLCanvasElement} srcCanvas
   * @param {{type:'ellipse'}|{type:'rect', radius:number}|null} [clip]
   * @returns {Promise<Blob>}
   */
  async function encodeSvg(srcCanvas, clip) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;

    const pngBlob = await canvasToBlob(srcCanvas, 'image/png');
    const buf = await pngBlob.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    const dataUri = `data:image/png;base64,${base64}`;

    let defs = '';
    let clipAttr = '';
    const shape = clip || { type: 'ellipse' };

    if (shape.type === 'ellipse') {
      defs =
        `<defs><clipPath id="c">` +
        `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}"/>` +
        `</clipPath></defs>`;
      clipAttr = ' clip-path="url(#c)"';
    } else if (shape.type === 'rect') {
      // A radius of 0 needs no clip path at all -- the image already fills the
      // viewBox exactly, so emitting one would be dead weight.
      const r = Math.max(0, Math.min(Number(shape.radius) || 0, Math.min(w, h) / 2));
      if (r > 0) {
        defs =
          `<defs><clipPath id="c">` +
          `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}"/>` +
          `</clipPath></defs>`;
        clipAttr = ' clip-path="url(#c)"';
      }
    } else {
      throw new Error(`Encoders: unknown svg clip type "${shape.type}"`);
    }

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      defs +
      `<image href="${dataUri}" xlink:href="${dataUri}" width="${w}" height="${h}"` +
      clipAttr + ` preserveAspectRatio="none"/>` +
      `</svg>`;

    return new Blob([svg], { type: 'image/svg+xml' });
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  const MIME_BY_FORMAT = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
  };

  const EXT_BY_FORMAT = {
    png: 'png',
    jpeg: 'jpg',
    webp: 'webp',
    avif: 'avif',
    ico: 'ico',
    svg: 'svg',
  };

  let detectionCache = null;

  /**
   * Runtime feature-detection of which MIME types this browser can
   * genuinely encode via canvas.toBlob.
   * @returns {Promise<{png:boolean, jpeg:boolean, webp:boolean, avif:boolean, ico:boolean, svg:boolean}>}
   */
  async function detect() {
    if (detectionCache) return detectionCache;

    const probe = makeProbeCanvas();

    const [png, jpeg, webp, avif] = await Promise.all([
      canActuallyEncode(probe, 'image/png'),
      canActuallyEncode(probe, 'image/jpeg'),
      canActuallyEncode(probe, 'image/webp'),
      canActuallyEncode(probe, 'image/avif'),
    ]);

    detectionCache = {
      png,
      jpeg,
      webp,
      avif,
      ico: true, // hand-rolled encoder, always available
      svg: true, // hand-rolled encoder, always available
    };

    return detectionCache;
  }

  /**
   * Encode a canvas into the requested format.
   * @param {HTMLCanvasElement} canvas
   * @param {'png'|'jpeg'|'webp'|'avif'|'ico'|'svg'} format
   * @param {{quality?: number, icoSizes?: number[], background?: string|null,
   *          svgClip?: {type:'ellipse'}|{type:'rect', radius:number}|null}} [opts]
   * @returns {Promise<{blob: Blob, filename_ext: string}>}
   */
  async function encode(canvas, format, opts) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new Error('Encoders.encode: first argument must be a canvas element');
    }
    const options = opts || {};
    const quality = typeof options.quality === 'number' ? options.quality : 0.92;
    const background = options.background != null ? options.background : null;

    if (!Object.prototype.hasOwnProperty.call(EXT_BY_FORMAT, format)) {
      throw new Error(
        `Encoders.encode: unknown format "${format}" (expected one of png, jpeg, webp, avif, ico, svg)`
      );
    }

    if (format === 'ico') {
      const blob = await encodeIco(canvas, options.icoSizes);
      return { blob, filename_ext: EXT_BY_FORMAT.ico };
    }

    if (format === 'svg') {
      const blob = await encodeSvg(canvas, options.svgClip);
      return { blob, filename_ext: EXT_BY_FORMAT.svg };
    }

    // Raster formats: png / jpeg / webp / avif
    const mime = MIME_BY_FORMAT[format];
    const needsBackground = background !== null && (format === 'jpeg' || format === 'avif');
    const sourceCanvas = needsBackground ? compositeOnBackground(canvas, background) : canvas;

    const blob = await canvasToBlob(sourceCanvas, mime, quality);
    return { blob, filename_ext: EXT_BY_FORMAT[format] };
  }

  global.Encoders = {
    detect,
    encode,
  };
})(window);