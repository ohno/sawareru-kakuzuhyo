// The pointer on the canvas: what a drag does (OrbitControls), the two-finger slide of a touchpad, and which
// nuclide is under the pointer or was clicked.
import * as THREE from 'three';
import { HYPER_BASE } from './hyper.js';

export class Pointer {
  /**
   * onHover(id, x, y): the nuclide (or hypernucleus) under the pointer changed or the pointer moved over it;
   *   id -1: none; x, y: the pointer in CSS pixels (missing when it left the canvas).
   * onClick(id): a click or tap, after onHover for the same spot.
   * onMove(): the viewer moved the view (a drag, a wheel step or a touchpad slide).
   */
  constructor({ canvas, camera, controls, chart, hyper, onHover, onClick, onMove }) {
    Object.assign(this, { camera, controls, chart, hyper, onHover, onClick });
    this.raycaster = new THREE.Raycaster();
    this.at = new THREE.Vector2(); // where the pointer is, from -1 to 1 across the window
    this.px = { x: 0, y: 0 }; // the same in CSS pixels
    this.moved = false; // the pointer moved since the last frame
    this.downAt = null; // where the button went down, until a click comes of it

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
      if (!isSlide(e)) {
        if (controls.enabled) onMove(); // OrbitControls zooms
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation(); // keep OrbitControls from zooming
      slideUntil = performance.now() + 250;
      onMove();
      // move along the floor by as many world units as the slide covers on screen
      const dist = camera.position.distanceTo(controls.target);
      const perPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / window.innerHeight;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).setY(0).normalize();
      const ahead = new THREE.Vector3().crossVectors(camera.up, right).normalize();
      const move = right.multiplyScalar(e.deltaX * perPx).addScaledVector(ahead, -e.deltaY * perPx);
      camera.position.add(move);
      controls.target.add(move);
    }, { capture: true, passive: false });

    canvas.addEventListener('pointermove', (e) => {
      this.track(e);
      if (e.buttons === 0) this.moved = true; // no hover churn while orbiting
      else if (controls.enabled && this.strayed(e, 5)) onMove(); // a drag
    });
    canvas.addEventListener('pointerleave', () => {
      this.moved = false;
      onHover(-1);
    });
    // a tap or click selects; gestures with two fingers never do
    const touching = new Set();
    let multiTouch = false;
    canvas.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY };
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
      // (a touch may stray further than a mouse during a click)
      if (!this.downAt || this.strayed(e, e.pointerType === 'touch' ? 12 : 5) || e.button !== 0) return;
      this.downAt = null;
      this.track(e);
      onClick(this.hover());
    });
  }

  /** 'rotate': drag rotates, right/middle drag pans. 'pan': drag pans, right drag rotates. Touch: 1 finger = drag, 2 fingers = pan + pinch zoom. */
  setDragMode(mode) {
    const pan = mode === 'pan';
    this.controls.mouseButtons = {
      LEFT: pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: pan ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
    };
    this.controls.touches = { ONE: pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }

  /** whether the pointer is more than `slack` px from where its button went down */
  strayed(e, slack) {
    const down = this.downAt;
    return !!down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > slack;
  }

  track(e) {
    this.at.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.px = { x: e.clientX, y: e.clientY };
  }

  /** the id of what is under the pointer (a nuclide index, HYPER_BASE + k for a hypernucleus, or -1) */
  pick() {
    const { chart, hyper, raycaster } = this;
    raycaster.setFromCamera(this.at, this.camera);
    // boxes thinned out by the line-of-sight fade can be pointed through
    const hit = raycaster.intersectObject(chart.mesh, false)
      .find((h) => chart.visible[h.instanceId] && h.point.y > -0.01 // not the part sunk under the board
        && (chart.emph[h.instanceId] > 0.5 || chart.xrayFade(h.point, this.camera) < 0.4));
    const hy = hyper.pick(raycaster);
    return hy && (!hit || hy.distance < hit.distance) ? HYPER_BASE + hy.k : hit ? hit.instanceId : -1;
  }

  /** reports what is under the pointer, and returns it */
  hover() {
    const id = this.pick();
    this.onHover(id, this.px.x, this.px.y);
    return id;
  }

  /** once per frame: looks under a pointer that has moved (not while `idle`) */
  update(idle = false) {
    if (!this.moved) return;
    this.moved = false;
    if (!idle) this.hover();
  }

  /** the button that is down will not count as a click */
  cancelClick() {
    this.downAt = null;
  }
}
