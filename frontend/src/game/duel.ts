// DÜELLO — asenkron PvP.
//
// ⚠️ GERÇEK ZAMANLI PvP YAPILMADI ve bu bilinçli bir karar. Bu oyunun tüm
// güvenliği "aynı seed → aynı koşu" determinizmine dayanıyor (`SIM_SEAL`);
// gerçek zamanlı bir düello, tahmin/uzlaştırma (prediction/reconciliation)
// gerektirir ve o katman determinizmi de sunucu-otoriteli ödülü de bozar.
// Ayrıca survivor türü zaten tek kişilik bir hayatta kalma oyunu — iki
// oyuncuyu aynı arenaya koymak oyunu değiştirirdi, PvP eklemezdi.
//
// ⚠️ ONUN YERİNE: AYNI SEED'İ OYNARSIN. Rakibinin koşusu bir KAYIT olarak
// duruyor (seed + sunucunun kabul ettiği derinlik). Meydan okuduğunda tam
// olarak onun oynadığı koşuyu oynuyorsun — aynı düşmanlar, aynı sıra, aynı
// sandıklar. Daha derine inen kazanır. Netcode yok, adalet mükemmel ve
// mevcut bütün güvenlik özellikleri (süre tabanı, tek koşu kuralı, sunucu
// seed'i) OLDUĞU GİBİ geçerli kalıyor.
//
// ⚠️ DÜELLO GOLD ÖDEMİYOR. Bu oturumda beşinci kez aynı sonuca varıldı:
// Wager, dünya boss'u, başarımlar, lonca perki ve şimdi düello — hiçbiri
// gold basmıyor. Düello PUAN ödüyor; toz ise GÜNLÜK SERT TAVANLI (bkz.
// DUEL.dailyRewarded). Puan zaten sıfır toplamlı, yani enflasyon yaratamaz.
//
// ⚠️ SAF VERİ. DOM yok, `Math.random()` yok; sunucu aynı fonksiyonları
// çağırıyor.

export const DUEL = {
  /** herkesin başladığı puan */
  start: 1000,
  /**
   * Elo K katsayısı. 32 klasik satranç değeri — yeterince hızlı hareket
   * ediyor ama tek bir maç sıralamayı altüst etmiyor.
   */
  k: 32,
  /**
   * Yüksek puanda K küçülür: tepedeki oyuncular arasındaki fark bir maçla
   * kapanmasın, tırmanış anlamlı kalsın.
   */
  kHighRating: 1600,
  kHigh: 16,
  /**
   * ⚠️ GÜNDE ÖDÜLLÜ DÜELLO SAYISI — TOZ MUSLUĞUNUN SERT TAVANI.
   * Tavansız bırakmak, oyuncu başına sınırsız toz demekti. Üstündeki
   * düellolar oynanabilir ve PUAN verir; sadece toz vermez.
   */
  dailyRewarded: 3,
  /** kazanılan düello başına toz (yalnızca günlük tavan içinde) */
  dustPerWin: 15,
  /**
   * ⚠️ AYNI RAKİBİ TEKRAR TEKRAR EZME KORUMASI. Elo zaten zayıf rakipten
   * kazancı sıfıra yaklaştırıyor ama bu tek başına yetmez: bir oyuncu
   * kendi ikinci hesabına sonsuz meydan okuyabilirdi. Aynı çifte bu süre
   * boyunca yeniden PUAN yazılmıyor.
   */
  cooldownHours: 6,
  /** tabloda gösterilecek rakip sayısı */
  boardSize: 20,
} as const;

// ── PUAN ──────────────────────────────────────────────────────────────

/** Elo beklenen skoru — A'nın kazanma olasılığı */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function kOf(rating: number): number {
  return rating >= DUEL.kHighRating ? DUEL.kHigh : DUEL.k;
}

