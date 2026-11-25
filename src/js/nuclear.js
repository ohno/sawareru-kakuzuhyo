// Nuclear physics for the chart: decay modes, what follows from the masses, the quantities behind the heights and
// colors, the color scales, and how values are written.
import { ELEMENTS } from './data.js';
import { tr, EN } from './i18n.js';

export const SYMBOL_TO_Z = new Map(ELEMENTS.map((e, z) => [e[0].toLowerCase(), z]));
export const MAGIC = [2, 8, 20, 28, 50, 82, 126];
export const isMagic = (x) => MAGIC.includes(x);
/** one number per nuclide (Z, N), for maps */
export const nuclideKey = (z, n) => z * 1000 + n;

/** the superscript characters for 0–9, + and - (in this order) */
export const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻';
export const sup = (s) => String(s).replace(/[0-9+-]/g, (c) => SUPERSCRIPTS['0123456789+-'.indexOf(c)]);
export const nucText = (nuc) => sup(nuc.a) + nuc.s;
export const nucHtml = (nuc) => `<span class="nuc"><sup>${nuc.a}</sup>${nuc.s}</span>`;
// an isomer of nuc (an entry of its `iso`, flagged m, n, p, …): ²³⁴ᵐPa
const SUP_FLAG = { m: 'ᵐ', n: 'ⁿ', p: 'ᵖ' };
export const isoText = (nuc, iso) => sup(nuc.a) + (SUP_FLAG[iso.f] ?? iso.f) + nuc.s;
export const isoHtml = (nuc, iso) => `<span class="nuc"><sup>${nuc.a}${iso.f}</sup>${nuc.s}</span>`;

// ---------- decay modes ----------
/** the kinds of decay the legend tells apart: name, box color in each theme, and the color of the decay arrows */
export const CATEGORIES = {
  st: { name: tr('安定', 'Stable'), light: '#232326', dark: '#e9e6dc' },
  bm: { name: 'β⁻', light: '#78bde3', dark: '#5aa8d8', arc: '#1f86d6' },
  bp: { name: 'β⁺ / EC', light: '#f0919f', dark: '#e2768a', arc: '#e3405f' },
  a: { name: 'α', light: '#f4dc4d', dark: '#e8cc2e', arc: '#d9a400' },
  sf: { name: tr('自発核分裂', 'Spontaneous fission'), light: '#74c96f', dark: '#5cba58', arc: '#25a644' },
  p: { name: tr('陽子放出', 'Proton emission'), light: '#f5a35a', dark: '#ef8f3e', arc: '#f07a12' },
  n: { name: tr('中性子放出', 'Neutron emission'), light: '#a796ea', dark: '#9581e3', arc: '#7a5ee3' },
  cl: { name: tr('クラスター等', 'Cluster and other'), light: '#58c4b4', dark: '#3fb3a2', arc: '#109e8c' },
  un: { name: tr('未観測（推定値）', 'Unobserved (estimate)'), light: '#dedcd5', dark: '#3d4149' },
};
export const categoryHex = (cat, theme) => CATEGORIES[cat][theme] ?? CATEGORIES[cat].light;
export const arcColor = (cat) => CATEGORIES[cat].arc || '#888';

// (dZ, dN) of each decay mode as NUBASE writes it
const MODE_SHIFT = {
  'B-': [1, -1], 'B+': [-1, 1], EC: [-1, 1], 'e+': [-1, 1], 'EC+B+': [-1, 1],
  A: [-2, -2], p: [-1, 0], '2p': [-2, 0], '3p': [-3, 0], n: [0, -1], '2n': [0, -2], '3n': [0, -3], d: [-1, -1],
  'B-n': [1, -2], 'B-2n': [1, -3], 'B-3n': [1, -4], 'B-4n': [1, -5], 'B-p': [0, -1], 'B-d': [0, -2], 'B-t': [0, -3], 'B-A': [-1, -3],
  'B+p': [-2, 1], 'B+2p': [-3, 1], 'B+3p': [-4, 1], 'B+A': [-3, -1], 'B+pA': [-4, -1],
  '2B-': [2, -2], '2B+': [-2, 2], IT: [0, 0],
};
const FISSION = new Set(['SF', 'B-SF', 'B+SF', 'ECSF']);
const CLUSTER_RE = /^(\d+)([A-Z][a-z]?)(\+.*)?$/; // the emission of a light nucleus, e.g. 14C

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

