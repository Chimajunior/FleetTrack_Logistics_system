import type { LatLng, RoutePlan } from "../../lib/types";

type RoutingInput = {
  orderId: string;
  driverId?: string;
  origin: LatLng;
  destination: LatLng;
};

type GoogleDirectionsResponse = {
  status: string;
  routes?: Array<{
    overview_polyline?: {
      points?: string;
    };
    legs?: Array<{
      distance?: {
        value?: number;
      };
      duration?: {
        value?: number;
      };
    }>;
  }>;
  error_message?: string;
};

export async function planDeliveryRoute(input: RoutingInput): Promise<RoutePlan> {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return fallbackRoute(input);

  const params = new URLSearchParams({
    origin: formatLatLng(input.origin),
    destination: formatLatLng(input.destination),
    mode: "driving",
    key
  });

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
    if (!response.ok) return fallbackRoute(input);

    const data = (await response.json()) as GoogleDirectionsResponse;
    const firstRoute = data.routes?.[0];
    const firstLeg = firstRoute?.legs?.[0];
    const distanceMeters = firstLeg?.distance?.value;
    const durationSeconds = firstLeg?.duration?.value;

    if (data.status !== "OK" || !distanceMeters || !durationSeconds) {
      return fallbackRoute(input);
    }

    return {
      orderId: input.orderId,
      driverId: input.driverId,
      encodedPolyline: firstRoute?.overview_polyline?.points,
      distanceMeters,
      etaMinutes: Math.max(1, Math.round(durationSeconds / 60)),
      provider: "google-directions"
    };
  } catch {
    return fallbackRoute(input);
  }
}

function fallbackRoute(input: RoutingInput): RoutePlan {
  const distanceMeters = Math.round(haversineMeters(input.origin, input.destination) * 1.24);
  const urbanMetersPerMinute = 500;

  return {
    orderId: input.orderId,
    driverId: input.driverId,
    distanceMeters,
    etaMinutes: Math.max(5, Math.round(distanceMeters / urbanMetersPerMinute) + 4),
    provider: "internal-fallback"
  };
}

function formatLatLng(point: LatLng) {
  return `${point.lat},${point.lng}`;
}

function haversineMeters(a: LatLng, b: LatLng) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const value =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
