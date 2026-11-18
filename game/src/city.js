// The city of Solmar Bay: a sun-soaked coastal grid, generated once from a
// seed. Roads run on a regular pitch; each block holds buildings, a park, a
// beach strip or the docks. The road graph (intersections + edges) is what
// traffic and police drive on. Nothing here is from any commercial game:
// Solmar Bay, its streets and its landmarks are invented for this game.
import { WORLD } from './config.js';
import { clamp, makeRandom } from './random.js';

export const DISTRICTS = {
  downtown: { x0: 1260, y0: 840, x1: 2340, y1: 1920, label: 'Downtown' },
  beach: { x0: 0, y0: 3060, x1: 3600, y1: 3600, label: 'Solmar Beach' },
  docks: { x0: 0, y0: 0, x1: 840, y1: 840, label: 'The Docks' },
  marina: { x0: 2760, y0: 0, x1: 3600, y1: 840, label: 'Marina' },
  park: { x0: 1260, y0: 2100, x1: 2100, y1: 2940, label: 'Palm Park' },
};

export const LANDMARKS = [
  { name: "Kessler's Garage", x: 1470, y: 1050, kind: 'garage' },
  { name: 'Solmar Bank', x: 1890, y: 1470, kind: 'bank' },
  { name: 'The Gull Warehouse', x: 420, y: 420, kind: 'warehouse' },
  { name: 'Hotel Azure', x: 2310, y: 1890, kind: 'hotel' },
  { name: 'Safehouse', x: 3150, y: 3150, kind: 'safehouse' },
  { name: 'Beach Hideout', x: 630, y: 3360, kind: 'hideout' },
  { name: "Doc's Clinic", x: 2730, y: 2310, kind: 'clinic' },
  { name: 'Palm Park', x: 1680, y: 2520, kind: 'park' },
];

const STREET_NAMES_V = ['Coral Ave', 'Palm Row', 'Gull St', 'Harbor Way', 'Sunset Blvd', 'Marina Dr', 'Cactus Ln', 'Bay St'];
const STREET_NAMES_H = ['Ocean Dr', 'Seaside Ave', 'Anchor St', 'Lime St', 'Tradewind Rd', 'Fiesta Ave', 'Coral Way', 'Dune St'];

const BUILDING_PALETTE = [
  '#e8b04b', '#d97b4f', '#c96f5e', '#7fb069', '#5b8db2', '#b08968',
  '#e07a5f', '#81b29a', '#f2cc8f', '#a98467', '#6d9dc5', '#e9c46a',
];
const ROOF_PALETTE = ['#8d5a3b', '#5c6650', '#7a6a53', '#4a5d6b', '#9c6644'];

/**
 * Build the city for a seed. Returns roads, blocks, buildings, the road graph
 * and helpers the simulation uses to stay on the streets.
 */
