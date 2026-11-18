// The people of Solmar Bay: pedestrians strolling the sidewalks, Gull gang
// members who fight for their turf, and foot cops. Pedestrians flee from
// gunfire and speeding cars; everyone else has a job to do.
import { PEDS, WORLD } from './config.js';
import { clamp, dist, makeRandom } from './random.js';
import { pointOnSidewalkLine, randomSidewalkLine, resolveBuildingCollision, sidewalkLinePoint } from './city.js';

const SHIRTS = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#6d6875', '#84a59d', '#f28482', '#90be6d', '#577590', '#f6bd60'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

export function makePedestrian(city, rng) {
  const line = randomSidewalkLine(city, rng);
  const p = pointOnSidewalkLine(city, rng, line);
  return {
    kind: 'ped',
    x: p.x, y: p.y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    walk: rng.range(PEDS.walk * 0.7, PEDS.walk * 1.3),
    target: pointOnSidewalkLine(city, rng, line),
    line,
    state: 'walk', // walk | flee | down
    fleeTimer: 0,
    shirt: rng.pick(SHIRTS),
    skin: rng.pick(SKINS),
    health: 30,
    dead: false,
  };
}

/** A Gull gang member holding a spot. `spot` is {x, y}. */
export function makeGull(rng, spot) {
  return {
    kind: 'gull',
    x: spot.x + rng.range(-40, 40),
    y: spot.y + rng.range(-40, 40),
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    walk: 70,
    target: { x: spot.x, y: spot.y },
    state: 'guard',
    fleeTimer: 0,
    shirt: '#3d348b',
    skin: rng.pick(SKINS),
    health: 60,
    dead: false,
    shootCooldown: rng.range(0.5, 1.5),
  };
}

/** A foot cop. `spot` is where the beat starts. */
export function makeCop(rng, spot) {
  return {
    kind: 'cop',
    x: spot.x,
    y: spot.y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    walk: 90,
    target: { x: spot.x, y: spot.y },
    state: 'patrol',
    fleeTimer: 0,
    shirt: '#1d3557',
    skin: rng.pick(SKINS),
    health: 80,
    dead: false,
    shootCooldown: 1,
  };
}

function moveToward(person, tx, ty, speed, dt, city) {
  const dx = tx - person.x;
  const dy = ty - person.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) return true;
  // Manhattan movement: along the longer axis first, so pedestrians stay on
  // the sidewalks instead of cutting diagonally across roads and blocks.
  let vx = 0;
  let vy = 0;
  if (Math.abs(dx) > Math.abs(dy)) vx = Math.sign(dx) * speed;
  else vy = Math.sign(dy) * speed;
  person.x += vx * dt;
  person.y += vy * dt;
  person.angle = Math.atan2(vy, vx) || person.angle;
  person.speed = speed;
  const fixed = resolveBuildingCollision(city, person.x, person.y, 12);
  person.x = fixed.x;
  person.y = fixed.y;
  return false;
}

/**
 * Step one pedestrian. `threats` is a list of {x, y, radius} the ped flees
 * from (gunfire, explosions, a speeding car). Returns 'fled' when it starts
 * running, else null.
 */
export function stepPedestrian(ped, city, dt, rng, threats) {
  if (ped.dead) return null;
  if (ped.state === 'down') return null;
  // A hand-placed pedestrian without a sidewalk line gets one, so it can
  // never crash the game by reaching for a line that is not there.
  if (!ped.line) ped.line = randomSidewalkLine(city, rng);
  let fled = null;
  if (ped.state !== 'flee') {
    for (const t of threats) {
      if (dist(ped.x, ped.y, t.x, t.y) < t.radius) {
        ped.state = 'flee';
        ped.fleeTimer = rng.range(2.5, 4.5);
        // Flee along the sidewalk, not across the road: a pedestrian who
        // runs into traffic gets run over, and the driver gets the blame.
        const away = Math.atan2(ped.y - t.y, ped.x - t.x);
        if (ped.line.axis === 'v') {
          const dir = Math.sign(Math.sin(away)) || 1;
          ped.target = sidewalkLinePoint(ped.line, ped.y + dir * 260);
        } else {
          const dir = Math.sign(Math.cos(away)) || 1;
          ped.target = sidewalkLinePoint(ped.line, ped.x + dir * 260);
        }
        fled = 'fled';
        break;
      }
    }
  }
  if (ped.state === 'flee') {
    ped.fleeTimer -= dt;
    const arrived = moveToward(ped, ped.target.x, ped.target.y, PEDS.flee, dt, city);
    if (arrived || ped.fleeTimer <= 0) {
      ped.state = 'walk';
      ped.target = pointOnSidewalkLine(city, rng, ped.line);
    }
  } else {
    const arrived = moveToward(ped, ped.target.x, ped.target.y, ped.walk, dt, city);
    if (arrived) ped.target = pointOnSidewalkLine(city, rng, ped.line);
  }
  return fled;
}

/** Step a Gull or a cop that chases a target point (the player). */
export function stepChaser(person, city, dt, tx, ty, speed, shootRange, onShoot) {
  if (person.dead) return;
  const d = dist(person.x, person.y, tx, ty);
  if (d > shootRange) {
    moveToward(person, tx, ty, speed, dt, city);
  } else {
    person.angle = Math.atan2(ty - person.y, tx - person.x);
    person.speed = 0;
    person.shootCooldown -= dt;
    if (person.shootCooldown <= 0) {
      person.shootCooldown = 1.1 + Math.random() * 0.6;
      if (onShoot) onShoot(person);
    }
  }
}

export { makeRandom };
