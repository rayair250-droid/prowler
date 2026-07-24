import { test } from "@playwright/test";

import { NavigationPage } from "./navigation-page";

test.describe("App navigation", () => {
  test.use({ storageState: "playwright/.auth/admin_user.json" });

  test(
    "keeps the mobile sidebar and close control inside the viewport",
    {
      tag: ["@e2e", "@navigation", "@high", "@NAV-E2E-001"],
    },
    async ({ page }) => {
      const navigationPage = new NavigationPage(page);

      await navigationPage.goto();
      await navigationPage.verifyPageLoaded();
      await navigationPage.openMobileSidebar();
      await navigationPage.verifyMobileSidebarFitsViewport();
    },
  );

  test(
    "keeps one trigger and navigation usable when Featurebase is blocked",
    {
      tag: ["@e2e", "@navigation", "@high", "@NAV-E2E-002"],
    },
    async ({ page }) => {
      const navigationPage = new NavigationPage(page);

      await navigationPage.blockFeaturebaseRequests();
      await navigationPage.goto();
      await navigationPage.verifyPageLoaded();
      await navigationPage.verifySingleFeedbackTrigger();
      await navigationPage.navigateToProviders();
      await navigationPage.verifyPageLoaded();
      await navigationPage.verifySingleFeedbackTrigger();
    },
  );
});

test.describe("Public navigation", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "does not expose feedback on public routes",
    {
      tag: ["@e2e", "@navigation", "@high", "@NAV-E2E-003"],
    },
    async ({ page }) => {
      const navigationPage = new NavigationPage(page);

      await navigationPage.gotoSignIn();
      await navigationPage.verifySignInPageLoaded();
      await navigationPage.verifyFeedbackTriggerAbsent();
    },
  );
});
