'use client';
// Prosedürel ses — Web Audio ile sentezlenir, DOSYA YOK.
// Neden: sıfır asset, sıfır lisans riski, sıfır indirme boyutu ve retro estetiğe
// birebir uyuyor. Bir sürü oyununda 400 düşman ölürken dosya çalmak zaten çökerdi.
//
// KRİTİK: kısma (throttle) olmadan bu modül oyunu kilitler. Saniyede 200 ölüm
// = 200 oscillator = ses çamuru + CPU patlaması. Her sesin kendi minimum aralığı var.

type Voice = 'hit' | 'kill' | 'gem' | 'levelup' | 'evolve' | 'boss' | 'hurt' | 'chest';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let unlocked = false;

/** Her sesin en son çalındığı an (ms) — kısma için */
const lastPlayed: Record<string, number> = {};
/** Aynı sesin iki çalınışı arasındaki minimum süre (ms) */
const THROTTLE: Record<Voice, number> = {
  hit: 45, kill: 55, gem: 70, levelup: 0, evolve: 0, boss: 0, hurt: 180, chest: 0,
};

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** Tarayıcı otomatik oynatmayı engeller — ilk kullanıcı hareketinde çağrılmalı */
export function unlockAudio() {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
}

export function setSoundEnabled(on: boolean) { enabled = on; }
export function isSoundEnabled() { return enabled; }

/** Tek osilatör notası */
function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
  const c = ctx!;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  // hızlı atak + üstel sönüm: "tık" değil "vuruş" hissi
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master!);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Gürültü patlaması (ölüm/darbe için) */
function noise(dur: number, vol: number, filterHz: number, delay = 0) {
  const c = ctx!;
  const t0 = c.currentTime + delay;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  // deterministik gürültü — Math.random KULLANMA kuralı sese de uygulanıyor
  let s = 22222;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    data[i] = (s / 4294967296) * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.value = filterHz;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(master!);
  src.start(t0);
}

export function play(v: Voice) {
  if (!enabled || !unlocked) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;

  const now = performance.now();
  const gap = THROTTLE[v];
  if (gap > 0 && now - (lastPlayed[v] ?? -1e9) < gap) return;
  lastPlayed[v] = now;

  switch (v) {
    case 'hit':   tone(760, 0.05, 'square', 0.08, 520); break;
    case 'kill':  noise(0.11, 0.16, 1500); tone(180, 0.09, 'triangle', 0.09, 90); break;
    case 'gem':   tone(1180, 0.055, 'sine', 0.07, 1560); break;
    case 'hurt':  tone(150, 0.2, 'sawtooth', 0.2, 60); noise(0.14, 0.14, 700); break;
    case 'chest': [880, 1180, 1560].forEach((f, i) => tone(f, 0.12, 'sine', 0.11, undefined, i * 0.05)); break;
    case 'levelup': [520, 660, 780, 1040].forEach((f, i) => tone(f, 0.14, 'square', 0.10, undefined, i * 0.055)); break;
    case 'boss':  tone(70, 0.9, 'sawtooth', 0.24, 42); noise(0.7, 0.14, 320); break;
    case 'evolve':
      // yükselen akor + parlama: run'ın en büyük anı, ses de öyle olmalı
      [392, 494, 587, 784, 988].forEach((f, i) => tone(f, 0.6, 'triangle', 0.13, undefined, i * 0.07));
      tone(1568, 1.0, 'sine', 0.09, 3136, 0.34);
      noise(0.5, 0.1, 4000, 0.3);
      break;
  }
}
