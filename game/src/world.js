// The simulation: one game state and the step that advances it. The world owns the city, the
// player, every car, pedestrian, officer, bullet and pickup, the wanted level, the mission
// chain and the phone — and each fixed step runs the systems in order: story, player, traffic,
// police, pedestrians, combat, then the collisions that tie them together. Nothing here draws
// or reads the DOM beyond building the city; the renderer and the screens only read the state.
import { CAR_COLORS, CLOCK_RATE, PLAYER, WORLD } from './config.js';
import { createCity, paintCityBase } from './city.js';
import { createPlayer, damagePlayer, drivingControl, enterCar, exitCar, findEnterableCar, playerPosition, stepPlayerOnFoot } from './player.js';
import { createWanted, reportCrime, stepPolice } from './police.js';
import { createMissionState, missionInterrupted, startStory, stepMissions } from './missions.js';
import { burst, makeNoise, punch, seedPickups, shoot, stepCombat } from './combat.js';
import { blockLoop, createPedestrian, knockDown, stepPedestrians } from './pedestrians.js';
import { AVENUES_X, STREETS_Y } from './config.js';
import { carCircles, createCar, placeParkedCars, routeTrafficCar, stepCarPhysics, stepTrafficCar, CAR_KIND } from './vehicles.js';
import { ACTION_CALL, ACTION_INTERACT, ACTION_PUNCH } from './input.js';
import { pick } from './random.js';

const TRAFFIC_COUNT = 13;
const PED_TARGET = 22;
const PLAYER_START = { x: 700, y: 2618 };

export function createGame(random) {
  const city = createCity(random);
  paintCityBase(city, random);
  const game = {
    rng: random,
    city,
    time: 0,
    clock: 600, // 10:00, a bright morning arrival
    screen: 'title',
    attract: true,
    over: null,
    cash: 40,
    respect: 0,
    player: createPlayer(PLAYER_START.x, PLAYER_START.y),
    cars: [],
    peds: [],
    officers: [],
    bullets: [],
    pickups: [],
    fx: [],
    sounds: [],
    wanted: createWanted(),
    mission: createMissionState(),
    phoneQueue: [],
    phoneCurrent: null,
    phoneT: 0,
    summary: null,
    stats: { missionsDone: 0, carsStolen: 0, shotsFired: 0 },
    danger: { x: 0, y: 0, until: -1 },
    lastShotAt: -99,
    hurtFlash: 0,
    mouseWorld: null,
    pendingActions: 0,
    dirtySave: false,
    pedSpawnT: 0,
    crashSoundT: 0,
  };
  for (let n = 0; n < TRAFFIC_COUNT; n += 1) {
    const car = createCar(CAR_KIND.TRAFFIC, 0, 0, 0, pick(random, CAR_COLORS));
    const i = Math.floor(random() * AVENUES_X.length);
    const j = Math.floor(random() * STREETS_Y.length);
    routeTrafficCar(car, i, j, random);
    // Stagger the spawns along their first segment so two cars never share a nose.
    const ahead = random() * 300;
    car.x += Math.cos(car.angle) * ahead;
    car.y += Math.sin(car.angle) * ahead;
    car.speed = 120;
    game.cars.push(car);
  }
  game.cars.push(...placeParkedCars(city, random, 24));
  for (let n = 0; n < PED_TARGET; n += 1) spawnPedestrian(game, true);
  seedPickups(game);
  return game;
}

