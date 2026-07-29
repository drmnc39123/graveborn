// Seeded RNG — mulberry32. Aynı seed = aynı run.
// NEDEN: leaderboard adaleti (herkes aynı günlük seed'i oynar) + hata ayıklamada
// bir run'ı birebir tekrar üretebilmek. Math.random() ASLA kullanılmaz.

export interface Rng {
  /** [0,1) */
  next(): number;
  /** [min,max) float */
  range(min: number, max: number): number;
  /** [min,max] integer */
  int(min: number, max: number): number;
  /** diziden rastgele eleman */
  pick<T>(arr: readonly T[]): T;
  /** yerinde karıştır (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[];
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const range = (min: number, max: number) => min + next() * (max - min);
  const int = (min: number, max: number) => Math.floor(range(min, max + 1));
  return {
    next,
    range,
    int,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

/** Metinden deterministik seed (günlük seed: "2026-07-30" → sabit sayı) */
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
