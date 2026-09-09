// TANITIM KAYDI — panellerin DOLU hâlini fotoğraflamak için.
//
// 🔴 NİYE VAR: ilk fotoğraf turunda her panel `0 GOLD` ve bütün düğmeler
// soluk çıktı — çünkü demo oturumu sıfırdan başlıyor. Bir tanıtımda oyunun
// Forge'unu boş göstermek, oyunu olduğundan zayıf anlatmaktır: Binding
// panelinde on iki yaratığın on ikisi de kilitli görünüyordu.
//
// ⚠️ BU BİR HİLE DEĞİL, BİR KAYITTIR. Değerler oynayarak ulaşılabilir
// yerlerde: gold `RETENTION`daki saatlik musluğa göre birkaç günlük oyun,
// Forge seviyeleri tavanların ALTINDA, bağlanmış yaratıklar gerçek öldürme
// eşiklerini karşılıyor. Uydurma bir "999.999" ekranı, oyunun kendi
// ekonomisini yalanlardı.
//
// ⚠️ SADECE DEMO (localStorage). Sunucuya tek bir istek gitmiyor; demo'nun
// deponun her yerinde yazılı kuralı bu. Ekonomiye hiçbir şey işlenmiyor.
//
// ⚠️ `normalize()` YİNE DE SÜZÜYOR: buradaki bir id yanlış yazılırsa oyun
// onu sessizce atar. Bu yüzden id'ler `forge.ts` / `pets.ts` / `charms.ts`
// dosyalarından BİREBİR alındı, elle uydurulmadı.

/** Forge seviyeleri — hepsi `maxLevel`in altında, hattı hattına dağıtılmış. */
const UPGRADES = {
  might: 14, health: 13, greed: 8, magnet: 7,
  area: 11, recovery: 7, pspeed: 6, duration: 6,
  mspeed: 8, armor: 5, cooldown: 8, growth: 6,
  amount: 2, revival: 1,
};

/** Bağlanmış yaratıklar — `pets.ts` id'leri, öldürme sayısı eşiğin üstünde. */
const KILLS = {
  imp: 4210, wretch: 3880, slim: 2140, rogue: 1960, bird: 1510,
  horned: 1240, crab: 980, fiend: 1105, archer: 960, brute: 640,
  warrior: 520, hulk: 410,
};

const PETS = {
  imp: 1, wretch: 1, slim: 1, rogue: 1, bird: 1,
  horned: 1, crab: 1, fiend: 1, archer: 1,
};

const PET_LEVELS = { imp: 6, wretch: 4, rogue: 5, horned: 3, fiend: 2 };

/** Temizlenmiş bölümler + Descent'te ödenmiş derinlikler. */
function cleared(n) {
  const o = {};
  for (let i = 1; i <= n; i++) o[i] = true;
  return o;
}
function depths() {
  const o = {};
  const derinlik = [64, 58, 51, 47, 44, 41, 38, 36, 33, 31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11];
  derinlik.forEach((d, i) => { o[i + 1] = d; });
  return o;
}

export const TANITIM_KAYDI = {
  name: 'GRAVEBORN',
  renames: 0,
  gold: 1_284_500,
  dust: 6_420,
  ossuary: 23,
  unlockedStage: 21,
  hero: 'knight',
  cleared: cleared(20),
  firstClear: cleared(20),
  depthPaid: depths(),
  upgrades: UPGRADES,
  // ⚠️ `CHARM_SLOTS` kadarı taşınıyor; fazlası `normalize`de kesilir.
  charms: ['edge', 'draught', 'skin'],
  cosmetics: [],
  equipped: {},
  wager: null,
  vigil: true,
  vigilClaimed: [],
  achievements: [],
  streak: { days: 9, last: '' },
  kills: KILLS,
  pets: PETS,
  petLevels: PET_LEVELS,
  petFused: ['imp'],
  equippedPets: ['imp', 'wretch'],
  petSlot2: true,
};

export const KAYIT_ANAHTARI = 'graveborn:progress:v2';
