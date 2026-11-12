// Nuclear-physics constants, decay-mode bookkeeping, metrics and formatting helpers.

import { ELEMENTS } from './data.js';

// [symbol, English name, Japanese name], index = Z
export { ELEMENTS };

export const SYMBOL_TO_Z = new Map(ELEMENTS.map((e, z) => [e[0].toLowerCase(), z]));
export const MAGIC = [2, 8, 20, 28, 50, 82, 126];
export const isMagic = (x) => MAGIC.includes(x);

const SUP_MAP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻' };
export const sup = (s) => String(s).replace(/[0-9+-]/g, (c) => SUP_MAP[c]);
export const nucText = (nuc) => sup(nuc.a) + nuc.s;
export const nucHtml = (nuc) => `<span class="nuc"><sup>${nuc.a}</sup>${nuc.s}</span>`;
export const key = (z, n) => z * 1000 + n;

// ---- decay categories (color legend) ----
export const CATEGORIES = {
  st: { name: '安定', light: '#232326', dark: '#e9e6dc' },
  bm: { name: 'β⁻', light: '#78bde3', dark: '#5aa8d8', arc: '#1f86d6' },
  bp: { name: 'β⁺ / EC', light: '#f0919f', dark: '#e2768a', arc: '#e3405f' },
  a: { name: 'α', light: '#f4dc4d', dark: '#e8cc2e', arc: '#d9a400' },
  sf: { name: '自発核分裂', light: '#74c96f', dark: '#5cba58', arc: '#25a644' },
  p: { name: '陽子放出', light: '#f5a35a', dark: '#ef8f3e', arc: '#f07a12' },
  n: { name: '中性子放出', light: '#a796ea', dark: '#9581e3', arc: '#7a5ee3' },
  cl: { name: 'クラスター等', light: '#58c4b4', dark: '#3fb3a2', arc: '#109e8c' },
  un: { name: '未観測（推定値）', light: '#dedcd5', dark: '#3d4149' },
};

const MODE_SHIFT = {
  'B-': [1, -1], 'B+': [-1, 1], EC: [-1, 1], 'e+': [-1, 1], 'EC+B+': [-1, 1],
  A: [-2, -2], p: [-1, 0], '2p': [-2, 0], '3p': [-3, 0], n: [0, -1], '2n': [0, -2], '3n': [0, -3], d: [-1, -1],
  'B-n': [1, -2], 'B-2n': [1, -3], 'B-3n': [1, -4], 'B-4n': [1, -5], 'B-p': [0, -1], 'B-d': [0, -2], 'B-t': [0, -3], 'B-A': [-1, -3],
  'B+p': [-2, 1], 'B+2p': [-3, 1], 'B+3p': [-4, 1], 'B+A': [-3, -1], 'B+pA': [-4, -1],
  '2B-': [2, -2], '2B+': [-2, 2], IT: [0, 0],
};
const FISSION = new Set(['SF', 'B-SF', 'B+SF', 'ECSF']);
const CLUSTER_RE = /^(\d+)([A-Z][a-z]?)(\+.*)?$/;

export function modeCategory(m) {
  if (m === 'A') return 'a';
  if (FISSION.has(m)) return 'sf';
  if (m.startsWith('B-') || m === '2B-') return 'bm';
  if (m.startsWith('B+') || m === 'EC' || m === 'e+' || m === '2B+' || m === 'EC+B+') return 'bp';
  if (/^\d?p$/.test(m)) return 'p';
  if (/^\d?n$/.test(m)) return 'n';
  return 'cl';
}

export function modeLabel(m) {
  const cl = m.match(CLUSTER_RE);
  if (cl) return sup(cl[1]) + cl[2] + (cl[3] ? '+…' : '');
  if (m === 'e+') return 'β⁺';
  return m.replace(/^2B-/, '2β⁻').replace(/^2B\+/, '2β⁺').replace(/^B-/, 'β⁻').replace(/^B\+/, 'β⁺').replace(/A$/, 'α');
}

