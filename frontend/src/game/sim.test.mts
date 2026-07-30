// Headless simülasyon testi — motorun DOM'suz çalıştığını ve dengenin
// çalıştığını kanıtlar. AYNI ZAMANDA mimari kanıtı: bu kod sunucuda koşabilir,
// yani Faz 4'te ödül doğrulaması için ikinci bir simülasyon yazmak gerekmez.
//
// Çalıştır:  npx tsx src/game/sim.test.mts
//
// DİKKAT: ölçüm testlerinde oyuncu ÖLMEMELİ. Ölünce step() no-op olur ve
// test hiçbir şey ölçmediği hâlde "geçer". İlk sürümde tam bu tuzağa düşüldü.

import { Game } from './engine.js';
import { MAX_WEAPONS, SPAWN, TICK, WEAPONS } from './config.js';
import { seedFromString } from './rng.js';

const FAIL: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) FAIL.push(name);
};

type Driver = 'circle' | 'flee';

/** Kaçış yapay zekâsı — yakındaki düşmanların ortalamasından uzaklaşır (insan davranışı proxy'si) */
function fleeInput(g: Game): [number, number] {
  let ax = 0, ay = 0, n = 0;
  for (const e of g.enemies) {
    const dx = e.x - g.px, dy = e.y - g.py;
    const d2 = dx * dx + dy * dy;
    if (d2 > 260 * 260) continue;
    const d = Math.sqrt(d2) || 1;
    ax += dx / d / d; ay += dy / d / d; // yakın olan daha çok iter
    n++;
  }
  if (!n) return [0, 0];
  // tehditten uzaklaş; arena kenarındaysa merkeze doğru düzelt
  let vx = -ax, vy = -ay;
  const dist = Math.hypot(g.px, g.py);
  if (dist > 2100) { vx += -g.px / dist * 0.02; vy += -g.py / dist * 0.02; }
  return [vx, vy];
}

interface RunOpts { seconds: number; driver?: Driver; invincible?: boolean }

function run(seed: number, { seconds, driver = 'circle', invincible = false }: RunOpts) {
  const g = new Game(seed);
  g.setViewport(1280, 720);
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks; i++) {
    if (g.phase === 'levelup') g.choose(g.offers[0].id); // deterministik seçim
    if (g.phase !== 'running') break;
    if (invincible) g.hp = g.stats.maxHp; // ölçüm testlerinde ölmesin (public alan, motor kirletilmedi)
    const t = i * TICK;
    if (driver === 'circle') g.setInput(Math.cos(t * 0.7), Math.sin(t * 0.7));
    else g.setInput(...fleeInput(g));
    g.step();
  }
  return g;
}

// ── 1) Determinizm ──
console.log('\n[1] Determinizm');
const SEED = seedFromString('2026-07-30');
const a = run(SEED, { seconds: 60, invincible: true });
const b = run(SEED, { seconds: 60, invincible: true });
check('aynı seed aynı kill', a.kills === b.kills, `${a.kills} = ${b.kills}`);
check('aynı seed aynı level', a.level === b.level, `LV${a.level}`);
check('aynı seed aynı konum', Math.abs(a.px - b.px) < 1e-9 && Math.abs(a.py - b.py) < 1e-9);
const diff = run(seedFromString('baska-seed'), { seconds: 60, invincible: true });
check('farklı seed farklı sonuç', diff.kills !== a.kills, `${diff.kills} vs ${a.kills} kill`);

// ── 2) Çekirdek döngü ──
console.log('\n[2] Çekirdek döngü (60 sn)');
check('düşman doğuyor', a.enemies.length > 0, `${a.enemies.length} canlı`);
check('düşman ölüyor', a.kills > 0, `${a.kills} kill`);
check('mermi uçuyor', a.projectiles.length > 0, `${a.projectiles.length} mermi`);
check('XP/level ilerliyor', a.level > 1, `LV${a.level}`);
check('gold birikiyor', a.gold === a.kills, `${a.gold} gold = ${a.kills} kill`);

// ── 3) Zorluk eğrisi (ölümsüz — yoksa ölüm anında donar ve test yalan söyler) ──
console.log('\n[3] Zorluk eğrisi');
const m1 = run(seedFromString('curve'), { seconds: 60, invincible: true });
const m5 = run(seedFromString('curve'), { seconds: 300, invincible: true });
const m10 = run(seedFromString('curve'), { seconds: 600, invincible: true });
console.log(`     1dk: ${m1.enemies.length} düşman / ${m1.kills} kill / LV${m1.level}`);
console.log(`     5dk: ${m5.enemies.length} düşman / ${m5.kills} kill / LV${m5.level}`);
console.log(`    10dk: ${m10.enemies.length} düşman / ${m10.kills} kill / LV${m10.level}`);
check('baskı zamanla artıyor', m10.enemies.length > m1.enemies.length);
check('kill sayısı zamanla artıyor', m10.kills > m5.kills && m5.kills > m1.kills);
check('level ilerliyor', m10.level > m5.level && m5.level > m1.level);
// Tavan config'den OKUNUR — elle yazılırsa config değişince test sessizce yanlışlar
check('düşman tavanı aşılmıyor', m10.enemies.length <= SPAWN.maxAlive, `${m10.enemies.length}/${SPAWN.maxAlive}`);

// ── 4) Ölüm ──
console.log('\n[4] Ölüm');
const still = new Game(seedFromString('afk'));
still.setViewport(1280, 720);
still.setInput(0, 0);
let deadAt = -1;
for (let i = 0; i < Math.round(180 / TICK); i++) {
  if (still.phase === 'levelup') still.choose(still.offers[0].id);
  still.step();
  if (still.phase === 'dead') { deadAt = still.time; break; }
}
check('hareketsiz oyuncu ölüyor', deadAt > 0, deadAt > 0 ? `${deadAt.toFixed(1)} sn` : 'ölmedi');
check('ölümde HP 0 ve faz dead', still.hp === 0 && still.phase === 'dead');

