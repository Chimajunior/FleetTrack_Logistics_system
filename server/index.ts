import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import http from "node:http";
import { WebSocketServer } from "ws";
import { requireAuth, type AuthenticatedRequest } from "./auth/middleware";
import { verifyPassword } from "./auth/password";
import { signToken, verifyToken } from "./auth/tokens";
import {
  assignOrder,
  checkDatabase,
  createNotification,
  createOrder,
  findUserForLogin,
  getOrderRoute,
  getDriverForUser,
  listAssignmentSuggestions,
  listDemandForecast,
  listDriverAssignments,
  listDrivers,
  listNotifications,
  listOrders,
  mapAuthUser,
  respondToDriverAssignment,
  saveRoutePlan,
  tickDriverLocations,
  updateDriverDeliveryStatus,
  updateStatus
} from "./db/repositories";
import { enqueueDispatch } from "./queues/deliveryQueue";
import { forecastDemand, predictEta } from "./services/ai";
import { planDeliveryRoute } from "./services/routing";
import type { DeliveryProofInput, DeliveryStatus } from "../lib/types";

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const port = Number(process.env.PORT ?? 4000);
const driverDeliveryStatuses = ["picked_up", "in_transit", "delayed", "delivered"] as const;

app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "fleettrack-api" });
});

