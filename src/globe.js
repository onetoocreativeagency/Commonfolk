import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';
import { beans, drawCharacter, CHARACTER_SIZE, CHARACTER_BASE } from './characters.js';

const R = 1;
const DEG = Math.PI / 180;
const BASE_DISTANCE = 4.2;
const LAND = feature(land110, land110.objects.land);
const COASTLINE = mesh(land110, land110.objects.land);

// Globe colour → CSS custom property it's read from (on the container).
export const COLOR_TOKENS = {
  ocean: '--cf-globe-ocean',
  land: '--cf-globe-land',
  ink: '--cf-globe-ink',
  sticker: '--cf-globe-sticker',
  wave: '--cf-globe-wave',
  pin: '--cf-globe-pin',
  pinActive: '--cf-globe-pin-active',
  arc: '--cf-globe-arc',
  home: '--cf-globe-home',
};
// Colours baked into the sticker artwork (pins, cup, characters); the rest are shader uniforms.
const STICKER_COLORS = ['pin', 'pinActive', 'ink', 'sticker', 'home', 'land', 'ocean', 'wave'];

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export function latLngToVector3(lat, lng, radius = R) {
  const phi = (90 - lat) * DEG;
  const theta = (lng + 180) * DEG;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function slerpVectors(a, b, t) {
  const angle = a.angleTo(b);
  if (angle < 1e-6) return a.clone();
  const s = Math.sin(angle);
  return a.clone().multiplyScalar(Math.sin((1 - t) * angle) / s)
    .add(b.clone().multiplyScalar(Math.sin(t * angle) / s));
}

// Seeded random, so the map artwork comes out the same on every redraw.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// Rasterise the land polygons once for quick land/sea lookups.
function buildLandLookup(width = 2048, height = 1024) {
  const ctx = makeCanvas(width, height).getContext('2d', { willReadFrequently: true });
  const projection = geoEquirectangular().scale(width / (2 * Math.PI)).translate([width / 2, height / 2]);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  geoPath(projection, ctx)(LAND);
  ctx.fill();
  const { data } = ctx.getImageData(0, 0, width, height);
  return (lat, lng) => {
    const x = Math.min(width - 1, Math.floor((((lng + 540) % 360) / 360) * width)); // wraps any longitude
    const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * height)));
    return data[(y * width + x) * 4] > 128;
  };
}

// The map artwork as a channel mask: R = land, G = ink (coastline + speckles),
// B = wave marks. Colours are applied in the shader, so recolouring is instant.
// Sizes are in texels at 4096px wide and scaled to the canvas.
function drawMapMask(canvas, isLand, settings) {
  const { width: W, height: H } = canvas;
  const k = W / 4096;
  const ctx = canvas.getContext('2d');
  const projection = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
  const path = geoPath(projection, ctx);
  const rand = mulberry32(42);

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f00';
  ctx.beginPath();
  path(LAND);
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // "~" wave marks out at sea, kept clear of the coasts. Horizontal sizes are
  // stretched by 1/cos(lat) to undo the equirectangular squash.
  ctx.strokeStyle = '#00f';
  ctx.lineWidth = 7 * k;
  const nearLand = (lat, lng) => [[0, 0], [4, 0], [-4, 0], [0, 6], [0, -6]].some(([a, b]) => isLand(lat + a, lng + b));
  const waves = Math.round(180 * settings.waves);
  for (let placed = 0, tries = 0; placed < waves && tries < waves * 30; tries++) {
    const lat = (rand() * 2 - 1) * 60;
    const lng = rand() * 360 - 180;
    if (nearLand(lat, lng)) continue;
    const [x, y] = projection([lng, lat]);
    const half = (40 * k) / Math.cos(lat * DEG);
    ctx.beginPath();
    ctx.moveTo(x - half, y);
    ctx.quadraticCurveTo(x - half / 2, y - 18 * k, x, y);
    ctx.quadraticCurveTo(x + half / 2, y + 18 * k, x + half, y);
    ctx.stroke();
    placed++;
  }

  // Sketchy speckle dashes inland.
  ctx.strokeStyle = '#0f0';
  ctx.lineWidth = 5 * k;
  const speckles = Math.round(900 * settings.speckles);
  for (let placed = 0, tries = 0; placed < speckles && tries < speckles * 10; tries++) {
    const lat = Math.asin(rand() * 2 - 1) / DEG;
    const lng = rand() * 360 - 180;
    if (lat < -58 || !isLand(lat, lng) || !isLand(lat + 1.5, lng) || !isLand(lat - 1.5, lng)) continue;
    const [x, y] = projection([lng, lat]);
    const stretch = 1 / Math.cos(lat * DEG);
    const angle = rand() * Math.PI;
    const dx = Math.cos(angle) * 9 * k * stretch;
    const dy = Math.sin(angle) * 9 * k;
    ctx.beginPath();
    ctx.moveTo(x - dx, y - dy);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
    placed++;
  }

  // Inked coastline (drawn from the shared borders, so the antimeridian cut isn't outlined).
  ctx.lineWidth = settings.coastlineWidth * k;
  ctx.beginPath();
  path(COASTLINE);
  ctx.stroke();

  // Leave Antarctica off, keeping the south pole clean.
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  const [, cut] = projection([0, -60]);
  ctx.fillRect(0, cut, W, H - cut);
}

