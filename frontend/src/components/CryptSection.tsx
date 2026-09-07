'use client';
// THE CRYPT DEED — mezar sahipliği.
//
// ⚠️ ARAYÜZÜN İLK İŞİ NE OLMADIĞINI SÖYLEMEK. Oyuncu "pasif gelir" görünce
// gold basıldığını sanar; oysa kasa her gold sink'inin %10'undan doluyor ve
// içine girmemiş gold çıkamıyor. Bu cümle kaldırılamaz — ekonomiye güven
// tam olarak böyle şeylerin açıkça yazılmasıyla kuruluyor.

import { useCallback, useEffect, useState } from 'react';
import { panelUnlocked } from '@/lib/testMode';
import {
  CRYPT_CUT, CRYPT_WEEKLY_CAP, cryptDraw, cryptPaybackWeeks, cryptTier,
  cryptUpgradeCost, cryptWeeklyCap, nextCryptTier,
} from '@/game/crypt';
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

  /**
   * Bu hafta çekilebilecek pay — sunucudaki hesabın AYNISI (saf fonksiyon,
   * `@game/crypt`). ⚠️ Tavan dahil: arayüz tavansız bir sayı gösterip sunucu
   * daha azını ödeseydi oyuncu soyulduğunu düşünürdü.
   */
  const cekim = cryptDraw(state.vault.balance, suanki, state.vault.totalWeight);
  const payim = cekim.amount;
  const cekilebilir = sahip > 0 && (state.me?.claimedWeek ?? 0) < state.week && payim > 0;

  /**
   * ⚠️ SATIN ALMA ÖNCESİ DÜRÜST TAHMİN. Oyuncu 220.000 gold'u neye verdiğini
   * ÖNCEDEN bilmeli. Tahmin, sonraki kademe alınmış gibi hesaplanıyor:
   * ağırlık havuza EKLENİYOR, yani sayı kendi katılımını da hesaba katıyor.
   * Kendi ağırlığını eklemeyen bir tahmin her zaman fazla söz verirdi.
   */
  const sonrakiCekim = sonraki
    ? cryptDraw(
        state.vault.balance, sonraki,
        state.vault.totalWeight - (suanki?.weight ?? 0) + sonraki.weight,
      )
    : null;
  const sonrakiHafta = sonraki && sonrakiCekim
    ? cryptPaybackWeeks(sonraki, sonrakiCekim.amount)
    : Infinity;

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
      {/* ⚠️ BU BÖLÜM KALDIRILAMAZ — bkz. dosya başlığı.
          Oyuncu 220.000 gold'u neye verdiğini ÖNCEDEN, tam olarak bilmeli:
          nereden doluyor · nasıl bölüşülüyor · haftalık tavan ne · ne kadar
          sürede kendini öder. Dördü de aşağıda YAZILI. */}
      <div style={{ ...glass(9), padding: '12px 13px', marginBottom: 12, fontFamily: FONT.ui }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.6, color: C.ice, marginBottom: 8 }}>
          HOW THE CRYPT PAYS
        </div>
        {/* ⚠️ İLK CÜMLE NE OLMADIĞINI SÖYLÜYOR: "pasif gelir" gören oyuncu
            gold basıldığını sanar ve ekonomiye güveni gider. */}
        <p style={{ margin: '0 0 9px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
          A deed does <strong style={{ color: C.bone }}>not print gold</strong>. Nothing
          comes out of the vault that did not go into it.
        </p>
        <Kural n={1} baslik="The vault fills from what the village burns">
          {Math.round(CRYPT_CUT * 100)}% of every gold you spend and never get back drops
          into the vault — forge, charms, pulls, the monument, wagers, pets, guilds,
          reforging. A listing you cancel does not count, and neither does buying a deed.
        </Kural>
        <Kural n={2} baslik="Holders split it by weight, once a week">
          A higher tier holds a heavier claim. Your share is your weight over the weight
          of every deed in the village, so the fewer deeds there are, the larger each one
          draws.
        </Kural>
        <Kural n={3} baslik={`No deed draws more than ${Math.round(CRYPT_WEEKLY_CAP * 100)}% of its price in a week`}>
          {/* ⚠️ TAVANIN GEREKÇESİ AÇIKÇA YAZILI: oyuncu bir kısıtı ancak
              sebebini bilirse adil bulur. */}
          Whatever the vault holds, a draw is capped. This keeps the first holder from
          emptying weeks of savings in one claim — so a deed is a long hold, never a flip,
          and it can never pay for itself in under {Math.round(1 / CRYPT_WEEKLY_CAP)} weeks.
          What is not drawn stays in the vault for the weeks after.
        </Kural>
      </div>

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
            {/* ⚠️ TAVAN DEVREDEYSE SESSİZ KALINMAZ. Oyuncu kasada 500.000
                gördükten sonra 22.000 çekerse ve sebebi yazmıyorsa, sistemin
                onu kandırdığını düşünür. Kesilen miktar da yazılıyor —
                "kaybolmadı, kasada duruyor" cümlesiyle birlikte. */}
            {cekim.capped && cekim.share > 0 && (
              <div style={{
                marginTop: 7, padding: '6px 8px', borderRadius: 5,
                border: `1px solid ${C.ice}33`, background: `${C.ice}0e`,
                fontSize: 10.5, color: C.boneDim, lineHeight: 1.45,
              }}>
                Capped at {cekim.cap.toLocaleString('en-US')} — {Math.round(CRYPT_WEEKLY_CAP * 100)}% of
                what this deed cost. The other {(cekim.share - cekim.cap).toLocaleString('en-US')} stays
                in the vault for later weeks.
              </div>
            )}
            {/* Tavan yokken de beklenti dürüst kurulmalı */}
            {!cekim.capped && payim > 0 && suanki && (
              <div style={{ marginTop: 6, fontSize: 10.5, color: C.boneFaint }}>
                At this rate the deed pays for itself in{' '}
                <strong style={{ color: C.bone }}>
                  {Math.ceil(cryptPaybackWeeks(suanki, payim))} weeks
                </strong>
                {' '}· weekly ceiling {cryptWeeklyCap(suanki).toLocaleString('en-US')}
              </div>
            )}
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
            {/* ⚠️ SATIN ALMADAN ÖNCE NE ALDIĞINI GÖSTER. Rakam bugünkü kasaya
                ve bugünkü tapu sayısına göre; ikisi de değişir, o yüzden
                "şu anda" diye yazılıyor — tahmin olduğu söylenmeden verilen
                bir sayı bir SÖZDÜR ve tutulamaz. */}
            {sonrakiCekim && (
              <div style={{
                marginTop: 8, padding: '7px 9px', borderRadius: 5,
                border: `1px solid ${C.candle}30`, background: `${C.candle}0e`,
                fontSize: 11, color: C.boneDim, lineHeight: 1.5,
              }}>
                {sonrakiCekim.amount > 0 ? (
                  <>
                    At the vault&apos;s present size this deed would draw about{' '}
                    <strong style={{ color: C.candle }}>
                      {sonrakiCekim.amount.toLocaleString('en-US')} gold
                    </strong>{' '}
                    a week — roughly{' '}
                    <strong style={{ color: C.bone }}>
                      {Number.isFinite(sonrakiHafta) ? Math.ceil(sonrakiHafta) : '∞'} weeks
                    </strong>{' '}
                    to pay for itself. Both numbers move with how much the village spends
                    and how many deeds are held.
                  </>
                ) : (
                  <>The vault is empty right now, so a deed would draw nothing this week.
                    It fills as the village spends.</>
                )}
              </div>
            )}
            {!alabilir && progress.gold < bedel && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.badText }}>
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

/** Numaralı kural satırı — üç cümlelik anlatımın tek biçimi */
function Kural({ n, baslik, children }: {
  n: number; baslik: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 9, marginTop: 8 }}>
      <span style={{
        flexShrink: 0, width: 17, height: 17, borderRadius: 4, display: 'grid',
        placeItems: 'center', fontSize: 9.5, fontWeight: 900, color: C.candle,
        border: `1px solid ${C.candle}55`, background: `${C.candle}12`,
      }}>{n}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 900, color: C.bone, lineHeight: 1.35 }}>{baslik}</div>
        <div style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5, marginTop: 2 }}>{children}</div>
      </div>
    </div>
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
