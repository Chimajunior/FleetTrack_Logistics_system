# Authentication And Roles

FleetTrack now uses signed bearer tokens for API and WebSocket access.

## Seeded Admin

After running `npm run db:seed`, sign in with:

```text
Email: admin@fleettrack.local
Password: FleetTrack2026!
```

## Roles

- `ADMIN`: full operations access.
- `DISPATCHER`: dispatch, order assignment, status updates, tracking.
- `DRIVER`: reserved for the driver workflow API.

Current protected admin APIs accept `ADMIN` and `DISPATCHER`. Driver-scoped endpoints should use the `DRIVER` role in the next workflow slice.

## Token Flow

1. `POST /api/auth/login` validates email/password.
2. The API returns a signed token and safe user profile.
3. The frontend stores the token in `localStorage`.
4. HTTP requests send `Authorization: Bearer <token>`.
5. WebSocket connections send the token as `?token=<token>`.

Set `AUTH_TOKEN_SECRET` to a long random value outside local development.
