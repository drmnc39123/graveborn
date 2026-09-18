// KOY HUD YERLESIM MUHRU — minimap kutusu ve sag kolon.
//
// 🔴 KULLANICI BILDIRIMI: *"tabletten, mobilden, dizustu pc'den girenler
// icin navbar kesik veya minimapin ustunde kalabiliyor; minimapin
// altindaki etkinlik takvimi ve duyuru ekranin daha farkli yerinde
// gorunebiliyor."*
//
// OLCULDU, iki sebep:
//   1. AYNI DIKDORTGEN IKI YERDE. Canvas dar ekranda minimapi %70'e
//      kucultuyordu; sag kolon `top: 146` · `width: 180` diye SABIT
//      yazilmisti. 375 px'de 47 px havada duran bosluk + 52 px hizasizlik.
//   2. MINIMAP NAVBARI HIC GORMUYORDU. Rihtim satir sarinca boyu buyuyor
//      (sayfa bunu OLCUYOR) ama minimap sabit `y = 14`'te ciziliyordu.
//
// ⚠️ BU MUHUR GEOMETRIYI HESAPLIYOR, PIKSEL OLCMUYOR. Gercek olcum
// tarayicida yapildi (asagidaki sayilar oradan); burasi o kararin geri
// alinmadigini bekliyor.
//
//   cd frontend && npx tsx src/game/hudLayout.test.mts

import fs from 'node:fs';
import {
  KOLON_ARA, MINI_DAR_ESIK, MINI_SAG, NAVBAR_ARA,
  LB_METIN_KISA, LB_METIN_TAM, PIXEL_DUGME_KENAR, SOL_KART_MAX,
  leaderboardDugmesi, minimapIc, minimapKutusu, sagKolon, solKolon,
  kisaEkranMi, panelKutusu,
} from './hudLayout.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const play = yorumsuz(oku('src/app/play/page.tsx'));
const hub = yorumsuz(oku('src/game/hubRender.ts'));
const canvas = yorumsuz(oku('src/components/HubCanvas.tsx'));

console.log('\n=== KOY HUD YERLESIMI ===');

console.log('\n[1] ** TARAYICIDA OLCULEN DEGERLER TUTUYOR');
{
  /**
   * ⚠️ Bu dort satir GERCEK olcum (uretim disi dev sunucu, 2026-09-08).
   * Kolonun sol kenari ve genisligi minimap kutusuyla BIREBIR ayni cikti.
   */
  // 375 px · rihtim 48 px, sol kenar 10 (rihtim neredeyse tum satiri kapliyor)
  const m375 = minimapKutusu(375, 48, 10);
  check('375: kutu x=237 w=128', m375.x === 237 && m375.w === 128, `x=${m375.x} w=${m375.w}`);
  /**
   * 🔴 2026-09-18 (mobil-denetim, 375x560 Phantom): kolon kutuyla ayni
   * 128 px'te kalinca "CONNECT WALLET" -> "CONNEC…", ReadyCard "one rur"
   * diye kesiliyordu. Dar ekranda kolon SAGA DAYALI kalip 184'e genisliyor.
   */
  const k375 = sagKolon(375, 48, 10);
  check('375: kolon x=181 w=184 (dar ekranda genisledi)',
    k375.x === 181 && k375.w === 184, `x=${k375.x} w=${k375.w}`);
  check('375: kolon y=157 (tarayicida olculdu)', k375.y === 157, `y=${k375.y}`);

  // 1366 px · rihtim genis ama minimapa ULASMIYOR
  const k1366 = sagKolon(1366, 48, 400);
  check('1366: kolon x=1176 w=180 (tarayicida olculdu)',
    k1366.x === 1176 && k1366.w === 180, `x=${k1366.x} w=${k1366.w}`);
  check('1366: kolon y=146 — genis ekranda ESKI DAVRANIS korunuyor',
    k1366.y === 146, `y=${k1366.y}`);
}

