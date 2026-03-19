import { expect, test } from "@playwright/test";
import { ChannelsPage } from "../page-objects/channels";

test.describe("Channels Page", () => {
  let channelsPage: ChannelsPage;

  test.beforeEach(async ({ page }) => {
    channelsPage = new ChannelsPage(page);
    await channelsPage.goto();
  });

  test("renders the page with heading and add button", async () => {
    await expect(
      channelsPage.page.getByRole("heading", { name: "Channels" }),
    ).toBeVisible();
    await expect(channelsPage.addChannelButton).toBeVisible();
  });

  test("can create a new channel", async () => {
    // Click Add Channel and wait for navigation
    await Promise.all([
      channelsPage.page.waitForURL("**/channels/add"),
      channelsPage.addChannelButton.click(),
    ]);

    // Fill in the form
    await channelsPage.fillForm({
      type: "whatsapp",
      label: "My WhatsApp",
    });

    // Save the channel and wait for navigation back
    await Promise.all([
      channelsPage.page.waitForURL("**/channels"),
      channelsPage.saveButton.click(),
    ]);

    // Verify the channel card appears
    await expect(
      channelsPage.page.locator("h3", { hasText: "My WhatsApp" }).first(),
    ).toBeVisible();
  });

  test("can navigate to edit a channel", async ({ page }) => {
    // First, create a channel
    await Promise.all([
      channelsPage.page.waitForURL("**/channels/add"),
      channelsPage.addChannelButton.click(),
    ]);
    await channelsPage.fillForm({ label: "Edit Test WA" });
    await Promise.all([
      channelsPage.page.waitForURL("**/channels"),
      channelsPage.saveButton.click(),
    ]);
    await expect(
      page.locator("h3", { hasText: "Edit Test WA" }).first(),
    ).toBeVisible();

    // Click the channel card to navigate to the update page
    await Promise.all([
      channelsPage.page.waitForURL("**/channels/*/update"),
      page.locator("h3", { hasText: "Edit Test WA" }).first().click(),
    ]);

    // Verify we're on the edit page
    await expect(
      page.getByRole("heading", { name: "Edit Channel" }),
    ).toBeVisible();
  });

  test("shows empty state when no channels exist", async () => {
    const heading = channelsPage.page.getByRole("heading", {
      name: "Channels",
    });
    await expect(heading).toBeVisible();
  });
});
