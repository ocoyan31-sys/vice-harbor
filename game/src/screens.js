// The screens that frame the play: a title over the living city, a pause panel, and the two
// ways a run ends — BUSTED at the station door, WASTED under the hospital lights. Each is
// drawn over the world the renderer already painted, so Port Brisa stays visible behind the
// words. The title's buttons report their rectangles through ui.buttons so main.js can tell
// a click on NEW GAME from a click on the sea.
import { FONT, PALETTE, VIEW } from './config.js';
import { SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_TITLE, SCREEN_WASTED } from './render.js';

function text(ctx, value, x, y, size, color, align = 'left', weight = 600) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

function wrap(ctx, value, maxWidth) {
  const words = value.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line === '' ? word : `${line} ${word}`;
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line !== '') lines.push(line);
  return lines;
}

export function drawScreen(ctx, game, ui, camera) {
  void camera;
  if (game.screen === SCREEN_TITLE) drawTitle(ctx, game, ui);
  else if (game.screen === SCREEN_PAUSED) drawPaused(ctx, game);
  else if (game.screen === SCREEN_BUSTED) drawEnd(ctx, game, ui, true);
  else if (game.screen === SCREEN_WASTED) drawEnd(ctx, game, ui, false);
}

const BLURB = 'You arrived in Port Brisa with forty dollars and a borrowed phone. Marisol Vega moves what the port forgets to log — and she is hiring. Run her jobs, take what the streets offer, and stay ahead of the PBPD.';
const CONTROLS = [
  ['WASD / Arrows', 'move & drive'],
  ['Shift', 'sprint'],
  ['E', 'enter / exit a car'],
  ['F', 'punch'],
  ['Mouse + Click', 'aim & shoot'],
  ['T', 'next job from Marisol'],
  ['Esc / P', 'pause'],
  ['M', 'mute'],
];

