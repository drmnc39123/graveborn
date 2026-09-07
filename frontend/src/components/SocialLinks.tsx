'use client';
// SOSYAL BAĞLANTILAR — X ve Telegram, köyün sağ kolonunda.
//
// ⚠️ İKONLAR GÖMÜLÜ SVG, dış dosya ya da CDN DEĞİL. Sebebi ölçülmüş bir
// kural: bu depoda dış bağlantı/dosya sessizce 404 olabiliyor ve kimse fark
// etmiyor (9-slice çerçeveler tam olarak böyle kaybolmuştu). Gömülü SVG
// yüklenmeyi bekleyemez, kırılamaz ve tek bir istek bile atmaz.
//
// ⚠️ MARKA RENKLERİ GERÇEK: X siyah, Telegram mavi. Oyunun paletine
// çevirmek cazipti ama bir marka ikonu tanınabilirliğini renginden alıyor;
// kemik rengine boyanmış bir X, X gibi görünmez. Paletin dışına çıkan tek
// yer burası ve bilerek öyle.
// ⚠️ MOR YOK — depo kuralı; iki markanın da paletinde mor yok, sorun çıkmıyor.
//
// ⚠️ HACİM (3B his) GRADYAN + İÇ IŞIK + GÖLGE ile veriliyor, `filter` ya da
// 3B kitaplıkla değil. Köyün üstünde her karede çizilen bir yüzeydeyiz;
// buraya pahalı bir efekt koymak koşu bütçesinden çalardı.

const BAGLANTILAR = [
  {
    ad: 'X',
    url: 'https://x.com/playgraveborn',
    // ⚠️ Adresler tek tek yoklandı (2026-09-07, ikisi de 200 döndü).
    // Çalışmayan bağlantı koymak ziyaretçiyi boşa tıklatmaktır.
    ust: '#4a4a4a', alt: '#0a0a0a', kenar: 'rgba(255,255,255,0.30)',
    yol: 'M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L5.9 22H2.8l7.5-8.6L2.4 2h6.6l4.5 6.6L18.9 2Zm-1.1 18.1h1.7L7.3 3.8H5.5l12.3 16.3Z',
    olcek: 24,
  },
  {
    ad: 'Telegram',
    url: 'https://t.me/playgraveborn',
    ust: '#4db8e8', alt: '#1279b3', kenar: 'rgba(255,255,255,0.45)',
    yol: 'M21.9 4.3 18.7 19c-.24 1.06-.87 1.32-1.77.82l-4.9-3.6-2.36 2.27c-.26.26-.48.48-.99.48l.35-5 9.1-8.22c.4-.35-.09-.55-.61-.2L6.3 12.63l-4.84-1.5c-1.05-.33-1.07-1.05.22-1.56l18.9-7.3c.88-.32 1.65.2 1.32 2.03Z',
    olcek: 24,
  },
] as const;

/**
 * ⚠️ BU BİLEŞEN KÖYÜN CANLI GÖRÜNTÜSÜ ÜSTÜNDE duruyor → yüzey dili Katman 1
 * (bkz. lib/theme.ts), kural `fx.test [G]` ile mühürlü. O yüzden burada
 * `glass()` YOK: ikonlar kendi gölgeleriyle duruyor, arkadaki dünyayı
 * kapatan bir kutu çizilmiyor.
 *
 * @param boyut kenar uzunluğu (px). Navbar'da küçük (26), ana sayfada daha
 *   büyük (32) — navbar'ın her pikseli minimap ile yarışıyor (ölçüldü:
 *   375 px'de çubuk 302 px).
 */
export function SocialLinks({ boyut = 32 }: { boyut?: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      {BAGLANTILAR.map((b) => (
        <a
          key={b.ad}
          href={b.url}
          target="_blank"
          rel="noreferrer noopener"
          // ⚠️ Oyuncuya giden metin İngilizce (depo kuralı) — ikonun tek
          // metni bu ve ekran okuyucu ile ipucu balonu ikisi de bunu okur.
          aria-label={`GRAVEBORN on ${b.ad}`}
          title={`GRAVEBORN on ${b.ad}`}
          style={{
            width: boyut, height: boyut, borderRadius: Math.round(boyut * 0.26),
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            /**
             * HACİM: üstten alta gradyan (ışık yukarıdan gelir) + içeriden
             * ince bir üst ışık + dışarıda yumuşak gölge. Üçü birlikte düz
             * bir dikdörtgeni kabartma hâline getiriyor.
             */
            background: `linear-gradient(165deg, ${b.ust} 0%, ${b.alt} 78%)`,
            border: `1px solid ${b.kenar}`,
            boxShadow: [
              'inset 0 1px 0 rgba(255,255,255,0.42)',   // üst kenar ışığı
              'inset 0 -2px 4px rgba(0,0,0,0.45)',      // alt iç gölge (derinlik)
              '0 3px 7px rgba(0,0,0,0.55)',             // zemine düşen gölge
            ].join(', '),
            // ⚠️ Piksel oyunda bile ikon KESKİN olmalı: SVG vektör, canvas
            // ölçeklemesinden etkilenmiyor.
            cursor: 'pointer',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <svg width={Math.round(boyut * 0.58)} height={Math.round(boyut * 0.58)} viewBox="0 0 24 24" aria-hidden="true">
            {/* Glif beyaz + hafif gölge: kabartma hissini ikonun kendisi de taşısın */}
            <path d={b.yol} fill="#ffffff" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.55))' }} />
          </svg>
        </a>
      ))}
    </div>
  );
}
