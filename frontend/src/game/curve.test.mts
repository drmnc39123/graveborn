// GERÇEK OYUNCU EĞRİSİ — ekonominin ölçüm aleti.
//
// Çalıştır:  npx tsx src/game/curve.test.mts
//
// NEDEN AYRI BİR DOSYA: `sim.test.mts` motorun DOĞRU çalıştığını kanıtlıyor
// (aynı seed → aynı sonuç, bölüm bitiyor, silah vuruyor). Bu dosya bambaşka
// bir soru soruyor: oyunu OYNAMAK nasıl bir şey? Bir koşu ne kadar sürer,
// oyuncu nerede duvara çarpar, saatte kaç gold kazanır, aldığı tılsım kendini
// öder mi?
//
// ⚠️ MUTLAK SAYILARA GÜVENME, FARKLARA GÜVEN.
// Buradaki "oyuncu" `fleeInput` yapay zekâsı: yakın tehditten kaçar, boşlukta
// mücevher toplar. İnsandan BELİRGİN ŞEKİLDE KÖTÜ — konumlanma yapmaz, sürüyü
// yönetmez, tehlikeyi öngörmez. Yani ölçülen duvar derinliği insanın
// ulaşabileceğinin ALT SINIRI'dır.
//
// Bu bir kusur değil, bilinçli bir kabul: aynı yapay zekâ değişiklikten önce
// ve sonra koştuğunda ARADAKİ FARK gerçektir. "Forge fiyatını yarıya indirince
// oyuncu 2 derinlik daha iniyor" güvenilir bir cümle; "oyuncu derinlik 23'te
// duvara çarpıyor" ise sadece bir alt sınırdır. Denge kararları farklara
// dayandırılmalı.
//
// ⚠️ TEK SEED YALAN SÖYLER. Descent'te ölüm anı birkaç saniyelik şansa bağlı;
// tek koşu ±4 derinlik oynayabiliyor. Bu yüzden her ölçüm SEED_COUNT koşunun
// ORTANCASI — ortalama değil, çünkü tek bir felaket koşu ortalamayı çeker.

import { Game } from './engine.js';
import { DESCENT, RUN, STAGES, TICK, checkpointFor, depthGold, descentStage } from './config.js';
import { CHARMS, CHARM_SLOTS, charmBonus, mergeBonus } from './charms.js';
import { FORGE, permanentBonus, treeTotalCost } from './forge.js';
import { allowedStartDepth, applyRunResult, emptyProgress, type Progress } from './progress.js';
import { seedFromString } from './rng.js';

const FAIL: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) FAIL.push(name);
};

/** Kaç seed'in ortancası alınacak — tek sayı olmalı (ortanca net çıksın) */
const SEED_COUNT = 5;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// ── OYUNCU VEKİLİ ─────────────────────────────────────────────────────

/**
 * Hayatta kalma sürücüsü — `sim.test.mts`'tekiyle aynı mantık.
 *
 * ⚠️ Kopya olması kasıtlı: o dosyadaki sürücü DENGE ölçümü için ayarlı
 * (durup sürüyü üstüne alan `engagedInput` ile eşleşiyor), buradaki ise
 * HAYATTA KALMA ölçüyor. İkisini tek fonksiyona bağlamak, birini
 * ayarlarken diğerinin sessizce bozulması demek olurdu.
 */
function fleeInput(g: Game): [number, number] {
  let ax = 0, ay = 0, threat = 0;
  for (const e of g.enemies) {
    const dx = e.x - g.px, dy = e.y - g.py;
    const d2 = dx * dx + dy * dy;
    if (d2 > 260 * 260) continue;
    const d = Math.sqrt(d2) || 1;
    ax += dx / d / d; ay += dy / d / d;
    if (d < 120) threat += 1;
  }
  let vx = -ax, vy = -ay;

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
      const w = threat === 0 ? 1.4 : 0.6;
      vx += (dx / d) * w; vy += (dy / d) * w;
    }
  }
  const dist = Math.hypot(g.px, g.py);
  if (dist > 2100) { vx += -g.px / dist * 0.6; vy += -g.py / dist * 0.6; }
  return [vx, vy];
}

