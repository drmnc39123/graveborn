// OYUNCU AYARLARI — ses, görüntü, erişilebilirlik.
//
// ⚠️ HİÇBİRİ DENGEYİ ETKİLEMEZ. Bu dosyadaki her ayar ya sunum ya konfor;
// motora giren tek bir sayı yok. Bunun kanıtı testte: aynı seed, farklı
// ayarlar → BİREBİR aynı koşu. Ayar bir stat değiştirseydi "en iyi ayar"
// diye bir şey doğar ve oyuncu görsel tercihini bırakıp onu seçerdi.
//
// ⚠️ `progress.ts`'in İÇİNE KOYULMADI. Progress sunucu-otoriteli ve her
// koşuda ağdan gidip geliyor; oyuncunun ses seviyesi orada işi yok, ayrıca
// cihaza özel olmalı (masaüstünde açık, telefonda kısık). Ayrı anahtar,
// ayrı depo.
//
// ⚠️ DOM'suz kalmak ZORUNDA DEĞİL (motor bunu okumuyor) ama depoya erişim
// yine `globalThis` üzerinden — `progress.ts`'teki aynı gerekçe, dosya
// testlerde Node altında da çalışabilsin.

import { guessTier, normalizeTier, type QualityTier } from './quality';

const KEY = 'graveborn:settings:v1';

export interface Settings {
  /** ana ses seviyesi 0..1 (0 = sessiz) */
  volume: number;
  // ⚠️ `screenShake` KALDIRILDI (kullanıcı kararı): efektin kendisi oyundan
  // çıkarıldı, ayarı bırakmak olmayan bir şeyi kapatan anahtar olurdu.
  // Erişilebilirlik gerekçesi kaybolmadı, TERSİNE tam karşılandı — vestibüler
  // rahatsızlığı olan oyuncu için artık kapatılacak hareket YOK. Eski
  // kayıtlardaki alan `normalizeSettings` tarafından sessizce yok sayılır.
  /**
   * Hasar sayıları. Sürüde ekran dolabiliyor; kapatmak isteyene seçenek.
   */
  damageNumbers: boolean;
  /**
   * Müzik katmanı.
   *
   * ⚠️ AYRI ANAHTAR, `volume`a BAĞLI DEĞİL. Oyuncuların önemli bir kısmı
   * efektleri duymak isteyip müziği istemiyor (kendi müziğini dinliyor);
   * tek bir ses anahtarı onları "ya hepsi ya hiçbiri"ne zorlardı ve
   * pratikte sesi TAMAMEN kapattırırdı — yani boss telegrafını da
   * kaybettirirdi.
   */
  music: boolean;
  /**
   * GRAFİK KADEMESİ — tablo ve gerekçeler `quality.ts`te.
   *
   * 🔴 `lowGraphics: boolean`IN YERİNE GEÇTİ. Eski anahtar yalnız leş,
   * kıvılcım, dekor ve sise ulaşıyordu; çözünürlüğe, meşaleye, vinyete ve
   * ölüm efektlerine hiç dokunmuyordu — yani kasan oyuncunun elindeki tek
   * düğme kasmanın sebebine dokunmuyordu. Eski kayıtlar
   * `normalizeSettings` tarafından göç ettiriliyor, tercih kaybolmuyor.
   *
   * ⚠️ BU AYAR DA DENGEYİ ETKİLEMİYOR — VE ÇÖZÜNÜRLÜK DAHİL.
   * `pixelCap` tehlikeli görünüyor çünkü görüş alanı bir zamanlar
   * SİMÜLASYONU etkiliyordu (doğum halkasının yarıçapı ondan geliyordu).
   * Ama `GameCanvas.tsx` her koşuda `game.lockViewport(RUN_VIEW.w,
   * RUN_VIEW.h)` çağırıyor: halka 1280×720'de çakılı ve `resize()`
   * içindeki `setViewport` belgelenmiş bir no-op. Ayrıca `render()` CSS
   * ölçülerini alıyor — görünür dünya dikdörtgeni her kademede aynı,
   * yalnız piksel yoğunluğu değişiyor.
   *
   * Bunu buraya yazıyorum çünkü bu satırı okumadan `pixelCap`i gören biri
   * ya paniğe kapılıp ya da "düzelteyim" diye simülasyona sokabilir.
   */
  quality: QualityTier;
}

export function defaultSettings(): Settings {
  /**
   * ⚠️ KADEME CİHAZDAN TAHMİN EDİLİYOR — ama yalnız burada, yani hiç
   * kaydı olmayan oyuncuda. Kullanıcı kararı: telefonda LOW ile başla,
   * ilk izlenim akıcı olsun. Node'da `guessTier()` her zaman 'normal'
   * döner, mühürler deterministik kalır.
   */
  return { volume: 0.7, damageNumbers: true, music: true, quality: guessTier() };
}

function clamp01(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/** Eksik/bozuk kayda karşı savunmacı — ayar dosyası da elle düzenlenebilir */
export function normalizeSettings(
  raw: (Partial<Settings> & { lowGraphics?: unknown }) | null | undefined,
): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  return {
    volume: clamp01(raw.volume, d.volume),
    damageNumbers: typeof raw.damageNumbers === 'boolean' ? raw.damageNumbers : d.damageNumbers,
    music: typeof raw.music === 'boolean' ? raw.music : d.music,
    quality: kademeGocu(raw, d.quality),
  };
}

/**
 * ESKİ `lowGraphics` KAYDINI KADEMEYE ÇEVİR.
 *
 * 🔴 TERCİH KAYBOLMAMALI. `lowGraphics: true` seçmiş oyuncu bunu bir sebeple
 * seçti (muhtemelen kasıyordu); göç etmezse bir sürümde sessizce yüksek
 * kademeye atlar ve oyunu bozulur.
 *
 * ⚠️ `lowGraphics: false` → `normal`, cihaz tahmini DEĞİL. O oyuncu bu
 * cihazda zaten bugünkü görüntüyü görüyordu; telefonda bile olsa onu
 * LOW'a düşürmek, hiç istemediği bir gerilemedir. Tahmin yalnız HİÇ kaydı
 * olmayan oyuncu için.
 *
 * ⚠️ Bilinmeyen kademe adı sessizce varsayılana düşer — dosya elle
 * düzenlenebilir ve bu dosyanın duruşu savunmacı.
 */
function kademeGocu(raw: Partial<Settings> & { lowGraphics?: unknown }, yedek: QualityTier): QualityTier {
  if (raw.quality !== undefined) return normalizeTier(raw.quality, yedek);
  if (raw.lowGraphics === true) return 'low';
  if (raw.lowGraphics === false) return 'normal';
  return yedek;
}

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function store(): KeyValueStore | null {
  const g = globalThis as unknown as { localStorage?: KeyValueStore };
  return g.localStorage ?? null;
}

export function loadSettings(): Settings {
  const s = store();
  if (!s) return defaultSettings();
  try {
    const raw = s.getItem(KEY);
    return normalizeSettings(raw ? (JSON.parse(raw) as Partial<Settings>) : null);
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(v: Settings) {
  const s = store();
  if (!s) return;
  try { s.setItem(KEY, JSON.stringify(v)); } catch { /* kota dolu — sessiz geç */ }
}
