// Tutorial: an animation with subtitles for first-time (high-school level) visitors. On the bare board, the periodic
// table folds into one column along the Z axis as it comes in, each element jumps to the neutron number of its atomic
// weight as the N axis comes in, the isotopes spread out to the left and right, and the page's controls are shown
// one by one. The element tiles are white in the table and then take the color of the box they land on. The
// subtitles can be paused, stepped back and forth (buttons, arrow keys, space or Enter) and read aloud.
import * as THREE from 'three';
import { ELEMENTS } from './data.js';
import { LEGO_PALETTE, SUPERSCRIPTS, cssRgb, inkFor } from './nuclear.js';
import { icon } from './icons.js';
import { tr, EN } from './i18n.js';

const U_KEV = 931494.10242; // atomic mass unit in keV (for atomic weights from mass excesses)
const MAJOR = [1, 8, 26, 47, 82, 92, 113]; // elements named beside the column
const COLUMN_N = -4; // where the column stands: between the numbers of the Z axis and the first column of the board
// the lanthanides and actinides: their place in group 3 of the table (row, column 2) and their own row below it
const F_ROWS = [
  { from: 57, to: 71, row: 5, below: 7.5, name: tr('ランタノイド', 'Lanthanides'), tint: '#dbe8ff' },
  { from: 89, to: 103, row: 6, below: 8.5, name: tr('アクチノイド', 'Actinides'), tint: '#ffe3c8' },
];
const fRow = (z) => F_ROWS.find((f) => z >= f.from && z <= f.to);

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
// the first row of each group (column) of the table, for its number above it
const groupTop = (col) => (col === 0 || col === 17 ? 0 : col === 1 || col >= 12 ? 1 : 3);

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

// ---------- reading the subtitles aloud (the browser's own speech synthesis) ----------
const speech = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
// Words the voices misread, written out for the voice only (the subtitles keep the kanji). Read through Windows'
// Japanese voice (its phonemes), the subtitles had 周期表 as しゅうきおもて, 核子 as かくこ, 軽すぎて as けいすぎて,
// 重すぎて as じゅうすぎて, 谷を as だにを, 谷底 as たにそこ, 2D as にディー and クォーク as ヲーク; the rest are words
// other voices may get wrong (陽子 is also a given name, ようこ). New subtitles need the same check.
const READINGS = [
  ['周期表', 'しゅうきひょう'], ['核図表', 'かくずひょう'], ['核子', 'かくし'], ['陽子', 'ようし'], ['中性子', 'ちゅうせいし'],
  ['縦軸', 'たてじく'], ['横軸', 'よこじく'], ['原子量', 'げんしりょう'], ['質量数', 'しつりょうすう'], ['同位体', 'どういたい'], ['軽すぎ', 'かるすぎ'],
  ['重すぎ', 'おもすぎ'], ['谷底', 'たにぞこ'], ['谷を', 'たにを'], ['ハイパー核', 'ハイパーかく'], ['クォーク', 'クオーク'],
  ['2D', 'ツーディー'], ['3D', 'スリーディー'], ['≒', 'およそ'], ['+', 'たす'],
];
const READING_OF = new Map(READINGS);
const READINGS_RE = new RegExp(READINGS.map(([w]) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
/** subtitle HTML -> the words to read: no tags, ¹⁴C as 炭素14, "2D / 3D" as "2D、3D", and the READINGS */
function spoken(html) {
  // in English: ¹⁴C as "Carbon 14", "2D, 3D", no READINGS (they are for Japanese voices), and RIKEN as a word
  // (English voices may spell it out letter by letter)
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)([A-Z][a-z]?)/g, (_, a, s) => {
      const z = ELEMENTS.findIndex((e) => e[0] === s);
      const mass = [...a].map((c) => SUPERSCRIPTS.indexOf(c)).join('');
      return EN ? `${z > 0 ? ELEMENTS[z][1] : s} ${mass}` : `${z > 0 ? ELEMENTS[z][2] : s}${mass}`;
    })
    .replace(/\s*\/\s*/g, EN ? ', ' : '、');
  return EN ? text.replace(/\bRIKEN\b/g, 'Riken') : text.replace(READINGS_RE, (w) => READING_OF.get(w));
}
/** a voice in the page's language: Japanese, or English (American English first) */
function pageVoice() {
  if (!EN) return speech?.getVoices().find((v) => v.lang.replace('_', '-').startsWith('ja')) || null;
  const voices = speech?.getVoices() || [];
  const lang = (v) => v.lang.replace('_', '-').toLowerCase();
  return voices.find((v) => lang(v) === 'en-us') || voices.find((v) => lang(v).startsWith('en')) || null;
}
// a sample of a color of the LEGO chart, set before its name in a subtitle
const swatch = (key) => `<span class="tut-sw" style="background:${LEGO_PALETTE.find((c) => c.key === key).color}"></span>`;

