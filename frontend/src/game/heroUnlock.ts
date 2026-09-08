// KARAKTER KİLİTLERİ — dört kahramanın üçü OYNAYARAK açılır.
//
// 🔴 NİYE VAR: dört kahramanın dördü de ilk saniyeden açıktı. Elimizde
// tam animasyon setleri duran dört karakter varken, açılacak hiçbir şey
// olmaması bedava bir ilerleme yayını çöpe atmaktı. Üstelik yeni oyuncu
// dört portreye aynı anda bakıp hiçbirini tanımadan seçim yapıyordu.
//
// ⚠️ HER KOŞUL `Progress`TEN OKUNUR — `achievements.ts` ile BİREBİR aynı
// kural ve aynı sebeple: `Progress` sunucu-otoriteli (gold `settleRun`dan,
// derinlik KIRPILMIŞ değerden). Yani kilit istemcinin bildirdiği hiçbir
// sayıya dayanmıyor ve sunucuda AYNI fonksiyonla doğrulanabiliyor.
// "5 dakikada 100 kill yap" gibi bir koşul burada olamaz: tek kaynağı
// istemcinin iddiası olurdu ve kilit dekora dönerdi.
//
// ⚠️ SUNUCU DA KONTROL EDİYOR (`POST /progress/hero`). Yalnız arayüzde
// gizlemek kilit değildir; uç açık kaldığı sürece iki satır `fetch` ile
// aşılır.
//
// ⚠️ HER KİLİT FARKLI BİR SİSTEMİ ÖĞRETİYOR — sayı büyütmüyor. Kampanya,
// Descent ve yine kampanyanın derinliği. Üçü de "aynı şeyi 3 kat daha
// çok yap" olsaydı kilitler ilerleme değil bekleme olurdu.
//
// ⚠️ MEVCUT OYUNCU CEZALANDIRILMIYOR: koşullar geçmişe dönük okunuyor,
// yani beta boyunca ilerlemiş bir hesap üç kahramanı da AÇIK bulur.

import type { Progress } from './progress';
import { HEROES } from './heroes';
import { VIGIL_HERO } from './vigil';

export interface KahramanKilidi {
  /** oyuncuya gösterilen şart (İngilizce — oyuncuya giden metin) */
  need: string;
  /** SAF ve yalnızca Progress okur; sunucu aynı fonksiyonu çalıştırır */
  ok: (p: Progress) => boolean;
}

const temizlenen = (p: Progress) =>
  Object.values(p.cleared ?? {}).reduce((n, v) => n + (v ? 1 : 0), 0);

const enDerin = (p: Progress) =>
  Object.values(p.depthPaid ?? {}).reduce((m, v) => Math.max(m, Number(v) || 0), 0);

/**
 * id → kilit. Listede OLMAYAN kahraman BAŞLANGIÇ kahramanıdır (açık).
 *
 * ⚠️ Sıralama tesadüf değil: `ranger` erken (ilk yarım saat), `priestess`
 * Descent'i denemeden açılmıyor, `bladekeeper` kampanyanın üçte birini
 * istiyor. Oyuncu her seferinde ZATEN yapacağı bir şeyi yaparken açıyor;
 * hiçbiri "şunun için ekstra grind yap" demiyor.
 */
export const KILITLER: Record<string, KahramanKilidi> = {
  ranger: {
    need: 'Clear 3 stages',
    ok: (p) => temizlenen(p) >= 3,
  },
  priestess: {
    need: 'Reach depth 8 in a Descent',
    ok: (p) => enDerin(p) >= 8,
  },
  /**
   * 🔴 ARTIK OYNAYARAK AÇILMIYOR — yalnız The Long Vigil kartıyla gelir
   * (kullanıcı kararı, 2026-09-08). Eski şartı "8 bölüm temizle" idi.
   *
   * ⚠️ BU BİR GERİLEME DEĞİL, KARAR: kilit derinlikten değil ödemeden
   * okunuyor. Kahramanın istatistikleri +%15 hasar · +%15 can · +2 zırh ·
   * −%10 hız — yani satılan şey görünüm değil GÜÇ. Oyun içi metinler
   * (`codex.ts`) buna göre düzeltildi; oyuncuya "güç satılmaz" deyip
   * satmak, satmanın kendisinden pahalıya mal olurdu.
   *
   * ⚠️ ŞART METNİ OYUNCUYA GÖRÜNÜYOR ve kapıyı açıkça söylüyor —
   * ulaşılamaz bir hedef göstermek, oyuncuya çözülemeyen bir bilmece
   * bırakmak olurdu.
   */
  [VIGIL_HERO]: {
    need: 'Comes with The Long Vigil',
    ok: (p) => p.vigil === true,
  },
};

/** Başlangıç kahramanı — kilidi olmayan İLK kahraman */
export const BASLANGIC_KAHRAMAN = HEROES.find((h) => !KILITLER[h.id])?.id ?? HEROES[0].id;

export function kahramanAcikMi(id: string, p: Progress): boolean {
  const k = KILITLER[id];
  if (!k) return true;              // kilidi olmayan her zaman açık
  try { return k.ok(p); } catch { return false; }
}

/** Kilitli kahramanın şart metni — açıksa `null` */
export function kahramanKilitMetni(id: string, p: Progress): string | null {
  const k = KILITLER[id];
  if (!k || kahramanAcikMi(id, p)) return null;
  return k.need;
}

/** O an oynanabilir kahramanların id listesi */
export function acikKahramanlar(p: Progress): string[] {
  return HEROES.filter((h) => kahramanAcikMi(h.id, p)).map((h) => h.id);
}
