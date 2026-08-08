// SİLAH AÇILIŞI — "bu silahı kazandım" hissi.
//
// KULLANICI SORUSU: "bunlar level ilerledikçe alınması gerekmiyor mu?"
// Cevap hayırdı ve eksik olan tam da buydu: 10 silahın hepsi İLK KOŞUDAN
// itibaren level-up havuzundaydı. 1. bölümde de 25. bölümde de aynı kartlar
// çıkıyordu. Yeni silah eklemek oyuncuya bir şey KAZANDIRMIYOR, sadece kart
// havuzunu kalabalıklaştırıyordu — üstelik bir koşuda en fazla 6 silah
// taşındığı için 10 silahın 4'ünü hiç görmeden koşu bitebiliyordu.
//
// ⚠️ DURUM SAKLANMIYOR, TÜRETİLİYOR. `Progress`'e "açılmış silahlar" diye bir
// dizi eklemek cazipti ve YANLIŞ olurdu:
//   • ikinci bir gerçek kaynağı doğardı (dizi ile ilerleme ayrışabilir)
//   • istemci o diziyi düzenleyip her silahı açabilirdi
//   • sunucunun ayrıca doğrulaması gerekirdi
// Türetince üçü de yok oluyor: koşul zaten sunucunun doğruladığı verilerden
// (`cleared`, `depthPaid`) okunuyor. Aynı gerekçe `isNewcomer` ve
// başarımlarda da uygulandı.
//
// ⚠️ KAHRAMAN BAŞLANGIÇ SİLAHLARI HER ZAMAN AÇIK ve bu liste elle
// yazılmıyor, `HEROES`'tan türetiliyor. Elle yazsaydık yeni bir kahraman
// eklendiğinde o kahraman kilitli bir silahla başlar ve koşu ilk saniyesinde
// silahsız kalırdı.

import { HEROES } from './heroes';
import { WEAPONS, weaponById } from './config';
import type { Progress } from './progress';

/** Bir bölüm temizlendi mi */
function cleared(p: Progress, stageId: number): boolean {
  return !!p.cleared?.[stageId];
}

/** Herhangi bir bölümde ulaşılan en derin iniş */
function deepest(p: Progress): number {
  const d = p.depthPaid ?? {};
  let en = 0;
  for (const k of Object.keys(d)) en = Math.max(en, Number(d[Number(k)]) || 0);
  return en;
}

export interface UnlockDef {
  weapon: string;
  /** oyuncuya gösterilen koşul — İngilizce, EMİR KİPİ değil DURUM cümlesi */
  how: string;
  /** ⚠️ SAF: yalnızca `Progress` okur, yan etkisi yok */
  test: (p: Progress) => boolean;
}

/**
 * AÇILIŞ KOŞULLARI.
 *
 * ⚠️ Sıralama KOLAYDAN ZORA ve koşullar OYUNUN İKİ EKSENİNE dağıtılmış:
 * bölüm temizlemek (kampanya) ve derine inmek (Descent). Hepsini kampanyaya
 * bağlamak, Descent oynayan bir oyuncuya hiçbir şey açmazdı.
 *
 * ⚠️ Koşullar `Progress`ten okunabilir olmak ZORUNDA — "1000 düşman öldür"
 * gibi bir koşul cazip ama `Progress` kill sayısı tutmuyor ve tutması da
 * istemci iddiasına dayanırdı (bkz. backend/profile.ts'teki aynı karar).
 */
export const UNLOCKS: readonly UnlockDef[] = [
  { weapon: 'litany', how: 'Clear The Hollow Wood', test: (p) => cleared(p, 1) },
  { weapon: 'ward', how: 'Clear Ossuary Halls', test: (p) => cleared(p, 2) },
  { weapon: 'toll', how: 'Reach depth 5 in the Descent', test: (p) => deepest(p) >= 5 },
  { weapon: 'ash', how: 'Clear The Toll Tower', test: (p) => cleared(p, 4) },
  { weapon: 'soul', how: 'Reach depth 12 in the Descent', test: (p) => deepest(p) >= 12 },
  { weapon: 'cairn', how: 'Clear The Sunken Ossuary', test: (p) => cleared(p, 6) },
] as const;

/**
 * Koşulsuz açık silahlar — kahramanların başlangıç silahları.
 * ⚠️ `HEROES`'tan TÜRETİLİYOR, elle yazılmıyor (bkz. dosya başlığı).
 */
export const STARTER_WEAPONS: readonly string[] =
  [...new Set(HEROES.map((h) => h.weapon))];

/** Bu silah açık mı */
export function isWeaponUnlocked(id: string, p: Progress): boolean {
  if (STARTER_WEAPONS.includes(id)) return true;
  const u = UNLOCKS.find((x) => x.weapon === id);
  // ⚠️ Koşulu OLMAYAN silah AÇIK sayılır. Tersi (kilitli saymak) yeni bir
  // silah eklendiğinde onu sessizce erişilmez yapardı — ve bu hiçbir hata
  // üretmez, sadece silah oyunda hiç görünmez.
  return u ? u.test(p) : true;
}

/**
 * Level-up havuzuna girebilecek silah id'leri.
 *
 * ⚠️ Evrimleşmiş silahlar burada YOK ve olmamalı: onlar havuzdan değil
 * evrimden geliyor (`evolved: true` zaten havuz dışında).
 */
export function unlockedWeapons(p: Progress): string[] {
  return WEAPONS.filter((w) => isWeaponUnlocked(w.id, p)).map((w) => w.id);
}

export interface ArmouryRow {
  id: string;
  name: string;
  desc: string;
  unlocked: boolean;
  /** kilitliyse nasıl açılır; açıksa boş */
  how: string;
}

/**
 * Cephanelik listesi — arayüzün gösterdiği şey.
 *
 * ⚠️ KİLİTLİ SİLAHLAR DA LİSTELENİR, adıyla ve koşuluyla. Gizleseydik açılış
 * sistemi görünmez olurdu ve baştaki sorun aynen sürerdi: oyuncu neyi
 * kazanabileceğini bilmiyor. Kilidin işe yaraması GÖRÜNMESİNE bağlı.
 */
export function armoury(p: Progress): ArmouryRow[] {
  return WEAPONS.map((w) => {
    const acik = isWeaponUnlocked(w.id, p);
    const u = UNLOCKS.find((x) => x.weapon === w.id);
    return {
      id: w.id,
      name: w.name,
      desc: w.desc,
      unlocked: acik,
      how: acik ? '' : (u?.how ?? ''),
    };
  });
}

/**
 * İki ilerleme arasında YENİ açılan silahlar — koşu sonunda kutlanır.
 *
 * ⚠️ Kutlama olmadan açılış sistemi yarım kalır: oyuncu bir sonraki koşuda
 * kartı görür ve "bu ne zaman geldi" der. Kazanılan şeyin kazanıldığı AN
 * söylenmeli.
 */
export function newlyUnlocked(before: Progress, after: Progress): string[] {
  const onceki = new Set(unlockedWeapons(before));
  return unlockedWeapons(after).filter((id) => !onceki.has(id));
}

/** Arayüz için okunaklı ad — id'yi ekrana basmayalım */
export function weaponName(id: string): string {
  return weaponById(id)?.name ?? id;
}
