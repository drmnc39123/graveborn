// İKİ DÖVÜŞÇÜ TEK SİMÜLASYONDA — gerçek zamanlı 1v1'in motor tarafı.
//
// Buradaki asıl risk sessiz sızıntı: dövüşçüye özel bir fonksiyonda tek bir
// `this.hero` kalırsa rakip birinci oyuncunun istatistikleriyle ateş eder,
// onun XP'sini toplar ya da onun canından yer. Hiçbiri hata vermez —
// sadece maç haksız olur ve kimse sebebini bulamaz.
//
// İkinci risk determinizm: lockstep'te iki tarayıcı AYNI tick'te AYNI
// dünyayı görmek zorunda. Aynı seed + aynı girdi dizisi → aynı sonuç.
//
// Çalıştır:  npx tsx src/game/rival.test.mts

import { Game } from './engine.js';
import { RUN, STAGES } from './config.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/**
 * Koşuyu ilerlet — SEVİYE KARTLARINI OTOMATİK SEÇEREK.
 *
 * ⚠️ Bu şart: motor seviye atlayınca `phase` 'levelup' oluyor ve simülasyon
 * duruyor. Testin döngüsü sadece 'running' beklerken sessizce erken çıkıyor,
 * ölçmek istediği şeye hiç varamıyordu. Gerçek 1v1'de de kart seçimi oyunu
 * DURDURMAYACAK (5 sn sayaç, seçilmezse ilki) — burada aynı davranış.
 */
function ilerlet(g: Game, tick: number, girdi?: (i: number) => [number, number, number, number]) {
  for (let i = 0; i < tick; i++) {
    if (g.phase === 'dead' || g.phase === 'won') break;
    if (g.phase === 'levelup') { g.choose(g.offers[0].id); continue; }
    if (girdi) {
      const [ax, ay, bx, by] = girdi(i);
      g.setInput(ax, ay);
      g.setRivalInput(bx, by);
    }
    g.step();
  }
}

/** Kurulu bir 1v1 — iki dövüşçü, aynı arena */
function duello(seed = 4242, rakipHero = 'ranger') {
  const g = new Game(seed, STAGES[0], {}, 'descent', 'knight', 1, 0);
  g.setViewport(1280, 720);
  g.addRival(rakipHero);
  return g;
}

console.log('\n═══ 1v1 — İKİ DÖVÜŞÇÜ TEK SİMÜLASYONDA ═══');

console.log('\n[1] Kurulum');
{
  const g = duello();
  check('rakip sahnede', !!g.rival);
  check('rakip AYRI karakter', g.rival!.heroId === 'ranger', g.rival!.heroId);
  check('birinci dövüşçü knight', g.hero.heroId === 'knight');
  // ⚠️ Üst üste doğsalar ilk saniyede birbirlerinin düşmanlarını çeker ve
  // maç adaletsiz açılırdı.
  const ara = Math.hypot(g.hero.px - g.rival!.px, g.hero.py - g.rival!.py);
  check('arenanın iki yanında doğuyorlar', ara > RUN.arenaRadius * 0.3,
    `${ara.toFixed(0)} birim`);
  check('rakibin canı kendi tavanından', g.rival!.hp === g.rival!.stats.maxHp,
    `${g.rival!.hp}`);
  check('rakibin KENDİ silahı var', g.rival!.weapons.length === 1,
    g.rival!.weapons[0]?.def.id);
  check('iki dövüşçünün silahı FARKLI',
    g.rival!.weapons[0].def.id !== g.hero.weapons[0].def.id,
    `${g.hero.weapons[0].def.id} vs ${g.rival!.weapons[0].def.id}`);
}

