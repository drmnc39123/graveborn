// YAZI GİRDİSİ MÜHRÜ — oyuncunun yazdığı her kutu 16 px veya üstü.
//
// 🔴 NİYE VAR (2026-09-18, mobil denetim): iOS WebKit — Safari VE Phantom
// uygulama içi tarayıcı — 16 px altındaki bir girdiye odaklanınca sayfayı
// yakınlaştırıyor. Viewport `userScalable: false` olduğu için oyuncu geri
// uzaklaştıramıyor; sohbete tek harf yazan oyuncu HUD'u ekrandan taşmış
// hâlde görüyordu. Ölçülen puntolar: sohbet 11,5 · pazar 12/13 · isim 15.
//
// ⚠️ KAYNAK TARAMASI: her `<input>`/`<textarea>` etiketi ayrı ayrı okunuyor.
// Kaydırıcı ve onay kutusu klavye açmaz, sayılmıyor. Geliştirici araçları
// (editor, capture, yönetim) oyuncuya açık değil, sayılmıyor.
//
//   cd frontend && npx tsx src/game/girdi.test.mts

import fs from 'node:fs';
import path from 'node:path';
import { GIRDI_PUNTO } from '../lib/theme.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const yorumsuz = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const KOK = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const HARIC = /[\\/](editor|capture|gbadmin\w*)[\\/]/;

function dosyalar(d: string, out: string[] = []): string[] {
  for (const ad of fs.readdirSync(d)) {
    const t = path.join(d, ad);
    if (fs.statSync(t).isDirectory()) dosyalar(t, out);
    else if (ad.endsWith('.tsx') && !HARIC.test(t)) out.push(t);
  }
  return out;
}

console.log('\n=== YAZI GIRDISI PUNTOSU (iOS / Phantom yakinlasmasi) ===');

console.log('\n[1] SABIT');
check('GIRDI_PUNTO >= 16', GIRDI_PUNTO >= 16, String(GIRDI_PUNTO));

console.log('\n[2] ** HER YAZI GIRDISI SABITI KULLANIYOR');
let sayi = 0;
const kotu: string[] = [];
for (const f of [...dosyalar(path.join(KOK, 'components')), ...dosyalar(path.join(KOK, 'app'))]) {
  const s = yorumsuz(fs.readFileSync(f, 'utf8'));
  const ad = path.relative(KOK, f).replace(/\\/g, '/');
  for (const m of s.matchAll(/<(input|textarea)\b[\s\S]*?\/>/g)) {
    const etiket = m[0];
    if (/type="(range|checkbox|radio|hidden|file)"/.test(etiket)) continue;
    sayi++;
    // Doğrudan sabit mi, yoksa sabiti taşıyan bir stil nesnesi mi?
    let ok = /fontSize: GIRDI_PUNTO/.test(etiket);
    const yayilan = etiket.match(/style=\{(?:\{\s*\.\.\.)?(\w+)/)?.[1];
    if (!ok && yayilan) {
      const tanim = s.match(new RegExp(`const ${yayilan}\\s*=\\s*\\{[\\s\\S]*?\\n\\s*\\}`))?.[0] ?? '';
      ok = /fontSize: GIRDI_PUNTO/.test(tanim);
    }
    // Etiket içinde sabiti ezen küçük bir punto olmamalı
    if (/fontSize: \d/.test(etiket)) ok = false;
    if (!ok) kotu.push(`${ad}:${s.slice(0, m.index).split('\n').length}`);
  }
}
check('en az 10 yazi girdisi tarandi (tarayici calisiyor)', sayi >= 10, `${sayi} girdi`);
check('hepsi GIRDI_PUNTO', kotu.length === 0, kotu.join(', '));

if (FAIL.length) { console.log(`\n${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`); process.exit(1); }
console.log('\nYAZI GIRDILERI SAGLAM');
