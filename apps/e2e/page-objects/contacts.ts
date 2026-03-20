import type { Page } from "@playwright/test";

export class ContactsPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/contacts");
  }

  // ── Locators ─────────────────────────────────────

  get addContactButton() {
    return this.page.getByTestId("add-contact-btn");
  }

  get emptyAddButton() {
    return this.page.getByTestId("empty-add-contact-btn");
  }

  get searchInput() {
    return this.page.getByTestId("contacts-search");
  }

  get saveButton() {
    return this.page.getByTestId("save-contact-btn");
  }

  get editButton() {
    return this.page.getByTestId("edit-contact-btn");
  }

  // Form fields (inside the dialog)
  get nameInput() {
    return this.page.locator("#cf-name");
  }

  get nicknameInput() {
    return this.page.locator("#cf-nick");
  }

  get companyInput() {
    return this.page.locator("#cf-company");
  }

  get jobTitleInput() {
    return this.page.locator("#cf-job");
  }

  // ── Helpers ──────────────────────────────────────

  /** Returns all visible contact rows */
  getContactRows() {
    return this.page.locator("[data-testid^='contact-row-']");
  }

  /** Click on a contact row by its displayed name */
  async clickRow(name: string) {
    await this.page.locator("h3", { hasText: name }).first().click();
  }

  /** Fill the add/edit form with basic fields */
  async fillForm(data: {
    name?: string;
    nickname?: string;
    company?: string;
    jobTitle?: string;
  }) {
    if (data.name !== undefined) {
      await this.nameInput.fill(data.name);
    }
    if (data.nickname !== undefined) {
      await this.nicknameInput.fill(data.nickname);
    }
    if (data.company !== undefined) {
      await this.companyInput.fill(data.company);
    }
    if (data.jobTitle !== undefined) {
      await this.jobTitleInput.fill(data.jobTitle);
    }
  }
}