console.log('\n[2] ** KOLON HER ZAMAN KUTUYLA AYNI HIZADA');
{
  /**
   * 🔴 ASIL HATA BUYDU: kolon 180 px sabitti, minimap dar ekranda 128'e
   * dusuyordu — kart soldan 52 px tasiyordu.
   */
  let enKotuGenislik = 0, enKotuBosluk = 0;
  for (let w = 320; w <= 1920; w += 7) {
    if (w < MINI_DAR_ESIK) continue;   // dar ekran asagida ayri kuralla
    for (const [nh, ns] of [[48, 10], [80, 60], [48, 500], [120, 0]]) {
      const k = minimapKutusu(w, nh, ns);
      const c = sagKolon(w, nh, ns);
      enKotuGenislik = Math.max(enKotuGenislik, Math.abs(c.w - k.w));
      enKotuGenislik = Math.max(enKotuGenislik, Math.abs(c.x - k.x));
      // Kolonun ustu ile kutunun alti arasindaki bosluk SABIT olmali
      enKotuBosluk = Math.max(enKotuBosluk, Math.abs((c.y - (k.y + k.h)) - KOLON_ARA));
    }
  }
  check('GENIS ekranda kolon genisligi/soli kutuyla BIREBIR', enKotuGenislik === 0, `en kotu sapma ${enKotuGenislik} px`);
  // Dar ekranda: sag kenar kutuyla AYNI, genislik kutudan az DEGIL, ekrana sigiyor
  let darHata = '';
  for (let w = 300; w < MINI_DAR_ESIK; w += 5) {
    const k = minimapKutusu(w, 48, 10);
    const c = sagKolon(w, 48, 10);
    if (c.x + c.w !== k.x + k.w) darHata ||= `${w}: sag kenar kaydi`;
    if (c.w < k.w) darHata ||= `${w}: kutudan dar`;
    if (c.x < MINI_SAG) darHata ||= `${w}: soldan tasti x=${c.x}`;
  }
  check('DAR ekranda kolon saga dayali, kutudan genis, ekranda', !darHata, darHata);
  check('kutu ile kolon arasi HER ZAMAN ayni', enKotuBosluk === 0, `en kotu sapma ${enKotuBosluk} px`);
  // ⚠️ Sag kenarlar da ayni dikeyde — iddia buydu, artik her genislikte dogru
  const sagFark = [320, 375, 640, 768, 1024, 1366, 1920].map((w) => {
    const k = minimapKutusu(w, 48, 10);
    return (w - (k.x + k.w)) - MINI_SAG;
  });
  check('sag kenar bosluğu her genislikte ayni', sagFark.every((d) => d === 0), sagFark.join(','));
}

console.log('\n[3] ** MINIMAP NAVBARIN ALTINA INIYOR (cift tarafli)');
{
  /**
   * 🔴 Rihtim ORTALI: sag kenari `ekranW - navbarSol`. O kenar minimapin
   * soluna dayaniyorsa minimap asagi inmeli.
   */
  const dar = minimapKutusu(768, 80, 40);       // rihtim 40..728 → minimapa dayaniyor
  check('cakisirken minimap navbarin ALTINDA', dar.y === 80 + NAVBAR_ARA, `y=${dar.y}`);
  // CIFT TARAFLI: rihtim daralinca minimap YUKARI donuyor
  const genis = minimapKutusu(768, 80, 620);    // rihtim 620..148? → hayir, 620 sol → sag 148 < x
  check('cakismazken minimap USTTE kaliyor (kontrol grubu)',
    genis.y === MINI_SAG, `y=${genis.y}`);

  /**
   * ⚠️ `navbarSol === 0` "HENUZ OLCULMEDI" demek olabilir. O durumda rihtimin
   * tum satiri kapladigi VARSAYILIYOR: yanlis tarafa dusmek ust uste
   * binmekten iyidir — bosluk cirkin, cakisma OYNANAMAZ.
   */
  check('olculmemis navbar guvenli tarafa dusuyor',
    minimapKutusu(1920, 60, 0).y === 60 + NAVBAR_ARA);

  // Navbar buyudukce minimap de iniyor — monotonluk
  const yler = [40, 60, 80, 120].map((h) => minimapKutusu(768, h, 40).y);
  check('navbar buyudukce minimap iniyor',
    yler.every((v, i) => i === 0 || v > yler[i - 1]), yler.join(','));
}

console.log('\n[4] IC ALAN VE DAR ESIK');
{
  const k = minimapKutusu(1366, 48, 400);
  const ic = minimapIc(k);
  check('ic alan kutunun icinde', ic.x > k.x && ic.y > k.y && ic.w < k.w && ic.h < k.h);
  check('cerceve her yonde esit', (k.w - ic.w) === (k.h - ic.h));
  // ⚠️ Esik: 640'in ALTINDA kucuk, USTUNDE tam boy — cift tarafli
  check('esigin altinda kucuk', minimapKutusu(MINI_DAR_ESIK - 1, 0, 9999).w === 128);
  check('esikte tam boy (kontrol grubu)', minimapKutusu(MINI_DAR_ESIK, 0, 9999).w === 180);
}

