// Hypernucleus mode: ordinary nuclei stay on the floor (strangeness layer S = 0, drawn as cubes), Λ/Σ hypernuclei
// sit on a layer above (one s quark) and ΛΛ/Ξ hypernuclei on a second one (two s quarks). Each layer is a
// translucent plane; a vertical axis counts the s quarks. A hypernucleus is placed over its nucleon core (Z, N).
import * as THREE from 'three';
import { HYPERNUCLEI, HYPER_DRIP_SOURCES as DRIP_DATA } from './data.js';
import { ELEMENTS, hexToRgb } from './nuclear.js';
import { makeTextSprite, FOOT, MASS_OFFSET } from './chart.js';

export { HYPER_SOURCE } from './data.js';

// line color and dash of each drip-line source, and whether it is shown at first (the lines: data/hyper-driplines.yaml)
const DRIP_STYLE = {
  samanta2008: { color: '#0f9d8a', dash: 'solid', on: true },
  roychowdhury2010: { color: '#8f45e6', dash: 'dash', on: false },
  khan2015: { color: '#2f6fd6', dash: 'solid', on: true },
  meoto2022: { color: '#e07a10', dash: 'dot', on: false },
};
/** the theoretical hypernuclear drip lines, one entry per paper, with their line styles */
export const HYPER_DRIP_SOURCES = DRIP_DATA.map((src) => ({ ...src, ...DRIP_STYLE[src.key] }));

export const LAYER_GAP = 26; // world units between strangeness layers
export const HYPER_BASE = 1e6; // hypernucleus k is addressed as HYPER_BASE + k next to nuclide indices
export const isHyper = (id) => id >= HYPER_BASE;

export const HYPER_KINDS = {
  L: {
    s: 1, sym: 'Λ', name: 'Λハイパー核', en: 'Λ hypernucleus', color: '#e8262f', bind: 'B<sub>Λ</sub>', bindTitle: 'Λ の結合エネルギー',
    desc: 'ストレンジクォークを含むΛ粒子（uds）が原子核に束縛された原子核。Λは核子とは別の粒子なのでパウリの排他原理を受けず、原子核の奥まで入り込めます。',
  },
  S: {
    s: 1, sym: 'Σ', name: 'Σハイパー核', en: 'Σ hypernucleus', color: '#f07a1a', bind: 'B<sub>Σ</sub>', bindTitle: 'Σ の結合エネルギー',
    desc: 'Σ粒子が束縛されたハイパー核。Σは原子核の中でΛに変わりやすく、束縛状態として確立しているものはごくわずかです。',
  },
  LL: {
    s: 2, sym: 'ΛΛ', name: 'ダブルΛハイパー核', en: 'double-Λ hypernucleus', color: '#d23fd2', bind: 'B<sub>ΛΛ</sub>', bindTitle: '2個の Λ の結合エネルギー',
    desc: 'Λ粒子を2個含むハイパー核。2個のΛの間にはたらく力（ΛΛ相互作用）を調べる手がかりになり、原子核乾板実験で見つかっています。',
  },
  X: {
    s: 2, sym: 'Ξ', name: 'Ξハイパー核', en: 'Ξ hypernucleus', color: '#8f45e6', bind: 'B<sub>Ξ</sub>', bindTitle: 'Ξ⁻ の結合エネルギー',
    desc: 'ストレンジクォークを2個含むΞ⁻粒子（dss）が原子核に束縛された系。原子核乾板実験で、Ξ⁻と¹⁴Nなどの束縛状態が見つかっています。',
  },
};

