// The PBPD and the wanted system. Crimes are worth points; a hundred points is a star, five
// stars is the whole force. A crime only counts when someone sees it — a pedestrian, an
// officer, a patrol car with a clear view — or when the victim wears the uniform. Police
// cars hunt the player's last seen position and foot officers close in on foot; stay out of
// sight and the heat bleeds away, star by star. If they pin a slow player, the busted meter
// fills, and a full meter ends the run at the station door.
import { AVENUES_X, CAR, CRIME, STREETS_Y, WANTED } from './config.js';
import { nearestNode, resolveCircle, segmentClear } from './city.js';
import { createPedestrian } from './pedestrians.js';
import { playerPosition, playerSpeed } from './player.js';
import { createCar, routeTrafficCar, stepCarPhysics, CAR_KIND } from './vehicles.js';

export function createWanted() {
  return { points: 0, unseen: 0, busted: 0, lastSeenX: 0, lastSeenY: 0, spawnT: 0, seen: false };
}

/** Whole stars to show: any points at all is at least one star. */
export function starsOf(wanted) {
  if (wanted.points <= 0) return 0;
  return Math.max(1, Math.min(WANTED.maxStars, Math.ceil(wanted.points / WANTED.perStar)));
}

const WITNESS_RANGE = 265;

/** Did anyone with a clear view see this? Police always know their own losses. */
function witnessedBy(game, x, y) {
  const player = playerPosition(game);
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < WITNESS_RANGE && segmentClear(game.city, ped.x, ped.y, x, y)) return true;
  }
  for (const officer of game.officers) {
    if (officer.state !== 'down' && Math.hypot(officer.x - x, officer.y - y) < 340) return true;
  }
  for (const car of game.cars) {
    if (car.kind === CAR_KIND.POLICE && car.health > 0 && Math.hypot(car.x - x, car.y - y) < 380) return true;
  }
  void player;
  return false;
}

/**
 * Report a crime (a CRIME key) at a place. Unwitnessed crimes cost nothing — the city only
 * punishes what it sees — but every report refreshes where the police last saw the player.
 */
export function reportCrime(game, kind, x, y, forced = false) {
  if (game.over) return;
  const wanted = game.wanted;
  if (!forced && !witnessedBy(game, x, y)) return;
  const before = starsOf(wanted);
  wanted.points = Math.min(WANTED.perStar * WANTED.maxStars, wanted.points + CRIME[kind]);
  const pos = playerPosition(game);
  wanted.lastSeenX = pos.x;
  wanted.lastSeenY = pos.y;
  wanted.unseen = 0;
  if (starsOf(wanted) > before) game.sounds.push('starup');
}

/** Can any unit currently see the player? Cars see far, officers less, buildings block both. */
function policeSeesPlayer(game) {
  const pos = playerPosition(game);
  for (const car of game.cars) {
    if (car.kind !== CAR_KIND.POLICE || car.health <= 0 || car.driver !== 'police') continue;
    if (Math.hypot(car.x - pos.x, car.y - pos.y) < 470 && segmentClear(game.city, car.x, car.y, pos.x, pos.y)) return true;
  }
  for (const officer of game.officers) {
    if (officer.state === 'down') continue;
    if (Math.hypot(officer.x - pos.x, officer.y - pos.y) < 330 && segmentClear(game.city, officer.x, officer.y, pos.x, pos.y)) return true;
  }
  return false;
}

function policeCars(game) {
  return game.cars.filter((car) => car.kind === CAR_KIND.POLICE && car.driver === 'police' && car.health > 0);
}

/** Send a fresh patrol car in from a crossing a long way off, so it arrives, never pops in. */
function spawnPoliceCar(game) {
  const pos = playerPosition(game);
  let node = null;
  for (let tries = 0; tries < 12; tries += 1) {
    const candidate = game.city.nodes[Math.floor(game.rng() * game.city.nodes.length)];
    const d = Math.hypot(candidate.x - pos.x, candidate.y - pos.y);
    if (d > 640 && d < 1150) {
      node = candidate;
      break;
    }
  }
  if (!node) node = nearestNode(game.city, pos.x + 800, pos.y - 800);
  const car = createCar(CAR_KIND.POLICE, node.x, node.y, game.rng() * Math.PI * 2, '#eef1f4');
  car.driver = 'police';
  game.cars.push(car);
}

