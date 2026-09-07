// SOL ÖDEME RAYI — TEK REFERANS KUR.
//
// ⚠️ NİYE TEK SABİT: her dükkâna elle SOL fiyatı yazmak, ikinci bir örtük
// kur yaratır ve iki yer zamanla ayrışır. Bu depoda "aynı kural iki yerde
// yazılınca ayrışır" dersi defalarca alındı (tılsım fiyatı, kilitli bina,
// kasa payı). Bütün SOL fiyatları BU dosyadan türer ve arayüzde kur
// AÇIKÇA yazılır.
//
// ⚠️ SOL RAYI BİLEREK PAHALI. Amaç oyuncuyu SOL'a itmek değil; gold'un
// gerçek bir değeri olduğunu İLAN ETMEK. Ödeyen kişi zamanını satın alıyor,
// avantaj değil.
//
// ⚠️ BU RAY GÜÇ SATMAZ — kural bu dosyanın var oluş şartı.
// Ölçüldü (`balance.probe`, 12 seed × 30 dk): Forge ağacı derinliği
// 8,2 → 16,6 ve koşu gold'unu 268 → 915 yapıyor. Yani Forge'u SOL'a açmak
// (a) THE PIT'i doğrudan pay-to-win yapardı — arena kurulumu `permanent`
// alanını "Forge + ekipman + beceri toplamı" diye tanımlıyor ve iki tarafı
// da onunla simüle ediyor — ve (b) SOL → Forge → 3,4× gold → marketplace
// → $GRAVE zincirini açardı. Hazine token BASMASA da ödeyen kişi token
// kazanma kapasitesini nakitle satın almış olurdu.
// Ana sayfadaki SSS'de yazılı söz de buna dayanıyor:
// "Depth is gated by survival, not by spending."
//
// SOL rayına AÇIK olanlar (hiçbiri güç vermiyor):
//   · Reliquary çekilişi — kozmetik + toz
//   · Ossuary seviyesi   — yalnız görünürlük, tavansız
//   · Lonca kurma/yükseltme — perk XP, gold basmıyor
//   · Kozmetik / sezon geçişi
//
// ⚠️ SAF VERİ — sunucu da bu dosyayı okuyor.

/** 1 SOL kaç lamport */
export const LAMPORTS_PER_SOL = 1_000_000_000;

export const SOL_RATE = {
  /**
   * REFERANS KUR: 1 SOL kaç gold eder.
   *
   * ⚠️ NASIL SEÇİLDİ (tahmin değil, ölçümden): oyuncu tekrar koşusunda
   * ~6.124 gold/saat üretiyor (`balance.probe`). 300.000 gold ≈ 49 saatlik
   * oyun demek. Ürünlerin düştüğü bant da kontrol edildi:
   *   10'lu çekiliş (4.500 G) → ~0,02 SOL   · dürtüsel alım bandı
   *   lonca kurma  (25.000 G) → ~0,11 SOL   · ciddi ama erişilebilir
   *   Ossuary L50 (158.800 G) → ~0,71 SOL   · geç oyun, isteğe bağlı
   *
   * ⚠️ SOL FİYATI OYNAK. Bu sabit bir kez yazılıp unutulacak bir şey değil;
   * SOL ciddi hareket ettiğinde gözden geçirilmeli. Tek yerde durmasının
   * sebebi tam olarak bu — güncellemesi tek satır.
   */
  goldPerSol: 300_000,
  /**
   * SOL rayının gold rayına göre pahalılık katsayısı.
   *
   * ⚠️ 1,0 OLAMAZ. Eşit fiyat, "gold toplamanın bir anlamı yok" demenin
   * en kısa yolu olurdu; oyunun bütün sink tasarımı gold'un kıt olmasına
   * dayanıyor. %35 fark, beklemek istemeyene açık bir kapı bırakırken
   * gold'u hâlâ ucuz yol olarak koruyor.
   */
  markup: 1.35,
  /**
   * En küçük SOL alımı (lamport).
   *
   * ⚠️ NİYE VAR: tek bir 450 gold'luk çekiliş ~0,002 SOL eder — ağ ücreti
   * yanında anlamsız kalan, cüzdanda "0.002" diye görünen bir tutar.
   * Bu eşiğin altındaki ürünler DEMET hâlinde satılmalı (10'lu çekiliş
   * gibi); eşik, o kuralı unutmayı engelliyor.
   */
  minLamports: 5_000_000,
  /** Fiyatlar bu adıma yuvarlanır — 0,0001 SOL. Ekranda okunur sayı çıksın. */
  stepLamports: 100_000,
} as const;

/**
 * Gold fiyatının SOL karşılığı (lamport).
 *
 * ⚠️ YUKARI yuvarlanır. Aşağı yuvarlamak, hazineye ürünün altında bir
 * ödeme geçirmenin kapısıdır ve tam sayı bölmesinde sessizce olur.
 */
export function goldToLamports(gold: number): number {
  const g = Math.max(0, Math.floor(Number(gold) || 0));
  if (g <= 0) return 0;
  const ham = (g * SOL_RATE.markup * LAMPORTS_PER_SOL) / SOL_RATE.goldPerSol;
  const adim = SOL_RATE.stepLamports;
  return Math.ceil(ham / adim) * adim;
}

/** Bu ürün SOL rayında satılabilir mi (eşiğin üstünde mi) */
export function solSellable(gold: number): boolean {
  return goldToLamports(gold) >= SOL_RATE.minLamports;
}

/**
 * Ödenecek tutar — eşiğin altındaysa `null`.
 *
 * ⚠️ Eşiğin altını EŞİĞE YUVARLAMIYORUZ: oyuncuya 450 gold'luk bir şey için
 * 0,005 SOL (≈ 1.500 gold) istemek, kurun kendisini yalanlar. O ürün ya
 * demet hâlinde satılır ya hiç satılmaz.
 */
export function solCost(gold: number): number | null {
  const l = goldToLamports(gold);
  return l >= SOL_RATE.minLamports ? l : null;
}

/** Ekranda gösterilecek SOL metni — 4 hane, gereksiz sıfır yok */
export function solLabel(lamports: number): string {
  const sol = Math.max(0, lamports) / LAMPORTS_PER_SOL;
  return `${sol.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} SOL`;
}

/** Kurun kendisi — arayüz bunu AÇIKÇA yazıyor */
export function rateLabel(): string {
  return `1 SOL = ${SOL_RATE.goldPerSol.toLocaleString('en-US')} gold`;
}
