// Decay graph (daughters, parents, chains) and its 3D visualisation (animated arcs + floating tags).
import * as THREE from 'three';
import { modeShift, isFission, modeCategory, modeLabel, CATEGORIES, key, fmtBranch, nucText, fmtHalfLife } from './nuclear.js';
import { makeTextSprite, EMPH } from './chart.js';

const branchWeight = (val) => (val === null ? 0.35 : Math.min(1, Math.max(0.12, (Math.log10(val) + 3) / 5)));

export class DecayGraph {
  constructor(nuclides) {
    this.nuclides = nuclides;
    this.index = new Map(nuclides.map((n, i) => [key(n.z, n.n), i]));
    this.memo = new Map();
    this.parentIndex = new Map();
    nuclides.forEach((_, i) => {
      for (const d of this.daughters(i)) {
        if (d.to < 0) continue;
        if (!this.parentIndex.has(d.to)) this.parentIndex.set(d.to, []);
        this.parentIndex.get(d.to).push({ from: i, d, mode: d.mode, val: d.val, op: d.op, cat: d.cat });
      }
    });
  }

  find(z, n) {
    return this.index.get(key(z, n)) ?? -1;
  }

  /** direct decay products of nuclide i */
  daughters(i) {
    if (!this.memo.has(i)) this.memo.set(i, this.computeDaughters(i));
    return this.memo.get(i);
  }

  /** the branch with the largest known ratio (or the first listed one when none is known) */
  largest(i) {
    const all = this.daughters(i);
    if (!all.length) return null;
    return all.reduce((b, d) => (d.val !== null && (b.val === null || d.val > b.val) ? d : b), all[0]);
  }

  /** whether branch d of nuclide i passes the branching-ratio threshold (%); the main branch always does */
  keepBranch(i, d, minBranch) {
    if (this.nuclides[i].st) return false; // e.g. "A ?" on 206Pb: allowed by energy but never observed
    if (minBranch <= 0 || (d.val !== null && d.val >= minBranch)) return true;
    return d === this.largest(i);
  }

  shownDaughters(i, minBranch) {
    return this.daughters(i).filter((d) => this.keepBranch(i, d, minBranch));
  }

  computeDaughters(i) {
    const nuc = this.nuclides[i];
    const out = [];
    for (const m of nuc.d || []) {
      const [mode, op, val] = m;
      if (mode === 'IT') continue;
      const cat = modeCategory(mode);
      if (isFission(mode)) {
        out.push({ mode, op, val, cat, fission: true, raw: m, to: -1, fragments: fissionFragments(nuc) });
        continue;
      }
      const shift = modeShift(mode);
      if (!shift) continue;
      const z = nuc.z + shift[0], n = nuc.n + shift[1];
      out.push({ mode, op, val, cat, z, n, to: this.find(z, n), raw: m });
    }
    return out;
  }

  /** the decay branch a nucleus most likely follows */
  dominant(i) {
    const ds = this.daughters(i).filter((d) => !d.fission);
    if (!ds.length) return null;
    const all = this.daughters(i);
    const best = all.reduce((b, d) => (d.val !== null && (b.val === null || d.val > b.val) ? d : b), all[0]);
    return best.fission ? null : best;
  }

  parents(i) {
    return this.parentIndex.get(i) || [];
  }

  /** breadth-first decay tree down to stable nuclei (branches >= minBranch %, plus the main one) */
  chain(start, { minBranch = 1, maxEdges = 90 } = {}) {
    const edges = [];
    const depthOf = new Map([[start, 0]]);
    const queue = [start];
    while (queue.length && edges.length < maxEdges) {
      const i = queue.shift();
      const nuc = this.nuclides[i];
      if (nuc.st) continue;
      const dom = this.dominant(i);
      for (const d of this.daughters(i)) {
        if (d.fission || d.to < 0) continue;
        if (d !== dom && !this.keepBranch(i, d, minBranch)) continue;
        edges.push({ from: i, to: d.to, mode: d.mode, cat: d.cat, val: d.val, op: d.op, depth: depthOf.get(i) });
        if (!depthOf.has(d.to)) {
          depthOf.set(d.to, depthOf.get(i) + 1);
          queue.push(d.to);
        }
      }
    }
    return { edges, nodes: depthOf };
  }

