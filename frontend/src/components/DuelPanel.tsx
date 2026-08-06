'use client';
// DÜELLO — arayüz.
//
// ⚠️ PANELİN ASIL İŞİ "NE OYNAYACAĞIMI BİLİYORUM" HİSSİ. Düello bir zar
// atışı değil: rakibin TAM OLARAK oynadığı koşuyu oynuyorsun ve hedef
// derinliği ÖNCEDEN görüyorsun. O yüzden her satırda hedef büyük yazılı —
// oyuncu neye girdiğini bilerek girmeli.
//
// ⚠️ ENGELLENEN RAKİP GİZLENMİYOR, SEBEBİ YAZILIYOR. Soğumadaki bir rakibi
// listeden çıkarmak "rakip kalmadı" hissi verirdi; sebebiyle göstermek
// "birazdan tekrar" der.

import { useCallback, useEffect, useState } from 'react';
import { DUEL, duelTier } from '@/game/duel';
import { stageById } from '@/game/config';
import { fetchDuels, type DuelBoard, type DuelRow } from '@/lib/gameSession';
import { getMode } from '@/lib/session';
import { Card, CardSection, PanelHead, Tag } from '@/components/ui/cards';
import { C, FONT, glass } from '@/lib/theme';

const kisa = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export function DuelPanel({ onChallenge, onError }: {
  onChallenge: (recordId: string) => void;
  onError: (msg: string) => void;
}) {
  const [board, setBoard] = useState<DuelBoard | null>(null);
  const [err, setErr] = useState(false);

  const yukle = useCallback(() => {
    fetchDuels().then(setBoard).catch(() => setErr(true));
  }, []);
  useEffect(() => { if (getMode() === 'wallet') yukle(); }, [yukle]);

  if (getMode() !== 'wallet') {
    return (
      <PanelHead kicker="THE ANSWERING" title="You answer a real run" accent={C.blood}
        sub="A duel is not a match against a bot — you play the exact run someone else played, seed for seed. Connect a wallet to be answered." />
    );
  }
  if (err) return <Note>Could not reach the records.</Note>;
  if (!board) return <Note>Reading the records…</Note>;

  const t = duelTier(board.me.rating);
  const kalanOdul = Math.max(0, DUEL.dailyRewarded - board.me.rewardedToday);

  return (
    <>
      <PanelHead kicker="THE ANSWERING" title="Play their run, go deeper" accent={C.blood}
        sub="You get their seed — the same enemies, in the same order. Beat their depth and you take their standing."
        right={<Tag tone="gold">{board.me.rating}</Tag>} />

      <div style={{ ...glass(10), padding: '11px 13px', marginBottom: 12, fontFamily: FONT.ui }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: t.color }}>{t.name}</span>
          <span style={{ fontSize: 12, color: C.boneFaint }}>
            {board.me.wins}W · {board.me.losses}L
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.boneFaint }}>
            {kalanOdul > 0
              ? `${kalanOdul} rewarded ${kalanOdul > 1 ? 'wins' : 'win'} left today`
              : 'no dust left today'}
          </span>
        </div>
        {/* ⚠️ TOZ TAVANI YAZILI OLMALI. Oyuncu dördüncü galibiyette toz
            gelmeyince "bozuk" sanır; kuralı önceden okuması gerekiyor. */}
        <div style={{ marginTop: 5, fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
          Duels pay standing, never gold. The first {DUEL.dailyRewarded} wins each
          day also pay {DUEL.dustPerWin} dust — after that you fight for the
          record alone.
        </div>
      </div>

      <CardSection label={`Records to answer — ${board.rows.length}`} tone={C.blood}>
        {board.rows.length === 0 ? (
          <div style={{ fontSize: 11.5, color: C.boneDim, lineHeight: 1.55 }}>
            Nobody has posted a descent yet. Finish one and yours becomes the
            record others have to answer.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {board.rows.map((r) => (
              <Row key={r.id} row={r} onChallenge={onChallenge} onError={onError} />
            ))}
          </div>
        )}
      </CardSection>

      {board.recent.length > 0 && (
        <CardSection label="Lately" tone={C.ice}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {board.recent.map((d, i) => (
              <div key={i} style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
                <span style={{ color: C.bone }}>{kisa(d.challenger)}</span>
                {d.won ? ' beat ' : ' failed against '}
                <span style={{ color: C.bone }}>{kisa(d.defender)}</span>
                {' — '}
                <span style={{ color: d.won ? C.ok : C.bloodSoft }}>
                  d{d.depth} vs d{d.target}
                </span>
              </div>
            ))}
          </div>
        </CardSection>
      )}
    </>
  );
}

function Row({ row, onChallenge, onError }: {
  row: DuelRow;
  onChallenge: (id: string) => void;
  onError: (m: string) => void;
}) {
  const t = duelTier(row.duelRating);
  const stage = stageById(row.stageId);
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px' }}>
        <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: t.color }} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: C.bone }}>{kisa(row.wallet)}</span>
            <Tag tone="dim">{t.name} {row.duelRating}</Tag>
          </span>
          <span style={{ display: 'block', fontSize: 10.5, color: C.boneFaint, lineHeight: 1.4 }}>
            {stage?.name ?? `Stage ${row.stageId}`} · {row.hero}
          </span>
        </span>
        {/* ⚠️ HEDEF EN BÜYÜK SAYI. Oyuncunun tek sorusu "kaçı geçmem lazım" —
            cevabı aramak zorunda kalmamalı. */}
        <span style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 900, color: C.candle, lineHeight: 1 }}>
            {row.depth}
          </span>
          <span style={{ fontSize: 9, color: C.boneFaint, letterSpacing: 0.8 }}>DEPTH</span>
        </span>
        <button
          onClick={() => (row.blocker ? onError(row.blocker) : onChallenge(row.id))}
          style={{
            all: 'unset', flexShrink: 0, cursor: 'pointer',
            padding: '7px 11px', borderRadius: 7, fontSize: 11, fontWeight: 900,
            letterSpacing: 0.8, textAlign: 'center',
            color: row.blocker ? C.boneFaint : '#ffd9df',
            background: row.blocker
              ? 'rgba(255,255,255,0.05)'
              : 'linear-gradient(180deg, rgba(160,18,38,0.45), rgba(120,12,28,0.32))',
            border: `1px solid ${row.blocker ? 'rgba(255,255,255,0.12)' : 'rgba(228,101,122,0.55)'}`,
          }}>
          ANSWER
        </button>
      </div>
      {/* Engel varsa SEBEBİ kartın içinde — tıklamadan önce okunsun */}
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
    <div style={{
      ...glass(9), padding: '16px 14px', fontSize: 12, color: C.boneFaint,
      textAlign: 'center', lineHeight: 1.6, fontFamily: FONT.ui,
    }}>
      {children}
    </div>
  );
}
