// Headless simülasyon testi — motorun DOM'suz çalıştığını ve dengenin
// çalıştığını kanıtlar. AYNI ZAMANDA mimari kanıtı: bu kod sunucuda koşabilir,
// yani Faz 4'te ödül doğrulaması için ikinci bir simülasyon yazmak gerekmez.
//
// Çalıştır:  npx tsx src/game/sim.test.mts
//
// DİKKAT: ölçüm testlerinde oyuncu ÖLMEMELİ. Ölünce step() no-op olur ve
// test hiçbir şey ölçmediği hâlde "geçer". İlk sürümde tam bu tuzağa düşüldü.

import { Game } from './engine.js';
import {
  COOLDOWN_FLOOR, MAX_PASSIVES, MAX_WEAPONS, PASSIVES, SPAWN, STAT_BASE, STAT_CAP, TICK, WEAPONS,
} from './config.js';
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

// ── 9) Pasif item sistemi + VS istatistik kalibrasyonu ──
console.log('\n[9] Pasifler ve istatistikler');
{
  const g = new Game(1);
  g.setViewport(1280, 720);
  const base = { ...g.stats };
  check('taban istatistikler VS ile aynı',
    base.might === 1 && base.armor === 0 && base.cooldown === 1 && base.amount === 0 && base.maxHp === 100,
    `might ${base.might}, armor ${base.armor}, cd ${base.cooldown}, amount ${base.amount}, hp ${base.maxHp}`);

  // her pasifi max seviyeye çıkar ve istatistiğe yansıyor mu bak
  for (const def of PASSIVES.slice(0, 4)) {
    const t = new Game(1);
    t.setViewport(1280, 720);
    (t as any).givePassive(def.id);
    const p = t.passives.find((x) => x.def.id === def.id)!;
    p.level = def.maxLevel;
    (t as any).recomputeStats();
    const before = STAT_BASE[def.stat];
    const after = t.stats[def.stat];
    const moved = def.stat === 'cooldown' ? after < before : after > before;
    check(`${def.name} → ${def.stat} değişiyor`, moved, `${before} → ${after.toFixed(2)}`);
  }

  // tavanlar tutuyor mu — cooldown dibi ve amount tavanı
  const capTest = new Game(1);
  capTest.setViewport(1280, 720);
  (capTest as any).passives = PASSIVES.map((def) => ({ def, level: def.maxLevel * 20 })); // absürt seviye
  (capTest as any).recomputeStats();
  check('cooldown %10 dibinin altına inmiyor', capTest.stats.cooldown >= COOLDOWN_FLOOR - 1e-9,
    `${capTest.stats.cooldown.toFixed(3)}`);
  check('amount tavanı (10) aşılmıyor', capTest.stats.amount <= STAT_CAP.amount!, `${capTest.stats.amount}`);
  check('might tavanı (%1000) aşılmıyor', capTest.stats.might <= STAT_CAP.might!, `${capTest.stats.might}`);
  check('armor tavanı (50) aşılmıyor', capTest.stats.armor <= STAT_CAP.armor!, `${capTest.stats.armor}`);
}

// Second Burial gerçekten diriltiyor mu — ölümü engellemeli
{
  const g = new Game(seedFromString('revive'));
  g.setViewport(1280, 720);
  (g as any).givePassive('burial');
  g.setInput(0, 0);
  let sawRevive = false;
  for (let i = 0; i < Math.round(300 / TICK); i++) {
    if (g.phase === 'levelup') g.choose(g.offers[0].id);
    if (g.phase !== 'running') break;
    g.step();
    if (g.revives > 0) sawRevive = true;
  }
  check('Second Burial ölümü diriliş ile karşılıyor', sawRevive, `${g.revives} diriliş, faz: ${g.phase}`);
}

// Level-up gerçekten pasif de sunuyor mu (sadece silah döndürmüyor)
{
  const g = run(seedFromString('offers'), { seconds: 600, driver: 'flee', invincible: true });
  console.log(`     10 dk: ${g.weapons.length} silah, ${g.passives.length} pasif`);
  console.log(`     pasifler: ${g.passives.map((p) => `${p.def.name} L${p.level}`).join(', ') || '(yok)'}`);
  check('pasif item toplanıyor', g.passives.length > 0, `${g.passives.length} pasif`);
  check('pasif slot tavanı asilmiyor', g.passives.length <= MAX_PASSIVES, `${g.passives.length}/${MAX_PASSIVES}`);
}

