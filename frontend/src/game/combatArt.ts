// SAVAŞ GÖRSELLERİ — hangi silah nasıl görünür.
//
// NİYE VAR: 16 silahın HEPSİ tek bir mermi sprite'ı çiziyordu ve 8 evrimli
// silahın görsel farkı SIFIRDI (Reliquary = daha hızlı aynı mermi, Black
// Vespers = daha büyük aynı orb). Oyuncu neyi kuşandığını ekrandan
// anlayamıyordu. Oysa diskte 252 efekt atlası ve 8 mermi atlası boşta
// duruyordu.
//
// ⚠️ DENGE SAYISI YOK. Hasar/bekleme/menzil `config.ts`'in işi; burada
// sadece "nasıl görünür" var. `stageArt.ts` ile aynı sözleşme.
//
// ⚠️ SAF VERİ — DOM yok, `Math.random()` yok. `sim.test.mts` bu dosyayı
// import edip bütünlüğünü doğrulayabiliyor.
//
// ── ATLAS YAPISI (ÖLÇÜLDÜ, tahmin değil) ─────────────────────────────
// `fx/rpg/*.png`: yükseklik her zaman 576 = 9 SATIR. Genişlik DEĞİŞKEN:
//   448(7 sütun)·8 · 512(8)·24 · 576(9)·8 · 640(10)·27 · 704(11)·28
//   768(12)·64 · 832(13)·29 · 896(14)·39 · 960(15)·14 · 1024-1152(16-18)·11
// ⚠️ Yani "12 sütun" varsaymak 252 atlasın 188'inde YANLIŞ kare çizer ya da
// atlas dışına taşar. `cols` her kayıtta AÇIKÇA yazılır ve test doğrular.
//
// SATIR = RENK (bütün atlaslarda tutarlı, ölçüldü):
//   0 turuncu/altın · 1 MOR ❌ · 2 mavi · 3 yeşil · 4 kahve
//   5 gri/kemik · 6 pembemsi ⚠️ · 7 kan kırmızısı · 8 mor/lacivert ❌
// ⚠️ 1, 6 ve 8 KULLANILMAZ — "MOR YOK" kuralı (bkz. lib/theme.ts).
//
// ATLAS = EFEKT TİPİ (şekil profili ölçülerek seçildi):
//   1010 klasik darbe · 1011 ince darbe · 1012 hafif parıltı
//   1021 büyüyen alan · 1030 hızlı kesik · 1031 merkezden dışa PATLAMA
//   1053 sürekli döngü · 1063 ince iz
//
// `fx/bullets/*.png`: 640×400, 16px hücre = 40 sütun × 25 satır.
// ATLAS = RENK: 00 altın · 01 somon · 02 buz mavisi · 03 yeşil
// SATIR = mermi formu.

const RPG = '/art/fx/rpg';
const BUL = '/art/fx/bullets';
const ICO = '/art/icons';

/** Atlas hücre animasyonu. ⚠️ `cols` atlasın GERÇEK sütun sayısı olmalı. */
export interface CellAnim {
  src: string;
  /** hücre kenarı (px) */
  cell: number;
  /** ⚠️ ATLASIN SÜTUN SAYISI — genişlik/cell. Ölçülür, varsayılmaz. */
  cols: number;
  row: number;
  /** oynatılacak kare sayısı — `cols`'u AŞAMAZ */
  frames: number;
  fps: number;
  /** ekrandaki çizim boyu (px) */
  size: number;
  /** rad/sn — kendi ekseninde dönenler (bumerang) */
  spin?: number;
}

export interface WeaponArt {
  /** 16×16 ikon — level-up kartı ve HUD slotu */
  icon: string;
  /** aimed/nova/boomerang: uçan mermi */
  bullet?: CellAnim;
  /** vuruş anında patlayan efekt */
  impact: CellAnim;
  /** sweep/aura/orbit gradyanlarının rengi [r,g,b] */
  tint: [number, number, number];
}

// ── Kısayollar ────────────────────────────────────────────────────────
const fx = (atlas: string, row: number, size: number, frames = 12, fps = 26): CellAnim =>
  ({ src: `${RPG}/${atlas}.png`, cell: 64, cols: 12, row, frames, fps, size });

