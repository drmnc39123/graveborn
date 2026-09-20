'use client';
// KART ÇEKMECESİ — telefonda sağ kolon kartları sağ kenardan açılan pencerede.
//
// 🔴 KULLANICI İSTEĞİ (2026-09-18): *"sağda küçük bir ikon olacak, ona
// tıklayınca sola doğru açılan bir pencere; tekrar tıklayınca sağa doğru
// kapanacak."* Önceki deneme (yan yana kaydırmalı şerit) İSTENMEDİ —
// geri dönme. Ölçüldü (375x560 Phantom): üç kart alt alta ~480 px, köyün
// sağ yarısını kapatıyordu. Kapalı hâlde yalnız 36 px'lik bir sekme kalıyor.
//
// ⚠️ SEKME ÇEKMECEYLE BİRLİKTE KAYIYOR: ikisi aynı kabın içinde, kap
// `translateX` ile kayıyor. Sekme hep çekmecenin sol kenarında durduğu
// için oyuncu kapatmak için aynı yere, aynı düğmeye dokunuyor.
//
// ⚠️ `useMotionOff` — hareket kapalıysa geçiş anında olur (graphics.test).

import { useState } from 'react';
import { C, FONT, thinGlass } from '@/lib/theme';
import { useMotionOff } from '@/components/ui/motion';

/** Sekme genişliği — dokunma hedefi (BuildingDock `KONTROL_DOKUNMA` ≥ 32) */
export const CEKMECE_SEKME = 36;

/** Açık çekmecenin en az yüksekliği — altta yer yoksa panel yukarı kayar */
const EN_AZ_H = 180;

export function KartCekmece({ ust, genislik, ekranH, nokta = false, children }: {
  /** Ekran üstünden px — sağ kolonun kalan kısmının başladığı yer */
  ust: number;
  /** Açıkken çekmecenin genişliği */
  genislik: number;
  /** Görünür ekran yüksekliği — panel ekranın altına taşmasın */
  ekranH: number;
  /**
   * İçeride ZAMANA BAĞLI bir şey var mı (bkz. `useBossVurulmadi`).
   * ⚠️ Kapalı çekmece bilgi saklamamalı: haftalık boss kaçırılırsa bir daha
   * o boss gelmiyor. Nokta yalnız YAPILABİLİR iş için yanıyor ve iş bitince
   * sönüyor — sürekli yanan bir süs, rozetlerin tamamını değersizleştirir.
   */
  nokta?: boolean;
  children: React.ReactNode;
}) {
  const [acik, setAcik] = useState(false);
  const hareketYok = useMotionOff();
  /**
   * 🔴 ÖLÇÜLDÜ (780x340 yatay): sekme ekranın altına yakın kalıyor, panel
   * aşağı açılınca ekrandan taşıyordu. Sekme yerinde kalır; altta EN_AZ_H
   * kadar yer yoksa yalnız PANEL yukarı kayar (açıkken üstteki kartların
   * üstüne biner — açık çekmece zaten bir kaplama).
   */
  const kayma = Math.min(0, ekranH - 12 - EN_AZ_H - ust);
  const maxH = Math.max(120, ekranH - 12 - (ust + kayma));

  return (
    <div style={{
      position: 'absolute', zIndex: 6, top: ust, right: 0,
      display: 'flex', alignItems: 'flex-start',
      // Kapalı: çekmece ekranın sağ dışında, yalnız sekme görünür
      transform: acik ? 'translateX(0)' : `translateX(${genislik}px)`,
      transition: hareketYok ? 'none' : 'transform 220ms ease-out',
      pointerEvents: 'none',
    }}>
      <button
        onClick={() => setAcik((v) => !v)}
        aria-label={acik ? 'Hide event cards' : 'Show event cards'}
        aria-expanded={acik}
        style={{
          all: 'unset', boxSizing: 'border-box', cursor: 'pointer', pointerEvents: 'auto',
          position: 'relative',
          width: CEKMECE_SEKME, height: 44, marginTop: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...thinGlass(0, 0.85),
          borderRadius: '10px 0 0 10px',
          border: `1px solid ${acik ? C.candle : C.border}`,
          fontFamily: FONT.ui, fontSize: 20, fontWeight: 900,
          color: acik ? C.candle : C.bone,
        }}>
        {acik ? '›' : '‹'}
        {/* ⚠️ Yalnız KAPALIYKEN: açıkken içerik zaten görünüyor */}
        {nokta && !acik && (
          <span aria-hidden style={{
            position: 'absolute', top: -3, left: -3, width: 9, height: 9,
            borderRadius: 9, background: C.candle,
            boxShadow: `0 0 0 2px rgba(10,8,6,0.9), 0 0 8px ${C.candle}`,
          }} />
        )}
      </button>
      <div style={{
        boxSizing: 'border-box', width: genislik, maxHeight: maxH, marginTop: kayma,
        overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin',
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: 8, pointerEvents: acik ? 'auto' : 'none',
        ...thinGlass(0, 0.55),
        borderRadius: '0 0 0 12px',
        // Kapalıyken ekran dışında — ekran okuyucu da görmesin
        visibility: acik ? 'visible' : 'hidden',
        transition: hareketYok ? 'none' : `visibility 0s linear ${acik ? '0s' : '220ms'}`,
      }}>
        {children}
      </div>
    </div>
  );
}
