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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { demandForecast as seedForecast, drivers as seedDrivers, notifications as seedNotifications, orders as seedOrders } from "@/lib/mock-data";
import type { DeliveryStatus, Driver, DriverStatus, ForecastPoint, NotificationItem, Order, RoutePlan } from "@/lib/types";

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

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "DISPATCHER" | "DRIVER";
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
  const [routePlan, setRoutePlan] = useState<RoutePlan | undefined>();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(seedOrders[0]?.id);
  const [selectedDriverId, setSelectedDriverId] = useState(seedDrivers[0]?.id);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [wsStatus, setWsStatus] = useState<"connecting" | "live" | "offline">("connecting");

  useEffect(() => {
    const savedToken = window.localStorage.getItem("fleettrack_token");
    if (!savedToken) {
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
    if (!token) return;
    const authToken = token;

    let cancelled = false;

    async function loadDashboard() {
      try {
        const [nextOrders, nextDrivers, nextNotifications, nextForecast] = await Promise.all([
          apiRequest<Order[]>("/api/orders", authToken),
          apiRequest<Driver[]>("/api/drivers", authToken),
          apiRequest<NotificationItem[]>("/api/notifications", authToken),
          apiRequest<ForecastPoint[]>("/api/demand-forecast", authToken)
        ]);

        if (cancelled) return;

        setOrders(nextOrders);
        setDrivers(nextDrivers);
        setNotifications(nextNotifications);
        setForecast(nextForecast);
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
  }, [token]);

  useEffect(() => {
    if (!token) {
      setWsStatus("offline");
      return;
    }

    const url = process.env.NEXT_PUBLIC_WS_URL;
    if (!url) {
      setWsStatus("offline");
      return;
    }

    let socket: WebSocket | undefined;

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
          setRoutePlan(payload.routePlan);
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
  }, [token]);

  useEffect(() => {
    if (!token || !selectedOrderId) return;
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
  }, [selectedOrderId, token]);

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

  async function handleLogin(email: string, password: string) {
    setAuthError("");

    try {
      const result = await apiRequest<{ token: string; user: AuthUser }>("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      window.localStorage.setItem("fleettrack_token", result.token);
      setToken(result.token);
      setUser(result.user);
    } catch {
      setAuthError("Invalid credentials or API unavailable.");
    }
  }

  function handleLogout() {
    window.localStorage.removeItem("fleettrack_token");
    setToken(null);
    setUser(null);
    setWsStatus("offline");
  }

  async function assignDriver(orderId: string, driverId: string) {
    if (!token) return;

    const result = await apiRequest<{ order: Order; driver: Driver; routePlan?: RoutePlan }>(`/api/orders/${orderId}/assign`, token, {
      method: "POST",
      body: JSON.stringify({ driverId })
    });

    setOrders((current) => current.map((order) => (order.id === orderId ? result.order : order)));
    setDrivers((current) => current.map((driver) => (driver.id === driverId ? result.driver : driver)));
    setRoutePlan(result.routePlan);
    setSelectedOrderId(orderId);
    setSelectedDriverId(driverId);
  }

  async function optimizeSelectedRoute() {
    if (!token || !selectedOrder) return;

    const result = await apiRequest<{ order: Order; routePlan: RoutePlan }>(`/api/routes/${selectedOrder.id}/optimize`, token, {
      method: "POST"
    });

    setOrders((current) => current.map((order) => (order.id === selectedOrder.id ? result.order : order)));
    setRoutePlan(result.routePlan);
  }

  async function updateOrderStatus(orderId: string, status: DeliveryStatus) {
    if (!token) return;

    const order = await apiRequest<Order>(`/api/orders/${orderId}/status`, token, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });

    setOrders((current) => current.map((item) => (item.id === orderId ? order : item)));
  }

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Orders", icon: Boxes },
    { label: "Drivers", icon: UsersRound },
    { label: "Live Tracking", icon: MapPin },
    { label: "AI Ops", icon: Sparkles }
  ];

  if (!authReady) {
    return <div className="loading-screen">Loading FleetTrack</div>;
  }

  if (!token || !user) {
    return <LoginScreen error={authError} onLogin={handleLogin} />;
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
              <p>Orders, drivers, routes, and delivery risk in one live operations panel.</p>
            </div>
            <button className="primary-button">
              <PackagePlus size={18} />
              New order
            </button>
          </section>

          <section className="metrics-grid" aria-label="Delivery metrics">
            <Metric title="Total Orders" value="1,284" note="+12.5% from last week" icon={<Boxes size={21} />} tone="blue" />
            <Metric title="In Transit" value={String(inTransit)} note="8 arriving soon" icon={<Truck size={21} />} tone="green" />
            <Metric title="Delivered Today" value={String(deliveredToday)} note="+8.2% from yesterday" icon={<CheckCircle2 size={21} />} tone="mint" />
            <Metric title="Active Drivers" value={String(activeDrivers)} note={`${drivers.length - activeDrivers} offline`} icon={<UsersRound size={21} />} tone="orange" />
          </section>

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
                      {[...availableDrivers, ...drivers.filter((driver) => driver.id === selectedOrder.driverId)].map((driver) => (
                        <option value={driver.id} key={driver.id}>
                          {driver.name} · {driver.vehicle}
                        </option>
                      ))}
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
                      <small>{driver.vehicle} · {driver.rating.toFixed(1)}</small>
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
              <button className="wide-button">
                <Send size={16} />
                Send customer update
              </button>
            </div>
          </section>
        </div>
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
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
