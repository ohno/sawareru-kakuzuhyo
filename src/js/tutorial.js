// Tutorial: an animation with subtitles for first-time (high-school level) visitors. On the bare board, the periodic
// table beside the Z axis folds into one column along it, each element jumps to the neutron number of its atomic
// weight as the N axis comes in, the isotopes spread out to the left and right, and the page's controls are shown
// one by one. Each element tile has the color of the box it lands on.
import * as THREE from 'three';
import { ELEMENTS, cssRgb, inkFor } from './nuclear.js';

const U_KEV = 931494.10242; // atomic mass unit in keV (for atomic weights from mass excesses)
const MAJOR = [1, 8, 26, 50, 82, 92, 118]; // elements named beside the column (far enough apart not to overlap)
// the page's panels and bars, and the step from which each is shown (the detail panel with the ¹⁴C example)
const UI_FROM = [['#info', 6], ['#controls', 8], ['.toolbar', 9], ['.timeline', 10]];

// where each element sits in the 18-column periodic table: [row, column] (rows 7.5, 8.5: lanthanides, actinides)
function tableCell(z) {
  if (z === 1) return [0, 0];
  if (z === 2) return [0, 17];
  const start = [3, 11, 19, 37, 55, 87];
  for (let p = 5; p >= 0; p--) {
    if (z < start[p]) continue;
    const k = z - start[p], row = p + 1;
    if (p <= 1) return [row, k < 2 ? k : k + 10]; // periods 2, 3: s block, then p block
    if (p <= 3) return [row, k]; // periods 4, 5: all 18 columns
    if (k < 2) return [row, k]; // periods 6, 7: s block
    if (k < 17) return [row + 2.5, k + 1]; // the f rows below the table (La–Lu, Ac–Lr)
    return [row, k - 14];
  }
  return [0, 0];
}

/** neutron number of each element's atomic weight (rounded), or of its longest-lived isotope when none is natural */
function homeNeutrons(nuclides) {
  const byZ = new Map();
  for (const nuc of nuclides) {
    if (nuc.z < 1 || nuc.z > 118 || nuc.p || nuc.x) continue;
    if (!byZ.has(nuc.z)) byZ.set(nuc.z, []);
    byZ.get(nuc.z).push(nuc);
  }
  const life = (n) => (n.st ? Infinity : n.t || 0);
  const home = new Map();
  for (const [z, list] of byZ) {
    const natural = list.filter((n) => n.ab > 0 && n.me !== undefined);
    let a;
    if (natural.length) {
      const w = natural.reduce((s, n) => s + n.ab, 0);
      a = Math.round(natural.reduce((s, n) => s + n.ab * (n.a + n.me / U_KEV), 0) / w);
    } else {
      a = list.reduce((b, n) => (life(n) > life(b) ? n : b)).a;
    }
    // the nearest isotope that is on the chart
    const best = list.reduce((b, n) => (Math.abs(n.a - a) < Math.abs(b.a - a) ? n : b));
    home.set(z, best.n);
  }
  return home;
}

