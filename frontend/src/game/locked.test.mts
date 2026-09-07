// KİLİTLİ BİNA MÜHRÜ.
//
// 🔴 NİYE VAR: kilit bilgisi İKİ yerde gerekiyor — köyde kapıya yaklaşınca
// çıkan ipucu (`HubCanvas`) ve kapıdan girince açılan panel
// (`play/page.tsx`). Ölçüldü (2026-09-07): kapı her binada "Enter" diyordu,
// yani oyuncu Exchange'e çalışan bir dükkân sanıp yürüyor ve kapalı bir
// panelle karşılaşıyordu. İki kopya yerine tek kaynak kondu; bu mühür
// ikisinin AYRIŞMADIĞINI ölçüyor.
//
// ⚠️ İKİNCİ VE DAHA PAHALI HATA: panel "Opens with $GRAVE." diyordu ama plan
// Exchange'i token'dan BİR SÜRE SONRA açmak. Token'ı alıp ilk gün Exchange
// arayan oyuncu bulamayacaktı. Söz verilen gün gelmediğinde kaybedilen şey
// bir özellik değil, GÜVEN.
//
//   cd frontend && npx tsx src/game/locked.test.mts

import fs from 'node:fs';
import { LOCKED_BUILDINGS, isLockedBuilding } from './locked.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (p: string) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

console.log('\n═══ KİLİTLİ BİNALAR ═══');

console.log('\n[1] METİNLER OYUNCUYA BİR ŞEY SÖYLÜYOR');
{
  for (const [id, l] of Object.entries(LOCKED_BUILDINGS)) {
    check(`${id}: başlık ve gövde dolu`, l.title.length > 3 && l.body.length > 30);
    check(`${id}: ne olacağı maddelenmiş`, l.bullets.length >= 2, `${l.bullets.length} madde`);
    /**
     * 🔴 KAPI ŞARTA BAĞLI, TARİHE DEĞİL. Takvime bağlı bir söz, o gün
     * geldiğinde arkasındaki iş bitmemişse de gelir ve tutulamaz. Şarta
     * bağlı olan gelmez. Eski metin "Opens with $GRAVE." idi ve plan
     * değiştiğinde otomatik olarak YALAN oldu.
     */
    check(`${id}: kapı şartı TARİH içermiyor`,
      !/\b(20\d\d|day|days|week|gün|hafta)\b/i.test(l.gate), l.gate);
    check(`${id}: kapı şartı yazılı`, l.gate.length > 8, l.gate);
  }
  // ⚠️ Oyuncuya giden metin İNGİLİZCE — depo kuralı
  const hepsi = Object.values(LOCKED_BUILDINGS)
    .map((l) => `${l.title} ${l.body} ${l.bullets.join(' ')} ${l.gate}`).join(' ');
  check('metinlerde Türkçe karakter yok', !/[çğıöşüÇĞİÖŞÜ]/.test(hepsi));
}

console.log('\n[2] ⭐ KAPI İPUCU İLE PANEL AYNI KAYNAKTAN');
{
  /**
   * 🔴 ASIL KONTROL. İkisi ayrışırsa kapı "Enter" der, panel "kapalı" der ve
   * oyuncu kapının bozuk olduğunu sanar. Bu depoda "aynı kural iki yerde
   * yazılınca ayrışır" dersi defalarca alındı.
   */
  const hub = oku('src/components/HubCanvas.tsx');
  check('kapı ipucu isLockedBuilding çağırıyor', /isLockedBuilding\(/.test(hub));
  check('kilitli kapı "Enter" DEMİYOR', /Locked/.test(hub));

  const page = oku('src/app/play/page.tsx');
  check('panel LOCKED_BUILDINGS kullanıyor', /LOCKED_BUILDINGS\[/.test(page));
  // ⚠️ Eski yerel kopya kalmamalı — kalırsa iki kaynak yeniden doğar
  check('sayfada yerel LOCKED kopyası kalmadı', !/^const LOCKED: Record/m.test(page));

  check('uydurma desen bulunmuyor (kontrol grubu)', !/isLockedZZZ/.test(hub + page));
}

console.log('\n[3] ⭐ KİLİTLİ BİNANIN KAPISI KÖYDE GERÇEKTEN VAR');
{
  /**
   * Kilit metni yazılıp kapısı olmayan bir bina, kimsenin göremeyeceği bir
   * açıklamadır. Tersi daha kötü: kapısı olup metni olmayan bina, oyuncuya
   * çıplak bir kelime gösterir (`ComingSoon` yedek dalı).
   */
  let doc: { markers?: { kind?: string; target?: string }[] } | null = null;
  try { doc = JSON.parse(fs.readFileSync('public/map/village.json', 'utf8')); } catch { /* yok */ }
  check('köy haritası okunabildi', !!doc?.markers);

  const kapilar = (doc?.markers ?? []).filter((m) => m.kind === 'door')
    .map((m) => m.target).filter((t): t is string => !!t);
  check('köyde kapı var', kapilar.length > 0, `${kapilar.length} kapı`);

  for (const id of Object.keys(LOCKED_BUILDINGS)) {
    check(`"${id}" kapısı köyde mevcut`, kapilar.includes(id));
  }

  /**
   * ⚠️ ÇIPLAK KAPI AVI: her kapı ya canlı bir panele ya kilit metnine
   * açılmalı. İkisi de yoksa oyuncu tek bir kelime görür.
   */
  const page = oku('src/app/play/page.tsx');
  const canli = new Set([...page.matchAll(/acik === '(\w+)'/g)].map((m) => m[1]));
  const cipl = kapilar.filter((t) => !canli.has(t) && !isLockedBuilding(t));
  check('çıplak kapı yok (panel de kilit metni de olmayan)', cipl.length === 0,
    cipl.join(', ') || `${kapilar.length} kapının hepsi bir şeye açılıyor`);
}

console.log(`\n${FAIL.length === 0 ? '✅ KİLİTLİ BİNALAR SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
