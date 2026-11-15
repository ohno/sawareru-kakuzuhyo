// Where the camera stands: the view of the whole chart the page opens with (framed around the panels and bars, on
// landscape and on portrait screens), the view from straight above, the view of the hypernucleus layers, a clear
// view of one nuclide, and the flights between them. A view is { target, pos }: what the camera looks at, and from where.
import * as THREE from 'three';
import { BOARD } from './chart.js';
import { isHyper, HYPER_BASE } from './hyper.js';

const deg = THREE.MathUtils.degToRad;
const PORTRAIT = 0.85; // width / height below which a screen counts as portrait
const BOARD_CENTRE = new THREE.Vector3(86, 0, -58);
const FRAME_X = BOARD.x0 - BOARD.frame; // outer edge of the board's black frame, where the overview stands it upright
const FOCUS_OFFSET = new THREE.Vector3(-6, 17, 22); // from a nuclide to the camera that looks at it (the f key)
const CLOSE_UP = FOCUS_OFFSET.clone().multiplyScalar(0.4); // after an animation: 2.5 times as close

// What the overview keeps the chart clear of: the left panel's header (open or folded, the framing stays the
// same), the two bars at the bottom, and the tutorial's subtitles (not what the tutorial has hidden).
function overviewBlocks() {
  return ['#controls .brand', '.toolbar', '.timeline', '.tut-sub'].map((s) => document.querySelector(s))
    .filter((el) => el && !el.hidden && !el.closest('.tut-hidden'))
    .map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0);
}

/** the part of the window not covered by the floating panels: { l, r, t, b } in CSS pixels */
export function safeRect() {
  const W = window.innerWidth, H = window.innerHeight;
  const r = { l: 0, r: W, t: 0, b: H };
  // (offsetParent is always null for these position: fixed elements, so test the box itself;
  // the tutorial fades them out until they are explained, and its subtitles take the bottom)
  const box = (selector) => {
    const el = document.querySelector(selector);
    const b = el && !el.classList.contains('tut-hidden') && el.getBoundingClientRect();
    return b && b.width > 0 && b.height > 0 ? b : null;
  };
  const sub = document.querySelector('.tut-sub');
  if (sub && !sub.hidden) r.b = sub.getBoundingClientRect().top;
  const lb = box('#controls'), rb = box('#info'), tb = box('.toolbar'), yb = box('.timeline');
  if (lb && lb.width < W * 0.5 && lb.height > H * 0.3) r.l = lb.right;
  if (rb && rb.width < W * 0.5 && rb.left > W * 0.5 && rb.height > H * 0.3) r.r = rb.left;
  // folded panels are small buttons along the top edge
  for (const b of [lb, rb]) if (b && b.height <= H * 0.3 && b.top < H * 0.2) r.t = Math.max(r.t, b.bottom);
  if (rb && rb.width >= W * 0.5 && rb.top > H * 0.4) r.b = Math.min(r.b, rb.top);
  if (tb && tb.bottom < H * 0.3) r.t = tb.bottom;
  if (tb && tb.top > H * 0.6) r.b = Math.min(r.b, tb.top);
  if (yb) r.b = Math.min(r.b, yb.top);
  return r;
}