const MODE_DESC = EN ? {
  'B-': 'β⁻ decay', 'B+': 'β⁺ decay (including electron capture)', EC: 'Electron capture', 'e+': 'Positron emission', 'EC+B+': 'Electron capture + β⁺',
  A: 'α decay', SF: 'Spontaneous fission', 'B-SF': 'β⁻-delayed fission', 'B+SF': 'β⁺-delayed fission',
  p: 'Proton emission', '2p': 'Two-proton emission', '3p': 'Three-proton emission', n: 'Neutron emission', '2n': 'Two-neutron emission', '3n': 'Three-neutron emission', d: 'Deuteron emission',
  'B-n': 'β-delayed neutron emission', 'B-2n': 'β-delayed two-neutron emission', 'B-3n': 'β-delayed three-neutron emission', 'B-4n': 'β-delayed four-neutron emission',
  'B-p': 'β⁻-delayed proton emission', 'B-d': 'β⁻-delayed deuteron emission', 'B-t': 'β⁻-delayed triton emission', 'B-A': 'β⁻-delayed α emission',
  'B+p': 'β-delayed proton emission', 'B+2p': 'β-delayed two-proton emission', 'B+3p': 'β-delayed three-proton emission', 'B+A': 'β-delayed α emission', 'B+pA': 'β-delayed proton and α emission',
  '2B-': 'Double β⁻ decay', '2B+': 'Double β⁺ decay', IT: 'Isomeric transition',
} : {
  'B-': 'β⁻崩壊', 'B+': 'β⁺崩壊（電子捕獲を含む）', EC: '電子捕獲', 'e+': '陽電子放出', 'EC+B+': '電子捕獲＋β⁺',
  A: 'α崩壊', SF: '自発核分裂', 'B-SF': 'β⁻遅発核分裂', 'B+SF': 'β⁺遅発核分裂',
  p: '陽子放出', '2p': '2陽子放出', '3p': '3陽子放出', n: '中性子放出', '2n': '2中性子放出', '3n': '3中性子放出', d: '重陽子放出',
  'B-n': 'β遅発中性子放出', 'B-2n': 'β遅発2中性子放出', 'B-3n': 'β遅発3中性子放出', 'B-4n': 'β遅発4中性子放出',
  'B-p': 'β⁻遅発陽子放出', 'B-d': 'β⁻遅発重陽子放出', 'B-t': 'β⁻遅発三重陽子放出', 'B-A': 'β⁻遅発α放出',
  'B+p': 'β遅発陽子放出', 'B+2p': 'β遅発2陽子放出', 'B+3p': 'β遅発3陽子放出', 'B+A': 'β遅発α放出', 'B+pA': 'β遅発陽子・α放出',
  '2B-': '二重β⁻崩壊', '2B+': '二重β⁺崩壊', IT: '核異性体転移',
};
export const modeDesc = (m) => MODE_DESC[m] || (CLUSTER_RE.test(m) ? tr('クラスター崩壊', 'Cluster decay') : m);

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

// ---------- what the data file leaves out because it follows from Z, N and the ground-state masses ----------
// AME2020 mass excesses (keV) of the neutron, ¹H and ⁴He
const ME_N = 8071.3181, ME_H = 7288.971064, ME_HE4 = 2424.91587;
/** binding energy per nucleon (keV) of a nuclide with mass excess `me` (keV) */
export const bindingPerNucleon = (z, n, me) => (z * ME_H + n * ME_N - me) / (z + n);
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
  const at = new Map(nuclides.map((nuc) => [nuclideKey(nuc.z, nuc.n), nuc]));
  for (const nuc of nuclides) {
    nuc.a = nuc.z + nuc.n;
    nuc.s = ELEMENTS[nuc.z][0];
    if (nuc.me !== undefined && nuc.a > 1) nuc.ba = Math.round(bindingPerNucleon(nuc.z, nuc.n, nuc.me) * 1000) / 1000;
    for (const [quantity, [terms, c]] of Object.entries(FROM_MASSES)) {
      let total = c, ok = true;
      for (const [sign, dz, dn] of terms) {
        const r = at.get(nuclideKey(nuc.z + dz, nuc.n + dn));
        if (!r || r.me === undefined) {
          ok = false;
          break;
        }
        total += sign * r.me;
      }
      if (ok) nuc[quantity] = Math.round(total * 100) / 100;
    }
  }
}

