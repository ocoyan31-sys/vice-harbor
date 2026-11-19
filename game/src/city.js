// Port Brisa itself: the road grid, the blocks and their buildings, the harbour strip with its
// warehouses and Vega Motors, the beach and the three piers. createCity lays the city out once
// from the seeded generator (so every seed is the same city) and keeps the facts the rest of
// the game needs: solid rectangles to collide with, palm trees, crates, and the named places
// the story uses. paintCityBase draws all of it once onto an offscreen canvas the renderer
// blits from, so a frame never repaints a building.
import {
  AVENUES_X, BUILDING_COLORS, PALETTE, PROMENADE_Y, ROAD_WIDTH, SAND_Y, STREETS_Y, WATER_Y, WORLD,
} from './config.js';
import { pick, randInt, randRange } from './random.js';

const HALF_ROAD = ROAD_WIDTH / 2;

/** Street names painted on the asphalt, west to east and north to south. */
const AVENUE_NAMES = ['Cayo Ave', 'Marina Ave', 'Solana Ave', 'Central Ave', 'Palmera Ave', 'Coral Ave', 'Harbour Ave'];
const STREET_NAMES = ['Northgate St', 'Flamingo St', 'Mercado St', 'Estrella St', 'Harbour Blvd'];

export function createCity(random) {
  const buildings = [];
  const colliders = [];
  const palms = [];
  const crates = [];
  const lamps = [];

  function addBuilding(x, y, w, h, color, floors, name) {
    const building = { x, y, w, h, color, floors, name: name ?? null };
    buildings.push(building);
    colliders.push(building);
    return building;
  }

  // The named places the story and the respawn rules use; filled in as their blocks are built.
  const locations = {};

  // One city block: a sidewalk rim, a plaza, and one, two or four buildings set into it.
  function buildBlock(bx, by, special) {
    const inset = 16;
    const inner = { x: bx + inset, y: by + inset, w: 400 - inset * 2, h: 400 - inset * 2 };
    if (special === 'hospital') {
      addBuilding(inner.x + 30, inner.y + 60, 300, 210, '#f4f1de', 5, 'HOSPITAL');
      locations.hospital = { x: bx + 200, y: by + 330, label: 'Port Brisa General' };
      return;
    }
    if (special === 'police') {
      addBuilding(inner.x + 40, inner.y + 50, 280, 200, '#b8c4ce', 4, 'POLICE');
      locations.police = { x: bx + 200, y: by + 322, label: 'PBPD Station' };
      return;
    }
    if (special === 'safehouse') {
      addBuilding(inner.x + 60, inner.y + 40, 220, 180, '#f6c9a0', 6, 'PALMS APTS');
      locations.safehouse = { x: bx + 200, y: by + 268, label: 'Palms Apartments' };
      return;
    }
    const layout = randInt(random, 0, 3);
    const gap = 22;
    if (layout === 0) {
      addBuilding(inner.x + 26, inner.y + 26, inner.w - 52, inner.h - 52, pick(random, BUILDING_COLORS), randInt(random, 2, 7));
    } else if (layout === 1) {
      const w = (inner.w - gap) / 2;
      addBuilding(inner.x, inner.y + 20, w, inner.h - 40, pick(random, BUILDING_COLORS), randInt(random, 1, 5));
      addBuilding(inner.x + w + gap, inner.y + 20, w, inner.h - 40, pick(random, BUILDING_COLORS), randInt(random, 1, 5));
    } else if (layout === 2) {
      const h = (inner.h - gap) / 2;
      addBuilding(inner.x + 20, inner.y, inner.w - 40, h, pick(random, BUILDING_COLORS), randInt(random, 1, 5));
      addBuilding(inner.x + 20, inner.y + h + gap, inner.w - 40, h, pick(random, BUILDING_COLORS), randInt(random, 1, 5));
    } else {
      const w = (inner.w - gap) / 2;
      const h = (inner.h - gap) / 2;
      for (const ox of [0, w + gap]) {
        for (const oy of [0, h + gap]) {
          addBuilding(inner.x + ox, inner.y + oy, w, h, pick(random, BUILDING_COLORS), randInt(random, 1, 4));
        }
      }
    }
  }

  const SPECIALS = { '0,1': 'hospital', '3,1': 'police', '1,0': 'safehouse' };
  for (let i = 0; i < AVENUES_X.length - 1; i += 1) {
    for (let j = 0; j < STREETS_Y.length - 1; j += 1) {
      buildBlock(AVENUES_X[i] + HALF_ROAD, STREETS_Y[j] + HALF_ROAD, SPECIALS[`${i},${j}`] ?? null);
    }
  }

  // The harbour strip between Harbour Blvd and the promenade: warehouses in the middle slots,
  // the docks yard to the west, and Marisol Vega's garage, Vega Motors, to the east.
  const stripY = STREETS_Y[4] + HALF_ROAD; // 2360
  for (let slot = 1; slot <= 4; slot += 1) {
    const cx = (AVENUES_X[slot] + AVENUES_X[slot + 1]) / 2;
    addBuilding(cx - 160, stripY + 42, 320, 128, '#93a5b1', 1, 'PIER STORAGE');
  }
  addBuilding(330, stripY + 66, 170, 96, '#e9c46a', 1, 'DOCKS OFFICE');
  locations.docks = { x: 700, y: 2962, label: 'Pier One' };
  const garage = addBuilding(2960, stripY + 26, 330, 138, '#2a7f76', 1, 'VEGA MOTORS');
  locations.garage = { x: 3125, y: stripY + 196, label: 'Vega Motors' };
  locations.marisol = { x: 3125, y: stripY + 196, label: 'Marisol Vega' };
  locations.warehouse = { x: 2048, y: stripY + 200, label: 'Pier Storage No. 3' };

  // Brisa Arms, the gun shop, marked on a corner building of the north-east block.
  const armsBlock = buildings.find((b) => b.x > 2900 && b.y < 700);
  if (armsBlock) armsBlock.name = 'BRISA ARMS';
  locations.gunshop = { x: 3125, y: 700, label: 'Brisa Arms' };
  locations.marina = { x: 2900, y: 2962, label: 'Coral Marina' };

  // The three piers: wooden platforms over the water, drivable and walkable.
  const piers = [700, 1792, 2900].map((cx) => ({ x: cx - 66, y: WATER_Y - 96, w: 132, h: 342 }));

  // Crate clusters in the docks yard and by the warehouses; they are solid.
  function addCrates(cx, cy, count) {
    for (let n = 0; n < count; n += 1) {
      const crate = { x: cx + randRange(random, -54, 54), y: cy + randRange(random, -30, 30), w: 26, h: 26 };
      crates.push(crate);
      colliders.push(crate);
    }
  }
  addCrates(560, stripY + 120, 5);
  addCrates(1150, stripY + 120, 3);
  addCrates(2380, stripY + 120, 3);
  addCrates(700, WATER_Y - 40, 2);

  // Palms along the promenade and beach, and a few on the avenue corners.
  for (let x = 90; x < WORLD.width - 60; x += randInt(random, 120, 210)) {
    palms.push({ x: x + randRange(random, -16, 16), y: PROMENADE_Y + randRange(random, 26, 58), s: randRange(random, 0.85, 1.25) });
    if (random() < 0.7) palms.push({ x: x + randRange(random, 20, 60), y: SAND_Y + randRange(random, 16, 60), s: randRange(random, 0.8, 1.15) });
  }
  for (const ax of AVENUES_X) {
    for (const sy of STREETS_Y) {
      if (random() < 0.5) palms.push({ x: ax + HALF_ROAD + 22, y: sy + HALF_ROAD + 22, s: randRange(random, 0.8, 1.1) });
    }
  }

  // Lamp posts on intersection corners (they glow after dark).
  for (const ax of AVENUES_X) {
    for (const sy of STREETS_Y) {
      lamps.push({ x: ax - HALF_ROAD - 8, y: sy - HALF_ROAD - 8 });
      lamps.push({ x: ax + HALF_ROAD + 8, y: sy + HALF_ROAD + 8 });
    }
  }

  // Every crossing of an avenue and a street: the nodes traffic routes between.
  const nodes = [];
  for (const ax of AVENUES_X) for (const sy of STREETS_Y) nodes.push({ x: ax, y: sy });

  return { buildings, colliders, palms, crates, lamps, piers, locations, nodes, base: null };
}

