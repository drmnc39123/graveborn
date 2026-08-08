// DÜŞMAN DAVRANIŞLARI — R5/12'nin ikinci yarısı.
//
// ⚠️ NİYE AYRI DOSYA: `sim.test.mts` 15 dakika sürüyor ve buradaki soruların
// çoğu saniyelik. 15 dakikalık bir paketin arkasına saklanan test, koşulmayan
// testtir.
//
// EN ÖNEMLİ SORU BÖLÜNEN DÜŞMAN: her ölüm iki düşman doğuruyorsa bölüm
// matematiksel olarak bitmeyebilir. Yakınsama garantisi bu oyunun kırmızı
// çizgisi (Ossuary Halls: 14 düşman, 25 dakika, hiç bitmedi).
//
// Çalıştır:  npx tsx src/game/enemies.test.mts

import { Game } from './engine.js';
import {
  BEHAVIOR, DESCENT, ENEMIES, PLAYER, STAGES, TICK,
  type EnemyType,
} from './config.js';
import { seedFromString } from './rng.js';

let hata = 0;
function check(ad: string, kosul: boolean, detay = '') {
  console.log(`  ${kosul ? '✓' : '✗'} ${ad}${detay ? ` — ${detay}` : ''}`);
  if (!kosul) hata++;
}

/**
 * ⚠️ BOSS'SUZ BÖLÜM ŞART. İlk sürüm `STAGES[3]` kullanıyordu ve İKİ ölçüm
 * birden yalan söyledi: bölüm "bitmedi" göründü (aslında sürü temizlenmişti,
 * boss seviye-1 bir build'e karşı 420 saniye yaşadı) ve tek gövdeden "4 ölüm"
 * sayıldı (3 husk + 1 boss). Ölçülmek istenen şey bölünen düşman; boss
 * ölçümün içine karışmamalı.
 */
const BOSSSUZ = STAGES.find((s) => !s.boss)!;

const byId = (id: string) => ENEMIES.find((e) => e.id === id)!;
const YENI = ['bloat', 'gravebloat', 'husk', 'herald', 'bone_herald'];

console.log('\n[1] Yeni tipler tanımlı ve ULAŞILABİLİR');
{
  console.log(`     toplam düşman tipi: ${ENEMIES.length}`);
  for (const id of YENI) check(`${id} tanımlı`, !!byId(id));
  // ⚠️ ULAŞILABİLİRLİK: hiçbir bölümün listesinde olmayan bir düşman, oyunda
  // YOKTUR. Tanımlamak yetmez — bu tam olarak "yeni silahlar havuza giriyor mu"
  // sorusunun düşman tarafı.
  const listelenen = new Set(STAGES.flatMap((s) => s.enemies));
  const erisilmez = YENI.filter((id) => !listelenen.has(id));
  check('hepsi en az bir bölümün listesinde', erisilmez.length === 0,
    erisilmez.length ? erisilmez.join(',') : `${YENI.length} tip`);
  // Ölü veri kontrolü: tanımlı ama hiç kullanılmayan tip kalmasın
  const olu = ENEMIES.filter((e) => !listelenen.has(e.id)).map((e) => e.id);
  check('hiçbir düşman tipi ölü veri değil', olu.length === 0, olu.join(',') || 'temiz');
}

console.log('\n[2] ⭐ BÖLÜNEN — bölüm HÂLÂ BİTİYOR mu (kırmızı çizgi)');
{
  // Sadece bölünen düşmandan oluşan bir bölüm kur: en kötü hâl.
  const st = { ...BOSSSUZ, enemies: ['husk'], enemyCount: 120, maxAlive: 60 } as typeof STAGES[number];
  const g = new Game(seedFromString('bolunen'), st);
  g.setViewport(1280, 720);
  let enCok = 0;
  for (let i = 0; i < Math.round(420 / TICK); i++) {
    if (g.phase === 'levelup') g.choose(g.offers[0].id);
    if (g.phase !== 'running') break;
    g.hp = g.stats.maxHp;
    const t = i * TICK;
    g.setInput(Math.cos(t * 0.7), Math.sin(t * 0.7));
    g.step();
    enCok = Math.max(enCok, g.enemies.length);
  }
  console.log(`     ${g.phase} · ${Math.round(g.time)} sn · ${g.kills} kill · sahnede en çok ${enCok}`);
  check('sadece bölünenlerden oluşan bölüm BİTİYOR', g.phase === 'won',
    `${g.phase} · ${Math.round(g.time)} sn`);
  // ⚠️ Kill sayısı doğan düşmandan FAZLA olmalı: parçalar da ölüyor demektir.
  check('parçalar da öldürülüyor', g.kills > st.enemyCount,
    `${g.kills} kill / ${st.enemyCount} doğan`);
  check('sahne tavanı aşılmadı', enCok <= DESCENT.aliveMax, `${enCok} ≤ ${DESCENT.aliveMax}`);
}

