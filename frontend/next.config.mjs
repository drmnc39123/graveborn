/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * ⚠️ Konteynerde koşmak için. `standalone`, çalışma anında gereken
   * node_modules'ü tek klasöre topluyor — imaj küçülüyor ve `npm start`
   * yerine doğrudan `node server.js` çalışıyor.
   * `next dev`i ETKİLEMEZ, yalnız `next build` çıktısını değiştirir.
   */
  output: 'standalone',
};

export default nextConfig;
