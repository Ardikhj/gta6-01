// Missions and the story of Solmar Bay. Leo Voss, a getaway driver who swore
// he was out, is pulled back in when his sister Mara owes the Gull gang.
// Otto Kessler, a fixer with a garage downtown, hands him the jobs. Five
// missions, each a chain of stages with a marker, a timer where the story
// needs urgency, and a payout. All names and places are invented for this game.
import { LANDMARKS } from './city.js';
import { dist } from './random.js';
import { makeGull } from './people.js';

export const MISSION_COUNT = 5;

function landmark(kind) {
  return LANDMARKS.find((l) => l.kind === kind);
}

export const MISSIONS = [
  {
    id: 1,
    title: 'First Wheels',
    brief: "Kessler needs a driver with a car. Any car. Take one and bring it to the garage — the keys are optional.",
    reward: 300,
  },
  {
    id: 2,
    title: 'The Delivery',
    brief: "A package is waiting at the docks. Pick it up and get it to the Hotel Azure before the client loses patience.",
    reward: 500,
  },
  {
    id: 3,
    title: "Mara's Call",
    brief: "Mara is in trouble at the marina. Pick her up and get her to the safehouse — the Gulls are already looking for her.",
    reward: 700,
  },
  {
    id: 4,
    title: 'Gull Trouble',
    brief: 'The Gulls run the old warehouse at the docks. Clear them out and make it back to the street in one piece.',
    reward: 900,
  },
  {
    id: 5,
    title: 'The Big Score',
    brief: 'One last job: the Solmar Bank vault. Grab the cash, lose the heat, and vanish at the beach hideout.',
    reward: 2500,
  },
];

/** Begin mission `index` (0-based) on the world. */
export function startMission(world, index) {
  const def = MISSIONS[index];
  const mission = {
    index,
    def,
    stage: 0,
    timer: 0,
    kills: 0,
    needKills: 0,
    target: null,
    text: def.brief,
    done: false,
    failed: false,
    grabTimer: 0,
  };
  world.mission = mission;
  world.gulls = [];
  world.mara = null;
  if (index === 0) {
    mission.text = 'Steal a car — walk up to one and press E.';
    mission.target = null;
  } else if (index === 1) {
    mission.target = { x: 630, y: 630, label: 'Pick up the package' };
    mission.text = 'Go to the docks and pick up the package.';
  } else if (index === 2) {
    const marina = { x: 3150, y: 630 };
    world.mara = { x: marina.x, y: marina.y, state: 'waiting', angle: 0, shirt: '#e9c46a', skin: '#f1c27d' };
    mission.target = { x: marina.x, y: marina.y, label: 'Find Mara' };
    mission.text = 'Find Mara at the marina.';
  } else if (index === 3) {
    mission.target = { x: 630, y: 630, label: 'The Gull warehouse' };
    mission.text = 'Get to the Gull warehouse at the docks.';
  } else if (index === 4) {
    const bank = landmark('bank');
    mission.target = { x: bank.x, y: bank.y, label: 'Solmar Bank' };
    mission.text = 'Get to the Solmar Bank. On foot, quiet.';
  }
  return mission;
}

/**
 * Advance the active mission one tick. Returns an event object when the
 * mission completes or fails, else null. `world` carries player, car, gulls,
 * mara, wanted and the helpers to raise the heat.
 */
