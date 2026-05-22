import type { Driver, ForecastPoint, Order } from "../../lib/types";

const priorityWeight = {
  critical: 3,
  express: 2,
  standard: 1
};

export function optimizeAssignments(orders: Order[], drivers: Driver[]) {
  const availableDrivers = drivers.filter((driver) => driver.status === "available");
  const unassignedOrders = orders
    .filter((order) => !order.driverId && order.status === "placed")
    .sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

  return unassignedOrders.map((order, index) => ({
    orderId: order.id,
    suggestedDriverId: availableDrivers[index % Math.max(availableDrivers.length, 1)]?.id ?? null,
    score: Math.max(72, 96 - index * 7),
    reason: `${order.priority} priority balanced against current fleet availability`
  }));
}

export function predictEta(order: Order, driver?: Driver) {
  const statusPenalty = order.status === "delayed" ? 18 : order.status === "placed" ? 12 : 0;
  const priorityBoost = order.priority === "critical" ? -5 : order.priority === "express" ? -3 : 0;
  const progressSavings = driver ? Math.round(driver.routeProgress / 5) : 0;
  const minutes = Math.max(5, 32 + statusPenalty + priorityBoost - progressSavings);

  return {
    orderId: order.id,
    etaMinutes: minutes,
    confidence: order.status === "delayed" ? 0.72 : 0.91
  };
}

export function forecastDemand(history: ForecastPoint[]) {
  const average = history.reduce((total, point) => total + point.orders, 0) / history.length;
  const peak = history.reduce((best, point) => (point.orders > best.orders ? point : best), history[0]);

  return {
    forecast: history.map((point, index) => ({
      ...point,
      predicted: Math.round(point.orders * (1.04 + index * 0.015))
    })),
    average: Math.round(average),
    peakWindow: peak.label
  };
}