/**
 * KART SEÇİMİ — "makul oyuncu" vekili.
 *
 * ⚠️ `sim.test.mts` hep `offers[0]`'ı seçiyor; orada doğru, çünkü amaç
 * determinizmi ölçmek. Burada yanlış olurdu: teklifler rng ile karılıyor,
 * yani "ilkine bas" = RASTGELE oyna. Ekonomi ölçümünde rastgele oynayan bir
 * oyuncu duvara olduğundan çok daha erken çarpar ve bütün gold/saat hesabını
 * aşağı çeker.
 *
 * Kural basit ve VS'in gerçek oynanışına yakın: önce elini kur (yeni silah),
 * sonra elindekileri büyüt (düşük seviyeliyi öne al), pasifi ihmal etme.
 * Puanlar mutlak değil sıralama içindir.
 */
function smartPick(g: Game): string {
  let bestId = g.offers[0]?.id ?? '';
  let bestScore = -Infinity;
  for (const o of g.offers) {
    let s: number;
    if (o.kind === 'weapon-new') s = g.weapons.length < 4 ? 100 : 12;
    else if (o.kind === 'weapon-up') s = 80 - (o.level ?? 1) * 3;
    else if (o.kind === 'passive-new') s = g.passives.length < 4 ? 62 : 22;
    else s = 50 - (o.level ?? 1) * 2;
    if (s > bestScore) { bestScore = s; bestId = o.id; }
  }
  return bestId;
}

// ── KOŞU ──────────────────────────────────────────────────────────────

interface DepthRow {
  depth: number;
  /** bu derinliği bitirdiğinde koşunun toplam süresi */
  atSec: number;
  level: number;
  /** derinlik bittiğinde kalan can yüzdesi */
  hpPct: number;
  rareGold: number;
}

interface RunOut {
  deepest: number;
  seconds: number;
  level: number;
  rareGold: number;
  /** 'dead' = canı bitti · 'timeout' = 30 dk tavanına çarptı */
  end: 'dead' | 'timeout';
  rows: DepthRow[];
}

function descentRun(seedText: string, opts: {
  stageId?: number;
  upgrades?: Record<string, number>;
  charms?: readonly string[];
  /** checkpoint — koşunun başlayacağı derinlik */
  startDepth?: number;
} = {}): RunOut {
  const stageId = opts.stageId ?? 1;
  const stage = STAGES.find((s) => s.id === stageId)!;
  const perm = mergeBonus(permanentBonus(opts.upgrades ?? {}), charmBonus(opts.charms ?? []));
  const g = new Game(seedFromString(seedText), stage, perm, 'descent', undefined, opts.startDepth ?? 1);
  g.setViewport(1280, 720);

  const rows: DepthRow[] = [];
  let seen = 0;
  const limit = Math.round(RUN.durationSec / TICK) + 10;

  for (let i = 0; i < limit; i++) {
    if (g.phase === 'levelup') g.choose(smartPick(g));
    if (g.phase !== 'running') break;
    g.setInput(...fleeInput(g));
    g.step();
    // Derinlik atlandığı KAREDE kaydet — sonradan bakılırsa can zaten değişmiş olur
    if (g.stage.deepestCleared > seen) {
      seen = g.stage.deepestCleared;
      rows.push({
        depth: seen, atSec: g.time, level: g.level,
        hpPct: g.hp / g.stats.maxHp, rareGold: g.rareGold,
      });
    }
    g.events.clear();
  }

  return {
    deepest: g.stage.deepestCleared,
    seconds: g.time,
    level: g.level,
    rareGold: Math.floor(g.rareGold),
    // 30 dk tavanına dayandıysa oyuncuyu CAN değil TAKVİM durdurmuştur
    end: g.time >= RUN.durationSec - 1 ? 'timeout' : 'dead',
    rows,
  };
}

/** Aynı senaryoyu SEED_COUNT kez koş, ortancayı ve dağılımı ver */
function cohort(label: string, opts: Parameters<typeof descentRun>[1] = {}) {
  const runs: RunOut[] = [];
  for (let i = 0; i < SEED_COUNT; i++) runs.push(descentRun(`${label}#${i}`, opts));
  const depths = runs.map((r) => r.deepest);
  const mid = runs.find((r) => r.deepest === median(depths))!;
  return {
    runs, mid,
    deepest: median(depths),
    seconds: median(runs.map((r) => r.seconds)),
    rareGold: median(runs.map((r) => r.rareGold)),
    timeouts: runs.filter((r) => r.end === 'timeout').length,
    spread: `${Math.min(...depths)}–${Math.max(...depths)}`,
  };
}

// ── ÖLÇÜM ─────────────────────────────────────────────────────────────