/** A new pedestrian somewhere sensible: a block sidewalk, the promenade, or a pier. */
function spawnPedestrian(game, anywhere = false) {
  const rng = game.rng;
  const near = anywhere ? { x: WORLD.width / 2, y: WORLD.height / 2 } : playerPosition(game);
  const roll = rng();
  let ped;
  if (roll < 0.55) {
    const i = Math.floor(rng() * (AVENUES_X.length - 1));
    const j = Math.floor(rng() * (STREETS_Y.length - 1));
    const bx = AVENUES_X[i] + 56;
    const by = STREETS_Y[j] + 56;
    if (!anywhere && Math.hypot(bx + 200 - near.x, by + 200 - near.y) > 950) return;
    ped = createPedestrian(bx + rng() * 380, by - 2, rng);
    ped.waypoints = blockLoop(bx, by);
    ped.wpIndex = Math.floor(rng() * 4);
  } else if (roll < 0.8) {
    const x0 = 200 + rng() * (WORLD.width - 900);
    ped = createPedestrian(x0, 2592 + rng() * 40, rng);
    ped.waypoints = [{ x: x0, y: ped.y }, { x: x0 + 420 + rng() * 300, y: ped.y }];
  } else {
    const pier = pick(rng, game.city.piers);
    ped = createPedestrian(pier.x + pier.w / 2, pier.y + 60 + rng() * 200, rng);
    ped.waypoints = [{ x: pier.x + pier.w / 2, y: pier.y + 30 }, { x: pier.x + pier.w / 2, y: pier.y + pier.h - 30 }];
  }
  game.peds.push(ped);
}

/** Reset the run (not the city) for a new game: broke, unknown, standing on the promenade. */
export function newRun(game) {
  const player = game.player;
  if (player.car) {
    player.car.driver = 'none';
    player.car = null;
  }
  Object.assign(player, createPlayer(PLAYER_START.x, PLAYER_START.y));
  game.cars = game.cars.filter((car) => car.kind !== CAR_KIND.POLICE);
  game.officers = [];
  game.bullets = [];
  game.fx = [];
  game.pickups = [];
  seedPickups(game);
  game.wanted = createWanted();
  game.mission = createMissionState();
  game.phoneQueue = [];
  game.phoneCurrent = null;
  game.summary = null;
  game.cash = 40;
  game.respect = 0;
  game.stats = { missionsDone: 0, carsStolen: 0, shotsFired: 0 };
  game.clock = 600;
  game.over = null;
  game.attract = false;
  startStory(game);
}

/** Restore a saved run's standing: money, respect, the next job, the hour, the place. */
export function applySave(game, data) {
  newRun(game);
  game.cash = data.cash;
  game.respect = data.respect;
  game.player.ammo = data.ammo ?? game.player.ammo;
  game.clock = data.clock ?? 600;
  game.stats.missionsDone = data.missionsDone ?? 0;
  game.stats.carsStolen = data.carsStolen ?? 0;
  game.player.x = data.x ?? PLAYER_START.x;
  game.player.y = data.y ?? PLAYER_START.y;
  const m = game.mission;
  if (data.intro) {
    m.phase = 'intro';
    startStory(game);
  } else if (data.nextMission >= 4) {
    m.phase = 'freeroam';
    m.index = 4;
    m.payScale = data.payScale ?? 1.5;
    m.betweenT = 20;
    m.objective = 'Free roam — Marisol will call when there is more work';
    m.marker = null;
  } else {
    m.phase = 'between';
    m.index = data.nextMission;
    m.payScale = data.payScale ?? 1;
    m.betweenT = 1.2;
    m.objective = 'Marisol is lining up the next job…';
    m.marker = null;
    game.phoneQueue = [];
  }
}

/**
 * Bring the player back after a bust or a wreck: at the station or the hospital, lighter of
 * pocket, heat gone, and the job they were on lost. The fee is charged by main from the
 * wanted level at the moment of the fall, which it passes in.
 */
export function respawn(game, kind, fee) {
  const player = game.player;
  game.cash = Math.max(0, game.cash - fee);
  if (player.car) {
    player.car.driver = 'none';
    player.car = null;
  }
  player.state = 'walk';
  player.health = PLAYER.health;
  player.vx = 0;
  player.vy = 0;
  const spot = kind === 'busted' ? game.city.locations.police : game.city.locations.hospital;
  player.x = spot.x;
  player.y = spot.y;
  game.cars = game.cars.filter((car) => !(car.kind === CAR_KIND.POLICE && car.driver === 'police'));
  game.officers = [];
  game.wanted = createWanted();
  game.bullets = [];
  game.over = null;
  missionInterrupted(game);
  game.dirtySave = true;
}

