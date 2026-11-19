// Cars: how they are built, how they move, and how the traffic of Port Brisa drives itself.
// A car is an arcade body — a heading, a velocity split into forward and lateral parts so it
// grips like a car and only drifts when shoved — steered either by the player, by the traffic
// router that follows the avenue grid lane by lane, or by the police pursuit in police.js.
// Collisions with the city are two circles, nose and tail, pushed out of the solid world.
import { AVENUES_X, CAR, CAR_COLORS, LANE_OFFSET, STREETS_Y } from './config.js';
import { resolveCircle } from './city.js';
import { pick } from './random.js';

export const CAR_KIND = { TRAFFIC: 'traffic', PARKED: 'parked', POLICE: 'police', HOT: 'hot' };

let nextCarId = 1;

export function createCar(kind, x, y, angle, color) {
  return {
    id: nextCarId++,
    kind,
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    speed: 0, // signed forward speed, kept for the HUD, the engine note and the busted rule
    color: color ?? '#cccccc',
    health: 100,
    driver: kind === CAR_KIND.TRAFFIC ? 'ai' : 'none',
    // Traffic routing: the crossing the car is heading for, and the one it came from.
    toI: 0,
    toJ: 0,
    fromI: 0,
    fromJ: 0,
    cruise: CAR.trafficSpeed,
    hitWall: 0, // impact strength against the city during the last step, read by world.js
    sirenPhase: Math.random() * 6,
    stuckT: 0, // how long traffic has wanted to move and could not (deadlock detection)
    unstickT: 0, // time left reversing out of a deadlock
  };
}

/** The two collision circles of a car, nose and tail, in world coordinates. */
export function carCircles(car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  return [
    { x: car.x + fx * 13, y: car.y + fy * 13, r: 12.5 },
    { x: car.x - fx * 13, y: car.y - fy * 13, r: 12.5 },
  ];
}

/**
 * Advance one car by dt under a control of {throttle: -1..1, steer: -1..1}. Returns nothing;
 * a hard meeting with the city is recorded on car.hitWall for the caller to make noise about.
 */
export function stepCarPhysics(city, car, control, dt) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let forward = car.vx * fx + car.vy * fy;
  let lateral = car.vx * -fy + car.vy * fx;

  if (control.throttle > 0) forward += CAR.accel * control.throttle * dt;
  else if (control.throttle < 0) {
    forward += (forward > 8 ? -CAR.brake : CAR.accel * 0.55 * control.throttle) * dt;
  }
  forward -= forward * CAR.drag * dt;
  if (control.throttle === 0) forward -= forward * 1.4 * dt;
  forward = Math.max(-CAR.reverseMax, Math.min(560, forward));
  if (Math.abs(forward) < 2 && control.throttle === 0) forward = 0;

  const turn = control.steer * 2.5 * Math.max(-1, Math.min(1, forward / 130));
  car.angle += turn * dt;
  lateral *= Math.max(0, 1 - CAR.grip * dt);

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  car.vx = nfx * forward + -nfy * lateral;
  car.vy = nfy * forward + nfx * lateral;
  car.speed = forward;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Collide: push nose and tail out of the solid city; a hard push is an impact.
  car.hitWall = 0;
  for (const circle of carCircles(car)) {
    const fixed = resolveCircle(city, circle.x, circle.y, circle.r);
    const dx = fixed.x - circle.x;
    const dy = fixed.y - circle.y;
    const push = Math.hypot(dx, dy);
    if (push > 0.01) {
      car.x += dx;
      car.y += dy;
      if (push > 2.2 && Math.abs(car.speed) > 60) car.hitWall = Math.max(car.hitWall, Math.abs(car.speed));
      car.vx *= 0.55;
      car.vy *= 0.55;
      car.speed *= 0.55;
    }
  }
}

/** The point of the target crossing that sits in this car's lane (right-hand traffic). */
function lanePoint(car) {
  const tx = AVENUES_X[car.toI];
  const ty = STREETS_Y[car.toJ];
  const fx = AVENUES_X[car.fromI];
  const fy = STREETS_Y[car.fromJ];
  if (tx !== fx) return { x: tx, y: ty + (tx > fx ? LANE_OFFSET : -LANE_OFFSET) };
  return { x: tx + (ty > fy ? -LANE_OFFSET : LANE_OFFSET), y: ty };
}

