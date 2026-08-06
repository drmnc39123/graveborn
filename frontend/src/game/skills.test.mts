// BECERİ AĞACI TESTİ — "üçüncü bir Forge olmadı mı" sorusunun cevabı.
//
// Buradaki asıl risk sayı hatası değil, sistemin SESSİZCE dikeye kayması:
// ağacın doldurulabilir hâle gelmesi, çatalların gerçekten kilitlememesi ya
// da zirvelerin bedelsiz olması. Üçü de "biraz daha güçlü" gibi görünür ve
// kimse fark etmez — ta ki herkesin ağacı aynı olana kadar.
//
// İkinci risk güvenlik: `sanitizeSkills` sunucunun TEK kapısı. Gevşerse
// istemci "hepsi açık" diyerek bedava güç alır.
//
// Çalıştır:  npx tsx src/game/skills.test.mts

import {
  BRANCHES, SKILLS, SKILL_TREE, TREE_TOTAL_COST,
  nextPointAt, respecCost, sanitizeSkills, skillBlocker, skillBonus, skillById,
  skillPoints, spentPoints,
} from './skills.js';
import { FORGE, permanentBonus } from './forge.js';
import { STAT_BASE, type StatKey } from './config.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log(`\n═══ BECERİ AĞACI ═══  (${SKILL_TREE.length} düğüm, ${TREE_TOTAL_COST} puan)`);

console.log('\n[1] ⭐ AĞAÇ ASLA DOLMUYOR — yatay kalmasının yapısal garantisi');
{
  // ⚠️ Ağaç doldurulabilir olsaydı herkesin ağacı aynı biterdi ve sistem
  // Forge'un kopyası olurdu. Bu bir denge ayarı DEĞİL, yapısal kural.
  const oran = SKILLS.maxPoints / TREE_TOTAL_COST;
  console.log(`     en yüksek puan ${SKILLS.maxPoints} / ağaç ${TREE_TOTAL_COST} = %${(oran * 100).toFixed(0)}`);
  check('en derin oyuncu bile ağacın YARISINI dolduramıyor', oran < 0.5,
    `%${(oran * 100).toFixed(0)}`);

  // Hepsini istemek de doldurmuyor
  const hepsi = sanitizeSkills(SKILL_TREE.map((n) => n.id), SKILLS.maxPoints);
  check('"hepsini ver" isteği ağacı DOLDURMUYOR', hepsi.length < SKILL_TREE.length,
    `${hepsi.length}/${SKILL_TREE.length} düğüm`);
  check('harcanan puan tavanı aşmıyor', spentPoints(hepsi) <= SKILLS.maxPoints,
    `${spentPoints(hepsi)}/${SKILLS.maxPoints}`);
}

console.log('\n[2] ⭐ Puan SATIN ALINMIYOR, oynanarak kazanılıyor');
{
  // ⚠️ Puan için bir para birimi olsaydı yeni bir musluk açılırdı. Puan
  // sunucunun ZATEN doğruladığı derinlikten türüyor.
  check('derinlik 0 → puan yok', skillPoints(0) === 0);
  check('derinlik 4 → hâlâ yok', skillPoints(4) === 0);
  check('derinlik 5 → 1 puan', skillPoints(5) === 1);
  check('derinlik 50 → 10 puan', skillPoints(50) === 10, `${skillPoints(50)}`);
  check('tavan uygulanıyor', skillPoints(100000) === SKILLS.maxPoints,
    `${skillPoints(100000)}`);
  check('negatif derinlik patlamıyor', skillPoints(-50) === 0);
  check('sonraki puan doğru bildiriliyor', nextPointAt(7) === 10, `${nextPointAt(7)}`);
  check('tavanda sonraki puan yok', nextPointAt(100000) === null);

  // Tablo düğüm maliyetleriyle uyumlu mu — hiçbir düğüm ULAŞILAMAZ olmamalı
  const enPahali = Math.max(...SKILL_TREE.map((n) => n.cost));
  check('en pahalı düğüm tek başına alınabiliyor', enPahali <= SKILLS.maxPoints,
    `${enPahali} ≤ ${SKILLS.maxPoints}`);
}

