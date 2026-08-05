'use client';
// THE RELIQUARY — gold'un sonsuz talebinin ilk ayağı.
//
// Ekonomik gerekçe `game/cosmetics.ts` başlığında. Buradaki iş SADECE arayüz:
// çekiliş, koleksiyon, takma.
//
// ⚠️ HİÇBİR ŞEY GÜÇ VERMEZ ve bunu oyuncuya AÇIKÇA söylüyoruz. Bir gacha'da
// "acaba stat mı veriyor" belirsizliği, oyuncunun kazanamayacağı bir yarışa
// para harcadığını sanmasına yol açar; panelin tepesinde tek cümleyle yazılı.
//
// ⚠️ Sprite'lar CSS `steps()` ile oynatılıyor, JS zamanlayıcı YOK. 41 kart
// aynı anda görünebiliyor; her biri için rAF döngüsü kurmak paneli
// dondururdu. Şerit PNG = yatay kareler → `background-position-x`.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  COSMETICS, PULL_COST, RARITY, cosmeticById, cosmeticsInSlot,
  type CosmeticDef, type CosmeticSlot, type Rarity,
} from '@/game/cosmetics';
import type { Progress } from '@/game/progress';
import { buyCosmeticWithDust, equipCosmetic, pullReliquary } from '@/lib/gameSession';
import { play } from '@/game/sfx';
import { Card, CardSection, PanelHead, Tag } from '@/components/ui/cards';
import { pixel } from '@/components/ui/kit';
import { C } from '@/lib/theme';
import { OssuarySection } from '@/components/OssuarySection';
import { WagerSection } from '@/components/WagerSection';

const SLOTS: { id: CosmeticSlot; label: string; hint: string }[] = [
  { id: 'title', label: 'TITLES', hint: 'Shown after your name in the tavern and on the ladder.' },
  { id: 'plate', label: 'NAMEPLATES', hint: 'The colour your name is written in.' },
  { id: 'trophy', label: 'TROPHIES', hint: 'Carried on your record. Everyone can see what you dug up.' },
  { id: 'aura', label: 'AURAS', hint: 'A light that follows you down the stair.' },
];

/** Şerit PNG'yi CSS ile oynat — 32×N kare, JS yok */
function stripStyle(src: string, frames: number, size: number, anim: string) {
  return {
    width: size, height: size,
    backgroundImage: `url(${src})`,
    backgroundSize: `${frames * 100}% 100%`,
    backgroundRepeat: 'no-repeat',
    animation: `${anim} ${(frames / 8).toFixed(2)}s steps(${frames}) infinite`,
    ...pixel,
  } as const;
}

function RarityTag({ r }: { r: Rarity }) {
  const d = RARITY[r];
  return (
    <span style={{
      fontSize: 8.5, fontWeight: 900, letterSpacing: 1.1, color: d.color,
      border: `1px solid ${d.color}55`, background: `${d.color}14`,
      padding: '2px 5px', borderRadius: 4, whiteSpace: 'nowrap',
    }}>{d.label}</span>
  );
}

