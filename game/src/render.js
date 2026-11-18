// Rendering for Solmar Bay: the camera, the city, the cars and people, the
// HUD with its minimap, and every menu screen. Everything is drawn on one
// canvas with flat, sun-soaked colours — no image assets, so the game needs
// no network and no files beyond its own scripts.
import { VIEW, WORLD } from './config.js';
import { clamp, money } from './random.js';
import { DISTRICTS, LANDMARKS } from './city.js';
import { missionObjective } from './missions.js';

const SKY = '#f7e8c9';
const GRASS = '#8fbc6b';
const BLOCK = '#e6d3a8';
const ROAD = '#4a4a52';
const ROAD_LINE = '#f5d76e';
const SIDEWALK = '#cbb98f';
const BEACH = '#f2ddac';
const SEA = '#3d9db5';
const SEA_DEEP = '#2b7f9e';

export function makeCamera() {
  return { x: 0, y: 0 };
}

/** Follow the player, clamped so the camera never leaves the city. */
export function updateCamera(camera, world) {
  const p = world.player;
  const lookX = p.inCar && p.car ? p.car.vx * 0.35 : 0;
  const lookY = p.inCar && p.car ? p.car.vy * 0.35 : 0;
  const tx = clamp(p.x + lookX - VIEW.width / 2, 0, WORLD.width - VIEW.width);
  const ty = clamp(p.y + lookY - VIEW.height / 2, 0, WORLD.height - VIEW.height);
  camera.x += (tx - camera.x) * 0.12;
  camera.y += (ty - camera.y) * 0.12;
}

function districtAt(x, y) {
  for (const d of Object.values(DISTRICTS)) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.label;
  }
  return 'Solmar Bay';
}

function drawCity(ctx, world, camera) {
  const city = world.city;
  const x0 = camera.x - 40;
  const y0 = camera.y - 40;
  const x1 = camera.x + VIEW.width + 40;
  const y1 = camera.y + VIEW.height + 40;

  // Ground: grass, then the beach and the sea along the south edge.
  ctx.fillStyle = GRASS;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = BEACH;
  ctx.fillRect(Math.max(x0, city.beach.x0), Math.max(y0, city.beach.y0), Math.min(x1, city.beach.x1) - Math.max(x0, city.beach.x0), Math.min(y1, city.beach.y1) - Math.max(y0, city.beach.y0));
  ctx.fillStyle = SEA;
  ctx.fillRect(Math.max(x0, city.sea.x0), Math.max(y0, city.sea.y0), Math.min(x1, city.sea.x1) - Math.max(x0, city.sea.x0), Math.min(y1, city.sea.y1) - Math.max(y0, city.sea.y0));
  ctx.fillStyle = SEA_DEEP;
  for (let i = 0; i < 8; i += 1) {
    const wy = city.sea.y0 + 14 + i * 9;
    if (wy < y0 || wy > y1) continue;
    ctx.fillRect(x0, wy, x1 - x0, 3);
  }

  // Parks.
  for (const park of city.parks) {
    if (park.x1 < x0 || park.x0 > x1 || park.y1 < y0 || park.y0 > y1) continue;
    ctx.fillStyle = '#7fb069';
    ctx.fillRect(park.x0, park.y0, park.x1 - park.x0, park.y1 - park.y0);
    ctx.fillStyle = '#6a9e58';
    ctx.beginPath();
    ctx.ellipse((park.x0 + park.x1) / 2, (park.y0 + park.y1) / 2, 60, 40, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Blocks: sidewalk border, then the lot.
  for (const b of city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = SIDEWALK;
    ctx.fillRect(b.x - WORLD.sidewalk, b.y - WORLD.sidewalk, b.w + WORLD.sidewalk * 2, b.h + WORLD.sidewalk * 2);
    ctx.fillStyle = BLOCK;
    ctx.fillRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16);
  }

  // Roads.
  ctx.fillStyle = ROAD;
  for (const rx of city.vRoads) {
    if (rx < x0 - 60 || rx > x1 + 60) continue;
    ctx.fillRect(rx - WORLD.road / 2, y0, WORLD.road, y1 - y0);
  }
  for (const ry of city.hRoads) {
    if (ry < y0 - 60 || ry > y1 + 60) continue;
    ctx.fillRect(x0, ry - WORLD.road / 2, x1 - x0, WORLD.road);
  }
  // Centre dashes.
  ctx.fillStyle = ROAD_LINE;
  for (const rx of city.vRoads) {
    if (rx < x0 - 60 || rx > x1 + 60) continue;
    for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) ctx.fillRect(rx - 2, y, 4, 22);
  }
  for (const ry of city.hRoads) {
    if (ry < y0 - 60 || ry > y1 + 60) continue;
    for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) ctx.fillRect(x, ry - 2, 22, 4);
  }

  // Trees.
  for (const t of city.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = '#2f6b33';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4c9a4f';
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Buildings, with a fake height: a darker offset slab and a roof.
  for (const b of city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    const lift = b.height * 5;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 6, b.y + 6 + lift, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    // Windows.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        if ((i + j) % 2 === 0) continue;
        ctx.fillRect(b.x + 8 + i * ((b.w - 16) / cols), b.y + 8 + j * ((b.h - 16) / rows), 8, 10);
      }
    }
    if (b.downtown) {
      ctx.fillStyle = '#2b2b33';
      ctx.fillRect(b.x + b.w / 2 - 4, b.y - lift, 8, lift);
    }
  }

  // Landmark labels.
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const lm of LANDMARKS) {
    if (lm.x < x0 || lm.x > x1 || lm.y < y0 || lm.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = ctx.measureText(lm.name).width + 12;
    ctx.fillRect(lm.x - w / 2, lm.y - 26, w, 18);
    ctx.fillStyle = '#fff';
    ctx.fillText(lm.name, lm.x, lm.y - 13);
  }
}

