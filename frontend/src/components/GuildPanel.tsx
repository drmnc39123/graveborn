'use client';
// LONCA — arayüz.
//
// ⚠️ İKİ AYRI EKRAN, TEK PANEL: loncan varsa yönetim, yoksa liste + kurma.
// Boş bir "lonca yok" ekranı gösterip oyuncuyu başka bir sekmeye yollamak,
// en kritik anda (katılma kararı) fazladan bir tıklama koymak olurdu.

import { useCallback, useEffect, useState } from 'react';
import { panelUnlocked } from '@/lib/testMode';
import { GUILD_COST, NAME_MAX, TAG_MAX, guildGrowth, nextGuildLevel } from '@/game/guild';
import type { Progress } from '@/game/progress';
import {
  buyGuildUpgrade, createGuild, donateGuild, fetchGuilds, joinGuild, leaveGuild,
  type GuildState,
} from '@/lib/gameSession';
import { getMode } from '@/lib/session';
import { Card, CardSection, PanelHead, Tag } from '@/components/ui/cards';
import { PixelButton } from '@/components/ui/kit';
import { C, FONT, glass } from '@/lib/theme';

export function GuildPanel({ progress, onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError: (msg: string) => void;
}) {
  const [state, setState] = useState<GuildState | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ad, setAd] = useState('');
  const [etiket, setEtiket] = useState('');
  const [bagis, setBagis] = useState('');

  const yukle = useCallback(() => {
    fetchGuilds().then(setState).catch(() => setErr(true));
  }, []);
  useEffect(() => { if (panelUnlocked(getMode())) yukle(); }, [yukle]);

  // ⚠️ Demo modunda lonca YOK: sunucu kaydı gerektiriyor. Sahte bir lonca
  // listesi göstermek, olmayan bir topluluğu varmış gibi göstermek olurdu.
  if (!panelUnlocked(getMode())) {
    return (
      <>
        <PanelHead kicker="THE GUILDS" title="Nobody stands alone" accent={C.ice}
          sub="Guilds live in the village ledger, not on your device. Connect a wallet to found or join one." />
      </>
    );
  }
  if (err) return <Note>Could not reach the guild rolls.</Note>;
  if (!state) return <Note>Reading the guild rolls…</Note>;

  const sar = async (fn: () => Promise<void>, varsayilanHata: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); yukle(); }
    catch (e) { onError(e instanceof Error ? e.message : varsayilanHata); }
    finally { setBusy(false); }
  };

  const mine = state.mine;

  // ── LONCASI VAR ──
  if (mine) {
    const next = nextGuildLevel(mine.level);
    const kurucu = mine.owner === state.wallet;
    return (
      <>
        <PanelHead kicker={`[${mine.tag}]`} title={mine.name} accent={C.ice}
          sub={`Level ${mine.level} · ${mine.members.length}/${mine.cap} members · every member gains +${Math.round(mine.growth * 100)}% experience.`} />

        <div style={{ ...glass(10), padding: '11px 13px', marginBottom: 12, fontFamily: FONT.ui }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.6, color: C.ice }}>
              TREASURY
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 900, color: C.candle }}>
              {mine.treasury.toLocaleString('en-US')}
            </span>
            <span style={{ fontSize: 11, color: C.boneFaint }}>gold</span>
          </div>
          {/* ⚠️ Bu cümle KALDIRILAMAZ. Bağış geri alınamıyor; oyuncu bunu
              tıkladıktan sonra değil ÖNCE bilmeli. */}
          <div style={{ marginTop: 5, fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
            Donations cannot be taken back. The treasury only buys levels.
          </div>
        </div>

        <CardSection label="Give to the treasury" tone={C.candle}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={bagis} onChange={(e) => setBagis(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="amount" inputMode="numeric"
              style={girdiStil} />
            <PixelButton variant="01A" scale={2} disabled={busy || !bagis || Number(bagis) < 100}
              onClick={() => sar(async () => {
                const r = await donateGuild(Number(bagis));
                onChange(r.progress);
                setBagis('');
              }, 'The treasury refused it.')}>
              GIVE
            </PixelButton>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: C.boneFaint }}>
            You hold {progress.gold.toLocaleString('en-US')} gold. Minimum gift is 100.
          </div>
        </CardSection>

        {next ? (
          <CardSection label="Next level" tone={C.ice}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: C.bone }}>
                Level {next.level} — {next.cap} members, +{Math.round(guildGrowth(next.level) * 100)}% experience
              </span>
              <span style={{ marginLeft: 'auto' }}>
                <PixelButton variant="02A" scale={2}
                  disabled={busy || !kurucu || mine.treasury < next.cost}
                  onClick={() => sar(async () => { await buyGuildUpgrade(); }, 'Could not raise the guild.')}>
                  {next.cost.toLocaleString('en-US')} G
                </PixelButton>
              </span>
            </div>
            {!kurucu && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.boneFaint }}>
                Only the founder can spend the treasury.
              </div>
            )}
          </CardSection>
        ) : (
          <CardSection label="Next level" tone={C.ice}>
            <div style={{ fontSize: 11.5, color: C.boneDim }}>
              This guild has reached its final stone.
            </div>
          </CardSection>
        )}

        <CardSection label="Who stands here" tone={C.bone}>
          {mine.members.map((m) => (
            <div key={m.wallet} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 11.5 }}>
              <span style={{ color: m.wallet === mine.owner ? C.candle : C.bone }}>
                {m.wallet === state.wallet ? 'You' : `${m.wallet.slice(0, 4)}…${m.wallet.slice(-4)}`}
              </span>
              {m.wallet === mine.owner && <Tag tone="gold">FOUNDER</Tag>}
              <span style={{ marginLeft: 'auto', color: C.boneFaint }}>
                {m.bestRating > 0 ? Math.round(m.bestRating).toLocaleString('en-US') : '—'}
              </span>
            </div>
          ))}
        </CardSection>

        <div style={{ marginTop: 12 }}>
          <PixelButton variant="03A" scale={2} disabled={busy}
            onClick={() => sar(async () => { await leaveGuild(); }, 'Could not leave.')}>
            {kurucu ? 'DISBAND THE GUILD' : 'LEAVE'}
          </PixelButton>
          {/* ⚠️ Kurucu için sonuç GERİ ALINAMAZ — düğmeye basmadan önce yazılı olmalı */}
          {kurucu && (
            <div style={{ marginTop: 6, fontSize: 11, color: C.bad, lineHeight: 1.45 }}>
              You founded this guild. Leaving dissolves it for everyone, and the
              treasury is lost. There is no way to hand it over.
            </div>
          )}
        </div>
      </>
    );
  }

  // ── LONCASI YOK ──
  return (
    <>
      <PanelHead kicker="THE GUILDS" title="Nobody stands alone" accent={C.ice}
        sub="Members share a small, permanent gain in experience. The treasury only ever buys levels — it cannot be paid back out." />

      <CardSection label={`Found one — ${GUILD_COST.toLocaleString('en-US')} gold`} tone={C.candle}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={ad} onChange={(e) => setAd(e.target.value)} maxLength={NAME_MAX}
            placeholder="guild name" style={{ ...girdiStil, flex: '2 1 140px' }} />
          <input value={etiket} onChange={(e) => setEtiket(e.target.value.toUpperCase())}
            maxLength={TAG_MAX} placeholder="TAG" style={{ ...girdiStil, flex: '1 1 70px' }} />
          <PixelButton variant="01A" scale={2}
            disabled={busy || progress.gold < GUILD_COST || ad.trim().length < 3 || etiket.length < 2}
            onClick={() => sar(async () => {
              // ⚠️ Bakiye HEMEN yenilenmeli: kurma 25.000 gold düşürüyor ve
              // navbar bunu göstermezse oyuncu "para gitmedi" sanır. Ölçüldü:
              // lonca kuruldu, gold ekranda hiç eksilmemiş gibi durdu.
              const r = await createGuild(ad, etiket);
              onChange(r.progress);
            }, 'The name was refused.')}>
            FOUND
          </PixelButton>
        </div>
        {progress.gold < GUILD_COST && (
          <div style={{ marginTop: 6, fontSize: 11, color: C.bad }}>
            {(GUILD_COST - progress.gold).toLocaleString('en-US')} more gold needed
          </div>
        )}
      </CardSection>

      <CardSection label="Or join one" tone={C.ice}>
        {state.list.length === 0 ? (
          <div style={{ fontSize: 11.5, color: C.boneDim }}>
            No guilds yet. The first one is yours to name.
          </div>
        ) : state.list.map((g) => {
          const dolu = g.members >= g.cap;
          return (
            <Card key={g.id}>
              <div style={{ padding: '8px 11px', display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontWeight: 900, fontSize: 12, color: C.ice }}>[{g.tag}]</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.bone,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.name}
                </span>
                <Tag>LV {g.level}</Tag>
                {/* ⚠️ Dolu loncalar da listeleniyor: gizlemek "neden yok" sorusunu
                    doğurur, göstermek "neden giremiyorum"u cevaplar. */}
                <Tag tone={dolu ? 'bad' : 'dim'}>{g.members}/{g.cap}</Tag>
                <PixelButton variant="02A" scale={2} disabled={busy || dolu}
                  onClick={() => sar(async () => { await joinGuild(g.id); }, 'Could not join.')}>
                  {dolu ? 'FULL' : 'JOIN'}
                </PixelButton>
              </div>
            </Card>
          );
        })}
      </CardSection>
    </>
  );
}

const girdiStil = {
  flex: 1, minWidth: 0, padding: '6px 9px', borderRadius: 6,
  border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)',
  color: C.bone, fontFamily: FONT.ui, fontSize: 12, outline: 'none',
} as const;

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...glass(9), padding: '16px 14px', fontSize: 12, color: C.boneFaint,
      textAlign: 'center', lineHeight: 1.6, fontFamily: FONT.ui }}>
      {children}
    </div>
  );
}
