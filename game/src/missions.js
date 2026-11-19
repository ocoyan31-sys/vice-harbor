// The work: four jobs from fixer Marisol Vega, told over a cheap phone. Meet her at Vega
// Motors and the chain runs — a package across the harbour against the clock, three cash
// drops that each bring the police closer, a getaway for her driver Dario that only ends
// when the stars are gone, and a stolen Sunfire GT to deliver while the whole force hunts
// it. Each job pays cash and respect; fail one — the clock, an arrest, a wreck — and she
// offers it again. Finish all four and Port Brisa is yours to roam, with the jobs repeating
// at better money for as long as you keep answering the phone.
import { starsOf } from './police.js';
import { createPedestrian } from './pedestrians.js';
import { exitCar, playerPosition } from './player.js';
import { floatText } from './combat.js';
import { createCar, CAR_KIND } from './vehicles.js';

export const MISSIONS = [
  { title: 'Harbour Run', pay: 350, respect: 10 },
  { title: 'Three Drops', pay: 480, respect: 15 },
  { title: 'The Getaway', pay: 900, respect: 20 },
  { title: 'Hot Wheels', pay: 1500, respect: 30 },
];

const DROP_POINTS = [
  { x: 1400, y: 330 },
  { x: 2900, y: 1450 },
  { x: 450, y: 1150 },
];

export function createMissionState() {
  return {
    phase: 'intro', // 'intro' | 'active' | 'between' | 'freeroam'
    index: 0,
    step: 0,
    marker: null,
    objective: 'Meet Marisol Vega at Vega Motors',
    timer: -1,
    payScale: 1,
    betweenT: 0,
    carEntered: null,
    dario: null,
    hotCar: null,
  };
}

/** Queue a phone message; the HUD's phone shows them one at a time, Marisol first among voices. */
export function pushPhone(game, from, text) {
  game.phoneQueue.push({ from, text });
}

/** Start the run's story: Marisol introduces herself while the player stands on the pier. */
export function startStory(game) {
  pushPhone(game, 'Marisol Vega', 'You made it to Port Brisa. Good. The boat did not sink.');
  pushPhone(game, 'Marisol Vega', 'I am Marisol. I move things the port forgets to log.');
  pushPhone(game, 'Marisol Vega', 'Come to Vega Motors, east end of Harbour Blvd. Work is waiting.');
  const garage = game.city.locations.garage;
  game.mission.marker = { x: garage.x, y: garage.y, label: 'Vega Motors' };
  game.mission.objective = 'Meet Marisol Vega at Vega Motors';
}

function setObjective(game, text, marker) {
  game.mission.objective = text;
  game.mission.marker = marker;
}

function startMission(game, index) {
  const m = game.mission;
  m.phase = 'active';
  m.step = 0;
  m.timer = -1;
  m.carEntered = null;
  const L = game.city.locations;
  if (index === 0) {
    pushPhone(game, 'Marisol Vega', 'Job one. A package waits at the end of Pier One. Bring it to Pier Storage No. 3.');
    setObjective(game, 'Pick up the package at Pier One', { x: L.docks.x, y: L.docks.y, label: 'Package' });
  } else if (index === 1) {
    pushPhone(game, 'Marisol Vega', 'Three drops, three corners of my city. Each one will bring attention. Be quick.');
    setObjective(game, 'Collect the cash drops (0/3)', { ...DROP_POINTS[0], label: 'Cash drop' });
  } else if (index === 2) {
    const dario = createPedestrian(1856, 690, game.rng, 'crew');
    dario.name = 'Dario';
    dario.state = 'wait';
    game.peds.push(dario);
    m.dario = dario;
    pushPhone(game, 'Marisol Vega', 'My driver Dario is stuck by Central Ave. Pick him up, lose the police, keep him breathing.');
    setObjective(game, 'Pick up Dario by Central Ave — you need a car', { x: dario.x, y: dario.y, label: 'Dario' });
  } else if (index === 3) {
    const hot = createCar(CAR_KIND.HOT, 2900, 2612, Math.PI, '#ff2e88');
    game.cars.push(hot);
    m.hotCar = hot;
    pushPhone(game, 'Marisol Vega', 'A Sunfire GT sits at Coral Marina with the wrong owner. Bring it home to my garage.');
    setObjective(game, 'Steal the Sunfire GT at Coral Marina', { x: hot.x, y: hot.y, label: 'Sunfire GT' });
  }
}

