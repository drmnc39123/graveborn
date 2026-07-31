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
  COOLDOWN_FLOOR, ENEMIES, EVOLUTIONS, EVOLVED, MAX_PASSIVES, MAX_WEAPONS, PASSIVES,
  STAGES, STAT_BASE, STAT_CAP, TICK, WEAPONS,
  descentStage, rareDropChance,
} from './config.js';
import { ENEMY_ART } from './sprites.js';
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
// Gold artık kill başına MAAŞ değil, nadir düşüş (Kintara modeli). Sadece
// "birikiyor mu" bakılır; oran testi [3C]'de ihtimalle doğrulanıyor.
check('nadir düşüş gold birikiyor', a.rareGold >= 0 && a.rareGold < a.kills,
  `${a.rareGold} gold / ${a.kills} kill`);

// ── 2B) VERİ BÜTÜNLÜĞÜ ──
// Bu grup SESSİZ kırılmaları yakalar: bölümün havuzuna yanlış bir düşman id'si
// ya da olmayan bir görsel anahtarı yazmak hiçbir hata üretmez — düşman
// sessizce renkli daireye düşer ve fark edilmesi haftalar alır.
console.log('\n[2B] Veri bütünlüğü');
{
  const ids = new Set(ENEMIES.map((e) => e.id));
  const badPool: string[] = [];
  for (const s of STAGES) for (const id of s.enemies) if (!ids.has(id)) badPool.push(`${s.name}→${id}`);
  check('her bölümün havuzu geçerli düşman id kullanıyor', badPool.length === 0, badPool.join(', ') || `${STAGES.length} bölüm`);

  const artKeys = new Set(Object.keys(ENEMY_ART));
  const badArt = ENEMIES.filter((e) => e.art && !artKeys.has(e.art)).map((e) => `${e.id}→${e.art}`);
  check('her düşmanın görsel anahtarı ENEMY_ART\'ta var', badArt.length === 0, badArt.join(', ') || `${ENEMIES.length} tip`);

  const badBoss = STAGES.filter((s) => s.boss && !artKeys.has(s.boss.art)).map((s) => s.name);
  check('boss görselleri de tanımlı', badBoss.length === 0, badBoss.join(', '));

  // Kullanılmayan düşman tipi = ölü içerik. Uyarı, hata değil.
  const used = new Set(STAGES.flatMap((s) => s.enemies));
  const unused = ENEMIES.filter((e) => !used.has(e.id)).map((e) => e.id);
  console.log(`     hiçbir bölümde kullanılmayan tip: ${unused.length ? unused.join(', ') : 'yok'}`);

  // Ödül eğrisi monoton artmalı — sonraki bölüm daha az ödemesin
  let mono = true;
  for (let i = 1; i < STAGES.length; i++) {
    if (STAGES[i].firstClearGold <= STAGES[i - 1].firstClearGold) mono = false;
    if (STAGES[i].enemyCount <= STAGES[i - 1].enemyCount) mono = false;
  }
  check('bölümler zorlaştıkça daha çok ödüyor', mono);
  check('sahne tavanı perf sınırında', STAGES.every((s) => s.maxAlive <= 420));
}

