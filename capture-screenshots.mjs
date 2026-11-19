// Screenshot tooling (development only, not part of the entry): drives headless Chrome over
// the DevTools protocol, opens each scene listed in shots.json, waits for the page to set
// window.__shotReady, and saves the frame as a JPEG in screenshots/. It also reports every
// console error and uncaught exception the page produced, and with --check it plays the game
// instead: title, Enter to start, walk a moment, pause, resume.
//
// The pages are opened as file:// URLs with --allow-file-access-from-files (which lets the
// game's ES modules import each other from disk) because this environment's Chromium build
// refuses every HTTP navigation to loopback; the files rendered are the same ones serve.ts
// serves, byte for byte. Two of its other launch requirements are handled below: a signed
// WebGL domain policy (the game is canvas-2D and never uses WebGL) in /tmp.
//   node capture-screenshots.mjs           capture the four screenshots
//   node capture-screenshots.mjs --check   playability and console-error check only
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const CDP = 9333;
const CHROME = '/opt/meta-chromium/chrome';
const INDEX_URL = pathToFileURL(join(here, 'game', 'index.html')).href;
const checkOnly = process.argv.includes('--check');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const listeners = [];
    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej }));
        },
        on(fn) {
          listeners.push(fn);
        },
        close() {
          ws.close();
        },
      });
    });
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(`${msg.error.message}`));
        else res(msg.result);
      } else if (msg.method) {
        for (const fn of listeners) fn(msg);
      }
    });
    ws.addEventListener('error', reject);
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`evaluate failed: ${result.exceptionDetails.text}`);
  return result.result.value;
}

async function main() {
  const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
  const firstUrl = checkOnly ? INDEX_URL : INDEX_URL + shots[0].query;
  const policyFile = '/tmp/vh-webgl-domains.txt';
  const policyBody = 'hatch-webgl-allowed-domains-v1\nexample.com\n';
  writeFileSync(policyFile, policyBody);
  const policySha = createHash('sha256').update(policyBody).digest('hex');
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP}`, '--window-size=1280,720',
    '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files',
    '--user-data-dir=/tmp/vh-chrome-profile',
    `--hatch-webgl-allowed-domains-file=${policyFile}`,
    `--hatch-webgl-allowed-domains-sha256=${policySha}`,
    firstUrl,
  ], { stdio: 'ignore' });
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i += 1) {
      const res = await fetch(`http://localhost:${CDP}/json/list`).catch(() => null);
      const list = res ? await res.json().catch(() => []) : [];
      target = list.find((t) => t.type === 'page' && t.url.includes('vice-harbor'));
      if (!target) await sleep(250);
    }
    if (!target) throw new Error('page target never appeared');
    const cdp = await connect(target.webSocketDebuggerUrl);
    const problems = [];
    cdp.on((msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        problems.push(`exception: ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        problems.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        problems.push(`log: ${msg.params.entry.text}`);
      }
    });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    // Pin the layout viewport to exactly 1280x720: the window's own height includes this
    // build's browser chrome, which would otherwise letterbox the game inside the frame.
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

    if (checkOnly) {
      await sleep(2500);
      console.log('screen at load:', await evaluate(cdp, 'window.__game && window.__game.screen'));
      console.log('attract mode:', await evaluate(cdp, 'window.__game && window.__game.attract'));
      const key = (type, code, vk) => cdp.send('Input.dispatchKeyEvent', { type, code, key: code, windowsVirtualKeyCode: vk });
      await key('keyDown', 'Enter', 13);
      await key('keyUp', 'Enter', 13);
      await sleep(600);
      console.log('screen after Enter:', await evaluate(cdp, 'window.__game && window.__game.screen'));
      console.log('objective:', await evaluate(cdp, 'window.__game && window.__game.mission.objective'));
      await key('keyDown', 'KeyW', 87);
      await sleep(1200);
      await key('keyUp', 'KeyW', 87);
      console.log('player moved to:', await evaluate(cdp, 'JSON.stringify({x: Math.round(window.__game.player.x), y: Math.round(window.__game.player.y)})'));
      await key('keyDown', 'Escape', 27);
      await key('keyUp', 'Escape', 27);
      await sleep(300);
      console.log('screen after Esc:', await evaluate(cdp, 'window.__game && window.__game.screen'));
      await key('keyDown', 'Escape', 27);
      await key('keyUp', 'Escape', 27);
      await sleep(300);
      console.log('screen after Esc again:', await evaluate(cdp, 'window.__game && window.__game.screen'));
      const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true });
      writeFileSync('/tmp/vh-playtest.jpg', Buffer.from(shot.data, 'base64'));
      console.log('playtest frame saved to /tmp/vh-playtest.jpg');
    } else {
      for (const shot of shots) {
        problems.length = 0;
        await cdp.send('Page.navigate', { url: INDEX_URL + shot.query });
        let ready = false;
        for (let i = 0; i < 120 && !ready; i += 1) {
          await sleep(300);
          ready = await evaluate(cdp, 'window.__shotReady === true').catch(() => false);
        }
        if (!ready) throw new Error(`shot ${shot.name} never became ready`);
        const frame = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true });
        const bytes = Buffer.from(frame.data, 'base64');
        writeFileSync(join(here, 'screenshots', shot.name), bytes);
        console.log(`captured ${shot.name} (${bytes.length} bytes)`);
        if (problems.length) console.log(`  page problems: ${problems.join(' | ')}`);
      }
    }
    if (problems.length) console.log(`problems: ${problems.join(' | ')}`);
    else console.log('no console errors or exceptions');
    cdp.close();
  } finally {
    chrome.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
