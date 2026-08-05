'use client';
// THE MARKETPLACE — oyuncudan oyuncuya gold ↔ $GRAVE.
//
// ⚠️ EV TAKASI DEĞİL. Hazine sabit kurdan gold almaz; token DAİMA başka bir
// oyuncunun cüzdanından gelir. Panel hiçbir yerde "swap" demez.
//
// ⚠️ Fiyat METİN olarak taşınır. Token en küçük birimi 2^53'ü kolayca aşar;
// Number'a çevirmek sessizce yuvarlar. Burada tek bir yerde bile
// parseFloat/Number kullanılmıyor.

import { useCallback, useEffect, useState } from 'react';
import {
  cancelGoldListing, fetchListings, fetchMyListings, listGold,
  marketAvailable, type Listing,
} from '@/lib/gameSession';
import type { Progress } from '@/game/progress';
import { Card, PanelHead, Tag } from '@/components/ui/cards';
import { play } from '@/game/sfx';
import { C, glass } from '@/lib/theme';

const MIN_GOLD = 50;
const MAX_LISTINGS = 10;

/** Cüzdan adresini kısalt — tam adres panelde yer kaplıyor, kimlik için 8 hane yeter */
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

/**
 * BİRİM FİYAT — emir defterinin en önemli sayısı, ve eksikti.
 *
 * ⚠️ "2.500 gold / 12.000 $GRAVE" ile "800 gold / 3.900 $GRAVE" yan yana
 * durunca hangisinin ucuz olduğu görünmüyor; oyuncunun kafadan bölmesi
 * gerekiyordu. Bir emir defterinin tek işi karşılaştırma sunmaktır.
 *
 * ⚠️ Burada `Number()` kullanmak GÜVENLİ, çünkü sonuç yalnızca EKRANA
 * yazılıyor. Fiyatın kendisi her katmanda metin/BigInt kalır (2^53 tuzağı);
 * bu değerle asla işlem yapılmaz.
 */
function unitPrice(goldAmount: number, priceGrave: string): string {
  const p = Number(priceGrave);
  if (!Number.isFinite(p) || goldAmount <= 0) return '—';
  const per = p / goldAmount;
  if (per >= 100) return `${Math.round(per).toLocaleString('en-US')} per gold`;
  if (per >= 1) return `${per.toFixed(2)} per gold`;
  return `${per.toFixed(4)} per gold`;
}

/** Emir defteri satırı — hem kendi ilanlarım hem açık ilanlar aynı kartı kullanır */
function ListingRow({ listing: l, mine = false, action }: {
  listing: Listing;
  mine?: boolean;
  action: React.ReactNode;
}) {
  return (
    <Card accent={mine}>
      <div style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 900, fontSize: 14, color: mine ? C.candle : C.bone }}>
              {l.goldAmount.toLocaleString('en-US')} GOLD
            </span>
            <span style={{ fontSize: 11.5, color: C.boneDim }}>
              for {Number(l.priceGrave).toLocaleString('en-US')} $GRAVE
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
            <Tag tone="gold">{unitPrice(l.goldAmount, l.priceGrave)}</Tag>
            {!mine && <span style={{ fontSize: 10, color: C.boneFaint }}>{short(l.seller)}</span>}
            {mine && <Tag>IN ESCROW</Tag>}
          </div>
        </div>
        {action}
      </div>
    </Card>
  );
}

/** Sunucu hata kodları oyuncuya İngilizce anlatılır */
const ERR: Record<string, string> = {
  yetersiz_gold: 'Not enough gold — some of it may already be listed.',
  gecersiz_miktar: `Minimum listing is ${MIN_GOLD} gold, whole numbers only.`,
  gecersiz_fiyat: 'Set a price above zero.',
  ilan_siniri: `You can hold ${MAX_LISTINGS} active listings at a time.`,
  ilan_yok: 'That listing is no longer active.',
  token_yok: '$GRAVE has not launched yet — buying opens with the token.',
  oturum_yok: 'Connect your wallet to trade.',
};
const humanise = (e: unknown) => {
  const code = e instanceof Error ? e.message : String(e);
  return ERR[code] ?? 'Something went wrong. Try again.';
};

