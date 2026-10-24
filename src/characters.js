// Bean characters doodled around the globe, in the Commonfolk sticker style:
// chunky ink outlines, googly eyes, noodle limbs and motion marks. Each one is
// drawn to a 256px canvas (sitting on the globe at bottom-centre) and then given
// a white sticker border.

export const CHARACTER_SIZE = 256;
export const CHARACTER_BASE = 228; // y of the point that sits on the globe

export const beans = [
  { id: 'monster', name: 'Bean of the Deep', where: 'Pacific Ocean', lat: 8, lng: -150, draw: drawMonster },
  { id: 'frozen', name: 'Cold Brew', where: 'Southern Ocean', lat: -57, lng: -28, draw: drawFrozen },
  { id: 'sunbather', name: 'Sun-dried Bean', where: 'Sahara', lat: 23, lng: 8, draw: drawSunbather },
  { id: 'sailor', name: 'Bean Voyage', where: 'North Atlantic', lat: 38, lng: -42, draw: drawSailor },
  { id: 'surfer', name: 'Barrel Roaster', where: 'Tasman Sea', lat: -36, lng: 162, draw: drawSurfer },
];

const TAU = Math.PI * 2;
const LINE = 8;

function makeCanvas(size = CHARACTER_SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function ink(ctx, p, width = LINE) {
  ctx.lineWidth = width;
  ctx.strokeStyle = p.ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function fillInk(ctx, p, fill, width = LINE) {
  ctx.fillStyle = fill;
  ctx.fill();
  ink(ctx, p, width);
}

function bean(ctx, p, x, y, rx, ry, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  fillInk(ctx, p, p.body);
  // The coffee-bean seam, seen side-on.
  ctx.beginPath();
  ctx.moveTo(rx * 0.5, -ry * 0.55);
  ctx.quadraticCurveTo(rx * 0.2, 0, rx * 0.5, ry * 0.55);
  ink(ctx, p, 5);
  ctx.restore();
}

function eyes(ctx, p, x, y, { gap = 22, r = 11, look = [3, -3], pupil = 0.45 } = {}) {
  [x - gap / 2, x + gap / 2].forEach((ex) => {
    ctx.beginPath();
    ctx.ellipse(ex, y, r, r * 1.15, 0, 0, TAU);
    fillInk(ctx, p, '#fff', 5);
    ctx.beginPath();
    ctx.arc(ex + look[0], y + look[1], r * pupil, 0, TAU);
    ctx.fillStyle = p.ink;
    ctx.fill();
  });
}

function line(ctx, p, points, width = 6) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i += 2) {
    if (points[i + 1]) ctx.quadraticCurveTo(...points[i], ...points[i + 1]);
    else ctx.lineTo(...points[i]);
  }
  ink(ctx, p, width);
}

function ticks(ctx, p, segments, width = 5) {
  segments.forEach(([x1, y1, x2, y2]) => line(ctx, p, [[x1, y1], [x2, y2]], width));
}

// Water that blends into the globe's ocean, with an inked wave on top.
function water(ctx, p, top) {
  ctx.beginPath();
  ctx.moveTo(20, top);
  for (let x = 20; x < 236; x += 36) ctx.quadraticCurveTo(x + 18, top - 12, x + 36, top);
  ctx.lineTo(236, CHARACTER_BASE);
  ctx.lineTo(20, CHARACTER_BASE);
  ctx.closePath();
  ctx.fillStyle = p.ocean;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(20, top);
  for (let x = 20; x < 236; x += 36) ctx.quadraticCurveTo(x + 18, top - 12, x + 36, top);
  ink(ctx, p);
}

