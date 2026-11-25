// Hypernucleus mode: ordinary nuclei stay on the floor (strangeness layer S = 0, drawn as cubes), Λ/Σ hypernuclei
// sit on a layer above (one s quark) and ΛΛ/Ξ hypernuclei on a second one (two s quarks). Each layer is a
// translucent plane; a vertical axis counts the s quarks. A hypernucleus is placed over its nucleon core (Z, N).
import * as THREE from 'three';
import { ELEMENTS, HYPERNUCLEI, HYPER_DRIP_SOURCES as DRIP_DATA } from './data.js';
import { hexToRgb } from './nuclear.js';
import { ribbon, FOOT, MASS_OFFSET, N_EDGE } from './chart.js';
import { makeTextSprite } from './sprites.js';
import { tr } from './i18n.js';

// how each paper's drip lines are drawn (in the color of their layer), and the one shown at first: only one, so that
// the lines do not lie on top of each other
const DRIP_STYLE = {
  samanta2008: { dash: 'solid', on: true },
  roychowdhury2010: { dash: 'dash' },
  meoto2022: { dash: 'dot' },
};
/** the theoretical hypernuclear drip lines, one entry per paper, with their dash and whether shown at first */
export const HYPER_DRIP_SOURCES = DRIP_DATA.map((src) => ({ on: false, ...src, ...DRIP_STYLE[src.key] }));

export const LAYER_GAP = 26; // world units between strangeness layers
export const HYPER_BASE = 1e6; // hypernucleus k is addressed as HYPER_BASE + k next to nuclide indices
export const isHyper = (id) => id >= HYPER_BASE;

export const HYPER_KINDS = {
  L: {
    s: 1, sym: 'Λ', name: tr('Λハイパー核', 'Λ hypernucleus'), en: 'Λ hypernucleus', color: '#e8262f', bind: 'B<sub>Λ</sub>', bindTitle: tr('Λ の結合エネルギー', 'Binding energy of the Λ'),
    desc: tr('ストレンジクォークを含むΛ粒子（uds）が原子核に束縛された原子核。Λは核子とは別の粒子なのでパウリの排他原理を受けず、原子核の奥まで入り込めます。',
      'A nucleus with a Λ particle (uds), which contains a strange quark, bound inside it. The Λ is not a nucleon, so the Pauli exclusion principle does not keep it out, and it can go deep into the nucleus.'),
  },
  S: {
    s: 1, sym: 'Σ', name: tr('Σハイパー核', 'Σ hypernucleus'), en: 'Σ hypernucleus', color: '#f07a1a', bind: 'B<sub>Σ</sub>', bindTitle: tr('Σ の結合エネルギー', 'Binding energy of the Σ'),
    desc: tr('Σ粒子が束縛されたハイパー核。Σは原子核の中でΛに変わりやすく、束縛状態として確立しているものはごくわずかです。',
      'A hypernucleus with a bound Σ particle. Inside a nucleus the Σ easily turns into a Λ, so very few bound states are firmly established.'),
  },
  LL: {
    s: 2, sym: 'ΛΛ', name: tr('ダブルΛハイパー核', 'Double-Λ hypernucleus'), en: 'double-Λ hypernucleus', color: '#d23fd2', bind: 'B<sub>ΛΛ</sub>', bindTitle: tr('2個の Λ の結合エネルギー', 'Binding energy of the two Λs'),
    desc: tr('Λ粒子を2個含むハイパー核。2個のΛの間にはたらく力（ΛΛ相互作用）を調べる手がかりになり、原子核乾板実験で見つかっています。',
      'A hypernucleus with two Λ particles. It is a clue to the force between two Λs (the ΛΛ interaction), and such nuclei have been found in nuclear emulsion experiments.'),
  },
  X: {
    s: 2, sym: 'Ξ', name: tr('Ξハイパー核', 'Ξ hypernucleus'), en: 'Ξ hypernucleus', color: '#8f45e6', bind: 'B<sub>Ξ</sub>', bindTitle: tr('Ξ⁻ の結合エネルギー', 'Binding energy of the Ξ⁻'),
    desc: tr('ストレンジクォークを2個含むΞ⁻粒子（dss）が原子核に束縛された系。原子核乾板実験で、Ξ⁻と¹⁴Nなどの束縛状態が見つかっています。',
      'A system in which a Ξ⁻ particle (dss), with two strange quarks, is bound to a nucleus. Nuclear emulsion experiments have found bound states of a Ξ⁻ with ¹⁴N and other nuclei.'),
  },
};

