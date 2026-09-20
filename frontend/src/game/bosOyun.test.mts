// BOŞ OYUNDA DÜRÜSTLÜK MÜHRÜ.
//
// 🔴 NİYE VAR (2026-09-20, canlı ölçüm: 2 oyuncu · 30 koşu): oyunun rekabet
// yüzeyleri "zaten kalabalık bir oyun" varsayıyordu. Ölçülen üç yalan:
//   1. Pit kuyruğunda kimse yokken ekran süresiz "Looking for someone…"
//      yazıyordu — oyuncu bunu "bozuk" diye okur ve bir daha denemez.
//   2. Pit panosu yerleşim şartı (haftada N maç) yüzünden kalıcı boştu ve
//      sebebini söylemiyordu.
//   3. Pazar BROWSE sekmesiyle açılıyordu, oysa `/market/buy` token gelene
//      kadar 503 dönüyor: hiçbiri alınamayan bir ilan listesi.
//
// ⚠️ Bu mühür METİN DEĞİL DAVRANIŞ bekliyor: koşulların kendisi taranıyor.
//
//   cd frontend && npx tsx src/game/bosOyun.test.mts

import fs from 'node:fs';
import { PVP_PAYOUT_DEPTH, PVP_PLACEMENT } from './pvpSeason.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const yorumsuz = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const arena = yorumsuz(oku('../components/ArenaScreen.tsx'));
const pano = yorumsuz(oku('../components/LeaderboardsPanel.tsx'));
const pazar = yorumsuz(oku('../components/MarketPanel.tsx'));

console.log('\n=== BOS OYUNDA DURUSTLUK ===');

console.log('\n[1] ** BOS KUYRUK SOYLENIYOR');
{
  check('kuyruk buyuklugu sunucudan okunuyor', /queued: r\.queued \?\? 1/.test(arena));
  check('yalniz kalindiginda durust satir',
    /durum\.queued <= 1 && durum\.waited >= YALNIZ_ESIK_SN/.test(arena));
  check('hemen degil, esikten sonra', /YALNIZ_ESIK_SN = (1[0-9]|[2-9][0-9])/.test(arena));
  // ⚠️ Tek dürüst alternatif asenkron kol: rakibin KAYDI oynanıyor
  check('asenkron kola cikis var', /THE ANSWERING/.test(arena) && /onDuels/.test(arena));
  check('sayfa bu cikisi bagliyor',
    /onDuels=\{\(\) => \{ setScreen\(\{ kind: 'hub' \}\); hedefiAc\('duel'\); \}\}/
      .test(yorumsuz(oku('../app/play/page.tsx'))));
}

console.log('\n[2] ** BOS PIT PANOSU SEBEBINI SOYLUYOR');
{
  check('yerlesim sarti sabitten', PVP_PLACEMENT > 0 && PVP_PAYOUT_DEPTH > 0,
    `${PVP_PLACEMENT} mac · ilk ${PVP_PAYOUT_DEPTH}`);
  check('bos panoda pit icin ek satir',
    /pano\.id === 'pit' && pano\.placement !== undefined/.test(pano)
    && /Placement takes \{pano\.placement\} matches/.test(pano));
  // ⚠️ Sayı ELLE yazılmamalı — kural sunucudan geliyor
  check('sayi elle yazilmamis', !/Placement takes 5 matches/.test(pano));
}

console.log('\n[3] ** PAZAR YAPILABILIR ISLE ACILIYOR');
{
  check('token yokken SELL sekmesi varsayilan',
    /sekmeSecim \?\? \(tokenLive \? 'browse' : 'sell'\)/.test(pazar));
  check('oyuncunun secimi ustte (kontrol grubu)', /sekmeSecim \?\?/.test(pazar));
  check('token yokken BUY dugmesi cizilmiyor', /tokenLive \? 'BUY' : 'AWAITING \$GRAVE'/.test(pazar));
}

console.log('\n[4] ** ODENMIS AD HER LISTEDE AYNI KIMLIK');
{
  /**
   * 🔴 ÖLÇÜLDÜ (2026-09-20 denetimi): ad değiştirmek GOLD harcıyor, ama takip
   * listesi ve düello tablosu `name` alanını hiç seçmiyordu — aynı oyuncu
   * `answering` panosunda adıyla, düello tablosunda kısa cüzdanla
   * görünüyordu. `boards.ts` kuralı yazıyor: bayat/eksik ad servis etmek,
   * ödenen gold'un karşılığını vermemek.
   */
  const follow = yorumsuz(fs.readFileSync(
    new URL('../../../backend/src/follow.ts', import.meta.url), 'utf8'));
  const duelBe = yorumsuz(fs.readFileSync(
    new URL('../../../backend/src/duel.ts', import.meta.url), 'utf8'));
  const followUi = yorumsuz(oku('../components/FollowPanel.tsx'));
  const duelUi = yorumsuz(oku('../components/DuelPanel.tsx'));

  check('takip sorgusu adi ISTIYOR', /select: \{\s*wallet: true, name: true,/.test(follow));
  check('takip satiri adi TASIYOR', /name: p\.name \?\? null/.test(follow));
  check('takip arayuzu adi KULLANIYOR', /oyuncuAdi\(row\)/.test(followUi));
  check('duello sorgusu adi ISTIYOR', /select: \{ duelRating: true, hero: true, name: true \}/.test(duelBe));
  check('duello satiri adi TASIYOR', /name: r\.player\.name \?\? null/.test(duelBe));
  check('duello arayuzu adi KULLANIYOR', /oyuncuAdi\(row\)/.test(duelUi));
  // ⚠️ Kısa cüzdan YEDEK olarak kalmalı: adı olmayan oyuncu da görünmeli
  check('adsiz oyuncu icin kisa cuzdan yedegi duruyor',
    /export function oyuncuAdi/.test(yorumsuz(oku('./playerName.ts'))));
}

console.log('\n[5] ** ZIRVE PUAN OKUNUYOR');
{
  /**
   * 🔴 `pvpSeason.ts` sezon kapanışında zirveyi BİLEREK koruyor ("sıfırlama
   * kimliği silmemeli") ama tüm depoda tek bir okuma yoktu.
   */
  const be = yorumsuz(fs.readFileSync(
    new URL('../../../backend/src/index.ts', import.meta.url), 'utf8'));
  const kart = yorumsuz(oku('../components/ProfileCard.tsx'));
  check('kart ozeti zirveyi tasiyor', /duelPeak: oyuncu\?\.duelPeak \?\? 0/.test(be));
  check('profil kartinda gorunuyor', /peak \$\{Math\.round\(ozet\.duelPeak\)\}/.test(kart));
  // ⚠️ Zirve mevcut puana eşitse yazılmıyor — gürültü olurdu
  check('zirve = puan iken yazilmiyor', /ozet\.duelPeak > ozet\.duelRating/.test(kart));
}

if (FAIL.length) { console.log(`\n${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`); process.exit(1); }
console.log('\nBOS OYUN DURUSTLUGU SAGLAM');
