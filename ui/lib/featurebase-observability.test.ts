import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

describe("reportFeaturebaseFailure", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("captures only a sanitized error classification and stage", async () => {
    // Given
    const sensitiveError = new Error(
      "jwt=private-token email=ada@example.com secret=private-secret",
    );
    const { FEATUREBASE_FAILURE_STAGE, reportFeaturebaseFailure } =
      await import("./featurebase-observability");

    // When
    reportFeaturebaseFailure(
      FEATUREBASE_FAILURE_STAGE.ORGANIZATION,
      sensitiveError,
    );

    // Then
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Featurebase integration failure" }),
      {
        level: "warning",
        tags: {
          error_type: "error",
          integration: "featurebase",
          stage: "organization",
        },
      },
    );
    const serialized = JSON.stringify(
      vi.mocked(Sentry.captureException).mock.calls,
    );
    expect(serialized).not.toContain("private-token");
    expect(serialized).not.toContain("ada@example.com");
    expect(serialized).not.toContain("private-secret");
  });

  it("does not read or forward a hostile custom error name", async () => {
    // Given
    const hostileError = new Error("jwt=private-token");
    Object.defineProperty(hostileError, "name", {
      get: () => {
        throw new Error("secret=private-secret");
      },
    });
    const { FEATUREBASE_FAILURE_STAGE, reportFeaturebaseFailure } =
      await import("./featurebase-observability");

    // When
    reportFeaturebaseFailure(FEATUREBASE_FAILURE_STAGE.SDK, hostileError);

    // Then
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Featurebase integration failure" }),
      {
        level: "warning",
        tags: {
          error_type: "error",
          integration: "featurebase",
          stage: "sdk",
        },
      },
    );
    const serialized = JSON.stringify(
      vi.mocked(Sentry.captureException).mock.calls,
    );
    expect(serialized).not.toContain("private-token");
    expect(serialized).not.toContain("private-secret");
  });

  it("fails open when Sentry capture throws", async () => {
    // Given
    vi.mocked(Sentry.captureException).mockImplementation(() => {
      throw new Error("Sentry unavailable");
    });
    const { FEATUREBASE_FAILURE_STAGE, reportFeaturebaseFailure } =
      await import("./featurebase-observability");

    // When / Then
    expect(() =>
      reportFeaturebaseFailure(FEATUREBASE_FAILURE_STAGE.SDK, new Error("sdk")),
    ).not.toThrow();
  });
});
