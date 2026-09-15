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
const kamu = yorumsuz(oku('../../../backend/src/kamuSuzgec.ts'));
const pvp = yorumsuz(oku('../../../backend/src/pvpSeason.ts'));
const duello = yorumsuz(oku('../../../backend/src/duel.ts'));
const sunucu = yorumsuz(oku('../../../backend/src/index.ts'));
const duelPanel = yorumsuz(oku('../components/DuelPanel.tsx'));
const gunlukKart = yorumsuz(oku('../components/DailyCard.tsx'));

/**
 * Bir fonksiyonun gövdesi — bir sonraki ÜST DÜZEY bildirime kadar.
 *
 * ⚠️ İlk sürüm yalnız `\nexport `ta duruyordu ve dışa aktarılmayan
 * yardımcıları da gövdeye katıyordu: `sutunPanosu`ndan süzgeç silindiğinde
 * sayım, ARKADAKİ `gunlukPano`nun süzgecini sayıp YEŞİL kaldı (hata
 * enjeksiyonu yakaladı).
 */
const govde = (kaynak: string, ad: string) => {
  const i = kaynak.indexOf(`function ${ad}(`);
  if (i < 0) return '';
  const sonraki = /\r?\n(export |async function |function |const |interface |type )/g;
  sonraki.lastIndex = i + 1;
  const m = sonraki.exec(kaynak);
  return kaynak.slice(i, m ? m.index : undefined);
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
  const suzgec = govde(kamu, 'herkeseAcikOyuncu');
  check('hazine koşulu şartlı yayılıyor', /\.\.\.\(\s*h\s*\?\s*\{\s*wallet:\s*\{\s*not:\s*h\s*\}\s*\}\s*:\s*\{\}\s*\)/.test(suzgec));
  // ⚠️ Yalnız WALLET için: `claimedAt: { not: null }` null olabilen sütunda geçerli.
  check('`wallet: { not: null }` yazılmamış', !/wallet:\s*\{\s*not:\s*null/.test(panolar + kamu));
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

console.log('\n── [5] GET /boards/:id ──');
{
  check('uç var ve kimliği doğruluyor', /app\.get\('\/boards\/:id'[\s\S]{0,200}panoIdMi\(/.test(sunucu));
  // ⚠️ `paraLimiti` kovası `/run/finish` ile ORTAK (30/dk)
  const kova = sunucu.slice(sunucu.indexOf('const paraLimiti'), sunucu.indexOf(']) app.use(yol, paraLimiti)'));
  check('/boards para kovasında DEĞİL', kova.length > 0 && !kova.includes("'/boards"));
  const sutun = govde(panolar, 'sutunPanosu');
  check('sütun panoları kamu süzgecini kullanıyor (liste + sayım)',
    (sutun.match(/herkeseAcikOyuncu\(\)/g) ?? []).length >= 2 && /herkeseAcikMi\(/.test(sutun));
  check('boss panosu süzüyor (ilişki yok, bellekte)', /herkeseAcikMi\(/.test(govde(panolar, 'bossPanosu')));
  check('günlük `me` sayımı da süzülüyor', /herkeseAcikOyuncu\(\)/.test(govde(panolar, 'gunlukPano')));
  const oku_ = govde(panolar, 'panoOku');
  const sezonDali = oku_.slice(oku_.indexOf("case 'season'"), oku_.indexOf("case 'daily'"));
  check('season okumadan ÖNCE kapatıyor', sezonDali.indexOf('settleSeasons(') >= 0
    && sezonDali.indexOf('settleSeasons(') < sezonDali.indexOf('topSeason('));
  const pitDali = oku_.slice(oku_.indexOf("case 'pit'"), oku_.indexOf("case 'answering'"));
  check('pit okumadan ÖNCE kapatıyor', pitDali.indexOf('settlePvpSeasons(') >= 0
    && pitDali.indexOf('settlePvpSeasons(') < pitDali.indexOf('pvpBoard('));
  // ⚠️ `bossState` her okumada upsert yapıyor — pano yazma yan etkisi taşımaz
  check('pano `bossState` çağırmıyor', !/bossState\(/.test(panolar));
  // ⚠️ Önbellek BİLEREK yok (ad ücretli değişiyor; `me` taze, liste bayat çelişkisi)
  check('önbellek yok (Map/TTL)', !/new Map<string,\s*\{[^}]*rows/.test(panolar) && !/TTL|setTimeout/.test(panolar));
  check('tüm-zamanlar ve sezon da kamu süzgecinde',
    /herkeseAcikOyuncu\(\)/.test(govde(yorumsuz(oku('../../../backend/src/leaderboard.ts')), 'top'))
    && /herkeseAcikOyuncu\(\)/.test(govde(sezon, 'topSeason')));
}

console.log('\n── [6] LeaderboardsPanel ──');
{
  const panel = yorumsuz(oku('../components/LeaderboardsPanel.tsx'));
  const oturum = yorumsuz(oku('../lib/gameSession.ts'));
  const idler = (kaynak: string, ad: string) => {
    const m = kaynak.match(new RegExp(`${ad}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
    return m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) : [];
  };
  const sunucuIdleri = idler(panolar, 'PANO_IDLERI');
  const istemciIdleri = idler(oturum, 'BOARD_IDS');
  check('istemci ve sunucu pano kimlikleri AYNI', sunucuIdleri.length === 11
    && JSON.stringify(sunucuIdleri) === JSON.stringify(istemciIdleri), `${sunucuIdleri.length} / ${istemciIdleri.length}`);
  const cipIdleri = [...panel.matchAll(/\bid:\s*'([a-z]+)',\s*grup:/g)].map((x) => x[1]);
  check('her pano kimliğinin bir çipi var (fazlası yok)',
    JSON.stringify([...cipIdleri].sort()) === JSON.stringify([...istemciIdleri].sort()), cipIdleri.join(','));
  check('panel tek uçtan okuyor', /fetchBoard\(id\)/.test(panel) && !/fetchLeaderboard|fetchSeasonBoard/.test(panel));
  check('geç dönen istek yeni panoyu ezmiyor (iptal bayrağı)', /if \(!iptal\) setPano/.test(panel));
  check('kendi satırım listede yoksa altta sabit', /pano\.me && !listede/.test(panel));
  check('WATCH yalnız cüzdanlı başkasının satırında', /!mine && row\.wallet && <WatchButton/.test(panel));
  // ⚠️ Kullanıcı kararı: yeni panolar ÖDÜL VERMİYOR — ödül tablosu yalnız TRIALS'ta
  check('ödül tablosu yalnız DESCENT TRIALS\'ta', (panel.match(/<SeasonRewards \/>/g) ?? []).length === 1
    && /pano\.id === 'season' && \(/.test(panel));
  check('eski iki sekmeli tablo kalmadı', !/export function Leaderboard\(/.test(yorumsuz(oku('../components/RecordsPanel.tsx'))));
  // ⚠️ `C.border` zaten rgba(): sonuna saydamlık eklemek geçersiz renk üretir
  check('`${C.border}XX` geçersiz renk yazılmamış', !/\$\{C\.border\}[0-9a-fA-F]{2}/.test(panel));
  // 🔴 375 px'de kademe yazısı adın ÜSTÜNE biniyordu (ölçüldü): ad sütunu
  // kırpıyor ve sağda tek değer etiketi kalıyor — ikincil bilgi adın altında.
  const satir = govde(panel, 'Line');
  check('ad sütunu taşanı kırpıyor', /flex:\s*1,\s*minWidth:\s*0,\s*overflow:\s*'hidden'/.test(satir));
  check('satırın sağında TEK değer etiketi (ikincil bilgi alt satırda)',
    /\{etiket\}/.test(satir) && /\{alt\}/.test(satir) && !/<Deger\b/.test(panel));
  // 🔴 375 px'de üç PixelButton grubu ÜÇ SATIRA düşüyordu (120 px × 3 > 227 px)
  check('grup seçici üç eşit sütun (PixelButton değil)',
    /gridTemplateColumns:\s*'repeat\(3, minmax\(0, 1fr\)\)'/.test(govde(panel, 'Secici')) && !/PixelButton/.test(panel));
}

console.log(`\n${FAIL.length === 0 ? '✅ PANOLAR MÜHÜRLÜ' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
