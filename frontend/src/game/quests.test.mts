// GÜNLÜK GÖREV MÜHRÜ.
//
// 🔴 NİYE VAR: günlük görev, oyuncunun her gün geri gelme sebebi. Bozulduğunda
// SESSİZ bozulur — panel açılır, üç satır görünür, sadece hiçbiri tamamlanmaz.
// Bu depoda tam olarak bu sınıftan hatalar çıktı (`luck` pasifi motorda hiç
// okunmuyordu; evrim ipucu oyunun ömrü boyunca gizli kaldı).
//
//   cd frontend && npx tsx src/game/quests.test.mts

import fs from 'node:fs';
import {
  QUESTS, QUEST_POOL, type QuestKind, type QuestProfile,
  dayDustCeiling, questAccumulate, questById, questDone, questsFor,
} from './quests.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const YENI: QuestProfile = { deepestDepth: 0, cleared: false };
const USTA: QuestProfile = { deepestDepth: 999, cleared: true };
const gun = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);

console.log('\n═══ GÜNLÜK GÖREVLER ═══');

console.log('\n[1] HAVUZ BÜTÜNLÜĞÜ');
{
  const idler = QUEST_POOL.map((q) => q.id);
  check('id\'ler tekil', new Set(idler).size === idler.length, `${idler.length} görev`);
  check('hepsinin ödülü var', QUEST_POOL.every((q) => q.dust > 0));
  check('hepsinin hedefi pozitif', QUEST_POOL.every((q) => q.goal > 0));
  check('metinler dolu', QUEST_POOL.every((q) => q.text.trim().length > 5));
  // ⚠️ Oyuncuya giden metin İNGİLİZCE — depo kuralı. Türkçe karakter kaçağı
  // en kolay buradan olur (kod yorumları Türkçe yazılıyor).
  check('metinlerde Türkçe karakter yok',
    QUEST_POOL.every((q) => !/[çğıöşüÇĞİÖŞÜ]/.test(q.text)),
    QUEST_POOL.filter((q) => /[çğıöşüÇĞİÖŞÜ]/.test(q.text)).map((q) => q.id).join(','));
  check('questById her id\'yi buluyor', idler.every((id) => !!questById(id)));
  check('questById uydurma id\'de undefined', questById('yok_boyle_bir_gorev') === undefined);
}

console.log('\n[2] ⭐ 1. GÜN OYUNCUSU — kayıtlı hata, tekrar etmemeli');
{
  /**
   * ⚠️ ÖLÇÜLMÜŞ GEÇMİŞ HATA (quests.ts yorumunda yazılı): sıfırdan bir
   * oyuncuya "derinlik 10'a in" ve "2.000 gold harca" düşüyordu. Cüzdanında
   * 0 gold vardı, tek bölüm temizlememişti — üçünü de yapamaz, bonusa hiç
   * ulaşamaz ve paneli bir daha açmazdı.
   */
  let hata = 0, azGorev = 0;
  for (let w = 0; w < 400; w++) {
    const g = questsFor(`yeni${w}`, gun(w % 30), YENI);
    if (g.length !== QUESTS.perDay) azGorev++;
    for (const q of g) {
      if ((q.minDepth ?? 0) > 0 || q.needsCleared) hata++;
    }
  }
  check('yeni oyuncuya HER GÜN tam kadro düşüyor', azGorev === 0, `${azGorev} eksik gün`);
  check('yeni oyuncuya yapılamaz görev DÜŞMÜYOR', hata === 0, `${hata} ihlal`);
}

console.log('\n[3] KAPILAR DÜRÜST (çift taraflı)');
{
  /**
   * ⚠️ ÇİFT TARAFLI: yalnız "usta oyuncu her görevi alabiliyor mu" diye
   * baksaydım, kapıları TAMAMEN yok sayan bir seçici de testi geçerdi.
   * Kapının kapandığını da ölçmek gerekiyor.
   */
  let ihlal = 0;
  for (const q of QUEST_POOL) {
    if (q.minDepth === undefined && !q.needsCleared) continue;
    const altinda: QuestProfile = {
      deepestDepth: Math.max(0, (q.minDepth ?? 1) - 1),
      cleared: !q.needsCleared,
    };
    for (let w = 0; w < 120; w++) {
      if (questsFor(`alt${w}`, gun(w % 14), altinda).some((x) => x.id === q.id)) ihlal++;
    }
  }
  check('kapalı görev ASLA düşmüyor', ihlal === 0, `${ihlal} sızma`);
}

