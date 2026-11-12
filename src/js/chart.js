// The 3D chart itself: one InstancedMesh of boxes with labels baked onto the top faces,
// plus the floor, grid, magic-number guides and element-name labels.
import * as THREE from 'three';
import { ELEMENTS, MAGIC, METRICS, CATEGORIES, primaryCategory, viridis, hexToRgb, halfLifeColor, legoColor, legoKey } from './nuclear.js';
import { FUEL_GROUPS } from './fuel.js';
import { DRIP_LINES } from './data.js';

export const FOOT = 0.88; // box footprint (1 = touching neighbours)
const HEIGHT_GAIN = 2; // metric heights are drawn twice as tall; the height slider multiplies on top of this
const ATLAS_COLS = 16;
const ATLAS_ROWS = 32;
export const MASS_OFFSET = 128; // atlas cell index of mass number A = MASS_OFFSET + A

export const EMPH = { none: 0, selected: 1, daughter: 2, chain: 3, parent: 4, fragment: 5, hover: 6 };

// scene colors after the RIBF LEGO nuclear chart: grey baseplate in a black frame,
// red proton-number arrow, yellow neutron-number arrow, magic numbers in green
const GUIDE = {
  light: {
    plate: '#d3d4d0', studHi: '#e2e3df', studLo: '#b9bab6', frame: '#1d1d1f', grid: '#bdbeb9',
    zAxis: '#d01012', nAxis: '#f5c400', outline: '#1d1d1f', tick: '#55534c', magic: '#1e8a3c',
    magicLine: '#2a9a48', element: '#2f2d29', column: '#4a4842', drip: '#6d3fd1',
  },
  dark: {
    plate: '#25282e', studHi: '#30343b', studLo: '#1a1c21', frame: '#050506', grid: '#33373f',
    zAxis: '#ff3b30', nAxis: '#ffd21f', outline: '#050506', tick: '#9aa0aa', magic: '#4cd27a',
    magicLine: '#3fbf69', element: '#d0d4dc', column: '#aeb3bc', drip: '#b392ff',
  },
};

/** LEGO baseplate: one stud per unit cell */
function studTexture(c) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = c.plate;
  ctx.fillRect(0, 0, 64, 64);
  const disc = (x, y, r, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  disc(34, 34, 19, c.studLo);
  disc(30.5, 30.5, 19, c.studHi);
  disc(32, 32, 16, c.plate);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Predicted drip lines on the floor: a dashed violet line for the mean of the models and a pale band for their
 * spread, just outside the last bound (neutron side) and first bound (proton side) isotope of each element.
 * The model tables have even Z only; odd Z is the average of its neighbours.
 */
const DRIP_X_MAX = 206; // right edge of the board (N)

function buildDripLines(C) {
  const group = new THREE.Group();
  const rows = new Map(DRIP_LINES.map((r) => [r[0], r]));
  const zs = [...rows.keys()].sort((a, b) => a - b);
  const at = (z, k) => {
    if (rows.has(z)) return rows.get(z)[k];
    const a = rows.get(z - 1), b = rows.get(z + 1);
    return a && b && a[k] !== null && b[k] !== null ? (a[k] + b[k]) / 2 : null;
  };
  const sides = [
    { line: 2, lo: 5, hi: 6, dx: 0.5 }, // neutron drip line: beyond the heaviest bound isotope
    { line: 1, lo: 3, hi: 4, dx: -0.5 }, // proton drip line: before the lightest bound isotope
  ];
  const bandPos = [], dashPos = [];
  const quad = (out, a, b, c, d) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (const side of sides) {
    // the heaviest elements' neutron drip line runs past the board's right edge: stop the line there
    const pts = [];
    for (let z = zs[0]; z <= zs[zs.length - 1]; z++) {
      const x = at(z, side.line), lo = at(z, side.lo), hi = at(z, side.hi);
      if (x === null) continue;
      const p = { z: -z, x: x + side.dx, lo: Math.min(DRIP_X_MAX, (lo ?? x) + side.dx), hi: Math.min(DRIP_X_MAX, (hi ?? x) + side.dx) };
      const prev = pts[pts.length - 1];
      if (p.x > DRIP_X_MAX) {
        if (prev && prev.x < DRIP_X_MAX) {
          const f = (DRIP_X_MAX - prev.x) / (p.x - prev.x);
          pts.push({ z: prev.z + (p.z - prev.z) * f, x: DRIP_X_MAX, lo: p.lo, hi: p.hi });
        }
        break;
      }
      pts.push(p);
    }
    for (let k = 0; k + 1 < pts.length; k++) {
      const p = pts[k], q = pts[k + 1];
      quad(bandPos, [p.lo, 0, p.z], [p.hi, 0, p.z], [q.hi, 0, q.z], [q.lo, 0, q.z]);
    }
    // dashes of 0.9 with gaps of 0.6 along the polyline, as flat ribbons 0.32 wide
    let carry = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const p = pts[k], q = pts[k + 1];
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      const ux = (q.x - p.x) / len, uz = (q.z - p.z) / len, nx = -uz * 0.16, nz = ux * 0.16;
      for (let d = -carry; d < len; d += 1.5) {
        const a = Math.max(0, d), b = Math.min(len, d + 0.9);
        if (b <= a) continue;
        const ax = p.x + ux * a, az = p.z + uz * a, bx = p.x + ux * b, bz = p.z + uz * b;
        quad(dashPos, [ax - nx, 0.01, az - nz], [ax + nx, 0.01, az + nz], [bx + nx, 0.01, bz + nz], [bx - nx, 0.01, bz - nz]);
      }
      carry = (carry + len) % 1.5;
    }
  }
  const mesh = (pos, opacity) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: C.drip, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    m.position.y = 0.04;
    return m;
  };
  group.add(mesh(bandPos, 0.16), mesh(dashPos, 0.95));
  for (const [text, z, side] of [['中性子ドリップライン（存在限界の理論予想）', 36, 'n'], ['陽子ドリップライン（存在限界の理論予想）', 104, 'p']]) {
    const s = makeTextSprite(text, { color: C.drip, size: 2.2, weight: 700, anchor: side === 'n' ? 'left' : 'right', stroke: C.plate });
    const x = side === 'n' ? at(z, 6) + 3 : at(z, 3) - 6;
    s.position.set(x, 0.8, -z);
    group.add(s);
  }
  return group;
}

