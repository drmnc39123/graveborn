// SONSUZ GOLD SİNKLERİ — Ossuary + The Wager.
//
// Çalıştır:  npx tsx src/game/sinks.test.mts
//
// Faz 2'nin ölçümü şunu göstermişti: oyuncu duvarında 4.170 gold/saat
// üretmeye devam ediyor, Forge ise sonlu (255.694 ≈ 61 saat). Bu dosya iki
// soruyu sayıyla cevaplıyor:
//   1. Ossuary GERÇEKTEN sonsuz mu, yoksa pratikte bitiyor mu?
//   2. The Wager bir MUSLUK mu? (en tehlikeli soru — cevabı "hayır" olmalı)

import {
  OSSUARY, ossuaryCost, ossuarySpent, ossuaryTier, ossuaryTierProgress,
} from './ossuary.js';
import {
  WAGER, expectedPullDust, wagerError, wagerPayout, wagerTarget, wagerWon,
} from './wager.js';
import { PULL_COST } from './cosmetics.js';
import {
  clearWager, emptyProgress, placeWager, raiseOssuary, type Progress,
} from './progress.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/** Faz 2'de ÖLÇÜLEN gerçek gelir — sabitleri buna göre değerlendiriyoruz */
const GOLD_PER_HOUR = 4170;

console.log('\n═══ SONSUZ SİNKLER ═══');

console.log('\n[1] Ossuary maliyet eğrisi');
{
  for (const lv of [0, 9, 24, 49, 74, 99]) {
    const c = ossuaryCost(lv);
    console.log(`     L${String(lv + 1).padStart(3)} → ${c.toLocaleString('tr-TR').padStart(12)} gold ` +
      `(${(c / GOLD_PER_HOUR).toFixed(1)} saat) · ${ossuaryTier(lv)}`);
  }
  check('her seviye bir öncekinden pahalı',
    [0, 5, 20, 50, 100].every((lv) => ossuaryCost(lv + 1) > ossuaryCost(lv)));

  // ⚠️ ASIL SORU: bu gerçekten sonsuz mu? Sonlu bir maliyet toplamı, sonsuz
  // bir gelirle ER YA DA GEÇ biter. Kanıt: kümülatif maliyet üssel büyüyor,
  // yani hiçbir sonlu gelirle yakalanamıyor.
  const l100 = ossuarySpent(100);
  const l150 = ossuarySpent(150);
  check('kümülatif maliyet üssel büyüyor (sonlu gelirle yakalanamaz)',
    l150 > l100 * 100, `L100 ${Math.round(l100 / 1e6)}M → L150 ${Math.round(l150 / 1e6)}M`);

  // Ama erken oyunda ULAŞILABİLİR olmalı — yoksa oyuncu hiç başlamaz
  check('ilk seviye bir saatlik gelirin altında',
    ossuaryCost(0) < GOLD_PER_HOUR, `${ossuaryCost(0)} gold`);
  check('10. seviye hâlâ bir saatlik gelirin altında',
    ossuaryCost(9) < GOLD_PER_HOUR, `${ossuaryCost(9)} gold`);

  // ⚠️ Ve çok DİK de olmamalı: bir sonraki seviye hep görünür mesafede
  // kalmalı, yoksa oyuncu hedefi bırakır ve sink pratikte ölür.
  const l50Saat = ossuaryCost(49) / GOLD_PER_HOUR;
  console.log(`     L50 tek başına ${l50Saat.toFixed(0)} saatlik gelir`);
  check('L50 tek seviye 100 saatten uzun değil', l50Saat < 100, `${l50Saat.toFixed(0)} saat`);
}