// where each experiment of data/hypernuclei.yaml was done and how the hypernuclei were made: [site, production]
const STOPPED_XI = '(K⁻, K⁺) 反応で作った Ξ⁻ を原子核乾板の中で止め、原子核に吸収させる';
export const EXPERIMENTS = {
  'Berkeley Bevatron emulsion': ['米国 バークレー（Bevatron）', '原子核乾板に K⁻ 中間子を当てて止める'],
  emulsion: ['複数の研究所（原子核乾板データの集計）', '原子核乾板に K⁻ 中間子を当てて止める'],
  'CERN (K⁻,π⁻)': ['CERN（欧州）', '(K⁻, π⁻) 反応'],
  'JLab Hall A (e,e′K⁺)': ['米国 ジェファーソン研究所（JLab）Hall A', '(e, e′K⁺) 反応（電子線）'],
  'BNL AGS (π⁺,K⁺)': ['米国 ブルックヘブン国立研究所（AGS）', '(π⁺, K⁺) 反応'],
  'KEK 12-GeV PS (π⁺,K⁺)': ['KEK（12 GeV 陽子シンクロトロン）', '(π⁺, K⁺) 反応'],
  'KEK (K⁻,π⁻)': ['KEK', '(K⁻, π⁻) 反応'],
  'emulsion (Danysz event)': ['CERN（Danysz らの原子核乾板実験）', '原子核乾板に K⁻ 中間子を当てる'],
  'KEK E373 (NAGARA)': ['KEK（E373 実験、NAGARA 事象）', STOPPED_XI],
  'KEK E373 (HIDA)': ['KEK（E373 実験、HIDA 事象）', STOPPED_XI],
  'KEK E373 (KISO)': ['KEK（E373 実験、KISO 事象）', STOPPED_XI],
  'KEK E176': ['KEK（E176 実験）', STOPPED_XI],
  'KEK E176 (#10-09-06, #13-11-14)': ['KEK（E176 実験）', STOPPED_XI],
};

const LAYERS = [
  { s: 0, label: '通常核（u, d クォークの世界）', color: '#e9c44a', ink: '#5a4500' },
  { s: 1, label: 'Λ, Σ ハイパー核', color: '#ff5b6e', ink: '#b0102a' },
  { s: 2, label: 'ΛΛ, Ξ ハイパー核', color: '#d65bd6', ink: '#8a1d8a' },
];

const DRIP_X_MAX = 206; // right edge of the board (N)
const DASHES = { solid: null, dash: [0.9, 1.5], dot: [0.3, 0.7] }; // [on, period] along the line

/**
 * One drip line of a source on a layer, as a flat ribbon at height y: a staircase along the cell edges just
 * outside the bound region (one step per Z, so the odd–even zig-zag of the tables stays visible; a source with
 * even Z only spans two rows per step). Gaps in Z break it.
 */
