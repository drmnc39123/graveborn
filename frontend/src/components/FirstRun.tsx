'use client';
// İLK KOŞU ÇAĞRISI — yeni oyuncunun köyde kaybolmaması için.
//
// ⚠️ NİYE VAR: ÖLÇÜLDÜ. Sıfırdan bir oyuncu köye düşüyor ve karşısında
// 4 grup, 14 panel, 12 bina ve bir sohbet kutusu buluyor. Hiçbiri
// "önce şunu yap" demiyordu. Tutorial ancak koşunun İÇİNDE başlıyor —
// oysa oyuncuyu kaybettiğimiz yer koşuya GİRENE KADAR geçen kısım:
// FIGHT → STAGES → bölüm → mod → kahraman → GO, yani tek düşman görmeden
// beş karar.
//
// ⚠️ TEK DÜĞME, SIFIR KARAR. Kahraman da mod da SORULMUYOR: ilk koşuda
// oyuncunun bunlara verecek bir cevabı yok, sadece engel oluyorlar.
// Seçimler zaten koşudan sonra, ne olduklarını öğrenince duruyor.
//
// ⚠️ KOŞU BİTİNCE KENDİLİĞİNDEN KAYBOLUYOR — kalıcı bir "başlangıç
// rehberi" değil. Kapatılabiliyor da: ne yaptığını bilen oyuncuyu bir
// modal'ın arkasında tutmak, yeni oyuncuya yardım etmekten daha çok
// zarar verir.

import { useState } from 'react';
import { STAGES } from '@/game/config';
import type { Progress } from '@/game/progress';
import { PixelButton, BTN } from '@/components/ui/kit';
import { C, FONT, thinGlass } from '@/lib/theme';

/**
 * Oyuncu HİÇ koşu bitirdi mi.
 *
 * ⚠️ Ayrı bir "gördü mü" bayrağı TUTULMUYOR: ilerlemeden türeyen bir soru
 * için ikinci bir kaynak, senkron dışı kalabilecek ikinci bir gerçek olurdu.
 */
export function isNewcomer(p: Progress | null): boolean {
  if (!p) return false;
  const temizledi = Object.values(p.cleared ?? {}).some(Boolean);
  const indi = Object.values(p.depthPaid ?? {}).some((d) => (d ?? 0) > 0);
  return !temizledi && !indi;
}

export function FirstRun({ onBegin, onDismiss }: {
  onBegin: () => void;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const ilk = STAGES[0];

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 18, zIndex: 7,
      display: 'flex', justifyContent: 'center', padding: '0 16px',
      pointerEvents: 'none', fontFamily: FONT.ui,
    }}>
      <div style={{
        // ⚠️ Canvas üstünde → `thinGlass` (yüzey dili katman 1).
        // Alfa 0,82: bu kart yeni oyuncunun okuyacağı İLK metin, bu yüzden
        // etkinlik kartından bir tık daha kapalı — ama yine de arkasındaki
        // köyü gösteriyor, çünkü anlattığı şey tam olarak orası.
        ...thinGlass(14, 0.82), width: '100%', maxWidth: 440, padding: '16px 18px',
        pointerEvents: 'auto', textAlign: 'center',
        border: `1px solid ${C.blood}66`,
        boxShadow: `0 0 0 1px ${C.blood}22, 0 14px 40px rgba(0,0,0,0.55)`,
      }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2.4, color: C.blood }}>
          START HERE
        </div>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.bone, marginTop: 2 }}>
          {ilk.name}
        </div>
        {/* ⚠️ TEK CÜMLE. İlk ekranda paragraf okuyan yok; oyuncunun bilmesi
            gereken tek şey silahların kendiliğinden ateş ettiği. */}
        <div style={{ fontSize: 12, color: C.boneDim, lineHeight: 1.55, margin: '6px 0 14px' }}>
          You only move. Your weapons swing on their own — stay alive and pick
          up what falls.
        </div>

        {/* ⚠️ Oyunun İLK düğmesi — dokusu en güçlü olan bu olmalı. İkinci
            satır düz metin kalıyor: iki dokulu düğme yan yana konsaydı
            "hangisi asıl" sorusu geri gelirdi. */}
        <PixelButton variant={BTN.strong} scale={4}
          onClick={() => { if (!busy) { setBusy(true); onBegin(); } }}
          disabled={busy}
          style={{ width: '100%', fontSize: 15, letterSpacing: 1.2 }}>
          {busy ? 'DESCENDING…' : 'GO'}
        </PixelButton>
        <button onClick={onDismiss}
          style={{
            all: 'unset', cursor: 'pointer', display: 'block', width: '100%',
            marginTop: 8, fontSize: 11, color: C.boneFaint, textAlign: 'center',
          }}>
          I know my way around
        </button>
      </div>
    </div>
  );
}
