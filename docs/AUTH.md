# Authentication And Roles

FleetTrack now uses signed bearer tokens for API and WebSocket access.

## Seeded Admin

After running `npm run db:seed`, sign in with:

```text
Email: admin@fleettrack.local
Password: FleetTrack2026!
```

Seeded driver logins use the driver id as the email prefix:

```text
Email: drv-01@fleettrack.local
Password: Driver2026!
```

The seed creates accounts for `drv-01` through `drv-06`.

## Driver API

Driver tokens can call:

- `GET /api/driver/me`
- `GET /api/driver/assignments`
- `POST /api/driver/assignments/:orderId/accept`
- `POST /api/driver/assignments/:orderId/reject`
- `PATCH /api/driver/orders/:orderId/status`

Valid driver delivery statuses are `picked_up`, `in_transit`, `delayed`, and `delivered`. `delivered` can include proof data:

```json
{
  "status": "delivered",
  "proof": {
    "recipientName": "Sarah Johnson",
    "photoUrl": "https://example.com/photo.jpg",
    "signatureUrl": "https://example.com/signature.png",
    "notes": "Left with front desk",
    "deliveredLat": 40.724,
    "deliveredLng": -73.991
  }
}
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
