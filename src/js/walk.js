// Walking mode: a plain ball rolls, hops and jumps over the tops of the boxes, and the camera follows it (a drag
// looks around it). The ground is the chart as it is drawn, each box at its height of the moment: the ball rests on
// every box it touches, as a ball would on a real model, so it rolls over the cracks between boxes and over a single
// missing box, and stops at a box taller than a step. Jumping again in the air lifts it again, so pressing the jump
// key over and over flies. Stars float over the doubly magic nuclei to be collected.
import * as THREE from 'three';
import { BOARD, FOOT } from './chart.js';
import { MAGIC } from './nuclear.js';
import { tr } from './i18n.js';

const R = 0.58; // the ball's radius: a little over half a box pitch, so that it cannot drop into a one-box gap
const STEP = 0.5; // a ledge up to this high is rolled up without a jump
const GRAVITY = 34;
const JUMP = Math.sqrt(2 * GRAVITY * 2.6); // a jump from the ground rises 2.6
const AIR_JUMP = 10.5; // each jump in the air sets the ball rising at this speed again: pressed quickly, it flies
const CEILING = 160; // how high it can fly (the tallest column is about 75)
const WALK = 6.5; // world units (box pitches) per second
const RUN = 13;
const SUBSTEP = 0.2; // the longest move checked at once, so that a slow frame cannot carry the ball through a wall
const COYOTE = 0.12; // seconds after rolling off an edge in which a jump still counts as from the ground
const HALF = FOOT / 2;
const CAMERA_START = new THREE.Vector3(0, 4, 8); // behind and above, in the ball's frame
const BALL = '#2f8cff';

const KEYS = {
  forward: ['w', 'arrowup'], back: ['s', 'arrowdown'], left: ['a', 'arrowleft'], right: ['d', 'arrowright'],
  run: ['shift'], jump: [' '],
};

