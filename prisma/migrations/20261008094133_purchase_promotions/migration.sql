-- CreateEnum
CREATE TYPE "PromoKind" AS ENUM ('AMOUNT_OFF_PER_UNIT', 'PERCENT_OFF', 'NTH_PERCENT_OFF', 'BUY_GET_FREE');

-- AlterTable
ALTER TABLE "purchase_items" ADD COLUMN     "promo_amount_cents" INTEGER,
ADD COLUMN     "promo_buy" INTEGER,
ADD COLUMN     "promo_free" INTEGER,
ADD COLUMN     "promo_kind" "PromoKind",
ADD COLUMN     "promo_nth" INTEGER,
ADD COLUMN     "promo_percent" INTEGER;

-- Each kind has exactly its own parameters, in range. COALESCE: a NULL comparison must fail, not pass.
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_promo_check" CHECK (COALESCE(
  ("promo_kind" IS NULL
    AND num_nonnulls("promo_amount_cents", "promo_percent", "promo_nth", "promo_buy", "promo_free") = 0)
  OR ("promo_kind" = 'AMOUNT_OFF_PER_UNIT'
    AND "promo_amount_cents" > 0
    AND num_nonnulls("promo_percent", "promo_nth", "promo_buy", "promo_free") = 0)
  OR ("promo_kind" = 'PERCENT_OFF'
    AND "promo_percent" BETWEEN 1 AND 100
    AND num_nonnulls("promo_amount_cents", "promo_nth", "promo_buy", "promo_free") = 0)
  OR ("promo_kind" = 'NTH_PERCENT_OFF'
    AND "promo_nth" BETWEEN 2 AND 10
    AND "promo_percent" BETWEEN 1 AND 100
    AND num_nonnulls("promo_amount_cents", "promo_buy", "promo_free") = 0)
  OR ("promo_kind" = 'BUY_GET_FREE'
    AND "promo_buy" BETWEEN 1 AND 20
    AND "promo_free" BETWEEN 1 AND 20
    AND num_nonnulls("promo_amount_cents", "promo_percent", "promo_nth") = 0),
  FALSE
));
