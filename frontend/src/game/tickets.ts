// DESTEK TALEBİ — paylaşılan sınırlar.
//
// ⚠️ SUNUCU DA BU DOSYAYI OKUR (`@game/tickets`). Sınırları iki yerde
// tutmak, arayüzün kabul ettiği bir metni sunucunun reddetmesi demekti —
// oyuncu "gönder"e basar, hiçbir şey olmaz ve sebebini anlamaz.
//
// ⚠️ TALEP BİR SPAM KANALI. Sınırsız açılabilseydi hem admin listesi
// kullanılamaz hâle gelir hem veritabanı şişerdi.

export const TICKET = {
  /** aynı anda açık kalabilecek talep sayısı */
  maxOpen: 3,
  /** iki OYUNCU mesajı arasında geçmesi gereken saniye */
  cooldownSec: 20,
  subjectMax: 80,
  bodyMax: 1200,
  /** bir talepte biriken en fazla mesaj — sonsuz iplik olmasın */
  maxMessages: 40,
} as const;

/** 'open' = oyuncu bekliyor · 'answered' = admin yazdı · 'closed' = bitti */
export type TicketStatus = 'open' | 'answered' | 'closed';