export class WalkMode {
  /**
   * chart, camera, controls: the scene's. nuclides, find(z, n) -> index. onStand(i): the ball rests on another box
   * (-1: the board). onStar(i, found, total): a star was collected. onExit(i): the mode ended, resting on box i.
   * onSound(name, i): a moment that makes a sound — 'step' (each hop while rolling, on box i), 'land', 'jump',
   * 'airjump' (again in the air), 'star' and 'stars' (the last star).
   */
  constructor({ scene, chart, camera, controls, nuclides, find, onStand, onStar, onExit, onSound }) {
    Object.assign(this, { scene, chart, camera, controls, nuclides, find, onStand, onStar, onExit, onSound });
    this.on = false;
    this.held = new Set(); // keys held down
    this.pad = { x: 0, y: 0 }; // the touch stick, -1..1 (y up = forward)
    this.jumpWanted = false;
    this.pos = new THREE.Vector3(); // the bottom of the ball
    this.vy = 0;
    this.grounded = true;
    this.airTime = 0;
    this.yaw = 0; // which way the ball heads (0: towards +z)
    this.phase = 0; // of the hops while rolling
    this.squash = 0;
    this.standing = -2;
    this.group = this.buildCharacter();
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false }));
    this.shadow.renderOrder = 5;
    this.stars = new THREE.Group();
    this.hud = {
      box: document.querySelector('#walk-hud'), here: document.querySelector('#walk-here'),
      count: document.querySelector('#walk-stars'), keys: document.querySelector('#walk-keys'),
      pad: document.querySelector('#walk-pad'), jump: document.querySelector('#walk-jump'),
    };
    this.wireTouch();
  }

  // ---------- the character: a plain ball, with no face ----------
  buildCharacter() {
    const root = new THREE.Group();
    // its own light: nothing else in the scene is lit this way
    root.add(new THREE.HemisphereLight('#ffffff', '#9a958a', 3.2));
    const sun = new THREE.DirectionalLight('#ffffff', 2.4);
    sun.position.set(2, 5, 3);
    root.add(sun);
    const body = new THREE.Group(); // squashes and stretches about the ball's bottom
    root.add(body);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), new THREE.MeshLambertMaterial({ color: BALL }));
    ball.position.y = R;
    body.add(ball);
    this.body = body;
    return root;
  }

  // ---------- the ground ----------
  /** the top of the box at (Z, N), or 0 for the board (a box sunk under the board or hidden counts as the board) */
  boxTop(z, n) {
    const { chart } = this;
    if (n < 0 || z < 0 || n >= chart.grid.w || z >= chart.grid.h) return { top: 0, i: -1 };
    const i = chart.cellIndex[z * chart.grid.w + n];
    if (i < 0 || (!chart.visible[i] && chart.cur[i] < 0.02)) return { top: 0, i: -1 };
    return { top: Math.max(0, chart.cur[i] - chart.shift), i };
  }

  /**
   * What the ball meets with its bottom at (x, y, wz) (world coordinates): `rest`, the lowest its bottom can be there,
   * resting on the board or on the edges and tops of the boxes under it; `under`, the box it rests on (-1: the
   * board); `wall`, whether a box it overlaps stands higher than a step above y.
   */
  probe(x, wz, y) {
    const zf = -wz;
    let rest = 0, under = -1, wall = false;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dn = -1; dn <= 1; dn++) {
        const n = Math.round(x) + dn, z = Math.round(zf) + dz;
        // horizontal distance from the ball's middle to the box's top square
        const ex = Math.max(Math.abs(x - n) - HALF, 0), ez = Math.max(Math.abs(zf - z) - HALF, 0);
        const d2 = ex * ex + ez * ez;
        if (d2 >= R * R) continue;
        const b = this.boxTop(z, n);
        if (b.i < 0) continue;
        if (b.top > y + STEP) wall = true;
        // a sphere on the edge (or the top) of the box
        const h = b.top + Math.sqrt(R * R - d2) - R;
        if (h > rest - 1e-6) {
          rest = Math.max(rest, h);
          under = b.i;
        }
      }
    }
    return { rest, under, wall };
  }

  // ---------- starting and stopping ----------
  /** starts on nuclide i (or on ⁵⁶Fe, the bottom of the valley, when i < 0) */
  start(i) {
    if (this.on) return;
    if (i < 0) i = this.find(26, 30);
    const nuc = this.nuclides[i];
    this.on = true;
    this.pos.set(nuc.n, 0, -nuc.z);
    this.pos.y = this.probe(this.pos.x, this.pos.z, Infinity).rest;
    this.vy = 0;
    this.grounded = true;
    this.yaw = Math.PI; // facing away from the camera, which starts in front of the chart
    this.standing = -2;
    this.held.clear();
    this.scene.add(this.group, this.shadow, this.stars);
    this.placeStars();
    this.startTime = performance.now();
    // the camera: behind the ball; dragging turns around it, the wheel or a pinch comes nearer
    const c = this.controls;
    this.saved = { pan: c.enablePan, zoomToCursor: c.zoomToCursor, min: c.minDistance, max: c.maxDistance };
    c.enablePan = false;
    c.zoomToCursor = false;
    c.minDistance = 2;
    c.maxDistance = 50;
    const head = this.head();
    c.target.copy(head);
    this.camera.position.copy(head).add(CAMERA_START.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw + Math.PI));
    document.body.classList.add('walking');
    this.hud.box.hidden = false;
    this.hud.keys.hidden = false;
    this.showTouch(matchMedia('(hover: none)').matches);
    this.update(0);
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    this.scene.remove(this.group, this.shadow, this.stars);
    const c = this.controls;
    Object.assign(c, { enablePan: this.saved.pan, zoomToCursor: this.saved.zoomToCursor, minDistance: this.saved.min, maxDistance: this.saved.max });
    document.body.classList.remove('walking');
    this.hud.box.hidden = this.hud.keys.hidden = true;
    this.showTouch(false);
    this.onExit(this.standing);
  }

  /** where the camera looks: just above the ball */
  head() {
    return this.pos.clone().add(new THREE.Vector3(0, R * 2 + 0.2, 0));
  }

  // ---------- stars over the doubly magic nuclei ----------
  placeStars() {
    this.stars.clear();
    const shape = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 0.17 : 0.4, a = (k / 10) * Math.PI * 2 + Math.PI / 2;
      shape[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }).translate(0, 0, -0.05);
    const mat = new THREE.MeshLambertMaterial({ color: '#ffc21a', emissive: '#6a4a00' });
    this.nuclides.forEach((nuc, i) => {
      if (!MAGIC.includes(nuc.z) || !MAGIC.includes(nuc.n) || !nuc.y || !this.chart.visible[i]) return;
      const star = new THREE.Mesh(geo, mat);
      star.userData = { i, found: false };
      this.stars.add(star);
    });
    this.found = 0;
    this.total = this.stars.children.length;
    this.updateCount();
  }

  updateCount(done) {
    this.hud.count.innerHTML = done
      ? tr(`★ 二重魔法数の核を全部見つけました！（${done}）`, `★ You found every doubly magic nucleus! (${done})`)
      : `<span class="walk-star">★</span> ${tr('二重魔法数の核の星', 'Stars of the doubly magic nuclei')} <b>${this.found} / ${this.total}</b>`;
  }

  // ---------- input ----------
  /** a key went down or up while walking; true when the key was the mode's */
  key(e, down) {
    const k = e.key.toLowerCase();
    if (down && k === 'escape') {
      this.stop();
      return true;
    }
    const ours = Object.values(KEYS).some((list) => list.includes(k));
    if (!ours) return false;
    if (down) {
      if (k === ' ' && !e.repeat) this.jumpWanted = true; // each press jumps; holding the key does not
      this.held.add(k);
    } else this.held.delete(k);
    return true;
  }

  heldAny(name) {
    return KEYS[name].some((k) => this.held.has(k));
  }

  showTouch(on) {
    this.hud.pad.hidden = this.hud.jump.hidden = !on;
    document.body.classList.toggle('walk-touch', on);
  }

  /** the stick (bottom left) and the jump button (bottom right) on touch screens */
  wireTouch() {
    const { pad, jump } = this.hud;
    const knob = pad.querySelector('.walk-knob');
    let id = null;
    const move = (e) => {
      const r = pad.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = -(e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      this.pad = { x, y };
      knob.style.transform = `translate(${x * r.width * 0.32}px, ${-y * r.height * 0.32}px)`;
    };
    const end = () => {
      id = null;
      this.pad = { x: 0, y: 0 };
      knob.style.transform = '';
    };
    pad.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      pad.setPointerCapture(id);
      move(e);
      e.preventDefault();
    });
    pad.addEventListener('pointermove', (e) => e.pointerId === id && move(e));
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    jump.addEventListener('pointerdown', (e) => {
      this.jumpWanted = true;
      e.preventDefault();
    });
    // a first touch anywhere while walking brings the touch controls
    window.addEventListener('pointerdown', (e) => this.on && e.pointerType === 'touch' && this.hud.pad.hidden && this.showTouch(true));
  }

  // ---------- each frame ----------
  update(dt) {
    if (!this.on) return;
    const { camera, controls, pos } = this;
    // which way to go: the keys or the stick, turned to the camera's heading
    const ix = (this.heldAny('right') ? 1 : 0) - (this.heldAny('left') ? 1 : 0) + this.pad.x;
    const iy = (this.heldAny('forward') ? 1 : 0) - (this.heldAny('back') ? 1 : 0) + this.pad.y;
    const amount = Math.min(1, Math.hypot(ix, iy));
    const ahead = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0);
    if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, -1);
    ahead.normalize();
    const right = new THREE.Vector3(-ahead.z, 0, ahead.x);
    const dir = right.multiplyScalar(ix).addScaledVector(ahead, iy);
    const running = this.heldAny('run') || Math.hypot(this.pad.x, this.pad.y) > 0.96;
    const speed = (running ? RUN : WALK) * amount;
    if (dir.lengthSq() > 1e-6) {
      dir.normalize();
      const want = Math.atan2(dir.x, dir.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-dt * 14));
    }
    const before = pos.clone();
    // across, in short steps: a box higher than a step stops the ball, which slides along it
    const tryMove = (dx, dz) => {
      const x = THREE.MathUtils.clamp(pos.x + dx, BOARD.x0 + R, BOARD.x1 - R);
      const z = THREE.MathUtils.clamp(pos.z + dz, BOARD.z0 + R, BOARD.z1 - R);
      if (this.probe(x, z, pos.y).wall) return false;
      pos.x = x;
      pos.z = z;
      return true;
    };
    const travel = speed * dt;
    if (travel > 0) {
      const steps = Math.ceil(travel / SUBSTEP);
      const dx = (dir.x * travel) / steps, dz = (dir.z * travel) / steps;
      for (let k = 0; k < steps; k++) if (!tryMove(dx, dz) && !tryMove(dx, 0)) tryMove(0, dz);
    }
    // up and down: gravity; a jump from the ground, and again in the air as often as asked (flying); landing; rolling
    // up or down small ledges
    const ground = this.probe(pos.x, pos.z, pos.y);
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (this.jumpWanted) {
      this.jumpWanted = false;
      if (this.grounded || this.airTime < COYOTE) {
        this.vy = JUMP;
        this.airTime = COYOTE;
        this.onSound('jump');
      } else {
        this.vy = Math.max(this.vy, AIR_JUMP);
        this.onSound('airjump');
      }
      this.grounded = false;
      this.squash = -0.5; // stretched as it leaves
    }
    if (this.grounded && pos.y - ground.rest < STEP && this.vy <= 0) {
      pos.y = ground.rest; // on the ground, down small ledges too
      this.vy = 0;
    } else {
      this.vy -= GRAVITY * dt;
      pos.y += this.vy * dt;
      if (pos.y > CEILING) {
        pos.y = CEILING;
        this.vy = Math.min(this.vy, 0);
      }
      this.grounded = false;
      if (pos.y <= ground.rest) {
        if (this.vy < -8) this.squash = Math.min(1, -this.vy / 30);
        if (this.vy < -4) this.onSound('land'); // not for the little drops of rolling down a ledge
        pos.y = ground.rest;
        this.vy = 0;
        this.grounded = true;
      }
    }
    if (pos.y < ground.rest) pos.y = ground.rest; // a box grew under it

    // the ball: it turns to where it goes; it hops a little as it rolls, squashes on landing, stretches in the air
    const moved = Math.hypot(pos.x - before.x, pos.z - before.z);
    const hop = Math.floor(this.phase / Math.PI);
    this.phase += moved * 2.2;
    // a tap each time a hop comes down, at the pitch of the box underfoot
    if (this.grounded && Math.floor(this.phase / Math.PI) !== hop) this.onSound('step', ground.under);
    this.squash += (0 - this.squash) * (1 - Math.exp(-dt * 6));
    const rolling = this.grounded && moved > 1e-4;
    const stretch = this.grounded ? this.squash : Math.min(this.squash, THREE.MathUtils.clamp(-Math.abs(this.vy) * 0.012, -0.25, 0));
    this.group.position.copy(pos);
    this.group.rotation.y = this.yaw;
    this.body.position.y = rolling ? Math.abs(Math.sin(this.phase)) * 0.12 : 0;
    this.body.scale.set(1 + stretch * 0.18, 1 - stretch * 0.22, 1 + stretch * 0.18);
    const height = pos.y - ground.rest;
    this.shadow.position.set(pos.x, ground.rest + 0.015, pos.z);
    this.shadow.scale.setScalar(Math.max(0.35, 1 - height * 0.08));
    this.shadow.material.opacity = 0.28 * Math.max(0.2, 1 - height * 0.06);

    // the camera keeps its angle and distance and comes along
    const head = this.head();
    const delta = head.sub(controls.target).multiplyScalar(dt > 0 ? 1 - Math.exp(-dt * 12) : 1);
    controls.target.add(delta);
    camera.position.add(delta);

    // the box it rests on (reported on landing and while rolling across tops)
    const on = this.grounded ? ground.under : this.standing;
    if (on !== this.standing) {
      this.standing = on;
      this.onStand(on);
    }
    this.updateStars();
  }

  updateStars() {
    const t = performance.now() / 1000;
    const middle = this.pos.clone().add(new THREE.Vector3(0, R, 0));
    for (const star of this.stars.children) {
      const { i } = star.userData;
      const nuc = this.nuclides[i];
      const shown = !star.userData.found && this.chart.visible[i];
      star.visible = shown;
      if (!shown) continue;
      const top = Math.max(0, this.chart.cur[i] - this.chart.shift);
      star.position.set(nuc.n, top + R + 0.5 + Math.sin(t * 2 + i) * 0.1, -nuc.z);
      star.rotation.y = t * 1.8 + i;
      if (star.position.distanceTo(middle) < R + 0.4) {
        star.userData.found = true;
        this.found++;
        this.updateCount(this.found === this.total ? this.clock() : null);
        this.onStar(i, this.found, this.total);
        this.onSound(this.found === this.total ? 'stars' : 'star');
      }
    }
  }

  /** how long the walk has taken, as m:ss */
  clock() {
    const s = Math.round((performance.now() - this.startTime) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