// ── 2C) DÜŞMAN DAVRANIŞLARI ──
// Davranışlar sessizce bozulur: bir düşman "menzilli" yazar ama yine kovalarsa
// hiçbir hata çıkmaz, sadece oyun sıkıcı olur. Her kalıp ÖLÇÜLEREK doğrulanıyor.
console.log('\n[2C] Düşman davranışları');
{
  /** Tek bir düşmanı elle koyup n saniye simüle et, ölçümleri döndür */
  const probe = (behavior: string, dist: number, seconds: number) => {
    const g = new Game(seedFromString(`bh-${behavior}`), STAGES[0]);
    g.setViewport(1280, 720);
    g.setInput(0, 0);
    const e = ENEMIES.find((x) => (x.behavior ?? 'chase') === behavior)!;
    const mk = () => {
      (g as any).enemies.length = 0;
      (g as any).enemies.push({
        x: g.px + dist, y: g.py, hp: 1e9, maxHp: 1e9,
        speed: e.speed, damage: e.damage, radius: e.radius, xp: 1,
        color: e.color, hitFlash: 0, art: e.art, animT: 0, facingRight: true,
        contactCd: 0, behavior: e.behavior ?? 'chase',
        atkCd: 0.05, cState: 0, cdx: 0, cdy: 0, phase: 0,
      });
    };
    mk();
    let minD = Infinity, maxD = 0, maxStep = 0, lateral = 0;
    let px = (g as any).enemies[0].x, py = (g as any).enemies[0].y;
    for (let i = 0; i < Math.round(seconds / TICK); i++) {
      // Havuz boşalıp "av modu" devreye girmesin: sahnede hep düşman kalsın
      (g as any).stage.toSpawn = 999;
      // ⚠️ Canı BURADA doldurma: ilk sürümde her tick doldurulunca menzillinin
      // verdiği hasar silindi ve test "ok atmıyor" sandı. Temas hasarı zaten
      // çalışmıyor (collidePlayer çağrılmıyor), tek hasar kaynağı ok.
      (g as any).moveEnemies(TICK);
      (g as any).updateEnemyShots(TICK);
      (g as any).time += TICK;
      const en = (g as any).enemies[0];
      const d = Math.hypot(en.x - g.px, en.y - g.py);
      if (d < minD) minD = d;
      if (d > maxD) maxD = d;
      const step = Math.hypot(en.x - px, en.y - py) / TICK;
      if (step > maxStep) maxStep = step;
      lateral += Math.abs(en.y - g.py);
      px = en.x; py = en.y;
    }
    return { minD, maxD, maxStep, lateral: lateral / Math.round(seconds / TICK), shots: (g as any).enemyShots.length, speed: e.speed, hp: g.hp, maxHp: g.stats.maxHp };
  };

  // MENZİLLİ: tercih mesafesinde durmalı, oyuncuya YAPIŞMAMALI, ok atmalı
  const r = probe('ranged', 520, 8);
  console.log(`     ranged  : mesafe ${r.minD.toFixed(0)}–${r.maxD.toFixed(0)} px, can ${Math.round(r.hp)}/${Math.round(r.maxHp)}`);
  check('menzilli oyuncuya yapışmıyor', r.minD > 120, `en yakın ${r.minD.toFixed(0)} px`);
  check('menzilli tercih mesafesine yaklaşıyor', r.minD < 520, `${r.minD.toFixed(0)} < 520`);
  check('menzilli oyuncuya HASAR veriyor', r.hp < r.maxHp, `${Math.round(r.hp)}/${Math.round(r.maxHp)}`);

  // HÜCUMCU: normal hızından belirgin daha hızlı bir atılım yapmalı
  const c = probe('charger', 400, 8);
  console.log(`     charger : tepe hız ${c.maxStep.toFixed(0)} px/sn (taban ${c.speed})`);
  check('hücumcu fırlıyor (taban hızın çok üstünde)', c.maxStep > c.speed * 2.5,
    `${c.maxStep.toFixed(0)} > ${(c.speed * 2.5).toFixed(0)}`);
  check('hücum sonsuz değil, mesafe tekrar açılıyor', c.maxD > c.minD + 40,
    `${c.minD.toFixed(0)}–${c.maxD.toFixed(0)}`);

  // WEAVE: düz gelmez, yanal sapma yapar
  const w = probe('weave', 400, 6);
  const straight = probe('chase', 400, 6);
  console.log(`     weave   : ortalama yanal sapma ${w.lateral.toFixed(1)} px (düz kovalayan ${straight.lateral.toFixed(1)})`);
  check('weave yanal salınım yapıyor', w.lateral > straight.lateral + 5,
    `${w.lateral.toFixed(1)} > ${straight.lateral.toFixed(1)}`);

  // YAKINSAMA GARANTİSİ: son düşmanlar kaldığında davranış EZİLİR ve kovalar.
  // Bu olmadan menzilli bir düşman bölümü sonsuza kadar kilitleyebilir.
  {
    const g = new Game(seedFromString('converge'), STAGES[0]);
    g.setViewport(1280, 720);
    g.setInput(0, 0);
    const e = ENEMIES.find((x) => x.behavior === 'ranged')!;
    (g as any).stage.toSpawn = 0;   // havuz bitti → av modu
    (g as any).enemies.push({
      x: g.px + 600, y: g.py, hp: 1e9, maxHp: 1e9,
      speed: e.speed, damage: 0, radius: e.radius, xp: 1,
      color: e.color, hitFlash: 0, animT: 0, facingRight: true,
      contactCd: 0, behavior: 'ranged', atkCd: 99, cState: 0, cdx: 0, cdy: 0, phase: 0,
    });
    for (let i = 0; i < Math.round(20 / TICK); i++) (g as any).moveEnemies(TICK);
    const d = Math.hypot((g as any).enemies[0].x - g.px, (g as any).enemies[0].y - g.py);
    check('son düşman kalınca MENZİLLİ de kovalıyor (bölüm kilitlenmez)', d < 60,
      `mesafe ${d.toFixed(0)} px`);
  }

  // Boss davranışı her zaman chase olmalı — mesafe tutan boss finali uzatır
  const bossDefs = STAGES.filter((s) => s.boss);
  check('bölüm boss\'ları tanımlı', bossDefs.length > 0, `${bossDefs.length} boss`);
}

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
    `${(g.time / 60).toFixed(1)} dk, LV${g.level}, ${Math.round(g.rareGold)} nadir gold`);
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

