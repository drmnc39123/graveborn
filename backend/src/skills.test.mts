// BECERİ AĞACI — SUNUCU TESTİ.
//
// Tasarım dengesi `frontend/src/game/skills.test.mts`'te. Burada sunucuya
// özgü üç risk var:
//   1. PUANIN TÜRETİLMESİ — istemcinin gönderdiği liste bir yetki değil;
//      kayıt bayatlarsa da güç vermeye devam etmemeli
//   2. RESPEC MUHASEBESİ — bedel MEVCUT dağılımdan alınmalı, yoksa "önce
//      hepsini sil, sonra bedava yeniden diz" açığı doğar
//   3. YARIŞ — iki sekme birbirinin dağılımını ezmemeli, gold iki kez
//      düşmemeli
//
// Çalıştır:  npx tsx src/skills.test.mts

import { SKILLS, respecCost, sanitizeSkills, skillPoints, spentPoints } from '@game/skills';
import { prisma } from './db.js';
import { listSkills, pointsOf, setSkills, skillsBonusOf } from './skills.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_SKILL_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
const get = (n: number) => prisma.player.findUniqueOrThrow({ where: { wallet: w(n) } });

// ⚠️ Puan `depthPaid`'ten TÜRÜYOR — kurulumda derinlik veriyoruz, puan değil.
await prisma.player.createMany({
  data: [
    { wallet: w(0), gold: 500_000, depthPaid: { '1': 60 } },   // 12 puan
    { wallet: w(1), gold: 0, depthPaid: { '1': 60 } },          // puanı var, gold'u yok
    { wallet: w(2), gold: 500_000, depthPaid: {} },             // hiç derinlik yok
  ],
});

console.log('\n═══ BECERİ AĞACI (SUNUCU) ═══');

console.log('\n[1] ⭐ Puan SATIN ALINMIYOR, derinlikten türüyor');
{
  const v0 = await listSkills(w(0));
  check('derinlik 60 → 12 puan', v0.points === skillPoints(60), `${v0.points}`);
  const v2 = await listSkills(w(2));
  check('derinliksiz oyuncunun puanı YOK', v2.points === 0, `${v2.points}`);
  check('başlangıçta dağılım boş', v0.nodes.length === 0);

  // ⚠️ Puan için ayrı bir sütun YOK — olsaydı doğrulanması gereken ikinci
  // bir sayı ve senkron dışı kalabilecek bir kaynak olurdu.
  const sutunlar = Object.keys(await get(0));
  check('veritabanında "points" sütunu YOK', !sutunlar.includes('points'),
    sutunlar.filter((k) => /skill|point/i.test(k)).join(', '));
}

console.log('\n[2] ⭐ İstemcinin isteği YETKİ DEĞİL');
{
  // Hepsini iste — sunucu hak edilene indirmeli
  const hepsi = ['blade_edge', 'blade_reach', 'blade_wide', 'blade_many', 'blade_ruin',
    'bulwark_hide', 'bulwark_plate', 'bulwark_wall', 'bulwark_return',
    'quick_hands', 'quick_step', 'quick_flow', 'quick_far', 'quick_haste',
    'cov_edge', 'cov_learn', 'cov_frenzy', 'cov_curse', 'cov_pact'];
  const r = await setSkills(w(0), hepsi);
  check('"hepsini ver" isteği KIRPILDI', r.view.nodes.length < hepsi.length,
    `${r.view.nodes.length}/${hepsi.length}`);
  check('harcanan puan tavanı aşmıyor', r.view.spent <= r.view.points,
    `${r.view.spent}/${r.view.points}`);
  const zirve = r.view.nodes.filter((id) => /ruin|return|haste|pact/.test(id)).length;
  check('yalnızca bir zirve geçti', zirve <= SKILLS.maxCapstones, `${zirve}`);

  // ⚠️ Puanı olmayan oyuncu HİÇBİR ŞEY alamaz
  const bos = await setSkills(w(2), hepsi);
  check('puansız oyuncuya hiçbir düğüm verilmedi', bos.view.nodes.length === 0);
  check('puansız oyuncudan gold da alınmadı', bos.charged === 0
    && (await get(2)).gold === 500_000);
}

