// TILSIM TESTİ — ikinci gold sink'i.
//
// Buradaki asıl risk "yanlış bonus" değil, SINK'İN DELİNMESİ: tılsım
// yanmazsa oyuncu bir kez alıp sonsuza kadar taşır ve Pedlar's Stall bir
// gold çıkışı olmaktan çıkar.
//
// Çalıştır:  npx tsx src/game/charms.test.mts

import { CHARMS, CHARM_SLOTS, charmBonus, charmById, mergeBonus } from './charms';
import { FORGE, costOf, permanentBonus } from './forge';
import { STAT_BASE } from './config';
import { emptyProgress } from './progress';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n[1] Veri bütünlüğü');
{
  check('tılsım var', CHARMS.length >= 4, `${CHARMS.length} tılsım`);
  check('id\'ler benzersiz', new Set(CHARMS.map((c) => c.id)).size === CHARMS.length);
  check('hepsinin fiyatı pozitif', CHARMS.every((c) => c.cost > 0));
  check('hepsinin etkisi var', CHARMS.every((c) => Object.keys(c.stats).length > 0));

  // ⚠️ Motorun okumadığı bir istatistiği satmak = çalışmayan şeyi satmak.
  // Forge'da bu kural `luck` pasifini eledi; burada da geçerli.
  //
  // ⚠️ TESTİN KENDİ HATASIYDI: önce `STAT_CAP` ile kontrol ediliyordu ve
  // maxHp/growth/moveSpeed/revival "bilinmiyor" çıkıyordu. STAT_CAP sadece
  // TAVANI OLAN istatistikleri listeler; motorun tanıdığı istatistiklerin
  // tam listesi STAT_BASE'tir.
  const bilinen = new Set(Object.keys(STAT_BASE));
  const bilinmeyen = CHARMS.flatMap((c) => Object.keys(c.stats)).filter((k) => !bilinen.has(k));
  check('motorun OKUMADIĞI istatistik satılmıyor', bilinmeyen.length === 0, bilinmeyen.join(', ') || 'temiz');

  // `luck` motorda hiç okunmuyor (Forge'dan da bu yüzden çıkarıldı)
  const luck = CHARMS.filter((c) => 'luck' in c.stats);
  check('ölü `luck` istatistiği satılmıyor', luck.length === 0, luck.map((c) => c.id).join(', ') || 'temiz');

  // ⚠️ GOLD ARTIRAN TILSIM YOK — "gold al → daha çok gold" sarmalı kurulurdu
  const kazanc = CHARMS.filter((c) => 'greed' in c.stats);
  check('gold kazancı SATILMIYOR', kazanc.length === 0, kazanc.map((c) => c.id).join(', ') || 'temiz');
}

console.log('\n[2] Bonus toplama');
{
  const b = charmBonus(['edge', 'draught']);
  check('etkiler toplanıyor', (b.might ?? 0) > 0 && (b.maxHp ?? 0) > 0);

  const iki = charmBonus(['edge', 'edge']);
  const bir = charmBonus(['edge']);
  check('aynı tılsım iki kez YIĞILIR', (iki.might ?? 0) === (bir.might ?? 0) * 2);

  check('bilinmeyen id yok sayılıyor', Object.keys(charmBonus(['yok_boyle'])).length === 0);
  check('boş liste boş bonus', Object.keys(charmBonus([])).length === 0);

  // Forge ile birleşme — ikisi de motorun aynı kanalına gider
  const forge = permanentBonus({ might: 4 });
  const merged = mergeBonus(forge, charmBonus(['edge']));
  check('Forge + tılsım TOPLANIYOR',
    (merged.might ?? 0) > (forge.might ?? 0) && (merged.might ?? 0) > (charmBonus(['edge']).might ?? 0),
    `${forge.might} + ${charmBonus(['edge']).might} = ${merged.might}`);
  check('birleştirme kaynağı BOZMUYOR', (forge.might ?? 0) === permanentBonus({ might: 4 }).might);
}

console.log('\n[3] Forge dengesi — tılsım kestirme OLMAMALI');
{
  // ⚠️ KİLİTLİ KURAL: "kolaylık, kestirme değil". Bir tılsım tek koşuluk
  // olduğu için Forge'dan UCUZ olabilir, ama birkaç koşuda Forge öne
  // geçmeli — yoksa kalıcı güç almanın anlamı kalmaz.
  const edge = charmById('edge')!;
  const might = FORGE.find((u) => u.id === 'might')!;

  // Aynı etkiyi Forge'dan almak kaç seviye ve kaç gold?
  const hedef = edge.stats.might ?? 0;
  let seviye = 0, forgeMaliyet = 0;
  while (might.perLevel * seviye < hedef && seviye < might.maxLevel) {
    forgeMaliyet += costOf(might, seviye);
    seviye += 1;
  }
  const basaBas = forgeMaliyet / edge.cost;
  console.log(`     +%${Math.round(hedef * 100)} hasar: tılsım ${edge.cost} G (tek koşu) · Forge ${forgeMaliyet} G (kalıcı, ${seviye} seviye)`);
  console.log(`     başa baş: ${basaBas.toFixed(1)} koşu`);

  check('tılsım tek koşuda Forge\'dan UCUZ', edge.cost < forgeMaliyet, `${edge.cost} < ${forgeMaliyet}`);
  check('ama birkaç koşuda Forge öne geçiyor (2-8 koşu)',
    basaBas >= 2 && basaBas <= 8, `${basaBas.toFixed(1)} koşu`);
}

console.log('\n[4] Sink sağlığı');
{
  // Tılsımlar sonsuz tüketilir; ağaç gibi doymaz. Bir dolu el ne kadar?
  const enUcuz = Math.min(...CHARMS.map((c) => c.cost));
  const enPahali = Math.max(...CHARMS.map((c) => c.cost));
  const doluElUcuz = enUcuz * CHARM_SLOTS;
  console.log(`     dolu el: ${doluElUcuz} — ${enPahali * CHARM_SLOTS} gold/koşu`);

  check('slot sayısı seçim zorluyor (dar)', CHARM_SLOTS >= 1 && CHARM_SLOTS <= 3, `${CHARM_SLOTS}`);
  check('fiyat aralığı anlamlı (en pahalı ≥ 2× en ucuz)',
    enPahali >= enUcuz * 2, `${enUcuz} → ${enPahali}`);

  // ⚠️ Erken oyuncu ilk bölümün ödülüyle en az bir tılsım alabilmeli, yoksa
  // dükkân uzun süre kapalı bir kapı gibi durur.
  const ilkOdul = 300; // bölüm 1 firstClearGold
  check('ilk bölüm ödülü en az bir tılsıma yetiyor', enUcuz <= ilkOdul, `${enUcuz} ≤ ${ilkOdul}`);
}

console.log('\n[5] Kayıt alanı');
{
  const p = emptyProgress();
  check('yeni kayıtta tılsım YOK', Array.isArray(p.charms) && p.charms.length === 0);
}

console.log(`\n${FAIL.length === 0 ? '✅ TILSIM EKONOMİSİ TUTARLI' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
