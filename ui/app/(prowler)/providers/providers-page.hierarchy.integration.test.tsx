import { describe, expect, it } from "vitest";

import {
  awsHierarchyFixture,
  mixedHierarchyFixture,
} from "@/__tests__/msw/handlers/organizations.fixtures";
import { HIERARCHY_STATUS } from "@/types/providers-table";

import { ProvidersPageHarness } from "./providers-page.harness";

// Phase 1 new-behavior coverage (the Phase 0 AWS baseline suite stays untouched):
// the providers page now consumes the canonical organization-nodes contract for
// BOTH organization types, deriving container labels from node `kind`, and
// surfaces an explicit notice when the hierarchy fetch degrades.

describe("Providers page — mixed AWS + GCP hierarchy display", () => {
  it("groups both organizations, labelling nodes by kind (Organizational Unit vs Folder)", async () => {
    const harness = new ProvidersPageHarness(mixedHierarchyFixture());
    harness.mount({ openWizard: false });

    // Both organizations render as top-level groups.
    await harness.waitForRow(/My AWS Organization/);
    await harness.waitForRow(/My GCP Organization/);

    // AWS organizational units and GCP folders both render as node groups.
    await harness.waitForRow(/Production/);
    await harness.waitForRow(/Sandbox/);
    await harness.waitForRow(/Engineering/);
    await harness.waitForRow(/Platform/);

    // Container labels are kind-driven, never ID-prefix-driven: AWS nodes read
    // "Organizational Unit", GCP nodes read "Folder".
    expect(harness.containsText(/Organizational Unit/)).toBe(true);
    expect(harness.containsText(/Folder/)).toBe(true);

    // Per-organization provider counts.
    expect(harness.containsText(/3 Providers/)).toBe(true);
    expect(harness.containsText(/2 Providers/)).toBe(true);

    // Providers of both types render nested under their nodes, by alias.
    expect(harness.rowByText(/prod-web/)).not.toBeNull();
    expect(harness.rowByText(/sandbox-1/)).not.toBeNull();
    expect(harness.rowByText(/Prod Analytics/)).not.toBeNull();
    expect(harness.rowByText(/Prod Platform/)).not.toBeNull();
  }, 30000);
});

describe("Providers page — degraded hierarchy view", () => {
  it("shows a non-blocking notice and keeps providers listed flat when hierarchy is unavailable", async () => {
    const harness = new ProvidersPageHarness(awsHierarchyFixture());
    harness.mount({
      openWizard: false,
      hierarchyStatus: HIERARCHY_STATUS.UNAVAILABLE,
    });

    await harness.waitForText(
      /Organization grouping is temporarily unavailable/,
    );
    expect(harness.containsText(/Providers are shown as a flat list/)).toBe(
      true,
    );

    // Providers are still present despite grouping being unavailable.
    expect(harness.rowByText(/prod-web/)).not.toBeNull();
  }, 30000);

  it("shows no notice when the hierarchy is available", async () => {
    const harness = new ProvidersPageHarness(awsHierarchyFixture());
    harness.mount({ openWizard: false });

    await harness.waitForRow(/My AWS Organization/);
    expect(
      harness.containsText(/Organization grouping is temporarily unavailable/),
    ).toBe(false);
  }, 30000);
});
