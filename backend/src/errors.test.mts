// HATA KODU MÜHRÜ — sunucunun döndürdüğü her kodun oyuncuya okunur bir
// karşılığı olmalı.
//
// ⭐ NİYE: `frontend/src/lib/errors.ts` başlığı "SUNUCUDAKİ HER KOD BURADA
// OLMALI" diyordu ama bunu ZORLAYAN hiçbir şey yoktu — yani kural bir
// dilekti. Ölçüldü: yeni uçlar yazılırken iki kod (`bakim_kapali`,
// `onay_hatali`) tabloya hiç girmemişti. Karşılığı olmayan bir kod
// ekranda ham kimlik olarak görünür ("oturum_yok" gibi) — hem Türkçe hem
// anlamsız, ve depo kuralı oyuncuya giden metnin İngilizce olması.
//
// ⚠️ İSTİSNA LİSTESİ YOK, bilerek. "Bu kod admin'e özel" diye bir liste
// tutan mühür, listeye bir satır eklenerek sessizce etkisizleştirilebilir.
// Admin kodları da eşlendi; maliyeti bir satır.

import fs from 'node:fs';
import path from 'node:path';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

// ── sunucudaki kodlar ──
const kodlar = new Set<string>();
for (const dosya of fs.readdirSync('src')) {
  if (!dosya.endsWith('.ts') || dosya.includes('.test.')) continue;
  const metin = fs.readFileSync(path.join('src', dosya), 'utf8');
  /**
   * ⚠️ TEK KALIP YETMİYOR — ÖLÇÜLDÜ. İlk sürüm yalnız `error: '...'`
   * arıyordu ve 43 kod buluyordu; oysa kodlar oyuncuya ÜÇ ayrı yoldan
   * gidiyor:
   *   1. res.json({ error: 'kod' })
   *   2. throw new MarketError('kod', 409)  → res.json({ error: e.code })
   *   3. return { ok: false, reason: 'kod' } → res.json({ error: out.reason })
   * Yalnız birinciyi tarayan bir mühür, sınıfla fırlatılan yeni bir kodun
   * eşlenmediğini FARK ETMEZ ve "yeşil" görünürdü — yani mühür kendi
   * koruduğu hataya düşerdi. Üç kalıp da taranıyor.
   */
  for (const m of metin.matchAll(/error:\s*'([a-z_]+)'/g)) kodlar.add(m[1]);
  for (const m of metin.matchAll(/new \w*Error\('([a-z_]+)'/g)) kodlar.add(m[1]);
  for (const m of metin.matchAll(/reason:\s*'([a-z_]+)'/g)) kodlar.add(m[1]);
}

// ── arayüzdeki karşılıklar ──
const tablo = fs.readFileSync('../frontend/src/lib/errors.ts', 'utf8');
const eslenmis = new Set(
  [...tablo.matchAll(/^\s{2}([a-z_]+):\s*'/gm)].map((m) => m[1]),
);

console.log(`\nsunucu kodu: ${kodlar.size} · tabloda: ${eslenmis.size}`);

check('sunucu kodları bulundu', kodlar.size > 20, `${kodlar.size} kod`);
check('tablo okundu', eslenmis.size > 20, `${eslenmis.size} satır`);

const eksik = [...kodlar].filter((k) => !eslenmis.has(k)).sort();
check('karşılığı olmayan kod YOK', eksik.length === 0, eksik.join(' '));

// ⚠️ ÇİFT TARAFLI: tarama gerçekten arıyor mu? Uydurma bir kod tabloda
// BULUNMAMALI — bulunuyorsa eşleştirme her şeye "var" diyordur.
check('mühür uydurma kodu yakalıyor (kontrol grubu)', !eslenmis.has('bu_kod_yok_ki'));

// ⚠️ Ters yön de bilgi: tabloda olup sunucuda olmayan kodlar ölü satır.
// Zarar vermiyorlar, o yüzden BAŞARISIZ SAYILMIYOR — ama listeleniyor,
// çünkü uç silindiğinde tabloda kalan satır "bu hata hâlâ var" izlenimi
// verir.
const fazla = [...eslenmis].filter((k) => !kodlar.has(k)).sort();
if (fazla.length) console.log(`  · sunucuda karşılığı kalmamış ${fazla.length} satır: ${fazla.join(' ')}`);

console.log(`\n${FAIL.length === 0 ? '✅ HATA KODLARI EŞLENMİŞ' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
