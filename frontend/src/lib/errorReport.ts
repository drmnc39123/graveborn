'use client';
// İSTEMCİ HATA BİLDİRİMİ — tarayıcıda patlayan şeyi sunucuya taşı.
//
// 🔴 NİYE VAR: oyuncunun tarayıcısında patlayan bir hata HİÇBİR YERE
// yazılmıyordu. "Application error: a client-side exception has occurred"
// ekranını ancak oyuncu ekran görüntüsü atarsa öğreniyorduk — bu oturumda
// tam olarak öyle oldu ve hata (sonsuz render döngüsü) oyunu tamamen
// oynanamaz hâle getirmişti.
//
// ⚠️ ÜÇÜNCÜ TARAF YOK. Sentry vb. hem ücret hem de oyuncu verisinin
// dışarı çıkması. Gereken şey tek cümlelik: "canlıda ne patlıyor".
//
// ⚠️ HATA BİLDİRİMİ ASLA OYUNU BOZMAMALI. Her şey try/catch içinde,
// `keepalive` ile ateşle-unut, cevap OKUNMUYOR ve hiçbir yerde
// beklenmiyor.

const UC = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100') + '/client-error';

/** Oturum başına en fazla kaç bildirim — sunucu ayrıca sınırlıyor */
const OTURUM_TAVANI = 20;
/** Aynı mesajı bu süre içinde tekrar gönderme */
const TEKRAR_MS = 60_000;

let gonderilen = 0;
let kuruldu = false;
const sonGorulen = new Map<string, number>();

function bildir(mesaj: string, yigin: string | undefined) {
  try {
    if (gonderilen >= OTURUM_TAVANI) return;
    const m = String(mesaj || '').slice(0, 400);
    if (!m) return;
    /**
     * ⚠️ AYNI MESAJ BASTIRILIYOR. Bozuk bir render döngüsü saniyede
     * yüzlerce özdeş hata üretir; hepsini göndermek hem oyuncunun ağını
     * hem sunucunun hız sınırını yakar ve DİĞER hataların bildirilmesini
     * engellerdi. Sunucu tarafında da ayrıca birikiyor (`errorlog`).
     */
    const simdi = Date.now();
    const onceki = sonGorulen.get(m) ?? 0;
    if (simdi - onceki < TEKRAR_MS) return;
    sonGorulen.set(m, simdi);
    gonderilen++;

    const govde = JSON.stringify({
      message: m,
      // ⚠️ Yalnız yol + arama dizesi; tam URL'de jeton taşıyan bir bağlantı
      // olabilirdi. Kişisel veri göndermiyoruz.
      path: `${location.pathname}${location.search}`.slice(0, 160),
      stack: String(yigin ?? '').slice(0, 1200),
    });

    /**
     * ⚠️ `keepalive` ŞART: hata çoğu zaman sayfa çökerken ya da geçiş
     * yaparken oluşuyor. Normal bir `fetch` o anda iptal edilir ve
     * bildirim HİÇ ulaşmaz — yani tam ihtiyaç duyulan hatayı kaçırırdık.
     */
    void fetch(UC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: govde,
      keepalive: true,
    }).catch(() => { /* bildirim başarısızsa sessiz — asıl hata daha önemli */ });
  } catch { /* bildirim yolu asla fırlatmaz */ }
}

/**
 * Global yakalayıcıları kur. Kök düzende (layout) bir kez çağrılıyor —
 * yalnız `/play`de kurulsaydı ana sayfada ve giriş akışında patlayan
 * hatalar (en kritik olanlar) hiç görülmezdi.
 */
export function installErrorReporting(): () => void {
  if (typeof window === 'undefined' || kuruldu) return () => {};
  kuruldu = true;

  const onErr = (e: ErrorEvent) => {
    bildir(e.message || String(e.error ?? 'error'), e.error?.stack);
  };
  const onRej = (e: PromiseRejectionEvent) => {
    const r = e.reason;
    bildir(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
  };

  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onRej);
  return () => {
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onRej);
    kuruldu = false;
  };
}

/** React hata sınırlarından elle bildirmek için */
export function hataBildir(e: unknown, nereden: string) {
  const err = e instanceof Error ? e : new Error(String(e));
  bildir(`[${nereden}] ${err.message}`, err.stack);
}
