// OYUNCU ADI MUHRU.
//
// 🔴 IKI GERCEK RISK:
//   1. TAKLIT. Ad BENZERSIZ oldugu icin bir kimlik; "ayni gorunen ikinci
//      ad" almak, siralamada birinci olan oyuncunun yerine gecmektir.
//      Kiril "а" ile Latin "a" ekranda AYNI.
//   2. ANAHTAR HER SEYI EZER. Katlama fazla agresif olursa iki MASUM ad
//      cakisir ve oyuncuya sebebi anlatilamayan bir ret doner.
//
//   npx tsx src/game/playerName.test.mts

import fs from 'node:fs';
import {
  AD_MAX, AD_MIN, RENAME_TAVAN, adAnahtari, kisaCuzdan, oyuncuAdi, renameCost,
  validatePlayerName,
} from './playerName.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const gecer = (s: string) => validatePlayerName(s).ok;
const anahtar = (s: string) => {
  const r = validatePlayerName(s);
  return r.ok ? r.key : null;
};

console.log('\n=== OYUNCU ADI ===');

console.log('\n[1] DOGRULAMA — sinirlar ve izin listesi');
{
  check('gecerli ad KABUL (cift tarafli)', gecer('Ashen'));
  check('bosluklu ad kabul', gecer('Ash en'));
  check('alt cizgi ve tire kabul', gecer('Ash_en-1'));
  check('Turkce harf kabul', gecer('Gölge'));
  check('kisa ad RED', !gecer('ab'), `min ${AD_MIN}`);
  check('uzun ad RED', !gecer('a'.repeat(AD_MAX + 1)), `max ${AD_MAX}`);
  check('metin olmayan RED', !validatePlayerName(42 as never).ok);
  /**
   * ⚠️ EN AZ BIR HARF SART: "---" ya da "123" bir ad degil, bir dolgu.
   * Ayrica anahtari bos ya da anlamsiz olurdu.
   */
  check('yalniz rakam RED', !gecer('12345'));
  check('yalniz ayrac RED', !gecer('---'));
  /**
   * ⚠️ EMOJI BILEREK DISARIDA: sohbette, tuvalde (`fillText`) ve dar HUD
   * satirlarinda farkli genislikte cizilip hizayi bozuyor.
   */
  check('emoji RED', !gecer('Ash🔥en'));
  check('noktalama RED', !gecer('Ash.en'));
  check('rezerve ad RED', !gecer('admin'));
  check('rezerve ad buyuk harfle de RED', !gecer('ADMIN'));
  check('rezerve ad ayracla da RED (anahtardan bakiliyor)', !gecer('a-d-m-i-n'));
}

console.log('\n[2] ** GORUNMEZ KARAKTER — sohbet filtresinden DAHA GENIS');
{
  /**
   * 🔴 `chat.temizle` SOHBET METNI icin yazilmisti: orada gorunmez
   * karakter en fazla cirkinlik. Ad BENZERSIZ bir kimlik oldugu icin ayni
   * karakterler burada "ayni gorunen ikinci bir ad" uretmenin yolu.
   *
   * ⚠️ Asagidakilerin 5'i eski iki kopyada (chat.temizle / guild.temizAd)
   * YOKTU — bu mühür onlarin eklendigini kilitliyor.
   */
  const gorunmez: [string, string][] = [
    ['U+200B ZWSP', 'Ash​en'],
    ['U+200D ZWJ', 'Ash‍en'],
    ['U+FEFF BOM', 'Ash﻿en'],
    ['U+2060 word joiner', 'Ash⁠en'],
    ['U+061C ALM (eskide YOKTU)', 'Ash؜en'],
    ['U+180E Mongol ayraci (eskide YOKTU)', 'Ash᠎en'],
    ['U+2066 LRI (eskide YOKTU)', 'Ash⁦en'],
    ['U+2069 PDI (eskide YOKTU)', 'Ash⁩en'],
    ['U+FE0F varyasyon secici (eskide YOKTU)', 'Ash️en'],
    ['U+3164 Hangul dolgu (eskide YOKTU)', 'Ashㅤen'],
  ];
  for (const [ad, ham] of gorunmez) {
    const r = validatePlayerName(ham);
    check(`${ad} eleniyor`, r.ok && r.value === 'Ashen', r.ok ? r.value : 'RED');
  }
  // ⚠️ KONTROL GRUBU: filtre her seyi yemiyor — gercek harfler duruyor
  check('gercek harfler korunuyor (kontrol grubu)',
    (validatePlayerName('Ashen') as { value: string }).value === 'Ashen');
}

