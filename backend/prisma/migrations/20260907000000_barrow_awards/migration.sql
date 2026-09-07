-- Barrow (haftalık ortak boss) haftalık ödül dağıtımı.
--
-- Hasar ZATEN kaydediliyordu ("BossDamage") ama hiçbir yerde ödenmiyordu:
-- haftalık kapanış derinlik puanına (seasonRating) göre sıralıyor ve boss
-- hasarı o puana hiç girmiyor. Bu iki tablo ödemeyi mümkün kılıyor.
--
-- "BossClose" ayrı bir tablo (SeasonClose/PvpClose emsali): üç sıralama
-- farklı ölçütlerle kapanıyor, biri gecikirse diğerleri beklememeli.

CREATE TABLE "BossClose" (
    "week" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "winners" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BossClose_pkey" PRIMARY KEY ("week")
);

CREATE TABLE "BossAward" (
    "id" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "wallet" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "cosmetic" TEXT,
    "dust" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BossAward_pkey" PRIMARY KEY ("id")
);

-- Aynı oyuncuya aynı haftadan iki ödül verilemez (çift ödeme kalkanı)
CREATE UNIQUE INDEX "BossAward_week_wallet_key" ON "BossAward"("week", "wallet");
CREATE INDEX "BossAward_wallet_idx" ON "BossAward"("wallet");