// Hand-drawn "boil": every globe layer is nudged by the same slowly-stepping
// noise, so the outline jitters like frames of a hand-drawn animation.
const WOBBLE_GLSL = /* glsl */ `
  uniform float uWobble;
  uniform float uStep;
  vec3 wobble(vec3 p, float grow) {
    vec3 n = normalize(p);
    float w = sin(n.x * 7.0 + uStep * 1.9) * sin(n.y * 6.0 - uStep * 2.7) * sin(n.z * 8.0 + uStep * 1.3);
    return n * (1.0 + grow + uWobble * w);
  }
`;

function buildGlobe(colors, mask, boil) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(R, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        ...boil,
        uMask: { value: mask },
        uOcean: { value: colors.ocean },
        uLand: { value: colors.land },
        uWave: { value: colors.wave },
        uInk: { value: colors.ink },
        uShadow: { value: 0.6 },
        uHatch: { value: 7 },
      },
      vertexShader: WOBBLE_GLSL + /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(wobble(position, 0.0), 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMask;
        uniform vec3 uOcean;
        uniform vec3 uLand;
        uniform vec3 uWave;
        uniform vec3 uInk;
        uniform float uShadow;
        uniform float uHatch;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vec3 m = texture2D(uMask, vUv).rgb;
          vec3 col = mix(uOcean, uLand, m.r);
          col = mix(col, uWave, m.b * (1.0 - m.r));
          col = mix(col, uInk, m.g);
          // Cel shadow: diagonal ink hatching on the side away from the light.
          float light = dot(vNormal, normalize(vec3(-0.45, 0.55, 0.7)));
          float hatch = step(0.62, fract((gl_FragCoord.x - gl_FragCoord.y) / uHatch));
          col = mix(col, uInk, step(light, 0.2) * hatch * uShadow);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
}

