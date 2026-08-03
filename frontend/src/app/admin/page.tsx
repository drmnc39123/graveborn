'use client';
// ADMIN PANELİ — operatör aracı, oyunun bir parçası değil.
//
// Bot politikası: tam replay doğrulaması YOK, sunucu ödül tavanı + denetim.
// Tavan kodda (backend/reward.ts). Burası denetim tarafı.
//
// Panel tablo dökmüyor, ÜÇ SORUYU cevaplıyor:
//   1. Sunucu kimin iddiasını KIRPMAK zorunda kaldı? (yalanın izi)
//   2. Kim insan hızının üstünde gold/koşu üretiyor?
//   3. Bu oyuncunun dosyası ne diyor?
//
// ⚠️ Sır sessionStorage'da: sekme kapanınca gider. localStorage'da tutmak,
// paylaşılan bir makinede admin sırrını kalıcı bırakmak olurdu.

import { useCallback, useEffect, useState } from 'react';
import { C, FONT, glass } from '@/lib/theme';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';
const K_SECRET = 'graveborn:adminSecret';

interface Overview {
  players: number; banned: number; runsClaimed: number;
  runsCapped: number; runsOpen: number; goldInCirculation: number;
}
interface PlayerRow {
  wallet: string; gold: number; unlockedStage: number; hero: string; banned: boolean;
  createdAt: string; lastSeen: string; runs: number; cappedRuns: number;
  goldPerHour: number; runsPerHour: number;
}
interface RunRow {
  id: string; wallet: string; mode: string; stageId: number; seed: string;
  startedAt: string; claimedAt: string | null; claimedDepth: number | null;
  claimedGold: number | null; awarded: number | null; capped: boolean;
  durationSec: number | null;
}

