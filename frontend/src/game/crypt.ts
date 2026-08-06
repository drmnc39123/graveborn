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
