// The page itself: sets up the scene, and wires the panels, the bars, the keyboard and the pointer to the chart.
// What is drawn, computed or animated lives in the other modules; this one holds the selection and the settings.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RIKEN_NUCLIDES, SOURCES, showLoadError } from './data.js';
import { loadNuclides } from './nuclides.js';
import { METRICS, LEGO_RED, nucText, cssRgb, inkFor, fmtHalfLife } from './nuclear.js';
import { NuclideChart, EMPH } from './chart.js';
import { DecayGraph, DecayViz } from './decay.js';
import { HyperLayers, HYPER_BASE, LAYER_GAP, isHyper } from './hyper.js';
import { NihoniumGlow } from './nihonium.js';
import { StabilityIsland } from './island.js';
import { DISPLAY_MODES, MODE_FILTERS, MODE_CALLOUTS, FUEL_GROUPS } from './fuel.js';
import { Views, safeRect } from './views.js';
import { Pointer } from './pointer.js';
import { Timeline } from './timeline.js';
import { DisplayMode } from './display.js';
import { Tutorial } from './tutorial.js';
import { ColumnSound, cantileverHz, REF_HZ } from './sound.js';
import { createSearch } from './search.js';
import {
  detailHtml, tooltipHtml, hyperDetailHtml, hyperTooltipHtml, statsHtml, howtoHtml, sourcesHtml, legoChecksHtml, kindChecksHtml,
  layerChecksHtml, hyperDripChecksHtml, legendHtml, heightNote, rememberBlock, MELODY_LABEL,
} from './panel.js';
import { icon, drawIcons } from './icons.js';
import { recall, remember } from './storage.js';

THREE.ColorManagement.enabled = false;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
/** the values of the checked boxes that carry data-<name> */
const checkedValues = (name) => $$(`[data-${name}]`).filter((cb) => cb.checked).map((cb) => cb.dataset[name]);
const setPressed = (el, on) => el.setAttribute('aria-pressed', String(on));

// ---------- the controls of the left panel, as values ----------
const valueOf = (el) => (el.type === 'checkbox' ? el.checked : el.value);
/** what the control is set to in index.html */
const defaultOf = (el) => (el.type === 'checkbox' ? el.defaultChecked
  : el.tagName === 'SELECT' ? ([...el.options].find((o) => o.defaultSelected) || el.options[0]).value : el.defaultValue);
/** sets a control as the viewer would: its listeners run */
function setControl(el, value) {
  if (valueOf(el) === value) return;
  if (el.type === 'checkbox') el.checked = value;
  else el.value = value;
  el.dispatchEvent(new Event(el.type === 'range' ? 'input' : 'change', { bubbles: true }));
}

const state = {
  hover: -1, // the nuclide under the pointer (ids: nuclide index, or HYPER_BASE + k for hypernucleus k; -1: none)
  pinned: -1, // the nuclide selected with a click: it stays shown whatever the pointer does
  shown: -1, // the nuclide in the detail panel: the pinned one, else the one under the pointer
  emph: new Map(), // the rings on the chart around the shown nuclide's decays: id -> EMPH code
  theme: null,
  dragMode: 'rotate',
  dim: '3d', // 2D (flat, from above) or 3D
  cycle: [], // checked fuel-cycle groups
  infoClosed: false, // the detail panel was closed with its × and stays away until a nucleus is selected
  melodyIdx: -1, // nucleus whose note the decay-chain melody is playing
  route: 'avoid', // decay route of the flow, the diagram highlight and the melody: 'avoid' fission, or the 'main' branch
};

// the chart opens in light mode whatever the OS or host page prefers; only the toolbar button switches it
let chosenTheme = 'light';
document.documentElement.dataset.theme = chosenTheme;

init().catch(showLoadError);

/** the fonts the labels are drawn with on canvases (a canvas does not wait for a font by itself) */
async function waitForFonts() {
  const fonts = ['600 52px Inter', '500 46px Inter', '600 64px Inter', '600 64px "Noto Sans JP"'];
  await Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);
}

/** resolves once the window has a size (a frame that is not shown yet has none, and nothing can be framed in it) */
function windowSized() {
  const sized = () => window.innerWidth > 0 && window.innerHeight > 0;
  return new Promise((resolve) => {
    if (sized()) return resolve();
    window.addEventListener('resize', function wait() {
      if (!sized()) return;
      window.removeEventListener('resize', wait);
      resolve();
    });
  });
}