/** One fixed step of the whole simulation. Input is the live input object from input.js. */
export function stepGame(game, input, dt) {
  game.time += dt;
  game.clock = (game.clock + dt * CLOCK_RATE) % 1440;
  if (game.crashSoundT > 0) game.crashSoundT -= dt;
  if (game.hurtFlash > 0) game.hurtFlash = Math.max(0, game.hurtFlash - dt * 1.6);

  // The phone: messages arrive one at a time and stay a few seconds each.
  if (game.phoneCurrent === null && game.phoneQueue.length > 0) {
    game.phoneCurrent = game.phoneQueue.shift();
    game.phoneT = 6.5;
  } else if (game.phoneCurrent !== null) {
    game.phoneT -= dt;
    if (game.phoneT <= 0) game.phoneCurrent = null;
  }

  const actions = game.pendingActions;
  game.pendingActions = 0;

  if (!game.over && !game.attract) stepPlayerActions(game, input, actions, dt);
  if (!game.over) {
    stepTraffic(game, dt);
    stepPedestrians(game, dt);
    maintainPeds(game, dt);
    if (!game.attract) {
      stepPolice(game, dt);
      stepMissions(game, dt);
    }
    stepCombat(game, dt);
    stepCollisions(game, dt);
    stepRegen(game, dt);
  } else {
    // The run is over: let the street carry on behind the end screen, quietly.
    stepTraffic(game, dt);
    stepPedestrians(game, dt);
    stepCombat(game, dt);
  }
}

function stepPlayerActions(game, input, actions, dt) {
  const player = game.player;
  if (actions & ACTION_INTERACT) {
    if (player.car) exitCar(game);
    else {
      const car = findEnterableCar(game);
      if (car) enterCar(game, car);
    }
  }
  if (actions & ACTION_PUNCH) punch(game);
  if (actions & ACTION_CALL) {
    // T asks Marisol to hurry: a job that is being lined up starts now.
    if (game.mission.phase === 'between') game.mission.betweenT = Math.min(game.mission.betweenT, 0.15);
    if (game.mission.phase === 'freeroam') game.mission.betweenT = Math.min(game.mission.betweenT, 0.15);
  }
  if (player.car) {
    const car = player.car;
    const before = Math.abs(car.speed);
    stepCarPhysics(game.city, car, drivingControl(input), dt);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    if (car.hitWall > 170) {
      car.health -= (car.hitWall - 150) * 0.12;
      if (car.hitWall > 300) damagePlayer(game, 6);
      if (game.crashSoundT <= 0) {
        game.sounds.push('crash');
        game.crashSoundT = 0.25;
      }
      burst(game, car.x, car.y, '#ffd76a', 7, 5);
      makeNoise(game, car.x, car.y, 1.6);
      void before;
    }
  } else {
    stepPlayerOnFoot(game, input, dt);
    if (input.mouse.down) shoot(game);
  }
}

function stepTraffic(game, dt) {
  const pos = playerPosition(game);
  const blockers = [];
  if (!game.player.car && !game.attract) blockers.push({ x: game.player.x, y: game.player.y });
  for (const officer of game.officers) if (officer.state !== 'down') blockers.push(officer);
  for (const car of game.cars) {
    if (car.driver !== 'ai') continue;
    // A traffic car that fell far behind the action rejoins near the player, off-screen.
    if (Math.hypot(car.x - pos.x, car.y - pos.y) > 1750) {
      let bestNode = null;
      let bestD = Infinity;
      for (const node of game.city.nodes) {
        const d = Math.hypot(node.x - pos.x, node.y - pos.y);
        if (d > 680 && d < bestD) {
          bestD = d;
          bestNode = node;
        }
      }
      if (bestNode) {
        routeTrafficCar(car, AVENUES_X.indexOf(bestNode.x), STREETS_Y.indexOf(bestNode.y), game.rng);
        continue;
      }
    }
    stepTrafficCar(game.city, car, game.cars, game.rng, dt, blockers);
  }
}

function maintainPeds(game, dt) {
  game.pedSpawnT -= dt;
  const pos = playerPosition(game);
  game.peds = game.peds.filter((ped) => ped.kind !== 'ped' || Math.hypot(ped.x - pos.x, ped.y - pos.y) < 1250);
  const count = game.peds.filter((ped) => ped.kind === 'ped').length;
  if (count < PED_TARGET && game.pedSpawnT <= 0) {
    spawnPedestrian(game);
    game.pedSpawnT = 0.7;
  }
}

