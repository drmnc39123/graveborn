'use client';
// THE LONG VIGIL — sezon kartı paneli.
//
// ⚠️ KART GÜÇ SATMAZ ve bunu oyuncuya AÇIKÇA söylüyoruz. Bir ödeme
// ekranında en pahalı hata, alanın ne aldığını yanlış sanmasıdır.
//
// ⚠️ YOL KARTSIZ DA GÖRÜNÜYOR (sönük). Ne verdiğini gizleyip "satın al"
// demek, oyuncudan karanlıkta ödeme istemektir. Kilitli kademeler adıyla
// ve ödülüyle duruyor — `RELIQUARY`nin kilitli kozmetikleri gösterme
// kuralının aynısı.
//
// ⚠️ "AL VE HEPSİNİ KAP" DEĞİL: kart yolu açıyor, yolu oyuncu yürüyor.

import { useCallback, useMemo, useState } from 'react';
import { panelUnlocked } from '@/lib/testMode';
import { getMode } from '@/lib/session';
import { STAGES } from '@/game/config';
import { paidDepth, type Progress } from '@/game/progress';
import { VIGIL_GOLD, VIGIL_HERO, VIGIL_TIERS, vigilClaimable, vigilKey, vigilTotalDust } from '@/game/vigil';
import { heroById } from '@/game/heroes';
import { cosmeticById, RARITY } from '@/game/cosmetics';
import { buyVigilSol, claimVigil } from '@/lib/gameSession';
import { SolPayButton, useSolRail } from '@/components/SolPayButton';
import { solPrice } from '@/game/solPrice';
import { Card, CardSection, Tag } from '@/components/ui/cards';
import { BTN, PixelButton } from '@/components/ui/kit';
import { C, FONT, glass } from '@/lib/theme';

