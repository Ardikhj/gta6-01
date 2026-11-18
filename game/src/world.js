// Solmar Bay — the world: one state object, one step function. Everything the
// game simulates lives here: the player on foot and in a car, traffic,
// pedestrians, the police, combat, pickups and the mission chain. Rendering
// reads this state and never mutates it.
import { CAR, GUN, PEDS, PLAYER, SAVE_KEY, STEP, TRAFFIC, WORLD } from './config.js';
import { buildCity, insideBuilding, randomRoadPoint, randomSidewalkPoint, resolveBuildingCollision } from './city.js';
import { clamp, dist, makeRandom } from './random.js';
import { collideCars, driveCar, driveTraffic, makeCar, spawnParkedCar } from './vehicles.js';
import { makeCop, makePedestrian, stepChaser, stepPedestrian } from './people.js';
import { explodeAt, fireBullet, makeTracer, stepBullets } from './combat.js';
import { raiseWanted, stepPolice } from './police.js';
import { MISSION_COUNT, missionObjective, startMission, stepMission } from './missions.js';

export const EVENT_NONE = 0;

function spawnPickups(world, count) {
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(world.city, world.rng);
    world.pickups.push({
      kind: world.rng.chance(0.75) ? 'cash' : 'health',
      x: p.x + world.rng.range(-30, 30),
      y: p.y + world.rng.range(-30, 30),
      value: world.rng.chance(0.75) ? world.rng.int(50, 151) : 40,
      bob: world.rng.range(0, Math.PI * 2),
    });
  }
}

/** A fresh world for `seed`. */
export function createWorld(seed = 1) {
  const rng = makeRandom(seed);
  const city = buildCity(seed);
  const world = {
    seed,
    rng,
    city,
    time: 0,
    player: {
      x: 1470, y: 1050, angle: -Math.PI / 2, health: PLAYER.health,
      speed: 0, inCar: false, car: null, fireCooldown: 0, aimAngle: 0,
      moving: false,
    },
    cars: [],
    policeCars: [],
    cops: [],
    peds: [],
    gulls: [],
    bullets: [],
    tracers: [],
    particles: [],
    pickups: [],
    wanted: 0,
    hiddenTimer: 0,
    money: 0,
    completedMissions: 0,
    nextMission: 0,
    storyComplete: false,
    mission: null,
    mara: null,
    log: [],
    events: [],
    busted: false,
    wasted: false,
    stats: { kills: 0, carsStolen: 0, shotsFired: 0, distance: 0 },
    message: null,
    messageTimer: 0,
  };
  // Traffic and parked cars.
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const p = randomRoadPoint(city, rng);
    const car = makeCar(city, rng, 'traffic', p.x, p.y, p.angle);
    car.targetNode = car.node;
    world.cars.push(car);
  }
  for (let i = 0; i < 14; i += 1) world.cars.push(spawnParkedCar(city, rng));
  for (let i = 0; i < PEDS.count; i += 1) world.peds.push(makePedestrian(city, rng));
  spawnPickups(world, 12);
  world.raiseWanted = (stars, reason) => raiseWanted(world, stars, reason);
  world.damagePlayer = (amount) => damagePlayer(world, amount);
  world.enemyShot = (shooter, targetCar) => {
    const tx = targetCar ? targetCar.x : world.player.x;
    const ty = targetCar ? targetCar.y : world.player.y;
    const angle = Math.atan2(ty - shooter.y, tx - shooter.x) + (rng.next() - 0.5) * 0.3;
    world.bullets.push(fireBullet(shooter.x, shooter.y, angle, shooter.kind === 'gull' ? 'gull' : 'cop', 12));
    world.tracers.push(makeTracer(shooter.x, shooter.y, angle, 300));
  };
  return world;
}

/** Show a toast line for a few seconds. */
export function toast(world, text, seconds = 4) {
  world.message = text;
  world.messageTimer = seconds;
}

