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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
