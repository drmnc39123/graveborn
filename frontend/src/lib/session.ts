'use client';
// OTURUM — oyun iki modda çalışır:
//
//   demo   → cüzdan yok, ilerleme localStorage'da, sunucuya hiç dokunulmaz
//   wallet → cüzdan imzalı, ilerleme SUNUCUDA, ödülü sunucu hesaplar
//
// Neden demo var: cüzdan zorunlu bir kapı, oyunu görmeden cüzdan bağlamak
// istemeyen herkesi kapıda kaybeder. Demo huniyi açık tutar.
//
// ⚠️ DEMO İLERLEMESİ EKONOMİYE ASLA GİRMEZ. localStorage düzenlenebilir;
// oradaki gold sunucuya taşınamaz, token karşılığı satılamaz. Cüzdan
// bağlandığında sunucu kaydı BAŞTAN başlar — demo bir vitrindir, kısa yol değil.

import type { Progress } from '@/game/progress';
import { isTestMode, TEST_WALLET } from '@/lib/testMode';
import { kodMetni } from '@/lib/errors';
import type { Cuzdan } from '@/lib/wallets';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';
const K_TOKEN = 'graveborn:token';
const K_MODE = 'graveborn:mode';
const K_WALLET = 'graveborn:wallet';

export type SessionMode = 'demo' | 'wallet';

const ls = (): Storage | null => {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
};

export function getMode(): SessionMode | null {
  const v = ls()?.getItem(K_MODE);
  return v === 'demo' || v === 'wallet' ? v : null;
}
export function setMode(m: SessionMode) { ls()?.setItem(K_MODE, m); }
export function getToken(): string | null { return ls()?.getItem(K_TOKEN) ?? null; }
export function getWallet(): string | null { return ls()?.getItem(K_WALLET) ?? null; }

/**
 * GÖSTERİM için cüzdan — "bu satır benim mi" karşılaştırmalarında kullanılır.
 *
 * ⚠️ `getWallet()`ten AYRI. O, isteklerde ve imzada kullanılan GERÇEK değer
 * ve test modunda bile gerçek kalmalı. Bu ise yalnızca ekranda kimin
 * vurgulanacağını belirliyor; test modunda sahte tabloların ME cüzdanını
 * döndürür, yoksa o tablolarda oyuncu kendini hiç tanımaz (bkz.
 * `testMode.ts` TEST_WALLET notu).
 */
export function displayWallet(): string | null {
  return isTestMode() ? TEST_WALLET : getWallet();
}

export function signOut() {
  const s = ls();
  s?.removeItem(K_TOKEN);
  s?.removeItem(K_WALLET);
  s?.removeItem(K_MODE);
}

// ── HTTP ──
/**
 * ⚠️ MESAJ ARTIK OYUNCUNUN OKUYACAĞI CÜMLE, ham kod DEĞİL.
 *
 * 🔴 Eskiden mesaj "401 oturum_yok" oluyordu ve arayüzdeki 23 ayrı
 * `e.message` çağrısı bunu EKRANA BASIYORDU: oyuncu köyde kırmızı bir
 * kutuda "oturum_yok" görüyordu — hem Türkçe hem bir hata kimliği. Depo
 * kuralı net: oyuncuya giden metin İngilizce, kod yorumları Türkçe.
 *
 * ⚠️ ÇEVİRİ BURADA, ÇAĞRI YERLERİNDE DEĞİL. 23 yeri tek tek düzeltmek her
 * yeni `catch`in aynı hatayı tekrarlamasına kapı bırakırdı; nitekim
 * `MarketPanel` kendi küçük tablosunu yazmış ve yalnız 4 kodu kapsıyordu.
 * ⚠️ `status` ve `code` alanları DURUYOR — gerekirse hâlâ okunabiliyor.
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(kodMetni(code));
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let code = 'hata';
    try { code = ((await res.json()) as { error?: string }).error ?? code; } catch { /* metin döndü */ }
    // Jeton düştüyse oturumu temizle — kullanıcı 401 duvarına toslamasın
    if (res.status === 401) signOut();
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}

// ── CÜZDANLA GİRİŞ ──

/**
 * Cüzdanla giriş: bağlan → nonce al → imzala → jeton al.
 *
 * ⚠️ İMZA bs58 İLE KODLANIR, base64 ile DEĞİL. Sunucu bs58 çözüyor;
 * base64 gönderilirse doğrulama sessizce başarısız olur ve sebebi görünmez.
 *
 * ⭐ ARTIK CÜZDAN DIŞARIDAN GELİYOR. Eskiden burada `getPhantom()` çağrılıyor
 * ve Phantom yoksa giriş reddediliyordu — oysa sunucu düz ed25519
 * doğrulaması yapıyor, imzayı hangi cüzdanın ürettiği önemsiz. Keşif ve
 * seçim `lib/wallets.ts`te; burası yalnız protokolü bilir.
 */
export async function signInWithWallet(
  cuzdan: Cuzdan,
  turnstileToken?: string,
): Promise<{ wallet: string; progress: Progress }> {
  const wallet = await cuzdan.baglan();

  const { message } = await api<{ nonce: string; message: string }>('/auth/nonce', {
    method: 'POST', body: { wallet },
  });

  const signature = await cuzdan.imzala(new TextEncoder().encode(message));
  const bs58 = (await import('bs58')).default;

  const out = await api<{ token: string; progress: Progress }>('/auth/verify', {
    method: 'POST',
    body: { wallet, signature: bs58.encode(signature), turnstileToken },
  });

  const s = ls();
  s?.setItem(K_TOKEN, out.token);
  s?.setItem(K_WALLET, wallet);
  setMode('wallet');
  return { wallet, progress: out.progress };
}

/** Sunucu ayakta mı + kaç oyuncu var (ana sayfa göstergesi) */
export async function fetchStats(): Promise<{ players: number; runs: number } | null> {
  try {
    return await api<{ players: number; runs: number }>('/stats');
  } catch {
    return null;   // sunucu kapalıysa ana sayfa yine açılır, sayı gizlenir
  }
}