function stepRegen(game, dt) {
  const player = game.player;
  if (player.health > 0 && game.time - player.lastHurt > 6) {
    player.health = Math.min(PLAYER.health, player.health + dt * 3.5);
  }
}

/** Car against car, car against person: the meetings that bend metal and make crimes. */
function stepCollisions(game, dt) {
  void dt;
  const cars = game.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.health <= 0 && a.driver === 'none') continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (Math.abs(a.x - b.x) > 52 || Math.abs(a.y - b.y) > 52) continue;
      collideCars(game, a, b);
    }
  }
  // Cars meet people.
  const people = [...game.peds, ...game.officers];
  if (!game.player.car && !game.attract) people.push(game.player);
  for (const car of cars) {
    if (Math.abs(car.speed) < 4) continue;
    for (const person of people) {
      if (person.state === 'down' || person.state === 'ride') continue;
      if (Math.abs(person.x - car.x) > 40 || Math.abs(person.y - car.y) > 40) continue;
      for (const circle of carCircles(car)) {
        if (Math.hypot(person.x - circle.x, person.y - circle.y) < circle.r + 9) {
          hitPersonWithCar(game, car, person);
          break;
        }
      }
    }
  }
}

function collideCars(game, a, b) {
  for (const ca of carCircles(a)) {
    for (const cb of carCircles(b)) {
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      const dist = Math.hypot(dx, dy);
      const min = ca.r + cb.r;
      if (dist === 0 || dist >= min) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const push = (min - dist) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const impulse = -rel * 0.72;
        a.vx -= nx * impulse;
        a.vy -= ny * impulse;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
        a.speed = a.vx * Math.cos(a.angle) + a.vy * Math.sin(a.angle);
        b.speed = b.vx * Math.cos(b.angle) + b.vy * Math.sin(b.angle);
        const severity = -rel;
        if (severity > 70) {
          a.health -= severity * 0.05;
          b.health -= severity * 0.05;
          burst(game, (ca.x + cb.x) / 2, (ca.y + cb.y) / 2, '#ffd76a', severity > 150 ? 9 : 5, 5);
          if (severity > 120) {
            makeNoise(game, a.x, a.y, 1.6);
            if (game.crashSoundT <= 0) {
              game.sounds.push('crash');
              game.crashSoundT = 0.25;
            }
            const playerCar = game.player.car;
            if (playerCar && (a === playerCar || b === playerCar)) {
              const other = a === playerCar ? b : a;
              if (other.kind === CAR_KIND.POLICE) reportCrime(game, 'hitPoliceCar', other.x, other.y);
              else reportCrime(game, 'hitCar', other.x, other.y);
              if (severity > 260) damagePlayer(game, 5);
            }
          }
        }
      }
      return;
    }
  }
}

function hitPersonWithCar(game, car, person) {
  const speed = Math.abs(car.speed);
  const isPlayer = person === game.player;
  if (speed < 55) {
    // A nudge: the person steps (or is shoved) aside and takes offence, not injury.
    if (!isPlayer && person.state !== 'down') {
      person.state = 'flee';
      person.fleeT = 1.4;
    }
    return;
  }
  const fx = Math.cos(car.angle) * Math.sign(car.speed);
  const fy = Math.sin(car.angle) * Math.sign(car.speed);
  if (isPlayer) {
    damagePlayer(game, speed * 0.13);
    game.player.vx += fx * speed * 1.4;
    game.player.vy += fy * speed * 1.4;
    game.sounds.push('crash');
    return;
  }
  knockDown(game, person, speed * 0.45);
  if (car.driver === 'player') {
    if (person.kind === 'officer') reportCrime(game, 'shotPolice', person.x, person.y, true);
    else reportCrime(game, 'hitPed', person.x, person.y);
    makeNoise(game, car.x, car.y, 1.6);
  }
  if (game.crashSoundT <= 0) {
    game.sounds.push('crash');
    game.crashSoundT = 0.25;
  }
}
