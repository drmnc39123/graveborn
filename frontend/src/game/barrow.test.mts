// BARROW HAFTALIK ÖDÜLÜ MÜHRÜ.
//
// 🔴 NİYE VAR: bu ödül 2026-09-07'ye kadar YOKTU ve olmadığı fark edilmedi.
// Panel "WHAT THIS PAYS — dust and marks of the barrow" diyordu; oyuncular
// haftalarca boss'a vurdu, tablo doldu, hafta mühürlendi ve hiçbir şey
// ödenmedi. Sebep sessizdi: haftalık kapanış `seasonRating`e göre sıralıyor
// ve o puanı besleyen `recordSeason` YALNIZ descent modunu, DERİNLİĞE göre
// sayıyor — boss hasarı oraya hiç girmiyor.
//
// Bu mühür üç şeyi birden kilitliyor: tablo tutarlı mı, ödeme yolu BAĞLI mı,
// ve vaat ile gerçek aynı mı.
//
//   cd frontend && npx tsx src/game/barrow.test.mts

import fs from 'node:fs';
import {
  BARROW_PAYOUT_DEPTH, BARROW_REWARDS, barrowRewardForRank,
  WORLD_BOSSES, bossOfWeek, bossWeek, weekEndsAt,
} from './worldBoss.js';
import { COSMETICS } from './cosmetics.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n═══ BARROW HAFTALIK ÖDÜLÜ ═══');

console.log('\n[1] ⭐ ÖDÜL YALNIZ İLK 5\'E (kullanıcı kararı)');
{
  check('tablo 5. sırada bitiyor', BARROW_PAYOUT_DEPTH === 5, `#${BARROW_PAYOUT_DEPTH}`);
  for (const r of [1, 2, 3, 4, 5]) {
    check(`#${r} ödül alıyor`, barrowRewardForRank(r) !== null);
  }
  /**
   * ⚠️ ÇİFT TARAFLI ve asıl kural bu: 6. sıra ödül ALMAMALI. Sezon tablosu
   * 100 kişiye iniyor ama oradaki ölçüt DERİNLİK — sunucunun kırpabildiği
   * doğrulanabilir bir sayı. Buradaki ölçüt HASAR ve hasar tam
   * doğrulanamıyor; doğrulanamayan bir sıralamayı derine yaymak, şişirilmiş
   * iddianın ödül alma ihtimalini artırırdı.
   */
  for (const r of [6, 10, 50, 100]) {
    check(`#${r} ödül ALMIYOR`, barrowRewardForRank(r) === null);
  }
  check('0 ve negatif sıra ödül almıyor',
    barrowRewardForRank(0) === null && barrowRewardForRank(-3) === null);
  check('NaN sıra ödül almıyor', barrowRewardForRank(Number.NaN) === null);
}

console.log('\n[2] TABLO TUTARLI');
{
  // Aralıklar çakışmamalı ve boşluk bırakmamalı — biri #3'te ödülsüz kalırdı
  let beklenen = 1;
  let bosluk = '';
  for (const r of BARROW_REWARDS) {
    if (r.from !== beklenen) bosluk = `#${beklenen} ile #${r.from} arası`;
    beklenen = r.to + 1;
  }
  check('aralıklar kesintisiz', !bosluk, bosluk || '1..5 kapalı');
  check('sıralar artan', BARROW_REWARDS.every((r) => r.to >= r.from));
  check('her satırda toz var', BARROW_REWARDS.every((r) => r.dust > 0));
  // ⚠️ Ödül sırayla AZALMALI: 4.'nün 1.'den çok alması sıralamayı anlamsız kılar
  let azalan = true;
  for (let i = 1; i < BARROW_REWARDS.length; i++) {
    if (BARROW_REWARDS[i].dust > BARROW_REWARDS[i - 1].dust) azalan = false;
  }
  check('ödül sırayla azalıyor', azalan,
    BARROW_REWARDS.map((r) => r.dust).join(' → '));
}

console.log('\n[3] ⭐ KOZMETİK GERÇEKTEN VAR');
{
  /**
   * 🔴 UYDURMA BİR ID SESSİZCE HİÇBİR ŞEY VERİR: sunucu diziye ekler,
   * arayüz onu bulamaz, oyuncu ödülünü hiç görmez. Tam da bu bölümün
   * kapatmaya çalıştığı hata sınıfı.
   */
  const idler = new Set(COSMETICS.map((c) => c.id));
  for (const r of BARROW_REWARDS) {
    if (!r.cosmetic) continue;
    check(`"${r.cosmetic}" kozmetiği mevcut`, idler.has(r.cosmetic),
      COSMETICS.find((c) => c.id === r.cosmetic)?.name ?? 'BULUNAMADI');
  }
  // ⚠️ KONTROL GRUBU: küme her şeye "evet" diyor olabilirdi
  check('uydurma id bulunmuyor (kontrol grubu)', !idler.has('r_olmayan_kozmetik'));
}

