// THE BINDING — pet sistemi. SAF VERİ + SAF MATEMATİK, DOM YOK.
//
// ⚠️ BU DOSYAYI BACKEND DE İÇE AKTARIYOR (`@game/pets`). Tarayıcıya ait
// hiçbir şey giremez: `window`, `document`, `Image`, `Math.random` — hiçbiri.
// Ekonomi kuralını iki yerde yazmak, er ya da geç iki yerde AYRIŞMAK demek ve
// ayrışan taraf para basar. Tek kaynak burası.
//
// ⚠️ GÖRSEL BİLGİ BURADA YOK. Hangi sprite'ın çizileceği `sprites.ts`in işi
// (`PET_ART`). Buradaki `art` alanı yalnızca bir ANAHTAR — bu dosya onun bir
// dosya yolu mu satır numarası mı olduğunu bilmez ve bilmemeli.
//
// ── KURGU ────────────────────────────────────────────────────────────
// Diskteki her sprite zaten bir düşman. Pet'i düşman görseliyle çizmek
// normalde okunabilirlik hatası olurdu ("bu düşman mı, dostum mu?"). Çözüm
// boss'larda kullanılanın aynısı: KURGUYU VARLIĞA UYDUR. Oyunun adı
// GRAVEBORN ve oyuncu ölüleri bağlıyor — pet, öldürdüğün ve ruhunu bağladığın
// düşmandır. Karışıklık artık kusur değil, oyunun anlattığı şey.

import type { Rarity } from './cosmetics';

/**
 * ROL = KİMLİK, NADİRLİK = TAVAN.
 *
 * ⚠️ BU AYRIM KASITLI. Rol nadirliğe bağlansaydı (örn. "iyileştirici pet
 * yalnızca legendary olur") iyileştirme parası olanın ayrıcalığı olurdu.
 * Her rol common/rare kademesinde DE mevcut; nadirlik yalnızca o rolün ne
 * kadar ileri götürülebileceğini belirler.
 */
export type PetRole =
  /** en yakın düşmana tek hedef vurur */
  | 'striker'
  /** daha uzun beklemeyle alan patlaması */
  | 'channeler'
  /** periyodik olarak oyuncuyu iyileştirir */
  | 'warden'
  /** savaşmaz — mıknatıs ve gold bulma verir */
  | 'forager';

export interface PetDef {
  id: string;
  name: string;
  /** `sprites.ts` PET_ART anahtarı — bu dosya içeriğini bilmez */
  art: string;
  role: PetRole;
  rarity: Rarity;
  /** hangi düşmanı öldürerek bağlanır (config.ts EnemyType.id) */
  bindsFrom: string;
  blurb: string;
}

/**
 * NADİRLİK → SEVİYE TAVANI.
 *
 * ⚠️ MYTHIC BURADA YOK ve olmamalı: `cosmetics.ts`teki `Rarity` sözlüğü
 * dört kademe (common/rare/epic/legendary) ve oyunun her yeri onu kullanıyor.
 * Beşinci bir kelimeyi tip sistemine sokmak Reliquary, gear ve gacha'yı da
 * ilgilendirirdi. Mythic bir NADİRLİK DEĞİL, bir DURUM: füzyondan geçmiş
 * legendary. `isMythic` ile taşınıyor (bkz. `petCap`).
 */
export const PET_CAP: Record<Rarity, number> = {
  common: 10,
  rare: 20,
  epic: 30,
  legendary: 40,
};

/** Füzyondan geçmiş legendary'nin tavanı — tek yerde durmalı */
export const MYTHIC_CAP = 50;

/** Füzyon için gereken toplam bağlama sayısı (1 asıl + 3 kopya) */
export const FUSE_COPIES = 4;

export function petCap(def: PetDef, mythic: boolean): number {
  return mythic ? MYTHIC_CAP : PET_CAP[def.rarity];
}