/** An officer steps out of the nearest patrol car (or the station) and joins the chase on foot. */
function spawnOfficer(game) {
  const cars = policeCars(game);
  let x = game.city.locations.police.x;
  let y = game.city.locations.police.y;
  if (cars.length > 0) {
    x = cars[0].x + 20;
    y = cars[0].y + 14;
  }
  const officer = createPedestrian(x, y, game.rng, 'officer');
  officer.walkSpeed = 196;
  game.officers.push(officer);
}

const CARS_BY_STARS = [0, 1, 2, 3, 4, 6];

/** One step of the whole wanted machine: sight, decay, reinforcements, pursuit, arrest. */
export function stepPolice(game, dt) {
  const wanted = game.wanted;
  const stars = starsOf(wanted);
  const pos = playerPosition(game);

  wanted.seen = stars > 0 && policeSeesPlayer(game);
  if (wanted.seen) {
    wanted.unseen = 0;
    wanted.lastSeenX = pos.x;
    wanted.lastSeenY = pos.y;
  } else {
    wanted.unseen += dt;
  }
  if (stars > 0 && wanted.unseen > WANTED.hideSeconds) {
    wanted.points = Math.max(0, wanted.points - WANTED.decayPerSecond * dt);
    if (wanted.points === 0) wanted.busted = 0;
  }

  // Reinforcements and stand-downs.
  wanted.spawnT -= dt;
  const active = policeCars(game);
  if (stars > 0 && active.length < CARS_BY_STARS[stars] && wanted.spawnT <= 0) {
    spawnPoliceCar(game);
    wanted.spawnT = 1.4;
  }
  if (stars === 0) {
    for (const car of active) {
      const d = Math.hypot(car.x - pos.x, car.y - pos.y);
      if (d > 460) {
        game.cars.splice(game.cars.indexOf(car), 1);
      } else {
        // The heat is off: the patrol folds back into the traffic and drives away.
        car.kind = CAR_KIND.TRAFFIC;
        car.driver = 'ai';
        car.color = '#eef1f4';
        const node = nearestNode(game.city, car.x, car.y);
        const i = AVENUES_X.indexOf(node.x);
        const j = STREETS_Y.indexOf(node.y);
        routeTrafficCar(car, Math.max(0, i), Math.max(0, j), game.rng);
      }
    }
  }

  // Officers on foot, only when the player is out of a car and the heat is real.
  const wantOfficers = !game.player.car && stars >= 2 ? Math.min(3, stars - 1) : 0;
  const liveOfficers = game.officers.filter((o) => o.state !== 'down');
  if (liveOfficers.length < wantOfficers && wanted.spawnT <= 0) {
    spawnOfficer(game);
    wanted.spawnT = 0.8;
  }

  stepPoliceCars(game, dt);
  stepOfficers(game, dt);
  stepBustedMeter(game, dt);
}

/** Pursuit driving: aim where the player is heading, not where they were. */
function stepPoliceCars(game, dt) {
  const wanted = game.wanted;
  const player = game.player;
  const pos = playerPosition(game);
  const lead = player.car ? { x: player.car.vx, y: player.car.vy } : { x: player.vx, y: player.vy };
  for (const car of policeCars(game)) {
    const tx = wanted.seen ? pos.x + lead.x * 0.45 : wanted.lastSeenX;
    const ty = wanted.seen ? pos.y + lead.y * 0.45 : wanted.lastSeenY;
    const dist = Math.hypot(tx - car.x, ty - car.y);
    const desired = Math.atan2(ty - car.y, tx - car.x);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.6));
    let throttle = 1;
    if (!wanted.seen && dist < 60) throttle = car.speed > 20 ? -0.6 : 0; // circle the last sighting
    else if (dist < 46 && Math.abs(car.speed) > Math.abs(playerSpeed(game)) + 30) throttle = 0.2;
    stepCarPhysics(game.city, car, { throttle, steer }, dt);
    // The pursuit runs hot: police cars shrug off damage that would stop a civilian ride.
    if (car.hitWall > 0) car.health = Math.max(30, car.health - car.hitWall * 0.02);
    car.cruise = CAR.policeSpeed;
  }
}

