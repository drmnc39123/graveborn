-- THE LONG VIGIL sezon karti. Kart guc vermez; actigi yolun odulu kozmetik+toz.
ALTER TABLE "Player" ADD COLUMN "vigil" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Player" ADD COLUMN "vigilClaimed" JSONB NOT NULL DEFAULT '[]';