/** True when the point is open harbour water (the piers are dry land over it). */
export function pointInWater(city, x, y) {
  if (y < WATER_Y || y > WORLD.height) return false;
  for (const pier of city.piers) {
    if (x >= pier.x - 4 && x <= pier.x + pier.w + 4 && y >= pier.y && y <= pier.y + pier.h) return false;
  }
  return x >= 0 && x <= WORLD.width;
}

/** True when a circle at (x, y) touches any solid rectangle of the city. */
export function circleHitsSolid(city, x, y, r) {
  for (const rect of city.colliders) {
    const nx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(y, rect.y + rect.h));
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/**
 * Push a circle at (x, y) out of every solid it touches and out of the water and the world
 * edge; returns the corrected position. Used by the player and by every car.
 */
export function resolveCircle(city, x, y, r) {
  for (const rect of city.colliders) {
    const nx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(y, rect.y + rect.h));
    let dx = x - nx;
    let dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 < 0.0001) {
      // Centre inside the rectangle: leave by the nearest face.
      const left = x - rect.x;
      const right = rect.x + rect.w - x;
      const top = y - rect.y;
      const bottom = rect.y + rect.h - y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) x = rect.x - r;
      else if (min === right) x = rect.x + rect.w + r;
      else if (min === top) y = rect.y - r;
      else y = rect.y + rect.h + r;
      continue;
    }
    const d = Math.sqrt(d2);
    dx /= d;
    dy /= d;
    x = nx + dx * r;
    y = ny + dy * r;
  }
  if (pointInWater(city, x, y)) y = WATER_Y - r;
  x = Math.max(r, Math.min(WORLD.width - r, x));
  y = Math.max(r, Math.min(WORLD.height - r, y));
  return { x, y };
}

