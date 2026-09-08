// YUKLEME MUHRU — siyah ekran ve zemin artiklari.
//
// 🔴 KULLANICI BILDIRIMI: *"siteye ilk giriste homepagete ki arkaplan hemen
// yuklenmiyor ve bekletiyor, daha sonra koye girdigimizde de aynisi oluyor
// ve ilk basta her yer siyah gozukup sonradan duzeliyor. Ayrica savasa
// girip ciktiktan sonra da her seferinde bunu yapiyor."*
// + *"zemin onbellegi artigi her zaman karsimiza cikiyor."*
//
// IKI AYRI SEBEP OLCULDU:
//
// 1. HARITA HER KOYE GIRISTE YENIDEN CEKILIYORDU. `loadMapWorld`
//    `cache: 'no-store'` ile cagriliyor ve `HubCanvas` her mount'ta onu
//    yeniden istiyordu. Tarayicida `fetch` sayaci takilarak olculdu:
//        onbelleksiz : 3 koy donusunde 6 istek (628 KB x 6 = 3,8 MB)
//        onbellekli  : 0 istek
//    O 628 KB inip islenene kadar `world` YOK, yani cizilecek bir sey de
//    yok — tuval siyah kaliyordu.
//    ⚠️ `performance.getEntriesByType('resource')` bu olcumde YANILTTI:
//    tampon 250'de doluyor ve harita 181 gorsel istiyor, sayim eksik
//    cikiyordu. Dogru alet `fetch`i sarmalamakti.
//
// 2. DUNYANIN GORSELLERI ONDEN ISTENMIYORDU. `preloadAll` yalniz
//    AKTORLERI (kahraman · dusman · efekt) yukluyordu; zemin
//    (`world.palette`) ve binalar (`world.objects`) hic. `koyChunkCanvas`
//    eksik gorselle chunk PISIRMIYOR (dogru davranis) ve yedek yol
//    `drawFrame` basarisiz olunca duz koyu dikdortgen birakiyor — ekranda
//    gordugumuz "zemin onbellegi artigi" tam olarak o.
//
//   cd frontend && npx tsx src/game/loading.test.mts

import fs from 'node:fs';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
import { zeminHazirMi } from './sprites.js';

const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const mw = yorumsuz(oku('src/game/mapWorld.ts'));
const sp = yorumsuz(oku('src/game/sprites.ts'));
const hub = yorumsuz(oku('src/components/HubCanvas.tsx'));

console.log('\n=== YUKLEME ===');

console.log('\n[1] ** HARITA OTURUMDA BIR KEZ CEKILIYOR');
{
  check('soz onbellegi var', /const dunyaSozu = new Map<string, Promise<MapWorld \| null>>\(\)/.test(mw));
  check('once onbellege bakiliyor', /const hit = dunyaSozu\.get\(url\);\s*if \(hit\) return hit;/.test(mw));
  /**
   * ⚠️ SOZ SAKLANIYOR, SONUC DEGIL. Iki bilesen ayni anda isterse (koy +
   * minimap) iki istek acilirdi; olculdu — onbelleksiz surumde donus
   * basina IKI istek gidiyordu.
   */
  check('saklanan sey PROMISE (cift istek kapaniyor)', /dunyaSozu\.set\(url, soz\)/.test(mw));
  /**
   * ⚠️ BASARISIZLIK SAKLANMIYOR: `null` donen bir yukleme onbellege
   * alinsaydi gecici bir ag hatasi oturum boyunca koyu kapatirdi.
   */
  check('basarisiz yukleme onbellekten dusuyor', /if \(!w\) dunyaSozu\.delete\(url\)/.test(mw));
  /**
   * ⚠️ `no-store` KALDIRILMADI ve bu kasitli: sayfa YENILENDIGINDE harita
   * taze gelmeli, yoksa editorde harita duzenleyip yenileyen kisi eski
   * haritayi gorur ve "kaydetmemis miyim" diye arar.
   */
  check('sayfa yenilemesinde hala taze (no-store duruyor)', /cache: 'no-store'/.test(mw));
  check('uydurma desen bulunmuyor (kontrol grubu)', !/dunyaZZZ/.test(mw));
}

