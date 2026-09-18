// KÖY HUD KARTLARI MÜHRÜ — Trials geri sayımı · boss canı · bildirim noktaları.
//
// Mühürlenen kararlar ve sebepleri:
//   [1] TRIALS KARTI İSTEK ATMIYOR — sürekli ekranda duran bir kartın maliyeti
//       sıfır olmalı (ProfileCard dersi); bitiş sunucuyla AYNI fonksiyondan,
//       saat sunucudan.
//   [2] BOSS KARTI — veri yoksa/can ölçülemiyorsa çizilmez; `Bar` 0..1 alıyor
//       (yüzde verilseydi çubuk hep dolu görünürdü — yazarken yakalandı);
//       önbellek KARTTA, `fetchWorldBoss`ta değil (panel taze kalsın);
//       gizli sekmede sormuyor.
//   [3] ÖZET ÖNBELLEĞİ — `/me/card` `/run/finish` ile aynı 30/dk kovasında;
//       paylaşılan 30 sn söz + durumu değiştiren her yolda tazeleme; hata
//       önbelleğe girmiyor.
//   [4] NOKTALAR — sıfırsa yok; kart kendi çekmiyor, sayfadan alıyor; demo'da
//       sorulmuyor.
//   [5] SAYFA — Trials kartı sıralamayı Trials'ta açıyor, kapanınca varsayılana
//       dönüyor; kartlar doğru sütunlarda.
//
// ⚠️ KAYNAK YORUMLARI SÖKÜLEREK taranıyor.
//
//   cd frontend && npx tsx src/game/hudCards.test.mts

import { readFileSync } from 'node:fs';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const yorumsuz = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const govde = (kaynak: string, ad: string) => {
  const i = kaynak.search(new RegExp(`(function|const) ${ad}\\b`));
  if (i < 0) return '';
  const r = /\r?\n(export |async function |function |const |let |interface |type )/g;
  r.lastIndex = i + 1;
  const m = r.exec(kaynak);
  return kaynak.slice(i, m ? m.index : undefined);
};

const kartlar = yorumsuz(oku('../components/HudKartlari.tsx'));
const oturum = yorumsuz(oku('../lib/gameSession.ts'));
const sayfa = yorumsuz(oku('../app/play/page.tsx'));
const profil = yorumsuz(oku('../components/ProfileCard.tsx'));

console.log('\n── [1] Trials kartı ──');
{
  const t = govde(kartlar, 'TrialsKarti');
  check('gövde bulundu', t.length > 0);
  check('istek atmıyor', !/fetch[A-Z]\w*\(|api\(/.test(t));
  check('bitiş sunucuyla aynı fonksiyondan', /seasonEndsAt\(seasonWeek\(/.test(t));
  check('saat sunucudan (sunucuSimdi)', /sunucuSimdi\(\)/.test(govde(kartlar, 'simdi')) && /simdi\(\)/.test(t));
}

console.log('\n── [2] Boss kartı ──');
{
  const b = govde(kartlar, 'BossKarti');
  check('veri yoksa ya da can ölçülemiyorsa çizilmez', /if \(!boss \|\| !\(boss\.maxHp > 0\)\) return null/.test(b));
  check('Bar oranı 0..1 kırpılıyor', /Math\.min\(1, boss\.hp \/ boss\.maxHp\)/.test(b) && /<Bar pct=\{oran\}/.test(b));
  check('önbellek kartta, TTL var', /BOSS_TTL_MS = [1-9][\d_]{3,}/.test(kartlar) && /bossOku\(\)/.test(b));
  check('fetchWorldBoss kendisi önbelleksiz (panel taze)', !/TTL|onbellek/i.test(govde(oturum, 'fetchWorldBoss')));
  check('gizli sekmede sormuyor', /if \(!document\.hidden\) oku\(\)/.test(b));
  check('boss hatası önbellekte kalmıyor', /soz\.catch\(\(\) => \{ if \(bossOnbellek\?\.soz === soz\) bossOnbellek = null; \}\)/.test(kartlar));
}

console.log('\n── [3] Özet önbelleği ──');
{
  check('30 sn TTL', /OZET_TTL_MS = 30_000/.test(oturum));
  const f = govde(oturum, 'fetchCardSummary');
  check('taze sözü paylaşıyor', /simdi - ozetOnbellek\.at < OZET_TTL_MS\) return ozetOnbellek\.soz/.test(f));
  check('hata önbellekte kalmıyor', /soz\.catch\(\(\) => \{ if \(ozetOnbellek\?\.soz === soz\) ozetOnbellek = null; \}\)/.test(f));
  for (const ad of ['claimQuest', 'fetchDmThread', 'sendDm', 'finishRun']) {
    check(`${ad} özeti tazeliyor`, /kartOzetiniTazele\(\)/.test(govde(oturum, ad)));
  }
}

console.log('\n── [4] Noktalar ──');
{
  check('friends ikonu okunmamış DM sayısını alıyor', /id: 'friends'[^}]*nokta: ozet\?\.unreadDm \?\? 0/.test(sayfa));
  check('profil kartı bekleyen ödülü sayfadan alıyor', /bekleyen=\{ozet\?\.quests\?\.claimable \?\? 0\}/.test(sayfa));
  check('kart noktası yalnız >0 ve kapalıyken', /!acik && bekleyen > 0 &&/.test(profil));
  const cagri = (profil.match(/fetch[A-Z]\w+\(/g) ?? []);
  check('kart hâlâ TEK uç çağırıyor', cagri.length === 1, cagri.join(','));
  check('sayfa özeti demo modunda sormuyor', /if \(!panelUnlocked\(getMode\(\)\) \|\| panel\) return;/.test(sayfa));
  check('sayfa özeti gizli sekmede sormuyor', /setInterval\(\(\) => \{ if \(!document\.hidden\) oku\(\); \}/.test(sayfa));
}

console.log('\n── [5] Sayfa ──');
{
  check('Trials kartı sıralamayı Trials\'ta açıyor', /setLbBaslangic\('season'\); hedefiAc\('leaderboard'\)/.test(sayfa));
  check('panel kapanınca varsayılana dönüyor', /if \(panel !== 'leaderboard'\) setLbBaslangic\('descent'\)/.test(sayfa));
  const lb = sayfa.indexOf('{lbDugme.etiket}');
  const trials = sayfa.indexOf('<TrialsKarti');
  const sagKolon = sayfa.indexOf('<EventBanner');
  const boss = sayfa.indexOf('<BossKarti');
  check('Trials sol sütunda, LEADERBOARDS düğmesinin altında', lb > 0 && trials > lb && trials < sagKolon);
  check('Boss sağ sütunda, etkinlik kartının altında', boss > sagKolon && boss - sagKolon < 400);
}

console.log(`\n${FAIL.length === 0 ? '✅ HUD KARTLARI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
