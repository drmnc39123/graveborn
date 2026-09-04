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
    const out = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    /**
     * ⚠️ HATA KODLARI LOGLANIYOR — çünkü kod olmadan iki TAMAMEN FARKLI
     * durum ayırt edilemiyor:
     *   `invalid-input-response` → sır DOĞRU, jeton kötü (normal, beklenen)
     *   `invalid-input-secret`   → SIR YANLIŞ, herkesin girişi kırık
     * İkisi de aynı 403'ü üretiyordu. Sır döndürüldüğünde yanlış değer
     * girilirse belirti sessiz: girişler çalışmayı bırakır, log susar,
     * sebep panelden de görünmez. Bir satır log bunu ölçülebilir yapıyor.
     */
    if (out.success !== true) {
      const kod = out['error-codes']?.join(',') ?? 'kodsuz';
      if (kod.includes('invalid-input-secret')) {
        console.error('[GÜVENLİK] TURNSTILE_SECRET GEÇERSİZ — Cloudflare sırrı tanımıyor, TÜM girişler reddediliyor');
      } else {
        console.warn(`[turnstile] doğrulama başarısız: ${kod}`);
      }
    }
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

/**
 * Bir cüzdan için AYNI ANDA canlı tutulabilecek nonce sayısı.
 *
 * ⚠️ 1 OLAMAZ — hedefli giriş engellemesi tam oradan geliyordu (bkz.
 * `schema.prisma` `AuthNonce`). Saldırgan kurbanın açık adresiyle nonce
 * isteyip kurbanın imzalayacağını eziyordu.
 *
 * ⚠️ SINIRSIZ DA OLAMAZ: her nonce bir DB satırı ve uç kimliksiz.
 * 20, IP başına 12/dk sınırıyla birlikte seçildi: bir saldırgan kurbanın
 * imzaladığı birkaç saniye içinde 20 istek gönderemez.
 */
const NONCE_TAVAN = 20;

export async function issueNonce(wallet: string): Promise<string> {
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  await prisma.authNonce.create({ data: { nonce, wallet, expiresAt } });

  // ⚠️ BUDAMA: önce süresi dolanlar, sonra tavanı aşan EN ESKİLER.
  // Sırası önemli — tersi olsaydı süresi dolmuş ölü satırlar tavanı
  // doldurup canlı nonce'ları attirirdi.
  await prisma.authNonce.deleteMany({
    where: { wallet, expiresAt: { lt: new Date() } },
  }).catch(() => {});
  const canli = await prisma.authNonce.findMany({
    where: { wallet }, orderBy: { expiresAt: 'desc' }, select: { nonce: true },
  });
  if (canli.length > NONCE_TAVAN) {
    await prisma.authNonce.deleteMany({
      where: { nonce: { in: canli.slice(NONCE_TAVAN).map((r) => r.nonce) } },
    }).catch(() => {});
  }
  return nonce;
}

/**
 * İmzayı doğrula. Başarılıysa nonce TÜKETİLİR (silinir) — aynı imza ikinci
 * kez kullanılamaz.
 */
export async function verifySignature(wallet: string, signatureB58: string): Promise<boolean> {
  // ⚠️ CÜZDANIN TÜM CANLI NONCE'LARI DENENİYOR. Tek satır okumak
  // saldırganın yazdığı nonce'ı kurbanınkinin yerine koyardı.
  const simdi = new Date();
  const rows = await prisma.authNonce.findMany({
    where: { wallet, expiresAt: { gt: simdi } },
    orderBy: { expiresAt: 'desc' },
    take: NONCE_TAVAN,
  });
  if (!rows.length) return false;

  let sig: Uint8Array;
  let pub: Uint8Array;
  try {
    sig = bs58.decode(signatureB58);
    pub = bs58.decode(wallet);
  } catch {
    return false;
  }
  if (sig.length !== 64 || pub.length !== 32) return false;

  for (const row of rows) {
    let ok = false;
    try {
      const msg = new TextEncoder().encode(buildMessage(wallet, row.nonce));
      ok = nacl.sign.detached.verify(msg, sig, pub);
    } catch {
      ok = false;
    }
    if (ok) {
      /**
       * ⚠️ YALNIZ EŞLEŞENİ YAK. Başarılı girişin nonce'u tükenmeli
       * (tekrar saldırısı), ama diğerlerine dokunulmamalı.
       *
       * 🔴 SİLME SONUCU OKUNUYOR ve bu bir DÜZELTME. Eskiden
       * `delete(...).catch(() => {})` idi: silme başarısız olursa hata
       * SESSİZCE yutuluyor, nonce canlı kalıyor ve AYNI İMZA İKİNCİ KEZ
       * geçiyordu — yani tekrar koruması, bir veritabanı takılmasında
       * hiçbir iz bırakmadan devre dışı kalıyordu. (Bu oturumda e2e'nin
       * "aynı imza ikinci kez çalışmıyor" kontrolü bir kez düştü ve tek
       * makul açıklama buydu.)
       *
       * `deleteMany` idempotent ve SAYI döndürüyor. `count === 0` demek
       * "bu nonce'u benden önce biri tüketti" demek — sıralı bir tekrar
       * ya da eşzamanlı iki isteğin yarışı. İkisinde de doğru cevap RED.
       */
      const yakildi = await prisma.authNonce.deleteMany({ where: { nonce: row.nonce } });
      if (yakildi.count === 0) {
        console.warn('[GÜVENLİK] nonce zaten tüketilmiş — tekrar denemesi reddedildi', wallet);
        return false;
      }
      return true;
    }
  }

  // ⚠️ BAŞARISIZLIKTA HİÇBİR ŞEY YAKILMIYOR — ve bu bilinçli bir
  // DEĞİŞİKLİK. Eski kod başarısız denemede de nonce'u siliyordu; çok
  // nonce'lu tasarımda bu, kapattığımız kapıyı yeniden açardı: saldırgan
  // çöp bir imza yollayıp kurbanın nonce'unu yakabilirdi.
  // Yakmama riski YOK: ed25519 imzası çevrimiçi denemeyle bulunamaz;
  // eski "sonsuz tekrar" gerekçesi kaba kuvvete karşı zaten koruma
  // sağlamıyordu. Süresi dolanları `issueNonce` buduyor.
  return false;
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
