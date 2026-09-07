// THE LONG VIGIL — sezon kartı.
//
// ⚠️ KART GÜÇ SATMAZ. Bütün ödülleri kozmetik ve toz; hiçbiri hasara,
// cana, gold'a ya da derinliğe dokunmuyor. `solPrice.ts`teki kural burada
// da geçerli ve rayın var oluş şartı: ödeyen oyuncu daha derine inemez,
// yalnız farklı görünür.
//
// ⚠️ KART TEK SEFERLİK VE KALICI, ABONELİK DEĞİL.
// İlk tasarım "sezon kartı"ydı ama sezon bu oyunda HAFTALIK
// (`season.ts` → `bossWeek`). Haftalık 0,5 SOL yılda 26 SOL eder — kimse
// ödemez. Aylık yapmak ise İKİNCİ BİR TAKVİM kavramı doğururdu ve
// `season.ts` bunu açıkça yasaklıyor: "İkinci bir hafta tanımı yazma.
// Kaçınılmaz olarak kayar ve oyuncu açıklanamayan bir durumla karşılaşır."
// Bu yüzden kart bir kez alınır ve ömür boyu durur.
//
// ⚠️ "AL VE HER ŞEYİ KAP" DEĞİL. Kart bir yol açıyor; yolu OYNAYARAK
// yürüyorsun. Kademeler ulaşılan derinliğe bağlı, yani kartın verdiği şey
// bir ödül yığını değil, ödüllerin KİLİDİ. Parayla anında alınan bir
// koleksiyon, kozmetiklerin tamamını değersizleştirirdi.
//
// ⚠️ KADEMELER ULAŞILMIŞ DERİNLİKTEN OKUNUR (`paidDepth` — sunucunun ödeme
// yaptığı derinlik), iddia edilenden değil. Aynı kaynak beceri puanlarında
// ve profil kartında da kullanılıyor; ikinci bir "en derin" tanımı
// oyuncuya iki farklı sayı öğretirdi.
//
// ⚠️ SAF VERİ — sunucu da bu dosyayı okuyor.

export interface VigilTier {
  /** bu kademeyi açan derinlik (dahil) */
  depth: number;
  /** kazanılan toz */
  dust: number;
  /** varsa kozmetik id'si (cosmetics.ts, source:'vigil') */
  cosmetic?: string;
  label: string;
}

/**
 * ON İKİ KADEME.
 *
 * ⚠️ İLK KADEME d5'TE ve bu kasıtlı: kartı alan oyuncu ilk koşusunda
 * karşılığını GÖRMELİ. Ödediği şeyin çalıştığını saatler sonra öğrenen
 * oyuncu, o saatler boyunca kandırıldığını düşünür.
 *
 * ⚠️ SON KADEME d125'TE — ölçülen oyuncu duvarının (d22 civarı taban,
 * Forge'la d40+) epey ötesi. Bitmesi kolay bir yol, bitince ölür.
 *
 * ⚠️ TOZ MİKTARLARI KÜÇÜK TUTULDU. Toplam 1.240 toz ≈ yarım legendary
 * (2.100). Kart bir toz musluğu DEĞİL; asıl değeri satın alınamayan altı
 * kozmetik. Tozu büyütmek Reliquary'yi ve The Wager'ı anlamsızlaştırırdı.
 */
export const VIGIL_TIERS: readonly VigilTier[] = [
  { depth: 5, dust: 40, label: 'The first stair' },
  { depth: 10, dust: 60, cosmetic: 'v_lamp', label: 'A lamp in the dark' },
  { depth: 15, dust: 60, label: 'Deeper ground' },
  { depth: 20, dust: 80, cosmetic: 'v_watch', label: 'The long watch' },
  { depth: 25, dust: 80, label: 'Past the marker' },
  { depth: 30, dust: 100, cosmetic: 'v_ash', label: 'Ash underfoot' },
  { depth: 40, dust: 100, label: 'Nobody digs this far' },
  { depth: 50, dust: 120, cosmetic: 'v_hollow', label: 'The hollow floor' },
  { depth: 65, dust: 140, label: 'Where the maps end' },
  { depth: 80, dust: 160, cosmetic: 'v_crown', label: 'A crown of stone' },
  { depth: 100, dust: 140, label: 'One hundred down' },
  { depth: 125, dust: 160, cosmetic: 'v_eternal', label: 'The vigil never ends' },
] as const;

/** Kartın toplam toz ödülü — musluk ölçülebilir olmalı */
export function vigilTotalDust(): number {
  return VIGIL_TIERS.reduce((s, t) => s + t.dust, 0);
}

/** Bu derinlikte kaç kademe açık */
export function vigilUnlocked(depth: number): VigilTier[] {
  const d = Math.max(0, Math.floor(Number(depth) || 0));
  return VIGIL_TIERS.filter((t) => d >= t.depth);
}

/** Kademenin kimliği — alınmışlar listesinde bu kullanılır */
export function vigilKey(t: VigilTier): string {
  return `d${t.depth}`;
}

/**
 * Alınabilecek kademeler — kart sahibi + derinlik yeterli + henüz alınmamış.
 *
 * ⚠️ KART YOKSA BOŞ DÖNER. Kontrolün burada olması şart: sunucu ve arayüz
 * aynı fonksiyonu çağırıyor, ikisi ayrı yazsaydı biri "kartsız da alınır"
 * derdi ve fark kimseye görünmezdi.
 */
export function vigilClaimable(
  hasCard: boolean, depth: number, claimed: readonly string[],
): VigilTier[] {
  if (!hasCard) return [];
  const alinan = new Set(claimed);
  return vigilUnlocked(depth).filter((t) => !alinan.has(vigilKey(t)));
}

/** Kartın verdiği kozmetiklerin id listesi — `cosmetics.ts` ile eşleşmeli */
export function vigilCosmeticIds(): string[] {
  return VIGIL_TIERS.filter((t) => !!t.cosmetic).map((t) => t.cosmetic!);
}
