'use client';
// ANA SAYFA — kapının ALTINDAKİ bölümler.
//
// Kapı (page.tsx) dürüsttü ama oyunun NE OLDUĞUNU anlatmıyordu: ziyaretçi
// isim, slogan ve iki düğme görüyordu. Reliquary, Ossuary, bahis, başarımlar
// ve haftalık ortak boss eklendi — hiçbirinden haberi yoktu.
//
// ⚠️ UYDURMA YOK. Sayılar canlı uçlardan geliyor (`/stats`, `/leaderboard`,
// `/worldboss`); sunucu kapalıysa o bölüm HİÇ ÇİZİLMEZ. Sahte "10.000 oyuncu"
// yazmak en kolay güven kaybı olurdu ve $GRAVE henüz yokken zaten şüphe
// uyandıran bir sayfa.
//
// ⚠️ SSS'te olmayan şeye "var" DEMİYORUZ: token çıkmadı, canlı çok oyunculu
// boss odası yapılıyor. İkisi de açıkça öyle yazılı.

import { useEffect, useState } from 'react';
import { STAGES } from '@/game/config';
import { COSMETICS } from '@/game/cosmetics';
import { ACHIEVEMENTS } from '@/game/achievements';
import { bossProgress } from '@/game/worldBoss';
import { treeTotalCost } from '@/game/forge';
import { fetchLeaderboard, fetchWorldBoss, type BossState, type LeaderRow } from '@/lib/gameSession';
import { pixel } from '@/components/ui/kit';
import { C, FONT } from '@/lib/theme';

const box = (accent = false) => ({
  background: accent
    ? 'linear-gradient(180deg, rgba(160,18,38,0.16), rgba(10,8,6,0.72))'
    : 'linear-gradient(180deg, rgba(43,31,22,0.80), rgba(10,8,6,0.88))',
  border: `1px solid ${accent ? 'rgba(228,101,122,0.34)' : C.border}`,
  borderRadius: 12,
  fontFamily: FONT.ui,
} as const);

function Section({ kicker, title, children }: {
  kicker: string; title: string; children: React.ReactNode;
}) {
  return (
    <section style={{ width: 'min(94vw, 880px)', margin: '0 auto', padding: '30px 0' }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2.4, color: C.blood, fontFamily: FONT.ui }}>
        {kicker}
      </div>
      <h2 style={{
        margin: '5px 0 16px', fontFamily: FONT.title, fontWeight: 900, color: C.bone,
        fontSize: 'clamp(20px, 4vw, 28px)', letterSpacing: 0.5,
      }}>{title}</h2>
      {children}
    </section>
  );
}

/** Oyun içi sprite — süs değil, oyunda GERÇEKTEN görünen şey */
function Relic({ src, frames, size = 34 }: { src: string; frames: number; size?: number }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, flexShrink: 0,
      backgroundImage: `url(${src})`,
      backgroundSize: `${frames * 100}% 100%`,
      backgroundRepeat: 'no-repeat',
      animation: `gb-strip ${(frames / 8).toFixed(2)}s steps(${frames}) infinite`,
      ...pixel,
    }} />
  );
}

