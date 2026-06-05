"use client";

import {
  Bell,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Command,
  Gauge,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Navigation,
  PackageCheck,
  PackagePlus,
  RadioTower,
  Route,
  Search,
  Send,
  Sparkles,
  Truck,
  UserRoundCheck,
  UsersRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { demandForecast as seedForecast, drivers as seedDrivers, notifications as seedNotifications, orders as seedOrders } from "@/lib/mock-data";
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
  Priority,
  RoutePlan
} from "@/lib/types";

const statusLabels: Record<DeliveryStatus, string> = {
  placed: "Placed",
  assigned: "Assigned",
  picked_up: "Picked Up",
  in_transit: "In Transit",
  delivered: "Delivered",
  delayed: "Delayed"
};

const statusFlow: DeliveryStatus[] = ["placed", "assigned", "picked_up", "in_transit", "delivered"];
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const localDemoToken = "fleettrack-local-demo";
const localDriverDemoToken = "fleettrack-local-driver-demo";
const localDemoUser: AuthUser = {
  id: "local-admin",
  email: "admin@fleettrack.local",
  name: "John Doe",
  role: "ADMIN"
};
const localDriverDemoUser: AuthUser = {
  id: "local-driver",
  email: "drv-01@fleettrack.local",
  name: "Maya Stone",
  role: "DRIVER"
};
const localDriverId = "DRV-01";
const driverStatusFlow: Array<Extract<DeliveryStatus, "picked_up" | "in_transit" | "delayed" | "delivered">> = [
  "picked_up",
  "in_transit",
  "delayed",
  "delivered"
];
const rejectionReasons = ["Driver unavailable", "Vehicle capacity issue", "Route conflict"] as const;

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "DISPATCHER" | "DRIVER";
};

type DriverWorkflowResult = {
  assignment: DriverAssignment;
  order: Order;
  driver: Driver;
};

type OrderFormState = {
  customer: string;
  phone: string;
  address: string;
  items: string;
  weightKg: string;
  priority: Priority;
  destinationLat: string;
  destinationLng: string;
};

type CustomerUpdateFormState = {
  title: string;
  body: string;
  tone: NotificationItem["tone"];
};

type DashboardSection = "Dashboard" | "Orders" | "Drivers" | "Live Tracking" | "AI Ops";

const sectionCopy: Record<DashboardSection, string> = {
  Dashboard: "Orders, drivers, routes, and delivery risk in one live operations panel.",
  Orders: "Review the active order queue and assign dispatch-ready deliveries.",
  Drivers: "Monitor driver availability, route progress, and active workload.",
  "Live Tracking": "Track the selected driver and optimize the current delivery route.",
  "AI Ops": "Review assignment recommendations, demand forecasts, and customer updates."
};

const emptyOrderForm: OrderFormState = {
  customer: "",
  phone: "",
  address: "",
  items: "1",
  weightKg: "1",
  priority: "standard",
  destinationLat: "40.724",
  destinationLng: "-73.991"
};

