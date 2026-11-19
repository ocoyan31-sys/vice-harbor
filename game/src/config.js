// Every tuning number and colour for Vice Harbor in one place. The view is a fixed 1280x720
// logical area; the renderer scales it to the window, so no rule below depends on screen size.
// The world is one big top-down city measured in pixels: a grid of avenues over Port Brisa,
// a promenade and beach along the south edge, then the harbour water with three piers.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const WORLD = { width: 3584, height: 3072 };

/** Centre lines of the seven avenues (x) and five streets (y) that make the road grid. */
export const AVENUES_X = [256, 768, 1280, 1792, 2304, 2816, 3328];
export const STREETS_Y = [256, 768, 1280, 1792, 2304];
export const ROAD_WIDTH = 112;
/** How far each driving lane sits from its road's centre line (right-hand traffic). */
export const LANE_OFFSET = 29;

export const PROMENADE_Y = 2560; // pavement strip along the harbour front
export const SAND_Y = 2652; // the beach starts here
export const WATER_Y = 2790; // open harbour water starts here

export const PLAYER = {
  radius: 11,
  walkSpeed: 168,
  sprintSpeed: 268,
  accel: 1500,
  health: 100,
  punchRange: 36,
  punchArc: 1.15,
  punchDamage: 34,
  punchCooldown: 0.34,
};

export const CAR = {
  length: 44,
  width: 22,
  accel: 340,
  brake: 620,
  reverseMax: 130,
  drag: 0.55,
  grip: 3.4,
  trafficSpeed: 215,
  policeSpeed: 340,
};

export const WANTED = {
  /** Crime points per star; crimes add points, hiding bleeds them off. */
  perStar: 100,
  maxStars: 5,
  hideSeconds: 7, // unseen this long before the level starts to decay
  decayPerSecond: 9,
};

export const CRIME = {
  stealCar: 100,
  hitCar: 45,
  hitPed: 110,
  punchPed: 55,
  shotFired: 60,
  shotPed: 120,
  shotPolice: 200,
  hitPoliceCar: 90,
};

export const PISTOL = { ammoStart: 24, bulletSpeed: 880, cooldown: 0.21, damage: 34 };

/** Game-clock minutes per real second: a full day lasts eight minutes of play. */
export const CLOCK_RATE = 3;

export const PALETTE = {
  backdrop: '#0d1420',
  asphalt: '#3c4149',
  asphaltEdge: '#2f333a',
  laneMark: '#d8d3b8',
  sidewalk: '#9aa0a3',
  blockBase: '#868b8f',
  sand: '#e8cf9e',
  sandDark: '#dcc088',
  water: '#1d6f8e',
  waterDeep: '#155a77',
  waterFoam: '#bfe8ef',
  promenade: '#b7a98f',
  pier: '#8a6f4d',
  text: '#f4f1e6',
  muted: '#b9c0c9',
  accent: '#ffb347',
  coral: '#ff6b5e',
  teal: '#2ec4b6',
  danger: '#e63946',
  cash: '#7dd069',
  panel: 'rgba(13, 20, 32, 0.88)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Building paint: sun-bleached art-deco pastels, with a few brick and glass tones mixed in. */
export const BUILDING_COLORS = [
  '#f2e3c6', '#f6c9a0', '#efa08c', '#e8837a', '#a8d5ba', '#7fc8bc',
  '#8ecae6', '#cdb4db', '#f4f1de', '#e9c46a', '#d9a05b', '#90a8b8',
];

export const CAR_COLORS = [
  '#e63946', '#f4f1de', '#457b9d', '#2a9d8f', '#e9c46a', '#f4845f',
  '#6d6875', '#84a98c', '#bc6c25', '#3a86ff', '#ff70a6', '#e0e1dd',
];

export const SAVE_KEY = 'vice-harbor.save.v1';
