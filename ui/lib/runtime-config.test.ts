import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));

const getConfig = async () => {
  vi.resetModules();
  return (await import("./runtime-config")).getRuntimePublicConfig();
};

describe("Featurebase runtime configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["enabled Cloud config", "true", "true", "app-id", "app-id"],
    ["explicit disablement", "true", "false", "app-id", null],
    ["missing App ID", "true", "true", "", null],
    ["on-premise deployment", "false", "true", "app-id", null],
  ])("resolves %s", async (_scenario, cloud, enabled, appId, expected) => {
    // Given
    vi.stubEnv("UI_CLOUD_ENABLED", cloud);
    vi.stubEnv("UI_FEATUREBASE_ENABLED", enabled);
    vi.stubEnv("UI_FEATUREBASE_APP_ID", appId);

    // When
    const config = await getConfig();

    // Then
    expect(config.featurebaseAppId).toBe(expected);
  });

  it("never serializes the server signing secret", async () => {
    // Given
    vi.stubEnv("UI_CLOUD_ENABLED", "true");
    vi.stubEnv("UI_FEATUREBASE_ENABLED", "true");
    vi.stubEnv("UI_FEATUREBASE_APP_ID", "public-app-id");
    vi.stubEnv("FEATUREBASE_JWT_SECRET", "non-secret-test-fixture");

    // When
    const serialized = JSON.stringify(await getConfig());

    // Then
    expect(serialized).toContain('"featurebaseAppId":"public-app-id"');
    expect(serialized).not.toContain("non-secret-test-fixture");
  });
});
