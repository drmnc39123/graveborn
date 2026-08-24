// DÜELLO TESTİ — puanın sömürülebilir olup olmadığı.
//
// Buradaki asıl risk "yanlış Elo" değil, PUANIN BEDAVA ÜRETİLEBİLMESİ:
// kendine meydan okumak, aynı rakibi sonsuz ezmek, ya da kaybederken bile
// puan kazanmak. Üçü de sıralamayı anlamsız kılar ve kimse fark etmez —
// tablodaki isimler yavaşça değişir, o kadar.
//
// İkinci risk ekonomik: toz musluğu. Düello sınırsız oynanabildiği için
// başına toz vermek, oyuncu başına sınırsız toz demek olurdu.
//
// Çalıştır:  npx tsx src/game/duel.test.mts

import {
  DUEL, DUEL_TIERS, STALE_ENGINE, STALE_RECORD, duelBlocker, duelTier, duelWon, dustForWin,
  expectedScore, nextRatings,
} from './duel.js';

// ⚠️ Sürüm kontrolü DIŞINDAKİ testlerde iki taraf da bu sabiti kullanıyor:
// motor sürümü ilgisiz olduğu için değil, EŞİT olduğu için engel çıkmasın.
const SIM = 11;

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n═══ DÜELLO ═══');

console.log('\n[1] Elo temelleri');
{
  check('eşit puanda beklenti %50', Math.abs(expectedScore(1000, 1000) - 0.5) < 1e-9);
  check('yüksek puanlı favori', expectedScore(1400, 1000) > 0.9,
    `${(expectedScore(1400, 1000) * 100).toFixed(1)}%`);
  check('beklentiler toplamı 1',
    Math.abs(expectedScore(1234, 987) + expectedScore(987, 1234) - 1) < 1e-9);

  const k = nextRatings(1000, 1000, true);
  check('eşit rakibi yenmek puan kazandırıyor', k.challenger > 1000, `${k.challenger}`);
  check('kaybeden puan kaybediyor', k.defender < 1000, `${k.defender}`);
  check('delta bildiriliyor', k.delta === k.challenger - 1000, `${k.delta}`);
}

console.log('\n[2] ⭐ Zayıf rakip FARM EDİLEMİYOR');
{
  // ⚠️ Elo'nun asıl işi bu: çok zayıf birini yenmek neredeyse hiçbir şey
  // kazandırmamalı, yoksa "en zayıfı bul ve döngüye al" bir strateji olur.
  const guclu = nextRatings(1800, 900, true);
  console.log(`     1800 vs 900 → kazanç ${guclu.delta}`);
  check('çok zayıfı yenmek neredeyse sıfır', guclu.delta <= 1, `${guclu.delta}`);

  const zayif = nextRatings(900, 1800, true);
  console.log(`     900 vs 1800 → kazanç ${zayif.delta}`);
  check('çok güçlüyü yenmek çok kazandırıyor', zayif.delta >= 25, `${zayif.delta}`);

  // Sürtünme: 100 kez zayıf rakip ezmek ne kazandırır?
  let r = 1800;
  for (let i = 0; i < 100; i++) r = nextRatings(r, 900, true).challenger;
  console.log(`     100 kez 900'ü ezmek → ${1800} → ${r}`);
  check('100 farm maçı bile puanı uçurmuyor', r - 1800 <= 100, `+${r - 1800}`);
}

console.log('\n[3] ⭐ Puan ENFLASYONU yok');
{
  // ⚠️ Elo sıfır toplamlı olmalı; iki taraf farklı K kullandığında küçük
  // bir sapma çıkıyor (tepedekinin puanı yavaş oynasın diye). Sapmanın
  // TOPLAMDA anlamsız kaldığı ölçülmeli — yoksa herkes zamanla yükselir
  // ve puan bir sıralama olmaktan çıkar.
  let toplamOnce = 0, toplamSonra = 0;
  const seeds = [900, 1000, 1050, 1200, 1400, 1550, 1700, 1900];
  for (const a of seeds) {
    for (const b of seeds) {
      for (const kazandi of [true, false]) {
        const r = nextRatings(a, b, kazandi);
        toplamOnce += a + b;
        toplamSonra += r.challenger + r.defender;
      }
    }
  }
  const sapma = (toplamSonra - toplamOnce) / toplamOnce;
  console.log(`     ${seeds.length ** 2 * 2} maç → toplam puan sapması %${(sapma * 100).toFixed(4)}`);
  check('toplam puan neredeyse korunuyor', Math.abs(sapma) < 0.002,
    `%${(sapma * 100).toFixed(4)}`);

  // Uzun bir ladder simülasyonu: puanlar patlamamalı
  const oyuncular = Array.from({ length: 40 }, () => DUEL.start);
  for (let maç = 0; maç < 4000; maç++) {
    const i = maç % 40;
    const j = (maç * 7 + 3) % 40;
    if (i === j) continue;
    // Daha yüksek puanlı %70 kazansın (beceri farkı taklidi)
    const kazandi = (maç % 10) < 7 ? oyuncular[i] >= oyuncular[j] : oyuncular[i] < oyuncular[j];
    const r = nextRatings(oyuncular[i], oyuncular[j], kazandi);
    oyuncular[i] = r.challenger; oyuncular[j] = r.defender;
  }
  const ort = oyuncular.reduce((s, v) => s + v, 0) / oyuncular.length;
  const enYuksek = Math.max(...oyuncular);
  const enDusuk = Math.min(...oyuncular);
  console.log(`     4000 maç sonrası → ort ${ort.toFixed(0)} · aralık ${enDusuk}–${enYuksek}`);
  check('ortalama başlangıca yakın kalıyor', Math.abs(ort - DUEL.start) < 60, `${ort.toFixed(0)}`);
  check('puan taban altına inmiyor', enDusuk >= 100, `${enDusuk}`);
  check('tablo GERÇEKTEN ayrışıyor (herkes aynı değil)', enYuksek - enDusuk > 200,
    `aralık ${enYuksek - enDusuk}`);
}