const MODE_DESC = {
  'B-': 'β⁻崩壊', 'B+': 'β⁺崩壊（電子捕獲を含む）', EC: '電子捕獲', 'e+': '陽電子放出', 'EC+B+': '電子捕獲＋β⁺',
  A: 'α崩壊', SF: '自発核分裂', 'B-SF': 'β⁻遅発核分裂', 'B+SF': 'β⁺遅発核分裂',
  p: '陽子放出', '2p': '2陽子放出', '3p': '3陽子放出', n: '中性子放出', '2n': '2中性子放出', '3n': '3中性子放出', d: '重陽子放出',
  'B-n': 'β遅発中性子放出', 'B-2n': 'β遅発2中性子放出', 'B-3n': 'β遅発3中性子放出', 'B-4n': 'β遅発4中性子放出',
  'B-p': 'β⁻遅発陽子放出', 'B-d': 'β⁻遅発重陽子放出', 'B-t': 'β⁻遅発三重陽子放出', 'B-A': 'β⁻遅発α放出',
  'B+p': 'β遅発陽子放出', 'B+2p': 'β遅発2陽子放出', 'B+3p': 'β遅発3陽子放出', 'B+A': 'β遅発α放出', 'B+pA': 'β遅発陽子・α放出',
  '2B-': '二重β⁻崩壊', '2B+': '二重β⁺崩壊', IT: '核異性体転移',
};
export const modeDesc = (m) => MODE_DESC[m] || (CLUSTER_RE.test(m) ? 'クラスター崩壊' : m);

/** Shift (dZ, dN) for a decay mode, or null for fission / unknown modes. */
export function modeShift(m) {
  if (MODE_SHIFT[m]) return MODE_SHIFT[m];
  const cl = m.match(CLUSTER_RE);
  if (cl) {
    const zc = SYMBOL_TO_Z.get(cl[2].toLowerCase());
    if (zc === undefined) return null;
    const ac = +cl[1];
    return [-zc, -(ac - zc)];
  }
  return null;
}
export const isFission = (m) => FISSION.has(m);

/** Primary decay category of a nuclide (used for the default coloring). */
export function primaryCategory(nuc) {
  if (!nuc.y) return 'un';
  if (nuc.st) return 'st';
  const modes = nuc.d || [];
  if (!modes.length) return 'un';
  let best = modes[0];
  for (const m of modes) if (m[2] !== null && (best[2] === null || m[2] > best[2])) best = m;
  return modeCategory(best[0]);
}

// ---- what the data file leaves out because it follows from Z, N and the ground-state masses ----
// AME2020 mass excesses (keV) of the neutron, 1H and 4He
const ME_N = 8071.3181, ME_H = 7288.971064, ME_HE4 = 2424.91587;
// separation energies and Q values: Σ sign × Δ(Z + dz, N + dn) + constant
const FROM_MASSES = {
  sn: [[[1, 0, -1], [-1, 0, 0]], ME_N],
  sp: [[[1, -1, 0], [-1, 0, 0]], ME_H],
  s2n: [[[1, 0, -2], [-1, 0, 0]], 2 * ME_N],
  s2p: [[[1, -2, 0], [-1, 0, 0]], 2 * ME_H],
  qa: [[[1, 0, 0], [-1, -2, -2]], -ME_HE4],
  qb: [[[1, 0, 0], [-1, 1, -1]], 0],
  qec: [[[1, 0, 0], [-1, -1, 1]], 0],
};
/**
 * Fills in A, the element symbol, B/A, and the separation energies and Q values (keV, from the mass excesses of
 * the nuclides in the list; used for heights and to find the unbound nuclei). Run on the NUBASE list as loaded.
 */
export function deriveFromMasses(nuclides) {
  const at = new Map(nuclides.map((nuc) => [`${nuc.z},${nuc.n}`, nuc]));
  for (const nuc of nuclides) {
    nuc.a = nuc.z + nuc.n;
    nuc.s = ELEMENTS[nuc.z][0];
    if (nuc.me !== undefined && nuc.a > 1) nuc.ba = Math.round(((nuc.z * ME_H + nuc.n * ME_N - nuc.me) / nuc.a) * 1000) / 1000;
    for (const [key, [terms, c]] of Object.entries(FROM_MASSES)) {
      let total = c, ok = true;
      for (const [sign, dz, dn] of terms) {
        const r = at.get(`${nuc.z + dz},${nuc.n + dn}`);
        if (!r || r.me === undefined) {
          ok = false;
          break;
        }
        total += sign * r.me;
      }
      if (ok) nuc[key] = Math.round(total * 100) / 100;
    }
  }
}

