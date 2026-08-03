// SUNUCU ÖDÜL KAPISI — "istemci yalan söylerse ne olur" testi.
//
// Frontend'deki progress.test.mts exploit kapısını OYUN tarafında doğruluyor.
// Bu dosya farklı bir soruyu soruyor: istemci kötü niyetliyse, uydurduğu
// sayılar sunucuda ne kadar ilerleyebiliyor?
//
// Çalıştır:  npx tsx src/reward.test.mts

import { emptyProgress, type Progress } from '@game/progress';
import { STAGES } from '@game/config';
import { canStart, maxDepthInTime, maxRareGold, minDescentSeconds, settleRun, MAX_DEPTH_CLAIM } from './reward.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const cleared1: Progress = {
  ...emptyProgress(), unlockedStage: 2,
  cleared: { 1: true }, firstClear: { 1: true },
};

console.log('\n[1] Uydurma nadir gold kırpılıyor');
{
  // Gerçekçi bir dürüst koşu: [6]'da ölçüldü, derinlik 6'da ~220 nadir gold.
  const HONEST_DROP = 180;
  const honest = settleRun(cleared1, 'descent', 1, { deepestCleared: 5, rareGold: HONEST_DROP, cleared: false });
  console.log(`     dürüst koşu: +${honest.awarded} (ilerleme ${honest.progressGold} + düşüş ${honest.dropGold})`);
  check('dürüst koşu kırpılmıyor', !honest.capped);

  const liar = settleRun(cleared1, 'descent', 1, { deepestCleared: 5, rareGold: 999_999, cleared: false });
  const cap = maxRareGold('descent', 1, 5);
  console.log(`     yalancı 999.999 istedi → ${liar.awarded} aldı (tavan ${cap})`);
  check('uydurma gold tavana kırpılıyor', liar.dropGold <= cap, `${liar.dropGold} ≤ ${cap}`);
  check('kırpma işaretleniyor (admin için)', liar.capped);
  // ASIL SORU: yalan söylemek KÂRLI MI? Tavan varsa bile 10 kat kazandırıyorsa
  // caydırıcı değildir. Kazanç payı dar olmalı.
  check('yalan söylemek 2 kattan fazla kazandırmıyor', liar.awarded <= honest.awarded * 2,
    `dürüst ${honest.awarded} → yalancı ${liar.awarded}`);
}

console.log('\n[2] Uydurma derinlik');
{
  const r = settleRun(cleared1, 'descent', 1, { deepestCleared: 999_999, rareGold: 0, cleared: false });
  check('derinlik iddiası tavanlanıyor', r.capped);
  check('tavan MAX_DEPTH_CLAIM', (r.progress.depthPaid[1] ?? 0) <= MAX_DEPTH_CLAIM,
    `${r.progress.depthPaid[1]}`);
}

console.log('\n[3] Kilitli bölümden ödül alınamıyor');
{
  const fresh = emptyProgress();                 // sadece 1. bölüm açık
  const r = settleRun(fresh, 'campaign', 5, { deepestCleared: 0, rareGold: 500, cleared: true });
  check('kilitli bölüm ödül vermiyor', r.awarded === 0, `+${r.awarded}`);
  check('sebep kaydediliyor', r.reason.length > 0, r.reason.join(', '));
  check('ilerleme değişmiyor', r.progress === fresh);
}

console.log('\n[4] Tekrar oynamak ödemiyor (oyunun kuralı sunucuda da geçerli)');
{
  const r1 = settleRun(cleared1, 'campaign', 1, { deepestCleared: 0, rareGold: 0, cleared: true });
  check('ödülü alınmış bölüm tekrar ödemiyor', r1.progressGold === 0, `+${r1.progressGold}`);

  let p: Progress = { ...emptyProgress(), unlockedStage: 2, cleared: { 1: true }, firstClear: { 1: true } };
  const a = settleRun(p, 'descent', 1, { deepestCleared: 6, rareGold: 0, cleared: false });
  p = a.progress;
  const b = settleRun(p, 'descent', 1, { deepestCleared: 6, rareGold: 0, cleared: false });
  check('aynı derinlik ikinci kez ödemiyor', b.progressGold === 0, `+${b.progressGold}`);
  check('daha derine inince ödüyor',
    settleRun(p, 'descent', 1, { deepestCleared: 9, rareGold: 0, cleared: false }).progressGold > 0);
}

