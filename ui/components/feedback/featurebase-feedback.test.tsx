import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type WidgetCallback = (error: unknown, data: unknown) => void;
type FeaturebaseDispatcher = (
  action: string,
  data?: unknown,
  callback?: WidgetCallback,
) => void;

const mocks = vi.hoisted(() => ({
  createJwt: vi.fn(),
  runtimeConfig: vi.fn(),
  isCloud: vi.fn(),
  boot: vi.fn(),
  resolveOrganization: vi.fn(),
  destroy: vi.fn(),
  clear: vi.fn(),
  global: vi.fn<FeaturebaseDispatcher>(),
  opened: vi.fn(),
  submitted: vi.fn(),
  reportFailure: vi.fn(),
}));

vi.mock("@/actions/featurebase/featurebase", () => ({
  createFeaturebaseJwt: mocks.createJwt,
}));
vi.mock("@/hooks/use-runtime-config", () => ({
  useRuntimeConfig: mocks.runtimeConfig,
}));
vi.mock("@/lib/shared/env", () => ({ isCloud: mocks.isCloud }));
vi.mock("@/instrumentation-client", () => ({
  trackFeaturebaseFeedbackOpened: mocks.opened,
  trackFeaturebaseFeedbackSubmitted: mocks.submitted,
}));
vi.mock("@/lib/featurebase-observability", () => ({
  FEATUREBASE_FAILURE_STAGE: {
    CALLBACK: "callback",
    CLEANUP: "cleanup",
    IDENTITY: "identity",
    ORGANIZATION: "organization",
    SDK: "sdk",
    TIMEOUT: "timeout",
  },
  reportFeaturebaseFailure: mocks.reportFailure,
}));
vi.mock("featurebase-js", () => ({
  default: mocks.boot,
  resolveOrganization: mocks.resolveOrganization,
  destroyFeedback: mocks.destroy,
  clearConfig: mocks.clear,
}));

let widgetCallback: WidgetCallback | undefined;

const getCallback = async (): Promise<WidgetCallback> => {
  await waitFor(() => expect(widgetCallback).toBeDefined());
  if (!widgetCallback)
    throw new Error("Featurebase callback was not registered");
  return widgetCallback;
};