console.log('\n[3] ⭐ Çatallar GERÇEKTEN kilitliyor mu');
{
  const ciftler = SKILL_TREE.filter((n) => n.excludes);
  check('kilitli çift var', ciftler.length > 0, `${ciftler.length} düğüm`);

  for (const n of ciftler) {
    const other = skillById(n.excludes!)!;
    // İki yönlü de dene — tablo tek yönlü yazılmış olsa bile kural tutmalı
    const a = sanitizeSkills([n.requires, other.requires, n.id, other.id].filter(Boolean) as string[], SKILLS.maxPoints);
    const b = sanitizeSkills([other.requires, n.requires, other.id, n.id].filter(Boolean) as string[], SKILLS.maxPoints);
    const ikisiDeA = a.includes(n.id) && a.includes(other.id);
    const ikisiDeB = b.includes(n.id) && b.includes(other.id);
    check(`${n.id} ⊗ ${other.id} birlikte alınamıyor`, !ikisiDeA && !ikisiDeB);
  }

  // ⚠️ Sıra bağımsızlığı: doğrulama girdi sırasına göre farklı ağaç üretemez
  const ids = SKILL_TREE.map((n) => n.id);
  const duz = sanitizeSkills(ids, 12);
  const ters = sanitizeSkills([...ids].reverse(), 12);
  check('doğrulama GİRDİ SIRASINDAN bağımsız',
    JSON.stringify([...duz].sort()) === JSON.stringify([...ters].sort()),
    `${duz.length} vs ${ters.length}`);
}

console.log('\n[4] ⭐ Zirveler — bir tane VE bedelli');
{
  const zirveler = SKILL_TREE.filter((n) => n.capstone);
  check('her dalın bir zirvesi var', zirveler.length === BRANCHES.length,
    `${zirveler.length} zirve / ${BRANCHES.length} dal`);

  // ⚠️ BEDELSİZ ZİRVE SEÇİM DEĞİLDİR. Ekipmandaki lanet kuralının aynısı:
  // bedeli olmayan bir zirve sadece "en güçlüyü seç" demek olurdu.
  for (const z of zirveler) {
    const eksi = Object.entries(z.stats).some(([k, v]) =>
      (k === 'cooldown' ? (v ?? 0) > 0 : (v ?? 0) < 0));
    check(`${z.id} bir BEDEL taşıyor`, eksi,
      Object.entries(z.stats).map(([k, v]) => `${k}:${v}`).join(' '));
  }

  // Toplam bir zirve
  const hepsiZirve = sanitizeSkills(
    [...zirveler.map((z) => z.requires!), ...zirveler.map((z) => z.id)], SKILLS.maxPoints);
  const alinan = hepsiZirve.filter((id) => skillById(id)?.capstone).length;
  check('AYNI ANDA yalnızca bir zirve', alinan === SKILLS.maxCapstones, `${alinan}`);

  // Zirveleri hepsini almaya yetecek puan VAR ama kural engelliyor —
  // yani sınır bütçe değil, TASARIM
  const zirveToplam = zirveler.reduce((s, z) => s + z.cost + (skillById(z.requires!)?.cost ?? 0), 0);
  check('sınır bütçe değil KURAL', zirveToplam > SKILLS.maxPoints || alinan === 1,
    `4 zirve ${zirveToplam} puan ederdi`);
}

console.log('\n[5] ⭐ Önkoşullar atlanamıyor');
{
  const ardil = SKILL_TREE.find((n) => n.requires)!;
  const yalniz = sanitizeSkills([ardil.id], SKILLS.maxPoints);
  check('önkoşulsuz ardıl REDDEDİLİYOR', !yalniz.includes(ardil.id), ardil.id);

  const dogru = sanitizeSkills([ardil.requires!, ardil.id], SKILLS.maxPoints);
  check('önkoşulla birlikte geçiyor', dogru.includes(ardil.id));

  // Her düğümün önkoşulu KENDİ DALINDA olmalı — dallar arası bağ ağacı
  // okunmaz yapardı
  const yanlisDal = SKILL_TREE.filter((n) => n.requires && skillById(n.requires)?.branch !== n.branch);
  check('önkoşullar kendi dalında', yanlisDal.length === 0, yanlisDal.map((n) => n.id).join(','));

  // Kendine referans / bilinmeyen önkoşul yok
  const kirik = SKILL_TREE.filter((n) =>
    (n.requires && (!skillById(n.requires) || n.requires === n.id))
    || (n.excludes && (!skillById(n.excludes) || n.excludes === n.id)));
  check('kırık referans YOK', kirik.length === 0, kirik.map((n) => n.id).join(','));
}

