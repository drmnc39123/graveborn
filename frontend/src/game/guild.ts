// LONCALAR — oyuncuyu oyuna değil BİRBİRİNE bağlayan katman.
//
// NİYE: ölçüldü, en büyük eksik insanlardı. Sohbet "başkaları var" dedirtiyor;
// lonca "başkaları BENİ bekliyor" dedirtiyor. Kintara'nın 20.540 aylık
// oyuncusunun sebebi içerik hacmi değil, tam olarak bu ikinci cümle.
//
// ⚠️ LONCA GOLD BASMAZ. Perk olarak XP (`growth`) veriliyor, gold değil —
// Kintara da aynısını yapıyor (+%5 XP). Gold veren bir lonca perki musluğu
// oyuncu sayısıyla çarpardı ve bu oturumda kapatılan iki para basma açığının
// üçüncüsü olurdu.
//
// ⚠️ HAZİNE BİR SİNK. Bağış yapılan gold YOK EDİLİYOR (loncaya "birikmiyor",
// seviye satın alıyor). Geri çekilebilseydi lonca bir cüzdan olurdu ve
// "kur, doldur, dağıt" ile ekonomi arası transfer aracına dönerdi.

/** Lonca kurma bedeli — ciddi bir karar olmalı, ilk gün kurulmamalı */
export const GUILD_COST = 25_000;

/** Ad ve etiket sınırları */
export const NAME_MAX = 24;
export const TAG_MAX = 4;

export interface GuildLevel {
  level: number;
  /** bu seviyeye çıkmanın hazine bedeli (kümülatif DEĞİL, tek adım) */
  cost: number;
  /** üye tavanı */
  cap: number;
  /** üyelere verilen XP bonusu (0.02 = +%2) */
  growth: number;
}

/**
 * Beş seviye. Kintara'nın 5→20 üye aralığı örnek alındı.
 *
 * ⚠️ PERK KÜÇÜK KALMALI. +%10 XP fark edilir ama loncasız oyuncuyu
 * dışlamaz; +%50 olsaydı lonca zorunluluk olurdu ve "sosyal" olmaktan
 * çıkıp bir vergi hâline gelirdi.
 */
export const GUILD_LEVELS: readonly GuildLevel[] = [
  { level: 1, cost: 0, cap: 5, growth: 0.02 },
  { level: 2, cost: 40_000, cap: 8, growth: 0.04 },
  { level: 3, cost: 110_000, cap: 12, growth: 0.06 },
  { level: 4, cost: 260_000, cap: 16, growth: 0.08 },
  { level: 5, cost: 600_000, cap: 20, growth: 0.10 },
] as const;

export function guildLevel(level: number): GuildLevel {
  const l = Math.max(1, Math.min(GUILD_LEVELS.length, Math.floor(level)));
  return GUILD_LEVELS[l - 1];
}

/** Bir sonraki seviye — sonuncudaysa `undefined` */
export function nextGuildLevel(level: number): GuildLevel | undefined {
  return GUILD_LEVELS.find((g) => g.level === Math.floor(level) + 1);
}

/** Üye tavanı */
export function guildCap(level: number): number {
  return guildLevel(level).cap;
}

/** Üyelerin aldığı XP bonusu */
export function guildGrowth(level: number): number {
  return guildLevel(level).growth;
}

/**
 * Lonca adı geçerli mi. `null` dönerse SEBEBİ döner.
 *
 * ⚠️ SUNUCU DA AYNI FONKSİYONU ÇAĞIRIR. İki yerde iki kural yazmak, er ya da
 * geç ayrışmak demek — istemcide geçen bir adın sunucuda reddedilmesi
 * oyuncuya "bozuk" hissettirir.
 */
export function validateName(raw: unknown): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof raw !== 'string') return { ok: false, reason: 'Name must be text.' };
  const s = temizAd(raw);
  if (s.length < 3) return { ok: false, reason: 'Name is too short.' };
  if (s.length > NAME_MAX) return { ok: false, reason: `Name can be at most ${NAME_MAX} characters.` };
  return { ok: true, value: s };
}

export function validateTag(raw: unknown): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof raw !== 'string') return { ok: false, reason: 'Tag must be text.' };
  const s = temizAd(raw).toUpperCase();
  if (s.length < 2) return { ok: false, reason: 'Tag is too short.' };
  if (s.length > TAG_MAX) return { ok: false, reason: `Tag can be at most ${TAG_MAX} characters.` };
  // ⚠️ Sadece harf/rakam: etiket sohbette köşeli parantez içinde basılıyor,
  // içine parantez ya da kontrol karakteri girmesi kimlik taklidine açar.
  if (!/^[A-Z0-9]+$/.test(s)) return { ok: false, reason: 'Tag can only use letters and numbers.' };
  return { ok: true, value: s };
}

/**
 * Ad temizliği — sohbetteki `temizle` ile AYNI mantık (kod noktası filtresi).
 *
 * ⚠️ Regex kullanılmıyor: kaçış dizileri araç zincirinde bozulup dosyaya ham
 * kontrol karakteri düşürdü (bkz. backend/chat.ts). Kod noktasına bakmak hem
 * bağışık hem de ne elendiğini okunur kılıyor.
 */
function temizAd(ham: string): string {
  let out = '';
  for (const ch of ham) {
    const c = ch.codePointAt(0) ?? 0;
    const kontrol = c < 0x20 || c === 0x7f;
    const gizli = (c >= 0x200b && c <= 0x200f)
      || (c >= 0x2028 && c <= 0x202e)
      || c === 0x2060 || c === 0xfeff;
    if (kontrol || gizli) continue;
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}
