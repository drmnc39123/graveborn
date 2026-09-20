'use client';
// KÖY HUD KARTLARI — "daha dolu bir ekran" (kullanıcı isteği).
//
// 🔴 NİYE VAR (kullanıcı): *"Oyun içini güzelleştirelim, daha dolu bir ekrana
// sahip olsun oyuncular."* Köyün iki kenar sütunu yapacak bir şey
// söylemiyordu: haftalık turnuvanın ne zaman bittiği ve ortak boss'un ne
// durumda olduğu yalnız panellerin içinde yazıyordu.
//
// ⚠️ YENİ YÜZEY DİLİ YOK: EventBanner/ReadyCard ile aynı `thinGlass(9, 0.80)`
// — alfa orada ölçülerek seçildi (açık taş yolda 5,04 kontrast).
//
// ⚠️ İÇERİK YOKSA ÇİZİLMEZ. Boş ya da hatalı bir kart köyü kapatan bir
// endişe kutusu olurdu (EventBanner'ın "hata sessiz" kuralı).

import { useEffect, useState } from 'react';
import { seasonEndsAt, seasonWeek } from '@/game/season';
import { Bar, Icon } from '@/components/ui/kit';
import { fetchWorldBoss, sunucuSimdi, worldBossAvailable, type BossState } from '@/lib/gameSession';
import { C, FONT, thinGlass } from '@/lib/theme';

/** "5d 4h" · "3h 12m" · "9m" — dakikada bir yeniden çizilir, saniye yok */
export function kalanKisa(ms: number): string {
  const dk = Math.max(0, Math.floor(ms / 60_000));
  const g = Math.floor(dk / 1440), s = Math.floor((dk % 1440) / 60), d = dk % 60;
  if (g > 0) return `${g}d ${s}h`;
  if (s > 0) return `${s}h ${d}m`;
  return `${d}m`;
}

/**
 * ⚠️ SAAT SUNUCUDAN (`sunucuSimdi`), cihazdan değil — ödemeyi yapan saat
 * hangisiyse gösteren de o olmalı (EventBanner başlığı). `/events` zaten
 * sunucu saatini işaretliyor; hiç senkron olmadıysa cihaza düşülür.
 */
function simdi(): number {
  return sunucuSimdi() ?? Date.now();
}

