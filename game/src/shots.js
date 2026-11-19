// The screenshot scenes behind ?shot=start|drive|chase|end. Each stages a real moment of the
// game from a fresh seeded world and plays the simulation forward with an autopilot — a
// driver who follows the road centre lines segment by segment, brakes for the car ahead and
// reverses out of a jam — so the frame is what play actually looks like, and the same seed
// always gives the same frame. The scenes: start, the title over the docks at mid-morning;
// drive, a stolen car crossing town with Marisol's first messages on the phone; chase, three
// stars and the PBPD in pursuit at sunset with cash drops still to collect; end, the last job
// complete at Vega Motors, the Sunfire delivered and the harbour won.
import { STEP } from './config.js';
import { newRun, stepGame } from './world.js';
import { enterCar } from './player.js';
import { pushPhone } from './missions.js';
import { createCar, CAR_KIND } from './vehicles.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** A synthetic input the autopilot drives: held keys it sets afresh before every step. */
function makePilot() {
  const keys = { up: false, down: false, left: false, right: false, sprint: false };
  return {
    keys,
    mouse: { x: 640, y: 360, down: false },
    held(code) {
      if (code === 'KeyW' || code === 'ArrowUp') return keys.up;
      if (code === 'KeyS' || code === 'ArrowDown') return keys.down;
      if (code === 'KeyA' || code === 'ArrowLeft') return keys.left;
      if (code === 'KeyD' || code === 'ArrowRight') return keys.right;
      if (code === 'ShiftLeft' || code === 'ShiftRight') return keys.sprint;
      return false;
    },
    moveAxes() {
      return { x: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), y: (keys.down ? 1 : 0) - (keys.up ? 1 : 0) };
    },
    takeActions() {
      return 0;
    },
    clearActions() {},
  };
}

function angleDiff(a, b) {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * A driver for a route of road points. It aims at a lookahead point on the current segment
 * (so the car rejoins the road line instead of cutting across blocks), brakes for traffic
 * ahead, and — when a jam stops it dead — reverses out with the wheel turned, like a person.
 */
function makeRouteDriver(pilot, route) {
  let seg = 0;
  let stuckT = 0;
  let reverseT = 0;
  return function drive(game) {
    const car = game.player.car;
    if (!car) return;
    const keys = pilot.keys;
    if (reverseT > 0) {
      reverseT -= STEP;
      keys.up = false;
      keys.down = true;
      keys.left = car.id % 2 === 0;
      keys.right = !keys.left;
      return;
    }
    const from = route[seg];
    const to = route[Math.min(seg + 1, route.length - 1)];
    const sx = to.x - from.x;
    const sy = to.y - from.y;
    const segLen = Math.hypot(sx, sy) || 1;
    const along = Math.max(0, Math.min(segLen, ((car.x - from.x) * sx + (car.y - from.y) * sy) / segLen));
    const aimX = from.x + (sx / segLen) * Math.min(segLen, along + 110);
    const aimY = from.y + (sy / segLen) * Math.min(segLen, along + 110);
    if (Math.hypot(to.x - car.x, to.y - car.y) < 74 && seg < route.length - 2) seg += 1;
    const diff = angleDiff(Math.atan2(aimY - car.y, aimX - car.x), car.angle);
    keys.left = diff < -0.07;
    keys.right = diff > 0.07;
    let blocked = false;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    for (const other of game.cars) {
      if (other === car) continue;
      const ahead = (other.x - car.x) * fx + (other.y - car.y) * fy;
      const side = Math.abs((other.x - car.x) * -fy + (other.y - car.y) * fx);
      if (ahead > 0 && ahead < 62 && side < 22) blocked = true;
    }
    keys.up = Math.abs(diff) < 1.15 && !blocked;
    keys.down = blocked && car.speed > 70;
    if (!keys.up && Math.abs(car.speed) < 9) {
      stuckT += STEP;
      if (stuckT > 1.3) {
        stuckT = 0;
        reverseT = 0.6;
      }
    } else stuckT = Math.max(0, stuckT - STEP * 2);
  };
}

/**
 * Drive a route until the camera's moment arrives: at least minSeconds in, stop at the
 * first step the accept test likes (a car at speed, a chase in frame), or at maxSeconds,
 * or when the run ends — a bust is a frame too, just not the one we hunt for.
 */
function driveForShot(game, pilot, route, minSeconds, maxSeconds, accept) {
  const drive = makeRouteDriver(pilot, route);
  const total = Math.floor(maxSeconds / STEP);
  const minSteps = Math.floor(minSeconds / STEP);
  for (let s = 0; s < total; s += 1) {
    if (game.over) break;
    drive(game);
    stepGame(game, pilot, STEP);
    if (s >= minSteps && accept(game)) break;
  }
}

function playerSpeed(game) {
  return game.player.car ? Math.abs(game.player.car.speed) : 0;
}

/** Run the ambient world (title backdrop, end scene) with nobody at the wheel. */
function runAmbient(game, pilot, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let s = 0; s < steps; s += 1) stepGame(game, pilot, STEP);
}

function stageStart(game, renderer, pilot) {
  game.screen = SCREEN_TITLE;
  game.clock = 625; // mid-morning, the harbour at its brightest
  runAmbient(game, pilot, 11);
  renderer.setCamera(1150, 2440); // the docks: pier, promenade, warehouses and the grid above
}

