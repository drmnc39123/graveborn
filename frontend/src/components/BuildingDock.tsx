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

import { useEffect, useRef, type CSSProperties } from 'react';
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
  { id: 'shop', label: 'STALL', sub: "Pedlar's Stall — charms for one run" },
  // ⚠️ Forge'un HEMEN ARDINDA duruyor ve bu kasıtlı: oyuncunun gold döngüsü
  // "kalıcı güç → görünür prestij" sırasında okunmalı. Forge sonlu, Reliquary
  // değil; ağaç bitince gold'un gideceği yer bir sonraki durak olsun.
  { id: 'reliquary', label: 'RELIQUARY', sub: 'The Reliquary — relics, titles, auras (appearance only)' },
  // ⚠️ Forge'la Reliquary'nin ARASINDA duruyor ve bu kasıtlı: Forge dikey
  // ilerleme (gold'la satın alınır), ekipman YATAY (bulunur). İkisini yan yana
  // koymak, oyuncunun iki farklı güç eksenini olduğu gibi okumasını sağlıyor.
  { id: 'gear', label: 'GEAR', sub: 'Your gear — what you found in the Wilderness' },
  { id: 'market', label: 'MARKET', sub: 'Marketplace — sell gold for $GRAVE' },
  { id: 'exchange', label: 'EXCHANGE', sub: 'The Exchange — player order book' },
  // ⚠️ Sonda duruyor ama en dikkat çeken yer olmalı — haftalık, kaçırılırsa
  // bir daha o boss gelmiyor. Rozet/vurgu Faz 5 cilasında eklenecek.
  { id: 'boss', label: 'BARROW', sub: "The Shared Barrow — this week's world boss" },
  { id: 'tavern', label: 'TAVERN', sub: 'Tavern — profile & records' },
  // ⚠️ TAVERN'in yanında: ikisi de "kim olduğun" ile ilgili. Lonca sohbetin
  // yanına konsaydı bir araç gibi görünürdü; profilin yanında bir AİDİYET
  // gibi okunuyor — sekmenin işi tam olarak bu.
  { id: 'guild', label: 'GUILD', sub: 'The Guilds — stand with others, share experience' },
  // ⚠️ Bir BİNA değil ama buraya konuldu: ayarlar ulaşılabilir olmalı ve
  // köyde onu barındıracak bir kapı yok. Ayrı bir dişli ikonu eklemek
  // rıhtımın dilini bozardı.
  { id: 'settings', label: 'SETTINGS', sub: 'Sound, motion, graphics' },
] as const;

/**
 * ⚠️ RIHTIM YÜKSEKLİĞİ DIŞARI BİLDİRİLİR (`onHeight`).
 *
 * Panel katmanı üstten sabit 78 px boşluk bırakıyordu — TEK SATIRLIK bir
 * navbar için ölçülmüş sihirli bir sayı. 9. düğme (SETTINGS) eklenince satır
 * sardı, rıhtım 85 px'e çıktı ve panelin ilk 31 pikselini ÖRTTÜ. Rıhtım
 * zIndex 6, panel 5 — yani oradaki her tıklama panele değil rıhtımın son
 * düğmesine gidiyordu: oyuncu karakter seçerken/WEAR'a basarken kendini
 * Settings'te buluyordu.
 *
 * Sabit sayı yerine GERÇEK yükseklik ölçülüyor; düğme sayısı ya da ekran
 * genişliği değişince kendiliğinden doğru kalıyor.
 */
export function BuildingDock({ open, onOpen, gold, grave = 0, wallet, style, onHeight }: {
  /** açık olan panel — buton "Selected" görünür */
  open: string | null;
  onOpen: (id: string) => void;
  gold: number;
  grave?: number;
  /** bağlı cüzdan; yoksa DEMO modundayız */
  wallet?: string | null;
  style?: CSSProperties;
  /** rıhtımın kapladığı toplam yükseklik (px) — panel boşluğu buna göre ayarlanır */
  onHeight?: (h: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  // Satır sarması ekran genişliğine bağlı; `ResizeObserver` her değişimde
  // haber veriyor — pencere yeniden boyutlandırılınca da doğru kalıyor.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !onHeight) return;
    const bildir = () => onHeight(el.getBoundingClientRect().height);
    bildir();
    const ro = new ResizeObserver(bildir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  return (
    <div style={{
      // zIndex panel katmanının (5) ÜSTÜNDE: navbar her zaman tıklanabilir
      // kalmalı, panel açıkken de doğrudan başka binaya geçilebilsin.
      position: 'absolute', top: 10, left: 0, right: 0, zIndex: 6,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none', ...style,
    }}>
      {/* Koyu zemin şart: parlak çimenin üstünde metin okunmuyordu.
          Dar ekranda sarar — mobilde tek satıra sığmıyor. */}
      <div ref={boxRef} style={{
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
          {/* Hangi kayda oynadığın HER ZAMAN görünsün. Demo ilerlemesi bu
              cihazda kalır; oyuncunun bunu sonradan öğrenmesi kötü olurdu. */}
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: 0.8, padding: '2px 6px',
            borderRadius: 4, whiteSpace: 'nowrap',
            color: wallet ? C.ok : C.candle,
            background: wallet ? 'rgba(95,158,74,0.16)' : 'rgba(239,167,46,0.14)',
          }}>
            {wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : 'DEMO'}
          </span>
        </span>
      </div>
    </div>
  );
}
