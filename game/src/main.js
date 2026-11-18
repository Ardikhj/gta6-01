// Solmar Bay — boot and the game loop. Screens: title, play, pause, busted,
// wasted and the job-complete card. The simulation lives in world.js; this
// file owns the frame, the controls and the sounds the world's events ask for.
import { STEP, VIEW } from './config.js';
import { bindInput, input } from './input.js';
import { applyBusted, applySave, applyWasted, createWorld, loadSave, saveGame, stepWorld } from './world.js';
import { drawBusted, drawGame, drawMissionComplete, drawPause, drawTitle, drawWasted, makeCamera, updateCamera } from './render.js';
import { setEngine, setSiren, sfx, startMusic, toggleMute, unlockAudio, isMuted } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;
bindInput(canvas);

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number(params.get('seed') ?? 7);

let world = createWorld(7);
let camera = makeCamera();
let screen = 'title';
let save = loadSave();
let outcome = 0; // fine / bill of the last busted / wasted
let muted = false;
let accumulated = 0;
let lastTime = 0;

/** Build the control object the simulation reads this frame. */
function buildControls() {
  const move = input.move();
  const mouseWorldX = input.mouseX + camera.x;
  const mouseWorldY = input.mouseY + camera.y;
  const p = world.player;
  let throttle = 0;
  let steer = 0;
  if (p.inCar) {
    if (input.down('KeyW') || input.down('ArrowUp')) throttle = 1;
    else if (input.down('KeyS') || input.down('ArrowDown')) throttle = -1;
    if (input.down('KeyA') || input.down('ArrowLeft')) steer = -1;
    else if (input.down('KeyD') || input.down('ArrowRight')) steer = 1;
  }
  return {
    move,
    run: input.down('ShiftLeft') || input.down('ShiftRight'),
    enter: input.wasPressed('KeyE'),
    fire: input.mouseDown,
    aimX: mouseWorldX,
    aimY: mouseWorldY,
    drive: { throttle, steer, handbrake: input.down('Space') },
    missionKey: input.wasPressed('KeyM'),
  };
}

/** Play the sounds the world's events ask for, and switch screens. */
function drainEvents() {
  for (const event of world.events) {
    if (event.type === 'gunshot') sfx.gunshot();
    else if (event.type === 'explosion') sfx.explosion();
    else if (event.type === 'pickup') sfx.pickup();
    else if (event.type === 'enter-car' || event.type === 'exit-car') sfx.click();
    else if (event.type === 'mission-start') sfx.mission();
    else if (event.type === 'mission-complete') {
      sfx.cash();
      saveGame(world);
      screen = 'mission-complete';
    } else if (event.type === 'mission-failed') sfx.fail();
    else if (event.type === 'wanted-up') sfx.sirenBlip();
    else if (event.type === 'runover' || event.type === 'ram') sfx.crash();
    else if (event.type === 'player-hit') sfx.hit();
    else if (event.type === 'kill') sfx.hit();
    else if (event.type === 'busted') {
      sfx.busted();
      outcome = applyBusted(world);
      screen = 'busted';
    } else if (event.type === 'wasted') {
      sfx.fail();
      outcome = applyWasted(world);
      screen = 'wasted';
    }
  }
  world.events.length = 0;
}

function startNewStory() {
  world = createWorld(7);
  camera = makeCamera();
  save = null;
  screen = 'play';
  unlockAudio();
  startMusic();
}

function continueStory() {
  world = createWorld(save.seed ?? 7);
  camera = makeCamera();
  applySave(world, save);
  screen = 'play';
  unlockAudio();
  startMusic();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastTime) / 1000 || STEP);
  lastTime = now;

  if (input.wasPressed('KeyN')) muted = toggleMute();
  if (input.wasPressed('Enter') && (screen === 'title' || screen === 'busted' || screen === 'wasted' || screen === 'mission-complete')) {
    if (screen === 'title') {
      if (save) continueStory();
      else startNewStory();
    } else {
      screen = 'play';
    }
  }

  if (screen === 'play') {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      screen = 'pause';
    } else {
      accumulated += dt;
      let guard = 0;
      while (accumulated >= STEP && guard < 8) {
        stepWorld(world, buildControls(), STEP);
        accumulated -= STEP;
        guard += 1;
      }
      if (guard >= 8) accumulated = 0;
      updateCamera(camera, world);
      drainEvents();
      const p = world.player;
      setEngine(p.inCar && p.car ? Math.abs(p.car.speed) / 560 : 0, p.inCar);
      setSiren(world.wanted > 0, dt);
    }
  } else if (screen === 'pause') {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) screen = 'play';
    if (input.wasPressed('KeyS')) {
      saveGame(world);
      save = loadSave();
    }
    if (input.wasPressed('KeyQ')) {
      saveGame(world);
      save = loadSave();
      screen = 'title';
    }
    setEngine(0, false);
    setSiren(false, dt);
  }

  // Draw.
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  if (screen === 'title') {
    drawTitle(ctx, save, save?.storyComplete ?? false, save?.completedMissions ?? 0);
  } else {
    drawGame(ctx, world, camera, { x: input.mouseX, y: input.mouseY }, muted);
    if (screen === 'pause') drawPause(ctx, world);
    else if (screen === 'busted') drawBusted(ctx, outcome);
    else if (screen === 'wasted') drawWasted(ctx, outcome);
    else if (screen === 'mission-complete') drawMissionComplete(ctx, world);
  }
  input.endFrame();
}

// Shot mode (?shot=drive|chase|shootout|foot): stage the scene, draw one
// frame, and stop. The screenshot script reads this exact frame.
if (shotName) {
  const staged = stageShot(shotName, Number.isFinite(seedParam) ? seedParam : 7);
  world = staged.world;
  camera = staged.camera;
  drawGame(ctx, world, camera, { x: VIEW.width / 2 + 120, y: VIEW.height / 2 - 60 }, false);
  document.title = `Solmar Bay — ${shotName}`;
} else {
  canvas.addEventListener('mousedown', () => {
    unlockAudio();
    startMusic();
  });
  window.addEventListener('keydown', () => {
    unlockAudio();
    startMusic();
  }, { once: true });
  requestAnimationFrame((now) => {
    lastTime = now;
    frame(now);
  });
}

// Headless hooks for the playtest: the real world, the screen, and a way to
// drive it without a keyboard.
window.__solmar = {
  get world() {
    return world;
  },
  get screen() {
    return screen;
  },
  startNewStory,
  continueStory,
  step(controls, seconds) {
    const steps = Math.floor(seconds / STEP);
    for (let i = 0; i < steps; i += 1) stepWorld(world, controls, STEP);
    updateCamera(camera, world);
    return world;
  },
};
