// CÜZDAN KİMLİĞİ — nonce → imza → oturum jetonu.
//
// Neden nonce: sabit bir metni imzalatmak, imzayı bir kez ele geçirenin
// sonsuza kadar kimliğe bürünmesi demektir. Tek kullanımlık nonce bunu keser.
//
// ⚠️ İMZA KODLAMASI bs58 — base64 DEĞİL. Phantom `signMessage` ham bayt döner;
// frontend bunu bs58 ile kodlar, burada bs58 ile çözülür. (Ghost Hunter'da
// base64 varsayımı yüzünden imza doğrulama sessizce başarısız olmuştu.)

import crypto from 'node:crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { prisma } from './db.js';

const SECRET = process.env.SESSION_SECRET ?? '';
if (!SECRET || SECRET.length < 16) {
  throw new Error('SESSION_SECRET eksik veya çok kısa — oturum jetonları imzalanamaz');
}

const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Solana adresi bs58, 32 bayta çözülmeli — biçimsel doğrulama */
export function isValidWallet(w: unknown): w is string {
  if (typeof w !== 'string' || w.length < 32 || w.length > 44) return false;
  try {
    return bs58.decode(w).length === 32;
  } catch {
    return false;
  }
}

/**
 * CLOUDFLARE TURNSTILE doğrulaması.
 *
 * ⚠️ İstemcinin jeton göndermesi tek başına HİÇBİR ŞEY ifade etmez — jeton
 * Cloudflare'a sorulmadan geçerli sayılırsa bot kontrolü dekordan ibaret olur.
 *
 * `TURNSTILE_SECRET` tanımlı değilse kontrol ATLANIR (geliştirme ve anahtarlar
 * girilmeden önceki dönem için). Üretimde tanımlanmalı.
 */
export async function verifyTurnstile(token: unknown, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) {
    // ⚠️ ÜRETİMDE SESSİZCE AÇIK BIRAKILAMAZ. Sır tanımsızken kontrol
    // TAMAMEN atlanıyordu — yani üretimde `TURNSTILE_SECRET` unutulursa
    // bot kapısı ardına kadar açık kalır ve HİÇBİR uyarı çıkmaz.
    // Hız sınırı cüzdan anahtarlı, cüzdan üretmek ise bedava: tek gerçek
    // hesap-açma yavaşlatıcısı bu kontrol.
    if (process.env.NODE_ENV === 'production') {
      console.error('[GÜVENLİK] TURNSTILE_SECRET TANIMSIZ — bot kontrolü KAPALI');
    }
    return true;                                  // kapalı (yerel geliştirme)
  }
  if (typeof token !== 'string' || !token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const out = (await res.json()) as { success?: boolean };
    return out.success === true;
  } catch {
    // Cloudflare'a ulaşılamıyorsa KAPIYI KAPAT. Açık bırakmak, servis
    // kesintisini bot kontrolünü tamamen atlamanın yoluna çevirirdi.
    return false;
  }
}

export function buildMessage(wallet: string, nonce: string): string {
  return [
    'GRAVEBORN — sign in',
    '',
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    '',
    'Signing costs nothing and never moves funds.',
  ].join('\n');
}

export async function issueNonce(wallet: string): Promise<string> {
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  await prisma.authNonce.upsert({
    where: { wallet },
    update: { nonce, expiresAt },
    create: { wallet, nonce, expiresAt },
  });
  return nonce;
}

/**
 * İmzayı doğrula. Başarılıysa nonce TÜKETİLİR (silinir) — aynı imza ikinci
 * kez kullanılamaz.
 */
export async function verifySignature(wallet: string, signatureB58: string): Promise<boolean> {
  const row = await prisma.authNonce.findUnique({ where: { wallet } });
  if (!row) return false;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.authNonce.delete({ where: { wallet } }).catch(() => {});
    return false;
  }

  let ok = false;
  try {
    const msg = new TextEncoder().encode(buildMessage(wallet, row.nonce));
    const sig = bs58.decode(signatureB58);
    const pub = bs58.decode(wallet);
    if (sig.length === 64 && pub.length === 32) {
      ok = nacl.sign.detached.verify(msg, sig, pub);
    }
  } catch {
    ok = false;
  }

  // Başarılı da olsa başarısız da olsa nonce yakılır: başarısız denemeler
  // aynı nonce üzerinde sonsuz tekrar edilemesin.
  await prisma.authNonce.delete({ where: { wallet } }).catch(() => {});
  return ok;
}

// ── Oturum jetonu ──
// Durumsuz ve HMAC imzalı: Redis olmadan da çalışır, Railway'de tek proses
// varsayımı gerektirmez. Biçim: base64url(payload).base64url(hmac)

interface SessionPayload { w: string; exp: number }

const b64u = (b: Buffer) => b.toString('base64url');

function sign(data: string): string {
  return b64u(crypto.createHmac('sha256', SECRET).update(data).digest());
}

export function issueToken(wallet: string): string {
  const payload: SessionPayload = { w: wallet, exp: Date.now() + SESSION_TTL_MS };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(body)}`;
}

export function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  // Sabit zamanlı karşılaştırma — imza tahmininde zamanlama sızıntısı olmasın
  const expected = sign(body);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;

  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    if (!p.w || typeof p.exp !== 'number' || p.exp < Date.now()) return null;
    return p.w;
  } catch {
    return null;
  }
}
