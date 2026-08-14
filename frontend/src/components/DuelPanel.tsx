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
import { BTN, PixelButton } from '@/components/ui/kit';
import { panelUnlocked } from '@/lib/testMode';
import { DUEL, duelTier } from '@/game/duel';
import { stageById } from '@/game/config';
import { heroById } from '@/game/heroes';
import { fetchDuels, fetchPvpSeason, findDuel, type DuelBoard, type DuelRow, type PvpSeasonRow, type PvpSeasonState } from '@/lib/gameSession';
import { PVP_PAYOUT_DEPTH, pvpReward } from '@/game/pvpSeason';
import { DuelBriefing } from '@/components/DuelBriefing';
import { displayWallet, getMode } from '@/lib/session';
import { Card, CardSection, PanelHead, Tag } from '@/components/ui/cards';
import { C, FONT, glass } from '@/lib/theme';

const kisa = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export function DuelPanel({ hero, onHero, onChallenge, onError }: {
  /** seçili kahraman — brifingde değiştirilebiliyor */
  hero: string;
  onHero: (id: string) => void;
  onChallenge: (recordId: string) => void;
  onError: (msg: string) => void;
}) {
  const [board, setBoard] = useState<DuelBoard | null>(null);
  const [err, setErr] = useState(false);
  /**
   * ⚠️ ANSWER ARTIK DOĞRUDAN KOŞU BAŞLATMIYOR, BRİFİNG AÇIYOR.
   * Eskiden düğmeye basınca oyuncu kime karşı oynadığını, hedefini ve
   * kuralları göremeden koşuya düşüyordu — bir maçın en önemli kararları
   * başlamadan önce veriliyor.
   */
  const [brifing, setBrifing] = useState<DuelRow | null>(null);
  const [wallet, setWallet] = useState('');
  const [araniyor, setAraniyor] = useState(false);
  const [sezon, setSezon] = useState<PvpSeasonState | null>(null);
  // ⚠️ `displayWallet` — gerçek cüzdan DEĞİL, "bu satır benim mi" için
  useEffect(() => { setWallet(displayWallet() ?? ''); }, []);

  const yukle = useCallback(() => {
    fetchDuels().then(setBoard).catch(() => setErr(true));
  }, []);
  useEffect(() => { if (panelUnlocked(getMode())) yukle(); }, [yukle]);
  useEffect(() => {
    if (!panelUnlocked(getMode())) return;
    fetchPvpSeason().then(setSezon).catch(() => { /* sezon süs, panel çalışmaya devam eder */ });
  }, []);

  if (!panelUnlocked(getMode())) {
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

      {/* ── EŞLEŞME BUL ──
          ⚠️ LİSTEDEN SEÇMEK YETMİYORDU. Tablo puana göre sıralı; oyuncu
          doğal olarak en zayıfı seçiyor ve ladder "en kolay hedefi bul"
          oyununa dönüyordu. Bu düğme PUAN YAKINLIĞINA göre eşleştiriyor —
          karşına dengin çıkıyor. Liste yine duruyor: kimi seçtiğini bilmek
          isteyen seçebilsin. */}
      {/* ⚠️ BTN.strong — eşleşme aramak bir KOŞU açıyor, yani geri dönüşü
          olmayan bir taahhüt. Altın doku "gold harcıyorsun" der ve yanıltırdı;
          burada harcanan gold değil, günün düello hakkı. */}
      <PixelButton
        variant={BTN.strong} scale={3}
        disabled={araniyor}
        onClick={() => {
          setAraniyor(true);
          findDuel()
            .then(setBrifing)
            .catch((e) => onError(e instanceof Error ? e.message : 'No match found.'))
            .finally(() => setAraniyor(false));
        }}
        style={{ width: '100%', marginBottom: 13, fontSize: 13, fontWeight: 900, letterSpacing: 1.4 }}>
        {araniyor ? 'LOOKING FOR SOMEONE…' : 'FIND A MATCH'}
      </PixelButton>

      {/* ── SEZON SIRALAMASI — KENDİ KARTINDA ──
          ⚠️ Koşu tablosundan AYRI. Düellonun puanı bambaşka bir eksende
          (derinlik değil, kimi yendiğin); ikisini aynı listede göstermek
          iki farklı başarıyı tek sayıya indirirdi.
          ⚠️ SEZONLUK. Puan sonsuza kadar birikseydi ilk ay tırmanan
          kilitlenir, sonradan gelen asla yetişemezdi — ikisi de bırakırdı. */}
      <CardSection label={sezon ? `This season — ends weekly` : 'Standings'} tone={C.candle}>
        {!sezon ? (
          <div style={{ fontSize: 11.5, color: C.boneDim }}>Reading the ladder…</div>
        ) : (
          <>
            {/* ⚠️ YERLEŞİM DURUMU EN ÜSTTE. Oyuncu tabloda kendini
                bulamayınca "bozuk" sanıyor; kaç maç kaldığı YAZILI olmalı. */}
            {sezon.me && sezon.me.rank === 0 && (
              <div style={{ marginBottom: 7, padding: '8px 10px', borderRadius: 7,
                background: 'rgba(239,167,46,0.12)', border: `1px solid ${C.candle}44`,
                fontSize: 11.5, color: C.candleSoft, lineHeight: 1.5 }}>
                {sezon.placement - sezon.me.matches} more {sezon.placement - sezon.me.matches > 1 ? 'matches' : 'match'} to
                enter the ladder — {sezon.me.matches}/{sezon.placement} played.
              </div>
            )}
            {sezon.rows.length === 0 ? (
              <div style={{ fontSize: 11.5, color: C.boneDim, lineHeight: 1.55 }}>
                Nobody has placed this season yet. {sezon.placement} matches puts your
                name here.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {sezon.rows.map((r) => (
                  <Ladder key={r.wallet} row={r} me={r.wallet === wallet} />
                ))}
                {sezon.me && sezon.me.rank > 0
                  && !sezon.rows.some((r) => r.wallet === wallet) && (
                  <>
                    <div style={{ textAlign: 'center', fontSize: 11, color: C.boneFaint }}>···</div>
                    <Ladder row={sezon.me} me />
                  </>
                )}
              </div>
            )}
            {/* ⚠️ ÖDÜLÜN NE OLDUĞU GÖRÜNMELİ — görünmeyen ödül, olmayan ödüldür */}
            <div style={{ marginTop: 7, fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
              Top {PVP_PAYOUT_DEPTH} take dust when the season closes; first place
              also takes <b style={{ color: C.candle }}>the Undying</b> — a title the
              Reliquary never sells. Ratings then settle back toward the middle.
            </div>
            {sezon.awards.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.boneDim }}>
                Last season you finished <b style={{ color: C.candle }}>#{sezon.awards[0].rank}</b>
                {' '}(+{sezon.awards[0].dust} dust).
              </div>
            )}
          </>
        )}
      </CardSection>

      {/* ── TÜM ZAMANLAR ──
          ⚠️ NİYE VAR: sunucu bu tabloyu ZATEN hesaplayıp `/duel` yanıtında
          gönderiyordu (`ladder`) ve panel onu HİÇ ÇİZMİYORDU — her açılışta
          üç sorgu çalışıp çöpe gidiyordu. Testi de vardı: sıralama azalan,
          rank 1'den başlar, hiç düello oynamamışlar elenir, tablo dışındaysan
          sıran yine bildirilir. Çalışan ve doğrulanmış bir şeyi silmek yerine
          göstermek doğru olan.
          ⚠️ SEZON TABLOSUNUN ALTINDA. İkisi ayrı soruya cevap veriyor —
          "bu hafta nasıl gidiyorum" ve "genel olarak neredeyim" — ama
          oyuncuyu ilgilendiren ilki, o yüzden üstte kalıyor. */}
      {board.ladder.rows.length > 0 && (
        <CardSection label="All time" tone={C.ice}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {board.ladder.rows.map((r) => (
              <Ladder key={r.wallet} row={r} me={r.wallet === wallet} odul={false} />
            ))}
            {board.ladder.me
              && !board.ladder.rows.some((r) => r.wallet === wallet) && (
              <>
                <div style={{ textAlign: 'center', fontSize: 11, color: C.boneFaint }}>···</div>
                <Ladder row={board.ladder.me} me odul={false} />
              </>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
            Every duel you have ever answered. This one never resets.
          </div>
        </CardSection>
      )}

      <CardSection label={`Records to answer — ${board.rows.length}`} tone={C.blood}>
        {board.rows.length === 0 ? (
          <div style={{ fontSize: 11.5, color: C.boneDim, lineHeight: 1.55 }}>
            Nobody has posted a descent yet. Finish one and yours becomes the
            record others have to answer.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {board.rows.map((r) => (
              <Row key={r.id} row={r} onChallenge={(id) => {
                const sec = board.rows.find((x) => x.id === id);
                if (sec) setBrifing(sec);
              }} onError={onError} />
            ))}
          </div>
        )}
      </CardSection>

      {brifing && (
        <DuelBriefing
          row={brifing}
          myWallet={wallet}
          myRating={board.me.rating}
          myHero={hero}
          rewardedToday={board.me.rewardedToday}
          onHero={onHero}
          onEnter={() => onChallenge(brifing.id)}
          onCancel={() => setBrifing(null)}
        />
      )}

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
            {stage?.name ?? `Stage ${row.stageId}`} · {heroById(row.hero).name}
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
        <PixelButton
          variant={BTN.strong} scale={2}
          disabled={!!row.blocker}
          onClick={() => (row.blocker ? onError(row.blocker) : onChallenge(row.id))}
          style={{ flexShrink: 0, fontSize: 11, fontWeight: 900, letterSpacing: 0.8, minWidth: 0, padding: '0 8px' }}>
          ANSWER
        </PixelButton>
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

function Ladder({ row, me, odul = true }: {
  // ⚠️ `DuelLadderRow` bu şeklin alt kümesi (matches yok) — tek satır
  // bileşeni ikisine de yetiyor, ikinci bir kopya yazmaya gerek yok.
  row: { rank: number; wallet: string; rating: number; wins: number; losses: number };
  me: boolean;
  /** ⚠️ Ödül noktası SADECE sezon tablosunda. Tüm-zamanlar tablosu ödül
   *  ödemiyor; noktayı orada da çizmek olmayan bir ödül vaat ederdi. */
  odul?: boolean;
}) {
  const t = duelTier(row.rating);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '6px 9px', borderRadius: 7,
      background: me ? 'rgba(239,167,46,0.12)' : 'transparent',
      border: `1px solid ${me ? `${C.candle}44` : 'transparent'}`,
    }}>
      <span style={{ width: 24, textAlign: 'right', fontSize: 12, fontWeight: 900,
        color: row.rank <= 3 ? C.candle : C.boneFaint }}>
        {row.rank}
      </span>
      {/* Ödül alan sıralar işaretli — tırmanmanın nerede bittiği görünsün */}
      {odul && row.rank <= PVP_PAYOUT_DEPTH && pvpReward(row.rank) && (
        <span style={{ width: 5, height: 5, borderRadius: 3, background: C.candle, flexShrink: 0 }} />
      )}
      <span style={{ minWidth: 0, flex: 1, fontSize: 11.5, fontWeight: me ? 900 : 700,
        color: me ? C.candle : C.bone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {me ? 'You' : kisa(row.wallet)}
      </span>
      <span style={{ fontSize: 10.5, color: t.color, fontWeight: 900 }}>{t.name}</span>
      <span style={{ fontSize: 10.5, color: C.boneFaint, minWidth: 52, textAlign: 'right' }}>
        {row.wins}W {row.losses}L
      </span>
      <span style={{ fontSize: 13, fontWeight: 900, color: C.bone, minWidth: 42, textAlign: 'right',
        fontVariantNumeric: 'tabular-nums' }}>
        {row.rating}
      </span>
    </div>
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