describe("FeaturebaseFeedback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    widgetCallback = undefined;
    mocks.createJwt.mockResolvedValue("signed-test-jwt");
    mocks.runtimeConfig.mockReturnValue({ featurebaseAppId: "app-id" });
    mocks.isCloud.mockReturnValue(true);
    mocks.resolveOrganization.mockResolvedValue({ slug: "prowler-test" });
    mocks.global.mockImplementation((_action, _data, callback) => {
      widgetCallback = callback;
    });
    vi.stubGlobal("Featurebase", mocks.global);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("runs one accessible privacy-safe lifecycle and cleans up", async () => {
    // Given
    const { FeaturebaseFeedback } = await import("./featurebase-feedback");
    const view = render(<FeaturebaseFeedback />);
    const trigger = await screen.findByRole("button", {
      name: "Give feedback",
    });
    const callback = await getCallback();

    // When
    expect(trigger).toBeDisabled();
    act(() => callback(null, { action: "widgetReady" }));
    act(() => {
      callback(null, { action: "widgetOpened", forbidden: "feedback" });
      callback(null, {
        action: "feedbackSubmitted",
        post: { attachment: "private" },
      });
      callback(null, { action: "feedbackCancelled" });
      callback(new Error("failed"), { action: "feedbackSubmitted" });
    });

    // Then
    expect(trigger).toBeEnabled();
    expect(
      screen.getAllByRole("button", { name: "Give feedback" }),
    ).toHaveLength(1);
    expect(mocks.boot).toHaveBeenCalledWith({
      appId: "app-id",
      featurebaseJwt: "signed-test-jwt",
      messenger: false,
    });
    expect(mocks.opened).toHaveBeenCalledWith();
    expect(mocks.submitted).toHaveBeenCalledWith();
    mocks.opened.mockImplementation(() => {
      throw new Error("analytics");
    });
    expect(() => callback(null, { action: "widgetOpened" })).not.toThrow();

    view.unmount();
    act(() => callback(null, { action: "feedbackSubmitted" }));
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.submitted).toHaveBeenCalledTimes(1);
  });

  it("opens through the supported product trigger and tracks a successful submission", async () => {
    // Given
    const user = userEvent.setup();
    const { FeaturebaseFeedback } = await import("./featurebase-feedback");
    render(<FeaturebaseFeedback />);
    const trigger = await screen.findByRole("button", {
      name: "Give feedback",
    });
    const callback = await getCallback();
    const runtimeClickHandler = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("button[data-featurebase-feedback]")
      ) {
        callback(null, { action: "widgetOpened" });
      }
    };
    document.addEventListener("click", runtimeClickHandler);
    act(() => callback(null, { action: "widgetReady" }));

    // When
    await user.click(trigger);
    act(() =>
      callback(null, {
        action: "feedbackSubmitted",
        post: { privateContent: "must-not-reach-analytics" },
      }),
    );

    // Then
    expect(mocks.global).toHaveBeenCalledWith(
      "initialize_feedback_widget",
      {
        organization: "prowler-test",
        theme: "dark",
        featurebaseJwt: "signed-test-jwt",
      },
      callback,
    );
    expect(mocks.opened).toHaveBeenCalledWith();
    expect(mocks.submitted).toHaveBeenCalledWith();
    document.removeEventListener("click", runtimeClickHandler);
  });

  it.each([
    ["on-premise", false, "app-id", "signed-test-jwt", false],
    ["missing config", true, null, "signed-test-jwt", false],
    ["missing identity", true, "app-id", null, true],
  ])("disables safely for %s", async (_case, cloud, appId, jwt, visible) => {
    // Given
    mocks.isCloud.mockReturnValue(cloud);
    mocks.runtimeConfig.mockReturnValue({ featurebaseAppId: appId });
    mocks.createJwt.mockResolvedValue(jwt);
    const { FeaturebaseFeedback } = await import("./featurebase-feedback");

    // When
    render(<FeaturebaseFeedback />);
    if (visible) {
      await waitFor(() => expect(mocks.createJwt).toHaveBeenCalled());
    }

    // Then
    const trigger = screen.queryByRole("button", { name: "Give feedback" });
    expect(Boolean(trigger)).toBe(visible);
    if (trigger) expect(trigger).toBeDisabled();
    expect(mocks.boot).not.toHaveBeenCalled();
  });

  it.each([
    [
      "identity",
      () => mocks.createJwt.mockRejectedValue(new Error("identity")),
      "identity",
      0,
      1,
      0,
    ],
    [
      "SDK",
      () =>
        mocks.boot.mockImplementation(() => {
          throw new Error("sdk");
        }),
      "sdk",
      1,
      1,
      0,
    ],
    [
      "network",
      () => mocks.resolveOrganization.mockRejectedValue(new Error("network")),
      "organization",
      0,
      1,
      0,
    ],
    [
      "CSP",
      () =>
        mocks.global.mockImplementation(() => {
          throw new Error("blocked");
        }),
      "sdk",
      1,
      1,
      1,
    ],
  ])(
    "fails open after a %s failure",
    async (
      _case,
      fail,
      stage,
      expectedBootCalls,
      expectedResolverCalls,
      expectedGlobalCalls,
    ) => {
      // Given
      fail();
      const { FeaturebaseFeedback } = await import("./featurebase-feedback");

      // When
      render(<FeaturebaseFeedback />);

      // Then
      expect(
        await screen.findByRole("button", { name: "Give feedback" }),
      ).toBeDisabled();
      expect(mocks.reportFailure).toHaveBeenCalledWith(
        stage,
        expect.any(Error),
      );
      expect(mocks.boot).toHaveBeenCalledTimes(expectedBootCalls);
      expect(mocks.resolveOrganization).toHaveBeenCalledTimes(
        expectedResolverCalls,
      );
      expect(mocks.global).toHaveBeenCalledTimes(expectedGlobalCalls);
    },
  );

  it("retries one transient organization failure and recovers", async () => {
    // Given
    vi.useFakeTimers();
    mocks.resolveOrganization
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({ slug: "prowler-test" });
    const { FeaturebaseFeedback } = await import("./featurebase-feedback");
    render(<FeaturebaseFeedback />);

    // When
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Then
    expect(mocks.resolveOrganization).toHaveBeenCalledTimes(2);
    expect(mocks.createJwt).toHaveBeenCalledTimes(1);
    expect(mocks.boot).toHaveBeenCalledTimes(1);
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.global).toHaveBeenCalledTimes(1);
    expect(mocks.reportFailure).toHaveBeenCalledWith(
      "organization",
      expect.any(Error),
    );
  });

  it("never mints a JWT when organization resolution fails terminally", async () => {
    // Given
    vi.useFakeTimers();
    mocks.resolveOrganization.mockRejectedValue(new Error("network failure"));
    const { FeaturebaseFeedback } = await import("./featurebase-feedback");

    // When
    render(<FeaturebaseFeedback />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Then
    expect(mocks.resolveOrganization).toHaveBeenCalledTimes(2);
    expect(mocks.createJwt).not.toHaveBeenCalled();
    expect(mocks.boot).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("stops before identity and SDK boot when organization resolution times out", async () => {
    // Given
    vi.useFakeTimers();
    const settleOrganizationRequests: Array<() => void> = [];
    mocks.resolveOrganization.mockImplementation(
      () =>
        new Promise<{ slug: string }>((resolve) => {
          settleOrganizationRequests.push(() => resolve({ slug: "too-late" }));
        }),
    );
    const { FeaturebaseFeedback } = await import("./featurebase-feedback");
    const view = render(<FeaturebaseFeedback />);

    // When
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      settleOrganizationRequests.forEach((settle) => settle());
      await Promise.resolve();
    });
    view.unmount();

    // Then
    expect(settleOrganizationRequests).toHaveLength(2);
    expect(mocks.resolveOrganization).toHaveBeenCalledTimes(2);
    expect(mocks.createJwt).not.toHaveBeenCalled();
    expect(mocks.boot).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out a stalled attempt, retries once, and does not update after unmount", async () => {
    // Given
    vi.useFakeTimers();
    mocks.createJwt
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce("signed-test-jwt");
    const { FeaturebaseFeedback } = await import("./featurebase-feedback");
    const view = render(<FeaturebaseFeedback />);

    // When
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(widgetCallback).toBeDefined();
    if (!widgetCallback)
      throw new Error("Featurebase callback was not registered");
    view.unmount();
    act(() => widgetCallback?.(null, { action: "widgetReady" }));

    // Then
    expect(mocks.createJwt).toHaveBeenCalledTimes(2);
    expect(mocks.reportFailure).toHaveBeenCalledWith(
      "timeout",
      expect.any(Error),
    );
    expect(screen.queryByRole("button", { name: "Give feedback" })).toBeNull();
  });

  it("cancels a pending retry without loading cleanup after failed initialization", async () => {
    // Given
    vi.useFakeTimers();
    mocks.resolveOrganization.mockRejectedValue(
      new Error("temporary network failure"),
    );
    const { FeaturebaseFeedback } = await import("./featurebase-feedback");
    const view = render(<FeaturebaseFeedback />);
    await act(async () => Promise.resolve());

    // When
    view.unmount();
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Then
    expect(mocks.resolveOrganization).toHaveBeenCalledTimes(1);
    expect(mocks.boot).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("cleans every partially booted attempt after terminal failure", async () => {
    // Given
    vi.useFakeTimers();
    mocks.global.mockImplementation(() => {
      throw new Error("blocked");
    });
    const { FeaturebaseFeedback } = await import("./featurebase-feedback");

    // When
    render(<FeaturebaseFeedback />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Then
    expect(mocks.boot).toHaveBeenCalledTimes(2);
    expect(mocks.global).toHaveBeenCalledTimes(2);
    expect(mocks.destroy).toHaveBeenCalledTimes(2);
    expect(mocks.clear).toHaveBeenCalledTimes(2);
  });

  it("cleans a partial boot when unmounted before retry", async () => {
    // Given
    vi.useFakeTimers();
    mocks.global.mockImplementation(() => {
      throw new Error("blocked");
    });
    const { FeaturebaseFeedback } = await import("./featurebase-feedback");
    const view = render(<FeaturebaseFeedback />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // When
    view.unmount();
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Then
    expect(mocks.boot).toHaveBeenCalledTimes(1);
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
  });

  it("cleans a failed attempt before retry without tearing down recovery", async () => {
    // Given
    vi.useFakeTimers();
    mocks.global.mockImplementationOnce(() => {
      throw new Error("blocked once");
    });
    const { FeaturebaseFeedback } = await import("./featurebase-feedback");
    const view = render(<FeaturebaseFeedback />);

    // When
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(widgetCallback).toBeDefined();
    if (!widgetCallback)
      throw new Error("Featurebase callback was not registered");
    const callback = widgetCallback;
    act(() => callback(null, { action: "widgetReady" }));

    // Then
    expect(mocks.boot).toHaveBeenCalledTimes(2);
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Give feedback" })).toBeEnabled();

    view.unmount();
    expect(mocks.destroy).toHaveBeenCalledTimes(2);
    expect(mocks.clear).toHaveBeenCalledTimes(2);
  });

  it("fails open when callback data or cleanup handlers throw", async () => {
    // Given
    const callbackData = Object.defineProperty({}, "action", {
      get: () => {
        throw new Error("callback data");
      },
    });
    mocks.destroy.mockImplementation(() => {
      throw new Error("cleanup");
    });
    const { FeaturebaseFeedback } = await import("./featurebase-feedback");
    const view = render(<FeaturebaseFeedback />);
    const callback = await getCallback();

    // When / Then
    expect(() => callback(null, callbackData)).not.toThrow();
    expect(() => view.unmount()).not.toThrow();
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.reportFailure).toHaveBeenCalledWith(
      "callback",
      expect.any(Error),
    );
    expect(mocks.reportFailure).toHaveBeenCalledWith(
      "cleanup",
      expect.any(Error),
    );
  });
});