const FEATURES: { title: string; body: string; tag: string }[] = [
  {
    tag: 'THE DESCENT',
    title: 'A stair with no bottom',
    body: 'Clear a stage once and the Descent opens beneath it. Every depth is harder than the last and no depth pays twice — the only way forward is down.',
  },
  {
    tag: 'THE FORGE',
    title: 'Power you keep',
    body: 'Permanent upgrades bought with gold. It has a last stone, and reaching it is meant to take a while — but it is a milestone, not an ending.',
  },
  {
    tag: 'THE RELIQUARY',
    title: 'Something to show for it',
    body: 'Titles, nameplates, trophies and auras. Appearance only — no damage, no health, no advantage. What you wear is what the ladder sees.',
  },
  {
    tag: 'THE OSSUARY',
    title: 'A monument with no last stone',
    body: 'Raise your own grave, one stone at a time, each costing more than the last. This is where the gold you are still earning a year from now is meant to go.',
  },
  {
    tag: 'THE WAGER',
    title: 'Bet on yourself',
    body: 'Stake gold that your next run goes deeper than you ever have. Win and the dead pay you in dust. Lose and it stays down there.',
  },
  {
    tag: 'THE SHARED BARROW',
    title: 'One grave, everyone',
    body: 'A world boss every week with a single pool of health. Nobody takes it down alone — every hit anyone lands comes off the same wound.',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Has $GRAVE launched?',
    // ⚠️ Bu cevap DEĞİŞTİRİLMEDEN kalmalı — token çıkana kadar tek dürüst cevap
    a: 'No. There is no contract address, and anything claiming to be one is not ours. The marketplace already takes gold listings; the token side opens when the game is finished.',
  },
  {
    q: 'Is this pay-to-win?',
    a: 'Gold buys permanent power at the Forge — that is a real trade-off and we are not hiding it. Everything else gold buys is appearance only. Depth is gated by survival, not by spending.',
  },
  {
    q: 'Do I need a wallet to try it?',
    a: 'No. The demo runs with no wallet and no sign-up. Progress stays on that device and never touches the economy — it is a look at the game, not a shortcut into it.',
  },
  {
    q: 'Does the game print tokens?',
    a: 'No. Zero emission. Any $GRAVE you receive comes from another player\'s wallet through the marketplace — the treasury never buys gold at a fixed rate.',
  },
  {
    q: 'Can I see other players in the boss room?',
    // ⚠️ "Evet" DEMİYORUZ. Aşama 2 yapılıyor; söz verip tutmamak en kolay güven kaybı.
    a: 'Not yet. Right now everyone fights it in their own run and shares the wound — the damage board is live. Being in the same room at the same moment is the next thing being built.',
  },
];