console.log('\n[4b] ** TELEFON: KOLON ALTI, PANEL KUTUSU (Phantom olculeri)');
{
  /**
   * 🔴 OLCULDU (2026-09-18, mobil-denetim): yatay telefonda (780x340)
   * kartlar ekranin altina, dar dikeyde sohbetin ustune tasiyordu; panel
   * 48 px'lik nine-slice cercevesiyle (content-box) ekrandan buyuktu.
   * Phantom gorunur alanlari: SE 375x560 · a360 360x640 · yatay 780x340.
   */
  const yatay = sagKolon(780, 48, 200, 340, 0);
  check('yatay: kolon ekranin altinda bitiyor',
    yatay.maxH !== undefined && yatay.y + yatay.maxH <= 340, `y=${yatay.y} maxH=${yatay.maxH}`);
  const se = sagKolon(375, 48, 10, 560, 200);
  check('SE: kolon sohbetin ustunde bitiyor',
    se.maxH !== undefined && se.y + se.maxH <= 560 - 200, `alt=${se.y + (se.maxH ?? 0)}`);
  const seKapali = sagKolon(375, 48, 10, 560, 0);
  check('sohbet yokken daha uzun (kontrol grubu)', (seKapali.maxH ?? 0) > (se.maxH ?? 0));
  check('ekranH verilmezse sinir yok (masaustu eski davranis)', sagKolon(1366, 48, 400).maxH === undefined);

  check('kisaEkranMi: 340 kisa, 560 degil', kisaEkranMi(340) && !kisaEkranMi(560));
  check('kisaEkranMi: olculmemis (0) kisa DEGIL', !kisaEkranMi(0));
  for (const [w, h] of [[375, 560], [360, 640], [390, 700], [780, 340]]) {
    const pk = panelKutusu(w, h, 48);
    const toplam = pk.ustBosluk + (pk.maxH ?? 0) + pk.yanBosluk;
    check(`panel ${w}x${h}: olcek 2, ekrana sigiyor`, pk.olcek === 2 && toplam <= h, `olcek=${pk.olcek} toplam=${toplam}`);
  }
  check('masaustunde olcek 3 (kontrol grubu)', panelKutusu(1366, 768, 48).olcek === 3);
  check('panel border-box (cerceve maxH icinde)', /boxSizing: 'border-box'[\s\S]{0,200}maxHeight: pk\.maxH/.test(play)
    || /maxHeight: pk\.maxH[\s\S]{0,200}boxSizing: 'border-box'/.test(play));
  check('panel olcegi pk\'dan', /scale=\{pk\.olcek\}/.test(play));
  check('kolon kaydirilabilir', /maxHeight: kolon\.maxH/.test(play));
}

