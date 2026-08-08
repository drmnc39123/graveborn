// Headless simülasyon testi — motorun DOM'suz çalıştığını ve dengenin
// çalıştığını kanıtlar. AYNI ZAMANDA mimari kanıtı: bu kod sunucuda koşabilir,
// yani Faz 4'te ödül doğrulaması için ikinci bir simülasyon yazmak gerekmez.
//
// Çalıştır:  npx tsx src/game/sim.test.mts
//
// DİKKAT: ölçüm testlerinde oyuncu ÖLMEMELİ. Ölünce step() no-op olur ve
// test hiçbir şey ölçmediği hâlde "geçer". İlk sürümde tam bu tuzağa düşüldü.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from './engine.js';
import {
  BEHAVIOR, BOSS, BOSS_ARCH, COOLDOWN_FLOOR, ENEMIES, EVOLUTIONS, EVOLVED, MAX_PASSIVES,
  MAX_WEAPONS, PASSIVES, PLAYER,
  SIM_VERSION, STAGES, STAT_BASE, STAT_CAP, TICK, WEAPONS,
  descentStage, rareDropChance, stageById, weaponById,
  type BossArchetype, type StageDef,
} from './config.js';
import { ENEMY_ART } from './sprites.js';
import { HEROES } from './heroes.js';
import { seedFromString } from './rng.js';

const FAIL: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) FAIL.push(name);
};

type Driver = 'circle' | 'flee';

/**
 * "DÖVÜŞEN OYUNCU" sürücüsü — denge ölçümlerinin ortak zemini.
 *
 * NEDEN GEREKLİ: `setInput` girdiyi HER ZAMAN birim vektöre normalize eder,
 * yani oyuncu ya tam hızda ya duruyor. Sürekli daire çizdirmek (cos/sin)
 * oyuncuyu düşmanlardan hızlı tutar — bu da bir tür KAÇIŞ'tır ve kısa menzilli
 * silahlar hiçbir zaman değmez. Ölçümde Litany 6 dakikada 15 kill yaptı.
 *
 * Gerçek oyuncu kaçar ve DÖNÜP DÖVÜŞÜR. Sürücü de öyle: bir süre hareket,
 * bir süre durup sürüyü üstüne alma.
 */
function engagedInput(t: number): [number, number] {
  const cycle = t % 3;
  if (cycle < 1.5) return [Math.cos(t * 0.7), Math.sin(t * 0.7)];
  return [0, 0];   // dur ve sürüyü üstüne al
}

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

interface RunOpts {
  seconds: number; driver?: Driver; invincible?: boolean; stage?: typeof STAGES[number];
  /** her tick sonrası çağrılır — render katmanını taklit etmek için (bkz. [1C]) */
  onTick?: (g: Game) => void;
}

