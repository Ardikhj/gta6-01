// Solmar Bay — tuning constants. One place for every number the game balances on,
// so a tweak here never means hunting through the simulation.
export const VIEW = { width: 1280, height: 720 };

export const WORLD = {
  width: 3600,
  height: 3600,
  block: 420, // road-to-road pitch of the city grid
  road: 96, // road width, kerb to kerb
  sidewalk: 26,
};

// Player on foot.
export const PLAYER = {
  radius: 13,
  walkSpeed: 185,
  runSpeed: 265,
  health: 100,
  punchDamage: 12,
};

// Cars: arcade handling, tuned so a chase feels fast but controllable.
export const CAR = {
  length: 54,
  width: 26,
  accel: 420,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 170,
  brake: 700,
  drag: 0.55,
  grip: 3.2,
  steer: 2.35,
  health: 100,
};

// Traffic and pedestrians.
export const TRAFFIC = { count: 26, cruise: 150, maxCruise: 210 };
export const PEDS = { count: 46, walk: 55, flee: 150 };

// Wanted level and police.
export const WANTED = {
  max: 5,
  decayDelay: 9, // seconds out of sight before stars start falling
  decayStep: 6, // seconds per star lost while hidden
  bustRadius: 26,
  copShootAt: 3,
};
export const POLICE = { carCruise: 300, carChase: 520, footSpeed: 205 };

// Combat.
export const GUN = {
  damage: 34,
  range: 520,
  fireInterval: 0.22,
  bulletSpeed: 950,
  spread: 0.05,
};
export const EXPLOSION = { radius: 130, damage: 80 };

// The fixed-step simulation tick. Rendering interpolates nothing; the step is
// small enough that 60 Hz play is smooth.
export const STEP = 1 / 60;

// Mission rewards, in dollars.
export const REWARDS = { m1: 300, m2: 500, m3: 700, m4: 900, m5: 2500 };

export const SAVE_KEY = 'solmar-bay-save-v1';
