// KAHRAMAN USTALIĞI — karakter başına KALICI ilerleme.
//
// 🔴 NİYE VAR: dört kahraman da AYNI Forge'u paylaşıyordu. Yani kahraman
// seçmek bir oynanış tercihiydi ama bir İLERLEME hattı değildi; ikinci
// kahramanı denemenin hiçbir kalıcı karşılığı yoktu ve oyuncu ilk seçtiğine
// sonsuza kadar yapışıyordu. Kilitler (heroUnlock.ts) kapıyı açtı, bu dosya
// kapının ardına bir yol koyuyor.
//
// ⚠️ ÖLÇÜT "KAÇ KOŞU" DEĞİL, "EN DERİN" — ve bu tek karar tasarımın
// yarısı. Koşu sayısı TEKRARLA büyür: en kolay bölümü 200 kez koşan
// oyuncu tavanı görürdü ve ustalık, sabrın başka bir adı olurdu. En derin
// nokta ancak KENDİ REKORUNU kırarak büyüyor.
//
// ⚠️ SUNUCUNUN KABUL ETTİĞİ derinlik okunuyor (`Run.awardedDepth`),
// istemcinin iddiası değil; kırpılmış koşular hiç sayılmıyor. Yani ustalık
// da `Progress` gibi sunucu-otoriteli.
//
// ⚠️ GÜNLÜK İNİŞ USTALIK BESLEMİYOR (mod listesinde yok) ve beslememeli:
// günlük EŞİTLENMİŞ bir mod, kalıcı güç kazandırması "eşit güç" vaadini
// dolambaçlı yoldan çiğnerdi. Düello da yok — orada tohum rakibin.
//
// ⚠️ BONUS KAHRAMANIN KİMLİĞİNE GÖRE. Hepsine aynı "+%2 hasar" vermek
// listeyi uzatır, karakteri derinleştirmez: şövalye daha da dayanıklı,
// avcı daha da hızlı oluyor. Tavan bilerek DÜŞÜK — Forge ağacı 255.694
// gold ve bundan kat kat fazlasını veriyor; ustalık bir hattı ezmemeli,
// ona bir kimlik eklemeli.

import { oransalStat, type StatKey } from './config';
import { HEROES } from './heroes';

/** Kademe eşikleri — o kahramanla ulaşılmış EN DERİN nokta */
export const USTALIK_ESIK: readonly number[] = [5, 12, 22, 36, 55];

/** En yüksek kademe */
export const USTALIK_MAX = USTALIK_ESIK.length;

/** Ustalığı besleyen modlar — eşitlenmiş ve rakip-tohumlu modlar HARİÇ */
export const USTALIK_MODLARI: readonly string[] = ['descent', 'wilderness'];

/**
 * Kademe başına kahramanın KENDİ istatistiği.
 *
 * ⚠️ Sayılar tavanla birlikte okunmalı: 5 kademede toplam
 *   knight  +1 zırh · ranger −%10 bekleme · priestess +0,3 HP/sn ·
 *   bladekeeper +%10 can
 * Dördü de o kahramanın zaten güçlü olduğu yönü biraz daha büyütüyor.
 */
export const USTALIK_STAT: Record<string, { key: StatKey; perTier: number; etiket: string }> = {
  knight: { key: 'armor', perTier: 0.2, etiket: 'armor' },
  // ⚠️ `cooldown` NEGATİF = daha hızlı (config.ts kuralı). İşareti ters
  // yazmak sessizce bir CEZA olurdu ve kimse fark etmezdi.
  ranger: { key: 'cooldown', perTier: -0.02, etiket: 'attack speed' },
  priestess: { key: 'recovery', perTier: 0.06, etiket: 'health regen' },
  bladekeeper: { key: 'maxHp', perTier: 0.02, etiket: 'max health' },
};

/** Ulaşılan en derin noktadan kademe — 0..USTALIK_MAX */
export function ustalikKademesi(enDerin: number): number {
  const d = Math.max(0, Math.floor(Number(enDerin) || 0));
  let k = 0;
  for (const esik of USTALIK_ESIK) if (d >= esik) k++;
  return k;
}

/** Bir sonraki kademe için gereken derinlik — tavandaysa `null` */
export function sonrakiEsik(kademe: number): number | null {
  return kademe >= USTALIK_MAX ? null : USTALIK_ESIK[kademe];
}

/**
 * Kahramanın ustalık bonusu — motora `permanent` kanalından girer.
 *
 * ⚠️ Tanımsız kahraman BOŞ döner, varsayılana DÜŞMEZ. Yanlış yazılmış bir
 * id'nin sessizce şövalyenin bonusunu alması, en kötü tür hatadır.
 */
export function ustalikBonusu(heroId: string, kademe: number): Partial<Record<StatKey, number>> {
  const t = USTALIK_STAT[heroId];
  const k = Math.max(0, Math.min(USTALIK_MAX, Math.floor(kademe)));
  if (!t || k <= 0) return {};
  return { [t.key]: t.perTier * k };
}

/**
 * ⭐ OYUNCUYA GÖSTERİLECEK BONUS METNİ — JSX'te DEĞİL, burada.
 *
 * 🔴 NİYE BURADA: ilk sürüm biçimlendirmeyi kartın içinde yapıyordu ve
 * "değer 1'den küçükse yüzdedir" diye VARSAYIYORDU. Sonuç ölçüldü:
 * zırh bonusu `0.4` ekranda **"+%40 armor"** olarak göründü — oysa zırh
 * puan, oran değil. Aynı hata bu depoda daha önce `recovery` ile de
 * yapılmıştı (bkz. `config.ts` `DUZ_STATLAR`). JSX içindeki bir
 * biçimlendirme test EDİLEMİYOR; saf bir fonksiyon edilebiliyor.
 *
 * ⚠️ İŞARET HER ZAMAN "+": ustalığın her kademesi FAYDA. `cooldown`
 * motorda negatifken daha hızlı demek, ama oyuncuya "−%10 bekleme"
 * değil "+%10 saldırı hızı" yazmak gerekiyor. (Negatifliğin doğruluğunu
 * mühür ayrıca ölçüyor.)
 */
export function ustalikMetni(heroId: string, kademe: number): string | null {
  const t = USTALIK_STAT[heroId];
  const k = Math.max(0, Math.min(USTALIK_MAX, Math.floor(kademe)));
  if (!t || k <= 0) return null;
  const v = Math.abs(t.perTier * k);
  if (!oransalStat(t.key)) {
    // ⚠️ Kayan nokta artığı temizleniyor: 0.06 × 5 = 0.30000000000000004
    const sayi = Number(v.toFixed(2));
    return `+${sayi} ${t.etiket}`;
  }
  return `+${Math.round(v * 100)}% ${t.etiket}`;
}

/**
 * Her kahramanın bir ustalık tanımı VAR MI — mühür bunu okuyor.
 * Eksik bir tanım, o kahramanı sessizce ilerlemesiz bırakırdı.
 */
export function ustalikTanimsizlar(): string[] {
  return HEROES.filter((h) => !USTALIK_STAT[h.id]).map((h) => h.id);
}
