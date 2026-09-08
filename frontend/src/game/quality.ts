// GRAFİK KADEMESİ — tek kaynak.
//
// 🔴 NİYE VAR (kullanıcı): *"Çok ileriki bölümlerde düşman fazlalaştıkça ve
// skill kartları çoğaldıkça FPS fena düşüyor, kasma donma ortaya çıkıyor.
// Telefonda nasıl oynanır?"*
//
// Bugün oyunda bir `lowGraphics` anahtarı var ve yalnız üç yere ulaşıyor:
// `fx.ts` (leş/kıvılcım), `stageGround.ts` (dekor + sis), `ui/motion.tsx`
// (arayüz animasyonu). **Çözünürlüğe, meşaleye, vinyete ve ölüm efektlerine
// hiç dokunmuyor.** Tek tek yama atmak yerine tek bir profil modeli: aksi
// hâlde her yeni efekt "acaba düşük grafikte kapanmalı mı" sorusunu
// yeniden doğurur ve cevap her seferinde başka bir dosyada verilir.
//
// ══════════════════════════════════════════════════════════════════════
// 🔴 KADEME SİMÜLASYONA DOKUNAMAZ — VE ÇÖZÜNÜRLÜK DE DOKUNMUYOR.
//
// `settings.ts` başlığı şunu mühürlüyor: "aynı seed, farklı ayarlar →
// BİREBİR aynı koşu." Buradaki en tehlikeli görünen kol `pixelCap`, çünkü
// görüş alanı bir zamanlar SİMÜLASYONU etkiliyordu (doğum halkasının
// yarıçapı ondan geliyordu).
//
// AMA ARTIK ETKİLEMİYOR: `GameCanvas.tsx` her koşuda
// `game.lockViewport(RUN_VIEW.w, RUN_VIEW.h)` çağırıyor — doğum halkası
// 1280×720'de çakılı ve `resize()` içindeki `setViewport` belgelenmiş bir
// no-op. Ayrıca `render(ctx, game, cssW, cssH, dpr, …)` **CSS ölçülerini**
// alıyor: görünür dünya dikdörtgeni her kademede birebir aynı, yalnız
// piksel yoğunluğu değişiyor.
//
// Yani kademe ne oyuncunun ne gördüğünü ne de dünyanın ne yaptığını
// değiştiriyor — yalnız o görüntünün kaç pikselle boyandığını.
// ══════════════════════════════════════════════════════════════════════
//
// 🔴 DETAY AZALIR, VARLIK ASLA. Hiçbir kademe şunları kısamaz: düşmanların
// varlığı ve yarıçapı · düşman mermileri (her zaman kan kırmızısı) · boss
// telegrafı · boss can çubuğu · öldüren ve kritik vuruş kıvılcımı. Aksi
// hâlde en düşük kademe ya haksız avantaj ya haksız ölüm olurdu.
//
// 🔴 KADEME ÇİZMEYİ ATLAYABİLİR, BOŞALTMAYI ASLA. `render()` motorun
// kuyruklarını (`g.arcs`, `g.deaths`, `g.hits`, `g.hurts`, `g.petBlasts`…)
// boşaltan TEK yer. Bir kademe kapısı bir çizim fonksiyonunu erken `return`
// ile kapatırsa o dizi koşu boyunca sınırsız büyür. Kapılar fonksiyonun
// İÇİNE, boşaltmadan SONRA konur. Buradaki tek ölümcül hata sınıfı bu.
//
// ⚠️ BU DOSYA DOM'SUZ VE BAĞIMSIZ: `render`/`fx`/`engine`/`stageGround`
// hiçbirinden import etmiyor. Sebep somut — `fx → stageGround → fx` zaten
// bir döngü; kademe modeli o düğümün içine girmemeli. Ayrıca `hudLayout.ts`
// gibi Node'da mühürlenebilir kalıyor.

/** Kademe kimlikleri — EN UCUZDAN EN PAHALIYA sıralı. Sıra anlamlı: mühür
 *  iş hacminin bu sırada azalmadığını doğruluyor. */
export const TIER_IDS = ['ultraLow', 'low', 'normal', 'hd', 'ultra'] as const;

export type QualityTier = (typeof TIER_IDS)[number];

export interface QualityProfile {
  readonly tier: QualityTier;
  /** oyuncuya görünen ad (İngilizce) */
  readonly label: string;
  /** tek satırlık dürüst açıklama — vaat etmediğimiz şeyi yazmıyoruz */
  readonly note: string;

