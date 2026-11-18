// Synthesised sound for Solmar Bay: every effect and the music loop are built
// from WebAudio oscillators and filtered noise, so the game ships no audio
// files at all. All calls are safe before any user gesture — the context is
// created lazily on the first unlock() and every play is guarded.
let ctx = null;
let master = null;
let musicGain = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenTimer = 0;
let musicTimer = null;
let musicStep = 0;
let muted = false;

/** Create/resume the audio context. Call from any user gesture. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 500;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineOsc.start();
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenGain.connect(master);
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenOsc.connect(sirenGain);
      sirenOsc.start();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // No audio in this environment; the game plays silent.
  }
}

export function toggleMute() {
  muted = !muted;
  if (master && ctx) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

export function isMuted() {
  return muted;
}

function blip(freq, dur, type, vol, slideTo) {
  if (!ctx || muted) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {
    // ignore
  }
}

function noiseBurst(dur, vol, filterFreq) {
  if (!ctx || muted) return;
  try {
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
  } catch {
    // ignore
  }
}

export const sfx = {
  click() {
    blip(660, 0.06, 'square', 0.12);
  },
  pickup() {
    blip(880, 0.1, 'sine', 0.2, 1320);
  },
  cash() {
    blip(1046, 0.08, 'sine', 0.2);
    setTimeout(() => blip(1318, 0.12, 'sine', 0.2), 70);
  },
  gunshot() {
    noiseBurst(0.12, 0.5, 1800);
    blip(160, 0.1, 'square', 0.25, 60);
  },
  hit() {
    blip(220, 0.08, 'square', 0.18, 110);
  },
  crash() {
    noiseBurst(0.25, 0.45, 700);
  },
  explosion() {
    noiseBurst(0.7, 0.7, 400);
    blip(90, 0.6, 'sine', 0.5, 30);
  },
  sirenBlip() {
    blip(900, 0.15, 'triangle', 0.15, 1200);
  },
  mission() {
    blip(523, 0.12, 'sine', 0.22);
    setTimeout(() => blip(659, 0.12, 'sine', 0.22), 110);
    setTimeout(() => blip(784, 0.22, 'sine', 0.25), 220);
  },
  fail() {
    blip(330, 0.25, 'sawtooth', 0.2, 165);
  },
  busted() {
    blip(440, 0.2, 'square', 0.2, 220);
    setTimeout(() => blip(440, 0.2, 'square', 0.2, 220), 250);
  },
  horn() {
    blip(370, 0.18, 'square', 0.15);
  },
};

/** Engine hum follows speed 0..1; call every frame while driving. */
export function setEngine(speed01, on) {
  if (!ctx || !engineOsc || !engineGain) return;
  try {
    const target = on ? 0.05 + speed01 * 0.09 : 0;
    engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.08);
    engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.1);
  } catch {
    // ignore
  }
}

/** Police siren: two-tone wail while any cop chases. Call every frame. */
export function setSiren(on, dt) {
  if (!ctx || !sirenOsc || !sirenGain) return;
  try {
    if (on) {
      sirenTimer += dt;
      const up = Math.floor(sirenTimer * 1.6) % 2 === 0;
      sirenOsc.frequency.setTargetAtTime(up ? 780 : 580, ctx.currentTime, 0.05);
      sirenGain.gain.setTargetAtTime(muted ? 0 : 0.045, ctx.currentTime, 0.2);
    } else {
      sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    }
  } catch {
    // ignore
  }
}

// A lazy, sun-soaked cruise groove: a bass line in A minor with a hat tick,
// scheduled a bar ahead. Starts on first unlock, stops never.
const BASS = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 82.41, 0];
const LEAD = [220, 0, 261.63, 0, 329.63, 0, 261.63, 0, 196, 0, 246.94, 0, 293.66, 0, 329.63, 0];

export function startMusic() {
  if (!ctx || musicTimer) return;
  try {
    musicTimer = setInterval(() => {
      if (muted || !ctx) return;
      const stepDur = 0.21;
      const t0 = ctx.currentTime + 0.05;
      for (let i = 0; i < 4; i += 1) {
        const step = (musicStep + i) % 16;
        const t = t0 + i * stepDur;
        const bass = BASS[step];
        if (bass) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = bass;
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.9);
          osc.connect(gain);
          gain.connect(musicGain);
          osc.start(t);
          osc.stop(t + stepDur);
        }
        if (musicStep % 2 === 0 && LEAD[step]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = LEAD[step];
          gain.gain.setValueAtTime(0.12, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.4);
          osc.connect(gain);
          gain.connect(musicGain);
          osc.start(t);
          osc.stop(t + stepDur * 1.5);
        }
      }
      musicStep = (musicStep + 4) % 16;
    }, 840);
  } catch {
    // ignore
  }
}
