import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { demandForecast, drivers, notifications, orders } from "../lib/mock-data";
import { hashPassword } from "../server/auth/password";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl
  })
});

const statusMap = {
  placed: "PLACED",
  assigned: "ASSIGNED",
  picked_up: "PICKED_UP",
  in_transit: "IN_TRANSIT",
  delivered: "DELIVERED",
  delayed: "DELAYED"
} as const;

const driverStatusMap = {
  available: "AVAILABLE",
  assigned: "ASSIGNED",
  offline: "OFFLINE"
} as const;

const priorityMap = {
  standard: "STANDARD",
  express: "EXPRESS",
  critical: "CRITICAL"
} as const;

const toneMap = {
  info: "INFO",
  success: "SUCCESS",
  warning: "WARNING"
} as const;

async function main() {
  const adminPasswordHash = await hashPassword("FleetTrack2026!");
  const driverPasswordHash = await hashPassword("Driver2026!");

  await prisma.user.upsert({
    where: { email: "admin@fleettrack.local" },
    update: {
      passwordHash: adminPasswordHash
    },
    create: {
      email: "admin@fleettrack.local",
      name: "John Doe",
      passwordHash: adminPasswordHash,
      role: "ADMIN"
    }
  });

  const driverUsers = new Map<string, string>();

  for (const driver of drivers) {
    const email = `${driver.id.toLowerCase()}@fleettrack.local`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: driver.name,
        passwordHash: driverPasswordHash,
        role: "DRIVER"
      },
      create: {
        email,
        name: driver.name,
        passwordHash: driverPasswordHash,
        role: "DRIVER"
      }
    });

    driverUsers.set(driver.id, user.id);
  }

  await prisma.$executeRaw`
    TRUNCATE TABLE
      delivery_proofs,
      route_plans,
      delivery_status_events,
      delivery_assignments,
      notifications,
      demand_forecasts,
      driver_locations,
      drivers,
      orders
    RESTART IDENTITY CASCADE
  `;

  for (const order of orders) {
    await prisma.order.upsert({
      where: { id: order.id },
      update: {
        customer: order.customer,
        phone: order.phone,
        address: order.address,
        items: order.items,
        weightKg: order.weightKg,
        status: statusMap[order.status],
        priority: priorityMap[order.priority],
        driverId: order.driverId,
        placedAt: seededTime(order.placedAt),
        etaMinutes: parseEta(order.eta),
        destinationLat: order.destination.lat,
        destinationLng: order.destination.lng
      },
      create: {
        id: order.id,
        customer: order.customer,
        phone: order.phone,
        address: order.address,
        items: order.items,
        weightKg: order.weightKg,
        status: statusMap[order.status],
        priority: priorityMap[order.priority],
        driverId: undefined,
        placedAt: seededTime(order.placedAt),
        etaMinutes: parseEta(order.eta),
        destinationLat: order.destination.lat,
        destinationLng: order.destination.lng
      }
    });

    await prisma.$executeRaw`
      UPDATE orders
      SET destination_point = ST_SetSRID(ST_MakePoint(${order.destination.lng}, ${order.destination.lat}), 4326)::geography
      WHERE id = ${order.id}
    `;
  }

  for (const driver of drivers) {
    await prisma.driver.upsert({
      where: { id: driver.id },
      update: {
        userId: driverUsers.get(driver.id),
        name: driver.name,
        initials: driver.initials,
        status: driverStatusMap[driver.status],
        vehicle: driver.vehicle,
        rating: driver.rating,
        activeOrderId: driver.activeOrderId,
        latestLat: driver.location.lat,
        latestLng: driver.location.lng,
        routeProgress: driver.routeProgress
      },
      create: {
        id: driver.id,
        userId: driverUsers.get(driver.id),
        name: driver.name,
        initials: driver.initials,
        status: driverStatusMap[driver.status],
        vehicle: driver.vehicle,
        rating: driver.rating,
        activeOrderId: driver.activeOrderId,
        latestLat: driver.location.lat,
        latestLng: driver.location.lng,
        routeProgress: driver.routeProgress
      }
    });

    await prisma.$executeRaw`
      UPDATE drivers
      SET latest_point = ST_SetSRID(ST_MakePoint(${driver.location.lng}, ${driver.location.lat}), 4326)::geography
      WHERE id = ${driver.id}
    `;

    const locationId = `${driver.id}-seed-location`;

    await prisma.driverLocation.upsert({
      where: { id: locationId },
      update: {
        lat: driver.location.lat,
        lng: driver.location.lng,
        heading: driver.routeProgress ? 62 : null,
        speedKph: driver.status === "assigned" ? 34 : 0
      },
      create: {
        id: locationId,
        driverId: driver.id,
        lat: driver.location.lat,
        lng: driver.location.lng,
        heading: driver.routeProgress ? 62 : null,
        speedKph: driver.status === "assigned" ? 34 : 0
      }
    });

    await prisma.$executeRaw`
      UPDATE driver_locations
      SET point = ST_SetSRID(ST_MakePoint(${driver.location.lng}, ${driver.location.lat}), 4326)::geography
      WHERE id = ${locationId}
    `;
  }

  await prisma.$executeRaw`
    UPDATE driver_locations
    SET point = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    WHERE point IS NULL
  `;

  await prisma.deliveryStatusEvent.deleteMany({
    where: {
      note: "Seeded operational status"
    }
  });

  for (const order of orders) {
    if (!order.driverId) continue;

    await prisma.order.update({
      where: { id: order.id },
      data: { driverId: order.driverId }
    });

    await prisma.deliveryAssignment.upsert({
      where: {
        id: `${order.id}-${order.driverId}`
      },
      update: {
        status: order.status === "delivered" ? "COMPLETED" : "ACCEPTED",
        completedAt: order.status === "delivered" ? new Date() : null
      },
      create: {
        id: `${order.id}-${order.driverId}`,
        orderId: order.id,
        driverId: order.driverId,
        status: order.status === "delivered" ? "COMPLETED" : "ACCEPTED",
        completedAt: order.status === "delivered" ? new Date() : null
      }
    });

    await prisma.deliveryStatusEvent.upsert({
      where: { id: `${order.id}-seed-status` },
      update: {
        status: statusMap[order.status],
        note: "Seeded operational status"
      },
      create: {
        id: `${order.id}-seed-status`,
        orderId: order.id,
        status: statusMap[order.status],
        note: "Seeded operational status"
      }
    });
  }

  for (const item of notifications) {
    await prisma.notification.upsert({
      where: { id: item.id },
      update: {
        title: item.title,
        body: item.body,
        tone: toneMap[item.tone]
      },
      create: {
        id: item.id,
        title: item.title,
        body: item.body,
        tone: toneMap[item.tone]
      }
    });
  }

  await prisma.demandForecast.deleteMany();

  for (const point of demandForecast) {
    await prisma.demandForecast.upsert({
      where: { id: `seed-demand-${slugify(point.label)}` },
      update: {
        window: point.label,
        orders: point.orders,
        predicted: Math.round(point.orders * 1.08),
        confidence: 0.86
      },
      create: {
        id: `seed-demand-${slugify(point.label)}`,
        window: point.label,
        orders: point.orders,
        predicted: Math.round(point.orders * 1.08),
        confidence: 0.86
      }
    });
  }
}

function seededTime(value: string) {
  const [hours = "9", minutes = "0"] = value.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date;
}

function parseEta(value: string) {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
