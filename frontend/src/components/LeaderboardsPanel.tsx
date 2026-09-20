'use client';
// LEADERBOARDS — on bir pano, üç grup, tek panel.
//
// 🔴 NİYE VAR (kullanıcı): *"Şu an All time ve This week var. Her panoya
// ayrı bir sıralama yapalım… en fazla GOLD, en çok derinlik, descend
// turnuvası, bölüm+derinlik, toz, Forge, en iyi guild"* ve *"The PIT ve
// düels gibi panelleri de leaderboardsa eklemek lazım."*
//
// ⚠️ TEK PANEL, İKİ GİRİŞ: Tavern'in LEADERBOARD sekmesi ve köydeki kısayol
// (profil altı düğme / sohbetteki kupa) AYNI bileşeni açıyor. İkinci bir
// tablo yazılsaydı biri eskirdi.
//
// ⚠️ ÜÇ GRUP, ON BİR ÇİP DEĞİL: on bir düğme yan yana okunmaz. Grup soruyu
// söylüyor (ne kadar derin / ne kadar güçlü / kime karşı), çip pencereyi.
//
// ⚠️ METİN İSTEMCİDE: sunucu `value` (sıralama anahtarı) gönderiyor, cümleyi
// burada kuruyoruz — oyuncu metni tek yerde yaşar.

import { DOKUNMA_HEDEFI, useDokunmatik } from '@/lib/dokunmatik';
import { useEffect, useState, type ReactNode } from 'react';
import { STAGES } from '@/game/config';
import { cosmeticById } from '@/game/cosmetics';
import { duelTier } from '@/game/duel';
import { FORGE } from '@/game/forge';
import { oyuncuAdi } from '@/game/playerName';
import { SEASON_COSMETIC_DEPTH, SEASON_REWARDS, rewardForRank } from '@/game/season';
import { IdentityLine } from '@/components/ui/Identity';
import { Fade } from '@/components/ui/motion';
import { Card, PanelHead, Tag } from '@/components/ui/cards';
import {
  addFollow, fetchBoard,
  type Board, type BoardId, type BoardRow, type SeasonAwardRow,
} from '@/lib/gameSession';
import { panelUnlocked } from '@/lib/testMode';
import { getMode } from '@/lib/session';
import { C, FONT, glass } from '@/lib/theme';

type Grup = 'DEPTH' | 'POWER' | 'RIVALS';
const GRUPLAR: readonly Grup[] = ['DEPTH', 'POWER', 'RIVALS'];

interface PanoTanimi {
  id: BoardId;
  grup: Grup;
  /** çip üstündeki kısa ad */
  cip: string;
  baslik: string;
  /** tek cümle — panonun NEYİ ölçtüğü */
  aciklama: string;
  /** sırası olmayan cüzdan oyuncusuna ne yapması gerektiği */
  yerYok: string;
}

/**
 * ⚠️ SIRA = istemcideki çip sırası; KİMLİK LİSTESİ `BOARD_IDS` ile aynı
 * olmak zorunda (`boards.test` karşılaştırıyor).
 */