console.log(`\n═══ GRAVEBORN — OYUNCU EĞRİSİ (${SEED_COUNT} seed ortancası) ═══`);
console.log('⚠️  Yapay zekâ insandan kötü — mutlak derinlik ALT SINIR, farklar gerçek.\n');

console.log('[1] Taze oyuncu — Forge boş, tılsım yok, bölüm 1');
const fresh = cohort('fresh');
console.log(`     derinlik ${fresh.deepest} (dağılım ${fresh.spread}), ` +
  `${mmss(fresh.seconds)}, ${fresh.rareGold} nadir gold, ${fresh.timeouts}/${SEED_COUNT} süre tavanı`);
for (const r of fresh.mid.rows) {
  console.log(`       d${String(r.depth).padStart(2)}  ${mmss(r.atSec).padStart(5)}  ` +
    `LV${String(r.level).padStart(2)}  HP ${String(Math.round(r.hpPct * 100)).padStart(3)}%  ` +
    `${Math.floor(r.rareGold)} gold`);
}

check('taze oyuncu en az 3 derinlik iniyor', fresh.deepest >= 3, `d${fresh.deepest}`);

// ── [2] KOŞUYU NE BİTİRİYOR: CAN MI, TAKVİM Mİ? ──
//
// Tasarım sözü açık (config.ts:136): "Koşuyu bitiren şey zamanlayıcı DEĞİL,
// CAN". Süre tavanı bir TAKILMA KORUMASI olmalı, denge mekanizması değil.
// Oyuncuların kayda değer bir kısmı tavana dayanıyorsa söz tutulmuyordur.
console.log('\n[2] Koşuyu ne bitiriyor');
const forgeMid: Record<string, number> = {
  might: 10, health: 10, area: 9, recovery: 6, armor: 5,
  cooldown: 6, growth: 5, mspeed: 6, magnet: 6, greed: 6, pspeed: 5, duration: 5,
};
const veteran = cohort('veteran', { upgrades: forgeMid });
console.log(`     taze:    d${fresh.deepest}, ${mmss(fresh.seconds)}, ${fresh.timeouts}/${SEED_COUNT} tavan`);
console.log(`     Forge ½: d${veteran.deepest}, ${mmss(veteran.seconds)}, ${veteran.timeouts}/${SEED_COUNT} tavan ` +
  `(${spentText(forgeMid)})`);

function spentText(up: Record<string, number>): string {
  let s = 0;
  for (const u of FORGE) {
    const lv = Math.min(Math.max(0, up[u.id] ?? 0), u.maxLevel);
    for (let i = 0; i < lv; i++) s += Math.round(u.baseCost * Math.pow(u.growth, i));
  }
  return `${s.toLocaleString('tr-TR')} gold yatırım`;
}

check('Forge yatırımı derinliği ARTIRIYOR', veteran.deepest > fresh.deepest,
  `d${fresh.deepest} → d${veteran.deepest}`);
// ⚠️ Buradaki süre tavanı sayısı TEK BAŞINA bir hata değil — asıl soru
// "oyuncu ilerlemeye devam edebiliyor mu", cevabı [9]'da zincirle ölçülüyor.

// ── [3] TEKRAR KOŞUSUNUN GELİRİ ──
//
// ASIL SORU BU. Oyuncu duvarına çarptıktan sonra her koşu ne kazandırıyor?
// "İlerleme öder, tekrar ödemez" kuralı gereği yeni derinlik yoksa ilerleme
// ödülü SIFIR — geriye sadece nadir düşüş kalır. O damla saatlik geliri tek
// başına taşıyabiliyor mu?
console.log('\n[3] Tekrar koşusunun geliri (yeni derinlik YOK)');
const repeatGold = veteran.rareGold;
const repeatHours = veteran.seconds / 3600;
const goldPerHour = repeatGold / repeatHours;
console.log(`     ${repeatGold} gold / ${mmss(veteran.seconds)} → ${Math.round(goldPerHour)} gold/saat`);

const cheapest = [...CHARMS].sort((a, b) => a.cost - b.cost).slice(0, CHARM_SLOTS);
const dearest = [...CHARMS].sort((a, b) => b.cost - a.cost).slice(0, CHARM_SLOTS);
const cheapHand = cheapest.reduce((s, c) => s + c.cost, 0);
const dearHand = dearest.reduce((s, c) => s + c.cost, 0);
console.log(`     tılsım eli: en ucuz ${cheapHand} · en pahalı ${dearHand} gold (koşu başına yanar)`);
console.log(`     → tekrar koşusu tılsımı ${repeatGold >= dearHand ? 'ÖDÜYOR' : 'ÖDEMİYOR'}`);

