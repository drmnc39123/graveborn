// EKİPMAN — YATAY ilerleme.
//
// Forge DİKEY: gold'la satın alınır, herkesin ağacı aynıdır, kaybedilmez ve
// bir gün dolar. Ekipman YATAY: bulunur, satın alınmaz, herkesinki farklıdır
// ve doldurulacak bir şey değildir — çünkü "daha iyi" diye bir yön yok.
//
// ⚠️ TEMEL FİKİR: HER PARÇA BİR TAKAS. Nadir bir parça sadece daha güçlü
// değil, aynı zamanda daha PAHALI: 3. kademeden itibaren her parçanın bir
// LANETİ var. "+%30 hasar ama −%18 can" bir yükseltme değil bir karardır —
// oyuncu hangi bedeli kaldırabileceğini kendi build'ine göre seçer. Laneti
// olmayan bir nadirlik sistemi, sayıları büyüten ikinci bir Forge olurdu.
//
// ⚠️ GÜÇ TAVANI DERİNLİKLE BÜYÜMEZ. Derinlik yalnızca NADİRLİK dağılımını
// kaydırır; bütçe tablosu sabittir. Bütçeyi derinlikle çarpsaydık ekipman
// sonsuz güç olurdu ve tekrar dikey ilerlemeye dönerdi. Tavan kapalı:
// 5 yuva × en yüksek bütçe. Başka hiçbir yerden büyümüyor.
//
// ⚠️ `greed` EKİPMANDA YASAK. Sunucunun nadir-düşüş tavanı (`greedCeiling`)
// oyuncunun greed'ini bilmek zorunda; ekipmandan greed gelseydi ya tavan
// ekipmanı okumak zorunda kalır ya da dürüst oyuncu sessizce kırpılırdı.
// Ayrıca "ekipman farmla → daha çok gold → daha çok ekipman" sarmalı kurardı.
//
// ⚠️ SAF VERİ. DOM yok, `Math.random()` yok — sunucu AYNI dosyayı okuyup
// düşüşü kendisi hesaplıyor. İstemcinin gösterdiği parça bir önizleme;
// yetkili olan sunucunun aynı seed'le ürettiği parçadır.

import type { StatKey } from './config';
import { createRng } from './rng';

// ── YUVALAR ───────────────────────────────────────────────────────────
// Beş yuva, beş AYRI karakter. Yuvaların bonus havuzları kasıtlı olarak
// ayrık: hepsi aynı istatistikleri verseydi "yuva" diye bir şey olmaz,
// 5 tane genel slot olurdu.

export type GearSlot = 'skull' | 'shroud' | 'grasp' | 'tread' | 'sigil';

export const GEAR_SLOTS: readonly GearSlot[] = [
  'skull', 'shroud', 'grasp', 'tread', 'sigil',
] as const;

export const SLOT_NAME: Record<GearSlot, string> = {
  skull: 'Skull',
  shroud: 'Shroud',
  grasp: 'Grasp',
  tread: 'Tread',
  sigil: 'Sigil',
};

/** Yuvanın ne işe yaradığı — arayüz boş yuvada bunu gösterir */
export const SLOT_BLURB: Record<GearSlot, string> = {
  skull: 'What you notice',
  shroud: 'What you survive',
  grasp: 'What you strike with',
  tread: 'How you move',
  sigil: 'What you are willing to risk',
};

// ── NADİRLİK ──────────────────────────────────────────────────────────
// ⚠️ MOR YOK. Oyun paletinde mor hiç yok ve nadirlik merdiveni bunun en
// kolay sızma noktası — "epic mordur" alışkanlığı. Basamaklar palete
// oturtuldu: kemik → çürük yeşili → buz → kan → mum.

export interface RarityDef {
  tier: number;
  name: string;
  /** tema rengi — `lib/theme`'deki C.* değerleri */
  color: string;
  /** olumlu ek sayısı */
  boons: number;
  /** lanet sayısı */
  banes: number;
  /** olumlu eklere dağıtılacak toplam güç puanı */
  budget: number;
  /** lanet BAŞINA güç puanı */
  banePoints: number;
  /** parçalayınca çıkan toz */
  salvage: number;
}