export const PANOLAR: readonly PanoTanimi[] = [
  {
    id: 'descent', grup: 'DEPTH', cip: 'THE DESCENT', baslik: 'Hardest descents',
    aciklama: 'Ranked by how hard the descent was, not how deep it counted. Depth 12 on a late road beats depth 40 on the first one.',
    yerYok: 'You have no place here yet. Clear a road, then take the stairs down.',
  },
  {
    id: 'season', grup: 'DEPTH', cip: 'DESCENT TRIALS', baslik: 'This week’s trials',
    aciklama: 'Your best descent this week, ranked the same way. The board clears every Monday and pays the top of the week.',
    yerYok: 'You have not set a mark this week. Take the stairs down to enter the trials.',
  },
  {
    id: 'daily', grup: 'DEPTH', cip: 'DAILY', baslik: 'Today’s shared road',
    aciklama: 'Everyone walks the same road today, once, with no bonuses. Deepest first; on a tie, whoever finished first.',
    yerYok: 'You have not walked today’s road yet.',
  },
  {
    id: 'gold', grup: 'POWER', cip: 'GOLD EARNED', baslik: 'Most gold earned',
    aciklama: 'Gold won from campaign and descent runs over a lifetime. Spending it never lowers your place.',
    yerYok: 'Finish a run to earn your first gold.',
  },
  {
    id: 'forge', grup: 'POWER', cip: 'FORGE', baslik: 'Deepest into the Forge',
    aciklama: 'Upgrade levels bought across the whole Forge tree.',
    yerYok: 'Buy your first upgrade at the Forge to be counted.',
  },
  {
    id: 'dust', grup: 'POWER', cip: 'DUST', baslik: 'Most dust held',
    aciklama: 'Dust on hand right now. Spending it moves you down.',
    yerYok: 'You hold no dust yet.',
  },
  {
    id: 'ossuary', grup: 'POWER', cip: 'OSSUARY', baslik: 'Tallest ossuaries',
    aciklama: 'How high each player has raised their Ossuary.',
    yerYok: 'Raise your Ossuary to be counted.',
  },
  {
    id: 'pit', grup: 'RIVALS', cip: 'THE PIT', baslik: 'The Pit, this week',
    aciklama: 'Duel standing for this week, among players who have finished their placement matches. It resets softly every Monday.',
    yerYok: 'Fight in The Pit this week to be counted.',
  },
  {
    id: 'answering', grup: 'RIVALS', cip: 'THE ANSWERING', baslik: 'Every duelist',
    aciklama: 'Everyone who has ever fought a duel, by current rating. The Pit shows the same rating, only for this week’s placed players.',
    yerYok: 'Fight your first duel to be counted.',
  },
  {
    id: 'guilds', grup: 'RIVALS', cip: 'GUILDS', baslik: 'Strongest guilds',
    aciklama: 'Ranked by guild level, then by gold donated.',
    yerYok: 'Join or found a guild to see it here.',
  },
  {
    id: 'boss', grup: 'RIVALS', cip: 'WEEKLY BOSS', baslik: 'Damage to this week’s boss',
    aciklama: 'Damage dealt to the shared weekly boss. The count starts over every Monday.',
    yerYok: 'Strike this week’s boss to be counted.',
  },
];

const FORGE_MAX = FORGE.reduce((n, u) => n + u.maxLevel, 0);

export function LeaderboardsPanel({ baslangic = 'descent', gomulu = false }: {
  baslangic?: BoardId;
  /**
   * Başka bir panelin sekmesi içinde (Tavern). ⚠️ Kendi başlığını ÇİZMEZ:
   * ölçüldü, Tavern'in başlığıyla üst üste iki başlık duruyordu ve üstteki
   * "Deepest descents" Gold/Guild panosunda yanlıştı.
   */
  gomulu?: boolean;
}) {
  const [id, setId] = useState<BoardId>(baslangic);
  const [pano, setPano] = useState<Board | null>(null);
  const [err, setErr] = useState(false);
  const tanim = PANOLAR.find((p) => p.id === id)!;

  useEffect(() => {
    let iptal = false;
    setPano(null); setErr(false);
    fetchBoard(id)
      .then((b) => { if (!iptal) setPano(b); })
      .catch(() => { if (!iptal) setErr(true); });
    // ⚠️ İPTAL BAYRAĞI ŞART: çipler arasında hızlı geçişte geç dönen istek
    // yeni panonun satırlarını ezerdi.
    return () => { iptal = true; };
  }, [id]);

  return (
    <>
      {gomulu
        ? <div style={{ fontSize: 15, fontWeight: 900, color: C.bone, margin: '0 0 8px', fontFamily: FONT.ui }}>{tanim.baslik}</div>
        : <PanelHead kicker="THE HALL OF RECORDS" accent={C.candle} title={tanim.baslik} />}
      <Secici id={id} onSec={setId} />
      <Fade keyed={id} slide>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: C.boneDim, lineHeight: 1.55, fontFamily: FONT.ui }}>
          {tanim.aciklama}
          {pano?.endsAt !== undefined && (
            <>{' '}<b style={{ color: C.candle }}>{kalanSure(pano.endsAt)}</b> left.</>
          )}
        </p>
        {err ? <Not>Could not reach the hall of records.</Not>
          : pano === null ? <Not>Reading the ledger…</Not>
          : <Tablo pano={pano} tanim={tanim} />}
      </Fade>
    </>
  );
}