  // ── ÇÖZÜNÜRLÜK ──
  // arka tampon = cssPx × min(devicePixelRatio, pixelCap) × renderScale
  readonly pixelCap: number;
  /** 1'in ALTI yalnız ultraLow'da — altına inmek tuvali bulanıklaştırır */
  readonly renderScale: number;

  // ── KATMANLAR ──
  /** oyuncunun meşale halesi (860² `lighter` blit ≈ 0,8 ekran alanı) */
  readonly torch: boolean;
  /** sis yoğunluğu: 0 kapalı · 1 bugünkü · >1 daha yoğun */
  readonly fog: number;
  /** ekran vinyeti alfa çarpanı — ASLA 0 (sahne çerçevesiz kalmasın) */
  readonly vignette: number;
  /** zemin dekor yoğunluğu çarpanı */
  readonly decor: number;
  /** kozmetik aura (oyuncunun satın aldığı süs) */
  readonly cosmeticAura: boolean;

  // ── BÜTÇELER ── havuz BOYU değil, AKTİF tavan
  readonly corpses: number;
  readonly sparks: number;
  readonly deathFx: number;

  /** arayüz animasyonu — `motionOff()` bunu okuyacak */
  readonly uiMotion: boolean;
}

/**
 * KADEME TABLOSU.
 *
 * 🔴 `normal` = BUGÜNKÜ OYUN, BİT BİT. Ayarlara hiç girmeyen kimsenin
 * oyunu değişmesin diye: `pixelCap 2` bugünkü `Math.min(dpr, 2)`,
 * `corpses 128 / sparks 96` bugünkü `fx.CAP`, `deathFx 90` bugünkü
 * `render.MAX_FX`, `decor 1` bugünkü tam yoğunluk, `fog 1` bugünkü sis.
 *
 * ⚠️ HD ve ULTRA yukarı yönde YALNIZ çözünürlük ve biraz atmosfer satıyor.
 * Bu az görünüyor ve dürüst olan bu: oyunda "yüksek kademede açılacak"
 * bekleyen bir varlık takımı YOK. Seçici de bunu yazacak — olmayan bir şey
 * vaat eden bir ayar, ayarların tamamına olan güveni yer.
 *
 * ⚠️ `pixelCap` EN BÜYÜK KOL ve çağrı sayan alet onu GÖREMİYOR. DPR 3'lük
 * bir telefonda `ultraLow` (cap 1 × ölçek 0,65) `normal`e (cap 2) göre
 * **~9,5 kat az piksel** boyuyor. Ölçüm için `graphics.probe.mts`in
 * `fillArea` eksenine bakılmalı, `path` sayısına değil.
 */
const TABLO: Record<QualityTier, QualityProfile> = {
  ultraLow: {
    tier: 'ultraLow', label: 'ULTRA LOW',
    note: 'Lowest resolution. The game will look blocky.',
    pixelCap: 1, renderScale: 0.65,
    torch: false, fog: 0, vignette: 0.6, decor: 0.35, cosmeticAura: false,
    corpses: 0, sparks: 24, deathFx: 24,
    uiMotion: false,
  },
  low: {
    tier: 'low', label: 'LOW',
    note: 'No fog or torchlight. Built for phones.',
    pixelCap: 1, renderScale: 1,
    torch: false, fog: 0, vignette: 1, decor: 0.5, cosmeticAura: true,
    corpses: 32, sparks: 48, deathFx: 48,
    uiMotion: false,
  },
  normal: {
    tier: 'normal', label: 'NORMAL',
    note: 'The game as it is meant to look.',
    pixelCap: 2, renderScale: 1,
    torch: true, fog: 1, vignette: 1, decor: 1, cosmeticAura: true,
    corpses: 128, sparks: 96, deathFx: 90,
    uiMotion: true,
  },
  hd: {
    tier: 'hd', label: 'HD',
    note: 'Sharper on high-density screens. Nothing else changes.',
    pixelCap: 3, renderScale: 1,
    torch: true, fog: 1, vignette: 1, decor: 1, cosmeticAura: true,
    corpses: 128, sparks: 96, deathFx: 90,
    uiMotion: true,
  },
  ultra: {
    tier: 'ultra', label: 'ULTRA',
    note: 'Maximum resolution and a heavier haze. Costs the most.',
    pixelCap: 4, renderScale: 1,
    torch: true, fog: 1.35, vignette: 1, decor: 1.25, cosmeticAura: true,
    corpses: 128, sparks: 96, deathFx: 90,
    uiMotion: true,
  },
};

/** Sıralı profil listesi — seçici ve mühür bunu kullanır */
export const QUALITY_PROFILES: readonly QualityProfile[] = TIER_IDS.map((t) => TABLO[t]);

