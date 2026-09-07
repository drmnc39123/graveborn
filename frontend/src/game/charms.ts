// PEDLAR'S STALL — koşuya taşınan tılsımlar.
//
// NİYE VAR: gold'un tek çıkışı The Forge'du. Kintara araştırmasından çıkan
// ders net — TEK SİNK'Lİ EKONOMİ DOYAR: oyuncu ağacı doldurdukça gold'un
// anlamı biter ve elinde biriken yığın markete akar. Tılsımlar sonsuz
// tüketilen ikinci musluk deliği.
//
// ⚠️ KİLİTLİ KURAL: "Pedlar koşuya taşıdığın şeyleri satar, KALICI GÜÇ
// DEĞİL. O Forge'un işi." Tılsım tek koşuluk; kazansan da kaybetsen de
// yanar. Kolaylık satar, kestirme değil.
//
// ⚠️ GOLD ARTIRAN TILSIM YOK. Plan kuralı: `greed` nadir düşüşü etkilemez,
// yoksa "gold al → daha çok gold" sarmalı kurulur. Aynı sebeple burada da
// kazanç çarpanı satılmıyor — sadece hayatta kalma ve güç.
//
// ⚠️ SAF VERİ. DOM yok, `Math.random()` yok; sunucu da aynı dosyayı okur.

import type { StatKey } from './config';

export interface CharmDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  /** motorun `permanent` kanalına eklenen bonuslar — Forge ile aynı yol */
  stats: Partial<Record<StatKey, number>>;
}

/** Aynı anda taşınabilecek tılsım sayısı — seçim zorlasın diye dar */
export const CHARM_SLOTS = 2;

// ══════════════════════════════════════════════════════════════════════
// FİYAT İLERLEMEYLE ÖLÇEKLENİYOR (2026-09-07)
// ══════════════════════════════════════════════════════════════════════
// 🔴 SORUN ÖLÇÜLDÜ: fiyat SABİTTİ, gelir ise derinlikle ÜSTEL büyüyor.
// İki yuvayı doldurmak 410 gold; yeni bir derinliğin ödülü d10'da 560,
// d100'de 12.530. Yani aynı 410 gold d10'da ödülün %73'ü (ciddi bir karar),
// d100'de %3'ü (düşünmeden alınır). Sink geç oyunda çalışmayı bırakıyordu.
//
// ⚠️ DÜZ ZAM YANLIŞ ÇÖZÜMDÜ ve ölçümle elendi: tekrar koşusu 376 gold
// kazandırıyor, iki dolu yuva zaten 410 — erken oyuncu HALİHAZIRDA net
// zararda. Düz zam onu tamamen dışlardı. Sorun fiyatın düşüklüğü değil,
// ÖLÇEKLENMEMESİYDİ.
//
// ⚠️ ÜS DERİNLİK ÖDÜLÜNDEN TÜRETİLDİ, seçilmedi: `depthGold` ölçüldü
// (d5=220 · d10=560 · d25=1.928 · d50=4.915 · d100=12.530) ve büyümesi
// yaklaşık d^1,35. Aynı üs kullanılınca tılsım/ödül oranı d25-d200 arası
// SABİT %21 kalıyor.
//
// ⚠️ ÇAPA d25 ve ALTINDA ÇARPAN 1: mevcut fiyatlar yaklaşık oraya
// kalibreliydi (d25'te ödülün %21'i). Daha sığ oyuncu bugünkü fiyatı
// ödüyor — zaten en zorlandığı yer orası, zam görmemeli.
//
// ⚠️ TAVAN VAR: derinlik teorik olarak sonsuz (`descentStage` d1000'i bile
// üretiyor). Tavansız bir çarpan, derin oyuncuya tılsımı tamamen kapatırdı;
// sink'in işi caydırmak değil, anlamlı kalmak.
export const CHARM_SCALE = {
  /** bu derinliğe kadar çarpan 1 — mevcut fiyatlar buraya kalibre */
  anchor: 25,
  /** `depthGold` büyüme üssünden ölçülerek alındı */
  exponent: 1.35,
  /** çarpanın üst sınırı */
  max: 20,
} as const;

/**
 * Oyuncunun en derin inişine göre fiyat çarpanı. SAF FONKSİYON —
 * sunucu da istemci de bunu çağırıyor; fiyat iki yerde YAZILMIYOR.
 */