// where each experiment of data/hypernuclei.yaml was done and how the hypernuclei were made: [site, production]
const STOPPED_XI = tr('(K⁻, K⁺) 反応で作った Ξ⁻ を原子核乾板の中で止め、原子核に吸収させる',
  'A Ξ⁻ made in the (K⁻, K⁺) reaction is stopped in nuclear emulsion and absorbed by a nucleus');
export const EXPERIMENTS = {
  'Berkeley Bevatron emulsion': [tr('米国 バークレー（Bevatron）', 'Berkeley, USA (Bevatron)'), tr('原子核乾板に K⁻ 中間子を当てて止める', 'K⁻ mesons stopped in nuclear emulsion')],
  emulsion: [tr('複数の研究所（原子核乾板データの集計）', 'Several laboratories (nuclear emulsion data combined)'), tr('原子核乾板に K⁻ 中間子を当てて止める', 'K⁻ mesons stopped in nuclear emulsion')],
  'CERN (K⁻,π⁻)': [tr('CERN（欧州）', 'CERN (Europe)'), tr('(K⁻, π⁻) 反応', '(K⁻, π⁻) reaction')],
  'JLab Hall A (e,e′K⁺)': [tr('米国 ジェファーソン研究所（JLab）Hall A', 'Jefferson Lab (JLab) Hall A, USA'), tr('(e, e′K⁺) 反応（電子線）', '(e, e′K⁺) reaction (electron beam)')],
  'BNL AGS (π⁺,K⁺)': [tr('米国 ブルックヘブン国立研究所（AGS）', 'Brookhaven National Laboratory (AGS), USA'), tr('(π⁺, K⁺) 反応', '(π⁺, K⁺) reaction')],
  'KEK 12-GeV PS (π⁺,K⁺)': [tr('KEK（12 GeV 陽子シンクロトロン）', 'KEK (12 GeV proton synchrotron)'), tr('(π⁺, K⁺) 反応', '(π⁺, K⁺) reaction')],
  'KEK (K⁻,π⁻)': ['KEK', tr('(K⁻, π⁻) 反応', '(K⁻, π⁻) reaction')],
  'emulsion (Danysz event)': [tr('CERN（Danysz らの原子核乾板実験）', 'CERN (nuclear emulsion experiment by Danysz et al.)'), tr('原子核乾板に K⁻ 中間子を当てる', 'K⁻ mesons sent into nuclear emulsion')],
  'KEK E373 (NAGARA)': [tr('KEK（E373 実験、NAGARA 事象）', 'KEK (E373 experiment, NAGARA event)'), STOPPED_XI],
  'KEK E373 (HIDA)': [tr('KEK（E373 実験、HIDA 事象）', 'KEK (E373 experiment, HIDA event)'), STOPPED_XI],
  'KEK E373 (KISO)': [tr('KEK（E373 実験、KISO 事象）', 'KEK (E373 experiment, KISO event)'), STOPPED_XI],
  'KEK E176': [tr('KEK（E176 実験）', 'KEK (E176 experiment)'), STOPPED_XI],
  'KEK E176 (#10-09-06, #13-11-14)': [tr('KEK（E176 実験）', 'KEK (E176 experiment)'), STOPPED_XI],
};

/** the strangeness layers (s: number of s quarks): what lies on each, the tag on its plane, and its colors */
export const HYPER_LAYERS = [
  { s: 0, name: tr('通常核', 'Ordinary nuclei'), label: tr('通常核（u, d クォークの世界）', 'Ordinary nuclei (u and d quarks only)'), color: '#e9c44a', ink: '#5a4500' },
  { s: 1, name: tr('Λ, Σ ハイパー核', 'Λ, Σ hypernuclei'), label: tr('Λ, Σ ハイパー核', 'Λ, Σ hypernuclei'), color: '#ff5b6e', ink: '#b0102a' },
  { s: 2, name: tr('ΛΛ, Ξ ハイパー核', 'ΛΛ, Ξ hypernuclei'), label: tr('ΛΛ, Ξ ハイパー核', 'ΛΛ, Ξ hypernuclei'), color: '#d65bd6', ink: '#8a1d8a' },
];

// the translucent plane of each layer (x = N, z = -Z), and where the s-quark axis stands: at the board's front-left
// corner, in line with the Z axis
const PLANE = { x0: -8, x1: 204, z0: -124, z1: 6 };
const AXIS = { x: -13.5, z: 6 };
const planeCorners = (y) => [[PLANE.x0, PLANE.z1], [PLANE.x1, PLANE.z1], [PLANE.x1, PLANE.z0], [PLANE.x0, PLANE.z0]]
  .map(([x, z]) => new THREE.Vector3(x, y, z));

const DASHES = { solid: null, dash: [0.9, 1.5], dot: [0.3, 0.7] }; // [length, period] along the line

