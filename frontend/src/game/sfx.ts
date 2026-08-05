'use client';
// Prosedürel ses — Web Audio ile sentezlenir, DOSYA YOK.
// Neden: sıfır asset, sıfır lisans riski, sıfır indirme boyutu ve retro estetiğe
// birebir uyuyor. Bir sürü oyununda 400 düşman ölürken dosya çalmak zaten çökerdi.
//
// KRİTİK: kısma (throttle) olmadan bu modül oyunu kilitler. Saniyede 200 ölüm
// = 200 oscillator = ses çamuru + CPU patlaması. Her sesin kendi minimum aralığı var.

type Voice = 'hit' | 'kill' | 'gem' | 'levelup' | 'evolve' | 'boss' | 'hurt' | 'chest'
  | 'coin' | 'depth' | 'eshot' | 'charge' | 'chain' | 'crit'
  // ── ARAYÜZ ──
  // ⚠️ Bunlar SAVAŞ SESLERİNDEN AYRI TUTULMALI: köyde gezerken duyulan bir
  // ses, dövüşte duyulan bir sesle aynı olursa oyuncu ikisini karıştırır ve
  // ikisi de anlamını kaybeder. Hepsi kuru, kısa ve ALÇAK sesli.
  | 'click' | 'open' | 'close' | 'deny' | 'equip' | 'buy';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let unlocked = false;

/** Her sesin en son çalındığı an (ms) — kısma için */
const lastPlayed: Record<string, number> = {};
/** Aynı sesin iki çalınışı arasındaki minimum süre (ms) */
const THROTTLE: Record<Voice, number> = {
  hit: 45, kill: 55, gem: 70, levelup: 0, evolve: 0, boss: 0, hurt: 180, chest: 0,
  // Kritik normal vuruştan seyrek ama sürüde yine sıklaşır — biraz daha kıs.
  crit: 60,
  // Nadir gold düşüşü zaten seyrek ama derinlikte sıklaşıyor — yine de kıs.
  coin: 90,
  depth: 0,
  // Sahnede 40 okçu olabilir; kısmasız her atış duyulursa ses çamuru olur.
  eshot: 110,
  charge: 140,
  chain: 90,
  // ⚠️ Arayüz seslerinde kısma ŞART ama SIFIR OLAMAZ: hızlı tıklayan oyuncu
  // (ya da yanlışlıkla çift tıklama) aynı sesi üst üste bindirirse çamur olur.
  // 40 ms bir insanın ayırt edemeyeceği kadar kısa, ama bindirmeyi keser.
  click: 40, open: 60, close: 60, deny: 120, equip: 60, buy: 60,
};

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    // ⚠️ Ses bağlamı ilk kullanıcı hareketinde kuruluyor; oyuncunun kayıtlı
    // seviyesi o ana kadar `volume` değişkeninde bekliyor. Burada uygulamak
    // şart, yoksa ayar "bir sonraki açılışta" etkili olurdu.
    master.gain.value = BASE_GAIN * volume;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** Tarayıcı otomatik oynatmayı engeller — ilk kullanıcı hareketinde çağrılmalı */
export function unlockAudio() {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
}

/**
 * Ses kilidini açan dinleyicileri kur — ÇALIŞANA KADAR bırakmadan.
 *
 * ⚠️ `{ once: true }` KULLANMA. İlk sürüm öyleydi ve ÖLÇÜLDÜ: eğer o ilk
 * olay bağlamı gerçekten çalıştıramazsa (tarayıcı henüz sayfayı "etkin"
 * saymamışsa, ya da `resume()` reddedilirse) dinleyici çoktan silinmiş
 * oluyor ve ses O SEKMEDE BİR DAHA HİÇ AÇILMIYOR. Sessiz, kalıcı ölüm.
 *
 * Doğrusu: bağlam GERÇEKTEN `running` olana kadar dinlemeye devam et.
 * Bu ayrıca sekme arka plana atılıp bağlam askıya alınırsa da kurtarıyor.
 *
 * ⚠️ Tek bir yerde durmalı: aynı kurulum hem hub'da hem koşuda gerekiyor ve
 * iki kopya er ya da geç ayrışırdı.
 */
export function installAudioUnlock(): () => void {
  if (typeof window === 'undefined') return () => {};
  const dene = () => {
    unlockAudio();
    if (ctx && ctx.state === 'running') kaldir();
  };
  const kaldir = () => {
    window.removeEventListener('pointerdown', dene);
    window.removeEventListener('keydown', dene);
    window.removeEventListener('touchstart', dene);
  };
  window.addEventListener('pointerdown', dene);
  window.addEventListener('keydown', dene);
  window.addEventListener('touchstart', dene);
  return kaldir;
}

export function setSoundEnabled(on: boolean) { enabled = on; }
export function isSoundEnabled() { return enabled; }

/**
 * Ana ses seviyesi (0..1).
 *
 * ⚠️ `master.gain` DOĞRUDAN 0..1 YAZILMAZ. Zincirdeki tabanın 0.32 olması
 * bir kalibrasyon: seslerin kendi `vol` değerleri ona göre ayarlandı. Ham
 * 1.0 yazmak her efekti üç kat yükseltip kırpma (clipping) üretirdi.
 * Oyuncunun seçtiği oran o tabanı ÇARPAR.
 */