// ---------- the quantities behind the heights and the continuous colors ----------
const log10 = Math.log10;
const BA_FE56 = 8790.356; // keV, NUBASE2020 ground-state B/A of ⁵⁶Fe (the reference "zero" height)
// B/A in keV; the free neutron and ¹H have no binding at all
const baOf = (n) => (n.ba !== undefined ? n.ba : n.a === 1 ? 0 : undefined);
export const feDeficit = (n) => (baOf(n) !== undefined ? (BA_FE56 - baOf(n)) / 1000 : null);
const ME_MIN = -91652.8; // keV, the lowest mass excess (¹¹⁸Sn)
const MEA_FE56 = -60607.16 / 56; // keV per nucleon; ⁵⁶Fe has the lowest mass per nucleon of all nuclides

/**
 * A quantity drawn linearly: a column `k` high per unit, kept between `min` and `cap`, and `missing` high where the
 * value is unknown. Only such quantities have a base plane (the slider that sinks every column by the same amount
 * of the quantity): `slider` is its [largest value, step].
 */
const linear = (value, k, slider, { min = 0.15, cap = Infinity, missing = 0.2 } = {}) => ({
  value,
  height(n) {
    const v = value(n);
    return v === null ? missing : Math.min(cap, Math.max(min, v * k));
  },
  base: { k, max: slider[0], step: slider[1] },
});

/**
 * Per quantity: label (and a note for the caption under the height list), value(nuclide) in `unit` or null,
 * height(nuclide) in world units, and the range of the color scale.
 */
