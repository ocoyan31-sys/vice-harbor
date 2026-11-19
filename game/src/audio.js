// Sound, made from nothing: a small procedural WebAudio kit. One-shot effects are synthesized
// per call — a noise burst for a shot, a two-note chirp for cash, a descending slide for a
// busted — and three loops run under the game: the engine note that follows the player's car,
// the two-tone siren that swells as a patrol car closes in, and a lazy bassline under the
// title screen. M mutes the master gain; nothing here loads a file or touches the network.
import { starsOf } from './police.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let bassStep = 0;
  let bassT = 0;

  /** Create the context on the first user gesture; safe to call again. */
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const sirenFilter = ctx.createBiquadFilter();
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 1800;
    sirenOsc.connect(sirenFilter).connect(sirenGain).connect(master);
    sirenOsc.start();
  }

  function tone(freqA, freqB, seconds, type = 'sine', gain = 0.16, when = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t0 + seconds);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  function noise(seconds, freq, gain = 0.2, when = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
  }

  /** Play one named effect from the game's sound queue. Unknown names are ignored. */
  function play(name) {
    if (!ctx || muted) return;
    switch (name) {
      case 'shot': noise(0.13, 2600, 0.32); tone(160, 60, 0.1, 'square', 0.1); break;
      case 'punch': tone(130, 48, 0.09, 'sine', 0.3); break;
      case 'clang': tone(740, 620, 0.07, 'square', 0.08); tone(1180, 900, 0.05, 'square', 0.05); break;
      case 'crash': noise(0.28, 500, 0.34); tone(90, 40, 0.22, 'sine', 0.22); break;
      case 'door': tone(210, 140, 0.06, 'square', 0.07); break;
      case 'cash': tone(1318, 1318, 0.07, 'sine', 0.14); tone(1760, 1760, 0.12, 'sine', 0.14, 0.07); break;
      case 'pickup': tone(620, 940, 0.1, 'sine', 0.15); break;
      case 'click': tone(900, 700, 0.05, 'square', 0.08); break;
      case 'starup': tone(620, 990, 0.32, 'sawtooth', 0.07); break;
      case 'complete':
        tone(523, 523, 0.11, 'triangle', 0.16);
        tone(659, 659, 0.11, 'triangle', 0.16, 0.1);
        tone(784, 784, 0.2, 'triangle', 0.16, 0.2);
        break;
      case 'busted': tone(392, 392, 0.16, 'triangle', 0.18); tone(311, 311, 0.16, 'triangle', 0.18, 0.17); tone(233, 196, 0.34, 'triangle', 0.18, 0.34); break;
      case 'wasted': tone(220, 55, 0.9, 'sawtooth', 0.12); break;
      default: break;
    }
  }

  const BASSLINE = [55, 0, 55, 65.41, 0, 55, 0, 49, 55, 0, 55, 73.42, 0, 82.41, 0, 61.74];

  /** The loops: engine by speed, siren by the nearest patrol car, bass under the title. */
  function update(game, dt) {
    if (!ctx) return;
    const t = ctx.currentTime;
    // Engine.
    const car = game.player.car;
    if (car && !game.over && game.screen === 'play') {
      const load = Math.abs(car.speed);
      engineOsc.frequency.setTargetAtTime(48 + load * 0.32, t, 0.06);
      engineGain.gain.setTargetAtTime(0.028 + Math.min(0.05, load * 0.00012), t, 0.09);
    } else {
      engineGain.gain.setTargetAtTime(0, t, 0.1);
    }
    // Siren: only a chase you can hear — a patrol car within earshot while wanted.
    let nearest = Infinity;
    if (starsOf(game.wanted) > 0) {
      const pos = game.player.car ?? game.player;
      for (const other of game.cars) {
        if (other.kind !== 'police' || other.driver !== 'police') continue;
        nearest = Math.min(nearest, Math.hypot(other.x - pos.x, other.y - pos.y));
      }
    }
    if (nearest < 760 && game.screen === 'play') {
      sirenOsc.frequency.value = Math.floor(game.time * 2.6) % 2 === 0 ? 712 : 958;
      sirenGain.gain.setTargetAtTime(0.012 + 0.03 * (1 - nearest / 760), t, 0.1);
    } else {
      sirenGain.gain.setTargetAtTime(0, t, 0.1);
    }
    // Title bassline.
    if (game.screen === 'title' && !muted) {
      bassT -= dt;
      if (bassT <= 0) {
        bassT = 0.21;
        const freq = BASSLINE[bassStep % BASSLINE.length];
        bassStep += 1;
        if (freq > 0) tone(freq, freq, 0.19, 'triangle', 0.2);
      }
    }
  }

  return {
    ensure,
    play,
    update,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