console.log('\n[4] ⭐ TOZ MUSLUĞU KÜÇÜK KALIYOR');
{
  /**
   * ⚠️ Toz kozmetik parası — gold'a dokunmuyor ama sessizce büyütülürse
   * Reliquary'nin çekiliş değerini düşürür. Sezonun 1.'si 420 toz alıyor;
   * BU TABLONUN TAMAMI ondan az olmalı. Sayı büyütülecekse `sinks.test`
   * yeniden ölçülsün.
   */
  const haftalikTavan = BARROW_REWARDS
    .reduce((s, r) => s + r.dust * (r.to - r.from + 1), 0);
  check('haftalık toplam toz < 420 (sezon 1.\'sinden az)',
    haftalikTavan < 420, `${haftalikTavan} toz/hafta`);
  check('birinciye verilen toz < 420', (BARROW_REWARDS[0]?.dust ?? 0) < 420,
    `${BARROW_REWARDS[0]?.dust}`);
  check('en fazla 1 kozmetik dağıtılıyor',
    BARROW_REWARDS.filter((r) => r.cosmetic).reduce((s, r) => s + (r.to - r.from + 1), 0) <= 1);
}

console.log('\n[5] ⭐ ÖDEME YOLU GERÇEKTEN BAĞLI');
{
  /**
   * 🔴 MÜHRÜN EN ÖNEMLİ PARÇASI. Tablonun doğru olması hiçbir şey ifade
   * etmiyor — asıl hata tam olarak "tablo var, ödeme yok"tu. Kaynak taranıyor.
   */
  const wb = fs.readFileSync('../backend/src/worldBoss.ts', 'utf8');
  check('settleBarrow yazılmış', /export async function settleBarrow/.test(wb));
  check('ödül tablosundan besleniyor', /barrowRewardForRank/.test(wb));
  check('toz gerçekten artırılıyor', /dust:\s*\{\s*increment/.test(wb));
  check('kozmetik envantere yazılıyor', /cosmetics:\s*\[/.test(wb));
  // ⚠️ ÇİFT ÖDÜL KALKANI: kapanış mührü ödüllerle AYNI transaction'da ve
  // İLK yazılmalı. Sıra tersine olsaydı ödüller verilip kapanış düşerdi.
  check('kapanış mührü var (BossClose)', /bossClose\.create/.test(wb));
  check('banlı oyuncu eleniyor', /banned/.test(wb));

  const idx = fs.readFileSync('../backend/src/index.ts', 'utf8');
  check('kapanış bir uçtan TETİKLENİYOR', /settleBarrow\(\)/.test(idx));

  const sema = fs.readFileSync('../backend/prisma/schema.prisma', 'utf8');
  check('BossClose tablosu şemada', /model BossClose/.test(sema));
  check('BossAward tablosu şemada', /model BossAward/.test(sema));
  // ⚠️ Migration olmadan tablo üretimde OLUŞMAZ ve kapanış her hafta patlar
  const migDir = '../backend/prisma/migrations';
  const migVar = fs.readdirSync(migDir).some((d) => {
    try { return /BossClose/.test(fs.readFileSync(`${migDir}/${d}/migration.sql`, 'utf8')); }
    catch { return false; }
  });
  check('migration dosyası var', migVar);
}

console.log('\n[6] ⭐ VAAT İLE GERÇEK AYNI');
{
  /**
   * Ekranda yazan ile ödenen ayrışırsa, bu bölümün kapattığı hatanın aynısı
   * geri gelir — sadece ters yönde. Panel sayıları TABLODAN türetmeli, elle
   * yazmamalı.
   */
  const panel = fs.readFileSync('src/components/WorldBossPanel.tsx', 'utf8');
  check('panel tabloyu içe aktarıyor', /BARROW_REWARDS/.test(panel));
  check('panel ilk-N sayısını tablodan alıyor', /BARROW_PAYOUT_DEPTH/.test(panel));
  // ⚠️ Elle yazılmış "top 5" kalırsa tablo değişince ekran yalan söyler
  check('panelde elle yazılmış sıra sayısı yok', !/Top 5\b/.test(panel));
}

console.log('\n[7] HAFTA VE BOSS DÖNGÜSÜ (ödülün dayandığı eksen)');
{
  const w = bossWeek(new Date());
  check('hafta pozitif', w > 0, String(w));
  check('boss havuzu dolu', WORLD_BOSSES.length >= 4, `${WORLD_BOSSES.length} boss`);
  check('aynı hafta = aynı boss', bossOfWeek(w).id === bossOfWeek(w).id);
  // ⚠️ Döngü dönmeli: aynı boss her hafta çıkarsa "haftalık" olmasının anlamı kalmaz
  const dizi = [0, 1, 2, 3].map((i) => bossOfWeek(w + i).id);
  check('ardışık haftalar farklı boss', new Set(dizi).size === dizi.length, dizi.join(' → '));
  check('hafta sonu gelecekte', weekEndsAt(w) > Date.now());
}

console.log(`\n${FAIL.length === 0 ? '✅ BARROW ÖDÜLÜ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