function completeMission(game) {
  const m = game.mission;
  const def = MISSIONS[m.index];
  const pay = Math.round(def.pay * m.payScale);
  game.cash += pay;
  game.respect += def.respect;
  game.stats.missionsDone += 1;
  game.summary = {
    title: `JOB COMPLETE — ${def.title}`,
    lines: [`Paid $${pay.toLocaleString('en-US')}`, `Respect +${def.respect} · Total respect ${game.respect}`],
    t: 6,
  };
  game.sounds.push('complete');
  game.dirtySave = true;
  pushPhone(game, 'Marisol Vega', m.index === 3 ? 'That was the last of it. The harbour is yours now, friend.' : 'Good work. Breathe. The next job comes soon.');
  m.index += 1;
  m.timer = -1;
  m.marker = null;
  m.hotCar = null;
  m.dario = null;
  if (m.index >= MISSIONS.length) {
    m.phase = 'freeroam';
    m.betweenT = 26;
    m.objective = 'Free roam — Marisol will call when there is more work';
  } else {
    m.phase = 'between';
    m.betweenT = 5;
    m.objective = 'Marisol is lining up the next job…';
  }
}

export function failMission(game, reason) {
  const m = game.mission;
  if (m.phase !== 'active') return;
  pushPhone(game, 'Marisol Vega', reason);
  if (m.dario) {
    m.dario.kind = 'ped';
    m.dario.state = 'walk';
    m.dario = null;
  }
  if (m.hotCar) {
    m.hotCar.kind = CAR_KIND.PARKED;
    m.hotCar = null;
  }
  m.phase = 'between';
  m.betweenT = 6;
  m.timer = -1;
  m.marker = null;
  m.objective = 'Marisol is lining up the job again…';
}

/** An arrest or a hospital trip mid-job loses the job. Called as the player respawns. */
export function missionInterrupted(game) {
  if (game.mission.phase === 'active') failMission(game, 'You lost the job. Come back when you are ready — it will still be there.');
}

function near(pos, x, y, radius) {
  return Math.hypot(pos.x - x, pos.y - y) < radius;
}

/** Advance the story by one step: markers, timers, pickups, deliveries, escapes. */
export function stepMissions(game, dt) {
  const m = game.mission;
  const pos = playerPosition(game);
  const L = game.city.locations;

  if (game.summary) {
    game.summary.t -= dt;
    if (game.summary.t <= 0) game.summary = null;
  }

  if (m.phase === 'intro') {
    if (near(pos, L.garage.x, L.garage.y, 64)) startMission(game, 0);
    return;
  }
  if (m.phase === 'between') {
    m.betweenT -= dt;
    if (m.betweenT <= 0) startMission(game, m.index);
    return;
  }
  if (m.phase === 'freeroam') {
    m.betweenT -= dt;
    if (m.betweenT <= 0) {
      m.index = 0;
      m.payScale = 1.5;
      m.phase = 'between';
      m.betweenT = 2;
      pushPhone(game, 'Marisol Vega', 'The port never sleeps, friend. More work, better money.');
    }
    return;
  }
  if (m.phase !== 'active') return;

  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(game, 'Too slow. The buyer walked. We try again.');
      return;
    }
  }

  if (m.index === 0) {
    if (m.step === 0 && near(pos, L.docks.x, L.docks.y, 36)) {
      m.step = 1;
      m.timer = 240;
      game.sounds.push('pickup');
      floatText(game, pos.x, pos.y - 26, 'PACKAGE ON BOARD', '#ffb347');
      setObjective(game, 'Deliver the package to Pier Storage No. 3', { x: L.warehouse.x, y: L.warehouse.y, label: 'Drop-off' });
    } else if (m.step === 1 && near(pos, L.warehouse.x, L.warehouse.y, 48)) {
      completeMission(game);
    }
  } else if (m.index === 1) {
    const drop = DROP_POINTS[m.step];
    if (drop && near(pos, drop.x, drop.y, 32)) {
      game.cash += 120;
      game.sounds.push('cash');
      floatText(game, drop.x, drop.y - 22, '+$120 DROP', '#7dd069');
      const before = starsOf(game.wanted);
      game.wanted.points = Math.min(500, game.wanted.points + 100);
      game.wanted.lastSeenX = pos.x;
      game.wanted.lastSeenY = pos.y;
      game.wanted.unseen = 0;
      if (starsOf(game.wanted) > before) game.sounds.push('starup');
      m.step += 1;
      if (m.step >= DROP_POINTS.length) completeMission(game);
      else setObjective(game, `Collect the cash drops (${m.step}/3)`, { ...DROP_POINTS[m.step], label: 'Cash drop' });
    }
  } else if (m.index === 2) {
    stepGetaway(game, pos);
  } else if (m.index === 3) {
    stepHotWheels(game, pos);
  }
}