// ── 5) Arena sınırı ──
console.log('\n[5] Arena sınırı');
const esc = run(1, { seconds: 120, invincible: true });
const dist = Math.hypot(esc.px, esc.py);
check('arena yarıçapı aşılmıyor', dist <= 2400.001, `${dist.toFixed(0)}/2400`);

// ── 6) Oynanabilirlik: kaçan oyuncu ne kadar dayanıyor? ──
console.log('\n[6] Oynanabilirlik (kaçış YZ)');
let survived = 0;
const fl = new Game(seedFromString('playable'));
fl.setViewport(1280, 720);
for (let i = 0; i < Math.round(20 * 60 / TICK); i++) {
  if (fl.phase === 'levelup') fl.choose(fl.offers[0].id);
  if (fl.phase !== 'running') break;
  fl.setInput(...fleeInput(fl));
  fl.step();
  survived = fl.time;
}
console.log(`     kaçış YZ ${survived.toFixed(0)} sn dayandı — LV${fl.level}, ${fl.kills} kill, faz: ${fl.phase}`);
check('basit YZ en az 90 sn dayanıyor (oyun imkânsız değil)', survived >= 90, `${survived.toFixed(0)} sn`);

// ── 7) Performans (ölçüm için ölümsüz + yoğun sahne) ──
console.log('\n[7] Performans');
const perf = run(seedFromString('perf'), { seconds: 12 * 60, driver: 'flee', invincible: true });
console.log(`     12. dk sahnesi: ${perf.enemies.length} düşman, ${perf.projectiles.length} mermi, ${perf.gems.length} mücevher`);
check('yoğun sahne gerçekten oluştu (test boş ölçmüyor)', perf.enemies.length > 150, `${perf.enemies.length} düşman`);
perf.hp = 1e9; // ölçüm sırasında ölmesin
const N = 1200;
const t0 = performance.now();
for (let i = 0; i < N; i++) { perf.hp = 1e9; perf.step(); }
const perTick = (performance.now() - t0) / N;
const budget = TICK * 1000;
check('tick maliyeti frame bütçesinin %25 altında', perTick < budget * 0.25,
  `${perTick.toFixed(3)} ms/tick (bütçe ${budget.toFixed(1)} ms → %${((perTick / budget) * 100).toFixed(1)})`);

// ── 8) Silah sistemi: dört desen de gerçekten hasar veriyor mu ──
// Her deseni İZOLE test et — biri sessizce çalışmazsa 20 dk oynayana kadar fark edilmez.
console.log('\n[8] Silah desenleri');
function patternDamages(id: string): { dealt: boolean; hp: number } {
  const g = new Game(seedFromString(`pat-${id}`));
  g.setViewport(1280, 720);
  const def = WEAPONS.find((w) => w.id === id)!;
  g.weapons = [{ def, level: 1, cd: 0 }]; // sadece test edilen silah

  // Kuklayı DESENİN ETKİLİ MESAFESİNE koy. Yörünge silahı halka üzerinde vurur;
  // sabit 40 px'e koyunca orb'lar kuklanın dışından geçiyordu ve test "hasar yok"
  // diyordu — bu VS'teki King Bible davranışının aynısı, hata değil.
  const dist =
    def.pattern === 'orbit' ? (def.orbitRadius ?? 78) :
    def.pattern === 'aura' ? (def.auraRadius ?? 70) * 0.6 :
    40;

  const dummy = {
    x: dist, y: 0, hp: 1e6, maxHp: 1e6, speed: 0, damage: 0, radius: 12, xp: 0,
    color: '#fff', hitFlash: 0, animT: 0, facingRight: true, contactCd: 0,
  };
  g.enemies.push(dummy as any);
  g.setInput(0, 0);
  for (let i = 0; i < Math.round(3 / TICK); i++) {
    if (g.phase === 'levelup') g.choose(g.offers[0].id);
    g.hp = g.stats.maxHp; // kukla dışı spawn'lar oyuncuyu öldürmesin
    dummy.x = g.px + dist; dummy.y = g.py; // menzilde tut
    g.step();
  }
  return { dealt: dummy.hp < 1e6, hp: dummy.hp };
}
for (const id of ['shard', 'lash', 'litany', 'ward']) {
  const r = patternDamages(id);
  const def = WEAPONS.find((w) => w.id === id)!;
  check(`${def.name} (${def.pattern}) hasar veriyor`, r.dealt, `3 sn'de ${Math.round(1e6 - r.hp)} hasar`);
}

// silahlar level-up'ta gerçekten toplanıyor mu
const acq = run(seedFromString('acquire'), { seconds: 480, driver: 'flee', invincible: true });
console.log(`     8 dk sonunda taşınan silahlar: ${acq.weapons.map((w) => `${w.def.name} L${w.level}`).join(', ')}`);
check('level-up birden fazla silah veriyor', acq.weapons.length >= 2, `${acq.weapons.length} silah`);
check('silah slot tavanı aşılmıyor', acq.weapons.length <= MAX_WEAPONS, `${acq.weapons.length}/${MAX_WEAPONS}`);
check('silah seviyesi tavani asmiyor', acq.weapons.every((w) => w.level <= w.def.maxLevel));

console.log(`\n${FAIL.length === 0 ? '✅ TÜM TESTLER GEÇTİ' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
