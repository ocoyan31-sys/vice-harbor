// Hands and hardware. Fists are free and quiet-ish; the pistol is neither — every shot is a
// noise the whole street hears, and a noise with witnesses is a crime. Bullets fly straight,
// spark off walls and cars, and drop people; the fallen sometimes drop cash, the gun shop
// corner keeps spare ammunition, and the hospital steps keep a medkit. Particles and floating
// text are kept here too: every impact in the game reports into game.fx for the renderer.
import { PISTOL, PLAYER } from './config.js';
import { knockDown } from './pedestrians.js';
import { damagePlayer, playerPosition } from './player.js';
import { reportCrime } from './police.js';
import { carCircles } from './vehicles.js';

/** A burst of short-lived sparks or smoke at a point. */
export function burst(game, x, y, color, count = 6, size = 5) {
  for (let n = 0; n < count; n += 1) {
    const a = game.rng() * Math.PI * 2;
    const v = 30 + game.rng() * 90;
    game.fx.push({
      kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      t: 0, life: 0.28 + game.rng() * 0.2, color, size: size * (0.6 + game.rng() * 0.7),
    });
  }
}

/** Floating text that rises and fades: payments, pickups, warnings. */
export function floatText(game, x, y, text, color = '#f4f1e6') {
  game.fx.push({ kind: 'text', x, y, t: 0, life: 1.5, text, color, size: 17 });
}

/** Make a noise at a place: pedestrians near it will run, and the police clock starts. */
export function makeNoise(game, x, y, seconds = 2) {
  game.danger = { x, y, until: game.time + seconds };
}

/**
 * Swing a fist. Anything standing in the arc in front of the player takes it: a pedestrian
 * goes down (a crime if seen), an officer goes down (a crime, full stop), a car gets a dent
 * and a clang. Returns true when the swing connected.
 */
export function punch(game) {
  const player = game.player;
  if (player.car || player.punchT > 0 || game.over) return false;
  player.punchT = PLAYER.punchCooldown;
  game.sounds.push('punch');
  const reach = PLAYER.punchRange + 8;
  let hit = false;
  const targets = [...game.peds, ...game.officers];
  for (const target of targets) {
    if (target.state === 'down' || target.state === 'ride') continue;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    if (Math.hypot(dx, dy) > reach) continue;
    let diff = Math.atan2(dy, dx) - player.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > PLAYER.punchArc) continue;
    knockDown(game, target, PLAYER.punchDamage);
    target.x += Math.cos(player.angle) * 10;
    target.y += Math.sin(player.angle) * 10;
    hit = true;
    if (target.kind === 'officer') reportCrime(game, 'shotPolice', target.x, target.y, true);
    else if (target.kind === 'ped') reportCrime(game, 'punchPed', target.x, target.y);
  }
  if (!hit) {
    for (const car of game.cars) {
      if (Math.hypot(car.x - player.x, car.y - player.y) < reach + 16) {
        car.health -= 3;
        burst(game, player.x + Math.cos(player.angle) * 22, player.y + Math.sin(player.angle) * 22, '#ffd76a', 4, 4);
        game.sounds.push('clang');
        hit = true;
      }
    }
  }
  return hit;
}

/**
 * Fire the pistol toward the mouse, if there is a round for it. The shot is loud: it sets
 * the street running and, witnessed, it is a crime before the bullet lands anywhere.
 */
export function shoot(game) {
  const player = game.player;
  if (player.car || player.fireT > 0 || game.over) return;
  if (player.ammo <= 0) {
    game.sounds.push('click');
    player.fireT = 0.3;
    floatText(game, player.x, player.y - 24, 'NO AMMO — Brisa Arms sells more', '#ffb347');
    return;
  }
  player.ammo -= 1;
  player.fireT = PISTOL.cooldown;
  game.lastShotAt = game.time;
  game.stats.shotsFired += 1;
  const spread = (game.rng() - 0.5) * 0.03;
  const a = player.angle + spread;
  game.bullets.push({
    x: player.x + Math.cos(a) * 16,
    y: player.y + Math.sin(a) * 16,
    vx: Math.cos(a) * PISTOL.bulletSpeed,
    vy: Math.sin(a) * PISTOL.bulletSpeed,
    life: 0.7,
    hostile: false,
    damage: PISTOL.damage,
  });
  game.fx.push({ kind: 'flash', x: player.x + Math.cos(a) * 20, y: player.y + Math.sin(a) * 20, t: 0, life: 0.06, color: '#ffd76a', size: 9 });
  game.sounds.push('shot');
  makeNoise(game, player.x, player.y, 2.2);
  reportCrime(game, 'shotFired', player.x, player.y);
}

/** Does a point sit inside a building? Bullets stop at walls. */
function pointInBuilding(game, x, y) {
  for (const rect of game.city.buildings) {
    if (x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h) return true;
  }
  return false;
}