export function charmPriceMul(deepestDepth: number): number {
  const d = Math.floor(Number(deepestDepth));
  // ⚠️ Bozuk girdi çarpanı 1 yapar, 0 ya da NaN DEĞİL: NaN bir fiyat
  // "yetersiz gold" hatasına dönüşür ve tezgâh sessizce kapanırdı.
  if (!Number.isFinite(d) || d <= CHARM_SCALE.anchor) return 1;
  return Math.min(CHARM_SCALE.max, Math.pow(d / CHARM_SCALE.anchor, CHARM_SCALE.exponent));
}

/** Tılsımın BU oyuncu için fiyatı — tek doğru kaynak */
export function charmCost(def: CharmDef, deepestDepth: number): number {
  return Math.round(def.cost * charmPriceMul(deepestDepth));
}

/**
 * Fiyatın dayandığı derinlik: ÖDENMİŞ en derin iniş (tüm bölümler).
 *
 * ⚠️ İKİ TARAF AYNI FONKSİYONU ÇAĞIRMAK ZORUNDA. Sunucu `bestDepth`,
 * arayüz `depthPaid` kullansaydı iki farklı fiyat çıkardı: oyuncu 410
 * görür, sunucu 1.045 keser. Bu depoda "aynı kural iki yerde yazılınca
 * ayrışır" dersi defalarca alındı; burada tek kaynak bu fonksiyon.
 *
 * ⚠️ `depthPaid` SEÇİLDİ çünkü sunucunun ÖDEDİĞİ, yani doğruladığı ve
 * kırptığı değer. İstemcinin iddiası değil.
 */
export function charmDepthOf(depthPaid: Record<number, number> | undefined): number {
  if (!depthPaid) return 0;
  let en = 0;
  for (const v of Object.values(depthPaid)) {
    const n = Math.floor(Number(v));
    if (Number.isFinite(n) && n > en) en = n;
  }
  return en;
}

/**
 * ⚠️ HEPSİ MOTORUN GERÇEKTEN OKUDUĞU İSTATİSTİKLER. Forge'daki kuralın
 * aynısı: çalışmayan bir şeyi satmak oyuncuyu kandırmaktır.
 *
 * Fiyatlandırma mantığı: bir tılsım, aynı etkiyi veren Forge seviyelerinden
 * UCUZ ama tek koşuluk. Birkaç koşudan fazla oynayacak oyuncu için Forge
 * her zaman daha kârlı — kalıcı güç orada kalsın diye.
 */
export const CHARMS: readonly CharmDef[] = [
  { id: 'draught', name: 'Blood Draught', desc: '+25% max health for one run', cost: 80, stats: { maxHp: 0.25 } },
  { id: 'ash', name: "Scholar's Ash", desc: '+30% experience for one run', cost: 100, stats: { growth: 0.30 } },
  { id: 'skin', name: 'Iron Skin', desc: '+3 armor for one run', cost: 110, stats: { armor: 3 } },
  { id: 'edge', name: 'Whetted Edge', desc: '+18% damage for one run', cost: 130, stats: { might: 0.18 } },
  { id: 'boots', name: 'Swift Boots', desc: '+10% move speed for one run', cost: 150, stats: { moveSpeed: 0.10 } },
  { id: 'offering', name: 'Grave Offering', desc: '+1 revival for one run', cost: 260, stats: { revival: 1 } },
] as const;

export function charmById(id: string): CharmDef | undefined {
  return CHARMS.find((c) => c.id === id);
}

/**
 * Taşınan tılsımların toplam etkisi — `permanentBonus()` çıktısıyla
 * BİRLEŞTİRİLİR (ikisi de motorun aynı `permanent` kanalına gider).
 */
export function charmBonus(ids: readonly string[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const id of ids) {
    const c = charmById(id);
    if (!c) continue;
    for (const [k, v] of Object.entries(c.stats)) {
      const key = k as StatKey;
      out[key] = (out[key] ?? 0) + (v ?? 0);
    }
  }
  return out;
}

/** İki bonus haritasını topla — Forge + tılsım */
export function mergeBonus(
  a: Partial<Record<StatKey, number>>,
  b: Partial<Record<StatKey, number>>,
): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const key = k as StatKey;
    out[key] = (out[key] ?? 0) + (v ?? 0);
  }
  return out;
}