function run(seed: number, { seconds, driver = 'circle', invincible = false, stage, onTick }: RunOpts) {
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
    onTick?.(g);
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

// ── 1B) DETERMİNİZM MÜHRÜ ──
// ⚠️ Yukarıdaki testler AYNI SÜREÇTE iki koşuyu karşılaştırıyor. Bir kod
// değişikliği İKİSİNİ BİRDEN kaydırırsa hepsi yine geçer — yani RNG akışının
// sessizce değişmesini yakalayamazlar. Mühür bunu kapatıyor: tek bir sabit
// tüm simülasyon durumunu özetliyor.
//
// ⚠️ BU SAYI DEĞİŞTİYSE RNG AKIŞI KAYDI. Kasıtlıysa:
//   1. config.ts'teki SIM_VERSION'ı artır,
//   2. aşağıdaki sabiti yeni değerle güncelle,
//   3. sunucunun aynı sürümü koştuğunu doğrula — backend `settleRun` bu
//      motoru çalıştırıyor, eski seed'ler geçersiz olur.
// v1 → v2: kritik vuruş eklendi, `damageEnemy` her çağrıda rng tüketiyor.
// Eski mühür 3adcd88b idi; kırılma KASITLI ve SIM_VERSION 2'ye çıkarıldı.
// SIM_VERSION 3: 12 düşmana gerçek davranış verildi (swarm/circler eklendi,
// rogue·crab weave, horned·warrior charger, bird·fiend circler,
// wretch·dire_rat·bone_thrall swarm). Hareket değişti → sonuç değişti.
const SIM_SEAL = '1d204abe';

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const seal = fnv1a([
  a.kills, a.level, a.px.toFixed(6), a.py.toFixed(6),
  Math.round(a.rareGold * 1000), a.enemies.length,
  a.enemies.reduce((s, e) => s + e.x + e.y, 0).toFixed(3),
  a.weapons.map((w) => `${w.def.id}:${w.level}`).join(','),
  a.passives.map((p) => `${p.def.id}:${p.level}`).join(','),
].join('|'));

check(`simülasyon mührü (SIM_VERSION ${SIM_VERSION})`, seal === SIM_SEAL,
  seal === SIM_SEAL ? seal : `${seal} ≠ ${SIM_SEAL} — RNG AKIŞI KAYDI`);

// ── 1C) HAVUZ MÜHRÜ — birinci mührün İKİNCİ kör noktası ──
//
// 🔴 ÖLÇÜLDÜ: yukarıdaki `SIM_SEAL` koşusu **LV1'de bitiyor** — yani
// `rollOffers` HİÇ ÇAĞRILMIYOR. (Sebep: daire çizen sürücü mücevherleri
// toplamıyor; 240 saniyeye çıkarıldı, yine LV1.) Silah havuzuna 3 silah
// eklendi, `rng.shuffle(pool)` havuz uzunluğu kadar zar tüketiyor, yani RNG
// akışı KESİNLİKLE kaydı — ama mühür kılını kıpırdatmadı.
//
// Bu, aynı mührün ikinci kör noktası (birincisi: boss'u hiç görmüyor, bkz.
// [10B]). `SIM_SEAL`in gerçekte kapsadığı şey dar: doğma, hareket, BAŞLANGIÇ
// silahı ve nadir gold.
//
// ⚠️ Bu mühür KOŞU ÜZERİNDEN DEĞİL, havuzu DOĞRUDAN sorguluyor. Seviye
// atlayan bir koşu kurmaya çalışmak (daha uzun süre, başka sürücü, XP hilesi)
// ölçümü kırılganlaştırırdı: hedef "havuz değişti mi", "oyuncu seviye
// atlayabiliyor mu" değil.
{
  const g = new Game(SEED, STAGES[0]);
  g.setViewport(1280, 720);
  const dizi: string[] = [];
  for (let i = 0; i < 60; i++) {
    (g as unknown as { rollOffers: (h: unknown) => void }).rollOffers(g.hero);
    dizi.push(g.offers.map((o) => o.id).join('+'));
  }
  const POOL_SEAL = '6f9424d0';
  const poolSeal = fnv1a(dizi.join('|'));
  const gorulen = new Set(dizi.join('|').split(/[|+]/));
  const eksik = WEAPONS.filter((w) => !gorulen.has(`w:${w.id}`)).map((w) => w.id);
  console.log(`     60 ruloda ${gorulen.size} farklı teklif`);
  // ⚠️ ÖNCE ULAŞILABİLİRLİK: teklif edilmeyen bir silah, oyunda YOK demektir.
  // Mühür bunu yakalamaz — aynı şekilde "hiç" de mühürlenebilir.
  check('her TABAN silah teklif havuzuna giriyor', eksik.length === 0,
    eksik.length ? eksik.join(',') : `${WEAPONS.length} silah`);
  check(`havuz mührü (SIM_VERSION ${SIM_VERSION})`, poolSeal === POOL_SEAL,
    poolSeal === POOL_SEAL ? poolSeal : `${poolSeal} ≠ ${POOL_SEAL} — TEKLİF HAVUZU DEĞİŞTİ`);
}

// ── 1C) KOZMETİK İZOLASYON ──
// Render katmanı motorun kozmetik kuyruklarını her frame boşaltıyor. Bu
// boşaltmanın simülasyonu ETKİLEYEMEYECEĞİ kanıtlanmalı — aksi hâlde
// "tarayıcıda başka, sunucuda başka sonuç" sınıfı bir hata mümkün olur.
{
  const drained = run(SEED, {
    seconds: 60, invincible: true,
    onTick: (g) => {
      g.deaths.length = 0;
      g.hits.length = 0;
      g.hurts.length = 0;
      g.arcs.length = 0;
      g.events.clear();
    },
  });
  check('kozmetik kuyruğu boşaltmak simülasyonu ETKİLEMİYOR',
    drained.kills === a.kills && Math.abs(drained.px - a.px) < 1e-9 && drained.level === a.level,
    `${drained.kills} = ${a.kills} kill`);
}

// ── 1D) Math.random DENETİMİ ──
// Kural bugüne kadar sadece yorumda yaşıyordu. Teste dönüşmeli: tek bir
// `Math.random()` çağrısı determinizmi sessizce bitirir ve sunucu
// doğrulaması ile istemci sonsuza kadar ayrışır.
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const files = fs.readdirSync(here).filter((f) => f.endsWith('.ts'));
  const kirli: string[] = [];
  for (const f of files) {
    const kod = fs.readFileSync(path.join(here, f), 'utf8')
      .split('\n')
      .filter((l) => { const t = l.trim(); return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*'); })
      .join('\n');
    if (/Math\.random\s*\(/.test(kod)) kirli.push(f);
  }
  check('game/ altında Math.random ÇAĞRISI yok', kirli.length === 0,
    kirli.join(', ') || `${files.length} dosya temiz`);
}

// ── 2) Çekirdek döngü ──
console.log('\n[2] Çekirdek döngü (60 sn)');
check('düşman doğuyor', a.enemies.length > 0, `${a.enemies.length} canlı`);
check('düşman ölüyor', a.kills > 0, `${a.kills} kill`);
check('mermi uçuyor', a.projectiles.length > 0, `${a.projectiles.length} mermi`);
// ⚠️ SEVİYEYE BAKMA. Önce `level > 1` yazıyordu ve düşman davranışları
// eklenince 8/10 XP ile kaldı → test kırmızı yandı, oysa XP pekâlâ akıyordu.
// Sürücü kör bir daire çiziyor (mücevher toplamayı hedeflemiyor), o yüzden
// seviye eşiği bıçak sırtı. Ölçülmesi gereken AKIŞ, eşik değil.
check('XP akıyor', a.xpEarned > 0 && a.level >= 1, `${a.xpEarned.toFixed(0)} XP, LV${a.level}`);
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
  }
  check('bölümler zorlaştıkça daha çok ödüyor', mono);

  // ⚠️ ZORLUK ÖLÇÜSÜ DÜŞMAN SAYISI DEĞİL. Eskiden `enemyCount` monotonluğu
  // aranıyordu; ikinci kitapta (11-25) sayı BİLEREK büyütülmüyor çünkü
  // bölüm 10 zaten 3.400 düşman / spawnRate 8 = HAM minimum 7 dakika ve
  // sayıyı büyütmek "daha çok içerik" değil "daha uzun bekleme" olurdu.
  // Ayrıca `maxAlive` 420'de bir PERF tavanı. Zorluk artık candan ve
  // hasardan geliyor — ölçülen değişmez bu olmalı.
  let zorluk = true;
  for (let i = 1; i < STAGES.length; i++) {
    const a = STAGES[i - 1], b = STAGES[i];
    if (b.hpMul * (b.damageMul ?? 1) <= a.hpMul * (a.damageMul ?? 1)) zorluk = false;
  }
  check('bölümler gerçekten zorlaşıyor (can × hasar)', zorluk,
    `d1 ${(STAGES[0].hpMul * (STAGES[0].damageMul ?? 1)).toFixed(1)} → son ${(STAGES[STAGES.length - 1].hpMul * (STAGES[STAGES.length - 1].damageMul ?? 1)).toFixed(0)}`);

  // ⚠️ Koşu SÜRESİ patlamamalı: ham minimum = enemyCount / spawnRate.
  // Bir bölümün 12 dakikadan uzun sürmesi, oyuncuyu içerikle değil
  // BEKLEMEYLE tutmak demektir.
  const enUzun = Math.max(...STAGES.map((x) => x.enemyCount / x.spawnRate));
  check('hiçbir bölüm 12 dakikayı geçmiyor (ham minimum)', enUzun < 12 * 60,
    `en uzun ${(enUzun / 60).toFixed(1)} dk`);
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
      // ⚠️ rebuildGrid ŞART: `swarm` komşularını grid'den sayıyor. Grid boş
      // kalırsa sürü düşmanı sonsuza kadar "yalnız" görünür ve test yalan söyler.
      (g as any).rebuildGrid();
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

  // SÜRÜ: kalabalıkken hızlanmalı, yalnızken taban hızın ALTINDA kalmalı.
  // Tek düşmanla ölçmek yetmez — bu davranışın tamamı komşu sayısına bağlı.
  {
    const mkSwarm = (count: number) => {
      const g = new Game(seedFromString('bh-swarm'), STAGES[0]);
      g.setViewport(1280, 720);
      g.setInput(0, 0);
      const e = ENEMIES.find((x) => x.behavior === 'swarm')!;
      (g as any).stage.toSpawn = 999;
      for (let k = 0; k < count; k++) {
        // Hepsi aynı hücre kümesinde toplansın — 3×3 grid kutusu ≈ ±96 px
        (g as any).enemies.push({
          x: g.px + 420 + (k % 5) * 14, y: g.py + Math.floor(k / 5) * 14 - 20,
          hp: 1e9, maxHp: 1e9,
          speed: e.speed, damage: 0, radius: e.radius, xp: 1,
          color: e.color, hitFlash: 0, art: e.art, animT: 0, facingRight: true,
          contactCd: 0, behavior: 'swarm', atkCd: 0, cState: 0, cdx: 0, cdy: 0, phase: 0,
        });
      }
      const en = (g as any).enemies[0];
      let x0 = en.x, y0 = en.y;
      const steps = Math.round(1.5 / TICK);
      for (let i = 0; i < steps; i++) {
        (g as any).rebuildGrid();
        (g as any).moveEnemies(TICK);
        (g as any).time += TICK;
      }
      const dist = Math.hypot(en.x - x0, en.y - y0);
      return { vel: dist / 1.5, base: e.speed };
    };
    const alone = mkSwarm(1);
    const pack = mkSwarm(12);
    console.log(`     swarm   : yalnız ${alone.vel.toFixed(0)} px/sn · 12'li sürü ${pack.vel.toFixed(0)} px/sn (taban ${alone.base})`);
    check('sürü yalnızken taban hızın ALTINDA', alone.vel < alone.base,
      `${alone.vel.toFixed(0)} < ${alone.base}`);
    check('sürü kalabalıkken belirgin hızlanıyor', pack.vel > alone.vel * 1.25,
      `${pack.vel.toFixed(0)} > ${(alone.vel * 1.25).toFixed(0)}`);
    // ⚠️ TAVAN: bu kontrol kalkarsa yoğun sahnede sürü oyuncudan hızlı olur.
    check('sürü hızı tavanlı (oyuncuyu geçmiyor)', pack.vel <= alone.base * BEHAVIOR.swarm.maxMul + 2,
      `${pack.vel.toFixed(0)} ≤ ${(alone.base * BEHAVIOR.swarm.maxMul).toFixed(0)}`);
  }

  // ÇEMBERCİ: teğet hareket YAPMALI ama sonunda YAKINSAMALI.
  // İkinci koşul birincisinden önemli — sabit yörüngede dönen düşman bölümü kilitler.
  {
    const ci = probe('circler', 420, 14);
    console.log(`     circler : mesafe ${ci.minD.toFixed(0)}–${ci.maxD.toFixed(0)} px, yanal ${ci.lateral.toFixed(0)} px`);
    const straightC = probe('chase', 420, 14);
    check('çemberci teğet hareket ediyor (düz gelmiyor)', ci.lateral > straightC.lateral + 30,
      `${ci.lateral.toFixed(0)} > ${straightC.lateral.toFixed(0)}`);
    check('çemberci İÇERİ kapanıyor (bölüm kilitlenmez)', ci.minD < 90,
      `en yakın ${ci.minD.toFixed(0)} px`);
  }

  // KAPSAM: `Behavior` birliğindeki her kalıp en az bir düşmana bağlı olmalı.
  // Ölü config, oyunda karşılığı olmayan tasarım demek — sessizce birikir.
  {
    const used = new Set(ENEMIES.map((e) => e.behavior ?? 'chase'));
    const all = ['chase', 'weave', 'ranged', 'charger', 'swarm', 'circler'];
    const unused = all.filter((b) => !used.has(b as any));
    console.log(`     kapsam  : ${used.size}/${all.length} kalıp kullanımda`);
    check('her davranış kalıbının bir düşmanı var', unused.length === 0, unused.join(', ') || 'tamam');
    // Taban gerekli ama çoğunluk olmamalı: düz kovalayan oranı yarıyı geçmesin
    const plain = ENEMIES.filter((e) => (e.behavior ?? 'chase') === 'chase').length;
    console.log(`     ayrışma : ${ENEMIES.length - plain}/${ENEMIES.length} düşmanın özel davranışı var`);
    check('düz kovalayanlar azınlıkta', plain * 2 < ENEMIES.length,
      `${plain}/${ENEMIES.length}`);
  }

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
  check('aynı seed aynı nadir gold', x.gold === y.gold, `${x.gold} = ${y.gold}`);
  check('düşüş NADİR (kill başına maaş değil)', x.gold < x.kills,
    `${x.gold} gold / ${x.kills} kill`);
  // ⚠️ ÇOK SEED — tek seed'e "gold düşmeli" dedirtmek YAZI-TURA.
  // Bu satır önce `x.gold > 0` diyordu ve seed 4242'de kırmızı yandı; ölçüldü:
  // 100 kill'de altı seed'in üçü SIFIR düşüş veriyor (4242:0 · 9999:13 · 1:0
  // · 77:3 · 555:0 · 31337:5). Yani sıfır, düşüşün NADİR olmasının doğal
  // sonucu — bozuk olan mekanik değil, ölçümdü. Korunması gereken şey
  // "her koşuda düşer" değil, "hiç düşmez hâle gelmedi".
  const cokSeed = [4242, 9999, 1, 77, 555, 31337].map((sd) => runRare(sd).gold);
  const dusen = cokSeed.filter((v) => v > 0).length;
  console.log(`     6 seed: ${cokSeed.join(', ')} nadir gold`);
  check('düşüş mekanizması ÇALIŞIYOR (6 seedin en az biri)', dusen > 0,
    `${dusen}/6 seed düşüş verdi`);
  check('ama HER koşuda düşmüyor (gerçekten nadir)', dusen < 6, `${dusen}/6`);
  // ⚠️ "FARKLI SEED FARKLI SONUÇ" DA TEK ÇİFTE BAĞLIYDI (4242 vs 9999) ve
  // aynı tuzağa düştü: ikisi de 0 verince "determinizm bozuk" diye kırmızı
  // yandı. Oysa düşüş nadir; iki koşunun ikisinin de sıfır olması sıradan bir
  // sonuç. Soru tek çiftle değil KÜME ile sorulmalı: seed sonucu gerçekten
  // değiştiriyor mu?
  check('seed sonucu DEĞİŞTİRİYOR (6 seed hepsi aynı değil)',
    new Set(cokSeed).size > 1, `${new Set(cokSeed).size} farklı değer`);
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
/**
 * MEKANİK ÖLÇÜMLERİN BÖLÜMÜ — bilerek "son bölüm" DEĞİL.
 *
 * ⚠️ Bu ölçümler eskiden `STAGES[STAGES.length - 1]` kullanıyordu ve ikinci
 * kitap (11-25) eklenince ÜÇÜ BİRDEN kırmızı yandı. Sebep testlerde değil
 * seçimdeydi: 25. bölümün hasar çarpanı 7,0 ve tek temas oyuncuyu aynı tick
 * içinde öldürüyor — `hp` her tick doldurulsa bile, çünkü `collidePlayer`
 * hasarı verip ölümü AYNI tick'te işliyor. Sahne dolmadan koşu bitiyordu.
 *
 * Bu ölçümlerin niyeti "en zor bölümü ölç" değil, "YOĞUN ve TEMSİLİ bir
 * sahnede mekanik çalışıyor mu". Kampanyanın birinci kitabının sonu (10)
 * tam olarak o: `maxAlive` yine 420 (perf tavanı aynı), ama hasar ölçümü
 * imkânsız kılmıyor.
 */
const OLCUM_BOLUMU = stageById(10) ?? STAGES[STAGES.length - 1];

const still = new Game(seedFromString('afk'), OLCUM_BOLUMU);
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
const heavy = OLCUM_BOLUMU;
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
      g.setInput(...engagedInput(i * TICK));
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
    // ⚠️ Sınıf, silahın SÜRÜCÜYE bağımlılığına göre: `homing` ve `mine`
    // oyuncunun baktığı yönü umursamıyor (auto), `beam` umursuyor
    // (directional). Yanlış sınıflamak, sınıf farkını denge sorunu sanmak olur.
    homing: 'auto', mine: 'auto',
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

// ── 8E) KARAKTERLER ──
// Karakter seçimi SÜS OLMAMALI: farklı silahla başlamalı, istatistikleri
// gerçekten değişmeli ve hiçbiri diğerinin açıkça altında kalmamalı.
console.log('\n[8E] Karakterler');
{
  const ids = new Set(WEAPONS.map((w) => w.id));
  const badW = HEROES.filter((h) => !ids.has(h.weapon)).map((h) => `${h.id}→${h.weapon}`);
  check('her karakterin başlangıç silahı geçerli', badW.length === 0, badW.join(', '));

  const weapons = HEROES.map((h) => h.weapon);
  check('karakterler FARKLI silahla başlıyor', new Set(weapons).size === weapons.length,
    weapons.join(', '));

  const READ = new Set(['might', 'armor', 'maxHp', 'recovery', 'cooldown', 'area',
    'crit', 'critMul',
    'projSpeed', 'duration', 'amount', 'moveSpeed', 'magnet', 'growth', 'greed', 'curse', 'revival']);
  const deadStat = HEROES.flatMap((h) => Object.keys(h.stats).filter((s) => !READ.has(s)).map((s) => `${h.id}→${s}`));
  check('karakter istatistikleri motorda okunuyor', deadStat.length === 0, deadStat.join(', '));

  // İstatistikler MOTORA yansıyor mu — sadece config'de durup işe yaramasın
  for (const h of HEROES) {
    const g = new Game(1, STAGES[0], {}, 'campaign', h.id);
    const base = new Game(1, STAGES[0], {}, 'campaign', '__none__'); // bilinmeyen → varsayılan
    const changed = (Object.keys(h.stats) as (keyof typeof g.stats)[])
      .some((k) => Math.abs(g.stats[k] - base.stats[k]) > 1e-9);
    check(`${h.name}: başlangıç silahı ${h.weapon}`, g.weapons[0]?.def.id === h.weapon,
      `${g.weapons[0]?.def.id}`);
    if (h.id !== HEROES[0].id) {
      check(`${h.name}: istatistikleri motora yansıyor`, changed);
    }
  }

  // GÜÇ DENGESİ — doğru soru "60 sn'de kaç kill" DEĞİL.
  // Water Priestess açıkça "yavaş öldürür, zor ölür" diye tasarlandı; sabit
  // pencerede kill saymak hasar-öncelikli karakteri yapısal olarak kayırır ve
  // tasarım tercihini denge hatası gibi gösterir. Kampanyanın gerçek sorusu:
  // BÖLÜMÜ BİTİREBİLİYOR MU, ve ne kadar sürede.
  // ── BAŞLANGIÇ SİLAHI OKUNAKLI MI ──
  // Oyun testinden gelen gerçek şikâyet: "bu hero ateş etmiyor."
  // Water Priestess'e Litany (orbit) verilmişti; yörünge silahı ekranda
  // hiçbir şey ATEŞLEMEZ, sadece halkaya DEĞEN düşmana vurur ve hareket eden
  // oyuncunun ardında sürüklenen sürü halkaya hiç girmez.
  //
  // Bu yüzden başlangıç silahı SÜRÜCÜSÜ farklı: yeni oyuncu durup sürüyü
  // üstüne almaz, SÜREKLİ HAREKET eder. `engagedInput` burada fazla iyimser
  // olurdu (Litany orada 77 kill yapıyor ama oyuncu 13,8 sn'de 2 kill aldı).
  console.log('     — başlangıç silahı okunaklılığı (ilk 30 sn, sürekli hareket) —');
  {
    // ⚠️ SİLAHI KARAKTERİN KENDİ GÖVDESİNDE ölç. İlk sürüm varsayılan gövdeye
    // (Fire Knight) silahı takıp ölçüyordu ve Leaf Ranger'ı 15,8 kill ile
    // sağlıklı gösteriyordu; canlı oyunda 15 saniyede 3 kill aldı. Sebep
    // Ranger'ın +%12 hareket hızı: sürüyü geride bırakıyor ve yön bağımlı
    // silahı hedef bulamıyor. Karakterin istatistiği silahını değiştirir.
    const movingKills = (heroId: string, weaponId: string) => {
      let total = 0;
      for (const s of ['a', 'b', 'c', 'd', 'e']) {
        const g = new Game(seedFromString(`start-${s}`), STAGES[0], {}, 'campaign', heroId);
        g.setViewport(1280, 720);
        g.weapons = [{ def: WEAPONS.find((w) => w.id === weaponId)!, level: 1, cd: 0 }];
        for (let i = 0; i < Math.round(30 / TICK); i++) {
          if (g.phase === 'levelup') g.choose(g.offers[0].id);
          if (g.phase !== 'running') break;
          g.hp = g.stats.maxHp;
          const t = i * TICK;
          g.setInput(Math.cos(t * 0.7), Math.sin(t * 0.7));   // hep hareket
          g.step();
        }
        total += g.kills;
      }
      return total / 5;
    };
    // Referans: varsayılan gövdede EN İYİ açılış silahı ne yapıyor
    const best = Math.max(...WEAPONS.map((w) => movingKills(HEROES[0].id, w.id)));
    // Ölçüm: her karakter KENDİ gövdesinde, KENDİ silahıyla
    const starters = HEROES.map((h) => ({ h, k: movingKills(h.id, h.weapon) }));
    for (const s of starters) {
      console.log(`       ${s.h.name.padEnd(20)} ${s.h.weapon.padEnd(10)} ${s.k.toFixed(1)} kill`);
    }
    const weak = starters.filter((s) => s.k < best * 0.4);
    check('her başlangıç silahı hareket ederken de iş görüyor (en iyinin ≥%40\'ı)',
      weak.length === 0,
      weak.map((s) => `${s.h.name} ${s.k.toFixed(1)}`).join(', ') || `eşik ${(best * 0.4).toFixed(1)}`);
  }

  //
  // ⚠️ ÇOK SEED ŞART. Tek seed'le ölçmek karakteri değil KELEBEK ETKİSİNİ
  // ölçüyor: teşhiste Ranger'ın üç istatistiği TEK TEK verildiğinde her
  // seferinde 100 kill/kazandı, ÜÇÜ BİRDEN verildiğinde 27'de takıldı.
  // Sebep güç değil — kill zamanlaması kayınca level-up anı kayıyor, teklif
  // havuzu değişiyor ve ikinci silah hiç gelmiyor. Beş seed'in ortancası
  // bu gürültüyü siler.
  const SEEDS = ['hero-a', 'hero-b', 'hero-c', 'hero-d', 'hero-e'];
  const oneRun = (heroId: string, seed: string) => {
    const g = new Game(seedFromString(seed), STAGES[0], {}, 'campaign', heroId);
    g.setViewport(1280, 720);
    const limit = Math.round(240 / TICK);
    for (let i = 0; i < limit; i++) {
      if (g.phase === 'levelup') {
        // ⚠️ ÖNCE YENİ SİLAH, sonra yükseltme. Körlemesine offers[0] almak
        // karakteri değil TEKLİF KARIŞTIRMASININ ŞANSINI ölçüyordu; sadece
        // "silah" demek de yetmedi çünkü MEVCUT silahın yükseltmesi de silah
        // sayılıyor: teşhiste knight yeni silahlar alıp 100 kill yaptı,
        // ranger sickle'ı 2. seviyeye çıkarıp 26'da takıldı — aynı silahla.
        // Gerçek oyuncu erken oyunda kapsama alanı için YENİ silah alır.
        const pick = g.offers.find((o) => o.kind === 'weapon-new')
          ?? g.offers.find((o) => o.kind.startsWith('weapon'))
          ?? g.offers[0];
        g.choose(pick.id);
      }
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;              // hayatta kalmayı değil TEMİZLEMEYİ ölçüyoruz
      g.setInput(...engagedInput(i * TICK));
      g.step();
    }
    return { won: g.phase === 'won', sec: g.time };
  };

  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const rows = HEROES.map((h) => {
    const runs = SEEDS.map((s) => oneRun(h.id, s));
    const wins = runs.filter((r) => r.won);
    return {
      name: h.name,
      wins: wins.length,
      med: wins.length ? median(wins.map((r) => r.sec)) : Infinity,
    };
  }).sort((a, b) => a.med - b.med);

  for (const r of rows) {
    console.log(`     ${r.name.padEnd(20)} ${r.wins}/${SEEDS.length} bitirdi` +
      `${r.wins ? `, ortanca ${r.med.toFixed(0)} sn` : ''}`);
  }
  check('her karakter bölümü çoğu seed\'de bitirebiliyor (≥3/5)',
    rows.every((r) => r.wins >= 3),
    rows.filter((r) => r.wins < 3).map((r) => `${r.name} ${r.wins}/5`).join(', ') || 'hepsi');
  const fast = rows[0].med, slow = rows[rows.length - 1].med;
  check('en yavaş karakter en hızlının 2.5 katından fazla sürmüyor', slow <= fast * 2.5,
    `${rows[0].name} ${fast.toFixed(0)} sn vs ${rows[rows.length - 1].name} ${slow.toFixed(0)} sn`);
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
    'crit', 'critMul',
    'projSpeed', 'duration', 'amount', 'moveSpeed', 'magnet', 'growth', 'greed', 'curse', 'revival']);
  const dead = PASSIVES.filter((p) => !READ.has(p.stat)).map((p) => `${p.id}→${p.stat}`);
  check('ölü pasif yok (hepsi motorda okunuyor)', dead.length === 0, dead.join(', '));
}