function drawCarShape(ctx, car, highlight) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  if (car.dead) {
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(-28, -14, 56, 28);
    ctx.fillStyle = '#444';
    ctx.fillRect(-20, -10, 40, 20);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-26, -12 + 4, 52, 24);
    // Body.
    ctx.fillStyle = car.model.color;
    roundRect(ctx, -27, -13, 54, 26, 7);
    ctx.fill();
    // Cabin.
    ctx.fillStyle = 'rgba(20,30,45,0.85)';
    roundRect(ctx, -8, -10, 20, 20, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.7)';
    ctx.fillRect(-6, -10, 16, 4);
    ctx.fillRect(-6, 6, 16, 4);
    // Headlights and tail lights.
    ctx.fillStyle = '#fff8c9';
    ctx.fillRect(24, -10, 3, 5);
    ctx.fillRect(24, 5, 3, 5);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-27, -10, 3, 5);
    ctx.fillRect(-27, 5, 3, 5);
    if (car.model.taxi) {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 4, 3);
    }
    if (car.siren) {
      const on = Math.floor(performance.now() / 180) % 2 === 0;
      ctx.fillStyle = on ? '#ff2d2d' : '#2d7dff';
      ctx.beginPath();
      ctx.arc(8, -8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = on ? '#2d7dff' : '#ff2d2d';
      ctx.beginPath();
      ctx.arc(8, 8, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.health < 40) {
      ctx.fillStyle = 'rgba(255,120,0,0.8)';
      ctx.beginPath();
      ctx.arc(-14, 0, 5 + Math.sin(performance.now() / 90) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  if (highlight) {
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(car.x, car.y, 40, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPersonShape(ctx, person, isPlayer) {
  ctx.save();
  ctx.translate(person.x, person.y);
  ctx.rotate(person.angle);
  if (person.state === 'down' || person.dead) {
    ctx.fillStyle = person.skin;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = person.shirt;
    ctx.beginPath();
    ctx.ellipse(6, 0, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 3, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body faces the movement direction: head at the front.
  ctx.fillStyle = person.shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = person.skin;
  ctx.beginPath();
  ctx.arc(7, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(9, -2, 2, 0, Math.PI * 2);
  ctx.arc(9, 2, 2, 0, Math.PI * 2);
  ctx.fill();
  if (isPlayer) {
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath();
    ctx.arc(-8, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (person.kind === 'gull') {
    ctx.strokeStyle = '#3d348b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (person.kind === 'cop') {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, -13);
  }
  ctx.restore();
}

function drawPickups(ctx, world) {
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    const bob = Math.sin(world.time * 3 + pk.bob) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#2e9e5b';
      ctx.fillRect(-9, -6, 18, 12);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 4);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-9, -9, 18, 18);
      ctx.fillStyle = '#d62828';
      ctx.fillRect(-2, -6, 4, 12);
      ctx.fillRect(-6, -2, 12, 4);
    }
    ctx.restore();
  }
}

function drawParticles(ctx, world) {
  for (const pt of world.particles) {
    const a = clamp(pt.life / pt.max, 0, 1);
    if (pt.kind === 'explosion') {
      ctx.fillStyle = `rgba(255,${Math.floor(120 + 100 * a)},0,${a})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 60 * (1.6 - a) + 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,220,120,${a})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 30 * (1.4 - a) + 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (pt.kind === 'smoke') {
      ctx.fillStyle = `rgba(60,60,60,${a * 0.5})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 12 + (1 - a) * 14, 0, Math.PI * 2);
      ctx.fill();
    } else if (pt.kind === 'spark') {
      ctx.fillStyle = `rgba(255,220,100,${a})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (pt.kind === 'blood') {
      ctx.fillStyle = `rgba(180,30,30,${a})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Tracers.
  for (const t of world.tracers) {
    ctx.strokeStyle = `rgba(255,230,120,${clamp(t.life / 0.07, 0, 1)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(t.x + Math.cos(t.angle) * t.range, t.y + Math.sin(t.angle) * t.range);
    ctx.stroke();
  }
}

function drawMissionMarker(ctx, world, camera) {
  const m = world.mission;
  if (!m || m.done || m.failed || !m.target) return;
  const t = m.target;
  // A pulsing beacon on the ground.
  const pulse = 1 + Math.sin(world.time * 4) * 0.15;
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(t.x, t.y, 34 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffe14d';
  ctx.save();
  ctx.translate(t.x, t.y - 46 - Math.sin(world.time * 3) * 6);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-9, -9, 18, 18);
  ctx.restore();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t.label, t.x, t.y - 58);
  // Edge arrow when the target is off-screen.
  const sx = t.x - camera.x;
  const sy = t.y - camera.y;
  if (sx < 0 || sx > VIEW.width || sy < 0 || sy > VIEW.height) {
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    const ax = cx + Math.cos(angle) * 300;
    const ay = cy + Math.sin(angle) * 220;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawMinimap(ctx, world) {
  const size = 196;
  const x0 = 14;
  const y0 = VIEW.height - size - 14;
  const scale = size / WORLD.width;
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,20,0.78)';
  roundRect(ctx, x0 - 4, y0 - 4, size + 8, size + 8, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.clip();
  ctx.fillStyle = '#22301f';
  ctx.fillRect(x0, y0, size, size);
  // Beach + sea.
  ctx.fillStyle = '#f2ddac';
  ctx.fillRect(x0, y0 + (world.city.beach.y0 * scale), size, size - world.city.beach.y0 * scale);
  ctx.fillStyle = '#3d9db5';
  ctx.fillRect(x0, y0 + (world.city.sea.y0 * scale), size, size - world.city.sea.y0 * scale);
  // Roads.
  ctx.fillStyle = '#9aa0a8';
  for (const rx of world.city.vRoads) ctx.fillRect(x0 + rx * scale - 1, y0, 2, size);
  for (const ry of world.city.hRoads) ctx.fillRect(x0, y0 + ry * scale - 1, size, 2);
  // Mission target.
  const m = world.mission;
  if (m && !m.done && !m.failed && m.target) {
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath();
    ctx.arc(x0 + m.target.x * scale, y0 + m.target.y * scale, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police.
  ctx.fillStyle = '#4da3ff';
  for (const car of world.policeCars) {
    if (car.dead) continue;
    ctx.fillRect(x0 + car.x * scale - 2, y0 + car.y * scale - 2, 4, 4);
  }
  ctx.fillStyle = '#4da3ff';
  for (const cop of world.cops) {
    if (cop.dead) continue;
    ctx.fillRect(x0 + cop.x * scale - 1, y0 + cop.y * scale - 1, 3, 3);
  }
  // Player arrow.
  const p = world.player;
  ctx.save();
  ctx.translate(x0 + p.x * scale, y0 + p.y * scale);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  // District label under the map.
  ctx.fillStyle = 'rgba(10,14,20,0.78)';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const label = districtAt(p.x, p.y);
  const w = ctx.measureText(label).width + 16;
  roundRect(ctx, x0 - 4, y0 - 26, w, 18, 5);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x0 + 4, y0 - 13);
}

function drawHud(ctx, world, muted) {
  const p = world.player;
  // Health + cash, top left.
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  roundRect(ctx, 12, 12, 250, 64, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`LEO VOSS`, 24, 34);
  ctx.fillStyle = '#2ecc71';
  ctx.fillRect(24, 42, 110 * clamp(p.health / 100, 0, 1), 10);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(24, 42, 110, 10);
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(`${Math.ceil(p.health)}`, 140, 52);
  ctx.fillStyle = '#7CFC9A';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`$${money(world.money)}`, 170, 52);
  // Wanted stars, top right.
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  roundRect(ctx, VIEW.width - 216, 12, 204, 44, 8);
  ctx.fill();
  ctx.font = '26px system-ui, sans-serif';
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < world.wanted ? '#ffd23e' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', VIEW.width - 204 + i * 38, 44);
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText(world.wanted > 0 ? 'WANTED' : 'CLEAN', VIEW.width - 204, 24);

  // Mission objective bar, bottom centre.
  const objective = missionObjective(world);
  ctx.font = 'bold 14px system-ui, sans-serif';
  const ow = Math.min(720, ctx.measureText(objective).width + 28);
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  roundRect(ctx, (VIEW.width - ow) / 2, VIEW.height - 44, ow, 30, 8);
  ctx.fill();
  ctx.fillStyle = '#ffe14d';
  ctx.textAlign = 'center';
  ctx.fillText(objective, VIEW.width / 2, VIEW.height - 24);

  // Driving readout.
  if (p.inCar && p.car) {
    const speed = Math.abs(p.car.speed) * 0.22;
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    roundRect(ctx, VIEW.width - 216, VIEW.height - 108, 204, 64, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(speed)}`, VIEW.width - 60, VIEW.height - 66);
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('km/h', VIEW.width - 28, VIEW.height - 66);
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(p.car.model.name, VIEW.width - 204, VIEW.height - 66);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(VIEW.width - 204, VIEW.height - 56, 180 * clamp(p.car.health / 100, 0, 1), 6);
  }

  // Toast message.
  if (world.message) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    const mw = ctx.measureText(world.message).width + 28;
    ctx.fillStyle = 'rgba(10,14,20,0.8)';
    roundRect(ctx, (VIEW.width - mw) / 2, 76, mw, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(world.message, VIEW.width / 2, 97);
  }

  // Controls hint, top centre: white text on a dark pill, readable over
  // road and grass alike.
  const hint = p.inCar
    ? 'W/S drive · A/D steer · Space handbrake · E exit · M job · P pause'
    : 'WASD move · Shift run · E enter car · Click shoot · M job · P pause';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const hintW = ctx.measureText(hint).width;
  ctx.fillStyle = 'rgba(10,14,20,0.65)';
  roundRect(ctx, VIEW.width / 2 - hintW / 2 - 10, 6, hintW + 20, 20, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(hint, VIEW.width / 2, 20);
  if (muted) {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText('MUTED (N)', VIEW.width - 14, VIEW.height - 120);
  }
  drawMinimap(ctx, world);
}

/** The crosshair, drawn at the mouse when on foot. */
function drawCrosshair(ctx, world, mouse) {
  if (world.player.inCar) return;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(mouse.x, mouse.y, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mouse.x - 14, mouse.y);
  ctx.lineTo(mouse.x - 6, mouse.y);
  ctx.moveTo(mouse.x + 6, mouse.y);
  ctx.lineTo(mouse.x + 14, mouse.y);
  ctx.moveTo(mouse.x, mouse.y - 14);
  ctx.lineTo(mouse.x, mouse.y - 6);
  ctx.moveTo(mouse.x, mouse.y + 6);
  ctx.lineTo(mouse.x, mouse.y + 14);
  ctx.stroke();
}

/** Draw the live game: world, then HUD. */
export function drawGame(ctx, world, camera, mouse, muted) {
  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));
  drawCity(ctx, world, camera);
  drawPickups(ctx, world);
  drawMissionMarker(ctx, world, camera);
  const cars = [...world.cars, ...world.policeCars];
  const p = world.player;
  for (const car of cars) {
    if (car.dead && car.burnTimer <= 0) continue;
    const highlight = !p.inCar && car.kind !== 'police' && Math.hypot(car.x - p.x, car.y - p.y) < 78;
    drawCarShape(ctx, car, highlight);
  }
  for (const ped of world.peds) drawPersonShape(ctx, ped, false);
  for (const gull of world.gulls) drawPersonShape(ctx, gull, false);
  for (const cop of world.cops) drawPersonShape(ctx, cop, false);
  if (world.mara) {
    const mara = { ...world.mara, kind: 'mara', state: world.mara.state === 'safe' ? 'down' : 'walk' };
    if (world.mara.state !== 'inCar') drawPersonShape(ctx, mara, false);
  }
  if (!p.inCar) drawPersonShape(ctx, { ...p, kind: 'player', shirt: '#f4f1de', skin: '#e0ac69' }, true);
  drawParticles(ctx, world);
  ctx.restore();
  drawHud(ctx, world, muted);
  drawCrosshair(ctx, world, mouse);
}

// ---------------------------------------------------------------- menus

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,12,20,0.82)';
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,225,77,0.7)';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 12);
  ctx.stroke();
}

function titleText(ctx, text, y, size, color) {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, VIEW.width / 2, y);
}

export function drawTitle(ctx, save, storyComplete, completedMissions) {
  ctx.fillStyle = '#1b2a4a';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  // Sun-soaked skyline backdrop.
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  grad.addColorStop(0, '#ff9e5e');
  grad.addColorStop(0.55, '#f7c873');
  grad.addColorStop(1, '#3d9db5');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(1020, 130, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(30,40,60,0.85)';
  const skyline = [120, 200, 150, 260, 180, 300, 140, 230, 280, 170, 240, 190];
  let sx = 0;
  for (const h of skyline) {
    ctx.fillRect(sx, VIEW.height - 210 - h, 110, 210 + h);
    sx += 108;
  }
  ctx.fillStyle = 'rgba(20,30,50,0.9)';
  ctx.fillRect(0, VIEW.height - 120, VIEW.width, 120);
  ctx.fillStyle = '#f5d76e';
  for (let x = 20; x < VIEW.width; x += 60) ctx.fillRect(x, VIEW.height - 62, 30, 4);

  titleText(ctx, 'SOLMAR BAY', 168, 92, '#fff');
  titleText(ctx, 'an open-world crime story', 212, 26, '#ffe14d');
  ctx.font = '16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText('Leo Voss is out of the life. His sister Mara is not. Five jobs, one city, no way back.', VIEW.width / 2, 252);
  ctx.fillText('Steal cars. Outrun the Solmar Bay PD. Finish the story.', VIEW.width / 2, 278);

  panel(ctx, VIEW.width / 2 - 330, 320, 660, 250);
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe14d';
  ctx.fillText('HOW TO PLAY', VIEW.width / 2, 352);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  const lines = [
    'WASD / arrows — move on foot · Shift — run · E — enter / exit a car',
    'W / S — drive · A / D — steer · Space — handbrake',
    'Mouse — aim · Click — shoot the pistol',
    'M — start the next job · P — pause · N — mute · F5 — save',
    'Watch the wanted stars: the PD sends more cars the hotter you get.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 384 + i * 26));

  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = '#ffe14d';
  ctx.fillText(save ? 'ENTER — Continue your story' : 'ENTER — New story', VIEW.width / 2, 606);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  if (save) {
    ctx.fillText(`Save found: $${money(save.money)} · ${completedMissions} of 5 jobs done${storyComplete ? ' · story complete' : ''}`, VIEW.width / 2, 634);
  } else {
    ctx.fillText('No save yet — a fresh start in Solmar Bay.', VIEW.width / 2, 634);
  }
  ctx.fillText('A fully original game. Solmar Bay, its people and its story are invented for this game.', VIEW.width / 2, 692);
}

export function drawPause(ctx, world) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  panel(ctx, VIEW.width / 2 - 260, 190, 520, 300);
  titleText(ctx, 'PAUSED', 250, 40, '#ffe14d');
  ctx.font = '16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(`Cash: $${money(world.money)}   Jobs done: ${world.completedMissions} / 5`, VIEW.width / 2, 300);
  ctx.fillText(`Cars stolen: ${world.stats.carsStolen}   Takedowns: ${world.stats.kills}`, VIEW.width / 2, 328);
  ctx.fillText(`Distance driven & run: ${Math.round(world.stats.distance / 1000)} km`, VIEW.width / 2, 356);
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillStyle = '#ffe14d';
  ctx.fillText('P — resume · S — save now · Q — quit to title', VIEW.width / 2, 420);
}

export function drawBusted(ctx, fine) {
  ctx.fillStyle = 'rgba(10,20,60,0.75)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  titleText(ctx, 'BUSTED', 300, 80, '#4da3ff');
  ctx.font = '18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(`The Solmar Bay PD caught you. Fine: $${money(fine)} — released at Doc's Clinic.`, VIEW.width / 2, 350);
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = '#ffe14d';
  ctx.fillText('ENTER — back on the streets', VIEW.width / 2, 420);
}

export function drawWasted(ctx, bill) {
  ctx.fillStyle = 'rgba(40,0,0,0.75)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  titleText(ctx, 'WASTED', 300, 80, '#e74c3c');
  ctx.font = '18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(`You flatlined in Solmar Bay. Hospital bill: $${money(bill)} — patched up at Doc's Clinic.`, VIEW.width / 2, 350);
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = '#ffe14d';
  ctx.fillText('ENTER — back on the streets', VIEW.width / 2, 420);
}

export function drawMissionComplete(ctx, world) {
  const m = world.mission;
  if (!m) return;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  panel(ctx, VIEW.width / 2 - 320, 220, 640, 240);
  titleText(ctx, 'JOB COMPLETE', 280, 40, '#2ecc71');
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(m.def.title, VIEW.width / 2, 330);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText(`Reward: $${money(m.def.reward)}   ·   Jobs done: ${world.completedMissions} / 5`, VIEW.width / 2, 366);
  if (world.storyComplete) {
    ctx.fillStyle = '#ffe14d';
    ctx.fillText('STORY COMPLETE — Solmar Bay is yours. Free roam, Leo.', VIEW.width / 2, 398);
  }
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillStyle = '#ffe14d';
  ctx.fillText('ENTER — keep playing', VIEW.width / 2, 434);
}
