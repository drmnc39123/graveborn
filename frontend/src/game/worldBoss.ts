// HAFTALIK ORTAK BOSS — herkesin aynı düşmana vurduğu tek yer.
//
// Kullanıcının tarifi: "ortak özel bir map, haftalık BOSS, oyuncular girsin,
// hasara göre sıralama olsun". Bu dosya o modun SAF tarafı: hangi hafta hangi
// boss, canı ne, bir koşuda en fazla ne kadar hasar VERİLEBİLİR.
//
// ⚠️ ÖDÜL GOLD DEĞİL. Bu karar tesadüf değil, `wager.ts`'teki aynı akıl
// yürütmenin devamı: hasar iddiası SUNUCUDA TAM DOĞRULANAMIYOR (koşunun
// girdisi kaydedilmiyor, motor yeniden oynatılamıyor). Doğrulanamayan bir
// sayıya gold bağlamak, musluğu doğrulanamayan bir kanala açmaktır. Toz ve
// kozmetik ödül, şişirilmiş bir hasarın maliyetini SADECE bir sıralamayla
// sınırlıyor — ekonomiye hiç dokunmuyor.
//
// ⚠️ Yine de yapısal bir tavan var (`maxBossDamage`): sınırsız bir iddia
// tabloyu kalıcı kilitler (leaderboard'daki "500'e kırpılan yalan" dersi).

import {
  COOLDOWN_FLOOR, STAT_BASE, WEAPONS, weaponDamageAt,
  type StageDef, type StatKey,
} from './config';

/**
 * Hafta numarası — UTC, Pazartesi başlangıçlı.
 * ⚠️ Sunucu hesaplar. İstemcinin haftası farklı çıkarsa oyuncu "geçen
 * haftanın boss'una" vurmuş olurdu.
 */
export function bossWeek(d: Date): number {
  // 1970-01-05 bir Pazartesi — haftalar oradan sayılıyor
  const gun = Math.floor(d.getTime() / 86400_000);
  return Math.floor((gun - 4) / 7);
}

/** Haftanın bittiği an (bir sonraki Pazartesi 00:00 UTC) */
export function weekEndsAt(week: number): number {
  return ((week + 1) * 7 + 4) * 86400_000;
}

export interface BossDef {
  id: string;
  name: string;
  /** ölüm çığlığı — boss odasının alt yazısı */
  epithet: string;
  /** sprite (sprites.ts ENEMY_ART anahtarı) */
  art: string;
  /** ortak can havuzu */
  hp: number;
  /** temas hasarı */
  damage: number;
  radius: number;
}

/**
 * BOSS DÖNGÜSÜ. Hafta numarasına göre seçilir, yani herkes AYNI hafta AYNI
 * boss'u görür — "ortak" olmasının tek şartı bu.
 *
 * ⚠️ Can havuzu kasıtlı olarak BİR OYUNCUNUN indiremeyeceği kadar büyük.
 * Tek kişinin bitirebildiği bir "ortak boss" ortak değildir; asıl amaç
 * topluluğun toplamda devirmesi.
 */
export const WORLD_BOSSES: readonly BossDef[] = [
  { id: 'wb_choir', name: 'The Choirmaster', epithet: 'It has been singing since before the village had a name.', art: 'boss_mega', hp: 160_000_000, damage: 62, radius: 58 },
  { id: 'wb_vigil', name: 'The Iron Vigil', epithet: 'It was set to guard a door that no longer exists.', art: 'boss_nightmare', hp: 185_000_000, damage: 70, radius: 60 },
  { id: 'wb_drowned', name: 'The Drowned Choir', epithet: 'Every voice in it was once a person who came down here.', art: 'boss_mega', hp: 210_000_000, damage: 66, radius: 56 },
  { id: 'wb_first', name: 'The First Graveborn', epithet: 'The one that got up first, and never learned to stop.', art: 'boss_nightmare', hp: 240_000_000, damage: 78, radius: 66 },
] as const;

/**
 * ⚠️ CAN HAVUZLARI 4 KAT BÜYÜTÜLDÜ (ölçümden sonra).
 *
 * İlk değerlerde (40-60M) test şunu gösterdi: TAVANDAN iddia eden biri 7
 * koşuda havuzu bitiriyordu. Gerçek oyunda 7 koşu imkânsız — ölçüldü, tam
 * yükseltilmiş oyuncu koşu başına ~220K veriyor, yani 182 koşu gerekirdi.
 * Ama TEK bir hile iddiası haftayı HERKES İÇİN bitirebiliyordu ve bu, ortak
 * bir özellikte kabul edilemez: kırpılmış bir gold iddiasının maliyeti
 * kendisiyle sınırlı, burada başkalarının haftası gidiyor.
 *
 * Yeni değerlerde tavandan iddia bile ~28 koşu (× 5 dk = 2,3 saat GERÇEK
 * süre, çünkü `elapsedSec` sunucu saatinden) gerektiriyor.
 *
 * ⚠️ Boss'un devrilmemesi SORUN DEĞİL: ödül hasar sıralamasından geliyor,
 * öldürmeye bağlı değil. "Hafta dönünce mühürlenir, bitmiş olsun olmasın."
 */

