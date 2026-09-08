// HARITA EDITORU MUHRU — editor oyunun TAMAMINI gorebiliyor mu?
//
// 🔴 UC GERCEK RISK:
//   1. EDITOR YANLIS HARITAYLA ACILIR. Acilista yalniz localStorage
//      taslagina bakiyordu; tarayici verisi silinmisse BOS harita geliyor
//      ve o bos haritayi "Indir" ile `public/map/village.json` uzerine
//      yazmak 2.085 nesnelik koyu tek tikla siler. Kayip SESSIZ olurdu.
//   2. EDITOR PANELLERIN COGUNU GORMEZ. Kapi hedefleri 6 satirlik ELLE
//      yazilmis bir listeydi; navbar 19 binaya cikmisti. `boss` ve
//      `reliquary` YAYINDAKI KOYDE kapisi oldugu halde listede YOKTU.
//   3. KAPIDAN GIRIS ILE NAVBAR AYRISIR. Rihtim `pit`i ozel ele aliyordu,
//      koy kapisi duz `setPanel` cagiriyordu — PIT'e bagli bir binaya
//      girmek hicbir sey acmazdi.
//
//   cd frontend && npx tsx src/game/editor.test.mts

import fs from 'node:fs';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
/** ⚠️ Yorumlar soyuluyor: bir seyden YORUMDA bahsetmek onu YAPMAK degildir */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const edHam = oku('src/app/editor/page.tsx');
const ed = yorumsuz(edHam);
const dock = yorumsuz(oku('src/components/BuildingDock.tsx'));
const play = yorumsuz(oku('src/app/play/page.tsx'));

/**
 * ⚠️ `BUILDINGS` METINDEN OKUNUYOR, IMPORT EDILMIYOR — ve bu mecburiyet:
 * dizi bir `'use client'` .tsx icinde ve `@/lib/theme` takma adini iceren
 * bir dosyadan geliyor, node testi onu cozemez. `dock.test.mts` de ayni
 * yolu kullaniyor.
 * ⚠️ Blok SINIRLANDIRILIYOR: dosyanin tamamini taramak `GROUPS` dizisinin
 * id'lerini (fight/power/spend/people) de yakalardi — onlar grup, bina
 * degil. Ilk olcumde tam bu oldu: 19 yerine 23 sayildi.
 */
