// TEMPO MÜHRÜ — bir koşu oyuncuya NE YAŞATIYOR?
//
// Çalıştır:  npx tsx src/game/pacing.test.mts
//
// NİYE AYRI BİR DOSYA: `curve.test` ekonomiyi ölçüyor (gold/saat, kaç saatte
// ağaç dolar), `sim.test` determinizmi. Bu dosya bambaşka bir soru soruyor:
// oyuncu koşu boyunca kaç KARAR veriyor, kurgusu TAMAMLANIYOR mu, türün asıl
// ödül anı olan EVRİM hiç yaşanıyor mu?
//
// ⚠️ NİYE VAR — ÖLÇÜLDÜ: 11 evrim özenle yazılmış ("her evrim FARKLI pasif
// ister" kuralı, 17 pasifin 11'i bir evrimin şartı) ve HİÇBİRİ tetiklenmiyor.
// Bu bir tuning kaprisi değil, oyunun en büyük vaadi hiç ödenmiyor. Böyle bir
// şeyin sessizce geri gelmemesi için mühür gerekiyor.
//
// ⚠️ ÖLÇÜM ALETİ ORTAK. `simPlayer.mts` — kendi yapay oyuncunu YAZMA. Bu
// oturumda iki kez denendi ve ikisi de yalan söyledi: (1) sadece kaçan,
// mücevher toplamayan oyuncu "18 dakikada 5 level-up" uydurdu, (2) derinlikte
// SIFIRLANAN `stage.killed` sayacı kill hızını 6 kat düşük gösterdi.
// Üstelik `hours.test` ve `ascension.test`in kendi kopyaları da BOZUKTU
// (olmayan alanlara bakıyorlardı → rastgele oynayan oyuncu).

import { FORGE, permanentBonus } from './forge.js';
import { EVOLUTIONS, MAX_WEAPONS, RUN, STAGES, TICK } from './config.js';
import { Game } from './engine.js';
import { seedFromString } from './rng.js';
import { fleeInput, smartPick } from './simPlayer.mjs';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const SEEDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

/** Forge profilleri — oyuncu ilerledikçe koşu bambaşka oluyor */
const bos: Record<string, number> = {};
const yari: Record<string, number> = {};
for (const u of FORGE) yari[u.id] = Math.floor(u.maxLevel / 2);

interface Sonuc {
  dk: number; secim: number; evrim: number; level: number;
  silah: number; pasif: number; derinlik: number; enYuksekSilah: number;
}

/**
 * @param sec kart seçici. Varsayılan "makul oyuncu"; evrim üst sınırını
 *   ölçmek için `evrimAvcisi` geçilir.
 */
function kos(seed: string, up: Record<string, number>,
  sec: (g: Game) => string = smartPick): Sonuc {
  const g = new Game(seedFromString(seed), STAGES[0], permanentBonus(up), 'descent', undefined, 1);
  g.setViewport(1280, 720);
  const limit = Math.round(RUN.durationSec / TICK) + 10;
  let secim = 0, evrim = 0, enYuksekSilah = 0, i = 0;
  for (; i < limit; i++) {
    if (g.phase === 'levelup') {
      secim += 1;
      g.choose(sec(g));
      if (g.events.has('evolve')) evrim += 1;
    }
    if (g.phase !== 'running') break;
    g.setInput(...fleeInput(g));
    g.step();
    for (const w of g.weapons) if (w.level > enYuksekSilah) enYuksekSilah = w.level;
  }
  return {
    dk: g.time / 60, secim, evrim, level: g.level,
    silah: g.weapons.length, pasif: g.passives.length,
    derinlik: g.stage.deepestCleared, enYuksekSilah,
  };
}

/**
 * KASITLI EVRİM AVCISI — üst sınır ölçer, normal oyuncu vekili DEĞİL.
 *
 * ⚠️ NİYE GEREKLİ: "evrim olmuyor" iki ayrı sebepten olabilir — ya ŞART
 * imkânsızdır, ya da vekil oyuncu hiç DENEMİYORDUR. Bu seçici her kararını
 * tek bir silah+pasif çiftine harcar; yine de evrim çıkmıyorsa suç oyuncuda
 * değil, sistemdedir.
 */
function evrimAvcisi(g: Game): string {
  const hedef = EVOLUTIONS[0];
  for (const o of g.offers) {
    if (o.id === `w:${hedef.weapon}` || o.id === `p:${hedef.passive}`) return o.id;
  }
  return smartPick(g);
}

const ort = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function profil(up: Record<string, number>, sec?: (g: Game) => string) {
  const r = SEEDS.map((s) => kos(s, up, sec));
  const o = (k: keyof Sonuc) => +ort(r.map((x) => x[k])).toFixed(1);
  return {
    dk: o('dk'), secim: o('secim'), evrim: o('evrim'), level: o('level'),
    silah: o('silah'), pasif: o('pasif'), derinlik: o('derinlik'),
    enYuksekSilah: o('enYuksekSilah'),
  };
}

console.log('\n═══ KOŞU TEMPOSU ═══');

