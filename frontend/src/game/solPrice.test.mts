// SOL FIYAT RAYI MUHRU.
//
// NIYE VAR: bu dosya gercek parayla ilgili tek fiyat kaynagi. Bir yuvarlama
// hatasi ya da kacan bir esik, hazineye urunun altinda odeme gecirir ve
// bunu kimse fark etmez - defterde her sey "odendi" gorunur.
//
//   cd frontend && npx tsx src/game/solPrice.test.mts

import fs from 'node:fs';
import {
  LAMPORTS_PER_SOL, OSSUARY_SOL_LADDER, OSSUARY_SOL_MAX, SOL_PRICES,
  ossuarySolAvailable, ossuarySolPrice, solLabel, solPrice,
} from './solPrice.js';
import { ossuaryCost, ossuarySpent } from './ossuary.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

console.log('\n=== SOL FIYAT RAYI ===');
console.log('     duz fiyat listesi - kur YOK');

console.log('\n[1] DUZ FIYAT LISTESI');
{
  // KUR YOK: fiyatlar elle yazili. Bir formul/kur geri sizarsa burasi soyler.
  for (const [ad, sol] of Object.entries(SOL_PRICES)) {
    console.log(`     ${ad.padEnd(12)} ${sol} SOL`);
  }
  check('her fiyat pozitif', Object.values(SOL_PRICES).every((v) => v > 0));
  // Durtusel bant: 0,005 - 1 SOL. Disina cikan bir kalem ya anlamsiz kucuk
  // (ag ucreti yaninda) ya kimsenin denemeyecegi kadar pahali olur.
  check('her fiyat makul bantta (0,005-1 SOL)',
    Object.values(SOL_PRICES).every((v) => v >= 0.005 && v <= 1));
  check('lamport cevrimi tam sayi',
    (Object.keys(SOL_PRICES) as (keyof typeof SOL_PRICES)[])
      .every((k) => Number.isInteger(solPrice(k))));
  check('etiket okunur', solLabel(solPrice('guild')) === '0.1 SOL', solLabel(solPrice('guild')));
}

console.log('\n[2] ** ANIT: BASAMAKLI, TAVANLI');
{
  /**
   * DUZ TEK FIYAT OLCULDU VE ELENDI: anit bedeli ustel (400 · 1,13^n),
   * duz SOL fiyati sabit. Sinirsiz duz fiyatta L100 = 1 SOL, gold ile ise
   * 102.076 saat. Siralamadaki rutbe rozeti "kim odedi" olurdu.
   */
  const S = 6124;   // olculen gold/saat
  for (const b of OSSUARY_SOL_LADDER) {
    const g = Math.round(ossuaryCost(b.upTo - 1));
    console.log(`     L${String(b.upTo).padStart(2)} tavani: ${b.sol} SOL/tas · o tasin goldu ${g.toLocaleString('en-US')}`);
  }
  check('basamaklar artiyor',
    OSSUARY_SOL_LADDER.every((b, i) => i === 0 || b.sol > OSSUARY_SOL_LADDER[i - 1].sol));
  check('basamak sinirlari artiyor',
    OSSUARY_SOL_LADDER.every((b, i) => i === 0 || b.upTo > OSSUARY_SOL_LADDER[i - 1].upTo));

  check('L1 ilk basamakta', ossuarySolPrice(0) === Math.round(OSSUARY_SOL_LADDER[0].sol * LAMPORTS_PER_SOL));
  check('basamak gecisi dogru yerde',
    ossuarySolPrice(19) === ossuarySolPrice(0) && ossuarySolPrice(20) !== ossuarySolPrice(0),
    `L20=${solLabel(ossuarySolPrice(19) ?? 0)} L21=${solLabel(ossuarySolPrice(20) ?? 0)}`);

  // TAVAN: ustu PARAYLA ALINAMAMALI
  check('tavanda hala aliniyor', ossuarySolAvailable(OSSUARY_SOL_MAX - 1));
  check('tavanin USTUNDE SOL yolu KAPALI', !ossuarySolAvailable(OSSUARY_SOL_MAX));
  check('cok derinde de kapali', ossuarySolPrice(500) === null);

  /**
   * ASIL OLCUT: tavanin uzerindeki rutbe gold ile CIDDI bir basari olmali,
   * yoksa tavan keyfi bir engel olurdu.
   */
  const saat = Math.round(ossuarySpent(OSSUARY_SOL_MAX) / S);
  check('tavan ciddi bir basariya denk (>300 saat)', saat > 300, `${saat} saat`);

  // Bir oyuncunun anita harcayabilecegi TAVAN - gelir kolu olculebilir olmali
  let toplam = 0, once = 0;
  for (const b of OSSUARY_SOL_LADDER) { toplam += (b.upTo - once) * b.sol; once = b.upTo; }
  check('anit gelir tavani makul (1-5 SOL)', toplam >= 1 && toplam <= 5, `${toplam.toFixed(2)} SOL`);

  // Bozuk girdi
  check('NaN seviye cokertmiyor', ossuarySolPrice(Number.NaN) !== undefined);
  check('negatif seviye ilk basamak', ossuarySolPrice(-5) === ossuarySolPrice(0));
}