console.log('\n[5] ** SABIT SAYILAR KAYNAKTAN SILINDI');
{
  /**
   * 🔴 CIFT TARAFLI KONTROL: fonksiyon dogru olsa bile sayfa hala kendi
   * sabitini kullaniyorsa hicbir sey duzelmez. Bu depodaki en pahali hata
   * sinifi tam bu — kod calisir, veri gelir, son adimda olur.
   */
  check('sayfa kolonu hudLayout\'tan aliyor', /sagKolon\(ekranW, dockH, dockLeft, ekranH, sohbetH\)/.test(play));
  check('kolon konumu turetilmis deger kullaniyor',
    /top: kolon\.y, right: kolon\.right, width: kolon\.w/.test(play));
  check('sabit "top: 146" KALMADI', !/top: 146/.test(play));
  check('sabit "width: 180" KALMADI', !/width: 180/.test(play));

  check('canvas minimapi hudLayout\'tan ciziyor', /const kutu = minimapKutusu\(w, navbarH, navbarSol\)/.test(hub));
  check('hubRender kendi MINI_W\'sini tutmuyor', !/const MINI_W = /.test(hub));
  check('sabit "y = 14" KALMADI', !/const x = w - mw - 14, y = 14/.test(hub));

  // Navbar olcusu GERCEKTEN canvas'a ulasiyor mu — zincirin son adimi
  check('sayfa olcuyu HubCanvas\'a veriyor', /navbarH=\{dockH\}/.test(play) && /navbarSol=\{dockLeft\}/.test(play));
  check('HubCanvas onu renderHub\'a tasiyor',
    (canvas.match(/navbarRef\.current\.h, navbarRef\.current\.sol/g) ?? []).length === 2);
  /**
   * ⚠️ REF, EFEKT BAGIMLILIGI DEGIL: bagimlilik listesine konsaydi pencere
   * her boyutlandiginda cizim dongusu yeniden kurulur, `hub` durumu
   * sifirlanir ve oyuncu koyun ortasina isinlanirdi.
   */
  check('navbar olcusu REF ile tasiniyor', /const navbarRef = useRef\(/.test(canvas));
  check('uydurma desen bulunmuyor (kontrol grubu)', !/navbarZZZ/.test(play + hub + canvas));
}

// ── [6] SOL KOLON + LEADERBOARDS DÜĞMESİ ──
//
// 🔴 NİYE VAR (kullanıcı): *"Profil kartının tam altına bir leaderboards
// butonu."* Kartın konumu sayfada elle yazılıydı — sağ kolonun eski
// `top: 146` hatasının sol ikizi. Değerler tarayıcıda ölçüldü (sayfa
// YENİDEN YÜKLENEREK — yeniden boyutlandırmada `dockLeft` güncellenmiyor,
// yüklemesiz ölçüm üç genişlikte de 123 px diye yalan söyledi):
//   1366 → LEADERBOARDS 214 px · 1134 → RANKS 123 px · 900 / 700 → gizli, kupa sohbette
console.log('\n[6] sol kolon + leaderboards dugmesi');
{
  const genis = solKolon(768, 400, 90);
  check('genis ekran: kart tam genislik', genis.w === SOL_KART_MAX, `${genis.w}`);
  check('genis ekran: sutun gorunur', genis.gorunur);
  check('dar ekran (dock sola yasli): sutun GIZLI', !solKolon(812, 10, 90).gorunur);
  check('sohbet buyudukce sutun kisaliyor',
    solKolon(768, 400, 270).maxH < solKolon(768, 400, 31).maxH,
    `${solKolon(768, 400, 270).maxH} < ${solKolon(768, 400, 31).maxH}`);
  check('maxH hic negatif olmuyor', solKolon(200, 400, 400).maxH === 0);

  // Etiket katmanlari — olculen metin genislikleri
  check('214 px: LEADERBOARDS', leaderboardDugmesi(214).etiket === 'LEADERBOARDS' && leaderboardDugmesi(214).goster);
  check('123 px: RANKS (1134 px ekranin olculen sutunu)',
    leaderboardDugmesi(123).etiket === 'RANKS' && leaderboardDugmesi(123).goster);
  check('dugme kucukse GIZLI (kesik dugme yok)', !leaderboardDugmesi(100).goster);
  // ⚠️ SINIRLAR: tam esikte sigmali, bir piksel altinda kisa ada dusmeli
  check('esik: tam metin tam sigdiginda gosteriliyor',
    leaderboardDugmesi(LB_METIN_TAM + PIXEL_DUGME_KENAR).etiket === 'LEADERBOARDS');
  check('esik: bir piksel eksikte kisa ad',
    leaderboardDugmesi(LB_METIN_TAM + PIXEL_DUGME_KENAR - 1).etiket === 'RANKS');
  check('esik: kisa ad da sigmiyorsa gizli',
    !leaderboardDugmesi(LB_METIN_KISA + PIXEL_DUGME_KENAR - 1).goster);

  // Zincirin son adimi: sayfa gercekten bunlari kullaniyor mu
  check('sayfa sol kolonu hudLayout\'tan aliyor', /solKolon\(ekranH, dockLeft, sohbetH\)/.test(play));
  check('sayfada elle yazilmis "Math.min(214" KALMADI', !/Math\.min\(214/.test(play));
  check('etiket leaderboardDugmesi\'nden', /leaderboardDugmesi\(sol\.w\)/.test(play) && /\{lbDugme\.etiket\}/.test(play));
  check('sohbet yuksekligi olculuyor', /onHeight=\{setSohbetH\}/.test(play));
  check('sutun yatay kaydirma cizmiyor', /overflowX: 'hidden'/.test(play));
}

console.log(`\n${FAIL.length === 0 ? 'HUD YERLESIMI SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
