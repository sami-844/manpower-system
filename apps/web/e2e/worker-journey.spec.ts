import { expect, test } from "@playwright/test";

// Every office screen sits behind sign-in (S-01). Sign in as the HR officer through the real screen.
test.beforeEach(async ({ page }) => {
  await page.goto("/#/sign-in");
  await page.getByRole("radio", { name: /HR \/ PRO officer/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Today/ })).toBeVisible();
});

test("HR adds a worker, records documents and checks deployment", async ({ page }) => {
  const name = `E2E Worker ${Date.now()}`;
  await page.goto("/#/workers");
  await page.getByRole("button", { name: "Add worker" }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Nationality").fill("Nepal");
  await page.getByLabel("Trade").fill("Scaffolder");
  await page.getByRole("button", { name: "Create worker" }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Papers missing").first()).toBeVisible();

  // Before any documents, the check must refuse.
  await page.getByRole("button", { name: "Check eligibility" }).click();
  await expect(page.getByText("Cannot be deployed")).toBeVisible();
  await expect(page.getByText("Passport is missing")).toBeVisible();

  for (const type of ["Passport", "Residence visa", "Labour card", "Medical fitness"]) {
    await page.getByRole("button", { name: "Add document" }).click();
    await page.getByLabel("Type").selectOption({ label: type });
    await page.getByLabel("Number").fill(`X${Math.floor(Math.random() * 1e6)}`);
    await page.getByLabel("Expires").fill("2028-06-30");
    await page.getByRole("button", { name: "Save document" }).click();
    await expect(page.getByRole("table", { name: "Documents" }).getByRole("rowheader", { name: type })).toBeVisible();
  }

  await page.getByRole("button", { name: "Check eligibility" }).click();
  await expect(page.getByText("Can be deployed")).toBeVisible();
  await expect(page.getByText("In order").first()).toBeVisible();
});

test("Today shows what needs action and links to the worker", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /^Today/ })).toBeVisible();
  const urgent = page.getByRole("table", { name: "Urgent renewals" });
  await expect(urgent).toBeVisible();
  await urgent.getByRole("link").first().click();
  await expect(page.getByRole("table", { name: "Documents" })).toBeVisible();
});

test("Workers can be filtered by paper status", async ({ page }) => {
  await page.goto("/#/workers");
  await page.getByRole("button", { name: "Expired", exact: true }).click();
  await expect(page).toHaveURL(/compliance=expired/);
  const table = page.getByRole("table", { name: "Workers" });
  await expect(table).toHaveAttribute("aria-busy", "false");
  const rows = table.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  for (const tag of await rows.locator(".tag").allTextContents()) expect(tag).toBe("Expired");
});
