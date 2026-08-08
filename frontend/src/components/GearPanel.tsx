'use client';
// EKİPMAN — arayüz.
//
// ⚠️ PANELİN ASIL İŞİ KARŞILAŞTIRMA. Bir parça "iyi" ya da "kötü" değil;
// takas. Oyuncunun görmesi gereken şey nadirlik yıldızı değil, TAKTIĞINDA
// NE KAZANIP NE KAYBEDECEĞİ. Bu yüzden seçilen parça her zaman takılı olanın
// YANINDA duruyor ve laneti kanla, bonusu mumla yazılıyor — iki sütun, tek
// bakış.
//
// ⚠️ LANET GİZLENMEZ, KÜÇÜLTÜLMEZ. Aynı punto, aynı satır yüksekliği.
// Bir sistemin bedelini görsel olarak silikleştirmek, oyuncuya yalan
// söylemenin en sessiz yolu.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GEAR_SLOTS, SLOT_BLURB, SLOT_NAME, affixText, gearScore, rarityOf,
  type GearItem, type GearSlot,
} from '@/game/gear';
import type { Progress } from '@/game/progress';
import { equipGear, fetchGear, reforgeGear, salvageGear, unequipGear, type GearView } from '@/lib/gameSession';
import { promotePreview, rerollCost } from '@/game/reforge';
import { getMode } from '@/lib/session';
import { Card, CardSection, PanelHead, Tag } from '@/components/ui/cards';
import { PixelButton } from '@/components/ui/kit';
import { C, FONT, glass } from '@/lib/theme';

type Owned = GearItem & { equipped: boolean };