const bullet = (atlas: string, row: number, size = 18, spin?: number): CellAnim =>
  ({ src: `${BUL}/All_Fire_Bullet_Pixel_16x16_0${atlas}.png`, cell: 16, cols: 40, row, frames: 5, fps: 14, size, spin });

// Palet renkleri — theme.ts ile aynı, ama sayısal (gradyanlarda kullanılıyor)
const BONE: [number, number, number] = [227, 216, 192];
const BLOOD: [number, number, number] = [160, 18, 38];
const CANDLE: [number, number, number] = [239, 167, 46];
const ICE: [number, number, number] = [138, 151, 163];

/**
 * ⚠️ HİÇBİR İKİ SİLAH AYNI (atlas, satır) ÇİFTİNİ KULLANAMAZ.
 * Bütün mesele buydu: 16 silah tek mermiyle çiziliyordu. Test bunu zorluyor.
 */
export const WEAPON_ART: Record<string, WeaponArt> = {
  // ── TABAN SİLAHLAR ──
  shard: {                         // aimed — en yakına ateş
    icon: `${ICO}/attack_boost.png`,
    bullet: bullet('0', 4),
    impact: fx('1010', 5, 40),     // klasik darbe, kemik
    tint: BONE,
  },
  lash: {                          // sweep — önüne kesik
    icon: `${ICO}/poison_dagger.png`,
    impact: fx('1030', 7, 46),     // hızlı kesik, kan
    tint: BLOOD,
  },
  litany: {                        // orbit — etrafında dönen halka
    icon: `${ICO}/divine_protection_spell.png`,
    impact: fx('1012', 0, 34),     // hafif parıltı, altın
    tint: CANDLE,
  },
  ward: {                          // aura — yakındakine sürekli
    icon: `${ICO}/fire_spell.png`,
    impact: fx('1053', 7, 52),     // sürekli döngü, kan
    tint: BLOOD,
  },
  toll: {                          // nova — her yöne patlar
    icon: `${ICO}/blinding_light_spell.png`,
    bullet: bullet('0', 12, 16),
    impact: fx('1031', 5, 58),     // merkezden dışa patlama, kemik
    tint: BONE,
  },
  ash: {                           // ground — yere bırakılan alan
    icon: `${ICO}/on_fire_(burning).png`,
    impact: fx('1021', 0, 50),     // büyüyen alan, altın
    tint: CANDLE,
  },
  sickle: {                        // boomerang — atılır, döner
    icon: `${ICO}/swiftness.png`,
    bullet: bullet('2', 4, 20, 9), // buz mavisi, KENDİ EKSENİNDE döner
    impact: fx('1011', 2, 38),     // ince darbe, mavi
    tint: ICE,
  },
  lightning: {                     // chain — düşmandan düşmana sıçrar
    icon: `${ICO}/lightning_spell.png`,
    impact: fx('1063', 2, 36),     // ince iz, mavi
    tint: ICE,
  },

  // ── EVRİMLER ──
  // ⚠️ Evrimin görsel farkı BELİRGİN olmalı — oyuncu 8 seviye + pasif MAX
  // yatırıp sandık açtı, ekranda aynı şeyi görmemeli.
  reliquary: {                     // shard → altın, daha görkemli
    icon: `${ICO}/magic_amplification.png`,
    bullet: bullet('0', 8, 22),
    impact: fx('1010', 0, 54),
    tint: CANDLE,
  },
  weeping: {                       // lash → altın kesik
    icon: `${ICO}/bleeding.png`,
    impact: fx('1030', 0, 60),
    tint: CANDLE,
  },
  vespers: {                       // litany → buz mavisi halka
    icon: `${ICO}/frozen.png`,
    impact: fx('1012', 2, 44),
    tint: ICE,
  },
  glutton: {                       // ward → altın aura
    icon: `${ICO}/regeneration.png`,
    impact: fx('1053', 0, 66),
    tint: CANDLE,
  },
  requiem: {                       // toll → kan patlaması
    icon: `${ICO}/summoning_spell.png`,
    bullet: bullet('1', 12, 18),
    impact: fx('1031', 7, 72),
    tint: BLOOD,
  },
  pyre: {                          // ash → kan alanı
    icon: `${ICO}/fire_spell_2.png`,
    impact: fx('1021', 7, 64),
    tint: BLOOD,
  },
  reaper: {                        // sickle → kemik bıçak
    icon: `${ICO}/knockback_boost.png`,
    bullet: bullet('2', 8, 24, 11),
    impact: fx('1011', 5, 48),
    tint: BONE,
  },
  sainthood: {                     // lightning → kemik fırtına
    icon: `${ICO}/counterspell.png`,
    impact: fx('1063', 5, 46),
    tint: BONE,
  },

  // ── R5/12: TAKİP · TUZAK · IŞIN ──
  // ⚠️ Atlas boyutları ÖLÇÜLDÜ (768×576 = 12 sütun × 9 satır), varsayılmadı.
  // Dosya başlığındaki uyarı tam da bu: 252 atlasın 188'i 12 sütun DEĞİL ve
  // yanlış varsayım kareyi kaydırır ya da atlas dışına taşar.
  soul: {                          // homing — kaçanı takip eden ışık
    icon: `${ICO}/ghost_form_(physical_damage_immunity).png`,
    bullet: bullet('1', 4, 16),
    impact: fx('1013', 3, 34),     // yumuşak sönüm, mavi
    tint: ICE,
  },
  cairn: {                         // mine — bekleyen taş
    icon: `${ICO}/Skull.png`,
    impact: fx('1020', 5, 56),     // yerden yukarı patlama, altın
    tint: CANDLE,
  },
  ray: {                           // beam — tutulan ışık
    icon: `${ICO}/glow.png`,
    impact: fx('1022', 4, 30),     // ince sürekli yanma, altın
    tint: CANDLE,
  },
  lost: {                          // soul → kusursuz takip
    icon: `${ICO}/ice_spell.png`,
    bullet: bullet('3', 4, 19),
    impact: fx('1013', 7, 42),   // ⚠️ satır 6 MOR, 7'ye alındı
    tint: ICE,
  },
  barrow: {                        // cairn → iki katı geniş patlama
    icon: `${ICO}/fortify_spell.png`,
    impact: fx('1020', 7, 74),   // ⚠️ satır 8 MOR, 7'ye alındı
    tint: BLOOD,
  },
  dawn: {                          // ray → neredeyse sönmeyen ışın
    icon: `${ICO}/healing_spell.png`,
    impact: fx('1033', 4, 38),
    tint: CANDLE,
  },
};