function drawMonster(ctx, p) {
  // Tail and humps breaking the surface behind the head.
  ctx.beginPath();
  ctx.moveTo(30, 190);
  ctx.lineTo(18, 160);
  ctx.lineTo(40, 176);
  ctx.lineTo(50, 150);
  ctx.lineTo(54, 190);
  fillInk(ctx, p, p.pink);
  [[86, 192, 22, 26], [124, 196, 17, 19]].forEach(([x, y, rx, ry]) => {
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.5, y - ry * 0.8);
    ctx.lineTo(x, y - ry - 14);
    ctx.lineTo(x + rx * 0.5, y - ry * 0.8);
    fillInk(ctx, p, p.pink, 6);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    fillInk(ctx, p, p.body);
  });
  // Spiky crest, then the head.
  ctx.beginPath();
  ctx.moveTo(140, 104);
  [[148, 74], [162, 96], [176, 70], [186, 98], [204, 84], [200, 116]].forEach(([x, y]) => ctx.lineTo(x, y));
  fillInk(ctx, p, p.pink);
  bean(ctx, p, 176, 146, 42, 54, 0.22);
  eyes(ctx, p, 166, 128, { gap: 26, r: 12, look: [-4, -2] });
  // Toothy grin.
  ctx.beginPath();
  ctx.moveTo(150, 160);
  ctx.quadraticCurveTo(170, 182, 192, 164);
  ink(ctx, p, 6);
  ctx.beginPath();
  ctx.moveTo(160, 168);
  ctx.lineTo(165, 180);
  ctx.lineTo(170, 170);
  fillInk(ctx, p, '#fff', 4);
  water(ctx, p, 196);
  ticks(ctx, p, [[222, 120, 236, 112], [224, 140, 240, 140], [222, 160, 236, 168]]);
}

function drawFrozen(ctx, p) {
  // Ice floe it's stuck to.
  ctx.beginPath();
  ctx.ellipse(128, 214, 96, 14, 0, 0, TAU);
  fillInk(ctx, p, '#fff');
  // The bean, then the ice block over it.
  bean(ctx, p, 128, 136, 34, 44, -0.15);
  eyes(ctx, p, 120, 120, { gap: 24, r: 11, look: [0, 0], pupil: 0.3 });
  line(ctx, p, [[104, 152], [110, 146], [116, 152], [122, 146], [128, 152], [134, 146], [140, 152]], 5);
  ctx.beginPath();
  ctx.roundRect(58, 66, 140, 140, 22);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = p.pale;
  ctx.fill();
  ctx.globalAlpha = 1;
  ink(ctx, p);
  // Snow cap with drips, and a glint.
  ctx.beginPath();
  ctx.moveTo(52, 82);
  ctx.quadraticCurveTo(54, 54, 90, 58);
  ctx.quadraticCurveTo(128, 46, 166, 58);
  ctx.quadraticCurveTo(204, 54, 204, 82);
  ctx.quadraticCurveTo(190, 90, 182, 84);
  ctx.quadraticCurveTo(176, 104, 168, 84);
  ctx.quadraticCurveTo(128, 92, 96, 84);
  ctx.quadraticCurveTo(88, 100, 80, 84);
  ctx.quadraticCurveTo(64, 92, 52, 82);
  fillInk(ctx, p, '#fff');
  line(ctx, p, [[76, 104], [90, 92]], 6);
  line(ctx, p, [[76, 124], [84, 116]], 6);
  // Shivers and a snowflake.
  ticks(ctx, p, [[36, 110, 46, 104], [32, 132, 46, 132], [36, 154, 46, 160], [210, 104, 220, 110], [210, 132, 224, 132], [210, 160, 220, 154]]);
  ticks(ctx, p, [[214, 34, 214, 62], [200, 48, 228, 48], [204, 38, 224, 58], [224, 38, 204, 58]], 4);
}

function drawSunbather(ctx, p) {
  // Doodled sun.
  ctx.beginPath();
  ctx.arc(66, 64, 24, 0, TAU);
  fillInk(ctx, p, p.pink);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    line(ctx, p, [[66 + Math.cos(a) * 34, 64 + Math.sin(a) * 34], [66 + Math.cos(a) * 46, 64 + Math.sin(a) * 46]], 5);
  }
  // Striped towel.
  ctx.beginPath();
  ctx.moveTo(44, 196);
  ctx.lineTo(214, 186);
  ctx.lineTo(226, 214);
  ctx.lineTo(34, 222);
  ctx.closePath();
  fillInk(ctx, p, p.pale);
  [[82, 194, 76, 220], [122, 192, 118, 218], [162, 190, 160, 216]].forEach((s) => line(ctx, p, [[s[0], s[1]], [s[2], s[3]]], 7));
  // One leg out, one knee up, the lounging bean, a hand behind the head.
  line(ctx, p, [[88, 182], [70, 188], [52, 190]], 7);
  line(ctx, p, [[90, 174], [76, 146], [60, 168]], 7);
  bean(ctx, p, 140, 170, 60, 30, -0.08);
  line(ctx, p, [[186, 152], [206, 138], [200, 160]], 7);
  // Shades and a smug smile.
  ctx.beginPath();
  ctx.roundRect(150, 150, 20, 14, 6);
  ctx.roundRect(176, 148, 20, 14, 6);
  ctx.fillStyle = p.ink;
  ctx.fill();
  line(ctx, p, [[168, 156], [178, 154]], 4);
  line(ctx, p, [[158, 176], [172, 184], [188, 174]], 5);
  // Heat haze.
  line(ctx, p, [[128, 120], [122, 108], [128, 96], [134, 84], [128, 72]], 4);
  line(ctx, p, [[152, 116], [146, 104], [152, 92], [158, 80], [152, 68]], 4);
}

