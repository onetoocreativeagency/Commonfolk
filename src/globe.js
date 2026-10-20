import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';

const R = 1;
const DEG = Math.PI / 180;
const CAMERA_DISTANCE = 4.6;

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

function buildLandDots(color, spacing = 1.35) {
  const isLand = buildLandMask();
  const points = [];
  for (let lat = -58; lat <= 84; lat += spacing) {
    const count = Math.round((360 * Math.cos(lat * DEG)) / spacing);
    for (let i = 0; i < count; i++) {
      const lng = -180 + (i / count) * 360;
      if (isLand(lat, lng)) points.push([lat, lng]);
    }
  }

  const geometry = new THREE.CircleGeometry(0.0075, 10);
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry, material, points.length);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  points.forEach(([lat, lng], i) => {
    dummy.position.copy(latLngToVector3(lat, lng, R * 1.001));
    dummy.lookAt(dummy.position.clone().multiplyScalar(2));
    dummy.scale.setScalar(0.8 + Math.random() * 0.45); // a bit of hand-made wobble
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, tint.set(0xffffff).multiplyScalar(0.88 + Math.random() * 0.12));
  });
  return mesh;
}

function buildOcean(color) {
  return new THREE.Mesh(
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
          float light = dot(vNormal, normalize(vec3(-0.4, 0.5, 1.0)));
          vec3 c = uColor * (0.82 + 0.3 * max(light, 0.0));
          gl_FragColor = vec4(c, 1.0);
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
          float i = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
          gl_FragColor = vec4(uColor, clamp(i, 0.0, 1.0));
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.scale.setScalar(1.16);
  return mesh;
}

function buildArc(from, to, color) {
  const a = from.clone().normalize();
  const b = to.clone().normalize();
  const angle = a.angleTo(b);
  const lift = R * (1 + angle * 0.22);
  const curve = new THREE.CubicBezierCurve3(
    a.clone().multiplyScalar(R),
    slerpVectors(a, b, 0.25).multiplyScalar(lift),
    slerpVectors(a, b, 0.75).multiplyScalar(lift),
    b.clone().multiplyScalar(R),
  );
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: color },
      uOpacity: { value: 0.45 },
      uDashes: { value: Math.max(6, Math.round(angle * 9)) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    // Dashes travel from the farm towards the roastery.
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uDashes;
      varying vec2 vUv;
      void main() {
        float dash = step(0.5, fract(vUv.x * uDashes - uTime * 0.5));
        float ends = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
        gl_FragColor = vec4(uColor, (0.2 + 0.8 * dash) * ends * uOpacity);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.0045, 6, false), material);
}

function buildPin(color) {
  const group = new THREE.Group();
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0035, 0.0035, 0.07, 8),
    new THREE.MeshBasicMaterial({ color }),
  );
  stick.position.y = 0.035;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.026, 24, 24), new THREE.MeshBasicMaterial({ color }));
  head.position.y = 0.08;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.02, 0.028, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  // Generous invisible hit target so pins are easy to tap.
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 12, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
  );
  hit.position.y = 0.06;
  group.add(stick, head, ring, hit);
  return { group, stick, head, ring, hit };
}

function readColors(el) {
  const css = getComputedStyle(el);
  const get = (name, fallback) => new THREE.Color(css.getPropertyValue(name).trim() || fallback);
  return {
    ocean: get('--cf-globe-ocean', '#413549'),
    land: get('--cf-globe-land', '#fffdfd'),
    glow: get('--cf-globe-glow', '#9cbde7'),
    pin: get('--cf-globe-pin', '#d2aed5'),
    pinActive: get('--cf-globe-pin-active', '#9cbde7'),
    arc: get('--cf-globe-arc', '#d2aed5'),
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
  const ocean = buildOcean(colors.ocean);
  globe.add(ocean, buildLandDots(colors.land), buildAtmosphere(colors.glow));
  scene.add(globe);

  const homePos = latLngToVector3(home.lat, home.lng);
  const homeMarker = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 16), new THREE.MeshBasicMaterial({ color: colors.home }));
  homeMarker.position.copy(homePos);
  globe.add(homeMarker);

  // Pins that sit almost on top of each other (e.g. neighbouring farms) lean
  // apart so each one stays visible and clickable.
  function pinUp(partner, position) {
    const normal = position.clone().normalize();
    const lean = new THREE.Vector3();
    partners.forEach((other) => {
      if (other === partner) return;
      const otherPos = latLngToVector3(other.lat, other.lng);
      if (otherPos.angleTo(position) > 0.05) return;
      const away = position.clone().sub(otherPos);
      lean.add(away.sub(normal.clone().multiplyScalar(away.dot(normal))).normalize());
    });
    return lean.lengthSq() ? normal.add(lean.normalize().multiplyScalar(0.7)).normalize() : normal;
  }

  const pins = partners.map((partner, index) => {
    const position = latLngToVector3(partner.lat, partner.lng);
    const pin = buildPin(colors.pin);
    pin.group.position.copy(position);
    pin.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pinUp(partner, position));
    pin.hit.userData.partnerId = partner.id;
    const arc = buildArc(position, homePos, colors.arc);
    globe.add(pin.group, arc);
    return { partner, position, arc, ...pin, phase: index * 1.3, scale: 1, targetScale: 1 };
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.7;

  // Start looking at the roastery's side of the world, tilted a touch north.
  camera.position.copy(latLngToVector3(10, 160, CAMERA_DISTANCE));
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
      p.head.material.color.copy(active ? colors.pinActive : colors.pin);
      p.stick.material.color.copy(active ? colors.pinActive : colors.pin);
      p.ring.material.color.copy(active ? colors.pinActive : colors.pin);
      p.arc.material.uniforms.uOpacity.value = !pin ? 0.45 : active ? 1 : 0.15;
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
      p.targetScale = id === selectedId ? 1.45 : id === hoveredId ? 1.3 : 1;
      p.scale += (p.targetScale - p.scale) * Math.min(1, dt * 12);
      p.group.scale.setScalar(p.scale);
      if (!reducedMotion) {
        p.head.position.y = 0.08 + Math.sin(time * 2.2 + p.phase) * 0.006;
        const pulse = (time * 0.6 + p.phase * 0.1) % 1;
        p.ring.scale.setScalar(1 + pulse * 2.4);
        p.ring.material.opacity = 0.7 * (1 - pulse);
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
    /** Screen position (px, relative to container) of a partner's pin, or null if it's behind the globe. */
    screenPosition(id) {
      const pin = pins.find((p) => p.partner.id === id);
      if (!pin) return null;
      pin.head.getWorldPosition(screen);
      const facing = screen.clone().normalize().dot(camera.position.clone().normalize()) > 0.15;
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
