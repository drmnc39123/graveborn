// ULTRA MOD MUHRU.
//
// 🔴 IKI GERCEK RISK:
//   1. KAPI GENIS ACILIR. `ultraMi` yanlis yazilirsa (bos string, null,
//      buyuk/kucuk harf) hazine olmayan bir cuzdan sinirsiz gold alir.
//   2. TEST HESABI SIRALAMAYI VE HAFTALIK ODULU ELE GECIRIR. Ultra hesap
//      d200'e iniyor; tabloya girseydi olculen sey bozulur, ustelik
//      `season.settleOne` ona KOZMETIK + TOZ oderdi — gercek oyuncularin
//      yerine. Iki tablo var, iki kapi gerekiyor.
//
// ⚠️ KAYDA GERCEKTEN YAZIYOR — ilk surum yalniz cevabi zenginlestiriyordu
// ve OYUN SUNUCU OTORITELI oldugu icin kirikti (bkz. [4]).
//
//   cd backend && npx tsx src/ultra.test.mts

import fs from 'node:fs';
import { ULTRA_DERINLIK, ULTRA_GOLD, ultraDolumGerekli, ultraIlerleme, ultraMi } from './ultra.js';
import { hazineAdresi } from './solPay.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

console.log('\n=== ULTRA MOD ===');

console.log('\n[1] ** KAPI YALNIZ HAZINEYE ACIK');
{
  const hazine = hazineAdresi();
  /**
   * ⚠️ Hazine tanimli DEGILSE mod tamamen kapali olmali. Bos string
   * karsilastirmasi yapilsaydi `wallet === ''` kapiyi acabilirdi.
   */
  check('bos cuzdan REDDEDILIYOR', !ultraMi(''));
  check('null REDDEDILIYOR', !ultraMi(null));
  check('undefined REDDEDILIYOR', !ultraMi(undefined));
  check('rastgele cuzdan REDDEDILIYOR', !ultraMi('7dauQxPqXK9mF2yTn4bC8sVwLgRhJ1eZoPkNdUiHBo4'));

  if (hazine) {
    // CIFT TARAFLI: hazine GECMELI, yoksa kontrol hicbir sey kanitlamaz
    check('hazine cuzdani GECIYOR (cift tarafli)', ultraMi(hazine));
    // ⚠️ Buyuk/kucuk harf esnetilmiyor: base58 adresler harf duyarli ve
    // esnetmek benzer bir adresi kabul etmek olurdu.
    check('harf degistirilmis hazine REDDEDILIYOR',
      !ultraMi(hazine.toLowerCase()) || hazine === hazine.toLowerCase());
  } else {
    check('hazine tanimsizken mod TAMAMEN kapali (kontrol grubu)',
      !ultraMi('herhangi-bir-sey'));
    console.log('     (TREASURY_ADDRESS tanimli degil — hazine tarafi bu ortamda olculemedi)');
  }
}

console.log('\n[2] HER SEY ACIK');
{
  const u = ultraIlerleme(25);
  check('gold pratikte sinirsiz', u.gold === ULTRA_GOLD && u.gold > 50_000_000, String(u.gold));
  /**
   * ⚠️ `MAX_SAFE_INTEGER` DEGIL: arayuzde "1e+15" gibi okunamaz bir sey
   * yazdirir ve fiyat cikarma hesaplarinda tasma riski dogurur.
   */
  check('gold guvenli araliкta', Number.isSafeInteger(u.gold * 2));
  check('butun bolumler acik', u.unlockedStage === 25 && Object.keys(u.cleared).length === 25);
  /**
   * ⚠️ `depthPaid` DE ACIK: kahraman kilidi (priestess d8), beceri
   * puanlari ve Vigil kademelerinin HEPSI ondan turuyor. Yalniz gold
   * vermek "her sey acik" olmazdi.
   */
  /**
   * 🔴 DERINLIK 15 — VE BU BIR HATA DUZELTMESI, TERCIH DEGIL.
   *
   * Eskiden 200 yaziliyordu. Checkpoint'ten baslarken verilen seviye
   * `3 + 0,95·(d−2)`; d=201 icin 192 — kosu baslamadan 192 KART secmek
   * gerekiyordu. Kullanici bildirdi: *"tum skill kartlarini sectigimde
   * oyunu acmiyor, oyun donuyor."* Ekranda `STARTING DRAFT 76 / 192`.
   *
   * ⚠️ UST SINIR DA OLCULUYOR: yalniz `>= 1` deseydim 200'e geri donus
   * muhrun altindan gecerdi ve tam olarak duzelttigimiz sey geri gelirdi.
   */
  check('derinlik ULTRA_DERINLIK (15)',
    Object.values(u.depthPaid).every((d) => d === ULTRA_DERINLIK) && ULTRA_DERINLIK === 15,
    String(ULTRA_DERINLIK));
  check('derinlik oynanamaz yuksekligte DEGIL (cift tarafli)', ULTRA_DERINLIK < 40);
  /**
   * 🔴 KART VERILMIYOR — VE BU BILINCLI. Ilk surum `vigil: true` yaziyordu
   * ve SATIN ALMA EKRANINI GIZLIYORDU: hazine paneli acinca "YOURS"
   * goruyor, SOL dugmesi hic cizilmiyordu. Kullanici bildirdi. Ultra modun
   * var olma sebebi TEST ETMEK; oyunun tek odeme akisini test edilemez
   * yapan bir kolaylik amacin kendisini yiyordu.
   */
  check('kart VERILMIYOR (satin alma test edilebilsin)',
    !('vigil' in (u as unknown as Record<string, unknown>)));
  /**
   * ⚠️ `firstClear` DE ISARETLI: aksi halde arayuz her bolumde "topla"
   * dugmesi gosterir ve oradan GERCEK bir yazma tetiklenip kaydi kirletir.
   */
  check('ilk gecis odulleri alinmis sayiliyor', Object.keys(u.firstClear).length === 25);
  // Bolum sayisi ELLE yazilmiyor — cagiran veriyor
  check('bolum sayisi disaridan geliyor', Object.keys(ultraIlerleme(7).cleared).length === 7);
}

