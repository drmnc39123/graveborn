// OYUNCU ADI — doğrulama ve benzersizlik anahtarı.
//
// 🔴 NİYE VAR (kullanıcı): *"Oyunumuzda kullanıcı adı koymaları için
// oyunculara tanıdığımız bir yer var mı? Oyuncu kayıt olurken zorunlu
// olarak açılacak bir pencerede, oyuna başlamadan önce bir nick koysun."*
//
// Yoktu: `Player` yalnızca `wallet` taşıyordu ve oyuncu her yerde
// `7dau…Bo4` diye görünüyordu — sıralamada, düelloda, lonca listesinde,
// sohbette, market ilanında.
//
// ⚠️ BU DOSYA `@game/` ALTINDA VE BU BİLİNÇLİ. `backend/tsconfig.json`
// `@game/*` → `frontend/src/game/*` eşliyor ve `backend/src/guild.ts`
// doğrulamayı zaten buradan alıyor (`@game/guild`). Aynı kuralı iki yere
// yazmak bu depoda tekrar eden en pahalı hata; istemci ve sunucu AYNI
// fonksiyonu çağırıyor.
//
// ⚠️ TEMİZLEME MANTIĞI ÜÇÜNCÜ KEZ YAZILMIYOR. `chat.temizle` ve
// `guild.temizAd` aynı kod-noktası filtresini taşıyor; buradaki
// `temizAd` onların GENİŞLETİLMİŞ hâli (aşağıya bak) ve gerekçesi
// sayılabilir: ad BENZERSİZ olduğu için görünmez karakter burada
// yalnız çirkinlik değil, KİMLİK ÇALMA aracı.

/**
 * YENİDEN ADLANDIRMA FİYATI — ilk ad BEDAVA, sonrakiler ARTAN.
 *
 * 🔴 SABİT FİYAT OLMAMASININ SEBEBİ: ad benzersiz bir KİMLİK. Ucuz ve sabit
 * bir fiyat, kötü davranan oyuncunun ad değiştirip itibarını sıfırlamasını
 * ucuz bırakırdı — yani adı benzersiz yapmanın sebebini yer.
 *
 * ⚠️ ÖLÇEK MEVCUT GİDERLERE GÖRE, UYDURULMADI: lonca kurma 25.000, ikinci
 * pet yuvası 40.000. Ad değiştirmek kimlik işidir, güç değil — ilki
 * onlardan hafif (5.000), tekrarlandıkça ikiye katlanıyor ve lonca
 * kurmanın üstünde bir yerde (40.000) duruyor.
 *
 * ⚠️ TAVAN VAR: sınırsız katlama 6. değişimde 160.000'e çıkar ve pratikte
 * "bir daha asla" demek olur. Amaç caydırmak, kilitlemek değil.
 */
export const RENAME_TABAN = 5_000;
export const RENAME_TAVAN = 40_000;

export function renameCost(renames: number): number {
  if (renames <= 0) return 0;   // ilk ad bedava
  return Math.min(RENAME_TAVAN, RENAME_TABAN * 2 ** (renames - 1));
}

/** Ekranda ve veritabanında tutulan sınırlar */
export const AD_MIN = 3;
export const AD_MAX = 16;

/**
 * REZERVE ADLAR — taklit en ucuz saldırı.
 *
 * ⚠️ KÜFÜR FİLTRESİ BİLEREK YOK. Diller arası güvenilmez, masum adları
 * engeller ve en kötüsü YANLIŞ GÜVEN verir ("filtre var, demek ki temiz").
 * Gerçek kol bir liste değil, admin yeniden adlandırma ucu.
 */
const REZERVE = new Set([
  'admin', 'administrator', 'mod', 'moderator', 'system', 'server',
  'graveborn', 'grave', 'treasury', 'support', 'staff', 'official',
  'null', 'undefined', 'anonymous', 'you',
]);

