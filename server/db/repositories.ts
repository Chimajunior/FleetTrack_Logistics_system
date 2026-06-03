import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { prisma } from "./prisma";
import type {
  AssignmentSuggestion,
  DeliveryProofInput,
  DeliveryStatus,
  Driver,
  DriverAssignment,
  DriverStatus,
  ForecastPoint,
  NotificationItem,
  Order,
  OrderRoute,
  Priority,
  RoutePlan
} from "../../lib/types";
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

const apiAssignmentStatus: Record<string, DriverAssignment["status"]> = {
  OFFERED: "offered",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
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

type RoutePlanRecord = {
  id: string;
  orderId: string;
  driverId: string | null;
  encodedPolyline: string | null;
  distanceMeters: number | null;
  etaMinutes: number | null;
  provider: string;
  createdAt: Date;
};

type AssignmentSuggestionRecord = {
  orderId: string;
  suggestedDriverId: string | null;
  driverName: string | null;
  priority: string;
  distanceMeters: number | null;
  score: number;
};

type AssignmentRecord = {
  id: string;
  status: string;
  assignedAt: Date;
  acceptedAt: Date | null;
  rejectedAt?: Date | null;
  rejectionReason?: string | null;
  completedAt: Date | null;
  order: OrderRecord;
  driver: DriverRecord;
};

type CreateOrderInput = {
  id?: string;
  customer: string;
  phone: string;
  address: string;
  items: number;
  weightKg: number;
  priority: Priority;
  destination: {
    lat: number;
    lng: number;
  };
};

type CreateNotificationInput = {
  title: string;
  body: string;
  tone?: NotificationItem["tone"];
};

export async function listOrders(): Promise<Order[]> {
  const records = await prisma.order.findMany({
    orderBy: { placedAt: "desc" }
  });

  return records.map(mapOrder);
}

export async function checkDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  await client.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    await client.end();
  }
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const orderId = input.id ?? (await nextOrderId());

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        id: orderId,
        customer: input.customer,
        phone: input.phone,
        address: input.address,
        items: input.items,
        weightKg: input.weightKg,
        priority: input.priority.toUpperCase() as "STANDARD" | "EXPRESS" | "CRITICAL",
        status: prismaStatus.placed,
        destinationLat: input.destination.lat,
        destinationLng: input.destination.lng
      }
    });

    await tx.$executeRaw`
      UPDATE orders
      SET destination_point = ST_SetSRID(ST_MakePoint(${input.destination.lng}, ${input.destination.lat}), 4326)::geography
      WHERE id = ${orderId}
    `;

    await tx.deliveryStatusEvent.create({
      data: {
        orderId,
        status: prismaStatus.placed,
        note: "Order created"
      }
    });

    return created;
  });

  return mapOrder(order);
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

