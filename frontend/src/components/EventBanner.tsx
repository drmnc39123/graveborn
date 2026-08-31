'use client';
// HAFTA SONU ETKİNLİĞİ — köyün SAĞ KOLONUNDA, açılır kapanır kart.
//
// ── İKİNCİ SÜRÜM: şeritten karta ──
// İlk hâli navbarın altında yatay bir şeritti (max 520 px) ve sahnenin
// üst-orta bandını kesiyordu — köyün en çok bakılan yeri tek satırlık bir
// bilgiye harcanıyordu. Kullanıcı kararı: kart minimap'in ALTINA, sağ
// kolona taşındı ve açılır kapanır hâle getirildi.
//
// ⚠️ KAPALI HÂL BİR ÖZET, KISALTILMIŞ CÜMLE DEĞİL. Dar sütunda açıklamayı
// tek satıra sıkıştırıp "…" ile kesmek, bilgiyi hiç yazmamakla aynı şey
// olurdu — şeritte tam da bu oluyordu: "Every wound you open on this
// week's horror counts twice on the damage b…". Kapalıyken ad, durum ve
// süre var; NE YAPTIĞINI okumak isteyen açıyor.
//
// ⚠️ SAAT SUNUCUDAN. `api('/events')` hem pencereyi hem sunucunun "şimdi"sini
// veriyor; geri sayım cihazın saatinden değil, o farktan yürüyor. Ödemeyi
// yapan saat hangisiyse, gösteren saat de o olmalı — yoksa saati kaymış bir
// telefonda "Ashfall açık" yazarken sunucu bonusu ödemez ve oyuncu haklı
// olarak dolandırıldığını düşünür.
//
// ⚠️ KAPALI PENCERE DE GÖSTERİLİYOR ("in 4d 14h"). Geri çağırma aracının
// yarısı bu: geçmiş bir sebebi göstermek kimseyi geri getirmez, GELECEK
// bir sebep getirir.
//
// ⚠️ HATA SESSİZ. Uç düşerse kart hiç çizilmiyor. Köyün üstünde kırmızı bir
// "etkinlik yüklenemedi" kutusu, hiçbir işe yaramayan bir endişe üretirdi.

import { useEffect, useState } from 'react';
import { fetchEvent, type EventState } from '@/lib/gameSession';
import { Icon } from '@/components/ui/kit';
import type { IconName } from '@/lib/icons';
import { C, FONT, thinGlass } from '@/lib/theme';

// ⚠️ İKON `effect`TEN TÜRETİLİYOR, `EventDef`e alan EKLENMEDİ. Sebebi:
// etkinliğin ne yaptığını zaten `effect` söylüyor; ayrı bir `icon` alanı
// olsaydı ikisi zamanla ayrışır ve kart gold ikonuyla boss bonusu
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

