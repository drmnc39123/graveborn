'use client';
// TAVERN — oyuncunun sicili.
//
// Bu panel BUGÜN gerçek olabiliyor çünkü tüm veri zaten Progress'te duruyor;
// backend beklemesine gerek yok. Market/Exchange'in aksine burada uydurma bir
// "yakında" ekranı göstermek gereksiz olurdu.

import { useEffect, useMemo, useState } from 'react';
import { STAGES, depthGold } from '@/game/config';
import { FORGE, costOf, spentOn } from '@/game/forge';
import { paidDepth, type Progress } from '@/game/progress';
import { PixelButton } from '@/components/ui/kit';
import { fetchLeaderboard, type LeaderRow } from '@/lib/gameSession';
import { C, FONT, glass } from '@/lib/theme';

export function RecordsPanel({ progress }: { progress: Progress }) {
  const [tab, setTab] = useState<'record' | 'board'>('record');

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.blood, marginBottom: 4 }}>THE TAVERN</div>
      <h2 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 900, color: C.bone }}>
        {tab === 'record' ? 'Your record' : 'Deepest descents'}
      </h2>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <PixelButton variant="02A" scale={2} active={tab ==='record'} onClick={() => setTab('record')}
          style={{ flex: 1, fontSize: 11, fontWeight: 900, letterSpacing: 1.2 }}>
          MY RECORD
        </PixelButton>
        <PixelButton variant="02A" scale={2} active={tab ==='board'} onClick={() => setTab('board')}
          style={{ flex: 1, fontSize: 11, fontWeight: 900, letterSpacing: 1.2 }}>
          LEADERBOARD
        </PixelButton>
      </div>

      {tab === 'record' ? <MyRecord progress={progress} /> : <Leaderboard />}
    </>
  );
}