function bulletHitsPeople(game, bullet) {
  const targets = bullet.hostile ? [game.player] : [...game.peds, ...game.officers];
  for (const target of targets) {
    if (target.state === 'down' || target.state === 'ride') continue;
    if (Math.hypot(target.x - bullet.x, target.y - bullet.y) < 11) {
      if (bullet.hostile) {
        damagePlayer(game, bullet.damage);
      } else {
        knockDown(game, target, bullet.damage * 3);
        if (target.kind === 'officer') reportCrime(game, 'shotPolice', target.x, target.y, true);
        else if (target.kind === 'ped') reportCrime(game, 'shotPed', target.x, target.y);
      }
      return true;
    }
  }
  return false;
}

function bulletHitsCars(game, bullet) {
  for (const car of game.cars) {
    if (car.health <= 0) continue;
    for (const circle of carCircles(car)) {
      if (Math.hypot(circle.x - bullet.x, circle.y - bullet.y) < circle.r + 2) {
        car.health -= bullet.damage;
        burst(game, bullet.x, bullet.y, '#ffd76a', 5, 4);
        if (!bullet.hostile && car.kind === 'police') reportCrime(game, 'shotPolice', car.x, car.y, true);
        if (car.health <= 0 && car.driver === 'player') damagePlayer(game, 12);
        return true;
      }
    }
  }
  return false;
}

/** Advance every bullet, pickup and particle by one step. */
export function stepCombat(game, dt) {
  for (const bullet of game.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.life <= 0) bullet.dead = true;
    else if (pointInBuilding(game, bullet.x, bullet.y)) {
      burst(game, bullet.x, bullet.y, '#cfd6dd', 3, 3);
      bullet.dead = true;
    } else if (bulletHitsPeople(game, bullet) || bulletHitsCars(game, bullet)) {
      bullet.dead = true;
    }
  }
  game.bullets = game.bullets.filter((b) => !b.dead);

  const pos = playerPosition(game);
  for (const pickup of game.pickups) {
    pickup.t += dt;
    if (pickup.life !== undefined) pickup.life -= dt;
    if (!game.player.car && Math.hypot(pos.x - pickup.x, pos.y - pickup.y) < 24) {
      pickup.taken = true;
      collectPickup(game, pickup);
    }
  }
  game.pickups = game.pickups.filter((p) => !p.taken && (p.life === undefined || p.life > 0));

  for (const fx of game.fx) {
    fx.t += dt;
    if (fx.kind === 'spark') {
      fx.x += fx.vx * dt;
      fx.y += fx.vy * dt;
    }
  }
  game.fx = game.fx.filter((fx) => fx.t < fx.life);
}

function collectPickup(game, pickup) {
  const player = game.player;
  if (pickup.kind === 'cash') {
    game.cash += pickup.value;
    floatText(game, pickup.x, pickup.y - 18, `+$${pickup.value}`, '#7dd069');
    game.sounds.push('cash');
  } else if (pickup.kind === 'ammo') {
    player.ammo += 12;
    floatText(game, pickup.x, pickup.y - 18, '+12 AMMO', '#ffb347');
    game.sounds.push('pickup');
  } else if (pickup.kind === 'health') {
    player.health = Math.min(PLAYER.health, player.health + 45);
    floatText(game, pickup.x, pickup.y - 18, '+45 HEALTH', '#7dd069');
    game.sounds.push('pickup');
  }
}

/** The standing pickups of the city: medkits by the hospital, ammunition by Brisa Arms. */
export function seedPickups(game) {
  const { hospital, gunshop } = game.city.locations;
  game.pickups.push({ kind: 'health', x: hospital.x - 30, y: hospital.y + 6, t: 0 });
  game.pickups.push({ kind: 'health', x: 1792, y: 2620, t: 0 });
  game.pickups.push({ kind: 'ammo', x: gunshop.x - 26, y: gunshop.y + 4, t: 0 });
  game.pickups.push({ kind: 'ammo', x: 700, y: 2900, t: 0 });
}

/** Paint one pickup: a spinning medkit, ammo box or cash wad with a soft glow under it. */
export function drawPickup(ctx, pickup, time) {
  const bob = Math.sin(time * 3 + pickup.x * 0.05) * 2.5;
  ctx.save();
  ctx.translate(pickup.x, pickup.y + bob);
  ctx.fillStyle = 'rgba(255,220,120,0.22)';
  ctx.beginPath();
  ctx.arc(0, 4 - bob, 15, 0, Math.PI * 2);
  ctx.fill();
  if (pickup.kind === 'health') {
    ctx.fillStyle = '#f4f1e6';
    ctx.fillRect(-8, -8, 16, 16);
    ctx.fillStyle = '#d23b3b';
    ctx.fillRect(-2.5, -6, 5, 12);
    ctx.fillRect(-6, -2.5, 12, 5);
  } else if (pickup.kind === 'ammo') {
    ctx.fillStyle = '#5a4632';
    ctx.fillRect(-8, -6, 16, 12);
    ctx.fillStyle = '#e9c46a';
    ctx.fillRect(-8, -2, 16, 4);
  } else {
    ctx.fillStyle = '#7dd069';
    ctx.fillRect(-8, -5, 16, 10);
    ctx.strokeStyle = '#3f7a34';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-8, -5, 16, 10);
    ctx.fillStyle = '#2c5524';
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', 0, 3.5);
  }
  ctx.restore();
}
