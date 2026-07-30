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
  COOLDOWN_FLOOR, MAX_PASSIVES, MAX_WEAPONS, PASSIVES, STAGES, STAT_BASE, STAT_CAP, TICK, WEAPONS,
} from './config.js';
import { applyRunResult, emptyProgress } from './progress.js';
import { seedFromString } from './rng.js';

const FAIL: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) FAIL.push(name);
};

type Driver = 'circle' | 'flee';

/**
 * İnsan davranışı proxy'si: yakın tehditten kaç, tehdit yoksa MÜCEVHER TOPLA.
 *
 * İlk sürüm sadece kaçıyordu ve kendi düşürdüğü mücevherlerden de kaçıyordu;
 * mücevherler 45 sn'de sönüyor, oyuncu 900 saniyede LV2'de kalıyordu. Gerçek
 * oyuncu mücevher peşinden gider — testin YZ'si bunu yansıtmazsa XP/level ile
 * ilgili her ölçüm yalan söyler.
 */
function fleeInput(g: Game): [number, number] {
  let ax = 0, ay = 0, threat = 0;
  for (const e of g.enemies) {
    const dx = e.x - g.px, dy = e.y - g.py;
    const d2 = dx * dx + dy * dy;
    if (d2 > 260 * 260) continue;
    const d = Math.sqrt(d2) || 1;
    ax += dx / d / d; ay += dy / d / d; // yakın olan daha çok iter
    if (d < 120) threat += 1;
  }

  let vx = -ax * 1.0, vy = -ay * 1.0;

  // Tehdit azsa en yakın mücevhere yönel (kaçış vektörüyle harmanlanır)
  if (threat < 3 && g.gems.length) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < g.gems.length; i++) {
      const dx = g.gems[i].x - g.px, dy = g.gems[i].y - g.py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = i; }
    }
    if (best >= 0) {
      const dx = g.gems[best].x - g.px, dy = g.gems[best].y - g.py;
      const d = Math.hypot(dx, dy) || 1;
      const w = threat === 0 ? 1.4 : 0.6; // tehdit yoksa daha cesur
      vx += (dx / d) * w; vy += (dy / d) * w;
    }
  }

  // arena kenarındaysa merkeze doğru düzelt
  const dist = Math.hypot(g.px, g.py);
  if (dist > 2100) { vx += -g.px / dist * 0.6; vy += -g.py / dist * 0.6; }
  return [vx, vy];
}

interface RunOpts { seconds: number; driver?: Driver; invincible?: boolean; stage?: typeof STAGES[number] }

