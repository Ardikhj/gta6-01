// The Solmar Bay police: the wanted level, patrol cars that become hunters,
// foot cops that close in for an arrest, and the busted/wasted outcomes.
// Heat rises when the police see a crime; it falls when the player stays out
// of sight long enough.
import { POLICE, WANTED, WORLD } from './config.js';
import { angleDiff, clamp, dist, makeRandom } from './random.js';
import { driveCar, makeCar } from './vehicles.js';
import { nearestNode, randomRoadPoint, resolveBuildingCollision } from './city.js';
import { stepChaser } from './people.js';

export const WANTED_NAMES = ['', 'One star', 'Two stars', 'Three stars', 'Four stars', 'Five stars'];

/** Raise the wanted level, at most to the cap. Returns the new level. */
export function raiseWanted(world, stars, reason) {
  const before = world.wanted;
  world.wanted = clamp(world.wanted + stars, 0, WANTED.max);
  world.hiddenTimer = 0;
  if (world.wanted > before) {
    world.log.push(reason ? `Wanted ${world.wanted}★ — ${reason}` : `Wanted ${world.wanted}★`);
    world.events.push({ type: 'wanted-up', level: world.wanted });
  }
  return world.wanted;
}

/** How many police units the wanted level calls for. */
export function wantedForce(level) {
  if (level <= 0) return { cars: 0, cops: 0 };
  if (level === 1) return { cars: 1, cops: 1 };
  if (level === 2) return { cars: 2, cops: 2 };
  if (level === 3) return { cars: 3, cops: 2 };
  if (level === 4) return { cars: 4, cops: 3 };
  return { cars: 5, cops: 4 };
}

/** Spawn a police car on a road near the player. */
export function spawnPoliceCar(world) {
  const rng = world.rng;
  const p = world.player;
  const px = p.inCar ? p.car.x : p.x;
  const py = p.inCar ? p.car.y : p.y;
  for (let tries = 0; tries < 8; tries += 1) {
    const spot = randomRoadPoint(world.city, rng);
    const d = dist(spot.x, spot.y, px, py);
    if (d > 420 && d < 1100) {
      const car = makeCar(world.city, rng, 'police', spot.x, spot.y, spot.angle);
      car.model = { name: 'Interceptor', color: '#1d3557', speed: 1.08, desc: 'police cruiser' };
      car.siren = true;
      car.occupied = true;
      world.policeCars.push(car);
      return car;
    }
  }
  return null;
}

/** Spawn a foot cop near the player. */
export function spawnFootCop(world) {
  const rng = world.rng;
  const p = world.player;
  const px = p.inCar ? p.car.x : p.x;
  const py = p.inCar ? p.car.y : p.y;
  const angle = rng.range(0, Math.PI * 2);
  const d = rng.range(380, 700);
  const x = clamp(px + Math.cos(angle) * d, 40, WORLD.width - 40);
  const y = clamp(py + Math.sin(angle) * d, 40, WORLD.height - 40);
  const cop = {
    kind: 'cop',
    x, y, angle: 0, speed: 0, walk: 90,
    target: { x, y }, state: 'chase', fleeTimer: 0,
    shirt: '#1d3557', skin: '#e0ac69', health: 80, dead: false,
    shootCooldown: 1,
  };
  world.cops.push(cop);
  return cop;
}

/** Is the player visible to any police unit right now? */
export function playerSeen(world) {
  const p = world.player;
  const px = p.inCar ? p.car.x : p.x;
  const py = p.inCar ? p.car.y : p.y;
  for (const car of world.policeCars) {
    if (!car.dead && dist(car.x, car.y, px, py) < 620) return true;
  }
  for (const cop of world.cops) {
    if (!cop.dead && dist(cop.x, cop.y, px, py) < 420) return true;
  }
  return false;
}

/**
 * Step the whole wanted system: decay while hidden, keep the force at the
 * level's size, drive the police cars and the foot cops.
 */