/**
 * ⚠️ İKİ MERDİVEN AYNI ANDA TIRMANMALI: HAM güç ve NET güç.
 *
 * Ham (`budget`) hızlı büyür — üst kademeler UÇLARDA yaşasın, sayılar
 * çarpıcı olsun diye. Net (`budget − banes × banePoints`) yavaş büyür ama
 * MONOTON büyümek ZORUNDA.
 *
 * İlk tabloda değildi ve ölçüldü: Graveborn net 2,80, Cursed net 3,30 —
 * yani en üst kademe bir alttakinden zayıftı. O bir seçim değil TUZAKTIR;
 * oyuncu en nadir parçayı bulup oynamamayı öğrenirdi. `gear.test.mts`
 * artık monotonluğu doğruluyor, elle kontrole bırakılmıyor.
 *
 * Net merdiven: 1,0 → 2,0 → 2,6 → 3,8 → 4,2
 * Ham merdiven: 1,0 → 2,0 → 3,6 → 5,4 → 8,0
 */
export const RARITIES: readonly RarityDef[] = [
  { tier: 1, name: 'Worn', color: '#b8ae98', boons: 1, banes: 0, budget: 1.0, banePoints: 0, salvage: 2 },
  { tier: 2, name: 'Kept', color: '#5f9e4a', boons: 2, banes: 0, budget: 2.0, banePoints: 0, salvage: 5 },
  // ⚠️ LANET 3. KADEMEDE BAŞLIYOR ve bu tasarımın kalbi. İlk iki kademe
  // bedelsiz ki oyuncu sistemi laneti anlamadan öğrensin; asıl kararlar
  // buradan sonra başlıyor.
  { tier: 3, name: 'Marked', color: '#8a97a3', boons: 2, banes: 1, budget: 3.6, banePoints: 1.0, salvage: 12 },
  { tier: 4, name: 'Cursed', color: '#a01226', boons: 3, banes: 1, budget: 5.4, banePoints: 1.6, salvage: 30 },
  { tier: 5, name: 'Graveborn', color: '#efa72e', boons: 3, banes: 2, budget: 8.0, banePoints: 1.9, salvage: 75 },
] as const;

/** Bir kademenin lanetler DÜŞÜLDÜKTEN sonraki güç puanı */
export function netBudget(r: RarityDef): number {
  return r.budget - r.banes * r.banePoints;
}

export function rarityOf(tier: number): RarityDef {
  return RARITIES[Math.max(0, Math.min(RARITIES.length - 1, Math.floor(tier) - 1))];
}

/**
 * TOPLAM GÜÇ TAVANI — kapalı ve ölçülebilir.
 *
 * Bu sayılar testte doğrulanıyor: ekipmanın verebileceği en yüksek toplam
 * budur ve derinlik, süre, oyuncu sayısı hiçbiri onu büyütmez.
 *
 * Dengeye giren sayı NET olan: 5 yuva da mükemmel Graveborn olsa bile
 * oyuncunun eline geçen net güç bu.
 */
export const MAX_GEAR_BUDGET = GEAR_SLOTS.length * RARITIES[RARITIES.length - 1].budget;
export const MAX_GEAR_NET = GEAR_SLOTS.length * netBudget(RARITIES[RARITIES.length - 1]);

// ── EKLER ─────────────────────────────────────────────────────────────

/**
 * 1 güç puanının kaç birim istatistik ettiği.
 *
 * ⚠️ DEĞERLER FORGE'A GÖRE KALİBRE. Örnek: `might` 0,05/puan; en yüksek
 * kademede tek bir parça 6 puanı tamamen hasara verse +%30 eder — Forge'un
 * tam `might` satırının (%100) üçte biri. Ekipman Forge'u GÖLGELEMEMELİ,
 * ona başka bir eksende eşlik etmeli.
 *
 * ⚠️ `greed` BU TABLODA YOK ve olmamalı (bkz. dosya başlığı).
 */