export function buildCity(seed) {
  const rng = makeRandom(seed);
  const pitch = WORLD.block;
  const road = WORLD.road;
  const half = road / 2;

  // Vertical and horizontal road centrelines.
  const vRoads = [];
  const hRoads = [];
  for (let x = pitch / 2; x < WORLD.width; x += pitch) vRoads.push(x);
  for (let y = pitch / 2; y < WORLD.height; y += pitch) hRoads.push(y);

  const buildings = [];
  const parks = [];
  const trees = [];
  const beach = { x0: 0, y0: WORLD.height - 300, x1: WORLD.width, y1: WORLD.height };
  const sea = { x0: 0, y0: WORLD.height - 90, x1: WORLD.width, y1: WORLD.height };

  // One block per grid cell between roads.
  for (let ci = 0; ci < vRoads.length - 1; ci += 1) {
    for (let ri = 0; ri < hRoads.length - 1; ri += 1) {
      const x0 = vRoads[ci] + half + WORLD.sidewalk;
      const y0 = hRoads[ri] + half + WORLD.sidewalk;
      const x1 = vRoads[ci + 1] - half - WORLD.sidewalk;
      const y1 = hRoads[ri + 1] - half - WORLD.sidewalk;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      // The beach strip and the park stay open.
      if (y0 > beach.y0 - 60) continue;
      if (cx > DISTRICTS.park.x0 && cx < DISTRICTS.park.x1 && cy > DISTRICTS.park.y0 && cy < DISTRICTS.park.y1) {
        parks.push({ x0, y0, x1, y1 });
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20), r: rng.range(9, 15) });
        }
        continue;
      }
      const downtown = cx > DISTRICTS.downtown.x0 && cx < DISTRICTS.downtown.x1 && cy > DISTRICTS.downtown.y0 && cy < DISTRICTS.downtown.y1;
      const tall = downtown && rng.chance(0.55);
      const w = rng.range(90, Math.min(190, x1 - x0 - 30));
      const h = rng.range(90, Math.min(190, y1 - y0 - 30));
      const bx = cx - w / 2 + rng.range(-14, 14);
      const by = cy - h / 2 + rng.range(-14, 14);
      buildings.push({
        x: bx, y: by, w, h,
        color: rng.pick(BUILDING_PALETTE),
        roof: rng.pick(ROOF_PALETTE),
        height: tall ? rng.int(3, 6) : rng.int(1, 3),
        downtown,
      });
      // A second small building in roomy blocks.
      if (x1 - x0 > 260 && y1 - y0 > 260 && rng.chance(0.5)) {
        const w2 = rng.range(60, 100);
        const h2 = rng.range(60, 100);
        buildings.push({
          x: cx + rng.range(40, 110) - w2 / 2, y: cy + rng.range(40, 110) - h2 / 2,
          w: w2, h: h2,
          color: rng.pick(BUILDING_PALETTE), roof: rng.pick(ROOF_PALETTE),
          height: 1, downtown: false,
        });
      }
      for (let t = 0; t < 3; t += 1) {
        trees.push({ x: rng.range(x0 + 14, x1 - 14), y: rng.range(y0 + 14, y1 - 14), r: rng.range(7, 11) });
      }
    }
  }

  // Road graph: intersections are nodes; edges run along roads.
  const nodes = [];
  const nodeId = new Map();
  const key = (x, y) => `${x},${y}`;
  for (const x of vRoads) {
    for (const y of hRoads) {
      nodeId.set(key(x, y), nodes.length);
      nodes.push({ x, y });
    }
  }
  const edges = new Map(); // node id -> [{to, x, y}]
  const addEdge = (a, b) => {
    if (!edges.has(a)) edges.set(a, []);
    edges.get(a).push(b);
  };
  for (let i = 0; i < vRoads.length; i += 1) {
    for (let j = 0; j < hRoads.length - 1; j += 1) {
      const a = nodeId.get(key(vRoads[i], hRoads[j]));
      const b = nodeId.get(key(vRoads[i], hRoads[j + 1]));
      addEdge(a, b);
      addEdge(b, a);
    }
  }
  for (let j = 0; j < hRoads.length; j += 1) {
    for (let i = 0; i < vRoads.length - 1; i += 1) {
      const a = nodeId.get(key(vRoads[i], hRoads[j]));
      const b = nodeId.get(key(vRoads[i + 1], hRoads[j]));
      addEdge(a, b);
      addEdge(b, a);
    }
  }

  const city = {
    seed, vRoads, hRoads, buildings, parks, trees, beach, sea,
    nodes, edges, streetV: STREET_NAMES_V, streetH: STREET_NAMES_H,
  };
  return city;
}

/** True when the point is on a road (not on a block). */
export function onRoad(city, x, y) {
  const half = WORLD.road / 2;
  for (const rx of city.vRoads) if (Math.abs(x - rx) <= half) return true;
  for (const ry of city.hRoads) if (Math.abs(y - ry) <= half) return true;
  return false;
}