console.log('\n[2] ⭐ Rakip GERÇEKTEN dövüşüyor mu');
{
  // ⚠️ İKİSİ DE HAREKET ETMELİ. İlk sürüm ikisini de sabit tutuyordu ve
  // yanıltıcıydı: menzilli silahlı dövüşçü düşmanı uzakta öldürüyor,
  // mücevherler yere düşüyor ve YERİNDEN KIMILDAMADIĞI için hiç XP
  // toplayamıyordu. "0 XP" bir motor hatası değil, testin kurduğu
  // gerçekçi olmayan sahneydi.
  // ⚠️ GENİŞ TUR ATSINLAR. Dar bir dönüşte menzilli silahlı dövüşçü
  // düşmanı uzakta öldürüyor, mücevherler yere düşüyor ve o hiç XP
  // toplayamıyor — "0 XP" bir motor hatası değil, testin kurduğu sahneydi.
  const g = duello();
  ilerlet(g, 60 * 45, (i) => {
    const a = (i / 60) * 0.55;                    // yavaş dönüş = geniş tur
    return [Math.cos(a), Math.sin(a), Math.cos(-a), Math.sin(-a)];
  });

  const h = g.hero, r = g.rival!;
  console.log(`     birinci: ${h.kills} kill, LV${h.level}, ${h.xpEarned.toFixed(0)} XP`);
  console.log(`     rakip  : ${r.kills} kill, LV${r.level}, ${r.xpEarned.toFixed(0)} XP`);
  // ⚠️ EN ÖNEMLİ KONTROL: rakip kendi silahıyla kendi öldürmesini yapıyor mu.
  // Sızıntı olsaydı buradaki sayı sıfır kalırdı.
  check('rakip düşman ÖLDÜRÜYOR', r.kills > 0, `${r.kills}`);
  check('birinci dövüşçü de öldürüyor', h.kills > 0, `${h.kills}`);
  check('rakip XP topluyor', r.xpEarned > 0, `${r.xpEarned.toFixed(0)}`);
  check('birinci dövüşçü de XP topluyor', h.xpEarned > 0, `${h.xpEarned.toFixed(0)}`);

  // ⚠️ SEVİYE ATLAMA DA AYRIK OLMALI ve bunu doğal koşuyla ölçmek
  // güvenilmez: eşikler yüksek, 45 saniyede kimse atlamayabiliyor. Doğrudan
  // ve kesin ölç — rakibe XP ver, SADECE rakip atlasın.
  const hSeviye = h.level, rSeviye = r.level;
  (g as any).addXp(r, 100_000);
  check('XP verilen dövüşçü seviye atlıyor', r.level > rSeviye, `LV${rSeviye} → LV${r.level}`);
  check('DİĞERİ atlamıyor', h.level === hSeviye, `LV${h.level}`);

  // ⚠️ XP AYRIK OLMALI. Ortak olsaydı ikisi aynı anda aynı seviyeye çıkar
  // ve "kim daha iyi oynadı" sorusu anlamsızlaşırdı.
  check('iki XP havuzu AYRI', h.xpEarned !== r.xpEarned,
    `${h.xpEarned.toFixed(0)} vs ${r.xpEarned.toFixed(0)}`);
  check('iki silah listesi AYRI nesne', h.weapons !== r.weapons);
  check('iki istatistik seti AYRI nesne', h.stats !== r.stats);
}

console.log('\n[3] ⭐ Mermi SAHİPLİ — öldürme kredisi doğru kişiye');
{
  // Sahipsiz mermide rakibin öldürdüğü düşmanın XP'si birinciye yazılırdı.
  const g = duello();
  for (let i = 0; i < 60 * 6; i++) g.step();
  const mermiler = g.projectiles;
  const sahipler = new Set(mermiler.map((p) => p.owner));
  console.log(`     sahnede ${mermiler.length} mermi, ${sahipler.size} ayrı sahip`);
  check('mermilerin sahibi var', mermiler.every((p) => !!p.owner));
  check('her mermi bir DÖVÜŞÇÜYE ait',
    mermiler.every((p) => p.owner === g.hero || p.owner === g.rival));
  // Vuruş alanları da sahipli olmalı
  check('vuruş alanları da sahipli', g.hitZones.every((z) => !!z.owner));
}

console.log('\n[4] ⭐ Düşmanlar EN YAKIN dövüşçüyü hedefliyor');
{
  const g = duello();
  // Dövüşçüleri iyice ayır — sürü ikiye bölünmeli
  g.hero.px = -RUN.arenaRadius * 0.7; g.hero.py = 0;
  g.rival!.px = RUN.arenaRadius * 0.7; g.rival!.py = 0;
  for (let i = 0; i < 60 * 8; i++) g.step();

  const sol = g.enemies.filter((e) => e.x < 0).length;
  const sag = g.enemies.filter((e) => e.x > 0).length;
  console.log(`     sol yarıda ${sol} düşman, sağ yarıda ${sag}`);
  // ⚠️ Hepsi tek tarafa gitseydi hedefleme birinci dövüşçüye sabitlenmiş
  // demektir — rakip düşman görmez ve maç anlamsız olurdu.
  check('sürü İKİYE bölünüyor', sol > 0 && sag > 0, `${sol} / ${sag}`);
  const oran = Math.min(sol, sag) / Math.max(sol, sag);
  check('bölünme tek tarafa yığılmıyor', oran > 0.25, `oran ${oran.toFixed(2)}`);
}