const PER_POINT: Partial<Record<StatKey, number>> = {
  might: 0.05,
  armor: 0.8,
  maxHp: 0.07,
  recovery: 0.12,
  cooldown: 0.025,
  area: 0.05,
  projSpeed: 0.06,
  duration: 0.06,
  // ⚠️ Mermi sayısı istatistiklerin en güçlüsü — pahalı olmak ZORUNDA.
  // 3 puan = +1 mermi, yani en yüksek kademede bir parça ancak 2 tane verir.
  amount: 0.34,
  moveSpeed: 0.03,
  magnet: 0.12,
  growth: 0.05,
  crit: 0.035,
  critMul: 0.14,
  curse: 0.07,
  revival: 0.5,
};

/**
 * TAM SAYI OLMAK ZORUNDA OLAN İSTATİSTİKLER.
 *
 * ⚠️ BU LİSTE BİR HATADAN DOĞDU. Ekipman önce ham kesirli değer veriyordu ve
 * ekranda "+0,34 projectiles" yazıyordu. Motorda bunun karşılığı TUTARSIZ:
 * `wCount()` bazı silahlarda döngü sınırı olarak kullanılıyor (`i < 1.34`
 * iki kez döner, yani TAM bir mermi fazladan) bazılarında eşik olarak
 * (`wCount >= 2` → 1,34 yetmez, HİÇBİR ŞEY). Yani aynı ek, silaha göre ya
 * bedava bir mermi ya da ölü bir satır oluyordu — ve oyuncu hangisi olduğunu
 * bilemezdi.
 *
 * Çözüm: bu istatistikler AŞAĞI yuvarlanır (yukarı yuvarlamak bütçeyi
 * aşardı); 0'a düşerse o ek hiç seçilmez, bütçe başka bir istatistiğe gider.
 * Böylece "+1 projectile" gerçekten nadir ve gerçekten tam bir mermi.
 */
const TAM_SAYI: ReadonlySet<StatKey> = new Set<StatKey>(['amount', 'revival', 'armor']);

/** Yuva başına olumlu ek havuzu — yuvaları birbirinden AYIRAN şey bu */
const BOON_POOL: Record<GearSlot, readonly StatKey[]> = {
  skull: ['growth', 'crit', 'critMul', 'magnet'],
  shroud: ['maxHp', 'armor', 'recovery'],
  grasp: ['might', 'amount', 'projSpeed'],
  tread: ['moveSpeed', 'cooldown', 'duration'],
  // ⚠️ Sigil kumar yuvası: `curse` düşmanları hem sertleştirir hem
  // zenginleştirir, `revival` bir hayat satın alır. İkisi de "ne kadar
  // riske girersin" sorusunu soruyor — yuvanın adı bu yüzden Sigil.
  sigil: ['curse', 'area', 'revival', 'might'],
};

/**
 * Lanet havuzu.
 *
 * ⚠️ ÜÇ İSTATİSTİK BİLEREK DIŞARIDA: `amount` (taban 0 — eksiye inince
 * silahlar mermi üretemez), `revival` (taban 0 — eksi diriliş anlamsız) ve
 * `recovery` (taban 0 — eksi yenilenme sessiz bir zehir olurdu, oyuncu
 * neden öldüğünü anlamaz). Bir lanet ACI VERMELİ ama OKUNAKLI olmalı.
 */
const BANE_POOL: readonly StatKey[] = [
  'might', 'maxHp', 'armor', 'moveSpeed', 'cooldown', 'area', 'growth', 'crit', 'magnet',
];

