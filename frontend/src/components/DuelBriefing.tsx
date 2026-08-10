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
import { createPortal } from 'react-dom';
import { DUEL, duelTier } from '@/game/duel';
import { stageById } from '@/game/config';
import { HEROES, heroById, type HeroDef } from '@/game/heroes';
import { Portrait } from '@/components/HeroPicker';
import { weaponById } from '@/game/config';
import { PATTERN_TEXT } from '@/components/ui/cards';
import type { DuelRow } from '@/lib/gameSession';
import { PixelButton, BTN } from '@/components/ui/kit';
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

  // ⚠️ PORTAL — GÖVDEYE TAŞINIYOR, panelin içinde DEĞİL.
  //
  // Brifing `DuelPanel`in DOM'unda duruyordu ve `position:absolute` ile
  // panelin kaydırma kutusuna hapsolmuştu: ekranda YAN YANA İKİ KAYDIRMA
  // ÇUBUĞU çıkıyordu ve maçın en önemli kararı bir panelin içine sıkışmış
  // küçük bir kutuydu.
  //
  // ⚠️ `position: fixed` TEK BAŞINA YETMEZDİ: `glass()` `backdrop-filter`
  // kullanıyor ve backdrop-filter'lı bir ata, `fixed` çocukları için
  // kapsayıcı blok üretir — yani kaplama yine panele göre konumlanırdı.
  // Portal, DOM ağacından çıkardığı için bu tuzağın tamamen dışında.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
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
            hero={hero}
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
            hero={heroById(row.hero)}
            accent={C.blood}
            flip
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

        {/* ── KAHRAMAN SEÇİMİ ──
            ⚠️ DÖRDÜ DE YAN YANA VE PORTRELİ. İlk sürüm düz metin kartıydı ve
            oyuncu kimi seçtiğini GÖREMİYORDU. Bir dövüş oyununda karakter
            seçimi okunacak bir liste değil, BAKILACAK bir vitrindir. */}
        <Section label="Who walks in">
          <div style={{ display: 'grid', gap: 6,
            gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
            {HEROES.map((h) => {
              const on = h.id === myHero;
              return (
                <button key={h.id} onClick={() => onHero(h.id)} title={h.blurb}
                  style={{
                    all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '9px 7px', borderRadius: 9, textAlign: 'center',
                    border: `1px solid ${on ? `${C.candle}99` : 'rgba(255,255,255,0.10)'}`,
                    background: on
                      ? 'linear-gradient(180deg, rgba(239,167,46,0.18), rgba(0,0,0,0.30))'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.26))',
                    boxShadow: on ? `0 0 0 1px ${C.candle}33, 0 6px 16px rgba(0,0,0,0.42)` : 'none',
                  }}>
                  <Portrait hero={h} size={70} frame={false} />
                  <div style={{ fontSize: 11.5, fontWeight: 900, marginTop: 2,
                    color: on ? C.candle : C.bone }}>
                    {h.name}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1,
                    color: on ? C.candleSoft : C.boneFaint }}>
                    {h.title.toUpperCase()}
                  </div>
                </button>
              );
            })}
          </div>
          <HeroDetail hero={hero} />
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
          {/* ⚠️ ORAN 2:1 KORUNDU. Düellonun kabulü ile vazgeçişi eşit
              genişlikte olsaydı ekran hangisini beklediğini söylemezdi. */}
          <PixelButton variant={BTN.strong} scale={3} disabled={busy}
            onClick={() => { if (!busy) { setBusy(true); onEnter(); } }}
            style={{ flex: '2 1 180px', fontSize: 13, letterSpacing: 1.4 }}>
            {busy ? 'DESCENDING…' : 'ANSWER THEM'}
          </PixelButton>
          {/* ⚠️ SABİT 170px, esneme YOK. PixelButton 48×16'lık dokuyu yatayda
              dilimliyor: scale 3'te SADECE kenarlık 2×48 = 96px yer yiyor.
              `flex: 1 1 90px` yazılmıştı ve metin "NOT Y…" diye kırpıldı —
              Tavern sekmelerinde ölçülen hatanın aynısı. Taban, kenarlık +
              metin genişliğinden büyük olmak ZORUNDA. */}
          <PixelButton variant={BTN.action} scale={3} onClick={onCancel}
            style={{ flex: '0 0 170px', fontSize: 12, letterSpacing: 1 }}>
            NOT YET
          </PixelButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Side({ kicker, name, label, rating, tier, hero, accent, flip }: {
  kicker: string; name: string; label: string;
  rating: number; tier: { name: string; color: string };
  hero: HeroDef; accent: string;
  /** ⚠️ Rakip SOLA bakmalı — ikisi de aynı yöne bakarsa "karşı karşıya"
   *  hissi hiç doğmuyor, iki ayrı kart gibi duruyorlar. */
  flip?: boolean;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: '11px 12px', borderRadius: 10,
      border: `1px solid ${accent}44`,
      background: `linear-gradient(180deg, ${accent}18, rgba(0,0,0,0.30))`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.8, color: C.boneFaint }}>
        {kicker}
      </div>
      {/* ⚠️ DÖVÜŞÇÜNÜN KENDİSİ. İsim ve sayı yeterli değil — kimin kime karşı
          çıktığı OKUNARAK değil GÖRÜLEREK anlaşılmalı. */}
      <Portrait hero={hero} size={76} flip={flip} frame={false} />
      <div style={{ fontSize: 12, fontWeight: 900, color: C.bone, maxWidth: '100%',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 900, color: accent }}>{hero.name}</div>
      <div style={{ fontSize: 14, fontWeight: 900, color: tier.color, marginTop: 4 }}>
        {tier.name}
      </div>
      <div style={{ fontSize: 11, color: C.boneFaint }} title={label}>{rating}</div>
    </div>
  );
}

/**
 * Seçilen kahramanın künyesi — asıl mesele SİLAHININ NE YAPTIĞI.
 *
 * ⚠️ Silahın ADI ne yaptığını söylemiyor. Oyun testinde Water Priestess için
 * "bu hero ateş etmiyor" şikâyeti gelmişti: silahı yörüngeydi, gerçekten
 * hiçbir şey fırlatmıyordu. Desen metni o yüzden burada da duruyor.
 */
function HeroDetail({ hero }: { hero: HeroDef }) {
  const w = weaponById(hero.weapon);
  return (
    <div style={{
      marginTop: 8, padding: '9px 11px', borderRadius: 8,
      border: `1px solid ${C.candle}33`,
      background: 'linear-gradient(180deg, rgba(239,167,46,0.08), rgba(0,0,0,0.26))',
    }}>
      <div style={{ fontSize: 11.5, color: C.boneDim, lineHeight: 1.5 }}>{hero.blurb}</div>
      {w && (
        <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 5, lineHeight: 1.45 }}>
          <b style={{ color: C.candle }}>{w.name}</b>
          {' · '}
          <span style={{ color: C.ice, fontWeight: 900 }}>{PATTERN_TEXT[w.pattern]?.label}</span>
          {' — '}
          {PATTERN_TEXT[w.pattern]?.how}
        </div>
      )}
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