const emptyCustomerUpdateForm: CustomerUpdateFormState = {
  title: "Customer update sent",
  body: "",
  tone: "success"
};

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function FleetMap({
  drivers,
  routePlan,
  selectedDriverId
}: {
  drivers: Driver[];
  routePlan?: RoutePlan;
  selectedDriverId?: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId) ?? drivers[0];

  useEffect(() => {
    if (!googleKey || !mapRef.current || !selectedDriver) return;
    const apiKey = googleKey;

    let cancelled = false;

    async function loadMap() {
      const { Loader } = await import("@googlemaps/js-api-loader");
      const loader = new Loader({ apiKey, version: "weekly" });
      const google = await loader.load();

      if (cancelled || !mapRef.current) return;

      const map = new google.maps.Map(mapRef.current, {
        center: selectedDriver.location,
        zoom: 14,
        disableDefaultUI: true,
        zoomControl: true,
        styles: [
          { featureType: "poi", stylers: [{ visibility: "off" }] },
          { featureType: "transit", stylers: [{ visibility: "off" }] }
        ]
      });

      drivers.forEach((driver) => {
        new google.maps.Marker({
          map,
          position: driver.location,
          title: driver.name
        });
      });

      if (routePlan?.encodedPolyline) {
        const path = decodePolyline(routePlan.encodedPolyline);
        const bounds = new google.maps.LatLngBounds();

        path.forEach((point) => bounds.extend(point));
        new google.maps.Polyline({
          map,
          path,
          strokeColor: "#0b82e6",
          strokeOpacity: 0.9,
          strokeWeight: 5
        });
        map.fitBounds(bounds, 48);
      }

      setMapLoaded(true);
    }

    loadMap().catch(() => setMapLoaded(false));

    return () => {
      cancelled = true;
    };
  }, [drivers, googleKey, routePlan, selectedDriver]);

  if (googleKey) {
    return (
      <div className="google-map-shell">
        <div ref={mapRef} className="google-map" />
        {!mapLoaded ? <div className="map-loading">Loading map</div> : null}
      </div>
    );
  }

  // Keep the dashboard useful in local development before a Google Maps key is configured.
  return (
    <div className="fleet-map" aria-label="Live driver map">
      <div className="map-grid" />
      <div className="route-line route-line-a" />
      <div className="route-line route-line-b" />
      <div className="route-line route-line-c" />
      <div className="zone zone-a">Downtown</div>
      <div className="zone zone-b">North Pier</div>
      {drivers.slice(0, 5).map((driver, index) => (
        <button
          className={cx("driver-pin", selectedDriverId === driver.id && "driver-pin-active")}
          style={{ left: `${18 + index * 15}%`, top: `${62 - index * 9}%` }}
          key={driver.id}
          title={driver.name}
        >
          <Truck size={14} />
        </button>
      ))}
      <div className="destination-pin">
        <MapPin size={18} />
      </div>
      {routePlan ? (
        <div className="route-summary">
          <strong>{routePlan.etaMinutes} min</strong>
          <span>{(routePlan.distanceMeters / 1609.34).toFixed(1)} mi · {routePlan.provider === "google-directions" ? "Google" : "Estimate"}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>(seedOrders);
  const [drivers, setDrivers] = useState<Driver[]>(seedDrivers);
  const [notifications, setNotifications] = useState<NotificationItem[]>(seedNotifications);
  const [forecast, setForecast] = useState<ForecastPoint[]>(seedForecast);
  const [assignmentSuggestions, setAssignmentSuggestions] = useState<AssignmentSuggestion[]>(
    createLocalAssignmentSuggestions(seedOrders, seedDrivers)
  );
  const [routePlan, setRoutePlan] = useState<RoutePlan | undefined>();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [assigningSuggestionId, setAssigningSuggestionId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState(seedOrders[0]?.id);
  const [selectedDriverId, setSelectedDriverId] = useState(seedDrivers[0]?.id);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<DashboardSection>("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [wsStatus, setWsStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [driverProfile, setDriverProfile] = useState<Driver | null>(null);
  const [driverAssignments, setDriverAssignments] = useState<DriverAssignment[]>([]);
  const [driverNotice, setDriverNotice] = useState("");
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [orderForm, setOrderForm] = useState<OrderFormState>(emptyOrderForm);
  const [orderFormError, setOrderFormError] = useState("");
  const [orderFormPending, setOrderFormPending] = useState(false);
  const [customerUpdateDialogOpen, setCustomerUpdateDialogOpen] = useState(false);
  const [customerUpdateForm, setCustomerUpdateForm] = useState<CustomerUpdateFormState>(emptyCustomerUpdateForm);
  const [customerUpdateError, setCustomerUpdateError] = useState("");
  const [customerUpdatePending, setCustomerUpdatePending] = useState(false);

  const refreshLiveAssignmentSuggestions = useCallback(async (authToken: string) => {
    if (isLocalDemoToken(authToken) || isLocalDriverDemoToken(authToken)) return;

    try {
      const suggestions = await apiRequest<AssignmentSuggestion[]>("/api/ai/assignments", authToken);
      setAssignmentSuggestions(suggestions);
    } catch {
      // Assignment is already reflected in order state; keep the current list if refresh is unavailable.
    }
  }, []);

  useEffect(() => {
    const savedToken = window.localStorage.getItem("fleettrack_token");
    if (!savedToken) {
      setAuthReady(true);
      return;
    }

    if (isLocalDemoToken(savedToken)) {
      setToken(savedToken);
      setUser(localDemoUser);
      setAuthReady(true);
      return;
    }

    if (isLocalDriverDemoToken(savedToken)) {
      setToken(savedToken);
      setUser(localDriverDemoUser);
      setAuthReady(true);
      return;
    }

    apiRequest<{ user: AuthUser }>("/api/auth/me", savedToken)
      .then(({ user }) => {
        setToken(savedToken);
        setUser(user);
      })
      .catch(() => {
        window.localStorage.removeItem("fleettrack_token");
      })
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (!token || user?.role === "DRIVER") return;
    const authToken = token;

    let cancelled = false;

    async function loadDashboard() {
      if (isLocalDemoToken(authToken)) {
        setOrders(seedOrders);
        setDrivers(seedDrivers);
        setNotifications(seedNotifications);
        setForecast(seedForecast);
        setAssignmentSuggestions(createLocalAssignmentSuggestions(seedOrders, seedDrivers));
        setLoadError("");
        return;
      }

      try {
        const [nextOrders, nextDrivers, nextNotifications, nextForecast, nextSuggestions] = await Promise.all([
          apiRequest<Order[]>("/api/orders", authToken),
          apiRequest<Driver[]>("/api/drivers", authToken),
          apiRequest<NotificationItem[]>("/api/notifications", authToken),
          apiRequest<ForecastPoint[]>("/api/demand-forecast", authToken),
          apiRequest<AssignmentSuggestion[]>("/api/ai/assignments", authToken)
        ]);

        if (cancelled) return;

        setOrders(nextOrders);
        setDrivers(nextDrivers);
        setNotifications(nextNotifications);
        setForecast(nextForecast);
        setAssignmentSuggestions(nextSuggestions);
        setSelectedOrderId((current) => current ?? nextOrders[0]?.id);
        setSelectedDriverId((current) => current ?? nextDrivers[0]?.id);
        setLoadError("");
      } catch {
        if (!cancelled) {
          setLoadError("Unable to load live API data. Check that Postgres is migrated, seeded, and the API server is running.");
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [token, user?.role]);

  useEffect(() => {
    if (!token || user?.role !== "DRIVER") return;
    const authToken = token;

    if (isLocalDriverDemoToken(authToken)) {
      setDriverProfile(seedDrivers.find((driver) => driver.id === localDriverId) ?? null);
      setDriverAssignments(createLocalDriverAssignments());
      setDriverNotice("");
      return;
    }

    let cancelled = false;

    async function loadDriverWorkspace() {
      try {
        const [{ driver }, assignments] = await Promise.all([
          apiRequest<{ driver: Driver }>("/api/driver/me", authToken),
          apiRequest<DriverAssignment[]>("/api/driver/assignments", authToken)
        ]);

        if (cancelled) return;

        setDriverProfile(driver);
        setDriverAssignments(assignments);
        setDriverNotice("");
      } catch {
        if (!cancelled) setDriverNotice("Unable to load live driver assignments. Check the API and database.");
      }
    }

    loadDriverWorkspace();

    return () => {
      cancelled = true;
    };
  }, [token, user?.role]);

  useEffect(() => {
    if (!token) {
      setWsStatus("offline");
      return;
    }

    const isLocalDemo = isLocalDemoToken(token) || isLocalDriverDemoToken(token);
    const url = process.env.NEXT_PUBLIC_WS_URL;
    let socket: WebSocket | undefined;

    if (!url || isLocalDemo) {
      setWsStatus("offline");
    } else {
      try {
        const wsUrl = new URL(url);
        wsUrl.searchParams.set("token", token);

        socket = new WebSocket(wsUrl.toString());
        socket.onopen = () => setWsStatus("live");
        socket.onerror = () => setWsStatus("offline");
        socket.onclose = () => setWsStatus("offline");
        socket.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.type === "connected") {
            setDrivers(payload.drivers);
            return;
          }

          if (payload.type === "order.assigned") {
            setOrders((current) => current.map((order) => (order.id === payload.order.id ? payload.order : order)));
            setDrivers((current) => current.map((driver) => (driver.id === payload.driver.id ? payload.driver : driver)));
            setAssignmentSuggestions((current) => current.filter((suggestion) => suggestion.orderId !== payload.order.id));
            void refreshLiveAssignmentSuggestions(token);
            setRoutePlan(payload.routePlan);
            return;
          }

          if (payload.type === "order.created") {
            setOrders((current) => [payload.order, ...current.filter((order) => order.id !== payload.order.id)]);
            setSelectedOrderId(payload.order.id);
            void refreshLiveAssignmentSuggestions(token);
            return;
          }

          if (payload.type === "notification.created") {
            setNotifications((current) => [payload.notification, ...current.filter((item) => item.id !== payload.notification.id)]);
            return;
          }

          if (payload.type === "route.optimized") {
            setOrders((current) => current.map((order) => (order.id === payload.order.id ? payload.order : order)));
            setRoutePlan(payload.routePlan);
            return;
          }

          if (payload.type === "order.status") {
            setOrders((current) => current.map((order) => (order.id === payload.order.id ? payload.order : order)));
            return;
          }

          if (payload.type !== "driver.location") return;

          setDrivers((current) =>
            current.map((driver) =>
              driver.id === payload.driverId ? { ...driver, location: payload.location, routeProgress: payload.progress } : driver
            )
          );
        };
      } catch {
        setWsStatus("offline");
      }
    }

    // The UI still animates without the API server, which keeps frontend work unblocked.
    const fallback = window.setInterval(() => {
      setDrivers((current) =>
        current.map((driver) =>
          driver.status === "assigned"
            ? {
                ...driver,
                routeProgress: Math.min(99, driver.routeProgress + 1),
                location: {
                  lat: driver.location.lat + 0.00035,
                  lng: driver.location.lng + 0.00028
                }
              }
            : driver
        )
      );
    }, 3500);

    return () => {
      socket?.close();
      window.clearInterval(fallback);
    };
  }, [refreshLiveAssignmentSuggestions, token]);

  useEffect(() => {
    if (!token || user?.role === "DRIVER" || !selectedOrderId || !isLocalDemoToken(token)) return;

    const order = orders.find((item) => item.id === selectedOrderId);
    const driver = drivers.find((item) => item.id === order?.driverId);
    setRoutePlan(order && driver ? createLocalRoutePlan(order, driver) : undefined);
  }, [drivers, orders, selectedOrderId, token, user?.role]);

  useEffect(() => {
    if (!token || user?.role === "DRIVER" || !selectedOrderId || isLocalDemoToken(token)) return;

    const authToken = token;
    let cancelled = false;

    apiRequest<{ routePlan?: RoutePlan }>(`/api/routes/${selectedOrderId}`, authToken)
      .then((route) => {
        if (!cancelled) setRoutePlan(route.routePlan);
      })
      .catch(() => {
        if (!cancelled) setRoutePlan(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedOrderId, token, user?.role]);

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return orders;

    return orders.filter((order) =>
      [order.id, order.customer, order.address, order.status].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [orders, query]);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? orders[0];
  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId) ?? drivers[0];
  const availableDrivers = drivers.filter((driver) => driver.status === "available");
  const inTransit = orders.filter((order) => order.status === "in_transit").length;
  const activeDrivers = drivers.filter((driver) => driver.status !== "offline").length;
  const deliveredToday = orders.filter((order) => order.status === "delivered").length + 155;
  const maxForecast = Math.max(1, ...forecast.map((item) => item.orders));
  const showMetrics = section === "Dashboard";
  const showOperations = section === "Dashboard" || section === "Orders";
  const showTracking = section === "Dashboard" || section === "Drivers" || section === "Live Tracking";
  const showInsights = section === "Dashboard" || section === "AI Ops";
  const canCreateOrder = section === "Dashboard" || section === "Orders";

  async function handleLogin(email: string, password: string) {
    setAuthError("");
    const isSeededDemoLogin = email.toLowerCase() === localDemoUser.email && password === "FleetTrack2026!";
    const isSeededDriverLogin = email.toLowerCase() === localDriverDemoUser.email && password === "Driver2026!";

    if (isSeededDemoLogin && !(await apiReady())) {
      signInToLocalDemo();
      return;
    }

    if (isSeededDriverLogin && !(await apiReady())) {
      signInToLocalDriverDemo();
      return;
    }

    try {
      const result = await apiRequest<{ token: string; user: AuthUser }>("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      window.localStorage.setItem("fleettrack_token", result.token);
      setToken(result.token);
      setUser(result.user);
    } catch {
      if (isSeededDemoLogin) {
        signInToLocalDemo();
        return;
      }

      if (isSeededDriverLogin) {
        signInToLocalDriverDemo();
        return;
      }

      setAuthError("Invalid credentials or API unavailable.");
    }
  }

  function signInToLocalDemo() {
    window.localStorage.setItem("fleettrack_token", localDemoToken);
    setToken(localDemoToken);
    setUser(localDemoUser);
  }

  function signInToLocalDriverDemo() {
    window.localStorage.setItem("fleettrack_token", localDriverDemoToken);
    setToken(localDriverDemoToken);
    setUser(localDriverDemoUser);
  }

  function handleLogout() {
    window.localStorage.removeItem("fleettrack_token");
    setToken(null);
    setUser(null);
    setWsStatus("offline");
  }

  async function assignDriver(orderId: string, driverId: string) {
    if (!token) return;

    if (isLocalDemoToken(token)) {
      assignDriverLocally(orderId, driverId);
      return;
    }

    try {
      const result = await apiRequest<{ order: Order; driver: Driver; routePlan?: RoutePlan }>(`/api/orders/${orderId}/assign`, token, {
        method: "POST",
        body: JSON.stringify({ driverId })
      });

      setOrders((current) => current.map((order) => (order.id === orderId ? result.order : order)));
      setDrivers((current) => current.map((driver) => (driver.id === driverId ? result.driver : driver)));
      setAssignmentSuggestions((current) => current.filter((suggestion) => suggestion.orderId !== orderId));
      setRoutePlan(result.routePlan);
      setSelectedOrderId(orderId);
      setSelectedDriverId(driverId);
      await refreshLiveAssignmentSuggestions(token);
      setLoadError("");
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setLoadError(error.message);
        return;
      }

      assignDriverLocally(orderId, driverId);
      setLoadError("Live API unavailable. Changes are being previewed locally.");
    }
  }

  async function assignSuggestedDriver(suggestion: AssignmentSuggestion) {
    if (!suggestion.suggestedDriverId || assigningSuggestionId) return;

    setAssigningSuggestionId(suggestion.orderId);
    try {
      await assignDriver(suggestion.orderId, suggestion.suggestedDriverId);
    } finally {
      setAssigningSuggestionId(null);
    }
  }

  async function optimizeSelectedRoute() {
    if (!token || !selectedOrder) return;

    const driver = drivers.find((item) => item.id === selectedOrder.driverId) ?? selectedDriver;
    if (isLocalDemoToken(token)) {
      setRoutePlan(createLocalRoutePlan(selectedOrder, driver));
      return;
    }

    try {
      const result = await apiRequest<{ order: Order; routePlan: RoutePlan }>(`/api/routes/${selectedOrder.id}/optimize`, token, {
        method: "POST"
      });

      setOrders((current) => current.map((order) => (order.id === selectedOrder.id ? result.order : order)));
      setRoutePlan(result.routePlan);
    } catch {
      setRoutePlan(createLocalRoutePlan(selectedOrder, driver));
      setLoadError("Live API unavailable. Route optimization is being previewed locally.");
    }
  }

  async function updateOrderStatus(orderId: string, status: DeliveryStatus) {
    if (!token) return;

    if (isLocalDemoToken(token)) {
      updateOrderStatusLocally(orderId, status);
      return;
    }

    try {
      const order = await apiRequest<Order>(`/api/orders/${orderId}/status`, token, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });

      setOrders((current) => current.map((item) => (item.id === orderId ? order : item)));
    } catch {
      updateOrderStatusLocally(orderId, status);
      setLoadError("Live API unavailable. Status changes are being previewed locally.");
    }
  }

  async function acceptDriverAssignment(orderId: string) {
    if (!token) return;

    if (isLocalDriverDemoToken(token)) {
      applyDriverWorkflowResult(acceptDriverAssignmentLocally(orderId));
      return;
    }

    try {
      const result = await apiRequest<DriverWorkflowResult>(`/api/driver/assignments/${orderId}/accept`, token, {
        method: "POST"
      });
      applyDriverWorkflowResult(result);
      setDriverNotice("");
    } catch {
      setDriverNotice("Unable to accept assignment from the live API.");
    }
  }

  async function rejectDriverAssignment(orderId: string, reason: string) {
    if (!token) return;

    if (isLocalDriverDemoToken(token)) {
      applyDriverWorkflowResult(rejectDriverAssignmentLocally(orderId, reason));
      return;
    }

    try {
      const result = await apiRequest<DriverWorkflowResult>(`/api/driver/assignments/${orderId}/reject`, token, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      applyDriverWorkflowResult(result);
      setDriverNotice("");
    } catch {
      setDriverNotice("Unable to reject assignment from the live API.");
    }
  }

  async function updateDriverOrderStatus(
    orderId: string,
    status: Extract<DeliveryStatus, "picked_up" | "in_transit" | "delayed" | "delivered">,
    proof?: DeliveryProofInput
  ) {
    if (!token) return;

    if (isLocalDriverDemoToken(token)) {
      applyDriverWorkflowResult(updateDriverOrderStatusLocally(orderId, status));
      return;
    }

    try {
      const result = await apiRequest<DriverWorkflowResult>(`/api/driver/orders/${orderId}/status`, token, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          proof: status === "delivered" ? proof : undefined
        })
      });
      applyDriverWorkflowResult(result);
      setDriverNotice("");
    } catch {
      setDriverNotice("Unable to update delivery status from the live API.");
    }
  }

  function applyDriverWorkflowResult(result: DriverWorkflowResult | null) {
    if (!result) return;

    setDriverAssignments((current) =>
      current.map((assignment) => (assignment.id === result.assignment.id ? result.assignment : assignment))
    );
    setOrders((current) => current.map((order) => (order.id === result.order.id ? result.order : order)));
    setDrivers((current) => current.map((driver) => (driver.id === result.driver.id ? result.driver : driver)));
    setDriverProfile(result.driver);
  }

  function openOrderDialog() {
    setOrderForm({
      ...emptyOrderForm,
      destinationLat: String(Number((40.72 + orders.length * 0.002).toFixed(6))),
      destinationLng: String(Number((-73.99 - orders.length * 0.002).toFixed(6)))
    });
    setOrderFormError("");
    setOrderDialogOpen(true);
  }

  async function submitOrderForm() {
    setOrderFormError("");

    const items = Number(orderForm.items);
    const weightKg = Number(orderForm.weightKg);
    const destinationLat = Number(orderForm.destinationLat);
    const destinationLng = Number(orderForm.destinationLng);

    if (!orderForm.customer.trim() || !orderForm.phone.trim() || !orderForm.address.trim()) {
      setOrderFormError("Customer, phone, and address are required.");
      return;
    }

    if (!Number.isFinite(items) || items < 1 || !Number.isInteger(items)) {
      setOrderFormError("Items must be a whole number greater than zero.");
      return;
    }

    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      setOrderFormError("Weight must be greater than zero.");
      return;
    }

    if (!Number.isFinite(destinationLat) || !Number.isFinite(destinationLng)) {
      setOrderFormError("Destination coordinates must be valid numbers.");
      return;
    }

    const sequence = String(orders.length + 1).padStart(3, "0");
    const id = `ORD-2026-${sequence}`;
    const order: Order = {
      id,
      customer: orderForm.customer.trim(),
      phone: orderForm.phone.trim(),
      address: orderForm.address.trim(),
      items,
      weightKg,
      status: "placed",
      priority: orderForm.priority,
      placedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
      eta: "Unassigned",
      destination: {
        lat: destinationLat,
        lng: destinationLng
      }
    };

    setOrderFormPending(true);

    if (!token || isLocalDemoToken(token)) {
      addOrderLocally(order);
      setOrderFormPending(false);
      setOrderDialogOpen(false);
      return;
    }

    try {
      const created = await apiRequest<Order>("/api/orders", token, {
        method: "POST",
        body: JSON.stringify({
          id: order.id,
          customer: order.customer,
          phone: order.phone,
          address: order.address,
          items: order.items,
          weightKg: order.weightKg,
          priority: order.priority,
          destination: order.destination
        })
      });
      addOrderLocally(created);
      setLoadError("");
      setOrderDialogOpen(false);
    } catch {
      addOrderLocally(order);
      setLoadError("Order creation is staged locally until the live create-order API is connected.");
      setOrderDialogOpen(false);
    } finally {
      setOrderFormPending(false);
    }
  }

  function openCustomerUpdateDialog() {
    if (!selectedOrder) return;

    setCustomerUpdateForm({
      title: "Customer update sent",
      body: `${selectedOrder.customer}, your delivery ${selectedOrder.id} is currently ${statusLabels[selectedOrder.status].toLowerCase()}.`,
      tone: selectedOrder.status === "delayed" ? "warning" : "success"
    });
    setCustomerUpdateError("");
    setCustomerUpdateDialogOpen(true);
  }

  async function submitCustomerUpdate() {
    if (!selectedOrder) return;
    setCustomerUpdateError("");

    if (!customerUpdateForm.title.trim() || !customerUpdateForm.body.trim()) {
      setCustomerUpdateError("Title and message are required.");
      return;
    }

    const notification: NotificationItem = {
      id: `LOCAL-NOT-${Date.now()}`,
      title: customerUpdateForm.title.trim(),
      body: customerUpdateForm.body.trim(),
      time: "now",
      tone: customerUpdateForm.tone
    };

    setCustomerUpdatePending(true);

    if (!token || isLocalDemoToken(token)) {
      addNotificationLocally(notification);
      setCustomerUpdatePending(false);
      setCustomerUpdateDialogOpen(false);
      return;
    }

    try {
      const created = await apiRequest<NotificationItem>("/api/notifications", token, {
        method: "POST",
        body: JSON.stringify({
          title: notification.title,
          body: notification.body,
          tone: notification.tone
        })
      });
      addNotificationLocally(created);
      setLoadError("");
      setCustomerUpdateDialogOpen(false);
    } catch {
      addNotificationLocally(notification);
      setLoadError("Live API unavailable. Customer notification is being previewed locally.");
      setCustomerUpdateDialogOpen(false);
    } finally {
      setCustomerUpdatePending(false);
    }
  }

  function addOrderLocally(order: Order) {
    setOrders((current) => [order, ...current.filter((item) => item.id !== order.id)]);
    setSelectedOrderId(order.id);
    setRoutePlan(undefined);
  }

  function addNotificationLocally(notification: NotificationItem) {
    setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)]);
  }

  function assignDriverLocally(orderId: string, driverId: string) {
    const order = orders.find((item) => item.id === orderId);
    const driver = drivers.find((item) => item.id === driverId);
    if (!order || !driver) return;

    if (!driverCanCarryOrder(driver, order)) {
      setLoadError("Driver capacity is too low for this order");
      return;
    }

    const updatedOrder = {
      ...order,
      driverId,
      status: "assigned" as DeliveryStatus,
      eta: order.eta === "Unassigned" ? "24 min" : order.eta
    };
    const updatedDriver = {
      ...driver,
      status: "assigned" as DriverStatus,
      activeOrderId: orderId,
      routeProgress: Math.max(driver.routeProgress, 8)
    };

    const nextOrders = orders.map((item) => (item.id === orderId ? updatedOrder : item));
    const nextDrivers = drivers.map((item) => (item.id === driverId ? updatedDriver : item));

    setOrders(nextOrders);
    setDrivers(nextDrivers);
    setAssignmentSuggestions(createLocalAssignmentSuggestions(nextOrders, nextDrivers));
    setRoutePlan(createLocalRoutePlan(updatedOrder, updatedDriver));
    setSelectedOrderId(orderId);
    setSelectedDriverId(driverId);
  }

  function updateOrderStatusLocally(orderId: string, status: DeliveryStatus) {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;

    const eta = status === "delivered" ? "Delivered" : order.eta === "Delivered" ? "12 min" : order.eta;
    setOrders((current) => current.map((item) => (item.id === orderId ? { ...item, status, eta } : item)));

    if (!order.driverId) return;

    setDrivers((current) =>
      current.map((driver) =>
        driver.id === order.driverId
          ? {
              ...driver,
              status: status === "delivered" ? "available" : "assigned",
              activeOrderId: status === "delivered" ? undefined : orderId,
              routeProgress: status === "delivered" ? 100 : Math.max(driver.routeProgress, statusProgress(status))
            }
          : driver
      )
    );
  }

  function acceptDriverAssignmentLocally(orderId: string): DriverWorkflowResult | null {
    const assignment = driverAssignments.find((item) => item.order.id === orderId);
    const driver = driverProfile ?? seedDrivers.find((item) => item.id === localDriverId);
    if (!assignment || !driver) return null;

    const order = {
      ...assignment.order,
      driverId: driver.id,
      status: "assigned" as DeliveryStatus,
      eta: assignment.order.eta === "Unassigned" ? "24 min" : assignment.order.eta
    };
    const nextDriver = {
      ...driver,
      status: "assigned" as DriverStatus,
      activeOrderId: order.id,
      routeProgress: Math.max(driver.routeProgress, 8)
    };
    const nextAssignment = {
      ...assignment,
      order,
      driver: nextDriver,
      status: "accepted" as DriverAssignment["status"],
      acceptedAt: new Date().toISOString()
    };

    return { assignment: nextAssignment, order, driver: nextDriver };
  }

  function rejectDriverAssignmentLocally(orderId: string, reason: string): DriverWorkflowResult | null {
    const assignment = driverAssignments.find((item) => item.order.id === orderId);
    const driver = driverProfile ?? seedDrivers.find((item) => item.id === localDriverId);
    if (!assignment || !driver) return null;

    const order = {
      ...assignment.order,
      driverId: undefined,
      status: "placed" as DeliveryStatus,
      eta: "Unassigned"
    };
    const nextDriver = {
      ...driver,
      status: "available" as DriverStatus,
      activeOrderId: undefined,
      routeProgress: 0
    };
    const nextAssignment = {
      ...assignment,
      order,
      driver: nextDriver,
      status: "rejected" as DriverAssignment["status"],
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason
    };

    return { assignment: nextAssignment, order, driver: nextDriver };
  }

  function updateDriverOrderStatusLocally(
    orderId: string,
    status: Extract<DeliveryStatus, "picked_up" | "in_transit" | "delayed" | "delivered">
  ): DriverWorkflowResult | null {
    const assignment = driverAssignments.find((item) => item.order.id === orderId);
    const driver = driverProfile ?? seedDrivers.find((item) => item.id === localDriverId);
    if (!assignment || !driver) return null;

    const order = {
      ...assignment.order,
      status,
      eta: status === "delivered" ? "Delivered" : assignment.order.eta === "Delivered" ? "12 min" : assignment.order.eta
    };
    const nextDriver = {
      ...driver,
      status: status === "delivered" ? ("available" as DriverStatus) : ("assigned" as DriverStatus),
      activeOrderId: status === "delivered" ? undefined : order.id,
      routeProgress: status === "delivered" ? 100 : Math.max(driver.routeProgress, statusProgress(status))
    };
    const nextAssignment = {
      ...assignment,
      order,
      driver: nextDriver,
      status: status === "delivered" ? ("completed" as DriverAssignment["status"]) : assignment.status,
      completedAt: status === "delivered" ? new Date().toISOString() : assignment.completedAt,
      rejectionReason: assignment.rejectionReason
    };

    return { assignment: nextAssignment, order, driver: nextDriver };
  }

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Orders", icon: Boxes },
    { label: "Drivers", icon: UsersRound },
    { label: "Live Tracking", icon: MapPin },
    { label: "AI Ops", icon: Sparkles }
  ] as const;

  if (!authReady) {
    return <div className="loading-screen">Loading FleetTrack</div>;
  }

  if (!token || !user) {
    return <LoginScreen error={authError} onLogin={handleLogin} />;
  }

  if (user.role === "DRIVER") {
    return (
      <DriverWorkspace
        assignments={driverAssignments}
        driver={driverProfile}
        notice={driverNotice}
        onAccept={acceptDriverAssignment}
        onReject={rejectDriverAssignment}
        onStatus={updateDriverOrderStatus}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className={cx("sidebar", !sidebarOpen && "sidebar-closed")}>
        <div className="brand-row">
          <div className="brand-icon">
            <Truck size={19} />
          </div>
          <span>FleetTrack</span>
          <button className="icon-button sidebar-toggle" onClick={() => setSidebarOpen(false)} aria-label="Collapse sidebar">
            <X size={18} />
          </button>
        </div>

        <nav className="side-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className={cx("nav-item", section === item.label && "active")} key={item.label} onClick={() => setSection(item.label)}>
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="operator-card">
          <div className="avatar">{initials(user.name)}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{user.role.toLowerCase()}</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          {!sidebarOpen ? (
            <button className="icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
              <Menu size={19} />
            </button>
          ) : null}

          <label className="global-search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search orders, drivers..." />
          </label>

          <div className="topbar-actions">
            <div className={cx("live-pill", wsStatus)}>
              <RadioTower size={15} />
              {wsStatus === "live" ? "Live" : wsStatus === "connecting" ? "Syncing" : "Local"}
            </div>
            <button className="icon-button notification-button" aria-label="Notifications">
              <Bell size={19} />
              <span>3</span>
            </button>
            <button className="profile-button">
              <span>{initials(user.name)}</span>
              <ChevronDown size={16} />
            </button>
            <button className="icon-button" onClick={handleLogout} aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className="content-grid">
          {loadError ? <div className="inline-alert">{loadError}</div> : null}

          <section className="page-heading">
            <div>
              <h1>{section}</h1>
              <p>{sectionCopy[section]}</p>
            </div>
            {canCreateOrder ? (
              <button className="primary-button" onClick={openOrderDialog}>
                <PackagePlus size={18} />
                New order
              </button>
            ) : null}
          </section>

          {showMetrics ? (
            <section className="metrics-grid" aria-label="Delivery metrics">
              <Metric title="Total Orders" value="1,284" note="+12.5% from last week" icon={<Boxes size={21} />} tone="blue" />
              <Metric title="In Transit" value={String(inTransit)} note="8 arriving soon" icon={<Truck size={21} />} tone="green" />
              <Metric title="Delivered Today" value={String(deliveredToday)} note="+8.2% from yesterday" icon={<CheckCircle2 size={21} />} tone="mint" />
              <Metric title="Active Drivers" value={String(activeDrivers)} note={`${drivers.length - activeDrivers} offline`} icon={<UsersRound size={21} />} tone="orange" />
            </section>
          ) : null}

          {showOperations ? (
            <section className="operations-layout">
              <div className="orders-panel panel">
                <div className="panel-header">
                  <div>
                    <h2>Orders</h2>
                    <p>{filteredOrders.length} orders found</p>
                  </div>
                  <label className="panel-search">
                    <Search size={16} />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search orders..." />
                  </label>
                </div>

                <div className="orders-table">
                  <div className="table-row table-head">
                    <span>Order ID</span>
                    <span>Customer</span>
                    <span>Delivery Address</span>
                    <span>Driver</span>
                    <span>Status</span>
                  </div>
                  {filteredOrders.map((order) => {
                    const driver = drivers.find((item) => item.id === order.driverId);
                    return (
                      <button
                        className={cx("table-row order-row", selectedOrder?.id === order.id && "selected")}
                        key={order.id}
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          if (driver) setSelectedDriverId(driver.id);
                        }}
                      >
                        <span className="order-cell">
                          <PackageCheck size={17} />
                          <span>
                            <strong>{order.id}</strong>
                            <small>
                              {order.items} items, {order.weightKg} kg
                            </small>
                          </span>
                        </span>
                        <span>
                          <strong>{order.customer}</strong>
                          <small>{order.phone}</small>
                        </span>
                        <span>{order.address}</span>
                        <span>{driver?.name ?? "Unassigned"}</span>
                        <span>
                          <StatusBadge status={order.status} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className="panel dispatch-panel">
                <div className="panel-header compact">
                  <div>
                    <h2>Dispatch</h2>
                    <p>{selectedOrder?.id}</p>
                  </div>
                  <Command size={19} />
                </div>

                {selectedOrder ? (
                  <>
                    <div className="detail-stack">
                      <Detail label="Customer" value={selectedOrder.customer} />
                      <Detail label="Address" value={selectedOrder.address} />
                      <Detail label="Priority" value={selectedOrder.priority} />
                      <Detail label="ETA" value={selectedOrder.eta} />
                    </div>

                    <label className="select-label">
                      Assign driver
                      <select
                        value={selectedOrder.driverId ?? ""}
                        onChange={(event) => event.target.value && assignDriver(selectedOrder.id, event.target.value)}
                      >
                        <option value="">Select driver</option>
                        {[...availableDrivers, ...drivers.filter((driver) => driver.id === selectedOrder.driverId)].map((driver) => {
                          const canCarryOrder = driverCanCarryOrder(driver, selectedOrder);
                          return (
                            <option disabled={!canCarryOrder} value={driver.id} key={driver.id}>
                              {driver.name} · {driver.vehicle} · {driverCapacityLabel(driver)}
                              {!canCarryOrder ? " · over capacity" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </label>

                    <div className="status-actions">
                      {statusFlow.map((status) => (
                        <button
                          key={status}
                          className={cx("status-button", selectedOrder.status === status && "status-button-active")}
                          onClick={() => updateOrderStatus(selectedOrder.id, status)}
                        >
                          {statusLabels[status]}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </aside>
            </section>
          ) : null}

          {showTracking ? (
            <section className="tracking-layout">
              <div className="panel map-panel">
                <div className="panel-header">
                  <div>
                    <h2>Live Tracking</h2>
                    <p>{selectedDriver?.name} · {selectedDriver?.vehicle}</p>
                  </div>
                  <button className="secondary-button" onClick={optimizeSelectedRoute}>
                    <Navigation size={17} />
                    Optimize
                  </button>
                </div>
                <FleetMap drivers={drivers} routePlan={routePlan} selectedDriverId={selectedDriver?.id} />
              </div>

              <div className="panel drivers-panel">
                <div className="panel-header compact">
                  <div>
                    <h2>Drivers</h2>
                    <p>{drivers.length} total</p>
                  </div>
                  <UserRoundCheck size={19} />
                </div>
                <div className="driver-list">
                  {drivers.map((driver) => (
                    <button
                      className={cx("driver-card", selectedDriver?.id === driver.id && "selected")}
                      key={driver.id}
                      onClick={() => setSelectedDriverId(driver.id)}
                    >
                      <span className="driver-avatar">{driver.initials}</span>
                      <span className="driver-copy">
                        <strong>{driver.name}</strong>
                        <small>{driver.vehicle} · {driver.rating.toFixed(1)} · {driverCapacityLabel(driver)}</small>
                        <span className="progress-bar">
                          <span style={{ width: `${driver.routeProgress}%` }} />
                        </span>
                      </span>
                      <DriverStatusBadge status={driver.status} />
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {showInsights ? (
            <section className="insights-layout">
              <div className="panel ai-panel">
                <div className="panel-header compact">
                  <div>
                    <h2>AI Operations</h2>
                    <p>Route, ETA, and demand predictions</p>
                  </div>
                  <Sparkles size={20} />
                </div>
                <div className="ai-grid">
                  <AiTile icon={<Route size={18} />} title="Route optimization" value="14.2 mi saved" />
                  <AiTile icon={<Clock3 size={18} />} title="ETA confidence" value="91%" />
                  <AiTile icon={<Gauge size={18} />} title="SLA risk" value="2 orders" />
                </div>
                <div className="suggestion-list">
                  {assignmentSuggestions.length ? (
                    assignmentSuggestions.slice(0, 3).map((suggestion) => {
                      const driver = drivers.find((item) => item.id === suggestion.suggestedDriverId);
                      const isAssigningSuggestion = assigningSuggestionId === suggestion.orderId;
                      return (
                        <article className="suggestion-card" data-testid={`assignment-suggestion-${suggestion.orderId}`} key={suggestion.orderId}>
                          <button
                            className="suggestion-select"
                            type="button"
                            onClick={() => {
                              setSelectedOrderId(suggestion.orderId);
                              if (suggestion.suggestedDriverId) setSelectedDriverId(suggestion.suggestedDriverId);
                            }}
                          >
                            <span>
                              <strong>{suggestion.orderId}</strong>
                              <small>{driver?.name ?? "Awaiting driver"}</small>
                            </span>
                            <span className="suggestion-score">{suggestion.score}</span>
                            <small>{suggestion.reason}</small>
                          </button>
                          <button
                            className="suggestion-action"
                            data-testid={`assign-suggestion-${suggestion.orderId}`}
                            type="button"
                            disabled={!suggestion.suggestedDriverId || isAssigningSuggestion}
                            onClick={() => assignSuggestedDriver(suggestion)}
                          >
                            <Send size={15} />
                            {isAssigningSuggestion ? "Assigning" : "Assign"}
                          </button>
                        </article>
                      );
                    })
                  ) : (
                    <div className="suggestion-empty">No open orders need assignment</div>
                  )}
                </div>
                <div className="forecast-chart">
                  {forecast.map((item) => (
                    <div className="forecast-bar" key={item.label}>
                      <span style={{ height: `${(item.orders / maxForecast) * 100}%` }} />
                      <small>{item.label}</small>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel notifications-panel">
                <div className="panel-header compact">
                  <div>
                    <h2>Notifications</h2>
                    <p>3 unread</p>
                  </div>
                  <Bell size={19} />
                </div>
                <div className="notification-list">
                  {notifications.map((item) => (
                    <div className={cx("notification-item", item.tone)} key={item.id}>
                      <span />
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.body}</p>
                        <small>{item.time} ago</small>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="wide-button" onClick={openCustomerUpdateDialog}>
                  <Send size={16} />
                  Send customer update
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </section>
      {orderDialogOpen ? (
        <OrderDialog
          error={orderFormError}
          form={orderForm}
          pending={orderFormPending}
          onChange={setOrderForm}
          onClose={() => {
            if (!orderFormPending) setOrderDialogOpen(false);
          }}
          onSubmit={submitOrderForm}
        />
      ) : null}
      {customerUpdateDialogOpen ? (
        <CustomerUpdateDialog
          error={customerUpdateError}
          form={customerUpdateForm}
          pending={customerUpdatePending}
          selectedOrder={selectedOrder}
          onChange={setCustomerUpdateForm}
          onClose={() => {
            if (!customerUpdatePending) setCustomerUpdateDialogOpen(false);
          }}
          onSubmit={submitCustomerUpdate}
        />
      ) : null}
    </main>
  );
}

function OrderDialog({
  error,
  form,
  pending,
  onChange,
  onClose,
  onSubmit
}: {
  error: string;
  form: OrderFormState;
  pending: boolean;
  onChange: (form: OrderFormState) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}) {
  function update<K extends keyof OrderFormState>(key: K, value: OrderFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="order-dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          await onSubmit();
        }}
      >
        <div className="modal-header">
          <div>
            <h2>New order</h2>
            <p>Create a dispatch-ready delivery.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close new order form">
            <X size={18} />
          </button>
        </div>

        <div className="order-form-grid">
          <label className="form-field wide">
            Customer
            <input value={form.customer} onChange={(event) => update("customer", event.target.value)} placeholder="Customer name" />
          </label>
          <label className="form-field">
            Phone
            <input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+1 (555) 010-2026" />
          </label>
          <label className="form-field">
            Priority
            <select value={form.priority} onChange={(event) => update("priority", event.target.value as Priority)}>
              <option value="standard">Standard</option>
              <option value="express">Express</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="form-field wide">
            Address
            <input value={form.address} onChange={(event) => update("address", event.target.value)} placeholder="Delivery address" />
          </label>
          <label className="form-field">
            Items
            <input min="1" step="1" type="number" value={form.items} onChange={(event) => update("items", event.target.value)} />
          </label>
          <label className="form-field">
            Weight kg
            <input min="0.1" step="0.1" type="number" value={form.weightKg} onChange={(event) => update("weightKg", event.target.value)} />
          </label>
          <label className="form-field">
            Latitude
            <input value={form.destinationLat} onChange={(event) => update("destinationLat", event.target.value)} />
          </label>
          <label className="form-field">
            Longitude
            <input value={form.destinationLng} onChange={(event) => update("destinationLng", event.target.value)} />
          </label>
        </div>

        {error ? <div className="login-error">{error}</div> : null}

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className="primary-button" disabled={pending}>
            {pending ? "Creating" : "Create order"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CustomerUpdateDialog({
  error,
  form,
  pending,
  selectedOrder,
  onChange,
  onClose,
  onSubmit
}: {
  error: string;
  form: CustomerUpdateFormState;
  pending: boolean;
  selectedOrder?: Order;
  onChange: (form: CustomerUpdateFormState) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}) {
  function update<K extends keyof CustomerUpdateFormState>(key: K, value: CustomerUpdateFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="order-dialog customer-update-dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          await onSubmit();
        }}
      >
        <div className="modal-header">
          <div>
            <h2>Customer update</h2>
            <p>{selectedOrder ? `${selectedOrder.id} · ${selectedOrder.customer}` : "Send an operational notification."}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close customer update form">
            <X size={18} />
          </button>
        </div>

        <div className="order-form-grid">
          <label className="form-field wide">
            Title
            <input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Update title" />
          </label>
          <label className="form-field wide">
            Message
            <textarea value={form.body} onChange={(event) => update("body", event.target.value)} placeholder="Customer-facing message" />
          </label>
          <label className="form-field">
            Tone
            <select value={form.tone} onChange={(event) => update("tone", event.target.value as NotificationItem["tone"])}>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
            </select>
          </label>
        </div>

        {error ? <div className="login-error">{error}</div> : null}

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className="primary-button" disabled={pending}>
            {pending ? "Sending" : "Send update"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DriverWorkspace({
  assignments,
  driver,
  notice,
  onAccept,
  onReject,
  onStatus,
  onLogout
}: {
  assignments: DriverAssignment[];
  driver: Driver | null;
  notice: string;
  onAccept: (orderId: string) => Promise<void>;
  onReject: (orderId: string, reason: string) => Promise<void>;
  onStatus: (orderId: string, status: (typeof driverStatusFlow)[number], proof?: DeliveryProofInput) => Promise<void>;
  onLogout: () => void;
}) {
  const [rejectionReasonByOrder, setRejectionReasonByOrder] = useState<Record<string, string>>({});
  const [proofByOrder, setProofByOrder] = useState<Record<string, { recipientName: string; notes: string }>>({});
  const activeAssignments = assignments.filter((assignment) => assignment.status !== "completed" && assignment.status !== "cancelled");
  const completedCount = assignments.filter((assignment) => assignment.status === "completed").length;
  const activeOrder = activeAssignments.find((assignment) => assignment.status === "accepted")?.order;

  return (
    <main className="driver-shell">
      <header className="driver-topbar">
        <div className="brand-row driver-brand">
          <div className="brand-icon">
            <Truck size={19} />
          </div>
          <span>FleetTrack Driver</span>
        </div>
        <button className="icon-button" onClick={onLogout} aria-label="Sign out">
          <LogOut size={18} />
        </button>
      </header>

      <section className="driver-hero">
        <div>
          <p>{driver?.vehicle ?? "Driver workspace"}</p>
          <h1>{driver?.name ?? "Driver"}</h1>
        </div>
        <DriverStatusBadge status={driver?.status ?? "offline"} />
      </section>

      <section className="driver-metrics">
        <Metric title="Open Assignments" value={String(activeAssignments.length)} note="Ready for action" icon={<PackageCheck size={21} />} tone="blue" />
        <Metric title="Active Order" value={activeOrder?.id ?? "None"} note={activeOrder?.eta ?? "No active ETA"} icon={<Navigation size={21} />} tone="green" />
        <Metric title="Completed" value={String(completedCount)} note="This session" icon={<CheckCircle2 size={21} />} tone="mint" />
      </section>

      {notice ? <div className="inline-alert">{notice}</div> : null}

      <section className="driver-assignment-list">
        {assignments.map((assignment) => (
          <article className="driver-assignment-card" key={assignment.id}>
            <div className="driver-assignment-main">
              <div>
                <span className="assignment-kicker">{assignment.status}</span>
                <h2>{assignment.order.id}</h2>
                <p>{assignment.order.customer}</p>
              </div>
              <StatusBadge status={assignment.order.status} />
            </div>

            <div className="detail-stack">
              <Detail label="Address" value={assignment.order.address} />
              <Detail label="Priority" value={assignment.order.priority} />
              <Detail label="ETA" value={assignment.order.eta} />
            </div>

            {assignment.status === "offered" ? (
              <div className="driver-actions">
                <label className="driver-reject-reason">
                  Reason
                  <select
                    value={rejectionReasonByOrder[assignment.order.id] ?? rejectionReasons[0]}
                    onChange={(event) =>
                      setRejectionReasonByOrder((current) => ({
                        ...current,
                        [assignment.order.id]: event.target.value
                      }))
                    }
                  >
                    {rejectionReasons.map((reason) => (
                      <option value={reason} key={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" onClick={() => onAccept(assignment.order.id)}>
                  <CheckCircle2 size={17} />
                  Accept
                </button>
                <button className="secondary-button" onClick={() => onReject(assignment.order.id, rejectionReasonByOrder[assignment.order.id] ?? rejectionReasons[0])}>
                  <X size={17} />
                  Reject
                </button>
              </div>
            ) : null}

            {assignment.status === "rejected" && assignment.rejectionReason ? (
              <div className="driver-rejection-note">Rejected: {assignment.rejectionReason}</div>
            ) : null}

            {assignment.status === "accepted" ? (
              <>
                <div className="driver-proof-grid">
                  <label>
                    Recipient
                    <input
                      value={proofByOrder[assignment.order.id]?.recipientName ?? assignment.order.customer}
                      onChange={(event) =>
                        setProofByOrder((current) => ({
                          ...current,
                          [assignment.order.id]: {
                            recipientName: event.target.value,
                            notes: current[assignment.order.id]?.notes ?? ""
                          }
                        }))
                      }
                      placeholder="Recipient name"
                    />
                  </label>
                  <label>
                    Notes
                    <input
                      value={proofByOrder[assignment.order.id]?.notes ?? ""}
                      onChange={(event) =>
                        setProofByOrder((current) => ({
                          ...current,
                          [assignment.order.id]: {
                            recipientName: current[assignment.order.id]?.recipientName ?? assignment.order.customer,
                            notes: event.target.value
                          }
                        }))
                      }
                      placeholder="Delivery notes"
                    />
                  </label>
                </div>
                <div className="driver-status-actions">
                  {driverStatusFlow.map((status) => {
                    const proof = proofByOrder[assignment.order.id] ?? {
                      recipientName: assignment.order.customer,
                      notes: ""
                    };
                    return (
                      <button
                        className={cx("status-button", assignment.order.status === status && "status-button-active")}
                        key={status}
                        onClick={() => onStatus(assignment.order.id, status, status === "delivered" ? proof : undefined)}
                      >
                        {statusLabels[status]}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {assignment.status === "completed" ? (
              <div className="driver-proof-note">Proof captured for {assignment.order.customer}</div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}

function LoginScreen({ error, onLogin }: { error: string; onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("admin@fleettrack.local");
  const [password, setPassword] = useState("FleetTrack2026!");
  const [pending, setPending] = useState(false);

  return (
    <main className="login-shell">
      <form
        className="login-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          await onLogin(email, password);
          setPending(false);
        }}
      >
        <div className="login-mark">
          <Truck size={22} />
        </div>
        <h1>FleetTrack</h1>
        <p>Sign in to manage dispatch, live tracking, and delivery operations.</p>

        <label className="login-field">
          <Mail size={17} />
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email" />
        </label>

        <label className="login-field">
          <Lock size={17} />
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" />
        </label>

        {error ? <div className="login-error">{error}</div> : null}

        <button className="primary-button login-button" disabled={pending}>
          {pending ? "Signing in" : "Sign in"}
        </button>

        <div className="login-shortcuts">
          <button
            type="button"
            onClick={() => {
              setEmail("admin@fleettrack.local");
              setPassword("FleetTrack2026!");
            }}
          >
            Dispatcher demo
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail("drv-01@fleettrack.local");
              setPassword("Driver2026!");
            }}
          >
            Driver demo
          </button>
        </div>
      </form>
    </main>
  );
}

function Metric({
  title,
  value,
  note,
  icon,
  tone
}: {
  title: string;
  value: string;
  note: string;
  icon: ReactNode;
  tone: "blue" | "green" | "mint" | "orange";
}) {
  return (
    <div className="metric-card">
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
      <div className={cx("metric-icon", tone)}>{icon}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: DeliveryStatus }) {
  return <span className={cx("status-badge", status)}>{statusLabels[status]}</span>;
}

function DriverStatusBadge({ status }: { status: DriverStatus }) {
  return <span className={cx("driver-status", status)}>{status}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AiTile({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return (
    <div className="ai-tile">
      {icon}
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

class ApiRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function apiRequest<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiRequestError(response.status, body?.error ?? `API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function readErrorBody(response: Response): Promise<{ error?: string } | null> {
  try {
    return (await response.json()) as { error?: string };
  } catch {
    return null;
  }
}

async function apiReady() {
  try {
    const response = await fetch(`${apiBase}/ready`);
    return response.ok;
  } catch {
    return false;
  }
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isLocalDemoToken(token: string | null | undefined) {
  return token === localDemoToken;
}

function isLocalDriverDemoToken(token: string | null | undefined) {
  return token === localDriverDemoToken;
}

function createLocalAssignmentSuggestions(orders: Order[], drivers: Driver[]): AssignmentSuggestion[] {
  return orders
    .filter((order) => !order.driverId && order.status === "placed")
    .map((order) => {
      const rankedDrivers = drivers
        .filter((driver) => driver.status === "available" && driverCanCarryOrder(driver, order))
        .map((driver) => ({
          driver,
          distanceMeters: distanceBetween(driver.location, order.destination)
        }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters);

      const nearest = rankedDrivers[0];
      const scoreBase = order.priority === "critical" ? 98 : order.priority === "express" ? 94 : 90;
      const score = nearest ? Math.max(72, Math.min(98, Math.round(scoreBase - Math.min(18, nearest.distanceMeters / 750)))) : 72;

      return {
        orderId: order.id,
        suggestedDriverId: nearest?.driver.id ?? null,
        score,
        distanceMeters: nearest ? Math.round(nearest.distanceMeters) : undefined,
        reason: nearest
          ? `${order.priority} order matched to ${nearest.driver.name} ${(nearest.distanceMeters / 1609.34).toFixed(1)} mi from destination with ${driverCapacityLabel(nearest.driver)} capacity`
          : `${order.priority} order needs ${order.weightKg.toFixed(1)} kg capacity; no available driver can carry it`
      };
    });
}

function driverCanCarryOrder(driver: Driver, order: Order) {
  return driver.capacityKg == null || driver.capacityKg >= order.weightKg;
}

function driverCapacityLabel(driver: Driver) {
  return driver.capacityKg == null ? "open capacity" : `${driver.capacityKg.toFixed(1)} kg cap`;
}

function createLocalDriverAssignments(): DriverAssignment[] {
  const driver = seedDrivers.find((item) => item.id === localDriverId) ?? seedDrivers[0];
  const assignedOrders = seedOrders.filter((order) => order.driverId === localDriverId);
  const offeredOrder = seedOrders.find((order) => order.status === "placed" && !order.driverId);

  return [
    ...assignedOrders.map((order) => ({
      id: `local-${order.id}-${localDriverId}`,
      order,
      driver,
      status: order.status === "delivered" ? ("completed" as const) : ("accepted" as const),
      assignedAt: new Date().toISOString(),
      acceptedAt: new Date().toISOString(),
      completedAt: order.status === "delivered" ? new Date().toISOString() : undefined
    })),
    ...(offeredOrder
      ? [
          {
            id: `local-${offeredOrder.id}-${localDriverId}`,
            order: offeredOrder,
            driver,
            status: "offered" as const,
            assignedAt: new Date().toISOString()
          }
        ]
      : [])
  ];
}

function createLocalRoutePlan(order: Order, driver?: Driver): RoutePlan {
  const origin = driver?.location ?? seedDrivers[0]?.location ?? order.destination;
  const distanceMeters = Math.max(1200, Math.round(distanceBetween(origin, order.destination)));
  const etaMinutes = Math.max(6, Math.round(distanceMeters / 520));

  return {
    id: `local-${order.id}`,
    orderId: order.id,
    driverId: driver?.id ?? order.driverId,
    distanceMeters,
    etaMinutes,
    provider: "internal-fallback",
    createdAt: new Date().toISOString()
  };
}

function distanceBetween(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  const earthRadiusMeters = 6371000;
  const latA = toRadians(origin.lat);
  const latB = toRadians(destination.lat);
  const deltaLat = toRadians(destination.lat - origin.lat);
  const deltaLng = toRadians(destination.lng - origin.lng);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function statusProgress(status: DeliveryStatus) {
  const progress: Record<DeliveryStatus, number> = {
    placed: 0,
    assigned: 10,
    picked_up: 35,
    in_transit: 70,
    delivered: 100,
    delayed: 55
  };

  return progress[status];
}

function decodePolyline(encoded: string) {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const latitude = decodeCoordinate(encoded, index);
    index = latitude.nextIndex;
    lat += latitude.value;

    const longitude = decodeCoordinate(encoded, index);
    index = longitude.nextIndex;
    lng += longitude.value;

    points.push({ lat: lat / 100000, lng: lng / 100000 });
  }

  return points;
}

function decodeCoordinate(encoded: string, startIndex: number) {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte: number;

  do {
    byte = encoded.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);

  return {
    value: result & 1 ? ~(result >> 1) : result >> 1,
    nextIndex: index
  };
}
