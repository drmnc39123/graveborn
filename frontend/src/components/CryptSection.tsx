'use client';
// THE CRYPT DEED — mezar sahipliği.
//
// ⚠️ ARAYÜZÜN İLK İŞİ NE OLMADIĞINI SÖYLEMEK. Oyuncu "pasif gelir" görünce
// gold basıldığını sanar; oysa kasa her gold sink'inin %10'undan doluyor ve
// içine girmemiş gold çıkamıyor. Bu cümle kaldırılamaz — ekonomiye güven
// tam olarak böyle şeylerin açıkça yazılmasıyla kuruluyor.

import { useCallback, useEffect, useState } from 'react';
import { panelUnlocked } from '@/lib/testMode';
import { CRYPT_CUT, cryptShare, cryptTier, cryptUpgradeCost, nextCryptTier } from '@/game/crypt';
import type { Progress } from '@/game/progress';
import { buyCryptDeed, claimCrypt, fetchCrypt, type CryptState } from '@/lib/gameSession';
import { getMode } from '@/lib/session';
import { Card, CardSection, Tag } from '@/components/ui/cards';
import { PixelButton, BTN } from '@/components/ui/kit';
import { C, FONT, glass } from '@/lib/theme';

export function CryptSection({ progress, onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError: (msg: string) => void;
}) {
  const [state, setState] = useState<CryptState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const yukle = useCallback(() => {
    fetchCrypt().then(setState).catch(() => setErr(true));
  }, []);
  useEffect(() => { if (panelUnlocked(getMode())) yukle(); }, [yukle]);

  // ⚠️ Demo modunda sunucu yok — sahte kasa göstermek yerine dürüst ol.
  if (!panelUnlocked(getMode())) {
    return (
      <Note>
        The Crypt is kept in the village ledger, not on your device. Connect a wallet
        to hold a deed.
      </Note>
    );
  }
  if (err) return <Note>Could not reach the sexton&apos;s office.</Note>;
  if (!state) return <Note>Reading the deed book…</Note>;

  const sahip = state.me?.tier ?? 0;
  const suanki = cryptTier(sahip);
  const sonraki = nextCryptTier(sahip);
  const bedel = cryptUpgradeCost(sahip);
  const alabilir = !!sonraki && progress.gold >= bedel && !busy;

  // Bu hafta çekilebilecek pay — sunucudaki hesabın AYNISI (saf fonksiyon).
  const payim = suanki
    ? cryptShare(state.vault.balance, suanki.weight, state.vault.totalWeight)
    : 0;
  const cekilebilir = sahip > 0 && (state.me?.claimedWeek ?? 0) < state.week && payim > 0;

  const satinAl = async () => {
    if (!alabilir) return;
    setBusy(true);
    try {
      const r = await buyCryptDeed();
      onChange(r.progress);
      yukle();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'The sexton refused the deed.');
    } finally { setBusy(false); }
  };

  const cek = async () => {
    if (!cekilebilir || busy) return;
    setBusy(true);
    try {
      const r = await claimCrypt();
      onChange(r.progress);
      yukle();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Nothing to draw this week.');
    } finally { setBusy(false); }
  };

  return (
    <>
      {/* ⚠️ BU PARAGRAF KALDIRILAMAZ — bkz. dosya başlığı */}
      <p style={{ margin: '0 0 12px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        {/* ⚠️ "EVERY purchase" YAZIYORDU ve YANLIŞTI. Kasayı besleyen türler
            `crypt.ts` SINK_KINDS'ta sayılı: Forge, tılsım, Reliquary, anıt,
            bahis, lonca, beceri. DIŞARIDA kalanlar var ve ikisinin gerekçesi
            YOKTU — `pet` (bağlama 800–8.000 G, ikinci yuva 40.000 G) ve
            `reforge`. Panel bunları da içeriyormuş gibi anlatıyordu.
            Metin artık kapsamı söylüyor; hangi türün kasaya gireceği
            ekonomi kararı ve `crypt.ts`te açık not olarak duruyor. */}
        A deed does <strong style={{ color: C.bone }}>not print gold</strong>. Gold spent at
        the Forge, the Stall, the Reliquary, your monument, the wager, your guild and your
        paths drops {Math.round(CRYPT_CUT * 100)}% into the crypt vault,
        and deed holders share what is in it. Nothing comes out that did not go in.
      </p>

      {/* Kasanın hâli */}
      <div style={{ ...glass(10), padding: '11px 13px', marginBottom: 12, fontFamily: FONT.ui }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.6, color: C.ice }}>
            THE VAULT
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 900, color: C.candle }}>
            {state.vault.balance.toLocaleString('en-US')}
          </span>
          <span style={{ fontSize: 11, color: C.boneFaint }}>gold</span>
        </div>
        <div style={{ marginTop: 5, fontSize: 11, color: C.boneFaint }}>
          {state.vault.owners === 0
            ? 'No deeds held yet — the first holder takes the whole vault.'
            : `Shared by ${state.vault.owners} deed${state.vault.owners === 1 ? '' : 's'}.`}
        </div>
      </div>

      {/* Çekim */}
      {sahip > 0 && (
        <Card accent={cekilebilir}>
          <div style={{ padding: '11px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.bone }}>{suanki?.name}</span>
              <Tag tone="gold">TIER {sahip}</Tag>
              <span style={{ marginLeft: 'auto' }}>
                {/* ⚠️ BTN.strong — haftada BİR çekiliyor, geri alınamaz. */}
                <PixelButton variant={BTN.strong} scale={2} disabled={!cekilebilir} onClick={cek}>
                  {cekilebilir ? `DRAW ${payim.toLocaleString('en-US')}` : 'DRAWN'}
                </PixelButton>
              </span>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: C.boneFaint, lineHeight: 1.45 }}>
              {cekilebilir
                ? 'Your share of this week\'s vault. One draw per week.'
                : payim > 0 ? 'Already drawn this week. It fills again as the village spends.'
                  : 'The vault is empty. It fills when anyone buys anything.'}
            </div>
          </div>
        </Card>
      )}

      {/* Kademeler */}
      <CardSection label={sahip > 0 ? 'Deeper ground' : 'Buy a plot'} tone={C.candle}>
        {sonraki ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.bone }}>{sonraki.name}</span>
              <Tag>WEIGHT ×{sonraki.weight}</Tag>
              <span style={{ marginLeft: 'auto' }}>
                {/* ⚠️ BTN.buy — tapu GOLD ile alınıyor; altın doku her yerde aynı şeyi der. */}
                <PixelButton variant={BTN.buy} scale={2} disabled={!alabilir} onClick={satinAl}>
                  {bedel.toLocaleString('en-US')} G
                </PixelButton>
              </span>
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: C.boneDim, lineHeight: 1.5 }}>
              {sonraki.blurb}
            </div>
            {!alabilir && progress.gold < bedel && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.bad }}>
                {(bedel - progress.gold).toLocaleString('en-US')} more gold needed
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: C.boneDim }}>
            You hold the deepest deed the village has to give.
          </div>
        )}
      </CardSection>
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...glass(9), padding: '16px 14px', fontSize: 12, color: C.boneFaint,
      textAlign: 'center', lineHeight: 1.6, fontFamily: FONT.ui }}>
      {children}
    </div>
  );
}
