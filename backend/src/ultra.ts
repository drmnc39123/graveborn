// ULTRA MOD — yalnız hazine cüzdanı, yalnız test için.
//
// 🔴 NİYE VAR (kullanıcı isteği): *"Treasury Wallet olarak kullandığımız
// cüzdanda bölümleri ve derinlikleri denemem için ultra modu açalım, yani
// sınırsız gold verelim ve her şey açık olsun."*
//
// ══════════════════════════════════════════════════════════════════════
// ⚠️ KAYDA YAZMIYOR, OKUMA ANINDA TÜRETİYOR.
//
// En kolay yol "hazineye 10 milyon gold ver, bütün bölümleri açık işaretle"
// olurdu ve o yol geri alınamaz: mod kapatılınca hesapta uydurma bir
// ilerleme kalırdı ve gerçek veriden ayırt edilemezdi. Bunun yerine
// `/progress` cevabı ZENGİNLEŞTİRİLİYOR; veritabanındaki satır olduğu gibi
// duruyor. Bayrağı kapatmak eski hâle dönmek demek.
// ══════════════════════════════════════════════════════════════════════
//
// 🔴 SIRALAMADAN DÜŞÜYOR VE BU PAZARLIKSIZ. Ultra hesap d200'e inip tabloya
// yerleşseydi, sıralama ölçtüğü şeyi ölçmez olurdu ve o kayıt haftalık
// sezon ödülünü de alırdı (`season.ts` → kozmetik + toz). Test hesabının
// gerçek oyuncuların ödülünü alması kabul edilemez.
//
// ⚠️ EKONOMİYE DE GİRMİYOR: ultra gold defterde yok çünkü GERÇEKTEN
// verilmiyor. `/admin/economy` musluk toplamı bozulmuyor.
//
// ⚠️ TEK KAPI: hazine adresi. Ayrı bir "ultra listesi" ikinci bir sır
// yönetimi doğururdu; hazine zaten en yetkili adres.

import { hazineAdresi } from './solPay.js';

/**
 * ULTRA GOLD.
 *
 * ⚠️ "Sınırsız" diye bir sayı yok; `Number.MAX_SAFE_INTEGER` vermek
 * arayüzde `1e+15` gibi okunamaz bir şey yazdırır ve fiyat çıkarma
 * hesaplarında taşma riski doğurur. 100 milyon, Forge ağacının tamamının
 * (564.516) 177 katı — pratikte sınırsız, matematikte güvenli.
 */
export const ULTRA_GOLD = 100_000_000;

/** Ultra modda açık sayılan bölüm sayısı — `STAGES.length` çağıran tarafça verilir */
export function ultraMi(wallet: string | null | undefined): boolean {
  const hazine = hazineAdresi();
  // ⚠️ Hazine tanımlı değilse ultra mod KAPALI. Boş string karşılaştırması
  // yapılsaydı `wallet === ''` gibi bir durumda kapı açılabilirdi.
  if (!hazine || !wallet) return false;
  return wallet === hazine;
}

export interface UltraIlerleme {
  gold: number;
  unlockedStage: number;
  cleared: Record<number, boolean>;
  firstClear: Record<number, boolean>;
  depthPaid: Record<number, number>;
  vigil: boolean;
}

/**
 * `/progress` cevabını ultra hâline çevir.
 *
 * ⚠️ `depthPaid` DE AÇILIYOR ve sebebi somut: kahraman kilidi
 * (`priestess` d8), beceri puanları ve Vigil kademelerinin HEPSİ ondan
 * türüyor. Yalnız gold vermek "her şey açık" olmazdı.
 *
 * ⚠️ `vigil: true` — kart artık bir kahraman taşıyor (`bladekeeper`), yani
 * onsuz "her şey açık" yalan olurdu.
 *
 * @param stageSayisi `STAGES.length` — sabit burada yazılmıyor, çağıran
 *   veriyor; ikinci bir bölüm sayısı tanımı bir gün ayrışırdı.
 * @param derinlik ultra modda ödenmiş sayılan derinlik
 */
export function ultraIlerleme(stageSayisi: number, derinlik = 200): UltraIlerleme {
  const cleared: Record<number, boolean> = {};
  const firstClear: Record<number, boolean> = {};
  const depthPaid: Record<number, number> = {};
  for (let id = 1; id <= stageSayisi; id++) {
    cleared[id] = true;
    /**
     * ⚠️ `firstClear` DE İŞARETLİ: aksi hâlde ultra hesap her bölümün ilk
     * geçiş ödülünü (toplam 201.000 gold) yeniden alabilir görünürdü ve
     * arayüz "topla" düğmesi gösterirdi. Zaten sonsuz gold var; oradan
     * gerçek bir yazma tetiklemek kaydı kirletirdi.
     */
    firstClear[id] = true;
    depthPaid[id] = derinlik;
  }
  return { gold: ULTRA_GOLD, unlockedStage: stageSayisi, cleared, firstClear, depthPaid, vigil: true };
}