/** Officers run the player down; at three stars and up, with a clear shot, they open fire. */
function stepOfficers(game, dt) {
  const stars = starsOf(game.wanted);
  const pos = playerPosition(game);
  for (const officer of game.officers) {
    if (officer.state === 'down') {
      officer.downT += dt;
      continue;
    }
    const dist = Math.hypot(pos.x - officer.x, pos.y - officer.y);
    officer.angle = Math.atan2(pos.y - officer.y, pos.x - officer.x);
    if (stars === 0) {
      // Stood down: walk back toward the station and out of the story.
      const home = game.city.locations.police;
      officer.angle = Math.atan2(home.y - officer.y, home.x - officer.x);
      moveOfficer(game, officer, dt, 90);
      if (dist > 560) officer.state = 'gone';
      continue;
    }
    if (dist > 30) moveOfficer(game, officer, dt, officer.walkSpeed);
    else officer.speed = 0;
    officer.shootT -= dt;
    if (stars >= 3 && officer.shootT <= 0 && dist > 70 && dist < 300 && segmentClear(game.city, officer.x, officer.y, pos.x, pos.y)) {
      officer.shootT = 1.5 + game.rng() * 0.7;
      const spread = (game.rng() - 0.5) * 0.16;
      const a = officer.angle + spread;
      game.bullets.push({
        x: officer.x + Math.cos(a) * 14,
        y: officer.y + Math.sin(a) * 14,
        vx: Math.cos(a) * 780,
        vy: Math.sin(a) * 780,
        life: 0.55,
        hostile: true,
        damage: 7,
      });
      game.sounds.push('shot');
      game.danger = { x: pos.x, y: pos.y, until: game.time + 1.5 };
    }
  }
  game.officers = game.officers.filter((o) => o.state !== 'gone' && !(o.state === 'down' && o.downT > 12));
}

function moveOfficer(game, officer, dt, speed) {
  officer.speed = speed;
  const nx = officer.x + Math.cos(officer.angle) * speed * dt;
  const ny = officer.y + Math.sin(officer.angle) * speed * dt;
  const fixed = resolveCircle(game.city, nx, ny, 11);
  officer.x = fixed.x;
  officer.y = fixed.y;
  officer.walkPhase += dt * (speed / 14);
}

/** The arrest itself: pinned by an officer, or boxed in by a patrol car while crawling. */
function stepBustedMeter(game, dt) {
  const wanted = game.wanted;
  if (starsOf(wanted) === 0 || game.over) {
    wanted.busted = Math.max(0, wanted.busted - dt * 0.4);
    return;
  }
  const pos = playerPosition(game);
  const slow = playerSpeed(game) < 36;
  let pinned = false;
  if (!game.player.car) {
    for (const officer of game.officers) {
      if (officer.state !== 'down' && Math.hypot(officer.x - pos.x, officer.y - pos.y) < 40) pinned = true;
    }
  }
  if (slow) {
    for (const car of policeCars(game)) {
      if (Math.hypot(car.x - pos.x, car.y - pos.y) < 72) pinned = true;
    }
  }
  if (pinned) wanted.busted = Math.min(1, wanted.busted + dt / 1.7);
  else wanted.busted = Math.max(0, wanted.busted - dt * 0.35);
  if (wanted.busted >= 1) {
    game.over = 'busted';
    game.sounds.push('busted');
  }
}