console.log('\n[1] İlerleme aşamasına göre koşu profili');
// ⚠️ `tam` PROFİLİ DÜŞÜRÜLDÜ — bilgi kaybı kabul edildi. Her profil 6 adet
// 30-DAKİKALIK simülasyon demek; üç profil + avcı profili 24 koşu ediyordu
// ve test zaman aşımına uğrayıp HİÇ BİTMİYORDU. Koşmayan mühür, olmayan
// mühürdür. `tam` ile `yarı` ölçümlerde birbirine çok yakın çıkıyordu
// (evrim 0/0,2 · derinlik 27,3/26,2), yani kaybedilen ayrım küçük.
const p0 = profil(bos), pY = profil(yari);
for (const [ad, p] of [['sıfır', p0], ['yarı', pY]] as const) {
  console.log(`     ${ad.padEnd(6)} ${p.dk}dk · seçim ${p.secim} · silah ${p.silah}/${MAX_WEAPONS} · ` +
    `pasif ${p.pasif}/6 · evrim ${p.evrim} · en yüksek silah lv${p.enYuksekSilah} · derinlik ${p.derinlik}`);
}

// ⚠️ Yeni oyuncunun ilk koşusu bir ÖĞRENME koşusu; az karar vermesi normal.
// Asıl soru İLERLEMİŞ oyuncunun kurgusunu kurabiliyor mu.
check('ilerlemiş oyuncu yeterli karar veriyor (≥18)', pY.secim >= 18, `${pY.secim} seçim`);
check('pasif yuvaları doluyor (≥5/6)', pY.pasif >= 5, `${pY.pasif}/6`);

console.log('\n[2] ⭐ KURGU DENGELİ Mİ');
// ⚠️ ESKİ İDDİA "bir silah MAX seviyeye çıkabiliyor" idi ve YANLIŞ SORUYDU.
// 23 seçim, 12 yuvayı doldurmaya VE birini maxlamaya aynı anda yetmiyor.
//
// `MAX_WEAPONS` 6→4 denendi ve yakınsamayı gerçekten sağladı (silah
// lv4,8 → 6,7, kasıtlı avcı evrimleşti) AMA pasifleri 5,8/6'dan 1/6'ya
// ÇÖKERTTİ — 11 ölü evrimi 17 kullanılmayan pasife takas etmek olurdu.
// Geri alındı; gerekçe `config.ts` `MAX_WEAPONS` tanımında yazılı.
//
// Doğru soru "bir silah maxlanıyor mu" değil, KURGU DENGELİ Mİ — silah
// tarafı da pasif tarafı da yaşıyor mu. Evrimin ulaşılabilirliği [3]'te.
check('silah yuvalarının çoğu doluyor', pY.silah >= 4, `${pY.silah}/${MAX_WEAPONS}`);
check('silahlar gerçekten yükseliyor', pY.enYuksekSilah >= 5,
  `en yüksek lv${pY.enYuksekSilah}`);

console.log('\n[3] ⭐ EVRİM — türün asıl ödül anı');
// ⚠️ YALNIZ TEK EK PROFİL koşuluyor. Önce hem `yari` hem `tam` için avcı
// profili vardı; toplam 30 adet 30-dakikalık simülasyon ediyordu ve test
// kendi ağırlığından ZAMAN AŞIMINA uğrayıp hiç bitmiyordu. Çalışmayan bir
// mühür, olmayan mühürdür. Makul oyuncunun evrim sayıları [1]'de ZATEN
// hesaplandı — tekrar koşturmaya gerek yok.
const avY = profil(yari, evrimAvcisi);
console.log(`     kasıtlı avcı — yarı: evrim ${avY.evrim} · en yüksek silah lv${avY.enYuksekSilah}`);
console.log(`     makul oyuncu       : yarı ${pY.evrim} evrim/koşu`);
// ⚠️ ÖNCE "makul oyuncu da evrim görsün" hedefi BIRAKILMIŞTI: denenen her
// ayarda vekil oyuncu sıfır evrim yapıyordu ve sebebi yapısal görünüyordu
// (`smartPick` belirli bir çifti hedeflemiyor). Sonra doğru paket bulununca
// KENDİLİĞİNDEN geldi. Ders: "ulaşılamaz" demeden önce doğru kolu aramak.
//
// ⚠️ EŞİK DÜŞÜK (>0) ve bilerek: evrim hâlâ ağırlıklı olarak NİYET işi,
// VS'te de öyle. Soru "her koşuda oluyor mu" değil, "OLUYOR MU".
// Makul oyuncu da sayılıyor çünkü asıl korkulan şey sistemin komple
// kapanması — hangi profilde açıldığı ikincil.
const herhangiEvrim = avY.evrim > 0 || pY.evrim > 0;
check('⭐ EVRİM SİSTEMİ AÇIK (birileri ulaşabiliyor)', herhangiEvrim,
  `avcı ${avY.evrim} · makul ${pY.evrim}`);

console.log(`\n${FAIL.length === 0 ? '✅ TEMPO SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