export function bossOfWeek(week: number): BossDef {
  const i = ((week % WORLD_BOSSES.length) + WORLD_BOSSES.length) % WORLD_BOSSES.length;
  return WORLD_BOSSES[i];
}

/** Boss odasında bir koşunun süre tavanı — descent'ten kısa, oda tek dövüş */
export const BOSS_RUN_SEC = 5 * 60;

/**
 * BİR KOŞUDA VERİLEBİLECEK EN YÜKSEK HASAR — yapısal tavan.
 *
 * ⚠️ Koşuyu sunucuda yeniden oynatmak MÜMKÜN DEĞİL: motor deterministik ama
 * girdiye bağlı ve girdi kaydedilmiyor. O yüzden burada `settleRun`'daki
 * yaklaşımın aynısı uygulanıyor — "gerçekte ne oldu" değil, "en fazla ne
 * olabilirdi" sorusu kapalı formda cevaplanıyor.
 *
 * Hesap: en güçlü silahın tam yükseltilmiş hâli × en yüksek mermi sayısı ×
 * saniyedeki atış × oyuncunun kalıcı hasar çarpanı × kritik tavanı × süre.
 * Gerçek bir koşu bunun çok altında kalır; amaç adaleti değil TAVANI garanti
 * etmek — ve tavan olmadan tek bir yalan tabloyu kalıcı kilitler.
 */
export function maxBossDamage(
  elapsedSec: number,
  permanent: Partial<Record<StatKey, number>> = {},
): number {
  const sec = Math.max(0, Math.min(elapsedSec, BOSS_RUN_SEC + 30));

  // En yüksek DPS'li silahı bul — max seviye + en kötü (en kısa) bekleme.
  // ⚠️ `COOLDOWN_FLOOR` motorun dibi: bekleme bunun altına İNEMEZ, o yüzden
  // tavanı oradan hesaplamak hem doğru hem cömert.
  let enIyiDps = 0;
  for (const w of WEAPONS) {
    const dmg = weaponDamageAt(w, Math.max(1, w.maxLevel));
    const cd = Math.max(COOLDOWN_FLOOR, w.cooldownSec * Math.pow(w.cdPerLevel, w.maxLevel - 1));
    // `countLevels` her eşikte +1 adet veriyor; max seviyede hepsi kazanılmış
    const adet = 1 + (w.countLevels?.length ?? 0);
    const dps = (dmg / cd) * adet;
    if (dps > enIyiDps) enIyiDps = dps;
  }

  const might = (STAT_BASE.might ?? 1) + (permanent.might ?? 0);
  const amount = (STAT_BASE.amount ?? 0) + (permanent.amount ?? 0);
  // Kritik tavanı: %60 şans × 4 çarpan → beklenen 1 + 0.6*(4-1) = 2.8
  const kritik = 2.8;
  // Mermi sayısı bonusu tavanı — her mermi ayrı vurur
  const mermi = 1 + Math.max(0, amount);

  return Math.ceil(enIyiDps * might * kritik * mermi * sec);
}

/**
 * Boss odasının sahne tanımı — motor bunu normal bir bölüm gibi oynatır.
 *
 * ⚠️ Odadaki boss'un canı ORTAK CAN DEĞİL. Ortak can milyonlarca; motora
 * verilse oyuncu 5 dakikada barının kımıldamadığını görür ve vurmanın işe
 * yaradığını hiç hissetmez. Buradaki can "bir koşuluk dilim": oyuncu onu
 * eritebilir, verdiği hasar ortak havuza AYRICA işlenir.
 */
export function bossRoomStage(def: BossDef, stageId = 0): StageDef {
  return {
    id: stageId,
    name: def.name,
    // Az sayıda sürü — boss hemen gelsin ama oda boş da olmasın
    enemyCount: 24,
    firstClearGold: 0,
    spawnRate: 1.2,
    maxAlive: 26,
    enemies: ['bone_thrall', 'grave_knight', 'hulk'],
    hpMul: 6,
    speedMul: 1.2,
    boss: {
      hp: BOSS_ROOM_HP, speed: 52, damage: def.damage,
      radius: def.radius, art: def.art, label: def.name,
    },
  };
}

/** Odadaki boss'un bir koşuluk canı — ortak havuzdan bağımsız */
export const BOSS_ROOM_HP = 220_000;

/** Ortak canın ne kadarı indi (0..1) */
export function bossProgress(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - hp / maxHp));
}
