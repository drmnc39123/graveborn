'use client';
// GRAFİK KADEMESİ SEÇİCİ — köy ayarları VE koşu içi katman, aynı bileşen.
//
// 🔴 TEK BİLEŞEN, İKİ ÇAĞIRAN — VE BU PAZARLIKSIZ. Kullanıcı kademeyi hem
// köydeki ayarlar panelinden hem de koşunun içinden değiştirebilecek. İki
// ayrı liste yazmak, bu depoda tekrar eden en pahalı hata: aynı kural iki
// yere yazılınca ayrışıyor. (`lib/stick.ts` zaten tam bu yüzden var.)
//
// ⚠️ DÜRÜST ETİKET: `devicePixelRatio` 2'nin altındaysa HD ve ULTRA o
// ekranda HİÇBİR ŞEY yapmıyor — çünkü tek farkları `pixelCap` ve ekran
// zaten o kadar piksel istemiyor. Bunu yazmazsak "ULTRA seçtim, hiçbir şey
// değişmedi" şikâyeti gelir ve haklı olur. Ayarların güvenilirliği,
// tutulamayan tek bir vaatle biter.
//
// ⚠️ Tüm stiller INLINE (Tailwind arbitrary değerleri cüzdan içi
// tarayıcıda çalışmıyor) · MOR YOK · oyuncu metni İngilizce.

import { useEffect, useState } from 'react';
import { QUALITY_PROFILES, type QualityTier } from '@/game/quality';
import { C, FONT } from '@/lib/theme';

/**
 * BU KADEME BİR ÖNCEKİNDEN YALNIZ ÇÖZÜNÜRLÜKLE Mİ AYRILIYOR?
 *
 * 🔴 İLK SÜRÜM `pixelCap > 2` DİYORDU VE YANLIŞTI: ULTRA'nın `pixelCap`i
 * yüksek AMA sisi ve dekoru da farklı (fog 1,35 · decor 1,25). Yani düşük
 * yoğunluklu bir ekranda "No effect" yazmak ULTRA için YALAN olurdu —
 * çözünürlük değişmez ama atmosfer değişir.
 *
 * Doğru soru "cap kaç?" değil: "bu kademe bir öncekinden BAŞKA hiçbir
 * şeyde ayrılmıyor mu?" Alanlar tek tek karşılaştırılıyor, böylece
 * tabloya yarın eklenecek bir kol da kendiliğinden hesaba giriyor.
 */
function yalnizCozunurluk(i: number): boolean {
  if (i === 0) return false;
  const a = QUALITY_PROFILES[i - 1];
  const b = QUALITY_PROFILES[i];
  return (Object.keys(b) as (keyof typeof b)[]).every((k) =>
    k === 'tier' || k === 'label' || k === 'note'
    || k === 'pixelCap' || k === 'renderScale'
    || a[k] === b[k]);
}

export function QualityPicker({ value, onChange, compact = false }: {
  value: QualityTier;
  onChange: (t: QualityTier) => void;
  /** koşu içi katmanda daha dar — açıklama satırları kısalır */
  compact?: boolean;
}) {
  /**
   * ⚠️ `devicePixelRatio` RENDER SIRASINDA OKUNMAZ. Sunucuda yok ve ilk
   * istemci render'ında okumak hidrasyon uyuşmazlığı üretiyor — bu depoda
   * `motion.tsx`te ölçülmüş, kayda geçmiş bir tuzak. Bağlandıktan sonra.
   */
  const [dpr, setDpr] = useState(0);
  useEffect(() => { setDpr(window.devicePixelRatio || 1); }, []);

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {QUALITY_PROFILES.map((p, i) => {
        const secili = p.tier === value;
        const etkisiz = dpr > 0 && yalnizCozunurluk(i) && dpr <= QUALITY_PROFILES[i - 1].pixelCap;
        return (
          <button
            key={p.tier}
            onClick={() => onChange(p.tier)}
            aria-pressed={secili}
            style={{
              all: 'unset',
              display: 'block', boxSizing: 'border-box', width: '100%',
              cursor: 'pointer', padding: compact ? '5px 8px' : '7px 10px',
              borderRadius: 6,
              border: `1px solid ${secili ? C.candle : 'rgba(227,216,192,0.14)'}`,
              background: secili ? 'rgba(239,167,46,0.13)' : 'rgba(10,8,6,0.35)',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              fontFamily: FONT.ui, fontSize: compact ? 10 : 11, fontWeight: 900,
              letterSpacing: 0.7, color: secili ? C.candle : C.bone,
            }}>
              <span>{p.label}</span>
              {/* ⚠️ Seçili olanı yalnız renkle göstermek yetmez: renk körlüğü
                  ve düşük kontrastlı ekranlar var. Metin de söylüyor. */}
              {secili && <span style={{ fontSize: 8.5, color: C.candle }}>ON</span>}
            </div>
            <div style={{
              marginTop: 2, fontFamily: FONT.ui, fontSize: compact ? 8.5 : 9.5,
              lineHeight: 1.4, color: C.boneFaint,
            }}>
              {etkisiz ? 'No effect on this display.' : p.note}
            </div>
          </button>
        );
      })}
    </div>
  );
}
