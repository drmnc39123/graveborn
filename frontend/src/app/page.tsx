import Link from 'next/link';
import { BRAND, C, FONT, glass, candleGradientText } from '@/lib/theme';

// Giriş sayfası. Tek işi oyuncuyu /play'e sokmak — eskiden buradaki CTA
// hiçbir yere bağlı DEĞİLDİ ve site kör bir çıkmazdı.
export default function Home() {
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '72px 20px 56px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3, color: C.blood, marginBottom: 10 }}>
          ON SOLANA · ${BRAND.ticker}
        </div>
        <h1 style={{ fontSize: 62, fontWeight: 900, letterSpacing: -1.5, margin: '0 0 12px', ...candleGradientText }}>
          {BRAND.name}
        </h1>
        <p style={{ fontSize: 17, color: C.boneDim, margin: '0 0 8px' }}>
          Survive the horde. Die. <span style={{ color: C.bone, fontWeight: 700 }}>Rise again stronger.</span>
        </p>
        <p style={{ fontSize: 13, color: C.boneFaint, margin: 0 }}>
          Clear a stage once for its reward — then descend forever.
        </p>
        <div style={{ marginTop: 30 }}>
          {/* prefetch'li Link: <a href> tam sayfa yeniden yükler, oyun ağır */}
          <Link href="/play" prefetch style={{
            display: 'inline-block', padding: '14px 40px', borderRadius: 12,
            fontWeight: 900, fontSize: 16, letterSpacing: 1.2, textDecoration: 'none',
            color: '#1a0508', background: `linear-gradient(180deg, ${C.bloodSoft}, ${C.blood})`,
            fontFamily: FONT.ui,
          }}>
            {BRAND.tagline.toUpperCase()}
          </Link>
        </div>
      </div>

      <div style={{ ...glass(16), padding: 22, display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {([
          ['THE CAMPAIGN', 'Five stages, each with a fixed horde and a one-time reward. Clear one to unlock the next.'],
          ['THE DESCENT', 'Endless depth ladder beneath every cleared stage. Health never refills between depths — how deep you get is how well you played.'],
          ['THE FORGE', 'Spend gold on permanent power. It carries into every run, even the ones you lose.'],
        ] as const).map(([title, body]) => (
          <div key={title}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, color: C.blood, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 13, color: C.boneDim, lineHeight: 1.6 }}>{body}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
