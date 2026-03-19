import type { Page } from "@playwright/test";

export class ChannelsPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/channels");
  }

  // ── Locators ─────────────────────────────────────

  get addChannelButton() {
    return this.page.getByTestId("add-channel-btn");
  }

  get emptyAddButton() {
    return this.page.getByTestId("empty-add-channel-btn");
  }

  get saveButton() {
    return this.page.getByTestId("save-channel-btn");
  }

  // Form fields (on the form page)
  get typeSelect() {
    return this.page.getByTestId("channel-type-select");
  }

  get labelInput() {
    return this.page.getByTestId("channel-label-input");
  }

  // ── Helpers ──────────────────────────────────────

  /** Returns all visible channel cards */
  getChannelCards() {
    return this.page.locator("[data-testid^='channel-card-']");
  }

  /** Click the edit button on a channel card by its label text */
  async clickEditOnCard(label: string) {
    const card = this.page.locator("h3", { hasText: label }).first();
    const row = card.locator("..").locator("..").locator("..");
    await row.locator("[data-testid^='edit-channel-']").click();
  }

  /** Fill the add/edit form with basic fields */
  async fillForm(data: { type?: string; label?: string }) {
    if (data.type !== undefined) {
      await this.typeSelect.selectOption(data.type);
    }
    if (data.label !== undefined) {
      await this.labelInput.fill(data.label);
    }
  }
}
