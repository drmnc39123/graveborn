'use client';
// TAKİP — arkadaş listesi arayüzü.
//
// ⚠️ LİSTE BİR "KİM NE YAPIYOR" EKRANI, bir isim listesi değil. Sadece
// isim göstermek değersiz olurdu; çevrimiçi mi, puanı ne ve BURADAN meydan
// okunabilir mi — asıl değer bunlarda.
//
// ⚠️ ÇEVRİMİÇİ OLANLAR ÜSTTE. Listenin işe yaradığı an tam olarak birinin
// çevrimiçi olduğu an; onu aşağıda aratmak listeyi ölü içeriğe çevirir.

import { useCallback, useEffect, useState } from 'react';
import { panelUnlocked } from '@/lib/testMode';
import { heroById } from '@/game/heroes';
import { duelTier } from '@/game/duel';
import { Portrait } from '@/components/HeroPicker';
import {
  addFollow, fetchFollows, removeFollow, type FollowRow, type FollowState,
} from '@/lib/gameSession';
import { getMode } from '@/lib/session';
import { Card, CardSection, PanelHead, Tag } from '@/components/ui/cards';
import { C, FONT, glass } from '@/lib/theme';

const kisa = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export function FollowPanel({ onChallenge, onError }: {
  onChallenge: (recordId: string) => void;
  onError: (msg: string) => void;
}) {
  const [st, setSt] = useState<FollowState | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [giris, setGiris] = useState('');

  const yukle = useCallback(() => {
    fetchFollows().then(setSt).catch(() => setErr(true));
  }, []);
  useEffect(() => { if (panelUnlocked(getMode())) yukle(); }, [yukle]);

  // ⚠️ Çevrimiçi durumu CANLI olmalı — 20 saniyede bir tazeleniyor.
  // Tek seferlik okuma, listeyi açtıktan bir dakika sonra yalan söylerdi.
  useEffect(() => {
    if (!panelUnlocked(getMode())) return;
    const id = setInterval(yukle, 20_000);
    return () => clearInterval(id);
  }, [yukle]);

  if (!panelUnlocked(getMode())) {
    return (
      <PanelHead kicker="THE WATCH" title="Keep an eye on people" accent={C.ice}
        sub="Watching lives in the village ledger, not on your device. Connect a wallet to keep a list." />
    );
  }
  if (err) return <Note>Could not read your watch list.</Note>;
  if (!st) return <Note>Reading the watch…</Note>;

  const sar = async (fn: () => Promise<FollowState>) => {
    if (busy) return;
    setBusy(true);
    try { setSt(await fn()); }
    catch (e) { onError(e instanceof Error ? e.message : 'Could not do that.'); }
    finally { setBusy(false); }
  };

  const cevrimici = st.rows.filter((r) => r.online).length;

  return (
    <>
      <PanelHead kicker="THE WATCH" title="Keep an eye on people" accent={C.ice}
        sub="Watching is one-way and needs no approval — everything shown here is already public on the ladder."
        right={<Tag tone={cevrimici > 0 ? 'ok' : 'dim'}>{cevrimici} ONLINE</Tag>} />

      <CardSection label={`Add someone — ${st.rows.length}/${st.max}`} tone={C.ice}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={giris} onChange={(e) => setGiris(e.target.value)}
            placeholder="paste a wallet address"
            style={{
              flex: 1, minWidth: 0, padding: '6px 9px', borderRadius: 6,
              border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)',
              color: C.bone, fontFamily: FONT.ui, fontSize: 12, outline: 'none',
            }} />
          <button
            disabled={busy || giris.trim().length < 8}
            onClick={() => sar(async () => {
              const r = await addFollow(giris.trim());
              setGiris('');
              return r;
            })}
            style={{
              all: 'unset', cursor: busy || giris.trim().length < 8 ? 'default' : 'pointer',
              padding: '6px 13px', borderRadius: 6, fontSize: 11.5, fontWeight: 900,
              color: giris.trim().length < 8 ? C.boneFaint : '#1a0508',
              background: giris.trim().length < 8
                ? 'rgba(227,216,192,0.07)'
                : `linear-gradient(180deg, ${C.candleSoft}, ${C.candle})`,
            }}>
            WATCH
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
          Wallet addresses show up in the square, on the ladder and after every
          duel — copy one from there.
        </div>
      </CardSection>

      <CardSection label="Watching" tone={C.bone}>
        {st.rows.length === 0 ? (
          <div style={{ fontSize: 11.5, color: C.boneDim, lineHeight: 1.55 }}>
            Nobody yet. Beat someone in a duel and their name is right there in
            the record.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {st.rows.map((r) => (
              <Row key={r.wallet} row={r} busy={busy}
                onChallenge={onChallenge}
                onError={onError}
                onDrop={() => sar(() => removeFollow(r.wallet))} />
            ))}
          </div>
        )}
      </CardSection>
    </>
  );
}

