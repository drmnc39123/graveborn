// SİLAH AÇILIŞI — ölçüm.
//
// EN TEHLİKELİ SORU: kilit oyuncuyu SİLAHSIZ ya da SEÇENEKSİZ bırakabilir mi?
// Yeni bir oyuncu, kilitler yüzünden level-up'ta hiç silah göremezse oyunun
// çekirdek döngüsü ilk koşuda ölür — ve bu hiçbir hata üretmez.
//
// Çalıştır:  npx tsx src/game/unlocks.test.mts

import { Game } from './engine.js';
import { STAGES, TICK, WEAPONS } from './config.js';
import { HEROES } from './heroes.js';
import { emptyProgress, type Progress } from './progress.js';
import { seedFromString } from './rng.js';
import {
  STARTER_WEAPONS, UNLOCKS, armoury, isWeaponUnlocked, newlyUnlocked, unlockedWeapons,
} from './unlocks.js';

let hata = 0;
function check(ad: string, kosul: boolean, detay = '') {
  console.log(`  ${kosul ? '✓' : '✗'} ${ad}${detay ? ` — ${detay}` : ''}`);
  if (!kosul) hata++;
}

const taze = (): Progress => emptyProgress();

console.log('\n[1] ⭐ SIFIRDAN OYUNCU SİLAHSIZ KALMIYOR');
{
  const p = taze();
  const acik = unlockedWeapons(p);
  console.log(`     yeni oyuncu: ${acik.length}/${WEAPONS.length} silah — ${acik.join(', ')}`);
  check('en az bir silah açık', acik.length > 0, `${acik.length}`);
  // ⚠️ HER KAHRAMANIN başlangıç silahı açık olmalı. Biri kilitli olsaydı o
  // kahramanı seçen oyuncu koşuya SİLAHSIZ başlardı — ve bu sessiz bir hata.
  for (const h of HEROES) {
    check(`${h.id} başlangıç silahı (${h.weapon}) açık`, isWeaponUnlocked(h.weapon, p));
  }
  check('başlangıç listesi HEROES\'tan türüyor',
    HEROES.every((h) => STARTER_WEAPONS.includes(h.weapon)),
    STARTER_WEAPONS.join(','));
}

console.log('\n[2] ⭐ KİLİT LEVEL-UP\'I BOZMUYOR (motor ölçümü)');
{
  // Yeni oyuncunun açık silahlarıyla gerçek bir koşu: her level-up'ta
  // en az bir silah seçeneği çıkıyor mu?
  const p = taze();
  const g = new Game(seedFromString('kilit'), STAGES[0], {}, 'campaign',
    HEROES[0].id, 1, 0, unlockedWeapons(p));
  g.setViewport(1280, 720);
  let levelUp = 0, silahsizTeklif = 0, kilitliGorulen = 0;
  const kilitli = new Set(WEAPONS.filter((w) => !isWeaponUnlocked(w.id, p)).map((w) => w.id));
  for (let i = 0; i < Math.round(300 / TICK); i++) {
    if (g.phase === 'levelup') {
      levelUp++;
      if (!g.offers.some((o) => o.id.startsWith('w:'))) silahsizTeklif++;
      for (const o of g.offers) {
        if (o.id.startsWith('w:') && kilitli.has(o.id.slice(2))) kilitliGorulen++;
      }
      g.choose(g.offers[0].id);
      continue;
    }
    if (g.phase !== 'running') break;
    g.hp = g.stats.maxHp;
    const t = i * TICK;
    g.setInput(Math.cos(t * 0.7), Math.sin(t * 0.7));
    g.step();
  }
  console.log(`     ${levelUp} level-up · silahsız teklif ${silahsizTeklif} · kilitli sızan ${kilitliGorulen}`);
  check('koşuda gerçekten seviye atlandı (ölçüm anlamlı)', levelUp > 0, `${levelUp}`);
  // ⚠️ KİLİTLİ SİLAH HAVUZA SIZMAMALI: sızsaydı oyuncuya seçemeyeceği bir
  // kart gösterilir, üç karttan biri boşa giderdi.
  check('kilitli silah teklif edilmiyor', kilitliGorulen === 0, `${kilitliGorulen} sızıntı`);
  check('her level-up\'ta silah seçeneği var', silahsizTeklif === 0, `${silahsizTeklif} boş`);
}