console.log('\n[4] ⭐ ÖLÜ GÖREV YOK — havuzdaki her görev gerçekten düşüyor');
{
  /**
   * ⚠️ BU DEPONUN EN VERİMLİ HATA SINIFI: içerik yazılmış, kod çalışıyor,
   * ama oyuncuya HİÇ ulaşmıyor. Aynı türden ikinci görev seçilmediği için
   * bir görev, kendi türündeki başka görevlerin gölgesinde kalıp hiç
   * düşmeyebilirdi.
   */
  const gorulen = new Set<string>();
  for (let w = 0; w < 500; w++) {
    for (let d = 0; d < 6; d++) for (const q of questsFor(`u${w}`, gun(d), USTA)) gorulen.add(q.id);
  }
  const olu = QUEST_POOL.filter((q) => !gorulen.has(q.id)).map((q) => q.id);
  check('her görev en az bir kez düşüyor', olu.length === 0, olu.join(',') || `${gorulen.size}/${QUEST_POOL.length}`);
}

console.log('\n[5] GÜN İÇİ KURALLAR');
{
  let tur = 0, sayi = 0, tekrar = 0;
  for (let w = 0; w < 300; w++) {
    const g = questsFor(`k${w}`, gun(w % 20), USTA);
    if (g.length !== QUESTS.perDay) sayi++;
    if (new Set(g.map((q) => q.kind)).size !== g.length) tur++;
    if (new Set(g.map((q) => q.id)).size !== g.length) tekrar++;
  }
  check('her gün tam kadro', sayi === 0, `${sayi} sapma`);
  // ⚠️ Aynı türden iki görev, ikincisini birincisi kendiliğinden tamamlar:
  // gün üç görev değil iki buçuk görev olur.
  check('aynı türden iki görev düşmüyor', tur === 0, `${tur} çakışma`);
  check('aynı görev iki kez düşmüyor', tekrar === 0, `${tekrar} tekrar`);
}

console.log('\n[6] DETERMİNİZM — sunucu ve istemci aynı üçlüyü görmeli');
{
  const a = questsFor('AyNiCuZdAn', '2026-03-04', USTA).map((q) => q.id).join(',');
  const b = questsFor('AyNiCuZdAn', '2026-03-04', USTA).map((q) => q.id).join(',');
  check('aynı cüzdan+gün → aynı görevler', a === b, a);
  // ⚠️ Sabit kalmamalı: her gün aynı üçlü düşerse "günlük" görev değildir.
  const gunler = new Set<string>();
  for (let d = 0; d < 30; d++) gunler.add(questsFor('AyNiCuZdAn', gun(d), USTA).map((q) => q.id).join(','));
  check('gün değişince üçlü değişiyor', gunler.size > 5, `30 günde ${gunler.size} farklı üçlü`);
  const cuzdanlar = new Set<string>();
  for (let w = 0; w < 40; w++) cuzdanlar.add(questsFor(`c${w}`, '2026-03-04', USTA).map((q) => q.id).join(','));
  check('cüzdan değişince üçlü değişiyor', cuzdanlar.size > 5, `40 cüzdanda ${cuzdanlar.size} farklı`);
}

