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

interface LedgerRow {
  id: string; kind: string; gold: number; detail: string | null; at: string;
}
interface Economy {
  since: string;
  slices: { kind: string; gold: number; count: number }[];
  faucet: number;
  sink: number;
  /** el değiştiren ama YARATILMAYAN gold — musluğa dahil DEĞİL */
  redistributed: number;
  vault: { balance: number; filled: number; paid: number; saglikli: boolean };
}

/**
 * ⭐ ANOMALİ TARAMASI — "kim beklenenden çok kazanıyor".
 * ⚠️ `kat` ORTANCA aktif oyuncuya göre. Sabit bir gold/saat eşiği
 * yazılmadı çünkü bu depoda sabit eşiklerin bayatladığı üç kez ölçüldü.
 */
interface Anomali {
  since: string;
  ortanca: number;
  aktifOyuncu: number;
  satirlar: { wallet: string; kazanc: number; goldSaat: number; kat: number }[];
}
interface Detail {
  player: PlayerRow & { cosmetics?: unknown; ossuary?: number; dust?: number };
  runs: RunRow[];
  ledger: LedgerRow[];
}

type Sort = 'capped' | 'gold' | 'new';

/** Defter kalemlerinin okunur adları — ham anahtar operatöre bir şey söylemiyor */
// ⚠️ EKSİK TÜRLER TAMAMLANDI. Yalnız 9 tür yazılıydı; kalan 7'si defterde
// ham İngilizce id olarak görünüyordu (`crypt_deed`, `reforge`, `guild`…).
// `LEDGER_KINDS` 16 tür taşıyor — biri eksik kalırsa ekran onu ham basar.
const KIND_TR: Record<string, string> = {
  run: 'koşu ödülü', forge: 'Forge', charm: 'tılsım', reliquary: 'çekiliş',
  dust: 'tozla alım', ossuary: 'anıt', wager: 'bahis',
  market_list: 'ilan (escrow)', market_cancel: 'ilan iptali',
  crypt: 'kasa çekimi', crypt_deed: 'deed alımı', skill: 'beceri respec',
  guild: 'lonca', reforge: 'ekipman', pet: 'yoldaş', boon: 'ekipman eki',
  // ⭐ Yönetici vermesi — defterin en çok denetlenmesi gereken satırı
  admin_grant: 'YÖNETİCİ VERDİ',
};

