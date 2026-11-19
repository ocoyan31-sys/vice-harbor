// Drawing the world: a smooth camera over the pre-rendered city, then everything that moves
// — pickups, the mission beacon, cars, people, bullets, sparks — then the light of the hour
// over all of it. The HUD and the screens are drawn by their own modules on top; this file
// only paints the world itself and owns the camera the mouse aim is measured against.
import { PALETTE, VIEW, WATER_Y, WORLD } from './config.js';
import { drawCar } from './vehicles.js';
import { drawPerson } from './pedestrians.js';
import { drawPickup } from './combat.js';
import { drawHud } from './hud.js';
import { drawScreen } from './screens.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

/** How dark and how golden the hour is: 0 at midday, darkness 1 in the small hours. */
export function dayTint(clock) {
  const h = clock / 60;
  let dark = 0;
  if (h < 5) dark = 1;
  else if (h < 7.5) dark = 1 - (h - 5) / 2.5;
  else if (h < 17.5) dark = 0;
  else if (h < 20.5) dark = (h - 17.5) / 3;
  else dark = 1;
  let warm = 0;
  if (h >= 6 && h < 9) warm = 1 - Math.abs(h - 7.2) / 1.8;
  else if (h >= 17.5 && h < 20) warm = 1 - Math.abs(h - 18.6) / 1.4;
  return { dark: Math.max(0, Math.min(1, dark)), warm: Math.max(0, Math.min(1, warm)) };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, width: VIEW.width, height: VIEW.height };
  const camera = { x: WORLD.width / 2, y: 2200 };
  let camOverride = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  /** Convert a logical screen point (1280x720 space) to world coordinates. */
  function screenToWorld(sx, sy) {
    return { x: camera.x + (sx - VIEW.width / 2), y: camera.y + (sy - VIEW.height / 2) };
  }

  function followCamera(game, dt) {
    let tx;
    let ty;
    if (camOverride) {
      tx = camOverride.x;
      ty = camOverride.y;
    } else if (game.attract) {
      const car = game.cars.find((c) => c.driver === 'ai') ?? game.player;
      tx = car.x;
      ty = car.y;
    } else {
      const p = game.player.car ?? game.player;
      tx = p.x + (p.vx ?? 0) * 0.38;
      ty = p.y + (p.vy ?? 0) * 0.38;
    }
    const blend = camOverride ? 1 : Math.min(1, dt * 4.2);
    camera.x += (tx - camera.x) * blend;
    camera.y += (ty - camera.y) * blend;
    camera.x = Math.max(VIEW.width / 2, Math.min(WORLD.width - VIEW.width / 2, camera.x));
    camera.y = Math.max(VIEW.height / 2, Math.min(WORLD.height - VIEW.height / 2, camera.y));
  }

  function drawWorld(game) {
    const left = camera.x - VIEW.width / 2;
    const top = camera.y - VIEW.height / 2;
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const sx = Math.max(0, left);
    const sy = Math.max(0, top);
    const ex = Math.min(WORLD.width, left + VIEW.width);
    const ey = Math.min(WORLD.height, top + VIEW.height);
    ctx.drawImage(game.city.base, sx, sy, ex - sx, ey - sy, sx - left, sy - top, ex - sx, ey - sy);

    ctx.save();
    ctx.translate(-left, -top);
    drawWaterSparkle(game, left, top);
    drawMarker(game);
    for (const pickup of game.pickups) drawPickup(ctx, pickup, game.time);
    for (const car of game.cars) drawCar(ctx, car, game.time);
    drawPlayerMarker(game);
    for (const ped of game.peds) {
      if (ped.state !== 'ride') drawPerson(ctx, ped, game.time);
    }
    for (const officer of game.officers) drawPerson(ctx, officer, game.time);
    if (!game.attract && !game.player.car) drawPlayer(game);
    drawBullets(game);
    drawFx(game);
    ctx.restore();
  }

  function drawWaterSparkle(game, left, top) {
    if (top + VIEW.height < WATER_Y) return;
    ctx.strokeStyle = 'rgba(220,245,250,0.16)';
    ctx.lineWidth = 2;
    const startX = Math.floor(left / 90) * 90;
    for (let x = startX; x < left + VIEW.width + 90; x += 90) {
      const y = WATER_Y + 40 + ((x * 7) % 160);
      const w = 22 + Math.sin(game.time * 1.4 + x * 0.11) * 8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
    }
  }

  function drawMarker(game) {
    const marker = game.mission?.marker;
    if (!marker || game.attract) return;
    const pulse = 24 + Math.sin(game.time * 4) * 5;
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,179,71,0.16)';
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, pulse, 0, Math.PI * 2);
    ctx.fill();
    const grad = ctx.createLinearGradient(0, marker.y - 190, 0, marker.y);
    grad.addColorStop(0, 'rgba(255,179,71,0)');
    grad.addColorStop(1, 'rgba(255,179,71,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(marker.x - 13, marker.y - 190, 26, 190);
    ctx.fillStyle = PALETTE.panel;
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = marker.label ?? '';
    const w = ctx.measureText(label).width + 18;
    ctx.fillRect(marker.x - w / 2, marker.y - 224, w, 24);
    ctx.fillStyle = '#ffb347';
    ctx.fillText(label, marker.x, marker.y - 207);
  }

  function drawPlayerMarker(game) {
    const car = game.player.car;
    if (!car || game.attract) return;
    const bob = Math.sin(game.time * 5) * 3;
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(car.x - 8, car.y - 40 + bob);
    ctx.lineTo(car.x + 8, car.y - 40 + bob);
    ctx.lineTo(car.x, car.y - 30 + bob);
    ctx.closePath();
    ctx.fill();
  }

  function drawPlayer(game) {
    const player = game.player;
    drawPerson(ctx, player, game.time);
    // The pistol, when the player is aiming or has just fired.
    if (game.mouseDown || game.time - game.lastShotAt < 1.6) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);
      ctx.fillStyle = '#191d24';
      ctx.fillRect(8, -2, 13, 4);
      ctx.restore();
    }
    // A punch mid-swing.
    if (player.punchT > 0.2) {
      ctx.strokeStyle = 'rgba(244,241,230,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 20, player.angle - 0.7, player.angle + 0.5);
      ctx.stroke();
    }
  }

  function drawBullets(game) {
    for (const bullet of game.bullets) {
      ctx.strokeStyle = bullet.hostile ? '#ff9a5e' : '#ffe9a8';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(bullet.x - bullet.vx * 0.016, bullet.y - bullet.vy * 0.016);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
    }
  }

  function drawFx(game) {
    for (const fx of game.fx) {
      const lifeLeft = 1 - fx.t / fx.life;
      if (fx.kind === 'spark' || fx.kind === 'flash') {
        ctx.globalAlpha = Math.max(0, lifeLeft);
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.size * (fx.kind === 'flash' ? lifeLeft : 1), 0, Math.PI * 2);
        ctx.fill();
      } else if (fx.kind === 'puff') {
        ctx.globalAlpha = Math.max(0, lifeLeft * 0.8);
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.size + fx.t * 26, 0, Math.PI * 2);
        ctx.fill();
      } else if (fx.kind === 'text') {
        ctx.globalAlpha = Math.max(0, Math.min(1, lifeLeft * 1.6));
        ctx.fillStyle = fx.color;
        ctx.font = '700 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fx.text, fx.x, fx.y - fx.t * 30);
      }
    }
    ctx.globalAlpha = 1;
  }

  function applyLight(game) {
    const { dark, warm } = dayTint(game.clock);
    if (warm > 0.02) {
      ctx.fillStyle = `rgba(255,138,54,${(warm * 0.1).toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    if (dark > 0.02) {
      ctx.fillStyle = `rgba(7,15,38,${(dark * 0.44).toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      // Lamp glow pools on the corners.
      const left = camera.x - VIEW.width / 2;
      const top = camera.y - VIEW.height / 2;
      ctx.save();
      ctx.translate(-left, -top);
      for (const lamp of game.city.lamps) {
        if (lamp.x < left - 40 || lamp.x > left + VIEW.width + 40 || lamp.y < top - 40 || lamp.y > top + VIEW.height + 40) continue;
        const grad = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 44);
        grad.addColorStop(0, `rgba(255,214,140,${0.32 * dark})`);
        grad.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lamp.x, lamp.y, 44, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (game.hurtFlash > 0.02) {
      ctx.fillStyle = `rgba(198,32,32,${(game.hurtFlash * 0.22).toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    // The busted meter made visible: red and blue breathing at the edges.
    if (game.wanted.busted > 0.04 && game.screen === SCREEN_PLAY) {
      const phase = Math.floor(game.time * 6) % 2 === 0;
      ctx.fillStyle = phase ? `rgba(230,57,70,${game.wanted.busted * 0.16})` : `rgba(58,123,255,${game.wanted.busted * 0.16})`;
      ctx.fillRect(0, 0, VIEW.width, 10);
      ctx.fillRect(0, VIEW.height - 10, VIEW.width, 10);
    }
  }

  /** Paint one frame: world, light, then HUD or the current screen's furniture. */
  function draw(game, ui) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawWorld(game);
    applyLight(game);
    if (game.screen === SCREEN_PLAY || game.screen === SCREEN_PAUSED) drawHud(ctx, game, camera);
    drawScreen(ctx, game, ui, camera);
  }

  return {
    draw,
    screenToWorld,
    camera,
    view,
    /** Step the camera toward its target; the main loop calls this once a frame. */
    update(game, dt) {
      followCamera(game, dt);
    },
    /** Pin the camera somewhere at once (screenshot scenes use this). */
    setCamera(x, y) {
      camOverride = { x, y };
      camera.x = x;
      camera.y = y;
    },
  };
}
