CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE "user_role" AS ENUM ('ADMIN', 'DISPATCHER', 'DRIVER');
CREATE TYPE "delivery_status" AS ENUM ('placed', 'assigned', 'picked_up', 'in_transit', 'delivered', 'delayed');
CREATE TYPE "driver_status" AS ENUM ('available', 'assigned', 'offline');
CREATE TYPE "priority" AS ENUM ('standard', 'express', 'critical');
CREATE TYPE "notification_tone" AS ENUM ('info', 'success', 'warning');
CREATE TYPE "assignment_status" AS ENUM ('offered', 'accepted', 'rejected', 'completed', 'cancelled');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "user_role" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "drivers" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "name" TEXT NOT NULL,
  "initials" TEXT NOT NULL,
  "status" "driver_status" NOT NULL DEFAULT 'available',
  "vehicle" TEXT NOT NULL,
  "rating" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "capacity_kg" DOUBLE PRECISION,
  "active_order_id" TEXT,
  "latest_lat" DOUBLE PRECISION NOT NULL,
  "latest_lng" DOUBLE PRECISION NOT NULL,
  "latest_point" geography(Point,4326),
  "route_progress" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "driver_locations" (
  "id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "point" geography(Point,4326),
  "heading" DOUBLE PRECISION,
  "speed_kph" DOUBLE PRECISION,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
  "id" TEXT NOT NULL,
  "customer" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "items" INTEGER NOT NULL,
  "weight_kg" DOUBLE PRECISION NOT NULL,
  "status" "delivery_status" NOT NULL DEFAULT 'placed',
  "priority" "priority" NOT NULL DEFAULT 'standard',
  "driver_id" TEXT,
  "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eta_minutes" INTEGER,
  "delivered_at" TIMESTAMP(3),
  "destination_lat" DOUBLE PRECISION NOT NULL,
  "destination_lng" DOUBLE PRECISION NOT NULL,
  "destination_point" geography(Point,4326),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_assignments" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "status" "assignment_status" NOT NULL DEFAULT 'offered',
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_status_events" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "status" "delivery_status" NOT NULL,
  "note" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_status_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "tone" "notification_tone" NOT NULL DEFAULT 'info',
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "route_plans" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "driver_id" TEXT,
  "encoded_polyline" TEXT,
  "distance_meters" INTEGER,
  "eta_minutes" INTEGER,
  "provider" TEXT NOT NULL DEFAULT 'internal',
  "model_version" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "route_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demand_forecasts" (
  "id" TEXT NOT NULL,
  "window" TEXT NOT NULL,
  "orders" INTEGER NOT NULL,
  "predicted" INTEGER,
  "confidence" DOUBLE PRECISION,
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "demand_forecasts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");
CREATE UNIQUE INDEX "drivers_active_order_id_key" ON "drivers"("active_order_id");
CREATE INDEX "drivers_status_idx" ON "drivers"("status");
CREATE INDEX "drivers_latestLat_latestLng_idx" ON "drivers"("latest_lat", "latest_lng");
CREATE INDEX "driver_locations_driverId_recordedAt_idx" ON "driver_locations"("driver_id", "recorded_at");
CREATE INDEX "orders_status_idx" ON "orders"("status");
CREATE INDEX "orders_driverId_idx" ON "orders"("driver_id");
CREATE INDEX "orders_destinationLat_destinationLng_idx" ON "orders"("destination_lat", "destination_lng");
CREATE INDEX "delivery_assignments_orderId_idx" ON "delivery_assignments"("order_id");
CREATE INDEX "delivery_assignments_driverId_idx" ON "delivery_assignments"("driver_id");
CREATE INDEX "delivery_status_events_orderId_createdAt_idx" ON "delivery_status_events"("order_id", "created_at");
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("created_at");
CREATE INDEX "route_plans_orderId_createdAt_idx" ON "route_plans"("order_id", "created_at");
CREATE INDEX "demand_forecasts_generatedAt_idx" ON "demand_forecasts"("generated_at");

CREATE INDEX "drivers_latest_point_gix" ON "drivers" USING GIST ("latest_point");
CREATE INDEX "driver_locations_point_gix" ON "driver_locations" USING GIST ("point");
CREATE INDEX "orders_destination_point_gix" ON "orders" USING GIST ("destination_point");

ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_active_order_id_fkey" FOREIGN KEY ("active_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_status_events" ADD CONSTRAINT "delivery_status_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
