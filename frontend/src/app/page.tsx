import { BRAND, C, glass, candleGradientText, ctaButton } from '@/lib/theme';

// Faz 0 iskelet sayfası — kimlik/palet doğrulaması için. Faz 1'de yerini oyun girişi alacak.
export default function Home() {
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '72px 20px 56px' }}>
      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3, color: C.blood, marginBottom: 10 }}>
          ON SOLANA · ${BRAND.ticker}
        </div>
        <h1 style={{ fontSize: 62, fontWeight: 900, letterSpacing: -1.5, margin: '0 0 12px', ...candleGradientText }}>
          {BRAND.name}
        </h1>
        <p style={{ fontSize: 17, color: C.boneDim, margin: '0 0 8px' }}>
          Survive the endless horde. Die. <span style={{ color: C.bone, fontWeight: 700 }}>Rise again stronger.</span>
        </p>
        <p style={{ fontSize: 13, color: C.boneFaint, margin: 0 }}>{BRAND.pitch}</p>
        <div style={{ marginTop: 28 }}>
          <button style={ctaButton(true)}>{BRAND.tagline}</button>
        </div>
      </div>

      {/* Palet doğrulaması — mor olmadığını gözle kontrol etmek için */}
      <div style={{ ...glass(16), padding: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: C.boneFaint, marginBottom: 14 }}>
          PALET
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {([
            ['grave', C.grave], ['soil', C.soil], ['void', C.void],
            ['bone', C.bone], ['blood', C.blood], ['candle', C.candle], ['ice', C.ice],
          ] as const).map(([name, hex]) => (
            <div key={name} style={{ width: 96 }}>
              <div style={{ height: 52, borderRadius: 9, background: hex, border: `1px solid ${C.border}` }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: C.bone, marginTop: 6 }}>{name}</div>
              <div style={{ fontSize: 10, color: C.boneFaint, fontFamily: 'monospace' }}>{hex}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
