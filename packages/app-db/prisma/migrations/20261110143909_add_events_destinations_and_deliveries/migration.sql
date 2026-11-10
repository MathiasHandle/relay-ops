-- CreateEnum
CREATE TYPE "EventDeliveryStatus" AS ENUM(
    'PENDING',
    'PROCESSING',
    'FAILED',
    'DELIVERED',
    'RETRY_SCHEDULED'
);

-- CreateEnum
CREATE TYPE "DeliveryAttemptStatus" AS ENUM('FAILED', 'DELIVERED', 'IN_PROGRESS');

-- CreateTable
CREATE TABLE
    "destination" (
        "id" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL,
        "deleted_at" TIMESTAMP(3),
        "human_readable_id" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
        "organization_id" TEXT NOT NULL,
        CONSTRAINT "destination_pkey" PRIMARY KEY ("id")
    );

-- CreateTable
CREATE TABLE
    "event" (
        "id" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "external_id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "payload" JSONB NOT NULL,
        "organization_id" TEXT NOT NULL,
        CONSTRAINT "event_pkey" PRIMARY KEY ("id")
    );

-- CreateTable
CREATE TABLE
    "delivery" (
        "id" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL,
        "status" "EventDeliveryStatus" NOT NULL DEFAULT 'PENDING',
        "organization_id" TEXT NOT NULL,
        "destination_id" TEXT NOT NULL,
        "event_id" TEXT NOT NULL,
        CONSTRAINT "delivery_pkey" PRIMARY KEY ("id")
    );

-- CreateTable
CREATE TABLE
    "delivery_attempt" (
        "id" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL,
        "finished_at" TIMESTAMP(3),
        "status" "DeliveryAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
        "response_code" INTEGER,
        "error" TEXT,
        "delivery_id" TEXT NOT NULL,
        CONSTRAINT "delivery_attempt_pkey" PRIMARY KEY ("id")
    );

-- CreateIndex
CREATE UNIQUE INDEX "destination_id_organization_id_key" ON "destination" ("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "destination_organization_id_human_readable_id_key" ON "destination" ("organization_id", "human_readable_id")
WHERE
    ("deleted_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "event_id_organization_id_key" ON "event" ("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_organization_id_external_id_key" ON "event" ("organization_id", "external_id");

-- CreateIndex
CREATE INDEX "delivery_destination_id_idx" ON "delivery" ("destination_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_event_id_destination_id_key" ON "delivery" ("event_id", "destination_id");

-- CreateIndex
CREATE INDEX "delivery_attempt_delivery_id_idx" ON "delivery_attempt" ("delivery_id");

-- AddForeignKey
ALTER TABLE "destination"
ADD CONSTRAINT "destination_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event"
ADD CONSTRAINT "event_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"
ADD CONSTRAINT "delivery_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"
ADD CONSTRAINT "delivery_destination_id_organization_id_fkey" FOREIGN KEY ("destination_id", "organization_id") REFERENCES "destination" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"
ADD CONSTRAINT "delivery_event_id_organization_id_fkey" FOREIGN KEY ("event_id", "organization_id") REFERENCES "event" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempt"
ADD CONSTRAINT "delivery_attempt_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "delivery" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A deleted destination must be disabled.
ALTER TABLE "destination"
ADD CONSTRAINT "destination_deleted_disabled_check" CHECK (
    deleted_at IS NULL
    OR enabled = FALSE
);

-- A finished attempt (DELIVERED or FAILED) has finished_at; an in-progress one does not.
ALTER TABLE "delivery_attempt"
ADD CONSTRAINT "delivery_attempt_finished_at_check" CHECK ((status = 'IN_PROGRESS') = (finished_at IS NULL));