function stageDrive(game, renderer, pilot) {
  newRun(game);
  game.screen = SCREEN_PLAY;
  game.clock = 795; // early afternoon
  // Take the parked car nearest Solana Ave, then start it rolling south down Central Ave.
  let chosen = null;
  let bestD = Infinity;
  for (const car of game.cars) {
    if (car.kind !== CAR_KIND.PARKED) continue;
    const d = Math.hypot(car.x - 1280, car.y - 950);
    if (d < bestD) {
      bestD = d;
      chosen = car;
    }
  }
  game.player.x = chosen.x + 26;
  game.player.y = chosen.y + 8;
  enterCar(game, chosen);
  chosen.x = 1792;
  chosen.y = 470;
  chosen.angle = Math.PI / 2;
  chosen.vx = 0;
  chosen.vy = 60;
  game.player.x = chosen.x;
  game.player.y = chosen.y;
  const route = [
    { x: 1792, y: 470 },
    { x: 1792, y: 1280 },
    { x: 1792, y: 1792 },
    { x: 1792, y: 2304 },
    { x: 2304, y: 2304 },
    { x: 2816, y: 2304 },
  ];
  driveForShot(game, pilot, route, 5, 15, (g) => playerSpeed(g) > 178);
  const focus = game.player.car ?? game.player;
  renderer.setCamera(focus.x, focus.y);
}

function stageChase(game, renderer, pilot) {
  newRun(game);
  game.screen = SCREEN_PLAY;
  game.clock = 1122; // sunset: the warm light and the long shadows
  // The player is mid-job in a fresh stolen ride on Mercado St, one drop of three taken.
  const car = createCar(CAR_KIND.PARKED, 1560, 1251, 0, '#3a86ff');
  car.stolen = true;
  game.cars.push(car);
  game.player.x = car.x;
  game.player.y = car.y;
  enterCar(game, car);
  car.speed = 150;
  car.vx = 150;
  game.cash = 260;
  const m = game.mission;
  m.phase = 'active';
  m.index = 1;
  m.step = 2;
  m.objective = 'Collect the cash drops (1/3)';
  m.marker = { x: 450, y: 1150, label: 'Cash drop' };
  game.phoneQueue.length = 0;
  pushPhone(game, 'Marisol Vega', 'One drop down. Two to go — and the PBPD have your plate now.');
  // Three stars, and the first two patrol cars already rolling up behind.
  game.wanted.points = 300;
  game.wanted.lastSeenX = car.x;
  game.wanted.lastSeenY = car.y;
  for (const offset of [-260, -430]) {
    const cop = createCar(CAR_KIND.POLICE, car.x + offset, 1251, 0, '#eef1f4');
    cop.driver = 'police';
    cop.speed = 190;
    cop.vx = 190;
    game.cars.push(cop);
  }
  const route = [
    { x: 1560, y: 1280 },
    { x: 2304, y: 1280 },
    { x: 2816, y: 1280 },
    { x: 2816, y: 2304 },
    { x: 3328, y: 2304 },
  ];
  driveForShot(game, pilot, route, 3.5, 13, (g) => {
    if (playerSpeed(g) < 150) return false;
    const focus = g.player.car ?? g.player;
    return g.cars.some((c) => c.kind === CAR_KIND.POLICE && c.driver === 'police' && Math.hypot(c.x - focus.x, c.y - focus.y) < 330);
  });
  const focus = game.player.car ?? game.player;
  renderer.setCamera(focus.x, focus.y);
}

function stageEnd(game, renderer, pilot) {
  newRun(game);
  game.screen = SCREEN_PLAY;
  game.clock = 655;
  // The Sunfire is delivered, the money is paid, and Marisol is pleased: the run's high point.
  const garage = game.city.locations.garage;
  const hot = createCar(CAR_KIND.HOT, 3005, 2548, 0.2, '#ff2e88');
  game.cars.push(hot);
  game.player.x = garage.x - 42;
  game.player.y = garage.y + 6;
  game.player.angle = -0.5;
  game.cash = 3570;
  game.respect = 75;
  game.stats.missionsDone = 4;
  game.mission.phase = 'freeroam';
  game.mission.index = 4;
  game.mission.betweenT = 999;
  game.mission.marker = null;
  game.mission.objective = 'Free roam — Marisol will call when there is more work';
  game.phoneQueue.length = 0;
  pushPhone(game, 'Marisol Vega', 'The Sunfire is home and the harbour is yours. Drinks are on me.');
  game.summary = { title: 'JOB COMPLETE — Hot Wheels', lines: ['Paid $1,500', 'Respect +30 · Total respect 75'], t: 999 };
  runAmbient(game, pilot, 3);
  game.summary.t = 999; // the ambient steps ticked it down; hold the card for the camera
  renderer.setCamera(2960, 2470);
}

/** Set the game to the named scene and aim the camera; main.js paints the frame. */
export function stageShot(name, game, renderer) {
  const pilot = makePilot();
  if (name === 'drive') stageDrive(game, renderer, pilot);
  else if (name === 'chase') stageChase(game, renderer, pilot);
  else if (name === 'end') stageEnd(game, renderer, pilot);
  else stageStart(game, renderer, pilot);
}