check('tekrar koşusu EN UCUZ tılsım elini ödüyor', repeatGold >= cheapHand,
  `${repeatGold} gold vs ${cheapHand} maliyet`);

// ── [4] FORGE AĞACI KAÇ KOŞU EDER ──
console.log('\n[4] Forge ağacı ne kadar uzak');
const tree = treeTotalCost();
const runsToFill = Math.ceil(tree / Math.max(1, repeatGold));
console.log(`     ağaç toplamı ${tree.toLocaleString('tr-TR')} gold`);
console.log(`     tekrar koşusu geliriyle ${runsToFill.toLocaleString('tr-TR')} koşu ` +
  `≈ ${Math.round(runsToFill * repeatHours).toLocaleString('tr-TR')} saat`);

// İlk inişin TOPLAM ilerleme ödülü — musluğun büyük parçası
let firstDescent = 0;
for (let d = 1; d <= veteran.deepest; d++) firstDescent += depthGold(1, d);
console.log(`     ilk iniş (d1→d${veteran.deepest}) ilerleme ödülü: ${firstDescent.toLocaleString('tr-TR')} gold`);
console.log(`     → ağacın %${((firstDescent / tree) * 100).toFixed(1)}'i`);

// ── [5] YOĞUNLAŞMA: AĞACIN KAÇ SATIRI PARAYI YUTUYOR ──
//
// Bir ağacın "%85'i 3 satırda" olması gizli bir tuzak: oyuncuya 15 seçenek
// gösteriliyor ama gerçek karar 3 tanesinde. Kalan 12 satır süs.
console.log('\n[5] Forge ağacında yoğunlaşma');
const rows = FORGE.map((u) => {
  let s = 0;
  for (let i = 0; i < u.maxLevel; i++) s += Math.round(u.baseCost * Math.pow(u.growth, i));
  return { id: u.id, name: u.name, cost: s, top: Math.round(u.baseCost * Math.pow(u.growth, u.maxLevel - 1)) };
}).sort((a, b) => b.cost - a.cost);
const top3 = rows.slice(0, 3).reduce((s, r) => s + r.cost, 0);
for (const r of rows.slice(0, 5)) {
  console.log(`     ${r.name.padEnd(16)} ${String(r.cost).padStart(9)} gold ` +
    `(%${((r.cost / tree) * 100).toFixed(1)}) · en pahalı seviye ${r.top.toLocaleString('tr-TR')}`);
}
console.log(`     ilk 3 satır ağacın %${((top3 / tree) * 100).toFixed(1)}'i`);

check('ağacın ilk 3 satırı %60\'ı geçmiyor', top3 / tree <= 0.60,
  `%${((top3 / tree) * 100).toFixed(1)}`);
check('en pahalı tek seviye tekrar koşusunun 60 katını geçmiyor',
  rows[0].top <= repeatGold * 60,
  `${rows[0].top.toLocaleString('tr-TR')} gold = ${Math.round(rows[0].top / Math.max(1, repeatGold))} koşu`);

// ── [6] COIN SENSE AMORTİSMANI ──
//
// `greed` eskiden SADECE ilerleme ödülünü çarpıyordu. Oyuncu duvarına çarpıp
// yeni derinlik açamaz olduğunda ilerleme ödülü 0 → çarpanın çarptığı bir şey
// kalmıyordu: tam ihtiyaç anında ölü bir yükseltme. Artık nadir düşüş
// MİKTARINI da çarpıyor; bu ölçüm farkı GERÇEKTEN görüyor mu diye bakıyor.
console.log('\n[6] Coin Sense (greed) amortismanı');
const greedDef = FORGE.find((u) => u.id === 'greed')!;
let greedCost = 0;
for (let i = 0; i < greedDef.maxLevel; i++) greedCost += Math.round(greedDef.baseCost * Math.pow(greedDef.growth, i));
const greedPct = greedDef.perLevel * greedDef.maxLevel;

// AYNI seed, tek fark greed — başka hiçbir şey değişmemeli
const greedsiz = descentRun('greed-probe', { upgrades: {} });
const greedli = descentRun('greed-probe', { upgrades: { greed: greedDef.maxLevel } });
const artis = greedli.rareGold / Math.max(1, greedsiz.rareGold);
console.log(`     max ${greedDef.maxLevel} seviye = ${greedCost.toLocaleString('tr-TR')} gold, +%${Math.round(greedPct * 100)}`);
console.log(`     aynı seed — greed'siz ${greedsiz.rareGold} · greed'li ${greedli.rareGold} nadir gold (×${artis.toFixed(2)})`);