export class Views {
  /** selected(): the nuclide (or hypernucleus) id the focus view looks at, or -1 */
  constructor({ camera, controls, chart, hyper, selected }) {
    Object.assign(this, { camera, controls, chart, hyper, selected });
    this.fly = null; // the flight under way
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  // ---------- the whole chart ----------
  /**
   * The camera looks diagonally across the board, turned so that the vanishing point of lines running along Z sits
   * on a chosen screen column, and placed so that the board's left frame is exactly the floor line that projects
   * straight up from there — i.e. the frame stands upright on that column (the left edge, or a little in from it on
   * a wide screen). Among such spots it takes the one where every shown nuclide fits on screen.
   */
  overview() {
    const { camera, chart } = this, nuclides = chart.nuclides;
    const W = window.innerWidth, H = window.innerHeight;
    const tanV = Math.tan(deg(camera.fov / 2)), tanH = tanV * camera.aspect;
    const m = 14; // px margin
    const xMin = (2 * m) / W - 1, xMax = 1 - (2 * m) / W, yMin = (2 * m) / H - 1, yMax = 1 - (2 * m) / H;
    // the chart may run behind the empty corners of the screen, but not behind the bars and the panel header
    const blocks = overviewBlocks().map((b) => [
      (2 * (b.left - m)) / W - 1, (2 * (b.right + m)) / W - 1, 1 - (2 * (b.bottom + m)) / H, 1 - (2 * (b.top - m)) / H,
    ]);

    // outline of the chart: both ends of every row and column, and the tallest box of each row
    const rows = new Map(), cols = new Map();
    nuclides.forEach((nuc, i) => {
      if (!chart.visible[i]) return;
      const row = rows.get(nuc.z) || { lo: i, hi: i, top: i };
      if (nuc.n < nuclides[row.lo].n) row.lo = i;
      if (nuc.n > nuclides[row.hi].n) row.hi = i;
      if (chart.targetHeightOf(i) > chart.targetHeightOf(row.top)) row.top = i;
      rows.set(nuc.z, row);
      const col = cols.get(nuc.n) || { lo: i, hi: i };
      if (nuc.z < nuclides[col.lo].z) col.lo = i;
      if (nuc.z > nuclides[col.hi].z) col.hi = i;
      cols.set(nuc.n, col);
    });
    // (row ends at the floor and on top, the tallest box of each row on top, column ends at the floor)
    const pts = [];
    const corners = (i, y) => {
      const nuc = nuclides[i];
      pts.push([nuc.n - 0.45, y, -nuc.z + 0.45], [nuc.n + 0.45, y, -nuc.z - 0.45]);
    };
    for (const row of rows.values()) {
      for (const i of [row.lo, row.hi]) corners(i, 0), corners(i, chart.targetHeightOf(i));
      corners(row.top, chart.targetHeightOf(row.top));
    }
    for (const col of cols.values()) corners(col.lo, 0), corners(col.hi, 0);
    if (!pts.length) return { target: BOARD_CENTRE.clone(), pos: new THREE.Vector3(40, 160, 110) };
    if (camera.aspect < PORTRAIT) return this.portrait(pts, rows);
    // the strip of board between the frame and the lightest nuclei carries the element names: keep it in view too
    const zs = [...rows.keys()];
    pts.push([FRAME_X, 0, 1 - Math.min(...zs)], [FRAME_X, 0, -1 - Math.max(...zs)]);

    const P = Float64Array.from(pts.flat()), n = pts.length;
    let cx = 0, cy0 = 0, cz0 = 0;
    for (const [x, y, z] of pts) (cx += x / n), (cy0 += y / n), (cz0 += z / n);

    // The box the outline covers on screen (x and y from -1 to 1) seen from (ox, oy, oz) along f, with r to the
    // right and u up; null if a point falls off the screen or behind a bar.
    const screenBox = (ox, oy, oz, f, r, u) => {
      const fx = f.x, fy = f.y, fz = f.z, rx = r.x, ry = r.y, rz = r.z, ux = u.x, uy = u.y, uz = u.z;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < P.length; k += 3) {
        const vx = P[k] - ox, vy = P[k + 1] - oy, vz = P[k + 2] - oz;
        const d = vx * fx + vy * fy + vz * fz;
        if (d < 1) return null;
        const x = (vx * rx + vy * ry + vz * rz) / (d * tanH), y = (vx * ux + vy * uy + vz * uz) / (d * tanV);
        if (x < xMin || x > xMax || y > yMax || y < yMin) return null;
        for (const bl of blocks) if (x > bl[0] && x < bl[1] && y > bl[2] && y < bl[3]) return null;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      return { x0, x1, y0, y1 };
    };

    // For one view direction — a downward pitch, and the screen column where the frame stands upright (which fixes
    // the yaw) — find the camera height and distance where the chart covers the most of the screen.
    const solve = (pitchDeg, edge, step, around) => {
      const pitch = deg(pitchDeg);
      const yaw = Math.atan(edge * Math.cos(pitch) * tanH);
      const f = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const r = new THREE.Vector3().crossVectors(f, camera.up).normalize();
      const u = new THREE.Vector3().crossVectors(r, f);
      // ray to the bottom of the screen column x = -edge; the frame must lie in the plane of this ray and the Z axis,
      // which meets the floor at x = camera.x - camera.y * b.x / b.y
      const b = f.clone().addScaledVector(r, -edge * tanH).addScaledVector(u, -tanV);
      const camX = (cy) => FRAME_X + (cy * b.x) / b.y;
      const [y0, y1, z0, z1] = around
        ? [around.cy - 4 * step, around.cy + 4 * step, around.cz - 4 * step, around.cz + 4 * step]
        : [10, 610, -80, 640];
      let best = { a: 0, cy: around ? around.cy : 300, cz: around ? around.cz : 300, x0: -1, x1: 1 };
      for (let cy = Math.max(2, y0); cy <= y1; cy += step) for (let cz = z0; cz <= z1; cz += step) {
        const c = screenBox(camX(cy), cy, cz, f, r, u);
        const a = c ? (c.x1 - c.x0) * (c.y1 - c.y0) : 0;
        if (a > best.a) best = { a, x0: c.x0, x1: c.x1, cy, cz };
      }
      // how large the chart looks (pixels per unit at its middle), and how evenly the spare width is shared
      const depth = (cx - camX(best.cy)) * f.x + (cy0 - best.cy) * f.y + (cz0 - best.cz) * f.z;
      const scale = W / (2 * depth * tanH);
      const left = Math.min(-edge, best.x0) + 1, right = 1 - best.x1;
      const score = best.a ? scale * (1 - 0.3 * Math.abs(left - right)) : 0;
      return { ...best, score, pitchDeg, edge, pitch, f, r, u, camX };
    };
    // Candidates: steeper or lower views, with the frame at the left edge of the screen or a little in from it.
    // On a wide screen the chart (about 1.5 times as wide as tall) cannot fill the width, so the choice decides
    // where the spare width goes; a lower view is taken only when it clearly enlarges the chart.
    let best = null;
    for (const pitchDeg of [48, 40, 32]) {
      for (const frac of [0.02, 0.1, 0.18]) {
        const edge = 1 - 2 * frac;
        const s = solve(pitchDeg, edge, 15, solve(pitchDeg, edge, 60));
        if (!best || s.score > best.score * 1.03) best = s;
      }
    }
    best = solve(best.pitchDeg, best.edge, 4, best);
    best = solve(best.pitchDeg, best.edge, 1, best);
    const { f, r, u } = best;
    const pos = new THREE.Vector3(best.camX(best.cy), best.cy, best.cz);
    // On a tall screen the chart fills the width and leaves height over, and the search settles against the bars:
    // move it up or down to the middle between the panel header and the bars, as far as its outline stays clear
    const top = Math.min(yMax, ...blocks.filter((bl) => bl[3] > 0.5).map((bl) => bl[2]));
    const bottom = Math.max(yMin, ...blocks.filter((bl) => bl[2] < -0.5).map((bl) => bl[3]));
    const now = screenBox(pos.x, pos.y, pos.z, f, r, u);
    if (now && now.y1 - now.y0 < top - bottom) {
      const shift = (top + bottom) / 2 - (now.y0 + now.y1) / 2;
      const depth = (cx - pos.x) * f.x + (cy0 - pos.y) * f.y + (cz0 - pos.z) * f.z;
      for (let k = 1; k > 0.05; k /= 2) {
        const o = pos.clone().addScaledVector(u, -shift * k * depth * tanV);
        if (o.y > 2 && screenBox(o.x, o.y, o.z, f, r, u)) {
          pos.copy(o);
          break;
        }
      }
    }
    const target = pos.clone().addScaledVector(f, pos.y / Math.sin(best.pitch)); // where the view centre meets the floor
    return { target, pos };
  }

  /**
   * The overview on a portrait (phone) screen: seen from the front, the chart would be a thin strip across the
   * width. The camera stands off the front-left corner instead and looks along the chart's diagonal, light nuclei
   * near and heavy ones far, so that the chart runs up the screen and only the nuclei have to fit (the board may run
   * off the sides). Of a few turns and tilts, the one that shows the chart's floor (the area its boxes stand on)
   * largest. pts, rows: the outline of the chart, as overview() collects it.
   */
  portrait(pts, rows) {
    const nuclides = this.chart.nuclides;
    const outline = pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const zs = [...rows.keys()].sort((a, b) => a - b);
    const floor = [
      ...zs.map((z) => new THREE.Vector3(nuclides[rows.get(z).lo].n - 0.5, 0, -z)),
      ...zs.reverse().map((z) => new THREE.Vector3(nuclides[rows.get(z).hi].n + 0.5, 0, -z)),
    ];
    const cam = this.camera.clone(), v = new THREE.Vector3();
    let best = null;
    for (const yaw of [30, 38, 46, 54]) { // up to about 55°, where the diagonal is upright: light nuclei stay bottom left
      for (const pitch of [35, 45, 55]) {
        const dir = new THREE.Vector3(-Math.sin(deg(yaw)) * Math.cos(deg(pitch)), Math.sin(deg(pitch)), Math.cos(deg(yaw)) * Math.cos(deg(pitch)));
        const view = this.fitPoints(outline, dir);
        cam.position.copy(view.pos);
        cam.lookAt(view.target);
        cam.updateMatrixWorld();
        let area = 0;
        floor.forEach((p, k) => {
          v.copy(p).project(cam);
          const [x0, y0] = [v.x, v.y];
          v.copy(floor[(k + 1) % floor.length]).project(cam);
          area += x0 * v.y - v.x * y0;
        });
        area = Math.abs(area) / 2;
        if (!best || area > best.area) best = { ...view, area, yaw, pitch };
      }
    }
    return best;
  }

  /** the camera looking along -dir at the points, as close as possible with all of them inside the free screen area */
  fitPoints(pts, dir, safe = safeRect()) {
    const cam = this.camera.clone();
    const W = window.innerWidth, H = window.innerHeight, m = 16;
    const box = { x0: (2 * (safe.l + m)) / W - 1, x1: (2 * (safe.r - m)) / W - 1, y0: 1 - (2 * (safe.b - m)) / H, y1: 1 - (2 * (safe.t + m)) / H };
    const target = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
    const v = new THREE.Vector3();
    const bounds = (d) => {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
      for (const p of pts) {
        v.copy(p).project(cam);
        b.x0 = Math.min(b.x0, v.x); b.x1 = Math.max(b.x1, v.x); b.y0 = Math.min(b.y0, v.y); b.y1 = Math.max(b.y1, v.y);
      }
      return b;
    };
    const fits = (b) => b.x1 - b.x0 <= box.x1 - box.x0 && b.y1 - b.y0 <= box.y1 - box.y0;
    let d = 600;
    for (let pass = 0; pass < 2; pass++) {
      let lo = 5, hi = 2000;
      for (let k = 0; k < 26; k++) { // to 1/30000 of a unit
        const mid = (lo + hi) / 2;
        if (fits(bounds(mid))) hi = mid; else lo = mid;
      }
      d = hi;
      // slide the target so the projected points sit in the middle of the free area
      const b = bounds(d);
      const dx = (box.x0 + box.x1) / 2 - (b.x0 + b.x1) / 2, dy = (box.y0 + box.y1) / 2 - (b.y0 + b.y1) / 2;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const tanV = Math.tan(deg(cam.fov / 2));
      target.addScaledVector(right, -dx * d * tanV * cam.aspect).addScaledVector(up, -dy * d * tanV);
    }
    return { target, pos: target.clone().addScaledVector(dir, d) };
  }

  /** straight down on the middle of the board (the 2D mode), further back on a tall screen so the chart fits the width */
  top() {
    const k = Math.max(1, (1.3 / this.camera.aspect) ** 0.8);
    const target = BOARD_CENTRE.clone();
    // (a touch off the vertical, so that the board keeps its direction on screen)
    return { target, pos: new THREE.Vector3(86, 255, -57.9).sub(target).multiplyScalar(k).add(target) };
  }

  /** the whole board from straight above, in the part of the window above `bottom` (CSS pixels): the tutorial's flat steps */
  boardFromAbove(bottom) {
    const { x0, x1, z0, z1 } = BOARD;
    const corners = [[x0 - 3, z1 + 3], [x1 + 3, z1 + 3], [x1 + 3, z0 - 3], [x0 - 3, z0 - 3]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    return this.fitPoints(corners, new THREE.Vector3(0, 1, 0.0004).normalize(), { l: 0, r: window.innerWidth, t: 0, b: bottom });
  }

  /** the hypernucleus mode: from the front left and above, all three layers and the s axis in view */
  hyperLayers() {
    return this.fitPoints(this.hyper.framePoints(), new THREE.Vector3(-0.5, 0.55, 0.67).normalize());
  }

  // ---------- one nuclide ----------
  /** the view of the selected nuclide or hypernucleus (the f key), or null when nothing is selected */
  focus(id = this.selected()) {
    if (id < 0) return null;
    if (!isHyper(id)) return this.clearView(id, FOCUS_OFFSET);
    const target = this.hyper.positions[id - HYPER_BASE].clone();
    return { target, pos: target.clone().add(FOCUS_OFFSET) };
  }

  /** the view from close by that an animation ends with */
  closeUp(i) {
    return this.clearView(i, CLOSE_UP);
  }

  /**
   * Camera spot for looking at nuclide i from about `offset` (relative to its middle): the preferred direction if
   * nothing stands in front of the box top, otherwise the nearest turn around it or tilt upward that gives a clear
   * view — tall light nuclei and neighbours no longer hide the chosen block.
   */
  clearView(i, offset) {
    const { chart } = this;
    const nuc = chart.nuclides[i], h = chart.targetHeightOf(i);
    const target = new THREE.Vector3(nuc.n, h * 0.5, -nuc.z);
    const top = new THREE.Vector3(nuc.n, h + 0.05, -nuc.z);
    const s0 = new THREE.Spherical().setFromVector3(offset);
    for (const dPhi of [0, -0.2, -0.4, -0.65]) {
      for (const dTheta of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
        const sph = new THREE.Spherical(s0.radius, THREE.MathUtils.clamp(s0.phi + dPhi, 0.12, 1.4), s0.theta + dTheta);
        const pos = new THREE.Vector3().setFromSpherical(sph).add(target);
        if (!chart.blocked(top, pos)) return { target, pos };
      }
    }
    return { target, pos: target.clone().add(new THREE.Vector3(0, s0.radius, 0.01)) };
  }

  // ---------- moving the camera ----------
  /** flies to the view (null: stays) */
  flyTo(view, duration = 1.1) {
    if (!view) return;
    if (this.reduceMotion) duration = 0.01;
    const { camera, controls } = this;
    this.fly = { t: 0, duration, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: view.target, toP: view.pos };
  }

  /** stands at the view at once, ending any flight */
  jumpTo(view) {
    this.fly = null;
    this.controls.target.copy(view.target);
    this.camera.position.copy(view.pos);
  }

  /** the flight ends where it is (the viewer took over) */
  cancelFlight() {
    this.fly = null;
  }

  get flying() {
    return !!this.fly;
  }

  /** advances the flight under way */
  step(dt) {
    const fly = this.fly;
    if (!fly) return;
    fly.t = Math.min(1, fly.t + dt / fly.duration);
    const e = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2;
    this.controls.target.lerpVectors(fly.fromT, fly.toT, e);
    this.camera.position.lerpVectors(fly.fromP, fly.toP, e);
    if (fly.t >= 1) this.fly = null;
  }

  /** moves the camera along with the selection, keeping the current viewing angle where the block stays visible */
  follow(i) {
    if (isHyper(i)) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    if (offset.length() > 60) offset.setLength(60);
    this.flyTo(this.clearView(i, offset), 0.6);
  }
}