/**
 * KOD NOKTASI FİLTRESİ — regex DEĞİL, bilerek.
 *
 * ⚠️ `chat.ts` başlığının kaydettiği ders: regex ile yazılmıştı ve kaçış
 * dizileri araç zincirinde ÜÇ KEZ bozulup dosyaya ham kontrol karakteri
 * düşürdü. Kod noktasına bakmak hem buna bağışık hem de NE elendiğini
 * okunur kılıyor.
 *
 * 🔴 ESKİ İKİ KOPYADAN DAHA GENİŞ, VE SEBEBİ ADIN BENZERSİZ OLMASI.
 * `chat.temizle` sohbet metni için yazılmıştı: orada görünmez karakter
 * en fazla çirkinlik. Ad benzersiz bir KİMLİK olduğu için aynı karakterler
 * burada "aynı görünen ikinci bir ad" üretmenin yolu. Eklenenler:
 *   U+061C  Arabic letter mark
 *   U+180E  Mongolian vowel separator
 *   U+2066-2069 bidi izolatörleri (LRI/RLI/FSI/PDI) — `temizle`de YOK
 *   U+3164  Hangul dolgu (boşluk gibi görünür, harf sayılır)
 *   U+FFA0  yarım genişlik Hangul dolgu
 *   U+FE00-FE0F varyasyon seçicileri
 */
function gizliMi(c: number): boolean {
  return (c >= 0x200b && c <= 0x200f)
    || (c >= 0x2028 && c <= 0x202e)
    || (c >= 0x2066 && c <= 0x2069)
    || (c >= 0xfe00 && c <= 0xfe0f)
    || c === 0x061c || c === 0x180e || c === 0x2060
    || c === 0x3164 || c === 0xffa0 || c === 0xfeff;
}

