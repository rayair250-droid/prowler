"use client";

import Featurebase, {
  clearConfig,
  destroyFeedback,
  resolveOrganization,
} from "featurebase-js";
import { MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";

import { createFeaturebaseJwt } from "@/actions/featurebase/featurebase";
import { Button } from "@/components/shadcn/button/button";
import { useRuntimeConfig } from "@/hooks/use-runtime-config";
import {
  trackFeaturebaseFeedbackOpened,
  trackFeaturebaseFeedbackSubmitted,
} from "@/instrumentation-client";
import {
  FEATUREBASE_FAILURE_STAGE,
  reportFeaturebaseFailure,
} from "@/lib/featurebase-observability";
import { isCloud } from "@/lib/shared/env";

const INITIALIZATION_TIMEOUT_MS = 5_000;
const INITIALIZATION_RETRY_DELAY_MS = 250;
const MAX_INITIALIZATION_ATTEMPTS = 2;

const FEEDBACK_ACTIONS = {
  READY: "widgetReady",
  OPENED: "widgetOpened",
  SUBMITTED: "feedbackSubmitted",
} as const;

const getCallbackAction = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null || !("action" in value)) {
    return;
  }

  const { action } = value as { action?: unknown };
  return typeof action === "string" ? action : undefined;
};

const failOpen = (operation: () => void): void => {
  try {
    operation();
  } catch (error) {
    reportFeaturebaseFailure(FEATUREBASE_FAILURE_STAGE.CALLBACK, error);
  }
};

class FeaturebaseInitializationError extends Error {
  constructor(
    readonly stage:
      | typeof FEATUREBASE_FAILURE_STAGE.IDENTITY
      | typeof FEATUREBASE_FAILURE_STAGE.ORGANIZATION
      | typeof FEATUREBASE_FAILURE_STAGE.SDK,
    readonly timedOut = false,
  ) {
    super("Featurebase initialization failed");
    this.name = timedOut ? "TimeoutError" : "FeaturebaseInitializationError";
  }
}

class FeaturebaseInitializationAborted extends Error {}

const withTimeout = <T,>(
  operation: Promise<T>,
  stage: FeaturebaseInitializationError["stage"],
  signal: AbortSignal,
): Promise<T> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", handleAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleAbort = () =>
      finish(() => reject(new FeaturebaseInitializationAborted()));
    const timeoutId = window.setTimeout(
      () =>
        finish(() => reject(new FeaturebaseInitializationError(stage, true))),
      INITIALIZATION_TIMEOUT_MS,
    );

    signal.addEventListener("abort", handleAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      () => finish(() => reject(new FeaturebaseInitializationError(stage))),
    );
  });

const waitForRetry = (signal: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      resolve(false);
    };
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve(true);
    }, INITIALIZATION_RETRY_DELAY_MS);

    signal.addEventListener("abort", handleAbort, { once: true });
  });

const ANALYTICS_BY_ACTION = {
  [FEEDBACK_ACTIONS.OPENED]: trackFeaturebaseFeedbackOpened,
  [FEEDBACK_ACTIONS.SUBMITTED]: trackFeaturebaseFeedbackSubmitted,
} as const;

interface FeaturebaseSdkAttempt {
  cleaned: boolean;
  generation: number;
}

