// DESCENT TABANININ ZORLUĞU — oyuncuya söylenebilir hâlde.
//
// 🔴 NİYE VAR (kullanıcı bildirimi + ölçüm): *"Descent moduna girdiğimizde
// 70 civarı düşman geliyor fakat o kadar zor ki derinlik 1 bile
// geçilemiyor."*
//
// ÖLÇÜLDÜ (`descent.probe.mts`, taban oyuncu, kusursuz kaçan yapay oyuncu):
//     taban   d1 geçen   ulaşılan derinlik
//     b 1        6/6            6
//     b 5        1/6            0
//     b10        5/6            1
//     b15        0/6            0
//     b20        0/6            0
//     b25        0/6            0
//
// Sebep matematik hatası DEĞİL: `descentStage` seçilen kampanya bölümünün
// çarpanlarını miras alıyor ve `challengeRating` bunu zaten sayıyor — yani
// taban seçmek KASITLI bir zorluk ekseni ("b1'de d40" ile "b10'da d12"
// karşılaştırılabilsin diye).
//
// 🔴 ASIL HATA GÖRÜNÜRLÜKTE: ikisi de ekranda sadece "DEPTH 1" yazıyor.
// Ölçüldü: b25'in d1'i, b1'in d24'ü kadar zor (can ×15 VE hasar ×7,6).
// Oyuncunun bunu bilmesinin hiçbir yolu yoktu — üstelik `depthGold` bölüm
// numarasıyla çarpıldığı için (b25 d1 = 115 gold, b1 d1 = 25) oyun oyuncuyu
// geçemeyeceği tabana ÖDÜLLE itiyordu.
//
// ⚠️ DENGE SABİTLERİNE DOKUNULMADI. Bu dosya hiçbir sayıyı değiştirmiyor;
// var olan sayıları OKUNABİLİR hâle getiriyor.
//
// ⚠️ SAF VERİ — DOM yok, React yok.

import { DESCENT, STAGES, challengeRating, descentStage } from './config';

export interface TabanZorluk {
  /** d1'de düşman canı çarpanı */
  hpMul: number;
  /** d1'de düşman hasarı çarpanı */
  damageMul: number;
  /** aynı anda sahnede olabilecek en çok düşman */
  maxAlive: number;
  /**
   * Bu tabanın d1'i, EN KOLAY taban üzerinde hangi derinliğe denk?
   *
   * ⚠️ ÖLÇÜT CAN × HASAR. Önce yalnız `hpMul` kullanıldı ve ÖLÇÜMLE
   * ÇÜRÜDÜ: b10 "aşırı" işaretleniyordu ama sonda 5/6 koşu d1'i geçiyordu,
   * b25 ise b1'in d18'i sayılıyordu — oysa b25'in hasarı da 7,56 kat ve
   * b1 d18'de hasar yalnız 2,4 kat. Cana bakmak zorluğu ÜÇTE BİR
   * gösteriyordu.
   *
   * İkisini çarpmak uydurma bir puan DEĞİL: her ikisi de derinlik başına
   * üssel büyüyor (`hpGrowth` 1,16 · `damageGrowth` 1,05), yani çarpımları
   * "kaç derinlik ileriden başlıyorum" sorusunun tam karşılığı.
   */
  esdegerDerinlik: number;
}

/** En kolay taban — karşılaştırmanın çıpası */
export const KOLAY_TABAN = STAGES[0];

export function tabanZorluk(stageId: number): TabanZorluk {
  const d1 = descentStage(stageId, 1);
  const kolay = descentStage(KOLAY_TABAN.id, 1);
  const agirlik = (x: { hpMul: number; damageMul?: number }) => x.hpMul * (x.damageMul ?? 1);
  const oran = agirlik(d1) / agirlik(kolay);

  /**
   * `buyume^(n-1) = oran` → n = 1 + log(oran)/log(buyume)
   * ⚠️ Kapalı form, döngü DEĞİL: döngü tam sayıya yuvarlarken eşiği
   * kaçırıyordu.
   */
  const buyume = DESCENT.hpGrowth * DESCENT.damageGrowth;
  const n = 1 + Math.log(Math.max(1, oran)) / Math.log(buyume);
  return {
    hpMul: d1.hpMul,
    damageMul: d1.damageMul ?? 1,
    maxAlive: d1.maxAlive,
    esdegerDerinlik: Math.max(1, Math.round(n)),
  };
}

/**
 * Oyuncu bu tabanda ne bekliyor?
 *
 * ⚠️ ÖLÇÜT OYUNCUNUN KENDİ KAYDI, uydurma bir güç modeli DEĞİL. Elimizde
 * "bu oyuncu ne kadar hasar veriyor" diye güvenilir bir sayı yok; ama
 * "bu oyuncu en derin nereye indi" var ve sunucu onu zaten doğruluyor
 * (`depthPaid`). Tabanın d1'i onun geçtiği derinliğe denkse geçebilir.
 *
 * ⚠️ EŞİKLER ÖLÇÜMDEN: taban oyuncu (hiç yükseltme yok, bestDepth 0)
 * b1'de d6'ya iniyor, b5'te (eşdeğer d9) 1/6, b15'te (eşdeğer d24) 0/6.
 * Yani "eşdeğer derinlik ≈ en iyi derinliğin biraz üstü" hâlâ geçilebilir,
 * katı katına çıkınca geçilemez oluyor.
 */
export type TabanDurum = 'gecilmis' | 'zorlu' | 'asiri';

export function tabanDurum(stageId: number, enIyiDerinlik: number): TabanDurum {
  const { esdegerDerinlik } = tabanZorluk(stageId);
  // ⚠️ +5 pay: hiç inmemiş oyuncu (0) b1'e (eşdeğer 1) bakınca "aşırı"
  // görmemeli — ilk koşu her zaman açık olmalı.
  const taban = Math.max(5, enIyiDerinlik);
  if (esdegerDerinlik <= taban) return 'gecilmis';
  if (esdegerDerinlik <= taban * 2) return 'zorlu';
  return 'asiri';
}

/**
 * Tabanın d1 puanı — tablodaki karşılığı.
 *
 * ⚠️ Zorluğun ÖDÜLÜ de var: zor tabanda kısa merdiven, tabloda daha çok
 * puan. Oyuncuya yalnız riski gösterip karşılığını göstermemek, kararı
 * eksik bilgiyle verdirmek olurdu.
 */
export function tabanPuan(stageId: number): number {
  return challengeRating(stageId, 1);
}
