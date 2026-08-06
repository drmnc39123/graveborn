// FORGE EKONOMİ DENGESİ — sayılarla doğrulanır, hisle değil.
//
// ESKİ KISIT (artık geçersiz): oyundaki gold 8.800'de sabitti, ağaç ona göre
// kısılmıştı. O model oyunu ~30 dakikada bitiriyordu.
//
// YENİ KISIT (KARMA MODEL): gold SONSUZ akıyor (derinlik ödülü + nadir düşüş).
//   - Forge erken-orta oyunun güç TABANI; bitirilebilir olması SORUN DEĞİL
//   - erken oyunda hemen bir şey alınabilmeli (ilk his)
//   - tek para mimarisinde P2W sarmalı için: Forge kalıcı bir TABAN verir,
//     motorun STAT_CAP'ini DOLDURMAZ — farkın çoğunu koşu içi ilerleme taşır
//
// ⚠️ EMEKLİYE AYRILAN KURAL: "ağaç ASLA doymamalı".
// O kural Forge'un TEK gold sinki olduğu tasarımdan kalmaydı — dolduğunda
// harcanacak yer kalmıyor, ekonomi ölüyordu. Karma model kararıyla asıl
// sinkler sonsuz ve tekrarlanan olanlar (Reliquary, Grave Goods, The Wager,
// Crypt Deed, Ossuary); Forge'un bitmesi artık bir son değil bir kilometre
// taşı. Kuralı GERİ KOYMAYIN: geri koymak ağacı yeniden 1,6 milyona şişirir
// ve ölçülen sonuç şuydu — %84,8'i 3 satırda, en pahalı seviye 157 koşu,
// yani oyuncuya 15 seçenek gösterip 3 tanesinde karar verdiren sahte bir ağaç.
//
// Çalıştır:  npx tsx src/game/forge.test.mts

import { STAGES, STAT_BASE, STAT_CAP, depthGold, descentStage, stageById, type StatKey } from './config.js';
import { FORGE, costOf, permanentBonus, spentOn, totalCost, treeTotalCost } from './forge.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/** Bir bölümde derinlik D'ye kadar inen oyuncunun toplam ilerleme gold'u */
function goldByDepth(stageId: number, depth: number): number {
  let s = STAGES.reduce((n, st) => n + st.firstClearGold, 0); // kampanya bir kez
  for (let d = 1; d <= depth; d++) s += depthGold(stageId, d);
  return s;
}

/** Verilen bütçeyle ağaçtan kaç seviye alınabilir (hep en ucuzu seçerek) */
function levelsAffordable(budget: number): { levels: number; spent: number } {
  const lv: Record<string, number> = {};
  let spent = 0, levels = 0;
  for (;;) {
    let best: { id: string; cost: number } | null = null;
    for (const u of FORGE) {
      const cur = lv[u.id] ?? 0;
      if (cur >= u.maxLevel) continue;
      const c = costOf(u, cur);
      if (!best || c < best.cost) best = { id: u.id, cost: c };
    }
    if (!best || spent + best.cost > budget) break;
    spent += best.cost;
    lv[best.id] = (lv[best.id] ?? 0) + 1;
    levels += 1;
  }
  return { levels, spent };
}

const tree = treeTotalCost();

console.log('\n[1] Ağacın büyüklüğü ve şekli');
const campaignGold = STAGES.reduce((n, st) => n + st.firstClearGold, 0);
console.log(`     kampanya toplam gold  : ${campaignGold.toLocaleString('en-US')}`);
console.log(`     ağacın toplam maliyeti: ${tree.toLocaleString('en-US')}`);
// Kampanya TEK SEFERLİK içerik. Ağaç onunla dolabiliyorsa descent'in ekonomik
// bir sebebi kalmaz — merdiven sadece leaderboard süsü olur.
check('ağaç kampanya gelirinden belirgin pahalı', tree > campaignGold * 2.5,
  `${tree.toLocaleString('en-US')} > ${(campaignGold * 2.5).toLocaleString('en-US')}`);