// ── ROSTER ────────────────────────────────────────────────────────────
// 12 pet. Kaynak: `public/art/enemies/topdown/` (11 canavar, 80×80 ızgara,
// 15 satır — idle/walk/attack/hit/blast1/blast2/levelup/death hepsi VAR) +
// `undead/spr_Bone_Archer` (tek menzilli tam set).
//
// ⚠️ HER ROL COMMON YA DA RARE KADEMESİNDE MEVCUT. Yeni oyuncu dört oyun
// tarzının dördünü de deneyebilmeli; "iyileştiriciyi görmek için legendary
// bekle" demek, sistemin yarısını ödeme duvarının arkasına koymak olurdu.
export const PETS: readonly PetDef[] = [
  // common — dördün üçü burada, giriş kademesi geniş tutuldu
  { id: 'imp', name: 'Bound Imp', art: 'pet_imp', role: 'striker', rarity: 'common', bindsFrom: 'imp', blurb: 'Small, spiteful, and quick to bite.' },
  { id: 'wretch', name: 'Bound Wretch', art: 'pet_wretch', role: 'forager', rarity: 'common', bindsFrom: 'wretch', blurb: 'It still remembers where the coins fell.' },
  // ⚠️ `bindsFrom` SPRITE ADI DEĞİL DÜŞMAN ID'Sİ. Bu bir kez karıştı: görsel
  // `mon_slim` ama onu kullanan düşmanın id'si `husk`. Test yakaladı.
  { id: 'slim', name: 'Bound Husk', art: 'pet_slim', role: 'warden', rarity: 'common', bindsFrom: 'husk', blurb: 'It splits when struck. Now it splits for you.' },

  // rare
  { id: 'rogue', name: 'Bound Rogue', art: 'pet_rogue', role: 'striker', rarity: 'rare', bindsFrom: 'rogue', blurb: 'Died mid-lunge. Still lunging.' },
  { id: 'bird', name: 'Bound Carrion', art: 'pet_bird', role: 'forager', rarity: 'rare', bindsFrom: 'bird', blurb: 'Circles the dead and brings back what shines.' },
  { id: 'horned', name: 'Bound Horned', art: 'pet_horned', role: 'channeler', rarity: 'rare', bindsFrom: 'horned', blurb: 'The horns were always antennae.' },

  // epic
  { id: 'crab', name: 'Bound Carapace', art: 'pet_crab', role: 'warden', rarity: 'epic', bindsFrom: 'crab', blurb: 'Its shell outlived it. Now it lends the shell.' },
  { id: 'fiend', name: 'Bound Fiend', art: 'pet_fiend', role: 'channeler', rarity: 'epic', bindsFrom: 'fiend', blurb: 'Burns without asking what it burns.' },
  { id: 'archer', name: 'Bound Archer', art: 'pet_archer', role: 'striker', rarity: 'epic', bindsFrom: 'bone_archer', blurb: 'No eyes left, and it still does not miss.' },

  // legendary — füzyonla MYTHIC olabilecek üç pet
  { id: 'brute', name: 'Bound Brute', art: 'pet_brute', role: 'striker', rarity: 'legendary', bindsFrom: 'brute', blurb: 'It broke the gate once. It remembers how.' },
  { id: 'warrior', name: 'Bound Warrior', art: 'pet_warrior', role: 'warden', rarity: 'legendary', bindsFrom: 'warrior', blurb: 'Guards you out of habit, not loyalty.' },
  { id: 'hulk', name: 'Bound Hulk', art: 'pet_hulk', role: 'channeler', rarity: 'legendary', bindsFrom: 'hulk', blurb: 'Something this large should not be this quiet.' },
] as const;

export function petById(id: string): PetDef | undefined {
  return PETS.find((p) => p.id === id);
}

// ── BAĞLAMA: PARAYLA ALINAMAZ ─────────────────────────────────────────
//
// ⚠️ EKONOMİNİN EN ÖNEMLİ KARARI BURADA. Bir pet'i açmak için o düşman
// tipinden yeterince ÖLDÜRMÜŞ olmak gerekiyor — gold tek başına YETMEZ.
// Sebebi: pet güç veriyor ve gold satın alınabiliyor. Yalnızca gold isteseydi
// balina 12 pet'i açılışta alır, koleksiyon anlamını yitirir ve derinlik
// duvarı parayla aşılırdı.
//
// ⚠️ Tersi de doğru: yalnızca kill isteseydi gold'a talep doğmazdı. İkisi
// birlikte isteniyor — biri oynamayı, diğeri ekonomiyi ayakta tutuyor.
export const BIND: Record<Rarity, { kills: number; gold: number }> = {
  common: { kills: 150, gold: 800 },
  rare: { kills: 400, gold: 2_500 },
  epic: { kills: 900, gold: 8_000 },
  legendary: { kills: 2_000, gold: 25_000 },
};

/**
 * Füzyon bedeli. ⚠️ Kopyalar BAĞLAMADAN gelir, yani her kopya için kill
 * eşiğini yeniden doldurmak gerekir. Mythic satın ALINAMAZ — gold burada
 * yalnızca ikinci koşul.
 */
export const FUSE_GOLD = 60_000;

/** Bir pet daha bağlanabilir mi? (hem kill hem gold koşulu) */
export function canBind(
  def: PetDef,
  kills: number,
  gold: number,
  ownedCount: number,
): { ok: boolean; reason?: string } {
  // Füzyon için gerekenden fazlası ölü yatırım olurdu — durduruyoruz
  if (ownedCount >= FUSE_COPIES) return { ok: false, reason: 'max_copies' };
  const req = BIND[def.rarity];
  // ⚠️ Eşik KOPYA BAŞINA yeniden isteniyor: `kills` toplam öldürme sayısı,
  // gereken ise (sahip olunan + 1) katı. Yoksa 2000 kill bir kez doldurulup
  // dört kopya birden alınır, füzyonun oynanış bedeli sıfırlanırdı.
  const gerekenKill = req.kills * (ownedCount + 1);
  if (kills < gerekenKill) return { ok: false, reason: 'kills' };
  if (gold < req.gold) return { ok: false, reason: 'gold' };
  return { ok: true };
}

