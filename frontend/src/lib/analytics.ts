// GOOGLE ANALYTICS — ne zaman ve nerede ölçüleceğinin TEK kuralı.
//
// 🔴 NİYE AYRI, SAF BİR MODÜL: bileşen (`components/Analytics.tsx`) React ve
// `next/script` taşıyor; kural onun içinde olsaydı mühür ancak kaynak METNİ
// tarayabilirdi. Burada kural bir fonksiyon — mühür onu gerçekten çağırıp
// davranışını ölçüyor (`game/analytics.test.mts`).
//
// ⚠️ ÖLÇÜM KİMLİĞİ GİZLİ DEĞİL: sayfa kaynağında zaten herkese görünüyor.
// Ortam değişkenine (`NEXT_PUBLIC_*`) konmadı, çünkü Railway'de "Redeploy"
// eski imajı kullanıyor ve yeni değer ancak yeni bir commit ile giriyor —
// hafızadaki ölçülmüş tuzak. Sabit tek yerde, burada.

export const GA_ID = 'G-VGVPBYCVKL';

/** Ölçüm yalnız kanonik alan adında — `next.config.mjs` `www`'yi buraya yönlendiriyor. */
export const GA_ALAN = 'playgraveborn.com';

/**
 * ÖLÇÜLEN SAYFALAR — İZİN LİSTESİ, yasak listesi DEĞİL.
 *
 * 🔴 NİYE İZİN LİSTESİ: hariç tutulması gereken bir yönetim sayfası var ve
 * adı `robots.ts`te bilerek gizleniyor. Yasak listesi yazsaydık o adı bu
 * dosyaya — yani HER ZİYARETÇİYE giden istemci paketine — yazmak zorunda
 * kalırdık. İzin listesiyle yönetim sayfası, harita editörü ve yakalama
 * tezgâhı adları hiç geçmeden kendiliğinden dışarıda kalıyor. Mühür bu
 * dosyada o adın GEÇMEDİĞİNİ de ölçüyor.
 *
 * ⚠️ `/` TAM EŞLEŞME: "`/` ile başlıyor" demek HER yolu kabul etmek olurdu.
 */
const TAM = new Set(['/', '/play', '/codex']);
const ONEK = ['/s/', '/codex/'];

export function izinliYol(yol: string): boolean {
  if (TAM.has(yol)) return true;
  return ONEK.some((o) => yol.startsWith(o));
}

// ── ÇEREZ ONAYI (Google Consent Mode v2) ───────────────────────────────
//
// 🔴 NİYE VAR (kullanıcı kararı, 2026-09-16): AB/KVKK. Seçenekler "katı
// opt-in" (onaysız GA hiç yüklenmez, %30-60 veri kaybı) ve "yalnız
// bilgilendirme" (GDPR'a yetmez) idi; seçilen Consent Mode v2:
//   · GA HER ZAMAN yükleniyor ama onay BÖLGESİNDE çerez YAZMIYOR
//     (`analytics_storage: denied`) — Google çerezsiz sinyallerle modelliyor
//   · onay verilince `consent update` ile çerez açılıyor
//   · reklam depolaması HER YERDE kapalı — oyunda reklam yok
// ⚠️ Bölge Google tarafında IP'den çözülüyor; istemci ülke tahmini YAPMIYOR.

/** Tarayıcıda saklanan seçim */
export const ONAY_ANAHTARI = 'graveborn:consent';
export type OnaySecimi = 'granted' | 'denied';

/**
 * Onay VARSAYILAN olarak reddedilen bölgeler: AB-27 + AEA (IS, LI, NO) +
 * Birleşik Krallık + İsviçre + Türkiye (KVKK).
 * ⚠️ Liste kısaltılırsa o ülkenin ziyaretçisine onaysız çerez yazılır.
 */
export const ONAY_BOLGELERI: readonly string[] = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',
  'GB', 'CH', 'TR',
];

/** Saklanan ham değeri doğrula — bozuk/eski değer "henüz seçilmedi" sayılır */
export function secimOku(ham: string | null | undefined): OnaySecimi | null {
  return ham === 'granted' || ham === 'denied' ? ham : null;
}

/**
 * `gtag('config')`ten ÖNCE çalışacak onay komutları.
 *
 * ⚠️ SIRA ŞART: `consent default` config'den SONRA gelirse ilk sayfa görüntüsü
 * onaysız çerezle gider. Mühür bileşende sırayı ölçüyor.
 * ⚠️ `wait_for_update`: saklı seçim aynı betikte hemen `update` ediliyor;
 * bekleme payı etiketin o güncellemeden önce ateşlenmesini önlüyor.
 */
export function onayKomutlari(secim: OnaySecimi | null): string {
  const reklamYok = `ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'`;
  const bolgeler = ONAY_BOLGELERI.map((b) => `'${b}'`).join(',');
  const satirlar = [
    `gtag('consent','default',{${reklamYok},analytics_storage:'denied',wait_for_update:500,region:[${bolgeler}]});`,
    `gtag('consent','default',{${reklamYok},analytics_storage:'granted',wait_for_update:500});`,
  ];
  if (secim) satirlar.push(`gtag('consent','update',{analytics_storage:'${secim}'});`);
  return satirlar.join('\n');
}

/**
 * Onay bandı gösterilmeli mi?
 * ⚠️ `webdriver` BURADA YOK: otomasyon tarayıcısı ölçülmüyor ama bandı
 * görebilmeli — canlıda bandı doğrulamanın tek yolu o.
 */
export function bantGosterilmeli(ortam: { hostname: string; yol: string; secim: OnaySecimi | null }): boolean {
  return ortam.hostname === GA_ALAN && izinliYol(ortam.yol) && ortam.secim === null;
}

/** "Cookie settings" bağlantısının yaydığı olay — bandı yeniden açar */
export const ONAY_SIFIRLA_OLAYI = 'graveborn:consent-reset';

/**
 * Bu tarayıcı ölçülmeli mi?
 *
 * ⚠️ `NODE_ENV === 'production'` TEK BAŞINA YETMİYOR — ölçüldü değil ama
 * yapı gereği kesin: yerel `next build && next start`, promo yakalama
 * araçları (Playwright) ve Railway'in `*.up.railway.app` adresi de production
 * derlemesi koşuyor. Onlar sayılsaydı rapor bizim kendi trafiğimizle dolardı.
 * Doğru kapı gerçek alan adı.
 *
 * ⚠️ `navigator.webdriver`: otomasyon tarayıcılarını dışarıda tutar.
 */
export function olculmeli(ortam: {
  hostname: string; webdriver: boolean; yol: string;
}): boolean {
  if (ortam.hostname !== GA_ALAN) return false;
  if (ortam.webdriver) return false;
  return izinliYol(ortam.yol);
}
