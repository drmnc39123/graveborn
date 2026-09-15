// LEADERBOARDS MÜHRÜ — kaynak taraması.
//
// 🔴 NİYE KAYNAK TARAMASI: davranış testleri backend'de (`backend/src/
// boards.test.mts`, `season.test.mts` [6]) ve veritabanı istiyor; `seals.mjs`
// yalnız frontend'i koşuyor. O testler elle koşulduğu için bir gerileme
// haftalarca görünmeyebilirdi — bu mühür `npm test`e giren bekçi.
//
// Mühürlenen kararlar ve ölçülmüş sebepleri:
//   [1] EZMEDEN ÖNCE KAPAT — `recordSeason` geçen haftanın puanını silmeden
//       önce `settleSeasons` çağırıyor. Yoksa tabloyu kimse açmadan yeniden
//       oynayan oyuncu haftalık ödülünü kaybediyordu (ölçüldü).
//   [2] KAMU SÜZGECİ — hazine koşulu şartlı yayılıyor (`{not:null}` çalışma
//       anında patlar) ve oyuncu okuyan panolar onu kullanıyor. `/daily`
//       süzgeçsizdi: banlı oyuncu ile hazine listeleniyordu.
//   [3] ADLAR — sezon satırı tüm-zamanlar satırıyla AYNI tip; PvP ve günlük
//       tablolar ad taşıyor; panel ADI ÇİZİYOR. The Answering adı sunucudan
//       zaten gönderiyordu ama panel `kisa(row.wallet)` çiziyordu — veri
//       geliyor, son adımda ölüyordu.
//
// ⚠️ KAYNAK YORUMLARI SÖKÜLEREK taranıyor.
//
//   cd frontend && npx tsx src/game/boards.test.mts

import { readFileSync } from 'node:fs';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const yorumsuz = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const yorumsuzSql = (s: string) => s.replace(/--.*$/gm, '');

const sezon = yorumsuz(oku('../../../backend/src/season.ts'));
const panolar = yorumsuz(oku('../../../backend/src/boards.ts'));
const pvp = yorumsuz(oku('../../../backend/src/pvpSeason.ts'));
const duello = yorumsuz(oku('../../../backend/src/duel.ts'));
const sunucu = yorumsuz(oku('../../../backend/src/index.ts'));
const duelPanel = yorumsuz(oku('../components/DuelPanel.tsx'));
const gunlukKart = yorumsuz(oku('../components/DailyCard.tsx'));

/** Bir fonksiyonun gövdesi — bir sonraki üst düzey `export`a kadar */
const govde = (kaynak: string, ad: string) => {
  const i = kaynak.indexOf(`function ${ad}(`);
  if (i < 0) return '';
  const j = kaynak.indexOf('\nexport ', i + 1);
  return kaynak.slice(i, j < 0 ? undefined : j);
};

console.log('\n── [1] ezmeden önce kapat ──');
{
  const kayit = govde(sezon, 'recordSeason');
  const kapanis = kayit.indexOf('settleSeasons(');
  const ezme = kayit.indexOf('seasonWeek: { lt: week }');
  check('recordSeason gövdesi bulundu', kayit.length > 0);
  check('recordSeason settleSeasons çağırıyor', kapanis > 0);
  check('kapanış, geçen haftayı ezen yazımdan ÖNCE', kapanis > 0 && ezme > 0 && kapanis < ezme,
    `kapanış @${kapanis} · ezme @${ezme}`);
  // ⚠️ Kapanış hatası koşu kapanışını düşürmemeli — oyuncunun kazandığı
  // gold'u bir sezon hatası yüzünden kaybetmesi, düzeltilen hatadan kötü.
  check('kapanış hatası yutuluyor (koşu kapanışı düşmüyor)',
    /settleSeasons\([^)]*\)\s*\.catch\(/.test(kayit));
}

