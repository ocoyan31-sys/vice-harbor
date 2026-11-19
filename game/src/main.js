// Boot and the one loop. The world advances in fixed 1/60 s steps (several in a slow frame,
// none in a fast one) while the renderer paints what is there; this file owns the screens —
// title over the living city, play, pause, and the busted and wasted ends of a run — and the
// moments between them: starting fresh, continuing a save, charging the fee, respawning.
// ?seed=N fixes the city. ?shot=start|drive|chase|end (with &seed=N) stages a deterministic
// scene from shots.js instead of running the loop, paints it and sets window.__shotReady.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { applySave, createGame, newRun, respawn, stepGame } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { hasSave, readSave, writeSave } from './save.js';
import { starsOf } from './police.js';
import { floatText } from './combat.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(createRandom(seed));
window.__game = game; // a handle for the screenshot tooling and curious players alike
const renderer = createRenderer(canvas);
const input = createInput(canvas, renderer.view);
const audio = createAudio();
const ui = { hasSave: hasSave(), hover: null, buttons: [], saveSummary: null, endInfo: { fee: 0, stars: 0 } };

function refreshSaveSummary() {
  ui.hasSave = hasSave();
  const data = ui.hasSave ? readSave() : null;
  ui.saveSummary = data ? `$${data.cash.toLocaleString('en-US')} · respect ${data.respect} · ${data.missionsDone} jobs done` : null;
}
refreshSaveSummary();

function announce(message) {
  status.textContent = message;
}

function saveNow() {
  writeSave(game);
  game.dirtySave = false;
  refreshSaveSummary();
}

function runShot(name) {
  stageShot(name, game, renderer);
  const shotUi = { hasSave: false, hover: null, buttons: [], saveSummary: null, endInfo: { fee: 250, stars: 3 } };
  let painted = 0;
  function paint() {
    renderer.draw(game, shotUi);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let endFee = 0;

  const gesture = () => audio.ensure();
  window.addEventListener('pointerdown', gesture, { once: false });
  window.addEventListener('keydown', gesture, { once: false });

  function startNew() {
    newRun(game);
    game.screen = SCREEN_PLAY;
    input.clearActions();
    announce('A new run in Port Brisa. Meet Marisol Vega at Vega Motors.');
  }

  function startContinue() {
    const data = readSave();
    if (!data) {
      startNew();
      return;
    }
    applySave(game, data);
    game.screen = SCREEN_PLAY;
    input.clearActions();
    announce('Back on the streets of Port Brisa.');
  }

  function buttonAt(x, y) {
    for (const button of ui.buttons) {
      if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) return button.id;
    }
    return null;
  }

  function handleTitle(actions) {
    ui.hover = buttonAt(input.mouse.x, input.mouse.y);
    if (!(actions & ACTION_CONFIRM)) return;
    const choice = ui.hover ?? (ui.hasSave ? 'continue' : 'new');
    if (choice === 'continue') startContinue();
    else startNew();
  }

  function handleEndScreen(actions) {
    if (!(actions & ACTION_CONFIRM)) return;
    respawn(game, game.screen === SCREEN_BUSTED ? 'busted' : 'wasted', endFee);
    game.screen = SCREEN_PLAY;
    saveNow();
    input.clearActions();
    announce('Back on the street.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += frameDt;

    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      if (game.screen === SCREEN_PLAY) floatText(game, game.player.x, game.player.y - 30, muted ? 'SOUND OFF' : 'SOUND ON', '#b9c0c9');
    }

    if (game.screen === SCREEN_TITLE) handleTitle(actions);
    else if (game.screen === SCREEN_BUSTED || game.screen === SCREEN_WASTED) handleEndScreen(actions);
    else if (game.screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        game.screen = SCREEN_PLAY;
        input.clearActions();
        announce('Playing.');
      }
    } else if (game.screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        game.screen = SCREEN_PAUSED;
        saveNow();
        input.clearActions();
        announce('Paused.');
      } else {
        game.pendingActions = actions;
      }
    }

    const simActive = game.screen === SCREEN_TITLE || game.screen === SCREEN_PLAY || game.screen === SCREEN_BUSTED || game.screen === SCREEN_WASTED;
    if (simActive) {
      while (accumulator >= STEP) {
        game.mouseWorld = renderer.screenToWorld(input.mouse.x, input.mouse.y);
        game.mouseDown = input.mouse.down;
        stepGame(game, input, STEP);
        accumulator -= STEP;
        if (game.screen === SCREEN_PLAY && game.over) {
          const stars = starsOf(game.wanted);
          endFee = game.over === 'busted'
            ? Math.min(game.cash, 100 + 50 * stars)
            : Math.min(game.cash, 25 + Math.floor(game.cash * 0.1));
          ui.endInfo = { fee: endFee, stars };
          game.screen = game.over === 'busted' ? SCREEN_BUSTED : SCREEN_WASTED;
          announce(game.over === 'busted' ? 'Busted.' : 'Wasted.');
          break;
        }
        if (game.screen !== SCREEN_TITLE && game.screen !== SCREEN_PLAY && game.screen !== SCREEN_BUSTED && game.screen !== SCREEN_WASTED) break;
      }
    } else {
      accumulator = 0;
    }
    if (game.dirtySave && game.screen === SCREEN_PLAY) saveNow();

    for (const name of game.sounds) audio.play(name);
    game.sounds.length = 0;
    audio.update(game, frameDt);
    renderer.update(game, frameDt);
    renderer.draw(game, ui);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === SCREEN_PLAY) {
      game.screen = SCREEN_PAUSED;
      saveNow();
      announce('Paused.');
    }
  });

  game.screen = SCREEN_TITLE;
  announce('Vice Harbor. Start a new game or continue.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