function drawTitle(ctx, game, ui) {
  // A scrim from the left so the words sit on the city, not against it.
  const grad = ctx.createLinearGradient(0, 0, 780, 0);
  grad.addColorStop(0, 'rgba(8,12,20,0.84)');
  grad.addColorStop(0.75, 'rgba(8,12,20,0.45)');
  grad.addColorStop(1, 'rgba(8,12,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 780, VIEW.height);
  const bottom = ctx.createLinearGradient(0, VIEW.height - 190, 0, VIEW.height);
  bottom.addColorStop(0, 'rgba(8,12,20,0)');
  bottom.addColorStop(1, 'rgba(8,12,20,0.6)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, VIEW.height - 190, VIEW.width, 190);

  // The name of the game, in sunset colours.
  const titleGrad = ctx.createLinearGradient(60, 0, 640, 0);
  titleGrad.addColorStop(0, '#ffd76a');
  titleGrad.addColorStop(0.55, '#ff6b5e');
  titleGrad.addColorStop(1, '#ff70a6');
  ctx.font = `900 86px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(10,10,16,0.65)';
  ctx.fillText('VICE HARBOR', 67, 143);
  ctx.fillStyle = titleGrad;
  ctx.fillText('VICE HARBOR', 64, 140);
  text(ctx, 'P O R T   B R I S A', 66, 178, 19, PALETTE.teal, 'left', 800);

  ctx.font = `500 15.5px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  wrap(ctx, BLURB, 470).forEach((line, i) => ctx.fillText(line, 66, 216 + i * 22));

  // Buttons; their rectangles are reported for the click test in main.js.
  ui.buttons = [];
  const bx = 66;
  let by = 316;
  const drawButton = (id, label, sub) => {
    const w = 264;
    const h = 54;
    const hover = ui.hover === id;
    ctx.fillStyle = hover ? 'rgba(255,179,71,0.92)' : 'rgba(13,20,32,0.88)';
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    text(ctx, label, bx + 20, by + 33, 19, hover ? '#14100a' : PALETTE.text, 'left', 900);
    if (sub) text(ctx, sub, bx + 20, by + 48, 10.5, hover ? '#4a3a20' : PALETTE.muted, 'left', 600);
    ui.buttons.push({ id, x: bx, y: by, w, h });
    by += h + 14;
  };
  drawButton('new', 'NEW GAME', 'start fresh in Port Brisa');
  if (ui.hasSave) drawButton('continue', 'CONTINUE', ui.saveSummary ?? 'pick up the last run');

  // The controls, two quiet columns under the buttons.
  const cy = 512;
  text(ctx, 'CONTROLS', 66, cy, 12, PALETTE.accent, 'left', 800);
  CONTROLS.forEach(([key, what], i) => {
    const colX = 66 + (i % 2) * 252;
    const rowY = cy + 24 + Math.floor(i / 2) * 21;
    text(ctx, key, colX, rowY, 13, PALETTE.text, 'left', 700);
    text(ctx, what, colX + 108, rowY, 13, PALETTE.muted, 'left', 500);
  });
  text(ctx, 'An original harbour crime game · every street drawn and driven in your browser', 66, VIEW.height - 18, 12, 'rgba(185,192,201,0.75)', 'left', 500);
}

function drawPaused(ctx, game) {
  ctx.fillStyle = 'rgba(6,10,16,0.6)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const w = 452;
  const h = 308;
  const x = VIEW.width / 2 - w / 2;
  const y = VIEW.height / 2 - h / 2;
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,179,71,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  text(ctx, 'PAUSED', VIEW.width / 2, y + 58, 34, PALETTE.text, 'center', 900);
  const stats = [
    ['Cash', `$${game.cash.toLocaleString('en-US')}`],
    ['Respect', String(game.respect)],
    ['Jobs done', String(game.stats.missionsDone)],
    ['Cars taken', String(game.stats.carsStolen)],
    ['Shots fired', String(game.stats.shotsFired)],
    ['Current job', game.mission.phase === 'active' ? game.mission.objective.split('·')[0].trim() : '—'],
  ];
  stats.forEach(([k, v], i) => {
    const rowY = y + 102 + i * 27;
    text(ctx, k, x + 36, rowY, 15, PALETTE.muted, 'left', 600);
    text(ctx, v, x + w - 36, rowY, 15, PALETTE.text, 'right', 700);
  });
  text(ctx, 'Esc / P — back to the street · progress saves itself', VIEW.width / 2, y + h - 20, 13, PALETTE.accent, 'center', 700);
}

function drawEnd(ctx, game, ui, busted) {
  const info = ui.endInfo ?? { fee: 0, stars: 0 };
  if (busted) {
    const phase = Math.floor(game.time * 5) % 2 === 0;
    ctx.fillStyle = phase ? 'rgba(230,57,70,0.2)' : 'rgba(58,123,255,0.2)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  } else {
    ctx.fillStyle = 'rgba(40,6,8,0.5)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  ctx.fillStyle = 'rgba(6,10,16,0.45)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const w = 520;
  const h = 262;
  const x = VIEW.width / 2 - w / 2;
  const y = VIEW.height / 2 - h / 2 - 20;
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = busted ? PALETTE.danger : '#8a8f98';
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, busted ? 'BUSTED' : 'WASTED', VIEW.width / 2, y + 74, 52, busted ? PALETTE.danger : '#c8ccd2', 'center', 900);
  const lines = busted
    ? [
        `The PBPD ran you down at ${'★'.repeat(Math.max(1, info.stars))} — the cuffs were never in doubt.`,
        `Release fee $${info.fee.toLocaleString('en-US')} · the job you were on is gone.`,
      ]
    : [
        'Port Brisa General patched you up and kept the change.',
        `Hospital bill $${info.fee.toLocaleString('en-US')} · the job you were on is gone.`,
      ];
  ctx.font = `500 15px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.textAlign = 'center';
  lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, y + 118 + i * 24));
  text(ctx, `Cash $${game.cash.toLocaleString('en-US')}   ·   Respect ${game.respect}   ·   Jobs done ${game.stats.missionsDone}`, VIEW.width / 2, y + 182, 15, PALETTE.muted, 'center', 700);
  text(ctx, busted ? 'Press Enter — walk out of the station' : 'Press Enter — leave the hospital', VIEW.width / 2, y + 224, 16, PALETTE.accent, 'center', 800);
}