// ⚠️ ASIL ŞEKİL TESTİ. Eski ağaçta 15 satırın 3'ü paranın %84,8'ini yutuyordu;
// geri kalan 12 satır oyuncuya karar gibi görünen ama karar OLMAYAN süstü.
// Bu bir maliyet sorunu değil GEOMETRİK BÜYÜME sorunuydu: 1,55^19 ≈ 4.133.
const satirlar = FORGE.map((u) => ({ u, cost: totalCost(u) })).sort((a, b) => b.cost - a.cost);
const enBuyukPay = satirlar[0].cost / tree;
const ilkUcPay = (satirlar[0].cost + satirlar[1].cost + satirlar[2].cost) / tree;
console.log(`     en pahalı satır ${satirlar[0].u.name}: ağacın %${(enBuyukPay * 100).toFixed(1)}'i`);
console.log(`     ilk 3 satır: ağacın %${(ilkUcPay * 100).toFixed(1)}'i`);
check('tek satır ağacın %20\'sini geçmiyor', enBuyukPay <= 0.20, `%${(enBuyukPay * 100).toFixed(1)}`);
check('ilk 3 satır ağacın %45\'ini geçmiyor', ilkUcPay <= 0.45, `%${(ilkUcPay * 100).toFixed(1)}`);

// Bir satırın son seviyesi ilkinin kaç katı — patlama koruması. Uzun satırlarda
// (maxLevel 20) yüksek growth burayı 4.000 katına çıkarıyordu.
let enKotuPatlama = 0, patlayan = '';
for (const u of FORGE) {
  const oran = costOf(u, u.maxLevel - 1) / costOf(u, 0);
  if (oran > enKotuPatlama) { enKotuPatlama = oran; patlayan = u.name; }
}
console.log(`     en dik satır ${patlayan}: son seviye ilkinin ${Math.round(enKotuPatlama)} katı`);
check('hiçbir satırda son seviye ilkinin 200 katını geçmiyor', enKotuPatlama <= 200,
  `${patlayan} ${Math.round(enKotuPatlama)}×`);

// Karma modelde ağaç BİTEBİLİR — ama ancak gerçek descent oyunundan sonra.
// Sığ oyunla dolabiliyorsa erken oyun tükenmiş demektir.
let saturationDepth = 0;
for (let d = 1; d <= 400; d++) {
  if (goldByDepth(5, d) >= tree) { saturationDepth = d; break; }
}
const wall = descentStage(5, saturationDepth || 400).hpMul;
console.log(`     ağacın doyduğu derinlik: ${saturationDepth || '>400'} ` +
  `(orada düşman canı ${wall.toExponential(1)}× taban)`);
check('ağaç ancak DERİN oyunla doyuyor', saturationDepth === 0 || saturationDepth >= 40,
  `derinlik ${saturationDepth}`);
// Sığ oyuncu (d20) ağacı bitirememeli — yoksa ilk gün her şey açılır
const sig = goldByDepth(5, 20);
console.log(`     derinlik 20'ye inenin geliri: ${Math.round(sig).toLocaleString('en-US')}` +
  ` (ağacın %${Math.round((sig / tree) * 100)}'i)`);
check('sığ oyun ağacın yarısını geçmiyor', sig < tree * 0.5,
  `%${Math.round((sig / tree) * 100)} < %50`);

console.log('\n[2] Erken oyun hissi');
const firstStage = STAGES[0].firstClearGold;
const affordable = FORGE.filter((u) => costOf(u, 0) <= firstStage);
console.log(`     1. bölüm ödülü ${firstStage} gold → ${affordable.length}/${FORGE.length} yükseltme açılabiliyor`);
check('ilk bölüm parasıyla en az 5 yükseltme alınabiliyor', affordable.length >= 5, `${affordable.length}`);
const cheapest = Math.min(...FORGE.map((u) => costOf(u, 0)));
check('en ucuz alım ilk ödülün yarısından ucuz', cheapest <= firstStage / 2, `${cheapest} gold`);

console.log('\n[3] Maliyet eğrisi');
let monotone = true;
for (const u of FORGE) {
  for (let lv = 1; lv < u.maxLevel; lv++) {
    if (costOf(u, lv) <= costOf(u, lv - 1)) monotone = false;
  }
}
check('her seviye bir öncekinden pahalı', monotone);
check('maxLevel sonrası maliyet Infinity', costOf(FORGE[0], FORGE[0].maxLevel) === Infinity);