console.log('\n[3] ⭐ Bayat kayıt SESSİZCE güç vermiyor');
{
  // ⚠️ Elle düzenlenmiş / eskimiş bir kayıt doğrudan okunsaydı, denge
  // değiştiğinde ya da kural sıkılaştığında eski satır güç vermeye devam
  // ederdi. Okuma da doğrulamadan geçiyor.
  await prisma.player.update({
    where: { wallet: w(0) },
    data: { skills: ['blade_ruin', 'bulwark_return', 'quick_haste', 'cov_pact', 'yok_boyle'] },
  });
  const v = await listSkills(w(0));
  check('önkoşulsuz zirveler OKUMADA eleniyor', v.nodes.length === 0,
    v.nodes.join(', ') || 'boş');
  const b = await skillsBonusOf(w(0));
  check('bayat kayıttan bonus ÇIKMIYOR', Object.keys(b).length === 0, JSON.stringify(b));

  // Geçerli bir dağılım geri yazıp devam et
  await setSkills(w(0), ['blade_edge', 'blade_many', 'quick_hands']);
  const v2 = await listSkills(w(0));
  check('geçerli dağılım kaydediliyor', v2.nodes.length === 3, v2.nodes.join(', '));
  const b2 = await skillsBonusOf(w(0));
  check('bonus sunucudan okunuyor', Object.keys(b2).length > 0, JSON.stringify(b2));
  check('bonusta greed YOK', !('greed' in b2));
}

console.log('\n[4] ⭐ EKLEME BEDAVA, ÇIKARMA ÜCRETLİ');
{
  const goldOnce = (await get(0)).gold;
  // Sadece ekleme → üst küme → bedava
  const ek = await setSkills(w(0), ['blade_edge', 'blade_many', 'quick_hands', 'quick_step']);
  check('yalnızca EKLEME bedava', ek.charged === 0, `${ek.charged} gold`);
  check('gold değişmedi', (await get(0)).gold === goldOnce);
  check('yeni düğüm eklendi', ek.view.nodes.includes('quick_step'));

  // ⚠️ BEDEL MEVCUT DAĞILIMDAN. Yeniye göre hesaplansaydı oyuncu önce
  // hepsini silip (bedel ~0) sonra bedava yeniden dizerdi.
  const mevcut = ek.view.nodes;
  const beklenen = respecCost(mevcut);
  const geri = await setSkills(w(0), ['bulwark_hide', 'bulwark_plate']);
  check('ÇIKARMA respec ücreti aldı', geri.charged === beklenen,
    `${geri.charged} = ${spentPoints(mevcut)} puan × ${SKILLS.respecPerPoint}`);
  check('gold gerçekten düştü', (await get(0)).gold === goldOnce - beklenen,
    `${goldOnce} → ${(await get(0)).gold}`);
  check('yeni dağılım yazıldı', geri.view.nodes.join() === 'bulwark_hide,bulwark_plate');

  // ⚠️ "Hepsini sil sonra yeniden diz" açığı: silme de ÜCRETLİ olmalı
  const oncesi = (await get(0)).gold;
  const sil = await setSkills(w(0), []);
  check('hepsini SİLMEK de ücretli', sil.charged > 0, `${sil.charged} gold`);
  check('silmenin bedeli tahsil edildi', (await get(0)).gold === oncesi - sil.charged);
  const yeniden = await setSkills(w(0), ['cov_edge', 'cov_frenzy']);
  check('boş ağaca ekleme yine bedava', yeniden.charged === 0);
}

console.log('\n[5] Gold yetmezse respec REDDEDİLİYOR');
{
  await setSkills(w(1), ['blade_edge', 'blade_many', 'blade_ruin']);
  const v = await listSkills(w(1));
  check('gold\'suz oyuncu düğüm ALABİLİYOR (ekleme bedava)', v.nodes.length > 0,
    v.nodes.join(', '));

  let gecti = true;
  try { await setSkills(w(1), ['bulwark_hide']); } catch { gecti = false; }
  check('gold\'suz oyuncu RESPEC YAPAMIYOR', !gecti);
  check('dağılımı bozulmadı', (await listSkills(w(1))).nodes.join() === v.nodes.join());
  check('gold eksiye düşmedi', (await get(1)).gold === 0);
}

