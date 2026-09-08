// KASMA ÖLÇER — ölçer ve ÖNERİR, hiçbir şeyi kendi değiştirmez.
//
// 🔴 KULLANICI KARARI: *"Sadece öner, oyuncu karar versin."* Otomatik
// düşürme seçeneği masadaydı ve REDDEDİLDİ. Oyunun görünümünü habersiz
// değiştirmek, kasmayı çözerken "oyunum neden birden çirkinleşti" diye
// yeni bir şikâyet üretir. Burada yalnız ölçüm var; kararı oyuncu veriyor.
//
// ⚠️ EŞİK 28 ms VE BU SAYI YUVARLAK BİR FPS DEĞİL. `config.MAX_CATCHUP = 2`
// `dt`yi 33,3 ms'e kırpıyor: 30 fps'in ALTINDA simülasyon kare başına en
// fazla 2 tick ilerliyor, yani 20 fps'te oyun 40 sim-Hz'de — gözle görülür
// AĞIR ÇEKİMDE — koşuyor. Koşu birebir aynı kalıyor (tick tick'tir) ama
// deneyim çöküyor. Eşik o uçurumun hemen üstünde duruyor.
//
// ⚠️ ORTANCA, ORTALAMA DEĞİL. Tek bir çöp toplama sıçraması ya da bir kare
// süren varlık çözme işi ortalamayı uçurur ve olmayan bir kasma bildirir.
// Ortanca onlara kör.
//
// ⚠️ KÖR PENCERELER ŞART. `document.hidden` iken tarayıcı `rAF`i saniyede
// bire düşürüyor — bu depoda defalarca yanlış teşhise yol açmış bir tuzak
// (bkz. hafızadaki "gizli sekme" kaydı). Ölçmezsek her oyuncuya "yavaş"
// deriz.
//
// ⚠️ DOM'SUZ: Node'da mühürlenebilsin diye. Zamanı çağıran veriyor.

/** Karar için gereken kare sayısı — 120 kare ≈ 2 sn (60 fps'te) */
const PENCERE = 120;

/**
 * Öneri eşiği (ms). Ayrıntılı gerekçe dosya başlığında: 33,3 ms `dt`
 * kırpması yüzünden gerçek uçurum 30 fps'te.
 */
export const ONERI_ESIGI_MS = 28;

/** Koşunun ilk saniyeleri sayılmaz — varlık yüklemesi kare süresini şişiriyor */
const ISINMA_SN = 3;

/**
 * Tek bir karenin ölçüme girip girmeyeceği.
 *
 * ⚠️ `dt > 100 ms` OLAN KARE ATILIR: sekme uyanması, varlık çözme, tarayıcı
 * duraklaması. Bunlar oyunun yavaşlığı değil, ölçümün gürültüsü.
 */
export function kareSayilsinMi(opts: {
  dtMs: number; gizli: boolean; kosuSuresiSn: number; oynaniyor: boolean;
}): boolean {
  if (opts.gizli) return false;
  if (!opts.oynaniyor) return false;
  if (opts.kosuSuresiSn < ISINMA_SN) return false;
  if (!Number.isFinite(opts.dtMs) || opts.dtMs <= 0) return false;
  return opts.dtMs <= 100;
}

export class KasmaOlcer {
  private halka: number[] = [];
  private i = 0;
  /** öneri oturumda BİR KEZ — tekrar tekrar dürtmek rahatsız edicidir */
  private onerildi = false;

  /** Ölçümü sıfırla — yeni koşu, temiz pencere */
  sifirla() {
    this.halka.length = 0;
    this.i = 0;
  }

  /** Öneri hakkını da sıfırla — yalnız yeni oturum/oyuncu tercihi için */
  tamSifirla() {
    this.sifirla();
    this.onerildi = false;
  }

  ekle(dtMs: number) {
    if (this.halka.length < PENCERE) this.halka.push(dtMs);
    else { this.halka[this.i] = dtMs; this.i = (this.i + 1) % PENCERE; }
  }

  /** Pencere dolmadan karar YOK — 5 kareye bakıp hüküm vermek gürültüdür */
  hazir(): boolean {
    return this.halka.length >= PENCERE;
  }

  ortanca(): number {
    return this.yuzdelik(0.5);
  }

  /**
   * KUYRUK ÖLÇÜSÜ — ve asıl teşhis burada.
   *
   * 🔴 ÖLÇÜLDÜ (2026-09-08, gerçek koşu, derinlik 30, 54 düşman):
   *   ortanca 1,4 ms · p95 16,5 ms · en kötü 22 ms
   * Yani oyun ORTALAMA hızlı, ama karelerin %5'i bütçenin (16,7 ms)
   * üstünde. Oyuncunun "kasma donma" dediği şey tam olarak bu: akıcı
   * gidip ara ara takılmak. Yalnız ortancaya ya da fps sayacına bakan
   * biri "sorun yok" der ve oyuncuyu haksız çıkarır.
   *
   * ⚠️ BU YÜZDEN ARAYÜZDE GÖSTERİLİYOR: kasmanın gerçek ölçüsü oyuncunun
   * makinesinde alınmalı. Geliştirme makinesindeki dev sunucusu kuyruğu
   * şişiriyor ve oradan alınan sayı üretimi temsil etmiyor.
   */
  yuzdelik(q: number): number {
    if (!this.halka.length) return 0;
    const s = [...this.halka].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * q))];
  }

  /** Ölçüm arayüzde gösterilebilsin diye — yalnız OKUR */
  rapor(): { ortanca: number; p95: number; enKotu: number; kare: number } {
    return {
      ortanca: Math.round(this.ortanca() * 10) / 10,
      p95: Math.round(this.yuzdelik(0.95) * 10) / 10,
      enKotu: Math.round(this.yuzdelik(1) * 10) / 10,
      kare: this.halka.length,
    };
  }

  /**
   * Öneri gösterilsin mi?
   *
   * @param elleSecildi oyuncu daha önce elle bir kademe seçtiyse ASLA
   *   önerme — seçimini yaptı, üstüne gitmek onu ikinci kez rahatsız etmek
   *   olur. (Kullanıcı kararı: oyun kendi değiştirmiyor; en azından
   *   sormasını da tek seferlik tutuyoruz.)
   * @param enDusuk zaten en düşük kademedeyse önerecek bir şey yok
   */
  onerMi(elleSecildi: boolean, enDusuk: boolean): boolean {
    if (this.onerildi || elleSecildi || enDusuk) return false;
    if (!this.hazir()) return false;
    if (this.ortanca() <= ONERI_ESIGI_MS) return false;
    this.onerildi = true;
    return true;
  }
}
