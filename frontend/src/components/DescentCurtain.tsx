'use client';
// İNİŞ PERDESİ — köyden koşuya geçişin dikişi.
//
// 🔴 NİYE VAR: köy → koşu SERT KESMEYDİ. `play/page.tsx` `screen.kind`
// değişince doğrudan `<GameCanvas>` döndürüyordu; tek hareket kökteki
// 180 ms'lik beliriş animasyonuydu. Oyunun adı GRAVEBORN ve yaptığın şey
// yeraltına inmek — o an oyunun en sık tekrarlanan anı ve hiçbir karşılığı
// yoktu.
//
// ⚠️ BU PERDE OYUNA BEKLEME EKLEMİYOR ve bu ayrım kritik. `play/page.tsx`te
// yazılı bir kural var:
//   *"180 ms'İ GEÇMEMELİ… oyuncu bir oturumda onlarca kez koşuya giriyor;
//     uzun geçiş her seferinde bekleme demek. Geçiş bir gösteri değil,
//     bir dikiş."*
// Kural doğru ve korunuyor. Perde YENİ süre eklemiyor: `beginStage`
// zaten `startRun` ile SUNUCUYA GİDİYOR ve bilet dönene kadar oyuncu
// donmuş bir köye bakıyordu — biçimlendirilmemiş ölü zaman. Perde tam o
// aralığı örtüyor. Ağ hızlıysa asgari süre (`ASGARI_MS`) devreye giriyor ki
// perde göz kırpması gibi çakmasın; yavaşsa zaten beklenecek olan süre
// artık bir şey ANLATIYOR.
//
// ⚠️ ATLAMA DÜĞMESİ YOK ve bilerek. Perde bir gösteriyi değil GERÇEK BİR
// İŞİ örtüyor; "atla" oyuncuyu henüz var olmayan bir koşunun içine
// bırakırdı. Atlanabilir olması gereken şey gösteridir, yükleme değil.
//
// ⚠️ `motionOff()` AÇIKKEN PERDE YİNE ÇİZİLİYOR — yalnız hareketsiz.
// İlk yazımda tamamen kaldırılmıştı ve bu deponun kendi kuralını çiğniyordu
// (`ui/motion.tsx`): *"Kapalıyken BİLGİ KAYBOLMAZ, yalnız hareket kalkar."*
// Perdenin taşıdığı bilgi — "şu an bir şey yükleniyor ve gideceğin yer bu" —
// hareketten bağımsız ve tam da hareket kapatan oyuncunun kaybetmemesi
// gereken şey. Kapalıyken: beliriş/kalkış animasyonu yok, düşen toz yok,
// metin anında görünür.

import { useEffect, useState } from 'react';
import { motionOff } from '@/components/ui/motion';
import { C, FONT } from '@/lib/theme';

/** Perdenin asgari görünme süresi — ağ hızlıysa çakmasın */
export const PERDE_ASGARI_MS = 520;
/** Kalkış süresi */
export const PERDE_KALKIS_MS = 260;

export interface PerdeDurumu {
  /** üst satır — ne yapıyorsun (DESCENDING · ENTERING · ANSWERING) */
  kicker: string;
  /** büyük satır — nereye (bölüm adı, rakip) */
  hedef: string;
  /** alt satır — isteğe bağlı ayrıntı (derinlik, bahis) */
  alt?: string;
  /** true → perde kalkıyor */
  kalkiyor?: boolean;
}

const KEYFRAMES = `
@keyframes gb-perde-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes gb-perde-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes gb-perde-yazi {
  0% { opacity: 0; transform: translateY(-10px); }
  100% { opacity: 1; transform: translateY(0); }
}
/* ⚠️ Çizgi AŞAĞI doğru büyüyor — inişin yönü. Yukarı büyüseydi hareket
   anlatılan şeyin tersini söylerdi. */
@keyframes gb-perde-cizgi { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes gb-perde-toz {
  0% { opacity: 0; transform: translateY(-14px); }
  30% { opacity: 0.55; }
  100% { opacity: 0; transform: translateY(26px); }
}
`;

/**
 * Düşen toz zerreleri — inişin tek hareketli öğesi.
 *
 * ⚠️ SABİT KONUMLU, rastgele DEĞİL. `Math.random()` bu depoda `game/`
 * içinde yasak; burası `components/` ama kural aynı sebeple burada da
 * uygulanıyor: rastgele konum her açılışta farklı bir düzen üretir ve
 * hydration'da sunucu/istemci farkı doğurur (bu sayfada tam olarak o
 * uyarı zaten alınıyor). Sabit liste hem deterministik hem yeterli.
 */
