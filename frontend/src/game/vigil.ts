// THE LONG VIGIL — sezon kartı.
//
// 🔴 KART GÜÇ SATIYOR — VE BU BİLİNÇLİ BİR KARAR (kullanıcı, 2026-09-08).
//
// Kart eskiden yalnız kozmetik ve toz veriyordu; dosyanın başlığı
// "ödeyen oyuncu daha derine inemez, yalnız farklı görünür" diyordu.
// ARTIK DOĞRU DEĞİL: kart 1.000 gold ve BAŞKA HİÇBİR YOLDAN AÇILAMAYAN
// bir kahraman (Metal Bladekeeper) veriyor.
//
// ⚠️ NE SATTIĞIMIZ ÖLÇÜLDÜ, tahmin edilmedi:
//   · Bladekeeper: +%15 hasar · +%15 can · +2 zırh · −%10 hız
//   · 1.000 gold ≈ 13 dakikalık oyun (ölçülen kazanç ~4.700 gold/saat)
//
// ⚠️ BU KARAR OYUN İÇİ METİNLERİ DE DEĞİŞTİRDİ. `codex.ts` oyuncuya
// "You cannot pay for power" ve "not as a bundle that happens to include
// it" diyordu; ikisi de düzeltildi. Oyuncuya bir şey vaat edip tersini
// satmak, satmanın kendisinden daha pahalıya mal olur.
//
// ⚠️ HÂLÂ SATILMAYANLAR: Forge · Stall · gear · paths · pets. Bunların
// ödeme ucu YOK ve `codex.test` bunu tarıyor. Sınır kalktı değil, TAŞINDI.
//
// ══════════════════════════════════════════════════════════════════════
// 🔴 HER ŞEY ANINDA VERİLİYOR (kullanıcı kararı, 2026-09-08).
//
// Kart eskiden derinlikle açılan ON İKİ KADEMELİ bir yoldu: her kademe toz
// + kozmetik veriyordu ve oyuncu onu OYNAYARAK yürüyordu. Kullanıcı bunu
// açıkça kaldırdı: *"Bu kartta DUST ile alakalı bir şey olmasın, bu kart
// sadece SOL ile satın alınır ve tüm ödüller anında verilir."*
//
// Sonuçları kayda geçiyor:
//   · TOZ TAMAMEN ÇIKTI — kart artık bir toz musluğu değil.
//   · Kademe/derinlik kapısı yok; `vigilClaimed` alanı ölü kaldı.
//   · Satın aldıktan SONRA kartın oyuncuyu oynamaya çeken tarafı YOK.
//     Bu, ödemeyi kolaylaştıran ama elde tutmayı zayıflatan bir takas ve
//     bilerek kabul edildi.
// ══════════════════════════════════════════════════════════════════════
//
// ⚠️ KART TEK SEFERLİK VE KALICI, ABONELİK DEĞİL.
// İlk tasarım "sezon kartı"ydı ama sezon bu oyunda HAFTALIK
// (`season.ts` → `bossWeek`). Haftalık 0,5 SOL yılda 26 SOL eder — kimse
// ödemez. Aylık yapmak ise İKİNCİ BİR TAKVİM kavramı doğururdu ve
// `season.ts` bunu açıkça yasaklıyor: "İkinci bir hafta tanımı yazma.
// Kaçınılmaz olarak kayar ve oyuncu açıklanamayan bir durumla karşılaşır."
// Bu yüzden kart bir kez alınır ve ömür boyu durur.
//
// ⚠️ "AL VE HER ŞEYİ KAP" DEĞİL. Kart bir yol açıyor; yolu OYNAYARAK
// yürüyorsun. Kademeler ulaşılan derinliğe bağlı, yani kartın verdiği şey
// bir ödül yığını değil, ödüllerin KİLİDİ. Parayla anında alınan bir
// koleksiyon, kozmetiklerin tamamını değersizleştirirdi.
//
// ⚠️ KADEMELER ULAŞILMIŞ DERİNLİKTEN OKUNUR (`paidDepth` — sunucunun ödeme
// yaptığı derinlik), iddia edilenden değil. Aynı kaynak beceri puanlarında
// ve profil kartında da kullanılıyor; ikinci bir "en derin" tanımı
// oyuncuya iki farklı sayı öğretirdi.
//
// ⚠️ SAF VERİ — sunucu da bu dosyayı okuyor.

import { COSMETICS } from './cosmetics';

/**
 * KARTIN ANINDA VERDİĞİ GOLD.
 *
 * ⚠️ ÖLÇEK: ~13 dakikalık oyun (4.700 gold/saat). Forge ağacının tamamı
 * 564.516 gold, tek Reliquary çekilişi 450. Yani hızlı bir başlangıç,
 * ekonomiyi kaydıran bir enjeksiyon değil.
 * ⚠️ TEK SEFER: `vigil: false` şartlı yazma ile korunuyor, iki ödeme iki
 * gold vermez.
 */
export const VIGIL_GOLD = 1000;

/**
 * KARTA ÖZEL KAHRAMAN — başka hiçbir yoldan açılmıyor.
 *
 * ⚠️ Eskiden "8 bölüm temizle" ile açılıyordu; o kilit KALDIRILDI
 * (`heroUnlock.ts`). Yani bu kahraman artık oynayarak kazanılamaz.
 * ⚠️ `heroUnlock.ts` bu sabiti okuyor — kahraman id'si iki yere yazılmaz.
 */
export const VIGIL_HERO = 'bladekeeper';

/**
 * KARTIN VERDİĞİ KOZMETİKLER.
 *
 * ⭐ `cosmetics.ts`TEN TÜRÜYOR, elle yazılmıyor. Liste iki yere yazılsaydı
 * biri diğerinden ayrılırdı ve en kötü hâli şu olurdu: kartın parası
 * alınır, kozmetik verilmez. Kaynak zaten orada işaretli
 * (`source: 'vigil'`) ve aynı işaret onların çekilişten çıkmasını da
 * engelliyor (`tozlaAlinabilirMi`).
 */
export function vigilCosmeticIds(): string[] {
  return COSMETICS.filter((c) => c.source === 'vigil').map((c) => c.id);
}

/** Kartın verdiği her şey — sunucu da arayüz de BUNU okur */
export interface VigilPaket {
  gold: number;
  hero: string;
  cosmetics: string[];
}

export function vigilPaket(): VigilPaket {
  return { gold: VIGIL_GOLD, hero: VIGIL_HERO, cosmetics: vigilCosmeticIds() };
}