export class Tutorial {
  /**
   * app: what the tutorial drives — { camera, controls, chart, nuclides, discovered, enter(), exit(), snapTop(),
   * setDim(dim), flyOverview(), pin(i), unpin(), setFilter(fn), find(z, n) }
   */
  constructor(app) {
    this.app = app;
    this.active = false;
    this.voiceOn = false;
    this.home = homeNeutrons(app.nuclides);
    const C14 = app.find(6, 8);
    // Per step: the subtitle, how long it stays (ms), and what happens when it comes up (enter). The first steps
    // play on the bare board seen from above: `tiles` while the element tiles are laid out on it, `flat` while that
    // view is where the step starts from, `axisNames` while the axes are named in large letters inside the chart.
    // `reveal`: the panel or bar of the page that comes back with this step (they stay away until explained).
    this.steps = [
      {
        text: tr('周期表には 118 種類の元素が並んでいます。元素の種類を決めるのは、原子の中心にある原子核の<b>陽子の数</b>（原子番号 Z）です。',
          'The periodic table lists 118 elements. What sets each element apart is the <b>number of protons</b> in the nucleus, at the center of the atom. This is the atomic number, Z.'),
        ms: 7500, enter: () => this.layout('table'), tiles: true, flat: true,
      },
      {
        text: tr('核図表では、元素を陽子の数の順に、左の<b>縦軸</b>（陽子の数 Z）に沿って一列に並べます。いちばん下が水素 H（陽子 1 個）で、上にいくほど重い元素です。',
          'On the chart of nuclides, the elements stand in one column, in order of proton number, along the <b>vertical axis</b> on the left. This axis is the proton number, Z. Hydrogen, with one proton, is at the bottom, and the elements get heavier as you go up.'),
        ms: 7500, enter: () => this.layout('column'), tiles: true, flat: true, axisNames: true,
      },
      {
        text: tr('原子核には陽子のほかに<b>中性子</b>もあります。下の<b>横軸</b>は中性子の数 N。それぞれの元素を、代表的な原子核（天然にある元素は質量数が原子量に近いもの、ない元素はいちばん長生きのもの）の中性子の数の位置へ動かします。',
          'Besides protons, a nucleus also holds <b>neutrons</b>. The <b>horizontal axis</b> at the bottom is the neutron number, N. Each element now moves to the neutron number of one of its nuclei: for an element found in nature, the one whose mass number is closest to its atomic weight; otherwise, its longest-lived one.'),
        ms: 8000, enter: () => this.layout('chart'), tiles: true, flat: true, axisNames: true,
      },
      {
        text: tr('同じ元素でも、中性子の数がちがう原子核があります。これを<b>同位体</b>と呼びます。同位体を左右に並べていくと…',
          'Nuclei of the same element can have different numbers of neutrons. These are called <b>isotopes</b>. If we line up the isotopes to the left and right…'),
        ms: 7000, enter: () => this.spread(), flat: true, axisNames: true,
      },
      {
        text: tr(`これが<b>核図表</b>です。これまでに ${app.discovered.toLocaleString()} 種類の原子核が見つかっています。${swatch('st')}黒は安定な原子核、${swatch('found')}赤は不安定な（放射性の）原子核、${swatch('unfound')}黄色は存在が予想されていますが、まだ見つかっていない原子核です。`,
          `This is the <b>chart of nuclides</b>. So far, ${app.discovered.toLocaleString()} different nuclei have been found. ${swatch('st')}Black shows stable nuclei, ${swatch('found')}red shows unstable, or radioactive, nuclei, and ${swatch('unfound')}yellow shows nuclei that are predicted to exist but have not been found yet.`),
        ms: 9000, enter: () => this.full(), axisNames: true,
      },
      {
        text: tr('高さは<b>核子 1 個あたりの質量</b>です。軽すぎても重すぎても高くなり、鉄のあたりがいちばん低い「谷底」です。不安定な原子核は、崩壊して谷を下っていきます。',
          'The height shows the <b>mass per nucleon</b>. Nuclei that are too light or too heavy stand taller. The lowest point, the "valley floor", is around iron. Unstable nuclei decay and make their way down the valley.'),
        ms: 9000, enter: () => this.to3d(),
      },
      {
        text: tr('箱をクリックすると、その原子核のくわしい情報が右に出て、<b>崩壊していく先</b>が矢印で示されます。これは年代測定に使われる炭素 14 です。',
          'Click a box to see details about that nucleus on the right. Arrows show <b>what it decays into</b>. This is carbon-14, which is used to find out how old things are.'),
        ms: 9000, enter: () => this.demoPin(C14), reveal: '#info',
      },
      {
        text: tr('<b>ドラッグで回転</b>、右ドラッグで移動、ホイールで拡大・縮小できます。スマートフォンやタブレットでは指で操作できます。',
          '<b>Drag to rotate</b>, right-drag to move, and scroll the wheel to zoom in and out. On phones and tablets, use your fingers.'),
        ms: 8000, enter: () => this.orbit(),
      },
      {
        text: tr('左上のパネルでは、<b>原子核の検索</b>や、表示・高さ・色の切り替えができます。このチュートリアルも、ここからいつでも見られます。',
          'The panel at the top left lets you <b>search for a nucleus</b> and change the display, the heights and the colors. You can also watch this tutorial again from there at any time.'),
        ms: 7000, enter: () => this.highlight('#controls'), reveal: '#controls',
      },
      {
        text: tr('下のバーでは、<b>2D / 3D</b> の切り替えや、<b>理研が発見した原子核</b>、ストレンジクォークを含む<b>ハイパー核</b>の表示ができます。',
          'The bar below lets you switch between <b>2D and 3D</b>, and show the <b>nuclei discovered at RIKEN</b> and the <b>hypernuclei</b>, which contain strange quarks.'),
        ms: 7000, enter: () => this.highlight('.toolbar'), reveal: '.toolbar',
      },
      {
        text: tr('いちばん下のバーでは、原子核が<b>発見されてきた歴史</b>を再生できます。それでは、自由にさわってみましょう！',
          'The bar at the very bottom plays back the <b>history of discovery</b> of the nuclei. Now, go ahead and explore on your own!'),
        ms: 8000, enter: () => this.highlight('.timeline'), reveal: '.timeline',
      },
    ];
    this.revealed = this.steps.map((step) => step.reveal).filter(Boolean); // every part of the page the tutorial hides at first
    this.build();
  }

