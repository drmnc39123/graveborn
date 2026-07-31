// EXPLOIT KAPISI TESTİ — ekonominin can damarı.
//
// Kural: "İLERLEME ÖDER, TEKRAR ÖDEMEZ."
// Bozulursa oyuncu aynı içeriği sonsuz tekrar oynayıp gold basar; gold markette
// token karşılığı satılabileceği için bu doğrudan para basmak demektir.
//
// Çalıştır:  npx tsx src/game/progress.test.mts

import { STAGES, depthGold } from './config.js';
import {
  applyRunResult, depthRewardBetween, emptyProgress, firstClearAvailable, paidDepth,
  type Progress, type RunResult,
} from './progress.js';

const FAIL: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) FAIL.push(name);
};

const campaign = (stageId: number, cleared: boolean, rareGold = 0): RunResult =>
  ({ mode: 'campaign', stageId, cleared, deepestCleared: 0, rareGold });
const descent = (stageId: number, deepestCleared: number, rareGold = 0): RunResult =>
  ({ mode: 'descent', stageId, cleared: false, deepestCleared, rareGold });

// ── 1) Kampanya: ilk geçiş öder, ikincisi ödemez ──
console.log('\n[1] Kampanya ilk-geçiş ödülü');
{
  const st = STAGES[1]; // 700 gold
  let p = emptyProgress();

  // ölerek bitirilmediyse ödül YOK ve sonraki bölüm açılmaz
  const fail = applyRunResult(p, campaign(st.id, false));
  check('bölüm bitirilmediyse ilerleme ödülü yok', fail.progressGold === 0, `+${fail.progressGold}`);
  check('bitirilmediyse sonraki bölüm açılmıyor', fail.progress.unlockedStage === 1,
    `unlocked ${fail.progress.unlockedStage}`);

  const r1 = applyRunResult(p, campaign(st.id, true));
  p = r1.progress;
  check('ilk temiz geçiş tam ödül veriyor', r1.progressGold === st.firstClearGold,
    `+${r1.progressGold} (beklenen ${st.firstClearGold})`);
  check('bölüm bitince sonraki açılıyor', p.unlockedStage === st.id + 1, `unlocked ${p.unlockedStage}`);

  // ⭐ EXPLOIT: aynı bölümü tekrar geç
  const r2 = applyRunResult(p, campaign(st.id, true));
  check('TEKRAR OYNAYINCA İLERLEME ÖDÜLÜ 0', r2.progressGold === 0, `+${r2.progressGold}`);
  check('cüzdan da artmıyor', r2.progress.gold === p.gold, `${r2.progress.gold} vs ${p.gold}`);

  // 10 kez daha — sızıntı birikmemeli
  let leak = p;
  for (let i = 0; i < 10; i++) leak = applyRunResult(leak, campaign(st.id, true)).progress;
  check('10 tekrar sonrası hâlâ sızıntı yok', leak.gold === p.gold, `${leak.gold} vs ${p.gold}`);

  // başka bölüm bağımsız
  const other = applyRunResult(p, campaign(STAGES[0].id, true));
  check('başka bölümün ödülü bağımsız', other.progressGold === STAGES[0].firstClearGold,
    `+${other.progressGold}`);
}

// ── 2) Descent: sadece YENİ derinlikler öder ──
console.log('\n[2] Descent derinlik ödülü');
{
  const stageId = 1;
  let p: Progress = { ...emptyProgress(), cleared: { 1: true }, firstClear: { 1: true } };

  const r1 = applyRunResult(p, descent(stageId, 5));
  p = r1.progress;
  const expect5 = depthRewardBetween(emptyProgress(), stageId, 0, 5);
  check('derinlik 1-5 ödeniyor', r1.progressGold === expect5, `+${r1.progressGold} (beklenen ${expect5})`);
  check('ödenen derinlik kaydediliyor', paidDepth(p, stageId) === 5, `${paidDepth(p, stageId)}`);
  check('ödenen aralık raporlanıyor', r1.paidRange?.from === 0 && r1.paidRange?.to === 5,
    JSON.stringify(r1.paidRange));

  // ⭐ EXPLOIT: aynı derinliklere tekrar in
  const r2 = applyRunResult(p, descent(stageId, 5));
  check('AYNI DERİNLİK İKİNCİ KEZ ÖDEMİYOR', r2.progressGold === 0, `+${r2.progressGold}`);
  check('ödenen derinlik geriye gitmiyor', paidDepth(r2.progress, stageId) === 5);

  // daha sığ kalırsa yine 0
  const r3 = applyRunResult(p, descent(stageId, 3));
  check('daha sığ koşu ödemiyor', r3.progressGold === 0, `+${r3.progressGold}`);
  check('sığ koşu ödenen derinliği DÜŞÜRMÜYOR', paidDepth(r3.progress, stageId) === 5,
    `${paidDepth(r3.progress, stageId)}`);

  // 20'ye inip 15'te ölmek → sadece 6..15 ödenmeli
  const r4 = applyRunResult(p, descent(stageId, 15));
  const expect6to15 = depthRewardBetween(emptyProgress(), stageId, 5, 15);
  check('sadece yeni derinlikler ödeniyor (6-15)', r4.progressGold === expect6to15,
    `+${r4.progressGold} (beklenen ${expect6to15})`);

  // parça parça inmekle tek seferde inmek AYNI toplamı vermeli (sızıntı/çift ödeme yok)
  let stepwise = { ...emptyProgress(), cleared: { 1: true }, firstClear: { 1: true } } as Progress;
  let sum = 0;
  for (let d = 1; d <= 15; d++) {
    const r = applyRunResult(stepwise, descent(stageId, d));
    sum += r.progressGold;
    stepwise = r.progress;
  }
  const oneShot = applyRunResult(
    { ...emptyProgress(), cleared: { 1: true }, firstClear: { 1: true } }, descent(stageId, 15),
  ).progressGold;
  check('adım adım inmek = tek seferde inmek', sum === oneShot, `${sum} vs ${oneShot}`);

  // derinlik SONSUZ ödemeli — tavan yok (kullanıcının kuralı)
  const deep = applyRunResult(
    { ...emptyProgress(), cleared: { 1: true }, firstClear: { 1: true }, depthPaid: { 1: 199 } },
    descent(stageId, 200),
  );
  check('derinlik 200 hâlâ ödüyor (tavan yok)', deep.progressGold > 0, `+${deep.progressGold}`);
  check('derin ödül sığ ödülden büyük', depthGold(1, 200) > depthGold(1, 20) * 5,
    `d20 ${depthGold(1, 20)} → d200 ${depthGold(1, 200)}`);
}

