'use client';
// INSAN ZIYARETCIYI OYUNA GONDER — ISTEMCIDE.
//
// ⚠️ NIYE ISTEMCIDE: sunucu yonlendirmesi (307) tarayicilari da goturur ve
// onlar hedefin genel kartini gosterir; paylasimin kisisel tarafi tam da
// onu kurdugumuz yerde kaybolur. Tarayicilar JavaScript CALISTIRMAZ, yani
// bu yonlendirme yalniz INSANA uygulanir.
//
// ⚠️ KISA BIR BEKLEME VAR ve kasitli: ziyaretci ne icin tiklamis
// oldugunu (kim davet etti, hangi kod) bir an gorsun. Aninda atlamak,
// davetiyeyi hic gostermemekle ayni sey.

import { useEffect } from 'react';

export function Yonlendir({ kod }: { kod: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      // ⚠️ `replace`: geri tusu ziyaretciyi bu ara sayfaya DEGIL, geldigi
      // yere goturmeli. `href` kullansaydik geri tusu bir donguye girerdi.
      window.location.replace(`/?ref=${encodeURIComponent(kod)}`);
    }, 1200);
    return () => clearTimeout(t);
  }, [kod]);
  return null;
}
