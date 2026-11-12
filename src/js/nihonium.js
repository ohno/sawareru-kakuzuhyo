// "ニホニウムの強調": ²⁷⁸Nh, the nucleus by which RIKEN found element 113 (2004), shimmers in light blue under a
// column of light, with sparkles twinkling around it. Light mode blends normally (an additive glow vanishes on a
// light background); dark mode adds light.
import * as THREE from 'three';
import { FOOT } from './chart.js';

const Z_NH = 113;
const A_RIKEN = 278;
const BEAM_H = 16;
const SPARKS = 900;

function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(240,255,255,1)');
  r.addColorStop(0.18, 'rgba(170,236,255,0.75)');
  r.addColorStop(0.5, 'rgba(90,200,255,0.2)');
  r.addColorStop(1, 'rgba(60,180,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ²⁷⁸Nh as the chart writes it on a box top (mass number small at the far left, the symbol below), but in white
// letters with a dark rim, so that it stays readable in the light that would wash out the chart's own label
function labelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.strokeStyle = '#06324d';
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  const write = (text, weight, size, x, y) => {
    g.font = `${weight} ${size}px Inter, "Helvetica Neue", Arial, sans-serif`;
    g.lineWidth = size * 0.22;
    g.strokeText(text, x, y);
    g.fillText(text, x, y);
  };
  // the layout of the chart's label atlas (chart.js) on the box top: the mass number from the left edge of the
  // upper strip, the symbol centered below it
  g.textAlign = 'left';
  write(String(A_RIKEN), 500, 44, 24, 59);
  g.textAlign = 'center';
  write('Nh', 600, 92, 128, 146);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// a widening cone of light, brightest at its foot and along its axis, with streaks running upward
const beamVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vRim;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vRim = 1.0 - abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;
const beamFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vRim;
  void main() {
    float fall = pow(1.0 - vUv.y, 1.8);
    float core = 1.0 - vRim * vRim;
    float streak = 0.7 + 0.3 * sin(vUv.y * 46.0 - uTime * 4.0 + sin(vUv.x * 18.85) * 2.0);
    gl_FragColor = vec4(uColor, fall * core * streak * uOpacity);
  }
`;

// sparkles drift around and up the column and twinkle; positions come from a per-sparkle seed, nothing is stored.
// Half of them stay low and spread wide over the neighbouring boxes, the rest rise with the light.
const sparkVertex = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  attribute vec3 aSeed;
  varying float vA;
  void main() {
    bool low = aSeed.z < 0.5;
    float h = fract(aSeed.x + uTime * (0.03 + 0.04 * aSeed.y));
    float ang = aSeed.z * 12.566 + uTime * (0.25 + aSeed.y * 0.4) * (low ? -1.0 : 1.0);
    float r = low ? 0.8 + 6.5 * aSeed.y : 0.3 + 3.6 * aSeed.y * (0.3 + h);
    float y = low ? 0.25 + 1.6 * h : h * ${(BEAM_H * 0.7).toFixed(1)};
    vec3 p = position + vec3(cos(ang) * r, y, sin(ang) * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float twinkle = pow(0.5 + 0.5 * sin(uTime * (2.5 + aSeed.z * 6.0) + aSeed.x * 40.0), 3.0);
    vA = (1.0 - h) * smoothstep(0.0, 0.06, h) * twinkle;
    gl_PointSize = uScale * (0.45 + 0.6 * aSeed.y) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const sparkFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float core = smoothstep(0.5, 0.0, length(p));
    float star = max(0.0, 1.0 - abs(p.x) * 14.0) * max(0.0, 1.0 - abs(p.y) * 2.2)
               + max(0.0, 1.0 - abs(p.y) * 14.0) * max(0.0, 1.0 - abs(p.x) * 2.2);
    float a = (core * core + star) * vA * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.6), a);
  }
`;

// light mode needs deeper colours to stand out on the pale board; dark mode adds light
const THEMES = {
  light: {
    blending: THREE.NormalBlending, beam: [0.0, 0.58, 0.95], beamA: 1, core: [0.75, 0.95, 1.0], spark: [0.0, 0.5, 0.95],
    halo: [0.25, 0.75, 1.0], haloA: 1, aura: 0.9,
  },
  dark: {
    blending: THREE.AdditiveBlending, beam: [0.4, 0.88, 1.0], beamA: 1, core: [0.85, 1.0, 1.0], spark: [0.6, 0.97, 1.0],
    halo: [0.6, 0.95, 1.0], haloA: 1, aura: 0.95,
  },
};

export class NihoniumGlow {
  constructor(scene, chart) {
    this.chart = chart;
    this.enabled = false;
    this.main = chart.nuclides.findIndex((nuc) => nuc.z === Z_NH && nuc.a === A_RIKEN);
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // a bright halo on the box and a wide, faint aura that lights up the boxes around it
    const tex = haloTexture();
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.halo.renderOrder = 3;
    this.aura.renderOrder = 2;
    this.group.add(this.aura, this.halo);

    this.column = new THREE.Group();
    this.group.add(this.column);
    // a wide column of light with a narrow, brighter core inside
    const beamMesh = (rTop, rBottom, order) => {
      const geo = new THREE.CylinderGeometry(rTop, rBottom, BEAM_H, 48, 1, true);
      geo.translate(0, BEAM_H / 2, 0);
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Color() } },
        vertexShader: beamVertex, fragmentShader: beamFragment,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.renderOrder = order;
      this.column.add(m);
      return m;
    };
    this.beam = beamMesh(2.4, 0.9, 4);
    this.core = beamMesh(0.7, 0.35, 5);

    const seeds = new Float32Array(SPARKS * 3).map(() => Math.random());
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    sparkGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    this.sparks = new THREE.Points(sparkGeo, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Color() } },
      vertexShader: sparkVertex, fragmentShader: sparkFragment,
      transparent: true, depthWrite: false,
    }));
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 5;
    this.column.add(this.sparks);

    // the name on the box top, drawn after the light
    this.label = new THREE.Mesh(
      new THREE.PlaneGeometry(FOOT, FOOT),
      new THREE.MeshBasicMaterial({ map: labelTexture(), transparent: true, depthWrite: false }),
    );
    this.label.rotation.x = -Math.PI / 2;
    this.label.renderOrder = 6;
    this.group.add(this.label);
    this.setTheme('light');
  }

  setTheme(theme) {
    const t = THEMES[theme] || THEMES.light;
    this.look = t;
    for (const m of [this.beam.material, this.core.material, this.sparks.material, this.halo.material, this.aura.material]) {
      m.blending = t.blending;
      m.needsUpdate = true;
    }
    this.halo.material.color.setRGB(...t.halo);
    this.aura.material.color.setRGB(...t.halo);
    this.beam.material.uniforms.uColor.value.setRGB(...t.beam);
    this.core.material.uniforms.uColor.value.setRGB(...t.core);
    this.sparks.material.uniforms.uColor.value.setRGB(...t.spark);
  }

  setEnabled(on) {
    this.enabled = on;
    this.group.visible = on && this.main >= 0;
    this.chart.setGlow(this.main >= 0 ? [this.main] : [], on ? 1 : 0);
    if (!on) this.chart.uniforms.uSpot.value.z = 0;
  }

  /** follows the animated box height; pxScale converts a world size at unit distance to pixels */
  update(time, pxScale, camera) {
    if (!this.enabled || this.main < 0) return;
    const chart = this.chart;
    this.group.visible = chart.visible[this.main] === 1;
    // the labels of the boxes around are drawn again over the light (chart.js, LABEL_ONLY)
    const nh = chart.nuclides[this.main];
    chart.uniforms.uSpot.value.set(nh.n, -nh.z, this.group.visible ? 14 : 0);
    if (!this.group.visible) return;
    const dim = 1 - chart.uniforms.uFocus.value * 0.75; // fades with the rest while another nucleus is selected
    const nuc = chart.nuclides[this.main];
    const top = Math.max(0, chart.heightOf(this.main));
    const pulse = Math.sin(time * 2.4);
    this.halo.position.set(nuc.n, top + 0.3, -nuc.z);
    this.halo.scale.setScalar(11 * (1 + 0.12 * pulse));
    this.halo.material.opacity = this.look.haloA * dim;
    this.aura.position.set(nuc.n, top + 0.5, -nuc.z);
    this.aura.scale.setScalar(26 * (1 + 0.06 * pulse));
    this.aura.material.opacity = this.look.aura * dim * (0.85 + 0.15 * pulse);
    this.column.position.set(nuc.n, top, -nuc.z);
    // the label shows and fades with the distance like the box-top labels of the chart
    const u = chart.uniforms;
    this.label.visible = u.uLabels.value > 0.5;
    this.label.position.set(nuc.n, top + 0.02, -nuc.z);
    const d = camera.position.distanceTo(this.label.position);
    this.label.material.opacity = 1 - THREE.MathUtils.smoothstep(d, u.uLabelNear.value, u.uLabelFar.value);
    const b = this.beam.material.uniforms, c = this.core.material.uniforms, k = this.sparks.material.uniforms;
    b.uTime.value = c.uTime.value = k.uTime.value = time;
    b.uOpacity.value = this.look.beamA * dim * (0.85 + 0.15 * Math.sin(time * 1.3));
    c.uOpacity.value = dim * (0.9 + 0.1 * Math.sin(time * 2.1));
    k.uOpacity.value = dim;
    k.uScale.value = pxScale;
  }
}