  // ---------- DOM ----------
  build() {
    const root = (this.root = document.createElement('div'));
    root.id = 'tutorial';
    root.hidden = true;
    const add = (cls, html) => {
      const el = document.createElement('div');
      el.className = cls;
      el.innerHTML = html;
      root.append(el);
      return el;
    };
    this.tiles = [];
    for (let z = 1; z <= 118; z++) this.tiles.push(add('tut-tile', ELEMENTS[z][0]));
    // the table's group numbers, and where the lanthanides and actinides belong
    this.groups = Array.from({ length: 18 }, (_, col) => add('tut-note tut-group', String(col + 1)));
    this.fMarks = F_ROWS.map((f) => ({
      f,
      gap: add('tut-tile tut-gap', `${f.from}–${f.to}`),
      name: add('tut-note tut-fname', f.name),
    }));
    this.labels = MAJOR.map((z) => ({ z, el: add('tut-label', `<b>${ELEMENTS[z][0]}</b> ${ELEMENTS[z][EN ? 1 : 2]} <small>Z = ${z}</small>`) }));
    // the subtitle box keeps one size, and the tiles sit on the board, so both follow the window's size
    window.addEventListener('resize', () => {
      if (!this.active) return;
      this.fitText();
      if (!this.steps[this.k].tiles) return;
      this.app.snapTop();
      this.layout(this.mode, { instant: true });
    });

    const sub = (this.sub = document.createElement('div'));
    sub.className = 'tut-sub';
    sub.setAttribute('role', 'dialog');
    sub.setAttribute('aria-label', tr('チュートリアル', 'Tutorial'));
    sub.innerHTML = `<p class="tut-text" aria-live="polite"></p>
      <div class="tut-nav"><span class="tut-count"></span><span class="tut-bar"><i></i></span>
      <button class="btn tut-prev" title="${tr('前へ（← キー）', 'Back (← key)')}" aria-label="${tr('前へ', 'Back')}">◀◀</button>
      <button class="btn tut-pause" title="${tr('一時停止（スペース、Enter）', 'Pause (Space, Enter)')}" aria-label="${tr('一時停止', 'Pause')}">❚❚</button>
      <button class="btn tut-next" title="${tr('次へ（→ キー）', 'Next (→ key)')}" aria-label="${tr('次へ', 'Next')}">▶▶</button>
      <button class="btn tut-voice" aria-pressed="false" title="${tr('字幕を音声で読み上げる', 'Read the subtitles aloud')}" aria-label="${tr('音声', 'Voice')}">${icon('voiceOff')}</button>
      <button class="btn tut-end" title="${tr('終了（Esc キー）', 'End (Esc key)')}" aria-label="${tr('終了', 'End')}">×</button></div>`;
    sub.hidden = true;
    const part = (name) => sub.querySelector(`.tut-${name}`);
    this.ui = {
      text: part('text'), count: part('count'), bar: part('bar i'),
      prev: part('prev'), pause: part('pause'), next: part('next'), voice: part('voice'),
    };
    this.ui.prev.addEventListener('click', () => this.go(this.k - 1));
    this.ui.pause.addEventListener('click', () => this.togglePause());
    this.ui.next.addEventListener('click', () => this.go(this.k + 1));
    this.ui.voice.addEventListener('click', () => this.toggleVoice());
    this.ui.voice.hidden = !speech;
    part('end').addEventListener('click', () => this.stop());
    document.body.append(root, sub);
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.paused = false;
    this.k = -1;
    this.app.enter();
    this.colorTiles();
    this.root.hidden = false;
    this.sub.hidden = false;
    this.fitText();
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
    this.fadeTo = null;
    clearTimeout(this.timer);
    clearTimeout(this.timer2);
    clearInterval(this.grow);
    this.quiet();
    this.clearHighlight();
    this.root.hidden = true;
    this.sub.hidden = true;
    document.body.classList.remove('tut', 'tut-bars');
    for (const sel of this.revealed) document.querySelector(sel)?.classList.remove('tut-hidden');
    this.app.chart.setAxisNamesInside(false);
    this.app.exit();
  }

