# Vice Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ocoyan31-sys/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ocoyan31-sys/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Vice Harbor** is an original open-world crime game that runs in a desktop
browser from static files — no build step, no network request, every sound
synthesized live. You are a new arrival in **Port Brisa**, a sun-soaked harbour
city of pastel blocks, warehouses, palm-lined promenades, a beach and three
piers, with forty dollars in your pocket and a borrowed phone. The phone
belongs to **Marisol Vega**, who moves what the port forgets to log. She is
hiring.

## The city

- A 3584×3072 top-down city: seven avenues and five streets of routed,
  lane-following traffic; sidewalks full of pedestrians who stroll, panic and
  flee; parked cars on every kerb; crates, palms, beach umbrellas and lamps
  that glow after dark.
- A day that turns as you play — bright mornings, golden sunsets, blue nights —
  on an eight-minute clock.
- Named ground the story uses: Port Brisa General (hospital), the PBPD
  station, Brisa Arms, the Palms Apartments, Pier Storage, the docks, Coral
  Marina, and Vega Motors at the east end of Harbour Blvd.

## What you do

- **Walk, sprint, drive.** WASD/arrows move; Shift sprints; **E** takes any car
  in reach — parked, or rolling if you scare its driver out — and the same key
  steps out again. Driving is arcade physics with grip, drift and real
  collisions against buildings, traffic and the law.
- **Work Marisol's chain.** Four jobs delivered as phone messages with map
  markers: *Harbour Run* (a package off Pier One, delivered against the
  clock), *Three Drops* (cash pickups that each raise your heat), *The
  Getaway* (lift her driver Dario, lose the police, bring him home), and
  *Hot Wheels* (steal the Sunfire GT at the marina and deliver it while the
  whole force hunts it). Jobs pay cash and respect; finish the chain and the
  harbour is yours, with the work repeating at better money.
- **Mind the stars.** Crimes only count when witnessed — a pedestrian, an
  officer, a patrol car with a clear view. One to five stars bring patrol
  cars that hunt your last seen position and foot officers who run you down
  and, at three stars, open fire. A busted meter fills when they pin you
  slow; break line of sight and stay hidden and the heat bleeds away.
  Busted ends at the station with a release fee; wasted ends at the hospital
  with a bill. Either way the job you were on is gone.
- **Fight.** **F** punches; the mouse aims and click fires a pistol with
  limited rounds. The fallen drop cash; medkits wait at the hospital,
  ammunition at Brisa Arms.

## The frame around it

Title screen over the living city (New Game / Continue), pause with your
run's stats, busted and wasted screens with the fee and the figures, a
mission-complete card after every job, and a HUD that never sleeps: cash,
respect, health, wanted stars, the clock, your current objective with its
distance and countdown, Marisol's phone, and a minimap of the whole city
with police blips and the job marker. Progress — money, respect, the next
job, the hour, where you stood — saves itself to localStorage. **M** mutes
the synthesized engine, sirens, gunfire and title bassline.

## Layout of the code

`game/` is the whole game, plain ES modules with one job each:
`city.js` builds Port Brisa and pre-renders it; `world.js` owns the state
and the fixed-step simulation; `player.js`, `vehicles.js`, `pedestrians.js`,
`police.js`, `combat.js` and `missions.js` are the systems; `render.js`,
`hud.js` and `screens.js` draw the world, the instruments and the menus;
`audio.js` synthesizes the sound; `shots.js` stages the four deterministic
screenshot scenes behind `?shot=start|drive|chase|end&seed=N`.
`capture-screenshots.mjs` re-takes them in headless Chrome.

Play it locally: `node serve.ts`, then open http://localhost:8080.

Entered in make.fun's [Make GTA 6](https://make.fun/bounty/gta6-01) bounty.
Everything in Port Brisa — its streets, names, people and story — is original
to this game.
