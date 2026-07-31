'use client';
// BİNA RIHTIMI — köyün her binasına tek tıkla erişim.
//
// KULLANICI KURALI: "tüm binaların erişiminin butonunu koyacağız, oyuncunun
// gitmesine gerek yok." Haritada yürümek bir SEÇENEK olarak kalıyor (atmosfer),
// ama zorunlu değil. Gerçek oyunlarda da böyle: harita gezilir, menü tıklanır.
//
// Ayrıca haritada 'quests' kapısı HİÇ YOK — Warden's Post'a tek giriş dövüş
// portalıydı. Bu rıhtım o boşluğu da kapatıyor.

import type { CSSProperties } from 'react';
import { PixelButton } from '@/components/ui/kit';
import { C, FONT, glass } from '@/lib/theme';

export interface DockEntry {
  id: string;
  label: string;
  /** kısa açıklama — geniş ekranda gösterilir */
  sub: string;
}

/** Sıralama kasıtlı: oyuncunun döngüsü yukarıdan aşağı okunuyor. */
export const BUILDINGS: readonly DockEntry[] = [
  { id: 'quests', label: "WARDEN'S POST", sub: 'Stages & the Descent' },
  { id: 'upgrade', label: 'THE FORGE', sub: 'Permanent power' },
  { id: 'shop', label: "PEDLAR'S STALL", sub: 'Consumables' },
  { id: 'market', label: 'MARKETPLACE', sub: 'Sell gold for $GRAVE' },
  { id: 'exchange', label: 'THE EXCHANGE', sub: 'Player order book' },
  { id: 'tavern', label: 'TAVERN', sub: 'Profile & records' },
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
    // Koyu zemin şart: butonların altındaki açıklama parlak çimenin üstünde
    // okunmuyordu. Cüzdan da aynı blokta — iki ayrı çerçeve tutarsız duruyordu.
    <div style={{
      position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 7,
      zIndex: 3, padding: '10px 10px 12px', ...glass(12), ...style,
    }}>
      <div style={{
        display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap',
        fontFamily: FONT.ui, padding: '0 2px 8px', marginBottom: 1,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: C.candle, whiteSpace: 'nowrap' }}>
          {Math.floor(gold).toLocaleString('en-US')}
          <span style={{ fontSize: 9, marginLeft: 3, color: C.candleSoft }}>GOLD</span>
        </span>
        <span style={{ fontSize: 13, fontWeight: 900, color: C.boneFaint, whiteSpace: 'nowrap' }}>
          {grave.toLocaleString('en-US')}
          <span style={{ fontSize: 9, marginLeft: 3 }}>$GRAVE</span>
        </span>
      </div>

      {/* Buton yüksekliği SABİT (varlık 48×16). Alt açıklama butonun dışında,
          altında duruyor — içine sığdırmaya çalışmak dokuyu esnetirdi. */}
      {BUILDINGS.map((b) => (
        <div key={b.id}>
          <PixelButton
            variant="01A"
            scale={2}
            active={open === b.id}
            onClick={() => onOpen(b.id)}
            title={b.sub}
            style={{ width: 200, fontSize: 11, fontWeight: 900, letterSpacing: 0.9 }}
          >
            {b.label}
          </PixelButton>
          <div style={{
            fontFamily: FONT.ui, fontSize: 9.5, color: C.boneDim,
            marginTop: 2, marginLeft: 6, letterSpacing: 0.2,
          }}>
            {b.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
