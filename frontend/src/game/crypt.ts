// THE CRYPT DEED — mezar sahipliği ve Crypt Vault.
//
// ⚠️ BU BİR MUSLUK DEĞİL, YENİDEN DAĞITIM. Planda "pasif gold üretimi" diye
// yazılmıştı ve tam o hâliyle YAPILMADI: ekonominin tamamı musluğu kontrol
// altına almakla geçti (ölçülmüş denge 6.124 gold/saat, Forge ağacı 42 saat),
// pasif gelir o eğriyi doğrudan bozardı.
//
// Kintara'nın gerçek modeli bunu zaten çözmüş: oradaki "Money Printer" yeni
// gold BASMIYOR, kumarda KAYBEDİLEN gold'un payını dağıtıyor. Aynı yapı:
//
//   her gold SİNK'inin küçük bir payı ortak bir KASAYA düşer,
//   deed sahipleri o kasadan çeker.
//
// Yapısal garanti: ÖDENEN ≤ KASAYA GİREN. Kasa gerçek bir bakiye; içine
// girmemiş gold çıkamaz. Yani toplam arz BÜYÜMEZ — sadece harcayandan
// deed sahibine akar. Üstelik deed'in KENDİSİ büyük bir sink.
//
// ⚠️ Katkı oranı sink'i öldürmemeli: %10 alınıyor, %90'ı hâlâ yok ediliyor.
// Oranı yükseltmek "sink" kelimesini anlamsızlaştırır.

/** Sink'ten kasaya düşen pay. ⚠️ Yükseltme — %90 imha edilmeye devam etmeli. */
export const CRYPT_CUT = 0.10;

export interface CryptTier {
  tier: number;
  name: string;
  /** satın alma bedeli (gold) — deed'in kendisi bir sink */
  cost: number;
  /** kasa payındaki ağırlık */
  weight: number;
  blurb: string;
}

/**
 * Üç kademe. Fiyatlar BİLEREK ağır: Forge ağacının tamamı 255.694 gold ve
 * bu GEÇ oyun içeriği.
 *
 * ⚠️ Fiyat İKİ KEZ ölçümle düzeltildi. İlki 60.000'di: tekrar koşusu geliri
 * 6.124 gold/saat, yani ≈10 saat — Forge'un ORTA oyunuyla yarışan bir fiyat.
 * Deed geri ödeme yaptığı için oyuncu Forge'u bırakıp önce onu alır, güç
 * ilerlemesi dururdu.
 * İkincisi kampanya 25 bölüme çıkarken geldi: Forge ağacı 255.694'ten
 * 615.533'e büyüdü, 90.000 artık "geç oyun" değil orta oyun olmuştu.
 * 220.000 ≈ 36 saat — ağacın çekirdeği bittikten sonra gelen bir karar.
 *
 * ⚠️ Ağırlık fiyattan YAVAŞ büyüyor (×3 fiyat → ×2,5 ağırlık). Aksi hâlde
 * en pahalı kademe her zaman en kârlı olur ve alt kademeler ölü doğardı.
 */
export const CRYPT_TIERS: readonly CryptTier[] = [
  { tier: 1, name: 'Pauper\'s Plot', cost: 220_000, weight: 1, blurb: 'A stone, a name, and a share of what the village spends.' },
  { tier: 2, name: 'Sexton\'s Vault', cost: 590_000, weight: 2.5, blurb: 'Deeper ground. The dead here paid for the privilege.' },
  { tier: 3, name: 'The Barrow Deed', cost: 1_580_000, weight: 6, blurb: 'You own a hill. Everything under it is yours by writ.' },
] as const;

export function cryptTier(t: number): CryptTier | undefined {
  return CRYPT_TIERS.find((x) => x.tier === t);
}

/** Bir sonraki kademe — sahip değilse 1. kademe */
export function nextCryptTier(owned: number): CryptTier | undefined {
  return CRYPT_TIERS.find((x) => x.tier === owned + 1);
}

/** Yükseltme bedeli — ödenmiş kademenin farkı, baştan ödeme YOK */
export function cryptUpgradeCost(owned: number): number {
  const next = nextCryptTier(owned);
  if (!next) return Infinity;
  const now = cryptTier(owned);
  return next.cost - (now?.cost ?? 0);
}

/** Bir sink harcamasından kasaya düşecek miktar (tam sayı, aşağı yuvarlanır) */
export function cryptContribution(spent: number): number {
  const s = Math.max(0, Math.floor(spent));
  return Math.floor(s * CRYPT_CUT);
}

