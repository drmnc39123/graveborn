-- CreateTable
CREATE TABLE "Player" (
    "wallet" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "unlockedStage" INTEGER NOT NULL DEFAULT 1,
    "hero" TEXT NOT NULL DEFAULT 'knight',
    "cleared" JSONB NOT NULL DEFAULT '{}',
    "firstClear" JSONB NOT NULL DEFAULT '{}',
    "depthPaid" JSONB NOT NULL DEFAULT '{}',
    "upgrades" JSONB NOT NULL DEFAULT '{}',
    "charms" JSONB NOT NULL DEFAULT '[]',
    "cosmetics" JSONB NOT NULL DEFAULT '[]',
    "equipped" JSONB NOT NULL DEFAULT '{}',
    "dust" INTEGER NOT NULL DEFAULT 0,
    "ossuary" INTEGER NOT NULL DEFAULT 0,
    "wager" JSONB,
    "achievements" JSONB NOT NULL DEFAULT '[]',
    "streak" JSONB NOT NULL DEFAULT '{}',
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "rev" INTEGER NOT NULL DEFAULT 0,
    "bestStage" INTEGER NOT NULL DEFAULT 0,
    "bestDepth" INTEGER NOT NULL DEFAULT 0,
    "bestRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seasonWeek" INTEGER NOT NULL DEFAULT 0,
    "seasonStage" INTEGER NOT NULL DEFAULT 0,
    "seasonDepth" INTEGER NOT NULL DEFAULT 0,
    "seasonRating" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("wallet")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "seed" BIGINT NOT NULL,
    "mode" TEXT NOT NULL,
    "stageId" INTEGER NOT NULL,
    "hero" TEXT NOT NULL,
    "startDepth" INTEGER NOT NULL DEFAULT 1,
    "ascension" INTEGER NOT NULL DEFAULT 0,
    "wagerStake" INTEGER NOT NULL DEFAULT 0,
    "wagerTarget" INTEGER NOT NULL DEFAULT 0,
    "wagerWon" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimedDepth" INTEGER,
    "claimedGold" INTEGER,
    "awarded" INTEGER,
    "awardedDepth" INTEGER,
    "capped" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "goldAmount" INTEGER NOT NULL,
    "priceGrave" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "buyer" TEXT,
    "paymentSig" TEXT,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "gold" INTEGER NOT NULL,
    "detail" TEXT,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldBoss" (
    "week" INTEGER NOT NULL,
    "bossId" TEXT NOT NULL,
    "hp" INTEGER NOT NULL,
    "maxHp" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldBoss_pkey" PRIMARY KEY ("week")
);

-- CreateTable
CREATE TABLE "BossDamage" (
    "id" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "wallet" TEXT NOT NULL,
    "damage" INTEGER NOT NULL DEFAULT 0,
    "runs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BossDamage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "wallet" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("wallet")
);

-- CreateTable
CREATE TABLE "SeasonClose" (
    "week" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "winners" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeasonClose_pkey" PRIMARY KEY ("week")
);

-- CreateTable
CREATE TABLE "SeasonAward" (
    "id" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "wallet" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "cosmetic" TEXT,
    "dust" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Player_bestRating_idx" ON "Player"("bestRating");

-- CreateIndex
CREATE INDEX "Player_seasonWeek_seasonRating_idx" ON "Player"("seasonWeek", "seasonRating");

-- CreateIndex
CREATE INDEX "Run_wallet_startedAt_idx" ON "Run"("wallet", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_paymentSig_key" ON "Listing"("paymentSig");

-- CreateIndex
CREATE INDEX "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_seller_status_idx" ON "Listing"("seller", "status");

-- CreateIndex
CREATE INDEX "Ledger_wallet_at_idx" ON "Ledger"("wallet", "at");

-- CreateIndex
CREATE INDEX "Ledger_kind_at_idx" ON "Ledger"("kind", "at");

-- CreateIndex
CREATE INDEX "BossDamage_week_damage_idx" ON "BossDamage"("week", "damage");

-- CreateIndex
CREATE UNIQUE INDEX "BossDamage_week_wallet_key" ON "BossDamage"("week", "wallet");

-- CreateIndex
CREATE INDEX "SeasonAward_wallet_week_idx" ON "SeasonAward"("wallet", "week");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonAward_week_wallet_key" ON "SeasonAward"("week", "wallet");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_seller_fkey" FOREIGN KEY ("seller") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonAward" ADD CONSTRAINT "SeasonAward_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

