// HAFTA SONU ETKİNLİKLERİ — "bugün oynamak için bir sebep".
//
// RETENTION.md R4/9: oyunun bir RİTMİ yok. Her gün aynı; hiçbir an "bunu
// kaçırırsam bir daha gelmez" demiyor. Etkinlik tam olarak o eksik cümleyi
// üretiyor.
//
// ══════════════════════════════════════════════════════════════════════
// ⚠️ EN ÖNEMLİ KURAL: ETKİNLİK MOTORA GİRMEZ.
// ══════════════════════════════════════════════════════════════════════
// Cazip olan şey "hafta sonu düşman yoğunluğu ×1,5" gibi bir şeydi. YAPILMADI
// ve yapılmamalı: motor `SIM_SEAL` ile mühürlü, "aynı girdi + aynı seed →
// aynı koşu" varsayımı üstüne kurulu. Motorun davranışını TAKVİME bağlamak o
// varsayımı kırardı — aynı seed Cumartesi başka, Salı başka bir koşu üretir,
// mühür testi tarihe bağımlı hâle gelir ve sunucunun koşuyu yeniden
// oynatarak doğrulama ihtimali tamamen ölürdü.
//
// Bunun yerine etkinlik bir **KAPANIŞ KATMANI ÇARPANI**: koşu normal
// oynanır, sunucu iddiayı her zamanki gibi doğrulayıp kırpar, çarpan EN SON
// ödeme anında uygulanır. Motor tek satır bile değişmiyor.
//
// ⚠️ SIRA: ÖNCE KIRP, SONRA ÇARP. Tavan iddianın MEŞRULUĞUNU ölçüyor
// (oyuncunun gerçek greed'ine bağlı — bkz. reward.ts); etkinlik ise
// doğrulanmış bir ödemeyi büyütüyor. Ters sırada tavan bonusu yer, etkinlik
// hiçbir şey yapmazdı.
//
// ⚠️ ETKİNLİK KOŞUNUN **BAŞLANGICINDAN** ÇÖZÜLÜR (`Run.startedAt`), kapanış
// anından değil. Aksi hâlde Pazar 23:55'te başlayan bir koşu kapanışta
// bonusunu kaybederdi. İstismar tavanı bir koşu kadar: aynı anda tek koşu
// açık olabiliyor (`acikKosulariIptalEt`), yani "etkinlik bitmeden 50 koşu
// açayım" diye bir yol yok.
//
// ⚠️ ÇARPAN SADECE **TEKRARLANABİLİR** KAZANCA. `dropGold` çarpılıyor,
// `progressGold` ÇARPILMIYOR — ikincisi her derinlik için BİR KEZ ödenen bir
// ödül ve çarpılsaydı oyuncuya "ilerlemeyi hafta sonuna sakla" derdi. Bir
// oyuncuyu Cuma günü OYNAMAMAYA teşvik eden bir etkinlik, kendi amacını
// yener.

import { bossWeek } from './worldBoss';

/** Bir etkinliğin dokunduğu tek yer. Her etkinliğin BİR yetki noktası var. */
export type EventEffect =
  /** nadir gold düşüşü — `settleRun`, tavandan SONRA */
  | 'dropGold'
  /** haftalık boss katkısı — `/boss/finish`, yapısal tavandan SONRA */
  | 'bossDamage'
  /** günlük görev tozu — `quests.ts` ödeme anı */
  | 'questDust';

export interface EventDef {
  id: string;
  /** oyuncuya görünen ad */
  name: string;
  /** oyuncuya görünen açıklama — İngilizce */
  blurb: string;
  effect: EventEffect;
  mul: number;
  /** arayüz vurgu rengi — ⚠️ MOR YOK */
  tone: string;
}

/**
 * DÖNGÜ. Hafta numarasına göre seçilir, yani herkes aynı hafta sonu AYNI
 * etkinliği görür — haftalık boss ve sezonla birebir aynı hafta tanımı.
 *
 * ⚠️ ÜÇ ETKİNLİK, ÜÇ AYRI OYUNCU TİPİ: gold biriktiren, sıralamaya oynayan,
 * kozmetik toplayan. Hepsi gold verseydi etkinlik sadece bir enflasyon
 * musluğu olurdu; üçe bölmek hem musluğu küçültüyor hem farklı sebeplerle
 * gelen oyunculara ayrı ayrı sesleniyor.
 *
 * ⚠️ MUSLUK MALİYETİ ÖLÇÜLDÜ, tahmin değil: `dropGold ×1,5` üç hafta sonundan
 * BİRİNDE açık. Takvimin %9,5'i (2/7 × 1/3) → tekrar koşusu gelirinde
 * **+%4,8**. Sadece hafta sonu oynayan bir oyuncu için üst sınır **+%16,7**.
 * İkisi de kabul edilebilir; buradaki sayı büyütülecekse ölçüm tekrarlanmalı.
 */
