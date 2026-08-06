'use client';
// DÜELLO BRİFİNGİ — girmeden ÖNCE ne olduğunu gösteren ekran.
//
// ⚠️ NİYE VAR: düello düğmesine basınca oyuncu doğrudan koşuya düşüyordu.
// Kime karşı oynadığını, hedefin ne olduğunu, kuralların ne olduğunu ve
// hangi kahramanla girdiğini göremeden. Bir maçın en önemli kararları
// BAŞLAMADAN ÖNCE veriliyor; ekran o kararların verildiği yer olmalı.
//
// ⚠️ KAHRAMAN SEÇİMİ BURADA ve bunun teknik bir sebebi de var: sunucu
// koşuyu açarken kayıttaki `hero`'yu okuyor (`/duel/start` → `p.hero`).
// Yani kahraman koşu AÇILMADAN ÖNCE kaydedilmiş olmalı — brifing bunun
// için doğal ve tek doğru yer.
//
// ⚠️ KURALLAR GÖRÜNÜR. "Aynı seed", "geçmek gerek, eşitlik yetmez",
// "gold yok", "günlük toz tavanı", "6 saat soğuma" — hepsi oyuncunun
// SONRADAN öğrenip şaşırdığı şeyler. Sürpriz, kural değildir.

import { useState } from 'react';
import { DUEL, duelTier } from '@/game/duel';
import { stageById } from '@/game/config';
import { HEROES, heroById } from '@/game/heroes';
import type { DuelRow } from '@/lib/gameSession';
import { C, FONT, glass } from '@/lib/theme';