check('Coin Sense tekrar koşusunda ÇALIŞIYOR', greedli.rareGold > greedsiz.rareGold,
  `${greedsiz.rareGold} → ${greedli.rareGold}`);
// Beklenen çarpan 1+greedPct; ±%10 pay, çünkü iki koşu aynı seed'le başlasa da
// greed'li oyuncu farklı gold topladığı için ilerleyişi birebir aynı değil
check('artış beklenen çarpana yakın', Math.abs(artis - (1 + greedPct)) < 0.10 * (1 + greedPct),
  `×${artis.toFixed(2)} vs beklenen ×${(1 + greedPct).toFixed(2)}`);

// ── [7] CHECKPOINT: TEKRAR OYNANAN DERİNLİKLERİN MALİYETİ ──
//
// Checkpoint'ten ÖNCE descent her koşuda d1'den başlıyordu. Oyuncu d25'i
// görmek istiyorsa d1..d24'ü HER SEFERİNDE yeniden temizlemek zorundaydı ve
// o sürenin ilerleme ödülü SIFIRDI (zaten ödenmişti). Bu ölçüm hem israfı
// hem checkpoint'in onu ne kadar geri kazandırdığını gösteriyor.
console.log('\n[7] Checkpoint — israf edilen sürenin geri kazanımı');
const cp = Math.floor(veteran.deepest / DESCENT.bossEvery) * DESCENT.bossEvery;
const atCp = veteran.mid.rows.find((r) => r.depth === cp);
if (atCp) {
  console.log(`     ulaşılan d${veteran.deepest}; en yakın checkpoint d${cp}`);
  console.log(`     d1→d${cp} arası ${mmss(atCp.atSec)} = koşunun ` +
    `%${Math.round((atCp.atSec / veteran.seconds) * 100)}'i, ilerleme ödülü 0`);
}

const resumed = cohort('resume', { upgrades: forgeMid, startDepth: cp + 1 });
console.log(`     d1'den:   d${veteran.deepest} (dağılım ${veteran.spread}), ${mmss(veteran.seconds)}, ` +
  `${veteran.timeouts}/${SEED_COUNT} tavan`);
console.log(`     d${cp + 1}'den: d${resumed.deepest} (dağılım ${resumed.spread}), ${mmss(resumed.seconds)}, ` +
  `${resumed.timeouts}/${SEED_COUNT} tavan`);

check('checkpoint DAHA DERİNE indiriyor', resumed.deepest > veteran.deepest,
  `d${veteran.deepest} → d${resumed.deepest}`);

// Süre tavanı kaç derinliğe yetiyor — ham alt sınırla
let raw = 0, reach = 0;
for (let d = 1; d <= 400; d++) {
  const def = descentStage(1, d);
  raw += def.enemyCount / def.spawnRate;
  if (raw > RUN.durationSec) { reach = d - 1; break; }
}
console.log(`     30 dk tavanı d1'den HAM olarak d${reach}'e yetiyor (öldürme süresi hariç)`);
check('süre tavanı d1 koşusunda bağlayıcı değil', reach >= veteran.deepest * 1.5,
  `tavan d${reach} vs ulaşılan d${veteran.deepest}`);

// ── [8] CHECKPOINT PARA BASMIYOR MU ──
//
// ⚠️ ASIL GÜVENLİK SORUSU. Checkpoint oyuncuyu derinliğe ışınlıyor; ödül
// kuralı hâlâ "sadece yeni derinlik öder" ise bu bir kolaylık, değilse
// para basma makinesi. `applyRunResult` saf fonksiyonuyla doğrudan ölçülür.
console.log('\n[8] Checkpoint ödül kuralını bozuyor mu');
{
  const p: Progress = { ...emptyProgress(), cleared: { 1: true }, depthPaid: { 1: 23 } };
  // d21'den başlayıp d23'e kadar indi — HEPSİ zaten ödenmişti
  const tekrar = applyRunResult(p, { mode: 'descent', stageId: 1, cleared: false, deepestCleared: 23, rareGold: 0 });
  check('zaten ödenmiş derinlikleri tekrar geçmek 0 öder', tekrar.progressGold === 0,
    `${tekrar.progressGold} gold`);

  const yeni = applyRunResult(p, { mode: 'descent', stageId: 1, cleared: false, deepestCleared: 25, rareGold: 0 });
  const beklenen = depthGold(1, 24) + depthGold(1, 25);
  check('sadece YENİ derinlikler ödeniyor', yeni.progressGold === beklenen,
    `${yeni.progressGold} = d24+d25 (${beklenen})`);

  // İzin verilen başlangıç: d23 → checkpoint d20 → başlangıç d21
  check('izin verilen başlangıç checkpoint+1', allowedStartDepth(p, 1) === 21,
    `d${allowedStartDepth(p, 1)}`);
  check('hiç inilmemişse başlangıç d1', allowedStartDepth(emptyProgress(), 1) === 1);
}