// Silahlar level-up'ta toplanabiliyor mu — SİLAH TERCİH EDEN seçiciyle.
// Körlemesine offers[0] seçmek yanlış olurdu: seçenek sırası kasıtlı karışık,
// o yüzden kör seçici bazen hep pasif alır ve test sistemi değil şansı ölçer.
const acq = new Game(seedFromString('acquire'), OLCUM_BOLUMU);
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

  // KALİBRASYON sabitin kendisinde ölçülür. `new Game(1)` artık varsayılan
  // KARAKTERİ de yüklüyor (Fire Knight +1 armor, +%8 can) — onun bonusunu
  // "taban istatistik" sanmak kalibrasyonu sessizce kaydırırdı.
  check('taban istatistikler VS ile aynı',
    STAT_BASE.might === 1 && STAT_BASE.armor === 0 && STAT_BASE.cooldown === 1
    && STAT_BASE.amount === 0 && STAT_BASE.maxHp === 100,
    `might ${STAT_BASE.might}, armor ${STAT_BASE.armor}, cd ${STAT_BASE.cooldown}, ` +
    `amount ${STAT_BASE.amount}, hp ${STAT_BASE.maxHp}`);
  // Varsayılan karakterin bonusu gerçekten TABANIN ÜSTÜNE biniyor mu
  check('varsayılan karakter bonusu tabana ekleniyor',
    base.armor > STAT_BASE.armor && base.maxHp > STAT_BASE.maxHp,
    `armor ${base.armor}, hp ${base.maxHp}`);

  // her pasifi max seviyeye çıkar ve istatistiğe yansıyor mu bak
  for (const def of PASSIVES.slice(0, 4)) {
    const t = new Game(1);
    t.setViewport(1280, 720);
    (t as any).givePassive(t.hero, def.id);
    const p = t.passives.find((x) => x.def.id === def.id)!;
    p.level = def.maxLevel;
    (t as any).recomputeStats(t.hero);
    const before = STAT_BASE[def.stat];
    const after = t.stats[def.stat];
    const moved = def.stat === 'cooldown' ? after < before : after > before;
    check(`${def.name} → ${def.stat} değişiyor`, moved, `${before} → ${after.toFixed(2)}`);
  }

  // tavanlar tutuyor mu — cooldown dibi ve amount tavanı
  const capTest = new Game(1);
  capTest.setViewport(1280, 720);
  (capTest as any).passives = PASSIVES.map((def) => ({ def, level: def.maxLevel * 20 })); // absürt seviye
  (capTest as any).recomputeStats(capTest.hero);
  check('cooldown %10 dibinin altına inmiyor', capTest.stats.cooldown >= COOLDOWN_FLOOR - 1e-9,
    `${capTest.stats.cooldown.toFixed(3)}`);
  check('amount tavanı (10) aşılmıyor', capTest.stats.amount <= STAT_CAP.amount!, `${capTest.stats.amount}`);
  check('might tavanı (%1000) aşılmıyor', capTest.stats.might <= STAT_CAP.might!, `${capTest.stats.might}`);
  check('armor tavanı (50) aşılmıyor', capTest.stats.armor <= STAT_CAP.armor!, `${capTest.stats.armor}`);
}

