// Selecting a nucleus taps its column, which rings like a cantilever: a bar clamped at the board, free at the top.
// For a uniform cantilever (Euler–Bernoulli) the bending modes are f_k = (β_k² / 2π) √(EI / ρA) / L², so with the
// same material and cross-section the pitch goes as 1 / L². (The static stiffness 3EI / L³ is what goes as L⁻³.)
// The overtones sit at the fixed ratios (β_k / β_1)² = 1 : 6.267 : 17.55, which gives the tone its metallic ring.
// The scale is set so that the column of ¹²C sounds A4 = 440 Hz; fundamentals are kept within the piano's range.
export const REF_HZ = 440;
const F_MIN = 27.5; // A0
const F_MAX = 4186; // C8
// [frequency ratio, amplitude, decay time relative to the fundamental's]
const MODES = [[1, 1, 1], [6.267, 0.35, 0.45], [17.547, 0.12, 0.2]];

/** fundamental (Hz) of a column of length len, scaled so that a column of length ref rings at 440 Hz */
export function cantileverHz(len, ref) {
  const f = REF_HZ * (Math.max(ref, 0.05) / len) ** 2;
  return Math.min(F_MAX, Math.max(F_MIN, f));
}

export class ColumnSound {
  constructor() {
    this.on = false;
    this.ctx = null;
  }

  setOn(on) {
    this.on = on;
    if (on) this.context();
  }

  // the audio context can only start from a click or key press; it is made on the first one
  context() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** a struck bar: the three lowest bending modes, each fading away, low notes ringing longer.
   *  force: play even while muted (for something the viewer asked to hear, such as a melody) */
  ring(f1, { force = false } = {}) {
    if (!this.on && !force) return;
    const ctx = this.context();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.005;
    const out = ctx.createGain();
    out.gain.value = 0.22;
    out.connect(ctx.destination);
    const decay = Math.min(3.5, Math.max(0.4, 1.8 * Math.sqrt(REF_HZ / f1)));
    for (const [ratio, amp, rel] of MODES) {
      const f = f1 * ratio;
      if (f > 16000) continue;
      const T = decay * rel;
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + T);
      osc.connect(g).connect(out);
      osc.start(t0);
      osc.stop(t0 + T + 0.05);
    }
  }
}