/** True when the straight line between two points crosses no building: a witness's view. */
export function segmentClear(city, x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(dist / 26));
  for (let s = 1; s < steps; s += 1) {
    const t = s / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    for (const rect of city.buildings) {
      if (x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h) return false;
    }
  }
  return true;
}

/** The intersection nearest to a point: where routed traffic aims and turns. */
export function nearestNode(city, x, y) {
  let best = city.nodes[0];
  let bestD = Infinity;
  for (const node of city.nodes) {
    const d = (node.x - x) ** 2 + (node.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }
  return best;
}

function shade(hex, amt) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

/** Draw the whole static city once onto an offscreen canvas and keep it on the city object. */
export function paintCityBase(city, random) {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD.width;
  canvas.height = WORLD.height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PALETTE.blockBase;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  // Harbour water with a soft depth gradient, then the beach and its speckles.
  const waterGrad = ctx.createLinearGradient(0, WATER_Y, 0, WORLD.height);
  waterGrad.addColorStop(0, PALETTE.water);
  waterGrad.addColorStop(1, PALETTE.waterDeep);
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, WATER_Y, WORLD.width, WORLD.height - WATER_Y);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, SAND_Y, WORLD.width, WATER_Y - SAND_Y);
  ctx.fillStyle = PALETTE.sandDark;
  for (let n = 0; n < 900; n += 1) {
    ctx.fillRect(random() * WORLD.width, SAND_Y + random() * (WATER_Y - SAND_Y), 3, 2);
  }
  ctx.fillStyle = PALETTE.waterFoam;
  ctx.fillRect(0, WATER_Y - 3, WORLD.width, 3);
  // Beach umbrellas: a bright dot of shade cloth on the sand.
  const umbrellaColors = ['#ff6b5e', '#2ec4b6', '#ffb347', '#ff70a6', '#3a86ff'];
  for (let n = 0; n < 16; n += 1) {
    const ux = 140 + random() * (WORLD.width - 280);
    const uy = SAND_Y + 34 + random() * 76;
    ctx.fillStyle = 'rgba(60,40,20,0.25)';
    ctx.beginPath();
    ctx.ellipse(ux + 5, uy + 6, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = umbrellaColors[n % umbrellaColors.length];
    ctx.beginPath();
    ctx.arc(ux, uy, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  // The promenade and the port concrete of the harbour strip.
  ctx.fillStyle = PALETTE.promenade;
  ctx.fillRect(0, PROMENADE_Y, WORLD.width, SAND_Y - PROMENADE_Y);
  ctx.fillStyle = '#7d838a';
  ctx.fillRect(0, STREETS_Y[4] + HALF_ROAD, WORLD.width, PROMENADE_Y - (STREETS_Y[4] + HALF_ROAD));
  ctx.strokeStyle = 'rgba(70,60,40,0.35)';
  ctx.lineWidth = 2;
  for (let x = 0; x < WORLD.width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, PROMENADE_Y);
    ctx.lineTo(x, SAND_Y);
    ctx.stroke();
  }

  // Roads: asphalt slabs, edge lines, dashed lane lines, crosswalks at every crossing.
  ctx.fillStyle = PALETTE.asphalt;
  for (const ax of AVENUES_X) ctx.fillRect(ax - HALF_ROAD, 0, ROAD_WIDTH, PROMENADE_Y + 20);
  for (const sy of STREETS_Y) ctx.fillRect(0, sy - HALF_ROAD, WORLD.width, ROAD_WIDTH);
  ctx.strokeStyle = PALETTE.laneMark;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  for (const ax of AVENUES_X) {
    ctx.beginPath();
    ctx.moveTo(ax, 0);
    ctx.lineTo(ax, PROMENADE_Y + 20);
    ctx.stroke();
  }
  for (const sy of STREETS_Y) {
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(WORLD.width, sy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(240,240,230,0.55)';
  ctx.lineWidth = 2;
  for (const ax of AVENUES_X) {
    ctx.strokeRect(ax - HALF_ROAD + 2, -4, ROAD_WIDTH - 4, PROMENADE_Y + 24);
  }
  ctx.fillStyle = 'rgba(245,245,240,0.75)';
  for (const ax of AVENUES_X) {
    for (const sy of STREETS_Y) {
      for (let s = -2; s <= 2; s += 1) {
        if (s === 0) continue;
        ctx.fillRect(ax + s * 20 - 6, sy - HALF_ROAD - 14, 12, 10);
        ctx.fillRect(ax + s * 20 - 6, sy + HALF_ROAD + 4, 12, 10);
        ctx.fillRect(ax - HALF_ROAD - 14, sy + s * 20 - 6, 10, 12);
        ctx.fillRect(ax + HALF_ROAD + 4, sy + s * 20 - 6, 10, 12);
      }
    }
  }
  // Street names along the asphalt.
  ctx.fillStyle = 'rgba(244,241,230,0.4)';
  ctx.font = '600 21px system-ui, sans-serif';
  ctx.textAlign = 'center';
  AVENUES_X.forEach((ax, i) => {
    ctx.save();
    ctx.translate(ax + 34, 1240);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(AVENUE_NAMES[i].toUpperCase(), 0, 0);
    ctx.restore();
  });
  STREETS_Y.forEach((sy, j) => {
    ctx.fillText(STREET_NAMES[j].toUpperCase(), 640, sy - 66);
  });

  // Sidewalk rims and plaza floors for every block.
  for (let i = 0; i < AVENUES_X.length - 1; i += 1) {
    for (let j = 0; j < STREETS_Y.length - 1; j += 1) {
      const bx = AVENUES_X[i] + HALF_ROAD;
      const by = STREETS_Y[j] + HALF_ROAD;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(bx - 8, by - 8, 416, 416);
      ctx.fillStyle = '#93989c';
      ctx.fillRect(bx + 8, by + 8, 384, 384);
    }
  }

  // Buildings: a soft shadow, the walls, a lighter roof with a parapet, rooftop clutter.
  for (const b of city.buildings) {
    ctx.fillStyle = 'rgba(20,24,30,0.28)';
    ctx.fillRect(b.x + 6 + b.floors * 2, b.y + 8 + b.floors * 2, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = shade(b.color.startsWith('#') ? b.color : '#cccccc', 26);
    ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
    ctx.strokeStyle = 'rgba(30,30,36,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    ctx.fillStyle = 'rgba(90,95,105,0.5)';
    const units = 1 + (Math.floor(b.w / 130) % 3);
    for (let u = 0; u < units; u += 1) {
      ctx.fillRect(b.x + 18 + u * 44, b.y + 16, 22, 15);
    }
    if (b.name) {
      ctx.fillStyle = 'rgba(24,28,36,0.78)';
      ctx.font = '700 19px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2 + 7);
      if (b.name === 'HOSPITAL') {
        ctx.fillStyle = '#d23b3b';
        ctx.fillRect(b.x + b.w / 2 - 5, b.y + 26, 10, 30);
        ctx.fillRect(b.x + b.w / 2 - 15, b.y + 36, 30, 10);
      }
      if (b.name === 'POLICE') {
        ctx.fillStyle = '#274b73';
        ctx.fillRect(b.x, b.y + b.h - 18, b.w, 12);
      }
      if (b.name === 'VEGA MOTORS') {
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(b.x, b.y + b.h - 16, b.w, 10);
      }
    }
  }

  // The piers: planks over the water, with posts and a foam edge.
  for (const pier of city.piers) {
    ctx.fillStyle = PALETTE.pier;
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.strokeStyle = 'rgba(60,42,24,0.5)';
    ctx.lineWidth = 2;
    for (let y = pier.y + 14; y < pier.y + pier.h; y += 22) {
      ctx.beginPath();
      ctx.moveTo(pier.x, y);
      ctx.lineTo(pier.x + pier.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = PALETTE.waterFoam;
    ctx.lineWidth = 3;
    ctx.strokeRect(pier.x - 3, pier.y + pier.h - 26, pier.w + 6, 26);
  }

  // Crates: timber boxes with a cross brace.
  for (const crate of city.crates) {
    ctx.fillStyle = '#a97c50';
    ctx.fillRect(crate.x, crate.y, crate.w, crate.h);
    ctx.strokeStyle = 'rgba(70,48,26,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(crate.x + 1, crate.y + 1, crate.w - 2, crate.h - 2);
    ctx.beginPath();
    ctx.moveTo(crate.x, crate.y);
    ctx.lineTo(crate.x + crate.w, crate.y + crate.h);
    ctx.moveTo(crate.x + crate.w, crate.y);
    ctx.lineTo(crate.x, crate.y + crate.h);
    ctx.stroke();
  }

  // Palms: a leaning trunk and a crown of fronds, with a soft shadow.
  for (const palm of city.palms) {
    const s = palm.s;
    ctx.strokeStyle = 'rgba(20,24,30,0.22)';
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.moveTo(palm.x + 8 * s, palm.y + 9 * s);
    ctx.quadraticCurveTo(palm.x + 10 * s, palm.y - 6 * s, palm.x + 3 * s, palm.y - 13 * s);
    ctx.stroke();
    ctx.strokeStyle = '#7a5c38';
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.quadraticCurveTo(palm.x + 2 * s, palm.y - 7 * s, palm.x - 4 * s, palm.y - 14 * s);
    ctx.stroke();
    ctx.strokeStyle = '#3e8e4f';
    ctx.lineWidth = 3 * s;
    for (let f = 0; f < 7; f += 1) {
      const a = (f / 7) * Math.PI * 2 + palm.x * 0.01;
      ctx.beginPath();
      ctx.moveTo(palm.x - 4 * s, palm.y - 14 * s);
      ctx.quadraticCurveTo(
        palm.x - 4 * s + Math.cos(a) * 13 * s,
        palm.y - 14 * s + Math.sin(a) * 8 * s - 4 * s,
        palm.x - 4 * s + Math.cos(a) * 20 * s,
        palm.y - 14 * s + Math.sin(a) * 13 * s + 3 * s,
      );
      ctx.stroke();
    }
  }

  // Lamp posts: a dark pin at each corner (the glow is drawn at night by the renderer).
  ctx.fillStyle = '#2c3138';
  for (const lamp of city.lamps) {
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  city.base = canvas;
  return canvas;
}