  go(k) {
    if (!this.active || k < 0) return;
    if (k >= this.steps.length) return this.stop();
    const back = k < this.k;
    this.k = k;
    clearTimeout(this.timer);
    clearTimeout(this.timer2);
    clearInterval(this.grow);
    this.orbiting = this.orbitPaused = false;
    this.clearHighlight();
    const step = this.steps[k];
    if (back) {
      // each step goes on from the one before: going back first puts its starting view in place
      this.app.unpin();
      if (step.flat) {
        this.app.setDim('2d');
        this.app.snapTop();
      }
    }
    this.ui.text.innerHTML = step.text;
    this.ui.count.textContent = `${k + 1} / ${this.steps.length}`;
    this.ui.next.textContent = k === this.steps.length - 1 ? tr('はじめる', 'Start') : '▶▶';
    this.ui.prev.disabled = k === 0;
    // the page's panels and bars stay away until they are explained
    const shown = new Set(this.steps.slice(0, k + 1).map((before) => before.reveal));
    for (const sel of this.revealed) document.querySelector(sel)?.classList.toggle('tut-hidden', !shown.has(sel));
    document.body.classList.toggle('tut-bars', shown.has('.toolbar')); // the subtitles rise above the bars
    this.app.chart.setAxisNamesInside(!!step.axisNames);
    step.enter();
    this.said = -1;
    this.say();
    this.startClock(step.ms);
  }

  /** the subtitle text as tall as the longest subtitle at the box's present width: the box does not change size */
  fitText() {
    const el = this.ui.text;
    const shown = el.innerHTML;
    el.style.height = 'auto';
    let h = 0;
    for (const step of this.steps) {
      el.innerHTML = step.text;
      h = Math.max(h, el.scrollHeight);
    }
    el.innerHTML = shown;
    el.style.height = `${h}px`;
  }

  // ---------- playing, pausing, the progress bar ----------
  startClock(ms) {
    const { bar } = this.ui;
    this.remaining = ms;
    this.timerDone = false;
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth; // apply the empty bar now, so that it fills from the start
    if (!this.paused) this.runClock();
  }

  runClock() {
    this.deadline = performance.now() + this.remaining;
    this.ui.bar.style.transition = `width ${this.remaining}ms linear`;
    this.ui.bar.style.width = '100%';
    this.timer = setTimeout(() => {
      this.timerDone = true;
      this.advance();
    }, this.remaining);
  }