export function GearPanel({ progress, onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError: (msg: string) => void;
}) {
  const [view, setView] = useState<GearView | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sec, setSec] = useState<string | null>(null);
  const [yuvaFiltre, setYuvaFiltre] = useState<GearSlot | null>(null);

  const yukle = useCallback(() => {
    fetchGear().then(setView).catch(() => setErr(true));
  }, []);
  useEffect(() => { if (getMode() === 'wallet') yukle(); }, [yukle]);

  const takili = useMemo(() => {
    const m = {} as Partial<Record<GearSlot, Owned>>;
    for (const it of view?.items ?? []) if (it.equipped) m[it.slot] = it;
    return m;
  }, [view]);

  const secili = useMemo(
    () => (view?.items ?? []).find((i) => i.id === sec) ?? null,
    [view, sec],
  );

  // ⚠️ Fiyatlar ve önizleme SAF katmandan (`game/reforge`) okunuyor, burada
  // hesaplanmıyor — sunucu da AYNI dosyayı kullanıyor. İki yerde fiyat
  // yazmak, arayüzün gösterdiği sayı ile ödenen sayının ayrışması demekti.
  const onizleme = useMemo(
    () => (secili ? promotePreview(secili.rarity) : null),
    [secili],
  );
  const yenidenFiyat = useMemo(
    () => (secili ? rerollCost(secili.rarity) : 0),
    [secili],
  );

  if (getMode() !== 'wallet') {
    return (
      <PanelHead kicker="THE WILDERNESS" title="Nothing here is bought" accent={C.ice}
        sub="Gear is found, not purchased — and it is rolled on the server, not on your device. Connect a wallet to carry it." />
    );
  }
  if (err) return <Note>Could not reach your vault.</Note>;
  if (!view) return <Note>Opening the vault…</Note>;

  const sar = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); }
    catch (e) { onError(e instanceof Error ? e.message : 'The vault refused.'); }
    finally { setBusy(false); }
  };

  const cantada = view.items.length;
  const dolu = cantada >= view.vaultSize;
  const bosParcalar = view.items.filter((i) => !i.equipped);
  const gorunen = yuvaFiltre ? bosParcalar.filter((i) => i.slot === yuvaFiltre) : bosParcalar;

  return (
    <>
      <PanelHead kicker="YOUR GEAR" title="What you carry down" accent={C.ice}
        sub="Every piece past the second tier costs you something. Read both columns before you wear it."
        right={<Tag tone={dolu ? 'bad' : 'dim'}>{cantada}/{view.vaultSize}</Tag>} />

      {/* ⚠️ ÇANTA DOLU UYARISI PANELİN EN ÜSTÜNDE. Aşağıda dursaydı oyuncu
          onu ancak parçalarını kaybettikten sonra okurdu. */}
      {dolu && (
        <div style={{
          marginBottom: 12, padding: '9px 12px', borderRadius: 8,
          background: 'rgba(160,18,38,0.14)', border: `1px solid ${C.bad}55`,
          fontSize: 11.5, color: '#e4657a', lineHeight: 1.5, fontFamily: FONT.ui,
        }}>
          Your vault is full. Anything you find in the Wilderness will be left
          behind until you break something down.
        </div>
      )}

      {/* ── MANKEN ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
        gap: 7, marginBottom: 13,
      }}>
        {GEAR_SLOTS.map((slot) => {
          const it = takili[slot];
          const r = it ? rarityOf(it.rarity) : null;
          const acik = yuvaFiltre === slot;
          return (
            <button key={slot}
              onClick={() => setYuvaFiltre(acik ? null : slot)}
              title={SLOT_BLURB[slot]}
              style={{
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 3,
                padding: '9px 10px', borderRadius: 9, minHeight: 68,
                fontFamily: FONT.ui, textAlign: 'left',
                // Nadirlik rengi YUVANIN KENDİSİNDE: oyuncu mankene bakınca
                // hangi yuvanın zayıf kaldığını okumadan görsün.
                border: `1px solid ${r ? `${r.color}77` : 'rgba(255,255,255,0.10)'}`,
                background: r
                  ? `linear-gradient(180deg, ${r.color}22, rgba(0,0,0,0.34))`
                  : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.28))',
                boxShadow: acik ? `0 0 0 2px ${C.candle}88` : 'none',
              }}>
              <span style={{
                fontSize: 9, fontWeight: 900, letterSpacing: 1.3,
                color: r ? r.color : C.boneFaint,
              }}>
                {SLOT_NAME[slot].toUpperCase()}
              </span>
              {it ? (
                <>
                  <span style={{ fontSize: 11, fontWeight: 900, color: C.bone }}>{r!.name}</span>
                  <span style={{ fontSize: 10, color: C.boneFaint }}>
                    {gearScore(it).toFixed(1)} pts
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 10.5, color: C.boneFaint, lineHeight: 1.35 }}>
                  {SLOT_BLURB[slot]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── SEÇİLİ PARÇA — takılıyla YAN YANA ── */}
      {secili && (
        <div style={{ ...glass(10), padding: 11, marginBottom: 12 }}>
          <div style={{
            display: 'grid', gap: 9,
            gridTemplateColumns: takili[secili.slot] && !secili.equipped
              ? 'repeat(auto-fit, minmax(150px, 1fr))' : '1fr',
          }}>
            <ItemBody item={secili} label={secili.equipped ? 'WORN NOW' : 'SELECTED'} />
            {/* ⚠️ Karşılaştırma sütunu YALNIZCA takas varsa çıkar. Boş bir
                "şu an hiçbir şey takılı değil" sütunu koymak gürültü olurdu. */}
            {takili[secili.slot] && !secili.equipped && (
              <ItemBody item={takili[secili.slot]!} label="REPLACES" muted />
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {secili.equipped ? (
              <PixelButton variant="03A" scale={2} disabled={busy}
                onClick={() => sar(async () => { setView(await unequipGear(secili.slot)); })}>
                TAKE OFF
              </PixelButton>
            ) : (
              <>
                <PixelButton variant="01A" scale={2} disabled={busy}
                  onClick={() => sar(async () => { setView(await equipGear(secili.id)); })}>
                  WEAR IT
                </PixelButton>
                <PixelButton variant="03A" scale={2} disabled={busy}
                  onClick={() => sar(async () => {
                    const r = await salvageGear([secili.id]);
                    setView(r.gear);
                    onChange(r.progress);
                    setSec(null);
                  })}>
                  BREAK DOWN · {rarityOf(secili.rarity).salvage} DUST
                </PixelButton>
              </>
            )}
          </div>
          {/* ── YENİDEN DÖVME ──
              ⚠️ AYRI BİR KUTUDA ve GOLD yazıyor. Yukarıdaki düğmeler TOZ
              ekonomisinde (parçalama), bunlar GOLD ekonomisinde. Aynı sıraya
              koymak iki para birimini karıştırmanın en kolay yolu olurdu.
              ⚠️ Takılı parça da dövülebiliyor (parçalamanın aksine): işlem
              yıkıcı değil, parça yerinde kalıyor. */}
          <div style={{
            marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.4,
              color: C.boneFaint, marginBottom: 7 }}>
              THE REFORGE
            </div>

            {onizleme ? (
              <>
                <PixelButton variant="01A" scale={2}
                  disabled={busy || progress.gold < onizleme.cost}
                  onClick={() => sar(async () => {
                    const r = await reforgeGear(secili.id, 'promote');
                    setView(r.gear); onChange(r.progress);
                  })}>
                  TEMPER → {onizleme.to.toUpperCase()} · {onizleme.cost.toLocaleString('en-US')} GOLD
                </PixelButton>
                {/* ⚠️ LANET ARTIŞI HARCAMADAN ÖNCE SÖYLENMELİ. 32.000 gold
                    harcayıp "bir lanet daha geldi" diye öğrenmek, geri
                    alınamayan bir işlemde verilebilecek en kötü sürpriz. */}
                <div style={{ fontSize: 10.5, color: C.boneFaint, marginTop: 5, lineHeight: 1.5 }}>
                  {onizleme.boonsFrom} → {onizleme.boonsTo} boons ·{' '}
                  {onizleme.banesTo > onizleme.banesFrom ? (
                    <span style={{ color: C.bloodSoft }}>
                      {onizleme.banesFrom} → {onizleme.banesTo} banes
                    </span>
                  ) : `${onizleme.banesTo} banes`}
                  {' · all affixes are rolled again.'}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: C.boneFaint, marginBottom: 7 }}>
                Already at the highest rarity — nothing left to temper.
              </div>
            )}

            <div style={{ marginTop: 9 }}>
              <PixelButton variant="03A" scale={2}
                disabled={busy || progress.gold < yenidenFiyat}
                onClick={() => sar(async () => {
                  const r = await reforgeGear(secili.id, 'reroll');
                  setView(r.gear); onChange(r.progress);
                })}>
                RECAST · {yenidenFiyat.toLocaleString('en-US')} GOLD
              </PixelButton>
              <div style={{ fontSize: 10.5, color: C.boneFaint, marginTop: 5, lineHeight: 1.5 }}>
                Same rarity, new affixes — banes included.
              </div>
            </div>

            {progress.gold < yenidenFiyat && (
              <div style={{ fontSize: 10.5, color: C.bloodSoft, marginTop: 6 }}>
                You have {Math.floor(progress.gold).toLocaleString('en-US')} gold.
              </div>
            )}
          </div>

          {/* ⚠️ Takılı parça parçalanamıyor ve SEBEBİ yazılı — düğmeyi sessizce
              gizlemek "neden yapamıyorum" sorusunu doğururdu. */}
          {secili.equipped && (
            <div style={{ marginTop: 6, fontSize: 11, color: C.boneFaint }}>
              Take it off first if you want to break it down.
            </div>
          )}
        </div>
      )}

      {/* ── ÇANTA ── */}
      <CardSection
        label={yuvaFiltre ? `${SLOT_NAME[yuvaFiltre]} — ${gorunen.length} in the vault` : `Vault — ${gorunen.length}`}
        tone={C.ice}>
        {yuvaFiltre && (
          <button onClick={() => setYuvaFiltre(null)} style={{
            all: 'unset', cursor: 'pointer', fontSize: 10.5, color: C.candle,
            fontFamily: FONT.ui, marginBottom: 6, display: 'block',
          }}>
            ← show every slot
          </button>
        )}
        {gorunen.length === 0 ? (
          <div style={{ fontSize: 11.5, color: C.boneDim, lineHeight: 1.55 }}>
            {cantada === 0
              ? 'Nothing yet. Gear only comes out of the Wilderness — and only if you walk out alive.'
              : 'Nothing spare in this slot.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gorunen.map((it) => {
              const r = rarityOf(it.rarity);
              const yerlesik = takili[it.slot];
              const fark = gearScore(it) - (yerlesik ? gearScore(yerlesik) : 0);
              return (
                <Card key={it.id} onClick={() => setSec(it.id === sec ? null : it.id)}
                  accent={it.id === sec}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px' }}>
                    {/* Nadirlik şeridi — listeyi taramayı gözle mümkün kılıyor */}
                    <span style={{
                      width: 3, alignSelf: 'stretch', borderRadius: 2, background: r.color,
                    }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 900, color: r.color }}>
                        {r.name} {SLOT_NAME[it.slot]}
                      </span>
                      <span style={{
                        display: 'block', fontSize: 10.5, color: C.boneFaint,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {it.affixes.map(affixText).join(' · ')}
                      </span>
                    </span>
                    {/* ⚠️ NET FARK, ham güç değil. Oyuncunun sorduğu soru
                        "bu parça iyi mi" değil "TAKILI OLANDAN iyi mi". */}
                    <Tag tone={fark > 0 ? 'ok' : fark < 0 ? 'bad' : 'dim'}>
                      {fark > 0 ? '+' : ''}{fark.toFixed(1)}
                    </Tag>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </CardSection>

      {/* Toplu parçalama — çöp temizliği tek tek tıklamayla yapılmamalı */}
      {bosParcalar.some((i) => i.rarity <= 2) && (
        <div style={{ marginTop: 11 }}>
          <PixelButton variant="02A" scale={2} disabled={busy}
            onClick={() => sar(async () => {
              const cop = bosParcalar.filter((i) => i.rarity <= 2).map((i) => i.id);
              const r = await salvageGear(cop);
              setView(r.gear);
              onChange(r.progress);
              setSec(null);
            })}>
            BREAK DOWN ALL WORN & KEPT ({bosParcalar.filter((i) => i.rarity <= 2).length})
          </PixelButton>
          <div style={{ marginTop: 5, fontSize: 11, color: C.boneFaint }}>
            Only the first two tiers — nothing cursed is touched.
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: C.boneFaint, lineHeight: 1.55 }}>
        You hold {progress.dust.toLocaleString('en-US')} dust. Broken gear becomes
        dust, never gold — the Wilderness pays in things, not coin.
      </div>
    </>
  );
}

/** Bir parçanın gövdesi — bonuslar ve lanetler AYNI puntoda */
function ItemBody({ item, label, muted = false }: {
  item: GearItem; label: string; muted?: boolean;
}) {
  const r = rarityOf(item.rarity);
  return (
    <div style={{
      borderRadius: 9, padding: '9px 11px', opacity: muted ? 0.72 : 1,
      border: `1px solid ${r.color}55`,
      background: `linear-gradient(180deg, ${r.color}1c, rgba(0,0,0,0.3))`,
      fontFamily: FONT.ui,
    }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.3, color: C.boneFaint }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 900, color: r.color, marginTop: 2 }}>
        {r.name} {SLOT_NAME[item.slot]}
      </div>
      <div style={{ fontSize: 10, color: C.boneFaint, marginBottom: 6 }}>
        found at depth {item.depth} · {gearScore(item).toFixed(1)} net
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {item.affixes.map((a, i) => (
          <div key={i} style={{
            fontSize: 11.5, lineHeight: 1.45,
            // ⚠️ Lanet AYNI PUNTODA, sadece renk farklı. Küçültmek bedeli
            // gizlemek olurdu.
            color: a.kind === 'boon' ? C.candleSoft : '#e4657a',
          }}>
            {affixText(a)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      ...glass(9), padding: '16px 14px', fontSize: 12, color: C.boneFaint,
      textAlign: 'center', lineHeight: 1.6, fontFamily: FONT.ui,
    }}>
      {children}
    </div>
  );
}
