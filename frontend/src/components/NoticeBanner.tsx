'use client';
// SUNUCU DUYURUSU — bakım kapısı ve operatör mesajı.
//
// ⚠️ NİYE AYRI BİR ŞERİT: `EventBanner` hafta sonu etkinliğini anlatıyor,
// yani OYUNUN İÇİNDEN bir haber. Bu ise oyunun DIŞINDAN: "kapıyı kapattık",
// "şu saatte bakım var". İkisini tek bileşene sıkıştırmak, birini
// ayarlarken diğerini bozmak demekti — `glass`/`thinGlass` ayrımıyla aynı
// gerekçe.
//
// ⚠️ HATA SESSİZ. Uç düşerse şerit hiç çizilmiyor; köyün üstünde
// "duyuru alınamadı" kutusu hiçbir işe yaramayan bir endişe üretirdi
// (`EventBanner` emsali).
//
// ⚠️ BAKIM AÇIKKEN OYUNCU SEBEBİNİ GÖRMELİ. Yeni koşu 503 dönüyor; sebebi
// yazmayan bir hata mesajı oyuncuya "oyun bozuldu" dedirtir.

import { useEffect, useState } from 'react';
import { fetchFlags } from '@/lib/gameSession';
import { C, FONT, thinGlass } from '@/lib/theme';

export function NoticeBanner() {
  const [f, setF] = useState<{ maintenance: boolean; notice: string | null } | null>(null);

  useEffect(() => {
    let atildi = false;
    const oku = () => {
      fetchFlags()
        .then((v) => { if (!atildi) setF(v); })
        .catch(() => { /* sessiz — bkz. başlık */ });
    };
    oku();
    /**
     * ⚠️ 60 SANİYEDE BİR TEKRAR OKUNUYOR. Bakım oyuncu sayfadayken
     * AÇILABİLİR; tek sefer okusaydık o oyuncu kapının kapandığını hiç
     * görmez, yalnız koşu başlatmaya çalışınca çıplak bir hata alırdı.
     * ⚠️ `setInterval` bilerek: gizli sekmede `rAF` durur ama `setInterval`
     * çalışır (bu depoda ölçülmüş bir tuzak) — sekmeye dönen oyuncu güncel
     * durumu görsün.
     */
    const id = setInterval(oku, 60_000);
    return () => { atildi = true; clearInterval(id); };
  }, []);

  if (!f || (!f.maintenance && !f.notice)) return null;

  return (
    <div style={{
      ...thinGlass(9, 0.82),
      padding: '7px 12px', textAlign: 'center', fontFamily: FONT.ui,
      border: `1px solid ${f.maintenance ? 'rgba(160,18,38,0.5)' : C.border}`,
    }}>
      {f.maintenance && (
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, color: C.badText }}>
          MAINTENANCE — NO NEW RUNS
          {f.notice ? ' · ' : ''}
        </span>
      )}
      {f.notice && (
        <span style={{ fontSize: 11.5, color: C.boneDim }}>{f.notice}</span>
      )}
      {/* ⚠️ SÜREN KOŞUNUN ÖDENECEĞİ AÇIKÇA YAZILI: oyuncu bakım yazısını
          görünce oynadığı koşunun çöpe gideceğini sanıp bırakabilir. */}
      {f.maintenance && (
        <div style={{ fontSize: 10.5, color: C.boneFaint, marginTop: 2 }}>
          A run already in progress still finishes and still pays.
        </div>
      )}
    </div>
  );
}
