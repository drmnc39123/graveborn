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