export function FeaturebaseFeedback() {
  const { featurebaseAppId } = useRuntimeConfig();
  const [isReady, setIsReady] = useState(false);
  const enabled = isCloud() && Boolean(featurebaseAppId);

  useEffect(() => {
    if (!enabled || !featurebaseAppId) return;

    let active = true;
    let currentSdkAttempt: FeaturebaseSdkAttempt | undefined;
    let nextSdkGeneration = 0;
    const controller = new AbortController();

    const cleanupSdkAttempt = (attempt?: FeaturebaseSdkAttempt): void => {
      if (
        !attempt ||
        attempt.cleaned ||
        currentSdkAttempt?.generation !== attempt.generation
      ) {
        return;
      }

      attempt.cleaned = true;
      currentSdkAttempt = undefined;

      // Featurebase() always loads the dispatcher before it can throw. Guarding
      // cleanup by an owned attempt prevents destroyFeedback() from loading the
      // SDK when initialization never reached boot.
      for (const cleanup of [destroyFeedback, clearConfig]) {
        try {
          cleanup();
        } catch (error) {
          reportFeaturebaseFailure(FEATUREBASE_FAILURE_STAGE.CLEANUP, error);
        }
      }
    };

    const initializeAttempt = async (): Promise<boolean> => {
      const { slug } = await withTimeout(
        resolveOrganization(featurebaseAppId),
        FEATUREBASE_FAILURE_STAGE.ORGANIZATION,
        controller.signal,
      );
      if (!active) return false;

      let featurebaseJwt = await withTimeout(
        createFeaturebaseJwt(),
        FEATUREBASE_FAILURE_STAGE.IDENTITY,
        controller.signal,
      );
      if (!active || !featurebaseJwt) {
        featurebaseJwt = null;
        return false;
      }

      const sdkAttempt: FeaturebaseSdkAttempt = {
        cleaned: false,
        generation: ++nextSdkGeneration,
      };
      currentSdkAttempt = sdkAttempt;

      try {
        Featurebase({
          appId: featurebaseAppId,
          featurebaseJwt,
          messenger: false,
        });
        const dispatcher = window.Featurebase;
        if (!dispatcher) {
          throw new FeaturebaseInitializationError(
            FEATUREBASE_FAILURE_STAGE.SDK,
          );
        }
        dispatcher(
          "initialize_feedback_widget",
          {
            organization: slug,
            theme: "dark",
            featurebaseJwt,
          },
          (error, data) => {
            if (!active) return;
            if (error) {
              reportFeaturebaseFailure(
                FEATUREBASE_FAILURE_STAGE.CALLBACK,
                error,
              );
              return;
            }

            failOpen(() => {
              const action = getCallbackAction(data);
              if (action === FEEDBACK_ACTIONS.READY) setIsReady(true);

              const track =
                ANALYTICS_BY_ACTION[action as keyof typeof ANALYTICS_BY_ACTION];
              if (track) track();
            });
          },
        );
        return true;
      } catch {
        cleanupSdkAttempt(sdkAttempt);
        throw new FeaturebaseInitializationError(FEATUREBASE_FAILURE_STAGE.SDK);
      } finally {
        featurebaseJwt = null;
      }
    };

    const initialize = async () => {
      for (let attempt = 0; attempt < MAX_INITIALIZATION_ATTEMPTS; attempt++) {
        try {
          const initialized = await initializeAttempt();
          if (initialized || !active) return;
          return;
        } catch (error) {
          if (error instanceof FeaturebaseInitializationAborted || !active) {
            return;
          }

          if (error instanceof FeaturebaseInitializationError) {
            reportFeaturebaseFailure(
              error.timedOut ? FEATUREBASE_FAILURE_STAGE.TIMEOUT : error.stage,
              error,
            );
          }

          if (attempt === MAX_INITIALIZATION_ATTEMPTS - 1) return;
          if (!(await waitForRetry(controller.signal))) return;
        }
      }
    };

    void initialize();

    return () => {
      active = false;
      controller.abort();
      cleanupSdkAttempt(currentSdkAttempt);
    };
  }, [enabled, featurebaseAppId]);

  if (!enabled) return null;

  return (
    <Button
      type="button"
      data-featurebase-feedback
      aria-label="Give feedback"
      disabled={!isReady}
      size="lg"
      className="group ring-button-primary/20 hover:ring-button-primary/30 fixed right-4 bottom-4 z-50 h-12 rounded-full px-5 font-semibold shadow-xl ring-4 shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl active:translate-y-0 active:scale-[0.98] disabled:translate-y-0 disabled:scale-100 disabled:cursor-wait disabled:opacity-70 motion-reduce:transform-none motion-reduce:transition-none sm:right-6 sm:bottom-6"
    >
      <MessageSquareText
        aria-hidden="true"
        className="transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6 motion-reduce:transform-none motion-reduce:transition-none"
      />
      <span>Feedback</span>
    </Button>
  );
}
