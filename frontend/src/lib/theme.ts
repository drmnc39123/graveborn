// GRAVEBORN — kimlik ve tema tek kaynak.
// KURAL: MOR YOK. Hiçbir yerde. Palet gotik korku: mezar toprağı, kemik, kan, buz, mum ışığı.
// KURAL: Tüm stiller INLINE yazılır — Tailwind arbitrary değerleri Phantom in-app browser'da çalışmıyor.

export const BRAND = {
  name: 'GRAVEBORN',
  ticker: 'GRAVE',
  tagline: 'Rise Again',
  pitch: 'Ölü kalamayan bir survivor. Her run bir diriliş.',
} as const;

/** Palet — mor ASLA eklenmez */
export const C = {
  // zemin
  grave: '#2b1f16', // mezar toprağı — ana koyu zemin
  soil: '#1c140e', // daha derin toprak
  void: '#0a0806', // en dip, canvas arkaplanı

  // ön plan
  bone: '#e3d8c0', // kemik — ana metin
  boneDim: '#b8ae98', // ikincil metin
  boneFaint: '#7d7565', // üçüncül / disabled

  // vurgu
  blood: '#a01226', // kan kırmızısı — hasar, tehlike, CTA
  bloodSoft: '#c8324a',
  candle: '#efa72e', // mum altını — ödül, GOLD, vurgu
  candleSoft: '#f7c46a',
  ice: '#8a97a3', // buz grisi — soğuk/UI çizgileri

  // durum
  ok: '#5f9e4a', // yeşil — onay (çürük yeşili tonunda)
  warn: '#efa72e',
  bad: '#a01226',

  border: 'rgba(227,216,192,0.14)', // kemik bazlı ince kenar
} as const;

/**
 * Yazı tipi yığını.
 * `FantasyRPGtext` / `FantasyRPGtitle` Franuka paketinden gelir ve
 * `public/fonts/` altına konunca KENDİLİĞİNDEN devreye girer (layout.tsx'teki
 * @font-face). Dosya yoksa tarayıcı sessizce yedeğe düşer — kırılmaz.
 * ⚠️ Bu fontlar bitmap türevi: metin 8'in katı, başlık 11'in katı boyutta
 * kullanılmalı, yoksa piksel ızgarası bozulur.
 */
export const FONT = {
  ui: '"FantasyRPGtext", ui-monospace, "Cascadia Mono", "Courier New", monospace',
  title: '"FantasyRPGtitle", "FantasyRPGtext", ui-monospace, "Courier New", monospace',
} as const;

/** Cam panel — BOMB Miner'daki glass() deseni, GRAVEBORN paletiyle */
export function glass(radius = 14) {
  return {
    background: 'linear-gradient(180deg, rgba(43,31,22,0.82), rgba(10,8,6,0.9))',
    border: `1px solid ${C.border}`,
    borderRadius: radius,
    backdropFilter: 'blur(10px)',
  } as const;
}

/** Mum ışığı altın gradyan metin (başlıklar) */
export const candleGradientText = {
  background: `linear-gradient(180deg, ${C.candleSoft}, ${C.candle})`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as const;

/** Ana CTA butonu */
export function ctaButton(enabled = true) {
  return {
    padding: '12px 26px',
    borderRadius: 12,
    fontWeight: 900,
    fontSize: 15,
    letterSpacing: 0.3,
    border: 'none',
    cursor: enabled ? 'pointer' : 'default',
    color: enabled ? '#1a0508' : C.boneFaint,
    background: enabled ? `linear-gradient(180deg, ${C.bloodSoft}, ${C.blood})` : 'rgba(227,216,192,0.08)',
  } as const;
}
