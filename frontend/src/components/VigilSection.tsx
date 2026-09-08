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
import { Reveal, motionOff } from '@/components/ui/motion';
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

  /**
   * YOLUN NE KADARI DOLU — açılmış kademe SAYISINDAN değil DERİNLİKTEN.
   *
   * ⚠️ Kademe sayısı kullanılsaydı çubuk d5'ten d10'a ZIPLARDI ve arada
   * oynayan oyuncu hiçbir ilerleme görmezdi. Son kademe (d125) çıpa.
   */
  const yolOrani = Math.max(0, Math.min(1,
    enDerin / VIGIL_TIERS[VIGIL_TIERS.length - 1].depth));
  // ⚠️ Ödeme ekranında yanıp sönen bir şey, hareketi kapatmış oyuncuya
  // rağmen yanıp sönmemeli.
  const hareketKapali = motionOff();

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

      {/* ══════════════════════════════════════════════════════════════
          ⭐ YOL — düz bir liste DEĞİL, DOLAN BİR HAT.
          🔴 Kullanıcı: *"görünümü rezalet olmuş, bu paketin animasyonu,
          efekti ve özel bir görünüşü olması lazım. Yani bu paket özel
          olmalı."* Eski hâli on iki eşit satırdı; oyunun tek gerçek paralı
          paketi, bir tablo gibi duruyordu.
          ⚠️ HAT OYUNCUNUN DERİNLİĞİNE GÖRE DOLUYOR — süs değil, ilerlemeyi
          TEK BAKIŞTA okutan şey o. Yüzde, açılmış kademe sayısından değil
          DERİNLİKTEN türüyor; iki kademe arası da doluyor, yoksa çubuk
          d5'ten d10'a zıplar ve arada oynayan oyuncu hiçbir şey görmezdi.
          ⚠️ `motionOff` DİNLENİYOR: hareket kapalıysa nabız da yok. Ödeme
          ekranında yanıp sönen bir şey, ayarını kapatmış oyuncuya rağmen
          yanıp sönmemeli.
          ══════════════════════════════════════════════════════════════ */}
      <style>{`
@keyframes gb-vigil-nabiz { 0%,100% { box-shadow: 0 0 0 0 rgba(239,167,46,0.55); } 50% { box-shadow: 0 0 0 7px rgba(239,167,46,0); } }
@keyframes gb-vigil-akis { from { background-position: 0 0; } to { background-position: 0 -22px; } }
`}</style>

      <CardSection label="The road" tone={C.candle}>
        <div style={{ position: 'relative', paddingLeft: 30 }}>
          {/* ── HAT: sönük gövde + dolan kısım ── */}
          <div style={{
            position: 'absolute', left: 11, top: 10, bottom: 10, width: 3,
            borderRadius: 2, background: 'rgba(255,255,255,0.09)',
          }} />
          <div style={{
            position: 'absolute', left: 11, top: 10, width: 3, borderRadius: 2,
            height: `calc((100% - 20px) * ${yolOrani})`,
            background: `linear-gradient(180deg, ${C.candle}, ${C.candleSoft ?? C.candle})`,
            boxShadow: `0 0 10px ${C.candle}66`,
            // ⚠️ Akış YALNIZ kart varken ve hareket açıkken: kartı olmayan
            // oyuncuya "senin yolun ilerliyor" hissi vermek yanlış olurdu.
            backgroundImage: kart && !hareketKapali
              ? `repeating-linear-gradient(180deg, ${C.candle} 0 8px, ${C.bone}55 8px 11px)`
              : undefined,
            animation: kart && !hareketKapali ? 'gb-vigil-akis 1.1s linear infinite' : undefined,
            transition: 'height 420ms ease-out',
          }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {VIGIL_TIERS.map((t, i) => {
              const acik = enDerin >= t.depth;
              const alindi = alinan.has(vigilKey(t));
              const bekliyor = kart && acik && !alindi;
              const def = t.cosmetic ? cosmeticById(t.cosmetic) : undefined;
              const efsane = def?.rarity === 'legendary';
              const ton = alindi ? C.ok : bekliyor ? C.candle : acik ? C.boneDim : C.boneFaint;
              /**
               * ⚠️ KİLİTLİ KADEME DE ADIYLA VE ÖDÜLÜYLE GÖRÜNÜYOR. Gizlemek,
               * oyuncudan karanlıkta ödeme istemek olurdu; `RELIQUARY`de
               * kilitli kozmetikleri gösterme kuralının aynısı.
               */
              return (
                <Reveal key={t.depth} delay={i * 28}>
                  <div style={{ position: 'relative' }}>
                    {/* ── DÜĞÜM ── efsane kademe daha büyük ve halkalı */}
                    <span style={{
                      position: 'absolute', left: -30 + 12 - (efsane ? 8 : 6),
                      top: '50%', marginTop: efsane ? -8 : -6,
                      width: efsane ? 16 : 12, height: efsane ? 16 : 12,
                      borderRadius: '50%', boxSizing: 'border-box',
                      background: alindi ? C.ok : acik ? C.candle : 'rgba(10,8,6,0.9)',
                      border: `2px solid ${alindi ? C.ok : acik ? C.candle : 'rgba(227,216,192,0.22)'}`,
                      boxShadow: efsane && acik ? `0 0 12px ${C.candle}` : undefined,
                      animation: bekliyor && !hareketKapali
                        ? 'gb-vigil-nabiz 1.6s ease-out infinite' : undefined,
                    }} />

                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: efsane ? '9px 11px' : '7px 10px', borderRadius: 7,
                      fontFamily: FONT.ui,
                      background: alindi ? 'rgba(95,158,74,0.10)'
                        : bekliyor ? 'rgba(239,167,46,0.13)'
                        : acik ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${alindi ? `${C.ok}44` : bekliyor ? `${C.candle}66` : 'rgba(255,255,255,0.08)'}`,
                      opacity: acik ? 1 : 0.6,
                    }}>
                      <span style={{ width: 34, flexShrink: 0, fontSize: 10.5, fontWeight: 900,
                        color: ton, fontVariantNumeric: 'tabular-nums' }}>D{t.depth}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: efsane ? 12 : 11.5,
                        fontWeight: efsane ? 900 : 400, color: efsane ? C.bone : C.boneDim,
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
                      {bekliyor && <Tag tone="gold">READY</Tag>}
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </CardSection>
    </>
  );
}