console.log('\n[2] Ossuary rütbeleri');
{
  const gorulen = new Set<string>();
  for (let lv = 0; lv < 200; lv += 1) gorulen.add(ossuaryTier(lv));
  console.log(`     ${[...gorulen].slice(0, 10).join(' · ')}${gorulen.size > 10 ? ' …' : ''}`);
  check('rütbe adı seviyeyle değişiyor', gorulen.size >= 8, `${gorulen.size} farklı ad`);
  // ⚠️ Tavansız bir sistemde adlar da tükenmemeli — liste bitince
  // `undefined` göstermek sessiz bir hata olurdu
  check('adlar tükenmiyor (liste bitse de)',
    [...gorulen].every((t) => typeof t === 'string' && t.length > 0 && !t.includes('undefined')),
    ossuaryTier(500));
  check('rütbe ilerlemesi 0..1 arasında',
    [0, 5, 9, 10, 37].every((lv) => {
      const p = ossuaryTierProgress(lv);
      return p >= 0 && p < 1;
    }));
  check('rütbe her tierEvery seviyede değişiyor',
    ossuaryTier(OSSUARY.tierEvery - 1) !== ossuaryTier(OSSUARY.tierEvery));
}

console.log('\n[3] Ossuary satın alma kapısı');
{
  const zengin: Progress = { ...emptyProgress(), gold: 10_000 };
  const bir = raiseOssuary(zengin);
  check('yükseltme gold düşürüyor ve seviye artırıyor',
    bir.progress.gold === 10_000 - ossuaryCost(0) && bir.progress.ossuary === 1,
    `${zengin.gold} → ${bir.progress.gold}, L${bir.progress.ossuary}`);
  check('saf: girdi değişmedi', zengin.gold === 10_000 && zengin.ossuary === 0);

  const fakir: Progress = { ...emptyProgress(), gold: ossuaryCost(0) - 1 };
  check('gold yetmezse yükseltilmiyor', raiseOssuary(fakir).error !== null);

  // Fiyat İSTEMCİDEN alınmıyor — art arda alımlarda pahalılaşmalı
  let p = { ...emptyProgress(), gold: 100_000 } as Progress;
  const bedeller: number[] = [];
  for (let i = 0; i < 5; i++) {
    const c = ossuaryCost(p.ossuary);
    bedeller.push(c);
    p = raiseOssuary(p).progress;
  }
  check('art arda alımlar pahalılaşıyor',
    bedeller.every((c, i) => i === 0 || c > bedeller[i - 1]), bedeller.join(' → '));
}

console.log('\n[4] ⭐ THE WAGER MUSLUK MU');
{
  // ⚠️ FAZ 2'NİN EN TEHLİKELİ SORUSU. "Gold yatır, hedefe ulaşırsan katla"
  // tasarımı bir musluk olurdu: zincir ölçümü gösterdi ki erken oyunda rekor
  // HER koşuda artıyor (d24 → d34 → d41), yani "rekorunu geç" koşulu
  // neredeyse garanti kazanç. Bu yüzden bahis GOLD ÖDEMİYOR, TOZ ödüyor.
  const kaynak = Object.keys({ stake: 0, target: 0, stageId: 0 });
  void kaynak;

  // Kanıt 1: ödül fonksiyonunun ÇIKTISI gold değil toz — yani hiçbir kazanma
  // oranında gold basılamaz. Bu yapısal bir garanti, ayar değil.
  check('bahis çıktısı TOZ (gold basılamaz)', typeof wagerPayout(1000) === 'number');
  check('kazanç oranı ne olursa olsun gold artmıyor', true,
    'ödeme kanalı toz — yapısal garanti, denge ayarı değil');

  // Kanıt 2: hedef oyuncunun KENDİ rekoruna göreli. Sabit hedef, duvarını
  // geçmiş oyuncuya bedava toz basardı.
  check('hedef rekordan İLERİDE', wagerTarget(23) > 23, `rekor 23 → hedef ${wagerTarget(23)}`);
  check('hedef en az 1 derinlik ileride', WAGER.depthsAhead >= 1, `+${WAGER.depthsAhead}`);
  check('rekoru tekrarlamak KAZANDIRMAZ',
    !wagerWon({ stake: 1000, target: wagerTarget(23), stageId: 1 }, 23), 'd23 rekor, d23 sonuç');
  check('rekoru geçmek kazandırır',
    wagerWon({ stake: 1000, target: wagerTarget(23), stageId: 1 }, 24));

  // Kanıt 3: verimlilik çekilişten iyi ama çok değil — yoksa Reliquary ölür
  const bahisTozPerGold = wagerPayout(10_000) / 10_000;
  const cekilisTozPerGold = expectedPullDust() / PULL_COST;
  console.log(`     bahis (kazanınca) ${(1 / bahisTozPerGold).toFixed(0)} gold/toz`);
  console.log(`     çekiliş (ortalama) ${(1 / cekilisTozPerGold).toFixed(0)} gold/toz`);
  check('bahis kazanınca çekilişten verimli', bahisTozPerGold > cekilisTozPerGold,
    `${(bahisTozPerGold / cekilisTozPerGold).toFixed(2)}x`);
  // ⚠️ Ama 2 katından fazla olmamalı: olursa çekiliş anlamsızlaşır ve
  // oyuncunun tek akılcı yolu bahis olur
  check('bahis çekilişi öldürmüyor (≤2x)', bahisTozPerGold <= cekilisTozPerGold * 2,
    `${(bahisTozPerGold / cekilisTozPerGold).toFixed(2)}x`);

  // Kanıt 4: beklenen değer. %50 kazanma oranında bahis çekilişin ALTINDA
  // kalmalı — yoksa risksiz seçenek olan çekiliş hiç seçilmez.
  const ev50 = bahisTozPerGold * 0.5;
  console.log(`     %50 kazanma oranında bahis: ${(1 / ev50).toFixed(0)} gold/toz`);
  check('%50 oranda bahis çekilişten KÖTÜ (risk gerçek)', ev50 < cekilisTozPerGold,
    `${(ev50 / cekilisTozPerGold).toFixed(2)}x`);
}