export function MarketPanel({
  progress, onChange,
}: {
  progress: Progress;
  onChange: (p: Progress) => void;
}) {
  const canTrade = marketAvailable();

  const [book, setBook] = useState<Listing[]>([]);
  const [mine, setMine] = useState<Listing[]>([]);
  const [escrow, setEscrow] = useState(0);
  const [tokenLive, setTokenLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [b, m] = await Promise.all([fetchListings(), fetchMyListings()]);
      setBook(b.listings);
      setTokenLive(b.tokenEnabled);
      setMine(m.listings.filter((l) => l.status === 'active'));
      setEscrow(m.escrowedGold);
    } catch {
      setErr('Could not reach the market.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const submit = async () => {
    setErr(null);
    // ⚠️ Miktar sayı olabilir (gold Int), fiyat ASLA — metin kalır.
    const gold = Number(amount);
    if (!Number.isInteger(gold) || gold < MIN_GOLD) { setErr(ERR.gecersiz_miktar); return; }
    if (!/^\d{1,30}$/.test(price) || /^0+$/.test(price)) { setErr(ERR.gecersiz_fiyat); return; }
    if (gold > progress.gold) { setErr(ERR.yetersiz_gold); return; }

    setBusy(true);
    try {
      const out = await listGold(gold, price);
      play('buy');
      onChange(out.progress);
      setEscrow(out.escrowedGold);
      setAmount(''); setPrice('');
      await refresh();
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setErr(null); setBusy(true);
    try {
      const out = await cancelGoldListing(id);
      onChange(out.progress);
      setEscrow(out.escrowedGold);
      await refresh();
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PanelHead
        kicker="THE MARKETPLACE" accent={C.ice}
        title="Player to player"
      />
      <p style={{ margin: '0 0 10px', fontSize: 12, color: C.boneFaint, lineHeight: 1.5 }}>
        Sell your gold to another player for $GRAVE. The game never mints the token — every coin
        comes out of someone else’s wallet.
      </p>

      {/* Bakiye + escrow. Escrow'u GÖSTERMEK şart: gold "kaybolmuş" gibi
          görünmesin, nerede beklediği yazsın. */}
      <div style={{
        ...glass(10), padding: '9px 12px', marginBottom: 10,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 17, fontWeight: 900, color: C.candle }}>
          {Math.floor(progress.gold)} GOLD
        </span>
        <span style={{ fontSize: 10.5, color: C.boneFaint, textAlign: 'right' }}>
          {escrow > 0 ? `${escrow} gold held in escrow` : 'nothing listed'}<br />
          {mine.length}/{MAX_LISTINGS} active listings
        </span>
      </div>

      {!canTrade && (
        <div style={{
          ...glass(10), padding: '10px 12px', marginBottom: 10,
          border: `1px solid ${C.blood}55`, fontSize: 12, color: C.boneDim, lineHeight: 1.5,
        }}>
          <b style={{ color: C.bone }}>Demo gold cannot be sold.</b> It lives only in this browser and
          never enters the economy. Connect a wallet to trade.
        </div>
      )}

      {/* ── İlan aç ── */}
      {canTrade && (
        <div style={{ ...glass(10), padding: '11px 12px', marginBottom: 12, border: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 900, fontSize: 13, color: C.bone, marginBottom: 8 }}>List gold</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 120px', minWidth: 0 }}>
              <div style={{ fontSize: 10.5, color: C.boneFaint, marginBottom: 3 }}>GOLD (min {MIN_GOLD})</div>
              <input
                value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric" placeholder="500"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
                  border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)',
                  color: C.bone, fontSize: 13, fontWeight: 700, outline: 'none',
                }} />
            </label>
            <label style={{ flex: '1 1 120px', minWidth: 0 }}>
              <div style={{ fontSize: 10.5, color: C.boneFaint, marginBottom: 3 }}>PRICE IN $GRAVE</div>
              <input
                value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric" placeholder="1000"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
                  border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)',
                  color: C.bone, fontSize: 13, fontWeight: 700, outline: 'none',
                }} />
            </label>
          </div>

          <button onClick={submit} disabled={busy}
            style={{
              width: '100%', marginTop: 9, padding: '9px 12px', borderRadius: 9, border: 'none',
              cursor: busy ? 'default' : 'pointer', fontWeight: 900, fontSize: 13,
              color: busy ? C.boneFaint : '#1a0508',
              background: busy ? 'rgba(255,255,255,0.06)'
                : `linear-gradient(180deg, ${C.candleSoft}, ${C.candle})`,
            }}>
            {busy ? 'WORKING…' : 'LIST FOR SALE'}
          </button>

          <div style={{ fontSize: 10.5, color: C.boneFaint, marginTop: 7, lineHeight: 1.45 }}>
            Listed gold leaves your balance immediately and waits in escrow. Cancel any time to get
            it back. {tokenLive ? 'A 5% fee applies on sale — half of it burned.' : ''}
          </div>
        </div>
      )}

      {/* ── Kendi ilanlarım ── */}
      {mine.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.6, color: C.boneDim, marginBottom: 6 }}>
            YOUR LISTINGS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {mine.map((l) => (
              <ListingRow key={l.id} listing={l} mine
                action={
                  <button onClick={() => cancel(l.id)} disabled={busy}
                    style={{
                      flexShrink: 0, padding: '7px 11px', borderRadius: 8,
                      border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.06)',
                      color: C.boneDim, fontWeight: 900, fontSize: 11.5,
                      cursor: busy ? 'default' : 'pointer',
                    }}>
                    CANCEL
                  </button>
                } />
            ))}
          </div>
        </div>
      )}

      {/* ── Emir defteri ── */}
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.6, color: C.boneDim, marginBottom: 6 }}>
        OPEN LISTINGS
      </div>

      {loading ? (
        <div style={{ ...glass(9), padding: '14px 12px', fontSize: 12, color: C.boneFaint, textAlign: 'center' }}>
          Reading the ledger…
        </div>
      ) : book.length === 0 ? (
        <div style={{ ...glass(9), padding: '14px 12px', fontSize: 12, color: C.boneFaint, textAlign: 'center', lineHeight: 1.5 }}>
          Nothing listed yet. Be the first — set your own price.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {book.map((l) => (
            <ListingRow key={l.id} listing={l}
              action={
                /* Token yokken sahte bir "BUY" düğmesi göstermek, oyuncuyu
                   olmayan bir işleme sokmak olurdu. Durum açıkça yazılıyor. */
                <span style={{
                  flexShrink: 0, padding: '7px 11px', borderRadius: 8, fontWeight: 900, fontSize: 10.5,
                  color: C.boneFaint, background: 'rgba(255,255,255,0.05)', letterSpacing: 0.6,
                }}>
                  {tokenLive ? 'BUY' : 'AWAITING $GRAVE'}
                </span>
              } />
          ))}
        </div>
      )}

      {err && (
        <div style={{
          marginTop: 10, padding: '9px 11px', borderRadius: 9,
          border: `1px solid ${C.blood}66`, background: 'rgba(120,20,30,0.18)',
          fontSize: 12, color: C.bone,
        }}>
          {err}
        </div>
      )}
    </>
  );
}