  /** nuclei that decay into `start`, going back `generations` steps (only branches passing the threshold) */
  ancestors(start, { generations = 2, minBranch = 1, maxEdges = 160 } = {}) {
    const edges = [];
    const genOf = new Map([[start, 0]]);
    let frontier = [start];
    for (let gen = 1; gen <= generations && frontier.length; gen++) {
      const next = [];
      for (const j of frontier) {
        for (const p of this.parents(j)) {
          if (!this.keepBranch(p.from, p.d, minBranch)) continue;
          if (genOf.has(p.from) && genOf.get(p.from) < gen) continue; // already reached by a shorter route
          edges.push({ from: p.from, to: j, mode: p.mode, cat: p.cat, val: p.val, op: p.op, raw: p.d.raw, gen });
          if (!genOf.has(p.from)) {
            genOf.set(p.from, gen);
            next.push(p.from);
          }
          if (edges.length >= maxEdges) return { edges, nodes: genOf, truncated: true };
        }
      }
      frontier = next;
    }
    return { edges, nodes: genOf, truncated: false };
  }

  /** the largest branch that is not fission (null when fission is all there is) */
  largestDecay(i) {
    const ds = this.daughters(i).filter((d) => !d.fission);
    if (!ds.length) return null;
    return ds.reduce((b, d) => (d.val !== null && (b.val === null || d.val > b.val) ? d : b), ds[0]);
  }

  /**
   * One path to a stable (or last known) nucleus, by route:
   *   'avoid' (default) — at each step the largest branch other than spontaneous fission, so the path stays in the
   *                       decay chain the diagram draws (e.g. ²⁶²Db: α 48 % rather than SF 52 %);
   *   'main'            — at each step the largest branch, fission included.
   * When the 'avoid' route runs into a nucleus with no decay data (e.g. ²⁷⁸Bh → ²⁷⁴Db by α), the 'main' route is
   * used instead. Where fission is taken (or is the only way on), the path goes on from one typical fragment (step flagged
   * `fission`): the heavy peak (A ≈ 140), or half the nucleus for the symmetric fission above A ≈ 256, with the
   * charge of the unchanged-charge-distribution estimate. Real fission gives a wide spread of fragments and emits
   * neutrons, so that part is only a guide.
   */
  mainPath(start, { route = 'avoid', maxSteps = 60 } = {}) {
    if (route === 'avoid') {
      const path = this.mainPath(start, { route: 'strict-avoid', maxSteps });
      const last = path.at(-1);
      if (last.idx < 0 || !this.nuclides[last.idx].st) return this.mainPath(start, { route: 'main', maxSteps });
      return path;
    }
    const path = [{ idx: start, via: null }];
    const seen = new Set([start]);
    let i = start;
    for (let s = 0; s < maxSteps; s++) {
      if (this.nuclides[i].st) break;
      const d = route === 'main' ? this.dominant(i) : this.largestDecay(i);
      if (!d) {
        const f = this.largest(i);
        if (!f || !f.fission) break;
        const frag = f.fragments[0];
        const j = this.find(frag.z, frag.n);
        if (j < 0 || seen.has(j)) {
          path.push({ idx: -1, via: f, z: frag.z, n: frag.n, fission: true });
          break;
        }
        path.push({ idx: j, via: f, fission: true });
        seen.add(j);
        i = j;
        continue;
      }
      if (d.to < 0) {
        path.push({ idx: -1, via: d, z: d.z, n: d.n });
        break;
      }
      if (seen.has(d.to)) break;
      path.push({ idx: d.to, via: d });
      seen.add(d.to);
      i = d.to;
    }
    return path;
  }
}

/** rough location of the fission-fragment peaks (asymmetric below A≈256, symmetric above) */
function fissionFragments(nuc) {
  const A = nuc.a, Z = nuc.z;
  const peaks = A >= 256 || A < 200 ? [A / 2 - 1] : [140, A - 140 - 3];
  return peaks.map((af) => {
    const zf = Math.round((Z * af) / A);
    return { a: Math.round(af), z: zf, n: Math.round(af) - zf };
  });
}