type Sort = 'capped' | 'gold' | 'new';

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [sort, setSort] = useState<Sort>('capped');
  const [onlyCapped, setOnlyCapped] = useState(true);

  useEffect(() => {
    const s = sessionStorage.getItem(K_SECRET);
    if (s) { setSecret(s); setAuthed(true); }
  }, []);

  const call = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(API + path, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-admin-secret': secret, ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as T;
  }, [secret]);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const [o, p, r] = await Promise.all([
        call<Overview>('/admin/overview'),
        call<{ players: PlayerRow[] }>(`/admin/players?sort=${sort}&limit=50`),
        call<{ runs: RunRow[] }>(`/admin/runs?limit=50${onlyCapped ? '&capped=1' : ''}`),
      ]);
      setOv(o); setPlayers(p.players); setRuns(r.runs);
      sessionStorage.setItem(K_SECRET, secret);
      setAuthed(true);
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setErr(code === '401' ? 'Sır yanlış.'
        : code === '403' ? 'Sunucuda ADMIN_SECRET tanımlı değil — panel kapalı.'
        : 'Sunucuya ulaşılamadı.');
      if (code === '401' || code === '403') { setAuthed(false); sessionStorage.removeItem(K_SECRET); }
    }
  }, [call, sort, onlyCapped, secret]);

  useEffect(() => { if (authed) void refresh(); }, [authed, sort, onlyCapped]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBan = async (wallet: string, banned: boolean) => {
    if (!confirm(`${wallet}\n\n${banned ? 'BANLA' : 'banı kaldır'}?`)) return;
    try {
      await call('/admin/ban', { method: 'POST', body: JSON.stringify({ wallet, banned }) });
      void refresh();
    } catch { setErr('Ban işlemi başarısız.'); }
  };

  if (!authed) {
    return (
      <main style={{ ...page, display: 'grid', placeItems: 'center' }}>
        <div style={{ ...glass(12), padding: 22, width: 'min(92vw, 360px)' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, color: C.blood, marginBottom: 8 }}>GRAVEBORN</div>
          <h1 style={{ margin: '0 0 12px', fontSize: 20, color: C.bone }}>Admin</h1>
          <input
            type="password" value={secret} autoFocus
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void refresh(); }}
            placeholder="ADMIN_SECRET"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, fontFamily: FONT.ui,
              background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, color: C.bone,
            }}
          />
          <button onClick={() => void refresh()}
            style={{ marginTop: 10, width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
              cursor: 'pointer', fontWeight: 900, color: '#1a0508',
              background: `linear-gradient(180deg, ${C.bloodSoft}, ${C.blood})` }}>
            GİRİŞ
          </button>
          {err && <div style={{ marginTop: 10, fontSize: 12, color: C.bad }}>{err}</div>}
        </div>
      </main>
    );
  }

  return (
    <main style={{ ...page, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 20, color: C.bone }}>GRAVEBORN · Admin</h1>
        <button onClick={() => void refresh()} style={btn}>Yenile</button>
      </div>
      {err && <div style={{ marginTop: 10, fontSize: 12, color: C.bad }}>{err}</div>}

      {/* ── GENEL BAKIŞ ── */}
      {ov && (
        <div style={{ display: 'grid', gap: 8, marginTop: 14,
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <Stat label="Oyuncu" value={ov.players} />
          <Stat label="Banlı" value={ov.banned} tone={ov.banned > 0 ? 'warn' : undefined} />
          <Stat label="Kapanan koşu" value={ov.runsClaimed} />
          {/* ASIL SİNYAL: sunucunun iddiayı kırpmak zorunda kaldığı koşular */}
          <Stat label="KIRPILAN koşu" value={ov.runsCapped} tone={ov.runsCapped > 0 ? 'bad' : undefined} />
          <Stat label="Açık koşu" value={ov.runsOpen} />
          <Stat label="Dolaşımdaki gold" value={ov.goldInCirculation.toLocaleString('en-US')} />
        </div>
      )}

      {/* ── OYUNCULAR ── */}
      <section style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 15, color: C.bone }}>Oyuncular</h2>
          {(['capped', 'gold', 'new'] as Sort[]).map((s) => (
            <button key={s} onClick={() => setSort(s)}
              style={{ ...btn, ...(sort === s ? btnOn : {}) }}>
              {s === 'capped' ? 'kırpılana göre' : s === 'gold' ? 'gold\'a göre' : 'yeniye göre'}
            </button>
          ))}
        </div>
        <Table head={['Cüzdan', 'Gold', 'Bölüm', 'Karakter', 'Koşu', 'KIRPILAN', 'Gold/sa', 'Koşu/sa', '']}>
          {players.map((p) => (
            <tr key={p.wallet} style={{ background: p.banned ? 'rgba(160,18,38,0.14)' : undefined }}>
              <Td mono title={p.wallet}>{p.wallet.slice(0, 6)}…{p.wallet.slice(-4)}</Td>
              <Td>{p.gold.toLocaleString('en-US')}</Td>
              <Td>{p.unlockedStage}</Td>
              <Td>{p.hero}</Td>
              <Td>{p.runs}</Td>
              <Td tone={p.cappedRuns > 0 ? 'bad' : undefined}>{p.cappedRuns}</Td>
              <Td>{p.goldPerHour.toLocaleString('en-US')}</Td>
              <Td>{p.runsPerHour}</Td>
              <Td>
                <button onClick={() => void toggleBan(p.wallet, !p.banned)}
                  style={{ ...btn, color: p.banned ? C.ok : C.bad }}>
                  {p.banned ? 'banı kaldır' : 'banla'}
                </button>
              </Td>
            </tr>
          ))}
        </Table>
      </section>

      {/* ── KOŞULAR ── */}
      <section style={{ marginTop: 22, paddingBottom: 40 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 15, color: C.bone }}>Koşular</h2>
          <button onClick={() => setOnlyCapped(!onlyCapped)} style={{ ...btn, ...(onlyCapped ? btnOn : {}) }}>
            {onlyCapped ? 'sadece kırpılanlar' : 'hepsi'}
          </button>
        </div>
        <Table head={['Cüzdan', 'Mod', 'Bölüm', 'Derinlik iddiası', 'Gold iddiası', 'Verilen', 'Süre', 'Seed']}>
          {runs.map((r) => (
            <tr key={r.id} style={{ background: r.capped ? 'rgba(160,18,38,0.14)' : undefined }}>
              <Td mono title={r.wallet}>{r.wallet.slice(0, 6)}…</Td>
              <Td>{r.mode}</Td>
              <Td>{r.stageId}</Td>
              <Td>{r.claimedDepth ?? '—'}</Td>
              <Td tone={r.capped ? 'bad' : undefined}>{r.claimedGold ?? '—'}</Td>
              <Td>{r.awarded ?? '—'}</Td>
              {/* 5 saniyede biten "derinlik 40" iddiası fiziksel olarak imkânsız */}
              <Td tone={r.durationSec !== null && r.durationSec < 10 ? 'warn' : undefined}>
                {r.durationSec === null ? 'açık' : `${r.durationSec}s`}
              </Td>
              <Td mono>{r.seed}</Td>
            </tr>
          ))}
        </Table>
      </section>
    </main>
  );
}

// ── küçük parçalar ──
const page = { minHeight: '100vh', background: C.void, color: C.bone, fontFamily: FONT.ui } as const;
const btn = {
  padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 800,
  border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.05)', color: C.boneDim,
} as const;
const btnOn = { background: 'rgba(239,167,46,0.16)', color: C.candle, borderColor: `${C.candle}55` } as const;

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'bad' | 'warn' }) {
  return (
    <div style={{ ...glass(9), padding: '9px 12px' }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.1, color: C.boneFaint }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 19, fontWeight: 900, marginTop: 2,
        color: tone === 'bad' ? C.bad : tone === 'warn' ? C.warn : C.bone }}>{value}</div>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: 10 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11.5, minWidth: 720 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '6px 9px', color: C.boneFaint,
                fontSize: 9.5, letterSpacing: 1, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                {h.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, mono, tone, title }: {
  children: React.ReactNode; mono?: boolean; tone?: 'bad' | 'warn'; title?: string;
}) {
  return (
    <td title={title} style={{
      padding: '6px 9px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
      fontFamily: mono ? 'ui-monospace, monospace' : undefined,
      color: tone === 'bad' ? C.bad : tone === 'warn' ? C.warn : C.boneDim,
      fontWeight: tone ? 900 : undefined,
    }}>{children}</td>
  );
}