export function HomeSections() {
  const [boss, setBoss] = useState<BossState | null>(null);
  const [rows, setRows] = useState<LeaderRow[] | null>(null);

  useEffect(() => {
    // ⚠️ Sessizce başarısız oluyorlar: sunucu kapalıysa bölüm hiç çizilmez.
    // Hata kutusu göstermek ziyaretçiye çözemeyeceği bir sorun sunmak olurdu.
    fetchWorldBoss().then(setBoss).catch(() => {});
    fetchLeaderboard().then((r) => setRows(r.rows.slice(0, 5))).catch(() => {});
  }, []);

  const trophies = COSMETICS.filter((c) => c.trophy).slice(0, 6);

  return (
    <div style={{ width: '100%', paddingBottom: 50 }}>
      <style>{`@keyframes gb-strip { from { background-position-x: 0%; } to { background-position-x: 100%; } }`}</style>

      {/* ── DÖNGÜ ── */}
      <Section kicker="WHAT YOU ACTUALLY DO" title="Clear, descend, spend, go deeper">
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          {[
            ['01', 'Clear a stage', `${STAGES.length} of them, each with its own horde and its own boss.`],
            ['02', 'Take the stair', 'The Descent opens underneath. It does not end; you do.'],
            ['03', 'Spend what you dug up', 'Power at the Forge, everything else on being seen.'],
            ['04', 'Go back further', 'Checkpoints keep what you earned. The wall moves, slowly.'],
          ].map(([n, t, b]) => (
            <div key={n} style={{ ...box(), padding: '14px 13px' }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: C.blood, letterSpacing: 1.4 }}>{n}</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: C.bone, marginTop: 4 }}>{t}</div>
              <div style={{ fontSize: 11.5, color: C.boneDim, marginTop: 5, lineHeight: 1.5 }}>{b}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── HAFTALIK BOSS (CANLI) ── */}
      {boss && (
        <Section kicker="RIGHT NOW" title={`This week: ${boss.name}`}>
          <div style={{ ...box(true), padding: '16px 15px' }}>
            <div style={{ fontSize: 12, color: C.boneDim, fontStyle: 'italic', lineHeight: 1.5 }}>
              {boss.epithet}
            </div>
            <div style={{
              height: 14, borderRadius: 7, overflow: 'hidden', marginTop: 12,
              background: 'rgba(0,0,0,0.45)', border: `1px solid ${C.border}`,
            }}>
              <div style={{
                width: `${Math.round((1 - bossProgress(boss.hp, boss.maxHp)) * 100)}%`, height: '100%',
                background: `linear-gradient(90deg, ${C.blood}, ${C.bloodSoft})`,
              }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 7, flexWrap: 'wrap', fontSize: 12 }}>
              <span style={{ color: C.bone, fontWeight: 800 }}>
                {boss.hp.toLocaleString('en-US')} <span style={{ color: C.boneFaint, fontWeight: 400 }}>left</span>
              </span>
              <span style={{ marginLeft: 'auto', color: C.candle, fontWeight: 900 }}>
                {(bossProgress(boss.hp, boss.maxHp) * 100).toFixed(1)}% down
              </span>
            </div>
            <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 8, lineHeight: 1.5 }}>
              Everyone hits the same pool. It seals when the week turns, finished or not.
            </div>
          </div>
        </Section>
      )}

      {/* ── ÖZELLİKLER ── */}
      <Section kicker="WHAT IS IN THERE" title="Six doors off the square">
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          {FEATURES.map((f) => (
            <div key={f.tag} style={{ ...box(), padding: '15px 14px' }}>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.6, color: C.candle }}>{f.tag}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.bone, marginTop: 5 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: C.boneDim, marginTop: 6, lineHeight: 1.55 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── KOZMETİKLER (gerçek sprite'lar) ── */}
      <Section kicker="WHAT YOU CAN CARRY" title="Relics, and nothing they do">
        <div style={{ ...box(), padding: '15px 14px' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {trophies.map((t) => (
              <span key={t.id} title={t.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Relic src={t.trophy!.src} frames={t.trophy!.frames} />
                <span style={{ fontSize: 11, color: C.boneDim }}>{t.name}</span>
              </span>
            ))}
          </div>
          <div style={{ fontSize: 12, color: C.boneDim, marginTop: 12, lineHeight: 1.55 }}>
            {COSMETICS.length} relics, titles, nameplates and auras in all — plus{' '}
            {ACHIEVEMENTS.filter((a) => a.cosmetic).length} that cannot be bought at any price,
            only earned. None of them change a single number in a fight.
          </div>
        </div>
      </Section>

      {/* ── LEADERBOARD (CANLI) ── */}
      {rows && rows.length > 0 && (
        <Section kicker="DEEPEST SO FAR" title="Who has gone furthest">
          <div style={{ ...box(), padding: '10px 12px' }}>
            {rows.map((r, i) => (
              <div key={r.wallet} style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '7px 2px',
                borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
              }}>
                <span style={{ width: 26, fontSize: 12, fontWeight: 900,
                  color: i === 0 ? C.candle : i < 3 ? C.bone : C.boneFaint }}>#{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.boneDim,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.wallet.slice(0, 4)}…{r.wallet.slice(-4)}
                </span>
                <span style={{ fontSize: 11, color: C.boneFaint }}>
                  {STAGES.find((s) => s.id === r.stage)?.name ?? `Stage ${r.stage}`}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.candle, width: 62, textAlign: 'right' }}>
                  depth {r.depth}
                </span>
              </div>
            ))}
          </div>
          {/* ⚠️ Sıralamanın derinliğe DEĞİL zorluğa göre olduğunu söylüyoruz —
              yoksa "depth 40 neden depth 12'nin altında" sorusu cevapsız kalır. */}
          <div style={{ fontSize: 10.5, color: C.boneFaint, marginTop: 8, fontFamily: FONT.ui, lineHeight: 1.5 }}>
            Ranked by how hard the run was, not by the number alone — a shallow depth on a
            late stage outranks a deep one on the first.
          </div>
        </Section>
      )}

      {/* ── SSS ── */}
      <Section kicker="BEFORE YOU ASK" title="The awkward questions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {FAQ.map((f) => (
            <div key={f.q} style={{ ...box(), padding: '13px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.bone }}>{f.q}</div>
              <div style={{ fontSize: 12, color: C.boneDim, marginTop: 5, lineHeight: 1.6 }}>{f.a}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── DURUM ── */}
      <Section kicker="WHERE THIS IS" title="Being built, in the open">
        <div style={{ ...box(), padding: '15px 14px', fontSize: 12, color: C.boneDim, lineHeight: 1.65 }}>
          The game is playable end to end: {STAGES.length} stages, the endless Descent,
          the Forge ({treeTotalCost().toLocaleString('en-US')} gold of upgrades), the Reliquary,
          the monument, wagers, deeds and a weekly world boss. Still coming: seeing each other
          in the boss room, and the token side of the marketplace.
        </div>
      </Section>
    </div>
  );
}