console.log('\n[3] ** SIRALAMAYA GIRMIYOR (iki tablo, iki kapi)');
{
  const lb = yorumsuz(oku('src/leaderboard.ts'));
  const se = yorumsuz(oku('src/season.ts'));
  check('tum-zamanlar tablosu ultra hesabi reddediyor',
    /if \(ultraMi\(wallet\)\) return false;/.test(lb));
  check('haftalik tablo da reddediyor', /if \(ultraMi\(wallet\)\) return false;/.test(se));
  /**
   * ⚠️ KAPI YAZMA ANINDA. Okuma tarafinda filtrelemek `bestRating`
   * satirini yine de kirletirdi ve bir gun baska bir sorgu onu gorurdu.
   */
  check('kapi recordDescent icinde', /recordDescent[\s\S]{0,900}ultraMi\(wallet\)/.test(lb));
  check('kapi recordSeason icinde', /recordSeason[\s\S]{0,900}ultraMi\(wallet\)/.test(se));
}

console.log('\n[4] ** KAYDA GERCEKTEN YAZIYOR (ilk surum kirikti)');
{
  /**
   * 🔴 ILK SURUM KAYDA YAZMIYORDU ve bu muhur onu "dogru" diye
   * dogruluyordu. OYUN SUNUCU OTORITELI: istemci 100M gold goruyor,
   * Forge'a basiyor, sunucu GERCEK satiri (0 gold) okuyup `yetersiz_gold`
   * donuyordu. Kullanici bildirdi:
   *   *"Treasury wallet'a gold gelmis fakat forge harcamasi yapilmiyor ve
   *    stage'de oyuna giremiyorum. Hicbir yerde gold harcanmiyor."*
   * Muhur artik TERSINI olcuyor.
   */
  const idx = yorumsuz(oku('src/index.ts'));
  const ultra = yorumsuz(oku('src/ultra.ts'));
  check('ultra hesabin kaydi GUNCELLENIYOR', idx.includes('prisma.player.update(')
    && idx.includes('if (ultraMi(wallet)) {'));
  check('gold gercekten artiriliyor', idx.includes('gold: { increment: gerek.gold }'));
  check('bolumler gercekten aciliyor', idx.includes('unlockedStage: u.unlockedStage'));
  check('derinlik de yaziliyor (kahraman + beceri icin)', idx.includes('depthPaid: u.depthPaid'));

  /**
   * ⚠️ IDEMPOTENT VE ESIKLI: her `/progress` cagrisinda yazmak, koyde
   * durup duran bir oyuncuda saniyede bir DB yazmasi demekti.
   */
  check('dolum esikli', ultra.includes('gold < ULTRA_GOLD / 2'));
  const g1 = ultraDolumGerekli(0, 1, 25);
  check('bos hesapta dolum GEREKIYOR', g1.gold > 0 && g1.stage);
  const tamDerinlik: Record<string, number> = {};
  for (let i = 1; i <= 25; i++) tamDerinlik[String(i)] = ULTRA_DERINLIK;
  const g2 = ultraDolumGerekli(ULTRA_GOLD, 25, 25, tamDerinlik);
  check('dolu hesapta dolum GEREKMIYOR (cift tarafli)',
    g2.gold === 0 && !g2.stage && !g2.derinlik);

  /**
   * 🔴 DERINLIK SAPMASI DA DOLUM SEBEBI.
   *
   * Ilk surumde yazma sarti yalniz `gold > 0 || stage` idi. Hesabin gold'u
   * dolu ve bolumleri acik oldugu icin `depthPaid` BIR DAHA HIC
   * yazilmiyordu: sabiti 200'den 15'e cekmek kayitta duran 200'u
   * degistirmiyordu. Sabiti duzeltip yazma sartini duzeltmemek, hicbir
   * sey duzeltmemekle aynidir.
   */
  const eski: Record<string, number> = {};
  for (let i = 1; i <= 25; i++) eski[String(i)] = 200;
  check('kayitta 200 duruyorsa dolum GEREKIYOR', ultraDolumGerekli(ULTRA_GOLD, 25, 25, eski).derinlik);
  check('eksik bolum de dolum gerektiriyor',
    ultraDolumGerekli(ULTRA_GOLD, 25, 25, { '1': ULTRA_DERINLIK }).derinlik);
  check('derinlik hic yoksa dolum gerekiyor', ultraDolumGerekli(ULTRA_GOLD, 25, 25, undefined).derinlik);
  check('yazma sarti derinligi de goruyor',
    idx.includes('gerek.gold > 0 || gerek.stage || gerek.derinlik'));

  /**
   * 🔴 DEFTERE YAZILIYOR: kaynagi gorunmeyen milyonlarca gold,
   * `/admin/economy` musluk toplamini sessizce yalanci yapardi.
   */
  check('dolum deftere yaziliyor',
    idx.includes("kind: 'admin_grant', gold: gerek.gold, detail: 'ultra mode top-up'"));
  check('uydurma desen bulunmuyor (kontrol grubu)', !idx.includes('ultraZZZ'));
}

console.log(`\n${FAIL.length === 0 ? 'ULTRA MOD SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