export interface Affix {
  stat: StatKey;
  /**
   * MOTORA GİDEN HAM DEĞER — işareti dahil.
   *
   * ⚠️ `cooldown` TERS: motorda küçük olan iyi (`permanentBonus` da onu eksi
   * yazıyor). Değeri burada ham tutup iyi/kötü ayrımını ayrı bir alana
   * koymak kasıtlı — okuma anında hiçbir yerde işaret çevirmek gerekmiyor.
   * Ters çevirmeyi arayüze bırakmak, er ya da geç bir yerde unutulurdu.
   */
  value: number;
  /** olumlu mu lanet mi — rengi ve okunuşu bundan gelir, `value`nin işaretinden DEĞİL */
  kind: 'boon' | 'bane';
}

export interface GearItem {
  /** kararlı kimlik — sunucuda satır anahtarı */
  id: string;
  slot: GearSlot;
  rarity: number;
  affixes: Affix[];
  /** hangi derinlikte düştü — parçanın hikâyesi, dengeye etkisi YOK */
  depth: number;
}

// ── DÜŞÜŞ ─────────────────────────────────────────────────────────────

export const GEAR = {
  /** kaç derinlikte bir parça düşer — boss derinlikleriyle aynı ritim */
  everyDepths: 5,
  /** bir koşudan çıkabilecek en fazla parça — sunucu tavanı da bunu kullanır */
  maxPerRun: 8,
  /** ekipman çantası tavanı; dolunca parçalamak ZORUNLU (karar üretsin diye) */
  vaultSize: 60,
} as const;

/**
 * Derinliğe göre nadirlik ağırlıkları.
 *
 * ⚠️ TAVAN DEĞİL DAĞILIM KAYIYOR. Derin inen oyuncu daha İYİ parça değil,
 * daha SIK iyi parça görüyor. 1. derinlikte de Graveborn düşebilir (%0,5) —
 * bu bilinçli: yeni oyuncunun da bir mucizesi olsun.
 */
export function rarityWeights(depth: number): number[] {
  const t = Math.max(0, Math.min(1, depth / 60));
  const lerp = (a: number, b: number) => a * (1 - t) + b * t;
  return [
    lerp(60, 5),
    lerp(28, 18),
    lerp(9, 34),
    lerp(2.5, 28),
    lerp(0.5, 15),
  ];
}

/**
 * Tek bir parça üret — TAMAMEN DETERMİNİSTİK.
 *
 * ⚠️ `seed` SUNUCUDAN GELEN koşu seed'i, `index` de kaçıncı düşüş olduğu.
 * Sunucu koşu kapanışında aynı çağrıyı yapıp aynı parçayı üretiyor; istemci
 * hiçbir zaman "bende Graveborn çıktı" DEMİYOR, sadece gösteriyor. Gold
 * tarafındaki kuralın aynısı.
 */
