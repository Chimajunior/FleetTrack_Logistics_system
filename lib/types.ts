export type DeliveryStatus =
  | "placed"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "delayed";

export type DriverStatus = "available" | "assigned" | "offline";

export type Priority = "standard" | "express" | "critical";

export type LatLng = {
  lat: number;
  lng: number;
};

export type Order = {
  id: string;
  customer: string;
  phone: string;
  address: string;
  items: number;
  weightKg: number;
  status: DeliveryStatus;
  priority: Priority;
  driverId?: string;
  placedAt: string;
  eta: string;
  destination: LatLng;
};

export type Driver = {
  id: string;
  name: string;
  initials: string;
  status: DriverStatus;
  vehicle: string;
  rating: number;
  activeOrderId?: string;
  location: LatLng;
  routeProgress: number;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  tone: "info" | "success" | "warning";
};

export type ForecastPoint = {
  label: string;
  orders: number;
};

export type AssignmentSuggestion = {
  orderId: string;
  suggestedDriverId: string | null;
  score: number;
  reason: string;
  distanceMeters?: number;
};

export type DriverAssignment = {
  id: string;
  order: Order;
  driver: Driver;
  status: "offered" | "accepted" | "rejected" | "completed" | "cancelled";
  assignedAt: string;
  acceptedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  completedAt?: string;
};

export type DeliveryProofInput = {
  recipientName?: string;
  signatureUrl?: string;
  photoUrl?: string;
  notes?: string;
  deliveredLat?: number;
  deliveredLng?: number;
};

export type RoutePlan = {
  id?: string;
  orderId: string;
  driverId?: string;
  encodedPolyline?: string;
  distanceMeters: number;
  etaMinutes: number;
  provider: "google-directions" | "internal-fallback";
  createdAt?: string;
};

export type OrderRoute = {
  orderId: string;
  driverId?: string;
  origin: LatLng;
  destination: LatLng;
  routePlan?: RoutePlan;
};
