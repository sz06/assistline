import type { Page } from "@playwright/test";

export class ProvidersPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/providers");
  }

  // ── Locators ─────────────────────────────────────

  get addProviderButton() {
    return this.page.getByTestId("add-provider-btn");
  }

  get saveButton() {
    return this.page.getByTestId("save-provider-btn");
  }

  get apiKeyInput() {
    return this.page.getByTestId("provider-api-key-input");
  }

  // ── Helpers ──────────────────────────────────────

  /** Returns all visible provider cards */
  getProviderCards() {
    return this.page.locator("[data-testid^='provider-card-']");
  }

  /** Select a provider option tile by provider key (e.g. "openai") */
  async selectProviderOption(key: string) {
    await this.page.getByTestId(`provider-option-${key}`).click();
  }

  /** Click the edit button on a provider card by provider key */
  async clickEditOnCard(providerKey: string) {
    await this.page.getByTestId(`edit-provider-${providerKey}`).click();
  }
}
