// BOSS ARKETİP DAĞITIMI — saf fonksiyon ölçümü.
//
// ⚠️ NİYE AYRI DOSYA: `sim.test.mts` boss dövüşlerini gerçekten simüle ediyor
// ve ~15 dakika sürüyor. Buradaki sorular saf ve saniyelik: hangi boss hangi
// kalıbı alıyor, sıra tekrarlanıyor mu, ayarlar tutarlı mı. Bunları 15
// dakikalık bir paketin arkasına saklamak, hiç koşulmamaları demekti.
//
// Çalıştır:  npx tsx src/game/boss.test.mts

import {
  BOSS, BOSS_ARCH, DESCENT, STAGES,
  archetypeAt, bossArchetypeOf, descentStage,
  type BossArchetype,
} from './config.js';

let hata = 0;
function check(ad: string, kosul: boolean, detay = '') {
  console.log(`  ${kosul ? '✓' : '✗'} ${ad}${detay ? ` — ${detay}` : ''}`);
  if (!kosul) hata++;
}

const HEPSI: readonly BossArchetype[] = ['warden', 'keeper', 'choir', 'harrower'];

console.log('\n[1] Sıra — ilk boss HER ZAMAN warden');
check('0. arketip warden', archetypeAt(0) === 'warden', archetypeAt(0));
check('sıra dört arketibi de geziyor',
  new Set([0, 1, 2, 3].map(archetypeAt)).size === 4,
  [0, 1, 2, 3].map(archetypeAt).join(' → '));
check('4. başa dönüyor', archetypeAt(4) === archetypeAt(0));
// ⚠️ Bozuk girdi sessizce `undefined` döndürmemeli: motorda `BOSS_ARCH[arch]`
// olarak indeksleniyor ve undefined bir arketip koşuyu çökertirdi.
check('negatif indeks warden', archetypeAt(-3) === 'warden');
check('NaN warden', archetypeAt(NaN) === 'warden');
check('kesirli indeks aşağı yuvarlıyor', archetypeAt(1.9) === archetypeAt(1));

console.log('\n[2] Kampanya — her boss bölümünün bir kalıbı var');
{
  const bosslu = STAGES.filter((s) => s.boss);
  console.log(`     ${bosslu.length} boss'lu bölüm / ${STAGES.length} bölüm`);
  check('boss\'lu bölüm sayısı makul', bosslu.length >= 10, `${bosslu.length}`);

  const dagitim = new Map<BossArchetype, number>();
  for (const s of bosslu) {
    const a = bossArchetypeOf(s);
    dagitim.set(a, (dagitim.get(a) ?? 0) + 1);
  }
  console.log(`     dağılım: ${[...dagitim].map(([a, n]) => `${a} ${n}`).join(' · ')}`);
  check('dört kalıbın dördü de kampanyada geçiyor', dagitim.size === 4);

  // ⚠️ DENGELİ DAĞILIM ŞART. Bir kalıp bir kez geçseydi oyuncu onu
  // öğrenemeden geride bırakırdı — çeşitlilik "gördüm" değil "öğrendim"
  // demektir.
  const en = Math.min(...dagitim.values());
  const cok = Math.max(...dagitim.values());
  check('hiçbir kalıp yalnız kalmıyor', en >= 2, `en az ${en}`);
  check('dağılım dengeli (fark ≤ 1)', cok - en <= 1, `${en}..${cok}`);

  // İLK boss'un kalıbı taban olmalı — `keeper` refleksi tersine çeviriyor ve
  // tersine çevirmenin anlamı için önce refleksin kurulması gerek.
  check('ilk boss bölümü warden', bossArchetypeOf(bosslu[0]) === 'warden',
    `${bosslu[0].name}`);
}

