# Database Choice

FleetTrack should use PostgreSQL with PostGIS for the primary database.

PostgreSQL gives us strong relational integrity for orders, drivers, assignments, status history, users, notifications, and audit trails. PostGIS adds native geospatial queries for nearest-driver matching, service zones, delivery heatmaps, and route-aware filtering.

Redis remains part of the stack, but not as the source of truth. Use it for BullMQ jobs, WebSocket fan-out helpers, rate limits, and short-lived live-location cache entries.

## Suggested Tables

- `users`: admins, dispatchers, and driver app identities.
- `drivers`: profile, vehicle, capacity, current availability, rating.
- `driver_locations`: latest GPS point plus optional location history partitioned by time.
- `orders`: customer, address, package details, priority, SLA, current status.
- `delivery_assignments`: order-to-driver assignment lifecycle.
- `delivery_status_events`: append-only status timeline for customer/admin visibility.
- `notifications`: queued and delivered customer/admin messages.
- `route_plans`: optimized stop order, encoded polyline, distance, ETA, model metadata.
- `demand_forecasts`: forecast windows, predicted order count, confidence, generated-at time.

## Implementation Note

Use Prisma for normal relational reads/writes, and use raw SQL for PostGIS-heavy queries such as `ST_DWithin`, `ST_Distance`, and service-zone matching. That gives the app productive TypeScript models without giving up geospatial performance.

## Local Setup

Start infrastructure:

```bash
docker compose up -d
```

Create the schema and seed demo data:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Seeded admin login:

```text
Email: admin@fleettrack.local
Password: FleetTrack2026!
```

The development `DATABASE_URL` is:

```bash
postgresql://fleettrack:fleettrack@localhost:5432/fleettrack
```

Prisma 7 keeps the database URL in `prisma.config.ts`, while the runtime client uses the PostgreSQL adapter in `server/db/prisma.ts`.

The admin UI and API are now database-backed. If Postgres is not running or the database has not been migrated and seeded, login and operational API calls will fail.

Route plans are stored in `route_plans`. With `GOOGLE_MAPS_API_KEY` configured, the API stores Google Directions distance, duration, and encoded polyline data. Without a key, it stores an internal fallback estimate so development workflows still work.

Route planning happens when:

- an admin assigns a driver to an order;
- an admin calls `POST /api/routes/:orderId/optimize`;
- the frontend user clicks the Optimize action for a selected order.
