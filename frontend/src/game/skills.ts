// BECERİ AĞACI — yatay ilerlemenin ikinci kolu.
//
// Ekipman "NE BULDUN" sorusunu cevaplıyor. Ağaç "NEYE YATIRIM YAPTIN"
// sorusunu cevaplıyor. İkisi birlikte, iki oyuncunun aynı Forge ağacıyla
// bambaşka oynamasını sağlıyor.
//
// ⚠️ BU ÜÇÜNCÜ BİR FORGE OLMAMALI. Forge'u Forge yapan üç şey var: gold'la
// alınır, her seviye kesin olarak daha iyidir, ve bir gün DOLAR. Ağaç
// üçünü de kırıyor:
//
//   1. PUAN SATIN ALINMAZ, OYNANARAK KAZANILIR. Para birimi YOK — puan,
//      sunucunun zaten doğruladığı derinlik rekorundan TÜRETİLİYOR
//      (`skillPoints`). Yeni bir musluk açılmıyor, yeni bir alan bile
//      gerekmiyor: kazanç tarafı saf bir fonksiyon.
//   2. HER DÜĞÜM BİR SEÇİM. Çatallar birbirini KİLİTLİYOR (`excludes`) ve
//      zirve düğümlerinden TOPLAM BİR TANE alınabiliyor. Yani iki oyuncunun
//      ağacı birbirine benzemek zorunda değil.
//   3. AĞAÇ ASLA DOLMUYOR. En derin oyuncu bile toplam maliyetin küçük bir
//      kısmını karşılayabiliyor — bu bir denge ayarı değil, testle korunan
//      YAPISAL bir garanti (bkz. skills.test.mts).
//
// ⚠️ ZİRVE DÜĞÜMLERİNİN BEDELİ VAR. Ekipmandaki lanet mantığının aynısı:
// bedelsiz bir zirve, sadece "en güçlü olanı seç" demek olurdu ve seçim
// diye bir şey kalmazdı.
//
// ⚠️ `greed` AĞAÇTA YASAK — ekipmandaki gerekçenin aynısı: sunucunun
// nadir-düşüş tavanı (`greedCeiling`) ağacı bilmiyor.
//
// ⚠️ SAF VERİ. DOM yok, `Math.random()` yok; sunucu AYNI `sanitizeSkills`
// fonksiyonunu çağırıyor. İki yerde iki kural yazmak, er ya da geç ayrışmak
// demek — ve ayrışan taraf bedava güç dağıtır.

import type { StatKey } from './config';

// ── PUAN ──────────────────────────────────────────────────────────────

export const SKILLS = {
  /** kaç derinlikte bir puan — boss ritmiyle aynı */
  everyDepths: 5,
  /** kazanılabilecek en yüksek puan (derinlik 120'de dolar) */
  maxPoints: 24,
  /**
   * Dağılımı bozmanın gold bedeli, harcanan puan başına.
   *
   * ⚠️ BU BİR SİNK VE GÜÇ SATMIYOR. Oyuncu zaten sahip olduğu gücü yeniden
   * diziyor; bedel, kararın bir ağırlığı olsun diye. Ekonomi tarafında da
   * tam istenen şey: sonsuz tekrarlanabilir, hiçbir şey üretmeyen bir gold
   * çıkışı.
   */
  respecPerPoint: 250,
  /** aynı anda etkin olabilecek zirve düğümü sayısı */
  maxCapstones: 1,
} as const;

/**
 * Oyuncunun HAK ETTİĞİ puan.
 *
 * ⚠️ SUNUCUNUN DOĞRULADIĞI DERİNLİKTEN türüyor (`depthPaid` → `paidDepth`),
 * iddia edilenden değil. Böylece puan için ayrı bir kazanç yolu, ayrı bir
 * doğrulama ve ayrı bir açık yüzeyi doğmuyor: derinlik zaten süre tabanına
 * kırpılıyor, puan da onun arkasından geliyor.
 */
export function skillPoints(deepestDepth: number): number {
  const d = Math.max(0, Math.floor(deepestDepth));
  return Math.min(SKILLS.maxPoints, Math.floor(d / SKILLS.everyDepths));
}

