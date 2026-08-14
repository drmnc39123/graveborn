// GÖRSEL TEST MODU — `?test=1`.
//
// NİYE VAR: panellerin yarısı cüzdan istiyor (Gear, Today, Guild, Duel…) ve
// demo modunda "connect a wallet" ekranı gösteriyorlar. Bu doğru davranış ama
// GÖRSEL İŞ YAPILAMIYOR: bir paneli göremeden güzelleştirmek, körlemesine
// tasarım demek — ve bu projede bir kez tam olarak öyle oldu (pet portresi
// "eklendi" sanıldı, ekranda simsiyah kutu çıktı).
//
// ⚠️ BU BİR EXPLOIT DEĞİL ve olamaz, üç ayrı sebeple:
//
//   1. ÜRETİMDE DERLENMİYOR. `process.env.NODE_ENV` production'da sabit
//      'production' ve bu fonksiyon her zaman false döner; bundler ölü kodu
//      atar. Yani bayrak canlıya ÇIKAMAZ.
//   2. KAPI ZATEN SADECE ARAYÜZ. Sunucu her yazmayı kendi doğruluyor
//      (imza + `rev` + yapısal tavan). Test modunda bir düğmeye basmak
//      401 alır — görünüm açılır, yetki açılmaz.
//   3. SAHTE VERİ EKONOMİYE GİRMEZ. Aşağıdaki veriler yalnızca çizim için;
//      hiçbiri `Progress`e yazılmıyor, kaydedilmiyor, sunucuya gönderilmiyor.
//
// ⚠️ Sahte veriler GERÇEKÇİ olmalı — hepsi boş/sıfır olsaydı panelleri dolu
// hâlleriyle göremezdik ve düzeltilecek şey de görünmezdi.

export function isTestMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('test') === '1';
  } catch {
    return false;
  }
}

/** Panel kilidi: cüzdan modu VEYA test modu */
export function panelUnlocked(mode: string | null): boolean {
  return mode === 'wallet' || isTestMode();
}

// ── SAHTE VERİ ────────────────────────────────────────────────────────
//
// ⚠️ SADECE ÇİZİM İÇİN. Hiçbiri `Progress`e yazılmıyor, kaydedilmiyor,
// sunucuya gönderilmiyor. Amaç panelleri DOLU hâlleriyle görebilmek —
// hepsi boş olsaydı düzeltilecek şey de görünmezdi.
//
// ⚠️ Şekiller `gameSession.ts`teki tiplerin AYNISI olmalı; ayrışırsa panel
// test modunda başka, cüzdan modunda başka çizer ve test modu yalan söyler.

export const TEST_QUESTS = {
  day: '2026-08-10',
  ceiling: 120,
  quests: [
    { id: 'q1', text: 'Descend to depth 12', goal: 12, dust: 30, progress: 12, done: true, claimed: false },
    { id: 'q2', text: 'Slay 400 of the dead', goal: 400, dust: 45, progress: 268, done: false, claimed: false },
    { id: 'q3', text: 'Spend 2,000 gold', goal: 2000, dust: 25, progress: 2000, done: true, claimed: true },
  ],
  bonus: { dust: 20, ready: true, claimed: false },
};