const bBas = dock.indexOf('export const BUILDINGS');
const bSon = dock.indexOf('] as const;', bBas);
const binaBlok = dock.slice(bBas, bSon);
const BINALAR = [...binaBlok.matchAll(/\{ id: '([a-zA-Z]+)', label:/g)].map((m) => m[1]);

console.log('\n=== HARITA EDITORU ===');

console.log('\n[1] ** EDITOR BOS HARITAYLA ACILMIYOR');
{
  /**
   * 🔴 EN PAHALI RISK. Bos bir haritayi indirip `village.json` uzerine
   * yazmak koyu siler ve editor "0 nesne" derken bunun bir UYARI mi yoksa
   * yeni bir harita mi oldugunu soylemiyordu.
   */
  check('yayindaki koyu yukleyen yol var', /fetch\('\/map\/village\.json'/.test(ed));
  check('taslak YOKSA yayindaki geliyor', /void yayindakiniYukle\(true\)/.test(ed));
  /**
   * ⚠️ "Taslak var mi" yetmez, "DOLU mu": kazara bosaltilmis eski bir
   * taslak da bos sayilmali, yoksa tuzak geri gelir.
   */
  check('bos taslak da bos sayiliyor', /saved && saved\.objects\.length > 0/.test(ed));
  check('elle yukleme dugmesi de var', /Yayındaki köyü yükle/.test(edHam));
  // ⚠️ Ustune yazmadan once SORUYOR — emek bir tikla gitmemeli
  check('dolu haritanin ustune yazmadan once soruyor',
    /docRef\.current\.objects\.length > 0[\s\S]{0,120}confirm\(/.test(ed));
  // ⚠️ Okunamazsa SESSIZ KALMIYOR: yanlis haritayla calismak en kotusu
  check('okunamazsa sebebi gosteriliyor', /setYukleme\(`Yayındaki köy okunamadı/.test(edHam));
  check('uydurma desen bulunmuyor (kontrol grubu)', !/villageZZZ/.test(ed));
}

console.log('\n[2] ** KAPI HEDEFLERI NAVBARDAN TURUYOR');
{
  check('BUILDINGS okundu (kontrol grubu)', BINALAR.length >= 15, `${BINALAR.length} bina`);
  check('grup id\'leri sizmadi (kontrol grubu)',
    !BINALAR.includes('fight') && !BINALAR.includes('people'), BINALAR.join(','));

  /**
   * 🔴 ELLE YAZILMIS LISTE OLMAMALI. 6 satirlik sabit liste tam da bu
   * yuzden ayristi: navbar buyudu, liste buyumedi ve editor oyunun
   * yarisini goremez oldu.
   */
  check('DOOR_ROLES BUILDINGS\'ten turuyor', /const DOOR_ROLES = BUILDINGS\.map\(/.test(ed));
  check('editor BUILDINGS\'i ice aktariyor',
    /import \{ BUILDINGS \} from '@\/components\/BuildingDock'/.test(ed));
  // ⚠️ CIFT TARAFLI: eski elle liste GERCEKTEN gitti mi
  check('elle yazilmis rol listesi KALMADI',
    !/\{ id: 'quests', name:/.test(ed) && !/\{ id: 'upgrade', name:/.test(ed));
}

console.log('\n[3] ** DENETIM UYARISI GERCEGI SOYLUYOR');
{
  /**
   * ⚠️ 19 binanin HEPSINI beklemek yanlis olurdu: `settings` bina degil,
   * `pit` bir ekran, sosyal sekmelerin koyde karsiligi yok. Gurultulu bir
   * uyari okunmaz — eski hali "7 eksik" diyordu ve ikisi zaten vardi.
   */
  const kBas = ed.indexOf('const KAPI_BEKLENEN');
  const beklenen = [...ed.slice(kBas, ed.indexOf('] as const;', kBas)).matchAll(/'([a-z]+)'/g)]
    .map((m) => m[1]);
  check('beklenen kapi listesi var', beklenen.length > 0, beklenen.join(','));
  const hayalet = beklenen.filter((id) => !BINALAR.includes(id));
  check('beklenen her rol GERCEK bir bina', hayalet.length === 0, hayalet.join(',') || 'hayalet yok');
  // ⚠️ Bir EKRAN kapi beklentisi olamaz — girildiginde panel acilmaz
  check('pit kapi beklentisinde DEGIL', !beklenen.includes('pit'));
  check('settings kapi beklentisinde DEGIL', !beklenen.includes('settings'));
  check('denetim beklenen listeyi kullaniyor', /KAPI_BEKLENEN\.filter/.test(ed));
}

console.log('\n[4] ** YAYINDAKI HARITA NAVBARLA TUTUYOR');
{
  /**
   * 🔴 Gonderilen harita ile gonderilen navbar KARSILASTIRILIYOR. Bir panel
   * silinir de haritada kapisi kalirsa, oyuncu binaya girer ve HICBIR SEY
   * acilmaz — kod calisir, veri gelir, son adimda oldugu icin kimse fark
   * etmez. Bu depodaki en pahali hata sinifi tam bu.
   */
  const koy = JSON.parse(oku('public/map/village.json') || '{"markers":[]}');
  const kapilar = koy.markers.filter((m: { kind: string }) => m.kind === 'door');
  check('koyde kapi var (kontrol grubu)', kapilar.length > 0, `${kapilar.length} kapi`);
  const hedefsiz = kapilar.filter((m: { target?: string }) => !m.target);
  check('her kapinin hedefi var', hedefsiz.length === 0, `${hedefsiz.length} hedefsiz`);
  const olu = kapilar
    .map((m: { target: string }) => m.target)
    .filter((t: string) => !BINALAR.includes(t));
  check('her kapi GERCEK bir panele bagli', olu.length === 0, olu.join(',') || 'olu kapi yok');
}

console.log('\n[5] ** RIHTIM VE KAPI AYNI YOLDAN ACIYOR');
{
  /**
   * 🔴 Iki yol ayrisiktı: rihtim `pit`i ekrana ceviriyordu, koy kapisi duz
   * `setPanel` cagiriyordu. Editorde kapi hedefleri navbarin tamamina
   * acilinca bu sessiz bir hataya donusurdu.
   */
  check('tek dagitim fonksiyonu var', /const hedefiAc = useCallback/.test(play));
  check('pit orada ekrana ceviriliyor',
    /hedefiAc = useCallback[\s\S]{0,220}setScreen\(\{ kind: 'arena' \}\)/.test(play));
  check('koy kapisi onu cagiriyor', /const onEnter = useCallback\(\(id: BuildingId\) => hedefiAc\(id\)/.test(play));
  check('rihtim onu cagiriyor', /<BuildingDock open=\{panel\} onOpen=\{hedefiAc\}/.test(play));
  /**
   * ⚠️ CIFT TARAFLI: `pit` kontrolu TEK yerde olmali.
   * ⚠️ ALET NOTU: ilk surum "hic olmamali" diyordu ve `hedefiAc`in KENDI
   * dogru kontrolunu yakalayip kirmizi verdi — yani olcen taraf yanildi,
   * kod dogruydu. Beklenen sayi 0 degil 1.
   */
  check('pit kontrolu TEK yerde',
    (play.match(/id === 'pit'/g) ?? []).length === 1,
    `${(play.match(/id === 'pit'/g) ?? []).length} yer`);
}

console.log(`\n${FAIL.length === 0 ? 'EDITOR SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
