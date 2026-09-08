// ULTRA MOD — yalnız hazine cüzdanı, yalnız test için.
//
// 🔴 NİYE VAR (kullanıcı isteği): *"Treasury Wallet olarak kullandığımız
// cüzdanda bölümleri ve derinlikleri denemem için ultra modu açalım, yani
// sınırsız gold verelim ve her şey açık olsun."*
//
// ══════════════════════════════════════════════════════════════════════
// 🔴 KAYDA GERÇEKTEN YAZIYOR — VE ÖNCE YAZMAMAYI DENEDİM, ÇALIŞMADI.
//
// İlk sürüm "kayda dokunma, yalnız `/progress` cevabını zenginleştir"
// diyordu ve gerekçesi iyiydi (geri alınabilirlik). AMA OYUN SUNUCU
// OTORİTELİ: istemci 100M gold görüyordu, Forge'a basıyordu, sunucu
// GERÇEK satırı (0 gold) okuyup `yetersiz_gold` dönüyordu. Bölüme
// girmek de aynı sebeple reddediliyordu.
//
// Kullanıcı bildirimi: *"Treasury wallet'a gold gelmiş fakat forge
// harcaması yapılmıyor ve stage'de oyuna giremiyorum, hata mesajı
// veriyor. Hiçbir yerde gold harcanmıyor."*
//
// Bu, bu depodaki en pahalı hata sınıfının benim elimden çıkmış hâli:
// arayüz doğru görünüyor, veri geliyor, SON ADIMDA ölüyor. Doğru cevap
// tek tek her harcama kontrolüne "ultra mı" sorusu eklemek de değildi —
// o, oyunun her yerine dallanan bir istisna olurdu. Hesap gerçekten
// zengin olmalı.
//
// ⚠️ YAZMA IDEMPOTENT: gold eşiğin altına düştüyse tekrar dolduruluyor,
// açık bölümler zaten açıksa dokunulmuyor. Yani "sınırsız" hissi
// harcadıkça korunuyor.
// ⚠️ DEFTERE YAZILIYOR (`admin_grant`): kaynağı görünmeyen milyonlarca
// gold, `/admin/economy` musluk toplamını sessizce yalancı yapardı.
// ══════════════════════════════════════════════════════════════════════
//
// 🔴 SIRALAMADAN DÜŞÜYOR VE BU PAZARLIKSIZ. Ultra hesap d200'e inip tabloya
// yerleşseydi, sıralama ölçtüğü şeyi ölçmez olurdu ve o kayıt haftalık
// sezon ödülünü de alırdı (`season.ts` → kozmetik + toz). Test hesabının
// gerçek oyuncuların ödülünü alması kabul edilemez.
//
// ⚠️ EKONOMİYE GİRİYOR AMA GÖRÜNÜR: her dolum deftere `admin_grant`
// olarak yazılıyor. Görünmeyen bir musluk, `/admin/economy` ekranını
// sessizce yalancı yapardı — bu satır o ekranın işini korumak için var.
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

/**
 * ULTRA DERINLIK — her bolumde odenmis sayilan derinlik.
 *
 * 🔴 200'DEN 15'E INDI, VE SEBEBI BIR HATA (kullanici bildirdi):
 * *"Treasury wallet'ta depth 201'e kadar full gozukuyor, tum bolumler ve
 * tum skill kartlarini sectigimde oyunu acmiyor, oyun donuyor."*
 *
 * OLCULDU: checkpoint'ten baslarken verilen seviye
 * `startLevelFor(d) = 3 + 0,95·(d−2)`. d=201 icin 192 — yani kosu
 * baslamadan once 192 KART secmek gerekiyordu. Ekran goruntusunde tam
 * olarak `STARTING DRAFT 76 / 192` yaziyor.
 *
 * ⚠️ IKI AYRI HATA VARDI, IKISI DE DUZELDI:
 *   1. 192 secim (bu sabit) — oynanamaz uzunluk.
 *   2. Havuz tukenince oyunun kilitlenmesi — o MOTORDA duzeltildi
 *      (`engine.levelUp`), cunku yeterince uzun HER kosuda olurdu.
 *
 * d=15 → 15 kart. Kullanicinin istegi: *"tum derinlikleri 15'e getirelim,
 * tum bolumleri tek tek deneyerek oynamam lazim."* Test icin dogru sayi
 * "en yuksek" degil, "her bolumu acan en dusuk"tur.
 */
export const ULTRA_DERINLIK = 15;

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
}