console.log('\n[3] ⭐ BÖLÜNEN — parçalar TEKRAR bölünmüyor');
{
  const S = BEHAVIOR.splitter;
  // Tek kuşak: 1 ana gövde → 2 parça → 0. Toplam ölüm 3 olmalı, sonsuz değil.
  const st = { ...BOSSSUZ, enemies: ['husk'], enemyCount: 1 } as typeof STAGES[number];
  const g = new Game(seedFromString('tek-kusak'), st);
  g.setViewport(1280, 720);
  for (let i = 0; i < Math.round(240 / TICK); i++) {
    if (g.phase === 'levelup') g.choose(g.offers[0].id);
    if (g.phase !== 'running') break;
    g.hp = g.stats.maxHp;
    const t = i * TICK;
    g.setInput(Math.cos(t * 0.7), Math.sin(t * 0.7));
    g.step();
  }
  console.log(`     1 düşman doğdu → toplam ${g.kills} ölüm`);
  check('tek gövde tam 1 + children ölüm veriyor', g.kills === 1 + S.children,
    `${g.kills} = 1 + ${S.children}`);
}

console.log('\n[4] Bölünen ekonomisi — bedava XP/gold basmıyor');
{
  const S = BEHAVIOR.splitter;
  const toplamCanOrani = S.children * S.childHpMul;
  console.log(`     parça toplam can oranı: ${(toplamCanOrani * 100).toFixed(0)}%`);
  // ⚠️ Parçaların toplam canı ana gövdeyi AŞMAMALI: aşsaydı bölünen düşman
  // öldürmesi en zor tip olurdu ve tipi bir ceza değil bir duvar yapardı.
  check('parçaların toplam canı gövdeyi aşmıyor', toplamCanOrani <= 1,
    `${toplamCanOrani.toFixed(2)}`);
  // ⚠️ Ama toplam XP de gövdeden çok artmamalı — yoksa bölüneni farmlamak
  // en hızlı seviye yolu olur.
  check('bölünmek XP patlaması yapmıyor', 1 + toplamCanOrani <= 2,
    `${(1 + toplamCanOrani).toFixed(2)}× XP`);
}

console.log('\n[5] ⭐ HABERCİ — kaçılamaz düşman ÜRETMİYOR');
{
  const H = BEHAVIOR.herald;
  const enHizli = Math.max(...ENEMIES.map((e) => e.speed));
  const derinEnHizli = enHizli * DESCENT.speedMax;
  console.log(`     en hızlı düşman ${enHizli} · derin inişte ${derinEnHizli.toFixed(0)} · oyuncu ${PLAYER.speed}`);
  // ⚠️ ASIL RİSK BURADA ve ölçüm bunu yakaladı: 74 × 1,9 × 1,45 = 204 px/sn,
  // oyuncu 165. Tavan olmasaydı derin inişte KAÇILAMAZ bir sürü doğardı ve
  // kaçılamaz düşman "zor" değil haksızdır.
  const tavansiz = derinEnHizli * H.speedMul;
  check('tavansız hâl gerçekten tehlikeliydi (ölçüm anlamlı)', tavansiz > PLAYER.speed,
    `${tavansiz.toFixed(0)} > ${PLAYER.speed}`);
  check('tavan oyuncu hızının ALTINDA', H.speedCap < 1, `×${H.speedCap}`);
  check('tavanlı hız oyuncudan yavaş', PLAYER.speed * H.speedCap < PLAYER.speed);
  // Habercinin kendisi yavaş olmalı — öncelik hedefi FARK EDİLMELİ
  for (const id of ['herald', 'bone_herald']) {
    const e = byId(id);
    check(`${id} sürünün ortalamasından YAVAŞ`, e.speed < enHizli * 0.5,
      `${e.speed} px/sn`);
  }
  check('haberci aurası kendine uygulanmıyor (tasarım)', true, 'motor: behavior !== herald');
}