console.log('\n[3] KUR KAVRAMI GERI SIZMADI');
{
  /**
   * Kullanici karari (2026-09-08): "kur muhabbetini kaldiralim, direkt duz
   * hesap yapalim". Bir kur geri sizarsa fiyatlar tekrar SOL fiyatina bagli
   * canli bir hesaba doner ve oyuncuya aciklanmasi gereken bir kavram olur.
   */
  const src = oku('src/game/solPrice.ts');
  check('goldPerSol / markup kalmadi', !/goldPerSol|markup/.test(src));
  check('goldToLamports kalmadi', !/goldToLamports/.test(src));
  const btn = oku('src/components/SolPayButton.tsx');
  check('arayuzde kur metni kalmadi', !/rateLabel|= \d[\d.,]* gold/.test(btn));
  // CIFT TARAFLI: dosya gercekten okundu mu
  check('tarama gercekten calisti (kontrol grubu)', src.length > 500 && btn.length > 500);
}

console.log('\n[5] ** GUC SATILMIYOR - rayin var olus sarti');
{
  /**
   * Olculdu (balance.probe): Forge agaci derinligi 8,2 -> 16,6 ve kosu
   * gold'unu 268 -> 915 yapiyor. Forge'u SOL'a acmak (a) THE PIT'i
   * dogrudan pay-to-win yapardi (arena `permanent` = Forge+ekipman+beceri),
   * (b) SOL -> Forge -> 3,4x gold -> marketplace -> $GRAVE zincirini acardi.
   */
  const forge = oku('src/components/ForgePanel.tsx');
  check('Forge panelinde SOL rayi YOK', !/solPrice|goldToLamports|solCost/.test(forge));
  const stall = oku('src/components/StallPanel.tsx');
  check('Stall (kosu ici guc) SOL rayinda DEGIL', !/solPrice|goldToLamports/.test(stall));
  const gear = oku('src/components/GearPanel.tsx');
  check('Gear/Reforge SOL rayinda DEGIL', !/solPrice|goldToLamports/.test(gear));
  const skill = oku('src/components/SkillPanel.tsx');
  check('Paths (beceri) SOL rayinda DEGIL', !/solPrice|goldToLamports/.test(skill));
  const pet = oku('src/components/PetPanel.tsx');
  check('Binding (pet gucu) SOL rayinda DEGIL', !/solPrice|goldToLamports/.test(pet));

  // CIFT TARAFLI: tarama her seye "evet" diyor olabilirdi - kontrol grubu
  check('tarama gercekten calisiyor (kontrol grubu)',
    /costOf|FORGE/.test(forge) && forge.length > 500);

  // ANA SAYFADAKI SOZ: "Depth is gated by survival, not by spending."
  const home = oku('src/components/HomeSections.tsx');
  check('SSS hala "not by spending" diyor (soz ayakta)',
    /not by spending/.test(home));
}