/**
 * Bilinmeyen değeri güvenli kademeye çevir.
 *
 * ⚠️ Ayar dosyası elle düzenlenebilir (localStorage) ve `settings.ts`in
 * mevcut duruşu savunmacı: bozuk değer sessizce varsayılana düşer, hata
 * fırlatmaz. Aynı duruş.
 */
export function normalizeTier(raw: unknown, yedek: QualityTier = 'normal'): QualityTier {
  return (TIER_IDS as readonly string[]).includes(raw as string)
    ? (raw as QualityTier)
    : yedek;
}

export function profileOf(tier: QualityTier): QualityProfile {
  return TABLO[tier];
}

/**
 * AKTİF PROFİL — modül seviyesinde.
 *
 * ⚠️ `fx.ts`teki `applyFxSettings` deseninin birebir aynısı, ve bu bilinçli:
 * profili 20'den fazla çizim imzasına parametre olarak geçirmek, ilk
 * unutulan yerde sessizce eski davranışı bırakırdı — bu depodaki en pahalı
 * hata sınıfı ("kod çalışıyor, son adımda ölüyor").
 *
 * ⚠️ Varsayılan `normal` = bugünkü oyun. Bir modül `applyQuality`
 * çağrılmadan çizerse (SSR, test, mühür) bugünkü görüntüyü alır.
 */
let aktif: QualityProfile = TABLO.normal;

/** Kademe değiştiğinde haberdar olması gerekenler (leş havuzunu kırpmak gibi) */
type Dinleyici = (p: QualityProfile) => void;
const dinleyiciler = new Set<Dinleyici>();

export function quality(): QualityProfile {
  return aktif;
}

export function applyQuality(tier: QualityTier): QualityProfile {
  aktif = TABLO[normalizeTier(tier)];
  // ⚠️ Dinleyici hatası kademe değişimini yarıda bırakmasın: biri patlarsa
  // diğerleri yine haber alır. Sessiz `catch` DEĞİL — konsola düşüyor.
  for (const d of dinleyiciler) {
    try { d(aktif); } catch (e) { console.warn('[quality] dinleyici hatası', e); }
  }
  return aktif;
}

/** @returns aboneliği bırakan fonksiyon */
export function onQualityChange(d: Dinleyici): () => void {
  dinleyiciler.add(d);
  return () => { dinleyiciler.delete(d); };
}

/**
 * CİHAZ TAHMİNİ — yalnız İLK açılışta, bir kez.
 *
 * 🔴 Kullanıcı kararı: telefonda varsayılan LOW. *"Telefonda kasma daha
 * fazla olabilir"* — ilk izlenim akıcı olsun, güçlü telefonu olan
 * ayarlardan yükseltsin. Yükseltmek, kasmayı keşfetmekten daha iyi bir
 * keşif.
 *
 * ⚠️ ASLA `ultraLow` TAHMİN ETME. Gereksiz yere çirkin bir ilk izlenim,
 * birkaç saniyelik düşük fps'ten kötüdür; oyuncu zaten seçiciden inebilir.
 *
 * ⚠️ `deviceMemory` ve `hardwareConcurrency` iOS Safari'de YOK — bu yüzden
 * sırayla dokunmatik testine, sonra `normal`e düşüyor. Tek sinyale
 * yaslanmak iPhone'ların hepsini masaüstü saymak olurdu.
 *
 * ⚠️ DOM'a burada dokunuluyor ama SAVUNMACI: `globalThis` üzerinden ve
 * try/catch içinde, böylece dosya Node'da hâlâ import edilebiliyor.
 */
export function guessTier(): QualityTier {
  try {
    const g = globalThis as unknown as {
      navigator?: { hardwareConcurrency?: number; deviceMemory?: number; maxTouchPoints?: number };
      matchMedia?: (q: string) => { matches: boolean };
    };
    const nav = g.navigator;
    if (nav?.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 4) return 'low';
    if (nav?.deviceMemory !== undefined && nav.deviceMemory <= 4) return 'low';
    if (g.matchMedia?.('(pointer: coarse)').matches) return 'low';
    // ⚠️ `maxTouchPoints` TEK BAŞINA yeterli değil: dokunmatik ekranlı
    // dizüstüler var ve onlar `low`u hak etmiyor. Yalnız kaba işaretçiyle
    // BİRLİKTE anlamlı — o da yukarıda zaten sorulmuş durumda.
  } catch { /* ölçemedik — güvenli tarafa düş */ }
  return 'normal';
}
