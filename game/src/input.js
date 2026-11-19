// Keyboard and mouse input. Held keys and the pointer are read as continuous state each step;
// one-shot presses (interact, pause, confirm, mute) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice. The mouse
// position is kept in the game's 1280x720 logical coordinates so aiming matches what is drawn.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;
export const ACTION_CALL = 32;

const CONFIRM = new Set(['Enter', 'Space']);
const PAUSE = new Set(['Escape', 'KeyP']);

export function createInput(canvas, view) {
  const keys = new Set();
  let actions = 0;
  const mouse = { x: 640, y: 360, down: false };

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' || event.code === 'Space') {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyE') {
      if (!event.repeat) actions |= ACTION_INTERACT;
    } else if (event.code === 'KeyF') {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'KeyT') {
      if (!event.repeat) actions |= ACTION_CALL;
    }
    keys.add(event.code);
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * view.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * view.height;
  }
  canvas.addEventListener('pointermove', toLogical);
  canvas.addEventListener('pointerdown', (event) => {
    toLogical(event);
    mouse.down = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  return {
    mouse,
    /** True while the key with this KeyboardEvent.code is held down. */
    held(code) {
      return keys.has(code);
    },
    /** The movement axes: x and y each in -1..1 from WASD or the arrow keys. */
    moveAxes() {
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Forget queued one-shot presses (used when a screen changes under the player's hands). */
    clearActions() {
      actions = 0;
    },
  };
}