export const METRICS = {
  // candidates for the height of the RIBF LEGO chart ("BINDING ENERGY"), all built from the mass table
  bfe: {
    label: tr('B/A の ⁵⁶Fe との差（核子1個あたり）', 'B/A difference from ⁵⁶Fe (per nucleon)'),
    short: tr('B/A（⁵⁶Fe 基準）', 'B/A (relative to ⁵⁶Fe)'),
    note: tr('B/A(⁵⁶Fe) − B/A。高いほど核子1個あたりの結合が弱い', 'B/A(⁵⁶Fe) − B/A. The higher, the more weakly each nucleon is bound'),
    ...linear(feDeficit, 3.2, [3, 0.05], { cap: 36 }),
    range: [0, 2.5], unit: 'MeV',
  },
  bfeA: {
    label: tr('B/A の ⁵⁶Fe との差 × A（核全体）', 'B/A difference from ⁵⁶Fe × A (whole nucleus)'),
    short: tr('ΔB（⁵⁶Fe 基準・核全体）', 'ΔB (relative to ⁵⁶Fe, whole nucleus)'),
    note: tr('A × (B/A(⁵⁶Fe) − B/A)。⁵⁶Fe と同じ強さで結合した場合より、核全体でどれだけ結合が弱いか',
      'A × (B/A(⁵⁶Fe) − B/A). How much more weakly the whole nucleus is bound than if it were bound as strongly as ⁵⁶Fe'),
    ...linear((n) => (feDeficit(n) === null ? null : feDeficit(n) * n.a), 0.065, [300, 5], { cap: 40 }),
    range: [0, 300], unit: 'MeV',
  },
  meA: {
    label: tr('核子1個あたりの質量（⁵⁶Fe 基準）', 'Mass per nucleon (relative to ⁵⁶Fe)'),
    short: tr('核子あたりの質量', 'Mass per nucleon'),
    note: tr('核子1個あたりの質量の ⁵⁶Fe との差（理研のレゴ核図表と同じ量）。単独の中性子・陽子がいちばん高く、強く結合した ⁵⁶Fe が谷底',
      'Mass per nucleon minus that of ⁵⁶Fe (the same quantity as RIKEN’s LEGO chart of nuclides). A lone neutron or proton is highest; tightly bound ⁵⁶Fe is the valley floor'),
    ...linear((n) => (n.me !== undefined ? (n.me / n.a - MEA_FE56) / 1000 : null), 3.2, [3, 0.05], { cap: 36 }),
    range: [0, 2.5], unit: 'MeV',
  },
  me: {
    label: tr('質量超過 Δ（核全体、最小を 0）', 'Mass excess Δ (whole nucleus, lowest = 0)'),
    short: tr('質量超過 Δ', 'Mass excess Δ'),
    note: tr('Δ − Δ(¹¹⁸Sn)。¹¹⁸Sn 付近が最も低く、重い核ほど高くなる', 'Δ − Δ(¹¹⁸Sn). Lowest around ¹¹⁸Sn, and higher the heavier the nucleus'),
    ...linear((n) => (n.me !== undefined ? (n.me - ME_MIN) / 1000 : null), 0.11, [150, 2], { cap: 40 }),
    range: [0, 250], unit: 'MeV',
  },
  b: {
    label: tr('結合エネルギー B（核全体）', 'Binding energy B (whole nucleus)'), short: 'B',
    note: tr('核全体の結合エネルギー。核子数にほぼ比例して増える', 'Binding energy of the whole nucleus. It grows almost in proportion to the number of nucleons'),
    ...linear((n) => (baOf(n) !== undefined ? (baOf(n) * n.a) / 1000 : null), 0.0155, [1500, 10], { cap: 40 }),
    range: [0, 2000], unit: 'MeV',
  },
  hl: {
    label: tr('半減期 log₁₀(T½ / s)', 'Half-life log₁₀(T½ / s)'), short: tr('半減期', 'Half-life'),
    value: (n) => (n.st ? 22 : n.t ? log10(n.t) : n.pu ? -22 : null),
    height: (n) => {
      if (n.st) return 13;
      if (n.pu) return 0.2;
      if (!n.t) return 0.3;
      const L = log10(n.t);
      return L < -9 ? 0.25 + Math.max(0, (L + 24) / 15) * 0.4 : Math.min(12, 0.65 + ((L + 9) / 31) * 11.35);
    },
    range: [-12, 22], unit: '', ticks: ['1 ps', '1 s', tr('1 万年', '10,000 years'), tr('安定', 'stable')], tickVals: [-12, 0, 11.5, 22],
  },
  ba: {
    label: tr('結合エネルギー B/A（核子1個あたり）', 'Binding energy B/A (per nucleon)'), short: 'B/A',
    note: tr('結合エネルギーを核子数で割った値。⁵⁶Fe・⁶²Ni 付近で最大（約 8.8 MeV）',
      'Binding energy divided by the number of nucleons. Largest around ⁵⁶Fe and ⁶²Ni (about 8.8 MeV)'),
    ...linear((n) => (baOf(n) !== undefined ? baOf(n) / 1000 : null), 1.5, [8.5, 0.1], { missing: 0.15 }),
    range: [5, 8.8], unit: 'MeV',
  },
  s2n: {
    label: tr('2中性子分離エネルギー S₂ₙ', 'Two-neutron separation energy S₂ₙ'), short: 'S₂ₙ',
    ...linear((n) => (n.s2n !== undefined ? n.s2n / 1000 : null), 0.45, [20, 0.5], { min: 0.2, cap: 14 }),
    range: [0, 30], unit: 'MeV',
  },
  sn: {
    label: tr('中性子分離エネルギー Sₙ', 'Neutron separation energy Sₙ'), short: 'Sₙ',
    ...linear((n) => (n.sn !== undefined ? n.sn / 1000 : null), 0.8, [12, 0.2], { min: 0.2, cap: 14 }),
    range: [0, 16], unit: 'MeV',
  },
  qa: {
    label: tr('α崩壊 Q 値 Qα', 'α-decay Q value Qα'), short: 'Qα',
    ...linear((n) => (n.qa !== undefined ? n.qa / 1000 : null), 1.2, [10, 0.2], { min: 0.2, cap: 14 }),
    range: [0, 12], unit: 'MeV',
  },
  fy: {
    label: tr('核分裂収率（²³⁵U 熱中性子・累積）', 'Fission yield (²³⁵U, thermal neutrons, cumulative)'), short: tr('核分裂収率', 'Fission yield'),
    value: (n) => (n.fyc ? log10(n.fyc) : null),
    height: (n) => (n.fyc ? Math.max(0.2, (log10(n.fyc) + 9) * 1.6) : 0.2),
    range: [-8, -1.1], unit: '', ticks: ['10⁻⁶ %', '10⁻⁴ %', '0.01 %', '1 %'], tickVals: [-8, -6, -4, -2],
  },
  year: {
    label: tr('核種の発見年', 'Year of discovery of the nuclide'), short: tr('発見年', 'Year of discovery'),
    value: (n) => n.y ?? null,
    height: (n) => (n.y ? Math.min(12.5, Math.max(0.4, (n.y - 1890) / 11)) : 0.25),
    range: [1896, 2025], unit: tr('年', ''), // a year needs no unit in English
  },
  flat: { label: tr('なし（2D）', 'None (2D)'), short: '2D', value: () => null, height: () => 0.3, range: [0, 1] },
};

