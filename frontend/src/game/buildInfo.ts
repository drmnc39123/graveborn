// TAŞINAN BUILD — bir silahın/pasifin O ANDA ne yaptığının TEK KAYNAĞI.
//
// ⚠️ NİYE AYRI DOSYA: bu bilgiyi iki ekran soruyor — level-up kartı
// ("bunu alırsam ne olur") ve koşu içi build rayı ("elimde ne var"). Aynı
// kural iki yere yazıldığında bu depoda HER SEFERİNDE ayrıştı; en pahalısı
// evrim eşiğiydi: motorun şartı gevşetildi, kartın ipucu eski kuralı
// anlatmaya devam etti ve "EVOLUTION READY" rozeti hiç görünmedi.
//
// ⚠️ BURADA SAYI YAZILI DEĞİL. Her değer `config.ts`ten türüyor; hasar ve
// adet ise MOTORDAN geliyor (`damageOf`/`countOf`), çünkü `might` ve
// `amount` arayüzün göremeyeceği yerde birikiyor.

import {
  EVOLUTIONS, EVOLVED, PASSIVES, STAT_BASE,
  evrimPasifEsigi, evrimSilahEsigi, weaponById,
  weaponCooldownAt, weaponCountAt, weaponDamageAt,
  type PassiveDef, type WeaponDef,
} from './config';

// ── PASİF ─────────────────────────────────────────────────────────────

/**
 * Bir pasifin TOPLAM etkisi, okunur hâlde.
 *
 * ⚠️ YÜZDE Mİ DÜZ MÜ SORUSU ELLE CEVAPLANMIYOR: ikinci bir tablo yazmak
 * (forge'daki `unit` alanı gibi) üçüncü bir doğruluk kaynağı olurdu.
 * Cevap zaten `STAT_BASE`te duruyor — tabanı 1 olan istatistik bir
 * ÇARPAN'dır (might, area, greed…), tabanı 0 olan DÜZ bir sayıdır
 * (armor, amount). `maxHp` istisna: tabanı can puanı ama motor pasifi
 * yüzde olarak uyguluyor (`recomputeStats` → `runHpPct`).
 */
export function pasifDeger(def: PassiveDef, level: number): string {
  const add = def.perLevel * Math.max(0, level);
  if (def.stat === 'recovery') return `+${add.toFixed(1)} HP/sec`;
  const yuzde = def.stat === 'maxHp' || STAT_BASE[def.stat] === 1;
  if (!yuzde) return `+${Math.round(add)}`;
  // ⚠️ Bekleme AZALIYOR — motor `s.cooldown -= add` yapıyor. "+%16 cooldown"
  // yazmak oyuncuya tersini söylerdi.
  const isaret = def.stat === 'cooldown' ? '−' : '+';
  return `${isaret}${Math.round(add * 100)}%`;
}

export interface PasifBilgi {
  def: PassiveDef;
  level: number;
  maxed: boolean;
  /** şu anki toplam etki */
  simdi: string;
  /** bir sonraki seviyedeki toplam — max'ta null */
  sonra: string | null;
}

export function pasifBilgi(id: string, level: number): PasifBilgi | null {
  const def = PASSIVES.find((p) => p.id === id);
  if (!def) return null;
  const maxed = level >= def.maxLevel;
  return {
    def, level, maxed,
    simdi: pasifDeger(def, level),
    sonra: maxed ? null : pasifDeger(def, level + 1),
  };
}

// ── EVRİM ─────────────────────────────────────────────────────────────

export interface EvrimDurum {
  /** evrimleşmiş silahın adı */
  hedefAd: string;
  /** gereken pasifin adı */
  pasifAd: string;
  silahEsik: number;
  pasifEsik: number;
  silahSeviye: number;
  pasifSeviye: number;
  silahTamam: boolean;
  pasifTamam: boolean;
}

