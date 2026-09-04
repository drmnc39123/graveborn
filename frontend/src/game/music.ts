'use client';
// MÜZİK — prosedürel, DOSYASIZ. `sfx.ts` ile aynı felsefe: sıfır varlık,
// sıfır lisans riski, sıfır indirme boyutu.
//
// ⚠️ NİYE AYRI DOSYA: `sfx` olaylara tepki veren KISA sesler çalıyor ve her
// sesin kendi kısması var. Müzik bunun tersi — sürekli, zamanlanmış ve
// oyunun durumuna göre KATMAN AÇIP KAPATIYOR. İkisini tek modüle koymak,
// "her ölümde bir osilatör" mantığıyla "her vuruşta 1/8'lik ızgara"
// mantığını aynı yerde tutmak olurdu.
//
// ⚠️ SES BAĞLAMI PAYLAŞILIYOR (`sesBaglami()`), yeni bir tane AÇILMIYOR.
// Otomatik oynatma kilidi bağlam başına çözülüyor; ikinci bir bağlam
// `suspended` takılır ve HİÇ DUYULMAZ, üstelik hata da vermez.
//
// ⚠️ ZAMANLAYICI `setTimeout`, `requestAnimationFrame` DEĞİL — ve ileriye
// bakış BİLEREK UZUN (1,2 sn). Gizli sekmede rAF tamamen duruyor,
// `setTimeout` ise saniyede bire kadar KISILIYOR. Kısa ileriye bakışla
// (tipik 100 ms) sekme arkaya atıldığı anda müzik delik deşik olurdu:
// zamanlayıcı 1 sn'de bir uyanır, kuyrukta 100 ms'lik nota vardır, arası
// sessiz kalır. Kuyruğu 1,2 sn dolu tutmak bunu kapatıyor.
//
// ⚠️ NOTA SAYISI KASITLI OLARAK AZ. Sürüde 420 düşman varken müziğin CPU
// yemesi, tam da müziğin en yoğun olması gereken anda kare düşürürdü.
// Saniyede ~6-10 nota, nota başına 2-3 düğüm.

import { getVolume, isSoundEnabled, sesAyariDinle, sesBaglami } from './sfx';

export type Sahne = 'village' | 'combat' | 'boss';

/** Ana müzik seviyesi çarpanı — efektlerin ALTINDA kalmalı */
const TABAN = 0.16;

const BPM: Record<Sahne, number> = { village: 66, combat: 92, boss: 104 };

/**
 * Akor dizileri — kök notalar MIDI numarası olarak.
 *
 * Hepsi RE MİNÖR. Tek tonda kalmak bilinçli: sahne değişiminde ton da
 * değişseydi köyden koşuya geçiş bir "şarkı değişimi" gibi duyulurdu;
 * amaç aynı dünyanın yoğunlaşması.
 *
 * ⚠️ `boss` dizisi Frigyen ikinciyi (Mi bemol) kullanıyor — minörün
 * içindeki tek "yanlış" nota. Boss'u hızlandırarak değil, ARMONİYİ
 * bozarak ayırmak, tempo yarışına girmeden tedirginlik üretiyor.
 */
const DIZI: Record<Sahne, readonly number[]> = {
  village: [38, 38, 34, 41],        // Dm · Dm · Bb · F
  combat: [38, 34, 41, 36],         // i · VI · III · VII
  boss: [38, 39, 38, 34],           // Dm · Eb(Frigyen) · Dm · Bb
};

/** Akor tonları (kökten yarım ton farkı) — minör üçlü + yedili renk */
const AKOR = [0, 3, 7, 10];

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Kanal {
  bus: GainNode;
  gecikme: DelayNode;
  gecikmeGeri: GainNode;
  filtre: BiquadFilterNode;
}

let kanal: Kanal | null = null;
let calisiyor = false;
let sahne: Sahne = 'village';
/** 0..1 — sahnedeki baskı. Katman açar, tempoyu DEĞİŞTİRMEZ. */
let yogunluk = 0;
let duraklatildi = false;
/** Oyuncu ayarı — efekt sesinden AYRI (bkz. settings.ts `music`) */
let acik = true;
let zamanlayici: ReturnType<typeof setTimeout> | null = null;
/** Bir sonraki zamanlanacak 1/8'lik adımın bağlam zamanı */
let siradakiZaman = 0;
let adim = 0;
let bar = 0;
/** Gürültü tamponu — perküsyon için bir kez üretilir */
let gurultu: AudioBuffer | null = null;