export const EVENTS: readonly EventDef[] = [
  {
    id: 'ashfall',
    name: 'Ashfall',
    blurb: 'The dead let go of more than they should. Rare gold drops pay half again as much.',
    effect: 'dropGold',
    mul: 1.5,
    tone: '#efa72e',
  },
  {
    id: 'bloodmoon',
    name: 'Blood Moon',
    blurb: "Every wound you open on this week's horror counts twice on the damage board.",
    effect: 'bossDamage',
    mul: 2,
    tone: '#a01226',
  },
  {
    id: 'vigil',
    name: 'Night Vigil',
    blurb: 'The daily rites are kept until dawn. Every quest pays double dust.',
    effect: 'questDust',
    mul: 2,
    tone: '#7f9bb0',
  },
] as const;

const GUN = 86_400_000;

/**
 * UTC haftanın günü — 0 Pazar, 6 Cumartesi.
 * (1970-01-01 Perşembe olduğu için +4 kayması var.)
 */
function utcDow(t: number): number {
  return (Math.floor(t / GUN) + 4) % 7;
}

/** Hafta sonu mu — Cumartesi 00:00 UTC ile Pazartesi 00:00 UTC arası */
function haftaSonu(t: number): boolean {
  const d = utcDow(t);
  return d === 6 || d === 0;
}

/**
 * O ANDA açık olan etkinlik — hafta içiyse `null`.
 *
 * ⚠️ Cumartesi ve Pazar AYNI etkinliği görüyor: hafta tanımı Pazartesi
 * başlangıçlı olduğu için hafta sonunun iki günü de aynı `bossWeek`'e düşer.
 * İkinci bir hafta tanımı yazma — kayar (bkz. season.ts).
 */
export function eventAt(d: Date | number | null | undefined): EventDef | null {
  // ⚠️ TİP KONTROL ET, ÇEVİRME. `Number(null)` = 0 ve sonlu — yani `null`
  // sessizce 1 Ocak 1970'e (bir Perşembe) dönüşürdü. Bu tam olarak canlı
  // boss odasında yakalanan hatanın aynısı.
  const t = d instanceof Date ? d.getTime() : typeof d === 'number' ? d : NaN;
  if (!Number.isFinite(t)) return null;
  if (!haftaSonu(t)) return null;
  return EVENTS[((bossWeek(new Date(t)) % EVENTS.length) + EVENTS.length) % EVENTS.length];
}

/**
 * Belirli bir etkiye düşen çarpan. Etkinlik yoksa ya da başka bir etkiyse 1.
 *
 * ⚠️ ÇAĞRI YERİ HER ZAMAN BU FONKSİYONU KULLANSIN, `eventAt(...)?.mul`
 * DEĞİL: doğrudan `.mul` okumak, Blood Moon açıkken gold'u da çarpardı.
 */
export function eventMul(d: Date | number | null | undefined, effect: EventEffect): number {
  const e = eventAt(d);
  return e && e.effect === effect ? e.mul : 1;
}

export interface EventWindow {
  event: EventDef;
  startsAt: number;
  endsAt: number;
  /** şu an açık mı — `false` ise bu bir ÖNİZLEME (sıradaki hafta sonu) */
  live: boolean;
}

/**
 * Şu an açık olan pencere; hafta içiyse SIRADAKİ hafta sonunun penceresi.
 *
 * Arayüz tek bir şerit çiziyor: ya "Blood Moon — 14 saat kaldı" ya da
 * "Ashfall — Cumartesi başlıyor". İkinci hâl birinci kadar önemli: gelecek
 * bir sebebi göstermek, geçmiş bir sebebi göstermekten daha çok işe yarıyor.
 */
export function eventWindow(now: Date | number): EventWindow {
  const t = now instanceof Date ? now.getTime() : now;
  const gun = Math.floor(t / GUN);
  const dow = utcDow(t);

  // Bu haftanın Cumartesi'si: Pazar (dow 0) zaten hafta sonunun İKİNCİ günü,
  // yani Cumartesi bir gün GERİDE.
  const cumartesiGun = dow === 0 ? gun - 1 : gun + (6 - dow);
  let startsAt = cumartesiGun * GUN;
  let endsAt = startsAt + 2 * GUN;

  // Cuma 23:00'te bakan biri için pencere HENÜZ başlamadı ama doğru pencere.
  // Pazartesi bakan biri içinse bu pencere GEÇMİŞ — bir sonrakine atla.
  if (t >= endsAt) {
    startsAt += 7 * GUN;
    endsAt += 7 * GUN;
  }

  // ⚠️ Etkinlik penceresinin KENDİ haftasından seçilir, "şimdi"den değil.
  // Pazartesi bakıldığında sıradaki hafta sonu GELECEK haftaya ait.
  const evt = EVENTS[((bossWeek(new Date(startsAt)) % EVENTS.length) + EVENTS.length) % EVENTS.length];
  return { event: evt, startsAt, endsAt, live: t >= startsAt && t < endsAt };
}
