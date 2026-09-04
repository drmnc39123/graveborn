// HATA DEFTERİ — üretimde sessizce kırılan şeyi GÖRMEK için.
//
// 🔴 NİYE VAR: bugüne kadar tek kayıt `console.error` idi. Railway'in log
// akışı geçici ve kimse ona bakmıyor; yani canlıda bir şey kırıldığında
// bunu öğrenmenin TEK yolu bir oyuncunun şikâyet etmesiydi. Bugünün
// tamamı "sessiz hata" avıydı (ters koşan fareler aylardır oradaydı) —
// üretimin de bir aynası olmalı.
//
// ⚠️ ÜÇÜNCÜ TARAF SERVİS YOK. Sentry vb. hem para hem de oyuncu
// verisinin dışarı çıkması demek. İhtiyaç duyulan şey "şu an ne kırık"
// sorusuna cevap veren bir ekran; onu tutmak bir halka tampon kadar
// basit.
//
// ⚠️ BELLEKTE TUTULUYOR, veritabanında değil. Bir hata dalgası (saniyede
// yüzlerce) veritabanına yazılsaydı, hata izleme aracının kendisi
// üretimi düşürürdü. Süreç yeniden başlayınca tampon sıfırlanır ve bu
// KABUL EDİLEN bir kayıp: amaç arşiv değil, "şu an ne oluyor".

const TAVAN = 200;
const MESAJ_MAX = 400;
const YIGIN_MAX = 1200;

export interface HataKaydi {
  /** ilk görülme ve son görülme (ISO) */
  ilk: string;
  son: string;
  kaynak: 'sunucu' | 'istemci';
  mesaj: string;
  /** sunucuda istek yolu, istemcide sayfa adresi */
  yol: string;
  yigin: string;
  /** kısaltılmış cüzdan — destek için, kimlik için değil */
  kim: string;
  /** ⭐ AYNI hatanın kaç kez görüldüğü */
  sayi: number;
}

const defter = new Map<string, HataKaydi>();

const kirp = (s: unknown, n: number) =>
  (typeof s === 'string' ? s : String(s ?? '')).slice(0, n);

/**
 * Hata kaydet.
 *
 * ⭐ AYNI HATA BİRİKTİRİLİYOR, satır olarak EKLENMİYOR — bu tasarımın en
 * önemli kararı. Bozuk bir döngü saniyede 200 hata üretebilir; her birini
 * ayrı satır yapsaydık tampon tek bir hatayla dolar ve DİĞER HER ŞEYİ
 * gizlerdi. Yani hata izleme, en çok ihtiyaç duyulduğu anda kör olurdu.
 * Anahtar = kaynak + mesaj + yol; sayaç artıyor, "son" güncelleniyor.
 *
 * ⚠️ BU FONKSİYON ASLA FIRLATMAZ. Hata yolunda fırlatan bir hata
 * kaydedici, asıl hatayı da yutar.
 */
export function hataYaz(k: {
  kaynak: 'sunucu' | 'istemci';
  mesaj: unknown;
  yol?: unknown;
  yigin?: unknown;
  kim?: unknown;
}): void {
  try {
    const mesaj = kirp(k.mesaj, MESAJ_MAX) || 'bilinmeyen hata';
    const yol = kirp(k.yol, 160);
    const anahtar = `${k.kaynak}|${mesaj}|${yol}`;
    const simdi = new Date().toISOString();
    const mevcut = defter.get(anahtar);
    if (mevcut) {
      mevcut.sayi++;
      mevcut.son = simdi;
      return;
    }
    // ⚠️ TAVAN AŞILINCA EN ESKİ SATIR DÜŞÜYOR — ama "en eski" = en son
    // GÖRÜLME zamanına göre. Ekleme sırasına göre atmak, hâlâ devam eden
    // eski bir hatayı bir kerelik yeni hatalar uğruna silerdi.
    if (defter.size >= TAVAN) {
      let enEski: string | null = null; let t = Infinity;
      for (const [a, v] of defter) {
        const z = Date.parse(v.son);
        if (z < t) { t = z; enEski = a; }
      }
      if (enEski) defter.delete(enEski);
    }
    defter.set(anahtar, {
      ilk: simdi, son: simdi, kaynak: k.kaynak, mesaj, yol,
      yigin: kirp(k.yigin, YIGIN_MAX), kim: kirp(k.kim, 24), sayi: 1,
    });
  } catch { /* hata kaydedici asıl hatayı yutmamalı */ }
}

/** En son görülene göre sıralı liste — panel bunu çiziyor */
export function hatalar(): HataKaydi[] {
  return [...defter.values()].sort((a, b) => Date.parse(b.son) - Date.parse(a.son));
}

export function hataSifirla(): void { defter.clear(); }

/** Panelin üst satırı: kaç ayrı hata, kaç toplam olay */
export function hataOzeti(): { ayri: number; toplam: number; sonDakika: number } {
  const simdi = Date.now();
  let toplam = 0, sonDakika = 0;
  for (const v of defter.values()) {
    toplam += v.sayi;
    if (simdi - Date.parse(v.son) < 60_000) sonDakika += v.sayi;
  }
  return { ayri: defter.size, toplam, sonDakika };
}

/**
 * Süreç düzeyindeki hataları yakala.
 *
 * ⚠️ `unhandledRejection` ÖLDÜRMÜYOR: bir `.catch` unutulmuş promise
 * genelde tek bir isteği etkiler; süreci düşürmek herkesin oyununu
 * kesmek olurdu. `uncaughtException` ise süreci BİLİNMEYEN bir duruma
 * sokar — orada devam etmek, yarım yazılmış verilerle koşmak demek.
 * Loglanıp çıkılıyor; Railway yeniden başlatıyor.
 *
 * ⚠️ İkisi de ayrıca `console.error` ile yazılıyor: bellekteki tampon
 * yeniden başlamada kayboluyor, Railway'in log akışı kalıyor.
 */
export function surecHatalariniYakala(): void {
  process.on('unhandledRejection', (sebep) => {
    const e = sebep instanceof Error ? sebep : new Error(String(sebep));
    console.error('[yakalanmamis-promise]', e.message, e.stack);
    hataYaz({ kaynak: 'sunucu', mesaj: e.message, yol: 'unhandledRejection', yigin: e.stack });
  });
  process.on('uncaughtException', (e) => {
    console.error('[yakalanmamis-istisna]', e.message, e.stack);
    hataYaz({ kaynak: 'sunucu', mesaj: e.message, yol: 'uncaughtException', yigin: e.stack });
    // ⚠️ Çıkmadan önce log'un yazılmasına izin ver
    setTimeout(() => process.exit(1), 250);
  });
}
