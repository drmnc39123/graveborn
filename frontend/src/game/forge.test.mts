// FORGE EKONOMİ DENGESİ — sayılarla doğrulanır, hisle değil.
//
// Kritik kısıt: oyundaki gold SONLU (bölüm tavanları toplamı) ve tekrar
// oynayınca gelmiyor. Ağaç bu bütçeye göre kurulmuş olmalı:
//   - hepsi alınamamalı (seçim olsun)
//   - ama anlamlı bir kısmı alınabilmeli (ilerleme hissi olsun)
//   - ilk bölümün ardından hemen bir şey alınabilmeli

import { STAGES } from './config.js';
import { FORGE, costOf, totalCost, treeTotalCost, permanentBonus } from './forge.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const budget = STAGES.reduce((s, st) => s + st.goldCap, 0);
const tree = treeTotalCost();

console.log('\n[1] Bütçe');
console.log(`     oyundaki TOPLAM gold : ${budget}`);
console.log(`     ağacın toplam maliyeti: ${tree}`);
console.log(`     alınabilir oran       : %${Math.round((budget / tree) * 100)}`);
check('ağaç bütçeden pahalı (hepsi alınamaz)', tree > budget, `${tree} > ${budget}`);
check('ağaç ulaşılamaz derecede pahalı değil', tree < budget * 2.2, `${tree} < ${Math.round(budget * 2.2)}`);

console.log('\n[2] İlk bölüm sonrası alınabilirlik');
const firstCap = STAGES[0].goldCap;
const affordable = FORGE.filter((u) => costOf(u, 0) <= firstCap);
console.log(`     1. bölüm tavanı: ${firstCap} gold`);
console.log(`     alınabilen ilk seviyeler: ${affordable.length}/${FORGE.length}`);
check('ilk bölüm parasıyla en az 5 yükseltme alınabiliyor', affordable.length >= 5, `${affordable.length}`);
const cheapest = Math.min(...FORGE.map((u) => costOf(u, 0)));
check('en ucuz alım 1. bölümün yarısından ucuz', cheapest <= firstCap / 2, `${cheapest} gold`);

console.log('\n[3] Maliyet eğrisi artıyor');
let monotone = true;
for (const u of FORGE) {
  for (let lv = 1; lv < u.maxLevel; lv++) {
    if (costOf(u, lv) < costOf(u, lv - 1)) monotone = false;
  }
}
check('her seviye bir öncekinden pahalı', monotone);

console.log('\n[4] Yükseltmeler motorun KULLANDIĞI istatistiklere bağlı');
// engine.ts'te okunan istatistikler (grep ile doğrulandı)
const USED = new Set(['might', 'armor', 'maxHp', 'recovery', 'cooldown', 'area',
  'projSpeed', 'duration', 'amount', 'moveSpeed', 'magnet', 'growth', 'greed', 'curse', 'revival']);
const dead = FORGE.filter((u) => !USED.has(u.stat));
check('ölü yükseltme yok (hepsi motorda okunuyor)', dead.length === 0,
  dead.length ? dead.map((d) => `${d.id}→${d.stat}`).join(', ') : `${FORGE.length} yükseltme`);

console.log('\n[5] Bonus hesabı doğru');
const b1 = permanentBonus({ might: 3 });
check('might 3 seviye = +%18', Math.abs((b1.might ?? 0) - 0.18) < 1e-9, `${b1.might}`);
const b2 = permanentBonus({ cooldown: 4 });
check('cooldown AZALTIYOR (negatif)', (b2.cooldown ?? 0) < 0, `${b2.cooldown}`);
const b3 = permanentBonus({ might: 999 });
check('maxLevel aşılamıyor', Math.abs((b3.might ?? 0) - 0.06 * 5) < 1e-9, `${b3.might}`);
const b4 = permanentBonus({});
check('boş kayıt bonus vermiyor', Object.keys(b4).length === 0);

console.log('\n[6] Maliyet tablosu');
for (const u of FORGE) {
  const each = Array.from({ length: u.maxLevel }, (_, i) => costOf(u, i));
  console.log(`     ${u.name.padEnd(16)} ${String(totalCost(u)).padStart(5)} toplam   [${each.join(', ')}]`);
}

// ── [7] Kalıcı bonuslar MOTORA gerçekten yansıyor mu ──
// Ağacı kurup motora bağlamamak en sinsi hata olurdu: oyuncu gold harcar,
// hiçbir şey değişmez. Ölçerek doğruluyoruz.
console.log('\n[7] Motora yansıma');
{
  const { Game } = await import('./engine.js');
  const seed = 12345;

  const base = new Game(seed);
  const buffed = new Game(seed, undefined, permanentBonus({
    might: 5, health: 5, armor: 3, cooldown: 4, mspeed: 4, amount: 1, revival: 2,
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

  // Aynı seed ile yükseltmeli oyuncu bölümü DAHA HIZLI temizlemeli.
  // (Önce "kaç kill" diye ölçüyordum: 1. bölümde 100 düşman var, ikisi de
  //  hepsini öldürüp 100'de eşitleniyordu — tavan ölçümü boğuyordu.)
  const { TICK } = await import('./config.js');
  const clearTime = (g: InstanceType<typeof Game>) => {
    g.setViewport(1280, 720);
    for (let i = 0; i < Math.round(600 / TICK); i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;                 // ölüm değişkenini dışla, güç ölçüyoruz
      const t = i * TICK;
      g.setInput(Math.cos(t * 0.7), Math.sin(t * 0.7));
      g.step();
      if (g.remaining === 0) break;
    }
    return { sec: g.time, kills: g.kills, kalan: g.remaining };
  };
  const rBase = clearTime(new Game(seed));
  const rBuff = clearTime(new Game(seed, undefined, permanentBonus({ might: 5, cooldown: 4, amount: 1, area: 4 })));
  console.log(`     yükseltmesiz: ${rBase.sec.toFixed(1)} sn (${rBase.kills} kill, kalan ${rBase.kalan})`);
  console.log(`     yükseltmeli : ${rBuff.sec.toFixed(1)} sn (${rBuff.kills} kill, kalan ${rBuff.kalan})`);
  check('yükseltmeli oyuncu bölümü daha hızlı temizliyor', rBuff.sec < rBase.sec,
    `${rBase.sec.toFixed(1)} sn → ${rBuff.sec.toFixed(1)} sn`);
}

console.log(`\n${FAIL.length === 0 ? '✅ FORGE EKONOMİSİ TUTARLI' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