/** Bir sonraki puana kaç derinlik kaldı (dolduysa null) */
export function nextPointAt(deepestDepth: number): number | null {
  if (skillPoints(deepestDepth) >= SKILLS.maxPoints) return null;
  const d = Math.max(0, Math.floor(deepestDepth));
  return (Math.floor(d / SKILLS.everyDepths) + 1) * SKILLS.everyDepths;
}

// ── AĞAÇ ──────────────────────────────────────────────────────────────

export type SkillBranch = 'blade' | 'bulwark' | 'quickening' | 'covenant';

export const BRANCHES: readonly { id: SkillBranch; name: string; blurb: string; color: string }[] = [
  { id: 'blade', name: 'The Blade', blurb: 'Hit harder, hit more', color: '#a01226' },
  { id: 'bulwark', name: 'The Bulwark', blurb: 'Refuse to fall', color: '#8a97a3' },
  { id: 'quickening', name: 'The Quickening', blurb: 'Act more often', color: '#5f9e4a' },
  { id: 'covenant', name: 'The Covenant', blurb: 'Trade safety for power', color: '#efa72e' },
] as const;

export interface SkillNode {
  id: string;
  branch: SkillBranch;
  name: string;
  /** 1 = dal başı, 4 = zirve */
  tier: number;
  cost: number;
  /** motorun `permanent` kanalına eklenen etkiler */
  stats: Partial<Record<StatKey, number>>;
  /** alınabilmesi için gereken düğüm (aynı dalda) */
  requires?: string;
  /**
   * Bu düğümle BİRLİKTE alınamayan düğüm. ⚠️ Çift yönlü olmak ZORUNDA
   * değil — `sanitizeSkills` her iki yönü de kontrol ediyor; ama okunurluk
   * için çiftler karşılıklı yazıldı.
   */
  excludes?: string;
  /** zirve mi — toplam `SKILLS.maxCapstones` tane alınabilir */
  capstone?: boolean;
  desc: string;
}

/**
 * ⚠️ HER DAL AYNI ŞEKİLDE KURULU: iki ucuz temel → BİRBİRİNİ KİLİTLEYEN
 * bir çatal → bir zirve. Simetri kasıtlı; oyuncu bir dalı öğrenince
 * hepsini okumuş oluyor ve dikkat, dalların NE VERDİĞİNE kalıyor.
 */
