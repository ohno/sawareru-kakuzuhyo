// The island of stability: superheavy nuclei that closed shells (around Z = 114–126, N = 184) are predicted to
// bind well enough to live long. Drawn from the shell energy of the KTUY05 mass formula: every nucleus with Z ≥ 104
// whose shell energy is deeper than −6 MeV glows green, more strongly the deeper it is, and a green line runs round
// its shore over the box tops. While the island is shown, the predicted (yellow) nuclei of the undiscovered
// elements 119–126 are added, since the island reaches them.
import * as THREE from 'three';
import { makeTextSprite } from './sprites.js';
import { nuclideKey } from './nuclear.js';

const ISLAND_SOURCE = 'KTUY05 質量公式の殻エネルギー（Koura et al., Prog. Theor. Phys. 113, 305 (2005)）';

const Z_MIN = 104; // keeps the island apart from the deep shell gap of lead (Z = 82, N = 126)
const SHORE = -6, PEAK = -10; // MeV: where the glow starts, and where it is full
const HALF = 0.13; // half width of the shore line

export class StabilityIsland {
  /** rows: the shell-energy grid of data/island.json ([Z, first N, Esh…]); without it the island is unavailable */
  constructor(scene, chart, rows) {
    this.chart = chart;
    this.enabled = false;
    this.available = !!rows?.length;
    const shell = new Map(); // shell energy (MeV) per nuclide
    let deep = null; // the deepest point of the superheavy region: the island's name goes over it
    for (const [z, n0, ...vals] of rows || []) {
      vals.forEach((v, k) => {
        shell.set(nuclideKey(z, n0 + k), v);
        if (z >= Z_MIN && v !== null && (!deep || v < deep.v)) deep = { v, z, n: n0 + k };
      });
    }
    this.depth = new Float32Array(chart.count); // how deep in the island each nuclide lies: 0 outside, up to 1
    this.members = [];
    const at = new Map(chart.nuclides.map((nuc, i) => [nuclideKey(nuc.z, nuc.n), i]));
    chart.nuclides.forEach((nuc, i) => {
      const e = nuc.z >= Z_MIN ? shell.get(nuclideKey(nuc.z, nuc.n)) : null;
      if (e === undefined || e === null || e > SHORE) return;
      this.depth[i] = 0.35 + 0.65 * Math.min(1, (SHORE - e) / (SHORE - PEAK));
      this.members.push(i);
    });
    // the shore: every cell side between a nucleus of the island and one outside it (or an empty cell)
    this.edges = [];
    for (const i of this.members) {
      const { z, n } = chart.nuclides[i];
      for (const [dz, dn] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const j = at.get(nuclideKey(z + dz, n + dn)) ?? -1;
        if (j >= 0 && this.depth[j] > 0) continue;
        // the side's ends in (N, Z), half a cell from the centre towards the neighbour
        const ends = dn ? [[n + dn / 2, z - 0.5], [n + dn / 2, z + 0.5]] : [[n - 0.5, z + dz / 2], [n + 0.5, z + dz / 2]];
        this.edges.push({ i, j, ends, along: dn ? 'z' : 'n' });
      }
    }
    const geo = new THREE.BufferGeometry();
    this.shorePos = new Float32Array(this.edges.length * 18);
    geo.setAttribute('position', new THREE.BufferAttribute(this.shorePos, 3));
    this.shore = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#0f9a45', side: THREE.DoubleSide, depthWrite: false }));
    this.shore.renderOrder = 4;
    this.shore.frustumCulled = false;
    this.labelAt = deep || { n: 184, z: 114 };
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.label = makeTextSprite('安定の島（理論予測）', { color: '#fff', bg: '#16743a', border: '#7ee08f', weight: 700, size: 3 });
    this.note = makeTextSprite(`${ISLAND_SOURCE} が −6 MeV より深い核`, { color: '#16743a', weight: 600, size: 1.4, stroke: '#ffffff' });
    this.group.add(this.shore, this.label, this.note);
  }

  /** shows or hides the island; the caller re-targets the chart (elements 119–126 come and go) */
  setEnabled(on) {
    this.enabled = on;
    this.group.visible = on;
    this.chart.islandOn = on;
    this.chart.setIsland(this.depth, on ? 1 : 0);
  }

  /** keeps the shore line on the (animated) box tops and the name above them */
  update() {
    if (!this.enabled) return;
    const chart = this.chart;
    const h = (i) => (i >= 0 && chart.visible[i] ? Math.max(0, chart.heightOf(i)) : 0);
    let top = 0;
    for (const i of this.members) top = Math.max(top, h(i));
    let k = 0;
    for (const { i, j, ends, along } of this.edges) {
      const y = Math.max(h(i), h(j)) + 0.12;
      const [[n0, z0], [n1, z1]] = ends;
      // a flat ribbon along the side, widened a little past its ends so the corners close
      const [ox, oz] = along === 'z' ? [HALF, 0] : [0, HALF];
      const [ex, ez] = along === 'z' ? [0, HALF] : [HALF, 0];
      const a = [n0 - ex, -(z0 - ez)], b = [n1 + ex, -(z1 + ez)];
      const quad = [
        [a[0] - ox, y, a[1] + oz], [a[0] + ox, y, a[1] - oz], [b[0] + ox, y, b[1] - oz],
        [a[0] - ox, y, a[1] + oz], [b[0] + ox, y, b[1] - oz], [b[0] - ox, y, b[1] + oz],
      ];
      for (const v of quad) this.shorePos.set(v, (k++) * 3);
    }
    this.shore.geometry.attributes.position.needsUpdate = true;
    const { n, z } = this.labelAt;
    this.label.position.set(n, top + 4, -z);
    this.note.position.set(n, top + 2.2, -z);
  }
}
