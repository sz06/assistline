import { expect, test } from "@playwright/test";
import { AuditLogsPage } from "../page-objects/audit-logs";

test.describe("Audit Logs Page", () => {
  let auditLogsPage: AuditLogsPage;

  test.beforeEach(async ({ page }) => {
    auditLogsPage = new AuditLogsPage(page);
    await auditLogsPage.goto();
  });

  test("renders the page with heading and filters", async () => {
    await expect(auditLogsPage.heading).toBeVisible();
    await expect(auditLogsPage.sourceFilter).toBeVisible();
    await expect(auditLogsPage.entityFilter).toBeVisible();
    await expect(auditLogsPage.searchInput).toBeVisible();
  });

  test("can switch source filter pills", async () => {
    // Click Manual
    await auditLogsPage.filterBySource("manual");
    const manualBtn = auditLogsPage.sourceFilter.getByRole("button", {
      name: "manual",
    });
    await expect(manualBtn).toHaveClass(/bg-white|bg-gray-700/);

    // Click Auto
    await auditLogsPage.filterBySource("auto");
    const autoBtn = auditLogsPage.sourceFilter.getByRole("button", {
      name: "auto",
    });
    await expect(autoBtn).toHaveClass(/bg-white|bg-gray-700/);
  });

  test("can filter by entity", async () => {
    await auditLogsPage.filterByEntity("contacts");
    await expect(auditLogsPage.entityFilter).toHaveValue("contacts");
  });

  test("search input accepts text", async () => {
    await auditLogsPage.search("contact");
    await expect(auditLogsPage.searchInput).toHaveValue("contact");
  });
});
