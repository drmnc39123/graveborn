// MÜHÜR KOŞUCUSU — `src/` altındaki bütün `*.test.mts` dosyalarını çalıştırır.
//
// 🔴 NİYE VAR: bu depoda 58 mühür var ve HİÇBİR ŞEY onları toplu
// çalıştırmıyordu. Sonucu ölçüldü: `sim.test.mts` 2026-09-04'ten
// 2026-09-08'e kadar KIRMIZI durdu (music.ts `Math.random()` kullanmaya
// başlamıştı) ve kimse fark etmedi — çünkü o mührü çalıştırmak için onun
// var olduğunu hatırlamak ve adını yazmak gerekiyordu.
//
// Çalıştırılmayan mühür mühür değildir. Bu dosya o boşluğu kapatıyor.
//
//   npm test                 — hepsi
//   npm test -- sol build    — adı bu parçaları içerenler
//   npm test -- --jobs=1     — sırayla (hata ayıklarken)
//
// ⚠️ ÖLÇÜM YAPAN MÜHÜRLER YALNIZ BAŞINA KOŞAR. `perf` · `fx` · `sim`
// gerçek milisaniye ölçüyor ve eşik iddia ediyor; yanlarında üç tsx süreci
// çalışırken ölçtükleri şey makinenin yükü olurdu. Liste ELLE TUTULMUYOR —
// dosyada `performance.now()` geçmesi yeterli, yoksa liste bir gün
// gerçeklikten ayrılırdı.
//
// ⚠️ Veritabanı isteyen mühürler `backend/` altında; burası saf.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const KOK = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

/** `src/` altını tarayıp bütün mühürleri topla */
function muhurleriBul(dizin) {
  const out = [];
  for (const ad of fs.readdirSync(dizin)) {
    const tam = path.join(dizin, ad);
    if (fs.statSync(tam).isDirectory()) out.push(...muhurleriBul(tam));
    else if (ad.endsWith('.test.mts')) out.push(path.relative(KOK, tam).replace(/\\/g, '/'));
  }
  return out;
}

const args = process.argv.slice(2);
const jobsArg = args.find((a) => a.startsWith('--jobs='));
const JOBS = jobsArg ? Math.max(1, Number(jobsArg.slice(7)) || 1) : 4;
const filtreler = args.filter((a) => !a.startsWith('--'));

let hepsi = muhurleriBul(path.join(KOK, 'src')).sort();
if (filtreler.length > 0) {
  hepsi = hepsi.filter((f) => filtreler.some((q) => f.toLowerCase().includes(q.toLowerCase())));
}
if (hepsi.length === 0) {
  console.error('Eşleşen mühür yok.');
  process.exit(1);
}

/** Gerçek milisaniye ölçen mühür — yalnız başına koşmalı */
const yalnizMi = (f) => fs.readFileSync(path.join(KOK, f), 'utf8').includes('performance.now()');
const yalniz = hepsi.filter(yalnizMi);
const paralel = hepsi.filter((f) => !yalnizMi(f));

/**
 * ⚠️ `tsx` DOĞRUDAN ÇAĞRILIYOR, `npx` ÜZERİNDEN DEĞİL.
 *
 * Ölçüldü: `tsx` bu depoda frontend'e KURULU DEĞİLDİ — bütün mühürler
 * bugüne kadar npx'in ÖNBELLEĞİNDEN çalışıyordu. Önbellek temizlenseydi
 * 58 mühür birden "çalışmıyor" hâline gelirdi ve sebebi görünmezdi;
 * `tsx` artık `devDependencies`te.
 *
 * ⚠️ `npx.cmd` denendi ve OLMADI: Node 24 kabuk olmadan `.cmd` çalıştırmayı
 * reddediyor (EINVAL, CVE-2024-27980 düzeltmesi). `shell: true` çözerdi ama
 * dosya adlarını kabuğa sokardı. `node <tsx-cli> <dosya>` ikisinden de
 * kaçınıyor.
 */
const TSX = path.join(KOK, 'node_modules', 'tsx', 'dist', 'cli.mjs');
if (!fs.existsSync(TSX)) {
  console.error('tsx kurulu değil — `npm i` çalıştır.');
  process.exit(1);
}

const sonuc = new Map();

function calistir(dosya) {
  return new Promise((res) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [TSX, dosya], { cwd: KOK });
    let cikti = '';
    p.stdout.on('data', (d) => { cikti += d; });
    p.stderr.on('data', (d) => { cikti += d; });
    p.on('close', (kod) => {
      const sn = ((Date.now() - t0) / 1000).toFixed(1);
      sonuc.set(dosya, { ok: kod === 0, cikti, sn });
      console.log(`${kod === 0 ? '  ✓' : '  ✗'} ${dosya}  (${sn}s)`);
      res();
    });
  });
}

async function kuyruk(liste, esZamanli) {
  let i = 0;
  const isci = async () => { while (i < liste.length) await calistir(liste[i++]); };
  await Promise.all(Array.from({ length: Math.min(esZamanli, liste.length) }, isci));
}

const basla = Date.now();
console.log(`\n${hepsi.length} mühür · ${JOBS} paralel · ${yalniz.length} tanesi yalnız koşuyor\n`);
await kuyruk(paralel, JOBS);
// ⚠️ Ölçüm yapanlar EN SONA ve TEK TEK — yanlarında yük olmasın
if (yalniz.length > 0) {
  console.log(`\n  — ölçüm mühürleri (yalnız) —`);
  await kuyruk(yalniz, 1);
}

const kirmizi = [...sonuc.entries()].filter(([, v]) => !v.ok);
console.log(`\n${'─'.repeat(60)}`);
if (kirmizi.length === 0) {
  console.log(`✅ ${hepsi.length} mührün hepsi YEŞİL · ${((Date.now() - basla) / 1000).toFixed(0)}s\n`);
  process.exit(0);
}

/**
 * ⚠️ KIRMIZI MÜHRÜN ÇIKTISI BASILIYOR. Yalnız dosya adını yazmak, hatayı
 * bulmak için testi bir kez daha elle çalıştırmayı gerektirirdi — ve tam
 * o adım atlandığı için bu koşucu yazıldı.
 */
for (const [f, v] of kirmizi) {
  console.log(`\n╭─ ${f}`);
  const satirlar = v.cikti.split('\n').filter((l) => l.trim().length > 0);
  // Yalnız hata satırları + özet: 200 satırlık bir OK listesi hiçbir şey anlatmıyor
  const ilginc = satirlar.filter((l) => /✗|X {2}|BAŞARISIZ|BASARISIZ|Error|error TS/.test(l));
  for (const l of (ilginc.length > 0 ? ilginc : satirlar.slice(-12))) console.log(`│ ${l}`);
  console.log('╰─');
}
console.log(`\n❌ ${kirmizi.length}/${hepsi.length} mühür KIRMIZI · ${((Date.now() - basla) / 1000).toFixed(0)}s\n`);
process.exit(1);