export class Tutorial {
  /**
   * app: what the tutorial drives — { camera, controls, chart, nuclides, discovered, enter(), exit(), snapTop(),
   * setDim(dim), flyOverview(), pin(i), unpin(), setFilter(fn), find(z, n) }
   */
  constructor(app) {
    this.app = app;
    this.active = false;
    this.home = homeNeutrons(app.nuclides);
    const C14 = app.find(6, 8);
    this.steps = [
      {
        text: '周期表には 118 種類の元素が並んでいます。元素の種類を決めるのは、原子の中心にある原子核の<b>陽子の数</b>（原子番号 Z）です。',
        ms: 7500, enter: () => this.layout('table'),
      },
      {
        text: '核図表では、元素を陽子の数の順に、左の<b>縦軸</b>（陽子の数 Z）に沿って一列に並べます。いちばん下が水素 H（陽子 1 個）で、上にいくほど重い元素です。',
        ms: 7500, enter: () => this.layout('column'),
      },
      {
        text: '原子核には陽子のほかに<b>中性子</b>もあります。下の<b>横軸</b>は中性子の数 N。それぞれの元素を、原子量（≒ 陽子の数 + 中性子の数）から決まる位置へ動かします。',
        ms: 8000, enter: () => this.layout('chart'),
      },
      {
        text: '同じ元素でも、中性子の数がちがう原子核があります。これを<b>同位体</b>と呼びます。同位体を左右に並べていくと…',
        ms: 7000, enter: () => this.spread(),
      },
      {
        text: `これが<b>核図表</b>です。これまでに ${app.discovered.toLocaleString()} 種類の原子核が見つかっています。<span class="tut-sw" style="background:#1b1b1d"></span>黒は安定な原子核、<span class="tut-sw" style="background:#c91a09"></span>赤は不安定な（放射性の）原子核、<span class="tut-sw" style="background:#f5c400"></span>黄色はまだ見つかっていない原子核です。`,
        ms: 9000, enter: () => this.full(),
      },
      {
        text: '高さは<b>核子 1 個あたりの質量</b>です。軽すぎても重すぎても高くなり、鉄のあたりがいちばん低い「谷底」です。不安定な原子核は、崩壊して谷を下っていきます。',
        ms: 9000, enter: () => this.to3d(),
      },
      {
        text: '箱をクリックすると、その原子核のくわしい情報が右に出て、<b>崩壊していく先</b>が矢印で示されます。これは年代測定に使われる炭素 14 です。',
        ms: 9000, enter: () => this.demoPin(C14),
      },
      {
        text: '<b>ドラッグで回転</b>、右ドラッグで移動、ホイールで拡大・縮小できます。スマートフォンやタブレットでは指で操作できます。',
        ms: 8000, enter: () => this.orbit(),
      },
      {
        text: '左上のパネルでは、<b>原子核の検索</b>や、表示・高さ・色の切り替えができます。このチュートリアルも「使い方」からいつでも見られます。',
        ms: 7000, enter: () => this.highlight('#controls'),
      },
      {
        text: '下のバーでは、<b>2D / 3D</b> の切り替えや、<b>理研が発見した原子核</b>、ストレンジクォークを含む<b>ハイパー核</b>の表示ができます。',
        ms: 7000, enter: () => this.highlight('.toolbar'),
      },
      {
        text: 'いちばん下のバーでは、原子核が<b>発見されてきた歴史</b>を再生できます。それでは、自由にさわってみましょう！',
        ms: 8000, enter: () => this.highlight('.timeline'),
      },
    ];
    this.build();
  }

  // ---------- DOM ----------
  build() {
    const root = (this.root = document.createElement('div'));
    root.id = 'tutorial';
    root.hidden = true;
    this.tiles = [];
    for (let z = 1; z <= 118; z++) {
      const t = document.createElement('div');
      t.className = 'tut-tile';
      t.textContent = ELEMENTS[z][0];
      root.append(t);
      this.tiles.push(t);
    }
    this.labels = MAJOR.map((z) => {
      const l = document.createElement('div');
      l.className = 'tut-label';
      l.innerHTML = `<b>${ELEMENTS[z][0]}</b> ${ELEMENTS[z][2]} <small>Z = ${z}</small>`;
      root.append(l);
      return { z, el: l };
    });
    // the tiles sit on the board, so they follow it when the window changes size
    window.addEventListener('resize', () => {
      if (!this.active || this.k > 2) return;
      this.app.snapTop();
      this.layout(this.mode, { instant: true });
    });

    const sub = (this.sub = document.createElement('div'));
    sub.className = 'tut-sub';
    sub.setAttribute('role', 'dialog');
    sub.setAttribute('aria-label', 'チュートリアル');
    sub.innerHTML = `<p class="tut-text" aria-live="polite"></p>
      <div class="tut-nav"><span class="tut-count"></span><span class="tut-bar"><i></i></span>
      <button class="btn tut-end">終了</button><button class="btn tut-next">次へ ▶</button></div>`;
    sub.hidden = true;
    sub.querySelector('.tut-next').addEventListener('click', () => this.go(this.k + 1));
    sub.querySelector('.tut-end').addEventListener('click', () => this.stop());
    document.body.append(root, sub);
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.app.enter();
    this.colorTiles();
    this.root.hidden = false;
    this.sub.hidden = false;
    this.app.snapTop(); // fits the board above the subtitles
    document.body.classList.add('tut');
    this.layout('hidden', { instant: true });
    void this.root.offsetWidth; // apply the start positions now, so the first move is animated
    this.go(0);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.orbiting = false;
    this.axisFade = undefined;
    clearTimeout(this.timer);
    clearTimeout(this.timer2);
    clearInterval(this.grow);
    this.clearHighlight();
    this.root.hidden = true;
    this.sub.hidden = true;
    document.body.classList.remove('tut', 'tut-bars');
    for (const [sel] of UI_FROM) document.querySelector(sel)?.classList.remove('tut-hidden');
    this.app.chart.setAxisNamesInside(false);
    this.app.exit();
  }

