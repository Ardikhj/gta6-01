// Vehicles of Solmar Bay: arcade car physics, traffic AI that drives the road
// graph, and the original car models of the city. No model, name or badge is
// taken from any commercial game.
import { CAR, TRAFFIC, WORLD } from './config.js';
import { angleDiff, clamp, makeRandom } from './random.js';
import { insideBuilding, nearestNode, onRoad, randomRoadPoint } from './city.js';

export const CAR_MODELS = [
  { name: 'Brisa', color: '#e4572e', speed: 1.0, desc: 'hatchback' },
  { name: 'Vela GT', color: '#2e86ab', speed: 1.12, desc: 'sports coupe' },
  { name: 'Toro', color: '#7a5c3e', speed: 0.92, desc: 'pickup' },
  { name: 'Cascada', color: '#f2c14e', speed: 1.05, desc: 'convertible' },
  { name: 'Sol Taxi', color: '#f6d32d', speed: 0.98, desc: 'taxi', taxi: true },
  { name: 'Gull Van', color: '#5a6b7a', speed: 0.9, desc: 'van' },
  { name: 'Marina', color: '#c94f6d', speed: 1.02, desc: 'sedan' },
  { name: 'Dune Bug', color: '#7fb069', speed: 0.95, desc: 'buggy' },
];

export const POLICE_COLORS = ['#1d3557', '#14213d'];

/** Make a car entity. `kind` is 'player' | 'traffic' | 'police' | 'parked'. */
export function makeCar(city, rng, kind, x, y, angle) {
  const model = rng ? rng.pick(CAR_MODELS) : CAR_MODELS[0];
  return {
    id: Math.floor(Math.random() * 1e9),
    kind,
    model,
    x, y,
    angle,
    speed: 0, // signed, along the heading
    vx: 0, vy: 0,
    steer: 0,
    health: CAR.health,
    occupied: kind === 'traffic',
    parked: kind === 'parked',
    siren: false,
    node: nearestNode(city, x, y),
    targetNode: -1,
    stuck: 0,
    dead: false,
    burnTimer: 0,
  };
}

/** Spawn a parked car on a roadside. */
export function spawnParkedCar(city, rng) {
  const p = randomRoadPoint(city, rng);
  const angle = p.angle + (rng.chance(0.5) ? 0 : Math.PI);
  const off = 34;
  const x = p.x + Math.cos(angle + Math.PI / 2) * off;
  const y = p.y + Math.sin(angle + Math.PI / 2) * off;
  const car = makeCar(city, rng, 'parked', x, y, angle);
  car.parked = true;
  return car;
}

/** One physics step for a car the player drives. Input: throttle -1..1, steer -1..1.
 *  `city` is optional; when given, the car slides along buildings instead of
 *  driving through them (axis-separated: x first, then y). */
export function driveCar(car, throttle, steerInput, handbrake, dt, city) {
  const maxSpeed = CAR.maxSpeed * car.model.speed;
  const maxReverse = CAR.maxReverse * car.model.speed;
  if (throttle > 0) {
    car.speed += CAR.accel * car.model.speed * throttle * dt;
  } else if (throttle < 0) {
    if (car.speed > 5) car.speed -= CAR.brake * dt; // brake first
    else car.speed += CAR.reverseAccel * throttle * dt;
  }
  if (handbrake) car.speed -= car.speed * 2.4 * dt;
  // Drag and rolling resistance.
  car.speed -= car.speed * CAR.drag * dt;
  car.speed = clamp(car.speed, -maxReverse, maxSpeed);
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;

  const steerAmount = steerInput * CAR.steer * clamp(Math.abs(car.speed) / 120, 0, 1);
  car.angle += steerAmount * (car.speed >= 0 ? 1 : -1) * dt * (handbrake ? 1.35 : 1);
  car.steer = steerInput;

  // Velocity: mostly along the heading, with a little lateral slide.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const fwd = car.vx * fx + car.vy * fy;
  const lat = car.vx * -fy + car.vy * fx;
  const newFwd = car.speed;
  const newLat = lat * Math.max(0, 1 - CAR.grip * dt) * (handbrake ? 0.85 : 1);
  car.vx = fx * newFwd + -fy * newLat;
  car.vy = fy * newFwd + fx * newLat;
  if (city) {
    // Axis-separated building collision: slide along walls, never through them.
    const nx = car.x + car.vx * dt;
    if (!insideBuilding(city, nx, car.y, 20)) car.x = nx;
    else {
      car.vx = 0;
      car.speed *= Math.max(0, 1 - 1.5 * dt);
    }
    const ny = car.y + car.vy * dt;
    if (!insideBuilding(city, car.x, ny, 20)) car.y = ny;
    else {
      car.vy = 0;
      car.speed *= Math.max(0, 1 - 1.5 * dt);
    }
  } else {
    car.x += car.vx * dt;
    car.y += car.vy * dt;
  }
  car.x = clamp(car.x, 30, WORLD.width - 30);
  car.y = clamp(car.y, 30, WORLD.height - 30);
}

/** One AI step for a traffic car: follow the road graph, keep its distance. */
export function driveTraffic(car, city, dt, rng, carsAhead) {
  if (car.dead) return;
  const target = city.nodes[car.targetNode] ?? city.nodes[car.node];
  if (!target) return;
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const d = Math.hypot(dx, dy);
  if (d < 26) {
    // Reached the intersection: pick a next node, preferring not to U-turn.
    const options = (city.edges.get(car.targetNode) ?? []).filter((n) => n !== car.node);
    const next = options.length > 0 ? options[Math.floor(rng.next() * options.length)] : car.node;
    car.node = car.targetNode;
    car.targetNode = next;
    car.stuck = 0;
    return;
  }
  const wantAngle = Math.atan2(dy, dx);
  const diff = angleDiff(wantAngle, car.angle);
  const steer = clamp(diff * 2.2, -1, 1);
  let throttle = 1;
  // Slow for a car ahead on the same road.
  if (carsAhead) {
    const ahead = carsAhead(car);
    if (ahead !== null && ahead < 90) throttle = ahead < 45 ? 0 : 0.35;
  }
  // Slow for corners.
  if (Math.abs(diff) > 0.9) throttle = 0.3;
  const cruise = TRAFFIC.cruise * car.model.speed;
  if (car.speed > cruise) throttle = 0;
  driveCar(car, throttle, steer, false, dt, city);
  if (Math.abs(car.speed) < 8) car.stuck += dt;
  else car.stuck = 0;
  // Truly stuck (wedged on something): respawn further along the road.
  if (car.stuck > 6) {
    const p = randomRoadPoint(city, rng);
    car.x = p.x;
    car.y = p.y;
    car.angle = p.angle;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    car.node = nearestNode(city, p.x, p.y);
    car.targetNode = car.node;
    car.stuck = 0;
  }
}

/** Keep cars from overlapping: push circles apart, exchange a little speed.
 *  Damage and slowdown are per second (dt), not per frame, so a long shove
 *  does not shred a car in a single second. */
export function collideCars(cars, dt = 1 / 60) {
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 44;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 120) {
          a.health -= rel * 0.02 * dt;
          b.health -= rel * 0.02 * dt;
        }
        a.speed *= Math.max(0, 1 - 1.2 * dt);
        b.speed *= Math.max(0, 1 - 1.2 * dt);
      }
    }
  }
}

/** True when the car is on a road (used to keep traffic honest). */
export function carOnRoad(city, car) {
  return onRoad(city, car.x, car.y);
}

export function randomCarModel(rng) {
  return rng.pick(CAR_MODELS);
}

export { makeRandom };
