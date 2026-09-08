'use client';
// CÜZDAN BAĞLAMA — keşif, bot kontrolü, imza. TEK KAYNAK.
//
// 🔴 NİYE HOOK: bu akış artık İKİ yerden çağrılıyor — ana sayfadaki kapı ve
// köyde demo oynarken çıkan bağlan düğmesi (kullanıcı isteği: *"demo modunda
// oynayan biri Connect Wallet butonunu da görmeli; şu an homepage'e geri
// gelerek bağlanıyor"*).
//
// Akışı ikinci kez yazmak bu depoda her seferinde ayrıştı. Burada tehlikesi
// somut: iki kopyadan biri Turnstile jetonunu göndermeyi unutursa o kapı
// SESSİZCE çalışmaz — sunucu `bot_kontrolu_basarisiz` ile 403 döner ve hata
// bir yapılandırma sorunu gibi görünür.
//
// ⚠️ GÖRÜNÜM PAYLAŞILMIYOR, MANTIK PAYLAŞILIYOR. Kapı büyük düğmelerle,
// köydeki düğme dar bir açılır kutuyla çiziliyor; ikisini tek bileşene
// sıkıştırmak her iki ekranı da bozardı.

import { useCallback, useEffect, useState } from 'react';
import { bulunanCuzdanlar, cuzdanlariIzle, type Cuzdan } from '@/lib/wallets';
import { signInWithWallet } from '@/lib/session';
import { turnstileEnabled } from '@/components/Turnstile';

export interface CuzdanBaglama {
  /** kurulu ve keşfedilmiş cüzdanlar */
  cuzdanlar: Cuzdan[];
  busy: boolean;
  /** oyuncuya gösterilecek hata; imza reddi HATA DEĞİLDİR ve null döner */
  err: string | null;
  setErr: (v: string | null) => void;
  /** bot kontrolü açık ve jeton henüz yok → bağlanma düğmesi kapalı olmalı */
  needCaptcha: boolean;
  setCaptcha: (t: string | null) => void;
  baglan: (c: Cuzdan) => Promise<void>;
}

export function useCuzdanBaglan(onDone: () => void): CuzdanBaglama {
  const [cuzdanlar, setCuzdanlar] = useState<Cuzdan[]>([]);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /**
   * ⚠️ CÜZDAN LİSTESİ TEK SEFERLİK OKUNAMAZ. Eklentiler sayfayla aynı anda
   * yüklenmiyor; ilk karede liste boş olup 200 ms sonra dolabiliyor. Tek bir
   * okuma yapsaydık oyuncu kurulu cüzdanını görmez, "cüzdan yok" ekranıyla
   * karşılaşırdı. Wallet Standard geç kaydolanları haber veriyor.
   */
  useEffect(() => {
    const tazele = () => setCuzdanlar(bulunanCuzdanlar());
    tazele();
    const birak = cuzdanlariIzle(tazele);
    const t = setTimeout(tazele, 600);
    return () => { birak(); clearTimeout(t); };
  }, []);

  const baglan = useCallback(async (c: Cuzdan) => {
    setErr(null);
    setBusy(true);
    try {
      await signInWithWallet(c, captcha ?? undefined);
      onDone();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'hata';
      // ⚠️ Kullanıcı imzayı reddettiyse bu bir HATA DEĞİL, bir karardır —
      // kırmızı bir uyarı göstermek onu yanlış bilgilendirir.
      setErr(/reject|denied|4001/i.test(code) ? null : 'baglanti');
      setBusy(false);
    }
  }, [captcha, onDone]);

  return {
    cuzdanlar, busy, err, setErr,
    needCaptcha: turnstileEnabled() && !captcha,
    setCaptcha, baglan,
  };
}