  go(k) {
    if (!this.active) return;
    if (k >= this.steps.length) return this.stop();
    this.k = k;
    clearTimeout(this.timer);
    clearTimeout(this.timer2);
    clearInterval(this.grow);
    this.orbiting = false;
    this.clearHighlight();
    const step = this.steps[k];
    this.sub.querySelector('.tut-text').innerHTML = step.text;
    this.sub.querySelector('.tut-count').textContent = `${k + 1} / ${this.steps.length}`;
    this.sub.querySelector('.tut-next').textContent = k === this.steps.length - 1 ? 'はじめる' : '次へ ▶';
    const bar = this.sub.querySelector('.tut-bar i');
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    bar.style.transition = `width ${step.ms}ms linear`;
    bar.style.width = '100%';
    // the page's panels and bars stay away until they are explained
    for (const [sel, from] of UI_FROM) document.querySelector(sel)?.classList.toggle('tut-hidden', k < from);
    document.body.classList.toggle('tut-bars', k >= 9); // the subtitles rise above the bars
    this.app.chart.setAxisNamesInside(k >= 2 && k <= 4); // large axis names on the flat chart
    step.enter();
    this.timer = setTimeout(() => this.go(k + 1), step.ms);
  }

  // ---------- the element tiles ----------
  /** each element in the color of the box it lands on (the tutorial shows the LEGO colors) */
  colorTiles() {
    const { chart, nuclides } = this.app;
    this.tiles.forEach((t, k) => {
      const i = this.app.find(k + 1, this.home.get(k + 1));
      const rgb = i >= 0 ? chart.colorOf(nuclides[i]) : [0.8, 0.8, 0.8];
      t.style.background = cssRgb(rgb);
      t.style.color = inkFor(rgb);
    });
  }

  /** moves the tiles to one of the layouts on the board: 'table', 'column', 'chart', or 'hidden' */
  layout(mode, { instant = false } = {}) {
    this.mode = mode;
    const at = this.projector();
    // the periodic table as large as the board allows, from just right of the numbers of the Z axis,
    // halfway between the top and bottom edges of the board
    const { x: x0 } = at(-6.5, 0);
    const right = Math.min(at(204.5, 0).x, window.innerWidth - 8);
    const top = at(0, 125.5).y, bottom = at(0, -12.5).y;
    const s1 = Math.min((right - x0) / (17 * 1.08 + 1), (bottom - top) / (8.5 * 1.08 + 1));
    const y0 = (at(0, 127).y + at(0, -15).y - (8.5 * 1.08 + 1) * s1) / 2;
    const COLUMN_N = -4; // the column: between the numbers of the Z axis and the first column of the board
    this.app.setFilter(() => false); // the boxes come in later
    // the N axis comes in as the elements jump to their neutron numbers
    this.axisFade = mode === 'chart' && !instant ? 0 : undefined;
    this.app.chart.setGuideMask({ nAxis: mode === 'chart' && instant ? 1 : 0, extras: 0 });
    this.tiles.forEach((t, k) => {
      const z = k + 1;
      let x, y, s, op = 1;
      if (mode === 'table' || mode === 'hidden') {
        const [row, col] = tableCell(z);
        x = x0 + col * s1 * 1.08;
        y = y0 + row * s1 * 1.08;
        s = s1;
        if (mode === 'hidden') op = 0;
      } else {
        const p = at(mode === 'column' ? COLUMN_N : this.home.get(z) ?? z, z);
        s = p.cell * (mode === 'column' ? 0.92 : 0.88);
        x = p.x - s / 2;
        y = p.y - s / 2;
      }
      t.style.transitionDelay = instant ? '0ms' : `${mode === 'table' ? z * 9 : mode === 'column' ? z * 6 : 200 + z * 9}ms`;
      t.style.transitionDuration = instant ? '0ms' : '';
      t.style.width = t.style.height = `${s1}px`;
      t.style.fontSize = `${s1 * 0.42}px`;
      t.style.transform = `translate(${x}px, ${y}px) scale(${s / s1})`;
      t.style.opacity = op;
    });
    // names of some elements to the right of the column
    for (const { z, el } of this.labels) {
      const p = at(COLUMN_N, z);
      el.style.transform = `translate(${p.x + p.cell + 6}px, ${p.y}px) translateY(-50%)`;
      el.style.opacity = mode === 'column' ? 1 : 0;
    }
    if (mode === 'chart') {
      // once the tiles have landed, the boxes take their place
      clearTimeout(this.timer2);
      this.timer2 = setTimeout(() => {
        if (!this.active || this.k !== 2) return;
        this.app.setFilter((nuc) => nuc.z >= 1 && nuc.z <= 118 && nuc.n === this.home.get(nuc.z));
        this.tiles.forEach((t) => {
          t.style.transitionDelay = '0ms';
          t.style.opacity = 0;
        });
      }, 2600);
    }
  }