console.log('\n[3] ** TAKLIT — ayni gorunen ad ALINAMAZ');
{
  /**
   * 🔴 ASIL SALDIRI. Kiril "а" (U+0430) ile Latin "a" ekranda AYNI.
   * Katlanmazsa, siralamada birinci olan oyuncunun adinin BIREBIR
   * gorunen kopyasini almak mumkun olurdu. `chat.temizle` bunu YAPMIYOR.
   */
  const latin = anahtar('Ashen');
  check('Kiril taklidi ayni anahtara dusuyor',
    anahtar('Аshen') === latin, `${anahtar('Аshen')} = ${latin}`);
  check('Yunan taklidi ayni anahtara dusuyor',
    anahtar('Ashοn') === anahtar('Ashon'));
  // Buyuk/kucuk harf ve ayraclar
  check('BUYUK harf ayni anahtar', anahtar('ASHEN') === latin);
  check('alt cizgi ayni anahtar', anahtar('Ash_en') === latin);
  check('bosluk ayni anahtar', anahtar('Ash en') === latin);
  check('bosluk yigini ayni anahtar', anahtar('  Ash   en  ') === latin);
  /**
   * ⚠️ NFKC: birlesik "é" ile "e"+U+0301 ayni anahtara insin.
   * `chat.temizle` Unicode normalizasyonu HIC yapmiyordu.
   */
  check('NFKC birlestiriyor', adAnahtari('écho') === adAnahtari('écho'));

  /**
   * 🔴 KONTROL GRUBU — ANAHTAR HER SEYI EZMIYOR MU?
   * Bu satirlar olmasaydi "hepsini ayni anahtara indir" de testi gecerdi
   * ve iki MASUM ad cakisirdi. Bu depoda bos gecen bir iddia bir kez dort
   * gun "yesil" durdu.
   */
  check('Ashen ile Ashes AYRI (kontrol grubu)', anahtar('Ashen') !== anahtar('Ashes'));
  check('Ashen ile Ash3n AYRI — rakam harfe katlanmiyor',
    anahtar('Ashen') !== anahtar('Ash3n'));
  check('Ashen ile Ashan AYRI', anahtar('Ashen') !== anahtar('Ashan'));
  check('iki farkli ad iki farkli anahtar', anahtar('Grimm') !== anahtar('Grimr'));
}

console.log('\n[4] ** TEK COZUCU — 15 kopya vardi');
{
  /**
   * 🔴 OLCULDU: depoda 15 ayri yerde ayni cuzdan kisaltmasi ELLE
   * yazilmisti ve admin panelinde UC FARKLI kirpma vardi (4/4, 6/4).
   * Nickname 16.'yi eklerse bir gun ekranin yarisi ad, yarisi cuzdan
   * gosterir.
   */
  check('ad varsa ad', oyuncuAdi({ wallet: 'ABCDEFGHIJKLMN', name: 'Ashen' }) === 'Ashen');
  check('ad yoksa kisa cuzdan',
    oyuncuAdi({ wallet: 'ABCDEFGHIJKLMN' }) === 'ABCD…KLMN');
  check('bos ad kisa cuzdana dusuyor',
    oyuncuAdi({ wallet: 'ABCDEFGHIJKLMN', name: '' }) === 'ABCD…KLMN');
  /**
   * ⚠️ "You" DA BURADA: bugun 5 dosya `mine ? 'You' : kisa(...)` diye
   * elle yaziyordu. Ayni karar iki yerde verilirse bir gun ayrisiyor.
   */
  check('self "You" donuyor', oyuncuAdi({ wallet: 'ABCDEFGHIJKLMN', name: 'Ashen' }, true) === 'You');
  // ⚠️ Kisa cuzdan kirpilmiyor: "…" eklemek adresi UZATIRDI
  check('kisa adres kirpilmiyor', kisaCuzdan('ABC') === 'ABC');
}

console.log('\n[4b] YENIDEN ADLANDIRMA FIYATI — ilk bedava, sonrakiler artan');
{
  /**
   * 🔴 SABIT FIYAT OLMAMASININ SEBEBI: ad benzersiz bir KIMLIK. Ucuz ve
   * sabit bir fiyat, kotu davranan oyuncunun ad degistirip itibarini
   * sifirlamasini ucuz birakirdi — yani adi benzersiz yapmanin sebebini
   * yer. Fiyat olcegi mevcut giderlerden alindi (lonca 25.000, ikinci pet
   * yuvasi 40.000), uydurulmadi.
   */
  check('ilk ad BEDAVA', renameCost(0) === 0);
  check('ikinci ad 5.000', renameCost(1) === 5_000, String(renameCost(1)));
  check('fiyat katlaniyor', renameCost(2) === 10_000 && renameCost(3) === 20_000);
  // ⚠️ TAVAN VAR: sinirsiz katlama 6. degisimde 160.000'e cikar ve pratikte
  // "bir daha asla" demek olur. Amac caydirmak, kilitlemek degil.
  check('tavan tutuyor', renameCost(9) === RENAME_TAVAN, String(renameCost(9)));
  check('tavan lonca kurmanin (25.000) ustunde', RENAME_TAVAN > 25_000);
  // ⚠️ KONTROL GRUBU: fiyat gercekten ARTIYOR mu (duz bir sabit degil)
  check('monoton artan (kontrol grubu)',
    renameCost(1) < renameCost(2) && renameCost(2) < renameCost(3));
  check('bozuk giris bedava (savunmaci)', renameCost(-3) === 0);
}

