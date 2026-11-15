// Display mode (the d key), for a screen at an exhibition: the panels and bars step aside (body.display) and the
// camera circles the chart; now and then the discovery history or the removal by height plays, and the camera goes
// up to the nuclide it ends with. A click, a touch, the wheel or a key ends the mode, and does nothing else.
import { nucText, LEGO_RED } from './nuclear.js';

const ACTS = ['year', 'height']; // the timeline's animations, played in turn
const FIRST_WAIT = 20, WAIT = 30, LOOK = 8; // seconds of circling before the first and before each later one; of looking at the last nuclide

export class DisplayMode {
  /**
   * app: what the mode drives — { controls, views, timeline, decay, nuclides,
   *   enter(): clears the page for the show and returns a function that puts back the options an animation changes,
   *   play(): starts the timeline's animation, as its button does,
   *   exit(): called when the mode ends }
   */
  constructor(app) {
    this.app = app;
    this.on = false;
    this.phase = 'orbit'; // circling (orbit) -> an animation (play) -> at the nuclide it ends with (look) -> circling
    this.t = 0; // seconds in this phase
    this.wait = 0;
    this.act = 0;
    this.restore = () => {};
    for (const type of ['pointerdown', 'wheel']) {
      window.addEventListener(type, (e) => {
        if (!this.on) return;
        e.stopPropagation(); // the touch that ends the mode does nothing else
        this.stop();
      }, { capture: true });
    }
  }

  start() {
    if (this.on) return;
    this.setOn(true);
    this.restore = this.app.enter();
    this.phase = 'orbit';
    this.t = 0;
    this.wait = FIRST_WAIT;
  }

  stop() {
    if (!this.on) return;
    const { timeline, decay } = this.app;
    this.setOn(false);
    timeline.stop();
    decay.setCallouts([]);
    timeline.reset();
    this.restore();
    this.app.exit();
  }

  setOn(on) {
    this.on = on;
    document.body.classList.toggle('display', on);
    this.app.controls.autoRotate = on;
    this.app.controls.autoRotateSpeed = 0.6;
  }

  update(dt) {
    if (!this.on) return;
    const { controls, views, timeline, decay, nuclides } = this.app;
    controls.autoRotate = !views.flying;
    if (views.flying) return;
    this.t += dt;
    if (this.phase === 'orbit' && this.t >= this.wait) {
      const mode = ACTS[this.act++ % ACTS.length];
      if (timeline.mode !== mode) timeline.setMode(mode);
      this.app.play();
      this.phase = 'play';
    } else if (this.phase === 'play' && !timeline.playing) {
      const i = timeline.last();
      if (i >= 0) {
        const nuc = nuclides[i];
        const text = timeline.mode === 'height' ? `最後に残った核 ${nucText(nuc)}` : `いちばん新しく見つかった核 ${nucText(nuc)}（${nuc.y} 年）`;
        decay.setCallouts([{ idx: i, text, bg: LEGO_RED }]);
        views.flyTo(views.closeUp(i), 2.2);
      }
      this.phase = 'look';
      this.t = 0;
    } else if (this.phase === 'look' && this.t >= LOOK) {
      // everything back (the removal ends with one box, the history hides the unobserved nuclei), and the whole chart
      decay.setCallouts([]);
      if (timeline.mode === 'height') timeline.setMode('year');
      this.restore();
      views.flyTo(views.overview(), 2);
      this.phase = 'orbit';
      this.t = 0;
      this.wait = WAIT;
    }
  }
}
