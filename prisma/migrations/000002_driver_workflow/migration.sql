ALTER TABLE "delivery_assignments"
  ADD COLUMN "rejected_at" TIMESTAMP(3),
  ADD COLUMN "rejection_reason" TEXT;

CREATE TABLE "delivery_proofs" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "recipient_name" TEXT,
  "signature_url" TEXT,
  "photo_url" TEXT,
  "notes" TEXT,
  "delivered_lat" DOUBLE PRECISION,
  "delivered_lng" DOUBLE PRECISION,
  "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_proofs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_proofs_order_id_key" ON "delivery_proofs"("order_id");
CREATE INDEX "delivery_proofs_driver_id_delivered_at_idx" ON "delivery_proofs"("driver_id", "delivered_at");

ALTER TABLE "delivery_proofs"
  ADD CONSTRAINT "delivery_proofs_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_proofs"
  ADD CONSTRAINT "delivery_proofs_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
