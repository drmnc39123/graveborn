'use client';
// HAFTA SONU ETKİNLİĞİ ŞERİDİ — köyün üstünde tek satır.
//
// ⚠️ SAAT SUNUCUDAN. `api('/events')` hem pencereyi hem sunucunun "şimdi"sini
// veriyor; geri sayım cihazın saatinden değil, o farktan yürüyor. Ödemeyi
// yapan saat hangisiyse, gösteren saat de o olmalı — yoksa saati kaymış bir
// telefonda "Ashfall açık" yazarken sunucu bonusu ödemez ve oyuncu haklı
// olarak dolandırıldığını düşünür.
//
// ⚠️ KAPALI PENCERE DE GÖSTERİLİYOR ("starts Saturday"). Geri çağırma
// aracının yarısı bu: geçmiş bir sebebi göstermek kimseyi geri getirmez,
// GELECEK bir sebep getirir.
//
// ⚠️ HATA SESSİZ. Uç düşerse şerit hiç çizilmiyor. Köyün üstünde kırmızı bir
// "etkinlik yüklenemedi" kutusu, hiçbir işe yaramayan bir endişe üretirdi.

import { useEffect, useState } from 'react';
import { fetchEvent, type EventState } from '@/lib/gameSession';
import { C, FONT } from '@/lib/theme';

/** "2g 4s" / "6s 12d" / "9d" — kaba ama okunur */
function kalan(ms: number): string {
  const sn = Math.max(0, Math.floor(ms / 1000));
  const g = Math.floor(sn / 86400);
  const s = Math.floor((sn % 86400) / 3600);
  const d = Math.floor((sn % 3600) / 60);
  if (g > 0) return `${g}d ${s}h`;
  if (s > 0) return `${s}h ${d}m`;
  return `${d}m`;
}

export function EventBanner({ onOpen }: { onOpen?: () => void }) {
  const [st, setSt] = useState<EventState | null>(null);
  // Sunucu saati ile cihaz saati arasındaki fark — bir kez ölçülüp sabit
  // kalıyor. Her saniye yeniden istek atmak, geri sayım için sunucuyu
  // dövmek olurdu.
  const [kayma, setKayma] = useState(0);
  const [tik, setTik] = useState(0);

  useEffect(() => {
    let iptal = false;
    fetchEvent()
      .then((e) => { if (!iptal) { setSt(e); setKayma(e.now - Date.now()); } })
      .catch(() => { /* sessiz — bkz. dosya başlığı */ });
    return () => { iptal = true; };
  }, []);

  // Dakikada bir yeniden çiz — saniye saymaya değmez, şerit bir kronometre değil
  useEffect(() => {
    const t = setInterval(() => setTik((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  void tik;

  if (!st) return null;

  const simdi = Date.now() + kayma;
  const canli = st.live && simdi < st.endsAt;
  const ton = st.event.tone;

  return (
    <button
      onClick={onOpen}
      style={{
        all: 'unset',
        cursor: onOpen ? 'pointer' : 'default',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        // ⚠️ Rıhtımın sütunu ortalıyor ama GENİŞLİĞİ en geniş çocuğundan
        // alıyor: sınır konmasaydı şerit geniş ekranda 1900 px'lik bir bant
        // olurdu ve tek satırlık bir bilgi ekranı ikiye bölerdi.
        width: '100%',
        maxWidth: 520,
        padding: '7px 12px',
        fontFamily: FONT.ui,
        borderRadius: 9,
        border: `1px solid ${canli ? `${ton}77` : 'rgba(255,255,255,0.10)'}`,
        background: canli
          ? `linear-gradient(90deg, ${ton}26, rgba(0,0,0,0.30) 62%)`
          : 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.28))',
      }}
    >
      {/* ⚠️ Canlı/yaklaşan ayrımı RENKTEN ÖNCE METİNLE veriliyor: rengi tek
          başına okumak, renk körü bir oyuncu için hiçbir şey söylemez. */}
      <span style={{
        flexShrink: 0, fontSize: 9, fontWeight: 900, letterSpacing: 1.4,
        padding: '3px 7px', borderRadius: 5,
        color: canli ? '#1a0508' : C.boneFaint,
        background: canli ? ton : 'rgba(255,255,255,0.07)',
      }}>
        {canli ? 'LIVE' : 'SOON'}
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 12.5, fontWeight: 900,
          color: canli ? C.bone : C.boneDim,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {st.event.name}
          <span style={{ color: ton, marginLeft: 7, fontSize: 11 }}>×{st.event.mul}</span>
        </span>
        <span style={{
          display: 'block', fontSize: 10.5, color: C.boneFaint, lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {st.event.blurb}
        </span>
      </span>

      <span style={{
        flexShrink: 0, fontSize: 10.5, fontWeight: 900,
        color: canli ? ton : C.boneFaint, textAlign: 'right',
      }}>
        {canli ? `${kalan(st.endsAt - simdi)} left` : `in ${kalan(st.startsAt - simdi)}`}
      </span>
    </button>
  );
}
