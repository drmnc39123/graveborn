'use client';
// KARAKTER SEÇİMİ — Warden's Post'un tepesinde, bölüm seçmeden önce.
//
// Ayrı bir panel yapılmadı: karakteri bölümden ayrı bir yerde seçmek, oyuncuyu
// koşuya başlamadan önce iki ekran arasında gezdirir. Aynı akışta olması doğru.

import { useEffect, useState } from 'react';
import { HEROES, heroById, type HeroDef } from '@/game/heroes';
import { kahramanAcikMi, kahramanKilitMetni } from '@/game/heroUnlock';
import { USTALIK_MAX, USTALIK_STAT, sonrakiEsik } from '@/game/mastery';
import { fetchMastery, type UstalikDurum } from '@/lib/gameSession';
import type { Progress } from '@/game/progress';
import { weaponById } from '@/game/config';
import { Card, CardSection, DeltaBar, PATTERN_TEXT, Tag } from '@/components/ui/cards';
import { STAT_ICON } from '@/lib/icons';
import { Icon } from '@/components/ui/kit';
import { C } from '@/lib/theme';

/**
 * Portre: kaynak kare 288×128 ve karakter ortada küçük duruyor. Kutuyu
 * `overflow:hidden` yapıp görseli ÖLÇÜLMÜŞ içerik kutusuna göre kaydırıp
 * büyütüyoruz — böylece her karakter kutuyu aynı şekilde dolduruyor.
 */