console.log('\n[5] PAYLASIM — sunucu ve istemci AYNI fonksiyonu cagiriyor');
{
  /**
   * ⚠️ `backend/tsconfig.json` `@game/*` -> `frontend/src/game/*` esliyor
   * ve `backend/src/guild.ts` dogrulamayi zaten oradan aliyor. Ad
   * dogrulamasinin backend'de IKINCI bir kopyasi olmamali: istemci
   * kabul edip sunucu reddederse oyuncu sebebini goremez.
   */
  const tscfg = fs.readFileSync('../backend/tsconfig.json', 'utf8');
  check('backend @game esliyor (kontrol grubu)', tscfg.includes('"@game/*"'));
  const bp = (() => {
    try { return fs.readFileSync('../backend/src/playerName.ts', 'utf8'); } catch { return ''; }
  })();
  check('backend"de IKINCI bir dogrulayici YOK', bp === '');
}

console.log('\n[6] ** TEK COZUCU GERCEKTEN TEK MI (depo taramasi)');
{
  /**
   * 🔴 OLCULDU: bu is baslamadan once depoda 15 AYRI yerde ayni cuzdan
   * kisaltmasi ELLE yaziliyordu — 12 frontend bileseni, `presence.ts`,
   * `dm.ts`, `referral.ts` — ve admin panelinde UC FARKLI kirpma vardi
   * (4/4 ve 6/4). Ad geldigi gun bunlarin yarisi guncellenir, yarisi
   * cuzdan gostermeye devam ederdi.
   *
   * Bu tarama, 16.'sinin eklenmesini engelliyor.
   */
  const kok = ['src/components', 'src/lib', 'src/app', '../backend/src'];
  const suclu: string[] = [];
  const gez = (d: string) => {
    let girisler: string[] = [];
    try { girisler = fs.readdirSync(d); } catch { return; }
    for (const g of girisler) {
      const tam = `${d}/${g}`;
      let st;
      try { st = fs.statSync(tam); } catch { continue; }
      if (st.isDirectory()) { gez(tam); continue; }
      if (!/\.(ts|tsx|mts)$/.test(g)) continue;
      const t = fs.readFileSync(tam, 'utf8');
      /**
       * ⚠️ YORUMLAR SOYULUYOR. Bugun IKI KEZ kendi belgelendirmemi
       * "yayindaki kod" sanan bir muhur yazdim (`codex.test` ve
       * `graphics.test`); neyin degistigini anlatan bir yorum ihlal
       * sayilmamali.
       */
      const kod = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      // slice(0, N)…slice(-M) kalibi — bosluklu ya da bosluksuz
      if (/slice\(0,\s*\d+\)[\s\S]{0,30}slice\(-\d+\)/.test(kod)) suclu.push(tam);
    }
  };
  for (const k of kok) gez(k);

  /**
   * ⚠️ ADMIN PANELI HARIC — ve gerekcesi yazili: orasi bir OPERASYON
   * ekrani, oyuncu gormuyor ve orada tam adresin bir parcasini gormek
   * ISE YARIYOR (destek talebinde cuzdan eslestirmek). Oyuncuya gorunen
   * hicbir yuzey listede olmamali.
   */
  const oyuncuyaGorunen = suclu.filter((f) => !f.includes('gbadmin123'));
  check('oyuncuya gorunen yuzeylerde elle kisaltma YOK', oyuncuyaGorunen.length === 0,
    oyuncuyaGorunen.join(', ') || `${suclu.length} dosya (yalniz admin)`);
  // 🔴 KONTROL GRUBU: tarama gercekten calisiyor mu? Admin paneli hala
  // kaliba uyuyor olmali — uymuyorsa desen bozuk demektir ve yukaridaki
  // iddia BOS gecerdi.
  check('tarama calisiyor (admin paneli yakalaniyor)', suclu.length > 0,
    `${suclu.length} eslesme`);
}

console.log(`\n${FAIL.length === 0 ? 'OYUNCU ADI SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
