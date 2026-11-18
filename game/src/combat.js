// Combat in Solmar Bay: the player's pistol, enemy fire, bullets and
// explosions. Bullets are simple segments checked against circles (people)
// and oriented boxes (cars, approximated as circles at both ends).
import { EXPLOSION, GUN } from './config.js';
import { dist } from './random.js';
import { insideBuilding } from './city.js';

/** Fire one bullet from (x, y) toward an angle. Returns the bullet. */
export function fireBullet(x, y, angle, owner, damage) {
  return {
    x, y,
    vx: Math.cos(angle) * GUN.bulletSpeed,
    vy: Math.sin(angle) * GUN.bulletSpeed,
    life: GUN.range / GUN.bulletSpeed,
    owner, // 'player' | 'gull' | 'cop'
    damage: damage ?? GUN.damage,
    dead: false,
  };
}

/** Is the segment from (x,y) to (x+dx, y+dy) blocked by a building? */
function blockedByBuilding(city, x, y, dx, dy) {
  const steps = 6;
  for (let i = 1; i <= steps; i += 1) {
    const px = x + (dx * i) / steps;
    const py = y + (dy * i) / steps;
    if (insideBuilding(city, px, py, 0)) return true;
  }
  return false;
}

function hitCar(car, x, y) {
  // Two circles along the car's body approximate its box.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const r = 20;
  return dist(x, y, car.x + fx * 14, car.y + fy * 14) < r || dist(x, y, car.x - fx * 14, car.y - fy * 14) < r;
}

/**
 * Step all bullets. `targets` holds the shootable people and cars. Returns an
 * array of hit events: {type:'person'|'car'|'wall', person?, car?, x, y}.
 */
export function stepBullets(bullets, city, dt, targets) {
  const hits = [];
  for (const b of bullets) {
    if (b.dead) continue;
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) {
      b.dead = true;
      continue;
    }
    if (blockedByBuilding(city, b.x, b.y, nx - b.x, ny - b.y)) {
      b.dead = true;
      hits.push({ type: 'wall', x: nx, y: ny });
      continue;
    }
    let hit = false;
    for (const person of targets.people) {
      if (person.dead || person.state === 'down') continue;
      if (b.owner === 'player' && person.kind === 'ped' && person.state !== 'flee') {
        // The player can hit a pedestrian (a crime — the world scores it).
      }
      if (b.owner !== 'player' && person.kind === 'ped') continue;
      if (b.owner === 'gull' && person.kind === 'gull') continue;
      if (b.owner === 'cop' && person.kind === 'cop') continue;
      if (b.owner === 'player' && person.kind === 'cop') {
        // Shooting a cop is allowed; it is a serious crime.
      }
      if (dist(nx, ny, person.x, person.y) < 14) {
        person.health -= b.damage;
        b.dead = true;
        hits.push({ type: 'person', person, x: nx, y: ny, owner: b.owner });
        hit = true;
        break;
      }
    }
    if (hit) continue;
    for (const car of targets.cars) {
      if (car.dead) continue;
      if (b.owner === 'player' && car.kind === 'player') continue;
      if (hitCar(car, nx, ny)) {
        car.health -= b.damage;
        b.dead = true;
        hits.push({ type: 'car', car, x: nx, y: ny, owner: b.owner });
        break;
      }
    }
    if (!b.dead) {
      b.x = nx;
      b.y = ny;
    }
  }
  return hits;
}

/** An explosion at (x, y): damages people and cars in radius, returns hits. */
export function explodeAt(x, y, people, cars) {
  const hits = [];
  for (const person of people) {
    if (person.dead) continue;
    const d = dist(x, y, person.x, person.y);
    if (d < EXPLOSION.radius) {
      person.health -= EXPLOSION.damage * (1 - d / (EXPLOSION.radius * 1.4));
      hits.push({ type: 'person', person, x: person.x, y: person.y });
    }
  }
  for (const car of cars) {
    if (car.dead) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < EXPLOSION.radius + 20) {
      car.health -= EXPLOSION.damage * (1 - d / (EXPLOSION.radius * 1.6));
      hits.push({ type: 'car', car, x: car.x, y: car.y });
    }
  }
  return hits;
}

/** A muzzle flash + tracer the renderer draws for a frame. */
export function makeTracer(x, y, angle, range) {
  return { x, y, angle, range, life: 0.07 };
}
