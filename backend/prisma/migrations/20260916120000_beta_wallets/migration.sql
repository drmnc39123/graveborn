-- BETA CÜZDAN KAYDI — beta kapanış hediyesinin dayanağı.
--
-- 🔴 NİYE: hediye sözü "beta'da cüzdan bağlayıp oynayanlara" verildi ve o
-- bilginin tek kaynağı `Player` satırlarıydı; `betaSifirla()` ise TÜM oyuncu
-- satırlarını siliyor. Bu tablo sıfırlamadan sağ çıkar — `Player`a FK YOK.
--
-- ⚠️ YALNIZ TABLO + İNDEKS. Doldurma burada yapılmıyor: anlık görüntü
-- yönetici düğmesiyle ve sıfırlamanın kendi içinde alınıyor.
CREATE TABLE "BetaWallet" (
    "wallet" TEXT NOT NULL,
    "name" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "giftSentAt" TIMESTAMP(3),

    CONSTRAINT "BetaWallet_pkey" PRIMARY KEY ("wallet")
);

CREATE INDEX "BetaWallet_runs_idx" ON "BetaWallet"("runs");

CREATE INDEX "BetaWallet_giftSentAt_idx" ON "BetaWallet"("giftSentAt");
