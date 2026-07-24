import * as Sentry from "@sentry/nextjs";

export const FEATUREBASE_FAILURE_STAGE = {
  ANALYTICS: "analytics",
  CALLBACK: "callback",
  CLEANUP: "cleanup",
  IDENTITY: "identity",
  ORGANIZATION: "organization",
  SDK: "sdk",
  SERVER_ACTION: "server_action",
  TIMEOUT: "timeout",
} as const;

type FeaturebaseFailureStage =
  (typeof FEATUREBASE_FAILURE_STAGE)[keyof typeof FEATUREBASE_FAILURE_STAGE];

const FEATUREBASE_ERROR_TYPE = {
  ERROR: "error",
  NON_ERROR: "non_error",
} as const;

const getErrorType = (error: unknown): string =>
  error instanceof Error
    ? FEATUREBASE_ERROR_TYPE.ERROR
    : FEATUREBASE_ERROR_TYPE.NON_ERROR;

export function reportFeaturebaseFailure(
  stage: FeaturebaseFailureStage,
  error: unknown,
): void {
  try {
    Sentry.captureException(new Error("Featurebase integration failure"), {
      level: "warning",
      tags: {
        error_type: getErrorType(error),
        integration: "featurebase",
        stage,
      },
    });
  } catch {
    // Observability must never affect the optional integration or host app.
  }
}
