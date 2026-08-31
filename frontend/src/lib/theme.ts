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
  /**
   * OLUMSUZ **METİN** — `bad` okunmadığı için var, süs değil. ÖLÇÜLDÜ,
   * panel zeminlerinde (#1c140e / #2b1f16 / #0a0806) kontrast:
   *   bad       #a01226 → 2,26 · 1,99 · 2,48   ✗ (3:1 bile değil)
   *   bloodSoft #c8324a → 3,47 · 3,06 · 3,82   ✗ (gövde metni 4,5 ister)
   *   badText   #e4657a → 5,57 · 4,92 · 6,13   ✓ WCAG AA
   *
   * ⚠️ YENİ RENK EKLENMEDİ. Bu ton ZATEN 12 yerde, 5 dosyada sert
   * kodluydu — yani paletin dışında, kimsenin ayarlayamadığı 15. renk
   * olarak yaşıyordu. Var olan gerçek buraya taşındı.
   * ⚠️ ZEMİN OLARAK KULLANMA — bu bir METİN rengi. Zemin ve çerçeve için
   * `blood` / `bloodSoft` duruyor.
   */
  badText: '#e4657a',

  border: 'rgba(227,216,192,0.14)', // kemik bazlı ince kenar
} as const;

/**
 * Yazı tipi yığını. Dosyalar `public/fonts/` altında, REPODA — CDN yok
 * (Phantom uygulama-içi tarayıcısında dış istekler güvenilmez).
 *
 * İKİSİ DE SILKSCREEN. Düz, süssüz bir piksel font; Regular + gerçek Bold.
 * `GBTitle` ayrı bir aile olarak duruyor çünkü başlıklar ileride yeniden
 * ayrışabilir — çağıran taraf tek bir isim kullanmaya devam etsin.
 *
 * ⚠️ Başlıkta 18 px ALTINA İNME. Silkscreen 8 px için çizilmiş; büyük
 * puntoda karakterli, küçükte gövde fontundan ayırt edilemiyor.
 *
 * Dosya yoksa tarayıcı sessizce yedeğe düşer — kırılmaz.
 */
export const FONT = {
  ui: '"GBText", ui-monospace, "Cascadia Mono", "Courier New", monospace',
  title: '"GBTitle", "GBText", ui-monospace, "Courier New", monospace',
} as const;

/**
 * ══════════════════════════════════════════════════════════════════════
 * YÜZEY DİLİ — hangi kutu nerede kullanılır. TEK KURAL, ÜÇ KATMAN.
 * ══════════════════════════════════════════════════════════════════════
 *
 * 🔴 NİYE YAZILI: depoda İKİ yüzey dili yan yana yaşıyordu — CSS buzlu cam
 * (`glass`, 95 çağrı / 22 dosya) ve piksel dokuz-dilim çerçeve (`<Panel>`,
 * 28 çağrı / 18 dosya) — ve hangisinin nerede kullanılacağına dair yazılı
 * bir kural YOKTU. Sonuç ölçülebilir bir tutarsızlıktı: köyün sağ
 * kolonunda üst üste duran iki kart (`EventBanner` ve `ReadyCard`)
 * BİRBİRİNDEN FARKLI yüzey kullanıyordu.
 *
 * ── KATMAN 1 · CANVAS'IN ÜSTÜ → `thinGlass(r, alpha)`
 *    Köyün/koşunun canlı görüntüsünün üstünde duran her şey: navbar, sohbet,
 *    etkinlik kartı, hazır kartı, portal ipucu, koşu HUD'u, ilk-koşu kartı.
 *    Amaç arkadaki DÜNYAYI KAPATMAMAK. Alfa göz kararı değil ölçülerek
 *    seçilir (bkz. `EventBanner`: en kötü zeminde kontrast tablosu).
 *
 * ── KATMAN 2 · PANEL KABUĞU → `<Panel>` (ui/kit)
 *    Tam ekran panelin ÇERÇEVESİ. Piksel sanat dokuz-dilim; oyunun
 *    kimliğini taşıyan yüzey burası.
 *
 * ── KATMAN 3 · PANEL İÇİ KART → `glass(r)`
 *    Zaten bir panelin ya da karartma perdesinin ÜSTÜNDE duran kartlar.
 *    Arkasında canlı dünya yok, o yüzden şeffaflığa gerek de yok;
 *    okunaklılık her şeyin önünde.
 *
 * ⚠️ KATMAN 1 İLE 3 ASLA KARIŞMAZ. `glass` bir panel zeminidir: orada
 * opaklık düşürülemez. `thinGlass` canvas üstü bir yüzeydir: orada
 * opaklık ARTIRILAMAZ. Tek fonksiyona parametre ekleyip birleştirmek,
 * birini ayarlarken diğerini sessizce bozmak demekti — `thinGlass`in
 * kendi notu bunu zaten söylüyor.
 *
 * ⚠️ Kural `fx.test` [G] ile mühürlü: canvas üstünde duran bileşenlerde
 * `glass(` geçemez.
 */

/** KATMAN 3 — panel içi kart. Canvas üstünde KULLANMA (bkz. yüzey dili). */
export function glass(radius = 14) {
  return {
    background: 'linear-gradient(180deg, rgba(43,31,22,0.82), rgba(10,8,6,0.9))',
    border: `1px solid ${C.border}`,
    borderRadius: radius,
    backdropFilter: 'blur(10px)',
  } as const;
}

/**
 * İNCE CAM — köyün ÜSTÜNDE duran, arkasını göstermesi gereken yüzeyler.
 *
 * ⚠️ AYRI FONKSİYON, `glass`'a parametre DEĞİL. `glass` panellerin zemini:
 * orada metin okunaklılığı her şeyin önünde ve opaklık düşürülemez. Navbar
 * ile sohbet kutusu ise köyün üstünde duruyor; oradaki amaç arkadaki dünyayı
 * KAPATMAMAK. İki farklı iş, iki farklı yüzey — tek fonksiyona parametre
 * eklemek, birini ayarlarken diğerini sessizce bozmak demekti.
 *
 * ⚠️ BULANIKLIK ARTIRILDI (10 → 16). Opaklık düşerken bulanıklık sabit
 * kalsaydı parlak çimenin üstünde metin okunmazdı; şeffaflığın bedeli
 * buradan ödeniyor.
 */
export function thinGlass(radius = 14, alpha = 0.40) {
  return {
    background: `linear-gradient(180deg, rgba(43,31,22,${alpha}), rgba(10,8,6,${alpha + 0.1}))`,
    border: `1px solid ${C.border}`,
    borderRadius: radius,
    backdropFilter: 'blur(16px)',
  } as const;
}

/** Mum ışığı altın gradyan metin (başlıklar) */
export const candleGradientText = {
  background: `linear-gradient(180deg, ${C.candleSoft}, ${C.candle})`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as const;
