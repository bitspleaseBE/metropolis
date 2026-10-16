/**
 * A quiet street bed: filtered noise, and a tram bell now and then.
 * No clips. Starts on the first play gesture, and follows the Sound toggle.
 */

const SOUND_KEY = "metropolis-sound";

export function soundEnabled() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

export function createAmbience() {
  let ctx = null;
  let master = null;
  let bellTimer = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    const bed = ctx.createBufferSource();
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let v = 0;
    for (let i = 0; i < data.length; i++) {
      v = v * 0.98 + (Math.random() * 2 - 1) * 0.02;
      data[i] = v;
    }
    bed.buffer = noise;
    bed.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 280;
    bed.connect(low).connect(master);
    master.connect(ctx.destination);
    bed.start();
    return ctx;
  }

  function level(on) {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.linearRampToValueAtTime(on ? 0.05 : 0, t + 0.2);
  }

  function bell() {
    if (!ctx || !soundEnabled()) return;
    const t = ctx.currentTime + 0.02;
    for (const [f, at] of [[784, 0], [988, 0.18]]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.12, t + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.35);
      osc.connect(g).connect(master);
      osc.start(t + at);
      osc.stop(t + at + 0.4);
    }
  }

  function start() {
    if (!soundEnabled()) return;
    const c = ensure();
    if (!c) return;
    void c.resume();
    level(true);
    if (!bellTimer) bellTimer = window.setInterval(bell, 28000 + Math.random() * 14000);
  }

  window.addEventListener("metropolis-sound", (e) => {
    if (e.detail) start();
    else level(false);
  });

  return { start };
}