const kisa = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export function DuelBriefing({ row, myWallet, myRating, myHero, rewardedToday, onHero, onEnter, onCancel }: {
  row: DuelRow;
  /** kendi cüzdanım — "YOU" kartında kimin oynadığı yazsın */
  myWallet: string;
  myRating: number;
  myHero: string;
  rewardedToday: number;
  onHero: (id: string) => void;
  onEnter: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const rakipTier = duelTier(row.duelRating);
  const benTier = duelTier(myRating);
  const stage = stageById(row.stageId);
  const hero = heroById(myHero);
  const tozKaldi = Math.max(0, DUEL.dailyRewarded - rewardedToday);

  return (
    <div onClick={onCancel}
      style={{
        position: 'absolute', inset: 0, zIndex: 9,
        background: 'rgba(8,6,5,0.90)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto', fontFamily: FONT.ui,
      }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ ...glass(16), width: '100%', maxWidth: 560, padding: 20 }}>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2.6, color: C.blood }}>
            THE ANSWERING
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.bone, marginTop: 3 }}>
            {stage?.name ?? `Stage ${row.stageId}`}
          </div>
        </div>

        {/* ── İKİ TARAF ── */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 9, marginBottom: 14 }}>
          <Side
            kicker="YOU"
            name={myWallet ? kisa(myWallet) : 'You'}
            label="Your standing"
            rating={myRating}
            tier={benTier}
            sub={hero.name}
            accent={C.candle}
          />
          {/* ⚠️ VS ayracı sadece süs değil: iki kartı ayırmadan yan yana
              koymak, hangi sayının kime ait olduğunu bulanıklaştırıyordu. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 900, color: C.boneFaint, letterSpacing: 1 }}>
            VS
          </div>
          <Side
            kicker="THEM"
            name={kisa(row.wallet)}
            label="Their standing"
            rating={row.duelRating}
            tier={rakipTier}
            sub={heroById(row.hero).name}
            accent={C.blood}
          />
        </div>

        {/* ── HEDEF ── */}
        {/* ⚠️ EKRANIN EN BÜYÜK SAYISI BU OLMALI. Oyuncunun tek sorusu
            "kaçı geçmem lazım" ve cevabı aramak zorunda kalmamalı. */}
        <div style={{
          textAlign: 'center', padding: '14px 12px', borderRadius: 10, marginBottom: 14,
          border: `1px solid ${C.candle}44`,
          background: 'linear-gradient(180deg, rgba(239,167,46,0.13), rgba(0,0,0,0.32))',
        }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: C.boneFaint }}>
            YOU MUST PASS
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: C.candle, lineHeight: 1.05 }}>
            {row.depth}
          </div>
          <div style={{ fontSize: 11.5, color: C.boneDim, marginTop: 2 }}>
            depth {row.depth + 1} or deeper wins — matching it is not enough
          </div>
        </div>

        {/* ── KAHRAMAN SEÇİMİ ── */}
        <Section label="Who walks in">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {HEROES.map((h) => {
              const on = h.id === myHero;
              return (
                <button key={h.id} onClick={() => onHero(h.id)}
                  style={{
                    all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                    flex: '1 1 118px', padding: '8px 10px', borderRadius: 8,
                    border: `1px solid ${on ? `${C.candle}88` : 'rgba(255,255,255,0.10)'}`,
                    background: on
                      ? 'linear-gradient(180deg, rgba(239,167,46,0.15), rgba(0,0,0,0.30))'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.26))',
                  }}>
                  <div style={{ fontSize: 11.5, fontWeight: 900, color: on ? C.candle : C.bone }}>
                    {h.name}
                  </div>
                  <div style={{ fontSize: 10, color: C.boneFaint, lineHeight: 1.35, marginTop: 2 }}>
                    {h.blurb}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── KURALLAR ── */}
        <Section label="The rules">
          <Rule
            head="You play their run, not a copy of it"
            body="Same seed, same enemies, in the same order. Whatever they faced, you face." />
          <Rule
            head="Beating them means going deeper"
            body={`They stopped at depth ${row.depth}. Reaching ${row.depth} only ties, and a tie goes to them.`} />
          <Rule
            head="Duels never pay gold"
            body={tozKaldi > 0
              ? `They pay standing. Your first ${DUEL.dailyRewarded} wins each day also pay ${DUEL.dustPerWin} dust — ${tozKaldi} left today.`
              : 'They pay standing. You have already taken every dust reward today — this one is for the record alone.'} />
          <Rule
            head="One answer per opponent"
            body={`After this you cannot challenge them again for ${DUEL.cooldownHours} hours.`} />
          <Rule
            head="Leaving early counts"
            body="The run is scored the moment it ends, however it ends. There is no walking away from a duel you are losing." />
        </Section>

        <div style={{ display: 'flex', gap: 7, marginTop: 16 }}>
          <button onClick={() => { if (!busy) { setBusy(true); onEnter(); } }}
            disabled={busy}
            style={{
              all: 'unset', flex: '2 1 180px', boxSizing: 'border-box', cursor: busy ? 'default' : 'pointer',
              padding: '12px 14px', borderRadius: 8, textAlign: 'center',
              fontSize: 13, fontWeight: 900, letterSpacing: 1.4, color: '#ffd9df',
              background: 'linear-gradient(180deg, rgba(160,18,38,0.55), rgba(120,12,28,0.38))',
              border: '1px solid rgba(228,101,122,0.6)',
              opacity: busy ? 0.6 : 1,
            }}>
            {busy ? 'DESCENDING…' : 'ANSWER THEM'}
          </button>
          <button onClick={onCancel}
            style={{
              all: 'unset', flex: '1 1 90px', boxSizing: 'border-box', cursor: 'pointer',
              padding: '12px 14px', borderRadius: 8, textAlign: 'center',
              fontSize: 12, fontWeight: 900, letterSpacing: 1, color: C.boneDim,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            }}>
            NOT YET
          </button>
        </div>
      </div>
    </div>
  );
}

function Side({ kicker, name, label, rating, tier, sub, accent }: {
  kicker: string; name: string; label: string;
  rating: number; tier: { name: string; color: string }; sub: string; accent: string;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: '11px 12px', borderRadius: 10,
      border: `1px solid ${accent}44`,
      background: `linear-gradient(180deg, ${accent}18, rgba(0,0,0,0.30))`,
    }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.8, color: C.boneFaint }}>
        {kicker}
      </div>
      <div style={{ fontSize: 13, fontWeight: 900, color: C.bone, marginTop: 2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, color: tier.color, marginTop: 5 }}>
        {tier.name}
      </div>
      <div style={{ fontSize: 11, color: C.boneFaint }} title={label}>
        {rating} · {sub}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.6, color: C.boneFaint, marginBottom: 6 }}>
        {label.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function Rule({ head, body }: { head: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '5px 0', alignItems: 'flex-start' }}>
      {/* Küçük kan damlası — madde işareti yerine, panelin diliyle */}
      <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: 3,
        background: C.blood, marginTop: 6 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 11.5, fontWeight: 900, color: C.bone }}>
          {head}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
          {body}
        </span>
      </span>
    </div>
  );
}