console.log('\n[2] ** DUNYANIN GORSELLERI ONDEN ISTENIYOR');
{
  check('preloadWorld var', /export function preloadWorld\(/.test(sp));
  check('zemin paleti yukleniyor', /for \(const src of palette\) if \(src\) get\(src\)/.test(sp));
  // ⚠️ Ayni sprite onlarca nesnede tekrarlaniyor — `Set` olmadan bosuna
  // Map aramasi yapilirdi.
  check('nesne kaynaklari tekillestiriliyor', /new Set\(objectSrcs\)/.test(sp));
  // 🔴 ZINCIRIN SON ADIMI: tanimlamak yetmez, CAGRILMALI.
  check('koy yuklenince cagriliyor',
    /preloadWorld\(world\.palette, world\.objects\.map\(\(o\) => o\.src\)\)/.test(hub));
  check('preloadAll hala aktorleri yukluyor (kontrol grubu)', /preloadAll\(heroRef\.current\)/.test(hub));
}

console.log('\n[3] EKSIK GORSELLE CHUNK PISMIYOR (dokunulmadi)');
{
  /**
   * ⚠️ BU KURAL DEGISMEDI ve degismemeli: yarim yuklenmis gorselle
   * pisirilen chunk SONSUZA KADAR bozuk kalir. Cozum chunk kuralini
   * gevsetmek degil, gorselleri ONDEN istemekti.
   */
  const hr = yorumsuz(oku('src/game/hubRender.ts'));
  check('eksik gorselde chunk onbellege ALINMIYOR', /if \(eksik\) return null;/.test(hr));
  check('yedek yol hala var (oyun bos ekran vermez)', /ctx\.fillStyle = '#1e2622'/.test(hr));
}

console.log('\n[4] ** PERDE ZEMIN CIZILEBILINCE KALKIYOR (ikinci bildirim)');
{
  /**
   * 🔴 KULLANICI IKINCI KEZ BILDIRDI: *"zemin, bina ve bu tarz ne varsa
   * hala yuklenme ekranindan sonra siyah goruntulerle duzeliyor. Homepage'te
   * de ayni sekilde."*
   *
   * ILK TUR EKSIK KALMISTI: gorselleri onden istemek (bolum [2]) indirmeyi
   * baslatiyordu ama PERDEYI ERKEN KALDIRMAYI durdurmuyordu. Iki ekran da
   * "harita geldi" anini "hazir" saniyordu.
   *
   * OLCULDU (tarayici, gercek zaman cizelgesi):
   *     harita JSON'u    : 1604 ms
   *     ilk zemin gorseli: 2172 ms  <-- perde 1604'te kalkiyordu
   *     son gorsel       : 2813 ms
   * Aradaki ~600 ms'de `drawTerrain` eksik karoyu duz koyu dikdortgenle
   * dolduruyor. "Siyah goruntuler" tam olarak o pencere.
   *
   * ⚠️ AG SUCLU DEGIL — olculdu: harita gzip'li 46150 bayt, indirme 17 ms.
   * Bu yuzden duzeltme indirme sirasinda degil, PERDENIN KALKMA ANINDA.
   */
  check('zeminHazirMi disa aciliyor', sp.includes('export function zeminHazirMi('));
  // ⚠️ ORAN ESIGI: tek bir yavas karo yuzunden sahneyi sonsuza kadar
  // gizlemek, sorunu daha kotusuyle degistirmek olurdu.
  check('esik oran ile veriliyor (hepsi degil, cogu)', sp.includes('oran = 0.9'));
  check('bos palet hazir sayiliyor (sifira bolme yok)', zeminHazirMi([]) === true);
  // 🔴 ZINCIRIN SON ADIMI IKI EKRANDA DA BAGLI OLMALI
  const menu = yorumsuz(oku('src/components/MenuBackground.tsx'));
  check('ana sayfa perdesi zemine bagli', menu.includes('zeminHazirMi(world.palette)'));
  check('ana sayfa dunyanin gorsellerini de istiyor', menu.includes('preloadWorld(w.palette'));
  check('koy perdesi zemine bagli', hub.includes('zeminHazirMi(world.palette)'));
  /**
   * ⚠️ TAVAN SART VE IKI EKRANDA DA OLMALI. Bozuk tek bir karo yuzunden
   * koyu ya da ana sayfayi HIC acmamak kabul edilemez; bekleme suresi
   * sinirli.
   */
  check('ana sayfada bekleme tavani var', menu.includes('2500'));
  check('koyde bekleme tavani var', hub.includes('2500'));
  check('uydurma desen bulunmuyor (kontrol grubu)', !menu.includes('zeminZZZ'));
}

console.log(`\n${FAIL.length === 0 ? 'YUKLEME SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