export function VigilSection({ progress, onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  // ⚠️ Kahraman adı `heroes.ts`ten okunuyor, elle yazılmıyor: iki yere
  // yazılan bir ad bir gun ayrisir ve oyuncu olmayan bir sey satin alir.
  const kahramanAdi = heroById(VIGIL_HERO).name;
  const ray = useSolRail();
  const kart = progress.vigil === true;
  const alinan = useMemo(() => new Set(progress.vigilClaimed ?? []), [progress.vigilClaimed]);

  /**
   * ⚠️ `paidDepth` KULLANILIYOR, iddia edilen derinlik değil: sunucunun
   * ödeme yaptığı derinlik. Sunucu da aynı kaynaktan okuyor; ikinci bir
   * "en derin" tanımı oyuncuya iki farklı sayı öğretirdi.
   */
  const enDerin = useMemo(
    () => Math.max(0, ...STAGES.map((s) => paidDepth(progress, s.id))),
    [progress],
  );
  const alinabilir = vigilClaimable(kart, enDerin, progress.vigilClaimed ?? []);

  const al = useCallback(async () => {
    if (busy || alinabilir.length === 0) return;
    setBusy(true);
    try { onChange((await claimVigil()).progress); }
    catch (e) { onError(e instanceof Error ? e.message : 'Nothing to collect.'); }
    finally { setBusy(false); }
  }, [busy, alinabilir.length, onChange, onError]);

  if (!panelUnlocked(getMode())) {
    return (
      <div style={{ ...glass(9), padding: '16px 14px', fontSize: 12, color: C.boneFaint,
        textAlign: 'center', lineHeight: 1.6, fontFamily: FONT.ui }}>
        The vigil is kept in the village ledger, not on your device. Connect a wallet
        to take the card.
      </div>
    );
  }

  return (
    <>
      {/* ⚠️ İLK CÜMLE NE OLMADIĞINI SÖYLÜYOR — ödeme ekranında en pahalı
          hata, alanın ne aldığını yanlış sanmasıdır. */}
      {/* ⚠️ İLK CÜMLE NE ALDIĞINI SÖYLÜYOR — ödeme ekranında en pahalı hata,
          alanın ne aldığını yanlış sanmasıdır. Metin eskiden "hiç güç
          vermez" diyordu; kart artık gold ve bir kahraman taşıyor, o yüzden
          cümle GERÇEĞE çevrildi. Sattığın şeyi küçültmek de büyütmek kadar
          yanlış — oyuncu ne aldığını tam olarak bilmeli. */}
      <p style={{ margin: '0 0 12px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        The card is <strong style={{ color: C.bone }}>bought once</strong>, not rented by the
        season. It opens with <strong style={{ color: C.candle }}>{VIGIL_GOLD.toLocaleString('en-US')} gold</strong> and
        <strong style={{ color: C.candle }}> {kahramanAdi}</strong> — a hero you cannot unlock by
        playing — and then it opens a road of twelve steps you walk yourself.
      </p>

      {!kart && (
        <Card accent>
          <div style={{ padding: '12px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.bone }}>THE LONG VIGIL</span>
              <Tag tone="gold">{VIGIL_TIERS.length} TIERS</Tag>
              <span style={{ marginLeft: 'auto' }}>
                {/* 🔴 RAY KAPALIYKEN SESSİZ KALINMAZ. Kartın TEK eylemi SOL;
                    düğme yok olunca geriye tıklanacak hiçbir şeyi olmayan
                    bir kutu kalıyor ve oyuncu kartın bozuk olduğunu sanıyor.
                    Exchange kapısındaki dersin aynısı: kapalı bir şey KAPALI
                    olduğunu SÖYLEMELİ. */}
                {ray === 'acik' ? (
                  <SolPayButton
                    urun="battlepass"
                    lamports={solPrice('battlepass')}
                    onError={onError}
                    onDone={async (sig) => { onChange((await buyVigilSol(sig)).progress); }}
                  />
                ) : (
                  <span style={{
                    fontSize: 9.5, fontWeight: 900, letterSpacing: 1,
                    color: C.boneFaint, border: `1px solid ${C.border}66`,
                    padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap',
                  }}>{ray === 'bilinmiyor' ? '…' : 'NOT OPEN YET'}</span>
                )}
              </span>
            </div>
            <div style={{ marginTop: 7, fontSize: 11.5, color: C.boneDim, lineHeight: 1.5 }}>
              Six relics that the reliquary will never roll, and {vigilTotalDust().toLocaleString('en-US')} dust
              along the way. Every tier is opened by going deeper — the card unlocks the road,
              it does not walk it for you.
            </div>
            {/* ⚠️ NE ZAMAN AÇILACAĞI DEĞİL, NİYE KAPALI OLDUĞU yazılıyor.
                Takvime bağlı bir söz, o gün geldiğinde arkasındaki iş
                bitmemişse de gelir ve tutulamaz (bkz. `locked.ts`). */}
            {ray === 'kapali' && (
              <div style={{
                marginTop: 8, padding: '7px 9px', borderRadius: 5,
                border: `1px solid ${C.border}66`, background: 'rgba(0,0,0,0.22)',
                fontSize: 11, color: C.boneFaint, lineHeight: 1.5,
              }}>
                The card cannot be bought yet — payments are not switched on. The road
                below is what it opens, and it is not going anywhere. Everything else in
                the village is still bought with gold.
              </div>
            )}
          </div>
        </Card>
      )}

      {kart && (
        <Card accent={alinabilir.length > 0}>
          <div style={{ padding: '11px 13px', display: 'flex', alignItems: 'center',
            gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 900, color: C.bone }}>YOUR VIGIL</span>
            <Tag tone="gold">DEEPEST {enDerin}</Tag>
            <span style={{ marginLeft: 'auto' }}>
              <PixelButton variant={BTN.strong} scale={2}
                disabled={busy || alinabilir.length === 0} onClick={al}>
                {alinabilir.length > 0 ? `COLLECT ${alinabilir.length}` : 'NOTHING DUE'}
              </PixelButton>
            </span>
          </div>
        </Card>
      )}

      <CardSection label="The road" tone={C.candle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {VIGIL_TIERS.map((t) => {
            const acik = enDerin >= t.depth;
            const alindi = alinan.has(vigilKey(t));
            const def = t.cosmetic ? cosmeticById(t.cosmetic) : undefined;
            /**
             * ⚠️ KİLİTLİ KADEME DE ADIYLA VE ÖDÜLÜYLE GÖRÜNÜYOR. Gizlemek,
             * oyuncudan karanlıkta ödeme istemek olurdu; `RELIQUARY`de
             * kilitli kozmetikleri gösterme kuralının aynısı.
             */
            return (
              <div key={t.depth} style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '7px 10px', borderRadius: 6, fontFamily: FONT.ui,
                background: alindi ? 'rgba(95,158,74,0.10)' : acik && kart
                  ? 'rgba(239,167,46,0.10)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${alindi ? `${C.ok}44` : acik && kart ? `${C.candle}44` : 'rgba(255,255,255,0.08)'}`,
                opacity: acik ? 1 : 0.55,
              }}>
                <span style={{ width: 40, flexShrink: 0, fontSize: 10.5, fontWeight: 900,
                  color: acik ? C.candle : C.boneFaint }}>D{t.depth}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.boneDim,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.label}
                </span>
                {def && (
                  <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.6,
                    color: RARITY[def.rarity].color, whiteSpace: 'nowrap' }}>
                    {def.name}
                  </span>
                )}
                <span style={{ flexShrink: 0, fontSize: 10.5, color: C.boneFaint,
                  fontVariantNumeric: 'tabular-nums' }}>{t.dust} dust</span>
                {alindi && <Tag tone="dim">TAKEN</Tag>}
              </div>
            );
          })}
        </div>
      </CardSection>
    </>
  );
}
