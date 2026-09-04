// MÜZİK MÜHRÜ — sesi DUYAMADAN müziğin doğru çaldığını ölçmek.
//
// 🔴 NİYE BÖYLE: müziği tarayıcıda doğrulamak DENENDİ ve OLMADI. Ölçüm
// aletinin sekmesi gizli (`document.hidden === true`), gizli sekmede
// tarayıcı `AudioContext`i `suspended` tutuyor ve `resume()` sayfa
// görünür olana kadar etkisiz kalıyor. Yani "hiç nota çalınmadı" sonucu
// müziğin bozuk olduğunu DEĞİL, aletin sağır olduğunu gösteriyordu.
// (Aynı tuzağın kare tarafı: gizli sekmede `rAF` duruyor.)
//
// Bu yüzden ölçüm tarayıcıdan alınıp buraya taşındı: sahte bir
// `AudioContext` kuruluyor, zaman ELLE ilerletiliyor ve zamanlanan her
// nota sayılıyor. Deterministik, hızlı ve ses kartı gerektirmiyor.
//
// ⚠️ NE ÖLÇMÜYOR: müziğin GÜZEL olup olmadığını. Bu mühür yapıyı ölçüyor
// (katmanlar açılıyor mu, düğüm sızıyor mu, uyuyan sekmeden dönünce
// patlama oluyor mu). Zevk yargısı oyuncunun.

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

// ── SAHTE SES MOTORU ──────────────────────────────────────────────────
interface Zamanli { baslangic: number; bitis: number; tur: string; simdi: number }
const kayit: Zamanli[] = [];
let acikDugum = 0;