function MyRecord({ progress }: { progress: Progress }) {
  const stats = useMemo(() => {
    const cleared = STAGES.filter((s) => progress.cleared[s.id]).length;
    const deepest = Math.max(0, ...STAGES.map((s) => paidDepth(progress, s.id)));
    const forgeLevels = FORGE.reduce((n, u) => n + Math.min(progress.upgrades[u.id] ?? 0, u.maxLevel), 0);
    const forgeMax = FORGE.reduce((n, u) => n + u.maxLevel, 0);
    const spent = spentOn(progress.upgrades);
    // "Kazanılan toplam" ayrı tutulmuyor — harcanan + kalan ile türetiliyor.
    const earned = spent + Math.floor(progress.gold);
    // Bir sonraki alınabilir en ucuz yükseltme: "sırada ne var" sorusu
    let next: { name: string; cost: number } | null = null;
    for (const u of FORGE) {
      const lv = progress.upgrades[u.id] ?? 0;
      if (lv >= u.maxLevel) continue;
      const c = costOf(u, lv);
      if (!next || c < next.cost) next = { name: u.name, cost: c };
    }
    return { cleared, deepest, forgeLevels, forgeMax, spent, earned, next };
  }, [progress]);

  return (
    <>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        Everything the village knows about you.
      </p>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Stat label="Stages cleared" value={`${stats.cleared} / ${STAGES.length}`} />
        <Stat label="Deepest descent" value={stats.deepest > 0 ? `Depth ${stats.deepest}` : '—'} accent />
        <Stat label="Gold earned" value={stats.earned.toLocaleString('en-US')} accent />
        <Stat label="Gold in purse" value={Math.floor(progress.gold).toLocaleString('en-US')} />
        <Stat label="Spent at the Forge" value={stats.spent.toLocaleString('en-US')} />
        <Stat label="Forge levels" value={`${stats.forgeLevels} / ${stats.forgeMax}`} />
      </div>

      {/* Franuka Divider_03 mavi tonlu — gotik palete oturmuyor. Sade çizgi. */}
      <div style={{ margin: '16px 0 12px', borderTop: `1px solid ${C.border}` }} />

      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.6, color: C.boneFaint, marginBottom: 8 }}>
        THE DESCENT — BY ROAD
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {STAGES.map((s) => {
          const locked = !progress.cleared[s.id];
          const best = paidDepth(progress, s.id);
          return (
            <div key={s.id} style={{ ...glass(9), padding: '8px 11px', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center', gap: 10,
              opacity: locked ? 0.45 : 1, fontFamily: FONT.ui }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: C.bone }}>{s.id}. {s.name}</span>
              <span style={{ fontSize: 11.5, color: best > 0 ? C.candle : C.boneFaint, whiteSpace: 'nowrap' }}>
                {locked ? 'not cleared'
                  : best > 0 ? `depth ${best} · next pays ${depthGold(s.id, best + 1)}`
                  : `never entered · depth 1 pays ${depthGold(s.id, 1)}`}
              </span>
            </div>
          );
        })}
      </div>

      {stats.next && (
        <div style={{ marginTop: 14, ...glass(10), padding: '10px 12px', fontFamily: FONT.ui }}>
          <div style={{ fontSize: 10.5, color: C.boneFaint, letterSpacing: 1.2, fontWeight: 900 }}>CHEAPEST UPGRADE LEFT</div>
          <div style={{ fontSize: 13, color: C.bone, marginTop: 3 }}>
            {stats.next.name} — <span style={{ color: progress.gold >= stats.next.cost ? C.candle : C.boneFaint }}>
              {stats.next.cost.toLocaleString('en-US')} gold
            </span>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * LEADERBOARD — "en derine kim indi".
 *
 * ⚠️ Sıralama derinliğe DEĞİL zorluğa göre. Tabloda derinliği yazıyoruz ama
 * bölümü de yazmak ZORUNLU: yoksa "depth 40" ile "depth 12" yan yana durur ve
 * 12'nin neden üstte olduğu anlaşılmaz.
 */
function Leaderboard() {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [me, setMe] = useState<{ rank: number; row: LeaderRow } | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetchLeaderboard()
      .then((r) => { setRows(r.rows); setMe(r.me); })
      .catch(() => setErr(true));
  }, []);

  if (err) {
    return <Note>Could not reach the hall of records.</Note>;
  }
  if (rows === null) {
    return <Note>Reading the ledger…</Note>;
  }
  if (rows.length === 0) {
    return (
      <Note>
        No one has descended yet. Clear a stage, take the stairs down, and the
        first name on this board is yours.
      </Note>
    );
  }

  // Kendi satırım listede yoksa altta ayrıca göster — 50. sıranın dışındaki
  // oyuncuya tablo hiçbir şey söylemezdi.
  const inList = me !== null && rows.some((r) => r.wallet === me.row.wallet);

  return (
    <>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        Ranked by how hard the descent was, not how deep it counted. Depth 12 on
        a late road beats depth 40 on the first one.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {rows.map((r) => (
          <Line key={r.wallet} row={r} mine={me?.row.wallet === r.wallet} />
        ))}
      </div>

      {me && !inList && (
        <>
          <div style={{ margin: '10px 0 6px', textAlign: 'center', fontSize: 11, color: C.boneFaint, letterSpacing: 2 }}>· · ·</div>
          <Line row={me.row} mine />
        </>
      )}

      {/* Sırası olmayan oyuncuya tablo tek başına hiçbir şey söylemiyordu —
          ne yapması gerektiği yazmalı. */}
      {!me && (
        <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 9,
          border: `1px solid ${C.candle}44`, fontSize: 11.5, color: C.boneDim,
          textAlign: 'center', lineHeight: 1.5, fontFamily: FONT.ui }}>
          You have no place here yet. Clear a road, then take the stairs down.
        </div>
      )}
    </>
  );
}

function Line({ row, mine }: { row: LeaderRow; mine: boolean }) {
  const stage = STAGES.find((s) => s.id === row.stage);
  const medal = row.rank === 1 ? C.candle : row.rank <= 3 ? C.bone : C.boneFaint;
  return (
    <div style={{
      ...glass(9), padding: '8px 11px', display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: FONT.ui,
      border: `1px solid ${mine ? `${C.candle}66` : 'transparent'}`,
      background: mine ? 'rgba(239,167,46,0.10)' : undefined,
    }}>
      <span style={{ width: 30, flexShrink: 0, fontSize: 13, fontWeight: 900, color: medal }}>
        #{row.rank}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.bone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {mine ? 'You' : `${row.wallet.slice(0, 4)}…${row.wallet.slice(-4)}`}
      </span>
      <span style={{ flexShrink: 0, fontSize: 11.5, color: C.candle, fontWeight: 800 }}>
        Depth {row.depth}
      </span>
      <span style={{ flexShrink: 0, fontSize: 10.5, color: C.boneFaint, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {stage?.name ?? `Stage ${row.stage}`}
      </span>
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

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ ...glass(10), padding: '10px 12px', fontFamily: FONT.ui }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 900, color: accent ? C.candle : C.bone, marginTop: 3 }}>{value}</div>
    </div>
  );
}