export function rollGear(seed: number, depth: number, index: number): GearItem {
  // Her düşüş kendi akışını kullanıyor: koşunun rng'sine dokunmuyor ve
  // düşüşlerin sırası birbirini kaydırmıyor.
  const rng = createRng((seed ^ (index * 0x9e3779b1) ^ (depth * 0x85ebca6b)) >>> 0);

  const slot = rng.pick(GEAR_SLOTS);

  // Ağırlıklı nadirlik seçimi
  const w = rarityWeights(depth);
  const toplam = w.reduce((s, v) => s + v, 0);
  let atis = rng.next() * toplam;
  let tier = 1;
  for (let i = 0; i < w.length; i++) {
    atis -= w[i];
    if (atis <= 0) { tier = i + 1; break; }
  }
  const r = rarityOf(tier);

  const affixes: Affix[] = [];

  // ── OLUMLU EKLER ──
  // Havuzdan tekrarsız seç: aynı parçada iki `might` satırı, tek satırın
  // büyüğüyle aynı şey olurdu — çeşitlilik yanılsaması.
  const havuz = rng.shuffle([...BOON_POOL[slot]]);
  const kacBoon = Math.min(r.boons, havuz.length);
  const paylar = bolustur(rng, r.budget, kacBoon);
  // ⚠️ Havuz sırayla taranıyor, `havuz[i]` DEĞİL. Tam sayı istatistikleri
  // paylarına sığmayabiliyor (bkz. TAM_SAYI); sığmayanı atlayıp sıradakine
  // geçmek, o payın ölü bir satıra harcanmasını önlüyor.
  let sonraki = 0;
  for (let i = 0; i < kacBoon; i++) {
    while (sonraki < havuz.length) {
      const stat = havuz[sonraki++];
      const per = PER_POINT[stat] ?? 0;
      // cooldown'da İYİ olan EKSİ — motor öyle okuyor
      const isaret = stat === 'cooldown' ? -1 : 1;
      const ham = paylar[i] * per;
      // ⚠️ AŞAĞI yuvarla: yukarı yuvarlamak bütçeyi aşardı ve "hiçbir parça
      // kendi bütçesini aşmıyor" garantisini bozardı.
      const m = TAM_SAYI.has(stat) ? Math.floor(ham) : ham;
      if (m <= 0) continue;   // bu paya sığmıyor — sıradaki istatistiğe geç
      affixes.push({ stat, value: yuvarla(m * isaret), kind: 'boon' });
      break;
    }
  }

  // ── LANETLER ──
  // ⚠️ Lanet, parçanın KENDİ bonuslarından SEÇİLMEZ. Seçilseydi "+%20 hasar,
  // −%20 hasar" gibi kendini götüren, yani hiçbir karar doğurmayan parçalar
  // çıkardı. Lanet başka bir eksende acıtmalı.
  const kullanilan = new Set(affixes.map((a) => a.stat));
  const laneHavuz = rng.shuffle(BANE_POOL.filter((s) => !kullanilan.has(s)));
  let lanetKalan = r.banes;
  for (const stat of laneHavuz) {
    if (lanetKalan <= 0) break;
    const per = PER_POINT[stat] ?? 0;
    const ham = r.banePoints * per;
    // Lanette de tam sayı kuralı geçerli: "−0,8 armor" hem okunmaz hem
    // motorun tam sayı beklediği bir alanı kirletir.
    const m = TAM_SAYI.has(stat) ? Math.floor(ham) : ham;
    if (m <= 0) continue;
    // cooldown'da KÖTÜ olan ARTI — iyi olanın tersi
    const isaret = stat === 'cooldown' ? 1 : -1;
    affixes.push({ stat, value: yuvarla(m * isaret), kind: 'bane' });
    lanetKalan--;
  }

  return {
    id: `${seed >>> 0}-${depth}-${index}`,
    slot,
    rarity: tier,
    affixes,
    depth,
  };
}

/**
 * Bir koşunun TÜM düşüşleri — sunucu da bunu çağırır.
 *
 * ⚠️ `deepestCleared` SUNUCUNUN KABUL ETTİĞİ derinlik olmalı, istemcinin
 * iddiası değil. Kırpılmış bir koşuya ekipman ödemek, kırpmanın anlamını
 * ortadan kaldırırdı.
 */
export function rollRunGear(seed: number, deepestCleared: number): GearItem[] {
  const adet = Math.min(
    Math.floor(Math.max(0, deepestCleared) / GEAR.everyDepths),
    GEAR.maxPerRun,
  );
  const out: GearItem[] = [];
  for (let i = 0; i < adet; i++) {
    out.push(rollGear(seed, (i + 1) * GEAR.everyDepths, i));
  }
  return out;
}

// ── MOTORA BAĞLANMA ───────────────────────────────────────────────────

/**
 * Takılı parçaların toplam etkisi.
 *
 * Forge ve tılsımlarla AYNI kanala gidiyor (`mergeBonus` ile birleştirilip
 * motorun `permanent` alanına veriliyor) — yani motor ekipmanı bilmiyor bile.
 * Motorda tek satır değişmediği için determinizm mührü (`SIM_SEAL`) de
 * bozulmuyor.
 */