console.log('\n── [2] kamu süzgeci ──');
{
  const suzgec = govde(panolar, 'herkeseAcikOyuncu');
  check('hazine koşulu şartlı yayılıyor', /\.\.\.\(\s*h\s*\?\s*\{\s*wallet:\s*\{\s*not:\s*h\s*\}\s*\}\s*:\s*\{\}\s*\)/.test(suzgec));
  // ⚠️ Yalnız WALLET için: `claimedAt: { not: null }` null olabilen sütunda geçerli.
  check('`wallet: { not: null }` yazılmamış', !/wallet:\s*\{\s*not:\s*null/.test(panolar));
  check('günlük tablo süzgeci kullanıyor', /player:\s*herkeseAcikOyuncu\(\)/.test(govde(panolar, 'gunlukTablo')));
  check('/daily sorguyu KOPYALAMIYOR, gunlukTablo okuyor',
    sunucu.includes('gunlukTablo(') && !/mode:\s*'daily',\s*startedAt:\s*\{\s*gte:\s*bas\s*\},\s*claimedAt/.test(sunucu));
  check('The Pit süzgeci kullanıyor', /herkeseAcikOyuncu\(\)/.test(govde(pvp, 'pvpBoard')));
  check('The Answering süzgeci kullanıyor', /herkeseAcikOyuncu\(\)/.test(govde(duello, 'ladder')));
  check('The Pit / Answering çıplak `banned: false` kalmadı',
    !/banned:\s*false/.test(govde(pvp, 'pvpBoard')) && !/banned:\s*false/.test(govde(duello, 'ladder')));
}

console.log('\n── [3] adlar ──');
{
  check('SeasonRow = tüm-zamanlar Row (ayrı arayüz değil)', /export type SeasonRow = Row;/.test(sezon));
  check('sezon tablosu ad + kozmetik + anıt seçiyor',
    /name:\s*true/.test(sezon) && /equipped:\s*true/.test(sezon) && /ossuary:\s*true/.test(sezon));
  check('The Pit satırı ad taşıyor', /name:\s*r\.name/.test(govde(pvp, 'pvpBoard')));
  check('günlük satır ad taşıyor', /name:\s*r\.player\.name/.test(govde(panolar, 'gunlukTablo')));
  check('düello sıralaması ADI çiziyor', /oyuncuAdi\(\{\s*wallet:\s*row\.wallet,\s*name:\s*row\.name\s*\}\)/.test(duelPanel));
  check('günlük kart ADI çiziyor', /oyuncuAdi\(\{\s*wallet:\s*r\.wallet,\s*name:\s*r\.name\s*\}\)/.test(gunlukKart));
  check('düello sıralamasında çıplak kısa cüzdan kalmadı', !/'You'\s*:\s*kisa\(row\.wallet\)/.test(duelPanel));
}

console.log('\n── [4] pano sütunları (goldEarned · forgeLevels) ──');
{
  const { readdirSync } = await import('node:fs');
  const gocDizini = new URL('../../../backend/prisma/migrations/', import.meta.url);
  const goc = readdirSync(gocDizini).find((d) => d.endsWith('_board_columns'));
  const sql = goc ? yorumsuzSql(readFileSync(new URL(`${goc}/migration.sql`, gocDizini), 'utf8')) : '';
  check('migration var', !!goc && /ADD COLUMN "goldEarned"/.test(sql) && /ADD COLUMN "forgeLevels"/.test(sql));
  // 🔴 Doldurma migration'da YASAK: sıfır kesintili geçişte eski konteyner yazıyor
  check('migration YALNIZ sütun + indeks (UPDATE/INSERT yok)', !!sql && !/\b(UPDATE|INSERT|DELETE)\b/i.test(sql));
  check('dust indeksi de açılıyor', /CREATE INDEX "Player_dust_idx"/.test(sql));

  const bitis = sunucu.slice(sunucu.indexOf("app.post('/run/finish'"), sunucu.indexOf('recordDescent(wallet'));
  const islem = bitis.slice(bitis.indexOf('prisma.$transaction(['));
  check('goldEarned artışı koşu kapanışı transaction\'ında', /goldEarned:\s*\{\s*increment:/.test(islem));
  check('aynı transaction\'da defter `run` kaydı', /kind:\s*'run'/.test(islem));
  check('ultra hesap kazanç yazmıyor', /goldEarned:\s*\{\s*increment:\s*ultraMi\(wallet\)\s*\?\s*0/.test(islem));
  const tumKaynak = sunucu + yorumsuz(oku('../../../backend/src/ledger.ts')) + yorumsuz(oku('../../../backend/src/db.ts'));
  check('goldEarned BAŞKA hiçbir yerde artırılmıyor',
    (tumKaynak.match(/goldEarned:\s*\{\s*increment/g) ?? []).length === 1);

  const db = yorumsuz(oku('../../../backend/src/db.ts'));
  check('forgeLevels `fromProgress`te, upgrades ile aynı yazımda',
    /forgeLevels:\s*forgeLevelsOf\(p\.upgrades\)/.test(govde(db, 'fromProgress')));
  const kur = govde(panolar, 'panoSutunlariniKur');
  check('yeniden kurma defterin YALNIZ `run` kaydını topluyor', /l\.kind\s*=\s*'run'/.test(kur));
  check('yeniden kurma forge için AYNI fonksiyonu kullanıyor', /forgeLevelsOf\(/.test(kur));
  check('yeniden kurma ucu yöneticiye kapalı', /app\.post\('\/admin\/boards\/recompute',\s*adminOnly/.test(sunucu));
  check('yönetici panelinde düğme var', yorumsuz(oku('../app/gbadmin123/page.tsx')).includes("'/admin/boards/recompute'"));

  const profil = yorumsuz(oku('../../../backend/src/profile.ts'));
  check('profil "gold earned" sütundan okuyor (boss hasarı değil)',
    /goldEarned:\s*player\?\.goldEarned/.test(profil) && !/_sum:\s*\{\s*awarded/.test(profil));
  check('Tavern kartı panoyla aynı forge fonksiyonu',
    /forgeLevelsOf\(progress\.upgrades\)/.test(yorumsuz(oku('../components/RecordsPanel.tsx'))));
}

console.log(`\n${FAIL.length === 0 ? '✅ PANOLAR MÜHÜRLÜ' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
