// Text in the 3D scene: sprites that always face the camera, drawn once on a canvas each.
import * as THREE from 'three';
import { SUPERSCRIPTS } from './nuclear.js';

// the fonts of what is drawn on a canvas: Latin letters and digits (the labels on the boxes), and Japanese as well
const FONT_FALLBACK = '"Helvetica Neue", Arial, sans-serif';
export const FONT = `Inter, ${FONT_FALLBACK}`;
const FONT_JA = `Inter, "Noto Sans JP", ${FONT_FALLBACK}`;

// Superscript characters come from different fonts (¹²³ are Latin-1, ⁰⁴⁻⁹ are not in the loaded subset),
// so on the canvas they are drawn as ordinary glyphs, smaller and raised.
const SUP_PLAIN = '0123456789+−'; // what each of SUPERSCRIPTS is drawn as
function textRuns(text) {
  const runs = [];
  for (const ch of text) {
    const k = SUPERSCRIPTS.indexOf(ch);
    const sup = k >= 0;
    const t = sup ? SUP_PLAIN[k] : ch;
    const last = runs[runs.length - 1];
    if (last && last.sup === sup) last.t += t;
    else runs.push({ t, sup });
  }
  return runs;
}

const spriteCache = new Map();
/**
 * A text that always faces the camera, `size` world units high. anchor: which end sits at its position; bg (with
 * border): a pill behind the text; stroke: an outline round the letters.
 */
export function makeTextSprite(text, { color = '#222', size = 1, weight = 500, anchor = 'center', bg = null, border = null, stroke = null } = {}) {
  const cacheKey = [text, color, weight, bg, border, stroke].join('|');
  let entry = spriteCache.get(cacheKey);
  if (!entry) {
    const px = 64;
    const fontOf = (sup) => `${weight} ${sup ? Math.round(px * 0.64) : px}px ${FONT_JA}`;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const runs = textRuns(text);
    for (const r of runs) {
      ctx.font = fontOf(r.sup);
      r.w = ctx.measureText(r.t).width;
    }
    const textW = runs.reduce((a, r) => a + r.w, 0);
    const pad = bg ? 26 : stroke ? 12 : 6;
    const w = Math.ceil(textW) + pad * 2;
    const h = px + (bg ? 30 : 16);
    c.width = w;
    c.height = h;
    if (bg) {
      ctx.fillStyle = bg;
      roundRect(ctx, 3, 3, w - 6, h - 6, (h - 6) / 2);
      ctx.fill();
      if (border) {
        ctx.lineWidth = 5;
        ctx.strokeStyle = border;
        ctx.stroke();
      }
    }
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const drawRuns = (draw) => {
      let x = (w - textW) / 2;
      for (const r of runs) {
        ctx.font = fontOf(r.sup);
        draw(r.t, x, h / 2 + 3 - (r.sup ? px * 0.27 : 0));
        x += r.w;
      }
    };
    if (stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = 10;
      ctx.strokeStyle = stroke;
      drawRuns((t, x, y) => ctx.strokeText(t, x, y));
    }
    drawRuns((t, x, y) => ctx.fillText(t, x, y));
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    entry = { tex, aspect: w / h };
    spriteCache.set(cacheKey, entry);
  }
  const mat = new THREE.SpriteMaterial({ map: entry.tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size * entry.aspect, size, 1);
  if (anchor === 'right') sprite.center.set(1, 0.5);
  if (anchor === 'left') sprite.center.set(0, 0.5);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
