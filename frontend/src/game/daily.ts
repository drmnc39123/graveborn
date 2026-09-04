// GÜNLÜK İNİŞ — herkesin AYNI tohumu oynadığı tek koşu.
//
// 🔴 NİYE VAR: oyunun her modu "kendi hesabınla, kendi gücünle, istediğin
// kadar" idi. Yani iki oyuncunun sonucu asla kıyaslanabilir değildi —
// sıralamalar kimin daha çok OYNADIĞINI ölçüyordu, kimin daha iyi
// olduğunu değil. Günlük iniş bunun tam tersi: tek deneme, aynı harita,
// aynı düşman sırası, EŞİTLENMİŞ güç.
//
// ⚠️ FORGE BONUSLARI GEÇMİYOR ve bu tasarımın kalbi. Geçseydi tablo bir
// beceri sıralaması değil SERVET sıralaması olurdu — ve öyle bir tablomuz
// zaten var. Eşitlenmiş olması ayrıca yeni oyuncuya ilk gününde birinci
// olma ihtimali veriyor; hiçbir başka modda o ihtimal yok.
//
// ⚠️ TOHUM SEÇİLEMEZ ve ÖNCEDEN DENENEMEZ. `/run/start` her koşuda tohumu
// sunucudan veriyor; oyuncu normal bir inişte günün tohumunu isteyemez.
// Yani "gün boyu prova yap, sonra gerçek denemeyi gir" yolu KAPALI —
// roguelike günlüklerinin klasik açığı bu ve burada yapısal olarak yok.
//
// ⚠️ ÖDÜL GOLD DEĞİL TOZ. Gold vermek musluğu büyütür ve Faz 2'de
// dengelenen oranı bozar (achievements.ts ve wager.ts'teki aynı karar).
// Toz yalnız kozmetik alıyor — ekonomiye tek birim gold eklemiyor.

import { seedFromString } from './rng';

/** UTC gün damgası — YYYY-MM-DD. Günlük her şeyin kimliği bu. */
export function gunDamgasi(now: Date = new Date()): string {
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/** Günün UTC gece yarısı — "bugün oynadı mı" sorgusunun sınırı */
export function gunBaslangici(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Günün bölümü.
 *
 * ⚠️ OYUNCUNUN AÇTIĞI BÖLÜMLERE BAKILMIYOR — bilerek. Herkesin aynı
 * haritayı oynaması günlüğün TEK anlamı; "senin açtıklarından biri"
 * demek, tabloyu yine kıyaslanamaz hâle getirirdi. Bölüm kilidi bu modda
 * uygulanmıyor (bkz. `canStart` daily dalı).
 */
export function gunlukBolum(gun: string, bolumSayisi: number): number {
  if (bolumSayisi <= 0) return 1;
  return (seedFromString(`stage:${gun}`) % bolumSayisi) + 1;
}

/** Günün tohumu — tarihten deterministik, herkeste aynı */
export function gunlukTohum(gun: string): number {
  return seedFromString(`graveborn-daily:${gun}`);
}

/**
 * Toz ödülü — ulaşılan (SUNUCUNUN KABUL ETTİĞİ) derinliğe göre.
 *
 * ⚠️ TAVAN VAR. Tavansız bir ödül, günlüğü "en uzun oturan kazanır"
 * hâline getirirdi; oysa günlük bir beceri denemesi, bir dayanıklılık
 * yarışı değil. Tavan, günlük görevlerin toplamıyla (60-100 toz) aynı
 * mertebede tutuldu — günlük iniş onların yerine geçmemeli, yanlarında
 * durmalı.
 */
export function gunlukTozu(derinlik: number): number {
  const d = Math.max(0, Math.floor(derinlik));
  if (d <= 0) return 0;
  return Math.min(90, 10 + d * 4);
}

/** Sıralamada gösterilecek en fazla satır */
export const GUNLUK_TABLO = 20;