// ---------- 3D visualisation ----------
const arcVertex = /* glsl */ `
  uniform float uScale;
  uniform float uRadius;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 c = position - normal * uRadius;
    vec3 p = c + normal * uRadius * uScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const arcFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uLen;
  uniform float uOpacity;
  uniform float uDotted;
  uniform float uScale;
  varying vec2 vUv;
  void main() {
    float s = fract(vUv.x * uLen * 0.45 - uTime * 1.4);
    float pulse = smoothstep(0.0, 0.12, s) * smoothstep(0.55, 0.35, s);
    vec3 col = mix(uColor, vec3(1.0), pulse * (uDotted > 0.5 ? 0.3 : 0.55));
    // dotted line for decays INTO the selected nucleus (parents); dot spacing follows the on-screen thickness
    if (uDotted > 0.5 && fract(vUv.x * uLen * 2.4 / uScale) > 0.45) discard;
    gl_FragColor = vec4(col, uOpacity);
  }
`;

export class DecayViz {
  constructor(scene, chart, graph) {
    this.chart = chart;
    this.graph = graph;
    this.group = new THREE.Group();
    this.group.renderOrder = 5;
    scene.add(this.group);
    this.arcs = [];
    this.heads = [];
    this.tags = [];
    this.scale = 1;
    // name tags that belong to a display mode (LLFP, MA, Nh, …); they outlive clear()
    this.calloutGroup = new THREE.Group();
    scene.add(this.calloutGroup);
    this.callouts = [];
    this.headGeo = new THREE.ConeGeometry(1, 1, 18);
    this.headGeo.translate(0, -0.5, 0); // tip at origin, pointing +y
  }

