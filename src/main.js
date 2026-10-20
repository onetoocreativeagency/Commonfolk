import './style.css';
import { createPartnerGlobe } from './globe.js';
import { partners, home } from './partners.js';
import { settings } from './settings.js';

const root = document.querySelector('.cf-partners');
const $ = (selector) => root.querySelector(selector);

const card = $('[data-card]');
const chip = $('[data-chip]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hint = $('[data-hint]');
const list = $('[data-list]');
const sideBySide = window.matchMedia('(min-width: 761px)');

// Placeholder art (brand-coloured hills + sun) until real farm photos are supplied.
const ART = [
  ['#9cbde7', '#d2aed5', '#413549'],
  ['#d2aed5', '#9cbde7', '#413549'],
  ['#e8e4f2', '#9083a2', '#413549'],
];
function illustration(index) {
  const [sky, hill, ink] = ART[index % ART.length];
  return `
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of rolling coffee hills">
      <rect width="400" height="250" fill="${sky}"/>
      <circle cx="${300 - index * 30}" cy="80" r="34" fill="#fffdfd"/>
      <path d="M0 170 Q 90 110 190 160 T 400 140 V250 H0Z" fill="${hill}"/>
      <path d="M0 205 Q 120 160 230 200 T 400 190 V250 H0Z" fill="${ink}"/>
      ${[60, 110, 160, 210, 260, 310].map((x, i) => `<circle cx="${x + (i % 2) * 12}" cy="${222 - (i % 3) * 6}" r="5" fill="${hill}"/>`).join('')}
    </svg>`;
}

function render(partner) {
  const index = partners.indexOf(partner);
  $('[data-media]').innerHTML = partner.image
    ? `<img src="${partner.image}" alt="${partner.farm}, ${partner.country}" loading="lazy">`
    : illustration(index);
  $('[data-kicker]').textContent = [partner.region, partner.country].join(', ') +
    (partner.since ? ` · Partners since ${partner.since}` : '');
  $('[data-name]').textContent = partner.name;
  $('[data-farm]').textContent = partner.farm !== partner.name ? partner.farm : '';
  $('[data-story]').textContent = partner.story;

  const coffee = partner.latestCoffee;
  $('[data-coffee]').hidden = !coffee;
  if (coffee) {
    $('[data-coffee-name]').textContent = coffee.name;
    $('[data-coffee-notes]').innerHTML = coffee.notes.map((note) => `<li>${note}</li>`).join('');
    const link = $('[data-coffee-link]');
    link.hidden = !coffee.url;
    if (coffee.url) link.href = coffee.url;
  }

  const cta = $('[data-cta]');
  cta.hidden = !partner.url;
  if (partner.url) {
    cta.href = partner.url;
  }
}

const buttons = partners.map((partner) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = partner.name;
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => globe.select(partner.id));
  button.addEventListener('mouseenter', () => { hovered = partner; });
  button.addEventListener('mouseleave', () => { hovered = null; });
  list.append(button);
  return button;
});

// Floating chip: shows the hovered partner, otherwise cycles through the ones facing us.
let hovered = null;
let ambient = null;
let chipFor = null;

const globe = createPartnerGlobe($('[data-globe]'), {
  partners,
  home,
  settings,
  onHover: (partner) => { hovered = partner; },
  onSelect(partner) {
    card.hidden = !partner;
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(partners[i] === partner)));
    // On wide screens the card floats over the right of the stage, so nudge the globe left.
    globe.setOffset(partner && sideBySide.matches ? -card.offsetWidth / 2 : 0);
    if (partner) {
      render(partner);
      hint.style.opacity = 0;
    }
  },
});

let lastCycle = 0;
(function followChip(now = 0) {
  if (now - lastCycle > settings.chipInterval * 1000) {
    lastCycle = now;
    const facing = partners.filter((p) => globe.screenPosition(p.id));
    ambient = facing.length ? facing[(facing.indexOf(ambient) + 1) % facing.length] : null;
  }
  const partner = card.hidden ? hovered ?? (settings.showChips ? ambient : null) : null;
  const pos = partner && globe.screenPosition(partner.id);
  if (partner !== chipFor) {
    chipFor = partner;
    if (partner) {
      $('[data-chip-swatch]').style.background = ART[partners.indexOf(partner) % ART.length][1];
      $('[data-chip-title]').textContent = partner.name;
      $('[data-chip-meta]').textContent = partner.country;
      if (!reduceMotion.matches) chip.animate([{ opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1 }], { duration: 280, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    }
  }
  chip.hidden = !pos;
  if (pos) chip.style.translate = `${pos.x}px ${pos.y}px`;
  requestAnimationFrame(followChip);
})();

function step(delta) {
  const current = buttons.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
  globe.select(partners[(current + delta + partners.length) % partners.length].id);
}

sideBySide.addEventListener('change', () => {
  globe.setOffset(!card.hidden && sideBySide.matches ? -card.offsetWidth / 2 : 0);
});

$('[data-close]').addEventListener('click', () => globe.clear());
$('[data-prev]').addEventListener('click', () => step(-1));
$('[data-next]').addEventListener('click', () => step(1));
document.addEventListener('keydown', (e) => {
  if (card.hidden) return;
  if (e.key === 'Escape') globe.clear();
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowLeft') step(-1);
});

// Tweak panel: on in dev and the single-file preview, or on any build with ?tweak.
if (import.meta.env.DEV || import.meta.env.MODE === 'preview' || new URLSearchParams(location.search).has('tweak')) {
  import('./tweaks.js').then(({ mountTweaks }) => mountTweaks({ globe, settings, root }));
}
