import { prisma } from "./prisma";
import type { DeliveryStatus, Driver, DriverStatus, ForecastPoint, NotificationItem, Order, Priority } from "../../lib/types";
import type { AuthUser } from "../auth/tokens";

const prismaStatus = {
  placed: "PLACED",
  assigned: "ASSIGNED",
  picked_up: "PICKED_UP",
  in_transit: "IN_TRANSIT",
  delivered: "DELIVERED",
  delayed: "DELAYED"
} as const;

const apiStatus: Record<string, DeliveryStatus> = {
  PLACED: "placed",
  ASSIGNED: "assigned",
  PICKED_UP: "picked_up",
  IN_TRANSIT: "in_transit",
  DELIVERED: "delivered",
  DELAYED: "delayed"
};

const prismaDriverStatus = {
  available: "AVAILABLE",
  assigned: "ASSIGNED",
  offline: "OFFLINE"
} as const;

const apiDriverStatus: Record<string, DriverStatus> = {
  AVAILABLE: "available",
  ASSIGNED: "assigned",
  OFFLINE: "offline"
};

const apiPriority: Record<string, Priority> = {
  STANDARD: "standard",
  EXPRESS: "express",
  CRITICAL: "critical"
};

type OrderRecord = {
  id: string;
  customer: string;
  phone: string;
  address: string;
  items: number;
  weightKg: number;
  status: string;
  priority: string;
  driverId: string | null;
  placedAt: Date;
  etaMinutes: number | null;
  destinationLat: number;
  destinationLng: number;
};

type DriverRecord = {
  id: string;
  name: string;
  initials: string;
  status: string;
  vehicle: string;
  rating: number;
  activeOrderId: string | null;
  latestLat: number;
  latestLng: number;
  routeProgress: number;
};

type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  tone: string;
  createdAt: Date;
};

type DemandForecastRecord = {
  window: string;
  orders: number;
};

export async function listOrders(): Promise<Order[]> {
  const records = await prisma.order.findMany({
    orderBy: { placedAt: "desc" }
  });

  return records.map(mapOrder);
}

export async function listDrivers(): Promise<Driver[]> {
  const records = await prisma.driver.findMany({
    orderBy: { name: "asc" }
  });

  return records.map(mapDriver);
}

export async function listNotifications(): Promise<NotificationItem[]> {
  const records = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return records.map(mapNotification);
}

export async function listDemandForecast(): Promise<ForecastPoint[]> {
  const records = await prisma.demandForecast.findMany({
    orderBy: { generatedAt: "asc" },
    take: 12
  });

  return records.map((record: DemandForecastRecord) => ({
    label: record.window,
    orders: record.orders
  }));
}

export async function findUserForLogin(email: string) {
  return prisma.user.findUnique({
    where: { email }
  });
}

export function mapAuthUser(user: { id: string; email: string; name: string; role: string }): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as AuthUser["role"]
  };
}

export async function assignOrder(orderId: string, driverId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const [order, driver] = await Promise.all([
      tx.order.findUnique({ where: { id: orderId } }),
      tx.driver.findUnique({ where: { id: driverId } })
    ]);

    if (!order || !driver) return null;

    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        driverId,
        status: prismaStatus.assigned,
        etaMinutes: 24
      }
    });

    const updatedDriver = await tx.driver.update({
      where: { id: driverId },
      data: {
        status: prismaDriverStatus.assigned,
        activeOrderId: orderId,
        routeProgress: Math.max(driver.routeProgress, 8)
      }
    });

    await tx.deliveryAssignment.create({
      data: {
        orderId,
        driverId,
        status: "OFFERED"
      }
    });

    await tx.deliveryStatusEvent.create({
      data: {
        orderId,
        status: prismaStatus.assigned,
        note: `Assigned to ${driver.name}`
      }
    });

    return {
      order: updatedOrder,
      driver: updatedDriver
    };
  });

  if (!result) return null;

  return {
    order: mapOrder(result.order),
    driver: mapDriver(result.driver)
  };
}