// ── 10) Boss, sandık ve evrim ──
console.log('\n[10] Boss / sandık / evrim');
{
  // Boss zamanında doğuyor mu
  const g = new Game(seedFromString('boss'));
  g.setViewport(1280, 720);
  let firstBossAt = -1;
  for (let i = 0; i < Math.round(330 / TICK); i++) {
    g.hp = g.stats.maxHp;
    if (g.phase === 'levelup') g.choose(g.offers[0].id);
    g.setInput(...fleeInput(g));
    g.step();
    if (firstBossAt < 0 && g.enemies.some((e) => e.boss)) firstBossAt = g.time;
  }
  check('ilk boss 5. dakikada doğuyor', firstBossAt > 299 && firstBossAt < 302, `${firstBossAt.toFixed(1)} sn`);
  const boss = g.enemies.find((e) => e.boss);
  check('boss normal düşmandan çok daha güçlü', !boss || boss.maxHp > 2000, `${boss ? Math.round(boss.maxHp) : 'öldü'} HP`);
}

// Evrim ŞARTLARI: eksik pasifle evrim OLMAMALI, tam şartla OLMALI
function evolveScenario(weaponMax: boolean, passiveMax: boolean) {
  const g = new Game(1);
  g.setViewport(1280, 720);
  const w = g.weapons.find((x) => x.def.id === 'shard')!;
  w.level = weaponMax ? w.def.maxLevel : 1;
  (g as any).givePassive('hands');
  const p = g.passives.find((x) => x.def.id === 'hands')!;
  p.level = passiveMax ? p.def.maxLevel : 1;
  (g as any).recomputeStats();
  // evrim sandığını doğrudan oyuncunun üstüne koy
  g.chests.push({ x: g.px, y: g.py, evolution: true });
  g.step();
  return g.weapons.find((x) => x.def.id === 'reliquary') !== undefined;
}
check('silah MAX değilse evrim OLMUYOR', !evolveScenario(false, true));
check('pasif MAX değilse evrim OLMUYOR', !evolveScenario(true, false));
check('ikisi de MAX ise evrim OLUYOR', evolveScenario(true, true));

// Evrim sandığı OLMAYAN sandık evrim vermemeli, ama ödül vermeli
{
  const g = new Game(1);
  g.setViewport(1280, 720);
  const w = g.weapons.find((x) => x.def.id === 'shard')!;
  w.level = w.def.maxLevel;
  (g as any).givePassive('hands');
  g.passives[0].level = g.passives[0].def.maxLevel;
  const goldBefore = g.gold;
  g.chests.push({ x: g.px, y: g.py, evolution: false });
  g.step();
  check('normal sandık evrim VERMİYOR', g.weapons.every((x) => x.def.id !== 'reliquary'));
  check('normal sandık ödül veriyor', g.gold > goldBefore + 100, `+${Math.round(g.gold - goldBefore)} gold`);
}

// Evrimleşmiş silah level-up havuzunda ÇIKMAMALI
{
  const g = new Game(1);
  g.setViewport(1280, 720);
  const w = g.weapons.find((x) => x.def.id === 'shard')!;
  w.level = w.def.maxLevel;
  (g as any).givePassive('hands');
  g.passives[0].level = g.passives[0].def.maxLevel;
  g.chests.push({ x: g.px, y: g.py, evolution: true });
  g.step();
  let sawEvolvedOffer = false;
  for (let i = 0; i < 60; i++) {
    (g as any).rollOffers();
    if (g.offers.some((o) => o.id === 'w:reliquary' || o.name === 'Reliquary')) sawEvolvedOffer = true;
  }
  check('evrimleşmiş silah level-up havuzunda çıkmıyor', !sawEvolvedOffer);
  check('evrim sonrası taban silah gitti', g.weapons.every((x) => x.def.id !== 'shard'));
  console.log(`     evrim sonrası: ${g.weapons.map((x) => x.def.name).join(', ')}`);
}

console.log(`\n${FAIL.length === 0 ? '✅ TÜM TESTLER GEÇTİ' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