console.log('\n[7] ⭐ HER GÖREV TÜRÜ SUNUCUDA GERÇEKTEN İZLENİYOR MU');
{
  /**
   * 🔴 EN KRİTİK KONTROL. İzlenmeyen bir tür = oyuncunun ASLA
   * tamamlayamayacağı bir görev. Kod derlenir, panel açılır, ilerleme
   * çubuğu sonsuza kadar 0'da kalır ve hiçbir hata mesajı çıkmaz.
   * Aynı sınıf bu depoda daha önce `luck`/`richer` pasiflerinde çıktı.
   */
  const kok = '../backend/src';
  let kaynak = '';
  try {
    for (const f of fs.readdirSync(kok)) {
      if (f.endsWith('.ts')) kaynak += fs.readFileSync(`${kok}/${f}`, 'utf8') + '\n';
    }
  } catch { /* aşağıda yakalanıyor */ }
  check('backend kaynağı okunabildi', kaynak.length > 10_000, `${kaynak.length} bayt`);

  const izlenen = new Set(
    [...kaynak.matchAll(/trackQuest\s*\([^)]*?['"]([a-z]+)['"]/g)].map((m) => m[1]),
  );
  const turler: QuestKind[] = ['run', 'depth', 'duel', 'arena', 'spend', 'salvage'];
  for (const t of turler) check(`"${t}" izleniyor`, izlenen.has(t));
  // ⚠️ KONTROL GRUBU: tarama her şeye "evet" diyor olabilirdi.
  check('uydurma tür bulunmuyor (kontrol grubu)', !izlenen.has('zzznotreal'), [...izlenen].join(','));

  // Havuzdaki her görevin türü, izlenen türlerden biri olmalı
  const olu = QUEST_POOL.filter((q) => !izlenen.has(q.kind));
  check('havuzda izlenmeyen türde görev yok', olu.length === 0, olu.map((q) => `${q.id}:${q.kind}`).join(','));
}

console.log('\n[8] İLERLEME BİRİKTİRME');
{
  // ⚠️ `depth` EN İYİ TEK KOŞUYU sayar. Toplasaydık "derinlik 30'a in"
  // görevi üç kez 10'a inerek tamamlanırdı — oysa görev tek derin iniş istiyor.
  check('depth: en iyi koşu (toplam DEĞİL)', questAccumulate('depth', 12, 9) === 12);
  check('depth: daha derini yazıyor', questAccumulate('depth', 12, 20) === 20);
  check('run: topluyor', questAccumulate('run', 2, 1) === 3);
  check('spend: topluyor', questAccumulate('spend', 300, 250) === 550);
  check('salvage: topluyor', questAccumulate('salvage', 1, 2) === 3);

  const q = QUEST_POOL.find((x) => x.id === 'q_depth10')!;
  check('hedefin altında tamamlanmıyor', !questDone(q, q.goal - 1));
  check('hedefte tamamlanıyor', questDone(q, q.goal));
  check('hedefin üstünde tamamlanıyor', questDone(q, q.goal + 5));
}

console.log('\n[9] TOZ TAVANI — musluk ölçülebilir olmalı');
{
  const ids = questsFor('tavan', '2026-05-05', USTA).map((q) => q.id);
  const beklenen = ids.reduce((s, id) => s + (questById(id)?.dust ?? 0), 0) + QUESTS.allBonus;
  check('tavan = görevler + bonus', dayDustCeiling(ids) === beklenen, `${dayDustCeiling(ids)} vs ${beklenen}`);
  check('bilinmeyen id tavanı şişirmiyor', dayDustCeiling(['yok']) === QUESTS.allBonus);
  check('boş gün sadece bonus', dayDustCeiling([]) === QUESTS.allBonus);

  // ⚠️ GÜNLÜK TOZ MUSLUĞU BİLİNMELİ. Kozmetik ekonomisinin tek girdisi toz;
  // en kötü durumda günde ne kadar basıldığı ölçülebilir olmalı.
  let enYuksek = 0;
  for (let w = 0; w < 300; w++) {
    enYuksek = Math.max(enYuksek, dayDustCeiling(questsFor(`t${w}`, gun(w % 20), USTA).map((q) => q.id)));
  }
  check('günlük toz tavanı makul (< 250)', enYuksek < 250, `en yüksek ${enYuksek} toz/gün`);
}

console.log('\n[10] İLERLEME GÖREV SAYISINI DÜŞÜRMÜYOR');
{
  /**
   * ⚠️ Derinleşen oyuncunun DAHA AZ görev alması, ilerlemeyi cezalandırmak
   * olurdu. Kapılar açıldıkça havuz büyüyor; küçülmediğini ölçüyorum.
   */
  let dusen = 0;
  for (let d = 0; d <= 40; d += 4) {
    for (let w = 0; w < 60; w++) {
      const g = questsFor(`p${w}`, gun(w % 10), { deepestDepth: d, cleared: d > 0 });
      if (g.length < QUESTS.perDay) dusen++;
    }
  }
  check('her derinlikte tam kadro', dusen === 0, `${dusen} eksik`);
}

console.log(`\n${FAIL.length === 0 ? '✅ GÖREVLER SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