const TOZ: readonly { x: number; gecikme: number; sure: number }[] = [
  { x: 12, gecikme: 0, sure: 1500 }, { x: 27, gecikme: 380, sure: 1900 },
  { x: 41, gecikme: 140, sure: 1700 }, { x: 58, gecikme: 620, sure: 1600 },
  { x: 73, gecikme: 240, sure: 2000 }, { x: 88, gecikme: 500, sure: 1750 },
];

export function DescentCurtain({ durum }: { durum: PerdeDurumu | null }) {
  const kapali = motionOff();
  // ⚠️ Perde DOM'dan hemen silinmiyor: kalkış animasyonu oynasın diye
  // `kalkiyor` bayrağıyla bir süre daha duruyor. Çağıran taraf zamanlamayı
  // yönetiyor (bkz. `play/page.tsx` perdeliBaslat).
  const [gorunur, setGorunur] = useState(false);
  useEffect(() => { setGorunur(!!durum); }, [durum]);

  if (!durum) return null;
  void gorunur;

  const kalkiyor = !!durum.kalkiyor;
  /** Hareket kapalıyken animasyon adı yerine `undefined` — bkz. dosya başlığı */
  const anim = (a: string) => (kapali ? undefined : a);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // ⚠️ Tam siyah DEĞİL, paletin dip rengi. Saf siyah bu paletin hiçbir
        // yerinde yok ve perdenin ardından açılan sahne onun üstüne geliyor.
        background: `radial-gradient(circle at 50% 42%, rgba(24,17,12,0.97), ${C.void} 78%)`,
        // ⚠️ Kapalıyken kalkış animasyonu da yok; perde `null` olunca
        // anında kayboluyor. Zamanlama çağıranda, o değişmiyor.
        animation: anim(kalkiyor
          ? `gb-perde-out ${PERDE_KALKIS_MS}ms ease-in both`
          : 'gb-perde-in 190ms ease-out both'),
        opacity: kapali && kalkiyor ? 0 : 1,
        pointerEvents: 'none',
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* ── DÜŞEN TOZ ── ⚠️ Hareket kapalıyken HİÇ çizilmiyor: tozun
          taşıdığı bilgi yok, tamamen dekor. */}
      {!kapali && TOZ.map((t, i) => (
        <span key={i} style={{
          position: 'absolute', top: '30%', left: `${t.x}%`,
          width: 2, height: 2, borderRadius: 1, background: C.boneFaint,
          animation: `gb-perde-toz ${t.sure}ms ease-in ${t.gecikme}ms infinite`,
        }} />
      ))}

      <div style={{ textAlign: 'center', padding: '0 20px', maxWidth: 520 }}>
        {/* ⚠️ KICKER ÖNCE VE KÜÇÜK: "ne yapıyorum" sorusu "nereye" sorusundan
            önce cevaplanmalı — oyuncu düelloya mı girdi, inişe mi, kampanyaya
            mı, bunu tek bakışta ayırt etmeli. */}
        <div style={{
          fontFamily: FONT.ui, fontSize: 10.5, fontWeight: 700, letterSpacing: 3.4,
          color: C.blood, marginBottom: 10,
          animation: anim('gb-perde-yazi 320ms ease-out both'),
        }}>
          {durum.kicker}
        </div>

        <div style={{
          fontFamily: FONT.title, fontSize: 30, fontWeight: 700, letterSpacing: 1.2,
          color: C.bone, lineHeight: 1.15,
          animation: anim('gb-perde-yazi 380ms ease-out 60ms both'),
        }}>
          {durum.hedef}
        </div>

        {/* İnen çizgi — perdenin tek "iniyorum" jesti */}
        <div style={{
          width: 1, height: 34, margin: '14px auto 0',
          background: `linear-gradient(180deg, ${C.candle}, rgba(239,167,46,0))`,
          transformOrigin: 'top',
          animation: anim('gb-perde-cizgi 520ms ease-out 120ms both'),
        }} />

        {durum.alt && (
          <div style={{
            fontFamily: FONT.ui, fontSize: 11.5, color: C.boneDim, marginTop: 12,
            animation: anim('gb-perde-yazi 380ms ease-out 220ms both'),
          }}>
            {durum.alt}
          </div>
        )}
      </div>
    </div>
  );
}
