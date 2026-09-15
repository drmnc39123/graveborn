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

// ── SOL KOLON ─────────────────────────────────────────────────────────
//
// 🔴 NİYE VAR (kullanıcı): *"Profil kartının tam altına bir leaderboards
// butonu yapalım."* Kartın konumu `play/page.tsx`te ELLE yazılıydı
// (`top:10 left:12 width:min(214, dockLeft-24)`) — sağ kolonun bir zamanlar
// `top: 146 · width: 180` diye elle yazılıp dar ekranda kaydığı hatanın
// sol taraftaki ikizi. Kartın altına bir şey eklenince bu elle yazılmış
// sayılar ikinci bir yere kopyalanacaktı.
//
// ⚠️ SOHBETİ GÖRÜYOR: sol sütun yukarıdan aşağı büyüyor, sohbet aşağıdan
// yukarı. Kart açılıp sohbet de açıkken (~270 px) ikisi üst üste binebilirdi.
// `maxH`, sohbetin ÖLÇÜLEN yüksekliğinden türüyor; sayfa sütunu bununla
// sınırlayıp taşanı kaydırıyor.

/** Ekranın sol kenarından sütuna kalan boşluk — sohbetle aynı dikey hat */
export const SOL_KENAR = 12;
/** Rıhtımla aynı hizada: navbar da `top: 10` */
export const SOL_UST = 10;
/** Kimlik kartının en geniş hâli */
export const SOL_KART_MAX = 214;
/**
 * Sütunun görünmesi için rıhtımın solunda kalması gereken en az boşluk.
 * ⚠️ 640 px altında rıhtım sola yaslanıyor (`dockLeft ≈ 10`) ve kart için
 * yer kalmıyor — o durumda sütun gizleniyor, kısayollar sohbet başlığına iner.
 */
export const SOL_GORUNUR_ESIK = 60;
/** Sütundaki öğeler arası ve sohbetle arasındaki boşluk */
export const SOL_ARA = 8;
/** Sohbetin ekranın altından mesafesi (`ChatPanel` `bottom: 12`) */
export const SOHBET_ALT = 12;

/**
 * Profil kartı + altındaki öğelerin sütunu.
 *
 * @param ekranH  görünür yükseklik (CSS px)
 * @param navbarSol rıhtımın ölçülen sol kenarı
 * @param sohbetH sohbet kutusunun ÖLÇÜLEN yüksekliği (açık/kapalı değişir)
 */
/**
 * LEADERBOARDS DÜĞMESİNİN ETİKETİ — sütun genişliğine göre.
 *
 * 🔴 NİYE VAR — ölçüldü (2026-09-15, 1134 px): sütun `navbarSol`dan türüyor
 * ve orta genişliklerde 123 px'e iniyor. `PixelButton` scale 2'nin dokuz-
 * dilim kenarları iki yandan 40'ar px yiyor → metne 43 px kalıyor, ama
 * "LEADERBOARDS" 88 px. Yazı "LEAD…" diye KESİLİYORDU. Bu, hafızadaki
 * "PixelButton kenarlık maliyeti metni kırpar" dersinin aynısı.
 *
 * Metin genişlikleri tarayıcıda, düğmenin kendi fontuyla ölçüldü
 * (`900 10.5px GBText`, letter-spacing 0.8 px):
 *   LEADERBOARDS 88 · RANKS 38 · BOARDS 46
 * BOARDS 43 px'e sığmadığı için kısa ad RANKS.
 *
 * ⚠️ Düğme hiç sığmıyorsa GİZLENİR ve kupa ikonu sohbet başlığına iner —
 * kesik bir düğme göstermek, hiç göstermemekten kötü.
 */
export const PIXEL_DUGME_KENAR = 80;
export const LB_METIN_TAM = 88;
export const LB_METIN_KISA = 38;

export function leaderboardDugmesi(sutunW: number): { goster: boolean; etiket: 'LEADERBOARDS' | 'RANKS' } {
  const metinAlani = sutunW - PIXEL_DUGME_KENAR;
  if (metinAlani >= LB_METIN_TAM) return { goster: true, etiket: 'LEADERBOARDS' };
  if (metinAlani >= LB_METIN_KISA) return { goster: true, etiket: 'RANKS' };
  return { goster: false, etiket: 'RANKS' };
}

export function solKolon(ekranH: number, navbarSol: number, sohbetH: number):
  Kutu & { gorunur: boolean; maxH: number } {
  const w = Math.max(0, Math.min(SOL_KART_MAX, navbarSol - 2 * SOL_KENAR));
  return {
    x: SOL_KENAR,
    y: SOL_UST,
    w,
    h: 0,
    gorunur: navbarSol > SOL_GORUNUR_ESIK,
    maxH: Math.max(0, ekranH - SOL_UST - SOHBET_ALT - sohbetH - SOL_ARA),
  };
}