export function stepPolice(world, dt) {
  const p = world.player;
  const px = p.inCar ? p.car.x : p.x;
  const py = p.inCar ? p.car.y : p.y;

  // Wanted decay: only while unseen, after a grace period.
  if (world.wanted > 0) {
    if (playerSeen(world)) {
      world.hiddenTimer = 0;
    } else {
      world.hiddenTimer += dt;
      if (world.hiddenTimer > WANTED.decayDelay + WANTED.decayStep) {
        world.wanted -= 1;
        world.hiddenTimer = WANTED.decayDelay;
        world.log.push(`Heat cooling… wanted ${world.wanted}★`);
        world.events.push({ type: 'wanted-down', level: world.wanted });
      }
    }
  }

  const force = wantedForce(world.wanted);
  // Keep the right number of hunters on the street.
  let liveCars = world.policeCars.filter((c) => !c.dead).length;
  while (liveCars < force.cars) {
    if (!spawnPoliceCar(world)) break;
    liveCars += 1;
  }
  let liveCops = world.cops.filter((c) => !c.dead && c.state !== 'down').length;
  while (liveCops < force.cops) {
    spawnFootCop(world);
    liveCops += 1;
  }

  // Police cars: chase the player, ram at speed.
  for (const car of world.policeCars) {
    if (car.dead) continue;
    const dx = px - car.x;
    const dy = py - car.y;
    const d = Math.hypot(dx, dy);
    const wantAngle = Math.atan2(dy, dx);
    const diff = angleDiff(wantAngle, car.angle);
    const steer = clamp(diff * 2.6, -1, 1);
    let throttle = 1;
    if (Math.abs(diff) > 1.2) throttle = 0.4;
    if (d < 70) throttle = 0; // coast on the bumper instead of ploughing through
    if (car.speed > POLICE.carChase) throttle = 0;
    driveCar(car, throttle, steer, false, dt, world.city);
    // Ramming the player's car damages it; ramming the player on foot hurts.
    if (d < 46) {
      if (p.inCar && p.car) {
        p.car.health -= 10 * dt;
        world.events.push({ type: 'ram', x: px, y: py });
      } else if (dist(car.x, car.y, p.x, p.y) < 40) {
        world.damagePlayer(30 * dt);
      }
    }
  }

  // Foot cops: close in; at three stars they shoot; up close they arrest.
  for (const cop of world.cops) {
    if (cop.dead || cop.state === 'down') continue;
    const d = dist(cop.x, cop.y, p.inCar ? px : p.x, p.inCar ? py : p.y);
    if (p.inCar) {
      // On foot, cops chase the car on foot only when it is slow or stopped.
      const carSpeed = Math.abs(p.car ? p.car.speed : 0);
      if (carSpeed < 60 && d < 500) {
        stepChaser(cop, world.city, dt, px, py, POLICE.footSpeed, 260, (c) => {
          if (world.wanted >= WANTED.copShootAt) world.enemyShot(c, p.car);
        });
      } else {
        cop.state = 'patrol';
        cop.target = { x: cop.x + 60, y: cop.y };
      }
    } else {
      const range = world.wanted >= WANTED.copShootAt ? 300 : 40;
      stepChaser(cop, world.city, dt, p.x, p.y, POLICE.footSpeed, range, (c) => {
        if (world.wanted >= WANTED.copShootAt) world.enemyShot(c, null);
      });
      if (d < WANTED.bustRadius && Math.abs(p.speed ?? 0) < 40) {
        world.busted = true;
        world.events.push({ type: 'busted' });
      }
    }
  }

  // Clean up dead units occasionally.
  if (world.policeCars.length > 12) world.policeCars = world.policeCars.filter((c) => !c.dead).slice(0, 8);
  if (world.cops.length > 12) world.cops = world.cops.filter((c) => !c.dead).slice(0, 8);
}

export { makeRandom, nearestNode };
