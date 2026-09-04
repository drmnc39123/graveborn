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
   * Düşük grafik: leş, kıvılcım ve atmosfer katmanı azalır.
   * Zayıf cihazda kare hızı için — denge etkisi YOK.
   */
  lowGraphics: boolean;
}

export function defaultSettings(): Settings {
  return { volume: 0.7, damageNumbers: true, music: true, lowGraphics: false };
}

function clamp01(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/** Eksik/bozuk kayda karşı savunmacı — ayar dosyası da elle düzenlenebilir */
export function normalizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  return {
    volume: clamp01(raw.volume, d.volume),
    damageNumbers: typeof raw.damageNumbers === 'boolean' ? raw.damageNumbers : d.damageNumbers,
    music: typeof raw.music === 'boolean' ? raw.music : d.music,
    lowGraphics: typeof raw.lowGraphics === 'boolean' ? raw.lowGraphics : d.lowGraphics,
  };
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
