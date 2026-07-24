import { decode, verify } from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, reportFailureMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  reportFailureMock: vi.fn(),
}));

vi.mock("@/auth.config", () => ({ auth: authMock }));
vi.mock("@/lib/featurebase-observability", () => ({
  FEATUREBASE_FAILURE_STAGE: { SERVER_ACTION: "server_action" },
  reportFeaturebaseFailure: reportFailureMock,
}));
vi.mock("server-only", () => ({}));

const SECRET = "obvious-non-secret-test-fixture";
const validSession = {
  userId: "user-123",
  user: { name: "Ada Lovelace", email: "ada@example.com" },
};

describe("createFeaturebaseJwt", () => {
  beforeEach(() => {
    vi.stubEnv("UI_CLOUD_ENABLED", "true");
    vi.stubEnv("UI_FEATUREBASE_ENABLED", "true");
    vi.stubEnv("UI_FEATUREBASE_APP_ID", "app-id");
  });

  afterEach(() => {
    authMock.mockReset();
    vi.unstubAllEnvs();
  });

  it.each([
    ["non-Cloud deployment", "false", "true", "app-id"],
    ["disabled integration", "true", "false", "app-id"],
    ["missing App ID", "true", "true", ""],
  ])(
    "does not authenticate or mint a token for %s",
    async (_case, cloud, enabled, appId) => {
      // Given
      vi.stubEnv("UI_CLOUD_ENABLED", cloud);
      vi.stubEnv("UI_FEATUREBASE_ENABLED", enabled);
      vi.stubEnv("UI_FEATUREBASE_APP_ID", appId);
      vi.stubEnv("FEATUREBASE_JWT_SECRET", SECRET);
      authMock.mockResolvedValue(validSession);
      const { createFeaturebaseJwt } = await import("./featurebase");

      // When
      const token = await createFeaturebaseJwt();

      // Then
      expect(token).toBeNull();
      expect(authMock).not.toHaveBeenCalled();
    },
  );

  it("signs only the approved identity claims with HS256", async () => {
    // Given
    vi.stubEnv("FEATUREBASE_JWT_SECRET", SECRET);
    authMock.mockResolvedValue(validSession);
    const { createFeaturebaseJwt } = await import("./featurebase");

    // When
    const token = await createFeaturebaseJwt();

    // Then
    expect(verify(token as string, SECRET, { algorithms: ["HS256"] })).toEqual({
      userId: "user-123",
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(decode(token as string, { complete: true })?.header.alg).toBe(
      "HS256",
    );
  });

  it.each([
    ["missing secret", validSession, false],
    ["missing session", null, true],
    ["missing user ID", { user: validSession.user }, true],
    [
      "blank name",
      { ...validSession, user: { ...validSession.user, name: " " } },
      true,
    ],
    [
      "blank email",
      { ...validSession, user: { ...validSession.user, email: " " } },
      true,
    ],
  ])("returns null for %s", async (_scenario, session, withSecret) => {
    // Given
    if (withSecret) vi.stubEnv("FEATUREBASE_JWT_SECRET", SECRET);
    authMock.mockResolvedValue(session);
    const { createFeaturebaseJwt } = await import("./featurebase");

    // When / Then
    expect(await createFeaturebaseJwt()).toBeNull();
  });

  it("returns null when authentication rejects", async () => {
    // Given
    vi.stubEnv("FEATUREBASE_JWT_SECRET", SECRET);
    authMock.mockRejectedValue(new Error("test auth failure"));
    const { createFeaturebaseJwt } = await import("./featurebase");

    // When / Then
    expect(await createFeaturebaseJwt()).toBeNull();
    expect(reportFailureMock).toHaveBeenCalledWith(
      "server_action",
      expect.any(Error),
    );
  });
});
