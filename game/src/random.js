// Seeded randomness for Solmar Bay. The city, the traffic and the screenshot
// scenes all draw from this, so the same seed always builds the same city and
// the same frame — playtests and screenshots are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRandom(seed) {
  const next = mulberry32(seed);
  return {
    next,
    /** Integer in [min, max). */
    int(min, max) {
      return min + Math.floor(next() * (max - min));
    },
    /** Float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** One element of an array. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
  };
}

/** Clamp a value into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Shortest signed angular difference, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance between two points. */
export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Format dollars with a thousands separator, e.g. 2,500. */
export function money(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Format seconds as M:SS. */
export function clock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
