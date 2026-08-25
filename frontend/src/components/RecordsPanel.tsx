'use client';
// TAVERN — oyuncunun sicili.
//
// Bu panel BUGÜN gerçek olabiliyor çünkü tüm veri zaten Progress'te duruyor;
// backend beklemesine gerek yok. Market/Exchange'in aksine burada uydurma bir
// "yakında" ekranı göstermek gereksiz olurdu.

import { useEffect, useMemo, useState } from 'react';
import { STAGES, depthGold, MAX_WEAPONS } from '@/game/config';
import { FORGE, costOf, spentOn } from '@/game/forge';
import { paidDepth, type Progress } from '@/game/progress';
import { PixelButton, BTN } from '@/components/ui/kit';
import { Fade } from '@/components/ui/motion';
import { Card, PanelHead, Tag } from '@/components/ui/cards';
import {
  fetchLeaderboard, fetchProfile, fetchSeasonBoard,
  type LeaderRow, type ProfileData, type ProfileRun, type SeasonAwardRow,
} from '@/lib/gameSession';
import { SEASON_COSMETIC_DEPTH, SEASON_REWARDS, rewardForRank } from '@/game/season';
import { cosmeticById } from '@/game/cosmetics';
import { IdentityLine, identityOf } from '@/components/ui/Identity';
import { AchievementsTab } from '@/components/AchievementsTab';
import { achievementStates } from '@/game/achievements';
import { armoury } from '@/game/unlocks';
import { weaponArt } from '@/game/combatArt';
import { streakAvailable } from '@/lib/gameSession';
import { C, FONT, glass } from '@/lib/theme';

export function RecordsPanel({ progress, onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError: (msg: string) => void;
}) {
  const [tab, setTab] = useState<'record' | 'deeds' | 'armoury' | 'history' | 'board'>('record');
  // ⚠️ Rozet SERİYİ de sayıyor: alınabilir bir şey varken sekmenin sessiz
  // durması, günlük ödülün fark edilmemesinin en kolay yolu olurdu.
  // Kilitli silah sayısı — sekmede rozet olarak. ⚠️ "Kazanılacak bir şey var"
  // sinyali sessiz kalırsa oyuncu cephaneliğe hiç bakmaz.
  const kilitli = useMemo(
    () => armoury(progress).filter((r) => !r.unlocked).length,
    [progress],
  );
  const claimableCount = useMemo(
    () => achievementStates(progress).filter((s) => s.claimable).length
      + (streakAvailable(progress) ? 1 : 0),
    [progress],
  );

  return (
    <>
      <PanelHead
        kicker="THE TAVERN" accent={C.boneDim}
        title={tab === 'record' ? 'Your record'
          : tab === 'deeds' ? 'Deeds and vigil'
          : tab === 'armoury' ? 'What you may carry'
          : tab === 'history' ? 'Every road walked' : 'Deepest descents'}
      />

      {/* 🔴 SEKMELER KESİLİYORDU: "MY …", "DEE…", "ARM…". Sebep `flex: 1` ile
          beş düğmeyi eşit bölmekti — `PixelButton` ölçek 2'de kenarlığa 64 px
          harcıyor (48×16 varlığın 16'şar piksellik iki kenarı × 2), yani dar
          bir sütunda metne yer kalmıyor ve `textOverflow: ellipsis` devreye
          giriyor. Düğmeler artık DOĞAL genişlikte; sığmazsa `flexWrap` ikinci
          satıra indiriyor. Okunmayan bir sekme, olmayan bir sekmedir. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <PixelButton variant={BTN.strong} scale={2} active={tab ==='record'} onClick={() => setTab('record')}
          style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8, minWidth: 0, padding: '0 8px' }}>
          MY RECORD
        </PixelButton>
        <PixelButton variant={BTN.strong} scale={2} active={tab ==='deeds'} onClick={() => setTab('deeds')}
          style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8, minWidth: 0, padding: '0 8px' }}>
          DEEDS{claimableCount > 0 ? ` (${claimableCount})` : ''}
        </PixelButton>
        {/* ⚠️ CEPHANELİK BURADA, bölüm seçiminde DEĞİL. Tavern zaten
            "ne kazandım" sorusunun sorulduğu yer; silah kilidi de kazanılan
            bir şey. Bölüm seçimine koymak koşuya girmeden önceki ekranı
            kalabalıklaştırırdı. */}
        <PixelButton variant={BTN.strong} scale={2} active={tab ==='armoury'} onClick={() => setTab('armoury')}
          style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8, minWidth: 0, padding: '0 8px' }}>
          ARMOURY{kilitli > 0 ? ` (${kilitli})` : ''}
        </PixelButton>
        {/* ⚠️ Koşu geçmişi AYRI BİR SAYFA (/profile) DEĞİL, Tavern'in bir
            sekmesi. Bu oyunda profil zaten burası; ayrı bir rota açmak aynı
            bilgiyi iki yerde göstermek olurdu. */}
        <PixelButton variant={BTN.strong} scale={2} active={tab ==='history'} onClick={() => setTab('history')}
          style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8, minWidth: 0, padding: '0 8px' }}>
          HISTORY
        </PixelButton>
        <PixelButton variant={BTN.strong} scale={2} active={tab ==='board'} onClick={() => setTab('board')}
          style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8, minWidth: 0, padding: '0 8px' }}>
          LEADERBOARD
        </PixelButton>
      </div>

      {/* ⚠️ Sekme geçişi TEK sarmalayıcıda — beş dala ayrı ayrı animasyon
          yazmak, biri unutulunca yarım bir geçiş bırakırdı. */}
      <Fade keyed={tab} slide>
      {tab === 'record' ? <MyRecord progress={progress} />
        : tab === 'deeds' ? <AchievementsTab progress={progress} onChange={onChange} onError={onError} />
        : tab === 'armoury' ? <Armoury progress={progress} />
        : tab === 'history' ? <History />
        : <Leaderboard />}
      </Fade>

    </>
  );
}

