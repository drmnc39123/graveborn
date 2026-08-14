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
import { Icon } from '@/components/ui/kit';
import type { IconName } from '@/lib/icons';
import { C, FONT, thinGlass } from '@/lib/theme';

// ⚠️ İKON `effect`TEN TÜRETİLİYOR, `EventDef`e alan EKLENMEDİ. Sebebi:
// etkinliğin ne yaptığını zaten `effect` söylüyor; ayrı bir `icon` alanı
// olsaydı ikisi zamanla ayrışır ve şerit gold ikonuyla boss bonusu
// duyurabilirdi. Türetilmiş olan yalan söyleyemez.
const ETKI_IKON: Record<string, IconName> = {
  dropGold: 'gold',
  bossDamage: 'skull',
  questDust: 'gem',
};

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
        /**
         * ⚠️ `thinGlass` — köyün üstünde duran TEK yüzey buydu, onu
         * KULLANMIYORDU. Sade bir yarı saydam degrade yazılmıştı,
         * `backdrop-filter` YOK: parlak çimenin ve taş yolun üstünde şerit
         * eriyip kayboluyordu (kullanıcı "aşırı şeffaf, hiç gözükmüyor"
         * dedi ve haklıydı). Navbar, sohbet kutusu ve profil kartı zaten
         * bu yüzeyi kullanıyor; şerit sistemin dışında kalmıştı.
         */
        /**
         * ⚠️ ALFA ÖLÇÜLEREK SEÇİLDİ, göz kararı değil. En kötü zemin açık
         * taş yol (168,166,158); ikincil satırın (`boneDim`) kontrastı:
         *   eski zemin (rgba(0,0,0,0.28), blur YOK) → 1,02  ← okunamaz
         *   0,58 → 3,19 · 0,66 → 3,77 · **0,80 → 5,04** · 0,90 → 6,13
         * 0,80 seçildi: küçük metin için 4,5 eşiğini rahat geçiyor ve
         * arkadaki dünya hâlâ seçiliyor. Düşürülecekse önce bu satır ölçülsün.
         */
        ...thinGlass(9, 0.80),
        border: `1px solid ${canli ? `${ton}88` : C.border}`,
        // ⚠️ Etkinlik rengi cam zeminin ÜSTÜNE ikinci katman olarak biniyor;
        // zemini onunla değiştirmek okunaklılığı geri götürürdü.
        background: canli
          ? `linear-gradient(90deg, ${ton}2e, rgba(0,0,0,0) 70%),`
            + ' linear-gradient(180deg, rgba(43,31,22,0.80), rgba(10,8,6,0.88))'
          : 'linear-gradient(180deg, rgba(43,31,22,0.80), rgba(10,8,6,0.88))',
        // Karanlık bir plaka olarak otursun — köyle sınırı belli olsun
        boxShadow: '0 3px 10px rgba(0,0,0,0.45)',
      }}
    >
      {/* ⚠️ Canlı/yaklaşan ayrımı RENKTEN ÖNCE METİNLE veriliyor: rengi tek
          başına okumak, renk körü bir oyuncu için hiçbir şey söylemez. */}
      <Icon name={ETKI_IKON[st.event.effect] ?? 'star'} scale={1}
        dim={!canli} style={{ flexShrink: 0 }} />

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
          // ⚠️ `boneFaint` DEĞİL: 10,5 px'lik ikincil satır, cam zeminde bile
          // en soluk tonda okunmuyordu. Etkinliğin NE YAPTIĞINI söyleyen
          // satır bu — silik olması, bilgiyi hiç yazmamakla aynı şey.
          display: 'block', fontSize: 10.5, color: C.boneDim, lineHeight: 1.4,
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