export async function createNotification(input: CreateNotificationInput): Promise<NotificationItem> {
  const tone = input.tone ?? "info";
  const record = await prisma.notification.create({
    data: {
      id: `NOT-${randomUUID()}`,
      title: input.title,
      body: input.body,
      tone: tone.toUpperCase() as "INFO" | "SUCCESS" | "WARNING"
    }
  });

  return mapNotification(record);
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

export async function listAssignmentSuggestions(): Promise<AssignmentSuggestion[]> {
  const records = await prisma.$queryRaw<AssignmentSuggestionRecord[]>`
    WITH ranked_candidates AS (
      SELECT
        o.id AS "orderId",
        d.id AS "suggestedDriverId",
        d.name AS "driverName",
        o.priority::text AS priority,
        ROUND(ST_Distance(d.latest_point, o.destination_point))::int AS "distanceMeters",
        ROW_NUMBER() OVER (
          PARTITION BY o.id
          ORDER BY ST_Distance(d.latest_point, o.destination_point), d.rating DESC, d.name ASC
        ) AS candidate_rank
      FROM orders o
      JOIN drivers d ON d.status = 'available'
      WHERE o.driver_id IS NULL
        AND o.status = 'placed'
        AND o.destination_point IS NOT NULL
        AND d.latest_point IS NOT NULL
    )
    SELECT
      "orderId",
      "suggestedDriverId",
      "driverName",
      priority,
      "distanceMeters",
      GREATEST(
        72,
        LEAST(
          98,
          ROUND(
            CASE priority
              WHEN 'critical' THEN 98
              WHEN 'express' THEN 94
              ELSE 90
            END - LEAST(18, "distanceMeters" / 750.0)
          )::int
        )
      ) AS score
    FROM ranked_candidates
    WHERE candidate_rank = 1
    ORDER BY
      CASE priority
        WHEN 'critical' THEN 1
        WHEN 'express' THEN 2
        ELSE 3
      END,
      "distanceMeters",
      "orderId"
  `;

  return records.map((record) => ({
    orderId: record.orderId,
    suggestedDriverId: record.suggestedDriverId,
    score: record.score,
    distanceMeters: record.distanceMeters ?? undefined,
    reason: record.suggestedDriverId
      ? `${record.priority} order matched to ${record.driverName} ${formatMiles(record.distanceMeters)} from destination`
      : `${record.priority} order is waiting for an available driver`
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

export async function getDriverForUser(userId: string): Promise<Driver | null> {
  const driver = await prisma.driver.findUnique({
    where: { userId }
  });

  return driver ? mapDriver(driver) : null;
}

export async function listDriverAssignments(userId: string): Promise<DriverAssignment[]> {
  const driver = await prisma.driver.findUnique({
    where: { userId }
  });

  if (!driver) return [];

  const assignments = await prisma.deliveryAssignment.findMany({
    where: { driverId: driver.id },
    include: {
      order: true,
      driver: true
    },
    orderBy: { assignedAt: "desc" }
  });

  return assignments.map(mapAssignment);
}

export async function respondToDriverAssignment(userId: string, orderId: string, action: "accept" | "reject", reason?: string) {
  const driver = await prisma.driver.findUnique({
    where: { userId }
  });

  if (!driver) return null;

  const assignment = await prisma.deliveryAssignment.findFirst({
    where: {
      orderId,
      driverId: driver.id,
      status: "OFFERED"
    }
  });

  if (!assignment) return null;

  const result = await prisma.$transaction(async (tx) => {
    if (action === "reject") {
      const [updatedAssignment, updatedOrder, updatedDriver] = await Promise.all([
        tx.deliveryAssignment.update({
          where: { id: assignment.id },
          data: {
            status: "REJECTED",
            rejectedAt: new Date(),
            rejectionReason: reason ?? null
          },
          include: { order: true, driver: true }
        }),
        tx.order.update({
          where: { id: orderId },
          data: {
            status: prismaStatus.placed,
            driverId: null,
            etaMinutes: null
          }
        }),
        tx.driver.update({
          where: { id: driver.id },
          data: {
            status: prismaDriverStatus.available,
            activeOrderId: null,
            routeProgress: 0
          }
        })
      ]);

      await tx.deliveryStatusEvent.create({
        data: {
          orderId,
          status: prismaStatus.placed,
          note: reason ? `Driver rejected assignment: ${reason}` : "Driver rejected assignment",
          createdBy: userId
        }
      });

      return {
        assignment: updatedAssignment,
        order: updatedOrder,
        driver: updatedDriver
      };
    }

    const [updatedAssignment, updatedOrder, updatedDriver] = await Promise.all([
      tx.deliveryAssignment.update({
        where: { id: assignment.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date()
        },
        include: { order: true, driver: true }
      }),
      tx.order.update({
        where: { id: orderId },
        data: { status: prismaStatus.assigned }
      }),
      tx.driver.update({
        where: { id: driver.id },
        data: {
          status: prismaDriverStatus.assigned,
          activeOrderId: orderId,
          routeProgress: Math.max(driver.routeProgress, 8)
        }
      })
    ]);

    await tx.deliveryStatusEvent.create({
      data: {
        orderId,
        status: prismaStatus.assigned,
        note: "Driver accepted assignment",
        createdBy: userId
      }
    });

    return {
      assignment: updatedAssignment,
      order: updatedOrder,
      driver: updatedDriver
    };
  });

  return {
    assignment: mapAssignment(result.assignment),
    order: mapOrder(result.order),
    driver: mapDriver(result.driver)
  };
}

export async function updateDriverDeliveryStatus(
  userId: string,
  orderId: string,
  status: Extract<DeliveryStatus, "picked_up" | "in_transit" | "delayed" | "delivered">,
  proof?: DeliveryProofInput
) {
  const driver = await prisma.driver.findUnique({
    where: { userId }
  });

  if (!driver) return null;

  const assignment = await prisma.deliveryAssignment.findFirst({
    where: {
      orderId,
      driverId: driver.id,
      status: { in: ["ACCEPTED", "COMPLETED"] }
    }
  });

  if (!assignment) return null;

  const result = await prisma.$transaction(async (tx) => {
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        status: prismaStatus[status],
        deliveredAt: status === "delivered" ? new Date() : undefined,
        etaMinutes: status === "delivered" ? null : undefined
      }
    });

    const updatedDriver = await tx.driver.update({
      where: { id: driver.id },
      data:
        status === "delivered"
          ? {
              status: prismaDriverStatus.available,
              activeOrderId: null,
              routeProgress: 0
            }
          : {
              status: prismaDriverStatus.assigned,
              activeOrderId: orderId,
              routeProgress: nextProgress(status, driver.routeProgress)
            }
    });

    const updatedAssignment = await tx.deliveryAssignment.update({
      where: { id: assignment.id },
      data:
        status === "delivered"
          ? {
              status: "COMPLETED",
              completedAt: new Date()
            }
          : {},
      include: {
        order: true,
        driver: true
      }
    });

    if (status === "delivered") {
      await tx.deliveryProof.upsert({
        where: { orderId },
        update: {
          driverId: driver.id,
          recipientName: proof?.recipientName,
          signatureUrl: proof?.signatureUrl,
          photoUrl: proof?.photoUrl,
          notes: proof?.notes,
          deliveredLat: proof?.deliveredLat,
          deliveredLng: proof?.deliveredLng,
          deliveredAt: new Date()
        },
        create: {
          orderId,
          driverId: driver.id,
          recipientName: proof?.recipientName,
          signatureUrl: proof?.signatureUrl,
          photoUrl: proof?.photoUrl,
          notes: proof?.notes,
          deliveredLat: proof?.deliveredLat,
          deliveredLng: proof?.deliveredLng
        }
      });
    }

    await tx.deliveryStatusEvent.create({
      data: {
        orderId,
        status: prismaStatus[status],
        note: proof?.notes,
        createdBy: userId
      }
    });

    return {
      assignment: updatedAssignment,
      order: updatedOrder,
      driver: updatedDriver
    };
  });

  return {
    assignment: mapAssignment(result.assignment),
    order: mapOrder(result.order),
    driver: mapDriver(result.driver)
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

export async function saveRoutePlan(plan: RoutePlan) {
  const result = await prisma.$transaction(async (tx) => {
    const [routePlan, order] = await Promise.all([
      tx.routePlan.create({
        data: {
          orderId: plan.orderId,
          driverId: plan.driverId,
          encodedPolyline: plan.encodedPolyline,
          distanceMeters: plan.distanceMeters,
          etaMinutes: plan.etaMinutes,
          provider: plan.provider,
          metadata: {
            source: plan.provider,
            generatedAt: new Date().toISOString()
          }
        }
      }),
      tx.order.update({
        where: { id: plan.orderId },
        data: {
          etaMinutes: plan.etaMinutes
        }
      })
    ]);

    return {
      routePlan,
      order
    };
  });

  return {
    routePlan: mapRoutePlan(result.routePlan),
    order: mapOrder(result.order)
  };
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

      const location = await prisma.driverLocation.create({
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

      await prisma.$executeRaw`
        UPDATE driver_locations
        SET point = ST_SetSRID(ST_MakePoint(${nextLng}, ${nextLat}), 4326)::geography
        WHERE id = ${location.id}
      `;

      return updated;
    })
  );

  return updatedDrivers.map(mapDriver);
}

export async function getOrderRoute(orderId: string): Promise<OrderRoute | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      driver: true,
      routePlans: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
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
    },
    routePlan: order.routePlans[0] ? mapRoutePlan(order.routePlans[0]) : undefined
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

function mapRoutePlan(record: RoutePlanRecord): RoutePlan {
  return {
    id: record.id,
    orderId: record.orderId,
    driverId: record.driverId ?? undefined,
    encodedPolyline: record.encodedPolyline ?? undefined,
    distanceMeters: record.distanceMeters ?? 0,
    etaMinutes: record.etaMinutes ?? 0,
    provider: record.provider === "google-directions" ? "google-directions" : "internal-fallback",
    createdAt: record.createdAt.toISOString()
  };
}

function mapAssignment(record: AssignmentRecord): DriverAssignment {
  return {
    id: record.id,
    order: mapOrder(record.order),
    driver: mapDriver(record.driver),
    status: apiAssignmentStatus[record.status] ?? "offered",
    assignedAt: record.assignedAt.toISOString(),
    acceptedAt: record.acceptedAt?.toISOString(),
    rejectedAt: record.rejectedAt?.toISOString(),
    rejectionReason: record.rejectionReason ?? undefined,
    completedAt: record.completedAt?.toISOString()
  };
}

function nextProgress(status: DeliveryStatus, current: number) {
  if (status === "picked_up") return Math.max(current, 25);
  if (status === "in_transit") return Math.max(current, 50);
  if (status === "delayed") return Math.max(current, 50);
  return current;
}

function relativeMinutes(date: Date) {
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  return `${minutes} min`;
}

function formatMiles(distanceMeters: number | null) {
  if (distanceMeters == null) return "nearby";
  return `${(distanceMeters / 1609.34).toFixed(1)} mi`;
}

async function nextOrderId() {
  const year = new Date().getFullYear();
  const count = await prisma.order.count({
    where: {
      id: {
        startsWith: `ORD-${year}-`
      }
    }
  });

  return `ORD-${year}-${String(count + 1).padStart(3, "0")}`;
}
