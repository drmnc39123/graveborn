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
// ⚠️ `hours.test.mts` İLE İLİŞKİSİ — ikisi de gerekli, ikisi de uzlaşmış.
// Bir dönem 13 KAT çelişiyorlardı (447 vs 6.031 gold/saat) ve denge kararları
// bu sayılara dayanıyordu; sebep bu dosyadaki üç hesap hatasıydı (bkz.
// `cohort.goldSaat` ve [9]). Düzeltildikten sonra ölçülen:
//     curve [9] zincir : 4.085 gold/saat → Forge ağacı ≈ 151 saat
//     hours [4] tekrar : 6.031 gold/saat → Forge ağacı ≈ 102 saat
// Kalan fark GERÇEK ve senaryo farkı: curve'ün zinciri İLK keşif koşusunu da
// sayıyor (sığ derinlikte nadir düşüş az — 70 gold), hours ise doğrudan
// checkpoint'ten başlayan saf tekrar koşusunu ölçüyor. Yani curve alt sınır,
// hours üst sınır. İkisi ayrışırsa önce ORAN HESABINA bak, dengeye değil.
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

/**
 * Kaç seed — tek sayı olmalı (ortanca net çıksın).
 *
 * ⚠️ 5 DEĞİL 15. Ölçüldü ve tek başına bir hataya yol açtı: derinlik
 * dağılımı ÇİFT TEPELİ ve iç içe. 15 seed'de ölçülen gerçek dağılımlar:
 *   boş         : 4,4,4,4,4,4,4,9,9,9,9,9,10,13,18
 *   yarım Forge : 4,4,4,4,9,9,9,14,14,24,25,26,26,27,27
 * İkisinde de tam 4'te sert bir yığılma var. 5 seed çekince veterana
 * beşi de "4" kümesinden, tazeye üst taraftan gelebiliyor ve ölçüm
 * "Forge oyuncuyu KÖTÜLEŞTİRİYOR" diyordu — tamamen gürültü. Bu testin
 * söylediği her şey bu sayıya bağlı.
 */
const SEED_COUNT = 15;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Çeyreklikler — ORTANCA TEK BAŞINA YETMİYOR.
 *
 * ⚠️ Çift tepeli bir dağılımda ortanca hangi tepeye düştüğünü söylemiyor.
 * Karşılaştırmalar çeyrekliklerle yapılmalı; tek sayıya bakan bir eşik,
 * gürültüyü bulgu sanar.
 */
function quartiles(xs: number[]): { min: number; q1: number; med: number; q3: number; max: number } {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { min: s[0], q1: at(0.25), med: at(0.5), q3: at(0.75), max: s[s.length - 1] };
}