/** Kozmetiğin kendisinin ÖNİZLEMESİ — her yuva kendi diliyle gösterilir */
function Preview({ def, owned, size = 46 }: { def: CosmeticDef; owned: boolean; size?: number }) {
  const dim = owned ? 1 : 0.28;

  if (def.trophy) {
    return (
      <div style={{
        width: size, height: size, display: 'grid', placeItems: 'center',
        opacity: dim, filter: owned ? 'none' : 'grayscale(1)',
      }}>
        <div style={stripStyle(def.trophy.src, def.trophy.frames, size - 6, 'gb-strip')} />
      </div>
    );
  }
  if (def.plate) {
    return (
      <div style={{ width: size, height: size, display: 'grid', placeItems: 'center', opacity: dim }}>
        <span style={{
          fontSize: 15, fontWeight: 900, letterSpacing: 0.5,
          background: `linear-gradient(90deg, ${def.plate.from}, ${def.plate.to})`,
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>Abc</span>
      </div>
    );
  }
  if (def.aura) {
    return (
      <div style={{ width: size, height: size, display: 'grid', placeItems: 'center', opacity: dim }}>
        <div style={{
          width: size - 12, height: size - 12, borderRadius: '50%',
          background: `radial-gradient(circle, ${def.aura.color}00 38%, ${def.aura.color}88 72%, ${def.aura.color}00 100%)`,
          border: `1px solid ${def.aura.color}55`,
        }} />
      </div>
    );
  }
  // title — yazının kendisi önizleme
  return (
    <div style={{
      width: size, height: size, display: 'grid', placeItems: 'center', opacity: dim,
      fontSize: 20, color: RARITY[def.rarity].color,
    }}>❝</div>
  );
}

export function ReliquaryPanel({ progress, onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError: (msg: string) => void;
}) {
  /** hangi sink görünüyor — üçü de gold'u ekonomiden çıkarır */
  const [view, setView] = useState<'relics' | 'monument' | 'wager'>('relics');
  const [tab, setTab] = useState<CosmeticSlot>('trophy');
  const [busy, setBusy] = useState(false);
  /** son çekilişin sonucu — açılış animasyonu bunu gösterir */
  const [reveal, setReveal] = useState<{ id: string; duplicate: boolean; dust: number } | null>(null);
  const [opening, setOpening] = useState(false);

  const owned = useMemo(() => new Set(progress.cosmetics), [progress.cosmetics]);
  const list = useMemo(() => cosmeticsInSlot(tab), [tab]);
  const slotInfo = SLOTS.find((s) => s.id === tab)!;

  // Sandık açılma animasyonu bitince sonucu göster
  useEffect(() => {
    if (!opening) return;
    const t = setTimeout(() => setOpening(false), 900);
    return () => clearTimeout(t);
  }, [opening]);

  const pull = useCallback(async () => {
    if (busy || progress.gold < PULL_COST) return;
    setBusy(true);
    setReveal(null);
    setOpening(true);
    try {
      const out = await pullReliquary(progress);
      onChange(out.progress);
      setReveal({ id: out.id, duplicate: out.duplicate, dust: out.dust });
      // Çekilen şeyin sekmesine geç — oyuncu ne kazandığını KOLEKSİYONDA görsün
      const def = cosmeticById(out.id);
      if (def) setTab(def.slot);
    } catch (e) {
      setOpening(false);
      onError(e instanceof Error ? e.message : 'The reliquary stayed shut.');
    } finally {
      setBusy(false);
    }
  }, [busy, progress, onChange, onError]);

  const dustBuy = useCallback(async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      onChange(await buyCosmeticWithDust(id, progress));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Not enough dust.');
    } finally { setBusy(false); }
  }, [busy, progress, onChange, onError]);

  const equip = useCallback(async (slot: CosmeticSlot, id: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      onChange(await equipCosmetic(slot, id, progress));
      play('equip');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not equip that.');
    } finally { setBusy(false); }
  }, [busy, progress, onChange, onError]);

  const collected = progress.cosmetics.length;
  const revealDef = reveal ? cosmeticById(reveal.id) : null;
  const canPull = progress.gold >= PULL_COST && !busy;

  return (
    <>
      {/* CSS animasyonları — şerit oynatma + açılma parlaması */}
      <style>{`
        @keyframes gb-strip { from { background-position-x: 0%; } to { background-position-x: 100%; } }
        @keyframes gb-chest { from { background-position-x: 0%; } to { background-position-x: 100%; } }
        @keyframes gb-pop { 0% { transform: scale(0.72); opacity: 0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
      `}</style>

      <PanelHead
        kicker="THE RELIQUARY" accent={C.candleSoft}
        title={view === 'relics' ? 'What the dead left behind'
          : view === 'monument' ? 'Your monument' : 'A bet with the dead'}
      />

      {/* ⚠️ ÜÇÜ AYNI BİNADA. Hepsi aynı işi yapıyor — gold'u ekonomiden
          ÇIKARMAK — ve dock zaten 7 kapıya ulaşmıştı. Ayrı binalar açmak
          oyuncuya üç ayrı sistem gibi görünürdü; oysa tek bir soru var:
          "kazandığın gold nereye gidiyor". */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {([
          { id: 'relics', label: 'RELICS' },
          { id: 'monument', label: 'MONUMENT' },
          { id: 'wager', label: 'THE WAGER' },
        ] as const).map((v) => {
          const on = view === v.id;
          return (
            <button key={v.id} onClick={() => setView(v.id)}
              style={{
                all: 'unset', cursor: 'pointer', flex: '1 1 90px', textAlign: 'center',
                padding: '8px 10px', borderRadius: 7,
                fontSize: 11, fontWeight: 900, letterSpacing: 1,
                color: on ? '#ffd9df' : C.boneFaint,
                background: on ? 'rgba(160,18,38,0.36)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${on ? 'rgba(228,101,122,0.5)' : 'rgba(255,255,255,0.10)'}`,
              }}>
              {v.label}
            </button>
          );
        })}
      </div>

      {view === 'monument' && (
        <OssuarySection progress={progress} onChange={onChange} onError={onError} />
      )}
      {view === 'wager' && (
        <WagerSection progress={progress} onChange={onChange} onError={onError} />
      )}
      {view === 'relics' && <>
      {/* ⚠️ Bu cümle KALDIRILAMAZ — oyuncu neye para verdiğini bilmeli */}
      <p style={{ margin: '0 0 14px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        Everything here is <strong style={{ color: C.bone }}>appearance only</strong> — no damage, no health,
        no advantage of any kind. Power is bought at the Forge. This is what you show for it.
      </p>

      {/* ── ÇEKİLİŞ ── */}
      <Card accent>
        <div style={{ padding: '13px 13px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Sandık — açılırken 9 kareli animasyon, dururken kapalı */}
            <div style={{ width: 64, height: 64, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {opening ? (
                <div style={{
                  ...stripStyle('/art/chests/spr_Chest_4_strip9.png', 9, 58, 'gb-chest'),
                  animation: 'gb-chest 0.9s steps(9) 1 forwards',
                }} />
              ) : (
                <div style={{
                  width: 58, height: 58, backgroundImage: 'url(/art/chests/spr_Chest_4_closed.png)',
                  backgroundSize: '100% 100%', ...pixel,
                }} />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.bone }}>Open a reliquary</div>
              <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 3, lineHeight: 1.45 }}>
                One relic per opening. Something you already own turns to dust.
              </div>
            </div>

            <button
              onClick={pull}
              disabled={!canPull}
              style={{
                all: 'unset', boxSizing: 'border-box', cursor: canPull ? 'pointer' : 'default',
                padding: '11px 16px', borderRadius: 8, textAlign: 'center', minWidth: 132,
                opacity: canPull ? 1 : 0.45,
                background: canPull
                  ? 'linear-gradient(180deg, rgba(160,18,38,0.5), rgba(120,12,28,0.34))'
                  : 'rgba(255,255,255,0.05)',
                border: `1px solid ${canPull ? 'rgba(228,101,122,0.6)' : 'rgba(255,255,255,0.12)'}`,
              }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: canPull ? '#ffd9df' : C.boneFaint }}>
                {busy ? 'OPENING…' : 'OPEN'}
              </div>
              <div style={{ fontSize: 10.5, color: C.candle, marginTop: 2 }}>
                {PULL_COST.toLocaleString('en-US')} gold
              </div>
            </button>
          </div>

          {/* Sonuç — açılma bitince belirir */}
          {reveal && revealDef && !opening && (
            <div style={{
              marginTop: 11, padding: '10px 11px', borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 11,
              background: `${RARITY[revealDef.rarity].color}12`,
              border: `1px solid ${RARITY[revealDef.rarity].color}44`,
              animation: 'gb-pop 0.34s ease-out',
            }}>
              <Preview def={revealDef} owned size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: C.bone }}>{revealDef.name}</span>
                  <RarityTag r={revealDef.rarity} />
                  {reveal.duplicate && <Tag>DUPLICATE</Tag>}
                </div>
                <div style={{ fontSize: 11, color: C.boneDim, marginTop: 3, lineHeight: 1.4 }}>
                  {reveal.duplicate
                    ? `You had this already. It crumbles into ${reveal.dust} dust.`
                    : revealDef.desc}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sayaçlar */}
        <div style={{
          display: 'flex', gap: 14, flexWrap: 'wrap', padding: '9px 13px',
          borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)',
        }}>
          <span style={{ fontSize: 11, color: C.boneDim }}>
            GOLD <strong style={{ color: C.candle }}>{progress.gold.toLocaleString('en-US')}</strong>
          </span>
          <span style={{ fontSize: 11, color: C.boneDim }}>
            DUST <strong style={{ color: C.ice }}>{progress.dust.toLocaleString('en-US')}</strong>
          </span>
          <span style={{ fontSize: 11, color: C.boneDim, marginLeft: 'auto' }}>
            COLLECTED <strong style={{ color: C.bone }}>{collected}/{COSMETICS.length}</strong>
          </span>
        </div>
      </Card>

      {/* ── KOLEKSİYON ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 8px' }}>
        {SLOTS.map((s) => {
          const has = cosmeticsInSlot(s.id).filter((c) => owned.has(c.id)).length;
          const on = tab === s.id;
          return (
            <button key={s.id} onClick={() => setTab(s.id)}
              style={{
                all: 'unset', cursor: 'pointer', padding: '6px 10px', borderRadius: 6,
                fontSize: 10.5, fontWeight: 900, letterSpacing: 0.9,
                color: on ? C.bone : C.boneFaint,
                background: on ? 'rgba(239,167,46,0.14)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${on ? `${C.candle}55` : 'rgba(255,255,255,0.10)'}`,
              }}>
              {s.label} <span style={{ color: on ? C.candle : C.boneFaint }}>{has}/{cosmeticsInSlot(s.id).length}</span>
            </button>
          );
        })}
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 11, color: C.boneFaint, lineHeight: 1.45 }}>{slotInfo.hint}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {list.map((def) => {
          const have = owned.has(def.id);
          const on = progress.equipped[def.slot] === def.id;
          const cost = RARITY[def.rarity].dustCost;
          const affordable = progress.dust >= cost;
          return (
            <Card key={def.id} accent={on} dim={!have}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px' }}>
                <Preview def={def} owned={have} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: have ? C.bone : C.boneFaint }}>
                      {def.slot === 'title' ? `“${def.name}”` : def.name}
                    </span>
                    <RarityTag r={def.rarity} />
                    {on && <Tag tone="gold">WORN</Tag>}
                  </div>
                  <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 3, lineHeight: 1.4 }}>
                    {have ? def.desc : `Not yet found · ${cost.toLocaleString('en-US')} dust to claim directly`}
                  </div>
                </div>

                {have ? (
                  <button onClick={() => equip(def.slot, on ? null : def.id)} disabled={busy}
                    style={{
                      all: 'unset', cursor: busy ? 'default' : 'pointer', flexShrink: 0,
                      padding: '7px 11px', borderRadius: 6, fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8,
                      color: on ? C.boneDim : '#ffd9df',
                      background: on ? 'rgba(255,255,255,0.06)' : 'rgba(160,18,38,0.4)',
                      border: `1px solid ${on ? 'rgba(255,255,255,0.14)' : 'rgba(228,101,122,0.5)'}`,
                    }}>
                    {on ? 'REMOVE' : 'WEAR'}
                  </button>
                ) : (
                  <button onClick={() => dustBuy(def.id)} disabled={busy || !affordable}
                    style={{
                      all: 'unset', cursor: affordable && !busy ? 'pointer' : 'default', flexShrink: 0,
                      padding: '7px 11px', borderRadius: 6, fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8,
                      opacity: affordable ? 1 : 0.4,
                      color: C.ice, background: 'rgba(138,151,163,0.14)',
                      border: '1px solid rgba(138,151,163,0.4)',
                    }}>
                    {cost.toLocaleString('en-US')} DUST
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <CardSection label="WHY THIS EXISTS">
        <span style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
          The Forge runs out. Gold does not. Everything you spend here leaves the economy for
          good — that is the point, and it is why the gold you earn keeps its worth.
        </span>
      </CardSection>
      </>}
    </>
  );
}