/** flat arrow lying on the floor from (x0, z0) to (x1, z1), optionally with a dark outline underneath */
function flatArrow([x0, z0], [x1, z1], width, color, outline = null, y = 0.02) {
  const group = new THREE.Group();
  const build = (w, col, yy, grow) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    const px = -dz, pz = dx;
    const headL = w * 2.6, headW = w * 1.35;
    const sx = x0 - dx * grow, sz = z0 - dz * grow;
    const ex = x1 + dx * grow * 1.6, ez = z1 + dz * grow * 1.6;
    const bx = x1 - dx * headL, bz = z1 - dz * headL;
    const v = [
      sx + px * w / 2, yy, sz + pz * w / 2, sx - px * w / 2, yy, sz - pz * w / 2, bx - px * w / 2, yy, bz - pz * w / 2,
      sx + px * w / 2, yy, sz + pz * w / 2, bx - px * w / 2, yy, bz - pz * w / 2, bx + px * w / 2, yy, bz + pz * w / 2,
      bx + px * headW, yy, bz + pz * headW, bx - px * headW, yy, bz - pz * headW, ex, yy, ez,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true }));
    group.add(mesh);
  };
  if (outline) build(width + width * 0.5, outline, y - 0.005, width * 0.25);
  build(width, color, y, 0);
  return group;
}

