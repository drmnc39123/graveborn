// SOL FIYATLARI — DUZ LISTE.
//
// ⚠️ KUR YOK, FORMUL YOK. Fiyatlar burada elle yazili. Onceki surumde bir
// referans kur (1 SOL = N gold) vardi ve her fiyat ondan turuyordu;
// kullanici karariyla kaldirildi — bir kur, SOL fiyati her oynadiginda
// gozden gecirilmesi gereken canli bir bag yaratiyordu ve oyuncuya
// aciklanmasi gereken fazladan bir kavramdi. Duz fiyat okunur, degistirmesi
// tek satir.
//
// ⚠️ BU RAY GUC SATMAZ — rayin var olus sarti.
// Olculdu (`balance.probe`, 12 seed x 30 dk): Forge agaci derinligi
// 8,2 → 16,6 ve kosu gold'unu 268 → 915 yapiyor. Forge'u SOL'a acmak
// (a) THE PIT'i dogrudan pay-to-win yapardi — arena kurulumu `permanent`
// alanini "Forge + ekipman + beceri toplami" diye tanimliyor ve iki tarafi
// da onunla simule ediyor — ve (b) SOL → Forge → 3,4x gold → marketplace
// → $GRAVE zincirini acardi. Ana sayfadaki SSS'de yazili soz de buna
// dayaniyor: "Depth is gated by survival, not by spending."
//
// SOL rayina ACIK olanlar (hicbiri guc vermiyor):
//   · Reliquary demeti — kozmetik + toz
//   · Ossuary tasi     — yalniz gorunurluk
//   · Lonca kurma / yukseltme — perk XP, gold basmiyor
//   · Sezon karti      — kozmetik + toz yolu
//
// ⚠️ SAF VERI — sunucu da bu dosyayi okuyor.

/** 1 SOL kac lamport */
export const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * FIYAT LISTESI (SOL).
 *
 * ⚠️ ELLE BELIRLENDI, hesaplanmadi. Degistirmek isteyen buradaki sayiyi
 * degistirir; baska hicbir yerde SOL tutari yazili degil.
 */
export const SOL_PRICES = {
  /** 10'lu Reliquary cekilisi */
  reliquary10: 0.05,
  /** lonca kurma */
  guild: 0.1,
  /**
   * lonca seviyesi.
   * ⚠️ Kullanici bu kalemi soylemedi; kurmanin biraz ustune konuldu.
   * Gold tarafinda seviye bedelleri 40.000 → 600.000 arasinda degisiyor,
   * SOL tarafi duz.
   */
  guild_up: 0.15,
  /** sezon karti — bir sezon boyunca kozmetik/toz yolu */
  battlepass: 0.5,
} as const;

export type SolProduct = keyof typeof SOL_PRICES;

/**
 * ANIT TASI — UC BASAMAK + TAVAN.
 *
 * 🔴 NIYE DUZ TEK FIYAT DEGIL — OLCULDU (2026-09-08). Anitin gold bedeli
 * ustel (400 · 1,13^n), duz bir SOL fiyati ise degismiyor. Sinirsiz duz
 * fiyatta:
 *
 *   seviye   gold ile toplam        gold ile sure     duz 0,01 SOL ile
 *     50      1.383.803 gold           226 saat            0,50 SOL
 *    100    625.113.459 gold       102.076 saat            1,00 SOL
 *
 * Yani 1 SOL, gold ile ulasilmasi imkansiz bir rutbeyi satin alirdi ve
 * siralama satirindaki rutbe rozeti "kim cok kasti" degil "kim odedi"
 * anlamina gelirdi — rozeti KAZANAN herkes icin degersizlesirdi.
 *
 * ⚠️ ELENEN IKI SECENEK:
 *   · gold'a ORANTILI fiyat — bu bir kur demek (kullanici kararıyla kur
 *     kaldirildi) ve ustelik satilamaz: L70'te tek tas ~4 SOL ederdi.
 *   · gunluk ADET siniri — sinirsiz harcamayi keser ama rozeti yine
 *     parayla aldirir, sadece yavaslatir.
 *
 * ⚠️ TAVAN L60'TA cunku orasi gold ile 768 saat: ciddi bir basari ve
 * ustundeki Necropolis rutbeleri PARAYLA ALINAMAMALI. Bir oyuncunun anita
 * harcayabilecegi tavan 2,40 SOL.
 *
 * Basamaklar ELLE yazildi; degistirmek isteyen buradaki sayilari degistirir.
 */
export const OSSUARY_SOL_LADDER: readonly { readonly upTo: number; readonly sol: number }[] = [
  { upTo: 20, sol: 0.01 },
  { upTo: 40, sol: 0.03 },
  { upTo: 60, sol: 0.08 },
] as const;

/** SOL rayinin durdugu anit seviyesi — ustu kazanilir */
export const OSSUARY_SOL_MAX = OSSUARY_SOL_LADDER[OSSUARY_SOL_LADDER.length - 1].upTo;

/** Urunun lamport karsiligi */
export function solPrice(p: SolProduct): number {
  return Math.round(SOL_PRICES[p] * LAMPORTS_PER_SOL);
}

/**
 * Bir sonraki anit tasinin SOL fiyati (lamport) — tavanin ustunde `null`.
 *
 * `lv` = oyuncunun SU ANKI seviyesi; satin alacagi tas `lv + 1`.
 *
 * ⚠️ TEK KAYNAK: sunucu da bu fonksiyonu cagiriyor. Arayuz 0,01 gosterip
 * sunucu 0,08 beklerse oyuncu odemesi reddedilmis olarak geri doner ve
 * sebebini anlamaz.
 */
export function ossuarySolPrice(lv: number): number | null {
  const tas = Math.max(0, Math.floor(Number(lv) || 0)) + 1;
  const basamak = OSSUARY_SOL_LADDER.find((b) => tas <= b.upTo);
  return basamak ? Math.round(basamak.sol * LAMPORTS_PER_SOL) : null;
}

/** Bu anit tasi SOL rayinda mi (tavanin altinda mi) */
export function ossuarySolAvailable(lv: number): boolean {
  return ossuarySolPrice(lv) !== null;
}

/** Ekranda gosterilecek SOL metni — gereksiz sifir yok */
export function solLabel(lamports: number): string {
  const sol = Math.max(0, lamports) / LAMPORTS_PER_SOL;
  return `${sol.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} SOL`;
}