export function stepMission(world, dt) {
  const m = world.mission;
  if (!m || m.done || m.failed) return null;
  const p = world.player;
  const px = p.inCar ? p.car.x : p.x;
  const py = p.inCar ? p.car.y : p.y;

  const complete = (text) => {
    m.done = true;
    world.money += m.def.reward;
    world.completedMissions += 1;
    world.nextMission = Math.min(m.index + 1, MISSION_COUNT - 1);
    if (world.completedMissions >= MISSION_COUNT) world.storyComplete = true;
    return { type: 'mission-complete', mission: m, text, reward: m.def.reward };
  };
  const fail = (text) => {
    m.failed = true;
    return { type: 'mission-failed', mission: m, text };
  };

  if (m.index === 0) {
    if (m.stage === 0) {
      if (p.inCar) {
        m.stage = 1;
        const g = landmark('garage');
        m.target = { x: g.x, y: g.y, label: "Kessler's Garage" };
        m.text = 'Drive to Kessler\u2019s Garage downtown.';
      }
    } else if (dist(px, py, m.target.x, m.target.y) < 90) {
      return complete('The car is Kessler\u2019s now. First job done — $300 in your pocket.');
    }
  } else if (m.index === 1) {
    if (m.stage === 0) {
      if (dist(px, py, m.target.x, m.target.y) < 70) {
        m.stage = 1;
        m.timer = 90;
        const hotel = landmark('hotel');
        m.target = { x: hotel.x, y: hotel.y, label: 'Hotel Azure' };
        m.text = 'Package secured. Deliver it to the Hotel Azure — 90 seconds.';
      }
    } else {
      m.timer -= dt;
      if (dist(px, py, m.target.x, m.target.y) < 90) {
        return complete('Delivered with time to spare. The client pays $500, no questions asked.');
      }
      if (m.timer <= 0) return fail('Too slow — the client found another courier.');
    }
  } else if (m.index === 2) {
    if (m.stage === 0) {
      if (world.mara && dist(px, py, world.mara.x, world.mara.y) < 60) {
        m.stage = 1;
        world.mara.state = 'following';
        m.text = 'Mara is with you. Get in a car and drive her to the safehouse.';
      }
    } else if (m.stage === 1) {
      if (p.inCar && (world.mara.state === 'following' || world.mara.state === 'inCar')) {
        world.mara.state = 'inCar';
        world.raiseWanted(2, 'The Gulls tipped off the police');
        const safe = landmark('safehouse');
        m.target = { x: safe.x, y: safe.y, label: 'Safehouse' };
        m.text = 'The police are on you. Lose them and reach the safehouse.';
        m.stage = 2;
      }
    } else if (dist(px, py, m.target.x, m.target.y) < 90) {
      world.mara.state = 'safe';
      return complete('Mara is safe. Kessler wires $700 and a warning: the Gulls don\u2019t forget.');
    }
  } else if (m.index === 3) {
    if (m.stage === 0) {
      if (dist(px, py, m.target.x, m.target.y) < 200) {
        m.stage = 1;
        m.needKills = 5;
        m.kills = 0;
        for (let i = 0; i < 5; i += 1) {
          world.gulls.push(makeGull(world.rng, { x: 560 + (i % 3) * 70 - 70, y: 560 + Math.floor(i / 3) * 70 - 30 }));
        }
        m.target = null;
        m.text = 'The Gulls are here. Clear them out — 5 left.';
      }
    } else if (m.stage === 1) {
      m.text = `Clear out the Gulls — ${Math.max(0, m.needKills - m.kills)} left.`;
      if (m.kills >= m.needKills) {
        m.stage = 2;
        m.target = { x: 1050, y: 630, label: 'Get clear of the docks' };
        m.text = 'Warehouse clear. Get out of the docks.';
      }
    } else if (dist(px, py, m.target.x, m.target.y) < 90) {
      return complete('The warehouse is yours. Kessler pays $900 — the Gulls will think twice now.');
    }
  } else if (m.index === 4) {
    if (m.stage === 0) {
      if (!p.inCar && dist(px, py, m.target.x, m.target.y) < 80) {
        m.stage = 1;
        m.grabTimer = 3;
        m.text = 'Inside the bank. Hold position at the vault — 3 seconds.';
      }
    } else if (m.stage === 1) {
      m.grabTimer -= dt;
      m.text = `Cracking the vault… ${Math.max(0, m.grabTimer).toFixed(1)}s`;
      if (dist(px, py, m.target.x, m.target.y) > 130) {
        m.stage = 0;
        m.text = 'Get to the Solmar Bank. On foot, quiet.';
      } else if (m.grabTimer <= 0) {
        m.stage = 2;
        world.raiseWanted(3, 'The bank alarm is screaming');
        const hide = landmark('hideout');
        m.target = { x: hide.x, y: hide.y, label: 'Beach Hideout' };
        m.text = 'Cash grabbed. Three stars and counting — reach the beach hideout.';
      }
    } else if (dist(px, py, m.target.x, m.target.y) < 180) {
      return complete('The Big Score is done. $2,500, no crew, no trace. Solmar Bay is yours, Leo.');
    }
  }
  return null;
}

/** The objective line the HUD shows for the active mission. */
export function missionObjective(world) {
  const m = world.mission;
  if (!m) return world.storyComplete ? 'Story complete — Solmar Bay is yours. Free roam.' : 'Press M to start the next job.';
  if (m.done) return 'Job done. Press M for the next job.';
  if (m.failed) return 'Job failed. Press M to retry it.';
  let text = m.text;
  if (m.index === 1 && m.stage === 1) text += ` — ${Math.max(0, Math.ceil(m.timer))}s left`;
  return text;
}