const ILERI_BAK = 1.2;      // sn — gizli sekme kısmasına karşı
const TIK_MS = 200;

function kur(ctx: AudioContext): Kanal {
  if (kanal) return kanal;
  const bus = ctx.createGain();
  bus.gain.value = 0;

  // ⚠️ FİLTRE HER ZAMAN ZİNCİRDE. Yoğunluk arttıkça açılıyor: sessiz anlarda
  // müzik uzakta, kalabalıkta yakında duyuluyor. Ses seviyesini oynatmak
  // aynı işi yapmazdı — kısık bir tını hâlâ "yakın" duyulur, kapalı bir
  // filtre gerçekten "öbür odadan" duyulur.
  const filtre = ctx.createBiquadFilter();
  filtre.type = 'lowpass';
  filtre.frequency.value = 900;
  filtre.Q.value = 0.7;

  // ⚠️ REVERB YERİNE GERİ BESLEMELİ GECİKME. `ConvolverNode` bir impuls
  // yanıtı ister; onu sentezlemek hem CPU hem de bellek demek. Nokta atışı
  // bir gecikme, mezarlık akustiğini yeterince veriyor ve neredeyse bedava.
  const gecikme = ctx.createDelay(1.5);
  gecikme.delayTime.value = 0.34;
  const gecikmeGeri = ctx.createGain();
  gecikmeGeri.gain.value = 0.28;

  bus.connect(filtre);
  filtre.connect(ctx.destination);
  filtre.connect(gecikme);
  gecikme.connect(gecikmeGeri);
  gecikmeGeri.connect(gecikme);        // geri besleme halkası
  gecikmeGeri.connect(ctx.destination);

  kanal = { bus, gecikme, gecikmeGeri, filtre };
  return kanal;
}

function gurultuTamponu(ctx: AudioContext): AudioBuffer {
  if (gurultu) return gurultu;
  const n = Math.floor(ctx.sampleRate * 0.3);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  gurultu = buf;
  return buf;
}

/** Tek nota — zarf HER ZAMAN rampalı, yoksa başlangıç/bitişte "tık" duyulur */
function nota(
  ctx: AudioContext, k: Kanal, freq: number, t: number, sure: number,
  tip: OscillatorType, seviye: number, detune = 0,
) {
  const o = ctx.createOscillator();
  o.type = tip;
  o.frequency.value = freq;
  o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, seviye), t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
  o.connect(g);
  g.connect(k.bus);
  o.start(t);
  // ⚠️ `stop` ŞART. Durdurulmayan osilatör sonsuza kadar yaşar; 10 dakikalık
  // bir koşuda binlerce düğüm birikir ve ses motoru boğulur.
  o.stop(t + sure + 0.05);
}