class SahteParam {
  value = 0;
  setValueAtTime() { return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}
class SahteDugum {
  gain = new SahteParam();
  frequency = new SahteParam();
  Q = new SahteParam();
  detune = new SahteParam();
  delayTime = new SahteParam();
  type = '';
  buffer: unknown = null;
  connect() { return this; }
  disconnect() { return this; }
}
class SahteKaynak extends SahteDugum {
  tur: string;
  constructor(tur: string) { super(); this.tur = tur; }
  start(t: number) { acikDugum++; kayit.push({ baslangic: t, bitis: Infinity, tur: this.tur, simdi: ctx.currentTime }); }
  stop(t: number) {
    acikDugum--;
    for (let i = kayit.length - 1; i >= 0; i--) {
      if (kayit[i].bitis === Infinity && kayit[i].tur === this.tur) { kayit[i].bitis = t; break; }
    }
  }
}
class SahteCtx {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  sampleRate = 48000;
  destination = new SahteDugum();
  createGain() { return new SahteDugum(); }
  createBiquadFilter() { return new SahteDugum(); }
  createDelay() { return new SahteDugum(); }
  createOscillator() { return new SahteKaynak('osc'); }
  createBufferSource() { return new SahteKaynak('buf'); }
  createBuffer(_c: number, n: number) { return { getChannelData: () => new Float32Array(n) }; }
  resume() { return Promise.resolve(); }
}

const ctx = new SahteCtx();
// ⚠️ `sfx.ensure()` bağlamı `window.AudioContext`ten kuruyor ve bunu ÇAĞRI
// ANINDA okuyor — o yüzden import'tan ÖNCE global kurmak yetiyor, üretim
// koduna hiçbir test kancası eklemeye gerek kalmıyor.
const g = globalThis as unknown as Record<string, unknown>;
g.window = globalThis;
g.AudioContext = function () { return ctx; } as unknown as typeof AudioContext;

const müzik = await import('./music.js');

/** Sahte zamanı ilerlet ve zamanlayıcıların uyanmasına izin ver */
async function ilerle(sn: number, adim = 0.25) {
  for (let t = 0; t < sn; t += adim) {
    ctx.currentTime += adim;
    await new Promise((r) => setTimeout(r, 1));
  }
  // zamanlayıcı 200 ms'de bir uyanıyor — birkaç tur bekle
  await new Promise((r) => setTimeout(r, 700));
}

const sayacSifirla = () => { kayit.length = 0; };
const notaSayisi = () => kayit.length;

console.log('\n[1] KÖY — sakin katman');
müzik.muzikBaslat('village');
müzik.muzikYogunluk(0);
await ilerle(8);
const koySayi = notaSayisi();
check('köyde nota çalınıyor', koySayi > 0, `${koySayi} nota`);
// ⚠️ Köyde perküsyon OLMAMALI: köy dinlenilecek yer, ritim baskısı orada
// oyuncuyu "acele et" hissine sokardı (music.ts kararı).
const koyVurus = kayit.filter((k) => k.tur === 'buf').length;
check('köyde perküsyon YOK', koyVurus === 0, `${koyVurus} vuruş`);

console.log('\n[2] DÖVÜŞ — yoğunluk katman açıyor');
müzik.muzikSahne('combat');
müzik.muzikYogunluk(0);
sayacSifirla();
await ilerle(8);
const sakin = notaSayisi();
const sakinVurus = kayit.filter((k) => k.tur === 'buf').length;

müzik.muzikYogunluk(1);
sayacSifirla();
await ilerle(8);
const yogun = notaSayisi();
const yogunVurus = kayit.filter((k) => k.tur === 'buf').length;

check('sakin dövüşte perküsyon YOK', sakinVurus === 0, `${sakinVurus}`);
check('yoğun dövüşte perküsyon VAR', yogunVurus > 0, `${yogunVurus} vuruş`);
// ⚠️ ÇİFT TARAFLI: yalnız "yoğunda nota var" demek yetmez — katmanların
// gerçekten AÇILDIĞINI, yani yoğunun sakinden BELİRGİN fazla olduğunu
// ölçmek gerekiyor. Aksi hâlde sabit bir döngü de testi geçerdi.
check('yoğun katman sakinden belirgin fazla', yogun > sakin * 1.5,
  `sakin ${sakin} → yoğun ${yogun}`);

console.log('\n[3] SUSTURMA YOLLARI');
const kazanc = () => (müzik as unknown as { __seviye?: () => number }).__seviye?.() ?? -1;
müzik.muzikDurakla(true);
sayacSifirla();
await ilerle(4);
check('duraklamada nota ZAMANLANMIYOR', notaSayisi() === 0, `${notaSayisi()}`);
müzik.muzikDurakla(false);
sayacSifirla();
await ilerle(4);
check('duraklama kalkınca geri geliyor', notaSayisi() > 0, `${notaSayisi()}`);
void kazanc;

console.log('\n[4] UYUYAN SEKME — geri dönünce PATLAMA olmamalı');
// ⚠️ ÖLÇÜLEN RİSK: sekme arka planda uyurken `setTimeout` saniyede bire
// kısılıyor, bağlam saati ise akmaya devam ediyor. Naif bir zamanlayıcı
// uyandığında geçmişte kalan yüzlerce notayı AYNI ANDA kuyruğa basar ve
// müzik yerine bir gürültü patlaması duyulur.
sayacSifirla();
ctx.currentTime += 120;              // 2 dakika "uyudu"
await new Promise((r) => setTimeout(r, 900));
const patlama = notaSayisi();
check('2 dakikalık uykudan sonra kuyruk patlamıyor', patlama < 60, `${patlama} nota`);

console.log('\n[5] DÜĞÜM SIZINTISI');
// ⚠️ `stop()` çağrılmayan osilatör sonsuza kadar yaşar. 10 dakikalık bir
// koşuda binlerce düğüm birikir ve ses motoru boğulur — belirti "oyun
// yavaşladı" olur, sebebi müzik olduğu HİÇ akla gelmez.
sayacSifirla();
await ilerle(10);
const durdurulmayan = kayit.filter((k) => k.bitis === Infinity).length;
check('her ses kaynağı durduruluyor', durdurulmayan === 0, `${durdurulmayan} açık`);
check('açık düğüm sayacı sıfıra dönüyor', acikDugum === 0, `${acikDugum}`);

console.log('\n[6] GEÇMİŞE ZAMANLAMA YOK');
/**
 * ⚠️ ÖLÇÜM ALETİ BİR KEZ YALAN SÖYLEDİ VE BURASIYDI. İlk sürüm her notanın
 * başlangıcını TESTİN SONUNDAKİ saatle karşılaştırıyordu ve "24 nota
 * geçmişte" diyordu. Oysa o notalar zamanlandıkları AN gelecekteydi;
 * aradan 10 saniye geçtiği için geride kalmışlardı. Doğru ölçüt,
 * `start()` çağrıldığı ANDAKİ saat — sahte bağlam artık onu da kaydediyor.
 */
const gec = kayit.filter((k) => k.baslangic < k.simdi - 0.001).length;
check('nota geçmişe zamanlanmıyor', gec === 0, `${gec} nota geçmişte`);

müzik.muzikDurdur();
console.log(`\n${FAIL.length === 0 ? '✅ MÜZİK KATMANI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
