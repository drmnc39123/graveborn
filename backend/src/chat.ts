// KÖY SOHBETİ — oyunun ilk gerçek sosyal katmanı.
//
// NİYE: ölçüldü ve en büyük eksik buydu. GRAVEBORN tek kişilik bir oyundu;
// oyuncu 25 dakika yalnız dövüşüp yalnız gold harcıyordu, tek insan teması
// bir sıralama satırıydı. Kintara'nın 20.540 aylık oyuncusunun sebebi içerik
// hacmi değil, İNSANLAR. Bir oyuncuyu içerikle 56 saat tutabilirsin;
// yıllarca tutan şey başka oyunculardır.
//
// ⚠️ AYRI BİR WEBSOCKET SUNUCUSU AÇILMADI. `presence.ts` zaten `/presence`
// yolunda bir `ws` sunucusu çalıştırıyor; bağlantı, kimlik ve düşen bağlantı
// temizliği orada çözülmüş. İkinci bir soket = ikinci bir kimlik yolu +
// ikinci bir sızıntı kaynağı. Sohbet AYNI soketten, mesaj tipiyle ayrışıyor.
//
// ⚠️ SUNUCU DURUM TUTAR. Mesaj geçmişi süreçte, Postgres'te DEĞİL: sohbet
// kalıcı olmamalı (moderasyon yükü, disk, kişisel veri yüzeyi) ve zaten anlık
// bir şey. Sunucu yeniden başlarsa oda temizlenir — kabul edilebilir.
// Bkz. DEPLOY.md: backend tek uzun ömürlü süreçte koşmak zorunda.

/** Odada tutulan son mesaj sayısı — yeni girene bu kadarı gösterilir */
export const HISTORY = 40;

/**
 * ⚠️ HIZ SINIRI BURADA, ELLE. HTTP katmanındaki `express-rate-limit` bu
 * trafiği HİÇ GÖRMÜYOR: mesajlar WebSocket üstünden geçiyor, hiçbir Express
 * ara katmanına uğramıyor. Spam koruması unutulursa oda ilk günde ölür.
 */
const MIN_ARALIK_MS = 1200;
/**
 * Pencere içinde bu kadar mesajdan sonra susturulur.
 *
 * ⚠️ PENCERE, MİNİMUM ARALIĞIN İZİN VERDİĞİ HIZDAN GENİŞ OLMAK ZORUNDA.
 * İlk sürüm 10 sn / 8 mesajdı ve ÖLÇÜLDÜ: tam 1,3 saniyede bir gönderen biri
 * 10 saniyeye 7,7 mesaj sığdırıp tavana hiç değmiyordu — yani ikinci kademe
 * hiçbir zaman devreye girmiyor, tek kademe varmış gibi davranıyordu.
 * 20 sn / 8 mesaj: kısa bir patlama serbest, SÜRDÜRÜLEN spam kesiliyor
 * (uzun vadede ~1 mesaj / 2,5 sn).
 */
const PENCERE_MS = 20_000;
const PENCERE_TAVANI = 8;

export const MAX_UZUNLUK = 180;

export interface ChatMessage {
  /** kısa cüzdan — tam adres yayınlanmaz */
  n: string;
  /** temizlenmiş metin */
  m: string;
  /** SUNUCU zaman damgası (ms) — istemciden gelen zaman kabul edilmez */
  at: number;
}

const gecmis: ChatMessage[] = [];
/** cüzdan → son gönderim zamanları (spam penceresi) */
const gonderimler = new Map<string, number[]>();

/**
 * Metni temizle. `null` dönerse mesaj GÖNDERİLMEZ.
 *
 * ⚠️ HTML KAÇIŞI BURADA YAPILMIYOR ve yapılmamalı: React metni zaten metin
 * düğümü olarak basıyor, ikinci bir kaçış "&lt;" gibi çift kaçmış çıktı
 * üretir. Buradaki iş görünmez karakterleri ve satır sonlarını atmak —
 * sohbeti tek satırda ve okunur tutmak.
 *
 * ⚠️ Sıfır genişlikli karakterler ELENMEK ZORUNDA: hem görünmez spam aracı
 * hem de isim/komut taklidinin en kolay yolu.
 */
export function temizle(ham: unknown): string | null {
  if (typeof ham !== 'string') return null;

  // KOD NOKTASI FİLTRESİ — regex DEĞİL, bilerek.
  //
  // Regex ile yazılmıştı ve kaçış dizileri araç zincirinde üç kez bozuldu:
  // dosyaya ham kontrol karakteri düşüp derlemeyi kırdı. Kod noktasına
  // bakmak hem bu soruna bağışık hem de NE elendiğini okunur hâle getiriyor.
  let cikti = '';
  for (const ch of ham) {
    const c = ch.codePointAt(0) ?? 0;
    const kontrol = c < 0x20 || c === 0x7f;                    // satır sonu dahil
    const sifirGenislik = (c >= 0x200b && c <= 0x200f)         // ZWSP/ZWNJ/ZWJ/LRM/RLM
      || (c >= 0x2028 && c <= 0x202e)                          // satır/paragraf ayracı + yön
      || c === 0x2060 || c === 0xfeff;                         // word joiner + BOM
    if (sifirGenislik) continue;                               // tamamen at
    cikti += kontrol ? ' ' : ch;                               // kontrol → boşluk
  }

  const m = cikti.replace(/\s+/g, ' ').trim().slice(0, MAX_UZUNLUK);
  return m.length > 0 ? m : null;
}

/**
 * Bu cüzdan şu an konuşabilir mi?
 *
 * ⚠️ İKİ KADEME ŞART. Tek başına "art arda çok hızlı" yetmez: tam 1,3
 * saniyede bir gönderen biri sınırı hiç aşmadan odayı yine de doldurur.
 * İkinci kademe (pencere içinde toplam) onu yakalıyor.
 */
export function konusabilir(wallet: string, now = Date.now()): boolean {
  const liste = gonderimler.get(wallet) ?? [];
  const guncel = liste.filter((t) => now - t < PENCERE_MS);
  if (guncel.length >= PENCERE_TAVANI) {
    gonderimler.set(wallet, guncel);
    return false;
  }
  if (guncel.length > 0 && now - guncel[guncel.length - 1] < MIN_ARALIK_MS) {
    gonderimler.set(wallet, guncel);
    return false;
  }
  guncel.push(now);
  gonderimler.set(wallet, guncel);
  return true;
}

/** Mesajı geçmişe ekle ve yayınlanacak hâlini döndür */
export function kaydet(
  kisaAd: string, metin: string, now = Date.now(), etiket?: string | null,
): ChatMessage {
  const msg: ChatMessage = { n: kisaAd, m: metin, at: now, ...(etiket ? { g: etiket } : {}) };
  gecmis.push(msg);
  // ⚠️ Sınırsız büyüyen dizi, uzun ömürlü süreçte sessiz bir bellek
  // sızıntısıdır. Baştan kırp.
  if (gecmis.length > HISTORY) gecmis.splice(0, gecmis.length - HISTORY);
  return msg;
}

/** Odaya yeni girene gösterilecek son mesajlar */
export function son(): ChatMessage[] {
  return gecmis.slice();
}

/** Test/kapanış — süreç içi durum sıfırlanır */
export function temizleHepsi() {
  gecmis.length = 0;
  gonderimler.clear();
}