/**
 * `/progress` cevabını ultra hâline çevir.
 *
 * ⚠️ `depthPaid` DE AÇILIYOR ve sebebi somut: kahraman kilidi
 * (`priestess` d8) ve beceri puanları ondan türüyor. Yalnız gold vermek
 * "her şey açık" olmazdı.
 *
 * 🔴 `vigil` VERİLMİYOR — VE BU BİLİNÇLİ BİR GERİ ADIM.
 *
 * İlk sürüm `vigil: true` yazıyordu ("her şey açık" olsun diye) ve
 * SATIN ALMA EKRANINI GİZLİYORDU: hazine cüzdanı paneli açtığında
 * "YOURS" görüyor, SOL düğmesi hiç çizilmiyordu. Kullanıcı bildirdi:
 * *"ben burada bir Solana ile ödeme butonu göremedim?"*
 *
 * Ultra modun VAR OLMA SEBEBİ test etmek; oyunun tek ödeme akışını test
 * edilemez yapan bir "kolaylık" amacın kendisini yiyordu. Hazine zaten
 * ödemeyi KENDİNE yapıyor — gerçek akışı denemenin maliyeti sıfır.
 *
 * ⚠️ Sonuç: Metal Bladekeeper ultra hesapta da kilitli kalıyor. Doğru
 * olan bu — o kahraman kartın içeriği ve kartı almadan görünmemeli.
 *
 * @param stageSayisi `STAGES.length` — sabit burada yazılmıyor, çağıran
 *   veriyor; ikinci bir bölüm sayısı tanımı bir gün ayrışırdı.
 * @param derinlik ultra modda ödenmiş sayılan derinlik
 */
/**
 * Hesabı ultra hâline getir — IDEMPOTENT.
 *
 * ⚠️ SUNUCU OTORİTELİ OLDUĞU İÇİN GERÇEKTEN YAZIYOR (bkz. dosya başlığı).
 * Yalnız cevabı süslemek Forge'u ve bölüm girişini kırıyordu.
 *
 * ⚠️ EŞİĞİN ALTINA DÜŞÜNCE DOLDURUYOR, her istekte değil: her `/progress`
 * çağrısında yazmak, köyde durup duran bir oyuncuda saniyede bir DB
 * yazması demekti.
 *
 * @returns eklenen gold (0 = dokunulmadı) — çağıran deftere yazsın diye
 */
export function ultraDolumGerekli(gold: number, unlockedStage: number,
  stageSayisi: number, depthPaid?: unknown): { gold: number; stage: boolean; derinlik: boolean } {
  // ⚠️ Yarıya düşünce dolduruluyor: "sınırsız" hissi harcadıkça korunmalı,
  // ama her kuruşta yazma tetiklenmemeli.
  const eksikGold = gold < ULTRA_GOLD / 2 ? ULTRA_GOLD - gold : 0;
  return {
    gold: eksikGold,
    stage: unlockedStage < stageSayisi,
    derinlik: derinlikYanlis(depthPaid, stageSayisi),
  };
}

/**
 * Kayittaki derinlik ULTRA_DERINLIK'ten FARKLI mi?
 *
 * 🔴 NIYE `<` DEGIL `!==`: dolum sarti "eksikse doldur" olsaydi, 200 yazili
 * bir hesap 15'e ASLA inmezdi — kullanicinin sikayet ettigi 201 derinlik
 * tam olarak boyle sikisip kalmisti. Ilk surumde yazma sarti yalniz
 * `gold > 0 || stage` idi; gold dolu ve bolumler acik oldugu icin
 * `depthPaid` bir daha HIC guncellenmiyordu. Sabiti degistirmek tek
 * basina hicbir sey yapmazdi.
 *
 * ⚠️ EKSIK BOLUM DE YANLIS SAYILIYOR: yalniz degerlere baksaydim, hic
 * girilmemis bir bolum (anahtar yok) fark edilmezdi.
 */
function derinlikYanlis(depthPaid: unknown, stageSayisi: number): boolean {
  if (!depthPaid || typeof depthPaid !== 'object') return true;
  const m = depthPaid as Record<string, unknown>;
  for (let id = 1; id <= stageSayisi; id++) {
    if (m[String(id)] !== ULTRA_DERINLIK) return true;
  }
  return false;
}

export function ultraIlerleme(stageSayisi: number, derinlik = ULTRA_DERINLIK): UltraIlerleme {
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
  return { gold: ULTRA_GOLD, unlockedStage: stageSayisi, cleared, firstClear, depthPaid };
}
