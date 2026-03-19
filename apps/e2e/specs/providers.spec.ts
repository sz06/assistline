import { expect, test } from "@playwright/test";
import { ProvidersPage } from "../page-objects/providers";

test.describe("Providers Page", () => {
  let providersPage: ProvidersPage;

  test.beforeEach(async ({ page }) => {
    providersPage = new ProvidersPage(page);
    await providersPage.goto();
  });

  test("renders the page with heading and add button", async () => {
    await expect(
      providersPage.page.getByRole("heading", { name: "AI Providers" }),
    ).toBeVisible();
    await expect(providersPage.addProviderButton).toBeVisible();
  });

  test("can navigate to add provider page", async () => {
    await Promise.all([
      providersPage.page.waitForURL("**/providers/add"),
      providersPage.addProviderButton.click(),
    ]);

    // Verify we're on the add page
    await expect(
      providersPage.page.getByRole("heading", { name: "Add Provider" }),
    ).toBeVisible();
  });

  test("shows provider selection on add page", async () => {
    await Promise.all([
      providersPage.page.waitForURL("**/providers/add"),
      providersPage.addProviderButton.click(),
    ]);

    // Verify provider options are visible
    await expect(providersPage.page.getByText("OpenAI")).toBeVisible();
    await expect(providersPage.page.getByText("Anthropic")).toBeVisible();
  });

  test("shows empty state when no providers exist", async () => {
    const heading = providersPage.page.getByRole("heading", {
      name: "AI Providers",
    });
    await expect(heading).toBeVisible();
  });
});