// Second Burial gerçekten diriltiyor mu — ölümü engellemeli
{
  // ZOR bölümde test edilmeli — kolay bölümde oyuncu ölmüyor, diriliş tetiklenmiyor
  const g = new Game(seedFromString('revive'), OLCUM_BOLUMU);
  g.setViewport(1280, 720);
  (g as any).givePassive(g.hero, 'burial');
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
  const g = run(seedFromString('offers'), { seconds: 900, driver: 'flee', invincible: true, stage: OLCUM_BOLUMU });
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

// ── 10B) BOSS YAKINSAMA GARANTİSİ — en tehlikeli regresyon ──
// ⚠️ KIRMIZI ÇİZGİ: boss'un hiçbir fazı MESAFE TUTMAZ. Boss sahnedeki tek
// düşmanken kiting yaparsa bölüm SONSUZA KADAR bitmez. Repo bu tuzağa bir kez
// düştü (Ossuary Halls, 25 dakika, hiç bitmedi) ve orada kaçanlar normal
// düşmanlardı — boss tek başına çok daha kolay kilitler.
// ⚠️ DÖRT ARKETİPİN DÖRDÜ DE SINANIR, sadece tabandaki `warden` değil.
// Tek arketiple koşan bir test hiçbir şey ifade etmezdi: kilitlenme riski
// tam olarak YENİ eklenen kalıplarda. Biri mesafe tutarsa bölüm sonsuza
// kadar bitmez ve oyuncu koşusunu (ve gold'unu) kaybeder.
const ARCHS: readonly BossArchetype[] = ['warden', 'keeper', 'choir', 'harrower'];

console.log('\n[10B] Boss yakınsama garantisi — DÖRT ARKETİP');
for (const arch of ARCHS) {
  // Arketip ZORLANIYOR, sıraya güvenilmiyor: yeni bir boss bölümü eklenince
  // sıra kayar ve test sessizce başka bir kalıbı ölçmeye başlardı.
  const base = STAGES[2];
  const st: StageDef = { ...base, boss: { ...base.boss!, archetype: arch } };
  // ⚠️ SEED DÖRT ARKETİPTE DE AYNI — bu bir detay değil, ölçümün kendisi.
  // İlk denemede seed arketip adından türetiliyordu; `warden` koşusu 10
  // dakikada bölümü bitiremedi ve test "warden kilitleniyor" dedi. Oysa
  // kilitlenen bir şey yoktu: diğer üçü aynı bölümü 148/217/177 sn'de
  // bitirdi, tek fark seed'di. (`curve.test.mts`'te öğrenilen aynı ders:
  // tek seed yazı-turadır.) Aynı seed'le değişen TEK şey arketip oluyor.
  const g = new Game(seedFromString('boss-yakinsama'), st);
  g.setViewport(1280, 720);
  // ⚠️ BUILD SABİT — level-up piyangosuna BIRAKILMAZ.
  //
  // Test önce `offers[0]` politikasıyla koşuyordu ve silah havuzuna 3 silah
  // eklenince DÖRT ARKETİP DE ÇÖKTÜ: yapay oyuncu başka kartlar çekti, iki
  // seviye-1 silahla kaldı, sürüyü temizleyemedi, boss hiç doğmadı. Boss
  // kodunda hiçbir şey değişmemişti — ölçüm bozulmuştu. (Ölçüldü: aynı
  // senaryoda YALNIZCA `shard` ile de takılıyor, yani suç yeni silahlarda
  // değil, testin bir kart çekilişine bağlı olmasındaydı.)
  //
  // Bu bölümün sorusu "boss yakınsıyor mu"; "yapay oyuncu iyi kart çekti mi"
  // değil. Sabit ve yeterli bir build, soruyu sorulmak istenen soru yapıyor.
  g.weapons = [
    // ⚠️ SEVİYE 3 — ÖLÇÜLEREK seçildi, gözden değil. Seviye 8'de bölüm
    // temizleniyor ama boss 3,6 saniye yaşıyor: telegraf ve küre HİÇ
    // görülmüyor, yani test boss davranışını değil boss'un ölüm hızını
    // ölçüyor. Seviye 1'de ise sürü hiç temizlenmiyor (boss doğmuyor).
    // Ölçüm: lv8 → boss 3,6 sn · lv5 → 11,8 sn · lv3 → 16,0 sn · lv2 → 36,6 sn.
    // 3 hem bölümü 141 sn'de bitiriyor hem boss'a nefes bırakıyor.
    { def: weaponById('shard')!, level: 3, cd: 0 },
    { def: weaponById('lash')!, level: 3, cd: 0 },
  ];
  let enYakin = Infinity;
  let bossGoruldu = false;
  let telegrafGoruldu = false;
  let fazDegisti = false;
  let mermiGoruldu = 0;
  let dogruArketip = false;
  let kureGoruldu = false;

  const ticks = Math.round(600 / TICK);   // 10 dakika bütçe
  for (let i = 0; i < ticks; i++) {
    if (g.phase === 'levelup') g.choose(g.offers[0].id);
    if (g.phase !== 'running') break;
    g.hp = g.stats.maxHp;                  // ölçüm: oyuncu ölmesin
    const t = i * TICK;
    g.setInput(Math.cos(t * 0.7), Math.sin(t * 0.7));
    g.step();

    const boss = g.enemies.find((e) => e.boss);
    if (boss?.boss) {
      bossGoruldu = true;
      dogruArketip = boss.boss.arch === arch;
      enYakin = Math.min(enYakin, Math.hypot(boss.x - g.px, boss.y - g.py));
      if (boss.boss.telegraph > 0) telegrafGoruldu = true;
      if (boss.boss.phase === 1) fazDegisti = true;
      mermiGoruldu = Math.max(mermiGoruldu, g.enemyShots.length);
      // Mezar küresi ARKETİPTEN BAĞIMSIZ — dördünde de görülmeli
      if (g.enemyShots.some((s) => s.radius >= BOSS.orbRadius)) kureGoruldu = true;
    }
  }

  check(`${arch}: sahneye geldi ve doğru arketiple doğdu`, bossGoruldu && dogruArketip);
  // ⚠️ ASIL TEST: boss oyuncuya YAKLAŞABİLİYOR mu? Mesafe tutsaydı bu sayı
  // hiç düşmez ve bölüm asla bitmezdi.
  check(`${arch}: YAKLAŞIYOR (kiting yapmıyor)`, enYakin < 140,
    `en yakın ${Math.round(enYakin)} px`);
  check(`${arch}: bölüm 10 dakikada BİTİYOR`, g.phase === 'won',
    `${g.phase} · ${Math.round(g.time)} sn`);
  check(`${arch}: telegraf + faz çalışıyor`, telegrafGoruldu && fazDegisti);
  // ⚠️ Küre arketipten BAĞIMSIZ ikinci yetenek: dördünde de atılmalı.
  // Atılmasaydı `warden` dışındaki arketiplerde sessizce kaybolmuş olurdu —
  // telegraf dalı erken `return` ediyor ve küre oraya konsaydı tam da öyle olurdu.
  check(`${arch}: mezar küresi atılıyor`, kureGoruldu);
  // `choir` gerçekten mermi üretiyor mu — üretmiyorsa arketip sadece bir
  // isim olur ve sessizce `warden`a döner.
  if (arch === 'choir') {
    check('choir: gerçekten yaylım atıyor', mermiGoruldu > 0, `${mermiGoruldu} mermi`);
  }
}

// ── 10C) KEEPER'IN GÜVENLİ MERKEZİ ──
// ⚠️ Bu arketibin TAMAMI bu kuralda. Merkez güvenli değilse `keeper`,
// `warden`ın daha uzun telegraflı bir kopyasıdır — yani çeşitlilik diye
// eklenen şey hiçbir şey eklememiş olur.
console.log('\n[10C] keeper: merkez GERÇEKTEN güvenli mi');
{
  const base = STAGES[2];
  const st: StageDef = { ...base, boss: { ...base.boss!, archetype: 'keeper' } };

  /**
   * Oyuncuyu boss'a göre belirli bir MESAFEYE ışınlayıp aldığı hasarı topla.
   *
   * ⚠️ MESAFE, ORAN DEĞİL — ve bu ilk ölçümün düzeltilmesi. İlk hâli oyuncuyu
   * `slamR * 0.15`e koyuyordu; o nokta güvenli halkanın içindeydi ama boss'un
   * GÖVDESİNİN de içindeydi, yani oyuncu her tick TEMAS hasarı yiyordu.
   * Test 17.963 hasar görüp "merkez güvenli değil" dedi — oysa ölçtüğü şey
   * halka değil, boss'a sarılmaktı. Sonda `bosluk` ile gövdeden uzak,
   * güvenli çemberin içinde bir nokta seçiliyor.
   */
  function halkaHasari(nokta: (bossR: number, slamR: number, ic: number) => number): number {
    const g = new Game(seedFromString('keeper-merkez'), st);
    g.setViewport(1280, 720);
    // ⚠️ Build sabit — gerekçe [10B]'deki notta.
    g.weapons = [
      { def: weaponById('shard')!, level: 3, cd: 0 },
      { def: weaponById('lash')!, level: 3, cd: 0 },
    ];
    let toplam = 0;
    const ticks = Math.round(600 / TICK);
    for (let i = 0; i < ticks; i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      const boss = g.enemies.find((e) => e.boss);
      if (boss?.boss) {
        const ic = boss.boss.slamR * BOSS_ARCH.keeper.innerMul;
        g.px = boss.x + nokta(boss.radius, boss.boss.slamR, ic);
        g.py = boss.y;
        g.iframe = 0;
        // ⚠️ MERMİLER TEMİZLENİYOR — bu ölçüm SADECE HALKAYI soruyor.
        // Temizlenmeden 103 hasar okundu ve test "merkez güvenli değil" dedi;
        // oysa o hasar MEZAR KÜRESİNDENDİ. Gerçek oyuncu küreyi görüp yana
        // kayar (küre 92 px/sn, oyuncu 165 — ~0,9 sn tepki penceresi), ama bu
        // ölçüm oyuncuyu her tick aynı noktaya ışınlayıp dokunulmazlığını da
        // siliyor, yani kaçmayı YAPISAL OLARAK imkânsız kılıyor. Ölçülmek
        // istenen şey o değil: soru "halka merkezi vuruyor mu".
        g.enemyShots.length = 0;
        const once = g.hp;
        g.step();
        if (g.hp < once) toplam += once - g.hp;
        g.hp = g.stats.maxHp;
      } else {
        g.hp = g.stats.maxHp;
        g.setInput(Math.cos(i * TICK * 0.7), Math.sin(i * TICK * 0.7));
        g.step();
      }
    }
    return toplam;
  }

  // Güvenli nokta: gövdeye değmeyecek kadar uzak, iç çemberin içinde kalacak
  // kadar yakın — ikisinin ortası.
  const iceride = halkaHasari((bossR, _s, ic) => (bossR + PLAYER.radius + 6 + ic) / 2);
  const disarida = halkaHasari((_b, slamR) => slamR * 0.85);
  // ⚠️ Karşılaştırmalı ölçüm: "merkezde hasar yok" tek başına bir şey
  // kanıtlamaz — halka HİÇ vurmuyor olabilirdi. İkinci sayı ölçümü anlamlı
  // kılıyor.
  check('güvenli merkezde hasar YOK', iceride === 0, `${iceride}`);
  check('dış bantta hasar VAR (ölçüm anlamlı)', disarida > 0, `${disarida}`);
}

// Evrim ŞARTLARI: eksik pasifle evrim OLMAMALI, tam şartla OLMALI
function evolveScenario(weaponMax: boolean, passiveMax: boolean) {
  const g = new Game(1);
  g.setViewport(1280, 720);
  const w = g.weapons.find((x) => x.def.id === 'shard')!;
  w.level = weaponMax ? w.def.maxLevel : 1;
  (g as any).givePassive(g.hero, 'hands');
  const p = g.passives.find((x) => x.def.id === 'hands')!;
  p.level = passiveMax ? p.def.maxLevel : 1;
  (g as any).recomputeStats(g.hero);
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
  (g as any).givePassive(g.hero, 'hands');
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
  (g as any).givePassive(g.hero, 'hands');
  g.passives[0].level = g.passives[0].def.maxLevel;
  g.chests.push({ x: g.px, y: g.py, evolution: true });
  g.step();
  let sawEvolvedOffer = false;
  for (let i = 0; i < 60; i++) {
    (g as any).rollOffers(g.hero);
    if (g.offers.some((o) => o.id === 'w:reliquary' || o.name === 'Reliquary')) sawEvolvedOffer = true;
  }
  check('evrimleşmiş silah level-up havuzunda çıkmıyor', !sawEvolvedOffer);
  check('evrim sonrası taban silah gitti', g.weapons.every((x) => x.def.id !== 'shard'));
  console.log(`     evrim sonrası: ${g.weapons.map((x) => x.def.name).join(', ')}`);
}

console.log(`\n${FAIL.length === 0 ? '✅ TÜM TESTLER GEÇTİ' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