  clear() {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      if (o.geometry && o.geometry !== this.headGeo) o.geometry.dispose();
      if (o.material) o.material.dispose();
    }
    this.arcs = [];
    this.heads = [];
    this.tags = [];
  }

  topOf(i, z, n) {
    const nuc = i >= 0 ? this.chart.nuclides[i] : null;
    const h = i >= 0 ? Math.max(0, this.chart.targetHeightOf(i)) : 0.2;
    return new THREE.Vector3(nuc ? nuc.n : n, h + 0.06, nuc ? -nuc.z : -z);
  }

  /**
   * Draws decays of nuclide i. Returns a Map(instanceIndex -> EMPH code) for the chart.
   */
  show(i, { chain = true, generations = 2, minBranch = 1, route = 'avoid' } = {}) {
    this.clear();
    const g = this.graph;
    const emph = new Map();
    const setE = (idx, code) => {
      if (idx < 0) return;
      const prev = emph.get(idx);
      const rank = (c) => [0, 6, 5, 3, 4, 1, 0][c] ?? 0; // selected > daughter > parent > chain > fragment
      if (prev === undefined || rank(code) > rank(prev)) emph.set(idx, code);
    };
    const nuc = this.chart.nuclides[i];
    const sel = this.topOf(i);
    this.focus = sel;

    if (chain) {
      const { edges } = g.chain(i, { minBranch });
      for (const e of edges) {
        if (e.depth === 0) continue;
        this.addArc(this.topOf(e.from), this.topOf(e.to), e.cat, { radius: 0.07, opacity: 0.8, weight: branchWeight(e.val) });
        setE(e.to, EMPH.chain);
        setE(e.from, EMPH.chain);
      }
      // the stable end of the main path (not when it went on through a fission fragment: that is only a guide)
      const path = g.mainPath(i, { route });
      const last = path.at(-1);
      if (!path.some((s) => s.fission) && last.idx >= 0 && last.idx !== i && this.chart.nuclides[last.idx].st) {
        const p = this.topOf(last.idx);
        this.addTag(`${nucText(this.chart.nuclides[last.idx])} 安定`, p.clone().add(new THREE.Vector3(0, 0.9, 0)), {
          px: 15, bg: '#232326', color: '#ffffff', prio: 3,
        });
      }
    }

    // ancestors: dotted arcs, fainter for each generation further back
    if (generations > 0) {
      const { edges } = g.ancestors(i, { generations, minBranch });
      const tagged = new Set();
      for (const e of edges) {
        const from = this.topOf(e.from);
        this.addArc(from, this.topOf(e.to), e.cat, {
          radius: e.gen === 1 ? 0.085 : 0.065, opacity: e.gen === 1 ? 0.9 : 0.65, weight: branchWeight(e.val), dotted: true,
        });
        setE(e.from, EMPH.parent);
        if (tagged.has(e.from)) continue;
        tagged.add(e.from);
        this.addTag(`${nucText(this.chart.nuclides[e.from])}`, from.clone().add(new THREE.Vector3(0, 0.8, 0)), {
          px: e.gen === 1 ? 13 : 11.5, bg: e.gen === 1 ? 'rgba(40,90,200,0.9)' : 'rgba(40,90,200,0.62)', color: '#fff', prio: 3 + e.gen,
        });
      }
    }

    const tagGroups = new Map(); // one tag per daughter nucleus, even if several modes lead there
    for (const d of g.shownDaughters(i, minBranch)) {
      const color = CATEGORIES[d.cat].arc;
      const label = `${modeLabel(d.mode)} ${fmtBranch(d.raw)}`;
      if (d.fission) {
        d.fragments.forEach((f, k) => {
          const fi = g.find(f.z, f.n);
          const to = this.topOf(fi, f.z, f.n);
          this.addArc(sel, to, d.cat, { radius: 0.11, opacity: 0.8, weight: branchWeight(d.val), apexTag: k === 0 ? `${label}（分裂片の目安）` : null });
          for (let da = -6; da <= 6; da++) {
            const af = f.a + da;
            const zc = (nuc.z * af) / nuc.a;
            for (let z = Math.floor(zc - 1.5); z <= Math.ceil(zc + 1.5); z++) setE(g.find(z, af - z), EMPH.fragment);
          }
        });
        continue;
      }
      const to = this.topOf(d.to, d.z, d.n);
      this.addArc(sel, to, d.cat, { radius: 0.13, opacity: d.val === null ? 0.75 : 1, weight: branchWeight(d.val) });
      setE(d.to, EMPH.daughter);
      const gk = `${d.z},${d.n}`;
      if (!tagGroups.has(gk)) tagGroups.set(gk, { d, to, labels: [], color });
      tagGroups.get(gk).labels.push(label);
    }
    for (const { d, to, labels, color } of tagGroups.values()) {
      const dn = d.to >= 0 ? this.chart.nuclides[d.to] : null;
      const name = dn ? `${nucText(dn)}  ${fmtHalfLife(dn)}` : `Z=${d.z}, N=${d.n}（未登録）`;
      this.addTag(`${labels.join(' / ')}  →  ${name}`, to.clone().add(new THREE.Vector3(0, 1.0, 0)), {
        px: 15, bg: 'rgba(255,255,255,0.95)', color: '#1d1d1f', border: color, prio: 1,
      });
    }

    this.addTag(`${nucText(nuc)}`, sel.clone().add(new THREE.Vector3(0, 1.3, 0)), { px: 20, bg: '#e8364a', color: '#fff', prio: 0 });
    setE(i, EMPH.selected);
    return emph;
  }

  addArc(from, to, cat, { radius = 0.1, opacity = 1, weight = 1, dotted = false, apexTag = null }) {
    const dist = from.distanceTo(to);
    if (dist < 0.01) return;
    const apex = Math.max(from.y, to.y) + 1.0 + 0.16 * dist;
    const ctrl = new THREE.Vector3((from.x + to.x) / 2, 2 * apex - 0.5 * (from.y + to.y), (from.z + to.z) / 2);
    const curve = new THREE.QuadraticBezierCurve3(from, ctrl, to);
    const len = curve.getLength();
    const headLen = Math.min(0.9, len * 0.3);
    const r = radius * (0.45 + 0.55 * weight);
    const tEnd = curve.getUtoTmapping(1 - headLen / len);
    const pts = [];
    for (let k = 0; k <= 40; k++) pts.push(curve.getPoint((k / 40) * tEnd));
    const body = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(body, 48, r, 8, false);
    const color = new THREE.Color(CATEGORIES[cat].arc || '#888');
    const mat = new THREE.ShaderMaterial({
      vertexShader: arcVertex,
      fragmentShader: arcFragment,
      uniforms: {
        uColor: { value: color }, uTime: { value: 0 }, uLen: { value: len }, uOpacity: { value: opacity },
        uScale: { value: 1 }, uRadius: { value: r }, uDotted: { value: dotted ? 1 : 0 },
      },
      transparent: opacity < 1,
      depthWrite: opacity >= 1,
    });
    const tube = new THREE.Mesh(geo, mat);
    tube.renderOrder = 5;
    this.group.add(tube);
    this.arcs.push(tube);

    const head = new THREE.Mesh(this.headGeo, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }));
    const tangent = curve.getTangent(1).normalize();
    head.position.copy(to);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    head.userData.base = new THREE.Vector3(r * 3.2, headLen, r * 3.2);
    head.scale.copy(head.userData.base);
    head.renderOrder = 5;
    this.group.add(head);
    this.heads.push(head);

    if (apexTag) {
      const mid = curve.getPoint(0.5);
      this.addTag(apexTag, mid.add(new THREE.Vector3(0, 0.45, 0)), { px: 14, bg: CATEGORIES[cat].arc, color: '#fff', prio: 2 });
    }
  }

  /** items: [{ idx, text, bg }] — tags that float above these nuclides while they are shown */
  setCallouts(items) {
    for (const c of this.callouts) {
      this.calloutGroup.remove(c);
      c.material.dispose();
    }
    this.callouts = items.map(({ idx, text, bg }) => {
      const s = makeTextSprite(text, { color: '#fff', bg, weight: 600 });
      s.material.sizeAttenuation = false;
      s.material.depthTest = false;
      s.renderOrder = 9;
      s.center.set(0.5, 0);
      s.userData = { idx, px: 12.5, prio: 6, aspect: s.scale.x / s.scale.y };
      s.scale.set(0, 0, 1);
      this.calloutGroup.add(s);
      return s;
    });
  }

  addTag(text, pos, { px = 14, bg = null, color = '#fff', border = null, prio = 5 }) {
    const s = makeTextSprite(text, { color, bg, border, weight: 600 });
    s.material.sizeAttenuation = false;
    s.material.depthTest = false;
    s.renderOrder = 10;
    s.center.set(0.5, 0);
    s.position.copy(pos);
    s.userData.px = px;
    s.userData.prio = prio;
    s.userData.aspect = s.scale.x / s.scale.y;
    s.scale.set(0, 0, 1); // real (screen-space) size is set in update()
    this.group.add(s);
    this.tags.push(s);
  }

  /** keeps arcs readable at any zoom and tags at constant pixel size */
  update(time, camera, viewportW, viewportH) {
    const d = this.focus ? camera.position.distanceTo(this.focus) : 45;
    this.scale = Math.max(1, d / 45);
    for (const a of this.arcs) {
      a.material.uniforms.uTime.value = time;
      a.material.uniforms.uScale.value = this.scale;
    }
    for (const h of this.heads) h.scale.set(h.userData.base.x * this.scale, h.userData.base.y * Math.min(this.scale, 2.2), h.userData.base.z * this.scale);
    const p11 = 1 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    for (const c of this.callouts) {
      const i = c.userData.idx, nuc = this.chart.nuclides[i];
      c.visible = this.chart.visible[i] === 1;
      c.position.set(nuc.n, Math.max(0, this.chart.heightOf(i)) + 0.5, -nuc.z);
    }
    const shown = this.callouts.filter((c) => c.visible);
    for (const t of [...this.tags, ...shown]) {
      const sy = (2 * t.userData.px * 1.25) / (viewportH * p11);
      t.scale.set(sy * t.userData.aspect, sy, 1);
    }
    this.layoutTags(camera, viewportW, viewportH, [...this.tags, ...shown]);
  }

  /** greedy screen-space de-overlap: lower-priority tags are lifted until they no longer collide */
  layoutTags(camera, W, H, tags) {
    const placed = [];
    const v = new THREE.Vector3();
    const order = [...tags].sort((a, b) => a.userData.prio - b.userData.prio);
    for (const t of order) {
      v.copy(t.position).project(camera);
      if (v.z > 1) continue;
      const x = ((v.x + 1) / 2) * W, y = ((1 - v.y) / 2) * H;
      const h = t.userData.px * 1.25, w = h * t.userData.aspect;
      let k = 0;
      const rectAt = (k) => ({ l: x - w / 2, r: x + w / 2, t: y - h * (1 + 1.08 * k), b: y - h * 1.08 * k });
      const hits = (a) => placed.some((p) => a.l < p.r && a.r > p.l && a.t < p.b && a.b > p.t);
      const maxLift = t.userData.prio >= 4 ? 3 : 8;
      while (k < maxLift && hits(rectAt(k))) k++;
      // far ancestors give way instead of piling up
      t.visible = !(t.userData.prio >= 4 && hits(rectAt(k)));
      if (!t.visible) continue;
      t.center.y = -1.08 * k;
      placed.push(rectAt(k));
    }
  }
}