console.log('\n[4] ⭐ Beraberlik SAVUNANIN — "aynı sayıyı tuttur" kazanç değil');
{
  check('daha derin = kazanç', duelWon(41, 40));
  check('AYNI derinlik kazanç DEĞİL', !duelWon(40, 40));
  check('daha sığ = kayıp', !duelWon(39, 40));
  check('ikisi de 0 → kazanç yok', !duelWon(0, 0));
}

console.log('\n[5] ⭐ GÜVENLİK: kendine ve aynı rakibe sonsuz meydan okuma');
{
  // ⚠️ Kendine meydan okumak, iki tarafı da aynı hesap olduğu için puanı
  // serbestçe şişirmenin en kolay yolu olurdu.
  const kendi = duelBlocker({ challenger: 'A', defender: 'A', hoursSince: 999, stageCleared: true, recordSim: SIM, engineSim: SIM });
  check('kendine meydan okunamıyor', !!kendi, kendi ?? '');

  const soguma = duelBlocker({ challenger: 'A', defender: 'B', hoursSince: 1, stageCleared: true, recordSim: SIM, engineSim: SIM });
  check('soğuma süresi içinde REDDEDİLİYOR', !!soguma, soguma ?? '');
  check('soğuma sebebi KALAN SÜREYİ söylüyor', !!soguma && /\d+h/.test(soguma), soguma ?? '');

  const sonra = duelBlocker({ challenger: 'A', defender: 'B', hoursSince: DUEL.cooldownHours, stageCleared: true, recordSim: SIM, engineSim: SIM });
  check('soğuma bitince geçiyor', sonra === null);

  const kilitli = duelBlocker({ challenger: 'A', defender: 'B', hoursSince: 999, stageCleared: false, recordSim: SIM, engineSim: SIM });
  check('temizlenmemiş bölüme meydan okunamıyor', !!kilitli, kilitli ?? '');

  // İlk düello (hiç geçmiş yok)
  check('ilk düello serbest',
    duelBlocker({ challenger: 'A', defender: 'B', hoursSince: Infinity, stageCleared: true, recordSim: SIM, engineSim: SIM }) === null);

  // Sebepler boş metin olmamalı
  const hepsi = [kendi, soguma, kilitli].filter(Boolean) as string[];
  check('hiçbir sebep boş değil', hepsi.every((s) => s.trim().length > 5));
}