// ---------- color scales ----------
export const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const cssRgb = (rgb) => `rgb(${rgb.map((c) => Math.round(c * 255)).join(',')})`;
/** black or white, whichever reads better on the color */
export const inkFor = (rgb) => (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 0.5 ? '#111' : '#fff');

// viridis, sampled
const VIRIDIS = ['#440154', '#482878', '#3e4a89', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
const VIR_RGB = VIRIDIS.map(hexToRgb);
export function viridis(t) {
  t = Math.min(1, Math.max(0, t)) * (VIR_RGB.length - 1);
  const i = Math.min(VIR_RGB.length - 2, Math.floor(t));
  const f = t - i;
  return VIR_RGB[i].map((c, k) => c + (VIR_RGB[i + 1][k] - c) * f);
}
export const VIRIDIS_CSS = `linear-gradient(90deg, ${VIRIDIS.join(',')})`;

// half-life colors in LEGO-brick tones: short-lived red → orange → yellow → light blue → long-lived blue, stable deep blue
const HL_STOPS = [
  [-9, '#a3170f'], [-6, '#d0281b'], [-3, '#ea5a22'], [0, '#f39424'], [3, '#f7c52e'],
  [5, '#efe08f'], [7, '#cfe1ef'], [9.5, '#8fbfe7'], [12.5, '#4b8fd8'], [16, '#2565c0'],
];
export const HL_STABLE = '#0b45a0';
export const HL_RANGE = [-9, 16]; // log₁₀(T½ / s)
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
  { key: 'st', name: tr('安定核', 'Stable nuclei'), color: '#1b1b1d', dark: '#e9e6dc' }, // black would vanish on the dark board
  { key: 'found', name: tr('不安定核（発見済み）', 'Unstable nuclei (discovered)'), color: '#c91a09' },
  { key: 'unfound', name: tr('不安定核（未発見）', 'Unstable nuclei (undiscovered)'), color: '#f5c400' },
  { key: 'riken', name: tr('理研で発見した原子核', 'Nuclei discovered at RIKEN'), color: '#237841' },
  { key: 'rikenSH', name: tr('理研で発見した超重原子核', 'Superheavy nuclei discovered at RIKEN'), color: '#0055bf' },
];
const LEGO_BY_KEY = Object.fromEntries(LEGO_PALETTE.map((c) => [c.key, c]));
/** the red of the LEGO chart's proton-number arrow: the color of RIKEN on this page (--lego-red in style.css) */
export const LEGO_RED = '#d01012';
/** the color of a class of the LEGO chart in the theme */
export const legoHex = (entry, theme) => (theme === 'dark' && entry.dark) || entry.color;
// A RIKEN class switched off in the 表示 section (keys in `off`) gives its nuclei back to the class they belong to
// besides: unstable and discovered (red), so they stay on the chart while that class is shown.
export function legoKey(nuc, off) {
  const rk = nuc.rk ? (nuc.z >= 104 ? 'rikenSH' : 'riken') : null;
  if (rk && !off?.has(rk)) return rk;
  return nuc.st ? 'st' : nuc.y ? 'found' : 'unfound';
}
export const legoColor = (nuc, theme = 'light', off = null) => hexToRgb(legoHex(LEGO_BY_KEY[legoKey(nuc, off)], theme));

// ---------- how values are written ----------
const fmtNum = (v, digits) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** an energy in keV, with its uncertainty and "#" for a value estimated from systematics */
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
  if (nuc.st) return tr('安定', 'stable');
  if (nuc.pu) return tr('粒子非束縛', 'particle-unbound');
  if (nuc.ts) return nuc.ts + (nuc.te ? ' #' : '');
  return tr('不明', 'unknown');
}
export const fmtJpi = (j) => (j ? j.replace(/\*/g, '').replace(/\s+/g, ' ') : '—');
/** the branching ratio of a decay mode [mode, relation, value %] */
export function fmtBranch(m) {
  const [, op, val] = m;
  if (val === null) return op === '?' ? '?' : '—';
  const pre = op === '=' ? '' : op === '~' ? '≈ ' : op + ' ';
  const v = val >= 0.1 ? +val.toPrecision(4) : val.toExponential(1);
  return `${pre}${v} %`;
}
/** a share (%) worked out from the data rather than given in it, with its relation: ≈ (or ≤, at most) */
export function fmtShare(op, val) {
  if (val === 0) return '0 %';
  const v = val >= 10 ? String(+val.toPrecision(3)) : val >= 0.01 ? val.toPrecision(2) : val.toExponential(1);
  return `${op === '≤' ? '≤' : '≈'} ${v} %`;
}