function Secici({ id, onSec }: { id: BoardId; onSec: (id: BoardId) => void }) {
  const grup = PANOLAR.find((p) => p.id === id)!.grup;
  /** Parmakla mi kullaniliyor — sekme cipleri buna gore buyuyor (tek kaynak) */
  const dokunmatik = useDokunmatik();
  return (
    <div style={{ marginBottom: 12 }}>
      {/* 🔴 PIXELBUTTON DEĞİL — ölçüldü (375 px): panel içi 227 px, her
          PixelButton 120 px (dokuz-dilim kenarları scale 2'de 64 px yiyor).
          Üç grup ÜÇ SATIRA düşüyor ve panelin yarısını kaplıyordu. Üç eşit
          sütunlu bölmeli seçici her genişlikte tek satır. */}
      <div role="tablist" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginBottom: 8 }}>
        {GRUPLAR.map((g) => {
          const secili = g === grup;
          return (
            <button key={g} role="tab" aria-selected={secili}
              // ⚠️ Grup değişince o grubun İLK panosu açılır — boş seçim durumu yok.
              onClick={() => { if (!secili) onSec(PANOLAR.find((p) => p.grup === g)!.id); }}
              style={{
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer', textAlign: 'center',
                /* 🔴 Parmak hedefi: grup sekmeleri 28 px, pano cipleri 22 px idi */
                minHeight: dokunmatik ? DOKUNMA_HEDEFI : undefined,
                padding: dokunmatik ? '9px 4px' : '7px 4px', borderRadius: 6, fontFamily: FONT.ui,
                fontSize: 11, fontWeight: 900, letterSpacing: 1.2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: secili ? C.void : C.bone,
                background: secili ? C.candle : 'rgba(255,255,255,0.06)',
                border: `1px solid ${secili ? C.candle : C.border}`,
              }}>
              {g}
            </button>
          );
        })}
      </div>
      {/* ⚠️ Çipler SARMIYOR, yatay kayıyor: dar ekranda iki satıra düşen
          çipler grubun hangi satırda bittiğini belirsizleştiriyordu. */}
      <div role="tablist" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {PANOLAR.filter((p) => p.grup === grup).map((p) => {
          const secili = p.id === id;
          return (
            <button key={p.id} role="tab" aria-selected={secili} onClick={() => onSec(p.id)}
              style={{
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer', flexShrink: 0,
                minHeight: dokunmatik ? DOKUNMA_HEDEFI : undefined,
                padding: dokunmatik ? '0 14px' : '4px 10px', borderRadius: 999, fontFamily: FONT.ui,
                fontSize: 10, fontWeight: 900, letterSpacing: 1, whiteSpace: 'nowrap',
                color: secili ? C.candle : C.boneDim,
                background: secili ? 'rgba(239,167,46,0.13)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${secili ? `${C.candle}66` : C.border}`,
              }}>
              {p.cip}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Tablo({ pano, tanim }: { pano: Board; tanim: PanoTanimi }) {
  const benimMi = (r: BoardRow) => pano.me !== null && (pano.id === 'guilds'
    ? r.guild?.id === pano.me.guild?.id
    : r.wallet !== null && r.wallet === pano.me.wallet);
  const listede = pano.me !== null && pano.rows.some(benimMi);
  const cuzdanla = getMode() === 'wallet';

  return (
    <>
      {pano.rows.length === 0 ? (
        <Not>No one is on this board yet. The first name on it can be yours.</Not>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {pano.rows.map((r) => (
            <Line key={r.guild?.id ?? r.wallet ?? r.rank} pano={pano} row={r} mine={benimMi(r)} />
          ))}
        </div>
      )}

      {/* Kendi satırım listede yoksa altta — 50. sıranın dışındaki oyuncuya
          tablo tek başına hiçbir şey söylemezdi. */}
      {pano.me && !listede && (
        <>
          <div style={{ margin: '10px 0 6px', textAlign: 'center', fontSize: 11, color: C.boneFaint, letterSpacing: 2 }}>· · ·</div>
          <Line pano={pano} row={pano.me} mine />
        </>
      )}

      {/* ⚠️ Yalnız CÜZDAN modunda: demo oyuncusunun sunucuda kaydı yok ve
          "bir iniş yap" demek onu, sayılmayacağı bir koşuya yollardı. */}
      {!pano.me && cuzdanla && (
        <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 9,
          border: `1px solid ${C.candle}44`, fontSize: 11.5, color: C.boneDim,
          textAlign: 'center', lineHeight: 1.5, fontFamily: FONT.ui }}>
          {tanim.yerYok}
        </div>
      )}
      {pano.id === 'pit' && pano.me && pano.me.rank === 0 && pano.placement !== undefined && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: C.boneDim, textAlign: 'center', fontFamily: FONT.ui }}>
          {Math.max(0, pano.placement - (pano.me.matches ?? 0))} more matches until you are placed.
        </div>
      )}

      {pano.id === 'season' && (
        <>
          <SeasonRewards />
          {pano.awards && pano.awards.length > 0 && <PastAwards awards={pano.awards} />}
        </>
      )}
    </>
  );
}