export function gearBonus(items: readonly GearItem[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const it of items) {
    for (const a of it.affixes) {
      out[a.stat] = yuvarla((out[a.stat] ?? 0) + a.value);
    }
  }
  return out;
}

/**
 * Parçanın harcadığı toplam güç puanı — arayüzdeki tek sayılık "ağırlık".
 *
 * Lanetler DÜŞÜLÜR: oyuncunun görmesi gereken şey ham güç değil NET güç.
 * "6 puanlık bir Graveborn" ile "4,4 puanlık bir Graveborn" arasındaki fark
 * tam olarak lanetin bedelidir.
 */
export function gearScore(it: GearItem): number {
  let s = 0;
  for (const a of it.affixes) {
    const per = PER_POINT[a.stat] ?? 0;
    if (per <= 0) continue;
    const puan = Math.abs(a.value) / per;
    s += a.kind === 'boon' ? puan : -puan;
  }
  return yuvarla(s);
}

/** Parçalayınca çıkan toz — gold DEĞİL (bkz. dosya başlığı) */
export function salvageValue(it: GearItem): number {
  return rarityOf(it.rarity).salvage;
}

// ── OKUNUŞ ────────────────────────────────────────────────────────────

/** Yüzde mi düz sayı mı — arayüz ve testler tek yerden okusun */
const FLAT: ReadonlySet<StatKey> = new Set<StatKey>(['armor', 'amount', 'revival', 'recovery']);

/** "+%12 damage" / "−1 armor" gibi tek satırlık okunuş */
export function affixText(a: Affix): string {
  const isim = STAT_NAME[a.stat] ?? a.stat;
  // ⚠️ İŞARET `kind`'DAN OKUNUR, `value`'dan DEĞİL. cooldown'da iyi olan eksi;
  // ham işareti göstermek oyuncuya "−%8 cooldown kötü" dedirtirdi.
  const art = a.kind === 'boon' ? '+' : '−';
  const m = Math.abs(a.value);
  if (!FLAT.has(a.stat)) return `${art}${Math.round(m * 100)}% ${isim}`;
  // ⚠️ Düz sayılar okunabilir olmalı: `recovery` kesirli kalabiliyor
  // (HP/sn), ham hâliyle "+0.0988 regen" yazıyordu. İki basamak yeter.
  return `${art}${TAM_SAYI.has(a.stat) ? m : Math.round(m * 100) / 100} ${isim}`;
}

export const STAT_NAME: Partial<Record<StatKey, string>> = {
  might: 'damage',
  armor: 'armor',
  maxHp: 'max health',
  recovery: 'regen',
  cooldown: 'cooldown',
  area: 'area',
  projSpeed: 'projectile speed',
  duration: 'duration',
  amount: 'projectiles',
  moveSpeed: 'move speed',
  magnet: 'pickup range',
  growth: 'experience',
  crit: 'crit chance',
  critMul: 'crit damage',
  curse: 'curse',
  revival: 'revivals',
};

// ── YARDIMCILAR ───────────────────────────────────────────────────────

/**
 * Bütçeyi n paya böl — her pay en az %40'lık bir dilim alsın.
 *
 * ⚠️ Düz rastgele bölmek "+%29 hasar, +%0 alan" gibi ikinci satırı ölü olan
 * parçalar üretiyordu. Taban pay, her satırın gerçekten bir şey ifade
 * etmesini garanti ediyor.
 */
function bolustur(rng: { next(): number }, toplam: number, n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [toplam];
  const taban = (toplam / n) * 0.4;
  const kalan = toplam - taban * n;
  const ham = Array.from({ length: n }, () => rng.next());
  const hamToplam = ham.reduce((s, v) => s + v, 0) || 1;
  return ham.map((v) => taban + (v / hamToplam) * kalan);
}

/** Kayan nokta gürültüsünü kes — kayıt/sunucu karşılaştırması için ŞART */
function yuvarla(v: number): number {
  return Math.round(v * 10000) / 10000;
}