  /** on to the next step once the time is up and the reading (if any) has finished */
  advance() {
    if (this.active && !this.paused && this.timerDone && !this.speaking) this.go(this.k + 1);
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  pause() {
    if (!this.active || this.paused) return;
    this.paused = true;
    clearTimeout(this.timer);
    if (!this.timerDone) {
      this.remaining = Math.max(0, this.deadline - performance.now());
      const { bar } = this.ui;
      const frac = bar.getBoundingClientRect().width / bar.parentElement.getBoundingClientRect().width;
      bar.style.transition = 'none';
      bar.style.width = `${frac * 100}%`;
    }
    this.orbitPaused = this.orbiting;
    this.orbiting = false;
    if (this.speaking) speech.pause();
    this.markPause();
  }

  resume() {
    if (!this.active || !this.paused) return;
    this.paused = false;
    this.orbiting = this.orbitPaused;
    if (this.speaking && speech.paused) speech.resume();
    else this.say();
    this.markPause();
    if (this.timerDone) this.advance();
    else this.runClock();
  }

  markPause() {
    const btn = this.ui.pause;
    btn.textContent = this.paused ? '▶' : '❚❚';
    const name = this.paused ? tr('再生', 'Play') : tr('一時停止', 'Pause');
    btn.setAttribute('aria-label', name);
    btn.title = tr(`${name}（スペース、Enter）`, `${name} (Space, Enter)`);
  }

  /** keys while the tutorial runs: ← → steps, space / Enter pause and play, Esc ends */
  key(e) {
    if (e.key === 'Escape') this.stop();
    else if (e.key === 'ArrowRight') this.go(this.k + 1);
    else if (e.key === 'ArrowLeft') this.go(this.k - 1);
    else if (e.key === ' ' || e.key === 'Enter') this.togglePause();
    else return;
    e.preventDefault();
  }

  // ---------- reading aloud ----------
  toggleVoice() {
    this.voiceOn = !this.voiceOn;
    this.ui.voice.setAttribute('aria-pressed', String(this.voiceOn));
    this.ui.voice.innerHTML = icon(this.voiceOn ? 'voiceOn' : 'voiceOff');
    if (this.voiceOn) {
      this.said = -1;
      this.say();
    } else {
      this.quiet();
      this.advance();
    }
  }

  /** reads the current subtitle once, unless paused or switched off */
  say() {
    if (!this.voiceOn || !speech || this.paused || this.said === this.k) return;
    this.quiet();
    this.said = this.k;
    const u = new SpeechSynthesisUtterance(spoken(this.steps[this.k].text));
    u.lang = EN ? 'en-US' : 'ja-JP';
    const voice = pageVoice();
    if (voice) u.voice = voice;
    u.onend = u.onerror = () => {
      if (this.utterance !== u) return;
      this.utterance = null;
      this.speaking = false;
      this.advance();
    };
    this.utterance = u;
    this.speaking = true;
    speech.speak(u);
  }

  quiet() {
    this.utterance = null;
    this.speaking = false;
    speech?.cancel();
  }

  // ---------- the element tiles ----------
  /** the color of the box each element lands on (the tutorial shows the LEGO colors) */
  colorTiles() {
    const { chart, nuclides } = this.app;
    this.colors = this.tiles.map((t, k) => {
      const i = this.app.find(k + 1, this.home.get(k + 1));
      const rgb = i >= 0 ? chart.colorOf(nuclides[i]) : [0.8, 0.8, 0.8];
      return { bg: cssRgb(rgb), ink: inkFor(rgb) };
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
    const cellX = (col) => x0 + col * s1 * 1.08, cellY = (row) => y0 + row * s1 * 1.08;
    this.app.setFilter(() => false); // the boxes come in later
    // the axes come in with the column (Z) and as the elements jump to their neutron numbers (N)
    const [n, z] = { table: [0, 0], hidden: [0, 0], column: [0, 1], chart: [1, 1] }[mode];
    this.fadeTo = { nAxis: n, zAxis: z };
    if (instant || !this.fade) this.fade = { ...this.fadeTo };
    this.app.chart.setGuideMask({ ...this.fade, extras: 0 });
    this.tiles.forEach((t, k) => {
      const z = k + 1;
      let x, y, s, op = 1;
      if (mode === 'table' || mode === 'hidden') {
        const [row, col] = tableCell(z);
        x = cellX(col);
        y = cellY(row);
        s = s1;
        if (mode === 'hidden') op = 0;
      } else {
        const p = at(mode === 'column' ? COLUMN_N : this.home.get(z) ?? z, z);
        s = p.cell * (mode === 'column' ? 0.92 : 0.88);
        x = p.x - s / 2;
        y = p.y - s / 2;
      }
      // white in the table; from the column on, the color of the box the tile lands on (white would vanish on the board)
      const f = mode === 'table' && fRow(z), c = (mode === 'column' || mode === 'chart') && this.colors[k];
      t.style.background = c ? c.bg : f ? f.tint : '#fff';
      t.style.color = c ? c.ink : '#1d1d1f';
      t.style.transitionDelay = instant ? '0ms' : `${mode === 'table' ? z * 9 : mode === 'column' ? z * 6 : 200 + z * 9}ms`;
      t.style.transitionDuration = instant ? '0ms' : '';
      t.style.width = t.style.height = `${s1}px`;
      t.style.fontSize = `${s1 * 0.42}px`;
      t.style.transform = `translate(${x}px, ${y}px) scale(${s / s1})`;
      t.style.opacity = op;
    });
    // the table's group numbers, and the gap in group 3 that the lanthanide and actinide rows below fill
    const inTable = mode === 'table' ? 1 : 0;
    this.groups.forEach((el, col) => {
      el.style.fontSize = `${s1 * 0.32}px`;
      el.style.transform = `translate(${cellX(col) + s1 / 2}px, ${cellY(groupTop(col)) - s1 * 0.12}px) translate(-50%, -100%)`;
      el.style.opacity = inTable;
    });
    for (const { f, gap, name } of this.fMarks) {
      gap.style.width = gap.style.height = `${s1}px`;
      gap.style.fontSize = `${s1 * 0.24}px`;
      gap.style.background = f.tint;
      gap.style.transform = `translate(${cellX(2)}px, ${cellY(f.row)}px)`;
      gap.style.opacity = inTable;
      name.style.fontSize = `${s1 * 0.3}px`;
      name.style.transform = `translate(${cellX(3) - s1 * 0.25}px, ${cellY(f.below) + s1 / 2}px) translate(-100%, -50%)`;
      name.style.opacity = inTable;
    }
    // names of some elements to the right of the column, nudged apart where neighbours would overlap
    const placed = this.labels.map(({ z, el }) => {
      const p = at(COLUMN_N, z);
      return { el, x: p.x + p.cell + 6, y: p.y, h: el.offsetHeight || 20 };
    }).sort((a, b) => a.y - b.y);
    for (let i = 1; i < placed.length; i++) {
      const overlap = (placed[i - 1].h + placed[i].h) / 2 + 2 - (placed[i].y - placed[i - 1].y);
      if (overlap > 0) {
        placed[i - 1].y -= overlap / 2;
        placed[i].y += overlap / 2;
      }
    }
    for (const { el, x, y } of placed) {
      el.style.transform = `translate(${x}px, ${y}px) translateY(-50%)`;
      el.style.opacity = mode === 'column' ? 1 : 0;
    }
    if (mode === 'chart') {
      // once the tiles have landed, the boxes take their place
      clearTimeout(this.timer2);
      const k = this.k;
      this.timer2 = setTimeout(() => {
        if (!this.active || this.k !== k) return;
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
    this.fadeTo = null;
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
    const k = this.k;
    setTimeout(() => {
      if (!this.active || this.k !== k) return;
      if (this.paused) this.orbitPaused = true;
      else this.orbiting = true;
    }, 1300);
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

  /** the axes fading in, and a slow turn around the board while the controls are explained */
  update(dt) {
    if (!this.active) return;
    if (this.fadeTo) {
      let moved = false;
      for (const key of ['nAxis', 'zAxis']) {
        const d = this.fadeTo[key] - this.fade[key];
        if (!d) continue;
        this.fade[key] += Math.sign(d) * Math.min(Math.abs(d), dt / 0.9);
        moved = true;
      }
      if (moved) this.app.chart.setGuideMask({ ...this.fade, extras: 0 });
    }
    if (!this.orbiting) return;
    const { camera, controls } = this.app;
    const off = camera.position.clone().sub(controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.25);
    camera.position.copy(controls.target).add(off);
    camera.lookAt(controls.target);
  }
}
