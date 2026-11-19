// The people of Port Brisa: shoppers, beachgoers and dockers who walk the sidewalks, the
// promenade and the piers, mind their own business, and run for it when the day turns violent.
// A pedestrian follows a small loop of waypoints in its zone; danger — a shot, a crash, a car
// coming too fast, a police chase — switches it to fleeing directly away from the trouble.
// drawPerson is shared: the player, the crew and the police officers are all drawn through it.
import { PLAYER } from './config.js';
import { resolveCircle } from './city.js';
import { pick, randRange } from './random.js';

const SHIRTS = ['#e8837a', '#8ecae6', '#e9c46a', '#a8d5ba', '#f4f1de', '#cdb4db', '#f4845f', '#7fc8bc', '#d9a05b'];
const SKINS = ['#f2c79b', '#d9a066', '#a9713f', '#7a4a21', '#ffe0bd'];
const PANTS = ['#3a4a5a', '#5a4632', '#2e2e38', '#71624e', '#274b73'];

let nextPedId = 1;

export function createPedestrian(x, y, random, kind = 'ped') {
  return {
    id: nextPedId++,
    kind, // 'ped' | 'officer' | 'crew'
    x,
    y,
    angle: random() * Math.PI * 2,
    vx: 0,
    vy: 0,
    speed: 0,
    health: 100,
    state: 'walk', // 'walk' | 'flee' | 'down' | 'ride' | 'wait'
    shirt: pick(random, SHIRTS),
    skin: pick(random, SKINS),
    pants: pick(random, PANTS),
    walkSpeed: randRange(random, 52, 86),
    waypoints: [],
    wpIndex: 0,
    waitT: 0,
    fleeT: 0,
    downT: 0,
    walkPhase: random() * 6,
    shootT: randRange(random, 0.6, 1.6),
    name: null,
  };
}

/** A loop of waypoints around a city block's sidewalk rim. */
export function blockLoop(bx, by) {
  return [
    { x: bx - 2, y: by - 2 },
    { x: bx + 402, y: by - 2 },
    { x: bx + 402, y: by + 402 },
    { x: bx - 2, y: by + 402 },
  ];
}

/** How much danger a pedestrian feels at its feet: shots, crashes, sirens, fast cars. */
function senseDanger(game, ped) {
  const danger = game.danger;
  if (game.time < danger.until && Math.hypot(ped.x - danger.x, ped.y - danger.y) < 190) {
    return danger;
  }
  for (const car of game.cars) {
    if (Math.abs(car.speed) > 190 && Math.hypot(ped.x - car.x, ped.y - car.y) < 96) return car;
    if (car.kind === 'police' && Math.abs(car.speed) > 60 && Math.hypot(ped.x - car.x, ped.y - car.y) < 130) return car;
  }
  return null;
}

export function stepPedestrians(game, dt) {
  const { city, rng } = game;
  for (const ped of game.peds) {
    if (ped.state === 'ride' || ped.state === 'wait') continue;
    if (ped.state === 'down') {
      ped.downT += dt;
      continue;
    }
    const danger = ped.kind === 'ped' ? senseDanger(game, ped) : null;
    if (danger) {
      ped.state = 'flee';
      ped.fleeT = randRange(rng, 1.6, 3.2);
    }
    let tx = null;
    let ty = null;
    let speed = ped.walkSpeed;
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const from = danger ?? game.danger;
      const away = Math.atan2(ped.y - from.y, ped.x - from.x);
      tx = ped.x + Math.cos(away) * 120;
      ty = ped.y + Math.sin(away) * 120;
      speed = 178;
      if (ped.fleeT <= 0) ped.state = 'walk';
    } else if (ped.waypoints.length > 0) {
      const wp = ped.waypoints[ped.wpIndex % ped.waypoints.length];
      tx = wp.x;
      ty = wp.y;
      if (Math.hypot(tx - ped.x, ty - ped.y) < 10) {
        ped.wpIndex += 1;
        if (rng() < 0.18) ped.waitT = randRange(rng, 0.6, 2.4);
      }
    }
    if (ped.waitT > 0) {
      ped.waitT -= dt;
      speed = 0;
    }
    if (tx === null || speed === 0) {
      ped.speed = 0;
      continue;
    }
    const desired = Math.atan2(ty - ped.y, tx - ped.x);
    let diff = desired - ped.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.angle += Math.max(-7 * dt, Math.min(7 * dt, diff));
    ped.speed = speed;
    const nx = ped.x + Math.cos(ped.angle) * speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * speed * dt;
    const fixed = resolveCircle(city, nx, ny, PLAYER.radius);
    ped.x = fixed.x;
    ped.y = fixed.y;
    ped.walkPhase += dt * (speed / 14);
  }
  // The long-down and the dead fade out of the world.
  game.peds = game.peds.filter((ped) => ped.kind !== 'ped' || ped.state !== 'down' || ped.downT < 24);
}

