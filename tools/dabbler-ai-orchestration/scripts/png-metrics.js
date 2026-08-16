#!/usr/bin/env node
// Pixel measurements for the OS-capture pilot (Set 113 Session 4).
//
// Dependency-free: Node ships zlib, and a PNG is a header plus deflated
// filtered scanlines. Adding an image library to an extension package for
// a Windows-only pilot measurement would be a dependency everyone installs
// and almost nobody runs.
//
// This exists so the pilot's claims are MEASURED rather than asserted.
// "The capture shows the right window" and "no other window leaked into
// the frame" are pixel claims, and a pilot that reports them without
// looking at pixels has reported its own confidence, not a measurement.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const zlib = require("zlib");

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Decode an 8-bit non-interlaced RGB/RGBA PNG.
 *
 * Deliberately narrow. Both producers here are known -- OBS's
 * GetSourceScreenshot and Playwright's page.screenshot -- so a decoder
 * that quietly mishandled a palette or a 16-bit image would be a silent
 * wrong answer in a measurement. Anything outside the supported shape is
 * an explicit throw.
 */
function decodePng(buffer) {
  if (!buffer || buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG (bad signature)");
  }
  let offset = 8;
  let header = null;
  const idatChunks = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === "IHDR") {
      header = {
        width: buffer.readUInt32BE(dataStart),
        height: buffer.readUInt32BE(dataStart + 4),
        bitDepth: buffer[dataStart + 8],
        colorType: buffer[dataStart + 9],
        interlace: buffer[dataStart + 12],
      };
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(dataStart, dataStart + length));
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + length + 4;
  }

  if (!header) throw new Error("PNG has no IHDR");
  if (header.bitDepth !== 8) {
    throw new Error("unsupported PNG bit depth " + header.bitDepth);
  }
  if (header.interlace !== 0) {
    throw new Error("interlaced PNG is not supported");
  }
  const channels = header.colorType === 6 ? 4 : header.colorType === 2 ? 3 : 0;
  if (!channels) {
    throw new Error("unsupported PNG color type " + header.colorType);
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const { width, height } = header;
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);

  // Undo the per-scanline filters. Each line is prefixed with its filter
  // byte and may refer to the pixel to its left (a), the line above (b),
  // and the pixel above-left (c).
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const lineStart = y * stride;
    const prevStart = lineStart - stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[pos + x];
      const a = x >= channels ? out[lineStart + x - channels] : 0;
      const b = y > 0 ? out[prevStart + x] : 0;
      const c = y > 0 && x >= channels ? out[prevStart + x - channels] : 0;
      let recon;
      switch (filter) {
        case 0:
          recon = value;
          break;
        case 1:
          recon = value + a;
          break;
        case 2:
          recon = value + b;
          break;
        case 3:
          recon = value + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          recon = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error("unknown PNG filter " + filter + " on row " + y);
      }
      out[lineStart + x] = recon & 0xff;
    }
    pos += stride;
  }

  return { width, height, channels, data: out };
}

/**
 * Reduce an image to a size x size grid of average luminance.
 *
 * Downscaling is what makes the comparison meaningful across two
 * different capture paths: OBS and Playwright never agree pixel for pixel
 * (cursor, one frame of drift, encoder colour handling), but they agree
 * completely about where the sidebar and the editor are.
 */
function grayscaleGrid(image, size) {
  const grid = new Float64Array(size * size);
  const counts = new Float64Array(size * size);
  const { width, height, channels, data } = image;
  for (let y = 0; y < height; y++) {
    const gy = Math.min(size - 1, Math.floor((y * size) / height));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(size - 1, Math.floor((x * size) / width));
      const i = (y * width + x) * channels;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      grid[gy * size + gx] += lum;
      counts[gy * size + gx] += 1;
    }
  }
  for (let i = 0; i < grid.length; i++) {
    if (counts[i]) grid[i] /= counts[i];
  }
  return grid;
}

/**
 * Pearson correlation of two equal-length grids, in [-1, 1].
 *
 * A flat image (zero variance) correlates with nothing: it returns 0
 * rather than dividing by zero, because a black frame is exactly the
 * failure this is supposed to catch and it must not score 1.0.
 */
function correlate(a, b) {
  if (a.length !== b.length) throw new Error("grid size mismatch");
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}

/** Fraction of pixels within L-infinity `tolerance` of an RGB triple. */
function colorFraction(image, rgb, tolerance) {
  const { width, height, channels, data } = image;
  const total = width * height;
  let hits = 0;
  for (let i = 0; i < total; i++) {
    const p = i * channels;
    if (
      Math.abs(data[p] - rgb[0]) <= tolerance &&
      Math.abs(data[p + 1] - rgb[1]) <= tolerance &&
      Math.abs(data[p + 2] - rgb[2]) <= tolerance
    ) {
      hits++;
    }
  }
  return total ? hits / total : 0;
}

/** Compare two PNG buffers on the downscaled-luminance grid. */
function comparePngs(bufferA, bufferB, size) {
  const gridSize = size || 32;
  const a = decodePng(bufferA);
  const b = decodePng(bufferB);
  return {
    correlation: correlate(
      grayscaleGrid(a, gridSize),
      grayscaleGrid(b, gridSize)
    ),
    a: { width: a.width, height: a.height },
    b: { width: b.width, height: b.height },
  };
}

module.exports = {
  decodePng,
  grayscaleGrid,
  correlate,
  colorFraction,
  comparePngs,
};