// ---- metrics used for heights / continuous colors ----
const log10 = Math.log10;
export const BA_FE56 = 8790.356; // keV, NUBASE2020 ground-state B/A of 56Fe (the reference "zero" height)
// B/A in keV; the free neutron and 1H have no binding at all
const baOf = (n) => (n.ba !== undefined ? n.ba : n.a === 1 ? 0 : undefined);
export const feDeficit = (n) => (baOf(n) !== undefined ? (BA_FE56 - baOf(n)) / 1000 : null);
const ME_MIN = -91652.8; // keV, the lowest mass excess (118Sn)
const MEA_FE56 = -60607.16 / 56; // keV per nucleon; 56Fe has the lowest mass per nucleon of all nuclides
const cap = (h, max) => Math.min(max, Math.max(0.15, h));

// base (linear metrics only): height per unit of the quantity, and the range of the base-plane slider
export const METRICS = {
  // candidates for the height of the RIBF LEGO chart ("BINDING ENERGY"), all built from the mass table
  bfe: {
    label: 'B/A の ⁵⁶Fe との差（核子1個あたり）', short: 'B/A（⁵⁶Fe 基準）',
    note: 'B/A(⁵⁶Fe) − B/A。高いほど核子1個あたりの結合が弱い',
    value: feDeficit,
    height: (n) => (feDeficit(n) === null ? 0.2 : cap(feDeficit(n) * 3.2, 36)),
    base: { k: 3.2, max: 3, step: 0.05 },
    range: [0, 2.5], unit: 'MeV',
  },
  bfeA: {
    label: 'B/A の ⁵⁶Fe との差 × A（核全体）', short: 'ΔB（⁵⁶Fe 基準・核全体）',
    note: 'A × (B/A(⁵⁶Fe) − B/A)。⁵⁶Fe と同じ強さで結合した場合より、核全体でどれだけ結合が弱いか',
    value: (n) => (feDeficit(n) === null ? null : feDeficit(n) * n.a),
    height: (n) => (feDeficit(n) === null ? 0.2 : cap(feDeficit(n) * n.a * 0.065, 40)),
    base: { k: 0.065, max: 300, step: 5 },
    range: [0, 300], unit: 'MeV',
  },
  meA: {
    label: '核子1個あたりの質量（⁵⁶Fe 基準）', short: '核子あたりの質量',
    note: '核子1個あたりの質量の ⁵⁶Fe との差（理研のレゴ核図表と同じ量）。単独の中性子・陽子がいちばん高く、強く結合した ⁵⁶Fe が谷底',
    value: (n) => (n.me !== undefined ? (n.me / n.a - MEA_FE56) / 1000 : null),
    height: (n) => (n.me !== undefined ? cap(((n.me / n.a - MEA_FE56) / 1000) * 3.2, 36) : 0.2),
    base: { k: 3.2, max: 3, step: 0.05 },
    range: [0, 2.5], unit: 'MeV',
  },
  me: {
    label: '質量超過 Δ（核全体、最小を 0）', short: '質量超過 Δ',
    note: 'Δ − Δ(¹¹⁸Sn)。¹¹⁸Sn 付近が最も低く、重い核ほど高くなる',
    value: (n) => (n.me !== undefined ? (n.me - ME_MIN) / 1000 : null),
    height: (n) => (n.me !== undefined ? cap(((n.me - ME_MIN) / 1000) * 0.11, 40) : 0.2),
    base: { k: 0.11, max: 150, step: 2 },
    range: [0, 250], unit: 'MeV',
  },
  b: {
    label: '結合エネルギー B（核全体）', short: 'B',
    note: '核全体の結合エネルギー。核子数にほぼ比例して増える',
    value: (n) => (baOf(n) !== undefined ? (baOf(n) * n.a) / 1000 : null),
    height: (n) => (baOf(n) !== undefined ? cap(((baOf(n) * n.a) / 1000) * 0.0155, 40) : 0.2),
    base: { k: 0.0155, max: 1500, step: 10 },
    range: [0, 2000], unit: 'MeV',
  },
  hl: {
    label: '半減期 log₁₀(T½ / s)', short: '半減期',
    value: (n) => (n.st ? 22 : n.t ? log10(n.t) : n.pu ? -22 : null),
    height: (n) => {
      if (n.st) return 13;
      if (n.pu) return 0.2;
      if (!n.t) return 0.3;
      const L = log10(n.t);
      return L < -9 ? 0.25 + Math.max(0, (L + 24) / 15) * 0.4 : Math.min(12, 0.65 + ((L + 9) / 31) * 11.35);
    },
    range: [-12, 22], unit: '', ticks: ['1 ps', '1 s', '1 万年', '安定'], tickVals: [-12, 0, 11.5, 22],
  },
  ba: {
    label: '結合エネルギー B/A（核子1個あたり）', short: 'B/A',
    note: '結合エネルギーを核子数で割った値。⁵⁶Fe・⁶²Ni 付近で最大（約 8.8 MeV）',
    value: (n) => (baOf(n) !== undefined ? baOf(n) / 1000 : null),
    height: (n) => (baOf(n) !== undefined ? Math.max(0.15, (baOf(n) / 1000) * 1.5) : 0.15),
    base: { k: 1.5, max: 8.5, step: 0.1 },
    range: [5, 8.8], unit: 'MeV',
  },
  s2n: {
    label: '2中性子分離エネルギー S₂ₙ', short: 'S₂ₙ',
    value: (n) => (n.s2n !== undefined ? n.s2n / 1000 : null),
    height: (n) => (n.s2n !== undefined ? Math.min(14, Math.max(0.2, (n.s2n / 1000) * 0.45)) : 0.2),
    base: { k: 0.45, max: 20, step: 0.5 },
    range: [0, 30], unit: 'MeV',
  },
  sn: {
    label: '中性子分離エネルギー Sₙ', short: 'Sₙ',
    value: (n) => (n.sn !== undefined ? n.sn / 1000 : null),
    height: (n) => (n.sn !== undefined ? Math.min(14, Math.max(0.2, (n.sn / 1000) * 0.8)) : 0.2),
    base: { k: 0.8, max: 12, step: 0.2 },
    range: [0, 16], unit: 'MeV',
  },
  qa: {
    label: 'α崩壊 Q 値 Qα', short: 'Qα',
    value: (n) => (n.qa !== undefined ? n.qa / 1000 : null),
    height: (n) => (n.qa !== undefined ? Math.min(14, Math.max(0.2, (n.qa / 1000) * 1.2)) : 0.2),
    base: { k: 1.2, max: 10, step: 0.2 },
    range: [0, 12], unit: 'MeV',
  },
  fy: {
    label: '核分裂収率（²³⁵U 熱中性子・累積）', short: '核分裂収率',
    value: (n) => (n.fyc ? log10(n.fyc) : null),
    height: (n) => (n.fyc ? Math.max(0.2, (log10(n.fyc) + 9) * 1.6) : 0.2),
    range: [-8, -1.1], unit: '', ticks: ['10⁻⁶ %', '10⁻⁴ %', '0.01 %', '1 %'], tickVals: [-8, -6, -4, -2],
  },
  year: {
    label: '核種の発見年', short: '発見年',
    value: (n) => n.y ?? null,
    height: (n) => (n.y ? Math.min(12.5, Math.max(0.4, (n.y - 1890) / 11)) : 0.25),
    range: [1896, 2025], unit: '年',
  },
  flat: { label: 'なし（2D）', short: '2D', value: () => null, height: () => 0.3, range: [0, 1] },
};