function temizAd(ham: string): string {
  let out = '';
  for (const ch of ham) {
    const c = ch.codePointAt(0) ?? 0;
    if (gizliMi(c)) continue;                       // tamamen at
    out += (c < 0x20 || c === 0x7f) ? ' ' : ch;     // kontrol → boşluk
  }
  // ⚠️ Boşluk yığınları teke iner ve baş/son kırpılır: "  Ash   en  " ile
  // "Ash en" AYNI ad olmalı, yoksa boşlukla ikinci bir kopya alınır.
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * BENZERSİZLİK ANAHTARI.
 *
 * 🔴 `name`i doğrudan `@unique` yapmak YETMEZ: Postgres karşılaştırması
 * harf duyarlı, yani "Ashen" ve "ashen" ikisi de alınabilirdi ve
 * benzersizlik bir söz olmaktan öteye geçmezdi.
 *
 * ⚠️ KARIŞTIRILABİLİR HARFLER DE KATLANIYOR — ve asıl saldırı bu.
 * Kiril "а" (U+0430) ile Latin "a" ekranda AYNI görünüyor; katlanmazsa
 * sıralamada birinci olan oyuncunun adının birebir kopyasını almak
 * mümkün olurdu. `chat.temizle` bunu YAPMIYOR (yalnız görünmezleri
 * eliyor); ad benzersiz olduğu için burada şart.
 *
 * ⚠️ DAR TUTULDU. Agresif katlama (0→o, 1→l, rakamları harfe çevirme)
 * masum adları çakıştırır: "Ashen" ile "Ash3n" farklı iki oyuncudur.
 * Yalnızca GÖRSEL OLARAK AYNI olan Kiril/Yunan harfleri Latin'e
 * indiriliyor, ayraçlar atılıyor, gerisine dokunulmuyor.
 */
const KARISTIRILABILIR: Record<string, string> = {
  // Kiril → Latin (ekranda ayırt edilemeyenler)
  'а': 'a', 'в': 'b', 'с': 'c', 'е': 'e', 'н': 'h', 'к': 'k', 'м': 'm',
  'о': 'o', 'р': 'p', 'ѕ': 's', 'т': 't', 'х': 'x', 'у': 'y', 'і': 'i',
  'ј': 'j', 'ԁ': 'd', 'ɡ': 'g',
  // Yunan → Latin
  'ο': 'o', 'ρ': 'p', 'α': 'a', 'ν': 'v', 'τ': 't', 'κ': 'k', 'ι': 'i',
  // Türkçe noktasız/noktalı i ve benzerleri — aynı ada iki yazım olmasın
  'ı': 'i', 'İ': 'i', 'ş': 's', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ç': 'c',
};

export function adAnahtari(ad: string): string {
  // ⚠️ NFKC: birleşik "é" ile "e"+U+0301 aynı anahtara insin. `temizle`
  // Unicode normalizasyonu HİÇ yapmıyordu; benzersizlikte bu bir açık.
  const n = ad.normalize('NFKC').toLowerCase();
  let out = '';
  for (const ch of n) {
    const k = KARISTIRILABILIR[ch] ?? ch;
    // ayraçlar anahtarda yok: "Ash_en" ≡ "ash en" ≡ "ashen"
    if (k === ' ' || k === '_' || k === '-') continue;
    out += k;
  }
  return out;
}

export type AdSonuc =
  | { ok: true; value: string; key: string }
  | { ok: false; reason: string };

/**
 * Adı doğrula.
 *
 * ⚠️ HATA METİNLERİ OYUNCUYA GÖRÜNÜR (İngilizce) ve NE YAPACAĞINI
 * söylüyor. "Invalid name" bir hata değil, bir bilmecedir.
 */
export function validatePlayerName(raw: unknown): AdSonuc {
  if (typeof raw !== 'string') return { ok: false, reason: 'Name must be text.' };
  const s = temizAd(raw);
  if (s.length < AD_MIN) return { ok: false, reason: `At least ${AD_MIN} characters.` };
  if (s.length > AD_MAX) return { ok: false, reason: `At most ${AD_MAX} characters.` };

  /**
   * ⚠️ İZİN LİSTESİ, YASAK LİSTESİ DEĞİL. Neyin geçtiğini saymak, neyin
   * geçmediğini saymaktan güvenli: yarın eklenecek bir Unicode bloğu
   * yasak listesinden kaçar, izin listesinden kaçamaz.
   * ⚠️ Emoji BİLEREK dışarıda: sohbette, tuvalde (`fillText`) ve dar HUD
   * satırlarında farklı genişlikte çizilip hizayı bozuyor.
   */
  for (const ch of s) {
    const harf = /\p{L}/u.test(ch);
    const rakam = /\p{Nd}/u.test(ch);
    if (!harf && !rakam && ch !== ' ' && ch !== '_' && ch !== '-') {
      return { ok: false, reason: 'Letters, numbers, spaces, _ and - only.' };
    }
  }
  // ⚠️ En az bir harf ŞART: "---" ya da "123" bir ad değil, bir dolgu.
  if (!/\p{L}/u.test(s)) return { ok: false, reason: 'Needs at least one letter.' };

  const key = adAnahtari(s);
  // ⚠️ Anahtar da kısa olamaz: "a-b" 3 karakter ama anahtarı "ab".
  if (key.length < AD_MIN) return { ok: false, reason: `At least ${AD_MIN} letters or numbers.` };
  if (REZERVE.has(key)) return { ok: false, reason: 'That name is reserved.' };

  return { ok: true, value: s, key };
}

/**
 * GÖSTERİLEN AD — TEK ÇÖZÜCÜ.
 *
 * 🔴 NİYE TEK: ölçüldü, depoda **15 ayrı yerde** aynı cüzdan kısaltması
 * elle yazılmıştı (`ArenaScreen`, `DuelPanel`, `GuildPanel`, `MarketPanel`,
 * `WorldBossPanel`, `presence.ts`, `dm.ts`, `referral.ts` …) ve admin
 * panelinde ÜÇ FARKLI kırpma vardı (4/4, 6/4). Nickname 16.'yı eklerse
 * bir gün ekranın yarısı ad, yarısı cüzdan gösterir.
 *
 * ⚠️ `self` verildiğinde "You" dönüyor — bugün 5 dosyanın elle yaptığı
 * kontrol (`mine ? 'You' : kisa(...)`) buraya taşınıyor.
 */
export function kisaCuzdan(w: string): string {
  return w.length > 9 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

export function oyuncuAdi(
  p: { wallet: string; name?: string | null },
  self = false,
): string {
  if (self) return 'You';
  return p.name && p.name.length > 0 ? p.name : kisaCuzdan(p.wallet);
}
