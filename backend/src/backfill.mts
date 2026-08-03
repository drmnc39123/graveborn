// LEADERBOARD BAKIM ARACI — idempotent, iki kip.
//
//   npx tsx src/backfill.mts            → depthPaid'den geri doldur (ekleme)
//   npx tsx src/backfill.mts --recompute → Run kayıtlarından SIFIRDAN kur
//
// `--recompute` kaçış valfi: rekor "sadece artar" olduğu için yanlış yazılmış
// bir satır kendiliğinden düzelmez. Sadece kırpılmamış koşuları ve sunucunun
// kabul ettiği derinliği kullanır; kaydı olmayanın rekorunu sıfırlar.

import { backfill, recomputeAll, top } from './leaderboard.js';

if (process.argv.includes('--recompute')) {
  const r = await recomputeAll();
  console.log(`yeniden kuruldu: ${r.players} oyuncu · sıfırlanan ${r.cleared}`);
} else {
  const r = await backfill();
  console.log(`taranan ${r.scanned} oyuncu · güncellenen ${r.updated}`);
}

const rows = await top(10);
if (rows.length === 0) console.log('  (tablo boş)');
for (const row of rows) {
  console.log(`  #${row.rank}  ${row.wallet.slice(0, 8)}…  bölüm ${row.stage} · derinlik ${row.depth}  (${row.rating.toExponential(2)})`);
}
process.exit(0);
