import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';

const R = 1;
const DEG = Math.PI / 180;
const CAMERA_DISTANCE = 4.2;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

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

// Rasterise the land polygons to a canvas once, then sample it per dot.
function buildLandMask(width = 2048, height = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const projection = geoEquirectangular().scale(width / (2 * Math.PI)).translate([width / 2, height / 2]);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  geoPath(projection, ctx)(feature(land110, land110.objects.land));
  ctx.fill();
  const { data } = ctx.getImageData(0, 0, width, height);
  return (lat, lng) => {
    const x = Math.min(width - 1, Math.floor(((lng + 180) / 360) * width));
    const y = Math.min(height - 1, Math.floor(((90 - lat) / 180) * height));
    return data[(y * width + x) * 4] > 128;
  };
}

// Randomly scattered "stipple" dots over land, tinted by a screen-space gradient.
function buildLandDots(colors, samples = 90000) {
  const isLand = buildLandMask();
  const positions = [];
  const sizes = [];
  const alphas = [];
  const jitters = [];
  for (let i = 0; i < samples; i++) {
    const lat = Math.asin(Math.random() * 2 - 1) / DEG; // uniform over the sphere
    const lng = Math.random() * 360 - 180;
    if (lat < -60 || !isLand(lat, lng)) continue;
    const p = latLngToVector3(lat, lng, R * 1.002);
    positions.push(p.x, p.y, p.z);
    sizes.push(0.5 + Math.random() ** 3 * 1.6); // mostly fine grains, a few chunky ones
    alphas.push(0.55 + Math.random() * 0.45);
    jitters.push(Math.random() - 0.5);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setAttribute('aJitter', new THREE.Float32BufferAttribute(jitters, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 2 },
      uColorA: { value: colors.landA },
      uColorB: { value: colors.landB },
      uColorC: { value: colors.landC },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      attribute float aJitter;
      uniform float uSize;
      varying float vAlpha;
      varying float vGrad;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float facing = dot(normalize(normalMatrix * position), normalize(-mv.xyz));
        gl_Position = projectionMatrix * mv;
        vec2 ndc = gl_Position.xy / gl_Position.w;
        // Diagonal sweep bottom-left → top-right, jittered per dot for a confetti mix.
        float sweep = clamp(0.5 + ndc.x * 0.45 + ndc.y * 0.3, 0.0, 1.0);
        vGrad = clamp(sweep + aJitter * 0.7, 0.0, 1.0);
        vAlpha = aAlpha * smoothstep(0.0, 0.35, facing) * (1.0 - 0.3 * sweep);
        gl_PointSize = aSize * uSize;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;
      varying float vAlpha;
      varying float vGrad;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        if (dot(c, c) > 0.25) discard;
        vec3 col = vGrad < 0.5 ? mix(uColorA, uColorB, vGrad * 2.0) : mix(uColorB, uColorC, vGrad * 2.0 - 1.0);
        gl_FragColor = vec4(col, vAlpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}

// A soft, light sphere that fades into the page at its edges.
function buildOcean(colors) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(R, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: colors.ocean }, uShade: { value: colors.shade } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uShade;
        varying vec3 vNormal;
        void main() {
          float light = clamp(dot(vNormal, normalize(vec3(0.45, 0.55, 1.0))), 0.0, 1.0);
          gl_FragColor = vec4(mix(uShade, uColor, smoothstep(0.05, 0.85, light)), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
}

function buildAtmosphere(color) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(R, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec3 vNormal;
        void main() {
          float i = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
          gl_FragColor = vec4(uColor, clamp(i, 0.0, 1.0));
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.scale.setScalar(1.12);
  return mesh;
}

// A tall arc that draws itself in, with a pulse that travels from farm to roastery.
function buildArc(from, to, colors, offset) {
  const a = from.clone().normalize();
  const b = to.clone().normalize();
  const angle = a.angleTo(b);
  const lift = R * (1 + angle * 0.3);
  const curve = new THREE.CubicBezierCurve3(
    a.clone().multiplyScalar(R),
    slerpVectors(a, b, 0.25).multiplyScalar(lift),
    slerpVectors(a, b, 0.75).multiplyScalar(lift),
    b.clone().multiplyScalar(R),
  );
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 0.9 },
      uOffset: { value: offset },
      uColorA: { value: colors.arcA },
      uColorB: { value: colors.arcB },
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
      uniform float uOffset;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec2 vUv;
      void main() {
        if (vUv.x > uProgress) discard;
        float pulse = smoothstep(0.1, 0.0, abs(fract(uTime * 0.15 + uOffset) - vUv.x));
        float tip = smoothstep(uProgress - 0.1, uProgress, vUv.x) * step(uProgress, 0.999);
        float alpha = uOpacity * (0.55 + 0.45 * max(pulse, tip)) * smoothstep(0.0, 0.03, vUv.x);
        gl_FragColor = vec4(mix(uColorA, uColorB, vUv.x), alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 128, 0.0045, 6, false), material);
}

// Flat ring marker with a soft halo, lying on the globe's surface.
function buildMarker(ringColor, haloColor) {
  const group = new THREE.Group();
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(0.06, 40),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: haloColor.clone() } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          gl_FragColor = vec4(uColor, pow(1.0 - clamp(d, 0.0, 1.0), 2.0) * 0.8);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.013, 0.02, 40),
    new THREE.MeshBasicMaterial({ color: ringColor.clone(), side: THREE.DoubleSide }),
  );
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(0.013, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  const pulse = new THREE.Mesh(
    new THREE.RingGeometry(0.02, 0.023, 40),
    new THREE.MeshBasicMaterial({ color: ringColor.clone(), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.position.z = 0.001;
  core.position.z = 0.0012;
  // Generous invisible hit target so markers are easy to tap.
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
  );
  group.add(halo, pulse, ring, core, hit);
  return { group, halo, ring, pulse, hit };
}

function readColors(el) {
  const css = getComputedStyle(el);
  const get = (name, fallback) => new THREE.Color(css.getPropertyValue(name).trim() || fallback);
  return {
    ocean: get('--cf-globe-ocean', '#fffdfd'),
    shade: get('--cf-globe-shade', '#e8e4f2'),
    landA: get('--cf-globe-land-a', '#9cbde7'),
    landB: get('--cf-globe-land-b', '#413549'),
    landC: get('--cf-globe-land-c', '#d2aed5'),
    glow: get('--cf-globe-glow', '#fffdfd'),
    pin: get('--cf-globe-pin', '#413549'),
    halo: get('--cf-globe-halo', '#d2aed5'),
    pinActive: get('--cf-globe-pin-active', '#9cbde7'),
    arcA: get('--cf-globe-arc-a', '#d2aed5'),
    arcB: get('--cf-globe-arc-b', '#413549'),
    home: get('--cf-globe-home', '#9cbde7'),
  };
}

/**
 * Mounts an interactive partner globe into `container`.
 * Colours are read from CSS custom properties (--cf-globe-*) on the container.
 */
export function createPartnerGlobe(container, { partners, home, onSelect, onHover }) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = readColors(container);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

  const globe = new THREE.Group();
  const ocean = buildOcean(colors);
  const dots = buildLandDots(colors);
  globe.add(ocean, dots, buildAtmosphere(colors.glow));
  scene.add(globe);

  const zAxis = new THREE.Vector3(0, 0, 1);
  function placeMarker(marker, normal) {
    marker.group.position.copy(normal).multiplyScalar(R * 1.004);
    marker.group.quaternion.setFromUnitVectors(zAxis, normal);
  }

  // Markers that sit almost on top of each other (e.g. neighbouring farms) are
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
    return nudge.lengthSq() ? position.add(nudge.normalize().multiplyScalar(0.03)).normalize() : position;
  }

  const homeNormal = latLngToVector3(home.lat, home.lng);
  const homeMarker = buildMarker(colors.home, colors.home);
  placeMarker(homeMarker, homeNormal);
  homeMarker.hit.removeFromParent();
  globe.add(homeMarker.group);

  const pins = partners.map((partner, index) => {
    const position = displayNormal(partner);
    const marker = buildMarker(colors.pin, colors.halo);
    placeMarker(marker, position);
    marker.hit.userData.partnerId = partner.id;
    const arc = buildArc(position, homeNormal, colors, index / partners.length);
    globe.add(marker.group, arc);
    return {
      partner, position, arc, ...marker,
      phase: index * 0.17,
      scale: 1,
      // Arcs draw in one after another once the globe has popped in.
      progress: reducedMotion ? 1 : -0.6 - index * 0.25,
    };
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.6;

  // Open on the Americas, where most partners are, with their arcs swinging off towards the roastery.
  camera.position.copy(latLngToVector3(14, -95, CAMERA_DISTANCE));
  controls.update();

  let selectedId = null;
  let hoveredId = null;
  let flight = null;
  let intro = reducedMotion ? 1 : 0;
  let viewOffset = 0;
  let targetOffset = 0;

  function flyTo(position) {
    const from = camera.position.clone().normalize();
    // Look from slightly above the pin so it sits in the upper-middle of the view.
    const to = position.clone().normalize().add(new THREE.Vector3(0, 0.25, 0)).normalize();
    if (reducedMotion) {
      camera.position.copy(to.multiplyScalar(CAMERA_DISTANCE));
      return;
    }
    flight = { from, to, t: 0 };
  }

  function select(id) {
    selectedId = id;
    const pin = pins.find((p) => p.partner.id === id);
    pins.forEach((p) => {
      const active = p === pin;
      p.halo.material.uniforms.uColor.value.copy(active ? colors.pinActive : colors.halo);
      p.arc.material.uniforms.uOpacity.value = !pin ? 0.9 : active ? 1 : 0.2;
      if (active && !reducedMotion) p.progress = 0; // redraw the selected route
    });
    controls.autoRotate = !pin && !reducedMotion;
    if (pin) flyTo(pin.position);
    onSelect?.(pin ? pin.partner : null);
  }

  // Pointer handling: hover + click (ignoring drags).
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const targets = [ocean, ...pins.map((p) => p.hit)];
  let downAt = null;

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const [first] = raycaster.intersectObjects(targets, false);
    return first?.object.userData.partnerId ?? null;
  }

  function setHovered(id) {
    if (id === hoveredId) return;
    hoveredId = id;
    renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    onHover?.(id ? pins.find((p) => p.partner.id === id).partner : null);
  }

  const onPointerMove = (e) => { if (!downAt) setHovered(pick(e)); };
  const onPointerDown = (e) => { downAt = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) {
      const id = pick(e);
      if (id) select(id);
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
    // Dot size tracks the globe's on-screen size.
    dots.material.uniforms.uSize.value = ((height * camera.zoom) / 480) * renderer.getPixelRatio();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // Only animate while the globe is on screen.
  let visible = true;
  const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
  visibilityObserver.observe(container);

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
      camera.position.copy(slerpVectors(flight.from, flight.to, easeInOut(flight.t)).multiplyScalar(CAMERA_DISTANCE));
      if (flight.t === 1) flight = null;
    }

    pins.forEach((p) => {
      const id = p.partner.id;
      const target = id === selectedId ? 1.5 : id === hoveredId ? 1.3 : 1;
      p.scale += (target - p.scale) * Math.min(1, dt * 12);
      p.group.scale.setScalar(p.scale);
      if (p.progress < 1) p.progress = Math.min(1, p.progress + dt * 0.8);
      p.arc.material.uniforms.uProgress.value = Math.max(0, easeInOut(Math.max(0, p.progress)));
      if (!reducedMotion) {
        const beat = (time * 0.5 + p.phase) % 1;
        p.pulse.scale.setScalar(1 + beat * 2.2);
        p.pulse.material.opacity = 0.6 * (1 - beat);
        p.arc.material.uniforms.uTime.value = time;
      }
    });

    controls.update();
    renderer.render(scene, camera);
  });

  return {
    select,
    clear: () => select(null),
    /** Pixels to shift the globe right (+) or left (−) of centre. */
    setOffset(px) { targetOffset = -px; },
    /** Screen position (px, relative to container) of a partner's marker, or null if it's behind the globe. */
    screenPosition(id) {
      const pin = pins.find((p) => p.partner.id === id);
      if (!pin) return null;
      pin.group.getWorldPosition(screen);
      const facing = screen.clone().normalize().dot(camera.position.clone().normalize()) > 0.2;
      screen.project(camera);
      const { width, height } = container.getBoundingClientRect();
      return facing ? { x: (screen.x * 0.5 + 0.5) * width, y: (-screen.y * 0.5 + 0.5) * height } : null;
    },
    destroy() {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      controls.dispose();
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      renderer.dispose();
      el.remove();
    },
  };
}