/**
 * One drip line on a layer, as a flat ribbon at height y: a staircase along the cell edges just outside the bound
 * region (one step per Z, so the odd–even zig-zag of the tables stays visible), solid, dashed or dotted. Gaps in Z
 * break it.
 */
function dripRibbon(rows, side, y, dash) {
  const dx = side === 'neutron' ? 0.5 : -0.5;
  const runs = [];
  [...rows].sort((a, b) => a[0] - b[0]).forEach(([z, n], k, all) => {
    if (!k || z !== all[k - 1][0] + 1) runs.push([]);
    const x = Math.min(N_EDGE, n + dx);
    runs[runs.length - 1].push([x, -z + 0.5], [x, -z - 0.5]);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(runs.flatMap((pts) => ribbon(pts, y, 0.15, DASHES[dash])), 3));
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
    this.layersOn = new Set(HYPER_LAYERS.map((l) => l.s)); // strangeness layers switched on (plane, its guides and its nuclei)
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
    const outline = dark ? '#050506' : '#ffffff'; // round the letters that stand free
    const gap = this.gap, stacked = gap < 5; // stacked: the 2D view, layers one box apart
    const { x0, x1, z0, z1 } = PLANE;
    for (const layer of HYPER_LAYERS) {
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
        new THREE.BufferGeometry().setFromPoints(planeCorners(y)),
        new THREE.LineBasicMaterial({ color: layer.color, transparent: true, opacity: 0.8 }),
      );
      lg.add(edge);
      const tag = makeTextSprite(layer.label, { color: dark ? '#fff' : layer.ink, bg: dark ? layer.ink : '#ffffffe6', border: layer.color, weight: 700, size: 4.4 });
      // stacked layers would put the names on top of each other: set them side by side in front of the board
      if (stacked) tag.position.set(60 + layer.s * 60, y + 1.5, z1 + 3);
      else tag.position.set(118, y + 2.8, z1 + 2);
      lg.add(tag);
    }
    // theoretical drip lines on each layer in the color of the layer, named at the heavy end of the neutron line
    // (on the s = 0 layer they run over the tops of the cubes); the papers are named only in the left panel
    this.dripGroups = [];
    for (const src of HYPER_DRIP_SOURCES) {
      for (const [s, lines] of Object.entries(src.layers)) {
        const group = new THREE.Group();
        group.visible = this.dripOn.has(src.key);
        const y = +s * gap + (+s === 0 || stacked ? FOOT + 0.05 : 0.06);
        const layer = HYPER_LAYERS[+s];
        const color = dark ? layer.color : layer.ink;
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
        for (const side of ['neutron', 'proton']) {
          if (!lines[side]) continue;
          const m = new THREE.Mesh(dripRibbon(lines[side], side, y, src.dash), mat);
          m.renderOrder = 4;
          group.add(m);
        }
        const end = (lines.neutron || lines.proton).reduce((a, b) => (b[0] > a[0] ? b : a));
        const t = makeTextSprite(tr('ハイパー核のドリップライン（存在限界の理論予想）', 'Hypernuclear drip line (theoretical limit of existence)'), { color, weight: 700, size: 2, anchor: 'left', stroke: outline });
        t.position.set(Math.min(N_EDGE, end[1] + 2), y + 0.8, -end[0]);
        group.add(t);
        this.layerGroups.get(+s).add(group);
        this.dripGroups.push({ key: src.key, group });
      }
    }
    // s-quark axis: an arrow straight up in the red of the Z axis, ticks at each layer (not in the stacked 2D
    // view, where it would be seen end on)
    if (stacked) return;
    const { x: axisX, z: axisZ } = AXIS;
    const top = 2 * gap + 12;
    const red = this.chart.guideColors.zAxis;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, top, 12), new THREE.MeshBasicMaterial({ color: red }));
    shaft.position.set(axisX, top / 2, axisZ);
    g.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3, 16), new THREE.MeshBasicMaterial({ color: red }));
    head.position.set(axisX, top + 1.5, axisZ);
    g.add(head);
    for (const layer of HYPER_LAYERS) {
      const t = makeTextSprite(String(layer.s), { color: red, weight: 700, size: 3, stroke: outline });
      t.position.set(axisX - 3, layer.s * gap + 1, axisZ);
      g.add(t);
    }
    const name = makeTextSprite(tr('s クォーク数', 'Strange quarks'), { color: '#fff', bg: red, weight: 700, size: 3.2 });
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
    return [...HYPER_LAYERS.flatMap((layer) => planeCorners(layer.s * this.gap)), new THREE.Vector3(AXIS.x, 2 * this.gap + 20, AXIS.z)];
  }
}