console.log('\n[4] İlerleme eğrisi (derinlik → alınabilen seviye)');
let prev = -1, curveOk = true;
for (const d of [0, 5, 10, 20, 40, 70, 100]) {
  const { levels } = levelsAffordable(goldByDepth(5, d));
  console.log(`     derinlik ${String(d).padStart(3)} → ${String(levels).padStart(3)} seviye`);
  if (levels < prev) curveOk = false;
  prev = levels;
}
check('derinleştikçe alınabilen seviye artıyor (hiç düşmüyor)', curveOk);
check('ilk derinliklerde de ilerleme var', levelsAffordable(goldByDepth(5, 10)).levels
  > levelsAffordable(goldByDepth(5, 0)).levels);

console.log('\n[5] Bonus hesabı');
const b1 = permanentBonus({ might: 3 });
check('might 3 seviye = +%15', Math.abs((b1.might ?? 0) - 0.15) < 1e-9, `${b1.might}`);
const b2 = permanentBonus({ cooldown: 4 });
check('cooldown AZALTIYOR (negatif)', (b2.cooldown ?? 0) < 0, `${b2.cooldown}`);
const mightDef = FORGE.find((u) => u.id === 'might')!;
const b3 = permanentBonus({ might: 999 });
check('maxLevel aşılamıyor', Math.abs((b3.might ?? 0) - mightDef.perLevel * mightDef.maxLevel) < 1e-9,
  `${b3.might} (max ${mightDef.maxLevel} × ${mightDef.perLevel})`);
check('boş kayıt bonus vermiyor', Object.keys(permanentBonus({})).length === 0);
const maxAll = Object.fromEntries(FORGE.map((u) => [u.id, u.maxLevel]));
check('spentOn tam ağaç = treeTotalCost', spentOn(maxAll) === tree, `${spentOn(maxAll)}`);
check('spentOn maxLevel üstünü saymıyor',
  spentOn(Object.fromEntries(FORGE.map((u) => [u.id, u.maxLevel + 50]))) === tree);

// ── 6) P2W tavanı ──
// Tek para mimarisinde gold token'la satın alınabilecek. Sarmalı törpüleyen
// kural bir İDDİA — test edilmeden yazılmaz.
console.log('\n[6] P2W tavanı: Forge STAT_CAP\'i doldurmuyor');
{
  const full = permanentBonus(maxAll);
  const capped: StatKey[] = ['might', 'armor', 'area', 'amount'];
  for (const k of capped) {
    const cap = STAT_CAP[k]!;
    const value = STAT_BASE[k] + (full[k] ?? 0);
    console.log(`     ${k.padEnd(7)} taban ${STAT_BASE[k]} → tam Forge ${value.toFixed(2)} / tavan ${cap}` +
      ` (%${((value / cap) * 100).toFixed(0)})`);
    check(`${k}: tam Forge tavanın yarısını aşmıyor`, value <= cap * 0.5,
      `${value.toFixed(2)} ≤ ${cap * 0.5}`);
  }
  const cd = STAT_BASE.cooldown + (full.cooldown ?? 0);
  check('cooldown Forge ile dibe vurmuyor', cd > 0.5, `${cd.toFixed(2)}`);
}

console.log('\n[7] Maliyet tablosu');
for (const u of FORGE) {
  const first3 = Array.from({ length: Math.min(3, u.maxLevel) }, (_, i) => costOf(u, i));
  console.log(`     ${u.name.padEnd(16)} L1-3 [${first3.join(', ')}] … Lmax ${costOf(u, u.maxLevel - 1).toLocaleString('en-US')}` +
    `   toplam ${totalCost(u).toLocaleString('en-US')}`);
}