// ── [9] DUVAR: ZİNCİRLEME KOŞULARDA İLERLEME NEREDE DURUYOR ──
//
// ⚠️ FAZ 2'NİN ASIL SORUSU BU. 30 dakikalık tavan tek bir koşuyu kesiyor ama
// checkpoint sayesinde bir sonraki koşu kaldığı yerden başlıyor. Yani doğru
// soru "koşu neyle bitti" değil, "OTURUMLAR BOYUNCA ilerleme sürüyor mu ve
// sonunda duruyor mu".
//
// İki şeyin BİRDEN doğru olması gerekiyor:
//   • ilerleme sürmeli — yoksa oyuncu ilk gün duvara toslar, oyunun 2. günü olmaz
//   • ilerleme SONUNDA durmalı — yoksa derinlik sonsuz para basar ve kısıt kalmaz
// Kısıt takvim değil BECERİ+NADİRLİK olsun diye duvarı üssel hpGrowth koymalı.
console.log('\n[9] Duvar — zincirleme koşularda ilerleme');
{
  // ⚠️ Zincir pahalı (her halka 30 dk simülasyon). Ortanca için 3 seed yeter;
  // burada ölçülen şey tek koşunun varyansı değil EĞİLİM.
  const CHAIN_SEEDS = 3;
  const zincir: { run: number; start: number; reached: number; gold: number }[] = [];
  let cpNow = 0;
  for (let n = 1; n <= 6; n++) {
    const start = checkpointFor(cpNow) + 1;
    const outs = Array.from({ length: CHAIN_SEEDS }, (_, i) =>
      descentRun(`chain${n}#${i}`, { upgrades: forgeMid, startDepth: start }));
    const reached = median(outs.map((r) => r.deepest));
    const gold = median(outs.map((r) => r.rareGold));
    zincir.push({ run: n, start, reached, gold });
    console.log(`     koşu ${n}: d${start}'den başladı → d${reached} (+${reached - start + 1}), ${gold} nadir gold`);
    // İlerleme durdu mu — yeni checkpoint eskisini geçmiyorsa duvar burası
    if (checkpointFor(reached) <= cpNow) { console.log('     → ilerleme DURDU (duvar)'); break; }
    cpNow = checkpointFor(reached);
  }

  const ilkHalka = zincir[0];
  const sonHalka = zincir[zincir.length - 1];
  check('zincir ilerliyor (ilk koşu checkpoint açıyor)',
    checkpointFor(ilkHalka.reached) > 0, `d${ilkHalka.reached}`);
  check('ilerleme sonunda DURUYOR (duvar var, sonsuz para yok)',
    zincir.length < 6 || sonHalka.reached - sonHalka.start < ilkHalka.reached - ilkHalka.start,
    `${zincir.length} halka, son kazanç +${sonHalka.reached - sonHalka.start + 1} derinlik`);

  const toplamGold = zincir.reduce((s, z) => s + z.gold, 0);
  const toplamSaat = zincir.length * (RUN.durationSec / 3600);
  console.log(`     duvar ≈ d${sonHalka.reached} · ${zincir.length} koşu · ` +
    `${Math.round(toplamGold / toplamSaat)} gold/saat (nadir düşüş)`);
  console.log(`     → Forge ağacı (${tree.toLocaleString('tr-TR')}) ≈ ` +
    `${Math.round(tree / Math.max(1, toplamGold / toplamSaat))} saat`);
}

// ── SONUÇ ──
console.log(`\n${'─'.repeat(62)}`);
if (FAIL.length) {
  console.log(`✗ ${FAIL.length} ölçüm sınırın dışında:`);
  for (const f of FAIL) console.log(`   • ${f}`);
  process.exit(1);
}
console.log('✓ tüm ekonomi ölçümleri sınırlar içinde');