console.log('\n[5b] ⭐ MÜHÜR: MOTOR SÜRÜMÜ — eski kayıt tekrar OYNATILAMAZ');
{
  // 🔴 BU BİR SESSİZ ADALETSİZLİKTİ. Düellonun tek dayanağı "aynı seed →
  // aynı koşu"; bu eşitlik SADECE iki taraf aynı motoru çalıştırdığında
  // geçerli. `SIM_VERSION` 11'den 12'ye çıktığında (nearestEnemyTo ızgara
  // yerine düz tarama) aynı seed BAŞKA bir koşu üretmeye başladı — v11'de
  // kaydedilmiş bir düello v12'de tekrar oynatılınca meydan okuyan,
  // savunanın HİÇ karşılaşmadığı bir koşuyu oynayıp onun derinliğiyle
  // kıyaslanıyordu. Kazanan sessizce değişebilirdi ve kimse sebebini
  // göremezdi.
  //
  // ⚠️ ÇİFT TARAFLI ÖLÇÜM. Sadece "uyuşmazlık reddediliyor" demek yetmez:
  // her şeyi reddeden bir kontrol de o testi geçer. Uyuşma hâlinin GEÇTİĞİ
  // de aynı yerde ölçülüyor.
  const ortak = { challenger: 'A', defender: 'B', hoursSince: Infinity, stageCleared: true };

  const eski = duelBlocker({ ...ortak, recordSim: 11, engineSim: 12 });
  check('⭐ ESKİ sürümde kaydedilmiş kayıt REDDEDİLİYOR', eski === STALE_RECORD, eski ?? 'null');

  const yeni = duelBlocker({ ...ortak, recordSim: 12, engineSim: 12 });
  check('⭐ AYNI sürüm GEÇİYOR (kontrol her şeyi reddetmiyor)', yeni === null, yeni ?? 'null');

  // Diğer yön: kayıt sunucudan İLERİDE (frontend yeni, backend eski dağıtım
  // penceresi). Bu da uyuşmazlık — tek yönlü bir karşılaştırma yanlış olurdu.
  const ileri = duelBlocker({ ...ortak, recordSim: 12, engineSim: 11 });
  check('⭐ İLERİ sürümlü kayıt da REDDEDİLİYOR', ileri === STALE_RECORD, ileri ?? 'null');

  // ⚠️ 0 = damga öncesi kayıt. Gerçek bir SIM_VERSION asla 0 değil, bu yüzden
  // eski satırlar KENDİLİĞİNDEN oynanamaz sayılmalı — güvenli tarafa kapalı.
  const damgasiz = duelBlocker({ ...ortak, recordSim: 0, engineSim: 12 });
  check('⭐ DAMGASIZ (0) eski kayıt oynanamıyor', damgasiz === STALE_RECORD, damgasiz ?? 'null');

  // ⚠️ SÜRÜM KONTROLÜ DİĞER ŞARTLARDAN ÖNCE. Sürüm tutmuyorsa oynanacak koşu
  // zaten rakibin koşusu değil; "önce bölümü temizle" demek oyuncuyu
  // çözemeyeceği bir işe yollardı.
  const ikisiDe = duelBlocker({
    ...ortak, stageCleared: false, recordSim: 11, engineSim: 12,
  });
  check('sürüm sebebi bölüm sebebinden ÖNCE geliyor', ikisiDe === STALE_RECORD, ikisiDe ?? 'null');

  // Kendine meydan okuma sürümden de ÖNCE — Elo şişirme her hâlükârda kapalı
  const kendine = duelBlocker({
    ...ortak, defender: 'A', recordSim: 11, engineSim: 12,
  });
  check('kendine meydan okuma sürümden bağımsız kapalı',
    !!kendine && kendine !== STALE_RECORD, kendine ?? 'null');

  // İki sebep AYRI cümle: yapılacak şey de ayrı (birinde bekle, diğerinde yenile)
  check('kayıt ve motor sebepleri AYRI', STALE_RECORD !== STALE_ENGINE);
  check('iki sebep de oyuncuya NE YAPACAĞINI söylüyor',
    /refresh|descen/i.test(STALE_RECORD) && /reload/i.test(STALE_ENGINE));
}

console.log('\n[6] ⭐ EKONOMİ: toz musluğunun SERT tavanı');
{
  // ⚠️ Düello sınırsız oynanabiliyor. Kazanç başına toz vermek, oyuncu
  // başına SINIRSIZ toz demekti.
  check('ilk kazanç toz veriyor', dustForWin(0) === DUEL.dustPerWin, `${dustForWin(0)}`);
  check('tavandaki kazanç toz VERMİYOR', dustForWin(DUEL.dailyRewarded) === 0);
  check('tavanın üstü de vermiyor', dustForWin(DUEL.dailyRewarded + 50) === 0);

  const gunluk = Array.from({ length: 100 }, (_, i) => dustForWin(i)).reduce((s, v) => s + v, 0);
  console.log(`     100 kazanç oynasa bile günlük toz: ${gunluk}`);
  check('günlük toz TAVANLI', gunluk === DUEL.dailyRewarded * DUEL.dustPerWin, `${gunluk}`);

  // ⚠️ Düello GOLD ödemiyor — bu oturumda beşinci kez aynı kural
  const alanlar = Object.keys(DUEL);
  check('DUEL tablosunda gold alanı YOK', !alanlar.some((k) => /gold/i.test(k)),
    alanlar.join(', '));
}

console.log('\n[7] Kademeler');
{
  check('taban kademe 0 puandan başlıyor', DUEL_TIERS[0].min === 0);
  check('kademeler artan sırada',
    DUEL_TIERS.every((t, i) => i === 0 || t.min > DUEL_TIERS[i - 1].min),
    DUEL_TIERS.map((t) => t.min).join(' < '));
  check('başlangıç puanı bir kademeye düşüyor', !!duelTier(DUEL.start).name,
    `${DUEL.start} → ${duelTier(DUEL.start).name}`);
  check('taban puan (100) kademesiz kalmıyor', duelTier(100).name === DUEL_TIERS[0].name);
  check('çok yüksek puan en üst kademe',
    duelTier(99999).name === DUEL_TIERS[DUEL_TIERS.length - 1].name);

  // ⚠️ MOR YOK — paletin dışına çıkan tek renk sistemi bozar
  const mor = DUEL_TIERS.filter((t) => {
    const h = t.color.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return b > r && b > g * 1.2 && r > g;   // kabaca mor/menekşe
  });
  check('kademe renklerinde MOR yok', mor.length === 0, mor.map((t) => t.color).join(','));
}

console.log(`\n${FAIL.length === 0 ? '✅ DÜELLO SÖMÜRÜLEMİYOR' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
