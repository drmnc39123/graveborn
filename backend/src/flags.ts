// CANLI OPERASYON BAYRAKLARI — deploy etmeden kapıyı kapatmak ve duyuru yazmak.
//
// ⚠️ NİYE VAR: açılıştan sonra bir sorun çıktığında tek seçenek yeni bir
// deploy beklemekti. Bir para basma açığı görüldüğünde geçen dakikalar
// pahalıdır; "yeni koşu açılmasın" demek için kodu yeniden yayınlamak
// gerekmemeli.
//
// ⚠️ BURAYA DENGE SABİTİ KOYULMAZ. Hasar, düşman canı, ödül eğrisi
// simülasyonun parçası ve sunucu ödülü onlarla doğruluyor (`reward.ts`).
// DB'den okunan bir denge sabiti, oyuncunun OYNADIĞI koşu ile sunucunun
// DOĞRULADIĞI koşuyu ayırırdı — mühürlü determinizmin tam karşıtı.
// Buraya yalnız OPERASYON girer.

import { prisma } from './db.js';

export interface Flags {
  maintenance: boolean;
  notice: string | null;
}

const VARSAYILAN: Flags = { maintenance: false, notice: null };

/**
 * ⚠️ KISA ÖNBELLEK. Bayraklar her `/run/start` çağrısında okunuyor; her
 * seferinde DB'ye gitmek sıcak yola bir sorgu eklerdi. 5 saniye, "bakımı
 * açtım ama hâlâ koşu başlıyor" şaşkınlığı yaratmayacak kadar kısa.
 */
const TTL_MS = 5_000;
let onbellek: { deger: Flags; at: number } | null = null;

export async function flags(): Promise<Flags> {
  if (onbellek && Date.now() - onbellek.at < TTL_MS) return onbellek.deger;
  try {
    const row = await prisma.serverFlag.findUnique({ where: { id: 1 } });
    const deger: Flags = row
      ? { maintenance: row.maintenance, notice: row.notice }
      : VARSAYILAN;
    onbellek = { deger, at: Date.now() };
    return deger;
  } catch {
    // ⚠️ DB OKUNAMAZSA OYUN AÇIK KALIR. Tersi (hata → bakım) daha
    // "güvenli" görünür ama geçici bir DB hıçkırığı bütün oyuncuları
    // kapıda bırakırdı; bakım bilinçli bir KARAR olmalı, bir yan etki değil.
    return onbellek?.deger ?? VARSAYILAN;
  }
}

export async function setFlags(next: Partial<Flags>): Promise<Flags> {
  const row = await prisma.serverFlag.upsert({
    where: { id: 1 },
    update: {
      ...(next.maintenance !== undefined ? { maintenance: next.maintenance } : {}),
      ...(next.notice !== undefined ? { notice: next.notice } : {}),
    },
    create: {
      id: 1,
      maintenance: next.maintenance ?? false,
      notice: next.notice ?? null,
    },
  });
  const deger: Flags = { maintenance: row.maintenance, notice: row.notice };
  // ⚠️ Önbellek HEMEN tazeleniyor: yönetici düğmeye bastıktan sonra 5
  // saniye daha eski değeri görmek, "çalışmadı" sanıp ikinci kez basmaya
  // yol açardı.
  onbellek = { deger, at: Date.now() };
  return deger;
}