/** "d9 (4–18, çeyrek 4/9)" — dağılımı TEK SATIRDA okunur kıl */
function dagilim(xs: number[]): string {
  const q = quartiles(xs);
  return `d${q.med} (${q.min}–${q.max}, çeyrek ${q.q1}/${q.q3})`;
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
    /**
     * SAATLİK GELİR — ⚠️ ORTANCA/ORTANCA DEĞİL, TOPLAM/TOPLAM.
     *
     * Bu bir kez yanlış yazıldı ve ölçüm aletini yalancı yaptı: `rareGold`
     * bir koşunun ortancası, `seconds` BAŞKA bir koşunun ortancası. İkisini
     * bölmek hiçbir gerçek koşunun saatlik gelirini vermiyor — sadece
     * "ortanca gold" felaket koşularıyla aşağı çekilirken "ortanca süre"
     * aynı koşulardan gelmediği için oran uyduruk çıkıyordu. Ölçüldü:
     * checkpoint saatlik geliri 2289→1644 DÜŞÜRÜYOR gibi göründü, oysa
     * doğru hesapla ARTIRIYOR.
     *
     * Σgold/Σsüre = kohortun gerçek toplam kazancı / gerçek toplam süresi.
     * `hours.test.mts` baştan beri bunu yapıyor; iki alet arasındaki kat
     * farkının kaynağı buydu.
     */
    goldSaat: runs.reduce((s, r) => s + r.rareGold, 0) /
      (runs.reduce((s, r) => s + r.seconds, 0) / 3600),
    timeouts: runs.filter((r) => r.end === 'timeout').length,
    spread: `${Math.min(...depths)}–${Math.max(...depths)}`,
    /** ⚠️ Karşılaştırmalar BUNUNLA yapılmalı, `deepest` ile değil */
    depths,
    q: quartiles(depths),
    metin: dagilim(depths),
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

// ⚠️ ORTANCA DEĞİL ÇEYREKLİK KARŞILAŞTIRILIYOR. Dağılım çift tepeli ve
// iç içe (bkz. SEED_COUNT); tek sayıya bakan eşik gürültüyü bulgu sanıyor
// ve tam olarak bunu yaptı: "Forge oyuncuyu KÖTÜLEŞTİRİYOR" diye ölçtü.
// Üst çeyrek "iyi giden koşularda ne kadar derine iniliyor" sorusu ve
// yatırımın etkisi orada görünüyor.
check('Forge yatırımı derinliği ARTIRIYOR',
  veteran.q.q3 > fresh.q.q3 && veteran.q.med >= fresh.q.med,
  `üst çeyrek ${fresh.q.q3} → ${veteran.q.q3} · ortanca ${fresh.q.med} → ${veteran.q.med}`);
// ⚠️ Buradaki süre tavanı sayısı TEK BAŞINA bir hata değil — asıl soru
// "oyuncu ilerlemeye devam edebiliyor mu", cevabı [9]'da zincirle ölçülüyor.

// ── [3] TEKRAR KOŞUSUNUN GELİRİ ──
//
// ASIL SORU BU. Oyuncu duvarına çarptıktan sonra her koşu ne kazandırıyor?
// "İlerleme öder, tekrar ödemez" kuralı gereği yeni derinlik yoksa ilerleme
// ödülü SIFIR — geriye sadece nadir düşüş kalır. O damla saatlik geliri tek
// başına taşıyabiliyor mu?
console.log('\n[3] Tekrar koşusunun geliri (yeni derinlik YOK)');
// ⚠️ İKİ AYRI SORU, İKİ AYRI İSTATİSTİK — karıştırma:
//   "TEK koşu tılsımı ödüyor mu"  → ORTANCA gold (tipik koşu)
//   "saatte ne kazanıyorum"       → Σgold/Σsüre (kohort oranı, `goldSaat`)
const repeatGold = veteran.rareGold;
const repeatHours = veteran.seconds / 3600;
const goldPerHour = veteran.goldSaat;
console.log(`     tipik koşu ${repeatGold} gold / ${mmss(veteran.seconds)} · ` +
  `kohort oranı ${Math.round(goldPerHour)} gold/saat`);

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
console.log(`     d1'den:   ${veteran.metin}, ${mmss(veteran.seconds)}, ` +
  `${veteran.timeouts}/${SEED_COUNT} tavan`);
console.log(`       ham: ${[...veteran.depths].sort((a, b) => a - b).join(',')}`);
console.log(`     d${cp + 1}'den: ${resumed.metin}, ${mmss(resumed.seconds)}, ` +
  `${resumed.timeouts}/${SEED_COUNT} tavan`);
console.log(`       ham: ${[...resumed.depths].sort((a, b) => a - b).join(',')}`);

// ⚠️ BURADA ORTANCAYA BAKMA — bu eşik bir kez yanlış kuruldu ve "checkpoint
// çalışmıyor" diye KIRMIZI yandı. Ölçülen ham dağılımlar:
//     d1'den: 4,4,4,4,4,4,9,9,14,14,14,19,22,25,25
//     d6'dan: 9,9,9,9,9,9,9,9,14,14,17,19,19,25,28
// Checkpoint koşuların %40'ını oluşturan "d4'te öldü" kümesini TAMAMEN
// siliyor (taban 4→9) ve aynı derinliği YARI SÜREDE veriyor (11:19→6:07).
// Ortancanın kıpırdamamasının sebebi, kayan kümenin tam ortanca değerinin
// (9) üstüne oturup o kovayı 2'den 8'e şişirmesi. Çift tepeli dağılımda
// ortanca, ölçebilecek en kötü istatistik.
//
// Checkpoint'in TASARIM SÖZÜ de zaten "daha derine in" değildi: israf edilen
// süreyi geri kazandırmak. Ölçülen tam olarak o.
check('checkpoint felaket koşuları siliyor', resumed.q.q1 > veteran.q.q1,
  `alt çeyrek d${veteran.q.q1} → d${resumed.q.q1} · taban d${veteran.q.min} → d${resumed.q.min}`);

// ASIL EKONOMİK İDDİA: aynı derinlik daha kısa sürede → saatlik gelir artıyor.
console.log(`     saatlik: d1'den ${Math.round(veteran.goldSaat)} → ` +
  `d${cp + 1}'den ${Math.round(resumed.goldSaat)} gold/saat`);
check('checkpoint saatlik geliri ARTIRIYOR', resumed.goldSaat > veteran.goldSaat,
  `${Math.round(veteran.goldSaat)} → ${Math.round(resumed.goldSaat)} gold/saat`);

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
  // ⚠️ Zincir pahalı (her halka 30 dk simülasyon) ama 3 seed YETMİYORDU:
  // derinlik dağılımının modu 4 ve 3 seed'in ortancası kolayca oraya
  // düşüyor — ölçüm "zincir hiç ilerlemiyor" diyordu, oysa ilerliyor.
  const CHAIN_SEEDS = 5;
  const zincir: { run: number; start: number; reached: number; gold: number }[] = [];
  // ⚠️ Saatlik gelir için GERÇEK süre toplanıyor. Burada bir kez
  // `halka sayısı × RUN.durationSec` yazıldı — yani her koşunun tam 30 dk
  // sürdüğü varsayıldı. Ölçülen koşular 6–11 dk'da ÖLÜYOR; payda 3–5 kat
  // şişince saatlik gelir aynı oranda düşük çıktı (447 gold/saat) ve
  // "Forge ağacı 1.377 saat" gibi `hours.test.mts` ile 13 kat çelişen bir
  // sayı üretti. Süre varsayılmaz, ÖLÇÜLÜR.
  let zincirGold = 0, zincirSec = 0;
  let cpNow = 0;
  for (let n = 1; n <= 6; n++) {
    const start = checkpointFor(cpNow) + 1;
    const outs = Array.from({ length: CHAIN_SEEDS }, (_, i) =>
      descentRun(`chain${n}#${i}`, { upgrades: forgeMid, startDepth: start }));
    // ⚠️ ORTANCA DEĞİL **EN İYİ** — ve bu bir modelleme düzeltmesi, knob
    // ayarı değil. Checkpoint oyuncunun EN İYİ koşusuyla açılıyor: kimse
    // tek koşu oynayıp bırakmıyor, iyi bir koşu tutturana kadar deniyor ve
    // kaydedilen o. Ortanca (ve üst çeyrek de) checkpoint'i hiç açamayan
    // bir hayalet oyuncu modelliyordu — derinlik dağılımının modu 4 ve
    // küçük örneklemin ortası oraya çakılıyor.
    // Yani `reached` = "5 denemenin en iyisi".
    const reached = Math.max(...outs.map((r) => r.deepest));
    const gold = median(outs.map((r) => r.rareGold));
    // Σgold/Σsüre — [3] ve [7]'deki kuralın aynısı, ortanca/ortanca DEĞİL
    zincirGold += outs.reduce((s, r) => s + r.rareGold, 0);
    zincirSec += outs.reduce((s, r) => s + r.seconds, 0);
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

  const zincirSaat = zincirGold / Math.max(1, zincirSec / 3600);
  console.log(`     duvar ≈ d${sonHalka.reached} · ${zincir.length} koşu · ` +
    `ortalama ${mmss(zincirSec / (zincir.length * CHAIN_SEEDS))}/koşu · ` +
    `${Math.round(zincirSaat)} gold/saat (nadir düşüş)`);
  console.log(`     → Forge ağacı (${tree.toLocaleString('tr-TR')}) ≈ ` +
    `${Math.round(tree / Math.max(1, zincirSaat))} saat`);
  // ⚠️ Bu saat sayısı bir ALT SINIR DEĞİL, TAVAN: yalnızca nadir düşüş
  // sayılıyor, ilerleme ödülü (musluğun büyük parçası, bkz. [4]) hariç.
  check('duvar sonrası saatlik gelir ölçülebilir düzeyde', zincirSaat > 0,
    `${Math.round(zincirSaat)} gold/saat`);
}

// ── SONUÇ ──
console.log(`\n${'─'.repeat(62)}`);
if (FAIL.length) {
  console.log(`✗ ${FAIL.length} ölçüm sınırın dışında:`);
  for (const f of FAIL) console.log(`   • ${f}`);
  process.exit(1);
}
console.log('✓ tüm ekonomi ölçümleri sınırlar içinde');