/** Bu kopya için gereken toplam kill — UI "1.850 / 2.000" diye gösterecek */
export function bindKillsNeeded(def: PetDef, ownedCount: number): number {
  return BIND[def.rarity].kills * (ownedCount + 1);
}

// ── YÜKSELTME: SONLU GOLD SİNKİ ───────────────────────────────────────
//
// ⚠️ KIRMIZI ÇİZGİ — BU AĞAÇ SONLU KALMALI. Pet güç veriyor; gold → güç bağı
// ancak TAVANI varsa kabul edilebilir. Tavansız olsaydı balina sınırsız güç
// satın alır ve "skill puanları parayla alınamaz" duruşu anlamsızlaşırdı.
// Sonsuz gold sinki OSSUARY olarak kalıyor (bkz. ossuary.ts) — orası güç
// değil prestij satıyor ve tam da bu yüzden tavansız olabiliyor.
export const PET_COST = {
  /** nadirliğe göre ilk seviyenin fiyatı */
  base: { common: 60, rare: 110, epic: 200, legendary: 340 } as Record<Rarity, number>,
  /** her seviyede fiyat çarpanı — Forge'un `growth` deseninin aynısı */
  growth: 1.13,
} as const;

/** Bir sonraki seviyenin maliyeti (level = şu anki seviye, 0 = yeni bağlanmış) */
export function petLevelCost(def: PetDef, level: number, mythic = false): number {
  if (level >= petCap(def, mythic)) return Infinity;
  return Math.round(PET_COST.base[def.rarity] * Math.pow(PET_COST.growth, level));
}

/** Bu pet'e şimdiye kadar gömülen gold — kartta "ne yatırdım" sorusu */
export function petSpent(def: PetDef, level: number, mythic = false): number {
  let s = 0;
  const cap = petCap(def, mythic);
  for (let i = 0; i < Math.min(level, cap); i++) s += petLevelCost(def, i, mythic);
  return s;
}

/** Bir pet'i tavanına çıkarmanın toplam maliyeti */
export function petTotalCost(def: PetDef, mythic = false): number {
  return petSpent(def, petCap(def, mythic), mythic);
}

/** Tüm koleksiyonu (füzyonsuz) tavana çıkarmanın maliyeti — denge testi kullanır */
export function collectionTotalCost(): number {
  return PETS.reduce((s, p) => s + petTotalCost(p, false), 0);
}

// ── ETKİ ──────────────────────────────────────────────────────────────
//
// ⚠️ HASAR ORAN OLARAK VERİLİYOR, SABİT SAYI OLARAK DEĞİL. Sabit hasar
// yazmak, pet'i erken oyunda ezici geç oyunda görünmez yapardı — oyuncunun
// kendi hasarı derinlikle büyüyor, pet'inki büyümezdi. Oran hem otomatik
// ölçekleniyor hem de tavanı açıkça okunabilir kılıyor: en fazla ne kadarını
// pet yapıyor, tek bakışta görülüyor.
//
// 🔴 İLK SAYILAR ÖLÇÜLDÜ VE ÇOK YÜKSEKTİ — yazılıyor ki geri konmasın:
//   mythic striker  → oyuncu hasarının **%121'i** (pet oyuncuyu geçiyordu)
//   legendary channeler → **%112**
// Pet yoldaş olmalı, oyuncunun yerine geçen şey değil. Ayrıca bu güç
// doğrudan kampanya dengesini bozardı: iki yuvalı maxlı oyuncu, denge
// ölçümünün varsaydığı oyuncudan iki kat güçlü olurdu.
//
// ⚠️ TAVAN HEDEFİ: tek maxlı legendary ≈ oyuncu hasarının 1/3'ü, mythic ≈
// yarısı. İki yuva dolu olsa bile toplam katkı oyuncunun kendi hasarının
// altında kalır — pet çarpan değil, destek.
export const ROLE_BASE = {
  striker: { cd: 2.2, share: 0.07, perLevel: 0.0035, radius: 0 },
  // ⚠️ CHANNELER TEK HEDEFTEN DÜŞÜK OLMALI ve öyle: 0,096/sn karşı 0,153/sn.
  // Sebebi patlamanın YARIÇAPTAKİ HERKESE vurması — 400 düşmanlı bir sahnede
  // aynı `share` tek hedefle asla eşdeğer değil. İlk sayı (0,15 + 0,0055)
  // bunu hesaba katmıyordu ve legendary'de oyuncunun %59'unu her düşmana
  // basıyordu.
  channeler: { cd: 5.0, share: 0.12, perLevel: 0.0045, radius: 96 },
  /** warden'da `share` maxHp'nin yüzdesi — hasar değil iyileşme */
  warden: { cd: 8.0, share: 0.03, perLevel: 0.0012, radius: 0 },
  /**
   * forager savaşmaz; `share` GREED artışı, `radius` mıknatıs artışı.
   *
   * ⚠️ GREED SUNUCUYU DA İLGİLENDİRİYOR. `backend/src/reward.ts` nadir gold
   * tavanını oyuncunun GERÇEK greed'ine göre kuruyor (sabit global tavan
   * yalancıya dürüstün 2,1 katını veriyordu — o hata bir kez yaşandı).
   * Pet greed'i oraya EKLENMEZSE dürüst oyuncu haksız yere kırpılır.
   */
  forager: { cd: 0, share: 0.03, perLevel: 0.0015, radius: 18 },
} as const;