function stepGetaway(game, pos) {
  const m = game.mission;
  const dario = m.dario;
  if (!dario) return;
  if (m.step === 0) {
    m.marker = { x: dario.x, y: dario.y, label: 'Dario' };
    if (game.player.car && near(pos, dario.x, dario.y, 120)) {
      dario.state = 'walk';
      dario.waypoints = [{ x: pos.x, y: pos.y }];
      dario.wpIndex = 0;
      if (near(pos, dario.x, dario.y, 34)) {
        dario.state = 'ride';
        m.step = 1;
        game.wanted.points = Math.max(game.wanted.points, 300);
        game.wanted.lastSeenX = pos.x;
        game.wanted.lastSeenY = pos.y;
        game.wanted.unseen = 0;
        game.sounds.push('starup');
        setObjective(game, 'Lose the PBPD — break their line of sight', null);
        pushPhone(game, 'Dario', 'Go go go! They were waiting for me!');
      }
    }
  } else if (m.step === 1) {
    if (dario.state === 'ride' && !game.player.car) {
      // The player bailed: Dario gets out and waits by the car.
      dario.state = 'wait';
      dario.x = pos.x + 24;
      dario.y = pos.y + 10;
    } else if (dario.state === 'wait' && game.player.car && near(pos, dario.x, dario.y, 52)) {
      dario.state = 'ride';
    }
    if (dario.state === 'ride' && game.player.car) {
      dario.x = game.player.car.x;
      dario.y = game.player.car.y;
    }
    if (starsOf(game.wanted) === 0) {
      m.step = 2;
      const safe = game.city.locations.safehouse;
      setObjective(game, 'Take Dario to the Palms Apartments', { x: safe.x, y: safe.y, label: 'Safehouse' });
      pushPhone(game, 'Dario', 'We lost them. Take me to the Palms, friend.');
    }
  } else if (m.step === 2) {
    if (dario.state === 'ride' && game.player.car) {
      dario.x = game.player.car.x;
      dario.y = game.player.car.y;
    }
    const safe = game.city.locations.safehouse;
    if (near(pos, safe.x, safe.y, 52) && dario.state === 'ride') {
      dario.state = 'walk';
      dario.kind = 'ped';
      dario.x = safe.x + 16;
      dario.y = safe.y + 8;
      completeMission(game);
    }
  }
}

function stepHotWheels(game, pos) {
  const m = game.mission;
  const hot = m.hotCar;
  if (!hot) return;
  if (hot.health <= 0) {
    failMission(game, 'The Sunfire is scrap. That money is gone, friend.');
    return;
  }
  if (m.step === 0) {
    m.marker = { x: hot.x, y: hot.y, label: 'Sunfire GT' };
    if (m.carEntered === hot) {
      m.step = 1;
      game.wanted.points = Math.max(game.wanted.points, 400);
      game.wanted.lastSeenX = pos.x;
      game.wanted.lastSeenY = pos.y;
      game.wanted.unseen = 0;
      game.sounds.push('starup');
      const garage = game.city.locations.garage;
      setObjective(game, 'Deliver the Sunfire to Vega Motors', { x: garage.x, y: garage.y, label: 'Vega Motors' });
      pushPhone(game, 'Marisol Vega', 'That is her. Bring her home — and keep her pretty.');
    }
  } else if (m.step === 1) {
    const garage = game.city.locations.garage;
    if (game.player.car === hot && near(pos, garage.x, garage.y, 54)) {
      exitCar(game);
      game.cars.splice(game.cars.indexOf(hot), 1);
      completeMission(game);
    }
  }
}
