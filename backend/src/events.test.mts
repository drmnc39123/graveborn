// HAFTA SONU ETKİNLİĞİ — SUNUCU TARAFI ÖLÇÜMÜ.
//
// Takvim aritmetiği ayrı dosyada ölçüldü (frontend/src/game/events.test.mts).
// Burada sorulan soru para ile ilgili: çarpan DOĞRU YERE mi biniyor?
//
// Korunan dört kural:
//   1. çarpan `dropGold`'a biniyor, `progressGold`'a BİNMİYOR
//      (yoksa oyuncuya "ilerlemeyi hafta sonuna sakla" derdik)
//   2. çarpan TAVANDAN SONRA — yani yalancının tavanını büyütmüyor
//   3. `capped` bayrağı çarpandan etkilenmiyor
//      (etkinlik hafta sonu her koşu şüpheli işaretlenirse admin paneli ölür)
//   4. hafta içi hiçbir şey değişmiyor
//
// Çalıştır:  npx tsx src/events.test.mts

import { emptyProgress, type Progress } from '@game/progress';
import { eventMul } from '@game/events';
import { greedCeiling, maxRareGold, settleRun } from './reward.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const cleared1: Progress = {
  ...emptyProgress(), unlockedStage: 2,
  cleared: { 1: true }, firstClear: { 1: true },
};
const kosu = { deepestCleared: 5, rareGold: 180, cleared: false };

console.log('\n[1] Ashfall — düşüş gold\'u ×1,5');
{
  const normal = settleRun(cleared1, 'descent', 1, kosu);
  const etkinlik = settleRun(cleared1, 'descent', 1, kosu, Infinity, 1, 0, 1.5);
  console.log(`     hafta içi: ilerleme ${normal.progressGold} + düşüş ${normal.dropGold} = ${normal.awarded}`);
  console.log(`     Ashfall  : ilerleme ${etkinlik.progressGold} + düşüş ${etkinlik.dropGold} = ${etkinlik.awarded} (bonus ${etkinlik.eventGold})`);

  check('düşüş gold\'u arttı', etkinlik.dropGold > normal.dropGold,
    `${normal.dropGold} → ${etkinlik.dropGold}`);
  check('artış tam ×1,5', etkinlik.dropGold === Math.floor(normal.dropGold * 1.5),
    `${etkinlik.dropGold} = ⌊${normal.dropGold}×1,5⌋`);
  check('eventGold doğru raporlanıyor',
    etkinlik.eventGold === etkinlik.dropGold - normal.dropGold, `${etkinlik.eventGold}`);
  check('hafta içi koşuda bonus YOK', normal.eventGold === 0);
}

console.log('\n[2] ⭐ `progressGold` ÇARPILMIYOR (ilerlemeyi saklama teşviki yok)');
{
  // Aynı taze ilerlemeden iki koşu: biri hafta içi, biri etkinlikte. İkisi de
  // AYNI yeni derinlikleri ilk kez görüyor.
  const normal = settleRun(cleared1, 'descent', 1, kosu);
  const etkinlik = settleRun(cleared1, 'descent', 1, kosu, Infinity, 1, 0, 1.5);
  check('ilerleme ödülü değişmedi', etkinlik.progressGold === normal.progressGold,
    `${normal.progressGold} = ${etkinlik.progressGold}`);
  check('ilerleme ödülü sıfır değil (ölçüm anlamlı)', normal.progressGold > 0,
    `${normal.progressGold}`);
}

