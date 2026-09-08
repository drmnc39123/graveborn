// NAVBAR SAG KUME MUHRU — hizalama ve olcu.
//
// 🔴 KULLANICI YAKALADI (2026-09-09): "0 gold, 0 grave, demo, soru isareti,
// X ve telegram butonlarinin hepsinin boyutu farkli, birisi altta birisi
// ustte duruyor."
//
// OLCULDU ve iki ayri sebep cikti:
//   1. Sarmalayici `alignItems: 'baseline'` kullaniyordu. Baseline METIN
//      TABAN CIZGISINI hizalar, KUTUYU degil; bu kumede 14 px yazi, 9 px
//      bir cip ve 24 px bir dugme yan yana duruyor. Dikey merkezler
//      66 · 72 · 71 idi — yani goze "biri altta biri ustte".
//   2. Cipler farkli boydaydi: 14 · 24 · 26. Hizalama tek basina bunu
//      duzeltmezdi.
//
// Duzeltmeden sonra: merkez yayilimi 0, cip yukseklik yayilimi 0.
//
// ⚠️ BU MUHUR KAYNAK TARIYOR, PIKSEL OLCMUYOR. Gercek olcum tarayicida
// yapildi; burasi o kararin GERI ALINMADIGINI bekliyor. Bir gun biri
// `baseline`a donerse ya da bir cipe elle boy yazarsa kirmizi verir.
//
//   cd frontend && npx tsx src/game/dock.test.mts

import fs from 'node:fs';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const dockHam = oku('src/components/BuildingDock.tsx');
const dock = yorumsuz(dockHam);
const sosyal = yorumsuz(oku('src/components/SocialLinks.tsx'));

console.log('\n=== NAVBAR SAG KUME ===');

console.log('\n[1] ** KUTULAR HIZALI, METIN TABANI DEGIL');
{
  /**
   * `baseline` bu kumede yanlis arac: farkli punto ve farkli kutu boyu var.
   * Merkez hizalamasi yazi boyundan bagimsiz calisir.
   */
  /**
   * ⚠️ ALET NOTU: ilk surum `slice(idx - 400)` alip sonra `slice(0, 400)`
   * diyordu — yani pencere tam `borderLeft`in ONUNDE bitiyordu ve kontrol
   * grubu dustu. Dilim aritmetigi sessizce yanlis pencereyi olcebilir;
   * kontrol grubu tam bunun icin var.
   */
  const i = dock.indexOf('borderLeft: `1px solid ${C.border}`');
  const blok = dock.slice(Math.max(0, i - 400), i + 200);
  check('sag kume alignItems: center', /alignItems: 'center'/.test(blok), blok.match(/alignItems: '\w+'/)?.[0] ?? 'yok');
  check('baseline geri gelmemis', !/alignItems: 'baseline'/.test(blok));
  // ⚠️ CIFT TARAFLI: dogru blogu bulduk mu
  check('dogru blok tarandi (kontrol grubu)', /borderLeft/.test(blok));
}

console.log('\n[2] ** CIPLER TEK OLCUDEN');
{
  /**
   * Ayri ayri yazilan bir olcu, biri degistiginde digerleri eski kalir.
   * Uc cip de (hesap · rehber · sosyal) ayni sabiti kullanmali.
   */
  check('KONTROL_BOYU sabiti var', /export const KONTROL_BOYU = \d+/.test(dock),
    dock.match(/KONTROL_BOYU = \d+/)?.[0] ?? 'yok');
  const kullanim = (dock.match(/KONTROL_BOYU/g) ?? []).length;
  // tanim + hesap cipi(1) + rehber dugmesi(2: width/height) + sosyal(1)
  check('en az uc yerde kullaniliyor', kullanim >= 5, `${kullanim} gecis`);
  check('sosyal ikonlar da ayni sabitten', /SocialLinks boyut=\{KONTROL_BOYU\}/.test(dock));

  // ⚠️ Elle yazilmis 24/26 gibi bir boy kalmamali
  check('rehber dugmesinde elle boy yok',
    !/aria-label="Open the codex"[\s\S]{0,400}(width|height): 2\d,/.test(dockHam));
}

console.log('\n[3] ** KONTROL_BOYU GERCEK YUKSEKLIK (border-box)');
{
  /**
   * 🔴 OLCULDU: hizalama duzeldikten SONRA bile `?` 24, digerleri 26 px
   * cikiyordu. Sebep `content-box`: 1 px kenarlik boyu disari ekliyor.
   * Sabit, soyledigi seyi ifade etmiyorsa sabit degildir.
   */
  check('hesap cipi border-box', /boxSizing: 'border-box',\s*\n\s*height: KONTROL_BOYU/.test(dock));
  check('rehber dugmesi border-box',
    /all: 'unset', boxSizing: 'border-box'[\s\S]{0,300}width: KONTROL_BOYU/.test(dock));
  check('sosyal ikon border-box',
    /boxSizing: 'border-box',\s*\n\s*width: boyut, height: boyut/.test(sosyal));
}

console.log('\n[4] DAR EKRAN KURALLARI KORUNDU');
{
  /**
   * ⚠️ Telefonda gizlenecek ilk sey baglantilar olabilir; oyunu ANLATAN sey
   * olamaz. Rehber dugmesi `dar` kosuluna BAGLANMAMALI.
   */
  check('sosyal ikonlar dar ekranda gizli', /\{!dar && <SocialLinks/.test(dock));
  check('$GRAVE dar ekranda gizli', /\{!dar && \(/.test(dock));
  check('rehber dugmesi dar ekranda DA duruyor',
    !/\{!dar && [\s\S]{0,120}Open the codex/.test(dockHam));
}

console.log(`\n${FAIL.length === 0 ? 'NAVBAR SAG KUME SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
