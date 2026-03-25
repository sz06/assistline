import type { Locator, Page } from "@playwright/test";

export class AuditLogsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly sourceFilter: Locator;
  readonly entityFilter: Locator;
  readonly searchInput: Locator;
  readonly logEntries: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Audit Logs" });
    this.sourceFilter = page.locator('[data-testid="source-filter"]');
    this.entityFilter = page.locator('[data-testid="entity-filter"]');
    this.searchInput = page.locator('[data-testid="audit-search"]');
    this.logEntries = page.locator('[data-testid="audit-log-entry"]');
  }

  async goto() {
    await this.page.goto("http://localhost:5174/audit-logs");
    await this.page.waitForLoadState("networkidle");
  }

  async filterBySource(source: "all" | "auto" | "manual") {
    await this.sourceFilter.getByRole("button", { name: source }).click();
  }

  async filterByEntity(entity: string) {
    await this.entityFilter.selectOption(entity);
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }
}
