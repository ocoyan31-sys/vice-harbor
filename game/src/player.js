// The player: a new arrival in Port Brisa with forty dollars and a borrowed phone. On foot
// they walk and sprint, aim with the mouse and answer to WASD; with E they take any car in
// reach — parked, or rolling if its driver can be scared out of it — and from then on the
// car is theirs until they step out again. Health, damage and the hurt flash live here too.
import { PISTOL, PLAYER } from './config.js';
import { resolveCircle } from './city.js';
import { createPedestrian } from './pedestrians.js';
import { reportCrime } from './police.js';

export function createPlayer(x, y) {
  return {
    x,
    y,
    angle: -Math.PI / 2,
    vx: 0,
    vy: 0,
    speed: 0,
    walkPhase: 0,
    health: PLAYER.health,
    car: null,
    ammo: PISTOL.ammoStart,
    punchT: 0,
    fireT: 0,
    lastHurt: -99,
    shirt: '#2ec4b6',
    skin: '#d9a066',
    pants: '#2e2e38',
    state: 'walk',
  };
}

/** Move the player on foot for one step: acceleration toward the held direction, mouse aim. */
export function stepPlayerOnFoot(game, input, dt) {
  const player = game.player;
  const axes = input.moveAxes();
  const sprint = input.held('ShiftLeft') || input.held('ShiftRight');
  const maxSpeed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const len = Math.hypot(axes.x, axes.y) || 1;
  const wantX = axes.x === 0 && axes.y === 0 ? 0 : (axes.x / len) * maxSpeed;
  const wantY = axes.x === 0 && axes.y === 0 ? 0 : (axes.y / len) * maxSpeed;
  const blend = Math.min(1, PLAYER.accel * dt / Math.max(1, maxSpeed));
  player.vx += (wantX - player.vx) * blend;
  player.vy += (wantY - player.vy) * blend;
  if (axes.x === 0 && axes.y === 0 && Math.hypot(player.vx, player.vy) < 6) {
    player.vx = 0;
    player.vy = 0;
  }
  const fixed = resolveCircle(game.city, player.x + player.vx * dt, player.y + player.vy * dt, PLAYER.radius);
  player.x = fixed.x;
  player.y = fixed.y;
  player.speed = Math.hypot(player.vx, player.vy);
  player.walkPhase += dt * (player.speed / 14);

  // Facing: toward the mouse while shooting or just after; otherwise along the walk.
  const aiming = input.mouse.down || game.time - game.lastShotAt < 2.5;
  if (aiming && game.mouseWorld) {
    player.angle = Math.atan2(game.mouseWorld.y - player.y, game.mouseWorld.x - player.x);
  } else if (player.speed > 12) {
    player.angle = Math.atan2(player.vy, player.vx);
  }
  if (player.punchT > 0) player.punchT -= dt;
  if (player.fireT > 0) player.fireT -= dt;
}

/** The driving controls read from the same keys that walk: W/S throttle, A/D steer. */
export function drivingControl(input) {
  const throttle = (input.held('KeyW') || input.held('ArrowUp') ? 1 : 0) - (input.held('KeyS') || input.held('ArrowDown') ? 1 : 0);
  const steer = (input.held('KeyD') || input.held('ArrowRight') ? 1 : 0) - (input.held('KeyA') || input.held('ArrowLeft') ? 1 : 0);
  return { throttle, steer };
}

/** The nearest car the player could take: close, whole, and not already theirs. */
export function findEnterableCar(game) {
  const player = game.player;
  let best = null;
  let bestD = 52;
  for (const car of game.cars) {
    if (car.health <= 0 || car.driver === 'player') continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/**
 * Take a car. A rolling traffic car loses its driver, who bails out and runs; a parked car is
 * simply stolen. Either way it is a theft, and theft with witnesses is a crime (police.js
 * decides who saw it). Returns true when the player is now driving.
 */
export function enterCar(game, car) {
  const player = game.player;
  if (car.driver === 'ai') {
    const bail = createPedestrian(car.x + 18, car.y + 10, game.rng);
    bail.state = 'flee';
    bail.fleeT = 2.6;
    game.peds.push(bail);
    game.danger = { x: car.x, y: car.y, until: game.time + 1.2 };
  }
  if (!car.stolen) {
    car.stolen = true;
    game.stats.carsStolen += 1;
    reportCrime(game, 'stealCar', car.x, car.y, car.kind === 'police');
    if (car.kind === 'police') game.wanted.points = Math.min(500, game.wanted.points + 60);
    game.sounds.push('door');
  }
  car.driver = 'player';
  player.car = car;
  player.state = 'drive';
  if (game.mission) game.mission.carEntered = car;
  return true;
}

/** Step out of the current car, at its left door, clear of the bodywork. */
export function exitCar(game) {
  const player = game.player;
  const car = player.car;
  if (!car) return;
  car.driver = 'none';
  const sideX = Math.cos(car.angle - Math.PI / 2);
  const sideY = Math.sin(car.angle - Math.PI / 2);
  const fixed = resolveCircle(game.city, car.x + sideX * 30, car.y + sideY * 30, PLAYER.radius);
  player.x = fixed.x;
  player.y = fixed.y;
  player.vx = 0;
  player.vy = 0;
  player.speed = 0;
  player.angle = car.angle;
  player.car = null;
  player.state = 'walk';
  game.sounds.push('door');
}

/** Hurt the player; at zero health the run ends wasted. Regen is handled by world.js. */
export function damagePlayer(game, amount) {
  const player = game.player;
  if (game.over || amount <= 0) return;
  player.health = Math.max(0, player.health - amount);
  player.lastHurt = game.time;
  game.hurtFlash = Math.min(1, game.hurtFlash + 0.45);
  if (player.health <= 0) {
    game.over = 'wasted';
    game.sounds.push('wasted');
  }
}

/** Where the player effectively is: their feet, or their car's nose-to-tail centre. */
export function playerPosition(game) {
  const player = game.player;
  return player.car ? { x: player.car.x, y: player.car.y } : { x: player.x, y: player.y };
}

/** How fast the player is moving, on foot or by car: the busted rule reads this. */
export function playerSpeed(game) {
  const player = game.player;
  return player.car ? Math.abs(player.car.speed) : player.speed;
}