// ── 3) Nadir düşüş: her koşuda gelir, tekrar oynamak onu engellemez ──
console.log('\n[3] Nadir düşüş ödemesi');
{
  const st = STAGES[1];
  let p = applyRunResult(emptyProgress(), campaign(st.id, true)).progress;

  const again = applyRunResult(p, campaign(st.id, true, 42));
  check('tekrar oynayınca ilerleme 0 AMA nadir düşüş ödeniyor',
    again.progressGold === 0 && again.dropGold === 42, `ilerleme 0, düşüş +${again.dropGold}`);
  check('toplam ödül iki parçanın toplamı', again.awarded === 42, `+${again.awarded}`);
  check('cüzdana yazılıyor', again.progress.gold === p.gold + 42);

  // hileli girdi
  const neg = applyRunResult(emptyProgress(), campaign(1, false, -5000));
  check('negatif düşüş gold eksiltmiyor', neg.awarded === 0 && neg.progress.gold === 0);
  const frac = applyRunResult(emptyProgress(), campaign(1, false, 9.99));
  check('kesirli düşüş aşağı yuvarlanıyor', frac.dropGold === 9, `+${frac.dropGold}`);
}

// ── 4) greed SADECE ilerleme ödülünü çarpar ──
// Aksi hâlde "gold al → düşüş oranını artır → daha çok gold" sarmalı kurulur.
console.log('\n[4] greed sınırı');
{
  const plain = emptyProgress();
  const greedy: Progress = { ...emptyProgress(), upgrades: { greed: 12 } };

  const a = applyRunResult(plain, campaign(1, true, 100));
  const b = applyRunResult(greedy, campaign(1, true, 100));
  check('greed ilerleme ödülünü ARTIRIYOR', b.progressGold > a.progressGold,
    `${a.progressGold} → ${b.progressGold}`);
  check('greed nadir düşüşü ETKİLEMİYOR', a.dropGold === b.dropGold && b.dropGold === 100,
    `${a.dropGold} vs ${b.dropGold}`);

  const dA = applyRunResult({ ...plain, cleared: { 1: true } }, descent(1, 10));
  const dB = applyRunResult({ ...greedy, cleared: { 1: true } }, descent(1, 10));
  check('greed derinlik ödülünü de artırıyor', dB.progressGold > dA.progressGold,
    `${dA.progressGold} → ${dB.progressGold}`);
  check('greed tavanlı (maxLevel aşılamıyor)',
    firstClearAvailable({ ...emptyProgress(), upgrades: { greed: 999 } }, 1)
    === firstClearAvailable(greedy, 1));
}

// ── 5) v1 → v2 göçü: kazanılmış gold KAYBOLMAMALI ──
// Göç bir kez yanlış yazılırsa oyuncunun emeği silinir; geri dönüşü yok.
console.log('\n[5] v1 → v2 göçü');
{
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    },
  };
  store.set('graveborn:progress:v1', JSON.stringify({
    gold: 1234, unlockedStage: 3,
    claimed: { 1: 300, 2: 700 },        // v1: bölümden alınmış toplam gold
    cleared: { 1: true, 2: true },
    upgrades: { might: 3 },
  }));

  // require yerine dinamik import: modül window'u yukarıda kurduktan sonra okusun
  const { loadProgress } = await import('./progress.js');
  const p = loadProgress();
  check('gold korunuyor', p.gold === 1234, `${p.gold}`);
  check('açılmış bölüm korunuyor', p.unlockedStage === 3, `${p.unlockedStage}`);
  check('yükseltmeler korunuyor', p.upgrades.might === 3, `${p.upgrades.might}`);
  check('claimed > 0 olan bölümler "ödül alınmış" sayılıyor',
    p.firstClear[1] === true && p.firstClear[2] === true, JSON.stringify(p.firstClear));
  check('ödülü alınmış bölüm tekrar ödemiyor', firstClearAvailable(p, 1) === 0);
  check('hiç oynanmamış bölüm hâlâ ödüyor', firstClearAvailable(p, 3) > 0,
    `+${firstClearAvailable(p, 3)}`);
  check('v2 anahtarına yazıldı', store.has('graveborn:progress:v2'));
}

console.log(`\n${FAIL.length === 0 ? '✅ EXPLOIT KAPISI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