function dripRibbon(rows, side, y, dash, zStep = 1) {
  const dx = side === 'neutron' ? 0.5 : -0.5;
  const runs = [];
  [...rows].sort((a, b) => a[0] - b[0]).forEach(([z, n], k, all) => {
    if (!k || z !== all[k - 1][0] + zStep) runs.push([]);
    const x = Math.min(DRIP_X_MAX, n + dx);
    runs[runs.length - 1].push([x, -z + zStep / 2], [x, -z - zStep / 2]);
  });
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const pattern = DASHES[dash];
  for (const pts of runs) {
    let carry = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [px, pz] = pts[k], [qx, qz] = pts[k + 1];
      const len = Math.hypot(qx - px, qz - pz);
      if (!len) continue;
      const ux = (qx - px) / len, uz = (qz - pz) / len, nx = -uz * 0.15, nz = ux * 0.15;
      // solid lines run a little past each corner so the steps join without notches
      const pieces = pattern ? [] : [[-0.15, len + 0.15]];
      if (pattern) {
        for (let d = -carry; d < len; d += pattern[1]) {
          const a = Math.max(0, d), b = Math.min(len, d + pattern[0]);
          if (b > a) pieces.push([a, b]);
        }
        carry = (carry + len) % pattern[1];
      }
      for (const [a, b] of pieces) {
        const ax = px + ux * a, az = pz + uz * a, bx = px + ux * b, bz = pz + uz * b;
        quad([ax - nx, y, az - nz], [ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz]);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

export const hyperHtml = (h) => `<span class="nuc"><sup>${h.a}</sup><sub>${HYPER_KINDS[h.kind].sym}</sub>${ELEMENTS[h.nameZ][0]}</span>`;

export class HyperLayers {
  constructor(scene, chart) {
    this.chart = chart;
    this.list = HYPERNUCLEI.map(([kind, a, nameZ, coreZ, coreN, b, year, exp, ref, doi]) => ({
      kind, a, nameZ, coreZ, coreN, b, year, exp, ref, doi,
    }));
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // cubes: same geometry and shader as the chart (shared uniforms), one instance per hypernucleus;
    // species over the same core on the same layer are stacked
    const n = this.list.length;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.colors = new Float32Array(n * 3);
    this.emph = new Float32Array(n);
    const labels = new Float32Array(n * 2);
    this.list.forEach((h, k) => {
      this.colors.set(hexToRgb(HYPER_KINDS[h.kind].color), k * 3);
      labels[2 * k] = h.nameZ;
      labels[2 * k + 1] = MASS_OFFSET + h.a;
    });
    this.positions = this.list.map(() => new THREE.Vector3());
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.colors, 3));
    geo.setAttribute('aLabel', new THREE.InstancedBufferAttribute(labels, 2));
    geo.setAttribute('aEmph', new THREE.InstancedBufferAttribute(this.emph, 1));
    this.mesh = new THREE.InstancedMesh(geo, chart.mesh.material, Math.max(1, n));
    this.mesh.count = n;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.layersOn = new Set(LAYERS.map((l) => l.s)); // strangeness layers switched on (plane, its guides and its nuclei)
    this.gap = LAYER_GAP; // height between layers: wide in 3D, one box pitch in the 2D view
    this.setKinds(new Set(Object.keys(HYPER_KINDS)));
    this.guides = new THREE.Group();
    this.group.add(this.guides);
    this.layerGroups = new Map(); // s -> the plane of that layer with its edge, name and drip lines
    this.dripOn = new Set(HYPER_DRIP_SOURCES.filter((src) => src.on).map((src) => src.key));
    this.dripGroups = []; // { key, group } per source and layer
  }

  /** shows the drip lines of the given sources (keys of HYPER_DRIP_SOURCES) */
  setDripSources(on) {
    this.dripOn = on;
    for (const { key, group } of this.dripGroups) group.visible = on.has(key);
  }

  /** a hypernucleus is drawn when its kind and its layer are both switched on */
  shows(h) {
    return this.kinds.has(h.kind) && this.layersOn.has(HYPER_KINDS[h.kind].s);
  }

  /** spacing of the layers: LAYER_GAP in 3D, 1 (boxes stacked like neighbours on the board) in 2D */
  setGap(gap) {
    if (gap === this.gap) return;
    this.gap = gap;
    this.setKinds(this.kinds);
    if (this.theme) this.buildGuides(this.theme);
  }

  /** switches whole strangeness layers on and off (s = 0, 1, 2) */
  setLayers(on) {
    this.layersOn = on;
    for (const [s, g] of this.layerGroups) g.visible = on.has(s);
    this.setKinds(this.kinds);
  }

  /** translucent layer planes with their labels, and the vertical s-quark axis */
  buildGuides(theme) {
    this.theme = theme;
    const g = this.guides;
    g.clear();
    this.layerGroups.clear();
    const dark = theme === 'dark';
    const gap = this.gap, stacked = gap < 5; // stacked: the 2D view, layers one box apart
    const x0 = -8, x1 = 204, z0 = -124, z1 = 6;
    for (const layer of LAYERS) {
      const lg = new THREE.Group();
      lg.visible = this.layersOn.has(layer.s);
      this.layerGroups.set(layer.s, lg);
      g.add(lg);
      const y = layer.s * gap + (layer.s === 0 ? 0.04 : -0.03);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(x1 - x0, z1 - z0),
        new THREE.MeshBasicMaterial({
          // stacked (2D) planes lie over the nuclei below them: keep the upper ones almost clear
          color: layer.color, transparent: true, opacity: layer.s === 0 ? 0.1 : stacked ? 0.03 : dark ? 0.12 : 0.14,
          side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      plane.renderOrder = 3;
      lg.add(plane);
      const edge = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([[x0, z1], [x1, z1], [x1, z0], [x0, z0]].map(([x, z]) => new THREE.Vector3(x, y, z))),
        new THREE.LineBasicMaterial({ color: layer.color, transparent: true, opacity: 0.8 }),
      );
      lg.add(edge);
      const tag = makeTextSprite(layer.label, { color: dark ? '#fff' : layer.ink, bg: dark ? layer.ink : '#ffffffe6', border: layer.color, weight: 700, size: 4.4 });
      // stacked layers would put the names on top of each other: set them side by side in front of the board
      if (stacked) tag.position.set(60 + layer.s * 60, y + 1.5, z1 + 3);
      else tag.position.set(118, y + 2.8, z1 + 2);
      lg.add(tag);
    }
    // theoretical drip lines on each layer, one colour per source, named at the heavy end of the neutron line
    // (on the s = 0 layer they run over the tops of the cubes)
    this.dripGroups = [];
    for (const src of HYPER_DRIP_SOURCES) {
      for (const [s, lines] of Object.entries(src.layers)) {
        const group = new THREE.Group();
        group.visible = this.dripOn.has(src.key);
        const y = +s * gap + (+s === 0 || stacked ? FOOT + 0.05 : 0.06);
        const mat = new THREE.MeshBasicMaterial({ color: src.color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
        for (const side of ['neutron', 'proton']) {
          if (!lines[side]) continue;
          const m = new THREE.Mesh(dripRibbon(lines[side], side, y, src.dash, src.zStep), mat);
          m.renderOrder = 4;
          group.add(m);
        }
        const end = (lines.neutron || lines.proton).reduce((a, b) => (b[0] > a[0] ? b : a));
        const t = makeTextSprite(src.short, { color: src.color, weight: 700, size: 2, anchor: 'left', stroke: dark ? '#050506' : '#ffffff' });
        t.position.set(Math.min(DRIP_X_MAX, end[1] + 2), y + 0.8, -end[0]);
        group.add(t);
        this.layerGroups.get(+s).add(group);
        this.dripGroups.push({ key: src.key, group });
      }
    }
    // s-quark axis: a red arrow straight up from the board's front-left corner, ticks at each layer (not in the
    // stacked 2D view, where it would be seen end on)
    if (stacked) return;
    const axisX = -13.5, axisZ = 6;
    const top = 2 * gap + 12;
    const red = dark ? '#ff3b30' : '#d01012';
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, top, 12), new THREE.MeshBasicMaterial({ color: red }));
    shaft.position.set(axisX, top / 2, axisZ);
    g.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3, 16), new THREE.MeshBasicMaterial({ color: red }));
    head.position.set(axisX, top + 1.5, axisZ);
    g.add(head);
    for (const layer of LAYERS) {
      const t = makeTextSprite(String(layer.s), { color: red, weight: 700, size: 3, stroke: dark ? '#050506' : '#ffffff' });
      t.position.set(axisX - 3, layer.s * gap + 1, axisZ);
      g.add(t);
    }
    const name = makeTextSprite('s クォーク数', { color: '#fff', bg: red, weight: 700, size: 3.2 });
    name.position.set(axisX, top + 5.5, axisZ);
    g.add(name);
  }

  /** shows only the given kinds ('L', 'S', 'LL', 'X'); species over the same core on a layer are stacked */
  setKinds(kinds) {
    this.kinds = kinds;
    const stack = new Map();
    const m = new THREE.Matrix4();
    this.list.forEach((h, k) => {
      const on = this.shows(h);
      const s = HYPER_KINDS[h.kind].s;
      const key = `${s},${h.coreZ},${h.coreN}`;
      const level = on ? stack.get(key) || 0 : 0;
      if (on) stack.set(key, level + 1);
      this.positions[k].set(h.coreN, s * this.gap + level * FOOT, -h.coreZ);
      m.makeScale(on ? FOOT : 0, on ? FOOT : 0, on ? FOOT : 0);
      m.setPosition(this.positions[k]);
      this.mesh.setMatrixAt(k, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  isShown(k) {
    return this.group.visible && this.shows(this.list[k]);
  }

  setEmphasis(k, code) {
    this.emph.fill(0);
    if (k >= 0) this.emph[k] = code;
    this.mesh.geometry.attributes.aEmph.needsUpdate = true;
  }

  /** index of the hypernucleus under the ray, with its distance, or null */
  pick(raycaster) {
    if (!this.group.visible) return null;
    const hit = raycaster.intersectObject(this.mesh, false).find((x) => this.shows(this.list[x.instanceId]));
    return hit ? { k: hit.instanceId, distance: hit.distance } : null;
  }

  /** corners of the three layer planes and the top of the s axis: what the hypernucleus view must show */
  framePoints() {
    const pts = [];
    for (const layer of LAYERS) for (const [x, z] of [[-8, 6], [204, 6], [204, -124], [-8, -124]]) pts.push(new THREE.Vector3(x, layer.s * this.gap, z));
    pts.push(new THREE.Vector3(-13.5, 2 * this.gap + 20, 6));
    return pts;
  }
}
