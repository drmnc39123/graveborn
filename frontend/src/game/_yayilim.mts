import { Game } from './engine.js';
import { STAGES, TICK } from './config.js';
import { FORGE, permanentBonus } from './forge.js';
import { emptyProgress } from './progress.js';
import { seedFromString } from './rng.js';
import { unlockedWeapons } from './unlocks.js';

function flee(g: Game): [number, number] {
  let vx = 0, vy = 0;
  for (const e of g.enemies) {
    const dx = g.px - e.x, dy = g.py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 300) { vx += dx / d * 1.4; vy += dy / d * 1.4; }
  }
  const dist = Math.hypot(g.px, g.py);
  if (dist > 2100) { vx += -g.px / dist * 0.6; vy += -g.py / dist * 0.6; }
  return [vx, vy];
}
function pick(g: Game): string {
  const p = (o: { kind: string; level?: number; stat?: string }) => {
    if (o.kind === 'weapon') return o.level ? 100 : 90;
    const s = o.stat;
    if (s === 'might') return 80;
    if (s === 'maxHp' || s === 'armor') return 70;
    if (s === 'cooldown') return 65;
    return 40;
  };
  return [...g.offers].sort((a, b) => p(b as never) - p(a as never))[0].id;
}
function permFor(stageId: number) {
  const oran = Math.min(1, stageId / 20);
  const lv: Record<string, number> = {};
  for (const u of FORGE) lv[u.id] = Math.floor(u.maxLevel * oran);
  return permanentBonus(lv);
}
function sure(sid: number, k: number) {
  const st = STAGES.find((s) => s.id === sid)!;
  const ilerleme = { ...emptyProgress(),
    cleared: Object.fromEntries(STAGES.filter((x) => x.id < sid).map((x) => [x.id, true])) };
  const g = new Game(seedFromString(`camp-${sid}-${k}`), st, permFor(sid) as never,
    'campaign', undefined, 1, 0, unlockedWeapons(ilerleme));
  g.setViewport(1280, 720);
  for (let i = 0; i < Math.round(900 / TICK); i++) {
    if (g.phase === 'levelup') { g.choose(pick(g)); continue; }
    if (g.phase !== 'running') break;
    g.hp = g.stats.maxHp;
    g.setInput(...flee(g));
    g.step();
  }
  return g.phase === 'won' ? g.time / 60 : Infinity;
}
const sid = Number(process.argv[2]);
const v: number[] = [];
for (let k = 0; k < 9; k++) v.push(sure(sid, k));
const b = v.filter((x) => isFinite(x)).sort((a, b) => a - b);
const ilk3 = [v[0], v[1], v[2]].filter((x) => isFinite(x)).sort((a, b) => a - b);
console.log(`b${sid}: ${v.map((x) => isFinite(x) ? x.toFixed(1) : '∞').join(' ')}`);
console.log(`  ortanca(9)=${b.length ? b[Math.floor(b.length / 2)].toFixed(1) : '-'} · ortanca(ilk3)=${ilk3.length ? ilk3[Math.floor(ilk3.length / 2)].toFixed(1) : '-'} · aralık ${b.length ? b[0].toFixed(1) + '–' + b[b.length - 1].toFixed(1) : '-'}`);
