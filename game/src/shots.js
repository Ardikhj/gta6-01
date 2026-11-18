// Screenshot scenes for Solmar Bay. Each one plays the real simulation
// forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot, so the frame is what a short game really looks like and the same
// seed always gives the same frame. Query: ?shot=drive|chase|shootout|foot
// (and ?seed=N). Used by the screenshot script and by nothing else.
import { STEP } from './config.js';
import { createWorld, stepWorld } from './world.js';
import { startMission } from './missions.js';
import { makeCamera, updateCamera } from './render.js';
import { angleDiff, clamp } from './random.js';

const SAMPLE = STEP;

/** Controls that drive the player's car toward a waypoint. */
function driveToward(world, tx, ty, throttle = 1) {
  const car = world.player.car;
  if (!car) return idleControls();
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(want, car.angle);
  let thr = throttle;
  if (Math.abs(diff) > 1.0 && Math.abs(car.speed) > 160) thr = -1;
  else if (Math.abs(diff) > 0.55) thr = 0.25;
  return {
    move: { x: 0, y: 0 }, run: false, enter: false, fire: false,
    aimX: tx, aimY: ty,
    drive: { throttle: thr, steer: clamp(diff * 2, -1, 1), handbrake: false },
    missionKey: false,
  };
}

function idleControls() {
  return {
    move: { x: 0, y: 0 }, run: false, enter: false, fire: false,
    aimX: 0, aimY: 0,
    drive: { throttle: 0, steer: 0, handbrake: false },
    missionKey: false,
  };
}

/** Put the player in the nearest parked car and start driving. */
function stealNearestCar(world) {
  let best = null;
  let bestD = Infinity;
  for (const car of world.cars) {
    if (car.dead || car.kind === 'police') continue;
    const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (!best) return false;
  world.player.x = best.x;
  world.player.y = best.y;
  stepWorld(world, { ...idleControls(), enter: true });
  return world.player.inCar;
}

function stepFor(world, seconds, controlsFn) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, controlsFn(world, i), SAMPLE);
    if (world.wasted || world.busted) break;
  }
}

/**
 * Stage the named scene on a fresh world and return {world, camera}. Any
 * unknown name stages 'drive'.
 */
export function stageShot(name, seed = 7) {
  const world = createWorld(seed);
  const camera = makeCamera();

  if (name === 'chase') {
    // Mission 3 in progress, three stars, cruisers on the tail.
    startMission(world, 2);
    world.mission.stage = 2;
    world.mission.target = { x: 3150, y: 3150, label: 'Safehouse' };
    world.mission.text = 'The police are on you. Lose them and reach the safehouse.';
    world.mara = { x: 1800, y: 1800, state: 'inCar', angle: 0, shirt: '#e9c46a', skin: '#f1c27d' };
    world.raiseWanted(3, 'The Gulls tipped off the police');
    stealNearestCar(world);
    // On the road x=1890, heading south: a straight run the cruisers can
    // follow without cutting through buildings.
    world.player.car.x = 1890;
    world.player.car.y = 1470;
    world.player.car.angle = Math.PI / 2;
    stepFor(world, 6, (w) => driveToward(w, 1890, 2600));
    // Let the cruisers close in for the frame.
    stepFor(world, 2.5, (w) => driveToward(w, 1890, 3100, 0.7));
  } else if (name === 'shootout') {
    // Mission 4: the warehouse, Gulls in the open, Leo returning fire.
    startMission(world, 3);
    world.mission.stage = 1;
    world.mission.needKills = 5;
    world.mission.kills = 2;
    world.mission.text = 'Clear out the Gulls — 3 left.';
    world.player.x = 560;
    world.player.y = 560;
    for (let i = 0; i < 5; i += 1) {
      world.gulls.push({
        kind: 'gull', x: 380 + (i % 3) * 70, y: 380 + Math.floor(i / 3) * 70,
        angle: 0, speed: 0, walk: 70, target: { x: 420, y: 420 },
        state: 'guard', fleeTimer: 0, shirt: '#3d348b', skin: '#e0ac69',
        health: 60, dead: i >= 3, shootCooldown: 0.4,
      });
    }
    world.gulls[3].dead = true;
    world.gulls[4].dead = true;
    stepFor(world, 2.2, (w) => {
      const gull = w.gulls.find((g) => !g.dead);
      if (!gull) return idleControls();
      const c = idleControls();
      c.fire = true;
      c.aimX = gull.x;
      c.aimY = gull.y;
      c.move = { x: 0.3, y: -0.2 };
      return c;
    });
  } else if (name === 'foot') {
    // On foot downtown, pedestrians everywhere, mission 2 live.
    startMission(world, 1);
    world.player.x = 1680;
    world.player.y = 1470;
    world.money = 1250;
    // A few pedestrians close by for a lively street. They stroll the
    // sidewalk along road y=1470, one side each.
    for (let i = 0; i < 6; i += 1) {
      world.peds.push({
        kind: 'ped', x: 1600 + i * 55, y: 1420 + (i % 2) * 90,
        angle: 0, speed: 0, walk: 55, target: { x: 1750, y: 1500 },
        line: { axis: 'h', coord: 1470, side: i % 2 ? 1 : -1 },
        state: 'walk', fleeTimer: 0, shirt: '#2a9d8f', skin: '#f1c27d',
        health: 30, dead: false,
      });
    }
    stepFor(world, 3, (w) => {
      const c = idleControls();
      c.move = { x: 0.4, y: 0.2 };
      c.aimX = w.player.x + 200;
      c.aimY = w.player.y - 100;
      return c;
    });
  } else {
    // 'drive' (default): Leo in a stolen Vela GT, downtown, job 1 live.
    // Straight east along the road y=1050 from the intersection.
    startMission(world, 0);
    stealNearestCar(world);
    world.player.car.x = 1470;
    world.player.car.y = 1050;
    world.player.car.angle = 0;
    stepFor(world, 9, (w) => driveToward(w, 2600, 1050));
  }

  updateCamera(camera, world);
  // Settle the camera on the player.
  for (let i = 0; i < 30; i += 1) updateCamera(camera, world);
  return { world, camera };
}
