// DESTEK TALEBİ — oyuncu yazar, admin cevaplar.
//
// ⚠️ METİN TEMİZLİĞİ REGEX İLE DEĞİL, KOD NOKTASIYLA. Kaçış dizileri bu
// araç zincirinde ÜÇ KEZ bozulup dosyaya ham kontrol karakteri düşürdü
// (bkz. chat.ts). Kod noktasına bakmak hem bağışık hem de ne elendiği
// okunur.
//
// ⚠️ TALEP BİR SPAM KANALI. Oyuncu istediği kadar talep açabilseydi hem
// admin listesi kullanılamaz olur hem de veritabanı şişerdi: açık talep
// sayısı ve mesaj aralığı sınırlı.
//
// ⚠️ ADMIN CEVABI TALEBİ "answered" YAPAR, oyuncunun yeni mesajı tekrar
// "open". Durumu elle yönetmek, "cevaplandı mı" sorusunu er ya da geç
// yanlış cevaplardı.

import crypto from 'node:crypto';
import { prisma } from './db.js';

export class TicketError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

export const TICKET = {
  /** aynı anda açık kalabilecek talep sayısı */
  maxOpen: 3,
  /** iki mesaj arasında geçmesi gereken saniye — spam koruması */
  cooldownSec: 20,
  subjectMax: 80,
  bodyMax: 1200,
  /** bir talepte biriken en fazla mesaj — sonsuz iplik olmasın */
  maxMessages: 40,
} as const;

/**
 * Görünmez/kontrol karakterlerini at, boşlukları sadeleştir.
 * ⚠️ Regex YOK — bkz. dosya başlığı.
 */
function temizle(ham: string, max: number): string {
  let out = '';
  for (const ch of ham) {
    const c = ch.codePointAt(0) ?? 0;
    const kontrol = (c < 0x20 && c !== 0x0a) || c === 0x7f;
    const gizli = (c >= 0x200b && c <= 0x200f)
      || (c >= 0x2028 && c <= 0x202e) || c === 0x2060 || c === 0xfeff;
    if (kontrol || gizli) continue;
    out += ch;
    if (out.length >= max) break;
  }
  return out.trim();
}

export interface TicketView {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  bumpedAt: string;
  messages: { fromAdmin: boolean; body: string; at: string }[];
}

function view(t: {
  id: string; subject: string; status: string; createdAt: Date; bumpedAt: Date;
  messages: { fromAdmin: boolean; body: string; createdAt: Date }[];
}): TicketView {
  return {
    id: t.id, subject: t.subject, status: t.status,
    createdAt: t.createdAt.toISOString(), bumpedAt: t.bumpedAt.toISOString(),
    messages: t.messages.map((m) => ({
      fromAdmin: m.fromAdmin, body: m.body, at: m.createdAt.toISOString(),
    })),
  };
}

const ICERIK = {
  messages: { orderBy: { createdAt: 'asc' as const }, take: TICKET.maxMessages },
};

/** Oyuncunun kendi talepleri — en son yazılan üstte */
export async function myTickets(wallet: string): Promise<TicketView[]> {
  const rows = await prisma.ticket.findMany({
    where: { wallet }, orderBy: { bumpedAt: 'desc' }, take: 20, include: ICERIK,
  });
  return rows.map(view);
}

/** Yeni talep aç */
export async function openTicket(
  wallet: string, subjectRaw: unknown, bodyRaw: unknown,
): Promise<TicketView> {
  if (typeof subjectRaw !== 'string' || typeof bodyRaw !== 'string') {
    throw new TicketError('gecersiz_istek');
  }
  const p = await prisma.player.findUnique({
    where: { wallet }, select: { banned: true },
  });
  // ⚠️ Banlı oyuncu talep AÇAMAZ ama mevcut taleplerini OKUYABİLİR:
  // itiraz edecek yeri tamamen kapatmak, banı tartışılamaz kılardı.
  if (!p || p.banned) throw new TicketError('yasakli', 403);

  const subject = temizle(subjectRaw, TICKET.subjectMax);
  const body = temizle(bodyRaw, TICKET.bodyMax);
  if (subject.length < 3) throw new TicketError('Give it a subject.');
  if (body.length < 10) throw new TicketError('Tell us what happened.');

  const acik = await prisma.ticket.count({
    where: { wallet, status: { not: 'closed' } },
  });
  if (acik >= TICKET.maxOpen) {
    throw new TicketError(`You already have ${TICKET.maxOpen} open tickets.`);
  }

  const id = crypto.randomUUID();
  await prisma.ticket.create({
    data: {
      id, wallet, subject,
      messages: { create: { id: crypto.randomUUID(), fromAdmin: false, body } },
    },
  });
  const t = await prisma.ticket.findUniqueOrThrow({ where: { id }, include: ICERIK });
  return view(t);
}

/** Var olan talebe mesaj ekle (oyuncu ya da admin) */
export async function reply(
  ticketId: unknown, bodyRaw: unknown,
  opts: { wallet?: string; asAdmin?: boolean },
): Promise<TicketView> {
  if (typeof ticketId !== 'string' || typeof bodyRaw !== 'string') {
    throw new TicketError('gecersiz_istek');
  }
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!t) throw new TicketError('talep_yok', 404);
  // ⚠️ Oyuncu BAŞKASININ talebine yazamaz — id tahmin edilebilir olmasa da
  // yetki kontrolü id'nin gizliliğine bırakılmaz.
  if (!opts.asAdmin && t.wallet !== opts.wallet) throw new TicketError('senin_talebin_degil', 403);
  if (t.status === 'closed') throw new TicketError('This ticket is closed.');

  const body = temizle(bodyRaw, TICKET.bodyMax);
  if (body.length < 2) throw new TicketError('Write something.');

  const sayi = await prisma.ticketMessage.count({ where: { ticketId } });
  if (sayi >= TICKET.maxMessages) throw new TicketError('This thread is full.');

  // ⚠️ SOĞUMA SADECE OYUNCUYA. Admin'i beklettirmek, aynı anda birden çok
  // talebi cevaplayan kişiyi durdurmaktan başka bir işe yaramazdı.
  if (!opts.asAdmin) {
    const son = t.messages[0];
    if (son && !son.fromAdmin) {
      const gecen = (Date.now() - son.createdAt.getTime()) / 1000;
      if (gecen < TICKET.cooldownSec) throw new TicketError('Slow down a moment.');
    }
  }

  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { id: crypto.randomUUID(), ticketId, fromAdmin: !!opts.asAdmin, body },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      // ⚠️ Durum MESAJIN YAZARINDAN türüyor, elle yönetilmiyor: admin
      // yazınca "answered", oyuncu yazınca tekrar "open".
      data: { status: opts.asAdmin ? 'answered' : 'open', bumpedAt: new Date() },
    }),
  ]);

  return view(await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: ICERIK }));
}

/** Admin listesi — açık olanlar önce, en son yazılan üstte */
export async function adminList(status = 'open', limit = 50): Promise<TicketView[]> {
  const rows = await prisma.ticket.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { bumpedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    include: ICERIK,
  });
  return rows.map(view);
}

/** Talebi kapat — sadece admin */
export async function closeTicket(ticketId: unknown): Promise<void> {
  if (typeof ticketId !== 'string') throw new TicketError('gecersiz_istek');
  await prisma.ticket.updateMany({
    where: { id: ticketId }, data: { status: 'closed' },
  });
}

/** Admin rozeti için — kaç talep cevap bekliyor */
export async function openTicketCount(): Promise<number> {
  return prisma.ticket.count({ where: { status: 'open' } });
}