app.get("/ready", async (_request, response) => {
  try {
    await checkDatabase();
    response.json({
      ok: true,
      service: "fleettrack-api",
      database: "ready"
    });
  } catch {
    response.status(503).json({
      ok: false,
      service: "fleettrack-api",
      database: "unavailable"
    });
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const { email, password } = request.body as { email?: string; password?: string };
    if (!email || !password) {
      response.status(400).json({ error: "email and password are required" });
      return;
    }

    const user = await findUserForLogin(email.toLowerCase());
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      response.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const safeUser = mapAuthUser(user);
    response.json({
      token: signToken(safeUser),
      user: safeUser
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/driver/me", requireAuth(["DRIVER"]), async (request, response, next) => {
  try {
    const driver = await getDriverForUser((request as AuthenticatedRequest).user.id);
    if (!driver) {
      response.status(404).json({ error: "Driver profile not found" });
      return;
    }

    response.json({ driver });
  } catch (error) {
    next(error);
  }
});

app.get("/api/driver/assignments", requireAuth(["DRIVER"]), async (request, response, next) => {
  try {
    const assignments = await listDriverAssignments((request as AuthenticatedRequest).user.id);
    response.json(assignments);
  } catch (error) {
    next(error);
  }
});

app.post("/api/driver/assignments/:orderId/accept", requireAuth(["DRIVER"]), async (request, response, next) => {
  try {
    const orderId = routeParam(request.params.orderId);
    const result = await respondToDriverAssignment((request as AuthenticatedRequest).user.id, orderId, "accept");
    if (!result) {
      response.status(404).json({ error: "Open assignment not found" });
      return;
    }

    broadcast({ type: "driver.assignment.accepted", ...result });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/driver/assignments/:orderId/reject", requireAuth(["DRIVER"]), async (request, response, next) => {
  try {
    const { reason } = request.body as { reason?: string };
    const orderId = routeParam(request.params.orderId);
    const rejectionReason = typeof reason === "string" ? reason.trim().slice(0, 180) : undefined;
    const result = await respondToDriverAssignment((request as AuthenticatedRequest).user.id, orderId, "reject", rejectionReason);
    if (!result) {
      response.status(404).json({ error: "Open assignment not found" });
      return;
    }

    broadcast({ type: "driver.assignment.rejected", ...result });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/driver/orders/:orderId/status", requireAuth(["DRIVER"]), async (request, response, next) => {
  try {
    const { status, proof } = request.body as {
      status?: DeliveryStatus;
      proof?: DeliveryProofInput;
    };

    if (!isDriverDeliveryStatus(status)) {
      response.status(400).json({ error: "valid driver delivery status is required" });
      return;
    }

    const orderId = routeParam(request.params.orderId);
    const result = await updateDriverDeliveryStatus((request as AuthenticatedRequest).user.id, orderId, status, proof);
    if (!result) {
      response.status(404).json({ error: "Accepted assignment not found" });
      return;
    }

    broadcast({ type: "driver.delivery.status", ...result });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.use("/api", requireAuth(["ADMIN", "DISPATCHER"]));

app.get("/api/auth/me", (request, response) => {
  response.json({ user: (request as AuthenticatedRequest).user });
});

app.get("/api/orders", async (_request, response, next) => {
  try {
    response.json(await listOrders());
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders", async (request, response, next) => {
  try {
    const { id, customer, phone, address, items, weightKg, priority, destination } = request.body as {
      id?: string;
      customer?: string;
      phone?: string;
      address?: string;
      items?: number;
      weightKg?: number;
      priority?: string;
      destination?: { lat?: number; lng?: number };
    };

    if (
      !customer ||
      !phone ||
      !address ||
      typeof items !== "number" ||
      !Number.isFinite(items) ||
      typeof weightKg !== "number" ||
      !Number.isFinite(weightKg) ||
      !isPriority(priority) ||
      !destination ||
      typeof destination.lat !== "number" ||
      !Number.isFinite(destination.lat) ||
      typeof destination.lng !== "number" ||
      !Number.isFinite(destination.lng)
    ) {
      response.status(400).json({ error: "valid order details are required" });
      return;
    }

    const order = await createOrder({
      id,
      customer,
      phone,
      address,
      items,
      weightKg,
      priority,
      destination: {
        lat: destination.lat,
        lng: destination.lng
      }
    });

    broadcast({ type: "order.created", order });
    response.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

app.get("/api/drivers", async (_request, response, next) => {
  try {
    response.json(await listDrivers());
  } catch (error) {
    next(error);
  }
});

app.get("/api/notifications", async (_request, response, next) => {
  try {
    response.json(await listNotifications());
  } catch (error) {
    next(error);
  }
});

app.post("/api/notifications", async (request, response, next) => {
  try {
    const { title, body, tone } = request.body as {
      title?: string;
      body?: string;
      tone?: string;
    };

    if (!title || !body || (tone && !["info", "success", "warning"].includes(tone))) {
      response.status(400).json({ error: "valid notification details are required" });
      return;
    }

    const notification = await createNotification({
      title,
      body,
      tone: tone as "info" | "success" | "warning" | undefined
    });

    broadcast({ type: "notification.created", notification });
    response.status(201).json(notification);
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders/:orderId/assign", async (request, response, next) => {
  try {
    const { orderId } = request.params;
    const { driverId } = request.body as { driverId?: string };

    if (!driverId) {
      response.status(400).json({ error: "driverId is required" });
      return;
    }

    const result = await assignOrder(orderId, driverId);
    if (result.status === "not_found") {
      response.status(404).json({ error: result.message });
      return;
    }

    if (result.status !== "assigned") {
      response.status(409).json({ error: result.message });
      return;
    }

    const plannedRoute = await planAndPersistRoute(orderId, driverId);
    const payload = plannedRoute
      ? {
          ...result,
          order: plannedRoute.order,
          routePlan: plannedRoute.routePlan
        }
      : result;

    // Dispatch-side effects run through BullMQ so SMS/email/provider calls can retry safely.
    const queue = await enqueueDispatch({ orderId, driverId });
    broadcast({ type: "order.assigned", ...payload, queue });
    response.json({ ...payload, queue });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/orders/:orderId/status", async (request, response, next) => {
  try {
    const { orderId } = request.params;
    const { status } = request.body as { status?: DeliveryStatus };

    if (!status || !["placed", "assigned", "picked_up", "in_transit", "delivered", "delayed"].includes(status)) {
      response.status(400).json({ error: "valid status is required" });
      return;
    }

    const order = await updateStatus(orderId, status);
    if (!order) {
      response.status(404).json({ error: "Order not found" });
      return;
    }

    broadcast({ type: "order.status", order });
    response.json(order);
  } catch (error) {
    next(error);
  }
});

app.get("/api/ai/assignments", async (_request, response, next) => {
  try {
    response.json(await listAssignmentSuggestions());
  } catch (error) {
    next(error);
  }
});

app.get("/api/ai/eta/:orderId", async (request, response, next) => {
  try {
    const [orders, drivers] = await Promise.all([listOrders(), listDrivers()]);
    const order = orders.find((item) => item.id === request.params.orderId);
    if (!order) {
      response.status(404).json({ error: "Order not found" });
      return;
    }

    const driver = drivers.find((item) => item.id === order.driverId);
    response.json(predictEta(order, driver));
  } catch (error) {
    next(error);
  }
});

app.get("/api/ai/demand", async (_request, response, next) => {
  try {
    response.json(forecastDemand(await listDemandForecast()));
  } catch (error) {
    next(error);
  }
});

app.get("/api/demand-forecast", async (_request, response, next) => {
  try {
    response.json(await listDemandForecast());
  } catch (error) {
    next(error);
  }
});

app.get("/api/routes/:orderId", async (request, response, next) => {
  try {
    const route = await getOrderRoute(request.params.orderId);
    if (!route) {
      response.status(404).json({ error: "Order not found" });
      return;
    }

    response.json(route);
  } catch (error) {
    next(error);
  }
});

app.post("/api/routes/:orderId/optimize", async (request, response, next) => {
  try {
    const orderId = routeParam(request.params.orderId);
    const route = await getOrderRoute(orderId);
    if (!route) {
      response.status(404).json({ error: "Order not found" });
      return;
    }

    const planned = await planAndPersistRoute(orderId, route.driverId);
    if (!planned) {
      response.status(404).json({ error: "Route could not be planned" });
      return;
    }

    broadcast({ type: "route.optimized", ...planned });
    response.json(planned);
  } catch (error) {
    next(error);
  }
});

wss.on("connection", async (socket, request) => {
  try {
    const token = new URL(request.url ?? "/", "http://localhost").searchParams.get("token");
    if (!token || !verifyToken(token)) {
      socket.send(JSON.stringify({ type: "error", message: "Authentication required" }));
      socket.close(1008, "Authentication required");
      return;
    }

    socket.send(JSON.stringify({ type: "connected", drivers: await listDrivers() }));
  } catch (error) {
    socket.send(JSON.stringify({ type: "error", message: "Unable to load drivers" }));
    console.error(error);
  }
});

function broadcast(payload: unknown) {
  const serialized = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(serialized);
    }
  });
}

let telemetryErrorLogged = false;

// Broadcast driver telemetry as small events; clients merge these into their local driver state.
setInterval(async () => {
  if (wss.clients.size === 0) return;

  try {
    const drivers = await tickDriverLocations();
    telemetryErrorLogged = false;
    drivers
      .filter((driver) => driver.status === "assigned")
      .forEach((driver) => {
        broadcast({
          type: "driver.location",
          driverId: driver.id,
          location: driver.location,
          progress: driver.routeProgress
        });
      });
  } catch (error) {
    if (telemetryErrorLogged) return;
    telemetryErrorLogged = true;
    console.error("Failed to publish driver telemetry", error);
  }
}, 3000);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  void _next;
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

function routeParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function isDriverDeliveryStatus(status: DeliveryStatus | undefined): status is (typeof driverDeliveryStatuses)[number] {
  return Boolean(status && (driverDeliveryStatuses as readonly string[]).includes(status));
}

function isPriority(priority: string | undefined): priority is "standard" | "express" | "critical" {
  return Boolean(priority && ["standard", "express", "critical"].includes(priority));
}

async function planAndPersistRoute(orderId: string, driverId?: string) {
  const route = await getOrderRoute(orderId);
  if (!route) return null;

  const routePlan = await planDeliveryRoute({
    ...route,
    driverId: driverId ?? route.driverId
  });

  return saveRoutePlan(routePlan);
}

server.listen(port, () => {
  console.log(`FleetTrack API listening on http://localhost:${port}`);
});