/** Choose the next crossing for a traffic car that just arrived: mostly straight on. */
function chooseNextNode(car, random) {
  const options = [];
  if (car.toI > 0) options.push({ i: car.toI - 1, j: car.toJ, w: car.fromI === car.toI - 1 ? 0.05 : 1 });
  if (car.toI < AVENUES_X.length - 1) options.push({ i: car.toI + 1, j: car.toJ, w: car.fromI === car.toI + 1 ? 0.05 : 1 });
  if (car.toJ > 0) options.push({ i: car.toI, j: car.toJ - 1, w: car.fromJ === car.toJ - 1 ? 0.05 : 1 });
  if (car.toJ < STREETS_Y.length - 1) options.push({ i: car.toI, j: car.toJ + 1, w: car.fromJ === car.toJ + 1 ? 0.05 : 1 });
  // Going straight (same axis as the approach) is twice as likely as turning.
  for (const option of options) {
    const straight = (option.i !== car.toI) === (car.fromI !== car.toI);
    if (straight) option.w *= 2;
  }
  let total = 0;
  for (const option of options) total += option.w;
  let roll = random() * total;
  for (const option of options) {
    roll -= option.w;
    if (roll <= 0) return option;
  }
  return options[0];
}

/** Put a traffic car on the grid at crossing (i, j), heading for a neighbouring crossing. */
export function routeTrafficCar(car, i, j, random) {
  car.fromI = i;
  car.fromJ = j;
  car.toI = i;
  car.toJ = j;
  const next = chooseNextNode(car, random);
  car.toI = next.i;
  car.toJ = next.j;
  car.x = AVENUES_X[i];
  car.y = STREETS_Y[j];
  const start = lanePoint(car);
  car.x = start.x;
  car.y = start.y;
  car.angle = Math.atan2(STREETS_Y[car.toJ] - STREETS_Y[car.fromJ], AVENUES_X[car.toI] - AVENUES_X[car.fromI]);
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;
}

/**
 * Drive one traffic car for a step: steer for the lane point of its target crossing, keep a
 * cruise speed, brake for a car close ahead, and pick the next crossing on arrival.
 */
export function stepTrafficCar(city, car, cars, random, dt, blockers = []) {
  // Deadlocked nose-to-nose with another car: back out, turn the wheel, and carry on.
  if (car.unstickT > 0) {
    car.unstickT -= dt;
    stepCarPhysics(city, car, { throttle: -0.85, steer: car.id % 2 === 0 ? 0.8 : -0.8 }, dt);
    return;
  }
  const aim = lanePoint(car);
  const distNode = Math.hypot(AVENUES_X[car.toI] - car.x, STREETS_Y[car.toJ] - car.y);
  if (distNode < 42) {
    car.fromI = car.toI;
    car.fromJ = car.toJ;
    const next = chooseNextNode(car, random);
    car.toI = next.i;
    car.toJ = next.j;
  }
  const desired = Math.atan2(aim.y - car.y, aim.x - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.4));

  // Brake when something — another car, or a person in the road — is close ahead.
  let throttle = car.speed < car.cruise ? 0.8 : 0;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const blockedBy = (ox, oy) => {
    const dx = ox - car.x;
    const dy = oy - car.y;
    const ahead = dx * fx + dy * fy;
    const side = Math.abs(dx * -fy + dy * fx);
    return ahead > 0 && ahead < 58 && side < 20;
  };
  for (const other of cars) {
    if (other === car || other.health <= 0) continue;
    if (blockedBy(other.x, other.y)) {
      throttle = car.speed > 30 ? -0.7 : 0;
      break;
    }
  }
  if (throttle >= 0) {
    for (const blocker of blockers) {
      if (blockedBy(blocker.x, blocker.y)) {
        throttle = car.speed > 30 ? -0.7 : 0;
        break;
      }
    }
  }
  // Wanting to move but not moving is a deadlock: start the escape clock.
  if (throttle > 0 && Math.abs(car.speed) < 9) {
    car.stuckT += dt;
    if (car.stuckT > 2.2) {
      car.stuckT = 0;
      car.unstickT = 0.8;
    }
  } else {
    car.stuckT = Math.max(0, car.stuckT - dt * 2);
  }
  stepCarPhysics(city, car, { throttle, steer }, dt);
}