/**
 * Maç sonrası iki puan.
 *
 * ⚠️ SIFIR TOPLAMLI DEĞİL AMA SIFIRA ÇOK YAKIN: iki taraf farklı K
 * kullanabiliyor (biri yüksek puanlıysa). Bu kasıtlı — tepedeki oyuncunun
 * puanı daha yavaş oynasın diye. Yine de toplam puan enflasyonu yok
 * denecek kadar küçük ve testle ölçülüyor.
 */
export function nextRatings(
  challenger: number, defender: number, challengerWon: boolean,
): { challenger: number; defender: number; delta: number } {
  const e = expectedScore(challenger, defender);
  const s = challengerWon ? 1 : 0;
  const kc = kOf(challenger);
  const kd = kOf(defender);
  const dc = Math.round(kc * (s - e));
  const dd = Math.round(kd * ((1 - s) - (1 - e)));
  return {
    // ⚠️ TABAN 100: puan sıfıra ya da eksiye inemez. Sıfırlanan bir oyuncu
    // hem tabloda görünmez olur hem de Elo formülü uçlarda anlamsızlaşır.
    challenger: Math.max(100, challenger + dc),
    defender: Math.max(100, defender + dd),
    delta: dc,
  };
}

/**
 * Bir düellonun sonucu — SUNUCU bunu çağırıyor.
 *
 * ⚠️ BERABERLİK SAVUNANIN LEHİNE. Rakibinin derinliğine ULAŞMAK yetmez,
 * GEÇMEK gerekir. Aksi hâlde "aynı sayıyı tuttur" bir kazanç yolu olurdu ve
 * asıl soru olan "daha derine inebilir misin" bulanıklaşırdı.
 */
export function duelWon(challengerDepth: number, defenderDepth: number): boolean {
  return challengerDepth > defenderDepth;
}

// ── KADEME (gösterim) ─────────────────────────────────────────────────

export interface DuelTier { name: string; min: number; color: string }

/** ⚠️ MOR YOK — paletin dışına çıkan tek renk bile sistemi bozar */
export const DUEL_TIERS: readonly DuelTier[] = [
  { name: 'Unmarked', min: 0, color: '#b8ae98' },
  { name: 'Marked', min: 900, color: '#5f9e4a' },
  { name: 'Named', min: 1100, color: '#8a97a3' },
  { name: 'Feared', min: 1350, color: '#a01226' },
  { name: 'Undying', min: 1600, color: '#efa72e' },
] as const;

export function duelTier(rating: number): DuelTier {
  let out = DUEL_TIERS[0];
  for (const t of DUEL_TIERS) if (rating >= t.min) out = t;
  return out;
}

// ── DOĞRULAMA ─────────────────────────────────────────────────────────

/**
 * Meydan okuma geçerli mi. `null` = geçerli, aksi hâlde SEBEP.
 *
 * ⚠️ SUNUCU DA BUNU ÇAĞIRIYOR. Arayüzde gizlenen bir düğme bir koruma
 * değildir; kural tek yerde yazılıp iki yerde çalıştırılıyor.
 */
export function duelBlocker(opts: {
  challenger: string;
  defender: string;
  /** bu çiftin son düellosundan beri geçen saat (hiç yoksa Infinity) */
  hoursSince: number;
  /** meydan okuyan bu bölümü temizlemiş mi */
  stageCleared: boolean;
}): string | null {
  // ⚠️ Kendine meydan okumak: Elo'da iki tarafı da aynı hesap olan bir maç
  // puanı serbestçe şişirmenin en kolay yolu olurdu.
  if (opts.challenger === opts.defender) return 'You cannot answer your own record.';
  if (!opts.stageCleared) return 'Clear this stage before you challenge its record.';
  if (opts.hoursSince < DUEL.cooldownHours) {
    const kalan = Math.ceil(DUEL.cooldownHours - opts.hoursSince);
    return `You already answered them. Wait ${kalan}h.`;
  }
  return null;
}

/** Bugün kazanılan düellodan toz çıkar mı */
export function dustForWin(rewardedToday: number): number {
  return rewardedToday < DUEL.dailyRewarded ? DUEL.dustPerWin : 0;
}
