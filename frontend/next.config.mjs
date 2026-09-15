/** @type {import('next').NextConfig} */

/**
 * TEK KÖKEN — `www` her zaman çıplak alan adına yönlendirilir.
 *
 * 🔴 NİYE (ölçüldü, 2026-09-15): `https://www.playgraveborn.com` HİÇ
 * AÇILMIYORDU (curl: 000, bağlantı kurulamadı). `www` Namecheap'in "URL
 * Redirect" sunucusunu gösteriyordu ve orada `www` için SSL sertifikası
 * yoktu; Railway'de ikinci özel alan adı ise ücretli plan istiyordu.
 * Tarayıcılar artık varsayılan olarak `https` açtığı için X'te `www.` ile
 * paylaşılan bir bağlantı siteye ULAŞAMIYORDU.
 *
 * 🔴 NEDEN "İKİ ADRESTEN DE SUN" DEĞİL, YÖNLENDİRME: `localStorage`
 * KÖKENE ÖZEL. `www` ayrıca sunulsaydı demo kaydı ve cüzdan oturumu ikiye
 * bölünürdü — `www`'de oynayan oyuncu çıplak adreste kaydını boş görürdü
 * ve bunu "ilerlemem silindi" diye bildirirdi. Tek kurallı köken çıplak alan
 * adı; `layout.tsx`in `metadataBase`i de zaten onu gösteriyor.
 *
 * ⚠️ BU KURAL DNS DEĞİŞMEDEN ÖNCE CANLIDA OLMALI. `www` Railway'e
 * bağlandığı anda bu yönlendirme yoksa, arada geçen sürede `www` ayrı bir
 * köken olarak çalışır ve yukarıdaki bölünme yaşanır.
 *
 * ⚠️ 308 (`permanent`), 301 değil: yöntemi ve gövdeyi koruyor. Sorgu
 * dizesi Next tarafından OTOMATİK taşınıyor — `/s/<kod>` davet bağlantıları
 * ve parametreler yolda kaybolmuyor.
 *
 * Mühür: `src/game/domain.test.mts`.
 */
const KANONIK_ALAN = 'playgraveborn.com';

const nextConfig = {
  reactStrictMode: true,
  /**
   * ⚠️ Konteynerde koşmak için. `standalone`, çalışma anında gereken
   * node_modules'ü tek klasöre topluyor — imaj küçülüyor ve `npm start`
   * yerine doğrudan `node server.js` çalışıyor.
   * `next dev`i ETKİLEMEZ, yalnız `next build` çıktısını değiştirir.
   */
  output: 'standalone',

  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: `www.${KANONIK_ALAN}` }],
        destination: `https://${KANONIK_ALAN}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
