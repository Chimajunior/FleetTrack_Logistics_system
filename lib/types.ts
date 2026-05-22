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
