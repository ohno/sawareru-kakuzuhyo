// The bar at the bottom of the page. One slider and one play button serve two animations: the history of
// discoveries year by year ('year'), and "tallest first" ('height'), which removes the nuclides from the highest
// down until the valley floor is left.
import { METRICS, nucText, fmtSeconds } from './nuclear.js';
import { DISPLAY_MODES } from './fuel.js';

const YEAR_NOW = 2026; // the year of the data (FRIB Discovery of Nuclides Project, 2026-09): the slider's right end
const YEARS_PER_SECOND = 9;
const CUT_SECONDS = 18; // from all nuclides to the last one

const $ = (s) => document.querySelector(s);

export class Timeline {
  /**
   * chart: the chart whose year limit and height cut the bar sets.
   * cycle(): the fuel-cycle modes shown, for the label.
   * onChange({ redraw }): the set of nuclides on screen changed (redraw: draw what stays selected again).
   * onEnd(): an animation ran to its end.
   */
  constructor({ chart, cycle, onChange, onEnd }) {
    Object.assign(this, { chart, cycle, onChange, onEnd });
    this.mode = 'year';
    this.playing = false;
    this.year = 0; // the last year shown (YEAR_NOW: everything)
    this.cutK = 0; // tallest first: how many of the tallest are removed
    this.cutValues = []; // the height quantity of the nuclides on screen, tallest first
    this.cutKey = ''; // the quantity cutValues was made for
    this.playYear = 0;
    this.playT = 0; // 0..1 along the removal
    this.years = chart.nuclides.filter((n) => n.y).map((n) => n.y);
    this.rikenYears = chart.nuclides.filter((n) => n.rk).map((n) => n.rk);
    this.yearMin = Math.max(1890, Math.min(...this.years));
    this.input = $('#year');
    this.label = $('#year-label');
    this.button = $('#play');
    this.select = $('#time-mode');
    this.input.min = this.yearMin;
    this.input.max = YEAR_NOW;
  }

  /** the slider was moved */
  seek(value) {
    if (this.mode === 'height') this.setCut(value);
    else this.setYear(value);
  }

  /** every nuclide back on screen, in the animation chosen */
  showAll() {
    if (this.mode === 'height') this.setCut(0);
    else this.setYear(YEAR_NOW);
  }

  /** back to how the page opens: the discovery years, everything shown */
  reset() {
    if (this.mode !== 'year') this.setMode('year');
    else this.setYear(YEAR_NOW);
  }

  /** switches between the discovery years and the tallest-first removal */
  setMode(mode) {
    const { chart, input } = this;
    this.stop();
    this.mode = mode;
    this.select.value = mode;
    this.button.setAttribute('aria-label', mode === 'height' ? '高い核から順に消す' : '発見の歴史を再生');
    this.year = YEAR_NOW;
    chart.yearLimit = Infinity;
    if (mode === 'height') {
      this.rebuildCut();
      this.setCut(0);
    } else {
      chart.heightCut = Infinity;
      input.min = this.yearMin;
      input.max = YEAR_NOW;
      input.step = 1;
      input.value = YEAR_NOW;
      chart.retarget();
      this.updateLabel();
    }
  }

  updateLabel() {
    if (this.mode === 'height') this.updateCutLabel();
    else this.updateYearLabel();
  }

  // ---------- the discovery years ----------
  setYear(y, { fromPlay = false } = {}) {
    y = Math.round(y);
    if (y === this.year) return;
    this.year = y;
    this.input.value = y;
    this.chart.yearLimit = y >= YEAR_NOW ? Infinity : y;
    this.chart.retarget();
    if (!fromPlay) this.stop();
    this.updateLabel();
    this.onChange({ redraw: true });
  }

  updateYearLabel() {
    const { chart, year } = this;
    const found = (chart.filter === 'riken' ? this.rikenYears : this.years).filter((v) => v <= year).length;
    const shown = () => chart.visible.reduce((a, v) => a + v, 0);
    this.label.innerHTML = chart.filter === 'riken'
      ? `<b>${year}年</b>までに理研で発見: ${found} 核種`
      : chart.filter === 'cycle'
        ? `<b>${this.cycle().map((k) => DISPLAY_MODES[k].short).join('・')}</b> ${shown()} 核種${year < YEAR_NOW ? `（${year}年までに発見）` : ''}`
        : `<b>${year}年</b>までに発見: ${found.toLocaleString()} 核種`;
  }

