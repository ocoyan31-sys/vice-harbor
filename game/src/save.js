// The save: one localStorage record holding where the run stands — cash, respect, the next
// job Marisol will offer, ammunition, the hour, and where the player was standing. Continue
// on the title screen picks the story up from there; New Game overwrites it without asking.
import { SAVE_KEY } from './config.js';
import { MISSIONS } from './missions.js';

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.nextMission !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(game) {
  try {
    const m = game.mission;
    const pos = game.player.car ? game.player.car : game.player;
    const data = {
      cash: game.cash,
      respect: game.respect,
      nextMission: m.phase === 'intro' ? 0 : Math.min(m.index, MISSIONS.length),
      intro: m.phase === 'intro',
      payScale: m.payScale,
      ammo: game.player.ammo,
      clock: Math.floor(game.clock),
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      missionsDone: game.stats.missionsDone,
      carsStolen: game.stats.carsStolen,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage can be off (private windows): the run then lasts this visit only.
  }
}