export const TEST_GEAR = {
  vaultSize: 24,
  // ⚠️ YUVA ADLARI OYUNUN KENDİ ADLARI OLMALI (`gear.ts` GearSlot):
  // skull · shroud · grasp · tread · sigil. İlk sürümde 'weapon'/'head'
  // yazılmıştı ve manken BOŞ görünüyordu — sahte veri gerçek şekle
  // uymazsa test modu YALAN SÖYLER, ki o zaman hiç olmamasından beterdir.
  equipped: { skull: 'g3', grasp: 'g1', shroud: 'g4' } as Record<string, string>,
  items: [
    { id: 'g1', slot: 'grasp', rarity: 4, depth: 31, equipped: true,
      affixes: [{ stat: 'might', value: 0.18 }, { stat: 'crit', value: 0.06 }] },
    { id: 'g2', slot: 'grasp', rarity: 2, depth: 14, equipped: false,
      affixes: [{ stat: 'might', value: 0.07 }] },
    { id: 'g3', slot: 'skull', rarity: 3, depth: 22, equipped: true,
      affixes: [{ stat: 'maxHp', value: 0.12 }, { stat: 'armor', value: 2 }] },
    { id: 'g4', slot: 'shroud', rarity: 5, depth: 44, equipped: true,
      affixes: [{ stat: 'armor', value: 5 }, { stat: 'recovery', value: 0.4 }, { stat: 'maxHp', value: 0.2 }] },
    { id: 'g5', slot: 'tread', rarity: 1, depth: 6, equipped: false,
      affixes: [{ stat: 'moveSpeed', value: 0.04 }] },
    // ⚠️ `magnet` KESİRLİ (gear.ts: 0.12 = %12), düz sayı DEĞİL. İlk sürümde
    // 12 yazılmıştı ve panel "−1200% pickup range" gösteriyordu. Panelde bir
    // biçimlendirme hatası sandım; ölçünce SAHTE VERİNİN yanlış olduğu çıktı.
    // Test modu gerçeğe uymazsa olmayan hatalar "bulunur" ve gerçek kod boşuna
    // değiştirilir — bu yüzden sahte veri gerçek üreticinin ölçeğini taklit
    // etmek ZORUNDA.
    { id: 'g6', slot: 'sigil', rarity: 3, depth: 28, equipped: false,
      affixes: [{ stat: 'greed', value: 0.15 }, { stat: 'magnet', value: 0.10 }] },
  ],
};

// ⚠️ ŞEKİL `GuildSummary` İLE BİREBİR: id · name · TAG · level · members · CAP.
// İlk sürümde `tag` ve `cap` YOKTU, `treasury` ise fazladan vardı (o `MyGuild`'e
// ait). Ekranda sonucu şuydu: her satırın başında boş `[]` ve üye sayısı "14/"
// diye yarım. Panelde hata sandım; şekli okuyunca sahte verinin eksik olduğu
// çıktı — magnet olayının aynısı, üçüncü kez.
export const TEST_GUILDS = {
  cost: 25_000,
  wallet: 'TESTwa11et000000000000000000000000000000000',
  mine: null,
  list: [
    { id: 'gu1', name: 'The Sunless Choir', tag: 'SUN', level: 3, members: 14, cap: 20 },
    { id: 'gu2', name: 'Marrow & Ash', tag: 'ASH', level: 2, members: 8, cap: 15 },
    { id: 'gu3', name: 'Gravebound', tag: 'GRV', level: 5, members: 27, cap: 30 },
  ],
};

export const TEST_FOLLOWS = {
  max: 20,
  rows: [
    { wallet: 'Ashwa1ker00000000000000000000000000000000000', hero: 'knight', online: true,
      duelRating: 1420, bestStage: 18, bestDepth: 37, recordId: 'r1', recordDepth: 37, blocker: null },
    { wallet: 'Cryptkeep3r000000000000000000000000000000000', hero: 'priestess', online: false,
      duelRating: 1180, bestStage: 12, bestDepth: 24, recordId: null, recordDepth: 0, blocker: 'offline' },
  ],
};

const W1 = 'Ashwa1ker00000000000000000000000000000000000';
const W2 = 'Cryptkeep3r000000000000000000000000000000000';
const W3 = 'B0nesinger00000000000000000000000000000000000';
const ME = 'TESTwa11et000000000000000000000000000000000';

/** ⚠️ `SkillState` — puan DERİNLİKTEN gelir, burada sadece çizim için sabit. */
export const TEST_SKILLS = {
  nodes: ['blade_1', 'blade_2', 'bulwark_1'],
  points: 12,
  spent: 5,
  respec: 1_250,
};

