// ULTRA (HAZİNE) HESAP KAPILARI MÜHRÜ — kaynak taraması.
//
// 🔴 NİYE VAR: hazine cüzdanı test için 100M gold ve tüm bölümlerle
// oynuyor. Bu hesap PAYLAŞILAN bir havuza ya da sıralama ödülüne dokunursa
// gerçek oyuncunun payını alır. 2026-09-16 turunda ölçüldü, dört yol AÇIKTI:
//   · The Pit haftalık ödülü — hazine 1. oldu, gerçek oyuncu 2.'ye düştü
//   · Haftalık boss — hazine ortak canı düşürdü ve ödülü aldı
//   · Crypt kasası (katkı) — dolum gold'unun %10'u gerçek deed sahiplerine aktı
//   · Crypt kasası (pay) — hazine kasadan 158.000 gold çekebildi
// Descent sezonu ve tüm-zamanlar tablosu bu kapıları zaten kapatmıştı.
//
// ⚠️ KURAL: her ödül yolunda İKİ kapı — YAZMADA (hazinenin kaydı hiç
// oluşmasın) ve ÖDÜLDE (kapıdan önce yazılmış bir kayıt kalmış olabilir).
// Davranış testleri backend'de (`pvpSeason.test` [6], `worldBoss.test`,
// `crypt.test` [9]) ve veritabanı istiyor; bu mühür `npm test`e giren bekçi.
//
//   cd frontend && npx tsx src/game/ultraKapi.test.mts

import { readFileSync } from 'node:fs';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (p: string) => readFileSync(new URL(`../../../backend/src/${p}`, import.meta.url), 'utf8');
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const govde = (kaynak: string, ad: string) => {
  const i = kaynak.search(new RegExp(`function ${ad}\\b`));
  if (i < 0) return '';
  const r = /\r?\n(export |async function |function |const |let |interface |type )/g;
  r.lastIndex = i + 1;
  const m = r.exec(kaynak);
  return kaynak.slice(i, m ? m.index : undefined);
};

const ultra = yorumsuz(oku('ultra.ts'));
const pvp = yorumsuz(oku('pvpSeason.ts'));
const boss = yorumsuz(oku('worldBoss.ts'));
const crypt = yorumsuz(oku('crypt.ts'));
const ledger = yorumsuz(oku('ledger.ts'));
const sezon = yorumsuz(oku('season.ts'));
const lb = yorumsuz(oku('leaderboard.ts'));
const sunucu = yorumsuz(oku('index.ts'));

console.log('\n── [0] Kapı yardımcısı ──');
{
  check('ultraDisi hazine tanımsızken koşul YAYMIYOR', /return hazine \? \{ wallet: \{ not: hazine \} \} : \{\}/.test(govde(ultra, 'ultraDisi')));
}

console.log('\n── [1] Sıralama ödülleri ──');
{
  check('Descent sezonu: yazma kapısı', /if \(ultraMi\(wallet\)\) return false/.test(govde(sezon, 'recordSeason')));
  check('Tüm-zamanlar: yazma kapısı', /if \(ultraMi\(wallet\)\) return false/.test(govde(lb, 'recordDescent')));
  check('The Pit: maç sezona yazılmıyor', /wallets\.filter\(\(w\) => !ultraMi\(w\)\)/.test(govde(pvp, 'markPvpMatch')));
  check('The Pit: ödül sorgusu hazineyi dışlıyor', /\.\.\.ultraDisi\(\)/.test(govde(pvp, 'kapatOne')));
  check('Boss: hasar yazılmıyor', /ultraMi\(wallet\) \? 0 :/.test(govde(boss, 'contribute')));
  check('Boss: ödül listesinden eleniyor', /!ultraMi\(r\.wallet\)/.test(govde(boss, 'kapatBir')));
}

console.log('\n── [2] Crypt kasası ──');
{
  const katki = govde(crypt, 'contributeToVault');
  check('katkıda cüzdan ZORUNLU parametre', /wallet: string,?\s*\)/.test(katki) && !/wallet\?:/.test(katki));
  check('katkı hazineden gelmiyor', /if \(ultraMi\(wallet\)\) return 0/.test(katki));
  check('ağırlık hazinenin deed\'ini saymıyor', /\.\.\.ultraDisi\(\)/.test(govde(crypt, 'vaultState')));
  check('hazine kasadan çekemiyor', /ultraMi\(wallet\)/.test(govde(crypt, 'claimCrypt')));
  const cagrilar = [...(ledger + sunucu).matchAll(/contributeToVault\(([^)]*)\)/g)].map((m) => m[1]);
  check('her çağıran cüzdanı geçiriyor', cagrilar.length >= 3 && cagrilar.every((a) => a.split(',').length === 4),
    `${cagrilar.length} çağrı`);
}

console.log('\n── [3] Pano sütunu ──');
{
  check('goldEarned hazinede artmıyor', /goldEarned: \{ increment: ultraMi\(wallet\) \? 0/.test(sunucu));
}

console.log(`\n${FAIL.length === 0 ? '✅ ULTRA KAPILARI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
