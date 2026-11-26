-- CreateEnum
CREATE TYPE "DeliveryOutboxStatus" AS ENUM ('PENDING', 'PUBLISHED');

-- CreateTable
CREATE TABLE "delivery_outbox" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "status" "DeliveryOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL,
    "last_error" TEXT,
    "delivery_id" TEXT NOT NULL,

    CONSTRAINT "delivery_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_outbox_delivery_id_key" ON "delivery_outbox"("delivery_id");

-- CreateIndex
CREATE INDEX "delivery_outbox_status_published_at_idx" ON "delivery_outbox"("status", "published_at");

-- CreateIndex
CREATE INDEX "delivery_outbox_status_next_attempt_at_idx" ON "delivery_outbox"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "delivery_outbox" ADD CONSTRAINT "delivery_outbox_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A published_at is set only when status is also set to PUBLISHED
ALTER TABLE "delivery_outbox"
ADD CONSTRAINT "delivery_outbox_correct_status" CHECK (
    (published_at IS NOT NULL
    AND status = 'PUBLISHED')
    OR
    (published_at IS NULL
    AND status = 'PENDING')
);

-- attempts_count is positive number or 0
ALTER TABLE "delivery_outbox"
ADD CONSTRAINT "delivery_outbox_non_negative_attempts_count" CHECK (
    attempts_count >= 0
);