/**
 * CEPHANELİK — hangi silahı taşıyabilirsin, hangisini nasıl kazanırsın.
 *
 * ⚠️ KİLİTLİ OLANLAR DA LİSTELENİR, adıyla ve koşuluyla. Gizleseydik açılış
 * sistemi görünmez olurdu ve düzeltmeye çalıştığımız sorun aynen sürerdi:
 * oyuncu neyi kazanabileceğini bilmiyor. Kilidin bir anlamı olması için
 * hedefin GÖRÜNMESİ şart.
 *
 * ⚠️ Evrimler burada YOK. Onlar kilit değil, bir build hedefi (taban silah
 * MAX + doğru pasif MAX + boss sandığı) ve ayrı bir kavram; aynı listeye
 * koymak "bunu da açabilirim" sanılmasına yol açardı.
 */
function Armoury({ progress }: { progress: Progress }) {
  const rows = useMemo(() => armoury(progress), [progress]);
  const acik = rows.filter((r) => r.unlocked).length;

  return (
    <>
      {/* ⚠️ SAYI `MAX_WEAPONS`TEN OKUNUYOR, elle YAZILMIYOR. Burada "six"
          yazılıydı ve yuva sayısı 4'e inince metin sessizce YALAN söylemeye
          başlayacaktı — oyuncuya asla dolduramayacağı iki yuva vaat eden bir
          cümle. Sabitten türeyen metin yalan söyleyemez. */}
      <p style={{ margin: '0 0 12px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        Weapons appear as level-up choices once you have earned them. You can
        carry {MAX_WEAPONS} in a single run — the fewer you spread across,
        the further each one levels.
      </p>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: C.candle }}>{acik}</span>
        <span style={{ fontSize: 12, color: C.boneFaint }}>of {rows.length} unlocked</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r) => (
          <Card key={r.id} dim={!r.unlocked}>
            <div style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* İkon açıkken renkli, kilitliyken soluk — durum bir bakışta */}
              <img src={weaponArt(r.id).icon} alt="" width={20} height={20}
                style={{
                  imageRendering: 'pixelated', flexShrink: 0,
                  opacity: r.unlocked ? 1 : 0.28,
                  filter: r.unlocked ? 'none' : 'grayscale(1)',
                }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800,
                  color: r.unlocked ? C.bone : C.boneFaint }}>
                  {r.name}
                </span>
                <span style={{ display: 'block', fontSize: 10.5, lineHeight: 1.45,
                  color: C.boneFaint }}>
                  {/* ⚠️ Kilitliyken NE OLDUĞU değil NASIL AÇILDIĞI yazıyor:
                      oyuncunun burada ihtiyacı olan bilgi hedef, tanıtım değil. */}
                  {r.unlocked ? r.desc : r.how}
                </span>
              </span>
              {r.unlocked ? <Tag tone="gold">READY</Tag> : <Tag>LOCKED</Tag>}
            </div>
          </Card>
        ))}
      </div>
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
      {/* Takılı kozmetikler burada da görünür — oyuncu satın aldığı şeyi
          leaderboard'a çıkmadan ÖNCE kendi kaydında görebilmeli. */}
      <div style={{ marginBottom: 10 }}>
        <IdentityLine size={17} id={identityOf(progress, 'You')} />
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        Everything the village knows about you.
      </p>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))' }}>
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
            <Card key={s.id} dim={locked}>
              <div style={{ padding: '9px 11px', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: C.bone }}>
                  <span style={{ color: C.boneFaint, marginRight: 5 }}>{s.id}</span>{s.name}
                </span>
                {locked ? <Tag>NOT CLEARED</Tag>
                  : best > 0 ? (
                    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                      <Tag tone="gold">DEPTH {best}</Tag>
                      <span style={{ fontSize: 10.5, color: C.boneFaint, whiteSpace: 'nowrap' }}>
                        next pays {depthGold(s.id, best + 1).toLocaleString('en-US')}
                      </span>
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                      <Tag tone="blood">UNTOUCHED</Tag>
                      <span style={{ fontSize: 10.5, color: C.boneFaint, whiteSpace: 'nowrap' }}>
                        depth 1 pays {depthGold(s.id, 1).toLocaleString('en-US')}
                      </span>
                    </span>
                  )}
              </div>
            </Card>
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
  // ⚠️ BEŞİNCİ BİR ÜST SEKME DEĞİL. İkisi de aynı soruyu soruyor ("kim en
  // derine indi"), sadece pencere farklı. Üstte ayrı bir düğme olsaydı oyuncu
  // ikisini rakip iki tablo sanardı.
  const [scope, setScope] = useState<'all' | 'season'>('all');
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [me, setMe] = useState<{ rank: number; row: LeaderRow } | null>(null);
  const [season, setSeason] = useState<{ endsAt: number; awards: SeasonAwardRow[] } | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let iptal = false;
    setRows(null); setErr(false);
    const istek = scope === 'season'
      ? fetchSeasonBoard().then((r) => {
        if (iptal) return;
        setRows(r.rows); setMe(r.me); setSeason({ endsAt: r.endsAt, awards: r.awards });
      })
      : fetchLeaderboard().then((r) => {
        if (iptal) return;
        setRows(r.rows); setMe(r.me); setSeason(null);
      });
    istek.catch(() => { if (!iptal) setErr(true); });
    // ⚠️ İPTAL BAYRAĞI ŞART: sekmeler arasında hızlı geçişte geç dönen istek
    // yeni sekmenin satırlarını ezerdi.
    return () => { iptal = true; };
  }, [scope]);

  const secici = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      <PixelButton variant={BTN.strong} scale={2} active={scope === 'all'} onClick={() => setScope('all')}
        style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8, minWidth: 0, padding: '0 10px' }}>
        ALL-TIME
      </PixelButton>
      <PixelButton variant={BTN.strong} scale={2} active={scope === 'season'} onClick={() => setScope('season')}
        style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8, minWidth: 0, padding: '0 10px' }}>
        THIS WEEK
      </PixelButton>
    </div>
  );

  if (err) {
    return <>{secici}<Note>Could not reach the hall of records.</Note></>;
  }
  if (rows === null) {
    return <>{secici}<Note>Reading the ledger…</Note></>;
  }
  if (rows.length === 0) {
    return (
      <>
        {secici}
        <Note>
          {scope === 'season'
            ? 'No one has taken the stairs this week. The board is empty, and the first name on it can be yours.'
            : 'No one has descended yet. Clear a stage, take the stairs down, and the first name on this board is yours.'}
        </Note>
        {scope === 'season' && <SeasonRewards />}
      </>
    );
  }

  // Kendi satırım listede yoksa altta ayrıca göster — 50. sıranın dışındaki
  // oyuncuya tablo hiçbir şey söylemezdi.
  const inList = me !== null && rows.some((r) => r.wallet === me.row.wallet);

  return (
    <>
      {secici}
      <p style={{ margin: '0 0 12px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        Ranked by how hard the descent was, not how deep it counted. Depth 12 on
        a late road beats depth 40 on the first one.
        {scope === 'season' && season && (
          <>
            {' '}This board clears every Monday.{' '}
            <b style={{ color: C.candle }}>{kalanSure(season.endsAt)}</b> left.
          </>
        )}
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

      {scope === 'season' && (
        <>
          <SeasonRewards />
          {season && season.awards.length > 0 && <PastAwards awards={season.awards} />}
        </>
      )}
    </>
  );
}

/**
 * "3d 4h" — hafta bitişine kalan süre.
 * Saniye GÖSTERMİYORUZ: geri sayan bir saat oyuncuya yapacak bir şey vermiyor,
 * sadece her saniye yeniden çizim maliyeti getiriyordu.
 */
function kalanSure(endsAt: number): string {
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
 */
function SeasonRewards() {
  return (
    <div style={{ ...glass(10), marginTop: 12, padding: '10px 12px', fontFamily: FONT.ui }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: C.candle, marginBottom: 8 }}>
        WHAT THE WEEK PAYS
      </div>
      {SEASON_REWARDS.map((r, i) => {
        const kozmetik = r.cosmetic ? cosmeticById(r.cosmetic) : undefined;
        // ⚠️ KOZMETİK ÇİZGİSİ GÖRÜNÜR OLMALI. Tablo 100 sıraya genişledi ama
        // ödülün iki farklı CİNSİ var: taşınan bir şey (ilk 10) ve bir toz
        // teşekkürü (11-100). Aynı listede ayrımsız dizmek, 40. sıradaki
        // oyuncuya "ben de kalıntı alacağım" dedirtirdi — sonra almayınca da
        // haklı olarak kandırıldığını düşünürdü.
        const oncekiKozmetikli = i > 0 && !!SEASON_REWARDS[i - 1].cosmetic;
        const ayrac = oncekiKozmetikli && !r.cosmetic;
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

/**
 * KOŞU GEÇMİŞİ — Run tablosunda biriken ama bugüne kadar hiç gösterilmeyen veri.
 *
 * ⚠️ Buradaki HİÇBİR sayı istemciden gelmiyor (bkz. backend/profile.ts):
 * süre sunucu saatinden, gold sunucunun kendi hesabından, derinlik ise
 * `settleRun`'ın KIRPTIĞI değerden. Oyuncuya kendi iddiasını geri göstermek,
 * kırpılmış bir koşuyu başarı gibi okutmak olurdu.
 */
function History() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetchProfile().then(setData).catch(() => setErr(true));
  }, []);

  if (err) {
    return (
      <Note>
        Run history lives on the server. Connect a wallet and every descent you make
        from then on is written down — how deep, how long, what it paid.
      </Note>
    );
  }
  if (!data) return <Note>Reading the ledger…</Note>;
  if (!data.totals.runs) {
    return <Note>No runs recorded yet. The ledger fills itself once you go below.</Note>;
  }

  const t = data.totals;
  const saat = Math.floor(t.playSec / 3600);
  const dakika = Math.floor((t.playSec % 3600) / 60);

  return (
    <>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <Stat label="Runs finished" value={t.runs.toLocaleString('en-US')} />
        <Stat label="Time below" value={saat > 0 ? `${saat}h ${dakika}m` : `${dakika}m`} accent />
        <Stat label="Gold earned" value={t.goldEarned.toLocaleString('en-US')} accent />
        {t.wagersPlaced > 0 && (
          <Stat label="Wagers won" value={`${t.wagersWon} / ${t.wagersPlaced}`} />
        )}
      </div>

      {/* ⚠️ Kırpılan koşular oyuncudan GİZLENMİYOR. Gizli bir sicil tutmak,
          oyuncunun neden ödül alamadığını hiç anlayamaması demekti. */}
      {t.capped > 0 && (
        <div style={{
          marginTop: 10, padding: '9px 11px', borderRadius: 7, fontSize: 11,
          color: C.boneDim, lineHeight: 1.45,
          background: 'rgba(160,18,38,0.10)', border: '1px solid rgba(160,18,38,0.28)',
        }}>
          <strong style={{ color: C.bloodSoft }}>{t.capped}</strong> of your runs were trimmed —
          the depth claimed was more than the time allowed for. Trimmed runs still pay,
          but they never set a record.
        </div>
      )}

      <div style={{ margin: '16px 0 8px', fontSize: 11, fontWeight: 900, letterSpacing: 1.6, color: C.boneFaint }}>
        LAST {data.runs.length} RUNS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {data.runs.map((r) => <RunLine key={r.id} run={r} />)}
      </div>
    </>
  );
}

function RunLine({ run }: { run: ProfileRun }) {
  const stage = STAGES.find((s) => s.id === run.stageId);
  const sure = run.durationSec === null ? null
    : `${Math.floor(run.durationSec / 60)}:${String(run.durationSec % 60).padStart(2, '0')}`;
  const tarih = new Date(run.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <Card dim={run.durationSec === null}>
      <div style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ width: 42, flexShrink: 0, fontSize: 10, color: C.boneFaint }}>{tarih}</span>
        <span style={{ flex: 1, minWidth: 90, fontSize: 11.5, color: C.boneDim,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {stage?.name ?? `Stage ${run.stageId}`}
        </span>
        {run.mode === 'descent' && run.depth !== null && <Tag tone="gold">D{run.depth}</Tag>}
        {run.capped && <Tag tone="blood">TRIMMED</Tag>}
        {run.wagerStake > 0 && (
          <Tag tone={run.wagerWon ? 'gold' : 'dim'}>{run.wagerWon ? 'BET WON' : 'BET LOST'}</Tag>
        )}
        {sure && <span style={{ fontSize: 10, color: C.boneFaint, width: 40, textAlign: 'right' }}>{sure}</span>}
        <span style={{ width: 62, textAlign: 'right', flexShrink: 0, fontSize: 11.5, fontWeight: 800,
          color: run.awarded ? C.candle : C.boneFaint }}>
          {run.durationSec === null ? 'open' : `+${(run.awarded ?? 0).toLocaleString('en-US')}`}
        </span>
      </div>
    </Card>
  );
}

function Line({ row, mine }: { row: LeaderRow; mine: boolean }) {
  const stage = STAGES.find((s) => s.id === row.stage);
  const medal = row.rank === 1 ? C.candle : row.rank <= 3 ? C.bone : C.boneFaint;
  return (
    <Card accent={mine}>
      <div style={{ padding: '8px 11px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 30, flexShrink: 0, fontSize: 13, fontWeight: 900, color: medal }}>
          #{row.rank}
        </span>
        {/* ⚠️ Kimlik satırı: kozmetik prestij ANCAK BURADA görüldüğü için
            değerli. Sadece Reliquary panelinde görünen bir unvana kimse gold
            vermez ve sink işlevini kaybeder. */}
        <span style={{ flex: 1, minWidth: 0 }}>
          <IdentityLine compact size={12} id={{
            name: mine ? 'You' : `${row.wallet.slice(0, 4)}…${row.wallet.slice(-4)}`,
            title: row.equipped?.title,
            plate: row.equipped?.plate,
            trophy: row.equipped?.trophy,
          }} />
        </span>
        <Tag tone="gold">DEPTH {row.depth}</Tag>
        <span style={{ flexShrink: 0, fontSize: 10, color: C.boneFaint, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {stage?.name ?? `Stage ${row.stage}`}
        </span>
      </div>
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

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ ...glass(10), padding: '10px 12px', fontFamily: FONT.ui }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 900, color: accent ? C.candle : C.bone, marginTop: 3 }}>{value}</div>
    </div>
  );
}