// ── 8) Motora yansıma ──
// Ağacı kurup motora bağlamamak en sinsi hata olurdu: oyuncu gold harcar,
// hiçbir şey değişmez. Ölçerek doğruluyoruz.
console.log('\n[8] Motora yansıma');
{
  const { Game } = await import('./engine.js');
  const { TICK } = await import('./config.js');
  const seed = 12345;

  const base = new Game(seed);
  const buffed = new Game(seed, undefined, permanentBonus({
    might: 16, health: 16, armor: 10, cooldown: 12, mspeed: 12, amount: 3, revival: 3,
  }));

  check('Might yükseltmesi hasarı artırıyor', buffed.stats.might > base.stats.might,
    `${base.stats.might.toFixed(2)} → ${buffed.stats.might.toFixed(2)}`);
  check('Max can artıyor', buffed.stats.maxHp > base.stats.maxHp,
    `${base.stats.maxHp} → ${Math.round(buffed.stats.maxHp)}`);
  check('Can dolu başlıyor', Math.abs(buffed.hp - buffed.stats.maxHp) < 1e-6,
    `${Math.round(buffed.hp)}/${Math.round(buffed.stats.maxHp)}`);
  check('Armor artıyor', buffed.stats.armor > base.stats.armor,
    `${base.stats.armor} → ${buffed.stats.armor}`);
  check('Cooldown AZALIYOR', buffed.stats.cooldown < base.stats.cooldown,
    `${base.stats.cooldown.toFixed(2)} → ${buffed.stats.cooldown.toFixed(2)}`);
  check('Hareket hızı artıyor', buffed.stats.moveSpeed > base.stats.moveSpeed,
    `${base.stats.moveSpeed.toFixed(2)} → ${buffed.stats.moveSpeed.toFixed(2)}`);
  check('Ekstra mermi geliyor', buffed.stats.amount > base.stats.amount,
    `${base.stats.amount} → ${buffed.stats.amount}`);
  check('Diriliş hakkı geliyor', buffed.stats.revival > base.stats.revival,
    `${base.stats.revival} → ${buffed.stats.revival}`);

  // ÖLÇÜM YERİ ÖNEMLİ: 1. bölüm SPAWN-LİMİTLİ (100 düşman / 1.6 spawn = 62,5 sn
  // taban). Orada güçlü oyuncu da zayıf oyuncu da aynı sürede bitirir, çünkü
  // darboğaz DPS değil düşmanın sahaya çıkma hızı — ölçüm gürültüye boğulur.
  // (Bu tuzağa bir kez düşüldü: yükseltmeli oyuncu "daha yavaş" çıktı.)
  // Bu yüzden ölçüm EN ZOR bölümde, SABİT pencerede, kill sayısıyla yapılıyor.
  // ⚠️ ÖLÇÜM BÖLÜMÜ "SON BÖLÜM" DEĞİL. Kampanya 25 bölüme çıkınca burası
  // kırmızı yandı: 25. bölümün hasar çarpanı 7,2 ve tek temas oyuncuyu
  // öldürüyor, sahne dolmadan koşu bitiyordu. Bu ölçümün niyeti "en zoru
  // ölç" değil, "YOĞUN ve temsili bir sahnede yükseltme fark yaratıyor mu".
  const heavy = stageById(10) ?? STAGES[STAGES.length - 1];
  const killsIn = (g: InstanceType<typeof Game>, seconds: number) => {
    g.setViewport(1280, 720);
    let peakAlive = 0;
    for (let i = 0; i < Math.round(seconds / TICK); i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;                 // ölüm değişkenini dışla, güç ölçüyoruz
      const t = i * TICK;
      g.setInput(Math.cos(t * 0.7), Math.sin(t * 0.7));
      g.step();
      if (g.enemies.length > peakAlive) peakAlive = g.enemies.length;
    }
    return { kills: g.kills, peakAlive };
  };
  const rBase = killsIn(new Game(seed, heavy), 150);
  const rBuff = killsIn(new Game(seed, heavy, permanentBonus({ might: 20, cooldown: 12, amount: 3, area: 18 })), 150);
  console.log(`     ${heavy.name}, 150 sn — yükseltmesiz ${rBase.kills} kill · yükseltmeli ${rBuff.kills} kill`);
  // "Boş sahne ölçmüyoruz" kontrolü kill ile YAPILAMAZ: yükseltmesiz oyuncu bu
  // bölümde zaten neredeyse hiç öldüremiyor (asıl bulgu bu). Doğru kontrol
  // sahnede düşman OLUP OLMADIĞI.
  check('sahne gerçekten dolu (ölçüm boş değil)', rBase.peakAlive > 30,
    `tepe ${rBase.peakAlive} düşman`);
  check('yükseltmeli oyuncu belirgin daha çok öldürüyor', rBuff.kills > rBase.kills * 1.1,
    `${rBase.kills} → ${rBuff.kills} (+%${Math.round(((rBuff.kills - rBase.kills) / rBase.kills) * 100)})`);
}

console.log(`\n${FAIL.length === 0 ? '✅ FORGE EKONOMİSİ TUTARLI' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
