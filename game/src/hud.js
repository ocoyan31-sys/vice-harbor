// The HUD: everything the player reads at a glance. Cash and respect top-left over a health
// bar; wanted stars and the clock top-right; the current objective across the top-centre with
// its distance and countdown; Marisol's phone bottom-left when a message lands; the busted
// meter front and centre while an arrest is closing in; and the minimap bottom-right — the
// whole of Port Brisa with its roads and water, the police as red blips, the job as a gold
// diamond and the player as a white arrow that turns with them.
import { FONT, PALETTE, SAND_Y, VIEW, WORLD } from './config.js';
import { starsOf } from './police.js';
import { findEnterableCar, playerPosition } from './player.js';

function panel(ctx, x, y, w, h, radius = 10) {
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}

function text(ctx, value, x, y, size, color, align = 'left', weight = 600) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

function star(ctx, cx, cy, r, filled, flash) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = flash ? '#ffd76a' : '#ffb347';
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(244,241,230,0.4)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

function clockLabel(clock) {
  const h = Math.floor(clock / 60);
  const m = Math.floor(clock % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function wrapText(ctx, value, maxWidth) {
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

export function drawHud(ctx, game, camera) {
  drawMoneyAndHealth(ctx, game);
  drawStarsAndClock(ctx, game);
  drawObjective(ctx, game);
  drawPhone(ctx, game);
  drawBustedMeter(ctx, game);
  drawSummary(ctx, game);
  drawMinimap(ctx, game);
  drawHint(ctx, game);
  void camera;
}

function drawMoneyAndHealth(ctx, game) {
  panel(ctx, 16, 14, 218, 58);
  text(ctx, 'CASH', 30, 36, 11, PALETTE.muted, 'left', 700);
  text(ctx, `$${game.cash.toLocaleString('en-US')}`, 30, 62, 24, PALETTE.cash, 'left', 800);
  text(ctx, 'RESPECT', 150, 36, 11, PALETTE.muted, 'left', 700);
  text(ctx, String(game.respect), 150, 62, 24, PALETTE.teal, 'left', 800);
  // Health bar under the money.
  const pct = Math.max(0, game.player.health / 100);
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  ctx.beginPath();
  ctx.roundRect(16, 80, 218, 15, 6);
  ctx.fill();
  ctx.fillStyle = pct > 0.5 ? '#7dd069' : pct > 0.25 ? '#ffb347' : '#e63946';
  if (pct > 0.01) {
    ctx.beginPath();
    ctx.roundRect(18, 82, 214 * pct, 11, 5);
    ctx.fill();
  }
  // Under it: rounds left on foot, speed and the car's health on the road.
  if (game.player.car) {
    const kmh = Math.round(Math.abs(game.player.car.speed) * 0.32);
    text(ctx, `${kmh} km/h`, 16, 118, 15, PALETTE.text, 'left', 700);
    const carPct = Math.max(0, game.player.car.health / 100);
    ctx.fillStyle = 'rgba(10,14,20,0.6)';
    ctx.fillRect(96, 106, 90, 7);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(96, 106, 90 * carPct, 7);
    text(ctx, 'CAR', 96, 102, 9, PALETTE.muted, 'left', 700);
  } else {
    text(ctx, `PISTOL · ${game.player.ammo} rounds`, 16, 118, 14, game.player.ammo === 0 ? PALETTE.danger : PALETTE.text, 'left', 700);
  }
}

function drawStarsAndClock(ctx, game) {
  panel(ctx, VIEW.width - 206, 14, 190, 46);
  const stars = starsOf(game.wanted);
  const flash = game.wanted.seen && Math.floor(game.time * 5) % 2 === 0;
  for (let i = 0; i < 5; i += 1) {
    star(ctx, VIEW.width - 178 + i * 34, 37, 13, i < stars, flash && i < stars);
  }
  panel(ctx, VIEW.width - 206, 68, 190, 34);
  const h = game.clock / 60;
  const period = h < 5.5 || h >= 20 ? 'Night' : h < 8 ? 'Sunrise' : h < 17.5 ? 'Day' : h < 20 ? 'Sunset' : 'Night';
  text(ctx, clockLabel(game.clock), VIEW.width - 192, 92, 19, PALETTE.text, 'left', 800);
  text(ctx, period, VIEW.width - 30, 92, 14, PALETTE.muted, 'right', 600);
  if (game.wanted.points > 0 && !game.wanted.seen && game.wanted.unseen > 2) {
    text(ctx, 'LOSING THEM…', VIEW.width - 109, 122, 12, PALETTE.accent, 'center', 700);
  }
}

function drawObjective(ctx, game) {
  const m = game.mission;
  if (!m || game.attract) return;
  let label = m.objective;
  if (m.marker) {
    const pos = playerPosition(game);
    const dist = Math.round(Math.hypot(m.marker.x - pos.x, m.marker.y - pos.y) / 10);
    label += ` · ${dist}m`;
  }
  if (m.timer > 0) {
    const s = Math.ceil(m.timer);
    label += ` · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  ctx.font = `700 15px ${FONT}`;
  const w = Math.min(620, ctx.measureText(label).width + 44);
  panel(ctx, VIEW.width / 2 - w / 2, 14, w, 38);
  ctx.fillStyle = m.timer > 0 && m.timer < 30 ? PALETTE.danger : PALETTE.accent;
  ctx.beginPath();
  ctx.moveTo(VIEW.width / 2 - w / 2 + 14, 27);
  ctx.lineTo(VIEW.width / 2 - w / 2 + 22, 33);
  ctx.lineTo(VIEW.width / 2 - w / 2 + 14, 39);
  ctx.closePath();
  ctx.fill();
  text(ctx, label, VIEW.width / 2 + 8, 39, 15, PALETTE.text, 'center', 700);
}

function drawPhone(ctx, game) {
  const msg = game.phoneCurrent;
  if (!msg) return;
  const x = 16;
  const y = VIEW.height - 128;
  ctx.fillStyle = '#0b0f14';
  ctx.beginPath();
  ctx.roundRect(x, y, 268, 104, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#1d2733';
  ctx.beginPath();
  ctx.roundRect(x, y, 268, 26, 12);
  ctx.fill();
  ctx.fillRect(x, y + 14, 268, 12);
  text(ctx, msg.from.toUpperCase(), x + 12, y + 18, 11.5, PALETTE.teal, 'left', 800);
  text(ctx, 'now', x + 256, y + 18, 11, PALETTE.muted, 'right', 600);
  ctx.font = `500 13.5px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.textAlign = 'left';
  const lines = wrapText(ctx, msg.text, 244).slice(0, 3);
  lines.forEach((line, i) => ctx.fillText(line, x + 12, y + 48 + i * 17));
}

function drawBustedMeter(ctx, game) {
  const busted = game.wanted.busted;
  if (busted <= 0.03) return;
  const w = 264;
  const x = VIEW.width / 2 - w / 2;
  const y = VIEW.height - 120;
  const flash = Math.floor(game.time * 6) % 2 === 0;
  text(ctx, 'BUSTED', VIEW.width / 2, y - 8, 19, flash ? PALETTE.danger : PALETTE.text, 'center', 900);
  ctx.fillStyle = 'rgba(10,14,20,0.75)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 14, 7);
  ctx.fill();
  ctx.fillStyle = PALETTE.danger;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, (w - 4) * busted, 10, 5);
  ctx.fill();
}

function drawSummary(ctx, game) {
  if (!game.summary) return;
  const w = 470;
  const x = VIEW.width / 2 - w / 2;
  const y = 66;
  ctx.fillStyle = 'rgba(16,22,16,0.92)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 86, 12);
  ctx.fill();
  ctx.strokeStyle = PALETTE.cash;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, game.summary.title, VIEW.width / 2, y + 34, 20, PALETTE.cash, 'center', 900);
  text(ctx, game.summary.lines.join('   ·   '), VIEW.width / 2, y + 62, 15, PALETTE.text, 'center', 600);
}

function drawMinimap(ctx, game) {
  const mapX = VIEW.width - 216;
  const mapY = VIEW.height - 190;
  const mapW = 200;
  const mapH = 174;
  panel(ctx, mapX - 6, mapY - 6, mapW + 12, mapH + 12);
  const scale = Math.min(mapW / WORLD.width, mapH / WORLD.height);
  const ox = mapX + (mapW - WORLD.width * scale) / 2;
  const oy = mapY + (mapH - WORLD.height * scale) / 2;
  const px = (wx) => ox + wx * scale;
  const py = (wy) => oy + wy * scale;
  // Land, beach and water.
  ctx.fillStyle = '#17242f';
  ctx.fillRect(ox, oy, WORLD.width * scale, WORLD.height * scale);
  ctx.fillStyle = '#39424e';
  ctx.fillRect(ox, oy, WORLD.width * scale, SAND_Y * scale);
  ctx.fillStyle = '#8a7648';
  ctx.fillRect(ox, oy + SAND_Y * scale, WORLD.width * scale, (WORLD.height - SAND_Y) * scale * 0.32);
  // Roads.
  ctx.strokeStyle = '#79828d';
  ctx.lineWidth = 1.6;
  for (const ax of [256, 768, 1280, 1792, 2304, 2816, 3328]) {
    ctx.beginPath();
    ctx.moveTo(px(ax), py(0));
    ctx.lineTo(px(ax), py(2560));
    ctx.stroke();
  }
  for (const sy of [256, 768, 1280, 1792, 2304]) {
    ctx.beginPath();
    ctx.moveTo(px(0), py(sy));
    ctx.lineTo(px(WORLD.width), py(sy));
    ctx.stroke();
  }
  // Places: hospital cross, station square, garage diamond.
  const L = game.city.locations;
  ctx.fillStyle = '#f4f1e6';
  ctx.fillRect(px(L.hospital.x) - 1, py(L.hospital.y) - 3.5, 2, 7);
  ctx.fillRect(px(L.hospital.x) - 3.5, py(L.hospital.y) - 1, 7, 2);
  ctx.fillStyle = '#3a7bff';
  ctx.fillRect(px(L.police.x) - 3, py(L.police.y) - 3, 6, 6);
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(px(L.garage.x) - 3, py(L.garage.y) - 3, 6, 6);
  // Police blips blink red.
  if (Math.floor(game.time * 2.4) % 2 === 0 || game.wanted.seen) {
    ctx.fillStyle = '#ff4545';
    for (const car of game.cars) {
      if (car.kind !== 'police' || car.driver !== 'police') continue;
      ctx.beginPath();
      ctx.arc(px(car.x), py(car.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const officer of game.officers) {
      if (officer.state === 'down') continue;
      ctx.beginPath();
      ctx.arc(px(officer.x), py(officer.y), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The job marker: a pulsing gold diamond.
  const marker = game.mission?.marker;
  if (marker && !game.attract) {
    const r = 5 + Math.sin(game.time * 5) * 1.4;
    ctx.save();
    ctx.translate(px(marker.x), py(marker.y));
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(-r / 1.6, -r / 1.6, r * 1.24, r * 1.24);
    ctx.restore();
  }
  // The player: a white arrow that turns with them.
  const pos = playerPosition(game);
  const angle = game.player.car ? game.player.car.angle : game.player.angle;
  ctx.save();
  ctx.translate(px(pos.x), py(pos.y));
  ctx.rotate(angle);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(10,12,16,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6.5, 0);
  ctx.lineTo(-4.5, -4);
  ctx.lineTo(-4.5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  text(ctx, 'N', mapX + mapW - 4, mapY + 12, 11, PALETTE.muted, 'right', 800);
}

function drawHint(ctx, game) {
  if (game.attract) return;
  let hint = null;
  if (game.player.car) hint = 'WASD drive · E step out · Esc pause';
  else if (findEnterableCar(game)) hint = 'E — take this car';
  else if (game.mission.phase === 'between' || game.mission.phase === 'freeroam') hint = 'T — call Marisol for work · WASD move · Shift sprint · F punch · click shoot';
  if (!hint) return;
  ctx.font = `600 13px ${FONT}`;
  const w = ctx.measureText(hint).width + 28;
  panel(ctx, VIEW.width / 2 - w / 2, VIEW.height - 40, w, 26, 8);
  text(ctx, hint, VIEW.width / 2, VIEW.height - 22, 13, PALETTE.muted, 'center', 600);
}