console.log('\n[5] ⭐ Ölüm — maçı KİM kaybetti');
{
  // Rakip ölürse birinci KAZANIR
  const g = duello();
  g.rival!.hp = 1;
  g.rival!.stats.revival = 0;
  g.rival!.px = 0; g.rival!.py = 0;   // sürünün ortasına
  ilerlet(g, 60 * 30);
  check('rakip ölünce faz "won"', g.phase === 'won', g.phase);
  check('ölen rakip artık yaşamıyor', g.rival!.alive === false);

  // Birinci ölürse KAYBEDER
  // ⚠️ YENİLENME KURULUMU BOZUYORDU. `hp = 1` yazmak yetmiyor: `regen`
  // her tick canı dolduruyor ve dövüşçü hiç ölmüyordu; bu arada RAKİP
  // ölünce test "won" görüp yanlış sonuç veriyordu. Ölüm testinde
  // yenilenme kapatılmalı ve rakip ölümsüz yapılmalı ki tek bir şey
  // ölçülsün.
  // ⚠️ SİLAHI ALINMAZSA ÖLMÜYOR. Ölçüldü: 1 canlı bir dövüşçü bile
  // otomatik ateş eden silahıyla yaklaşan her düşmanı temizliyor —
  // 30 saniye boyunca 80 birim yakınına TEK düşman girmedi. Ölüm yolunu
  // sınamak için dövüşçü savunmasız bırakılmalı.
  const g2 = duello();
  g2.hero.stats.revival = 0;
  g2.hero.stats.recovery = 0;
  g2.hero.weapons.length = 0;
  g2.hero.px = 0; g2.hero.py = 0;
  g2.rival!.stats.maxHp = 1e9; g2.rival!.hp = 1e9;
  for (let i = 0; i < 60 * 30; i++) {
    if (g2.phase === 'dead' || g2.phase === 'won') break;
    if (g2.phase === 'levelup') { g2.choose(g2.offers[0].id); continue; }
    g2.hero.hp = Math.min(g2.hero.hp, 1);
    g2.hero.stats.recovery = 0;   // seviye atlayınca yeniden hesaplanıyor
    g2.step();
  }
  check('birinci ölünce faz "dead"', g2.phase === 'dead', g2.phase);
  check('ölen birinci dövüşçü yaşamıyor', g2.hero.alive === false);
}

console.log('\n[6] ⭐ Ölü dövüşçü simülasyona KATILMIYOR');
{
  const g = duello();
  ilerlet(g, 60 * 4);
  const r = g.rival!;
  const oncekiKill = r.kills;
  r.alive = false;
  const yerX = r.px;
  ilerlet(g, 60 * 6, () => [0, 0, 1, 0]);   // rakip hareket etmeyi DENESİN
  check('ölü dövüşçü hareket etmiyor', r.px === yerX, `${r.px.toFixed(1)}`);
  check('ölü dövüşçü öldürmüyor', r.kills === oncekiKill, `${r.kills}`);
}

console.log('\n[7] ⭐ DETERMİNİZM — lockstep\'in tek dayanağı');
{
  // Aynı seed + aynı girdi dizisi → aynı sonuç. Bu tutmazsa iki tarayıcı
  // farklı dünyalar görür ve 1v1 imkânsız olur.
  const oynat = () => {
    const g = duello(99991);
    // Deterministik ama değişken girdi — sabit girdi çok az şey kanıtlar
    ilerlet(g, 60 * 20, (i) => {
      const a = (i % 120) / 120 * Math.PI * 2;
      return [Math.cos(a), Math.sin(a), -Math.cos(a), Math.sin(a * 0.5)];
    });
    return [
      g.hero.kills, g.rival!.kills, g.hero.level, g.rival!.level,
      Math.round(g.hero.px), Math.round(g.rival!.px),
      Math.round(g.hero.hp), Math.round(g.rival!.hp),
      g.enemies.length, g.phase,
    ].join('|');
  };
  const a = oynat(), b = oynat();
  console.log(`     ${a}`);
  check('aynı girdi → BİREBİR aynı sonuç', a === b);

  // Girdi değişirse sonuç da değişmeli (test kendini kandırmasın)
  const g = duello(99991);
  ilerlet(g, 60 * 20, () => [0, 1, 0, -1]);
  const c = [g.hero.kills, g.rival!.kills, Math.round(g.hero.px)].join('|');
  check('farklı girdi → farklı sonuç', !a.startsWith(c), c);
}

console.log('\n[8] ⭐ SOLO KOŞU DOKUNULMADI');
{
  // ⚠️ En kritik güvence: `rival` null iken motor tek satır fazladan iş
  // yapmamalı. `sim.test.mts` mührü (1d204abe) bunu zaten kanıtlıyor;
  // burada niyeti açıkça yazıyoruz.
  const solo = new Game(777, STAGES[0], {}, 'descent', 'knight', 1, 0);
  solo.setViewport(1280, 720);
  check('yeni koşuda rakip YOK', solo.rival === null);
  for (let i = 0; i < 600; i++) {
    if (solo.phase === 'levelup') { solo.choose(solo.offers[0].id); continue; }
    solo.step();
  }
  check('solo koşu sorunsuz ilerliyor', solo.time > 0 && solo.hero.kills >= 0,
    `${solo.hero.kills} kill`);
  check('solo koşuda rakip hâlâ yok', solo.rival === null);
}

console.log(`\n${FAIL.length === 0 ? '✅ İKİ DÖVÜŞÇÜ TEK SİMÜLASYONDA ÇALIŞIYOR' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