  /** screen position of the board cell (N, Z) in the current (top) view, and the size of one cell in pixels */
  projector() {
    const cam = this.app.camera;
    cam.updateMatrixWorld();
    const W = window.innerWidth, H = window.innerHeight;
    const v = new THREE.Vector3();
    const screen = (n, z) => {
      v.set(n, 0.3, -z).project(cam);
      return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
    };
    return (n, z) => {
      const [x, y] = screen(n, z);
      const [x1] = screen(n + 1, z);
      return { x, y, cell: Math.max(2, Math.abs(x1 - x)) };
    };
  }

  // ---------- the chart ----------
  spread() {
    this.layout('chart', { instant: true });
    clearTimeout(this.timer2);
    this.tiles.forEach((t) => (t.style.opacity = 0));
    let r = 0;
    const show = () => this.app.setFilter((nuc) => nuc.z >= 1 && nuc.z <= 118 && Math.abs(nuc.n - this.home.get(nuc.z)) <= r);
    show();
    this.grow = setInterval(() => {
      r += 1;
      show();
      if (r > 70) clearInterval(this.grow);
    }, 90);
  }

  // every nucleus on the chart with all its guides, tiles gone
  clear() {
    this.tiles.forEach((t) => (t.style.opacity = 0));
    this.axisFade = undefined;
    this.app.chart.setGuideMask(null);
    this.app.setFilter(null);
  }

  full() {
    this.clear();
    this.app.setDim('2d');
    this.app.snapTop();
  }

  to3d() {
    this.clear();
    this.app.setDim('3d');
    this.app.flyOverview();
  }

  demoPin(i) {
    this.clear();
    this.app.setDim('3d');
    this.app.pin(i);
  }

  orbit() {
    this.clear();
    this.app.unpin();
    this.app.setDim('3d');
    this.app.flyOverview();
    setTimeout(() => (this.orbiting = this.active && this.k === 7), 1300);
  }

  highlight(sel) {
    this.clear();
    this.app.unpin();
    const el = document.querySelector(sel);
    if (el) el.classList.add('tut-focus');
    this.focused = el;
  }

  clearHighlight() {
    if (this.focused) this.focused.classList.remove('tut-focus');
    this.focused = null;
  }

  /** the N axis fading in, and a slow turn around the board while the controls are explained */
  update(dt) {
    if (!this.active) return;
    if (this.axisFade !== undefined && this.axisFade < 1) {
      this.axisFade = Math.min(1, this.axisFade + dt / 0.9);
      this.app.chart.setGuideMask({ nAxis: this.axisFade, extras: 0 });
    }
    if (!this.orbiting) return;
    const { camera, controls } = this.app;
    const off = camera.position.clone().sub(controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.25);
    camera.position.copy(controls.target).add(off);
    camera.lookAt(controls.target);
  }
}
