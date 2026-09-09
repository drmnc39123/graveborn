// TANITIM VİDEOSU KİMLİĞİ — oyunun paletinin AYNISI.
//
// 🔴 DEĞERLER `frontend/src/lib/theme.ts`ten KOPYALANDI, göz kararı
// SEÇİLMEDİ. Bir tanıtım videosunun oyundan bir ton sapması, oyuncunun
// videodan siteye geçtiğinde "başka bir yere geldim" hissetmesi demek.
//
// 🔴 MOR YOK. Deponun en eski kuralı; burada da geçerli.
//
// ⚠️ Font oyunun kendi fontu (`Pixellari.ttf`, `public/fonts/`) — oyunun
// içindeki her yazıyla aynı harfler. Videoya "oyunumsu" bir font seçmek
// yerine oyunun fontunu kullanmak, tek satırlık ama en görünür karar.

export const C = {
  grave: '#2b1f16',
  soil: '#1c140e',
  void: '#0a0806',
  bone: '#e3d8c0',
  boneDim: '#b8ae98',
  boneFaint: '#7d7565',
  blood: '#a01226',
  bloodSoft: '#c8324a',
  candle: '#efa72e',
  candleSoft: '#f7c46a',
  ice: '#8a97a3',
  ok: '#5f9e4a',
  border: 'rgba(227,216,192,0.16)',
} as const;

export const FONT = '"Pixellari", ui-monospace, "Courier New", monospace';

/** Videonun teknik ölçüsü — X'te en güvenli oran. */
export const W = 1920;
export const H = 1080;
export const FPS = 30;

/**
 * ⚠️ `fontFamily` HER METİN DÜĞÜMÜNDE VERİLİYOR, gövdeye bir kez değil:
 * Remotion her kareyi ayrı bir tarayıcı sekmesinde çiziyor ve miras alınan
 * font kuralı, `@font-face` geç yüklendiğinde tek tek karelerde yedeğe
 * düşebiliyor — sonuçta videonun ortasında iki kare başka fontta çıkar.
 */
export function metin(size: number, color: string = C.bone, weight = 400) {
  return {
    fontFamily: FONT,
    fontSize: size,
    color,
    fontWeight: weight,
    letterSpacing: Math.max(1, size * 0.04),
    lineHeight: 1.25,
    margin: 0,
  } as const;
}