export async function updateStatus(orderId: string, status: DeliveryStatus) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return null;

    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        status: prismaStatus[status],
        deliveredAt: status === "delivered" ? new Date() : null,
        etaMinutes: status === "delivered" ? null : order.etaMinutes
      }
    });

    if (status === "delivered" && order.driverId) {
      await tx.driver.update({
        where: { id: order.driverId },
        data: {
          status: prismaDriverStatus.available,
          activeOrderId: null,
          routeProgress: 0
        }
      });

      await tx.deliveryAssignment.updateMany({
        where: { orderId, driverId: order.driverId, completedAt: null },
        data: {
          status: "COMPLETED",
          completedAt: new Date()
        }
      });
    }

    await tx.deliveryStatusEvent.create({
      data: {
        orderId,
        status: prismaStatus[status]
      }
    });

    return updatedOrder;
  });

  return result ? mapOrder(result) : null;
}

export async function tickDriverLocations(): Promise<Driver[]> {
  const assignedDrivers = await prisma.driver.findMany({
    where: { status: prismaDriverStatus.assigned }
  });

  const updatedDrivers = await Promise.all(
    assignedDrivers.map(async (driver: DriverRecord) => {
      const nextLat = Number((driver.latestLat + 0.00032).toFixed(6));
      const nextLng = Number((driver.latestLng + 0.00027).toFixed(6));

      const updated = await prisma.driver.update({
        where: { id: driver.id },
        data: {
          latestLat: nextLat,
          latestLng: nextLng,
          routeProgress: Math.min(99, driver.routeProgress + 2)
        }
      });

      await prisma.driverLocation.create({
        data: {
          driverId: driver.id,
          lat: nextLat,
          lng: nextLng
        }
      });

      // The typed client ignores unsupported PostGIS fields, so maintain them with raw SQL.
      await prisma.$executeRaw`
        UPDATE drivers
        SET latest_point = ST_SetSRID(ST_MakePoint(${nextLng}, ${nextLat}), 4326)::geography
        WHERE id = ${driver.id}
      `;

      return updated;
    })
  );

  return updatedDrivers.map(mapDriver);
}

export async function getOrderRoute(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { driver: true }
  });

  if (!order) return null;

  return {
    orderId: order.id,
    driverId: order.driver?.id,
    origin: order.driver
      ? {
          lat: order.driver.latestLat,
          lng: order.driver.latestLng
        }
      : { lat: 40.72, lng: -73.99 },
    destination: {
      lat: order.destinationLat,
      lng: order.destinationLng
    }
  };
}

function mapOrder(record: OrderRecord): Order {
  return {
    id: record.id,
    customer: record.customer,
    phone: record.phone,
    address: record.address,
    items: record.items,
    weightKg: record.weightKg,
    status: apiStatus[record.status] ?? "placed",
    priority: apiPriority[record.priority] ?? "standard",
    driverId: record.driverId ?? undefined,
    placedAt: record.placedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    eta: record.etaMinutes ? `${record.etaMinutes} min` : apiStatus[record.status] === "delivered" ? "Delivered" : "Unassigned",
    destination: {
      lat: record.destinationLat,
      lng: record.destinationLng
    }
  };
}

function mapDriver(record: DriverRecord): Driver {
  return {
    id: record.id,
    name: record.name,
    initials: record.initials,
    status: apiDriverStatus[record.status] ?? "offline",
    vehicle: record.vehicle,
    rating: record.rating,
    activeOrderId: record.activeOrderId ?? undefined,
    location: {
      lat: record.latestLat,
      lng: record.latestLng
    },
    routeProgress: record.routeProgress
  };
}

function mapNotification(record: NotificationRecord): NotificationItem {
  return {
    id: record.id,
    title: record.title,
    body: record.body,
    tone: record.tone.toLowerCase() as NotificationItem["tone"],
    time: relativeMinutes(record.createdAt)
  };
}

function relativeMinutes(date: Date) {
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  return `${minutes} min`;
}