export function Portrait({ hero, size = 56, flip = false, frame = true }: {
  hero: HeroDef; size?: number;
  /** ⚠️ Yüz yüze duruş için: düelloda rakip SOLA bakmalı, yoksa ikisi de
   *  aynı yöne bakıp "karşı karşıya" hissi kaybolur. */
  flip?: boolean;
  /** çerçeve/zemin — büyük vitrin kullanımında kapatılıyor */
  frame?: boolean;
}) {
  const c = hero.crop;
  const scale = size / Math.max(c.w, c.h);
  return (
    <div style={{
      width: size, height: size, flexShrink: 0, overflow: 'hidden',
      position: 'relative', borderRadius: 6,
      background: frame ? 'rgba(0,0,0,0.35)' : 'transparent',
      border: frame ? `1px solid ${C.border}` : 'none',
      transform: flip ? 'scaleX(-1)' : undefined,
    }}>
      <img
        src={`/art/heroes/${hero.dir}/${hero.idle.replace('{i}', '1')}`}
        alt={hero.name}
        style={{
          position: 'absolute',
          left: (size - c.w * scale) / 2 - c.x * scale,
          top: (size - c.h * scale) / 2 - c.y * scale,
          width: 288 * scale, height: 128 * scale,
          maxWidth: 'none', imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}

export function HeroPicker({ selected, onSelect, progress }: {
  selected: string;
  onSelect: (id: string) => void;
  /** ⚠️ Kilit koşulları BURADAN okunuyor — sunucu-otoriteli ilerleme */
  progress: Progress;
}) {
  const cur = heroById(selected);
  /**
   * ⚠️ USTALIK AYRI UÇTAN geliyor, `progress` içinde DEĞİL: kademe `Run`
   * geçmişinden türetiliyor ve o sorguyu `/progress`e koymak, hiç kimse
   * bakmıyorken bile her istekte bir toplama sorgusu demekti.
   */
  const [ustalik, setUstalik] = useState<UstalikDurum | null>(null);
  useEffect(() => { fetchMastery().then(setUstalik); }, []);
  const kademeOf = (id: string) => ustalik?.mastery?.[id]?.tier ?? 0;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.8, color: C.boneFaint, marginBottom: 7 }}>
        WHO WALKS IN
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 9 }}>
        {HEROES.map((h) => {
          const on = h.id === cur.id;
          /**
           * ⚠️ ŞU AN OYNANAN KAHRAMAN HER ZAMAN AÇIK SAYILIR.
           * Kilitler beta ortasında eklendi; koşulu henüz sağlamadan
           * `ranger` seçmiş bir oyuncunun karakteri elinden alınsaydı,
           * kendi hesabında kendi kahramanına dönemezdi. Sunucu da aynı
           * duruşta: yalnız DEĞİŞTİRMEYİ engelliyor, kayıtlı seçimi değil.
           */
          const acik = h.id === cur.id || kahramanAcikMi(h.id, progress);
          const sart = kahramanKilitMetni(h.id, progress);
          return (
            /**
             * ⚠️ KİLİTLİ KAHRAMAN GİZLENMİYOR, KARARTILIYOR. Gizlemek
             * oyuncuya kazanabileceği bir şey olduğunu HİÇ söylemezdi —
             * kilidin bütün değeri görünür olmasında. Şartı da portrenin
             * üstünde duruyor, ayrı bir yere bakmak gerekmiyor.
             */
            <button key={h.id} onClick={() => { if (acik) onSelect(h.id); }}
              disabled={!acik}
              title={acik ? h.name : `${h.name} — ${sart}`}
              style={{
                all: 'unset', cursor: acik ? 'pointer' : 'not-allowed', padding: 3, borderRadius: 8,
                border: `2px solid ${on ? C.candle : 'transparent'}`,
                background: on ? 'rgba(239,167,46,0.12)' : 'transparent',
                position: 'relative',
              }}>
              <div style={{ filter: acik ? undefined : 'grayscale(1) brightness(0.45)' }}>
                <Portrait hero={h} size={54} />
              </div>
              {/* ⚠️ KADEME PORTRENİN ÜSTÜNDE: kartı açmadan hangi kahramanı
                  ne kadar ilerlettiğini görebilmeli, yoksa ustalık ancak
                  aranarak bulunan bir sayı olurdu. 0'da hiç çizilmiyor —
                  boş noktalar "ilerleme yok" değil "bozuk" gibi okunur. */}
              {acik && kademeOf(h.id) > 0 && (
                <div style={{
                  position: 'absolute', left: 0, right: 0, bottom: 1,
                  textAlign: 'center', fontSize: 8, letterSpacing: 0.5,
                  color: C.candle, textShadow: `0 1px 2px ${C.void}`, pointerEvents: 'none',
                }}>
                  {'◆'.repeat(kademeOf(h.id))}
                </div>
              )}
              {!acik && (
                <div style={{
                  position: 'absolute', inset: 3, display: 'grid', placeItems: 'center',
                  borderRadius: 6, background: 'rgba(0,0,0,0.35)',
                  fontSize: 17, lineHeight: 1, color: C.boneDim, pointerEvents: 'none',
                }}>🔒</div>
              )}
            </button>
          );
        })}
      </div>

      {/* ⚠️ ŞART CÜMLESİ SEÇİLİ KARTIN ÜSTÜNDE DE VAR: kilitli portreye
          tıklayamayan oyuncu, tıklayarak şartı öğrenemez. Kilitli olanın
          şartını okumanın tek yolu bu satır. */}
      {(() => {
        const kilitli = HEROES.filter((h) => h.id !== cur.id && !kahramanAcikMi(h.id, progress));
        if (!kilitli.length) return null;
        return (
          <div style={{
            marginBottom: 9, padding: '7px 10px', borderRadius: 7,
            border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.28)',
            fontSize: 11, color: C.boneDim, lineHeight: 1.6,
          }}>
            {kilitli.map((h) => (
              <div key={h.id}>
                🔒 <b style={{ color: C.bone }}>{h.name}</b> — {kahramanKilitMetni(h.id, progress)}
              </div>
            ))}
          </div>
        );
      })()}

      <HeroCard hero={cur} ustalik={ustalik} />
    </div>
  );
}