/**
 * Bu silah evrimleşebilir mi, ve nerede duruyoruz?
 *
 * ⚠️ EŞİKLER `config.ts`TEN OKUNUYOR (`evrimSilahEsigi`/`evrimPasifEsigi`),
 * elle yazılmıyor — motorun `tryEvolve`u da tam o iki fonksiyonu çağırıyor.
 *
 * ⚠️ ÜÇÜNCÜ ŞART BURADA YOK ve olamaz: evrim ayrıca bir EVRİM SANDIĞI
 * istiyor (`tryEvolve` yalnız sandık açılınca çağrılıyor). Çağıran taraf
 * bunu metne katmalı — "hazır" demek "şimdi olacak" demek değil.
 */
export function evrimDurumu(
  weaponId: string,
  silahSeviye: number,
  passives: { id: string; level: number }[],
): EvrimDurum | null {
  const ev = EVOLUTIONS.find((e) => e.weapon === weaponId);
  if (!ev) return null;
  const def = weaponById(weaponId);
  const gereken = PASSIVES.find((p) => p.id === ev.passive);
  const hedef = EVOLVED.find((w) => w.id === ev.to);
  if (!def || !gereken || !hedef) return null;

  const silahEsik = evrimSilahEsigi(def);
  const pasifEsik = evrimPasifEsigi(gereken);
  const pasifSeviye = passives.find((p) => p.id === ev.passive)?.level ?? 0;

  return {
    hedefAd: hedef.name,
    pasifAd: gereken.name,
    silahEsik, pasifEsik,
    silahSeviye, pasifSeviye,
    silahTamam: silahSeviye >= silahEsik,
    pasifTamam: pasifSeviye >= pasifEsik,
  };
}

/**
 * Evrim satırı — YALNIZ EKSİK OLANI söyler.
 *
 * ⚠️ Tutulmuş bir şartı "needs" diye yazmak oyuncuya yanlış iş yaptırır:
 * ekranda "Needs this at Lv 6 (6/6)" görülüp silahın daha da yükseltilmesi
 * beklenirdi, oysa eksik olan pasifti.
 */
export function evrimMetni(e: EvrimDurum): string {
  if (e.silahTamam && e.pasifTamam) return 'Ready — it happens at the next evolution chest.';
  const silah = `this weapon at Lv ${e.silahEsik} (${e.silahSeviye}/${e.silahEsik})`;
  const pasif = `${e.pasifAd} at Lv ${e.pasifEsik} (${e.pasifSeviye}/${e.pasifEsik})`;
  if (e.silahTamam) return `Needs ${pasif}.`;
  if (e.pasifTamam) return `Needs ${silah}.`;
  return `Needs ${silah} and ${pasif}.`;
}

// ── SİLAH ─────────────────────────────────────────────────────────────

export interface SilahArtis { label: string; text: string }

/**
 * "Lv 3 → 4 ne kazandırır" — kartın ve rayın ORTAK cevabı.
 *
 * ⚠️ Oran olarak veriliyor, ham fark olarak değil: `might` çarpanı her iki
 * seviyede de aynı olduğu için orandan DÜŞÜYOR — yani bu satır Forge'dan
 * bağımsız doğru. Ham farkı yazsaydık `might`i de taşımak gerekirdi.
 */
export function silahArtislari(def: WeaponDef, level: number): SilahArtis[] {
  const out: SilahArtis[] = [];
  if (level >= def.maxLevel) return out;
  const s = level + 1;
  const d0 = weaponDamageAt(def, level), d1 = weaponDamageAt(def, s);
  if (d1 > d0) out.push({ label: 'DAMAGE', text: `+${Math.round(((d1 / d0) - 1) * 100)}%` });
  const c0 = weaponCooldownAt(def, level), c1 = weaponCooldownAt(def, s);
  if (c1 < c0) out.push({ label: 'ATTACK SPEED', text: `+${Math.round(((c0 / c1) - 1) * 100)}%` });
  const n0 = weaponCountAt(def, level), n1 = weaponCountAt(def, s);
  if (n1 > n0) out.push({ label: 'PROJECTILES', text: `+${n1 - n0}` });
  const a0 = Math.pow(def.areaPerLevel ?? 1, level - 1);
  const a1 = Math.pow(def.areaPerLevel ?? 1, s - 1);
  if (a1 > a0) out.push({ label: 'AREA', text: `+${Math.round(((a1 / a0) - 1) * 100)}%` });
  return out;
}
