// THE BINDING — ZİNCİR MÜHRÜ.
//
// 🔴 NİYE VAR: 2026-09-07'de ölçüldü — 12 petin HİÇBİRİ bağlanamıyordu ve
// hiçbir test bunu söylemiyordu, çünkü her parça TEK BAŞINA doğruydu:
//   motor tip bazlı sayıyor ✓ · sunucu şeması alanı kabul ediyor ✓ ·
//   `applyKills` kırpıp yazıyor ✓ · `canBind` okuyor ✓
// ama sayı ARADA KAYBOLUYORDU — iki ayrı yerde:
//   1. `GameCanvas.finish()` sonuç nesnesini ELLE kuruyor ve alanı yazmıyordu
//   2. `/run/finish` gövdesine alan hiç konmamıştı
// `RunResult` tipi de alanı tanımadığı için derleyici sessiz kaldı.
//
// Sonuç: `Player.kills` sonsuza kadar boş → `canBind` hep "kill_yetersiz" →
// "parayla alınamaz, öldürerek hak edilir" diye tasarlanmış 12 pet pratikte
// "hiç kimse alamaz" oluyordu.
//
// ⚠️ BU MÜHÜR ZİNCİRİ ÖLÇÜYOR, PARÇALARI DEĞİL. Parçaların her biri zaten
// doğruydu; kırık olan aralarındaki taşımaydı. Bu depoda tekrar eden en
// pahalı hata sınıfı bu (bkz. autoProps kaybolmuş bağlantı, Barrow ödülü).
//
//   cd frontend && npx tsx src/game/binding.test.mts

import fs from 'node:fs';
import { PETS, canBind, bindKillsNeeded, petById } from './pets.js';
import { ENEMIES, STAGES } from './config.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const oku = (p: string) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

console.log('\n═══ THE BINDING — ZİNCİR ═══');

console.log('\n[1] ⭐ HALKA HALKA: sayı motordan sunucuya ULAŞIYOR MU');
{
  const engine = oku('src/game/engine.ts');
  check('1. motor tip bazlı sayıyor', /killsByType\[[^\]]+\]\s*=/.test(engine));
  check('2. motor sonucuna koyuyor', /killsByType:\s*this\.killsByType/.test(engine));

  /**
   * 🔴 EN KRİTİK İKİ HALKA — ikisi de kopuktu.
   * `GameCanvas.finish()` motorun anlık görüntüsünü OLDUĞU GİBİ geçmiyor,
   * nesneyi elle kuruyor. Elle kurulan her nesne, motora sonradan eklenen
   * alanı SESSİZCE düşürür.
   */
  const canvas = oku('src/components/GameCanvas.tsx');
  check('3. GameCanvas sonuca yazıyor', /killsByType:\s*g\?\.killsByType/.test(canvas));

  const session = oku('src/lib/gameSession.ts');
  check('4. /run/finish gövdesinde gönderiliyor', /killsByType:\s*run\.killsByType/.test(session));

  /**
   * ⚠️ TİP DE TANIMALI: `RunResult` alanı tanımasaydı derleyici hiçbir şey
   * söylemez ve satır yeniden silinebilirdi. Sessizliğin sebebi buydu.
   */
  const progress = oku('src/game/progress.ts');
  check('5. RunResult tipi alanı tanıyor', /killsByType\?:\s*Record<string, number>/.test(progress));

  const idx = oku('../backend/src/index.ts');
  check('6. sunucu şeması alanı kabul ediyor', /killsByType:\s*z\.record/.test(idx));
  check('7. sunucu applyKills ile yazıyor', /applyKills\([^)]*killsByType/.test(idx));

  const pets = oku('../backend/src/pets.ts');
  check('8. bağlama sayacı okuyor', /kills\[def\.bindsFrom\]/.test(pets));

  // ⚠️ KONTROL GRUBU: tarama her şeye "evet" diyor olabilirdi
  check('uydurma desen bulunmuyor (kontrol grubu)',
    !/killsByZZZ/.test(engine + canvas + session + idx));
}

console.log('\n[2] BAĞLANMA ŞARTLARI TUTARLI');
{
  for (const p of PETS) {
    const g = bindKillsNeeded(p, 0);
    if (!(Number.isFinite(g) && g > 0)) FAIL.push(`${p.id} kill eşiği bozuk`);
  }
  check('her petin pozitif kill eşiği var', !FAIL.some((f) => f.includes('kill eşiği')));

  /**
   * ⚠️ EŞİK KOPYA BAŞINA ARTMALI: sabit kalsaydı bir kez doldurulan sayaçla
   * dört kopya birden alınır ve füzyonun oynanış bedeli sıfırlanırdı.
   */
  const ornek = PETS[0];
  check('eşik kopya sayısıyla artıyor',
    bindKillsNeeded(ornek, 1) > bindKillsNeeded(ornek, 0),
    `${bindKillsNeeded(ornek, 0)} → ${bindKillsNeeded(ornek, 1)}`);

  // Yeterli kill + yeterli gold = bağlanır
  const yeter = bindKillsNeeded(ornek, 0);
  check('yeterli kill+gold ile bağlanıyor', canBind(ornek, yeter, 10_000_000, 0).ok);
  // ⚠️ ÇİFT TARAFLI: bir eksik kill YETMEMELİ
  check('bir eksik kill yetmiyor', !canBind(ornek, yeter - 1, 10_000_000, 0).ok);
  check('gold yoksa bağlanmıyor', !canBind(ornek, yeter, 0, 0).ok);
}

console.log('\n[3] ⭐ HER PET GERÇEKTEN KAZANILABİLİR');
{
  /**
   * Bir pet var olmayan ya da hiçbir bölümde doğmayan bir düşmana bağlıysa
   * sonsuza kadar kilitli kalır — `content.test` bunu zaten ölçüyor, burada
   * ZİNCİR bağlamında tekrar doğrulanıyor: sayaç artık işlediğine göre
   * kaynağın da gerçek olduğundan emin olmalıyız.
   */
  const tanimli = new Set(ENEMIES.map((e) => e.id));
  const kadroda = new Set<string>();
  for (const s of STAGES) for (const id of s.enemies ?? []) kadroda.add(id);

  const yok = PETS.filter((p) => !tanimli.has(p.bindsFrom));
  check('her petin kaynak düşmanı TANIMLI', yok.length === 0,
    yok.map((p) => `${p.name}←${p.bindsFrom}`).join(', '));

  const dogmayan = PETS.filter((p) => tanimli.has(p.bindsFrom) && !kadroda.has(p.bindsFrom));
  check('her petin kaynağı bir bölüm kadrosunda DOĞUYOR', dogmayan.length === 0,
    dogmayan.map((p) => `${p.name}←${p.bindsFrom}`).join(', '));

  check('petById her id\'yi buluyor', PETS.every((p) => !!petById(p.id)));
  check('petById uydurma id\'de undefined', petById('yok_boyle_pet') === undefined);
}

console.log(`\n${FAIL.length === 0 ? '✅ BAĞLAMA ZİNCİRİ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
