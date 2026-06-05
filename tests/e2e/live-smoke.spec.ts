import { expect, test } from "@playwright/test";

const appUrl = process.env.APP_URL ?? "http://localhost:3001";

test("admin can use assignment recommendations and driver can process assignment", async ({ page }) => {
  await page.goto(appUrl);

  await page.getByPlaceholder("Email").fill("admin@fleettrack.local");
  await page.getByPlaceholder("Password").fill("FleetTrack2026!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.locator(".suggestion-card").first()).toBeVisible();

  await page.getByRole("button", { name: "Orders" }).click();
  await expect(page.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible();
  await expect(page.locator(".operations-layout")).toBeVisible();
  await expect(page.locator(".tracking-layout")).toHaveCount(0);
  await expect(page.locator(".insights-layout")).toHaveCount(0);

  await page.getByRole("button", { name: "Drivers" }).click();
  await expect(page.getByRole("heading", { name: "Drivers", level: 1 })).toBeVisible();
  await expect(page.locator(".tracking-layout")).toBeVisible();
  await expect(page.locator(".operations-layout")).toHaveCount(0);
  await expect(page.locator(".insights-layout")).toHaveCount(0);

  await page.getByRole("button", { name: "AI Ops" }).click();
  await expect(page.getByRole("heading", { name: "AI Ops", level: 1 })).toBeVisible();
  await expect(page.locator(".insights-layout")).toBeVisible();
  await expect(page.locator(".operations-layout")).toHaveCount(0);
  await expect(page.locator(".tracking-layout")).toHaveCount(0);

  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(page.locator(".operations-layout")).toBeVisible();
  await expect(page.locator(".tracking-layout")).toBeVisible();
  await expect(page.locator(".insights-layout")).toBeVisible();

  const suggestedOrderId = (await page.locator(".suggestion-card strong").first().textContent())?.trim();
  expect(suggestedOrderId).toBeTruthy();

  await page.getByTestId(`assign-suggestion-${suggestedOrderId}`).click({ force: true });
  if (suggestedOrderId) {
    await expect(page.getByTestId(`assignment-suggestion-${suggestedOrderId}`)).toHaveCount(0);
  }

  await page.getByRole("button", { name: "Optimize" }).click();
  await expect(page.locator(".route-summary")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByPlaceholder("Email").fill("drv-05@fleettrack.local");
  await page.getByPlaceholder("Password").fill("Driver2026!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("FleetTrack Driver")).toBeVisible();
  await page.getByRole("combobox").first().selectOption("Route conflict");
  await page.getByRole("button", { name: "Reject" }).first().click();
  await expect(page.getByText("Rejected: Route conflict")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Driver demo" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();

  const acceptButton = page.getByRole("button", { name: "Accept" }).first();
  if (await acceptButton.isVisible()) {
    await acceptButton.click();
  }

  const inTransitButton = page.getByRole("button", { name: "In Transit" }).first();
  await expect(inTransitButton).toBeVisible();
  await inTransitButton.click();
  await expect(inTransitButton).toHaveClass(/status-button-active/);
  await page.getByPlaceholder("Recipient name").first().fill("Sarah Johnson");
  await page.getByPlaceholder("Delivery notes").first().fill("Left with front desk");
  await page.getByRole("button", { name: "Delivered" }).first().click();
  await expect(page.getByText("Proof captured for Sarah Johnson")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByPlaceholder("Email").fill("admin@fleettrack.local");
  await page.getByPlaceholder("Password").fill("FleetTrack2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".order-row", { hasText: "ORD-2026-001" }).click();
  await expect(page.getByText("Proof of delivery")).toBeVisible();
  await expect(page.getByText("Left with front desk")).toBeVisible();
});