/**
 * Seçilen karakterin tam künyesi.
 *
 * ⚠️ Eskiden burada "Starts with Rusted Sickle" yazıyordu ve bitiyordu.
 * Silahın ADI ne yaptığını söylemiyor: oyun testinde Water Priestess için
 * "bu hero ateş etmiyor" şikâyeti geldi — silahı yörüngeydi, gerçekten
 * hiçbir şey fırlatmıyordu. Artık deseni de, nasıl çalıştığı da yazıyor.
 */
function HeroCard({ hero, ustalik }: { hero: HeroDef; ustalik: UstalikDurum | null }) {
  const w = weaponById(hero.weapon);
  const pat = w ? PATTERN_TEXT[w.pattern] : undefined;
  /**
   * ORANSAL istatistikler — çubuk olarak çizilir, `%` ile yazılır.
   *
   * ⚠️ `recovery` BU LİSTEDEN ÇIKARILDI ve `duzler`e taşındı. Burada
   * duruyordu ve `DeltaBar` her değeri yüzdeye çeviriyor: Water Priestess'in
   * `recovery: 0.5`i ekranda **"RECOVERY +50%"** olarak yazıyordu. Oysa
   * motor onu ORAN DEĞİL, saniyede iyileşen CAN olarak okuyor
   * (`engine.ts`: `h.hp + h.stats.recovery * dt`) — yani gerçek değer
   * "+0,5 HP/sn". Panel olmayan bir bonusu duyuruyordu.
   */
  const bars: { label: string; key: keyof HeroDef['stats'] }[] = [
    { label: 'Damage', key: 'might' },
    { label: 'Attack speed', key: 'cooldown' },
    { label: 'Move speed', key: 'moveSpeed' },
    { label: 'Max health', key: 'maxHp' },
    { label: 'Area', key: 'area' },
    { label: 'Proj. speed', key: 'projSpeed' },
  ];

  /**
   * DÜZ istatistikler — yüzde DEĞİL, mutlak sayı. Çubuk çizilmez.
   *
   * ⚠️ `armor` HİÇBİR YERDE GÖSTERİLMİYORDU. `bars` listesinde yoktu ve
   * başka bir yerde de çizilmiyordu; yani Fire Knight'ın kartında tek satır
   * ("MAX HEALTH +8%") görünüyordu — oysa ikinci bir avantajı daha var
   * (+1 armor), Metal Bladekeeper'ın ise +2. İkon (`STAT_ICON.armor`)
   * baştan beri hazırdı, kimse kullanmamıştı.
   *
   * ⚠️ Çubuğa EKLENEMEZ: `DeltaBar` yüzde bekliyor, `armor: 1` oraya
   * konsaydı "+100%" yazardı — bir yalanı başkasıyla değiştirmek olurdu.
   */
  const duzler: { label: string; key: keyof HeroDef['stats']; birim: string; not: string }[] = [
    { label: 'Armor', key: 'armor', birim: '', not: 'flat damage cut per hit' },
    { label: 'Recovery', key: 'recovery', birim: ' HP/s', not: 'heals while you fight' },
  ];

  return (
    <Card accent>
      <div style={{ display: 'flex', gap: 11, padding: '11px 12px' }}>
        <Portrait hero={hero} size={72} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: C.bone }}>{hero.name}</span>
            <span style={{ fontSize: 9.5, color: C.blood, fontWeight: 900, letterSpacing: 1.3 }}>
              {hero.title.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: C.boneDim, marginTop: 3, lineHeight: 1.5 }}>{hero.blurb}</div>
        </div>
      </div>

      <div style={{ padding: '0 12px 12px' }}>
        {/* ⭐ USTALIK — bu kahramanla ne kadar derine indiğinin karşılığı.
            ⚠️ ÖLÇÜT "kaç koşu" DEĞİL "en derin": koşu sayısı tekrarla
            büyür ve ustalık sabrın başka adı olurdu.
            ⚠️ Cüzdansızken (demo) hiç çizilmez — kademe sunucudaki koşu
            geçmişinden türüyor, demoda öyle bir geçmiş yok. */}
        {ustalik && (() => {
          const bilgi = ustalik.mastery[hero.id];
          const kademe = bilgi?.tier ?? 0;
          const derin = bilgi?.depth ?? 0;
          const stat = USTALIK_STAT[hero.id];
          const sonraki = sonrakiEsik(kademe);
          return (
            <CardSection label="Mastery" tone={C.candle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: kademe > 0 ? C.candle : C.boneFaint }}>
                  {kademe} / {USTALIK_MAX}
                </span>
                <span style={{ letterSpacing: 2, color: C.candle, fontSize: 11 }}>
                  {'◆'.repeat(kademe)}<span style={{ color: C.boneFaint }}>{'◇'.repeat(USTALIK_MAX - kademe)}</span>
                </span>
                {stat && kademe > 0 && (
                  <Tag tone="blood">
                    {stat.perTier < 0 ? '+' : '+'}
                    {Math.abs(stat.perTier * kademe) < 1
                      ? `${Math.round(Math.abs(stat.perTier * kademe) * 100)}%`
                      : (stat.perTier * kademe).toFixed(1)} {stat.etiket}
                  </Tag>
                )}
              </div>
              <div style={{ fontSize: 11, color: C.boneDim, marginTop: 5, lineHeight: 1.5 }}>
                Deepest with this hero: <b style={{ color: C.bone }}>{derin || '—'}</b>
                {sonraki !== null
                  ? <> · next rank at <b style={{ color: C.bone }}>depth {sonraki}</b></>
                  : <> · <b style={{ color: C.candle }}>mastered</b></>}
                <br />
                Only Descent and Wilderness count, and only runs the server accepted.
              </div>
            </CardSection>
          );
        })()}

        {w && (
          <CardSection label="Starting weapon" tone={C.candle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.candle }}>{w.name}</span>
              {pat && <Tag tone="blood">{pat.label}</Tag>}
              <Tag>{w.damage} DMG</Tag>
              <Tag>{w.cooldownSec.toFixed(2)}s</Tag>
            </div>
            {/* ⚠️ ASIL BİLGİ BU SATIR — silahın nasıl çalıştığı */}
            {pat && (
              <div style={{ fontSize: 11, color: C.boneDim, marginTop: 5, lineHeight: 1.5 }}>{pat.how}</div>
            )}
          </CardSection>
        )}

        <CardSection label="Against the baseline">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {bars.map((b) => {
              const v = hero.stats[b.key];
              if (v === undefined || v === 0) return null;
              // ⚠️ `cooldown` TERS ÇALIŞIR: negatif değer daha HIZLI saldırı
              // demek. Ham sayıyı göstermek oyuncuya "eksi = kötü" dedirtirdi.
              const gosterilen = b.key === 'cooldown' ? -v : v;
              return <DeltaBar key={b.key} label={b.label} pct={gosterilen} icon={STAT_ICON[b.key]} />;
            })}
          </div>

          {/* Düz sayılar — çubuk yok, çünkü ölçekleri yüzde değil */}
          {duzler.some((d) => (hero.stats[d.key] ?? 0) !== 0) && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`,
            }}>
              {duzler.map((d) => {
                const v = hero.stats[d.key];
                if (v === undefined || v === 0) return null;
                return (
                  <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name={STAT_ICON[d.key]} scale={1} />
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7,
                      color: C.boneFaint, flex: '0 0 74px',
                    }}>
                      {d.label.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 900, color: v > 0 ? C.ok : C.bad }}>
                      {v > 0 ? '+' : '−'}{Math.abs(v)}{d.birim}
                    </span>
                    {/* ⚠️ NE OLDUĞU YAZIYOR. "+1 ARMOR" tek başına oyuncuya
                        bir şey söylemez; düz mü, yüzde mi, neye karşı? */}
                    <span style={{ fontSize: 10, color: C.boneDim, marginLeft: 2 }}>{d.not}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardSection>
      </div>
    </Card>
  );
}