interface TicketRow {
  id: string; subject: string; status: string; bumpedAt: string;
  messages: { fromAdmin: boolean; body: string; at: string }[];
}

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [sort, setSort] = useState<Sort>('capped');
  const [onlyCapped, setOnlyCapped] = useState(true);
  const [eco, setEco] = useState<Economy | null>(null);
  const [anom, setAnom] = useState<Anomali | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [q, setQ] = useState('');
  /** ⭐ Verme formu — kullanıcının açıkça istediği "item grant" yeteneği */
  const [grantGold, setGrantGold] = useState('');
  const [grantDust, setGrantDust] = useState('');
  const [grantSebep, setGrantSebep] = useState('');
  const [grantMesaj, setGrantMesaj] = useState<string | null>(null);
  const [grantMesgul, setGrantMesgul] = useState(false);

  useEffect(() => {
    const s = sessionStorage.getItem(K_SECRET);
    if (s) { setSecret(s); setAuthed(true); }
  }, []);

  // ⚠️ Talepler AYRI yükleniyor: `refresh` panelin geri kalanını çekiyor ve
  // bir talebe cevap yazmak tüm paneli yeniden çekmemeli.
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [ticketFilter, setTicketFilter] = useState('open');
  const [ticketDraft, setTicketDraft] = useState<Record<string, string>>({});

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
      const [o, p, r, e, a] = await Promise.all([
        call<Overview>('/admin/overview'),
        call<{ players: PlayerRow[] }>(`/admin/players?sort=${sort}&limit=50`),
        call<{ runs: RunRow[] }>(`/admin/runs?limit=50${onlyCapped ? '&capped=1' : ''}`),
        call<Economy>('/admin/economy?hours=168'),
        call<Anomali>('/admin/anomalies?hours=168&limit=12'),
      ]);
      setOv(o); setPlayers(p.players); setRuns(r.runs); setEco(e); setAnom(a);
      call<{ tickets: TicketRow[] }>(`/admin/tickets?status=${ticketFilter}`)
        .then((t) => setTickets(t.tickets))
        .catch(() => { /* talepler süs; panelin geri kalanını bozmasın */ });
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

  /**
   * Oyuncu dosyasını aç. ⚠️ Uç ZATEN VARDI (`/admin/player/:wallet`) ama
   * frontend onu hiç çağırmıyordu — panelin en ucuz kazancı buydu.
   */
  const openDetail = useCallback(async (wallet: string) => {
    try { setDetail(await call<Detail>(`/admin/player/${wallet}`)); }
    catch { setErr('Oyuncu dosyası alınamadı.'); }
  }, [call]);

  /**
   * ⭐ VERME — sunucuya gönder, sonra dosyayı TAZELE.
   *
   * ⚠️ Dosya yeniden çekiliyor: yeni bakiye VE yeni defter satırı aynı
   * ekranda görünsün. Yerelde sayıyı artırmak daha hızlı olurdu ama
   * defteri göstermezdi — ve buradaki asıl vaat "verilen gold izlenebilir".
   */
  const ver = async (wallet: string) => {
    const g = grantGold.trim() ? Number(grantGold) : 0;
    const d = grantDust.trim() ? Number(grantDust) : 0;
    if (!Number.isInteger(g) || !Number.isInteger(d)) {
      setGrantMesaj('Tam sayı gir.'); return;
    }
    // ⚠️ ONAY METNİ NE VERİLDİĞİNİ AÇIKÇA YAZIYOR. Boş bir "emin misin?"
    // yanlış hesaba yapılan vermeyi durdurmaz — onayın işi rakamı ve
    // cüzdanı bir kez daha göstermek.
    const ozet = `${wallet}\n\ngold ${g >= 0 ? '+' : ''}${g} · toz ${d >= 0 ? '+' : ''}${d}`
      + `\nsebep: ${grantSebep.trim()}\n\nonaylıyor musun?`;
    if (!confirm(ozet)) return;
    setGrantMesgul(true); setGrantMesaj(null);
    try {
      await call('/admin/grant', {
        method: 'POST',
        body: JSON.stringify({ wallet, gold: g, dust: d, reason: grantSebep.trim() }),
      });
      setGrantGold(''); setGrantDust(''); setGrantSebep('');
      setGrantMesaj('✓ verildi');
      await openDetail(wallet);
    } catch (e) {
      setGrantMesaj(e instanceof Error ? e.message : 'Verilemedi.');
    } finally {
      setGrantMesgul(false);
    }
  };

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
          {err && <div style={{ marginTop: 10, fontSize: 12, color: C.badText }}>{err}</div>}
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
      {err && <div style={{ marginTop: 10, fontSize: 12, color: C.badText }}>{err}</div>}

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

      {/* ── EKONOMİ: MUSLUK / SİNK ── */}
      {eco && (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 15, color: C.bone }}>Ekonomi · son 7 gün</h2>
          {/* ⚠️ ASIL SAYI BU. Üretim sürekli tüketimi aşarsa gold birikip
              değersizleşir ve market'te satılık gold'un fiyatı çöker; tersi
              olursa oyuncu hiçbir şey alamaz. Faz 2'deki tüm sink çalışması
              bu oranı dengelemek içindi ve o güne kadar ÖLÇÜLEMİYORDU. */}
          <div style={{ display: 'grid', gap: 8, marginTop: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <Stat label="Üretilen (musluk)" value={eco.faucet.toLocaleString('en-US')} />
            <Stat label="Harcanan (sink)" value={eco.sink.toLocaleString('en-US')} />
            <Stat
              label="Sink / musluk"
              value={eco.faucet > 0 ? `%${Math.round((eco.sink / eco.faucet) * 100)}` : '—'}
              tone={eco.faucet > 0 && eco.sink / eco.faucet < 0.35 ? 'warn' : undefined}
            />
            <Stat label="Net birikim" value={(eco.faucet - eco.sink).toLocaleString('en-US')}
              tone={eco.faucet - eco.sink > 0 ? 'warn' : undefined} />
            {/* ⚠️ AYRI KUTU, MUSLUĞA EKLİ DEĞİL. Crypt çekimi pozitif gold
                yazar ama yeni gold değildir; musluğa saymak panoyu yalancı
                yapardı (bkz. ledger.ts REDISTRIBUTION). */}
            <Stat label="El değiştiren (dağıtım)" value={eco.redistributed.toLocaleString('en-US')} />
          </div>

          {/* CRYPT VAULT — kasanın sağlığı.
              ⚠️ `ödenen ≤ giren` bozulursa bir yerde GOLD BASILMIŞ demektir.
              Bu yüzden ayrı bir satır değil, KIRMIZI YANAN bir uyarı. */}
          <div style={{ display: 'grid', gap: 8, marginTop: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <Stat label="Kasa bakiyesi" value={eco.vault.balance.toLocaleString('en-US')} />
            <Stat label="Kasaya giren" value={eco.vault.filled.toLocaleString('en-US')} />
            <Stat label="Kasadan ödenen" value={eco.vault.paid.toLocaleString('en-US')} />
            <Stat label="Kasa bütünlüğü"
              value={eco.vault.saglikli ? 'SAĞLAM' : 'BOZUK — GOLD BASILMIŞ'}
              tone={eco.vault.saglikli ? undefined : 'warn'} />
          </div>
          {eco.slices.length > 0 && (
            <Table head={['Kalem', 'Gold', 'İşlem']}>
              {eco.slices.map((sl) => (
                <tr key={sl.kind}>
                  <Td>{KIND_TR[sl.kind] ?? sl.kind}</Td>
                  <Td tone={sl.gold > 0 ? undefined : 'warn'}>
                    {sl.gold > 0 ? '+' : ''}{sl.gold.toLocaleString('en-US')}
                  </Td>
                  <Td>{sl.count}</Td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      )}

      {/* ⭐ ANOMALİ — "kim beklenenden çok kazanıyor".
          ⚠️ `goldPerHour` (oyuncu tablosunda) BAKİYE ÷ hesap yaşı, yani
          BİRİKTİRMEYİ ölçüyor. Her şeyini Forge'a yatıran oyuncu orada
          masum görünür; gold basıp harcayan da öyle. Buradaki sayı
          DEFTERDEKİ POZİTİF HAREKETLER — gerçekten kazanılan gold.
          ⚠️ `kat` ORTANCA aktif oyuncuya göre, sabit bir eşiğe göre değil:
          bu depoda sabit eşiklerin bayatladığı ÜÇ KEZ ölçüldü.
          ⚠️ BU BİR SUÇLAMA DEĞİL, SIRALAMA. Yeni derinlik açan dürüst
          oyuncu da kısa süre yüksek çıkar — karar `KIRPILAN` sütunu ve
          defter satırlarıyla birlikte verilir. */}
      {anom && anom.satirlar.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 15, color: C.bone }}>
            Anomali · son 7 gün
          </h2>
          <p style={{ margin: '0 0 8px', fontSize: 11.5, color: C.boneFaint, lineHeight: 1.5 }}>
            {anom.aktifOyuncu} aktif oyuncu · ortanca {anom.ortanca.toLocaleString('en-US')} gold/saat.
            {' '}Kat, o ortancaya göre. Yüksek kat tek başına suç değil — KIRPILAN sütununa ve
            defterine bak.
          </p>
          <Table head={['Cüzdan', 'Kazanç (7g)', 'Gold/saat', 'Ortancanın katı']}>
            {anom.satirlar.map((a) => (
              <tr key={a.wallet}>
                <Td mono title={a.wallet}>
                  <button onClick={() => void openDetail(a.wallet)}
                    style={{ ...btn, padding: '2px 6px' }}>
                    {a.wallet.slice(0, 4)}…{a.wallet.slice(-4)}
                  </button>
                </Td>
                <Td>{a.kazanc.toLocaleString('en-US')}</Td>
                <Td>{a.goldSaat.toLocaleString('en-US')}</Td>
                {/* ⚠️ 10 KAT UYARI EŞİĞİ — ölçülmüş bir sınır değil, GÖZE
                    ÇARPTIRMA eşiği. Sayı zaten ekranda; renk yalnız
                    operatörün önce nereye bakacağını söylüyor. */}
                <Td tone={a.kat >= 10 ? 'bad' : a.kat >= 4 ? 'warn' : undefined}>
                  {a.kat > 0 ? `${a.kat}×` : '—'}
                </Td>
              </tr>
            ))}
          </Table>
        </section>
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
          {/* ⚠️ ARAMA KUTUSU EKLENDİ — filtre ZATEN YAZILMIŞTI ama hiçbir
              girdiye bağlı değildi: `setQ` kod tabanında HİÇ çağrılmıyordu,
              yani aşağıdaki `.filter(...)` satırı ölü koddu ve yönetici
              cüzdan arayamıyordu. Bu depoda tekrar eden sınıf: yazılmış ama
              son adımda bağlanmamış özellik. */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="cüzdan ara…"
            style={{
              marginLeft: 'auto', minWidth: 'min(200px, 100%)', padding: '5px 9px',
              background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.border}`,
              borderRadius: 6, color: C.bone, fontSize: 12, fontFamily: 'inherit',
            }}
          />
          {q && (
            <button onClick={() => setQ('')} style={btn}>temizle</button>
          )}
        </div>
        <Table head={['Cüzdan', 'Gold', 'Bölüm', 'Karakter', 'Koşu', 'KIRPILAN', 'Gold/sa', 'Koşu/sa', '']}>
          {players
            .filter((p) => !q || p.wallet.toLowerCase().includes(q.toLowerCase()))
            .map((p) => (
            <tr key={p.wallet} style={{ background: p.banned ? 'rgba(160,18,38,0.14)' : undefined }}>
              <Td mono title={p.wallet}>
                <button onClick={() => void openDetail(p.wallet)}
                  style={{ all: 'unset', cursor: 'pointer', color: C.candle,
                    textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  {p.wallet.slice(0, 6)}…{p.wallet.slice(-4)}
                </button>
              </Td>
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

      {/* ── DESTEK TALEPLERİ ──
          ⚠️ Cevap yazmak tüm paneli yenilemiyor, sadece o talebi
          güncelliyor: 50 satırlık oyuncu/koşu listesini her mesajda
          yeniden çekmek paneli kullanılmaz yapardı. */}
      <section style={{ marginBottom: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15, color: C.bone }}>
            Destek talepleri
          </h2>
          {['open', 'answered', 'all'].map((f) => (
            <button key={f} onClick={() => {
              setTicketFilter(f);
              call<{ tickets: TicketRow[] }>(`/admin/tickets?status=${f}`)
                .then((t) => setTickets(t.tickets)).catch(() => setTickets([]));
            }}
              style={{
                all: 'unset', cursor: 'pointer', padding: '3px 10px', borderRadius: 5,
                fontSize: 11, fontWeight: 900,
                color: ticketFilter === f ? '#1a0508' : C.boneFaint,
                background: ticketFilter === f ? C.candle : 'rgba(255,255,255,0.06)',
              }}>
              {f}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.boneFaint }}>
            {tickets.length} talep
          </span>
        </div>

        {tickets.length === 0 ? (
          <div style={{ fontSize: 12, color: C.boneFaint }}>Bu filtrede talep yok.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tickets.map((t) => (
              <div key={t.id} style={{
                borderRadius: 8, padding: '10px 12px',
                border: `1px solid ${t.status === 'open' ? `${C.candle}55` : 'rgba(255,255,255,0.10)'}`,
                background: 'rgba(255,255,255,0.03)',
              }}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: C.bone }}>{t.subject}</span>
                  <span style={{ fontSize: 10, fontWeight: 900,
                    color: t.status === 'open' ? C.candle : C.boneFaint }}>
                    {t.status.toUpperCase()}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: C.boneFaint }}>
                    {new Date(t.bumpedAt).toLocaleString('tr-TR')}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5,
                  maxHeight: 230, overflowY: 'auto', marginBottom: 8 }}>
                  {t.messages.map((m, i) => (
                    <div key={i} style={{
                      alignSelf: m.fromAdmin ? 'flex-end' : 'flex-start', maxWidth: '85%',
                      padding: '6px 9px', borderRadius: 7, fontSize: 12, lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      color: C.bone,
                      background: m.fromAdmin ? 'rgba(239,167,46,0.14)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${m.fromAdmin ? `${C.candle}44` : 'rgba(255,255,255,0.09)'}`,
                    }}>
                      <span style={{ display: 'block', fontSize: 9, fontWeight: 900,
                        letterSpacing: 1, color: m.fromAdmin ? C.candle : C.boneFaint,
                        marginBottom: 2 }}>
                        {m.fromAdmin ? 'SEN' : 'OYUNCU'} · {new Date(m.at).toLocaleString('tr-TR')}
                      </span>
                      {m.body}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={ticketDraft[t.id] ?? ''}
                    onChange={(e) => setTicketDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                    placeholder="Cevabını yaz…"
                    style={{
                      flex: 1, minWidth: 0, padding: '6px 9px', borderRadius: 6,
                      border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)',
                      color: C.bone, fontFamily: FONT.ui, fontSize: 12, outline: 'none',
                    }} />
                  <button
                    disabled={(ticketDraft[t.id] ?? '').trim().length < 2}
                    onClick={() => {
                      call<{ ticket: TicketRow }>('/admin/tickets/reply', {
                        method: 'POST',
                        body: JSON.stringify({ id: t.id, body: ticketDraft[t.id] }),
                      }).then((r) => {
                        setTickets((ts) => ts.map((x) => (x.id === t.id ? r.ticket : x)));
                        setTicketDraft((d) => ({ ...d, [t.id]: '' }));
                      }).catch(() => setErr('Cevap gönderilemedi.'));
                    }}
                    style={{
                      all: 'unset', cursor: 'pointer', padding: '6px 13px', borderRadius: 6,
                      fontSize: 11.5, fontWeight: 900, color: '#1a0508', background: C.candle,
                    }}>
                    CEVAPLA
                  </button>
                  <button
                    onClick={() => {
                      call('/admin/tickets/close', {
                        method: 'POST', body: JSON.stringify({ id: t.id }),
                      }).then(() => setTickets((ts) => ts.filter((x) => x.id !== t.id)))
                        .catch(() => setErr('Kapatılamadı.'));
                    }}
                    style={{
                      all: 'unset', cursor: 'pointer', padding: '6px 11px', borderRadius: 6,
                      fontSize: 11.5, fontWeight: 900, color: C.boneFaint,
                      background: 'rgba(255,255,255,0.06)',
                    }}>
                    KAPAT
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── OYUNCU DOSYASI ── */}
      {detail && (
        <div onClick={() => setDetail(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(6,4,3,0.86)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '24px 14px', overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ ...glass(12), padding: 18, width: 'min(96vw, 860px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 15, color: C.bone, fontFamily: FONT.ui,
                wordBreak: 'break-all' }}>{detail.player.wallet}</h2>
              <button onClick={() => setDetail(null)} style={btn}>kapat</button>
            </div>

            <div style={{ display: 'grid', gap: 8, marginTop: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              <Stat label="Gold" value={detail.player.gold.toLocaleString('en-US')} />
              <Stat label="Bölüm" value={detail.player.unlockedStage} />
              <Stat label="Karakter" value={detail.player.hero} />
              <Stat label="Anıt" value={detail.player.ossuary ?? 0} />
              <Stat label="Toz" value={detail.player.dust ?? 0} />
              <Stat label="Durum" value={detail.player.banned ? 'BANLI' : 'aktif'}
                tone={detail.player.banned ? 'bad' : undefined} />
            </div>

            {/* ⭐ VERME — telafi, destek, etkinlik ödülü.
                ⚠️ SEBEP ZORUNLU ve bu bir form kaprisi değil: gerekçesiz
                verilen gold denetlenemez. Altı ay sonra "bu 50.000 nereden
                geldi" sorusunun tek cevabı bu alan ve defterdeki kaydı.
                ⚠️ Verilen gold DEFTERDEN geçiyor (`admin_grant`), yani hemen
                aşağıdaki tabloda ve `/admin/economy` musluk toplamında
                GÖRÜNÜYOR. Defterden geçmeseydi ekonomi panosu yalan söylerdi.
                ⚠️ Negatif de yazılabilir (geri alma) ama sunucu bakiyeyi
                negatife düşürmeyi reddeder. */}
            <h3 style={{ margin: '18px 0 0', fontSize: 13, color: C.bone }}>Ver / geri al</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
              <input value={grantGold} onChange={(e) => setGrantGold(e.target.value)}
                placeholder="gold (ör. 5000 veya -5000)" inputMode="numeric"
                style={{ width: 190, padding: '5px 9px', background: 'rgba(0,0,0,0.35)',
                  border: `1px solid ${C.border}`, borderRadius: 6, color: C.bone,
                  fontSize: 12, fontFamily: 'inherit' }} />
              <input value={grantDust} onChange={(e) => setGrantDust(e.target.value)}
                placeholder="toz" inputMode="numeric"
                style={{ width: 90, padding: '5px 9px', background: 'rgba(0,0,0,0.35)',
                  border: `1px solid ${C.border}`, borderRadius: 6, color: C.bone,
                  fontSize: 12, fontFamily: 'inherit' }} />
              <input value={grantSebep} onChange={(e) => setGrantSebep(e.target.value)}
                placeholder="sebep (zorunlu)"
                style={{ flex: 1, minWidth: 'min(200px, 100%)', padding: '5px 9px',
                  background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.bone, fontSize: 12, fontFamily: 'inherit' }} />
              <button
                disabled={grantMesgul || grantSebep.trim().length < 3
                  || (!grantGold.trim() && !grantDust.trim())}
                onClick={() => { void ver(detail.player.wallet); }}
                style={{ ...btn, ...(grantMesgul ? {} : btnOn) }}>
                {grantMesgul ? '…' : 'VER'}
              </button>
              {grantMesaj && (
                <span style={{ fontSize: 11.5, color: grantMesaj.startsWith('✓') ? C.ok : C.badText }}>
                  {grantMesaj}
                </span>
              )}
            </div>

            {/* ⚠️ ASIL YENİ ŞEY: gold hareketleri. "Bu hesap gold'u nereden
                buldu, nereye harcadı" sorusu bugüne kadar cevapsızdı. */}
            <h3 style={{ margin: '18px 0 0', fontSize: 13, color: C.bone }}>Gold defteri</h3>
            <Table head={['Zaman', 'Kalem', 'Gold', 'Ayrıntı']}>
              {detail.ledger.map((l) => (
                <tr key={l.id}>
                  <Td>{new Date(l.at).toLocaleString('tr-TR', {
                    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</Td>
                  <Td>{KIND_TR[l.kind] ?? l.kind}</Td>
                  <Td tone={l.gold > 0 ? undefined : 'warn'}>
                    {l.gold > 0 ? '+' : ''}{l.gold.toLocaleString('en-US')}
                  </Td>
                  <Td mono>{l.detail ?? '—'}</Td>
                </tr>
              ))}
            </Table>
            {!detail.ledger.length && (
              <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 8 }}>
                Defterde kayıt yok — bu hesap defter eklendikten sonra hiç hareket yapmamış.
              </div>
            )}

            <h3 style={{ margin: '18px 0 0', fontSize: 13, color: C.bone }}>Son koşular</h3>
            <Table head={['Mod', 'Bölüm', 'İddia', 'Verilen', 'Süre', 'Durum']}>
              {detail.runs.map((r) => (
                <tr key={r.id} style={{ background: r.capped ? 'rgba(160,18,38,0.14)' : undefined }}>
                  <Td>{r.mode}</Td>
                  <Td>{r.stageId}</Td>
                  <Td>{r.claimedDepth ?? '—'}</Td>
                  <Td>{r.awarded ?? '—'}</Td>
                  <Td tone={r.durationSec !== null && r.durationSec < 10 ? 'warn' : undefined}>
                    {r.durationSec === null ? 'açık' : `${r.durationSec}s`}
                  </Td>
                  <Td tone={r.capped ? 'bad' : undefined}>{r.capped ? 'KIRPILDI' : 'temiz'}</Td>
                </tr>
              ))}
            </Table>

            <button onClick={() => void toggleBan(detail.player.wallet, !detail.player.banned)}
              style={{ ...btn, marginTop: 14, color: detail.player.banned ? C.ok : C.bad }}>
              {detail.player.banned ? 'banı kaldır' : 'banla'}
            </button>
          </div>
        </div>
      )}
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