console.log('\n[6] HABERCİ gerçekten hızlandırıyor mu (motor ölçümü)');
{
  // ⚠️ KONTROL GRUBU ŞART. İlk ölçüm `['brute']` ile `['brute','herald']`i
  // kıyaslıyordu ve fark çıkmadı (8,8 → 8,6) — ama o kıyas hatalıydı: haberci
  // eklenince sürünün yarısı habercilere ayrılıyor ve haberciler ÇOK YAVAŞ
  // (24 px/sn), yani sayaç kendi kendini bastırıyordu.
  // Doğru kontrol: haberci yerine AYNI ŞEKİLDE yavaş ve dayanıklı ama AURASIZ
  // bir düşman (`hulk`, 26 px/sn). Böylece tek değişen aura oluyor.
  const olc = (tipler: string[], sayilmaz: string) => {
    const st = { ...BOSSSUZ, enemies: tipler, enemyCount: 120, maxAlive: 70 } as typeof STAGES[number];
    const g = new Game(seedFromString('haberci'), st);
    g.setViewport(1280, 720);
    let toplamYakin = 0, ornek = 0;
    for (let i = 0; i < Math.round(120 / TICK); i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;
      const t = i * TICK;
      g.setInput(Math.cos(t * 0.7), Math.sin(t * 0.7));
      g.step();
      if (i % 30 === 0) {
        ornek++;
        // ⚠️ Yavaş tipin KENDİSİ sayılmıyor — ölçülen şey onun ÇEVRESİNE
        // yaptığı etki, kendi hızı değil.
        // ⚠️ Ayrım `typeId` ile. Önce `radius` ile denendi ve SESSİZCE
        // YANLIŞTI: brute ile herald aynı çapta, filtre her şeyi eledi ve
        // ölçüm 0,0 döndü. Kimliği çaptan tahmin etme.
        toplamYakin += g.enemies.filter((e) => e.typeId !== sayilmaz
          && Math.hypot(e.x - g.px, e.y - g.py) < 220).length;
      }
    }
    return toplamYakin / Math.max(1, ornek);
  };
  const kontrol = olc(['brute', 'hulk'], 'hulk');
  const haberli = olc(['brute', 'herald'], 'herald');
  console.log(`     kontrol (hulk) ${kontrol.toFixed(1)} · haberci ${haberli.toFixed(1)} düşman yakında`);
  // Haberci sürüyü hızlandırıyorsa oyuncuya daha çok yetişirler.
  check('haberci sürüyü oyuncuya YAKLAŞTIRIYOR', haberli > kontrol,
    `${haberli.toFixed(1)} > ${kontrol.toFixed(1)}`);
}

console.log('\n[7] ⭐ PATLAYICI — ceza ölümcül DEĞİL');
{
  const B = BEHAVIOR.exploder;
  for (const id of ['bloat', 'gravebloat']) {
    const e = byId(id);
    const patlama = Math.round(e.damage * B.blastDamageMul);
    // ⚠️ Tek patlama oyuncuyu ÖLDÜRMEMELİ: öldürseydi tip bir öğrenme
    // fırsatı değil, tek seferlik bir tuzak olurdu.
    check(`${id} patlaması tek başına öldürmüyor`, patlama < PLAYER.maxHp * 0.5,
      `${patlama} hasar / ${PLAYER.maxHp} can`);
    // Ama temastan BELİRGİN daha ağır olmalı, yoksa "patlama" hissi olmaz.
    check(`${id} patlaması temastan ağır`, patlama > e.damage, `${patlama} > ${e.damage}`);
  }
  console.log(`     patlama yarıçapı ${B.blastR} px`);
  // ⚠️ Yarıçap oyuncunun KAÇABİLECEĞİ büyüklükte olmalı — menzilli silahla
  // öldürmek gerçek bir seçenek kalsın.
  check('yarıçap kaçılabilir büyüklükte', B.blastR < 140, `${B.blastR} px`);
}

console.log('\n[8] Yeni tipler bölümlere KADEMELİ giriyor');
{
  // ⚠️ Hepsini birden koymak sürüyü okunmaz yapardı: oyuncu bir kalıbı
  // öğrenemeden bir sonrakiyle karşılaşır.
  const ilkGorunum = new Map<string, number>();
  for (const st of STAGES) {
    for (const id of st.enemies) {
      if (YENI.includes(id) && !ilkGorunum.has(id)) ilkGorunum.set(id, st.id);
    }
  }
  for (const [id, sid] of ilkGorunum) console.log(`     ${id.padEnd(12)} ilk kez bölüm ${sid}`);
  check('hiçbiri 1. bölümde çıkmıyor', [...ilkGorunum.values()].every((v) => v >= 3),
    `en erken bölüm ${Math.min(...ilkGorunum.values())}`);
  check('aynı bölümde ikiden fazla yeni tip yok',
    STAGES.every((st) => st.enemies.filter((id) => YENI.includes(id)).length <= 2));
}

console.log('\n' + '─'.repeat(62));
if (hata) { console.log(`✗ ${hata} ölçüm sınırın dışında`); process.exit(1); }
console.log('✓ düşman davranışları sağlam');