function drawSailor(ctx, p) {
  // Mast and sail.
  line(ctx, p, [[150, 172], [150, 56]], 7);
  ctx.beginPath();
  ctx.moveTo(156, 62);
  ctx.lineTo(210, 150);
  ctx.lineTo(156, 150);
  ctx.closePath();
  fillInk(ctx, p, p.pink);
  // Bean in the boat, waving.
  bean(ctx, p, 98, 150, 26, 32, -0.1);
  eyes(ctx, p, 96, 140, { gap: 20, r: 9, look: [3, -2] });
  line(ctx, p, [[90, 160], [98, 166], [108, 160]], 5);
  line(ctx, p, [[76, 146], [58, 128], [54, 104]]);
  ticks(ctx, p, [[36, 100, 44, 92], [38, 118, 48, 116]], 4);
  // Hull.
  ctx.beginPath();
  ctx.moveTo(40, 168);
  ctx.lineTo(220, 168);
  ctx.lineTo(190, 204);
  ctx.lineTo(70, 204);
  ctx.closePath();
  fillInk(ctx, p, p.body);
  line(ctx, p, [[60, 184], [200, 184]], 5);
  water(ctx, p, 206);
}

function drawSurfer(ctx, p) {
  // Curling wave behind.
  ctx.beginPath();
  ctx.moveTo(236, 206);
  ctx.quadraticCurveTo(244, 60, 160, 50);
  ctx.quadraticCurveTo(110, 48, 120, 86);
  ctx.quadraticCurveTo(170, 70, 186, 120);
  ctx.quadraticCurveTo(194, 170, 160, 206);
  ctx.closePath();
  fillInk(ctx, p, p.ocean);
  line(ctx, p, [[132, 72], [146, 62], [160, 66]], 5);
  // Legs, board, bean with arms out for balance.
  line(ctx, p, [[112, 176], [104, 196]]);
  line(ctx, p, [[138, 176], [150, 194]]);
  ctx.save();
  ctx.translate(128, 204);
  ctx.rotate(-0.1);
  ctx.beginPath();
  ctx.ellipse(0, 0, 94, 14, 0, 0, TAU);
  fillInk(ctx, p, p.pink);
  ctx.beginPath();
  ctx.moveTo(-84, 0);
  ctx.lineTo(84, 0);
  ink(ctx, p, 4);
  ctx.restore();
  line(ctx, p, [[100, 136], [74, 118], [56, 124]]);
  line(ctx, p, [[150, 132], [172, 112], [188, 112]]);
  bean(ctx, p, 124, 142, 30, 40, 0.14);
  eyes(ctx, p, 120, 126, { gap: 22, r: 10, look: [4, -2] });
  ctx.beginPath();
  ctx.ellipse(124, 152, 9, 7, 0, 0, Math.PI);
  fillInk(ctx, p, p.ink, 4);
  ticks(ctx, p, [[22, 150, 44, 150], [28, 170, 50, 172], [34, 190, 52, 194]]);
}

// White sticker border: stamp the art's silhouette in a ring, then draw the art on top.
function stickerize(art, sticker, border = 10) {
  const out = makeCanvas();
  const silhouette = makeCanvas();
  const s = silhouette.getContext('2d');
  s.drawImage(art, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = sticker;
  s.fillRect(0, 0, CHARACTER_SIZE, CHARACTER_SIZE);
  const ctx = out.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    ctx.drawImage(silhouette, Math.cos(a) * border, Math.sin(a) * border);
  }
  ctx.drawImage(art, 0, 0);
  return out;
}

/** Draws a character into `target` (a 256px canvas) with the given palette. */
export function drawCharacter(target, character, palette) {
  const art = makeCanvas();
  character.draw(art.getContext('2d'), palette);
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, CHARACTER_SIZE, CHARACTER_SIZE);
  ctx.drawImage(stickerize(art, palette.sticker), 0, 0);
}
