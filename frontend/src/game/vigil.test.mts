// THE LONG VIGIL — SEZON KARTI MUHRU.
//
// Kart 0,5 SOL, yani GERCEK PARA. Buradaki her kontrol tek bir soruyu
// koruyor: odeyen oyuncu ne aldi, ve odemeyen oyuncu ne KAYBETTI.
//
// 🔴 IKI KIRMIZI CIZGI:
//   1. KART GUC SATMAZ. Butun oduller kozmetik ve toz. `solPrice.ts`teki
//      kuralin aynisi ve rayin var olus sarti.
//   2. KART KOZMETIKLERI CEKILISE GIRMEZ. Girerlerse kart "biraz toz +
//      zaten cikabilecek seyler" olur ve 0,5 SOL'un karsiligi kalmaz.
//
//   cd frontend && npx tsx src/game/vigil.test.mts

import fs from 'node:fs';
import {
  VIGIL_TIERS, vigilClaimable, vigilCosmeticIds, vigilKey, vigilTotalDust, vigilUnlocked,
} from './vigil.js';
import { COSMETICS, RARITY, cosmeticById, rollCosmetic } from './cosmetics.js';
import { SOL_PRICES } from './solPrice.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

console.log('\n=== THE LONG VIGIL ===');
console.log(`     ${SOL_PRICES.battlepass} SOL · ${VIGIL_TIERS.length} kademe · ${vigilTotalDust()} toz`);

console.log('\n[1] YOL SAGLAM');
{
  check('derinlikler artiyor',
    VIGIL_TIERS.every((t, i) => i === 0 || t.depth > VIGIL_TIERS[i - 1].depth));
  check('her kademe toz veriyor', VIGIL_TIERS.every((t) => t.dust > 0));
  /**
   * ⚠️ ILK KADEME ERKEN OLMALI. Odedigi seyin calistigini saatler sonra
   * ogrenen oyuncu, o saatler boyunca kandirildigini dusunur.
   */
  check('ilk kademe ilk kosuda gorulur (d<=5)', VIGIL_TIERS[0].depth <= 5,
    `d${VIGIL_TIERS[0].depth}`);
  // ⚠️ SON KADEME oyuncu duvarinin OTESINDE olmali; bitmesi kolay bir yol
  // bitince olur.
  check('son kademe duvarin otesinde (d>=100)',
    VIGIL_TIERS[VIGIL_TIERS.length - 1].depth >= 100);
  check('kademe anahtarlari tekil',
    new Set(VIGIL_TIERS.map(vigilKey)).size === VIGIL_TIERS.length);
}