console.log('\n[3] ⭐ ÇARPAN TAVANDAN SONRA — yalancının tavanı büyümüyor');
{
  const tavan = maxRareGold('descent', 1, 5, greedCeiling(cleared1));
  const yalanci = settleRun(
    cleared1, 'descent', 1, { deepestCleared: 5, rareGold: 999_999, cleared: false },
    Infinity, 1, 0, 1.5,
  );
  console.log(`     yalancı 999.999 istedi → ${yalanci.dropGold} aldı (tavan ${tavan})`);
  check('iddia hâlâ tavana kırpılıyor', yalanci.dropGold === Math.floor(tavan * 1.5),
    `${yalanci.dropGold} = ⌊${tavan}×1,5⌋`);
  check('kırpma hâlâ işaretleniyor', yalanci.capped);

  // ASIL SORU: etkinlik yalanı KÂRLI hâle getirdi mi?
  //
  // ⚠️ BU ÖLÇÜM İLK DENEMEDE YANLIŞ KURULDU ve düzeltilen şey EŞİK DEĞİL,
  // ÖLÇÜMÜN KENDİSİ oldu. İlk hâli "yalancı/dürüst toplam oranı büyümesin"
  // diyordu ve 1,783 → 2,051 ile kırmızı yandı. Sebep bir açık değil, bir
  // ölçüm hatası: o koşuda kazancın 581'i `progressGold`'du — ÇARPILMAYAN
  // ve her derinlik için BİR KEZ ödenen bir terim. Ortak ve sabit bir terim
  // paydada dururken, pay çarpılınca oran ARİTMETİK OLARAK büyür. Yani test
  // etkinliği değil, tek seferlik ödülün varlığını ölçüyordu.
  //
  // Yalancı zaten ilk kez inen biri değil; TEKRAR KOŞUSU çeviriyor ve orada
  // `progressGold` SIFIR. Doğru ölçüm o durumda yapılır.
  const doymus: Progress = { ...cleared1, depthPaid: { 1: 5 } };
  const tekrarDurust = settleRun(doymus, 'descent', 1, kosu);
  const tekrarYalanci = settleRun(
    doymus, 'descent', 1, { deepestCleared: 5, rareGold: 999_999, cleared: false },
  );
  const evDurust = settleRun(doymus, 'descent', 1, kosu, Infinity, 1, 0, 1.5);
  const evYalanci = settleRun(
    doymus, 'descent', 1, { deepestCleared: 5, rareGold: 999_999, cleared: false },
    Infinity, 1, 0, 1.5,
  );
  check('ölçüm gerçekten tekrar koşusu (ilerleme ödülü sıfır)',
    tekrarDurust.progressGold === 0 && tekrarYalanci.progressGold === 0);

  const makasNormal = tekrarYalanci.awarded / tekrarDurust.awarded;
  const makasEtkinlik = evYalanci.awarded / evDurust.awarded;
  console.log(`     tekrar koşusunda yalancı/dürüst: hafta içi ${makasNormal.toFixed(3)} · Ashfall ${makasEtkinlik.toFixed(3)}`);
  check('etkinlik yalancıya EK avantaj vermiyor', makasEtkinlik <= makasNormal + 0.001,
    `${makasEtkinlik.toFixed(3)} ≤ ${makasNormal.toFixed(3)}`);
}

console.log('\n[4] ⭐ `capped` bayrağı etkinlikten ETKİLENMİYOR');
{
  const durust = settleRun(cleared1, 'descent', 1, kosu, Infinity, 1, 0, 1.5);
  check('dürüst koşu etkinlikte de temiz', !durust.capped);
}

console.log('\n[5] Bozuk çarpan sessizce 1\'e düşüyor');
{
  const taban = settleRun(cleared1, 'descent', 1, kosu).dropGold;
  for (const [ad, m] of [['NaN', NaN], ['sonsuz', Infinity], ['sıfır', 0], ['negatif', -5]] as const) {
    const r = settleRun(cleared1, 'descent', 1, kosu, Infinity, 1, 0, m as number);
    check(`${ad} çarpan ödülü bozmuyor`, r.dropGold === taban, `${r.dropGold} = ${taban}`);
  }
}

console.log('\n[6] Takvim ile kapanış aynı dili konuşuyor');
{
  // Çağrı yeri `eventMul(run.startedAt, 'dropGold')` gönderiyor; buradaki
  // ölçüm o zincirin iki ucunun uyuştuğunu doğruluyor.
  const cumartesi = new Date('2026-08-08T12:00:00Z');   // Ashfall
  const carsamba = new Date('2026-08-05T12:00:00Z');
  const m1 = eventMul(cumartesi, 'dropGold');
  const m0 = eventMul(carsamba, 'dropGold');
  const a = settleRun(cleared1, 'descent', 1, kosu, Infinity, 1, 0, m1);
  const b = settleRun(cleared1, 'descent', 1, kosu, Infinity, 1, 0, m0);
  check('Cumartesi bonus var', a.eventGold > 0, `+${a.eventGold}`);
  check('Çarşamba bonus yok', b.eventGold === 0);
}

console.log('\n' + '─'.repeat(62));
if (FAIL.length) { console.log(`❌ ${FAIL.length} ölçüm sınırın dışında:\n   • ${FAIL.join('\n   • ')}`); process.exit(1); }
console.log('✅ ETKİNLİK ÇARPANI DOĞRU YERE BİNİYOR');
