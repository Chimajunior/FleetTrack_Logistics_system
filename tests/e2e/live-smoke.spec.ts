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
  await page.getByRole("button", { name: "Driver demo" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("FleetTrack Driver")).toBeVisible();
  const acceptButton = page.getByRole("button", { name: "Accept" }).first();
  if (await acceptButton.isVisible()) {
    await acceptButton.click();
  }

  const inTransitButton = page.getByRole("button", { name: "In Transit" }).first();
  if (await inTransitButton.isVisible()) {
    await inTransitButton.click();
    await expect(inTransitButton).toHaveClass(/status-button-active/);
  }
});