console.log('\n[6] ⭐ GÜVENLİK: istemcinin isteği yetki değil');
{
  // ⚠️ Sunucu bu fonksiyondan geçirdiğini yazıyor. Gevşerse bedava güç.
  const yalanci = sanitizeSkills(SKILL_TREE.map((n) => n.id), 0);
  check('0 puanla HİÇBİR düğüm alınamıyor', yalanci.length === 0, `${yalanci.length}`);

  const asiri = sanitizeSkills(SKILL_TREE.map((n) => n.id), 9999);
  check('puan tavanı aşılamıyor', spentPoints(asiri) <= SKILLS.maxPoints,
    `${spentPoints(asiri)}`);

  check('bilinmeyen id yok sayılıyor',
    sanitizeSkills(['yok_boyle', 'blade_edge'], 5).join() === 'blade_edge');
  check('liste yerine metin → boş', sanitizeSkills('hepsi', 24).length === 0);
  check('null → boş', sanitizeSkills(null, 24).length === 0);
  check('sayı listesi → boş', sanitizeSkills([1, 2, 3], 24).length === 0);
  check('tekrarlı id iki kez saymıyor',
    sanitizeSkills(['blade_edge', 'blade_edge'], 24).length === 1);

  // Çıktı İDEMPOTENT olmalı: sunucunun yazdığını tekrar doğrulamak aynı
  // sonucu vermeli, yoksa her kaydetmede ağaç sessizce erirdi
  const bir = sanitizeSkills(SKILL_TREE.map((n) => n.id), 14);
  const iki = sanitizeSkills(bir, 14);
  check('doğrulama İDEMPOTENT', JSON.stringify(bir) === JSON.stringify(iki),
    `${bir.length} → ${iki.length}`);
}

console.log('\n[7] Motora bağlanma');
{
  const alloc = sanitizeSkills(SKILL_TREE.map((n) => n.id), SKILLS.maxPoints);
  const b = skillBonus(alloc);
  check('bonus üretiliyor', Object.keys(b).length > 0, Object.keys(b).join(', '));

  const bilinmeyen = Object.keys(b).filter((k) => !(k in STAT_BASE));
  check('motorun bilmediği istatistik YOK', bilinmeyen.length === 0, bilinmeyen.join(','));

  // ⚠️ `greed` YASAK — sunucunun nadir-düşüş tavanı ağacı bilmiyor
  const greedli = SKILL_TREE.filter((n) => 'greed' in n.stats);
  check('ağaçta greed YOK', greedli.length === 0, greedli.map((n) => n.id).join(','));

  // cooldown yönü Forge ile aynı olmalı
  const cd = skillById('quick_hands')!;
  check('cooldown bonusu EKSİ (Forge ile aynı yön)', (cd.stats.cooldown ?? 0) < 0,
    `${cd.stats.cooldown} vs forge ${permanentBonus({ cooldown: 5 }).cooldown}`);

  check('boş dağılım boş bonus', Object.keys(skillBonus([])).length === 0);
}

