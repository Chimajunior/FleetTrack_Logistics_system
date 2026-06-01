# FleetTrack Delivery System

FleetTrack is a Next.js and Express delivery operations dashboard with dispatch, driver tracking, route planning, authentication, and a PostgreSQL/PostGIS data model.

## Quick Start

Use Node from `.nvmrc`:

```bash
nvm use
npm install
```

Run the UI and API:

```bash
npm run dev:all
```

Open:

```text
http://localhost:3000
```

API checks:

```text
http://localhost:4000/health  # process is running
http://localhost:4000/ready   # database is reachable
```

If Postgres is not running, sign in with the seeded admin credentials and the UI falls back to local demo data:

```text
Email: admin@fleettrack.local
Password: FleetTrack2026!
```

The login screen also supports a driver demo workspace:

```text
Email: drv-01@fleettrack.local
Password: Driver2026!
```

## Database Mode

Start PostgreSQL/PostGIS and Redis:

```bash
docker compose up -d
```

Create and seed the database:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

The local database URL is:

```text
postgresql://fleettrack:fleettrack@localhost:5432/fleettrack
```

## Scripts

- `npm run dev`: Next.js UI on port `3000`
- `npm run dev:api`: Express API and WebSocket server on port `4000`
- `npm run dev:all`: UI and API together
- `npm run lint`: ESLint
- `npm run typecheck`: Next route types and TypeScript
- `npm run build`: production build
- `npm run db:generate`: Prisma client generation
- `npm run db:migrate`: Prisma migrations
- `npm run db:seed`: demo users, orders, drivers, notifications, and forecasts

## API Highlights

- `POST /api/auth/login`
- `GET /api/orders`
- `POST /api/orders`
- `POST /api/orders/:orderId/assign`
- `PATCH /api/orders/:orderId/status`
- `GET /api/drivers`
- `GET /api/notifications`
- `POST /api/notifications`
- `POST /api/routes/:orderId/optimize`
- `GET /api/driver/me`
- `GET /api/driver/assignments`
- `POST /api/driver/assignments/:orderId/accept`
- `POST /api/driver/assignments/:orderId/reject`
- `PATCH /api/driver/orders/:orderId/status`

## Notes

Prisma 7 requires Node `^20.19 || ^22.12 || >=24.0`. This project pins `22.12.0` in `.nvmrc`.

Google Maps is optional. Without `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, the dashboard renders a local visual tracking map.
