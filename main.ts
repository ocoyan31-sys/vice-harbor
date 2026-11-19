// Vice Harbor, a gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library.
//
// The game itself: an original open-world crime game in the harbour city of Port Brisa, drawn
// top-down on a canvas — a road grid of pastel blocks, warehouses, a promenade, a beach and
// three piers to explore on foot and by car. Steal parked or rolling cars and drive them with
// arcade physics through living traffic; pedestrians stroll, panic and flee. Crimes the city
// witnesses raise a five-star wanted level: PBPD patrol cars pursue, foot officers close in,
// a busted meter fills when they pin you, and hiding breaks their line of sight until the heat
// decays. Fists and a pistol settle arguments. Fixer Marisol Vega hands out a four-job story
// chain by phone — a timed harbour delivery, three cash drops, a getaway, and a stolen Sunfire
// GT to bring home — paying cash and respect, with free roam and repeat work after. The HUD
// carries cash, respect, health, stars, a day-night clock and a full minimap; title, pause,
// busted and wasted screens frame the run; progress saves to localStorage; and the sound —
// engine, sirens, shots, a title bassline — is synthesized live with WebAudio.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