/** Dakikada bir yeniden çiz — kart bir kronometre değil */
function useDakika(): void {
  const [, setTik] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTik((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
}

const yuzey = {
  all: 'unset' as const, cursor: 'pointer', boxSizing: 'border-box' as const,
  display: 'block', width: '100%', padding: '7px 9px', fontFamily: FONT.ui,
  ...thinGlass(9, 0.80),
};

/**
 * DESCENT TRIALS geri sayımı — sol sütun, LEADERBOARDS düğmesinin altı.
 *
 * ⚠️ AĞ İSTEĞİ YOK: bitiş `seasonEndsAt(seasonWeek(now))`, sunucuyla AYNI
 * fonksiyon (`@game/season`). Sürekli ekranda duran bir kartın maliyeti
 * sıfır olmalı (ProfileCard dersi).
 */
export function TrialsKarti({ onOpen }: { onOpen: () => void }) {
  useDakika();
  const n = simdi();
  const bitis = seasonEndsAt(seasonWeek(new Date(n)));
  return (
    <button onClick={onOpen} title="Open this week's trials" style={yuzey}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon name="star" />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, color: C.candle,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            DESCENT TRIALS
          </span>
          <span style={{ display: 'block', fontSize: 10.5, color: C.boneDim, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <b style={{ color: C.bone }}>{kalanKisa(bitis - n)}</b> left this week
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * ⚠️ 60 SN MODÜL ÖNBELLEĞİ — YALNIZ BU KART İÇİN. `fetchWorldBoss`un kendisine
 * konmadı: boss paneli bir koşudan sonra TAZE can görmeli; paylaşılan önbellek
 * paneli bayat bırakırdı. `/worldboss` her okumada upsert yapıyor, her
 * yeniden çizimde sormak sunucuyu dövmek olurdu.
 */
const BOSS_TTL_MS = 60_000;
let bossOnbellek: { at: number; soz: Promise<BossState> } | null = null;
function bossOku(): Promise<BossState> {
  const t = Date.now();
  if (bossOnbellek && t - bossOnbellek.at < BOSS_TTL_MS) return bossOnbellek.soz;
  const soz = fetchWorldBoss();
  bossOnbellek = { at: t, soz };
  soz.catch(() => { if (bossOnbellek?.soz === soz) bossOnbellek = null; });
  return soz;
}

/**
 * BU HAFTAKİ BOSS'A HİÇ VURDUN MU — telefondaki çekmece rozeti bunu soruyor.
 *
 * 🔴 NİYE (2026-09-20): telefonda sağ kolon kartları varsayılan KAPALI bir
 * çekmecede duruyor (kullanıcı kararı). Kapalı çekmece bilgi saklamamalı:
 * haftalık boss kaçırılırsa bir daha o boss gelmiyor.
 * ⚠️ AYNI 60 sn'lik önbellekten okuyor — kart zaten çekiyor, ikinci istek yok.
 * ⚠️ Cüzdansız oyuncu boss'a vuramaz; onda rozet YANMAZ (yapılamayacak işe
 * çağırmak yalan olurdu).
 * ⚠️ Vurduğun an sönüyor — rozet kalıcı bir süs değil.
 */
export function useBossVurulmadi(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!worldBossAvailable()) return;
    let iptal = false;
    const oku = () => bossOku()
      .then((b) => {
        if (iptal) return;
        setV(!b.defeated && b.hp > 0 && (b.me?.damage ?? 0) === 0);
      })
      .catch(() => { /* sessiz — rozet yoksa kart yine duruyor */ });
    oku();
    const t = setInterval(() => { if (!document.hidden) oku(); }, BOSS_TTL_MS);
    return () => { iptal = true; clearInterval(t); };
  }, []);
  return v;
}

/** HAFTALIK BOSS canı — sağ sütun, etkinlik kartının altı. Tıklanınca boss paneli. */
export function BossKarti({ onOpen }: { onOpen: () => void }) {
  const [boss, setBoss] = useState<BossState | null>(null);
  useDakika();
  useEffect(() => {
    let iptal = false;
    const oku = () => bossOku().then((b) => { if (!iptal) setBoss(b); }).catch(() => { /* sessiz */ });
    oku();
    // ⚠️ Gizli sekmede sorma: kimse bakmıyor (bkz. gizli sekme tuzağı notu —
    // `setInterval` arka planda da çalışır).
    const t = setInterval(() => { if (!document.hidden) oku(); }, BOSS_TTL_MS);
    return () => { iptal = true; clearInterval(t); };
  }, []);

  // ⚠️ Canı ölçülemeyen boss çizilmez — "NaN%" bir çubuk yalan söyler.
  if (!boss || !(boss.maxHp > 0)) return null;
  // ⚠️ `Bar` 0..1 ALIYOR, yüzde değil — 0..100 verilseydi çubuk hep dolu görünürdü.
  const oran = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
  const n = simdi();
  return (
    <button onClick={onOpen} title={`${boss.name} — ${boss.epithet}`} style={yuzey}>
      {/* 🔴 SÜRE AD SATIRINDA DEĞİL — ölçüldü (375 px, sütun 128 px): süre
          sağda yer kaplayınca hem "WEEKLY BOSS" hem boss adı kesiliyordu.
          Ad kendi tam satırında, süre çubuğun altında. */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="skull" />
        <span style={{ minWidth: 0, flex: 1, fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, color: C.badText,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          WEEKLY BOSS
        </span>
      </span>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 800, color: C.bone, margin: '2px 0 5px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {boss.name}
      </span>
      <Bar pct={oran} tone="blood" scale={1} />
      <span style={{ display: 'block', marginTop: 4, fontSize: 10, color: C.boneDim,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {boss.defeated ? 'Fallen this week' : <><b style={{ color: C.bone }}>{kalanKisa(boss.endsAt - n)}</b> left</>}
        {boss.me && boss.me.damage > 0 && <> · you #{boss.me.rank}</>}
      </span>
    </button>
  );
}