function nearestCar(world, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of [...world.cars, ...world.policeCars]) {
    if (car.dead) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function damagePlayer(world, amount) {
  const p = world.player;
  if (p.health <= 0) return;
  p.health -= amount;
  if (p.health <= 0) {
    p.health = 0;
    world.wasted = true;
    world.events.push({ type: 'wasted' });
  }
}

function explodeCar(world, car) {
  if (car.dead) return;
  car.dead = true;
  car.burnTimer = 4;
  const hits = explodeAt(car.x, car.y, [...world.peds, ...world.cops, ...world.gulls], [...world.cars, ...world.policeCars]);
  for (const h of hits) {
    if (h.type === 'person') killPerson(world, h.person, 'explosion');
  }
  world.particles.push({ kind: 'explosion', x: car.x, y: car.y, life: 0.9, max: 0.9 });
  world.events.push({ type: 'explosion', x: car.x, y: car.y });
  const p = world.player;
  const d = dist(car.x, car.y, p.inCar && p.car === car ? car.x : p.x, p.inCar && p.car === car ? car.y : p.y);
  if (p.inCar && p.car === car) damagePlayer(world, 55);
  else if (d < 130) damagePlayer(world, 40 * (1 - d / 200));
}

function killPerson(world, person, cause) {
  if (person.dead) return;
  person.dead = true;
  person.state = 'down';
  world.stats.kills += 1;
  if (person.kind === 'gull') {
    if (world.mission && world.mission.index === 3 && world.mission.stage === 1) {
      world.mission.kills += 1;
    }
    world.events.push({ type: 'kill', kind: 'gull' });
  } else if (person.kind === 'cop') {
    world.raiseWanted(2, 'You shot a cop');
    world.events.push({ type: 'kill', kind: 'cop' });
  } else if (person.kind === 'ped') {
    world.raiseWanted(1, 'A pedestrian was hit');
    world.events.push({ type: 'kill', kind: 'ped' });
  }
  void cause;
}

/** Step the player on foot. */
function stepPlayerOnFoot(world, c, dt) {
  const p = world.player;
  const speed = c.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const moving = c.move.x !== 0 || c.move.y !== 0;
  p.moving = moving;
  if (moving) {
    // Axis-separated movement: slide along walls instead of being shoved
    // back out of them, so the player can walk around a building's corner.
    const nx = p.x + c.move.x * speed * dt;
    if (!insideBuilding(world.city, nx, p.y, PLAYER.radius)) p.x = nx;
    const ny = p.y + c.move.y * speed * dt;
    if (!insideBuilding(world.city, p.x, ny, PLAYER.radius)) p.y = ny;
    p.angle = Math.atan2(c.move.y, c.move.x);
    p.speed = speed;
    world.stats.distance += speed * dt;
    const fixed = resolveBuildingCollision(world.city, p.x, p.y, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
  } else {
    p.speed = 0;
  }
  // Aim at the mouse.
  p.aimAngle = Math.atan2(c.aimY - p.y, c.aimX - p.x);

  // Enter a nearby car.
  if (c.enter) {
    const car = nearestCar(world, p.x, p.y, 78);
    if (car) {
      if (car.kind === 'police') {
        toast(world, 'That cruiser belongs to the Solmar Bay PD. Pick another ride.');
      } else {
        if (car.occupied) {
          car.occupied = false;
          world.stats.carsStolen += 1;
          world.raiseWanted(1, 'Grand theft auto — the owner called it in');
          const driver = makePedestrian(world.city, world.rng);
          driver.x = car.x + 40;
          driver.y = car.y + 40;
          driver.state = 'flee';
          driver.fleeTimer = 4;
          world.peds.push(driver);
          toast(world, `You jacked a ${car.model.name}. The owner ran for it.`);
        } else {
          toast(world, `You hop into the ${car.model.name}.`);
        }
        car.parked = false;
        car.kind = 'player';
        p.inCar = true;
        p.car = car;
        world.events.push({ type: 'enter-car', car });
      }
    }
  }

  // Fire the pistol.
  p.fireCooldown -= dt;
  if (c.fire && p.fireCooldown <= 0) {
    p.fireCooldown = GUN.fireInterval;
    world.stats.shotsFired += 1;
    const angle = p.aimAngle + (world.rng.next() - 0.5) * GUN.spread;
    world.bullets.push(fireBullet(p.x + Math.cos(angle) * 18, p.y + Math.sin(angle) * 18, angle, 'player'));
    world.tracers.push(makeTracer(p.x, p.y, angle, GUN.range));
    world.events.push({ type: 'gunshot', x: p.x, y: p.y });
    for (const ped of world.peds) {
      if (!ped.dead && dist(ped.x, ped.y, p.x, p.y) < 260) {
        ped.state = 'flee';
        ped.fleeTimer = 3;
      }
    }
  }

  // Pickups.
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    if (dist(p.x, p.y, pk.x, pk.y) < 34) {
      pk.taken = true;
      if (pk.kind === 'cash') {
        world.money += pk.value;
        world.events.push({ type: 'pickup', kind: 'cash', value: pk.value });
        toast(world, `Found $${pk.value} on the street.`);
      } else {
        p.health = Math.min(PLAYER.health, p.health + pk.value);
        world.events.push({ type: 'pickup', kind: 'health', value: pk.value });
        toast(world, `First aid kit: +${pk.value} health.`);
      }
    }
  }
}

/** Step the player driving. */
function stepPlayerDriving(world, c, dt) {
  const p = world.player;
  const car = p.car;
  if (!car || car.dead) {
    p.inCar = false;
    p.car = null;
    return;
  }
  driveCar(car, c.drive.throttle, c.drive.steer, c.drive.handbrake, dt, world.city);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.speed = Math.abs(car.speed);
  world.stats.distance += Math.abs(car.speed) * dt;
  if (Math.abs(car.speed) > 200) {
    // Near-misses and speed scare pedestrians.
    for (const ped of world.peds) {
      if (!ped.dead && ped.state !== 'flee' && dist(ped.x, ped.y, car.x, car.y) < 90) {
        ped.state = 'flee';
        ped.fleeTimer = 3;
      }
    }
  }
  // Running over a pedestrian is a crime.
  for (const ped of world.peds) {
    if (ped.dead || ped.state === 'down') continue;
    if (dist(ped.x, ped.y, car.x, car.y) < 26 && Math.abs(car.speed) > 40) {
      killPerson(world, ped, 'run over');
      world.events.push({ type: 'runover', x: ped.x, y: ped.y });
    }
  }
  // Hit a foot cop with the car.
  for (const cop of world.cops) {
    if (cop.dead || cop.state === 'down') continue;
    if (dist(cop.x, cop.y, car.x, car.y) < 26 && Math.abs(car.speed) > 40) {
      killPerson(world, cop, 'run over');
    }
  }
  // Exit the car.
  if (c.enter) {
    const side = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(side) * 44;
    p.y = car.y + Math.sin(side) * 44;
    const fixed = resolveBuildingCollision(world.city, p.x, p.y, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    p.inCar = false;
    p.car = null;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    world.events.push({ type: 'exit-car', car });
  }
  // Pickups while driving over them.
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    if (dist(car.x, car.y, pk.x, pk.y) < 40) {
      pk.taken = true;
      if (pk.kind === 'cash') {
        world.money += pk.value;
        world.events.push({ type: 'pickup', kind: 'cash', value: pk.value });
      } else {
        p.health = Math.min(PLAYER.health, p.health + pk.value);
        world.events.push({ type: 'pickup', kind: 'health', value: pk.value });
      }
    }
  }
}

/**
 * One fixed step of the simulation. `c` is the control object built by
 * main.js (or by the autopilot in shots.js / the playtest): {move, run,
 * enter, fire, aimX, aimY, drive:{throttle, steer, handbrake}, missionKey}.
 */
export function stepWorld(world, c, dt = STEP) {
  if (world.wasted || world.busted) return;
  world.time += dt;
  if (world.messageTimer > 0) {
    world.messageTimer -= dt;
    if (world.messageTimer <= 0) world.message = null;
  }

  // Mission key: start the next job, or retry a failed one.
  if (c.missionKey) {
    if (!world.mission || world.mission.done || world.mission.failed) {
      const index = world.mission && world.mission.failed ? world.mission.index : world.nextMission;
      startMission(world, index);
      world.events.push({ type: 'mission-start', mission: world.mission });
      toast(world, `Job ${world.mission.def.id}: ${world.mission.def.title}`, 5);
    }
  }

  const p = world.player;
  if (p.inCar) stepPlayerDriving(world, c, dt);
  else stepPlayerOnFoot(world, c, dt);

  // Traffic.
  const allCars = [...world.cars, ...world.policeCars];
  for (const car of world.cars) {
    if (car.dead) continue;
    if (car.kind === 'player') continue;
    if (car.parked) continue;
    const ahead = (me) => {
      let best = null;
      for (const other of allCars) {
        if (other === me || other.dead) continue;
        const fx = Math.cos(me.angle);
        const fy = Math.sin(me.angle);
        const rx = other.x - me.x;
        const ry = other.y - me.y;
        const along = rx * fx + ry * fy;
        const side = Math.abs(rx * -fy + ry * fx);
        if (along > 0 && along < 120 && side < 30 && (best === null || along < best)) best = along;
      }
      return best;
    };
    driveTraffic(car, world.city, dt, world.rng, ahead);
  }
  collideCars(allCars, dt);

  // Car wrecks burn out and vanish; destroyed cars explode once.
  for (const car of allCars) {
    if (!car.dead && car.health <= 0) explodeCar(world, car);
    if (car.dead && car.burnTimer > 0) {
      car.burnTimer -= dt;
      if (world.rng.chance(0.1)) {
        world.particles.push({ kind: 'smoke', x: car.x + world.rng.range(-14, 14), y: car.y + world.rng.range(-14, 14), life: 0.8, max: 0.8 });
      }
    }
  }
  world.cars = world.cars.filter((car) => !(car.dead && car.burnTimer <= 0) || car.kind === 'player');
  world.policeCars = world.policeCars.filter((car) => !(car.dead && car.burnTimer <= 0));

  // Pedestrians.
  const threats = [];
  for (const b of world.bullets) threats.push({ x: b.x, y: b.y, radius: 120 });
  for (const car of allCars) {
    if (!car.dead && Math.abs(car.speed) > 240) threats.push({ x: car.x, y: car.y, radius: 80 });
  }
  for (const ped of world.peds) stepPedestrian(ped, world.city, dt, world.rng, threats);
  world.peds = world.peds.filter((ped) => !ped.dead || ped.state === 'down');
  if (world.peds.length < PEDS.count && world.rng.chance(0.02)) {
    world.peds.push(makePedestrian(world.city, world.rng));
  }

  // Mara follows the player on foot, rides along in the car.
  if (world.mara && world.mara.state === 'following') {
    const d = dist(world.mara.x, world.mara.y, p.x, p.y);
    if (d > 46) {
      const a = Math.atan2(p.y - world.mara.y, p.x - world.mara.x);
      world.mara.x += Math.cos(a) * 200 * dt;
      world.mara.y += Math.sin(a) * 200 * dt;
      world.mara.angle = a;
    }
    if (p.inCar) world.mara.state = 'inCar';
  }
  if (world.mara && world.mara.state === 'inCar' && p.car) {
    world.mara.x = p.car.x;
    world.mara.y = p.car.y;
  }

  // Gulls fight the player during mission 4.
  for (const gull of world.gulls) {
    if (gull.dead) continue;
    const d = dist(gull.x, gull.y, p.x, p.y);
    if (d < 620) {
      stepChaser(gull, world.city, dt, p.x, p.y, 130, 340, (g) => world.enemyShot(g, p.car));
    }
  }
  world.gulls = world.gulls.filter((g) => !g.dead);

  // Police and wanted.
  stepPolice(world, dt);

  // Bullets.
  const targets = {
    people: [...world.peds, ...world.cops, ...world.gulls, ...(world.mara && world.mara.state !== 'safe' ? [] : [])],
    cars: allCars,
  };
  const hits = stepBullets(world.bullets, world.city, dt, targets);
  for (const h of hits) {
    if (h.type === 'person') {
      world.particles.push({ kind: 'blood', x: h.x, y: h.y, life: 0.4, max: 0.4 });
      if (h.person.health <= 0) killPerson(world, h.person, 'shot');
      else if (h.owner === 'player' && h.person.kind === 'ped') world.raiseWanted(1, 'You shot a pedestrian');
      else if (h.owner === 'player' && h.person.kind === 'cop') world.raiseWanted(1, 'You shot at the police');
      if (h.owner !== 'player' && h.person === world.player) {
        // Enemy fire never targets the player object directly; handled below.
      }
    } else if (h.type === 'car') {
      world.particles.push({ kind: 'spark', x: h.x, y: h.y, life: 0.3, max: 0.3 });
      if (h.car.kind === 'player' && h.owner !== 'player') {
        // Shooting the player's car hurts the driver a little.
        damagePlayer(world, 4);
      }
    } else if (h.type === 'wall') {
      world.particles.push({ kind: 'spark', x: h.x, y: h.y, life: 0.25, max: 0.25 });
    }
  }
  world.bullets = world.bullets.filter((b) => !b.dead);
  // Enemy bullets can hit the player.
  for (const b of world.bullets) {
    if (b.owner === 'player' || b.dead) continue;
    const tx = p.inCar && p.car ? p.car.x : p.x;
    const ty = p.inCar && p.car ? p.car.y : p.y;
    const radius = p.inCar ? 26 : 13;
    if (dist(b.x, b.y, tx, ty) < radius) {
      b.dead = true;
      damagePlayer(world, b.damage);
      world.events.push({ type: 'player-hit' });
    }
  }
  world.bullets = world.bullets.filter((b) => !b.dead);

  // Tracers and particles fade.
  for (const t of world.tracers) t.life -= dt;
  world.tracers = world.tracers.filter((t) => t.life > 0);
  for (const pt of world.particles) pt.life -= dt;
  world.particles = world.particles.filter((pt) => pt.life > 0);

  // Pickups respawn so the city never runs dry.
  const livePickups = world.pickups.filter((pk) => !pk.taken).length;
  if (livePickups < 6) spawnPickups(world, 4);

  // Mission progress.
  if (world.mission) {
    const event = stepMission(world, dt);
    if (event) {
      world.events.push(event);
      if (event.type === 'mission-complete') {
        toast(world, `${event.mission.def.title} complete — $${event.reward}`, 5);
      } else if (event.type === 'mission-failed') {
        toast(world, `Job failed: ${event.text}`, 5);
      }
    }
  }

  // Busted / wasted hand the outcome to the screen layer.
  if (world.busted || world.wasted) {
    world.events.push({ type: world.busted ? 'busted' : 'wasted' });
  }
}

/** Apply the busted outcome: fine, release at the clinic, heat gone. */
export function applyBusted(world) {
  const fine = Math.floor(world.money * 0.2);
  world.money -= fine;
  world.wanted = 0;
  world.hiddenTimer = 0;
  world.policeCars = [];
  world.cops = [];
  world.player.health = PLAYER.health;
  world.player.x = 2730;
  world.player.y = 2310;
  if (world.player.inCar && world.player.car) {
    world.player.car.kind = 'traffic';
    world.player.car = null;
    world.player.inCar = false;
  }
  world.busted = false;
  world.log.push(`Busted — fined $${fine}, released at Doc's Clinic.`);
  return fine;
}

/** Apply the wasted outcome: hospital bill, release at the clinic. */
export function applyWasted(world) {
  const bill = Math.floor(world.money * 0.1);
  world.money -= bill;
  world.wanted = 0;
  world.hiddenTimer = 0;
  world.policeCars = [];
  world.cops = [];
  world.player.health = PLAYER.health;
  world.player.x = 2730;
  world.player.y = 2310;
  if (world.player.inCar && world.player.car) {
    world.player.car.kind = 'traffic';
    world.player.car = null;
    world.player.inCar = false;
  }
  if (world.mission && !world.mission.done) world.mission.failed = true;
  world.wasted = false;
  world.log.push(`Wasted — hospital bill $${bill}.`);
  return bill;
}

// ---------------------------------------------------------------- save / load

/** Save progress to localStorage. Returns true when it worked. */
export function saveGame(world) {
  try {
    const data = {
      version: 1,
      seed: world.seed,
      money: world.money,
      completedMissions: world.completedMissions,
      nextMission: world.nextMission,
      storyComplete: world.storyComplete,
      x: world.player.x,
      y: world.player.y,
      health: world.player.health,
      wanted: 0,
      stats: world.stats,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Read the save, or null when there is none. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

/** Apply a save to a fresh world. */
export function applySave(world, data) {
  world.money = data.money ?? 0;
  world.completedMissions = data.completedMissions ?? 0;
  world.nextMission = data.nextMission ?? 0;
  world.storyComplete = !!data.storyComplete;
  world.player.x = data.x ?? world.player.x;
  world.player.y = data.y ?? world.player.y;
  world.player.health = data.health ?? PLAYER.health;
  world.stats = { ...world.stats, ...(data.stats ?? {}) };
  return world;
}

export { missionObjective, MISSION_COUNT, TRAFFIC };
