import GUI from 'lil-gui';
import { Color } from 'three';
import { COLOR_TOKENS } from './globe.js';

// Live tweak panel for the globe. Changes persist in this browser while you
// experiment; "Copy settings" / "Copy colours" give you code to paste back in.

const STORAGE_KEY = 'cf-globe-tweaks';
const BRAND_TOKENS = [
  '--cf-dank-purple', '--cf-dank-purple-500', '--cf-dank-purple-100',
  '--cf-dusky-blue', '--cf-dusky-blue-100',
  '--cf-dirty-pink', '--cf-dirty-pink-100',
  '--cf-off-white', '--cf-off-black',
];
const COLOR_LABELS = {
  ocean: 'Globe',
  shade: 'Globe shade',
  landA: 'Dots · start',
  landB: 'Dots · middle',
  landC: 'Dots · end',
  glow: 'Glow',
  pin: 'Marker ring',
  halo: 'Marker halo',
  pinActive: 'Selected halo',
  arcA: 'Arc · farm end',
  arcB: 'Arc · roastery end',
  home: 'Roastery marker',
};

const toHex = (css) => `#${new Color(css.trim()).getHexString()}`;
const round = (value) => (typeof value === 'number' ? +value.toFixed(4) : value);

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}
function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode etc.) — tweaks just won't persist.
  }
}
function forget() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

async function copy(text, controller, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  console.log(text);
  controller.name('Copied ✓');
  setTimeout(() => controller.name(label), 1500);
}

export function mountTweaks({ globe, settings, root }) {
  const defaults = { ...settings };
  const rootStyle = getComputedStyle(root);
  const defaultColors = Object.fromEntries(
    Object.entries(COLOR_TOKENS).map(([key, token]) => [key, toHex(rootStyle.getPropertyValue(token))]),
  );
  const defaultPage = toHex(getComputedStyle(document.body).backgroundColor);
  const brandByHex = Object.fromEntries(
    BRAND_TOKENS.map((token) => [toHex(getComputedStyle(document.documentElement).getPropertyValue(token)), token]),
  );

  const colors = { ...defaultColors };
  const page = { background: defaultPage };

  function applyColors() {
    Object.entries(colors).forEach(([key, value]) => {
      globe.setColor(key, value);
      root.style.setProperty(COLOR_TOKENS[key], value);
    });
    document.body.style.background = page.background;
  }

  const saved = load();
  if (saved) {
    const known = Object.fromEntries(Object.entries(saved.settings ?? {}).filter(([key]) => key in defaults));
    globe.updateSettings(known);
    Object.assign(colors, saved.colors);
    page.background = saved.page ?? page.background;
    applyColors();
  }
  const persist = () => save({ settings: { ...settings }, colors, page: page.background });

  const gui = new GUI({ title: 'Globe tweaks' });
  gui.domElement.classList.add('cf-tweaks');
  if (window.matchMedia('(max-width: 760px)').matches) gui.close();

  // `live: false` applies only on release — for the costly dot rebuild.
  const add = (folder, key, name, min, max, step, live = true) => {
    const controller = folder.add(settings, key, min, max, step).name(name);
    controller[live ? 'onChange' : 'onFinishChange']((value) => {
      globe.updateSettings({ [key]: value });
      persist();
    });
    return controller;
  };

  const globeFolder = gui.addFolder('Globe');
  add(globeFolder, 'size', 'Size', 0.6, 1.6, 0.01);
  add(globeFolder, 'autoRotate', 'Auto-rotate');
  add(globeFolder, 'rotateSpeed', 'Rotate speed', 0, 3, 0.05);
  add(globeFolder, 'glowStrength', 'Glow strength', 0, 3, 0.05);
  add(globeFolder, 'glowSize', 'Glow size', 1, 1.5, 0.01);

  const dotsFolder = gui.addFolder('Dots');
  add(dotsFolder, 'dotDensity', 'Density', 20000, 250000, 5000, false);
  add(dotsFolder, 'dotSize', 'Size', 0.3, 3, 0.05);
  add(dotsFolder, 'dotSizeVariation', 'Size variation', 0, 5, 0.1);
  add(dotsFolder, 'dotOpacity', 'Min opacity', 0, 1, 0.01);
  add(dotsFolder, 'colorJitter', 'Colour mix', 0, 1.5, 0.05);

  const arcsFolder = gui.addFolder('Arcs');
  add(arcsFolder, 'arcHeight', 'Height', 0, 0.8, 0.01);
  add(arcsFolder, 'arcThickness', 'Thickness', 0.001, 0.015, 0.0005);
  add(arcsFolder, 'arcOpacity', 'Opacity', 0, 1, 0.01);
  add(arcsFolder, 'pulseSpeed', 'Pulse speed', 0, 0.8, 0.01);
  add(arcsFolder, 'drawSpeed', 'Draw-in speed', 0.1, 3, 0.05);

  const markersFolder = gui.addFolder('Markers');
  add(markersFolder, 'markerSize', 'Size', 0.4, 3, 0.05);
  add(markersFolder, 'markerPulse', 'Pulse speed', 0, 2, 0.05);

  const chipsFolder = gui.addFolder('Chips');
  add(chipsFolder, 'showChips', 'Show chips');
  add(chipsFolder, 'chipInterval', 'Cycle every (s)', 1, 10, 0.5);

  const colorsFolder = gui.addFolder('Colours');
  colorsFolder.addColor(page, 'background').name('Page background').onChange(() => {
    document.body.style.background = page.background;
    persist();
  });
  Object.keys(COLOR_TOKENS).forEach((key) => {
    colorsFolder.addColor(colors, key).name(COLOR_LABELS[key]).onChange((value) => {
      globe.setColor(key, value);
      root.style.setProperty(COLOR_TOKENS[key], value);
      persist();
    });
  });

  const actions = {
    replay: () => globe.replayIntro(),
    copySettings: () => {
      const body = Object.entries(settings).map(([key, value]) => `  ${key}: ${JSON.stringify(round(value))},`).join('\n');
      copy(`export const settings = {\n${body}\n};\n`, copySettingsButton, 'Copy settings (settings.js)');
    },
    copyColors: () => {
      // Prefer brand token references over raw hex where a colour matches the palette.
      const lines = Object.entries(colors).map(([key, hex]) => `  ${COLOR_TOKENS[key]}: ${brandByHex[hex] ? `var(${brandByHex[hex]})` : hex};`);
      const pageNote = page.background === defaultPage ? '' : `\n/* Page background tried with: ${page.background} */\n`;
      copy(`.cf-partners {\n${lines.join('\n')}\n}\n${pageNote}`, copyColorsButton, 'Copy colours (style.css)');
    },
    reset: () => {
      forget();
      globe.updateSettings({ ...defaults });
      Object.assign(colors, defaultColors);
      page.background = defaultPage;
      applyColors();
      gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
    },
  };
  const actionsFolder = gui.addFolder('Actions');
  actionsFolder.add(actions, 'replay').name('Replay intro');
  const copySettingsButton = actionsFolder.add(actions, 'copySettings').name('Copy settings (settings.js)');
  const copyColorsButton = actionsFolder.add(actions, 'copyColors').name('Copy colours (style.css)');
  actionsFolder.add(actions, 'reset').name('Reset everything');

  return gui;
}
