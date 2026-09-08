// DAVET — paylasilan sabitler ve saf kurallar.
//
// ⚠️ NIYE `@game/` ALTINDA: bu sayilar UC yerde gerekiyor — sunucu
// (odeme), arayuz (panel) ve Codex (rehber). Uc kopya tutulsaydi biri
// degistiginde digerleri sessizce yalan soylerdi; Codex'in butun tasarimi
// zaten "rakam elle yazilmaz, canli sabitten gelir" uzerine kurulu.
//
// ══════════════════════════════════════════════════════════════════════
// 🔴 ODUL KAYIT ANINDA VERILMEZ. Bir cuzdan uretmek bedava; bin cuzdan
// uretmek de bedava. Kayit basina odul veren her sistem, EN UCUZ
// SALDIRIYA EN YUKSEK ODULU verir. Odul, davet edilenin OYNAMASINA bagli.
// ══════════════════════════════════════════════════════════════════════

/**
 * Odulun acildigi derinlik — botun odemesi gereken ZAMAN.
 *
 * ⚠️ OLCUMLE SECILDI: `balance.probe`ta sifir Forge'la ortalama inis 8,2.
 * Yani bu esik "bir oturum oyna" demek; bot icin pahali, gercek oyuncu
 * icin dogal.
 */
export const ODUL_DERINLIGI = 10;

/**
 * Iki tarafin da aldigi toz.
 *
 * ⚠️ GOLD DEGIL. Gold'un tek kaynagi kosmaktir; ikinci bir kaynak oyuncu
 * sayisiyla buyur ve birincisini bogar. Toz yalniz kozmetik alir.
 */
export const ODUL_TOZ = 150;

/**
 * Bir oyuncunun odul kazanabilecegi en fazla davet.
 * ⚠️ Tavansiz bir musluk, olceklendigi an olculemez hale gelir.
 * 25 x 150 = 3.750 toz ≈ iki legendary'nin alti.
 */
export const ODUL_TAVANI = 25;

/** Yeni hesabin kod girebilecegi sure (gun) */
export const KOD_PENCERESI_GUN = 7;

/**
 * Kod alfabesi — KARISTIRILAN HARFLER YOK.
 *
 * ⚠️ `0/O` ve `1/I/L` cikarildi: kod agizdan agiza ve ekran
 * goruntusunden yaziliyor. Yanlis yazilan bir kod, davetin SESSIZCE
 * kaybolmasi demek — kimse "yanlis harf yazdim" diye sikayet etmez,
 * sadece bir daha denemez.
 */
export const KOD_ALFABE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const KOD_UZUNLUK = 6;

/** Girilen kodu normallestir — kucuk harf ve bosluk kabul edilir */
export function kodTemizle(ham: unknown): string | null {
  if (typeof ham !== 'string') return null;
  const t = ham.trim().toUpperCase().replace(/\s+/g, '');
  if (t.length !== KOD_UZUNLUK) return null;
  // ⚠️ Alfabede olmayan harf = yazim hatasi; "bulunamadi" demek yerine
  // burada eleniyor, yoksa hata mesaji sebebi gizlerdi.
  if (![...t].every((c) => KOD_ALFABE.includes(c))) return null;
  return t;
}
