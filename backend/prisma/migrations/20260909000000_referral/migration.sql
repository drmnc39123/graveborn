-- DAVET SISTEMI. Kod bir kimlik: iki oyuncuya ayni kod dusemez.
ALTER TABLE "Player" ADD COLUMN "refCode" TEXT;
ALTER TABLE "Player" ADD COLUMN "referredBy" TEXT;
ALTER TABLE "Player" ADD COLUMN "refRewarded" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Player_refCode_key" ON "Player"("refCode");
CREATE INDEX "Player_referredBy_idx" ON "Player"("referredBy");
