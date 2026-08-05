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
 * ⚠️ TEK AĞIRLIK — KALIN YÜZÜ YOK ve tarayıcı SENTETİK de üretmiyor.
 * Ölçüldü: 400 / 700 / 900 aynı genişliği veriyor (131 px). Yani arayüzdeki
 * `fontWeight: 900` kullanımları ETKİSİZ; hiyerarşi punto ve renkten geliyor.
 * Bunları temizlemeye gerek yok (zararsız) ama "kalın yapayım" diye ağırlık
 * artırmak da işe yaramaz — vurgu isteniyorsa punto ya da renk değişmeli.
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
 * ⚠️ LİSANS: font dosyasının name tablosunda yalnızca yazar adı var, lisans
 * metni YOK. Depo herkese açık ve ileride token çıkacak — yazarın şartları
 * `public/fonts/NOTICE-Pixellari.txt` içine yazılmalı (bkz. o dosya).
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