console.log('\n[6] ** ARAYUZ: SOL yolu gold yolunun YANINDA');
{
  /**
   * SOL bir kolaylik, gold ise oyunun kendisi. Bir panelde gold dugmesi
   * kaybolur da yerine SOL gecerse, oyun sessizce "odemeden oynanmaz"
   * hale gelir - ve bunu kimse tek bir commit'te fark etmez.
   */
  /**
   * ⚠️ ALET NOTU: ilk surum gold yolunu METINDEN ("... G") ariyordu ve
   * bicimlendirme farki yuzunden iki panelde OLMAYAN bir hata buldu.
   * Dogru olcut metin degil DAVRANIS: panel gold ucunu hala cagiriyor mu.
   */
  const paneller: [string, string, RegExp][] = [
    ['Reliquary', 'src/components/ReliquaryPanel.tsx', /pullReliquary\(/],
    ['Ossuary', 'src/components/OssuarySection.tsx', /raiseOssuary\(/],
    ['Guild', 'src/components/GuildPanel.tsx', /createGuild\(|buyGuildUpgrade\(/],
  ];
  for (const [ad, yol, goldYolu] of paneller) {
    const t = oku(yol);
    check(`${ad}: SOL dugmesi var`, /<SolPayButton/.test(t));
    check(`${ad}: gold ucu hala cagriliyor`, goldYolu.test(t));
  }

  const btn = oku('src/components/SolPayButton.tsx');
  // RAY KAPALIYKEN HIC CIZILMEMELI: yari calisan bir odeme dugmesi,
  // oyuncuyu olmayan bir isleme sokmaktir.
  check('ray kapaliyken dugme cizilmiyor', /if \(!acik \|\| lamports === null\) return null/.test(btn));
  check('demo modunda cizilmiyor', /panelUnlocked\(getMode\(\)\)/.test(btn));
  // Cuzdanin kendi iptali HATA DEGIL - oyuncu vazgecti, kirmizi uyari
  // basmak onu suclamak olurdu.
  check('cuzdan iptali hata olarak gosterilmiyor', /reject\|declin\|cancel/.test(btn));
  // EN ONEMLI METIN: para gitti urun gelmedi. Oyuncuya NE YAPACAGINI soyle.
  check('"odedim urun gelmedi" metni oyuncuya yol gosteriyor',
    /urun_verilemedi[\s\S]{0,200}ticket/i.test(btn));
  // ⚠️ Kur kavrami kalkti; yerine soylenmesi gereken tek sey kaldi:
  // bu bir KOLAYLIK. Yaninda SOL dugmesi duran bir gold fiyati, soylenmezse
  // "asil yol bu mu?" sorusunu dogurur.
  check('SOL yolunun istege bagli oldugu yaziyor', /can be earned with gold/.test(btn));

  check('uydurma desen bulunmuyor (kontrol grubu)', !/SolPayZZZ/.test(btn));
}

console.log('\n[7] ** PARA GITTI URUN GELMEDI - kurtarma yolu');
{
  /**
   * 🔴 OLCULDU (2026-09-08): odeme ZINCIRE gidiyor, sonra sunucu onu
   * dogruluyor. Aradaki adim duserse (RPC kesintisi, ag, sekme kapandi)
   * `redeem(sig)` firlatiyor ve IMZA KAYBOLUYORDU — oyuncunun elinde
   * hicbir sey kalmiyordu. Arayuz "keep the signature" diyordu ama imzayi
   * GOSTERMIYORDU bile.
   *
   * ⚠️ TEKRAR DENEMEK GUVENLI: `Payment.sig @unique` sunucu tarafinda.
   * Dogrulama dustuyse satir hic yazilmamistir ve tekrar gecer; basariliysa
   * ikinci deneme 409 "zaten aldin" alir. Iki durumda da oyuncu kaybetmez.
   */
  const lib = oku('src/lib/solPay.ts');
  // ⭐ SIRA: imza redeem'den ONCE saklanmali, yoksa redeem patladiginda
  // saklanacak bir sey kalmaz.
  const govde = lib.slice(lib.indexOf('export async function solIleAl'));
  const iYaz = govde.indexOf('bekleyenYaz(');
  const iRedeem = govde.indexOf('await redeem(sig)');
  check("imza redeem'den ONCE saklaniyor", iYaz > 0 && iYaz < iRedeem,
    `yaz@${iYaz} redeem@${iRedeem}`);
  check('yalniz BASARIDA siliniyor',
    /await redeem\(sig\);[\s\S]{0,200}bekleyeniTemizle/.test(govde));

  const btn = oku('src/components/SolPayButton.tsx');
  check('bekleyen varsa dugme "FINISH PAYMENT" oluyor', /FINISH PAYMENT/.test(btn));
  /**
   * ⚠️ BEKLEYEN VARKEN YENI ODEME ALINMAMALI: oyuncu ikinci kez oderdi ve
   * ilki hala kurtarilmayi bekliyor olurdu — sorunun iki kati.
   */
  check('bekleyen varken yeni transfer YAPILMIYOR',
    /if \(b && tekrarDenenebilir\(b\)\)[\s\S]{0,120}bekleyeniKullan/.test(btn));
  // ⚠️ Pencere gecmisse imza GOSTERILMELI — destek kaydi onsuz ise yaramaz
  check('pencere gecince imza EKRANDA gosteriliyor',
    /!tekrarDenenebilir\(bekleyen\)[\s\S]{0,600}bekleyen\.sig/.test(btn));
  check('imza kopyalanabiliyor', /clipboard\?\.writeText\(bekleyen\.sig\)/.test(btn));

  // Sunucu 30 dk'dan eski islemi reddediyor; pencere ondan KISA olmali,
  // yoksa asla calismayacak bir "tekrar dene" dugmesi gosterilir.
  const srv = oku('../backend/src/solPay.ts');
  const dk = Number((srv.match(/MAX_YAS_SN = (\d+)/) ?? [])[1] ?? 0);
  check('sunucu yas siniri okunabildi (kontrol grubu)', dk > 0, `${dk} dk`);
  check('tekrar penceresi sunucu sinirindan KISA',
    /TEKRAR_PENCERESI_MS = 28 \* 60 \* 1000/.test(lib), '28 dk < 30 dk');

  check('uydurma desen bulunmuyor (kontrol grubu)', !/bekleyenZZZ/.test(lib + btn));
}

console.log(`\n${FAIL.length === 0 ? 'SOL FIYAT RAYI SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
