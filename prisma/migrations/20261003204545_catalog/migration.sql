-- CreateEnum
CREATE TYPE "SizeUnit" AS ENUM ('G', 'ML', 'PIECE');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('PURCHASE', 'MANUAL');

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "address" TEXT,
    "logo_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "photo_path" TEXT,
    "size_value" INTEGER NOT NULL,
    "size_unit" "SizeUnit" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_observations" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "observed_at" DATE NOT NULL,
    "source" "PriceSource" NOT NULL,
    "purchase_item_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_alternatives" (
    "id" UUID NOT NULL,
    "product_a_id" UUID NOT NULL,
    "product_b_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_alternatives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_name_key_key" ON "stores"("name_key");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE UNIQUE INDEX "price_observations_purchase_item_id_key" ON "price_observations"("purchase_item_id");

-- CreateIndex
CREATE INDEX "price_observations_product_id_store_id_observed_at_idx" ON "price_observations"("product_id", "store_id", "observed_at");

-- CreateIndex
CREATE INDEX "price_observations_store_id_idx" ON "price_observations"("store_id");

-- CreateIndex
CREATE INDEX "product_alternatives_product_b_id_idx" ON "product_alternatives"("product_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_alternatives_product_a_id_product_b_id_key" ON "product_alternatives"("product_a_id", "product_b_id");

-- AddForeignKey
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_alternatives" ADD CONSTRAINT "product_alternatives_product_a_id_fkey" FOREIGN KEY ("product_a_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_alternatives" ADD CONSTRAINT "product_alternatives_product_b_id_fkey" FOREIGN KEY ("product_b_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