/** ⚠️ `DuelBoard` — dört parçası da dolu olmalı, yoksa panel yarım çizer. */
export const TEST_DUELS = {
  me: { rating: 1290, wins: 14, losses: 9, rewardedToday: 2 },
  rows: [
    { id: 'd1', wallet: W1, stageId: 18, depth: 37, rating: 1420, duelRating: 1420, hero: 'knight', blocker: null },
    { id: 'd2', wallet: W2, stageId: 12, depth: 24, rating: 1180, duelRating: 1180, hero: 'priestess', blocker: null },
    { id: 'd3', wallet: W3, stageId: 21, depth: 44, rating: 1610, duelRating: 1610, hero: 'bladekeeper', blocker: 'already answered today' },
  ],
  recent: [
    { challenger: ME, defender: W1, stageId: 18, depth: 39, target: 37, won: true, delta: 18, at: '2026-08-10T09:12:00Z' },
    { challenger: W2, defender: ME, stageId: 12, depth: 22, target: 24, won: false, delta: -11, at: '2026-08-09T21:40:00Z' },
  ],
  // ⚠️ TÜM-ZAMANLAR SEZONDAN FARKLI OLMALI. İlk sürümde ikisi birebir aynı
  // sayıları taşıyordu ve panelde yan yana iki özdeş tablo çıkıyordu — test
  // modu "bu bölüm gereksiz" diye YANLIŞ bir izlenim veriyordu. Gerçekte
  // sezon haftalık sıfırlanıyor, tüm-zamanlar birikiyor: yani tüm-zamanlar
  // maç sayıları DAHA BÜYÜK ve sıralama farklı olabilir.
  ladder: {
    rows: [
      { rank: 1, wallet: W1, rating: 1755, wins: 148, losses: 96, hero: 'knight' },
      { rank: 2, wallet: W3, rating: 1702, wins: 121, losses: 74, hero: 'bladekeeper' },
      { rank: 3, wallet: W2, rating: 1488, wins: 90, losses: 88, hero: 'priestess' },
    ],
    me: { rank: 17, wallet: ME, rating: 1264, wins: 42, losses: 39, hero: 'ranger' },
  },
};

export const TEST_PVP_SEASON = {
  week: 32,
  placement: 5,
  rows: [
    { rank: 1, wallet: W3, rating: 1610, wins: 31, losses: 12, matches: 43, hero: 'bladekeeper' },
    { rank: 2, wallet: W1, rating: 1420, wins: 22, losses: 15, matches: 37, hero: 'knight' },
    { rank: 3, wallet: ME, rating: 1290, wins: 14, losses: 9, matches: 23, hero: 'ranger' },
  ],
  me: { rank: 3, wallet: ME, rating: 1290, wins: 14, losses: 9, matches: 23, hero: 'ranger' },
  awards: [
    { week: 31, rank: 2, rating: 1355, cosmetic: 'title_feared', dust: 180 },
    { week: 30, rank: 7, rating: 1240, cosmetic: null, dust: 60 },
  ],
};

/**
 * ⚠️ `BossState` — haftalık ortak boss. `art` alanı `sprites.ts` anahtarı
 * olmalı, uydurma bir ad değil; yanlışsa panel boş bir kutu çizer.
 */
export const TEST_BOSS = {
  week: 32,
  bossId: 'wb_32',
  name: 'The Unburied',
  epithet: 'it remembers every grave',
  // ⚠️ GEÇERLİ bir `ENEMY_ART` anahtarı olmak ZORUNDA. Burada
  // 'fallen_warden_boss_nightmare' yazıyordu — sprites.ts'te BÖYLE BİR
  // ANAHTAR YOK. Yorumu "yanlışsa panel boş kutu çizer" diyordu ama panel
  // zaten hiç çizmiyordu, o yüzden kimse fark etmedi. Portre eklenince
  // sahte veri sessizce boş kalırdı — test modunun yalan söylediği yer.
  art: 'boss_nightmare',
  hp: 4_180_000,
  maxHp: 9_000_000,
  endsAt: Date.parse('2026-08-14T00:00:00Z'),
  defeated: false,
  top: [
    { wallet: 'B0nesinger00000000000000000000000000000000000', damage: 412_000 },
    { wallet: 'Ashwa1ker00000000000000000000000000000000000', damage: 388_500 },
    { wallet: 'TESTwa11et000000000000000000000000000000000', damage: 210_400 },
    { wallet: 'Cryptkeep3r000000000000000000000000000000000', damage: 96_200 },
  ],
  me: { damage: 210_400, rank: 3 },
};

/** ⚠️ `CryptState` — kademe listesi + kasa + benim kademem. */
export const TEST_CRYPT = {
  week: 32,
  tiers: [
    { tier: 1, name: 'A Narrow Plot', cost: 12_000, weight: 1, blurb: 'Room enough for one.' },
    { tier: 2, name: 'A Family Row', cost: 40_000, weight: 3, blurb: 'The stones lean together.' },
    { tier: 3, name: 'A Sunken Vault', cost: 130_000, weight: 8, blurb: 'Below the frost line.' },
  ],
  vault: { balance: 84_500, owners: 37, totalWeight: 96 },
  me: { tier: 2, claimedWeek: 31 },
};