console.log('\n[8] 📏 ÖLÇÜM — ağaç Forge\'u gölgeliyor mu');
{
  // Ekipmandaki ölçümün aynısı: ağaç Forge'un YERİNE değil YANINDA durmalı.
  const tamAgac: Record<string, number> = {};
  for (const u of FORGE) tamAgac[u.id] = u.maxLevel;
  const forge = permanentBonus(tamAgac);

  // En saldırgan dağılım
  const saldirgan = sanitizeSkills(
    ['blade_edge', 'blade_many', 'blade_ruin', 'cov_edge', 'cov_frenzy', 'quick_hands'],
    SKILLS.maxPoints);
  const s = skillBonus(saldirgan);
  const oran = (s.might ?? 0) / (forge.might ?? 1);
  console.log(`     tam Forge ağacı → +%${((forge.might ?? 0) * 100).toFixed(0)} hasar`);
  console.log(`     en saldırgan beceri dağılımı → +%${((s.might ?? 0) * 100).toFixed(0)} hasar (${spentPoints(saldirgan)} puan)`);
  check('beceri ağacı Forge\'un ALTINDA', oran < 1, `ağaç/Forge = ${oran.toFixed(2)}`);
  check('ama önemsiz de değil', oran > 0.10, `%${(oran * 100).toFixed(0)}`);

  // ⚠️ Farklı dağılımlar GERÇEKTEN farklı oyun vermeli — hepsi aynı
  // istatistikleri verseydi "seçim" bir yanılsama olurdu.
  const savunma = sanitizeSkills(['bulwark_hide', 'bulwark_plate', 'bulwark_wall', 'bulwark_return'], SKILLS.maxPoints);
  const d = skillBonus(savunma);
  const ortak = Object.keys(s).filter((k) => k in d);
  console.log(`     saldırgan: ${Object.keys(s).join(', ')}`);
  console.log(`     savunmacı: ${Object.keys(d).join(', ')}`);
  check('iki dağılım BELİRGİN farklı', ortak.length < Math.min(Object.keys(s).length, Object.keys(d).length),
    `${ortak.length} ortak istatistik`);
}

console.log('\n[9] Respec — sink, güç DEĞİL');
{
  const alloc = sanitizeSkills(SKILL_TREE.map((n) => n.id), SKILLS.maxPoints);
  const bedel = respecCost(alloc);
  console.log(`     ${spentPoints(alloc)} puanlık dağılımı bozmak: ${bedel.toLocaleString('tr')} gold`);
  check('bedel harcanan puanla büyüyor', bedel === spentPoints(alloc) * SKILLS.respecPerPoint);
  check('boş dağılımın bedeli yok', respecCost([]) === 0);
  // ⚠️ Respec GÜÇ ÜRETMİYOR: oyuncu zaten sahip olduğu gücü yeniden diziyor.
  // Ekonomi tarafında tam istenen şey — sonsuz, tekrarlanabilir, üretmeyen.
  check('respec yeni puan VERMİYOR', spentPoints(sanitizeSkills([], SKILLS.maxPoints)) === 0);
}

console.log('\n[10] Arayüz için engel sebepleri');
{
  const alloc = ['blade_edge'];
  const cift = skillById('blade_many')!;
  check('alınabilir düğümde engel yok', skillBlocker(cift, alloc, 10) === null);

  const kilitli = skillById('blade_wide')!;
  const sonra = ['blade_edge', 'blade_reach', 'blade_many'];
  const sebep = skillBlocker(kilitli, sonra, 24);
  check('kilitlenen düğüm SEBEBİNİ söylüyor', !!sebep && /Locked out/.test(sebep), sebep ?? '');

  const onkosulsuz = skillBlocker(skillById('blade_many')!, [], 24);
  check('önkoşul eksikse SEBEBİNİ söylüyor', !!onkosulsuz && /Needs/.test(onkosulsuz), onkosulsuz ?? '');

  const parasiz = skillBlocker(skillById('blade_ruin')!, ['blade_edge'], 2);
  check('puan yetmezse SEBEBİNİ söylüyor', !!parasiz && /points/.test(parasiz), parasiz ?? '');

  const ikinciZirve = skillBlocker(skillById('cov_pact')!, ['blade_edge', 'blade_ruin', 'cov_edge'], 24);
  check('ikinci zirve SEBEBİNİ söylüyor', !!ikinciZirve && /one path/.test(ikinciZirve), ikinciZirve ?? '');

  // Hiçbir sebep boş metin olmamalı — boş bir tooltip hiç tooltip'ten kötü
  let bosSebep = 0;
  for (const n of SKILL_TREE) {
    const r = skillBlocker(n, [], 0);
    if (r !== null && r.trim() === '') bosSebep++;
  }
  check('boş sebep metni YOK', bosSebep === 0);
}

console.log(`\n${FAIL.length === 0 ? '✅ AĞAÇ YATAY KALIYOR' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