function run(seed: number, { seconds, driver = 'circle', invincible = false, stage }: RunOpts) {
  const g = new Game(seed, stage);
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
check('gold bölümün oranıyla birikiyor', Math.abs(a.gold - a.kills * a.stage.def.goldPerKill) < 0.01,
  `${a.gold} gold = ${a.kills} kill × ${a.stage.def.goldPerKill}`);

// ── 3) BÖLÜM SİSTEMİ: sabit düşman havuzu, bitirilebilirlik ──
// Sonsuz koşu değil artık — her bölümde TAM OLARAK enemyCount düşman var.
console.log('\n[3] Bölüm sistemi');
for (const def of STAGES.slice(0, 3)) {
  const g = new Game(seedFromString(`stage-${def.id}`), def);
  g.setViewport(1280, 720);
  const limit = Math.round(25 * 60 / TICK);
  for (let i = 0; i < limit; i++) {
    if (g.phase === 'levelup') g.choose(g.offers[0].id);
    if (g.phase !== 'running') break;
    g.hp = g.stats.maxHp; // temizlenebilirliği ölçüyoruz, hayatta kalmayı değil
    g.setInput(...fleeInput(g));
    g.step();
  }
  const bossKills = def.boss ? 1 : 0;
  console.log(`     ${def.name}: ${g.kills}/${def.enemyCount}${bossKills ? '+boss' : ''} kill, ` +
    `${(g.time / 60).toFixed(1)} dk, LV${g.level}, ${Math.round(g.gold)} gold`);
  check(`${def.name} tamamlanabiliyor`, g.phase === 'won', `faz: ${g.phase}`);
  check(`${def.name} tam ${def.enemyCount}${bossKills ? '+1' : ''} düşman içeriyor`,
    g.kills === def.enemyCount + bossKills, `${g.kills} kill`);
  check(`${def.name} bitince sahne temiz`, g.remaining === 0, `${g.remaining} kaldı`);
}

// Boss SADECE sürü temizlenince gelmeli — erken gelirse bölüm finali anlamını yitirir
{
  const def = STAGES.find((s) => s.boss)!;
  const g = new Game(seedFromString('bosslast'), def);
  g.setViewport(1280, 720);
  let bossWhileHordeAlive = false;
  for (let i = 0; i < Math.round(25 * 60 / TICK); i++) {
    if (g.phase === 'levelup') g.choose(g.offers[0].id);
    if (g.phase !== 'running') break;
    g.hp = g.stats.maxHp;
    g.setInput(...fleeInput(g));
    g.step();
    if (g.enemies.some((e) => e.boss) && g.stage.toSpawn > 0) bossWhileHordeAlive = true;
  }
  check('boss ancak havuz bitince geliyor', !bossWhileHordeAlive);
}

// ── 4) Ölüm ──
// ── 3B) EKONOMİ: bölüm gold tavanı (EXPLOIT KAPISI) ──
// Bu grup ekonominin can damarı. Bozulursa oyuncu kolay bölümü sonsuz tekrar
// oynayıp gold basar ve shop anlamsızlaşır.
console.log('\n[3B] Gold tavanı / exploit');
{
  const st = STAGES[1]; // 700 gold tavanlı bölüm
  let p = emptyProgress();

  // 1. deneme: 695 kazanıp öldü
  const r1 = applyRunResult(p, st.id, 695, false);
  p = r1.progress;
  check('ilk denemede kazanılan gold veriliyor', r1.awarded === 695, `+${r1.awarded}`);
  check('bölüm tamamlanmadıysa sonraki bölüm açılmıyor', p.unlockedStage === 1, `unlocked ${p.unlockedStage}`);

  // 2. deneme: baştan oynadı, yine 700 kazandı — SADECE kalan 5 verilmeli
  const r2 = applyRunResult(p, st.id, 700, true);
  p = r2.progress;
  check('tekrar oynayınca sadece TAVAN FARKI veriliyor', r2.awarded === 5, `+${r2.awarded} (700 kazandı)`);
  check('tavan aşımı işaretleniyor', r2.capped);
  check('toplam gold tavanı geçmiyor', p.claimed[st.id] === st.goldCap, `${p.claimed[st.id]}/${st.goldCap}`);
  check('bölüm bitince sonraki açılıyor', p.unlockedStage === st.id + 1, `unlocked ${p.unlockedStage}`);

  // 3. deneme: tavan dolu, hiç gold verilmemeli
  const r3 = applyRunResult(p, st.id, 700, true);
  check('tavan dolduktan sonra gold VERİLMİYOR', r3.awarded === 0, `+${r3.awarded}`);
  check('cüzdan da artmıyor', r3.progress.gold === p.gold, `${r3.progress.gold} vs ${p.gold}`);

  // farklı bölümün tavanı bağımsız olmalı
  const other = applyRunResult(r3.progress, STAGES[0].id, 1000, true);
  check('başka bölümün tavanı bağımsız', other.awarded === STAGES[0].goldCap,
    `+${other.awarded} (tavan ${STAGES[0].goldCap})`);

  // negatif / hileli girdi
  const neg = applyRunResult(emptyProgress(), st.id, -500, false);
  check('negatif kazanç gold eksiltmiyor', neg.awarded === 0 && neg.progress.gold === 0);
}

console.log('\n[4] Ölüm');
// Amaç: "oyunda hiç baskı yok" durumunu yakalamak.
// BÖLÜM MODELİ NOTU: 1. bölüm kasıtlı olarak kolay ve ~1 dakikada bitiyor,
// orada hareketsiz oyuncu ölmeyebilir — bu tasarım. Baskı testi ZOR bölümde
// yapılmalı, yoksa test "kolay bölüm kolay" demekten ibaret kalır.
const AFK_LIMIT_SEC = 300;
const still = new Game(seedFromString('afk'), STAGES[STAGES.length - 1]);
still.setViewport(1280, 720);
still.setInput(0, 0);
let deadAt = -1;
for (let i = 0; i < Math.round(AFK_LIMIT_SEC / TICK); i++) {
  if (still.phase === 'levelup') still.choose(still.offers[0].id);
  still.step();
  if (still.phase === 'dead') { deadAt = still.time; break; }
}
check(`hareketsiz oyuncu ${AFK_LIMIT_SEC} sn içinde ölüyor`, deadAt > 0,
  deadAt > 0 ? `${deadAt.toFixed(1)} sn` : 'ölmedi');
check('ölümde HP 0 ve faz dead', still.hp === 0 && still.phase === 'dead');

// ── 5) Arena sınırı ──
console.log('\n[5] Arena sınırı');
const esc = run(1, { seconds: 120, invincible: true });
const dist = Math.hypot(esc.px, esc.py);
check('arena yarıçapı aşılmıyor', dist <= 2400.001, `${dist.toFixed(0)}/2400`);

// ── 6) Oynanabilirlik: 1. bölüm basit bir YZ ile BİTİRİLEBİLİYOR mu? ──
// Bölüm modelinde doğru bar "ne kadar dayandı" değil, "bölümü bitirebildi mi".
// Yeni oyuncunun ilk bölümde takılıp kalması funnel'ı öldürür.
console.log('\n[6] Oynanabilirlik (kaçış YZ, 1. bölüm)');
const fl = new Game(seedFromString('playable'), STAGES[0]);
fl.setViewport(1280, 720);
for (let i = 0; i < Math.round(20 * 60 / TICK); i++) {
  if (fl.phase === 'levelup') fl.choose(fl.offers[0].id);
  if (fl.phase !== 'running') break;
  fl.setInput(...fleeInput(fl));
  fl.step();
}
console.log(`     ${fl.time.toFixed(0)} sn, LV${fl.level}, ${fl.kills} kill, faz: ${fl.phase}`);
check('basit YZ 1. bölümü bitirebiliyor', fl.phase === 'won', `faz: ${fl.phase}`);
check('1. bölüm makul sürede bitiyor (3 dk altı)', fl.time < 180, `${fl.time.toFixed(0)} sn`);

// ── 7) Performans (ölçüm için ölümsüz + yoğun sahne) ──
console.log('\n[7] Performans');
// En kalabalık bölümde, sahne DOLUYKEN ölç. Bölüm bitmiş boş sahnede ölçmek
// 0.000 ms verir ve test hiçbir şey ölçmeden "geçer" (bu tuzağa bir kez düşüldü).
const heavy = STAGES[STAGES.length - 1];
const perf = new Game(seedFromString('perf'), heavy);
perf.setViewport(1280, 720);
for (let i = 0; i < Math.round(25 * 60 / TICK); i++) {
  if (perf.phase === 'levelup') perf.choose(perf.offers[0].id);
  if (perf.phase !== 'running') break;
  perf.hp = perf.stats.maxHp;
  perf.setInput(...fleeInput(perf));
  perf.step();
  if (perf.enemies.length >= heavy.maxAlive) break; // sahne doldu — burada ölç
}
console.log(`     ${heavy.name} tepe sahne: ${perf.enemies.length} düşman, ${perf.projectiles.length} mermi, ${perf.gems.length} mücevher`);
check('yoğun sahne gerçekten oluştu (test boş ölçmüyor)', perf.enemies.length >= heavy.maxAlive * 0.9,
  `${perf.enemies.length}/${heavy.maxAlive} düşman`);
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

// Silahlar level-up'ta toplanabiliyor mu — SİLAH TERCİH EDEN seçiciyle.
// Körlemesine offers[0] seçmek yanlış olurdu: seçenek sırası kasıtlı karışık,
// o yüzden kör seçici bazen hep pasif alır ve test sistemi değil şansı ölçer.
const acq = new Game(seedFromString('acquire'), STAGES[STAGES.length - 1]);
acq.setViewport(1280, 720);
for (let i = 0; i < Math.round(900 / TICK); i++) {
  if (acq.phase === 'levelup') {
    const want = acq.offers.find((o) => o.kind === 'weapon-new') ?? acq.offers[0];
    acq.choose(want.id);
  }
  if (acq.phase !== 'running') break;
  acq.hp = acq.stats.maxHp;
  acq.setInput(...fleeInput(acq));
  acq.step();
}
console.log(`     ${acq.stage.def.name}: ${acq.weapons.map((w) => `${w.def.name} L${w.level}`).join(', ')} (LV${acq.level})`);
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
  // ZOR bölümde test edilmeli — kolay bölümde oyuncu ölmüyor, diriliş tetiklenmiyor
  const g = new Game(seedFromString('revive'), STAGES[STAGES.length - 1]);
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
  const g = run(seedFromString('offers'), { seconds: 900, driver: 'flee', invincible: true, stage: STAGES[STAGES.length - 1] });
  console.log(`     ${g.stage.def.name}: ${g.weapons.length} silah, ${g.passives.length} pasif (LV${g.level})`);
  console.log(`     pasifler: ${g.passives.map((p) => `${p.def.name} L${p.level}`).join(', ') || '(yok)'}`);
  check('pasif item toplanıyor', g.passives.length > 0, `${g.passives.length} pasif`);
  check('pasif slot tavanı asilmiyor', g.passives.length <= MAX_PASSIVES, `${g.passives.length}/${MAX_PASSIVES}`);
}

// ── 10) Boss, sandık ve evrim ──
console.log('\n[10] Boss / sandık / evrim');
{
  // Boss artık ZAMAN değil İLERLEME bazlı: bölümün finali.
  const def = STAGES.find((s) => s.boss)!;
  const g = new Game(seedFromString('boss'), def);
  g.setViewport(1280, 720);
  let bossMaxHp = 0;
  let killsWhenBossAppeared = -1;
  for (let i = 0; i < Math.round(25 * 60 / TICK); i++) {
    if (g.phase === 'levelup') g.choose(g.offers[0].id);
    if (g.phase !== 'running') break;
    g.hp = g.stats.maxHp;
    g.setInput(...fleeInput(g));
    g.step();
    const b = g.enemies.find((e) => e.boss);
    if (b && killsWhenBossAppeared < 0) { killsWhenBossAppeared = g.kills; bossMaxHp = b.maxHp; }
  }
  check('boss bölüm finali olarak geliyor', killsWhenBossAppeared === def.enemyCount,
    `${killsWhenBossAppeared}/${def.enemyCount} kill sonrası`);
  check('boss normal düşmandan çok daha güçlü', bossMaxHp > 2000, `${Math.round(bossMaxHp)} HP`);
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