/**
 * ⚠️ `TicketView[]` — destek bölümü. Boş dizi de geçerli bir durum ama
 * o zaman SADECE form görünür; asıl düzeltilecek yer (cevaplanmış talep
 * rozeti, mesaj balonları) görünmezdi. Bu yüzden bir tanesi cevaplanmış.
 */
export const TEST_TICKETS = [
  {
    id: 't1',
    subject: 'My run ended at depth 31 but the gold never arrived',
    status: 'answered' as const,
    // ⚠️ `TicketView` createdAt/bumpedAt taşıyor — sahte veri gerçek şekle
    // uymazsa panel test modunda başka, cüzdan modunda başka çizer.
    createdAt: '2026-08-09T18:02:00Z',
    bumpedAt: '2026-08-09T20:15:00Z',
    messages: [
      { fromAdmin: false, body: 'The run screen showed 4,180 gold but my balance did not move.', at: '2026-08-09T18:02:00Z' },
      { fromAdmin: true, body: 'We found it — the run settled twice and the second one was rejected. The gold is on your account now, sorry for the scare.', at: '2026-08-09T20:15:00Z' },
    ],
  },
  {
    id: 't2',
    subject: 'Guild invite does nothing',
    status: 'open' as const,
    createdAt: '2026-08-10T07:40:00Z',
    bumpedAt: '2026-08-10T07:40:00Z',
    messages: [
      { fromAdmin: false, body: 'I press accept and the panel just closes.', at: '2026-08-10T07:40:00Z' },
    ],
  },
];

/**
 * ⚠️ `Listing[]` — emir defteri. Şekil `gameSession.ts`teki `Listing` ile
 * BİREBİR: `priceGrave` METİN (2^53 tuzağı), `status`/`createdAt`/`buyer` var.
 *
 * ⚠️ BİRİM FİYATLAR KASITLI OLARAK DAĞINIK. Hepsi aynı olsaydı sıralama
 * düğmeleri ekranda hiçbir şey değiştirmez ve "sıralama çalışıyor" diye
 * yanlış bir izlenim verirdi. Aşağıda per-gold 1,90 ile 3,40 arasında;
 * en ucuz `mk3` (1,90) ve BEST PRICE onu göstermeli.
 *
 * ⚠️ Miktarlar da dağınık (120 … 8.000) ki MIN/MAX GOLD filtresi ölçülebilsin.
 */
export const TEST_LISTINGS = [
  { id: 'mk1', seller: 'Ashwa1ker00000000000000000000000000000000000', goldAmount: 500,
    priceGrave: '1400', status: 'active', createdAt: '2026-08-10T09:00:00Z', buyer: null },
  { id: 'mk2', seller: 'Cryptkeep3r000000000000000000000000000000000', goldAmount: 2500,
    priceGrave: '8500', status: 'active', createdAt: '2026-08-10T11:20:00Z', buyer: null },
  { id: 'mk3', seller: 'B0nesinger00000000000000000000000000000000000', goldAmount: 8000,
    priceGrave: '15200', status: 'active', createdAt: '2026-08-09T18:05:00Z', buyer: null },
  { id: 'mk4', seller: 'TESTwa11et000000000000000000000000000000000', goldAmount: 1200,
    priceGrave: '3960', status: 'active', createdAt: '2026-08-11T07:40:00Z', buyer: null },
  { id: 'mk5', seller: 'Gravebound00000000000000000000000000000000000', goldAmount: 120,
    priceGrave: '408', status: 'active', createdAt: '2026-08-11T08:15:00Z', buyer: null },
  { id: 'mk6', seller: 'Ashwa1ker00000000000000000000000000000000000', goldAmount: 3400,
    priceGrave: '7480', status: 'active', createdAt: '2026-08-10T22:10:00Z', buyer: null },
];

/** ⚠️ Kendi ilanım — `mk4` defterde de var, "HIDE MINE" filtresi ölçülebilsin. */
export const TEST_MY_LISTINGS = {
  listings: [TEST_LISTINGS[3]],
  escrowedGold: 1200,
};