console.log('\n[5] Koşu başlatma kuralları');
{
  const fresh = emptyProgress();
  check('kilitli bölüm başlatılamıyor', canStart(fresh, 'campaign', 3) !== null, `${canStart(fresh, 'campaign', 3)}`);
  check('temizlenmemiş bölümün descent\'i açılamıyor',
    canStart(fresh, 'descent', 1) !== null, `${canStart(fresh, 'descent', 1)}`);
  check('açık bölüm başlatılabiliyor', canStart(fresh, 'campaign', 1) === null);
  check('temizlenmiş bölümün descent\'i açılabiliyor', canStart(cleared1, 'descent', 1) === null);
  check('bilinmeyen mod reddediliyor', canStart(cleared1, 'sonsuz' as never, 1) !== null);
  check('olmayan bölüm reddediliyor', canStart(cleared1, 'campaign', 99) !== null);
}

// ── [6] TAVAN GERÇEK KOŞUYA GÖRE ──
// Tavanı uydurma sayılarla denemek işe yaramaz. Motor DOM'suz olduğu için
// sunucu tarafında GERÇEK koşu simüle edilebiliyor: dürüst bir oyuncunun
// fiilen kaç nadir gold topladığını ölçüp tavanla karşılaştırıyoruz.
//
// İki yönlü hata arıyoruz:
//   • tavan çok DAR → dürüst oyuncu kırpılır (sessiz hata: kimse şikâyet
//     etmez, oyun sadece cimri hissettirir)
//   • tavan çok GENİŞ → yalan söylemek kârlı kalır
console.log('\n[6] Tavan gerçek koşuya göre kalibre mi');
{
  const { Game } = await import('@game/engine');
  const { TICK } = await import('@game/config');
  const { seedFromString } = await import('@game/rng');

  /** Bir descent koşusunu gerçekten oyna, toplanan nadir gold'u döndür */
  const realRun = (seed: string, targetDepth: number) => {
    const g = new Game(seedFromString(seed), STAGES[0], {}, 'descent');
    g.setViewport(1280, 720);
    for (let i = 0; i < Math.round(900 / TICK); i++) {
      if (g.phase === 'levelup') {
        const p = g.offers.find((o) => o.kind === 'weapon-new') ?? g.offers[0];
        g.choose(p.id);
      }
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;                       // gücü değil DÜŞÜŞÜ ölçüyoruz
      const t = i * TICK;
      const c = t % 3;
      g.setInput(...(c < 1.5 ? [Math.cos(t * 0.7), Math.sin(t * 0.7)] as const : [0, 0] as const));
      g.step();
      if (g.stage.deepestCleared >= targetDepth) break;
    }
    return { depth: g.stage.deepestCleared, gold: Math.floor(g.rareGold) };
  };

  let worstRatio = Infinity;
  for (const s of ['r1', 'r2', 'r3']) {
    const r = realRun(s, 6);
    const cap = maxRareGold('descent', 1, r.depth);
    const ratio = cap / Math.max(1, r.gold);
    worstRatio = Math.min(worstRatio, ratio);
    console.log(`     ${s}: derinlik ${r.depth}, gerçek ${r.gold} gold, tavan ${cap} (${ratio.toFixed(1)}x)`);
    check(`${s}: dürüst oyuncu KIRPILMIYOR`, r.gold <= cap, `${r.gold} ≤ ${cap}`);
  }
  // Tavan gerçeğin katbekat üstündeyse yalan söylemek hâlâ kârlı demektir.
  check('tavan gerçeğe yakın (≤25x)', worstRatio <= 25, `en dar oran ${worstRatio.toFixed(1)}x`);

  const d20 = maxRareGold('descent', 1, 20);
  const d40 = maxRareGold('descent', 1, 40);
  console.log(`     tavan büyümesi: d20 ${d20} · d40 ${d40}`);
  check('derinleştikçe tavan büyüyor', d40 > d20);

  // ── [7] SÜRE TABANI ──
  // MAX_DEPTH_CLAIM tek başına yetmiyor: 500'e kırpılan yalan hâlâ 500'dür ve
  // leaderboard'ın tepesini kalıcı kilitler. Süre tabanı fizikle keser.
  //
  // ⚠️ Bu sınırın DÜRÜST oyuncuyu kırpmadığını tahminle değil, gerçek koşuyla
  // ölçüyoruz: aşağıdaki koşu motorun kendisi, süresi de simülasyondan geliyor.
  console.log('\n[7] Süre tabanı');
  {
    const timedRun = (seed: string, targetDepth: number) => {
      const g = new Game(seedFromString(seed), STAGES[0], {}, 'descent');
      g.setViewport(1280, 720);
      let ticks = 0;
      for (let i = 0; i < Math.round(1800 / TICK); i++) {
        if (g.phase === 'levelup') {
          const p = g.offers.find((o) => o.kind === 'weapon-new') ?? g.offers[0];
          g.choose(p.id);
        }
        if (g.phase !== 'running') break;
        g.hp = g.stats.maxHp;
        const t = i * TICK;
        const c = t % 3;
        g.setInput(...(c < 1.5 ? [Math.cos(t * 0.7), Math.sin(t * 0.7)] as const : [0, 0] as const));
        g.step();
        ticks = i + 1;
        if (g.stage.deepestCleared >= targetDepth) break;
      }
      return { depth: g.stage.deepestCleared, sec: ticks * TICK };
    };

    let enDar = Infinity;
    for (const s of ['t1', 't2', 't3']) {
      const r = timedRun(s, 5);
      const izin = maxDepthInTime(1, r.sec);
      enDar = Math.min(enDar, izin - r.depth);
      console.log(`     ${s}: derinlik ${r.depth} · ${Math.round(r.sec)} sn · süreye sığan ${izin}`);
      check(`${s}: DÜRÜST koşu süre tabanına takılmıyor`, izin >= r.depth, `${izin} ≥ ${r.depth}`);

      const honest = settleRun(cleared1, 'descent', 1, {
        deepestCleared: r.depth, rareGold: 0, cleared: false,
      }, r.sec);
      check(`${s}: dürüst koşu kırpılmadı olarak işaretlenmiyor`, !honest.capped,
        honest.reason.join(' | ') || 'temiz');
    }
    // ⚠️ Payı ÖLÇMEK zorunlu. İlk sürümde pay 1 derinlikti — motorda tek bir
    // spawn zamanlaması değişikliği dürüst oyuncuyu kırpmaya başlardı ve
    // kimse şikâyet etmezdi, oyun sadece bozuk hissettirirdi.
    console.log(`     en dar pay: ${enDar} derinlik`);
    check('dürüst koşuyla sınır arasında en az 2 derinlik pay var', enDar >= 2, `${enDar}`);

    // ⭐ ASIL SALDIRI: anında kapatılan koşuda derin iddia
    const liar = settleRun(cleared1, 'descent', 1, {
      deepestCleared: 99_999, rareGold: 0, cleared: false,
    }, 1);
    check('1 saniyede derin iniş iddiası SIFIRLANIYOR', liar.progressGold === 0,
      `+${liar.progressGold} · ${liar.reason.join(' | ')}`);
    check('kırpıldı olarak işaretlendi', liar.capped);

    // MAX_DEPTH_CLAIM'e kırpılmış yalan da geçmemeli
    const capLiar = settleRun(cleared1, 'descent', 1, {
      deepestCleared: MAX_DEPTH_CLAIM, rareGold: 0, cleared: false,
    }, 30);
    check('30 saniyede 500 derinlik geçmiyor', capLiar.progressGold === 0,
      `+${capLiar.progressGold}`);

    check('süre tabanı derinlikle artıyor',
      minDescentSeconds(1, 20) > minDescentSeconds(1, 10));
    check('süresiz çağrı (varsayılan) kırpmıyor',
      !settleRun(cleared1, 'descent', 1, { deepestCleared: 8, rareGold: 0, cleared: false }).capped);
  }
}

console.log(`\n${FAIL.length === 0 ? '✅ SUNUCU ÖDÜL KAPISI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
