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
 * açılıyor ve orada dış istekler güvenilmez. Dosyalar repoda duruyor.
 *
 * • Jacquard 12 — pikselleştirilmiş blackletter, BAŞLIKLAR için. Büyük
 *   puntoda (20-64 px) karakterini gösteriyor, küçükte okunmaz.
 * • Pixelify Sans — okunabilir piksel gövde fontu. Değişken ağırlıklı
 *   olduğu için 10,5 / 11,5 gibi TAM SAYI OLMAYAN puntolarda da dağılmıyor;
 *   katı bitmap fontlar (Silkscreen vb.) bu arayüzde kırık görünürdü çünkü
 *   punto değerlerinin çoğu 8'in katı değil.
 *
 * `font-display: swap` — font gelmezse arayüz görünmez kalmaz, yedeğe düşer.
 * Lisans: ikisi de SIL OFL 1.1; metinleri aynı klasörde (OFL-*.txt).
 */
const FONT_FACE = `
@font-face {
  font-family: 'GBText';
  src: url('/fonts/PixelifySans-Variable.ttf') format('truetype');
  font-weight: 400 700;
  font-display: swap;
}
@font-face {
  font-family: 'GBTitle';
  src: url('/fonts/Jacquard12-Regular.ttf') format('truetype');
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