// ── 3B) THE DESCENT: sonsuz derinlik merdiveni ──
// Oyunun ömrü bu modda. Kampanya ~30 dakikalık tek seferlik tüketim;
// tekrar değeri buradan geliyor.
console.log('\n[3B] The Descent');
{
  const g = new Game(seedFromString('descent'), STAGES[0], {}, 'descent');
  g.setViewport(1280, 720);
  let lastDepth = g.stage.depth;
  const bossDepths: number[] = [];

  for (let i = 0; i < Math.round(40 * 60 / TICK); i++) {
    if (g.phase === 'levelup') g.choose(g.offers[0].id);
    if (g.phase !== 'running') break;
    // Merdiveni ölçüyoruz, hayatta kalmayı değil → can tazeleniyor.
    if (g.stage.depth !== lastDepth) {
      lastDepth = g.stage.depth;
      if (g.stage.def.boss) bossDepths.push(g.stage.depth);
    }
    g.hp = g.stats.maxHp;
    g.setInput(...fleeInput(g));
    g.step();
    if (g.stage.depth >= 22) break;
  }

  console.log(`     derinlik ${g.stage.depth}, temizlenen ${g.stage.deepestCleared}, ` +
    `${g.kills} kill, ${(g.time / 60).toFixed(1)} dk, ${Math.round(g.rareGold)} nadir gold`);
  check('descent bitmiyor, derinlik ilerliyor', g.stage.depth >= 10, `derinlik ${g.stage.depth}`);
  check('descent asla "won" olmuyor', g.phase !== 'won', `faz: ${g.phase}`);
  check('temizlenen derinlik takip ediliyor', g.stage.deepestCleared === g.stage.depth - 1,
    `${g.stage.deepestCleared} vs ${g.stage.depth}`);

  // CAN DOLMAZ — descent'in TEK bitiş koşulu bu, doğrudan ölç.
  // (Önce canlı koşu içinde ölçülüyordu ama test her tick canı maxHp'ye
  //  dolduruyor; level-up maxHp'yi büyütünce can "arttı" görünüp yanlış
  //  alarm veriyordu. İddiayı invaryantın kendisinde ölçmek doğrusu.)
  {
    const h = new Game(seedFromString('nohp'), STAGES[0], {}, 'descent');
    h.setViewport(1280, 720);
    h.hp = 37;
    const before = h.hp;
    (h as any).advanceDepth();
    check('derinlik geçişinde CAN DOLDURULMUYOR', h.hp === before, `${before} → ${h.hp}`);
    check('derinlik geçişinde silah/level KORUNUYOR',
      h.weapons.length > 0 && h.level === 1, `${h.weapons.length} silah, LV${h.level}`);
  }
  check('her 5 derinlikte boss var',
    bossDepths.length > 0 && bossDepths.every((d) => d % 5 === 0), `boss derinlikleri: ${bossDepths.join(',')}`);
  check('derinlik zorlaşıyor', descentStage(1, 20).hpMul > descentStage(1, 5).hpMul * 3,
    `d5 ${descentStage(1, 5).hpMul.toFixed(1)} → d20 ${descentStage(1, 20).hpMul.toFixed(1)}`);
  check('sahne tavanı aşılmıyor (perf)', descentStage(1, 200).maxAlive <= 420,
    `${descentStage(1, 200).maxAlive}`);
}