console.log('\n[2] ** KART GUC SATMIYOR');
{
  /**
   * Kademelerde toz ve kozmetikten BASKA bir alan olmamali. Bir gun biri
   * `gold` ya da `damage` eklerse burasi kirmizi verir ve gerekce
   * `vigil.ts` basliginda yazili olur.
   */
  const izinli = new Set(['depth', 'dust', 'cosmetic', 'label']);
  const kacak = VIGIL_TIERS.flatMap((t) => Object.keys(t)).filter((k) => !izinli.has(k));
  check('kademelerde guc/gold alani YOK', kacak.length === 0, [...new Set(kacak)].join(', '));

  const src = oku('src/game/vigil.ts');
  check('kaynakta gold/hasar gecmiyor', !/\bgold\b|damage|power/i.test(
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  // CIFT TARAFLI: dosya gercekten okundu
  check('tarama calisti (kontrol grubu)', src.length > 800);
}

console.log('\n[3] ** KART KOZMETIKLERI CEKILISE GIRMIYOR');
{
  const ids = vigilCosmeticIds();
  check('her kademe kozmetigi TANIMLI', ids.every((id) => !!cosmeticById(id)),
    ids.filter((id) => !cosmeticById(id)).join(', '));
  check('hepsi source: vigil', ids.every((id) => cosmeticById(id)?.source === 'vigil'));

  /**
   * ⭐ ASIL KONTROL. `rollCosmetic` eskiden KARA LISTE kullaniyordu
   * (`source !== 'earned'`); o haliyle YENI bir kaynak eklendiginde havuza
   * SESSIZCE giriyordu. Simdi izin listesi var ama olcut bu degil —
   * olcut, gercekten cikmamalari.
   */
  const cikanlar = new Set<string>();
  for (let i = 0; i < 40000; i++) {
    cikanlar.add(rollCosmetic((i * 0.61803398875) % 1, (i * 0.31830988618) % 1).id);
  }
  const sizan = ids.filter((id) => cikanlar.has(id));
  check('40.000 cekiliste HICBIRI cikmadi', sizan.length === 0, sizan.join(', '));
  // CIFT TARAFLI: cekilis gercekten calisiyor ve bir seyler uretiyor
  check('cekilis gercekten urun veriyor (kontrol grubu)', cikanlar.size > 10,
    `${cikanlar.size} farkli kozmetik`);
  // `earned` olanlar da hala disarida
  const kazanilan = COSMETICS.filter((c) => c.source === 'earned').map((c) => c.id);
  check('basarim kozmetikleri de hala disarida',
    kazanilan.every((id) => !cikanlar.has(id)));
}

console.log('\n[4] ALMA KURALLARI');
{
  // KARTSIZ HICBIR SEY ALINAMAZ - kontrol saf fonksiyonda, iki taraf da
  // ayni cevabi almali.
  check('kartsiz alinabilir bos', vigilClaimable(false, 200, []).length === 0);
  check('kartli ve derin: hepsi acik',
    vigilClaimable(true, 999, []).length === VIGIL_TIERS.length);
  check('derinlik yetmiyorsa acilmiyor', vigilClaimable(true, 1, []).length === 0);
  check('alinan tekrar alinmiyor',
    vigilClaimable(true, 999, VIGIL_TIERS.map(vigilKey)).length === 0);
  check('kismi alinmis dogru sayiyor',
    vigilClaimable(true, 999, [vigilKey(VIGIL_TIERS[0])]).length === VIGIL_TIERS.length - 1);
  // Bozuk girdi cokertmemeli
  check('NaN derinlik cokertmiyor', vigilUnlocked(Number.NaN).length === 0);
  check('negatif derinlik cokertmiyor', vigilUnlocked(-9).length === 0);
}

console.log('\n[5] TOZ MUSLUGU OLCULU');
{
  /**
   * Kart bir TOZ MUSLUGU degil; asil degeri satin alinamayan alti kozmetik.
   * Tozu buyutmek Reliquary'yi ve The Wager'i anlamsizlastirirdi.
   */
  const toplam = vigilTotalDust();
  const legendary = RARITY.legendary.dustCost;
  check('toplam toz bir legendary\'nin altinda', toplam < legendary,
    `${toplam} < ${legendary}`);
  check('toplam toz anlamsiz kucuk degil', toplam > legendary * 0.25, `${toplam}`);
}

console.log('\n[6] ** SUNUCU ZINCIRI');
{
  const idx = oku('../backend/src/index.ts');
  check('kart ucu var', /'\/vigil\/buy-sol'/.test(idx));
  check('toplama ucu var', /'\/vigil\/claim'/.test(idx));
  // ⚠️ Kart SADECE odeme dogrulandiktan sonra yaziliyor
  check('kart solAlim gecidinden geciyor', /solAlim\(req, res, 'battlepass'/.test(idx));
  // ⚠️ Kosullu yazma: iki farkli odeme ayni karti iki kez satamaz
  check('kart kosullu yaziliyor (yaris kesiliyor)',
    /where: \{ wallet, vigil: false \}/.test(idx));
  /**
   * ⚠️ ALET NOTU: bu kontrolun ilk surumu `/A|B/` yaziyordu ve B
   * (`paidDepth(p, st.id)`) dosyanin BASKA yerlerinde de geciyor — yani
   * kontrol her zaman yesil veriyordu, hicbir sey olcmuyordu. Simdi
   * yalniz `/vigil/claim` govdesine bakiyor.
   */
  const claimBlok = idx.slice(idx.indexOf("app.post('/vigil/claim'"));
  const cg = claimBlok.slice(0, claimBlok.indexOf('}));') + 4);
  check('derinlik SUNUCUDA paidDepth ile hesaplaniyor', /paidDepth\(p, st\.id\)/.test(cg));
  // ⚠️ Istemciden derinlik OKUNMAMALI
  check('istemciden derinlik okunmuyor', !/req\.body[\s\S]{0,60}depth/i.test(cg));
  check('kart yoksa 400 kart_yok', /kart_yok/.test(cg));
  // CIFT TARAFLI: blok gercekten bulundu mu
  check('claim blogu bulundu (kontrol grubu)', cg.length > 200 && /vigilClaimable/.test(cg),
    `${cg.length} karakter`);

  const db = oku('../backend/src/db.ts');
  /**
   * 🔴 EN KRITIK SATIR: `fromProgress` istemcinin gonderdigi ilerlemeyi de
   * yaziyor. `vigil` alani oradan gecseydi "kartim var" demek yeterli
   * olurdu. Alan BILEREK disarida.
   */
  check('fromProgress `vigil` alanini YAZMIYOR',
    !/^\s*vigil:/m.test(db.split('export function fromProgress')[1] ?? ''));
  check('toProgress `vigil` okuyor', /vigil: p\.vigil === true/.test(db));
}

console.log('\n[7] ** RAY KAPALIYKEN KART BOZUK GORUNMUYOR');
{
  /**
   * 🔴 KULLANICI OLCUMU (2026-09-08): oyuna girdi, SOL dugmelerini goremedi.
   * Ray kapali oldugu icin dogruydu — ama sezon kartinin TEK eylemi SOL ve
   * dugme yok olunca geriye tiklanacak hicbir seyi olmayan bir kutu
   * kaliyordu. Oyuncu kartin bozuk oldugunu sanar.
   *
   * Gold dugmesi yaninda duran bir SOL dugmesinin kaybolmasi sorun DEGIL
   * (Reliquary/Ossuary/Guild): orada calisan bir yol zaten var. Kural
   * yalniz TEK EYLEMI SOL olan kartlar icin.
   *
   * Ayni ders Exchange kapisinda alinmisti: kapali bir sey KAPALI oldugunu
   * SOYLEMELI.
   */
  const v = oku('src/components/VigilSection.tsx');
  check('kart ray durumunu okuyor', /useSolRail\(\)/.test(v));
  check('kapaliyken "NOT OPEN YET" yaziyor', /NOT OPEN YET/.test(v));
  check('kapaliyken NIYE kapali oldugu aciklaniyor',
    /payments are not switched on/.test(v));
  /**
   * ⚠️ TARIH VERILMIYOR: takvime bagli bir soz, o gun geldiginde
   * arkasindaki is bitmemisse de gelir ve tutulamaz (bkz. locked.ts).
   */
  const kapaliMetin = (v.match(/The card cannot be bought yet[^<]*/) ?? [''])[0];
  check('kapali metni TARIH icermiyor',
    !/[0-9]{4}|tomorrow|next week|soon/i.test(kapaliMetin), kapaliMetin.slice(0, 60));
  // ⚠️ Gold yolunun hala acik oldugu SOYLENMELI — oyuncu "her sey kapandi"
  // sanmamali.
  check('gold yolunun acik oldugu soyleniyor', /bought with gold/.test(v));

  const btn = oku('src/components/SolPayButton.tsx');
  check('ray kancasi disariya acildi (tek kaynak)', /export function useSolRail/.test(btn));
  // CIFT TARAFLI: dugme hala kapaliyken null donmeli — gold yaninda duran
  // SOL dugmesi icin dogru davranis bu.
  check('dugme kapaliyken hala cizilmiyor',
    /if \(!acik \|\| lamports === null\) return null/.test(btn));
  check('uydurma desen bulunmuyor (kontrol grubu)', !/useSolZZZ/.test(v + btn));
}

console.log(`\n${FAIL.length === 0 ? 'VIGIL SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