/** Perküsyon — filtrelenmiş gürültü patlaması */
function vurus(ctx: AudioContext, k: Kanal, t: number, seviye: number, tiz: boolean) {
  const src = ctx.createBufferSource();
  src.buffer = gurultuTamponu(ctx);
  const f = ctx.createBiquadFilter();
  f.type = tiz ? 'highpass' : 'lowpass';
  f.frequency.value = tiz ? 3000 : 220;
  const g = ctx.createGain();
  const sure = tiz ? 0.08 : 0.16;
  g.gain.setValueAtTime(seviye, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
  src.connect(f); f.connect(g); g.connect(k.bus);
  src.start(t);
  src.stop(t + sure + 0.02);
}

/**
 * Bir 1/8'lik adımı zamanla.
 *
 * ⚠️ KATMANLAR YOĞUNLUKLA AÇILIYOR, TEMPO SABİT KALIYOR. Tempoyu
 * yoğunlukla oynatmak ilk denenen şeydi ve kötüydü: düşman sayısı
 * dalgalandıkça müzik hızlanıp yavaşlıyor, sarhoş gibi duyuluyordu.
 * Ritim omurga olmalı; değişen şey ÜSTÜNE ne konduğu.
 */
function adimiZamanla(ctx: AudioContext, k: Kanal, t: number) {
  const dizi = DIZI[sahne];
  const kok = dizi[bar % dizi.length];
  const y = yogunluk;
  const koy = sahne === 'village';

  // ── BAS ── her barın 1. ve 3. vuruşu (adım 0 ve 4)
  if (adim === 0 || adim === 4) {
    nota(ctx, k, midi(kok - 12), t, koy ? 1.6 : 0.55, 'triangle', koy ? 0.30 : 0.42);
  }

  // ── PED (uzun akor) ── bar başında, iki hafif detune osilatör
  if (adim === 0) {
    const sure = koy ? 3.4 : 2.1;
    nota(ctx, k, midi(kok), t, sure, 'sawtooth', 0.075, -7);
    nota(ctx, k, midi(kok + 7), t, sure, 'sawtooth', 0.055, +7);
  }

  // ── ARPEJ ── yoğunlukla sıklaşır
  const arpejAdimi = y > 0.6 ? 1 : y > 0.25 ? 2 : koy ? 4 : 0;
  if (arpejAdimi > 0 && adim % arpejAdimi === 0) {
    const ton = AKOR[(adim + bar) % AKOR.length];
    const oktav = koy ? 12 : 12 + (adim % 4 === 0 ? 12 : 0);
    nota(ctx, k, midi(kok + ton + oktav), t, koy ? 0.5 : 0.26, 'square', koy ? 0.045 : 0.055);
  }

  // ── PERKÜSYON ── köyde YOK: köy dinlenilecek yer, ritim baskısı orada
  // oyuncuyu "acele et" hissine sokardı.
  if (!koy && y > 0.35) {
    if (adim === 4) vurus(ctx, k, t, 0.20 + y * 0.14, false);
    if (y > 0.55 && (adim === 2 || adim === 6)) vurus(ctx, k, t, 0.05 + y * 0.05, true);
  }

  // ── EZGİ ── yalnız gerçekten kalabalıkken, iki barda bir tek nota
  if (!koy && y > 0.75 && adim === 0 && bar % 2 === 1) {
    const ezgi = [0, 10, 7, 3][(bar >> 1) % 4];
    nota(ctx, k, midi(kok + ezgi + 24), t, 0.9, 'triangle', 0.07);
  }

  // ── ÇAN ── köyde 8 barda bir, uzak bir kilise çanı
  if (koy && adim === 0 && bar % 8 === 0) {
    nota(ctx, k, midi(kok + 12), t, 4.2, 'sine', 0.11);
    nota(ctx, k, midi(kok + 19), t, 3.0, 'sine', 0.05);
  }
}

function tik() {
  const ctx = sesBaglami();
  if (!ctx || !kanal || !calisiyor) return;
  /**
   * ⚠️ BAĞLAM ÇALIŞMIYORSA NOTA ZAMANLAMA. Askıya alınmış bağlamda
   * `currentTime` İLERLEMİYOR; döngü yine de 1,2 sn'lik kuyruğu doldurur ve
   * oyuncu ilk tıklamayla sesi açtığında o kuyruk TEK SEFERDE boşalır —
   * müzik değil, bir gürültü patlaması duyulur. Bağlam açılana kadar
   * yalnızca imleci ileri taşıyoruz.
   */
  if (ctx.state !== 'running') {
    siradakiZaman = ctx.currentTime + 0.15;
    adim = 0; bar = 0;
    zamanlayici = setTimeout(tik, TIK_MS);
    return;
  }
  const spb = 60 / BPM[sahne];
  const adimSure = spb / 2;                  // 1/8'lik
  while (siradakiZaman < ctx.currentTime + ILERI_BAK) {
    // ⚠️ GEÇMİŞE ZAMANLAMA YAPMA. Sekme uzun süre uyuduysa `siradakiZaman`
    // çok geride kalır ve döngü yüzlerce notayı AYNI ANDA kuyruğa basar —
    // duyulan şey bir gürültü patlamasıdır. Geride kalınca ileri sarıyoruz.
    if (siradakiZaman < ctx.currentTime) {
      siradakiZaman = ctx.currentTime + 0.05;
      adim = 0; bar = 0;
    }
    if (!duraklatildi) adimiZamanla(ctx, kanal, siradakiZaman);
    siradakiZaman += adimSure;
    adim = (adim + 1) % 8;
    if (adim === 0) bar++;
  }
  zamanlayici = setTimeout(tik, TIK_MS);
}

/** Hedef ses seviyesi — ayar, duraklama ve yoğunluk birlikte belirler */
function hedefSeviye(): number {
  if (!acik || !isSoundEnabled() || duraklatildi) return 0;
  const y = sahne === 'village' ? 0.75 : 0.55 + yogunluk * 0.45;
  return TABAN * getVolume() * y;
}

function seviyeUygula(rampaSn = 0.5) {
  const ctx = sesBaglami();
  if (!ctx || !kanal) return;
  const t = ctx.currentTime;
  kanal.bus.gain.cancelScheduledValues(t);
  kanal.bus.gain.setValueAtTime(kanal.bus.gain.value, t);
  kanal.bus.gain.linearRampToValueAtTime(hedefSeviye(), t + rampaSn);

  // Filtre yoğunlukla açılır — uzaktan yakına
  const kesim = sahne === 'village' ? 1100 : 700 + yogunluk * 3200;
  kanal.filtre.frequency.cancelScheduledValues(t);
  kanal.filtre.frequency.setValueAtTime(kanal.filtre.frequency.value, t);
  kanal.filtre.frequency.linearRampToValueAtTime(kesim, t + rampaSn);
}

export function muzikBaslat(ilkSahne: Sahne = 'village') {
  const ctx = sesBaglami();
  if (!ctx) return;
  const k = kur(ctx);
  sahne = ilkSahne;
  if (!calisiyor) {
    calisiyor = true;
    siradakiZaman = ctx.currentTime + 0.15;
    adim = 0; bar = 0;
    tik();
  }
  seviyeUygula(1.4);      // yavaş giriş — müzik patlayarak başlamasın
  void k;
}

export function muzikDurdur() {
  calisiyor = false;
  if (zamanlayici) { clearTimeout(zamanlayici); zamanlayici = null; }
  const ctx = sesBaglami();
  if (ctx && kanal) {
    const t = ctx.currentTime;
    kanal.bus.gain.cancelScheduledValues(t);
    kanal.bus.gain.setValueAtTime(kanal.bus.gain.value, t);
    kanal.bus.gain.linearRampToValueAtTime(0, t + 0.5);
  }
}

/**
 * Sahne değiştir.
 *
 * ⚠️ BAR SAYACI SIFIRLANMIYOR. Sıfırlansaydı her sahne geçişi diziyi baştan
 * başlatır ve geçiş bir "kesme" gibi duyulurdu; akış sürerken armoninin
 * değişmesi aynı dünyanın rengi değişmiş gibi duyuluyor.
 */
export function muzikSahne(s: Sahne) {
  if (s === sahne) return;
  sahne = s;
  seviyeUygula(0.8);
}

/** 0..1 — sahnedeki baskı (canlı düşman oranı, boss, düşük can) */
export function muzikYogunluk(v: number) {
  const y = Math.min(1, Math.max(0, Number(v) || 0));
  // ⚠️ EŞİK VAR: her karede rampa kurmak zamanlama listesini şişirir ve
  // ses motorunu boşuna çalıştırır. Anlamlı değişimde güncelle.
  if (Math.abs(y - yogunluk) < 0.06) return;
  yogunluk = y;
  seviyeUygula(0.9);
}

/**
 * Müzik ayarını uygula.
 *
 * ⚠️ ZAMANLAYICI DURDURULMUYOR, yalnız ses kısılıyor. Durdurup yeniden
 * kurmak, oyuncu ayarı açıp kapattıkça diziyi baştan başlatır ve müzik
 * her seferinde aynı bardan yeniden duyulurdu.
 */
export function muzikAcik(v: boolean) {
  if (v === acik) return;
  acik = v;
  seviyeUygula(0.4);
}

/** Duraklamada müzik susar ama zamanlayıcı yaşamaya devam eder */
export function muzikDurakla(v: boolean) {
  if (v === duraklatildi) return;
  duraklatildi = v;
  seviyeUygula(0.35);
}

// Oyuncu sesi kısarsa/kapatırsa müzik de anında uymalı
sesAyariDinle(() => seviyeUygula(0.3));
