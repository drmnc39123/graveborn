import type { Metadata, Viewport } from 'next';
import { BRAND, C } from '@/lib/theme';

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: 'Survive the endless horde. Die. Rise again stronger. On Solana.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // oyun ekranında pinch-zoom kazası olmasın
  themeColor: C.void,
};

/**
 * OYUN FONTLARI — dosyalar `public/fonts/` altında, PROJEYLE BİRLİKTE geliyor.
 *
 * ⚠️ CDN'DEN ÇEKİLMİYOR. Ne `next/font/google` (derlemede ağ ister) ne de
 * Google Fonts bağlantısı: oyun Phantom'un uygulama-içi tarayıcısında da
 * açılıyor ve orada dış istekler güvenilmez. Dosya repoda duruyor.
 *
 * • Pixellari (Zacchary Dempsey-Plante) — hem gövde hem başlık. Düz, süssüz,
 *   gerçek küçük harfli bir piksel font. Kullanıcının kendi seçimi.
 *
 * ⚠️ DOSYADA TEK AĞIRLIK VAR ama TARAYICI SENTETİK KALIN ÜRETİYOR.
 *
 * ⚠️ BURADA BİR ÖLÇÜM HATASI VARDI, DÜZELTİLDİ. Eski not "400/700/900 aynı
 * genişliği veriyor, `fontWeight: 900` ETKİSİZ" diyordu. Genişlik ölçüsü
 * YANLIŞ ALETTİ: Chromium bu fontta sentetik kalını ilerlemeyi (advance)
 * büyütmeden çiziyor, o yüzden genişlik hiç kıpırdamıyor. Doğru alet
 * MÜREKKEP: aynı metnin opak piksel sayısı.
 *
 *   400 → 4.524 piksel · 700 → 6.464 piksel  (+%42,9)
 *   (kontrol: sistem sans-serif aynı testte +%26,7 — yani alet sağlam)
 *
 * Yani `fontWeight` ÇALIŞIYOR ve vurgu için kullanılabilir.
 *
 * ⚠️ SENTEZ İKİLİ: 700 ile 900 BİREBİR AYNI (ikisi de 6.464). Ara kademe
 * yok — "biraz daha kalın" diye 800/900 yazmanın karşılığı yok, tek karar
 * kalın mı değil mi.
 *
 * ⚠️ "HER ŞEY KALIN" ŞÜPHESİ ÖLÇÜLDÜ ve DOĞRULANMADI — bu not, aynı yanlış
 * teşhisin üçüncü kez konulmasını önlemek için duruyor.
 *
 * Kaynak kodda sayınca tablo korkutucu görünüyor: 275 `fontWeight`
 * kullanımının 239'u 900, yalnızca 2'si 400. Ama KAYNAK SAYMAK YANLIŞ ALET.
 * Çalışan arayüzde render edilen metin ölçüldüğünde tablo tersine dönüyor:
 *
 *   Reliquary  125 metin · %78 kalın · uzun düz metin kalın: 0
 *   Forge      240 metin · %65 kalın · uzun düz metin kalın: 0
 *
 * Yani o 900'ler ETİKETLERE, öğe adlarına, değerlere, çiplere ve düğme
 * yazılarına düşüyor — kalının doğru olduğu yerler. Gövde metni (açıklamalar,
 * yardım satırları, alt başlıklar) ZATEN 400. Hiyerarşi çalışıyor.
 *
 * Sonuç: toplu bir "900 → 400" taraması YAPILMAMALI; düzeltilecek bir şey
 * yok, tarama çalışan hiyerarşiyi bozardı.
 *
 * ⚠️ İkinci bir aileyi kalın olarak eşleştirme denemesi YAPILMADI: Silkscreen
 * ve Pixellari'nin oranları farklı, karışım tutarsız görünürdü.
 *
 * Elenenler (aynı hataya tekrar düşülmesin diye):
 *   · Pixelify Sans — yuvarlak hatları "süslü" bulundu.
 *   · Jacquard 12 (blackletter) — en süslü parçaydı, başlıklardan kaldırıldı.
 *   · VT323 — bold yüzü yok VE ince/soluk; okunurluk düştü.
 *   · Silkscreen — düz ve gerçek bold'u var ama küçük harfleri küçük-kapital
 *     gibi duruyor, her şey bağırıyormuş gibi okunuyordu.

 *
 * `font-display: swap` — font gelmezse arayüz görünmez kalmaz, yedeğe düşer.
 */
const FONT_FACE = `
/* Tek aile, tek dosya, tek ağırlık. */
@font-face {
  font-family: 'GBText';
  src: url('/fonts/Pixellari.ttf') format('truetype');
  font-display: swap;
}
@font-face {
  font-family: 'GBTitle';
  src: url('/fonts/Pixellari.ttf') format('truetype');
  font-display: swap;
}
/* Piksel sanat her yerde net kalsın */
img { image-rendering: pixelated; }
button { font: inherit; }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><style dangerouslySetInnerHTML={{ __html: FONT_FACE }} /></head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: `radial-gradient(1200px 700px at 50% -10%, ${C.grave} 0%, ${C.soil} 45%, ${C.void} 100%)`,
          color: C.bone,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {children}
      </body>
    </html>
  );
}
