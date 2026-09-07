// ADMIN PANELİ HATA METİNLERİ.
//
// 🔴 NİYE AYRI BİR DOSYA: bu metin bir TEŞHİS ARACI. Panel açılmadığında
// operatörün elindeki tek ipucu bu cümle; yanlışsa yanlış yere bakılır.
//
// ⚠️ ÖLÇÜLMÜŞ OLAY (2026-09-07): panel "Sunucuya ulaşılamadı" dedi, oysa
// sunucu tamamen ayaktaydı (`/health` 200, `/flags` 200). Gerçek sebep
// 429'du — panel 10 ucu aynı anda çağırıyor ve 20/dk'lık admin tavanını iki
// açılışta dolduruyordu. Eski eşleme 401 ve 403 DIŞINDAKİ her kodu
// "ulaşılamadı" diye gösteriyordu; yani ağ hatası, sunucu hatası, hız
// sınırı ve sürüm uyuşmazlığı TEK ve YANLIŞ bir cümleye çöküyordu.
//
// ⚠️ METİNLER TÜRKÇE — bilerek. Depo kuralı "oyuncuya giden metin
// İngilizce" der; burası oyuncuya değil, operatöre (tek kişi) gidiyor.

/**
 * HTTP durum kodunu operatörün okuyacağı cümleye çevir.
 *
 * `kod` ya sayısal bir HTTP durumu ("429") ya da `fetch` fırlattığında
 * yakalanan serbest metindir ("Failed to fetch"). İkisi ayrı sonuç verir:
 * biri "sunucu cevap verdi ama olmadı", diğeri "sunucuya hiç ulaşılamadı".
 */
export function adminHataMetni(kod: string): string {
  switch (kod) {
    case '401':
      return 'Sır yanlış.';
    case '403':
      return 'Sunucuda ADMIN_SECRET tanımlı değil — panel kapalı.';
    /**
     * ⚠️ BU SATIR OLMADIĞI İÇİN BİR SAAT KAYBEDİLDİ. 429 "sunucu çalışıyor
     * ama seni yavaşlatıyor" demek; "ulaşılamadı" ise tam tersini söyler ve
     * operatörü sunucu/DNS/deploy tarafına bakmaya iter.
     */
    case '429':
      return 'Çok fazla istek — bir dakika bekleyip tekrar dene.';
    /**
     * ⚠️ SÜRÜM UYUŞMAZLIĞI KENDİNİ SÖYLESİN: frontend backend'den yeniyse
     * yeni uç 404 döner. Bu, dağıtımın yarım kaldığının en net işareti
     * (DEPLOY.md'de yazılı üç sessiz yoldan biri).
     */
    case '404':
      return 'Uç bulunamadı (404) — sunucu bu panelden eski olabilir, backend dağıtımını kontrol et.';
    default: {
      const n = Number(kod);
      if (!Number.isFinite(n) || !kod) return 'Sunucuya ulaşılamadı.';
      if (n >= 500) return `Sunucu hatası (${kod}) — Railway kayıtlarına bak.`;
      return `Beklenmeyen yanıt (${kod}).`;
    }
  }
}

/** Oturumu düşürmesi gereken kodlar — sır yanlışsa panelde tutmanın anlamı yok */
export function oturumDusmeli(kod: string): boolean {
  return kod === '401' || kod === '403';
}