console.log('\n[6] ⭐ Eşzamanlı respec — gold iki kez düşüyor mu');
{
  await prisma.player.update({ where: { wallet: w(0) }, data: { gold: 500_000 } });
  await setSkills(w(0), ['blade_edge', 'blade_many', 'quick_hands', 'quick_step']);
  const oncesi = (await get(0)).gold;
  const bedel = respecCost((await listSkills(w(0))).nodes);

  // Aynı anda beş respec isteği
  const r = await Promise.all([1, 2, 3, 4, 5].map(() =>
    setSkills(w(0), ['bulwark_hide']).then((x) => x.charged).catch(() => -1)));
  const gecen = r.filter((x) => x >= 0).length;
  const odenen = oncesi - (await get(0)).gold;
  console.log(`     5 eşzamanlı respec → ${gecen} geçti, ${odenen} gold ödendi (tek bedel ${bedel})`);
  check('yalnızca BİR respec ücreti alındı', odenen === bedel, `${odenen}`);
  check('gold eksiye inmedi', (await get(0)).gold >= 0);
  const son = await listSkills(w(0));
  check('dağılım tutarlı kaldı', son.nodes.join() === 'bulwark_hide', son.nodes.join());
}

console.log('\n[7] Puan derinlikle BÜYÜYOR, dağılım korunuyor');
{
  await prisma.player.update({ where: { wallet: w(0) }, data: { depthPaid: { '1': 120 } } });
  const v = await listSkills(w(0));
  check('derinlik 120 → puan tavanı', v.points === SKILLS.maxPoints, `${v.points}`);
  check('eski dağılım korundu', v.nodes.includes('bulwark_hide'));

  // Derinlik DÜŞERSE (olmamalı ama) dağılım kırpılmalı, güç sızmamalı
  await prisma.player.update({
    where: { wallet: w(0) },
    data: { depthPaid: { '1': 120 }, skills: ['blade_edge', 'blade_many', 'blade_ruin', 'bulwark_hide', 'bulwark_wall', 'bulwark_plate'] },
  });
  const dolu = await listSkills(w(0));
  await prisma.player.update({ where: { wallet: w(0) }, data: { depthPaid: { '1': 10 } } });
  const kirpik = await listSkills(w(0));
  console.log(`     puan 24→2: ${dolu.nodes.length} düğüm → ${kirpik.nodes.length} düğüm`);
  check('puan düşünce dağılım KIRPILIYOR', kirpik.spent <= kirpik.points,
    `${kirpik.spent}/${kirpik.points}`);
}

console.log('\n[8] Geçersiz girdiler patlatmıyor');
{
  await prisma.player.update({ where: { wallet: w(2) }, data: { depthPaid: { '1': 30 } } });
  const dene = async (v: unknown) => (await setSkills(w(2), v)).view.nodes.length;
  check('null → boş', (await dene(null)) === 0);
  check('metin → boş', (await dene('hepsi')) === 0);
  check('sayı listesi → boş', (await dene([1, 2, 3])) === 0);
  check('bilinmeyen id → boş', (await dene(['yok_boyle'])) === 0);
  check('nesne → boş', (await dene({ blade_edge: true })) === 0);
  check('geçerli id geçiyor', (await dene(['blade_edge'])) === 1);

  // `pointsOf` saf tarafla aynı sonucu vermeli
  const p = await prisma.player.findUniqueOrThrow({ where: { wallet: w(2) } });
  const { toProgress } = await import('./db.js');
  check('pointsOf saf fonksiyonla uyumlu',
    pointsOf(toProgress(p)) === skillPoints(30), `${pointsOf(toProgress(p))}`);
}

await prisma.ledger.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ BECERİ SUNUCUSU SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