  // ---------- tallest first ----------
  // Step k hides the k tallest of the nuclides on screen (by the height quantity; ties go together).
  rebuildCut() {
    const { chart, input } = this;
    chart.heightCut = Infinity;
    chart.retarget();
    this.cutKey = chart.cutMetric();
    const metric = METRICS[this.cutKey];
    this.cutValues = [];
    chart.nuclides.forEach((nuc, i) => {
      if (chart.visible[i]) this.cutValues.push(metric.value(nuc) ?? Infinity);
    });
    this.cutValues.sort((a, b) => b - a);
    input.min = 0;
    input.max = Math.max(0, this.cutValues.length - 1);
    input.step = 1;
  }

  setCut(k, { fromPlay = false } = {}) {
    k = Math.max(0, Math.min(this.cutValues.length - 1, Math.round(k)));
    if (fromPlay && k === this.cutK) return;
    this.cutK = k;
    this.input.value = k;
    this.chart.heightCut = k === 0 ? Infinity : this.cutValues[k];
    this.chart.retarget();
    if (!fromPlay) this.stop();
    this.updateLabel();
    this.onChange({ redraw: false });
  }

  updateCutLabel() {
    const { chart } = this;
    const key = chart.cutMetric();
    const left = [];
    chart.visible.forEach((v, i) => v && left.push(i));
    const level = chart.heightCut === Infinity ? 'すべて' : `${METRICS[key].short} ≤ ${cutText(key, chart.heightCut)}`;
    const names = left.length <= 3 ? `（${left.map((i) => nucText(chart.nuclides[i])).join('、')}）` : '';
    this.label.innerHTML = `<b>${level}</b>：${left.length.toLocaleString()} 核種${names}`;
  }

  /** what is on screen changed: the removal starts over from the new set */
  refresh() {
    if (this.mode !== 'height') return;
    this.rebuildCut();
    this.setCut(0);
  }

  /** the same, when only the height quantity may have changed (2D and 3D remove by different quantities) */
  refreshIfMetricChanged() {
    if (this.chart.cutMetric() !== this.cutKey) this.refresh();
  }

  // ---------- playing ----------
  /** while an animation plays, only the chart and this bar stay on screen (body.playing) */
  play() {
    this.playing = true;
    this.button.textContent = '❚❚';
    document.body.classList.add('playing');
    if (this.mode === 'height') {
      const last = Math.max(1, this.cutValues.length - 1);
      const over = this.cutK >= last; // at the end: start again
      this.playT = over ? 0 : 1 - Math.sqrt(1 - this.cutK / last);
      this.setCut(over ? 0 : this.cutK, { fromPlay: true });
    } else {
      this.playYear = this.year >= YEAR_NOW ? this.yearMin : this.year;
      this.setYear(this.playYear, { fromPlay: true });
    }
  }

  stop() {
    this.playing = false;
    this.button.textContent = '▶';
    document.body.classList.remove('playing');
  }

  /** advances the animation that plays */
  step(dt) {
    if (!this.playing) return;
    let done;
    if (this.mode === 'height') {
      this.playT += dt / CUT_SECONDS;
      const last = this.cutValues.length - 1;
      done = this.playT >= 1;
      this.setCut(done ? last : last * (1 - (1 - this.playT) ** 2), { fromPlay: true }); // slower towards the valley floor
    } else {
      this.playYear += dt * YEARS_PER_SECOND;
      done = this.playYear >= YEAR_NOW;
      this.setYear(done ? YEAR_NOW : this.playYear, { fromPlay: true });
    }
    if (!done) return;
    this.stop();
    this.onEnd();
  }

  /** the nuclide an animation ends with: the last box left by the removal, or the latest discovery of the history */
  last() {
    const { chart } = this;
    if (this.mode === 'height') return chart.visible.indexOf(1);
    let best = -1;
    chart.nuclides.forEach((nuc, i) => {
      if (nuc.y && chart.visible[i] && (best < 0 || nuc.y > chart.nuclides[best].y)) best = i;
    });
    return best;
  }
}

/** a value of the height quantity `key`, as the label writes it */
function cutText(key, v) {
  if (key === 'hl') return v >= 22 ? '安定' : v <= -22 ? '非束縛' : fmtSeconds(10 ** v);
  if (key === 'fy') return `${+(10 ** v * 100).toPrecision(2)} %`;
  if (key === 'year') return `${v}年`;
  return `${+v.toFixed(Math.abs(v) < 10 ? 3 : 0)} ${METRICS[key].unit}`;
}