/** Scatter parked cars along the avenue and street edges, ready to be stolen. */
export function placeParkedCars(city, random, count) {
  const parked = [];
  let guard = 0;
  while (parked.length < count && guard < count * 30) {
    guard += 1;
    let x;
    let y;
    let angle;
    if (random() < 0.62) {
      const ax = pick(random, AVENUES_X);
      const side = random() < 0.5 ? -1 : 1;
      x = ax + side * 44;
      y = randRangeLocal(random, 90, 2380);
      angle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (STREETS_Y.some((sy) => Math.abs(y - sy) < 84)) continue;
    } else {
      const sy = pick(random, STREETS_Y);
      const side = random() < 0.5 ? -1 : 1;
      y = sy + side * 44;
      x = randRangeLocal(random, 90, 3490);
      angle = side > 0 ? Math.PI : 0;
      if (AVENUES_X.some((ax) => Math.abs(x - ax) < 84)) continue;
    }
    if (parked.some((c) => Math.hypot(c.x - x, c.y - y) < 64)) continue;
    const car = createCar(CAR_KIND.PARKED, x, y, angle, pick(random, CAR_COLORS));
    parked.push(car);
  }
  // Two rides wait on the Vega Motors apron and one at the docks yard.
  parked.push(createCar(CAR_KIND.PARKED, 3010, 2548, 0, pick(random, CAR_COLORS)));
  parked.push(createCar(CAR_KIND.PARKED, 3240, 2548, Math.PI, pick(random, CAR_COLORS)));
  parked.push(createCar(CAR_KIND.PARKED, 470, 2470, Math.PI / 2, pick(random, CAR_COLORS)));
  return parked;
}

function randRangeLocal(random, min, max) {
  return min + random() * (max - min);
}

/** Paint one car: body, glass, wheels, lights; police get a flashing light bar. */
export function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Soft shadow first, so the car sits on the street.
  ctx.fillStyle = 'rgba(15,18,24,0.3)';
  ctx.fillRect(-CAR_LENGTH / 2 + 3, -CAR_WIDTH / 2 + 4, CAR_LENGTH, CAR_WIDTH);
  // Wheels.
  ctx.fillStyle = '#14161a';
  ctx.fillRect(-16, -CAR_WIDTH / 2 - 2, 10, 4);
  ctx.fillRect(7, -CAR_WIDTH / 2 - 2, 10, 4);
  ctx.fillRect(-16, CAR_WIDTH / 2 - 2, 10, 4);
  ctx.fillRect(7, CAR_WIDTH / 2 - 2, 10, 4);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,22,28,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (car.kind === CAR_KIND.POLICE) {
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-6, -CAR_WIDTH / 2 + 2, 13, CAR_WIDTH - 4);
  }
  if (car.kind === CAR_KIND.HOT) {
    ctx.fillStyle = 'rgba(20,20,26,0.85)';
    ctx.fillRect(-CAR_LENGTH / 2 + 1, -CAR_WIDTH / 2 + 3, 5, CAR_WIDTH - 6); // rear spoiler
  }
  // Cabin: windshield, roof, rear glass.
  ctx.fillStyle = 'rgba(24,34,46,0.92)';
  roundRect(ctx, 2, -CAR_WIDTH / 2 + 4, 7, CAR_WIDTH - 8, 2);
  ctx.fill();
  ctx.fillStyle = car.kind === CAR_KIND.POLICE ? '#e8ecf0' : shadeColor(car.color, 18);
  roundRect(ctx, -9, -CAR_WIDTH / 2 + 4, 11, CAR_WIDTH - 8, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(24,34,46,0.85)';
  roundRect(ctx, -14, -CAR_WIDTH / 2 + 4, 5, CAR_WIDTH - 8, 2);
  ctx.fill();
  // Lights: pale headlights, red tails.
  ctx.fillStyle = '#ffeebb';
  ctx.fillRect(CAR_LENGTH / 2 - 3, -CAR_WIDTH / 2 + 3, 3, 5);
  ctx.fillRect(CAR_LENGTH / 2 - 3, CAR_WIDTH / 2 - 8, 3, 5);
  ctx.fillStyle = '#c22e2e';
  ctx.fillRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2 + 3, 3, 5);
  ctx.fillRect(-CAR_LENGTH / 2, CAR_WIDTH / 2 - 8, 3, 5);
  if (car.kind === CAR_KIND.POLICE) {
    const phase = Math.floor(time * 5 + car.sirenPhase) % 2;
    ctx.fillStyle = phase === 0 ? '#ff3b30' : '#5e1f1c';
    ctx.fillRect(-8, -7, 7, 6);
    ctx.fillStyle = phase === 1 ? '#3a7bff' : '#1d3355';
    ctx.fillRect(-1, -7, 7, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 6.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PBPD', 0, 9);
  }
  ctx.restore();
  // A wrecked or burning car smokes.
  if (car.health < 38 && car.health > 0) {
    const wobble = Math.sin(time * 3 + car.id * 2.1) * 4;
    ctx.fillStyle = 'rgba(70,70,78,0.35)';
    ctx.beginPath();
    ctx.arc(car.x + wobble, car.y - 8 - (time * 9 + car.id * 7) % 14, 6 + ((time * 9) % 6), 0, Math.PI * 2);
    ctx.fill();
  }
}

const CAR_LENGTH = 44;
const CAR_WIDTH = 22;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shadeColor(hex, amt) {
  if (!hex.startsWith('#')) return hex;
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}
