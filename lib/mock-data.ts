import type { Driver, ForecastPoint, NotificationItem, Order } from "@/lib/types";

export const orders: Order[] = [
  {
    id: "ORD-2026-001",
    customer: "Sarah Johnson",
    phone: "+1 (555) 123-4567",
    address: "456 Oak Street, Apt 12B, Downtown",
    items: 3,
    weightKg: 2.5,
    status: "in_transit",
    priority: "express",
    driverId: "DRV-01",
    placedAt: "09:12",
    eta: "12 min",
    destination: { lat: 40.724, lng: -73.991 }
  },
  {
    id: "ORD-2026-002",
    customer: "Michael Chen",
    phone: "+1 (555) 234-5678",
    address: "321 Pine Avenue, Suite 500",
    items: 1,
    weightKg: 0.8,
    status: "assigned",
    priority: "standard",
    driverId: "DRV-03",
    placedAt: "09:31",
    eta: "28 min",
    destination: { lat: 40.733, lng: -73.976 }
  },
  {
    id: "ORD-2026-003",
    customer: "Amina Patel",
    phone: "+1 (555) 345-6789",
    address: "89 Market Lane, Warehouse Dock 4",
    items: 7,
    weightKg: 11.2,
    status: "picked_up",
    priority: "critical",
    driverId: "DRV-02",
    placedAt: "09:48",
    eta: "18 min",
    destination: { lat: 40.713, lng: -74.003 }
  },
  {
    id: "ORD-2026-004",
    customer: "Luis Garcia",
    phone: "+1 (555) 456-7890",
    address: "740 Cedar Road, West End",
    items: 2,
    weightKg: 1.4,
    status: "placed",
    priority: "standard",
    placedAt: "10:03",
    eta: "Unassigned",
    destination: { lat: 40.742, lng: -73.998 }
  },
  {
    id: "ORD-2026-005",
    customer: "Emily Ross",
    phone: "+1 (555) 567-8901",
    address: "18 River Street, North Pier",
    items: 5,
    weightKg: 4.1,
    status: "delayed",
    priority: "express",
    driverId: "DRV-04",
    placedAt: "08:44",
    eta: "42 min",
    destination: { lat: 40.706, lng: -73.986 }
  },
  {
    id: "ORD-2026-006",
    customer: "Noah Williams",
    phone: "+1 (555) 678-9012",
    address: "203 Birch Boulevard, Unit 9",
    items: 4,
    weightKg: 3.7,
    status: "delivered",
    priority: "standard",
    driverId: "DRV-05",
    placedAt: "08:22",
    eta: "Delivered",
    destination: { lat: 40.752, lng: -73.982 }
  }
];

export const drivers: Driver[] = [
  {
    id: "DRV-01",
    name: "Maya Stone",
    initials: "MS",
    status: "assigned",
    vehicle: "Van 14",
    rating: 4.9,
    activeOrderId: "ORD-2026-001",
    location: { lat: 40.719, lng: -73.996 },
    routeProgress: 68
  },
  {
    id: "DRV-02",
    name: "Theo Brooks",
    initials: "TB",
    status: "assigned",
    vehicle: "Bike 08",
    rating: 4.8,
    activeOrderId: "ORD-2026-003",
    location: { lat: 40.711, lng: -74.011 },
    routeProgress: 52
  },
  {
    id: "DRV-03",
    name: "Jae Kim",
    initials: "JK",
    status: "assigned",
    vehicle: "Car 22",
    rating: 4.7,
    activeOrderId: "ORD-2026-002",
    location: { lat: 40.736, lng: -73.986 },
    routeProgress: 24
  },
  {
    id: "DRV-04",
    name: "Priya Shah",
    initials: "PS",
    status: "assigned",
    vehicle: "Van 03",
    rating: 4.6,
    activeOrderId: "ORD-2026-005",
    location: { lat: 40.715, lng: -73.989 },
    routeProgress: 36
  },
  {
    id: "DRV-05",
    name: "Owen Clark",
    initials: "OC",
    status: "available",
    vehicle: "Bike 11",
    rating: 4.9,
    location: { lat: 40.728, lng: -73.981 },
    routeProgress: 0
  },
  {
    id: "DRV-06",
    name: "Nora Blake",
    initials: "NB",
    status: "offline",
    vehicle: "Car 17",
    rating: 4.5,
    location: { lat: 40.746, lng: -73.989 },
    routeProgress: 0
  }
];

export const notifications: NotificationItem[] = [
  {
    id: "NOT-01",
    title: "Route updated",
    body: "Maya Stone was rerouted around heavy traffic.",
    time: "2 min",
    tone: "info"
  },
  {
    id: "NOT-02",
    title: "Delivery confirmed",
    body: "ORD-2026-006 was delivered and signed by customer.",
    time: "12 min",
    tone: "success"
  },
  {
    id: "NOT-03",
    title: "Delay risk",
    body: "ORD-2026-005 ETA prediction moved beyond SLA.",
    time: "18 min",
    tone: "warning"
  }
];

export const demandForecast: ForecastPoint[] = [
  { label: "10a", orders: 38 },
  { label: "11a", orders: 44 },
  { label: "12p", orders: 62 },
  { label: "1p", orders: 57 },
  { label: "2p", orders: 73 },
  { label: "3p", orders: 69 }
];