const BASE_GAIN = 0.32;
let volume = 1;

export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, Number(v) || 0));
  if (master) master.gain.value = BASE_GAIN * volume;
}
export function getVolume() { return volume; }

/** Tek osilatör notası */
function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
  const c = ctx!;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  // hızlı atak + üstel sönüm: "tık" değil "vuruş" hissi
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master!);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Gürültü patlaması (ölüm/darbe için) */
function noise(dur: number, vol: number, filterHz: number, delay = 0) {
  const c = ctx!;
  const t0 = c.currentTime + delay;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  // deterministik gürültü — Math.random KULLANMA kuralı sese de uygulanıyor
  let s = 22222;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    data[i] = (s / 4294967296) * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.value = filterHz;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(master!);
  src.start(t0);
}

export function play(v: Voice) {
  if (!enabled || !unlocked) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;

  const now = performance.now();
  const gap = THROTTLE[v];
  if (gap > 0 && now - (lastPlayed[v] ?? -1e9) < gap) return;
  lastPlayed[v] = now;

  switch (v) {
    case 'hit':   tone(760, 0.05, 'square', 0.08, 520); break;
    // Kritik: normalden PARLAK ve kısa — kulak 'bu farklıydı' demeli
    case 'crit':  tone(1240, 0.07, 'square', 0.11, 820); tone(1860, 0.05, 'sine', 0.06, undefined, 0.02); break;
    case 'kill':  noise(0.11, 0.16, 1500); tone(180, 0.09, 'triangle', 0.09, 90); break;
    case 'gem':   tone(1180, 0.055, 'sine', 0.07, 1560); break;
    case 'hurt':  tone(150, 0.2, 'sawtooth', 0.2, 60); noise(0.14, 0.14, 700); break;
    case 'chest': [880, 1180, 1560].forEach((f, i) => tone(f, 0.12, 'sine', 0.11, undefined, i * 0.05)); break;
    case 'levelup': [520, 660, 780, 1040].forEach((f, i) => tone(f, 0.14, 'square', 0.10, undefined, i * 0.055)); break;
    case 'boss':  tone(70, 0.9, 'sawtooth', 0.24, 42); noise(0.7, 0.14, 320); break;
    case 'coin':  tone(1320, 0.07, 'sine', 0.09, 1980); tone(1980, 0.06, 'sine', 0.05, undefined, 0.05); break;
    // Derinlik geçişi: aşağı inen iki nota — "daha derine" duygusu
    case 'depth': [330, 262, 196].forEach((f, i) => tone(f, 0.34, 'triangle', 0.13, undefined, i * 0.11)); break;
    // Düşman atışı KURU ve ALÇAK; oyuncunun 'hit' sesiyle karışmasın
    case 'eshot': tone(300, 0.07, 'square', 0.055, 200); break;
    // Hücum telegrafı: yükselen uğultu — duyunca kaçmalısın
    case 'charge': tone(120, 0.3, 'sawtooth', 0.12, 340); break;
    // Zincir: kısa çıtırtı + yükselen cızırtı — elektrik hissi
    case 'chain': noise(0.06, 0.09, 6000); tone(880, 0.09, 'square', 0.05, 1760); break;
    // ── ARAYÜZ SESLERİ ──
    // Tıklama: tek, kuru, çok kısa. Uzun olursa arayüz ağırlaşır.
    case 'click': tone(1100, 0.028, 'square', 0.045, 2200); break;
    // Panel açılışı: yukarı çıkan iki nota — "bir şey açıldı"
    case 'open':  [520, 700].forEach((f, i) => tone(f, 0.07, 'sine', 0.055, undefined, i * 0.035)); break;
    // Kapanış: aynı iki nota TERS — açılışın aynadaki hâli
    case 'close': [700, 520].forEach((f, i) => tone(f, 0.06, 'sine', 0.045, undefined, i * 0.03)); break;
    // Reddedildi: alçak, kısa, hoş OLMAYAN. Oyuncu "olmadı"yı duymalı.
    case 'deny':  tone(180, 0.11, 'square', 0.075, 150); break;
    // Takma: yumuşak bir tık + üst nota — "yerine oturdu"
    case 'equip': tone(660, 0.05, 'triangle', 0.05); tone(990, 0.06, 'sine', 0.04, undefined, 0.04); break;
    // Satın alma: `chest`in KISA hâli. Aynı aileden ama daha az kutlama —
    // Forge'da 20 kez üst üste alım yapılıyor, her seferinde şenlik olmaz.
    case 'buy':   [880, 1320].forEach((f, i) => tone(f, 0.09, 'sine', 0.085, undefined, i * 0.045)); break;
    case 'evolve':
      // yükselen akor + parlama: run'ın en büyük anı, ses de öyle olmalı
      [392, 494, 587, 784, 988].forEach((f, i) => tone(f, 0.6, 'triangle', 0.13, undefined, i * 0.07));
      tone(1568, 1.0, 'sine', 0.09, 3136, 0.34);
      noise(0.5, 0.1, 4000, 0.3);
      break;
  }
}