/** Knock a person down: damage, a fall, and (for a bystander) a small chance of dropped cash. */
export function knockDown(game, ped, damage) {
  ped.health -= damage;
  if (ped.state !== 'down') {
    ped.state = 'down';
    ped.downT = 0;
    ped.speed = 0;
    game.fx.push({ kind: 'puff', x: ped.x, y: ped.y, t: 0, life: 0.4, color: 'rgba(190,60,50,0.55)', size: 12 });
    if (ped.kind === 'ped' && ped.health > 0 && game.rng() < 0.5) {
      game.pickups.push({ kind: 'cash', x: ped.x + 14, y: ped.y + 8, value: 15 + Math.floor(game.rng() * 30), t: 0, life: 40 });
    }
  }
}

/**
 * Paint one person from above: a soft shadow, swinging feet, a torso in its shirt colour,
 * a head, and the marks of its trade — an officer's cap and navy, the player's teal jacket.
 */
export function drawPerson(ctx, person, time) {
  const down = person.state === 'down';
  ctx.save();
  ctx.translate(person.x, person.y);
  ctx.rotate(person.angle);
  ctx.fillStyle = 'rgba(15,18,24,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  if (down) {
    ctx.fillStyle = person.pants;
    ctx.fillRect(-11, -4, 15, 8);
    ctx.fillStyle = person.shirt;
    ctx.fillRect(2, -6, 12, 12);
    ctx.fillStyle = person.skin;
    ctx.beginPath();
    ctx.arc(17, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const swing = Math.sin(person.walkPhase * 6) * (person.speed > 4 ? 4.5 : 0);
  ctx.fillStyle = person.pants;
  ctx.fillRect(-2 + swing * 0.4, -6, 7, 4.6);
  ctx.fillRect(-2 - swing * 0.4, 1.4, 7, 4.6);
  // Torso.
  ctx.fillStyle = person.kind === 'officer' ? '#274b73' : person.shirt;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9.5, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,22,28,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (person.kind === 'officer') {
    ctx.fillStyle = '#e9c46a';
    ctx.fillRect(2, -1.5, 3, 3); // badge
  }
  if (person.kind === 'crew') {
    ctx.fillStyle = '#ff8c1a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Head and hair or cap.
  ctx.fillStyle = person.skin;
  ctx.beginPath();
  ctx.arc(3.5, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = person.kind === 'officer' ? '#1d3550' : 'rgba(40,30,22,0.9)';
  ctx.beginPath();
  ctx.arc(2.6, 0, 4.6, Math.PI * 0.6, Math.PI * 1.9);
  ctx.lineTo(2.6, 0);
  ctx.fill();
  if (person.kind === 'officer') {
    ctx.fillStyle = '#1d3550';
    ctx.fillRect(5, -5.5, 4.5, 11);
  }
  ctx.restore();
  void time;
}