/** Madalya rengi — ilk üç ayrışsın (paletten, yeni renk yok) */
function madalya(rank: number): string {
  return rank === 1 ? C.candle : rank === 2 ? C.bone : rank === 3 ? C.ice : C.boneFaint;
}

function Line({ pano, row, mine }: { pano: Board; row: BoardRow; mine: boolean }) {
  const { etiket, alt } = degerOf(pano, row);
  return (
    <Card accent={mine}>
      <div style={{ padding: '8px 11px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ width: 34, flexShrink: 0, fontSize: 13, fontWeight: 900, color: madalya(row.rank) }}>
          {/* `rank: 0` = The Pit'te henüz yerleşmemiş */}
          {row.rank > 0 ? `#${row.rank}` : '—'}
        </span>
        {/* ⚠️ `overflow: hidden` ŞART — ölçüldü (375 px): sağdaki kademe
            yazısı, sıkışan kimlik satırının ÜSTÜNE biniyordu. İkincil bilgi
            artık adın ALTINDA; sağda tek bir değer etiketi kalıyor. */}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {row.guild ? (
            <span style={{ fontSize: 12, fontWeight: 800, color: C.bone, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              <span style={{ color: C.candle }}>[{row.guild.tag}]</span> {row.name}
            </span>
          ) : (
            // ⚠️ Kimlik satırı: kozmetik prestij ANCAK BURADA görüldüğü için
            // değerli. Sadece Reliquary panelinde görünen bir unvana kimse gold
            // vermez ve sink işlevini kaybeder.
            <IdentityLine compact size={12} id={{
              // ⚠️ TEK ÇÖZÜCÜ — "You" kararı da orada (bkz. `oyuncuAdi`).
              name: oyuncuAdi({ wallet: row.wallet ?? '', name: row.name }, mine),
              title: row.equipped?.title,
              plate: row.equipped?.plate,
              trophy: row.equipped?.trophy,
              ossuary: row.ossuary,
            }} />
          )}
          {alt && (
            <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: C.boneFaint,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {alt}
            </span>
          )}
        </span>
        {etiket}
        {/* ⚠️ TAKİP GİRİŞİ TAM BURADA: oyuncunun başka birini ilk kez gördüğü
            yer bu satır. Loncada cüzdan yok, kendi satırında anlamsız. */}
        {!mine && row.wallet && <WatchButton wallet={row.wallet} />}
      </div>
    </Card>
  );
}

/** Sağdaki TEK değer etiketi + adın altındaki ikincil satır */
function degerOf(pano: Board, row: BoardRow): { etiket: ReactNode; alt?: ReactNode } {
  const sayi = (n: number) => n.toLocaleString('en-US');
  switch (pano.id) {
    case 'descent':
    case 'season': {
      const stage = STAGES.find((s) => s.id === row.stage);
      return { etiket: <Tag tone="gold">DEPTH {row.depth}</Tag>, alt: stage?.name ?? `Stage ${row.stage}` };
    }
    case 'daily': return { etiket: <Tag tone="gold">DEPTH {row.depth}</Tag> };
    case 'gold': return { etiket: <Tag tone="gold">{sayi(row.value)} GOLD</Tag> };
    case 'forge': return { etiket: <Tag tone="gold">{row.value} / {FORGE_MAX}</Tag> };
    case 'dust': return { etiket: <Tag tone="gold">{sayi(row.value)} DUST</Tag> };
    case 'ossuary': return { etiket: <Tag tone="gold">LEVEL {row.value}</Tag> };
    case 'pit':
    case 'answering': {
      const t = duelTier(row.value);
      return {
        etiket: <Tag tone="gold">{Math.round(row.value)}</Tag>,
        alt: <><span style={{ color: t.color, fontWeight: 900 }}>{t.name}</span> · {row.wins ?? 0}W {row.losses ?? 0}L</>,
      };
    }
    case 'guilds':
      return { etiket: <Tag tone="gold">LV {row.guild?.level}</Tag>, alt: `${row.guild?.members}/${row.guild?.cap} members` };
    case 'boss': return { etiket: <Tag tone="blood">{sayi(row.value)} DMG</Tag> };
  }
}

/**
 * SIRALAMA SATIRINDAN TAKİBE EKLE.
 *
 * 🔴 NİYE VAR: 2026-09-07'de ölçüldü — takip listesine birini eklemenin TEK
 * yolu 44 karakterlik bir cüzdan adresini ELLE YAPIŞTIRMAKTI. Sistem
 * çalışıyordu; girişi yoktu.
 *
 * ⚠️ Kendi satırında ÇIKMAZ ve demo modunda çıkmaz (sunucu yok).
 * 🔴 KENARLIK DÜZELDİ (taşınırken görüldü): `${C.border}66` yazılıydı ama
 * `C.border` zaten `rgba(...)` — sonuna `66` eklemek geçersiz bir renk
 * üretiyor ve tarayıcı bildirimi TÜMDEN atıyordu: boştaki düğmenin
 * kenarlığı hiç çizilmiyordu.
 */
function WatchButton({ wallet }: { wallet: string }) {
  const [durum, setDurum] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const dokunmatik = useDokunmatik();
  if (!panelUnlocked(getMode())) return null;
  const metin = durum === 'ok' ? 'WATCHING' : durum === 'err' ? 'FAILED' : 'WATCH';
  return (
    <button
      disabled={durum !== 'idle'}
      title={durum === 'ok' ? 'Added to your watch list' : 'Add to your watch list'}
      onClick={() => {
        setDurum('busy');
        // ⚠️ Zaten takiptekini yeniden eklemek sunucuda hata DEĞİL (upsert).
        addFollow(wallet).then(() => setDurum('ok')).catch(() => setDurum('err'));
      }}
      style={{
        all: 'unset', flexShrink: 0, cursor: durum === 'idle' ? 'pointer' : 'default',
        boxSizing: 'border-box',
        /* 🔴 OLCULDU (mobil denetim): dugme 15 px yuksekti, parmakla komsu
           satira basiliyordu. Dokunmatikte DOKUNMA_HEDEFI, faresinde eski
           kompakt hali — masaustunde 32 px'lik cip satiri sisirirdi. */
        minHeight: dokunmatik ? DOKUNMA_HEDEFI : undefined,
        display: dokunmatik ? 'inline-flex' : undefined,
        alignItems: dokunmatik ? 'center' : undefined,
        padding: dokunmatik ? '0 12px' : '2px 7px',
        borderRadius: 4, fontSize: dokunmatik ? 10 : 8.5, fontWeight: 900,
        letterSpacing: 1, fontFamily: FONT.ui,
        color: durum === 'ok' ? C.ok : durum === 'err' ? C.badText : C.boneFaint,
        border: `1px solid ${durum === 'ok' ? `${C.ok}66` : C.border}`,
        background: durum === 'ok' ? `${C.ok}12` : 'transparent',
        opacity: durum === 'busy' ? 0.5 : 1,
      }}
    >{metin}</button>
  );
}

/**
 * "3d 4h" — bitişe kalan süre.
 * Saniye GÖSTERMİYORUZ: geri sayan bir saat oyuncuya yapacak bir şey vermiyor.
 */
export function kalanSure(endsAt: number): string {
  const ms = Math.max(0, endsAt - Date.now());
  const sa = Math.floor(ms / 3_600_000);
  const g = Math.floor(sa / 24);
  return g > 0 ? `${g}d ${sa % 24}h` : `${sa}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

/**
 * ÖDÜL TABLOSU — oyuncunun neden tırmanacağını görmesi için.
 *
 * ⚠️ ÖDÜLLER KOZMETİK + TOZ, GOLD DEĞİL. Sıralama ödülü gold verseydi en iyi
 * oyuncu aynı zamanda en çok gold basan olurdu (bkz. game/season.ts).
 * ⚠️ Yeni panoların HİÇBİRİ ödül vermiyor (kullanıcı kararı) — bu tablo
 * yalnız DESCENT TRIALS'ta çiziliyor.
 */
function SeasonRewards() {
  return (
    <div style={{ ...glass(10), marginTop: 12, padding: '10px 12px', fontFamily: FONT.ui }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: C.candle, marginBottom: 8 }}>
        WHAT THE WEEK PAYS
      </div>
      {SEASON_REWARDS.map((r, i) => {
        const kozmetik = r.cosmetic ? cosmeticById(r.cosmetic) : undefined;
        // ⚠️ KOZMETİK ÇİZGİSİ GÖRÜNÜR OLMALI: ödülün iki CİNSİ var — taşınan
        // bir şey (ilk 10) ve bir toz teşekkürü (11-100).
        const ayrac = i > 0 && !!SEASON_REWARDS[i - 1].cosmetic && !r.cosmetic;
        return (
          <div key={`${r.from}-${r.to}`}>
            {ayrac && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7,
                margin: '7px 0 5px', fontSize: 9, fontWeight: 900,
                letterSpacing: 1.4, color: C.boneFaint,
              }}>
                <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.10)' }} />
                DUST ONLY
                <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.10)' }} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span style={{ width: 52, flexShrink: 0, fontSize: 11.5, fontWeight: 900,
                color: r.from === 1 ? C.candle : C.boneDim }}>
                {r.from === r.to ? `#${r.from}` : `#${r.from}-${r.to}`}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11.5,
                color: r.cosmetic ? C.bone : C.boneDim,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {kozmetik?.name ?? r.label}
              </span>
              <Tag tone="gold">{r.dust} DUST</Tag>
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: 7, fontSize: 10.5, color: C.boneFaint, lineHeight: 1.5 }}>
        These relics cannot be bought or pulled — only a week&apos;s top{' '}
        {SEASON_COSMETIC_DEPTH} ever wears one. Everyone else who set a mark
        this week is still counted, and paid in dust.
      </div>
    </div>
  );
}

/** Oyuncunun geçmiş sezon ödülleri — kazandığını görmezse ödül yok gibidir */
function PastAwards({ awards }: { awards: SeasonAwardRow[] }) {
  return (
    <div style={{ ...glass(10), marginTop: 10, padding: '10px 12px', fontFamily: FONT.ui }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: C.bone, marginBottom: 8 }}>
        YOUR PAST WEEKS
      </div>
      {awards.map((a) => {
        const kozmetik = a.cosmetic ? cosmeticById(a.cosmetic) : undefined;
        return (
          <div key={a.week} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 11.5 }}>
            <span style={{ width: 46, flexShrink: 0, fontWeight: 900,
              color: a.rank === 1 ? C.candle : C.boneDim }}>#{a.rank}</span>
            <span style={{ flex: 1, minWidth: 0, color: C.boneDim,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {kozmetik?.name ?? rewardForRank(a.rank)?.label ?? '-'}
            </span>
            <Tag tone="gold">+{a.dust}</Tag>
          </div>
        );
      })}
    </div>
  );
}

function Not({ children }: { children: ReactNode }) {
  return (
    <div style={{ ...glass(9), padding: '16px 14px', fontSize: 12, color: C.boneFaint,
      textAlign: 'center', lineHeight: 1.6, fontFamily: FONT.ui }}>
      {children}
    </div>
  );
}