console.log('\n[3] ⚠️ MOTORUN VARSAYILANI DEĞİŞMEDİ (mühür korunuyor)');
{
  // `allowedWeapons` verilmezse kilit YOK — eski çağrılar (mühür koşusu,
  // sunucu doğrulaması, testler) aynı davranmalı.
  const a = new Game(seedFromString('varsayilan'), STAGES[0]);
  a.setViewport(1280, 720);
  const b = new Game(seedFromString('varsayilan'), STAGES[0], {}, 'campaign',
    HEROES[0].id, 1, 0, null);
  b.setViewport(1280, 720);
  for (let i = 0; i < 900; i++) {
    for (const g of [a, b]) {
      if (g.phase === 'levelup') { g.choose(g.offers[0].id); continue; }
      if (g.phase !== 'running') continue;
      g.setInput(1, 0);
      g.step();
    }
  }
  check('null = kilitsiz, sonuç birebir aynı', a.kills === b.kills, `${a.kills} = ${b.kills}`);
}

console.log('\n[4] Koşullar ilerlemeyle AÇILIYOR');
{
  const p = taze();
  const once = unlockedWeapons(p).length;
  // 1. bölümü temizle
  const p1: Progress = { ...p, cleared: { ...p.cleared, 1: true } };
  check('bölüm temizlemek silah açıyor', unlockedWeapons(p1).length > once,
    `${once} → ${unlockedWeapons(p1).length}`);
  // Derine in
  const p2: Progress = { ...p, depthPaid: { ...p.depthPaid, 1: 12 } };
  check('derine inmek silah açıyor', unlockedWeapons(p2).length > once,
    `${once} → ${unlockedWeapons(p2).length}`);
  // ⚠️ İKİ EKSEN de silah açmalı: hepsi kampanyaya bağlı olsaydı sadece
  // Descent oynayan bir oyuncuya hiçbir şey açılmazdı.
  const kampanya = UNLOCKS.filter((u) => u.how.startsWith('Clear')).length;
  const inis = UNLOCKS.filter((u) => u.how.startsWith('Reach')).length;
  console.log(`     ${kampanya} koşul kampanyada · ${inis} koşul inişte`);
  check('her iki eksende de koşul var', kampanya > 0 && inis > 0);
}

console.log('\n[5] Tam ilerlemede HEPSİ açık');
{
  const tam: Progress = {
    ...taze(),
    cleared: Object.fromEntries(STAGES.map((s) => [s.id, true])),
    depthPaid: { 1: 60 },
    unlockedStage: STAGES.length,
  };
  const acik = unlockedWeapons(tam);
  const eksik = WEAPONS.filter((w) => !acik.includes(w.id)).map((w) => w.id);
  check('tüm taban silahlar açılabiliyor', eksik.length === 0,
    eksik.length ? eksik.join(',') : `${acik.length}/${WEAPONS.length}`);
  // ⚠️ Ulaşılamaz kilit ÖLÜ İÇERİKTİR: koşulu sağlanamayan bir silah, oyunda
  // olmayan bir silahtır ve bu hiçbir hata üretmez.
  check('her koşulun bir sahibi var',
    UNLOCKS.every((u) => WEAPONS.some((w) => w.id === u.weapon)),
    UNLOCKS.map((u) => u.weapon).join(','));
}

console.log('\n[6] Kutlama — yeni açılanlar doğru bulunuyor');
{
  const once = taze();
  const sonra: Progress = { ...once, cleared: { ...once.cleared, 1: true } };
  const yeni = newlyUnlocked(once, sonra);
  console.log(`     1. bölüm temizlendi → yeni: ${yeni.join(', ') || 'yok'}`);
  check('yeni açılan bildiriliyor', yeni.length > 0, yeni.join(','));
  check('değişmeyince boş dönüyor', newlyUnlocked(sonra, sonra).length === 0);
  // ⚠️ Geriye gitmek (imkânsız ama) çökmemeli
  check('geriye gidiş boş dönüyor', newlyUnlocked(sonra, once).length === 0);
}

console.log('\n[7] Cephanelik listesi arayüz için tam');
{
  const p = taze();
  const rows = armoury(p);
  check('her taban silah listede', rows.length === WEAPONS.length, `${rows.length}`);
  // ⚠️ KİLİTLİ SATIRDA KOŞUL METNİ OLMAK ZORUNDA — boşsa oyuncu ne yapacağını
  // bilmez ve kilit sadece bir engel olur, hedef olmaz.
  const kotu = rows.filter((r) => !r.unlocked && !r.how);
  check('kilitli satırların hepsinde koşul yazıyor', kotu.length === 0,
    kotu.map((r) => r.id).join(',') || 'tamam');
  const acikBos = rows.filter((r) => r.unlocked && r.how);
  check('açık satırda koşul metni YOK', acikBos.length === 0);
}

console.log('\n' + '─'.repeat(62));
if (hata) { console.log(`✗ ${hata} ölçüm sınırın dışında`); process.exit(1); }
console.log('✓ silah açılışı sağlam');