export const SKILL_TREE: readonly SkillNode[] = [
  // ── THE BLADE ──
  { id: 'blade_edge', branch: 'blade', name: 'Whetted', tier: 1, cost: 1,
    stats: { might: 0.06 }, desc: '+6% damage' },
  { id: 'blade_reach', branch: 'blade', name: 'Long Reach', tier: 1, cost: 1,
    stats: { area: 0.07 }, desc: '+7% area' },
  // ⚠️ ÇATAL: geniş vuruş mu, çok vuruş mu. İkisi de alınamaz.
  { id: 'blade_wide', branch: 'blade', name: 'Wide Arc', tier: 2, cost: 3,
    requires: 'blade_reach', excludes: 'blade_many',
    stats: { area: 0.16, might: 0.05 }, desc: '+16% area, +5% damage' },
  { id: 'blade_many', branch: 'blade', name: 'Splitting', tier: 2, cost: 3,
    requires: 'blade_edge', excludes: 'blade_wide',
    stats: { amount: 1, cooldown: 0.04 }, desc: '+1 projectile, but +4% cooldown' },
  { id: 'blade_ruin', branch: 'blade', name: 'Ruin', tier: 4, cost: 6, capstone: true,
    requires: 'blade_edge',
    // ⚠️ BEDELİ VAR (bkz. dosya başlığı): bedelsiz zirve seçim olmaz.
    stats: { might: 0.34, maxHp: -0.14 },
    desc: '+34% damage — and you carry 14% less health' },

  // ── THE BULWARK ──
  { id: 'bulwark_hide', branch: 'bulwark', name: 'Thick Hide', tier: 1, cost: 1,
    stats: { maxHp: 0.08 }, desc: '+8% max health' },
  { id: 'bulwark_plate', branch: 'bulwark', name: 'Grave Plate', tier: 1, cost: 1,
    stats: { armor: 1 }, desc: '+1 armor' },
  { id: 'bulwark_mend', branch: 'bulwark', name: 'Slow Mend', tier: 2, cost: 3,
    requires: 'bulwark_hide', excludes: 'bulwark_wall',
    stats: { recovery: 0.4, maxHp: 0.08 }, desc: '+0.4 HP/sec, +8% max health' },
  { id: 'bulwark_wall', branch: 'bulwark', name: 'Standing Wall', tier: 2, cost: 3,
    requires: 'bulwark_plate', excludes: 'bulwark_mend',
    stats: { armor: 3, moveSpeed: -0.05 }, desc: '+3 armor, but 5% slower' },
  { id: 'bulwark_return', branch: 'bulwark', name: 'Second Burial', tier: 4, cost: 6, capstone: true,
    requires: 'bulwark_hide',
    stats: { revival: 1, maxHp: 0.20, might: -0.12 },
    desc: '+1 revival, +20% max health — and 12% less damage' },

  // ── THE QUICKENING ──
  { id: 'quick_hands', branch: 'quickening', name: 'Restless Hands', tier: 1, cost: 1,
    stats: { cooldown: -0.04 }, desc: '−4% cooldown' },
  { id: 'quick_step', branch: 'quickening', name: 'Unquiet Step', tier: 1, cost: 1,
    stats: { moveSpeed: 0.05 }, desc: '+5% move speed' },
  { id: 'quick_flow', branch: 'quickening', name: 'Flowing', tier: 2, cost: 3,
    requires: 'quick_hands', excludes: 'quick_far',
    stats: { cooldown: -0.09, duration: 0.10 }, desc: '−9% cooldown, +10% duration' },
  { id: 'quick_far', branch: 'quickening', name: 'Carrying Wind', tier: 2, cost: 3,
    requires: 'quick_step', excludes: 'quick_flow',
    stats: { projSpeed: 0.22, magnet: 0.25 }, desc: '+22% projectile speed, +25% pickup range' },
  { id: 'quick_haste', branch: 'quickening', name: 'The Quickening', tier: 4, cost: 6, capstone: true,
    requires: 'quick_hands',
    stats: { cooldown: -0.20, moveSpeed: 0.12, area: -0.15 },
    desc: '−20% cooldown, +12% move speed — and 15% less area' },

  // ── THE COVENANT ──
  { id: 'cov_edge', branch: 'covenant', name: 'Whetted Bone', tier: 1, cost: 1,
    stats: { crit: 0.05 }, desc: '+5% critical chance' },
  { id: 'cov_learn', branch: 'covenant', name: 'Grave Lessons', tier: 1, cost: 1,
    stats: { growth: 0.08 }, desc: '+8% experience' },
  { id: 'cov_frenzy', branch: 'covenant', name: 'Frenzy', tier: 2, cost: 3,
    requires: 'cov_edge', excludes: 'cov_curse',
    stats: { crit: 0.08, critMul: 0.4 }, desc: '+8% crit chance, +40% crit damage' },
  { id: 'cov_curse', branch: 'covenant', name: 'Invite Them In', tier: 2, cost: 3,
    requires: 'cov_learn', excludes: 'cov_frenzy',
    // ⚠️ `curse` düşmanları hem sertleştirir hem zenginleştirir — bu dalın
    // tamamı "ne kadar riske girersin" sorusu üzerine kurulu.
    stats: { curse: 0.25, growth: 0.10 }, desc: '+25% curse — deadlier, richer. +10% experience' },
  { id: 'cov_pact', branch: 'covenant', name: 'The Pact', tier: 4, cost: 6, capstone: true,
    requires: 'cov_edge',
    stats: { crit: 0.20, critMul: 0.6, armor: -3 },
    desc: '+20% crit chance, +60% crit damage — and 3 less armor' },
] as const;

export function skillById(id: string): SkillNode | undefined {
  return SKILL_TREE.find((n) => n.id === id);
}

/** Ağacın tamamının maliyeti — "asla dolmaz" garantisi buna dayanıyor */
export const TREE_TOTAL_COST = SKILL_TREE.reduce((s, n) => s + n.cost, 0);

// ── DOĞRULAMA ─────────────────────────────────────────────────────────

/**
 * Bir dağılımı GEÇERLİ hâline indirge.
 *
 * ⚠️ SUNUCU DA BUNU ÇAĞIRIYOR ve yazdığı şey ÇIKTISI oluyor — istemcinin
 * gönderdiği liste değil. İstemci "hepsi açık" diyebilir; sunucu bu
 * fonksiyondan geçirdiği için ancak hak edilen kadarı kaydedilir.
 *
 * ⚠️ SIRA ÖNEMLİ ve deterministik: ağaç sırasına göre taranıyor, öncelik
 * ucuz/temel düğümlerde. Girdi sırasına göre farklı sonuç veren bir
 * doğrulama, iki çağrıda iki farklı ağaç üretirdi.
 */
