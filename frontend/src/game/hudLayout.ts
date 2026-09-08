// KÖY HUD'UNUN YERLEŞİM GEOMETRİSİ — minimap kutusu ve sağ kolon.
//
// 🔴 NİYE AYRI DOSYA (kullanıcı bildirimi): *"tabletten, mobilden, dizüstü
// pc'den girenler için navbar kesik veya minimapin üstünde kalabiliyor;
// minimapin altındaki etkinlik takvimi ve duyuru ekranın daha farklı
// yerinde görünebiliyor."*
//
// ÖLÇÜLDÜ, iki ayrı sebep çıktı:
//
//   1. MİNİMAP KUTUSU İKİ YERDE, İKİ FARKLI ŞEKİLDE yazılıydı.
//      `hubRender.drawMinimap` dar ekranda minimapı %70'e KÜÇÜLTÜYOR
//      (`w < 640`), ama sağ kolon `play/page.tsx`te `top: 146` ·
//      `width: 180` diye SABİT yazılmıştı — o sayılar TAM BOY minimap için
//      ölçülmüştü. 375 px'de sonuç:
//        · minimap kutusu y 10..99'da bitiyor, kart 146'da başlıyor
//          → 47 px havada duran bir boşluk
//        · minimap 128 px geniş, kart 180 px → kart soldan 52 px taşıyor,
//          "sağ kenarları aynı dikeyde" iddiası dar ekranda YANLIŞ
//      Sayfadaki yorum bu hizalamayı "tesadüf değil, ölçüyle seçildi" diye
//      anlatıyordu ve haklıydı — ama YALNIZ tek bir genişlik için.
//
//   2. MİNİMAP NAVBARI HİÇ GÖRMÜYORDU. Rıhtım satır sarınca boyu büyüyor
//      (sayfa bunu `onHeight` ile zaten ÖLÇÜYOR) ama minimap canvas'ın
//      içinde sabit `y = 14`'te çiziliyordu. Ara genişliklerde rıhtımın
//      sağ ucu minimapın soluna dayanıyor ve üstüne biniyordu.
//
// ⚠️ TEK KAYNAK OLMAK ZORUNDA. Aynı dikdörtgeni iki yere yazmak bu depoda
// her seferinde ayrıştı; burası saf veri, hem canvas hem HTML buradan
// okuyor, hem de node testinden çağrılabiliyor.
//
// ⚠️ SAF: DOM yok, React yok, `@/` takma adı yok.

/** Minimapın iç ölçüsü (çerçeve hariç) — tam boy */
export const MINI_W = 172;
export const MINI_H = 116;
/** Çerçeve payı: kutu her yönde bu kadar dışarı taşar */
export const MINI_KENAR = 4;
/** Ekranın sağ kenarından kutuya kalan boşluk */
export const MINI_SAG = 10;

/**
 * ⚠️ DAR EKRAN ORANI ÖLÇÜMLE SEÇİLDİ, TAHMİNLE DEĞİL (375 px):
 *   1,0 → minimap x 189..361, rıhtım 10..312 → 123 px çakışma
 *   0,8 → minimap x 223..361, rıhtım 10..232 →   9 px çakışma
 *   0,7 → minimap x 241..361, rıhtım 10..232 →   9 px BOŞLUK ✅
 * Rıhtım kısaltıldıktan sonra bile 0,8 yetmiyordu.
 */
export const MINI_DAR_ORAN = 0.7;
export const MINI_DAR_ESIK = 640;

/** Kutu ile altındaki kart sütunu arasındaki boşluk */
export const KOLON_ARA = 12;
/** Rıhtımın altına inmek gerektiğinde bırakılan pay */
export const NAVBAR_ARA = 8;

export interface Kutu { x: number; y: number; w: number; h: number }

/**
 * Minimapın DIŞ kutusu (çerçeve dahil) — canvas da HTML de bunu okur.
 *
 * @param ekranW  görünür genişlik (CSS px)
 * @param navbarH rıhtımın ÖLÇÜLEN yüksekliği (`BuildingDock` `onHeight`)
 * @param navbarSol rıhtımın ÖLÇÜLEN sol kenarı (`onLeft`); rıhtım ortalı
 *   olduğu için sağ kenarı `ekranW - navbarSol`
 *
 * ⚠️ `navbarSol === 0` "henüz ölçülmedi" demek olabilir; o durumda rıhtımın
 * tüm satırı kapladığı VARSAYILIYOR ve minimap aşağı iniyor. Yanlış tarafa
 * düşmek üst üste binmekten iyidir: boşluk çirkin, çakışma oynanamaz.
 */
export function minimapKutusu(ekranW: number, navbarH: number, navbarSol: number): Kutu {
  const dar = ekranW < MINI_DAR_ESIK;
  const mw = Math.round((dar ? MINI_W * MINI_DAR_ORAN : MINI_W));
  const mh = Math.round((dar ? MINI_H * MINI_DAR_ORAN : MINI_H));
  const w = mw + MINI_KENAR * 2;
  const h = mh + MINI_KENAR * 2;
  const x = ekranW - w - MINI_SAG;

  /**
   * ⚠️ RIHTIM ORTALI: sağ kenarı `ekranW - navbarSol`. Bu kenar minimapın
   * soluna dayanıyorsa minimap rıhtımın ALTINA iniyor — küçültmek yetmiyor,
   * çünkü rıhtım satır sardıkça hem uzuyor hem yükseliyor.
   */
  const navbarSag = navbarSol > 0 ? ekranW - navbarSol : ekranW;
  const cakisiyor = navbarSag > x;
  const y = cakisiyor ? Math.round(navbarH) + NAVBAR_ARA : MINI_SAG;

  return { x, y, w, h };
}

/** Minimapın İÇ çizim alanı — `drawMinimap` bunu kullanır */
export function minimapIc(k: Kutu): Kutu {
  return { x: k.x + MINI_KENAR, y: k.y + MINI_KENAR, w: k.w - MINI_KENAR * 2, h: k.h - MINI_KENAR * 2 };
}

/**
 * Minimapın ALTINDAKİ kart sütunu (etkinlik · duyuru · hazır olan).
 *
 * ⚠️ GENİŞLİK KUTUDAN TÜRÜYOR: sağ kenarları aynı dikeyde kalsın diye.
 * Sabit 180 px yazılıydı ve dar ekranda minimap 128'e düşünce kart 52 px
 * soldan taşıyordu.
 */
export function sagKolon(ekranW: number, navbarH: number, navbarSol: number): Kutu & { right: number } {
  const k = minimapKutusu(ekranW, navbarH, navbarSol);
  return { x: k.x, y: k.y + k.h + KOLON_ARA, w: k.w, h: 0, right: MINI_SAG };
}