// Inverted-hull outline: a slightly larger back-facing sphere shows as a ring.
function buildHull(color, boil) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(R, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { ...boil, uColor: { value: color }, uGrow: { value: 0 } },
      vertexShader: WOBBLE_GLSL + /* glsl */ `
        uniform float uGrow;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(wobble(position, uGrow), 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        void main() {
          gl_FragColor = vec4(uColor, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
    }),
  );
}

function buildArcCurve(from, to, height) {
  const a = from.clone().normalize();
  const b = to.clone().normalize();
  const lift = R * (1 + a.angleTo(b) * height);
  return new THREE.CubicBezierCurve3(
    a.clone().multiplyScalar(R),
    slerpVectors(a, b, 0.25).multiplyScalar(lift),
    slerpVectors(a, b, 0.75).multiplyScalar(lift),
    b.clone().multiplyScalar(R),
  );
}

// Dashed ink line that draws itself in and marches towards the roastery.
function buildArcMaterial(color, shared) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uColor: { value: color },
      uProgress: { value: 0 },
      uOpacity: { value: 1 },
      uDashes: { value: 20 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uProgress;
      uniform float uOpacity;
      uniform float uDashes;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        if (vUv.x > uProgress || fract(vUv.x * uDashes - uTime) < 0.45) discard;
        gl_FragColor = vec4(uColor, uOpacity * smoothstep(0.0, 0.02, vUv.x));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
}

// --- Sticker artwork (drawn to canvases, shown as camera-facing sprites) ---

const PIN_W = 128;
const PIN_H = 168;
const PIN_TIP = 150;
const CUP_W = 168;
const CUP_H = 160;
const CUP_BASE = 140;

function drawPin(ctx, { body, ink, sticker }, blink) {
  ctx.clearRect(0, 0, PIN_W, PIN_H);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(64, PIN_TIP);
  ctx.bezierCurveTo(40, 120, 22, 94, 24, 60);
  ctx.arc(64, 60, 40, Math.PI, 0);
  ctx.bezierCurveTo(106, 94, 88, 120, 64, PIN_TIP);
  ctx.closePath();
  ctx.lineWidth = 22;
  ctx.strokeStyle = sticker;
  ctx.stroke();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = ink;
  ctx.stroke();

  // Googly eyes, glancing up and to the side like the Commonfolk characters.
  ctx.lineWidth = 5;
  [[50, 58], [80, 55]].forEach(([x, y]) => {
    ctx.beginPath();
    if (blink) {
      ctx.moveTo(x - 10, y + 1);
      ctx.quadraticCurveTo(x, y + 8, x + 10, y + 1);
      ctx.stroke();
      return;
    }
    ctx.ellipse(x, y, 11, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 3, y - 3, 5, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
  });
}

function drawCup(ctx, { body, ink, sticker }) {
  ctx.clearRect(0, 0, CUP_W, CUP_H);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const shapes = [
    { fill: true, path: () => ctx.ellipse(84, 128, 56, 12, 0, 0, Math.PI * 2) }, // saucer
    {
      fill: true,
      path: () => {
        ctx.moveTo(40, 66);
        ctx.lineTo(128, 66);
        ctx.lineTo(118, 112);
        ctx.quadraticCurveTo(84, 132, 50, 112);
        ctx.closePath();
      },
    },
    { path: () => ctx.arc(130, 86, 14, -Math.PI / 2, Math.PI / 2) }, // handle
    { path: () => { ctx.moveTo(70, 52); ctx.bezierCurveTo(58, 40, 82, 30, 70, 14); } }, // steam
    { path: () => { ctx.moveTo(98, 52); ctx.bezierCurveTo(86, 40, 110, 30, 98, 14); } },
  ];
  shapes.forEach(({ path }) => {
    ctx.beginPath();
    path();
    ctx.lineWidth = 22;
    ctx.strokeStyle = sticker;
    ctx.stroke();
  });
  shapes.forEach(({ fill, path }) => {
    ctx.beginPath();
    path();
    if (fill) {
      ctx.fillStyle = body;
      ctx.fill();
    }
    ctx.lineWidth = 7;
    ctx.strokeStyle = ink;
    ctx.stroke();
  });
}

function readColors(el) {
  const css = getComputedStyle(el);
  return Object.fromEntries(
    Object.entries(COLOR_TOKENS).map(([key, token]) => [key, new THREE.Color(css.getPropertyValue(token).trim() || '#ff00ff')]),
  );
}

/**
 * Mounts an interactive partner globe into `container`.
 * Colours are read from CSS custom properties (COLOR_TOKENS) on the container;
 * everything else comes from `settings` (see settings.js).
 */
export function createPartnerGlobe(container, { partners, home, settings, onSelect, onHover }) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = readColors(container);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const distance = () => BASE_DISTANCE / settings.size;

  // Globe: map-textured sphere inside an ink ring and a white sticker border.
  const isLand = buildLandLookup();
  // Half-resolution artwork on small screens keeps GPU memory phone-friendly (~11MB vs ~45MB).
  const maskWidth = window.matchMedia('(max-width: 760px)').matches ? 2048 : 4096;
  const maskCanvas = makeCanvas(maskWidth, maskWidth / 2);
  drawMapMask(maskCanvas, isLand, settings);
  const mask = new THREE.CanvasTexture(maskCanvas);
  mask.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const boil = { uWobble: { value: 0 }, uStep: { value: 0 } };
  const globeMesh = buildGlobe(colors, mask, boil);
  const inkHull = buildHull(colors.ink, boil);
  const stickerHull = buildHull(colors.sticker, boil);
  const globe = new THREE.Group();
  globe.add(stickerHull, inkHull, globeMesh);
  scene.add(globe);

  // Sticker artwork canvases → textures, redrawn whenever a sticker colour changes.
  const art = {
    pin: [makeCanvas(PIN_W, PIN_H), makeCanvas(PIN_W, PIN_H)],
    active: [makeCanvas(PIN_W, PIN_H), makeCanvas(PIN_W, PIN_H)],
    cup: makeCanvas(CUP_W, CUP_H),
    characters: beans.map(() => makeCanvas(CHARACTER_SIZE, CHARACTER_SIZE)),
  };
  const toTexture = (canvas) => Object.assign(new THREE.CanvasTexture(canvas), { colorSpace: THREE.SRGBColorSpace });
  const textures = {
    pin: art.pin.map(toTexture), // [eyes open, blinking]
    active: art.active.map(toTexture),
    cup: toTexture(art.cup),
    characters: art.characters.map(toTexture),
  };
  function drawStickers() {
    const style = (key) => colors[key].getStyle();
    const base = { ink: style('ink'), sticker: style('sticker') };
    [false, true].forEach((blink, i) => {
      drawPin(art.pin[i].getContext('2d'), { ...base, body: style('pin') }, blink);
      drawPin(art.active[i].getContext('2d'), { ...base, body: style('pinActive') }, blink);
    });
    drawCup(art.cup.getContext('2d'), { ...base, body: style('home') });
    const palette = {
      ...base, body: style('land'), pink: style('pin'), ocean: style('ocean'), pale: style('wave'),
    };
    beans.forEach((bean, i) => drawCharacter(art.characters[i], bean, palette));
    [...textures.pin, ...textures.active, textures.cup, ...textures.characters].forEach((t) => { t.needsUpdate = true; });
  }
  drawStickers();

  function buildSprite(map, width, height, base) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true }));
    sprite.center.set(0.5, base);
    sprite.renderOrder = 10;
    sprite.userData.aspect = width / height;
    return sprite;
  }

  // Pins that sit almost on top of each other (e.g. neighbouring farms) are
  // nudged apart so each one stays visible and clickable.
  function displayNormal(partner) {
    const position = latLngToVector3(partner.lat, partner.lng);
    const nudge = new THREE.Vector3();
    partners.forEach((other) => {
      if (other === partner) return;
      const otherPos = latLngToVector3(other.lat, other.lng);
      if (otherPos.angleTo(position) > 0.05) return;
      const away = position.clone().sub(otherPos);
      nudge.add(away.sub(position.clone().multiplyScalar(away.dot(position))).normalize());
    });
    return nudge.lengthSq() ? position.add(nudge.normalize().multiplyScalar(0.05)).normalize() : position;
  }

  const homeNormal = latLngToVector3(home.lat, home.lng);
  const cup = buildSprite(textures.cup, CUP_W, CUP_H, (CUP_H - CUP_BASE) / CUP_H);
  cup.position.copy(homeNormal);
  globe.add(cup);

  // Bean characters giving each region some personality (decorative, but hoverable).
  const characters = beans.map((bean, index) => {
    const sprite = buildSprite(textures.characters[index], CHARACTER_SIZE, CHARACTER_SIZE, (CHARACTER_SIZE - CHARACTER_BASE) / CHARACTER_SIZE);
    const normal = latLngToVector3(bean.lat, bean.lng);
    sprite.position.copy(normal);
    sprite.userData.beanId = bean.id;
    globe.add(sprite);
    return { bean, normal, sprite, phase: index * 2.3, pop: 0 };
  });

  const arcUniforms = { uTime: { value: 0 } };
  const introProgress = (index) => (reducedMotion ? 1 : -0.6 - index * 0.25);
  const pins = partners.map((partner, index) => {
    const normal = displayNormal(partner);
    const sprite = buildSprite(textures.pin[0], PIN_W, PIN_H, (PIN_H - PIN_TIP) / PIN_H);
    sprite.userData.partnerId = partner.id;
    const halo = new THREE.Mesh(undefined, buildArcMaterial(colors.sticker, arcUniforms));
    const line = new THREE.Mesh(undefined, buildArcMaterial(colors.arc, arcUniforms));
    halo.renderOrder = 1;
    line.renderOrder = 2;
    globe.add(halo, line, sprite);
    return {
      partner, normal, sprite, halo, line,
      phase: index * 1.7,
      scale: 1,
      progress: introProgress(index), // pin pops in, then its arc draws
      blinkAt: 2 + Math.random() * 4,
    };
  });

  function buildArcs() {
    pins.forEach((p) => {
      const curve = buildArcCurve(p.normal, homeNormal, settings.arcHeight);
      p.halo.geometry?.dispose();
      p.line.geometry?.dispose();
      p.halo.geometry = new THREE.TubeGeometry(curve, 160, settings.arcThickness * 2.2, 8, false);
      p.line.geometry = new THREE.TubeGeometry(curve, 160, settings.arcThickness, 8, false);
      const dashes = curve.getLength() * 14 * settings.dashes;
      p.halo.material.uniforms.uDashes.value = dashes;
      p.line.material.uniforms.uDashes.value = dashes;
    });
  }
  buildArcs();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;

  // Open on the Americas, where most partners are, with their arcs swinging off towards the roastery.
  camera.position.copy(latLngToVector3(14, -95, distance()));
  controls.update();

  let selectedId = null;
  let hoveredId = null;
  let flight = null;
  let intro = reducedMotion ? 1 : 0;
  let viewOffset = 0;
  let targetOffset = 0;

  // Applies selection state to the arcs.
  function paint() {
    pins.forEach((p) => {
      const active = p.partner.id === selectedId;
      const opacity = !selectedId ? settings.arcOpacity : active ? 1 : settings.arcOpacity * 0.25;
      p.halo.material.uniforms.uOpacity.value = opacity;
      p.line.material.uniforms.uOpacity.value = opacity;
    });
  }

  // Pushes `settings` into the scene. `changed` says which keys moved, so only
  // the expensive redraws (map artwork, arc geometry) that are needed happen.
  function applySettings(changed = {}) {
    if ('coastlineWidth' in changed || 'waves' in changed || 'speckles' in changed) {
      drawMapMask(maskCanvas, isLand, settings);
      mask.needsUpdate = true;
    }
    if ('arcHeight' in changed || 'arcThickness' in changed || 'dashes' in changed) buildArcs();
    if ('size' in changed) camera.position.setLength(distance());
    controls.autoRotate = settings.autoRotate && !selectedId && !reducedMotion;
    controls.autoRotateSpeed = settings.rotateSpeed;
    boil.uWobble.value = settings.wobble;
    inkHull.material.uniforms.uGrow.value = settings.outlineWidth;
    stickerHull.material.uniforms.uGrow.value = settings.outlineWidth + settings.stickerWidth;
    globeMesh.material.uniforms.uShadow.value = settings.shadow;
    paint();
  }

  function flyTo(normal) {
    const from = camera.position.clone().normalize();
    // Look from slightly above the pin so it sits in the upper-middle of the view.
    const to = normal.clone().add(new THREE.Vector3(0, 0.25, 0)).normalize();
    if (reducedMotion) {
      camera.position.copy(to.multiplyScalar(distance()));
      return;
    }
    flight = { from, to, t: 0 };
  }

  function select(id) {
    selectedId = id;
    const pin = pins.find((p) => p.partner.id === id);
    if (pin && !reducedMotion) pin.progress = 0; // redraw the selected route (the pin itself stays put)
    controls.autoRotate = !pin && settings.autoRotate && !reducedMotion;
    paint();
    if (pin) flyTo(pin.normal);
    onSelect?.(pin ? pin.partner : null);
  }

  // Pointer handling: hover + click (ignoring drags). Only pins and beans facing us count.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = null;

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const visible = [...pins, ...(settings.showBeans ? characters : [])]
      .filter((p) => p.sprite.material.opacity > 0.5)
      .map((p) => p.sprite);
    const [first] = raycaster.intersectObjects(visible, false);
    return first ? first.object.userData.partnerId ?? first.object.userData.beanId : null;
  }

  const partnerFor = (id) => pins.find((p) => p.partner.id === id)?.partner;
  const characterFor = (id) => characters.find((c) => c.bean.id === id);

  function setHovered(id) {
    if (id === hoveredId) return;
    hoveredId = id;
    renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    onHover?.(id ? partnerFor(id) ?? characterFor(id).bean : null);
  }

  const onPointerMove = (e) => { if (!downAt) setHovered(pick(e)); };
  const onPointerDown = (e) => { downAt = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) {
      const id = pick(e);
      if (partnerFor(id)) select(id);
      else if (id) characterFor(id).pop = 1; // tapping a bean makes it boing
    }
    downAt = null;
  };
  const onPointerLeave = () => setHovered(null);
  const el = renderer.domElement;
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointerleave', onPointerLeave);
  el.style.cursor = 'grab';
  controls.addEventListener('start', () => { flight = null; });

  // Shifts the globe sideways on screen (e.g. to make room for a card).
  function applyViewOffset() {
    const { width, height } = container.getBoundingClientRect();
    if (viewOffset) camera.setViewOffset(width, height, viewOffset, 0, width, height);
    else camera.clearViewOffset();
  }

  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep the whole globe in frame on tall/narrow screens.
    camera.zoom = Math.min(1, camera.aspect * 1.05);
    applyViewOffset();
    camera.updateProjectionMatrix();
    globeMesh.material.uniforms.uHatch.value = 7 * renderer.getPixelRatio();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  applySettings();

  // Only animate while the globe is on screen.
  let visible = true;
  const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
  visibilityObserver.observe(container);

  const toCamera = new THREE.Vector3();
  const screen = new THREE.Vector3();
  const timer = new THREE.Timer();
  renderer.setAnimationLoop((timestamp) => {
    timer.update(timestamp);
    const dt = Math.min(timer.getDelta(), 0.05);
    if (!visible) return;
    const time = timer.getElapsed();

    if (intro < 1) {
      intro = Math.min(1, intro + dt / 1.1);
      globe.scale.setScalar(0.6 + 0.4 * easeOutBack(intro));
    }

    if (viewOffset !== targetOffset) {
      viewOffset += (targetOffset - viewOffset) * (reducedMotion ? 1 : Math.min(1, dt * 6));
      if (Math.abs(targetOffset - viewOffset) < 0.5) viewOffset = targetOffset;
      applyViewOffset();
    }

    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 1.1);
      camera.position.copy(slerpVectors(flight.from, flight.to, easeInOut(flight.t)).multiplyScalar(distance()));
      if (flight.t === 1) flight = null;
    }

    if (!reducedMotion) {
      boil.uStep.value = settings.boilFps ? Math.floor(time * settings.boilFps) : 0;
      arcUniforms.uTime.value += dt * settings.flowSpeed;
    }

    toCamera.copy(camera.position).normalize();
    const facingOpacity = (normal) => THREE.MathUtils.smoothstep(normal.dot(toCamera), 0.02, 0.2);
    const cupHeight = 0.15 * settings.pinSize;
    cup.scale.set(cupHeight * cup.userData.aspect, cupHeight, 1);
    cup.material.opacity = facingOpacity(homeNormal);

    const beanHeight = 0.26 * settings.beanSize;
    characters.forEach((c) => {
      c.pop = Math.max(0, c.pop - dt * 2.5);
      const boing = 1 + 0.3 * Math.sin(c.pop * Math.PI * 3) * c.pop;
      const hover = c.bean.id === hoveredId ? 1.12 : 1;
      c.sprite.scale.set(beanHeight * hover / boing, beanHeight * hover * boing, 1);
      c.sprite.material.opacity = settings.showBeans ? facingOpacity(c.normal) * clamp01(intro * 2 - 1) : 0;
      // Jitters in step with the outline boil, like a hand-drawn frame.
      c.sprite.material.rotation = reducedMotion ? 0 : Math.sin(boil.uStep.value * 2.1 + c.phase) * 0.05;
    });

    pins.forEach((p) => {
      const id = p.partner.id;
      if (p.progress < 1) p.progress = Math.min(1, p.progress + dt * settings.drawSpeed);
      const arcProgress = easeInOut(clamp01(p.progress));
      p.halo.material.uniforms.uProgress.value = arcProgress;
      p.line.material.uniforms.uProgress.value = arcProgress;

      const target = id === selectedId ? 1.4 : id === hoveredId ? 1.25 : 1;
      p.scale += (target - p.scale) * Math.min(1, dt * 12);
      const appear = easeOutBack(clamp01((p.progress + 0.45) / 0.45));
      const height = 0.14 * settings.pinSize * p.scale * appear;
      p.sprite.scale.set(height * p.sprite.userData.aspect, height, 1);

      // Little hops with pauses in between, and the odd blink.
      const hop = reducedMotion ? 0 : settings.pinHop * 0.022 * Math.max(0, Math.sin(time * 3 + p.phase)) ** 2;
      p.sprite.position.copy(p.normal).multiplyScalar(R + hop);
      p.sprite.material.opacity = facingOpacity(p.normal);
      let blinking = false;
      if (settings.blink && !reducedMotion) {
        if (time > p.blinkAt + 0.14) p.blinkAt = time + 2 + Math.random() * 4;
        blinking = time > p.blinkAt;
      }
      const set = id === selectedId ? textures.active : textures.pin;
      p.sprite.material.map = set[blinking ? 1 : 0];
    });

    controls.update();
    renderer.render(scene, camera);
  });

  const toScreen = (vector) => {
    vector.project(camera);
    const { width, height } = container.getBoundingClientRect();
    return { x: (vector.x * 0.5 + 0.5) * width, y: (-vector.y * 0.5 + 0.5) * height };
  };

  return {
    select,
    clear: () => select(null),
    /** Pixels to shift the globe right (+) or left (−) of centre. */
    setOffset(px) { targetOffset = -px; },
    /** Merge new values into `settings` and apply them live. */
    updateSettings(changed) {
      Object.assign(settings, changed);
      applySettings(changed);
    },
    /** Live-update one of the COLOR_TOKENS colours. */
    setColor(key, value) {
      colors[key].set(value);
      if (STICKER_COLORS.includes(key)) drawStickers();
    },
    /** Replays the pop-in and arc draw-in animation. */
    replayIntro() {
      if (reducedMotion) return;
      intro = 0;
      pins.forEach((p, index) => { p.progress = introProgress(index); });
    },
    /** Screen position (px, relative to container) of the top of a pin or bean, or null if it's behind the globe. */
    screenPosition(id) {
      const pin = pins.find((p) => p.partner.id === id) ?? characterFor(id);
      if (!pin || pin.sprite.material.opacity < 0.5) return null;
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      pin.sprite.getWorldPosition(screen);
      return toScreen(screen.addScaledVector(up, pin.sprite.scale.y * globe.scale.x * 0.85));
    },
    /** The globe's on-screen circle (px, relative to container) — for decorating around it. */
    screenCircle() {
      const r = R * globe.scale.x;
      const d = camera.position.length();
      const dir = camera.position.clone().normalize();
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const centre = dir.clone().multiplyScalar((r * r) / d);
      const edge = centre.clone().addScaledVector(right, r * Math.sqrt(1 - (r * r) / (d * d)));
      const c = toScreen(centre);
      const e = toScreen(edge);
      return { x: c.x, y: c.y, r: Math.hypot(e.x - c.x, e.y - c.y) };
    },
    destroy() {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      controls.dispose();
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      [mask, ...textures.pin, ...textures.active, textures.cup, ...textures.characters].forEach((t) => t.dispose());
      renderer.dispose();
      el.remove();
    },
  };
}
