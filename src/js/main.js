import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NuclideChart, EMPH } from './chart.js';
import { DecayGraph, DecayViz } from './decay.js';
import { METRICS, ELEMENTS, SYMBOL_TO_Z, VIRIDIS_CSS, nucText, cssRgb, inkFor, fmtSeconds, deriveFromMasses } from './nuclear.js';
import {
  detailHtml, tooltipHtml, introHtml, howtoHtml, legendHtml, hlLegendHtml, hyperTooltipHtml, hyperDetailHtml, rememberSection,
} from './panel.js';
import { HyperLayers, HYPER_BASE, isHyper, LAYER_GAP, HYPER_DRIP_SOURCES } from './hyper.js';
import { NihoniumGlow } from './nihonium.js';
import { StabilityIsland } from './island.js';
import { Tutorial } from './tutorial.js';
import { ColumnSound, cantileverHz, REF_HZ } from './sound.js';
import { RIKEN_NUCLIDES, nuclidesRequest, showLoadError } from './data.js';
import { MODES, MODE_FILTERS, MODE_CALLOUTS, FUEL_GROUPS, annotateFuel } from './fuel.js';

THREE.ColorManagement.enabled = false;

const $ = (s) => document.querySelector(s);
const THEMES = { light: { bg: '#f6f5f1' }, dark: { bg: '#0f1115' } };
// Icons: music and moon from Feather, Copyright (c) 2013-2023 Cole Bemis, MIT License; sun from Lucide,
// Copyright (c) 2026 Lucide Icons and Contributors, ISC License. See THIRD-PARTY-NOTICES.
const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON_MOON = svgIcon('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>');
// a note, and a struck-through one while muted
const ICON_NOTE = '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';
const ICON_SOUND_ON = svgIcon(ICON_NOTE);
const ICON_SOUND_OFF = svgIcon(`${ICON_NOTE}<path d="M3 3l18 18"/>`);
const ICON_SUN = svgIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>');

const state = {
  hover: -1,
  pinned: -1,
  shown: -1,
  emph: new Map(),
  theme: null,
  playing: false,
  year: 0,
  dragMode: 'rotate',
  dim: '3d', // 2D (flat, from above) or 3D
  timeMode: 'year', // the timeline: discovery years, or removing the tallest nuclides first
  cutK: 0,
  cycle: [], // checked fuel-cycle groups
  infoClosed: false, // the detail panel was closed with its × and stays away until a nucleus is selected
  melodyIdx: -1, // nucleus whose note the decay-chain melody is playing
  route: 'avoid', // decay route of the flow, the diagram highlight and the melody: 'avoid' fission, or the 'main' branch
};

// the chart opens in light mode whatever the OS or host page prefers; only the toolbar button switches it
let chosenTheme = 'light';
document.documentElement.dataset.theme = chosenTheme;

init().catch(showLoadError);

async function waitForFonts() {
  const fonts = ['600 52px Inter', '500 46px Inter', '600 64px Inter', '600 64px "Noto Sans JP"'];
  await Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);
}