/** True when the point is inside a building (with a small margin). */
export function insideBuilding(city, x, y, margin = 0) {
  for (const b of city.buildings) {
    if (x > b.x - margin && x < b.x + b.w + margin && y > b.y - margin && y < b.y + b.h + margin) return b;
  }
  return null;
}

/** True when the straight segment between two points stays clear of buildings. */
export function clearPath(city, x1, y1, x2, y2, margin = 24) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(d / 20));
  for (let i = 0; i <= steps; i += 1) {
    const x = x1 + ((x2 - x1) * i) / steps;
    const y = y1 + ((y2 - y1) * i) / steps;
    if (insideBuilding(city, x, y, margin)) return false;
  }
  return true;
}

/** Nearest intersection node to a point. */
export function nearestNode(city, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < city.nodes.length; i += 1) {
    const n = city.nodes[i];
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Push a circle out of buildings and the world edge. Returns corrected x, y. */
export function resolveBuildingCollision(city, x, y, radius) {
  for (const b of city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        y = cy + (dy / d) * radius;
      } else {
        // Dead centre: push out along the smallest penetration axis.
        const left = x - (b.x - radius);
        const right = b.x + b.w + radius - x;
        const top = y - (b.y - radius);
        const bottom = b.y + b.h + radius - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - radius;
        else if (m === right) x = b.x + b.w + radius;
        else if (m === top) y = b.y - radius;
        else y = b.y + b.h + radius;
      }
    }
  }
  x = clamp(x, radius + 4, WORLD.width - radius - 4);
  y = clamp(y, radius + 4, WORLD.height - radius - 4);
  return { x, y };
}

/** A random point on a road, for spawning cars and pedestrians. */
export function randomRoadPoint(city, rng) {
  if (rng.chance(0.5)) {
    const x = rng.pick(city.vRoads) + rng.range(-28, 28);
    const y = rng.range(60, WORLD.height - 60);
    return { x, y, angle: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 };
  }
  const x = rng.range(60, WORLD.width - 60);
  const y = rng.pick(city.hRoads) + rng.range(-28, 28);
  return { x, y, angle: rng.chance(0.5) ? 0 : Math.PI };
}

/** A random sidewalk point, for pedestrians. */
export function randomSidewalkPoint(city, rng) {
  const vertical = rng.chance(0.5);
  if (vertical) {
    const x = rng.pick(city.vRoads) + (rng.chance(0.5) ? 1 : -1) * (WORLD.road / 2 + WORLD.sidewalk / 2);
    return { x, y: rng.range(60, WORLD.height - 340) };
  }
  const y = rng.pick(city.hRoads) + (rng.chance(0.5) ? 1 : -1) * (WORLD.road / 2 + WORLD.sidewalk / 2);
  return { x: rng.range(60, WORLD.width - 60), y };
}

/**
 * A sidewalk line a pedestrian strolls along: one side of one road. Peds
 * keep to their line, so they cross roads only when they flee.
 */
export function randomSidewalkLine(city, rng) {
  if (rng.chance(0.5)) {
    return { axis: 'v', coord: rng.pick(city.vRoads), side: rng.chance(0.5) ? 1 : -1 };
  }
  return { axis: 'h', coord: rng.pick(city.hRoads), side: rng.chance(0.5) ? 1 : -1 };
}

/** A point on a sidewalk line. */
export function pointOnSidewalkLine(city, rng, line) {
  const off = (WORLD.road / 2 + WORLD.sidewalk / 2) * line.side;
  if (line.axis === 'v') return { x: line.coord + off, y: rng.range(60, WORLD.height - 340) };
  return { x: rng.range(60, WORLD.width - 60), y: line.coord + off };
}

/** A point on a sidewalk line at a given along-road coordinate. */
export function sidewalkLinePoint(line, along) {
  const off = (WORLD.road / 2 + WORLD.sidewalk / 2) * line.side;
  if (line.axis === 'v') return { x: line.coord + off, y: clamp(along, 60, WORLD.height - 340) };
  return { x: clamp(along, 60, WORLD.width - 60), y: line.coord + off };
}