export function EventBanner() {
  const [st, setSt] = useState<EventState | null>(null);
  // Sunucu saati ile cihaz saati arasındaki fark — bir kez ölçülüp sabit
  // kalıyor. Her saniye yeniden istek atmak, geri sayım için sunucuyu
  // dövmek olurdu.
  const [kayma, setKayma] = useState(0);
  const [tik, setTik] = useState(0);
  /**
   * ⚠️ VARSAYILAN KAPALI. Açık başlasaydı kart minimap'in altında üç satır
   * yer kaplar ve köy sahnesini sürekli örterdi; etkinlik haftada bir
   * değişen bir haber, sürekli açık durması gereken bir pano değil.
   */
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    let iptal = false;
    fetchEvent()
      .then((e) => { if (!iptal) { setSt(e); setKayma(e.now - Date.now()); } })
      .catch(() => { /* sessiz — bkz. dosya başlığı */ });
    return () => { iptal = true; };
  }, []);

  // Dakikada bir yeniden çiz — saniye saymaya değmez, kart bir kronometre değil
  useEffect(() => {
    const t = setInterval(() => setTik((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  void tik;

  if (!st) return null;

  const simdi = Date.now() + kayma;
  const canli = st.live && simdi < st.endsAt;
  const ton = st.event.tone;
  const sure = canli ? `${kalan(st.endsAt - simdi)} left` : `in ${kalan(st.startsAt - simdi)}`;

  return (
    <button
      onClick={() => setAcik((v) => !v)}
      aria-expanded={acik}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        display: 'block',
        width: '100%',
        padding: '7px 9px',
        fontFamily: FONT.ui,
        /**
         * ⚠️ ALFA ÖLÇÜLEREK SEÇİLDİ, göz kararı değil. En kötü zemin açık
         * taş yol (168,166,158); ikincil satırın (`boneDim`) kontrastı:
         *   eski zemin (rgba(0,0,0,0.28), blur YOK) → 1,02  ← okunamaz
         *   0,58 → 3,19 · 0,66 → 3,77 · **0,80 → 5,04** · 0,90 → 6,13
         * 0,80 seçildi: küçük metin için 4,5 eşiğini rahat geçiyor ve
         * arkadaki dünya hâlâ seçiliyor. Düşürülecekse önce bu satır ölçülsün.
         * ⚠️ Kart sağ kolona taşınırken bu karar KORUNDU — zemin hâlâ köy.
         */
        ...thinGlass(9, 0.80),
        border: `1px solid ${canli ? `${ton}88` : C.border}`,
        // ⚠️ Etkinlik rengi cam zeminin ÜSTÜNE ikinci katman olarak biniyor;
        // zemini onunla değiştirmek okunaklılığı geri götürürdü.
        background: canli
          ? `linear-gradient(90deg, ${ton}2e, rgba(0,0,0,0) 70%),`
            + ' linear-gradient(180deg, rgba(43,31,22,0.80), rgba(10,8,6,0.88))'
          : 'linear-gradient(180deg, rgba(43,31,22,0.80), rgba(10,8,6,0.88))',
        boxShadow: '0 3px 10px rgba(0,0,0,0.45)',
      }}
    >
      {/* ── ÜST SATIR: durum · süre · açılış oku ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* ⚠️ Canlı/yaklaşan ayrımı RENKTEN ÖNCE METİNLE veriliyor: rengi tek
            başına okumak, renk körü bir oyuncu için hiçbir şey söylemez. */}
        <Icon name={ETKI_IKON[st.event.effect] ?? 'star'} scale={1}
          dim={!canli} style={{ flexShrink: 0 }} />
        <span style={{
          flexShrink: 0, fontSize: 8.5, fontWeight: 900, letterSpacing: 1.2,
          padding: '2px 6px', borderRadius: 5,
          color: canli ? '#1a0508' : C.boneFaint,
          background: canli ? ton : 'rgba(255,255,255,0.07)',
        }}>
          {canli ? 'LIVE' : 'SOON'}
        </span>
        <span style={{
          marginLeft: 'auto', flexShrink: 0, fontSize: 10,
          fontWeight: 900, color: canli ? ton : C.boneFaint,
        }}>
          {sure}
        </span>
        {/* ⚠️ OK, "burada okunacak bir şey daha var" demenin en ucuz yolu.
            Olmasaydı kart tıklanabilir görünmezdi ve açıklama — etkinliğin
            TEK anlamlı bilgisi — hiç okunmazdı. */}
        <span style={{
          flexShrink: 0, fontSize: 9, color: C.boneFaint, lineHeight: 1,
          transform: acik ? 'rotate(180deg)' : 'none',
        }}>▾</span>
      </div>

      {/* ── AD + ÇARPAN ── */}
      <div style={{
        marginTop: 3, fontSize: 12, fontWeight: 900,
        color: canli ? C.bone : C.boneDim,
        // ⚠️ Kapalıyken tek satır: dar sütunda uzun ad kartı büyütmesin.
        // Açıkken sarılıyor — tam adı görmek isteyen zaten açmış oluyor.
        ...(acik ? {} : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
      }}>
        {st.event.name}
        <span style={{ color: ton, marginLeft: 6, fontSize: 10.5 }}>×{st.event.mul}</span>
      </div>

      {/* ── AÇIKLAMA — SADECE AÇIKKEN VE TAM ──
          ⚠️ KISALTILMIYOR. Şeritte tek satıra sıkışıp "…" ile kesiliyordu ve
          etkinliğin ne yaptığı hiç okunmuyordu. Bir cümlenin yarısı bilgi
          değil, gürültüdür. */}
      {acik && (
        <div style={{ marginTop: 5, fontSize: 10.5, color: C.boneDim, lineHeight: 1.45 }}>
          {st.event.blurb}
        </div>
      )}
    </button>
  );
}
