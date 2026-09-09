// YAZI KATMANLARI — alt bant etiketi, tam ekran söz, madde listesi.
//
// ⚠️ HEPSİ TEK BİR TİPOGRAFİK KURALA UYUYOR: küçük ve harf aralıklı bir
// ÜST SATIR (kicker) + büyük bir ANA SATIR. Oyunun panellerinde de aynı
// düzen var ("THE FORGE / Permanent power", "THE BINDING / What you killed,
// kept") — video kendi başlık dilini icat etmiyor, oyununkini kullanıyor.
//
// ⚠️ OYUNCU METNİ İNGİLİZCE. Yorumlar Türkçe. Deponun kuralı.

import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';

/** Ortak giriş yayı — her yazı aynı ritimde gelsin. */
function giris(f: number, fps: number, gecikme = 0) {
  return spring({ frame: f - gecikme, fps, config: { damping: 200, mass: 0.6 } });
}

/** Metnin arkasına koyu bir taban — parlak zeminlerde okunurluk. */
const GOLGE = '0 3px 0 rgba(0,0,0,0.85), 0 0 26px rgba(0,0,0,0.75)';

export const Etiket: React.FC<{
  ust: string;
  ana: string;
  alt?: string;
  /** sol alt (varsayılan) ya da sol üst */
  konum?: 'altSol' | 'ustSol';
  renk?: string;
}> = ({ ust, ana, alt, konum = 'altSol', renk = C.candle }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = giris(f, fps);
  const kay = interpolate(g, [0, 1], [26, 0]);

  return (
    <div style={{
      position: 'absolute', left: 96,
      ...(konum === 'altSol' ? { bottom: 132 } : { top: 152 }),
      opacity: g, transform: `translateY(${kay}px)`,
      maxWidth: 1180,
    }}>
      <div style={{
        fontFamily: FONT, fontSize: 21, letterSpacing: 7,
        color: renk, textShadow: GOLGE, marginBottom: 12,
      }}>{ust}</div>

      {/* ⚠️ Çizgi SOLDAN AÇILIYOR: sabit bir çizgi yazının altında durur,
          açılan çizgi yazıyı "yerleştirir". Tek satırlık fark, videoda
          bakılan yeri belirliyor. */}
      <div style={{
        height: 3, width: interpolate(g, [0, 1], [0, 132]),
        background: renk, marginBottom: 18, opacity: 0.85,
      }} />

      <div style={{
        fontFamily: FONT, fontSize: 62, color: C.bone,
        letterSpacing: 1.5, textShadow: GOLGE, lineHeight: 1.1,
      }}>{ana}</div>

      {alt ? (
        <div style={{
          fontFamily: FONT, fontSize: 26, color: C.boneDim,
          marginTop: 16, letterSpacing: 1.2, textShadow: GOLGE,
          maxWidth: 980, lineHeight: 1.45,
          opacity: interpolate(f, [8, 22], [0, 1], { extrapolateRight: 'clamp' }),
        }}>{alt}</div>
      ) : null}
    </div>
  );
};

/** Tam ekran, ortalanmış tek cümle — bölüm arası nefes. */
export const Soz: React.FC<{
  ust?: string;
  satirlar: string[];
  alt?: string;
  renk?: string;
}> = ({ ust, satirlar, alt, renk = C.blood }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 10,
      textAlign: 'center', padding: '0 120px',
    }}>
      {ust ? (
        <div style={{
          fontFamily: FONT, fontSize: 22, letterSpacing: 9, color: renk,
          opacity: giris(f, fps), marginBottom: 18, textShadow: GOLGE,
        }}>{ust}</div>
      ) : null}

      {/* ⚠️ SATIR SATIR GELİYOR: hepsi aynı anda belirirse göz nereye
          bakacağını bilemiyor ve 2 saniyelik bir planda okunmuyor. */}
      {satirlar.map((s, i) => {
        const g = giris(f, fps, 5 + i * 6);
        return (
          <div key={s} style={{
            fontFamily: FONT, fontSize: 74, color: C.bone,
            letterSpacing: 2, lineHeight: 1.18, textShadow: GOLGE,
            opacity: g, transform: `translateY(${interpolate(g, [0, 1], [22, 0])}px)`,
          }}>{s}</div>
        );
      })}

      {alt ? (
        <div style={{
          fontFamily: FONT, fontSize: 27, color: C.boneDim, marginTop: 26,
          letterSpacing: 1.5, textShadow: GOLGE, maxWidth: 1240, lineHeight: 1.5,
          opacity: interpolate(f, [16, 32], [0, 1], { extrapolateRight: 'clamp' }),
        }}>{alt}</div>
      ) : null}
    </div>
  );
};

/**
 * MADDE ŞERİDİ — sağ kenarda, tek tek düşen kısa satırlar.
 * ⚠️ ÜÇTEN FAZLA MADDE KOYMA. Dört satır 2,5 saniyede okunmuyor; okunmayan
 * bir satır ekranı kirletmekten başka bir şey yapmıyor.
 */
export const Maddeler: React.FC<{ satirlar: string[]; renk?: string }> = ({
  satirlar, renk = C.candle,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{
      position: 'absolute', right: 96, bottom: 142,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14,
    }}>
      {satirlar.map((s, i) => {
        const g = giris(f, fps, 6 + i * 7);
        return (
          <div key={s} style={{
            fontFamily: FONT, fontSize: 29, color: C.bone,
            letterSpacing: 1.6, textShadow: GOLGE,
            opacity: g, transform: `translateX(${interpolate(g, [0, 1], [30, 0])}px)`,
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span>{s}</span>
            <span style={{ color: renk, fontSize: 22 }}>◆</span>
          </div>
        );
      })}
    </div>
  );
};
