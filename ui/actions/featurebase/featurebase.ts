"use server";

import "server-only";

import { sign } from "jsonwebtoken";

import { auth } from "@/auth.config";
import {
  FEATUREBASE_FAILURE_STAGE,
  reportFeaturebaseFailure,
} from "@/lib/featurebase-observability";
import { readBoolEnv, readEnv } from "@/lib/runtime-env";
import { isCloud } from "@/lib/shared/env";

export async function createFeaturebaseJwt(): Promise<string | null> {
  if (
    !isCloud() ||
    !readBoolEnv("UI_FEATUREBASE_ENABLED") ||
    !readEnv("UI_FEATUREBASE_APP_ID")
  ) {
    return null;
  }

  try {
    const secret = process.env.FEATUREBASE_JWT_SECRET;
    const session = await auth();
    const userId = session?.userId?.trim();
    const name = session?.user?.name?.trim();
    const email = session?.user?.email?.trim();

    if (!secret || !userId || !name || !email) return null;

    return sign({ userId, name, email }, secret, {
      algorithm: "HS256",
      noTimestamp: true,
    });
  } catch (error) {
    reportFeaturebaseFailure(FEATUREBASE_FAILURE_STAGE.SERVER_ACTION, error);
    return null;
  }
}