// viridis, sampled
const VIRIDIS = ['#440154', '#482878', '#3e4a89', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const VIR_RGB = VIRIDIS.map(hexToRgb);
export function viridis(t) {
  t = Math.min(1, Math.max(0, t)) * (VIR_RGB.length - 1);
  const i = Math.min(VIR_RGB.length - 2, Math.floor(t));
  const f = t - i;
  return VIR_RGB[i].map((c, k) => c + (VIR_RGB[i + 1][k] - c) * f);
}
export const VIRIDIS_CSS = `linear-gradient(90deg, ${VIRIDIS.join(',')})`;
export { hexToRgb };

// half-life colors in LEGO-brick tones: short-lived red → orange → yellow → light blue → long-lived blue, stable deep blue
const HL_STOPS = [
  [-9, '#a3170f'], [-6, '#d0281b'], [-3, '#ea5a22'], [0, '#f39424'], [3, '#f7c52e'],
  [5, '#efe08f'], [7, '#cfe1ef'], [9.5, '#8fbfe7'], [12.5, '#4b8fd8'], [16, '#2565c0'],
];
export const HL_STABLE = '#0b45a0';
export const HL_RANGE = [-9, 16];
const HL_RGB = HL_STOPS.map(([v, c]) => [v, hexToRgb(c)]);
export function halfLifeColor(nuc) {
  if (nuc.st) return hexToRgb(HL_STABLE);
  const L = Math.min(HL_RANGE[1], Math.max(HL_RANGE[0], nuc.t ? log10(nuc.t) : HL_RANGE[0]));
  let k = 0;
  while (k < HL_RGB.length - 2 && L > HL_RGB[k + 1][0]) k++;
  const [v0, c0] = HL_RGB[k], [v1, c1] = HL_RGB[k + 1];
  const f = Math.min(1, Math.max(0, (L - v0) / (v1 - v0)));
  return c0.map((c, j) => c + (c1[j] - c) * f);
}
export const HL_CSS = `linear-gradient(90deg, ${HL_STOPS.map(([v, c]) => `${c} ${(((v - HL_RANGE[0]) / (HL_RANGE[1] - HL_RANGE[0])) * 100).toFixed(1)}%`).join(', ')})`;
// The RIKEN Nishina Center LEGO chart of nuclides (exhibit legend): black = stable, red = unstable and discovered,
// yellow = unstable and not yet discovered, green = discovered at RIKEN, blue = superheavy nucleus discovered at RIKEN
export const LEGO_PALETTE = [
  { key: 'st', name: '安定核', color: '#1b1b1d', dark: '#e9e6dc' },
  { key: 'found', name: '不安定核（発見済み）', color: '#c91a09' },
  { key: 'unfound', name: '不安定核（未発見）', color: '#f5c400' },
  { key: 'riken', name: '理研で発見した原子核', color: '#237841' },
  { key: 'rikenSH', name: '理研で発見した超重原子核', color: '#0055bf' },
];
const LEGO_BY_KEY = Object.fromEntries(LEGO_PALETTE.map((c) => [c.key, c]));
// A RIKEN class switched off in the 表示 section (keys in `off`) gives its nuclei back to the class they belong to
// besides: unstable and discovered (red), so they stay on the chart while that class is shown.
export function legoKey(nuc, off) {
  const rk = nuc.rk ? (nuc.z >= 104 ? 'rikenSH' : 'riken') : null;
  if (rk && !off?.has(rk)) return rk;
  return nuc.st ? 'st' : nuc.y ? 'found' : 'unfound';
}
export function legoColor(nuc, theme = 'light', off = null) {
  const c = LEGO_BY_KEY[legoKey(nuc, off)];
  return hexToRgb(theme === 'dark' && c.dark ? c.dark : c.color);
}

export const cssRgb = (rgb) => `rgb(${rgb.map((c) => Math.round(c * 255)).join(',')})`;
export const inkFor = (rgb) => (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 0.5 ? '#111' : '#fff');

// ---- formatting ----
const fmtNum = (v, digits) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export function fmtKeV(keV, unc, est) {
  if (keV === undefined || keV === null) return '—';
  const digits = Math.abs(keV) < 100 ? 3 : 1;
  return `${fmtNum(keV, digits)}${unc !== undefined ? ` ± ${unc}` : ''} keV${est ? ' #' : ''}`;
}
export function fmtSeconds(t) {
  if (!t) return '';
  const e = Math.floor(Math.log10(t));
  const m = t / 10 ** e;
  return `${m.toFixed(2)} × 10${sup(e)} s`;
}
export function fmtHalfLife(nuc) {
  if (nuc.st) return '安定';
  if (nuc.pu) return '粒子非束縛';
  if (nuc.ts) return nuc.ts + (nuc.te ? ' #' : '');
  return '不明';
}
export const fmtJpi = (j) => (j ? j.replace(/\*/g, '').replace(/\s+/g, ' ') : '—');
export function fmtBranch(m) {
  const [, op, val] = m;
  if (val === null) return op === '?' ? '?' : '—';
  const pre = op === '=' ? '' : op === '~' ? '≈ ' : op + ' ';
  const v = val >= 0.1 ? +val.toPrecision(4) : val.toExponential(1);
  return `${pre}${v} %`;
}