/**
 * Pasif item ikonları — level-up kartlarında ve HUD slotlarında.
 * ⚠️ 51 ikonluk set diskte duruyordu ve HİÇBİRİ kullanılmıyordu; kartlar
 * düz metindi.
 */
export const PASSIVE_ART: Record<string, { icon: string }> = {
  bloodmeal: { icon: `${ICO}/attack_boost.png` },
  boneplate: { icon: `${ICO}/defense_boost.png` },
  flesh: { icon: `${ICO}/fortify_spell.png` },
  slowknit: { icon: `${ICO}/regeneration.png` },
  hands: { icon: `${ICO}/attack_speed_boost.png` },
  tallow: { icon: `${ICO}/element_boost.png` },
  sinew: { icon: `${ICO}/swiftness.png` },
  sigil: { icon: `${ICO}/magic_amplification.png` },
  echo: { icon: `${ICO}/summoning_spell.png` },
  step: { icon: `${ICO}/teleportation_spell.png` },
  soulpull: { icon: `${ICO}/mana_replenish.png` },
  crown: { icon: `${ICO}/exp_boost.png` },
  coinmask: { icon: `${ICO}/Golden Coin.png` },
  skull: { icon: `${ICO}/Skull.png` },
  burial: { icon: `${ICO}/ghost_form_(physical_damage_immunity).png` },
  // ── kritik arketipi (SIM_VERSION 2 ile geldi) ──
  edge: { icon: `${ICO}/critical_boost.png` },
  frenzy: { icon: `${ICO}/frenzy_spell_(critical_booster).png` },
};

/** Bilinmeyen silah → shard görseli. Eksik veri sahneyi boş bırakmasın. */
export function weaponArt(id: string): WeaponArt {
  return WEAPON_ART[id] ?? WEAPON_ART.shard;
}

/** Bilinmeyen pasif → jenerik parıltı */
export function passiveIcon(id: string): string {
  return PASSIVE_ART[id]?.icon ?? `${ICO}/glow.png`;
}
