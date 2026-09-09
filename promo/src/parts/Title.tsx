// BAŞLIK KARTLARI — açılış logosu ve kapanış çağrısı.
//
// ⚠️ LOGO YENİDEN ÇİZİLMİYOR, OYUNUN FONTUYLA DİZİLİYOR. Ana sayfadaki
// tabela dokuz-dilim bir piksel çerçeve; onu videoda taklit etmek yerine
// aynı harfleri (Pixellari) kullanıp video ölçeğinde bir dizgi yapıyoruz.
// Aynı font + aynı palet = aynı marka; farklı bir "film logosu" icat etmek
// videodan siteye geçen izleyiciyi ikinci bir kimlikle karşılardı.

import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';

const GOLGE = '0 5px 0 rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.8)';

/**
 * GRAVEBORN — harf harf açılıyor.
 *
 * ⚠️ HARF ARALIĞI DA ANİMASYONLU: yalnız opaklık açmak "yazı belirdi"
 * hissi verir; aralığın toplanması "yazı YERİNE OTURDU" hissi verir. 9
 * harfte fark, 30 fps'te bir saniyeden kısa bir planda bile görünüyor.
 */
export const Logo: React.FC<{ altYazi?: string; olcek?: number }> = ({
  altYazi = 'ON SOLANA  ·  $GRAVE',
  olcek = 1,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = spring({ frame: f, fps, config: { damping: 200, mass: 0.9 } });
  const harfler = 'GRAVEBORN'.split('');

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        display: 'flex',
        letterSpacing: interpolate(g, [0, 1], [46, 14]) * olcek,
        paddingLeft: interpolate(g, [0, 1], [46, 14]) * olcek,
      }}>
        {harfler.map((h, i) => {
          const hg = spring({ frame: f - i * 2, fps, config: { damping: 200, mass: 0.5 } });
          return (
            <span key={`${h}${i}`} style={{
              fontFamily: FONT,
              fontSize: 168 * olcek,
              color: C.bone,
              textShadow: GOLGE,
              opacity: hg,
              transform: `translateY(${interpolate(hg, [0, 1], [26, 0])}px)`,
            }}>{h}</span>
          );
        })}
      </div>

      {/* ⚠️ Kan çizgisi ORTADAN AÇILIYOR — logonun altını "mühürlüyor". */}
      <div style={{
        height: 5 * olcek,
        width: interpolate(g, [0, 1], [0, 640 * olcek]),
        background: C.blood, marginTop: 26 * olcek, marginBottom: 24 * olcek,
      }} />

      <div style={{
        fontFamily: FONT, fontSize: 27 * olcek, color: C.candle,
        letterSpacing: 11 * olcek, textShadow: GOLGE,
        opacity: interpolate(f, [16, 30], [0, 1], { extrapolateRight: 'clamp' }),
      }}>{altYazi}</div>
    </div>
  );
};

/**
 * KAPANIŞ — adres ve hesaplar.
 * ⚠️ TEK ÇAĞRI: ekranda üç ayrı "şunu yap" olursa hiçbiri yapılmaz.
 * Ana çağrı adres; hesaplar altında küçük duruyor.
 */
export const Kapanis: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = spring({ frame: f, fps, config: { damping: 200, mass: 0.8 } });
  const g2 = spring({ frame: f - 16, fps, config: { damping: 200 } });
  const g3 = spring({ frame: f - 30, fps, config: { damping: 200 } });

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 4,
    }}>
      <div style={{
        fontFamily: FONT, fontSize: 116, color: C.bone, letterSpacing: 10,
        textShadow: GOLGE, opacity: g,
        transform: `translateY(${interpolate(g, [0, 1], [24, 0])}px)`,
      }}>GRAVEBORN</div>

      <div style={{
        height: 4, width: interpolate(g, [0, 1], [0, 470]),
        background: C.blood, margin: '22px 0 30px',
      }} />

      <div style={{
        fontFamily: FONT, fontSize: 58, color: C.candle, letterSpacing: 4,
        textShadow: GOLGE, opacity: g2,
        transform: `translateY(${interpolate(g2, [0, 1], [18, 0])}px)`,
      }}>playgraveborn.com</div>

      <div style={{
        fontFamily: FONT, fontSize: 25, color: C.boneDim, letterSpacing: 5,
        marginTop: 34, textShadow: GOLGE, opacity: g3,
      }}>X @playgraveborn   ·   TELEGRAM t.me/playgraveborn</div>

      <div style={{
        fontFamily: FONT, fontSize: 21, color: C.boneFaint, letterSpacing: 3,
        marginTop: 16, opacity: g3,
      }}>FREE TO PLAY  ·  NO DOWNLOAD  ·  DESKTOP &amp; MOBILE</div>
    </div>
  );
};