async function init() {
  const [{ nuclides, islandRows }] = await Promise.all([loadNuclides(), waitForFonts(), windowSized()]);

  // ---------- three.js setup ----------
  const canvas = $('#scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    throw Object.assign(new Error('このブラウザでは 3D 表示（WebGL 2）を使えません。'), {
      advice: 'ブラウザを最新版にするか、別のブラウザや端末でお試しください。',
    });
  }
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

  // ---------- the chart and what is drawn on it ----------
  const chart = new NuclideChart(scene, nuclides);
  const graph = new DecayGraph(nuclides);
  const decay = new DecayViz(scene, chart, graph);
  const hyper = new HyperLayers(scene, chart);
  const nihonium = new NihoniumGlow(scene, chart);
  const island = new StabilityIsland(scene, chart, islandRows);
  const views = new Views({ camera, controls, chart, hyper, selected: () => (state.pinned >= 0 ? state.pinned : state.shown) });
  const hyperOf = (id) => hyper.list[id - HYPER_BASE];
  // a click or tap selects the nuclide under it, or lets go of the selection (on the selected one, or beside the chart)
  const pointer = new Pointer({
    canvas, camera, controls, chart, hyper,
    onHover: setHover,
    onClick: (id) => (id < 0 || id === state.pinned ? unpin() : pin(id)),
    onSlide: () => views.cancelFlight(),
  });
  function setDragMode(mode) {
    state.dragMode = mode;
    pointer.setDragMode(mode);
    for (const b of $$('[data-drag]')) setPressed(b, b.dataset.drag === mode);
  }
  setDragMode('rotate');
  for (const b of $$('[data-drag]')) b.addEventListener('click', () => setDragMode(b.dataset.drag));

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (!w || !h) return; // hidden for now: keep the last size
    renderer.setSize(w, h); // also the canvas's CSS size: what is drawn lines up with the page (and the tutorial's tiles)
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // a tall, narrow screen needs the camera further back to see the whole chart (the overview relies on it)
    controls.maxDistance = 600 * Math.max(1, 1.3 / camera.aspect);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- the left panel: what comes from the data ----------
  $('#stats').innerHTML = statsHtml({
    total: nuclides.filter((n) => !n.x && !n.p).length,
    stable: nuclides.filter((n) => n.st).length,
    riken: RIKEN_NUCLIDES.length,
  });
  $('#howto').innerHTML = howtoHtml();
  $('#sources').innerHTML = sourcesHtml(SOURCES);
  $('#lego-checks').innerHTML = legoChecksHtml();
  $('#kind-checks').innerHTML = kindChecksHtml();
  $('#layer-checks').innerHTML = layerChecksHtml();
  $('#hyper-drip-checks').innerHTML = hyperDripChecksHtml();
  drawIcons();
  if (!island.available) {
    $('#opt-island').disabled = true;
    $('#opt-island').closest('label').title = '安定の島のデータ（KTUY05 質量公式）は、この版には入っていません';
  }

  // ---------- selection / hover ----------
  const info = $('#info');
  const infoBody = $('#info-body');
  const tooltip = $('#tooltip');
  // Both side panels start folded (the left panel and the nuclide details fold separately; the choice is
  // remembered per viewer). The right panel appears only while a nucleus is shown.
  const FOLD_KEY = 'nuclide3d.folded.v2';
  const folded = recall(FOLD_KEY, { controls: true, detail: true });
  function applyFold() {
    info.hidden = state.shown < 0 || state.infoClosed;
    info.classList.toggle('collapsed', folded.detail);
    const t = $('#info-toggle');
    t.textContent = folded.detail ? '+' : '−';
    t.title = folded.detail ? '広げる' : 'たたむ';
    t.setAttribute('aria-label', t.title);
    t.setAttribute('aria-expanded', String(!folded.detail));
  }
  $('#info-toggle').addEventListener('click', () => {
    folded.detail = !folded.detail;
    remember(FOLD_KEY, folded);
    applyFold();
  });
  function setCollapsed(collapsed) {
    $('#controls').classList.toggle('collapsed', collapsed);
    $('#collapse').textContent = collapsed ? '+' : '−';
    $('#collapse').setAttribute('aria-expanded', String(!collapsed));
  }
  $('#collapse').addEventListener('click', () => {
    folded.controls = !folded.controls;
    remember(FOLD_KEY, folded);
    setCollapsed(folded.controls);
  });
  setCollapsed(folded.controls);

  /** whether the nuclide or hypernucleus is no longer drawn */
  const isGone = (id) => (isHyper(id) ? !hyper.isShown(id - HYPER_BASE) : id >= 0 && !chart.visible[id]);
  /** the settings of the 崩壊の矢印 section */
  const decayOptions = () => ({ chain: $('#opt-chain').checked, generations: +$('#opt-gen').value, minBranch: +$('#opt-branch').value, route: state.route });

  function applyEmphasis() {
    const map = new Map(state.emph);
    if (state.melodyIdx >= 0) map.set(state.melodyIdx, EMPH.selected); // the note of the decay-chain melody playing now
    if (state.pinned >= 0 && state.hover >= 0 && state.hover !== state.pinned && !map.has(state.hover)) map.set(state.hover, EMPH.hover);
    chart.setEmphasis(new Map([...map].filter(([id]) => !isHyper(id))));
    const hy = [...map].find(([id]) => isHyper(id));
    hyper.setEmphasis(hy ? hy[0] - HYPER_BASE : -1, hy ? hy[1] : 0);
  }

  /** shows nuclide (or hypernucleus) i in the detail panel, with its decays on the chart; -1 clears both */
  function show(i, { force = false } = {}) {
    if (i === state.shown && !force) return;
    state.shown = i;
    if (i < 0) {
      decay.clear();
      state.emph = new Map();
      infoBody.innerHTML = '';
    } else if (isHyper(i)) {
      decay.clear();
      state.emph = new Map([[i, EMPH.selected]]);
      infoBody.innerHTML = hyperDetailHtml(hyperOf(i), graph);
    } else {
      state.emph = decay.show(i, decayOptions());
      const rgb = chart.colorOf(nuclides[i]);
      infoBody.innerHTML = detailHtml(nuclides[i], i, graph, { ...decayOptions(), theme: state.theme, tile: { bg: cssRgb(rgb), fg: inkFor(rgb) } });
      if (melody) markMelody();
    }
    info.classList.toggle('has-nuc', i >= 0);
    if (i >= 0) info.scrollTop = 0;
    applyFold();
    applyEmphasis();
  }
  const redraw = () => show(state.shown, { force: true });

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

  /** selects nuclide i (its link goes into the address bar); move: the camera follows */
  function pin(i, { move = false } = {}) {
    if (i < 0) return unpin();
    state.pinned = i;
    state.infoClosed = false;
    show(i, { force: true });
    ringFor(i);
    if (isHyper(i)) return setHash('');
    const nuc = nuclides[i];
    setHash(`#${nuc.a}${nuc.s}`);
    if (move) views.follow(i);
  }
  function unpin() {
    state.pinned = -1;
    setHash('');
    show(state.hover, { force: true });
  }
  /**
   * After the set of nuclei on screen changed: lets go of a selection that is no longer drawn. `redraw`: what stays
   * selected is drawn again (its arrows end on boxes that may have come or gone).
   */
  function syncSelection({ redraw: again = false } = {}) {
    if (isGone(state.hover)) {
      state.hover = -1;
      tooltip.hidden = true;
    }
    if (isGone(state.shown)) unpin();
    else if (again && state.shown >= 0) redraw();
  }
  function setHash(h) {
    try {
      history.replaceState(null, '', h || location.pathname + location.search);
    } catch {
      // sandboxed frames may refuse history changes; the link is a convenience only
    }
  }
  // ×: the selection is released and the panel goes away until the next nucleus is selected
  $('#info-close').addEventListener('click', () => {
    state.infoClosed = true;
    unpin();
  });
  infoBody.addEventListener('toggle', (e) => e.target.dataset?.isec && rememberBlock(e.target.dataset.isec, e.target.open), true);
  info.addEventListener('click', (e) => {
    const t = e.target.closest('[data-route], [data-melody], [data-idx]');
    if (!t) return;
    e.preventDefault();
    if (t.dataset.route) {
      if (t.dataset.route === state.route) return;
      stopMelody();
      state.route = t.dataset.route;
      return redraw();
    }
    if (t.dataset.melody) return playMelody(+t.dataset.melody);
    const i = +t.dataset.idx;
    if (i >= 0) pin(i, { move: true });
  });

  // ---------- search, and the links of the page ----------
  const parseQuery = createSearch(nuclides, (z, n) => graph.find(z, n));
  /** goes to what the text names; false (with a message under the search box) when it names nothing */
  function goto(q) {
    const { i, note } = parseQuery(q);
    const msg = $('#search-msg');
    msg.textContent = i < 0 ? `「${q}」に一致する核種が見つかりません` : note || '';
    msg.classList.toggle('note', i >= 0); // not an error
    if (i < 0) return false;
    // elements 119–126 are only there with the island of stability
    if (nuclides[i].isl && !chart.islandOn) $('#opt-island').click();
    if (!chart.visible[i]) timeline.showAll();
    pin(i);
    views.flyTo(views.focus(), 1.2);
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
  $('#controls').addEventListener('click', (e) => {
    const t = e.target.closest('[data-goto], [data-tutorial]');
    if (!t) return;
    e.preventDefault();
    if (t.dataset.tutorial !== undefined) tutorial.start();
    else goto(t.dataset.goto);
  });
  $('#focus').addEventListener('click', () => views.flyTo(views.focus()));

  // ---------- keyboard ----------
  const ARROWS = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, 0], ArrowDown: [-1, 0] }; // (dZ, dN)
  window.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input, select, textarea')) return;
    // the browser's own shortcuts (reload, find, full screen, …) are left alone, in every mode
    if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;
    if (display.on) {
      e.preventDefault();
      return display.stop();
    }
    if (tutorial.active) return tutorial.key(e);
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === 'Escape') return unpin();
    if (key === 'f') return views.flyTo(views.focus());
    if (key === 'r') return resetAll();
    if (key === 'm') return toggleSound();
    if (key === 'd') return display.start();
    // the arrows step from the selected nuclide to its neighbour, over gaps of up to three cells
    const cur = state.pinned >= 0 ? state.pinned : state.hover;
    const dir = ARROWS[key];
    if (!dir || cur < 0 || isHyper(cur)) return;
    e.preventDefault();
    const nuc = nuclides[cur];
    for (let k = 1; k <= 4; k++) {
      const j = graph.find(nuc.z + dir[0] * k, nuc.n + dir[1] * k);
      if (j >= 0 && chart.visible[j]) return pin(j, { move: true });
    }
  });

  // ---------- 高さと色 ----------
  // the caption under the height list explains the chosen quantity; the legend under the color list shows the scale
  function updateLegend() {
    $('#height-note').textContent = heightNote(chart);
    $('#legend').innerHTML = legendHtml(chart);
  }
  $('#height').addEventListener('change', (e) => {
    if (e.target.value === 'flat') return setDim('2d');
    // in the 2D mode the boxes stay flat; the choice is kept for the 3D view (and drives colours, sound, timeline)
    chart.metric3d = e.target.value;
    if (state.dim !== '2d') chart.heightMode = e.target.value;
    setupBase();
    timeline.refresh();
    chart.retarget();
    if (chart.colorMode === 'height') chart.recolor();
    updateLegend();
    redraw();
  });
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
    const metric = METRICS[chart.heightMode];
    $('#hbase-out').textContent = metric.base ? `${+chart.baseValue.toFixed(2)}${metric.unit ? ' ' + metric.unit : ''}` : '—';
  }
  // every box is a cube in the hypernucleus mode, so the height list rests there; in 2D only the scale and base do
  function lockHeight() {
    const flat = state.dim === '2d';
    $('#height').disabled = chart.hyper;
    $('#hscale').disabled = flat || chart.hyper;
    $('#hbase').disabled = flat || chart.hyper || !METRICS[chart.heightMode].base;
  }
  $('#hbase').addEventListener('input', (e) => {
    chart.baseValue = +e.target.value;
    updateBaseLabel();
    chart.retarget();
    redraw();
  });
  $('#hscale').addEventListener('input', (e) => {
    chart.heightScale = +e.target.value;
    $('#hscale-out').textContent = `${+chart.heightScale.toFixed(2)} 倍`; // 1 = the standard look
    chart.retarget();
    redraw();
  });
  // The display modes below choose a coloring of their own; the viewer's choice comes back when they are left.
  let userColor = chart.colorMode;
  let autoColor = null;
  function setColorMode(mode) {
    if (mode === chart.colorMode) return;
    chart.colorMode = mode;
    $('#color').value = mode;
    chart.recolor();
    updateLegend();
  }
  $('#color').addEventListener('change', (e) => {
    autoColor = null; // the viewer's own choice; keep it when a display mode ends
    chart.colorMode = e.target.value;
    chart.recolor();
    updateLegend();
  });

  // ---------- 表示: what is drawn ----------
  function applyGuideOptions() {
    chart.uniforms.uLabels.value = $('#opt-labels').checked ? 1 : 0;
    const name = $('#opt-elements').checked, z = $('#opt-z').checked;
    if (name !== chart.labelName || z !== chart.labelZ) {
      chart.labelName = name;
      chart.labelZ = z;
      chart.buildElementLabels();
    }
    chart.magicLines.visible = chart.magicLabels.visible = $('#opt-magic').checked;
    chart.dripLines.visible = $('#opt-drip').checked;
  }
  for (const s of ['#opt-labels', '#opt-elements', '#opt-z', '#opt-magic', '#opt-drip']) $(s).addEventListener('change', applyGuideOptions);
  $('#opt-xray').addEventListener('change', (e) => (chart.uniforms.uXray.value = e.target.checked ? 1 : 0));
  for (const s of ['#opt-chain', '#opt-gen', '#opt-branch']) $(s).addEventListener('change', redraw);
  /** after a setting changed which nuclides are drawn */
  function nuclidesChanged() {
    chart.retarget();
    timeline.refresh();
    timeline.updateLabel();
    syncSelection();
  }
  // nuclides never observed: NUBASE's estimates and the KTUY05 predictions; those estimated to be unbound apart
  const GUESSES = ['#opt-unobs', '#opt-unbound'];
  function applyGuesses() {
    chart.showUnobserved = $('#opt-unobs').checked;
    chart.showUnbound = $('#opt-unbound').checked;
  }
  for (const s of GUESSES) {
    $(s).addEventListener('change', () => {
      applyGuesses();
      nuclidesChanged();
    });
  }
  // the classes of the LEGO chart legend, each switched on and off on its own
  for (const cb of $$('[data-lego]')) {
    cb.addEventListener('change', () => {
      chart.hiddenLego = new Set($$('[data-lego]').filter((x) => !x.checked).map((x) => x.dataset.lego));
      chart.recolor(); // a RIKEN class switched off turns red (see legoKey)
      nuclidesChanged();
    });
  }
  // Nihonium, element 113 named after Japan: ²⁷⁸Nh under a column of light
  $('#opt-nh').addEventListener('change', (e) => nihonium.setEnabled(e.target.checked));
  nihonium.setEnabled($('#opt-nh').checked);
  // the island of stability (KTUY05 shell energy), hidden at first
  $('#opt-island').addEventListener('change', (e) => {
    island.setEnabled(e.target.checked);
    chart.buildElementLabels(); // the predicted nuclei of elements 119–126 come and go with it
    nuclidesChanged();
  });
  // either bar at the bottom can be switched off; the toolbar scrolls sideways when it is too wide
  function applyBars() {
    document.body.classList.toggle('no-toolbar', !$('#opt-toolbar').checked);
    document.body.classList.toggle('no-timeline', !$('#opt-timeline').checked);
  }
  for (const s of ['#opt-toolbar', '#opt-timeline']) $(s).addEventListener('change', applyBars);
  const toolbar = $('.toolbar');
  toolbar.addEventListener('wheel', (e) => {
    if (toolbar.scrollWidth <= toolbar.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    toolbar.scrollLeft += e.deltaY;
  }, { passive: false });

  // ---------- theme ----------
  function applyTheme() {
    const theme = chosenTheme;
    if (theme === state.theme) return;
    state.theme = theme;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); // the page's background (style.css)
    scene.background = new THREE.Color(bg);
    $('meta[name="theme-color"]')?.setAttribute('content', bg);
    chart.setTheme(theme, bg);
    nihonium.setTheme(theme);
    hyper.buildGuides(theme);
    applyGuideOptions();
    updateLegend();
    const toLight = theme === 'dark';
    const button = $('#theme');
    button.innerHTML = icon(toLight ? 'sun' : 'moon');
    button.title = toLight ? 'ライトモードにする' : 'ダークモードにする';
    button.setAttribute('aria-label', button.title);
    redraw();
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

  // ---------- saving the view as an image ----------
  // Inside the claude.ai viewer a page cannot download by itself, so the file goes through the viewer's save prompt
  // (the "downloads" capability); without it (e.g. not granted) the button is hidden.
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

  // ---------- which sections of the left panel are open, remembered per viewer ----------
  const SECTIONS_KEY = 'nuclide3d.sections.v2'; // v2: all folded by default, 表示 first
  const openSections = recall(SECTIONS_KEY);
  for (const d of $$('details.sec')) {
    d.open = !!openSections[d.dataset.sec];
    d.addEventListener('toggle', () => remember(SECTIONS_KEY, Object.fromEntries($$('details.sec').map((x) => [x.dataset.sec, x.open]))));
  }

  // ---------- the timeline ----------
  const timeline = new Timeline({
    chart,
    cycle: () => state.cycle,
    onChange: syncSelection,
    onEnd() {
      // the removal ends with the valley floor, a single small box: go and look at it
      const i = timeline.mode === 'height' && !display.on ? timeline.last() : -1;
      if (i >= 0) views.flyTo(views.closeUp(i), 2.2);
    },
  });
  // The history is about discoveries: once it is used, the nuclides never observed go away, or they would seem to
  // appear in the latest year.
  function hideGuesses() {
    for (const s of GUESSES) $(s).checked = false;
    applyGuesses();
  }
  $('#year').addEventListener('input', (e) => {
    if (timeline.mode === 'year') hideGuesses();
    timeline.seek(+e.target.value);
  });
  $('#time-mode').addEventListener('change', (e) => timeline.setMode(e.target.value));
  $('#play').addEventListener('click', () => {
    if (timeline.playing) return timeline.stop();
    if (timeline.mode === 'year') hideGuesses();
    tooltip.hidden = true;
    timeline.play();
  });

  // ---------- display modes: RIKEN discoveries, fission products, LLFP, minor actinides, spent fuel ----------
  // The RIKEN toggle shows RIKEN discoveries; the fuel-cycle check boxes show the union of every checked group.
  // FP alone is colored by fission yield and several groups (or the spent-fuel set) by group.
  function setModes(riken, cycle) {
    const modes = riken ? ['riken'] : cycle;
    state.cycle = cycle;
    const filters = cycle.map((k) => MODE_FILTERS[k]);
    chart.filter = riken ? 'riken' : cycle.length ? 'cycle' : 'all';
    chart.filterFn = filters.length ? (n) => filters.some((f) => f(n)) : null;
    const want = riken ? null : cycle.length > 1 || cycle.includes('fuel') ? 'group' : cycle[0] === 'fp' ? 'fy' : null;
    if (!autoColor) userColor = chart.colorMode;
    setColorMode(want || (autoColor ? userColor : chart.colorMode));
    autoColor = want;
    chart.retarget();
    timeline.refresh();
    // name tags over the nuclides the modes are about
    const tagged = new Set();
    decay.setCallouts(modes.flatMap((k) => MODE_CALLOUTS[k]).flatMap(([z, a, text]) => {
      const i = graph.find(z, a - z);
      if (i < 0 || tagged.has(i)) return [];
      tagged.add(i);
      const nuc = nuclides[i];
      return [{ idx: i, text: text || `${nucText(nuc)}  ${fmtHalfLife(nuc)}`, bg: riken ? LEGO_RED : FUEL_GROUPS[nuc.fuel]?.color || '#555' }];
    }));
    for (const cb of $$('[data-mode]')) cb.checked = cycle.includes(cb.dataset.mode);
    setPressed($('#riken'), riken);
    $('#mode-desc').textContent = modes.map((k) => DISPLAY_MODES[k].desc).join('\n');
    timeline.updateLabel();
    syncSelection();
  }
  for (const cb of $$('[data-mode]')) cb.addEventListener('change', () => setModes(false, checkedValues('mode')));
  $('#riken').addEventListener('click', () => {
    const on = chart.filter !== 'riken';
    if (on && chart.hyper) setHyper(false, { fly: false });
    setModes(on, []);
  });

  // ---------- hypernucleus mode: cubes on the S = 0 layer, Λ/Σ and ΛΛ/Ξ hypernuclei on layers above ----------
  // the layer check boxes act only in the hypernucleus mode; the s = 0 layer carries the ordinary nuclei
  const checkedLayers = () => new Set(checkedValues('layer').map(Number));
  const normalShown = () => $('[data-kind="N"]').checked && (!chart.hyper || checkedLayers().has(0));
  /** the view a mode opens with */
  const homeView = () => (state.dim === '2d' ? views.top() : chart.hyper ? views.hyperLayers() : views.overview());
  function setHyper(on, { fly = true } = {}) {
    if (on && chart.filter === 'riken') setModes(false, state.cycle); // no hypernucleus was found at RIKEN
    chart.hyper = on;
    chart.showNormal = normalShown();
    hyper.group.visible = on;
    setPressed($('#hyper'), on);
    lockHeight();
    chart.retarget();
    timeline.refresh();
    updateLegend();
    syncSelection({ redraw: true });
    if (fly) views.flyTo(homeView(), 1.4);
    setDragMode(state.dim === '2d' ? 'pan' : 'rotate');
  }
  $('#hyper').addEventListener('click', () => setHyper(!chart.hyper));
  // which kinds of nuclei are drawn
  function applyKinds() {
    chart.showNormal = normalShown();
    hyper.setKinds(new Set(checkedValues('kind')));
    hyper.setLayers(checkedLayers());
    nuclidesChanged();
  }
  // Hypernuclei live on the layers of the hypernucleus mode, so asking for a kind, a layer or a drip line by hand
  // switches that mode on (the reset button's own changes do not).
  const byHand = (e) => e.isTrusted && !chart.hyper;
  for (const cb of $$('[data-kind]')) {
    cb.addEventListener('change', (e) => {
      if (byHand(e) && cb.checked && cb.dataset.kind !== 'N') setHyper(true);
      applyKinds();
    });
  }
  for (const cb of $$('[data-layer]')) {
    cb.addEventListener('change', (e) => {
      if (byHand(e)) setHyper(true);
      applyKinds();
    });
  }
  // hypernuclear drip lines, one check box per paper (each draws on the layers it has numbers for, in the layer's
  // color and the paper's dash, shown beside its name); only one is on at first
  for (const cb of $$('[data-hdrip]')) {
    cb.addEventListener('change', (e) => {
      if (byHand(e) && cb.checked) setHyper(true);
      hyper.setDripSources(new Set(checkedValues('hdrip')));
    });
  }

  // ---------- 2D / 3D mode ----------
  // 2D: boxes flat, camera straight down, dragging pans (rotation stays available). 3D: the heights come back.
  // In the hypernucleus mode the 2D view keeps the cubes and stacks the layers one box pitch apart.
  function setDim(dim, { fly = true } = {}) {
    if (dim === state.dim) return;
    state.dim = dim;
    const flat = dim === '2d';
    for (const b of $$('[data-dim]')) setPressed(b, b.dataset.dim === dim);
    chart.heightMode = flat ? 'flat' : chart.metric3d;
    hyper.setGap(flat ? 1 : LAYER_GAP);
    $('#height').value = chart.metric3d;
    lockHeight();
    chart.retarget();
    timeline.refreshIfMetricChanged();
    if (chart.colorMode === 'height') chart.recolor();
    updateLegend();
    redraw();
    setDragMode(flat ? 'pan' : 'rotate');
    if (fly) views.flyTo(homeView());
  }
  for (const b of $$('[data-dim]')) b.addEventListener('click', () => setDim(b.dataset.dim));

  // ---------- sound: selecting a nucleus taps its column (a cantilever; ¹²C rings at 440 Hz). Muted at first ----------
  const sound = new ColumnSound();
  const C12 = graph.find(6, 6);
  // The tone always follows the column a nucleus has in the 3D view, also while the 2D or the hypernucleus mode
  // draws it flat or as a cube; a hypernucleus sounds like its nucleon core.
  function toneOf(i) {
    let j = i;
    if (isHyper(i)) {
      const h = hyperOf(i);
      j = graph.find(h.coreZ, h.coreN);
      if (j < 0) return REF_HZ;
    }
    const len = chart.columnLength(j, chart.metric3d);
    return len > 0.01 ? cantileverHz(len, chart.columnLength(C12, chart.metric3d)) : null; // a sunk column has nothing to strike
  }
  function ringFor(i) {
    const f = toneOf(i);
    if (f) sound.ring(f);
  }
  function setSound(on) {
    sound.setOn(on);
    const b = $('#sound');
    b.innerHTML = icon(on ? 'soundOn' : 'soundOff');
    setPressed(b, on);
    b.title = on ? '音を消す（m キー）' : '核を選んだときに音を鳴らす（m キー）';
    b.setAttribute('aria-label', b.title);
  }
  function toggleSound() {
    setSound(!sound.on);
    if (sound.on) sound.ring(REF_HZ); // ¹²C's note, so one hears it is on
  }
  $('#sound').addEventListener('click', toggleSound);
  setSound(false);

  // The decay chain as a melody: the main path from the shown nucleus down to the stable end, one note per nucleus,
  // the playing one ringed in the chart and marked in the panel. It plays to the end whatever is shown meanwhile
  // (stopped only by its button or a new melody), and even while muted: it was asked for.
  let melody = null; // { idx, timers }
  const NOTE_MS = 450;
  function markMelody() {
    const btn = infoBody.querySelector('[data-melody]');
    if (btn) {
      setPressed(btn, !!melody);
      btn.textContent = melody ? MELODY_LABEL.stop : MELODY_LABEL.play;
    }
    for (const el of infoBody.querySelectorAll('.playing')) el.classList.remove('playing');
    if (state.melodyIdx >= 0) for (const el of infoBody.querySelectorAll(`[data-idx="${state.melodyIdx}"]`)) el.classList.add('playing');
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
    const again = melody?.idx === idx; // its own button: stop
    stopMelody();
    if (again) return;
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

  // ---------- reset: the view the page opens with (resetView), and every setting as well (resetAll) ----------
  function resetView() {
    timeline.stop();
    if (state.pinned >= 0) unpin();
    if (chart.hyper) setHyper(false, { fly: false });
    if (chart.filter === 'riken' || state.cycle.length) setModes(false, []);
    timeline.reset();
    if (state.dim !== '3d') setDim('3d', { fly: false });
    setDragMode('rotate');
    views.flyTo(views.overview(), 1.2);
  }
  // back to how the page opens: every setting of the left panel to its value in index.html, light theme, sound off;
  // only where the panels are open or folded stays as it is
  function resetAll() {
    stopMelody();
    for (const el of $$('#controls input, #controls select')) if (el.id !== 'search') setControl(el, defaultOf(el));
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

  // ---------- tutorial: an animated introduction for first-time visitors (left panel button, ? on the toolbar) ----------
  // What it explains is the page as it opens: the settings below go back to their values in index.html while it
  // runs (the unobserved, yellow nuclei are among them: playing the discovery history switches them off).
  const TUTORIAL_SETTINGS = ['#height', '#hscale', '#hbase', '#opt-unobs', '#color'];
  let beforeTutorial = null; // those settings, and whether the details were folded, as the viewer had them
  const tutorial = new Tutorial({
    camera, controls, chart, nuclides,
    discovered: nuclides.filter((n) => n.y).length,
    find: (z, n) => graph.find(z, n),
    enter() {
      resetView();
      setControl($('#opt-island'), false);
      beforeTutorial = { settings: TUTORIAL_SETTINGS.map((s) => valueOf($(s))), folded: folded.detail };
      for (const s of TUTORIAL_SETTINGS) setControl($(s), defaultOf($(s)));
      setDim('2d', { fly: false });
      chart.setGuideMask({ nAxis: 0, zAxis: 0, extras: 0 }); // the bare board
      nihonium.setEnabled(false); // its light would shine on the empty board
      controls.enabled = false;
      folded.detail = false; // the details are shown open in the demonstration
      applyFold();
    },
    exit() {
      chart.filterFn = null;
      chart.setGuideMask(null);
      folded.detail = beforeTutorial.folded;
      controls.enabled = true;
      resetView();
      TUTORIAL_SETTINGS.forEach((s, k) => setControl($(s), beforeTutorial.settings[k]));
      nihonium.setEnabled($('#opt-nh').checked);
      applyFold();
    },
    // the whole board from straight above, in the space over the subtitles
    snapTop() {
      const sub = $('.tut-sub');
      views.jumpTo(views.boardFromAbove(sub && !sub.hidden ? sub.getBoundingClientRect().top : window.innerHeight));
      controls.update();
    },
    setDim: (dim) => setDim(dim, { fly: false }),
    flyOverview: () => views.flyTo(views.overview(), 1.6),
    pin(i) {
      pin(i);
      views.flyTo(views.focus(), 1.4);
    },
    unpin: () => state.pinned >= 0 && unpin(),
    setFilter(fn) {
      chart.filterFn = fn;
      chart.retarget();
    },
  });
  $('#help').addEventListener('click', () => tutorial.start());

  // ---------- display mode (d key), for a screen at an exhibition ----------
  const display = new DisplayMode({
    controls, views, timeline, decay, nuclides,
    enter() {
      stopMelody();
      setHover(-1);
      resetView();
      const guesses = GUESSES.map((s) => $(s).checked); // playing the history hides them
      return () => GUESSES.forEach((s, k) => setControl($(s), guesses[k]));
    },
    play: () => $('#play').click(),
    exit: () => pointer.cancelClick(), // the touch that ends the mode selects nothing
  });

  // ---------- start ----------
  setupBase();
  applyTheme();
  timeline.showAll();
  show(-1, { force: true });
  // the overview is framed once the panels have their start-up (folded) size; the camera comes down to it
  const start = views.overview();
  views.jumpTo({ target: start.target, pos: start.pos.clone().add(new THREE.Vector3(0, 120, 120)) });
  views.flyTo(start, 2.2);
  if (location.hash.length > 1) {
    let i = -1;
    try {
      i = parseQuery(decodeURIComponent(location.hash.slice(1))).i;
    } catch {
      // a hash that cannot be decoded (a stray %) names nothing
    }
    if (i >= 0) {
      pin(i);
      views.cancelFlight();
      setTimeout(() => views.flyTo(views.focus(), 1.8), 300);
    }
  }

  const clock = new THREE.Clock();
  let first = true;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.25);
    const t = clock.elapsedTime;
    views.step(dt);
    controls.update();
    chart.update(dt, t);
    timeline.step(dt);
    // while a nucleus is shown, the others are dimmed
    const dim = state.shown >= 0 && $('#opt-dim').checked ? 1 : 0;
    const focus = chart.uniforms.uFocus;
    focus.value += (dim - focus.value) * (1 - Math.exp(-dt * 8));

    display.update(dt);
    pointer.update(display.on);
    chart.uniforms.uTarget.value.copy(controls.target);
    decay.update(t, camera, window.innerWidth, window.innerHeight);
    nihonium.update(t, renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)), camera);
    island.update();
    tutorial.update(dt);
    chart.updateLabelLod(camera);
    chart.updateLocalAxes(camera, window.innerWidth, window.innerHeight, safeRect(), dt, display.on); // none in the display mode
    renderer.render(scene, camera);
    if (first) {
      first = false;
      $('#loading')?.classList.add('done');
      setTimeout(() => $('#loading')?.remove(), 700);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // for the browser's console, and for automated checks of the page
  window.__nuclide = {
    chart, graph, decay, hyper, nihonium, island, views, timeline, tutorial, display, pointer, camera, controls, renderer, scene,
    state, pin, goto, setHyper, setDragMode,
  };
}