/**
 * Kasa payı — ağırlık oranına göre.
 *
 * ⚠️ TAM SAYI ve AŞAĞI yuvarlanır. Yukarı yuvarlamak "ödenen > kasa"
 * yaratabilir ve tam olarak engellemek istediğimiz şey odur; artan kuruşlar
 * kasada kalıp sonraki dağıtıma devreder.
 */
export function cryptShare(vault: number, myWeight: number, totalWeight: number): number {
  if (vault <= 0 || myWeight <= 0 || totalWeight <= 0) return 0;
  return Math.floor((vault * myWeight) / totalWeight);
}

/**
 * HAFTALIK CEKIM TAVANI — tapu bedelinin orani.
 *
 * ⚠️ NIYE VAR: tavansiz cekimde ilk tapu sahibi O GUNE KADAR BIRIKMIS
 * kasanin TAMAMINI tek seferde aliyordu. Kasa oyunun ilk gunuden itibaren
 * doluyor ama kimse 220.000 gold'a hemen ulasamiyor; yani ilk tapuyu alan
 * haftalarin birikimini tek cekiste topluyordu. Bu bir temettu degil,
 * IKRAMIYEYDI.
 *
 * Olculdu (2026-09-07): 1.000 aktif oyuncu / 10 tapu sahibi dagiliminda bir
 * T1 sahibi haftada 238.155 gold cekiyordu — Forge agacinin TAMAMI 564.516.
 * Yani hic oynamadan 2,4 haftada butun agac.
 *
 * ⚠️ %10 SECILDI cunku tavan BEDELIN orani: her kademede amortisman tabani
 * tam 10 hafta oluyor, yani tavan kademe secimini BOZMUYOR. Sabit bir gold
 * tavani (or. 50.000) ucuz kademeyi kayirir ve T3'u olu dogururdu.
 *
 * ⚠️ CEKILMEYEN PAY KASADA KALIR, yanmaz. Kasa buyumeye devam eder ve gec
 * gelen tapu sahibi de dolu bir kasa bulur — "erken gelen hepsini aldi"
 * etkisinin panzehiri bu.
 */
export const CRYPT_WEEKLY_CAP = 0.10;

/** Bu kademenin haftalik cekim tavani (gold) */
export function cryptWeeklyCap(t: CryptTier): number {
  return Math.floor(t.cost * CRYPT_WEEKLY_CAP);
}

export interface CryptDraw {
  /** bu hafta GERCEKTEN odenecek */
  amount: number;
  /** tavansiz hak edilen pay */
  share: number;
  /** bu kademenin haftalik tavani */
  cap: number;
  /** tavan devreye girdi mi — arayuz bunu SOYLEMELI */
  capped: boolean;
}

/**
 * Bu hafta ne cekilir — TEK KAYNAK.
 *
 * ⚠️ Sunucu ve arayuz AYNI fonksiyonu cagirir. Arayuz 238.155 gosterip
 * sunucu 22.000 oderse oyuncu soyuldugunu dusunur ve hakli olur; bu depoda
 * "ayni kural iki yerde yazilinca ayrisir" dersi defalarca alindi.
 */
export function cryptDraw(vault: number, t: CryptTier | undefined, totalWeight: number): CryptDraw {
  if (!t) return { amount: 0, share: 0, cap: 0, capped: false };
  const share = cryptShare(vault, t.weight, totalWeight);
  const cap = cryptWeeklyCap(t);
  return { amount: Math.min(share, cap), share, cap, capped: share > cap };
}

/**
 * Bu cekim hiziyla tapu kac haftada kendini oder.
 *
 * ⚠️ Tavan yuzunden ALT SINIR var: hicbir kademe 1/CRYPT_WEEKLY_CAP
 * haftadan hizli amorti edemez. Tapu bir cevirme degil, uzun vadeli bir
 * tutma — bu sayi oyuncuya gosterilmeli ki beklentisi dogru olsun.
 */
export function cryptPaybackWeeks(t: CryptTier, weeklyDraw: number): number {
  return weeklyDraw > 0 ? t.cost / weeklyDraw : Infinity;
}

/**
 * Deed kendini kaç gold'luk TOPLUM harcamasıyla amorti eder?
 *
 * Arayüzde gösterilmiyor; ölçüm testinin sorusu. Cevap "asla" çıkarsa deed
 * saf prestij sinki demektir — bu kabul edilebilir ama BİLİNEREK olmalı,
 * kazara değil.
 */
export function cryptBreakEven(tier: number, myWeight: number, totalWeight: number): number {
  const t = cryptTier(tier);
  if (!t || myWeight <= 0 || totalWeight <= 0) return Infinity;
  const payPerSpend = CRYPT_CUT * (myWeight / totalWeight);
  return payPerSpend > 0 ? t.cost / payPerSpend : Infinity;
}