console.log('\n[3] İniş — kalıp DERİNLİKTEN türüyor, bölümden değil');
{
  const ilk = DESCENT.bossEvery;
  const d1 = descentStage(1, ilk);
  check('ilk iniş boss\'u warden', d1.boss?.archetype === 'warden', `${d1.boss?.archetype}`);

  const sira: string[] = [];
  for (let k = 1; k <= 8; k++) sira.push(descentStage(1, ilk * k).boss!.archetype!);
  console.log(`     d${ilk}..d${ilk * 8}: ${sira.join(' → ')}`);
  check('iniş sırası da dönüyor', new Set(sira.slice(0, 4)).size === 4);
  check('ikinci tur ilkiyle aynı', sira.slice(0, 4).join() === sira.slice(4).join());

  // ⚠️ ASIL SORU: aynı bölümde inen bir oyuncu FARKLI kalıplar görüyor mu?
  // Arketip `base.boss`'tan miras alınsaydı inişin tamamı tek bir dövüş olurdu.
  const ayni = new Set([1, 2, 3, 4].map((k) => descentStage(3, ilk * k).boss!.archetype));
  check('aynı bölümde inerken kalıp DEĞİŞİYOR', ayni.size === 4, `${ayni.size} farklı`);
}

console.log('\n[4] Ayarlar tutarlı mı');
for (const a of HEPSI) {
  const A = BOSS_ARCH[a] as Record<string, number>;
  check(`${a}: telegraf pozitif`, A.telegraphMul > 0, `×${A.telegraphMul}`);
  check(`${a}: yarıçap pozitif`, A.radiusMul > 0, `×${A.radiusMul}`);
}
// ⚠️ `keeper`ın güvenli merkezi boss'un GÖVDESİNDEN büyük olmalı, yoksa
// "güvenli bölge" boss'un içi olur ve oraya girmek imkânsızlaşır.
{
  const ic = BOSS.slamRadius * BOSS_ARCH.keeper.radiusMul * BOSS_ARCH.keeper.innerMul;
  const enBuyukBoss = Math.max(...STAGES.filter((s) => s.boss).map((s) => s.boss!.radius));
  console.log(`     keeper güvenli yarıçap ${Math.round(ic)} px · en büyük boss gövdesi ${enBuyukBoss} px`);
  check('güvenli merkez en büyük boss gövdesinden geniş', ic > enBuyukBoss,
    `${Math.round(ic)} > ${enBuyukBoss}`);
}
// ⚠️ `harrower`ın ikinci darbesi telegrafsız — gecikmesi saldırı beklemesinden
// KISA olmalı, yoksa ikinci darbe bir sonraki saldırının içine düşer.
check('harrower ikinci darbesi saldırı beklemesinden kısa',
  BOSS_ARCH.harrower.secondDelaySec < BOSS.atkCd * BOSS.phase2Cd,
  `${BOSS_ARCH.harrower.secondDelaySec} < ${(BOSS.atkCd * BOSS.phase2Cd).toFixed(2)}`);
// ⚠️ `choir` yaylımı `ranged` tavanını tek başına doldurmamalı: doldursaydı
// sahnedeki okçular sessizce ateş edemez hâle gelirdi.
check('choir yaylımı mermi tavanını doldurmuyor', BOSS_ARCH.choir.shots < 40,
  `${BOSS_ARCH.choir.shots} mermi`);
// ⚠️ Tek mermi ÖLDÜRMEMELİ — kalıbı öğrenmek için hayatta kalmak gerek.
check('tek yaylım mermisi taban darbeden zayıf',
  BOSS_ARCH.choir.shotDamageMul < BOSS.slamDamageMul,
  `${BOSS_ARCH.choir.shotDamageMul} < ${BOSS.slamDamageMul}`);
// ⚠️ Kayma SIFIR OLMAMALI: her yaylım aynı açıdan çıksaydı oyuncu tek bir
// noktada durup hiç vurulmadan bekleyebilirdi.
check('yaylım açısı her seferinde kayıyor', BOSS_ARCH.choir.spinPerVolley > 0);

console.log('\n' + '─'.repeat(62));
if (hata) { console.log(`✗ ${hata} ölçüm sınırın dışında`); process.exit(1); }
console.log('✓ boss arketipleri tutarlı');