function buildLabelAtlas() {
  const cw = 128, ch = 64;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * cw;
  canvas.height = ATLAS_ROWS * ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  const cell = (i) => [(i % ATLAS_COLS) * cw, Math.floor(i / ATLAS_COLS) * ch];
  ctx.textAlign = 'center';
  ctx.font = '600 52px Inter, "Helvetica Neue", Arial, sans-serif';
  ELEMENTS.forEach(([sym], z) => {
    const [x, y] = cell(z);
    ctx.fillText(sym, x + cw / 2, y + ch / 2 + 3, cw - 8);
  });
  ctx.textAlign = 'left';
  ctx.font = '500 46px Inter, "Helvetica Neue", Arial, sans-serif';
  for (let a = 1; a < ATLAS_COLS * ATLAS_ROWS - MASS_OFFSET; a++) {
    const [x, y] = cell(MASS_OFFSET + a);
    ctx.fillText(String(a), x + 4, y + ch / 2 + 3, cw - 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  return tex;
}

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute vec2 aLabel;
  attribute float aEmph;
  attribute float aGlow;
  attribute float aIsland;
  uniform float uLabelNear;
  uniform float uLabelFar;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec2 vLocal;
  varying vec2 vLabel;
  varying float vEmph;
  varying float vLabelA;
  varying float vWorldY;
  varying vec3 vWorld;
  varying float vGlow;
  varying float vIsland;
  void main() {
    vGlow = aGlow;
    vIsland = aIsland;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vColor = aColor;
    vNormal = normal;
    vLocal = position.xz;
    vLabel = aLabel;
    vEmph = aEmph;
    vWorldY = wp.y;
    vLabelA = 1.0 - smoothstep(uLabelNear, uLabelFar, distance(cameraPosition, wp.xyz));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uLightDir;
  uniform vec3 uBg;
  uniform float uFocus;
  uniform float uTime;
  uniform float uLabels;
  uniform vec3 uTarget;
  uniform float uXray;
  uniform float uGlow;
  uniform float uIsland;
  uniform vec3 uSpot; // (N, -Z, radius) around ²⁷⁸Nh, where LABEL_ONLY draws the labels again
  varying float vGlow;
  varying float vIsland;
  varying vec3 vWorld;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec2 vLocal;
  varying vec2 vLabel;
  varying float vEmph;
  varying float vLabelA;
  varying float vWorldY;

  float cellSample(float idx, vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
    float col = mod(idx, ${ATLAS_COLS}.0);
    float row = floor(idx / ${ATLAS_COLS}.0);
    vec2 a = vec2((col + uv.x) / ${ATLAS_COLS}.0, 1.0 - (row + uv.y) / ${ATLAS_ROWS}.0);
    return texture2D(uAtlas, a).r;
  }

  // 4x4 ordered dither in [0, 1): screen-door transparency needs no depth sorting
  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

  vec3 emphColor(float e) {
    if (e < 1.5) return vec3(1.0, 0.18, 0.22);   // selected
    if (e < 2.5) return vec3(1.0, 0.55, 0.05);   // direct daughter
    if (e < 3.5) return vec3(1.0, 0.78, 0.25);   // chain member
    if (e < 4.5) return vec3(0.25, 0.55, 1.0);   // parent
    if (e < 5.5) return vec3(0.15, 0.75, 0.3);   // fission fragment region
    return vec3(1.0, 1.0, 1.0);                  // hover (while something is pinned)
  }

  void main() {
    vec3 n = normalize(vNormal);
    bool top = n.y > 0.5;
    vec3 base = vColor;
    float glow = vGlow * uGlow;
    if (glow > 0.0) base = mix(base, vec3(0.1, 0.72, 1.0), 0.55 * glow); // Nihonium: lit in light blue
    // island of stability: lit green, more where the shells bind more
    float isl = vIsland * uIsland;
    if (isl > 0.0) base = mix(base, vec3(0.18, 0.8, 0.32), 0.55 * isl);
  #ifdef LABEL_ONLY
    // only the ink of the labels on the box tops near ²⁷⁸Nh (not its own, which has a label of its own), drawn
    // after the light that would wash them out
    float d = length(vWorld.xz - uSpot.xy);
    if (!top || uLabels < 0.5 || vLabelA < 0.01 || d > uSpot.z || d < 0.6) discard;
    if (uXray > 0.0 && vEmph < 0.5) {
      vec3 ct0 = uTarget - cameraPosition;
      float t0 = dot(vWorld - cameraPosition, ct0) / dot(ct0, ct0);
      if (bayer4(gl_FragCoord.xy) >= 1.0 - 0.78 * uXray * (1.0 - smoothstep(0.35, 0.5, t0))) discard;
    }
    vec2 uv0 = vec2(vLocal.x + 0.5, vLocal.y + 0.5);
    float ink0 = max(cellSample(vLabel.y, vec2((uv0.x - 0.08) / 0.48, (uv0.y - 0.10) / 0.24)),
                     cellSample(vLabel.x, vec2((uv0.x - 0.06) / 0.88, (uv0.y - 0.33) / 0.44))) * vLabelA;
    if (ink0 < 0.02) discard;
    gl_FragColor = vec4(dot(base, vec3(0.299, 0.587, 0.114)) > 0.42 ? vec3(0.07) : vec3(0.96), ink0 * 0.92);
    return;
  #endif
    float lambert = max(dot(n, normalize(uLightDir)), 0.0);
    vec3 col = base * (0.62 + 0.42 * lambert);
    if (!top) {
      // soft contact shadow toward the floor
      col *= mix(0.55, 1.0, smoothstep(0.0, 1.6, vWorldY));
    } else {
      vec2 e2 = abs(vLocal) * 2.0;
      float edge = max(e2.x, e2.y);
      col *= 1.0 - 0.16 * smoothstep(0.80, 1.0, edge);
      if (uLabels > 0.5 && vLabelA > 0.01) {
        vec2 uv = vec2(vLocal.x + 0.5, vLocal.y + 0.5); // y grows toward the viewer (low Z)
        float m = cellSample(vLabel.y, vec2((uv.x - 0.08) / 0.48, (uv.y - 0.10) / 0.24));
        float s = cellSample(vLabel.x, vec2((uv.x - 0.06) / 0.88, (uv.y - 0.33) / 0.44));
        float ink = max(m, s) * vLabelA;
        float lum = dot(base, vec3(0.299, 0.587, 0.114));
        vec3 inkCol = lum > 0.42 ? vec3(0.07) : vec3(0.96);
        col = mix(col, inkCol, ink * 0.92);
      }
    }
    float emph = vEmph;
    // boxes closer to the camera than about half-way to the orbit target block the view: thin them out
    // (same rule as xrayFade() on the JS side)
    if (uXray > 0.0 && emph < 0.5) {
      vec3 ct = uTarget - cameraPosition;
      float t = dot(vWorld - cameraPosition, ct) / dot(ct, ct);
      float fade = uXray * (1.0 - smoothstep(0.35, 0.5, t));
      if (bayer4(gl_FragCoord.xy) >= 1.0 - 0.78 * fade) discard;
    }
    if (emph > 0.5) {
      vec3 ec = emphColor(emph);
      if (top) {
        vec2 e2 = abs(vLocal) * 2.0;
        float edge = max(e2.x, e2.y);
        col = mix(col, ec, smoothstep(0.66, 0.74, edge));
        // dark rim so the ring stays visible on boxes of the same color
        col = mix(col, vec3(0.08), smoothstep(0.90, 0.96, edge) * 0.85);
      } else {
        col = mix(col, ec, 0.35);
      }
      if (emph < 1.5) col += 0.12 * (0.5 + 0.5 * sin(uTime * 5.0));
    } else {
      col = mix(col, uBg, uFocus * 0.72);
    }
    if (glow > 0.0) {
      // a bright frame on the top face, a band of light sweeping over the box and a slow breathing
      float k = glow * (1.0 - uFocus * 0.7);
      vec2 g2 = abs(vLocal) * 2.0;
      float rim = top ? smoothstep(0.8, 0.94, max(g2.x, g2.y)) : 0.0;
      col = mix(col, vec3(0.8, 1.0, 1.0), rim * k);
      float s = fract((vWorld.x - vWorld.z + vWorldY * 0.7) * 0.11 - uTime * 0.32);
      float band = exp(-pow((s - 0.5) * 14.0, 2.0));
      col += k * (vec3(0.7, 0.97, 1.0) * band * 1.4 + vec3(0.1, 0.32, 0.48) * (0.5 + 0.5 * sin(uTime * 2.4)));
    }
    if (isl > 0.0) {
      // a slow wave of light across the island, and a gentle breathing
      float s2 = fract((vWorld.x + vWorld.z * 0.6 + vWorldY * 0.5) * 0.09 + uTime * 0.25);
      float band2 = exp(-pow((s2 - 0.5) * 12.0, 2.0));
      col += isl * (1.0 - uFocus * 0.7) * (vec3(0.55, 1.0, 0.6) * band2 * 0.6 + vec3(0.05, 0.22, 0.06) * (0.6 + 0.4 * sin(uTime * 1.7)));
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class NuclideChart {
  constructor(scene, nuclides) {
    this.scene = scene;
    this.nuclides = nuclides;
    this.count = nuclides.length;
    this.heightMode = 'meA'; // mass per nucleon, as on RIKEN's LEGO chart; 'flat' while the 2D mode draws flat boxes
    this.metric3d = 'meA'; // the height quantity of the 3D view, kept while flat (for colours, sound and the timeline)
    this.heightScale = 1; // vertical exaggeration from the slider
    this.showNormal = true; // ordinary nuclei shown (the "核の種類" check box)
    this.baseValue = 0; // value of the height quantity that sits at the board surface (base-plane slider)
    this.hyper = false; // hypernucleus mode: every nucleus becomes a cube on the S = 0 layer
    this.colorMode = 'lego';
    this.theme = 'light';
    this.yearLimit = 9999;
    this.shift = 0;
    this.showUnobserved = true;
    this.showUnbound = false; // unobserved nuclides that NUBASE estimates to be unbound (flag ub)
    this.heightCut = Infinity; // "tallest first" timeline: nuclides whose height quantity is above this are hidden
    this.labelName = true; // row labels at the proton-rich end: element name and/or atomic number
    this.labelZ = true;
    this.hiddenLego = new Set(); // classes of the LEGO chart legend switched off in the 表示 section
    this.islandOn = false; // the island of stability is shown (with the predicted nuclei of elements 119–126)
    this.filter = 'all'; // display mode: all / riken / fp / llfp / ma / fuel
    this.filterFn = null; // which nuclides the mode shows (riken uses its own year below)
    this.riken = new Set(); // indices of nuclides first identified at RIKEN
    this.cur = new Float32Array(this.count);    // animated heights
    this.target = new Float32Array(this.count); // target heights
    this.visible = new Uint8Array(this.count).fill(1);
    this.animating = true;

    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.colors = new Float32Array(this.count * 3);
    this.emph = new Float32Array(this.count);
    this.glow = new Float32Array(this.count);
    this.island = new Float32Array(this.count);
    const labels = new Float32Array(this.count * 2);
    nuclides.forEach((nuc, i) => {
      labels[2 * i] = nuc.z;
      labels[2 * i + 1] = MASS_OFFSET + nuc.a;
    });
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.colors, 3));
    geo.setAttribute('aLabel', new THREE.InstancedBufferAttribute(labels, 2));
    geo.setAttribute('aEmph', new THREE.InstancedBufferAttribute(this.emph, 1));
    geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(this.glow, 1));
    geo.setAttribute('aIsland', new THREE.InstancedBufferAttribute(this.island, 1));

    this.uniforms = {
      uAtlas: { value: buildLabelAtlas() },
      uLightDir: { value: new THREE.Vector3(0.45, 1.0, 0.75).normalize() },
      uBg: { value: new THREE.Color('#f6f5f1') },
      uFocus: { value: 0 },
      uTime: { value: 0 },
      uLabels: { value: 1 },
      uLabelNear: { value: 28 },
      uLabelFar: { value: 75 },
      uTarget: { value: new THREE.Vector3() },
      uXray: { value: 1 },
      uGlow: { value: 0 },
      uIsland: { value: 0 },
      uSpot: { value: new THREE.Vector3() },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.count);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    // the same boxes again, drawing only the labels near ²⁷⁸Nh over its light (uSpot, set by nihonium.js)
    this.labelsOver = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
      vertexShader, fragmentShader, uniforms: this.uniforms, defines: { LABEL_ONLY: 1 }, transparent: true, depthWrite: false,
    }), this.count);
    this.labelsOver.instanceMatrix = this.mesh.instanceMatrix;
    this.labelsOver.frustumCulled = false;
    this.labelsOver.renderOrder = 6;
    scene.add(this.labelsOver);

    this.guides = new THREE.Group();
    scene.add(this.guides);
    this.elementLabels = [];
    this.columnLabels = [];

    // chart edges: the proton-rich end of each row (Z -> min N) and the neutron-rich end of each column (N -> min Z)
    this.rowStart = new Map();
    this.colStart = new Map();
    for (const nuc of nuclides) {
      if (!this.rowStart.has(nuc.z) || nuc.n < this.rowStart.get(nuc.z)) this.rowStart.set(nuc.z, nuc.n);
      if (!this.colStart.has(nuc.n) || nuc.z < this.colStart.get(nuc.n)) this.colStart.set(nuc.n, nuc.z);
    }
    this.localAlpha = 0;
    this.localAnchor = null;
    // (Z, N) grid for occlusion tests (see blocked)
    this.grid = { w: 210, h: 130 };
    this.cellIndex = new Int32Array(this.grid.w * this.grid.h).fill(-1); // (Z, N) cell -> nuclide index
    nuclides.forEach((nuc, i) => {
      if (nuc.n < this.grid.w && nuc.z < this.grid.h) this.cellIndex[nuc.z * this.grid.w + nuc.n] = i;
    });

    this.recolor();
    this.retarget(true);
  }

  // ---------- heights / visibility ----------
  isShown(i) {
    if (!this.showNormal) return false;
    const nuc = this.nuclides[i];
    if (this.hiddenLego.size && this.hiddenLego.has(legoKey(nuc))) return false;
    if (nuc.isl && !this.islandOn) return false;
    if (this.filter === 'riken') return this.riken.has(i) && nuc.rk <= this.yearLimit;
    if (this.filterFn && !this.filterFn(nuc)) return false;
    if (nuc.ub && !this.showUnbound) return false;
    if (!nuc.y ? !(this.showUnobserved && this.yearLimit >= 9999) : nuc.y > this.yearLimit) return false;
    if (this.heightCut < Infinity) {
      const v = METRICS[this.cutMetric()].value(nuc);
      if (v === null || v > this.heightCut) return false;
    }
    return true;
  }

  /** the quantity the "tallest first" timeline removes by: the height, or mass per nucleon while flat (2D) */
  cutMetric() {
    return this.heightMode === 'flat' ? this.metric3d : this.heightMode;
  }

  /** whether a box (at its final height) stands between point p and the eye */
  blocked(p, eye) {
    const { w, h } = this.grid;
    const dx = eye.x - p.x, dy = eye.y - p.y, dz = eye.z - p.z;
    const len = Math.hypot(dx, dy, dz);
    if (dy <= 0) return true;
    for (let t = 0.25; t < len; t += 0.25) {
      const py = p.y + (dy / len) * t;
      if (py > this.targetMax) return false;
      const px = p.x + (dx / len) * t, pz = -(p.z + (dz / len) * t);
      const n = Math.round(px), z = Math.round(pz);
      if (n < 0 || z < 0 || n >= w || z >= h || Math.abs(px - n) > 0.44 || Math.abs(pz - z) > 0.44) continue;
      const i = this.cellIndex[z * w + n];
      if (i >= 0 && this.visible[i] && py < this.target[i] - this.shift) return true;
    }
    return false;
  }

  retarget(snap = false) {
    const metric = METRICS[this.heightMode];
    for (let i = 0; i < this.count; i++) {
      const shown = this.isShown(i);
      this.visible[i] = shown ? 1 : 0;
      const h = this.hyper ? FOOT : metric.height(this.nuclides[i]) * (this.heightMode === 'flat' ? 1 : HEIGHT_GAIN * this.heightScale);
      this.target[i] = shown ? h : 0;
      if (snap) this.cur[i] = 0;
    }
    this.shift = this.baseShift();
    this.targetMax = this.target.reduce((m, v) => Math.max(m, v), 0) - this.shift;
    // in the flat (2D) mode the magic-number lines are drawn on top of the boxes
    if (this.magicLines) this.magicLines.position.y = this.dripLines.position.y = this.magicLineY();
    this.animating = true;
  }

  // with flat boxes (2D, cubes) the magic-number lines are drawn on top of them
  magicLineY() {
    return this.hyper ? FOOT + 0.03 : this.heightMode === 'flat' ? 0.33 : 0;
  }

  /** how far the bars are sunk into the board (world units) for the base-plane slider */
  baseShift() {
    const base = METRICS[this.heightMode].base;
    return base && !this.hyper ? this.baseValue * base.k * HEIGHT_GAIN * this.heightScale : 0;
  }
  /** length above the board of nucleus i's column in the 3D view with height quantity `mode`, whatever is drawn now */
  columnLength(i, mode) {
    const metric = METRICS[mode], base = metric.base;
    const k = HEIGHT_GAIN * this.heightScale;
    return metric.height(this.nuclides[i]) * k - (base ? this.baseValue * base.k * k : 0);
  }

  // heights of the visible tops above the board (negative when a bar is sunk below it)
  heightOf(i) {
    return this.cur[i] - this.shift;
  }
  targetHeightOf(i) {
    return this.target[i] - this.shift;
  }

  /** advances the height animation; returns true while still moving */
  update(dt, time) {
    this.uniforms.uTime.value = time;
    if (!this.animating) return false;
    const k = 1 - Math.exp(-dt * 7);
    const m = new THREE.Matrix4();
    let moving = false;
    for (let i = 0; i < this.count; i++) {
      let h = this.cur[i];
      const t = this.target[i];
      if (Math.abs(t - h) > 0.002) {
        h += (t - h) * k;
        moving = true;
      } else h = t;
      this.cur[i] = h;
      const nuc = this.nuclides[i];
      const s = this.visible[i] || h > 0.01 ? FOOT : 0;
      m.makeScale(s, Math.max(h, 0.0001), s);
      m.setPosition(nuc.n, -this.shift, -nuc.z);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.boundingSphere = null;
    this.mesh.boundingBox = null;
    this.animating = moving;
    return moving;
  }

  // ---------- colors ----------
  colorOf(nuc) {
    if (this.colorMode === 'lego') return legoColor(nuc, this.theme);
    const cat = primaryCategory(nuc);
    if (this.colorMode === 'decay' || cat === 'un') {
      const c = CATEGORIES[cat];
      return hexToRgb(this.theme === 'dark' ? c.dark : c.light);
    }
    if (this.colorMode === 'hl') return halfLifeColor(nuc);
    if (this.colorMode === 'group') {
      const g = FUEL_GROUPS[nuc.fuel] || (Math.max(nuc.fyc || 0, nuc.fyi || 0) >= 1e-8 ? FUEL_GROUPS.fp : null);
      return hexToRgb(g ? g.color : CATEGORIES.un[this.theme]);
    }
    const metric = METRICS[this.colorMode === 'height' ? this.metric3d : this.colorMode];
    const v = metric.value(nuc);
    if (v === null) return hexToRgb(CATEGORIES.un[this.theme]);
    const [lo, hi] = metric.range;
    return viridis((v - lo) / (hi - lo));
  }

  recolor() {
    this.nuclides.forEach((nuc, i) => this.colors.set(this.colorOf(nuc), i * 3));
    this.mesh.geometry.attributes.aColor.needsUpdate = true;
  }

  /** share of a box surface point that the near-camera fade removes (same rule as the shader) */
  xrayFade(p, camera) {
    const c = camera.position;
    const ct = this.uniforms.uTarget.value.clone().sub(c);
    const t = p.clone().sub(c).dot(ct) / ct.lengthSq();
    const k = Math.min(1, Math.max(0, (t - 0.35) / 0.15));
    return this.uniforms.uXray.value * (1 - k * k * (3 - 2 * k)) * 0.78;
  }

  /** boxes lit with a shimmer (the Nihonium highlight); strength 0..1 */
  setGlow(indices, strength) {
    this.glow.fill(0);
    for (const i of indices) this.glow[i] = 1;
    this.mesh.geometry.attributes.aGlow.needsUpdate = true;
    this.uniforms.uGlow.value = strength;
  }

  /** tints boxes by how deep they lie in the island of stability (0..1 per nucleus); strength 0 hides the tint */
  setIsland(depth, strength) {
    this.island.set(depth);
    this.mesh.geometry.attributes.aIsland.needsUpdate = true;
    this.uniforms.uIsland.value = strength;
  }

  setEmphasis(map) {
    this.emph.fill(0);
    for (const [i, e] of map) this.emph[i] = e;
    this.mesh.geometry.attributes.aEmph.needsUpdate = true;
  }

  // ---------- floor, grid, guides ----------
  buildGuides(theme) {
    this.guides.clear();
    // the board itself goes straight into the group; the axes and everything drawn on the board in their own groups,
    // so the tutorial can start from the bare board (setGuideMask)
    const parts = (this.guideParts = { nAxis: new THREE.Group(), zAxis: new THREE.Group(), extras: new THREE.Group() });
    this.guides.add(parts.nAxis, parts.zAxis, parts.extras);
    let g = this.guides;
    const dark = theme === 'dark';
    const C = GUIDE[dark ? 'dark' : 'light'];
    const maxN = 200, maxZ = 120; // the predicted (KTUY) nuclides reach N = 200

    // baseplate in a black frame; studs sit at integer (N, Z) cell centers
    const x0 = -24, x1 = 208, z0 = -127, z1 = 15;
    const W = x1 - x0, H = z1 - z0;
    const tex = studTexture(C);
    tex.repeat.set(W, H);
    tex.offset.set(0.5, 0.5);
    // the frame is drawn first without depth and the plate over it, so the two never z-fight from far away;
    // the plate's depth is pushed back so grid lines and boxes always win against it
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({
      map: tex, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((x0 + x1) / 2, -0.02, (z0 + z1) / 2);
    floor.renderOrder = -1;
    g.add(floor);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(W + 5, H + 5), new THREE.MeshBasicMaterial({ color: C.frame, depthWrite: false }));
    frame.rotation.x = -Math.PI / 2;
    frame.position.set((x0 + x1) / 2, -0.06, (z0 + z1) / 2);
    frame.renderOrder = -2;
    g.add(frame);

    const grid = [];
    for (let n = 0; n <= maxN; n += 10) grid.push(n - 0.5, 0, 1.5, n - 0.5, 0, -maxZ - 0.5);
    for (let z = 0; z <= maxZ; z += 10) grid.push(-1.5, 0, -z + 0.5, maxN + 0.5, 0, -z + 0.5);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    g.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: C.grid })));

    // magic numbers: double lines bracketing the magic row / column, like on printed charts
    const magicPts = [];
    const span = (sel, val) => {
      const vals = this.nuclides.filter(sel).map(val);
      return [Math.min(...vals), Math.max(...vals)];
    };
    const extent = {
      N: MAGIC.map((m) => span((x) => x.n === m, (x) => x.z)),
      Z: MAGIC.map((m) => span((x) => x.z === m, (x) => x.n)),
    };
    const hasN = (k) => Number.isFinite(extent.N[k][0]);
    const hasZ = (k) => Number.isFinite(extent.Z[k][0]);
    MAGIC.forEach((m, k) => {
      if (hasN(k)) {
        const [z0, z1] = extent.N[k];
        for (const d of [-0.5, 0.5]) magicPts.push(m + d, 0.01, -z0 + 1.5, m + d, 0.01, -z1 - 1.5);
      }
      if (hasZ(k)) {
        const [n0, n1] = extent.Z[k];
        for (const d of [-0.5, 0.5]) magicPts.push(n0 - 1.5, 0.01, -(m + d), n1 + 1.5, 0.01, -(m + d));
      }
    });
    g = parts.extras;
    const magicGeo = new THREE.BufferGeometry();
    magicGeo.setAttribute('position', new THREE.Float32BufferAttribute(magicPts, 3));
    this.magicLines = new THREE.LineSegments(magicGeo, new THREE.LineBasicMaterial({ color: C.magicLine }));
    this.magicLines.position.y = this.magicLineY();
    g.add(this.magicLines);
    this.magicLabels = new THREE.Group();
    MAGIC.forEach((m, k) => {
      if (hasN(k)) {
        const sN = makeTextSprite(`N=${m}`, { color: C.magic, size: 1.1, weight: 700 });
        sN.position.set(m, 0.6, -extent.N[k][0] + 3.2);
        this.magicLabels.add(sN);
      }
      if (hasZ(k)) {
        const sZ = makeTextSprite(`Z=${m}`, { color: C.magic, size: 1.1, weight: 700 });
        sZ.position.set(extent.Z[k][1] + 4.5, 0.6, -m);
        this.magicLabels.add(sZ);
      }
    });
    g.add(this.magicLabels);

    // axes: a yellow N arrow along the front edge and a red Z arrow along the left edge, ticks every 10, magic numbers in green
    parts.nAxis.add(flatArrow([-1.5, 6.5], [206, 6.5], 0.6, C.nAxis, C.outline));
    parts.zAxis.add(flatArrow([-13.5, 2], [-13.5, -124], 0.6, C.zAxis, C.outline));
    this.axisTicksN = [];
    this.axisTicksZ = [];
    const tick = (v, magic) => makeTextSprite(String(v), magic
      ? { color: C.magic, size: 1.45, weight: 700 }
      : { color: C.tick, size: 1.15, weight: 500 });
    const nTicks = new Set([...Array(21).keys()].map((k) => k * 10).concat(MAGIC));
    for (const n of nTicks) {
      const s = tick(n, MAGIC.includes(n));
      s.position.set(n, 0.45, 3.4);
      parts.nAxis.add(s);
      this.axisTicksN.push(s.position);
    }
    const zTicks = new Set([...Array(13).keys()].map((k) => k * 10).concat(MAGIC.filter((m) => m <= 120)));
    for (const z of zTicks) {
      const s = tick(z, MAGIC.includes(z));
      s.position.set(-9.5, 0.45, -z);
      parts.zAxis.add(s);
      this.axisTicksZ.push(s.position);
    }
    const nAxis = makeTextSprite('中性子数 N', { color: C.nAxis, size: 3.0, weight: 700, stroke: C.outline });
    nAxis.position.set(100, 0.9, 10.5);
    parts.nAxis.add(nAxis);
    const zAxis = makeTextSprite('陽子数 Z', { color: C.zAxis, size: 3.0, weight: 700, stroke: C.outline });
    zAxis.position.set(-19, 0.9, -64);
    parts.zAxis.add(zAxis);
    // larger names inside the chart, in its empty lower right and upper left (the tutorial's flat steps)
    const nInside = makeTextSprite('中性子数 N →', { color: C.nAxis, size: 7, weight: 700, stroke: C.outline });
    nInside.position.set(150, 0.9, -12);
    parts.nAxis.add(nInside);
    const zInside = makeTextSprite('↑ 陽子数 Z', { color: C.zAxis, size: 7, weight: 700, stroke: C.outline });
    zInside.position.set(24, 0.9, -104);
    parts.zAxis.add(zInside);
    this.axisNames = { outside: [nAxis, zAxis], inside: [nInside, zInside] };

    this.dripLines = buildDripLines(C);
    this.dripLines.position.y = this.magicLineY();
    g.add(this.dripLines);

    this.guideColors = C;
    this.elementLabels = [];
    this.buildElementLabels();
    // neutron numbers at the neutron-rich end of each column (shown when zoomed in)
    this.columnLabels = [];
    for (const [n, z] of this.colStart) {
      const s = makeTextSprite(`N=${n}`, { color: MAGIC.includes(n) ? C.magic : C.column, size: 0.42, weight: 700 });
      s.position.set(n, 0.4, -z + 1.0);
      g.add(s);
      this.columnLabels.push(s);
    }

    // small N/Z axis gizmo placed beside a drip line when the main axes are out of view
    const ax = new THREE.Group();
    ax.add(flatArrow([0, 0], [1, 0], 0.09, C.nAxis, null, 0.03));
    ax.add(flatArrow([0, 0], [0, -1], 0.09, C.zAxis, null, 0.03));
    const ln = makeTextSprite('中性子数 N', { color: C.nAxis, size: 0.2, weight: 700, anchor: 'left', stroke: C.outline });
    ln.position.set(1.1, 0.06, 0);
    const lz = makeTextSprite('陽子数 Z', { color: C.zAxis, size: 0.2, weight: 700, anchor: 'left', stroke: C.outline });
    lz.position.set(0.12, 0.06, -1.0);
    for (const s of [ln, lz]) {
      s.material.depthTest = false;
      s.renderOrder = 8;
      ax.add(s);
    }
    ax.visible = false;
    this.localAxes = ax;
    this.localMats = [];
    ax.traverse((o) => o.material && this.localMats.push(o.material));
    this.localAlpha = 0;
    g.add(ax);
    this.setAxisNamesInside(!!this.axisNamesInside);
    this.setGuideMask(this.guideMask);
  }

  /** names the axes inside the chart in larger letters (the tutorial, while the chart is flat) */
  setAxisNamesInside(on) {
    this.axisNamesInside = on;
    for (const s of this.axisNames.outside) s.visible = !on;
    for (const s of this.axisNames.inside) s.visible = on;
  }

  /** opacity of each guide part for the tutorial: { nAxis, zAxis, extras } from 0 to 1 (null: everything shown) */
  setGuideMask(mask) {
    this.guideMask = mask;
    for (const [key, group] of Object.entries(this.guideParts)) {
      const a = mask?.[key] ?? 1;
      group.visible = a > 0.01;
      // the axes fade; what is drawn on the board (labels with their own fade) only comes and goes
      if (key !== 'extras') group.traverse((o) => o.material && (o.material.opacity = a));
    }
  }

  /** element name and/or atomic number at the proton-rich end of each isotope row */
  buildElementLabels() {
    for (const s of this.elementLabels) {
      s.removeFromParent();
      s.material.dispose();
    }
    this.elementLabels = [];
    if (!this.labelName && !this.labelZ) return;
    // Japanese names; the rows of elements not yet discovered only while the island of stability is shown
    ELEMENTS.forEach(([, , name], z) => {
      if (!this.rowStart.has(z) || (z > 118 && !this.islandOn)) return;
      const text = [this.labelName ? name : '', this.labelZ ? `Z=${z}` : ''].filter(Boolean).join('  ');
      const s = makeTextSprite(text, { color: this.guideColors.element, size: 0.85, weight: 600, anchor: 'right' });
      s.position.set(this.rowStart.get(z) - 0.9, 0.55, -z);
      s.userData.z = z;
      this.guideParts.extras.add(s);
      this.elementLabels.push(s);
    });
  }

  updateLabelLod(camera) {
    for (const s of this.elementLabels) {
      const d = camera.position.distanceTo(s.position);
      const z = s.userData.z;
      const major = z % 10 === 0 || MAGIC.includes(z);
      const a = d < 55 ? 1 : major ? Math.max(0, 1 - (d - 260) / 80) : Math.max(0, 1 - (d - 55) / 30);
      s.material.opacity = a;
      s.visible = s.userData.enabled !== false && a > 0.02;
    }
    for (const s of this.columnLabels) {
      const a = Math.max(0, Math.min(1, 1 - (camera.position.distanceTo(s.position) - 30) / 12));
      s.material.opacity = a;
      s.visible = s.userData.enabled !== false && a > 0.02;
    }
  }

  /**
   * When zoomed in so far that the main N/Z axes are out of view, places a small axis gizmo
   * in the empty space just outside a drip line (the chart edge) near the middle of the view.
   * `safe` is the part of the canvas not covered by panels, in CSS pixels.
   */
  updateLocalAxes(camera, W, H, safe, dt) {
    const ax = this.localAxes;
    if (!ax) return;
    const v = new THREE.Vector3();
    const screen = (x, y, z) => {
      v.set(x, y, z).project(camera);
      if (v.z > 1 || v.z < -1) return null;
      return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
    };
    const inside = (p, m = 0) => p && p[0] >= safe.l + m && p[0] <= safe.r - m && p[1] >= safe.t + m && p[1] <= safe.b - m;
    const seen = (pts) => pts.reduce((c, p) => c + (inside(screen(p.x, p.y, p.z)) ? 1 : 0), 0);
    const need = seen(this.axisTicksN) < 2 || seen(this.axisTicksZ) < 2;

    const cam = camera.position;
    const hidden = (x, y, z) => this.blocked(v.set(x, y, z), cam);

    let target = 0;
    if (need) {
      const cx = (safe.l + safe.r) / 2, cy = (safe.t + safe.b) / 2;
      const cands = [];
      const consider = (side, key, edgeX, edgeZ) => {
        const L = THREE.MathUtils.clamp(camera.position.distanceTo(v.set(edgeX, 0, edgeZ)) * 0.085, 1.6, 14);
        // neutron side: gizmo in front of the column end; proton side: left of the row start
        const ox = side === 'n' ? edgeX + 0.6 : edgeX - 0.9 - L;
        const oz = side === 'n' ? edgeZ + 0.9 + L : edgeZ - 0.6;
        const o = screen(ox, 0, oz), e1 = screen(ox + L * 2.2, 0, oz), e2 = screen(ox + L * 0.9, 0, oz - L * 1.1); // incl. labels
        if (!inside(o, 24) || !inside(e1, 12) || !inside(e2, 12)) return;
        const c = screen(ox + L / 2, 0, oz - L / 2);
        let score = Math.hypot(c[0] - cx, c[1] - cy) * (side === 'p' ? 1.2 : 1);
        if (this.localAnchor && this.localAnchor.side === side && this.localAnchor.key === key) score *= 0.75; // stickiness
        cands.push({ side, key, score, ox, oz, L });
      };
      for (const [n, z] of this.colStart) consider('n', n, n, -z);
      for (const [z, n] of this.rowStart) consider('p', z, n, -z);
      cands.sort((a, b) => a.score - b.score);
      // nearest-to-center spot whose origin and both arrow tips are in plain view
      const best = cands.slice(0, 12).find((c) => !hidden(c.ox, 0.05, c.oz) && !hidden(c.ox + c.L, 0.05, c.oz) && !hidden(c.ox, 0.05, c.oz - c.L));
      if (best) {
        target = 1;
        const jump = !this.localAnchor || ax.position.distanceTo(v.set(best.ox, 0, best.oz)) > best.L * 3 || this.localAlpha < 0.05;
        const k = jump ? 1 : 1 - Math.exp(-dt * 10);
        ax.position.x += (best.ox - ax.position.x) * k;
        ax.position.z += (best.oz - ax.position.z) * k;
        ax.position.y = 0;
        ax.scale.setScalar(ax.scale.x + (best.L - ax.scale.x) * k);
        this.localAnchor = best;
      }
    }
    this.localAlpha += (target - this.localAlpha) * (1 - Math.exp(-dt * 9));
    if (target === 0 && this.localAlpha < 0.02) this.localAnchor = null;
    ax.visible = this.localAlpha > 0.02;
    for (const m of this.localMats) m.opacity = this.localAlpha;
  }

  setTheme(theme, bgHex) {
    this.theme = theme;
    this.uniforms.uBg.value.set(bgHex);
    this.buildGuides(theme);
    this.recolor();
  }
}

// ---------- text sprites ----------
// Superscript characters come from different fonts (¹²³ are Latin-1, ⁰⁴⁻⁹ are not in the loaded subset),
// so on the canvas they are drawn as ordinary glyphs, smaller and raised.
const SUP_CHARS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻';
const SUP_BASE = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '−'];
function textRuns(text) {
  const runs = [];
  for (const ch of text) {
    const k = SUP_CHARS.indexOf(ch);
    const sup = k >= 0;
    const last = runs[runs.length - 1];
    if (last && last.sup === sup) last.t += sup ? SUP_BASE[k] : ch;
    else runs.push({ t: sup ? SUP_BASE[k] : ch, sup });
  }
  return runs;
}

const spriteCache = new Map();
export function makeTextSprite(text, { color = '#222', size = 1, weight = 500, anchor = 'center', bg = null, border = null, stroke = null } = {}) {
  const cacheKey = [text, color, weight, bg, border, stroke].join('|');
  let entry = spriteCache.get(cacheKey);
  if (!entry) {
    const px = 64;
    const family = 'Inter, "Noto Sans JP", "Helvetica Neue", Arial, sans-serif';
    const fontOf = (sup) => `${weight} ${sup ? Math.round(px * 0.64) : px}px ${family}`;
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
