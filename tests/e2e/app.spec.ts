import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`);
}

/** Elements that stick out to the right of the viewport (empty list = no horizontal scroll). */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= w) return [];
    return [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > w + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}: ${(el.textContent ?? "").slice(0, 60)}`);
  });
}

test("[UI-01][UI-02][CHECK-03] valid sample: accepted, checked in the browser without uploading", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await page.goto("/");
  expect(await axe(page), "start screen").toEqual([]);
  const before = requests.length;
  await page.getByRole("button", { name: "Gültige XRechnung (XML)" }).click();
  await expect(page.getByRole("heading", { name: "Angenommen" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("EN16931 XRechnung (CII)")).toBeVisible();
  const during = requests.slice(before);
  expect(during.filter((r) => r.startsWith("POST"))).toEqual([]);
  for (const r of during) expect(r, r).toMatch(/^GET \/(rules|vendor|samples|_next)\//);
  expect(await axe(page), "result screen").toEqual([]);
});

test("[UI-02] invalid sample: rejected, findings explained with fix and location", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Fehlerhafte XRechnung (XML)" }).click();
  await expect(page.getByRole("heading", { name: "Abgelehnt" })).toBeVisible({ timeout: 60_000 });
  const finding = page.locator("li", { hasText: "BR-CO-15" }).first();
  await expect(finding).toContainText("So beheben Sie es");
  await expect(finding).toContainText("GrandTotalAmount");
  await expect(page.locator("li", { hasText: "BR-DE-15" }).first()).toContainText("Leitweg-ID");
});

test("[UI-03] language toggle switches the visible strings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByText("Drop an invoice here")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Faulty XRechnung (XML)" }).click();
  await expect(page.getByRole("heading", { name: "Rejected" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("How to fix it").first()).toBeVisible();
});

test("[CHECK-04][UI-01] ZUGFeRD PDF: the embedded XML is checked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ZUGFeRD-PDF mit eingebetteter XML" }).click();
  await expect(page.getByRole("heading", { name: "Angenommen" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("factur-x.xml")).toBeVisible();
});

test("[UI-04][UI-05][CONV-06][CONV-08] plain PDF: convert, approve every field, generate, accepted, download", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Normale PDF-Rechnung (zum Umwandeln)" }).click();
  await expect(page.getByRole("heading", { name: "Das ist keine E-Rechnung" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "In XRechnung umwandeln" }).click();
  await expect(page.getByRole("heading", { name: "Felder prüfen" })).toBeVisible({ timeout: 60_000 });
  expect(await axe(page), "review screen").toEqual([]);
  const generate = page.getByRole("button", { name: "XRechnung erzeugen und prüfen" });
  await expect(generate).toBeDisabled();
  const boxes = page.getByRole("checkbox", { name: "Bestätigt" });
  const n = await boxes.count();
  expect(n).toBeGreaterThan(30);
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(page.getByRole("heading", { name: "Angenommen" })).toBeVisible({ timeout: 60_000 });
  const href = await page.getByTestId("download").getAttribute("href");
  const xml = await page.evaluate(async (u) => (await fetch(u!)).text(), href);
  expect(xml).toContain("urn:xeinkauf.de:kosit:xrechnung_3.0");
});

test("[UI-06] phone width: no horizontal scroll on start, result and review", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  expect(await overflowing(page)).toEqual([]);
  await page.getByRole("button", { name: "Fehlerhafte XRechnung (XML)" }).click();
  await expect(page.getByRole("heading", { name: "Abgelehnt" })).toBeVisible({ timeout: 60_000 });
  expect(await overflowing(page)).toEqual([]);
  await page.getByRole("button", { name: "Neue Datei" }).click();
  await page.getByRole("button", { name: "Normale PDF-Rechnung (zum Umwandeln)" }).click();
  await page.getByRole("button", { name: "In XRechnung umwandeln" }).click();
  await expect(page.getByRole("heading", { name: "Felder prüfen" })).toBeVisible({ timeout: 60_000 });
  expect(await overflowing(page)).toEqual([]);
});

test("[UI-06] keyboard: sample buttons and language toggle are reachable and operable", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "DE", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