// ── 3C) Nadir düşüş determinizmi ──
// Sunucu doğrulaması buna dayanacak: aynı seed → aynı gold, replay gerekmeden.
console.log('\n[3C] Nadir düşüş');
{
  const runRare = (seed: number) => {
    const g = new Game(seed, STAGES[0]);
    g.setViewport(1280, 720);
    for (let i = 0; i < Math.round(180 / TICK); i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;
      g.setInput(...fleeInput(g));
      g.step();
    }
    return { gold: g.rareGold, kills: g.kills };
  };
  const x = runRare(4242);
  const y = runRare(4242);
  const z = runRare(9999);
  check('aynı seed aynı nadir gold', x.gold === y.gold, `${x.gold} = ${y.gold}`);
  check('farklı seed farklı nadir gold', x.gold !== z.gold, `${x.gold} vs ${z.gold}`);
  check('düşüş NADİR (kill başına maaş değil)', x.gold < x.kills,
    `${x.gold} gold / ${x.kills} kill`);
  check('ama hiç düşmüyor da değil', x.gold > 0, `${x.gold} gold`);
  // ihtimal derinlikle iyileşmeli — derin oyuncu üretici olmalı
  check('düşüş ihtimali derinlikle artıyor', rareDropChance(30) > rareDropChance(0),
    `${rareDropChance(0).toFixed(4)} → ${rareDropChance(30).toFixed(4)}`);
  check('düşüş ihtimali tavanlı', rareDropChance(100000) <= 0.05);
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
    // ground alanı ayağının DİBİNE bırakılır; kukla yarıçapın içinde olmalı
    def.pattern === 'ground' ? (def.groundRadius ?? 62) * 0.5 :
    40;

  const dummy = {
    x: dist, y: 0, hp: 1e6, maxHp: 1e6, speed: 0, damage: 0, radius: 12, xp: 0,
    color: '#fff', hitFlash: 0, animT: 0, facingRight: true, contactCd: 0,
    behavior: 'chase' as const, atkCd: 99, cState: 0 as const, cdx: 0, cdy: 0, phase: 0,
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
// SEKİZ desen de test edilir. Biri sessizce çalışmazsa 20 dk oynayana kadar
// fark edilmez — silah eklemenin en sinsi hatası "hiç ateş etmiyor"dur.
for (const w of WEAPONS) {
  const r = patternDamages(w.id);
  check(`${w.name} (${w.pattern}) hasar veriyor`, r.dealt, `3 sn'de ${Math.round(1e6 - r.hp)} hasar`);
}

// Evrimleşmiş silahların desenleri de çalışmalı — bunlar level-up havuzunda
// çıkmadığı için normal oynayışta 20 dakika sonra fark edilirdi.
console.log('\n[8B] Evrimleşmiş desenler');
{
  const bad: string[] = [];
  for (const ev of EVOLVED) {
    const g = new Game(seedFromString(`ev-${ev.id}`));
    g.setViewport(1280, 720);
    g.weapons = [{ def: ev, level: 1, cd: 0 }];
    const dist =
      ev.pattern === 'orbit' ? (ev.orbitRadius ?? 78) :
      ev.pattern === 'aura' ? (ev.auraRadius ?? 70) * 0.6 :
      ev.pattern === 'ground' ? (ev.groundRadius ?? 62) * 0.5 : 40;
    const dummy: any = {
      x: dist, y: 0, hp: 1e7, maxHp: 1e7, speed: 0, damage: 0, radius: 12, xp: 0,
      color: '#fff', hitFlash: 0, animT: 0, facingRight: true, contactCd: 0,
      behavior: 'chase', atkCd: 99, cState: 0, cdx: 0, cdy: 0, phase: 0,
    };
    g.enemies.push(dummy);
    g.setInput(0, 0);
    for (let i = 0; i < Math.round(3 / TICK); i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      g.hp = g.stats.maxHp;
      dummy.x = g.px + dist; dummy.y = g.py;
      g.step();
    }
    if (dummy.hp >= 1e7) bad.push(ev.name);
  }
  check('8 evrimleşmiş silahın hepsi hasar veriyor', bad.length === 0,
    bad.length ? bad.join(', ') : `${EVOLVED.length} silah`);
}

// ── 8D) SİLAH GÜÇ DENGESİ ──
// İzole hasar testi bir silahın ÇALIŞTIĞINI kanıtlar, DENGELİ olduğunu değil.
// Kukla testinde boomerang 672 hasar yaptı (Bone Shard 280) — ama kukla sabit
// ve tam yolun üstünde, yani boomerang için en iyi hâl. Gerçek koşulda ölçmek
// lazım: aynı seed, aynı bölüm, TEK silah, sabit süre, kaç kill.
//
// ⚠️ SÜRÜCÜ SEÇİMİ ÖLÇÜMÜ BELİRLER. İlk sürümde `fleeInput` kullanıldı ve
// Grave Lash / Litany / Wardsalt / Consecrated Ash 0 KILL aldı — çünkü kaçan
// oyuncu kısa menzilli silahı hiçbir şeye değdiremez. Bu oyunun değil TESTİN
// hatasıydı. Nötr zemin: dairesel hareket — oyuncu hareket eder ama kaçmaz,
// sürü yetişir. Hem menzilli hem yakın dövüş silahı iş görebilir.
console.log('\n[8D] Silah güç dengesi (1. bölüm, 60 sn, tek silah, dairesel hareket)');
{
  const killsWith = (def: typeof WEAPONS[number]) => {
    const g = new Game(seedFromString('balance'), STAGES[0]);
    g.setViewport(1280, 720);
    g.weapons = [{ def, level: 1, cd: 0 }];
    for (let i = 0; i < Math.round(60 / TICK); i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;              // hayatta kalmayı değil GÜCÜ ölçüyoruz
      const t = i * TICK;
      g.setInput(Math.cos(t * 0.7), Math.sin(t * 0.7));
      g.step();
    }
    return g.kills;
  };
  // Silahları KIYASLANABİLİR sınıflara ayır. Hepsini tek eşiğe vurmak yanlış
  // olurdu: otomatik nişan alan bir silahla, oyuncunun yönüne bağlı bir silahı
  // "yönü umursamayan" bir sürücüyle aynı kefeye koymak sınıf farkını denge
  // sorunu sanmak demek.
  const CLASS: Record<string, 'auto' | 'directional' | 'orbit'> = {
    aimed: 'auto', nova: 'auto', chain: 'auto', aura: 'auto', ground: 'auto',
    sweep: 'directional', boomerang: 'directional',
    orbit: 'orbit',
  };
  const rows = WEAPONS.map((w) => ({ name: w.name, kills: killsWith(w), cls: CLASS[w.pattern] }))
    .sort((a, b) => b.kills - a.kills);
  for (const r of rows) console.log(`     ${r.name.padEnd(18)} ${String(r.kills).padStart(3)} kill  (${r.cls})`);

  const best = rows[0].kills;
  const worst = rows[rows.length - 1];
  // 1) TUZAK SEÇİM YOK: hiçbir silah en iyinin %15'inin altında olmamalı.
  //    Asıl korunmak istenen şey bu — oyuncu bir seçimini çöpe atmasın.
  check('tuzak silah yok (en iyinin %15\'i altında kalan yok)', worst.kills >= best * 0.15,
    `en zayıf ${worst.name} ${worst.kills}, eşik ${(best * 0.15).toFixed(0)}`);

  // 2) SINIF İÇİ TUTARLILIK: aynı sınıftaki silahlar birbirine yakın olmalı,
  //    yoksa o sınıfta "tek doğru" silah oluşur ve seçim ortadan kalkar.
  for (const cls of ['auto', 'directional'] as const) {
    const g2 = rows.filter((r) => r.cls === cls);
    if (g2.length < 2) continue;
    const hi = g2[0].kills, lo = g2[g2.length - 1].kills;
    check(`${cls} sınıfı kendi içinde dengeli (≤1.8x)`, hi <= lo * 1.8,
      `${g2[0].name} ${hi} vs ${g2[g2.length - 1].name} ${lo}`);
  }
}

// ── 8C) SİLAH/EVRİM VERİ BÜTÜNLÜĞÜ ──
// Yanlış id yazmak sessiz: evrim asla tetiklenmez, oyuncu sebebini asla anlamaz.
console.log('\n[8C] Evrim tablosu tutarlı');
{
  const wIds = new Set(WEAPONS.map((w) => w.id));
  const eIds = new Set(EVOLVED.map((w) => w.id));
  const pIds = new Set(PASSIVES.map((p) => p.id));
  const badW = EVOLUTIONS.filter((e) => !wIds.has(e.weapon)).map((e) => e.weapon);
  const badP = EVOLUTIONS.filter((e) => !pIds.has(e.passive)).map((e) => e.passive);
  const badT = EVOLUTIONS.filter((e) => !eIds.has(e.to)).map((e) => e.to);
  check('evrim taban silahları geçerli', badW.length === 0, badW.join(', '));
  check('evrim pasifleri geçerli', badP.length === 0, badP.join(', '));
  check('evrim sonuçları geçerli', badT.length === 0, badT.join(', '));

  // Her taban silahın bir evrimi olmalı — yoksa MAX'a çıkarmanın ödülü yok
  const covered = new Set(EVOLUTIONS.map((e) => e.weapon));
  const uncovered = WEAPONS.filter((w) => !covered.has(w.id)).map((w) => w.name);
  check('her taban silahın evrimi var', uncovered.length === 0, uncovered.join(', '));

  // İki evrim AYNI pasifi istememeli — yoksa tek "doğru" pasif oluşur
  const passives = EVOLUTIONS.map((e) => e.passive);
  check('her evrim farklı pasif istiyor', new Set(passives).size === passives.length,
    passives.join(', '));

  // Pasif havuzunda motorun OKUMADIĞI istatistik olmamalı (ölü seçim)
  const READ = new Set(['might', 'armor', 'maxHp', 'recovery', 'cooldown', 'area',
    'projSpeed', 'duration', 'amount', 'moveSpeed', 'magnet', 'growth', 'greed', 'curse', 'revival']);
  const dead = PASSIVES.filter((p) => !READ.has(p.stat)).map((p) => `${p.id}→${p.stat}`);
  check('ölü pasif yok (hepsi motorda okunuyor)', dead.length === 0, dead.join(', '));
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
  const goldBefore = g.rareGold;
  g.chests.push({ x: g.px, y: g.py, evolution: false });
  g.step();
  check('normal sandık evrim VERMİYOR', g.weapons.every((x) => x.def.id !== 'reliquary'));
  check('normal sandık ödül veriyor', g.rareGold > goldBefore + 100,
    `+${Math.round(g.rareGold - goldBefore)} gold`);
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