export function sanitizeSkills(raw: unknown, points: number): string[] {
  const istenen = new Set(
    Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [],
  );
  const secili: string[] = [];
  const set = new Set<string>();
  let kalan = Math.max(0, Math.min(SKILLS.maxPoints, Math.floor(points)));
  let zirve = 0;

  // ⚠️ TIER SIRASINA GÖRE: önkoşullar seçilmeden ardılları denenemez.
  const sirali = [...SKILL_TREE].sort((a, b) => a.tier - b.tier || a.cost - b.cost);
  for (const n of sirali) {
    if (!istenen.has(n.id)) continue;
    if (n.cost > kalan) continue;
    if (n.requires && !set.has(n.requires)) continue;
    // Kilitleme İKİ YÖNLÜ kontrol ediliyor: tablo tek yönlü yazılmış olsa
    // bile bir çift asla birlikte seçilemesin.
    if (n.excludes && set.has(n.excludes)) continue;
    if ([...set].some((s) => skillById(s)?.excludes === n.id)) continue;
    if (n.capstone && zirve >= SKILLS.maxCapstones) continue;

    secili.push(n.id);
    set.add(n.id);
    kalan -= n.cost;
    if (n.capstone) zirve++;
  }
  return secili;
}

/** Seçili düğümlerin harcadığı puan */
export function spentPoints(alloc: readonly string[]): number {
  return alloc.reduce((s, id) => s + (skillById(id)?.cost ?? 0), 0);
}

/** Dağılımı bozmanın gold bedeli — hiçbir şey üretmeyen, sonsuz bir sink */
export function respecCost(alloc: readonly string[]): number {
  return spentPoints(alloc) * SKILLS.respecPerPoint;
}

/**
 * Bir düğüm ŞU AN alınabilir mi ve alınamıyorsa NİYE.
 *
 * ⚠️ Sebep döndürmek şart: kilitli bir düğümü sessizce soluk göstermek
 * "neden basamıyorum" sorusunu doğurur ve oyuncu ağacı anlamadan bırakır.
 */
export function skillBlocker(
  n: SkillNode, alloc: readonly string[], points: number,
): string | null {
  const set = new Set(alloc);
  if (set.has(n.id)) return null;
  if (n.requires && !set.has(n.requires)) {
    return `Needs ${skillById(n.requires)?.name ?? n.requires}`;
  }
  const kilit = n.excludes && set.has(n.excludes)
    ? n.excludes
    : alloc.find((s) => skillById(s)?.excludes === n.id);
  if (kilit) return `Locked out by ${skillById(kilit)?.name ?? kilit}`;
  if (n.capstone && alloc.filter((s) => skillById(s)?.capstone).length >= SKILLS.maxCapstones) {
    return 'You may only walk one path to its end';
  }
  if (n.cost > points - spentPoints(alloc)) return `Needs ${n.cost} points`;
  return null;
}

// ── MOTORA BAĞLANMA ───────────────────────────────────────────────────

/**
 * Seçili düğümlerin toplam etkisi — Forge, tılsım ve ekipmanla AYNI kanala
 * gidiyor. Motor beceri ağacını bilmiyor bile; `engine.ts`'te tek satır
 * değişmediği için determinizm mührü de bozulmuyor.
 */
export function skillBonus(alloc: readonly string[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const id of alloc) {
    const n = skillById(id);
    if (!n) continue;
    for (const [k, v] of Object.entries(n.stats)) {
      const key = k as StatKey;
      out[key] = Math.round(((out[key] ?? 0) + (v ?? 0)) * 10000) / 10000;
    }
  }
  // ⚠️ SIFIRA SADELEŞEN SATIRLARI AT. Karşıt iki düğüm birbirini tam
  // götürebiliyor (`blade_many` +%4 cooldown ile `quick_hands` −%4).
  // Motor için farksız ama arayüzde "cooldown: 0" satırı, hiçbir şey
  // yapmayan bir etki varmış gibi görünürdü.
  for (const k of Object.keys(out) as StatKey[]) if (!out[k]) delete out[k];
  return out;
}