function Row({ row, busy, onChallenge, onError, onDrop }: {
  row: FollowRow; busy: boolean;
  onChallenge: (id: string) => void;
  onError: (m: string) => void;
  onDrop: () => void;
}) {
  const t = duelTier(row.duelRating);
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px' }}>
        {/* ⚠️ Çevrimiçi noktası portrenin YANINDA, satırın sonunda değil:
            göz önce yüze gidiyor, durumu orada görmeli. */}
        <span style={{ position: 'relative', flexShrink: 0 }}>
          <Portrait hero={heroById(row.hero)} size={38} frame={false} />
          <span style={{
            position: 'absolute', right: 0, bottom: 2, width: 8, height: 8,
            borderRadius: 5, border: `1px solid ${C.void}`,
            background: row.online ? C.ok : 'rgba(125,117,101,0.7)',
          }} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: C.bone }}>{kisa(row.wallet)}</span>
            <Tag tone="dim">{t.name} {row.duelRating}</Tag>
          </span>
          <span style={{ display: 'block', fontSize: 10.5, color: C.boneFaint, lineHeight: 1.4 }}>
            {row.bestDepth > 0
              ? `deepest: stage ${row.bestStage} · depth ${row.bestDepth}`
              : 'no descent recorded'}
          </span>
        </span>

        {/* ⚠️ MEYDAN OKUMA BURADAN. Listeyi açıp sonra düello paneline
            gitmek zorunda kalmak, listeyi süse çevirirdi. */}
        <button
          onClick={() => (row.blocker
            ? onError(row.blocker)
            : row.recordId && onChallenge(row.recordId))}
          disabled={busy}
          style={{
            all: 'unset', flexShrink: 0, cursor: 'pointer',
            padding: '6px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 900,
            color: row.blocker ? C.boneFaint : '#ffd9df',
            background: row.blocker
              ? 'rgba(255,255,255,0.05)'
              : 'linear-gradient(180deg, rgba(160,18,38,0.45), rgba(120,12,28,0.32))',
            border: `1px solid ${row.blocker ? 'rgba(255,255,255,0.12)' : 'rgba(228,101,122,0.55)'}`,
          }}>
          {/* ⚠️ ETİKET TERS OKUNUYORDU. Kural `recordDepth > 0 ? 'd37' :
              'ANSWER'` idi; yani CEVAPLANABİLİR satır bir SAYI gösteriyordu
              ("d37" — düğmeye değil etikete benziyor), cevaplanamayan satır
              ise "ANSWER" diyordu (eyleme çağrı gibi okunuyor, ama basınca
              yalnız engeli söylüyor). İki durum da yanlış tarafa işaret
              ediyordu.
              Artık düğme NE OLACAĞINI yazıyor; koşu yoksa bunu söylüyor ve
              engel varsa sebebi zaten hemen altında duruyor. */}
          {row.recordDepth > 0 ? `ANSWER d${row.recordDepth}` : 'NO RUN YET'}
        </button>
        <button onClick={onDrop} disabled={busy} title="Stop watching"
          style={{
            all: 'unset', flexShrink: 0, cursor: 'pointer', padding: '6px 8px',
            fontSize: 12, color: C.boneFaint,
          }}>
          ✕
        </button>
      </div>
      {row.blocker && (
        <div style={{ padding: '0 11px 8px', fontSize: 10.5, color: C.boneFaint }}>
          {row.blocker}
        </div>
      )}
    </Card>
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