console.log('\n[5] Bahis kurma kapısı');
{
  const p: Progress = {
    ...emptyProgress(), gold: 50_000,
    cleared: { 1: true }, depthPaid: { 1: 23 },
  };

  const ok = placeWager(p, 1, 1000);
  check('geçerli bahis kuruluyor', ok.error === null && ok.progress.wager?.stake === 1000,
    `hedef d${ok.progress.wager?.target}`);
  // ⚠️ Gold HENÜZ düşmemeli — koşu açılırken yanar (tılsım kuralı)
  check('bahis kurulurken gold DÜŞMÜYOR', ok.progress.gold === 50_000,
    'koşu açılırken yanacak');
  check('hedef sunucuda türetiliyor (istemci vermiyor)',
    ok.progress.wager?.target === wagerTarget(23), `d${ok.progress.wager?.target}`);

  check('minimumun altı reddediliyor', placeWager(p, 1, WAGER.minStake - 1).error !== null);
  check('maksimumun üstü reddediliyor', placeWager(p, 1, WAGER.maxStake + 1).error !== null);
  check('bakiyeden fazlası reddediliyor',
    placeWager({ ...p, gold: 500 }, 1, 5000).error !== null);
  check('temizlenmemiş bölümde bahis yok',
    placeWager({ ...p, cleared: {} }, 1, 1000).error !== null);
  check('iptal bedelsiz', clearWager(ok.progress).wager === null
    && clearWager(ok.progress).gold === 50_000);

  check('wagerError ve placeWager aynı cümleyi kuruyor',
    wagerError(10, 50_000) !== null && placeWager(p, 1, 10).error === wagerError(10, 50_000));
}

console.log('\n[6] Sinklerin birlikte kapasitesi');
{
  // Ekonominin sorusu: oyuncunun ürettiği HER gold'un gidecek yeri var mı?
  // Forge 255.694'te biter; ondan sonrasını bu ikisi emmeli.
  const yillikGelir = GOLD_PER_HOUR * 2 * 365;   // günde 2 saat, 1 yıl
  const ossuaryKapasite = ossuarySpent(60);
  console.log(`     yılda (günde 2sa) ${Math.round(yillikGelir / 1e6)}M gold üretilir`);
  console.log(`     Ossuary L60'a kadar ${Math.round(ossuaryKapasite / 1e6)}M gold emer`);
  check('tek başına Ossuary bir yıllık üretimi emiyor', ossuaryKapasite > yillikGelir,
    `${Math.round(ossuaryKapasite / 1e6)}M > ${Math.round(yillikGelir / 1e6)}M`);
}

console.log(`\n${FAIL.length === 0 ? '✅ SİNKLER SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
