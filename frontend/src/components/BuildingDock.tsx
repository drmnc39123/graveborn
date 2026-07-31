'use client';
// BİNA NAVBAR'I — köyün her binasına tek tıkla erişim, üstte ortada.
//
// KULLANICI KURALI: "tüm binaların erişiminin butonunu koyacağız, oyuncunun
// gitmesine gerek yok" + "sol menü olmasın, üstte ortada yan yana olsun,
// navbar gibi." Haritada yürümek bir SEÇENEK olarak kalıyor (atmosfer),
// zorunluluk değil.
//
// Ayrıca haritada 'quests' kapısı HİÇ YOK — Warden's Post'a tek giriş dövüş
// portalıydı. Bu navbar o boşluğu da kapatıyor.

import type { CSSProperties } from 'react';
import { PixelButton } from '@/components/ui/kit';
import { C, FONT, glass } from '@/lib/theme';

export interface DockEntry {
  id: string;
  /** navbar'da görünen kısa ad — uzun isimler yan yana sığmıyor */
  label: string;
  /** tam ad + ne işe yaradığı (tooltip) */
  sub: string;
}

/** Sıralama kasıtlı: oyuncunun döngüsü soldan sağa okunuyor. */
export const BUILDINGS: readonly DockEntry[] = [
  { id: 'quests', label: 'STAGES', sub: "The Warden's Post — stages & the Descent" },
  { id: 'upgrade', label: 'FORGE', sub: 'The Forge — permanent power' },
  { id: 'shop', label: 'STALL', sub: "Pedlar's Stall — consumables" },
  { id: 'market', label: 'MARKET', sub: 'Marketplace — sell gold for $GRAVE' },
  { id: 'exchange', label: 'EXCHANGE', sub: 'The Exchange — player order book' },
  { id: 'tavern', label: 'TAVERN', sub: 'Tavern — profile & records' },
] as const;

export function BuildingDock({ open, onOpen, gold, grave = 0, style }: {
  /** açık olan panel — buton "Selected" görünür */
  open: string | null;
  onOpen: (id: string) => void;
  gold: number;
  grave?: number;
  style?: CSSProperties;
}) {
  return (
    <div style={{
      // zIndex panel katmanının (5) ÜSTÜNDE: navbar her zaman tıklanabilir
      // kalmalı, panel açıkken de doğrudan başka binaya geçilebilsin.
      position: 'absolute', top: 10, left: 0, right: 0, zIndex: 6,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none', ...style,
    }}>
      {/* Koyu zemin şart: parlak çimenin üstünde metin okunmuyordu.
          Dar ekranda sarar — mobilde tek satıra sığmıyor. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        justifyContent: 'center', padding: '8px 12px', maxWidth: 'calc(100vw - 24px)',
        pointerEvents: 'auto', ...glass(12),
      }}>
        {BUILDINGS.map((b) => (
          <PixelButton
            key={b.id}
            variant="01A"
            scale={2}
            active={open === b.id}
            onClick={() => onOpen(b.id)}
            title={b.sub}
            style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.9 }}
          >
            {b.label}
          </PixelButton>
        ))}

        {/* Cüzdan navbar'ın sağ ucunda — ayrı çerçeve tutarsız duruyordu */}
        <span style={{
          display: 'flex', gap: 10, alignItems: 'baseline', fontFamily: FONT.ui,
          paddingLeft: 12, marginLeft: 4, borderLeft: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: C.candle, whiteSpace: 'nowrap' }}>
            {Math.floor(gold).toLocaleString('en-US')}
            <span style={{ fontSize: 9, marginLeft: 3, color: C.candleSoft }}>GOLD</span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 900, color: C.boneFaint, whiteSpace: 'nowrap' }}>
            {grave.toLocaleString('en-US')}
            <span style={{ fontSize: 9, marginLeft: 3 }}>$GRAVE</span>
          </span>
        </span>
      </div>
    </div>
  );
}