async function init() {
  // predicted.json and island.json come from the KTUY05 mass table and may be absent (scripts/build.py --no-ktuy)
  const optional = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [res, pred, islandData] = await Promise.all([
    nuclidesRequest, optional('data/predicted.json'), optional('data/island.json'), waitForFonts(),
  ]);
  if (!res.ok) throw new Error(`data/nuclides.json: HTTP ${res.status}`);
  const nuclides = (await res.json()).nuclides;
  deriveFromMasses(nuclides);
  const rikenCount = addRikenDiscoveries(nuclides);
  // never observed and, by NUBASE's own estimate, not even bound (e.g. ³Li, ⁵Be, ⁶B): a separate, hidden-by-default group
  for (const nuc of nuclides) {
    if (!nuc.y && (nuc.pu || ['sn', 's2n', 'sp', 's2p'].some((k) => nuc[k] !== undefined && nuc[k] < 0))) nuc.ub = 1;
  }
  if (pred) addPredicted(nuclides, pred.nuclides);
  annotateFuel(nuclides);

  // ---------- three.js setup ----------
  const canvas = $('#scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 3000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 4;
  controls.maxDistance = 600;
  // middle-button drag pans like Ctrl+drag (and must not start the browser's auto-scroll)
  canvas.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault());

  // Touchpad: a two-finger slide pans (like a map) and a pinch zooms; a mouse wheel still zooms.
  // Browsers report both slides and wheel notches as "wheel" events: pinches carry ctrlKey (OrbitControls zooms on
  // those), wheel notches come as lines or as large whole steps (about 100), touchpad slides as small or fractional
  // pixel steps, often with a sideways part. A slide keeps counting as one for a moment so its fling isn't misread.
  let slideUntil = 0;
  const isSlide = (e) => {
    if (e.ctrlKey || e.deltaMode !== 0) return false;
    if (performance.now() < slideUntil) return true;
    return e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50;
  };
  canvas.addEventListener('wheel', (e) => {
    if (!isSlide(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // keep OrbitControls from zooming
    slideUntil = performance.now() + 250;
    fly = null;
    // move along the floor by as many world units as the slide covers on screen
    const dist = camera.position.distanceTo(controls.target);
    const perPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / window.innerHeight;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).setY(0).normalize();
    const ahead = new THREE.Vector3().crossVectors(camera.up, right).normalize();
    const move = right.multiplyScalar(e.deltaX * perPx).addScaledVector(ahead, -e.deltaY * perPx);
    camera.position.add(move);
    controls.target.add(move);
  }, { capture: true, passive: false });

  /** 'rotate': drag rotates, right/middle drag pans. 'pan': drag pans, right drag rotates. Touch: 1 finger = drag, 2 fingers = pan + pinch zoom. */
  function setDragMode(mode) {
    state.dragMode = mode;
    const pan = mode === 'pan';
    controls.mouseButtons = {
      LEFT: pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: pan ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
    };
    controls.touches = { ONE: pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    document.querySelectorAll('[data-drag]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.drag === mode)));
  }
  setDragMode('rotate');

  const chart = new NuclideChart(scene, nuclides);
  const graph = new DecayGraph(nuclides);
  const decay = new DecayViz(scene, chart, graph);
  const hyper = new HyperLayers(scene, chart);
  const nihonium = new NihoniumGlow(scene, chart);
  const island = new StabilityIsland(scene, chart, islandData?.rows);
  if (!island.available) {
    $('#opt-island').disabled = true;
    $('#opt-island').closest('label').title = '安定の島のデータ（KTUY05 質量公式）は、この版には入っていません';
  }
  // selection ids: nuclide index, or HYPER_BASE + k for hypernucleus k
  const hyperOf = (id) => hyper.list[id - HYPER_BASE];

  chart.riken = new Set(nuclides.flatMap((n, i) => (n.rk ? [i] : [])));
  const stats = {
    total: nuclides.filter((n) => !n.x && !n.p).length,
    stable: nuclides.filter((n) => n.st).length,
    unobserved: nuclides.filter((n) => !n.y).length,
    riken: rikenCount,
  };
  $('#intro').innerHTML = introHtml(stats);
  $('#howto').innerHTML = howtoHtml();
  const years = nuclides.filter((n) => n.y).map((n) => n.y);
  const rikenYears = nuclides.filter((n) => n.rk).map((n) => n.rk);
  const YEAR_MIN = Math.max(1890, Math.min(...years));
  const YEAR_MAX = 2026;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h); // also the canvas's CSS size: what is drawn lines up with the page (and the tutorial's tiles)
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // a tall, narrow screen needs the camera further back to see the whole chart (the framing above relies on it)
    controls.maxDistance = 600 * Math.max(1, 1.3 / camera.aspect);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- camera views ----------
  // whole-chart views back off on tall (portrait) screens so the chart still fits the width
  const fit = (target, pos) => {
    const k = Math.max(1, (1.3 / camera.aspect) ** 0.8);
    return { target, pos: target.clone().add(pos.sub(target).multiplyScalar(k)) };
  };
  // Overview: the camera looks diagonally across the board, turned so that the vanishing point of lines running
  // along Z sits on a chosen screen column, and placed so that the board's left frame is exactly the floor line
  // that projects straight up from there — i.e. the frame stands upright on that column (the left edge, or a little
  // in from it on a wide screen). Among such spots it takes the one where every shown nuclide fits on screen.
  const FRAME_X = -26.5; // outer edge of the black frame (see buildGuides)
  function overviewView() {
    const W = window.innerWidth, H = window.innerHeight;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
    const m = 14; // px margin
    const xMin = (2 * m) / W - 1, xMax = 1 - (2 * m) / W, yMin = (2 * m) / H - 1, yMax = 1 - (2 * m) / H;
    // the chart may run behind the empty corners of the screen, but not behind the bars and the panel header
    const blocks = overviewBlocks().map((b) => [
      (2 * (b.left - m)) / W - 1, (2 * (b.right + m)) / W - 1, 1 - (2 * (b.bottom + m)) / H, 1 - (2 * (b.top - m)) / H,
    ]);

    // outline of the chart: both ends of every row and column and the tallest box of each row, top and bottom
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
    if (!pts.length) return { target: new THREE.Vector3(86, 0, -58), pos: new THREE.Vector3(40, 160, 110) };
    // the strip of board between the frame and the lightest nuclei carries the element names: keep it in view too
    const zs = [...rows.keys()];
    pts.push([FRAME_X, 0, 1 - Math.min(...zs)], [FRAME_X, 0, -1 - Math.max(...zs)]);

    const P = Float64Array.from(pts.flat()), n = pts.length;
    let cx = 0, cy0 = 0, cz0 = 0;
    for (const [x, y, z] of pts) (cx += x / n), (cy0 += y / n), (cz0 += z / n);

    // For one view direction — a downward pitch, and the screen column where the frame stands upright (which fixes
    // the yaw) — find the camera height and distance where the chart covers the most of the screen.
    function solve(pitchDeg, edge, step, around) {
      const pitch = THREE.MathUtils.degToRad(pitchDeg);
      const yaw = Math.atan(edge * Math.cos(pitch) * tanH);
      const f = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const r = new THREE.Vector3().crossVectors(f, camera.up).normalize();
      const u = new THREE.Vector3().crossVectors(r, f);
      // ray to the bottom of the screen column x = -edge; the frame must lie in the plane of this ray and the Z axis,
      // which meets the floor at x = camera.x - camera.y * b.x / b.y
      const b = f.clone().addScaledVector(r, -edge * tanH).addScaledVector(u, -tanV);
      const camX = (cy) => FRAME_X + (cy * b.x) / b.y;
      const fx = f.x, fy = f.y, fz = f.z, rx = r.x, ry = r.y, rz = r.z, ux = u.x, uy = u.y, uz = u.z;
      // screen area the chart covers from camera (camX(cy), cy, cz), and its left / right ends; null if something
      // falls off the screen or behind a bar
      const cover = (cy, cz) => {
        const ox = camX(cy);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let k = 0; k < P.length; k += 3) {
          const vx = P[k] - ox, vy = P[k + 1] - cy, vz = P[k + 2] - cz;
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
        return { a: (x1 - x0) * (y1 - y0), x0, x1 };
      };
      const [y0, y1, z0, z1] = around
        ? [around.cy - 4 * step, around.cy + 4 * step, around.cz - 4 * step, around.cz + 4 * step]
        : [10, 610, -80, 640];
      let best = { a: 0, cy: around ? around.cy : 300, cz: around ? around.cz : 300, x0: -1, x1: 1 };
      for (let cy = Math.max(2, y0); cy <= y1; cy += step) for (let cz = z0; cz <= z1; cz += step) {
        const c = cover(cy, cz);
        if (c && c.a > best.a) best = { ...c, cy, cz };
      }
      // how large the chart looks (pixels per unit at its middle), and how evenly the spare width is shared
      const depth = (cx - camX(best.cy)) * fx + (cy0 - best.cy) * fy + (cz0 - best.cz) * fz;
      const scale = W / (2 * depth * tanH);
      const left = Math.min(-edge, best.x0) + 1, right = 1 - best.x1;
      const score = best.a ? scale * (1 - 0.3 * Math.abs(left - right)) : 0;
      return { ...best, score, pitchDeg, edge, pitch, f, camX };
    }
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
    const pos = new THREE.Vector3(best.camX(best.cy), best.cy, best.cz);
    // On a tall screen the chart fills the width and leaves height over, and the search settles against the bars:
    // move it up or down to the middle between the panel header and the bars, as far as its outline stays clear
    const f = best.f, r = new THREE.Vector3().crossVectors(f, camera.up).normalize(), u = new THREE.Vector3().crossVectors(r, f);
    const span = (o) => {
      let y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < P.length; k += 3) {
        const vx = P[k] - o.x, vy = P[k + 1] - o.y, vz = P[k + 2] - o.z;
        const d = vx * f.x + vy * f.y + vz * f.z;
        if (d < 1) return null;
        const x = (vx * r.x + vy * r.y + vz * r.z) / (d * tanH), y = (vx * u.x + vy * u.y + vz * u.z) / (d * tanV);
        if (x < xMin || x > xMax || y > yMax || y < yMin) return null;
        for (const bl of blocks) if (x > bl[0] && x < bl[1] && y > bl[2] && y < bl[3]) return null;
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      return { y0, y1 };
    };
    const top = Math.min(yMax, ...blocks.filter((bl) => bl[3] > 0.5).map((bl) => bl[2]));
    const bottom = Math.max(yMin, ...blocks.filter((bl) => bl[2] < -0.5).map((bl) => bl[3]));
    const now = span(pos);
    if (now && now.y1 - now.y0 < top - bottom) {
      const shift = (top + bottom) / 2 - (now.y0 + now.y1) / 2;
      const depth = (cx - pos.x) * f.x + (cy0 - pos.y) * f.y + (cz0 - pos.z) * f.z;
      for (let k = 1; k > 0.05; k /= 2) {
        const o = pos.clone().addScaledVector(u, -shift * k * depth * tanV);
        if (o.y > 2 && span(o)) {
          pos.copy(o);
          break;
        }
      }
    }
    const target = pos.clone().addScaledVector(f, pos.y / Math.sin(best.pitch)); // where the view centre meets the floor
    return { target, pos };
  }
  /** camera looking along -dir at the points, as close as possible with all of them inside the free screen area */
  function fitPoints(pts, dir, safe = safeRect()) {
    const cam = camera.clone();
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
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (fits(bounds(mid))) hi = mid; else lo = mid;
      }
      d = hi;
      // slide the target so the projected points sit in the middle of the free area
      const b = bounds(d);
      const dx = (box.x0 + box.x1) / 2 - (b.x0 + b.x1) / 2, dy = (box.y0 + box.y1) / 2 - (b.y0 + b.y1) / 2;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      target.addScaledVector(right, -dx * d * tanV * cam.aspect).addScaledVector(up, -dy * d * tanV);
    }
    return { target, pos: target.clone().addScaledVector(dir, d) };
  }
  const VIEWS = {
    overview: overviewView,
    // hypernuclei: from the front left and above, all three layers and the s axis in view
    hyper: () => fitPoints(hyper.framePoints(), new THREE.Vector3(-0.5, 0.55, 0.67).normalize()),
    top: () => fit(new THREE.Vector3(86, 0, -58), new THREE.Vector3(86, 255, -57.9)),
    focus: () => {
      const i = state.pinned >= 0 ? state.pinned : state.shown;
      if (i < 0) return null;
      if (isHyper(i)) {
        const target = hyper.positions[i - HYPER_BASE].clone();
        return { target, pos: target.clone().add(new THREE.Vector3(-6, 17, 22)) };
      }
      return clearView(i, new THREE.Vector3(-6, 17, 22));
    },
  };
  let fly = null;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function flyTo(view, duration = 1.1) {
    if (!view) return;
    if (reduceMotion) duration = 0.01;
    fly = { t: 0, duration, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: view.target, toP: view.pos };
  }
  function stepFly(dt) {
    if (!fly) return;
    fly.t = Math.min(1, fly.t + dt / fly.duration);
    const e = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2;
    controls.target.lerpVectors(fly.fromT, fly.toT, e);
    camera.position.lerpVectors(fly.fromP, fly.toP, e);
    if (fly.t >= 1) fly = null;
  }
  /**
   * Camera spot for looking at nuclide i from about `offset` (relative to its middle): the preferred direction if
   * nothing stands in front of the box top, otherwise the nearest turn around it or tilt upward that gives a clear
   * view — tall light nuclei and neighbours no longer hide the chosen block.
   */
  function clearView(i, offset) {
    const nuc = nuclides[i], h = chart.targetHeightOf(i);
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
  /** move the camera along with the selection, keeping the current viewing angle where the block stays visible */
  function follow(i) {
    if (isHyper(i)) return;
    const offset = camera.position.clone().sub(controls.target);
    if (offset.length() > 60) offset.setLength(60);
    flyTo(clearView(i, offset), 0.6);
  }
  // the straight-down view is for scanning the chart like a map, so dragging pans there
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => flyTo(VIEWS[b.dataset.view]())));
  document.querySelectorAll('[data-drag]').forEach((b) => b.addEventListener('click', () => setDragMode(b.dataset.drag)));

  // ---------- selection / hover ----------
  const info = $('#info');
  const infoBody = $('#info-body');
  // Both side panels start folded (the left panel and the nuclide details fold separately; the choice is
  // remembered per viewer). The right panel appears only while a nucleus is shown.
  const FOLD_KEY = 'nuclide3d.folded.v2';
  const folded = { controls: true, detail: true };
  try {
    Object.assign(folded, JSON.parse(localStorage.getItem(FOLD_KEY) || '{}'));
  } catch {
    // storage may be unavailable (private mode, sandbox); folding then lasts for this visit only
  }
  const saveFolded = () => {
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify(folded));
    } catch {
      // see above
    }
  };
  function applyFold() {
    info.hidden = state.shown < 0 || state.infoClosed;
    info.classList.toggle('collapsed', folded.detail);
    const t = $('#info-toggle');
    t.textContent = folded.detail ? '+' : '−';
    t.title = folded.detail ? '広げる' : 'たたむ';
    t.setAttribute('aria-expanded', String(!folded.detail));
  }
  $('#info-toggle').addEventListener('click', () => {
    folded.detail = !folded.detail;
    saveFolded();
    applyFold();
  });
  const tooltip = $('#tooltip');
  const isGone = (id) => (isHyper(id) ? !hyper.isShown(id - HYPER_BASE) : id >= 0 && !chart.visible[id]);
  const opts = () => ({ chain: $('#opt-chain').checked, generations: +$('#opt-gen').value, minBranch: +$('#opt-branch').value, route: state.route });

  function applyEmphasis() {
    const map = new Map(state.emph);
    if (state.melodyIdx >= 0) map.set(state.melodyIdx, EMPH.selected); // the note of the decay-chain melody playing now
    if (state.pinned >= 0 && state.hover >= 0 && state.hover !== state.pinned && !map.has(state.hover)) map.set(state.hover, EMPH.hover);
    const nuc = new Map([...map].filter(([id]) => !isHyper(id)));
    chart.setEmphasis(nuc);
    const hy = [...map].find(([id]) => isHyper(id));
    hyper.setEmphasis(hy ? hy[0] - HYPER_BASE : -1, hy ? hy[1] : 0);
  }

  function show(i, { force = false } = {}) {
    if (i === state.shown && !force) return;
    state.shown = i;
    if (i < 0) {
      decay.clear();
      state.emph = new Map();
      infoBody.innerHTML = '';
      info.classList.remove('has-nuc');
    } else if (isHyper(i)) {
      decay.clear();
      state.emph = new Map([[i, EMPH.selected]]);
      infoBody.innerHTML = hyperDetailHtml(hyperOf(i), graph, { pinned: state.pinned === i });
      info.classList.add('has-nuc');
      info.scrollTop = 0;
    } else {
      state.emph = decay.show(i, opts());
      const rgb = chart.colorOf(nuclides[i]);
      infoBody.innerHTML = detailHtml(nuclides[i], i, graph, {
        ...opts(), pinned: state.pinned === i, theme: state.theme, tile: { bg: cssRgb(rgb), fg: inkFor(rgb) },
      });
      info.classList.add('has-nuc');
      info.scrollTop = 0;
      if (melody) markMelody();
    }
    applyFold();
    applyEmphasis();
  }

  function setHover(i, clientX, clientY) {
    if (i !== state.hover) {
      state.hover = i;
      if (state.pinned < 0) show(i);
      applyEmphasis();
      if (isHyper(i)) tooltip.innerHTML = hyperTooltipHtml(hyperOf(i));
      else if (i >= 0) tooltip.innerHTML = tooltipHtml(nuclides[i], graph, i);
    }
    tooltip.hidden = i < 0;
    if (i >= 0 && clientX !== undefined) {
      const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
      const x = Math.min(clientX + 16, window.innerWidth - tw - 8);
      const y = clientY + 18 + th > window.innerHeight ? clientY - th - 12 : clientY + 18;
      tooltip.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  function pin(i, { move = false } = {}) {
    if (i < 0) return unpin();
    state.pinned = i;
    state.infoClosed = false;
    show(i, { force: true });
    ringFor(i);
    if (isHyper(i)) return setHash('');
    const nuc = nuclides[i];
    setHash(`#${nuc.a}${nuc.s}`);
    if (move) follow(i);
  }
  function unpin() {
    state.pinned = -1;
    setHash('');
    show(state.hover, { force: true });
    applyFold();
  }
  // ×: the selection is released and the panel goes away until the next nucleus is selected
  $('#info-unpin').addEventListener('click', () => {
    state.infoClosed = true;
    unpin();
  });
  infoBody.addEventListener('toggle', (e) => e.target.dataset?.isec && rememberSection(e.target.dataset.isec, e.target.open), true);
  function setHash(h) {
    try {
      history.replaceState(null, '', h || location.pathname + location.search);
    } catch {
      // sandboxed frames may refuse history changes; the link is a convenience only
    }
  }

  $('#controls').addEventListener('click', (e) => {
    const t = e.target.closest('[data-goto], [data-tutorial]');
    if (!t) return;
    e.preventDefault();
    if (t.dataset.tutorial !== undefined) return tutorial.start();
    goto(t.dataset.goto);
  });
  info.addEventListener('click', (e) => {
    const t = e.target.closest('[data-route], [data-melody], [data-idx], .unpin');
    if (!t) return;
    e.preventDefault();
    if (t.dataset.route) {
      if (t.dataset.route === state.route) return;
      stopMelody();
      state.route = t.dataset.route;
      return show(state.shown, { force: true });
    }
    if (t.dataset.melody) return playMelody(+t.dataset.melody);
    if (t.classList.contains('unpin')) return unpin();
    const i = +t.dataset.idx;
    if (i >= 0) pin(i, { move: true });
  });

  // ---------- picking ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDirty = false;
  let lastClient = { x: 0, y: 0 };
  let downAt = null;
  canvas.addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    lastClient = { x: e.clientX, y: e.clientY };
    if (e.buttons === 0) pointerDirty = true; // no hover churn while orbiting
  });
  canvas.addEventListener('pointerleave', () => {
    pointerDirty = false;
    setHover(-1);
  });
  // a tap or click selects; gestures with two fingers never do
  const touching = new Set();
  let multiTouch = false;
  canvas.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'touch') {
      touching.add(e.pointerId);
      if (touching.size > 1) multiTouch = true;
    }
  });
  const endTouch = (e) => {
    touching.delete(e.pointerId);
    const wasMulti = multiTouch;
    if (touching.size === 0) multiTouch = false;
    return wasMulti;
  };
  canvas.addEventListener('pointercancel', endTouch);
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch' && endTouch(e)) return;
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > (e.pointerType === 'touch' ? 12 : 5) || e.button !== 0) return;
    downAt = null;
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    lastClient = { x: e.clientX, y: e.clientY };
    pick();
    if (state.hover < 0) unpin();
    else if (state.hover === state.pinned) unpin();
    else pin(state.hover);
  });
  function pick() {
    raycaster.setFromCamera(pointer, camera);
    // boxes thinned out by the line-of-sight fade can be pointed through
    const hit = raycaster.intersectObject(chart.mesh, false)
      .find((h) => chart.visible[h.instanceId] && h.point.y > -0.01 // not the part sunk under the board
        && (chart.emph[h.instanceId] > 0.5 || chart.xrayFade(h.point, camera) < 0.4));
    const hy = hyper.pick(raycaster);
    if (hy && (!hit || hy.distance < hit.distance)) return setHover(HYPER_BASE + hy.k, lastClient.x, lastClient.y);
    setHover(hit ? hit.instanceId : -1, lastClient.x, lastClient.y);
  }

  // ---------- search ----------
  function elementZ(s) {
    const t = s.trim().toLowerCase();
    if (SYMBOL_TO_Z.has(t)) return SYMBOL_TO_Z.get(t);
    return ELEMENTS.findIndex((e) => e[1].toLowerCase() === t || e[2] === s.trim());
  }
  // The most stable of several nuclides: a stable one, else a discovered one with the longest half-life (an
  // unobserved one only by its estimate). Among stable isotopes the most abundant (the element's own isotope); among
  // stable isotones or isobars, and where no half-life tells, the lowest mass per nucleon (the bottom of the valley
  // the height shows; for isobars, where their beta decays end).
  const byAbundance = (a, b) => (b.ab || 0) - (a.ab || 0);
  const byMassPerNucleon = (a, b) => (a.me ?? Infinity) / a.a - (b.me ?? Infinity) / b.a;
  function moreStable(a, b, tie) {
    if (!a.st !== !b.st) return !!a.st;
    if (!a.y !== !b.y) return !!a.y;
    if ((a.t || 0) !== (b.t || 0)) return (a.t || 0) > (b.t || 0);
    return (a.st ? tie : byMassPerNucleon)(a, b) < 0;
  }
  function mostStable(list, tie) {
    let best = -1;
    for (const i of list) if (best < 0 || moreStable(nuclides[i], nuclides[best], tie)) best = i;
    return best;
  }
  const bestIsotope = (z) => mostStable(nuclides.flatMap((nuc, i) => (nuc.z === z ? [i] : [])), byAbundance);
  /**
   * Conditions on Z, N and A, all of which must hold: "Z=50 N=82", "A=208", "z50, a132", or an element for Z
   * ("U A=238"). -> { z, n, a } (those given; `clash` when one is given twice with different values), or null for
   * any other query. N alone needs "=" ("N15" is nitrogen-15).
   */
  function conditions(q) {
    const tokens = q.replace(/\s*[=:]\s*/g, '=').replace(/(^|[\s,、])([zna]) (?=\d)/gi, '$1$2')
      .split(/[\s,、;&]+/).filter((t) => t && !/^(and|かつ)$/i.test(t));
    const cond = {};
    let given = 0;
    const set = (k, v) => {
      if (k in cond && cond[k] !== v) cond.clash = true;
      cond[k] = v;
    };
    for (const t of tokens) {
      const m = t.match(/^([zna])(=?)(\d+)$/i);
      if (m && (m[1].toLowerCase() !== 'n' || m[2] || tokens.length > 1)) {
        set(m[1].toLowerCase(), +m[3]);
        given++;
        continue;
      }
      const z = elementZ(t);
      if (z < 0) return null;
      set('z', z);
    }
    return given ? cond : null;
  }
  /** search text -> { i: nuclide index or -1, note: what was chosen, for a search by one of Z, N, A } */
  function parseQuery(q) {
    q = q.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!q) return { i: -1 };
    const c = conditions(q);
    if (c) {
      const list = c.clash ? [] : nuclides.flatMap((nuc, i) => (
        (c.z ?? nuc.z) === nuc.z && (c.n ?? nuc.n) === nuc.n && (c.a ?? nuc.a) === nuc.a ? [i] : []));
      const keys = ['z', 'n', 'a'].filter((k) => k in c);
      if (keys.length > 1 || list.length < 2) return { i: list.length ? list[0] : -1 };
      const k = keys[0], i = mostStable(list, k === 'z' ? byAbundance : byMassPerNucleon);
      return { i, note: `${k.toUpperCase()} = ${c[k]} の核のうち、最も安定な ${nucText(nuclides[i])} を表示しています` };
    }
    let m;
    if ((m = q.match(/^(\d+)\s*-?\s*(\D+)$/))) {
      const z = elementZ(m[2]);
      if (z >= 0) return { i: graph.find(z, +m[1] - z) };
    }
    if ((m = q.match(/^(\D+?)\s*-?\s*(\d+)$/))) {
      const z = elementZ(m[1]);
      if (z >= 0) return { i: graph.find(z, +m[2] - z) };
    }
    const z = elementZ(q);
    return { i: z >= 0 ? bestIsotope(z) : -1 };
  }
  function goto(q) {
    const { i, note } = parseQuery(q);
    const msg = $('#search-msg');
    if (i < 0) {
      msg.textContent = `「${q}」に一致する核種が見つかりません`;
      msg.classList.remove('note');
      return false;
    }
    msg.textContent = note || '';
    msg.classList.add('note'); // not an error
    // elements 119–126 are only there with the island of stability
    if (nuclides[i]?.isl && !chart.islandOn) $('#opt-island').click();
    if (!chart.visible[i]) {
      if (state.timeMode === 'height') setCut(0);
      else setYear(YEAR_MAX);
    }
    pin(i);
    flyTo(VIEWS.focus(), 1.2);
    return true;
  }
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (goto($('#search').value)) $('#search').blur();
  });
  $('#search').addEventListener('input', () => ($('#search-msg').textContent = ''));
  // Enter searches too (the form's submit), but not the Enter that settles a conversion of the Japanese input
  $('#search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) e.preventDefault();
  });

  // ---------- keyboard ----------
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (display.on) {
      e.preventDefault();
      return setDisplay(false);
    }
    if (tutorial.active) return tutorial.key(e);
    const cur = state.pinned >= 0 ? state.pinned : state.hover;
    if (e.key === 'Escape') return unpin();
    if (e.key === 'f' || e.key === 'F') return flyTo(VIEWS.focus());
    if (e.key === 'r' || e.key === 'R') return resetAll();
    if (e.key === 'm' || e.key === 'M') return toggleSound();
    if (e.key === 'd' || e.key === 'D') return setDisplay(true);
    if (isHyper(cur)) return;
    const dir = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, 0], ArrowDown: [-1, 0] }[e.key];
    if (!dir || cur < 0) return;
    e.preventDefault();
    const nuc = nuclides[cur];
    for (let k = 1; k <= 4; k++) {
      const j = graph.find(nuc.z + dir[0] * k, nuc.n + dir[1] * k);
      if (j >= 0 && chart.visible[j]) {
        pin(j, { move: true });
        break;
      }
    }
  });

  // ---------- display options ----------
  // the caption under the height list explains the chosen quantity; the legend under the color list shows the scale
  function updateLegend() {
    const hm = METRICS[chart.metric3d];
    const unit = hm.unit ? `（${hm.unit}）` : '';
    const flat = chart.heightMode === 'flat' ? '2Dモードでは箱は平らで、3Dモードに戻すとこの高さになります。' : '';
    $('#height-note').textContent = chart.hyper
      ? 'ハイパー核モードでは高さが s クォーク数（0 = 通常核、1 = Λ・Σ、2 = ΛΛ・Ξ）になり、核はすべて立方体です。'
      : `${flat}${hm.note || hm.label}${unit}`;
    const el = $('#legend');
    const cat = legendHtml(chart);
    if (chart.colorMode === 'hl') {
      el.innerHTML = hlLegendHtml(state.theme || 'light');
      return;
    }
    if (cat) {
      el.innerHTML = `<div class="legend-cats${chart.colorMode === 'group' || chart.colorMode === 'lego' ? ' one' : ''}">${cat}</div>`;
      return;
    }
    const metric = METRICS[chart.colorMode === 'height' ? chart.metric3d : chart.colorMode];
    const [lo, hi] = metric.range;
    const ticks = metric.ticks
      ? metric.ticks.map((t, k) => `<span style="left:${((metric.tickVals[k] - lo) / (hi - lo)) * 100}%">${t}</span>`).join('')
      : `<span style="left:0%">${lo}</span><span style="left:100%">${hi}${metric.unit ? ' ' + metric.unit : ''}</span>`;
    el.innerHTML = `<div class="legend-h">${metric.label}</div>
      <div class="gradient" style="background:${VIRIDIS_CSS}"></div><div class="ticks">${ticks}</div>`;
  }
  $('#height').addEventListener('change', (e) => {
    if (e.target.value === 'flat') return setDim('2d');
    // in the 2D mode the boxes stay flat; the choice is kept for the 3D view (and drives colours, sound, timeline)
    chart.metric3d = e.target.value;
    if (state.dim !== '2d') chart.heightMode = e.target.value;
    setupBase();
    refreshCut();
    chart.retarget();
    if (chart.colorMode === 'height') chart.recolor();
    updateLegend();
    show(state.shown, { force: true });
  });
  $('#color').addEventListener('change', (e) => {
    autoColor = null; // the viewer's own choice; keep it when a display mode ends
    chart.colorMode = e.target.value;
    chart.recolor();
    updateLegend();
  });
  const applyGuideOptions = () => {
    chart.uniforms.uLabels.value = $('#opt-labels').checked ? 1 : 0;
    const name = $('#opt-elements').checked, z = $('#opt-z').checked;
    if (name !== chart.labelName || z !== chart.labelZ) {
      chart.labelName = name;
      chart.labelZ = z;
      chart.buildElementLabels();
    }
    chart.magicLines.visible = chart.magicLabels.visible = $('#opt-magic').checked;
    chart.dripLines.visible = $('#opt-drip').checked;
  };
  $('#opt-xray').addEventListener('change', (e) => (chart.uniforms.uXray.value = e.target.checked ? 1 : 0));
  ['#opt-labels', '#opt-elements', '#opt-z', '#opt-magic', '#opt-drip'].forEach((s) => $(s).addEventListener('change', applyGuideOptions));
  // base plane: sinks every bar by the same amount of the height quantity (only for quantities drawn linearly)
  function setupBase() {
    const base = METRICS[chart.heightMode].base;
    const el = $('#hbase');
    chart.baseValue = 0;
    el.value = 0;
    el.max = base ? base.max : 1;
    el.step = base ? base.step : 0.01;
    updateBaseLabel();
    lockHeight();
  }
  function updateBaseLabel() {
    const hm = METRICS[chart.heightMode];
    $('#hbase-out').textContent = hm.base ? `${+chart.baseValue.toFixed(2)}${hm.unit ? ' ' + hm.unit : ''}` : '—';
  }
  $('#hbase').addEventListener('input', (e) => {
    chart.baseValue = +e.target.value;
    updateBaseLabel();
    chart.retarget();
    show(state.shown, { force: true });
  });
  $('#hscale').addEventListener('input', (e) => {
    chart.heightScale = +e.target.value;
    $('#hscale-out').textContent = `${+chart.heightScale.toFixed(2)} 倍`; // 1 = the standard look
    chart.retarget();
    show(state.shown, { force: true });
  });
  ['#opt-chain', '#opt-gen', '#opt-branch'].forEach((s) => $(s).addEventListener('change', () => show(state.shown, { force: true })));
  $('#opt-unobs').addEventListener('change', (e) => {
    chart.showUnobserved = e.target.checked;
    chart.retarget();
    refreshCut();
    if (isGone(state.shown)) unpin();
  });
  // the classes of the LEGO chart legend, each switched on and off on its own
  document.querySelectorAll('[data-lego]').forEach((cb) => cb.addEventListener('change', () => {
    chart.hiddenLego = new Set([...document.querySelectorAll('[data-lego]')].filter((x) => !x.checked).map((x) => x.dataset.lego));
    chart.recolor(); // a RIKEN class switched off turns red (see legoKey)
    chart.retarget();
    refreshCut();
    updateYearLabel();
    if (isGone(state.shown) || isGone(state.pinned)) {
      state.pinned = -1;
      show(-1, { force: true });
    }
  }));
  $('#opt-unbound').addEventListener('change', (e) => {
    chart.showUnbound = e.target.checked;
    chart.retarget();
    refreshCut();
    if (isGone(state.shown)) unpin();
  });

  function applyTheme() {
    const theme = chosenTheme;
    if (theme === state.theme) return;
    state.theme = theme;
    scene.background = new THREE.Color(THEMES[theme].bg);
    chart.setTheme(theme, THEMES[theme].bg);
    nihonium.setTheme(theme);
    hyper.buildGuides(theme);
    applyGuideOptions();
    updateLegend();
    const toLight = theme === 'dark';
    $('#theme').innerHTML = toLight ? ICON_SUN : ICON_MOON;
    $('#theme').title = toLight ? 'ライトモードにする' : 'ダークモードにする';
    $('#theme').setAttribute('aria-label', $('#theme').title);
    show(state.shown, { force: true });
  }
  $('#theme').addEventListener('click', () => {
    chosenTheme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = chosenTheme;
    applyTheme();
  });
  // the claude.ai viewer writes its own appearance into data-theme; put the viewer's choice back
  new MutationObserver(() => {
    if (document.documentElement.dataset.theme !== chosenTheme) document.documentElement.dataset.theme = chosenTheme;
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // PNG of the current view. Inside the claude.ai viewer a page cannot download by itself, so the file goes through
  // the viewer's save prompt (the "downloads" capability); without it (e.g. not granted) the button is hidden.
  const viewerSaves = window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(undefined);
  viewerSaves.then((dl) => {
    if (dl === null) $('#shot').hidden = true;
  });
  $('#shot').addEventListener('click', () => {
    renderer.render(scene, camera);
    const i = state.pinned >= 0 && !isHyper(state.pinned) ? state.pinned : -1;
    const filename = i >= 0 ? `nuclide-chart-${nuclides[i].a}${nuclides[i].s}.png` : 'nuclide-chart.png';
    canvas.toBlob(async (blob) => {
      const dl = await viewerSaves;
      if (dl) {
        // the viewer may decline the prompt; that is not an error worth reporting
        await dl.save({ filename, data: blob }).catch(() => {});
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  });

  // which sections of the left panel are open, remembered per viewer
  const SEC_KEY = 'nuclide3d.sections.v2'; // v2: all folded by default, 表示 first
  try {
    const open = JSON.parse(localStorage.getItem(SEC_KEY) || 'null');
    if (open) document.querySelectorAll('details.sec').forEach((d) => (d.open = !!open[d.dataset.sec]));
  } catch {
    // no storage: the default open sections stay
  }
  document.querySelectorAll('details.sec').forEach((d) => d.addEventListener('toggle', () => {
    try {
      localStorage.setItem(SEC_KEY, JSON.stringify(Object.fromEntries([...document.querySelectorAll('details.sec')].map((x) => [x.dataset.sec, x.open]))));
    } catch {
      // see above
    }
  }));

  const setCollapsed = (c) => {
    $('#controls').classList.toggle('collapsed', c);
    $('#collapse').textContent = c ? '+' : '−';
    $('#collapse').setAttribute('aria-expanded', String(!c));
  };
  $('#collapse').addEventListener('click', () => {
    folded.controls = !folded.controls;
    saveFolded();
    setCollapsed(folded.controls);
  });
  setCollapsed(folded.controls);

  // ---------- discovery timeline ----------
  const yearInput = $('#year');
  yearInput.min = YEAR_MIN;
  yearInput.max = YEAR_MAX;
  const discoveredBy = (y) => (chart.filter === 'riken' ? rikenYears : years).filter((v) => v <= y).length;
  function setYear(y, { fromPlay = false } = {}) {
    y = Math.round(y);
    if (y === state.year) return;
    state.year = y;
    yearInput.value = y;
    chart.yearLimit = y >= YEAR_MAX ? 9999 : y;
    chart.retarget();
    if (!fromPlay) stopPlay();
    updateYearLabel();
    if (state.shown >= 0) {
      if (isGone(state.shown)) {
        state.pinned = -1;
        show(-1);
      } else show(state.shown, { force: true });
    }
  }
  function updateYearLabel() {
    if (state.timeMode === 'height') return updateCutLabel();
    const y = state.year;
    const f = chart.filter;
    const shownCount = () => chart.visible.reduce((a, v) => a + v, 0);
    $('#year-label').innerHTML = f === 'riken'
      ? `<b>${y}年</b>までに理研で発見: ${discoveredBy(y)} 核種`
      : f === 'cycle'
        ? `<b>${state.cycle.map((k) => MODES[k].short).join('・')}</b> ${shownCount()} 核種${y < YEAR_MAX ? `（${y}年までに発見）` : ''}`
      : `<b>${y}年</b>までに発見: ${discoveredBy(y).toLocaleString()} 核種`;
  }
  // The timeline is about discoveries: once it is used, estimated and predicted (never observed) nuclei go away,
  // or they would seem to appear in the latest year.
  function hideGuesses() {
    $('#opt-unobs').checked = $('#opt-unbound').checked = false;
    chart.showUnobserved = chart.showUnbound = false;
  }
  yearInput.addEventListener('input', (e) => {
    if (state.timeMode === 'height') return setCut(+e.target.value);
    hideGuesses();
    setYear(+e.target.value);
  });

  // ---------- "tallest first": the same bar removes nuclides from the highest down, the valley floor stays last ----------
  // Step k hides the k tallest of the nuclides on screen (by the height quantity; ties go together).
  let cutValues = [];
  let cutKey = '';
  function rebuildCut() {
    chart.heightCut = Infinity;
    chart.retarget();
    cutKey = chart.cutMetric();
    const metric = METRICS[cutKey];
    cutValues = [];
    chart.nuclides.forEach((nuc, i) => {
      if (chart.visible[i]) cutValues.push(metric.value(nuc) ?? Infinity);
    });
    cutValues.sort((a, b) => b - a);
    yearInput.min = 0;
    yearInput.max = Math.max(0, cutValues.length - 1);
    yearInput.step = 1;
  }
  function setCut(k, { fromPlay = false } = {}) {
    k = Math.max(0, Math.min(cutValues.length - 1, Math.round(k)));
    if (fromPlay && k === state.cutK) return;
    state.cutK = k;
    yearInput.value = k;
    chart.heightCut = k === 0 ? Infinity : cutValues[k];
    chart.retarget();
    if (!fromPlay) stopPlay();
    updateCutLabel();
    if (isGone(state.shown) || isGone(state.pinned)) {
      state.pinned = -1;
      show(-1, { force: true });
    }
  }
  const cutText = (key, v) => {
    if (key === 'hl') return v >= 22 ? '安定' : v <= -22 ? '非束縛' : fmtSeconds(10 ** v);
    if (key === 'fy') return `${+(10 ** v * 100).toPrecision(2)} %`;
    if (key === 'year') return `${v}年`;
    return `${+v.toFixed(Math.abs(v) < 10 ? 3 : 0)} ${METRICS[key].unit}`;
  };
  function updateCutLabel() {
    const key = chart.cutMetric();
    const left = [];
    chart.visible.forEach((v, i) => v && left.push(i));
    const v = chart.heightCut;
    const level = v === Infinity ? 'すべて' : `${METRICS[key].short} ≤ ${cutText(key, v)}`;
    const names = left.length <= 3 ? `（${left.map((i) => nucText(chart.nuclides[i])).join('、')}）` : '';
    $('#year-label').innerHTML = `<b>${level}</b>：${left.length.toLocaleString()} 核種${names}`;
  }
  // switching between the discovery years and the tallest-first removal
  function setTimeMode(mode) {
    stopPlay();
    state.timeMode = mode;
    $('#time-mode').value = mode;
    $('#play').setAttribute('aria-label', mode === 'height' ? '高い核から順に消す' : '発見の歴史を再生');
    if (mode === 'height') {
      state.year = YEAR_MAX;
      chart.yearLimit = 9999;
      rebuildCut();
      setCut(0);
    } else {
      chart.heightCut = Infinity;
      yearInput.min = YEAR_MIN;
      yearInput.max = YEAR_MAX;
      yearInput.step = 1;
      yearInput.value = YEAR_MAX;
      state.year = YEAR_MAX;
      chart.yearLimit = 9999;
      chart.retarget();
      updateYearLabel();
    }
  }
  $('#time-mode').addEventListener('change', (e) => setTimeMode(e.target.value));
  // what is on screen changed: start the removal over from the new set
  const refreshCut = () => state.timeMode === 'height' && (rebuildCut(), setCut(0));

  // ---------- display modes: RIKEN discoveries, fission products, LLFP, minor actinides, spent fuel ----------
  // The RIKEN toggle shows RIKEN discoveries; the fuel-cycle check boxes show the union of every checked group.
  // FP alone is colored by fission yield and several groups (or the spent-fuel set) by group; the viewer's own
  // color choice comes back when those modes are left.
  let userColor = chart.colorMode;
  let autoColor = null;
  function setModes(riken, cycle) {
    state.cycle = cycle;
    const filters = cycle.map((k) => MODE_FILTERS[k]);
    chart.filter = riken ? 'riken' : cycle.length ? 'cycle' : 'all';
    chart.filterFn = filters.length ? (n) => filters.some((f) => f(n)) : null;
    const want = riken ? null : cycle.length > 1 || cycle.includes('fuel') ? 'group' : cycle[0] === 'fp' ? 'fy' : null;
    if (!autoColor) userColor = chart.colorMode;
    const color = want || (autoColor ? userColor : chart.colorMode);
    autoColor = want;
    if (color !== chart.colorMode) {
      chart.colorMode = color;
      $('#color').value = color;
      chart.recolor();
      updateLegend();
    }
    chart.retarget();
    refreshCut();
    const seen = new Set();
    decay.setCallouts((riken ? ['riken'] : cycle).flatMap((k) => MODE_CALLOUTS[k] || []).flatMap(([z, a, text]) => {
      const i = graph.find(z, a - z);
      if (i < 0 || seen.has(i)) return [];
      seen.add(i);
      const nuc = nuclides[i];
      const bg = riken ? '#d01012' : FUEL_GROUPS[nuc.fuel]?.color || '#555';
      return [{ idx: i, text: text || `${nucText(nuc)}  ${nuc.st ? '安定' : nuc.pu ? '粒子非束縛' : nuc.ts || ''}`, bg }];
    }));
    document.querySelectorAll('[data-mode]').forEach((cb) => (cb.checked = cycle.includes(cb.dataset.mode)));
    $('#riken').setAttribute('aria-pressed', String(riken));
    $('#filter-desc').textContent = (riken ? ['riken'] : cycle).map((k) => MODES[k].desc).join('\n');
    updateYearLabel();
    if (isGone(state.shown)) {
      state.pinned = -1;
      show(-1);
    }
  }
  const checkedCycle = () => [...document.querySelectorAll('[data-mode]')].filter((cb) => cb.checked).map((cb) => cb.dataset.mode);
  document.querySelectorAll('[data-mode]').forEach((cb) => cb.addEventListener('change', () => setModes(false, checkedCycle())));
  $('#riken').addEventListener('click', () => {
    const on = chart.filter !== 'riken';
    if (on && chart.hyper) setHyper(false, { fly: false });
    setModes(on, []);
  });

  // ---------- hypernucleus mode: cubes on the S = 0 layer, Λ/Σ and ΛΛ/Ξ hypernuclei on layers above ----------
  // the layer check boxes act only in the hypernucleus mode; the s = 0 layer carries the ordinary nuclei
  const checkedLayers = () => new Set([...document.querySelectorAll('[data-layer]')].filter((cb) => cb.checked).map((cb) => +cb.dataset.layer));
  const normalShown = () => $('[data-kind="N"]').checked && (!chart.hyper || checkedLayers().has(0));
  function setHyper(on, { fly = true } = {}) {
    if (on && chart.filter === 'riken') setModes(false, state.cycle); // no hypernucleus was found at RIKEN
    chart.hyper = on;
    chart.showNormal = normalShown();
    hyper.group.visible = on;
    $('#hyper').setAttribute('aria-pressed', String(on));
    lockHeight();
    chart.retarget();
    refreshCut();
    updateLegend();
    if (isGone(state.shown) || isGone(state.pinned)) {
      state.pinned = -1;
      show(-1, { force: true });
    } else show(state.shown, { force: true });
    if (fly) flyTo(state.dim === '2d' ? VIEWS.top() : on ? VIEWS.hyper() : VIEWS.overview(), 1.4);
    setDragMode(state.dim === '2d' ? 'pan' : 'rotate');
  }
  $('#hyper').addEventListener('click', () => setHyper(!chart.hyper));

  // which kinds of nuclei are drawn; hypernuclei live on the layers of the hypernucleus mode, so asking for one
  // switches that mode on
  function applyKinds() {
    const kinds = new Set([...document.querySelectorAll('[data-kind]')].filter((cb) => cb.checked).map((cb) => cb.dataset.kind));
    chart.showNormal = normalShown();
    chart.retarget();
    refreshCut();
    hyper.setKinds(kinds);
    hyper.setLayers(checkedLayers());
    updateYearLabel();
    if (isGone(state.shown) || isGone(state.pinned)) {
      state.pinned = -1;
      show(-1, { force: true });
    }
  }
  // (checking one by hand turns the hypernucleus mode on; the reset button's own changes do not)
  document.querySelectorAll('[data-kind]').forEach((cb) => cb.addEventListener('change', (e) => {
    if (e.isTrusted && cb.checked && cb.dataset.kind !== 'N' && !chart.hyper) setHyper(true);
    applyKinds();
  }));
  document.querySelectorAll('[data-layer]').forEach((cb) => cb.addEventListener('change', (e) => {
    if (e.isTrusted && !chart.hyper) setHyper(true);
    applyKinds();
  }));
  // hypernuclear drip lines, one check box per paper (each draws on the layers it has numbers for, in the layer's
  // color and the paper's dash, shown beside its name); only one is on at first
  const DASH_SAMPLE = { solid: '', dash: '5 3.5', dot: '0.01 4' };
  $('#hyper-drip').innerHTML = HYPER_DRIP_SOURCES.map((src) => `<label class="check" title="${src.citation.replace(/"/g, '&quot;')}">
    <input type="checkbox" data-hdrip="${src.key}"${src.on ? ' checked' : ''}> <svg class="dash-sw" viewBox="0 0 22 6" aria-hidden="true"><line x1="2" y1="3" x2="20" y2="3" stroke-dasharray="${DASH_SAMPLE[src.dash]}"/></svg>${src.label}</label>`).join('');
  document.querySelectorAll('[data-hdrip]').forEach((cb) => cb.addEventListener('change', (e) => {
    if (e.isTrusted && cb.checked && !chart.hyper) setHyper(true);
    hyper.setDripSources(new Set([...document.querySelectorAll('[data-hdrip]')].filter((x) => x.checked).map((x) => x.dataset.hdrip)));
  }));

  // ---------- 2D / 3D mode ----------
  // 2D: boxes flat, camera straight down, dragging pans (rotation stays available). 3D: the heights come back.
  // In the hypernucleus mode the 2D view keeps the cubes and stacks the layers one box pitch apart.
  function setDim(dim, { fly = true } = {}) {
    if (dim === state.dim) return;
    state.dim = dim;
    const flat = dim === '2d';
    document.querySelectorAll('[data-dim]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dim === dim)));
    chart.heightMode = flat ? 'flat' : chart.metric3d;
    hyper.setGap(flat ? 1 : LAYER_GAP);
    $('#height').value = chart.metric3d;
    lockHeight();
    chart.retarget();
    if (chart.cutMetric() !== cutKey) refreshCut();
    if (chart.colorMode === 'height') chart.recolor();
    updateLegend();
    show(state.shown, { force: true });
    setDragMode(flat ? 'pan' : 'rotate');
    if (fly) flyTo(flat ? VIEWS.top() : chart.hyper ? VIEWS.hyper() : VIEWS.overview());
  }
  // every box is a cube in the hypernucleus mode, so the height list rests there; in 2D only the scale and base do
  function lockHeight() {
    const flat = state.dim === '2d';
    $('#height').disabled = chart.hyper;
    $('#hscale').disabled = flat || chart.hyper;
    $('#hbase').disabled = flat || chart.hyper || !METRICS[chart.heightMode].base;
  }
  document.querySelectorAll('[data-dim]').forEach((b) => b.addEventListener('click', () => setDim(b.dataset.dim)));

  // ---------- the two bars at the bottom: each can be switched off; the toolbar scrolls sideways when it is too wide ----------
  function applyBars() {
    document.body.classList.toggle('no-toolbar', !$('#opt-toolbar').checked);
    document.body.classList.toggle('no-timeline', !$('#opt-timeline').checked);
  }
  ['#opt-toolbar', '#opt-timeline'].forEach((s) => $(s).addEventListener('change', applyBars));
  const toolbar = $('.toolbar');
  toolbar.addEventListener('wheel', (e) => {
    if (toolbar.scrollWidth <= toolbar.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    toolbar.scrollLeft += e.deltaY;
  }, { passive: false });

  // ---------- sound: selecting a nucleus taps its column (a cantilever; ¹²C rings at 440 Hz). Muted at first ----------
  const sound = new ColumnSound();
  const C12 = graph.find(6, 6);
  // The tone always follows the column a nucleus has in the 3D view, also while the 2D or the hypernucleus mode
  // draws it flat or as a cube; a hypernucleus sounds like its nucleon core.
  const mode3d = () => chart.metric3d;
  function toneOf(i) {
    let j = i;
    if (isHyper(i)) {
      const h = hyperOf(i);
      j = graph.find(h.coreZ, h.coreN);
      if (j < 0) return REF_HZ;
    }
    const mode = mode3d();
    const len = chart.columnLength(j, mode);
    return len > 0.01 ? cantileverHz(len, chart.columnLength(C12, mode)) : null; // a sunk column has nothing to strike
  }
  function ringFor(i) {
    const f = toneOf(i);
    if (f) sound.ring(f);
  }
  function setSound(on) {
    sound.setOn(on);
    const b = $('#sound');
    b.innerHTML = on ? ICON_SOUND_ON : ICON_SOUND_OFF;
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? '音を消す（m キー）' : '核を選んだときに音を鳴らす（m キー）';
    b.setAttribute('aria-label', b.title);
  }
  function toggleSound() {
    setSound(!sound.on);
    if (sound.on) sound.ring(REF_HZ); // ¹²C's note, so one hears it is on
  }
  $('#sound').addEventListener('click', toggleSound);
  setSound(false);

  // the decay chain as a melody: the main path from the shown nucleus down to the stable end, one note per nucleus,
  // the playing one ringed in the chart and marked in the panel. It plays to the end whatever is shown meanwhile
  // (stopped only by its button or a new melody), and even while muted: it was asked for.
  let melody = null; // { idx, timers }
  const NOTE_MS = 450;
  function markMelody() {
    const btn = infoBody.querySelector('[data-melody]');
    if (btn) {
      btn.setAttribute('aria-pressed', String(!!melody));
      btn.textContent = melody ? '■ 止める' : '♪ 崩壊系列をメロディで聴く';
    }
    infoBody.querySelectorAll('.playing').forEach((el) => el.classList.remove('playing'));
    if (state.melodyIdx >= 0) infoBody.querySelectorAll(`[data-idx="${state.melodyIdx}"]`).forEach((el) => el.classList.add('playing'));
  }
  function stopMelody() {
    if (!melody) return;
    melody.timers.forEach(clearTimeout);
    melody = null;
    state.melodyIdx = -1;
    markMelody();
    applyEmphasis();
  }
  function playMelody(idx) {
    if (melody) {
      const same = melody.idx === idx;
      stopMelody();
      if (same) return;
    }
    sound.context(); // the audio may only start from this click
    const path = graph.mainPath(idx, { route: state.route }).filter((s) => s.idx >= 0); // the route the flow shows
    melody = { idx, timers: [] };
    path.forEach((s, k) => melody.timers.push(setTimeout(() => {
      const f = toneOf(s.idx);
      if (f) sound.ring(f, { force: true });
      state.melodyIdx = s.idx;
      markMelody();
      applyEmphasis();
    }, k * NOTE_MS)));
    melody.timers.push(setTimeout(stopMelody, path.length * NOTE_MS + 1500));
    markMelody();
  }

  // ---------- reset: the view the page opens with (resetView, also used by the tutorial), and everything (resetAll) ----------
  function resetView() {
    stopPlay();
    if (state.pinned >= 0) unpin();
    if (chart.hyper) setHyper(false, { fly: false });
    if (chart.filter === 'riken' || state.cycle.length) setModes(false, []);
    if (state.timeMode !== 'year') setTimeMode('year');
    else setYear(YEAR_MAX);
    if (state.dim !== '3d') setDim('3d', { fly: false });
    setDragMode('rotate');
    flyTo(VIEWS.overview(), 1.2);
  }
  // back to how the page opens: every setting of the left panel to its value in index.html, light theme, sound off;
  // only where the panels are open or folded stays as it is
  function resetAll() {
    stopMelody();
    for (const el of $('#controls').querySelectorAll('input, select')) {
      if (el.id === 'search') continue;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked === el.defaultChecked) continue;
        el.checked = el.defaultChecked;
      } else if (el.tagName === 'SELECT') {
        const value = ([...el.options].find((o) => o.defaultSelected) || el.options[0]).value;
        if (el.value === value) continue;
        el.value = value;
      } else {
        if (el.value === el.defaultValue) continue;
        el.value = el.defaultValue;
      }
      el.dispatchEvent(new Event(el.type === 'range' ? 'input' : 'change', { bubbles: true }));
    }
    $('#search').value = '';
    $('#search-msg').textContent = '';
    if (state.theme === 'dark') $('#theme').click();
    setSound(false);
    state.route = 'avoid';
    state.infoClosed = false;
    toolbar.scrollLeft = 0;
    resetView();
  }
  $('#reset').addEventListener('click', resetAll);

  // ---------- tutorial: an animated introduction for first-time visitors (left panel button, ? on the toolbar) ---
  let foldBeforeTutorial = null;
  let colorBeforeTutorial = null;
  let startBeforeTutorial = null;
  // what the tutorial explains as the page shows it at first: the heights, and the unobserved (yellow) nuclei,
  // which playing the discovery history switches off
  const START_INPUTS = ['#height', '#hscale', '#hbase', '#opt-unobs'];
  const valueOf = (el) => (el.type === 'checkbox' ? el.checked : el.value);
  const defaultOf = (el) => (el.type === 'checkbox' ? el.defaultChecked
    : el.tagName === 'SELECT' ? ([...el.options].find((o) => o.defaultSelected) || el.options[0]).value : el.defaultValue);
  const setControl = (el, value) => {
    if (valueOf(el) === value) return;
    if (el.type === 'checkbox') el.checked = value;
    else el.value = value;
    el.dispatchEvent(new Event(el.type === 'range' ? 'input' : 'change', { bubbles: true }));
  };
  const setColor = (c) => {
    if ($('#color').value === c) return;
    $('#color').value = c;
    $('#color').dispatchEvent(new Event('change'));
  };
  // the whole board from straight above, in the space over the tutorial's subtitles
  const snapTop = () => {
    fly = null;
    const sub = document.querySelector('.tut-sub');
    const bottom = sub && !sub.hidden ? sub.getBoundingClientRect().top : window.innerHeight;
    const corners = [[-27, 18], [211, 18], [211, -130], [-27, -130]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const v = fitPoints(corners, new THREE.Vector3(0, 1, 0.0004).normalize(), { l: 0, r: window.innerWidth, t: 0, b: bottom });
    controls.target.copy(v.target);
    camera.position.copy(v.pos);
    controls.update();
  };
  const tutorial = new Tutorial({
    camera, controls, chart, nuclides,
    discovered: years.length,
    find: (z, n) => graph.find(z, n),
    enter() {
      resetView();
      if ($('#opt-island').checked) $('#opt-island').click();
      startBeforeTutorial = START_INPUTS.map((s) => valueOf($(s)));
      for (const s of START_INPUTS) setControl($(s), defaultOf($(s)));
      setDim('2d', { fly: false });
      colorBeforeTutorial = $('#color').value; // the subtitles explain the LEGO colors
      setColor('lego');
      chart.setGuideMask({ nAxis: 0, zAxis: 0, extras: 0 }); // the bare board
      nihonium.setEnabled(false); // its light would shine on the empty board
      controls.enabled = false;
      foldBeforeTutorial = folded.detail; // the details are shown open in the demonstration
      folded.detail = false;
      applyFold();
    },
    exit() {
      chart.filterFn = null;
      chart.setGuideMask(null);
      if (foldBeforeTutorial !== null) folded.detail = foldBeforeTutorial;
      controls.enabled = true;
      resetView();
      if (startBeforeTutorial) START_INPUTS.forEach((s, k) => setControl($(s), startBeforeTutorial[k]));
      if (colorBeforeTutorial) setColor(colorBeforeTutorial);
      nihonium.setEnabled($('#opt-nh').checked);
      applyFold();
    },
    snapTop,
    setDim: (dim) => setDim(dim, { fly: false }),
    flyOverview: () => flyTo(VIEWS.overview(), 1.6),
    pin(i) {
      pin(i);
      flyTo(VIEWS.focus(), 1.4);
    },
    unpin: () => state.pinned >= 0 && unpin(),
    setFilter(fn) {
      chart.filterFn = fn;
      chart.retarget();
    },
  });
  $('#help').addEventListener('click', () => tutorial.start());

  // ---------- display mode (D key), for a screen at an exhibition: the camera circles the chart, and now and then
  // the discovery history or the removal by height plays. A click, a touch, the wheel or a key ends it. ----------
  const display = { on: false, phase: 'orbit', t: 0, wait: 0, act: 0, guesses: [] };
  const GUESSES = ['#opt-unobs', '#opt-unbound']; // hidden while the discovery history plays
  const restoreGuesses = () => GUESSES.forEach((s, k) => setControl($(s), display.guesses[k]));
  const DISPLAY_ACTS = ['year', 'height'];
  function setDisplay(on) {
    if (on === display.on || (on && tutorial.active)) return;
    display.on = on;
    document.body.classList.toggle('display', on);
    controls.autoRotate = on;
    controls.autoRotateSpeed = 0.6;
    if (on) {
      stopMelody();
      tooltip.hidden = true;
      setHover(-1);
      resetView();
      display.guesses = GUESSES.map((s) => $(s).checked);
      display.phase = 'orbit';
      display.t = 0;
      display.wait = 20; // seconds of circling before the first animation
    } else {
      stopPlay();
      decay.setCallouts([]);
      if (state.timeMode !== 'year') setTimeMode('year');
      else setYear(YEAR_MAX);
      restoreGuesses();
    }
  }
  // the nuclide an animation ends with: the last box left by the removal, or the latest discovery of the history
  function lastOfAct() {
    if (state.timeMode === 'height') return chart.visible.indexOf(1);
    let best = -1;
    nuclides.forEach((nuc, i) => {
      if (nuc.y && chart.visible[i] && (best < 0 || nuc.y > nuclides[best].y)) best = i;
    });
    return best;
  }
  // circling (orbit) -> an animation (play) -> a zoom to the nuclide it ends with, circling it (zoom) -> circling
  function updateDisplay(dt) {
    if (!display.on) return;
    controls.autoRotate = !fly;
    if (fly) return;
    display.t += dt;
    if (display.phase === 'orbit' && display.t >= display.wait) {
      const mode = DISPLAY_ACTS[display.act++ % DISPLAY_ACTS.length];
      if (state.timeMode !== mode) setTimeMode(mode);
      $('#play').click();
      display.phase = 'play';
    } else if (display.phase === 'play' && !state.playing) {
      const i = lastOfAct();
      if (i >= 0) {
        const nuc = nuclides[i];
        const text = state.timeMode === 'height' ? `最後に残った核 ${nucText(nuc)}` : `いちばん新しく見つかった核 ${nucText(nuc)}（${nuc.y} 年）`;
        decay.setCallouts([{ idx: i, text, bg: '#d01012' }]);
        flyTo(clearView(i, new THREE.Vector3(-6, 17, 22)), 2.2);
      }
      display.phase = 'zoom';
      display.t = 0;
    } else if (display.phase === 'zoom' && display.t >= 8) {
      // everything back (the removal ends with one box, the history hides the guesses), and the whole chart
      decay.setCallouts([]);
      if (state.timeMode === 'height') setTimeMode('year');
      restoreGuesses();
      flyTo(VIEWS.overview(), 2);
      display.phase = 'orbit';
      display.t = 0;
      display.wait = 30;
    }
  }
  for (const type of ['pointerdown', 'wheel']) {
    window.addEventListener(type, (e) => {
      if (!display.on) return;
      e.stopPropagation(); // the touch that ends it does nothing else
      downAt = null;
      setDisplay(false);
    }, { capture: true });
  }

  // ---------- Nihonium, element 113 named after Japan: gold boxes, ²⁷⁸Nh under a column of light ----------
  $('#opt-nh').addEventListener('change', (e) => nihonium.setEnabled(e.target.checked));
  nihonium.setEnabled($('#opt-nh').checked);
  // the island of stability (KTUY05 shell energy), hidden at first
  $('#opt-island').addEventListener('change', (e) => {
    island.setEnabled(e.target.checked);
    chart.retarget(); // the predicted nuclei of elements 119–126 come and go with it
    chart.buildElementLabels();
    refreshCut();
    updateYearLabel();
    if (isGone(state.shown) || isGone(state.pinned)) {
      state.pinned = -1;
      show(-1, { force: true });
    }
  });
  let playYear = 0;
  // while the history plays, only the chart and the timeline stay on screen
  function stopPlay() {
    state.playing = false;
    $('#play').textContent = '▶';
    document.body.classList.remove('playing');
  }
  let playT = 0; // 0..1 along the removal; k = last * (1 - (1 - t)^2)
  $('#play').addEventListener('click', () => {
    if (state.playing) return stopPlay();
    if (state.timeMode !== 'height') hideGuesses();
    state.playing = true;
    $('#play').textContent = '❚❚';
    document.body.classList.add('playing');
    tooltip.hidden = true;
    if (state.timeMode === 'height') {
      const last = Math.max(1, cutValues.length - 1);
      playT = state.cutK >= last ? 0 : 1 - Math.sqrt(1 - state.cutK / last);
      setCut(state.cutK >= last ? 0 : state.cutK, { fromPlay: true });
      return;
    }
    playYear = state.year >= YEAR_MAX ? YEAR_MIN : state.year;
    setYear(playYear, { fromPlay: true });
  });

  // ---------- start ----------
  setupBase();
  applyTheme();
  setYear(YEAR_MAX);
  show(-1, { force: true });
  // the overview is framed once the panels have their start-up (folded) size
  const v0 = VIEWS.overview();
  controls.target.copy(v0.target);
  camera.position.copy(v0.pos).add(new THREE.Vector3(0, 120, 120));
  flyTo(v0, 2.2);
  if (location.hash.length > 1) {
    const { i } = parseQuery(decodeURIComponent(location.hash.slice(1)));
    if (i >= 0) {
      pin(i);
      fly = null;
      setTimeout(() => flyTo(VIEWS.focus(), 1.8), 300);
    }
  }

  const clock = new THREE.Clock();
  let first = true;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.25);
    const t = clock.elapsedTime;
    stepFly(dt);
    controls.update();
    chart.update(dt, t);

    if (state.playing && state.timeMode === 'height') {
      playT += dt / 18; // about 18 s from all to the last one
      const last = cutValues.length - 1;
      if (playT >= 1) {
        setCut(last, { fromPlay: true });
        stopPlay();
        // the valley floor is a single small box: go and look at it
        const floor = chart.visible.indexOf(1);
        if (floor >= 0 && !display.on) flyTo(clearView(floor, new THREE.Vector3(-6, 17, 22)), 2.2);
      } else setCut(last * (1 - (1 - playT) ** 2), { fromPlay: true });
    } else if (state.playing) {
      playYear += dt * 9; // years per second
      if (playYear >= YEAR_MAX) {
        setYear(YEAR_MAX, { fromPlay: true });
        stopPlay();
      } else setYear(playYear, { fromPlay: true });
    }

    const focusTarget = state.shown >= 0 && $('#opt-dim').checked ? 1 : 0;
    const u = chart.uniforms.uFocus;
    u.value += (focusTarget - u.value) * (1 - Math.exp(-dt * 8));

    updateDisplay(dt);
    if (pointerDirty) {
      pointerDirty = false;
      if (!display.on) pick();
    }
    chart.uniforms.uTarget.value.copy(controls.target);
    decay.update(t, camera, window.innerWidth, window.innerHeight);
    nihonium.update(t, renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)), camera);
    island.update();
    tutorial.update(dt);
    chart.updateLabelLod(camera);
    chart.updateLocalAxes(camera, window.innerWidth, window.innerHeight, safeRect(), dt);
    renderer.render(scene, camera);
    if (first) {
      first = false;
      $('#loading')?.classList.add('done');
      setTimeout(() => $('#loading')?.remove(), 700);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__nuclide = { chart, graph, decay, hyper, camera, controls, renderer, scene, pin, goto, state, nucText, flyTo, VIEWS, setDragMode, setHyper };
}

// What the 3D overview keeps the chart clear of: the left panel's header (open or folded, the framing stays the
// same), the two bars at the bottom, and the tutorial's subtitles (not what the tutorial has hidden).
function overviewBlocks() {
  return [$('#controls .brand'), $('.toolbar'), $('.timeline'), $('.tut-sub')]
    .filter((el) => el && !el.hidden && !el.closest('.tut-hidden'))
    .map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0);
}

/** the part of the canvas not covered by the floating panels (CSS px) */
function safeRect() {
  const W = window.innerWidth, H = window.innerHeight;
  const r = { l: 0, r: W, t: 0, b: H };
  // (offsetParent is always null for these position: fixed elements, so test the box itself;
  // the tutorial fades them out until they are explained, and its subtitles take the bottom)
  const box = (el) => {
    const b = el && !el.classList.contains('tut-hidden') && el.getBoundingClientRect();
    return b && b.width > 0 && b.height > 0 ? b : null;
  };
  const sub = $('.tut-sub');
  if (sub && !sub.hidden) r.b = sub.getBoundingClientRect().top;
  const lb = box($('#controls')), rb = box($('#info')), tb = box($('.toolbar')), yb = box($('.timeline'));
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

/**
 * Adds the not-yet-discovered nuclei that the KTUY05 mass formula predicts to be bound (out to its drip lines,
 * N ≤ 200), with their predicted masses — the yellow blocks of RIKEN's LEGO chart, whose heights came from the
 * same formula. Nuclides found after NUBASE2020 (the RIKEN extras) take their mass from it too.
 */
function addPredicted(nuclides, rows) {
  const byZN = new Map(nuclides.map((n) => [n.z * 1000 + n.n, n]));
  for (const [z, n, me] of rows) {
    let nuc = byZN.get(z * 1000 + n);
    if (!nuc) {
      nuc = { z, n, a: z + n, s: ELEMENTS[z][0], p: 1 };
      if (z > 118) nuc.isl = 1; // an element not yet discovered: shown only with the island of stability
      nuclides.push(nuc);
    }
    if (nuc.me !== undefined) continue;
    nuc.me = me;
    nuc.mee = true; // shown with "#" like other non-measured masses
    nuc.mk = 1;
    nuc.ba = (z * 7288.971064 + n * 8071.3181 - me) / (z + n);
  }
}

/**
 * Marks nuclides credited to RIKEN by the FRIB Discovery of Nuclides Project. Those found after NUBASE2020
 * and missing from it are appended as bare entries (flag x) that only the RIKEN mode shows.
 */
function addRikenDiscoveries(nuclides) {
  const byZA = new Map(nuclides.map((n) => [n.z * 1000 + n.a, n]));
  for (const [z, a, year, ref, doi] of RIKEN_NUCLIDES) {
    let nuc = byZA.get(z * 1000 + a);
    if (!nuc) {
      nuc = { z, n: a - z, a, s: ELEMENTS[z][0], x: 1, y: year };
      nuclides.push(nuc);
    }
    nuc.rk = year;
    nuc.rkRef = ref;
    nuc.rkDoi = doi;
    if (!nuc.y) nuc.y = year; // observed since NUBASE2020 was compiled
  }
  return RIKEN_NUCLIDES.length;
}