/**
 * Nadirlik gücü çarpanı.
 *
 * ⚠️ Seviye tavanıyla BİRLİKTE çalışıyor, onun yerine değil: legendary hem
 * daha çok seviye alıyor hem her seviyesi daha değerli. İkisi çarpıldığında
 * common tavan ile mythic tavan arası ~4,8 kat — belirgin ama ezici değil.
 */
export const RARITY_POWER: Record<Rarity, number> = {
  common: 1.0,
  rare: 1.15,
  epic: 1.35,
  legendary: 1.6,
};

/**
 * Füzyondan geçmişin ek çarpanı — mythic'i legendary'den ayıran şey.
 *
 * 🔴 1,9 İDİ ve ÖLÇÜLDÜ: 10 fazla seviyeyle birleşince mythic striker
 * oyuncunun hasarının %121'ine çıkıyordu. Çarpan tek başına masum görünüyor;
 * asıl sorun SEVİYE TAVANIYLA ÇARPILMASI. 1,25'te mythic, legendary tavanının
 * ~1,45 katı oluyor — füzyon hâlâ hissedilir bir sıçrama ama pet oyuncunun
 * önüne geçmiyor.
 */
export const MYTHIC_POWER = 1.25;

export interface PetEffect {
  role: PetRole;
  /** saldırı/iyileşme beklemesi, saniye (forager'da 0) */
  cd: number;
  /** rolün ana değeri — striker/channeler'da hasar oranı, warden'da can oranı, forager'da gold oranı */
  share: number;
  /** channeler patlama yarıçapı · forager mıknatıs artışı */
  radius: number;
}

/**
 * Pet'in koşudaki nihai etkisi. ⚠️ SAF FONKSİYON — aynı girdi her zaman aynı
 * çıktı. Motor bunu her karede çağırmıyor (koşu başında bir kez çözülüyor)
 * ama saf olması determinizmin ön koşulu.
 */
export function petEffect(def: PetDef, level: number, mythic = false): PetEffect {
  const b = ROLE_BASE[def.role];
  const cap = petCap(def, mythic);
  const lv = Math.max(0, Math.min(Math.floor(level), cap));
  const guc = RARITY_POWER[def.rarity] * (mythic ? MYTHIC_POWER : 1);
  return {
    role: def.role,
    cd: b.cd,
    share: (b.share + b.perLevel * lv) * guc,
    // ⚠️ YARIÇAP BÜYÜMESİ 0,02'den 0,01'e İNDİRİLDİ. Alan yarıçapla KARESEL
    // büyüyor: 0,02 ile lv40'ta 1,8 kat yarıçap = 3,2 kat alan demekti ve
    // `share` düşürülse bile toplam etki yine patlıyordu. Yarıçap sessiz bir
    // çarpan; `share` kadar dikkat ister.
    radius: b.radius > 0 ? b.radius * (1 + lv * 0.01) * (mythic ? 1.15 : 1) : 0,
  };
}

// ── İKİNCİ YUVA ───────────────────────────────────────────────────────
//
// ⚠️ ÜÇÜNCÜ YUVA YOK ve eklenmemeli. Sebep denge ölçümü: güç tavanı taşınan
// pet sayısıyla doğrudan çarpılıyor ve 25 bölümün tamamı (7 seed × ~1 saat)
// yeniden ölçülmek zorunda kalır. İki yuva bunu yapmadan da yeterli çeşitlilik
// veriyor: bir vuran + bir destek.
export const SLOT2 = {
  /** açılması için ulaşılmış olması gereken derinlik */
  depth: 25,
  gold: 40_000,
} as const;

export function slot2Unlockable(deepestDepth: number, gold: number): boolean {
  return deepestDepth >= SLOT2.depth && gold >= SLOT2.gold;
}
